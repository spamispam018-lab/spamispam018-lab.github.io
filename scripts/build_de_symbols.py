#!/usr/bin/env python3
"""
scripts/build_de_symbols.py
Ermittelt für alle US-Aktien der App die deutschen Yahoo-Symbole (Xetra .DE, Frankfurt .F,
Stuttgart .SG, Berlin .BE) und schreibt sie nach data/de_symbols.json.

Warum: Deutsche Börsen führen US-Aktien unter eigenen Kürzeln (Nvidia = NVD.DE, Apple = APC.DE).
Die App (js/live-prices.js) nutzt die Datei für den deutschen Live-Kurs der Vorbörsen-Karte.

Vorgehen pro Ticker:
  1. ISIN über yfinance holen und danach suchen (liefert meist die deutschen Notierungen).
  2. Fallback: Firmenname suchen; ein Treffer zählt nur, wenn der erste Namensbestandteil passt.
Es werden pro Lauf höchstens --max neue Ticker bearbeitet (Rate-Limit). Bereits gefundene Ticker
werden übersprungen, nicht gefundene nach 30 Tagen erneut versucht.

Aufruf:  python scripts/build_de_symbols.py [--max 150] [--ticker NVDA]
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone, timedelta

import yfinance as yf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_market_data import ALL_TICKERS, DATA_DIR  # noqa: E402

OUT_FILE = os.path.join(DATA_DIR, "de_symbols.json")
SUFFIX_ORDER = (".DE", ".F", ".SG", ".BE")
RETRY_DAYS = 30


def is_us_ticker(sym: str) -> bool:
    return not re.search(r"\.(DE|PA|AS|L|SW|MI|MC|T|TO|AX|CO|F|SG|BE)$", sym, re.I) and "=" not in sym and not sym.startswith("^")


def sort_syms(syms):
    def key(s):
        for i, sfx in enumerate(SUFFIX_ORDER):
            if s.endswith(sfx):
                return i
        return 99
    return sorted(set(syms), key=key)


def search_quotes(query):
    try:
        res = yf.Search(query, max_results=25, news_count=0)
        return res.quotes or []
    except AttributeError:
        print("FEHLER: yfinance zu alt (yf.Search fehlt). Bitte 'pip install -U yfinance'.")
        raise
    except Exception as e:  # noqa: BLE001
        print(f"  Suche '{query}' fehlgeschlagen: {e}")
        return []


def german_from_quotes(quotes, name_hint=None):
    found = []
    first = (name_hint or "").split(" ")[0].lower() if name_hint else ""
    for q in quotes:
        sym = q.get("symbol", "")
        if not sym.upper().endswith(SUFFIX_ORDER):
            continue
        if first:
            names = f"{q.get('shortname', '')} {q.get('longname', '')}".lower()
            if first not in names:
                continue
        found.append(sym)
    return found


def discover(sym):
    t = yf.Ticker(sym)
    # 1) per ISIN
    try:
        isin = t.isin
    except Exception:  # noqa: BLE001
        isin = None
    if isin and isin not in ("-", "None"):
        found = german_from_quotes(search_quotes(isin))
        if found:
            return sort_syms(found)
    # 2) per Firmenname
    name = None
    for q in search_quotes(sym):
        if q.get("symbol", "").upper() == sym.upper():
            name = q.get("longname") or q.get("shortname")
            break
    if name:
        found = german_from_quotes(search_quotes(name), name_hint=name)
        if found:
            return sort_syms(found)
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=150, help="Maximal neu bearbeitete Ticker pro Lauf")
    ap.add_argument("--ticker", default="", help="Nur diesen Ticker (erzwingt neue Suche)")
    args = ap.parse_args()

    data = {"updated": "", "symbols": {}, "missing": {}}
    if os.path.exists(OUT_FILE):
        try:
            with open(OUT_FILE, encoding="utf-8") as f:
                data.update(json.load(f))
        except Exception:  # noqa: BLE001
            pass
    data.setdefault("symbols", {})
    data.setdefault("missing", {})

    now = datetime.now(timezone.utc)
    if args.ticker:
        todo = [args.ticker.upper()]
    else:
        todo = []
        for sym in ALL_TICKERS:
            if not is_us_ticker(sym) or sym in data["symbols"]:
                continue
            last = data["missing"].get(sym)
            if last:
                try:
                    if now - datetime.fromisoformat(last) < timedelta(days=RETRY_DAYS):
                        continue
                except ValueError:
                    pass
            todo.append(sym)
        todo = todo[: args.max]

    print(f"{len(todo)} Ticker werden bearbeitet.")
    ok = miss = 0
    for i, sym in enumerate(todo, 1):
        try:
            syms = discover(sym)
        except AttributeError:
            sys.exit(1)
        except Exception as e:  # noqa: BLE001
            print(f"[{i}/{len(todo)}] {sym}: Fehler {e}")
            continue
        if syms:
            data["symbols"][sym] = syms
            data["missing"].pop(sym, None)
            ok += 1
            print(f"[{i}/{len(todo)}] {sym}: {', '.join(syms)}")
        else:
            data["missing"][sym] = now.isoformat()
            miss += 1
            print(f"[{i}/{len(todo)}] {sym}: nichts gefunden")
        time.sleep(0.6)

    data["updated"] = now.isoformat()
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=True)
    print(f"Fertig: {ok} gefunden, {miss} nicht gefunden. Gesamt: {len(data['symbols'])} Ticker in {OUT_FILE}")


if __name__ == "__main__":
    main()

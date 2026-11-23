#!/usr/bin/env python3
"""
scripts/fetch_edgar.py
Holt Jahresabschluss-Kennzahlen (XBRL "companyfacts") und aktuelle Meldungen ("submissions") der SEC (EDGAR)
und schreibt sie als data/edgar/<TICKER>.json, damit die App sie ohne CORS-Probleme laden kann.

- Nur Python-Standardbibliothek (keine Installation nötig).
- Die SEC verlangt einen identifizierenden User-Agent mit Kontakt, z. B. "Max Mustermann max@example.com".
  Er wird aus der Umgebungsvariable SEC_USER_AGENT gelesen (im Workflow aus dem Repository-Secret gleichen Namens).
- Fair-Access-Limit der SEC: max. 10 Anfragen/Sekunde – das Skript bleibt deutlich darunter.

Aufruf:
  SEC_USER_AGENT="Name mail@example.com" python scripts/fetch_edgar.py                 # alle US-Ticker aus data/universe.json
  SEC_USER_AGENT="Name mail@example.com" python scripts/fetch_edgar.py --ticker AAPL   # nur ein Ticker
"""

import argparse
import gzip
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik:010d}.json"

OUT_DIR = os.path.join("data", "edgar")
UNIVERSE_PATH = os.path.join("data", "universe.json")
REQUEST_PAUSE = 0.2      # Sekunden zwischen Anfragen (~5/s)
KEEP_YEARS = 6

# Je Kennzahl: (Namensraum, Konzept) in Prioritätsreihenfolge, Einheit, ob Zeitraum (duration) oder Stichtag (instant)
CONCEPTS = {
    "revenue": ([("us-gaap", "Revenues"),
                 ("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax"),
                 ("us-gaap", "RevenueFromContractWithCustomerIncludingAssessedTax"),
                 ("us-gaap", "SalesRevenueNet"),
                 ("us-gaap", "SalesRevenueGoodsNet")], "USD", "duration"),
    "grossProfit": ([("us-gaap", "GrossProfit")], "USD", "duration"),
    "operatingIncome": ([("us-gaap", "OperatingIncomeLoss")], "USD", "duration"),
    "netIncome": ([("us-gaap", "NetIncomeLoss"), ("us-gaap", "ProfitLoss")], "USD", "duration"),
    "eps": ([("us-gaap", "EarningsPerShareDiluted")], "USD/shares", "duration"),
    "opCashFlow": ([("us-gaap", "NetCashProvidedByUsedInOperatingActivities")], "USD", "duration"),
    "assets": ([("us-gaap", "Assets")], "USD", "instant"),
    "equity": ([("us-gaap", "StockholdersEquity"),
                ("us-gaap", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest")], "USD", "instant"),
}

FILING_FORMS = {"10-K", "10-K/A", "10-Q", "8-K", "DEF 14A", "20-F", "6-K", "S-1"}
FORM_DESC = {
    "10-K": "Jahresbericht", "10-K/A": "Jahresbericht (Änderung)", "10-Q": "Quartalsbericht", "8-K": "Aktuelle Ereignisse",
    "DEF 14A": "Hauptversammlung / Vergütung", "20-F": "Jahresbericht (ausländ.)", "6-K": "Meldung (ausländ.)", "S-1": "Registrierung",
}


def http_get_json(url, user_agent, retries=3):
    """GET mit gzip, Wiederholung bei 429/5xx."""
    req = urllib.request.Request(url, headers={"User-Agent": user_agent, "Accept-Encoding": "gzip"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            raise
    return None


def _days(a, b):
    try:
        return (datetime.strptime(b, "%Y-%m-%d") - datetime.strptime(a, "%Y-%m-%d")).days
    except (TypeError, ValueError):
        return None


def extract_annual(facts):
    """
    Wandelt eine SEC-companyfacts-Antwort in eine Liste von Geschäftsjahren (neueste zuerst).
    Nur Werte aus Jahresberichten (10-K) mit vollem Geschäftsjahr; bei Korrekturen gilt die zuletzt eingereichte Fassung.
    """
    by_end = {}   # end-Datum -> {kennzahl: wert}
    for metric, (concepts, unit, kind) in CONCEPTS.items():
        for ns, concept in concepts:
            entries = (((facts.get("facts") or {}).get(ns) or {}).get(concept) or {}).get("units", {}).get(unit, [])
            best = {}   # end -> (filed, val)
            for e in entries:
                form = e.get("form") or ""
                if not form.startswith("10-K") and not form.startswith("20-F"):
                    continue
                if e.get("fp") != "FY" or e.get("end") is None or e.get("val") is None:
                    continue
                if kind == "duration":
                    d = _days(e.get("start"), e.get("end"))
                    if d is None or d < 340 or d > 390:     # nur volle Geschäftsjahre (keine Quartale/Teilperioden)
                        continue
                end = e["end"]
                filed = e.get("filed") or ""
                if end not in best or filed >= best[end][0]:
                    best[end] = (filed, e["val"])
            for end, (_, val) in best.items():
                row = by_end.setdefault(end, {})
                if metric not in row:                         # erstes passendes Konzept (Priorität) gewinnt
                    row[metric] = val
    rows = []
    for end in sorted(by_end, reverse=True):
        r = by_end[end]
        if "revenue" not in r and "netIncome" not in r:
            continue
        row = {"date": end}
        for metric in CONCEPTS:
            row[metric] = r.get(metric)
        rows.append(row)
    return rows[:KEEP_YEARS]


def extract_filings(sub, cik):
    """Aktuelle Meldungen aus der submissions-Antwort mit Link zum Originaldokument."""
    recent = ((sub.get("filings") or {}).get("recent")) or {}
    forms = recent.get("form") or []
    out = []
    for i, form in enumerate(forms):
        if form not in FILING_FORMS:
            continue
        acc = (recent.get("accessionNumber") or [None] * len(forms))[i]
        doc = (recent.get("primaryDocument") or [None] * len(forms))[i]
        date = (recent.get("filingDate") or [None] * len(forms))[i]
        if not acc or not doc or not date:
            continue
        url = "https://www.sec.gov/Archives/edgar/data/%d/%s/%s" % (int(cik), acc.replace("-", ""), doc)
        out.append({"date": date, "form": form, "desc": FORM_DESC.get(form, ""), "url": url})
        if len(out) >= 15:
            break
    return out


def load_ticker_map(user_agent):
    data = http_get_json(SEC_TICKERS_URL, user_agent)
    m = {}
    for item in (data or {}).values():
        m[item["ticker"].upper()] = (int(item["cik_str"]), item.get("title", ""))
    return m


def universe_tickers():
    try:
        with open(UNIVERSE_PATH, encoding="utf-8") as f:
            uni = json.load(f)
        return [u["ticker"] for u in uni if u.get("ticker") and "." not in u["ticker"]]
    except (OSError, ValueError):
        return []


def main():
    ap = argparse.ArgumentParser(description="SEC-EDGAR-Daten für die App abrufen")
    ap.add_argument("--ticker", help="Nur diesen Ticker (z. B. AAPL)")
    ap.add_argument("--max", type=int, default=400, help="Höchstzahl Ticker pro Lauf (Standard 400)")
    args = ap.parse_args()

    ua = os.environ.get("SEC_USER_AGENT", "").strip()
    if "@" not in ua:
        sys.exit("Fehler: SEC_USER_AGENT fehlt oder enthält keine Kontakt-Mail "
                 '(Format: "Vorname Nachname mail@example.com"). Die SEC verlangt das für API-Zugriffe.')

    tickers = [args.ticker.upper()] if args.ticker else universe_tickers()[: args.max]
    if not tickers:
        sys.exit("Keine Ticker gefunden (data/universe.json fehlt oder leer). Mit --ticker AAPL einzeln abrufen.")

    os.makedirs(OUT_DIR, exist_ok=True)
    tmap = load_ticker_map(ua)
    time.sleep(REQUEST_PAUSE)

    ok = skipped = failed = 0
    for t in tickers:
        sec_ticker = t.upper()
        if sec_ticker not in tmap:
            print("%s: nicht im SEC-Verzeichnis (ETF / ausländisch) – übersprungen" % t)
            skipped += 1
            continue
        cik, title = tmap[sec_ticker]
        try:
            facts = http_get_json(FACTS_URL.format(cik=cik), ua)
            time.sleep(REQUEST_PAUSE)
            sub = http_get_json(SUBMISSIONS_URL.format(cik=cik), ua)
            time.sleep(REQUEST_PAUSE)
            annual = extract_annual(facts or {})
            if not annual:
                print("%s: keine Jahresdaten gefunden – übersprungen" % t)
                skipped += 1
                continue
            out = {
                "ticker": t,
                "cik": cik,
                "name": title,
                "currency": "USD",
                "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "annual": annual,
                "filings": extract_filings(sub or {}, cik),
            }
            with open(os.path.join(OUT_DIR, t + ".json"), "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
            print("%s: %d Geschäftsjahre, %d Meldungen" % (t, len(annual), len(out["filings"])))
            ok += 1
        except Exception as e:      # ein fehlerhafter Ticker soll den Lauf nicht abbrechen
            print("%s: Fehler – %s" % (t, e))
            failed += 1

    print("Fertig: %d gespeichert, %d übersprungen, %d Fehler" % (ok, skipped, failed))
    if ok == 0 and failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

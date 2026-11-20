#!/usr/bin/env python3
"""
scripts/fetch_macro.py
Holt Makro-Daten (Zinsen, Inflation, VIX, EUR/USD, Arbeitsmarkt, Kreditaufschläge, Kreditausfälle)
und schreibt sie nach data/macro.json. Wird vom Workflow update_macro.yml ausgeführt.
"""

import csv
import io
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
OUT_FILE = os.path.join(DATA_DIR, "macro.json")
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={id}"
FRED_API = "https://api.stlouisfed.org/fred/series/observations?series_id={id}&api_key={key}&file_type=json"
FRED_KEY = os.environ.get("FRED_API_KEY", "").strip()
KEEP = 60  # Punkte für die Mini-Grafik


# --------------------------------------------------------------------------- Ampel-Regeln (Faustregeln)
def sig_yield10(v, d):
    return ("bad" if v >= 5.0 else "warn" if v >= 4.5 else "ok"), "Hohe Renditen belasten Wachstums- und Immobilienwerte."

def sig_curve(v, d):
    return ("warn" if v < 0 else "ok"), "Negativ = invertierte Zinskurve, historisch ein Rezessions-Warnsignal."

def sig_neutral(v, d):
    return "neutral", ""

def sig_infl(v, d):
    return ("bad" if v >= 4 else "warn" if v >= 3 else "ok"), "Über ca. 3 % bleiben die Notenbanken tendenziell vorsichtig."

def sig_vix(v, d):
    return ("bad" if v >= 30 else "warn" if v >= 20 else "ok"), "Über 20 nervöser Markt, über 30 Stress."

def sig_sahm(v, d):
    return ("bad" if v >= 0.5 else "warn" if v >= 0.3 else "ok"), "Ab 0,5 Prozentpunkten gilt die Sahm-Regel als Rezessionssignal."

def sig_claims(v, d):
    return ("bad" if v >= 300000 else "warn" if v >= 260000 else "ok"), "Steigende Erstanträge deuten auf einen schwächeren Arbeitsmarkt."

def sig_unrate(v, d):
    return ("warn" if d is not None and d >= 0.3 else "ok"), "Ein schneller Anstieg ist ein Warnsignal."

def sig_hy(v, d):
    return ("bad" if v >= 5.5 else "warn" if v >= 4.0 else "ok"), "Steigende Aufschläge zeigen Kreditstress, oft vor Kursverlusten."

def sig_ig(v, d):
    return ("bad" if v >= 2.0 else "warn" if v >= 1.4 else "ok"), "Aufschlag guter Unternehmensanleihen, steigt bei Stress."

def sig_delinq(v, d):
    return ("warn" if d is not None and d > 0.15 else "neutral"), "Steigende Ausfälle belasten vor allem Banken und Immobilienfirmen (Daten hinken hinterher)."


FRED_SERIES = [
    # id (oder Liste mit Ersatz-IDs), Gruppe, Titel, Einheit, Art, Frequenz, Nachkommastellen, Regel, Erklärung
    ("DGS10", "Zinsen", "US-Rendite 10 Jahre", "%", "level", "d", 2, sig_yield10, "Referenzzins für Bewertungen weltweit."),
    ("T10Y2Y", "Zinsen", "US-Zinskurve (10J minus 2J)", "Pp", "level", "d", 2, sig_curve, "Abstand zwischen langen und kurzen Zinsen."),
    ("DFF", "Zinsen", "US-Leitzins (Fed Funds)", "%", "level", "d", 2, sig_neutral, "Zinsniveau der US-Notenbank."),
    ("ECBDFR", "Zinsen", "EZB-Einlagenzins", "%", "level", "d", 2, sig_neutral, "Leitzins der Europäischen Zentralbank."),
    ("CPIAUCSL", "Inflation", "US-Inflation (Vorjahr)", "%", "yoy", "m", 1, sig_infl, "Bestimmt den Zinspfad der Fed."),
    (["CP0000EZ19M086NEST", "CP0000EZ20M086NEST"], "Inflation", "Eurozone-Inflation (Vorjahr)", "%", "yoy", "m", 1, sig_infl, "Bestimmt den Zinspfad der EZB."),
    ("SAHMREALTIME", "Arbeitsmarkt", "Rezessionsindikator (Sahm-Regel)", "Pp", "level", "m", 2, sig_sahm, "Anstieg der Arbeitslosigkeit gegenüber dem Vorjahrestief."),
    ("ICSA", "Arbeitsmarkt", "US-Erstanträge Arbeitslosenhilfe", "", "level", "w", 0, sig_claims, "Wöchentlicher Frühindikator für den Arbeitsmarkt."),
    ("UNRATE", "Arbeitsmarkt", "US-Arbeitslosenquote", "%", "level", "m", 1, sig_unrate, "Zeigt die Konjunkturlage."),
    ("BAMLH0A0HYM2", "Kreditaufschläge", "Hochzins-Aufschlag (US)", "Pp", "level", "d", 2, sig_hy, "Risikoaufschlag riskanter Unternehmensanleihen."),
    ("BAMLC0A0CM", "Kreditaufschläge", "Unternehmensanleihen-Aufschlag (US, gute Bonität)", "Pp", "level", "d", 2, sig_ig, "Aufschlag guter Unternehmensanleihen."),
    ("DRSFRMACBS", "Kreditausfälle", "Ausfallquote Wohnimmobilienkredite (US-Banken)", "%", "level", "q", 2, sig_delinq, "Quartalsdaten, hinkt der Lage hinterher."),
    ("DRCRELEXFACBS", "Kreditausfälle", "Ausfallquote Gewerbeimmobilienkredite (US-Banken)", "%", "level", "q", 2, sig_delinq, "Quartalsdaten, relevant für Banken und Immobilienfirmen."),
]

YAHOO_SERIES = [
    ("^VIX", "Marktangst", "VIX (Schwankungsindex)", "", "level", "d", 1, sig_vix, "Erwartete Schwankung des S&P 500."),
    ("EURUSD=X", "Wechselkurs", "EUR/USD", "", "level", "d", 4, sig_neutral, "Steigt der Euro, sinkt der Euro-Wert von US-Aktien."),
]


def _http_get(url, timeout=15, tries=1):
    """GET mit stark reduzierten Retries und Timeouts, um den Workflow zu beschleunigen."""
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                "Accept": "text/csv,application/json,*/*",
            })
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 401, 403, 404):  # Wiederholen bringt nichts
                break
        except Exception as e:  # noqa: BLE001
            last = e
        # Sehr kurze Pause (0.5 Sekunden) falls doch mal wiederholt wird
        if i < tries - 1:
            time.sleep(0.5)
    raise last


def fetch_fred(series_id):
    """Holt FRED-Daten mit schnellen Fallbacks, falls GitHub blockiert."""
    out = []
    
    # 1. Offizielle API (falls FRED_API_KEY gesetzt ist)
    if FRED_KEY:
        try:
            text = _http_get(FRED_API.format(id=series_id, key=urllib.parse.quote(FRED_KEY)))
            for o in json.loads(text).get("observations", []):
                if o.get("value") in (".", "", None):
                    continue
                try:
                    out.append((o["date"], float(o["value"])))
                except (ValueError, KeyError):
                    continue
            if out: return out
        except Exception:
            pass

    # 2. Direkter FRED CSV-Download
    try:
        text = _http_get(FRED_URL.format(id=series_id))
        rows = list(csv.reader(io.StringIO(text)))[1:]
        for row in rows:
            if len(row) < 2 or row[1] in (".", ""):
                continue
            try:
                out.append((row[0], float(row[1])))
            except ValueError:
                continue
        if out: return out
    except Exception:
        pass

    # 3. Ivo Welch CSV-Gateway (sehr zuverlässig bei GitHub Actions)
    try:
        text = _http_get(f"https://www.ivo-welch.org/cgi-bin/fredwrap?symbol={series_id}")
        rows = list(csv.reader(io.StringIO(text)))[1:]
        for row in rows:
            if len(row) < 2 or row[1] in (".", ""):
                continue
            try:
                out.append((row[0], float(row[1])))
            except ValueError:
                continue
        if out: return out
    except Exception:
        pass

    # 4. DBnomics API (Open-Source Makro-Datenbank, JSON basiert)
    try:
        url = f"https://api.db.nomics.world/v22/series/FRED/{series_id}?observations=1"
        text = _http_get(url)
        data = json.loads(text)
        docs = data.get("series", {}).get("docs", [])
        if docs:
            dates = docs[0].get("period", [])
            values = docs[0].get("value", [])
            for d, v in zip(dates, values):
                if v is not None and v != "NA":
                    out.append((d, float(v)))
        if out: return out
    except Exception:
        pass

    raise ValueError(f"Konnte {series_id} über keine Quelle laden.")


def fetch_yahoo(symbol):
    import yfinance as yf
    h = yf.Ticker(symbol).history(period="1y", interval="1d")
    out = []
    for idx, row in h.iterrows():
        c = row.get("Close")
        if c == c and c is not None:  # NaN-Check
            out.append((idx.strftime("%Y-%m-%d"), float(c)))
    return out


def to_yoy(points):
    """Monatsindex -> Veränderung zum Vorjahr in Prozent."""
    res = []
    for i in range(12, len(points)):
        prev = points[i - 12][1]
        if prev:
            res.append((points[i][0], (points[i][1] / prev - 1) * 100))
    return res


def delta_for(points, freq):
    """Veränderung zum Vergleichswert: täglich ca. 1 Monat, sonst Vorperiode (Wochen: 4 Wochen)."""
    if len(points) < 2:
        return None, ""
    last_d = datetime.fromisoformat(points[-1][0])
    if freq == "d":
        target = last_d - timedelta(days=30)
        ref = None
        for d, v in reversed(points[:-1]):
            if datetime.fromisoformat(d) <= target:
                ref = v
                break
        if ref is None:
            ref = points[0][1]
        return points[-1][1] - ref, "ggü. 1 Monat"
    if freq == "w":
        ref = points[-5][1] if len(points) >= 5 else points[0][1]
        return points[-1][1] - ref, "ggü. 4 Wochen"
    return points[-1][1] - points[-2][1], "ggü. Vorperiode"


def build_item(spec, points):
    sid, group, title, unit, kind, freq, dec, rule, why = spec
    if isinstance(sid, list):
        sid = sid[0]
    if kind == "yoy":
        points = to_yoy(points)
    if freq == "w" and len(points) >= 4:  # 4-Wochen-Durchschnitt glättet die Erstanträge
        sm = []
        for i in range(3, len(points)):
            sm.append((points[i][0], sum(p[1] for p in points[i - 3:i + 1]) / 4))
        points = sm
    if not points:
        return None
    value = points[-1][1]
    delta, delta_label = delta_for(points, freq)
    signal, hint = rule(value, delta)
    tail = points[-KEEP:]
    return {
        "id": sid, "group": group, "title": title, "unit": unit, "freq": freq, "decimals": dec,
        "value": round(value, 4), "delta": None if delta is None else round(delta, 4), "deltaLabel": delta_label,
        "date": points[-1][0], "signal": signal, "hint": hint, "why": why,
        "series": [round(p[1], 4) for p in tail],
    }


def main():
    items = []
    errors = []
    for spec in FRED_SERIES:
        ids = spec[0] if isinstance(spec[0], list) else [spec[0]]
        item = None
        for sid in ids:
            try:
                pts = fetch_fred(sid)
                item = build_item((sid,) + spec[1:], pts)
                if item:
                    break
            except Exception as e:  # noqa: BLE001
                errors.append(f"{sid}: {e}")
                print(f"FEHLER {sid}: {type(e).__name__}: {e}")
        if not item and ids[0] == "DGS10":
            try:  # Ersatz: 10-jährige US-Rendite von Yahoo
                item = build_item(("^TNX",) + spec[1:], fetch_yahoo("^TNX"))
                if item:
                    item["id"] = "DGS10"
                    item["title"] = "US-Rendite 10 Jahre (Yahoo)"
            except Exception as e:  # noqa: BLE001
                print(f"FEHLER ^TNX: {e}")
        if item:
            items.append(item)
            print(f"OK   {item['id']}: {item['value']} ({item['date']})")
        else:
            print(f"FEHLT {ids}")
    for spec in YAHOO_SERIES:
        try:
            item = build_item(spec, fetch_yahoo(spec[0]))
            if item:
                item["id"] = spec[0]
                items.append(item)
                print(f"OK   {spec[0]}: {item['value']} ({item['date']})")
        except Exception as e:  # noqa: BLE001
            errors.append(f"{spec[0]}: {e}")
            print(f"FEHLT {spec[0]}: {e}")

    if not items:
        raise SystemExit("Keine Makro-Daten abgerufen – Datei bleibt unverändert.")

    # Vorhandene Daten behalten, falls einzelne Reihen heute fehlen
    old = {}
    if os.path.exists(OUT_FILE):
        try:
            with open(OUT_FILE, encoding="utf-8") as f:
                for it in json.load(f).get("items", []):
                    old[it["id"]] = it
        except Exception:  # noqa: BLE001
            pass
    have = {it["id"] for it in items}
    for oid, it in old.items():
        if oid not in have:
            it["stale"] = True
            items.append(it)

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump({"updated": datetime.now(timezone.utc).isoformat(), "items": items, "errors": errors},
                  f, ensure_ascii=False, indent=1)
    print(f"{len(items)} Indikatoren gespeichert, {len(errors)} Fehler.")
    if errors and not FRED_KEY:
        print("HINWEIS: FRED blockiert Server oft. Lege den kostenlosen API-Schlüssel als GitHub-Secret FRED_API_KEY an.")


if __name__ == "__main__":
    main()
"""
KI-Vorschläge für den Screener (läuft nachts per GitHub Action, siehe .github/workflows/update_ai.yml).

Ablauf:
  1. data/universe.json (+ News- und Reddit-Index, falls vorhanden) einlesen
  2. Je Sektor eine kompakte Kennzahlen-Tabelle bauen, ETFs als eigenes Segment
  3. Stufe 1: Gemini wählt je Sektor 3–5 Kandidaten und bis zu 3 Warnungen, jeweils mit Zahlen begründet
  4. Stufe 2: Gemini vergleicht nur die Sektor-Kandidaten und erstellt eine Top-10-Liste
  5. Ergebnis nach data/ai_insights.json schreiben

Nur Python-Standardbibliothek, keine zusätzlichen Pakete nötig.

Umgebungsvariablen:
  GEMINI_API_KEY  (Pflicht)  Schlüssel aus Google AI Studio, in GitHub als Secret hinterlegt
  GEMINI_MODEL    (optional) z. B. "gemini-3.6-flash". Ohne Angabe wird das neueste stabile Flash-Modell gewählt.

Aufruf lokal:  GEMINI_API_KEY=... python scripts/fetch_ai_insights.py [--only Technology] [--dry-run]
"""

import argparse
import ast
import json
import math
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT_FILE = os.path.join(DATA, "ai_insights.json")
API_BASE = "https://generativelanguage.googleapis.com/v1beta"

MAX_ROWS_PER_SECTOR = 90       # größere Sektoren werden nach Marktkapitalisierung gekürzt
PAUSE_BETWEEN_CALLS = 6        # Sekunden, schont die Minuten-Limits der kostenlosen Stufe
MAX_RETRIES = 4

SECTOR_DE = {
    "Technology": "Technologie",
    "Healthcare": "Gesundheit",
    "Financial Services": "Finanzen",
    "Consumer Cyclical": "Zyklischer Konsum",
    "Consumer Defensive": "Basiskonsum",
    "Industrials": "Industrie",
    "Energy": "Energie",
    "Utilities": "Versorger",
    "Real Estate": "Immobilien",
    "Basic Materials": "Rohstoffe",
    "Communication Services": "Kommunikation",
    "ETF": "ETFs",
}


# ---------------------------------------------------------------------------
# Daten einlesen
# ---------------------------------------------------------------------------

def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def read_list_constants(path, names):
    """Liest Listen-Konstanten aus einer Python-Datei, ohne sie zu importieren (fetch_market_data braucht yfinance)."""
    out = {}
    try:
        with open(path, encoding="utf-8") as f:
            tree = ast.parse(f.read())
        for node in tree.body:
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                if node.targets[0].id in names:
                    try:
                        val = ast.literal_eval(node.value)
                        out[node.targets[0].id] = val.split() if isinstance(val, str) else list(val)
                    except Exception:
                        pass
    except Exception as e:
        print("Hinweis: Konstanten nicht lesbar aus", path, e)
    return out


def index_membership():
    consts = read_list_constants(os.path.join(ROOT, "scripts", "fetch_market_data.py"), {"TICKERS_ETFS", "TICKERS_SECTORS"})
    idx = read_list_constants(os.path.join(ROOT, "scripts", "index_lists.py"), {"DAX", "MDAX"})
    etfs = set(consts.get("TICKERS_ETFS", [])) | set(consts.get("TICKERS_SECTORS", []))
    return etfs, set(idx.get("DAX", [])), set(idx.get("MDAX", []))


def region_of(ticker, dax, mdax):
    if ticker in dax:
        return "DAX"
    if ticker in mdax:
        return "MDAX"
    if ticker.endswith(".DE"):
        return "Deutschland"
    if "." in ticker and not ticker.startswith("^"):
        return "Europa"
    return "USA"


def annual_vol(closes):
    """Volatilität p. a. in % aus Schlusskursen (gleiche Formel wie im Screener)."""
    c = [x for x in (closes or []) if isinstance(x, (int, float)) and x > 0]
    r = [math.log(c[i] / c[i - 1]) for i in range(1, len(c))]
    if len(r) < 20:
        return None
    return statistics.stdev(r) * math.sqrt(252) * 100


def num(v, d=1):
    if v is None or isinstance(v, bool):
        return ""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return ""
    if math.isnan(f) or math.isinf(f):
        return ""
    return str(round(f, d)) if d > 0 else str(int(round(f)))


def pct_from_fraction(v):
    """Felder wie revGrowth/profitMargins kommen als Anteil (0.12) oder schon als Prozent (12)."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f * 100 if abs(f) <= 3 else f


def build_rows(universe, news_idx, reddit_idx):
    etfs, dax, mdax = index_membership()
    rows = []
    for s in universe:
        t = s.get("ticker")
        if not t or not s.get("price"):
            continue
        is_etf = t in etfs or (s.get("sector") in (None, "", "Sonstige", "ETF") and not s.get("pe"))
        sector = "ETF" if is_etf else (s.get("sector") or "Sonstige")
        n = news_idx.get(t) or {}
        r = reddit_idx.get(t) or {}
        rows.append({
            "t": t,
            "name": (s.get("name") or t)[:40],
            "sector": sector,
            "industry": (s.get("industry") or "")[:30],
            "region": region_of(t, dax, mdax),
            "mcap": s.get("marketCap") or 0,
            "price": s.get("price"),
            "chg": s.get("changePercent"),
            "p1m": s.get("perf1m"), "p3m": s.get("perf3m"), "p52": s.get("perf52w"),
            "pe": s.get("pe"), "fpe": s.get("forwardPe"), "peg": s.get("peg"),
            "rev": pct_from_fraction(s.get("revGrowth")), "marg": pct_from_fraction(s.get("profitMargins")),
            "roe": pct_from_fraction(s.get("returnOnEquity")), "de": s.get("debtToEquity"),
            "div": s.get("dividendYield"), "up": s.get("upside"), "buy": s.get("buyPct"),
            "rsi": s.get("rsi"), "rng": s.get("rangePos"),
            "vol": annual_vol(s.get("closes")),
            "crv": s.get("rrCrv"), "stop": s.get("rrStopPct"),
            "pat": "+" if s.get("hasBullishPattern") else ("-" if s.get("hasBearishPattern") else ""),
            "cross": {"golden": "GC", "death": "DC"}.get(s.get("cross") or "", ""),
            "news": n.get("score"), "newsN": n.get("n"),
            "buzz": r.get("buzz"),
            "earn": s.get("nextEarningsDate") or "",
        })
    return rows


COLUMNS = [
    ("t", "Ticker", None), ("name", "Name", None), ("region", "Region", None), ("industry", "Branche", None),
    ("mcap", "MCap Mrd", "mcap"), ("chg", "Heute %", 1), ("p1m", "1M %", 1), ("p3m", "3M %", 1), ("p52", "52W %", 1),
    ("pe", "KGV", 1), ("fpe", "Fwd-KGV", 1), ("peg", "PEG", 2), ("rev", "Umsatzwachstum %", 1), ("marg", "Nettomarge %", 1),
    ("roe", "ROE %", 1), ("de", "Debt/Equity", 0), ("div", "Div %", 2), ("up", "Kursziel-Potenzial %", 1),
    ("buy", "Analysten Kauf %", 0), ("rsi", "RSI14", 0), ("rng", "Pos. in 52W-Spanne %", 0), ("vol", "Vola p.a. %", 0),
    ("crv", "CRV", 1), ("stop", "Stop-Abstand %", 1), ("pat", "Chartmuster", None), ("cross", "SMA-Kreuz", None),
    ("news", "News-Stimmung (-1..1)", 2), ("newsN", "News Anzahl", 0), ("buzz", "Reddit-Buzz (0..1)", 2),
    ("earn", "Nächste Zahlen", None),
]


def to_table(rows):
    head = "|".join(c[1] for c in COLUMNS)
    lines = [head]
    for r in rows:
        cells = []
        for key, _, fmt in COLUMNS:
            v = r.get(key)
            if fmt is None:
                cells.append(str(v or "").replace("|", "/"))
            elif fmt == "mcap":
                cells.append(num((v or 0) / 1e9, 0) if v else "")
            else:
                cells.append(num(v, fmt))
        lines.append("|".join(cells))
    return "\n".join(lines)


def medians(rows):
    out = {}
    for key, label in (("pe", "KGV"), ("fpe", "Fwd-KGV"), ("rev", "Umsatzwachstum %"), ("marg", "Nettomarge %"),
                       ("vol", "Vola p.a. %"), ("p52", "52W %"), ("div", "Div %")):
        vals = []
        for r in rows:
            v = r.get(key)
            if isinstance(v, (int, float)) and not math.isnan(float(v)):
                if key in ("pe", "fpe") and not (0 < v < 200):
                    continue
                vals.append(float(v))
        if len(vals) >= 3:
            out[label] = round(statistics.median(vals), 1)
    return out


# ---------------------------------------------------------------------------
# Gemini
# ---------------------------------------------------------------------------

def http_json(url, key, body=None, timeout=180):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if body is not None else "GET")
    req.add_header("x-goog-api-key", key)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def version_tuple(name):
    m = re.search(r"gemini-(\d+)(?:\.(\d+))?", name)
    return (int(m.group(1)), int(m.group(2) or 0)) if m else (0, 0)


def pick_model(key):
    forced = (os.environ.get("GEMINI_MODEL") or "").strip()
    if forced:
        return forced.replace("models/", "")
    try:
        names, page = [], None
        for _ in range(5):
            url = API_BASE + "/models?pageSize=200" + ("&pageToken=" + page if page else "")
            res = http_json(url, key)
            for m in res.get("models", []):
                if "generateContent" in (m.get("supportedGenerationMethods") or []):
                    names.append(m["name"].replace("models/", ""))
            page = res.get("nextPageToken")
            if not page:
                break
        bad = ("lite", "preview", "exp", "image", "tts", "live", "audio", "embedding", "thinking", "latest", "translate")
        flash = [n for n in names if n.startswith("gemini-") and "flash" in n and not any(b in n for b in bad)]
        if flash:
            flash.sort(key=lambda n: (version_tuple(n), -len(n)), reverse=True)
            return flash[0]
        anyflash = [n for n in names if "flash" in n and "image" not in n and "tts" not in n and "live" not in n]
        if anyflash:
            anyflash.sort(key=version_tuple, reverse=True)
            return anyflash[0]
    except Exception as e:
        print("Modellliste nicht abrufbar:", e)
    return "gemini-flash-latest"


def call_gemini(key, model, prompt):
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }
    url = API_BASE + "/models/" + model + ":generateContent"
    last = None
    for attempt in range(MAX_RETRIES):
        try:
            res = http_json(url, key, body)
            cands = res.get("candidates") or []
            if not cands:
                raise RuntimeError("Keine Antwort (evtl. blockiert): " + json.dumps(res.get("promptFeedback", {}))[:200])
            parts = (cands[0].get("content") or {}).get("parts") or []
            text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
            return parse_json(text)
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "ignore")[:300]
            last = "HTTP %s: %s" % (e.code, msg)
            if e.code in (429, 500, 502, 503, 504):
                wait = 20 * (attempt + 1)
                print("  %s – neuer Versuch in %ss" % (last, wait))
                time.sleep(wait)
                continue
            raise RuntimeError(last)
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            last = str(e)
            print("  Fehler:", last, "– neuer Versuch")
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(last or "unbekannter Fehler")


def parse_json(text):
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except ValueError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            return json.loads(m.group(0))
        raise ValueError("Antwort ist kein JSON: " + text[:200])


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

RULES = """Regeln:
- Nutze ausschließlich die Zahlen aus der Tabelle. Erfinde keine Fakten, Nachrichten, Produkte oder Ereignisse.
- Jede Begründung nennt mindestens eine konkrete Zahl aus der Tabelle (z. B. "Fwd-KGV 14 bei Sektor-Median 22").
- Leere Zellen bedeuten: Wert unbekannt. Ziehe daraus keine Schlüsse.
- Bewerte ausgewogen: Bewertung im Vergleich zum Sektor, Qualität (Marge, ROE, Verschuldung), Wachstum, Momentum (Performance, RSI, Lage in der 52W-Spanne, Chartmuster) und Risiko (Volatilität, Stop-Abstand).
- Eine Aktie mit Vola über 60 % ist nie ein Kandidat mit "geringem Risiko"; nenne das Risiko ausdrücklich.
- Schreibe auf Deutsch, kurz und sachlich. Keine Kaufempfehlung im rechtlichen Sinn, sondern Hinweise, die sich der Nutzer genauer ansehen sollte.
- Antworte nur mit JSON im vorgegebenen Format."""


def sector_prompt(sector_de, rows, med):
    med_txt = ", ".join("%s %s" % (k, v) for k, v in med.items()) or "keine"
    return """Du bist ein nüchterner Aktienanalyst. Analysiere den Sektor "%s" (%d Werte).
Sektor-Mediane: %s

Aufgabe:
1. Wähle 3 bis 5 Kandidaten, die sich auf Basis der Zahlen am meisten lohnen, genauer angesehen zu werden.
   Mische ruhig Typen (z. B. günstig bewertet, Qualität mit Momentum, Erholungskandidat) und nenne den Typ.
2. Nenne bis zu 3 Warnungen: Werte, bei denen die Zahlen auffällige Risiken zeigen (z. B. sehr hohe Volatilität, starker Abwärtstrend, Überbewertung, hohe Verschuldung).
3. Fasse den Sektor in 1–2 Sätzen zusammen (Stimmung, Bewertung, Auffälligkeiten).

%s

JSON-Format:
{"summary": "…",
 "picks": [{"ticker": "…", "type": "Value|Qualität|Wachstum|Momentum|Erholung|Dividende", "thesis": "eine Zeile, max. 90 Zeichen",
            "reasons": ["…", "…"], "risks": ["…"], "conviction": 1-5}],
 "warnings": [{"ticker": "…", "reason": "…"}]}

Tabelle (Spalten mit | getrennt):
%s""" % (sector_de, len(rows), med_txt, RULES, to_table(rows))


def overall_prompt(cands):
    lines = []
    for c in cands:
        lines.append("%s|%s|%s|%s|%s|%s" % (c["ticker"], c["sectorDe"], c["region"], c.get("type", ""),
                                             c.get("thesis", ""), " / ".join(c.get("reasons", [])[:3])))
    rows = [c["_row"] for c in cands]
    return """Du bist ein nüchterner Aktienanalyst. Unten stehen die Kandidaten, die in den einzelnen Sektoren ausgewählt wurden,
mit Begründung und den Kennzahlen.

Aufgabe:
1. Erstelle eine Top-10-Liste über alle Sektoren. Achte auf Streuung: höchstens 3 Werte aus demselben Sektor.
2. Begründe jeden Platz in 1–2 Sätzen mit Zahlen und nenne das wichtigste Risiko.
3. Schreibe eine Marktübersicht in 2–3 Sätzen: Welche Sektoren wirken günstig oder teuer, wo ist Momentum, wo ist Vorsicht geboten?

%s

JSON-Format:
{"marketView": "…",
 "top": [{"ticker": "…", "rank": 1, "thesis": "eine Zeile, max. 90 Zeichen", "why": "…", "risk": "…"}]}

Kandidaten (Ticker|Sektor|Region|Typ|These|Begründungen):
%s

Kennzahlen der Kandidaten:
%s""" % (RULES, "\n".join(lines), to_table(rows))


# ---------------------------------------------------------------------------
# Hauptablauf
# ---------------------------------------------------------------------------

def clean_text(v, n=400):
    return re.sub(r"\s+", " ", str(v or "")).strip()[:n]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="Nur diesen Sektor (englischer Name, z. B. Technology) – zum Testen")
    ap.add_argument("--dry-run", action="store_true", help="Nur Prompts erzeugen und Größe ausgeben, keine API-Aufrufe")
    args = ap.parse_args()

    universe = load_json(os.path.join(DATA, "universe.json"), [])
    if not universe:
        print("FEHLER: data/universe.json fehlt oder ist leer.")
        sys.exit(1)
    news_idx = load_json(os.path.join(DATA, "news", "_index.json"), {})
    reddit_idx = load_json(os.path.join(DATA, "news", "_reddit_index.json"), {})

    rows = build_rows(universe, news_idx, reddit_idx)
    by_sector = {}
    for r in rows:
        by_sector.setdefault(r["sector"], []).append(r)
    by_ticker = {r["t"]: r for r in rows}

    sectors = sorted(by_sector.keys(), key=lambda s: (s == "ETF", s == "Sonstige", -len(by_sector[s])))
    if args.only:
        sectors = [s for s in sectors if s == args.only]
    sectors = [s for s in sectors if len(by_sector[s]) >= 3 and s != "Sonstige"]
    print("Segmente:", ", ".join("%s (%d)" % (s, len(by_sector[s])) for s in sectors))

    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key and not args.dry_run:
        print("FEHLER: GEMINI_API_KEY ist nicht gesetzt. In GitHub unter Settings › Secrets › Actions anlegen.")
        sys.exit(1)

    model = "dry-run" if args.dry_run else pick_model(key)
    print("Modell:", model)

    previous = load_json(OUT_FILE, {})
    result = {
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": model,
        "universeSize": len(rows),
        "overall": previous.get("overall") or None,
        "sectors": {},
        "errors": [],
    }

    all_cands = []
    for i, sec in enumerate(sectors):
        srows = sorted(by_sector[sec], key=lambda r: r.get("mcap") or 0, reverse=True)[:MAX_ROWS_PER_SECTOR]
        sec_de = SECTOR_DE.get(sec, sec)
        prompt = sector_prompt(sec_de, srows, medians(srows))
        print("[%d/%d] %s: %d Werte, ~%d Tokens" % (i + 1, len(sectors), sec_de, len(srows), len(prompt) // 4))
        if args.dry_run:
            continue
        try:
            res = call_gemini(key, model, prompt)
        except Exception as e:
            print("  übersprungen:", e)
            result["errors"].append({"segment": sec_de, "error": clean_text(e, 200)})
            old = (previous.get("sectors") or {}).get(sec)
            if old:
                old["stale"] = True
                result["sectors"][sec] = old
            time.sleep(PAUSE_BETWEEN_CALLS)
            continue

        valid = {r["t"] for r in srows}
        picks = []
        for p in (res.get("picks") or [])[:5]:
            t = str(p.get("ticker") or "").upper().strip()
            if t not in valid or any(x["ticker"] == t for x in picks):
                continue  # Schutz gegen erfundene Ticker
            row = by_ticker[t]
            pick = {
                "ticker": t, "name": row["name"], "region": row["region"],
                "type": clean_text(p.get("type"), 20),
                "thesis": clean_text(p.get("thesis"), 120),
                "reasons": [clean_text(x, 220) for x in (p.get("reasons") or [])[:3] if x],
                "risks": [clean_text(x, 220) for x in (p.get("risks") or [])[:2] if x],
                "conviction": max(1, min(5, int(p.get("conviction") or 3))) if str(p.get("conviction") or "3").isdigit() else 3,
            }
            picks.append(pick)
            all_cands.append(dict(pick, sector=sec, sectorDe=sec_de, _row=row))
        warnings = []
        for w in (res.get("warnings") or [])[:3]:
            t = str(w.get("ticker") or "").upper().strip()
            if t in valid and t not in [p["ticker"] for p in picks]:
                warnings.append({"ticker": t, "name": by_ticker[t]["name"], "region": by_ticker[t]["region"],
                                 "reason": clean_text(w.get("reason"), 220)})
        result["sectors"][sec] = {"name": sec_de, "count": len(by_sector[sec]), "summary": clean_text(res.get("summary"), 400),
                                  "picks": picks, "warnings": warnings}
        print("  %d Kandidaten, %d Warnungen" % (len(picks), len(warnings)))
        time.sleep(PAUSE_BETWEEN_CALLS)

    if args.dry_run:
        print("Trockenlauf beendet, nichts geschrieben.")
        return

    # Stufe 2: Gesamtauswertung (ETFs ausgenommen, die werden separat gezeigt)
    stock_cands = [c for c in all_cands if c["sector"] != "ETF"]
    if len(stock_cands) >= 5:
        try:
            res = call_gemini(key, model, overall_prompt(stock_cands))
            cand_map = {c["ticker"]: c for c in stock_cands}
            top, seen = [], set()
            for item in sorted(res.get("top") or [], key=lambda x: x.get("rank") or 99):
                t = str(item.get("ticker") or "").upper().strip()
                if t not in cand_map or t in seen:
                    continue
                c = cand_map[t]
                if sum(1 for x in top if x["sector"] == c["sector"]) >= 3:
                    continue  # Streuung: höchstens 3 Werte je Sektor
                seen.add(t)
                top.append({"rank": len(top) + 1, "ticker": t, "name": c["name"], "sector": c["sector"], "sectorDe": c["sectorDe"],
                            "region": c["region"], "type": c.get("type", ""),
                            "thesis": clean_text(item.get("thesis") or c.get("thesis"), 120),
                            "why": clean_text(item.get("why"), 320), "risk": clean_text(item.get("risk"), 220)})
                if len(top) >= 10:
                    break
            result["overall"] = {"marketView": clean_text(res.get("marketView"), 600), "top": top}
            print("Gesamt: %d Plätze" % len(top))
        except Exception as e:
            print("Gesamtauswertung fehlgeschlagen:", e)
            result["errors"].append({"segment": "Gesamt", "error": clean_text(e, 200)})
            if result["overall"]:
                result["overall"]["stale"] = True
    else:
        result["errors"].append({"segment": "Gesamt", "error": "Zu wenige Sektor-Kandidaten für eine Gesamtauswertung."})

    if not result["sectors"] and not result["overall"]:
        print("FEHLER: Keine einzige Auswertung erfolgreich – bestehende Datei bleibt unverändert.")
        sys.exit(1)

    os.makedirs(DATA, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
    print("Geschrieben:", OUT_FILE, "| Fehler:", len(result["errors"]))


if __name__ == "__main__":
    main()

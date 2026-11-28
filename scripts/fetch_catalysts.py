#!/usr/bin/env python3
"""
scripts/fetch_catalysts.py – Treiber & Termine: Nachrichten und Entscheidungen, die Kurse bewegen können

Ablauf:
  1. Schlagzeilen der letzten 7 Tage je Thema aus Google-News-Feeds (deutsch + englisch, kostenlos)
     z. B. EU-Regeln für Autos, Zölle, Chip-Exportregeln, Arzneimittelpreise, Notenbanken …
  2. Je Thema ordnet die KI (Groq, sonst Gemini – wie scripts/fetch_ai_insights.py) die Meldungen ein:
     beschlossen / bevorstehend (mit Datum) / laufend, eher positiv / negativ / unklar,
     betroffene Sektoren und Aktien aus der App (nur Ticker, die es in universe.json gibt).
  3. Feste Termine: US-Inflation, US-Arbeitsmarkt, US-BIP, US-Konsumausgaben (FRED-Veröffentlichungskalender)
  4. Ausgabe: data/catalysts.json

Umgebungsvariablen: GROQ_API_KEY und/oder GEMINI_API_KEY (Pflicht, mind. einer), FRED_API_KEY (optional)
Nur Standardbibliothek (plus fetch_ai_insights.py aus demselben Ordner).
"""
import email.utils
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_ai_insights as ai  # noqa: E402  (KI-Aufruf, Modellwahl, Zeitbudget)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(DATA, "catalysts.json")
DAYS_BACK = 7
MAX_HEADLINES = 16
MAX_CANDIDATES = 60
KEEP_DECIDED_DAYS = 14

# Themen: Suchanfragen (de/en) und Sektoren, aus denen Kandidaten-Aktien vorgeschlagen werden (leer = alle)
THEMES = [
    {"id": "autos_eu", "title": "EU-Regeln für Autos",
     "q": ["EU Verbrenner-Aus OR CO2-Flottengrenzwerte OR Hybridfahrzeuge Autoindustrie", "EU combustion engine ban OR CO2 fleet targets carmakers"],
     "sectors": ["Consumer Cyclical", "Industrials", "Basic Materials"]},
    {"id": "tariffs", "title": "Zölle & Handelsstreit",
     "q": ["Zölle USA EU OR China Handelsstreit", "tariffs trade deal US EU China"], "sectors": []},
    {"id": "chips", "title": "Chips & Exportregeln",
     "q": ["Chip Exportkontrollen China Halbleiter", "chip export controls China semiconductors"],
     "sectors": ["Technology"]},
    {"id": "pharma", "title": "Arzneimittelpreise & Zulassungen",
     "q": ["Arzneimittelpreise USA Pharma Zölle", "drug pricing Medicare negotiation pharma tariffs FDA"],
     "sectors": ["Healthcare"]},
    {"id": "energy", "title": "Energiepolitik & Ölpreis",
     "q": ["Strompreis Gaspreis Energiepolitik EU OR OPEC Ölförderung", "OPEC output oil price energy policy"],
     "sectors": ["Energy", "Utilities", "Basic Materials"]},
    {"id": "banks", "title": "Bankenregulierung",
     "q": ["Bankenregulierung Eigenkapitalregeln Basel", "bank capital rules Basel endgame regulation"],
     "sectors": ["Financial Services"]},
    {"id": "defense", "title": "Rüstung & Verteidigungsausgaben",
     "q": ["Rüstungsausgaben NATO Bundeswehr Aufträge", "defense spending Europe NATO contracts"],
     "sectors": ["Industrials"]},
    {"id": "fed", "title": "US-Notenbank (Fed)",
     "q": ["Fed Zinsentscheid FOMC", "Fed rate decision FOMC meeting"], "sectors": []},
    {"id": "ecb", "title": "Europäische Zentralbank (EZB)",
     "q": ["EZB Zinsentscheid Lagarde", "ECB rate decision"], "sectors": []},
    {"id": "china", "title": "China-Konjunktur",
     "q": ["China Konjunkturpaket Wirtschaft", "China stimulus economy"],
     "sectors": ["Basic Materials", "Consumer Cyclical", "Industrials", "Technology"]},
    {"id": "ai_reg", "title": "KI & Tech-Regulierung",
     "q": ["EU AI Act Digital Markets Act Strafe", "AI regulation antitrust big tech ruling"],
     "sectors": ["Technology", "Communication Services"]},
]

# FRED-Veröffentlichungen mit festen Terminen
FRED_RELEASES = [
    (10, "US-Inflationsdaten (CPI)", "Höhere Inflation als erwartet drückt meist auf Wachstums- und Technologiewerte."),
    (50, "US-Arbeitsmarktbericht", "Bewegt Zinserwartungen und damit den breiten Markt."),
    (53, "US-Wirtschaftswachstum (BIP)", "Zeigt die Konjunkturlage; überraschende Werte bewegen zyklische Aktien."),
    (54, "US-Konsumausgaben & PCE-Inflation", "Bevorzugtes Inflationsmaß der Fed."),
]


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def http_get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (aktien-app catalysts)"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


# ---------------------------------------------------------------------------- Nachrichten
def google_news(query, lang):
    """Schlagzeilen aus dem Google-News-Feed der letzten DAYS_BACK Tage."""
    if lang == "de":
        params = {"q": query + " when:%dd" % DAYS_BACK, "hl": "de", "gl": "DE", "ceid": "DE:de"}
    else:
        params = {"q": query + " when:%dd" % DAYS_BACK, "hl": "en-US", "gl": "US", "ceid": "US:en"}
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode(params)
    root = ET.fromstring(http_get(url))
    out = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        src = item.find("source")
        source = (src.text or "").strip() if src is not None else ""
        if source and title.endswith(" - " + source):
            title = title[: -len(" - " + source)].strip()
        try:
            dt = email.utils.parsedate_to_datetime(item.findtext("pubDate") or "")
            date = dt.astimezone(timezone.utc).isoformat(timespec="minutes")
        except Exception:
            date = None
        if title:
            out.append({"title": title, "url": link, "source": source, "date": date})
    return out


def headlines_for(theme):
    seen, items = set(), []
    for i, q in enumerate(theme["q"]):
        try:
            for h in google_news(q, "de" if i == 0 else "en"):
                key = re.sub(r"\W+", " ", h["title"].lower()).strip()[:80]
                if key in seen:
                    continue
                seen.add(key)
                items.append(h)
        except Exception as e:
            print("  Feed-Fehler (%s): %s" % (q[:40], e))
    items.sort(key=lambda h: h["date"] or "", reverse=True)
    return items[:MAX_HEADLINES]


# ---------------------------------------------------------------------------- KI
def candidates(universe, sectors):
    rows = [u for u in universe if u.get("ticker") and u.get("sector") not in ("ETF", "Sonstige")
            and (not sectors or u.get("sector") in sectors)]
    rows.sort(key=lambda u: u.get("marketCap") or 0, reverse=True)
    return rows[:MAX_CANDIDATES]


def theme_prompt(theme, heads, cands, today):
    lines = [
        "Heute ist der %s. Thema: %s." % (today, theme["title"]),
        "Hier sind aktuelle Schlagzeilen (Nr | Datum | Quelle | Titel):",
    ]
    for i, h in enumerate(heads):
        lines.append("%d | %s | %s | %s" % (i, (h["date"] or "")[:10], h["source"][:30], h["title"][:180]))
    lines += [
        "",
        "Aktien, die in der App vorkommen (Ticker | Name | Sektor | Land):",
    ]
    for u in cands:
        lines.append("%s | %s | %s | %s" % (u["ticker"], (u.get("name") or "")[:40], u.get("sector") or "-", u.get("country") or "-"))
    lines += [
        "",
        "Fasse die Schlagzeilen zu höchstens 4 kursrelevanten Ereignissen zusammen (gleiche Sache = ein Ereignis). "
        "Nur Dinge, die Aktien oder Sektoren spürbar bewegen können: politische Entscheidungen, Gesetze, Regulierung, "
        "Zölle, Zinsentscheide, große Aufträge, Urteile. Keine Kursberichte, keine Meinungsbeiträge ohne neue Fakten.",
        "Für jedes Ereignis:",
        "- status: \"beschlossen\" (ist entschieden/verkündet), \"bevorstehend\" (Entscheidung/Abstimmung/Termin steht noch aus) oder \"laufend\" (Verhandlung ohne Termin)",
        "- datum: bei bevorstehend das Datum der Entscheidung als JJJJ-MM-TT, wenn es in den Schlagzeilen steht, sonst null; bei beschlossen das Datum der Entscheidung",
        "- richtung: \"positiv\", \"negativ\" oder \"unklar\" für die betroffenen Aktien insgesamt",
        "- tickers: betroffene Aktien NUR aus der Liste oben (höchstens 8), leer wenn keine passt",
        "- sektoren: betroffene Sektoren auf Deutsch",
        "- warum: 1 Satz, warum es den Kurs bewegen kann",
        "- quellen: Nummern der zugehörigen Schlagzeilen",
        "Erfinde nichts, was nicht in den Schlagzeilen steht. Wenn nichts Kursrelevantes dabei ist, gib eine leere Liste zurück.",
        'Antworte als JSON: {"ereignisse":[{"titel":"kurz, max. 90 Zeichen","status":"…","datum":"…|null","richtung":"…",'
        '"tickers":["…"],"sektoren":["…"],"warum":"…","quellen":[0,2]}]}',
    ]
    return "\n".join(lines)


def ask_ai(prompt, models, keys):
    """Erstes funktionierendes Modell der Liste; gibt (Antwort, Modell) zurück."""
    last = None
    for m in list(models):
        try:
            return ai.call_model(m, keys, prompt), m
        except (ai.QuotaExhausted, ai.ModelUnavailable) as e:
            print("  %s – nächstes Modell" % e)
            last = e
            if not isinstance(e, ai.ModelBusy):
                models.remove(m)
        except Exception as e:
            print("  Fehler mit %s: %s" % (m, e))
            last = e
    raise RuntimeError("Kein KI-Modell verfügbar: %s" % last)


# ---------------------------------------------------------------------------- feste Termine
def fred_events(today):
    key = os.environ.get("FRED_API_KEY", "").strip()
    if not key:
        print("FRED_API_KEY fehlt – keine US-Konjunkturtermine.")
        return []
    out = []
    for rid, title, why in FRED_RELEASES:
        url = ("https://api.stlouisfed.org/fred/release/dates?release_id=%d&realtime_start=%s"
               "&include_release_dates_with_no_data=true&sort_order=asc&limit=10&file_type=json&api_key=%s") % (rid, today, urllib.parse.quote(key))
        try:
            data = json.loads(http_get(url))
            dates = [d.get("date") for d in data.get("release_dates", []) if d.get("date") and d["date"] >= today]
            for d in sorted(set(dates))[:2]:
                out.append({"id": "fred-%d-%s" % (rid, d), "theme": "termine", "themeTitle": "Konjunkturdaten",
                            "title": title, "status": "bevorstehend", "date": d, "direction": "unklar",
                            "tickers": [], "sectors": ["Gesamtmarkt"], "why": why, "sources": [], "fixed": True})
        except Exception as e:
            print("  FRED-Termine %s: %s" % (title, e))
    return out


# ---------------------------------------------------------------------------- Hauptablauf
def main():
    today = datetime.now(timezone.utc).date().isoformat()
    keys = {"gemini": os.environ.get("GEMINI_API_KEY", "").strip(), "groq": os.environ.get("GROQ_API_KEY", "").strip()}
    if not keys["gemini"] and not keys["groq"]:
        print("FEHLER: GROQ_API_KEY oder GEMINI_API_KEY fehlt.")
        sys.exit(1)

    universe = [u for u in load_json(os.path.join(DATA, "universe.json"), []) if isinstance(u, dict) and u.get("ticker")]
    valid = {u["ticker"]: u for u in universe}
    previous = load_json(OUT, {})
    prev_seen = {it.get("id"): it.get("firstSeen") for it in previous.get("items", []) if it.get("id")}

    models, _ = ai.pick_models(keys["gemini"], keys["groq"])
    print("Modelle:", ", ".join(models))

    items, errors, used = [], [], []
    for th in THEMES:
        if ai.time_left() < ai.HTTP_TIMEOUT + 30:
            errors.append({"theme": th["title"], "error": "Zeitlimit"})
            continue
        heads = headlines_for(th)
        print("[%s] %d Schlagzeilen" % (th["title"], len(heads)))
        if not heads:
            continue
        try:
            res, model = ask_ai(theme_prompt(th, heads, candidates(universe, th["sectors"]), today), models, keys)
        except Exception as e:
            errors.append({"theme": th["title"], "error": str(e)[:200]})
            print("  übersprungen:", e)
            continue
        if model not in used:
            used.append(model)
        for ev in (res.get("ereignisse") or [])[:4]:
            title = ai.clean_text(ev.get("titel"), 110)
            if not title:
                continue
            status = ev.get("status") if ev.get("status") in ("beschlossen", "bevorstehend", "laufend") else "laufend"
            date = str(ev.get("datum") or "")[:10]
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
                date = None
            direction = ev.get("richtung") if ev.get("richtung") in ("positiv", "negativ", "unklar") else "unklar"
            tickers = []
            for t in ev.get("tickers") or []:
                t = str(t).upper().strip()
                if t in valid and t not in tickers:
                    tickers.append(t)
            srcs = []
            for i in ev.get("quellen") or []:
                try:
                    h = heads[int(i)]
                    srcs.append({"title": h["title"][:160], "url": h["url"], "source": h["source"], "date": h["date"]})
                except Exception:
                    pass
            iid = hashlib.sha1((th["id"] + "|" + re.sub(r"\W+", "", title.lower())[:60]).encode()).hexdigest()[:12]
            items.append({
                "id": iid, "theme": th["id"], "themeTitle": th["title"], "title": title, "status": status, "date": date,
                "direction": direction, "tickers": tickers[:8],
                "sectors": [ai.clean_text(s, 30) for s in (ev.get("sektoren") or [])[:4] if s],
                "why": ai.clean_text(ev.get("warum"), 240), "sources": srcs[:4],
                "firstSeen": prev_seen.get(iid) or now_iso(),
            })
        time.sleep(ai.pause_for(model))

    items += fred_events(today)

    # Aufräumen: vergangene "bevorstehend"-Termine werden zu "vorbei", alte Beschlüsse fallen heraus
    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=KEEP_DECIDED_DAYS)).isoformat()
    final = []
    for it in items:
        if it["status"] == "bevorstehend" and it.get("date") and it["date"] < today:
            it["status"] = "vorbei"
        if it.get("date") and it["date"] < cutoff and it["status"] != "laufend":
            continue
        final.append(it)

    if not final and previous.get("items"):
        print("Keine neuen Ereignisse gefunden – alter Stand bleibt.")
        previous["stale"] = True
        previous["errors"] = errors
        final_obj = previous
    else:
        final_obj = {"updatedAt": now_iso(), "model": ", ".join(used), "themes": [{"id": t["id"], "title": t["title"]} for t in THEMES],
                     "items": final, "errors": errors}
    os.makedirs(DATA, exist_ok=True)
    with open(OUT + ".tmp", "w", encoding="utf-8") as f:
        json.dump(final_obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(OUT + ".tmp", OUT)
    print("Geschrieben: %d Ereignisse, %d Fehler" % (len(final_obj.get("items", [])), len(errors)))


if __name__ == "__main__":
    main()

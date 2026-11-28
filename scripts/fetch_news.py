"""Holt Nachrichten (Google News, Ersatz: Yahoo/yfinance) und bewertet Schlagzeilen mit FinBERT
(kostenlos, läuft in der GitHub Action).
Schreibt data/news/<TICKER>.json, data/news/_index.json (Kurzwerte) und data/news/_sectors.json.

Google News: Suche nach dem Firmennamen der letzten 7 Tage, zuerst auf Englisch (FinBERT bewertet nur
englische Schlagzeilen zuverlässig). Kommen zu wenige Treffer (z. B. kleinere deutsche Werte), wird
zusätzlich deutsch gesucht; deutsche Meldungen bleiben unbewertet (leerer Kreis in der App).
Liefert Google nichts oder blockiert, werden wie bisher die Yahoo-Nachrichten genommen."""
import os, json, time, hashlib, re, email.utils, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
import yfinance as yf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
NEWS = os.path.join(DATA, "news")
MAX_ITEMS, TOP_PER_SECTOR, SECTOR_ITEMS = 8, 8, 12
SECTOR_ETFS = {"Technology": ["QDVE.DE", "XDWT.DE"], "Healthcare": ["WHEA.DE"], "Consumer Defensive": ["WSCA.DE"],
               "Financial Services": ["WFIS.DE"], "Real Estate": ["IUSP.DE"], "Energy": ["WNRG.DE"]}
_clf = None
GOOGLE_PAUSE = 0.7          # Sekunden zwischen zwei Google-Abfragen
GOOGLE_MIN = 3              # weniger englische Treffer -> zusätzlich deutsch suchen
LEGAL = re.compile(r"\b(incorporated|inc|corporation|corp|company|co|limited|ltd|plc|ag|se|sa|nv|n\.v|s\.a|spa|kgaa|"
                   r"holdings?|group|the|class [a-z]|cl [a-z]|& co|reit|a/s|asa|ab|oyj)\b\.?", re.I)
google_blocked = False
bing_blocked = False
bing_fail = 0
STATS = {"google": 0, "bing": 0}
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
google_fail = 0


def short_name(name, ticker):
    """Suchname: Firmenname ohne Rechtsform ("NVIDIA Corporation" -> "NVIDIA")."""
    n = LEGAL.sub(" ", str(name or "")).replace(",", " ")
    n = re.sub(r"\s+", " ", n).strip(" .-&")
    return n or ticker.split(".")[0]


def google_news(query, lang):
    params = {"q": query + " when:7d"}
    params.update({"hl": "de", "gl": "DE", "ceid": "DE:de"} if lang == "de" else {"hl": "en-US", "gl": "US", "ceid": "US:en"})
    req = urllib.request.Request("https://news.google.com/rss/search?" + urllib.parse.urlencode(params),
                                 headers={"User-Agent": BROWSER_UA, "Accept": "application/rss+xml,text/xml"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        root = ET.fromstring(resp.read())
    out = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        src_el = item.find("source")
        src = (src_el.text or "").strip() if src_el is not None else ""
        if src and title.endswith(" - " + src):
            title = title[: -len(" - " + src)].strip()
        try:
            date = email.utils.parsedate_to_datetime(item.findtext("pubDate") or "").astimezone(timezone.utc).isoformat()
        except Exception:
            date = None
        if title and date:
            out.append({"id": hashlib.md5(title.encode()).hexdigest()[:12], "title": title, "source": src,
                        "date": date, "url": (item.findtext("link") or "").strip(), "lang": lang})
    return out


def bing_news(query, lang):
    """Bing News RSS – zweite Quelle, falls Google Anfragen aus Rechenzentren abweist."""
    params = {"q": query, "format": "rss", "qft": 'interval="7"'}
    params.update({"setlang": "de-DE", "cc": "DE"} if lang == "de" else {"setlang": "en-US", "cc": "US"})
    req = urllib.request.Request("https://www.bing.com/news/search?" + urllib.parse.urlencode(params),
                                 headers={"User-Agent": BROWSER_UA, "Accept": "application/rss+xml,text/xml"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        root = ET.fromstring(resp.read())
    out = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        url = (item.findtext("link") or "").strip()
        m = re.search(r"[?&]url=([^&]+)", url)
        if m:
            url = urllib.parse.unquote(m.group(1))
        src = ""
        for ch in item:
            if ch.tag.lower().endswith("source"):
                src = (ch.text or "").strip()
        if not src:
            src = urllib.parse.urlparse(url).netloc.replace("www.", "")
        try:
            date = email.utils.parsedate_to_datetime(item.findtext("pubDate") or "").astimezone(timezone.utc).isoformat()
        except Exception:
            date = None
        if title and date:
            out.append({"id": hashlib.md5(title.encode()).hexdigest()[:12], "title": title, "source": src,
                        "date": date, "url": url, "lang": lang})
    return out


def search_provider(fn, q_en, name):
    items = fn(q_en, "en")
    if len(items) < GOOGLE_MIN:
        time.sleep(GOOGLE_PAUSE)
        items += fn('"%s" Aktie' % name, "de")
    return items


def fetch_items(u):
    """Schlagzeilen einer Aktie: Google News (en, ggf. de), sonst Yahoo."""
    global google_blocked, google_fail, bing_blocked, bing_fail
    t = u["ticker"]
    name = short_name(u.get("name"), t)
    items = []
    if not google_blocked:
        try:
            base = t.split(".")[0]
            q_en = '"%s" (stock OR shares OR %s)' % (name, base) if base.isalpha() and len(base) >= 2 else '"%s" (stock OR shares)' % name
            items = search_provider(google_news, q_en, name)
            google_fail = 0
            STATS["google"] += 1 if len(items) >= 2 else 0
        except Exception as e:
            google_fail += 1
            print("Google News Fehler", t, e)
            if google_fail >= 3:
                google_blocked = True
                print("Google News blockiert – für den Rest des Laufs Bing bzw. Yahoo.")
        time.sleep(GOOGLE_PAUSE)
    if len(items) < 2 and not bing_blocked:
        try:
            items = search_provider(bing_news, '"%s" stock' % name, name)
            bing_fail = 0
            STATS["bing"] += 1 if len(items) >= 2 else 0
        except Exception as e:
            bing_fail += 1
            print("Bing News Fehler", t, e)
            if bing_fail >= 3:
                bing_blocked = True
                print("Bing News blockiert – für den Rest des Laufs Yahoo-Nachrichten.")
        time.sleep(GOOGLE_PAUSE)
    if len(items) < 2:
        try:
            items += [r for r in (parse(x) for x in (yf.Ticker(t).news or [])) if r]
        except Exception as e:
            print("Yahoo-Fehler", t, e)
    seen, out = set(), []
    for r in sorted(items, key=lambda r: r["date"], reverse=True):
        key = re.sub(r"\W+", " ", r["title"].lower()).strip()[:90]
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out[:MAX_ITEMS]


def iso(v):
    try:
        if isinstance(v, (int, float)):
            return datetime.fromtimestamp(v, timezone.utc).isoformat()
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
    except Exception:
        return None


def parse(it):
    c = it.get("content") or it
    title = (c.get("title") or "").strip()
    date = iso(c.get("pubDate") or c.get("providerPublishTime"))
    if not title or not date:
        return None
    prov = c.get("provider")
    src = prov.get("displayName") if isinstance(prov, dict) else c.get("publisher")
    u = c.get("canonicalUrl") or c.get("clickThroughUrl")
    url = u.get("url") if isinstance(u, dict) else c.get("link")
    return {"id": hashlib.md5(title.encode()).hexdigest()[:12], "title": title, "source": src or "", "date": date, "url": url or ""}


def score(titles):
    global _clf
    if not titles:
        return []
    if _clf is None:
        from transformers import pipeline
        _clf = pipeline("text-classification", model="ProsusAI/finbert", top_k=None, truncation=True)
    out = []
    for res in _clf(titles, batch_size=32):
        p = {r["label"].lower(): r["score"] for r in res}
        s = round(p.get("positive", 0) - p.get("negative", 0), 3)
        out.append({"score": s, "label": "positive" if s > 0.25 else "negative" if s < -0.25 else "neutral"})
    return out


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def dump(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def summary(items):
    items = [i for i in items if i.get("label")]          # unbewertete (deutsche) Meldungen zählen nicht
    n = len(items)
    c = {k: sum(1 for i in items if i["label"] == k) for k in ("positive", "neutral", "negative")}
    return {"score": round(sum(i["score"] for i in items) / n, 3) if n else None, "n": n,
            "pos": c["positive"], "neu": c["neutral"], "neg": c["negative"]}


def main():
    os.makedirs(NEWS, exist_ok=True)
    universe = [u for u in load(os.path.join(DATA, "universe.json"), []) if isinstance(u, dict) and u.get("ticker")]
    index, by_ticker = {}, {}
    for u in universe:
        t = u["ticker"]
        old = {i["id"]: i for i in load(os.path.join(NEWS, t + ".json"), {}).get("items", [])}
        raw = fetch_items(u)
        new = [r for r in raw if r["id"] not in old]
        # FinBERT ist englisch trainiert: deutsche Schlagzeilen bleiben unbewertet
        to_score = [r for r in new if r.get("lang") != "de"]
        for r, s in zip(to_score, score([r["title"] for r in to_score])):
            r.update(s)
        for r in new:
            if r.get("lang") == "de":
                r.update({"label": None, "score": None})
        items = [old.get(r["id"]) or r for r in raw]
        by_ticker[t] = items
        dump(os.path.join(NEWS, t + ".json"), {"ticker": t, "updatedAt": datetime.now(timezone.utc).isoformat(), "items": items})
        sm = summary(items)
        top = next((i for i in items if i.get("label")), items[0] if items else None)
        index[t] = dict(sm, top=({"t": top["title"], "l": top.get("label")} if top else None))
    dump(os.path.join(NEWS, "_index.json"), index)
    print("Quellen: Google %d, Bing %d, Rest Yahoo (von %d Werten)" % (STATS["google"], STATS["bing"], len(index)))
    dump(os.path.join(NEWS, "_meta.json"), {"updatedAt": datetime.now(timezone.utc).isoformat(), "tickers": len(index),
                                            "google": STATS["google"], "bing": STATS["bing"]})

    sectors = {}
    for sec in {u.get("sector") for u in universe if u.get("sector")}:
        etfs = SECTOR_ETFS.get(sec, [])
        top = sorted([u for u in universe if u.get("sector") == sec and u["ticker"] not in etfs and u.get("marketCap")],
                     key=lambda u: u["marketCap"], reverse=True)[:TOP_PER_SECTOR]
        seen, items = set(), []
        for t in [u["ticker"] for u in top] + etfs:
            for i in by_ticker.get(t, []):
                if i["id"] not in seen:
                    seen.add(i["id"])
                    items.append(dict(i, ticker=t))
        items = sorted(items, key=lambda i: i["date"], reverse=True)[:SECTOR_ITEMS]
        sectors[sec] = dict(summary(items), items=items)
    dump(os.path.join(NEWS, "_sectors.json"), sectors)


if __name__ == "__main__":
    main()


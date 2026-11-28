"""Holt Nachrichten und bewertet Schlagzeilen mit FinBERT
(kostenlos, läuft in der GitHub Action).
Schreibt data/news/<TICKER>.json, data/news/_index.json (Kurzwerte) und data/news/_sectors.json.

Google News: Suche nach dem Firmennamen der letzten 7 Tage, zuerst auf Englisch (FinBERT bewertet nur
englische Schlagzeilen zuverlässig). Kommen zu wenige Treffer (z. B. kleinere deutsche Werte), wird
zusätzlich deutsch gesucht; deutsche Meldungen bleiben unbewertet (leerer Kreis in der App).
Liefert Google nichts oder blockiert, werden wie bisher die Yahoo-Nachrichten genommen.

Reihenfolge der Quellen je Aktie:
  1. Google Alerts – eigene RSS-Feeds aus data/google_alerts.json (nur für eingetragene Werte)
  2. GDELT – freie Nachrichtendatenbank, am Anfang gesammelt für alle Werte abgefragt
  3. Google News, 4. Bing News, 5. Yahoo – nur wenn 1 und 2 zu wenig liefern"""
import html
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
# Offizielle Namen, die in Schlagzeilen kaum vorkommen -> gebräuchlicher Name
NAME_ALIASES = [
    (r"^Bayerische Motoren Werke", "BMW"), (r"^M(ü|ue)nchener R(ü|ue)ck", "Munich Re"), (r"^Hannover R(ü|ue)ck", "Hannover Re"),
    (r"Porsche Automobil", "Porsche SE"), (r"^Dr\.? Ing\.? h\.? ?c\.? F\.? Porsche", "Porsche"), (r"^Meta Platforms", "Meta"),
    (r"^Taiwan Semiconductor", "TSMC"), (r"^Deutsche Post|^DHL", "DHL Group"), (r"^Alphabet", "Alphabet"),
    (r"^International Business Machines", "IBM"), (r"^Advanced Micro Devices", "AMD"), (r"^Siemens Healthineers", "Siemens Healthineers"),
]
google_blocked = False
bing_blocked = False
google_retry_at = 0.0
bing_fail = 0
STATS = {"alerts": 0, "gdelt": 0, "google": 0, "bing": 0}
GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
GDELT_GROUP = 6             # Firmennamen je GDELT-Abfrage (mit OR verknüpft)
GDELT_PAUSE = 5.5           # GDELT erlaubt eine Abfrage alle 5 Sekunden
GDELT_BUDGET = 20 * 60      # höchstens so lange GDELT abfragen
ALERTS_FILE = os.path.join(DATA, "google_alerts.json")
GDELT_ITEMS = {}            # Ticker -> Meldungen aus GDELT (am Anfang gesammelt)
ALERT_FEEDS = {}            # Ticker -> RSS-Adresse aus Google Alerts
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
google_fail = 0


def short_name(name, ticker):
    """Suchname: Firmenname ohne Rechtsform ("NVIDIA Corporation" -> "NVIDIA")."""
    n = LEGAL.sub(" ", str(name or "")).replace(",", " ")
    n = re.sub(r"\s+", " ", n).strip(" .-&")
    for pat, alias in NAME_ALIASES:
        if re.search(pat, n, re.I):
            return alias
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


def relevant(items, name, ticker):
    """Nur Meldungen, deren Titel den Firmennamen (oder das Kürzel) enthält – Bing liefert sonst viel Fremdes."""
    words = [w for w in re.split(r"[\s\-]+", name.lower()) if len(w) >= 3][:2]
    base = ticker.split(".")[0].lower()
    return [i for i in items if not words or any(w in i["title"].lower() for w in words) or (base + ")") in i["title"].lower()]


def norm_words(s):
    return " " + re.sub(r"[^a-z0-9äöüß]+", " ", str(s or "").lower()).strip() + " "


def mk_item(title, src, date, url, lang):
    return {"id": hashlib.md5(title.encode()).hexdigest()[:12], "title": title, "source": src,
            "date": date, "url": url, "lang": lang}


GERMAN_HINT = re.compile(r"\b(der|die|das|und|mit|für|nach|aktie|aktien|kurs|zahlen|gewinn|umsatz|prognose|börse)\b", re.I)


def alert_feed(url):
    """Google-Alerts-Feed (Atom) lesen."""
    req = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA, "Accept": "application/atom+xml,text/xml"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        root = ET.fromstring(resp.read())
    ns = "{http://www.w3.org/2005/Atom}"
    out = []
    for e in root.iter(ns + "entry"):
        title = html.unescape(re.sub(r"<[^>]+>", "", e.findtext(ns + "title") or "")).strip()
        link_el = e.find(ns + "link")
        link = link_el.get("href", "") if link_el is not None else ""
        m = re.search(r"[?&]url=([^&]+)", link)
        if m:
            link = urllib.parse.unquote(m.group(1))
        date = iso(e.findtext(ns + "published") or e.findtext(ns + "updated"))
        if title and date:
            src = urllib.parse.urlparse(link).netloc.replace("www.", "")
            out.append(mk_item(title, src, date, link, "de" if GERMAN_HINT.search(title) else "en"))
    return out


def load_alerts():
    cfg = load(ALERTS_FILE, {})
    feeds = cfg.get("feeds") if isinstance(cfg, dict) else None
    for t, url in (feeds or {}).items():
        if isinstance(url, str) and url.startswith("https://www.google.com/alerts/feeds/"):
            ALERT_FEEDS[t.upper()] = url
    if ALERT_FEEDS:
        print("Google Alerts: %d Feeds" % len(ALERT_FEEDS))


def gdelt_query(names):
    q = "(" + " OR ".join('"%s"' % n for n in names) + ")" if len(names) > 1 else '"%s"' % names[0]
    params = {"query": q + " (sourcelang:english OR sourcelang:german)", "mode": "ArtList", "maxrecords": "250",
              "timespan": "7d", "sort": "DateDesc", "format": "json"}
    req = urllib.request.Request(GDELT_URL + "?" + urllib.parse.urlencode(params), headers={"User-Agent": BROWSER_UA})
    with urllib.request.urlopen(req, timeout=40) as resp:
        text = resp.read().decode("utf-8", "ignore")
    if not text.strip().startswith("{"):
        raise RuntimeError(text.strip()[:160] or "leere Antwort")
    return json.loads(text).get("articles") or []


def gdelt_article(a):
    title = html.unescape(str(a.get("title") or "")).strip()
    m = re.match(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})", str(a.get("seendate") or ""))
    if not title or not m:
        return None
    date = "%s-%s-%sT%s:%s:%s+00:00" % m.groups()
    lang = "de" if str(a.get("language") or "").lower().startswith("german") else "en"
    return mk_item(title, str(a.get("domain") or "").replace("www.", ""), date, a.get("url") or "", lang)


def gdelt_prefetch(universe):
    """Alle Werte gesammelt bei GDELT abfragen: mehrere Firmennamen je Anfrage, Zuordnung über den Titel."""
    by_name = {}
    for u in universe:
        n = short_name(u.get("name"), u["ticker"])
        if len(n) >= 3 and re.search(r"[A-Za-z]{3}", n):
            by_name.setdefault(n, []).append(u["ticker"])
    names = list(by_name)
    started, fails, done = time.time(), 0, 0
    for i in range(0, len(names), GDELT_GROUP):
        if time.time() - started > GDELT_BUDGET:
            print("GDELT: Zeitbudget erreicht nach %d von %d Namen" % (i, len(names)))
            break
        group = names[i:i + GDELT_GROUP]
        arts = None
        for attempt in range(2):
            try:
                arts = gdelt_query(group)
                fails = 0
                break
            except Exception as e:
                msg = str(e)
                print("GDELT Fehler (%s): %s" % (", ".join(group)[:80], msg[:120]))
                time.sleep(GDELT_PAUSE * (3 if "limit" in msg.lower() else 1))
        time.sleep(GDELT_PAUSE)
        if arts is None and len(group) > 1:
            # Ein Name kann die ganze Abfrage scheitern lassen (z. B. zu kurz) -> einzeln versuchen
            arts = []
            for n in group:
                try:
                    arts += gdelt_query([n])
                except Exception as e:
                    print("  GDELT %s: %s" % (n, str(e)[:80]))
                time.sleep(GDELT_PAUSE)
            if arts:
                fails = 0
        if arts is None:
            fails += 1
            if fails >= 5:
                print("GDELT nicht erreichbar – abgebrochen.")
                break
            continue
        keys = [(n, norm_words(n)) for n in group]
        for a in arts:
            it = gdelt_article(a)
            if not it:
                continue
            tw = norm_words(it["title"])
            for n, k in keys:
                if k in tw:
                    for t in by_name[n]:
                        lst = GDELT_ITEMS.setdefault(t, [])
                        if len(lst) < 15:
                            lst.append(it)
        done += len(group)
    print("GDELT: %d Namen abgefragt, Treffer für %d Werte" % (done, len(GDELT_ITEMS)))


def search_provider(fn, q_en, name, ticker, q_de=None):
    items = relevant(fn(q_en, "en"), name, ticker)
    if len(items) < GOOGLE_MIN:
        time.sleep(GOOGLE_PAUSE)
        items += relevant(fn(q_de or '"%s" Aktie' % name, "de"), name, ticker)
    return items


def fetch_items(u):
    """Schlagzeilen einer Aktie: Google News (en, ggf. de), sonst Yahoo."""
    global google_blocked, google_fail, bing_blocked, bing_fail
    t = u["ticker"]
    name = short_name(u.get("name"), t)
    items = []
    if t in ALERT_FEEDS:
        try:
            got = alert_feed(ALERT_FEEDS[t])
            items += got
            STATS["alerts"] += 1 if got else 0
        except Exception as e:
            print("Google-Alerts-Fehler", t, e)
    if GDELT_ITEMS.get(t):
        items += GDELT_ITEMS[t]
        STATS["gdelt"] += 1
    global google_retry_at
    if google_blocked and time.time() >= google_retry_at:
        google_blocked, google_fail = False, 2      # nach der Pause ein neuer Versuch; ein Fehler sperrt wieder
        print("Google News: neuer Versuch")
    if len(items) < 2 and not google_blocked:
        try:
            base = t.split(".")[0]
            q_en = '"%s" (stock OR shares OR %s)' % (name, base) if base.isalpha() and len(base) >= 2 else '"%s" (stock OR shares)' % name
            items += search_provider(google_news, q_en, name, t)
            google_fail = 0
            STATS["google"] += 1 if len(items) >= 2 else 0
        except Exception as e:
            google_fail += 1
            print("Google News Fehler", t, e)
            if google_fail >= 3:
                google_blocked = True
                google_retry_at = time.time() + 300
                print("Google News blockiert – 5 Minuten Bing bzw. Yahoo, dann neuer Versuch.")
        time.sleep(GOOGLE_PAUSE)
    if len(items) < 2 and not bing_blocked:
        try:
            items += search_provider(bing_news, "%s stock" % name, name, t, "%s Aktie" % name)
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
    load_alerts()
    gdelt_prefetch(universe)
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
    print("Quellen: Google Alerts %d, GDELT %d, Google %d, Bing %d, Rest Yahoo (von %d Werten)"
          % (STATS["alerts"], STATS["gdelt"], STATS["google"], STATS["bing"], len(index)))
    dump(os.path.join(NEWS, "_meta.json"), dict({"updatedAt": datetime.now(timezone.utc).isoformat(), "tickers": len(index)}, **STATS))

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


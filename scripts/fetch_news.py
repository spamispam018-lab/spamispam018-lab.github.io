"""Holt Nachrichten (yfinance) und bewertet Schlagzeilen mit FinBERT (kostenlos, läuft in der GitHub Action).
Schreibt data/news/<TICKER>.json, data/news/_index.json (Kurzwerte) und data/news/_sectors.json."""
import os, json, time, hashlib
from datetime import datetime, timezone
import yfinance as yf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
NEWS = os.path.join(DATA, "news")
MAX_ITEMS, TOP_PER_SECTOR, SECTOR_ITEMS = 8, 8, 12
SECTOR_ETFS = {"Technology": ["QDVE.DE", "XDWT.DE"], "Healthcare": ["WHEA.DE"], "Consumer Defensive": ["WSCA.DE"],
               "Financial Services": ["WFIS.DE"], "Real Estate": ["IUSP.DE"], "Energy": ["WNRG.DE"]}
_clf = None


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
        try:
            raw = [parse(x) for x in (yf.Ticker(t).news or [])]
        except Exception as e:
            print("Fehler", t, e)
            raw = []
        raw = sorted([r for r in raw if r], key=lambda r: r["date"], reverse=True)[:MAX_ITEMS]
        new = [r for r in raw if r["id"] not in old]
        for r, s in zip(new, score([r["title"] for r in new])):
            r.update(s)
        items = [old.get(r["id"]) or r for r in raw]
        by_ticker[t] = items
        dump(os.path.join(NEWS, t + ".json"), {"ticker": t, "updatedAt": datetime.now(timezone.utc).isoformat(), "items": items})
        sm = summary(items)
        index[t] = dict(sm, top=({"t": items[0]["title"], "l": items[0]["label"]} if items else None))
        time.sleep(0.2)
    dump(os.path.join(NEWS, "_index.json"), index)
    dump(os.path.join(NEWS, "_meta.json"), {"updatedAt": datetime.now(timezone.utc).isoformat(), "tickers": len(index)})

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


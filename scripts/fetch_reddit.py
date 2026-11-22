# scripts/fetch_reddit.py
import os, json, time
from datetime import datetime, timezone
import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT  = os.path.join(DATA, "news")

BASE = "https://apewisdom.io/api/v1.0/filter"
FILTERS = ["all-stocks", "wallstreetbets"]


def safe_int(v, default=0):
    """Robuste Umwandlung: None, '', 'None', nicht-numerische Strings -> default."""
    if v is None:
        return default
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def fetch_filter(filter_name):
    all_results = []
    page = 1
    while True:
        url = f"{BASE}/{filter_name}/page/{page}"
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        data = r.json()
        all_results.extend(data.get("results", []))
        if page >= data.get("pages", 1):
            break
        page += 1
        time.sleep(0.2)
    return all_results


def main():
    os.makedirs(OUT, exist_ok=True)
    combined = {}
    for f in FILTERS:
        for item in fetch_filter(f):
            t = (item.get("ticker") or "").upper()
            if not t:
                continue
            if t not in combined:
                combined[t] = {
                    "ticker": t,
                    "mentions": 0,
                    "upvotes": 0,
                    "mentions_24h_ago": 0,
                    "rank": None,
                }
            combined[t]["mentions"]         += safe_int(item.get("mentions"))
            combined[t]["upvotes"]          += safe_int(item.get("upvotes"))
            combined[t]["mentions_24h_ago"] += safe_int(item.get("mentions_24h_ago"))
            r = safe_int(item.get("rank"), default=None) if item.get("rank") is not None else None
            if r and (combined[t]["rank"] is None or r < combined[t]["rank"]):
                combined[t]["rank"] = r

    universe = json.load(open(os.path.join(DATA, "universe.json"), encoding="utf-8"))
    tickers = {u["ticker"].upper() for u in universe}

    updated = datetime.now(timezone.utc).isoformat()
    # Referenzwert für Buzz-Normalisierung (nur Ticker im Universum berücksichtigen)
    relevant = {t: d for t, d in combined.items() if t in tickers}
    max_mentions = max((d["mentions"] for d in relevant.values()), default=0) or 1

    for t, d in relevant.items():
        old = d["mentions_24h_ago"]
        d["change_pct"] = round((d["mentions"] - old) / old * 100, 1) if old else 0.0
        d["buzz"] = round(d["mentions"] / max_mentions, 3)
        dump_path = os.path.join(OUT, f"reddit_{t}.json")
        with open(dump_path, "w", encoding="utf-8") as fh:
            json.dump({"ticker": t, "updatedAt": updated, **d}, fh, ensure_ascii=False, indent=2)
        print("geschrieben:", dump_path)

    with open(os.path.join(OUT, "_reddit_index.json"), "w", encoding="utf-8") as fh:
        json.dump(relevant, fh, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
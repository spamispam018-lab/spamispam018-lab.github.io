# scripts/fetch_reddit.py
import os, json, time
from datetime import datetime, timezone
import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT  = os.path.join(DATA, "news")  # oder eigener Ordner data/reddit/

BASE = "https://apewisdom.io/api/v1.0/filter"
FILTERS = ["all-stocks", "wallstreetbets"]  # je nach Wunsch

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
        time.sleep(0.2)  # höflich bleiben
    return all_results

def main():
    os.makedirs(OUT, exist_ok=True)
    combined = {}  # ticker -> aggregierte Daten
    for f in FILTERS:
        for item in fetch_filter(f):
            t = item["ticker"].upper()
            if t not in combined:
                combined[t] = {
                    "ticker": t,
                    "mentions": 0,
                    "upvotes": 0,
                    "mentions_24h_ago": 0,
                    "rank": None,
                }
            # Mentions summieren (falls Ticker in mehreren Filtern auftaucht)
            combined[t]["mentions"] += int(item.get("mentions", 0))
            combined[t]["upvotes"]  += int(item.get("upvotes", 0))
            combined[t]["mentions_24h_ago"] += int(item.get("mentions_24h_ago", 0))
            # den besten (niedrigsten) Rang behalten
            r = item.get("rank")
            if r and (combined[t]["rank"] is None or r < combined[t]["rank"]):
                combined[t]["rank"] = r

    # Ausgabe: eine JSON pro Ticker (nur die, die im Universum vorkommen)
    universe = json.load(open(os.path.join(DATA, "universe.json"), encoding="utf-8"))
    tickers = {u["ticker"].upper() for u in universe}

    updated = datetime.now(timezone.utc).isoformat()
    for t, d in combined.items():
        if t not in tickers:
            continue
        # change_pct berechnen
        old = d["mentions_24h_ago"] or 1
        d["change_pct"] = round((d["mentions"] - old) / old * 100, 1) if old else 0
        # einfaches Buzz-Barometer: normalisierter Mentions-Wert (0–1)
        # (max. Mentions aus dem aktuellen Datensatz als Referenz)
        max_mentions = max(x["mentions"] for x in combined.values()) or 1
        d["buzz"] = round(d["mentions"] / max_mentions, 3)
        dump_path = os.path.join(OUT, f"reddit_{t}.json")
        with open(dump_path, "w", encoding="utf-8") as f:
            json.dump({"ticker": t, "updatedAt": updated, **d}, f, ensure_ascii=False, indent=2)
        print("geschrieben:", dump_path)

    # optionale Index-Datei für schnellen Zugriff
    with open(os.path.join(OUT, "_reddit_index.json"), "w", encoding="utf-8") as f:
        json.dump({t: combined[t] for t in combined if t in tickers}, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
# scripts/fetch_reddit.py
import os, json, time
from datetime import datetime, timezone
import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT  = os.path.join(DATA, "news")

APEWISDOM_BASE = "https://apewisdom.io/api/v1.0/filter"
FILTERS = ["all-stocks", "wallstreetbets"]
TRADESTIE_URL = "https://tradestie.com/api/v1/apps/reddit"

def safe_int(v, default=0):
    if v is None: return default
    try: return int(v)
    except (TypeError, ValueError): return default

def fetch_apewisdom():
    combined = {}
    for f in FILTERS:
        page = 1
        while True:
            try:
                r = requests.get(f"{APEWISDOM_BASE}/{f}/page/{page}", timeout=15)
                r.raise_for_status()
                data = r.json()
                for item in data.get("results", []):
                    t = (item.get("ticker") or "").upper()
                    if not t: continue
                    if t not in combined:
                        combined[t] = {"mentions": 0, "upvotes": 0, "mentions_24h_ago": 0, "rank": None}
                    combined[t]["mentions"] += safe_int(item.get("mentions"))
                    combined[t]["upvotes"] += safe_int(item.get("upvotes"))
                    combined[t]["mentions_24h_ago"] += safe_int(item.get("mentions_24h_ago"))
                    r_val = safe_int(item.get("rank"), default=None) if item.get("rank") is not None else None
                    if r_val and (combined[t]["rank"] is None or r_val < combined[t]["rank"]):
                        combined[t]["rank"] = r_val
                if page >= data.get("pages", 1):
                    break
                page += 1
                time.sleep(0.2)
            except Exception as e:
                print(f"ApeWisdom Fehler bei {f} Seite {page}:", e)
                break
    return combined

def fetch_tradestie():
    combined = {}
    try:
        r = requests.get(TRADESTIE_URL, timeout=15)
        r.raise_for_status()
        for item in r.json():
            t = (item.get("ticker") or "").upper()
            if t:
                combined[t] = {
                    "sentiment": item.get("sentiment"),
                    "sentiment_score": item.get("sentiment_score", 0.0),
                    "wsb_comments": safe_int(item.get("no_of_comments"))
                }
    except Exception as e:
        print("Tradestie Fehler:", e)
    return combined

def main():
    os.makedirs(OUT, exist_ok=True)
    
    print("Hole ApeWisdom...")
    ape_data = fetch_apewisdom()
    print("Hole Tradestie...")
    ts_data = fetch_tradestie()

    universe_path = os.path.join(DATA, "universe.json")
    if not os.path.exists(universe_path):
        print("universe.json nicht gefunden. Abbruch.")
        return
        
    universe = json.load(open(universe_path, encoding="utf-8"))
    tickers = {u["ticker"].upper() for u in universe}

    # Alle Ticker zusammenführen, die in mindestens einer Quelle vorkommen und im Universum sind
    all_tickers = (set(ape_data.keys()) | set(ts_data.keys())) & tickers
    
    # Max Mentions für Buzz-Normalisierung
    relevant_ape = {t: ape_data[t] for t in ape_data if t in tickers}
    max_mentions = max((d["mentions"] for d in relevant_ape.values()), default=0) or 1

    updated = datetime.now(timezone.utc).isoformat()
    relevant_out = {}

    for t in all_tickers:
        d = ape_data.get(t, {})
        ts = ts_data.get(t, {})
        
        mentions = d.get("mentions", 0)
        old_mentions = d.get("mentions_24h_ago", 0)
        change_pct = round((mentions - old_mentions) / old_mentions * 100, 1) if old_mentions else 0.0
        
        out = {
            "ticker": t,
            "updatedAt": updated,
            # ApeWisdom Daten
            "mentions": mentions,
            "upvotes": d.get("upvotes", 0),
            "rank": d.get("rank"),
            "change_pct": change_pct,
            "buzz": round(mentions / max_mentions, 3) if mentions else 0.0,
            # Tradestie Daten
            "sentiment": ts.get("sentiment"),
            "sentiment_score": ts.get("sentiment_score"),
            "wsb_comments": ts.get("wsb_comments", 0)
        }
        
        relevant_out[t] = out
        with open(os.path.join(OUT, f"reddit_{t}.json"), "w", encoding="utf-8") as fh:
            json.dump(out, fh, ensure_ascii=False, indent=2)
        print("geschrieben:", f"reddit_{t}.json")

    with open(os.path.join(OUT, "_reddit_index.json"), "w", encoding="utf-8") as fh:
        json.dump(relevant_out, fh, ensure_ascii=False, indent=2)
    print("Index geschrieben: _reddit_index.json")

if __name__ == "__main__":
    main()
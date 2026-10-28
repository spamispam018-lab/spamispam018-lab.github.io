#!/usr/bin/env python3
"""
scripts/fetch_stocks.py
Holt Kurs- und Fundamentaldaten fuer die Screener-Uebersichtsliste via yfinance,
aktualisiert data/stocks.json und stoesst bei Bedarf die Generierung der Detaildateien an.
"""

import os
import sys
import json
import time
from datetime import datetime
import yfinance as yf

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "stocks.json")

# Standard-Tickerliste fuer den Screener
DEFAULT_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B",
    "JNJ", "V", "WMT", "JPM", "PG", "MA", "UNH", "HD", "DIS", "BAC",
    "ADBE", "CRM", "NFLX", "AMD", "INTC", "CSCO", "SAP", "ASML"
]

def clean_val(val, decimals=4):
    if val is None:
        return None
    try:
        import numpy as np
        if np.isnan(val) or np.isinf(val):
            return None
    except Exception:
        pass
    if isinstance(val, (int, float)):
        return round(val, decimals)
    return str(val)

def fetch_screener_summary(tickers):
    print(f"Starte Abruf von {len(tickers)} Aktien fuer den Screener...")
    os.makedirs(DATA_DIR, exist_ok=True)
    results = []

    for idx, ticker in enumerate(tickers, start=1):
        sym = ticker.strip().upper()
        print(f"[{idx}/{len(tickers)}] Lade {sym}...")
        try:
            t = yf.Ticker(sym)
            info = t.info or {}

            price = clean_val(info.get("currentPrice") or info.get("regularMarketPrice"), 2)
            prev_close = clean_val(info.get("regularMarketPreviousClose") or info.get("previousClose"), 2)

            day_change = None
            if price is not None and prev_close is not None and prev_close > 0:
                day_change = clean_val(((price - prev_close) / prev_close) * 100, 2)
            elif info.get("regularMarketChangePercent") is not None:
                day_change = clean_val(info.get("regularMarketChangePercent"), 2)

            div_yield = info.get("dividendYield")
            if div_yield is not None:
                div_yield = clean_val(div_yield, 4)

            record = {
                "ticker": sym,
                "name": info.get("shortName") or info.get("longName") or sym,
                "sector": info.get("sector") or "-",
                "industry": info.get("industry") or "-",
                "currency": info.get("currency", "USD"),
                "price": price,
                "dayChange": day_change,
                "marketCap": clean_val(info.get("marketCap"), 0),
                "pe": clean_val(info.get("trailingPE"), 2),
                "forwardPE": clean_val(info.get("forwardPE"), 2),
                "priceToSales": clean_val(info.get("priceToSalesTrailing12Months"), 2),
                "priceToBook": clean_val(info.get("priceToBook"), 2),
                "dividendYield": div_yield,
                "beta": clean_val(info.get("beta"), 2),
                "fiftyTwoWeekLow": clean_val(info.get("fiftyTwoWeekLow"), 2),
                "fiftyTwoWeekHigh": clean_val(info.get("fiftyTwoWeekHigh"), 2)
            }
            results.append(record)
            time.sleep(0.5)
        except Exception as e:
            print(f"Fehler bei {sym}: {e}")

    payload = {
        "lastUpdated": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(results),
        "stocks": results
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"Erfolgreich {len(results)} Aktien in {OUTPUT_FILE} gespeichert.")

if __name__ == "__main__":
    ticker_args = sys.argv[1:] if len(sys.argv) > 1 else DEFAULT_TICKERS
    fetch_screener_summary(ticker_args)

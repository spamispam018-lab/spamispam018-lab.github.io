#!/usr/bin/env python3
"""
fetch_stock_details.py
Lädt erweiterte Detaildaten für jede Aktie aus data/stocks.json herunter
und speichert sie als einzelne JSON-Dateien in data/details/<SYMBOL>.json.
"""

import json
import os
import sys
import time
import yfinance as yf
import pandas as pd

# Pfade relativ zum Repo-Root
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STOCKS_FILE = os.path.join(ROOT_DIR, "data", "stocks.json")
DETAILS_DIR = os.path.join(ROOT_DIR, "data", "details")


def ensure_dir(path):
    """Erstellt das Verzeichnis, falls es nicht existiert, inklusive .gitkeep."""
    os.makedirs(path, exist_ok=True)
    gitkeep_path = os.path.join(path, ".gitkeep")
    if not os.path.exists(gitkeep_path):
        with open(gitkeep_path, "w", encoding="utf-8") as f:
            f.write("")


def fetch_ticker_with_retry(symbol, retries=3, delay=2):
    """Holt Ticker-Daten mit Wiederholungsversuchen."""
    for attempt in range(retries):
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            if info and isinstance(info, dict) and len(info) > 5:
                return ticker, info
        except Exception as e:
            print(f"  [Warnung] Versuch {attempt + 1}/{retries} für {symbol} fehlgeschlagen: {e}")
        if attempt < retries - 1:
            time.sleep(delay)
    return None, None


def extract_analyst_ratings(ticker, info):
    """Extrahiert Analysten-Bewertungen, Kursziele und Historie robust."""
    ratings = {
        "consensus": None,
        "targetLow": None,
        "targetMean": None,
        "targetHigh": None,
        "numberOfAnalysts": None,
        "buy": 0,
        "hold": 0,
        "sell": 0,
        "history": []
    }

    try:
        ratings["consensus"] = info.get("recommendationKey")
    except Exception:
        pass

    try:
        ratings["targetLow"] = info.get("targetLowPrice")
        ratings["targetMean"] = info.get("targetMeanPrice")
        ratings["targetHigh"] = info.get("targetHighPrice")
        ratings["numberOfAnalysts"] = info.get("numberOfAnalystOpinions")
    except Exception:
        pass

    # Aktuelle Empfehlungen (strongBuy, buy, hold, sell, strongSell)
    try:
        recs = ticker.recommendations
        if recs is not None and not recs.empty:
            latest = recs.iloc[0] if isinstance(recs, pd.DataFrame) else recs
            strong_buy = int(latest.get("strongBuy", 0) or 0)
            buy = int(latest.get("buy", 0) or 0)
            hold = int(latest.get("hold", 0) or 0)
            sell = int(latest.get("sell", 0) or 0)
            strong_sell = int(latest.get("strongSell", 0) or 0)

            ratings["buy"] = strong_buy + buy
            ratings["hold"] = hold
            ratings["sell"] = sell + strong_sell
    except Exception as e:
        print(f"    - Fehler beim Lesen von recommendations: {e}")

    # Historie der Upgrades / Downgrades (die letzten 10)
    try:
        upgrades = ticker.upgrades_downgrades
        if upgrades is not None and not upgrades.empty:
            # Neueste Einträge zuerst nehmen
            top10 = upgrades.head(10)
            history = []
            for idx, row in top10.iterrows():
                try:
                    date_val = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
                    history.append({
                        "date": date_val,
                        "firm": str(row.get("Firm", "")),
                        "toGrade": str(row.get("ToGrade", row.get("toGrade", "")))
                    })
                except Exception:
                    continue
            ratings["history"] = history
    except Exception as e:
        print(f"    - Fehler beim Lesen von upgrades_downgrades: {e}")

    return ratings


def extract_financials(ticker, info):
    """Extrahiert Kennzahlen und Finanzreihen."""
    data = {
        "revenue": [],
        "earnings": [],
        "freeCashFlow": [],
        "operatingCashFlow": [],
        "margins": {
            "gross": info.get("grossMargins"),
            "operating": info.get("operatingMargins"),
            "net": info.get("profitMargins")
        },
        "ratios": {
            "pe": info.get("trailingPE"),
            "fwdPe": info.get("forwardPE"),
            "ps": info.get("priceToSalesTrailing12Months"),
            "pb": info.get("priceToBook"),
            "evEbitda": info.get("enterpriseToEbitda"),
            "debtToEquity": info.get("debtToEquity"),
            "currentRatio": info.get("currentRatio"),
            "quickRatio": info.get("quickRatio"),
            "roe": info.get("returnOnEquity"),
            "roa": info.get("returnOnAssets"),
            "dividendYield": info.get("dividendYield"),
            "payoutRatio": info.get("payoutRatio")
        }
    }

    try:
        fin = ticker.financials
        if fin is not None and not fin.empty:
            for col in fin.columns[:5]:
                year_str = col.strftime("%Y") if hasattr(col, "strftime") else str(col)[:4]
                try:
                    rev = fin.loc["Total Revenue", col] if "Total Revenue" in fin.index else None
                    if rev is not None and pd.notna(rev):
                        data["revenue"].append({"year": year_str, "value": float(rev)})
                except Exception:
                    pass
                try:
                    net_inc = fin.loc["Net Income", col] if "Net Income" in fin.index else None
                    if net_inc is not None and pd.notna(net_inc):
                        data["earnings"].append({"year": year_str, "value": float(net_inc)})
                except Exception:
                    pass
    except Exception as e:
        print(f"    - Fehler beim Lesen von financials: {e}")

    try:
        cf = ticker.cashflow
        if cf is not None and not cf.empty:
            for col in cf.columns[:5]:
                year_str = col.strftime("%Y") if hasattr(col, "strftime") else str(col)[:4]
                try:
                    fcf = cf.loc["Free Cash Flow", col] if "Free Cash Flow" in cf.index else None
                    if fcf is not None and pd.notna(fcf):
                        data["freeCashFlow"].append({"year": year_str, "value": float(fcf)})
                except Exception:
                    pass
                try:
                    ocf = cf.loc["Operating Cash Flow", col] if "Operating Cash Flow" in cf.index else None
                    if ocf is not None and pd.notna(ocf):
                        data["operatingCashFlow"].append({"year": year_str, "value": float(ocf)})
                except Exception:
                    pass
    except Exception as e:
        print(f"    - Fehler beim Lesen von cashflow: {e}")

    return data


def extract_insider_transactions(ticker):
    """Extrahiert die letzten Insider-Transaktionen."""
    transactions = []
    try:
        insiders = ticker.insider_transactions
        if insiders is not None and not insiders.empty:
            for _, row in insiders.head(10).iterrows():
                try:
                    d_val = row.get("Start Date") or row.get("Date")
                    date_str = d_val.strftime("%Y-%m-%d") if hasattr(d_val, "strftime") else str(d_val)[:10]
                    shares = row.get("Shares")
                    transactions.append({
                        "date": date_str,
                        "insider": str(row.get("Insider", "")),
                        "position": str(row.get("Position", row.get("Text", ""))),
                        "transaction": str(row.get("Transaction", "")),
                        "shares": int(shares) if pd.notna(shares) else None,
                        "value": float(row.get("Value")) if pd.notna(row.get("Value")) else None
                    })
                except Exception:
                    continue
    except Exception as e:
        print(f"    - Fehler beim Lesen von insider_transactions: {e}")
    return transactions


def process_stock(stock_entry):
    symbol = stock_entry.get("symbol")
    if not symbol:
        return

    clean_symbol = symbol.upper().strip()
    out_file = os.path.join(DETAILS_DIR, f"{clean_symbol}.json")

    print(f"Verarbeite Detaildaten für {clean_symbol}...")
    ticker, info = fetch_ticker_with_retry(clean_symbol)

    if not info:
        print(f"  [Übersprungen] Keine gültigen Daten für {clean_symbol} erhalten.")
        if os.path.exists(out_file):
            print(f"  -> Bestehende Datei {out_file} bleibt unberührt.")
        return

    analyst_ratings = extract_analyst_ratings(ticker, info)
    financials = extract_financials(ticker, info)
    insider_tx = extract_insider_transactions(ticker)

    stock_detail = {
        "symbol": clean_symbol,
        "name": info.get("shortName") or stock_entry.get("name") or clean_symbol,
        "sector": info.get("sector") or stock_entry.get("sector"),
        "industry": info.get("industry") or stock_entry.get("industry"),
        "description": info.get("longBusinessSummary", ""),
        "website": info.get("website", ""),
        "employees": info.get("fullTimeEmployees", 0),
        "marketCap": info.get("marketCap") or stock_entry.get("marketCap"),
        "price": info.get("currentPrice") or stock_entry.get("price"),
        "financials": financials,
        "analystRatings": analyst_ratings,
        "insiderTransactions": insider_tx
    }

    try:
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(stock_detail, f, indent=2, ensure_ascii=False)
        print(f"  -> Gespeichert: {out_file}")
    except Exception as e:
        print(f"  [Fehler] Konnte {out_file} nicht schreiben: {e}")


def main():
    ensure_dir(DETAILS_DIR)

    if not os.path.exists(STOCKS_FILE):
        print(f"Fehler: {STOCKS_FILE} nicht gefunden!")
        sys.exit(1)

    with open(STOCKS_FILE, "r", encoding="utf-8") as f:
        stocks = json.load(f)

    print(f"Starte Detail-Download für {len(stocks)} Aktien...")
    for entry in stocks:
        process_stock(entry)
        time.sleep(1)  # Kurze Pause, um API-Ratenlimits zu vermeiden

    print("Verarbeitung abgeschlossen.")


if __name__ == "__main__":
    main()

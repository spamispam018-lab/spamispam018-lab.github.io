import os
import json
import time
import logging
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

try:
    import yfinance as yf
    import pandas as pd
except ImportError:
    logging.error("Erforderliche Bibliotheken fehlen. Bitte 'pip install yfinance pandas' ausführen.")
    raise

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
DETAILS_DIR = os.path.join(DATA_DIR, "details")
STOCKS_FILE = os.path.join(DATA_DIR, "stocks.json")

def sanitize_value(val):
    if pd.isna(val) or val is None:
        return None
    if isinstance(val, (int, float)):
        return round(float(val), 4)
    return str(val)

def dataframe_to_clean_dict(df):
    if df is None or df.empty:
        return {}
    
    clean_dict = {}
    try:
        # Konvertiere Index & Spalten (normalerweise Datumsstempel) in saubere Strings
        df_copy = df.copy()
        for col in df_copy.columns:
            col_name = str(col)[:10] if hasattr(col, "strftime") else str(col)
            clean_dict[col_name] = {}
            for idx in df_copy.index:
                idx_name = str(idx).replace(" ", "_")
                val = df_copy.loc[idx, col]
                clean_dict[col_name][idx_name] = sanitize_value(val)
    except Exception as e:
        logging.warning(f"Fehler bei DataFrame-Konvertierung: {e}")
    return clean_dict

def fetch_details_for_ticker(symbol):
    logging.info(f"Hole Detaildaten für: {symbol}")
    ticker = yf.Ticker(symbol)
    
    try:
        info = ticker.info or {}
    except Exception as e:
        logging.error(f"Konnte Info für {symbol} nicht laden: {e}")
        return None

    # Historische Finanzberichte
    try:
        income_stmt = dataframe_to_clean_dict(ticker.financials)
        balance_sheet = dataframe_to_clean_dict(ticker.balance_sheet)
        cashflow = dataframe_to_clean_dict(ticker.cashflow)
    except Exception as e:
        logging.warning(f"Fehler beim Laden der Finanzberichte für {symbol}: {e}")
        income_stmt, balance_sheet, cashflow = {}, {}, {}

    # Analysten-Empfehlungen
    recommendations = []
    try:
        recs = ticker.recommendations
        if recs is not None and not recs.empty:
            recs_tail = recs.tail(10).reset_index()
            for _, row in recs_tail.iterrows():
                rec_item = {}
                for k, v in row.items():
                    key = str(k)[:10] if hasattr(k, "strftime") else str(k)
                    rec_item[key] = sanitize_value(v)
                recommendations.append(rec_item)
    except Exception as e:
        logging.warning(f"Empfehlungen für {symbol} nicht verfügbar: {e}")

    # Historischer Kursverlauf (letzte 12 Monate für Charts)
    history_data = []
    try:
        hist = ticker.history(period="1y")
        if hist is not None and not hist.empty:
            for idx, row in hist.iterrows():
                date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
                history_data.append({
                    "date": date_str,
                    "close": sanitize_value(row.get("Close")),
                    "volume": sanitize_value(row.get("Volume"))
                })
    except Exception as e:
        logging.warning(f"Historie für {symbol} konnte nicht geladen werden: {e}")

    details = {
        "symbol": symbol,
        "name": info.get("shortName") or info.get("longName") or symbol,
        "description": info.get("longBusinessSummary", ""),
        "sector": info.get("sector", "N/A"),
        "industry": info.get("industry", "N/A"),
        "website": info.get("website", ""),
        "country": info.get("country", ""),
        "employees": info.get("fullTimeEmployees", None),
        "valuation": {
            "marketCap": sanitize_value(info.get("marketCap")),
            "enterpriseValue": sanitize_value(info.get("enterpriseValue")),
            "trailingPE": sanitize_value(info.get("trailingPE")),
            "forwardPE": sanitize_value(info.get("forwardPE")),
            "pegRatio": sanitize_value(info.get("pegRatio")),
            "priceToBook": sanitize_value(info.get("priceToBook")),
            "evToEbitda": sanitize_value(info.get("enterpriseToEbitda"))
        },
        "financials": {
            "incomeStatement": income_stmt,
            "balanceSheet": balance_sheet,
            "cashflow": cashflow
        },
        "recommendations": recommendations,
        "history": history_data,
        "lastUpdated": datetime.utcnow().isoformat() + "Z"
    }

    return details

def main():
    os.makedirs(DETAILS_DIR, exist_ok=True)

    symbols = []
    if os.path.exists(STOCKS_FILE):
        try:
            with open(STOCKS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                symbols = [item["symbol"] for item in data.get("stocks", []) if "symbol" in item]
        except Exception as e:
            logging.error(f"Fehler beim Lesen von {STOCKS_FILE}: {e}")

    # Fallback-Liste, falls stocks.json noch nicht generiert wurde
    if not symbols:
        symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]

    for symbol in symbols:
        data = fetch_details_for_ticker(symbol)
        if data:
            filepath = os.path.join(DETAILS_DIR, f"{symbol}.json")
            temp_filepath = filepath + ".tmp"
            with open(temp_filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            os.replace(temp_filepath, filepath)
            logging.info(f"Gespeichert: {filepath}")
        time.sleep(1.0)  # Schonung der Endpunkte

if __name__ == "__main__":
    main()

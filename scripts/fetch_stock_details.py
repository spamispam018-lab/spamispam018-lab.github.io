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

# Alle 20 Standard-Ticker aus fetch_stocks.py als robuster Fallback
FALLBACK_TICKER_ITEMS = [
    {"symbol": "AAPL", "fullTicker": "AAPL"},
    {"symbol": "MSFT", "fullTicker": "MSFT"},
    {"symbol": "GOOGL", "fullTicker": "GOOGL"},
    {"symbol": "AMZN", "fullTicker": "AMZN"},
    {"symbol": "NVDA", "fullTicker": "NVDA"},
    {"symbol": "META", "fullTicker": "META"},
    {"symbol": "TSLA", "fullTicker": "TSLA"},
    {"symbol": "SAP", "fullTicker": "SAP.DE"},
    {"symbol": "ALV", "fullTicker": "ALV.DE"},
    {"symbol": "BMW", "fullTicker": "BMW.DE"},
    {"symbol": "SIE", "fullTicker": "SIE.DE"},
    {"symbol": "MBG", "fullTicker": "MBG.DE"},
    {"symbol": "DTE", "fullTicker": "DTE.DE"},
    {"symbol": "JNJ", "fullTicker": "JNJ"},
    {"symbol": "PG", "fullTicker": "PG"},
    {"symbol": "KO", "fullTicker": "KO"},
    {"symbol": "PEP", "fullTicker": "PEP"},
    {"symbol": "V", "fullTicker": "V"},
    {"symbol": "MA", "fullTicker": "MA"},
    {"symbol": "UNH", "fullTicker": "UNH"}
]

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

def fetch_details_for_ticker(full_ticker, clean_symbol):
    logging.info(f"Hole Detaildaten für: {full_ticker} (Symbol: {clean_symbol})")
    ticker = yf.Ticker(full_ticker)
    
    try:
        info = ticker.info or {}
    except Exception as e:
        logging.error(f"Konnte Info für {full_ticker} nicht laden: {e}")
        return None

    # Kurs und prozentuale Tagesveränderung
    price = info.get("currentPrice") or info.get("regularMarketPrice") or 0.0
    previous_close = info.get("previousClose") or info.get("regularMarketPreviousClose") or price
    
    change_percent = 0.0
    if previous_close and previous_close > 0 and price:
        change_percent = round(((price - previous_close) / previous_close) * 100, 2)

    # Dividendenrendite (yfinance liefert bereits den Prozentwert)
    div_rate = info.get("dividendYield")
    div_yield = round(float(div_rate), 2) if div_rate is not None else 0.0

    # Historische Finanzberichte
    try:
        income_stmt = dataframe_to_clean_dict(ticker.financials)
        balance_sheet = dataframe_to_clean_dict(ticker.balance_sheet)
        cashflow = dataframe_to_clean_dict(ticker.cashflow)
    except Exception as e:
        logging.warning(f"Fehler beim Laden der Finanzberichte für {full_ticker}: {e}")
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
        logging.warning(f"Empfehlungen für {full_ticker} nicht verfügbar: {e}")

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
        logging.warning(f"Historie für {full_ticker} konnte nicht geladen werden: {e}")

    details = {
        "symbol": clean_symbol,
        "fullTicker": full_ticker,
        "name": info.get("shortName") or info.get("longName") or clean_symbol,
        "price": round(float(price), 2) if price else 0.0,
        "changePercent": change_percent,
        "currency": info.get("currency", "EUR"),
        "dividendYield": div_yield,
        "marketCap": info.get("marketCap") or 0,
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

def ensure_gitkeep():
    gitkeep_file = os.path.join(DETAILS_DIR, ".gitkeep")
    if not os.path.exists(gitkeep_file):
        with open(gitkeep_file, "w", encoding="utf-8") as f:
            f.write("")
        logging.info("Angelegt: data/details/.gitkeep")

def main():
    os.makedirs(DETAILS_DIR, exist_ok=True)
    ensure_gitkeep()

    items = []
    if os.path.exists(STOCKS_FILE):
        try:
            with open(STOCKS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                # stocks.json ist eine LISTE von Objekten
                if isinstance(data, list):
                    for item in data:
                        sym = item.get("symbol")
                        full = item.get("fullTicker") or sym
                        if sym:
                            items.append({"symbol": sym, "fullTicker": full})
                elif isinstance(data, dict):
                    stock_list = data.get("stocks", [])
                    for item in stock_list:
                        sym = item.get("symbol")
                        full = item.get("fullTicker") or sym
                        if sym:
                            items.append({"symbol": sym, "fullTicker": full})
        except Exception as e:
            logging.error(f"Fehler beim Lesen von {STOCKS_FILE}: {e}")

    # Fallback auf alle 20 Standard-Ticker
    if not items:
        logging.info("Verwende Fallback-Liste für Ticker.")
        items = FALLBACK_TICKER_ITEMS

    for item in items:
        clean_symbol = item["symbol"]
        full_ticker = item.get("fullTicker") or clean_symbol
        data = fetch_details_for_ticker(full_ticker, clean_symbol)
        if data:
            filepath = os.path.join(DETAILS_DIR, f"{clean_symbol}.json")
            temp_filepath = filepath + ".tmp"
            with open(temp_filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            os.replace(temp_filepath, filepath)
            logging.info(f"Gespeichert: {filepath}")
        time.sleep(1.0)

if __name__ == "__main__":
    main()

import os
import json
import time
import logging
from datetime import datetime

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

try:
    import yfinance as yf
except ImportError:
    logging.error("yfinance ist nicht installiert. Bitte 'pip install yfinance' ausführen.")
    raise

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "stocks.json")

# Standard-Liste relevanter Ticker (kann bei Bedarf erweitert werden)
TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
    "BRK-B", "JNJ", "V", "WMT", "JPM", "PG", "MA", "UNH",
    "HD", "DIS", "BAC", "VZ", "KO", "PFE", "CSCO", "INTC", "SAP"
]

def safe_float(val, default=0.0):
    try:
        if val is None:
            return default
        return round(float(val), 2)
    except (ValueError, TypeError):
        return default

def fetch_stock_overview(ticker_symbol):
    logging.info(f"Hole Daten für Ticker: {ticker_symbol}")
    try:
        ticker = yf.Ticker(ticker_symbol)
        info = ticker.info or {}

        # Fallback auf 'fast_info', falls 'info' leer oder limitiert ist
        fast_info = getattr(ticker, "fast_info", {})
        price = safe_float(
            info.get("currentPrice") or info.get("regularMarketPrice") or getattr(fast_info, "last_price", 0.0)
        )
        prev_close = safe_float(
            info.get("previousClose") or info.get("regularMarketPreviousClose") or getattr(fast_info, "previous_close", price)
        )
        
        change_pct = 0.0
        if prev_close > 0:
            change_pct = round(((price - prev_close) / prev_close) * 100, 2)

        data = {
            "symbol": ticker_symbol,
            "name": info.get("shortName") or info.get("longName") or ticker_symbol,
            "sector": info.get("sector", "N/A"),
            "industry": info.get("industry", "N/A"),
            "price": price,
            "change": round(price - prev_close, 2),
            "changePercent": change_pct,
            "marketCap": info.get("marketCap") or getattr(fast_info, "market_cap", 0),
            "peRatio": safe_float(info.get("trailingPE"), None),
            "forwardPE": safe_float(info.get("forwardPE"), None),
            "dividendYield": safe_float(info.get("dividendYield", 0) * 100 if info.get("dividendYield") else 0, 2),
            "fiftyTwoWeekHigh": safe_float(info.get("fiftyTwoWeekHigh") or getattr(fast_info, "year_high", 0.0)),
            "fiftyTwoWeekLow": safe_float(info.get("fiftyTwoWeekLow") or getattr(fast_info, "year_low", 0.0)),
            "volume": info.get("regularMarketVolume") or getattr(fast_info, "last_volume", 0),
            "currency": info.get("currency", "USD"),
            "lastUpdated": datetime.utcnow().isoformat() + "Z"
        }
        return data
    except Exception as e:
        logging.warning(f"Fehler beim Abrufen von {ticker_symbol}: {e}")
        return None

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    results = []

    for symbol in TICKERS:
        stock_data = fetch_stock_overview(symbol)
        if stock_data:
            results.append(stock_data)
        # Kurze Pause zur Vermeidung von Rate-Limits
        time.sleep(0.5)

    if not results:
        logging.error("Keine Aktiendaten abgerufen. Vorgang abgebrochen.")
        return

    # Atomares Schreiben, um unvollständige Dateien zu verhindern
    temp_file = OUTPUT_FILE + ".tmp"
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump({"stocks": results, "updatedAt": datetime.utcnow().isoformat() + "Z"}, f, indent=2, ensure_ascii=False)
    
    os.replace(temp_file, OUTPUT_FILE)
    logging.info(f"Erfolgreich {len(results)} Aktien in {OUTPUT_FILE} gespeichert.")

if __name__ == "__main__":
    main()

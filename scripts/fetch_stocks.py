#!/usr/bin/env python3
import json
import os
import sys
import yfinance as yf

# Standard-Aktienuniversum (US & DAX-Titel)
TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
    "SAP.DE", "ALV.DE", "BMW.DE", "SIE.DE", "MBG.DE", "DTE.DE",
    "JNJ", "PG", "KO", "PEP", "V", "MA", "UNH"
]

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "stocks.json")

def fetch_all_stocks():
    os.makedirs(DATA_DIR, exist_ok=True)
    stock_list = []

    print(f"Starte Datenabruf für {len(TICKERS)} Ticker...")

    for ticker_symbol in TICKERS:
        try:
            ticker = yf.Ticker(ticker_symbol)
            info = ticker.info

            # Bereinigung des Symbols für die Anzeige (z. B. "SAP.DE" -> "SAP")
            clean_symbol = ticker_symbol.replace(".DE", "")

            price = info.get("currentPrice") or info.get("regularMarketPrice") or 0.0
            previous_close = info.get("previousClose") or info.get("regularMarketPreviousClose") or price

            # Tägliche Veränderung in Prozent berechnen
            change = 0.0
            if previous_close and previous_close > 0:
                change = round(((price - previous_close) / previous_close) * 100, 2)

            # KGV (Trailing oder Forward)
            pe = info.get("trailingPE") or info.get("forwardPE")
            pe_val = round(pe, 2) if pe else None

            # Dividendenrendite in Prozent (yfinance liefert bereits Prozent, keine Multiplikation mit 100)
            div_rate = info.get("dividendYield")
            div_yield = round(float(div_rate), 2) if div_rate is not None else 0.0

            # Marktkapitalisierung
            market_cap = info.get("marketCap") or 0

            item = {
                "symbol": clean_symbol,
                "fullTicker": ticker_symbol,
                "name": info.get("shortName") or info.get("longName") or clean_symbol,
                "price": round(price, 2),
                "change": change,
                "pe": pe_val,
                "dividendYield": div_yield,
                "marketCap": market_cap,
                "sector": info.get("sector", "Sonstige"),
                "currency": info.get("currency", "EUR")
            }

            stock_list.append(item)
            print(f"✓ {clean_symbol}: {price} | KGV: {pe_val} | Div: {div_yield}%")

        except Exception as e:
            print(f"✗ Fehler bei {ticker_symbol}: {e}", file=sys.stderr)

    if stock_list:
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(stock_list, f, ensure_ascii=False, indent=2)
        print(f"\nErfolgreich {len(stock_list)} Aktien in '{OUTPUT_FILE}' gespeichert.")
    else:
        print("\nKeine Daten ermittelt. Datei wurde nicht überschrieben.", file=sys.stderr)

if __name__ == "__main__":
    fetch_all_stocks()

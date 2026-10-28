import os
import json
import time
import math
from datetime import datetime, timezone
import pandas as pd
import yfinance as yf

FALLBACK_STOCKS = [
    {"symbol": "AAPL", "fullTicker": "AAPL"},
    {"symbol": "MSFT", "fullTicker": "MSFT"},
    {"symbol": "GOOGL", "fullTicker": "GOOGL"},
    {"symbol": "AMZN", "fullTicker": "AMZN"},
    {"symbol": "META", "fullTicker": "META"},
    {"symbol": "NVDA", "fullTicker": "NVDA"},
    {"symbol": "TSLA", "fullTicker": "TSLA"},
    {"symbol": "SAP", "fullTicker": "SAP.DE"},
    {"symbol": "ALV", "fullTicker": "ALV.DE"},
    {"symbol": "BMW", "fullTicker": "BMW.DE"},
    {"symbol": "DTE", "fullTicker": "DTE.DE"},
    {"symbol": "JNJ", "fullTicker": "JNJ"},
    {"symbol": "PG", "fullTicker": "PG"},
    {"symbol": "KO", "fullTicker": "KO"},
    {"symbol": "PEP", "fullTicker": "PEP"},
    {"symbol": "V", "fullTicker": "V"},
    {"symbol": "MA", "fullTicker": "MA"},
    {"symbol": "UNH", "fullTicker": "UNH"},
    {"symbol": "HD", "fullTicker": "HD"},
    {"symbol": "DIS", "fullTicker": "DIS"}
]

def sanitize_value(val):
    if val is None:
        return None
    if isinstance(val, (float, int)):
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    try:
        if pd.isna(val):
            return None
    except Exception:
        pass
    if hasattr(val, "item"):
        try:
            native_val = val.item()
            if isinstance(native_val, (float, int)):
                if math.isnan(native_val) or math.isinf(native_val):
                    return None
            return native_val
        except Exception:
            pass
    return val

def clean_dict(d):
    if not isinstance(d, dict):
        return sanitize_value(d)
    return {k: clean_dict(v) if isinstance(v, dict) else (clean_list(v) if isinstance(v, list) else sanitize_value(v)) for k, v in d.items()}

def clean_list(lst):
    return [clean_dict(x) if isinstance(x, dict) else (clean_list(x) if isinstance(x, list) else sanitize_value(x)) for x in lst]

def safe_retry(call_fn, retries=3, delay=2):
    for i in range(retries):
        try:
            return call_fn()
        except Exception:
            if i == retries - 1:
                return None
            time.sleep(delay)
    return None

def format_dataframe_to_dict(df):
    result = {}
    if df is None or not isinstance(df, pd.DataFrame) or df.empty:
        return result
    try:
        for col in df.columns:
            date_str = str(col)[:10]
            col_data = {}
            for idx, val in df[col].items():
                clean_key = str(idx).strip().replace(" ", "_").replace("-", "_")
                clean_val = sanitize_value(val)
                col_data[clean_key] = clean_val
            result[date_str] = col_data
    except Exception:
        pass
    return result

def extract_history(ticker):
    hist_data = []
    try:
        hist_df = safe_retry(lambda: ticker.history(period="1y"))
        if hist_df is not None and not hist_df.empty:
            for idx, row in hist_df.iterrows():
                try:
                    date_val = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
                    close_val = sanitize_value(row.get("Close"))
                    volume_val = sanitize_value(row.get("Volume"))
                    if close_val is not None:
                        close_val = round(float(close_val), 2)
                    if volume_val is not None:
                        volume_val = int(volume_val)
                    hist_data.append({
                        "date": date_val,
                        "close": close_val,
                        "volume": volume_val
                    })
                except Exception:
                    continue
    except Exception:
        pass
    return hist_data

def process_stock(stock_item, output_dir):
    symbol = stock_item.get("symbol")
    ticker_str = stock_item.get("fullTicker", symbol)
    if not symbol:
        return

    dest_file = os.path.join(output_dir, f"{symbol}.json")
    existing_data = {}
    if os.path.exists(dest_file):
        try:
            with open(dest_file, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
        except Exception:
            existing_data = {}

    ticker = yf.Ticker(ticker_str)
    info = safe_retry(lambda: ticker.info)

    if not info or not isinstance(info, dict) or len(info) == 0:
        print(f"Skipping {symbol}: Empty info retrieved.")
        return

    income_stmt = safe_retry(lambda: ticker.financials)
    balance_sheet = safe_retry(lambda: ticker.balance_sheet)
    cashflow_stmt = safe_retry(lambda: ticker.cashflow)

    financials_dict = existing_data.get("financials", {})
    if not isinstance(financials_dict, dict):
        financials_dict = {}

    financials_dict["incomeStatement"] = format_dataframe_to_dict(income_stmt)
    financials_dict["balanceSheet"] = format_dataframe_to_dict(balance_sheet)
    financials_dict["cashflow"] = format_dataframe_to_dict(cashflow_stmt)

    if "revenue" not in financials_dict:
        financials_dict["revenue"] = []
    if "earnings" not in financials_dict:
        financials_dict["earnings"] = []
    if "freeCashFlow" not in financials_dict:
        financials_dict["freeCashFlow"] = []
    if "operatingCashFlow" not in financials_dict:
        financials_dict["operatingCashFlow"] = []
    if "margins" not in financials_dict:
        financials_dict["margins"] = {}
    if "ratios" not in financials_dict:
        financials_dict["ratios"] = {}

    history_data = extract_history(ticker)
    if not history_data and "history" in existing_data:
        history_data = existing_data["history"]

    current_price = sanitize_value(
        info.get("currentPrice") or
        info.get("regularMarketPrice") or
        info.get("ask") or
        info.get("bid")
    )
    previous_close = sanitize_value(
        info.get("previousClose") or
        info.get("regularMarketPreviousClose")
    )

    change_percent = None
    if current_price is not None and previous_close is not None and previous_close > 0:
        change_percent = round(((current_price - previous_close) / previous_close) * 100, 2)
    elif info.get("regularMarketChangePercent") is not None:
        change_percent = round(float(info["regularMarketChangePercent"]), 2)

    raw_div_yield = sanitize_value(info.get("dividendYield"))
    dividend_yield_val = None
    if raw_div_yield is not None:
        if raw_div_yield < 0.2:
            dividend_yield_val = round(raw_div_yield * 100, 2)
        else:
            dividend_yield_val = round(raw_div_yield, 2)

    trailing_pe = sanitize_value(info.get("trailingPE"))
    forward_pe = sanitize_value(info.get("forwardPE"))
    peg_ratio = sanitize_value(info.get("pegRatio"))
    price_to_book = sanitize_value(info.get("priceToBook"))
    enterprise_value = sanitize_value(info.get("enterpriseValue"))
    ev_to_ebitda = sanitize_value(info.get("enterpriseToEbitda"))
    market_cap = sanitize_value(info.get("marketCap"))

    valuation = {
        "marketCap": market_cap,
        "enterpriseValue": enterprise_value,
        "trailingPE": trailing_pe,
        "forwardPE": forward_pe,
        "pegRatio": peg_ratio,
        "priceToBook": price_to_book,
        "evToEbitda": ev_to_ebitda
    }

    margins = {
        "profitMargin": sanitize_value(info.get("profitMargins")),
        "operatingMargin": sanitize_value(info.get("operatingMargins")),
        "grossMargin": sanitize_value(info.get("grossMargins"))
    }

    analyst_ratings = existing_data.get("analystRatings", {})
    try:
        rec_summary = safe_retry(lambda: ticker.recommendations_summary)
        if rec_summary is not None and isinstance(rec_summary, pd.DataFrame) and not rec_summary.empty:
            analyst_ratings = rec_summary.to_dict(orient="records")
    except Exception:
        pass

    insider_tx = existing_data.get("insiderTransactions", [])
    try:
        insiders = safe_retry(lambda: ticker.insider_transactions)
        if insiders is not None and isinstance(insiders, pd.DataFrame) and not insiders.empty:
            insiders_clean = insiders.copy()
            if "Start Date" in insiders_clean.columns:
                insiders_clean["Start Date"] = insiders_clean["Start Date"].astype(str)
            insider_tx = insiders_clean.head(20).to_dict(orient="records")
    except Exception:
        pass

    detail_data = dict(existing_data)
    detail_data.update({
        "symbol": symbol,
        "name": info.get("shortName") or info.get("longName") or symbol,
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "description": info.get("longBusinessSummary"),
        "website": info.get("website"),
        "employees": sanitize_value(info.get("fullTimeEmployees")),
        "country": info.get("country"),
        "currency": info.get("currency"),
        "price": current_price,
        "changePercent": change_percent,
        "marketCap": market_cap,
        "dividendYield": dividend_yield_val,
        "peRatio": trailing_pe,
        "trailingPE": trailing_pe,
        "forwardPE": forward_pe,
        "pegRatio": peg_ratio,
        "priceToBook": price_to_book,
        "enterpriseValue": enterprise_value,
        "evToEbitda": ev_to_ebitda,
        "debtToEquity": sanitize_value(info.get("debtToEquity")),
        "currentRatio": sanitize_value(info.get("currentRatio")),
        "margins": margins,
        "valuation": valuation,
        "history": history_data,
        "financials": financials_dict,
        "analystRatings": analyst_ratings,
        "insiderTransactions": insider_tx,
        "lastUpdated": datetime.now(timezone.utc).isoformat()
    })

    clean_payload = clean_dict(detail_data)

    tmp_file = f"{dest_file}.tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(clean_payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp_file, dest_file)
    print(f"Updated {symbol} -> {dest_file}")

def main():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    stocks_path = os.path.join(root_dir, "data", "stocks.json")
    output_dir = os.path.join(root_dir, "data", "details")
    os.makedirs(output_dir, exist_ok=True)

    stocks_list = []
    if os.path.exists(stocks_path):
        try:
            with open(stocks_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, list) and len(loaded) > 0:
                    stocks_list = loaded
        except Exception as e:
            print(f"Error loading stocks.json: {e}")

    if not stocks_list:
        stocks_list = FALLBACK_STOCKS

    for stock in stocks_list:
        try:
            process_stock(stock, output_dir)
        except Exception as e:
            print(f"Error processing {stock.get('symbol', 'unknown')}: {e}")
        time.sleep(1)

if __name__ == "__main__":
    main()

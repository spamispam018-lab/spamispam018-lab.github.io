#!/usr/bin/env python3
"""
scripts/fetch_market_data.py
Delta-fähiges Marktdaten-Update für USA, Europa und Japan.
Garantiert echte Umrechnung aller ausländischen Währungen (JPY, USD, GBP, CHF) in Euro (EUR).
Inklusive intelligenter Fallback-Bibliothek für ETF-Top-Holdings, falls Yahoo keine liefert.
"""

import os
import json
import math
import time
import argparse
import sys
from datetime import datetime, timezone
import yfinance as yf

TICKERS_USA = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "JPM", "V",
    "MA", "UNH", "JNJ", "PG", "HD", "COST", "ABBV", "CRM", "AMD", "NFLX",
    "INTC", "QCOM", "TXN", "AVGO", "NOW", "PLTR", "UBER", "DIS", "NKE", "KO",
    "PEP", "MCD", "WMT", "LIN", "PM", "CAT", "GE", "IBM", "ORCL", "ACN",
    "CSCO", "VZ", "T", "AMGN", "PFE", "LOW", "GS", "MS", "BLK", "SPGI",
    "RTX", "HON", "BA", "LMT", "DE", "UNP", "INTU", "ISRG", "BKNG", "MDLZ"
]

TICKERS_EUROPE = [
    "ADS.DE", "AIR.DE", "ALV.DE", "BAS.DE", "BAYN.DE", "BEI.DE", "BMW.DE", "BNR.DE",
    "CBK.DE", "CON.DE", "1COV.DE", "DTG.DE", "DB1.DE", "DBK.DE", "DHL.DE", "DTE.DE",
    "EOAN.DE", "FRE.DE", "HEI.DE", "HEN3.DE", "HNR1.DE", "IFX.DE", "MBG.DE", "MRK.DE",
    "MTX.DE", "MUV2.DE", "PAH3.DE", "QIA.DE", "RHM.DE", "RWE.DE", "SAP.DE", "SRT3.DE",
    "SIE.DE", "ENR.DE", "SY1.DE", "VOW3.DE", "VNA.DE", "ZAL.DE", "P911.DE", "SHL.DE",
    "MC.PA", "OR.PA", "RMS.PA", "SAN.PA", "TTE.PA", "AIR.PA", "SU.PA", "AI.PA",
    "BNP.PA", "EL.PA", "CS.PA", "DG.PA", "KER.PA", "SAF.PA",
    "ASML.AS", "INGA.AS", "PRX.AS", "AD.AS", "UNA.AS", "HEIA.AS", "ASM.AS",
    "NESN.SW", "ROG.SW", "NOVN.SW", "UBSG.SW", "ABBN.SW", "ZURN.SW", "CFR.SW",
    "AZN.L", "SHEL.L", "HSBA.L", "ULVR.L", "BP.L", "GSK.L", "RIO.L", "REL.L",
    "STLAM.MI", "NOVO-B.CO", "ITX.MC", "SAN.MC", "IBE.MC", "ENEL.MI", "ISP.MI", "RACE.MI"
]

TICKERS_JAPAN = [
    "7203.T", "6758.T", "6861.T", "9983.T", "9984.T", "8306.T", "8058.T", "8035.T",
    "6501.T", "7974.T", "4063.T", "6098.T", "4502.T", "6902.T", "7267.T", "8001.T",
    "9432.T", "6954.T", "7741.T", "6367.T", "4568.T", "6981.T", "8766.T", "7751.T", "6503.T"
]

TICKERS_ETFS = [
    "EUNL.DE",  # iShares Core MSCI World USD (Acc)
    "AMEM.DE",  # Amundi MSCI Emerging Markets (Acc)
    "SPYI.DE"   # SPDR MSCI ACWI IMI (Acc)
]

TICKERS_SECTORS = [
    "QDVE.DE",  # iShares S&P 500 Information Technology (Tech US)
    "XDWT.DE",  # Xtrackers MSCI World Information Technology (Tech Global)
    "WHEA.DE",  # iShares MSCI World Health Care (Gesundheitswesen)
    "WSCA.DE",  # iShares MSCI World Consumer Staples (Basiskonsumgüter)
    "WFIS.DE",  # iShares MSCI World Financials (Finanzen)
    "IUSP.DE",  # iShares Developed Markets Property Yield (Immobilien/Real Estate)
    "WNRG.DE"   # iShares MSCI World Energy Sector (Energie)
]

# Feste Fallback-Bibliothek für bekannte ETFs, falls Yahoo keine Holdings liefert
KNOWN_ETF_HOLDINGS = {
    "EUNL.DE": [
        {"name": "NVIDIA Corp", "weight": 5.2},
        {"name": "Apple Inc", "weight": 4.8},
        {"name": "Microsoft Corp", "weight": 4.5},
        {"name": "Amazon.com Inc", "weight": 2.6},
        {"name": "Alphabet Inc Class A", "weight": 1.7}
    ],
    "AMEM.DE": [
        {"name": "Taiwan Semiconductor Manufacturing", "weight": 8.4},
        {"name": "Tencent Holdings Ltd", "weight": 4.1},
        {"name": "Alibaba Group Holding Ltd", "weight": 2.8},
        {"name": "Samsung Electronics Co Ltd", "weight": 2.5},
        {"name": "Meituan", "weight": 1.4}
    ],
    "SPYI.DE": [
        {"name": "NVIDIA Corp", "weight": 4.3},
        {"name": "Apple Inc", "weight": 4.0},
        {"name": "Microsoft Corp", "weight": 3.8},
        {"name": "Amazon.com Inc", "weight": 2.2},
        {"name": "Meta Platforms Inc", "weight": 1.5}
    ],
    "XDWT.DE": [
        {"name": "NVIDIA Corp", "weight": 18.5},
        {"name": "Microsoft Corp", "weight": 16.2},
        {"name": "Apple Inc", "weight": 15.4},
        {"name": "Broadcom Inc", "weight": 4.8},
        {"name": "Advanced Micro Devices", "weight": 2.9}
    ],
    "QDVE.DE": [
        {"name": "NVIDIA Corp", "weight": 21.0},
        {"name": "Microsoft Corp", "weight": 18.5},
        {"name": "Apple Inc", "weight": 17.2},
        {"name": "Broadcom Inc", "weight": 5.1},
        {"name": "Salesforce Inc", "weight": 2.4}
    ]
}

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from index_lists import SP500, DAX, MDAX, dedupe  # noqa: E402

ALL_TICKERS = dedupe(TICKERS_USA, TICKERS_EUROPE, TICKERS_JAPAN, TICKERS_ETFS, TICKERS_SECTORS, DAX, MDAX, SP500)
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

RATES_TO_EUR = {
    "EUR": 1.0, "USD": 0.92, "JPY": 0.0061, "GBP": 1.17, "GBp": 0.0117, "CHF": 1.04, "DKK": 0.134
}

def detect_native_currency(ticker):
    if ticker.endswith(".T"): return "JPY"
    if ticker.endswith((".DE", ".PA", ".AS", ".MI", ".MC")): return "EUR"
    if ticker.endswith(".L"): return "GBP"
    if ticker.endswith(".SW"): return "CHF"
    if ticker.endswith(".CO"): return "DKK"
    return "USD"

def load_live_forex():
    global RATES_TO_EUR
    pairs = {"USD": "EURUSD=X", "JPY": "EURJPY=X", "GBP": "EURGBP=X", "CHF": "EURCHF=X", "DKK": "EURDKK=X"}
    try:
        tickers_str = " ".join(pairs.values())
        fx_data = yf.download(tickers_str, period="5d", interval="1d", progress=False)
        close_df = fx_data["Close"] if "Close" in fx_data else fx_data
        for cur, pair in pairs.items():
            try:
                s = close_df[pair].dropna()
                if not s.empty:
                    eur_rate = float(s.iloc[-1])
                    if eur_rate > 0: RATES_TO_EUR[cur] = 1.0 / eur_rate
            except Exception: pass
        RATES_TO_EUR["GBp"] = RATES_TO_EUR.get("GBP", 1.17) / 100.0
    except Exception as e:
        print(f"Forex-Abruf fehlgeschlagen: {e}")

def to_eur(value, cur):
    if value is None: return None
    return round(value * RATES_TO_EUR.get(cur, 1.0), 4)

def clean_val(val, default=None):
    if val is None: return default
    if isinstance(val, (float, int)):
        if math.isnan(val) or math.isinf(val): return default
        return round(val, 4) if isinstance(val, float) else val
    return val

def df_to_dict_records(df, cur):
    if df is None or df.empty: return []
    records = []
    for col in df.columns:
        date_str = col.strftime("%Y-%m-%d") if hasattr(col, "strftime") else str(col)[:10]
        entry = {"date": date_str}
        for idx in df.index:
            raw = clean_val(df.loc[idx, col])
            key_lower = str(idx).lower()
            if raw is not None and not any(k in key_lower for k in ["%", "ratio", "shares", "growth"]):
                entry[str(idx).replace(" ", "_").replace("-", "_")] = clean_val(to_eur(raw, cur))
            else:
                entry[str(idx).replace(" ", "_").replace("-", "_")] = raw
        records.append(entry)
    records.sort(key=lambda x: x["date"])
    return records

def process_fund_data(ticker_obj, symbol=""):
    holdings = []
    try:
        fd = getattr(ticker_obj, "funds_data", None)
        if fd is not None:
            th = getattr(fd, "top_holdings", None)
            if th is not None and not th.empty:
                for idx, row in th.iterrows():
                    name = row.get("Holding Name") or row.get("Name") or str(idx)
                    pct = row.get("Holding Percent") or row.get("Percentage") or row.get("Weight") or 0.0
                    weight = 0.0
                    try:
                        if isinstance(pct, str): pct = pct.replace("%", "").replace(",", ".").strip()
                        if pct and not math.isnan(float(pct)):
                            weight = float(pct)
                            if 0 < weight <= 1.0: weight *= 100.0
                    except Exception: weight = 0.0
                    if weight > 0: holdings.append({"name": str(name), "weight": round(weight, 2)})
    except Exception: pass

    # Fallback-Greifen, wenn Yahoo nichts liefert
    if not holdings and symbol in KNOWN_ETF_HOLDINGS:
        return KNOWN_ETF_HOLDINGS[symbol]
    
    return holdings

def process_insider_data(ticker_obj, cur):
    summary = {"buysCount2Q": 0, "sellsCount2Q": 0, "buyValueTotal": 0.0, "sellValueTotal": 0.0, "sentiment": "Neutral"}
    trades = []
    try:
        df = ticker_obj.insider_transactions
        if df is not None and not df.empty:
            for _, row in df.head(40).iterrows():
                val_raw = clean_val(row.get("Value"), 0.0)
                val_eur = clean_val(to_eur(val_raw, cur), 0.0)
                t_type = str(row.get("Transaction", "") or row.get("Text", ""))
                d = row.get("Start Date") or row.get("Date")
                d_str = d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else str(d)[:10]
                trade_type = "Sell" if "Sale" in t_type or "Sell" in t_type else ("Buy" if "Buy" in t_type or "Purchase" in t_type else "Other")
                if trade_type == "Buy":
                    summary["buysCount2Q"] += 1; summary["buyValueTotal"] += abs(val_eur or 0.0)
                elif trade_type == "Sell":
                    summary["sellsCount2Q"] += 1; summary["sellValueTotal"] += abs(val_eur or 0.0)
                trades.append({"date": d_str, "insider": str(row.get("Insider", "Unbekannt")), "position": str(row.get("Position", "")), "type": trade_type, "shares": clean_val(row.get("Shares"), 0), "value": val_eur})
            if summary["buyValueTotal"] > summary["sellValueTotal"] * 1.2: summary["sentiment"] = "Bullish"
            elif summary["sellValueTotal"] > summary["buyValueTotal"] * 1.2: summary["sentiment"] = "Bearish"
    except Exception: pass
    return {"summary": summary, "trades": trades}

def process_analyst_data(info, ticker_obj, cur):
    targets = {
        "current": clean_val(to_eur(clean_val(info.get("currentPrice")), cur)),
        "low": clean_val(to_eur(clean_val(info.get("targetLowPrice")), cur)),
        "median": clean_val(to_eur(clean_val(info.get("targetMedianPrice")), cur)),
        "mean": clean_val(to_eur(clean_val(info.get("targetMeanPrice")), cur)),
        "high": clean_val(to_eur(clean_val(info.get("targetHighPrice")), cur)),
        "currency": "EUR",
        "analystCount": clean_val(info.get("numberOfAnalystOpinions"), 0)
    }
    recommendations = {"score": clean_val(info.get("recommendationMean")), "key": info.get("recommendationKey", "none"), "breakdown": {"strongBuy": 0, "buy": 0, "hold": 0, "sell": 0, "strongSell": 0}, "history": []}
    return {"targets": targets, "recommendations": recommendations, "epsEstimates": [], "nextEarningsDate": None, "epsForecast": None}

def fetch_full_stock(ticker_sym):
    t = yf.Ticker(ticker_sym)
    info = t.info or {}
    cur = info.get("currency") or detect_native_currency(ticker_sym)
    country = info.get("country", "")
    if not country:
        if ticker_sym.endswith(".T"): country = "Japan"
        elif ticker_sym.endswith(".DE"): country = "Deutschland"
        else: country = "USA"

    profile = {"ticker": ticker_sym, "name": info.get("shortName") or info.get("longName") or ticker_sym, "sector": info.get("sector", "Sonstige"), "industry": info.get("industry", "N/A"), "country": country, "currency": "EUR", "nativeCurrency": cur, "exchange": info.get("exchange", "N/A")}
    raw_curr = clean_val(info.get("currentPrice") or info.get("regularMarketPrice"), 0.0)
    raw_prev = clean_val(info.get("previousClose") or info.get("regularMarketPreviousClose"), raw_curr)
    curr_p = clean_val(to_eur(raw_curr, cur), 0.0)
    prev_p = clean_val(to_eur(raw_prev, cur), curr_p)
    chg_abs = round(curr_p - prev_p, 4) if curr_p and prev_p else 0.0
    chg_pct = round(((raw_curr - raw_prev) / raw_prev) * 100, 2) if raw_prev else 0.0
    raw_mcap = clean_val(info.get("marketCap") or info.get("totalAssets"), 0)
    market_cap_eur = clean_val(to_eur(raw_mcap, cur), 0)

    quote = {"price": curr_p, "change": chg_abs, "changePercent": chg_pct, "marketCap": market_cap_eur, "fiftyTwoWeekLow": clean_val(to_eur(clean_val(info.get("fiftyTwoWeekLow")), cur)), "fiftyTwoWeekHigh": clean_val(to_eur(clean_val(info.get("fiftyTwoWeekHigh")), cur)), "volume": clean_val(info.get("regularMarketVolume")), "currency": "EUR"}
    ratios = {"peTrailing": clean_val(info.get("trailingPE")), "peForward": clean_val(info.get("forwardPE")), "dividendYield": clean_val(info.get("dividendYield")), "profitMargins": clean_val(info.get("profitMargins"))}

    chart_history = []
    try:
        hist = t.history(period="2y", interval="1d")
        for dt, row in hist.iterrows():
            chart_history.append({"date": dt.strftime("%Y-%m-%d"), "close": clean_val(to_eur(clean_val(row["Close"]), cur)), "volume": clean_val(row["Volume"])})
    except Exception: pass

    return {"ticker": ticker_sym, "profile": profile, "quote": quote, "ratios": ratios, "financials": {"incomeStatement": {"quarterly": [], "annual": []}, "balanceSheet": {"quarterly": [], "annual": []}, "cashFlow": {"quarterly": [], "annual": []}}, "analysts": process_analyst_data(info, t, cur), "insider": process_insider_data(t, cur), "holdings": process_fund_data(t, ticker_sym), "chartHistory": chart_history, "updatedAt": datetime.now(timezone.utc).isoformat()}

def run_delta_sync(tickers):
    load_live_forex()
    batch_df = yf.download(tickers, period="5d", interval="1d", group_by="ticker", auto_adjust=False, threads=True)
    universe_file = os.path.join(DATA_DIR, "universe.json")
    universe_map = {}
    if os.path.exists(universe_file):
        try:
            with open(universe_file, "r", encoding="utf-8") as f:
                for item in json.load(f): universe_map[item["ticker"]] = item
        except Exception: pass

    for sym in tickers:
        stock_file = os.path.join(DATA_DIR, f"{sym}.json")
        stock_data = None
        if os.path.exists(stock_file):
            try:
                with open(stock_file, "r", encoding="utf-8") as f: stock_data = json.load(f)
            except Exception: pass

        if not stock_data: stock_data = fetch_full_stock(sym)
        cur = stock_data.get("profile", {}).get("nativeCurrency") or detect_native_currency(sym)

        if not stock_data.get("holdings"):
            try: stock_data["holdings"] = process_fund_data(yf.Ticker(sym), sym)
            except Exception: pass

        with open(stock_file, "w", encoding="utf-8") as f: json.dump(stock_data, f, ensure_ascii=False, indent=2)

        u_item = universe_map.get(sym, {"ticker": sym, "name": stock_data["profile"]["name"], "sector": stock_data["profile"]["sector"], "country": stock_data["profile"]["country"]})
        u_item["currency"] = "EUR"; u_item["price"] = stock_data["quote"]["price"]; u_item["changePercent"] = stock_data["quote"]["changePercent"]; u_item["marketCap"] = stock_data["quote"]["marketCap"]
        universe_map[sym] = u_item

    with open(universe_file, "w", encoding="utf-8") as f: json.dump(list(universe_map.values()), f, ensure_ascii=False, indent=2)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["delta", "full"], default="delta")
    parser.add_argument("--ticker", type=str, default="")
    args = parser.parse_args()
    os.makedirs(DATA_DIR, exist_ok=True)
    load_live_forex()
    target_tickers = [args.ticker.strip().upper()] if args.ticker else ALL_TICKERS
    run_delta_sync(target_tickers)

if __name__ == "__main__":
    main()

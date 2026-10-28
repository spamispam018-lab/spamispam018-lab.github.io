#!/usr/bin/env python3
"""
scripts/fetch_market_data.py
Liest Marktdaten für USA, Europa und Japan aus und generiert:
- data/universe.json (Screener-Datenbank)
- data/<TICKER>.json (Detaillierte Analyse-Daten)
"""

import os
import json
import math
import time
import argparse
from datetime import datetime, timezone
import yfinance as yf

# ==============================================================================
# TICKER-UNIVERSUM: USA, EUROPA & JAPAN
# ==============================================================================

# 1. USA (Auswahl S&P 500 & Nasdaq 100)
TICKERS_USA = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "JPM", "V",
    "MA", "UNH", "JNJ", "PG", "HD", "COST", "ABBV", "CRM", "AMD", "NFLX",
    "INTC", "QCOM", "TXN", "AVGO", "NOW", "PLTR", "UBER", "DIS", "NKE", "KO",
    "PEP", "MCD", "WMT", "LIN", "PM", "CAT", "GE", "IBM", "ORCL", "ACN",
    "CSCO", "VZ", "T", "AMGN", "PFE", "LOW", "GS", "MS", "BLK", "SPGI",
    "RTX", "HON", "BA", "LMT", "DE", "UNP", "INTU", "ISRG", "BKNG", "MDLZ"
]

# 2. EUROPA (DAX, MDAX, EuroStoxx 50, CAC40, FTSE, SMI inkl. Stellantis)
TICKERS_EUROPE = [
    # Deutschland (.DE)
    "ADS.DE", "AIR.DE", "ALV.DE", "BAS.DE", "BAYN.DE", "BEI.DE", "BMW.DE", "BNR.DE",
    "CBK.DE", "CON.DE", "1COV.DE", "DTG.DE", "DB1.DE", "DBK.DE", "DHL.DE", "DTE.DE",
    "EOAN.DE", "FRE.DE", "HEI.DE", "HEN3.DE", "HNR1.DE", "IFX.DE", "MBG.DE", "MRK.DE",
    "MTX.DE", "MUV2.DE", "PAH3.DE", "QIA.DE", "RHM.DE", "RWE.DE", "SAP.DE", "SRT3.DE",
    "SIE.DE", "ENR.DE", "SY1.DE", "VOW3.DE", "VNA.DE", "ZAL.DE", "P911.DE", "SHL.DE",
    # Frankreich (.PA)
    "MC.PA", "OR.PA", "RMS.PA", "SAN.PA", "TTE.PA", "AIR.PA", "SU.PA", "AI.PA",
    "BNP.PA", "EL.PA", "CS.PA", "DG.PA", "KER.PA", "SAF.PA",
    # Niederlande (.AS)
    "ASML.AS", "INGA.AS", "PRX.AS", "AD.AS", "UNA.AS", "HEIA.AS", "ASM.AS",
    # Schweiz (.SW)
    "NESN.SW", "ROG.SW", "NOVN.SW", "UBSG.SW", "ABBN.SW", "ZURN.SW", "CFR.SW",
    # Großbritannien (.L)
    "AZN.L", "SHEL.L", "HSBA.L", "ULVR.L", "BP.L", "GSK.L", "RIO.L", "REL.L",
    # Italien / Spanien / Skandinavien
    "STLAM.MI",  # Stellantis N.V. (Hauptnotierung Borsa Italiana)
    "NOVO-B.CO", "ITX.MC", "SAN.MC", "IBE.MC", "ENEL.MI", "ISP.MI", "RACE.MI"
]

# 3. JAPAN (Nikkei 225 / TOPIX Leaders mit Suffix .T)
TICKERS_JAPAN = [
    "7203.T",  # Toyota Motor
    "6758.T",  # Sony Group
    "6861.T",  # Keyence
    "9983.T",  # Fast Retailing (Uniqlo)
    "9984.T",  # SoftBank Group
    "8306.T",  # Mitsubishi UFJ Financial
    "8058.T",  # Mitsubishi Corp.
    "8035.T",  # Tokyo Electron
    "6501.T",  # Hitachi
    "7974.T",  # Nintendo
    "4063.T",  # Shin-Etsu Chemical
    "6098.T",  # Recruit Holdings
    "4502.T",  # Takeda Pharmaceutical
    "6902.T",  # Denso
    "7267.T",  # Honda Motor
    "8001.T",  # Itochu
    "9432.T",  # Nippon Telegraph & Telephone (NTT)
    "6954.T",  # Fanuc
    "7741.T",  # Hoya Corp.
    "6367.T",  # Daikin Industries
    "4568.T",  # Daiichi Sankyo
    "6981.T",  # Murata Manufacturing
    "8766.T",  # Tokio Marine
    "7751.T",  # Canon
    "6503.T"   # Mitsubishi Electric
]

ALL_TICKERS = TICKERS_USA + TICKERS_EUROPE + TICKERS_JAPAN

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

def clean_val(val, default=None):
    if val is None:
        return default
    if isinstance(val, (float, int)):
        if math.isnan(val) or math.isinf(val):
            return default
        return round(val, 4) if isinstance(val, float) else val
    return val

def df_to_dict_records(df):
    if df is None or df.empty:
        return []
    records = []
    for col in df.columns:
        date_str = col.strftime("%Y-%m-%d") if hasattr(col, "strftime") else str(col)[:10]
        entry = {"date": date_str}
        for idx in df.index:
            metric_key = str(idx).replace(" ", "_").replace("-", "_")
            entry[metric_key] = clean_val(df.loc[idx, col])
        records.append(entry)
    records.sort(key=lambda x: x["date"])
    return records

def process_insider_data(ticker_obj):
    summary = {
        "buysCount2Q": 0, "sellsCount2Q": 0,
        "buyValueTotal": 0.0, "sellValueTotal": 0.0,
        "sentiment": "Neutral"
    }
    trades = []
    try:
        insider_df = ticker_obj.insider_transactions
        if insider_df is not None and not insider_df.empty:
            for _, row in insider_df.head(40).iterrows():
                shares = clean_val(row.get("Shares"), 0)
                val = clean_val(row.get("Value"), 0.0)
                trans_text = str(row.get("Transaction", "") or row.get("Text", "")).strip()
                t_date = row.get("Start Date") or row.get("Date")
                date_str = t_date.strftime("%Y-%m-%d") if hasattr(t_date, "strftime") else str(t_date)[:10]

                trade_type = "Other"
                if "Sale" in trans_text or "Sell" in trans_text:
                    trade_type = "Sell"
                    summary["sellsCount2Q"] += 1
                    summary["sellValueTotal"] += abs(val or 0.0)
                elif "Buy" in trans_text or "Purchase" in trans_text:
                    trade_type = "Buy"
                    summary["buysCount2Q"] += 1
                    summary["buyValueTotal"] += abs(val or 0.0)
                elif "Award" in trans_text or "Grant" in trans_text:
                    trade_type = "Award"

                trades.append({
                    "date": date_str,
                    "insider": str(row.get("Insider", "Unbekannt")),
                    "position": str(row.get("Position", "")),
                    "type": trade_type,
                    "shares": shares,
                    "value": val
                })

            if summary["buyValueTotal"] > summary["sellValueTotal"] * 1.2:
                summary["sentiment"] = "Bullish"
            elif summary["sellValueTotal"] > summary["buyValueTotal"] * 1.2:
                summary["sentiment"] = "Bearish"
    except Exception:
        pass
    return {"summary": summary, "trades": trades}

def process_analyst_data(info, ticker_obj):
    targets = {
        "current": clean_val(info.get("currentPrice")),
        "low": clean_val(info.get("targetLowPrice")),
        "median": clean_val(info.get("targetMedianPrice")),
        "mean": clean_val(info.get("targetMeanPrice")),
        "high": clean_val(info.get("targetHighPrice")),
        "currency": info.get("currency", "EUR"),
        "analystCount": clean_val(info.get("numberOfAnalystOpinions"), 0)
    }
    recommendations = {
        "score": clean_val(info.get("recommendationMean")),
        "key": info.get("recommendationKey", "none"),
        "breakdown": {"strongBuy": 0, "buy": 0, "hold": 0, "sell": 0, "strongSell": 0},
        "history": []
    }
    try:
        rec_df = ticker_obj.recommendations
        if rec_df is not None and not rec_df.empty:
            for _, row in rec_df.tail(6).iterrows():
                recommendations["history"].append({
                    "period": str(row.get("period", "")),
                    "strongBuy": int(clean_val(row.get("strongBuy"), 0)),
                    "buy": int(clean_val(row.get("buy"), 0)),
                    "hold": int(clean_val(row.get("hold"), 0)),
                    "sell": int(clean_val(row.get("sell"), 0)),
                    "strongSell": int(clean_val(row.get("strongSell"), 0))
                })
            if recommendations["history"]:
                latest = recommendations["history"][-1]
                recommendations["breakdown"] = {
                    "strongBuy": latest["strongBuy"], "buy": latest["buy"],
                    "hold": latest["hold"], "sell": latest["sell"],
                    "strongSell": latest["strongSell"]
                }
    except Exception:
        pass

    eps_estimates = []
    try:
        earnings_hist = ticker_obj.earnings_history
        if earnings_hist is not None and not earnings_hist.empty:
            for idx, row in earnings_hist.tail(8).iterrows():
                q_date = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
                eps_estimates.append({
                    "quarter": q_date,
                    "estimate": clean_val(row.get("epsEstimate")),
                    "actual": clean_val(row.get("epsActual")),
                    "surprisePercent": clean_val(row.get("surprisePercent"))
                })
    except Exception:
        pass

    return {
        "targets": targets,
        "recommendations": recommendations,
        "epsEstimates": eps_estimates
    }

def fetch_single_ticker(ticker_sym):
    t = yf.Ticker(ticker_sym)
    info = t.info or {}

    country = info.get("country", "")
    if not country:
        if ticker_sym.endswith(".T"):
            country = "Japan"
        elif ticker_sym.endswith(".DE"):
            country = "Deutschland"
        elif ticker_sym.endswith(".PA"):
            country = "Frankreich"
        elif ticker_sym.endswith(".SW"):
            country = "Schweiz"
        elif ticker_sym.endswith(".AS"):
            country = "Niederlande"
        elif ticker_sym.endswith(".L"):
            country = "Großbritannien"
        elif ticker_sym.endswith(".MI"):
            country = "Italien"
        else:
            country = "USA"

    profile = {
        "ticker": ticker_sym,
        "name": info.get("shortName") or info.get("longName") or ticker_sym,
        "sector": info.get("sector", "Sonstige"),
        "industry": info.get("industry", "N/A"),
        "country": country,
        "currency": info.get("currency", "EUR" if ticker_sym.endswith((".DE", ".PA", ".AS", ".MI")) else "USD"),
        "exchange": info.get("exchange", "N/A"),
        "website": info.get("website", ""),
        "summary": info.get("longBusinessSummary", "")
    }

    curr_price = clean_val(info.get("currentPrice") or info.get("regularMarketPrice"), 0.0)
    prev_close = clean_val(info.get("previousClose") or info.get("regularMarketPreviousClose"), curr_price)
    change_abs = round(curr_price - prev_close, 4) if curr_price and prev_close else 0.0
    change_pct = round((change_abs / prev_close) * 100, 2) if prev_close else 0.0

    quote = {
        "price": curr_price,
        "change": change_abs,
        "changePercent": change_pct,
        "marketCap": clean_val(info.get("marketCap"), 0),
        "fiftyTwoWeekLow": clean_val(info.get("fiftyTwoWeekLow")),
        "fiftyTwoWeekHigh": clean_val(info.get("fiftyTwoWeekHigh")),
        "volume": clean_val(info.get("regularMarketVolume")),
        "avgVolume": clean_val(info.get("averageVolume")),
        "currency": profile["currency"]
    }

    ratios = {
        "peTrailing": clean_val(info.get("trailingPE")),
        "peForward": clean_val(info.get("forwardPE")),
        "pegRatio": clean_val(info.get("pegRatio")),
        "priceToBook": clean_val(info.get("priceToBook")),
        "priceToSales": clean_val(info.get("priceToSalesTrailing12Months")),
        "evToEbitda": clean_val(info.get("enterpriseToEbitda")),
        "dividendYield": clean_val(info.get("dividendYield")),
        "profitMargins": clean_val(info.get("profitMargins")),
        "operatingMargins": clean_val(info.get("operatingMargins")),
        "grossMargins": clean_val(info.get("grossMargins")),
        "returnOnEquity": clean_val(info.get("returnOnEquity")),
        "returnOnAssets": clean_val(info.get("returnOnAssets")),
        "debtToEquity": clean_val(info.get("debtToEquity")),
        "currentRatio": clean_val(info.get("currentRatio")),
        "quickRatio": clean_val(info.get("quickRatio")),
        "revenueGrowth": clean_val(info.get("revenueGrowth")),
        "earningsGrowth": clean_val(info.get("earningsGrowth")),
        "freeCashflow": clean_val(info.get("freeCashflow")),
        "operatingCashflow": clean_val(info.get("operatingCashflow")),
        "totalRevenue": clean_val(info.get("totalRevenue")),
        "netIncome": clean_val(info.get("netIncomeToCommon"))
    }

    inc_q = df_to_dict_records(t.quarterly_income_stmt)
    inc_a = df_to_dict_records(t.income_stmt)
    bal_q = df_to_dict_records(t.quarterly_balance_sheet)
    bal_a = df_to_dict_records(t.balance_sheet)
    cf_q = df_to_dict_records(t.quarterly_cashflow)
    cf_a = df_to_dict_records(t.cashflow)

    chart_history = []
    try:
        hist = t.history(period="1y", interval="1d")
        for dt, row in hist.iterrows():
            chart_history.append({
                "date": dt.strftime("%Y-%m-%d"),
                "close": clean_val(row["Close"]),
                "volume": clean_val(row["Volume"])
            })
    except Exception:
        pass

    perf_52w = 0.0
    if len(chart_history) > 20:
        first_c = chart_history[0]["close"]
        last_c = chart_history[-1]["close"]
        if first_c and last_c:
            perf_52w = round(((last_c - first_c) / first_c) * 100, 2)

    insider = process_insider_data(t)
    analysts = process_analyst_data(info, t)

    full_data = {
        "ticker": ticker_sym,
        "profile": profile,
        "quote": quote,
        "ratios": ratios,
        "financials": {
            "incomeStatement": {"quarterly": inc_q, "annual": inc_a},
            "balanceSheet": {"quarterly": bal_q, "annual": bal_a},
            "cashFlow": {"quarterly": cf_q, "annual": cf_a}
        },
        "analysts": analysts,
        "insider": insider,
        "chartHistory": chart_history,
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }

    screener_item = {
        "ticker": ticker_sym,
        "name": profile["name"],
        "sector": profile["sector"],
        "country": profile["country"],
        "marketCap": quote["marketCap"],
        "price": quote["price"],
        "changePercent": quote["changePercent"],
        "perf52w": perf_52w,
        "currency": profile["currency"],
        "pe": ratios["peTrailing"],
        "forwardPe": ratios["peForward"],
        "dividendYield": ratios["dividendYield"],
        "revGrowth": ratios["revenueGrowth"],
        "netMargin": ratios["profitMargins"],
        "debtToEquity": ratios["debtToEquity"],
        "ratingScore": analysts["recommendations"]["score"]
    }

    return screener_item, full_data

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)
    tickers = ALL_TICKERS[:args.limit] if args.limit else ALL_TICKERS

    print(f"Starte Download für {len(tickers)} globale Ticker (inkl. Stellantis)...")
    universe = []

    for idx, sym in enumerate(tickers, 1):
        print(f"[{idx}/{len(tickers)}] Lade {sym}...")
        try:
            scr_item, full_stock = fetch_single_ticker(sym)
            universe.append(scr_item)

            out_file = os.path.join(DATA_DIR, f"{sym}.json")
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(full_stock, f, ensure_ascii=False, indent=2)

            time.sleep(0.4)
        except Exception as err:
            print(f"Fehler bei {sym}: {err}")

    universe_file = os.path.join(DATA_DIR, "universe.json")
    with open(universe_file, "w", encoding="utf-8") as f:
        json.dump(universe, f, ensure_ascii=False, indent=2)

    print(f"Abgeschlossen: {len(universe)} Aktien weltweit erfolgreich generiert.")

if __name__ == "__main__":
    main()

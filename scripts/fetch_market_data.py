#!/usr/bin/env python3
"""
scripts/fetch_market_data.py
Liest Marktdaten via yfinance aus und generiert:
- data/universe.json (Kompakte Screener-Datenbank)
- data/<TICKER>.json (Detaillierte Analyse-Daten pro Wertpapier)
"""

import os
import json
import math
import time
import argparse
from datetime import datetime, timezone
import yfinance as yf

# Universum: DAX 40, EuroStoxx 50 & US Big Tech / S&P 500 Leaders
TICKERS = [
    # DAX 40 & Deutschland
    "ADS.DE", "AIR.DE", "ALV.DE", "BAS.DE", "BAYN.DE", "BEI.DE", "BMW.DE", "BNR.DE",
    "CBK.DE", "CON.DE", "1COV.DE", "DTG.DE", "DB1.DE", "DBK.DE", "DHL.DE", "DTE.DE",
    "EOAN.DE", "FRE.DE", "HEI.DE", "HEN3.DE", "HNR1.DE", "IFX.DE", "MBG.DE", "MRK.DE",
    "MTX.DE", "MUV2.DE", "PAH3.DE", "QIA.DE", "RHM.DE", "RWE.DE", "SAP.DE", "SRT3.DE",
    "SIE.DE", "ENR.DE", "SY1.DE", "VOW3.DE", "VNA.DE", "ZAL.DE",
    # Europa Leaders
    "ASML.AS", "MC.PA", "OR.PA", "RMS.PA", "SAN.PA", "TTE.PA", "NOVO-B.CO", "NESN.SW",
    "ROG.SW", "NOVN.SW", "AZN.L", "SHEL.L", "SAP.DE", "LVMH.PA", "ITX.MC", "INGA.AS",
    # US Tech & S&P 500
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "JPM", "V",
    "MA", "UNH", "JNJ", "PG", "HD", "COST", "ABBV", "CRM", "AMD", "NFLX",
    "INTC", "QCOM", "TXN", "AVGO", "NOW", "PLTR", "UBER", "DIS", "NKE", "KO",
    "PEP", "MCD", "WMT", "LIN", "PM", "CAT", "GE", "IBM", "ORCL", "ACN"
]

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

def clean_val(val, default=None):
    """Säubert NaN, Infinite und None-Werte für valides JSON."""
    if val is None:
        return default
    if isinstance(val, (float, int)):
        if math.isnan(val) or math.isinf(val):
            return default
        return round(val, 4) if isinstance(val, float) else val
    return val

def df_to_dict_records(df):
    """Wandelt ein Pandas DataFrame in eine Liste von Objekten mit formatierten Datums-Strings um."""
    if df is None or df.empty:
        return []
    records = []
    # yfinance Financials haben Datumsspalten (Timestamp) und Zeilen als Metriken
    for col in df.columns:
        date_str = col.strftime("%Y-%m-%d") if hasattr(col, "strftime") else str(col)[:10]
        entry = {"date": date_str}
        for idx in df.index:
            metric_key = str(idx).replace(" ", "_").replace("-", "_")
            val = clean_val(df.loc[idx, col])
            entry[metric_key] = val
        records.append(entry)
    records.sort(key=lambda x: x["date"])
    return records

def process_insider_data(ticker_obj):
    """Extrahiert SEC Form 4 Insider Trades und Transaktions-Summen."""
    summary = {
        "buysCount2Q": 0,
        "sellsCount2Q": 0,
        "buyValueTotal": 0.0,
        "sellValueTotal": 0.0,
        "sentiment": "Neutral"
    }
    trades = []
    
    try:
        insider_df = ticker_obj.insider_transactions
        if insider_df is not None and not insider_df.empty:
            for _, row in insider_df.head(50).iterrows():
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
                    "text": trans_text,
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
    """Bereitet Analysten-Ziele, Empfehlungs-Historie und EPS-Estimates auf."""
    targets = {
        "current": clean_val(info.get("currentPrice")),
        "low": clean_val(info.get("targetLowPrice")),
        "median": clean_val(info.get("targetMedianPrice")),
        "mean": clean_val(info.get("targetMeanPrice")),
        "high": clean_val(info.get("targetHighPrice")),
        "currency": info.get("currency", "USD"),
        "analystCount": clean_val(info.get("numberOfAnalystOpinions"), 0)
    }
    
    # Empfehlungs-Zusammenfassung (Scores: 1=Strong Buy, 2=Buy, 3=Hold, 4=Underperform, 5=Sell)
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
                period = str(row.get("period", ""))
                sb = int(clean_val(row.get("strongBuy"), 0))
                b = int(clean_val(row.get("buy"), 0))
                h = int(clean_val(row.get("hold"), 0))
                s = int(clean_val(row.get("sell"), 0))
                ss = int(clean_val(row.get("strongSell"), 0))
                
                recommendations["history"].append({
                    "period": period,
                    "strongBuy": sb,
                    "buy": b,
                    "hold": h,
                    "sell": s,
                    "strongSell": ss
                })
            if recommendations["history"]:
                latest = recommendations["history"][-1]
                recommendations["breakdown"] = {
                    "strongBuy": latest["strongBuy"],
                    "buy": latest["buy"],
                    "hold": latest["hold"],
                    "sell": latest["sell"],
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
    """Zieht alle relevanten Metriken eines Wertpapiers ab."""
    t = yf.Ticker(ticker_sym)
    info = t.info or {}
    
    # Basisdaten & Profil
    profile = {
        "ticker": ticker_sym,
        "name": info.get("shortName") or info.get("longName") or ticker_sym,
        "sector": info.get("sector", "N/A"),
        "industry": info.get("industry", "N/A"),
        "country": info.get("country", "N/A"),
        "currency": info.get("currency", "USD"),
        "exchange": info.get("exchange", "N/A"),
        "website": info.get("website", ""),
        "summary": info.get("longBusinessSummary", "")
    }

    # Aktuelle Notierung & Performance
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

    # Kennzahlen
    ratios = {
        "peTrailing": clean_val(info.get("trailingPE")),
        "peForward": clean_val(info.get("forwardPE")),
        "pegRatio": clean_val(info.get("pegRatio")),
        "priceToBook": clean_val(info.get("priceToBook")),
        "priceToSales": clean_val(info.get("priceToSalesTrailing12Months")),
        "evToEbitda": clean_val(info.get("enterpriseToEbitda")),
        "evToRevenue": clean_val(info.get("enterpriseToRevenue")),
        "dividendYield": clean_val(info.get("dividendYield")),
        "payoutRatio": clean_val(info.get("payoutRatio")),
        "profitMargins": clean_val(info.get("profitMargins")),
        "operatingMargins": clean_val(info.get("operatingMargins")),
        "grossMargins": clean_val(info.get("grossMargins")),
        "returnOnEquity": clean_val(info.get("returnOnEquity")),
        "returnOnAssets": clean_val(info.get("returnOnAssets")),
        "debtToEquity": clean_val(info.get("debtToEquity")),
        "currentRatio": clean_val(info.get("currentRatio")),
        "quickRatio": clean_val(info.get("quickRatio")),
        "beta": clean_val(info.get("beta")),
        "revenueGrowth": clean_val(info.get("revenueGrowth")),
        "earningsGrowth": clean_val(info.get("earningsGrowth")),
        "freeCashflow": clean_val(info.get("freeCashflow")),
        "operatingCashflow": clean_val(info.get("operatingCashflow")),
        "totalRevenue": clean_val(info.get("totalRevenue")),
        "netIncome": clean_val(info.get("netIncomeToCommon"))
    }

    # Statements abrufen
    inc_q = df_to_dict_records(t.quarterly_income_stmt)
    inc_a = df_to_dict_records(t.income_stmt)
    bal_q = df_to_dict_records(t.quarterly_balance_sheet)
    bal_a = df_to_dict_records(t.balance_sheet)
    cf_q = df_to_dict_records(t.quarterly_cashflow)
    cf_a = df_to_dict_records(t.cashflow)

    # Historische Schlusskurse für Charts (1 Jahr, täglich)
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

    # 52W Performance
    perf_52w = 0.0
    if len(chart_history) > 20:
        first_close = chart_history[0]["close"]
        last_close = chart_history[-1]["close"]
        if first_close and last_close:
            perf_52w = round(((last_close - first_close) / first_close) * 100, 2)

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

    # Kompaktes Item für Universe / Screener
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
    parser = argparse.ArgumentParser(description="Aktienmarktdaten für App herunterladen")
    parser.add_argument("--limit", type=int, default=None, help="Begrenze Ticker-Anzahl für Tests")
    args = parser.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)
    target_tickers = TICKERS[:args.limit] if args.limit else TICKERS
    
    print(f"Starte Download für {len(target_tickers)} Ticker...")
    universe = []

    for idx, sym in enumerate(target_tickers, 1):
        print(f"[{idx}/{len(target_tickers)}] Lade {sym}...")
        try:
            scr_item, full_stock = fetch_single_ticker(sym)
            universe.append(scr_item)
            
            # Detaildatei speichern (z.B. data/AAPL.json)
            out_file = os.path.join(DATA_DIR, f"{sym}.json")
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(full_stock, f, ensure_ascii=False, indent=2)
                
            time.sleep(0.3)  # Rate-Limiting-Schutz
        except Exception as err:
            print(f"Fehler bei {sym}: {err}")

    # Screener-Gesamtdatensatz speichern
    universe_file = os.path.join(DATA_DIR, "universe.json")
    with open(universe_file, "w", encoding="utf-8") as f:
        json.dump(universe, f, ensure_ascii=False, indent=2)

    print(f"Erfolgreich abgeschlossen. {len(universe)} Ticker in {DATA_DIR} geschrieben.")

if __name__ == "__main__":
    main()

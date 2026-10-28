#!/usr/bin/env python3
"""
scripts/fetch_stock_details.py
Aggregates fundamental, market, analyst, and insider/fund holding data
using yfinance and SEC EDGAR XBRL APIs. Saves per-ticker JSON files into data/stocks/<TICKER>.json.
"""

import os
import sys
import json
import time
import requests
import yfinance as yf
from datetime import datetime

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "stocks")
SEC_HEADERS = {
    "User-Agent": "PersonalFinancialDashboard research@personal-screener-app.local"
}

def clean_val(val):
    if val is None:
        return None
    try:
        import numpy as np
        if np.isnan(val) or np.isinf(val):
            return None
    except Exception:
        pass
    if isinstance(val, (int, float)):
        return round(val, 4)
    return str(val)

def fetch_sec_cik_map():
    url = "https://www.sec.gov/files/company_tickers.json"
    try:
        resp = requests.get(url, headers=SEC_HEADERS, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return {item["ticker"].upper(): str(item["cik_str"]).zfill(10) for item in data.values()}
    except Exception as e:
        print(f"Warning: Could not fetch SEC CIK map: {e}")
    return {}

def fetch_sec_facts(cik):
    if not cik:
        return None
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
    try:
        resp = requests.get(url, headers=SEC_HEADERS, timeout=10)
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return None

def extract_sec_quarterly_metric(facts, tag_names, unit="USD"):
    us_gaap = facts.get("facts", {}).get("us-gaap", {})
    for tag in tag_names:
        if tag in us_gaap and unit in us_gaap[tag].get("units", {}):
            items = us_gaap[tag]["units"][unit]
            quarterly = [
                x for x in items 
                if x.get("form") in ["10-Q", "10-K"] and "end" in x and "val" in x
            ]
            quarterly.sort(key=lambda x: x["end"])
            # Deduplicate by end date, keeping the latest filed
            seen = {}
            for row in quarterly:
                seen[row["end"]] = row["val"]
            return seen
    return {}

def extract_financials_history(ticker_obj, sec_facts=None):
    history = []
    
    # Base from yfinance quarterly statements
    try:
        q_fin = ticker_obj.quarterly_financials
        q_bs = ticker_obj.quarterly_balance_sheet
        q_cf = ticker_obj.quarterly_cashflow
    except Exception:
        q_fin, q_bs, q_cf = None, None, None

    dates = set()
    for df in [q_fin, q_bs, q_cf]:
        if df is not None and not df.empty:
            dates.update([d.strftime("%Y-%m-%d") for d in df.columns if hasattr(d, "strftime")])

    sorted_dates = sorted(list(dates))
    
    for dt_str in sorted_dates:
        col = None
        for df in [q_fin, q_bs, q_cf]:
            if df is not None and not df.empty:
                matches = [c for c in df.columns if hasattr(c, "strftime") and c.strftime("%Y-%m-%d") == dt_str]
                if matches:
                    col = matches[0]
                    break
        if col is None:
            continue

        def get_val(df, keys):
            if df is None or df.empty:
                return None
            for k in keys:
                if k in df.index:
                    v = df.loc[k, col]
                    if v is not None:
                        return clean_val(v)
            return None

        rev = get_val(q_fin, ["Total Revenue", "Operating Revenue", "Revenue"])
        gp = get_val(q_fin, ["Gross Profit"])
        op_inc = get_val(q_fin, ["Operating Income", "Operating Profit"])
        net_inc = get_val(q_fin, ["Net Income", "Net Income Common Stockholders"])
        cor = get_val(q_fin, ["Cost Of Revenue", "Reconciled Cost Of Revenue"])
        
        ocf = get_val(q_cf, ["Operating Cash Flow", "Cash Flow From Continuing Operating Activities"])
        capex = get_val(q_cf, ["Capital Expenditure"])
        fcf = get_val(q_cf, ["Free Cash Flow"])
        if fcf is None and ocf is not None and capex is not None:
            fcf = round(ocf + capex, 4) if capex < 0 else round(ocf - capex, 4)
            
        div = get_val(q_cf, ["Cash Dividends Paid", "Common Stock Dividend Paid"])

        tot_assets = get_val(q_bs, ["Total Assets"])
        curr_assets = get_val(q_bs, ["Current Assets"])
        tot_liab = get_val(q_bs, ["Total Liabilities Net Minority Interest", "Total Liabilities"])
        curr_liab = get_val(q_bs, ["Current Liabilities"])
        tot_equity = get_val(q_bs, ["Stockholders Equity", "Total Equity Gross Minority Interest"])
        tot_debt = get_val(q_bs, ["Total Debt"])
        cash_equiv = get_val(q_bs, ["Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments"])
        shares = get_val(q_bs, ["Share Issued", "Ordinary Shares Number"])

        history.append({
            "date": dt_str,
            "period": "Quarterly",
            "revenue": rev,
            "grossProfit": gp,
            "costOfRevenue": cor,
            "operatingIncome": op_inc,
            "netIncome": net_inc,
            "operatingCashFlow": ocf,
            "capitalExpenditure": capex,
            "freeCashFlow": fcf,
            "dividendsPaid": div,
            "totalAssets": tot_assets,
            "currentAssets": curr_assets,
            "totalLiabilities": tot_liab,
            "currentLiabilities": curr_liab,
            "stockholdersEquity": tot_equity,
            "totalDebt": tot_debt,
            "cashAndEquivalents": cash_equiv,
            "sharesOutstanding": shares
        })
    return history

def extract_analyst_data(ticker_obj, info):
    analyst_data = {
        "targets": {
            "current": clean_val(info.get("currentPrice") or info.get("regularMarketPrice")),
            "targetLow": clean_val(info.get("targetLowPrice")),
            "targetMean": clean_val(info.get("targetMeanPrice")),
            "targetHigh": clean_val(info.get("targetHighPrice")),
            "numberOfAnalysts": clean_val(info.get("numberOfAnalystOpinions"))
        },
        "recommendations": {
            "consensus": info.get("recommendationKey"),
            "currentMonth": {
                "strongBuy": clean_val(info.get("recommendationKeyStrongBuy", 0)),
                "buy": clean_val(info.get("recommendationKeyBuy", 0)),
                "hold": clean_val(info.get("recommendationKeyHold", 0)),
                "sell": clean_val(info.get("recommendationKeySell", 0)),
                "strongSell": clean_val(info.get("recommendationKeyStrongSell", 0))
            },
            "history": []
        },
        "epsEstimates": []
    }

    try:
        recs = ticker_obj.recommendations
        if recs is not None and not recs.empty:
            recs_list = []
            for _, row in recs.tail(6).iterrows():
                period = str(row.get("period", ""))
                recs_list.append({
                    "period": period,
                    "strongBuy": clean_val(row.get("strongBuy", 0)),
                    "buy": clean_val(row.get("buy", 0)),
                    "hold": clean_val(row.get("hold", 0)),
                    "sell": clean_val(row.get("sell", 0)),
                    "strongSell": clean_val(row.get("strongSell", 0))
                })
            analyst_data["recommendations"]["history"] = recs_list
    except Exception:
        pass

    try:
        earnings_dates = ticker_obj.get_earnings_dates(limit=8)
        if earnings_dates is not None and not earnings_dates.empty:
            eps_list = []
            for idx, row in earnings_dates.iterrows():
                dt_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)
                eps_list.append({
                    "date": dt_str,
                    "epsEstimate": clean_val(row.get("EPS Estimate")),
                    "reportedEps": clean_val(row.get("Reported EPS")),
                    "surprisePercent": clean_val(row.get("Surprise(%)"))
                })
            analyst_data["epsEstimates"] = sorted(eps_list, key=lambda x: x["date"])
    except Exception:
        pass

    return analyst_data

def extract_holdings_data(ticker_obj):
    holdings = {
        "insiders": {
            "summary": {
                "netSharesBought": 0,
                "buyCount": 0,
                "sellCount": 0,
                "totalBoughtValue": 0,
                "totalSoldValue": 0
            },
            "transactions": []
        },
        "funds": {
            "institutionsCount": None,
            "institutionsPercentHeld": None,
            "topHolders": []
        }
    }

    try:
        ins = ticker_obj.insider_transactions
        if ins is not None and not ins.empty:
            tx_list = []
            buy_val, sell_val = 0.0, 0.0
            buy_cnt, sell_cnt = 0, 0
            
            for _, row in ins.head(40).iterrows():
                shares = row.get("Shares")
                val = row.get("Value")
                tx_text = str(row.get("Text", "")).lower()
                is_buy = "buy" in tx_text or "purchase" in tx_text
                is_sell = "sale" in tx_text or "sell" in tx_text
                
                if val and isinstance(val, (int, float)):
                    if is_buy:
                        buy_val += val
                        buy_cnt += 1
                    elif is_sell:
                        sell_val += val
                        sell_cnt += 1

                dt = row.get("Start Date") or row.get("Date")
                dt_str = dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)

                tx_list.append({
                    "date": dt_str,
                    "insider": clean_val(row.get("Insider")),
                    "position": clean_val(row.get("Position")),
                    "transaction": clean_val(row.get("Text")),
                    "shares": clean_val(shares),
                    "value": clean_val(val)
                })
            holdings["insiders"]["transactions"] = tx_list
            holdings["insiders"]["summary"] = {
                "buyCount": buy_cnt,
                "sellCount": sell_cnt,
                "totalBoughtValue": round(buy_val, 2),
                "totalSoldValue": round(sell_val, 2)
            }
    except Exception:
        pass

    try:
        inst = ticker_obj.institutional_holders
        if inst is not None and not inst.empty:
            top_inst = []
            for _, row in inst.head(10).iterrows():
                top_inst.append({
                    "holder": clean_val(row.get("Holder")),
                    "shares": clean_val(row.get("Shares")),
                    "dateReported": str(row.get("Date Reported", ""))[:10],
                    "percentOut": clean_val(row.get("% Out")),
                    "value": clean_val(row.get("Value"))
                })
            holdings["funds"]["topHolders"] = top_inst
    except Exception:
        pass

    return holdings

def fetch_single_ticker(ticker, cik_map):
    print(f"Fetching details for {ticker}...")
    t = yf.Ticker(ticker)
    info = {}
    try:
        info = t.info or {}
    except Exception as e:
        print(f"Error fetching info for {ticker}: {e}")

    cik = cik_map.get(ticker.upper())
    sec_facts = fetch_sec_facts(cik) if cik else None

    financials_history = extract_financials_history(t, sec_facts)
    analyst_data = extract_analyst_data(t, info)
    holdings_data = extract_holdings_data(t)

    stock_record = {
        "ticker": ticker.upper(),
        "name": info.get("longName") or info.get("shortName") or ticker.upper(),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "currency": info.get("currency", "USD"),
        "lastUpdated": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "overview": {
            "price": clean_val(info.get("currentPrice") or info.get("regularMarketPrice")),
            "dayChange": clean_val(info.get("regularMarketChangePercent")),
            "marketCap": clean_val(info.get("marketCap")),
            "trailingPE": clean_val(info.get("trailingPE")),
            "forwardPE": clean_val(info.get("forwardPE")),
            "dividendYield": clean_val(info.get("dividendYield")),
            "fiftyTwoWeekLow": clean_val(info.get("fiftyTwoWeekLow")),
            "fiftyTwoWeekHigh": clean_val(info.get("fiftyTwoWeekHigh")),
            "beta": clean_val(info.get("beta")),
            "enterpriseValue": clean_val(info.get("enterpriseValue")),
            "priceToBook": clean_val(info.get("priceToBook")),
            "priceToSales": clean_val(info.get("priceToSalesTrailing12Months"))
        },
        "financialsHistory": financials_history,
        "analyst": analyst_data,
        "holdings": holdings_data
    }

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_file = os.path.join(OUTPUT_DIR, f"{ticker.upper()}.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(stock_record, f, indent=2, ensure_ascii=False)
    print(f"Saved {out_file}")

def main():
    tickers = sys.argv[1:] if len(sys.argv) > 1 else ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]
    cik_map = fetch_sec_cik_map()
    for ticker in tickers:
        try:
            fetch_single_ticker(ticker, cik_map)
            time.sleep(1)
        except Exception as e:
            print(f"Failed processing {ticker}: {e}")

if __name__ == "__main__":
    main()

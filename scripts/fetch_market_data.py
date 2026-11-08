#!/usr/bin/env python3
"""
scripts/fetch_market_data.py
Delta-fähiges Marktdaten-Update für USA, Europa und Japan.
Garantiert echte Umrechnung aller ausländischen Währungen (JPY, USD, GBP, CHF) in Euro (EUR).
Inklusive robuster Extraktion von ETF-Top-Holdings.
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from index_lists import SP500, DAX, MDAX, dedupe  # noqa: E402

ALL_TICKERS = dedupe(TICKERS_USA, TICKERS_EUROPE, TICKERS_JAPAN, TICKERS_ETFS, TICKERS_SECTORS, DAX, MDAX, SP500)
print(f"Universum: {len(ALL_TICKERS)} Ticker")
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

RATES_TO_EUR = {
    "EUR": 1.0,
    "USD": 0.92,
    "JPY": 0.0061,
    "GBP": 1.17,
    "GBp": 0.0117,
    "CHF": 1.04,
    "DKK": 0.134
}

def detect_native_currency(ticker):
    if ticker.endswith(".T"):
        return "JPY"
    if ticker.endswith((".DE", ".PA", ".AS", ".MI", ".MC")):
        return "EUR"
    if ticker.endswith(".L"):
        return "GBP"
    if ticker.endswith(".SW"):
        return "CHF"
    if ticker.endswith(".CO"):
        return "DKK"
    return "USD"

def load_live_forex():
    global RATES_TO_EUR
    pairs = {
        "USD": "EURUSD=X",
        "JPY": "EURJPY=X",
        "GBP": "EURGBP=X",
        "CHF": "EURCHF=X",
        "DKK": "EURDKK=X"
    }
    try:
        tickers_str = " ".join(pairs.values())
        fx_data = yf.download(tickers_str, period="5d", interval="1d", progress=False)
        close_df = fx_data["Close"] if "Close" in fx_data else fx_data

        for cur, pair in pairs.items():
            try:
                s = close_df[pair].dropna()
                if not s.empty:
                    eur_rate = float(s.iloc[-1])
                    if eur_rate > 0:
                        RATES_TO_EUR[cur] = 1.0 / eur_rate
            except Exception:
                pass
        RATES_TO_EUR["GBp"] = RATES_TO_EUR.get("GBP", 1.17) / 100.0
    except Exception as e:
        print(f"Forex-Abruf fehlgeschlagen, nutze Fallback-Kurse: {e}")

def to_eur(value, cur):
    if value is None:
        return None
    factor = RATES_TO_EUR.get(cur, 1.0)
    return round(value * factor, 4)

def clean_val(val, default=None):
    if val is None:
        return default
    if isinstance(val, (float, int)):
        if math.isnan(val) or math.isinf(val):
            return default
        return round(val, 4) if isinstance(val, float) else val
    return val

def df_to_dict_records(df, cur):
    if df is None or df.empty:
        return []
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

def process_fund_data(ticker_obj):
    """Extrahiert robust die Top-Holdings und wandelt Gewichtungen in Prozent (0-100) um."""
    holdings = []
    try:
        fd = getattr(ticker_obj, "funds_data", None)
        if fd is not None:
            th = getattr(fd, "top_holdings", None)
            if th is not None and not th.empty:
                for idx, row in th.iterrows():
                    name = row.get("Holding Name") or row.get("Name") or str(idx)
                    pct = row.get("Percentage") or row.get("Weight") or 0.0
                    
                    weight = 0.0
                    try:
                        weight = float(pct)
                        # Wenn yfinance Dezimalzahlen zurückgibt (z.B. 0.08 = 8%), in Prozent umrechnen
                        if 0 < weight <= 1.0:
                            weight *= 100.0
                    except Exception:
                        weight = 0.0

                    if weight > 0:
                        holdings.append({"name": str(name), "weight": round(weight, 2)})
    except Exception as e:
        print(f"Fehler beim Extrahieren der Fondsdaten: {e}")
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
                    summary["buysCount2Q"] += 1
                    summary["buyValueTotal"] += abs(val_eur or 0.0)
                elif trade_type == "Sell":
                    summary["sellsCount2Q"] += 1
                    summary["sellValueTotal"] += abs(val_eur or 0.0)
                trades.append({
                    "date": d_str,
                    "insider": str(row.get("Insider", "Unbekannt")),
                    "position": str(row.get("Position", "")),
                    "type": trade_type,
                    "shares": clean_val(row.get("Shares"), 0),
                    "value": val_eur
                })
            if summary["buyValueTotal"] > summary["sellValueTotal"] * 1.2:
                summary["sentiment"] = "Bullish"
            elif summary["sellValueTotal"] > summary["buyValueTotal"] * 1.2:
                summary["sentiment"] = "Bearish"
    except Exception:
        pass
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
                    "hold": latest["hold"], "sell": latest["sell"], "strongSell": latest["strongSell"]
                }
    except Exception:
        pass

    eps_estimates = []
    try:
        e_hist = ticker_obj.earnings_history
        if e_hist is not None and not e_hist.empty:
            for idx, row in e_hist.tail(8).iterrows():
                eps_estimates.append({
                    "quarter": idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10],
                    "estimate": clean_val(to_eur(clean_val(row.get("epsEstimate")), cur)),
                    "actual": clean_val(to_eur(clean_val(row.get("epsActual")), cur)),
                    "surprisePercent": clean_val(row.get("surprisePercent"))
                })
    except Exception:
        pass

    def _ts_date(v):
        try:
            if v:
                return datetime.fromtimestamp(v, timezone.utc).date().isoformat()
        except Exception:
            pass
        return None

    next_earnings_date = _ts_date(info.get("earningsTimestampStart") or info.get("earningsTimestamp"))

    eps_forecast = None
    try:
        est_df = ticker_obj.earnings_estimate
        if est_df is not None and not est_df.empty and "0q" in est_df.index:
            row = est_df.loc["0q"]
            avg = clean_val(to_eur(clean_val(row.get("avg")), cur))
            if avg is not None:
                eps_forecast = {
                    "date": next_earnings_date,
                    "estimate": avg,
                    "low": clean_val(to_eur(clean_val(row.get("low")), cur)),
                    "high": clean_val(to_eur(clean_val(row.get("high")), cur)),
                    "analysts": int(clean_val(row.get("numberOfAnalysts"), 0) or 0) or None
                }
    except Exception:
        pass

    return {"targets": targets, "recommendations": recommendations, "epsEstimates": eps_estimates,
            "nextEarningsDate": next_earnings_date, "epsForecast": eps_forecast}

def fetch_full_stock(ticker_sym):
    t = yf.Ticker(ticker_sym)
    info = t.info or {}
    cur = info.get("currency") or detect_native_currency(ticker_sym)

    country = info.get("country", "")
    if not country:
        if ticker_sym.endswith(".T"): country = "Japan"
        elif ticker_sym.endswith(".DE"): country = "Deutschland"
        elif ticker_sym.endswith(".MI"): country = "Italien"
        else: country = "USA"

    profile = {
        "ticker": ticker_sym,
        "name": info.get("shortName") or info.get("longName") or ticker_sym,
        "sector": info.get("sector", "Sonstige"),
        "industry": info.get("industry", "N/A"),
        "country": country,
        "currency": "EUR",
        "nativeCurrency": cur,
        "exchange": info.get("exchange", "N/A")
    }

    raw_curr = clean_val(info.get("currentPrice") or info.get("regularMarketPrice"), 0.0)
    raw_prev = clean_val(info.get("previousClose") or info.get("regularMarketPreviousClose"), raw_curr)

    curr_p = clean_val(to_eur(raw_curr, cur), 0.0)
    prev_p = clean_val(to_eur(raw_prev, cur), curr_p)
    chg_abs = round(curr_p - prev_p, 4) if curr_p and prev_p else 0.0
    chg_pct = round(((raw_curr - raw_prev) / raw_prev) * 100, 2) if raw_prev else 0.0

    raw_mcap = clean_val(info.get("marketCap"), 0)
    market_cap_eur = clean_val(to_eur(raw_mcap, cur), 0)

    quote = {
        "price": curr_p,
        "change": chg_abs,
        "changePercent": chg_pct,
        "marketCap": market_cap_eur,
        "fiftyTwoWeekLow": clean_val(to_eur(clean_val(info.get("fiftyTwoWeekLow")), cur)),
        "fiftyTwoWeekHigh": clean_val(to_eur(clean_val(info.get("fiftyTwoWeekHigh")), cur)),
        "volume": clean_val(info.get("regularMarketVolume")),
        "avgVolume": clean_val(info.get("averageVolume")),
        "currency": "EUR"
    }

    ratios = {
        "peTrailing": clean_val(info.get("trailingPE")),
        "peForward": clean_val(info.get("forwardPE")),
        "pegRatio": clean_val(info.get("pegRatio")),
        "dividendYield": clean_val(info.get("dividendYield")),
        "profitMargins": clean_val(info.get("profitMargins")),
        "debtToEquity": clean_val(info.get("debtToEquity")),
        "revenueGrowth": clean_val(info.get("revenueGrowth")),
        "earningsGrowth": clean_val(info.get("earningsGrowth") if info.get("earningsGrowth") is not None else info.get("earningsQuarterlyGrowth"))
    }

    chart_history = []
    try:
        hist = t.history(period="2y", interval="1d")
        for dt, row in hist.iterrows():
            chart_history.append({
                "date": dt.strftime("%Y-%m-%d"),
                "close": clean_val(to_eur(clean_val(row["Close"]), cur)),
                "volume": clean_val(row["Volume"])
            })
    except Exception:
        pass

    return {
        "ticker": ticker_sym,
        "profile": profile,
        "quote": quote,
        "ratios": ratios,
        "financials": {
            "incomeStatement": {"quarterly": df_to_dict_records(t.quarterly_income_stmt, cur), "annual": df_to_dict_records(t.income_stmt, cur)},
            "balanceSheet": {"quarterly": df_to_dict_records(t.quarterly_balance_sheet, cur), "annual": df_to_dict_records(t.balance_sheet, cur)},
            "cashFlow": {"quarterly": df_to_dict_records(t.quarterly_cashflow, cur), "annual": df_to_dict_records(t.cashflow, cur)}
        },
        "analysts": process_analyst_data(info, t, cur),
        "insider": process_insider_data(t, cur),
        "holdings": process_fund_data(t),
        "chartHistory": chart_history,
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }

def rsi_last(closes, n=14):
    if len(closes) <= n:
        return None
    avg_gain = avg_loss = 0.0
    value = None
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gain, loss = (diff if diff > 0 else 0.0), (-diff if diff < 0 else 0.0)
        if i <= n:
            avg_gain += gain / n
            avg_loss += loss / n
            if i < n:
                continue
        else:
            avg_gain = (avg_gain * (n - 1) + gain) / n
            avg_loss = (avg_loss * (n - 1) + loss) / n
        value = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
    return round(value, 1) if value is not None else None

def trend_extras(history):
    out = {"smaTrend": None, "cross": None, "crossDaysAgo": None, "rsi": None}
    closes = [p.get("close") for p in (history or []) if p.get("close") is not None]
    n = len(closes)
    out["rsi"] = rsi_last(closes)
    if n < 201:
        return out

    def sma_at(i, w):
        return sum(closes[i - w + 1:i + 1]) / w

    last_sign, last_cross_idx, last_cross_type = None, None, None
    for i in range(199, n):
        diff = sma_at(i, 50) - sma_at(i, 200)
        sign = 1 if diff > 0 else (-1 if diff < 0 else 0)
        if sign == 0:
            continue
        if last_sign is not None and sign != last_sign:
            last_cross_idx = i
            last_cross_type = "golden" if sign > 0 else "death"
        last_sign = sign

    out["smaTrend"] = "up" if last_sign and last_sign > 0 else "down"
    if last_cross_idx is not None:
        out["cross"] = last_cross_type
        out["crossDaysAgo"] = n - 1 - last_cross_idx
    return out

def screener_extras(st):
    ratios = st.get("ratios", {}) or {}
    quote = st.get("quote", {}) or {}
    out = {
        "forwardPe": ratios.get("peForward"),
        "peg": ratios.get("pegRatio"),
        "debtToEquity": ratios.get("debtToEquity"),
        "rangePos": None,
        "upside": None,
    }
    out.update(trend_extras(st.get("chartHistory")))
    lo, hi, px = quote.get("fiftyTwoWeekLow"), quote.get("fiftyTwoWeekHigh"), quote.get("price")
    if lo is not None and hi is not None and px is not None and hi > lo:
        out["rangePos"] = round(max(0.0, min(100.0, (px - lo) / (hi - lo) * 100)), 1)
    targets = (st.get("analysts") or {}).get("targets") or {}
    tgt = targets.get("mean")
    if tgt and px:
        out["upside"] = round((tgt / px - 1) * 100, 1)
    out["analystCount"] = targets.get("analystCount")
    analysts_block = st.get("analysts") or {}
    out["nextEarningsDate"] = analysts_block.get("nextEarningsDate")
    _recs = analysts_block.get("recommendations") or {}
    out["recScore"] = _recs.get("score")
    bd = _recs.get("breakdown") or {}
    _tot = sum(int(bd.get(k) or 0) for k in ("strongBuy", "buy", "hold", "sell", "strongSell"))
    out["buyPct"] = round((int(bd.get("strongBuy") or 0) + int(bd.get("buy") or 0)) / _tot * 100, 1) if _tot else None
    out["updatedAt"] = st.get("updatedAt")
    return out

def run_delta_sync(tickers):
    load_live_forex()
    print(f"Starte Delta-Sync für {len(tickers)} Ticker...")
    batch_df = yf.download(tickers, period="5d", interval="1d", group_by="ticker", auto_adjust=False, threads=True)

    universe_file = os.path.join(DATA_DIR, "universe.json")
    universe_map = {}
    if os.path.exists(universe_file):
        try:
            with open(universe_file, "r", encoding="utf-8") as f:
                for item in json.load(f):
                    universe_map[item["ticker"]] = item
        except Exception:
            pass

    for sym in tickers:
        stock_file = os.path.join(DATA_DIR, f"{sym}.json")
        stock_data = None
        if os.path.exists(stock_file):
            try:
                with open(stock_file, "r", encoding="utf-8") as f:
                    stock_data = json.load(f)
            except Exception:
                pass

        if not stock_data:
            stock_data = fetch_full_stock(sym)

        cur = stock_data.get("profile", {}).get("nativeCurrency") or detect_native_currency(sym)

        _an = stock_data.get("analysts") or {}
        _nd = _an.get("nextEarningsDate")
        if not _nd or "epsForecast" not in _an or _nd < datetime.now(timezone.utc).date().isoformat():
            try:
                _t = yf.Ticker(sym)
                stock_data["analysts"] = process_analyst_data(_t.info or {}, _t, cur)
            except Exception:
                pass

        if not stock_data.get("holdings"):
            try:
                _t = yf.Ticker(sym)
                stock_data["holdings"] = process_fund_data(_t)
            except Exception:
                pass

        try:
            df_sym = batch_df[sym] if len(tickers) > 1 else batch_df
            df_clean = df_sym.dropna(subset=["Close"])
            if not df_clean.empty:
                last_row = df_clean.iloc[-1]
                prev_row = df_clean.iloc[-2] if len(df_clean) > 1 else last_row

                raw_curr = clean_val(last_row["Close"])
                raw_prev = clean_val(prev_row["Close"])

                curr_eur = clean_val(to_eur(raw_curr, cur), 0.0)
                prev_eur = clean_val(to_eur(raw_prev, cur), curr_eur)

                chg_abs = round(curr_eur - prev_eur, 4)
                chg_pct = round(((raw_curr - raw_prev) / raw_prev) * 100, 2) if raw_prev else 0.0

                stock_data["quote"]["price"] = curr_eur
                stock_data["quote"]["change"] = chg_abs
                stock_data["quote"]["changePercent"] = chg_pct
                stock_data["quote"]["currency"] = "EUR"
                stock_data["quote"]["volume"] = clean_val(last_row.get("Volume", 0))

                last_date = df_clean.index[-1].strftime("%Y-%m-%d")
                history = stock_data.get("chartHistory", [])
                history = [p for p in history if p["date"] != last_date]
                history.append({"date": last_date, "close": curr_eur, "volume": clean_val(last_row.get("Volume", 0))})
                history.sort(key=lambda x: x["date"])
                stock_data["chartHistory"] = history[-520:]
                stock_data["updatedAt"] = datetime.now(timezone.utc).isoformat()
        except Exception as e:
            print(f"Hinweis: Delta-Update für {sym} übersprungen ({e})")

        with open(stock_file, "w", encoding="utf-8") as f:
            json.dump(stock_data, f, ensure_ascii=False, indent=2)

        u_item = universe_map.get(sym, {
            "ticker": sym,
            "name": stock_data["profile"]["name"],
            "sector": stock_data["profile"]["sector"],
            "country": stock_data["profile"]["country"]
        })
        u_item["currency"] = "EUR"
        u_item["price"] = stock_data["quote"]["price"]
        u_item["changePercent"] = stock_data["quote"]["changePercent"]
        u_item["marketCap"] = stock_data["quote"]["marketCap"]

        ratios = stock_data.get("ratios", {}) or {}
        u_item["pe"] = ratios.get("peTrailing")
        u_item["dividendYield"] = ratios.get("dividendYield")
        u_item["revGrowth"] = ratios.get("revenueGrowth")
        u_item["profitMargins"] = ratios.get("profitMargins")
        u_item.update(screener_extras(stock_data))

        universe_map[sym] = u_item

    with open(universe_file, "w", encoding="utf-8") as f:
        json.dump(list(universe_map.values()), f, ensure_ascii=False, indent=2)

    print(f"Delta-Sync abgeschlossen.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["delta", "full"], default="delta")
    parser.add_argument("--ticker", type=str, default="", help="Optional: Einzelner Ticker")
    args = parser.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)
    load_live_forex()

    if not os.path.exists(os.path.join(DATA_DIR, "universe.json")):
        args.mode = "full"

    target_tickers = [args.ticker.strip().upper()] if args.ticker else ALL_TICKERS

    if args.mode == "delta":
        run_delta_sync(target_tickers)
    else:
        universe_map = {}
        universe_file = os.path.join(DATA_DIR, "universe.json")
        if os.path.exists(universe_file):
            try:
                with open(universe_file, "r", encoding="utf-8") as f:
                    for item in json.load(f):
                        universe_map[item["ticker"]] = item
            except Exception:
                pass
                
        if not args.ticker:
            universe_map = {}

        for sys_val in target_tickers:
            try:
                st = fetch_full_stock(sys_val)
                with open(os.path.join(DATA_DIR, f"{sys_val}.json"), "w", encoding="utf-8") as f:
                    json.dump(st, f, ensure_ascii=False, indent=2)
                
                new_item = {
                    "ticker": sys_val,
                    "name": st["profile"]["name"],
                    "sector": st["profile"]["sector"],
                    "country": st["profile"]["country"],
                    "currency": "EUR",
                    "price": st["quote"]["price"],
                    "changePercent": st["quote"]["changePercent"],
                    "marketCap": st["quote"]["marketCap"],
                    "pe": st["ratios"]["peTrailing"],
                    "dividendYield": st["ratios"]["dividendYield"],
                    "revGrowth": st["ratios"].get("revenueGrowth"),
                    "profitMargins": st["ratios"].get("profitMargins"),
                    **screener_extras(st)
                }
                universe_map[sys_val] = new_item
                time.sleep(0.3)
            except Exception as e:
                print(f"Fehler bei {sys_val}: {e}")
                
        with open(universe_file, "w", encoding="utf-8") as f:
            json.dump(list(universe_map.values()), f, ensure_ascii=False, indent=2)

if __name__ == "main":
    main()

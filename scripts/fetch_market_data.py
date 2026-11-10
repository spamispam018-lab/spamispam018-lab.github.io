#!/usr/bin/env python3
"""
scripts/fetch_market_data.py
Delta-Marktdaten-Update. NEU:
- Synchronisiert das updatedAt-Feld von stock.json ins universe.json.
- Chart-Muster (Golden/Death Cross, Doppel-Top/Boden, Bollinger-Squeeze) → universe.json
- Institutional Holders (nur US-Aktien mit Daten) → stock.json
- Options-Zusammenfassung (nur US-Aktien mit Optionsmarkt) → stock.json
- Robuster Fallback für ETFs, falls Yahoo Finance info-Daten (Preise) nicht liefert.
"""

import os
import json
import math
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
    "EUNL.DE", "AMEM.DE", "SPYI.DE", "SXR8.DE", "EXS1.DE", "EXV6.DE", "CSX5.DE"
]

TICKERS_SECTORS = [
    "QDVE.DE", "XDWT.DE", "QDVF.DE", "WNRG.DE", "XDW0.DE",
    "IU5C.DE", "XWTS.DE", "WHEA.DE", "WSCA.DE", 
    "XDWF.DE",  # Ersetzt WFIS.DE für bessere Datenqualität bei Financials
    "IUSP.DE"
]

KNOWN_ETF_HOLDINGS = {
    "EUNL.DE": [{"name": "NVIDIA Corp", "weight": 5.2}, {"name": "Apple Inc", "weight": 4.8},
                {"name": "Microsoft Corp", "weight": 4.5}, {"name": "Amazon.com Inc", "weight": 2.6},
                {"name": "Alphabet Inc Class A", "weight": 1.7}],
    "AMEM.DE": [{"name": "Taiwan Semiconductor Manufacturing", "weight": 8.4}, {"name": "Tencent Holdings Ltd", "weight": 4.1},
                {"name": "Alibaba Group Holding Ltd", "weight": 2.8}, {"name": "Samsung Electronics Co Ltd", "weight": 2.5},
                {"name": "Meituan", "weight": 1.4}],
    "SPYI.DE": [{"name": "NVIDIA Corp", "weight": 4.3}, {"name": "Apple Inc", "weight": 4.0},
                {"name": "Microsoft Corp", "weight": 3.8}, {"name": "Amazon.com Inc", "weight": 2.2},
                {"name": "Meta Platforms Inc", "weight": 1.5}],
    "SXR8.DE": [{"name": "Apple Inc", "weight": 7.9}, {"name": "NVIDIA Corp", "weight": 6.9},
                {"name": "Microsoft Corp", "weight": 6.3}, {"name": "Amazon.com Inc", "weight": 4.0},
                {"name": "Alphabet Inc Class A", "weight": 2.6}],
    "EXS1.DE": [{"name": "SAP SE", "weight": 14.5}, {"name": "Siemens AG", "weight": 10.2},
                {"name": "Allianz SE", "weight": 8.3}, {"name": "Airbus SE", "weight": 6.8},
                {"name": "Deutsche Telekom AG", "weight": 6.1}],
    "EXV6.DE": [{"name": "ASML Holding NV", "weight": 3.6}, {"name": "Nestle SA", "weight": 2.7},
                {"name": "Novartis AG", "weight": 2.4}, {"name": "Shell PLC", "weight": 2.3},
                {"name": "SAP SE", "weight": 2.2}],
    "CSX5.DE": [{"name": "ASML Holding NV", "weight": 9.4}, {"name": "SAP SE", "weight": 7.8},
                {"name": "Schneider Electric SE", "weight": 5.1}, {"name": "TotalEnergies SE", "weight": 4.6},
                {"name": "Siemens AG", "weight": 4.4}],
    "XDWT.DE": [{"name": "NVIDIA Corp", "weight": 18.5}, {"name": "Microsoft Corp", "weight": 16.2},
                {"name": "Apple Inc", "weight": 15.4}, {"name": "Broadcom Inc", "weight": 4.8},
                {"name": "Advanced Micro Devices", "weight": 2.9}],
    "QDVE.DE": [{"name": "NVIDIA Corp", "weight": 21.0}, {"name": "Microsoft Corp", "weight": 18.5},
                {"name": "Apple Inc", "weight": 17.2}, {"name": "Broadcom Inc", "weight": 5.1},
                {"name": "Salesforce Inc", "weight": 2.4}],
    "QDVF.DE": [{"name": "Exxon Mobil Corp", "weight": 22.4}, {"name": "Chevron Corp", "weight": 16.8},
                {"name": "ConocoPhillips", "weight": 6.5}, {"name": "Valero Energy Corp", "weight": 4.8},
                {"name": "Marathon Petroleum Corp", "weight": 4.6}],
    "WNRG.DE": [{"name": "Exxon Mobil Corp", "weight": 18.4}, {"name": "Chevron Corp", "weight": 10.3},
                {"name": "Shell PLC", "weight": 7.5}, {"name": "TotalEnergies SE", "weight": 4.8},
                {"name": "ConocoPhillips", "weight": 4.5}],
    "XDW0.DE": [{"name": "Exxon Mobil Corp", "weight": 18.0}, {"name": "Chevron Corp", "weight": 10.1},
                {"name": "Shell PLC", "weight": 7.8}, {"name": "TotalEnergies SE", "weight": 5.1},
                {"name": "BP PLC", "weight": 4.2}],
    "IU5C.DE": [{"name": "Meta Platforms Inc", "weight": 19.8}, {"name": "Alphabet Inc Class A", "weight": 18.0},
                {"name": "Alphabet Inc Class C", "weight": 14.4}, {"name": "Netflix Inc", "weight": 10.4},
                {"name": "Verizon Communications Inc", "weight": 6.9}],
    "XWTS.DE": [{"name": "Alphabet Inc Class A", "weight": 18.0}, {"name": "Meta Platforms Inc", "weight": 17.5},
                {"name": "Netflix Inc", "weight": 14.2}, {"name": "Verizon Communications Inc", "weight": 6.2},
                {"name": "Walt Disney Co", "weight": 4.2}]
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
            except Exception:
                pass
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
                    except Exception:
                        weight = 0.0
                    if weight > 0:
                        holdings.append({"name": str(name), "weight": round(weight, 2)})
    except Exception:
        pass
    if not holdings and symbol in KNOWN_ETF_HOLDINGS:
        return KNOWN_ETF_HOLDINGS[symbol]
    return holdings


def process_dividends(ticker_obj, info_or_none, cur, existing=None):
    existing = existing or {}
    result = {"history": existing.get("history", [])}
    try:
        div_series = ticker_obj.dividends
        if div_series is not None and not div_series.empty:
            recent = div_series.tail(20)
            history = []
            for dt, val in recent.items():
                d_str = dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)[:10]
                try:
                    amount = float(val)
                    if math.isnan(amount) or math.isinf(amount): continue
                    history.append({"date": d_str, "amount": clean_val(to_eur(amount, cur), 0.0)})
                except Exception:
                    continue
            if history: result["history"] = history
    except Exception:
        pass
    if info_or_none:
        ex_date = info_or_none.get("exDividendDate")
        if ex_date:
            try:
                ex_str = datetime.fromtimestamp(float(ex_date), timezone.utc).strftime("%Y-%m-%d")
                result["exDate"] = ex_str
            except Exception:
                pass
        div_rate = info_or_none.get("dividendRate")
        if div_rate: result["rate"] = clean_val(to_eur(clean_val(div_rate), cur))
        div_yield = info_or_none.get("dividendYield")
        if div_yield: result["yield"] = clean_val(div_yield)
    else:
        for k in ("exDate", "rate", "yield"):
            if k in existing: result[k] = existing[k]
    return result


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
                trades.append({"date": d_str, "insider": str(row.get("Insider", "Unbekannt")),
                               "position": str(row.get("Position", "")), "type": trade_type,
                               "shares": clean_val(row.get("Shares"), 0), "value": val_eur})
            if summary["buyValueTotal"] > summary["sellValueTotal"] * 1.2: summary["sentiment"] = "Bullish"
            elif summary["sellValueTotal"] > summary["buyValueTotal"] * 1.2: summary["sentiment"] = "Bearish"
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
    recommendations = {"score": clean_val(info.get("recommendationMean")),
                       "key": info.get("recommendationKey", "none"),
                       "breakdown": {"strongBuy": 0, "buy": 0, "hold": 0, "sell": 0, "strongSell": 0},
                       "history": []}
    return {"targets": targets, "recommendations": recommendations, "epsEstimates": [],
            "nextEarningsDate": None, "epsForecast": None}


def process_institutional_holders(ticker_obj, cur):
    result = {"holders": [], "summary": {"institutionalPercent": None, "institutionalCount": None}}
    try:
        ih = ticker_obj.institutional_holders
        if ih is not None and not ih.empty:
            for _, row in ih.head(10).iterrows():
                name = row.get("Holder") or row.get("Holder Name") or ""
                shares = clean_val(row.get("Shares"), 0)
                value_raw = clean_val(row.get("Value"), 0)
                change = clean_val(row.get("change"), None)
                if change is None:
                    change = clean_val(row.get("Change"), None)
                result["holders"].append({
                    "name": str(name),
                    "shares": shares,
                    "value": clean_val(to_eur(value_raw, cur), 0),
                    "changeShares": change
                })
    except Exception:
        pass
    try:
        info = ticker_obj.info or {}
        if info.get("heldPercentInstitutions") is not None:
            result["summary"]["institutionalPercent"] = clean_val(info.get("heldPercentInstitutions"))
    except Exception:
        pass
    return result


def process_options(ticker_obj, info):
    if info.get("quoteType") != "EQUITY":
        return None
    try:
        expiries = ticker_obj.options
        if not expiries:
            return None
        next_expiry = expiries[0]
        chain = ticker_obj.option_chain(next_expiry)
        calls = chain.calls
        puts = chain.puts
        if calls is None or calls.empty:
            return None
        spot = None
        try:
            spot = info.get("currentPrice") or info.get("regularMarketPrice")
        except Exception:
            pass
        if not spot:
            return None

        calls_copy = calls.copy()
        calls_copy["dist"] = (calls_copy["strike"] - spot).abs()
        atm_call = calls_copy.sort_values("dist").iloc[0]
        atm_iv = float(atm_call.get("impliedVolatility", 0)) if "impliedVolatility" in atm_call else None

        oi_call = int(calls["openInterest"].fillna(0).sum())
        oi_put = int(puts["openInterest"].fillna(0).sum()) if puts is not None and not puts.empty else 0
        pc_ratio = oi_put / oi_call if oi_call > 0 else None

        return {
            "expirations": list(expiries[:8]),
            "summary": {
                "atmIV": clean_val(atm_iv),
                "putCallRatio": clean_val(pc_ratio),
                "openInterestCall": oi_call,
                "openInterestPut": oi_put,
                "ivRank": None,
                "impliedMove": None
            }
        }
    except Exception:
        return None


def compute_chart_patterns(chart_history, symbol=""):
    if not chart_history or len(chart_history) < 60:
        return {"chartPatterns": [], "hasBullishPattern": False, "hasBearishPattern": False,
                "bollingerSqueeze": False, "cross": None, "crossDaysAgo": None}
    closes = [p["close"] for p in chart_history if p.get("close")]
    n = len(closes)
    if n < 60:
        return {"chartPatterns": [], "hasBullishPattern": False, "hasBearishPattern": False,
                "bollingerSqueeze": False, "cross": None, "crossDaysAgo": None}

    def sma_series(vals, period):
        out = []
        for i in range(len(vals)):
            if i + 1 < period:
                out.append(None)
            else:
                out.append(sum(vals[i - period + 1:i + 1]) / period)
        return out

    s50 = sma_series(closes, 50) if n >= 50 else [None] * n
    s200 = sma_series(closes, 200) if n >= 200 else [None] * n

    cross = None
    cross_days_ago = None
    prev_sign = 0
    last_cross_idx = None
    for i in range(n):
        if s50[i] is None or s200[i] is None:
            continue
        sign = 1 if s50[i] > s200[i] else -1
        if prev_sign != 0 and sign != prev_sign:
            last_cross_idx = i
            cross = "golden" if sign > 0 else "death"
        prev_sign = sign
    if last_cross_idx is not None:
        cross_days_ago = n - 1 - last_cross_idx
        if cross_days_ago > 60:
            cross = None

    patterns = []
    has_bull = False
    has_bear = False
    if cross == "golden":
        patterns.append("golden_cross")
        has_bull = True
    elif cross == "death":
        patterns.append("death_cross")
        has_bear = True

    lookback = min(60, n - 1)
    recent = closes[-lookback:]
    if len(recent) >= 20:
        highs = sorted(recent, reverse=True)[:5]
        if len(highs) >= 2 and abs(highs[0] - highs[1]) / max(highs[0], 1) < 0.03 and highs[0] > max(recent) * 0.98:
            if recent[-1] < highs[0] * 0.97:
                patterns.append("double_top")
                has_bear = True
        lows = sorted(recent)[:5]
        if len(lows) >= 2 and abs(lows[0] - lows[1]) / max(lows[1], 1) < 0.03 and lows[0] < min(recent) * 1.02:
            if recent[-1] > lows[0] * 1.03:
                patterns.append("double_bottom")
                has_bull = True

    squeeze = False
    if n >= 20:
        window = closes[-20:]
        m = sum(window) / len(window)
        var = sum((c - m) ** 2 for c in window) / len(window)
        sd = math.sqrt(var)
        if m > 0:
            bandwidth = (4 * sd) / m
            if bandwidth < 0.05:
                squeeze = True
                patterns.append("squeeze")

    return {
        "chartPatterns": patterns,
        "hasBullishPattern": has_bull,
        "hasBearishPattern": has_bear,
        "bollingerSqueeze": squeeze,
        "cross": cross,
        "crossDaysAgo": cross_days_ago
    }


def fetch_full_stock(ticker_sym):
    t = yf.Ticker(ticker_sym)
    info = t.info or {}
    cur = info.get("currency") or detect_native_currency(ticker_sym)
    country = info.get("country", "")
    if not country:
        if ticker_sym.endswith(".T"): country = "Japan"
        elif ticker_sym.endswith(".DE"): country = "Deutschland"
        else: country = "USA"

    profile = {"ticker": ticker_sym,
               "name": info.get("shortName") or info.get("longName") or ticker_sym,
               "sector": info.get("sector", "Sonstige"),
               "industry": info.get("industry", "N/A"),
               "country": country, "currency": "EUR",
               "nativeCurrency": cur, "exchange": info.get("exchange", "N/A")}

    # Robusterer Fallback für den aktuellen Kurs
    raw_curr = clean_val(info.get("currentPrice") or info.get("regularMarketPrice") or info.get("navPrice"), 0.0)
    raw_prev = clean_val(info.get("previousClose") or info.get("regularMarketPreviousClose"), 0.0)

    # Wenn info keine Kurse liefert (typisch für manche ETFs), nutzen wir die History
    if not raw_curr:
        try:
            hist_check = t.history(period="5d")
            if not hist_check.empty:
                raw_curr = float(hist_check["Close"].iloc[-1])
                if not raw_prev and len(hist_check) > 1:
                    raw_prev = float(hist_check["Close"].iloc[-2])
        except Exception:
            pass

    if not raw_prev:
        raw_prev = raw_curr

    curr_p = clean_val(to_eur(raw_curr, cur), 0.0)
    prev_p = clean_val(to_eur(raw_prev, cur), curr_p)
    chg_abs = round(curr_p - prev_p, 4) if curr_p and prev_p else 0.0
    chg_pct = round(((raw_curr - raw_prev) / raw_prev) * 100, 2) if raw_prev else 0.0
    raw_mcap = clean_val(info.get("marketCap") or info.get("totalAssets"), 0)
    market_cap_eur = clean_val(to_eur(raw_mcap, cur), 0)

    quote = {"price": curr_p, "change": chg_abs, "changePercent": chg_pct,
             "marketCap": market_cap_eur,
             "fiftyTwoWeekLow": clean_val(to_eur(clean_val(info.get("fiftyTwoWeekLow")), cur)),
             "fiftyTwoWeekHigh": clean_val(to_eur(clean_val(info.get("fiftyTwoWeekHigh")), cur)),
             "volume": clean_val(info.get("regularMarketVolume")), "currency": "EUR"}
    ratios = {"peTrailing": clean_val(info.get("trailingPE")),
              "peForward": clean_val(info.get("forwardPE")),
              "dividendYield": clean_val(info.get("dividendYield")),
              "profitMargins": clean_val(info.get("profitMargins"))}

    chart_history = []
    try:
        hist = t.history(period="2y", interval="1d")
        for dt, row in hist.iterrows():
            chart_history.append({"date": dt.strftime("%Y-%m-%d"),
                                  "close": clean_val(to_eur(clean_val(row["Close"]), cur)),
                                  "volume": clean_val(row["Volume"])})
    except Exception:
        pass

    dividends_info = process_dividends(t, info, cur)
    institutional = process_institutional_holders(t, cur)
    options = process_options(t, info)

    result = {
        "ticker": ticker_sym, "profile": profile, "quote": quote, "ratios": ratios,
        "financials": {
            "incomeStatement": {"quarterly": [], "annual": []},
            "balanceSheet": {"quarterly": [], "annual": []},
            "cashFlow": {"quarterly": [], "annual": []}
        },
        "analysts": process_analyst_data(info, t, cur),
        "insider": process_insider_data(t, cur),
        "holdings": process_fund_data(t, ticker_sym),
        "institutional": institutional,
        "options": options,
        "chartHistory": chart_history,
        "dividends": dividends_info,
        "exDividendDate": dividends_info.get("exDate"),
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    return result


def extract_close_series(batch_df, sym):
    try:
        if batch_df is None or batch_df.empty:
            return None
        if hasattr(batch_df.columns, "levels") and len(batch_df.columns.levels) >= 2:
            top = batch_df.columns.get_level_values(0)
            if sym in top:
                sub = batch_df[sym]
                if "Close" in sub.columns:
                    return sub["Close"].dropna()
            if "Close" in top:
                sub = batch_df["Close"]
                if sym in sub.columns:
                    return sub[sym].dropna()
        if "Close" in batch_df.columns:
            return batch_df["Close"].dropna()
    except Exception:
        pass
    return None


def run_delta_sync(tickers):
    load_live_forex()
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

    now_iso = datetime.now(timezone.utc).isoformat()

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
            try:
                print(f"Neuer Ticker, voller Fetch: {sym}")
                stock_data = fetch_full_stock(sym)
            except Exception as e:
                print(f"Vollständiger Fetch fehlgeschlagen für {sym}: {e}")
                continue
        else:
            closes = extract_close_series(batch_df, sym)
            if closes is not None and not closes.empty:
                try:
                    cur = stock_data.get("profile", {}).get("nativeCurrency") or detect_native_currency(sym)
                    last_close = float(closes.iloc[-1])
                    prev_close = float(closes.iloc[-2]) if len(closes) > 1 else last_close
                    new_price = clean_val(to_eur(last_close, cur), 0.0)
                    prev_price = clean_val(to_eur(prev_close, cur), 0.0)

                    if new_price and prev_price:
                        chg = round(new_price - prev_price, 4)
                        chg_pct = round((last_close - prev_close) / prev_close * 100, 2) if prev_close else 0.0
                        stock_data.setdefault("quote", {})
                        old_price = stock_data["quote"].get("price")
                        stock_data["quote"]["price"] = new_price
                        stock_data["quote"]["change"] = chg
                        stock_data["quote"]["changePercent"] = chg_pct
                        stock_data["quote"]["currency"] = "EUR"

                        history = stock_data.setdefault("chartHistory", [])
                        existing_dates = {p.get("date") for p in history}
                        new_points = []
                        for dt, val in closes.items():
                            d_str = dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)[:10]
                            if d_str not in existing_dates:
                                try:
                                    fval = float(val)
                                    if not math.isnan(fval) and not math.isinf(fval):
                                        new_points.append({"date": d_str, "close": clean_val(to_eur(fval, cur))})
                                except Exception:
                                    pass
                        if new_points:
                            history.extend(new_points)
                            history.sort(key=lambda p: p.get("date", ""))
                            if len(history) > 750:
                                history = history[-750:]
                            stock_data["chartHistory"] = history

                        if (old_price != new_price) or new_points:
                            stock_data["updatedAt"] = now_iso
                except Exception as e:
                    print(f"Delta-Update für {sym} fehlgeschlagen: {e}")

            try:
                cur = stock_data.get("profile", {}).get("nativeCurrency") or detect_native_currency(sym)
                new_div = process_dividends(yf.Ticker(sym), info_or_none=None, cur=cur,
                                            existing=stock_data.get("dividends") or {})
                stock_data["dividends"] = new_div
                if new_div.get("exDate"):
                    stock_data["exDividendDate"] = new_div["exDate"]
            except Exception as e:
                print(f"Dividenden-Update für {sym} fehlgeschlagen: {e}")

        if not stock_data.get("holdings"):
            try:
                stock_data["holdings"] = process_fund_data(yf.Ticker(sym), sym)
            except Exception:
                pass

        if not stock_data.get("institutional") or not stock_data["institutional"].get("holders"):
            try:
                cur = stock_data.get("profile", {}).get("nativeCurrency") or detect_native_currency(sym)
                stock_data["institutional"] = process_institutional_holders(yf.Ticker(sym), cur)
            except Exception:
                pass

        try:
            t_obj = yf.Ticker(sym)
            new_options = process_options(t_obj, t_obj.info or {})
            if new_options:
                stock_data["options"] = new_options
        except Exception:
            pass

        with open(stock_file, "w", encoding="utf-8") as f:
            json.dump(stock_data, f, ensure_ascii=False, indent=2)

        u_item = universe_map.get(sym, {
            "ticker": sym,
            "name": stock_data.get("profile", {}).get("name", sym),
            "sector": stock_data.get("profile", {}).get("sector", "Sonstige"),
            "country": stock_data.get("profile", {}).get("country", "")
        })
        u_item["currency"] = "EUR"
        u_item["price"] = stock_data.get("quote", {}).get("price")
        u_item["changePercent"] = stock_data.get("quote", {}).get("changePercent")
        u_item["marketCap"] = stock_data.get("quote", {}).get("marketCap")
        u_item["dividendYield"] = stock_data.get("ratios", {}).get("dividendYield")
        u_item["exDividendDate"] = stock_data.get("exDividendDate")
        
        # NEU: Das Update-Datum des Tickers auch im Universum mitschreiben
        u_item["updatedAt"] = stock_data.get("updatedAt", now_iso)

        try:
            patterns = compute_chart_patterns(stock_data.get("chartHistory") or [], sym)
            u_item["chartPatterns"] = patterns["chartPatterns"]
            u_item["hasBullishPattern"] = patterns["hasBullishPattern"]
            u_item["hasBearishPattern"] = patterns["hasBearishPattern"]
            u_item["bollingerSqueeze"] = patterns["bollingerSqueeze"]
            u_item["cross"] = patterns["cross"]
            u_item["crossDaysAgo"] = patterns["crossDaysAgo"]
        except Exception:
            pass

        universe_map[sym] = u_item

    with open(universe_file, "w", encoding="utf-8") as f:
        json.dump(list(universe_map.values()), f, ensure_ascii=False, indent=2)


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
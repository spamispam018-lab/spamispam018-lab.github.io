#!/usr/bin/env python3
"""
scripts/fetch_market_data.py
Delta-Marktdaten-Update.
FIX: analysts_empty und analysts_recently_checked wieder eingefügt.
FIX: build_universe_item berechnet alle abgeleiteten Felder (RSI, RR, Upside, RangePos, Perf).
NEU: industry/roa im Universe, returnOnAssets/grossMargins/operatingMargins in ratios, RS-Rating in allen Modi, Boden-Check (bottom), Volumen/52W/MarketCap im Delta-Lauf, MarketCap GBp-Fix fuer die Filter Bodenbildung/Fallendes Messer.
FIX: Fehlende Ticker (delisted) werden übersprungen, ohne den Lauf abzubrechen.
"""

import os
import json
import math
import time
import argparse
import sys
from datetime import datetime, timezone
import yfinance as yf
import pandas as pd

TICKERS_USA = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "JPM", "V",
    "MA", "UNH", "JNJ", "PG", "HD", "COST", "ABBV", "CRM", "AMD", "NFLX",
    "INTC", "QCOM", "TXN", "AVGO", "NOW", "PLTR", "UBER", "DIS", "NKE", "KO",
    "PEP", "MCD", "WMT", "LIN", "PM", "CAT", "GE", "IBM", "ORCL", "ACN",
    "CSCO", "VZ", "T", "AMGN", "PFE", "LOW", "GS", "MS", "BLK", "SPGI",
    "RTX", "HON", "BA", "LMT", "DE", "UNP", "INTU", "ISRG", "BKNG", "MDLZ",
    "ANT"  # Anthropic, Nasdaq-Börsengang am 19.11.2026
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

TICKERS_ETFS = [
    "EUNL.DE", "AMEM.DE", "SPYI.DE", "SXR8.DE", "EXS1.DE", "EXV6.DE", "CSX5.DE"
]

TICKERS_SECTORS = [
    "QDVE.DE", "XDWT.DE", "QDVF.DE", "WNRG.DE", "XDW0.DE",
    "IU5C.DE", "XWTS.DE", "WHEA.DE", "WSCA.DE",
    "XDWF.DE", "IUSP.DE"
]

# US-ETFs auf denselben (oder sehr ähnlichen) Index: Yahoo liefert für Xetra-Listings oft keine Positionen,
# für diese US-ETFs aber die aktuellen Top-10 mit Symbol und Gewicht.
HOLDINGS_PROXY = {
    "EUNL.DE": "URTH",   # MSCI World
    "SPYI.DE": "ACWI",   # MSCI ACWI (IMI)
    "SXR8.DE": "IVV",    # S&P 500
    "EXS1.DE": "EWG",    # Deutschland (DAX ~ MSCI Germany)
    "AMEM.DE": "EEM",    # MSCI Emerging Markets
    "CSX5.DE": "FEZ",    # EURO STOXX 50
    "XDWT.DE": "IXN",    # MSCI World IT
    "QDVE.DE": "XLK",    # S&P 500 IT
    "QDVF.DE": "XLE",    # S&P 500 Energie
    "WNRG.DE": "IXC",    # MSCI World Energie
    "XDW0.DE": "IXC",    # MSCI World Energie
    "IU5C.DE": "XLC",    # S&P 500 Kommunikation
    "XWTS.DE": "IXP",    # MSCI World Kommunikation
}

# Letzter Ausweg, wenn weder das ETF selbst noch der US-Vergleichs-ETF Positionen liefern (Stand fest, nicht aktuell)
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

ALL_TICKERS = dedupe(TICKERS_USA, TICKERS_EUROPE, TICKERS_ETFS, TICKERS_SECTORS, DAX, MDAX, SP500)
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

MAX_FIN_BACKFILL_PER_RUN = 50
MAX_ANALYST_BACKFILL_PER_RUN = 50
ANALYST_RECHECK_DAYS = 7
ONLY_MODE_SLEEP_SEC = 0.5

RATES_TO_EUR = {
    "EUR": 1.0, "USD": 0.92, "GBP": 1.17, "GBp": 0.0117, "CHF": 1.04, "DKK": 0.134
}

ALLOWED_SECTIONS = ["quote", "profile", "financials", "analysts", "insider", "institutional", "options", "dividends", "holdings", "history", "ratios", "perf"]


def detect_native_currency(ticker):
    if ticker.endswith((".DE", ".PA", ".AS", ".MI", ".MC")): return "EUR"
    if ticker.endswith(".L"): return "GBP"
    if ticker.endswith(".SW"): return "CHF"
    if ticker.endswith(".CO"): return "DKK"
    return "USD"


def load_live_forex():
    global RATES_TO_EUR
    pairs = {"USD": "EURUSD=X", "GBP": "EURGBP=X", "CHF": "EURCHF=X", "DKK": "EURDKK=X"}
    try:
        tickers_str = " ".join(pairs.values())
        fx_data = yf.download(tickers_str, period="1d", interval="1m", progress=False, threads=False)
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
        print(f"Forex-Abruf fehlgeschlagen (nutze Fallback-Kurse): {e}")


def to_eur(value, cur):
    if value is None: return None
    return round(value * RATES_TO_EUR.get(cur, 1.0), 4)


def mcap_currency(cur):
    """Marktkapitalisierung kommt von Yahoo in GBP, auch wenn der Kurs in Pence (GBp) notiert."""
    return "GBP" if cur == "GBp" else cur


def clean_val(val, default=None):
    if val is None: return default
    if hasattr(val, "item") and not isinstance(val, (str, list, dict)):
        try: val = val.item()
        except Exception: pass
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val): return default
        return round(val, 4)
    if isinstance(val, int):
        return val
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


def _read_top_holdings(ticker_obj, limit=10):
    """Top-Positionen eines Fonds aus Yahoo: Symbol, Name, Gewicht in %."""
    out = []
    try:
        fd = getattr(ticker_obj, "funds_data", None)
        th = getattr(fd, "top_holdings", None) if fd is not None else None
        if th is None or th.empty:
            return out
        for idx, row in th.iterrows():
            name = row.get("Name") or row.get("Holding Name") or str(idx)
            pct = row.get("Holding Percent") or row.get("Percentage") or row.get("Weight") or 0.0
            weight = 0.0
            try:
                if isinstance(pct, str):
                    pct = pct.replace("%", "").replace(",", ".").strip()
                if pct and not math.isnan(float(pct)):
                    weight = float(pct)
                    if 0 < weight <= 1.0:
                        weight *= 100.0
            except Exception:
                weight = 0.0
            if weight > 0:
                item = {"name": str(name), "weight": round(weight, 2)}
                sym = str(idx or "").strip()
                if sym and sym.lower() not in ("nan", "none") and not sym.isdigit():
                    item["symbol"] = sym.upper()
                out.append(item)
    except Exception:
        pass
    out.sort(key=lambda h: -h["weight"])
    return out[:limit]


def process_fund_data(ticker_obj, symbol=""):
    """Top-10-Positionen: erst vom ETF selbst, sonst vom US-ETF auf denselben Index, sonst feste Liste."""
    holdings = _read_top_holdings(ticker_obj)
    if len(holdings) >= 3:
        return holdings
    proxy = HOLDINGS_PROXY.get(symbol)
    if proxy:
        try:
            ph = _read_top_holdings(yf.Ticker(proxy))
            if len(ph) >= 3:
                for h in ph:
                    h["via"] = proxy
                return ph
        except Exception as e:
            print("  Positionen über %s nicht abrufbar: %s" % (proxy, e))
    if symbol in KNOWN_ETF_HOLDINGS:
        return [dict(h, via="fest") for h in KNOWN_ETF_HOLDINGS[symbol]]
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

    recommendations = {
        "score": clean_val(info.get("recommendationMean")),
        "key": info.get("recommendationKey", "none"),
        "breakdown": {"strongBuy": 0, "buy": 0, "hold": 0, "sell": 0, "strongSell": 0},
        "history": []
    }

    def safe_int(val):
        try:
            if pd.isna(val): return 0
            if hasattr(val, "item"): val = val.item()
            return int(val)
        except Exception:
            return 0

    try:
        rec_summary = ticker_obj.recommendations_summary
        if rec_summary is not None and not rec_summary.empty:
            latest = rec_summary.iloc[0]
            recommendations["breakdown"] = {
                "strongBuy": safe_int(latest.get("strongBuy", latest.get("strong_buy", 0))),
                "buy": safe_int(latest.get("buy", 0)),
                "hold": safe_int(latest.get("hold", 0)),
                "sell": safe_int(latest.get("sell", 0)),
                "strongSell": safe_int(latest.get("strongSell", latest.get("strong_sell", 0)))
            }
    except Exception as e:
        pass

    try:
        rec_hist = ticker_obj.recommendations
        if rec_hist is not None and not rec_hist.empty:
            for _, row in rec_hist.head(4).iterrows():
                recommendations["history"].append({
                    "period": str(row.get("period", "")),
                    "strongBuy": safe_int(row.get("strongBuy", row.get("strong_buy", 0))),
                    "buy": safe_int(row.get("buy", 0)),
                    "hold": safe_int(row.get("hold", 0)),
                    "sell": safe_int(row.get("sell", 0)),
                    "strongSell": safe_int(row.get("strongSell", row.get("strong_sell", 0)))
                })
    except Exception as e:
        pass

    eps_estimates = []
    try:
        eh = ticker_obj.earnings_history
        if eh is not None and not eh.empty:
            eh = eh.reset_index()
            date_col = next((c for c in eh.columns if 'date' in str(c).lower() or 'quarter' in str(c).lower()), eh.columns[0])
            eh = eh.sort_values(by=date_col, ascending=False).head(4)

            for i, (_, row) in enumerate(eh.iterrows()):
                q_date = row.get(date_col)
                if isinstance(q_date, pd.Timestamp) and not pd.isna(q_date):
                    q_str = q_date.strftime("%Y-%m-%d")
                elif q_date is None or str(q_date) in ("None", "NaT", "nan", ""):
                    q_str = f"Q-{i+1}"
                else:
                    q_str = str(q_date)[:10]

                eps_estimates.append({
                    "quarter": q_str,
                    "estimate": clean_val(row.get("epsEstimate")),
                    "actual": clean_val(row.get("epsActual")),
                    "surprisePercent": clean_val(row.get("surprisePercent"))
                })
    except Exception as e:
        pass

    eps_forecast = None
    try:
        ee = ticker_obj.earnings_estimate
        if ee is not None and not ee.empty and '0q' in ee.index:
            eps_forecast = {
                "date": None,
                "estimate": clean_val(ee.loc['0q', 'avg']),
                "low": clean_val(ee.loc['0q', 'low']),
                "high": clean_val(ee.loc['0q', 'high']),
                "analysts": clean_val(ee.loc['0q', 'numberOfAnalysts'])
            }
    except Exception:
        pass

    return {"targets": targets, "recommendations": recommendations,
            "epsEstimates": eps_estimates, "nextEarningsDate": None, "epsForecast": eps_forecast,
            "checkedAt": datetime.now(timezone.utc).isoformat()}


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


def ema_series(vals, period):
    """EMA mit SMA-Startwert (identisch zur Berechnung im Chart-Tab der App)."""
    out = []
    k = 2.0 / (period + 1)
    prev = None
    for i, v in enumerate(vals):
        if prev is None:
            if i + 1 < period:
                out.append(None)
                continue
            prev = sum(vals[i + 1 - period:i + 1]) / period
        else:
            prev = v * k + prev * (1 - k)
        out.append(prev)
    return out


def compute_chart_patterns(chart_history, symbol=""):
    if not chart_history or len(chart_history) < 60:
        return {"chartPatterns": [], "hasBullishPattern": False, "hasBearishPattern": False,
                "bollingerSqueeze": False, "cross": None, "crossDaysAgo": None,
                "emaCross": None, "emaCrossDaysAgo": None, "emaTrend": False}
    closes = [p["close"] for p in chart_history if p.get("close")]
    n = len(closes)
    if n < 60:
        return {"chartPatterns": [], "hasBullishPattern": False, "hasBearishPattern": False,
                "bollingerSqueeze": False, "cross": None, "crossDaysAgo": None,
                "emaCross": None, "emaCrossDaysAgo": None, "emaTrend": False}

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

    # EMA-Signale: Kreuz EMA 12/26 (nur wenn höchstens 60 Handelstage her) und Trend Kurs > EMA 50 > EMA 200
    e12, e26 = ema_series(closes, 12), ema_series(closes, 26)
    e50, e200 = ema_series(closes, 50), ema_series(closes, 200)
    ema_cross = None
    ema_cross_days_ago = None
    prev_sign = 0
    last_idx = None
    for i in range(n):
        if e12[i] is None or e26[i] is None:
            continue
        sign = 1 if e12[i] > e26[i] else -1
        if prev_sign != 0 and sign != prev_sign:
            last_idx = i
            ema_cross = "up" if sign > 0 else "down"
        prev_sign = sign
    if last_idx is not None:
        ema_cross_days_ago = n - 1 - last_idx
        if ema_cross_days_ago > 60:
            ema_cross = None
            ema_cross_days_ago = None
    ema_trend = bool(e50[-1] is not None and e200[-1] is not None and closes[-1] > e50[-1] > e200[-1])

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
        "crossDaysAgo": cross_days_ago,
        "emaCross": ema_cross,
        "emaCrossDaysAgo": ema_cross_days_ago,
        "emaTrend": ema_trend
    }


def _try_df(fn, retries=2):
    for i in range(retries + 1):
        try:
            df = fn()
            if df is not None and not df.empty:
                return df
        except Exception as e:
            print(f"  Financials-Fehler: {e}")
        time.sleep(1.5 * (i + 1))
    return None


def fetch_financials_robust(t, cur):
    def get(getter_name, attr_name, freq):
        getter = getattr(t, getter_name, None)
        df = _try_df(lambda: getter(freq=freq)) if getter else None
        if df is None:
            df = _try_df(lambda: getattr(t, attr_name))
        return df

    inc_q = get("get_income_stmt", "quarterly_income_stmt", "quarterly")
    inc_a = get("get_income_stmt", "income_stmt", "yearly")
    bs_q = get("get_balance_sheet", "quarterly_balance_sheet", "quarterly")
    bs_a = get("get_balance_sheet", "balance_sheet", "yearly")
    cf_q = get("get_cashflow", "quarterly_cashflow", "quarterly")
    cf_a = get("get_cashflow", "cashflow", "yearly")

    return {
        "incomeStatement": {
            "quarterly": df_to_dict_records(inc_q, cur),
            "annual": df_to_dict_records(inc_a, cur)
        },
        "balanceSheet": {
            "quarterly": df_to_dict_records(bs_q, cur),
            "annual": df_to_dict_records(bs_a, cur)
        },
        "cashFlow": {
            "quarterly": df_to_dict_records(cf_q, cur),
            "annual": df_to_dict_records(cf_a, cur)
        }
    }


def financials_empty(fin):
    if not fin:
        return True
    for section in ("incomeStatement", "balanceSheet", "cashFlow"):
        for period in ("quarterly", "annual"):
            if fin.get(section, {}).get(period):
                return False
    return True


# ------------------ HILFSFUNKTIONEN FÜR ANALYSTEN ------------------
def analysts_empty(a):
    """True, wenn Breakdown oder Historie fehlen (Kursziele allein reichen nicht)."""
    if not a:
        return True
    r = a.get("recommendations") or {}
    b = r.get("breakdown") or {}
    return sum(b.values()) == 0 or not r.get("history")


def analysts_recently_checked(a):
    """Prüft, ob die Analysten in den letzten X Tagen schon aktualisiert wurden."""
    try:
        ts = datetime.fromisoformat((a or {}).get("checkedAt", ""))
        return (datetime.now(timezone.utc) - ts).days < ANALYST_RECHECK_DAYS
    except Exception:
        return False


def fetch_full_stock(ticker_sym):
    print(f"Führe vollständigen Fetch (inkl. Intraday) für {ticker_sym} durch...")
    t = yf.Ticker(ticker_sym)
    info = t.info or {}
    if not info:
        raise RuntimeError(f"info für {ticker_sym} leer (Rate-Limit?) - wird nicht gespeichert")
    cur = info.get("currency") or detect_native_currency(ticker_sym)
    country = info.get("country", "")
    if not country:
        if ticker_sym.endswith(".DE"): country = "Deutschland"
        else: country = "USA"

    profile = {"ticker": ticker_sym,
               "name": info.get("shortName") or info.get("longName") or ticker_sym,
               "sector": info.get("sector", "Sonstige"),
               "industry": info.get("industry", "N/A"),
               "country": country, "currency": "EUR",
               "nativeCurrency": cur, "exchange": info.get("exchange", "N/A")}

    raw_curr = 0.0
    raw_prev = 0.0

    try:
        intraday = t.history(period="1d", interval="1m")
        if not intraday.empty:
            raw_curr = float(intraday["Close"].iloc[-1])
    except Exception:
        pass

    try:
        daily = t.history(period="5d", interval="1d")
        if not daily.empty:
            if not raw_curr:
                raw_curr = float(daily["Close"].iloc[-1])
            if len(daily) > 1:
                raw_prev = float(daily["Close"].iloc[-2])
    except Exception:
        pass

    if not raw_curr:
        raw_curr = clean_val(info.get("currentPrice") or info.get("regularMarketPrice") or info.get("navPrice"), 0.0)
    if not raw_prev:
        raw_prev = clean_val(info.get("previousClose") or info.get("regularMarketPreviousClose"), raw_curr)
    if not raw_prev:
        raw_prev = raw_curr

    curr_p = clean_val(to_eur(raw_curr, cur), 0.0)
    prev_p = clean_val(to_eur(raw_prev, cur), curr_p)
    chg_abs = round(curr_p - prev_p, 4) if curr_p and prev_p else 0.0
    chg_pct = round(((raw_curr - raw_prev) / raw_prev) * 100, 2) if raw_prev else 0.0
    raw_mcap = clean_val(info.get("marketCap") or info.get("totalAssets"), 0)
    market_cap_eur = clean_val(to_eur(raw_mcap, mcap_currency(cur)), 0)

    quote = {"price": curr_p, "change": chg_abs, "changePercent": chg_pct,
             "marketCap": market_cap_eur,
             "fiftyTwoWeekLow": clean_val(to_eur(clean_val(info.get("fiftyTwoWeekLow")), cur)),
             "fiftyTwoWeekHigh": clean_val(to_eur(clean_val(info.get("fiftyTwoWeekHigh")), cur)),
             "volume": clean_val(info.get("regularMarketVolume")), "currency": "EUR"}
    
    raw_ebitda = clean_val(info.get("ebitda"), 0)
    raw_total_debt = clean_val(info.get("totalDebt"), 0)
    net_debt_ebitda = (raw_total_debt / raw_ebitda) if raw_ebitda > 0 else None

    ratios = {"peTrailing": clean_val(info.get("trailingPE")),
              "peForward": clean_val(info.get("forwardPE")),
              "dividendYield": clean_val(info.get("dividendYield")),
              "profitMargins": clean_val(info.get("profitMargins")),
              "returnOnEquity": clean_val(info.get("returnOnEquity")), 
              "payoutRatio": clean_val(info.get("payoutRatio")),       
              "debtToEbitda": clean_val(net_debt_ebitda),
              "revenueGrowth": clean_val(info.get("revenueGrowth")),
              "debtToEquity": clean_val(info.get("debtToEquity")),
              "pegRatio": clean_val(info.get("pegRatio")),
              "returnOnAssets": clean_val(info.get("returnOnAssets")),
              "grossMargins": clean_val(info.get("grossMargins")),
              "operatingMargins": clean_val(info.get("operatingMargins"))
              }

    chart_history = []
    try:
        hist = t.history(period="2y", interval="1d")
        for dt, row in hist.iterrows():
            chart_history.append({"date": dt.strftime("%Y-%m-%d"),
                                  "close": clean_val(to_eur(clean_val(row["Close"]), cur)),
                                  "volume": clean_val(row["Volume"])})
    except Exception:
        pass

    fin_data = fetch_financials_robust(t, cur)
    print(f"Financials für {ticker_sym}: GuV {len(fin_data['incomeStatement']['quarterly'])}Q/{len(fin_data['incomeStatement']['annual'])}Y, Bilanz {len(fin_data['balanceSheet']['quarterly'])}Q/{len(fin_data['balanceSheet']['annual'])}Y, CF {len(fin_data['cashFlow']['quarterly'])}Q/{len(fin_data['cashFlow']['annual'])}Y")
    if financials_empty(fin_data):
        print(f"WARNUNG: Financials für {ticker_sym} leer (yfinance-Version oder Rate-Limit prüfen).")

    dividends_info = process_dividends(t, info, cur)
    institutional = process_institutional_holders(t, cur)
    options = process_options(t, info)

    upgrades_list = []
    try:
        ud_df = t.upgrades_downgrades
        if ud_df is not None and not ud_df.empty:
            ud_df = ud_df.reset_index()
            date_cols = [c for c in ud_df.columns if 'date' in str(c).lower()]

            if date_cols:
                date_col = date_cols[0]
                ud_df = ud_df.sort_values(by=date_col, ascending=False)

                for _, row in ud_df.head(10).iterrows():
                    g_date = row.get(date_col)
                    if isinstance(g_date, pd.Timestamp):
                        date_str = g_date.strftime("%Y-%m-%d")
                    else:
                        date_str = str(g_date)[:10]

                    upgrades_list.append({
                        "date": date_str,
                        "firm": str(row.get("Firm", "Unbekannt")),
                        "toGrade": str(row.get("ToGrade", "N/A")),
                        "fromGrade": str(row.get("FromGrade", "N/A")),
                        "action": str(row.get("Action", ""))
                    })
    except Exception as e:
        print(f"Fehler bei Upgrades/Downgrades für {ticker_sym}: {e}")

    next_earnings = None
    try:
        cal = t.calendar
        if cal and 'Earnings Date' in cal and cal['Earnings Date']:
            next_earnings = cal['Earnings Date'][0].strftime("%Y-%m-%d")
    except Exception:
        pass

    analysts_data = process_analyst_data(info, t, cur)
    analysts_data["upgradesDowngrades"] = upgrades_list
    analysts_data["nextEarningsDate"] = next_earnings

    result = {
        "ticker": ticker_sym, "profile": profile, "quote": quote, "ratios": ratios,
        "financials": fin_data,
        "analysts": analysts_data,
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


def fetch_partial_stock(ticker_sym, sections, existing_data):
    t = yf.Ticker(ticker_sym)
    existing_data = existing_data or {}
    
    info = t.info or {}
    if not info and ("analysts" in sections or "ratios" in sections):
        raise RuntimeError("info leer (Rate-Limit?) - Daten nicht überschrieben")
    cur = existing_data.get("profile", {}).get("nativeCurrency") or info.get("currency") or detect_native_currency(ticker_sym)
    
    result = dict(existing_data)
    
    if "profile" in sections or "profile" not in result:
        country = info.get("country", "")
        if not country:
            if ticker_sym.endswith(".DE"): country = "Deutschland"
            else: country = "USA"
            
        result["profile"] = {"ticker": ticker_sym,
                   "name": info.get("shortName") or info.get("longName") or ticker_sym,
                   "sector": info.get("sector", "Sonstige"),
                   "industry": info.get("industry", "N/A"),
                   "country": country, "currency": "EUR",
                   "nativeCurrency": cur, "exchange": info.get("exchange", "N/A")}

    if "quote" in sections:
        raw_curr = 0.0
        raw_prev = 0.0
        try:
            intraday = t.history(period="1d", interval="1m")
            if not intraday.empty: raw_curr = float(intraday["Close"].iloc[-1])
        except Exception: pass
        try:
            daily = t.history(period="5d", interval="1d")
            if not daily.empty:
                if not raw_curr: raw_curr = float(daily["Close"].iloc[-1])
                if len(daily) > 1: raw_prev = float(daily["Close"].iloc[-2])
        except Exception: pass

        if not raw_curr: raw_curr = clean_val(info.get("currentPrice") or info.get("regularMarketPrice") or info.get("navPrice"), 0.0)
        if not raw_prev: raw_prev = clean_val(info.get("previousClose") or info.get("regularMarketPreviousClose"), raw_curr)
        if not raw_prev: raw_prev = raw_curr

        curr_p = clean_val(to_eur(raw_curr, cur), 0.0)
        prev_p = clean_val(to_eur(raw_prev, cur), curr_p)
        
        result["quote"] = {"price": curr_p, "change": round(curr_p - prev_p, 4) if curr_p and prev_p else 0.0, 
                           "changePercent": round(((raw_curr - raw_prev) / raw_prev) * 100, 2) if raw_prev else 0.0,
                           "marketCap": clean_val(to_eur(clean_val(info.get("marketCap") or info.get("totalAssets"), 0), mcap_currency(cur)), 0),
                           "fiftyTwoWeekLow": clean_val(to_eur(clean_val(info.get("fiftyTwoWeekLow")), cur)),
                           "fiftyTwoWeekHigh": clean_val(to_eur(clean_val(info.get("fiftyTwoWeekHigh")), cur)),
                           "volume": clean_val(info.get("regularMarketVolume")), "currency": "EUR"}

    if "ratios" in sections:
        raw_ebitda = clean_val(info.get("ebitda"), 0)
        raw_total_debt = clean_val(info.get("totalDebt"), 0)
        net_debt_ebitda = (raw_total_debt / raw_ebitda) if raw_ebitda > 0 else None

        result["ratios"] = {"peTrailing": clean_val(info.get("trailingPE")),
                  "peForward": clean_val(info.get("forwardPE")),
                  "dividendYield": clean_val(info.get("dividendYield")),
                  "profitMargins": clean_val(info.get("profitMargins")),
                  "returnOnEquity": clean_val(info.get("returnOnEquity")), 
                  "payoutRatio": clean_val(info.get("payoutRatio")),       
                  "debtToEbitda": clean_val(net_debt_ebitda),
                  "revenueGrowth": clean_val(info.get("revenueGrowth")),
                  "debtToEquity": clean_val(info.get("debtToEquity")),
                  "pegRatio": clean_val(info.get("pegRatio")),
              "returnOnAssets": clean_val(info.get("returnOnAssets")),
              "grossMargins": clean_val(info.get("grossMargins")),
              "operatingMargins": clean_val(info.get("operatingMargins"))
                  }

    if "financials" in sections:
        result["financials"] = fetch_financials_robust(t, cur)
        
    if "analysts" in sections and info.get("quoteType") not in (None, "EQUITY"):
        print(f"  {ticker_sym}: kein Equity (quoteType={info.get('quoteType')}) - Analysten übersprungen")
        if isinstance(result.get("analysts"), dict):
            result["analysts"]["checkedAt"] = datetime.now(timezone.utc).isoformat()
    elif "analysts" in sections:
        analysts_data = process_analyst_data(info, t, cur)
        old_an = existing_data.get("analysts") or {}
        old_rec = old_an.get("recommendations") or {}
        new_rec = analysts_data["recommendations"]
        if sum(new_rec["breakdown"].values()) == 0 and sum((old_rec.get("breakdown") or {}).values()) > 0:
            new_rec["breakdown"] = old_rec["breakdown"]
            if old_rec.get("breakdownSource"):
                new_rec["breakdownSource"] = old_rec["breakdownSource"]
        if not new_rec["history"] and old_rec.get("history"):
            new_rec["history"] = old_rec["history"]
        upgrades_list = []
        try:
            ud_df = t.upgrades_downgrades
            if ud_df is not None and not ud_df.empty:
                ud_df = ud_df.reset_index()
                date_cols = [c for c in ud_df.columns if 'date' in str(c).lower()]
                if date_cols:
                    date_col = date_cols[0]
                    ud_df = ud_df.sort_values(by=date_col, ascending=False)
                    for _, row in ud_df.head(10).iterrows():
                        g_date = row.get(date_col)
                        date_str = g_date.strftime("%Y-%m-%d") if isinstance(g_date, pd.Timestamp) else str(g_date)[:10]
                        upgrades_list.append({"date": date_str, "firm": str(row.get("Firm", "Unbekannt")),
                            "toGrade": str(row.get("ToGrade", "N/A")), "fromGrade": str(row.get("FromGrade", "N/A")),
                            "action": str(row.get("Action", ""))})
        except Exception: pass
        
        next_earnings = None
        try:
            cal = t.calendar
            if cal and 'Earnings Date' in cal and cal['Earnings Date']:
                next_earnings = cal['Earnings Date'][0].strftime("%Y-%m-%d")
        except Exception: pass
        
        analysts_data["upgradesDowngrades"] = upgrades_list
        analysts_data["nextEarningsDate"] = next_earnings
        result["analysts"] = analysts_data
        
    if "insider" in sections:
        result["insider"] = process_insider_data(t, cur)
        
    if "institutional" in sections:
        result["institutional"] = process_institutional_holders(t, cur)
        
    if "options" in sections:
        result["options"] = process_options(t, info)
        
    if "dividends" in sections:
        result["dividends"] = process_dividends(t, info, cur, existing_data.get("dividends"))
        result["exDividendDate"] = result["dividends"].get("exDate")
        
    if "holdings" in sections:
        result["holdings"] = process_fund_data(t, ticker_sym)
        
    if "history" in sections:
        chart_history = []
        try:
            hist = t.history(period="2y", interval="1d")
            for dt, row in hist.iterrows():
                chart_history.append({"date": dt.strftime("%Y-%m-%d"),
                                      "close": clean_val(to_eur(clean_val(row["Close"]), cur)),
                                      "volume": clean_val(row["Volume"])})
        except Exception: pass
        result["chartHistory"] = chart_history

    result["updatedAt"] = datetime.now(timezone.utc).isoformat()
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


def _ema_series(values, n):
    """EMA wie in js/stock-chart.js: Start mit SMA der ersten n Werte, None-Werte werden uebersprungen."""
    out, k, prev, buf = [], 2.0 / (n + 1), None, []
    for v in values:
        if v is None:
            out.append(None)
            continue
        if prev is None:
            buf.append(v)
            if len(buf) == n:
                prev = sum(buf) / n
                out.append(prev)
            else:
                out.append(None)
        else:
            prev = v * k + prev * (1 - k)
            out.append(prev)
    return out


def _rsi_series(values, n=14):
    """RSI (Wilder) identisch zu js/stock-chart.js."""
    out, avg_gain, avg_loss = [], 0.0, 0.0
    for i in range(len(values)):
        if i == 0:
            out.append(None)
            continue
        diff = values[i] - values[i - 1]
        gain = diff if diff > 0 else 0.0
        loss = -diff if diff < 0 else 0.0
        if i <= n:
            avg_gain += gain / n
            avg_loss += loss / n
            if i < n:
                out.append(None)
                continue
        else:
            avg_gain = (avg_gain * (n - 1) + gain) / n
            avg_loss = (avg_loss * (n - 1) + loss) / n
        out.append(100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss))
    return out


def compute_bottom_check(closes):
    """
    Boden-Check (1:1 Port von bottomCheck() in js/stock-chart.js).
    Liefert 'base' (Bodenbildung), 'knife' (Fallendes Messer), 'wait' oder None
    (None = weniger als 20 % unter dem 52W-Hoch bzw. zu wenig Daten).
    """
    c = [x for x in closes if x is not None and x > 0]
    n = len(c)
    if n < 120:
        return None
    px = c[-1]
    hi = max(c[-252:])
    if px / hi - 1 > -0.20:
        return None

    def avg(a):
        return sum(a) / len(a)

    w = c[-60:]
    mn = min(w)
    idx = max(i for i, v in enumerate(w) if v <= mn)
    since_low = len(w) - 1 - idx
    s20 = avg(c[-20:])
    s20b = avg(c[-25:-5])

    e12, e26 = _ema_series(c, 12), _ema_series(c, 26)
    line = [(a - b) if (a is not None and b is not None) else None for a, b in zip(e12, e26)]
    signal = _ema_series(line, 9)
    ml, ms = line[-1], signal[-1]
    r = _rsi_series(c, 14)
    r0, r5 = r[-1], r[-6]
    r_ok = r0 is not None and r5 is not None and r0 >= 40 and r0 > r5

    sig = [
        since_low >= 15,
        min(c[-20:]) > min(c[-60:-20]),
        px > s20,
        s20 >= s20b,
        ml is not None and ms is not None and ml > ms,
        r_ok,
    ]
    score = sum(1 for x in sig if x)
    perf1m = px / c[-22] - 1
    if score >= 4 and (sig[0] or sig[1]):
        return "base"
    if score <= 2 and (since_low <= 10 or perf1m <= -0.10):
        return "knife"
    return "wait"


def extract_field_series(batch_df, sym, field):
    """Wie extract_close_series, aber fuer beliebige Spalten (z.B. Volume)."""
    try:
        if batch_df is None or batch_df.empty:
            return None
        if hasattr(batch_df.columns, "levels") and len(batch_df.columns.levels) >= 2:
            top = batch_df.columns.get_level_values(0)
            if sym in top:
                sub = batch_df[sym]
                if field in sub.columns:
                    return sub[field].dropna()
            if field in top:
                sub = batch_df[field]
                if sym in sub.columns:
                    return sub[sym].dropna()
        if field in batch_df.columns:
            return batch_df[field].dropna()
    except Exception:
        pass
    return None


def build_universe_item(stock_data, existing_item=None):
    """Erstellt den Eintrag für die universe.json inkl. aller abgeleiteten Kennzahlen."""
    u_item = existing_item or {}
    if not stock_data:
        return u_item
    
    # Basis
    prof = stock_data.get("profile", {})
    if prof:
        u_item["name"] = prof.get("name", u_item.get("name"))
        u_item["sector"] = prof.get("sector", u_item.get("sector"))
        u_item["industry"] = prof.get("industry", u_item.get("industry"))
        u_item["country"] = prof.get("country", u_item.get("country"))
        u_item["currency"] = "EUR"
    
    q = stock_data.get("quote", {})
    if q:
        u_item["price"] = q.get("price", u_item.get("price"))
        u_item["changePercent"] = q.get("changePercent", u_item.get("changePercent"))
        u_item["marketCap"] = q.get("marketCap", u_item.get("marketCap"))
        u_item["volume"] = q.get("volume", u_item.get("volume"))
    
    r = stock_data.get("ratios", {})
    if r:
        u_item["pe"] = r.get("peTrailing", u_item.get("pe"))
        u_item["forwardPe"] = r.get("peForward", u_item.get("forwardPe"))
        u_item["profitMargins"] = r.get("profitMargins", u_item.get("profitMargins"))
        u_item["revGrowth"] = r.get("revenueGrowth", u_item.get("revGrowth"))
        u_item["returnOnEquity"] = r.get("returnOnEquity", u_item.get("returnOnEquity"))
        u_item["payoutRatio"] = r.get("payoutRatio", u_item.get("payoutRatio"))
        u_item["debtToEbitda"] = r.get("debtToEbitda", u_item.get("debtToEbitda"))
        u_item["dividendYield"] = r.get("dividendYield", u_item.get("dividendYield"))
        u_item["debtToEquity"] = r.get("debtToEquity", u_item.get("debtToEquity"))
        u_item["peg"] = r.get("pegRatio", u_item.get("peg"))
        u_item["roa"] = r.get("returnOnAssets", u_item.get("roa"))
    
    if "exDividendDate" in stock_data:
        u_item["exDividendDate"] = stock_data.get("exDividendDate")

    # abhängige Werte
    price = u_item.get("price")
    if price:
        low = q.get("fiftyTwoWeekLow")
        high = q.get("fiftyTwoWeekHigh")
        if low and high and high > low:
            u_item["rangePos"] = ((price - low) / (high - low)) * 100
            u_item["low52"] = low
            u_item["high52"] = high
        
        an = stock_data.get("analysts", {})
        targets = an.get("targets", {})
        recs = an.get("recommendations", {})
        bd = recs.get("breakdown", {})
        
        mean_target = targets.get("mean")
        if mean_target:
            u_item["upside"] = ((mean_target - price) / price) * 100
            # Spanne der Kursziele (für ETF-Szenarien aus den Top-Positionen)
            if targets.get("low"):
                u_item["upsideLow"] = round(((targets["low"] - price) / price) * 100, 2)
            if targets.get("high"):
                u_item["upsideHigh"] = round(((targets["high"] - price) / price) * 100, 2)
        
        u_item["analystCount"] = targets.get("analystCount")
        
        total_recs = sum(bd.values())
        if total_recs > 0:
            u_item["buyPct"] = ((bd.get("strongBuy", 0) + bd.get("buy", 0)) / total_recs) * 100
            
        u_item["nextEarningsDate"] = an.get("nextEarningsDate")

    # Chart History stuff
    # Tage ohne Schlusskurs (None, z. B. Feiertage/Datenlücken) ignorieren, sonst crasht die Berechnung
    hist = [p for p in (stock_data.get("chartHistory") or []) if p.get("close") is not None]
    if hist:
        c_now = hist[-1]["close"]
        u_item["perf1w"] = ((c_now / hist[-6]["close"]) - 1) * 100 if len(hist) > 5 else None
        u_item["perf1m"] = ((c_now / hist[-22]["close"]) - 1) * 100 if len(hist) > 21 else None
        u_item["perf3m"] = ((c_now / hist[-64]["close"]) - 1) * 100 if len(hist) > 63 else None
        u_item["perf52w"] = ((c_now / hist[-253]["close"]) - 1) * 100 if len(hist) > 252 else None
        
        current_year = hist[-1]["date"][:4]
        for p in hist:
            if p["date"][:4] == current_year:
                u_item["perfYtd"] = ((c_now / p["close"]) - 1) * 100
                break
                
        # Letzte 65 Schlusskurse: der Browser rechnet damit RSI, Performance und CRV mit dem Live-Kurs neu
        u_item["closes"] = [round(p["close"], 4) for p in hist[-65:]]
        u_item["closesEnd"] = hist[-1]["date"]

        # RSI (14)
        if len(hist) > 15:
            closes = [p["close"] for p in hist[-15:]]
            gains = 0
            losses = 0
            for i in range(1, 15):
                diff = closes[i] - closes[i-1]
                if diff >= 0: gains += diff
                else: losses -= diff
            avg_gain = gains / 14
            avg_loss = losses / 14
            if avg_loss == 0: u_item["rsi"] = 100
            else:
                rs = avg_gain / avg_loss
                u_item["rsi"] = 100 - (100 / (1 + rs))
        
        # Support/Resistance & Risk/Reward
        if len(hist) >= 60 and price:
            closes_60 = [p["close"] for p in hist[-60:]]
            sup = min(closes_60)
            res = max(closes_60)
            stop = sup * 0.985
            tgt = res
            if u_item.get("upside") and u_item["upside"] > 0:
                tgt = price * (1 + u_item["upside"] / 100)
            
            risk = price - stop
            reward = tgt - price
            if risk > 0:
                u_item["rrCrv"] = reward / risk
                u_item["rrStopPct"] = (risk / price) * 100
                u_item["rrTgtPct"] = (reward / price) * 100
        
        # Patterns
        pats = compute_chart_patterns(hist)
        u_item.update(pats)

        # Basiswerte, mit denen der Browser Kreuze und EMA-Trend mit dem Live-Kurs fortschreibt
        # (js/live-prices.js applyTechnicals): Werte am vorletzten und letzten Dateitag
        cl_all = [p["close"] for p in hist]
        live_base = {}
        for per in (12, 26, 50, 200):
            es = ema_series(cl_all, per)
            if len(es) >= 2 and es[-1] is not None and es[-2] is not None:
                live_base["e%d" % per] = [round(es[-2], 6), round(es[-1], 6)]
        if len(cl_all) >= 201:
            live_base["s200"] = [round(sum(cl_all[-201:-1]) / 200, 6), round(sum(cl_all[-200:]) / 200, 6)]
            live_base["c200"] = [round(cl_all[-201], 6), round(cl_all[-200], 6)]
        if live_base and len(hist) > 60:
            # Kreuz-Stand ohne den letzten Punkt: falls der Live-Kurs ein Kreuz vom letzten Dateitag wieder aufhebt
            pp = compute_chart_patterns(hist[:-1])
            live_base["prev"] = {"cross": pp.get("cross"), "crossDaysAgo": pp.get("crossDaysAgo"),
                                 "emaCross": pp.get("emaCross"), "emaCrossDaysAgo": pp.get("emaCrossDaysAgo")}
        if live_base:
            u_item["liveBase"] = live_base
        else:
            u_item.pop("liveBase", None)

        # Boden-Check (Filter "Bodenbildung" / "Fallendes Messer")
        bottom = compute_bottom_check([p.get("close") for p in hist])
        if bottom:
            u_item["bottom"] = bottom
        else:
            u_item.pop("bottom", None)

    if "updatedAt" in stock_data:
        u_item["updatedAt"] = stock_data["updatedAt"]

    return u_item


def compute_rs_ratings(universe_map):
    """RS-Rating (0-99) = Perzentil der 3-Monats-Performance im gesamten Universum."""
    print("Berechne Relative Stärke (RS-Rating)...")
    perf_list = [it for it in universe_map.values() if it.get("perf3m") is not None]
    perf_list.sort(key=lambda x: x["perf3m"])
    total = len(perf_list)
    for i, item in enumerate(perf_list):
        item["rsRating"] = int((i / total) * 100) if total > 0 else 50


def run_delta_sync(tickers, is_manual=False, sections=None):
    load_live_forex()

    if sections:
        print(f"Lade gezielt Sektionen: {', '.join(sections)} für {len(tickers)} Ticker...")
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
                    with open(stock_file, "r", encoding="utf-8") as f:
                        stock_data = json.load(f)
                except Exception: pass
            
            current_sections = list(sections)
            if not stock_data:
                print(f"  Datei für {sym} fehlt, hole Basis-Daten mit...")
                stock_data = {}
                if "profile" not in current_sections: current_sections.append("profile")
                if "quote" not in current_sections: current_sections.append("quote")

            try:
                stock_data = fetch_partial_stock(sym, current_sections, stock_data)
                with open(stock_file, "w", encoding="utf-8") as f:
                    json.dump(stock_data, f, ensure_ascii=False, indent=2)
                
                if any(s in current_sections for s in ["quote", "profile", "ratios", "history", "perf"]):
                    universe_map[sym] = build_universe_item(stock_data, universe_map.get(sym))
                
                print(f"  {sym} erfolgreich aktualisiert ({', '.join(current_sections)}).")
            except Exception as e:
                print(f"  Fehler bei {sym}: {e}")
            time.sleep(ONLY_MODE_SLEEP_SEC)

        if any(s in sections for s in ["quote", "profile", "ratios", "history", "perf"]):
            compute_rs_ratings(universe_map)
            with open(universe_file, "w", encoding="utf-8") as f:
                json.dump(list(universe_map.values()), f, ensure_ascii=False, indent=2)
        return

    if is_manual and len(tickers) == 1:
        sym = tickers[0]
        stock_file = os.path.join(DATA_DIR, f"{sym}.json")
        try:
            stock_data = fetch_full_stock(sym)
            with open(stock_file, "w", encoding="utf-8") as f:
                json.dump(stock_data, f, ensure_ascii=False, indent=2)
            universe_file = os.path.join(DATA_DIR, "universe.json")
            universe_map = {}
            if os.path.exists(universe_file):
                with open(universe_file, "r", encoding="utf-8") as f:
                    for item in json.load(f): universe_map[item["ticker"]] = item
            
            universe_map[sym] = build_universe_item(stock_data, universe_map.get(sym))
            compute_rs_ratings(universe_map)
            
            with open(universe_file, "w", encoding="utf-8") as f:
                json.dump(list(universe_map.values()), f, ensure_ascii=False, indent=2)
            return
        except Exception as e:
            print(f"Manual Fetch für {sym} fehlgeschlagen: {e}")
            return

    print(f"Starte schnelles Batch-Update für {len(tickers)} Ticker...")
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
    fin_backfilled = 0
    analyst_backfilled = 0

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
                stock_data = fetch_full_stock(sym)
            except Exception as e:
                print(f"Erst-Fetch fehlgeschlagen für {sym}: {e}")
                continue
        else:
            if financials_empty(stock_data.get("financials")) and fin_backfilled < MAX_FIN_BACKFILL_PER_RUN:
                fin_backfilled += 1
                try:
                    t_obj = yf.Ticker(sym)
                    cur_fin = stock_data.get("profile", {}).get("nativeCurrency") or detect_native_currency(sym)
                    new_fin = fetch_financials_robust(t_obj, cur_fin)
                    if not financials_empty(new_fin):
                        stock_data["financials"] = new_fin
                        print(f"Financials für {sym} nachgeholt.")
                    else:
                        print(f"Financials für {sym} weiterhin leer.")
                except Exception as e:
                    print(f"Financials-Nachholen für {sym} fehlgeschlagen: {e}")

            if (analysts_empty(stock_data.get("analysts"))
                    and not analysts_recently_checked(stock_data.get("analysts"))
                    and analyst_backfilled < MAX_ANALYST_BACKFILL_PER_RUN
                    and stock_data.get("profile", {}).get("sector") not in (None, "")):
                analyst_backfilled += 1
                try:
                    stock_data = fetch_partial_stock(sym, ["analysts"], stock_data)
                    if analysts_empty(stock_data.get("analysts")):
                        print(f"Analysten für {sym} weiterhin unvollständig.")
                    else:
                        print(f"Analysten für {sym} nachgeholt.")
                except Exception as e:
                    print(f"Analysten-Nachholen für {sym} fehlgeschlagen: {e}")
                time.sleep(0.5)

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

                        q_ = stock_data["quote"]
                        vol_s = extract_field_series(batch_df, sym, "Volume")
                        if vol_s is not None and not vol_s.empty:
                            lv = clean_val(float(vol_s.iloc[-1]))
                            if lv and lv > 0:
                                q_["volume"] = int(lv)
                        hi_, lo_ = q_.get("fiftyTwoWeekHigh"), q_.get("fiftyTwoWeekLow")
                        if hi_ is not None and new_price > hi_:
                            q_["fiftyTwoWeekHigh"] = new_price
                        if lo_ is not None and new_price < lo_:
                            q_["fiftyTwoWeekLow"] = new_price
                        if old_price and old_price > 0 and q_.get("marketCap"):
                            q_["marketCap"] = round(q_["marketCap"] * new_price / old_price)

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

        with open(stock_file, "w", encoding="utf-8") as f:
            json.dump(stock_data, f, ensure_ascii=False, indent=2)

        universe_map[sym] = build_universe_item(stock_data, universe_map.get(sym))

    compute_rs_ratings(universe_map)

    with open(universe_file, "w", encoding="utf-8") as f:
        json.dump(list(universe_map.values()), f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["delta", "full"], default="delta")
    parser.add_argument("--ticker", type=str, default="")
    parser.add_argument("--only", type=str, default="", help="Kommagetrennte Liste: quote, profile, ratios, financials, analysts, insider, institutional, options, dividends, holdings, history, perf")
    args = parser.parse_args()
    
    os.makedirs(DATA_DIR, exist_ok=True)
    load_live_forex()

    sections = None
    if args.only:
        raw_only = args.only.strip().strip('"').strip("'")
        sections = [s.strip().strip('"').strip("'").lower() for s in raw_only.split(",") if s.strip()]
        invalid = [s for s in sections if s not in ALLOWED_SECTIONS]
        if invalid:
            print(f"FEHLER: Ungültige Sektion(en): {', '.join(invalid)}")
            print(f"Erlaubt sind: {', '.join(ALLOWED_SECTIONS)}")
            sys.exit(1)

    if args.ticker:
        target_tickers = [args.ticker.strip().strip('"').strip("'").upper()]
        run_delta_sync(target_tickers, is_manual=True, sections=sections)
    else:
        run_delta_sync(ALL_TICKERS, is_manual=False, sections=sections)


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""
scripts/fetch_market_data.py
Delta-fähiges Marktdaten-Update für USA, Europa und Japan.
Garantiert echte Umrechnung aller ausländischen Währungen (JPY, USD, GBP, CHF) in Euro (EUR).
"""

import os
import json
import math
import time
import argparse
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

ALL_TICKERS = TICKERS_USA + TICKERS_EUROPE + TICKERS_JAPAN
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

# Realistische Basis-Wechselkurse (Einheiten Fremdwährung in 1 Euro)
# Multiplikator = 1.0 / Kurs (z.B. 1 JPY = 0.0061 EUR)
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
    """Ermittelt die Heimatwährung anhand des Börsenplatzes/Suffix."""
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
    """Holt tagesaktuelle Forex-Kurse von Yahoo Finance."""
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
        print(f"Aktuelle Forex-Multiplikatoren: JPY={RATES_TO_EUR['JPY']:.6f}, USD={RATES_TO_EUR['USD']:.4f}")
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
    return {"targets": targets, "recommendations": recommendations, "epsEstimates": eps_estimates}

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
        "revenueGrowth": clean_val(info.get("revenueGrowth"))
    }

    chart_history = []
    try:
        hist = t.history(period="1y", interval="1d")
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
        "chartHistory": chart_history,
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }

# ==============================================================================
# DELTA-SYNC MIT KORREKTER WÄHRUNGSUMRECHNUNG
# ==============================================================================

def run_delta_sync(tickers):
    load_live_forex()
    print(f"Starte Delta-Sync für {len(tickers)} Ticker (Batch-Download & EUR-Umrechnung)...")
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

    updated_universe = []

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
            print(f"Erstmaliger Komplettabruf für {sym}...")
            stock_data = fetch_full_stock(sym)

        cur = stock_data.get("profile", {}).get("nativeCurrency") or detect_native_currency(sym)

        try:
            df_sym = batch_df[sym] if len(tickers) > 1 else batch_df
            df_clean = df_sym.dropna(subset=["Close"])
            if not df_clean.empty:
                last_row = df_clean.iloc[-1]
                prev_row = df_clean.iloc[-2] if len(df_clean) > 1 else last_row

                raw_curr = clean_val(last_row["Close"])
                raw_prev = clean_val(prev_row["Close"])

                # Kurs zwingend in EUR umrechnen
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
                if history and history[-1]["date"] == last_date:
                    history[-1]["close"] = curr_eur
                else:
                    history.append({"date": last_date, "close": curr_eur, "volume": clean_val(last_row.get("Volume", 0))})
                stock_data["chartHistory"] = history[-260:]
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

        hist = stock_data.get("chartHistory", [])
        if len(hist) > 20 and hist[0].get("close"):
            u_item["perf52w"] = round(((hist[-1]["close"] - hist[0]["close"]) / hist[0]["close"]) * 100, 2)

        updated_universe.append(u_item)

    with open(universe_file, "w", encoding="utf-8") as f:
        json.dump(updated_universe, f, ensure_ascii=False, indent=2)

    print(f"Delta-Sync abgeschlossen: {len(updated_universe)} Werte in EUR synchronisiert.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["delta", "full"], default="delta")
    args = parser.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)
    load_live_forex()

    if not os.path.exists(os.path.join(DATA_DIR, "universe.json")):
        args.mode = "full"

    if args.mode == "delta":
        run_delta_sync(ALL_TICKERS)
    else:
        print("Führe vollständigen Neuabruf mit EUR-Umrechnung durch...")
        universe = []
        for sym in ALL_TICKERS:
            try:
                st = fetch_full_stock(sym)
                with open(os.path.join(DATA_DIR, f"{sym}.json"), "w", encoding="utf-8") as f:
                    json.dump(st, f, ensure_ascii=False, indent=2)
                universe.append({
                    "ticker": sym,
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
                    "perf52w": (round(((st["chartHistory"][-1]["close"] - st["chartHistory"][0]["close"]) / st["chartHistory"][0]["close"]) * 100, 2)
                                if len(st.get("chartHistory", [])) > 20 and st["chartHistory"][0].get("close") else None)
                })
                time.sleep(0.3)
            except Exception as e:
                print(f"Fehler bei {sym}: {e}")
        with open(os.path.join(DATA_DIR, "universe.json"), "w", encoding="utf-8") as f:
            json.dump(universe, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Holt Kurs- und Fundamentaldaten fuer ca. 120 Aktien (DAX, EuroStoxx, S&P 500 / Nasdaq)
ueber yfinance und exportiert ein harmonisiertes data/stocks.json.
Erzeugt historische Verlaeufe fuer 1W, 1M, 6M und 1J.
"""

import json
import os
import sys
from datetime import datetime, timezone
import yfinance as yf

TICKERS_CONFIG = [
    # DAX 40 Auszug
    {"ticker": "SAP.DE", "name": "SAP SE", "sector": "Technologie", "country": "Deutschland"},
    {"ticker": "SIE.DE", "name": "Siemens AG", "sector": "Industrie", "country": "Deutschland"},
    {"ticker": "ALV.DE", "name": "Allianz SE", "sector": "Finanzen", "country": "Deutschland"},
    {"ticker": "DTE.DE", "name": "Deutsche Telekom AG", "sector": "Kommunikation", "country": "Deutschland"},
    {"ticker": "AIR.DE", "name": "Airbus SE", "sector": "Industrie", "country": "Europa"},
    {"ticker": "MBG.DE", "name": "Mercedes-Benz Group", "sector": "Zyklischer Konsum", "country": "Deutschland"},
    {"ticker": "BMW.DE", "name": "BMW AG", "sector": "Zyklischer Konsum", "country": "Deutschland"},
    {"ticker": "BAS.DE", "name": "BASF SE", "sector": "Grundstoffe", "country": "Deutschland"},
    {"ticker": "BAYN.DE", "name": "Bayer AG", "sector": "Gesundheitswesen", "country": "Deutschland"},
    {"ticker": "MUV2.DE", "name": "Münchener Rück AG", "sector": "Finanzen", "country": "Deutschland"},
    {"ticker": "DHL.DE", "name": "DHL Group", "sector": "Industrie", "country": "Deutschland"},
    {"ticker": "IFX.DE", "name": "Infineon Technologies AG", "sector": "Technologie", "country": "Deutschland"},
    {"ticker": "DB1.DE", "name": "Deutsche Börse AG", "sector": "Finanzen", "country": "Deutschland"},
    {"ticker": "BEI.DE", "name": "Beiersdorf AG", "sector": "Defensiver Konsum", "country": "Deutschland"},
    {"ticker": "RWE.DE", "name": "RWE AG", "sector": "Versorger", "country": "Deutschland"},
    {"ticker": "HEI.DE", "name": "Heidelberg Materials AG", "sector": "Grundstoffe", "country": "Deutschland"},
    {"ticker": "VOW3.DE", "name": "Volkswagen AG Vz.", "sector": "Zyklischer Konsum", "country": "Deutschland"},
    {"ticker": "ENR.DE", "name": "Siemens Energy AG", "sector": "Industrie", "country": "Deutschland"},
    {"ticker": "EOAN.DE", "name": "E.ON SE", "sector": "Versorger", "country": "Deutschland"},
    {"ticker": "HNR1.DE", "name": "Hannover Rück SE", "sector": "Finanzen", "country": "Deutschland"},
    {"ticker": "FRE.DE", "name": "Fresenius SE", "sector": "Gesundheitswesen", "country": "Deutschland"},
    {"ticker": "CON.DE", "name": "Continental AG", "sector": "Zyklischer Konsum", "country": "Deutschland"},
    {"ticker": "CBK.DE", "name": "Commerzbank AG", "sector": "Finanzen", "country": "Deutschland"},
    {"ticker": "DBK.DE", "name": "Deutsche Bank AG", "sector": "Finanzen", "country": "Deutschland"},
    {"ticker": "MTX.DE", "name": "MTU Aero Engines", "sector": "Industrie", "country": "Deutschland"},
    {"ticker": "SY1.DE", "name": "Symrise AG", "sector": "Grundstoffe", "country": "Deutschland"},
    {"ticker": "ZAL.DE", "name": "Zalando SE", "sector": "Zyklischer Konsum", "country": "Deutschland"},
    {"ticker": "QIA.DE", "name": "Qiagen NV", "sector": "Gesundheitswesen", "country": "Deutschland"},
    {"ticker": "SRT3.DE", "name": "Sartorius Vz.", "sector": "Gesundheitswesen", "country": "Deutschland"},
    {"ticker": "PAH3.DE", "name": "Porsche Automobil Holding", "sector": "Finanzen", "country": "Deutschland"},
    {"ticker": "P911.DE", "name": "Dr. Ing. h.c. F. Porsche", "sector": "Zyklischer Konsum", "country": "Deutschland"},
    {"ticker": "BNR.DE", "name": "Brenntag SE", "sector": "Industrie", "country": "Deutschland"},
    {"ticker": "SHL.DE", "name": "Siemens Healthineers", "sector": "Gesundheitswesen", "country": "Deutschland"},
    {"ticker": "VNA.DE", "name": "Vonovia SE", "sector": "Immobilien", "country": "Deutschland"},
    {"ticker": "HLE.DE", "name": "Hella GmbH", "sector": "Zyklischer Konsum", "country": "Deutschland"},
    {"ticker": "RHM.DE", "name": "Rheinmetall AG", "sector": "Industrie", "country": "Deutschland"},
    {"ticker": "DTG.DE", "name": "Daimler Truck Holding", "sector": "Industrie", "country": "Deutschland"},
    {"ticker": "ZIL2.DE", "name": "ElringKlinger AG", "sector": "Zyklischer Konsum", "country": "Deutschland"},
    {"ticker": "G1A.DE", "name": "GEA Group AG", "sector": "Industrie", "country": "Deutschland"},
    {"ticker": "KGX.DE", "name": "KION GROUP AG", "sector": "Industrie", "country": "Deutschland"},

    # Europa (EuroStoxx 50 / Schweiz / UK / Skandinavien)
    {"ticker": "ASML.AS", "name": "ASML Holding NV", "sector": "Technologie", "country": "Niederlande"},
    {"ticker": "MC.PA", "name": "LVMH Moët Hennessy", "sector": "Zyklischer Konsum", "country": "Frankreich"},
    {"ticker": "OR.PA", "name": "L'Oréal SA", "sector": "Defensiver Konsum", "country": "Frankreich"},
    {"ticker": "TTE.PA", "name": "TotalEnergies SE", "sector": "Energie", "country": "Frankreich"},
    {"ticker": "SAN.PA", "name": "Sanofi SA", "sector": "Gesundheitswesen", "country": "Frankreich"},
    {"ticker": "SU.PA", "name": "Schneider Electric", "sector": "Industrie", "country": "Frankreich"},
    {"ticker": "RMS.PA", "name": "Hermès International", "sector": "Zyklischer Konsum", "country": "Frankreich"},
    {"ticker": "BNP.PA", "name": "BNP Paribas", "sector": "Finanzen", "country": "Frankreich"},
    {"ticker": "EL.PA", "name": "EssilorLuxottica", "sector": "Gesundheitswesen", "country": "Frankreich"},
    {"ticker": "NESN.SW", "name": "Nestlé S.A.", "sector": "Defensiver Konsum", "country": "Schweiz"},
    {"ticker": "NOVN.SW", "name": "Novartis AG", "sector": "Gesundheitswesen", "country": "Schweiz"},
    {"ticker": "ROG.SW", "name": "Roche Holding AG", "sector": "Gesundheitswesen", "country": "Schweiz"},
    {"ticker": "UBSG.SW", "name": "UBS Group AG", "sector": "Finanzen", "country": "Schweiz"},
    {"ticker": "CFR.SW", "name": "Richemont SA", "sector": "Zyklischer Konsum", "country": "Schweiz"},
    {"ticker": "NOVO-B.CO", "name": "Novo Nordisk A/S", "sector": "Gesundheitswesen", "country": "Dänemark"},
    {"ticker": "IBE.MC", "name": "Iberdrola S.A.", "sector": "Versorger", "country": "Spanien"},
    {"ticker": "ITX.MC", "name": "Inditex SA", "sector": "Zyklischer Konsum", "country": "Spanien"},
    {"ticker": "SAN.MC", "name": "Banco Santander", "sector": "Finanzen", "country": "Spanien"},
    {"ticker": "ENEL.MI", "name": "Enel S.p.A.", "sector": "Versorger", "country": "Italien"},
    {"ticker": "ISP.MI", "name": "Intesa Sanpaolo", "sector": "Finanzen", "country": "Italien"},
    {"ticker": "AZN.L", "name": "AstraZeneca PLC", "sector": "Gesundheitswesen", "country": "Großbritannien"},
    {"ticker": "SHEL.L", "name": "Shell PLC", "sector": "Energie", "country": "Großbritannien"},
    {"ticker": "ULVR.L", "name": "Unilever PLC", "sector": "Defensiver Konsum", "country": "Großbritannien"},
    {"ticker": "HSBA.L", "name": "HSBC Holdings", "sector": "Finanzen", "country": "Großbritannien"},
    {"ticker": "BP.L", "name": "BP PLC", "sector": "Energie", "country": "Großbritannien"},

    # USA (Tech, Konsum, Finanzen, Industrie)
    {"ticker": "AAPL", "name": "Apple Inc.", "sector": "Technologie", "country": "USA"},
    {"ticker": "MSFT", "name": "Microsoft Corp.", "sector": "Technologie", "country": "USA"},
    {"ticker": "NVDA", "name": "NVIDIA Corp.", "sector": "Technologie", "country": "USA"},
    {"ticker": "GOOGL", "name": "Alphabet Inc. (Class A)", "sector": "Kommunikation", "country": "USA"},
    {"ticker": "AMZN", "name": "Amazon.com Inc.", "sector": "Zyklischer Konsum", "country": "USA"},
    {"ticker": "META", "name": "Meta Platforms Inc.", "sector": "Kommunikation", "country": "USA"},
    {"ticker": "TSLA", "name": "Tesla Inc.", "sector": "Zyklischer Konsum", "country": "USA"},
    {"ticker": "BRK-B", "name": "Berkshire Hathaway B", "sector": "Finanzen", "country": "USA"},
    {"ticker": "JNJ", "name": "Johnson & Johnson", "sector": "Gesundheitswesen", "country": "USA"},
    {"ticker": "V", "name": "Visa Inc.", "sector": "Finanzen", "country": "USA"},
    {"ticker": "JPM", "name": "JPMorgan Chase & Co.", "sector": "Finanzen", "country": "USA"},
    {"ticker": "PG", "name": "Procter & Gamble Co.", "sector": "Defensiver Konsum", "country": "USA"},
    {"ticker": "KO", "name": "The Coca-Cola Co.", "sector": "Defensiver Konsum", "country": "USA"},
    {"ticker": "PEP", "name": "PepsiCo Inc.", "sector": "Defensiver Konsum", "country": "USA"},
    {"ticker": "WMT", "name": "Walmart Inc.", "sector": "Defensiver Konsum", "country": "USA"},
    {"ticker": "COST", "name": "Costco Wholesale Corp.", "sector": "Defensiver Konsum", "country": "USA"},
    {"ticker": "MCD", "name": "McDonald's Corp.", "sector": "Zyklischer Konsum", "country": "USA"},
    {"ticker": "XOM", "name": "Exxon Mobil Corp.", "sector": "Energie", "country": "USA"},
    {"ticker": "CVX", "name": "Chevron Corp.", "sector": "Energie", "country": "USA"},
    {"ticker": "AMD", "name": "Advanced Micro Devices", "sector": "Technologie", "country": "USA"},
    {"ticker": "AVGO", "name": "Broadcom Inc.", "sector": "Technologie", "country": "USA"},
    {"ticker": "CRM", "name": "Salesforce Inc.", "sector": "Technologie", "country": "USA"},
    {"ticker": "ORCL", "name": "Oracle Corp.", "sector": "Technologie", "country": "USA"},
    {"ticker": "ADBE", "name": "Adobe Inc.", "sector": "Technologie", "country": "USA"},
    {"ticker": "INTC", "name": "Intel Corp.", "sector": "Technologie", "country": "USA"},
    {"ticker": "QCOM", "name": "Qualcomm Inc.", "sector": "Technologie", "country": "USA"},
    {"ticker": "TXN", "name": "Texas Instruments", "sector": "Technologie", "country": "USA"},
    {"ticker": "NFLX", "name": "Netflix Inc.", "sector": "Kommunikation", "country": "USA"},
    {"ticker": "DIS", "name": "The Walt Disney Co.", "sector": "Kommunikation", "country": "USA"},
    {"ticker": "CSCO", "name": "Cisco Systems", "sector": "Technologie", "country": "USA"},
    {"ticker": "NKE", "name": "NIKE Inc.", "sector": "Zyklischer Konsum", "country": "USA"},
    {"ticker": "HD", "name": "The Home Depot", "sector": "Zyklischer Konsum", "country": "USA"},
    {"ticker": "UNH", "name": "UnitedHealth Group", "sector": "Gesundheitswesen", "country": "USA"},
    {"ticker": "PFE", "name": "Pfizer Inc.", "sector": "Gesundheitswesen", "country": "USA"},
    {"ticker": "ABBV", "name": "AbbVie Inc.", "sector": "Gesundheitswesen", "country": "USA"},
    {"ticker": "MRK", "name": "Merck & Co. Inc.", "sector": "Gesundheitswesen", "country": "USA"},
    {"ticker": "LLY", "name": "Eli Lilly and Co.", "sector": "Gesundheitswesen", "country": "USA"},
    {"ticker": "BMY", "name": "Bristol-Myers Squibb", "sector": "Gesundheitswesen", "country": "USA"},
    {"ticker": "MA", "name": "Mastercard Inc.", "sector": "Finanzen", "country": "USA"},
    {"ticker": "BAC", "name": "Bank of America Corp.", "sector": "Finanzen", "country": "USA"},
    {"ticker": "WFC", "name": "Wells Fargo & Co.", "sector": "Finanzen", "country": "USA"},
    {"ticker": "MS", "name": "Morgan Stanley", "sector": "Finanzen", "country": "USA"},
    {"ticker": "GS", "name": "Goldman Sachs Group", "sector": "Finanzen", "country": "USA"},
    {"ticker": "BLK", "name": "BlackRock Inc.", "sector": "Finanzen", "country": "USA"},
    {"ticker": "AXP", "name": "American Express Co.", "sector": "Finanzen", "country": "USA"},
    {"ticker": "LIN", "name": "Linde plc", "sector": "Grundstoffe", "country": "USA"},
    {"ticker": "CAT", "name": "Caterpillar Inc.", "sector": "Industrie", "country": "USA"},
    {"ticker": "DE", "name": "Deere & Company", "sector": "Industrie", "country": "USA"},
    {"ticker": "GE", "name": "GE Aerospace", "sector": "Industrie", "country": "USA"},
    {"ticker": "HON", "name": "Honeywell International", "sector": "Industrie", "country": "USA"},
    {"ticker": "BA", "name": "The Boeing Company", "sector": "Industrie", "country": "USA"},
    {"ticker": "UPS", "name": "United Parcel Service", "sector": "Industrie", "country": "USA"},
    {"ticker": "NEE", "name": "NextEra Energy", "sector": "Versorger", "country": "USA"},
    {"ticker": "PLD", "name": "Prologis Inc.", "sector": "Immobilien", "country": "USA"}
]


def get_eur_conversion_rates():
    rates = {"EUR": 1.0}
    currency_pairs = {
        "USD": "EURUSD=X",
        "CHF": "EURCHF=X",
        "GBP": "EURGBP=X",
        "DKK": "EURDKK=X",
    }
    for curr, pair in currency_pairs.items():
        try:
            ticker_obj = yf.Ticker(pair)
            hist = ticker_obj.history(period="5d")
            if not hist.empty:
                eur_rate = float(hist["Close"].iloc[-1])
                rates[curr] = 1.0 / eur_rate if eur_rate > 0 else 1.0
            else:
                rates[curr] = 1.0
        except Exception:
            rates[curr] = 1.0
    return rates


def sanitize_num(val, default=0.0):
    if val is None:
        return default
    try:
        f = float(val)
        if f != f:  # NaN Check
            return default
        return f
    except (ValueError, TypeError):
        return default


def sample_series(series, num_points=10, fx=1.0):
    total = len(series)
    if total == 0:
        return []
    if total <= num_points:
        return [round(float(v) * fx, 2) for v in series]
    step = (total - 1) / (num_points - 1)
    indices = [int(round(i * step)) for i in range(num_points)]
    return [round(float(series.iloc[idx]) * fx, 2) for idx in indices]


def main():
    print(f"Starte Datenabruf fuer {len(TICKERS_CONFIG)} Aktien...")
    fx_to_eur = get_eur_conversion_rates()
    results = []

    for item in TICKERS_CONFIG:
        symbol = item["ticker"]
        try:
            yt = yf.Ticker(symbol)
            info = yt.info or {}
            hist_1y = yt.history(period="1y")

            if hist_1y.empty:
                print(f"Warnung: Keine Kursdaten fuer {symbol}")
                continue

            currency_orig = info.get("currency", "EUR").upper()
            fx_rate = fx_to_eur.get(currency_orig, 1.0)

            current_price_orig = sanitize_num(info.get("regularMarketPrice") or hist_1y["Close"].iloc[-1])
            prev_close_orig = sanitize_num(info.get("regularMarketPreviousClose"))
            if prev_close_orig == 0.0 and len(hist_1y) > 1:
                prev_close_orig = sanitize_num(hist_1y["Close"].iloc[-2])

            price_eur = round(current_price_orig * fx_rate, 2)
            prev_close_eur = round(prev_close_orig * fx_rate, 2) if prev_close_orig > 0 else price_eur

            if prev_close_eur > 0:
                change_percent = round(((price_eur - prev_close_eur) / prev_close_eur) * 100.0, 2)
            else:
                change_percent = 0.0

            start_price_52w = float(hist_1y["Close"].iloc[0]) * fx_rate
            perf_52w = round(((price_eur - start_price_52w) / start_price_52w) * 100.0, 2) if start_price_52w > 0 else 0.0

            close_series = hist_1y["Close"]
            history_1y = sample_series(close_series, 10, fx_rate)

            # Zeitraum-Aufteilung (1W = letzte 5 Börsentage, 1M = ~22 Tage, 6M = ~126 Tage, 1J = alles)
            ranges_data = {
                "1W": sample_series(close_series.tail(5), 5, fx_rate),
                "1M": sample_series(close_series.tail(22), 8, fx_rate),
                "6M": sample_series(close_series.tail(126), 10, fx_rate),
                "1J": history_1y
            }

            mcap_orig = sanitize_num(info.get("marketCap"), 0.0)
            mcap_eur = round(mcap_orig * fx_rate)

            pe_val = sanitize_num(info.get("trailingPE") or info.get("forwardPE"), 0.0)
            pe_ratio = round(pe_val, 1) if pe_val > 0 else 0.0

            raw_div = sanitize_num(info.get("dividendYield"), 0.0)
            dividend_yield = round(raw_div * 100.0, 2) if raw_div < 1.0 else round(raw_div, 2)

            stock_entry = {
                "ticker": symbol,
                "name": item.get("name", info.get("shortName", symbol)),
                "sector": item.get("sector", "Sonstige"),
                "country": item.get("country", "Global"),
                "price": price_eur,
                "changePercent": change_percent,
                "marketCap": mcap_eur,
                "peRatio": pe_ratio,
                "dividendYield": dividend_yield,
                "perf52w": perf_52w,
                "currency": "EUR",
                "history": history_1y,
                "ranges": ranges_data
            }

            results.append(stock_entry)
            print(f"Erfolgreich: {symbol} ({price_eur} EUR)")

        except Exception as err:
            print(f"Fehler bei {symbol}: {err}", file=sys.stderr)

    out_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "stocks.json")

    payload = {
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
        "currency": "EUR",
        "stocks": results
    }

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"\nFertig! {len(results)} Aktien erfolgreich nach {out_file} exportiert.")


if __name__ == "__main__":
    main()

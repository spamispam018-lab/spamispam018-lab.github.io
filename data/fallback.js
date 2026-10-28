/**
 * data/fallback.js
 * Fallback-Datensatz für die lokale Ausführung (file://) ohne Internetzugang.
 * Stellt window.UNIVERSE_DATA und window.STOCK_DATA für den Offline-Betrieb bereit.
 */

window.UNIVERSE_DATA = [
  {
    ticker: "AAPL",
    name: "Apple Inc.",
    sector: "Technologie",
    country: "USA",
    marketCap: 3420000000000,
    price: 215.20,
    changePercent: 0.72,
    perf52w: 24.3,
    currency: "USD",
    pe: 33.4,
    forwardPe: 28.1,
    dividendYield: 0.0048,
    revGrowth: 0.061,
    netMargin: 0.243,
    debtToEquity: 145.2,
    ratingScore: 1.85
  },
  {
    ticker: "NVDA",
    name: "NVIDIA Corp.",
    sector: "Technologie",
    country: "USA",
    marketCap: 3180000000000,
    price: 129.40,
    changePercent: 3.40,
    perf52w: 165.2,
    currency: "USD",
    pe: 64.2,
    forwardPe: 42.5,
    dividendYield: 0.0003,
    revGrowth: 1.22,
    netMargin: 0.551,
    debtToEquity: 38.6,
    ratingScore: 1.45
  },
  {
    ticker: "MSFT",
    name: "Microsoft Corp.",
    sector: "Technologie",
    country: "USA",
    marketCap: 3120000000000,
    price: 398.50,
    changePercent: 1.25,
    perf52w: 22.8,
    currency: "USD",
    pe: 34.8,
    forwardPe: 29.4,
    dividendYield: 0.0075,
    revGrowth: 0.152,
    netMargin: 0.358,
    debtToEquity: 42.1,
    ratingScore: 1.62
  },
  {
    ticker: "ENR.DE",
    name: "Siemens Energy AG",
    sector: "Industrie",
    country: "Deutschland",
    marketCap: 28400000000,
    price: 38.45,
    changePercent: 3.92,
    perf52w: 212.5,
    currency: "EUR",
    pe: 22.8,
    forwardPe: 16.4,
    dividendYield: 0.026,
    revGrowth: 0.142,
    netMargin: 0.048,
    debtToEquity: 78.4,
    ratingScore: 2.15
  },
  {
    ticker: "SAP.DE",
    name: "SAP SE",
    sector: "Technologie",
    country: "Deutschland",
    marketCap: 245000000000,
    price: 214.50,
    changePercent: 0.85,
    perf52w: 68.4,
    currency: "EUR",
    pe: 45.2,
    forwardPe: 31.8,
    dividendYield: 0.0105,
    revGrowth: 0.098,
    netMargin: 0.165,
    debtToEquity: 32.7,
    ratingScore: 1.78
  },
  {
    ticker: "ALV.DE",
    name: "Allianz SE",
    sector: "Finanzen",
    country: "Deutschland",
    marketCap: 112000000000,
    price: 288.60,
    changePercent: -0.35,
    perf52w: 28.6,
    currency: "EUR",
    pe: 11.4,
    forwardPe: 10.2,
    dividendYield: 0.0495,
    revGrowth: 0.072,
    netMargin: 0.062,
    debtToEquity: 65.0,
    ratingScore: 2.05
  }
];

window.STOCK_DATA = {
  AAPL: {
    ticker: "AAPL",
    profile: {
      ticker: "AAPL",
      name: "Apple Inc.",
      sector: "Technologie",
      industry: "Consumer Electronics",
      country: "USA",
      currency: "USD",
      exchange: "NASDAQ",
      website: "https://www.apple.com",
      summary: "Apple Inc. entwirft, fertigt und vermarktet Smartphones, PCs, Tablets, Wearables und Zubehör und vertreibt eine Reihe damit zusammenhängender Dienstleistungen."
    },
    quote: {
      price: 215.20,
      change: 1.54,
      changePercent: 0.72,
      marketCap: 3420000000000,
      fiftyTwoWeekLow: 164.08,
      fiftyTwoWeekHigh: 237.23,
      volume: 48512000,
      avgVolume: 56230000,
      currency: "USD"
    },
    ratios: {
      peTrailing: 33.4,
      peForward: 28.1,
      pegRatio: 2.35,
      priceToBook: 48.2,
      priceToSales: 8.7,
      evToEbitda: 24.6,
      evToRevenue: 8.8,
      dividendYield: 0.0048,
      payoutRatio: 0.158,
      profitMargins: 0.243,
      operatingMargins: 0.307,
      grossMargins: 0.458,
      returnOnEquity: 1.52,
      returnOnAssets: 0.224,
      debtToEquity: 145.2,
      currentRatio: 0.98,
      quickRatio: 0.82,
      beta: 1.05,
      revenueGrowth: 0.061,
      earningsGrowth: 0.112,
      freeCashflow: 108810000000,
      operatingCashflow: 118260000000,
      totalRevenue: 385600000000,
      netIncome: 100390000000
    },
    financials: {
      incomeStatement: {
        quarterly: [
          { date: "2025-06-30", Total_Revenue: 85777000000, Gross_Profit: 39678000000, Operating_Income: 25352000000, Net_Income: 21448000000, Cost_of_Revenue: 46099000000, Diluted_EPS: 1.40 },
          { date: "2025-09-30", Total_Revenue: 94930000000, Gross_Profit: 43879000000, Operating_Income: 29591000000, Net_Income: 14736000000, Cost_of_Revenue: 51051000000, Diluted_EPS: 0.97 },
          { date: "2025-12-31", Total_Revenue: 119575000000, Gross_Profit: 54855000000, Operating_Income: 40373000000, Net_Income: 33916000000, Cost_of_Revenue: 64720000000, Diluted_EPS: 2.18 },
          { date: "2026-03-31", Total_Revenue: 90753000000, Gross_Profit: 42271000000, Operating_Income: 27900000000, Net_Income: 23636000000, Cost_of_Revenue: 48482000000, Diluted_EPS: 1.53 }
        ],
        annual: [
          { date: "2023-09-30", Total_Revenue: 383285000000, Gross_Profit: 169148000000, Operating_Income: 114301000000, Net_Income: 96995000000, Diluted_EPS: 6.13 },
          { date: "2024-09-30", Total_Revenue: 391035000000, Gross_Profit: 180683000000, Operating_Income: 123216000000, Net_Income: 93736000000, Diluted_EPS: 6.08 },
          { date: "2025-09-30", Total_Revenue: 405200000000, Gross_Profit: 191250000000, Operating_Income: 132400000000, Net_Income: 104500000000, Diluted_EPS: 6.82 }
        ]
      },
      balanceSheet: {
        quarterly: [
          { date: "2025-06-30", Total_Assets: 329774000000, Current_Assets: 134110000000, Total_Liabilities_Net_Minority_Interest: 263098000000, Current_Liabilities: 136894000000, Total_Debt: 101200000000, Cash_And_Cash_Equivalents: 25570000000, Stockholders_Equity: 66676000000 },
          { date: "2025-09-30", Total_Assets: 352583000000, Current_Assets: 147420000000, Total_Liabilities_Net_Minority_Interest: 285620000000, Current_Liabilities: 153400000000, Total_Debt: 104500000000, Cash_And_Cash_Equivalents: 29940000000, Stockholders_Equity: 66963000000 },
          { date: "2025-12-31", Total_Assets: 367200000000, Current_Assets: 152100000000, Total_Liabilities_Net_Minority_Interest: 295400000000, Current_Liabilities: 161200000000, Total_Debt: 102300000000, Cash_And_Cash_Equivalents: 32400000000, Stockholders_Equity: 71800000000 },
          { date: "2026-03-31", Total_Assets: 348600000000, Current_Assets: 141800000000, Total_Liabilities_Net_Minority_Interest: 274200000000, Current_Liabilities: 144500000000, Total_Debt: 98400000000, Cash_And_Cash_Equivalents: 28800000000, Stockholders_Equity: 74400000000 }
        ],
        annual: [
          { date: "2023-09-30", Total_Assets: 352583000000, Total_Liabilities_Net_Minority_Interest: 290437000000, Total_Debt: 111088000000, Cash_And_Cash_Equivalents: 29965000000, Stockholders_Equity: 62146000000 },
          { date: "2024-09-30", Total_Assets: 364980000000, Total_Liabilities_Net_Minority_Interest: 308030000000, Total_Debt: 106629000000, Cash_And_Cash_Equivalents: 29943000000, Stockholders_Equity: 66963000000 },
          { date: "2025-09-30", Total_Assets: 375200000000, Total_Liabilities_Net_Minority_Interest: 302100000000, Total_Debt: 102100000000, Cash_And_Cash_Equivalents: 34100000000, Stockholders_Equity: 73100000000 }
        ]
      },
      cashFlow: {
        quarterly: [
          { date: "2025-06-30", Operating_Cash_Flow: 28854000000, Capital_Expenditure: -2151000000, Free_Cash_Flow: 26703000000 },
          { date: "2025-09-30", Operating_Cash_Flow: 26808000000, Capital_Expenditure: -2648000000, Free_Cash_Flow: 24160000000 },
          { date: "2025-12-31", Operating_Cash_Flow: 39890000000, Capital_Expenditure: -2410000000, Free_Cash_Flow: 37480000000 },
          { date: "2026-03-31", Operating_Cash_Flow: 22708000000, Capital_Expenditure: -2110000000, Free_Cash_Flow: 20598000000 }
        ],
        annual: [
          { date: "2023-09-30", Operating_Cash_Flow: 110543000000, Capital_Expenditure: -10959000000, Free_Cash_Flow: 99584000000 },
          { date: "2024-09-30", Operating_Cash_Flow: 118264000000, Capital_Expenditure: -9448000000, Free_Cash_Flow: 108816000000 },
          { date: "2025-09-30", Operating_Cash_Flow: 124500000000, Capital_Expenditure: -9800000000, Free_Cash_Flow: 114700000000 }
        ]
      }
    },
    analysts: {
      targets: {
        current: 215.20,
        low: 180.00,
        median: 235.00,
        mean: 238.40,
        high: 275.00,
        currency: "USD",
        analystCount: 42
      },
      recommendations: {
        score: 1.85,
        key: "buy",
        breakdown: { strongBuy: 18, buy: 16, hold: 7, sell: 1, strongSell: 0 },
        history: [
          { period: "-3m", strongBuy: 16, buy: 15, hold: 9, sell: 2, strongSell: 0 },
          { period: "-2m", strongBuy: 17, buy: 15, hold: 8, sell: 2, strongSell: 0 },
          { period: "-1m", strongBuy: 18, buy: 16, hold: 7, sell: 1, strongSell: 0 },
          { period: "0m", strongBuy: 18, buy: 16, hold: 7, sell: 1, strongSell: 0 }
        ]
      },
      epsEstimates: [
        { quarter: "2025-06-30", estimate: 1.35, actual: 1.40, surprisePercent: 3.7 },
        { quarter: "2025-09-30", estimate: 0.94, actual: 0.97, surprisePercent: 3.2 },
        { quarter: "2025-12-31", estimate: 2.10, actual: 2.18, surprisePercent: 3.8 },
        { quarter: "2026-03-31", estimate: 1.50, actual: 1.53, surprisePercent: 2.0 },
        { quarter: "2026-06-30", estimate: 1.48, actual: null, surprisePercent: null }
      ]
    },
    insider: {
      summary: {
        buysCount2Q: 2,
        sellsCount2Q: 14,
        buyValueTotal: 1450000,
        sellValueTotal: 48900000,
        sentiment: "Bearish"
      },
      trades: [
        { date: "2026-02-15", insider: "Cook Timothy D", position: "CEO", type: "Sell", text: "Sale at $228.40", shares: 85000, value: 19414000 },
        { date: "2026-01-20", insider: "Maestri Luca", position: "CFO", type: "Sell", text: "Sale at $222.10", shares: 42000, value: 9328200 },
        { date: "2025-11-12", insider: "Levinson Arthur D", position: "Director", type: "Buy", text: "Purchase at $210.50", shares: 5000, value: 1052500 },
        { date: "2025-10-05", insider: "Williams Jeffrey E", position: "COO", type: "Sell", text: "Sale at $218.00", shares: 25000, value: 5450000 }
      ]
    },
    chartHistory: [
      { date: "2025-10-01", close: 195.40, volume: 45000000 },
      { date: "2025-11-01", close: 202.10, volume: 52000000 },
      { date: "2025-12-01", close: 218.60, volume: 61000000 },
      { date: "2026-01-01", close: 224.30, volume: 49000000 },
      { date: "2026-02-01", close: 232.50, volume: 54000000 },
      { date: "2026-03-01", close: 220.80, volume: 47000000 },
      { date: "2026-04-01", close: 215.20, volume: 48512000 }
    ],
    updatedAt: "2026-04-15T00:00:00Z"
  }
};

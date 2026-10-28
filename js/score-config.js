// js/score-config.js
// Clientseitige Schwellenwerte für das 1-bis-5-Sterne-Scoring der Detailansicht.
// Werte und Gewichtungen sind transparent hinterlegt und anpassbar.

window.ScoreConfig = {
  categories: {
    profitability: {
      title: "Profitabilität",
      weight: 0.25,
      metrics: [
        {
          id: "operatingMargin",
          label: "Operative Marge",
          unit: "%",
          higherIsBetter: true,
          // Schwellenwerte für 1 bis 5 Punkte
          thresholds: [5, 12, 18, 25] 
        },
        {
          id: "netMargin",
          label: "Nettomarge",
          unit: "%",
          higherIsBetter: true,
          thresholds: [3, 8, 15, 20]
        },
        {
          id: "fcfMargin",
          label: "FCF-Marge",
          unit: "%",
          higherIsBetter: true,
          thresholds: [2, 7, 12, 18]
        },
        {
          id: "roe",
          label: "Eigenkapitalrendite (ROE)",
          unit: "%",
          higherIsBetter: true,
          thresholds: [6, 12, 18, 25]
        },
        {
          id: "roic",
          label: "ROIC",
          unit: "%",
          higherIsBetter: true,
          thresholds: [5, 10, 15, 20]
        }
      ]
    },

    valuation: {
      title: "Bewertung",
      weight: 0.25,
      metrics: [
        {
          id: "trailingPE",
          label: "KGV (Trailing P/E)",
          unit: "x",
          higherIsBetter: false,
          thresholds: [15, 22, 30, 45] // Niedriger ist besser
        },
        {
          id: "forwardPE",
          label: "Forward KGV",
          unit: "x",
          higherIsBetter: false,
          thresholds: [14, 20, 26, 38]
        },
        {
          id: "priceToSales",
          label: "KUV (P/S)",
          unit: "x",
          higherIsBetter: false,
          thresholds: [2.0, 4.0, 8.0, 15.0]
        },
        {
          id: "priceToBook",
          label: "KBV (P/B)",
          unit: "x",
          higherIsBetter: false,
          thresholds: [2.0, 4.0, 8.0, 16.0]
        },
        {
          id: "priceToFCF",
          label: "KCV (P/FCF)",
          unit: "x",
          higherIsBetter: false,
          thresholds: [15, 25, 35, 50]
        }
      ]
    },

    growth: {
      title: "Wachstum",
      weight: 0.25,
      metrics: [
        {
          id: "revenueGrowthYoY",
          label: "Umsatzwachstum YoY",
          unit: "%",
          higherIsBetter: true,
          thresholds: [3, 8, 15, 25]
        },
        {
          id: "netIncomeGrowthYoY",
          label: "Gewinnwachstum YoY",
          unit: "%",
          higherIsBetter: true,
          thresholds: [2, 7, 14, 22]
        },
        {
          id: "fcfGrowthYoY",
          label: "FCF-Wachstum YoY",
          unit: "%",
          higherIsBetter: true,
          thresholds: [2, 6, 12, 20]
        },
        {
          id: "epsSurpriseAvg",
          label: "EPS Beat (Überraschung)",
          unit: "%",
          higherIsBetter: true,
          thresholds: [0, 2.5, 5.0, 10.0]
        }
      ]
    },

    financialHealth: {
      title: "Finanzielle Stärke",
      weight: 0.25,
      metrics: [
        {
          id: "currentRatio",
          label: "Liquidität (Current Ratio)",
          unit: "x",
          higherIsBetter: true,
          thresholds: [1.0, 1.3, 1.6, 2.2]
        },
        {
          id: "debtToEquity",
          label: "Verschuldung (Debt/Equity)",
          unit: "x",
          higherIsBetter: false,
          thresholds: [0.5, 1.0, 1.8, 3.0]
        },
        {
          id: "cashToDebt",
          label: "Cash vs. Schulden Ratio",
          unit: "x",
          higherIsBetter: true,
          thresholds: [0.4, 0.8, 1.2, 1.8]
        },
        {
          id: "capexToRevenue",
          label: "Kapitalintensität (CapEx/Umsatz)",
          unit: "%",
          higherIsBetter: false,
          thresholds: [5, 10, 18, 28] // Geringere Kapitalintensität = bessere Flexibilität
        }
      ]
    }
  },

  // Berechnungslogik: Ermittelt 1 bis 5 Punkte für eine Kennzahl
  calculateScore: function(metricConfig, value) {
    if (value === null || value === undefined || isNaN(value)) {
      return null;
    }

    const t = metricConfig.thresholds;
    if (metricConfig.higherIsBetter) {
      if (value < t[0]) return 1;
      if (value < t[1]) return 2;
      if (value < t[2]) return 3;
      if (value < t[3]) return 4;
      return 5;
    } else {
      if (value <= t[0]) return 5;
      if (value <= t[1]) return 4;
      if (value <= t[2]) return 3;
      if (value <= t[3]) return 2;
      return 1;
    }
  }
};

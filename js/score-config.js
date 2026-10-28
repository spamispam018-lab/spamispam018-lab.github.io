/**
 * Konfiguration für Bewertungsmodelle und Gewichtungen des Aktienscores
 */
window.ScoreConfig = window.ScoreConfig || {
  weights: {
    valuation: 0.30,       // KGV, Forward KGV, PEG, KBV
    profitability: 0.30,   // Margen, Kapitalrendite
    financialHealth: 0.20, // Verschuldungsgrad, Liquidität
    dividend: 0.20         // Rendite und Kontinuität
  },

  thresholds: {
    valuation: {
      peAttractive: 15.0,
      peModerate: 25.0,
      peExpensive: 45.0,
      pegAttractive: 1.0,
      pegExpensive: 2.0
    },
    profitability: {
      netMarginHigh: 0.20,
      netMarginModerate: 0.10,
      operatingMarginHigh: 0.15,
      operatingMarginLow: 0.05
    },
    financialHealth: {
      debtToEquitySafe: 50.0,
      debtToEquityWarning: 150.0,
      currentRatioSafe: 1.5,
      currentRatioWarning: 1.0
    },
    dividend: {
      yieldMin: 0.5,
      yieldSweetSpotMin: 2.0,
      yieldSweetSpotMax: 5.5,
      yieldWarningHigh: 8.0
    }
  }
};

/**
 * Berechnung und Aggregation von Aktienscores basierend auf Fundamentaldaten
 */
const StockScorer = (function () {
  const DEFAULT_CONFIG = {
    weights: {
      valuation: 0.3,
      profitability: 0.3,
      financialHealth: 0.2,
      dividend: 0.2
    }
  };

  function getConfig() {
    if (typeof window.ScoreConfig !== "undefined" && window.ScoreConfig.weights) {
      return window.ScoreConfig;
    }
    return DEFAULT_CONFIG;
  }

  function scoreValuation(val = {}) {
    let score = 50;
    const pe = parseFloat(val.trailingPE);
    const forwardPe = parseFloat(val.forwardPE);
    const peg = parseFloat(val.pegRatio);

    // KGV-Bewertung
    if (!isNaN(pe) && pe > 0) {
      if (pe < 15) score += 25;
      else if (pe < 25) score += 10;
      else if (pe > 45) score -= 25;
    }

    // Forward PE Trend
    if (!isNaN(pe) && !isNaN(forwardPe) && pe > 0 && forwardPe > 0) {
      if (forwardPe < pe) score += 15;
      else score -= 10;
    }

    // PEG Ratio
    if (!isNaN(peg) && peg > 0) {
      if (peg < 1.0) score += 15;
      else if (peg > 2.0) score -= 15;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function scoreProfitability(stock = {}) {
    let score = 50;
    // Basis-Absicherung bei unvollständigen Margen
    const margins = stock.margins || {};
    const profitMargin = parseFloat(margins.profitMargin);
    const operatingMargin = parseFloat(margins.operatingMargin);

    if (!isNaN(profitMargin)) {
      if (profitMargin > 0.2) score += 30;
      else if (profitMargin > 0.1) score += 15;
      else if (profitMargin < 0) score -= 30;
    }

    if (!isNaN(operatingMargin)) {
      if (operatingMargin > 0.15) score += 20;
      else if (operatingMargin < 0.05) score -= 20;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function scoreFinancialHealth(stock = {}) {
    let score = 60;
    const debtToEquity = parseFloat(stock.debtToEquity);
    const currentRatio = parseFloat(stock.currentRatio);

    if (!isNaN(debtToEquity)) {
      if (debtToEquity < 50) score += 20;
      else if (debtToEquity > 150) score -= 25;
    }

    if (!isNaN(currentRatio)) {
      if (currentRatio > 1.5) score += 20;
      else if (currentRatio < 1.0) score -= 20;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function scoreDividend(stock = {}) {
    let score = 50;
    const yieldPct = parseFloat(stock.dividendYield);

    if (!isNaN(yieldPct)) {
      if (yieldPct >= 2.0 && yieldPct <= 5.5) score += 40;
      else if (yieldPct > 5.5) score += 10; // Risiko zu hoher Renditen
      else if (yieldPct > 0) score += 20;
      else score = 40; // Keine Dividende muss nicht zwingend schlecht sein (Growth)
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function calculateScore(stockDetails) {
    if (!stockDetails) {
      return { total: 0, categories: {}, rating: "Unbekannt", colorClass: "text-gray" };
    }

    const cfg = getConfig();
    const valScore = scoreValuation(stockDetails.valuation);
    const profScore = scoreProfitability(stockDetails);
    const healthScore = scoreFinancialHealth(stockDetails);
    const divScore = scoreDividend(stockDetails);

    const w = cfg.weights;
    const total = Math.round(
      valScore * (w.valuation || 0.25) +
      profScore * (w.profitability || 0.25) +
      healthScore * (w.financialHealth || 0.25) +
      divScore * (w.dividend || 0.25)
    );

    let rating = "Neutral";
    let colorClass = "text-yellow";

    if (total >= 75) {
      rating = "Hervorragend";
      colorClass = "text-green";
    } else if (total >= 60) {
      rating = "Gut";
      colorClass = "text-green-light";
    } else if (total < 40) {
      rating = "Schwach";
      colorClass = "text-red";
    }

    return {
      total,
      rating,
      colorClass,
      categories: {
        valuation: valScore,
        profitability: profScore,
        financialHealth: healthScore,
        dividend: divScore
      }
    };
  }

  return {
    calculateScore
  };
})();

// Global verfügbar machen
window.StockScorer = StockScorer;

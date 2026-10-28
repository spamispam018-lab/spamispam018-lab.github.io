/**
 * Controller für die Kopfdaten, Bewertungsmetriken und das Firmenprofil im Dark-Mode
 */
const StockOverview = (function () {
  function formatEuroPrice(val) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    return Number(val).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " €";
  }

  function formatPercent(val) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    const sign = val > 0 ? "+" : "";
    return `${sign}${Number(val).toFixed(2).replace(".", ",")}%`;
  }

  function formatLargeNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return "-";
    const val = Math.abs(num);
    const sign = num < 0 ? "-" : "";

    if (val >= 1e12) {
      return `${sign}${(val / 1e12).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bio. €`;
    }
    if (val >= 1e9) {
      return `${sign}${(val / 1e9).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mrd. €`;
    }
    if (val >= 1e6) {
      return `${sign}${(val / 1e6).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mio. €`;
    }
    return `${sign}${Number(num).toLocaleString("de-DE")} €`;
  }

  function renderHeaderAndMetrics(stock) {
    if (!stock) return;

    // Header-Texte
    const nameEl = document.getElementById("stock-name");
    const symbolEl = document.getElementById("stock-symbol");
    const industryEl = document.getElementById("stock-industry");
    const subEl = document.getElementById("stock-sector-sub");

    if (nameEl) nameEl.textContent = stock.name || stock.symbol;
    if (symbolEl) symbolEl.textContent = stock.symbol || "";
    if (industryEl) industryEl.textContent = stock.industry || stock.sector || "Aktie";
    if (subEl) subEl.textContent = `${stock.sector || "Markt"} • ${stock.country || "Global"}`;

    // Kurs & Performance
    const priceEl = document.getElementById("stock-price");
    const changeEl = document.getElementById("stock-change");

    if (priceEl) priceEl.textContent = formatEuroPrice(stock.price);

    if (changeEl) {
      const isPositive = (stock.changePercent || 0) >= 0;
      changeEl.className = `detail-change-pill ${isPositive ? "positive" : "negative"}`;
      changeEl.textContent = formatPercent(stock.changePercent);
    }

    // Score Badge
    const scoreBadgeEl = document.getElementById("stock-score-badge");
    if (scoreBadgeEl && window.StockScorer) {
      const score = window.StockScorer.calculateScore(stock);
      scoreBadgeEl.textContent = `${score.total} / 100`;
    }

    // Bewertungskennzahlen
    const val = stock.valuation || {};
    const setVal = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setVal("val-market-cap", formatLargeNumber(val.marketCap || stock.marketCap));
    setVal("val-pe", val.trailingPE ? Number(val.trailingPE).toFixed(2).replace(".", ",") : (stock.peRatio ? Number(stock.peRatio).toFixed(2).replace(".", ",") : "-"));
    setVal("val-fpe", val.forwardPE ? Number(val.forwardPE).toFixed(2).replace(".", ",") : "-");
    setVal("val-peg", val.pegRatio ? Number(val.pegRatio).toFixed(2).replace(".", ",") : "-");
    setVal("val-pb", val.priceToBook ? Number(val.priceToBook).toFixed(2).replace(".", ",") : "-");

    // Unternehmensbeschreibung
    const descEl = document.getElementById("stock-description");
    if (descEl) {
      descEl.textContent = stock.summary || stock.description || "Für dieses Unternehmen ist noch keine detaillierte Beschreibung hinterlegt.";
    }
  }

  async function init() {
    let stock = window.StockDataHandler ? window.StockDataHandler.getCurrentStock() : null;
    if (!stock && window.StockDataHandler) {
      stock = await window.StockDataHandler.initCurrentStock();
    }
    if (!stock) return;

    renderHeaderAndMetrics(stock);

    // Kurschart rendern
    if (window.StockCharts && Array.isArray(stock.history)) {
      window.StockCharts.renderPriceHistory("priceHistoryChart", stock.history);
    }
  }

  return {
    init
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("stock-overview-container") || document.getElementById("stock-name")) {
    StockOverview.init();
  }
});

window.StockOverview = StockOverview;

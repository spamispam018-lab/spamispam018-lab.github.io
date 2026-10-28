/**
 * Render- und Event-Steuerung für die Aktien-Übersichtsseite (Overview)
 */
const StockOverview = (function () {
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text !== undefined && text !== null ? text : "N/A";
    }
  }

  function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = html;
    }
  }

  function updatePriceDisplay(price, change, changePct) {
    setText("stock-price", window.StockDataHandler.formatCurrency(price));

    const changeEl = document.getElementById("stock-change");
    if (changeEl) {
      const isPositive = (change || 0) >= 0;
      const sign = isPositive ? "+" : "";
      changeEl.textContent = `${sign}${window.StockDataHandler.formatNumber(change)} (${window.StockDataHandler.formatPercent(changePct)})`;
      changeEl.className = isPositive ? "metric-change positive" : "metric-change negative";
    }
  }

  function renderScoreBadge(scoreResult) {
    const badgeEl = document.getElementById("stock-score-badge");
    if (!badgeEl) return;

    badgeEl.textContent = `${scoreResult.total} / 100 (${scoreResult.rating})`;
    badgeEl.className = `score-badge ${scoreResult.colorClass}`;
  }

  async function init() {
    const loader = document.getElementById("loading-indicator");
    if (loader) loader.style.display = "block";

    try {
      const stock = await window.StockDataHandler.initCurrentStock();
      if (!stock) {
        setText("stock-name", "Aktie nicht gefunden");
        return;
      }

      // Basis-Kopfdaten
      setText("stock-symbol", stock.symbol);
      setText("stock-name", stock.name);
      setText("stock-sector", stock.sector);
      setText("stock-industry", stock.industry);
      setText("stock-description", stock.description || "Keine Unternehmensbeschreibung hinterlegt.");

      // Kurs- und Bewertungskennzahlen
      updatePriceDisplay(stock.price, stock.change, stock.changePercent);

      const val = stock.valuation || {};
      setText("val-market-cap", window.StockDataHandler.formatLargeNumber(val.marketCap));
      setText("val-pe", window.StockDataHandler.formatNumber(val.trailingPE));
      setText("val-fpe", window.StockDataHandler.formatNumber(val.forwardPE));
      setText("val-peg", window.StockDataHandler.formatNumber(val.pegRatio));
      setText("val-pb", window.StockDataHandler.formatNumber(val.priceToBook));

      // Score berechnen & anzeigen
      if (window.StockScorer) {
        const score = window.StockScorer.calculateScore(stock);
        renderScoreBadge(score);
      }

      // Chart zeichnen
      if (window.StockCharts && Array.isArray(stock.history)) {
        window.StockCharts.renderPriceHistoryChart("priceHistoryChart", stock.history);
      }
    } catch (err) {
      console.error("Fehler beim Initialisieren der Aktienübersicht:", err);
    } finally {
      if (loader) loader.style.display = "none";
    }
  }

  return {
    init
  };
})();

// Automatisch beim Laden des DOMs ausführen
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("stock-overview-container")) {
    StockOverview.init();
  }
});

// Global verfügbar machen
window.StockOverview = StockOverview;

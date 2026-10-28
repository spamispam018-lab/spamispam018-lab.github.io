/**
 * Zentrale Steuerung und Lifecycle-Manager für die Detailansicht
 */
const StockNav = (function () {
  function getCurrentSymbol() {
    return window.StockDataHandler 
      ? window.StockDataHandler.getCurrentSymbol() 
      : "AAPL";
  }

  function updateInternalLinks(symbol) {
    const sym = symbol || getCurrentSymbol();
    const subLinks = document.querySelectorAll("[data-stock-link]");
    subLinks.forEach(link => {
      const baseHref = link.getAttribute("data-stock-link");
      link.href = `${baseHref}?symbol=${encodeURIComponent(sym)}`;
    });
  }

  /**
   * Zentrale Initialisierungsfunktion nach View-Wechsel
   */
  async function init(symbol) {
    if (!window.StockDataHandler) {
      console.error("StockDataHandler ist nicht geladen.");
      return;
    }

    // 1. Symbol explizit setzen (bevorzugt)
    if (symbol) {
      window.StockDataHandler.setSymbol(symbol);
    }
    const activeSymbol = window.StockDataHandler.getCurrentSymbol();

    // 2. Zustand zurücksetzen und Details laden
    window.StockDataHandler.resetState();
    const stock = await window.StockDataHandler.initCurrentStock(activeSymbol);

    // 3. Fallback-Warnbanner verwalten
    const warningEl = document.getElementById("stock-detail-warning");
    if (warningEl) {
      if (window.StockDataHandler.getIsFallback()) {
        warningEl.classList.remove("hidden");
      } else {
        warningEl.classList.add("hidden");
      }
    }

    // 4. Detail-Module explizit sequenziell initialisieren
    if (typeof StockOverview !== "undefined" && StockOverview.init) {
      await StockOverview.init();
    }

    if (typeof StockFinancials !== "undefined" && StockFinancials.init) {
      StockFinancials.init();
    }

    if (typeof StockStatements !== "undefined" && StockStatements.init) {
      StockStatements.init();
    }

    if (typeof StockHoldings !== "undefined" && StockHoldings.init) {
      StockHoldings.init();
    }

    if (typeof StockAnalyst !== "undefined" && StockAnalyst.init) {
      StockAnalyst.init();
    }

    if (typeof WatchlistManager !== "undefined" && WatchlistManager.initDetailPageButton) {
      WatchlistManager.initDetailPageButton();
    }

    updateInternalLinks(activeSymbol);
  }

  return {
    init,
    getCurrentSymbol
  };
})();

// DOM-Ready Hook (greift beim ersten direkten Aufruf der Seite)
document.addEventListener("DOMContentLoaded", () => {
  // Wenn stock.html direkt oder als aktive View eingebettet ist
  if (document.getElementById("stock-name")) {
    StockNav.init();
  }
});

// Global verfügbar machen
window.StockNav = StockNav;

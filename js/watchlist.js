/**
 * Logik zur Verwaltung und Anzeige der Benutzer-Watchlist (LocalStorage)
 */
const WatchlistManager = (function () {
  const STORAGE_KEY = "user_stock_watchlist";

  function getWatchlist() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn("LocalStorage nicht zugänglich:", e);
      return [];
    }
  }

  function saveWatchlist(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error("Konnte Watchlist nicht im LocalStorage speichern:", e);
    }
  }

  function isInWatchlist(symbol) {
    if (!symbol) return false;
    const list = getWatchlist();
    return list.some(item => item.toUpperCase() === symbol.toUpperCase());
  }

  function toggleWatchlist(symbol) {
    if (!symbol) return false;
    const cleanSymbol = symbol.toUpperCase();
    let list = getWatchlist();

    const exists = list.includes(cleanSymbol);
    if (exists) {
      list = list.filter(item => item !== cleanSymbol);
    } else {
      list.push(cleanSymbol);
    }

    saveWatchlist(list);
    updateWatchlistButtons(cleanSymbol, !exists);
    return !exists;
  }

  function updateWatchlistButtons(symbol, isWatched) {
    const buttons = document.querySelectorAll(`[data-watchlist-symbol="${symbol}"]`);
    buttons.forEach(btn => {
      if (isWatched) {
        btn.classList.add("active");
        btn.setAttribute("aria-label", "Aus Watchlist entfernen");
        btn.textContent = btn.dataset.activeText || "★ In Watchlist";
      } else {
        btn.classList.remove("active");
        btn.setAttribute("aria-label", "Zur Watchlist hinzufügen");
        btn.textContent = btn.dataset.inactiveText || "☆ Auf Watchlist";
      }
    });
  }

  async function renderWatchlistTable(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const list = getWatchlist();
    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>Deine Watchlist ist aktuell leer.</p>
          <a href="screener.html" class="btn btn-primary">Aktien entdecken</a>
        </div>
      `;
      return;
    }

    let allStocks = [];
    if (window.DataService) {
      allStocks = await window.DataService.loadStocks();
    }

    let html = `
      <div class="table-responsive">
        <table class="watchlist-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Unternehmen</th>
              <th>Sektor</th>
              <th>Kurs</th>
              <th>Änderung</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
    `;

    list.forEach(symbol => {
      const stock = allStocks.find(s => s.symbol.toUpperCase() === symbol.toUpperCase()) || {
        symbol: symbol,
        name: symbol,
        sector: "N/A",
        price: null,
        change: null,
        changePercent: null
      };

      const priceStr = window.StockDataHandler
        ? window.StockDataHandler.formatCurrency(stock.price)
        : `$${stock.price || "N/A"}`;

      const changeStr = window.StockDataHandler
        ? window.StockDataHandler.formatPercent(stock.changePercent)
        : `${stock.changePercent || 0}%`;

      const changeClass = (stock.changePercent || 0) >= 0 ? "text-green" : "text-red";

      html += `
        <tr>
          <td><a href="stock.html?symbol=${stock.symbol}" class="font-bold">${stock.symbol}</a></td>
          <td>${stock.name}</td>
          <td><span class="badge-sector">${stock.sector}</span></td>
          <td>${priceStr}</td>
          <td class="${changeClass}">${changeStr}</td>
          <td>
            <button class="btn btn-sm btn-outline-danger remove-btn" data-remove-symbol="${stock.symbol}">
              Entfernen
            </button>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;

    // Event Listener für Entfernen-Buttons
    container.querySelectorAll("[data-remove-symbol]").forEach(btn => {
      btn.addEventListener("click", e => {
        const sym = e.target.getAttribute("data-remove-symbol");
        toggleWatchlist(sym);
        renderWatchlistTable(containerId);
      });
    });
  }

  function initDetailPageButton() {
    const symbol = window.StockDataHandler ? window.StockDataHandler.getQueryParam("symbol") : null;
    if (!symbol) return;

    const btn = document.getElementById("detail-watchlist-toggle");
    if (btn) {
      btn.setAttribute("data-watchlist-symbol", symbol.toUpperCase());
      const watched = isInWatchlist(symbol);
      updateWatchlistButtons(symbol.toUpperCase(), watched);

      btn.addEventListener("click", () => {
        toggleWatchlist(symbol);
      });
    }
  }

  return {
    getWatchlist,
    toggleWatchlist,
    isInWatchlist,
    renderWatchlistTable,
    initDetailPageButton,
    updateWatchlistButtons
  };
})();

// DOM-Ready Hook
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("watchlist-container")) {
    WatchlistManager.renderWatchlistTable("watchlist-container");
  }
  WatchlistManager.initDetailPageButton();
});

// Global verfügbar machen
window.WatchlistManager = WatchlistManager;

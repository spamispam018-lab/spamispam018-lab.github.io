/**
 * Watchlist-Manager & Card-Renderer für die mobile App-Ansicht
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

  function getDetailUrl(symbol) {
    const path = window.location.pathname;
    if (path.includes("/Views/") || path.includes("/views/")) {
      return `stock.html?symbol=${encodeURIComponent(symbol)}`;
    }
    return `Views/stock.html?symbol=${encodeURIComponent(symbol)}`;
  }

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

  function updateWatchlistHeroStats(watchedStocks) {
    const countTitle = document.getElementById("watchlist-count-title");
    const avgPerfEl = document.getElementById("watchlist-avg-perf");
    const topPerfEl = document.getElementById("watchlist-top-performer");
    const worstPerfEl = document.getElementById("watchlist-worst-performer");
    const resultsCount = document.getElementById("watchlist-results-count");

    const total = watchedStocks.length;
    if (countTitle) countTitle.textContent = `${total} Titel`;
    if (resultsCount) resultsCount.textContent = `${total} Favoriten gespeichert`;

    if (total === 0) {
      if (avgPerfEl) avgPerfEl.textContent = "-";
      if (topPerfEl) topPerfEl.textContent = "-";
      if (worstPerfEl) worstPerfEl.textContent = "-";
      return;
    }

    const validStocks = watchedStocks.filter(s => typeof s.changePercent === "number" && !isNaN(s.changePercent));
    if (validStocks.length > 0) {
      const avg = validStocks.reduce((acc, curr) => acc + curr.changePercent, 0) / validStocks.length;
      if (avgPerfEl) {
        const sign = avg > 0 ? "+" : "";
        avgPerfEl.textContent = `${sign}${avg.toFixed(2).replace(".", ",")} %`;
      }

      validStocks.sort((a, b) => b.changePercent - a.changePercent);
      const top = validStocks[0];
      const worst = validStocks[validStocks.length - 1];

      if (topPerfEl) {
        const sign = top.changePercent > 0 ? "+" : "";
        topPerfEl.textContent = `${top.symbol} (${sign}${top.changePercent.toFixed(1)}%)`;
      }
      if (worstPerfEl) {
        const sign = worst.changePercent > 0 ? "+" : "";
        worstPerfEl.textContent = `${worst.symbol} (${sign}${worst.changePercent.toFixed(1)}%)`;
      }
    }
  }

  async function renderWatchlistCards(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const list = getWatchlist();
    if (list.length === 0) {
      updateWatchlistHeroStats([]);
      container.innerHTML = `
        <div class="empty-box">
          <p style="margin-bottom: 1rem;">Deine Watchlist ist noch leer.</p>
          <a href="screener.html" class="chip-btn active" style="text-decoration: none; display: inline-block;">
            Aktien im Screener entdecken
          </a>
        </div>
      `;
      return;
    }

    let allStocks = [];
    if (window.DataService) {
      allStocks = await window.DataService.loadStocks();
    }

    const watchedStocks = list.map(symbol => {
      return allStocks.find(s => s.symbol.toUpperCase() === symbol.toUpperCase()) || {
        symbol: symbol,
        name: symbol,
        sector: "Aktie",
        price: null,
        changePercent: null
      };
    });

    updateWatchlistHeroStats(watchedStocks);

    let html = "";
    watchedStocks.forEach(stock => {
      const isPositive = (stock.changePercent || 0) >= 0;
      const changeClass = isPositive ? "positive" : "negative";

      html += `
        <div class="stock-card" style="position: relative;">
          <a href="${getDetailUrl(stock.symbol)}" style="text-decoration: none; color: inherit; display: flex; justify-content: space-between; align-items: center; width: calc(100% - 35px);">
            <div class="stock-info">
              <span class="stock-name">${stock.name || stock.symbol}</span>
              <div class="stock-tags">
                <span class="stock-badge-ticker">${stock.symbol}</span>
                <span>•</span>
                <span>${stock.sector || "Aktie"}</span>
              </div>
            </div>
            <div class="stock-price-box">
              <div class="stock-price-val">${formatEuroPrice(stock.price)}</div>
              <div class="stock-change-pill ${changeClass}">${formatPercent(stock.changePercent)}</div>
            </div>
          </a>
          <button class="remove-favorite-btn" data-remove-sym="${stock.symbol}" title="Aus Favoriten entfernen" style="background: none; border: none; color: var(--text-sub); font-size: 1.1rem; cursor: pointer; padding: 0.25rem 0.5rem; margin-left: 0.5rem;">
            ✕
          </button>
        </div>
      `;
    });

    container.innerHTML = html;

    // Klick-Handler für Entfernen-Buttons
    container.querySelectorAll("[data-remove-sym]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const sym = btn.getAttribute("data-remove-sym");
        toggleWatchlist(sym);
        renderWatchlistCards(containerId);
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
    renderWatchlistCards,
    initDetailPageButton,
    updateWatchlistButtons
  };
})();

// DOM-Ready Hook
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("watchlist-container")) {
    WatchlistManager.renderWatchlistCards("watchlist-container");
  }
  WatchlistManager.initDetailPageButton();
});

window.WatchlistManager = WatchlistManager;

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

  function isWatched(symbol) {
    if (!symbol) return false;
    const list = getWatchlist();
    return list.some(item => item.toUpperCase() === symbol.toUpperCase());
  }

  function toggleWatchlist(symbol) {
    if (!symbol) return false;
    const cleanSymbol = symbol.toUpperCase();
    let list = getWatchlist();
    const exists = list.some(item => item.toUpperCase() === cleanSymbol);

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
        btn.textContent = btn.dataset.activeText || "★ Gemerkt";
      } else {
        btn.classList.remove("active");
        btn.setAttribute("aria-label", "Zur Watchlist hinzufügen");
        btn.textContent = btn.dataset.inactiveText || "☆ Merken";
      }
    });
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
    const sign = Number(val) > 0 ? "+" : "";
    return `${sign}${Number(val).toFixed(2).replace(".", ",")}%`;
  }

  function updateWatchlistHeroStats(watchedStocks = []) {
    const total = watchedStocks.length;
    const countTitle = document.getElementById("watchlist-count-title");
    const resultsCount = document.getElementById("watchlist-results-count");
    const avgPerfEl = document.getElementById("watchlist-avg-perf");
    const topPerfEl = document.getElementById("watchlist-top-performer");
    const worstPerfEl = document.getElementById("watchlist-worst-performer");

    if (countTitle) countTitle.textContent = `${total} Titel`;
    if (resultsCount) resultsCount.textContent = `${total} Favoriten gespeichert`;

    if (total === 0) {
      if (avgPerfEl) avgPerfEl.textContent = "-";
      if (topPerfEl) topPerfEl.textContent = "-";
      if (worstPerfEl) worstPerfEl.textContent = "-";
      return;
    }

    const validStocks = watchedStocks.filter(s => {
      const p = s.changePercent !== undefined ? s.changePercent : s.change;
      return typeof p === "number" && !isNaN(p);
    });

    if (validStocks.length > 0) {
      const getChange = s => (s.changePercent !== undefined ? s.changePercent : s.change);
      const avg = validStocks.reduce((acc, curr) => acc + getChange(curr), 0) / validStocks.length;
      if (avgPerfEl) {
        const sign = avg > 0 ? "+" : "";
        avgPerfEl.textContent = `${sign}${avg.toFixed(2).replace(".", ",")} %`;
      }

      validStocks.sort((a, b) => getChange(b) - getChange(a));
      const top = validStocks[0];
      const worst = validStocks[validStocks.length - 1];

      if (topPerfEl) {
        const ch = getChange(top);
        const sign = ch > 0 ? "+" : "";
        topPerfEl.textContent = `${top.symbol} (${sign}${ch.toFixed(1)}%)`;
      }
      if (worstPerfEl) {
        const ch = getChange(worst);
        const sign = ch > 0 ? "+" : "";
        worstPerfEl.textContent = `${worst.symbol} (${sign}${ch.toFixed(1)}%)`;
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
        <div class="empty-box py-12 text-center text-slate-400">
          <p style="margin-bottom: 1rem;">Deine Watchlist ist noch leer.</p>
          <button onclick="Navigation.navigate('screener')" class="chip-btn active px-4 py-2 bg-blue-600 rounded-xl text-white">
            Aktien im Screener entdecken
          </button>
        </div>
      `;
      return;
    }

    let allStocks = [];
    if (window.DataService) {
      allStocks = await window.DataService.loadStocks();
    }

    const watchedStocks = list.map(symbol => {
      const found = allStocks.find(s => s.symbol.toUpperCase() === symbol.toUpperCase());
      if (found) return found;
      return {
        symbol: symbol,
        name: symbol,
        sector: "Aktie",
        price: null,
        change: null,
        changePercent: null
      };
    });

    updateWatchlistHeroStats(watchedStocks);

    let html = "";
    watchedStocks.forEach(stock => {
      const ch = stock.changePercent !== undefined ? stock.changePercent : stock.change;
      const isPositive = (ch || 0) >= 0;
      const changeClass = isPositive ? "positive" : "negative";

      html += `
        <div class="stock-card" style="position: relative; cursor: pointer;" onclick="Navigation.openStock('${stock.symbol}')">
          <div style="display: flex; justify-content: space-between; align-items: center; width: calc(100% - 35px);">
            <div class="stock-info">
              <span class="stock-name font-bold text-white">${stock.name || stock.symbol}</span>
              <div class="stock-tags text-xs text-slate-400">
                <span class="stock-badge-ticker font-semibold text-blue-400">${stock.symbol}</span>
                <span>•</span>
                <span>${stock.sector || "Aktie"}</span>
              </div>
            </div>
            <div class="stock-price-box text-right">
              <div class="stock-price-val font-bold text-white">${formatEuroPrice(stock.price)}</div>
              <div class="stock-change-pill ${changeClass}">${formatPercent(ch)}</div>
            </div>
          </div>
          <button class="remove-fav-btn" onclick="event.stopPropagation(); WatchlistManager.toggleWatchlist('${stock.symbol}'); WatchlistManager.renderWatchlistCards('${containerId}');" aria-label="Löschen" style="background: none; border: none; cursor: pointer; color: #94a3b8; font-size: 1.25rem;">
            &times;
          </button>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function initDetailPageButton() {
    const btn = document.getElementById("detail-watchlist-toggle");
    if (!btn) return;

    const symbol = window.StockDataHandler ? window.StockDataHandler.getCurrentSymbol() : "AAPL";
    const watched = isWatched(symbol);

    btn.setAttribute("data-watchlist-symbol", symbol.toUpperCase());
    updateWatchlistButtons(symbol.toUpperCase(), watched);

    btn.onclick = () => {
      const nowWatched = toggleWatchlist(symbol.toUpperCase());
      updateWatchlistButtons(symbol.toUpperCase(), nowWatched);
    };
  }

  return {
    getWatchlist,
    isWatched,
    toggleWatchlist,
    renderWatchlistCards,
    initDetailPageButton
  };
})();

window.WatchlistManager = WatchlistManager;

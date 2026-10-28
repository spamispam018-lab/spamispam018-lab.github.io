// js/ui.js - Haupt-UI-Steuerung und Routing

const AppUI = {
  currentView: 'screener',

  async init() {
    // 1. Daten laden (entweder stocks.json oder Fallback)
    const stocks = await DataService.loadStocks();

    // 2. Filter-Service mit den Rohdaten versorgen
    if (typeof FilterService !== 'undefined') {
      FilterService.init(stocks);
    }

    // 3. Hash-Routing unterstützen (Zurück-Button, Reloads, Direktlinks)
    window.addEventListener('hashchange', () => this.handleHashRoute());

    if (window.location.hash) {
      await this.handleHashRoute();
    } else {
      await this.loadView(this.currentView);
    }
  },

  async handleHashRoute() {
    const hash = window.location.hash || '';
    if (hash.startsWith('#stock/')) {
      const symbol = hash.replace('#stock/', '').trim();
      await this.openStockView(symbol);
    } else if (hash === '#watchlist') {
      Navigation.navigate('watchlist', false);
    } else {
      Navigation.navigate('screener', false);
    }
  },

  async loadView(viewName) {
    this.currentView = viewName;
    const container = document.getElementById('viewContainer');
    if (!container) return;

    try {
      // Relative Pfad-Absicherung für GitHub Pages (Views/ ist case-sensitiv)
      const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
      const url = new URL(`Views/${viewName}.html`, window.location.origin + basePath).href;
      
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`View ${viewName} konnte nicht geladen werden (${res.status})`);
      }
      const html = await res.text();
      container.innerHTML = html;

      // Icons neu generieren
      if (window.lucide) {
        lucide.createIcons();
      }

      // View-spezifische Initialisierung
      if (viewName === 'screener') {
        this.initScreenerView();
      } else if (viewName === 'watchlist') {
        if (typeof WatchlistManager !== 'undefined' && WatchlistManager.renderWatchlistCards) {
          WatchlistManager.renderWatchlistCards('watchlist-container');
        }
      }
    } catch (err) {
      console.error(`Fehler beim Rendern der View ${viewName}:`, err);
      container.innerHTML = `
        <div class="p-6 text-center text-slate-400">
          <p class="text-red-400 font-semibold mb-2">Fehler beim Laden der Ansicht</p>
          <p class="text-xs">${err.message}</p>
        </div>
      `;
    }
  },

  async openStockView(symbol) {
    this.currentView = 'stock';
    await this.loadView('stock');
    if (typeof StockNav !== 'undefined' && StockNav.init) {
      await StockNav.init(symbol);
    }
  },

  initScreenerView() {
    this.updateMarketOverview();

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        FilterService.setSearchQuery(e.target.value);
        this.renderStockList();
      });
    }

    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        FilterService.setSort(e.target.value);
        this.renderStockList();
      });
    }

    this.renderStockList();
  },

  updateMarketOverview() {
    const totalCountEl = document.getElementById('totalStocksCount');
    const topGainerEl = document.getElementById('topGainer');
    const avgPeEl = document.getElementById('avgPe');
    const avgDivEl = document.getElementById('avgDiv');

    const stocks = DataService.getAllStocks();

    if (totalCountEl) {
      totalCountEl.textContent = `${stocks.length} Titel`;
    }

    if (stocks.length > 0) {
      const sortedByChange = [...stocks].sort((a, b) => (b.change || 0) - (a.change || 0));
      if (topGainerEl && sortedByChange[0]) {
        const top = sortedByChange[0];
        const changeVal = top.change >= 0 ? `+${top.change.toFixed(2)}%` : `${top.change.toFixed(2)}%`;
        topGainerEl.textContent = `${top.symbol} (${changeVal})`;
      }

      const validPeStocks = stocks.filter(s => s.pe && s.pe > 0);
      const avgPe = validPeStocks.length 
        ? (validPeStocks.reduce((sum, s) => sum + s.pe, 0) / validPeStocks.length).toFixed(1)
        : '-';
      if (avgPeEl) avgPeEl.textContent = avgPe;

      const validDivStocks = stocks.filter(s => s.dividendYield && s.dividendYield >= 0);
      const avgDiv = validDivStocks.length
        ? (validDivStocks.reduce((sum, s) => sum + s.dividendYield, 0) / validDivStocks.length).toFixed(2) + '%'
        : '-';
      if (avgDivEl) avgDivEl.textContent = avgDiv;
    } else {
      if (topGainerEl) topGainerEl.textContent = '-';
      if (avgPeEl) avgPeEl.textContent = '-';
      if (avgDivEl) avgDivEl.textContent = '-';
    }
  },

  renderStockList() {
    const listContainer = document.getElementById('stockList');
    const resultCountEl = document.getElementById('resultCount');
    if (!listContainer) return;

    const filtered = FilterService.getFilteredStocks();

    if (resultCountEl) {
      resultCountEl.textContent = `${filtered.length} Ergebnisse`;
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="py-16 text-center text-slate-400">
          <i data-lucide="filter-x" class="w-10 h-10 mx-auto mb-3 opacity-40"></i>
          <p class="text-sm">Keine passenden Titel für diese Filterung gefunden.</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    listContainer.innerHTML = filtered.map(stock => {
      const isPositive = (stock.change || 0) >= 0;
      const changeClass = isPositive ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10';
      const changePrefix = isPositive ? '+' : '';
      const price = typeof stock.price === 'number' ? stock.price.toFixed(2) : '-';
      const change = typeof stock.change === 'number' ? `${changePrefix}${stock.change.toFixed(2)}%` : '-';
      const pe = stock.pe ? stock.pe.toFixed(1) : '-';
      const divYield = stock.dividendYield ? `${stock.dividendYield.toFixed(2)}%` : '-';

      return `
        <div onclick="Navigation.openStock('${stock.symbol}')" class="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl hover:border-slate-700 transition cursor-pointer mb-3">
          <div class="flex items-center justify-between mb-2">
            <div>
              <div class="font-bold text-base text-white">${stock.symbol}</div>
              <div class="text-xs text-slate-400 truncate max-w-[200px]">${stock.name || ''}</div>
            </div>
            <div class="text-right">
              <div class="font-bold text-base text-white">${price} €</div>
              <span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-lg ${changeClass}">
                ${change}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-4 text-xs text-slate-400 pt-2 border-t border-slate-800/60 mt-2">
            <div><span class="text-slate-500">KGV:</span> <span class="font-medium text-slate-300">${pe}</span></div>
            <div><span class="text-slate-500">Div:</span> <span class="font-medium text-slate-300">${divYield}</span></div>
            <div><span class="text-slate-500">Sektor:</span> <span class="font-medium text-slate-300">${stock.sector || '-'}</span></div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) {
      lucide.createIcons();
    }
  }
};

const Navigation = {
  navigate(viewName, updateHash = true) {
    const screenerBtn = document.getElementById('navScreenerBtn');
    const watchlistBtn = document.getElementById('navWatchlistBtn');

    if (viewName === 'screener') {
      screenerBtn?.classList.remove('text-slate-400');
      screenerBtn?.classList.add('text-blue-500');
      watchlistBtn?.classList.remove('text-blue-500');
      watchlistBtn?.classList.add('text-slate-400');
      if (updateHash) window.location.hash = '';
    } else if (viewName === 'watchlist') {
      watchlistBtn?.classList.remove('text-slate-400');
      watchlistBtn?.classList.add('text-blue-500');
      screenerBtn?.classList.remove('text-blue-500');
      screenerBtn?.classList.add('text-slate-400');
      if (updateHash) window.location.hash = '#watchlist';
    }

    AppUI.loadView(viewName);
  },

  async openStock(symbol) {
    const clean = (symbol || 'AAPL').toUpperCase().trim();
    window.location.hash = `#stock/${clean}`;
    await AppUI.openStockView(clean);
  }
};

window.AppUI = AppUI;
window.Navigation = Navigation;

document.addEventListener('DOMContentLoaded', () => {
  AppUI.init();
});

/**
 * UI Controller Module
 * Handles DOM manipulation, view rendering, and user interactions.
 */
const AppUI = {
    currentView: 'screener',
    currentSort: { column: 'marketCap', direction: 'desc' },

    /**
     * Initialisiert die Benutzeroberfläche und lädt initiale Daten.
     */
    async init() {
        this.setupNavigation();
        this.setupGlobalEvents();

        try {
            // Lade Daten abfangbar mit try/catch
            const stocks = await DataService.loadStocks();

            if (!stocks || stocks.length === 0) {
                throw new Error('Keine Aktiendaten verfügbar');
            }

            // Initiale Ansicht rendern
            this.renderScreenerView(stocks);
            this.updateMarketOverview();
        } catch (error) {
            console.error('Fehler bei der Initialisierung von AppUI:', error);

            const container = document.getElementById('stockList') || document.getElementById('viewContainer');
            if (container) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center p-8 text-center bg-gray-800 border border-gray-700 rounded-lg my-6">
                        <svg class="w-12 h-12 text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h3 class="text-lg font-medium text-white mb-1">Daten konnten nicht geladen werden</h3>
                        <p class="text-sm text-gray-400 max-w-md">Die Aktiendaten konnten weder vom Server noch aus dem Cache abgerufen werden. Bitte überprüfen Sie die Internetverbindung oder versuchen Sie es später erneut.</p>
                    </div>
                `;
            }
        }
    },

    /**
     * Richtet die Navigationsleiste und URL-Hash-Steuerung ein.
     */
    setupNavigation() {
        window.addEventListener('hashchange', () => this.handleRouting());
        document.querySelectorAll('nav a[data-view]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = link.getAttribute('data-view');
                window.location.hash = view;
            });
        });
    },

    /**
     * Behandelt clientseitiges Routing basierend auf dem Hash.
     */
    handleRouting() {
        const hash = window.location.hash.replace('#', '') || 'screener';
        if (hash.startsWith('stock/')) {
            const symbol = hash.split('/')[1];
            this.showStockDetail(symbol);
        } else if (hash === 'watchlist') {
            this.showWatchlist();
        } else {
            this.showScreener();
        }
    },

    /**
     * Richtet globale Event-Listener für Suche und Sortierung ein.
     */
    setupGlobalEvents() {
        const searchInput = document.getElementById('stockSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value;
                const filtered = DataService.searchStocks(query);
                this.renderStockTable(filtered);
            });
        }
    },

    /**
     * Aktualisiert die Kennzahlenübersicht des Marktes robust.
     */
    updateMarketOverview() {
        let stocks = [];
        if (typeof DataService.getAllStocks === 'function') {
            stocks = DataService.getAllStocks();
        } else if (Array.isArray(DataService.stocks)) {
            stocks = DataService.stocks;
        }

        const totalStocksEl = document.getElementById('totalStocksCount');
        if (totalStocksEl) {
            totalStocksEl.textContent = stocks.length;
        }

        const avgPeEl = document.getElementById('avgPeRatio');
        if (avgPeEl && stocks.length > 0) {
            const peList = stocks.map(s => parseFloat(s.pe)).filter(p => !isNaN(p) && p > 0);
            const avgPe = peList.length > 0 ? (peList.reduce((a, b) => a + b, 0) / peList.length).toFixed(1) : '-';
            avgPeEl.textContent = avgPe;
        }
    },

    /**
     * Zeigt die Screener-Ansicht an.
     */
    showScreener() {
        this.currentView = 'screener';
        let stocks = [];
        if (typeof DataService.getAllStocks === 'function') {
            stocks = DataService.getAllStocks();
        } else if (Array.isArray(DataService.stocks)) {
            stocks = DataService.stocks;
        }
        this.renderScreenerView(stocks);
    },

    /**
     * Rendert die Tabelle und Filter in der Screener-Ansicht.
     * @param {Array} stocks
     */
    renderScreenerView(stocks) {
        const container = document.getElementById('viewContainer');
        if (!container) return;

        // Sicherstellen, dass das Grundgerüst vorhanden ist
        if (!document.getElementById('stockTableBody')) {
            container.innerHTML = `
                <div class="mb-6 flex flex-wrap gap-4 items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-sm text-gray-400">Aktien gesamt:</span>
                        <span id="totalStocksCount" class="font-bold text-white">${stocks.length}</span>
                    </div>
                </div>
                <div class="overflow-x-auto bg-gray-800 border border-gray-700 rounded-lg shadow">
                    <table class="min-w-full divide-y divide-gray-700 text-left text-sm text-gray-300">
                        <thead class="bg-gray-900 text-xs uppercase tracking-wider text-gray-400">
                            <tr>
                                <th class="px-4 py-3 cursor-pointer" onclick="AppUI.sortBy('symbol')">Symbol</th>
                                <th class="px-4 py-3 cursor-pointer" onclick="AppUI.sortBy('name')">Name</th>
                                <th class="px-4 py-3 cursor-pointer" onclick="AppUI.sortBy('sector')">Sektor</th>
                                <th class="px-4 py-3 text-right cursor-pointer" onclick="AppUI.sortBy('price')">Kurs</th>
                                <th class="px-4 py-3 text-right cursor-pointer" onclick="AppUI.sortBy('change')">Änd. %</th>
                                <th class="px-4 py-3 text-right cursor-pointer" onclick="AppUI.sortBy('marketCap')">Marktkap.</th>
                                <th class="px-4 py-3 text-right cursor-pointer" onclick="AppUI.sortBy('pe')">KGV</th>
                                <th class="px-4 py-3 text-center">Aktionen</th>
                            </tr>
                        </thead>
                        <tbody id="stockTableBody" class="divide-y divide-gray-700 bg-gray-800">
                        </tbody>
                    </table>
                </div>
            `;
        }

        this.renderStockTable(stocks);
    },

    /**
     * Rendert die Zeilen der Aktientabelle.
     * @param {Array} stocks
     */
    renderStockTable(stocks) {
        const tbody = document.getElementById('stockTableBody');
        if (!tbody) return;

        if (!stocks || stocks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-gray-500">Keine passenden Aktien gefunden.</td></tr>`;
            return;
        }

        tbody.innerHTML = stocks.map(stock => {
            const changeVal = parseFloat(stock.change) || 0;
            const changeClass = changeVal > 0 ? 'text-green-400' : changeVal < 0 ? 'text-red-400' : 'text-gray-400';
            const changeSign = changeVal > 0 ? '+' : '';

            return `
                <tr class="hover:bg-gray-750 transition-colors border-b border-gray-700/50">
                    <td class="px-4 py-3 font-semibold text-white">
                        <a href="#stock/${stock.symbol}" class="hover:text-blue-400 transition-colors">${stock.symbol}</a>
                    </td>
                    <td class="px-4 py-3 truncate max-w-xs text-gray-200">${stock.name || '-'}</td>
                    <td class="px-4 py-3 text-gray-400">${stock.sector || '-'}</td>
                    <td class="px-4 py-3 text-right font-medium text-white">$${(parseFloat(stock.price) || 0).toFixed(2)}</td>
                    <td class="px-4 py-3 text-right font-medium ${changeClass}">${changeSign}${changeVal.toFixed(2)}%</td>
                    <td class="px-4 py-3 text-right text-gray-300">${this.formatMarketCap(stock.marketCap)}</td>
                    <td class="px-4 py-3 text-right text-gray-300">${stock.pe ? parseFloat(stock.pe).toFixed(1) : '-'}</td>
                    <td class="px-4 py-3 text-center">
                        <button onclick="WatchlistService.toggle('${stock.symbol}')" class="text-gray-400 hover:text-yellow-400 transition-colors" title="Watchlist">
                            ★
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    /**
     * Sortiert die Aktienliste nach einer Spalte.
     * @param {string} column
     */
    sortBy(column) {
        if (this.currentSort.column === column) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.column = column;
            this.currentSort.direction = 'desc';
        }

        let stocks = [];
        if (typeof DataService.getAllStocks === 'function') {
            stocks = [...DataService.getAllStocks()];
        } else if (Array.isArray(DataService.stocks)) {
            stocks = [...DataService.stocks];
        }

        stocks.sort((a, b) => {
            let valA = a[column];
            let valB = b[column];

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return this.currentSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return this.currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        this.renderStockTable(stocks);
    },

    /**
     * Hilfsfunktion zur Formatierung der Marktkapitalisierung.
     * @param {number|string} value
     * @returns {string}
     */
    formatMarketCap(value) {
        const num = parseFloat(value);
        if (isNaN(num) || num === 0) return '-';
        if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
        if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
        return `$${num.toLocaleString()}`;
    },

    /**
     * Navigiert zur Detailansicht einer Aktie.
     * @param {string} symbol
     */
    async showStockDetail(symbol) {
        this.currentView = 'detail';
        const container = document.getElementById('viewContainer');
        if (!container) return;

        container.innerHTML = `<div class="p-8 text-center text-gray-400">Lade Daten für ${symbol}...</div>`;
        const detail = await DataService.loadStockDetails(symbol);

        if (!detail) {
            container.innerHTML = `<div class="p-8 text-center text-red-400 bg-gray-800 rounded-lg">Keine Details für ${symbol} gefunden.</div>`;
            return;
        }

        if (window.StockDetailView && typeof window.StockDetailView.render === 'function') {
            window.StockDetailView.render(detail);
        } else {
            container.innerHTML = `
                <div class="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <h2 class="text-2xl font-bold text-white mb-2">${detail.name} (${detail.symbol})</h2>
                    <p class="text-gray-400 mb-4">${detail.sector} &bull; ${detail.industry}</p>
                    <div class="text-3xl font-bold text-white mb-4">$${(detail.price || 0).toFixed(2)}</div>
                    <p class="text-gray-300 leading-relaxed">${detail.description || 'Keine Beschreibung vorhanden.'}</p>
                </div>
            `;
        }
    },

    /**
     * Zeigt die Watchlist-Ansicht an.
     */
    showWatchlist() {
        this.currentView = 'watchlist';
        if (window.WatchlistView && typeof window.WatchlistView.render === 'function') {
            window.WatchlistView.render();
        }
    }
};

window.AppUI = AppUI;

document.addEventListener('DOMContentLoaded', () => {
    AppUI.init();
});

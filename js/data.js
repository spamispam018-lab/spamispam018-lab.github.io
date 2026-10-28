/**
 * Data Service Module
 * Handles loading stock data and stock details with caching and fallback support.
 */
const DataService = {
    _cache: {
        stocks: null,
        details: {},
        lastFetch: null
    },

    // Abwärtskompatible Eigenschaften
    stocks: [],
    detailsCache: {},

    /**
     * Ermittelt die Basis-URL der Anwendung absolut zum Repository-Root.
     * Erkennt gezielt nur das eigene Skript (/js/data.js), um Verwechslungen
     * mit fallback-data.js oder stock-data.js auszuschließen.
     */
    _getBaseUrl() {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].src || '';
            const path = src.split('?')[0].split('#')[0];
            if (path.endsWith('/js/data.js') || path === 'js/data.js') {
                return new URL('../', src).href;
            }
        }

        // Fallback über window.location.pathname
        const pathname = window.location.pathname;
        const dir = pathname.substring(0, pathname.lastIndexOf('/') + 1);
        return window.location.origin + dir;
    },

    /**
     * Synchroner Abruf aller bereits geladenen Aktien (rückwärtskompatibel).
     * @returns {Array} Array aller Aktien oder leeres Array
     */
    getAllStocks() {
        return this._cache.stocks || this.stocks || [];
    },

    /**
     * Lädt die Aktienliste aus data/stocks.json oder greift auf Fallback-Daten zurück.
     * Wirft niemals Exceptions nach außen.
     * @returns {Promise<Array>}
     */
    async loadStocks() {
        if (this._cache.stocks && this._cache.stocks.length > 0) {
            this.stocks = this._cache.stocks;
            return this._cache.stocks;
        }

        try {
            const baseUrl = this._getBaseUrl();
            const response = await fetch(`${baseUrl}data/stocks.json`);

            if (!response.ok) {
                throw new Error(`HTTP-Fehler ${response.status} beim Laden von stocks.json`);
            }

            const data = await response.json();
            const stockList = Array.isArray(data) ? data : (data.stocks || []);

            if (!stockList || stockList.length === 0) {
                throw new Error('Empfangene Aktienliste ist leer oder ungültig');
            }

            this._cache.stocks = stockList;
            this.stocks = stockList;
            this._cache.lastFetch = Date.now();
            return this._cache.stocks;
        } catch (error) {
            console.warn('Verwende Fallback-Aktiendaten:', error.message);
            const fallback = (typeof FALLBACK_STOCKS !== 'undefined' && Array.isArray(FALLBACK_STOCKS))
                ? FALLBACK_STOCKS
                : [];

            this._cache.stocks = fallback;
            this.stocks = fallback;
            return this._cache.stocks;
        }
    },

    /**
     * Lädt Detailinformationen zu einer Aktie anhand ihres Symbols.
     * @param {string} symbol
     * @returns {Promise<Object|null>}
     */
    async loadStockDetails(symbol) {
        if (!symbol) return null;

        const cleanSymbol = symbol.toUpperCase().trim();

        if (this._cache.details[cleanSymbol]) {
            return this._cache.details[cleanSymbol];
        }

        try {
            const baseUrl = this._getBaseUrl();
            const response = await fetch(`${baseUrl}data/details/${cleanSymbol}.json`);

            if (response.ok) {
                const details = await response.json();
                this._cache.details[cleanSymbol] = details;
                this.detailsCache[cleanSymbol] = details;
                return details;
            }
        } catch (e) {
            // Weiter zu Fallbacks
        }

        if (typeof FALLBACK_DETAILS !== 'undefined' && FALLBACK_DETAILS[cleanSymbol]) {
            const fallbackDetail = FALLBACK_DETAILS[cleanSymbol];
            this._cache.details[cleanSymbol] = fallbackDetail;
            this.detailsCache[cleanSymbol] = fallbackDetail;
            return fallbackDetail;
        }

        const stocks = this.getAllStocks();
        const baseStock = stocks.find(s => s.symbol && s.symbol.toUpperCase() === cleanSymbol);

        if (baseStock) {
            const synthetic = this._createSyntheticDetails(baseStock);
            this._cache.details[cleanSymbol] = synthetic;
            this.detailsCache[cleanSymbol] = synthetic;
            return synthetic;
        }

        return null;
    },

    /**
     * Erzeugt ein synthetisches Detail-Objekt aus den Basisdaten einer Aktie.
     * @param {Object} stock
     * @returns {Object}
     */
    _createSyntheticDetails(stock) {
        return {
            symbol: stock.symbol,
            name: stock.name || stock.symbol,
            sector: stock.sector || 'Unbekannt',
            industry: stock.industry || stock.sector || 'Unbekannt',
            price: stock.price || 0,
            change: stock.change || 0,
            marketCap: stock.marketCap || 0,
            pe: stock.pe || null,
            dividendYield: stock.dividendYield || 0,
            description: `${stock.name || stock.symbol} ist ein Unternehmen im Sektor ${stock.sector || 'Unbekannt'}.`,
            website: '',
            employees: null,
            country: 'USA',
            financials: {
                revenue: [],
                netIncome: [],
                freeCashFlow: []
            },
            ratios: {
                pe: stock.pe || null,
                forwardPe: null,
                ps: null,
                pb: null,
                roe: null,
                debtToEquity: null
            },
            analystRatings: {
                buy: 0,
                hold: 0,
                sell: 0,
                targetPrice: null
            },
            isSynthetic: true
        };
    },

    /**
     * Durchsucht die Aktienliste anhand eines Suchbegriffs.
     * @param {string} query
     * @returns {Array}
     */
    searchStocks(query) {
        const stocks = this.getAllStocks();
        if (!query || typeof query !== 'string') return stocks;

        const q = query.toLowerCase().trim();
        return stocks.filter(stock =>
            (stock.symbol && stock.symbol.toLowerCase().includes(q)) ||
            (stock.name && stock.name.toLowerCase().includes(q)) ||
            (stock.sector && stock.sector.toLowerCase().includes(q))
        );
    },

    /**
     * Liefert alle eindeutigen Sektoren sortiert zurück.
     * @returns {Array<string>}
     */
    getSectors() {
        const stocks = this.getAllStocks();
        const sectors = new Set();
        stocks.forEach(stock => {
            if (stock.sector) sectors.add(stock.sector);
        });
        return Array.from(sectors).sort();
    },

    /**
     * Leert den internen Cache.
     */
    clearCache() {
        this._cache = {
            stocks: null,
            details: {},
            lastFetch: null
        };
        this.stocks = [];
        this.detailsCache = {};
    }
};

window.DataService = DataService;
window.DataModule = DataService;

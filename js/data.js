/* ==========================================================================
   Finanz-Dashboard - Daten-Modul (Erweitert)
   Lädt die aggregierten Daten (stocks.json) und Detaildaten (details/*.json)
   ========================================================================== */

const DataModule = {
    // Cache für bereits geladene Daten
    _cache: {
        stocks: null,
        details: {}
    },

    /**
     * Ermittelt die Basis-URL zum Repository-Root dynamisch anhand des Pfads
     * von data.js selbst, sodass es immer zuverlässig auf GitHub Pages und lokal funktioniert.
     */
    _getBaseUrl() {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].src;
            if (src && src.includes('data.js')) {
                // data.js liegt unter .../js/data.js -> zwei Ebenen nach oben ist das Root-Verzeichnis
                return new URL('../', src).href;
            }
        }
        // Fallback über pathname, falls Script-Tag nicht greift
        const pathname = window.location.pathname.toLowerCase();
        if (pathname.includes('/views/')) {
            return '../';
        }
        return './';
    },

    /**
     * Lädt die Übersichtsdaten aller Aktien (stocks.json)
     * @returns {Promise<Array>} Array von Aktien-Objekten
     */
    async loadStocks() {
        if (this._cache.stocks) {
            return this._cache.stocks;
        }

        try {
            const baseUrl = this._getBaseUrl();
            const response = await fetch(`${baseUrl}data/stocks.json`);
            if (!response.ok) {
                throw new Error(`HTTP-Fehler: ${response.status}`);
            }
            const data = await response.json();
            this._cache.stocks = data;
            return data;
        } catch (error) {
            console.warn('Konnte stocks.json nicht laden, nutze Fallback-Daten:', error.message);
            if (typeof FALLBACK_STOCKS !== 'undefined') {
                this._cache.stocks = FALLBACK_STOCKS;
                return FALLBACK_STOCKS;
            }
            throw error;
        }
    },

    /**
     * Lädt die Detaildaten für eine bestimmte Aktie
     * @param {string} symbol - Das Tickersymbol (z. B. "NVDA")
     * @returns {Promise<Object>} Detail-Objekt der Aktie
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
            if (!response.ok) {
                throw new Error(`HTTP-Fehler: ${response.status}`);
            }
            const data = await response.json();
            this._cache.details[cleanSymbol] = data;
            return data;
        } catch (error) {
            console.warn(`Detaildaten für ${cleanSymbol} nicht gefunden, prüfe Fallback:`, error.message);
            
            if (typeof FALLBACK_DETAILS !== 'undefined' && FALLBACK_DETAILS[cleanSymbol]) {
                const data = FALLBACK_DETAILS[cleanSymbol];
                this._cache.details[cleanSymbol] = data;
                return data;
            }

            const stocks = await this.loadStocks();
            const baseStock = stocks.find(s => s.symbol.toUpperCase() === cleanSymbol);
            
            if (baseStock) {
                const syntheticDetails = this._createSyntheticDetails(baseStock);
                this._cache.details[cleanSymbol] = syntheticDetails;
                return syntheticDetails;
            }

            throw new Error(`Keine Daten für Symbol "${cleanSymbol}" verfügbar`);
        }
    },

    /**
     * Erstellt minimale Detaildaten aus dem Basis-Aktienobjekt
     */
    _createSyntheticDetails(stock) {
        return {
            symbol: stock.symbol,
            name: stock.name,
            sector: stock.sector || 'Unbekannt',
            industry: stock.industry || 'Unbekannt',
            description: `${stock.name} ist ein Unternehmen im Sektor ${stock.sector || 'N/A'}. Detaillierte Unternehmensinformationen sind derzeit nicht verfügbar.`,
            website: '#',
            employees: 0,
            financials: {
                revenue: [],
                earnings: [],
                freeCashFlow: [],
                operatingCashFlow: [],
                margins: {
                    gross: stock.profitMargin ? stock.profitMargin * 1.5 : 0,
                    operating: stock.operatingMargin || 0,
                    net: stock.profitMargin || 0
                },
                ratios: {
                    pe: stock.pe || 0,
                    fwdPe: stock.pe ? stock.pe * 0.9 : 0,
                    ps: stock.ps || 0,
                    pb: 0,
                    evEbitda: 0,
                    debtToEquity: stock.debtToEquity || 0,
                    currentRatio: stock.currentRatio || 0,
                    quickRatio: 0,
                    roe: stock.roe || 0,
                    roa: stock.roa || 0,
                    dividendYield: stock.dividendYield || 0,
                    payoutRatio: 0
                }
            },
            analystRatings: {
                consensus: 'Hold',
                targetMean: stock.price ? stock.price * 1.1 : 0,
                targetHigh: stock.price ? stock.price * 1.3 : 0,
                targetLow: stock.price ? stock.price * 0.9 : 0,
                numberOfAnalysts: 0,
                history: []
            },
            news: [],
            insiderTransactions: []
        };
    },

    /**
     * Sucht Aktien anhand eines Suchbegriffs
     * @param {string} query - Suchbegriff (Name oder Symbol)
     * @returns {Promise<Array>} Gefilterte Liste
     */
    async searchStocks(query) {
        const stocks = await this.loadStocks();
        if (!query || query.trim() === '') return stocks;
        
        const q = query.toLowerCase().trim();
        return stocks.filter(s => 
            s.name.toLowerCase().includes(q) || 
            s.symbol.toLowerCase().includes(q) ||
            (s.sector && s.sector.toLowerCase().includes(q))
        );
    },

    /**
     * Gibt eine Liste aller verfügbaren Sektoren zurück
     * @returns {Promise<Array<string>>}
     */
    async getSectors() {
        const stocks = await this.loadStocks();
        const sectors = new Set();
        stocks.forEach(s => {
            if (s.sector) sectors.add(s.sector);
        });
        return Array.from(sectors).sort();
    },

    /**
     * Cache leeren
     */
    clearCache() {
        this._cache.stocks = null;
        this._cache.details = {};
    }
};

// Global verfügbar machen
window.DataModule = DataModule;

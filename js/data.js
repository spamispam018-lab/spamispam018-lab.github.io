// js/data.js - Daten-Lade- und Verarbeitungslogik

const DataService = {
  stocks: [],
  detailsCache: {},

  /**
   * Lädt die Haupt-Aktiendaten. Versucht zuerst die JSON-Datei,
   * fällt bei Fehlern (z. B. 404 auf GitHub Pages) auf FALLBACK_STOCKS zurück.
   */
  async loadStocks() {
    try {
      // Relative Pfad-Absicherung für GitHub Pages
      const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
      const url = new URL('data/stocks.json', window.location.origin + basePath).href;

      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`HTTP-Fehler beim Laden der Marktdaten: ${response.status}`);
      }
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Empfangene Daten sind leer oder ungültig');
      }
      this.stocks = data;
      console.log(`Erfolgreich ${this.stocks.length} Titel geladen.`);
    } catch (err) {
      console.warn('Fehler beim Laden von stocks.json. Verwende Fallback-Daten:', err);
      if (typeof FALLBACK_STOCKS !== 'undefined' && Array.isArray(FALLBACK_STOCKS)) {
        this.stocks = FALLBACK_STOCKS;
      } else {
        this.stocks = [];
        console.error('Keine Fallback-Daten verfügbar (FALLBACK_STOCKS nicht definiert).');
      }
    }
    return this.stocks;
  },

  /**
   * Lädt Detaildaten für ein bestimmtes Symbol.
   */
  async loadStockDetails(ticker) {
    if (!ticker) return null;
    const cleanTicker = ticker.toUpperCase().trim();

    if (this.detailsCache[cleanTicker]) {
      return this.detailsCache[cleanTicker];
    }

    try {
      const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
      const url = new URL(`data/details/${cleanTicker}.json`, window.location.origin + basePath).href;

      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`Detaildaten für ${cleanTicker} nicht gefunden (${response.status})`);
      }
      const data = await response.json();
      this.detailsCache[cleanTicker] = data;
      return data;
    } catch (err) {
      console.warn(`Fehler beim Laden der Details für ${cleanTicker}. Prüfe Fallback...`, err);
      if (typeof FALLBACK_DETAILS !== 'undefined' && FALLBACK_DETAILS[cleanTicker]) {
        return FALLBACK_DETAILS[cleanTicker];
      }
      // Minimaler Fallback aus Basis-Aktienliste
      const baseStock = this.stocks.find(s => s.symbol === cleanTicker);
      return baseStock || null;
    }
  },

  getAllStocks() {
    return this.stocks;
  }
};

window.DataService = DataService;

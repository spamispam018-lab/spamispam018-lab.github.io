/**
 * Daten-Layer: Verwaltet das Laden, Cachen und Bereitstellen der Aktiendaten.
 * Unterstützt window.Data (für index.html) und window.App.DataService.
 */

window.App = window.App || {};

(function () {
  'use strict';

  var STORAGE_KEY = 'stockscreener_data_cache';
  var GITHUB_RAW_URL = 'https://raw.githubusercontent.com/spamispam018-lab/spamispam018-lab.github.io/main/data/stocks.json';
  var LOCAL_DATA_PATH = 'data/stocks.json';

  var DataService = {
    currentData: null,

    /**
     * Ermittelt statische Daten aus dem Fallback-Skript
     */
    getFallbackList: function () {
      if (window.STOCK_DATA && Array.isArray(window.STOCK_DATA.stocks)) {
        return window.STOCK_DATA.stocks;
      }
      if (window.FALLBACK_DATA && Array.isArray(window.FALLBACK_DATA.stocks)) {
        return window.FALLBACK_DATA.stocks;
      }
      if (Array.isArray(window.STOCK_DATA)) {
        return window.STOCK_DATA;
      }
      if (Array.isArray(window.FALLBACK_DATA)) {
        return window.FALLBACK_DATA;
      }
      return [];
    },

    /**
     * Hauptladefunktion
     * @param {boolean} forceRefresh
     * @returns {Promise<Array>}
     */
    fetchStocks: function (forceRefresh) {
      var self = this;

      return new Promise(function (resolve) {
        // 1. Aus localStorage lesen (sofern nicht forceRefresh)
        if (!forceRefresh) {
          try {
            var cached = localStorage.getItem(STORAGE_KEY);
            if (cached) {
              var parsed = JSON.parse(cached);
              var cachedStocks = parsed.stocks || (Array.isArray(parsed) ? parsed : null);
              if (cachedStocks && cachedStocks.length > 0) {
                self.currentData = { stocks: cachedStocks };
                return resolve(cachedStocks);
              }
            }
          } catch (e) {
            console.warn('Cache-Lesefehler:', e);
          }
        }

        // 2. Netzwerk-Abruf: Erst lokaler Pfad (relativ), dann GitHub Raw
        var tryFetch = function (url) {
          return fetch(url + '?t=' + Date.now()).then(function (res) {
            if (!res.ok) throw new Error('Status ' + res.status);
            return res.json();
          });
        };

        tryFetch(LOCAL_DATA_PATH)
          .catch(function () {
            return tryFetch(GITHUB_RAW_URL);
          })
          .then(function (data) {
            var stocks = (data && data.stocks) ? data.stocks : (Array.isArray(data) ? data : []);
            if (stocks.length > 0) {
              self.currentData = { stocks: stocks, lastUpdated: (data && data.lastUpdated) || new Date().toISOString() };
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(self.currentData));
              } catch (e) {
                console.warn('Cache-Schreibfehler:', e);
              }
              resolve(stocks);
            } else {
              resolve(self.getSafeStocks());
            }
          })
          .catch(function (err) {
            console.warn('Netzwerkabruf fehlgeschlagen, nutze Fallback-Daten:', err.message);
            resolve(self.getSafeStocks());
          });
      });
    },

    /**
     * loadStocks für Kompatibilität mit bestehenden Ansichten
     */
    loadStocks: function (forceRefresh) {
      var self = this;
      return this.fetchStocks(forceRefresh).then(function (stocks) {
        return self.getSafeData();
      });
    },

    /**
     * Liefert garantiert eine Liste von Aktienobjekten
     */
    getSafeStocks: function () {
      if (this.currentData && Array.isArray(this.currentData.stocks) && this.currentData.stocks.length > 0) {
        return this.currentData.stocks;
      }
      var fallback = this.getFallbackList();
      if (fallback.length > 0) {
        this.currentData = { stocks: fallback };
        return fallback;
      }
      return [];
    },

    /**
     * Liefert das Gesamtobjekt inkl. Metadaten
     */
    getSafeData: function () {
      var stocks = this.getSafeStocks();
      return {
        lastUpdated: (this.currentData && this.currentData.lastUpdated) || new Date().toISOString(),
        currency: (this.currentData && this.currentData.currency) || 'EUR',
        stocks: stocks
      };
    },

    /**
     * Sucht eine Aktie anhand ihres Symbols / Tickers
     */
    getStockByTicker: function (ticker) {
      if (!ticker) return null;
      var clean = ticker.trim().toUpperCase();
      var list = this.getSafeStocks();
      for (var i = 0; i < list.length; i++) {
        var sym = (list[i].ticker || list[i].symbol || '').toUpperCase();
        if (sym === clean) {
          return list[i];
        }
      }
      return null;
    },

    /**
     * Eindeutige Sektoren
     */
    getSectors: function () {
      var list = this.getSafeStocks();
      var map = {};
      var sectors = [];
      list.forEach(function (s) {
        if (s.sector && !map[s.sector]) {
          map[s.sector] = true;
          sectors.push(s.sector);
        }
      });
      return sectors.sort();
    },

    /**
     * Eindeutige Länder
     */
    getCountries: function () {
      var list = this.getSafeStocks();
      var map = {};
      var countries = [];
      list.forEach(function (s) {
        if (s.country && !map[s.country]) {
          map[s.country] = true;
          countries.push(s.country);
        }
      });
      return countries.sort();
    }
  };

  // Bereitstellung für beide Zugriffsmuster
  window.Data = DataService;
  window.App.DataService = DataService;
})();

/**
 * Watchlist-Modul: Verwaltet persönliche Favoriten und persistiert
 * diese dauerhaft im localStorage des Endgeräts.
 */

window.App = window.App || {};

(function(App) {
  'use strict';

  var WATCHLIST_STORAGE_KEY = 'stockscreener_watchlist_tickers';

  var WatchlistService = {
    /**
     * Liest die Liste der gespeicherten Ticker aus dem localStorage
     * @returns {string[]}
     */
    getTickers: function() {
      try {
        var raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      } catch (err) {
        console.warn('Fehler beim Lesen der Watchlist:', err);
      }
      return [];
    },

    /**
     * Prüft, ob ein Ticker auf der Watchlist steht
     * @param {string} ticker
     * @returns {boolean}
     */
    isWatchlisted: function(ticker) {
      if (!ticker) return false;
      var list = this.getTickers();
      return list.indexOf(ticker) !== -1;
    },

    /**
     * Fügt einen Ticker zur Watchlist hinzu oder entfernt ihn (Toggle)
     * @param {string} ticker
     * @returns {boolean} Neuer Status: true wenn nun beobachtet, sonst false
     */
    toggle: function(ticker) {
      if (!ticker) return false;
      var list = this.getTickers();
      var index = list.indexOf(ticker);
      var added = false;

      if (index === -1) {
        list.push(ticker);
        added = true;
      } else {
        list.splice(index, 1);
        added = false;
      }

      this._save(list);
      return added;
    },

    /**
     * Entfernt einen Ticker gezielt aus der Watchlist
     * @param {string} ticker
     */
    remove: function(ticker) {
      if (!ticker) return;
      var list = this.getTickers();
      var nextList = list.filter(function(item) {
        return item !== ticker;
      });
      this._save(nextList);
    },

    /**
     * Lädt vollständige Aktien-Objekte aller Watchlist-Einträge
     * @returns {Array<Object>}
     */
    getWatchlistStocks: function() {
      var tickers = this.getTickers();
      var stocks = [];
      if (!App.DataService) return stocks;

      for (var i = 0; i < tickers.length; i++) {
        var stock = App.DataService.getStockByTicker(tickers[i]);
        if (stock) {
          stocks.push(stock);
        }
      }
      return stocks;
    },

    /**
     * Interne Methode zum Abspeichern des Arrays
     * @private
     */
    _save: function(tickersArray) {
      try {
        localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(tickersArray));
      } catch (err) {
        console.error('Konnte Watchlist nicht im localStorage speichern:', err);
      }
    }
  };

  App.WatchlistService = WatchlistService;
})(window.App);

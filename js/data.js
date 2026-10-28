/**
 * js/data.js
 * Daten-Provider & Caching-Schicht.
 * Lädt Daten prioritär von GitHub Raw, cacht im localStorage
 * und fällt bei file://-Offline-Betrieb auf window.UNIVERSE_DATA und window.STOCK_DATA zurück.
 */

window.App = window.App || {};

window.App.Data = (function () {
  'use strict';

  var STORAGE_KEYS = {
    UNIVERSE: 'app_data_universe',
    STOCK_PREFIX: 'app_data_stock_',
    WATCHLIST: 'app_watchlist',
    SETTINGS: 'app_settings',
    LAST_TICKER: 'app_last_ticker'
  };

  // Konfiguration: Eigener GitHub-Benutzer & Repo für Raw-Abfragen
  var DEFAULT_CONFIG = {
    githubUser: 'spamispam018-lab',
    githubRepo: 'spamispam018-lab.github.io'
    githubBranch: 'main'
  };

  /**
   * Lädt Konfiguration aus localStorage oder Standardwerte.
   */
  function getConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (raw) {
        var parsed = JSON.parse(raw);
        return Object.assign({}, DEFAULT_CONFIG, parsed);
      }
    } catch (e) {}
    return DEFAULT_CONFIG;
  }

  /**
   * Speichert geänderte Konfiguration.
   */
  function saveConfig(cfg) {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(cfg));
    } catch (e) {}
  }

  /**
   * Erzeugt die Raw-GitHub-URL für Datenabrufe.
   */
  function getRawUrl(fileName) {
    var cfg = getConfig();
    return 'https://raw.githubusercontent.com/' + cfg.githubUser + '/' + cfg.githubRepo + '/' + cfg.githubBranch + '/data/' + fileName;
  }

  /**
   * Lädt das Screener-Universum.
   * Ablauf: 1. Remote GitHub Fetch -> 2. localStorage Cache -> 3. window.UNIVERSE_DATA
   */
  function getUniverse() {
    var url = getRawUrl('universe.json');

    return fetch(url, { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Netzwerk-Fehler beim Laden von universe.json');
        }
        return response.json();
      })
      .then(function (data) {
        if (Array.isArray(data) && data.length > 0) {
          try {
            localStorage.setItem(STORAGE_KEYS.UNIVERSE, JSON.stringify(data));
          } catch (e) {}
          return data;
        }
        throw new Error('Ungültiges Datenformat');
      })
      .catch(function () {
        // Fallback 1: Aus localStorage laden
        try {
          var cached = localStorage.getItem(STORAGE_KEYS.UNIVERSE);
          if (cached) {
            var parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              return parsed;
            }
          }
        } catch (e) {}

        // Fallback 2: data/fallback.js nutzen
        if (window.UNIVERSE_DATA && Array.isArray(window.UNIVERSE_DATA)) {
          return window.UNIVERSE_DATA;
        }

        return [];
      });
  }

  /**
   * Lädt Detaildaten für einen einzelnen Ticker.
   */
  function getStock(ticker) {
    if (!ticker) {
      return Promise.reject(new Error('Kein Ticker angegeben'));
    }

    var cleanTicker = ticker.toUpperCase().trim();
    var storageKey = STORAGE_KEYS.STOCK_PREFIX + cleanTicker;
    var url = getRawUrl(cleanTicker + '.json');

    return fetch(url, { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Aktie ' + cleanTicker + ' nicht auf Remote gefunden');
        }
        return response.json();
      })
      .then(function (data) {
        if (data && data.ticker) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(data));
          } catch (e) {}
          return data;
        }
        throw new Error('Ungültige Aktiendaten erhalten');
      })
      .catch(function () {
        // Fallback 1: localStorage Cache
        try {
          var cached = localStorage.getItem(storageKey);
          if (cached) {
            var parsed = JSON.parse(cached);
            if (parsed && parsed.ticker) {
              return parsed;
            }
          }
        } catch (e) {}

        // Fallback 2: window.STOCK_DATA aus fallback.js
        if (window.STOCK_DATA && window.STOCK_DATA[cleanTicker]) {
          return window.STOCK_DATA[cleanTicker];
        }

        throw new Error('Keine Offline- oder Cachedaten für ' + cleanTicker + ' vorhanden.');
      });
  }

  /**
   * Watchlist-Funktionen.
   */
  function getWatchlist() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.WATCHLIST);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {}
    return ['AAPL', 'NVDA', 'SAP.DE'];
  }

  function isWatchlisted(ticker) {
    if (!ticker) return false;
    var list = getWatchlist();
    return list.indexOf(ticker.toUpperCase().trim()) !== -1;
  }

  function toggleWatchlist(ticker) {
    if (!ticker) return false;
    var cleanTicker = ticker.toUpperCase().trim();
    var list = getWatchlist();
    var idx = list.indexOf(cleanTicker);
    var added = false;

    if (idx !== -1) {
      list.splice(idx, 1);
    } else {
      list.push(cleanTicker);
      added = true;
    }

    try {
      localStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(list));
    } catch (e) {}

    return added;
  }

  /**
   * Zuletzt geöffneten Ticker merken.
   */
  function setLastTicker(ticker) {
    if (!ticker) return;
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_TICKER, ticker.toUpperCase().trim());
    } catch (e) {}
  }

  function getLastTicker() {
    try {
      return localStorage.getItem(STORAGE_KEYS.LAST_TICKER) || 'AAPL';
    } catch (e) {}
    return 'AAPL';
  }

  return {
    getUniverse: getUniverse,
    getStock: getStock,
    getWatchlist: getWatchlist,
    isWatchlisted: isWatchlisted,
    toggleWatchlist: toggleWatchlist,
    getLastTicker: getLastTicker,
    setLastTicker: setLastTicker,
    getConfig: getConfig,
    saveConfig: saveConfig
  };
})();

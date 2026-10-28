/**
 * js/data.js
 * Robuste Daten-Provider & Caching-Schicht:
 * 1. Prüft relativen Pfad (./data/...)
 * 2. Fallback auf GitHub Raw (überbrückt Pages-Deployment-Verzögerungen)
 * 3. Fallback auf localStorage Cache
 * 4. Fallback auf window.STOCK_DATA
 */

window.App = window.App || {};

window.App.Data = (function () {
  'use strict';

  var GITHUB_USER = 'spamispam018-lab';
  var GITHUB_REPO = 'spamispam018-lab.github.io';
  var GITHUB_BRANCH = 'main';

  var STORAGE_KEYS = {
    UNIVERSE: 'app_data_universe',
    STOCK_PREFIX: 'app_data_stock_',
    WATCHLIST: 'app_watchlist',
    LAST_TICKER: 'app_last_ticker'
  };

  function getLocalUrl(fileName) {
    return './data/' + fileName + '?v=' + Date.now();
  }

  function getRawUrl(fileName) {
    return 'https://raw.githubusercontent.com/' + GITHUB_USER + '/' + GITHUB_REPO + '/' + GITHUB_BRANCH + '/data/' + fileName + '?v=' + Date.now();
  }

  /**
   * Lädt eine Datei erst per relativem Pfad, bei Fehler direkt von GitHub Raw.
   */
  function fetchWithFallback(fileName) {
    return fetch(getLocalUrl(fileName))
      .then(function (res) {
        if (res.ok) return res.json();
        throw new Error('Local 404');
      })
      .catch(function () {
        // Fallback direkt auf GitHub Raw
        return fetch(getRawUrl(fileName)).then(function (rawRes) {
          if (!rawRes.ok) {
            throw new Error('HTTP ' + rawRes.status);
          }
          return rawRes.json();
        });
      });
  }

  function getUniverse() {
    return fetchWithFallback('universe.json')
      .then(function (data) {
        if (Array.isArray(data) && data.length > 0) {
          try {
            localStorage.setItem(STORAGE_KEYS.UNIVERSE, JSON.stringify(data));
          } catch (e) {}
          return data;
        }
        throw new Error('Ungültiges Universum-Format');
      })
      .catch(function (err) {
        try {
          var cached = localStorage.getItem(STORAGE_KEYS.UNIVERSE);
          if (cached) {
            var parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          }
        } catch (e) {}

        if (window.UNIVERSE_DATA && Array.isArray(window.UNIVERSE_DATA)) {
          return window.UNIVERSE_DATA;
        }
        return [];
      });
  }

  function getStock(ticker) {
    if (!ticker) {
      return Promise.reject(new Error('Kein Ticker angegeben'));
    }

    var cleanTicker = ticker.toUpperCase().trim();
    var storageKey = STORAGE_KEYS.STOCK_PREFIX + cleanTicker;

    return fetchWithFallback(cleanTicker + '.json')
      .then(function (data) {
        if (data && (data.ticker || data.profile)) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(data));
          } catch (e) {}
          return data;
        }
        throw new Error('Ungültige Aktiendaten');
      })
      .catch(function (err) {
        // Fallback 1: localStorage
        try {
          var cached = localStorage.getItem(storageKey);
          if (cached) {
            var parsed = JSON.parse(cached);
            if (parsed && (parsed.ticker || parsed.profile)) return parsed;
          }
        } catch (e) {}

        // Fallback 2: data/fallback.js
        if (window.STOCK_DATA && window.STOCK_DATA[cleanTicker]) {
          return window.STOCK_DATA[cleanTicker];
        }

        throw new Error('Keine Offline- oder Onlinedaten für "' + cleanTicker + '" verfügbar.');
      });
  }

  function getWatchlist() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.WATCHLIST);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return ['AAPL', 'NVDA', 'SAP.DE'];
  }

  function isWatchlisted(ticker) {
    if (!ticker) return false;
    return getWatchlist().indexOf(ticker.toUpperCase().trim()) !== -1;
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
    setLastTicker: setLastTicker
  };
})();

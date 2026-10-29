/**
 * js/data.js
 * Robuste Daten-Provider & Caching-Schicht:
 * Lädt primär über den absoluten Pfad /data/<TICKER>.json.
 * Fällt bei Verzögerungen des GitHub-Pages-Deployments sofort auf GitHub-Raw zurück.
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

  /**
   * Lädt eine JSON-Datei mit Fallback-Kette:
   * 1. Direkter Webserver-Pfad /data/...
   * 2. GitHub Raw (falls Pages noch deployt)
   */
  function fetchJsonWithFallback(fileName) {
    var bust = '?v=' + Date.now();
    var primaryUrl = '/data/' + fileName + bust;
    var rawUrl = 'https://raw.githubusercontent.com/' + GITHUB_USER + '/' + GITHUB_REPO + '/' + GITHUB_BRANCH + '/data/' + fileName + bust;

    return fetch(primaryUrl)
      .then(function (res) {
        if (res.ok) return res.json();
        throw new Error('Primary 404');
      })
      .catch(function () {
        // Fallback direkt auf GitHub Raw
        return fetch(rawUrl).then(function (rawRes) {
          if (!rawRes.ok) {
            throw new Error('HTTP ' + rawRes.status);
          }
          return rawRes.json();
        });
      });
  }

  function getUniverse() {
    return fetchJsonWithFallback('universe.json')
      .then(function (data) {
        if (Array.isArray(data) && data.length > 0) {
          try {
            localStorage.setItem(STORAGE_KEYS.UNIVERSE, JSON.stringify(data));
          } catch (e) {}
          return data;
        }
        throw new Error('Ungültiges Format für Universum');
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

    return fetchJsonWithFallback(cleanTicker + '.json')
      .then(function (data) {
        if (data && (data.ticker || data.profile)) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(data));
          } catch (e) {}
          return data;
        }
        throw new Error('Ungültige Daten für ' + cleanTicker);
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

        // Fallback 2: fallback.js
        if (window.STOCK_DATA && window.STOCK_DATA[cleanTicker]) {
          return window.STOCK_DATA[cleanTicker];
        }

        throw new Error('Keine Daten für "' + cleanTicker + '" verfügbar (' + err.message + ').');
      });
  }

  var longCache = {};

  /**
   * Lädt die wöchentliche 10-Jahres-Historie (data/long/<TICKER>.json).
   * Liefert [{date, close}, ...] oder [] wenn (noch) nicht vorhanden.
   */
  function getLongHistory(ticker) {
    if (!ticker) return Promise.resolve([]);
    var clean = ticker.toUpperCase().trim();
    if (longCache[clean]) return Promise.resolve(longCache[clean]);
    return fetchJsonWithFallback('long/' + clean + '.json')
      .then(function (data) {
        var pts = (data && Array.isArray(data.points)) ? data.points : [];
        var out = pts.map(function (p) { return { date: p[0], close: p[1] }; });
        longCache[clean] = out;
        return out;
      })
      .catch(function () { return []; });
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
    getLongHistory: getLongHistory,
    getWatchlist: getWatchlist,
    isWatchlisted: isWatchlisted,
    toggleWatchlist: toggleWatchlist,
    getLastTicker: getLastTicker,
    setLastTicker: setLastTicker
  };
})();

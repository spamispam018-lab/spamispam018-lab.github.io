/**
 * js/data.js
 * Robuste Daten-Provider & Caching-Schicht.
 * NEU: Watchlist-Gruppen (getGroups / setGroups / getGroupForTicker).
 */

window.App = window.App || {};

window.App.Data = (function () {
  'use strict';

  var GITHUB_USER = 'spamispam018-lab';
  var GITHUB_REPO = 'spamispam018-lab.github.io';
  var GITHUB_BRANCH = 'main';
  var SESSION_VERSION = String(Date.now());

  var STORAGE_KEYS = {
    UNIVERSE: 'app_data_universe',
    STOCK_PREFIX: 'app_data_stock_',
    WATCHLIST: 'app_watchlist',
    LAST_TICKER: 'app_last_ticker',
    GROUPS: 'app_watchlist_groups_v1'
  };

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (k.indexOf(STORAGE_KEYS.STOCK_PREFIX) === 0) localStorage.removeItem(k);
        });
        localStorage.setItem(key, value);
        return true;
      } catch (e2) {
        console.warn('Speichern im localStorage fehlgeschlagen:', key, e2);
        return false;
      }
    }
  }

  /** opts.fresh: jedes Mal neu vom Server statt Sitzungs-Cache (z. B. KI-Datei, Statusseite). */
  function fetchJsonWithFallback(fileName, opts) {
    var fresh = !!(opts && opts.fresh);
    var bust = fresh ? '?t=' + Date.now() : '?v=' + SESSION_VERSION;
    var primaryUrl = '/data/' + fileName + bust;
    var rawUrl = 'https://raw.githubusercontent.com/' + GITHUB_USER + '/' + GITHUB_REPO + '/' + GITHUB_BRANCH + '/data/' + fileName + bust;

    return fetch(primaryUrl, fresh ? { cache: 'no-store' } : undefined)
      .then(function (res) {
        if (res.ok) return res.json();
        throw new Error('Primary 404');
      })
      .catch(function () {
        return fetch(rawUrl).then(function (rawRes) {
          if (!rawRes.ok) throw new Error('HTTP ' + rawRes.status);
          return rawRes.json();
        });
      });
  }

  // Gespeicherte Live-Kurse (js/live-prices.js) über die Daten legen
  function withLiveUniverse(list) {
    try { if (window.App.Live) window.App.Live.applyUniverse(list); } catch (e) {}
    return list;
  }

  function withLiveStock(stock) {
    try { if (window.App.Live) window.App.Live.applyStock(stock); } catch (e) {}
    return stock;
  }

  function getUniverse() {
    return fetchJsonWithFallback('universe.json')
      .then(function (data) {
        // Einträge ohne Ticker (alter Pipeline-Fehler) ignorieren, sie bringen sonst Suche und Listen zum Absturz
        if (Array.isArray(data)) data = data.filter(function (u) { return u && u.ticker; });
        if (Array.isArray(data) && data.length > 0) {
          try { safeSet(STORAGE_KEYS.UNIVERSE, JSON.stringify(data)); } catch (e) {}
          return withLiveUniverse(data);
        }
        throw new Error('Ungültiges Format für Universum');
      })
      .catch(function () {
        try {
          var cached = localStorage.getItem(STORAGE_KEYS.UNIVERSE);
          if (cached) {
            var parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) return withLiveUniverse(parsed);
          }
        } catch (e) {}
        if (window.UNIVERSE_DATA && Array.isArray(window.UNIVERSE_DATA)) return withLiveUniverse(window.UNIVERSE_DATA);
        return [];
      });
  }

  function getStock(ticker) {
    if (!ticker) return Promise.reject(new Error('Kein Ticker angegeben'));
    var cleanTicker = ticker.toUpperCase().trim();
    var storageKey = STORAGE_KEYS.STOCK_PREFIX + cleanTicker;

    return fetchJsonWithFallback(cleanTicker + '.json')
      .then(function (data) {
        if (data && (data.ticker || data.profile)) {
          try { safeSet(storageKey, JSON.stringify(data)); } catch (e) {}
          return withLiveStock(data);
        }
        throw new Error('Ungültige Daten für ' + cleanTicker);
      })
      .catch(function (err) {
        try {
          var cached = localStorage.getItem(storageKey);
          if (cached) {
            var parsed = JSON.parse(cached);
            if (parsed && (parsed.ticker || parsed.profile)) return withLiveStock(parsed);
          }
        } catch (e) {}
        if (window.STOCK_DATA && window.STOCK_DATA[cleanTicker]) return withLiveStock(window.STOCK_DATA[cleanTicker]);
        throw new Error('Keine Daten für "' + cleanTicker + '" verfügbar (' + err.message + ').');
      });
  }

  var longCache = {};

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
      // aus allen Gruppen entfernen
      try {
        var groups = getGroups();
        groups.forEach(function (g) {
          g.tickers = g.tickers.filter(function (t) { return t !== cleanTicker; });
        });
        setGroups(groups);
      } catch (e) {}
    } else {
      list.push(cleanTicker);
      added = true;
    }

    try { safeSet(STORAGE_KEYS.WATCHLIST, JSON.stringify(list)); } catch (e) {}
    return added;
  }

  function setLastTicker(ticker) {
    if (!ticker) return;
    try { safeSet(STORAGE_KEYS.LAST_TICKER, ticker.toUpperCase().trim()); } catch (e) {}
  }

  function getLastTicker() {
    try { return localStorage.getItem(STORAGE_KEYS.LAST_TICKER) || 'AAPL'; } catch (e) {}
    return 'AAPL';
  }

  // ---- NEU: Watchlist-Gruppen ----
  function getGroups() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.GROUPS);
      if (raw) {
        var g = JSON.parse(raw);
        if (Array.isArray(g)) return g;
      }
    } catch (e) {}
    return [];
  }

  function setGroups(groups) {
    try { safeSet(STORAGE_KEYS.GROUPS, JSON.stringify(groups || [])); } catch (e) {}
  }

  function addGroup(name) {
    if (!name) return false;
    var groups = getGroups();
    if (groups.some(function (g) { return g.name === name; })) return false;
    groups.push({ name: name, tickers: [] });
    setGroups(groups);
    return true;
  }

  function removeGroup(name) {
    setGroups(getGroups().filter(function (g) { return g.name !== name; }));
  }

  function getGroupForTicker(ticker) {
    if (!ticker) return null;
    var t = ticker.toUpperCase().trim();
    var groups = getGroups();
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].tickers.indexOf(t) !== -1) return groups[i].name;
    }
    return null;
  }

  function assignTickerToGroup(ticker, groupName) {
    if (!ticker) return;
    var t = ticker.toUpperCase().trim();
    var groups = getGroups();
    // Aus allen Gruppen entfernen
    groups.forEach(function (g) {
      g.tickers = g.tickers.filter(function (x) { return x !== t; });
    });
    if (groupName) {
      var found = false;
      groups.forEach(function (g) {
        if (g.name === groupName) { g.tickers.push(t); found = true; }
      });
      if (!found) {
        groups.push({ name: groupName, tickers: [t] });
      }
    }
    setGroups(groups);
  }

  // ---- Mehrfach-Zuordnung & Verwaltung ----
  /** Alle Gruppen, in denen der Ticker steckt (eine Aktie kann in mehreren Gruppen sein). */
  function getGroupsForTicker(ticker) {
    if (!ticker) return [];
    var t = ticker.toUpperCase().trim();
    return getGroups().filter(function (g) { return g.tickers.indexOf(t) !== -1; }).map(function (g) { return g.name; });
  }

  /** Setzt die Gruppen eines Tickers auf genau die übergebenen Namen. */
  function setTickerGroups(ticker, names) {
    if (!ticker) return;
    var t = ticker.toUpperCase().trim();
    var wanted = (names || []).filter(Boolean);
    var groups = getGroups();
    groups.forEach(function (g) {
      var has = g.tickers.indexOf(t) !== -1;
      var want = wanted.indexOf(g.name) !== -1;
      if (want && !has) g.tickers.push(t);
      if (!want && has) g.tickers = g.tickers.filter(function (x) { return x !== t; });
    });
    wanted.forEach(function (n) {
      if (!groups.some(function (g) { return g.name === n; })) groups.push({ name: n, tickers: [t] });
    });
    setGroups(groups);
  }

  /** Benennt eine Gruppe um. false, wenn der neue Name leer ist oder schon existiert. */
  function renameGroup(oldName, newName) {
    newName = (newName || '').trim();
    if (!newName) return false;
    if (newName === oldName) return true;
    var groups = getGroups();
    if (groups.some(function (g) { return g.name === newName; })) return false;
    groups.forEach(function (g) { if (g.name === oldName) g.name = newName; });
    setGroups(groups);
    return true;
  }

  return {
    getGroupsForTicker: getGroupsForTicker,
    setTickerGroups: setTickerGroups,
    renameGroup: renameGroup,
    getUniverse: getUniverse,
    getJsonFile: fetchJsonWithFallback,
    getStock: getStock,
    getLongHistory: getLongHistory,
    getWatchlist: getWatchlist,
    isWatchlisted: isWatchlisted,
    toggleWatchlist: toggleWatchlist,
    getLastTicker: getLastTicker,
    setLastTicker: setLastTicker,
    getGroups: getGroups,
    setGroups: setGroups,
    addGroup: addGroup,
    removeGroup: removeGroup,
    getGroupForTicker: getGroupForTicker,
    assignTickerToGroup: assignTickerToGroup
  };
})();
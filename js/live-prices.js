/**
 * js/live-prices.js
 * Gemeinsame Live-Kurs-Logik + dauerhafter Kurs-Speicher (localStorage).
 *
 * Funktion 1 (fetchLive):      wie Button "Live-Kurs abrufen" (Detail) – letzter Kurs + Tagesänderung, in EUR.
 * Funktion 2 (fetchUsSession): wie Button "Jetzt aktualisieren" (US-Vorbörse-Karte) – letzter US-Kurs
 *                              inkl. Vor-/Nachbörse in EUR (nur US-Ticker).
 * refreshAll(): ruft beide für alle Ticker ab (Markt-Button) und speichert das Ergebnis.
 *
 * Gespeicherte Kurse werden von Data.getUniverse() / Data.getStock() automatisch über die
 * GitHub-Daten gelegt, solange sie neuer sind als der Datenstand (updatedAt) der Datei.
 * Damit nutzen Screener, Suche, Watchlist, Vergleich, Markt und Detail dieselben Kurse.
 */
window.App = window.App || {};

window.App.Live = (function () {
  'use strict';

  var PROXY_URL = 'https://yahoo-proxy.spamispam018.workers.dev';
  var KEY = 'app_live_prices_v1';
  var META_KEY = 'app_live_meta_v1';
  var FX_TTL = 10 * 60 * 1000;

  var store = null;          // { TICKER: entry }
  var fxCache = {};          // { 'USD': { rate, t } }
  var progress = { running: false, done: 0, total: 0, ok: 0, fail: 0, cancelled: false };
  var listener = null;
  var cancelFlag = false;

  // ---------------------------------------------------------------- Speicher
  function load() {
    if (store) return store;
    store = {};
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object') store = p;
      }
    } catch (e) {}
    return store;
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
      return true;
    } catch (e) {
      console.warn('Kurs-Speicher voll:', e);
      return false;
    }
  }

  function getEntry(ticker) {
    if (!ticker) return null;
    return load()[String(ticker).toUpperCase().trim()] || null;
  }

  function setEntry(ticker, entry, noPersist) {
    load()[String(ticker).toUpperCase().trim()] = entry;
    if (!noPersist) persist();
  }

  function getMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || null; } catch (e) { return null; }
  }

  function setMeta(m) {
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  }

  function clearAll() {
    store = {};
    try { localStorage.removeItem(KEY); localStorage.removeItem(META_KEY); } catch (e) {}
  }

  // ---------------------------------------------------------------- Helfer
  function isNum(v) { return v !== null && v !== undefined && v !== '' && isFinite(Number(v)); }

  function isUsTicker(t) {
    return !!t && !/\.(DE|PA|AS|L|SW|MI|MC|T|TO|AX|CO)$/i.test(t);
  }

  function classifySession(ms) {
    var s = new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
    var m = s.match(/(\d+):(\d+)/);
    if (!m) return 'closed';
    var h = parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
    if (h >= 4 && h < 9.5) return 'pre';
    if (h >= 9.5 && h < 16) return 'regular';
    if (h >= 16 && h < 20) return 'post';
    return 'closed';
  }

  function proxyJson(query) {
    return fetch(PROXY_URL + '/?' + query + '&t=' + Date.now()).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /** Liefert Divisor: Kurs in Fremdwährung / Divisor = Kurs in EUR. */
  function getFxDivisor(currency) {
    if (!currency || currency === 'EUR') return Promise.resolve(1);
    var pence = (currency === 'GBp' || currency === 'GBX');
    var cur = pence ? 'GBP' : currency;
    var hit = fxCache[cur];
    if (hit && Date.now() - hit.t < FX_TTL) {
      return Promise.resolve(pence ? hit.rate * 100 : hit.rate);
    }
    var p = proxyJson('ticker=' + encodeURIComponent('EUR' + cur + '=X')).then(function (d) {
      var rate = d.chart.result[0].meta.regularMarketPrice;
      if (!(rate > 0)) throw new Error('Kein Wechselkurs für ' + cur);
      fxCache[cur] = { rate: rate, t: Date.now() };
      return rate;
    });
    return p.then(function (rate) { return pence ? rate * 100 : rate; });
  }

  // ---------------------------------------------------------------- Funktion 1: Live-Kurs
  function fetchLive(ticker) {
    return proxyJson('ticker=' + encodeURIComponent(ticker)).then(function (data) {
      if (!data.chart || !data.chart.result || !data.chart.result.length) {
        throw new Error('Yahoo lieferte keine Daten für ' + ticker);
      }
      var result = data.chart.result[0];
      var meta = result.meta || {};
      var price = null;
      try {
        var closes = result.indicators.quote[0].close || [];
        for (var i = closes.length - 1; i >= 0; i--) {
          if (closes[i] !== null && closes[i] !== undefined) { price = closes[i]; break; }
        }
      } catch (e) {}
      if (!price) price = meta.regularMarketPrice;
      if (!price) throw new Error('Kein Kurs gefunden für ' + ticker);
      var prev = meta.chartPreviousClose || meta.previousClose || price;
      var pct = ((price - prev) / prev) * 100;
      return getFxDivisor(meta.currency).then(function (div) {
        return { price: price / div, pct: pct };
      });
    });
  }

  // ---------------------------------------------------------------- Funktion 2: US-Handel inkl. Vor-/Nachbörse
  function fetchUsSession(ticker) {
    return proxyJson('ticker=' + encodeURIComponent(ticker) + '&interval=1m&range=1d&includePrePost=true')
      .then(function (data) {
        var result = data.chart.result[0];
        var ts = result.timestamp || [];
        var closes = (result.indicators.quote[0].close) || [];
        var last = null;
        for (var i = ts.length - 1; i >= 0; i--) {
          if (closes[i] !== null && closes[i] !== undefined) { last = { t: ts[i] * 1000, raw: closes[i] }; break; }
        }
        if (!last) return null;
        var meta = result.meta || {};
        var prev = meta.chartPreviousClose || meta.previousClose || last.raw;
        return getFxDivisor(meta.currency).then(function (div) {
          return {
            price: last.raw / div,
            pct: ((last.raw - prev) / prev) * 100,
            t: last.t,
            session: classifySession(last.t)
          };
        });
      });
  }

  // ---------------------------------------------------------------- Deutscher Kurs für US-Aktien
  // Yahoo führt viele US-Aktien an deutschen Börsen unter <US-Ticker>.<Suffix>.
  // Es werden mehrere Handelsplätze parallel abgefragt, der mit dem neuesten Kurs gewinnt.
  var DE_KEY = 'app_de_map_v1';
  var DE_VENUES = [
    { sfx: '.DE', name: 'Xetra' },
    { sfx: '.F',  name: 'Frankfurt' },
    { sfx: '.SG', name: 'Stuttgart' },
    { sfx: '.BE', name: 'Berlin' }
  ];
  var DE_OK_TTL = 7 * 24 * 3600 * 1000;
  var DE_NONE_TTL = 24 * 3600 * 1000;

  function loadDeMap() {
    try { return JSON.parse(localStorage.getItem(DE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveDeMap(m) {
    try { localStorage.setItem(DE_KEY, JSON.stringify(m)); } catch (e) {}
  }

  function parseGermanChart(data, venue) {
    var result = data.chart.result[0];
    var meta = result.meta || {};
    if (meta.currency && meta.currency !== 'EUR') return null;
    var ts = result.timestamp || [];
    var closes = (result.indicators.quote[0].close) || [];
    var price = null, t = null;
    for (var i = ts.length - 1; i >= 0; i--) {
      if (closes[i] !== null && closes[i] !== undefined) { price = closes[i]; t = ts[i] * 1000; break; }
    }
    if (price === null && meta.regularMarketPrice) {
      price = meta.regularMarketPrice;
      t = (meta.regularMarketTime || 0) * 1000;
    }
    if (!(price > 0)) return null;
    var prev = meta.chartPreviousClose || meta.previousClose || price;
    return {
      price: price, t: t, venue: venue.name, symbol: meta.symbol || '',
      pct: ((price - prev) / prev) * 100
    };
  }

  /**
   * Letzter deutscher Kurs (EUR) einer US-Aktie oder null, wenn kein Handelsplatz gefunden wird.
   * refEur (optional): US-Kurs in EUR zur Plausibilitätsprüfung (Abweichung > 25 % = anderes Papier).
   */
  function fetchGermanQuote(ticker, refEur) {
    var sym = String(ticker || '').toUpperCase().trim();
    if (!sym || !isUsTicker(sym)) return Promise.resolve(null);

    var map = loadDeMap();
    var c = map[sym];
    var venues = DE_VENUES;
    if (c && Array.isArray(c.sfx)) {
      if (c.sfx.length === 0 && Date.now() - c.t < DE_NONE_TTL) return Promise.resolve(null);
      if (c.sfx.length > 0 && Date.now() - c.t < DE_OK_TTL) {
        venues = DE_VENUES.filter(function (v) { return c.sfx.indexOf(v.sfx) !== -1; });
      }
    }

    return Promise.all(venues.map(function (v) {
      return proxyJson('ticker=' + encodeURIComponent(sym + v.sfx) + '&interval=1m&range=1d')
        .then(function (d) { return parseGermanChart(d, v); })
        .catch(function () { return null; });
    })).then(function (list) {
      var valid = list.filter(function (q) {
        if (!q) return false;
        if (refEur > 0 && Math.abs(q.price / refEur - 1) > 0.25) return false;
        return true;
      });
      map[sym] = { sfx: DE_VENUES.filter(function (v, i) {
        return valid.some(function (q) { return q.venue === v.name; });
      }).map(function (v) { return v.sfx; }), t: Date.now() };
      saveDeMap(map);
      if (!valid.length) return null;
      var best = valid[0];
      valid.forEach(function (q) { if (q.t > best.t) best = q; });   // Gleichstand: Reihenfolge Xetra > Frankfurt > …
      return best;
    });
  }

  // ---------------------------------------------------------------- Einzelner Ticker (beide Funktionen)
  function refreshTicker(ticker, noPersist) {
    var sym = String(ticker).toUpperCase().trim();
    return fetchLive(sym).then(function (live) {
      var entry = {
        price: live.price,
        changePercent: live.pct,
        currency: 'EUR',
        ts: Date.now(),
        src: 'live',
        live: { price: live.price, pct: live.pct },
        ext: null
      };
      if (!isUsTicker(sym)) return entry;
      return fetchUsSession(sym).then(function (ext) {
        if (ext && ext.price > 0) {
          entry.ext = ext;
          entry.price = ext.price;
          entry.changePercent = ext.pct;
          entry.src = 'ext';
        }
        return entry;
      }).catch(function () { return entry; });   // Funktion 2 ist optional
    }).then(function (entry) {
      setEntry(sym, entry, noPersist);
      return entry;
    });
  }

  /** Vom Detail-Button "Live-Kurs abrufen" genutzt, um das Ergebnis zu speichern. */
  function storeLive(ticker, price, pct) {
    setEntry(ticker, {
      price: price, changePercent: pct, currency: 'EUR', ts: Date.now(),
      src: 'live', live: { price: price, pct: pct }, ext: null
    });
  }

  // ---------------------------------------------------------------- Alle Ticker
  function notify() { if (listener) { try { listener(progress); } catch (e) {} } }

  function refreshAll(tickers, opts) {
    opts = opts || {};
    if (progress.running) return Promise.resolve(progress);
    var list = [];
    var seen = {};
    (tickers || []).forEach(function (t) {
      var k = String(t || '').toUpperCase().trim();
      if (k && !seen[k]) { seen[k] = 1; list.push(k); }
    });

    var concurrency = opts.concurrency || 6;
    var idx = 0;
    cancelFlag = false;
    progress = { running: true, done: 0, total: list.length, ok: 0, fail: 0, cancelled: false };
    notify();
    load();

    function worker() {
      if (cancelFlag || idx >= list.length) return Promise.resolve();
      var sym = list[idx++];
      return refreshTicker(sym, true).then(function () {
        progress.ok++;
      }).catch(function () {
        progress.fail++;
      }).then(function () {
        progress.done++;
        if (progress.done % 20 === 0) persist();
        notify();
        return worker();
      });
    }

    var workers = [];
    for (var i = 0; i < concurrency; i++) workers.push(worker());

    return Promise.all(workers).then(function () {
      progress.running = false;
      progress.cancelled = cancelFlag;
      persist();
      if (progress.ok > 0) {
        setMeta({ ts: Date.now(), ok: progress.ok, fail: progress.fail, total: progress.total });
      }
      notify();
      return progress;
    });
  }

  function cancel() { cancelFlag = true; }
  function getProgress() { return progress; }
  function onProgress(fn) { listener = fn; }

  // ---------------------------------------------------------------- Kurse über Daten legen
  /** Universe-Eintrag: Kurs + davon abhängige Felder neu rechnen. */
  function applyItem(item) {
    if (!item || !item.ticker) return item;
    var e = getEntry(item.ticker);
    if (!e || !(Number(e.price) > 0)) return item;
    if (item.liveTs === e.ts) return item;
    if (item.updatedAt) {
      var base = new Date(item.updatedAt).getTime();
      if (isFinite(base) && e.ts <= base) return item;   // GitHub-Daten sind neuer
    }

    var p0 = Number(item.price);
    var p1 = Number(e.price);

    if (p0 > 0) {
      ['perf1w', 'perf1m', 'perf3m', 'perfYtd', 'perf52w'].forEach(function (k) {
        if (isNum(item[k])) {
          var baseP = p0 / (1 + Number(item[k]) / 100);
          if (baseP > 0) item[k] = (p1 / baseP - 1) * 100;
        }
      });
      if (isNum(item.upside)) {
        var target = p0 * (1 + Number(item.upside) / 100);
        item.upside = (target / p1 - 1) * 100;
      }
      if (isNum(item.rrCrv) && isNum(item.rrStopPct) && isNum(item.rrTgtPct)) {
        var stop = p0 * (1 - Number(item.rrStopPct) / 100);
        var tgt = p0 * (1 + Number(item.rrTgtPct) / 100);
        var risk = p1 - stop, reward = tgt - p1;
        if (risk > 0) {
          item.rrCrv = reward / risk;
          item.rrStopPct = (risk / p1) * 100;
          item.rrTgtPct = (reward / p1) * 100;
        } else {
          item.rrCrv = null; item.rrStopPct = null; item.rrTgtPct = null;
        }
      }
    }
    if (isNum(item.low52) && isNum(item.high52)) {
      var lo = Math.min(Number(item.low52), p1), hi = Math.max(Number(item.high52), p1);
      if (hi > lo) item.rangePos = ((p1 - lo) / (hi - lo)) * 100;
    }

    item.price = p1;
    item.changePercent = e.changePercent;
    item.currency = 'EUR';
    item.liveTs = e.ts;
    return item;
  }

  function applyUniverse(list) {
    if (!Array.isArray(list)) return list;
    load();
    list.forEach(applyItem);
    return list;
  }

  /** Detail-Datei (stock.json): Kurs, Tagesänderung, Stand und livePrice setzen. */
  function applyStock(stock) {
    if (!stock || !stock.ticker) return stock;
    var e = getEntry(stock.ticker);
    if (!e || !(Number(e.price) > 0)) return stock;
    if (stock.updatedAt) {
      var base = new Date(stock.updatedAt).getTime();
      if (isFinite(base) && e.ts <= base) return stock;
    }
    stock.quote = stock.quote || {};
    stock.quote.price = e.price;
    stock.quote.changePercent = e.changePercent;
    stock.quote.currency = 'EUR';
    stock.updatedAt = new Date(e.ts).toISOString();
    stock.livePrice = e.price;

    // Chart-Tab und Chart-Analyse rechnen aus chartHistory: aktuellen Kurs als letzten Punkt einsetzen
    if (Array.isArray(stock.chartHistory) && stock.chartHistory.length) {
      var day = new Date(e.ts).toISOString().slice(0, 10);
      var last = stock.chartHistory[stock.chartHistory.length - 1];
      if (last && last.date < day) {
        stock.chartHistory.push({ date: day, close: e.price, volume: null });
      } else if (last) {
        last.close = e.price;
      }
    }
    return stock;
  }

  return {
    refreshAll: refreshAll,
    refreshTicker: refreshTicker,
    fetchLive: fetchLive,
    fetchUsSession: fetchUsSession,
    fetchGermanQuote: fetchGermanQuote,
    storeLive: storeLive,
    cancel: cancel,
    getProgress: getProgress,
    onProgress: onProgress,
    getEntry: getEntry,
    getMeta: getMeta,
    clearAll: clearAll,
    applyItem: applyItem,
    applyUniverse: applyUniverse,
    applyStock: applyStock
  };
})();

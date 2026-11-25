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
  // Deutsche Börsen führen US-Aktien meist unter EIGENEN Kürzeln (Nvidia = NVD.DE, Apple = APC.DE),
  // nicht unter dem US-Ticker. Deshalb: Tabelle bekannter Kürzel + der US-Ticker als zweiter Versuch.
  // Falsche Treffer fängt die Plausibilitätsprüfung ab (Abweichung > 25 % vom US-Kurs).
  // Weitere Aktien einfach in DE_SYMBOLS ergänzen: US-Ticker → deutsches Kürzel (ohne Endung).
  var DE_SYMBOLS = {
    NVDA: 'NVD', AAPL: 'APC', MSFT: 'MSF', AMZN: 'AMZ', GOOGL: 'ABEA', GOOG: 'ABEC',
    META: 'FB2A', TSLA: 'TL0', INTC: 'INL', AMD: 'AMD', NFLX: 'NFC', ORCL: 'ORC',
    CSCO: 'CIS', QCOM: 'QCI', TXN: 'TII', MU: 'MTE', ADBE: 'ADB', CRM: 'FOO',
    AVGO: '1YD', IBM: 'IBM', UBER: 'UB1', PYPL: '2PP', DIS: 'WDP', KO: 'CCC3',
    V: '3V64', MA: 'M4I', JPM: 'CMC', BAC: 'NCB', MCD: 'MCD', NKE: 'NKE',
    PEP: 'PEP', WMT: 'WMT', JNJ: 'JNJ', PFE: 'PFE', PLTR: 'PTX'
  };
  var DE_KEY = 'app_de_map_v3';
  var DE_VENUES = [
    { sfx: '.DE', name: 'Xetra' },
    { sfx: '.F',  name: 'Frankfurt' },
    { sfx: '.SG', name: 'Stuttgart' },
    { sfx: '.BE', name: 'Berlin' }
  ];
  var DE_OK_TTL = 7 * 24 * 3600 * 1000;

  function loadDeMap() {
    try { return JSON.parse(localStorage.getItem(DE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveDeMap(m) {
    try { localStorage.setItem(DE_KEY, JSON.stringify(m)); } catch (e) {}
  }

  function parseGermanChart(data, venue, symbol) {
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
      price: price, t: t, venue: venue.name, symbol: meta.symbol || symbol,
      pct: ((price - prev) / prev) * 100
    };
  }

  // data/de_symbols.json (vom Workflow „Deutsche Ticker ermitteln" erzeugt): US-Ticker → Liste deutscher Yahoo-Symbole
  var deFilePromise = null;
  function loadDeFile() {
    if (deFilePromise) return deFilePromise;
    var day = new Date().toISOString().slice(0, 10);
    deFilePromise = fetch('data/de_symbols.json?d=' + day)
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { return (j && j.symbols) || {}; })
      .catch(function () { return {}; });
    return deFilePromise;
  }

  function venueOf(symbol) {
    for (var i = 0; i < DE_VENUES.length; i++) {
      var sfx = DE_VENUES[i].sfx;
      if (symbol.slice(-sfx.length) === sfx) return DE_VENUES[i];
    }
    var m = symbol.match(/\.(\w+)$/);
    return { sfx: m ? '.' + m[1] : '', name: m ? 'Börse ' + m[1] : 'Börse' };
  }

  function deCandidates(sym, fileSyms) {
    if (fileSyms && Array.isArray(fileSyms[sym]) && fileSyms[sym].length) {
      return fileSyms[sym].slice(0, 5).map(function (s) { return { symbol: s, venue: venueOf(s) }; });
    }
    var bases = [];
    if (DE_SYMBOLS[sym]) bases.push(DE_SYMBOLS[sym]);
    if (bases.indexOf(sym) === -1) bases.push(sym);
    var list = [];
    bases.forEach(function (b) {
      DE_VENUES.forEach(function (v) { list.push({ symbol: b + v.sfx, venue: v }); });
    });
    return list;
  }

  /**
   * Letzter deutscher Kurs (EUR) einer US-Aktie oder null, wenn kein Handelsplatz gefunden wird.
   * refEur (optional): US-Kurs in EUR zur Plausibilitätsprüfung.
   */
  function fetchGermanQuote(ticker, refEur) {
    var sym = String(ticker || '').toUpperCase().trim();
    if (!sym || !isUsTicker(sym)) return Promise.resolve(null);

    return loadDeFile().then(function (fileSyms) {
      return fetchGermanQuoteWith(sym, refEur, fileSyms);
    });
  }

  function fetchGermanQuoteWith(sym, refEur, fileSyms) {
    var map = loadDeMap();
    var c = map[sym];
    var cands = deCandidates(sym, fileSyms);
    if (c && Array.isArray(c.syms) && c.syms.length && Date.now() - c.t < DE_OK_TTL) {
      var known = cands.filter(function (x) { return c.syms.indexOf(x.symbol) !== -1; });
      if (known.length) cands = known;
    }

    var reasons = ['v4'];
    return Promise.all(cands.map(function (cd) {
      return proxyJson('ticker=' + encodeURIComponent(cd.symbol) + '&interval=1m&range=1d')
        .then(function (d) {
          var q = parseGermanChart(d, cd.venue, cd.symbol);
          if (!q) reasons.push(cd.symbol + ': keine EUR-Daten');
          return q;
        })
        .catch(function (err) {
          reasons.push(cd.symbol + ': ' + (err && err.message ? err.message : 'Fehler'));
          return null;
        });
    })).then(function (list) {
      var valid = list.filter(function (q) {
        if (!q) return false;
        if (refEur > 0 && Math.abs(q.price / refEur - 1) > 0.25) {
          reasons.push(q.symbol + ': Kurs weicht >25 % vom US-Kurs ab');
          return false;
        }
        return true;
      });
      api.debugDe = api.debugDe || {};
      api.debugDe[sym] = reasons;
      if (!valid.length) return null;
      map[sym] = { syms: valid.map(function (q) { return q.symbol; }), t: Date.now() };
      saveDeMap(map);
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

    // Dateiwerte einmal sichern: wiederholtes Anwenden rechnet immer vom Dateistand aus
    if (!item._file) {
      item._file = {
        price: p0,
        pe: item.pe, forwardPe: item.forwardPe, peg: item.peg, marketCap: item.marketCap, dividendYield: item.dividendYield,
        cross: item.cross, crossDaysAgo: item.crossDaysAgo, emaCross: item.emaCross, emaCrossDaysAgo: item.emaCrossDaysAgo,
        emaTrend: item.emaTrend, bollingerSqueeze: item.bollingerSqueeze,
        chartPatterns: Array.isArray(item.chartPatterns) ? item.chartPatterns.slice() : item.chartPatterns,
        hasBullishPattern: item.hasBullishPattern, hasBearishPattern: item.hasBearishPattern
      };
    }
    applyValuation(item, item._file, p1);

    if (p0 > 0) {
      ['perf1w', 'perf1m', 'perf3m', 'perfYtd', 'perf52w'].forEach(function (k) {
        if (isNum(item[k])) {
          var baseP = p0 / (1 + Number(item[k]) / 100);
          if (baseP > 0) item[k] = (p1 / baseP - 1) * 100;
        }
      });
      ['upsideLow', 'upsideHigh'].forEach(function (k) {
        if (isNum(item[k])) item[k] = (p0 * (1 + Number(item[k]) / 100) / p1 - 1) * 100;
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
    // Exakte Neuberechnung aus den gespeicherten Schlusskursen (Live-Kurs ersetzt/ergänzt den letzten Punkt)
    if (Array.isArray(item.closes) && item.closes.length > 15) {
      var cl = item.closes.slice();
      var day = new Date(e.ts).toISOString().slice(0, 10);
      if (item.closesEnd && day > item.closesEnd) cl.push(p1); else cl[cl.length - 1] = p1;
      var n = cl.length;

      // Performance (gleiche Fensterlängen wie im Python-Skript)
      if (n > 5)  item.perf1w = (p1 / cl[n - 6] - 1) * 100;
      if (n > 21) item.perf1m = (p1 / cl[n - 22] - 1) * 100;
      if (n > 63) item.perf3m = (p1 / cl[n - 64] - 1) * 100;

      // RSI (14), einfacher Durchschnitt wie im Skript
      var tail = cl.slice(-15), gains = 0, losses = 0;
      for (var j = 1; j < 15; j++) {
        var diff = tail[j] - tail[j - 1];
        if (diff >= 0) gains += diff; else losses -= diff;
      }
      item.rsi = losses === 0 ? 100 : 100 - 100 / (1 + (gains / 14) / (losses / 14));

      // Support/Resistance und Chance-Risiko über die letzten 60 Schlusskurse
      if (n >= 60) {
        var w = cl.slice(-60);
        var stop2 = Math.min.apply(null, w) * 0.985;
        var tgt3 = Math.max.apply(null, w);
        if (isNum(item.upside) && Number(item.upside) > 0) tgt3 = p1 * (1 + Number(item.upside) / 100);
        var risk2 = p1 - stop2, reward2 = tgt3 - p1;
        if (risk2 > 0) {
          item.rrCrv = reward2 / risk2;
          item.rrStopPct = (risk2 / p1) * 100;
          item.rrTgtPct = (reward2 / p1) * 100;
        } else {
          item.rrCrv = null; item.rrStopPct = null; item.rrTgtPct = null;
        }
      }
    }
    if (Array.isArray(item.closes) && item.closes.length > 20) {
      applyTechnicals(item, item._file, p1, new Date(e.ts).toISOString().slice(0, 10));
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

  // ---------------------------------------------------------------- Bewertung mit Live-Kurs
  // Gewinne, Dividende und Aktienzahl ändern sich im Tagesverlauf nicht: die Kennzahlen skalieren mit dem Kurs.
  function applyValuation(item, f, p1) {
    var r = f.price > 0 ? p1 / f.price : null;
    if (!(r > 0)) return;
    ['pe', 'forwardPe', 'peg', 'marketCap'].forEach(function (k) {
      if (isNum(f[k])) item[k] = Number(f[k]) * r;
    });
    if (isNum(f.dividendYield)) item.dividendYield = Number(f.dividendYield) / r;
  }

  // ---------------------------------------------------------------- Kreuze, EMA-Trend, Squeeze mit Live-Kurs
  // Basis aus der Pipeline (item.liveBase): EMA 12/26/50/200 und SMA 200 am vorletzten und letzten Dateitag,
  // dazu die beiden Kurse, die beim SMA 200 aus dem Fenster fallen. SMA 50 und Squeeze kommen aus item.closes.
  // Ein Kreuz, das erst durch den Live-Kurs entsteht, wird als vorläufig markiert (crossLive / emaCrossLive).
  function avg(a) { var t = 0; for (var i = 0; i < a.length; i++) t += a[i]; return t / a.length; }

  function liveCross(f, prev, typeKey, daysKey, isNewDay, prevSign, liveSign, upName, downName) {
    var cross = f[typeKey], days = isNum(f[daysKey]) ? Number(f[daysKey]) : null;
    if (isNewDay) { if (days !== null) days += 1; }
    else if (days === 0) {
      // Kreuz lag auf dem heutigen Datenpunkt: Stand davor nehmen (ein Tag älter)
      cross = prev ? prev[typeKey] : null;
      days = prev && isNum(prev[daysKey]) ? Number(prev[daysKey]) + 1 : null;
    }
    if (prevSign && liveSign && prevSign !== liveSign) return { type: liveSign > 0 ? upName : downName, days: 0, live: true };
    if (days !== null && days > 60) { cross = null; days = null; }
    return { type: cross || null, days: cross ? days : null, live: false };
  }

  function applyTechnicals(item, f, p1, day) {
    var file = item.closes;
    var isNewDay = !!(item.closesEnd && day > item.closesEnd);
    var cl = file.slice();
    if (isNewDay) cl.push(p1); else cl[cl.length - 1] = p1;
    var b = item.liveBase || null;

    // SMA 50/200 -> Golden/Death Cross
    if (b && b.s200 && b.c200 && file.length >= 51) {
      var s50Live = avg(cl.slice(-50));
      var s50Prev = isNewDay ? avg(file.slice(-50)) : avg(file.slice(-51, -1));
      var s200Prev = isNewDay ? b.s200[1] : b.s200[0];
      var s200Live = isNewDay ? b.s200[1] + (p1 - b.c200[1]) / 200 : b.s200[0] + (p1 - b.c200[0]) / 200;
      var c = liveCross(f, b.prev, 'cross', 'crossDaysAgo', isNewDay,
        s50Prev > s200Prev ? 1 : -1, s50Live > s200Live ? 1 : -1, 'golden', 'death');
      item.cross = c.type; item.crossDaysAgo = c.days; item.crossLive = c.live;
      item.sma50Live = s50Live; item.sma200Live = s200Live;
    }

    // EMA 12/26 -> Kreuz, EMA 50/200 -> Trend
    function emaLive(key, n) {
      var v = b && b[key];
      if (!v) return null;
      var base = isNewDay ? v[1] : v[0], k = 2 / (n + 1);
      return { prev: base, live: base + k * (p1 - base) };
    }
    var e12 = emaLive('e12', 12), e26 = emaLive('e26', 26), e50 = emaLive('e50', 50), e200 = emaLive('e200', 200);
    if (e12 && e26) {
      var ec = liveCross(f, b.prev, 'emaCross', 'emaCrossDaysAgo', isNewDay,
        e12.prev > e26.prev ? 1 : -1, e12.live > e26.live ? 1 : -1, 'up', 'down');
      item.emaCross = ec.type; item.emaCrossDaysAgo = ec.days; item.emaCrossLive = ec.live;
    }
    if (e50 && e200) {
      item.emaTrend = p1 > e50.live && e50.live > e200.live;
      item.ema50Live = e50.live; item.ema200Live = e200.live;
    }

    // Bollinger-Squeeze über die letzten 20 Kurse (wie in der Pipeline)
    var w = cl.slice(-20), m = avg(w), v2 = 0;
    for (var i = 0; i < w.length; i++) v2 += (w[i] - m) * (w[i] - m);
    var squeeze = m > 0 && (4 * Math.sqrt(v2 / w.length)) / m < 0.05;
    item.bollingerSqueeze = squeeze;

    // Musterliste und Bull/Bär-Flags passend nachziehen
    var pats = (Array.isArray(f.chartPatterns) ? f.chartPatterns : []).filter(function (x) {
      return x !== 'squeeze' && (!b || (x !== 'golden_cross' && x !== 'death_cross'));
    });
    if (b && item.cross === 'golden') pats.unshift('golden_cross');
    if (b && item.cross === 'death') pats.unshift('death_cross');
    if (squeeze) pats.push('squeeze');
    item.chartPatterns = pats;
    item.hasBullishPattern = pats.indexOf('golden_cross') !== -1 || pats.indexOf('double_bottom') !== -1;
    item.hasBearishPattern = pats.indexOf('death_cross') !== -1 || pats.indexOf('double_top') !== -1;
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

  var api = {
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
  return api;
})();

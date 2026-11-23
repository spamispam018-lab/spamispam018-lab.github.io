/**
 * js/quant.js
 * Gemeinsame Kennzahlen-Mathematik für Risiko-Tab und Strategie-Backtest:
 * Renditen, Volatilität, Drawdown, VaR/CVaR, Sharpe/Sortino, Beta,
 * Indikatoren (SMA, RSI) und die Backtest-Engine für Einzelaktien-Strategien.
 *
 * Alles läuft lokal im Browser auf den vorhandenen Kursdaten (chartHistory / long/*.json).
 */

window.App = window.App || {};

window.App.Quant = (function () {
  'use strict';

  var TD = 252;       // Handelstage pro Jahr
  var RF = 0.02;      // Risikofreier Zins für Sharpe/Sortino (wie im Screener-Backtest)

  /* ---------- Grundlagen ---------- */
  function mean(a) {
    if (!a.length) return 0;
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }

  function std(a) {                                  // Stichproben-Standardabweichung
    if (a.length < 2) return 0;
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / (a.length - 1));
  }

  function quantile(sortedAsc, q) {
    if (!sortedAsc.length) return 0;
    var pos = (sortedAsc.length - 1) * q;
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
  }

  /** Bereinigt eine Kurshistorie: gültige Punkte, aufsteigend nach Datum, ohne Duplikate. */
  function cleanHistory(hist) {
    var seen = {}, out = [];
    (hist || []).forEach(function (p) {
      if (!p || !p.date || !(Number(p.close) > 0) || seen[p.date]) return;
      seen[p.date] = true;
      out.push({ date: p.date, close: Number(p.close) });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  /** Schneidet die letzten `years` Jahre aus einer (bereinigten) Historie. null = alles. */
  function sliceYears(hist, years) {
    if (!years || !hist.length) return hist;
    var last = new Date(hist[hist.length - 1].date + 'T00:00:00');
    last.setDate(last.getDate() - Math.round(years * 365.25));
    var cut = last.toISOString().slice(0, 10);
    var out = hist.filter(function (p) { return p.date >= cut; });
    return out.length > 1 ? out : hist;
  }

  /** Spannweite der Historie in Jahren. */
  function spanYears(hist) {
    if (hist.length < 2) return 0;
    var a = new Date(hist[0].date + 'T00:00:00'), b = new Date(hist[hist.length - 1].date + 'T00:00:00');
    return (b - a) / (365.25 * 86400000);
  }

  function returns(closes) {
    var out = [];
    for (var i = 1; i < closes.length; i++) out.push(closes[i] / closes[i - 1] - 1);
    return out;
  }

  function cagr(startVal, endVal, years) {
    if (!(startVal > 0) || !(endVal > 0) || !(years > 0.05)) return null;
    return Math.pow(endVal / startVal, 1 / years) - 1;
  }

  /* ---------- Risiko-Kennzahlen ---------- */
  function annualVol(rets) { return std(rets) * Math.sqrt(TD); }

  function sharpe(rets) {
    var s = std(rets);
    return s > 0 ? (mean(rets) * TD - RF) / (s * Math.sqrt(TD)) : null;
  }

  function sortino(rets) {
    if (!rets.length) return null;
    var dailyRf = RF / TD, ss = 0;
    for (var i = 0; i < rets.length; i++) {
      var d = Math.min(0, rets[i] - dailyRf);
      ss += d * d;
    }
    var dd = Math.sqrt(ss / rets.length) * Math.sqrt(TD);
    return dd > 0 ? (mean(rets) * TD - RF) / dd : null;
  }

  /** Historischer Value at Risk: Verlust (positiv, als Anteil), der an (1-conf) der Tage überschritten wurde. */
  function varHist(rets, conf) {
    if (rets.length < 20) return null;
    var sorted = rets.slice().sort(function (a, b) { return a - b; });
    return Math.max(0, -quantile(sorted, 1 - conf));
  }

  /** Expected Shortfall (CVaR): Ø-Verlust an den Tagen, die schlechter als der VaR waren. */
  function cvarHist(rets, conf) {
    if (rets.length < 20) return null;
    var sorted = rets.slice().sort(function (a, b) { return a - b; });
    var q = quantile(sorted, 1 - conf);
    var tail = sorted.filter(function (r) { return r <= q; });
    return tail.length ? Math.max(0, -mean(tail)) : null;
  }

  /** Drawdown-Reihe in Prozent (≤ 0) plus Kennzahlen zum maximalen Drawdown. */
  function drawdown(closes, dates) {
    var peak = closes[0], peakIdx = 0, series = [], mdd = 0, mddPeak = 0, mddTrough = 0;
    for (var i = 0; i < closes.length; i++) {
      if (closes[i] > peak) { peak = closes[i]; peakIdx = i; }
      var dd = (closes[i] / peak - 1) * 100;
      series.push(dd);
      if (dd < mdd) { mdd = dd; mddPeak = peakIdx; mddTrough = i; }
    }
    var recovery = null;
    for (var j = mddTrough + 1; j < closes.length; j++) {
      if (closes[j] >= closes[mddPeak]) { recovery = dates[j]; break; }
    }
    return {
      series: series,
      maxDD: mdd,
      peakDate: dates[mddPeak],
      troughDate: dates[mddTrough],
      recoveryDate: recovery,
      current: series[series.length - 1] || 0
    };
  }

  /** Richtet zwei Historien nach gemeinsamen Datumsangaben aus und liefert deren Tagesrenditen. */
  function alignedReturns(histA, histB) {
    var mapB = {};
    histB.forEach(function (p) { mapB[p.date] = p.close; });
    var a = [], b = [];
    histA.forEach(function (p) {
      if (mapB[p.date] > 0) { a.push(p.close); b.push(mapB[p.date]); }
    });
    return { a: returns(a), b: returns(b), n: a.length };
  }

  /** Beta und Korrelation von Renditereihe a gegenüber b. */
  function betaCorr(ra, rb) {
    var n = Math.min(ra.length, rb.length);
    if (n < 30) return { beta: null, corr: null };
    ra = ra.slice(-n); rb = rb.slice(-n);
    var ma = mean(ra), mb = mean(rb), cov = 0, vb = 0, va = 0;
    for (var i = 0; i < n; i++) {
      cov += (ra[i] - ma) * (rb[i] - mb);
      vb += (rb[i] - mb) * (rb[i] - mb);
      va += (ra[i] - ma) * (ra[i] - ma);
    }
    if (vb === 0 || va === 0) return { beta: null, corr: null };
    return { beta: cov / vb, corr: cov / Math.sqrt(va * vb) };
  }

  /** Histogramm der Tagesrenditen (in %), Klassen symmetrisch um 0, Randklassen sammeln Ausreißer. */
  function histogram(rets, binWidth, halfBins) {
    var bins = [], counts = [];
    for (var k = -halfBins; k <= halfBins; k++) { bins.push(k * binWidth); counts.push(0); }
    rets.forEach(function (r) {
      var idx = Math.round((r * 100) / binWidth) + halfBins;
      idx = Math.max(0, Math.min(bins.length - 1, idx));
      counts[idx]++;
    });
    return { bins: bins, counts: counts };
  }

  /* ---------- Indikatoren ---------- */
  function sma(vals, n) {
    var out = new Array(vals.length), sum = 0;
    for (var i = 0; i < vals.length; i++) {
      sum += vals[i];
      if (i >= n) sum -= vals[i - n];
      out[i] = i >= n - 1 ? sum / n : null;
    }
    return out;
  }

  function rsi(vals, n) {                            // Wilder-Glättung
    var out = new Array(vals.length), gain = 0, loss = 0, i;
    for (i = 0; i < vals.length; i++) out[i] = null;
    if (vals.length <= n) return out;
    for (i = 1; i <= n; i++) {
      var d = vals[i] - vals[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    gain /= n; loss /= n;
    out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    for (i = n + 1; i < vals.length; i++) {
      var dd = vals[i] - vals[i - 1];
      gain = (gain * (n - 1) + (dd > 0 ? dd : 0)) / n;
      loss = (loss * (n - 1) + (dd < 0 ? -dd : 0)) / n;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
    return out;
  }

  /* ---------- Strategien ---------- */
  var STRATEGIES = {
    buyhold: {
      label: 'Buy & Hold',
      desc: 'Einmal kaufen und halten – die Vergleichsbasis.',
      params: []
    },
    sma_cross: {
      label: 'SMA-Crossover',
      desc: 'Long, solange der schnelle Durchschnitt über dem langsamen liegt (Golden/Death Cross).',
      params: [
        { key: 'fast', label: 'Schnell (Tage)', def: 50, min: 2, max: 400 },
        { key: 'slow', label: 'Langsam (Tage)', def: 200, min: 3, max: 600 }
      ]
    },
    price_sma: {
      label: 'Kurs über SMA',
      desc: 'Long, solange der Schlusskurs über seinem gleitenden Durchschnitt liegt.',
      params: [{ key: 'n', label: 'SMA (Tage)', def: 200, min: 5, max: 600 }]
    },
    rsi_revert: {
      label: 'RSI Mean-Reversion',
      desc: 'Kauft überverkaufte Phasen (RSI unter Kauf-Schwelle), verkauft bei Erholung (RSI über Verkaufs-Schwelle).',
      params: [
        { key: 'n', label: 'RSI-Periode', def: 14, min: 2, max: 60 },
        { key: 'lo', label: 'Kaufen unter', def: 30, min: 5, max: 50 },
        { key: 'hi', label: 'Verkaufen über', def: 55, min: 40, max: 95 }
      ]
    },
    breakout: {
      label: 'Breakout (Donchian)',
      desc: 'Kauft bei neuem N-Tage-Schlusshoch, verkauft bei neuem M-Tage-Schlusstief.',
      params: [
        { key: 'up', label: 'Einstieg: Hoch (Tage)', def: 55, min: 5, max: 300 },
        { key: 'down', label: 'Ausstieg: Tief (Tage)', def: 20, min: 3, max: 200 }
      ]
    },
    momentum: {
      label: 'Momentum',
      desc: 'Long, solange die Rendite der letzten N Tage positiv ist.',
      params: [{ key: 'n', label: 'Rückblick (Tage)', def: 126, min: 10, max: 400 }]
    }
  };

  function defaultParams(type) {
    var o = {};
    ((STRATEGIES[type] || {}).params || []).forEach(function (p) { o[p.key] = p.def; });
    return o;
  }

  /** Liefert je Handelstag das Zielsignal (1 = investiert, 0 = Cash) nach Schlusskurs des Tages. */
  function computeSignals(closes, type, p) {
    var n = closes.length, sig = new Array(n), i;
    for (i = 0; i < n; i++) sig[i] = 0;

    if (type === 'buyhold') {
      for (i = 0; i < n; i++) sig[i] = 1;
    } else if (type === 'sma_cross') {
      var f = sma(closes, p.fast), s = sma(closes, p.slow);
      for (i = 0; i < n; i++) sig[i] = (f[i] != null && s[i] != null && f[i] > s[i]) ? 1 : 0;
    } else if (type === 'price_sma') {
      var m = sma(closes, p.n);
      for (i = 0; i < n; i++) sig[i] = (m[i] != null && closes[i] > m[i]) ? 1 : 0;
    } else if (type === 'rsi_revert') {
      var r = rsi(closes, p.n), pos = 0;
      for (i = 0; i < n; i++) {
        if (r[i] == null) { sig[i] = 0; continue; }
        if (pos === 0 && r[i] < p.lo) pos = 1;
        else if (pos === 1 && r[i] > p.hi) pos = 0;
        sig[i] = pos;
      }
    } else if (type === 'breakout') {
      var pos2 = 0;
      for (i = 0; i < n; i++) {
        if (pos2 === 0 && i >= p.up) {
          var hi = -Infinity;
          for (var a = i - p.up; a < i; a++) if (closes[a] > hi) hi = closes[a];
          if (closes[i] > hi) pos2 = 1;
        } else if (pos2 === 1 && i >= p.down) {
          var lo = Infinity;
          for (var b = i - p.down; b < i; b++) if (closes[b] < lo) lo = closes[b];
          if (closes[i] < lo) pos2 = 0;
        }
        sig[i] = pos2;
      }
    } else if (type === 'momentum') {
      for (i = 0; i < n; i++) sig[i] = (i >= p.n && closes[i] / closes[i - p.n] - 1 > 0) ? 1 : 0;
    }
    return sig;
  }

  function perfStats(eq, dates, rets) {
    var yrs = (new Date(dates[dates.length - 1] + 'T00:00:00') - new Date(dates[0] + 'T00:00:00')) / (365.25 * 86400000);
    var dd = drawdown(eq, dates);
    var c = cagr(eq[0], eq[eq.length - 1], yrs);
    return {
      totalReturn: (eq[eq.length - 1] / eq[0] - 1) * 100,
      cagr: c == null ? null : c * 100,
      vol: annualVol(rets) * 100,
      maxDD: dd.maxDD,
      sharpe: sharpe(rets),
      calmar: (c != null && dd.maxDD < 0) ? (c * 100) / Math.abs(dd.maxDD) : null
    };
  }

  /**
   * Führt eine Long-only-Strategie auf täglichen Schlusskursen aus.
   * Ausführung: Signal am Schlusskurs von Tag t, Fill am Schlusskurs von Tag t+1 (kein Look-ahead).
   * @param {Array} hist  bereinigte Historie [{date, close}]
   * @param {string} type Strategie-Schlüssel
   * @param {Object} p    Parameter
   * @param {number} fee  Kosten je Kauf/Verkauf als Anteil (0.001 = 0,1 %)
   */
  function backtest(hist, type, p, fee) {
    var n = hist.length;
    if (n < 30) return { error: 'Zu wenig Kursdaten (mindestens 30 Handelstage).' };
    var closes = hist.map(function (h) { return h.close; });
    var dates = hist.map(function (h) { return h.date; });

    var sig = computeSignals(closes, type, p);
    var pos = new Array(n), i;
    for (i = 0; i < n; i++) pos[i] = i >= 2 ? sig[i - 2] : 0;     // 1 Tag Verzögerung bis zum Fill

    var eq = [100], rets = [0], bh = [100 * (1 - fee)];
    for (i = 1; i < n; i++) {
      if (pos[i] !== pos[i - 1]) eq[i - 1] *= (1 - fee);          // Kosten beim Fill
      var r = closes[i] / closes[i - 1] - 1;
      eq.push(eq[i - 1] * (1 + pos[i] * r));
      rets.push(eq[i] / eq[i - 1] - 1);
      bh.push(bh[0] * closes[i] / closes[0]);
    }

    // Trades aus den Positionswechseln
    var trades = [], entry = null;
    for (i = 1; i < n; i++) {
      if (pos[i] === 1 && pos[i - 1] === 0) entry = i - 1;
      if (pos[i] === 0 && pos[i - 1] === 1 && entry != null) {
        trades.push(makeTrade(entry, i - 1, false));
        entry = null;
      }
    }
    if (entry != null) trades.push(makeTrade(entry, n - 1, true));

    function makeTrade(e, x, open) {
      var gross = closes[x] / closes[e];
      var net = gross * (1 - fee) * (open ? 1 : (1 - fee)) - 1;
      return { entryDate: dates[e], exitDate: dates[x], entry: closes[e], exit: closes[x], ret: net * 100, days: x - e, open: open };
    }

    var stats = perfStats(eq, dates, rets.slice(1));
    var held = 0;
    for (i = 0; i < n; i++) held += pos[i];
    stats.exposure = held / n * 100;
    stats.trades = trades.length;
    var wins = trades.filter(function (t) { return t.ret > 0; }).length;
    stats.winRate = trades.length ? wins / trades.length * 100 : null;
    stats.avgTrade = trades.length ? mean(trades.map(function (t) { return t.ret; })) : null;
    stats.bestTrade = trades.length ? Math.max.apply(null, trades.map(function (t) { return t.ret; })) : null;
    stats.worstTrade = trades.length ? Math.min.apply(null, trades.map(function (t) { return t.ret; })) : null;

    var bhStats = perfStats(bh, dates, returns(bh));
    bhStats.exposure = 100;

    return {
      dates: dates, equity: eq, buyHold: bh, trades: trades,
      stats: stats, bhStats: bhStats,
      pendingSignal: sig[n - 1] === 1 ? 'long' : 'cash'
    };
  }

  /* ---------- Historie laden ---------- */
  /**
   * Lädt die längste verfügbare Historie: long/<TICKER>.json oder – falls kürzer – die chartHistory aus der Aktie.
   * @returns {Promise<Array>} bereinigte Historie [{date, close}]
   */
  function loadHistory(ticker, fallbackHistory) {
    var fallback = cleanHistory(fallbackHistory);
    var D = window.App.Data;
    if (!D || !D.getLongHistory) return Promise.resolve(fallback);
    return D.getLongHistory(ticker).then(function (long) {
      var l = cleanHistory(long);
      return l.length > fallback.length ? l : fallback;
    }).catch(function () { return fallback; });
  }

  /** Lädt die Historie eines beliebigen Tickers (z. B. Benchmark-ETF). */
  function loadHistoryFor(ticker) {
    var D = window.App.Data;
    return D.getStock(ticker).then(function (s) {
      return loadHistory(ticker, s.chartHistory);
    }).catch(function () { return []; });
  }

  return {
    TD: TD, RF: RF,
    mean: mean, std: std, quantile: quantile,
    cleanHistory: cleanHistory, sliceYears: sliceYears, spanYears: spanYears,
    returns: returns, cagr: cagr,
    annualVol: annualVol, sharpe: sharpe, sortino: sortino,
    varHist: varHist, cvarHist: cvarHist, drawdown: drawdown,
    alignedReturns: alignedReturns, betaCorr: betaCorr, histogram: histogram,
    sma: sma, rsi: rsi,
    STRATEGIES: STRATEGIES, defaultParams: defaultParams, computeSignals: computeSignals, backtest: backtest,
    loadHistory: loadHistory, loadHistoryFor: loadHistoryFor
  };
})();

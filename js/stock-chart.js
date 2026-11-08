/**
 * js/stock-chart.js
 * Chart-Analyse-Tab. NEU: KGV-Band-Historie (5 Jahre) aus Quartalsgewinnen und Kursverlauf.
 */
window.App = window.App || {};

window.App.StockChart = (function () {
  'use strict';

  var currentPeriod = '1Y';
  var candleWeeks = 52;

  var COLORS = {
    price: '#818cf8',
    sma50: '#f59e0b',
    sma200: '#ec4899',
    rsi: '#818cf8',
    macd: '#818cf8',
    signal: '#f59e0b',
    bull: 'var(--bullish)',
    bear: 'var(--bearish)',
    neutral: '#f59e0b'
  };

  function sma(values, n) {
    var out = [], sum = 0;
    for (var i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= n) sum -= values[i - n];
      out.push(i >= n - 1 ? sum / n : null);
    }
    return out;
  }

  function ema(values, n) {
    var out = [], k = 2 / (n + 1), prev = null, buf = [];
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (v === null || v === undefined) { out.push(null); continue; }
      if (prev === null) {
        buf.push(v);
        if (buf.length === n) { prev = buf.reduce(function (a, b) { return a + b; }, 0) / n; out.push(prev); }
        else out.push(null);
      } else { prev = v * k + prev * (1 - k); out.push(prev); }
    }
    return out;
  }

  function rsi(values, n) {
    var out = [], avgGain = 0, avgLoss = 0;
    for (var i = 0; i < values.length; i++) {
      if (i === 0) { out.push(null); continue; }
      var diff = values[i] - values[i - 1];
      var gain = diff > 0 ? diff : 0, loss = diff < 0 ? -diff : 0;
      if (i <= n) {
        avgGain += gain / n; avgLoss += loss / n;
        if (i < n) { out.push(null); continue; }
      } else {
        avgGain = (avgGain * (n - 1) + gain) / n;
        avgLoss = (avgLoss * (n - 1) + loss) / n;
      }
      out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
    return out;
  }

  function macd(values) {
    var e12 = ema(values, 12), e26 = ema(values, 26);
    var line = values.map(function (_, i) { return (e12[i] !== null && e26[i] !== null) ? e12[i] - e26[i] : null; });
    var signal = ema(line, 9);
    var hist = line.map(function (v, i) { return (v !== null && signal[i] !== null) ? v - signal[i] : null; });
    return { line: line, signal: signal, hist: hist };
  }

  function lastValid(arr) {
    for (var i = arr.length - 1; i >= 0; i--) {
      if (arr[i] !== null && arr[i] !== undefined && isFinite(arr[i])) return arr[i];
    }
    return null;
  }

  function stdev(arr) {
    if (arr.length < 2) return 0;
    var m = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
    var v = arr.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (arr.length - 1);
    return Math.sqrt(v);
  }

  function findLastCross(s50, s200, dates) {
    var prevSign = 0, last = null;
    for (var i = 0; i < s50.length; i++) {
      if (s50[i] === null || s200[i] === null) continue;
      var sign = s50[i] > s200[i] ? 1 : -1;
      if (prevSign !== 0 && sign !== prevSign) last = { type: sign > 0 ? 'golden' : 'death', date: dates[i] };
      prevSign = sign;
    }
    return last;
  }

  function maxDrawdown(closes) {
    if (!closes || closes.length === 0) return 0;
    var peak = closes[0], mdd = 0;
    closes.forEach(function (c) {
      if (c > peak) peak = c;
      var dd = peak > 0 ? (c / peak - 1) * 100 : 0;
      if (dd < mdd) mdd = dd;
    });
    return mdd;
  }

  function fmt(v, d) { return window.App.Format.number(v, d === undefined ? 1 : d); }
  function pct(v, d) { return (v >= 0 ? '+' : '') + fmt(v, d) + ' %'; }

  function deDate(iso) {
    if (!iso || iso.length < 10) return '';
    return iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);
  }

  function weekKey(iso) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }

  function weeklyCandles(hist) {
    var weeks = [], cur = null, prevClose = null;
    hist.forEach(function (p) {
      var k = weekKey(p.date);
      if (!cur || cur.key !== k) {
        if (cur) { weeks.push(cur); prevClose = cur.c; }
        var o = prevClose !== null ? prevClose : p
/**
 * js/stock-chart.js
 * Chart-Analyse-Tab der Aktiendetailseite (nach "Overview"):
 * - Steuerung des Analyse-Zeitraums (1W, 1M, 3M, 6M, 1J)
 * - Technisches Bild (Signale zu SMA 50/200, RSI, MACD, dynamisches Momentum)
 * - Chart-Tools Toolbar: Bollinger, VWAP, Fibo, Support/Resistance, Pivots, Patterns, Risk/Reward
 * - Risiko & Volumen (Volatilität, Drawdown, Abstand zu Hoch/Tief, Volumentrend)
 *
 * Alle Indikatoren werden im Browser aus stock.chartHistory berechnet.
 */

window.App = window.App || {};

window.App.StockChart = (function () {
  'use strict';

  var currentPeriod = '1Y'; // Default Zeitraum
  var candleWeeks = 52;     // Anzahl Wochenkerzen (26 = 6M, 52 = 1J, 104 = 2J)

  // Zustand der aktiven Chart-Tools
  var activeTools = {
    bollinger: false,
    vwap: false,
    fibo: false,
    sr: false,
    pivot: false,
    pattern: false,
    rr: false
  };

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

  // ---------------------------------------------------------------------------
  // Indikator-Berechnungen (Standard)
  // ---------------------------------------------------------------------------

  function sma(values, n) {
    var out = [];
    var sum = 0;
    for (var i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= n) sum -= values[i - n];
      out.push(i >= n - 1 ? sum / n : null);
    }
    return out;
  }

  function ema(values, n) {
    var out = [];
    var k = 2 / (n + 1);
    var prev = null;
    var buf = [];
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (v === null || v === undefined) { out.push(null); continue; }
      if (prev === null) {
        buf.push(v);
        if (buf.length === n) {
          prev = buf.reduce(function (a, b) { return a + b; }, 0) / n;
          out.push(prev);
        } else {
          out.push(null);
        }
      } else {
        prev = v * k + prev * (1 - k);
        out.push(prev);
      }
    }
    return out;
  }

  function rsi(values, n) {
    var out = [];
    var avgGain = 0;
    var avgLoss = 0;
    for (var i = 0; i < values.length; i++) {
      if (i === 0) { out.push(null); continue; }
      var diff = values[i] - values[i - 1];
      var gain = diff > 0 ? diff : 0;
      var loss = diff < 0 ? -diff : 0;
      if (i <= n) {
        avgGain += gain / n;
        avgLoss += loss / n;
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
    var e12 = ema(values, 12);
    var e26 = ema(values, 26);
    var line = values.map(function (_, i) {
      return (e12[i] !== null && e26[i] !== null) ? e12[i] - e26[i] : null;
    });
    var signal = ema(line, 9);
    var hist = line.map(function (v, i) {
      return (v !== null && signal[i] !== null) ? v - signal[i] : null;
    });
    return { line: line, signal: signal, hist: hist };
  }

  // ---------------------------------------------------------------------------
  // NEUE Chart-Tools Berechnungen
  // ---------------------------------------------------------------------------

  function bollingerBands(closes, n, k) {
    var s = sma(closes, n);
    var up = [], dn = [];
    for (var i = 0; i < closes.length; i++) {
      if (i < n - 1) { up.push(null); dn.push(null); continue; }
      var sum = 0;
      for (var j = i - n + 1; j <= i; j++) sum += Math.pow(closes[j] - s[i], 2);
      var std = Math.sqrt(sum / n);
      up.push(s[i] + k * std);
      dn.push(s[i] - k * std);
    }
    return { mid: s, up: up, dn: dn };
  }

  function anchoredVwap(closes, vols, startIndex) {
    var out = [];
    var cumVol = 0, cumPV = 0;
    for (var i = 0; i < closes.length; i++) {
      if (i < startIndex || !vols[i]) { out.push(null); continue; }
      cumVol += vols[i];
      cumPV += closes[i] * vols[i];
      out.push(cumVol > 0 ? cumPV / cumVol : null);
    }
    return out;
  }

  function pivotPoints(high, low, close) {
    var p = (high + low + close) / 3;
    var r1 = (2 * p) - low;
    var s1 = (2 * p) - high;
    var r2 = p + (high - low);
    var s2 = p - (high - low);
    return { p: p, r1: r1, s1: s1, r2: r2, s2: s2 };
  }

  function detectPatterns(closes, tail) {
    var data = closes.slice(-tail);
    if (data.length < 20) return null;
    var max = Math.max.apply(null, data), min = Math.min.apply(null, data);
    var current = data[data.length - 1];
    
    // Prüfen, ob der aktuelle Kurs ein vorheriges Top/Bottom erneut testet (Toleranz 2%)
    if (Math.abs(current - max) / max < 0.02) return { type: 'Double Top (Widerstand)', val: max };
    if (Math.abs(current - min) / min < 0.02) return { type: 'Double Bottom (Unterstützung)', val: min };
    return null;
  }

  // ---------------------------------------------------------------------------
  // Hilfsfunktionen
  // ---------------------------------------------------------------------------

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
    var prevSign = 0;
    var last = null;
    for (var i = 0; i < s50.length; i++) {
      if (s50[i] === null || s200[i] === null) continue;
      var sign = s50[i] > s200[i] ? 1 : -1;
      if (prevSign !== 0 && sign !== prevSign) {
        last = { type: sign > 0 ? 'golden' : 'death', date: dates[i] };
      }
      prevSign = sign;
    }
    return last;
  }

  function maxDrawdown(closes) {
    if (!closes || closes.length === 0) return 0;
    var peak = closes[0];
    var mdd = 0;
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

  function shortLabel(iso) {
    var d = String(iso || '');
    return d.slice(5, 7) + '/' + d.slice(2, 4);
  }

  // ---------------------------------------------------------------------------
  // Wochenkerzen
  // ---------------------------------------------------------------------------
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
        // Nutze den echten Open aus Python, falls vorhanden, sonst Fallback auf PrevClose
        var o = p.open || (prevClose !== null ? prevClose : p.close);
        cur = { key: k, date: p.date, o: o, h: p.high || Math.max(o, p.close), l: p.low || Math.min(o, p.close), c: p.close };
      } else {
        cur.h = Math.max(cur.h, p.high || p.close);
        cur.l = Math.min(cur.l, p.low || p.close);
        cur.c = p.close;
        cur.date = p.date;
      }
    });
    if (cur) weeks.push(cur);
    return weeks;
  }

  function smaSeries(values, len) {
    var out = [];
    for (var i = 0; i < values.length; i++) {
      if (i + 1 < len) { out.push(null); continue; }
      var sum = 0;
      for (var j = i - len + 1; j <= i; j++) sum += values[j];
      out.push(sum / len);
    }
    return out;
  }

  function drawCandles(container, hist, currency) {
    var canvas = container.querySelector('#chart-tab-candles');
    if (!canvas) return;
    var weeks = weeklyCandles(hist);
    var sma = smaSeries(weeks.map(function (w) { return w.c; }), 10);
    var take = Math.min(candleWeeks, weeks.length);
    var shown = weeks.slice(-take);
    window.App.Charts.renderCandleChart(canvas, {
      candles: shown,
      labels: shown.map(function (w) { return shortLabel(w.date); }),
      lines: [{ values: sma.slice(-take), color: COLORS.sma50 }],
      formatY: function (v) { return window.App.Format.currency(v, currency, 0); }
    });
    var info = container.querySelector('#candle-info');
    if (info && shown.length) {
      var lastC = shown[shown.length - 1];
      var chg = lastC.o ? (lastC.c / lastC.o - 1) * 100 : 0;
      info.textContent = 'Laufende Woche: ' + (chg >= 0 ? '+' : '') + window.App.Format.number(chg, 1) + ' %';
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function bottomCheck(c) {
    var n = c.length;
    if (n < 120) return null;
    var px = c[n - 1], hi = Math.max.apply(null, c.slice(-252));
    var dd = px / hi - 1;
    if (dd > -0.20) return { state: null, dd: dd };
    function avg(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
    var w = c.slice(-60), mn = Math.min.apply(null, w), idx = 0;
    for (var i = 0; i < w.length; i++) { if (w[i] <= mn) idx = i; }
    var sinceLow = w.length - 1 - idx;
    var s20 = avg(c.slice(-20)), s20b = avg(c.slice(-25, -5));
    var m = macd(c), r = rsi(c, 14);
    var ml = m.line[n - 1], ms = m.signal[n - 1], r0 = r[n - 1], r5 = r[n - 6];
    var rOk = r0 !== null && r5 !== null && r0 >= 40 && r0 > r5;
    var sig = [
      { ok: sinceLow >= 15, text: 'Kein neues 60-Tage-Tief seit ' + sinceLow + ' Handelstagen' },
      { ok: Math.min.apply(null, c.slice(-20)) > Math.min.apply(null, c.slice(-60, -20)), text: 'Höheres Tief gebildet' },
      { ok: px > s20, text: 'Kurs ' + (px > s20 ? 'über' : 'unter') + ' 20-Tage-Linie' },
      { ok: s20 >= s20b, text: '20-Tage-Linie ' + (s20 >= s20b ? 'steigt' : 'fällt') },
      { ok: ml !== null && ms !== null && ml > ms, text: 'MACD ' + (ml > ms ? 'über' : 'unter') + ' Signal' },
      { ok: rOk, text: 'RSI ' + (r0 !== null ? Math.round(r0) : '–') + (rOk ? ' (≥ 40 & steigend)' : '') }
    ];
    var score = sig.filter(function (s) { return s.ok; }).length;
    var perf1m = px / c[n - 22] - 1;
    var state = 'wait';
    if (score >= 4 && (sig[0].ok || sig[1].ok)) state = 'base';
    else if (score <= 2 && (sinceLow <= 10 || perf1m <= -0.10)) state = 'knife';
    return { state: state, score: score, dd: dd, signals: sig };
  }

  function bottomCardHtml(b) {
    var head = '<div class="card"><div class="card-header-dotted"><span class="card-title">Boden-Check</span>';
    var note = '<div class="chart-note">Keine Anlageberatung. Ein Boden ist erst im Nachhinein sicher erkennbar.</div></div>';
    if (!b) return head + '</div><p style="font-size:.78rem;color:var(--text-muted);">Zu wenige Kursdaten.</p>' + note;
    if (!b.state) return head + '</div><p style="font-size:.78rem;color:var(--text-muted);">Kurs liegt nur ' + Math.abs(b.dd * 100).toFixed(0) + ' % unter dem 52W-Hoch – Check nicht relevant.</p>' + note;
    var V = { base: ['Bodenbildung möglich', 'badge-bullish'], knife: ['Fallendes Messer', 'badge-bearish'], wait: ['Unklar – abwarten', 'badge-neutral'] }[b.state];
    var rows = b.signals.map(function (s) {
      return '<div class="chart-signal-row"><span class="chart-dot" style="background:' + (s.ok ? 'var(--bullish)' : 'var(--text-dim)') + ';"></span>' +
        '<div class="chart-signal-text"><div class="chart-signal-value">' + (s.ok ? '✓ ' : '✗ ') + s.text + '</div></div></div>';
    }).join('');
    return head + '<span class="badge-pill ' + V[1] + '">' + V[0] + '</span></div>' +
      '<div style="font-size:.72rem;color:var(--text-dim);margin-bottom:6px;">' + b.score + ' von 6 Stabilisierungs-Signalen</div>' +
      '<div class="chart-signal-list">' + rows + '</div>' + note;
  }

  function toggleRiskRewardOverlay(container, currentPrice, currency) {
    var chartDiv = container.querySelector('#chart-tab-price').parentNode;
    var existing = chartDiv.querySelector('#rr-overlay');
    
    if (existing) {
      existing.remove();
    }
    
    if (!activeTools.rr) return;

    var tp = currentPrice * 1.15; // Target: +15%
    var sl = currentPrice * 0.93; // Stop: -7%
    var risk = currentPrice - sl;
    var reward = tp - currentPrice;
    var rrRatio = (reward / risk).toFixed(2);

    var rrHtml = '' +
      '<div id="rr-overlay" style="position: absolute; right: 10px; top: 10px; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 10px; z-index: 10; width: 150px; font-size: 0.75rem; backdrop-filter: blur(4px); box-shadow: 0 4px 12px rgba(0,0,0,0.5);">' +
        '<div style="font-weight: 700; color: var(--text-main); margin-bottom: 8px; text-align: center; border-bottom: 1px solid var(--border-color); padding-bottom: 4px;">Long Position</div>' +
        '<div style="display: flex; justify-content: space-between; color: var(--bullish); margin-bottom: 4px;"><span>Take Profit</span><b>' + window.App.Format.currency(tp, currency, 2) + '</b></div>' +
        '<div style="display: flex; justify-content: space-between; color: var(--text-main); margin-bottom: 4px;"><span>Einstieg</span><b>' + window.App.Format.currency(currentPrice, currency, 2) + '</b></div>' +
        '<div style="display: flex; justify-content: space-between; color: var(--bearish); margin-bottom: 8px;"><span>Stop Loss</span><b>' + window.App.Format.currency(sl, currency, 2) + '</b></div>' +
        '<div style="display: flex; justify-content: space-between; border-top: 1px dashed var(--border-color); padding-top: 4px; font-weight: 700;"><span>CRV</span><b style="color: var(--accent-purple-light);">' + rrRatio + '</b></div>' +
      '</div>';
      
    chartDiv.insertAdjacentHTML('beforeend', rrHtml);
  }

  function render(container, stock) {
    if (!container || !stock) return;

    var hist = (stock.chartHistory || []).filter(function (p) { return p && p.close > 0; });
    if (hist.length < 60) {
      container.innerHTML = '<div class="card"><p style="color: var(--text-muted); font-size: 0.85rem;">' +
        'Für die Chart-Analyse liegen noch zu wenige Kursdaten vor.</p></div>';
      return;
    }

    buildView(container, stock, hist);
  }

  function buildView(container, stock, hist) {
    var currency = (stock.quote && stock.quote.currency) || 'EUR';
    var closes = hist.map(function (p) { return p.close; });
    var dates = hist.map(function (p) { return p.date; });
    var vols = hist.map(function (p) { return p.volume || 0; });
    
    var n = closes.length;
    var price = closes[n - 1];

    var s50 = sma(closes, 50);
    var s200 = sma(closes, 200);
    var rsiArr = rsi(closes, 14);
    var m = macd(closes);

    var tail = n;
    var spanDays = { '1W': 7, '1M': 30, '3M': 91, '6M': 182, '1Y': 365 }[currentPeriod];
    if (spanDays && n > 0) {
      var tEnd = new Date(dates[n - 1] + 'T00:00:00Z');
      tEnd.setUTCDate(tEnd.getUTCDate() - spanDays);
      var cutoffStr = tEnd.toISOString().slice(0, 10);
      var startIdx = 0;
      for (var di = 0; di < n; di++) {
        if (dates[di] <= cutoffStr) startIdx = di; else break;
      }
      tail = n - startIdx;
    }

    var slicedCloses = closes.slice(-tail);
    var slicedDates = dates.slice(-tail);
    
    // Extrema im gewählten Zeitraum
    var hi = Math.max.apply(null, slicedCloses);
    var lo = Math.min.apply(null, slicedCloses);
    
    var s50Last = lastValid(s50);
    var s200Last = lastValid(s200);
    var rsiLast = lastValid(rsiArr);
    var macdLast = lastValid(m.line);
    var sigLast = lastValid(m.signal);
    var cross = findLastCross(s50, s200, dates);

    var momVal = null;
    if (slicedCloses.length > 0 && slicedCloses[0] > 0) {
        momVal = (price / slicedCloses[0] - 1) * 100;
    }
    
    var periodLabelMap = { '1W': '1 Woche', '1M': '1 Monat', '3M': '3 Monate', '6M': '6 Monate', '1Y': '1 Jahr' };
    var pLabel = periodLabelMap[currentPeriod];

    var auff = auffaelligkeiten(stock);

    var signals = [];
    if (s200Last !== null) {
      var d200 = (price / s200Last - 1) * 100;
      signals.push({ label: 'Kurs vs. 200-Tage-Linie', text: pct(d200) + (d200 >= 0 ? ' darüber' : ' darunter'), state: d200 >= 0 ? 'bull' : 'bear' });
    }
    if (s50Last !== null) {
      var d50 = (price / s50Last - 1) * 100;
      signals.push({ label: 'Kurs vs. 50-Tage-Linie', text: pct(d50) + (d50 >= 0 ? ' darüber' : ' darunter'), state: d50 >= 0 ? 'bull' : 'bear' });
    }
    if (s50Last !== null && s200Last !== null) {
      var golden = s50Last > s200Last;
      var crossTxt = cross ? ' (letztes Kreuz: ' + (cross.type === 'golden' ? 'Golden Cross' : 'Death Cross') + ' am ' + deDate(cross.date) + ')' : '';
      signals.push({ label: 'SMA 50 vs. SMA 200', text: (golden ? 'SMA 50 über SMA 200' : 'SMA 50 unter SMA 200') + crossTxt, state: golden ? 'bull' : 'bear' });
    }
    if (rsiLast !== null) {
      var rsiState = 'neutral';
      var rsiTxt = fmt(rsiLast, 0);
      if (rsiLast >= 70) rsiTxt += ' – überkauft';
      else if (rsiLast <= 30) rsiTxt += ' – überverkauft';
      else if (rsiLast >= 50) { rsiTxt += ' – positives Momentum'; rsiState = 'bull'; }
      else { rsiTxt += ' – schwaches Momentum'; rsiState = 'bear'; }
      signals.push({ label: 'RSI (14)', text: rsiTxt, state: rsiState });
    }
    if (macdLast !== null && sigLast !== null) {
      var macdBull = macdLast > sigLast;
      signals.push({ label: 'MACD', text: macdBull ? 'MACD über Signallinie' : 'MACD unter Signallinie', state: macdBull ? 'bull' : 'bear' });
    }
    if (momVal !== null) {
      signals.push({ label: 'Momentum ' + pLabel, text: pct(momVal), state: momVal >= 0 ? 'bull' : 'bear' });
    }

    var bulls = signals.filter(function (s) { return s.state === 'bull'; }).length;
    var bears = signals.filter(function (s) { return s.state === 'bear'; }).length;
    var rated = bulls + bears;
    var ratio = rated > 0 ? bulls / rated : 0.5;
    var overall = 'Seitwärts / gemischt';
    var overallCls = 'badge-neutral';
    if (ratio >= 0.67) { overall = 'Aufwärtstrend'; overallCls = 'badge-bullish'; }
    else if (ratio <= 0.33) { overall = 'Abwärtstrend'; overallCls = 'badge-bearish'; }

    var signalRows = signals.map(function (s) {
      return '<div class="chart-signal-row">' +
        '<span class="chart-dot" style="background:' + COLORS[s.state] + ';"></span>' +
        '<div class="chart-signal-text"><div class="chart-signal-label">' + termLink(s.label) + '</div>' +
        '<div class="chart-signal-value">' + s.text + '</div></div></div>';
    }).join('');

    signals.forEach(function (sg) {
      if (sg.state === 'bull') auff.plus.push({ t: sg.label, d: sg.text });
      else if (sg.state === 'bear') auff.minus.push({ t: sg.label, d: sg.text });
    });
    if (rsiLast !== null && rsiLast >= 70) auff.minus.push({ t: 'RSI überkauft', d: 'RSI bei ' + fmt(rsiLast, 0) + ': Rücksetzer-Risiko.' });
    else if (rsiLast !== null && rsiLast <= 30) auff.minus.push({ t: 'RSI überverkauft', d: 'RSI bei ' + fmt(rsiLast, 0) + '.' });

    function avg(arr) { return arr.length ? arr.reduce(function(a,b){return a+b},0)/arr.length : 0; }
    var volTrend = avg(vols.slice(-60)) > 0 ? (avg(vols.slice(-20)) / avg(vols.slice(-60)) - 1) * 100 : null;

    var html = '' +
      '<div class="card" style="padding: 10px 16px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">' +
        '<span style="font-size: 0.78rem; font-weight: 600; color: var(--text-dim); text-transform: uppercase;">Zeitraum</span>' +
        '<div class="pill-group" id="chart-period-pills">' +
          '<button class="pill-btn ' + (currentPeriod === '1W' ? 'active' : '') + '" data-period="1W">1W</button>' +
          '<button class="pill-btn ' + (currentPeriod === '1M' ? 'active' : '') + '" data-period="1M">1M</button>' +
          '<button class="pill-btn ' + (currentPeriod === '3M' ? 'active' : '') + '" data-period="3M">3M</button>' +
          '<button class="pill-btn ' + (currentPeriod === '6M' ? 'active' : '') + '" data-period="6M">6M</button>' +
          '<button class="pill-btn ' + (currentPeriod === '1Y' ? 'active' : '') + '" data-period="1Y">1J</button>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Technisches Bild</span>' +
          '<span class="badge-pill ' + overallCls + '">' + overall + '</span>' +
        '</div>' +
        '<div class="chart-signal-list">' + signalRows + '</div>' +
      '</div>' +

      bottomCardHtml(bottomCheck(closes)) +
      '<div id="forecast-slot"></div>' +
      
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">Auffälligkeiten</span></div>' +
        '<div class="auff-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px;">' +
          '<div class="auff-col auff-col-plus" style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-top: 2px solid var(--bullish); padding: 10px;">' +
            '<div class="auff-col-head" style="font-size: 0.68rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; margin-bottom: 4px;">Auffällig günstig / stark</div>' +
            auffColHtml(auff.plus, 'Keine Auffälligkeit.') +
          '</div>' +
          '<div class="auff-col auff-col-minus" style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-top: 2px solid var(--bearish); padding: 10px;">' +
            '<div class="auff-col-head" style="font-size: 0.68rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; margin-bottom: 4px;">Auffällig teuer / schwach</div>' +
            auffColHtml(auff.minus, 'Keine Auffälligkeit.') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- Chart Tools Toolbar -->' +
      '<div class="horizontal-scroll-row" id="chart-tools-toolbar" style="margin-bottom: 12px; padding-bottom: 4px;">' +
        '<button class="chip-btn ' + (activeTools.bollinger ? 'active' : '') + '" data-tool="bollinger">Bollinger</button>' +
        '<button class="chip-btn ' + (activeTools.vwap ? 'active' : '') + '" data-tool="vwap">AVWAP</button>' +
        '<button class="chip-btn ' + (activeTools.fibo ? 'active' : '') + '" data-tool="fibo">Fibonacci</button>' +
        '<button class="chip-btn ' + (activeTools.sr ? 'active' : '') + '" data-tool="sr">Support/Res</button>' +
        '<button class="chip-btn ' + (activeTools.pivot ? 'active' : '') + '" data-tool="pivot">Pivots</button>' +
        '<button class="chip-btn ' + (activeTools.pattern ? 'active' : '') + '" data-tool="pattern">Patterns</button>' +
        '<button class="chip-btn ' + (activeTools.rr ? 'active' : '') + '" data-tool="rr" style="border-color: var(--accent-purple); color: var(--accent-purple-light);">Risk/Reward</button>' +
      '</div>' +

      '<!-- Kurs + SMA -->' +
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">Kurs &amp; Chart Tools</span></div>' +
        '<div style="height: 220px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="chart-tab-price" style="width: 100%; height: 220px; display: block;"></canvas>' +
        '</div>' +
      '</div>' +

      '<!-- Wochenkerzen -->' +
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">Wochenkerzen</span><span class="period-tag" id="candle-info">—</span></div>' +
        '<div class="pill-group" id="candle-range-pills" style="margin-top: 6px;">' +
          '<button class="pill-btn ' + (candleWeeks === 26 ? 'active' : '') + '" data-weeks="26">6M</button>' +
          '<button class="pill-btn ' + (candleWeeks === 52 ? 'active' : '') + '" data-weeks="52">1J</button>' +
          '<button class="pill-btn ' + (candleWeeks === 104 ? 'active' : '') + '" data-weeks="104">2J</button>' +
        '</div>' +
        '<div style="height: 240px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="chart-tab-candles" style="width: 100%; height: 240px; display: block;"></canvas>' +
        '</div>' +
      '</div>' +

      '<!-- RSI -->' +
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">RSI (14)</span><span class="period-tag">' + (rsiLast !== null ? fmt(rsiLast, 0) : '—') + '</span></div>' +
        '<div style="height: 130px; width: 100%; position: relative; margin-top: 8px;"><canvas id="chart-tab-rsi" style="width: 100%; height: 130px; display: block;"></canvas></div>' +
      '</div>' +

      '<!-- MACD -->' +
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">MACD (12/26/9)</span></div>' +
        '<div style="height: 140px; width: 100%; position: relative; margin-top: 8px;"><canvas id="chart-tab-macd" style="width: 100%; height: 140px; display: block;"></canvas></div>' +
      '</div>';

    container.innerHTML = html;
    if (window.App.Forecast) window.App.Forecast.mount(container.querySelector('#forecast-slot'), stock, closes, currentPeriod);
    
    bindTerms(container);
    bindPeriodPills(container, stock, hist);

    // Toolbar Tool-Events
    container.querySelectorAll('#chart-tools-toolbar .chip-btn').forEach(function(btn) {
      btn.onclick = function() {
        var tool = btn.getAttribute('data-tool');
        activeTools[tool] = !activeTools[tool]; 
        buildView(container, stock, hist); // Chart mit neuen Overlays re-rendern
        
        if (tool === 'pattern' && activeTools.pattern) {
          var p = detectPatterns(closes, tail);
          if (p) alert("Muster erkannt: " + p.type + " bei " + window.App.Format.currency(p.val, currency));
          else {
            alert("Kein klares Doppel-Top/Boden Muster im gewählten Zeitraum erkannt.");
            activeTools.pattern = false;
            buildView(container, stock, hist);
          }
        }
      };
    });

    // -------------------------------------------------------------------------
    // Chart.js Rendering (inkl. aktivierter Tools)
    // -------------------------------------------------------------------------
    var labels = slicedDates.map(shortLabel);
    var seriesArr = [
      { name: 'Kurs', color: COLORS.price, values: slicedCloses, width: 2 },
      { name: 'SMA 50', color: COLORS.sma50, values: s50.slice(-tail), width: 1.5 },
      { name: 'SMA 200', color: COLORS.sma200, values: s200.slice(-tail), width: 1.5 }
    ];

    if (activeTools.bollinger) {
      var bb = bollingerBands(closes, 20, 2);
      seriesArr.push({ name: 'BB Up', color: 'rgba(16,185,129,0.5)', values: bb.up.slice(-tail), width: 1, dash: [4, 4] });
      seriesArr.push({ name: 'BB Dn', color: 'rgba(239,68,68,0.5)', values: bb.dn.slice(-tail), width: 1, dash: [4, 4] });
    }

    if (activeTools.vwap) {
      var vwapData = anchoredVwap(closes, vols, closes.length - tail);
      seriesArr.push({ name: 'VWAP', color: 'var(--accent-purple-light)', values: vwapData.slice(-tail), width: 2, dash: [2, 2] });
    }

    if (activeTools.fibo) {
      var fDiff = hi - lo;
      [0.382, 0.5, 0.618].forEach(function(lvl) {
        var val = hi - (fDiff * lvl);
        seriesArr.push({ name: 'Fib ' + (lvl*100).toFixed(1)+'%', color: 'rgba(236,72,153,0.7)', values: new Array(tail).fill(val), width: 1, dash: [2, 4] });
      });
    }

    if (activeTools.sr) {
      seriesArr.push({ name: 'Res', color: 'rgba(239,68,68,0.7)', values: new Array(tail).fill(hi), width: 1.5, dash: [10, 5] });
      seriesArr.push({ name: 'Sup', color: 'rgba(16,185,129,0.7)', values: new Array(tail).fill(lo), width: 1.5, dash: [10, 5] });
    }

    if (activeTools.pivot) {
      var pivs = pivotPoints(hi, lo, price);
      seriesArr.push({ name: 'Pivot', color: '#a855f7', values: new Array(tail).fill(pivs.p), width: 1.5, dash: [5, 5] });
      seriesArr.push({ name: 'R1', color: 'rgba(239,68,68,0.5)', values: new Array(tail).fill(pivs.r1), width: 1, dash: [5, 5] });
      seriesArr.push({ name: 'S1', color: 'rgba(16,185,129,0.5)', values: new Array(tail).fill(pivs.s1), width: 1, dash: [5, 5] });
    }

    window.App.Charts.renderMultiLineChart(document.getElementById('chart-tab-price'), {
      labels: labels,
      series: seriesArr,
      formatY: function (v) { return window.App.Format.currency(v, currency, 0); }
    });

    if (activeTools.rr) {
       toggleRiskRewardOverlay(container, price, currency);
    }

    drawCandles(container, hist, currency);
    container.querySelectorAll('#candle-range-pills .pill-btn').forEach(function (pill) {
      pill.onclick = function () {
        candleWeeks = parseInt(pill.getAttribute('data-weeks'), 10) || 52;
        container.querySelectorAll('#candle-range-pills .pill-btn').forEach(function (b) { b.classList.remove('active'); });
        pill.classList.add('active');
        drawCandles(container, hist, currency);
      };
    });

    window.App.Charts.renderIndicatorChart(document.getElementById('chart-tab-rsi'), {
      labels: labels,
      lines: [{ values: rsiArr.slice(-tail), color: COLORS.rsi }],
      refLines: [{ value: 70, color: 'rgba(239, 68, 68, 0.6)' }, { value: 30, color: 'rgba(16, 185, 129, 0.6)' }],
      min: 0, max: 100,
      formatY: function (v) { return String(Math.round(v)); }
    });

    window.App.Charts.renderIndicatorChart(document.getElementById('chart-tab-macd'), {
      labels: labels,
      lines: [{ values: m.line.slice(-tail), color: COLORS.macd }, { values: m.signal.slice(-tail), color: COLORS.signal }],
      bars: m.hist.slice(-tail),
      refLines: [{ value: 0, color: 'rgba(255, 255, 255, 0.25)' }],
      formatY: function (v) { return fmt(v, Math.abs(v) < 10 ? 1 : 0); }
    });
  }

  function bindPeriodPills(container, stock, hist) {
    var pills = container.querySelectorAll('#chart-period-pills .pill-btn');
    pills.forEach(function (pill) {
      pill.onclick = function () {
        currentPeriod = pill.getAttribute('data-period');
        buildView(container, stock, hist);
      };
    });
  }

  function has(x) { return x !== null && x !== undefined && isFinite(x); }

  function auffaelligkeiten(stock) {
    var r = stock.ratios || {}, q = stock.quote || {};
    var plus = [], minus = [];
    if (has(r.peTrailing) && r.peTrailing > 0 && r.peTrailing < 12) plus.push({ t: 'KGV unter 12', d: 'Niedrige Bewertung.' });
    if (has(r.profitMargins) && r.profitMargins > 0.2) plus.push({ t: 'Marge über 20 %', d: 'Sehr profitabel.' });
    if (has(r.profitMargins) && r.profitMargins < 0) minus.push({ t: 'Verlust', d: 'Negative Marge.' });
    return { plus: plus, minus: minus };
  }

  function auffColHtml(items, emptyText) {
    if (!items.length) return '<div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 8px;">' + emptyText + '</div>';
    return items.map(function (it) {
      return '<div style="margin-top: 8px;"><div style="font-size: 0.8rem; font-weight: 600; color: var(--text-main);">' + termLink(it.t) + '</div>' +
        '<div style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; margin-top: 2px;">' + it.d + '</div></div>';
    }).join('');
  }

  var GLOSSARY = {
    KGV: { name: 'KGV', text: 'Kurs-Gewinn-Verhältnis.' },
    RSI: { name: 'RSI', text: 'Relative Strength Index (über 70 = überkauft).' }
  };

  var TERM_RULES = [[/^KGV/, 'KGV'], [/^RSI/, 'RSI']];

  function termKeyFor(label) {
    for (var i = 0; i < TERM_RULES.length; i++) if (TERM_RULES[i][0].test(label)) return TERM_RULES[i][1];
    return null;
  }

  function termLink(label) {
    var key = termKeyFor(label);
    if (!key || !GLOSSARY[key]) return label;
    return '<span class="term-link" data-term="' + key + '" style="cursor: pointer; border-bottom: 1px dotted var(--text-dim);">' + label + ' ⓘ</span>';
  }

  function bindTerms(container) {
    if (container.__termBound) return;
    container.__termBound = true;
    container.addEventListener('click', function (ev) {
      var link = ev.target && ev.target.closest ? ev.target.closest('.term-link') : null;
      if (!link) return;
      var key = link.getAttribute('data-term');
      if (GLOSSARY[key]) alert(GLOSSARY[key].name + ": " + GLOSSARY[key].text);
    });
  }

  return {
    render: render,
    _sma: sma,
    _ema: ema,
    _rsi: rsi,
    _macd: macd,
    _bottom: bottomCheck
  };
})();

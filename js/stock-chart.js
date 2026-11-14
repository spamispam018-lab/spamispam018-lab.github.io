/**
 * js/stock-chart.js
 * Chart-Analyse-Tab.
 * NEU: Bessere Fehlermeldung bei der KGV-Historie (z.B. wenn das Unternehmen Verluste schreibt).
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
        var o = prevClose !== null ? prevClose : p.close;
        cur = { key: k, date: p.date, o: o, h: Math.max(o, p.close), l: Math.min(o, p.close), c: p.close };
      } else {
        cur.h = Math.max(cur.h, p.close);
        cur.l = Math.min(cur.l, p.close);
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

  function shortLabel(iso) {
    var d = String(iso || '');
    return d.slice(5, 7) + '/' + d.slice(2, 4);
  }

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
      { ok: sinceLow >= 15, text: 'Kein neues 60-Tage-Tief seit ' + sinceLow + ' Handelstagen (Ziel: ≥ 15)' },
      { ok: Math.min.apply(null, c.slice(-20)) > Math.min.apply(null, c.slice(-60, -20)), text: 'Höheres Tief (letzte 20 Tage über dem Tief davor)' },
      { ok: px > s20, text: 'Kurs ' + (px > s20 ? 'über' : 'unter') + ' der 20-Tage-Linie' },
      { ok: s20 >= s20b, text: '20-Tage-Linie ' + (s20 >= s20b ? 'steigt / flach' : 'fällt noch') },
      { ok: ml !== null && ms !== null && ml > ms, text: 'MACD ' + (ml > ms ? 'über' : 'unter') + ' Signallinie' },
      { ok: rOk, text: 'RSI ' + (r0 !== null ? Math.round(r0) : '–') + (rOk ? ' (≥ 40 und steigend)' : ' (noch schwach oder fallend)') }
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
    var note = '<div class="chart-note">Feste Regeln auf Basis vergangener Kurse, keine Anlageberatung. Ein Boden ist erst im Nachhinein sicher erkennbar.</div></div>';
    if (!b) return head + '</div><p style="font-size:.78rem;color:var(--text-muted);">Zu wenige Kursdaten.</p>' + note;
    if (!b.state) return head + '</div><p style="font-size:.78rem;color:var(--text-muted);">Kurs liegt nur ' + Math.abs(b.dd * 100).toFixed(0) + ' % unter dem 52W-Hoch – kein nennenswerter Rückgang, der Check ist nicht relevant.</p>' + note;
    var V = { base: ['Bodenbildung möglich', 'badge-bullish'], knife: ['Fallendes Messer', 'badge-bearish'], wait: ['Unklar – abwarten', 'badge-neutral'] }[b.state];
    var rows = b.signals.map(function (s) {
      return '<div class="chart-signal-row"><span class="chart-dot" style="background:' + (s.ok ? 'var(--bullish)' : 'var(--text-dim)') + ';"></span>' +
        '<div class="chart-signal-text"><div class="chart-signal-value">' + (s.ok ? '✓ ' : '✗ ') + s.text + '</div></div></div>';
    }).join('');
    return head + '<span class="badge-pill ' + V[1] + '">' + V[0] + '</span></div>' +
      '<div style="font-size:.72rem;color:var(--text-dim);margin-bottom:6px;">' + b.score + ' von 6 Stabilisierungs-Signalen · ' + Math.abs(b.dd * 100).toFixed(0) + ' % unter dem 52W-Hoch</div>' +
      '<div class="chart-signal-list">' + rows + '</div>' + note;
  }

  function render(container, stock) {
    if (!container || !stock) return;
    var hist = (stock.chartHistory || []).filter(function (p) { return p && p.close > 0; });
    if (hist.length < 60) {
      container.innerHTML = '<div class="card"><p style="color: var(--text-muted); font-size: 0.85rem;">Für die Chart-Analyse liegen noch zu wenige Kursdaten vor.</p></div>';
      return;
    }
    buildView(container, stock, hist);
  }

  function buildView(container, stock, hist) {
    var currency = (stock.quote && stock.quote.currency) || 'EUR';
    var closes = hist.map(function (p) { return p.close; });
    var dates = hist.map(function (p) { return p.date; });
    var vols = hist.map(function (p) { return p.volume || 0; });
    var n = closes.length, price = closes[n - 1];

    var s50 = sma(closes, 50), s200 = sma(closes, 200);
    var rsiArr = rsi(closes, 14), m = macd(closes);

    var tail = n;
    var spanDays = { '1W': 7, '1M': 30, '3M': 91, '6M': 182, '1Y': 365 }[currentPeriod];
    if (spanDays && n > 0) {
      var tEnd = new Date(dates[n - 1] + 'T00:00:00Z');
      tEnd.setUTCDate(tEnd.getUTCDate() - spanDays);
      var cutoffStr = tEnd.toISOString().slice(0, 10);
      var startIdx = 0;
      for (var di = 0; di < n; di++) { if (dates[di] <= cutoffStr) startIdx = di; else break; }
      tail = n - startIdx;
    }

    var slicedCloses = closes.slice(-tail), slicedDates = dates.slice(-tail);
    var s50Last = lastValid(s50), s200Last = lastValid(s200);
    var rsiLast = lastValid(rsiArr), macdLast = lastValid(m.line), sigLast = lastValid(m.signal);
    var cross = findLastCross(s50, s200, dates);

    var momVal = null;
    if (slicedCloses.length > 0 && slicedCloses[0] > 0) momVal = (price / slicedCloses[0] - 1) * 100;

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
      var rsiState = 'neutral', rsiTxt = fmt(rsiLast, 0);
      if (rsiLast >= 70) rsiTxt += ' – überkauft (Rücksetzer-Risiko)';
      else if (rsiLast <= 30) rsiTxt += ' – überverkauft (mögliche Erholung)';
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
    var rated = bulls + bears, ratio = rated > 0 ? bulls / rated : 0.5;
    var overall = 'Seitwärts / gemischt', overallCls = 'badge-neutral';
    if (ratio >= 0.67) { overall = 'Aufwärtstrend'; overallCls = 'badge-bullish'; }
    else if (ratio <= 0.33) { overall = 'Abwärtstrend'; overallCls = 'badge-bearish'; }

    var signalRows = signals.map(function (s) {
      return '<div class="chart-signal-row"><span class="chart-dot" style="background:' + COLORS[s.state] + ';"></span>' +
        '<div class="chart-signal-text"><div class="chart-signal-label">' + termLink(s.label) + '</div>' +
        '<div class="chart-signal-value">' + s.text + '</div></div></div>';
    }).join('');

    signals.forEach(function (sg) {
      if (sg.state === 'bull') auff.plus.push({ t: sg.label, d: sg.text });
      else if (sg.state === 'bear') auff.minus.push({ t: sg.label, d: sg.text });
    });
    if (rsiLast !== null && rsiLast >= 70) auff.minus.push({ t: 'RSI überkauft', d: 'RSI bei ' + fmt(rsiLast, 0) + '.' });
    else if (rsiLast !== null && rsiLast <= 30) auff.minus.push({ t: 'RSI überverkauft', d: 'RSI bei ' + fmt(rsiLast, 0) + '.' });

    var rets = [];
    for (var i = 1; i < slicedCloses.length; i++) rets.push(slicedCloses[i] / slicedCloses[i - 1] - 1);
    var vol = stdev(rets) * Math.sqrt(252) * 100;
    var mdd = maxDrawdown(slicedCloses);

    var hi = Math.max.apply(null, slicedCloses), lo = Math.min.apply(null, slicedCloses);
    var fromHigh = hi > 0 ? (price / hi - 1) * 100 : 0;
    var fromLow = lo > 0 ? (price / lo - 1) * 100 : 0;
    var support = lo, resistance = hi;

    var volAvg20 = avg(vols.slice(-20)), volAvg60 = avg(vols.slice(-60));
    var volTrend = volAvg60 > 0 ? (volAvg20 / volAvg60 - 1) * 100 : null;

    var html = '' +
      '<div class="card" style="padding: 10px 16px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">' +
        '<span style="font-size: 0.78rem; font-weight: 600; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em;">Analyse-Zeitraum</span>' +
        '<div class="pill-group" id="chart-period-pills">' +
          '<button class="pill-btn ' + (currentPeriod === '1W' ? 'active' : '') + '" data-period="1W">1W</button>' +
          '<button class="pill-btn ' + (currentPeriod === '1M' ? 'active' : '') + '" data-period="1M">1M</button>' +
          '<button class="pill-btn ' + (currentPeriod === '3M' ? 'active' : '') + '" data-period="3M">3M</button>' +
          '<button class="pill-btn ' + (currentPeriod === '6M' ? 'active' : '') + '" data-period="6M">6M</button>' +
          '<button class="pill-btn ' + (currentPeriod === '1Y' ? 'active' : '') + '" data-period="1Y">1J</button>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">Technisches Bild</span>' +
          '<span class="badge-pill ' + overallCls + '">' + overall + '</span></div>' +
        '<div class="chart-signal-list">' + signalRows + '</div>' +
        '<div class="chart-note">' + bulls + ' von ' + rated + ' Signalen positiv. Reine Auswertung vergangener Kurse, keine Anlageberatung.</div>' +
      '</div>' +

      bottomCardHtml(bottomCheck(closes)) +
      '<div id="forecast-slot"></div>' +
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">Auffälligkeiten</span><span class="period-tag">Kennzahlen &amp; Chart</span></div>' +
        '<div class="auff-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px;">' +
          '<div class="auff-col auff-col-plus"><div class="auff-col-head">Auffällig günstig / stark</div>' + auffColHtml(auff.plus, 'Keine Auffälligkeit nach diesen Kriterien.') + '</div>' +
          '<div class="auff-col auff-col-minus"><div class="auff-col-head">Auffällig teuer / schwach</div>' + auffColHtml(auff.minus, 'Keine Auffälligkeit nach diesen Kriterien.') + '</div>' +
        '</div>' +
        '<div class="chart-note">Feste Regeln, keine Bewertung und keine Anlageberatung.</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">Kurs &amp; Trendlinien</span><span class="period-tag">' + pLabel + '</span></div>' +
        '<div style="height: 220px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="chart-tab-price" style="width: 100%; height: 220px; display: block;"></canvas>' +
        '</div>' +
        '<div class="legend-row">' + legendItem(COLORS.price, 'Kurs') + legendItem(COLORS.sma50, 'SMA 50') + legendItem(COLORS.sma200, 'SMA 200') + '</div>' +
      '</div>' +

      // KGV-Band-Chart
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">KGV-Historie (5 Jahre)</span>' +
          '<span class="period-tag" id="pe-current-label">—</span></div>' +
        '<div style="height: 200px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="chart-tab-pe-band" style="width: 100%; height: 200px; display: block;"></canvas>' +
        '</div>' +
        '<div class="chart-note">KGV aus Kurs × ausstehende Aktien ÷ TTM-Gewinn (rollierend über 4 Quartale). Bänder zeigen Perzentile der letzten 5 Jahre.</div>' +
      '</div>' +

      '<div id="chart-analyse-slot"></div>' +

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
        '<div class="legend-row">' + legendItem('#10b981', 'Woche im Plus') + legendItem('#ef4444', 'Woche im Minus') + legendItem(COLORS.sma50, '10-Wochen-Linie') + '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">RSI (14)</span>' +
          '<span class="period-tag">' + (rsiLast !== null ? fmt(rsiLast, 0) : '—') + '</span></div>' +
        '<div style="height: 130px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="chart-tab-rsi" style="width: 100%; height: 130px; display: block;"></canvas>' +
        '</div>' +
        '<div class="chart-note">Über 70 = überkauft, unter 30 = überverkauft.</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">MACD (12/26/9)</span><span class="period-tag">' + pLabel + '</span></div>' +
        '<div style="height: 140px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="chart-tab-macd" style="width: 100%; height: 140px; display: block;"></canvas>' +
        '</div>' +
        '<div class="legend-row">' + legendItem(COLORS.macd, 'MACD') + legendItem(COLORS.signal, 'Signal') + legendItem('rgba(16,185,129,0.7)', 'Histogramm') + '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">Risiko &amp; Volumen</span><span class="period-tag">' + pLabel + '</span></div>' +
        '<div class="metrics-grid-2col" style="margin-bottom: 0;">' +
          metric('Volatilität p. a.', fmt(vol, 1) + ' %') +
          metric('Max. Drawdown', fmt(mdd, 1) + ' %') +
          metric('Abstand zum Hoch', pct(fromHigh)) +
          metric('Abstand zum Tief', pct(fromLow)) +
          metric('Volumen 20T vs. 60T', volTrend === null ? '—' : pct(volTrend, 0)) +
          metric('Unterstützung', window.App.Format.currency(support, currency, 2)) +
          metric('Widerstand', window.App.Format.currency(resistance, currency, 2)) +
          metric('Schlusskurs', window.App.Format.currency(price, currency, 2)) +
        '</div>' +
      '</div>';

    container.innerHTML = html;
    if (window.App.ChartAnalyse) window.App.ChartAnalyse.mount(container.querySelector('#chart-analyse-slot'), stock, currentPeriod);
    if (window.App.Forecast) window.App.Forecast.mount(container.querySelector('#forecast-slot'), stock, closes, currentPeriod);

    bindTerms(container);
    bindPeriodPills(container, stock, hist);

    var labels = slicedDates.map(shortLabel);
    var Charts = window.App.Charts;
    var cur = currency;

    Charts.renderMultiLineChart(document.getElementById('chart-tab-price'), {
      labels: labels,
      series: [
        { name: 'Kurs', color: COLORS.price, values: slicedCloses, width: 2 },
        { name: 'SMA 50', color: COLORS.sma50, values: s50.slice(-tail), width: 1.5 },
        { name: 'SMA 200', color: COLORS.sma200, values: s200.slice(-tail), width: 1.5 }
      ],
      formatY: function (v) { return window.App.Format.currency(v, cur, 0); }
    });

    drawCandles(container, hist, cur);
    container.querySelectorAll('#candle-range-pills .pill-btn').forEach(function (pill) {
      pill.onclick = function () {
        candleWeeks = parseInt(pill.getAttribute('data-weeks'), 10) || 52;
        container.querySelectorAll('#candle-range-pills .pill-btn').forEach(function (b) { b.classList.remove('active'); });
        pill.classList.add('active');
        drawCandles(container, hist, cur);
      };
    });

    Charts.renderIndicatorChart(document.getElementById('chart-tab-rsi'), {
      labels: labels,
      lines: [{ values: rsiArr.slice(-tail), color: COLORS.rsi }],
      refLines: [
        { value: 70, color: 'rgba(239, 68, 68, 0.6)' },
        { value: 30, color: 'rgba(16, 185, 129, 0.6)' }
      ],
      min: 0, max: 100,
      formatY: function (v) { return String(Math.round(v)); }
    });

    Charts.renderIndicatorChart(document.getElementById('chart-tab-macd'), {
      labels: labels,
      lines: [
        { values: m.line.slice(-tail), color: COLORS.macd },
        { values: m.signal.slice(-tail), color: COLORS.signal }
      ],
      bars: m.hist.slice(-tail),
      refLines: [{ value: 0, color: 'rgba(255, 255, 255, 0.25)' }],
      formatY: function (v) { return fmt(v, Math.abs(v) < 10 ? 1 : 0); }
    });

    drawPEBand(container, stock, cur);
  }

  // NEU: Verbesserte Fehlermeldung bei der KGV-Historie
  function drawPEBand(container, stock, cur) {
    var canvas = container.querySelector('#chart-tab-pe-band');
    if (!canvas) return;

    var hist = (stock.chartHistory || []).filter(function (p) { return p && p.close > 0; });
    var incQ = (((stock.financials || {}).incomeStatement || {}).quarterly) || [];
    
    // Prüfen, ob genug Daten vorhanden sind
    if (hist.length < 200 || incQ.length < 4) {
      canvas.parentElement.innerHTML = '<div class="state-box" style="padding:20px;"><p style="font-size:0.78rem;color:var(--text-dim);">Zu wenige Daten für KGV-Historie (mind. 200 Kurstage und 4 Quartalsberichte).</p></div>';
      return;
    }

    var quarters = incQ
      .filter(function (q) { return q && q.date && q.Net_Income !== null && q.Net_Income !== undefined; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    if (quarters.length < 4) {
      canvas.parentElement.innerHTML = '<div class="state-box" style="padding:20px;"><p style="font-size:0.78rem;color:var(--text-dim);">Zu wenige Quartalsdaten für KGV-Historie.</p></div>';
      return;
    }

    var shares = (stock.quote.marketCap && stock.quote.price) ? stock.quote.marketCap / stock.quote.price : null;
    if (!shares) {
      canvas.parentElement.innerHTML = '<div class="state-box" style="padding:20px;"><p style="font-size:0.78rem;color:var(--text-dim);">Marktkapitalisierung fehlt zur Berechnung.</p></div>';
      return;
    }

    function ttmEarningsAt(dateStr) {
      var cutoff = dateStr;
      var known = quarters.filter(function (q) {
        var qd = new Date(q.date + 'T00:00:00Z');
        qd.setUTCDate(qd.getUTCDate() + 45);
        return qd.toISOString().slice(0, 10) <= cutoff;
      });
      if (known.length < 4) return null;
      var last4 = known.slice(-4);
      var sum = last4.reduce(function (a, q) { return a + Number(q.Net_Income || 0); }, 0);
      
      // FIX: Wenn der Gewinn negativ ist, geben wir null zurück (KGV nicht berechenbar)
      if (!(sum > 0)) return null; 
      return sum;
    }

    var lastDate = hist[hist.length - 1].date;
    var cutoff5y = (parseInt(lastDate.slice(0, 4), 10) - 5) + lastDate.slice(4);
    var relevant = hist.filter(function (p) { return p.date >= cutoff5y; });

    var pePoints = [];
    var labels = [];
    var step = Math.max(1, Math.floor(relevant.length / 100));
    var hasNegativeEarnings = false;

    for (var i = 0; i < relevant.length; i += step) {
      var p = relevant[i];
      var ttm = ttmEarningsAt(p.date);
      
      // Prüfen ob es negative Gewinne gibt (für die Fehlermeldung)
      if (ttm === null) {
         // Grobe Schätzung, ob wir in einem Verlustjahr sind
         hasNegativeEarnings = true;
      }
      
      if (ttm && shares && p.close > 0) {
        var mcap = p.close * shares;
        var pe = mcap / ttm;
        if (pe > 0 && pe < 200) {
          pePoints.push(pe);
          labels.push(p.date.slice(5, 7) + '/' + p.date.slice(0, 4));
        }
      }
    }

    // NEU: Spezifische Fehlermeldung, wenn das Unternehmen Verluste schreibt
    if (pePoints.length < 5) {
      var errorText = hasNegativeEarnings 
        ? "Das KGV kann nicht berechnet werden, da das Unternehmen in den letzten Jahren Verluste geschrieben hat (negativer Gewinn)."
        : "KGV-Historie konnte nicht berechnet werden (zu wenige positive Gewinndaten).";
      
      canvas.parentElement.innerHTML = '<div class="state-box" style="padding:20px; text-align:center;">' +
        '<div style="font-size:1.5rem; margin-bottom:8px;">⚠️</div>' +
        '<p style="font-size:0.78rem;color:var(--text-dim); line-height:1.4;">' + errorText + '</p></div>';
      return;
    }

    var sortedPE = pePoints.slice().sort(function (a, b) { return a - b; });
    function percentile(arr, p) {
      var idx = (arr.length - 1) * p;
      var lo = Math.floor(idx), hi = Math.ceil(idx);
      if (lo === hi) return arr[lo];
      return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
    }

    var p25 = percentile(sortedPE, 0.25);
    var p50 = percentile(sortedPE, 0.50);
    var p75 = percentile(sortedPE, 0.75);
    var currentPE = pePoints[pePoints.length - 1];

    var labelEl = container.querySelector('#pe-current-label');
    if (labelEl) {
      var position = currentPE <= p25 ? 'unteres Quartil' : currentPE <= p50 ? 'unteres Mittelfeld' : currentPE <= p75 ? 'oberes Mittelfeld' : 'oberes Quartil';
      labelEl.textContent = 'Aktuell: ' + window.App.Format.number(currentPE, 1) + ' (' + position + ')';
    }

    window.App.Charts.renderBandChart(canvas, {
      labels: labels,
      peValues: pePoints,
      bands: [
        { value: p25, color: 'rgba(16,185,129,0.6)', label: '25%: ' + window.App.Format.number(p25, 1) },
        { value: p50, color: 'rgba(245,158,11,0.6)', label: 'Median: ' + window.App.Format.number(p50, 1) },
        { value: p75, color: 'rgba(239,68,68,0.6)', label: '75%: ' + window.App.Format.number(p75, 1) }
      ],
      formatY: function (v) { return window.App.Format.number(v, 1); }
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
    var r = stock.ratios || {};
    var q = stock.quote || {};
    var plus = [], minus = [];
    var pe = r.peTrailing, peg = r.pegRatio, pm = r.profitMargins;
    var de = r.debtToEquity, g = r.revenueGrowth;
    var lo = q.fiftyTwoWeekLow, hi = q.fiftyTwoWeekHigh, px = q.price;
    var rangePos = (has(lo) && has(hi) && has(px) && hi > lo) ? (px - lo) / (hi - lo) * 100 : null;

    if (has(pe) && pe > 0 && pe < 12) plus.push({ t: 'KGV unter 12', d: 'Der Preis liegt beim ' + fmt(pe, 1) + '-fachen des letzten Jahresgewinns.' });
    if (has(peg) && peg > 0 && peg < 1) plus.push({ t: 'PEG unter 1', d: 'KGV im Verhältnis zum erwarteten Gewinnwachstum niedrig.' });
    if (has(pm) && pm > 0.2) plus.push({ t: 'Gewinnmarge über 20 %', d: 'Vom Umsatz bleiben mehr als 20 Cent je Euro als Gewinn.' });
    if (has(g) && g > 0.10) plus.push({ t: 'Umsatzwachstum über 10 %', d: 'Der Umsatz ist im letzten Jahr deutlich gewachsen.' });

    if (has(pm) && pm < 0) minus.push({ t: 'Verlust', d: 'Die Gewinnmarge ist negativ.' });
    if (has(de) && de > 150) minus.push({ t: 'Hohe Verschuldung', d: 'Schulden über 150 % des Eigenkapitals.' });
    if (has(g) && g < 0) minus.push({ t: 'Umsatz schrumpft', d: 'Der Umsatz ist im letzten Jahr gesunken.' });
    if (has(pe) && pe > 35) minus.push({ t: 'KGV über 35', d: 'Der Preis liegt beim ' + fmt(pe, 1) + '-fachen des letzten Jahresgewinns.' });
    if (has(peg) && peg > 2) minus.push({ t: 'PEG über 2', d: 'Preis im Verhältnis zum erwarteten Wachstum hoch.' });
    if (rangePos !== null && rangePos <= 10) minus.push({ t: 'Kurs nahe am Jahrestief', d: 'Unterstes Zehntel der 52-Wochen-Spanne.' });

    return { plus: plus, minus: minus };
  }

  var GLOSSARY = {
    KGV: { name: 'KGV', text: 'Kurs geteilt durch Gewinn je Aktie der letzten zwölf Monate.' },
    PEG: { name: 'PEG', text: 'KGV geteilt durch erwartetes Gewinnwachstum. Unter 1 = günstig, über 2 = hoch.' },
    Gewinnmarge: { name: 'Gewinnmarge', text: 'Anteil des Gewinns am Umsatz in Prozent.' },
    Verschuldung: { name: 'Verschuldung (D/E)', text: 'Fremdkapital im Verhältnis zum Eigenkapital.' },
    Umsatzwachstum: { name: 'Umsatzwachstum', text: 'Prozentuale Veränderung des Umsatzes gegenüber dem Vorjahr.' },
    Verlust: { name: 'Verlust', text: 'Das Unternehmen hat mehr ausgegeben als eingenommen.' },
    Spanne: { name: '52-Wochen-Spanne', text: 'Spanne zwischen 52W-Tief und 52W-Hoch.' },
    SMA: { name: 'SMA', text: 'Gleitender Durchschnitt der letzten 50 bzw. 200 Handelstage.' },
    Cross: { name: 'Golden/Death Cross', text: 'Golden Cross: SMA 50 kreuzt SMA 200 von unten. Death Cross: umgekehrt.' },
    RSI: { name: 'RSI (14)', text: 'Skala 0-100. Über 70 = überkauft, unter 30 = überverkauft.' },
    MACD: { name: 'MACD', text: 'Differenz zweier gleitender Durchschnitte.' },
    Momentum: { name: 'Momentum', text: 'Prozentuale Kursveränderung im gewählten Zeitraum.' },
    Volatilität: { name: 'Volatilität', text: 'Wie stark der Kurs schwankt, annualisiert.' },
    Drawdown: { name: 'Drawdown', text: 'Größter Rückgang vom Hoch zum Tief.' },
    Volumen: { name: 'Volumentrend', text: 'Vergleicht 20-Tage-Durchschnitt mit 60-Tage-Durchschnitt.' },
    Support: { name: 'Unterstützung/Widerstand', text: 'Tiefster bzw. höchster Kurs im Zeitraum.' }
  };

  var TERM_RULES = [
    [/^KGV/, 'KGV'], [/PEG/, 'PEG'], [/Gewinnmarge/, 'Gewinnmarge'], [/Verschuldung/, 'Verschuldung'],
    [/Umsatz/, 'Umsatzwachstum'], [/Verlust/, 'Verlust'], [/Jahrestief|Spanne/, 'Spanne'],
    [/RSI/, 'RSI'], [/MACD/, 'MACD'], [/Kreuz|Golden|Death|SMA 50 vs/, 'Cross'], [/SMA|Tage-Linie/, 'SMA'],
    [/Momentum/, 'Momentum'], [/Volatilität/, 'Volatilität'], [/Drawdown/, 'Drawdown'], [/Volumen/, 'Volumen'],
    [/Unterstützung|Widerstand/, 'Support']
  ];

  function termKeyFor(label) {
    for (var i = 0; i < TERM_RULES.length; i++) if (TERM_RULES[i][0].test(label)) return TERM_RULES[i][1];
    return null;
  }

  function termLink(label) {
    var key = termKeyFor(label);
    if (!key || !GLOSSARY[key]) return label;
    return '<span class="term-link" data-term="' + key + '" style="cursor: pointer; border-bottom: 1px dotted var(--text-dim);">' +
      label + ' <span style="font-size: 0.7em; opacity: 0.6;">ⓘ</span></span>';
  }

  function bindTerms(container) {
    if (container.__termBound) return;
    container.__termBound = true;
    container.addEventListener('click', function (ev) {
      var link = ev.target && ev.target.closest ? ev.target.closest('.term-link') : null;
      if (!link) return;
      var key = link.getAttribute('data-term');
      var card = link.closest('.card');
      if (!card || !GLOSSARY[key]) return;
      var box = container.querySelector('#term-info');
      if (box && box.getAttribute('data-term') === key && box.previousElementSibling === card) {
        box.parentNode.removeChild(box); return;
      }
      if (!box) { box = document.createElement('div'); box.id = 'term-info'; }
      box.setAttribute('data-term', key);
      box.setAttribute('style', 'margin: -6px 0 16px; padding: 12px 14px; border-radius: var(--radius-sm); background-color: var(--bg-secondary); border: 1px solid var(--border-subtle); font-size: 0.8rem; color: var(--text-main); line-height: 1.45;');
      box.innerHTML = '<div style="font-weight: 700; margin-bottom: 4px;">' + GLOSSARY[key].name + '</div>' + GLOSSARY[key].text;
      card.parentNode.insertBefore(box, card.nextSibling);
    });
  }

  function auffColHtml(items, emptyText) {
    if (!items.length) return '<div class="auff-empty">' + emptyText + '</div>';
    return items.map(function (it) {
      return '<div class="auff-item"><div class="auff-item-title">' + termLink(it.t) + '</div>' +
        '<div class="auff-item-text">' + it.d + '</div></div>';
    }).join('');
  }

  function avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
  }

  function legendItem(color, label) {
    return '<div class="legend-item"><span class="legend-dot" style="background:' + color + ';"></span><span>' + label + '</span></div>';
  }

  function metric(label, value) {
    return '<div class="metric-cell"><span class="metric-label">' + termLink(label) + '</span>' +
      '<span class="metric-value">' + value + '</span></div>';
  }

  return {
    render: render,
    _sma: sma, _ema: ema, _rsi: rsi, _macd: macd, _bottom: bottomCheck
  };
})();
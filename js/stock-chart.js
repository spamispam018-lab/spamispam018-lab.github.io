/**
 * js/stock-chart.js
 * Chart-Analyse-Tab der Aktiendetailseite (nach "Overview"):
 * - Steuerung des Analyse-Zeitraums (1W, 1M, 3M, 6M, 1J)
 * - Technisches Bild (Signale zu SMA 50/200, RSI, MACD, dynamisches Momentum)
 * - Kurs mit gleitenden Durchschnitten (SMA 50 / SMA 200)
 * - RSI (14) und MACD (12/26/9)
 * - Risiko & Volumen (Volatilität, Drawdown, Abstand zu Hoch/Tief, Volumentrend, Unterstützung/Widerstand)
 *
 * Alle Indikatoren werden im Browser aus stock.chartHistory (Tagesschlusskurse) berechnet.
 */

window.App = window.App || {};

window.App.StockChart = (function () {
  'use strict';

  var currentPeriod = '1Y'; // Default Zeitraum
  var candleWeeks = 52;     // Anzahl Wochenkerzen (26 = 6M, 52 = 1J, 104 = 2J)

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
  // Indikator-Berechnungen
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

  // ---------------------------------------------------------------------------
  // Formatierung
  // ---------------------------------------------------------------------------

  function fmt(v, d) { return window.App.Format.number(v, d === undefined ? 1 : d); }
  function pct(v, d) { return (v >= 0 ? '+' : '') + fmt(v, d) + ' %'; }

  function deDate(iso) {
    if (!iso || iso.length < 10) return '';
    return iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);
  }

  // ---------------------------------------------------------------------------
  // Wochenkerzen (aus Tagesschlusskursen)
  // ---------------------------------------------------------------------------
  function weekKey(iso) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Montag der Woche
    return d.toISOString().slice(0, 10);
  }

  /**
   * Eröffnung = Schlusskurs der Vorwoche, Schluss = letzter Schlusskurs der Woche,
   * Hoch/Tief = höchster/niedrigster Tagesschluss (inkl. Eröffnung).
   */
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

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  // Boden-Check: gleiche Regeln wie bottom_extras() in scripts/fetch_market_data.py
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

    // Indikatoren immer auf voller Historie berechnen
    var s50 = sma(closes, 50);
    var s200 = sma(closes, 200);
    var rsiArr = rsi(closes, 14);
    var m = macd(closes);

    // Daten auf den gewählten Zeitraum (currentPeriod) zuschneiden
    // Kalenderbasiert (wie Yahoo & Marktübersicht), Basis = letzter Schlusskurs am/vor dem Stichtag
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
    
    // Für Signale nehmen wir immer die aktuellsten (letzten) Werte der Indikatoren
    var s50Last = lastValid(s50);
    var s200Last = lastValid(s200);
    var rsiLast = lastValid(rsiArr);
    var macdLast = lastValid(m.line);
    var sigLast = lastValid(m.signal);
    var cross = findLastCross(s50, s200, dates);

    // Dynamisches Momentum bezogen auf den gewählten Zeitraum
    var momVal = null;
    if (slicedCloses.length > 0 && slicedCloses[0] > 0) {
        momVal = (price / slicedCloses[0] - 1) * 100;
    }
    
    var periodLabelMap = { '1W': '1 Woche', '1M': '1 Monat', '3M': '3 Monate', '6M': '6 Monate', '1Y': '1 Jahr' };
    var pLabel = periodLabelMap[currentPeriod];

    var auff = auffaelligkeiten(stock);

    // ---- Signale ----
    var signals = [];
    if (s200Last !== null) {
      var d200 = (price / s200Last - 1) * 100;
      signals.push({
        label: 'Kurs vs. 200-Tage-Linie',
        text: pct(d200) + (d200 >= 0 ? ' darüber' : ' darunter'),
        state: d200 >= 0 ? 'bull' : 'bear'
      });
    }
    if (s50Last !== null) {
      var d50 = (price / s50Last - 1) * 100;
      signals.push({
        label: 'Kurs vs. 50-Tage-Linie',
        text: pct(d50) + (d50 >= 0 ? ' darüber' : ' darunter'),
        state: d50 >= 0 ? 'bull' : 'bear'
      });
    }
    if (s50Last !== null && s200Last !== null) {
      var golden = s50Last > s200Last;
      var crossTxt = cross
        ? ' (letztes Kreuz: ' + (cross.type === 'golden' ? 'Golden Cross' : 'Death Cross') + ' am ' + deDate(cross.date) + ')'
        : '';
      signals.push({
        label: 'SMA 50 vs. SMA 200',
        text: (golden ? 'SMA 50 über SMA 200' : 'SMA 50 unter SMA 200') + crossTxt,
        state: golden ? 'bull' : 'bear'
      });
    }
    if (rsiLast !== null) {
      var rsiState = 'neutral';
      var rsiTxt = fmt(rsiLast, 0);
      if (rsiLast >= 70) { rsiTxt += ' – überkauft (Rücksetzer-Risiko)'; }
      else if (rsiLast <= 30) { rsiTxt += ' – überverkauft (mögliche Erholung)'; }
      else if (rsiLast >= 50) { rsiTxt += ' – positives Momentum'; rsiState = 'bull'; }
      else { rsiTxt += ' – schwaches Momentum'; rsiState = 'bear'; }
      signals.push({ label: 'RSI (14)', text: rsiTxt, state: rsiState });
    }
    if (macdLast !== null && sigLast !== null) {
      var macdBull = macdLast > sigLast;
      signals.push({
        label: 'MACD',
        text: macdBull ? 'MACD über Signallinie' : 'MACD unter Signallinie',
        state: macdBull ? 'bull' : 'bear'
      });
    }
    if (momVal !== null) {
      signals.push({
        label: 'Momentum ' + pLabel,
        text: pct(momVal),
        state: momVal >= 0 ? 'bull' : 'bear'
      });
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
        '<div class="chart-signal-value">' + s.text + '</div></div>' +
      '</div>';
    }).join('');

    // Chart-Erkenntnisse in die Auffälligkeiten übernehmen
    signals.forEach(function (sg) {
      if (sg.state === 'bull') auff.plus.push({ t: sg.label, d: sg.text });
      else if (sg.state === 'bear') auff.minus.push({ t: sg.label, d: sg.text });
    });
    if (rsiLast !== null && rsiLast >= 70) {
      auff.minus.push({ t: 'RSI überkauft', d: 'RSI bei ' + fmt(rsiLast, 0) + ': der Kurs ist kurzfristig stark gestiegen. Solche Stände gehen oft mit größeren Schwankungen einher.' });
    } else if (rsiLast !== null && rsiLast <= 30) {
      auff.minus.push({ t: 'RSI überverkauft', d: 'RSI bei ' + fmt(rsiLast, 0) + ': der Kurs ist kurzfristig stark gefallen.' });
    }

    // ---- Dynamisches Risiko & Volumen (angepasst an Zeitraum) ----
    var rets = [];
    for (var i = 1; i < slicedCloses.length; i++) rets.push(slicedCloses[i] / slicedCloses[i - 1] - 1);
    var vol = stdev(rets) * Math.sqrt(252) * 100;
    var mdd = maxDrawdown(slicedCloses);
    
    var hi = Math.max.apply(null, slicedCloses);
    var lo = Math.min.apply(null, slicedCloses);
    var fromHigh = hi > 0 ? (price / hi - 1) * 100 : 0;
    var fromLow = lo > 0 ? (price / lo - 1) * 100 : 0;

    var support = lo;
    var resistance = hi;

    // Volumentrend wird weiterhin als stabiler Macro-Indikator über die letzten 20/60 Tage gerechnet
    var volAvg20 = avg(vols.slice(-20));
    var volAvg60 = avg(vols.slice(-60));
    var volTrend = volAvg60 > 0 ? (volAvg20 / volAvg60 - 1) * 100 : null;

    var html = '' +
      '<!-- Zeitraumsteuerung -->' +
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

      '<!-- Technisches Bild -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Technisches Bild</span>' +
          '<span class="badge-pill ' + overallCls + '">' + overall + '</span>' +
        '</div>' +
        '<div class="chart-signal-list">' + signalRows + '</div>' +
        '<div class="chart-note">' + bulls + ' von ' + rated + ' Signalen positiv. Reine Auswertung vergangener Kurse, keine Anlageberatung.</div>' +
      '</div>' +

      bottomCardHtml(bottomCheck(closes)) +
      '<div id="forecast-slot"></div>' +
      '<!-- Auffälligkeiten (neutral, ohne Kaufbezug) -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Auffälligkeiten</span>' +
          '<span class="period-tag">Kennzahlen &amp; Chart</span>' +
        '</div>' +
        '<div class="auff-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px;">' +
          '<div class="auff-col auff-col-plus" style="background-color: var(--bg-secondary); border: 1px solid var(--border-subtle); border-top: 2px solid var(--bullish); border-radius: var(--radius-sm); padding: 10px; min-width: 0;">' +
            '<div class="auff-col-head" style="font-size: 0.68rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;">Auffällig günstig / stark</div>' +
            auffColHtml(auff.plus, 'Keine Auffälligkeit nach diesen Kriterien.') +
          '</div>' +
          '<div class="auff-col auff-col-minus" style="background-color: var(--bg-secondary); border: 1px solid var(--border-subtle); border-top: 2px solid var(--bearish); border-radius: var(--radius-sm); padding: 10px; min-width: 0;">' +
            '<div class="auff-col-head" style="font-size: 0.68rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;">Auffällig teuer / schwach</div>' +
            auffColHtml(auff.minus, 'Keine Auffälligkeit nach diesen Kriterien.') +
          '</div>' +
        '</div>' +
        '<div class="chart-note">Feste Regeln, keine Bewertung und keine Anlageberatung. Fundamentaldaten Stand letzter Bericht, Chart-Signale aus dem gewählten Zeitraum.</div>' +
      '</div>' +

      '<!-- Kurs + SMA -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Kurs &amp; Trendlinien</span>' +
          '<span class="period-tag">' + pLabel + '</span>' +
        '</div>' +
        '<div style="height: 220px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="chart-tab-price" style="width: 100%; height: 220px; display: block;"></canvas>' +
        '</div>' +
        '<div class="legend-row">' +
          legendItem(COLORS.price, 'Kurs') +
          legendItem(COLORS.sma50, 'SMA 50') +
          legendItem(COLORS.sma200, 'SMA 200') +
        '</div>' +
      '</div>' +

      '<!-- Wochenkerzen -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Wochenkerzen</span>' +
          '<span class="period-tag" id="candle-info">—</span>' +
        '</div>' +
        '<div class="pill-group" id="candle-range-pills" style="margin-top: 6px;">' +
          '<button class="pill-btn ' + (candleWeeks === 26 ? 'active' : '') + '" data-weeks="26">6M</button>' +
          '<button class="pill-btn ' + (candleWeeks === 52 ? 'active' : '') + '" data-weeks="52">1J</button>' +
          '<button class="pill-btn ' + (candleWeeks === 104 ? 'active' : '') + '" data-weeks="104">2J</button>' +
        '</div>' +
        '<div style="height: 240px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="chart-tab-candles" style="width: 100%; height: 240px; display: block;"></canvas>' +
        '</div>' +
        '<div class="legend-row">' +
          legendItem('#10b981', 'Woche im Plus') +
          legendItem('#ef4444', 'Woche im Minus') +
          legendItem(COLORS.sma50, '10-Wochen-Linie') +
        '</div>' +
        '<div class="chart-note">Kerzen aus Tagesschlusskursen: Eröffnung = Schlusskurs der Vorwoche, Hoch und Tief = höchster bzw. niedrigster Tagesschluss der Woche (ohne Intraday-Spitzen).</div>' +
      '</div>' +

      '<!-- RSI -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">RSI (14)</span>' +
          '<span class="period-tag">' + (rsiLast !== null ? fmt(rsiLast, 0) : '—') + '</span>' +
        '</div>' +
        '<div style="height: 130px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="chart-tab-rsi" style="width: 100%; height: 130px; display: block;"></canvas>' +
        '</div>' +
        '<div class="chart-note">Über 70 = überkauft, unter 30 = überverkauft.</div>' +
      '</div>' +

      '<!-- MACD -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">MACD (12/26/9)</span>' +
          '<span class="period-tag">' + pLabel + '</span>' +
        '</div>' +
        '<div style="height: 140px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="chart-tab-macd" style="width: 100%; height: 140px; display: block;"></canvas>' +
        '</div>' +
        '<div class="legend-row">' +
          legendItem(COLORS.macd, 'MACD') +
          legendItem(COLORS.signal, 'Signal') +
          legendItem('rgba(16,185,129,0.7)', 'Histogramm') +
        '</div>' +
      '</div>' +

      '<!-- Risiko & Volumen -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Risiko &amp; Volumen</span>' +
          '<span class="period-tag">' + pLabel + '</span>' +
        '</div>' +
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
    if (window.App.Forecast) window.App.Forecast.mount(container.querySelector('#forecast-slot'), stock, closes, currentPeriod);
    
    // Events
    bindTerms(container);
    bindPeriodPills(container, stock, hist);

    // ---- Charts zeichnen ----
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
      min: 0,
      max: 100,
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
  }

  function bindPeriodPills(container, stock, hist) {
    var pills = container.querySelectorAll('#chart-period-pills .pill-btn');
    pills.forEach(function (pill) {
      pill.onclick = function () {
        currentPeriod = pill.getAttribute('data-period');
        buildView(container, stock, hist); // Gesamte View mit neuem Zeitraum re-rendern
      };
    });
  }

  function has(x) { return x !== null && x !== undefined && isFinite(x); }

  function auffaelligkeiten(stock) {
    var r = stock.ratios || {};
    var q = stock.quote || {};
    var plus = [];
    var minus = [];
    var pe = r.peTrailing, peg = r.pegRatio, pm = r.profitMargins;
    var de = r.debtToEquity, g = r.revenueGrowth;
    var lo = q.fiftyTwoWeekLow, hi = q.fiftyTwoWeekHigh, px = q.price;
    var rangePos = (has(lo) && has(hi) && has(px) && hi > lo) ? (px - lo) / (hi - lo) * 100 : null;

    if (has(pe) && pe > 0 && pe < 12) {
      plus.push({ t: 'KGV unter 12', d: 'Der Preis liegt beim ' + fmt(pe, 1) + '-fachen des letzten Jahresgewinns. Niedrige Werte sind branchenabhängig und sagen allein wenig.' });
    }
    if (has(peg) && peg > 0 && peg < 1) {
      plus.push({ t: 'PEG unter 1', d: 'Das KGV ist im Verhältnis zum erwarteten Gewinnwachstum niedrig.' });
    }
    if (has(pm) && pm > 0.2) {
      plus.push({ t: 'Gewinnmarge über 20 %', d: 'Vom Umsatz bleiben mehr als 20 Cent je Euro als Gewinn.' });
    }
    if (has(g) && g > 0.10) {
      plus.push({ t: 'Umsatzwachstum über 10 %', d: 'Der Umsatz ist im letzten Jahr deutlich gewachsen.' });
    }

    if (has(pm) && pm < 0) {
      minus.push({ t: 'Verlust', d: 'Die Gewinnmarge ist negativ, das Unternehmen macht aktuell Verlust.' });
    }
    if (has(de) && de > 150) {
      minus.push({ t: 'Hohe Verschuldung', d: 'Die Schulden liegen über 150 % des Eigenkapitals, das erhöht das Risiko bei sinkenden Erträgen.' });
    }
    if (has(g) && g < 0) {
      minus.push({ t: 'Umsatz schrumpft', d: 'Der Umsatz ist im letzten Jahr gesunken.' });
    }
    if (has(pe) && pe > 35) {
      minus.push({ t: 'KGV über 35', d: 'Der Preis liegt beim ' + fmt(pe, 1) + '-fachen des letzten Jahresgewinns. Hohe Erwartungen sind eingepreist.' });
    }
    if (has(peg) && peg > 2) {
      minus.push({ t: 'PEG über 2', d: 'Der Preis ist im Verhältnis zum erwarteten Wachstum hoch.' });
    }
    if (rangePos !== null && rangePos <= 10) {
      minus.push({ t: 'Kurs nahe am Jahrestief', d: 'Der Kurs liegt im untersten Zehntel der 52-Wochen-Spanne. Das zeigt die aktuelle Stimmung, nicht deren Ursache.' });
    }

    return { plus: plus, minus: minus };
  }

  var GLOSSARY = {
    KGV: { name: 'KGV (Kurs-Gewinn-Verhältnis)', text: 'Der Aktienkurs geteilt durch den Gewinn je Aktie der letzten zwölf Monate. Er zeigt, wie viele Jahresgewinne du für den Kurs zahlst. Vergleiche nur innerhalb einer Branche.' },
    PEG: { name: 'PEG', text: 'Das KGV geteilt durch das erwartete Gewinnwachstum. Als Faustregel gilt: Unter 1 ist der Preis im Verhältnis zum Wachstum niedrig, über 2 ist er hoch.' },
    Gewinnmarge: { name: 'Gewinnmarge', text: 'Der Anteil des Gewinns am Umsatz in Prozent. 20 % bedeutet: Von jedem Euro Umsatz bleiben 20 Cent als Gewinn.' },
    Verschuldung: { name: 'Verschuldung (Debt/Equity)', text: 'Das Fremdkapital im Verhältnis zum Eigenkapital in Prozent. Hohe Werte bedeuten, dass das Unternehmen im Verhältnis zu seinem Eigenkapital viele Schulden hat.' },
    Umsatzwachstum: { name: 'Umsatzwachstum', text: 'Die prozentuale Veränderung des Umsatzes gegenüber dem Vorjahr.' },
    Verlust: { name: 'Verlust', text: 'Das Unternehmen hat im letzten Jahr mehr ausgegeben als eingenommen. Die Gewinnmarge ist dann negativ, und ein KGV lässt sich nicht bilden.' },
    Spanne: { name: '52-Wochen-Spanne', text: 'Die Kursspanne zwischen dem tiefsten und dem höchsten Kurs der letzten zwölf Monate. Der Balken zeigt, wo der aktuelle Kurs darin liegt.' },
    SMA: { name: 'SMA (gleitender Durchschnitt)', text: 'Der Durchschnittskurs der letzten 50 bzw. 200 Handelstage. Liegt der Kurs darüber, gilt das als Hinweis auf einen Aufwärtstrend, darunter auf einen Abwärtstrend.' },
    Cross: { name: 'Golden Cross / Death Cross', text: 'Golden Cross: Die 50-Tage-Linie kreuzt die 200-Tage-Linie von unten nach oben. Death Cross: Die Kreuzung verläuft umgekehrt. Beides gilt als Trendhinweis, keine Prognose.' },
    RSI: { name: 'RSI (14)', text: 'Der Relative Strength Index misst, wie stark der Kurs in den letzten 14 Tagen gestiegen oder gefallen ist. Die Skala reicht von 0 bis 100. Über 70 gilt als überkauft, unter 30 als überverkauft.' },
    MACD: { name: 'MACD', text: 'Die Differenz zweier gleitender Durchschnitte (12 und 26 Tage). Liegt die MACD-Linie über der Signallinie, ist der kurzfristige Trend nach oben gerichtet.' },
    Momentum: { name: 'Momentum', text: 'Die prozentuale Kursveränderung im gewählten Zeitraum.' },
    Volatilität: { name: 'Volatilität', text: 'Wie stark der Kurs im gewählten Zeitraum schwankt, aufs Jahr hochgerechnet. Höhere Werte bedeuten größere Ausschläge in beide Richtungen.' },
    Drawdown: { name: 'Maximaler Drawdown', text: 'Der größte Rückgang vom zwischenzeitlichen Hoch bis zum folgenden Tief innerhalb des gewählten Zeitraums.' },
    Volumen: { name: 'Volumentrend', text: 'Vergleicht das durchschnittliche Handelsvolumen der letzten 20 Tage mit dem der letzten 60 Tage. Ein positiver Wert bedeutet mehr Handel als sonst.' },
    Support: { name: 'Unterstützung und Widerstand', text: 'Unterstützung ist der tiefste, Widerstand der höchste Kurs im gewählten Chart-Zeitraum. An diesen Marken hat der Kurs in der Vergangenheit gedreht.' }
  };

  var TERM_RULES = [
    [/^KGV/, 'KGV'], [/PEG/, 'PEG'], [/Gewinnmarge/, 'Gewinnmarge'], [/Verschuldung/, 'Verschuldung'],
    [/Umsatz/, 'Umsatzwachstum'], [/Verlust/, 'Verlust'], [/Jahrestief|Spanne/, 'Spanne'],
    [/RSI/, 'RSI'], [/MACD/, 'MACD'], [/Kreuz|Golden|Death|SMA 50 vs/, 'Cross'], [/SMA|Tage-Linie/, 'SMA'],
    [/Momentum/, 'Momentum'], [/Volatilität/, 'Volatilität'], [/Drawdown/, 'Drawdown'], [/Volumen/, 'Volumen'],
    [/Unterstützung|Widerstand/, 'Support']
  ];

  function termKeyFor(label) {
    for (var i = 0; i < TERM_RULES.length; i++) {
      if (TERM_RULES[i][0].test(label)) return TERM_RULES[i][1];
    }
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
        box.parentNode.removeChild(box);
        return;
      }
      if (!box) {
        box = document.createElement('div');
        box.id = 'term-info';
      }
      box.setAttribute('data-term', key);
      box.setAttribute('style', 'margin: -6px 0 16px; padding: 12px 14px; border-radius: var(--radius-sm); background-color: var(--bg-secondary); border: 1px solid var(--border-subtle); font-size: 0.8rem; color: var(--text-main); line-height: 1.45;');
      box.innerHTML = '<div style="font-weight: 700; margin-bottom: 4px;">' + GLOSSARY[key].name + '</div>' + GLOSSARY[key].text;
      card.parentNode.insertBefore(box, card.nextSibling);
    });
  }

  function auffColHtml(items, emptyText) {
    if (!items.length) return '<div class="auff-empty" style="font-size: 0.72rem; color: var(--text-dim); margin-top: 8px;">' + emptyText + '</div>';
    return items.map(function (it) {
      return '<div class="auff-item" style="margin-top: 8px;"><div class="auff-item-title" style="font-size: 0.8rem; font-weight: 600; color: var(--text-main);">' + termLink(it.t) + '</div>' +
        '<div class="auff-item-text" style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; margin-top: 2px;">' + it.d + '</div></div>';
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
    _sma: sma,
    _ema: ema,
    _rsi: rsi,
    _macd: macd,
    _bottom: bottomCheck
  };
})();


/**
 * js/stock-chart.js
 * Chart-Analyse-Tab der Aktiendetailseite (nach "Overview"):
 * - Technisches Bild (Signale zu SMA 50/200, RSI, MACD, Momentum)
 * - Kurs mit gleitenden Durchschnitten (SMA 50 / SMA 200)
 * - RSI (14) und MACD (12/26/9)
 * - Risiko & Volumen (Volatilität, Drawdown, Abstand zu Hoch/Tief, Volumentrend, Unterstützung/Widerstand)
 *
 * Alle Indikatoren werden im Browser aus stock.chartHistory (Tagesschlusskurse, ~1 Jahr) berechnet.
 */

window.App = window.App || {};

window.App.StockChart = (function () {
  'use strict';

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

  /** EMA; Startwert = SMA der ersten n gültigen Werte. */
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

  /** RSI nach Wilder. */
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

  /** Letzter Schnittpunkt SMA50/SMA200. */
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

  function shortLabel(iso) {
    var d = String(iso || '');
    return d.slice(5, 7) + '/' + d.slice(2, 4);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function render(container, stock) {
    if (!container || !stock) return;

    var hist = (stock.chartHistory || []).filter(function (p) { return p && p.close > 0; });
    if (hist.length < 60) {
      container.innerHTML = '<div class="card"><p style="color: var(--text-muted); font-size: 0.85rem;">' +
        'Für die Chart-Analyse liegen noch zu wenige Kursdaten vor.</p></div>';
      return;
    }

    var currency = (stock.quote && stock.quote.currency) || 'EUR';
    var closes = hist.map(function (p) { return p.close; });
    var dates = hist.map(function (p) { return p.date; });
    var n = closes.length;
    var price = closes[n - 1];
    var auff = auffaelligkeiten(stock);

    var s50 = sma(closes, 50);
    var s200 = sma(closes, 200);
    var rsiArr = rsi(closes, 14);
    var m = macd(closes);

    var s50Last = lastValid(s50);
    var s200Last = lastValid(s200);
    var rsiLast = lastValid(rsiArr);
    var macdLast = lastValid(m.line);
    var sigLast = lastValid(m.signal);
    var cross = findLastCross(s50, s200, dates);
    var mom3m = n > 63 ? (price / closes[n - 1 - 63] - 1) * 100 : null;

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
    if (mom3m !== null) {
      signals.push({
        label: 'Momentum 3 Monate',
        text: pct(mom3m),
        state: mom3m >= 0 ? 'bull' : 'bear'
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
        '<div class="chart-signal-text"><div class="chart-signal-label">' + s.label + '</div>' +
        '<div class="chart-signal-value">' + s.text + '</div></div>' +
      '</div>';
    }).join('');

    // ---- Chart-Erkenntnisse in die Auffälligkeiten übernehmen ----
    // Bullische Signale links, bärische rechts; Extremwerte des RSI rechts.
    signals.forEach(function (sg) {
      if (sg.state === 'bull') auff.plus.push({ t: sg.label, d: sg.text });
      else if (sg.state === 'bear') auff.minus.push({ t: sg.label, d: sg.text });
    });
    if (rsiLast !== null && rsiLast >= 70) {
      auff.minus.push({ t: 'RSI überkauft', d: 'RSI bei ' + fmt(rsiLast, 0) + ': der Kurs ist kurzfristig stark gestiegen. Solche Stände gehen oft mit größeren Schwankungen einher.' });
    } else if (rsiLast !== null && rsiLast <= 30) {
      auff.minus.push({ t: 'RSI überverkauft', d: 'RSI bei ' + fmt(rsiLast, 0) + ': der Kurs ist kurzfristig stark gefallen.' });
    }

    // ---- Risiko & Volumen ----
    var rets = [];
    for (var i = 1; i < n; i++) rets.push(closes[i] / closes[i - 1] - 1);
    var vol = stdev(rets) * Math.sqrt(252) * 100;
    var mdd = maxDrawdown(closes);
    var hi = Math.max.apply(null, closes);
    var lo = Math.min.apply(null, closes);
    var fromHigh = (price / hi - 1) * 100;
    var fromLow = (price / lo - 1) * 100;

    var vols = hist.map(function (p) { return p.volume || 0; });
    var volAvg20 = avg(vols.slice(-20));
    var volAvg60 = avg(vols.slice(-60));
    var volTrend = volAvg60 > 0 ? (volAvg20 / volAvg60 - 1) * 100 : null;

    var recent = closes.slice(-63);
    var support = Math.min.apply(null, recent);
    var resistance = Math.max.apply(null, recent);

    var html = '' +
      '<!-- Technisches Bild -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Technisches Bild</span>' +
          '<span class="badge-pill ' + overallCls + '">' + overall + '</span>' +
        '</div>' +
        '<div class="chart-signal-list">' + signalRows + '</div>' +
        '<div class="chart-note">' + bulls + ' von ' + rated + ' Signalen positiv. Reine Auswertung vergangener Kurse, keine Anlageberatung.</div>' +
      '</div>' +

      '<!-- Auffälligkeiten (neutral, ohne Kaufbezug) -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Auffälligkeiten</span>' +
          '<span class="period-tag">Kennzahlen</span>' +
        '</div>' +
        '<div class="auff-grid">' +
          '<div class="auff-col auff-col-plus">' +
            '<div class="auff-col-head">Auffällig günstig / stark</div>' +
            auffColHtml(auff.plus, 'Keine Auffälligkeit nach diesen Kriterien.') +
          '</div>' +
          '<div class="auff-col auff-col-minus">' +
            '<div class="auff-col-head">Auffällig teuer / schwach</div>' +
            auffColHtml(auff.minus, 'Keine Auffälligkeit nach diesen Kriterien.') +
          '</div>' +
        '</div>' +
        '<div class="chart-note">Feste Regeln, keine Bewertung und keine Anlageberatung. Kennzahlen aus der Übersicht (Stand letzter Handelstag), technische Punkte aus dem Kursverlauf des letzten Jahres.</div>' +
      '</div>' +

      '<!-- Kurs + SMA -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Kurs &amp; Trendlinien</span>' +
          '<span class="period-tag">1 Jahr</span>' +
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
          '<span class="period-tag">1 Jahr</span>' +
        '</div>' +
        '<div class="metrics-grid-2col" style="margin-bottom: 0;">' +
          metric('Volatilität p. a.', fmt(vol, 1) + ' %') +
          metric('Max. Drawdown', fmt(mdd, 1) + ' %') +
          metric('Abstand zum Hoch', pct(fromHigh)) +
          metric('Abstand zum Tief', pct(fromLow)) +
          metric('Volumen 20T vs. 60T', volTrend === null ? '—' : pct(volTrend, 0)) +
          metric('Unterstützung (3M)', window.App.Format.currency(support, currency, 2)) +
          metric('Widerstand (3M)', window.App.Format.currency(resistance, currency, 2)) +
          metric('Schlusskurs', window.App.Format.currency(price, currency, 2)) +
        '</div>' +
      '</div>';

    container.innerHTML = html;

    // ---- Charts zeichnen ----
    var labels = dates.map(shortLabel);
    var Charts = window.App.Charts;
    var cur = currency;

    Charts.renderMultiLineChart(document.getElementById('chart-tab-price'), {
      labels: labels,
      series: [
        { name: 'Kurs', color: COLORS.price, values: closes, width: 2 },
        { name: 'SMA 50', color: COLORS.sma50, values: s50, width: 1.5 },
        { name: 'SMA 200', color: COLORS.sma200, values: s200, width: 1.5 }
      ],
      formatY: function (v) { return window.App.Format.currency(v, cur, 0); }
    });

    var tail = Math.min(130, n);
    var lbTail = labels.slice(-tail);

    Charts.renderIndicatorChart(document.getElementById('chart-tab-rsi'), {
      labels: lbTail,
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
      labels: lbTail,
      lines: [
        { values: m.line.slice(-tail), color: COLORS.macd },
        { values: m.signal.slice(-tail), color: COLORS.signal }
      ],
      bars: m.hist.slice(-tail),
      refLines: [{ value: 0, color: 'rgba(255, 255, 255, 0.25)' }],
      formatY: function (v) { return fmt(v, Math.abs(v) < 10 ? 1 : 0); }
    });
  }

  /**
   * Auffälligkeiten aus den bereits vorliegenden Kennzahlen (keine Neuberechnung).
   * Links: auffällig günstig/stark, rechts: auffällig schwach/riskant. Feste Schwellen, keine Bewertung.
   */
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

  function auffColHtml(items, emptyText) {
    if (!items.length) return '<div class="auff-empty">' + emptyText + '</div>';
    return items.map(function (it) {
      return '<div class="auff-item"><div class="auff-item-title">' + it.t + '</div>' +
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
    return '<div class="metric-cell"><span class="metric-label">' + label + '</span>' +
      '<span class="metric-value">' + value + '</span></div>';
  }

  return {
    render: render,
    // für Tests
    _sma: sma,
    _ema: ema,
    _rsi: rsi,
    _macd: macd
  };
})();

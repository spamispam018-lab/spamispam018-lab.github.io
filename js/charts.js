/**
 * js/charts.js
 * Leichtgewichtige, mobile-optimierte Canvas-Diagramm-Engine.
 * Unterstützt:
 * - Linien- & Flächen-Charts (mit Insider-Markern Buy/Sell)
 * - Gruppierte Balkendiagramme (Financials TTM)
 * - Gestapelte Balkendiagramme (Analysten-Empfehlungen)
 * - Donut-Charts (Ratings-Breakdown)
 * Behandelt High-DPI Displays (Retina) ohne externe Bibliotheken.
 */

window.App = window.App || {};

window.App.Charts = (function () {
  'use strict';

  var THEME = {
    textColor: '#9ca3af',
    gridColor: 'rgba(255, 255, 255, 0.07)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    purple: '#6366f1',
    purpleLight: '#818cf8',
    green: '#10b981',
    red: '#ef4444',
    yellow: '#f59e0b',
    blue: '#3b82f6',
    gray: '#4b5563'
  };

  /**
   * Initialisiert ein Canvas-Element für scharfe Retina-Darstellung.
   */
  function setupCanvas(canvas) {
    if (!canvas) return null;
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var width = rect.width || canvas.parentElement.clientWidth || 320;
    var height = rect.height || 220;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx: ctx, width: width, height: height };
  }

  /**
   * Zeichnet horizontale gestrichelte Hilfslinien und die Y-Achsen-Werte links.
   */
  function drawGridAndYAxis(ctx, width, height, minVal, maxVal, padding, formatFn) {
    var chartTop = padding.top;
    var chartBottom = height - padding.bottom;
    var chartHeight = chartBottom - chartTop;
    var steps = 4;

    ctx.save();
    ctx.font = '10px ' + THEME.fontFamily;
    ctx.fillStyle = THEME.textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = THEME.gridColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (var i = 0; i <= steps; i++) {
      var y = chartTop + (chartHeight / steps) * i;
      var val = maxVal - ((maxVal - minVal) / steps) * i;
      var label = formatFn ? formatFn(val) : val.toFixed(1);

      // Gestrichelte Linie
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Achsenbeschriftung
      ctx.fillText(label, 4, y);
    }
    ctx.restore();
  }

  /**
   * 1. Linien-Chart mit Gradient und optionalen Buy/Sell-Events (für Kurs & Insider).
   * opts: { labels: [], values: [], markers: [{ index: 2, type: 'Buy'|'Sell', text: '' }] }
   */
  function renderLineChart(canvas, opts) {
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx;
    var w = setup.width;
    var h = setup.height;

    var vals = opts.values || [];
    var labels = opts.labels || [];
    var markers = opts.markers || [];
    if (vals.length === 0) return;

    var padding = { top: 20, right: 15, bottom: 25, left: 45 };
    var minVal = Math.min.apply(null, vals);
    var maxVal = Math.max.apply(null, vals);
    var buffer = (maxVal - minVal) * 0.1 || (maxVal * 0.05) || 1;
    minVal -= buffer;
    maxVal += buffer;

    drawGridAndYAxis(ctx, w, h, minVal, maxVal, padding, opts.formatY);

    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;
    var stepX = vals.length > 1 ? chartW / (vals.length - 1) : chartW;

    // Koordinaten berechnen
    var points = [];
    for (var i = 0; i < vals.length; i++) {
      var x = padding.left + i * stepX;
      var y = padding.top + chartH - ((vals[i] - minVal) / (maxVal - minVal)) * chartH;
      points.push({ x: x, y: y, val: vals[i], label: labels[i] });
    }

    // Flächenverlauf (Gradient Fill)
    var grad = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
    grad.addColorStop(0, 'rgba(99, 102, 241, 0.35)');
    grad.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var j = 1; j < points.length; j++) {
      ctx.lineTo(points[j].x, points[j].y);
    }
    ctx.lineTo(points[points.length - 1].x, h - padding.bottom);
    ctx.lineTo(points[0].x, h - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Hauptlinie zeichnen
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var k = 1; k < points.length; k++) {
      ctx.lineTo(points[k].x, points[k].y);
    }
    ctx.strokeStyle = THEME.purpleLight;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.stroke();

    // X-Achsen-Labels (Start, Mitte, Ende)
    ctx.font = '10px ' + THEME.fontFamily;
    ctx.fillStyle = THEME.textColor;
    ctx.textAlign = 'center';
    var labelIndices = [0, Math.floor(labels.length / 2), labels.length - 1];
    labelIndices.forEach(function (idx) {
      if (points[idx] && labels[idx]) {
        ctx.fillText(labels[idx], points[idx].x, h - 6);
      }
    });

    // Vertikale Buy/Sell-Markerlinien (Insider-Aktivitäten)
    markers.forEach(function (m) {
      if (m.index >= 0 && m.index < points.length) {
        var pt = points[m.index];
        var isBuy = m.type === 'Buy';
        var color = isBuy ? THEME.green : THEME.red;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(pt.x, padding.top);
        ctx.lineTo(pt.x, h - padding.bottom);
        ctx.stroke();

        // Markierungspunkt
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
  }

  /**
   * 1b. Mehrlinien-Chart (z. B. normierter Kursvergleich mehrerer Titel).
   * opts: { labels: [], series: [{ name: '', color: '', values: [] }], formatY: fn }
   */
  function renderMultiLineChart(canvas, opts) {
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx;
    var w = setup.width;
    var h = setup.height;

    var series = (opts.series || []).filter(function (sr) { return sr.values && sr.values.length > 0; });
    var labels = opts.labels || [];
    if (series.length === 0) return;

    var padding = { top: 20, right: 15, bottom: 25, left: 45 };
    var allVals = [];
    series.forEach(function (sr) {
      sr.values.forEach(function (v) { if (v !== null && v !== undefined && isFinite(v)) allVals.push(v); });
    });
    if (allVals.length === 0) return;
    var minVal = Math.min.apply(null, allVals);
    var maxVal = Math.max.apply(null, allVals);
    var buffer = (maxVal - minVal) * 0.1 || (maxVal * 0.05) || 1;
    minVal -= buffer;
    maxVal += buffer;

    drawGridAndYAxis(ctx, w, h, minVal, maxVal, padding, opts.formatY);

    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;
    var n0 = Math.max.apply(null, series.map(function (sr) { return sr.values.length; }));
    var stepX0 = n0 > 1 ? chartW / (n0 - 1) : chartW;

    series.forEach(function (sr) {
      var n = sr.values.length;
      // Kürzere Reihen rechtsbündig ausrichten
      var offset = n0 - n;
      var started = false;
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var v = sr.values[i];
        if (v === null || v === undefined || !isFinite(v)) { started = false; continue; }
        var x = padding.left + (i + offset) * stepX0;
        var y = padding.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;
        if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      }
      ctx.strokeStyle = sr.color || THEME.purpleLight;
      ctx.lineWidth = sr.width || 2;
      ctx.setLineDash(sr.dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // X-Achsen-Labels (Start, Mitte, Ende)
    ctx.font = '10px ' + THEME.fontFamily;
    ctx.fillStyle = THEME.textColor;
    ctx.textAlign = 'center';
    [0, Math.floor(n0 / 2), n0 - 1].forEach(function (idx) {
      if (labels[idx]) ctx.fillText(labels[idx], padding.left + idx * stepX0, h - 6);
    });
  }

  /**
   * 1c. Indikator-Chart (RSI, MACD …): Linien, optionale Histogramm-Balken und Referenzlinien.
   * opts: { labels, lines:[{values,color}], bars:[values], refLines:[{value,color}], min, max, formatY }
   */
  function renderIndicatorChart(canvas, opts) {
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx;
    var w = setup.width;
    var h = setup.height;
    var labels = opts.labels || [];
    var lines = opts.lines || [];
    var bars = opts.bars || null;
    var n = labels.length;
    if (n < 2) return;

    var padding = { top: 14, right: 15, bottom: 22, left: 45 };
    var vals = [];
    lines.forEach(function (ln) { ln.values.forEach(function (v) { if (v !== null && isFinite(v)) vals.push(v); }); });
    if (bars) bars.forEach(function (v) { if (v !== null && isFinite(v)) vals.push(v); });
    if (vals.length === 0) return;
    var minVal = (opts.min !== undefined) ? opts.min : Math.min.apply(null, vals);
    var maxVal = (opts.max !== undefined) ? opts.max : Math.max.apply(null, vals);
    if (opts.min === undefined || opts.max === undefined) {
      var buf = (maxVal - minVal) * 0.1 || 1;
      if (opts.min === undefined) minVal -= buf;
      if (opts.max === undefined) maxVal += buf;
    }

    drawGridAndYAxis(ctx, w, h, minVal, maxVal, padding, opts.formatY);

    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;
    var stepX = chartW / (n - 1);
    function yOf(v) { return padding.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH; }

    // Referenzlinien
    (opts.refLines || []).forEach(function (rl) {
      ctx.save();
      ctx.strokeStyle = rl.color || THEME.gray;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, yOf(rl.value));
      ctx.lineTo(w - padding.right, yOf(rl.value));
      ctx.stroke();
      ctx.restore();
    });

    // Histogramm
    if (bars) {
      var zeroY = yOf(0);
      var bw = Math.max(1, stepX * 0.7);
      for (var b = 0; b < bars.length; b++) {
        var bv = bars[b];
        if (bv === null || !isFinite(bv)) continue;
        ctx.fillStyle = bv >= 0 ? 'rgba(16, 185, 129, 0.55)' : 'rgba(239, 68, 68, 0.55)';
        var by = yOf(bv);
        ctx.fillRect(padding.left + b * stepX - bw / 2, Math.min(by, zeroY), bw, Math.abs(by - zeroY) || 1);
      }
    }

    // Linien
    lines.forEach(function (ln) {
      var started = false;
      ctx.beginPath();
      for (var i = 0; i < ln.values.length; i++) {
        var v = ln.values[i];
        if (v === null || v === undefined || !isFinite(v)) { started = false; continue; }
        var x = padding.left + i * stepX;
        if (!started) { ctx.moveTo(x, yOf(v)); started = true; } else { ctx.lineTo(x, yOf(v)); }
      }
      ctx.strokeStyle = ln.color || THEME.purpleLight;
      ctx.lineWidth = ln.width || 1.8;
      ctx.setLineDash([]);
      ctx.stroke();
    });

    ctx.font = '10px ' + THEME.fontFamily;
    ctx.fillStyle = THEME.textColor;
    ctx.textAlign = 'center';
    [0, Math.floor(n / 2), n - 1].forEach(function (idx) {
      if (labels[idx]) ctx.fillText(labels[idx], padding.left + idx * stepX, h - 6);
    });
  }

  /**
   * 2. Gruppiertes Balkendiagramm (z. B. Revenue, OCF, Net Income letzte 4 Quartale).
   * opts: { labels: ['Q2', 'Q3', 'Q4', 'Q1'], series: [{ name: '', data: [], color: '' }] }
   */
  function renderGroupedBarChart(canvas, opts) {
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx;
    var w = setup.width;
    var h = setup.height;

    var labels = opts.labels || [];
    var series = opts.series || [];
    if (labels.length === 0 || series.length === 0) return;

    var padding = { top: 20, right: 15, bottom: 25, left: 45 };

    // Min & Max über alle Serien ermitteln
    var allVals = [];
    series.forEach(function (s) {
      allVals = allVals.concat(s.data);
    });
    var minVal = Math.min(0, Math.min.apply(null, allVals));
    var maxVal = Math.max.apply(null, allVals);
    maxVal = maxVal * 1.15 || 1;

    drawGridAndYAxis(ctx, w, h, minVal, maxVal, padding, opts.formatY);

    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;
    var groupW = chartW / labels.length;
    var barPadding = 4;
    var barW = (groupW - 16) / series.length;

    labels.forEach(function (label, gIdx) {
      var groupX = padding.left + gIdx * groupW + 8;

      series.forEach(function (s, sIdx) {
        var val = s.data[gIdx] || 0;
        var barH = ((val - minVal) / (maxVal - minVal)) * chartH;
        var barX = groupX + sIdx * barW;
        var barY = padding.top + chartH - barH;

        ctx.fillStyle = s.color || THEME.purple;
        ctx.beginPath();
        // Leichte Rundung oben
        ctx.roundRect ? ctx.roundRect(barX, barY, barW - barPadding, barH, [3, 3, 0, 0]) : ctx.rect(barX, barY, barW - barPadding, barH);
        ctx.fill();
      });

      // Gruppen-Label
      ctx.font = '10px ' + THEME.fontFamily;
      ctx.fillStyle = THEME.textColor;
      ctx.textAlign = 'center';
      ctx.fillText(label, groupX + (groupW - 16) / 2, h - 8);
    });
  }

  /**
   * 3. Donut-Chart (Analysten-Empfehlungen: Strong Buy, Buy, Hold, Sell, Strong Sell).
   * opts: { data: [{ label: 'Buy', value: 16, color: '#10b981' }], totalText: '4.17' }
   */
  function renderDonutChart(canvas, opts) {
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx;
    var w = setup.width;
    var h = setup.height;

    var items = opts.data || [];
    var total = 0;
    items.forEach(function (it) { total += it.value; });
    if (total === 0) return;

    var centerX = w / 2;
    var centerY = h / 2;
    var radius = Math.min(centerX, centerY) - 15;
    var innerRadius = radius * 0.65;
    var currentAngle = -Math.PI / 2;

    items.forEach(function (item) {
      var sliceAngle = (item.value / total) * (Math.PI * 2);
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true);
      ctx.closePath();
      ctx.fillStyle = item.color;
      ctx.fill();
      currentAngle += sliceAngle;
    });

    // Score / Text in der Mitte
    if (opts.totalText) {
      ctx.font = 'bold 20px ' + THEME.fontFamily;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.totalText, centerX, centerY - 6);

      ctx.font = '10px ' + THEME.fontFamily;
      ctx.fillStyle = THEME.textColor;
      ctx.fillText(opts.subText || 'Konsens', centerX, centerY + 14);
    }
  }

  /**
   * 4. Gestapeltes Balkendiagramm (Monatliche Analysten-Trends).
   * opts: { labels: ['-3m', '-2m', '-1m', 'Aktuell'], stacks: [{ strongBuy: 18, buy: 16, hold: 7, sell: 1, strongSell: 0 }] }
   */
  function renderStackedBarChart(canvas, opts) {
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx;
    var w = setup.width;
    var h = setup.height;

    var labels = opts.labels || [];
    var stacks = opts.stacks || [];
    if (labels.length === 0 || stacks.length === 0) return;

    var padding = { top: 15, right: 10, bottom: 25, left: 10 };
    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;
    var barW = chartW / labels.length * 0.55;

    var keys = [
      { key: 'strongBuy', color: '#059669' },
      { key: 'buy', color: '#10b981' },
      { key: 'hold', color: '#f59e0b' },
      { key: 'sell', color: '#ef4444' },
      { key: 'strongSell', color: '#b91c1c' }
    ];

    labels.forEach(function (label, idx) {
      var stack = stacks[idx] || {};
      var sum = 0;
      keys.forEach(function (k) { sum += (stack[k.key] || 0); });
      if (sum === 0) return;

      var x = padding.left + idx * (chartW / labels.length) + ((chartW / labels.length - barW) / 2);
      var currentY = padding.top + chartH;

      keys.forEach(function (k) {
        var count = stack[k.key] || 0;
        var segH = (count / sum) * chartH;
        currentY -= segH;

        ctx.fillStyle = k.color;
        ctx.fillRect(x, currentY, barW, segH);
      });

      // Label unten
      ctx.font = '10px ' + THEME.fontFamily;
      ctx.fillStyle = THEME.textColor;
      ctx.textAlign = 'center';
      ctx.fillText(label, x + barW / 2, h - 8);
    });
  }

  return {
    renderLineChart: renderLineChart,
    renderMultiLineChart: renderMultiLineChart,
    renderIndicatorChart: renderIndicatorChart,
    renderGroupedBarChart: renderGroupedBarChart,
    renderDonutChart: renderDonutChart,
    renderStackedBarChart: renderStackedBarChart
  };
})();

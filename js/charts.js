/**
 * js/charts.js
 * Canvas-Diagramm-Engine.
 * Unterstützt horizontale Referenzlinien in renderLineChart (opts.horizontalLines).
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

  function niceStep(raw) {
    if (!isFinite(raw) || raw <= 0) return 1;
    var exp = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / exp;
    var n = f <= 1 ? 1 : (f <= 2 ? 2 : (f <= 5 ? 5 : 10));
    return n * exp;
  }

  function drawGridAndYAxis(ctx, width, height, minVal, maxVal, padding, formatFn) {
    var chartTop = padding.top;
    var chartBottom = height - padding.bottom;
    var chartHeight = chartBottom - chartTop;
    var range = maxVal - minVal;
    if (!isFinite(range) || range <= 0) { range = 1; maxVal = minVal + 1; }

    var step = niceStep(range / 4);
    var ticks = [];
    var first = Math.ceil(minVal / step - 1e-9) * step;
    for (var v = first; v <= maxVal + step * 1e-9 && ticks.length < 12; v += step) {
      ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    }

    ctx.save();
    ctx.font = '10px ' + THEME.fontFamily;
    ctx.fillStyle = THEME.textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    var labels = ticks.map(function (t) { return formatFn ? formatFn(t) : t.toFixed(1); });
    var maxLabelW = 0;
    labels.forEach(function (l) {
      var wl = ctx.measureText(String(l)).width;
      if (wl > maxLabelW) maxLabelW = wl;
    });
    padding.left = Math.max(padding.left, Math.ceil(maxLabelW) + 14);

    ctx.strokeStyle = THEME.gridColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ticks.forEach(function (t, i) {
      var y = chartTop + chartHeight - ((t - minVal) / range) * chartHeight;
      ctx.beginPath();
      if (t === 0 && minVal < 0) {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      } else {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = THEME.gridColor;
      }
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillText(labels[i], 4, y);
    });
    ctx.restore();
  }

  function renderLineChart(canvas, opts) {
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx, w = setup.width, h = setup.height;
    var vals = opts.values || [], labels = opts.labels || [], markers = opts.markers || [];
    if (vals.length === 0) return;

    var padding = { top: 20, right: 15, bottom: 25, left: 45 };
    var minVal = Math.min.apply(null, vals), maxVal = Math.max.apply(null, vals);
    var buffer = (maxVal - minVal) * 0.1 || (maxVal * 0.05) || 1;
    minVal -= buffer; maxVal += buffer;

    // NEU: Overlay-Linien (z. B. Trendkanal) in die Y-Skalierung einbeziehen
    if (opts.overlays && opts.overlays.length) {
      opts.overlays.forEach(function (ov) {
        (ov.values || []).forEach(function (v) {
          if (v == null || !isFinite(v)) return;
          if (v < minVal) minVal = v - buffer * 0.25;
          if (v > maxVal) maxVal = v + buffer * 0.25;
        });
      });
    }

    // NEU: horizontale Linien in die Y-Skalierung einbeziehen
    if (opts.horizontalLines && opts.horizontalLines.length) {
      opts.horizontalLines.forEach(function (hl) {
        if (hl.value == null || !isFinite(hl.value)) return;
        if (hl.value < minVal) minVal = hl.value - buffer * 0.25;
        if (hl.value > maxVal) maxVal = hl.value + buffer * 0.25;
      });
    }

    drawGridAndYAxis(ctx, w, h, minVal, maxVal, padding, opts.formatY);

    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;
    var stepX = vals.length > 1 ? chartW / (vals.length - 1) : chartW;

    var points = [];
    for (var i = 0; i < vals.length; i++) {
      var x = padding.left + i * stepX;
      var y = padding.top + chartH - ((vals[i] - minVal) / (maxVal - minVal)) * chartH;
      points.push({ x: x, y: y, val: vals[i], label: labels[i] });
    }

    var grad = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
    grad.addColorStop(0, 'rgba(99, 102, 241, 0.35)');
    grad.addColorStop(1, 'rgba(99, 102, 241, 0.0)');
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var j = 1; j < points.length; j++) ctx.lineTo(points[j].x, points[j].y);
    ctx.lineTo(points[points.length - 1].x, h - padding.bottom);
    ctx.lineTo(points[0].x, h - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var k = 1; k < points.length; k++) ctx.lineTo(points[k].x, points[k].y);
    ctx.strokeStyle = THEME.purpleLight;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.stroke();

    // NEU: Overlay-Linien (Trendkanal): values[i] gehört zu Punkt i
    if (opts.overlays && opts.overlays.length) {
      opts.overlays.forEach(function (ov) {
        var vs = ov.values || [];
        ctx.save();
        ctx.strokeStyle = ov.color || THEME.yellow;
        ctx.lineWidth = ov.width || 1.2;
        ctx.setLineDash(ov.dashed ? [5, 4] : []);
        ctx.beginPath();
        var started = false;
        for (var q = 0; q < vs.length && q < points.length; q++) {
          if (vs[q] == null || !isFinite(vs[q])) continue;
          var oy = padding.top + chartH - ((vs[q] - minVal) / (maxVal - minVal)) * chartH;
          oy = Math.max(padding.top, Math.min(h - padding.bottom, oy));
          if (!started) { ctx.moveTo(points[q].x, oy); started = true; } else ctx.lineTo(points[q].x, oy);
        }
        ctx.stroke();
        ctx.restore();
      });
    }

    // NEU: horizontale Referenzlinien (z. B. Xetra-Kurs)
    if (opts.horizontalLines && opts.horizontalLines.length) {
      opts.horizontalLines.forEach(function (hl) {
        if (hl.value == null || !isFinite(hl.value)) return;
        var hy = padding.top + chartH - ((hl.value - minVal) / (maxVal - minVal)) * chartH;
        if (hy < padding.top || hy > h - padding.bottom) return;

        ctx.save();
        ctx.strokeStyle = hl.color || THEME.yellow;
        ctx.lineWidth = hl.width || 1.5;
        ctx.setLineDash(hl.dashed === false ? [] : [6, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, hy);
        ctx.lineTo(w - padding.right, hy);
        ctx.stroke();
        ctx.setLineDash([]);

        if (hl.label) {
          ctx.font = 'bold 9px ' + THEME.fontFamily;
          ctx.fillStyle = hl.color || THEME.yellow;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(hl.label, w - padding.right - 2, hy - 3);
        }
        ctx.restore();
      });
    }

    ctx.font = '10px ' + THEME.fontFamily;
    ctx.fillStyle = THEME.textColor;
    ctx.textAlign = 'center';
    var labelIndices = [0, Math.floor(labels.length / 2), labels.length - 1];
    labelIndices.forEach(function (idx) {
      if (points[idx] && labels[idx]) ctx.fillText(labels[idx], points[idx].x, h - 6);
    });

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
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
  }

  function renderMultiLineChart(canvas, opts) {
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx, w = setup.width, h = setup.height;
    var series = (opts.series || []).filter(function (sr) { return sr.values && sr.values.length > 0; });
    var labels = opts.labels || [];
    if (series.length === 0) return;

    var padding = { top: 20, right: 15, bottom: 25, left: 45 };
    var allVals = [];
    series.forEach(function (sr) {
      sr.values.forEach(function (v) { if (v !== null && v !== undefined && isFinite(v)) allVals.push(v); });
    });
    if (allVals.length === 0) return;
    var minVal = Math.min.apply(null, allVals), maxVal = Math.max.apply(null, allVals);
    var buffer = (maxVal - minVal) * 0.1 || (maxVal * 0.05) || 1;
    minVal -= buffer; maxVal += buffer;

    drawGridAndYAxis(ctx, w, h, minVal, maxVal, padding, opts.formatY);

    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;
    var n0 = Math.max.apply(null, series.map(function (sr) { return sr.values.length; }));
    var stepX0 = n0 > 1 ? chartW / (n0 - 1) : chartW;

    series.forEach(function (sr) {
      var n = sr.values.length;
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

    ctx.font = '10px ' + THEME.fontFamily;
    ctx.fillStyle = THEME.textColor;
    ctx.textAlign = 'center';
    [0, Math.floor(n0 / 2), n0 - 1].forEach(function (idx) {
      if (labels[idx]) ctx.fillText(labels[idx], padding.left + idx * stepX0, h - 6);
    });
  }

  function renderIndicatorChart(canvas, opts) {
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx, w = setup.width, h = setup.height;
    var labels = opts.labels || [], lines = opts.lines || [], bars = opts.bars || null;
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

  function renderGroupedBarChart(canvas, opts) {
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx, w = setup.width, h = setup.height;
    var labels = opts.labels || [], series = opts.series || [];
    if (labels.length === 0 || series.length === 0) return;

    var padding = { top: 20, right: 15, bottom: 25, left: 45 };
    var allVals = [];
    series.forEach(function (s) { allVals = allVals.concat(s.data); });
    var dataMin = Math.min.apply(null, allVals), dataMax = Math.max.apply(null, allVals);
    var minVal = Math.min(0, dataMin), maxVal = Math.max(0, dataMax);
    if (minVal < 0) minVal = minVal * 1.1;
    if (maxVal > 0) maxVal = maxVal * 1.15;
    if (maxVal === minVal) maxVal = minVal + 1;

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
        var yZero = padding.top + chartH - ((0 - minVal) / (maxVal - minVal)) * chartH;
        var yVal = padding.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
        var barX = groupX + sIdx * barW;
        var barY = Math.min(yZero, yVal);
        var barH = Math.abs(yZero - yVal);
        if (barH < 0.5) return;

        var negColor = s.negColor || (sIdx === 0 ? '#ef4444' : '#b91c1c');
        var barColor = (s.colors && s.colors[gIdx]) || s.color || THEME.purple;
        ctx.fillStyle = val < 0 ? negColor : barColor;
        ctx.beginPath();
        var radii = val >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3];
        ctx.roundRect ? ctx.roundRect(barX, barY, barW - barPadding, barH, radii) : ctx.rect(barX, barY, barW - barPadding, barH);
        ctx.fill();
      });

      ctx.font = '10px ' + THEME.fontFamily;
      ctx.fillStyle = THEME.textColor;
      ctx.textAlign = 'center';
      ctx.fillText(label, groupX + (groupW - 16) / 2, h - 8);
    });
  }

  function renderDonutChart(canvas, opts) {
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx, w = setup.width, h = setup.height;
    var items = opts.data || [];
    var total = 0;
    items.forEach(function (it) { total += it.value; });
    if (total === 0) return;

    var centerX = w / 2, centerY = h / 2;
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

    if (opts.totalText) {
      var css = getComputedStyle(canvas);
      var textColor = css.getPropertyValue('--text-main').trim() || '#ffffff';
      var dimColor = css.getPropertyValue('--text-muted').trim() || THEME.textColor;
      ctx.font = 'bold 20px ' + THEME.fontFamily;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.totalText, centerX, centerY - 6);
      ctx.font = '10px ' + THEME.fontFamily;
      ctx.fillStyle = dimColor;
      ctx.fillText(opts.subText || 'Konsens', centerX, centerY + 14);
    }
  }

  function renderStackedBarChart(canvas, opts) {
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx, w = setup.width, h = setup.height;
    var labels = opts.labels || [], stacks = opts.stacks || [];
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

      ctx.font = '10px ' + THEME.fontFamily;
      ctx.fillStyle = THEME.textColor;
      ctx.textAlign = 'center';
      ctx.fillText(label, x + barW / 2, h - 8);
    });
  }

  function renderCandleChart(canvas, opts) {
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx, w = setup.width, h = setup.height;
    var candles = opts.candles || [], labels = opts.labels || [];
    if (candles.length === 0) return;

    var padding = { top: 16, right: 12, bottom: 25, left: 45 };
    var lo = Infinity, hi = -Infinity;
    candles.forEach(function (c) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); });
    (opts.lines || []).forEach(function (ln) {
      ln.values.forEach(function (v) {
        if (v !== null && v !== undefined && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      });
    });
    var pad = (hi - lo) * 0.06 || 1;
    var minVal = lo - pad, maxVal = hi + pad;

    drawGridAndYAxis(ctx, w, h, minVal, maxVal, padding, opts.formatY);

    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;
    var step = chartW / candles.length;
    var bodyW = Math.max(2, Math.min(14, step * 0.68));
    function xOf(i) { return padding.left + (i + 0.5) * step; }
    function yOf(v) { return padding.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH; }

    candles.forEach(function (c, i) {
      var up = c.c >= c.o;
      var color = up ? THEME.green : THEME.red;
      var x = xOf(i);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, yOf(c.h));
      ctx.lineTo(x, yOf(c.l));
      ctx.stroke();
      var yTop = yOf(Math.max(c.o, c.c));
      var yBot = yOf(Math.min(c.o, c.c));
      ctx.fillRect(x - bodyW / 2, yTop, bodyW, Math.max(1, yBot - yTop));
    });

    (opts.lines || []).forEach(function (ln) {
      ctx.strokeStyle = ln.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      var started = false;
      ln.values.forEach(function (v, i) {
        if (v === null || v === undefined || !isFinite(v)) return;
        if (!started) { ctx.moveTo(xOf(i), yOf(v)); started = true; } else { ctx.lineTo(xOf(i), yOf(v)); }
      });
      ctx.stroke();
    });

    ctx.font = '10px ' + THEME.fontFamily;
    ctx.fillStyle = THEME.textColor;
    ctx.textAlign = 'center';
    var n = candles.length;
    [0, Math.floor(n / 3), Math.floor(2 * n / 3), n - 1].forEach(function (idx, k, arr) {
      if (arr.indexOf(idx) !== k) return;
      var lx = Math.max(padding.left + 14, Math.min(w - padding.right - 14, xOf(idx)));
      if (labels[idx]) ctx.fillText(labels[idx], lx, h - 6);
    });
  }

  function renderRadarChart(canvas, opts) {
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx, w = setup.width, h = setup.height;
    var axes = opts.axes || [];
    var series = opts.series || [];
    if (axes.length < 3 || series.length === 0) return;

    var cx = w / 2, cy = h / 2;
    var radius = Math.min(w, h) / 2 - 34;
    var n = axes.length;
    var angleStep = (Math.PI * 2) / n;
    var startAngle = -Math.PI / 2;
    var maxVal = 5;

    var css = getComputedStyle(canvas);
    var dim = css.getPropertyValue('--text-dim').trim() || '#94a3b8';

    for (var ring = 1; ring <= 5; ring++) {
      ctx.beginPath();
      for (var i = 0; i <= n; i++) {
        var ang = startAngle + i * angleStep;
        var r = (ring / maxVal) * radius;
        var x = cx + Math.cos(ang) * r;
        var y = cy + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(148,163,184,.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (var a = 0; a < n; a++) {
      var angA = startAngle + a * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angA) * radius, cy + Math.sin(angA) * radius);
      ctx.strokeStyle = 'rgba(148,163,184,.22)';
      ctx.stroke();
    }

    ctx.font = '10px ' + THEME.fontFamily;
    ctx.fillStyle = dim;
    for (var la = 0; la < n; la++) {
      var angL = startAngle + la * angleStep;
      var lx = cx + Math.cos(angL) * (radius + 18);
      var ly = cy + Math.sin(angL) * (radius + 18);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(axes[la], lx, ly);
    }

    series.forEach(function (sr) {
      var vals = sr.values || [];
      ctx.beginPath();
      for (var i = 0; i <= n; i++) {
        var v = vals[i % n] || 0;
        var angS = startAngle + i * angleStep;
        var rS = (Math.max(0, Math.min(maxVal, v)) / maxVal) * radius;
        var xs = cx + Math.cos(angS) * rS;
        var ys = cy + Math.sin(angS) * rS;
        if (i === 0) ctx.moveTo(xs, ys); else ctx.lineTo(xs, ys);
      }
      ctx.closePath();
      ctx.strokeStyle = sr.color || THEME.purple;
      ctx.fillStyle = (sr.color || THEME.purple) + '22';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fill();
    });
  }

  function renderBandChart(canvas, opts) {
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx, w = setup.width, h = setup.height;
    var labels = opts.labels || [];
    var peValues = opts.peValues || [];
    if (labels.length === 0 || peValues.length === 0) return;

    var padding = { top: 16, right: 15, bottom: 25, left: 45 };
    var validVals = peValues.filter(function (v) { return v !== null && isFinite(v) && v > 0; });
    if (validVals.length === 0) return;
    var minVal = Math.min.apply(null, validVals);
    var maxVal = Math.max.apply(null, validVals);
    (opts.bands || []).forEach(function (b) {
      if (b.value && isFinite(b.value)) {
        if (b.value < minVal) minVal = b.value;
        if (b.value > maxVal) maxVal = b.value;
      }
    });
    var buffer = (maxVal - minVal) * 0.1 || 1;
    minVal -= buffer; maxVal += buffer;

    drawGridAndYAxis(ctx, w, h, minVal, maxVal, padding, opts.formatY);

    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;
    var stepX = peValues.length > 1 ? chartW / (peValues.length - 1) : chartW;
    function yOf(v) { return padding.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH; }

    (opts.bands || []).forEach(function (b) {
      if (b.value == null || !isFinite(b.value)) return;
      var y = yOf(b.value);
      ctx.save();
      ctx.strokeStyle = b.color || 'rgba(148,163,184,.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = b.color || dimColor(canvas);
      ctx.font = '9px ' + THEME.fontFamily;
      ctx.textAlign = 'right';
      ctx.fillText(b.label || '', w - padding.right - 2, y - 3);
    });

    var started = false;
    ctx.beginPath();
    peValues.forEach(function (v, i) {
      if (v === null || !isFinite(v) || v <= 0) { started = false; return; }
      var x = padding.left + i * stepX;
      if (!started) { ctx.moveTo(x, yOf(v)); started = true; } else ctx.lineTo(x, yOf(v));
    });
    ctx.strokeStyle = THEME.purpleLight;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();

    ctx.font = '10px ' + THEME.fontFamily;
    ctx.fillStyle = THEME.textColor;
    ctx.textAlign = 'center';
    [0, Math.floor(labels.length / 2), labels.length - 1].forEach(function (idx) {
      if (labels[idx]) ctx.fillText(labels[idx], padding.left + idx * stepX, h - 6);
    });
  }

  function dimColor(canvas) {
    var css = getComputedStyle(canvas);
    return css.getPropertyValue('--text-dim').trim() || '#94a3b8';
  }

  return {
    renderLineChart: renderLineChart,
    renderMultiLineChart: renderMultiLineChart,
    renderIndicatorChart: renderIndicatorChart,
    renderGroupedBarChart: renderGroupedBarChart,
    renderCandleChart: renderCandleChart,
    renderDonutChart: renderDonutChart,
    renderStackedBarChart: renderStackedBarChart,
    renderRadarChart: renderRadarChart,
    renderBandChart: renderBandChart
  };
})();
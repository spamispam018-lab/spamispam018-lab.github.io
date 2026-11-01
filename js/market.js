/**
 * js/market.js
 * Marktübersicht (#/market):
 * - Heatmap der Sektoren (Fläche = Marktkapitalisierung, Farbe = kapitalgewichtete Performance)
 * - Drilldown in einen Sektor: Heatmap der Einzelwerte + Branchen-Ranking
 * - Top-/Flop-Listen für den gewählten Zeitraum
 * Datenquelle: data/universe.json (changePercent, perf1w, perf1m, perf3m, perfYtd, perf52w, marketCap).
 */

window.App = window.App || {};

window.App.Market = (function () {
  'use strict';

  var PERIODS = [
    { key: 'changePercent', label: '1T',  scale: 3 },
    { key: 'perf1w',        label: '1W',  scale: 5 },
    { key: 'perf1m',        label: '1M',  scale: 10 },
    { key: 'perf3m',        label: '3M',  scale: 15 },
    { key: 'perfYtd',       label: 'YTD', scale: 30 },
    { key: 'perf52w',       label: '1J',  scale: 40 }
  ];

  var LARGE_CAP_MIN = 10e9;   // 10 Mrd. € (Daten sind in EUR umgerechnet)
  var MAX_STOCK_TILES = 40;

  var state = { period: 'perf1m', sector: null, largeOnly: true };
  var universe = [];
  var styleInjected = false;

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    var css = '' +
      '.hm-wrap{position:relative;width:100%;border-radius:var(--radius-md);overflow:hidden;background:var(--bg-tertiary);}' +
      '.hm-tile{position:absolute;box-sizing:border-box;border:1.5px solid var(--bg-primary);border-radius:6px;' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;' +
        'overflow:hidden;cursor:pointer;color:#fff;padding:2px;line-height:1.15;}' +
      '.hm-tile .hm-name{font-weight:700;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.hm-tile .hm-val{font-weight:600;opacity:.92;font-variant-numeric:tabular-nums;}' +
      '.hm-legend{display:flex;align-items:center;gap:8px;font-size:.66rem;color:var(--text-dim);margin-top:8px;}' +
      '.hm-legend-bar{flex:1;height:6px;border-radius:3px;background:linear-gradient(90deg,rgba(239,68,68,.9),rgba(100,116,139,.3),rgba(16,185,129,.9));}' +
      '.mk-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 2px;' +
        'border-bottom:1px solid var(--border-subtle);cursor:pointer;}' +
      '.mk-row:last-child{border-bottom:0;}' +
      '.mk-left{display:flex;align-items:center;gap:8px;min-width:0;}' +
      '.mk-name{font-size:.8rem;font-weight:600;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.mk-val{font-size:.82rem;font-weight:700;font-variant-numeric:tabular-nums;flex-shrink:0;}' +
      '.mk-val.up{color:var(--bullish);}.mk-val.down{color:var(--bearish);}.mk-val.na{color:var(--text-dim);}' +
      '.mk-track{position:relative;height:5px;background:var(--bg-tertiary);border-radius:3px;margin-top:6px;}' +
      '.mk-track::after{content:"";position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--border-color);}' +
      '.mk-bar{position:absolute;top:0;bottom:0;border-radius:3px;}' +
      '.mk-bar.up{left:50%;background:var(--bullish);}.mk-bar.down{right:50%;background:var(--bearish);}' +
      '.mk-stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;}' +
      '.mk-stat{background:var(--bg-tertiary);border-radius:var(--radius-sm);padding:10px 8px;text-align:center;}' +
      '.mk-stat-label{font-size:.62rem;color:var(--text-dim);text-transform:uppercase;font-weight:600;letter-spacing:.03em;}' +
      '.mk-stat-value{font-size:.98rem;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums;}';
    var el = document.createElement('style');
    el.setAttribute('data-market', '1');
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ---------------------------------------------------------------------------
  // Helfer
  // ---------------------------------------------------------------------------
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function isNum(v) { return v !== null && v !== undefined && v !== '' && !isNaN(Number(v)); }

  function periodInfo() {
    return PERIODS.filter(function (p) { return p.key === state.period; })[0] || PERIODS[2];
  }

  function fmtPct(v, d) {
    if (!isNum(v)) return '—';
    var n = Number(v);
    return (n > 0 ? '+' : '') + window.App.Format.number(n, d === undefined ? 1 : d) + ' %';
  }

  function cls(v) { return !isNum(v) ? 'na' : (Number(v) >= 0 ? 'up' : 'down'); }

  /** Farbe: Rot (negativ) – Grau (0) – Grün (positiv), Sättigung nach Betrag relativ zur Skala. */
  function colorFor(v) {
    if (!isNum(v)) return 'rgba(100,116,139,0.28)';
    var scale = periodInfo().scale;
    var t = Math.min(1, Math.abs(Number(v)) / scale);
    var alpha = 0.28 + t * 0.62;
    return Number(v) >= 0
      ? 'rgba(16,185,129,' + alpha.toFixed(2) + ')'
      : 'rgba(239,68,68,' + alpha.toFixed(2) + ')';
  }

  function capWeightedAvg(list, key) {
    var sum = 0, wsum = 0;
    list.forEach(function (s) {
      var v = s[key], w = Number(s.marketCap);
      if (!isNum(v) || !isFinite(w) || w <= 0) return;
      // Extremwerte begrenzen, damit einzelne Ausreißer nicht dominieren
      var capped = Math.max(-100, Math.min(300, Number(v)));
      sum += capped * w; wsum += w;
    });
    return wsum > 0 ? sum / wsum : null;
  }

  function sumCap(list) {
    return list.reduce(function (a, s) { return a + (Number(s.marketCap) > 0 ? Number(s.marketCap) : 0); }, 0);
  }

  function groupBy(list, fn) {
    var g = {};
    list.forEach(function (s) {
      var k = fn(s);
      if (!k) return;
      (g[k] = g[k] || []).push(s);
    });
    return g;
  }

  // ---------------------------------------------------------------------------
  // Treemap (Squarified)
  // ---------------------------------------------------------------------------
  function worstRatio(row, side) {
    var s = 0, mx = 0, mn = Infinity;
    row.forEach(function (it) { s += it.area; if (it.area > mx) mx = it.area; if (it.area < mn) mn = it.area; });
    if (s === 0 || mn === 0) return Infinity;
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  }

  /** items: [{ value, ... }] (absteigend sortiert). Gibt [{ item, x, y, w, h }] zurück. */
  function squarify(items, W, H) {
    var total = items.reduce(function (a, it) { return a + it.value; }, 0);
    if (!total) return [];
    var nodes = items.map(function (it) { return { it: it, area: (it.value / total) * W * H }; });
    var rects = [];
    var x = 0, y = 0, w = W, h = H;

    while (nodes.length) {
      var side = Math.min(w, h);
      var row = [nodes[0]];
      var i = 1;
      while (i < nodes.length && worstRatio(row.concat([nodes[i]]), side) <= worstRatio(row, side)) {
        row.push(nodes[i]); i++;
      }
      var rowArea = row.reduce(function (a, n) { return a + n.area; }, 0);
      if (w >= h) {
        var cw = rowArea / h, cy = y;
        row.forEach(function (n) {
          var ch = n.area / cw;
          rects.push({ item: n.it, x: x, y: cy, w: cw, h: ch });
          cy += ch;
        });
        x += cw; w -= cw;
      } else {
        var rh = rowArea / w, cx = x;
        row.forEach(function (n) {
          var cw2 = n.area / rh;
          rects.push({ item: n.it, x: cx, y: y, w: cw2, h: rh });
          cx += cw2;
        });
        y += rh; h -= rh;
      }
      nodes = nodes.slice(row.length);
    }
    return rects;
  }

  function treemapHtml(items, W, H, attr) {
    var rects = squarify(items, W, H);
    var html = '';
    rects.forEach(function (r) {
      var it = r.item;
      var minSide = Math.min(r.w, r.h);
      var nameSize = Math.max(8, Math.min(15, minSide / 4.2));
      var showName = r.w >= 34 && r.h >= 24;
      var showVal = r.w >= 40 && r.h >= 38;
      html += '<div class="hm-tile" ' + attr + '="' + esc(it.id) + '" style="left:' + r.x.toFixed(1) + 'px;top:' + r.y.toFixed(1) +
        'px;width:' + r.w.toFixed(1) + 'px;height:' + r.h.toFixed(1) + 'px;background:' + colorFor(it.perf) + ';">' +
        (showName ? '<div class="hm-name" style="font-size:' + nameSize.toFixed(1) + 'px;">' + esc(it.label) + '</div>' : '') +
        (showVal ? '<div class="hm-val" style="font-size:' + Math.max(8, nameSize - 1).toFixed(1) + 'px;">' + fmtPct(it.perf, 1) + '</div>' : '') +
        '</div>';
    });
    return html;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;
    injectStyles();

    var headerFilterBtn = document.getElementById('btn-header-filter');
    if (headerFilterBtn) headerFilterBtn.style.display = 'none';

    container.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Lade Marktdaten...</p></div>';

    window.App.Data.getUniverse().then(function (u) {
      universe = u || [];
      draw(container);
    });
  }

  function barRow(label, sub, value, maxAbs, attr, id) {
    var width = isNum(value) ? Math.max(1, Math.round(Math.abs(Number(value)) / maxAbs * 50)) : 0;
    return '' +
      '<div class="mk-row" style="display:block;" ' + (attr ? attr + '="' + esc(id) + '"' : '') + '>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
          '<div class="mk-left"><span class="mk-name">' + label + '</span>' +
            (sub ? '<span style="font-size:.68rem;color:var(--text-dim);flex-shrink:0;">' + sub + '</span>' : '') + '</div>' +
          '<span class="mk-val ' + cls(value) + '">' + fmtPct(value, 2) + '</span>' +
        '</div>' +
        '<div class="mk-track">' +
          (isNum(value) ? '<div class="mk-bar ' + (Number(value) >= 0 ? 'up' : 'down') + '" style="width:' + width + '%;"></div>' : '') +
        '</div>' +
      '</div>';
  }

  function stockRow(s, key) {
    return '' +
      '<div class="mk-row" data-mk-ticker="' + esc(s.ticker) + '">' +
        '<div class="mk-left"><span class="ticker-badge">' + esc(s.ticker) + '</span>' +
          '<span class="mk-name">' + esc(s.name || '') + '</span></div>' +
        '<span class="mk-val ' + cls(s[key]) + '">' + fmtPct(s[key], 2) + '</span>' +
      '</div>';
  }

  function draw(container) {
    var p = periodInfo();
    var key = p.key;
    var pool = state.sector
      ? universe.filter(function (s) { return s.sector === state.sector; })
      : universe;

    var valid = pool.filter(function (s) { return isNum(s[key]); });
    var up = valid.filter(function (s) { return Number(s[key]) > 0; }).length;
    var breadth = valid.length ? (up / valid.length) * 100 : null;
    var avg = capWeightedAvg(valid, key);
    var sorted = valid.map(function (s) { return Number(s[key]); }).sort(function (a, b) { return a - b; });
    var med = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;

    var html = '';

    // Zeitraum
    html += '<div class="horizontal-scroll-row" style="margin-bottom:12px;">';
    PERIODS.forEach(function (pp) {
      html += '<button class="sub-tab-btn ' + (pp.key === key ? 'active' : '') + '" data-mk-period="' + pp.key + '">' + pp.label + '</button>';
    });
    html += '</div>';

    // Kennzahlen
    html += '<div class="card"><div class="card-header-dotted"><span class="card-title">' +
      (state.sector ? esc(state.sector) : 'Gesamtmarkt') + ' · ' + p.label + '</span>' +
      '<span class="sector-label">' + valid.length + ' Aktien</span></div>' +
      '<div class="mk-stats">' +
        '<div class="mk-stat"><div class="mk-stat-label">Ø gewichtet</div><div class="mk-stat-value mk-val ' + cls(avg) + '">' + fmtPct(avg, 2) + '</div></div>' +
        '<div class="mk-stat"><div class="mk-stat-label">Median</div><div class="mk-stat-value mk-val ' + cls(med) + '">' + fmtPct(med, 2) + '</div></div>' +
        '<div class="mk-stat"><div class="mk-stat-label">Im Plus</div><div class="mk-stat-value">' +
          (breadth === null ? '—' : window.App.Format.number(breadth, 0) + ' %') + '</div></div>' +
      '</div></div>';

    // Heatmap
    var ratio = state.sector ? 1.05 : 0.95;
    var pendingMap = null;
    html += '<div class="card"><div class="card-header-dotted"><span class="card-title">' +
      (state.sector ? 'Heatmap ' + esc(state.sector) : 'Sektor-Heatmap') + '</span>';
    if (state.sector) {
      html += '<button class="chip-btn" id="mk-back" style="padding:3px 10px;font-size:.72rem;">← Alle Sektoren</button>';
    } else {
      html += '<span class="sector-label">Fläche = Marktkap.</span>';
    }
    html += '</div>';

    if (!state.sector) {
      var groups = groupBy(universe, function (s) { return s.sector; });
      var items = Object.keys(groups).map(function (sec) {
        var g = groups[sec];
        return { id: sec, label: sec, value: Math.sqrt(sumCap(g)), perf: capWeightedAvg(g.filter(function (s) { return isNum(s[key]); }), key) };
      }).filter(function (it) { return it.value > 0; })
        .sort(function (a, b) { return b.value - a.value; });
      pendingMap = { items: items, attr: 'data-mk-sector' };
      html += '<div class="hm-wrap" id="mk-map"></div>';
    } else {
      var stocks = pool.filter(function (s) { return Number(s.marketCap) > 0; })
        .sort(function (a, b) { return Number(b.marketCap) - Number(a.marketCap); })
        .slice(0, MAX_STOCK_TILES);
      var sItems = stocks.map(function (s) {
        return { id: s.ticker, label: s.ticker, value: Math.sqrt(Number(s.marketCap)), perf: isNum(s[key]) ? Number(s[key]) : null };
      });
      pendingMap = { items: sItems, attr: 'data-mk-ticker' };
      html += '<div class="hm-wrap" id="mk-map"></div>';
      if (pool.length > MAX_STOCK_TILES) {
        html += '<div style="font-size:.68rem;color:var(--text-dim);margin-top:6px;">Die ' + MAX_STOCK_TILES + ' größten von ' + pool.length + ' Aktien.</div>';
      }
    }
    html += '<div class="hm-legend"><span>−' + p.scale + ' %</span><div class="hm-legend-bar"></div><span>+' + p.scale + ' %</span></div>';
    html += '<div style="font-size:.68rem;color:var(--text-dim);margin-top:6px;">Tipp: Kachel antippen, um ' +
      (state.sector ? 'die Aktie zu öffnen.' : 'in den Sektor zu wechseln.') + '</div></div>';

    // Ranking der Sektoren bzw. Branchen
    var rankGroups = state.sector
      ? groupBy(pool, function (s) { return s.industry; })
      : groupBy(universe, function (s) { return s.sector; });
    var rank = Object.keys(rankGroups).map(function (k) {
      var g = rankGroups[k].filter(function (s) { return isNum(s[key]); });
      return { name: k, n: rankGroups[k].length, perf: capWeightedAvg(g, key) };
    }).filter(function (r) { return r.perf !== null; })
      .sort(function (a, b) { return b.perf - a.perf; });

    if (rank.length > 1) {
      var maxAbs = 0.0001;
      rank.forEach(function (r) { maxAbs = Math.max(maxAbs, Math.abs(r.perf)); });
      html += '<div class="card"><div class="card-header-dotted"><span class="card-title">' +
        (state.sector ? 'Branchen' : 'Sektoren') + ' im Vergleich</span></div>';
      rank.forEach(function (r) {
        html += barRow(esc(r.name), r.n + ' Aktien', r.perf, maxAbs, state.sector ? '' : 'data-mk-sector', r.name);
      });
      html += '</div>';
    }

    // Top / Flop
    var movers = valid.filter(function (s) { return !state.largeOnly || Number(s.marketCap) >= LARGE_CAP_MIN; })
      .slice().sort(function (a, b) { return Number(b[key]) - Number(a[key]); });
    var top = movers.slice(0, 5);
    var flop = movers.slice(-5).reverse();

    html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Top & Flop · ' + p.label + '</span>' +
      '<button class="chip-btn ' + (state.largeOnly ? 'active' : '') + '" id="mk-large" style="padding:3px 10px;font-size:.72rem;">' +
      'Nur &gt; 10 Mrd. €</button></div>';
    if (movers.length < 2) {
      html += '<div style="font-size:.8rem;color:var(--text-dim);">Keine Daten für diesen Zeitraum.</div>';
    } else {
      html += '<div style="font-size:.68rem;color:var(--text-dim);font-weight:700;text-transform:uppercase;margin:2px 0;">Gewinner</div>';
      top.forEach(function (s) { html += stockRow(s, key); });
      html += '<div style="font-size:.68rem;color:var(--text-dim);font-weight:700;text-transform:uppercase;margin:12px 0 2px;">Verlierer</div>';
      flop.forEach(function (s) { html += stockRow(s, key); });
    }
    html += '</div>';

    if (key !== 'changePercent' && valid.length === 0) {
      html += '<p style="font-size:.72rem;color:var(--text-dim);padding:0 4px;">Für diesen Zeitraum liegen noch keine Daten vor – sie erscheinen nach dem nächsten Daten-Update.</p>';
    }

    container.innerHTML = '<div class="view-container">' + html + '</div>';

    // Heatmap erst nach dem Einfügen aufbauen, damit die echte Breite des Containers verwendet wird
    var holder = container.querySelector('#mk-map');
    if (holder && pendingMap) {
      var W = Math.floor(holder.getBoundingClientRect().width) || 300;
      var H = Math.round(W * ratio);
      holder.style.height = H + 'px';
      holder.innerHTML = treemapHtml(pendingMap.items, W, H, pendingMap.attr);
    }
    bind(container);
  }

  function bind(container) {
    container.querySelectorAll('[data-mk-period]').forEach(function (b) {
      b.onclick = function () { state.period = b.getAttribute('data-mk-period'); draw(container); window.scrollTo(0, 0); };
    });
    container.querySelectorAll('[data-mk-sector]').forEach(function (b) {
      b.onclick = function () { state.sector = b.getAttribute('data-mk-sector'); draw(container); window.scrollTo(0, 0); };
    });
    container.querySelectorAll('[data-mk-ticker]').forEach(function (b) {
      b.onclick = function () {
        var t = b.getAttribute('data-mk-ticker');
        window.App.Data.setLastTicker(t);
        window.App.Router.navigate('/stock/' + t + '/overview');
      };
    });
    var back = container.querySelector('#mk-back');
    if (back) back.onclick = function () { state.sector = null; draw(container); window.scrollTo(0, 0); };
    var large = container.querySelector('#mk-large');
    if (large) large.onclick = function () { state.largeOnly = !state.largeOnly; draw(container); };
  }

  return { initView: initView };
})();

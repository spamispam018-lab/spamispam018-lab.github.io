/**
 * js/stock-peers.js
 * Peer-Vergleich mit Multi-Metric-Ranking (NEU: 10 Kennzahlen farbcodiert).
 */
window.App = window.App || {};

window.App.StockPeers = (function () {
  'use strict';

  var PERIODS = [
    { key: 'changePercent', label: '1T' },
    { key: 'perf1w', label: '1W' },
    { key: 'perf1m', label: '1M' },
    { key: 'perf3m', label: '3M' },
    { key: 'perfYtd', label: 'YTD' },
    { key: 'perf52w', label: '1J' }
  ];

  var DEFAULT_VISIBLE = 12;
  var MIN_INDUSTRY_PEERS = 4;

  var state = {
    period: 'perf1m',
    scope: null,
    showAll: false,
    ticker: null,
    view: 'perf' // 'perf' | 'ranking'
  };

  var styleInjected = false;

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    var css = '' +
      '.peer-row{display:block;width:100%;text-align:left;background:transparent;border:0;' +
        'border-bottom:1px solid var(--border-subtle);padding:10px 4px;cursor:pointer;color:inherit;font:inherit;}' +
      '.peer-row:last-child{border-bottom:0;}' +
      '.peer-row.self{background:var(--accent-purple-glow);border-radius:var(--radius-sm);border-bottom-color:transparent;}' +
      '.peer-row-top{display:flex;align-items:center;justify-content:space-between;gap:10px;}' +
      '.peer-name{font-size:0.82rem;font-weight:600;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.peer-left{display:flex;align-items:center;gap:8px;min-width:0;}' +
      '.peer-rank{font-size:0.68rem;color:var(--text-dim);width:18px;flex-shrink:0;font-variant-numeric:tabular-nums;}' +
      '.peer-val{font-size:0.82rem;font-weight:700;font-variant-numeric:tabular-nums;flex-shrink:0;}' +
      '.peer-val.up{color:var(--bullish);} .peer-val.down{color:var(--bearish);} .peer-val.na{color:var(--text-dim);}' +
      '.peer-track{position:relative;height:5px;margin-top:7px;background:var(--bg-tertiary);border-radius:3px;}' +
      '.peer-track::after{content:"";position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--border-color);}' +
      '.peer-bar{position:absolute;top:0;bottom:0;border-radius:3px;}' +
      '.peer-bar.up{left:50%;background:var(--bullish);}' +
      '.peer-bar.down{right:50%;background:var(--bearish);}' +
      '.peer-row.self .peer-bar.up,.peer-row.self .peer-bar.down{background:var(--accent-purple-light);}' +
      '.peer-summary{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;}' +
      '.peer-sum-cell{background:var(--bg-tertiary);border-radius:var(--radius-sm);padding:10px 8px;text-align:center;}' +
      '.peer-sum-label{font-size:0.62rem;color:var(--text-dim);text-transform:uppercase;font-weight:600;letter-spacing:.03em;}' +
      '.peer-sum-value{font-size:0.98rem;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums;}' +
      '.ranking-table{width:100%;border-collapse:collapse;font-size:0.72rem;}' +
      '.ranking-table th{background:var(--bg-tertiary);color:var(--text-dim);padding:8px 4px;font-weight:600;text-align:center;border-bottom:1px solid var(--border-color);font-size:0.68rem;text-transform:uppercase;letter-spacing:0.02em;}' +
      '.ranking-table th:first-child{text-align:left;padding-left:8px;}' +
      '.ranking-table td{padding:6px 4px;text-align:center;border-bottom:1px solid var(--border-subtle);font-variant-numeric:tabular-nums;}' +
      '.ranking-table td:first-child{text-align:left;padding-left:8px;font-weight:600;}' +
      '.ranking-table tr.self td{background:var(--accent-purple-glow);}';
    var el = document.createElement('style');
    el.setAttribute('data-peers', '1');
    el.textContent = css;
    document.head.appendChild(el);
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function isNum(v) {
    return v !== null && v !== undefined && v !== '' && !isNaN(Number(v));
  }

  function median(arr) {
    if (!arr.length) return null;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function fmtPct(v) {
    return isNum(v) ? window.App.Format.percent(v, true, 2) : '—';
  }

  function valClass(v) {
    if (!isNum(v)) return 'na';
    return Number(v) >= 0 ? 'up' : 'down';
  }

  function render(container, stock) {
    if (!container || !stock) return;
    injectStyles();
    var profile = stock.profile || {};
    var ticker = (stock.ticker || profile.ticker || '').toUpperCase();
    if (state.ticker !== ticker) {
      state.ticker = ticker;
      state.scope = null;
      state.showAll = false;
    }
    container.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Lade Vergleichsaktien...</p></div>';
    window.App.Data.getUniverse().then(function (universe) {
      if (!document.body.contains(container)) return;
      draw(container, stock, ticker, universe || []);
    });
  }

  function draw(container, stock, ticker, universe) {
    var profile = stock.profile || {};
    var self = null;
    universe.forEach(function (u) { if (u.ticker === ticker) self = u; });

    var sector = (self && self.sector) || profile.sector || '';
    var industry = (self && self.industry) || profile.industry || '';

    var industryPeers = industry && industry !== 'N/A' ? universe.filter(function (u) { return u.industry === industry; }) : [];
    var sectorPeers = sector ? universe.filter(function (u) { return u.sector === sector; }) : [];

    var scope = state.scope;
    if (!scope) scope = industryPeers.length >= MIN_INDUSTRY_PEERS ? 'industry' : 'sector';
    if (scope === 'industry' && !industryPeers.length) scope = 'sector';

    var group = scope === 'industry' ? industryPeers : sectorPeers;
    var groupLabel = scope === 'industry' ? industry : sector;

    var hasSelf = group.some(function (u) { return u.ticker === ticker; });
    if (!hasSelf) {
      var q = stock.quote || {};
      var base = self || {
        ticker: ticker, name: profile.name || ticker, sector: sector, industry: industry,
        marketCap: q.marketCap, changePercent: q.changePercent
      };
      group = group.concat([base]);
    }

    var html = '';
    html += '<div class="horizontal-scroll-row" style="margin-bottom: 8px;">';
    html += '<button class="chip-btn ' + (state.view === 'perf' ? 'active' : '') + '" data-peer-view="perf">Performance</button>';
    html += '<button class="chip-btn ' + (state.view === 'ranking' ? 'active' : '') + '" data-peer-view="ranking">Kennzahlen-Ranking</button>';
    html += '</div>';

    html += '<div class="horizontal-scroll-row" style="margin-bottom: 10px;">';
    if (industryPeers.length) html += '<button class="chip-btn ' + (scope === 'industry' ? 'active' : '') + '" data-peer-scope="industry">Branche · ' + esc(industry) + ' (' + industryPeers.length + ')</button>';
    if (sectorPeers.length) html += '<button class="chip-btn ' + (scope === 'sector' ? 'active' : '') + '" data-peer-scope="sector">Sektor · ' + esc(sector) + ' (' + sectorPeers.length + ')</button>';
    html += '</div>';

    if (state.view === 'ranking') {
      html += renderRankingTable(group, ticker, groupLabel);
    } else {
      html += renderPerformanceView(group, ticker, groupLabel);
    }

    html += '<p style="font-size:0.68rem;color:var(--text-dim);padding:4px 4px 0;">Tipp: Zeile antippen, um die Aktie zu öffnen.</p>';

    container.innerHTML = html;

    container.querySelectorAll('[data-peer-view]').forEach(function (btn) {
      btn.onclick = function () {
        state.view = btn.getAttribute('data-peer-view');
        draw(container, stock, ticker, universe);
      };
    });
    container.querySelectorAll('[data-peer-scope]').forEach(function (btn) {
      btn.onclick = function () {
        state.scope = btn.getAttribute('data-peer-scope');
        state.showAll = false;
        draw(container, stock, ticker, universe);
      };
    });
    container.querySelectorAll('[data-peer-period]').forEach(function (btn) {
      btn.onclick = function () {
        state.period = btn.getAttribute('data-peer-period');
        draw(container, stock, ticker, universe);
      };
    });
    container.querySelectorAll('[data-peer-ticker]').forEach(function (btn) {
      btn.onclick = function () {
        var t = btn.getAttribute('data-peer-ticker');
        if (t && t !== ticker) window.App.Router.navigate('/stock/' + t + '/peers');
      };
    });
    var showAll = container.querySelector('#peer-show-all');
    if (showAll) showAll.onclick = function () { state.showAll = true; draw(container, stock, ticker, universe); };
    var showLess = container.querySelector('#peer-show-less');
    if (showLess) showLess.onclick = function () { state.showAll = false; draw(container, stock, ticker, universe); };
  }

  function renderPerformanceView(group, ticker, groupLabel) {
    var key = state.period;
    var rows = group.map(function (u) {
      return { u: u, v: isNum(u[key]) ? Number(u[key]) : null, isSelf: u.ticker === ticker };
    });
    rows.sort(function (a, b) {
      if (a.v === null && b.v === null) return 0;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      return b.v - a.v;
    });
    var valid = rows.filter(function (r) { return r.v !== null; });
    var peersOnly = valid.filter(function (r) { return !r.isSelf; });
    var selfRow = rows.filter(function (r) { return r.isSelf; })[0];
    var selfRank = selfRow && selfRow.v !== null ? valid.indexOf(selfRow) + 1 : null;
    var med = median(peersOnly.map(function (r) { return r.v; }));
    var diff = (selfRow && selfRow.v !== null && med !== null) ? selfRow.v - med : null;

    var displayRows = rows, truncated = false;
    if (!state.showAll && rows.length > DEFAULT_VISIBLE) {
      var byCap = rows.slice().sort(function (a, b) { return (Number(b.u.marketCap) || 0) - (Number(a.u.marketCap) || 0); });
      var keep = {};
      byCap.slice(0, DEFAULT_VISIBLE).forEach(function (r) { keep[r.u.ticker] = true; });
      keep[ticker] = true;
      displayRows = rows.filter(function (r) { return keep[r.u.ticker]; });
      truncated = true;
    }

    var maxAbs = 0;
    displayRows.forEach(function (r) { if (r.v !== null) maxAbs = Math.max(maxAbs, Math.abs(r.v)); });
    if (maxAbs === 0) maxAbs = 1;
    var periodLabel = PERIODS.filter(function (p) { return p.key === key; })[0].label;

    var html = '<div class="horizontal-scroll-row" style="margin-bottom: 14px;">';
    PERIODS.forEach(function (p) {
      html += '<button class="sub-tab-btn ' + (p.key === key ? 'active' : '') + '" data-peer-period="' + p.key + '">' + p.label + '</button>';
    });
    html += '</div>';

    html += '<div class="card"><div class="card-header-dotted"><span class="card-title">' + esc(groupLabel || 'Vergleichsgruppe') + ' · ' + periodLabel + '</span>' +
      '<span class="sector-label">' + valid.length + ' Aktien</span></div>' +
      '<div class="peer-summary">' +
        '<div class="peer-sum-cell"><div class="peer-sum-label">' + esc(ticker) + '</div><div class="peer-sum-value peer-val ' + valClass(selfRow ? selfRow.v : null) + '">' + fmtPct(selfRow ? selfRow.v : null) + '</div></div>' +
        '<div class="peer-sum-cell"><div class="peer-sum-label">Median Peers</div><div class="peer-sum-value peer-val ' + valClass(med) + '">' + fmtPct(med) + '</div></div>' +
        '<div class="peer-sum-cell"><div class="peer-sum-label">Rang</div><div class="peer-sum-value">' + (selfRank ? selfRank + ' <span style="font-size:0.7rem;color:var(--text-dim);font-weight:600;">/ ' + valid.length + '</span>' : '—') + '</div></div>' +
      '</div>';
    if (diff !== null) {
      var better = diff >= 0;
      html += '<p style="margin-top:12px;font-size:0.78rem;color:var(--text-muted);line-height:1.45;">' + esc(ticker) +
        ' liegt über ' + periodLabel + ' <strong class="peer-val ' + (better ? 'up' : 'down') + '">' +
        window.App.Format.number(Math.abs(diff), 2) + ' Prozentpunkte ' + (better ? 'vor' : 'hinter') + '</strong> dem Peer-Median.</p>';
    }
    html += '</div>';

    html += '<div class="card" style="padding: 8px 12px;">';
    if (rows.length <= 1) {
      html += '<div class="state-box"><p>Keine Vergleichsaktien gefunden.</p></div>';
    } else {
      displayRows.forEach(function (r) {
        var u = r.u;
        var rank = r.v !== null ? (valid.indexOf(r) + 1) : '–';
        var width = r.v !== null ? Math.max(1, Math.round(Math.abs(r.v) / maxAbs * 50)) : 0;
        html += '<button class="peer-row ' + (r.isSelf ? 'self' : '') + '" data-peer-ticker="' + esc(u.ticker) + '">' +
          '<div class="peer-row-top"><div class="peer-left">' +
            '<span class="peer-rank">' + rank + '</span>' +
            '<span class="ticker-badge">' + esc(u.ticker) + '</span>' +
            '<span class="peer-name">' + esc(u.name || '') + '</span>' +
          '</div><span class="peer-val ' + valClass(r.v) + '">' + fmtPct(r.v) + '</span></div>' +
          '<div class="peer-track">' + (r.v !== null ? '<div class="peer-bar ' + (r.v >= 0 ? 'up' : 'down') + '" style="width:' + width + '%;"></div>' : '') + '</div>' +
        '</button>';
      });
      if (truncated) html += '<div style="text-align:center;padding:10px 0 4px;"><button class="chip-btn" id="peer-show-all">Alle ' + rows.length + ' anzeigen</button></div>';
      else if (state.showAll && rows.length > DEFAULT_VISIBLE) html += '<div style="text-align:center;padding:10px 0 4px;"><button class="chip-btn" id="peer-show-less">Weniger anzeigen</button></div>';
    }
    html += '</div>';
    return html;
  }

  // NEU: Multi-Metric-Ranking
  function renderRankingTable(group, ticker, groupLabel) {
    // Kennzahlen-Definitionen
    var metrics = [
      { key: 'pe', label: 'KGV', better: 'low', fn: function (u) { return isNum(u.pe) && u.pe > 0 ? u.pe : null; }, fmt: function (v) { return window.App.Format.number(v, 1); } },
      { key: 'forwardPe', label: 'Fwd KGV', better: 'low', fn: function (u) { return isNum(u.forwardPe) && u.forwardPe > 0 ? u.forwardPe : null; }, fmt: function (v) { return window.App.Format.number(v, 1); } },
      { key: 'dividendYield', label: 'Div %', better: 'high', fn: function (u) { return isNum(u.dividendYield) ? u.dividendYield : null; }, fmt: function (v) { return window.App.Format.number(v, 1); } },
      { key: 'revGrowth', label: 'Umsatz+', better: 'high', fn: function (u) { return isNum(u.revGrowth) ? u.revGrowth * 100 : null; }, fmt: function (v) { return window.App.Format.number(v, 1); } },
      { key: 'profitMargins', label: 'Marge', better: 'high', fn: function (u) { return isNum(u.profitMargins) ? u.profitMargins * 100 : null; }, fmt: function (v) { return window.App.Format.number(v, 1); } },
      { key: 'roa', label: 'ROA', better: 'high', fn: function (u) { return isNum(u.roa) ? u.roa * 100 : null; }, fmt: function (v) { return window.App.Format.number(v, 1); } },
      { key: 'debtToEquity', label: 'D/E', better: 'low', fn: function (u) { return isNum(u.debtToEquity) ? u.debtToEquity : null; }, fmt: function (v) { return window.App.Format.number(v, 0); } },
      { key: 'rsi', label: 'RSI', better: 'mid', fn: function (u) { return isNum(u.rsi) ? u.rsi : null; }, fmt: function (v) { return window.App.Format.number(v, 0); } },
      { key: 'perf52w', label: '52W %', better: 'high', fn: function (u) { return isNum(u.perf52w) ? u.perf52w : null; }, fmt: function (v) { return window.App.Format.number(v, 0); } }
    ];

    // Ränge berechnen
    var ranks = metrics.map(function (m) {
      var vals = group
        .map(function (u) { return { ticker: u.ticker, v: m.fn(u) }; })
        .filter(function (x) { return x.v !== null; })
        .sort(function (a, b) {
          if (m.better === 'high') return b.v - a.v;
          if (m.better === 'low') return a.v - b.v;
          return Math.abs(a.v - 50) - Math.abs(b.v - 50); // mid
        });
      var map = {};
      vals.forEach(function (x, i) { map[x.ticker] = i + 1; });
      return { metric: m, ranks: map, total: vals.length };
    });

    var maxRows = state.showAll ? group.length : Math.min(group.length, DEFAULT_VISIBLE);
    var displayGroup = group.slice(0, maxRows);

    // Sortiere: Selbst zuerst
    displayGroup.sort(function (a, b) {
      if (a.ticker === ticker) return -1;
      if (b.ticker === ticker) return 1;
      return (Number(b.marketCap) || 0) - (Number(a.marketCap) || 0);
    });

    function cellColor(rank, total) {
      if (rank === null || !total) return '';
      var pct = (rank - 1) / Math.max(1, total - 1);
      if (pct <= 0.33) return 'background:rgba(16,185,129,0.15);color:var(--bullish);font-weight:700;';
      if (pct >= 0.66) return 'background:rgba(239,68,68,0.12);color:var(--bearish);font-weight:700;';
      return 'color:var(--text-muted);';
    }

    var html = '<div class="card"><div class="card-header-dotted"><span class="card-title">Kennzahlen-Ranking · ' + esc(groupLabel || '') + '</span>' +
      '<span class="sector-label">' + group.length + ' Aktien</span></div>';
    html += '<div class="table-responsive-wrapper"><table class="ranking-table"><thead><tr><th>Aktie</th>';
    metrics.forEach(function (m) {
      html += '<th title="' + m.label + '">' + m.label + '</th>';
    });
    html += '</tr></thead><tbody>';

    displayGroup.forEach(function (u) {
      var isSelf = u.ticker === ticker;
      html += '<tr class="' + (isSelf ? 'self' : '') + '" data-peer-ticker="' + esc(u.ticker) + '" style="cursor:pointer;">';
      html += '<td><span class="ticker-badge" style="font-size:0.65rem;">' + esc(u.ticker) + '</span></td>';
      metrics.forEach(function (m, idx) {
        var v = m.fn(u);
        var rank = ranks[idx].ranks[u.ticker] || null;
        html += '<td style="' + cellColor(rank, ranks[idx].total) + '">' + (v !== null ? m.fmt(v) : '—') + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    if (group.length > DEFAULT_VISIBLE) {
      html += '<div style="text-align:center;margin-top:10px;">';
      if (state.showAll) {
        html += '<button class="chip-btn" id="peer-show-less">Weniger anzeigen</button>';
      } else {
        html += '<button class="chip-btn" id="peer-show-all">Alle ' + group.length + ' anzeigen</button>';
      }
      html += '</div>';
    }

    html += '<div class="chart-note" style="margin-top:10px;">Grün = besser als Peers, rot = schlechter. KGV, D/E: niedriger ist besser. Dividende, Wachstum, Marge, ROA, 52W: höher ist besser. RSI: 50 ist neutral.</div>';
    html += '</div>';
    return html;
  }

  return { render: render };
})();
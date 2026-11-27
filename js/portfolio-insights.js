/**
 * js/portfolio-insights.js – Depot: Verteilung, Klumpenrisiko und ETF-Überschneidung
 *
 * ETFs werden über ihre Top-10-Positionen durchgerechnet (js/etf-holdings.js): ein ETF mit 10.000 €
 * und 5 % NVIDIA zählt 500 € zu NVIDIA, zum Sektor Technologie und zur Region USA. Der Rest des ETFs,
 * dessen Positionen nicht bekannt sind, erscheint als "ETF-Rest (breit gestreut)".
 *
 * App.PortfolioInsights.render(host, rows, stocksData, totalValue)
 *   rows: [{ p: {ticker, shares}, u: Universums-Eintrag, v: Wert in € }]
 */
window.App = window.App || {};
window.App.PortfolioInsights = (function () {
  'use strict';

  var EUROPE = ['Germany', 'France', 'Netherlands', 'Spain', 'Italy', 'Switzerland', 'United Kingdom', 'Denmark', 'Sweden', 'Norway',
    'Finland', 'Belgium', 'Austria', 'Ireland', 'Portugal', 'Luxembourg', 'Poland', 'Jersey', 'Guernsey'];
  var ASIA = ['China', 'Japan', 'Taiwan', 'South Korea', 'Korea', 'India', 'Hong Kong', 'Singapore', 'Indonesia', 'Thailand', 'Malaysia', 'Philippines'];
  var EUR_LAND = ['Germany', 'France', 'Netherlands', 'Spain', 'Italy', 'Finland', 'Belgium', 'Austria', 'Ireland', 'Portugal', 'Luxembourg'];
  var CCY = { 'United States': 'USD', 'Switzerland': 'CHF', 'United Kingdom': 'GBP', 'Denmark': 'DKK', 'Sweden': 'SEK', 'Norway': 'NOK',
    'Japan': 'JPY', 'China': 'CNY/HKD', 'Hong Kong': 'CNY/HKD', 'Taiwan': 'TWD', 'South Korea': 'KRW', 'Korea': 'KRW', 'India': 'INR', 'Canada': 'CAD' };
  var SECTOR_DE = { 'Technology': 'Technologie', 'Healthcare': 'Gesundheit', 'Financial Services': 'Finanzen', 'Industrials': 'Industrie',
    'Consumer Cyclical': 'Zykl. Konsum', 'Consumer Defensive': 'Basiskonsum', 'Utilities': 'Versorger', 'Real Estate': 'Immobilien',
    'Basic Materials': 'Rohstoffe', 'Communication Services': 'Kommunikation', 'Energy': 'Energie' };
  var REST = 'ETF-Rest (breit gestreut)';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function region(country) {
    if (!country) return 'Unbekannt';
    if (country === 'United States') return 'USA';
    if (country === 'Germany') return 'Deutschland';
    if (EUROPE.indexOf(country) !== -1) return 'Europa (ohne DE)';
    if (ASIA.indexOf(country) !== -1) return 'Asien';
    return 'Sonstige';
  }
  function currency(country) {
    if (!country) return 'Unbekannt';
    if (EUR_LAND.indexOf(country) !== -1) return 'EUR';
    return CCY[country] || 'andere';
  }
  function isEtfRow(r, stock) {
    return !!(stock && stock.holdings && stock.holdings.length && window.App.EtfHoldings && window.App.EtfHoldings.isEtf(stock));
  }

  /** Alle Teil-Positionen: direkt gehaltene Aktien + durchgerechnete ETF-Positionen + ETF-Rest. */
  function lookThrough(rows, stocksData) {
    var stockBy = {};
    (stocksData || []).forEach(function (sd) { stockBy[sd.ticker] = sd.stock; });
    var parts = [], etfs = [];
    return Promise.all(rows.map(function (r) {
      var st = stockBy[r.p.ticker];
      if (!(r.v > 0)) return Promise.resolve();
      if (!isEtfRow(r, st)) {
        parts.push({ key: r.p.ticker, name: r.u.name || r.p.ticker, value: r.v, direct: r.v, via: 0, sector: r.u.sector, country: r.u.country });
        return Promise.resolve();
      }
      return window.App.EtfHoldings.match(st, 10).then(function (list) {
        var used = 0;
        var hold = [];
        list.forEach(function (h) {
          var val = r.v * (h.weight || 0) / 100;
          if (!(val > 0)) return;
          used += h.weight;
          var u = h.u || {};
          var key = h.ticker || ('n:' + window.App.EtfHoldings.norm(h.name));
          parts.push({ key: key, name: u.name || h.name, value: val, direct: 0, via: val, viaEtf: r.p.ticker, sector: u.sector, country: u.country, ticker: h.ticker });
          hold.push({ key: key, name: u.name || h.name, w: h.weight });
        });
        var rest = r.v * Math.max(0, 100 - used) / 100;
        if (rest > 0) parts.push({ key: 'rest:' + r.p.ticker, name: REST, value: rest, direct: 0, via: rest, rest: true, sector: REST, country: null, restOf: r.p.ticker });
        etfs.push({ ticker: r.p.ticker, name: r.u.name || r.p.ticker, value: r.v, holdings: hold, covered: used });
      }).catch(function () {
        parts.push({ key: 'rest:' + r.p.ticker, name: REST, value: r.v, direct: 0, via: r.v, rest: true, sector: REST, restOf: r.p.ticker });
      });
    })).then(function () { return { parts: parts, etfs: etfs }; });
  }

  function group(parts, keyFn) {
    var m = {};
    parts.forEach(function (p) { var k = keyFn(p); m[k] = (m[k] || 0) + p.value; });
    return Object.keys(m).map(function (k) { return { k: k, v: m[k] }; }).sort(function (a, b) { return b.v - a.v; });
  }

  function bars(title, list, total, warnAt) {
    var F = window.App.Format;
    return '<div style="margin-top:14px;"><div style="font-size:0.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">' + esc(title) + '</div>' +
      list.slice(0, 8).map(function (x) {
        var pct = total > 0 ? x.v / total * 100 : 0;
        var warn = warnAt && pct >= warnAt && x.k !== REST && x.k !== 'Unbekannt';
        return '<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-size:0.78rem;">' +
          '<div style="width:38%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);">' + esc(x.k) + '</div>' +
          '<div style="flex:1;height:8px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden;"><div style="height:100%;width:' + Math.min(100, pct).toFixed(1) + '%;background:' + (warn ? '#f59e0b' : x.k === REST ? 'var(--text-dim)' : '#818cf8') + ';"></div></div>' +
          '<div style="width:44px;text-align:right;font-weight:700;' + (warn ? 'color:#f59e0b;' : '') + '">' + F.number(pct, 1) + ' %</div></div>';
      }).join('') + '</div>';
  }

  function overlapHtml(etfs, total) {
    if (etfs.length < 2) return '';
    var F = window.App.Format, pairs = [];
    for (var i = 0; i < etfs.length; i++) {
      for (var j = i + 1; j < etfs.length; j++) {
        var a = etfs[i], b = etfs[j], wb = {}, sum = 0, common = [];
        b.holdings.forEach(function (h) { wb[h.key] = h.w; });
        a.holdings.forEach(function (h) {
          if (wb[h.key] != null) { var m = Math.min(h.w, wb[h.key]); sum += m; common.push(h.name); }
        });
        pairs.push({ a: a, b: b, sum: sum, common: common });
      }
    }
    pairs.sort(function (x, y) { return y.sum - x.sum; });
    return '<div style="margin-top:16px;"><div style="font-size:0.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">ETF-Überschneidung</div>' +
      pairs.map(function (p) {
        return '<div style="padding:7px 0;border-top:1px solid var(--border);font-size:0.8rem;">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;"><b>' + esc(p.a.ticker) + ' ↔ ' + esc(p.b.ticker) + '</b>' +
          '<span style="font-weight:800;color:' + (p.sum >= 15 ? '#f59e0b' : 'var(--text-muted)') + ';">mind. ' + F.number(p.sum, 1) + ' %</span></div>' +
          '<div style="font-size:0.74rem;color:var(--text-dim);margin-top:2px;">' + (p.common.length ? 'gemeinsam unter den Top 10: ' + esc(p.common.slice(0, 6).join(', ')) : 'keine gemeinsamen Top-10-Positionen') + '</div></div>';
      }).join('') +
      '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:4px;line-height:1.4;">Gewicht, das beide ETFs gemeinsam auf dieselben Aktien legen – nur aus den Top-10-Positionen, die echte Überschneidung ist meist größer.</div></div>';
  }

  function render(host, rows, stocksData, totalValue) {
    if (!host) return;
    if (!rows.length || !(totalValue > 0)) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="card"><div class="card-header-dotted"><span class="card-title">Verteilung &amp; Klumpen</span></div><div class="state-box"><div class="spinner"></div></div></div>';
    lookThrough(rows, stocksData).then(function (res) {
      if (!document.body.contains(host)) return;
      var F = window.App.Format, parts = res.parts;
      var bySector = group(parts, function (p) { return p.rest ? REST : (SECTOR_DE[p.sector] || p.sector || 'Unbekannt'); });
      var byRegion = group(parts, function (p) { return p.rest ? REST : region(p.country); });
      var byCcy = group(parts, function (p) { return p.rest ? REST : currency(p.country); });

      // Einzelwerte inkl. Anteil über ETFs
      var ex = {};
      parts.forEach(function (p) {
        if (p.rest) return;
        var e = ex[p.key] || (ex[p.key] = { name: p.name, ticker: p.ticker || (p.direct ? p.key : null), direct: 0, via: 0, etfs: [] });
        e.direct += p.direct; e.via += p.via;
        if (p.viaEtf && e.etfs.indexOf(p.viaEtf) === -1) e.etfs.push(p.viaEtf);
      });
      var top = Object.keys(ex).map(function (k) { return ex[k]; }).sort(function (a, b) { return (b.direct + b.via) - (a.direct + a.via); }).slice(0, 8);
      var restShare = parts.filter(function (p) { return p.rest; }).reduce(function (a, p) { return a + p.value; }, 0) / totalValue * 100;

      var html = '<div class="card"><div class="card-header-dotted"><span class="card-title">Verteilung &amp; Klumpen</span>' +
        (res.etfs.length ? '<span class="period-tag">ETFs durchgerechnet</span>' : '') + '</div>';
      html += '<div style="font-size:0.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">Größte Einzelrisiken</div>';
      html += top.map(function (e) {
        var pct = (e.direct + e.via) / totalValue * 100;
        var warn = pct >= 10;
        return '<div ' + (e.ticker ? 'data-pfi-t="' + esc(e.ticker) + '" ' : '') + 'style="padding:6px 0;border-top:1px solid var(--border);' + (e.ticker ? 'cursor:pointer;' : '') + '">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;font-size:0.82rem;"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;">' + esc(e.name) + '</span>' +
          '<span style="font-weight:800;' + (warn ? 'color:#f59e0b;' : '') + '">' + F.number(pct, 1) + ' %</span></div>' +
          '<div style="font-size:0.72rem;color:var(--text-dim);">' +
            (e.direct ? 'direkt ' + F.number(e.direct / totalValue * 100, 1) + ' %' : '') +
            (e.direct && e.via ? ' + ' : '') +
            (e.via ? 'über ' + esc(e.etfs.join(', ')) + ' ' + F.number(e.via / totalValue * 100, 1) + ' %' : '') + '</div></div>';
      }).join('');
      html += bars('Sektoren', bySector, totalValue, 30);
      html += bars('Regionen', byRegion, totalValue, 70);
      html += bars('Währungen der Unternehmen', byCcy, totalValue, 70);
      html += overlapHtml(res.etfs, totalValue);
      html += '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:12px;line-height:1.45;">' +
        (res.etfs.length ? 'ETFs zählen mit ihren Top-10-Positionen; ' + F.number(restShare, 0) + ' % des Depots stecken im nicht aufgeschlüsselten ETF-Rest. ' : '') +
        'Orange: Einzelwert ab 10 %, Sektor ab 30 %, Region/Währung ab 70 %.</div></div>';
      host.innerHTML = html;
      host.querySelectorAll('[data-pfi-t]').forEach(function (el) {
        el.onclick = function () { window.App.Router.navigate('/stock/' + el.getAttribute('data-pfi-t') + '/overview'); };
      });
    });
  }

  return { render: render, region: region, currency: currency };
})();

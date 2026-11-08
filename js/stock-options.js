/**
 * js/stock-options.js – Options-Kennzahlen für US-Aktien.
 * Zeigt ATM Implied Volatility, Put/Call Ratio, IV Rank und Earnings-Move.
 */
window.App = window.App || {};
window.App.StockOptions = (function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function render(container, stock) {
    if (!container || !stock) return;
    var opts = stock.options;
    if (!opts || !opts.summary) {
      container.innerHTML = '<div class="card"><div class="card-header-dotted"><span class="card-title">Options-Kennzahlen</span></div>' +
        '<div class="state-box"><p style="font-size:0.85rem;">Für diesen Ticker liegen keine Options-Daten vor (nur für US-Aktien mit aktivem Optionsmarkt).</p></div></div>';
      return;
    }
    var s = opts.summary;
    var F = window.App.Format;

    var html = '<div class="card"><div class="card-header-dotted"><span class="card-title">Options-Kennzahlen</span><span class="period-tag">' + (opts.expirations ? opts.expirations.length + ' Fälligkeiten' : '—') + '</span></div>';
    html += '<div class="metrics-grid-2col" style="margin-bottom:14px;">';
    if (s.atmIV != null) html += '<div class="metric-cell"><span class="metric-label">ATM IV (30T)</span><span class="metric-value">' + F.number(s.atmIV * 100, 1) + ' %</span></div>';
    if (s.ivRank != null) html += '<div class="metric-cell"><span class="metric-label">IV Rank (52W)</span><span class="metric-value">' + F.number(s.ivRank, 0) + ' %</span></div>';
    if (s.putCallRatio != null) html += '<div class="metric-cell"><span class="metric-label">Put/Call Ratio</span><span class="metric-value">' + F.number(s.putCallRatio, 2) + '</span></div>';
    if (s.impliedMove != null) html += '<div class="metric-cell"><span class="metric-label">Implied Move (Earnings)</span><span class="metric-value">±' + F.number(s.impliedMove * 100, 1) + ' %</span></div>';
    if (s.openInterestCall != null) html += '<div class="metric-cell"><span class="metric-label">OI Calls</span><span class="metric-value">' + F.number(s.openInterestCall, 0) + '</span></div>';
    if (s.openInterestPut != null) html += '<div class="metric-cell"><span class="metric-label">OI Puts</span><span class="metric-value">' + F.number(s.openInterestPut, 0) + '</span></div>';
    html += '</div>';

    if (s.atmIV != null) {
      var ivClass = s.atmIV < 0.3 ? 'badge-bullish' : s.atmIV < 0.6 ? 'badge-neutral' : 'badge-bearish';
      var ivTxt = s.atmIV < 0.3 ? 'Niedrig' : s.atmIV < 0.6 ? 'Mittel' : 'Hoch';
      html += '<div style="font-size:0.78rem;margin-top:8px;">Volatilitätsniveau: <span class="badge-pill ' + ivClass + '">' + ivTxt + '</span></div>';
    }
    html += '<div class="chart-note">Implied Volatility = erwartete annualisierte Schwankung. IV Rank = aktueller IV im Verhältnis zum 52W-Hoch/Tief. Put/Call Ratio > 1 = mehr Puts als Calls (oft bärisch, aber auch als Hedge interpretierbar).</div>';
    html += '</div>';

    container.innerHTML = html;
  }

  return { render: render };
})();
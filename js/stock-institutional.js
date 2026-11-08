/**
 * js/stock-institutional.js – Institutional Ownership Tab.
 * Zeigt Top-Institutionen und ihre Veränderungen gegenüber dem Vorquartal.
 */
window.App = window.App || {};
window.App.StockInstitutional = (function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function render(container, stock) {
    if (!container || !stock) return;
    var inst = stock.institutional || {};
    var holders = inst.holders || [];
    var summary = inst.summary || {};

    var html = '';
    if (!holders.length) {
      html = '<div class="card"><div class="card-header-dotted"><span class="card-title">Institutionelle Halter</span></div>' +
        '<div class="state-box"><p style="font-size:0.85rem;">Keine Daten zu institutionellen Haltern verfügbar. Bitte die Daten-Pipeline aktualisieren.</p></div></div>';
      container.innerHTML = html;
      return;
    }

    html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Institutionelle Halter</span><span class="period-tag">Top ' + holders.length + '</span></div>';
    if (summary.institutionalPercent != null || summary.institutionalCount != null) {
      html += '<div class="metrics-grid-2col" style="margin-bottom:14px;">';
      if (summary.institutionalPercent != null) html += '<div class="metric-cell"><span class="metric-label">Inst. Anteil</span><span class="metric-value">' + window.App.Format.number(summary.institutionalPercent * 100, 1) + ' %</span></div>';
      if (summary.institutionalCount != null) html += '<div class="metric-cell"><span class="metric-label">Anzahl Institute</span><span class="metric-value">' + summary.institutionalCount + '</span></div>';
      html += '</div>';
    }

    html += '<div class="table-responsive-wrapper"><table class="data-table"><thead><tr>' +
      '<th>Halter</th><th style="text-align:right;">Aktien</th><th style="text-align:right;">Wert</th><th style="text-align:right;">Δ Quartal</th>' +
      '</tr></thead><tbody>';

    holders.forEach(function (h) {
      var chgVal = h.changeShares;
      var chgStr = chgVal == null ? '—' : (chgVal >= 0 ? '+' : '') + window.App.Format.number(chgVal, 0);
      var chgClass = chgVal == null ? '' : (chgVal > 0 ? 'color:var(--bullish);' : chgVal < 0 ? 'color:var(--bearish);' : '');
      html += '<tr>' +
        '<td style="font-weight:600;color:var(--text-main);max-width:180px;overflow:hidden;text-overflow:ellipsis;">' + esc(h.name) + '</td>' +
        '<td style="text-align:right;">' + window.App.Format.number(h.shares, 0) + '</td>' +
        '<td style="text-align:right;">' + window.App.Format.compactNumber(h.value) + '</td>' +
        '<td style="text-align:right;' + chgClass + 'font-weight:600;">' + chgStr + '</td>' +
      '</tr>';
    });
    html += '</tbody></table></div>';

    html += '<div class="chart-note">Basierend auf 13F-Filings (Quartalsweise, ca. 45 Tage Verzögerung). "Δ Quartal" zeigt die Veränderung der gehaltenen Aktien gegenüber dem Vorquartal. Institutionelle Halter sind kein Kaufsignal, sondern ein Stimmungsindikator.</div>';
    html += '</div>';

    container.innerHTML = html;
  }

  return { render: render };
})();
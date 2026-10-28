/**
 * js/stock-insider.js
 * Verwaltet den Insider-Tab der Aktiendetailseite:
 * - Summary-Kacheln (Buys/Sells letzte 2 Quartale, Volumina, Sentiment)
 * - Filter-Pillen: Alle Trades, Nur Käufe (Buys), Nur Verkäufe (Sells)
 * - Horizontal scrollbare Tabelle (Insider, Datum, Aktivität, Anteile, Wert)
 * - Historischer Kurschart mit vertikalen Buy- (grün) und Sell-Markierungen (rot)
 */

window.App = window.App || {};

window.App.StockInsider = (function () {
  'use strict';

  var activeFilter = 'all'; // 'all' | 'Buy' | 'Sell'

  /**
   * Rendert den Insider-Tab.
   */
  function render(container, stock) {
    if (!container || !stock) return;

    var insider = stock.insider || { summary: {}, trades: [] };
    var summary = insider.summary || {};
    var trades = insider.trades || [];
    var currency = (stock.quote && stock.quote.currency) || 'EUR';
    var chartHistory = stock.chartHistory || [];

    var buyVal = summary.buyValueTotal || 0;
    var sellVal = summary.sellValueTotal || 0;
    var sentiment = summary.sentiment || 'Neutral';
    var sentimentClass = sentiment === 'Bullish' ? 'badge-bullish' : (sentiment === 'Bearish' ? 'badge-bearish' : 'badge-pill');

    var html = '' +
      '<!-- Summary Kacheln -->' +
      '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px;">' +
        '<div class="card" style="padding: 12px; margin-bottom: 0;">' +
          '<div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 4px;">Käufe (2Q)</div>' +
          '<div style="font-size: 1.05rem; font-weight: 700; color: var(--bullish);">' + (summary.buysCount2Q || 0) + '</div>' +
          '<div style="font-size: 0.72rem; color: var(--text-muted);">' + window.App.Format.compactNumber(buyVal, currency) + '</div>' +
        '</div>' +

        '<div class="card" style="padding: 12px; margin-bottom: 0;">' +
          '<div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 4px;">Verkäufe (2Q)</div>' +
          '<div style="font-size: 1.05rem; font-weight: 700; color: var(--bearish);">' + (summary.sellsCount2Q || 0) + '</div>' +
          '<div style="font-size: 0.72rem; color: var(--text-muted);">' + window.App.Format.compactNumber(sellVal, currency) + '</div>' +
        '</div>' +

        '<div class="card" style="padding: 12px; margin-bottom: 0;">' +
          '<div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 4px;">Sentiment</div>' +
          '<div style="margin-top: 6px;"><span class="badge-pill ' + sentimentClass + '">' + sentiment + '</span></div>' +
        '</div>' +
      '</div>' +

      '<!-- Kurschart mit Buy/Sell Markierungen -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<div class="card-title">' +
            '<span>Kursverlauf &amp; Insider-Timing</span>' +
            '<span class="period-tag">1 Jahr</span>' +
          '</div>' +
        '</div>' +

        '<div class="chart-container">' +
          '<canvas id="insider-chart-canvas" class="chart-canvas" style="height: 220px;"></canvas>' +
          '<div class="chart-legend">' +
            '<div class="legend-item"><span class="legend-dot" style="background:#818cf8;"></span><span>Schlusskurs</span></div>' +
            '<div class="legend-item"><span class="legend-dot" style="background:#10b981;"></span><span>Insider-Kauf</span></div>' +
            '<div class="legend-item"><span class="legend-dot" style="background:#ef4444;"></span><span>Insider-Verkauf</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- Transaktions-Tabelle mit Filter-Pillen -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<div class="card-title">Transaktionsprotokoll</div>' +
          '<div class="horizontal-scroll-row" style="margin-bottom: 0; padding-bottom: 0;">' +
            '<button class="sub-tab-btn active" data-insider-filter="all">Alle</button>' +
            '<button class="sub-tab-btn" data-insider-filter="Buy">Käufe</button>' +
            '<button class="sub-tab-btn" data-insider-filter="Sell">Verkäufe</button>' +
          '</div>' +
        '</div>' +

        '<div id="insider-table-container">' +
          renderTradesTableHtml(trades, currency, activeFilter) +
        '</div>' +
      '</div>';

    container.innerHTML = html;

    // Chart mit Markern zeichnen
    initInsiderChart(chartHistory, trades, currency);

    // Filter-Buttons binden
    bindFilterEvents(trades, currency);
  }

  /**
   * Rendert die horizontal scrollbare HTML-Tabelle der Transaktionen.
   */
  function renderTradesTableHtml(trades, currency, filter) {
    var filtered = trades || [];
    if (filter && filter !== 'all') {
      filtered = filtered.filter(function (t) {
        return t.type === filter;
      });
    }

    if (filtered.length === 0) {
      return '<div class="state-box" style="padding: 24px 0;"><p>Keine Einträge für diesen Filter vorhanden.</p></div>';
    }

    var html = '' +
      '<div class="table-responsive-wrapper">' +
        '<table class="data-table">' +
          '<thead>' +
            '<tr>' +
              '<th>Datum</th>' +
              '<th>Insider</th>' +
              '<th>Position</th>' +
              '<th>Aktivität</th>' +
              '<th style="text-align: right;">Aktien</th>' +
              '<th style="text-align: right;">Wert</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>';

    filtered.forEach(function (t) {
      var isBuy = t.type === 'Buy';
      var badgeCls = isBuy ? 'badge-bullish' : (t.type === 'Sell' ? 'badge-bearish' : 'badge-pill');

      html += '' +
        '<tr>' +
          '<td>' + window.App.Format.date(t.date) + '</td>' +
          '<td style="font-weight: 600; color: var(--text-main);">' + t.insider + '</td>' +
          '<td>' + (t.position || '—') + '</td>' +
          '<td><span class="badge-pill ' + badgeCls + '">' + t.type + '</span></td>' +
          '<td style="text-align: right; font-variant-numeric: tabular-nums;">' + window.App.Format.number(t.shares, 0) + '</td>' +
          '<td style="text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;">' + window.App.Format.currency(t.value, currency, 0) + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
  }

  /**
   * Mappt Insider-Transaktionen auf die Kursdaten und zeichnet das Canvas-Diagramm.
   */
  function initInsiderChart(history, trades, currency) {
    var canvas = document.getElementById('insider-chart-canvas');
    if (!canvas || !history || history.length === 0) return;

    var labels = [];
    var values = [];
    var dateMap = {};

    history.forEach(function (pt, idx) {
      labels.push(pt.date.slice(5)); // z.B. 10-01
      values.push(pt.close);
      dateMap[pt.date] = idx;
    });

    // Marker auf Datumsindex mappen
    var markers = [];
    (trades || []).forEach(function (t) {
      if (t.type === 'Buy' || t.type === 'Sell') {
        var idx = dateMap[t.date];
        // Falls kein exakter Handelstag: nächsten Tag suchen
        if (idx === undefined) {
          for (var i = 0; i < history.length; i++) {
            if (history[i].date >= t.date) {
              idx = i;
              break;
            }
          }
        }
        if (idx !== undefined) {
          markers.push({
            index: idx,
            type: t.type,
            text: t.insider
          });
        }
      }
    });

    window.App.Charts.renderLineChart(canvas, {
      labels: labels,
      values: values,
      markers: markers,
      formatY: function (val) {
        return window.App.Format.currency(val, currency, 0);
      }
    });
  }

  /**
   * Bindet die Filter-Tabs (Alle / Käufe / Verkäufe).
   */
  function bindFilterEvents(trades, currency) {
    var buttons = document.querySelectorAll('[data-insider-filter]');
    buttons.forEach(function (btn) {
      btn.onclick = function () {
        buttons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        activeFilter = btn.getAttribute('data-insider-filter');

        var tableContainer = document.getElementById('insider-table-container');
        if (tableContainer) {
          tableContainer.innerHTML = renderTradesTableHtml(trades, currency, activeFilter);
        }
      };
    });
  }

  return {
    render: render
  };
})();

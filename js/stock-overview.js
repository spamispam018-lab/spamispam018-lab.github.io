/**
 * js/stock-overview.js
 * Verwaltet den Overview-Tab der Aktiendetailseite:
 * - Stammdaten-Kopf mit Preis, Performance und 52W-Spanne
 * - Insider-Aktivitäts-Karte (Badge Bullish/Bearish, 2Q-Käufe/Verkäufe, rot/grüner Verhältnisbalken, Liste letzter Trades)
 * - Financials TTM-Karte (gruppiertes Balkendiagramm Umsatz, Operativer Cashflow, Nettoergebnis)
 * - Direkte Absprunglinks zu den Unter-Tabs
 */

window.App = window.App || {};

window.App.StockOverview = (function () {
  'use strict';

  /**
   * Rendert den kompletten Overview-Inhalt in den Ziel-Container.
   */
  function render(container, stock) {
    if (!container || !stock) return;

    var quote = stock.quote || {};
    var ratios = stock.ratios || {};
    var insider = stock.insider || { summary: {}, trades: [] };
    var summary = insider.summary || {};
    var trades = insider.trades || [];
    var financials = stock.financials || {};
    var quarterlyIncome = (financials.incomeStatement && financials.incomeStatement.quarterly) || [];
    var quarterlyCashflow = (financials.cashFlow && financials.cashFlow.quarterly) || [];

    // Insider-Verhältnisbalken berechnen
    var buyVal = summary.buyValueTotal || 0;
    var sellVal = summary.sellValueTotal || 0;
    var totalInsiderVal = buyVal + sellVal;
    var buyPct = totalInsiderVal > 0 ? Math.round((buyVal / totalInsiderVal) * 100) : 50;
    var sellPct = 100 - buyPct;

    var sentiment = summary.sentiment || 'Neutral';
    var sentimentBadgeClass = sentiment === 'Bullish' ? 'badge-bullish' : (sentiment === 'Bearish' ? 'badge-bearish' : 'badge-pill');

    var html = '' +
      '<!-- Key Metrics Schnellübersicht -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Bewertungs- &amp; Marktkennzahlen <span class="period-tag">Aktuell</span></span>' +
        '</div>' +
        '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 0.82rem;">' +
          '<div><span style="color: var(--text-dim);">Marktkapitalisierung:</span> <strong style="float: right;">' + window.App.Format.compactNumber(quote.marketCap, quote.currency) + '</strong></div>' +
          '<div><span style="color: var(--text-dim);">KGV (Trailing):</span> <strong style="float: right;">' + window.App.Format.number(ratios.peTrailing, 1) + '</strong></div>' +
          '<div><span style="color: var(--text-dim);">Forward KGV:</span> <strong style="float: right;">' + window.App.Format.number(ratios.peForward, 1) + '</strong></div>' +
          '<div><span style="color: var(--text-dim);">Dividendenrendite:</span> <strong style="float: right;">' + window.App.Format.percent((ratios.dividendYield || 0) * 100, false, 2) + '</strong></div>' +
          '<div><span style="color: var(--text-dim);">52W Tief:</span> <strong style="float: right;">' + window.App.Format.currency(quote.fiftyTwoWeekLow, quote.currency) + '</strong></div>' +
          '<div><span style="color: var(--text-dim);">52W Hoch:</span> <strong style="float: right;">' + window.App.Format.currency(quote.fiftyTwoWeekHigh, quote.currency) + '</strong></div>' +
        '</div>' +
      '</div>' +

      '<!-- Insider Activity Karte -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<div class="card-title">' +
            '<span>Insider Activity</span>' +
            '<span class="period-tag">Letzte 2Q</span>' +
          '</div>' +
          '<span class="badge-pill ' + sentimentBadgeClass + '">' + sentiment + '</span>' +
        '</div>' +

        '<div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem;">' +
          '<div><span style="color: var(--bullish); font-weight: 700;">' + (summary.buysCount2Q || 0) + ' Käufe</span> (' + window.App.Format.compactNumber(buyVal, quote.currency) + ')</div>' +
          '<div><span style="color: var(--bearish); font-weight: 700;">' + (summary.sellsCount2Q || 0) + ' Verkäufe</span> (' + window.App.Format.compactNumber(sellVal, quote.currency) + ')</div>' +
        '</div>' +

        '<!-- Verhältnisbalken -->' +
        '<div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 14px; background: var(--bg-tertiary);">' +
          '<div style="width: ' + buyPct + '%; background-color: var(--bullish);"></div>' +
          '<div style="width: ' + sellPct + '%; background-color: var(--bearish);"></div>' +
        '</div>' +

        '<!-- Letzte Transaktionen -->' +
        '<div style="font-size: 0.76rem; font-weight: 600; color: var(--text-dim); margin-bottom: 8px; text-transform: uppercase;">Letzte Transaktionen</div>' +
        renderRecentTradesHtml(trades, quote.currency) +

        '<div style="text-align: right;">' +
          '<a class="card-link-btn" href="#/stock/' + stock.ticker + '/insider">View Insider Tab &rarr;</a>' +
        '</div>' +
      '</div>' +

      '<!-- Financials TTM Karte -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<div class="card-title">' +
            '<span>Financials Trend</span>' +
            '<span class="period-tag">TTM / Quartale</span>' +
          '</div>' +
        '</div>' +

        '<div class="chart-container">' +
          '<canvas id="overview-financials-canvas" class="chart-canvas" style="height: 200px;"></canvas>' +
          '<div class="chart-legend">' +
            '<div class="legend-item"><span class="legend-dot" style="background:#6366f1;"></span><span>Revenue</span></div>' +
            '<div class="legend-item"><span class="legend-dot" style="background:#10b981;"></span><span>Operativer Cashflow</span></div>' +
            '<div class="legend-item"><span class="legend-dot" style="background:#3b82f6;"></span><span>Net Income</span></div>' +
          '</div>' +
        '</div>' +

        '<div style="text-align: right; margin-top: 6px;">' +
          '<a class="card-link-btn" href="#/stock/' + stock.ticker + '/financials">View Financials Tab &rarr;</a>' +
        '</div>' +
      '</div>';

    container.innerHTML = html;

    // Balkendiagramm für die letzten 4 Quartale zeichnen
    initFinancialsChart(quarterlyIncome, quarterlyCashflow, quote.currency);
  }

  /**
   * Generiert eine kompakte Liste der letzten Insider-Transaktionen.
   */
  function renderRecentTradesHtml(trades, currency) {
    if (!trades || trades.length === 0) {
      return '<div style="font-size: 0.78rem; color: var(--text-dim); padding: 8px 0;">Keine aktuellen Transaktionen verzeichnet.</div>';
    }

    var list = trades.slice(0, 4);
    var html = '<div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;">';

    list.forEach(function (t) {
      var isBuy = t.type === 'Buy';
      var typeColor = isBuy ? 'var(--bullish)' : (t.type === 'Sell' ? 'var(--bearish)' : 'var(--text-dim)');

      html += '' +
        '<div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-secondary); padding: 8px 10px; border-radius: var(--radius-sm); font-size: 0.78rem;">' +
          '<div>' +
            '<div style="font-weight: 600;">' + t.insider + ' <span style="font-size: 0.7rem; color: var(--text-dim); font-weight: normal;">(' + (t.position || 'Insider') + ')</span></div>' +
            '<div style="color: var(--text-dim); font-size: 0.7rem;">' + window.App.Format.date(t.date) + '</div>' +
          '</div>' +
          '<div style="text-align: right;">' +
            '<div style="font-weight: 700; color: ' + typeColor + ';">' + t.type + '</div>' +
            '<div style="color: var(--text-muted); font-size: 0.72rem;">' + window.App.Format.compactNumber(t.value, currency) + '</div>' +
          '</div>' +
        '</div>';
    });

    html += '</div>';
    return html;
  }

  /**
   * Initialisiert das gruppierte Balkendiagramm für die letzten 4 Quartale.
   */
  function initFinancialsChart(quarterlyInc, quarterlyCf, currency) {
    var canvas = document.getElementById('overview-financials-canvas');
    if (!canvas) return;

    var incList = (quarterlyInc || []).slice(-4);
    var cfList = (quarterlyCf || []).slice(-4);

    if (incList.length === 0) return;

    var labels = [];
    var revData = [];
    var netData = [];
    var ocfData = [];

    incList.forEach(function (inc, idx) {
      labels.push(inc.date ? inc.date.slice(2, 7) : 'Q' + (idx + 1));
      revData.push(inc.Total_Revenue || 0);
      netData.push(inc.Net_Income || 0);

      var matchedCf = cfList[idx] || {};
      ocfData.push(matchedCf.Operating_Cash_Flow || 0);
    });

    window.App.Charts.renderGroupedBarChart(canvas, {
      labels: labels,
      series: [
        { name: 'Revenue', data: revData, color: '#6366f1' },
        { name: 'OCF', data: ocfData, color: '#10b981' },
        { name: 'Net Income', data: netData, color: '#3b82f6' }
      ],
      formatY: function (val) {
        return window.App.Format.compactNumber(val);
      }
    });
  }

  return {
    render: render
  };
})();

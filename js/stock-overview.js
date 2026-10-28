/**
 * js/stock-overview.js
 * Verwaltet den Tab "Overview" der Aktiendetailansicht:
 * - Bewertungs- und Marktkennzahlen (mit sauberer Behandlung von fehlendem/negativem KGV)
 * - 52-Wochen-Spannenbalken
 * - Inline-Chart mit Umschalt-Pillen (1M, 3M, 6M, 1J)
 * - Kompakte Insider-Aktivitätskarte mit Stimmungsbalken
 * - Quartalsweiser Finanztrend (Umsatz & Nettoergebnis)
 */

window.App = window.App || {};

window.App.StockOverview = (function () {
  'use strict';

  var currentStock = null;
  var currentPeriod = '1Y';

  /**
   * Haupt-Renderfunktion für die Overview-Ansicht.
   * @param {HTMLElement} container - Ziel-DOM-Element
   * @param {Object} stock - Vollständiges Datenobjekt der Aktie
   */
  function render(container, stock) {
    if (!container || !stock) return;
    currentStock = stock;

    var quote = stock.quote || {};
    var ratios = stock.ratios || {};
    var insider = stock.insider || { summary: {}, trades: [] };
    var financials = stock.financials || {};

    // Trailing-KGV prüfen: Wenn kein positiver Wert vorliegt, aber ein Forward-KGV existiert oder Verluste vorliegen
    var peTrailingDisplay;
    if (ratios.peTrailing !== null && ratios.peTrailing !== undefined && ratios.peTrailing > 0) {
      peTrailingDisplay = window.App.Format.number(ratios.peTrailing, 1);
    } else if (ratios.peForward || ratios.profitMargins < 0) {
      peTrailingDisplay = '<span style="color: var(--bearish); font-size: 0.78rem; font-weight: 600;">Negativ (Verlust)</span>';
    } else {
      peTrailingDisplay = '—';
    }

    var forwardPeDisplay = (ratios.peForward && ratios.peForward > 0)
      ? window.App.Format.number(ratios.peForward, 1)
      : '—';

    var divYieldDisplay = (ratios.dividendYield !== null && ratios.dividendYield !== undefined && ratios.dividendYield > 0)
      ? window.App.Format.number(ratios.dividendYield, 2) + ' %'
      : '0,00 %';

    var html = '' +
      '<!-- 1. Bewertungs- & Marktkennzahlen -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Bewertungs- &amp; Marktkennzahlen</span>' +
          '<span class="period-tag">Aktuell</span>' +
        '</div>' +
        '<div class="metrics-grid-2col">' +
          '<div class="metric-cell">' +
            '<span class="metric-label">Marktkapitalisierung:</span>' +
            '<span class="metric-value">' + window.App.Format.compactNumber(quote.marketCap, quote.currency) + '</span>' +
          '</div>' +
          '<div class="metric-cell">' +
            '<span class="metric-label">KGV (Trailing):</span>' +
            '<span class="metric-value">' + peTrailingDisplay + '</span>' +
          '</div>' +
          '<div class="metric-cell">' +
            '<span class="metric-label">Forward KGV:</span>' +
            '<span class="metric-value">' + forwardPeDisplay + '</span>' +
          '</div>' +
          '<div class="metric-cell">' +
            '<span class="metric-label">Dividendenrendite:</span>' +
            '<span class="metric-value">' + divYieldDisplay + '</span>' +
          '</div>' +
          '<div class="metric-cell">' +
            '<span class="metric-label">52W Tief:</span>' +
            '<span class="metric-value">' + window.App.Format.currency(quote.fiftyTwoWeekLow, quote.currency) + '</span>' +
          '</div>' +
          '<div class="metric-cell">' +
            '<span class="metric-label">52W Hoch:</span>' +
            '<span class="metric-value">' + window.App.Format.currency(quote.fiftyTwoWeekHigh, quote.currency) + '</span>' +
          '</div>' +
        '</div>' +
        renderFiftyTwoWeekRange(quote.price, quote.fiftyTwoWeekLow, quote.fiftyTwoWeekHigh, quote.currency) +
      '</div>' +

      '<!-- 2. Kursverlauf Chart -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Kursverlauf</span>' +
          '<div class="pill-group" id="overview-period-pills">' +
            '<button class="pill-btn ' + (currentPeriod === '1M' ? 'active' : '') + '" data-period="1M">1M</button>' +
            '<button class="pill-btn ' + (currentPeriod === '3M' ? 'active' : '') + '" data-period="3M">3M</button>' +
            '<button class="pill-btn ' + (currentPeriod === '6M' ? 'active' : '') + '" data-period="6M">6M</button>' +
            '<button class="pill-btn ' + (currentPeriod === '1Y' ? 'active' : '') + '" data-period="1Y">1J</button>' +
          '</div>' +
        '</div>' +
        '<div style="height: 180px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="overview-price-canvas"></canvas>' +
        '</div>' +
      '</div>' +

      '<!-- 3. Insider-Aktivität Kurzüberblick -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Insider Activity</span>' +
          '<span class="period-tag">Letzte 2Q</span>' +
          '<span style="margin-left: auto; font-size: 0.75rem; font-weight: 700; color: ' + getSentimentColor(insider.summary.sentiment) + ';">' + (insider.summary.sentiment || 'Neutral') + '</span>' +
        '</div>' +
        renderInsiderSummaryBar(insider.summary) +
        '<div style="margin-top: 10px; font-size: 0.75rem; color: var(--text-dim); text-align: right;">' +
          '<a href="#/stock/' + stock.ticker + '/insider" style="color: var(--accent-purple-light); text-decoration: none; font-weight: 600;">View Insider Tab &rarr;</a>' +
        '</div>' +
      '</div>' +

      '<!-- 4. Quartals-Trend (Finanzen) -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Financials Trend</span>' +
          '<span class="period-tag">TTM / Quartale</span>' +
        '</div>' +
        '<div style="height: 160px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="overview-financials-canvas"></canvas>' +
        '</div>' +
      '</div>';

    container.innerHTML = html;

    // Charts zeichnen und Events verdrahten
    drawPriceChart();
    drawFinancialsChart(financials);
    bindPeriodPillEvents(container);
  }

  /**
   * Rendert den 52-Wochen-Spannenbalken mit relativem Zeiger auf den aktuellen Kurs.
   */
  function renderFiftyTwoWeekRange(price, low, high, currency) {
    if (!price || !low || !high || high <= low) return '';

    var pct = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));

    return '' +
      '<div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--border-subtle);">' +
        '<div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-dim); margin-bottom: 6px;">' +
          '<span>52W-Spanne</span>' +
          '<span>Aktuell: ' + window.App.Format.currency(price, currency) + ' (' + pct.toFixed(0) + ' %)</span>' +
        '</div>' +
        '<div style="height: 6px; width: 100%; background: var(--bg-surface-elevated); border-radius: 3px; position: relative; overflow: visible;">' +
          '<div style="height: 100%; width: ' + pct + '%; background: linear-gradient(90deg, var(--bearish), var(--bullish)); border-radius: 3px;"></div>' +
          '<div style="position: absolute; left: calc(' + pct + '% - 5px); top: -3px; width: 10px; height: 12px; background: #fff; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.5);"></div>' +
        '</div>' +
      '</div>';
  }

  /**
   * Rendert das Verhältnis von Insider-Käufen zu -Verkäufen.
   */
  function renderInsiderSummaryBar(sum) {
    if (!sum) sum = { buysCount2Q: 0, sellsCount2Q: 0, buyValueTotal: 0, sellValueTotal: 0 };
    var buyVal = sum.buyValueTotal || 0;
    var sellVal = sum.sellValueTotal || 0;
    var total = buyVal + sellVal;

    var buyPct = total > 0 ? (buyVal / total) * 100 : 50;
    var sellPct = total > 0 ? (sellVal / total) * 100 : 50;

    return '' +
      '<div style="margin-top: 6px;">' +
        '<div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 6px;">' +
          '<span style="color: var(--bullish); font-weight: 700;">' + sum.buysCount2Q + ' Käufe (' + window.App.Format.compactNumber(buyVal, 'EUR') + ')</span>' +
          '<span style="color: var(--bearish); font-weight: 700;">' + sum.sellsCount2Q + ' Verkäufe (' + window.App.Format.compactNumber(sellVal, 'EUR') + ')</span>' +
        '</div>' +
        '<div style="height: 8px; width: 100%; display: flex; border-radius: 4px; overflow: hidden; background: var(--bg-surface-elevated);">' +
          '<div style="height: 100%; width: ' + buyPct + '%; background: var(--bullish);"></div>' +
          '<div style="height: 100%; width: ' + sellPct + '%; background: var(--bearish);"></div>' +
        '</div>' +
      '</div>';
  }

  /**
   * Zeichnet den Kursverlauf über window.App.Charts.
   */
  function drawPriceChart() {
    var canvas = document.getElementById('overview-price-canvas');
    if (!canvas || !currentStock) return;

    var fullHistory = currentStock.chartHistory || [];
    var filtered = sliceHistoryByPeriod(fullHistory, currentPeriod);

    var cur = currentStock.quote ? currentStock.quote.currency : 'EUR';
    window.App.Charts.renderLineChart(canvas, {
      labels: filtered.map(function (p) { var d = String(p.date || ''); return d.slice(5, 7) + '/' + d.slice(2, 4); }),
      values: filtered.map(function (p) { return p.close; }),
      formatY: function (v) { return window.App.Format.currency(v, cur, 0); }
    });
  }

  /**
   * Schneidet den Kursverlauf auf die gewählte Periode zu.
   */
  function sliceHistoryByPeriod(history, period) {
    if (!history || history.length === 0) return [];
    var count = history.length;
    switch (period) {
      case '1M': return history.slice(Math.max(0, count - 22));
      case '3M': return history.slice(Math.max(0, count - 65));
      case '6M': return history.slice(Math.max(0, count - 130));
      case '1Y':
      default:
        return history.slice(Math.max(0, count - 260));
    }
  }

  /**
   * Zeichnet den Quartals-Umsatztrend.
   */
  function drawFinancialsChart(financials) {
    var canvas = document.getElementById('overview-financials-canvas');
    if (!canvas) return;

    var incQuarterly = (financials.incomeStatement && financials.incomeStatement.quarterly)
      ? financials.incomeStatement.quarterly
      : [];

    var recent = incQuarterly.slice(-6);
    if (recent.length === 0) {
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Keine Quartalsfinanzdaten verfügbar', canvas.width / 2, canvas.height / 2);
      return;
    }

    var labels = recent.map(function (item) {
      return (item.date || '').slice(2, 7);
    });

    var revenues = recent.map(function (item) {
      return item.Total_Revenue || item.Operating_Revenue || 0;
    });

    window.App.Charts.renderGroupedBarChart(canvas, {
      labels: labels,
      series: [{ name: 'Umsatz', data: revenues, color: 'rgba(99, 102, 241, 0.85)' }],
      formatY: function (v) { return window.App.Format.compactNumber(v); }
    });
  }

  /**
   * Bindet die Klick-Events auf die Zeitbereich-Pillen (1M, 3M, 6M, 1J).
   */
  function bindPeriodPillEvents(container) {
    var pills = container.querySelectorAll('#overview-period-pills .pill-btn');
    pills.forEach(function (pill) {
      pill.onclick = function () {
        pills.forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        currentPeriod = pill.getAttribute('data-period');
        drawPriceChart();
      };
    });
  }

  function getSentimentColor(sentiment) {
    if (sentiment === 'Bullish') return 'var(--bullish)';
    if (sentiment === 'Bearish') return 'var(--bearish)';
    return 'var(--text-muted)';
  }

  return {
    render: render
  };
})();

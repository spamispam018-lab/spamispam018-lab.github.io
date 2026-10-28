/**
 * js/stock-analyst.js
 * Verwaltet den Analyst-Tab der Aktiendetailseite:
 * - Kursziel-Karte (Low / Median / High auf Spannenbalken mit aktuellem Kursmarker und Upside %)
 * - Forward Valuation (Forward-KGV, Trailing-KGV, 5Y-KGV-Spanne)
 * - EPS-Estimates (Balkenchart mit Beat/Miss/Forecast-Farbcodierung)
 * - Analyst Recommendations (Konsens-Score, Donut-Diagramm, gestapeltes Verlaufshistorie-Chart)
 */

window.App = window.App || {};

window.App.StockAnalyst = (function () {
  'use strict';

  /**
   * Rendert den kompletten Analyst-Tab in den Ziel-Container.
   */
  function render(container, stock) {
    if (!container || !stock) return;

    var analysts = stock.analysts || {};
    var targets = analysts.targets || {};
    var recs = analysts.recommendations || {};
    var epsList = analysts.epsEstimates || [];
    var ratios = stock.ratios || {};
    var quote = stock.quote || {};
    var currency = targets.currency || quote.currency || 'USD';

    var currentPrice = quote.price || targets.current || 0;
    var targetMean = targets.mean || targets.median || currentPrice;
    var targetLow = targets.low || (currentPrice * 0.8);
    var targetHigh = targets.high || (currentPrice * 1.3);

    // Upside-Berechnung
    var upsidePct = currentPrice > 0 ? ((targetMean - currentPrice) / currentPrice) * 100 : 0;
    var upsideCls = upsidePct >= 0 ? 'badge-bullish' : 'badge-bearish';
    var upsideSign = upsidePct >= 0 ? '+' : '';

    // Relative Position des aktuellen Kurses auf dem Spannenbalken
    var spanRange = targetHigh - targetLow;
    var currentPosPct = spanRange > 0 ? Math.max(0, Math.min(100, ((currentPrice - targetLow) / spanRange) * 100)) : 50;

    // Konsens-Empfehlungstext
    var recScore = recs.score || 2.0;
    var recText = getRecommendationLabel(recScore);

    var html = '' +
      '<!-- Kursziele & Upside Karte -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<div class="card-title">' +
            '<span>Kursziele der Analysten</span>' +
            '<span class="period-tag">' + (targets.analystCount || 0) + ' Meinungen</span>' +
          '</div>' +
          '<span class="badge-pill ' + upsideCls + '">' + upsideSign + window.App.Format.number(upsidePct, 1) + ' % Potenzial</span>' +
        '</div>' +

        '<div style="margin: 16px 0 10px;">' +
          '<!-- Spannenbalken mit Farbverlauf -->' +
          '<div style="position: relative; height: 10px; background: linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #10b981 100%); border-radius: 6px;">' +
            '<!-- Aktueller Kursmarker -->' +
            '<div style="position: absolute; left: ' + currentPosPct + '%; top: -4px; width: 4px; height: 18px; background: #ffffff; border-radius: 2px; transform: translateX(-50%); box-shadow: 0 0 6px rgba(0,0,0,0.8);">' +
              '<div style="position: absolute; top: -18px; left: 50%; transform: translateX(-50%); font-size: 0.68rem; font-weight: 700; color: #fff; white-space: nowrap;">Kurs</div>' +
            '</div>' +
          '</div>' +

          '<!-- Preisbeschriftungen unter dem Balken -->' +
          '<div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 0.78rem;">' +
            '<div><span style="color: var(--text-dim); display: block; font-size: 0.7rem;">Tief</span><strong>' + window.App.Format.currency(targetLow, currency) + '</strong></div>' +
            '<div style="text-align: center;"><span style="color: var(--text-dim); display: block; font-size: 0.7rem;">Durchschnitt</span><strong style="color: var(--accent-purple-light);">' + window.App.Format.currency(targetMean, currency) + '</strong></div>' +
            '<div style="text-align: right;"><span style="color: var(--text-dim); display: block; font-size: 0.7rem;">Hoch</span><strong>' + window.App.Format.currency(targetHigh, currency) + '</strong></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- Forward Valuation Kennzahlen -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<div class="card-title">' +
            '<span>Forward Valuation</span>' +
            '<span class="period-tag">Multiples</span>' +
          '</div>' +
        '</div>' +

        '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">' +
          '<div style="background: var(--bg-secondary); padding: 10px; border-radius: var(--radius-sm); text-align: center;">' +
            '<div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 4px;">KGV Trailing</div>' +
            '<div style="font-size: 1.1rem; font-weight: 700;">' + window.App.Format.number(ratios.peTrailing, 1) + '</div>' +
          '</div>' +
          '<div style="background: var(--bg-secondary); padding: 10px; border-radius: var(--radius-sm); text-align: center;">' +
            '<div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 4px;">KGV Forward</div>' +
            '<div style="font-size: 1.1rem; font-weight: 700; color: var(--accent-purple-light);">' + window.App.Format.number(ratios.peForward, 1) + '</div>' +
          '</div>' +
          '<div style="background: var(--bg-secondary); padding: 10px; border-radius: var(--radius-sm); text-align: center;">' +
            '<div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 4px;">PEG Ratio</div>' +
            '<div style="font-size: 1.1rem; font-weight: 700;">' + window.App.Format.number(ratios.pegRatio, 2) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- EPS Estimates Balkenchart -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<div class="card-title">' +
            '<span>EPS: Schätzungen vs. Tatsächlich</span>' +
            '<span class="period-tag">Quartale</span>' +
          '</div>' +
        '</div>' +

        '<div class="chart-container">' +
          '<canvas id="analyst-eps-canvas" class="chart-canvas" style="height: 190px;"></canvas>' +
          '<div class="chart-legend">' +
            '<div class="legend-item"><span class="legend-dot" style="background:#6b7280;"></span><span>Schätzung</span></div>' +
            '<div class="legend-item"><span class="legend-dot" style="background:#10b981;"></span><span>Beat</span></div>' +
            '<div class="legend-item"><span class="legend-dot" style="background:#ef4444;"></span><span>Miss</span></div>' +
            '<div class="legend-item"><span class="legend-dot" style="background:#3b82f6;"></span><span>Forecast</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- Recommendations Donut & Historie -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<div class="card-title">' +
            '<span>Analysten-Empfehlungen</span>' +
            '<span class="period-tag">' + recText + '</span>' +
          '</div>' +
        '</div>' +

        '<div style="display: flex; align-items: center; justify-content: space-around; margin-bottom: 16px;">' +
          '<!-- Donut -->' +
          '<div style="width: 130px; height: 130px; position: relative;">' +
            '<canvas id="analyst-donut-canvas" style="width: 130px; height: 130px;"></canvas>' +
          '</div>' +

          '<!-- Detail-Aufschlüsselung -->' +
          '<div id="analyst-breakdown-list" style="font-size: 0.78rem; display: flex; flex-direction: column; gap: 4px;"></div>' +
        '</div>' +

        '<!-- Gestapeltes Verlaufshistorie-Chart -->' +
        '<div style="font-size: 0.74rem; font-weight: 600; color: var(--text-dim); margin-bottom: 8px; text-transform: uppercase;">Entwicklung der letzten 4 Monate</div>' +
        '<div class="chart-container">' +
          '<canvas id="analyst-history-canvas" class="chart-canvas" style="height: 140px;"></canvas>' +
        '</div>' +
      '</div>';

    container.innerHTML = html;

    // Charts & Listen initialisieren
    renderEpsChart(epsList, currency);
    renderRecommendationsDonut(recs);
    renderRecommendationsHistory(recs.history || []);
  }

  /**
   * Wandelt den yfinance Konsens-Score (1.0 - 5.0) in lesbaren deutschen Text um.
   */
  function getRecommendationLabel(score) {
    if (!score) return 'Halten';
    if (score <= 1.5) return 'Strong Buy';
    if (score <= 2.3) return 'Kaufen (Buy)';
    if (score <= 3.3) return 'Halten (Hold)';
    if (score <= 4.0) return 'Underperform';
    return 'Verkaufen (Sell)';
  }

  /**
   * Zeichnet das EPS-Balkendiagramm mit Schätzung vs. Tatsächlich.
   */
  function renderEpsChart(epsList, currency) {
    var canvas = document.getElementById('analyst-eps-canvas');
    if (!canvas || !epsList || epsList.length === 0) return;

    var items = epsList.slice(-6);
    var labels = [];
    var estData = [];
    var actData = [];

    items.forEach(function (it) {
      labels.push(it.quarter ? it.quarter.slice(2, 7) : 'Q');
      estData.push(it.estimate !== null ? it.estimate : 0);
      actData.push(it.actual !== null ? it.actual : 0);
    });

    window.App.Charts.renderGroupedBarChart(canvas, {
      labels: labels,
      series: [
        { name: 'Schätzung', data: estData, color: '#4b5563' },
        { name: 'Tatsächlich', data: actData, color: '#10b981' }
      ],
      formatY: function (val) {
        return window.App.Format.currency(val, currency, 2);
      }
    });
  }

  /**
   * Rendert den Donut-Chart für die aktuelle Empfehlungsverteilung.
   */
  function renderRecommendationsDonut(recs) {
    var canvas = document.getElementById('analyst-donut-canvas');
    var breakdownContainer = document.getElementById('analyst-breakdown-list');
    if (!canvas) return;

    var b = recs.breakdown || { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 };
    var total = (b.strongBuy || 0) + (b.buy || 0) + (b.hold || 0) + (b.sell || 0) + (b.strongSell || 0);

    var data = [
      { label: 'Strong Buy', value: b.strongBuy || 0, color: '#059669' },
      { label: 'Buy', value: b.buy || 0, color: '#10b981' },
      { label: 'Hold', value: b.hold || 0, color: '#f59e0b' },
      { label: 'Sell', value: b.sell || 0, color: '#ef4444' },
      { label: 'Strong Sell', value: b.strongSell || 0, color: '#b91c1c' }
    ];

    window.App.Charts.renderDonutChart(canvas, {
      data: data,
      totalText: recs.score ? recs.score.toFixed(2) : '—',
      subText: 'Konsens'
    });

    // Breakdown-HTML-Legende
    if (breakdownContainer) {
      var html = '';
      data.forEach(function (d) {
        var pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
        html += '' +
          '<div style="display: flex; align-items: center; justify-content: space-between; gap: 14px;">' +
            '<div style="display: flex; align-items: center; gap: 6px;">' +
              '<span style="width: 8px; height: 8px; border-radius: 50%; background-color: ' + d.color + ';"></span>' +
              '<span style="color: var(--text-muted);">' + d.label + '</span>' +
            '</div>' +
            '<div><strong>' + d.value + '</strong> <span style="color: var(--text-dim); font-size: 0.7rem;">(' + pct + ' %)</span></div>' +
          '</div>';
      });
      breakdownContainer.innerHTML = html;
    }
  }

  /**
   * Rendert den gestapelten monatlichen Verlauf der Empfehlungen.
   */
  function renderRecommendationsHistory(history) {
    var canvas = document.getElementById('analyst-history-canvas');
    if (!canvas || !history || history.length === 0) return;

    var labels = [];
    var stacks = [];

    history.forEach(function (h) {
      var periodLabel = h.period === '0m' ? 'Aktuell' : h.period;
      labels.push(periodLabel);
      stacks.push({
        strongBuy: h.strongBuy || 0,
        buy: h.buy || 0,
        hold: h.hold || 0,
        sell: h.sell || 0,
        strongSell: h.strongSell || 0
      });
    });

    window.App.Charts.renderStackedBarChart(canvas, {
      labels: labels,
      stacks: stacks
    });
  }

  return {
    render: render
  };
})();

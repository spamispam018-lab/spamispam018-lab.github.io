// js/stock-analyst.js
// Visualisiert Kursziel-Spanne (Gauge/Bar), Kurs vs. Analystenziel,
// EPS-Estimates & Surprises sowie Analysten-Empfehlungen als Donut- und Verlaufs-Chart.

(function () {
  "use strict";

  function render(stockData) {
    const container = document.getElementById("analystWrapper");
    if (!container) return;

    if (!stockData || !stockData.analyst) {
      container.innerHTML = '<div class="empty-data-hint">Keine Analystendaten verfügbar.</div>';
      return;
    }

    const analyst = stockData.analyst;
    const targets = analyst.targets || {};
    const recommendations = analyst.recommendations || {};
    const epsEstimates = analyst.epsEstimates || [];
    const overview = stockData.overview || {};

    const currentPrice = targets.current != null ? Number(targets.current) : (overview.price != null ? Number(overview.price) : null);
    const lowPrice = targets.targetLow != null ? Number(targets.targetLow) : null;
    const meanPrice = targets.targetMean != null ? Number(targets.targetMean) : null;
    const highPrice = targets.targetHigh != null ? Number(targets.targetHigh) : null;
    const analystCount = targets.numberOfAnalysts != null ? targets.numberOfAnalysts : "-";

    // Upside / Downside zum Durchschnittsziel berechnen
    let upsidePct = null;
    let upsideClass = "val-neutral";
    if (currentPrice && meanPrice) {
      upsidePct = ((meanPrice - currentPrice) / currentPrice) * 100;
      upsideClass = upsidePct >= 0 ? "val-positive" : "val-negative";
    }

    // Kursziel-Gauge Position (0% bis 100% relative Position des aktuellen Kurses)
    let gaugePosition = 50;
    if (lowPrice !== null && highPrice !== null && highPrice > lowPrice && currentPrice !== null) {
      gaugePosition = Math.min(100, Math.max(0, ((currentPrice - lowPrice) / (highPrice - lowPrice)) * 100));
    }

    container.innerHTML =
      // 1. KURSZIEL GAUGE / KACHEL
      '<div class="info-card" style="margin-bottom: 14px;">' +
        '<div class="chart-header">' +
          '<div class="chart-title-group">' +
            '<span class="chart-title">Analysten-Kursziele</span>' +
            '<span class="chart-badge">' + analystCount + ' Analysten</span>' +
          '</div>' +
          '<span class="' + upsideClass + '" style="font-weight: 700; font-size: 13px;">' +
            (upsidePct !== null ? ((upsidePct >= 0 ? "+" : "") + upsidePct.toFixed(1) + "% Potential") : "-") +
          '</span>' +
        '</div>' +

        '<div style="margin: 14px 4px 6px 4px;">' +
          '<div style="position: relative; height: 8px; background-color: var(--bg-chip); border-radius: 4px;">' +
            '<div style="position: absolute; left: 0; top: 0; bottom: 0; width: ' + gaugePosition + '%; background-color: var(--color-blue); border-radius: 4px;"></div>' +
            '<div style="position: absolute; left: ' + gaugePosition + '%; top: -4px; width: 4px; height: 16px; background-color: var(--color-yellow); border-radius: 2px; transform: translateX(-50%);"></div>' +
          '</div>' +
          '<div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-top: 8px;">' +
            '<div>Tief: <strong style="color: var(--text-main);">' + (lowPrice ? lowPrice.toFixed(2) : "-") + '</strong></div>' +
            '<div>Mittel: <strong style="color: var(--color-yellow);">' + (meanPrice ? meanPrice.toFixed(2) : "-") + '</strong></div>' +
            '<div>Hoch: <strong style="color: var(--text-main);">' + (highPrice ? highPrice.toFixed(2) : "-") + '</strong></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // 2. FORWARD VALUATION KACHEL
      '<div class="info-card" style="margin-bottom: 14px;">' +
        '<div class="chart-header">' +
          '<div class="chart-title-group">' +
            '<span class="chart-title">Forward Valuation</span>' +
            '<span class="chart-badge">P/E Spanne</span>' +
          '</div>' +
        '</div>' +
        '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; text-align: center;">' +
          '<div style="background-color: var(--bg-chip); padding: 8px; border-radius: 6px;">' +
            '<div style="font-size: 10px; color: var(--text-muted);">Trailing P/E</div>' +
            '<div style="font-weight: 700; font-size: 14px; margin-top: 2px;">' + (overview.trailingPE ? Number(overview.trailingPE).toFixed(1) + "x" : "-") + '</div>' +
          '</div>' +
          '<div style="background-color: var(--bg-chip); padding: 8px; border-radius: 6px;">' +
            '<div style="font-size: 10px; color: var(--text-muted);">Forward P/E</div>' +
            '<div style="font-weight: 700; font-size: 14px; margin-top: 2px; color: var(--color-yellow);">' + (overview.forwardPE ? Number(overview.forwardPE).toFixed(1) + "x" : "-") + '</div>' +
          '</div>' +
          '<div style="background-color: var(--bg-chip); padding: 8px; border-radius: 6px;">' +
            '<div style="font-size: 10px; color: var(--text-muted);">PEG Ratio</div>' +
            '<div style="font-weight: 700; font-size: 14px; margin-top: 2px;">' + (overview.trailingPE && overview.forwardPE ? (overview.trailingPE / overview.forwardPE).toFixed(2) : "-") + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // 3. EPS ESTIMATES & SURPRISES CHART
      window.StockCharts.createChartCardHTML({
        id: "analyst_eps_chart",
        title: "EPS: Schätzung vs. Ist",
        badge: "Quartale",
        series: [
          { label: "Schätzung", color: window.StockCharts.PALETTE.blue },
          { label: "Tatsächlich", color: window.StockCharts.PALETTE.green }
        ]
      }) +

      // 4. ANALYST RECOMMENDATIONS (DONUT & MONATLICHE BALKEN)
      '<div class="info-card">' +
        '<div class="chart-header">' +
          '<div class="chart-title-group">' +
            '<span class="chart-title">Analysten-Empfehlungen</span>' +
            '<span class="chart-badge">' + (recommendations.consensus ? recommendations.consensus.toUpperCase() : "RATINGS") + '</span>' +
          '</div>' +
        '</div>' +
        '<div style="position: relative; height: 180px; margin: 10px 0;">' +
          '<canvas id="analyst_recs_donut_canvas"></canvas>' +
        '</div>' +
        '<div id="analystRecsLegend" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; font-size: 10px; text-align: center; margin-top: 6px;">' +
          // Legende wird dynamisch befüllt
        '</div>' +
      '</div>';

    renderEpsChart(epsEstimates);
    renderRecsDonut(recommendations);
  }

  function renderEpsChart(epsEstimates) {
    if (!epsEstimates || epsEstimates.length === 0) return;

    const sorted = epsEstimates.slice(-6); // Letzte 6 Quartale
    const labels = sorted.map(function (item) {
      const p = (item.date || "").split("-");
      return p.length >= 2 ? (p[1] + "/" + p[0].slice(2)) : item.date;
    });

    const estData = sorted.map(function (item) { return item.epsEstimate != null ? Number(item.epsEstimate) : null; });
    const repData = sorted.map(function (item) { return item.reportedEps != null ? Number(item.reportedEps) : null; });

    window.StockCharts.renderBarChart(
      "analyst_eps_chart_canvas",
      labels,
      [
        { label: "Schätzung", data: estData, color: window.StockCharts.PALETTE.blue },
        { label: "Tatsächlich", data: repData, color: window.StockCharts.PALETTE.green }
      ],
      "multiple"
    );
  }

  function renderRecsDonut(recommendations) {
    const cur = recommendations.currentMonth || {};
    const sBuy = Number(cur.strongBuy || 0);
    const buy = Number(cur.buy || 0);
    const hold = Number(cur.hold || 0);
    const sell = Number(cur.sell || 0);
    const sSell = Number(cur.strongSell || 0);
    const total = sBuy + buy + hold + sell + sSell;

    const data = [sBuy, buy, hold, sell, sSell];
    const labels = ["Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"];
    const colors = [
      window.StockCharts.PALETTE.green,
      "#3fb950",
      window.StockCharts.PALETTE.yellow,
      window.StockCharts.PALETTE.orange,
      window.StockCharts.PALETTE.red
    ];

    window.StockCharts.renderDonutChart(
      "analyst_recs_donut_canvas",
      labels,
      data,
      colors,
      total > 0 ? String(total) : "-"
    );

    const legendContainer = document.getElementById("analystRecsLegend");
    if (legendContainer && total > 0) {
      legendContainer.innerHTML = labels.map(function (lbl, idx) {
        const cnt = data[idx];
        const pct = ((cnt / total) * 100).toFixed(0);
        return (
          '<div style="background-color: var(--bg-chip); padding: 4px 2px; border-radius: 4px; border-top: 2px solid ' + colors[idx] + ';">' +
            '<div style="color: var(--text-muted); font-size: 9px;">' + lbl + '</div>' +
            '<div style="font-weight: 700; color: var(--text-main); margin-top: 2px;">' + cnt + '</div>' +
            '<div style="font-size: 9px; color: var(--text-muted);">' + pct + '%</div>' +
          '</div>'
        );
      }).join("");
    }
  }

  window.StockAnalyst = {
    render: render
  };
})();

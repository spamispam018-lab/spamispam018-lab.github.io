// js/stock-charts.js
// Chart-Helpers und Konfiguration für das dunkle Kartendesign der Detailansicht.
// Nutzt lokal eingebundenes Chart.js, optimiert für Touch & Smartphone-Displays.

(function () {
  "use strict";

  // Einheitliche Farbpalette gemäß Vorgabe
  const PALETTE = {
    green: "#2ea043",
    blue: "#388bfd",
    orange: "#d29922",
    purple: "#a371f7",
    yellow: "#e3b341",
    pink: "#f778ba",
    red: "#da3633",
    grid: "rgba(48, 54, 61, 0.45)",
    textMuted: "#8b949e",
    textLight: "#f0f6fc"
  };

  // Hilfsfunktion: Zahlen kompakt formatieren (z. B. 35B, 70M, 1.2K, 15%, 0.3x)
  function formatCompactNumber(val, type) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    const num = Number(val);
    const abs = Math.abs(num);

    if (type === "percent" || type === "%") {
      return (num >= 0 ? "" : "-") + abs.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
    }
    if (type === "multiple" || type === "x") {
      return abs.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "x";
    }

    if (abs >= 1e12) {
      return (num / 1e12).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "T";
    }
    if (abs >= 1e9) {
      return (num / 1e9).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "B";
    }
    if (abs >= 1e6) {
      return (num / 1e6).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M";
    }
    if (abs >= 1e3) {
      return (num / 1e3).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "K";
    }
    return num.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  // Erzeugt das standardisierte Karten-HTML mit Titel, Badge und Legende
  function createChartCardHTML(opts) {
    const cardId = opts.id || ("chart_card_" + Math.random().toString(36).substr(2, 9));
    const title = opts.title || "Metrik";
    const badge = opts.badge || "Quarterly";
    const series = opts.series || [];

    let legendHTML = "";
    if (series.length > 0) {
      legendHTML = '<div class="chart-legend-row">' + series.map(function (s) {
        return '<div class="legend-item"><span class="legend-line" style="background-color: ' + (s.color || PALETTE.blue) + ';"></span><span>' + s.label + '</span></div>';
      }).join("") + '</div>';
    }

    return (
      '<div class="chart-card" id="' + cardId + '">' +
        '<div class="chart-header">' +
          '<div class="chart-title-group">' +
            '<span class="chart-title">' + title + '</span>' +
            '<span class="chart-badge">' + badge + '</span>' +
          '</div>' +
        '</div>' +
        legendHTML +
        '<div class="chart-container-box">' +
          '<canvas id="' + cardId + '_canvas"></canvas>' +
        '</div>' +
      '</div>'
    );
  }

  // Basis-Optionen für Chart.js im Dark Mode
  function getDarkBaseOptions(valueType) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: "#161b22",
          titleColor: PALETTE.textLight,
          bodyColor: PALETTE.textLight,
          borderColor: "#30363d",
          borderWidth: 1,
          padding: 8,
          displayColors: true,
          callbacks: {
            label: function (ctx) {
              const label = ctx.dataset.label || "";
              const formatted = formatCompactNumber(ctx.parsed.y, valueType);
              return label ? (label + ": " + formatted) : formatted;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: PALETTE.textMuted,
            font: { size: 10 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6
          }
        },
        y: {
          grid: {
            color: PALETTE.grid,
            borderDash: [4, 4],
            drawBorder: false
          },
          ticks: {
            color: PALETTE.textMuted,
            font: { size: 10 },
            callback: function (val) {
              return formatCompactNumber(val, valueType);
            }
          }
        }
      }
    };
  }

  // Erstellt ein Balkendiagramm (z. B. für absolute Kennzahlen: Revenue, Net Income)
  function renderBarChart(canvasId, labels, datasets, valueType) {
    if (!window.Chart) return null;
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const existing = window.Chart.getChart(ctx);
    if (existing) existing.destroy();

    const formattedDatasets = datasets.map(function (ds) {
      return {
        label: ds.label,
        data: ds.data,
        backgroundColor: ds.color || PALETTE.blue,
        borderRadius: 4,
        maxBarThickness: 22
      };
    });

    return new window.Chart(ctx, {
      type: "bar",
      data: { labels: labels, datasets: formattedDatasets },
      options: getDarkBaseOptions(valueType || "currency")
    });
  }

  // Erstellt ein geglättetes Liniendiagramm mit dezentem Flächenverlauf (für Ratios & Margen)
  function renderLineChart(canvasId, labels, datasets, valueType) {
    if (!window.Chart) return null;
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const existing = window.Chart.getChart(ctx);
    if (existing) existing.destroy();

    const formattedDatasets = datasets.map(function (ds) {
      const color = ds.color || PALETTE.blue;
      return {
        label: ds.label,
        data: ds.data,
        borderColor: color,
        backgroundColor: ds.fill ? (color + "18") : "transparent",
        fill: !!ds.fill,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: ds.data.length > 20 ? 0 : 2,
        pointHoverRadius: 5
      };
    });

    return new window.Chart(ctx, {
      type: "line",
      data: { labels: labels, datasets: formattedDatasets },
      options: getDarkBaseOptions(valueType || "multiple")
    });
  }

  // Erstellt ein Donut-Diagramm mit Gesamtwert im Zentrum (z. B. Analystenempfehlungen)
  function renderDonutChart(canvasId, labels, data, colors, centerLabel) {
    if (!window.Chart) return null;
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const existing = window.Chart.getChart(ctx);
    if (existing) existing.destroy();

    return new window.Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors || [PALETTE.green, PALETTE.blue, PALETTE.yellow, PALETTE.orange, PALETTE.red],
          borderWidth: 2,
          borderColor: "#161b22"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "70%",
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#161b22",
            borderColor: "#30363d",
            borderWidth: 1,
            titleColor: PALETTE.textLight,
            bodyColor: PALETTE.textLight
          }
        }
      },
      plugins: [{
        id: "centerText",
        beforeDraw: function (chart) {
          if (!centerLabel) return;
          const width = chart.width;
          const height = chart.height;
          const chartCtx = chart.ctx;
          chartCtx.restore();
          chartCtx.font = "bold 18px " + PALETTE.textLight;
          chartCtx.textBaseline = "middle";
          chartCtx.fillStyle = PALETTE.textLight;
          const textX = Math.round((width - chartCtx.measureText(centerLabel).width) / 2);
          const textY = height / 2;
          chartCtx.fillText(centerLabel, textX, textY);
          chartCtx.save();
        }
      }]
    });
  }

  // Globaler Export
  window.StockCharts = {
    PALETTE: PALETTE,
    formatCompactNumber: formatCompactNumber,
    createChartCardHTML: createChartCardHTML,
    renderBarChart: renderBarChart,
    renderLineChart: renderLineChart,
    renderDonutChart: renderDonutChart
  };
})();

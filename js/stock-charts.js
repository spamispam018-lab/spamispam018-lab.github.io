/**
 * Visualisierungs-Engine für Aktienkurs- und Finanzdiagramme (Chart.js)
 */
const StockCharts = (function () {
  let activeCharts = {};

  function destroyChart(id) {
    if (activeCharts[id]) {
      activeCharts[id].destroy();
      delete activeCharts[id];
    }
  }

  function renderPriceHistoryChart(canvasId, historyData = []) {
    if (typeof Chart === "undefined") {
      console.error("Chart.js ist nicht geladen.");
      return null;
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.warn(`Canvas #${canvasId} nicht im DOM gefunden.`);
      return null;
    }

    destroyChart(canvasId);

    if (!Array.isArray(historyData) || historyData.length === 0) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#888";
      ctx.textAlign = "center";
      ctx.fillText("Keine historischen Kursdaten verfügbar", canvas.width / 2, canvas.height / 2);
      return null;
    }

    const labels = historyData.map(item => item.date);
    const prices = historyData.map(item => item.close);

    const isPositive = prices.length >= 2 ? prices[prices.length - 1] >= prices[0] : true;
    const strokeColor = isPositive ? "#10b981" : "#ef4444";
    const fillColor = isPositive ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)";

    const ctx = canvas.getContext("2d");
    activeCharts[canvasId] = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Schlusskurs",
          data: prices,
          borderColor: strokeColor,
          backgroundColor: fillColor,
          fill: true,
          tension: 0.15,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                const val = context.parsed.y;
                return `Kurs: $${val !== null ? val.toFixed(2) : "N/A"}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              maxTicksLimit: 8,
              font: { size: 11 }
            }
          },
          y: {
            grid: { color: "rgba(200, 200, 200, 0.15)" },
            ticks: {
              font: { size: 11 },
              callback: function (value) {
                return "$" + value;
              }
            }
          }
        }
      }
    });

    return activeCharts[canvasId];
  }

  function renderFinancialsBarChart(canvasId, title, labels = [], datasetList = []) {
    if (typeof Chart === "undefined") return null;

    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    destroyChart(canvasId);

    const ctx = canvas.getContext("2d");
    activeCharts[canvasId] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: datasetList
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: !!title,
            text: title
          },
          tooltip: {
            mode: "index",
            intersect: false
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: "rgba(200, 200, 200, 0.15)" },
            ticks: {
              callback: function (val) {
                return (val / 1e9).toFixed(1) + " Mrd.";
              }
            }
          }
        }
      }
    });

    return activeCharts[canvasId];
  }

  return {
    renderPriceHistoryChart,
    renderFinancialsBarChart,
    destroyChart
  };
})();

// Global verfügbar machen
window.StockCharts = StockCharts;

/**
 * Visualisierungs-Engine für allgemeine Dashboard-Charts (z. B. Sektorverteilung)
 */
const DashboardCharts = (function () {
  let activeCharts = {};

  function destroyChart(id) {
    if (activeCharts[id]) {
      activeCharts[id].destroy();
      delete activeCharts[id];
    }
  }

  function renderSectorDistribution(canvasId, stocks = []) {
    if (typeof Chart === "undefined") {
      console.warn("Chart.js ist nicht verfügbar.");
      return null;
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    destroyChart(canvasId);

    if (!Array.isArray(stocks) || stocks.length === 0) {
      return null;
    }

    // Sektor-Häufigkeiten zählen
    const sectorCounts = {};
    stocks.forEach(s => {
      const sector = s.sector || "Sonstige";
      sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
    });

    const labels = Object.keys(sectorCounts);
    const dataValues = Object.values(sectorCounts);

    const backgroundColors = [
      "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
      "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"
    ];

    const ctx = canvas.getContext("2d");
    activeCharts[canvasId] = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{
          data: dataValues,
          backgroundColor: backgroundColors.slice(0, labels.length),
          borderWidth: 2,
          borderColor: "#ffffff"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              boxWidth: 12,
              font: { size: 11 }
            }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const label = context.label || "";
                const val = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((val / total) * 100).toFixed(1);
                return `${label}: ${val} (${pct} %)`;
              }
            }
          }
        }
      }
    });

    return activeCharts[canvasId];
  }

  return {
    renderSectorDistribution,
    destroyChart
  };
})();

// Global verfügbar machen
window.DashboardCharts = DashboardCharts;

/**
 * Visualisierungs-Engine für Aktiencharts im Dark-Mode
 */
const StockCharts = (function () {
  let priceChartInstance = null;
  let financialsChartInstance = null;

  function destroyChart(instance) {
    if (instance) {
      instance.destroy();
    }
  }

  function renderPriceHistory(canvasId, historyData = []) {
    if (typeof Chart === "undefined") return null;

    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    destroyChart(priceChartInstance);

    if (!Array.isArray(historyData) || historyData.length === 0) return null;

    const labels = historyData.map(item => item.date);
    const prices = historyData.map(item => item.close);

    const ctx = canvas.getContext("2d");

    // Weicher Farbverlauf für die Fläche unter der Linie
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, "rgba(99, 102, 241, 0.35)");
    gradient.addColorStop(1, "rgba(99, 102, 241, 0.0)");

    priceChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Schlusskurs (€)",
          data: prices,
          borderColor: "#6366f1",
          backgroundColor: gradient,
          fill: true,
          borderWidth: 2.2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: "#ffffff",
          pointHoverBorderColor: "#6366f1",
          pointHoverBorderWidth: 2,
          tension: 0.2
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
            backgroundColor: "#1e2433",
            titleColor: "#94a3b8",
            bodyColor: "#f8fafc",
            borderColor: "#334155",
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: function (context) {
                const val = context.parsed.y;
                return `${Number(val).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: "#64748b",
              font: { size: 10 },
              maxTicksLimit: 6
            }
          },
          y: {
            position: "right",
            grid: {
              color: "rgba(255, 255, 255, 0.06)"
            },
            ticks: {
              color: "#64748b",
              font: { size: 10 },
              callback: function (val) {
                return `${val} €`;
              }
            }
          }
        }
      }
    });

    return priceChartInstance;
  }

  function renderFinancialsBarChart(canvasId, financialsData = {}) {
    if (typeof Chart === "undefined") return null;

    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    destroyChart(financialsChartInstance);

    const income = financialsData.incomeStatement || {};
    const periods = Object.keys(income).sort();

    if (periods.length === 0) return null;

    const revenues = [];
    const netIncomes = [];

    periods.forEach(p => {
      const yearData = income[p] || {};
      const rev = yearData.Total_Revenue || yearData.TotalRevenue || yearData.Operating_Revenue || 0;
      const net = yearData.Net_Income || yearData.NetIncome || 0;

      // In Milliarden bzw. Millionen skalieren zur besseren Lesbarkeit
      revenues.push(rev ? Number((rev / 1e9).toFixed(2)) : 0);
      netIncomes.push(net ? Number((net / 1e9).toFixed(2)) : 0);
    });

    const ctx = canvas.getContext("2d");
    financialsChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: periods,
        datasets: [
          {
            label: "Umsatz (Mrd. €)",
            data: revenues,
            backgroundColor: "#6366f1",
            borderRadius: 4
          },
          {
            label: "Nettogewinn (Mrd. €)",
            data: netIncomes,
            backgroundColor: "#10b981",
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: {
              color: "#94a3b8",
              font: { size: 11 },
              boxWidth: 12
            }
          },
          tooltip: {
            backgroundColor: "#1e2433",
            titleColor: "#94a3b8",
            bodyColor: "#f8fafc",
            borderColor: "#334155",
            borderWidth: 1,
            callbacks: {
              label: function (context) {
                return `${context.dataset.label}: ${context.parsed.y} Mrd. €`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: "#64748b",
              font: { size: 11 }
            }
          },
          y: {
            grid: {
              color: "rgba(255, 255, 255, 0.06)"
            },
            ticks: {
              color: "#64748b",
              font: { size: 10 }
            }
          }
        }
      }
    });

    return financialsChartInstance;
  }

  return {
    renderPriceHistory,
    renderFinancialsBarChart
  };
})();

window.StockCharts = StockCharts;

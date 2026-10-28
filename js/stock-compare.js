/**
 * Logik für den direkten Vergleich mehrerer Aktien (Performance & Kennzahlen)
 */
const StockCompare = (function () {
  let compareChartInstance = null;

  function getCompareSymbolsFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("compare") || params.get("symbols");
    if (!raw) return [];
    return raw
      .split(",")
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
  }

  async function loadStocksData(symbols = []) {
    if (!window.DataService || symbols.length === 0) return [];

    const fetchPromises = symbols.map(sym => window.DataService.loadStockDetails(sym));
    const results = await Promise.allSettled(fetchPromises);

    return results
      .filter(res => res.status === "fulfilled" && res.value !== null)
      .map(res => res.value);
  }

  function renderNormalizedChart(canvasId, stocksData = []) {
    if (typeof Chart === "undefined") return;

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (compareChartInstance) {
      compareChartInstance.destroy();
      compareChartInstance = null;
    }

    if (stocksData.length === 0) return;

    const colors = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
    const datasets = [];

    // Finde das längste gemeinsame Datumsset oder nutze die Daten des ersten Titels
    const baseStock = stocksData.find(s => Array.isArray(s.history) && s.history.length > 0);
    if (!baseStock) return;

    const labels = baseStock.history.map(item => item.date);

    stocksData.forEach((stock, idx) => {
      if (!Array.isArray(stock.history) || stock.history.length === 0) return;

      const basePrice = stock.history[0].close || 1;
      const normalizedData = stock.history.map(item => {
        if (!item.close || basePrice === 0) return 0;
        return Number((((item.close - basePrice) / basePrice) * 100).toFixed(2));
      });

      datasets.push({
        label: `${stock.symbol} (%)`,
        data: normalizedData,
        borderColor: colors[idx % colors.length],
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.1
      });
    });

    const ctx = canvas.getContext("2d");
    compareChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function (context) {
                const val = context.parsed.y;
                const sign = val > 0 ? "+" : "";
                return `${context.dataset.label}: ${sign}${val}%`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: "rgba(200, 200, 200, 0.15)" },
            ticks: {
              callback: function (val) {
                return val + "%";
              }
            }
          }
        }
      }
    });
  }

  function renderComparisonTable(containerId, stocksData = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (stocksData.length === 0) {
      container.innerHTML = '<p class="text-muted text-center py-6">Keine Aktien für den Vergleich ausgewählt.</p>';
      return;
    }

    let html = '<div class="table-responsive"><table class="data-table"><thead><tr><th>Kriterium</th>';
    stocksData.forEach(s => {
      html += `<th><a href="stock.html?symbol=${s.symbol}" class="font-bold">${s.symbol}</a><br><small class="text-muted font-normal">${s.name || ""}</small></th>`;
    });
    html += '</tr></thead><tbody>';

    const rows = [
      {
        label: "Aktueller Kurs",
        format: s => window.StockDataHandler ? window.StockDataHandler.formatCurrency(s.price) : `$${s.price || "N/A"}`
      },
      {
        label: "Tagesveränderung",
        format: s => {
          const change = s.changePercent;
          if (change === null || change === undefined) return "N/A";
          const sign = change > 0 ? "+" : "";
          const color = change >= 0 ? "text-green" : "text-red";
          return `<span class="${color}">${sign}${change.toFixed(2)} %</span>`;
        }
      },
      {
        label: "Marktkapitalisierung",
        format: s => window.StockDataHandler ? window.StockDataHandler.formatLargeNumber(s.valuation?.marketCap) : "-"
      },
      {
        label: "KGV (trailing)",
        format: s => s.valuation?.trailingPE ? Number(s.valuation.trailingPE).toFixed(2) : "-"
      },
      {
        label: "Forward KGV",
        format: s => s.valuation?.forwardPE ? Number(s.valuation.forwardPE).toFixed(2) : "-"
      },
      {
        label: "PEG Ratio",
        format: s => s.valuation?.pegRatio ? Number(s.valuation.pegRatio).toFixed(2) : "-"
      },
      {
        label: "Gesamtscore",
        format: s => {
          if (!window.StockScorer) return "-";
          const score = window.StockScorer.calculateScore(s);
          return `<span class="score-badge ${score.colorClass}">${score.total} / 100</span>`;
        }
      }
    ];

    rows.forEach(r => {
      html += `<tr><td class="font-bold">${r.label}</td>`;
      stocksData.forEach(s => {
        html += `<td>${r.format(s)}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  async function init() {
    const symbols = getCompareSymbolsFromUrl();
    const targetSymbols = symbols.length > 0 ? symbols : ["AAPL", "MSFT"];

    const stocksData = await loadStocksData(targetSymbols);
    renderComparisonTable("compare-table-container", stocksData);
    renderNormalizedChart("comparePerformanceChart", stocksData);
  }

  return {
    init,
    loadStocksData
  };
})();

// DOM-Ready Hook
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("compare-table-container") || document.getElementById("comparePerformanceChart")) {
    StockCompare.init();
  }
});

// Global verfügbar machen
window.StockCompare = StockCompare;

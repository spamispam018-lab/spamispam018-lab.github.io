/**
 * Aufbereitung und tabellarische/visuelle Darstellung von Finanzberichten
 */
const StockFinancials = (function () {
  function formatValue(val) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    return window.StockDataHandler
      ? window.StockDataHandler.formatLargeNumber(val)
      : val.toLocaleString("de-DE");
  }

  function getSortedYears(statementObj = {}) {
    return Object.keys(statementObj).sort();
  }

  function renderStatementTable(tableContainerId, statementObj = {}, rowDefinitions = []) {
    const container = document.getElementById(tableContainerId);
    if (!container) return;

    const years = getSortedYears(statementObj);
    if (years.length === 0) {
      container.innerHTML = '<p class="text-muted">Keine Finanzdaten vorhanden.</p>';
      return;
    }

    let html = '<div class="table-responsive"><table class="financial-table"><thead><tr><th>Position</th>';
    years.forEach(year => {
      html += `<th>${year}</th>`;
    });
    html += '</tr></thead><tbody>';

    rowDefinitions.forEach(def => {
      html += `<tr><td class="metric-label">${def.label}</td>`;
      years.forEach(year => {
        const rowData = statementObj[year] || {};
        const val = rowData[def.key];
        html += `<td>${formatValue(val)}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  function renderRevenueProfitChart(canvasId, incomeStmt = {}) {
    if (!window.StockCharts) return;

    const years = getSortedYears(incomeStmt);
    if (years.length === 0) return;

    const revenues = [];
    const profits = [];

    years.forEach(year => {
      const data = incomeStmt[year] || {};
      revenues.push(data["Total_Revenue"] || data["TotalRevenue"] || 0);
      profits.push(data["Net_Income"] || data["NetIncome"] || 0);
    });

    const datasets = [
      {
        label: "Umsatz",
        data: revenues,
        backgroundColor: "rgba(59, 130, 246, 0.7)",
        borderColor: "#3b82f6",
        borderWidth: 1
      },
      {
        label: "Nettogewinn",
        data: profits,
        backgroundColor: "rgba(16, 185, 129, 0.7)",
        borderColor: "#10b981",
        borderWidth: 1
      }
    ];

    window.StockCharts.renderFinancialsBarChart(canvasId, "Umsatz- und Gewinnentwicklung", years, datasets);
  }

  async function init() {
    let stock = window.StockDataHandler ? window.StockDataHandler.getCurrentStock() : null;
    if (!stock && window.StockDataHandler) {
      stock = await window.StockDataHandler.initCurrentStock();
    }
    if (!stock || !stock.financials) return;

    const { incomeStatement, balanceSheet, cashflow } = stock.financials;

    // Gewinn- und Verlustrechnung
    renderStatementTable("income-statement-table", incomeStatement, [
      { key: "Total_Revenue", label: "Gesamtumsatz" },
      { key: "Operating_Income", label: "Betriebsergebnis (EBIT)" },
      { key: "Net_Income", label: "Jahresüberschuss (Net Income)" }
    ]);

    // Bilanz
    renderStatementTable("balance-sheet-table", balanceSheet, [
      { key: "Total_Assets", label: "Gesamtvermögen" },
      { key: "Total_Liabilities_Net_Minority_Interest", label: "Gesamtverbindlichkeiten" },
      { key: "Stockholders_Equity", label: "Eigenkapital" }
    ]);

    // Cashflow
    renderStatementTable("cashflow-table", cashflow, [
      { key: "Operating_Cash_Flow", label: "Operativer Cashflow" },
      { key: "Investing_Cash_Flow", label: "Cashflow aus Investition" },
      { key: "Free_Cash_Flow", label: "Freier Cashflow" }
    ]);

    // Bar Chart zeichnen
    renderRevenueProfitChart("financialsBarChart", incomeStatement);
  }

  return {
    init
  };
})();

// Bei Bedarf nach DOM-Load starten
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("income-statement-table")) {
    StockFinancials.init();
  }
});

// Global verfügbar machen
window.StockFinancials = StockFinancials;

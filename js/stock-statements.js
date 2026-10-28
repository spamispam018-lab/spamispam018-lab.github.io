/**
 * Detaillierte Bilanz-, GuV- und Cashflow-Auszüge mit Kennzahlenvergleichen
 */
const StockStatements = (function () {
  const METRIC_ALIASES = {
    revenue: ["Total_Revenue", "TotalRevenue", "Operating_Revenue"],
    grossProfit: ["Gross_Profit", "GrossProfit"],
    operatingIncome: ["Operating_Income", "OperatingIncome", "EBIT"],
    netIncome: ["Net_Income", "NetIncome"],
    operatingCashFlow: ["Operating_Cash_Flow", "Total_Cash_From_Operating_Activities"],
    capitalExpenditures: ["Capital_Expenditure", "CapitalExpenditures"],
    freeCashFlow: ["Free_Cash_Flow", "FreeCashFlow"],
    totalAssets: ["Total_Assets", "TotalAssets"],
    totalLiabilities: ["Total_Liabilities_Net_Minority_Interest", "Total_Liabilities"],
    equity: ["Stockholders_Equity", "Total_Stockholder_Equity"]
  };

  function extractMetricValue(dataObj = {}, aliasKey) {
    const keys = METRIC_ALIASES[aliasKey] || [aliasKey];
    for (const k of keys) {
      if (dataObj[k] !== undefined && dataObj[k] !== null && !isNaN(dataObj[k])) {
        return Number(dataObj[k]);
      }
    }
    return null;
  }

  function calculateYoYGrowth(current, previous) {
    if (current === null || previous === null || previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  function renderDetailedTable(containerId, statementData = {}, metricList = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const periods = Object.keys(statementData).sort();
    if (periods.length === 0) {
      container.innerHTML = '<p class="text-muted text-center py-4">Keine detaillierten Berichtsdaten hinterlegt.</p>';
      return;
    }

    let html = '<div class="table-responsive"><table class="financial-table"><thead><tr>';
    html += '<th>Kennzahl</th>';
    periods.forEach(p => {
      html += `<th>${p}</th>`;
    });
    html += '<th>Trend (YoY)</th></tr></thead><tbody>';

    metricList.forEach(m => {
      html += `<tr><td class="metric-label">${m.label}</td>`;
      const values = periods.map(p => extractMetricValue(statementData[p], m.key));

      values.forEach(v => {
        const formatted = v !== null && window.StockDataHandler
          ? window.StockDataHandler.formatLargeNumber(v)
          : (v !== null ? v.toLocaleString("de-DE") : "-");
        html += `<td>${formatted}</td>`;
      });

      // Wachstumsrate zwischen den letzten beiden Perioden
      let yoyHtml = "-";
      if (values.length >= 2) {
        const latest = values[values.length - 1];
        const previous = values[values.length - 2];
        const growth = calculateYoYGrowth(latest, previous);
        if (growth !== null) {
          const sign = growth > 0 ? "+" : "";
          const colorClass = growth >= 0 ? "text-green" : "text-red";
          yoyHtml = `<span class="${colorClass}">${sign}${growth.toFixed(1)} %</span>`;
        }
      }
      html += `<td>${yoyHtml}</td></tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  async function init() {
    let stock = window.StockDataHandler ? window.StockDataHandler.getCurrentStock() : null;
    if (!stock && window.StockDataHandler) {
      stock = await window.StockDataHandler.initCurrentStock();
    }
    if (!stock || !stock.financials) return;

    const { incomeStatement, balanceSheet, cashflow } = stock.financials;

    renderDetailedTable("detailed-income-table", incomeStatement, [
      { key: "revenue", label: "Gesamtumsatz" },
      { key: "grossProfit", label: "Bruttoergebnis (Gross Profit)" },
      { key: "operatingIncome", label: "Operatives Ergebnis (EBIT)" },
      { key: "netIncome", label: "Jahresüberschuss" }
    ]);

    renderDetailedTable("detailed-balance-table", balanceSheet, [
      { key: "totalAssets", label: "Bilanzsumme (Assets)" },
      { key: "totalLiabilities", label: "Verbindlichkeiten" },
      { key: "equity", label: "Eigenkapital" }
    ]);

    renderDetailedTable("detailed-cashflow-table", cashflow, [
      { key: "operatingCashFlow", label: "Operativer Cashflow" },
      { key: "capitalExpenditures", label: "Investitionsausgaben (CapEx)" },
      { key: "freeCashFlow", label: "Freier Cashflow (FCF)" }
    ]);
  }

  return {
    init
  };
})();

// DOM-Ready Hook
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("detailed-income-table")) {
    StockStatements.init();
  }
});

// Global verfügbar machen
window.StockStatements = StockStatements;

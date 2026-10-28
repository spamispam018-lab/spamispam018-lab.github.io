/**
 * Controller zur Aufbereitung und Darstellung der Finanzdaten im Dark-Mode
 */
const StockFinancials = (function () {
  function formatFinancialVal(val) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    const num = Math.abs(val);
    const sign = val < 0 ? "-" : "";

    if (num >= 1e9) {
      return `${sign}${(num / 1e9).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mrd. €`;
    }
    if (num >= 1e6) {
      return `${sign}${(num / 1e6).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mio. €`;
    }
    return `${sign}${Number(val).toLocaleString("de-DE")} €`;
  }

  function renderTable(containerId, dataMap, rowConfig) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!dataMap || typeof dataMap !== "object" || Object.keys(dataMap).length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.82rem; text-align: center; padding: 1rem 0;">Keine Berichtsdaten hinterlegt.</p>';
      return;
    }

    const periods = Object.keys(dataMap).sort();
    let html = `
      <div style="overflow-x: auto; width: 100%; scrollbar-width: none;">
        <table class="financial-table-dark">
          <thead>
            <tr>
              <th>Position</th>
    `;

    periods.forEach(p => {
      html += `<th>${p}</th>`;
    });
    html += `</tr></thead><tbody>`;

    rowConfig.forEach(row => {
      html += `<tr><td>${row.label}</td>`;
      periods.forEach(p => {
        const item = dataMap[p] || {};
        let val = null;
        for (const k of row.keys) {
          if (item[k] !== undefined && item[k] !== null && !isNaN(item[k])) {
            val = Number(item[k]);
            break;
          }
        }
        html += `<td>${formatFinancialVal(val)}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  }

  function renderIncomeStatement(incomeData) {
    renderTable("income-statement-table", incomeData, [
      { label: "Umsatzerlöse", keys: ["Total_Revenue", "TotalRevenue", "Operating_Revenue"] },
      { label: "Bruttoergebnis", keys: ["Gross_Profit", "GrossProfit"] },
      { label: "Operatives Ergebnis (EBIT)", keys: ["Operating_Income", "OperatingIncome"] },
      { label: "Nettogewinn", keys: ["Net_Income", "NetIncome"] }
    ]);
  }

  function renderBalanceSheet(balanceData) {
    renderTable("balance-sheet-table", balanceData, [
      { label: "Gesamtaktiva (Assets)", keys: ["Total_Assets", "TotalAssets"] },
      { label: "Verbindlichkeiten", keys: ["Total_Liabilities_Net_Minority_Interest", "Total_Liabilities"] },
      { label: "Eigenkapital", keys: ["Stockholders_Equity", "Total_Stockholder_Equity"] },
      { label: "Zahlungsmittelbestand", keys: ["Cash_And_Cash_Equivalents", "CashAndCashEquivalents"] }
    ]);
  }

  function renderCashflow(cashflowData) {
    renderTable("cashflow-table", cashflowData, [
      { label: "Operativer Cashflow", keys: ["Operating_Cash_Flow", "Total_Cash_From_Operating_Activities"] },
      { label: "Investitionsausgaben (CapEx)", keys: ["Capital_Expenditure", "CapitalExpenditures"] },
      { label: "Freier Cashflow (FCF)", keys: ["Free_Cash_Flow", "FreeCashFlow"] }
    ]);
  }

  async function init() {
    let stock = window.StockDataHandler ? window.StockDataHandler.getCurrentStock() : null;
    if (!stock && window.StockDataHandler) {
      stock = await window.StockDataHandler.initCurrentStock();
    }
    if (!stock || !stock.financials) return;

    renderIncomeStatement(stock.financials.incomeStatement);
    renderBalanceSheet(stock.financials.balanceSheet);
    renderCashflow(stock.financials.cashflow);

    if (window.StockCharts && typeof window.StockCharts.renderFinancialsBarChart === "function") {
      window.StockCharts.renderFinancialsBarChart("financialsBarChart", stock.financials);
    }
  }

  return {
    init
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("income-statement-table")) {
    StockFinancials.init();
  }
});

window.StockFinancials = StockFinancials;

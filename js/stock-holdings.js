/**
 * Aufbereitung und Darstellung von institutionellen Anteilseignern und Großaktionären
 */
const StockHoldings = (function () {
  function formatShares(val) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    return Number(val).toLocaleString("de-DE");
  }

  function formatPercent(val) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    // Falls der Wert als Dezimalzahl (z.B. 0.075 statt 7.5%) vorliegt
    const pct = val <= 1 && val > 0 ? val * 100 : val;
    return `${pct.toFixed(2)} %`;
  }

  function renderHoldingsTable(containerId, holdingsList = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!Array.isArray(holdingsList) || holdingsList.length === 0) {
      container.innerHTML = '<p class="text-muted text-center py-4">Keine institutionellen Anteilseignerdaten verfügbar.</p>';
      return;
    }

    let html = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Institution / Investor</th>
              <th>Gehaltene Aktien</th>
              <th>Anteil am Unternehmen</th>
              <th>Gesamtwert</th>
              <th>Meldedatum</th>
            </tr>
          </thead>
          <tbody>
    `;

    holdingsList.forEach(item => {
      const holderName = item.Holder || item.holder || item.organization || "-";
      const shares = item.Shares || item.shares || item.holding || null;
      const percentOut = item["% Out"] || item.percentOut || item.pctHeld || null;
      const value = item.Value || item.value || null;
      const dateReported = item["Date Reported"] || item.dateReported || item.date || "-";

      const formattedValue = value !== null && window.StockDataHandler
        ? window.StockDataHandler.formatLargeNumber(value)
        : (value !== null ? `$${Number(value).toLocaleString("de-DE")}` : "-");

      html += `
        <tr>
          <td><strong>${holderName}</strong></td>
          <td>${formatShares(shares)}</td>
          <td>${formatPercent(percentOut)}</td>
          <td>${formattedValue}</td>
          <td>${dateReported}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;
  }

  async function init() {
    let stock = window.StockDataHandler ? window.StockDataHandler.getCurrentStock() : null;
    if (!stock && window.StockDataHandler) {
      stock = await window.StockDataHandler.initCurrentStock();
    }
    if (!stock) return;

    // Unterstützt verschiedene JSON-Strukturen (holdings, majorHolders, institutionalHolders)
    const holdings = stock.holdings || stock.institutionalHolders || stock.majorHolders || [];
    renderHoldingsTable("stock-holdings-container", holdings);
  }

  return {
    init,
    renderHoldingsTable
  };
})();

// DOM-Ready Hook
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("stock-holdings-container")) {
    StockHoldings.init();
  }
});

// Global verfügbar machen
window.StockHoldings = StockHoldings;

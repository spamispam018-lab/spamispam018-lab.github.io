/**
 * UI-Controller für das Haupt-Dashboard und Tabellenansichten
 */
const UIController = (function () {
  function getDetailUrl(symbol) {
    const path = window.location.pathname;
    if (path.includes("/Views/") || path.includes("/views/")) {
      return `stock.html?symbol=${encodeURIComponent(symbol)}`;
    }
    return `Views/stock.html?symbol=${encodeURIComponent(symbol)}`;
  }

  function renderDashboardStats(stocks = []) {
    const totalEl = document.getElementById("stat-total-stocks");
    const topGainerEl = document.getElementById("stat-top-gainer");
    const topGainerSymEl = document.getElementById("stat-top-gainer-symbol");
    const topLoserEl = document.getElementById("stat-top-loser");
    const topLoserSymEl = document.getElementById("stat-top-loser-symbol");

    if (!totalEl || stocks.length === 0) return;

    totalEl.textContent = stocks.length;

    // Sortierung nach Tagesveränderung
    const validStocks = stocks.filter(s => typeof s.changePercent === "number" && !isNaN(s.changePercent));
    if (validStocks.length === 0) return;

    const sortedByChange = [...validStocks].sort((a, b) => b.changePercent - a.changePercent);
    const topGainer = sortedByChange[0];
    const topLoser = sortedByChange[sortedByChange.length - 1];

    if (topGainer && topGainerEl) {
      const gainerSign = topGainer.changePercent > 0 ? "+" : "";
      topGainerEl.textContent = `${gainerSign}${topGainer.changePercent.toFixed(2)} %`;
      if (topGainerSymEl) topGainerSymEl.textContent = `${topGainer.symbol} (${topGainer.name})`;
    }

    if (topLoser && topLoserEl) {
      const loserSign = topLoser.changePercent > 0 ? "+" : "";
      topLoserEl.textContent = `${loserSign}${topLoser.changePercent.toFixed(2)} %`;
      if (topLoserSymEl) topLoserSymEl.textContent = `${topLoser.symbol} (${topLoser.name})`;
    }
  }

  function renderDashboardTable(stocks = []) {
    const tbody = document.getElementById("dashboard-stock-table");
    if (!tbody) return;

    if (stocks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-muted">Keine Daten verfügbar.</td></tr>';
      return;
    }

    let html = "";
    // Zeige die ersten 10 Titel auf dem Dashboard
    stocks.slice(0, 10).forEach(stock => {
      const isPositive = (stock.changePercent || 0) >= 0;
      const changeClass = isPositive ? "text-green" : "text-red";
      const sign = isPositive ? "+" : "";
      const priceStr = window.StockDataHandler
        ? window.StockDataHandler.formatCurrency(stock.price)
        : `$${stock.price || "N/A"}`;
      const changeStr = typeof stock.changePercent === "number"
        ? `${sign}${stock.changePercent.toFixed(2)} %`
        : "N/A";
      const capStr = window.StockDataHandler
        ? window.StockDataHandler.formatLargeNumber(stock.marketCap)
        : stock.marketCap || "N/A";

      html += `
        <tr>
          <td><a href="${getDetailUrl(stock.symbol)}" class="font-bold">${stock.symbol}</a></td>
          <td>${stock.name}</td>
          <td><span class="badge-sector">${stock.sector || "N/A"}</span></td>
          <td>${priceStr}</td>
          <td class="${changeClass}">${changeStr}</td>
          <td>${capStr}</td>
          <td>
            <a href="${getDetailUrl(stock.symbol)}" class="btn btn-sm btn-outline">Details</a>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  async function init() {
    if (!window.DataService) return;

    try {
      const stocks = await window.DataService.loadStocks();
      renderDashboardStats(stocks);
      renderDashboardTable(stocks);
    } catch (err) {
      console.error("Fehler beim Initialisieren der UI:", err);
    }
  }

  return {
    init,
    getDetailUrl
  };
})();

// DOM-Ready Initialisierung
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("dashboard-stock-table")) {
    UIController.init();
  }
});

// Global verfügbar machen
window.UIController = UIController;

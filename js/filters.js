/**
 * Filter- und Sortiersteuerung für den Aktien-Screener
 */
const ScreenerFilters = (function () {
  let allStocks = [];
  let filteredStocks = [];

  function getDetailUrl(symbol) {
    if (window.UIController && typeof window.UIController.getDetailUrl === "function") {
      return window.UIController.getDetailUrl(symbol);
    }
    const path = window.location.pathname;
    if (path.includes("/Views/") || path.includes("/views/")) {
      return `stock.html?symbol=${encodeURIComponent(symbol)}`;
    }
    return `Views/stock.html?symbol=${encodeURIComponent(symbol)}`;
  }

  function populateSectorDropdown() {
    const select = document.getElementById("sector-filter");
    if (!select) return;

    const sectors = new Set();
    allStocks.forEach(stock => {
      if (stock.sector && stock.sector !== "N/A") {
        sectors.add(stock.sector);
      }
    });

    // Vorhandene dynamische Optionen leeren (nur 'all' behalten)
    select.innerHTML = '<option value="all">Alle Sektoren</option>';
    Array.from(sectors).sort().forEach(sector => {
      const opt = document.createElement("option");
      opt.value = sector;
      opt.textContent = sector;
      select.appendChild(opt);
    });
  }

  function applyFilters() {
    const searchInput = document.getElementById("search-input");
    const sectorFilter = document.getElementById("sector-filter");
    const sortSelect = document.getElementById("sort-select");

    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const selectedSector = sectorFilter ? sectorFilter.value : "all";
    const sortMode = sortSelect ? sortSelect.value : "marketCap_desc";

    filteredStocks = allStocks.filter(stock => {
      const matchSearch =
        !query ||
        (stock.symbol && stock.symbol.toLowerCase().includes(query)) ||
        (stock.name && stock.name.toLowerCase().includes(query));

      const matchSector =
        selectedSector === "all" ||
        (stock.sector && stock.sector === selectedSector);

      return matchSearch && matchSector;
    });

    // Sortierung
    filteredStocks.sort((a, b) => {
      switch (sortMode) {
        case "marketCap_desc":
          return (b.marketCap || 0) - (a.marketCap || 0);
        case "marketCap_asc":
          return (a.marketCap || 0) - (b.marketCap || 0);
        case "pe_asc":
          return (a.peRatio || 9999) - (b.peRatio || 9999);
        case "dividend_desc":
          return (b.dividendYield || 0) - (a.dividendYield || 0);
        case "change_desc":
          return (b.changePercent || -999) - (a.changePercent || -999);
        default:
          return 0;
      }
    });

    renderTable();
  }

  function renderTable() {
    const tbody = document.getElementById("screener-table-body");
    const noResults = document.getElementById("no-results-msg");
    if (!tbody) return;

    if (filteredStocks.length === 0) {
      tbody.innerHTML = "";
      if (noResults) noResults.style.display = "block";
      return;
    }

    if (noResults) noResults.style.display = "none";

    let html = "";
    filteredStocks.forEach(stock => {
      const isPositive = (stock.changePercent || 0) >= 0;
      const changeClass = isPositive ? "text-green" : "text-red";
      const sign = isPositive ? "+" : "";

      const priceStr = window.StockDataHandler
        ? window.StockDataHandler.formatCurrency(stock.price)
        : `$${stock.price || "N/A"}`;

      const changeStr = typeof stock.changePercent === "number"
        ? `${sign}${stock.changePercent.toFixed(2)} %`
        : "N/A";

      const peStr = typeof stock.peRatio === "number"
        ? stock.peRatio.toFixed(2)
        : "-";

      const divStr = typeof stock.dividendYield === "number"
        ? `${stock.dividendYield.toFixed(2)} %`
        : "-";

      const capStr = window.StockDataHandler
        ? window.StockDataHandler.formatLargeNumber(stock.marketCap)
        : stock.marketCap || "N/A";

      html += `
        <tr>
          <td><a href="${getDetailUrl(stock.symbol)}" class="font-bold">${stock.symbol}</a></td>
          <td>${stock.name || "-"}</td>
          <td><span class="badge-sector">${stock.sector || "N/A"}</span></td>
          <td>${priceStr}</td>
          <td class="${changeClass}">${changeStr}</td>
          <td>${peStr}</td>
          <td>${divStr}</td>
          <td>${capStr}</td>
          <td>
            <a href="${getDetailUrl(stock.symbol)}" class="btn btn-sm btn-outline">Details</a>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  function attachEventListeners() {
    const searchInput = document.getElementById("search-input");
    const sectorFilter = document.getElementById("sector-filter");
    const sortSelect = document.getElementById("sort-select");

    if (searchInput) {
      searchInput.addEventListener("input", applyFilters);
    }
    if (sectorFilter) {
      sectorFilter.addEventListener("change", applyFilters);
    }
    if (sortSelect) {
      sortSelect.addEventListener("change", applyFilters);
    }
  }

  async function init() {
    if (!window.DataService) return;

    try {
      allStocks = await window.DataService.loadStocks();
      filteredStocks = [...allStocks];
      populateSectorDropdown();
      attachEventListeners();
      applyFilters();
    } catch (err) {
      console.error("Fehler beim Initialisieren des Screeners:", err);
    }
  }

  return {
    init
  };
})();

// DOM-Ready Hook
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("screener-table-body")) {
    ScreenerFilters.init();
  }
});

// Global verfügbar machen
window.ScreenerFilters = ScreenerFilters;

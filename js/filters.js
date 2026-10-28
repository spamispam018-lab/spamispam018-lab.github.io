/**
 * Filter- und Rendering-Logik für den Screener
 */
const ScreenerController = (function () {
  let allStocks = [];
  let filteredStocks = [];
  let activeChip = "all";

  function getDetailUrl(symbol) {
    const pathname = window.location.pathname;
    if (pathname.includes("/Views/") || pathname.includes("/views/")) {
      return `stock.html?symbol=${encodeURIComponent(symbol)}`;
    }
    return `Views/stock.html?symbol=${encodeURIComponent(symbol)}`;
  }

  function formatEuroPrice(val) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    return Number(val).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " €";
  }

  function formatPercent(val) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    const sign = val > 0 ? "+" : "";
    return `${sign}${Number(val).toFixed(2).replace(".", ",")}%`;
  }

  function updateHeroStats(stocks) {
    const totalEl = document.getElementById("stat-total-title");
    const topGainerEl = document.getElementById("stat-top-gainer");
    const avgPeEl = document.getElementById("stat-avg-pe");
    const avgDivEl = document.getElementById("stat-avg-div");
    const subtitleEl = document.getElementById("status-subtitle");

    if (subtitleEl) subtitleEl.textContent = "Live-Marktdaten synchronisiert";
    if (totalEl) totalEl.textContent = `${stocks.length} Titel`;

    if (stocks.length === 0) return;

    // Top Gewinner
    const validGainers = [...stocks].filter(s => typeof s.changePercent === "number" && !isNaN(s.changePercent));
    if (validGainers.length > 0) {
      validGainers.sort((a, b) => b.changePercent - a.changePercent);
      const top = validGainers[0];
      const sign = top.changePercent > 0 ? "+" : "";
      if (topGainerEl) {
        topGainerEl.textContent = `${top.symbol} (${sign}${top.changePercent.toFixed(2).replace(".", ",")} %)`;
      }
    }

    // Ø KGV
    const validPEs = stocks.filter(s => typeof s.peRatio === "number" && s.peRatio > 0 && s.peRatio < 150);
    if (validPEs.length > 0 && avgPeEl) {
      const avgPe = validPEs.reduce((acc, curr) => acc + curr.peRatio, 0) / validPEs.length;
      avgPeEl.textContent = avgPe.toFixed(1).replace(".", ",");
    }

    // Ø Dividendenrendite
    const validDivs = stocks.filter(s => typeof s.dividendYield === "number" && !isNaN(s.dividendYield));
    if (validDivs.length > 0 && avgDivEl) {
      const avgDiv = validDivs.reduce((acc, curr) => acc + curr.dividendYield, 0) / validDivs.length;
      avgDivEl.textContent = `${avgDiv.toFixed(1).replace(".", ",")} %`;
    }
  }

  function applyFilters() {
    const searchInput = document.getElementById("search-input");
    const sortSelect = document.getElementById("sort-select");

    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const sortMode = sortSelect ? sortSelect.value : "marketCap_desc";

    filteredStocks = allStocks.filter(stock => {
      // 1. Textsuche
      const matchesSearch = !query ||
        (stock.symbol && stock.symbol.toLowerCase().includes(query)) ||
        (stock.name && stock.name.toLowerCase().includes(query));

      if (!matchesSearch) return false;

      // 2. Chip-Filter
      switch (activeChip) {
        case "dividend":
          return typeof stock.dividendYield === "number" && stock.dividendYield >= 2.0;
        case "value":
          return typeof stock.peRatio === "number" && stock.peRatio > 0 && stock.peRatio < 18.0;
        case "growth":
          return typeof stock.changePercent === "number" && stock.changePercent > 1.0;
        case "all":
        default:
          return true;
      }
    });

    // 3. Sortierung
    filteredStocks.sort((a, b) => {
      switch (sortMode) {
        case "marketCap_desc":
          return (b.marketCap || 0) - (a.marketCap || 0);
        case "change_desc":
          return (b.changePercent || -999) - (a.changePercent || -999);
        case "change_asc":
          return (a.changePercent || 999) - (b.changePercent || 999);
        case "pe_asc":
          return (a.peRatio || 9999) - (b.peRatio || 9999);
        case "dividend_desc":
          return (b.dividendYield || 0) - (a.dividendYield || 0);
        default:
          return 0;
      }
    });

    renderList();
  }

  function renderList() {
    const container = document.getElementById("stock-list-container");
    const countEl = document.getElementById("results-count");
    if (!container) return;

    if (countEl) {
      countEl.textContent = `${filteredStocks.length} Ergebnisse`;
    }

    if (filteredStocks.length === 0) {
      container.innerHTML = `
        <div class="empty-box">
          <p>Keine passenden Titel für diese Filterung gefunden.</p>
        </div>
      `;
      return;
    }

    let html = "";
    filteredStocks.forEach(stock => {
      const isPositive = (stock.changePercent || 0) >= 0;
      const changeClass = isPositive ? "positive" : "negative";

      html += `
        <a href="${getDetailUrl(stock.symbol)}" class="stock-card">
          <div class="stock-info">
            <span class="stock-name">${stock.name || stock.symbol}</span>
            <div class="stock-tags">
              <span class="stock-badge-ticker">${stock.symbol}</span>
              <span>•</span>
              <span>${stock.sector || "Aktie"}</span>
            </div>
          </div>
          <div class="stock-price-box">
            <div class="stock-price-val">${formatEuroPrice(stock.price)}</div>
            <div class="stock-change-pill ${changeClass}">${formatPercent(stock.changePercent)}</div>
          </div>
        </a>
      `;
    });

    container.innerHTML = html;
  }

  function attachListeners() {
    const searchInput = document.getElementById("search-input");
    const sortSelect = document.getElementById("sort-select");
    const chips = document.querySelectorAll(".chip-btn");

    if (searchInput) {
      searchInput.addEventListener("input", applyFilters);
    }

    if (sortSelect) {
      sortSelect.addEventListener("change", applyFilters);
    }

    chips.forEach(chip => {
      chip.addEventListener("click", () => {
        chips.forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        activeChip = chip.dataset.filter || "all";
        applyFilters();
      });
    });
  }

  async function init() {
    if (!window.DataService) return;

    try {
      allStocks = await window.DataService.loadStocks();
      filteredStocks = [...allStocks];
      updateHeroStats(allStocks);
      attachListeners();
      applyFilters();
    } catch (err) {
      console.error("Fehler beim Initialisieren des Screeners:", err);
    }
  }

  return {
    init
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("stock-list-container")) {
    ScreenerController.init();
  }
});

window.ScreenerController = ScreenerController;

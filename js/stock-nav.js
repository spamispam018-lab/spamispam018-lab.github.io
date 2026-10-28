// js/stock-nav.js
// Navigationslogik für Tabs, Ticker-Suche mit Chip und URL-Parameter.
// Bindet alle View-Module zusammen und verwaltet den globalen App-Zustand.

(function () {
  "use strict";

  const state = {
    currentTicker: "AAPL",
    activeTab: "overview",
    activeSubtab: "financial-charts",
    stockData: null
  };

  // URL-Parameter parsen (z. B. Views/stock.html?ticker=MSFT&tab=score)
  function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const ticker = params.get("ticker");
    const tab = params.get("tab");
    if (ticker) {
      state.currentTicker = ticker.trim().toUpperCase();
    }
    if (tab) {
      state.activeTab = tab.toLowerCase();
    }
  }

  // URL aktualisieren ohne Neuladen (PushState)
  function updateUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("ticker", state.currentTicker);
      url.searchParams.set("tab", state.activeTab);
      window.history.replaceState({}, "", url.toString());
    } catch (e) {
      // Fallback für Umgebungen ohne History-Support
    }
  }

  // Header & Ticker-Chip aktualisieren
  function updateHeaderUI() {
    const chipText = document.getElementById("chipTickerSymbol");
    const searchInput = document.getElementById("tickerSearchInput");
    if (chipText) chipText.textContent = state.currentTicker;
    if (searchInput) searchInput.value = "";

    if (!state.stockData) return;

    const data = state.stockData;
    const nameEl = document.getElementById("stockCompanyName");
    const sectorBadge = document.getElementById("stockSectorBadge");
    const currencyEl = document.getElementById("stockCurrency");
    const priceEl = document.getElementById("stockCurrentPrice");
    const changeEl = document.getElementById("stockPriceChange");

    if (nameEl) nameEl.textContent = data.name || state.currentTicker;
    if (sectorBadge) sectorBadge.textContent = data.sector || "-";
    if (currencyEl) currencyEl.textContent = data.currency || "USD";

    const overview = data.overview || {};
    const price = overview.price;
    const dayChange = overview.dayChange;

    if (priceEl) {
      priceEl.textContent = (price !== null && price !== undefined)
        ? Number(price).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + (data.currency || "USD")
        : "--";
    }

    if (changeEl) {
      if (dayChange !== null && dayChange !== undefined) {
        const numChange = Number(dayChange);
        const sign = numChange > 0 ? "+" : "";
        changeEl.textContent = sign + numChange.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
        changeEl.className = "stock-price-change " + (numChange > 0 ? "val-positive" : (numChange < 0 ? "val-negative" : "val-neutral"));
      } else {
        changeEl.textContent = "--";
        changeEl.className = "stock-price-change val-neutral";
      }
    }
  }

  // Tabs umschalten
  function switchTab(tabId) {
    state.activeTab = tabId;
    updateUrl();

    // Tab-Buttons aktualisieren
    const buttons = document.querySelectorAll(".stock-tabs-nav .tab-btn");
    buttons.forEach(function (btn) {
      if (btn.getAttribute("data-tab") === tabId) {
        btn.classList.add("active");
        btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      } else {
        btn.classList.remove("active");
      }
    });

    // Content-Panes umschalten
    const panes = document.querySelectorAll(".stock-content-container .tab-pane");
    panes.forEach(function (pane) {
      if (pane.id === "tab-" + tabId) {
        pane.classList.add("active");
      } else {
        pane.classList.remove("active");
      }
    });

    // Modul für den jeweiligen Tab aufrufen/rendern
    renderActiveTab();
  }

  // Unter-Tabs (Financials: Charts vs Statements) umschalten
  function switchSubtab(subtabId) {
    state.activeSubtab = subtabId;
    const buttons = document.querySelectorAll(".sub-nav-bar .sub-nav-btn");
    buttons.forEach(function (btn) {
      if (btn.getAttribute("data-subtab") === subtabId) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    const panes = document.querySelectorAll("#tab-financials .subtab-pane");
    panes.forEach(function (pane) {
      if (pane.id === "subtab-" + subtabId) {
        pane.classList.add("active");
      } else {
        pane.classList.remove("active");
      }
    });

    if (subtabId === "financial-charts" && window.StockFinancials) {
      window.StockFinancials.render(state.stockData);
    } else if (subtabId === "financial-statements" && window.StockStatements) {
      window.StockStatements.render(state.stockData);
    }
  }

  // Ruft den Renderer des aktiven Tabs auf
  function renderActiveTab() {
    if (!state.stockData) return;

    switch (state.activeTab) {
      case "overview":
        if (window.StockOverview) window.StockOverview.render(state.stockData);
        break;
      case "score":
        if (window.StockScore) window.StockScore.render(state.stockData);
        break;
      case "holdings":
        if (window.StockHoldings) window.StockHoldings.render(state.stockData);
        break;
      case "analyst":
        if (window.StockAnalyst) window.StockAnalyst.render(state.stockData);
        break;
      case "financials":
        if (state.activeSubtab === "financial-charts" && window.StockFinancials) {
          window.StockFinancials.render(state.stockData);
        } else if (state.activeSubtab === "financial-statements" && window.StockStatements) {
          window.StockStatements.render(state.stockData);
        }
        break;
      case "compare":
        if (window.StockCompare) window.StockCompare.render(state.stockData);
        break;
    }
  }

  // Daten für aktuellen Ticker laden
  function loadStock(ticker, forceRefresh) {
    if (!ticker) return;
    state.currentTicker = ticker.toUpperCase();
    updateUrl();
    updateHeaderUI();

    const overlay = document.getElementById("loadingOverlay");
    const errorBanner = document.getElementById("errorBanner");
    const errorMsg = document.getElementById("errorMessage");

    if (overlay) overlay.classList.add("visible");
    if (errorBanner) errorBanner.style.display = "none";

    window.StockData.fetchStockDetail(state.currentTicker, forceRefresh)
      .then(function (data) {
        state.stockData = data;
        updateHeaderUI();
        renderActiveTab();
      })
      .catch(function (err) {
        console.error("Fehler beim Laden:", err);
        if (errorBanner && errorMsg) {
          errorMsg.textContent = err.message || "Fehler beim Laden der Aktiendaten.";
          errorBanner.style.display = "flex";
        }
      })
      .finally(function () {
        if (overlay) overlay.classList.remove("visible");
      });
  }

  // Event Listener initialisieren
  function initEvents() {
    // Tab-Buttons
    document.querySelectorAll(".stock-tabs-nav .tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const tab = this.getAttribute("data-tab");
        switchTab(tab);
      });
    });

    // Subtab-Buttons
    document.querySelectorAll(".sub-nav-bar .sub-nav-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const subtab = this.getAttribute("data-subtab");
        switchSubtab(subtab);
      });
    });

    // Suchfeld & Buttons
    const searchInput = document.getElementById("tickerSearchInput");
    const searchBtn = document.getElementById("tickerSearchBtn");
    const refreshBtn = document.getElementById("refreshStockBtn");
    const clearChipBtn = document.getElementById("chipClearBtn");
    const errorDismissBtn = document.getElementById("errorDismissBtn");

    function executeSearch() {
      const val = (searchInput.value || "").trim().toUpperCase();
      if (val) {
        loadStock(val, false);
      }
    }

    if (searchBtn) searchBtn.addEventListener("click", executeSearch);
    if (searchInput) {
      searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          executeSearch();
        }
      });
    }

    if (clearChipBtn) {
      clearChipBtn.addEventListener("click", function () {
        if (searchInput) {
          searchInput.value = "";
          searchInput.focus();
        }
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        loadStock(state.currentTicker, true);
      });
    }

    if (errorDismissBtn) {
      errorDismissBtn.addEventListener("click", function () {
        const banner = document.getElementById("errorBanner");
        if (banner) banner.style.display = "none";
      });
    }
  }

  // Initialisierung beim DOM-Ready
  document.addEventListener("DOMContentLoaded", function () {
    parseUrlParams();
    initEvents();
    switchTab(state.activeTab);
    loadStock(state.currentTicker, false);
  });

  // Globaler Export für View-Module
  window.StockNav = {
    getState: function () {
      return state;
    },
    switchTab: switchTab,
    loadStock: loadStock
  };
})();

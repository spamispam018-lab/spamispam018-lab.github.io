/**
 * Logik zur Bereitstellung und Aufbereitung der Aktiendaten für die Detailansichten
 */
const StockDataHandler = (function () {
  let currentSymbol = null;
  let currentStockDetails = null;
  let isFallback = false;

  function setSymbol(symbol) {
    if (symbol) {
      currentSymbol = symbol.toUpperCase().trim();
    }
  }

  function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }

  function getSymbolFromHash() {
    const hash = window.location.hash || "";
    // Unterstützt Formate wie #stock/AAPL oder #/stock/AAPL
    const match = hash.match(/#\/?stock\/([A-Za-z0-9._-]+)/);
    return match ? match[1].toUpperCase() : null;
  }

  function getCurrentSymbol() {
    if (currentSymbol) return currentSymbol;
    const hashSymbol = getSymbolFromHash();
    if (hashSymbol) return hashSymbol;
    const paramSymbol = getQueryParam("symbol");
    if (paramSymbol) return paramSymbol.toUpperCase().trim();
    return "AAPL";
  }

  function resetState() {
    currentStockDetails = null;
    isFallback = false;
  }

  function formatCurrency(val, currency = "EUR") {
    if (val === null || val === undefined || isNaN(val)) return "-";
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency,
      maximumFractionDigits: 2
    }).format(val);
  }

  function formatNumber(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(val);
  }

  function formatLargeNumber(val, currency = "€") {
    if (val === null || val === undefined || isNaN(val)) return "-";
    const num = Number(val);
    const sign = num < 0 ? "-" : "";
    const absNum = Math.abs(num);

    if (absNum >= 1e12) {
      return `${sign}${(absNum / 1e12).toFixed(2).replace(".", ",")} Bio. ${currency}`;
    }
    if (absNum >= 1e9) {
      return `${sign}${(absNum / 1e9).toFixed(2).replace(".", ",")} Mrd. ${currency}`;
    }
    if (absNum >= 1e6) {
      return `${sign}${(absNum / 1e6).toFixed(2).replace(".", ",")} Mio. ${currency}`;
    }
    return `${sign}${formatNumber(absNum, 0)} ${currency}`;
  }

  function formatPercent(val) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    const sign = Number(val) > 0 ? "+" : "";
    return `${sign}${formatNumber(val, 2)} %`;
  }

  async function initCurrentStock(explicitSymbol) {
    if (explicitSymbol) {
      setSymbol(explicitSymbol);
    }
    const symbol = getCurrentSymbol();
    resetState();

    if (window.DataService) {
      // 1. Versuche volles Detail-JSON über den DataService zu laden
      let details = await window.DataService.loadStockDetails(symbol);

      // Prüfe, ob es sich um echte Detail-Daten oder nur Basisdaten handelt
      if (!details || (!details.history && !details.financials)) {
        isFallback = true;
        // Basisdaten aus stocks.json als Fallback ermitteln
        const allStocks = window.DataService.getAllStocks() || [];
        const baseStock = allStocks.find(s => s.symbol.toUpperCase() === symbol.toUpperCase());

        if (baseStock) {
          details = {
            symbol: baseStock.symbol,
            fullTicker: baseStock.fullTicker || baseStock.symbol,
            name: baseStock.name || baseStock.symbol,
            price: baseStock.price || 0.0,
            changePercent: baseStock.change !== undefined ? baseStock.change : 0.0,
            currency: baseStock.currency || "EUR",
            dividendYield: baseStock.dividendYield || 0.0,
            marketCap: baseStock.marketCap || 0,
            sector: baseStock.sector || "N/A",
            valuation: {
              marketCap: baseStock.marketCap || 0,
              trailingPE: baseStock.pe || null,
              forwardPE: null,
              pegRatio: null,
              priceToBook: null
            },
            history: [],
            financials: {
              incomeStatement: {},
              balanceSheet: {},
              cashflow: {}
            },
            recommendations: []
          };
        }
      }

      currentStockDetails = details;
    }

    return currentStockDetails;
  }

  function getCurrentStock() {
    return currentStockDetails;
  }

  function getIsFallback() {
    return isFallback;
  }

  return {
    setSymbol,
    getCurrentSymbol,
    resetState,
    getQueryParam,
    formatCurrency,
    formatNumber,
    formatLargeNumber,
    formatPercent,
    initCurrentStock,
    getCurrentStock,
    getIsFallback
  };
})();

// Global verfügbar machen
window.StockDataHandler = StockDataHandler;

/**
 * Logik zur Bereitstellung und Aufbereitung der Aktiendaten für die Detailansichten
 */
const StockDataHandler = (function () {
  let currentStockDetails = null;

  function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }

  function formatCurrency(val, currency = "USD") {
    if (val === null || val === undefined || isNaN(val)) return "N/A";
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency,
      maximumFractionDigits: 2
    }).format(val);
  }

  function formatNumber(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(val)) return "N/A";
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(val);
  }

  function formatLargeNumber(val, currency = "$") {
    if (val === null || val === undefined || isNaN(val)) return "N/A";
    const num = Number(val);
    if (Math.abs(num) >= 1e12) {
      return `${(num / 1e12).toFixed(2).replace(".", ",")} Bio. ${currency}`;
    }
    if (Math.abs(num) >= 1e9) {
      return `${(num / 1e9).toFixed(2).replace(".", ",")} Mrd. ${currency}`;
    }
    if (Math.abs(num) >= 1e6) {
      return `${(num / 1e6).toFixed(2).replace(".", ",")} Mio. ${currency}`;
    }
    return formatNumber(num, 0);
  }

  function formatPercent(val) {
    if (val === null || val === undefined || isNaN(val)) return "N/A";
    const sign = val > 0 ? "+" : "";
    return `${sign}${formatNumber(val, 2)} %`;
  }

  async function initCurrentStock() {
    const symbol = getQueryParam("symbol") || "AAPL";
    if (window.DataService) {
      currentStockDetails = await window.DataService.loadStockDetails(symbol);
    }
    return currentStockDetails;
  }

  function getCurrentStock() {
    return currentStockDetails;
  }

  return {
    getQueryParam,
    formatCurrency,
    formatNumber,
    formatLargeNumber,
    formatPercent,
    initCurrentStock,
    getCurrentStock
  };
})();

// Global verfügbar machen
window.StockDataHandler = StockDataHandler;

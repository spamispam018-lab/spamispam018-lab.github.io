/**
 * Data Service für das Laden und Verwalten von Aktiendaten
 */
const DataService = (function () {
  let cachedStocks = null;
  let cachedDetails = new Map();

  function getBaseDataPath() {
    const path = window.location.pathname;
    if (path.includes("/Views/") || path.includes("/views/")) {
      return "../data/";
    }
    return "data/";
  }

  async function loadStocks() {
    if (cachedStocks && cachedStocks.length > 0) {
      return cachedStocks;
    }

    const dataPath = `${getBaseDataPath()}stocks.json`;

    try {
      const response = await fetch(dataPath);
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      const json = await response.json();
      if (json && Array.isArray(json.stocks) && json.stocks.length > 0) {
        cachedStocks = json.stocks;
        return cachedStocks;
      }
      throw new Error("Format in stocks.json ungültig oder leer.");
    } catch (err) {
      console.warn(`Konnte ${dataPath} nicht laden. Verwende Fallback-Daten. Grund:`, err);
      if (typeof FALLBACK_STOCKS !== "undefined" && Array.isArray(FALLBACK_STOCKS)) {
        cachedStocks = FALLBACK_STOCKS;
        return cachedStocks;
      }
      return [];
    }
  }

  async function loadStockDetails(symbol) {
    if (!symbol) return null;
    const upperSymbol = symbol.toUpperCase();

    if (cachedDetails.has(upperSymbol)) {
      return cachedDetails.get(upperSymbol);
    }

    const detailPath = `${getBaseDataPath()}details/${upperSymbol}.json`;

    try {
      const response = await fetch(detailPath);
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      const details = await response.json();
      cachedDetails.set(upperSymbol, details);
      return details;
    } catch (err) {
      console.warn(`Detaildaten für ${upperSymbol} konnten nicht geladen werden:`, err);
      
      // Fallback: Grunddaten aus der Übersicht heranziehen
      const stocks = await loadStocks();
      const basic = stocks.find(s => s.symbol.toUpperCase() === upperSymbol);
      if (basic) {
        const minimalFallback = {
          symbol: basic.symbol,
          name: basic.name,
          sector: basic.sector,
          industry: basic.industry,
          price: basic.price,
          change: basic.change,
          changePercent: basic.changePercent,
          valuation: {
            marketCap: basic.marketCap,
            trailingPE: basic.peRatio,
            forwardPE: basic.forwardPE
          },
          financials: { incomeStatement: {}, balanceSheet: {}, cashflow: {} },
          recommendations: [],
          history: []
        };
        cachedDetails.set(upperSymbol, minimalFallback);
        return minimalFallback;
      }
      return null;
    }
  }

  function getStockBySymbolSync(symbol) {
    if (!cachedStocks || !symbol) return null;
    return cachedStocks.find(s => s.symbol.toUpperCase() === symbol.toUpperCase()) || null;
  }

  return {
    loadStocks,
    loadStockDetails,
    getStockBySymbolSync
  };
})();

// Global verfügbar machen
window.DataService = DataService;

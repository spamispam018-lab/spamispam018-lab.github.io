/**
 * Zentraler Datenservice zum Laden von Bestandsdaten und Fallbacks
 */
const DataService = (function () {
  let cachedStocks = null;

  // Ermittelt den relativen Pfad zum /data/-Ordner abhängig von der URL
  function getDataBasePath() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("/views/")) {
      return "../data/";
    }
    return "data/";
  }

  async function loadStocks() {
    if (cachedStocks && cachedStocks.length > 0) {
      return cachedStocks;
    }

    const basePath = getDataBasePath();
    const possibleUrls = [
      `${basePath}stocks.json`,
      `${basePath}stocks-summary.json`,
      `${basePath}stocks_overview.json`
    ];

    for (const url of possibleUrls) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          const list = Array.isArray(data) ? data : (data.stocks || data.data || []);
          if (list.length > 0) {
            cachedStocks = list;
            return cachedStocks;
          }
        }
      } catch (e) {
        // Nächsten Pfad versuchen
      }
    }

    // Fallback nutzen, falls Fetch fehlschlägt oder Dateien noch nicht generiert wurden
    if (typeof window.FALLBACK_STOCKS !== "undefined" && Array.isArray(window.FALLBACK_STOCKS)) {
      console.warn("Nutze Offline-/Fallback-Aktienbestand.");
      cachedStocks = window.FALLBACK_STOCKS;
      return cachedStocks;
    }

    return [];
  }

  async function loadStockDetails(symbol) {
    if (!symbol) return null;
    const cleanSym = symbol.toUpperCase();
    const basePath = getDataBasePath();

    try {
      const response = await fetch(`${basePath}details/${cleanSym}.json`);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      // Weiter zum Fallback
    }

    // Detail-Fallback aus dem Hauptdatenbestand rekonstruieren
    const all = await loadStocks();
    const found = all.find(s => s.symbol && s.symbol.toUpperCase() === cleanSym);
    return found || null;
  }

  return {
    loadStocks,
    loadStockDetails,
    getDataBasePath
  };
})();

window.DataService = DataService;

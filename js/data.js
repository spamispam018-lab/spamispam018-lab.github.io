/**
 * Zentraler Datenservice für die Datenabfrage mit Pfaderkennung
 */
const DataService = (function () {
  let cachedStocks = null;

  // Bestimmt den relativen Datenpfad anhand des aktuellen Pfads
  function getDataBasePath() {
    const pathname = window.location.pathname;
    // Wenn wir uns im Unterordner Views befinden
    if (pathname.includes("/Views/") || pathname.includes("/views/")) {
      return "../data/";
    }
    return "data/";
  }

  async function loadStocks() {
    if (cachedStocks && cachedStocks.length > 0) {
      return cachedStocks;
    }

    const basePath = getDataBasePath();
    const urlsToTry = [
      `${basePath}stocks.json`,
      `${basePath}stocks-summary.json`,
      `${basePath}stocks_overview.json`
    ];

    for (const url of urlsToTry) {
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
      } catch (err) {
        // Nächste URL probieren
      }
    }

    // Wenn GitHub Actions noch keine Daten generiert hat: Fallback nutzen
    if (typeof window.FALLBACK_STOCKS !== "undefined" && Array.isArray(window.FALLBACK_STOCKS)) {
      console.warn("Nutze Fallback-Aktienbestand.");
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
      // Fallback
    }

    const all = await loadStocks();
    return all.find(s => s.symbol && s.symbol.toUpperCase() === cleanSym) || null;
  }

  return {
    loadStocks,
    loadStockDetails,
    getDataBasePath
  };
})();

window.DataService = DataService;

// js/stock-data.js
// Daten-Layer für die Aktien-Detailansicht.
// Unterstützt IndexedDB-Caching mit automatischem Fallback auf localStorage und GitHub-Raw-Fetch.

(function () {
  "use strict";

  const DB_NAME = "StockScreenerDB";
  const DB_VERSION = 1;
  const STORE_NAME = "stock_details";
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Stunden Gültigkeit

  // GitHub Raw Basis-URL für den Datenabruf (funktioniert auch unter file://)
  const RAW_BASE_URL = "https://raw.githubusercontent.com/spamispam018-lab/spamispam018-lab.github.io/main/data/stocks/";

  let dbInstance = null;
  const memoryCache = {};

  // IndexedDB Initialisierung
  function openDatabase() {
    if (dbInstance) {
      return Promise.resolve(dbInstance);
    }
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn("IndexedDB nicht verfügbar, verwende localStorage/Memory-Fallback.");
        return resolve(null);
      }
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = function (event) {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "ticker" });
          }
        };
        request.onsuccess = function (event) {
          dbInstance = event.target.result;
          resolve(dbInstance);
        };
        request.onerror = function () {
          console.warn("Fehler beim Öffnen von IndexedDB.");
          resolve(null);
        };
      } catch (err) {
        console.warn("IndexedDB Exception:", err);
        resolve(null);
      }
    });
  }

  // Aus IndexedDB lesen
  function getFromIndexedDB(ticker) {
    return openDatabase().then((db) => {
      if (!db) return null;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction([STORE_NAME], "readonly");
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(ticker.toUpperCase());
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    });
  }

  // In IndexedDB speichern
  function saveToIndexedDB(record) {
    return openDatabase().then((db) => {
      if (!db) return false;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction([STORE_NAME], "readwrite");
          const store = tx.objectStore(STORE_NAME);
          store.put(record);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    });
  }

  // LocalStorage Fallback-Helfer
  function getFromLocalStorage(ticker) {
    try {
      const item = localStorage.getItem("stock_" + ticker.toUpperCase());
      return item ? JSON.parse(item) : null;
    } catch (e) {
      return null;
    }
  }

  function saveToLocalStorage(ticker, record) {
    try {
      localStorage.setItem("stock_" + ticker.toUpperCase(), JSON.stringify(record));
    } catch (e) {
      // QuotaExceeded oder deaktivierter Speicher
    }
  }

  window.StockData = {
    // Liefert die Rohdaten eines Tickers (Memory -> IndexedDB -> LocalStorage -> Network)
    fetchStockDetail: function (ticker, forceRefresh) {
      const sym = (ticker || "").trim().toUpperCase();
      if (!sym) {
        return Promise.reject(new Error("Kein Ticker angegeben."));
      }

      const now = Date.now();

      // 1. Schneller Memory Cache
      if (!forceRefresh && memoryCache[sym]) {
        const item = memoryCache[sym];
        if (now - item._cachedAt < CACHE_TTL_MS) {
          return Promise.resolve(item.data);
        }
      }

      // 2. Persistenter Cache (IndexedDB / LocalStorage)
      if (!forceRefresh) {
        return getFromIndexedDB(sym).then((cached) => {
          if (!cached) {
            cached = getFromLocalStorage(sym);
          }
          if (cached && cached._cachedAt && now - cached._cachedAt < CACHE_TTL_MS) {
            memoryCache[sym] = cached;
            return cached.data;
          }
          return this.fetchFromNetwork(sym);
        });
      }

      return this.fetchFromNetwork(sym);
    },

    // Netzwerk-Abruf via Raw GitHub URL mit Cache-Buster bei forceRefresh
    fetchFromNetwork: function (ticker) {
      const sym = ticker.toUpperCase();
      const url = RAW_BASE_URL + encodeURIComponent(sym) + ".json?t=" + Date.now();

      return fetch(url, { method: "GET" })
        .then((res) => {
          if (!res.ok) {
            throw new Error("Aktie '" + sym + "' nicht gefunden oder Netzwerkfehler (HTTP " + res.status + ").");
          }
          return res.json();
        })
        .then((json) => {
          const cacheRecord = {
            ticker: sym,
            _cachedAt: Date.now(),
            data: json
          };

          memoryCache[sym] = cacheRecord;
          saveToIndexedDB(cacheRecord);
          saveToLocalStorage(sym, cacheRecord);

          return json;
        })
        .catch((err) => {
          // Falls Netzwerk offline ist: Versuche abgelaufenen Cache trotzdem zurückzugeben
          return getFromIndexedDB(sym).then((cached) => {
            if (!cached) cached = getFromLocalStorage(sym);
            if (cached && cached.data) {
              console.warn("Offline-Fallback für", sym);
              return cached.data;
            }
            throw err;
          });
        });
    },

    // Cache für einen oder alle Ticker leeren
    clearCache: function (ticker) {
      if (ticker) {
        const sym = ticker.toUpperCase();
        delete memoryCache[sym];
        try {
          localStorage.removeItem("stock_" + sym);
        } catch (e) {}
        return openDatabase().then((db) => {
          if (!db) return;
          try {
            const tx = db.transaction([STORE_NAME], "readwrite");
            tx.objectStore(STORE_NAME).delete(sym);
          } catch (e) {}
        });
      } else {
        Object.keys(memoryCache).forEach((k) => delete memoryCache[k]);
        try {
          Object.keys(localStorage).forEach((k) => {
            if (k.indexOf("stock_") === 0) localStorage.removeItem(k);
          });
        } catch (e) {}
        return openDatabase().then((db) => {
          if (!db) return;
          try {
            const tx = db.transaction([STORE_NAME], "readwrite");
            tx.objectStore(STORE_NAME).clear();
          } catch (e) {}
        });
      }
    }
  };
})();

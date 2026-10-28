/**
 * Daten-Layer: Verwaltet das Laden, Cachen und Bereitstellen der Aktiendaten.
 * 
 * Strategie:
 * 1. Prüft localStorage auf bestehende Daten.
 * 2. Versucht beim Start, frische Daten von raw.githubusercontent.com zu laden.
 * 3. Fällt bei Verbindungsabbruch oder Erststart transparent auf window.STOCK_DATA zurück.
 */

window.App = window.App || {};

(function(App) {
  'use strict';

  var STORAGE_KEY = 'stockscreener_data_cache';
  var GITHUB_REPO_PATH = 'spamispam018-lab/spamispam018-lab.github.io/main/data/stocks.json';

  var DataService = {
    currentData: null,

    /**
     * Konfiguriert das Ziel-Repository für den Live-Abruf
     */
    setRepoPath: function(userRepoBranchPath) {
      if (userRepoBranchPath) {
        GITHUB_REPO_PATH = userRepoBranchPath;
      }
    },

    /**
     * Lädt die Daten mit mehrstufigem Fallback-Verfahren
     * @returns {Promise<Object>}
     */
    loadStocks: function() {
      var self = this;

      return new Promise(function(resolve) {
        // 1. Zunächst gecachte Daten aus localStorage prüfen
        var cachedRaw = null;
        try {
          cachedRaw = localStorage.getItem(STORAGE_KEY);
        } catch (e) {
          console.warn('localStorage Zugriff fehlgeschlagen:', e);
        }

        if (cachedRaw) {
          try {
            var parsed = JSON.parse(cachedRaw);
            if (parsed && parsed.stocks && parsed.stocks.length > 0) {
              self.currentData = parsed;
            }
          } catch (e) {
            console.error('Cache-Parsing fehlgeschlagen:', e);
          }
        }

        // 2. Falls noch keine Daten vorhanden, window.STOCK_DATA (Fallback-Datei) nutzen
        if (!self.currentData && window.STOCK_DATA && window.STOCK_DATA.stocks) {
          self.currentData = window.STOCK_DATA;
        }

        // 3. Online-Abruf via GitHub Raw (unterstützt CORS auch unter file:// und Pages)
        var onlineUrl = 'https://raw.githubusercontent.com/' + GITHUB_REPO_PATH + '?t=' + Date.now();

        fetch(onlineUrl)
          .then(function(response) {
            if (!response.ok) {
              throw new Error('Netzwerk-Antwort war nicht OK: ' + response.status);
            }
            return response.json();
          })
          .then(function(remoteData) {
            if (remoteData && remoteData.stocks && remoteData.stocks.length > 0) {
              self.currentData = remoteData;
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteData));
              } catch (e) {
                console.warn('Speichern in localStorage fehlgeschlagen:', e);
              }
              resolve(self.currentData);
            } else {
              resolve(self.getSafeData());
            }
          })
          .catch(function(err) {
            console.info('Offline-Modus aktiv oder GitHub nicht erreichbar:', err.message);
            resolve(self.getSafeData());
          });
      });
    },

    /**
     * Gibt verlässlich ein Datenobjekt zurück
     */
    getSafeData: function() {
      if (this.currentData && this.currentData.stocks) {
        return this.currentData;
      }
      if (window.STOCK_DATA && window.STOCK_DATA.stocks) {
        this.currentData = window.STOCK_DATA;
        return this.currentData;
      }
      return { lastUpdated: new Date().toISOString(), currency: 'EUR', stocks: [] };
    },

    /**
     * Sucht eine Aktie anhand ihres Tickers
     */
    getStockByTicker: function(ticker) {
      var data = this.getSafeData();
      var list = data.stocks || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].ticker === ticker) {
          return list[i];
        }
      }
      return null;
    },

    /**
     * Liefert alle einzigartigen Branchen/Sektoren für die Filterauswahl
     */
    getSectors: function() {
      var data = this.getSafeData();
      var map = {};
      var sectors = [];
      (data.stocks || []).forEach(function(s) {
        if (s.sector && !map[s.sector]) {
          map[s.sector] = true;
          sectors.push(s.sector);
        }
      });
      return sectors.sort();
    },

    /**
     * Liefert alle Länder für die Filterauswahl
     */
    getCountries: function() {
      var data = this.getSafeData();
      var map = {};
      var countries = [];
      (data.stocks || []).forEach(function(s) {
        if (s.country && !map[s.country]) {
          map[s.country] = true;
          countries.push(s.country);
        }
      });
      return countries.sort();
    }
  };

  App.DataService = DataService;
})(window.App);

/**
 * Filter- und Sortier-Engine: Führt Textsuche, Bereichsfilter (KGV, Dividende,
 * Marktkapitalisierung, 52W-Performance) und Sortierungen im Arbeitsspeicher aus.
 */

window.App = window.App || {};

(function(App) {
  'use strict';

  var FilterEngine = {
    // Aktive Filterzustände mit Standardwerten
    state: {
      searchQuery: '',
      preset: 'all',          // 'all', 'dividend', 'value', 'growth', 'gainers', 'losers'
      sector: '',             // '' = Alle Branchen
      country: '',            // '' = Alle Länder
      minMarketCap: 0,        // in Mrd. EUR (0 = keine Grenze)
      maxPe: 100,             // KGV Obergrenze (100 = keine Grenze)
      minDividendYield: 0,    // Mindest-Dividendenrendite in %
      minPerf52w: -100,       // Mindest-Performance 52 Wochen in %
      sortBy: 'marketCap_desc' // 'marketCap_desc', 'change_desc', 'change_asc', 'pe_asc', 'div_desc', 'perf52w_desc', 'name_asc'
    },

    /**
     * Setzt alle Kriterien auf den Auslieferungszustand zurück
     */
    reset: function() {
      this.state.searchQuery = '';
      this.state.preset = 'all';
      this.state.sector = '';
      this.state.country = '';
      this.state.minMarketCap = 0;
      this.state.maxPe = 100;
      this.state.minDividendYield = 0;
      this.state.minPerf52w = -100;
      this.state.sortBy = 'marketCap_desc';
    },

    /**
     * Wendet ein Schnell-Preset auf die Filter an
     * @param {string} presetName
     */
    applyPreset: function(presetName) {
      this.reset();
      this.state.preset = presetName;

      switch (presetName) {
        case 'dividend':
          this.state.minDividendYield = 3.0; // mind. 3 % Dividendenrendite
          this.state.sortBy = 'div_desc';
          break;
        case 'value':
          this.state.maxPe = 18;            // moderates KGV
          this.state.minDividendYield = 1.5;
          this.state.sortBy = 'pe_asc';
          break;
        case 'growth':
          this.state.minPerf52w = 20.0;     // starke Dynamik
          this.state.sortBy = 'perf52w_desc';
          break;
        case 'gainers':
          this.state.sortBy = 'change_desc'; // Tagesgewinner
          break;
        case 'losers':
          this.state.sortBy = 'change_asc';  // Tagesverlierer
          break;
        default:
          this.state.preset = 'all';
          this.state.sortBy = 'marketCap_desc';
          break;
      }
    },

    /**
     * Filtert und sortiert das übergebene Aktienarray
     * @param {Array<Object>} stocks
     * @returns {Array<Object>}
     */
    process: function(stocks) {
      if (!Array.isArray(stocks)) return [];

      var self = this;
      var query = (this.state.searchQuery || '').trim().toLowerCase();

      var filtered = stocks.filter(function(stock) {
        // 1. Textsuche nach Name oder Ticker
        if (query.length > 0) {
          var nameMatch = (stock.name || '').toLowerCase().indexOf(query) !== -1;
          var tickerMatch = (stock.ticker || '').toLowerCase().indexOf(query) !== -1;
          if (!nameMatch && !tickerMatch) {
            return false;
          }
        }

        // 2. Branche / Sektor
        if (self.state.sector && self.state.sector.length > 0) {
          if (stock.sector !== self.state.sector) {
            return false;
          }
        }

        // 3. Land / Region
        if (self.state.country && self.state.country.length > 0) {
          if (stock.country !== self.state.country) {
            return false;
          }
        }

        // 4. Marktkapitalisierung (Filterwert in Milliarden EUR umrechnen)
        if (self.state.minMarketCap > 0) {
          var minCapEur = self.state.minMarketCap * 1000000000;
          if ((stock.marketCap || 0) < minCapEur) {
            return false;
          }
        }

        // 5. KGV (Ausschluss von extrem hohen KGVs oder negativen KGVs, falls gefiltert)
        if (self.state.maxPe < 100) {
          var pe = stock.peRatio || 0;
          if (pe <= 0 || pe > self.state.maxPe) {
            return false;
          }
        }

        // 6. Dividendenrendite
        if (self.state.minDividendYield > 0) {
          if ((stock.dividendYield || 0) < self.state.minDividendYield) {
            return false;
          }
        }

        // 7. 52-Wochen Performance
        if (self.state.minPerf52w > -100) {
          if ((stock.perf52w || 0) < self.state.minPerf52w) {
            return false;
          }
        }

        return true;
      });

      // Sortierung anwenden
      filtered.sort(function(a, b) {
        switch (self.state.sortBy) {
          case 'change_desc':
            return (b.changePercent || 0) - (a.changePercent || 0);
          case 'change_asc':
            return (a.changePercent || 0) - (b.changePercent || 0);
          case 'pe_asc':
            // Aktien mit gültigem KGV vorreihen
            var peA = (a.peRatio && a.peRatio > 0) ? a.peRatio : 9999;
            var peB = (b.peRatio && b.peRatio > 0) ? b.peRatio : 9999;
            return peA - peB;
          case 'div_desc':
            return (b.dividendYield || 0) - (a.dividendYield || 0);
          case 'perf52w_desc':
            return (b.perf52w || 0) - (a.perf52w || 0);
          case 'name_asc':
            return (a.name || '').localeCompare(b.name || '');
          case 'marketCap_desc':
          default:
            return (b.marketCap || 0) - (a.marketCap || 0);
        }
      });

      return filtered;
    }
  };

  App.FilterEngine = FilterEngine;
})(window.App);

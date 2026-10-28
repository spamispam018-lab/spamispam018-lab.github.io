// js/filters.js - Filter- und Sortierlogik für den Screener

const FilterService = {
  rawStocks: [],
  searchQuery: '',
  activeFilterChip: null, // z. B. 'dividend', 'value', 'growth'
  currentSort: 'marketCap_desc',

  init(stocks) {
    this.rawStocks = Array.isArray(stocks) ? stocks : [];
  },

  setSearchQuery(query) {
    this.searchQuery = (query || '').trim().toLowerCase();
  },

  setSort(sortValue) {
    this.currentSort = sortValue || 'marketCap_desc';
  },

  toggleFilterChip(chipName) {
    if (this.activeFilterChip === chipName) {
      this.activeFilterChip = null;
    } else {
      this.activeFilterChip = chipName;
    }
  },

  getFilteredStocks() {
    let result = [...this.rawStocks];

    // 1. Textsuche nach Ticker oder Unternehmensname
    if (this.searchQuery) {
      result = result.filter(stock => {
        const symbol = (stock.symbol || '').toLowerCase();
        const name = (stock.name || '').toLowerCase();
        return symbol.includes(this.searchQuery) || name.includes(this.searchQuery);
      });
    }

    // 2. Chip-Filter anwenden
    if (this.activeFilterChip === 'value') {
      result = result.filter(stock => stock.pe && stock.pe > 0 && stock.pe < 18);
    } else if (this.activeFilterChip === 'dividend') {
      result = result.filter(stock => stock.dividendYield && stock.dividendYield >= 2.5);
    } else if (this.activeFilterChip === 'growth') {
      result = result.filter(stock => (stock.revenueGrowth && stock.revenueGrowth > 10) || (stock.change && stock.change > 0));
    }

    // 3. Sortierung anwenden
    result.sort((a, b) => {
      switch (this.currentSort) {
        case 'marketCap_desc':
          return (b.marketCap || 0) - (a.marketCap || 0);
        case 'marketCap_asc':
          return (a.marketCap || 0) - (b.marketCap || 0);
        case 'pe_asc':
          return (a.pe || 9999) - (b.pe || 9999);
        case 'pe_desc':
          return (b.pe || 0) - (a.pe || 0);
        case 'change_desc':
          return (b.change || 0) - (a.change || 0);
        case 'change_asc':
          return (a.change || 0) - (b.change || 0);
        case 'dividend_desc':
          return (b.dividendYield || 0) - (a.dividendYield || 0);
        default:
          return 0;
      }
    });

    return result;
  }
};

window.FilterService = FilterService;

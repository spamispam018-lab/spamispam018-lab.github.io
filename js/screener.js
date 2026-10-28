/**
 * js/screener.js
 * Verwaltet den Aktien-Screener:
 * - Marktübersicht Hero-Banner mit Kennzahlen
 * - Volltextsuche über Name und Ticker (Groß-/Kleinschreibung tolerant)
 * - Robuste Sortierung ohne Ausblenden von Titeln mit fehlenden Daten
 * - Filter-Presets & Detail-Navigation
 */

window.App = window.App || {};

window.App.Screener = (function () {
  'use strict';

  var allStocks = [];
  var filteredStocks = [];

  var currentSearchQuery = '';
  var currentSort = 'marketCap_desc';
  var currentPreset = 'all';

  /**
   * Initialisiert und rendert den Screener.
   */
  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;

    // Filter-Icon im Header einblenden
    var headerFilterBtn = document.getElementById('btn-header-filter');
    if (headerFilterBtn) {
      headerFilterBtn.style.display = 'inline-flex';
    }

    // HTML-Grundgerüst einfügen
    container.innerHTML = getTemplateHtml();

    // Daten laden
    window.App.Data.getUniverse()
      .then(function (stocks) {
        allStocks = stocks || [];
        updateHeroBanner(allStocks);
        applyFiltersAndRender();
        bindEvents();
      })
      .catch(function (err) {
        var listContainer = document.getElementById('screener-list-container');
        if (listContainer) {
          listContainer.innerHTML = '<div class="state-box"><p>Fehler beim Laden: ' + err.message + '</p></div>';
        }
      });
  }

  /**
   * Aktualisiert die Kennzahlen im oberen violetten Hero-Banner.
   */
  function updateHeroBanner(stocks) {
    var countEl = document.getElementById('screener-hero-count');
    var winnerEl = document.getElementById('screener-hero-winner');
    var peEl = document.getElementById('screener-hero-pe');
    var yieldEl = document.getElementById('screener-hero-yield');

    if (!stocks || stocks.length === 0) return;

    if (countEl) countEl.textContent = stocks.length + ' Titel';

    // Top-Gewinner ermitteln
    var winner = stocks.reduce(function (max, item) {
      return (item.changePercent || 0) > (max.changePercent || -999) ? item : max;
    }, stocks[0]);

    if (winnerEl && winner) {
      var sign = (winner.changePercent || 0) >= 0 ? '+' : '';
      winnerEl.innerHTML = (winner.ticker || '—') + '<br><span style="font-size:0.75rem;">(' + sign + window.App.Format.number(winner.changePercent, 2) + ' %)</span>';
    }

    // Durchschnitts-KGV berechnen (nur valide Werte > 0 und < 150)
    var peValues = stocks.filter(function (s) { return s.pe && s.pe > 0 && s.pe < 150; });
    var avgPe = peValues.length > 0
      ? peValues.reduce(function (sum, s) { return sum + s.pe; }, 0) / peValues.length
      : 0;
    if (peEl) peEl.textContent = avgPe > 0 ? window.App.Format.number(avgPe, 1) : '—';

    // Durchschnitts-Dividendenrendite berechnen
    var divValues = stocks.filter(function (s) { return s.dividendYield && s.dividendYield > 0 && s.dividendYield < 25; });
    var avgYield = divValues.length > 0
      ? (divValues.reduce(function (sum, s) { return sum + s.dividendYield; }, 0) / divValues.length)
      : 0;
    if (yieldEl) yieldEl.textContent = avgYield > 0 ? window.App.Format.number(avgYield, 1) + ' %' : '—';
  }

  /**
   * Wendet Suche, Presets und Sortierung an, ohne Aktien zu verwerfen.
   */
  function applyFiltersAndRender() {
    var list = allStocks.slice();

    // 1. Volltextsuche: Prüft Ticker, Name und Branche
    if (currentSearchQuery) {
      var q = currentSearchQuery.toLowerCase().trim();
      list = list.filter(function (item) {
        var tick = (item.ticker || '').toLowerCase();
        var name = (item.name || '').toLowerCase();
        var sector = (item.sector || '').toLowerCase();
        return tick.indexOf(q) !== -1 || name.indexOf(q) !== -1 || sector.indexOf(q) !== -1;
      });
    }

    // 2. Preset Filter
    if (currentPreset === 'high_dividend') {
      list = list.filter(function (s) { return (s.dividendYield || 0) >= 3; });
    } else if (currentPreset === 'value') {
      list = list.filter(function (s) { return s.pe && s.pe > 0 && s.pe <= 18; });
    } else if (currentPreset === 'undervalued') {
      list = list.filter(isUndervalued);
    } else if (currentPreset === 'turnaround') {
      list = list.filter(isTurnaround);
    } else if (currentPreset === 'growth') {
      list = list.filter(function (s) { return (s.revGrowth || 0) >= 0.10; });
    } else if (currentPreset === 'top_performer') {
      list = list.filter(function (s) { return (s.perf52w || 0) >= 15; });
    }

    // 3. Sortierung (null/undefined sicher mit 0 als Fallback)
    list.sort(function (a, b) {
      switch (currentSort) {
        case 'marketCap_desc':
          return (b.marketCap || 0) - (a.marketCap || 0);
        case 'change_desc':
          return (b.changePercent || -999) - (a.changePercent || -999);
        case 'change_asc':
          return (a.changePercent || 999) - (b.changePercent || 999);
        case 'pe_asc':
          // Verlust (negatives KGV) zuerst, dann positives KGV aufsteigend, unbekannt zuletzt
          return peRank(a) - peRank(b);
        case 'upside_desc':
          return (b.upside === null || b.upside === undefined ? -999 : b.upside) - (a.upside === null || a.upside === undefined ? -999 : a.upside);
        case 'dividend_desc':
          return (b.dividendYield || 0) - (a.dividendYield || 0);
        case 'perf52w_desc':
          return (b.perf52w || -999) - (a.perf52w || -999);
        case 'name_asc':
          return (a.name || a.ticker || '').localeCompare(b.name || b.ticker || '');
        default:
          return (b.marketCap || 0) - (a.marketCap || 0);
      }
    });

    filteredStocks = list;

    // Trefferzahl aktualisieren
    var resultCountEl = document.getElementById('screener-result-count');
    if (resultCountEl) {
      resultCountEl.textContent = filteredStocks.length + ' Ergebnisse';
    }

    renderStockCards(filteredStocks);
  }

  /**
   * KGV-Sortierung: negatives KGV (Verlust) < positives KGV < unbekannt.
   */
  function isLoss(s) {
    if (s.pe !== null && s.pe !== undefined) return s.pe < 0;
    return s.profitMargins !== null && s.profitMargins !== undefined && s.profitMargins < 0;
  }

  /**
   * "Unterbewertet": günstiges KGV bei solider Qualität und Kurs im unteren Hälfte der 52W-Spanne.
   * Fehlende Werte (PEG, Verschuldung – z. B. bei Banken) schließen eine Aktie nicht aus.
   */
  function isUndervalued(s) {
    if (!(s.pe > 0 && s.pe <= 18)) return false;
    if (s.peg !== null && s.peg !== undefined && !(s.peg > 0 && s.peg <= 1.5)) return false;
    if (!(s.profitMargins > 0)) return false;
    if (s.debtToEquity !== null && s.debtToEquity !== undefined && s.debtToEquity > 150) return false;
    if ((s.revGrowth || 0) < 0) return false;
    if (s.rangePos === null || s.rangePos === undefined || s.rangePos > 50) return false;
    return true;
  }

  /**
   * "Turnaround": aktuell Verlust (negatives/fehlendes KGV), aber niedriges Forward-KGV,
   * moderate Verschuldung und Kurs im unteren Bereich der 52W-Spanne. Hohes Risiko!
   */
  function isTurnaround(s) {
    if (!isLoss(s)) return false;
    if (!(s.forwardPe > 0 && s.forwardPe <= 12)) return false;
    if (s.debtToEquity !== null && s.debtToEquity !== undefined && s.debtToEquity > 150) return false;
    if (s.rangePos === null || s.rangePos === undefined || s.rangePos > 50) return false;
    return true;
  }

  function peRank(s) {
    if (isLoss(s)) {
      var depth = (s.pe < 0) ? s.pe : (s.profitMargins || 0);
      return -1e6 + depth;
    }
    if (s.pe && s.pe > 0) return s.pe;
    return 1e9;
  }

  /**
   * Rendert die Liste der Aktienkarten.
   */
  function renderStockCards(list) {
    var container = document.getElementById('screener-list-container');
    if (!container) return;

    if (list.length === 0) {
      container.innerHTML = '<div class="state-box"><p>Keine passenden Aktien gefunden.</p></div>';
      return;
    }

    var watchlist = window.App.Data.getWatchlist();

    var html = '';
    list.forEach(function (stock) {
      var isStarred = watchlist.indexOf(stock.ticker) !== -1;
      var chgCls = window.App.Format.changeClass(stock.changePercent);
      var sign = (stock.changePercent || 0) >= 0 ? '+' : '';

      html += '' +
        '<div class="stock-card" data-ticker="' + stock.ticker + '">' +
          '<div style="display:flex; align-items:center; flex:1; min-width:0;">' +
            '<button class="star-btn ' + (isStarred ? 'active' : '') + '" data-star-ticker="' + stock.ticker + '">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + (isStarred ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2">' +
                '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>' +
              '</svg>' +
            '</button>' +
            '<div class="stock-info-left" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
              '<div class="stock-name" style="overflow:hidden; text-overflow:ellipsis;">' + (stock.name || stock.ticker) + '</div>' +
              '<div class="stock-tags">' +
                '<span class="ticker-badge">' + stock.ticker + '</span>' +
                '<span class="sector-label">• ' + (stock.sector || 'Markt') + '</span>' +
                ((currentPreset === 'undervalued' || currentPreset === 'turnaround') && stock.upside !== null && stock.upside !== undefined ? '<span class="sector-label" style="color: var(--bullish); font-weight: 700;">• Ziel ' + (stock.upside >= 0 ? '+' : '') + window.App.Format.number(stock.upside, 0) + ' %</span>' : '') +
                (isLoss(stock) ? '<span class="sector-label" style="color: var(--bearish); font-weight: 700;">• KGV neg.</span>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="stock-info-right">' +
            '<div class="stock-price">' + window.App.Format.currency(stock.price, stock.currency || 'EUR') + '</div>' +
            '<div class="badge-pill ' + chgCls + '">' + sign + window.App.Format.number(stock.changePercent, 2) + ' %</div>' +
          '</div>' +
        '</div>';
    });

    container.innerHTML = html;
    bindCardEvents(container);
  }

  /**
   * Bindet Klick-Events für Karten und Favoriten-Sterne.
   */
  function bindCardEvents(container) {
    var cards = container.querySelectorAll('.stock-card');
    cards.forEach(function (card) {
      card.onclick = function (e) {
        if (e.target.closest('.star-btn')) return;
        var ticker = card.getAttribute('data-ticker');
        window.App.Data.setLastTicker(ticker);
        window.App.Router.navigate('/stock/' + ticker + '/overview');
      };
    });

    var starBtns = container.querySelectorAll('[data-star-ticker]');
    starBtns.forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var ticker = btn.getAttribute('data-star-ticker');
        var isNowActive = window.App.Data.toggleWatchlist(ticker);
        btn.classList.toggle('active', isNowActive);
        var svg = btn.querySelector('svg');
        if (svg) svg.setAttribute('fill', isNowActive ? 'currentColor' : 'none');
      };
    });
  }

  /**
   * Bindet Suchfeld, Presets und Sortierung.
   */
  function bindEvents() {
    var searchInput = document.getElementById('screener-search-input');
    if (searchInput) {
      searchInput.oninput = function (e) {
        currentSearchQuery = e.target.value;
        applyFiltersAndRender();
      };
    }

    var sortSelect = document.getElementById('screener-sort-select');
    if (sortSelect) {
      sortSelect.onchange = function (e) {
        currentSort = e.target.value;
        applyFiltersAndRender();
      };
    }

    var presetBtns = document.querySelectorAll('[data-preset]');
    presetBtns.forEach(function (btn) {
      btn.onclick = function () {
        presetBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentPreset = btn.getAttribute('data-preset');
        applyFiltersAndRender();
      };
    });
  }

  /**
   * HTML-Template für die Ansicht.
   */
  function getTemplateHtml() {
    return '' +
      '<div class="view-container">' +
        '<div class="hero-banner">' +
          '<div class="hero-tag">Marktübersicht (Aktienuniversum)</div>' +
          '<div class="hero-count" id="screener-hero-count">Lade Titel...</div>' +
          '<div class="hero-stats-grid">' +
            '<div><div class="hero-stat-label">Top-Gewinner</div><div class="hero-stat-value" id="screener-hero-winner" style="color: #6ee7b7;">—</div></div>' +
            '<div><div class="hero-stat-label">Ø KGV</div><div class="hero-stat-value" id="screener-hero-pe">—</div></div>' +
            '<div><div class="hero-stat-label">Ø Div.-Rendite</div><div class="hero-stat-value" id="screener-hero-yield">—</div></div>' +
          '</div>' +
        '</div>' +

        '<div class="search-bar-wrapper">' +
          '<svg class="search-icon-left" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>' +
          '</svg>' +
          '<input type="text" id="screener-search-input" class="search-input" placeholder="Name oder Ticker suchen..." autocomplete="off">' +
        '</div>' +

        '<div class="horizontal-scroll-row">' +
          '<button class="chip-btn active" data-preset="all">Alle</button>' +
          '<button class="chip-btn" data-preset="high_dividend">💰 Hohe Dividende</button>' +
          '<button class="chip-btn" data-preset="value">💎 Value (KGV &lt; 18)</button>' +
          '<button class="chip-btn" data-preset="undervalued">🔎 Unterbewertet</button>' +
          '<button class="chip-btn" data-preset="turnaround">🔄 Turnaround</button>' +
          '<button class="chip-btn" data-preset="growth">🚀 Growth</button>' +
          '<button class="chip-btn" data-preset="top_performer">📈 Top Performer</button>' +
        '</div>' +

        '<div class="sub-header-bar">' +
          '<span id="screener-result-count">0 Ergebnisse</span>' +
          '<select id="screener-sort-select" class="sort-select">' +
            '<option value="marketCap_desc">Marktkapitalisierung (Höchste)</option>' +
            '<option value="change_desc">Tagesgewinner (%)</option>' +
            '<option value="change_asc">Tagesverlierer (%)</option>' +
            '<option value="name_asc">Name (A–Z)</option>' +
            '<option value="pe_asc">KGV (Niedrigste)</option>' +
            '<option value="upside_desc">Kursziel-Potenzial (Höchstes)</option>' +
            '<option value="dividend_desc">Dividendenrendite (Höchste)</option>' +
            '<option value="perf52w_desc">52W-Performance (Beste)</option>' +
          '</select>' +
        '</div>' +

        '<div id="screener-list-container">' +
          '<div class="state-box"><div class="spinner"></div><p>Lade Aktien...</p></div>' +
        '</div>' +
      '</div>';
  }

  return {
    initView: initView
  };
})();

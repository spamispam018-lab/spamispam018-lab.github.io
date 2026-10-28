/**
 * js/screener.js
 * Logik für den Aktien-Screener:
 * - Textsuche nach Name & Ticker
 * - Schnellfilter-Presets (Chips: Alle, Dividende, Value, Growth)
 * - Bottom-Sheet Filter (KGV, Marktkapitalisierung, Performance, Rating)
 * - Sortierung und Watchlist-Toggle
 */

window.App = window.App || {};

window.App.Screener = (function () {
  'use strict';

  var cachedUniverse = [];
  var activePreset = 'all';
  var searchQuery = '';
  var activeSort = 'marketCap_desc';

  var filterState = {
    maxPe: 100,
    minYield: 0,
    minPerf52w: -100,
    selectedSector: 'all'
  };

  /**
   * Initialisiert den Screener beim Laden der View.
   */
  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;

    window.App.Data.getUniverse()
      .then(function (data) {
        cachedUniverse = data;
        renderScreenerUI(container);
        bindEvents();
        applyFiltersAndRenderList();
      })
      .catch(function (err) {
        container.innerHTML = '<div class="state-box"><p>Fehler beim Laden des Marktuniverums: ' + err.message + '</p></div>';
      });
  }

  /**
   * Rendert den statischen Rahmen des Screeners.
   */
  function renderScreenerUI(container) {
    // Kennzahlen für die Hero-Marktübersichtskarte berechnen
    var totalCount = cachedUniverse.length;
    var validPe = cachedUniverse.filter(function (it) { return it.pe && it.pe > 0; });
    var avgPe = validPe.length ? (validPe.reduce(function (acc, it) { return acc + it.pe; }, 0) / validPe.length).toFixed(1) : '—';
    var validYield = cachedUniverse.filter(function (it) { return it.dividendYield !== null && it.dividendYield !== undefined; });
    var avgYield = validYield.length ? ((validYield.reduce(function (acc, it) { return acc + it.dividendYield; }, 0) / validYield.length) * 100).toFixed(1) : '—';

    var topWinner = cachedUniverse.slice().sort(function (a, b) {
      return (b.changePercent || 0) - (a.changePercent || 0);
    })[0] || { ticker: '—', changePercent: 0 };

    var html = '' +
      '<div class="view-container">' +
        '<!-- Marktübersicht Banner -->' +
        '<div class="hero-banner">' +
          '<div class="hero-tag">Marktübersicht (Aktienuniversum)</div>' +
          '<div class="hero-count" id="screener-hero-count">' + totalCount + ' Titel</div>' +
          '<div class="hero-stats-grid">' +
            '<div>' +
              '<div class="hero-stat-label">Top-Gewinner</div>' +
              '<div class="hero-stat-value" style="color: #6ee7b7;">' + topWinner.ticker + ' (' + (topWinner.changePercent > 0 ? '+' : '') + window.App.Format.number(topWinner.changePercent, 2) + ' %)</div>' +
            '</div>' +
            '<div>' +
              '<div class="hero-stat-label">Ø KGV</div>' +
              '<div class="hero-stat-value">' + avgPe + '</div>' +
            '</div>' +
            '<div>' +
              '<div class="hero-stat-label">Ø Div.-Rendite</div>' +
              '<div class="hero-stat-value">' + avgYield + ' %</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- Suchfeld -->' +
        '<div class="search-bar-wrapper">' +
          '<svg class="search-icon-left" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<circle cx="11" cy="11" r="8"></circle>' +
            '<line x1="21" y1="21" x2="16.65" y2="16.65"></line>' +
          '</svg>' +
          '<input type="text" id="screener-search-input" class="search-input" placeholder="Name oder Ticker suchen..." autocomplete="off">' +
        '</div>' +

        '<!-- Schnellfilter Chips -->' +
        '<div class="horizontal-scroll-row">' +
          '<button class="chip-btn active" data-preset="all">Alle</button>' +
          '<button class="chip-btn" data-preset="high_dividend">💰 Hohe Dividende</button>' +
          '<button class="chip-btn" data-preset="value">💎 Value (KGV &lt; 18)</button>' +
          '<button class="chip-btn" data-preset="growth">🚀 Growth</button>' +
          '<button class="chip-btn" data-preset="top_performer">📈 Top Performer</button>' +
        '</div>' +

        '<!-- Sub-Header mit Ergebnis-Zähler und Sortierung -->' +
        '<div class="sub-header-bar">' +
          '<span id="screener-result-count">0 Ergebnisse</span>' +
          '<select id="screener-sort-select" class="sort-select">' +
            '<option value="marketCap_desc">Marktkapitalisierung (Höchste)</option>' +
            '<option value="change_desc">Tagesgewinner (%)</option>' +
            '<option value="change_asc">Tagesverlierer (%)</option>' +
            '<option value="pe_asc">KGV (Niedrigste)</option>' +
            '<option value="dividend_desc">Dividendenrendite (Höchste)</option>' +
            '<option value="perf52w_desc">52W-Performance (Beste)</option>' +
          '</select>' +
        '</div>' +

        '<!-- Aktien-Kartenliste -->' +
        '<div id="screener-list-container"></div>' +
      '</div>' +

      '<!-- Filter Bottom Sheet Backdrop -->' +
      '<div id="filter-sheet-backdrop" class="sheet-backdrop"></div>' +

      '<!-- Filter Bottom Sheet -->' +
      '<div id="filter-bottom-sheet" class="bottom-sheet">' +
        '<div class="sheet-handle"></div>' +
        '<div class="sheet-header">' +
          '<h3 style="font-size: 1.1rem; font-weight: 700;">Filter anpassen</h3>' +
          '<button id="sheet-reset-btn" class="chip-btn" style="padding: 4px 10px;">Zurücksetzen</button>' +
        '</div>' +

        '<div class="filter-group">' +
          '<div class="filter-label"><span>Maximales KGV</span><span id="label-max-pe">Beliebig</span></div>' +
          '<input type="range" id="filter-slider-pe" class="range-slider" min="5" max="80" step="5" value="80">' +
        '</div>' +

        '<div class="filter-group">' +
          '<div class="filter-label"><span>Mindest-Dividendenrendite</span><span id="label-min-yield">0 %</span></div>' +
          '<input type="range" id="filter-slider-yield" class="range-slider" min="0" max="8" step="0.5" value="0">' +
        '</div>' +

        '<div class="filter-group">' +
          '<div class="filter-label"><span>Mindest-Performance 52W</span><span id="label-min-perf">-100 %</span></div>' +
          '<input type="range" id="filter-slider-perf" class="range-slider" min="-50" max="100" step="10" value="-50">' +
        '</div>' +

        '<button id="sheet-apply-btn" class="btn-primary" style="margin-top: 12px;">Filter anwenden</button>' +
      '</div>';

    container.innerHTML = html;
  }

  /**
   * Bindet Benutzereingaben und Event-Listener.
   */
  function bindEvents() {
    // Filter-Button im App-Header verknüpfen
    var headerFilterBtn = document.getElementById('btn-header-filter');
    if (headerFilterBtn) {
      headerFilterBtn.style.display = 'inline-flex';
      headerFilterBtn.onclick = openFilterSheet;
    }

    var searchInput = document.getElementById('screener-search-input');
    if (searchInput) {
      searchInput.oninput = function (e) {
        searchQuery = (e.target.value || '').trim().toLowerCase();
        applyFiltersAndRenderList();
      };
    }

    // Preset Chips
    var presetChips = document.querySelectorAll('[data-preset]');
    presetChips.forEach(function (btn) {
      btn.onclick = function () {
        presetChips.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        activePreset = btn.getAttribute('data-preset');
        applyFiltersAndRenderList();
      };
    });

    // Sortierung
    var sortSelect = document.getElementById('screener-sort-select');
    if (sortSelect) {
      sortSelect.onchange = function (e) {
        activeSort = e.target.value;
        applyFiltersAndRenderList();
      };
    }

    // Bottom-Sheet Steuerung
    var backdrop = document.getElementById('filter-sheet-backdrop');
    var applyBtn = document.getElementById('sheet-apply-btn');
    var resetBtn = document.getElementById('sheet-reset-btn');

    if (backdrop) backdrop.onclick = closeFilterSheet;
    if (applyBtn) applyBtn.onclick = closeFilterSheet;

    if (resetBtn) {
      resetBtn.onclick = function () {
        filterState.maxPe = 100;
        filterState.minYield = 0;
        filterState.minPerf52w = -100;
        document.getElementById('filter-slider-pe').value = 80;
        document.getElementById('filter-slider-yield').value = 0;
        document.getElementById('filter-slider-perf').value = -50;
        document.getElementById('label-max-pe').textContent = 'Beliebig';
        document.getElementById('label-min-yield').textContent = '0 %';
        document.getElementById('label-min-perf').textContent = 'Beliebig';
        applyFiltersAndRenderList();
      };
    }

    // Sliders
    var sliderPe = document.getElementById('filter-slider-pe');
    var sliderYield = document.getElementById('filter-slider-yield');
    var sliderPerf = document.getElementById('filter-slider-perf');

    if (sliderPe) {
      sliderPe.oninput = function () {
        var v = parseFloat(sliderPe.value);
        filterState.maxPe = v >= 80 ? 1000 : v;
        document.getElementById('label-max-pe').textContent = v >= 80 ? 'Beliebig' : '< ' + v;
        applyFiltersAndRenderList();
      };
    }

    if (sliderYield) {
      sliderYield.oninput = function () {
        var v = parseFloat(sliderYield.value);
        filterState.minYield = v / 100;
        document.getElementById('label-min-yield').textContent = v > 0 ? '> ' + v + ' %' : '0 %';
        applyFiltersAndRenderList();
      };
    }

    if (sliderPerf) {
      sliderPerf.oninput = function () {
        var v = parseFloat(sliderPerf.value);
        filterState.minPerf52w = v <= -50 ? -1000 : v;
        document.getElementById('label-min-perf').textContent = v <= -50 ? 'Beliebig' : '> ' + v + ' %';
        applyFiltersAndRenderList();
      };
    }
  }

  function openFilterSheet() {
    var sheet = document.getElementById('filter-bottom-sheet');
    var backdrop = document.getElementById('filter-sheet-backdrop');
    if (sheet && backdrop) {
      sheet.classList.add('open');
      backdrop.classList.add('open');
    }
  }

  function closeFilterSheet() {
    var sheet = document.getElementById('filter-bottom-sheet');
    var backdrop = document.getElementById('filter-sheet-backdrop');
    if (sheet && backdrop) {
      sheet.classList.remove('open');
      backdrop.classList.remove('open');
    }
  }

  /**
   * Filtert und sortiert das Universum und rendert die Kartenliste.
   */
  function applyFiltersAndRenderList() {
    var filtered = cachedUniverse.filter(function (it) {
      // 1. Textsuche (Ticker oder Name)
      if (searchQuery) {
        var matchTicker = (it.ticker || '').toLowerCase().indexOf(searchQuery) !== -1;
        var matchName = (it.name || '').toLowerCase().indexOf(searchQuery) !== -1;
        if (!matchTicker && !matchName) return false;
      }

      // 2. Preset Filter
      if (activePreset === 'high_dividend') {
        if (!it.dividendYield || it.dividendYield < 0.03) return false;
      } else if (activePreset === 'value') {
        if (!it.pe || it.pe <= 0 || it.pe > 18) return false;
      } else if (activePreset === 'growth') {
        if (!it.revGrowth || it.revGrowth < 0.12) return false;
      } else if (activePreset === 'top_performer') {
        if (!it.perf52w || it.perf52w < 20) return false;
      }

      // 3. Slider Filter
      if (filterState.maxPe < 500) {
        if (!it.pe || it.pe > filterState.maxPe) return false;
      }
      if (filterState.minYield > 0) {
        if (!it.dividendYield || it.dividendYield < filterState.minYield) return false;
      }
      if (filterState.minPerf52w > -500) {
        if (it.perf52w === undefined || it.perf52w < filterState.minPerf52w) return false;
      }

      return true;
    });

    // Sortierung anwenden
    filtered.sort(function (a, b) {
      switch (activeSort) {
        case 'change_desc':
          return (b.changePercent || 0) - (a.changePercent || 0);
        case 'change_asc':
          return (a.changePercent || 0) - (b.changePercent || 0);
        case 'pe_asc':
          return (a.pe || 9999) - (b.pe || 9999);
        case 'dividend_desc':
          return (b.dividendYield || 0) - (a.dividendYield || 0);
        case 'perf52w_desc':
          return (b.perf52w || -999) - (a.perf52w || -999);
        case 'marketCap_desc':
        default:
          return (b.marketCap || 0) - (a.marketCap || 0);
      }
    });

    renderCards(filtered);
  }

  /**
   * Erzeugt das HTML für die Ergebnisliste der Aktienkarten.
   */
  function renderCards(list) {
    var countEl = document.getElementById('screener-result-count');
    var listContainer = document.getElementById('screener-list-container');
    if (countEl) countEl.textContent = list.length + ' Ergebnisse';
    if (!listContainer) return;

    if (list.length === 0) {
      listContainer.innerHTML = '<div class="state-box"><p>Keine passenden Aktien gefunden.</p></div>';
      return;
    }

    var html = '';
    list.forEach(function (stock) {
      var isStarred = window.App.Data.isWatchlisted(stock.ticker);
      var chgCls = window.App.Format.changeClass(stock.changePercent);
      var sign = (stock.changePercent || 0) >= 0 ? '+' : '';

      html += '' +
        '<div class="stock-card" data-ticker="' + stock.ticker + '">' +
          '<div style="display:flex; align-items:center;">' +
            '<button class="star-btn ' + (isStarred ? 'active' : '') + '" data-star-ticker="' + stock.ticker + '">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + (isStarred ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2">' +
                '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>' +
              '</svg>' +
            '</button>' +
            '<div class="stock-info-left">' +
              '<div class="stock-name">' + stock.name + '</div>' +
              '<div class="stock-tags">' +
                '<span class="ticker-badge">' + stock.ticker + '</span>' +
                '<span class="sector-label">• ' + (stock.sector || 'Markt') + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="stock-info-right">' +
            '<div class="stock-price">' + window.App.Format.currency(stock.price, stock.currency) + '</div>' +
            '<div class="badge-pill ' + chgCls + '">' + sign + window.App.Format.number(stock.changePercent, 2) + ' %</div>' +
          '</div>' +
        '</div>';
    });

    listContainer.innerHTML = html;

    // Card Click -> Navigation zur Detailansicht
    var cardElements = listContainer.querySelectorAll('.stock-card');
    cardElements.forEach(function (card) {
      card.onclick = function (e) {
        if (e.target.closest('.star-btn')) return;
        var ticker = card.getAttribute('data-ticker');
        window.App.Data.setLastTicker(ticker);
        window.App.Router.navigate('/stock/' + ticker + '/overview');
      };
    });

    // Star Click -> Watchlist Toggle
    var starBtns = listContainer.querySelectorAll('[data-star-ticker]');
    starBtns.forEach(function (star) {
      star.onclick = function (e) {
        e.stopPropagation();
        var ticker = star.getAttribute('data-star-ticker');
        var nowStarred = window.App.Data.toggleWatchlist(ticker);
        star.classList.toggle('active', nowStarred);
        var svg = star.querySelector('svg');
        if (svg) {
          svg.setAttribute('fill', nowStarred ? 'currentColor' : 'none');
        }
      };
    });
  }

  return {
    initView: initView,
    openFilterSheet: openFilterSheet,
    closeFilterSheet: closeFilterSheet
  };
})();

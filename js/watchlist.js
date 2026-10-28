/**
 * js/watchlist.js
 * Verwaltet die Watchlist-Ansicht:
 * - Listet alle mit Stern markierten Favoriten auf
 * - Zeigt aktuelle Notierung, Tagesperformance und Mini-Sparklines
 * - Erlaubt das direkte Entfernen von Einträgen per Klick auf den Stern
 */

window.App = window.App || {};

window.App.Watchlist = (function () {
  'use strict';

  /**
   * Initialisiert und rendert die Watchlist-View.
   */
  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;

    var headerFilterBtn = document.getElementById('btn-header-filter');
    if (headerFilterBtn) {
      headerFilterBtn.style.display = 'none';
    }

    var watchlistTickers = window.App.Data.getWatchlist();

    window.App.Data.getUniverse()
      .then(function (universe) {
        var starredItems = universe.filter(function (it) {
          return watchlistTickers.indexOf(it.ticker) !== -1;
        });

        renderWatchlistUI(container, starredItems);
        bindEvents(container);
      })
      .catch(function (err) {
        container.innerHTML = '<div class="state-box"><p>Fehler beim Laden der Watchlist: ' + err.message + '</p></div>';
      });
  }

  /**
   * Erzeugt das Layout für die Watchlist samt Mini-Sparklines per SVG.
   */
  function renderWatchlistUI(container, list) {
    var html = '' +
      '<div class="view-container">' +
        '<div style="margin-bottom: 16px;">' +
          '<h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">Meine Watchlist</h2>' +
          '<div style="font-size: 0.78rem; color: var(--text-dim);">' + list.length + ' gespeicherte Werte</div>' +
        '</div>';

    if (list.length === 0) {
      html += '' +
        '<div class="state-box">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-dim); margin-bottom: 8px;">' +
            '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>' +
          '</svg>' +
          '<div style="font-weight: 600; color: var(--text-muted);">Keine Favoriten vorhanden</div>' +
          '<div style="font-size: 0.8rem; max-width: 240px; margin: 0 auto;">Tippe im Screener oder in der Detailansicht auf den Stern, um Titel zu beobachten.</div>' +
        '</div>' +
      '</div>';
      container.innerHTML = html;
      return;
    }

    html += '<div id="watchlist-cards-container">';
    list.forEach(function (stock) {
      var chgCls = window.App.Format.changeClass(stock.changePercent);
      var sign = (stock.changePercent || 0) >= 0 ? '+' : '';
      var isPositive = (stock.changePercent || 0) >= 0;

      // Generiert eine dynamische Mini-Sparkline
      var sparklineSvg = generateSparkline(stock.perf52w || 0, isPositive);

      html += '' +
        '<div class="stock-card" data-ticker="' + stock.ticker + '">' +
          '<div style="display:flex; align-items:center; flex:1;">' +
            '<button class="star-btn active" data-remove-star="' + stock.ticker + '">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">' +
                '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>' +
              '</svg>' +
            '</button>' +
            '<div class="stock-info-left" style="margin-right: 12px;">' +
              '<div class="stock-name">' + stock.name + '</div>' +
              '<div class="stock-tags">' +
                '<span class="ticker-badge">' + stock.ticker + '</span>' +
                '<span class="sector-label">• ' + (stock.sector || 'Markt') + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="display: flex; align-items: center; gap: 14px;">' +
            sparklineSvg +
            '<div class="stock-info-right">' +
              '<div class="stock-price">' + window.App.Format.currency(stock.price, stock.currency) + '</div>' +
              '<div class="badge-pill ' + chgCls + '">' + sign + window.App.Format.number(stock.changePercent, 2) + ' %</div>' +
            '</div>' +
          '</div>' +
        '</div>';
    });

    html += '</div></div>';
    container.innerHTML = html;
  }

  /**
   * Erzeugt eine schlanke SVG-Miniatur-Kurve für die Listenansicht.
   */
  function generateSparkline(trendMetric, isPositive) {
    var strokeColor = isPositive ? '#10b981' : '#ef4444';
    var pathD = isPositive
      ? 'M 0 22 C 15 18, 30 20, 45 10 C 55 5, 65 8, 70 2'
      : 'M 0 4 C 15 8, 30 6, 45 16 C 55 21, 65 18, 70 24';

    return '' +
      '<svg width="70" height="26" viewBox="0 0 70 26" style="overflow: visible; flex-shrink: 0;">' +
        '<path d="' + pathD + '" fill="none" stroke="' + strokeColor + '" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>';
  }

  /**
   * Bindet Klick-Events für Detailnavigation und Entfernen aus der Watchlist.
   */
  function bindEvents(container) {
    var cards = container.querySelectorAll('.stock-card');
    cards.forEach(function (card) {
      card.onclick = function (e) {
        if (e.target.closest('.star-btn')) return;
        var ticker = card.getAttribute('data-ticker');
        window.App.Data.setLastTicker(ticker);
        window.App.Router.navigate('/stock/' + ticker + '/overview');
      };
    });

    var removeBtns = container.querySelectorAll('[data-remove-star]');
    removeBtns.forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var ticker = btn.getAttribute('data-remove-star');
        window.App.Data.toggleWatchlist(ticker);
        initView();
      };
    });
  }

  return {
    initView: initView
  };
})();

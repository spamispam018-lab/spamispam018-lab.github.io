/**
 * js/watchlist.js
 * Verwaltet die Watchlist-Ansicht mit Gruppen-Filter.
 */
window.App = window.App || {};

window.App.Watchlist = (function () {
  'use strict';

  var currentList = [];
  var currentGroupFilter = null; // null = alle

  function initView(params) {
    var container = document.getElementById('app-view-content');
    if (!container) return;

    var headerFilterBtn = document.getElementById('btn-header-filter');
    if (headerFilterBtn) headerFilterBtn.style.display = 'none';

    var tab = (params && params.tab) || 'stocks';
    var tabs = [
      { id: 'stocks', label: 'Werte' },
      { id: 'alerts', label: 'Alarme' },
      { id: 'earnings', label: 'Termine' }
    ];

    container.innerHTML = '' +
      '<div style="max-width: 680px; margin: 0 auto; padding: 12px 16px 4px; box-sizing: border-box;">' +
        '<div class="segbar" role="tablist" aria-label="Watchlist">' +
        tabs.map(function (t) {
          return '<button role="tab" aria-selected="' + (tab === t.id) + '" class="segbar-btn ' + (tab === t.id ? 'active' : '') + '" data-wl-tab="' + t.id + '">' + t.label + '</button>';
        }).join('') +
        '</div>' +
      '</div>' +
      '<div id="watchlist-tab-content"></div>';

    container.querySelectorAll('[data-wl-tab]').forEach(function (btn) {
      btn.onclick = function () {
        window.App.Router.navigate('/watchlist/' + btn.getAttribute('data-wl-tab'));
      };
    });

    var host = document.getElementById('watchlist-tab-content');
    if (!host) return;

    if (tab === 'alerts' || tab === 'earnings') {
      host.style.padding = '0 16px 24px';
      host.style.boxSizing = 'border-box';
    }

    if (tab === 'alerts') {
      if (window.App.Alerts) window.App.Alerts.initView(host);
      else host.innerHTML = '<div class="state-box"><p>Modul js/alerts.js nicht geladen.</p></div>';
      return;
    }
    if (tab === 'earnings') {
      if (window.App.Earnings) window.App.Earnings.initView(host);
      else host.innerHTML = '<div class="state-box"><p>Modul js/earnings.js nicht geladen.</p></div>';
      return;
    }

    var watchlistTickers = window.App.Data.getWatchlist();

    window.App.Data.getUniverse()
      .then(function (universe) {
        var starredItems = universe.filter(function (it) {
          return watchlistTickers.indexOf(it.ticker) !== -1;
        });
        renderWatchlistUI(host, starredItems);
        bindEvents(host);
      })
      .catch(function (err) {
        host.innerHTML = '<div class="state-box"><p>Fehler beim Laden der Watchlist: ' + err.message + '</p></div>';
      });
  }

  function renderWatchlistUI(container, list) {
    currentList = list;
    var groups = window.App.Data.getGroups();
    var filtered = currentGroupFilter
      ? list.filter(function (s) { return window.App.Data.getGroupForTicker(s.ticker) === currentGroupFilter; })
      : list;

    var html = '<div class="view-container">';
    html += '<div style="margin-bottom: 16px;"><h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">Meine Watchlist</h2>';
    html += '<div style="font-size: 0.78rem; color: var(--text-dim);">' + filtered.length + ' von ' + list.length + ' Werten' +
      (list.length > 0 ? ' <button class="chip-btn" id="watchlist-export-btn" style="padding: 3px 9px; margin-left: 10px; font-size: 0.72rem;">⬇ CSV</button>' : '') +
      '</div></div>';

    // Gruppen-Filter
    if (groups.length || list.length) {
      html += '<div class="horizontal-scroll-row">';
      html += '<button class="chip-btn ' + (currentGroupFilter === null ? 'active' : '') + '" data-wl-group="__all">Alle</button>';
      groups.forEach(function (g) {
        var count = list.filter(function (s) { return g.tickers.indexOf(s.ticker) !== -1; }).length;
        html += '<button class="chip-btn ' + (currentGroupFilter === g.name ? 'active' : '') + '" data-wl-group="' + escapeAttr(g.name) + '">' + escapeAttr(g.name) + ' (' + count + ')</button>';
      });
      html += '<button class="chip-btn" id="wl-add-group" style="flex-shrink: 0;">+ Gruppe</button>';
      html += '</div>';
    }

    if (filtered.length === 0) {
      html += '<div class="state-box">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-dim); margin-bottom: 8px;">' +
          '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>' +
        '</svg>' +
        '<div style="font-weight: 600; color: var(--text-muted);">' + (currentGroupFilter ? 'Keine Werte in dieser Gruppe' : 'Keine Favoriten vorhanden') + '</div>' +
        '<div style="font-size: 0.8rem; max-width: 240px; margin: 0 auto;">Tippe im Screener auf den Stern, um Titel zu beobachten.</div></div>';
      html += '</div>';
      container.innerHTML = html;
      bindGroupEvents(container);
      return;
    }

    html += '<div id="watchlist-cards-container">';
    filtered.forEach(function (stock) {
      var chgCls = window.App.Format.changeClass(stock.changePercent);
      var sign = (stock.changePercent || 0) >= 0 ? '+' : '';
      var grp = window.App.Data.getGroupForTicker(stock.ticker);
      var grpLabel = grp ? ' · ' + escapeAttr(grp) : '';

      html += '<div class="stock-card" data-ticker="' + escapeAttr(stock.ticker) + '">' +
        '<div style="display:flex; align-items:center; flex:1; min-width:0;">' +
          '<button class="star-btn active" data-remove-star="' + escapeAttr(stock.ticker) + '">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>' +
          '</button>' +
          '<div class="stock-info-left" style="margin-right: 12px; overflow: hidden; min-width: 0;">' +
            '<div class="stock-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeAttr(stock.name) + '</div>' +
            '<div class="stock-tags">' +
              '<span class="ticker-badge">' + escapeAttr(stock.ticker) + '</span>' +
              '<span class="sector-label">• ' + escapeAttr(stock.sector || 'Markt') + grpLabel + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display: flex; align-items: center; gap: 10px; flex-shrink:0;">' +
          '<div class="stock-info-right">' +
            '<div class="stock-price">' + window.App.Format.currency(stock.price, stock.currency) + '</div>' +
            '<div class="badge-pill ' + chgCls + '">' + sign + window.App.Format.number(stock.changePercent, 2) + ' %</div>' +
          '</div>' +
          '<button class="chip-btn wl-group-assign" data-ticker="' + escapeAttr(stock.ticker) + '" style="padding:2px 7px;font-size:0.68rem;" title="Gruppe zuordnen">📁</button>' +
        '</div>' +
      '</div>';
    });
    html += '</div></div>';
    container.innerHTML = html;

    bindGroupEvents(container);
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function bindGroupEvents(container) {
    var addBtn = container.querySelector('#wl-add-group');
    if (addBtn) {
      addBtn.onclick = function () {
        var name = prompt('Name der neuen Gruppe:');
        if (!name) return;
        name = name.trim();
        if (!name) return;
        if (!window.App.Data.addGroup(name)) { alert('Gruppe existiert bereits.'); return; }
        initView();
      };
    }

    container.querySelectorAll('[data-wl-group]').forEach(function (btn) {
      btn.onclick = function () {
        var g = btn.getAttribute('data-wl-group');
        currentGroupFilter = g === '__all' ? null : g;
        initView();
      };
    });

    container.querySelectorAll('.wl-group-assign').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var t = btn.getAttribute('data-ticker');
        var groups = window.App.Data.getGroups();
        var opts = ['(Keine)'].concat(groups.map(function (g) { return g.name; }));
        var choice = prompt('Gruppe für ' + t + ' wählen:\n' + opts.map(function (o, i) { return (i + 1) + '. ' + o; }).join('\n'));
        if (!choice) return;
        var idx = parseInt(choice, 10) - 1;
        if (idx === 0) window.App.Data.assignTickerToGroup(t, null);
        else if (idx > 0 && idx < opts.length) window.App.Data.assignTickerToGroup(t, opts[idx]);
        initView();
      };
    });
  }

  function bindEvents(container) {
    var exportBtn = container.querySelector('#watchlist-export-btn');
    if (exportBtn) {
      exportBtn.onclick = function () { window.App.Export.downloadStocks('watchlist', currentList); };
    }

    container.querySelectorAll('.stock-card').forEach(function (card) {
      card.onclick = function (e) {
        if (e.target.closest('.star-btn')) return;
        if (e.target.closest('.wl-group-assign')) return;
        var ticker = card.getAttribute('data-ticker');
        window.App.Data.setLastTicker(ticker);
        window.App.Router.navigate('/stock/' + ticker + '/overview');
      };
    });

    container.querySelectorAll('[data-remove-star]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var ticker = btn.getAttribute('data-remove-star');
        window.App.Data.toggleWatchlist(ticker);
        initView();
      };
    });
  }

  return { initView: initView };
})();
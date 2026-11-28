/**
 * js/watchlist.js
 * Verwaltet die Watchlist-Ansicht mit Gruppen-Filter.
 */
window.App = window.App || {};

window.App.Watchlist = (function () {
  'use strict';

  var currentList = [];
  var currentGroupFilter = null; // null = alle

  var currentHost = null;

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
    currentHost = container;
    var groups = window.App.Data.getGroups();
    if (currentGroupFilter && !groups.some(function (g) { return g.name === currentGroupFilter; })) currentGroupFilter = null;
    var filtered = currentGroupFilter
      ? list.filter(function (s) { return window.App.Data.getGroupsForTicker(s.ticker).indexOf(currentGroupFilter) !== -1; })
      : list;

    var html = '<div class="view-container">';
    html += '<div style="margin-bottom: 16px;"><h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">Meine Watchlist</h2>';
    html += '<div style="font-size: 0.78rem; color: var(--text-dim);">' + filtered.length + ' von ' + list.length + ' Werten' +
      (list.length > 0 ? ' <button class="chip-btn" id="watchlist-export-btn" style="padding: 3px 9px; margin-left: 10px; font-size: 0.72rem;">⬇ CSV</button>' +
        ' <button class="chip-btn" id="watchlist-ai-btn" style="padding: 3px 9px; margin-left: 6px; font-size: 0.72rem;">✦ KI-Check</button>' : '') +
      '</div></div>';

    // Gruppen-Filter
    if (groups.length || list.length) {
      html += '<div class="horizontal-scroll-row">';
      html += '<button class="chip-btn ' + (currentGroupFilter === null ? 'active' : '') + '" data-wl-group="__all">Alle</button>';
      groups.forEach(function (g) {
        var count = list.filter(function (s) { return g.tickers.indexOf(s.ticker) !== -1; }).length;
        html += '<button class="chip-btn ' + (currentGroupFilter === g.name ? 'active' : '') + '" data-wl-group="' + escapeAttr(g.name) + '">' + escapeAttr(g.name) + ' (' + count + ')</button>';
      });
      html += '<button class="chip-btn" id="wl-manage-groups" style="flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px;">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>' +
        (groups.length ? 'Gruppen' : 'Gruppe anlegen') + '</button>';
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

    html += '<div id="wl-digest"></div>';
    html += '<div id="watchlist-cards-container">';
    filtered.forEach(function (stock) {
      var chgCls = window.App.Format.changeClass(stock.changePercent);
      var sign = (stock.changePercent || 0) >= 0 ? '+' : '';
      var grps = window.App.Data.getGroupsForTicker(stock.ticker);
      var grpLabel = grps.length ? ' · ' + escapeAttr(grps.join(', ')) : '';

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
          '<button class="wl-group-assign' + (grps.length ? ' has-groups' : '') + '" data-ticker="' + escapeAttr(stock.ticker) + '" aria-label="Gruppen für ' + escapeAttr(stock.ticker) + ' wählen">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    });
    html += '</div></div>';
    container.innerHTML = html;
    renderDigest(container.querySelector('#wl-digest'), filtered);
    var aiBtn = container.querySelector('#watchlist-ai-btn');
    if (aiBtn) aiBtn.onclick = function () {
      if (window.App.AIAsk) window.App.AIAsk.list('watchlist', filtered.map(function (s) { return s.ticker; }));
    };

    bindGroupEvents(container);
  }

  /* ---------- "Heute auffällig": was sich bei den Watchlist-Werten getan hat ---------- */
  function digestEvents(s, news) {
    var F = window.App.Format, ev = [];
    var num = function (v) { return typeof v === 'number' && isFinite(v); };
    if (num(s.changePercent) && Math.abs(s.changePercent) >= 3) {
      ev.push({ w: 3 + Math.abs(s.changePercent) / 3, tone: s.changePercent > 0 ? 'up' : 'down', text: (s.changePercent > 0 ? '+' : '') + F.number(s.changePercent, 1) + ' % heute' });
    }
    if (s.cross && num(s.crossDaysAgo) && s.crossDaysAgo <= 1) {
      ev.push({ w: 4, tone: s.cross === 'golden' ? 'up' : 'down', text: (s.cross === 'golden' ? 'Golden Cross' : 'Death Cross') + (s.crossDaysAgo === 0 ? (s.crossLive ? ' heute (vorläufig)' : ' heute') : ' gestern') });
    }
    if (s.emaCross && num(s.emaCrossDaysAgo) && s.emaCrossDaysAgo <= 1) {
      ev.push({ w: 3, tone: s.emaCross === 'up' ? 'up' : 'down', text: 'EMA-Kreuz ' + (s.emaCross === 'up' ? '▲' : '▼') + (s.emaCrossDaysAgo === 0 ? (s.emaCrossLive ? ' heute (vorläufig)' : ' heute') : ' gestern') });
    }
    if (num(s.rangePos) && s.rangePos >= 98) ev.push({ w: 2.5, tone: 'up', text: 'am 52W-Hoch' });
    if (num(s.rangePos) && s.rangePos <= 2) ev.push({ w: 2.5, tone: 'down', text: 'am 52W-Tief' });
    if (num(s.rsi) && s.rsi <= 30) ev.push({ w: 2, tone: 'down', text: 'RSI ' + Math.round(s.rsi) + ' (überverkauft)' });
    if (num(s.rsi) && s.rsi >= 75) ev.push({ w: 1.5, tone: 'up', text: 'RSI ' + Math.round(s.rsi) + ' (überkauft)' });
    if (s.nextEarningsDate) {
      var d = new Date(s.nextEarningsDate), days = Math.round((d - new Date(new Date().toDateString())) / 86400000);
      if (days >= 0 && days <= 7) ev.push({ w: 2.2, tone: 'info', text: 'Zahlen ' + (s.nextEarningsEstimated ? 'ca. ' : '') + (days === 0 ? 'heute' : days === 1 ? 'morgen' : d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })) });
    }
    var n = news && news[s.ticker];
    if (n && n.n >= 3 && num(n.score) && Math.abs(n.score) >= 0.3) {
      ev.push({ w: 2, tone: n.score > 0 ? 'up' : 'down', text: 'News ' + (n.score > 0 ? 'positiv' : 'negativ') + (n.top && n.top.t ? ': ' + n.top.t : ''), long: true });
    }
    return ev;
  }

  function renderDigest(host, list) {
    if (!host || !list.length) return;
    window.App.Data.getJsonFile('news/_index.json').catch(function () { return {}; }).then(function (news) {
      if (!document.body.contains(host)) return;
      var rows = list.map(function (s) {
        var ev = digestEvents(s, news || {});
        return { s: s, ev: ev, w: ev.reduce(function (a, e) { return a + e.w; }, 0) };
      }).filter(function (r) { return r.ev.length; }).sort(function (a, b) { return b.w - a.w; });
      var color = { up: 'var(--bullish)', down: 'var(--bearish)', info: 'var(--accent, #6366f1)' };
      var html = '<div class="card" style="padding:14px 16px;margin-bottom:14px;">' +
        '<div class="card-header-dotted"><span class="card-title">Heute auffällig</span><span class="period-tag">' + (rows.length ? rows.length + ' von ' + list.length : 'alles ruhig') + '</span></div>';
      if (!rows.length) {
        html += '<div style="font-size:0.8rem;color:var(--text-muted);">Keine großen Bewegungen, Signale oder Termine bei deinen Werten.</div>';
      } else {
        rows.slice(0, 8).forEach(function (r) {
          html += '<div data-dg="' + escapeAttr(r.s.ticker) + '" style="padding:8px 0;border-top:1px solid var(--border);cursor:pointer;">' +
            '<div style="font-weight:700;font-size:0.86rem;">' + escapeAttr(r.s.name || r.s.ticker) + ' <span style="color:var(--text-dim);font-weight:600;font-size:0.74rem;">' + escapeAttr(r.s.ticker) + '</span></div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:3px;">' +
              r.ev.sort(function (a, b) { return b.w - a.w; }).map(function (e) {
                return '<span style="font-size:0.74rem;color:' + color[e.tone] + ';' + (e.long ? 'flex-basis:100%;color:var(--text-muted);' : '') + '">' +
                  (e.long ? '<span style="color:' + color[e.tone] + ';">●</span> ' : '') + escapeAttr(e.text) + '</span>';
              }).join('') +
            '</div></div>';
        });
        if (rows.length > 8) html += '<div style="font-size:0.74rem;color:var(--text-dim);padding-top:6px;">… und ' + (rows.length - 8) + ' weitere</div>';
      }
      html += '</div>';
      host.innerHTML = html;
      host.querySelectorAll('[data-dg]').forEach(function (el) {
        el.onclick = function () { window.App.Router.navigate('/stock/' + el.getAttribute('data-dg') + '/overview'); };
      });
    });
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function bindGroupEvents(container) {
    var manageBtn = container.querySelector('#wl-manage-groups');
    if (manageBtn) manageBtn.onclick = openManageSheet;

    container.querySelectorAll('[data-wl-group]').forEach(function (btn) {
      btn.onclick = function () {
        var g = btn.getAttribute('data-wl-group');
        currentGroupFilter = g === '__all' ? null : g;
        refresh();
      };
    });

    container.querySelectorAll('.wl-group-assign').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        openAssignSheet(btn.getAttribute('data-ticker'));
      };
    });
  }

  /** Neu zeichnen ohne erneutes Laden der Daten */
  function refresh() {
    // Seite inzwischen verlassen (z. B. Sheet durch Navigation geschlossen): nichts tun
    if (!currentHost || !document.body.contains(currentHost)) return;
    renderWatchlistUI(currentHost, currentList);
    bindEvents(currentHost);
  }

  var CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';

  function countInGroup(g) {
    return currentList.filter(function (s) { return g.tickers.indexOf(s.ticker) !== -1; }).length;
  }

  /** Sheet: Aktie einer oder mehreren Gruppen zuordnen (Mehrfachauswahl) */
  function openAssignSheet(ticker) {
    var D = window.App.Data;
    var selected = D.getGroupsForTicker(ticker);
    var stock = currentList.filter(function (s) { return s.ticker === ticker; })[0];

    function rowsHtml() {
      var groups = D.getGroups();
      if (!groups.length) return '<div class="ui-empty">Noch keine Gruppen. Lege unten die erste an.</div>';
      return groups.map(function (g) {
        var on = selected.indexOf(g.name) !== -1;
        return '<button class="ui-check-row" role="checkbox" aria-checked="' + on + '" data-g="' + escapeAttr(g.name) + '">' +
          '<span class="ui-check-box">' + CHECK_SVG + '</span>' +
          '<span class="ui-check-label">' + escapeAttr(g.name) + '</span>' +
          '<span class="ui-check-count">' + countInGroup(g) + (countInGroup(g) === 1 ? ' Wert' : ' Werte') + '</span>' +
        '</button>';
      }).join('');
    }

    var html =
      '<h3 class="ui-sheet-title">Gruppen für ' + escapeAttr(ticker) + '</h3>' +
      '<div class="ui-sheet-sub">' + escapeAttr(stock ? stock.name : '') + ' · Mehrfachauswahl möglich</div>' +
      '<div id="wl-assign-list" role="group" aria-label="Gruppen">' + rowsHtml() + '</div>' +
      '<form class="ui-inline-form" id="wl-assign-new">' +
        '<input class="ui-input" id="wl-assign-new-name" type="text" maxlength="30" placeholder="Neue Gruppe" aria-label="Name der neuen Gruppe" autocomplete="off">' +
        '<button class="ui-btn ui-btn-small" type="submit">Anlegen</button>' +
      '</form>' +
      '<div class="ui-hint" id="wl-assign-hint"></div>' +
      '<div class="ui-sheet-actions">' +
        '<button class="ui-btn" id="wl-assign-cancel" type="button">Abbrechen</button>' +
        '<button class="ui-btn ui-btn-primary" id="wl-assign-save" type="button">Speichern</button>' +
      '</div>';

    window.App.UI.openSheet(html, function (root) {
      var listEl = root.querySelector('#wl-assign-list');
      var hint = root.querySelector('#wl-assign-hint');

      function bindRows() {
        listEl.querySelectorAll('[data-g]').forEach(function (row) {
          row.onclick = function () {
            var name = row.getAttribute('data-g');
            var i = selected.indexOf(name);
            if (i === -1) selected.push(name); else selected.splice(i, 1);
            row.setAttribute('aria-checked', i === -1);
          };
        });
      }
      bindRows();

      root.querySelector('#wl-assign-new').onsubmit = function (e) {
        e.preventDefault();
        var input = root.querySelector('#wl-assign-new-name');
        var name = (input.value || '').trim();
        if (!name) { hint.textContent = 'Bitte einen Namen eingeben.'; return; }
        if (!D.addGroup(name)) { hint.textContent = 'Eine Gruppe mit diesem Namen gibt es schon.'; return; }
        hint.textContent = '';
        input.value = '';
        if (selected.indexOf(name) === -1) selected.push(name);
        listEl.innerHTML = rowsHtml();
        bindRows();
      };
      root.querySelector('#wl-assign-cancel').onclick = function () { window.App.UI.closeSheet(); };
      root.querySelector('#wl-assign-save').onclick = function () {
        D.setTickerGroups(ticker, selected);
        window.App.UI.closeSheet();
        window.App.UI.toast(selected.length ? ticker + ': ' + selected.length + (selected.length === 1 ? ' Gruppe' : ' Gruppen') : ticker + ': keine Gruppe');
      };
    }, refresh);
  }

  /** Sheet: Gruppen anlegen, umbenennen, löschen */
  function openManageSheet() {
    var D = window.App.Data;
    var pendingDelete = null;

    function listHtml() {
      var groups = D.getGroups();
      if (!groups.length) return '<div class="ui-empty">Noch keine Gruppen vorhanden.</div>';
      return groups.map(function (g) {
        var n = countInGroup(g);
        var confirm = pendingDelete === g.name;
        return '<div class="ui-group-row">' +
          '<input class="ui-input" type="text" maxlength="30" value="' + escapeAttr(g.name) + '" data-rename="' + escapeAttr(g.name) + '" aria-label="Gruppe ' + escapeAttr(g.name) + ' umbenennen">' +
          '<span class="ui-group-count">' + n + (n === 1 ? ' Wert' : ' Werte') + '</span>' +
          '<button class="ui-del-btn' + (confirm ? ' confirm' : '') + '" data-del="' + escapeAttr(g.name) + '" aria-label="' + (confirm ? 'Löschen bestätigen' : 'Gruppe ' + escapeAttr(g.name) + ' löschen') + '">' +
            (confirm ? 'Löschen?' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>') +
          '</button>' +
        '</div>';
      }).join('');
    }

    var html =
      '<h3 class="ui-sheet-title">Gruppen verwalten</h3>' +
      '<div class="ui-sheet-sub">Namen antippen zum Umbenennen. Beim Löschen bleiben die Aktien in der Watchlist.</div>' +
      '<div id="wl-manage-list">' + listHtml() + '</div>' +
      '<form class="ui-inline-form" id="wl-manage-new">' +
        '<input class="ui-input" id="wl-manage-new-name" type="text" maxlength="30" placeholder="Neue Gruppe" aria-label="Name der neuen Gruppe" autocomplete="off">' +
        '<button class="ui-btn ui-btn-small" type="submit">Anlegen</button>' +
      '</form>' +
      '<div class="ui-hint" id="wl-manage-hint"></div>' +
      '<div class="ui-sheet-actions"><button class="ui-btn ui-btn-primary" id="wl-manage-done" type="button">Fertig</button></div>';

    window.App.UI.openSheet(html, function (root) {
      var listEl = root.querySelector('#wl-manage-list');
      var hint = root.querySelector('#wl-manage-hint');

      function redraw() { listEl.innerHTML = listHtml(); bind(); }

      function bind() {
        listEl.querySelectorAll('[data-rename]').forEach(function (input) {
          var commit = function () {
            var oldName = input.getAttribute('data-rename');
            var newName = (input.value || '').trim();
            if (newName === oldName) return;
            if (!D.renameGroup(oldName, newName)) {
              hint.textContent = newName ? 'Den Namen „' + newName + '“ gibt es schon.' : 'Der Name darf nicht leer sein.';
              input.value = oldName;
              return;
            }
            hint.textContent = '';
            if (currentGroupFilter === oldName) currentGroupFilter = newName;
            input.setAttribute('data-rename', newName);
          };
          input.onchange = commit;
          input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } };
        });
        listEl.querySelectorAll('[data-del]').forEach(function (btn) {
          btn.onclick = function () {
            var name = btn.getAttribute('data-del');
            if (pendingDelete !== name) { pendingDelete = name; redraw(); return; }
            D.removeGroup(name);
            if (currentGroupFilter === name) currentGroupFilter = null;
            pendingDelete = null;
            redraw();
            window.App.UI.toast('Gruppe „' + name + '“ gelöscht');
          };
        });
      }
      bind();

      root.querySelector('#wl-manage-new').onsubmit = function (e) {
        e.preventDefault();
        var input = root.querySelector('#wl-manage-new-name');
        var name = (input.value || '').trim();
        if (!name) { hint.textContent = 'Bitte einen Namen eingeben.'; return; }
        if (!D.addGroup(name)) { hint.textContent = 'Eine Gruppe mit diesem Namen gibt es schon.'; return; }
        hint.textContent = '';
        input.value = '';
        pendingDelete = null;
        redraw();
      };
      root.querySelector('#wl-manage-done').onclick = function () {
        var active = document.activeElement;
        if (active && active.getAttribute && active.getAttribute('data-rename') !== null) active.blur();
        window.App.UI.closeSheet();
      };
    }, refresh);
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
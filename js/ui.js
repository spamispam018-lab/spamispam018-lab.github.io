/**
 * js/ui.js
 * Gemeinsame Bedien-Bausteine für das neue Navigationskonzept:
 * - 4 Hauptbereiche (Markt, Entdecken, Watchlist, Depot) mit Umschalter-Leiste
 * - Merkt sich pro Bereich die zuletzt besuchte Unterseite
 * - Aktions-Sheet (⋯-Menüs), App-Menü (Theme, Experten-Modus, Installation)
 * - Experten-Modus, "Zuletzt angesehen", Formular-Vorbelegung nach Navigation
 */
window.App = window.App || {};

window.App.UI = (function () {
  'use strict';

  var EXPERT_KEY = 'app_expert_mode';
  var RECENT_KEY = 'app_recent_tickers';
  var LAST_ROUTE_KEY = 'app_last_group_routes';

  var GROUPS = {
    markt: {
      label: 'Markt',
      items: [
        { id: 'market', label: 'Übersicht', route: '/market' },
        { id: 'macro', label: 'Makro', route: '/macro' }
      ]
    },
    entdecken: {
      label: 'Entdecken',
      items: [
        { id: 'screener', label: 'Filter', route: '/screener' },
        { id: 'strategies', label: 'Strategien', route: '/strategies' },
        { id: 'backtest', label: 'Backtest', route: '/backtest' },
        { id: 'compare', label: 'Vergleich', route: '/compare' }
      ]
    },
    watchlist: {
      label: 'Watchlist',
      items: [] // Watchlist hat eigene Tabs (Werte, Alarme, Termine)
    },
    depot: {
      label: 'Depot',
      items: [
        { id: 'portfolio', label: 'Bestände', route: '/portfolio' },
        { id: 'dividends', label: 'Dividenden', route: '/dividends' },
        { id: 'journal', label: 'Journal', route: '/journal' }
      ]
    }
  };

  var SECTION_GROUP = {
    market: 'markt', macro: 'markt',
    screener: 'entdecken', strategies: 'entdecken', backtest: 'entdecken', compare: 'entdecken',
    watchlist: 'watchlist',
    portfolio: 'depot', dividends: 'depot', journal: 'depot'
  };

  var activeGroup = 'entdecken';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function saveJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  // ---------- Bereiche & Umschalter ----------

  function groupFor(section) {
    return SECTION_GROUP[section] || null;
  }

  /** Wird vom Router bei jedem Seitenwechsel aufgerufen. */
  function onRoute(section, path) {
    var group = groupFor(section);
    if (group) {
      activeGroup = group;
      var last = loadJson(LAST_ROUTE_KEY, {});
      last[group] = path;
      saveJson(LAST_ROUTE_KEY, last);
    }
    renderSegbar(section, group);
    syncNav();
  }

  function renderSegbar(section, group) {
    var el = document.getElementById('app-segbar');
    if (!el) return;
    var g = group ? GROUPS[group] : null;
    if (!g || !g.items.length) {
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }
    var html = '<div class="segbar" role="tablist" aria-label="' + esc(g.label) + '">';
    g.items.forEach(function (it) {
      var on = it.id === section;
      html += '<a href="#' + it.route + '" role="tab" aria-selected="' + on + '" class="segbar-btn' + (on ? ' active' : '') + '">' + esc(it.label) + '</a>';
    });
    html += '</div>';
    el.innerHTML = html;
    el.style.display = '';
  }

  /** Bottom-Nav: aktiven Bereich markieren und Ziel = zuletzt besuchte Unterseite. */
  function syncNav() {
    var last = loadJson(LAST_ROUTE_KEY, {});
    document.querySelectorAll('.bottom-nav .nav-item').forEach(function (item) {
      var g = item.getAttribute('data-group');
      if (!g) return;
      item.classList.toggle('active', g === activeGroup);
      var first = GROUPS[g].items.length ? GROUPS[g].items[0].route : '/' + g;
      if (g === 'watchlist') first = '/watchlist';
      var target = last[g] || first;
      // Tippen auf den bereits aktiven Bereich führt zu dessen Startseite
      if (g === activeGroup && !isStockRoute()) target = first;
      item.setAttribute('href', '#' + target);
    });
  }

  function isStockRoute() {
    return (window.location.hash || '').indexOf('#/stock') === 0;
  }

  // ---------- Experten-Modus ----------

  function isExpert() {
    try { return localStorage.getItem(EXPERT_KEY) === '1'; } catch (e) { return false; }
  }

  function setExpert(on) {
    try { localStorage.setItem(EXPERT_KEY, on ? '1' : '0'); } catch (e) {}
    window.dispatchEvent(new CustomEvent('app:expertchange', { detail: { on: !!on } }));
  }

  // ---------- Zuletzt angesehen ----------

  function addRecent(ticker) {
    if (!ticker) return;
    var list = loadJson(RECENT_KEY, []);
    if (!Array.isArray(list)) list = [];
    list = [ticker].concat(list.filter(function (t) { return t !== ticker; })).slice(0, 6);
    saveJson(RECENT_KEY, list);
  }

  function getRecent() {
    var list = loadJson(RECENT_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  // ---------- Sheets ----------

  var sheetEls = null;

  function ensureSheet() {
    if (sheetEls) return sheetEls;
    var backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.id = 'ui-sheet-backdrop';
    var sheet = document.createElement('div');
    sheet.className = 'bottom-sheet';
    sheet.id = 'ui-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    backdrop.onclick = closeSheet;
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sheet.classList.contains('open')) closeSheet();
    });
    window.addEventListener('hashchange', closeSheet);
    sheetEls = { backdrop: backdrop, sheet: sheet };
    return sheetEls;
  }

  var sheetOnClose = null;

  /** Öffnet ein Sheet. onClose läuft bei jedem Schließen (Button, Hintergrund, Esc). */
  function openSheetHtml(html, bind, onClose) {
    var s = ensureSheet();
    sheetOnClose = onClose || null;
    s.sheet.innerHTML = '<div class="sheet-handle"></div>' + html;
    if (bind) bind(s.sheet);
    s.backdrop.classList.add('open');
    s.sheet.classList.add('open');
  }

  function closeSheet() {
    if (!sheetEls) return;
    var wasOpen = sheetEls.sheet.classList.contains('open');
    sheetEls.backdrop.classList.remove('open');
    sheetEls.sheet.classList.remove('open');
    var cb = sheetOnClose;
    sheetOnClose = null;
    if (wasOpen && cb) { try { cb(); } catch (e) { console.error(e); } }
  }

  /**
   * Aktions-Sheet. items: [{ label, desc?, onClick, danger? }]
   */
  function actionSheet(title, items) {
    var html = '<div class="sheet-header"><h3 style="font-size:1.05rem;font-weight:700;">' + esc(title) + '</h3></div>' +
      '<div class="ui-action-list">';
    items.forEach(function (it, i) {
      html += '<button class="ui-action-item" data-ui-act="' + i + '">' +
        '<span class="ui-action-label">' + esc(it.label) + '</span>' +
        (it.desc ? '<span class="ui-action-desc">' + esc(it.desc) + '</span>' : '') +
      '</button>';
    });
    html += '</div>';
    openSheetHtml(html, function (root) {
      root.querySelectorAll('[data-ui-act]').forEach(function (btn) {
        btn.onclick = function () {
          var it = items[parseInt(btn.getAttribute('data-ui-act'), 10)];
          closeSheet();
          if (it && it.onClick) setTimeout(it.onClick, 30);
        };
      });
    });
  }

  /** App-Menü (⋯ oben rechts) */
  function openMenu() {
    var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    var installBtn = document.getElementById('pwa-install-btn');
    var canInstall = installBtn && installBtn.style.display !== 'none';
    var expert = isExpert();

    var html = '<div class="sheet-header"><h3 style="font-size:1.05rem;font-weight:700;">Einstellungen</h3></div>' +
      '<div class="ui-action-list">' +
        '<button class="ui-action-item ui-switch-row" id="ui-menu-theme">' +
          '<span><span class="ui-action-label">Helles Design</span><span class="ui-action-desc">Zwischen Dunkel und Hell wechseln</span></span>' +
          '<span class="ui-switch' + (!isDark ? ' on' : '') + '" aria-hidden="true"></span>' +
        '</button>' +
        '<button class="ui-action-item ui-switch-row" id="ui-menu-expert" role="switch" aria-checked="' + expert + '">' +
          '<span><span class="ui-action-label">Experten-Modus</span><span class="ui-action-desc">Zeigt in der Detailansicht alle Analysen, auch Optionen und Institutionen</span></span>' +
          '<span class="ui-switch' + (expert ? ' on' : '') + '" aria-hidden="true"></span>' +
        '</button>' +
        '<button class="ui-action-item" id="ui-menu-search"><span class="ui-action-label">Suche öffnen</span><span class="ui-action-desc">Aktien und alle Bereiche (Strg/Cmd + K)</span></button>' +
        (canInstall ? '<button class="ui-action-item" id="ui-menu-install"><span class="ui-action-label">App installieren</span><span class="ui-action-desc">Als App auf dem Startbildschirm</span></button>' : '') +
      '</div>';

    openSheetHtml(html, function (root) {
      root.querySelector('#ui-menu-theme').onclick = function () {
        if (window.App.Theme) window.App.Theme.toggle();
        var light = document.documentElement.getAttribute('data-theme') === 'light';
        this.querySelector('.ui-switch').classList.toggle('on', light);
      };
      root.querySelector('#ui-menu-expert').onclick = function () {
        var on = !isExpert();
        setExpert(on);
        this.setAttribute('aria-checked', on);
        this.querySelector('.ui-switch').classList.toggle('on', on);
      };
      root.querySelector('#ui-menu-search').onclick = function () {
        closeSheet();
        if (window.App.CommandPalette) window.App.CommandPalette.open();
      };
      var inst = root.querySelector('#ui-menu-install');
      if (inst) inst.onclick = function () { closeSheet(); installBtn.click(); };
    });
  }

  // ---------- Kurzmeldung ----------

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('ui-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ui-toast';
      el.className = 'ui-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  // ---------- Vorbelegung von Formularen ----------

  /**
   * Füllt nach einem Seitenwechsel Eingabefelder (per id) vor.
   * Wartet kurz, bis die Zielseite gerendert ist.
   */
  function prefill(map, focusId) {
    var tries = 0;
    function attempt() {
      var done = true;
      Object.keys(map).forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) { done = false; return; }
        if (el.getAttribute('data-ui-prefilled') === '1') return;
        el.value = map[id];
        el.setAttribute('data-ui-prefilled', '1');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      if (done) {
        var f = focusId && document.getElementById(focusId);
        if (f) {
          f.scrollIntoView({ block: 'center', behavior: 'smooth' });
          try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }
        }
        return;
      }
      if (++tries < 30) setTimeout(attempt, 100);
    }
    setTimeout(attempt, 50);
  }

  return {
    GROUPS: GROUPS,
    groupFor: groupFor,
    onRoute: onRoute,
    syncNav: syncNav,
    isExpert: isExpert,
    setExpert: setExpert,
    addRecent: addRecent,
    getRecent: getRecent,
    actionSheet: actionSheet,
    openSheet: openSheetHtml,
    toast: toast,
    openMenu: openMenu,
    closeSheet: closeSheet,
    prefill: prefill,
    esc: esc
  };
})();

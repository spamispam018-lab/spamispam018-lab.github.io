/**
 * js/command-palette.js
 * Globale Suche (Cmd+K / Strg+K) über Aktien, Views und Aktionen.
 */
window.App = window.App || {};
window.App.CommandPalette = (function () {
  'use strict';

  var modal = null;
  var input = null;
  var resultsEl = null;
  var universe = [];
  var selectedIdx = 0;
  var items = [];

  function getActions() {
    return [
      { id: 'nav:screener', label: 'Screener', desc: 'Aktien filtern und durchsuchen', icon: '🔍', action: function () { window.App.Router.navigate('/screener'); } },
      { id: 'nav:market', label: 'Markt', desc: 'Sektoren-Heatmap', icon: '📊', action: function () { window.App.Router.navigate('/market'); } },
      { id: 'nav:watchlist', label: 'Watchlist', desc: 'Favoriten & Gruppen', icon: '⭐', action: function () { window.App.Router.navigate('/watchlist'); } },
      { id: 'nav:compare', label: 'Vergleich', desc: 'Aktien vergleichen', icon: '⚖️', action: function () { window.App.Router.navigate('/compare'); } },
      { id: 'nav:portfolio', label: 'Portfolio', desc: 'Bestände & Performance', icon: '💼', action: function () { window.App.Router.navigate('/portfolio'); } },
      { id: 'nav:dividends', label: 'Dividenden', desc: 'Kalender & Yield on Cost', icon: '💰', action: function () { window.App.Router.navigate('/dividends'); } },
      { id: 'nav:journal', label: 'Journal', desc: 'Thesen & Notizen', icon: '📝', action: function () { window.App.Router.navigate('/journal'); } },
      { id: 'theme:toggle', label: 'Theme wechseln', desc: 'Dark/Light umschalten', icon: '🌓', action: function () { window.App.Theme.toggle(); } }
    ];
  }

  function ensureModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.id = 'cmdk-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9000;display:none;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);align-items:flex-start;justify-content:center;padding-top:12vh;';
    modal.innerHTML =
      '<div style="width:min(620px,92vw);background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-lg);box-shadow:0 20px 60px rgba(0,0,0,0.5);overflow:hidden;">' +
        '<div style="display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border-subtle);gap:10px;">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '<input id="cmdk-input" type="text" placeholder="Aktie, Ansicht oder Aktion suchen..." autocomplete="off" style="flex:1;background:transparent;border:none;outline:none;color:var(--text-main);font-size:0.95rem;padding:4px 0;font-family:inherit;">' +
          '<kbd style="font-size:0.68rem;padding:2px 6px;background:var(--bg-tertiary);border-radius:4px;color:var(--text-dim);font-family:inherit;">ESC</kbd>' +
        '</div>' +
        '<div id="cmdk-results" style="max-height:60vh;overflow-y:auto;"></div>' +
      '</div>';
    document.body.appendChild(modal);
    input = modal.querySelector('#cmdk-input');
    resultsEl = modal.querySelector('#cmdk-results');

    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    input.addEventListener('input', renderResults);
    input.addEventListener('keydown', handleKey);
  }

  function open() {
    ensureModal();
    modal.style.display = 'flex';
    input.value = '';
    selectedIdx = 0;
    renderResults();
    setTimeout(function () { input.focus(); }, 10);
    if (!universe.length && window.App.Data) {
      window.App.Data.getUniverse().then(function (u) {
        universe = u || [];
        renderResults();
      });
    }
  }

  function close() {
    if (modal) modal.style.display = 'none';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function renderResults() {
    if (!resultsEl) return;
    var q = (input.value || '').trim().toLowerCase();
    var out = [];

    getActions().forEach(function (a) {
      if (!q || a.label.toLowerCase().indexOf(q) !== -1 || a.desc.toLowerCase().indexOf(q) !== -1) {
        out.push({ type: 'action', data: a });
      }
    });

    if (universe.length && q) {
      var matches = universe.filter(function (u) {
        return (u.ticker || '').toLowerCase().indexOf(q) !== -1 ||
               (u.name || '').toLowerCase().indexOf(q) !== -1;
      }).sort(function (a, b) {
        var at = (a.ticker || '').toLowerCase().indexOf(q);
        var bt = (b.ticker || '').toLowerCase().indexOf(q);
        return at - bt || (a.ticker || '').localeCompare(b.ticker || '');
      }).slice(0, 15);

      matches.forEach(function (u) { out.push({ type: 'stock', data: u }); });
    }

    items = out;
    if (selectedIdx >= items.length) selectedIdx = 0;

    if (!items.length) {
      resultsEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-dim);font-size:0.85rem;">Keine Treffer</div>';
      return;
    }

    var html = '';
    items.forEach(function (item, i) {
      var sel = i === selectedIdx ? 'background:var(--accent-purple-glow);' : '';
      if (item.type === 'action') {
        html += '<div class="cmdk-item" data-idx="' + i + '" style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;' + sel + '">' +
          '<span style="font-size:1.1rem;">' + item.data.icon + '</span>' +
          '<div><div style="font-weight:600;color:var(--text-main);font-size:0.88rem;">' + esc(item.data.label) + '</div>' +
          '<div style="font-size:0.72rem;color:var(--text-dim);">' + esc(item.data.desc) + '</div></div></div>';
      } else {
        var price = item.data.price ? window.App.Format.currency(item.data.price) : '';
        html += '<div class="cmdk-item" data-idx="' + i + '" style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;' + sel + '">' +
          '<span class="ticker-badge">' + esc(item.data.ticker || '') + '</span>' +
          '<div style="flex:1;min-width:0;"><div style="font-weight:600;color:var(--text-main);font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(item.data.name || '') + '</div>' +
          '<div style="font-size:0.7rem;color:var(--text-dim);">' + esc(item.data.sector || '') + '</div></div>' +
          '<div style="font-weight:700;font-size:0.82rem;color:var(--text-muted);font-variant-numeric:tabular-nums;">' + price + '</div></div>';
      }
    });
    resultsEl.innerHTML = html;

    resultsEl.querySelectorAll('.cmdk-item').forEach(function (el) {
      el.onclick = function () { execute(parseInt(el.getAttribute('data-idx'), 10)); };
    });
  }

  function handleKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(items.length - 1, selectedIdx + 1); renderResults(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(0, selectedIdx - 1); renderResults(); }
    else if (e.key === 'Enter') { e.preventDefault(); execute(selectedIdx); }
    else if (e.key === 'Escape') { close(); }
  }

  function execute(idx) {
    var item = items[idx];
    if (!item) return;
    close();
    if (item.type === 'action') item.data.action();
    else if (item.type === 'stock') window.App.Router.navigate('/stock/' + item.data.ticker + '/overview');
  }

  function init() {
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (modal && modal.style.display === 'flex') close(); else open();
      }
    });
  }

  return { open: open, close: close, init: init };
})();
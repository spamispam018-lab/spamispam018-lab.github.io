/**
 * js/journal.js
 * Trade-Journal: These, Stop, Ziel pro Ticker in localStorage.
 */
window.App = window.App || {};
window.App.Journal = (function () {
  'use strict';
  var STORAGE_KEY = 'app_journal_v1';

  function getAll() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;
    var headerFilterBtn = document.getElementById('btn-header-filter');
    if (headerFilterBtn) headerFilterBtn.style.display = 'none';

    var entries = getAll().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });

    var html = '<div class="view-container">';
    html += '<div style="margin-bottom:16px;"><h2 style="font-size:1.25rem;font-weight:700;margin-bottom:4px;">Trade-Journal</h2>';
    html += '<div style="font-size:0.78rem;color:var(--text-dim);">' + entries.length + ' Eintr' + (entries.length === 1 ? 'ag' : 'äge') + '</div></div>';

    html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Neuer Eintrag</span></div>';
    html += '<div style="display:flex;flex-direction:column;gap:8px;">';
    html += '<input id="jn-ticker" class="search-input" placeholder="Ticker (z. B. AAPL)" style="text-transform:uppercase;padding-left:14px;">';
    html += '<textarea id="jn-thesis" class="search-input" placeholder="These / Warum kaufst du? Was ist dein Thesis-Breakdown-Punkt?" style="height:90px;padding:10px 14px;resize:vertical;"></textarea>';
    html += '<div style="display:flex;gap:8px;">';
    html += '<input id="jn-stop" class="search-input" type="number" step="any" placeholder="Stop-Loss (€)" style="flex:1;padding-left:14px;">';
    html += '<input id="jn-target" class="search-input" type="number" step="any" placeholder="Ziel (€)" style="flex:1;padding-left:14px;">';
    html += '</div>';
    html += '<button class="chip-btn active" id="jn-add" style="height:38px;justify-content:center;">+ Eintrag speichern</button>';
    html += '</div></div>';

    if (entries.length) {
      html += '<div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);margin:14px 0 8px;text-transform:uppercase;">Einträge</div>';
      entries.forEach(function (e) {
        html += '<div class="card" style="padding:12px 14px;margin-bottom:8px;" data-jn-id="' + esc(e.id) + '">';
        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-weight:700;font-size:0.9rem;cursor:pointer;color:var(--accent-purple-light);" class="jn-goto" data-ticker="' + esc(e.ticker) + '">' + esc(e.ticker) + '</div>';
        html += '<div style="font-size:0.7rem;color:var(--text-dim);">' + window.App.Format.date(e.createdAt) + '</div>';
        html += '<div style="font-size:0.82rem;margin-top:6px;line-height:1.4;white-space:pre-wrap;">' + esc(e.thesis) + '</div>';
        if (e.stop || e.target) {
          html += '<div style="display:flex;gap:12px;margin-top:6px;font-size:0.72rem;color:var(--text-dim);">';
          if (e.stop) html += '<span>Stop: <strong style="color:var(--bearish);">' + window.App.Format.currency(Number(e.stop)) + '</strong></span>';
          if (e.target) html += '<span>Ziel: <strong style="color:var(--bullish);">' + window.App.Format.currency(Number(e.target)) + '</strong></span>';
          html += '</div>';
        }
        html += '</div>';
        html += '<button class="chip-btn jn-del" data-id="' + esc(e.id) + '" aria-label="Löschen" style="padding:4px 8px;font-size:0.9rem;">🗑</button>';
        html += '</div></div>';
      });
    } else {
      html += '<div class="state-box"><p>Noch keine Einträge. Beginne mit deiner ersten These.</p></div>';
    }

    html += '</div>';
    container.innerHTML = html;

    document.getElementById('jn-add').onclick = function () {
      var ticker = (document.getElementById('jn-ticker').value || '').trim().toUpperCase();
      var thesis = (document.getElementById('jn-thesis').value || '').trim();
      var stop = document.getElementById('jn-stop').value;
      var target = document.getElementById('jn-target').value;
      if (!ticker || !thesis) { alert('Bitte Ticker und These ausfüllen.'); return; }
      var list = getAll();
      list.push({
        id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        ticker: ticker, thesis: thesis,
        stop: stop ? parseFloat(stop) : null,
        target: target ? parseFloat(target) : null,
        createdAt: new Date().toISOString()
      });
      save(list);
      initView();
    };

    container.querySelectorAll('.jn-del').forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm('Eintrag löschen?')) return;
        save(getAll().filter(function (e) { return e.id !== btn.getAttribute('data-id'); }));
        initView();
      };
    });

    container.querySelectorAll('.jn-goto').forEach(function (el) {
      el.onclick = function () {
        window.App.Router.navigate('/stock/' + el.getAttribute('data-ticker') + '/overview');
      };
    });
  }

  return { initView: initView };
})();
/**
 * js/catalysts.js – Treiber & Termine (Markt › Treiber, Route #/catalysts)
 *
 * Zeigt data/catalysts.json (scripts/fetch_catalysts.py): politische Entscheidungen, Regulierung, Zölle,
 * Notenbanken und Konjunkturtermine, die Kurse bewegen können – mit Status (bevorstehend / beschlossen /
 * laufend), möglicher Richtung und den betroffenen Aktien der App.
 *
 * App.Catalysts.initView()
 * App.Catalysts.load()                  -> Promise data
 * App.Catalysts.forTicker(data, ticker) -> relevante Einträge zu einer Aktie
 * App.Catalysts.renderForStock(host, ticker) -> Hinweiskarte in der Aktienansicht
 */
window.App = window.App || {};
window.App.Catalysts = (function () {
  'use strict';

  var cache = null, cacheAt = 0;
  var filter = 'all';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function load() {
    if (cache && Date.now() - cacheAt < 5 * 60 * 1000) return Promise.resolve(cache);
    return window.App.Data.getJsonFile('catalysts.json', { fresh: true }).then(function (d) {
      cache = d && Array.isArray(d.items) ? d : { items: [] };
      cacheAt = Date.now();
      return cache;
    }).catch(function () { return cache || { items: [] }; });
  }

  function daysUntil(date) {
    if (!date) return null;
    var t = new Date(date + 'T00:00:00'), today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((t - today) / 86400000);
  }
  function whenText(it) {
    var d = daysUntil(it.date);
    var ds = it.date ? new Date(it.date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
    if (it.status === 'bevorstehend') {
      if (d === null) return 'bevorstehend, Termin offen';
      return d === 0 ? 'heute' : d === 1 ? 'morgen' : d > 1 ? 'in ' + d + ' Tagen (' + ds + ')' : ds;
    }
    if (it.status === 'beschlossen') return 'beschlossen' + (ds ? ' am ' + ds : '');
    if (it.status === 'vorbei') return 'Termin war am ' + ds;
    return 'laufend';
  }
  var DIR = {
    positiv: { label: '▲ eher positiv', color: 'var(--bullish)' },
    negativ: { label: '▼ eher negativ', color: 'var(--bearish)' },
    unklar: { label: '◆ Richtung unklar', color: 'var(--text-muted)' }
  };
  function isNew(it) { var t = Date.parse(it.firstSeen || ''); return t && Date.now() - t < 30 * 3600 * 1000; }

  /** Einträge, die eine Aktie betreffen (nur aktuelle: bevorstehend, laufend oder vor höchstens 5 Tagen beschlossen). */
  function forTicker(data, ticker) {
    return ((data && data.items) || []).filter(function (it) {
      if ((it.tickers || []).indexOf(ticker) === -1) return false;
      if (it.status === 'vorbei') return false;
      if (it.status === 'beschlossen') { var d = daysUntil(it.date); return d === null || d >= -5; }
      return true;
    });
  }

  function myTickers() {
    var set = {};
    try { (window.App.Data.getWatchlist() || []).forEach(function (t) { set[t] = true; }); } catch (e) {}
    try { if (window.App.Transactions) Object.keys(window.App.Transactions.computePositions()).forEach(function (t) { set[t] = true; }); } catch (e) {}
    return set;
  }

  function card(it, mine) {
    var dir = DIR[it.direction] || DIR.unklar;
    var soon = it.status === 'bevorstehend' && daysUntil(it.date) !== null && daysUntil(it.date) <= 7 && daysUntil(it.date) >= 0;
    var html = '<div class="card" style="padding:12px 14px;margin-bottom:10px;">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">' +
        '<span style="font-size:0.66rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-dim);">' + esc(it.themeTitle || '') + '</span>' +
        (isNew(it) ? '<span style="font-size:0.62rem;font-weight:800;color:#fff;background:var(--accent-purple,#6366f1);border-radius:6px;padding:1px 6px;">NEU</span>' : '') +
      '</div>' +
      '<div style="font-weight:700;font-size:0.92rem;line-height:1.35;margin:4px 0 6px;">' + esc(it.title) + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px 12px;font-size:0.74rem;margin-bottom:6px;">' +
        '<span style="font-weight:700;color:' + (soon ? '#f59e0b' : 'var(--text-muted)') + ';">🗓 ' + esc(whenText(it)) + '</span>' +
        '<span style="font-weight:700;color:' + dir.color + ';">' + dir.label + '</span>' +
      '</div>' +
      (it.why ? '<div style="font-size:0.8rem;color:var(--text-muted);line-height:1.45;">' + esc(it.why) + '</div>' : '');
    if ((it.tickers || []).length) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;">' + it.tickers.map(function (t) {
        return '<button class="chip-btn' + (mine[t] ? ' active' : '') + '" data-cat-t="' + esc(t) + '" style="padding:2px 8px;font-size:0.72rem;">' + esc(t) + '</button>';
      }).join('') + '</div>';
    } else if ((it.sectors || []).length) {
      html += '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:6px;">Betrifft: ' + esc(it.sectors.join(', ')) + '</div>';
    }
    if ((it.sources || []).length) {
      html += '<details style="margin-top:8px;"><summary style="font-size:0.72rem;color:var(--text-dim);cursor:pointer;">Quellen (' + it.sources.length + ')</summary>' +
        it.sources.map(function (s) {
          return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener" style="display:block;font-size:0.74rem;color:var(--text-muted);margin-top:5px;line-height:1.4;text-decoration:none;">' +
            esc(s.title) + ' <span style="color:var(--text-dim);">· ' + esc(s.source || '') + '</span></a>';
        }).join('') + '</details>';
    }
    return html + '</div>';
  }

  function section(title, list, mine) {
    if (!list.length) return '';
    return '<div style="font-size:0.74rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);margin:16px 2px 8px;">' + esc(title) + ' (' + list.length + ')</div>' +
      list.map(function (it) { return card(it, mine); }).join('');
  }

  function render(container, data) {
    var mine = myTickers();
    var items = (data.items || []).slice();
    if (filter === 'mine') items = items.filter(function (it) { return (it.tickers || []).some(function (t) { return mine[t]; }); });
    if (filter === 'positiv' || filter === 'negativ') items = items.filter(function (it) { return it.direction === filter; });

    var upcoming = items.filter(function (it) { return it.status === 'bevorstehend'; }).sort(function (a, b) {
      if (!a.date && !b.date) return 0; if (!a.date) return 1; if (!b.date) return -1; return a.date < b.date ? -1 : 1;
    });
    var decided = items.filter(function (it) { return it.status === 'beschlossen'; }).sort(function (a, b) { return (b.date || b.firstSeen || '') < (a.date || a.firstSeen || '') ? -1 : 1; });
    var running = items.filter(function (it) { return it.status === 'laufend'; });

    var upd = data.updatedAt ? new Date(data.updatedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
    var chip = function (k, l) { return '<button class="chip-btn' + (filter === k ? ' active' : '') + '" data-cat-f="' + k + '" style="flex-shrink:0;">' + l + '</button>'; };
    var html = '<div class="view-container">' +
      '<div class="card" style="padding:14px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
          '<div><div style="font-weight:800;font-size:1.05rem;">Treiber &amp; Termine</div>' +
          '<div style="font-size:0.74rem;color:var(--text-dim);margin-top:2px;">Stand ' + esc(upd) + (data.stale ? ' (älter)' : '') + '</div></div>' +
          '<button class="chip-btn" id="cat-update">↻ Neu</button></div>' +
        '<div style="font-size:0.74rem;color:var(--text-muted);line-height:1.5;margin-top:8px;">Politik, Regulierung, Zölle und Notenbanken aus den Nachrichten, von der KI eingeordnet. ' +
          'Die Richtung ist eine Einschätzung, keine Prognose – oft ist eine erwartete Entscheidung schon im Kurs.</div>' +
        '<div class="horizontal-scroll-row" style="margin-top:10px;gap:6px;">' +
          chip('all', 'Alle') + chip('mine', '★ Meine Werte') + chip('positiv', '▲ positiv') + chip('negativ', '▼ negativ') + '</div>' +
      '</div>';
    if (!items.length) {
      html += '<div class="state-box"><p>' + (filter === 'all' ? 'Noch keine Einträge. Unter ⋯ › Daten-Updates „Treiber & Termine“ starten.' : 'Nichts für diesen Filter.') + '</p></div>';
    }
    html += section('Bevorstehend', upcoming, mine) + section('Gerade beschlossen', decided, mine) + section('Laufend', running, mine);
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('[data-cat-f]').forEach(function (b) {
      b.onclick = function () { filter = b.getAttribute('data-cat-f'); render(container, data); };
    });
    container.querySelectorAll('[data-cat-t]').forEach(function (b) {
      b.onclick = function () { window.App.Router.navigate('/stock/' + b.getAttribute('data-cat-t') + '/overview'); };
    });
    var up = container.querySelector('#cat-update');
    if (up) up.onclick = function () { if (window.App.Sync) window.App.Sync.open({ highlight: 'update_catalysts.yml' }); };
  }

  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;
    container.innerHTML = '<div class="view-container"><div class="state-box"><div class="spinner"></div><p>Lade Treiber &amp; Termine…</p></div></div>';
    cacheAt = 0;
    load().then(function (d) { if (document.body.contains(container)) render(container, d); });
  }

  /** Kleine Karte oben in der Aktienansicht, wenn ein Treiber die Aktie betrifft. */
  function renderForStock(host, ticker) {
    if (!host || !ticker) return;
    load().then(function (d) {
      var list = forTicker(d, ticker);
      if (!list.length || !document.body.contains(host)) return;
      var div = document.createElement('div');
      div.className = 'card';
      div.style.cssText = 'padding:12px 14px;margin-bottom:12px;border-left:3px solid #f59e0b;';
      div.innerHTML = '<div style="font-size:0.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">⚡ Treiber für diese Aktie</div>' +
        list.slice(0, 3).map(function (it) {
          var dir = DIR[it.direction] || DIR.unklar;
          return '<div style="padding:6px 0;border-top:1px solid var(--border);">' +
            '<div style="font-size:0.84rem;font-weight:700;line-height:1.35;">' + esc(it.title) + '</div>' +
            '<div style="font-size:0.74rem;margin-top:2px;"><span style="color:' + dir.color + ';font-weight:700;">' + dir.label + '</span> · <span style="color:var(--text-muted);">' + esc(whenText(it)) + '</span></div>' +
            (it.why ? '<div style="font-size:0.76rem;color:var(--text-muted);margin-top:2px;line-height:1.4;">' + esc(it.why) + '</div>' : '') + '</div>';
        }).join('') +
        '<button class="chip-btn" style="margin-top:8px;padding:2px 9px;font-size:0.72rem;" data-cat-all>Alle Treiber ansehen</button>';
      host.insertBefore(div, host.firstChild);
      div.querySelector('[data-cat-all]').onclick = function () { window.App.Router.navigate('/catalysts'); };
    });
  }

  return { initView: initView, load: load, forTicker: forTicker, renderForStock: renderForStock, whenText: whenText };
})();

/**
 * js/status.js – Datenstatus (Menü ⋯ › Datenstatus, Route #/status)
 *
 * Je Datenquelle: Stand der Datei (aus ihrem Inhalt), erwarteter Rhythmus und – wenn das App-Passwort
 * für die Daten-Updates hinterlegt ist – der letzte GitHub-Lauf mit Ergebnis.
 */
window.App = window.App || {};
window.App.Status = (function () {
  'use strict';

  var SOURCES = [
    { key: 'prices', title: 'Kurse & Kennzahlen', file: 'universe.json', workflow: 'update_data.yml', maxH: 30, weekdays: true,
      rhythm: 'Mo–Fr abends nach Börsenschluss',
      stamp: function (d) { return Array.isArray(d) ? maxIso(d.map(function (u) { return u && u.updatedAt; })) : null; },
      extra: function (d) {
        if (!Array.isArray(d)) return '';
        var newest = Date.parse(maxIso(d.map(function (u) { return u && u.updatedAt; })) || '') || 0;
        if (!newest) return d.length + ' Werte';
        var old = d.filter(function (u) { var t = Date.parse(u && u.updatedAt || ''); return !t || newest - t > 3 * 86400000; }).length;
        return d.length + ' Werte' + (old ? ' · ' + old + ' älter als 3 Tage' : '');
      } },
    { key: 'news', title: 'Nachrichten & Stimmung', file: 'news/_meta.json', workflow: 'update_news.yml', maxH: 8, weekdays: true,
      rhythm: 'Mo–Fr 3× täglich', stamp: function (d) { return d && d.updatedAt; },
      extra: function (d) { return d && d.tickers ? d.tickers + ' Werte' : ''; } },
    { key: 'reddit', title: 'Reddit', file: 'news/_reddit_index.json', workflow: 'fetch_reddit.yml', maxH: 8,
      rhythm: 'alle 6 Stunden',
      stamp: function (d) { return d ? maxIso(Object.keys(d).map(function (k) { return d[k] && d[k].updatedAt; })) : null; },
      extra: function (d) { return d ? Object.keys(d).length + ' Werte erwähnt' : ''; } },
    { key: 'macro', title: 'Makro-Umfeld (Rückfall-Datei)', file: 'macro.json', workflow: 'update_macro.yml', maxH: 30, weekdays: true,
      rhythm: 'Mo–Fr morgens', stamp: function (d) { return d && d.updated; },
      extra: function (d) { return d && d.items ? d.items.length + ' Reihen' + (d.errors && d.errors.length ? ' · ' + d.errors.length + ' Fehler' : '') : ''; } },
    { key: 'catalysts', title: 'Treiber & Termine', file: 'catalysts.json', workflow: 'update_catalysts.yml', maxH: 14,
      rhythm: 'täglich 2×', stamp: function (d) { return d && d.updatedAt; },
      extra: function (d) { return d && d.items ? d.items.length + ' Einträge' + (d.errors && d.errors.length ? ' · ' + d.errors.length + ' Themen fehlgeschlagen' : '') : ''; } },
    { key: 'ai', title: 'KI-Vorschläge', file: 'ai_insights.json', workflow: 'update_ai.yml', maxH: 30, weekdays: true,
      rhythm: 'Di–Sa nachts', stamp: function (d) { return d && d.updatedAt; },
      extra: function (d) { return d && d.pending && d.pending.length ? 'offen: ' + d.pending.join(', ') : (d && d.model ? String(d.model).replace(/(^|, )groq:(openai\/)?/g, '$1Groq ').replace(/(^|, )gemini:/g, '$1') : ''); } }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function maxIso(list) {
    var best = null, bt = 0;
    (list || []).forEach(function (v) { var t = Date.parse(v || ''); if (t && t > bt) { bt = t; best = v; } });
    return best;
  }
  function when(iso) {
    var t = Date.parse(iso || '');
    if (!t) return 'unbekannt';
    var d = new Date(t), now = new Date();
    var hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return 'heute ' + hm;
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'gestern ' + hm;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + hm;
  }

  /** Erlaubtes Alter in Stunden; über das Wochenende bei Werktags-Quellen großzügiger. */
  function allowedHours(src) {
    var day = new Date().getDay();   // 0 = So, 1 = Mo
    if (!src.weekdays) return src.maxH;
    if (day === 0) return src.maxH + 48;
    if (day === 6) return src.maxH + 24;
    if (day === 1) return src.maxH + 72;
    return src.maxH;
  }

  function dot(color) { return '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + color + ';margin-right:8px;flex-shrink:0;"></span>'; }

  function runText(run) {
    if (!run) return '';
    if (run.status === 'queued') return '<span style="color:#f59e0b;">wartet auf Start</span>';
    if (run.status === 'in_progress') return '<span style="color:#f59e0b;">läuft gerade</span>';
    if (run.status === 'none') return 'noch nie gelaufen';
    var ok = run.conclusion === 'success';
    return 'letzter Lauf ' + esc(when(run.updatedAt || run.startedAt)) + ': <span style="color:' + (ok ? 'var(--bullish)' : 'var(--bearish)') + ';">' +
      (ok ? 'erfolgreich' : run.conclusion === 'cancelled' ? 'abgebrochen' : 'fehlgeschlagen') + '</span>';
  }

  function render(container, results, runs, hasKey) {
    var problems = 0;
    var rows = SOURCES.map(function (src, i) {
      var r = results[i];
      var ts = r.data ? src.stamp(r.data) : null;
      var ageH = ts ? (Date.now() - Date.parse(ts)) / 3600000 : null;
      var run = runs && runs[src.workflow];
      var failed = run && run.status === 'completed' && run.conclusion && run.conclusion !== 'success' && run.conclusion !== 'cancelled';
      var color, state;
      if (!r.data) { color = 'var(--bearish)'; state = 'Datei fehlt oder nicht lesbar'; }
      else if (ageH === null) { color = 'var(--text-dim)'; state = 'Stand unbekannt'; }
      else if (ageH > allowedHours(src)) { color = '#f59e0b'; state = 'veraltet'; }
      else { color = 'var(--bullish)'; state = 'aktuell'; }
      if (failed) color = 'var(--bearish)';
      if (color !== 'var(--bullish)') problems++;
      var extra = r.data ? src.extra(r.data) : '';
      return '<div style="padding:12px 0;border-top:1px solid var(--border);">' +
        '<div style="display:flex;align-items:center;">' + dot(color) +
          '<div style="font-weight:700;font-size:0.9rem;flex:1;min-width:0;">' + esc(src.title) + '</div>' +
          '<div style="font-size:0.75rem;color:' + color + ';font-weight:700;">' + esc(state) + '</div></div>' +
        '<div style="font-size:0.76rem;color:var(--text-muted);line-height:1.5;margin:4px 0 0 17px;">' +
          'Datenstand ' + esc(when(ts)) + (extra ? ' · ' + esc(extra) : '') + '<br>' +
          (run ? runText(run) + '<br>' : '') +
          '<span style="color:var(--text-dim);">Rhythmus: ' + esc(src.rhythm) + '</span></div></div>';
    }).join('');

    container.innerHTML = '<div class="view-container">' +
      '<div class="card"><div class="card-header-dotted"><span class="card-title">Datenstatus</span>' +
        '<span class="period-tag">' + (problems ? problems + ' auffällig' : 'alles aktuell') + '</span></div>' +
        rows +
        (hasKey ? '' : '<div style="font-size:0.74rem;color:var(--text-dim);margin-top:10px;line-height:1.5;">Ergebnis der letzten GitHub-Läufe erscheint, sobald unter „Daten-Updates“ das App-Passwort hinterlegt ist.</div>') +
        '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">' +
          '<button class="chip-btn" id="st-reload">↻ Neu prüfen</button>' +
          '<button class="chip-btn" id="st-sync">Daten-Updates öffnen</button></div>' +
      '</div></div>';
    container.querySelector('#st-reload').onclick = function () { initView(); };
    container.querySelector('#st-sync').onclick = function () { if (window.App.Sync) window.App.Sync.open({}); };
  }

  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;
    container.innerHTML = '<div class="view-container"><div class="state-box"><div class="spinner"></div><p>Prüfe Datenstand…</p></div></div>';
    var D = window.App.Data;
    var files = Promise.all(SOURCES.map(function (src) {
      return D.getJsonFile(src.file, { fresh: true }).then(function (d) { return { data: d }; }).catch(function () { return { data: null }; });
    }));
    var runs = window.App.Sync && window.App.Sync.fetchRuns ? window.App.Sync.fetchRuns() : Promise.resolve(null);
    Promise.all([files, runs.catch(function () { return null; })]).then(function (res) {
      if (!document.body.contains(container)) return;
      render(container, res[0], res[1], !!(window.App.Sync && window.App.Sync.hasKey && window.App.Sync.hasKey()));
    });
  }

  return { initView: initView };
})();

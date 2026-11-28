/**
 * js/sync.js
 * "Daten-Updates": GitHub-Workflows aus der App starten und ihren Stand sehen.
 * Läuft über den Cloudflare Worker (/gh/status, /gh/dispatch). Der GitHub-Schlüssel liegt nur im Worker,
 * die App schickt lediglich das selbst gewählte App-Passwort mit (lokal auf diesem Gerät gespeichert).
 */
window.App = window.App || {};

window.App.Sync = (function () {
  'use strict';

  var WORKER = 'https://yahoo-proxy.spamispam018.workers.dev';
  var KEY_STORE = 'app_gh_key';
  var POLL_MS = 10000;

  var JOBS = [
    { file: 'update_data.yml', title: 'Kurse & Kennzahlen', desc: 'Alle Aktien neu abrufen (Delta). Dauert meist 10–30 Minuten. Danach startet die KI-Auswertung nicht automatisch.', inputs: { sync_mode: 'delta' } },
    { file: 'update_news.yml', title: 'Nachrichten & Stimmung', desc: 'Schlagzeilen aller Aktien mit FinBERT-Bewertung (für Screener-Filter und Farbpunkte).' },
    { file: 'update_catalysts.yml', title: 'Treiber & Termine', desc: 'Nachrichten zu Politik, Zöllen, Regulierung und Notenbanken sammeln und von der KI einordnen lassen. Dauert 2–5 Minuten.' },
    { file: 'update_ai.yml', title: 'KI-Vorschläge', desc: 'Sektoren und Top 10 neu auswerten. Dauert einige Minuten.' },
    { file: 'update_macro.yml', title: 'Makro (GitHub-Kopie)', desc: 'Rückfall-Datei für das Makro-Umfeld. Live-Daten holt die App ohnehin über ↻.' },
    { file: 'fetch_reddit.yml', title: 'Reddit (GitHub-Kopie)', desc: 'Rückfall-Datei und Grundlage für die KI-Auswertung.' },
    { file: 'update_de_symbols.yml', title: 'Deutsche Börsenkürzel', desc: 'Ordnet Aktien ihre Xetra-Kürzel zu. Selten nötig.' }
  ];

  var state = { runs: {}, error: '', checkedAt: null, opts: {}, timer: null, busy: {} };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function UI() { return window.App.UI; }

  function getKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
  function setKey(v) { try { if (v) localStorage.setItem(KEY_STORE, v); else localStorage.removeItem(KEY_STORE); } catch (e) {} }

  function api(path, body) {
    return fetch(WORKER + path, {
      method: body ? 'POST' : 'GET',
      headers: Object.assign({ 'X-App-Key': getKey() }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; });
    });
  }

  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var t = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? 'heute ' + t : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + t;
  }

  function statusLine(run) {
    if (!run) return { text: 'Stand unbekannt', color: 'var(--text-dim)', running: false };
    if (run.error) return { text: 'Status nicht abrufbar (' + run.error + ')', color: 'var(--text-dim)', running: false };
    if (run.status === 'none') return { text: 'Noch nie gelaufen', color: 'var(--text-dim)', running: false };
    if (run.status === 'queued') return { text: 'Wartet auf Start … (' + when(run.startedAt) + ')', color: '#f59e0b', running: true };
    if (run.status === 'in_progress') return { text: 'Läuft seit ' + when(run.startedAt), color: '#f59e0b', running: true };
    var how = run.event === 'schedule' ? 'automatisch' : run.event === 'workflow_dispatch' ? 'manuell' : 'nach Datenlauf';
    if (run.conclusion === 'success') return { text: 'Erfolgreich · ' + when(run.updatedAt) + ' · ' + how, color: 'var(--bullish)', running: false };
    if (run.conclusion === 'cancelled') return { text: 'Abgebrochen · ' + when(run.updatedAt), color: 'var(--text-dim)', running: false };
    return { text: 'Fehlgeschlagen · ' + when(run.updatedAt) + ' · ' + how, color: 'var(--bearish)', running: false };
  }

  function jobRow(job, extra) {
    var run = state.runs[job.file];
    var st = statusLine(run);
    var busy = state.busy[job.key || job.file];
    var disabled = st.running || busy;
    return '<div class="sync-row">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:700;font-size:0.92rem;">' + esc(job.title) + '</div>' +
        '<div style="font-size:0.72rem;color:var(--text-muted);line-height:1.4;margin-top:2px;">' + esc(job.desc) + '</div>' +
        '<div style="font-size:0.72rem;margin-top:4px;color:' + st.color + ';display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
          (st.running ? '<span class="sync-dot"></span>' : '') + esc(st.text) +
          (run && run.url ? ' <a href="' + esc(run.url) + '" target="_blank" rel="noopener" style="color:var(--accent-purple-light);">Protokoll</a>' : '') +
        '</div>' +
      '</div>' +
      '<button type="button" class="ui-btn ui-btn-small' + (extra ? ' ui-btn-primary' : '') + '" data-sync-start="' + esc(job.key || job.file) + '"' + (disabled ? ' disabled' : '') + ' style="align-self:center;">' +
        (busy ? 'Startet…' : st.running ? 'Läuft' : 'Starten') + '</button>' +
    '</div>';
  }

  function allJobs() {
    var list = [];
    if (state.opts.ticker) {
      list.push({ key: 'ticker', file: 'update_data.yml', title: 'Nur ' + state.opts.ticker + ' neu laden', desc: 'Kurse, Kennzahlen, Analysten und Insider dieser Aktie. Dauert 1–3 Minuten.', inputs: { sync_mode: 'delta', ticker: state.opts.ticker }, highlight: true });
    }
    JOBS.forEach(function (j) { list.push(j); });
    if (state.opts.highlight) {
      list.sort(function (a, b) { return (b.file === state.opts.highlight) - (a.file === state.opts.highlight); });
    }
    return list;
  }

  function keyFormHtml(msg) {
    return '<div class="ui-sheet-sub" style="margin-bottom:10px;">' + (msg ? '<span style="color:var(--bearish);">' + esc(msg) + '</span><br>' : '') +
      'Zum Starten brauchst du das App-Passwort, das du im Cloudflare Worker als <b>APP_PASSWORD</b> hinterlegt hast. Es wird nur auf diesem Gerät gespeichert.</div>' +
      '<form class="ui-inline-form" id="sync-key-form" style="margin-top:0;">' +
        '<input class="ui-input" id="sync-key" type="password" autocomplete="current-password" placeholder="App-Passwort" aria-label="App-Passwort">' +
        '<button class="ui-btn ui-btn-small ui-btn-primary" type="submit">Speichern</button>' +
      '</form>';
  }

  /**
   * Das Sheet-Element teilen sich alle Dialoge der App. Die Hintergrund-Abfrage darf es nur
   * neu zeichnen, solange es gerade die Daten-Updates zeigt – sonst würde sie z. B. die
   * KI-Einschätzung überschreiben.
   */
  function showsSync(root) {
    return !!(root && root.classList.contains('open') && root.querySelector('[data-sync-sheet]'));
  }

  function render(root) {
    if (!showsSync(root) && !state.firstRender) return;
    state.firstRender = false;
    var html = '<h3 class="ui-sheet-title" data-sync-sheet>Daten-Updates</h3>';
    if (!getKey()) {
      html += keyFormHtml(state.authError);
    } else if (state.setupError) {
      html += '<div class="ui-sheet-sub" style="color:var(--bearish);">' + esc(state.setupError) + '</div>';
    } else {
      html += '<div class="ui-sheet-sub">Startet die GitHub-Workflows deines Repos. Neue Daten sind etwa 1–2 Minuten nach Ende eines Laufs in der App.' +
        (state.checkedAt ? ' Stand ' + esc(when(state.checkedAt)) + '.' : '') + '</div>';
      if (state.error) html += '<div class="ui-hint" style="margin:-6px 0 8px;">' + esc(state.error) + '</div>';
      html += allJobs().map(function (j) { return jobRow(j, j.highlight || j.file === state.opts.highlight); }).join('');
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">' +
        '<button type="button" class="ui-btn ui-btn-small" id="sync-refresh">Status neu laden</button>' +
        '<button type="button" class="ui-btn ui-btn-small" id="sync-forget" style="border-color:transparent;color:var(--text-dim);">Passwort vergessen</button>' +
      '</div>';
    }
    root.innerHTML = '<div class="sheet-handle"></div>' + html;
    bind(root);
  }

  function bind(root) {
    var form = root.querySelector('#sync-key-form');
    if (form) form.onsubmit = function (e) {
      e.preventDefault();
      var v = (root.querySelector('#sync-key').value || '').trim();
      if (!v) return;
      setKey(v);
      state.authError = '';
      refresh(root);
    };
    var rf = root.querySelector('#sync-refresh');
    if (rf) rf.onclick = function () { refresh(root); };
    var fg = root.querySelector('#sync-forget');
    if (fg) fg.onclick = function () { setKey(''); state.runs = {}; render(root); };
    root.querySelectorAll('[data-sync-start]').forEach(function (btn) {
      btn.onclick = function () {
        var key = btn.getAttribute('data-sync-start');
        var job = allJobs().filter(function (j) { return (j.key || j.file) === key; })[0];
        if (job) start(root, job);
      };
    });
  }

  function handleAuth(res, root) {
    if (res.__status === 401) { setKey(''); state.authError = 'Das Passwort war falsch.'; render(root); return true; }
    if (res.__status === 503 && res.setup) { state.setupError = res.error; render(root); return true; }
    return false;
  }

  function refresh(root) {
    if (!getKey()) { render(root); return Promise.resolve(); }
    state.error = '';
    return api('/gh/status').then(function (res) {
      if (handleAuth(res, root)) return;
      if (res.__status !== 200) { state.error = res.error || 'Status nicht abrufbar.'; render(root); return; }
      notifyDone(state.runs, res.runs || {});
      state.runs = res.runs || {};
      state.checkedAt = res.checkedAt;
      state.setupError = '';
      render(root);
      schedulePoll(root);
    }).catch(function () {
      state.error = 'Worker nicht erreichbar.';
      render(root);
    });
  }

  function isRunning(r) { return r && (r.status === 'queued' || r.status === 'in_progress'); }

  /** Meldet fertige Läufe an die App (Event "app:workflow-done", detail.file / detail.success). */
  function notifyDone(oldRuns, newRuns) {
    Object.keys(newRuns).forEach(function (f) {
      var before = oldRuns[f], now = newRuns[f];
      if (isRunning(before) && now && !isRunning(now) && now.status === 'completed') {
        try { window.dispatchEvent(new CustomEvent('app:workflow-done', { detail: { file: f, success: now.conclusion === 'success' } })); } catch (e) {}
      }
    });
  }

  // Läuft ein Workflow, wird auch bei geschlossenem Sheet weiter abgefragt (höchstens 45 Min.),
  // damit z. B. die KI-Seite nach dem Lauf von selbst neu lädt.
  function schedulePoll(root) {
    clearTimeout(state.timer);
    var anyRunning = Object.keys(state.runs).some(function (k) { return isRunning(state.runs[k]); });
    if (!anyRunning) { state.pollSince = 0; return; }
    if (!state.pollSince) state.pollSince = Date.now();
    if (Date.now() - state.pollSince > 45 * 60 * 1000) { state.pollSince = 0; return; }
    state.timer = setTimeout(function () { refresh(root); }, POLL_MS);
  }

  function start(root, job) {
    var key = job.key || job.file;
    state.busy[key] = true;
    render(root);
    api('/gh/dispatch', { workflow: job.file, inputs: job.inputs || {} }).then(function (res) {
      state.busy[key] = false;
      if (handleAuth(res, root)) return;
      if (res.ok) {
        UI().toast(job.title + ': gestartet');
        // GitHub braucht ein paar Sekunden, bis der Lauf sichtbar ist
        state.runs[job.file] = { status: 'queued', startedAt: new Date().toISOString() };
        render(root);
        setTimeout(function () { refresh(root); }, 5000);
      } else {
        state.error = res.running ? job.title + ' läuft bereits.' : (res.error || 'Start fehlgeschlagen.');
        if (res.run) state.runs[job.file] = res.run;
        render(root);
      }
    }).catch(function () {
      state.busy[key] = false;
      state.error = 'Worker nicht erreichbar.';
      render(root);
    });
  }

  /**
   * Öffnet das Sheet. opts.ticker: zusätzlich "Nur diese Aktie neu laden",
   * opts.highlight: Workflow-Datei, die oben und hervorgehoben stehen soll.
   */
  function open(opts) {
    state.opts = opts || {};
    state.error = '';
    UI().openSheet('', function (root) {
      state.firstRender = true;     // Sheet ist gerade leer geöffnet worden
      render(root);
      refresh(root);
    }, function () { /* Abfrage läuft weiter, solange ein Workflow läuft */ });
  }

  /** Letzte Läufe aller Workflows (für die Statusseite); null ohne App-Passwort. */
  function fetchRuns() {
    if (!getKey()) return Promise.resolve(null);
    return api('/gh/status').then(function (res) { return res.__status === 200 ? (res.runs || {}) : null; });
  }

  return { open: open, fetchRuns: fetchRuns, hasKey: function () { return !!getKey(); } };
})();

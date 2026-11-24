/**
 * js/strategy-scanner.js – Strategie-Scanner.
 * Testet EINE gewählte Strategie (mit festen Parametern, ohne Optimierung je Aktie) für viele Aktien
 * auf deren Langhistorie und zeigt je Aktie: Signal heute, Rendite/Sharpe/Drawdown gegenüber Buy & Hold.
 * Zusammenfassung oben: Bei wie vielen Aktien schlägt die Regel Buy & Hold – eine Regel, die breit wirkt,
 * ist glaubwürdiger als ein Einzeltreffer.
 */
window.App = window.App || {};
window.App.StrategyScanner = (function () {
  'use strict';

  var FEE = 0.001;      // 0,1 % je Kauf/Verkauf
  var CONCURRENCY = 6;  // gleichzeitige Ladevorgänge
  var MAX_ROWS = 60;

  var PERIODS = [
    { key: '3Y', years: 3, label: '3 Jahre' },
    { key: '5Y', years: 5, label: '5 Jahre' },
    { key: '10Y', years: 10, label: '10 Jahre / Max.' }
  ];
  var SELECTIONS = [
    { key: 'watch', label: 'Meine Watchlist' },
    { key: 'top30', label: 'Top 30 nach Börsenwert' },
    { key: 'top80', label: 'Top 80 nach Börsenwert' },
    { key: 'all', label: 'Alle Aktien des Universums' }
  ];

  var state = {
    type: 'sma_cross', params: {}, period: '5Y', selection: 'top30', sort: 'signal', onlyLong: false,
    collapsed: false, token: 0, results: null, meta: null,
    mode: 'one',                       // 'one' = eine Strategie, 'all' = alle Strategien je Aktie
    allRows: null, allMeta: null, allSort: 'beats', minBuys: 0, minBeats: 0, openTab: 'live',
    hists: {}, deep: {}
  };

  var Q = function () { return window.App.Quant; };
  var F = function () { return window.App.Format; };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function num(v, d) { return (v == null || !isFinite(v)) ? '—' : F().number(v, d == null ? 2 : d); }
  function pct(v, d, signed) { return (v == null || !isFinite(v)) ? '—' : (signed && v > 0 ? '+' : '') + F().number(v, d == null ? 1 : d) + ' %'; }
  function tone(v) { return v == null || !isFinite(v) ? '' : v >= 0 ? 'var(--bullish)' : 'var(--bearish)'; }
  function median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; }), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  var HELP = [
    ['Wofür ist der Scanner?', 'Er prüft, ob eine Handelsregel <strong>bei vielen Aktien</strong> funktioniert hätte – nicht nur bei einer, die du zufällig kennst. Oben siehst du, bei wie vielen Aktien die Regel Buy &amp; Hold bei Rendite, Sharpe und Drawdown geschlagen hätte. Darunter steht je Aktie, was die Regel <strong>heute</strong> sagt (investiert oder Cash).'],
    ['Was er nicht tut', 'Er wählt keine Aktien nach Qualität oder Bewertung aus – das macht der Screener. Es werden feste Parameter genutzt (keine Optimierung je Aktie), damit die Ergebnisse nicht auf die Vergangenheit zurechtgebogen sind. Er ist keine Kaufempfehlung: „Signal heute“ ist nur das Ergebnis der Regel am letzten Kurs.'],
    ['So liest du das Ergebnis', 'Schlägt die Regel bei deutlich mehr als der Hälfte der Aktien Buy &amp; Hold, ist das ein stärkeres Indiz als ein einzelner Treffer. Bei starken Dauergewinnern verliert Timing meist bei der Rendite, gewinnt aber oft beim Drawdown. Wähle deshalb auch die Spalte Drawdown.'],
    ['Modus „Alle Strategien“', 'Je Aktie werden alle 13 Strategien mit ihren Standardwerten getestet. Du siehst, bei wie vielen jetzt ein Kaufsignal besteht und bei wie vielen die Strategie im Zeitraum Buy &amp; Hold geschlagen hat. Viele Strategien messen im Kern Trend: „viele Kaufsignale“ heißt oft nur „die Aktie steigt gerade“. Aussagekräftiger ist die Spalte „schlagen Buy &amp; Hold“. Mit „Gründlich prüfen“ werden für die besten Treffer zusätzlich je Strategie optimierte Werte gesucht und auf einem Testzeitraum geprüft („bewährt“).'],
    ['Grenzen der Daten', 'Es werden die Wochen-Langhistorien genutzt (Zeit-Parameter in Tagen werden in Wochen umgerechnet). Das Universum enthält nur Aktien, die es heute noch gibt (Auswahlverzerrung), Dividenden und Steuern fehlen. Aktien ohne ausreichend lange Historie werden übersprungen und gezählt.']
  ];

  /* ---------- Rendering ---------- */
  /**
   * Hängt die Scanner-Karte in `slot`.
   * opts.startCollapsed: Karte eingeklappt starten; opts.type / opts.params: Strategie und Parameter vorbelegen.
   */
  function mount(slot, opts) {
    if (!slot) return;
    opts = opts || {};
    var q = Q();
    if (opts.startCollapsed != null) state.collapsed = !!opts.startCollapsed;
    if (opts.type && q.STRATEGIES[opts.type] && opts.type !== 'buyhold') {
      state.type = opts.type;
      Object.keys(opts.params || {}).forEach(function (k) { state.params[opts.type + '.' + k] = opts.params[k]; });
    }
    var types = Object.keys(q.STRATEGIES).filter(function (k) { return k !== 'buyhold'; });
    var stratOpts = types.map(function (k) { return '<option value="' + k + '"' + (k === state.type ? ' selected' : '') + '>' + esc(q.STRATEGIES[k].label) + '</option>'; }).join('');
    var selOpts = SELECTIONS.map(function (s) { return '<option value="' + s.key + '"' + (s.key === state.selection ? ' selected' : '') + '>' + s.label + '</option>'; }).join('');
    var perOpts = PERIODS.map(function (p) { return '<option value="' + p.key + '"' + (p.key === state.period ? ' selected' : '') + '>' + p.label + '</option>'; }).join('');

    slot.innerHTML =
      '<div class="card" id="scan-card">' +
        '<div class="card-header-dotted"><span class="card-title">Strategie-Scanner</span>' +
          '<span style="display:flex;align-items:center;gap:8px;"><span class="period-tag">Signal heute</span>' +
          '<button type="button" class="chip-btn" id="scan-collapse" style="height:28px;padding:0 10px;font-size:0.72rem;"></button></span></div>' +
        '<div id="scan-body">' +
          '<div style="font-size:0.78rem;color:var(--text-dim);line-height:1.5;margin-bottom:12px;">Prüft eine Regel bei vielen Aktien auf einmal: Wie hat sie gegenüber Buy &amp; Hold abgeschnitten – und was sagt sie heute?</div>' +
          '<div style="display:flex;flex-direction:column;gap:10px;">' +
            '<div class="horizontal-scroll-row" style="margin-bottom:0;padding-bottom:0;"><span style="font-size:0.72rem;color:var(--text-dim);align-self:center;white-space:nowrap;">Modus:</span>' +
              '<button type="button" class="chip-btn" data-scan-mode="one">Eine Strategie</button><button type="button" class="chip-btn" data-scan-mode="all">Alle Strategien</button></div>' +
            '<div id="scan-single" style="display:flex;flex-direction:column;gap:10px;">' +
            '<div><label for="scan-type" style="font-size:0.72rem;color:var(--text-dim);">Strategie</label>' +
              '<select id="scan-type" class="sort-select" style="width:100%;margin-top:4px;">' + stratOpts + '</select>' +
              '<div id="scan-desc" style="font-size:0.72rem;color:var(--text-dim);margin-top:6px;line-height:1.4;"></div></div>' +
            '<div id="scan-params" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;"></div></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
              '<div><label for="scan-sel" style="font-size:0.72rem;color:var(--text-dim);">Aktien</label><select id="scan-sel" class="sort-select" style="width:100%;margin-top:4px;">' + selOpts + '</select></div>' +
              '<div><label for="scan-per" style="font-size:0.72rem;color:var(--text-dim);">Zeitraum</label><select id="scan-per" class="sort-select" style="width:100%;margin-top:4px;">' + perOpts + '</select></div>' +
            '</div>' +
            '<button class="chip-btn active" id="scan-run" style="height:42px;justify-content:center;">Scannen</button>' +
          '</div>' +
          '<div id="scan-out" style="margin-top:14px;"></div>' +
          '<details style="margin-top:12px;"><summary style="font-size:0.78rem;font-weight:700;cursor:pointer;">So funktioniert der Scanner</summary><div style="margin-top:10px;">' +
            HELP.map(function (h) { return '<div style="margin-bottom:10px;"><div style="font-weight:700;font-size:0.78rem;">' + h[0] + '</div><div style="font-size:0.74rem;color:var(--text-dim);line-height:1.55;margin-top:2px;">' + h[1] + '</div></div>'; }).join('') +
          '</div></details>' +
        '</div>' +
      '</div>';

    var body = slot.querySelector('#scan-body'), colBtn = slot.querySelector('#scan-collapse');
    function applyCollapse() {
      body.style.display = state.collapsed ? 'none' : '';
      colBtn.textContent = state.collapsed ? 'Aufklappen ▾' : 'Einklappen ▴';
      colBtn.setAttribute('aria-expanded', state.collapsed ? 'false' : 'true');
    }
    colBtn.onclick = function () { state.collapsed = !state.collapsed; applyCollapse(); };
    applyCollapse();

    function curParams() {
      var def = q.STRATEGIES[state.type], o = {};
      def.params.forEach(function (p) {
        var raw = state.params[state.type + '.' + p.key];
        var v = raw == null || raw === '' ? p.def : Number(raw);
        if (!isFinite(v)) v = p.def;
        v = Math.min(p.max, Math.max(p.min, p.float ? Math.round(v * 100) / 100 : Math.round(v)));
        o[p.key] = v;
      });
      return o;
    }
    function drawParams() {
      var def = q.STRATEGIES[state.type], cur = curParams();
      slot.querySelector('#scan-desc').textContent = def.desc;
      slot.querySelector('#scan-params').innerHTML = def.params.map(function (p) {
        return '<div><label for="scan-p-' + p.key + '" style="font-size:0.72rem;color:var(--text-dim);">' + esc(p.label) + '</label>' +
          '<input id="scan-p-' + p.key + '" data-pkey="' + p.key + '" class="search-input" type="number" min="' + p.min + '" max="' + p.max + '" step="' + (p.step || 1) + '" inputmode="decimal" value="' + cur[p.key] + '" style="width:100%;margin-top:4px;padding-left:12px;"></div>';
      }).join('');
      slot.querySelectorAll('#scan-params input').forEach(function (inp) {
        inp.oninput = function () { state.params[state.type + '.' + inp.getAttribute('data-pkey')] = inp.value; };
      });
    }
    drawParams();
    slot.querySelector('#scan-type').onchange = function (e) { state.type = e.target.value; drawParams(); };
    slot.querySelector('#scan-sel').onchange = function (e) { state.selection = e.target.value; };
    slot.querySelector('#scan-per').onchange = function (e) { state.period = e.target.value; };
    function applyMode() {
      slot.querySelector('#scan-single').style.display = state.mode === 'one' ? 'flex' : 'none';
      slot.querySelectorAll('[data-scan-mode]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-scan-mode') === state.mode); });
      var o = slot.querySelector('#scan-out');
      if (state.mode === 'all') { if (state.allRows) drawAll(o); else o.innerHTML = ''; }
      else if (state.results) drawResults(o); else o.innerHTML = '';
    }
    slot.querySelectorAll('[data-scan-mode]').forEach(function (b) {
      b.onclick = function () { state.token++; state.mode = b.getAttribute('data-scan-mode'); applyMode(); };
    });
    slot.querySelector('#scan-run').onclick = function () { if (state.mode === 'all') runAll(slot); else run(slot, curParams()); };
    applyMode();
  }

  /* ---------- Aktienauswahl und Laden ---------- */
  function pickTickers(universe) {
    var D = window.App.Data, list = universe.slice();
    if (state.selection === 'watch') {
      var w = (D.getWatchlist ? D.getWatchlist() : []).map(function (t) { return String(t).toUpperCase(); });
      var byT = {};
      universe.forEach(function (u) { byT[String(u.ticker).toUpperCase()] = u; });
      return w.map(function (t) { return byT[t] || { ticker: t, name: t, sector: '' }; });
    }
    list = list.filter(function (s) { return s && s.ticker; });
    list.sort(function (a, b) { return (Number(b.marketCap) || 0) - (Number(a.marketCap) || 0); });
    if (state.selection === 'top30') return list.slice(0, 30);
    if (state.selection === 'top80') return list.slice(0, 80);
    return list;
  }

  function loadAll(items, onProgress, token) {
    var D = window.App.Data, results = new Array(items.length), next = 0, done = 0;
    return new Promise(function (resolve) {
      function worker() {
        if (token !== state.token) { resolve(null); return; }
        var i = next++;
        if (i >= items.length) { if (done >= items.length) resolve(results); return; }
        D.getLongHistory(items[i].ticker).then(function (h) { return h || []; }, function () { return []; }).then(function (h) {
          results[i] = h; done++; onProgress(done, items.length);
          if (done >= items.length) resolve(results); else worker();
        });
      }
      if (!items.length) resolve(results);
      for (var k = 0; k < Math.min(CONCURRENCY, items.length); k++) worker();
    });
  }

  function run(slot, params) {
    var q = Q(), out = slot.querySelector('#scan-out');
    var problem = q.validateParams(state.type, params);
    if (problem) { out.innerHTML = '<div class="state-box"><p>' + esc(problem) + '</p></div>'; return; }
    var token = ++state.token;
    var per = PERIODS.filter(function (p) { return p.key === state.period; })[0];
    out.innerHTML = '<div class="state-box"><div class="spinner"></div><p id="scan-prog">Lade Universum…</p>' +
      '<button class="chip-btn" id="scan-cancel" style="margin-top:8px;">Abbrechen</button></div>';
    out.querySelector('#scan-cancel').onclick = function () { state.token++; out.innerHTML = '<div style="font-size:0.8rem;color:var(--text-dim);">Scan abgebrochen.</div>'; };

    window.App.Data.getUniverse().then(function (universe) {
      var items = pickTickers(universe || []);
      if (!items.length) { out.innerHTML = '<div class="state-box"><p>' + (state.selection === 'watch' ? 'Deine Watchlist ist leer.' : 'Keine Aktien im Universum.') + '</p></div>'; return; }
      return loadAll(items, function (d, n) {
        var el = out.querySelector('#scan-prog'); if (el) el.textContent = 'Lade Kurse ' + d + ' / ' + n + '…';
      }, token).then(function (hists) {
        if (!hists || token !== state.token) return;
        var rows = [], skipped = 0;
        items.forEach(function (it, i) {
          var hist = q.cleanHistory(hists[i]);
          var span = q.spanYears(hist);
          if (hist.length < 100 || span < per.years * 0.9 - 0.05) { skipped++; return; }
          var h = q.sliceYears(hist, per.years);
          var r = q.backtest(h, state.type, params, FEE);
          if (r.error) { skipped++; return; }
          var s = r.stats, b = r.bhStats;
          rows.push({
            ticker: it.ticker, name: it.name || '', sector: it.sector || '',
            signal: r.pendingSignal, total: s.totalReturn, bh: b.totalReturn, excess: s.totalReturn - b.totalReturn,
            sharpe: s.sharpe, bhSharpe: b.sharpe, dd: s.maxDD, bhDD: b.maxDD, trades: s.trades, exposure: s.exposure, cagr: s.cagr
          });
        });
        state.results = rows;
        state.meta = { total: items.length, skipped: skipped, label: q.STRATEGIES[state.type].label, per: per, type: state.type, params: params, ppy: rows.length ? null : null };
        drawResults(out);
      });
    }).catch(function (err) {
      out.innerHTML = '<div class="state-box"><p>Scan fehlgeschlagen: ' + esc(err && err.message) + '</p></div>';
    });
  }

  /* ---------- Modus „Alle Strategien“ ---------- */
  function strategyTypes() { return Object.keys(Q().STRATEGIES).filter(function (k) { return k !== 'buyhold'; }); }

  function runAll(slot) {
    var q = Q(), out = slot.querySelector('#scan-out');
    var token = ++state.token;
    var per = PERIODS.filter(function (p) { return p.key === state.period; })[0];
    var types = strategyTypes();
    out.innerHTML = '<div class="state-box"><div class="spinner"></div><p id="scan-prog">Lade Universum…</p>' +
      '<button class="chip-btn" id="scan-cancel" style="margin-top:8px;">Abbrechen</button></div>';
    out.querySelector('#scan-cancel').onclick = function () { state.token++; out.innerHTML = '<div style="font-size:0.8rem;color:var(--text-dim);">Scan abgebrochen.</div>'; };

    window.App.Data.getUniverse().then(function (universe) {
      var items = pickTickers(universe || []);
      if (!items.length) { out.innerHTML = '<div class="state-box"><p>' + (state.selection === 'watch' ? 'Deine Watchlist ist leer.' : 'Keine Aktien im Universum.') + '</p></div>'; return; }
      return loadAll(items, function (d, n) {
        var el = out.querySelector('#scan-prog'); if (el) el.textContent = 'Lade Kurse ' + d + ' / ' + n + '…';
      }, token).then(function (hists) {
        if (!hists || token !== state.token) return;
        var rows = [], skipped = 0, i = 0;
        state.hists = {}; state.deep = {};
        function chunk() {
          if (token !== state.token) return;
          var stop = Math.min(items.length, i + 8);
          for (; i < stop; i++) {
            var it = items[i], hist = q.cleanHistory(hists[i]);
            if (hist.length < 100 || q.spanYears(hist) < per.years * 0.9 - 0.05) { skipped++; continue; }
            state.hists[it.ticker] = hist;
            var h = q.sliceYears(hist, per.years), strat = [], buys = 0, beats = 0;
            types.forEach(function (k) {
              var r = q.backtest(h, k, q.defaultParams(k), FEE);
              if (r.error) return;
              var long = r.pendingSignal === 'long', beat = r.stats.totalReturn > r.bhStats.totalReturn;
              if (long) buys++; if (beat) beats++;
              strat.push({ type: k, long: long, beat: beat });
            });
            if (strat.length) rows.push({ ticker: it.ticker, name: it.name || '', sector: it.sector || '', buys: buys, beats: beats, total: strat.length, strat: strat });
            else skipped++;
          }
          if (i < items.length) {
            var el = out.querySelector('#scan-prog'); if (el) el.textContent = 'Teste Strategien ' + i + ' / ' + items.length + '…';
            setTimeout(chunk, 0);
          } else {
            state.allRows = rows;
            state.allMeta = { total: items.length, skipped: skipped, per: per, types: types };
            drawAll(out);
          }
        }
        chunk();
      });
    }).catch(function (err) {
      out.innerHTML = '<div class="state-box"><p>Scan fehlgeschlagen: ' + esc(err && err.message) + '</p></div>';
    });
  }

  function filteredAll() {
    var rows = state.allRows.filter(function (r) { return r.buys >= state.minBuys && r.beats >= state.minBeats; });
    var dv = function (r) { var d = state.deep[r.ticker]; return d && !d.error ? d.buys : -1; };
    rows.sort(function (a, b) {
      if (state.allSort === 'buys') return (b.buys - a.buys) || (b.beats - a.beats);
      if (state.allSort === 'deep') return (dv(b) - dv(a)) || (b.beats - a.beats) || (b.buys - a.buys);
      return (b.beats - a.beats) || (b.buys - a.buys);
    });
    return rows;
  }

  function dots(r, names) {
    return '<div style="display:flex;gap:3px;margin-top:4px;flex-wrap:nowrap;">' + r.strat.map(function (x) {
      return '<span title="' + esc(names[x.type] + ': ' + (x.long ? 'Kaufsignal' : 'Cash') + (x.beat ? ', schlug Buy & Hold' : ', schlug Buy & Hold nicht')) + '" style="display:inline-block;width:9px;height:9px;border-radius:2px;box-sizing:border-box;background:' + (x.long ? 'var(--bullish)' : 'var(--bg-tertiary)') + ';border:2px solid ' + (x.beat ? '#f59e0b' : 'transparent') + ';"></span>';
    }).join('') + '</div>';
  }

  function drawAll(out) {
    var q = Q(), rows = state.allRows, meta = state.allMeta;
    if (!rows || !meta) return;
    if (!rows.length) { out.innerHTML = '<div class="state-box"><p>Keine Aktie hat genug Kurshistorie für ' + esc(meta.per.label) + ' (' + meta.skipped + ' übersprungen).</p></div>'; return; }
    var n = rows.length, nt = meta.types.length;
    var names = {}; meta.types.forEach(function (k) { names[k] = q.STRATEGIES[k].label; });
    var list = filteredAll(), shown = list.slice(0, MAX_ROWS);
    var avgBeat = rows.reduce(function (a, r) { return a + r.beats; }, 0) / n;
    var hasDeep = Object.keys(state.deep).length > 0;
    var chip = function (k, label) { return '<button class="chip-btn ' + (state.allSort === k ? 'active' : '') + '" data-all-sort="' + k + '">' + label + '</button>'; };
    var opts = function (id, cur, label) {
      var o = ''; for (var v = 0; v <= nt; v++) o += '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + (v === 0 ? 'egal' : 'mind. ' + v) + '</option>';
      return '<div><label for="' + id + '" style="font-size:0.72rem;color:var(--text-dim);">' + label + '</label><select id="' + id + '" class="sort-select" style="width:100%;margin-top:4px;">' + o + '</select></div>';
    };
    var html = '' +
      '<div style="padding:10px 12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:0.8rem;line-height:1.55;margin-bottom:12px;">' +
        '<strong>Alle ' + nt + ' Strategien</strong> (Standardwerte) · ' + esc(meta.per.label) + ' · ' + n + ' Aktien getestet' + (meta.skipped ? ' <span style="color:var(--text-dim);">(' + meta.skipped + ' ohne ausreichende Historie übersprungen)</span>' : '') + '.<br>' +
        'Im Durchschnitt schlagen <strong>' + F().number(avgBeat, 1) + ' von ' + nt + '</strong> Strategien Buy &amp; Hold. ' +
        'Das ist der Vergleichswert: Aktien deutlich darüber fallen auf, sind aber kein Beleg für die Zukunft.' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">' + opts('all-min-buys', state.minBuys, 'Kaufsignale heute') + opts('all-min-beats', state.minBeats, 'Schlagen Buy &amp; Hold') + '</div>' +
      '<div class="horizontal-scroll-row" style="margin-bottom:8px;"><span style="font-size:0.72rem;color:var(--text-dim);align-self:center;white-space:nowrap;">Sortieren:</span>' +
        chip('beats', 'Schlagen B&amp;H') + chip('buys', 'Kaufsignale') + (hasDeep ? chip('deep', 'Bewährt + Kauf') : '') + '</div>' +
      '<div class="horizontal-scroll-row" style="margin-bottom:8px;"><span style="font-size:0.72rem;color:var(--text-dim);align-self:center;white-space:nowrap;">Zeile öffnet:</span>' +
        '<button class="chip-btn ' + (state.openTab === 'live' ? 'active' : '') + '" data-all-open="live">Live-Signale</button><button class="chip-btn ' + (state.openTab === 'strategy' ? 'active' : '') + '" data-all-open="strategy">Backtest</button></div>' +
      '<div style="font-size:0.7rem;color:var(--text-dim);line-height:1.5;margin-bottom:8px;"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--bullish);border:2px solid #f59e0b;vertical-align:middle;"></span> Kästchen = je eine Strategie: <strong>grün</strong> = Kaufsignal heute, <strong>orangefarbener Rand</strong> = schlug Buy &amp; Hold im Zeitraum. Beim Antippen einer Aktie siehst du die Namen.</div>';

    if (!shown.length) {
      html += '<div style="font-size:0.8rem;color:var(--text-dim);">Keine Aktie erfüllt diesen Filter (' + list.length + ' von ' + n + ').</div>';
    } else {
      html += '<div class="table-responsive-wrapper"><table class="data-table compact"><thead><tr><th>Aktie</th><th style="text-align:right;">Kauf heute</th><th style="text-align:right;">Schlagen B&amp;H</th></tr></thead><tbody>' +
        shown.map(function (r) {
          var d = state.deep[r.ticker], deepTxt = '';
          if (d) deepTxt = d.error ? '<div style="font-size:0.66rem;color:var(--text-dim);margin-top:2px;">Gründlich: ' + esc(d.error) + '</div>'
            : '<div style="font-size:0.7rem;margin-top:3px;font-weight:700;color:' + (d.buys > 0 ? 'var(--bullish)' : 'var(--text-dim)') + ';">Bewährt: ' + d.buys + ' von ' + d.proven + ' mit Kaufsignal</div>';
          return '<tr data-all-pick="' + esc(r.ticker) + '" style="cursor:pointer;"><td><strong>' + esc(r.ticker) + '</strong>' +
            (r.name ? '<div style="font-size:0.68rem;color:var(--text-dim);">' + esc(r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name) + '</div>' : '') + dots(r, names) + deepTxt + '</td>' +
            '<td style="text-align:right;font-weight:700;white-space:nowrap;">' + r.buys + ' / ' + r.total + '</td>' +
            '<td style="text-align:right;font-weight:700;white-space:nowrap;color:' + (r.beats > avgBeat ? 'var(--bullish)' : 'var(--text-main)') + ';">' + r.beats + ' / ' + r.total + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      if (list.length > MAX_ROWS) html += '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:6px;">Die ersten ' + MAX_ROWS + ' von ' + list.length + ' Aktien.</div>';
      html += '<div style="margin-top:12px;"><button class="chip-btn" id="all-deep" style="width:100%;justify-content:center;height:38px;">🔬 Gründlich prüfen (beste ' + Math.min(20, list.length) + ' dieser Liste)</button>' +
        '<div style="font-size:0.7rem;color:var(--text-dim);line-height:1.45;margin-top:4px;">Sucht je Aktie optimierte Werte auf den älteren 70 % der Kurse und prüft sie auf den jüngeren 30 %. „Bewährt“ = im Testzeitraum besser als Buy &amp; Hold. Dauert wenige Sekunden pro Aktie; Aktien mit weniger als etwa 4 Jahren Historie werden ausgelassen.</div></div>';
    }
    html += '<div style="font-size:0.7rem;color:var(--text-dim);line-height:1.5;margin-top:12px;"><strong style="color:var(--text-main);">Hinweis:</strong> Vergangenheitswerte mit Standardparametern auf Wochenkursen, Kosten ' + F().number(FEE * 100, 1) + ' % je Kauf/Verkauf, ohne Dividenden und Steuern. „Kaufsignal heute“ bezieht sich auf den letzten Wochenschluss. Keine Anlageempfehlung.</div>';
    out.innerHTML = html;

    out.querySelectorAll('[data-all-sort]').forEach(function (b) { b.onclick = function () { state.allSort = b.getAttribute('data-all-sort'); drawAll(out); }; });
    out.querySelectorAll('[data-all-open]').forEach(function (b) { b.onclick = function () { state.openTab = b.getAttribute('data-all-open'); drawAll(out); }; });
    var mb = out.querySelector('#all-min-buys'), me = out.querySelector('#all-min-beats');
    if (mb) mb.onchange = function () { state.minBuys = Number(mb.value); drawAll(out); };
    if (me) me.onchange = function () { state.minBeats = Number(me.value); drawAll(out); };
    out.querySelectorAll('[data-all-pick]').forEach(function (tr) {
      tr.onclick = function () {
        var target = '#/stock/' + encodeURIComponent(tr.getAttribute('data-all-pick')) + '/' + state.openTab;
        if (window.location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange')); else window.location.hash = target;
      };
    });
    var db = out.querySelector('#all-deep');
    if (db) db.onclick = function () { deepCheck(out, list.slice(0, 20)); };
  }

  function deepCheck(out, items) {
    var q = Q(), token = ++state.token, i = 0, btn = out.querySelector('#all-deep');
    function step() {
      if (token !== state.token) return;
      if (i >= items.length) { state.allSort = 'deep'; drawAll(out); return; }
      if (btn) { btn.disabled = true; btn.textContent = 'Prüfe ' + (i + 1) + ' / ' + items.length + ' … (' + items[i].ticker + ')'; }
      setTimeout(function () {
        var t = items[i].ticker, hist = state.hists[t];
        try {
          var r = hist ? q.findBest(hist, FEE, 0.3) : { error: 'keine Historie' };
          if (r.error) state.deep[t] = { error: /^Zu wenig Daten/.test(r.error) ? 'zu wenig Historie' : r.error };
          else {
            var proven = r.rows.filter(function (x) { return x.beatsTest; });
            state.deep[t] = { proven: proven.length, buys: proven.filter(function (x) { return x.signalNow === 'long'; }).length, total: r.rows.length };
          }
        } catch (e) { state.deep[t] = { error: 'Fehler' }; }
        i++; step();
      }, 20);
    }
    step();
  }

  /* ---------- Ergebnis ---------- */
  function drawResults(out) {
    var rows = state.results, meta = state.meta;
    if (!rows || !meta) return;
    if (!rows.length) {
      out.innerHTML = '<div class="state-box"><p>Keine Aktie hat genug Kurshistorie für ' + esc(meta.per.label) + ' (' + meta.skipped + ' übersprungen). Wähle einen kürzeren Zeitraum oder lade Langhistorien (data/long) für mehr Aktien.</p></div>';
      return;
    }
    var n = rows.length;
    var beatRet = rows.filter(function (r) { return r.excess > 0; }).length;
    var beatSh = rows.filter(function (r) { return r.sharpe != null && r.bhSharpe != null && r.sharpe > r.bhSharpe; }).length;
    var beatDD = rows.filter(function (r) { return r.dd > r.bhDD; }).length;
    var longN = rows.filter(function (r) { return r.signal === 'long'; }).length;
    var medEx = median(rows.map(function (r) { return r.excess; }));
    var share = function (k) { return k + ' von ' + n + ' (' + F().number(k / n * 100, 0) + ' %)'; };

    var list = rows.filter(function (r) { return !state.onlyLong || r.signal === 'long'; }).slice();
    list.sort(function (a, b) {
      if (state.sort === 'excess') return b.excess - a.excess;
      if (state.sort === 'sharpe') return ((b.sharpe == null ? -99 : b.sharpe) - (b.bhSharpe == null ? 0 : b.bhSharpe)) - ((a.sharpe == null ? -99 : a.sharpe) - (a.bhSharpe == null ? 0 : a.bhSharpe));
      if (state.sort === 'dd') return (b.dd - b.bhDD) - (a.dd - a.bhDD);
      return (Number(b.signal === 'long') - Number(a.signal === 'long')) || (b.excess - a.excess);
    });
    var shown = list.slice(0, MAX_ROWS);
    var chip = function (k, label) { return '<button class="chip-btn ' + (state.sort === k ? 'active' : '') + '" data-scan-sort="' + k + '">' + label + '</button>'; };

    var html = '' +
      '<div style="padding:10px 12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:0.8rem;line-height:1.55;margin-bottom:12px;">' +
        '<strong>' + esc(meta.label) + '</strong> · ' + esc(meta.per.label) + ' · ' + n + ' Aktien getestet' + (meta.skipped ? ' <span style="color:var(--text-dim);">(' + meta.skipped + ' ohne ausreichende Historie übersprungen)</span>' : '') + '.<br>' +
        'Gegenüber Buy &amp; Hold war die Regel besser bei der Rendite: <strong>' + share(beatRet) + '</strong>, beim Sharpe: <strong>' + share(beatSh) + '</strong>, beim Drawdown (kleiner): <strong>' + share(beatDD) + '</strong>. ' +
        'Mittlere Renditedifferenz: <strong style="color:' + tone(medEx) + ';">' + pct(medEx, 1, true) + '-Pkt.</strong><br>' +
        'Signal heute: <strong>' + longN + ' investiert</strong>, ' + (n - longN) + ' Cash.' +
      '</div>' +
      '<div class="horizontal-scroll-row" style="margin-bottom:8px;"><span style="font-size:0.72rem;color:var(--text-dim);align-self:center;white-space:nowrap;">Sortieren:</span>' +
        chip('signal', 'Signal heute') + chip('excess', 'Rendite vs. B&amp;H') + chip('sharpe', 'Sharpe vs. B&amp;H') + chip('dd', 'Drawdown-Vorteil') + '</div>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:0.76rem;margin-bottom:8px;cursor:pointer;"><input type="checkbox" id="scan-only-long"' + (state.onlyLong ? ' checked' : '') + '> Nur Aktien mit Signal „investiert“ (' + longN + ')</label>' +
      '<div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:6px;">Zeile antippen: Backtest der Aktie mit dieser Strategie öffnen</div>';

    if (!shown.length) {
      html += '<div style="font-size:0.8rem;color:var(--text-dim);">Keine Aktie erfüllt diesen Filter.</div>';
    } else {
      html += '<div class="table-responsive-wrapper"><table class="data-table compact"><thead><tr><th>Aktie</th><th style="text-align:right;">Strategie</th><th style="text-align:right;">Buy &amp; Hold</th></tr></thead><tbody>' +
        shown.map(function (r, i) {
          var long = r.signal === 'long';
          return '<tr data-scan-pick="' + esc(r.ticker) + '" style="cursor:pointer;">' +
            '<td><strong>' + esc(r.ticker) + '</strong>' + (r.name ? '<div style="font-size:0.68rem;color:var(--text-dim);">' + esc(r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name) + '</div>' : '') +
              '<div style="font-size:0.68rem;font-weight:700;white-space:nowrap;color:' + (long ? 'var(--bullish)' : 'var(--text-dim)') + ';">Heute: ' + (long ? 'investiert' : 'Cash') + '</div></td>' +
            '<td style="text-align:right;font-weight:700;color:' + tone(r.total) + ';">' + pct(r.total, 0, true) +
              '<div style="font-size:0.68rem;font-weight:400;color:var(--text-dim);white-space:nowrap;">DD ' + pct(r.dd, 0) + '</div>' +
              '<div style="font-size:0.68rem;font-weight:400;color:var(--text-dim);white-space:nowrap;">Sharpe ' + num(r.sharpe, 2) + '</div>' +
              '<div style="font-size:0.68rem;font-weight:400;color:' + tone(r.excess) + ';white-space:nowrap;">' + pct(r.excess, 0, true) + '-Pkt.</div>' +
              '<div style="font-size:0.68rem;font-weight:400;color:var(--text-dim);white-space:nowrap;">' + r.trades + (r.trades === 1 ? ' Trade' : ' Trades') + '</div></td>' +
            '<td style="text-align:right;white-space:nowrap;">' + pct(r.bh, 0, true) +
              '<div style="font-size:0.68rem;color:var(--text-dim);">DD ' + pct(r.bhDD, 0) + '</div>' +
              '<div style="font-size:0.68rem;color:var(--text-dim);">Sharpe ' + num(r.bhSharpe, 2) + '</div></td></tr>';
        }).join('') + '</tbody></table></div>';
      if (list.length > MAX_ROWS) html += '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:6px;">Die ersten ' + MAX_ROWS + ' von ' + list.length + ' Aktien (nach der gewählten Sortierung).</div>';
    }
    html += '<div style="font-size:0.7rem;color:var(--text-dim);line-height:1.5;margin-top:12px;"><strong style="color:var(--text-main);">Hinweis:</strong> Vergangenheitswerte mit Standardparametern auf Wochenkursen, Kosten ' + F().number(FEE * 100, 1) + ' % je Kauf/Verkauf, ohne Dividenden und Steuern. Nur Aktien, die es heute noch gibt. „Signal heute“ ist das Ergebnis der Regel am letzten Kurs und keine Anlageempfehlung.</div>';
    out.innerHTML = html;

    out.querySelectorAll('[data-scan-sort]').forEach(function (b) { b.onclick = function () { state.sort = b.getAttribute('data-scan-sort'); drawResults(out); }; });
    var cb = out.querySelector('#scan-only-long');
    if (cb) cb.onchange = function () { state.onlyLong = cb.checked; drawResults(out); };
    out.querySelectorAll('[data-scan-pick]').forEach(function (tr) {
      tr.onclick = function () {
        var t = tr.getAttribute('data-scan-pick');
        if (window.App.StockStrategy && window.App.StockStrategy.prefill) window.App.StockStrategy.prefill(meta.type, meta.params, meta.per.key === '10Y' ? 'MAX' : meta.per.key);
        var target = '#/stock/' + encodeURIComponent(t) + '/strategy';
        if (window.location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));   // gleiche Seite: neu zeichnen
        else window.location.hash = target;
      };
    });
  }

  return { mount: mount };
})();

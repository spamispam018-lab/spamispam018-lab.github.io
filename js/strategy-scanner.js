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
    collapsed: false, token: 0, results: null, meta: null
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
    ['Grenzen der Daten', 'Es werden die Wochen-Langhistorien genutzt (Zeit-Parameter in Tagen werden in Wochen umgerechnet). Das Universum enthält nur Aktien, die es heute noch gibt (Auswahlverzerrung), Dividenden und Steuern fehlen. Aktien ohne ausreichend lange Historie werden übersprungen und gezählt.']
  ];

  /* ---------- Rendering ---------- */
  function mount(slot) {
    if (!slot) return;
    var q = Q();
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
            '<div><label for="scan-type" style="font-size:0.72rem;color:var(--text-dim);">Strategie</label>' +
              '<select id="scan-type" class="sort-select" style="width:100%;margin-top:4px;">' + stratOpts + '</select>' +
              '<div id="scan-desc" style="font-size:0.72rem;color:var(--text-dim);margin-top:6px;line-height:1.4;"></div></div>' +
            '<div id="scan-params" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;"></div>' +
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
    slot.querySelector('#scan-run').onclick = function () { run(slot, curParams()); };

    if (state.results) drawResults(slot.querySelector('#scan-out'));
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
        window.location.hash = '#/stock/' + encodeURIComponent(t) + '/strategy';
      };
    });
  }

  return { mount: mount };
})();

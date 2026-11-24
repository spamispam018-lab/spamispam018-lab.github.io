/**
 * js/stock-strategy.js
 * Backtest-Tab der Aktiendetailseite: Handelsstrategien auf der Kurshistorie der einzelnen Aktie simulieren
 * (SMA-Crossover, Kurs über SMA, RSI, Breakout, Momentum) und mit Buy & Hold vergleichen.
 * Berechnung in js/quant.js. Der Screener-Backtest (js/backtest.js) bleibt unverändert.
 */

window.App = window.App || {};

window.App.StockStrategy = (function () {
  'use strict';

  var Q = function () { return window.App.Quant; };
  var F = function () { return window.App.Format; };

  var PERIODS = [
    { key: '1Y', label: '1 Jahr', years: 1 },
    { key: '2Y', label: '2 Jahre', years: 2 },
    { key: '5Y', label: '5 Jahre', years: 5 },
    { key: '10Y', label: '10 Jahre', years: 10 },
    { key: 'MAX', label: 'Max.', years: null }
  ];

  var state = { type: 'sma_cross', params: {}, period: 'MAX', fee: 0.1, helpOpen: false, bestWin: '30p', collapsed: { search: false, best: false } };
  var BEST_WINS = [['30p', 'Letzte 30 %'], ['1Y', '1 Jahr'], ['6M', '6 Monate'], ['3M', '3 Monate'], ['1M', '1 Monat'], ['1W', '1 Woche'], ['1D', '1 Tag']];
  var BEST_DAYS = { '1Y': 365, '6M': 182, '3M': 91, '1M': 30, '1W': 7, '1D': 1 };

  var BT_HELP = [["Gesamtrendite / CAGR", "Gesamtrendite ist der Gewinn über den ganzen Zeitraum; CAGR rechnet ihn auf ein Jahr um, damit sich verschieden lange Zeiträume vergleichen lassen."], ["Volatilität p. a.", "Wie stark der Wert der Strategie schwankt (Standardabweichung der Tagesrenditen, aufs Jahr hochgerechnet). Zeiten in Cash dämpfen sie."], ["Max. Drawdown", "Der größte Rückgang vom bisherigen Höchststand bis zum folgenden Tief. Er zeigt, wie viel Durchhaltevermögen die Strategie verlangt hätte. Ein Minus von 30 % braucht +43 %, um wieder auszugleichen."], ["Sharpe Ratio", "Überrendite gegenüber 2 % Zins je Einheit Schwankung. Unter 0: schlechter als Zinsen; um 0,5: mäßig; ab 1: gut. Nur historisch und bei kurzen Zeiträumen wenig belastbar."], ["Calmar Ratio", "Rendite p. a. geteilt durch den größten Rückgang. Je höher, desto mehr Ertrag pro ertragenem Verlust."], ["Zeit investiert", "Anteil der Handelstage mit Position. Eine Strategie, die nur halb so lange investiert war und ähnlich viel verdient hat, hat das mit weniger Marktrisiko geschafft."], ["Trefferquote und Ø Trade", "Anteil der Gewinn-Trades und ihre durchschnittliche Rendite. Eine hohe Trefferquote allein sagt wenig: Trendfolger gewinnen oft nur in 35–45 % der Trades, aber mit großen Gewinnen; Gegenstrategien gewinnen oft häufig, aber klein."], ["Signal heute", "Was die Regel am letzten Schlusskurs sagt. Ausgeführt würde sie – wie im Backtest – erst am nächsten Handelstag."], ["Regeln der Simulation", "Signal am Schlusskurs, Ausführung am nächsten Schlusskurs (kein Blick in die Zukunft). Nur Long, voll investiert oder Cash ohne Zinsen. Kosten fallen bei jedem Kauf und Verkauf an."], ["Typische Fallstricke", "<strong>Überanpassung:</strong> Wer Parameter so lange dreht, bis die Kurve schön aussieht, optimiert auf die Vergangenheit. Robust ist eine Einstellung, die auch bei Nachbarwerten (z. B. 40/180 statt 50/200) ähnlich funktioniert. <strong>Auswahlverzerrung:</strong> Du testest eine Aktie, die es heute noch gibt und die du kennst; gescheiterte Titel fehlen. <strong>Wenige Trades:</strong> Bei unter etwa 10 Trades ist das Ergebnis Zufall, nicht Beleg. <strong>Währung:</strong> Kurse sind in Euro umgerechnet, Wechselkurse fließen ins Ergebnis ein."]];

  var histCache = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function pct(v, d, signed) {
    if (v == null || !isFinite(v)) return '—';
    return (signed && v > 0 ? '+' : '') + F().number(v, d == null ? 1 : d) + ' %';
  }
  function shortDate(d) { return d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(2, 4) : ''; }

  function num(v, d) { return (v == null || !isFinite(v)) ? '—' : F().number(v, d == null ? 2 : d); }
  function tone(v) { return v == null || !isFinite(v) ? '' : v >= 0 ? 'var(--bullish)' : 'var(--bearish)'; }


  function helpCard(items, key) {
    return '<details class="card" data-help="' + key + '"' + (state.helpOpen ? ' open' : '') + ' style="padding:14px 16px;">' +
      '<summary style="font-weight:700;font-size:0.85rem;cursor:pointer;">Was bedeuten die Werte?</summary>' +
      '<div style="margin-top:12px;">' + items.map(function (it) {
        return '<div style="margin-bottom:12px;"><div style="font-weight:700;font-size:0.8rem;color:var(--text-main);">' + it[0] + '</div>' +
          '<div style="font-size:0.76rem;color:var(--text-dim);line-height:1.55;margin-top:2px;">' + it[1] + '</div></div>';
      }).join('') + '</div></details>';
  }

  function bindHelp(root) {
    var d = root.querySelector('details[data-help]');
    if (d) d.addEventListener('toggle', function () { state.helpOpen = d.open; });
  }

  function currentParams() {
    var defs = Q().STRATEGIES[state.type].params;
    var out = {};
    defs.forEach(function (d) {
      var v = Number(state.params[state.type + '.' + d.key]);
      if (!isFinite(v) || v <= 0) { out[d.key] = d.def; return; }
      v = d.float ? Math.round(v * 100) / 100 : Math.round(v);
      out[d.key] = Math.min(d.max, Math.max(d.min, v));       // in den erlaubten Bereich zwingen
    });
    return out;
  }

  function render(container, stock) {
    var ticker = (stock.ticker || (stock.profile && stock.profile.ticker) || '').toUpperCase();
    container.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Lade Kurshistorie…</p></div>';

    var ck = ticker + (Q().preferDaily() ? ':d' : '');
    if (!histCache[ck]) histCache[ck] = Q().loadHistory(ticker, stock.chartHistory);
    histCache[ck].then(function (full) {
      if (full.length < 60) {
        container.innerHTML = '<div class="state-box"><p>Zu wenig Kursdaten für einen Backtest (mindestens 60 Handelstage).</p></div>';
        return;
      }
      drawForm(container, stock, ticker, full);
    }).catch(function (err) {
      container.innerHTML = '<div class="state-box"><p>Backtest nicht verfügbar: ' + esc(err && err.message) + '</p></div>';
    });
  }

  function drawForm(container, stock, ticker, full) {
    var q = Q();
    var span = q.spanYears(full);
    var avail = PERIODS.filter(function (p) { return p.years == null || p.years <= span + 0.05; });
    if (!avail.some(function (p) { return p.key === state.period; })) state.period = avail[avail.length - 1].key;

    var stratOpts = Object.keys(q.STRATEGIES).map(function (k) {
      return '<option value="' + k + '"' + (k === state.type ? ' selected' : '') + '>' + esc(q.STRATEGIES[k].label) + '</option>';
    }).join('');

    var chips = avail.map(function (p) {
      return '<button class="chip-btn ' + (p.key === state.period ? 'active' : '') + '" data-bt-period="' + p.key + '">' + p.label + '</button>';
    }).join('');

    var html = '' +
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">Strategie-Backtest</span>' +
          '<span class="period-tag">' + F().date(full[0].date) + ' – ' + F().date(full[full.length - 1].date) + '</span></div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
          '<div><label for="bt-type" style="font-size:0.72rem;color:var(--text-dim);">Strategie</label>' +
            '<select id="bt-type" class="sort-select" style="width:100%;margin-top:4px;">' + stratOpts + '</select>' +
            '<div id="bt-desc" style="font-size:0.72rem;color:var(--text-dim);margin-top:6px;line-height:1.4;"></div>' +
            '<details id="bt-explain-wrap" style="margin-top:8px;"><summary style="font-size:0.75rem;color:var(--accent-purple-light);cursor:pointer;">Wie funktioniert diese Strategie?</summary>' +
              '<div id="bt-explain" style="font-size:0.78rem;color:var(--text-dim);line-height:1.55;margin-top:8px;"></div></details></div>' +
          '<div id="bt-params" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;"></div>' +
          '<div><div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:4px;">Zeitraum</div>' +
            '<div class="horizontal-scroll-row" style="margin-bottom:0;padding-bottom:0;">' + chips + '</div></div>' +
          '<div><div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:4px;">Kursdaten</div>' +
            '<div class="horizontal-scroll-row" style="margin-bottom:0;padding-bottom:0;">' +
              '<button class="chip-btn ' + (q.preferDaily() ? '' : 'active') + '" data-bt-data="weekly">Wochenkurse (lange Historie)</button>' +
              '<button class="chip-btn ' + (q.preferDaily() ? 'active' : '') + '" data-bt-data="daily">Tageskurse</button></div>' +
            '<div style="font-size:0.7rem;color:var(--text-dim);line-height:1.4;margin-top:4px;">' +
              (full.dailyFailed ? '<span style="color:var(--bearish);">Tageskurse konnten nicht geladen werden – es werden Wochenkurse verwendet.</span> ' : '') +
              (q.preferDaily() && !full.dailyFailed ? 'Tägliche Schlusskurse über den Proxy (bis 20 Jahre, Handelswährung). ' : 'Tageskurse laden über den Proxy; zusätzlich gilt das für den Risiko-Tab. ') +
              'Aktuell: ' + (q.periodsPerYear(full) >= 200 ? 'Tageskurse' : (q.periodsPerYear(full) >= 40 ? 'Wochenkurse' : 'Monatskurse')) + ', ' + full.length + ' Datenpunkte.</div></div>' +
          '<div><label for="bt-fee" style="font-size:0.72rem;color:var(--text-dim);">Kosten je Kauf/Verkauf (%)</label>' +
            '<input id="bt-fee" class="search-input" type="number" min="0" max="5" step="0.05" inputmode="decimal" value="' + state.fee + '" style="width:100%;margin-top:4px;padding-left:12px;"></div>' +
          '<button class="chip-btn active" id="bt-run" style="height:42px;justify-content:center;">Backtest starten</button>' +
          '<button class="chip-btn" id="bt-live-btn" style="height:42px;justify-content:center;">⚡ Mit diesen Werten Live-Signal ansehen</button>' +
          '<button class="chip-btn" id="bt-search-btn" style="height:42px;justify-content:center;">Parameter suchen, die Buy &amp; Hold schlagen</button>' +
          '<button class="chip-btn" id="bt-best-btn" style="height:42px;justify-content:center;">Beste Strategie finden (mit Testzeitraum)</button>' +
        '</div>' +
      '</div>' +
      '<div id="bt-best"></div>' +
      '<div id="bt-search"></div>' +
      '<div id="bt-single-results"></div>';

    container.innerHTML = html;


    function drawParams() {
      var def = q.STRATEGIES[state.type];
      container.querySelector('#bt-desc').textContent = def.desc;
      container.querySelector('#bt-explain').innerHTML = def.explain || '';
      var cur = currentParams();
      container.querySelector('#bt-params').innerHTML = def.params.map(function (p) {
        return '<div><label for="bt-p-' + p.key + '" style="font-size:0.72rem;color:var(--text-dim);">' + esc(p.label) + '</label>' +
          '<input id="bt-p-' + p.key + '" data-pkey="' + p.key + '" class="search-input" type="number" min="' + p.min + '" max="' + p.max + '" step="' + (p.step || 1) + '" inputmode="decimal" value="' + cur[p.key] + '" style="width:100%;margin-top:4px;padding-left:12px;"></div>';
      }).join('');
      container.querySelectorAll('#bt-params input').forEach(function (inp) {
        inp.oninput = function () { state.params[state.type + '.' + inp.getAttribute('data-pkey')] = inp.value; };
      });
    }
    drawParams();
    container.__drawParams = drawParams;

    container.querySelector('#bt-type').onchange = function (e) {
      state.type = e.target.value;
      drawParams();
    };
    container.querySelectorAll('[data-bt-period]').forEach(function (btn) {
      btn.onclick = function () {
        state.period = btn.getAttribute('data-bt-period');
        container.querySelectorAll('[data-bt-period]').forEach(function (b) { b.classList.toggle('active', b === btn); });
      };
    });
    container.querySelector('#bt-fee').oninput = function (e) {
      var v = Number(e.target.value);
      state.fee = isFinite(v) && v >= 0 ? v : 0.1;
    };
    container.querySelectorAll('[data-bt-data]').forEach(function (btn) {
      btn.onclick = function () {
        var wantDaily = btn.getAttribute('data-bt-data') === 'daily';
        if (wantDaily === q.preferDaily()) return;
        q.setPreferDaily(wantDaily);
        render(container, stock);
      };
    });
    container.querySelector('#bt-run').onclick = function () { run(container, ticker, full); };
    container.querySelector('#bt-live-btn').onclick = function () { window.App.Router.navigate('/stock/' + ticker + '/live'); };
    container.querySelector('#bt-search-btn').onclick = function () { search(container, ticker, full); };
    container.querySelector('#bt-best-btn').onclick = function () { findBest(container, ticker, full); };

    run(container, ticker, full);   // direkt ein erstes Ergebnis zeigen
  }


  /* ---------- Parameter-Suche: Kombinationen, die Buy & Hold schlagen ---------- */
  function paramLabel(def, p) {
    return def.params.map(function (d) { return p[d.key]; }).join(' / ');
  }

  function search(container, ticker, full) {
    var q = Q(), f = F();
    var box = container.querySelector('#bt-search');
    var def = q.STRATEGIES[state.type];
    if (state.type === 'buyhold') {
      box.innerHTML = '<div class="state-box"><p>Buy &amp; Hold ist die Vergleichsbasis und hat keine Parameter. Wähle eine andere Strategie.</p></div>';
      return;
    }
    state.collapsed.search = false;
    box.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Teste Parameter-Kombinationen…</p></div>';

    setTimeout(function () {
      var per = PERIODS.filter(function (p) { return p.key === state.period; })[0];
      var hist = q.sliceYears(full, per.years);
      var res = q.searchParams(hist, state.type, state.fee / 100);
      if (!res.rows.length) {
        box.innerHTML = '<div class="state-box"><p>Für diesen Zeitraum erzeugt keine Parameter-Kombination ein Signal. Wähle einen längeren Zeitraum.</p></div>';
        return;
      }
      var winners = res.rows.filter(function (r) { return r.beats; });
      var robust = winners.filter(function (r) { return r.half1 && r.half2; });
      var sortKey = 'total';
      var shown = winners.length ? winners : res.rows;

      function draw() {
        var list = shown.slice().sort(function (a, b) {
          if (sortKey === 'sharpe') return (b.sharpe == null ? -99 : b.sharpe) - (a.sharpe == null ? -99 : a.sharpe);
          if (sortKey === 'dd') return b.maxDD - a.maxDD;           // weniger negativ zuerst
          if (sortKey === 'robust') return (Number(b.half1 && b.half2) - Number(a.half1 && a.half2)) || (b.total - a.total);
          return b.total - a.total;
        }).slice(0, 15);

        var chip = function (k, label) { return '<button class="chip-btn ' + (sortKey === k ? 'active' : '') + '" data-bt-sort="' + k + '">' + label + '</button>'; };
        var mark = function (ok) { return '<span style="color:' + (ok ? 'var(--bullish)' : 'var(--bearish)') + ';font-weight:700;">' + (ok ? '✓' : '✗') + '</span>'; };

        var html = '' +
          '<div class="card">' +
            '<div class="card-header-dotted"><span class="card-title">Parameter-Suche</span><span class="period-tag">' + esc(def.label) + ' · ' + esc(per.label) + '</span></div>' +
            '<div style="padding:10px 12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:0.8rem;line-height:1.5;margin-bottom:12px;">' +
              (winners.length
                ? '<strong>' + winners.length + ' von ' + res.rows.length + '</strong> getesteten Kombinationen (' + f.number(winners.length / res.rows.length * 100, 0) + ' %) haben eine höhere Gesamtrendite als Buy &amp; Hold (' + pct(res.bh.totalReturn, 1, true) + '). ' +
                  'In <strong>beiden Zeitraum-Hälften</strong> besser waren ' + robust.length + '.'
                : '<strong>Keine</strong> der ' + res.rows.length + ' getesteten Kombinationen schlägt Buy &amp; Hold (' + pct(res.bh.totalReturn, 1, true) + ') in diesem Zeitraum. Unten stehen die besten Kombinationen zum Vergleich.') +
              (res.skipped ? ' <span style="color:var(--text-dim);">' + res.skipped + ' Kombinationen ohne Trade wurden ausgelassen.</span>' : '') +
            '</div>' +
            '<div class="horizontal-scroll-row" style="margin-bottom:10px;"><span style="font-size:0.72rem;color:var(--text-dim);align-self:center;white-space:nowrap;">Sortieren:</span>' +
              chip('total', 'Rendite') + chip('sharpe', 'Sharpe') + chip('dd', 'Kleinster Drawdown') + chip('robust', 'Robustheit') + '</div>' +
            '<div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:6px;">Parameter: ' + def.params.map(function (d) { return esc(d.label); }).join(' / ') + ' · Zeile antippen, um sie zu übernehmen</div>' +
            '<div class="table-responsive-wrapper"><table class="data-table compact"><thead><tr><th>Parameter</th><th style="text-align:right;">Rendite</th><th style="text-align:right;">Max. DD</th><th style="text-align:center;" title="Schlägt Buy &amp; Hold in der 1. / 2. Zeitraum-Hälfte">Hälften</th></tr></thead><tbody>' +
            list.map(function (r, i) {
              return '<tr data-bt-pick="' + i + '" style="cursor:pointer;">' +
                '<td><strong>' + esc(paramLabel(def, r.params)) + '</strong><div style="font-size:0.68rem;color:var(--text-dim);">' + r.trades + ' Trades · ' + pct(r.exposure, 0) + ' investiert</div></td>' +
                '<td style="text-align:right;font-weight:700;color:' + tone(r.total) + ';">' + pct(r.total, 1, true) +
                  '<div style="font-size:0.68rem;font-weight:400;color:' + tone(r.excess) + ';">' + pct(r.excess, 1, true) + '-Pkt. vs. B&amp;H</div></td>' +
                '<td style="text-align:right;">' + pct(r.maxDD, 1) + '<div style="font-size:0.68rem;color:var(--text-dim);">Sharpe ' + num(r.sharpe, 2) + '</div></td>' +
                '<td style="text-align:center;white-space:nowrap;">' + mark(r.half1) + ' ' + mark(r.half2) + '</td></tr>';
            }).join('') + '</tbody></table></div>' +
            '<div style="font-size:0.72rem;color:var(--text-dim);line-height:1.5;margin-top:12px;">' +
              '<strong style="color:var(--text-main);">Vorsicht bei Treffern:</strong> Wenn viele Varianten getestet werden, schlägt allein durch Zufall immer ein Teil Buy &amp; Hold – das ist <em>Überanpassung</em> an die Vergangenheit. ' +
              'Glaubwürdiger sind Kombinationen, die in <strong>beiden Hälften</strong> (✓ ✓) gewinnen, deren Nachbarwerte ähnlich gut abschneiden und die nicht auf sehr wenigen Trades beruhen. ' +
              'Ein Treffer ist kein Versprechen für die Zukunft.</div>' +
          '</div>';
        box.innerHTML = html;
        makeCollapsible(box, 'search');

        box.querySelectorAll('[data-bt-sort]').forEach(function (b) {
          b.onclick = function () { sortKey = b.getAttribute('data-bt-sort'); draw(); };
        });
        box.querySelectorAll('[data-bt-pick]').forEach(function (tr) {
          tr.onclick = function () {
            var r = list[Number(tr.getAttribute('data-bt-pick'))];
            Object.keys(r.params).forEach(function (k) {
              state.params[state.type + '.' + k] = r.params[k];
              var inp = container.querySelector('#bt-p-' + k);
              if (inp) inp.value = r.params[k];
            });
            run(container, ticker, full);
            var target = container.querySelector('#bt-single-results');
            if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          };
        });
      }
      draw();
    }, 30);
  }

  /** Macht die Karte in `box` ein-/ausklappbar (Knopf in der Kopfzeile); der Zustand bleibt beim Neuzeichnen erhalten. */
  function makeCollapsible(box, key) {
    var card = box.querySelector('.card');
    var head = card && card.querySelector('.card-header-dotted');
    if (!head) return;
    var body = document.createElement('div');
    body.className = 'bt-collapse-body';
    while (head.nextSibling) body.appendChild(head.nextSibling);
    card.appendChild(body);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-btn';
    btn.style.cssText = 'height:28px;padding:0 10px;font-size:0.72rem;margin-left:8px;';
    function apply() {
      var c = !!state.collapsed[key];
      body.style.display = c ? 'none' : '';
      btn.textContent = c ? 'Aufklappen ▾' : 'Einklappen ▴';
      btn.setAttribute('aria-expanded', c ? 'false' : 'true');
    }
    btn.onclick = function () { state.collapsed[key] = !state.collapsed[key]; apply(); };
    head.appendChild(btn);
    apply();
  }

  /* ---------- Beste Strategie finden: Training / Testzeitraum ---------- */
  function findBest(container, ticker, full) {
    var q = Q(), f = F();
    var box = container.querySelector('#bt-best');
    state.collapsed.best = false;
    box.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Teste alle Strategien…</p></div>';

    setTimeout(function () {
      var per = PERIODS.filter(function (p) { return p.key === state.period; })[0];
      var recent = state.bestWin !== '30p';
      var winLabel = BEST_WINS.filter(function (w) { return w[0] === state.bestWin; })[0][1];
      var winChips = function () {
        return '<div class="horizontal-scroll-row" style="margin-bottom:10px;"><span style="font-size:0.72rem;color:var(--text-dim);align-self:center;white-space:nowrap;">Bewertungszeitraum:</span>' +
          BEST_WINS.map(function (w) { return '<button class="chip-btn ' + (state.bestWin === w[0] ? 'active' : '') + '" data-bt-win="' + w[0] + '">' + w[1] + '</button>'; }).join('') + '</div>';
      };
      var bindWins = function () {
        box.querySelectorAll('[data-bt-win]').forEach(function (b) {
          b.onclick = function () { state.bestWin = b.getAttribute('data-bt-win'); findBest(container, ticker, full); };
        });
      };
      var res = recent ? q.findBestRecent(full, state.fee / 100, BEST_DAYS[state.bestWin]) : q.findBest(q.sliceYears(full, per.years), state.fee / 100, 0.3);
      if (res.error) {
        box.innerHTML = '<div class="card"><div class="card-header-dotted"><span class="card-title">Beste Strategie</span></div>' + winChips() +
          '<div style="font-size:0.82rem;color:var(--text-dim);line-height:1.5;">' + esc(res.error) + '</div></div>';
        makeCollapsible(box, 'best');
        bindWins();
        return;
      }

      var sortKey = (state.bestWin === '1D' || state.bestWin === '1W' || state.bestWin === '1M') ? 'total' : 'sharpe';
      var bt = res.bhTest;
      var beatRet = res.rows.filter(function (r) { return r.test.totalReturn > bt.totalReturn; }).length;
      var beatSh = res.rows.filter(function (r) { return r.test.sharpe != null && bt.sharpe != null && r.test.sharpe > bt.sharpe; }).length;
      var beatDD = res.rows.filter(function (r) { return r.test.maxDD > bt.maxDD; }).length;

      function draw() {
        var list = res.rows.slice().sort(function (a, b) {
          if (sortKey === 'total') return b.test.totalReturn - a.test.totalReturn;
          if (sortKey === 'dd') return b.test.maxDD - a.test.maxDD;
          return (b.test.sharpe == null ? -99 : b.test.sharpe) - (a.test.sharpe == null ? -99 : a.test.sharpe);
        });
        var chip = function (k, label) { return '<button class="chip-btn ' + (sortKey === k ? 'active' : '') + '" data-bt-bsort="' + k + '">' + label + '</button>'; };
        var top = list[0];
        var topDef = q.STRATEGIES[top.type];
        var metricName = sortKey === 'total' ? 'der Rendite' : (sortKey === 'dd' ? 'beim Drawdown' : 'beim Sharpe-Ratio');
        var headline;
        if (sortKey === 'total' ? top.test.totalReturn > bt.totalReturn : (sortKey === 'dd' ? top.test.maxDD > bt.maxDD : (top.test.sharpe != null && bt.sharpe != null && top.test.sharpe > bt.sharpe))) {
          headline = 'Vorn liegt <strong>' + esc(topDef.label) + '</strong> (' + esc(paramLabel(topDef, top.params)) + ') – im Testzeitraum ' + metricName + ' besser als Buy &amp; Hold. ' +
            'Das ist die beste von ' + res.rows.length + ' Strategien <em>im Nachhinein</em>; ob sie es künftig bleibt, ist offen. Prüfe auch die anderen Kennzahlen.';
        } else {
          headline = 'Im Testzeitraum schlägt <strong>keine</strong> Strategie Buy &amp; Hold ' + metricName + '. Die beste ist ' + esc(topDef.label) + ' (' + esc(paramLabel(topDef, top.params)) + '). Buy &amp; Hold bleibt hier die stärkste Wahl.';
        }

        var html = '' +
          '<div class="card">' +
            '<div class="card-header-dotted"><span class="card-title">Beste Strategie</span><span class="period-tag">' + esc(recent ? winLabel : per.label) + '</span></div>' +
            winChips() +
            '<div style="padding:10px 12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:0.8rem;line-height:1.5;margin-bottom:12px;">' +
              '<div style="margin-bottom:8px;">' + headline + '</div>' +
              '<div style="color:var(--text-dim);">Die Parameter wurden nur auf den Daten bis ' + f.date(res.trainEnd) + ' gesucht. Bewertet wird <strong style="color:var(--text-main);">ausschließlich der Testzeitraum ' + f.date(res.testStart) + ' – ' + f.date(res.testEnd) + '</strong> (' + (recent ? 'Zeitfenster: ' + winLabel : 'letzte 30 %') + '), den die Suche nie gesehen hat. ' +
              'Gegenüber Buy &amp; Hold (' + pct(bt.totalReturn, 1, true) + ', Max. DD ' + pct(bt.maxDD, 1) + ', Sharpe ' + num(bt.sharpe, 2) + ') waren im Test besser: Rendite ' + beatRet + ', Sharpe ' + beatSh + ', Drawdown ' + beatDD + ' von ' + res.rows.length + ' Strategien.</div>' +
            '</div>' +
            (recent && BEST_DAYS[state.bestWin] <= 31 ? '<div style="padding:8px 12px;border:1px solid #f59e0b;border-radius:var(--radius-sm);font-size:0.76rem;line-height:1.45;margin-bottom:10px;"><strong>Sehr kurzer Zeitraum:</strong> In ' + res.days + (res.ppy >= 200 ? ' Handelstagen' : ' Wochen') + ' haben die meisten Strategien keinen oder nur einen Trade. Die Rangfolge ist dann überwiegend Zufall und sagt wenig über die Zukunft. Aussagekräftiger sind 6 Monate oder mehr.</div>' : '') +
            '<div class="horizontal-scroll-row" style="margin-bottom:10px;"><span style="font-size:0.72rem;color:var(--text-dim);align-self:center;white-space:nowrap;">Sortieren nach (Test):</span>' +
              chip('sharpe', 'Sharpe') + chip('total', 'Rendite') + chip('dd', 'Kleinster Drawdown') + '</div>' +
            '<div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:6px;">Zeile antippen, um Strategie und Parameter zu übernehmen</div>' +
            '<div class="table-responsive-wrapper"><table class="data-table compact"><thead><tr><th>Strategie</th><th style="text-align:right;">Test-Rendite</th><th style="text-align:right;">Test-DD</th><th style="text-align:right;" title="Sharpe im Training → im Test">Sharpe</th></tr></thead><tbody>' +
            '<tr style="opacity:0.8;"><td><strong>Buy &amp; Hold</strong><div style="font-size:0.68rem;color:var(--text-dim);">Vergleichsbasis</div></td>' +
              '<td style="text-align:right;font-weight:700;color:' + tone(bt.totalReturn) + ';">' + pct(bt.totalReturn, 1, true) + '</td>' +
              '<td style="text-align:right;white-space:nowrap;">' + pct(bt.maxDD, 1) + '</td><td style="text-align:right;">' + num(bt.sharpe, 2) + '</td></tr>' +
            list.map(function (r, i) {
              var d = q.STRATEGIES[r.type];
              return '<tr data-bt-bpick="' + i + '" style="cursor:pointer;">' +
                '<td><strong>' + esc(d.label) + '</strong><div style="font-size:0.68rem;color:var(--text-dim);">' + esc(paramLabel(d, r.params)) + ' · ' + (recent ? r.tradesInTest + ' Trades im Fenster' : r.trades + ' Trades') + ' · <span style="color:' + (r.signalNow === 'long' ? 'var(--bullish)' : 'var(--text-dim)') + ';">Signal heute: ' + (r.signalNow === 'long' ? 'investiert' : 'Cash') + '</span></div></td>' +
                '<td style="text-align:right;font-weight:700;color:' + tone(r.test.totalReturn) + ';">' + pct(r.test.totalReturn, 1, true) +
                  '<div style="font-size:0.68rem;font-weight:400;color:' + tone(r.test.totalReturn - bt.totalReturn) + ';">' + pct(r.test.totalReturn - bt.totalReturn, 1, true) + '-Pkt.</div></td>' +
                '<td style="text-align:right;white-space:nowrap;">' + pct(r.test.maxDD, 1) + '</td>' +
                '<td style="text-align:right;">' + num(r.test.sharpe, 2) + '<div style="font-size:0.68rem;color:var(--text-dim);">Training ' + num(r.trainSharpe, 2) + '</div></td></tr>';
            }).join('') + '</tbody></table></div>' +
            '<div style="font-size:0.72rem;color:var(--text-dim);line-height:1.5;margin-top:12px;">' +
              '<strong style="color:var(--text-main);">So liest du das:</strong> Ein großer Abstand zwischen „Training“ und Test-Sharpe ist das typische Zeichen von Überanpassung. ' +
              'Der Testzeitraum ist nur ein Ausschnitt (hier ' + res.days + (res.ppy >= 200 ? ' Handelstage' : (res.ppy >= 40 ? ' Wochen' : ' Monate')) + ') und wurde nun mit ' + res.rows.length + ' Strategien verglichen – auch die Wahl des Siegers ist wieder eine Auswahl aus vielen. ' +
              'Länger gültig sind Ergebnisse bei langen Zeiträumen (10 Jahre oder Max.) und vielen Trades. Keine Anlageberatung.</div>' +
          '</div>';
        box.innerHTML = html;
        makeCollapsible(box, 'best');

        bindWins();
        box.querySelectorAll('[data-bt-bsort]').forEach(function (b) {
          b.onclick = function () { sortKey = b.getAttribute('data-bt-bsort'); draw(); };
        });
        box.querySelectorAll('[data-bt-bpick]').forEach(function (tr) {
          tr.onclick = function () {
            var r = list[Number(tr.getAttribute('data-bt-bpick'))];
            state.type = r.type;
            Object.keys(r.params).forEach(function (k) { state.params[r.type + '.' + k] = r.params[k]; });
            var sel = container.querySelector('#bt-type'); if (sel) sel.value = r.type;
            if (typeof container.__drawParams === 'function') container.__drawParams();
            run(container, ticker, full);
            var target = container.querySelector('#bt-single-results');
            if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          };
        });
      }
      draw();
    }, 30);
  }

  /* ---------- Kurs, Indikatoren und Kauf-/Verkaufspunkte der gewählten Strategie ---------- */
  function drawIndicators(out, hist, res, params) {
    var card = out.querySelector('#bt-ind-card');
    if (!card) return;
    var q = Q(), f = F();
    var ind = q.indicatorSeries(hist, state.type, params);
    var def = q.STRATEGIES[state.type];

    var step = Math.max(1, Math.floor(hist.length / 400));
    var idxs = [];
    for (var i = 0; i < hist.length; i += step) idxs.push(i);
    if (idxs[idxs.length - 1] !== hist.length - 1) idxs.push(hist.length - 1);
    var pick = function (arr) { return idxs.map(function (k) { return arr[k]; }); };
    var toPicked = function (k) { return Math.min(idxs.length - 1, Math.round(k / step)); };
    var labels = pick(res.dates).map(shortDate);
    var shade = pick(res.pos).map(function (v) { return v === 1; });

    var dateIdx = {};
    res.dates.forEach(function (d, k) { dateIdx[d] = k; });
    var markers = [];
    res.trades.forEach(function (t) {
      if (dateIdx[t.entryDate] != null) markers.push({ index: toPicked(dateIdx[t.entryDate]), type: 'Buy' });
      if (!t.open && dateIdx[t.exitDate] != null) markers.push({ index: toPicked(dateIdx[t.exitDate]), type: 'Sell' });
    });

    var series = [{ values: pick(hist.map(function (h) { return h.close; })), color: '#818cf8', width: 2 }];
    ind.overlays.forEach(function (o) { series.push({ values: pick(o.values), color: o.color, width: o.width || 1.5, dash: o.dash || undefined }); });

    var dot = function (color, label) { return '<div class="legend-item"><span class="legend-dot" style="background:' + color + ';"></span><span>' + label + '</span></div>'; };
    var legend = dot('#818cf8', 'Kurs') + ind.overlays.map(function (o) { return dot(o.color, esc(o.name)); }).join('') +
      '<div class="legend-item"><span style="color:#10b981;font-size:0.8rem;">▲</span><span>Kauf</span></div>' +
      '<div class="legend-item"><span style="color:#ef4444;font-size:0.8rem;">▼</span><span>Verkauf</span></div>' +
      '<div class="legend-item"><span class="legend-dot" style="background:rgba(16,185,129,0.35);"></span><span>investiert</span></div>';

    var html = '<div class="card-header-dotted"><span class="card-title">Kurs &amp; Indikatoren</span><span class="period-tag">' + esc(def.label) + '</span></div>' +
      '<div style="height:240px;position:relative;"><canvas id="bt-ind-price" class="chart-canvas" style="height:100%;"></canvas></div>' +
      '<div class="legend-row">' + legend + '</div>' +
      (ind.note ? '<div style="font-size:0.72rem;color:var(--text-dim);line-height:1.45;margin-top:6px;">' + esc(ind.note) + '</div>' : '');
    ind.panels.forEach(function (pn, k) {
      html += '<div style="font-size:0.74rem;color:var(--text-dim);font-weight:600;margin:14px 0 4px;">' + esc(pn.title) + '</div>' +
        '<div style="height:130px;position:relative;"><canvas id="bt-ind-p' + k + '" class="chart-canvas" style="height:100%;"></canvas></div>' +
        '<div class="legend-row">' + pn.lines.map(function (l) { return dot(l.color, esc(l.name)); }).join('') + '</div>';
    });
    html += '<div style="font-size:0.7rem;color:var(--text-dim);line-height:1.45;margin-top:10px;">' +
      'Dreiecke zeigen, wo die Simulation kauft bzw. verkauft: am Schlusskurs des Tages <em>nach</em> dem Signal. ' +
      (ind.ppy < 200 ? 'Bei Wochenkursen sind die Tage-Parameter in Wochen umgerechnet, die Linien entsprechen der Berechnung der Strategie.' : '') + '</div>';
    card.innerHTML = html;

    var C = window.App.Charts;
    C.renderMultiLineChart(card.querySelector('#bt-ind-price'), {
      labels: labels, series: series, markers: markers, shade: shade,
      formatY: function (v) { return f.number(v, v >= 100 ? 0 : 1); }
    });
    ind.panels.forEach(function (pn, k) {
      C.renderIndicatorChart(card.querySelector('#bt-ind-p' + k), {
        labels: labels,
        lines: pn.lines.map(function (l) { return { values: pick(l.values), color: l.color }; }),
        bars: pn.bars ? pick(pn.bars) : null,
        refLines: pn.refLines || [], shade: shade,
        min: pn.min, max: pn.max,
        formatY: function (v) { return Math.abs(v) < 10 ? f.number(v, 1) : f.number(v, 0); }
      });
    });
  }

  function run(container, ticker, full) {
    var q = Q();
    var out = container.querySelector('#bt-single-results');
    var def = q.STRATEGIES[state.type];
    var params = currentParams();

    var problem = q.validateParams(state.type, params);
    if (problem) {
      out.innerHTML = '<div class="state-box"><p>' + esc(problem) + '</p></div>';
      return;
    }
    var per = PERIODS.filter(function (p) { return p.key === state.period; })[0];
    var hist = q.sliceYears(full, per.years);
    var res = q.backtest(hist, state.type, params, state.fee / 100);
    if (res.error) { out.innerHTML = '<div class="state-box"><p>' + esc(res.error) + '</p></div>'; return; }

    var s = res.stats, b = res.bhStats, f = F();
    var diff = s.totalReturn - b.totalReturn;
    var insights = [];
    if (state.type !== 'buyhold') {
      insights.push('Die Strategie war ' + pct(s.exposure, 0) + ' der Zeit investiert.');
      insights.push('Der größte Rückgang betrug ' + pct(s.maxDD, 1) + ' – bei Buy &amp; Hold waren es ' + pct(b.maxDD, 1) + (s.maxDD > b.maxDD ? ' (die Strategie war hier ruhiger).' : ' (die Strategie war hier nicht ruhiger).'));
      if (s.trades < 10) insights.push('Mit nur ' + s.trades + ' Trades ist das Ergebnis statistisch dünn und kein Beleg für die Regel.');
    }
    var freqNote = res.ppy < 200
      ? 'Datenbasis: ' + (res.ppy >= 40 ? 'Wochenkurse' : 'Monatskurse') + '. Zeit-Parameter in Tagen werden umgerechnet (5 Handelstage ≈ 1 Woche); kurzfristige Indikatoren wie RSI, MACD oder Bollinger sind mit Tageskursen (Zeitraum 1–2 Jahre) aussagekräftiger.'
      : '';
    var paramTxt = def.params.map(function (p) { return esc(p.label) + ' ' + String(params[p.key]).replace('.', ','); }).join(' · ');

    function row(label, sv, bv, sc, bc) {
      return '<tr><td>' + label + '</td>' +
        '<td style="text-align:right;font-weight:700;' + (sc ? 'color:' + sc + ';' : '') + '">' + sv + '</td>' +
        '<td style="text-align:right;' + (bc ? 'color:' + bc + ';' : '') + '">' + bv + '</td></tr>';
    }

    var html = '' +
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">' + esc(def.label) + '</span><span class="period-tag">' + esc(per.label) + '</span></div>' +
        (paramTxt ? '<div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:10px;">' + paramTxt + ' · Kosten ' + f.number(state.fee, 2) + ' %</div>' : '') +
        (freqNote ? '<div style="font-size:0.7rem;color:var(--text-dim);line-height:1.4;margin:-4px 0 10px;">' + freqNote + '</div>' : '') +
        '<div style="padding:10px 12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:0.82rem;margin-bottom:14px;line-height:1.4;">' +
          (state.type === 'buyhold'
            ? 'Buy &amp; Hold ist die Vergleichsbasis (Einstieg am zweiten Handelstag, inkl. Kosten).'
            : 'Die Strategie lag im Zeitraum <strong style="color:' + tone(diff) + ';">' + pct(Math.abs(diff), 1) + '-Punkte ' + (diff >= 0 ? 'vor' : 'hinter') + '</strong> Buy &amp; Hold' +
              ' (' + pct(s.totalReturn, 1, true) + ' vs. ' + pct(b.totalReturn, 1, true) + ').') +
        (insights.length ? '<ul style="margin:-4px 0 14px 18px;padding:0;font-size:0.76rem;color:var(--text-dim);line-height:1.5;">' + insights.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' : '') +
        '</div>' +
        '<div class="table-responsive-wrapper"><table class="data-table compact"><thead><tr><th>Kennzahl</th><th style="text-align:right;">Strategie</th><th style="text-align:right;">Buy &amp; Hold</th></tr></thead><tbody>' +
          row('Gesamtrendite', pct(s.totalReturn, 1, true), pct(b.totalReturn, 1, true), tone(s.totalReturn), tone(b.totalReturn)) +
          row('Rendite p. a. (CAGR)', pct(s.cagr, 1, true), pct(b.cagr, 1, true), tone(s.cagr), tone(b.cagr)) +
          row('Volatilität p. a.', pct(s.vol, 1), pct(b.vol, 1)) +
          row('Max. Drawdown', pct(s.maxDD, 1), pct(b.maxDD, 1), 'var(--bearish)', 'var(--bearish)') +
          row('Sharpe Ratio', num(s.sharpe, 2), num(b.sharpe, 2)) +
          row('Calmar Ratio', num(s.calmar, 2), num(b.calmar, 2)) +
          row('Zeit investiert', pct(s.exposure, 0), '100 %') +
          row('Anzahl Trades', String(s.trades), '1') +
          row('Trefferquote', pct(s.winRate, 0), '—') +
          row('Ø Trade', pct(s.avgTrade, 1, true), '—', tone(s.avgTrade)) +
          row('Bester / schlechtester', pct(s.bestTrade, 1, true) + ' / ' + pct(s.worstTrade, 1, true), '—') +
        '</tbody></table></div>' +
      '</div>' +

      (state.type !== 'buyhold' ? '<div class="card" id="bt-ind-card"></div>' : '') +

      '<div class="card"><div class="card-header-dotted"><span class="card-title">Kapitalverlauf (Start = 100)</span>' +
        '<span class="period-tag"><span style="color:#818cf8;">●</span> Strategie &nbsp;<span style="color:#94a3b8;">●</span> Buy &amp; Hold</span></div>' +
        '<div style="height:220px;position:relative;"><canvas id="bt-single-chart" class="chart-canvas" style="height:100%;"></canvas></div></div>' +

      '<div class="card"><div class="card-header-dotted"><span class="card-title">Trades (' + res.trades.length + ')</span>' +
        (res.pendingSignal === 'long' && state.type !== 'buyhold' ? '<span class="period-tag">Signal heute: investiert</span>' : (state.type !== 'buyhold' ? '<span class="period-tag">Signal heute: Cash</span>' : '')) + '</div>';

    if (!res.trades.length) {
      html += '<div style="font-size:0.82rem;color:var(--text-dim);">Die Strategie hat im Zeitraum kein Signal erzeugt.</div>';
    } else {
      html += '<div class="table-responsive-wrapper"><table class="data-table compact"><thead><tr><th>Kauf</th><th>Verkauf</th><th style="text-align:right;">Tage</th><th style="text-align:right;">Rendite</th></tr></thead><tbody>';
      res.trades.slice().reverse().slice(0, 30).forEach(function (t) {
        html += '<tr><td>' + f.date(t.entryDate) + '</td>' +
          '<td>' + (t.open ? '<em style="color:var(--text-dim);">offen</em>' : f.date(t.exitDate)) + '</td>' +
          '<td style="text-align:right;">' + t.days + '</td>' +
          '<td style="text-align:right;font-weight:700;color:' + tone(t.ret) + ';">' + pct(t.ret, 1, true) + '</td></tr>';
      });
      html += '</tbody></table></div>';
      if (res.trades.length > 30) html += '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:6px;">Die letzten 30 von ' + res.trades.length + ' Trades.</div>';
    }
    html += '</div>' +
      helpCard(BT_HELP, 'bt') +
      '<div style="font-size:0.7rem;color:var(--text-dim);line-height:1.45;padding:2px 4px 12px;">' +
        'Simulation auf täglichen Schlusskursen (in Euro umgerechnet): Signal am Schlusskurs, Ausführung am nächsten Schlusskurs, nur Long, voll investiert oder Cash (ohne Zinsen). ' +
        'Keine Steuern, Spreads oder Teilausführungen. Wer Parameter so lange verändert, bis das Ergebnis gut aussieht, passt sie an die Vergangenheit an – das sagt nichts über die Zukunft.' +
      '</div>';

    out.innerHTML = html;
    bindHelp(out);

    drawIndicators(out, hist, res, params);

    var canvas = out.querySelector('#bt-single-chart');
    if (canvas) {
      var step = Math.max(1, Math.floor(res.equity.length / 400));
      var pick = function (arr) { return arr.filter(function (_, i) { return i % step === 0 || i === arr.length - 1; }); };
      window.App.Charts.renderMultiLineChart(canvas, {
        labels: pick(res.dates).map(shortDate),
        series: [
          { values: pick(res.buyHold), color: '#94a3b8', width: 1.5, dash: [4, 3] },
          { values: pick(res.equity), color: '#818cf8', width: 2.5 }
        ],
        formatY: function (v) { return f.number(v, 0); }
      });
    }
  }

  /** Vorauswahl von außen (z. B. Strategie-Scanner): Strategie, Parameter und Zeitraum setzen, bevor der Tab geöffnet wird. */
  function prefill(type, params, period) {
    var q = Q();
    if (!q.STRATEGIES[type]) return;
    state.type = type;
    Object.keys(params || {}).forEach(function (k) { state.params[type + '.' + k] = params[k]; });
    var ok = PERIODS.some(function (p) { return p.key === period; });
    state.period = ok ? period : 'MAX';
  }

  function getConfig() { return { type: state.type, params: currentParams() }; }

  return { render: render, prefill: prefill, getConfig: getConfig };
})();

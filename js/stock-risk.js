/**
 * js/stock-risk.js
 * Risiko-Tab der Aktiendetailseite:
 * Volatilität, Max. Drawdown, VaR/CVaR, Sharpe/Sortino/Calmar, Beta & Korrelation zu einem Benchmark-ETF,
 * Drawdown-Chart, Renditeverteilung und ein Positions-Rechner (Einsatz → möglicher Tagesverlust).
 * Alle Werte werden lokal aus den vorhandenen Kursdaten berechnet (js/quant.js).
 */

window.App = window.App || {};

window.App.StockRisk = (function () {
  'use strict';

  var Q = function () { return window.App.Quant; };
  var F = function () { return window.App.Format; };

  var BENCHMARKS = [
    { t: 'SXR8.DE', n: 'S&P 500 (SXR8)' },
    { t: 'EUNL.DE', n: 'MSCI World (EUNL)' },
    { t: 'EXS1.DE', n: 'DAX (EXS1)' },
    { t: 'CSX5.DE', n: 'Euro Stoxx 50 (CSX5)' }
  ];
  var PERIODS = [
    { key: '6M', label: '6 Mon.', years: 0.5 },
    { key: '1Y', label: '1 Jahr', years: 1 },
    { key: '2Y', label: '2 Jahre', years: 2 },
    { key: '5Y', label: '5 Jahre', years: 5 },
    { key: 'MAX', label: 'Max.', years: null }
  ];

  var state = { period: '2Y', bench: 'SXR8.DE', amount: 10000 };
  var histCache = {};   // ticker -> Promise<Array>

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

  function cell(label, value, hint, color) {
    return '<div class="metric-cell">' +
      '<span class="metric-label">' + label + '</span>' +
      '<span class="metric-value"' + (color ? ' style="color:' + color + ';"' : '') + '>' + value + '</span>' +
      (hint ? '<span style="font-size:0.65rem;color:var(--text-dim);line-height:1.3;">' + hint + '</span>' : '') +
      '</div>';
  }

  function riskLabel(volPct) {
    if (volPct < 15) return { text: 'Niedrig', color: 'var(--bullish)' };
    if (volPct < 25) return { text: 'Mittel', color: 'var(--accent-purple-light)' };
    if (volPct < 40) return { text: 'Hoch', color: '#f59e0b' };
    return { text: 'Sehr hoch', color: 'var(--bearish)' };
  }

  function getHistory(ticker, fallback) {
    if (!histCache[ticker]) histCache[ticker] = Q().loadHistory(ticker, fallback);
    return histCache[ticker];
  }

  function getBenchHistory(ticker) {
    var key = 'bench:' + ticker;
    if (!histCache[key]) histCache[key] = Q().loadHistoryFor(ticker);
    return histCache[key];
  }

  /* ---------- Rendering ---------- */
  function render(container, stock) {
    var ticker = (stock.ticker || (stock.profile && stock.profile.ticker) || '').toUpperCase();
    container.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Berechne Risikokennzahlen…</p></div>';

    getHistory(ticker, stock.chartHistory).then(function (full) {
      if (full.length < 60) {
        container.innerHTML = '<div class="state-box"><p>Zu wenig Kursdaten für eine Risikoanalyse (mindestens 60 Handelstage).</p></div>';
        return;
      }
      // Zeiträume, für die genug Daten vorhanden sind
      var span = Q().spanYears(full);
      var avail = PERIODS.filter(function (p) { return p.years == null || p.years <= span + 0.05; });
      if (!avail.some(function (p) { return p.key === state.period; })) state.period = avail[avail.length - 1].key;

      var bench = BENCHMARKS.filter(function (b) { return b.t !== ticker; });
      if (!bench.some(function (b) { return b.t === state.bench; })) state.bench = bench[0].t;

      getBenchHistory(state.bench).then(function (benchHist) {
        draw(container, stock, ticker, full, avail, bench, benchHist);
      });
    }).catch(function (err) {
      container.innerHTML = '<div class="state-box"><p>Risikoanalyse fehlgeschlagen: ' + esc(err && err.message) + '</p></div>';
    });
  }

  function draw(container, stock, ticker, full, avail, bench, benchHistFull) {
    var q = Q(), f = F();
    var per = PERIODS.filter(function (p) { return p.key === state.period; })[0];
    var hist = q.sliceYears(full, per.years);
    var benchHist = q.sliceYears(benchHistFull, per.years);
    var closes = hist.map(function (h) { return h.close; });
    var dates = hist.map(function (h) { return h.date; });
    var rets = q.returns(closes);
    var years = q.spanYears(hist);

    var vol = q.annualVol(rets) * 100;
    var dd = q.drawdown(closes, dates);
    var v95 = q.varHist(rets, 0.95), v99 = q.varHist(rets, 0.99), cv95 = q.cvarHist(rets, 0.95);
    var sh = q.sharpe(rets), so = q.sortino(rets);
    var cg = q.cagr(closes[0], closes[closes.length - 1], years);
    var calmar = (cg != null && dd.maxDD < 0) ? (cg * 100) / Math.abs(dd.maxDD) : null;
    var negDays = rets.filter(function (r) { return r < 0; }).length / (rets.length || 1) * 100;
    var best = Math.max.apply(null, rets) * 100, worst = Math.min.apply(null, rets) * 100;

    var al = benchHist.length > 30 ? q.alignedReturns(hist, benchHist) : null;
    var bc = al ? q.betaCorr(al.a, al.b) : { beta: null, corr: null };
    var lbl = riskLabel(vol);
    var curr = (stock.quote && stock.quote.currency) || 'EUR';

    var periodChips = avail.map(function (p) {
      return '<button class="chip-btn ' + (p.key === state.period ? 'active' : '') + '" data-risk-period="' + p.key + '">' + p.label + '</button>';
    }).join('');
    var benchOpts = bench.map(function (b) {
      return '<option value="' + b.t + '"' + (b.t === state.bench ? ' selected' : '') + '>' + esc(b.n) + '</option>';
    }).join('');

    var html = '' +
      '<div class="card" style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;">' +
        '<div><div style="font-size:0.72rem;color:var(--text-dim);text-transform:uppercase;font-weight:600;">Risikoprofil (nach Volatilität)</div>' +
          '<div style="font-size:1.15rem;font-weight:800;color:' + lbl.color + ';">' + lbl.text + '</div></div>' +
        '<div style="text-align:right;"><div style="font-size:0.72rem;color:var(--text-dim);">Volatilität p. a.</div>' +
          '<div style="font-size:1.15rem;font-weight:800;font-variant-numeric:tabular-nums;">' + pct(vol, 1) + '</div></div>' +
      '</div>' +

      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap;">' +
        '<div class="horizontal-scroll-row" style="margin-bottom:0;padding-bottom:0;flex:1;min-width:0;">' + periodChips + '</div>' +
      '</div>' +

      '<div class="card"><div class="card-header-dotted"><span class="card-title">Kennzahlen</span>' +
        '<span class="period-tag">' + f.date(dates[0]) + ' – ' + f.date(dates[dates.length - 1]) + '</span></div>' +
        '<div class="metrics-grid-2col">' +
          cell('Max. Drawdown', pct(dd.maxDD, 1), f.date(dd.peakDate) + ' → ' + f.date(dd.troughDate) + (dd.recoveryDate ? ', erholt ' + f.date(dd.recoveryDate) : ', noch nicht erholt'), 'var(--bearish)') +
          cell('Aktueller Drawdown', pct(dd.current, 1), 'Abstand zum Hoch im Zeitraum', dd.current < -0.05 ? 'var(--bearish)' : '') +
          cell('VaR 95 % (1 Tag)', pct(v95 == null ? null : v95 * 100, 2), 'An 1 von 20 Tagen war der Verlust größer') +
          cell('VaR 99 % (1 Tag)', pct(v99 == null ? null : v99 * 100, 2), 'An 1 von 100 Tagen war der Verlust größer') +
          cell('CVaR 95 %', pct(cv95 == null ? null : cv95 * 100, 2), 'Ø-Verlust an den schlechtesten 5 % der Tage') +
          cell('Schlechtester / bester Tag', pct(worst, 1) + ' / ' + pct(best, 1, true), 'Tagesrendite im Zeitraum') +
          cell('Sharpe Ratio', num(sh, 2), 'Überrendite je Risikoeinheit (Rf ' + f.number(q.RF * 100, 0) + ' %)') +
          cell('Sortino Ratio', num(so, 2), 'Wie Sharpe, nur Abwärtsrisiko') +
          cell('Calmar Ratio', num(calmar, 2), 'Jahresrendite ÷ max. Drawdown') +
          cell('Verlusttage', pct(negDays, 0), 'Anteil der Tage mit Minus') +
          cell('Beta', num(bc.beta, 2), al ? 'zum Benchmark (' + al.n + ' gemeinsame Tage)' : 'Benchmark-Daten fehlen') +
          cell('Korrelation', num(bc.corr, 2), 'zum Benchmark, −1 bis +1') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-top:2px;">' +
          '<label for="risk-bench" style="font-size:0.72rem;color:var(--text-dim);white-space:nowrap;">Benchmark</label>' +
          '<select id="risk-bench" class="sort-select" style="flex:1;">' + benchOpts + '</select>' +
        '</div>' +
      '</div>' +

      '<div class="card"><div class="card-header-dotted"><span class="card-title">Drawdown</span><span class="period-tag">Abstand zum bisherigen Hoch</span></div>' +
        '<div style="height:190px;position:relative;"><canvas id="risk-dd-chart" class="chart-canvas" style="height:100%;"></canvas></div></div>' +

      '<div class="card"><div class="card-header-dotted"><span class="card-title">Verteilung der Tagesrenditen</span><span class="period-tag">Häufigkeit je Klasse</span></div>' +
        '<div style="height:190px;position:relative;"><canvas id="risk-hist-chart" class="chart-canvas" style="height:100%;"></canvas></div>' +
        '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:6px;">Klassen in Prozentpunkten; die äußeren Klassen enthalten alle stärkeren Ausschläge.</div></div>' +

      '<div class="card"><div class="card-header-dotted"><span class="card-title">Positions-Rechner</span></div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
          '<label for="risk-amount" style="font-size:0.72rem;color:var(--text-dim);white-space:nowrap;">Einsatz (' + esc(curr) + ')</label>' +
          '<input id="risk-amount" class="search-input" type="number" min="0" step="100" inputmode="decimal" value="' + state.amount + '" style="flex:1;padding-left:12px;">' +
        '</div>' +
        '<div id="risk-calc"></div>' +
      '</div>' +

      '<div style="font-size:0.7rem;color:var(--text-dim);line-height:1.45;padding:2px 4px 12px;">' +
        'Alle Werte sind historisch auf Basis täglicher Schlusskurse (in Euro umgerechnet, enthält Währungseffekte). ' +
        'Der VaR ist keine Obergrenze: Echte Verluste können deutlich größer ausfallen. Vergangenheit ist keine Prognose.' +
      '</div>';

    container.innerHTML = html;

    // Charts
    var ddCanvas = container.querySelector('#risk-dd-chart');
    if (ddCanvas) {
      window.App.Charts.renderLineChart(ddCanvas, {
        labels: dates.map(shortDate),
        values: dd.series,
        formatY: function (v) { return f.number(v, 0) + ' %'; }
      });
    }
    var histCanvas = container.querySelector('#risk-hist-chart');
    if (histCanvas) {
      var hg = q.histogram(rets, 1, 7);
      window.App.Charts.renderGroupedBarChart(histCanvas, {
        labels: hg.bins.map(function (b) { return String(b); }),
        series: [{ data: hg.counts, color: '#6366f1', negColor: '#6366f1' }],
        formatY: function (v) { return f.number(v, 0); }
      });
    }

    // Positions-Rechner
    function updateCalc() {
      var amt = Number((container.querySelector('#risk-amount') || {}).value) || 0;
      state.amount = amt;
      var calc = container.querySelector('#risk-calc');
      if (!calc) return;
      if (!amt || v95 == null) { calc.innerHTML = '<div style="font-size:0.78rem;color:var(--text-dim);">Betrag eingeben.</div>'; return; }
      calc.innerHTML = '<div class="metrics-grid-2col" style="margin-bottom:0;">' +
        cell('1-Tag-VaR 95 %', f.currency(amt * v95, curr, 0), 'Verlust, der an 1 von 20 Tagen überschritten wurde', 'var(--bearish)') +
        cell('1-Tag-CVaR 95 %', f.currency(amt * (cv95 || 0), curr, 0), 'Ø-Verlust in den schlechtesten 5 % der Tage', 'var(--bearish)') +
        cell('10-Tage-VaR 95 % (Näherung)', f.currency(amt * v95 * Math.sqrt(10), curr, 0), 'Skaliert mit √10, setzt unabhängige Tage voraus') +
        cell('Max. Drawdown angewendet', f.currency(amt * Math.abs(dd.maxDD) / 100, curr, 0), 'Verlust vom Hoch zum Tief im Zeitraum', 'var(--bearish)') +
      '</div>';
    }
    updateCalc();
    var amtInput = container.querySelector('#risk-amount');
    if (amtInput) amtInput.oninput = updateCalc;

    // Interaktion
    container.querySelectorAll('[data-risk-period]').forEach(function (btn) {
      btn.onclick = function () {
        state.period = btn.getAttribute('data-risk-period');
        draw(container, stock, ticker, full, avail, bench, benchHistFull);
      };
    });
    var sel = container.querySelector('#risk-bench');
    if (sel) {
      sel.onchange = function () {
        state.bench = sel.value;
        getBenchHistory(state.bench).then(function (bh) {
          draw(container, stock, ticker, full, avail, bench, bh);
        });
      };
    }
  }

  return { render: render };
})();

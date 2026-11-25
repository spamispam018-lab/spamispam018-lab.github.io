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

  var state = { period: '2Y', bench: 'SXR8.DE', amount: 10000, helpOpen: false };
  // Erklärungen für die ⓘ-Knöpfe. {a} {s} {p} {pl} werden je nach Datenbasis (Tage/Wochen/Monate) ersetzt.
  var RISK_INFO = {
    vol: ['Volatilität p. a.', 'Wie stark die {a}renditen schwanken, auf ein Jahr hochgerechnet. Grob gilt: In etwa zwei von drei Jahren liegt die Rendite innerhalb von ± dieser Spanne um ihren Durchschnitt – real treten Ausreißer häufiger auf, als diese Faustregel vermuten lässt. Das Risikoprofil ordnet nach &lt; 15 % niedrig, &lt; 25 % mittel, &lt; 40 % hoch, darüber sehr hoch.'],
    maxdd: ['Max. Drawdown', 'Der größte Rückgang vom bisherigen Höchststand bis zum folgenden Tief im gewählten Zeitraum – das Verlustgefühl, das man hätte aushalten müssen. Ein Minus von 30 % braucht +43 %, um wieder auszugleichen.'],
    curdd: ['Aktueller Drawdown', 'Der heutige Abstand zum höchsten Kurs im gewählten Zeitraum. 0 % heißt: Die Aktie steht auf einem neuen Hoch.'],
    var95: ['VaR 95 % (Value at Risk)', 'Der Verlust, der in der Vergangenheit nur in 5 % der {p} überschritten wurde. Beispiel: 2,8 % heißt, dass an etwa 1 von 20 {pl} mehr als 2,8 % verloren gingen. Er sagt nicht, wie schlimm es in diesen Fällen wurde – dafür gibt es den CVaR.'],
    var99: ['VaR 99 %', 'Wie VaR 95 %, nur strenger: der Verlust, der nur in 1 % der {p} überschritten wurde (etwa 1 von 100 {pl}). Bei kurzen Zeiträumen beruht er auf sehr wenigen Datenpunkten.'],
    cvar: ['CVaR 95 % (Expected Shortfall)', 'Der durchschnittliche Verlust in genau diesen schlechtesten 5 % der {p}. Immer größer als der VaR und die ehrlichere Zahl für den Ernstfall.'],
    extremes: ['Schlechteste / beste {s}', 'Die stärkste {a}rendite nach unten und nach oben im gewählten Zeitraum. Zeigt, welche Ausschläge tatsächlich vorkamen.'],
    sharpe: ['Sharpe Ratio', 'Überrendite gegenüber dem risikolosen Zins je Einheit Schwankung. Unter 0: schlechter als Zinsen; um 0,5: mäßig; ab 1: gut. Stark vom gewählten Zeitraum abhängig.'],
    sortino: ['Sortino Ratio', 'Wie Sharpe, bestraft aber nur Kursrückgänge – Aufwärtsschwankungen zählen nicht als Risiko. Liegt meist über der Sharpe Ratio.'],
    calmar: ['Calmar Ratio', 'Rendite pro Jahr geteilt durch den größten Rückgang: wie viel Ertrag pro ertragenem Verlust. Über 1 ist gut, unter 0,5 eher schwach.'],
    neg: ['Verlust{p}', 'Anteil der {p} mit negativer Rendite. Auch gute Aktien liegen oft in 45–50 % der {p} im Minus.'],
    beta: ['Beta', 'Beta 1 heißt: bewegt sich im Schnitt wie der Benchmark; über 1: schwankt stärker (verstärkt Markt-Auf und -Abs); unter 1: schwächer; negativ: gegenläufig. Nur aussagekräftig, wenn die Korrelation nicht zu niedrig ist. Den Benchmark (ein ETF in Euro) wählst du unten.'],
    corr: ['Korrelation', 'Wie eng die Aktie mit dem Benchmark gleichläuft, von −1 (gegenläufig) über 0 (kein Zusammenhang) bis +1 (völlig gleich). Unter etwa 0,3 ist das Beta wenig aussagekräftig.'],
    limits: ['Grenzen der Kennzahlen', 'Alles basiert auf der Vergangenheit und den Schlusskursen in Euro (Währungsschwankungen sind enthalten). Der VaR ist keine Obergrenze, und kurze Zeiträume bilden seltene Krisen oft gar nicht ab – ein längerer Zeitraum ist aussagekräftiger.'],
    ddchart: ['Drawdown-Chart', 'Zeigt für jeden Zeitpunkt den Abstand zum bisherigen Hoch. 0 % bedeutet: neues Hoch. Lange, tiefe Täler sind die Phasen, in denen man auf der Position hätte sitzen müssen, ohne im Plus zu sein.'],
    dist: ['Renditeverteilung', 'Wie oft welche {a}rendite vorkam. Eine breite Glocke bedeutet hohe Schwankung; Balken weit außen links sind die seltenen, aber schmerzhaften {p}.'],
    calc: ['Positions-Rechner', 'Rechnet die Prozentwerte auf deinen Einsatz um. Der 10-{p}-Wert skaliert den Einzelwert mit √10 – eine grobe Näherung, die Erholung und Serien schlechter {p} ignoriert.']
  };

  function infoDict(U) {
    var out = {};
    function fill(t) { return t.replace(/\{a\}/g, U.a).replace(/\{s\}/g, U.s).replace(/\{pl\}/g, U.pl).replace(/\{p\}/g, U.p); }
    Object.keys(RISK_INFO).forEach(function (k) { out[k] = { title: fill(RISK_INFO[k][0]), text: fill(RISK_INFO[k][1]) }; });
    out.neg.title = 'Verlust' + U.p.toLowerCase();
    return out;
  }

  function info(key) { return window.App.UI && window.App.UI.info ? window.App.UI.info(key) : ''; }

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


  function cell(label, value, hint, color, infoKey) {
    return '<div class="metric-cell">' +
      '<span class="metric-label" style="display:flex;align-items:center;">' + label + (infoKey ? info(infoKey) : '') + '</span>' +
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
    var ck = ticker + (Q().preferDaily() ? ':d' : '');
    if (!histCache[ck]) histCache[ck] = Q().loadHistory(ticker, fallback);
    return histCache[ck];
  }

  function getBenchHistory(ticker) {
    var key = 'bench:' + ticker + (Q().preferDaily() ? ':d' : '');
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
    var ppy = q.periodsPerYear(hist);   // 252 = Tageskurse, 52 = Wochenkurse, 12 = Monatskurse
    var U = ppy >= 200 ? { s: 'Tag', p: 'Tage', pl: 'Tagen', a: 'Tages', adj: 'Tag' } : (ppy >= 40 ? { s: 'Woche', p: 'Wochen', pl: 'Wochen', a: 'Wochen', adj: 'Woche' } : { s: 'Monat', p: 'Monate', pl: 'Monaten', a: 'Monats', adj: 'Monat' });

    var vol = q.annualVol(rets, ppy) * 100;
    var dd = q.drawdown(closes, dates);
    var v95 = q.varHist(rets, 0.95), v99 = q.varHist(rets, 0.99), cv95 = q.cvarHist(rets, 0.95);
    var sh = q.sharpe(rets, ppy), so = q.sortino(rets, ppy);
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

    var summaryHtml = '';
    if (v95 != null) {
      var betaTxt = '';
      if (bc.beta != null) {
        betaTxt = ' Gegenüber dem Benchmark schwankt sie ' + (bc.beta > 1.1 ? 'stärker' : bc.beta < 0.9 ? 'schwächer' : 'ähnlich') + ' (Beta ' + num(bc.beta, 2) + ')' +
          (Math.abs(bc.corr) < 0.3 ? ', allerdings bei geringem Gleichlauf (Korrelation ' + num(bc.corr, 2) + ') – das Beta ist dann wenig aussagekräftig' : '') + '.';
      }
      summaryHtml = '<div style="padding:10px 12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:0.8rem;line-height:1.5;margin-bottom:14px;">' +
        'Die Aktie schwankte im Zeitraum mit ' + pct(vol, 1) + ' pro Jahr (Risikoprofil: ' + lbl.text + '). ' +
        'Der größte Rückgang vom Hoch zum Tief betrug ' + pct(dd.maxDD, 1) + (dd.maxDD < 0 ? (dd.recoveryDate ? ' und war am ' + f.date(dd.recoveryDate) + ' wieder aufgeholt' : ' und ist noch nicht aufgeholt') : '') + '. ' +
        'An 1 von 20 ' + U.pl + ' lag der ' + U.a + 'verlust über ' + pct(v95 * 100, 1) + '.' + betaTxt + '</div>';
    }

    var html = '' +
      '<div class="card" style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;">' +
        '<div><div style="font-size:0.72rem;color:var(--text-dim);text-transform:uppercase;font-weight:600;">Risikoprofil (nach Volatilität)</div>' +
          '<div style="font-size:1.15rem;font-weight:800;color:' + lbl.color + ';">' + lbl.text + '</div></div>' +
        '<div style="text-align:right;"><div style="font-size:0.72rem;color:var(--text-dim);display:flex;align-items:center;justify-content:flex-end;white-space:nowrap;">Volatilität p. a.' + info('vol') + '</div>' +
          '<div style="font-size:1.15rem;font-weight:800;font-variant-numeric:tabular-nums;">' + pct(vol, 1) + '</div></div>' +
      '</div>' +

      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap;">' +
        '<div class="horizontal-scroll-row" style="margin-bottom:0;padding-bottom:0;flex:1;min-width:0;">' + periodChips + '</div>' +
      '</div>' +

      '<div class="card"><div class="card-header-dotted"><span class="card-title" style="display:flex;align-items:center;">Kennzahlen' + info('limits') + '</span>' +
        '<span class="period-tag">' + f.date(dates[0]) + ' – ' + f.date(dates[dates.length - 1]) + '</span></div>' +
        summaryHtml +
        '<div class="metrics-grid-2col">' +
          cell('Max. Drawdown', pct(dd.maxDD, 1), f.date(dd.peakDate) + ' → ' + f.date(dd.troughDate) + (dd.recoveryDate ? ', erholt ' + f.date(dd.recoveryDate) : ', noch nicht erholt'), 'var(--bearish)', 'maxdd') +
          cell('Aktueller Drawdown', pct(dd.current, 1), 'Abstand zum Hoch im Zeitraum', dd.current < -0.05 ? 'var(--bearish)' : '', 'curdd') +
          cell('VaR 95 % (1 ' + U.s + ')', pct(v95 == null ? null : v95 * 100, 2), 'An 1 von 20 ' + U.pl + ' war der Verlust größer', '', 'var95') +
          cell('VaR 99 % (1 ' + U.s + ')', pct(v99 == null ? null : v99 * 100, 2), 'An 1 von 100 ' + U.pl + ' war der Verlust größer', '', 'var99') +
          cell('CVaR 95 %', pct(cv95 == null ? null : cv95 * 100, 2), 'Ø-Verlust in den schlechtesten 5 % der ' + U.p, '', 'cvar') +
          cell('Schlechteste / beste ' + U.s, pct(worst, 1) + ' / ' + pct(best, 1, true), U.a + 'rendite im Zeitraum', '', 'extremes') +
          cell('Sharpe Ratio', num(sh, 2), 'Überrendite je Risikoeinheit (Rf ' + f.number(q.RF * 100, 0) + ' %)', '', 'sharpe') +
          cell('Sortino Ratio', num(so, 2), 'Wie Sharpe, nur Abwärtsrisiko', '', 'sortino') +
          cell('Calmar Ratio', num(calmar, 2), 'Jahresrendite ÷ max. Drawdown', '', 'calmar') +
          cell('Verlust' + U.p.toLowerCase(), pct(negDays, 0), 'Anteil der ' + U.p + ' mit Minus', '', 'neg') +
          cell('Beta', num(bc.beta, 2), al ? 'zum Benchmark (' + al.n + ' gemeinsame Zeitpunkte)' : 'Benchmark-Daten fehlen', '', 'beta') +
          cell('Korrelation', num(bc.corr, 2), 'zum Benchmark, −1 bis +1', '', 'corr') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-top:2px;">' +
          '<label for="risk-bench" style="font-size:0.72rem;color:var(--text-dim);white-space:nowrap;">Benchmark</label>' +
          '<select id="risk-bench" class="sort-select" style="flex:1;">' + benchOpts + '</select>' +
        '</div>' +
      '</div>' +

      '<div class="card"><div class="card-header-dotted"><span class="card-title" style="display:flex;align-items:center;">Drawdown' + info('ddchart') + '</span><span class="period-tag">Abstand zum bisherigen Hoch</span></div>' +
        '<div style="height:190px;position:relative;"><canvas id="risk-dd-chart" class="chart-canvas" style="height:100%;"></canvas></div></div>' +

      '<div class="card"><div class="card-header-dotted"><span class="card-title" style="display:flex;align-items:center;">Verteilung der ' + U.a + 'renditen' + info('dist') + '</span><span class="period-tag">Häufigkeit je Klasse</span></div>' +
        '<div style="height:190px;position:relative;"><canvas id="risk-hist-chart" class="chart-canvas" style="height:100%;"></canvas></div>' +
        '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:6px;">Klassen in Prozentpunkten; die äußeren Klassen enthalten alle stärkeren Ausschläge.</div></div>' +

      '<div class="card"><div class="card-header-dotted"><span class="card-title" style="display:flex;align-items:center;">Positions-Rechner' + info('calc') + '</span></div>' +
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
    if (window.App.UI && window.App.UI.bindInfo) window.App.UI.bindInfo(container, infoDict(U));

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
      var hg = q.histogram(rets, ppy >= 200 ? 1 : (ppy >= 40 ? 2 : 4), 7);
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
        cell('1-' + U.adj + '-VaR 95 %', f.currency(amt * v95, curr, 0), 'Verlust, der an 1 von 20 ' + U.pl + ' überschritten wurde', 'var(--bearish)') +
        cell('1-' + U.adj + '-CVaR 95 %', f.currency(amt * (cv95 || 0), curr, 0), 'Ø-Verlust in den schlechtesten 5 % der ' + U.p, 'var(--bearish)') +
        cell('10-' + U.p + '-VaR 95 % (Näherung)', f.currency(amt * v95 * Math.sqrt(10), curr, 0), 'Skaliert mit √10, setzt unabhängige Perioden voraus') +
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

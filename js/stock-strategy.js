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

  var state = { type: 'sma_cross', params: {}, period: 'MAX', fee: 0.1 };
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

  function currentParams() {
    var def = Q().defaultParams(state.type);
    var out = {};
    Object.keys(def).forEach(function (k) {
      var v = Number(state.params[state.type + '.' + k]);
      out[k] = isFinite(v) && v > 0 ? Math.round(v) : def[k];
    });
    return out;
  }

  function render(container, stock) {
    var ticker = (stock.ticker || (stock.profile && stock.profile.ticker) || '').toUpperCase();
    container.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Lade Kurshistorie…</p></div>';

    if (!histCache[ticker]) histCache[ticker] = Q().loadHistory(ticker, stock.chartHistory);
    histCache[ticker].then(function (full) {
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
            '<div id="bt-desc" style="font-size:0.72rem;color:var(--text-dim);margin-top:6px;line-height:1.4;"></div></div>' +
          '<div id="bt-params" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;"></div>' +
          '<div><div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:4px;">Zeitraum</div>' +
            '<div class="horizontal-scroll-row" style="margin-bottom:0;padding-bottom:0;">' + chips + '</div></div>' +
          '<div><label for="bt-fee" style="font-size:0.72rem;color:var(--text-dim);">Kosten je Kauf/Verkauf (%)</label>' +
            '<input id="bt-fee" class="search-input" type="number" min="0" max="5" step="0.05" inputmode="decimal" value="' + state.fee + '" style="width:100%;margin-top:4px;padding-left:12px;"></div>' +
          '<button class="chip-btn active" id="bt-run" style="height:42px;justify-content:center;">Backtest starten</button>' +
        '</div>' +
      '</div>' +
      '<div id="bt-single-results"></div>';

    container.innerHTML = html;

    function drawParams() {
      var def = q.STRATEGIES[state.type];
      container.querySelector('#bt-desc').textContent = def.desc;
      var cur = currentParams();
      container.querySelector('#bt-params').innerHTML = def.params.map(function (p) {
        return '<div><label for="bt-p-' + p.key + '" style="font-size:0.72rem;color:var(--text-dim);">' + esc(p.label) + '</label>' +
          '<input id="bt-p-' + p.key + '" data-pkey="' + p.key + '" class="search-input" type="number" min="' + p.min + '" max="' + p.max + '" step="1" inputmode="numeric" value="' + cur[p.key] + '" style="width:100%;margin-top:4px;padding-left:12px;"></div>';
      }).join('');
      container.querySelectorAll('#bt-params input').forEach(function (inp) {
        inp.oninput = function () { state.params[state.type + '.' + inp.getAttribute('data-pkey')] = inp.value; };
      });
    }
    drawParams();

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
    container.querySelector('#bt-run').onclick = function () { run(container, ticker, full); };

    run(container, ticker, full);   // direkt ein erstes Ergebnis zeigen
  }

  function run(container, ticker, full) {
    var q = Q();
    var out = container.querySelector('#bt-single-results');
    var def = q.STRATEGIES[state.type];
    var params = currentParams();

    if (state.type === 'sma_cross' && params.fast >= params.slow) {
      out.innerHTML = '<div class="state-box"><p>Der schnelle Durchschnitt muss kürzer sein als der langsame.</p></div>';
      return;
    }
    var per = PERIODS.filter(function (p) { return p.key === state.period; })[0];
    var hist = q.sliceYears(full, per.years);
    var res = q.backtest(hist, state.type, params, state.fee / 100);
    if (res.error) { out.innerHTML = '<div class="state-box"><p>' + esc(res.error) + '</p></div>'; return; }

    var s = res.stats, b = res.bhStats, f = F();
    var diff = s.totalReturn - b.totalReturn;
    var paramTxt = def.params.map(function (p) { return esc(p.label) + ' ' + params[p.key]; }).join(' · ');

    function row(label, sv, bv, sc, bc) {
      return '<tr><td>' + label + '</td>' +
        '<td style="text-align:right;font-weight:700;' + (sc ? 'color:' + sc + ';' : '') + '">' + sv + '</td>' +
        '<td style="text-align:right;' + (bc ? 'color:' + bc + ';' : '') + '">' + bv + '</td></tr>';
    }

    var html = '' +
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">' + esc(def.label) + '</span><span class="period-tag">' + esc(per.label) + '</span></div>' +
        (paramTxt ? '<div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:10px;">' + paramTxt + ' · Kosten ' + f.number(state.fee, 2) + ' %</div>' : '') +
        '<div style="padding:10px 12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:0.82rem;margin-bottom:14px;line-height:1.4;">' +
          (state.type === 'buyhold'
            ? 'Buy &amp; Hold ist die Vergleichsbasis (Einstieg am zweiten Handelstag, inkl. Kosten).'
            : 'Die Strategie lag im Zeitraum <strong style="color:' + tone(diff) + ';">' + pct(Math.abs(diff), 1) + '-Punkte ' + (diff >= 0 ? 'vor' : 'hinter') + '</strong> Buy &amp; Hold' +
              ' (' + pct(s.totalReturn, 1, true) + ' vs. ' + pct(b.totalReturn, 1, true) + ').') +
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
      '<div style="font-size:0.7rem;color:var(--text-dim);line-height:1.45;padding:2px 4px 12px;">' +
        'Simulation auf täglichen Schlusskursen (in Euro umgerechnet): Signal am Schlusskurs, Ausführung am nächsten Schlusskurs, nur Long, voll investiert oder Cash (ohne Zinsen). ' +
        'Keine Steuern, Spreads oder Teilausführungen. Wer Parameter so lange verändert, bis das Ergebnis gut aussieht, passt sie an die Vergangenheit an – das sagt nichts über die Zukunft.' +
      '</div>';

    out.innerHTML = html;

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

  return { render: render };
})();

/**
 * js/strategies.js
 * Vordefinierte Anlagestrategien (Value, Growth, Dividende, Momentum, Buy the Dip).
 * NEU: Dynamische Slider für jede Strategie, um Kriterien live anzupassen.
 * NEU: KI-Abfrage (Gemini) für die Top-Ergebnisse inkl. Kontext der aktuellen Strategie & Slider-Werte.
 * FIX: Robusteres Handling von fehlenden Daten.
 */
window.App = window.App || {};

window.App.Strategies = (function () {
  'use strict';

  var currentStrategy = 'value';
  var allStocks = [];

  var sliderState = {
    value: { maxPe: 20, minRoe: 15, maxDebt: 2.5 },
    growth: { minRs: 80, minRevGrowth: 20, minVol: 100000 },
    dividend: { minYield: 2.5, maxPayout: 60 },
    momentum: { minRs: 80, minChange: 2 },
    buythedip: { ddMin: 7, ddMax: 25, rsiMax: 45, minRoe: 10, maxPe: 35, needTrend: true },
    selloff: { ddMin: 20, minRoe: 15, maxFwdPe: 30, minUpside: 10 }
  };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;

    var headerFilterBtn = document.getElementById('btn-header-filter');
    if (headerFilterBtn) headerFilterBtn.style.display = 'none';

    container.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Lade Strategien...</p></div>';

    window.App.Data.getUniverse().then(function (stocks) {
      allStocks = stocks || [];
      universeCache = allStocks; // Für KI-Prompt cachen
      render(container);
    });
  }

  function render(container) {
    var html = '<div class="view-container">' +
      '<div style="margin-bottom: 16px;">' +
        '<h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">Strategie-Screener</h2>' +
        '<div style="font-size: 0.78rem; color: var(--text-dim);">Finde Aktien basierend auf bewährten Investment-Strategien.</div>' +
      '</div>' +

      '<div class="main-tabs-row" style="margin-bottom: 16px; overflow-x: auto; white-space: nowrap;">' +
        '<button class="main-tab-btn ' + (currentStrategy === 'value' ? 'active' : '') + '" data-strat="value">💎 Value &amp; Qualität</button>' +
        '<button class="main-tab-btn ' + (currentStrategy === 'growth' ? 'active' : '') + '" data-strat="growth">🚀 Growth &amp; Momentum</button>' +
        '<button class="main-tab-btn ' + (currentStrategy === 'dividend' ? 'active' : '') + '" data-strat="dividend">💰 Dividende</button>' +
        '<button class="main-tab-btn ' + (currentStrategy === 'momentum' ? 'active' : '') + '" data-strat="momentum">📈 Momentum</button>' +
        '<button class="main-tab-btn ' + (currentStrategy === 'buythedip' ? 'active' : '') + '" data-strat="buythedip">🎯 Buy the Dip</button>' +
        '<button class="main-tab-btn ' + (currentStrategy === 'selloff' ? 'active' : '') + '" data-strat="selloff">📉 Qualität im Ausverkauf</button>' +
      '</div>' +

      '<div id="strategy-info" class="card" style="padding: 14px; margin-bottom: 14px; background: var(--bg-secondary); font-size: 0.75rem; color: var(--text-muted); line-height: 1.5;"></div>' +
      
      '<div id="strategy-sliders" class="card" style="padding: 14px; margin-bottom: 14px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
          '<span style="font-size:0.85rem; font-weight:700; color:var(--text-main);">Filter anpassen</span>' +
          '<div style="display:flex;gap:6px;">' +
            '<button class="chip-btn" id="btn-calibrate-strategy" style="padding: 2px 8px; font-size: 0.7rem;">⚙ An Daten anpassen</button>' +
            '<button class="chip-btn" id="btn-reset-strategy" style="padding: 2px 8px; font-size: 0.7rem;">Zurücksetzen</button>' +
          '</div>' +
        '</div>' +
        '<div id="strategy-slider-inputs" style="display: flex; flex-direction: column; gap: 12px;"></div>' +
        '<div id="strategy-cal-note" style="display:none;font-size:0.7rem;color:var(--text-dim);margin-top:10px;line-height:1.45;"></div>' +
      '</div>' +

      '<div id="strategy-results"></div>' +
    '</div>';

    container.innerHTML = html;

    container.querySelectorAll('[data-strat]').forEach(function (btn) {
      btn.onclick = function () {
        currentStrategy = btn.getAttribute('data-strat');
        render(container);
      };
    });

    renderSliders(container);
    applyStrategy(container);
  }

  function renderSliders(container) {
    var sliderHost = container.querySelector('#strategy-slider-inputs');
    var infoEl = container.querySelector('#strategy-info');
    var resetBtn = container.querySelector('#btn-reset-strategy');
    
    var calBtn = container.querySelector('#btn-calibrate-strategy');
    if (calBtn) calBtn.onclick = function () { calibrate(container); };

    resetBtn.onclick = function() {
      var nt = container.querySelector('#strategy-cal-note'); if (nt) nt.style.display = 'none';
      if (currentStrategy === 'value') sliderState.value = { maxPe: 20, minRoe: 15, maxDebt: 2.5 };
      if (currentStrategy === 'growth') sliderState.growth = { minRs: 80, minRevGrowth: 20, minVol: 100000 };
      if (currentStrategy === 'dividend') sliderState.dividend = { minYield: 2.5, maxPayout: 60 };
      if (currentStrategy === 'momentum') sliderState.momentum = { minRs: 80, minChange: 2 };
      if (currentStrategy === 'buythedip') sliderState.buythedip = { ddMin: 7, ddMax: 25, rsiMax: 45, minRoe: 10, maxPe: 35, needTrend: true };
      if (currentStrategy === 'selloff') sliderState.selloff = { ddMin: 20, minRoe: 15, maxFwdPe: 30, minUpside: 10 };
      renderSliders(container);
      applyStrategy(container);
    };

    var html = '';

    if (currentStrategy === 'value') {
      infoEl.innerHTML = '<b>A. Value &amp; Qualität (Warren Buffett / Susan Levermann):</b><br><br><b>Kriterien:</b> Marktkap. > 1 Mrd. €, KGV <span id="val-pe">' + sliderState.value.maxPe + '</span>, Eigenkapitalrendite (ROE) > <span id="val-roe">' + sliderState.value.minRoe + '</span> %, Verschuldung (Net Debt / EBITDA) < <span id="val-debt">' + sliderState.value.maxDebt + '</span>, positive Nettomarge.';
      
      html += sliderRow('value-maxPe', 'Maximales KGV', 5, 50, 1, sliderState.value.maxPe, '');
      html += sliderRow('value-minRoe', 'Min. Eigenkapitalrendite (ROE) %', 0, 50, 1, sliderState.value.minRoe, '');
      html += sliderRow('value-maxDebt', 'Max. Verschuldung (Debt/EBITDA)', 0, 10, 0.5, sliderState.value.maxDebt, '');
    } 
    else if (currentStrategy === 'growth') {
      infoEl.innerHTML = '<b>B. Growth &amp; Momentum (Mark Minervini / IBD 50):</b><br><br><b>Kriterien:</b> Trendstärke (Golden Cross), Relative Stärke (RS-Rating ≥ <span id="val-rs">' + sliderState.growth.minRs + '</span>), Umsatzwachstum > <span id="val-rev">' + sliderState.growth.minRevGrowth + '</span> %, Mindestvolumen > <span id="val-vol">' + sliderState.growth.minVol.toLocaleString('de-DE') + '</span>.';
      
      html += sliderRow('growth-minRs', 'Min. Relative Stärke (RS-Rating)', 0, 100, 1, sliderState.growth.minRs, '');
      html += sliderRow('growth-minRevGrowth', 'Min. Umsatzwachstum %', 0, 50, 1, sliderState.growth.minRevGrowth, '');
      html += sliderRow('growth-minVol', 'Min. Tagesvolumen', 0, 1000000, 50000, sliderState.growth.minVol, ' (Stk.)');
    } 
    else if (currentStrategy === 'dividend') {
      infoEl.innerHTML = '<b>C. Dividenden-Strategie:</b><br><br><b>Kriterien:</b> Dividendenrendite > <span id="val-yield">' + sliderState.dividend.minYield + '</span> %, Payout Ratio (Ausschüttungsquote) < <span id="val-payout">' + sliderState.dividend.maxPayout + '</span> %, positive Nettomarge.';
      
      html += sliderRow('div-minYield', 'Min. Dividendenrendite %', 0, 10, 0.5, sliderState.dividend.minYield, '');
      html += sliderRow('div-maxPayout', 'Max. Payout Ratio %', 10, 100, 5, sliderState.dividend.maxPayout, '');
    }
    else if (currentStrategy === 'momentum') {
      infoEl.innerHTML = '<b>D. Momentum- / Trendfolge-Strategie:</b><br><br><b>Kriterien:</b> Du kaufst Aktien, deren Kurse bereits stark steigen, in der Annahme, dass der Trend sich kurz- bis mittelfristig fortsetzt.<br><br>Relative Stärke (RS-Rating) ≥ <span id="val-mom-rs">' + sliderState.momentum.minRs + '</span>, Tagesanstieg ≥ <span id="val-mom-change">' + sliderState.momentum.minChange + '</span> %.';
      
      html += sliderRow('mom-minRs', 'Min. Relative Stärke (RS-Rating)', 0, 100, 1, sliderState.momentum.minRs, '');
      html += sliderRow('mom-minChange', 'Min. Kursanstieg (Tag) %', 0, 20, 0.5, sliderState.momentum.minChange, ' %');
    }
    else if (currentStrategy === 'selloff') {
      var so = sliderState.selloff;
      infoEl.innerHTML = '<b>F. Qualität im Ausverkauf:</b><br><br>Starke Firmen nach einem <b>kräftigen Einbruch</b>: mindestens ' + so.ddMin + ' % unter dem Hoch der letzten 3 Monate. ' +
        'Anders als bei Buy the Dip darf der Langfristtrend gebrochen sein – das ist hier das Risiko und wird an jedem Wert angezeigt (unter EMA 200, fallendes Messer, starker Monatsverlust).<br><br>' +
        'Dafür strenge Qualität: ROE ≥ ' + so.minRoe + ' %, Gewinn, Forward-KGV ≤ ' + so.maxFwdPe + (so.minUpside > 0 ? ', Analysten-Kursziel mind. +' + so.minUpside + ' %' : '') + ', Börsenwert > 5 Mrd. €, keine hohe Verschuldung. ' +
        'Sortiert nach Score aus Qualität, Bewertung, Kursziel und Stabilisierung. <b>Höheres Risiko</b> – der Einbruch kann weitergehen.';
      html += sliderRow('so-ddMin', 'Rückgang vom 3M-Hoch mindestens', 10, 60, 1, so.ddMin, ' %');
      html += sliderRow('so-minRoe', 'Min. Eigenkapitalrendite (ROE)', 5, 50, 1, so.minRoe, ' %');
      html += sliderRow('so-maxFwdPe', 'Max. Forward-KGV', 8, 60, 1, so.maxFwdPe, '');
      html += sliderRow('so-minUpside', 'Min. Kursziel-Potenzial (0 = egal)', 0, 60, 5, so.minUpside, ' %');
    }
    else if (currentStrategy === 'buythedip') {
      var bd = sliderState.buythedip;
      infoEl.innerHTML = '<b>E. Buy the Dip:</b><br><br>Gesunde Aktien im <b>Rücksetzer</b>: Der Kurs liegt ' + bd.ddMin + '–' + bd.ddMax + ' % unter dem Hoch der letzten 3 Monate, ' +
        (bd.needTrend ? 'der <b>Langfristtrend</b> ist intakt (Kurs höchstens 3 % unter dem EMA 200), ' : '') +
        'der RSI zeigt einen kurzfristigen Ausverkauf (≤ ' + bd.rsiMax + '), und es ist kein „fallendes Messer“. Qualität: ROE ≥ ' + bd.minRoe + ' %, KGV ≤ ' + bd.maxPe + ', Börsenwert > 1 Mrd. €.<br><br>' +
        'Sortiert nach <b>Dip-Score</b> (0–100): Rücksetzer um 10–20 %, niedriger RSI, Abstand über EMA 200, beginnende Stabilisierung und Analysten-Kursziel geben Punkte. Kein Kaufsignal – ein Rücksetzer kann weitergehen.';

      html += sliderRow('dip-ddMin', 'Rücksetzer vom 3M-Hoch mindestens', 3, 20, 1, bd.ddMin, ' %');
      html += sliderRow('dip-ddMax', 'Rücksetzer höchstens', 10, 50, 1, bd.ddMax, ' %');
      html += sliderRow('dip-rsiMax', 'RSI höchstens', 25, 60, 1, bd.rsiMax, '');
      html += sliderRow('dip-minRoe', 'Min. Eigenkapitalrendite (ROE)', 0, 40, 1, bd.minRoe, ' %');
      html += sliderRow('dip-maxPe', 'Maximales KGV', 5, 60, 1, bd.maxPe, '');
      html += '<label style="display:flex;align-items:center;gap:8px;font-size:0.78rem;color:var(--text-muted);cursor:pointer;">' +
        '<input type="checkbox" id="dip-needTrend"' + (bd.needTrend ? ' checked' : '') + '> Nur mit intaktem Langfristtrend (über EMA 200)</label>';
    }

    sliderHost.innerHTML = html;

    var trendBox = sliderHost.querySelector('#dip-needTrend');
    if (trendBox) trendBox.onchange = function () { sliderState.buythedip.needTrend = trendBox.checked; applyStrategy(container); };

    sliderHost.querySelectorAll('input[type="range"]').forEach(function(input) {
      input.oninput = function() {
        var val = parseFloat(input.value);
        var id = input.id;

        if (id === 'value-maxPe') sliderState.value.maxPe = val;
        if (id === 'value-minRoe') sliderState.value.minRoe = val;
        if (id === 'value-maxDebt') sliderState.value.maxDebt = val;
        
        if (id === 'growth-minRs') sliderState.growth.minRs = val;
        if (id === 'growth-minRevGrowth') sliderState.growth.minRevGrowth = val;
        if (id === 'growth-minVol') sliderState.growth.minVol = val;
        
        if (id === 'div-minYield') sliderState.dividend.minYield = val;
        if (id === 'div-maxPayout') sliderState.dividend.maxPayout = val;

        if (id === 'mom-minRs') sliderState.momentum.minRs = val;
        if (id === 'mom-minChange') sliderState.momentum.minChange = val;

        if (id.indexOf('dip-') === 0) sliderState.buythedip[id.slice(4)] = val;
        if (id.indexOf('so-') === 0) sliderState.selloff[id.slice(3)] = val;

        var valLabel = input.previousElementSibling.querySelector('.slider-val');
        if (valLabel) {
            var suffix = input.getAttribute('data-suffix') || '';
            valLabel.textContent = val.toLocaleString('de-DE') + suffix;
        }
        
        if (id === 'value-maxPe') container.querySelector('#val-pe').textContent = val;
        if (id === 'value-minRoe') container.querySelector('#val-roe').textContent = val;
        if (id === 'value-maxDebt') container.querySelector('#val-debt').textContent = val;
        if (id === 'growth-minRs') container.querySelector('#val-rs').textContent = val;
        if (id === 'growth-minRevGrowth') container.querySelector('#val-rev').textContent = val;
        if (id === 'growth-minVol') container.querySelector('#val-vol').textContent = val.toLocaleString('de-DE');
        if (id === 'div-minYield') container.querySelector('#val-yield').textContent = val;
        if (id === 'div-maxPayout') container.querySelector('#val-payout').textContent = val;
        
        if (id === 'mom-minRs') container.querySelector('#val-mom-rs').textContent = val;
        if (id === 'mom-minChange') container.querySelector('#val-mom-change').textContent = val;


        applyStrategy(container);
      };
    });
  }

  function sliderRow(id, label, min, max, step, currentValue, suffix) {
    return '<div>' +
      '<div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-dim); margin-bottom:4px;">' +
        '<span>' + label + '</span>' +
        '<span class="slider-val" style="font-weight:700; color:var(--accent-purple-light);">' + currentValue.toLocaleString('de-DE') + suffix + '</span>' +
      '</div>' +
      '<input type="range" class="range-slider" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + currentValue + '" data-suffix="' + suffix + '">' +
    '</div>';
  }

  /* ------------------------------------------------------------------
   * "An Daten anpassen": Reglerwerte aus der aktuellen Verteilung im Markt ableiten.
   * Jeder Regler bekommt eine Perzentil-Schwelle (z. B. KGV unter dem günstigsten Drittel, ROE im oberen
   * Drittel). Danach wird die Strenge stufenweise verschoben, bis 8–30 Treffer übrig bleiben.
   * ------------------------------------------------------------------ */
  function nnum(v) { var n = Number(v); return v === null || v === undefined || v === '' || !isFinite(n) ? null : n; }
  function depth3m(s) {
    var c = Array.isArray(s.closes) ? s.closes.filter(function (x) { return x > 0; }) : [];
    if (c.length < 20 || !(s.price > 0)) return null;
    return (1 - s.price / Math.max.apply(null, c.concat([s.price]))) * 100;
  }
  // dir 'min': Wert muss ≥ Schwelle sein (höheres Perzentil = strenger); 'max': ≤ Schwelle (höher = lockerer)
  var KNOBS = {
    value: [
      { key: 'maxPe', dir: 'max', pct: 35, lo: 5, hi: 50, step: 1, get: function (s) { var v = nnum(s.pe); return v > 0 ? v : null; } },
      { key: 'minRoe', dir: 'min', pct: 55, lo: 0, hi: 50, step: 1, get: function (s) { var v = nnum(s.returnOnEquity); return v === null ? null : v * 100; } },
      { key: 'maxDebt', dir: 'max', pct: 60, lo: 0, hi: 10, step: 0.5, get: function (s) { var v = nnum(s.debtToEbitda); return v !== null && v >= 0 ? v : null; } }
    ],
    growth: [
      { key: 'minRs', dir: 'min', pct: 70, lo: 0, hi: 100, step: 1, get: function (s) { return nnum(s.rsRating); } },
      { key: 'minRevGrowth', dir: 'min', pct: 65, lo: 0, hi: 50, step: 1, get: function (s) { var v = nnum(s.revGrowth); return v === null ? null : v * 100; } },
      { key: 'minVol', dir: 'min', pct: 25, lo: 0, hi: 1000000, step: 50000, get: function (s) { return nnum(s.volume); } }
    ],
    dividend: [
      { key: 'minYield', dir: 'min', pct: 60, lo: 0, hi: 10, step: 0.5, get: function (s) { var v = nnum(s.dividendYield); return v > 0 ? v : null; } },
      { key: 'maxPayout', dir: 'max', pct: 70, lo: 10, hi: 100, step: 5, get: function (s) { var v = nnum(s.payoutRatio); return v > 0 ? v * 100 : null; } }
    ],
    momentum: [
      { key: 'minRs', dir: 'min', pct: 85, lo: 0, hi: 100, step: 1, get: function (s) { return nnum(s.rsRating); } },
      { key: 'minChange', dir: 'min', pct: 80, lo: 0, hi: 20, step: 0.5, get: function (s) { return nnum(s.changePercent); } }
    ],
    buythedip: [
      { key: 'rsiMax', dir: 'max', pct: 35, lo: 25, hi: 60, step: 1, get: function (s) { return nnum(s.rsi); } },
      { key: 'minRoe', dir: 'min', pct: 35, lo: 0, hi: 40, step: 1, get: function (s) { var v = nnum(s.returnOnEquity); return v === null ? null : v * 100; } },
      { key: 'maxPe', dir: 'max', pct: 75, lo: 5, hi: 60, step: 1, get: function (s) { var v = nnum(s.pe); return v > 0 ? v : null; } }
    ],
    selloff: [
      { key: 'ddMin', dir: 'min', pct: 80, lo: 10, hi: 60, step: 1, get: depth3m },
      { key: 'minRoe', dir: 'min', pct: 50, lo: 5, hi: 50, step: 1, get: function (s) { var v = nnum(s.returnOnEquity); return v === null ? null : v * 100; } },
      { key: 'maxFwdPe', dir: 'max', pct: 60, lo: 8, hi: 60, step: 1, get: function (s) { var v = nnum(s.forwardPe); return v > 0 ? v : null; } },
      { key: 'minUpside', dir: 'min', pct: 40, lo: 0, hi: 60, step: 5, get: function (s) { return nnum(s.upside); } }
    ]
  };
  var TARGET_MIN = 8, TARGET_MAX = 30, TARGET_IDEAL = 15;

  function percentile(sorted, p) {
    if (!sorted.length) return null;
    var idx = Math.min(sorted.length - 1, Math.max(0, (p / 100) * (sorted.length - 1)));
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  function calibrate(container) {
    var knobs = KNOBS[currentStrategy];
    if (!knobs || !allStocks.length) return;
    var pop = allStocks.filter(function (s) { return s.sector !== 'ETF' && s.sector !== 'Sonstige' && !(Number(s.marketCap) && Number(s.marketCap) < 1e9); });
    var dist = knobs.map(function (k) {
      return pop.map(k.get).filter(function (v) { return v !== null && isFinite(v); }).sort(function (a, b) { return a - b; });
    });
    var original = JSON.parse(JSON.stringify(sliderState[currentStrategy]));

    function valuesFor(level) {
      var out = {};
      knobs.forEach(function (k, i) {
        var p = k.dir === 'min' ? k.pct - 8 * level : k.pct + 8 * level;
        p = Math.max(2, Math.min(98, p));
        var v = percentile(dist[i], p);
        if (v === null) { out[k.key] = original[k.key]; return; }
        // Richtung beim Runden: nie strenger als das Perzentil
        v = k.dir === 'min' ? Math.floor(v / k.step) * k.step : Math.ceil(v / k.step) * k.step;
        out[k.key] = Math.max(k.lo, Math.min(k.hi, Math.round(v * 100) / 100));
      });
      return out;
    }

    var best = null;
    for (var level = -4; level <= 7; level++) {
      var vals = valuesFor(level);
      var cand = JSON.parse(JSON.stringify(original));
      Object.keys(vals).forEach(function (k) { cand[k] = vals[k]; });
      sliderState[currentStrategy] = cand;
      var n = computeFiltered().length;
      var inRange = n >= TARGET_MIN && n <= TARGET_MAX;
      var dist2 = inRange ? Math.abs(n - TARGET_IDEAL) : 1000 + (n < TARGET_MIN ? TARGET_MIN - n : n - TARGET_MAX);
      // bei Gleichstand die strengere Stufe (kleineres level) behalten
      if (!best || dist2 < best.d) best = { d: dist2, vals: cand, n: n, level: level };
      if (inRange && n >= TARGET_IDEAL) break;   // weiter lockern bringt nur mehr Treffer
    }
    if (!best || best.n === 0) {
      // nichts gefunden: Standardwerte lassen, statt sinnlos verschärfte Werte zu setzen
      sliderState[currentStrategy] = original;
      if (window.App.UI && window.App.UI.toast) window.App.UI.toast('Mit den vorhandenen Daten findet diese Strategie keine Treffer – Werte unverändert');
      return;
    }
    sliderState[currentStrategy] = best.vals;
    renderSliders(container);
    applyStrategy(container);
    var msg = 'An ' + pop.length + ' Werte angepasst: ' + best.n + ' Treffer' + (best.n < TARGET_MIN ? ' (lockerer ging es nicht)' : '');
    if (window.App.UI && window.App.UI.toast) window.App.UI.toast(msg);
    var note = container.querySelector('#strategy-cal-note');
    if (note) {
      note.innerHTML = '⚙ ' + msg + '. Die Grenzen orientieren sich an der aktuellen Verteilung im Markt' +
        (best.level > 0 ? ' und wurden etwas gelockert' : best.level < 0 ? ' und wurden etwas verschärft' : '') + '. „Zurücksetzen“ stellt die Standardwerte wieder her.';
      note.style.display = '';
    }
  }

  /** Treffer der aktuellen Strategie mit den aktuellen Reglerwerten (ohne Darstellung). */
  function computeFiltered() {
    var filtered = [];

    if (currentStrategy === 'value') {
      var s = sliderState.value;
      filtered = allStocks.filter(function (stock) {
        var peVal = Number(stock.pe);
        var marginVal = Number(stock.profitMargins);
        
        var roeOk = (stock.returnOnEquity === undefined || stock.returnOnEquity === null) ? true : (Number(stock.returnOnEquity) * 100) >= s.minRoe;
        var debtOk = (stock.debtToEbitda === undefined || stock.debtToEbitda === null) ? true : Number(stock.debtToEbitda) <= s.maxDebt;
        
        return Number(stock.marketCap) > 1e9 && 
               !isNaN(peVal) && peVal > 0 && peVal <= s.maxPe && 
               roeOk && 
               debtOk &&
               !isNaN(marginVal) && marginVal > 0;
      });
    } 
    else if (currentStrategy === 'growth') {
      var s = sliderState.growth;
      filtered = allStocks.filter(function (stock) {
        var rsOk = (stock.rsRating === undefined || stock.rsRating === null) ? true : Number(stock.rsRating) >= s.minRs;
        var volOk = (stock.volume === undefined || stock.volume === null) ? true : Number(stock.volume) >= s.minVol;
        var growthVal = Number(stock.revGrowth);
        var growthOk = isNaN(growthVal) ? true : (growthVal * 100) >= s.minRevGrowth;
        
        return stock.cross === 'golden' && 
               rsOk && 
               growthOk &&
               volOk;
      });
    } 
    else if (currentStrategy === 'dividend') {
      var s = sliderState.dividend;
      filtered = allStocks.filter(function (stock) {
        var dy = Number(stock.dividendYield);
        var payoutVal = Number(stock.payoutRatio);
        var payoutOk = isNaN(payoutVal) ? true : (payoutVal * 100) <= s.maxPayout;
        var marginVal = Number(stock.profitMargins);
        
        return dy >= s.minYield && 
               payoutOk &&
               !isNaN(marginVal) && marginVal > 0;
      });
    }
    else if (currentStrategy === 'momentum') {
      var s = sliderState.momentum;
      filtered = allStocks.filter(function (stock) {
        var rsVal = Number(stock.rsRating) || 0;
        var chgVal = Number(stock.changePercent) || 0;
        
        return rsVal >= s.minRs && 
               chgVal >= s.minChange;
      });
    }
    else if (currentStrategy === 'buythedip') {
      var s = sliderState.buythedip;
      var dipOpts = { ddMin: s.ddMin, ddMax: Math.max(s.ddMax, s.ddMin), rsiMax: s.rsiMax, needTrend: s.needTrend, minRoe: s.minRoe, maxPe: s.maxPe };
      filtered = allStocks.filter(function (stock) {
        if (stock.sector === 'ETF' || stock.sector === 'Sonstige') return false;
        stock._dip = window.App.DipFinder.evaluate(stock, dipOpts);
        return stock._dip.ok;
      });
    }

    else if (currentStrategy === 'selloff') {
      var so = sliderState.selloff;
      filtered = allStocks.filter(function (stock) {
        if (stock.sector === 'ETF' || stock.sector === 'Sonstige') return false;
        stock._dip = window.App.DipFinder.evaluateSelloff(stock, so);
        return stock._dip.ok;
      });
    }

    return filtered;
  }

  function applyStrategy(container) {
    var listEl = container.querySelector('#strategy-results');
    var filtered = computeFiltered();

    if (currentStrategy === 'buythedip' || currentStrategy === 'selloff') {
      filtered.sort(function (a, b) { return b._dip.score - a._dip.score; });
    } else {
      filtered.sort(function(a, b) {
        return (Number(b.marketCap) || 0) - (Number(a.marketCap) || 0);
      });
    }

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="state-box"><p>Keine Aktien gefunden. Versuche die Slider weiter nach links/rechts zu ziehen, um die Kriterien zu lockern.</p></div>';
      return;
    }

    var html = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">' +
      '<div style="font-size: 0.78rem; color: var(--text-dim);">' + filtered.length + ' Aktien entsprechen dieser Strategie:</div>' +
      '<button id="btn-strategy-gemini" class="chip-btn active" style="background: var(--accent-purple); border-color: var(--accent-purple); font-size: 0.7rem; padding: 2px 8px; box-shadow: 0 4px 14px var(--accent-purple-glow); display: flex; align-items: center; gap: 4px;">' +
         '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>' +
         'KI-Analyse (Top 10)' +
      '</button>' +
    '</div>';

    filtered.slice(0, 50).forEach(function (stock) {
      var chgCls = window.App.Format.changeClass(stock.changePercent);
      var sign = (stock.changePercent || 0) >= 0 ? '+' : '';
      
      html += '' +
        '<div class="stock-card" data-ticker="' + esc(stock.ticker) + '">' +
          '<div style="display:flex; align-items:center; flex:1; min-width:0;">' +
            '<div class="stock-info-left" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
              '<div class="stock-name" style="overflow:hidden; text-overflow:ellipsis;">' + esc(stock.name || stock.ticker) + '</div>' +
              '<div class="stock-tags">' +
                '<span class="ticker-badge">' + esc(stock.ticker) + '</span>' +
                '<span class="sector-label">• ' + esc(stock.sector || 'Markt') + '</span>' +
              '</div>' +
              ((currentStrategy === 'buythedip' || currentStrategy === 'selloff') && stock._dip ? '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:3px;white-space:normal;line-height:1.35;">' +
                '<b style="color:var(--accent-purple-light);">' + (currentStrategy === 'selloff' ? 'Score ' : 'Dip-Score ') + stock._dip.score + '</b> · ' + esc(stock._dip.reasons.join(' · ')) +
                (stock._dip.risks && stock._dip.risks.length ? '<br><span style="color:#f59e0b;">⚠ ' + esc(stock._dip.risks.join(' · ')) + '</span>' : '') + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<div class="stock-info-right">' +
            '<div class="stock-price">' + esc(window.App.Format.currency(stock.price, stock.currency || 'EUR')) + '</div>' +
            '<div class="badge-pill ' + chgCls + '">' + sign + window.App.Format.number(stock.changePercent, 2) + ' %</div>' +
          '</div>' +
        '</div>';
    });

    if (filtered.length > 50) {
      html += '<div style="text-align: center; font-size: 0.75rem; color: var(--text-dim); margin-top: 10px;">(Die Top 50 ' + (currentStrategy === 'buythedip' || currentStrategy === 'selloff' ? 'nach Score' : 'nach Marktkapitalisierung') + ' werden angezeigt)</div>';
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll('.stock-card').forEach(function (card) {
      card.onclick = function () {
        var ticker = card.getAttribute('data-ticker');
        window.App.Data.setLastTicker(ticker);
        window.App.Router.navigate('/stock/' + ticker + '/overview');
      };
    });

    // KI-Button Event Listener
    var geminiBtn = listEl.querySelector('#btn-strategy-gemini');
    if (geminiBtn) {
      geminiBtn.onclick = function () {
        var topStocks = filtered.slice(0, 10); // Nur die Top 10 für die KI
        var originalBtnHtml = geminiBtn.innerHTML;
        geminiBtn.innerHTML = '<div class="spinner" style="width:12px; height:12px; border-width:2px; margin-right:4px;"></div> Lade...';
        geminiBtn.disabled = true;
        geminiBtn.style.opacity = '0.7';

        // Detaildaten für die Top 10 nachladen
        var promises = topStocks.map(function (st) {
          return window.App.Data.getStock(st.ticker).catch(function () { return st; });
        });

        Promise.all(promises).then(function (results) {
          geminiBtn.innerHTML = originalBtnHtml;
          geminiBtn.disabled = false;
          geminiBtn.style.opacity = '1';
          
          var stratNames = {
            value: 'Value & Qualität',
            growth: 'Growth & Momentum',
            dividend: 'Dividende',
            momentum: 'Momentum',
            buythedip: 'Buy the Dip',
            selloff: 'Qualität im Ausverkauf'
          };
          
          // Aktuelle Slider-Werte übergeben
          var activeSliders = sliderState[currentStrategy];
          
          openGemini(geminiBtn, results, stratNames[currentStrategy], activeSliders);
        });
      };
    }
  }

  // =====================================================================
  // KI-Prompt (Gemini) Logik (kopiert aus compare.js)
  // =====================================================================
  var universeCache = [];
  var NA = 'unbekannt';
  var PATTERN_NAMES = {
    double_top: 'Doppel-Top', double_bottom: 'Doppel-Boden', squeeze: 'Bollinger-Squeeze'
  };

  function nn(v) {
    return v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && !isFinite(v));
  }
  function fnum(v, d) {
    return Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function N(v, d, suffix) { return nn(v) ? fnum(v, d) + (suffix || '') : NA; }
  function P(v, d) { return nn(v) ? fnum(v, d === undefined ? 1 : d) + ' %' : NA; }
  function F(v, d) { return nn(v) ? fnum(v * 100, d === undefined ? 1 : d) + ' %' : NA; }
  function E(v, d) { return nn(v) ? fnum(v, d === undefined ? 2 : d) + ' €' : NA; }
  function MC(v) {
    if (!nn(v) || v <= 0) return NA;
    return v >= 1e9 ? fnum(v / 1e9, 1) + ' Mrd. €' : fnum(v / 1e6, 0) + ' Mio. €';
  }
  function dateDe(str) {
    var d = new Date(str);
    return isNaN(d.getTime()) ? String(str) : d.toLocaleDateString('de-DE');
  }
  function medianOf(arr) {
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var n = a.length;
    if (!n) return null;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }
  function findUniverse(ticker) {
    for (var i = 0; i < universeCache.length; i++) {
      if (universeCache[i].ticker === ticker) return universeCache[i];
    }
    return null;
  }
  function sectorMedianPe(sector) {
    if (!sector) return null;
    var arr = universeCache.filter(function (x) { return x.sector === sector && x.pe > 0 && x.pe < 500; })
                           .map(function (x) { return x.pe; });
    return arr.length >= 5 ? { v: medianOf(arr), n: arr.length } : null;
  }

  function techLine(s) {
    if (!(s.chartHistory && s.chartHistory.length > 60 && window.App.StockChart)) return '';
    var hist = s.chartHistory.filter(function (p) { return p && p.close > 0; });
    var closes = hist.map(function (p) { return p.close; });
    var n = closes.length, cPrice = closes[n - 1];
    var s50 = window.App.StockChart._sma(closes, 50);
    var s200 = window.App.StockChart._sma(closes, 200);
    var rsiArr = window.App.StockChart._rsi(closes, 14);
    var m = window.App.StockChart._macd(closes);
    function lastValid(arr) {
      for (var i = arr.length - 1; i >= 0; i--) if (arr[i] !== null && arr[i] !== undefined && isFinite(arr[i])) return arr[i];
      return null;
    }
    var s50Last = lastValid(s50), s200Last = lastValid(s200), rsiLast = lastValid(rsiArr);
    var macdLast = lastValid(m.line), sigLast = lastValid(m.signal);
    var mom3m = n > 63 ? (cPrice / closes[n - 1 - 63] - 1) * 100 : null;
    var t = '';
    if (s200Last !== null) t += 'Abstand 200-Tage-Linie ' + P((cPrice / s200Last - 1) * 100) + '. ';
    if (s50Last !== null) t += 'Abstand 50-Tage-Linie ' + P((cPrice / s50Last - 1) * 100) + '. ';
    if (rsiLast !== null) t += 'RSI (14) bei ' + fnum(rsiLast, 0) + '. ';
    if (macdLast !== null && sigLast !== null) t += 'MACD ' + (macdLast > sigLast ? 'über' : 'unter') + ' Signallinie. ';
    if (mom3m !== null) t += 'Momentum 3M ' + P(mom3m) + '.';
    return t.trim();
  }

  function stockBlock(s) {
    var u = findUniverse(s.ticker);
    var hasU = !!u;
    u = u || {};
    var prof = s.profile || {}, q = s.quote || {}, r = s.ratios || {}, an = s.analysts || {};
    var tg = an.targets || {};
    var rec = (an.recommendations && an.recommendations.breakdown) || {};
    var price = q.price;
    var sector = prof.sector || u.sector;
    var sm = sectorMedianPe(sector);

    var pe = nn(r.peTrailing) ? r.peTrailing : u.pe;
    var upside = nn(u.upside) ? u.upside : ((nn(tg.mean) && price > 0) ? (tg.mean / price - 1) * 100 : null);
    var recTotal = 0;
    Object.keys(rec).forEach(function (k) { recTotal += Number(rec[k]) || 0; });
    var buyPct = nn(u.buyPct) ? u.buyPct : (recTotal > 0 ? (((rec.strongBuy || 0) + (rec.buy || 0)) / recTotal) * 100 : null);
    var cnt = nn(tg.analystCount) ? tg.analystCount : u.analystCount;
    var earn = an.nextEarningsDate || u.nextEarningsDate;
    var lo = q.fiftyTwoWeekLow, hi = q.fiftyTwoWeekHigh;
    var rangePos = nn(u.rangePos) ? u.rangePos : ((nn(lo) && nn(hi) && hi > lo && price > 0) ? ((price - lo) / (hi - lo)) * 100 : null);
    var upd = u.updatedAt || s.updatedAt;

    var L = [];
    L.push('### ' + (prof.name || s.ticker) + ' (' + s.ticker + ') ###');
    L.push('- Einordnung: Sektor ' + (sector || NA) + ', Branche ' + (prof.industry && prof.industry !== 'N/A' ? prof.industry : (u.industry || NA)) +
           ', Land ' + (prof.country || u.country || NA) + ', Marktkapitalisierung ' + MC(q.marketCap) +
           (upd ? ', Datenstand ' + dateDe(upd) : ''));
    L.push('- Kurs: ' + E(price) + ' (Änderung heute: ' + P(q.changePercent, 2) + ')');
    L.push('- Bewertung: KGV (Trailing) ' + N(pe, 1) + ', Forward-KGV ' + N(r.peForward, 1) + ', PEG ' + N(r.pegRatio, 2) +
           (sm ? ', Sektor-Median-KGV ' + N(sm.v, 1) + ' (' + sm.n + ' Aktien im Sektor)' : ''));
    L.push('- Wachstum & Qualität: Umsatzwachstum (YoY) ' + F(r.revenueGrowth) + ', Nettomarge ' + F(r.profitMargins) +
           ', operative Marge ' + F(r.operatingMargins) + ', Bruttomarge ' + F(r.grossMargins) +
           ', Eigenkapitalrendite (ROE) ' + F(r.returnOnEquity) + ', Gesamtkapitalrendite (ROA) ' + F(nn(r.returnOnAssets) ? r.returnOnAssets : u.roa));
    L.push('- Bilanz: Schulden/EBITDA ' + N(r.debtToEbitda, 1) + ', Verschuldung/Eigenkapital ' + N(r.debtToEquity, 0, ' %'));
    L.push('- Dividende: Rendite ' + P(r.dividendYield, 2) + ', Ausschüttungsquote ' + F(r.payoutRatio, 0));
    L.push('- Analysten: mittleres Kursziel ' + E(tg.mean) + ' (Spanne ' + E(tg.low) + ' bis ' + E(tg.high) + '), Potenzial ' + P(upside) +
           ', ' + (nn(cnt) ? fnum(cnt, 0) + ' Analysten' : 'Analystenzahl ' + NA) + ', Kaufempfehlung ' + (nn(buyPct) ? 'bei ' + P(buyPct, 0) + ' der Analysten' : NA) + ', nächste Zahlen am ' + (earn ? dateDe(earn) + ((an.nextEarningsEstimated || u.nextEarningsEstimated) ? ' (geschätzt, zuletzt ' + dateDe(an.lastEarningsDate || u.lastEarningsDate) + ')' : '') : NA));
    L.push('- Kursverlauf: Lage in der 52-Wochen-Spanne ' + N(rangePos, 0, ' %') + ' (Tief ' + E(lo) + ', Hoch ' + E(hi) + '), Performance 1W ' + P(u.perf1w) +
           ', 1M ' + P(u.perf1m) + ', 3M ' + P(u.perf3m) + ', YTD ' + P(u.perfYtd) + ', 1J ' + P(u.perf52w) +
           ', RS-Rating ' + N(u.rsRating, 0, ' von 99'));

    var tech = techLine(s);
    if (tech) L.push('- Technisches Bild: ' + tech);

    var sig = [];
    if (u.cross && nn(u.crossDaysAgo)) sig.push((u.cross === 'golden' ? 'Golden Cross' : 'Death Cross') + ' (SMA50/200) vor ' + u.crossDaysAgo + ' Handelstagen');
    if (Array.isArray(u.chartPatterns)) {
      var pats = u.chartPatterns.filter(function (x) { return x !== 'golden_cross' && x !== 'death_cross'; })
                                .map(function (x) { return PATTERN_NAMES[x] || x; });
      if (pats.length) sig.push('Chartmuster: ' + pats.join(', '));
    }
    if (hasU) {
      var bt = u.bottom === 'base' ? 'Bodenbildung möglich'
             : u.bottom === 'knife' ? 'Fallendes Messer (Abwärtstrend noch intakt)'
             : u.bottom === 'wait' ? 'unklar, abwarten'
             : 'kein Signal';
      sig.push('Boden-Check: ' + bt);
    }
    if (nn(u.rrCrv)) {
      sig.push('Chance/Risiko (CRV) ' + N(u.rrCrv, 1) + ', Stop-Abstand ' + P(u.rrStopPct) + ' (Stop knapp unter dem 60-Tage-Tief), Ziel-Abstand ' + P(u.rrTgtPct));
    }
    if (sig.length) L.push('- Signale: ' + sig.join('. ') + '.');

    var nl = window.App.News && window.App.News.indexLine(s.ticker);
    if (nl) L.push('- ' + nl);
    return L.join('\n');
  }

  // NEU: Sliders in den Prompt einbauen
  function buildStrategyContext(strategyName, sliders) {
    if (!strategyName || !sliders) return '';
    var text = 'KONTEXT DER STRATEGIE: Die folgenden Aktien wurden mit dem "' + strategyName + '" Screener gefunden. ';
    text += 'Die spezifischen Filterkriterien für diese Auswahl waren: ';
    
    if (strategyName === 'Value & Qualität') {
      text += 'Maximales KGV ' + sliders.maxPe + ', Min. Eigenkapitalrendite (ROE) ' + sliders.minRoe + '%, Max. Verschuldung (Debt/EBITDA) ' + sliders.maxDebt + '.';
    } else if (strategyName === 'Growth & Momentum') {
      text += 'Min. RS-Rating ' + sliders.minRs + ', Min. Umsatzwachstum ' + sliders.minRevGrowth + '%, Min. Tagesvolumen ' + sliders.minVol + '.';
    } else if (strategyName === 'Dividende') {
      text += 'Min. Dividendenrendite ' + sliders.minYield + '%, Max. Payout Ratio ' + sliders.maxPayout + '%.';
    } else if (strategyName === 'Momentum') {
      text += 'Min. RS-Rating ' + sliders.minRs + ', Min. Tagesanstieg ' + sliders.minChange + '%.';
    } else if (strategyName === 'Qualität im Ausverkauf') {
      text += 'Mind. ' + sliders.ddMin + '% unter dem 3-Monats-Hoch, ROE ≥ ' + sliders.minRoe + '%, Forward-KGV ≤ ' + sliders.maxFwdPe + ', Kursziel-Potenzial ≥ ' + sliders.minUpside + '%. Trendbruch erlaubt.';
    } else if (strategyName === 'Buy the Dip') {
      text += 'Rücksetzer ' + sliders.ddMin + '–' + sliders.ddMax + '% vom 3-Monats-Hoch, RSI ≤ ' + sliders.rsiMax + (sliders.needTrend ? ', Kurs über EMA 200' : '') + ', Min. ROE ' + sliders.minRoe + '%, Max. KGV ' + sliders.maxPe + '.';
    }
    
    text += '\nBitte bewerte die Aktien im Kontext dieser Strategie (z.B. ist der Dip bei "Buy the Dip" gesund oder ein fallendes Messer?).\n\n';
    return text;
  }

  function buildGeminiPrompt(stocks, strategyName, sliders) {
    var today = new Date().toLocaleDateString('de-DE');
    var stratContext = buildStrategyContext(strategyName, sliders);
    
    var head =
      'Du bist ein nüchterner Aktienanalyst. Datum: ' + today + '. Alle Preise in EUR.\n\n' +
      'AUFGABE: Vergleiche die folgenden ' + stocks.length + ' Aktien. Sage mir, welche aktuell am besten für einen Einstieg geeignet ist ' +
      'und wie sich das langfristige Potenzial der Unternehmen entwickeln könnte.\n\n' +
      stratContext +
      'REGELN:\n' +
      '- Prüfe zuerst kurz die Plausibilität der Daten (Ausreißer, widersprüchliche Werte).\n' +
      '- Nutze für Kennzahlen ausschließlich die Zahlen unten. Steht dort "unbekannt", sage das ausdrücklich und rate nicht. ' +
      'Eigenes Wissen nur zur qualitativen Einordnung des Geschäftsmodells, ohne neue Kennzahlen zu nennen.\n' +
      '- Bewerte KGV, Margen und Verschuldung relativ zum Sektor. Aktien aus verschiedenen Sektoren nicht allein über das KGV vergleichen.\n\n' +
      'LEGENDE: Lage in der 52-Wochen-Spanne: 0 % = Jahrestief, 100 % = Jahreshoch. RS-Rating: Perzentil der 3-Monats-Performance im gesamten ' +
      'Aktienuniversum der App (99 = stärkste). CRV = Chance/Risiko-Verhältnis. Boden-Check: "Bodenbildung" = mindestens 20 % unter dem 52W-Hoch und ' +
      'mindestens 4 von 6 Stabilisierungssignalen; "Fallendes Messer" = mindestens 20 % unter dem Hoch, höchstens 2 von 6 Signalen. ' +
      'News-Stimmung: Skala der App, positiv bis negativ.\n\n' +
      'AUSGABE: 1) Kurze Datenprüfung. 2) Tabelle mit Rangfolge (Bewertung, Qualität, Technik, Risiko). 3) Je Aktie Pro und Contra in 2 bis 3 Stichpunkten. ' +
      '4) Einstiegsidee mit Risiko (Stop-Abstand aus den Daten). 5) Langfristiges Potenzial und die wichtigsten Risiken. ' +
      '6) Hinweis, dass dies keine Anlageberatung ist.\n\n' +
      'DATEN:\n\n';
    return head + stocks.map(stockBlock).join('\n\n') + '\n';
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text)
        .then(function () { return true; })
        .catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  var MAX_ENCODED_URL_PROMPT = 6000;

  function openGemini(btn, stocks, strategyName, sliders) {
    var promptText = buildGeminiPrompt(stocks, strategyName, sliders);
    var enc = encodeURIComponent(promptText);
    var viaUrl = enc.length <= MAX_ENCODED_URL_PROMPT;
    var base = 'https://gemini.google.com/app';

    copyText(promptText).then(function (ok) {
      var url = base;
      if (viaUrl || !ok) url += '?q=' + enc;
      window.open(url, '_blank');
      if (!viaUrl && ok) {
        var old = btn.textContent;
        btn.textContent = 'Kopiert – in Gemini einfügen';
        setTimeout(function () { btn.textContent = old; }, 5000);
      }
    });
  }

  return { initView: initView };
})();

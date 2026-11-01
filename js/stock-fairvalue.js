/**
 * js/stock-fairvalue.js
 * Tab "Fair Value" der Aktiendetailansicht. Drei vereinfachte Bewertungsmethoden:
 *  1. Graham-Zahl:      √(22,5 × Gewinn je Aktie × Buchwert je Aktie)
 *  2. KGV-Vergleich:    Gewinn je Aktie × Median-KGV der Branche (bzw. des Sektors)
 *  3. DCF (vereinfacht): abgezinste freie Cashflows über 5 Jahre + Restwert, abzüglich Nettoschulden
 *
 * Alle Werte stammen aus den Abschlüssen der letzten vier Quartale (TTM) bzw. dem letzten Geschäftsjahr.
 * Reine Modellrechnung – keine Anlageberatung.
 */

window.App = window.App || {};

window.App.StockFairValue = (function () {
  'use strict';

  var GRAHAM_FACTOR = 22.5;
  var PEER_MIN = 5;          // Mindestanzahl Vergleichsaktien für einen Branchen-Median
  var DCF_YEARS = 5;

  // Vom Nutzer einstellbare DCF-Annahmen (Wachstum wird je Aktie vorbelegt)
  var dcfInputs = { growth: null, discount: 9, terminal: 2.5, ticker: null };
  var styleInjected = false;

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    var css = '' +
      '.fv-summary{display:grid;grid-template-columns:1fr 1fr;gap:8px;}' +
      '.fv-cell{background:var(--bg-tertiary);border-radius:var(--radius-sm);padding:10px 10px;}' +
      '.fv-label{font-size:.62rem;color:var(--text-dim);text-transform:uppercase;font-weight:600;letter-spacing:.03em;}' +
      '.fv-value{font-size:1.05rem;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums;}' +
      '.fv-value.up{color:var(--bullish);}.fv-value.down{color:var(--bearish);}' +
      '.fv-range{position:relative;height:10px;border-radius:5px;background:var(--bg-tertiary);margin:26px 4px 24px;}' +
      '.fv-band{position:absolute;top:0;bottom:0;border-radius:5px;background:rgba(99,102,241,.45);}' +
      '.fv-pin{position:absolute;top:-6px;width:3px;height:22px;border-radius:2px;background:#fff;}' +
      '.fv-pin-label{position:absolute;top:-24px;transform:translateX(-50%);font-size:.64rem;font-weight:700;white-space:nowrap;color:var(--text-main);}' +
      '.fv-end{position:absolute;top:16px;font-size:.62rem;color:var(--text-dim);white-space:nowrap;}' +
      '.fv-method{padding:12px 0;border-bottom:1px solid var(--border-subtle);}' +
      '.fv-method:last-child{border-bottom:0;}' +
      '.fv-method-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;}' +
      '.fv-method-name{font-size:.86rem;font-weight:700;color:var(--text-main);}' +
      '.fv-method-val{font-size:.95rem;font-weight:800;font-variant-numeric:tabular-nums;}' +
      '.fv-note{font-size:.7rem;color:var(--text-dim);line-height:1.45;margin-top:4px;}' +
      '.fv-diff.up{color:var(--bullish);}.fv-diff.down{color:var(--bearish);}' +
      '.fv-slider{margin-top:10px;}' +
      '.fv-slider-label{display:flex;justify-content:space-between;font-size:.72rem;color:var(--text-muted);margin-bottom:2px;}';
    var el = document.createElement('style');
    el.setAttribute('data-fairvalue', '1');
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ---------------------------------------------------------------------------
  // Helfer
  // ---------------------------------------------------------------------------
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function num(v) {
    return (v !== null && v !== undefined && v !== '' && !isNaN(v)) ? Number(v) : null;
  }

  function sorted(list) {
    return (list || []).filter(function (r) { return r && r.date; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  /** Summe der letzten vier Quartalswerte; null, wenn nicht alle vier vorhanden sind. */
  function ttm(rows, field) {
    var last4 = sorted(rows).slice(-4);
    if (last4.length < 4) return null;
    var sum = 0;
    for (var i = 0; i < 4; i++) {
      var v = num(last4[i][field]);
      if (v === null) return null;
      sum += v;
    }
    return sum;
  }

  function lastValue(rows, field) {
    var s = sorted(rows);
    for (var i = s.length - 1; i >= 0; i--) {
      var v = num(s[i][field]);
      if (v !== null) return v;
    }
    return null;
  }

  function median(arr) {
    if (!arr.length) return null;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function fmtMoney(v, cur) {
    return window.App.Format.currency(v, cur);
  }

  function fmtPct(v, d) {
    var n = Number(v);
    return (n > 0 ? '+' : '') + window.App.Format.number(n, d === undefined ? 1 : d) + ' %';
  }

  // ---------------------------------------------------------------------------
  // Kennzahlen aus den Abschlüssen
  // ---------------------------------------------------------------------------
  function extractBase(stock) {
    var q = stock.quote || {};
    var price = num(q.price);
    var mcap = num(q.marketCap);
    var fin = stock.financials || {};
    var inc = fin.incomeStatement || {};
    var bs = fin.balanceSheet || {};
    var cf = fin.cashFlow || {};

    var shares = (price && mcap) ? mcap / price : null;

    var ni = ttm(inc.quarterly, 'Net_Income');
    var niSource = 'TTM';
    if (ni === null) { ni = lastValue(inc.annual, 'Net_Income'); niSource = 'Geschäftsjahr'; }

    var fcf = ttm(cf.quarterly, 'Free_Cash_Flow');
    var fcfSource = 'TTM';
    if (fcf === null) { fcf = lastValue(cf.annual, 'Free_Cash_Flow'); fcfSource = 'Geschäftsjahr'; }

    var equity = lastValue(bs.quarterly, 'Stockholders_Equity');
    if (equity === null) equity = lastValue(bs.annual, 'Stockholders_Equity');

    var debt = lastValue(bs.quarterly, 'Total_Debt');
    var cash = lastValue(bs.quarterly, 'Cash_And_Cash_Equivalents');
    if (debt === null) debt = lastValue(bs.annual, 'Total_Debt');
    if (cash === null) cash = lastValue(bs.annual, 'Cash_And_Cash_Equivalents');
    var netDebt = (debt !== null) ? debt - (cash || 0) : (lastValue(bs.quarterly, 'Net_Debt'));

    // Umsatzwachstum als Startwert für die DCF-Wachstumsannahme
    var revG = num((stock.ratios || {}).revenueGrowth);

    return {
      price: price, mcap: mcap, shares: shares,
      netIncome: ni, niSource: niSource,
      eps: (ni !== null && shares) ? ni / shares : null,
      equity: equity,
      bvps: (equity !== null && shares) ? equity / shares : null,
      fcf: fcf, fcfSource: fcfSource,
      netDebt: netDebt,
      revGrowth: revG
    };
  }

  // ---------------------------------------------------------------------------
  // Methoden
  // ---------------------------------------------------------------------------
  function grahamValue(b) {
    if (b.eps === null || b.bvps === null) {
      return { ok: false, reason: 'Gewinn oder Buchwert je Aktie nicht verfügbar.' };
    }
    if (b.eps <= 0) return { ok: false, reason: 'Nicht anwendbar: Gewinn je Aktie ist negativ.' };
    if (b.bvps <= 0) return { ok: false, reason: 'Nicht anwendbar: Buchwert je Aktie ist negativ.' };
    return {
      ok: true,
      value: Math.sqrt(GRAHAM_FACTOR * b.eps * b.bvps),
      note: '√(22,5 × Gewinn/Aktie ' + window.App.Format.number(b.eps, 2) + ' × Buchwert/Aktie ' +
        window.App.Format.number(b.bvps, 2) + '). Klassisch für substanzstarke, reife Unternehmen.'
    };
  }

  function peerValue(b, stock, universe) {
    if (b.eps === null) return { ok: false, reason: 'Gewinn je Aktie nicht verfügbar.' };
    if (b.eps <= 0) return { ok: false, reason: 'Nicht anwendbar: Gewinn je Aktie ist negativ.' };

    var ticker = (stock.ticker || '').toUpperCase();
    var profile = stock.profile || {};
    var industry = profile.industry, sector = profile.sector;

    function pes(filterFn) {
      return universe.filter(function (u) {
        return u.ticker !== ticker && filterFn(u) && num(u.pe) !== null && u.pe > 0 && u.pe < 150;
      }).map(function (u) { return Number(u.pe); });
    }

    var group = industry ? pes(function (u) { return u.industry === industry; }) : [];
    var label = industry;
    if (group.length < PEER_MIN) {
      group = sector ? pes(function (u) { return u.sector === sector; }) : [];
      label = sector;
    }
    if (group.length < PEER_MIN) return { ok: false, reason: 'Zu wenige Vergleichsaktien für einen Median.' };

    var m = median(group);
    return {
      ok: true,
      value: b.eps * m,
      note: 'Gewinn/Aktie ' + window.App.Format.number(b.eps, 2) + ' × Median-KGV ' + window.App.Format.number(m, 1) +
        ' (' + esc(label) + ', ' + group.length + ' Aktien).'
    };
  }

  function dcfValue(b, stock, inputs) {
    var sector = (stock.profile || {}).sector;
    if (sector === 'Financial Services') {
      return { ok: false, reason: 'Für Banken und Versicherungen nicht aussagekräftig (Cashflow ist dort kein sinnvolles Maß).' };
    }
    if (b.fcf === null || !b.shares) return { ok: false, reason: 'Freier Cashflow nicht verfügbar.' };
    if (b.fcf <= 0) return { ok: false, reason: 'Nicht anwendbar: freier Cashflow ist negativ.' };

    var g = inputs.growth / 100, r = inputs.discount / 100, tg = inputs.terminal / 100;
    if (r <= tg) return { ok: false, reason: 'Diskontsatz muss über dem ewigen Wachstum liegen.' };

    var pv = 0, cf = b.fcf;
    for (var t = 1; t <= DCF_YEARS; t++) {
      cf = cf * (1 + g);
      pv += cf / Math.pow(1 + r, t);
    }
    var tv = (cf * (1 + tg)) / (r - tg);
    var pvTv = tv / Math.pow(1 + r, DCF_YEARS);
    var ev = pv + pvTv;
    var equity = ev - (b.netDebt || 0);
    var perShare = equity / b.shares;

    if (perShare <= 0) return { ok: false, reason: 'Nettoschulden übersteigen den berechneten Unternehmenswert.' };
    return {
      ok: true,
      value: perShare,
      note: 'Freier Cashflow (' + b.fcfSource + ') ' + window.App.Format.compactNumber(b.fcf) + ', ' + DCF_YEARS +
        ' Jahre Wachstum, Restwert ' + Math.round(pvTv / ev * 100) + ' % des Unternehmenswerts.'
    };
  }

  function defaultGrowth(b) {
    var g = b.revGrowth !== null ? b.revGrowth * 100 : 5;
    g = Math.max(2, Math.min(15, g));
    return Math.round(g);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function render(container, stock) {
    if (!container || !stock) return;
    injectStyles();
    container.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Berechne Fair Value...</p></div>';

    window.App.Data.getUniverse().then(function (universe) {
      if (!document.body.contains(container)) return;
      draw(container, stock, universe || []);
    });
  }

  function draw(container, stock, universe) {
    var ticker = (stock.ticker || '').toUpperCase();
    var cur = (stock.quote || {}).currency || (stock.profile || {}).currency || 'EUR';
    var b = extractBase(stock);

    if (dcfInputs.ticker !== ticker || dcfInputs.growth === null) {
      dcfInputs.ticker = ticker;
      dcfInputs.growth = defaultGrowth(b);
      dcfInputs.discount = 9;
      dcfInputs.terminal = 2.5;
    }

    var peer = peerValue(b, stock, universe);
    var graham = grahamValue(b);

    var html = '' +
      '<div id="fv-results"></div>' +
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">DCF-Annahmen</span>' +
          '<button class="chip-btn" id="fv-reset" style="padding:3px 10px;font-size:.72rem;">Zurücksetzen</button></div>' +
        '<div class="fv-slider"><div class="fv-slider-label"><span>Wachstum der Cashflows p. a. (5 Jahre)</span><b id="fv-g-label"></b></div>' +
          '<input type="range" class="range-slider" id="fv-g" min="0" max="20" step="1"></div>' +
        '<div class="fv-slider"><div class="fv-slider-label"><span>Diskontsatz (geforderte Rendite)</span><b id="fv-r-label"></b></div>' +
          '<input type="range" class="range-slider" id="fv-r" min="6" max="14" step="0.5"></div>' +
        '<div class="fv-slider"><div class="fv-slider-label"><span>Ewiges Wachstum (Restwert)</span><b id="fv-t-label"></b></div>' +
          '<input type="range" class="range-slider" id="fv-t" min="0" max="4" step="0.5"></div>' +
        '<div class="fv-note" style="margin-top:12px;">Die Methoden sind stark vereinfacht und reagieren empfindlich auf die Annahmen. ' +
          'Fair Value ist eine Modellrechnung, keine Kursprognose und keine Anlageberatung.</div>' +
      '</div>';
    container.innerHTML = html;

    function update() {
      var dcf = dcfValue(b, stock, dcfInputs);
      drawResults(container.querySelector('#fv-results'), b, cur, graham, peer, dcf);
      container.querySelector('#fv-g-label').textContent = window.App.Format.number(dcfInputs.growth, 0) + ' %';
      container.querySelector('#fv-r-label').textContent = window.App.Format.number(dcfInputs.discount, 1) + ' %';
      container.querySelector('#fv-t-label').textContent = window.App.Format.number(dcfInputs.terminal, 1) + ' %';
    }

    var g = container.querySelector('#fv-g'), r = container.querySelector('#fv-r'), t = container.querySelector('#fv-t');
    g.value = dcfInputs.growth; r.value = dcfInputs.discount; t.value = dcfInputs.terminal;
    g.oninput = function () { dcfInputs.growth = Number(g.value); update(); };
    r.oninput = function () { dcfInputs.discount = Number(r.value); update(); };
    t.oninput = function () { dcfInputs.terminal = Number(t.value); update(); };
    container.querySelector('#fv-reset').onclick = function () {
      dcfInputs.growth = defaultGrowth(b); dcfInputs.discount = 9; dcfInputs.terminal = 2.5;
      g.value = dcfInputs.growth; r.value = dcfInputs.discount; t.value = dcfInputs.terminal;
      update();
    };
    update();
  }

  function drawResults(el, b, cur, graham, peer, dcf) {
    if (!el) return;
    var price = b.price;
    var methods = [
      { name: 'Graham-Zahl', res: graham },
      { name: 'KGV-Vergleich (Peers)', res: peer },
      { name: 'DCF (vereinfacht)', res: dcf }
    ];
    var values = methods.filter(function (m) { return m.res.ok; }).map(function (m) { return m.res.value; });

    var html = '';

    // Zusammenfassung
    html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Fair-Value-Spanne</span>' +
      '<span class="sector-label">' + values.length + ' von 3 Methoden</span></div>';

    if (!values.length || !price) {
      html += '<div class="fv-note">Mit den vorhandenen Daten lässt sich keine Methode berechnen. Die Gründe stehen unten bei den einzelnen Methoden.</div></div>';
    } else {
      var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
      var avg = values.reduce(function (a, v) { return a + v; }, 0) / values.length;
      var diff = (avg / price - 1) * 100;       // Potenzial bis zum Ø Fair Value
      var below = diff >= 0;

      html += '<div class="fv-summary">' +
        '<div class="fv-cell"><div class="fv-label">Aktueller Kurs</div><div class="fv-value">' + fmtMoney(price, cur) + '</div></div>' +
        '<div class="fv-cell"><div class="fv-label">Ø Fair Value</div><div class="fv-value">' + fmtMoney(avg, cur) + '</div></div>' +
        '</div>';

      // Skala: Kurs und Spanne gemeinsam darstellen
      var min = Math.min(lo, price) * 0.85, max = Math.max(hi, price) * 1.15;
      function pos(v) { return Math.max(0, Math.min(100, (v - min) / (max - min) * 100)); }
      html += '<div class="fv-range">' +
        '<div class="fv-band" style="left:' + pos(lo).toFixed(1) + '%;width:' + Math.max(1.5, pos(hi) - pos(lo)).toFixed(1) + '%;"></div>' +
        '<div class="fv-pin" style="left:calc(' + pos(price).toFixed(1) + '% - 1px);"></div>' +
        '<div class="fv-pin-label" style="left:' + pos(price).toFixed(1) + '%;">Kurs</div>' +
        '<div class="fv-end" style="left:' + pos(lo).toFixed(1) + '%;transform:translateX(-50%);">' + fmtMoney(lo, cur) + '</div>' +
        (hi - lo > (max - min) * 0.18
          ? '<div class="fv-end" style="left:' + pos(hi).toFixed(1) + '%;transform:translateX(-50%);">' + fmtMoney(hi, cur) + '</div>'
          : '') +
        '</div>';

      html += '<div style="font-size:.8rem;color:var(--text-muted);line-height:1.5;">' +
        'Der Kurs liegt <b class="fv-diff ' + (below ? 'up' : 'down') + '">' +
        window.App.Format.number(Math.abs(diff), 1) + ' % ' + (below ? 'unter' : 'über') + '</b> dem Durchschnitt der berechneten Fair Values.' +
        (price >= lo && price <= hi ? ' Er liegt innerhalb der Spanne der Methoden.' : '') + '</div></div>';
    }

    // Einzelne Methoden
    html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Methoden im Detail</span></div>';
    methods.forEach(function (m) {
      html += '<div class="fv-method"><div class="fv-method-top"><span class="fv-method-name">' + esc(m.name) + '</span>';
      if (m.res.ok) {
        var d = price ? (m.res.value / price - 1) * 100 : null;
        html += '<span class="fv-method-val">' + fmtMoney(m.res.value, cur) +
          (d !== null ? ' <span class="fv-diff ' + (d >= 0 ? 'up' : 'down') + '" style="font-size:.72rem;">(' + fmtPct(d, 0) + ')</span>' : '') + '</span></div>' +
          '<div class="fv-note">' + m.res.note + '</div>';
      } else {
        html += '<span class="fv-method-val" style="color:var(--text-dim);">—</span></div>' +
          '<div class="fv-note">' + esc(m.res.reason) + '</div>';
      }
      html += '</div>';
    });
    html += '</div>';

    // Datenbasis
    html += '<div class="fv-note" style="padding:0 4px 12px;">Datenbasis: Gewinn ' + esc(b.niSource) + ', Cashflow ' + esc(b.fcfSource) +
      ', Bilanz letztes Quartal. Beträge in ' + esc(cur) + '.</div>';

    el.innerHTML = html;
  }

  return { render: render };
})();

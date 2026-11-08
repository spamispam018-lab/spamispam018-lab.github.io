/**
 * js/stock-fairvalue.js
 * Tab "Fair Value" der Aktiendetailansicht. Drei vereinfachte Bewertungsmethoden:
 *  1. Graham-Zahl:      √(22,5 × Gewinn je Aktie × Buchwert je Aktie)
 *  2. KGV-Vergleich:    Gewinn je Aktie × Median-KGV der Branche (bzw. des Sektors)
 *  3. DCF (vereinfacht): abgezinste freie Cashflows über 5 Jahre + Restwert, abzüglich Nettoschulden
 *
 * Alle Werte stammen aus den Abschlüssen der letzten vier Quartale (TTM) bzw. dem letzten Geschäftsjahr.
 * Reine Modellrechnung – keine Anlageberatung.
 * 
 * *NEU:* Bei ETFs werden die Fair Values aus den Einzelbewertungen der Top 5 Holdings gewichtet aggregiert, 
 * wobei für die restlichen (unbekannten) Holdings eine faire Bewertung (0% Upside) angenommen wird!
 */

window.App = window.App || {};

window.App.StockFairValue = (function () {
  'use strict';

  var GRAHAM_FACTOR = 22.5;
  var PEER_MIN = 5;          
  var DCF_YEARS = 5;

  var dcfInputs = { growth: null, discount: 9, terminal: 2.5, ticker: null };
  var styleInjected = false;
  var nameToTickerMap = {};

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

  function buildNameLookup(universe) {
    nameToTickerMap = {};
    (universe || []).forEach(function(u) {
      nameToTickerMap[u.ticker.toLowerCase()] = u.ticker;
      if (u.name) {
        var cleanName = u.name.toLowerCase().replace(/inc\.|inc|corp\.|corp|ltd\.|ltd|plc|ag|se|co\./g, '').trim();
        nameToTickerMap[cleanName] = u.ticker;
      }
    });
  }

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

  function yearlyLine(rows, field, scaleFn) {
    return sorted(rows).filter(function (r) { return num(r[field]) !== null; }).slice(-5).map(function (r) {
      return r.date.slice(0, 4) + ': ' + scaleFn(Number(r[field]));
    }).join(', ');
  }

  function buildGeminiPrompt(b, stock, cur, universe, results, etfHoldingsData) {
    var F = window.App.Format;
    var p = stock.profile || {};
    var r = stock.ratios || {};
    var fin = stock.financials || {};
    var an = ((stock.analysts || {}).targets) || {};
    var money = function (v) { return F.compactNumber(v); };

    var lines = [];
    lines.push('Hallo Gemini! Ich bewerte ' + (p.name || stock.ticker) + ' (' + stock.ticker + ') mit einem vereinfachten DCF-Modell ' +
      '(freier Cashflow, 5 Jahre Wachstum, Restwert). ' +
      'Bitte prüfe meine Daten und berücksichtige das aktuelle Marktumfeld.');
    lines.push('');

    if (etfHoldingsData && etfHoldingsData.length > 0) {
      lines.push('WICHTIG: Das ist ein ETF. Die DCF- und Fair-Value-Werte wurden anteilig aus den Fundamentaldaten der größten enthaltenen Aktien (Top Holdings) berechnet.');
      lines.push('Dabei wurde für die nicht abgedeckten Holdings (Rest zu 100%) ein faires Pricing (0% Upside) angenommen.');
      lines.push('Welche durchschnittlichen Wachstumsraten und Diskontsätze sind für die Top-Positionen dieses ETFs angemessen?');
    } else {
      lines.push('Welche Werte passen für diese Aktie am besten? Ich brauche:');
    }

    lines.push('1. Wachstum der freien Cashflows p. a. über 5 Jahre (mein Regler: 0–20 %)');
    lines.push('2. Diskontsatz bzw. geforderte Rendite (Regler: 6–14 %)');
    lines.push('3. Ewiges Wachstum für den Restwert (Regler: 0–4 %)');
    lines.push('Nenne ein pessimistisches, ein Basis- und ein optimistisches Szenario mit kurzer Begründung. ' +
      'Schließe mit einer Zeile: "Basis: Wachstum X % | Diskontsatz Y % | Ewiges Wachstum Z %".');
    lines.push('');

    if (!etfHoldingsData) {
      lines.push('Meine Daten (Beträge in ' + cur + '):');
      lines.push('- Sektor: ' + (p.sector || 'N/A'));
      if (b.price) lines.push('- Kurs: ' + F.currency(b.price, cur));
      if (b.fcf !== null) lines.push('- Freier Cashflow (' + b.fcfSource + '): ' + money(b.fcf));
      var fcfHist = yearlyLine((fin.cashFlow || {}).annual, 'Free_Cash_Flow', money);
      if (fcfHist) lines.push('- Freier Cashflow historisch: ' + fcfHist);
    }

    lines.push('');
    lines.push('Meine aktuellen Annahmen (im Tool eingetragen): Wachstum ' + F.number(dcfInputs.growth, 0) + ' %, Diskontsatz ' + F.number(dcfInputs.discount, 1) +
      ' %, ewiges Wachstum ' + F.number(dcfInputs.terminal, 1) + ' %.');
    var out = [];
    if (results.dcf && results.dcf.ok) out.push('DCF ' + F.currency(results.dcf.value, cur));
    if (results.graham && results.graham.ok) out.push('Graham-Zahl ' + F.currency(results.graham.value, cur));
    if (results.peer && results.peer.ok) out.push('KGV-Vergleich ' + F.currency(results.peer.value, cur));
    if (out.length) lines.push('Daraus ergibt sich: ' + out.join(', ') + '.');
    
    return lines.join('\n');
  }

  function openGemini(promptText, ticker) {
    var safe = promptText, needsPaste = false;
    if (promptText.length > 2000) {
      safe = 'Hallo Gemini! Ich möchte die DCF-Annahmen für ' + ticker + ' mit dir klären. ' +
        'Ich füge dir die Daten gleich in meiner nächsten Nachricht ein. Bitte antworte zunächst nur mit \'Bereit\'.';
      needsPaste = true;
    }
    var url = 'https://gemini.google.com/app?q=' + encodeURIComponent(safe);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(promptText).then(function () {
        if (needsPaste) {
          window.alert('Hinweis: Der Text wurde in die Zwischenablage kopiert. Füge ihn bei Gemini über "Einfügen" in das Chat-Feld ein.');
        }
        window.open(url, '_blank');
      }).catch(function () { window.open(url, '_blank'); });
    } else {
      window.open(url, '_blank');
    }
  }

  function render(container, stock) {
    if (!container || !stock) return;
    injectStyles();
    container.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Berechne Fair Value...</p></div>';

    window.App.Data.getUniverse().then(function (universe) {
      if (!document.body.contains(container)) return;

      var isEtf = (stock.sector === 'Sonstige' || stock.sector === 'ETF' || !stock.sector);
      var holdings = stock.holdings || [];

      if (isEtf && holdings.length > 0) {
        buildNameLookup(universe);
        var top5 = holdings.slice(0, 5);
        
        var promises = top5.map(function(h) {
          var cleanName = h.name.toLowerCase().replace(/inc\.|inc|corp\.|corp|ltd\.|ltd|plc|ag|se|co\./g, '').trim();
          var targetTicker = nameToTickerMap[cleanName] || nameToTickerMap[h.name.toLowerCase()] || null;
          if (!targetTicker) {
            var possible = universe.find(function(u) { return u.ticker.indexOf(h.name) === 0; });
            if (possible) targetTicker = possible.ticker;
          }
          if (targetTicker) {
            return window.App.Data.getStock(targetTicker).then(function(res) {
                return { data: res, weight: h.weight || 0 };
            }).catch(function() { return null; });
          }
          return Promise.resolve(null);
        });

        Promise.all(promises).then(function(results) {
           var validHoldings = results.filter(function(r) { return r && r.data; });
           draw(container, stock, universe, validHoldings);
        });
      } else {
         draw(container, stock, universe, null);
      }
    });
  }

  function draw(container, stock, universe, etfHoldingsData) {
    var ticker = (stock.ticker || '').toUpperCase();
    var cur = (stock.quote || {}).currency || (stock.profile || {}).currency || 'EUR';
    var b = extractBase(stock);

    if (dcfInputs.ticker !== ticker || dcfInputs.growth === null) {
      dcfInputs.ticker = ticker;
      if (etfHoldingsData && etfHoldingsData.length > 0) {
         var revGWeight = 0, revGSum = 0;
         etfHoldingsData.forEach(function(h) {
            var hb = extractBase(h.data);
            if (hb.revGrowth !== null) {
               revGSum += hb.revGrowth * h.weight;
               revGWeight += h.weight;
            }
         });
         var avgRevG = revGWeight > 0 ? (revGSum / revGWeight) : 0.05;
         dcfInputs.growth = Math.round(Math.max(2, Math.min(15, avgRevG * 100)));
      } else {
         dcfInputs.growth = defaultGrowth(b);
      }
      dcfInputs.discount = 9;
      dcfInputs.terminal = 2.5;
    }

    var html = '' +
      '<div id="fv-results"></div>' +
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">DCF-Annahmen</span>' +
          '<button class="chip-btn" id="fv-reset" style="padding:3px 10px;font-size:.72rem;">Zurücksetzen</button></div>' +
        '<div style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%); border: 1px solid var(--accent-purple); border-radius: var(--radius-md); padding: 12px; margin-top: 4px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">' +
          '<div style="flex: 1;">' +
            '<div style="font-size: 0.86rem; font-weight: 700; color: var(--text-main); margin-bottom: 2px;">KI-Einschätzung der Annahmen</div>' +
            '<div style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4;">Frage Gemini, welche Werte für diese Aktie am besten passen.</div>' +
          '</div>' +
          '<button id="fv-gemini" class="chip-btn active" style="background: var(--accent-purple); border-color: var(--accent-purple); font-size: 0.75rem; flex-shrink: 0; box-shadow: 0 4px 14px var(--accent-purple-glow);">Fragen</button>' +
        '</div>' +
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

    var lastResults = { graham: null, peer: null, dcf: null };

    function update() {
      var etfPrice = (stock.quote || {}).price || 0;
      var graham, peer, dcf;

      if (etfHoldingsData && etfHoldingsData.length > 0) {
         var gWeight = 0, gUpside = 0;
         var pWeight = 0, pUpside = 0;
         var dWeight = 0, dUpside = 0;

         etfHoldingsData.forEach(function(h) {
            var hb = extractBase(h.data);
            if (!hb.price) return;

            var hg = grahamValue(hb);
            if (hg.ok) {
                gUpside += ((hg.value - hb.price) / hb.price) * h.weight;
                gWeight += h.weight;
            }
            var hp = peerValue(hb, h.data, universe);
            if (hp.ok) {
                pUpside += ((hp.value - hb.price) / hb.price) * h.weight;
                pWeight += h.weight;
            }
            var hd = dcfValue(hb, h.data, dcfInputs);
            if (hd.ok) {
                dUpside += ((hd.value - hb.price) / hb.price) * h.weight;
                dWeight += h.weight;
            }
         });

         // Konservativer Ansatz: Der unbekannte Rest des ETFs wird mit 0% Upside (fair bewertet) angenommen
         graham = (gWeight > 0 && etfPrice > 0) ? { ok: true, value: etfPrice * (1 + (gUpside / 100)), note: 'Gewichteter Durchschnitt der Graham-Bewertungen aus den Top-Holdings (Rest wird als fair bewertet angenommen).' } : { ok: false, reason: 'Gewinne oder Buchwerte der Holdings nicht berechenbar.' };
         peer = (pWeight > 0 && etfPrice > 0) ? { ok: true, value: etfPrice * (1 + (pUpside / 100)), note: 'Gewichteter Durchschnitt der KGV-Bewertungen aus den Top-Holdings (Rest wird als fair bewertet angenommen).' } : { ok: false, reason: 'Nicht genügend Branchen-Peers für die Holdings gefunden.' };
         dcf = (dWeight > 0 && etfPrice > 0) ? { ok: true, value: etfPrice * (1 + (dUpside / 100)), note: 'Gewichteter Durchschnitt der DCF-Werte aus den Top-Holdings (Annahmen gelten übergreifend, Rest wird als fair bewertet angenommen).' } : { ok: false, reason: 'Freie Cashflows der Holdings negativ oder nicht berechenbar.' };

      } else {
         graham = grahamValue(b);
         peer = peerValue(b, stock, universe);
         dcf = dcfValue(b, stock, dcfInputs);
      }

      lastResults.graham = graham;
      lastResults.peer = peer;
      lastResults.dcf = dcf;

      drawResults(container.querySelector('#fv-results'), b, cur, graham, peer, dcf, etfHoldingsData, etfPrice);
      
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
      dcfInputs.growth = etfHoldingsData ? dcfInputs.growth : defaultGrowth(b); 
      dcfInputs.discount = 9; 
      dcfInputs.terminal = 2.5;
      g.value = dcfInputs.growth; r.value = dcfInputs.discount; t.value = dcfInputs.terminal;
      update();
    };
    var gemBtn = container.querySelector('#fv-gemini');
    if (gemBtn) {
      gemBtn.onclick = function () {
        openGemini(buildGeminiPrompt(b, stock, cur, universe, lastResults, etfHoldingsData), ticker);
      };
    }
    update();
  }

  function drawResults(el, b, cur, graham, peer, dcf, etfHoldingsData, etfPrice) {
    if (!el) return;
    var price = etfHoldingsData ? etfPrice : b.price;
    var methods = [
      { name: 'Graham-Zahl', res: graham },
      { name: 'KGV-Vergleich (Peers)', res: peer },
      { name: 'DCF (vereinfacht)', res: dcf }
    ];
    var values = methods.filter(function (m) { return m.res.ok; }).map(function (m) { return m.res.value; });

    var html = '';

    if (etfHoldingsData && etfHoldingsData.length > 0) {
       html += '<div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:12px; padding:8px 12px; background:var(--bg-tertiary); border-radius:var(--radius-sm); border:1px solid var(--border-subtle);"><b>Hinweis (ETF):</b> Da ein ETF keine eigene Gewinn-/Cashflow-Bilanz aufweist, wurde die Fair-Value-Spanne aus den anteiligen Einzelbewertungen der größten enthaltenen Aktien (Top Holdings) berechnet. Dabei wird für den restlichen (unbekannten) Teil des Fonds eine faire Bewertung (0% Aufschlag) angenommen.</div>';
    }

    html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Fair-Value-Spanne</span>' +
      '<span class="sector-label">' + values.length + ' von 3 Methoden</span></div>';

    if (!values.length || !price) {
      html += '<div class="fv-note">Mit den vorhandenen Daten lässt sich keine Methode berechnen. Die Gründe stehen unten bei den einzelnen Methoden.</div></div>';
    } else {
      var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
      var avg = values.reduce(function (a, v) { return a + v; }, 0) / values.length;
      var diff = (avg / price - 1) * 100;
      var below = diff >= 0;

      html += '<div class="fv-summary">' +
        '<div class="fv-cell"><div class="fv-label">Aktueller Kurs</div><div class="fv-value">' + fmtMoney(price, cur) + '</div></div>' +
        '<div class="fv-cell"><div class="fv-label">Ø Fair Value</div><div class="fv-value">' + fmtMoney(avg, cur) + '</div></div>' +
        '</div>';

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

    if (!etfHoldingsData) {
      html += '<div class="fv-note" style="padding:0 4px 12px;">Datenbasis: Gewinn ' + esc(b.niSource) + ', Cashflow ' + esc(b.fcfSource) +
        ', Bilanz letztes Quartal. Beträge in ' + esc(cur) + '.</div>';
    }

    el.innerHTML = html;
  }

  return { render: render };
})();

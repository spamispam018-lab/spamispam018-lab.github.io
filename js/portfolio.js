/**
 * js/portfolio.js
 * Portfolio-Tracker mit Transaktions-Log (FIFO) und Equity-Curve.
 * NEU: Layout-Anpassung – Zusammenfassung (Kachel 1) ist jetzt größer und oben.
 * Die Stop-Loss-Risiko-Karte (Kachel 2) ist jetzt kompakter und unten.
 */
window.App = window.App || {};

window.App.Portfolio = (function () {
  'use strict';

  var STOPS_KEY = 'app_portfolio_stops_v1';
  var PEAKS_KEY = 'app_portfolio_peaks_v1';
  
  var state = { chartPeriod: '1Y' };
  var editingTxId = null; 

  function getStops() {
    try { return JSON.parse(localStorage.getItem(STOPS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function getStopPct(ticker) {
    var stops = getStops();
    return stops[ticker] !== undefined ? stops[ticker] : 10;
  }
  function setStopPct(ticker, pct) {
    var stops = getStops();
    stops[ticker] = pct;
    try { localStorage.setItem(STOPS_KEY, JSON.stringify(stops)); } catch (e) {}
  }

  function getPeaks() {
    try { return JSON.parse(localStorage.getItem(PEAKS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function getPeak(ticker) {
    var peaks = getPeaks();
    return peaks[ticker] || null;
  }
  function setPeak(ticker, price) {
    var peaks = getPeaks();
    peaks[ticker] = price;
    try { localStorage.setItem(PEAKS_KEY, JSON.stringify(peaks)); } catch (e) {}
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function calculateStopLoss(r, stopPct) {
    var basePrice = r.p.buyPrice;
    var basisLabel = 'Kaufpreis';

    if (r.u.price && r.u.price >= r.p.buyPrice) {
      var peak = r.peak || 0;
      basePrice = Math.max(r.u.price, peak);
      basisLabel = (basePrice === r.u.price && basePrice !== peak) ? 'Aktuell' : 'Peak';
    } else {
      basePrice = r.p.buyPrice;
      basisLabel = 'Kaufpreis';
    }

    var stopPrice = basePrice * (1 - stopPct / 100);
    return { basePrice: basePrice, stopPrice: stopPrice, basisLabel: basisLabel };
  }

  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;
    var headerFilterBtn = document.getElementById('btn-header-filter');
    if (headerFilterBtn) headerFilterBtn.style.display = 'none';

    if (window.App.Transactions) window.App.Transactions.migrateOldPortfolio();

    var positions = {};
    try { positions = window.App.Transactions.computePositions(); } catch (e) {}
    var holdingTickers = Object.keys(positions);

    window.App.Data.getUniverse()
      .then(function (universe) {
        var map = {};
        universe.forEach(function (u) { map[u.ticker] = u; });

        var missing = holdingTickers.filter(function (t) { return !map[t]; });
        return Promise.all(missing.map(function (t) {
          return window.App.Data.getStock(t)
            .then(function (st) {
              map[t] = {
                ticker: t,
                name: (st.profile && st.profile.name) || t,
                price: st.quote && st.quote.price,
                changePercent: st.quote && st.quote.changePercent
              };
            })
            .catch(function () {
              map[t] = { ticker: t, name: t, price: null, changePercent: null };
            });
        })).then(function () {
          return Promise.all(holdingTickers.map(function (t) {
            return window.App.Data.getStock(t).then(function (st) { return { ticker: t, stock: st }; }).catch(function () { return { ticker: t, stock: null }; });
          })).then(function (stocksData) { render(container, positions, map, universe, stocksData); });
        });
      })
      .catch(function (err) {
        container.innerHTML = '<div class="view-container"><div class="state-box"><p>Fehler: ' + esc(err.message) + '</p></div></div>';
      });
  }

  function render(container, positions, map, universe, stocksData) {
    var F = window.App.Format;
    var tickers = Object.keys(positions);
    var invested = 0, value = 0;

    var rows = tickers.map(function (t) {
      var p = positions[t];
      var u = map[t] || { price: null, name: t, changePercent: null };
      var px = u.price;
      
      var peak = getPeak(t);
      if (px && (!peak || px > peak)) {
        peak = px;
        setPeak(t, peak);
      }

      var v = (px !== null && px !== undefined) ? px * p.shares : null;
      var inv = p.buyPrice * p.shares;
      var pl = (v !== null) ? v - inv : null;
      var plPct = (v !== null && inv) ? (pl / inv) * 100 : null;
      
      var dailyChangePct = u.changePercent; 

      if (v !== null) { invested += inv; value += v; }
      return { p: p, u: u, v: v, inv: inv, pl: pl, plPct: plPct, peak: peak, dailyChangePct: dailyChangePct };
    });

    var totalValue = value;
    var totalRiskEur = 0;
    
    rows.forEach(function(r) {
      if (r.p.shares > 0) {
        var pct = getStopPct(r.p.ticker);
        var sl = calculateStopLoss(r, pct);
        if (r.u.price && r.u.price > sl.stopPrice) {
           totalRiskEur += (r.u.price - sl.stopPrice) * r.p.shares;
        }
      }
    });
    var totalRiskPct = totalValue > 0 ? (totalRiskEur / totalValue) * 100 : 0;

    var html = '<div class="view-container">';
    html += '<div style="margin-bottom: 16px;"><h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">Mein Portfolio</h2>';
    html += '<div style="font-size: 0.78rem; color: var(--text-dim);">' + rows.length + ' Positionen' +
      (rows.length ? ' <button class="chip-btn" id="pf-export-btn" style="padding: 3px 9px; margin-left: 10px; font-size: 0.72rem;">⬇ CSV</button>' +
        ' <button class="chip-btn" id="pf-ai-btn" style="padding: 3px 9px; margin-left: 6px; font-size: 0.72rem;">✦ KI-Check</button>' : '') +
      '</div></div>';

    if (rows.length) {
      var totalPl = value - invested;
      var totalPlPct = invested ? (totalPl / invested) * 100 : null;
      
      // --- KACHEL 1: Portfolio-Zusammenfassung (Größer & weiter oben) ---
      html += '<div class="card" style="padding: 18px 16px; margin-bottom: 14px; border: 1px solid var(--border-color); box-shadow: 0 4px 12px var(--shadow-soft);">' +
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">' +
          '<div>' +
            '<div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Investiert</div>' +
            '<div style="font-weight: 800; font-size: 1.2rem; color: var(--text-main);">' + F.currency(invested) + '</div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Aktueller Wert</div>' +
            '<div style="font-weight: 800; font-size: 1.2rem; color: var(--text-main);">' + F.currency(value) + '</div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Gewinn/Verlust</div>' +
            '<div class="badge-pill ' + F.changeClass(totalPl) + '" style="display: inline-flex; font-size: 0.85rem; padding: 4px 10px; border-radius: var(--radius-md);">' + 
              (totalPl >= 0 ? '+' : '') + F.currency(totalPl) + ' (' + F.percent(totalPlPct, true, 2) + ')' + 
            '</div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Positionen</div>' +
            '<div style="font-weight: 800; font-size: 1.2rem; color: var(--text-main);">' + rows.length + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

      // --- KACHEL 2: Stop-Loss Risiko (Kompakter & weiter unten) ---
      html += '<div class="card" style="padding: 12px 14px; margin-bottom: 14px; background: linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.02) 100%); border-color: rgba(239, 68, 68, 0.2);">' +
        '<div style="display: flex; justify-content: space-between; align-items: center;">' +
          '<div style="display: flex; align-items: center; gap: 8px;">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--bearish)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>' +
            '<div style="font-size: 0.78rem; font-weight: 600; color: var(--text-dim);">Max. Verlust (Stop-Loss)</div>' +
          '</div>' +
          '<div style="text-align: right; display: flex; align-items: baseline; gap: 6px;">' +
            '<div id="pf-total-risk-eur" style="font-weight: 800; font-size: 1.05rem; color: var(--bearish);">' + F.currency(totalRiskEur) + '</div>' +
            '<div id="pf-total-risk-pct" style="font-weight: 700; font-size: 0.8rem; color: var(--bearish);">(' + F.number(totalRiskPct, 1) + ' %)</div>' +
          '</div>' +
        '</div>' +
      '</div>';

      // --- KACHEL 3: Equity-Curve ---
      html += '<div class="card">' +
        '<div class="card-header-dotted" style="flex-wrap: wrap; gap: 8px;">' +
          '<span class="card-title">Equity-Curve</span>' +
          '<div class="pill-group" id="pf-eq-pills">' +
            '<button class="pill-btn ' + (state.chartPeriod === '1W' ? 'active' : '') + '" data-period="1W">1W</button>' +
            '<button class="pill-btn ' + (state.chartPeriod === '1M' ? 'active' : '') + '" data-period="1M">1M</button>' +
            '<button class="pill-btn ' + (state.chartPeriod === '3M' ? 'active' : '') + '" data-period="3M">3M</button>' +
            '<button class="pill-btn ' + (state.chartPeriod === '6M' ? 'active' : '') + '" data-period="6M">6M</button>' +
            '<button class="pill-btn ' + (state.chartPeriod === '1Y' ? 'active' : '') + '" data-period="1Y">1J</button>' +
          '</div>' +
        '</div>' +
        '<div style="height: 220px; width: 100%; position: relative;"><canvas id="pf-equity-canvas" class="chart-canvas"></canvas></div>' +
        '<div class="chart-legend">' +
          '<div class="legend-item"><span class="legend-dot" style="background:#818cf8;"></span><span>Portfoliowert</span></div>' +
          '<div class="legend-item"><span class="legend-dot" style="background:#10b981;"></span><span>Investiert</span></div>' +
        '</div>' +
        '<div id="pf-eq-bench" class="horizontal-scroll-row" style="margin-top:10px;gap:6px;"></div>' +
        '<div id="pf-eq-stats" style="margin-top:12px;"></div>' +
        '</div>';
      html += '<div id="pf-insights"></div>';
    }

    var datalist = universe.slice(0, 200).map(function (u) {
      return '<option value="' + esc(u.ticker) + '">' + esc(u.name) + '</option>';
    }).join('');

    var formTitle = editingTxId ? 'Transaktion bearbeiten' : 'Transaktion hinzufügen';
    var btnText = editingTxId ? '✓ Aktualisieren' : '+ Transaktion speichern';
    var cancelBtnDisplay = editingTxId ? 'inline-flex' : 'none';

    html += '<div class="card" id="pf-form-card"><div class="card-header-dotted"><span class="card-title">' + formTitle + '</span></div>' +
      '<div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: end;">' +
        '<div style="flex: 1 1 90px;"><label style="font-size: 0.7rem; color: var(--text-dim);">Ticker</label>' +
          '<input id="pf-in-ticker" class="search-input" list="pf-tickers" placeholder="AAPL" autocomplete="off" style="padding-left:14px;">' +
          '<datalist id="pf-tickers">' + datalist + '</datalist></div>' +
        '<div style="flex: 1 1 70px;"><label style="font-size: 0.7rem; color: var(--text-dim);">Typ</label>' +
          '<select id="pf-in-type" class="search-input" style="padding-left:14px;"><option value="buy">Kauf</option><option value="sell">Verkauf</option></select></div>' +
        '<div style="flex: 1 1 70px;"><label style="font-size: 0.7rem; color: var(--text-dim);">Stück</label>' +
          '<input id="pf-in-shares" class="search-input" type="number" min="0" step="any" placeholder="10" style="padding-left:14px;"></div>' +
        '<div style="flex: 1 1 80px;"><label style="font-size: 0.7rem; color: var(--text-dim);">Kurs (€)</label>' +
          '<input id="pf-in-price" class="search-input" type="number" min="0" step="any" placeholder="150" style="padding-left:14px;"></div>' +
        '<div style="flex: 1 1 100px;"><label style="font-size: 0.7rem; color: var(--text-dim);">Datum</label>' +
          '<input id="pf-in-date" class="search-input" type="date" style="padding-left:14px;"></div>' +
        '<div style="width: 100%; margin-top: 4px; display: flex; gap: 8px;">' +
          '<button class="chip-btn active" id="pf-add-btn" style="flex: 1; height: 38px; justify-content: center;">' + btnText + '</button>' +
          '<button class="chip-btn" id="pf-cancel-btn" style="height: 38px; justify-content: center; display: ' + cancelBtnDisplay + ';">Abbrechen</button>' +
        '</div>' +
      '</div></div>';

    if (!rows.length) {
      html += '<div class="state-box"><div style="font-weight: 600; color: var(--text-muted);">Noch keine Positionen</div>' +
        '<div style="font-size: 0.8rem;">Füge oben deine erste Transaktion hinzu.</div></div>';
    } else {
      rows.forEach(function (r) {
        var weight = (r.v !== null && value) ? (r.v / value) * 100 : null;
        var stopPct = getStopPct(r.p.ticker);
        var sl = calculateStopLoss(r, stopPct);
        var stopPrice = sl.stopPrice;
        var isStopBreached = r.u.price && stopPrice && r.u.price <= stopPrice;
        var posRisk = (r.u.price && stopPrice && r.u.price > stopPrice) ? (r.u.price - stopPrice) * r.p.shares : 0;

        var dailyPct = r.dailyChangePct;
        var dailySign = (dailyPct > 0) ? '+' : '';
        var dailyColor = (dailyPct > 0) ? 'var(--bullish)' : (dailyPct < 0 ? 'var(--bearish)' : 'var(--text-muted)');
        var dailyText = (dailyPct !== null && dailyPct !== undefined) ? dailySign + F.number(dailyPct, 2) + ' %' : '—';

        var totalSign = (r.plPct > 0) ? '+' : '';
        var totalText = (r.plPct !== null && r.plPct !== undefined) ? totalSign + F.number(r.plPct, 2) + ' %' : '—';

        html += '<div class="card" style="padding: 12px 14px; margin-bottom: 10px; ' + (isStopBreached ? 'border-color: var(--bearish);' : '') + '" data-pf-ticker="' + esc(r.p.ticker) + '">' +
          '<div style="display: flex; justify-content: space-between; align-items: flex-start;">' +
            '<div style="cursor: pointer;" class="pf-goto-detail"><div style="font-weight: 700;">' + esc(r.u.name || r.p.ticker) + '</div>' +
              '<div style="font-size: 0.72rem; color: var(--text-dim);">' + esc(r.p.ticker) + ' · ' + F.number(r.p.shares, 4) + ' Stk. à ' + F.currency(r.p.buyPrice) + '</div>' +
            '</div>' +
            
            '<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">' +
              '<div style="font-weight: 800; font-variant-numeric: tabular-nums;">' + F.currency(r.v) + '</div>' +
              '<div style="display: flex; gap: 6px; align-items: center;">' +
                '<div style="font-size: 0.75rem; font-weight: 700; color: ' + dailyColor + ';" title="Tagesperformance">' + dailyText + '</div>' +
                '<div class="badge-pill ' + F.changeClass(r.pl) + '" style="font-size: 0.68rem;" title="Seit Kauf">' + 
                  (r.pl === null ? '—' : (r.pl >= 0 ? '+' : '') + F.currency(r.pl) + ' (' + totalText + ')') + 
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">' +
            '<div style="flex: 1; margin-right: 10px;"><div style="height: 5px; background: var(--border-subtle); border-radius: 3px; overflow: hidden;"><div style="height: 100%; width: ' + (weight || 0).toFixed(1) + '%; background: var(--accent-purple-light, #818cf8);"></div></div></div>' +
            '<div style="font-size: 0.72rem; color: var(--text-dim); white-space: nowrap;">' +
              (weight !== null ? F.number(weight, 1) + ' %' : '—') + ' · Kurs ' + F.currency(r.u.price) +
            '</div>' +
          '</div>' +
          
          '<div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border-subtle);">' +
            '<div style="display: flex; flex-direction: column; gap: 4px;">' +
              '<div style="display: flex; align-items: center; gap: 6px;">' +
                '<span style="font-size: 0.72rem; color: var(--text-dim);">Stop:</span>' +
                '<div style="display: flex; align-items: center; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 2px 6px;">' +
                  '<input type="number" class="pf-stop-input" data-ticker="' + esc(r.p.ticker) + '" value="' + stopPct + '" min="1" max="99" style="width: 35px; background: transparent; border: none; color: var(--text-main); font-size: 0.75rem; text-align: right; outline: none;">' +
                  '<span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 2px;">%</span>' +
                '</div>' +
              '</div>' +
              '<div style="font-size: 0.65rem; color: var(--text-dim);" title="Berechnungsgrundlage">' +
                'Basis: ' + sl.basisLabel + ' (' + F.currency(sl.basePrice) + ')' +
              '</div>' +
            '</div>' +
            
            '<div style="text-align: right;">' +
              '<div id="pf-stop-price-' + esc(r.p.ticker) + '" style="font-size: 0.9rem; font-weight: 800; color: ' + (isStopBreached ? 'var(--bullish)' : 'var(--bearish)') + ';">' +
                (stopPrice ? F.currency(stopPrice) : '—') + 
              '</div>' +
              (isStopBreached 
                ? '<div style="font-size: 0.65rem; color: var(--bearish); font-weight: 700;">STOP GERISSEN</div>'
                : '<div id="pf-stop-risk-' + esc(r.p.ticker) + '" style="font-size: 0.65rem; color: var(--text-dim);">Risiko: ' + F.currency(posRisk) + '</div>'
              ) +
            '</div>' +
          '</div>' +
        '</div>';
      });
    }

    var txs = (window.App.Transactions ? window.App.Transactions.getAll() : []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    if (txs.length) {
      html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Transaktions-Log</span><span class="sector-label">' + txs.length + ' Einträge</span></div>';
      html += '<div style="display:flex; flex-direction:column; gap:8px;">';
      
      txs.slice(0, 50).forEach(function (tx) {
        var typeCls = tx.type === 'buy' ? 'badge-bullish' : 'badge-bearish';
        html += '<div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:var(--bg-secondary); border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">' +
          '<div>' +
            '<div style="font-weight:700; font-size:0.85rem; color:var(--text-main); margin-bottom:2px;">' + esc(tx.ticker) + '</div>' +
            '<div style="font-size:0.7rem; color:var(--text-dim); display:flex; gap:8px; align-items:center;">' +
              '<span>' + F.date(tx.date) + '</span>' +
              '<span class="badge-pill ' + typeCls + '" style="padding:1px 5px; font-size:0.6rem;">' + (tx.type === 'buy' ? 'Kauf' : 'Verkauf') + '</span>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex; align-items:center; gap:12px;">' +
            '<div style="text-align:right;">' +
              '<div style="font-size:0.8rem; font-weight:600;">' + F.number(tx.shares, 2) + ' Stk.</div>' +
              '<div style="font-size:0.7rem; color:var(--text-dim);">à ' + F.currency(tx.price) + '</div>' +
            '</div>' +
            '<div style="display:flex; gap:4px;">' +
              '<button class="chip-btn pf-tx-edit" data-id="' + esc(tx.id) + '" style="padding:4px 8px; font-size:0.8rem;" title="Bearbeiten">✏️</button>' +
              '<button class="chip-btn pf-tx-del" data-id="' + esc(tx.id) + '" style="padding:4px 8px; font-size:0.8rem;" title="Löschen">🗑</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
      
      html += '</div>';
      if (txs.length > 50) html += '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:8px;text-align:center;">Die letzten 50 von ' + txs.length + ' Transaktionen.</div>';
      html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;

    var dateInput = document.getElementById('pf-in-date');
    if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);

    if (editingTxId) {
      var txToEdit = txs.find(function(t) { return t.id === editingTxId; });
      if (txToEdit) {
        document.getElementById('pf-in-ticker').value = txToEdit.ticker;
        document.getElementById('pf-in-ticker').disabled = true;
        document.getElementById('pf-in-type').value = txToEdit.type;
        document.getElementById('pf-in-shares').value = txToEdit.shares;
        document.getElementById('pf-in-price').value = txToEdit.price;
        document.getElementById('pf-in-date').value = txToEdit.date;
        setTimeout(function() {
          var formCard = document.getElementById('pf-form-card');
          if (formCard) formCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    } else {
       var tickerInput = document.getElementById('pf-in-ticker');
       if (tickerInput) tickerInput.disabled = false;
    }

    document.getElementById('pf-add-btn').onclick = function () {
      var t = (document.getElementById('pf-in-ticker').value || '').trim().toUpperCase();
      var type = document.getElementById('pf-in-type').value;
      var sh = parseFloat(document.getElementById('pf-in-shares').value);
      var bp = parseFloat(document.getElementById('pf-in-price').value);
      var dt = document.getElementById('pf-in-date').value || new Date().toISOString().slice(0, 10);
      
      if (!t || !(sh > 0) || !(bp > 0)) { alert('Bitte Ticker, Stückzahl und Kurs ausfüllen.'); return; }
      
      if (editingTxId) {
        window.App.Transactions.update(editingTxId, { type: type, shares: sh, price: bp, date: dt });
        editingTxId = null;
      } else {
        window.App.Transactions.add({ ticker: t, type: type, shares: sh, price: bp, date: dt });
      }
      initView();
    };

    var cancelBtn = document.getElementById('pf-cancel-btn');
    if (cancelBtn) {
      cancelBtn.onclick = function() {
        editingTxId = null;
        initView();
      };
    }

    container.querySelectorAll('.pf-tx-edit').forEach(function (btn) {
      btn.onclick = function () {
        editingTxId = btn.getAttribute('data-id');
        initView();
      };
    });

    container.querySelectorAll('.pf-tx-del').forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm('Transaktion löschen?')) return;
        var id = btn.getAttribute('data-id');
        if (editingTxId === id) editingTxId = null;
        window.App.Transactions.remove(id);
        initView();
      };
    });

    var aiBtn = document.getElementById('pf-ai-btn');
    if (aiBtn) aiBtn.onclick = function () {
      var w = {};
      rows.forEach(function (r) { w[r.p.ticker] = totalValue > 0 ? (r.v / totalValue) * 100 : 0; });
      if (window.App.AIAsk) window.App.AIAsk.list('depot', rows.map(function (r) { return r.p.ticker; }), w);
    };
    var exportBtn = document.getElementById('pf-export-btn');
    if (exportBtn) {
      exportBtn.onclick = function () {
        window.App.Export.downloadCsv('portfolio.csv', [
          { label: 'Ticker', get: function (r) { return r.p.ticker; } },
          { label: 'Name', get: function (r) { return r.u.name; } },
          { label: 'Stück', get: function (r) { return r.p.shares; } },
          { label: 'Ø Kaufkurs', get: function (r) { return r.p.buyPrice; } },
          { label: 'Kurs aktuell', get: function (r) { return r.u.price; } },
          { label: 'Tagesperformance %', get: function (r) { return r.dailyChangePct; } },
          { label: 'Peak', get: function (r) { return r.peak; } },
          { label: 'Stop-Loss %', get: function (r) { return getStopPct(r.p.ticker); } },
          { label: 'Stop-Loss Basis', get: function (r) { return calculateStopLoss(r, getStopPct(r.p.ticker)).basisLabel; } },
          { label: 'Stop-Loss Kurs', get: function (r) { return calculateStopLoss(r, getStopPct(r.p.ticker)).stopPrice; } },
          { label: 'Investiert', get: function (r) { return r.inv; } },
          { label: 'Wert', get: function (r) { return r.v; } },
          { label: 'P/L', get: function (r) { return r.pl; } },
          { label: 'P/L % (Seit Kauf)', get: function (r) { return r.plPct; } }
        ], rows);
      };
    }

    container.querySelectorAll('.pf-goto-detail').forEach(function (el) {
      el.onclick = function () {
        var t = el.closest('[data-pf-ticker]').getAttribute('data-pf-ticker');
        window.App.Router.navigate('/stock/' + t + '/overview');
      };
    });

    container.querySelectorAll('.pf-stop-input').forEach(function(input) {
      input.onchange = function() {
        var ticker = input.getAttribute('data-ticker');
        var newPct = parseFloat(input.value);
        
        if (isNaN(newPct) || newPct <= 0 || newPct >= 100) {
          input.value = getStopPct(ticker);
          return;
        }
        
        setStopPct(ticker, newPct);
        
        var r = rows.find(function(x) { return x.p.ticker === ticker; });
        if (r) {
          var sl = calculateStopLoss(r, newPct);
          var isBreached = r.u.price <= sl.stopPrice;
          var risk = (r.u.price && r.u.price > sl.stopPrice) ? (r.u.price - sl.stopPrice) * r.p.shares : 0;
          
          var elPrice = document.getElementById('pf-stop-price-' + ticker);
          var elRisk = document.getElementById('pf-stop-risk-' + ticker);
          
          if (elPrice) {
            elPrice.textContent = F.currency(sl.stopPrice);
            elPrice.style.color = isBreached ? 'var(--bullish)' : 'var(--bearish)';
          }
          if (elRisk && !isBreached) {
            elRisk.textContent = 'Risiko: ' + F.currency(risk);
          }
        }
        
        var newTotalRisk = 0;
        rows.forEach(function(row) {
          if (row.p.shares > 0) {
            var pct = getStopPct(row.p.ticker);
            var sl2 = calculateStopLoss(row, pct);
            if (row.u.price && row.u.price > sl2.stopPrice) newTotalRisk += (row.u.price - sl2.stopPrice) * row.p.shares;
          }
        });
        var newTotalRiskPct = totalValue > 0 ? (newTotalRisk / totalValue) * 100 : 0;
        
        var elEur = document.getElementById('pf-total-risk-eur');
        var elPct = document.getElementById('pf-total-risk-pct');
        if (elEur) elEur.textContent = F.currency(newTotalRisk);
        if (elPct) elPct.textContent = '(' + F.number(newTotalRiskPct, 1) + ' %)';
      };
    });

    var eqPills = container.querySelectorAll('#pf-eq-pills .pill-btn');
    eqPills.forEach(function(btn) {
      btn.onclick = function() {
        state.chartPeriod = btn.getAttribute('data-period');
        eqPills.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        drawEquityCurve(rows, stocksData, value);
      };
    });

    if (rows.length && stocksData) drawEquityCurve(rows, stocksData, value);
    if (window.App.PortfolioInsights) window.App.PortfolioInsights.render(document.getElementById('pf-insights'), rows.filter(function (r) { return r.v > 0; }), stocksData, value);
  }

  /* ---------- Vergleichsindex für die Equity-Curve ---------- */
  var BENCHES = [
    { t: 'SPYI.DE', label: 'MSCI ACWI' },
    { t: 'EUNL.DE', label: 'MSCI World' },
    { t: 'SXR8.DE', label: 'S&P 500' },
    { t: 'EXS1.DE', label: 'DAX' },
    { t: '', label: 'Kein Vergleich' }
  ];
  var BENCH_KEY = 'app_portfolio_bench_v1';
  var benchCache = {};
  function getBench() { try { var v = localStorage.getItem(BENCH_KEY); return v === null ? 'SPYI.DE' : v; } catch (e) { return 'SPYI.DE'; } }
  function setBench(v) { try { localStorage.setItem(BENCH_KEY, v); } catch (e) {} }

  /** Kursreihe des Vergleichsindex (aus der Datei des ETFs), Promise -> {date: close} oder null. */
  function loadBench(t) {
    if (!t) return Promise.resolve(null);
    if (benchCache[t]) return Promise.resolve(benchCache[t]);
    return window.App.Data.getStock(t).then(function (st) {
      var m = {};
      ((st && st.chartHistory) || []).forEach(function (p) { if (p.close > 0) m[p.date] = p.close; });
      if (st && st.quote && st.quote.price > 0) m[new Date().toISOString().slice(0, 10)] = st.quote.price;
      benchCache[t] = Object.keys(m).length > 5 ? m : null;
      return benchCache[t];
    }).catch(function () { benchCache[t] = null; return null; });
  }

  function drawEquityCurve(rows, stocksData, currentTotalValue) {
    var canvas = document.getElementById('pf-equity-canvas');
    if (!canvas) return;

    var allDates = {};
    stocksData.forEach(function (sd) {
      if (!sd.stock || !sd.stock.chartHistory) return;
      sd.stock.chartHistory.forEach(function (p) { allDates[p.date] = true; });
    });
    var dates = Object.keys(allDates).sort();
    if (dates.length < 2) {
      canvas.parentElement.innerHTML = '<div class="state-box"><p>Zu wenige Kursdaten für Equity-Curve.</p></div>';
      return;
    }

    var priceMap = {};
    stocksData.forEach(function (sd) {
      if (!sd.stock || !sd.stock.chartHistory) return;
      priceMap[sd.ticker] = {};
      sd.stock.chartHistory.forEach(function (p) { priceMap[sd.ticker][p.date] = p.close; });
    });

    var spanDays = { '1W': 7, '1M': 30, '3M': 91, '6M': 182, '1Y': 365 }[state.chartPeriod] || 365;
    var lastDate = dates[dates.length - 1];
    var cutoff = new Date(lastDate + 'T00:00:00Z');
    cutoff.setUTCDate(cutoff.getUTCDate() - spanDays);
    var cutoffStr = cutoff.toISOString().slice(0, 10);
    
    var relevantDates = dates.filter(function(d) { return d >= cutoffStr; });
    if (relevantDates.length < 2) relevantDates = dates.slice(-10);

    var values = [];
    var invested = 0;
    rows.forEach(function (r) { invested += r.inv; });

    var lastKnown = {};
    rows.forEach(function(r) {
      for (var i = 0; i < dates.length; i++) {
        var px = priceMap[r.p.ticker] && priceMap[r.p.ticker][dates[i]];
        if (px) lastKnown[r.p.ticker] = px;
        if (dates[i] >= cutoffStr) break;
      }
    });

    relevantDates.forEach(function (d, index) {
      var total = 0;
      rows.forEach(function (r) {
        var px = priceMap[r.p.ticker] && priceMap[r.p.ticker][d];
        if (px) lastKnown[r.p.ticker] = px;
        var cur = lastKnown[r.p.ticker];
        if (cur) total += cur * r.p.shares;
      });
      
      if (index === relevantDates.length - 1 && currentTotalValue > 0) {
        total = currentTotalValue;
      }
      
      values.push({ date: d, value: total || null });
    });

    var filtered = values.filter(function (v) { return v.value !== null; });
    if (filtered.length < 2) {
      canvas.parentElement.innerHTML = '<div class="state-box"><p>Zu wenige Kursdaten für diesen Zeitraum.</p></div>';
      return;
    }

    var first = filtered[0].value;
    var last = filtered[filtered.length - 1].value;
    var totalReturn = first > 0 ? ((last / first) - 1) * 100 : 0;

    var peak = first, maxDD = 0;
    filtered.forEach(function (v) {
      if (v.value > peak) peak = v.value;
      var dd = peak > 0 ? (v.value / peak - 1) * 100 : 0;
      if (dd < maxDD) maxDD = dd;
    });

    var rets = [];
    for (var i = 1; i < filtered.length; i++) rets.push(filtered[i].value / filtered[i - 1].value - 1);
    var avg = rets.reduce(function (a, b) { return a + b; }, 0) / (rets.length || 1);
    var variance = rets.reduce(function (a, b) { return a + (b - avg) * (b - avg); }, 0) / (rets.length || 1);
    var vol = Math.sqrt(variance) * Math.sqrt(252) * 100;

    var benchT = getBench();
    var bench = benchT ? benchCache[benchT] : null;
    if (benchT && bench === undefined) {
      // Index erst laden, dann neu zeichnen
      loadBench(benchT).then(function () { if (document.body.contains(canvas)) drawEquityCurve(rows, stocksData, currentTotalValue); });
    }
    // Index auf den Startwert des Depots normiert: "hätte ich die heutigen Bestände stattdessen im Index gehabt"
    var benchVals = null, benchReturn = null;
    if (bench) {
      var bd = Object.keys(bench).sort(), bi = 0, lastB = null;
      benchVals = filtered.map(function (v) {
        while (bi < bd.length && bd[bi] <= v.date) { lastB = bench[bd[bi]]; bi++; }
        return lastB;
      });
      var b0 = null;
      for (var k = 0; k < benchVals.length; k++) { if (benchVals[k]) { b0 = benchVals[k]; break; } }
      if (b0) {
        benchVals = benchVals.map(function (x) { return x ? first * x / b0 : null; });
        var bl = benchVals[benchVals.length - 1];
        benchReturn = bl ? (bl / first - 1) * 100 : null;
      } else benchVals = null;
    }
    var benchLabel = (BENCHES.filter(function (b) { return b.t === benchT; })[0] || {}).label || benchT;
    var series = [
      { name: 'Portfolio', color: '#818cf8', values: filtered.map(function (v) { return v.value; }), width: 2 },
      { name: 'Investiert', color: '#10b981', values: filtered.map(function () { return invested; }), width: 1, dash: [4, 4] }
    ];
    if (benchVals) series.push({ name: benchLabel, color: '#f59e0b', values: benchVals, width: 1.5 });
    window.App.Charts.renderMultiLineChart(canvas, {
      labels: filtered.map(function (v) { return v.date.slice(5, 7) + '/' + v.date.slice(2, 4); }),
      series: series,
      formatY: function (v) { return window.App.Format.axisMoney(v); }
    });

    var benchHost = document.getElementById('pf-eq-bench');
    if (benchHost) {
      benchHost.innerHTML = '<span style="font-size:0.72rem;color:var(--text-dim);align-self:center;flex-shrink:0;">Vergleich:</span>' +
        BENCHES.map(function (b) {
          return '<button class="chip-btn ' + (b.t === benchT ? 'active' : '') + '" data-bench="' + b.t + '" style="flex-shrink:0;padding:3px 9px;font-size:0.72rem;">' + b.label + '</button>';
        }).join('');
      benchHost.querySelectorAll('[data-bench]').forEach(function (btn) {
        btn.onclick = function () { setBench(btn.getAttribute('data-bench')); drawEquityCurve(rows, stocksData, currentTotalValue); };
      });
    }

    var statsEl = document.getElementById('pf-eq-stats');
    if (statsEl) {
      var F = window.App.Format;
      statsEl.innerHTML =
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:0.78rem;">' +
          '<div style="text-align:center;padding:8px;background:var(--bg-tertiary);border-radius:var(--radius-sm);">' +
            '<div style="font-size:0.62rem;color:var(--text-dim);text-transform:uppercase;">Rendite</div>' +
            '<div style="font-weight:800;color:' + (totalReturn >= 0 ? 'var(--bullish)' : 'var(--bearish)') + ';">' + (totalReturn >= 0 ? '+' : '') + F.number(totalReturn, 1) + ' %</div></div>' +
          '<div style="text-align:center;padding:8px;background:var(--bg-tertiary);border-radius:var(--radius-sm);">' +
            '<div style="font-size:0.62rem;color:var(--text-dim);text-transform:uppercase;">Max DD</div>' +
            '<div style="font-weight:800;color:var(--bearish);">' + F.number(maxDD, 1) + ' %</div></div>' +
          '<div style="text-align:center;padding:8px;background:var(--bg-tertiary);border-radius:var(--radius-sm);">' +
            '<div style="font-size:0.62rem;color:var(--text-dim);text-transform:uppercase;">Volatilität</div>' +
            '<div style="font-weight:800;">' + F.number(vol, 1) + ' %</div></div>' +
        '</div>' +
        (benchReturn !== null ? '<div style="font-size:0.76rem;color:var(--text-muted);margin-top:8px;line-height:1.5;">' + benchLabel + ' im selben Zeitraum: <b style="color:' + (benchReturn >= 0 ? 'var(--bullish)' : 'var(--bearish)') + ';">' + (benchReturn >= 0 ? '+' : '') + F.number(benchReturn, 1) + ' %</b> · Depot ' +
          (totalReturn - benchReturn >= 0 ? '<b style="color:var(--bullish);">' + F.number(totalReturn - benchReturn, 1) + ' Prozentpunkte besser</b>' : '<b style="color:var(--bearish);">' + F.number(benchReturn - totalReturn, 1) + ' Prozentpunkte schlechter</b>') +
          '<br><span style="color:var(--text-dim);font-size:0.7rem;">Vergleich mit den heutigen Beständen über den ganzen Zeitraum, ohne Käufe/Verkäufe dazwischen.</span></div>' : '');
    }
  }

  return { initView: initView };
})();
/**
 * js/portfolio.js
 * Portfolio-Tracker mit Transaktions-Log (FIFO) und Equity-Curve.
 * NEU: Angepasste Stop-Loss-Berechnung:
 * 1. Ist der aktuelle Kurs >= Kaufpreis: Basis = max(Aktueller Kurs, Peak).
 * 2. Ist der aktuelle Kurs < Kaufpreis: Basis = Kaufpreis.
 * Die Stop-Loss-Schwelle wird immer auf diesen Basispreis angewendet.
 */
window.App = window.App || {};

window.App.Portfolio = (function () {
  'use strict';

  var STOPS_KEY = 'app_portfolio_stops_v1';
  var PEAKS_KEY = 'app_portfolio_peaks_v1';

  // --- Stop-Prozente verwalten ---
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

  // --- Peak (Höchststand) verwalten ---
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

  // NEU: Zentrale Funktion zur Berechnung des Basispreises und Stop-Loss
  function calculateStopLoss(r, stopPct) {
    var basePrice = r.p.buyPrice; // Standardmäßig der Kaufpreis
    var basisLabel = 'Kaufpreis';

    if (r.u.price && r.u.price >= r.p.buyPrice) {
      // Wenn im Plus: Nimm den höheren Wert von aktuellem Kurs und Peak
      var peak = r.peak || 0;
      basePrice = Math.max(r.u.price, peak);
      basisLabel = (basePrice === r.u.price && basePrice !== peak) ? 'Aktuell' : 'Peak';
    } else {
      // Wenn im Minus (oder kein Kurs): Bleib beim Kaufpreis
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
      
      // Peak aktualisieren, wenn aktueller Kurs höher ist
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
    
    // Gesamtrisiko berechnen mit der neuen Logik
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
      (rows.length ? ' <button class="chip-btn" id="pf-export-btn" style="padding: 3px 9px; margin-left: 10px; font-size: 0.72rem;">⬇ CSV</button>' : '') +
      '</div></div>';

    if (rows.length) {
      var totalPl = value - invested;
      var totalPlPct = invested ? (totalPl / invested) * 100 : null;
      
      // Risikomanagement-Karte
      html += '<div class="card" style="padding: 14px 16px; margin-bottom: 14px; background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.02) 100%); border-color: rgba(239, 68, 68, 0.3);">' +
        '<div class="card-header-dotted" style="border-bottom-color: rgba(239, 68, 68, 0.2); margin-bottom: 10px;">' +
          '<span class="card-title" style="color: var(--bearish);">Gesamtrisiko (Stop-Loss)</span>' +
        '</div>' +
        '<div style="display: flex; justify-content: space-between; align-items: flex-end;">' +
          '<div>' +
            '<div style="font-size: 0.72rem; color: var(--text-dim);">Noch möglicher Verlust</div>' +
            '<div id="pf-total-risk-eur" style="font-weight: 800; font-size: 1.3rem; color: var(--bearish);">' + F.currency(totalRiskEur) + '</div>' +
          '</div>' +
          '<div id="pf-total-risk-pct" style="font-weight: 700; font-size: 0.9rem; color: var(--bearish);">' + F.number(totalRiskPct, 1) + ' %</div>' +
        '</div>' +
        '<div style="font-size: 0.7rem; color: var(--text-dim); margin-top: 8px; line-height: 1.4;">' +
          'Die Stop-Loss-Berechnung nutzt den Höchststand (Trailing) oder den Kaufpreis (bei Kursverlusten).</div>' +
      '</div>';

      html += '<div class="card" style="padding: 14px 16px; margin-bottom: 14px;">' +
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">' +
          '<div><div style="font-size: 0.7rem; color: var(--text-dim);">Investiert</div><div style="font-weight: 800;">' + F.currency(invested) + '</div></div>' +
          '<div><div style="font-size: 0.7rem; color: var(--text-dim);">Aktueller Wert</div><div style="font-weight: 800;">' + F.currency(value) + '</div></div>' +
          '<div><div style="font-size: 0.7rem; color: var(--text-dim);">Gewinn/Verlust</div>' +
            '<div class="badge-pill ' + F.changeClass(totalPl) + '" style="display: inline-block;">' + (totalPl >= 0 ? '+' : '') + F.currency(totalPl) + ' (' + F.percent(totalPlPct, true, 2) + ')</div></div>' +
          '<div><div style="font-size: 0.7rem; color: var(--text-dim);">Positionen</div><div style="font-weight: 800;">' + rows.length + '</div></div>' +
        '</div></div>';

      // Equity-Curve
      html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Equity-Curve</span><span class="period-tag" id="pf-eq-period-tag">1J</span></div>' +
        '<div style="height: 220px; width: 100%; position: relative;"><canvas id="pf-equity-canvas" class="chart-canvas"></canvas></div>' +
        '<div class="chart-legend">' +
          '<div class="legend-item"><span class="legend-dot" style="background:#818cf8;"></span><span>Portfoliowert</span></div>' +
          '<div class="legend-item"><span class="legend-dot" style="background:#10b981;"></span><span>Investiert</span></div>' +
        '</div>' +
        '<div id="pf-eq-stats" style="margin-top:12px;"></div>' +
        '</div>';
    }

    // Transaktionen-Formular
    var datalist = universe.slice(0, 200).map(function (u) {
      return '<option value="' + esc(u.ticker) + '">' + esc(u.name) + '</option>';
    }).join('');

    html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Transaktion hinzufügen</span></div>' +
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
        '<div style="width: 100%; margin-top: 4px;"><button class="chip-btn active" id="pf-add-btn" style="width: 100%; height: 38px; justify-content: center;">+ Transaktion speichern</button></div>' +
      '</div></div>';

    // Positionen
    if (!rows.length) {
      html += '<div class="state-box"><div style="font-weight: 600; color: var(--text-muted);">Noch keine Positionen</div>' +
        '<div style="font-size: 0.8rem;">Füge oben deine erste Transaktion hinzu.</div></div>';
    } else {
      rows.forEach(function (r) {
        var weight = (r.v !== null && value) ? (r.v / value) * 100 : null;
        var stopPct = getStopPct(r.p.ticker);
        
        // Stop-Loss mit neuer Logik berechnen
        var sl = calculateStopLoss(r, stopPct);
        var stopPrice = sl.stopPrice;
        var isStopBreached = r.u.price && stopPrice && r.u.price <= stopPrice;
        var posRisk = (r.u.price && stopPrice && r.u.price > stopPrice) ? (r.u.price - stopPrice) * r.p.shares : 0;

        // Tagesperformance (Tag)
        var dailyPct = r.dailyChangePct;
        var dailySign = (dailyPct > 0) ? '+' : '';
        var dailyColor = (dailyPct > 0) ? 'var(--bullish)' : (dailyPct < 0 ? 'var(--bearish)' : 'var(--text-muted)');
        var dailyText = (dailyPct !== null && dailyPct !== undefined) ? dailySign + F.number(dailyPct, 2) + ' %' : '—';

        // Seit Kauf (Gesamt)
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
          
          // Stop-Loss-Bereich (Neu mit Basis-Anzeige)
          '<div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border-subtle);">' +
            '<div style="display: flex; flex-direction: column; gap: 4px;">' +
              '<div style="display: flex; align-items: center; gap: 6px;">' +
                '<span style="font-size: 0.72rem; color: var(--text-dim);">Stop:</span>' +
                '<div style="display: flex; align-items: center; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 2px 6px;">' +
                  '<input type="number" class="pf-stop-input" data-ticker="' + esc(r.p.ticker) + '" value="' + stopPct + '" min="1" max="99" style="width: 35px; background: transparent; border: none; color: var(--text-main); font-size: 0.75rem; text-align: right; outline: none;">' +
                  '<span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 2px;">%</span>' +
                '</div>' +
              '</div>' +
              // Zeigt an, worauf sich der Stop bezieht
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

    // Transaktions-Log
    var txs = (window.App.Transactions ? window.App.Transactions.getAll() : []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    if (txs.length) {
      html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Transaktions-Log</span><span class="sector-label">' + txs.length + ' Einträge</span></div>';
      html += '<div class="table-responsive-wrapper"><table class="data-table"><thead><tr><th>Datum</th><th>Ticker</th><th>Typ</th><th style="text-align:right;">Stück</th><th style="text-align:right;">Kurs</th><th></th></tr></thead><tbody>';
      txs.slice(0, 50).forEach(function (tx) {
        var typeCls = tx.type === 'buy' ? 'badge-bullish' : 'badge-bearish';
        html += '<tr><td>' + F.date(tx.date) + '</td>' +
          '<td><strong>' + esc(tx.ticker) + '</strong></td>' +
          '<td><span class="badge-pill ' + typeCls + '">' + (tx.type === 'buy' ? 'Kauf' : 'Verkauf') + '</span></td>' +
          '<td style="text-align:right;">' + F.number(tx.shares, 2) + '</td>' +
          '<td style="text-align:right;">' + F.currency(tx.price) + '</td>' +
          '<td><button class="chip-btn pf-tx-del" data-id="' + esc(tx.id) + '" style="padding:2px 6px;font-size:0.7rem;">🗑</button></td></tr>';
      });
      html += '</tbody></table></div>';
      if (txs.length > 50) html += '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:6px;">Die letzten 50 von ' + txs.length + ' Transaktionen.</div>';
      html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;

    // Events
    var dateInput = document.getElementById('pf-in-date');
    if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);

    document.getElementById('pf-add-btn').onclick = function () {
      var t = (document.getElementById('pf-in-ticker').value || '').trim().toUpperCase();
      var type = document.getElementById('pf-in-type').value;
      var sh = parseFloat(document.getElementById('pf-in-shares').value);
      var bp = parseFloat(document.getElementById('pf-in-price').value);
      var dt = document.getElementById('pf-in-date').value || new Date().toISOString().slice(0, 10);
      if (!t || !(sh > 0) || !(bp > 0)) { alert('Bitte Ticker, Stückzahl und Kurs ausfüllen.'); return; }
      window.App.Transactions.add({ ticker: t, type: type, shares: sh, price: bp, date: dt });
      initView();
    };

    container.querySelectorAll('.pf-tx-del').forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm('Transaktion löschen?')) return;
        window.App.Transactions.remove(btn.getAttribute('data-id'));
        initView();
      };
    });

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

    // Event-Listener für die Stop-Loss-Inputs (Live-Update)
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
        
        // Gesamtrisiko neu berechnen
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
        if (elPct) elPct.textContent = F.number(newTotalRiskPct, 1) + ' %';
      };
    });

    if (rows.length && stocksData) drawEquityCurve(rows, stocksData);
  }

  function drawEquityCurve(rows, stocksData) {
    var canvas = document.getElementById('pf-equity-canvas');
    if (!canvas) return;

    var allDates = {};
    stocksData.forEach(function (sd) {
      if (!sd.stock || !sd.stock.chartHistory) return;
      sd.stock.chartHistory.forEach(function (p) { allDates[p.date] = true; });
    });
    var dates = Object.keys(allDates).sort();
    if (dates.length < 5) {
      canvas.parentElement.innerHTML = '<div class="state-box"><p>Zu wenige Kursdaten für Equity-Curve.</p></div>';
      return;
    }

    var priceMap = {};
    stocksData.forEach(function (sd) {
      if (!sd.stock || !sd.stock.chartHistory) return;
      priceMap[sd.ticker] = {};
      sd.stock.chartHistory.forEach(function (p) { priceMap[sd.ticker][p.date] = p.close; });
    });

    var cutoff = dates[dates.length - 1];
    var startIdx = Math.max(0, dates.length - 260);
    var relevantDates = dates.slice(startIdx);

    var values = [];
    var invested = 0;
    rows.forEach(function (r) { invested += r.inv; });

    var lastKnown = {};
    relevantDates.forEach(function (d) {
      var total = 0;
      rows.forEach(function (r) {
        var px = priceMap[r.p.ticker] && priceMap[r.p.ticker][d];
        if (px) lastKnown[r.p.ticker] = px;
        var cur = lastKnown[r.p.ticker];
        if (cur) total += cur * r.p.shares;
      });
      values.push({ date: d, value: total || null });
    });

    var filtered = values.filter(function (v) { return v.value !== null; });
    if (filtered.length < 2) {
      canvas.parentElement.innerHTML = '<div class="state-box"><p>Zu wenige Kursdaten für Equity-Curve.</p></div>';
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

    window.App.Charts.renderMultiLineChart(canvas, {
      labels: filtered.map(function (v) { return v.date.slice(5, 7) + '/' + v.date.slice(2, 4); }),
      series: [
        { name: 'Portfolio', color: '#818cf8', values: filtered.map(function (v) { return v.value; }), width: 2 },
        { name: 'Investiert', color: '#10b981', values: filtered.map(function () { return invested; }), width: 1, dash: [4, 4] }
      ],
      formatY: function (v) { return window.App.Format.axisMoney(v); }
    });

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
        '</div>';
    }
  }

  return { initView: initView };
})();
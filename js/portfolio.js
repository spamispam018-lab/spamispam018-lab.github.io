/**
 * js/portfolio.js[span_0](start_span)[span_0](end_span)
 * Portfolio-Tracker: Bestände (Ticker, Stück, Kaufkurs) in localStorage.
 * Zeigt Gesamtwert, Gewinn/Verlust, Gewichtung und ermöglicht CSV-Export.
 */
window.App = window.App || {};

window.App.Portfolio = (function () {
  'use strict';

  var STORAGE_KEY = 'app_portfolio_v1';

  function getHoldings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveHoldings(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;
    var headerFilterBtn = document.getElementById('btn-header-filter');
    if (headerFilterBtn) headerFilterBtn.style.display = 'none';

    var holdings = getHoldings();

    window.App.Data.getUniverse()
      .then(function (universe) {
        var map = {};
        universe.forEach(function (u) { map[u.ticker] = u; });

        // Fehlende Ticker einzeln nachladen (best effort)
        var missing = holdings.filter(function (h) { return !map[h.ticker]; });
        return Promise.all(missing.map(function (h) {
          return window.App.Data.getStock(h.ticker)
            .then(function (st) {
              map[h.ticker] = {
                ticker: h.ticker,
                name: (st.profile && st.profile.name) || h.ticker,
                price: st.quote && st.quote.price,
                changePercent: st.quote && st.quote.changePercent
              };
            })
            .catch(function () {
              map[h.ticker] = { ticker: h.ticker, name: h.ticker, price: null };
            });
        })).then(function () { render(container, holdings, map, universe); });
      })
      .catch(function (err) {
        container.innerHTML = '<div class="view-container"><div class="state-box"><p>Fehler: ' + err.message + '</p></div></div>';
      });
  }

  function render(container, holdings, map, universe) {
    var F = window.App.Format;
    var invested = 0, value = 0;
    var rows = holdings.map(function (h) {
      var u = map[h.ticker] || { price: null, name: h.ticker };
      var px = u.price;
      var v = (px !== null && px !== undefined) ? px * h.shares : null;
      var inv = h.buyPrice * h.shares;
      var pl = (v !== null) ? v - inv : null;
      var plPct = (v !== null && inv) ? (pl / inv) * 100 : null;
      if (v !== null) { invested += inv; value += v; }
      return { h: h, u: u, v: v, inv: inv, pl: pl, plPct: plPct };
    });
    var totalValue = value;

    var html = '' +
      '<div class="view-container">' +
        '<div style="margin-bottom: 16px;">' +
          '<h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">Mein Portfolio</h2>' +
          '<div style="font-size: 0.78rem; color: var(--text-dim);">' + rows.length + ' Positionen' +
            (rows.length ? ' <button class="chip-btn" id="pf-export-btn" style="padding: 3px 9px; margin-left: 10px; font-size: 0.72rem;">⬇ CSV</button>' : '') +
          '</div>' +
        '</div>';

    // Zusammenfassung
    if (rows.length) {
      var totalPl = value - invested;
      var totalPlPct = invested ? (totalPl / invested) * 100 : null;
      html += '' +
        '<div class="card" style="padding: 14px 16px; margin-bottom: 14px;">' +
          '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">' +
            '<div><div style="font-size: 0.7rem; color: var(--text-dim);">Investiert</div>' +
              '<div style="font-weight: 800;">' + F.currency(invested) + '</div></div>' +
            '<div><div style="font-size: 0.7rem; color: var(--text-dim);">Aktueller Wert</div>' +
              '<div style="font-weight: 800;">' + F.currency(value) + '</div></div>' +
            '<div><div style="font-size: 0.7rem; color: var(--text-dim);">Gewinn/Verlust</div>' +
              '<div class="badge-pill ' + F.changeClass(totalPl) + '" style="display: inline-block;">' +
                (totalPl >= 0 ? '+' : '') + F.currency(totalPl) + ' (' + F.percent(totalPlPct, true, 2) + ')</div></div>' +
            '<div><div style="font-size: 0.7rem; color: var(--text-dim);">Positionen</div>' +
              '<div style="font-weight: 800;">' + rows.length + '</div></div>' +
          '</div>' +
        '</div>';
    }

    // Hinzufügen- & Bearbeiten-Formular
    var datalist = universe.map(function (u) {
      return '<option value="' + esc(u.ticker) + '">' + esc(u.name) + '</option>';
    }).join('');
    
    html += '' +
      '<div class="card" id="pf-form-card" style="padding: 14px 16px; margin-bottom: 14px;">' +
        '<div class="card-header-dotted"><span class="card-title" id="pf-form-title">Position hinzufügen</span></div>' +
        '<div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: end;">' +
          '<div style="flex: 1 1 100px;"><label style="font-size: 0.7rem; color: var(--text-dim);">Ticker</label>' +
            '<input id="pf-in-ticker" class="search-input" style="width: 100%;" list="pf-tickers" placeholder="AAPL" autocomplete="off">' +
            '<datalist id="pf-tickers">' + datalist + '</datalist></div>' +
          '<div style="flex: 1 1 80px;"><label style="font-size: 0.7rem; color: var(--text-dim);">Stück</label>' +
            '<input id="pf-in-shares" class="search-input" style="width: 100%;" type="number" min="0" step="any" placeholder="10"></div>' +
          '<div style="flex: 1 1 80px;"><label style="font-size: 0.7rem; color: var(--text-dim);">Kaufkurs (€)</label>' +
            '<input id="pf-in-price" class="search-input" style="width: 100%;" type="number" min="0" step="any" placeholder="150,00"></div>' +
          '<div style="display: flex; gap: 8px; width: 100%; margin-top: 4px;">' +
            '<button class="chip-btn active" id="pf-add-btn" style="flex: 1; height: 38px;">+ Add</button>' +
            '<button class="chip-btn" id="pf-cancel-btn" style="flex: 1; height: 38px; display: none;">Abbrechen</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Positionen
    if (!rows.length) {
      html += '<div class="state-box"><div style="font-weight: 600; color: var(--text-muted);">Noch keine Positionen</div>' +
        '<div style="font-size: 0.8rem;">Füge oben deine ersten Bestände hinzu.</div></div>';
    } else {
      rows.forEach(function (r) {
        var weight = (r.v !== null && totalValue) ? (r.v / totalValue) * 100 : null;
        html += '' +
          '<div class="card" style="padding: 12px 14px; margin-bottom: 10px;" data-pf-ticker="' + esc(r.h.ticker) + '">' +
            '<div style="display: flex; justify-content: space-between; align-items: flex-start;">' +
              '<div style="cursor: pointer;" class="pf-goto-detail">' +
                '<div style="font-weight: 700;">' + esc(r.u.name || r.h.ticker) + '</div>' +
                '<div style="font-size: 0.72rem; color: var(--text-dim);">' + esc(r.h.ticker) +
                  ' · ' + F.number(r.h.shares, 4) + ' Stk. à ' + F.currency(r.h.buyPrice) + '</div>' +
              '</div>' +
              '<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">' +
                '<div style="font-weight: 800; font-variant-numeric: tabular-nums;">' + F.currency(r.v) + '</div>' +
                '<div class="badge-pill ' + F.changeClass(r.pl) + '" style="font-size: 0.68rem;">' +
                  (r.pl === null ? '—' : (r.pl >= 0 ? '+' : '') + F.currency(r.pl)) + '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">' +
              '<div style="flex: 1; margin-right: 10px;">' +
                '<div style="height: 5px; background: var(--border-subtle); border-radius: 3px; overflow: hidden;">' +
                  '<div style="height: 100%; width: ' + (weight || 0).toFixed(1) + '%; background: var(--accent-purple-light, #818cf8);"></div>' +
                '</div>' +
              '</div>' +
              '<div style="font-size: 0.72rem; color: var(--text-dim); white-space: nowrap;">' +
                (weight !== null ? F.number(weight, 1) + ' %' : '—') +
                ' · Kurs ' + F.currency(r.u.price) +
                ' · P/L ' + (r.plPct === null ? '—' : F.percent(r.plPct, true, 2)) +
                ' <button class="chip-btn pf-edit-btn" style="padding: 2px 7px; font-size: 0.68rem;" data-ticker="' + esc(r.h.ticker) + '">✏️</button>' +
                ' <button class="chip-btn pf-del-btn" style="padding: 2px 7px; font-size: 0.68rem;" data-ticker="' + esc(r.h.ticker) + '">🗑</button>' +
              '</div>' +
            '</div>' +
          '</div>';
      });
    }

    html += '</div>';
    container.innerHTML = html;

    document.getElementById('pf-add-btn').onclick = function () {
      var t = (document.getElementById('pf-in-ticker').value || '').trim().toUpperCase();
      var sh = parseFloat(document.getElementById('pf-in-shares').value);
      var bp = parseFloat(document.getElementById('pf-in-price').value);
      if (!t || !(sh > 0) || !(bp > 0)) { alert('Bitte Ticker, Stückzahl und Kaufkurs ausfüllen.'); return; }
      
      var list = getHoldings();
      var existing = list.filter(function (x) { return x.ticker === t; })[0];
      var mode = this.getAttribute('data-mode');

      if (mode === 'edit') {
        if (existing) {
          existing.shares = sh;
          existing.buyPrice = bp;
        }
      } else {
        if (existing) {
          // Bestand erweitern (Durchschnittskurs beibehalten)
          existing.shares += sh;
        } else {
          list.push({ ticker: t, shares: sh, buyPrice: bp });
        }
      }
      
      saveHoldings(list);
      initView();
    };

    var cancelBtn = document.getElementById('pf-cancel-btn');
    if (cancelBtn) {
      cancelBtn.onclick = function () {
        document.getElementById('pf-in-ticker').value = '';
        document.getElementById('pf-in-ticker').disabled = false;
        document.getElementById('pf-in-shares').value = '';
        document.getElementById('pf-in-price').value = '';
        document.getElementById('pf-form-title').innerText = 'Position hinzufügen';
        document.getElementById('pf-add-btn').innerText = '+ Add';
        document.getElementById('pf-add-btn').removeAttribute('data-mode');
        this.style.display = 'none';
      };
    }

    var exportBtn = document.getElementById('pf-export-btn');
    if (exportBtn) {
      exportBtn.onclick = function () {
        window.App.Export.downloadCsv('portfolio.csv', [
          { label: 'Ticker', get: function (r) { return r.h.ticker; } },
          { label: 'Name', get: function (r) { return r.u.name; } },
          { label: 'Stück', get: function (r) { return r.h.shares; } },
          { label: 'Kaufkurs', get: function (r) { return r.h.buyPrice; } },
          { label: 'Kurs aktuell', get: function (r) { return r.u.price; } },
          { label: 'Investiert', get: function (r) { return r.inv; } },
          { label: 'Wert', get: function (r) { return r.v; } },
          { label: 'Gewicht %', get: function (r) {
              return (r.v !== null && totalValue) ? (r.v / totalValue) * 100 : null; } },
          { label: 'P/L', get: function (r) { return r.pl; } },
          { label: 'P/L %', get: function (r) { return r.plPct; } }
        ], rows);
      };
    }

    container.querySelectorAll('.pf-del-btn').forEach(function (btn) {
      btn.onclick = function () {
        var t = btn.getAttribute('data-ticker');
        if (!confirm('Position ' + t + ' wirklich entfernen?')) return;
        saveHoldings(getHoldings().filter(function (x) { return x.ticker !== t; }));
        initView();
      };
    });

    container.querySelectorAll('.pf-edit-btn').forEach(function (btn) {
      btn.onclick = function () {
        var t = btn.getAttribute('data-ticker');
        var h = getHoldings().filter(function (x) { return x.ticker === t; })[0];
        if (!h) return;
        
        // Werte in das Formular eintragen
        document.getElementById('pf-in-ticker').value = h.ticker;
        document.getElementById('pf-in-ticker').disabled = true; // Ticker sperren, damit kein neuer Wert entsteht
        document.getElementById('pf-in-shares').value = h.shares;
        document.getElementById('pf-in-price').value = h.buyPrice;
        
        // UI auf "Bearbeiten" umstellen
        document.getElementById('pf-form-title').innerText = 'Position bearbeiten: ' + h.ticker;
        var addBtn = document.getElementById('pf-add-btn');
        addBtn.innerText = '✓ Aktualisieren';
        addBtn.setAttribute('data-mode', 'edit');
        document.getElementById('pf-cancel-btn').style.display = 'block';
        
        // Zum Formular hochscrollen (wichtig am Smartphone)
        document.getElementById('pf-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });

    container.querySelectorAll('.pf-goto-detail').forEach(function (el) {
      el.onclick = function () {
        var t = el.closest('[data-pf-ticker]').getAttribute('data-pf-ticker');
        window.App.Router.navigate('/stock/' + t + '/overview');
      };
    });
  }

  return { initView: initView, getHoldings: getHoldings };
})();

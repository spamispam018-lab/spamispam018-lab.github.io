/**
 * js/dividends.js
 * Dividenden-Kalender für Watchlist + Portfolio.
 * Nutzt Daten aus stock.dividends, stock.exDividendDate und stock.ratios.dividendYield.
 */
window.App = window.App || {};
window.App.Dividends = (function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;
    var headerFilterBtn = document.getElementById('btn-header-filter');
    if (headerFilterBtn) headerFilterBtn.style.display = 'none';

    container.innerHTML = '<div class="view-container"><div class="state-box"><div class="spinner"></div><p>Lade Dividenden-Daten...</p></div></div>';

    var tickers = window.App.Data.getWatchlist();
    // Portfolio-Ticker ergänzen
    try {
      if (window.App.Transactions) {
        var positions = window.App.Transactions.computePositions();
        Object.keys(positions).forEach(function (t) {
          if (tickers.indexOf(t) === -1) tickers.push(t);
        });
      }
    } catch (e) {}

    if (!tickers.length) {
      container.innerHTML = '<div class="view-container"><div class="state-box"><p>Watchlist und Portfolio sind leer.</p></div></div>';
      return;
    }

    Promise.all(tickers.map(function (t) {
      return window.App.Data.getStock(t).then(function (st) { return { ticker: t, stock: st }; }).catch(function () { return { ticker: t, stock: null }; });
    })).then(function (results) {
      var items = [];
      results.forEach(function (r) {
        if (!r.stock) return;
        var ratios = r.stock.ratios || {};
        var quote = r.stock.quote || {};
        var divInfo = r.stock.dividends || {};
        items.push({
          ticker: r.ticker,
          name: (r.stock.profile && r.stock.profile.name) || r.ticker,
          price: quote.price,
          currency: quote.currency || 'EUR',
          dividendYield: ratios.dividendYield,
          exDate: r.stock.exDividendDate || divInfo.exDate || null,
          upcoming: divInfo.upcoming || null,
          history: divInfo.history || [],
          rate: divInfo.rate || null,
          isEtf: !!(window.App.EtfHoldings && window.App.EtfHoldings.isEtf(r.stock))
        });
      });

      items.sort(function (a, b) {
        if (a.exDate && b.exDate) return a.exDate < b.exDate ? -1 : 1;
        if (a.exDate) return -1;
        if (b.exDate) return 1;
        return a.ticker.localeCompare(b.ticker);
      });

      var html = '<div class="view-container">';
      html += '<div style="margin-bottom:16px;"><h2 style="font-size:1.25rem;font-weight:700;margin-bottom:4px;">Dividenden-Kalender</h2>';
      html += '<div style="font-size:0.78rem;color:var(--text-dim);">' + items.length + ' Werte aus Watchlist &amp; Portfolio</div></div>';

      html += forecastHtml(items);

      // Yield on Cost
      if (window.App.Transactions) {
        try {
          var positions = window.App.Transactions.computePositions();
          var portfolioItems = items.filter(function (it) { return positions[it.ticker]; });
          if (portfolioItems.length) {
            html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Yield on Cost (Portfolio)</span></div>';
            portfolioItems.forEach(function (it) {
              var pos = positions[it.ticker];
              var yld = Number(it.dividendYield) || 0;
              if (!yld || !pos.buyPrice) return;
              // Dividende je Aktie (aus aktueller Rendite und aktuellem Kurs), bezogen auf den eigenen Kaufkurs
              var annualDiv = it.price > 0 ? it.price * (yld / 100) : pos.buyPrice * (yld / 100);
              var yoc = annualDiv / pos.buyPrice * 100;
              html += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-subtle);font-size:0.82rem;">';
              html += '<div><strong>' + esc(it.ticker) + '</strong> <span style="color:var(--text-dim);font-size:0.75rem;">' + esc(it.name) + '</span>' +
                '<div style="font-size:0.7rem;color:var(--text-dim);">aktuelle Rendite ' + window.App.Format.number(yld, 2) + ' %</div></div>';
              html += '<div style="text-align:right;"><strong style="color:var(--bullish);">' + window.App.Format.number(yoc, 2) + ' %</strong>';
              html += '<div style="font-size:0.7rem;color:var(--text-dim);">≈ ' + window.App.Format.currency(annualDiv * pos.shares, it.currency) + '/Jahr</div></div></div>';
            });
            html += '</div>';
          }
        } catch (e) {}
      }

      // Termine
      var withDate = items.filter(function (it) { return it.exDate; });
      if (withDate.length) {
        html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Nächste Ex-Dividende-Termine</span></div>';
        withDate.forEach(function (it) {
          var days = Math.round((new Date(it.exDate + 'T00:00:00') - Date.now()) / 86400000);
          var dayStr = days < 0 ? 'kürzlich' : (days === 0 ? 'heute' : (days === 1 ? 'morgen' : 'in ' + days + ' Tagen'));
          html += '<div class="card" style="padding:10px 14px;margin-bottom:8px;">';
          html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">';
          html += '<div style="min-width:0;flex:1;"><strong>' + esc(it.ticker) + '</strong> <span style="color:var(--text-dim);font-size:0.75rem;">' + esc(it.name) + '</span>';
          html += '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:2px;">Ex-Datum: ' + window.App.Format.date(it.exDate) + '</div></div>';
          html += '<div style="text-align:right;flex-shrink:0;"><div style="font-weight:700;color:var(--bullish);">' + window.App.Format.number(it.dividendYield, 2) + ' %</div>';
          html += '<div style="font-size:0.7rem;color:var(--text-dim);">' + dayStr + '</div></div></div></div>';
        });
        html += '</div>';
      }

      var withoutDate = items.filter(function (it) { return !it.exDate && it.dividendYield > 0; });
      if (withoutDate.length) {
        html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Zahler ohne Termin</span></div>';
        withoutDate.forEach(function (it) {
          html += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-subtle);font-size:0.82rem;">';
          html += '<strong>' + esc(it.ticker) + '</strong>';
          html += '<span style="color:var(--bullish);font-weight:700;">' + window.App.Format.number(it.dividendYield, 2) + ' %</span></div>';
        });
        html += '</div>';
      }

      if (!withDate.length && !withoutDate.length) {
        html += '<div class="state-box"><p>Keine Dividenden-Daten für Watchlist/Portfolio verfügbar. Bitte die Pipeline aktualisieren.</p></div>';
      }

      html += '</div>';
      container.innerHTML = html;
      bindForecast(container);
    });
  }

  /* ---------- Vorschau der nächsten 12 Monate + Sparer-Pauschbetrag ---------- */
  var ALLOW_KEY = 'app_div_allowance_v1';
  var TAX = 0.26375;              // Abgeltungsteuer 25 % + Soli 5,5 % (ohne Kirchensteuer)
  var ETF_TAXABLE = 0.7;          // Aktien-ETFs: 30 % Teilfreistellung
  function getAllowance() { try { return Number(localStorage.getItem(ALLOW_KEY)) || 1000; } catch (e) { return 1000; } }

  /** Zahlungen der letzten 12 Monate je Aktie ein Jahr weitergeschrieben (gleicher Monat, gleicher Betrag). */
  function projectPayments(items, positions) {
    var now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), 1);
    var months = [];
    for (var i = 0; i < 12; i++) months.push({ d: new Date(start.getFullYear(), start.getMonth() + i, 1), sum: 0, taxable: 0, items: [] });
    var noHistory = [];
    items.forEach(function (it) {
      var pos = positions[it.ticker];
      if (!pos || !(pos.shares > 0)) return;
      var yearAgo = new Date(now); yearAgo.setFullYear(now.getFullYear() - 1);
      var last12 = (it.history || []).filter(function (h) { return h.amount > 0 && new Date(h.date) > yearAgo; });
      if (!last12.length) {
        var annual = it.rate || (it.price > 0 && it.dividendYield > 0 ? it.price * it.dividendYield / 100 : 0);
        if (annual > 0) noHistory.push({ it: it, amount: annual * pos.shares });
        return;
      }
      last12.forEach(function (h) {
        var d = new Date(h.date); d.setFullYear(d.getFullYear() + 1);
        var idx = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth();
        if (idx < 0) idx = 0;
        if (idx > 11) return;
        var amt = h.amount * pos.shares;
        months[idx].sum += amt;
        months[idx].taxable += amt * (it.isEtf ? ETF_TAXABLE : 1);
        months[idx].items.push({ t: it.ticker, a: amt });
      });
    });
    return { months: months, noHistory: noHistory };
  }

  function forecastHtml(items) {
    if (!window.App.Transactions) return '';
    var positions;
    try { positions = window.App.Transactions.computePositions(); } catch (e) { return ''; }
    if (!Object.keys(positions).length) return '';
    var F = window.App.Format;
    var p = projectPayments(items, positions);
    var extra = p.noHistory.reduce(function (a, x) { return a + x.amount; }, 0);
    var extraTaxable = p.noHistory.reduce(function (a, x) { return a + x.amount * (x.it.isEtf ? ETF_TAXABLE : 1); }, 0);
    var total = p.months.reduce(function (a, m) { return a + m.sum; }, 0) + extra;
    var taxable = p.months.reduce(function (a, m) { return a + m.taxable; }, 0) + extraTaxable;
    if (!(total > 0)) return '';
    var allow = getAllowance();
    var used = Math.min(taxable, allow);
    var tax = Math.max(0, taxable - allow) * TAX;
    var max = Math.max.apply(null, p.months.map(function (m) { return m.sum; }).concat([1]));

    var html = '<div class="card"><div class="card-header-dotted"><span class="card-title">Dividenden nächste 12 Monate</span>' +
      '<span class="period-tag">≈ ' + F.currency(total, 'EUR') + '</span></div>';
    html += '<div style="display:flex;align-items:flex-end;gap:4px;height:110px;margin:6px 0 4px;">' + p.months.map(function (m) {
      var h = m.sum > 0 ? Math.max(4, m.sum / max * 100) : 0;
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;" title="' +
        esc(m.items.map(function (x) { return x.t + ' ' + F.number(x.a, 2) + ' €'; }).join(', ')) + '">' +
        (m.sum > 0 ? '<div style="font-size:0.58rem;color:var(--text-dim);margin-bottom:2px;">' + F.number(m.sum, 0) + '</div>' : '') +
        '<div style="width:100%;height:' + h + '%;background:#10b981;border-radius:3px 3px 0 0;opacity:' + (m.sum > 0 ? 1 : 0) + ';"></div></div>';
    }).join('') + '</div>';
    html += '<div style="display:flex;gap:4px;">' + p.months.map(function (m) {
      return '<div style="flex:1;text-align:center;font-size:0.6rem;color:var(--text-dim);">' + m.d.toLocaleDateString('de-DE', { month: 'narrow' }) + '</div>';
    }).join('') + '</div>';
    if (extra > 0) html += '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:6px;">Dazu ≈ ' + F.currency(extra, 'EUR') + ' ohne bekannte Termine (' + esc(p.noHistory.map(function (x) { return x.it.ticker; }).join(', ')) + ').</div>';

    var pct = Math.min(100, used / allow * 100);
    html += '<div style="margin-top:14px;font-size:0.8rem;">' +
      '<div style="display:flex;justify-content:space-between;"><span>Sparer-Pauschbetrag</span><span><b>' + F.currency(used, 'EUR') + '</b> von ' +
        '<button class="chip-btn" id="div-allow" style="padding:1px 8px;font-size:0.72rem;">' + F.currency(allow, 'EUR') + '</button></span></div>' +
      '<div style="height:8px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden;margin-top:6px;"><div style="height:100%;width:' + pct.toFixed(1) + '%;background:' + (pct >= 100 ? '#f59e0b' : '#10b981') + ';"></div></div>' +
      '<div style="font-size:0.74rem;color:var(--text-muted);margin-top:6px;line-height:1.5;">' +
        (tax > 0 ? 'Über dem Pauschbetrag: ≈ ' + F.currency(taxable - allow, 'EUR') + ' steuerpflichtig, ≈ ' + F.currency(tax, 'EUR') + ' Steuer (26,375 %, ohne Kirchensteuer).'
          : 'Noch ≈ ' + F.currency(allow - used, 'EUR') + ' frei – z. B. für Kursgewinne aus Verkäufen.') + '</div>' +
      '<div style="font-size:0.68rem;color:var(--text-dim);margin-top:6px;line-height:1.45;">Fortschreibung der Zahlungen der letzten 12 Monate mit heutigen Stückzahlen. Aktien-ETFs zählen zu 70 % (Teilfreistellung). ' +
        'Nicht enthalten: ausländische Quellensteuer, Vorabpauschale thesaurierender ETFs, Kursgewinne. Keine Steuerberatung.</div></div>';
    return html + '</div>';
  }

  function bindForecast(container) {
    var b = container.querySelector('#div-allow');
    if (!b) return;
    b.onclick = function () {
      var next = getAllowance() === 1000 ? 2000 : 1000;   // einzeln / zusammen veranlagt
      try { localStorage.setItem(ALLOW_KEY, String(next)); } catch (e) {}
      if (window.App.UI && window.App.UI.toast) window.App.UI.toast(next === 2000 ? 'Pauschbetrag für Ehepaare (2.000 €)' : 'Pauschbetrag einzeln (1.000 €)');
      initView();
    };
  }

  return { initView: initView };
})();
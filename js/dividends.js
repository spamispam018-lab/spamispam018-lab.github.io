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
          history: divInfo.history || []
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
              var annualDiv = pos.buyPrice * (yld / 100);
              html += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-subtle);font-size:0.82rem;">';
              html += '<div><strong>' + esc(it.ticker) + '</strong> <span style="color:var(--text-dim);font-size:0.75rem;">' + esc(it.name) + '</span></div>';
              html += '<div style="text-align:right;"><strong style="color:var(--bullish);">' + window.App.Format.number(yld, 2) + ' %</strong>';
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
    });
  }

  return { initView: initView };
})();
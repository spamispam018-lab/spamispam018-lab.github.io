/**
 * js/strategies.js
 * Vordefinierte Anlagestrategien (Value, Growth, Dividende).
 */
window.App = window.App || {};

window.App.Strategies = (function () {
  'use strict';

  var currentStrategy = 'value';
  var allStocks = [];

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
      render(container);
    });
  }

  function render(container) {
    var html = '<div class="view-container">' +
      '<div style="margin-bottom: 16px;">' +
        '<h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">Strategie-Screener</h2>' +
        '<div style="font-size: 0.78rem; color: var(--text-dim);">Finde Aktien basierend auf bewährten Investment-Strategien.</div>' +
      '</div>' +

      // Tabs
      '<div class="main-tabs-row" style="margin-bottom: 16px;">' +
        '<button class="main-tab-btn ' + (currentStrategy === 'value' ? 'active' : '') + '" data-strat="value">💎 Value &amp; Qualität</button>' +
        '<button class="main-tab-btn ' + (currentStrategy === 'growth' ? 'active' : '') + '" data-strat="growth">🚀 Growth &amp; Momentum</button>' +
        '<button class="main-tab-btn ' + (currentStrategy === 'dividend' ? 'active' : '') + '" data-strat="dividend">💰 Dividende</button>' +
      '</div>' +

      '<div id="strategy-info" class="card" style="padding: 12px; margin-bottom: 14px; background: var(--bg-secondary); font-size: 0.75rem; color: var(--text-muted); line-height: 1.5;"></div>' +
      '<div id="strategy-results"></div>' +
    '</div>';

    container.innerHTML = html;

    container.querySelectorAll('[data-strat]').forEach(function (btn) {
      btn.onclick = function () {
        currentStrategy = btn.getAttribute('data-strat');
        render(container);
      };
    });

    applyStrategy(container);
  }

  function applyStrategy(container) {
    var infoEl = container.querySelector('#strategy-info');
    var listEl = container.querySelector('#strategy-results');
    var filtered = [];

    if (currentStrategy === 'value') {
      infoEl.innerHTML = '<b>Ziel:</b> Werthaltige, profitable Unternehmen mit stabilen Margen und moderater Bewertung (ähnlich Warren Buffett).<br><br><b>Kriterien:</b> Marktkap. > 1 Mrd. €, KGV < 20, Verschuldung (D/E) < 150 %, positive Nettomarge.';
      
      filtered = allStocks.filter(function (s) {
        return Number(s.marketCap) > 1e9 && 
               Number(s.pe) > 0 && Number(s.pe) < 20 && 
               (!s.debtToEquity || Number(s.debtToEquity) < 150) && 
               Number(s.profitMargins) > 0;
      });
    } 
    else if (currentStrategy === 'growth') {
      infoEl.innerHTML = '<b>Ziel:</b> Marktführer mit starker Dynamik und rasant steigenden Umsätzen (ähnlich Mark Minervini).<br><br><b>Kriterien:</b> Golden Cross (SMA50 > SMA200), starke 3-Monats-Performance (> 15 %), Umsatzwachstum > 10 %.';
      
      filtered = allStocks.filter(function (s) {
        return s.cross === 'golden' && 
               Number(s.perf3m) > 15 && 
               Number(s.revGrowth) >= 0.10;
      });
    } 
    else if (currentStrategy === 'dividend') {
      infoEl.innerHTML = '<b>Ziel:</b> Cashflow-starke Bestandsunternehmen mit sicheren Ausschüttungen.<br><br><b>Kriterien:</b> Dividendenrendite zwischen 2,5 % und 6 % (Vorsicht vor Value Traps), positive Nettomarge.';
      
      filtered = allStocks.filter(function (s) {
        var dy = Number(s.dividendYield);
        return dy >= 2.5 && dy <= 6 && Number(s.profitMargins) > 0;
      });
    }

    // Sortieren nach Marktkapitalisierung (absteigend)
    filtered.sort(function(a, b) {
      return (Number(b.marketCap) || 0) - (Number(a.marketCap) || 0);
    });

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="state-box"><p>Keine Aktien gefunden, die alle Kriterien dieser Strategie erfüllen.</p></div>';
      return;
    }

    var html = '<div style="font-size: 0.78rem; color: var(--text-dim); margin-bottom: 8px;">' + filtered.length + ' Aktien entsprechen dieser Strategie:</div>';

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
            '</div>' +
          '</div>' +
          '<div class="stock-info-right">' +
            '<div class="stock-price">' + esc(window.App.Format.currency(stock.price, stock.currency || 'EUR')) + '</div>' +
            '<div class="badge-pill ' + chgCls + '">' + sign + window.App.Format.number(stock.changePercent, 2) + ' %</div>' +
          '</div>' +
        '</div>';
    });

    if (filtered.length > 50) {
      html += '<div style="text-align: center; font-size: 0.75rem; color: var(--text-dim); margin-top: 10px;">(Die Top 50 nach Marktkapitalisierung werden angezeigt)</div>';
    }

    listEl.innerHTML = html;

    // Klick-Events für die Aktien-Karten
    listEl.querySelectorAll('.stock-card').forEach(function (card) {
      card.onclick = function () {
        var ticker = card.getAttribute('data-ticker');
        window.App.Data.setLastTicker(ticker);
        window.App.Router.navigate('/stock/' + ticker + '/overview');
      };
    });
  }

  return { initView: initView };
})();
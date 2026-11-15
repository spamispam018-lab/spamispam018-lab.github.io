/**
 * js/strategies.js
 * Vordefinierte Anlagestrategien (Value, Growth, Dividende).
 * NEU: Dynamische Slider für jede Strategie, um Kriterien live anzupassen.
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
    dividend: { minYield: 2.5, maxPayout: 60 }
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
      render(container);
    });
  }

  function render(container) {
    var html = '<div class="view-container">' +
      '<div style="margin-bottom: 16px;">' +
        '<h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">Strategie-Screener</h2>' +
        '<div style="font-size: 0.78rem; color: var(--text-dim);">Finde Aktien basierend auf bewährten Investment-Strategien.</div>' +
      '</div>' +

      '<div class="main-tabs-row" style="margin-bottom: 16px;">' +
        '<button class="main-tab-btn ' + (currentStrategy === 'value' ? 'active' : '') + '" data-strat="value">💎 Value &amp; Qualität</button>' +
        '<button class="main-tab-btn ' + (currentStrategy === 'growth' ? 'active' : '') + '" data-strat="growth">🚀 Growth &amp; Momentum</button>' +
        '<button class="main-tab-btn ' + (currentStrategy === 'dividend' ? 'active' : '') + '" data-strat="dividend">💰 Dividende</button>' +
      '</div>' +

      '<div id="strategy-info" class="card" style="padding: 14px; margin-bottom: 14px; background: var(--bg-secondary); font-size: 0.75rem; color: var(--text-muted); line-height: 1.5;"></div>' +
      
      '<div id="strategy-sliders" class="card" style="padding: 14px; margin-bottom: 14px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
          '<span style="font-size:0.85rem; font-weight:700; color:var(--text-main);">Filter anpassen</span>' +
          '<button class="chip-btn" id="btn-reset-strategy" style="padding: 2px 8px; font-size: 0.7rem;">Zurücksetzen</button>' +
        '</div>' +
        '<div id="strategy-slider-inputs" style="display: flex; flex-direction: column; gap: 12px;"></div>' +
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
    
    resetBtn.onclick = function() {
      if (currentStrategy === 'value') sliderState.value = { maxPe: 20, minRoe: 15, maxDebt: 2.5 };
      if (currentStrategy === 'growth') sliderState.growth = { minRs: 80, minRevGrowth: 20, minVol: 100000 };
      if (currentStrategy === 'dividend') sliderState.dividend = { minYield: 2.5, maxPayout: 60 };
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

    sliderHost.innerHTML = html;

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

  function applyStrategy(container) {
    var listEl = container.querySelector('#strategy-results');
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

    filtered.sort(function(a, b) {
      return (Number(b.marketCap) || 0) - (Number(a.marketCap) || 0);
    });

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="state-box"><p>Keine Aktien gefunden. Versuche die Slider weiter nach links/rechts zu ziehen, um die Kriterien zu lockern.</p></div>';
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
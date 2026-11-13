/**
 * js/stock-analyst.js
 * Verwaltet den Analyst-Tab der Aktiendetailseite.
 * NEU: EPS-Schätzungen werden jetzt als visuelle Timeline ("Beat/Miss"-Dots) dargestellt,
 * anstatt als einfaches Balkendiagramm.
 */

window.App = window.App || {};

window.App.StockAnalyst = (function () {
  'use strict';

  var nameToTickerMap = {};

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

  function fetchEtfAnalystData(stock) {
    return new Promise(function(resolve) {
      var isEtf = (stock.sector === 'Sonstige' || stock.sector === 'ETF' || !stock.sector);
      var holdings = stock.holdings || [];
      
      if (!isEtf || holdings.length === 0) {
        resolve({ analysts: stock.analysts || {}, isAggregated: false });
        return;
      }

      window.App.Data.getUniverse().then(function(universe) {
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
          var validHoldings = results.filter(function(r) { 
              return r && r.data && r.data.analysts && r.data.analysts.targets && r.data.analysts.targets.mean; 
          });
          
          if (validHoldings.length === 0) {
            resolve({ analysts: stock.analysts || {}, isAggregated: false });
            return;
          }

          var totalWeight = validHoldings.reduce(function(sum, r) { return sum + r.weight; }, 0);
          
          var aggLowUpside = 0, aggMeanUpside = 0, aggHighUpside = 0;
          var aggRecScore = 0;
          var totalAnalysts = 0;
          var aggBreakdown = { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 };

          validHoldings.forEach(function(r) {
            var normWeight = totalWeight > 0 ? (r.weight / totalWeight) : (1 / validHoldings.length);
            var an = r.data.analysts || {};
            var tg = an.targets || {};
            var rec = an.recommendations || {};
            var bd = rec.breakdown || {};
            var px = r.data.quote ? r.data.quote.price : tg.current;

            if (px > 0 && tg.mean) {
               aggLowUpside += ((tg.low - px) / px) * normWeight;
               aggMeanUpside += ((tg.mean - px) / px) * normWeight;
               aggHighUpside += ((tg.high - px) / px) * normWeight;
            }

            if (rec.score) {
               aggRecScore += (rec.score * normWeight);
            }

            aggBreakdown.strongBuy += bd.strongBuy || 0;
            aggBreakdown.buy += bd.buy || 0;
            aggBreakdown.hold += bd.hold || 0;
            aggBreakdown.sell += bd.sell || 0;
            aggBreakdown.strongSell += bd.strongSell || 0;
            
            totalAnalysts += (tg.analystCount || 0);
          });

          var etfPrice = stock.quote.price || 0;
          var aggregatedAnalysts = {
             targets: {
                current: etfPrice,
                low: etfPrice * (1 + aggLowUpside),
                mean: etfPrice * (1 + aggMeanUpside),
                median: etfPrice * (1 + aggMeanUpside),
                high: etfPrice * (1 + aggHighUpside),
                currency: stock.quote.currency || 'EUR',
                analystCount: totalAnalysts
             },
             recommendations: {
                score: aggRecScore > 0 ? aggRecScore : null,
                breakdown: aggBreakdown,
                history: []
             },
             epsEstimates: [],
             epsForecast: null,
             upgradesDowngrades: [] 
          };

          resolve({ analysts: aggregatedAnalysts, isAggregated: true });
        });
      }).catch(function() {
         resolve({ analysts: stock.analysts || {}, isAggregated: false });
      });
    });
  }

  function render(container, stock) {
    if (!container || !stock) return;

    container.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Lade Analysten-Daten...</p></div>';

    fetchEtfAnalystData(stock).then(function(result) {
      var analysts = result.analysts || {};
      var isAgg = result.isAggregated;
      var targets = analysts.targets || {};
      var recs = analysts.recommendations || {};
      var epsList = analysts.epsEstimates || [];
      var upgrades = analysts.upgradesDowngrades || []; 
      var ratios = stock.ratios || {};
      var quote = stock.quote || {};
      var currency = targets.currency || quote.currency || 'EUR';

      var currentPrice = quote.price || targets.current || 0;
      var targetMean = targets.mean || targets.median || currentPrice;
      var targetLow = targets.low || (currentPrice * 0.8);
      var targetHigh = targets.high || (currentPrice * 1.3);

      var upsidePct = currentPrice > 0 ? ((targetMean - currentPrice) / currentPrice) * 100 : 0;
      var upsideCls = upsidePct >= 0 ? 'badge-bullish' : 'badge-bearish';
      var upsideSign = upsidePct >= 0 ? '+' : '';

      var spanRange = targetHigh - targetLow;
      var currentPosPct = spanRange > 0 ? Math.max(0, Math.min(100, ((currentPrice - targetLow) / spanRange) * 100)) : 50;

      var recScore = recs.score || 2.0;
      var recText = getRecommendationLabel(recScore);

      var aggNote = isAgg 
        ? '<div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:12px; padding:8px 12px; background:var(--bg-tertiary); border-radius:var(--radius-sm); border:1px solid var(--border-subtle);">' +
          '<b>Hinweis (ETF):</b> Kursziele und Empfehlungen wurden aus den Analysten-Bewertungen der größten enthaltenen Aktien (Top Holdings) gewichtet berechnet.</div>' 
        : '';

      var html = '' +
        aggNote +
        '<!-- Kursziele & Upside Karte -->' +
        '<div class="card">' +
          '<div class="card-header-dotted">' +
            '<div class="card-title">' +
              '<span>Kursziele der Analysten</span>' +
              '<span class="period-tag">' + (targets.analystCount || 0) + ' Meinungen</span>' +
            '</div>' +
            '<span class="badge-pill ' + upsideCls + '">' + upsideSign + window.App.Format.number(upsidePct, 1) + ' % Potenzial</span>' +
          '</div>' +
          '<div style="margin: 16px 0 10px;">' +
            '<div style="position: relative; height: 10px; background: linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #10b981 100%); border-radius: 6px;">' +
              '<div style="position: absolute; left: ' + currentPosPct + '%; top: -4px; width: 4px; height: 18px; background: #ffffff; border-radius: 2px; transform: translateX(-50%); box-shadow: 0 0 6px rgba(0,0,0,0.8);">' +
                '<div style="position: absolute; top: -18px; left: 50%; transform: translateX(-50%); font-size: 0.68rem; font-weight: 700; color: #fff; white-space: nowrap;">Kurs</div>' +
              '</div>' +
            '</div>' +
            '<div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 0.78rem;">' +
              '<div><span style="color: var(--text-dim); display: block; font-size: 0.7rem;">Tief</span><strong>' + window.App.Format.currency(targetLow, currency) + '</strong></div>' +
              '<div style="text-align: center;"><span style="color: var(--text-dim); display: block; font-size: 0.7rem;">Durchschnitt</span><strong style="color: var(--accent-purple-light);">' + window.App.Format.currency(targetMean, currency) + '</strong></div>' +
              '<div style="text-align: right;"><span style="color: var(--text-dim); display: block; font-size: 0.7rem;">Hoch</span><strong>' + window.App.Format.currency(targetHigh, currency) + '</strong></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- Forward Valuation Kennzahlen -->' +
        '<div class="card">' +
          '<div class="card-header-dotted">' +
            '<div class="card-title">' +
              '<span>Forward Valuation</span>' +
              '<span class="period-tag">Multiples</span>' +
            '</div>' +
          '</div>' +
          '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">' +
            '<div style="background: var(--bg-secondary); padding: 10px; border-radius: var(--radius-sm); text-align: center;">' +
              '<div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 4px;">KGV Trailing</div>' +
              '<div style="font-size: 1.1rem; font-weight: 700;">' + window.App.Format.number(ratios.peTrailing, 1) + '</div>' +
            '</div>' +
            '<div style="background: var(--bg-secondary); padding: 10px; border-radius: var(--radius-sm); text-align: center;">' +
              '<div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 4px;">KGV Forward</div>' +
              '<div style="font-size: 1.1rem; font-weight: 700; color: var(--accent-purple-light);">' + window.App.Format.number(ratios.peForward, 1) + '</div>' +
            '</div>' +
            '<div style="background: var(--bg-secondary); padding: 10px; border-radius: var(--radius-sm); text-align: center;">' +
              '<div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 4px;">PEG Ratio</div>' +
              '<div style="font-size: 1.1rem; font-weight: 700;">' + window.App.Format.number(ratios.pegRatio, 2) + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        (!isAgg ? 
        '<!-- NEU: EPS Surprise Timeline -->' +
        '<div class="card">' +
          '<div class="card-header-dotted">' +
            '<div class="card-title">' +
              '<span>Gewinn je Aktie (EPS)</span>' +
              '<span class="period-tag">Beat / Miss</span>' +
            '</div>' +
          '</div>' +
          '<div id="analyst-eps-timeline"></div>' +
        '</div>' : '') +

        '<!-- Recommendations Donut & Historie -->' +
        '<div class="card">' +
          '<div class="card-header-dotted">' +
            '<div class="card-title">' +
              '<span>Analysten-Empfehlungen</span>' +
              '<span class="period-tag">' + recText + '</span>' +
            '</div>' +
          '</div>' +
          '<div style="display: flex; align-items: center; justify-content: space-around; margin-bottom: 16px;">' +
            '<div style="width: 130px; height: 130px; position: relative;">' +
              '<canvas id="analyst-donut-canvas" style="width: 130px; height: 130px;"></canvas>' +
            '</div>' +
            '<div id="analyst-breakdown-list" style="font-size: 0.78rem; display: flex; flex-direction: column; gap: 4px;"></div>' +
          '</div>' +
          (!isAgg ?
          '<div style="font-size: 0.74rem; font-weight: 600; color: var(--text-dim); margin-bottom: 8px; text-transform: uppercase;">Entwicklung der letzten 4 Monate</div>' +
          '<div class="chart-container">' +
            '<canvas id="analyst-history-canvas" class="chart-canvas" style="height: 140px;"></canvas>' +
          '</div>' : '') +
        '</div>' +

        // Upgrades & Downgrades Karte
        (!isAgg && upgrades.length > 0 ?
        '<div class="card">' +
          '<div class="card-header-dotted">' +
            '<div class="card-title">' +
              '<span>Upgrades &amp; Downgrades</span>' +
              '<span class="period-tag">Letzte ' + upgrades.length + '</span>' +
            '</div>' +
          '</div>' +
          '<div style="display: flex; flex-direction: column; gap: 6px;">' +
            upgrades.map(function(u) {
              var isUp = u.action === 'up' || u.action === 'init' || (u.toGrade && u.fromGrade && u.toGrade.length > u.fromGrade.length);
              var isDown = u.action === 'down';
              
              var color = isDown ? 'var(--bearish)' : (isUp ? 'var(--bullish)' : 'var(--text-muted)');
              var icon = isDown ? '↓' : (isUp ? '↑' : '→');
              var actionText = isDown ? 'Herabstufung' : (isUp ? 'Hochstufung' : 'Bestätigt');

              return '<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-subtle); font-size: 0.78rem;">' +
                '<div style="display: flex; align-items: center; gap: 8px;">' +
                  '<span style="color: ' + color + '; font-weight: 700; font-size: 1.1rem; width: 16px; text-align: center;">' + icon + '</span>' +
                  '<div>' +
                    '<div style="font-weight: 600; color: var(--text-main);">' + u.firm + '</div>' +
                    '<div style="font-size: 0.7rem; color: var(--text-dim);">' + actionText + ' (' + (u.fromGrade || 'N/A') + ' → ' + (u.toGrade || 'N/A') + ')</div>' +
                  '</div>' +
                '</div>' +
                '<div style="font-size: 0.72rem; color: var(--text-muted); white-space: nowrap;">' + window.App.Format.date(u.date) + '</div>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>' : '');

      container.innerHTML = html;

      // Charts & Listen initialisieren
      if (!isAgg) {
        renderEpsTimeline(epsList, currency, analysts.epsForecast);
        renderRecommendationsHistory(recs.history || []);
      }
      renderRecommendationsDonut(recs);
    });
  }

  function getRecommendationLabel(score) {
    if (!score) return 'Halten';
    if (score <= 1.5) return 'Strong Buy';
    if (score <= 2.3) return 'Kaufen (Buy)';
    if (score <= 3.3) return 'Halten (Hold)';
    if (score <= 4.0) return 'Underperform';
    return 'Verkaufen (Sell)';
  }

  // NEU: Die Timeline für die EPS-Überraschungen
  function renderEpsTimeline(epsList, currency, forecast) {
    var container = document.getElementById('analyst-eps-timeline');
    if (!container || !epsList || epsList.length === 0) return;

    var F = window.App.Format;
    var hasFc = !!(forecast && forecast.estimate !== null && forecast.estimate !== undefined);
    
    // Nimm die letzten 4 Quartale
    var items = epsList.slice(-4);
    
    var html = '';

    // Wenn es eine Prognose für das nächste Quartal gibt, zeigen wir sie oben an
    if (hasFc) {
      var fcVal = F.currency(forecast.estimate, currency, 2);
      var fcDate = forecast.date ? F.date(forecast.date) : '';
      html += '<div style="background: var(--bg-tertiary); border-radius: var(--radius-sm); padding: 10px; text-align: center; margin-bottom: 20px;">' +
        '<div style="font-size: 1.1rem; font-weight: 800; color: var(--text-main);">' + fcVal + ' Schätzung</div>' +
        '<div style="font-size: 0.7rem; color: var(--text-dim);">für das nächste Quartal ' + (fcDate ? '(' + fcDate + ')' : '') + '</div>' +
      '</div>';
    }

    // Die horizontale Timeline
    html += '<div style="position: relative; display: flex; justify-content: space-between; align-items: flex-start; margin: 0 10px;">';
    
    // Die gestrichelte Linie im Hintergrund
    html += '<div style="position: absolute; top: 10px; left: 0; right: 0; height: 1px; border-top: 1px dashed var(--text-dim); z-index: 0;"></div>';

    items.forEach(function(it) {
      var isMiss = it.actual !== null && it.estimate !== null && it.actual < it.estimate;
      var isBeat = it.actual !== null && it.estimate !== null && it.actual >= it.estimate;
      var isFuture = it.actual === null;
      
      var color = isFuture ? 'transparent' : (isBeat ? 'var(--bullish)' : 'var(--bearish)');
      var border = isFuture ? '2px solid var(--text-dim)' : 'none';
      var textClass = isFuture ? 'var(--text-dim)' : (isBeat ? 'var(--bullish)' : 'var(--bearish)');
      var statusText = isFuture ? 'Ausstehend' : (isBeat ? 'Übertroffen' : 'Verfehlt');
      
      var surprise = (it.actual !== null && it.estimate !== null) ? (it.actual - it.estimate) : null;
      var surpriseText = surprise !== null ? (surprise >= 0 ? '+' : '') + F.currency(surprise, currency, 2) : '—';

      html += '<div style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 60px;">' +
        // Der Punkt
        '<div style="width: 20px; height: 20px; border-radius: 50%; background: ' + color + '; border: ' + border + '; box-shadow: 0 0 0 4px var(--bg-card); margin-bottom: 8px;"></div>' +
        // Das Quartal
        '<div style="font-size: 0.75rem; font-weight: 700; color: var(--text-main); margin-bottom: 2px;">' + (it.quarter ? it.quarter.slice(0, 5) : 'Q') + '</div>' +
        // Status
        '<div style="font-size: 0.65rem; font-weight: 700; color: ' + textClass + '; margin-bottom: 2px;">' + statusText + '</div>' +
        // Die Überraschung
        '<div style="font-size: 0.7rem; color: ' + textClass + ';">' + surpriseText + '</div>' +
      '</div>';
    });
    
    // Wenn es eine Prognose gibt, fügen wir sie als hohlen Punkt rechts an
    if (hasFc) {
       html += '<div style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 60px;">' +
        '<div style="width: 20px; height: 20px; border-radius: 50%; background: transparent; border: 2px solid var(--text-dim); box-shadow: 0 0 0 4px var(--bg-card); margin-bottom: 8px;"></div>' +
        '<div style="font-size: 0.75rem; font-weight: 700; color: var(--text-dim); margin-bottom: 2px;">Nächstes</div>' +
        '<div style="font-size: 0.65rem; font-weight: 700; color: var(--text-dim);">Prognose</div>' +
        '<div style="font-size: 0.7rem; color: var(--text-dim);">—</div>' +
      '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
  }

  function renderRecommendationsDonut(recs) {
    var canvas = document.getElementById('analyst-donut-canvas');
    var breakdownContainer = document.getElementById('analyst-breakdown-list');
    if (!canvas) return;

    var b = recs.breakdown || { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 };
    var total = (b.strongBuy || 0) + (b.buy || 0) + (b.hold || 0) + (b.sell || 0) + (b.strongSell || 0);

    var data = [
      { label: 'Strong Buy', value: b.strongBuy || 0, color: '#059669' },
      { label: 'Buy', value: b.buy || 0, color: '#10b981' },
      { label: 'Hold', value: b.hold || 0, color: '#f59e0b' },
      { label: 'Sell', value: b.sell || 0, color: '#ef4444' },
      { label: 'Strong Sell', value: b.strongSell || 0, color: '#b91c1c' }
    ];

    window.App.Charts.renderDonutChart(canvas, {
      data: data,
      totalText: recs.score ? recs.score.toFixed(2) : '—',
      subText: 'Konsens'
    });

    if (breakdownContainer) {
      var html = '';
      data.forEach(function (d) {
        var pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
        html += '' +
          '<div style="display: flex; align-items: center; justify-content: space-between; gap: 14px;">' +
            '<div style="display: flex; align-items: center; gap: 6px;">' +
              '<span style="width: 8px; height: 8px; border-radius: 50%; background-color: ' + d.color + ';"></span>' +
              '<span style="color: var(--text-muted);">' + d.label + '</span>' +
            '</div>' +
            '<div><strong>' + d.value + '</strong> <span style="color: var(--text-dim); font-size: 0.7rem;">(' + pct + ' %)</span></div>' +
          '</div>';
      });
      breakdownContainer.innerHTML = html;
    }
  }

  function renderRecommendationsHistory(history) {
    var canvas = document.getElementById('analyst-history-canvas');
    if (!canvas || !history || history.length === 0) return;

    var labels = [];
    var stacks = [];

    history.forEach(function (h) {
      var periodLabel = h.period === '0m' ? 'Aktuell' : h.period;
      labels.push(periodLabel);
      stacks.push({
        strongBuy: h.strongBuy || 0,
        buy: h.buy || 0,
        hold: h.hold || 0,
        sell: h.sell || 0,
        strongSell: h.strongSell || 0
      });
    });

    window.App.Charts.renderStackedBarChart(canvas, {
      labels: labels,
      stacks: stacks
    });
  }

  return {
    render: render
  };
})();
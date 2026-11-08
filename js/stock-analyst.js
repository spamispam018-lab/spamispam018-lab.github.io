/**
 * js/stock-analyst.js
 * Verwaltet den Analyst-Tab der Aktiendetailseite:
 * - Kursziel-Karte (Low / Median / High auf Spannenbalken mit aktuellem Kursmarker und Upside %)
 * - Forward Valuation (Forward-KGV, Trailing-KGV, 5Y-KGV-Spanne)
 * - EPS-Estimates (Balkenchart mit Beat/Miss/Forecast-Farbcodierung)
 * - Analyst Recommendations (Konsens-Score, Donut-Diagramm, gestapeltes Verlaufshistorie-Chart)
 *
 * *NEU:* Bei ETFs werden die Analysten-Bewertungen und Kursziele der Top 5 Holdings gewichtet aggregiert!
 */

window.App = window.App || {};

window.App.StockAnalyst = (function () {
  'use strict';

  var nameToTickerMap = {};

  /**
   * Baut einen Lookup-Katalog aus dem Universum, um Holding-Namen in Ticker zu übersetzen.
   */
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

  /**
   * Lädt die Analysten-Daten der Top 5 Holdings, falls es sich um einen ETF handelt.
   * Gibt ein Promise zurück, das die aggregierten Daten auflöst.
   */
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
                history: [] // Historie für Aggregation auslassen
             },
             epsEstimates: [],
             epsForecast: null
          };

          resolve({ analysts: aggregatedAnalysts, isAggregated: true });
        });
      }).catch(function() {
         resolve({ analysts: stock.analysts || {}, isAggregated: false });
      });
    });
  }

  /**
   * Rendert den kompletten Analyst-Tab in den Ziel-Container.
   */
  function render(container, stock) {
    if (!container || !stock) return;

    container.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Lade Analysten-Daten...</p></div>';

    fetchEtfAnalystData(stock).then(function(result) {
      var analysts = result.analysts || {};
      var isAgg = result.isAggregated;
      var targets = analysts.targets || {};
      var recs = analysts.recommendations || {};
      var epsList = analysts.epsEstimates || [];
      var ratios = stock.ratios || {};
      var quote = stock.quote || {};
      var currency = targets.currency || quote.currency || 'EUR';

      var currentPrice = quote.price || targets.current || 0;
      var targetMean = targets.mean || targets.median || currentPrice;
      var targetLow = targets.low || (currentPrice * 0.8);
      var targetHigh = targets.high || (currentPrice * 1.3);

      // Upside-Berechnung
      var upsidePct = currentPrice > 0 ? ((targetMean - currentPrice) / currentPrice) * 100 : 0;
      var upsideCls = upsidePct >= 0 ? 'badge-bullish' : 'badge-bearish';
      var upsideSign = upsidePct >= 0 ? '+' : '';

      // Relative Position des aktuellen Kurses auf dem Spannenbalken
      var spanRange = targetHigh - targetLow;
      var currentPosPct = spanRange > 0 ? Math.max(0, Math.min(100, ((currentPrice - targetLow) / spanRange) * 100)) : 50;

      // Konsens-Empfehlungstext
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
            '<!-- Spannenbalken mit Farbverlauf -->' +
            '<div style="position: relative; height: 10px; background: linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #10b981 100%); border-radius: 6px;">' +
              '<!-- Aktueller Kursmarker -->' +
              '<div style="position: absolute; left: ' + currentPosPct + '%; top: -4px; width: 4px; height: 18px; background: #ffffff; border-radius: 2px; transform: translateX(-50%); box-shadow: 0 0 6px rgba(0,0,0,0.8);">' +
                '<div style="position: absolute; top: -18px; left: 50%; transform: translateX(-50%); font-size: 0.68rem; font-weight: 700; color: #fff; white-space: nowrap;">Kurs</div>' +
              '</div>' +
            '</div>' +

            '<!-- Preisbeschriftungen unter dem Balken -->' +
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
        '<!-- EPS Estimates Balkenchart -->' +
        '<div class="card">' +
          '<div class="card-header-dotted">' +
            '<div class="card-title">' +
              '<span>EPS: Schätzungen vs. Tatsächlich</span>' +
              '<span class="period-tag">Quartale</span>' +
            '</div>' +
          '</div>' +

          '<div class="chart-container">' +
            '<canvas id="analyst-eps-canvas" class="chart-canvas" style="height: 190px;"></canvas>' +
            '<div class="chart-legend">' +
              '<div class="legend-item"><span class="legend-dot" style="background:#6b7280;"></span><span>Schätzung</span></div>' +
              '<div class="legend-item"><span class="legend-dot" style="background:#10b981;"></span><span>Beat</span></div>' +
              '<div class="legend-item"><span class="legend-dot" style="background:#ef4444;"></span><span>Miss</span></div>' +
              (analysts.epsForecast && analysts.epsForecast.estimate !== null && analysts.epsForecast.estimate !== undefined
                ? '<div class="legend-item"><span class="legend-dot" style="background:#3b82f6;"></span><span>Forecast</span></div>' : '') +
            '</div>' +
            '<div id="analyst-eps-forecast-note" style="font-size:0.72rem;color:var(--text-dim);line-height:1.45;margin-top:8px;"></div>' +
          '</div>' +
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
            '<!-- Donut -->' +
            '<div style="width: 130px; height: 130px; position: relative;">' +
              '<canvas id="analyst-donut-canvas" style="width: 130px; height: 130px;"></canvas>' +
            '</div>' +

            '<!-- Detail-Aufschlüsselung -->' +
            '<div id="analyst-breakdown-list" style="font-size: 0.78rem; display: flex; flex-direction: column; gap: 4px;"></div>' +
          '</div>' +

          (!isAgg ?
          '<!-- Gestapeltes Verlaufshistorie-Chart -->' +
          '<div style="font-size: 0.74rem; font-weight: 600; color: var(--text-dim); margin-bottom: 8px; text-transform: uppercase;">Entwicklung der letzten 4 Monate</div>' +
          '<div class="chart-container">' +
            '<canvas id="analyst-history-canvas" class="chart-canvas" style="height: 140px;"></canvas>' +
          '</div>' : '') +

          '<!-- Verlinkung zu detaillierten Quellen -->' +
          '<div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--border-subtle); text-align: center; font-size: 0.75rem;">' +
            '<span style="color: var(--text-dim);">Quelle: ' + (isAgg ? 'Gewichtete Aggregation aus Holdings.' : 'Aggregierter Konsens via Yahoo Finance.') + '</span><br>' +
            '<a href="https://de.finance.yahoo.com/quote/' + stock.ticker + '/analysis" target="_blank" style="color: var(--accent-purple-light); text-decoration: none; font-weight: 600; display: inline-block; margin-top: 4px;">Detaillierte Analystenberichte ansehen &rarr;</a>' +
          '</div>' +
        '</div>';

      container.innerHTML = html;

      // Charts & Listen initialisieren
      if (!isAgg) {
        renderEpsChart(epsList, currency, analysts.epsForecast);
        renderRecommendationsHistory(recs.history || []);
      }
      renderRecommendationsDonut(recs);
    });
  }

  /**
   * Wandelt den Konsens-Score (1.0 - 5.0) in lesbaren deutschen Text um.
   */
  function getRecommendationLabel(score) {
    if (!score) return 'Halten';
    if (score <= 1.5) return 'Strong Buy';
    if (score <= 2.3) return 'Kaufen (Buy)';
    if (score <= 3.3) return 'Halten (Hold)';
    if (score <= 4.0) return 'Underperform';
    return 'Verkaufen (Sell)';
  }

  /**
   * Zeichnet das EPS-Balkendiagramm mit Schätzung vs. Tatsächlich.
   */
  function renderEpsChart(epsList, currency, forecast) {
    var canvas = document.getElementById('analyst-eps-canvas');
    if (!canvas || !epsList || epsList.length === 0) return;

    var hasFc = !!(forecast && forecast.estimate !== null && forecast.estimate !== undefined);
    var items = epsList.slice(hasFc ? -5 : -6);
    var labels = [];
    var estData = [];
    var actData = [];
    var actColors = [];

    items.forEach(function (it) {
      labels.push(it.quarter ? it.quarter.slice(2, 7) : 'Q');
      estData.push(it.estimate !== null ? it.estimate : 0);
      actData.push(it.actual !== null ? it.actual : 0);
      var miss = it.actual !== null && it.estimate !== null && it.actual < it.estimate;
      actColors.push(miss ? '#ef4444' : '#10b981');
    });

    if (hasFc) {
      labels.push(forecast.date ? forecast.date.slice(2, 7) : 'Next');
      estData.push(0);
      actData.push(forecast.estimate);
      actColors.push('#3b82f6');
    }

    var note = document.getElementById('analyst-eps-forecast-note');
    if (note) {
      if (hasFc) {
        var F = window.App.Format;
        var d = forecast.date ? forecast.date.slice(8, 10) + '.' + forecast.date.slice(5, 7) + '.' + forecast.date.slice(0, 4) : null;
        note.innerHTML = 'Nächster Bericht' + (d ? ' (ca. ' + d + ')' : '') + ': Konsens-Prognose <b style="color:var(--text-main);">' + F.currency(forecast.estimate, currency, 2) + '</b>' +
          (forecast.low !== null && forecast.low !== undefined && forecast.high !== null && forecast.high !== undefined
            ? ' (Spanne ' + F.currency(forecast.low, currency, 2) + ' – ' + F.currency(forecast.high, currency, 2) + ')' : '') +
          (forecast.analysts ? ', ' + forecast.analysts + ' Analysten' : '') + '.';
      } else {
        note.textContent = 'Keine Prognose für das nächste Quartal in den Daten.';
      }
    }

    window.App.Charts.renderGroupedBarChart(canvas, {
      labels: labels,
      series: [
        { name: 'Schätzung', data: estData, color: '#4b5563' },
        { name: 'Tatsächlich', data: actData, color: '#10b981', colors: actColors }
      ],
      formatY: function (val) {
        return window.App.Format.currency(val, currency, 2);
      }
    });
  }

  /**
   * Rendert den Donut-Chart für die aktuelle Empfehlungsverteilung.
   */
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

  /**
   * Rendert den gestapelten monatlichen Verlauf der Empfehlungen.
   */
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

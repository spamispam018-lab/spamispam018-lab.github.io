/**
 * js/stock-analyst.js
 * Verwaltet den Analyst-Tab der Aktiendetailseite.
 * NEU: Klickbare Info-Popups für Kursziele, Forward Valuation und EPS.
 */

window.App = window.App || {};

window.App.StockAnalyst = (function () {
  'use strict';

  var nameToTickerMap = {};

  // Erklärtexte für die Info-Popups
  var INFO_TEXTS = {
    targets: {
      title: 'Kursziele der Analysten',
      text: 'Analysten bewerten die Aktie regelmäßig und geben ein Kursziel für die nächsten 12 Monate ab. Das "Potenzial" zeigt, wie viel Prozent Luft nach oben (oder unten) zum durchschnittlichen Ziel besteht. Eine hohe Anzahl an Meinungen (z.B. 14) macht das Ziel verlässlicher.'
    },
    valuation: {
      title: 'Forward Valuation',
      text: 'KGV (Trailing) = Aktienkurs geteilt durch den Gewinn der letzten 12 Monate. KGV (Forward) = Aktienkurs geteilt durch den geschätzten Gewinn der nächsten 12 Monate. Ein niedrigeres Forward-KGV deutet auf erwartetes Gewinnwachstum hin. Die PEG Ratio setzt das KGV ins Verhältnis zum erwarteten Wachstum (Werte unter 1 gelten als günstig).'
    },
    eps: {
      title: 'Gewinn je Aktie (EPS)',
      text: 'Der Gewinn pro Aktie (Earnings Per Share). Hier siehst du, ob das Unternehmen die Schätzungen der Analysten in den letzten Quartalen übertroffen (Beat/grün) oder verfehlt (Miss/rot) hat. Das hilft dir einzuschätzen, wie verlässlich die Prognosen für dieses Unternehmen generell sind.'
    },
    recs: {
      title: 'Analysten-Empfehlungen',
      text: 'Die aggregierte Meinung aller Analysten, die die Aktie abdecken. Der Score reicht meist von 1 (Strong Buy) bis 5 (Strong Sell). Der Donut zeigt die genaue Verteilung der Meinungen (Kaufen, Halten, Verkaufen).'
    }
  };

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
      var isEtf = window.App.EtfHoldings.isEtf(stock);
      var holdings = stock.holdings || [];
      
      if (!isEtf || holdings.length === 0) {
        resolve({ analysts: stock.analysts || {}, isAggregated: false });
        return;
      }

      // Top-10-Positionen den Aktien der App zuordnen (js/etf-holdings.js), dann deren Analystendaten laden
      window.App.EtfHoldings.match(stock, 10).then(function(list) {
        var promises = list.filter(function (h) { return h.ticker; }).map(function (h) {
          return window.App.Data.getStock(h.ticker).then(function (res) {
            return { data: res, weight: h.weight || 0 };
          }).catch(function () { return null; });
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
          '<b>Hinweis (ETF):</b> Kursziele und Empfehlungen aus den Analysten-Bewertungen der bis zu 10 größten ETF-Positionen, nach Gewicht gemittelt.</div>' 
        : '';

      // NEU: Klickbare Titel (data-pm-info) für die Erklärungen
      var html = '' +
        aggNote +
        '<!-- Kursziele & Upside Karte -->' +
        '<div class="card">' +
          '<div class="card-header-dotted">' +
            '<div class="card-title" data-pm-info="targets" style="cursor:pointer;" title="Info anzeigen">' +
              '<span>Kursziele der Analysten <span style="font-size: 0.7em; opacity: 0.6;">ⓘ</span></span>' +
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
            '<div class="card-title" data-pm-info="valuation" style="cursor:pointer;" title="Info anzeigen">' +
              '<span>Forward Valuation <span style="font-size: 0.7em; opacity: 0.6;">ⓘ</span></span>' +
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
        '<!-- EPS Surprise Timeline -->' +
        '<div class="card">' +
          '<div class="card-header-dotted">' +
            '<div class="card-title" data-pm-info="eps" style="cursor:pointer;" title="Info anzeigen">' +
              '<span>Gewinn je Aktie (EPS) <span style="font-size: 0.7em; opacity: 0.6;">ⓘ</span></span>' +
              '<span class="period-tag">Beat / Miss</span>' +
            '</div>' +
          '</div>' +
          '<div id="analyst-eps-timeline"></div>' +
        '</div>' : '') +

        '<!-- Recommendations Donut & Historie -->' +
        '<div class="card">' +
          '<div class="card-header-dotted">' +
            '<div class="card-title" data-pm-info="recs" style="cursor:pointer;" title="Info anzeigen">' +
              '<span>Analysten-Empfehlungen <span style="font-size: 0.7em; opacity: 0.6;">ⓘ</span></span>' +
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
        (!isAgg ?
        '<div class="card">' +
          '<div class="card-header-dotted">' +
            '<div class="card-title">' +
              '<span>Upgrades &amp; Downgrades</span>' +
              '<span class="period-tag">' + (upgrades.length > 0 ? 'Letzte ' + upgrades.length : 'Keine Daten') + '</span>' +
            '</div>' +
          '</div>' +
          (upgrades.length > 0 ?
            '<div style="display: flex; flex-direction: column; gap: 6px;">' +
              upgrades.map(function(u) {
                var isDown = u.action === 'down' || (u.fromGrade && u.toGrade && u.toGrade.length < u.fromGrade.length);
                var isUp = u.action === 'up' || (u.fromGrade && u.toGrade && u.toGrade.length > u.fromGrade.length);
                
                var color = isDown ? 'var(--bearish)' : (isUp ? 'var(--bullish)' : 'var(--text-muted)');
                var icon = isDown ? '↓' : (isUp ? '↑' : '→');
                var actionText = isDown ? 'Herabstufung' : (isUp ? 'Hochstufung' : 'Bestätigt');

                var fromStr = u.fromGrade || '—';
                var toStr = u.toGrade || '—';

                return '<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-subtle); font-size: 0.78rem;">' +
                  '<div style="display: flex; align-items: center; gap: 8px;">' +
                    '<span style="color: ' + color + '; font-weight: 700; font-size: 1.1rem; width: 16px; text-align: center;">' + icon + '</span>' +
                    '<div>' +
                      '<div style="font-weight: 600; color: var(--text-main);">' + u.firm + '</div>' +
                      '<div style="font-size: 0.7rem; color: var(--text-dim);">' + actionText + ' (' + fromStr + ' → ' + toStr + ')</div>' +
                    '</div>' +
                  '</div>' +
                  '<div style="font-size: 0.72rem; color: var(--text-muted); white-space: nowrap;">' + window.App.Format.date(u.date) + '</div>' +
                '</div>';
              }).join('') +
            '</div>'
          : '<div class="state-box" style="padding: 20px 0;"><p style="font-size: 0.8rem;">Für diesen Titel liegen keine aktuellen Upgrades oder Downgrades vor.</p></div>'
          ) +
        '</div>' : '') +

        // Link zu Yahoo Finance
        '<div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--border-subtle); text-align: center; font-size: 0.75rem;">' +
          '<span style="color: var(--text-dim);">Quelle: ' + (isAgg ? 'Gewichtete Aggregation aus Holdings.' : 'Aggregierter Konsens via Yahoo Finance.') + '</span><br>' +
          '<a href="https://de.finance.yahoo.com/quote/' + stock.ticker + '/analysis" target="_blank" rel="noopener" style="color: var(--accent-purple-light); text-decoration: none; font-weight: 600; display: inline-block; margin-top: 4px;">Detaillierte Analystenberichte auf Yahoo Finance ansehen &rarr;</a>' +
        '</div>' +
        
        // Das Info-Modal (unsichtbar am Anfang)
        '<div id="pm-info-modal-backdrop" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9998;" onclick="this.style.display=\'none\'; document.getElementById(\'pm-info-modal\').style.display=\'none\';"></div>' +
        '<div id="pm-info-modal" style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:9999; background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:20px; width:90%; max-width:400px; box-shadow:0 10px 30px rgba(0,0,0,0.5);">' +
          '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
            '<h3 id="pm-info-title" style="font-size:1.1rem; font-weight:700; color:var(--text-main); margin:0;">Titel</h3>' +
            '<button id="pm-info-close" style="background:none; border:none; color:var(--text-dim); font-size:1.5rem; cursor:pointer; padding:0 5px;">&times;</button>' +
          '</div>' +
          '<div id="pm-info-text" style="font-size:0.85rem; color:var(--text-muted); line-height:1.5;">Text</div>' +
        '</div>';

      container.innerHTML = html;

      // Modal-Logik binden
      var closeBtn = container.querySelector('#pm-info-close');
      if (closeBtn) {
        closeBtn.onclick = function() {
          container.querySelector('#pm-info-modal-backdrop').style.display = 'none';
          container.querySelector('#pm-info-modal').style.display = 'none';
        };
      }

      // Klick-Event für die Erklärungen
      container.addEventListener('click', function(e) {
        var target = e.target.closest('[data-pm-info]');
        if (target) {
          e.stopPropagation();
          var key = target.getAttribute('data-pm-info');
          var data = INFO_TEXTS[key];
          if (!data) return;
          
          var titleEl = container.querySelector('#pm-info-title');
          var textEl = container.querySelector('#pm-info-text');
          if (titleEl && textEl) {
            titleEl.textContent = data.title;
            textEl.textContent = data.text;
            container.querySelector('#pm-info-modal-backdrop').style.display = 'block';
            container.querySelector('#pm-info-modal').style.display = 'block';
          }
        }
      });

      // Charts & Listen initialisieren
      if (!isAgg) {
        renderEpsTimeline(epsList, currency, analysts.epsForecast, analysts.nextEarningsDate);
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

  /** "2026-09-30" -> "Q3 '26" (Kalenderquartal des Quartalsendes) */
  function quarterLabel(dateStr) {
    if (!dateStr || dateStr === 'None') return 'Q';
    var m = /^(\d{4})-(\d{2})/.exec(String(dateStr));
    if (!m) return String(dateStr).slice(0, 7);
    var q = Math.floor((parseInt(m[2], 10) - 1) / 3) + 1;
    return 'Q' + q + " '" + m[1].slice(2);
  }

  /** Quartal nach dem angegebenen: "2026-09-30" -> "Q4 '26" */
  function nextQuarterLabel(dateStr) {
    var m = /^(\d{4})-(\d{2})/.exec(String(dateStr || ''));
    if (!m) return 'Nächstes';
    var y = parseInt(m[1], 10);
    var q = Math.floor((parseInt(m[2], 10) - 1) / 3) + 2;
    if (q > 4) { q = 1; y++; }
    return 'Q' + q + " '" + String(y).slice(2);
  }

  function renderEpsTimeline(epsList, currency, forecast, nextEarningsDate) {
    var container = document.getElementById('analyst-eps-timeline');
    if (!container || !epsList || epsList.length === 0) return;

    var F = window.App.Format;
    var hasFc = !!(forecast && forecast.estimate !== null && forecast.estimate !== undefined);

    // Chronologisch sortieren (Daten kommen teils neuestes zuerst) und die letzten 4 nehmen
    var items = epsList
      .filter(function (it) { return it && it.quarter && it.quarter !== 'None'; })
      .slice()
      .sort(function (a, b) { return String(a.quarter).localeCompare(String(b.quarter)); })
      .slice(-4);
    if (!items.length) items = epsList.slice(0, 4);

    var html = '';
    var fcVal = hasFc ? F.currency(forecast.estimate, currency, 2) : '';
    var fcDateRaw = (forecast && forecast.date) || nextEarningsDate || null;
    var fcDate = fcDateRaw ? F.date(fcDateRaw) : '';

    if (hasFc) {
      html += '<div style="background: var(--bg-tertiary); border-radius: var(--radius-sm); padding: 10px; text-align: center; margin-bottom: 20px;">' +
        '<div style="font-size: 1.1rem; font-weight: 800; color: var(--text-main);">' + fcVal + ' Schätzung</div>' +
        '<div style="font-size: 0.7rem; color: var(--text-dim);">für das nächste Quartal' + (fcDate ? ' · Zahlen am ' + fcDate : '') + '</div>' +
      '</div>';
    }

    html += '<div style="position: relative; display: flex; justify-content: space-between; align-items: flex-start; margin: 0 4px;">';
    html += '<div style="position: absolute; top: 10px; left: 0; right: 0; height: 1px; border-top: 1px dashed var(--text-dim); z-index: 0;"></div>';

    function node(dotStyle, label, labelColor, status, statusColor, value, valueColor) {
      return '<div style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; flex: 1 1 0; min-width: 0; text-align: center;">' +
        '<div style="width: 20px; height: 20px; border-radius: 50%; ' + dotStyle + ' box-shadow: 0 0 0 4px var(--bg-card); margin-bottom: 8px;"></div>' +
        '<div style="font-size: 0.75rem; font-weight: 700; color: ' + labelColor + '; margin-bottom: 2px; white-space: nowrap;">' + label + '</div>' +
        '<div style="font-size: 0.62rem; font-weight: 700; color: ' + statusColor + '; margin-bottom: 2px; white-space: nowrap;">' + status + '</div>' +
        '<div style="font-size: 0.68rem; color: ' + valueColor + '; white-space: nowrap;">' + value + '</div>' +
      '</div>';
    }

    items.forEach(function (it) {
      var hasBoth = it.actual !== null && it.actual !== undefined && it.estimate !== null && it.estimate !== undefined;
      var label = quarterLabel(it.quarter);
      if (!hasBoth) {
        html += node('background: transparent; border: 2px solid var(--text-dim);', label, 'var(--text-main)', 'Ausstehend', 'var(--text-dim)', '—', 'var(--text-dim)');
        return;
      }
      var diff = it.actual - it.estimate;
      // Abweichung in %: bevorzugt aus den Daten, sonst selbst berechnet
      var pct = (typeof it.surprisePercent === 'number') ? it.surprisePercent * 100
        : (it.estimate !== 0 ? (diff / Math.abs(it.estimate)) * 100 : 0);
      var met = Math.abs(diff) < 0.005; // auf Cent gerundet gleich
      var col = met ? 'var(--text-muted)' : (diff > 0 ? 'var(--bullish)' : 'var(--bearish)');
      var status = met ? 'Getroffen' : (diff > 0 ? 'Besser' : 'Schwächer'); // kurz, damit 5 Spalten aufs Handy passen
      var value = met ? '±0 %' : (pct >= 0 ? '+' : '−') + F.number(Math.abs(pct), 1) + ' %';
      var dot = met ? 'background: var(--text-muted); border: none;' : 'background: ' + col + '; border: none;';
      html += node(dot, label, 'var(--text-main)', status, col, value, col);
    });

    if (hasFc) {
      var last = items.length ? items[items.length - 1].quarter : null;
      html += node('background: transparent; border: 2px solid var(--accent-purple-light);', nextQuarterLabel(last), 'var(--accent-purple-light)', 'Prognose', 'var(--text-dim)', fcVal, 'var(--text-main)');
    }

    html += '</div>';
    html += '<div style="font-size: 0.68rem; color: var(--text-dim); text-align: center; margin-top: 12px;">Abweichung des tatsächlichen Gewinns je Aktie von der Analystenschätzung</div>';
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
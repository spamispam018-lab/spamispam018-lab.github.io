/**
 * js/stock-overview.js
 * Verwaltet den Tab "Overview".
 * NEU: "Live-Kurs abrufen" integriert den neuen Preis direkt in den Chart und 
 * aktualisiert den Zeitstempel, damit alles konsistent bleibt.
 */

window.App = window.App || {};

window.App.StockOverview = (function () {
  'use strict';

  var currentStock = null;
  var currentPeriod = '1Y';
  var longHistory = null;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function render(container, stock) {
    if (!container || !stock) return;
    currentStock = stock;

    var quote = stock.quote || {};
    var ratios = stock.ratios || {};
    var insider = stock.insider || { summary: {}, trades: [] };
    var financials = stock.financials || {};
    var holdings = stock.holdings || [];
    
    var isDataMissing = !quote.price || quote.price <= 0;

    var peTrailingDisplay;
    if (ratios.peTrailing !== null && ratios.peTrailing !== undefined && ratios.peTrailing > 0) {
      peTrailingDisplay = window.App.Format.number(ratios.peTrailing, 1);
    } else if (ratios.peForward || ratios.profitMargins < 0) {
      peTrailingDisplay = '<span style="color: var(--bearish); font-size: 0.78rem; font-weight: 600;">Negativ (Verlust)</span>';
    } else {
      peTrailingDisplay = '—';
    }

    var forwardPeDisplay = (ratios.peForward && ratios.peForward > 0) ? window.App.Format.number(ratios.peForward, 1) : '—';
    var divYieldDisplay = (ratios.dividendYield !== null && ratios.dividendYield !== undefined && ratios.dividendYield > 0) ? window.App.Format.number(ratios.dividendYield, 2) + ' %' : '0,00 %';

    var updatedAtDisplay = 'Unbekannt';
    if (stock.updatedAt) {
      var d = new Date(stock.updatedAt);
      if (!isNaN(d.getTime())) {
        updatedAtDisplay = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' +
                           d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
      }
    }

    var html = '' +
      '<!-- KI-Analyse mit Gemini -->' +
      '<div class="card" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%); border: 1px solid var(--accent-purple); padding: 14px; margin-bottom: 8px;">' +
        '<div style="display: flex; justify-content: space-between; align-items: center;">' +
          '<div style="flex: 1; padding-right: 12px;">' +
            '<div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main); margin-bottom: 2px; display: flex; align-items: center; gap: 6px;">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple-light)" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>' +
              'KI-Analyse' +
            '</div>' +
            '<div style="font-size: 0.72rem; color: var(--text-muted);">Frage Gemini nach den Gründen für die Kursentwicklung und einer Bewertung.</div>' +
          '</div>' +
          '<button id="btn-ask-gemini" class="chip-btn active" style="background: var(--accent-purple); border-color: var(--accent-purple); font-size: 0.75rem; flex-shrink: 0; box-shadow: 0 4px 14px var(--accent-purple-glow);" ' + (isDataMissing ? 'disabled style="opacity:0.5;box-shadow:none;"' : '') + '>Fragen</button>' +
        '</div>' +
      '</div>' +

      '<!-- Daten aktualisieren Button & Zeitstempel -->' +
      '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">' +
        '<div id="overview-timestamp" style="font-size: 0.7rem; color: var(--text-dim);">Stand: ' + updatedAtDisplay + '</div>' +
        '<button id="btn-refresh-stock" class="chip-btn" style="font-size: 0.72rem; display: flex; align-items: center; gap: 6px;">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>' +
          'Live-Kurs abrufen' +
        '</button>' +
      '</div>' +
      
      (isDataMissing ? '<div class="card" style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--bearish); padding: 16px; margin-bottom: 14px; text-align: center;">' +
        '<div style="font-size: 1.1rem; font-weight: 700; color: var(--bearish); margin-bottom: 4px;">Keine Kursdaten verfügbar</div>' +
        '<div style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">Bitte klicke oben auf <b>Live-Kurs abrufen</b>, um die Daten neu zu ziehen.</div>' +
      '</div>' : '') +

      '<div id="news-card"></div>' +
      renderEtfHoldingsHtml(holdings) +
      renderMetricsHtml(quote, ratios, peTrailingDisplay, forwardPeDisplay, divYieldDisplay, isDataMissing) +
      
      (!isDataMissing ? 
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Kursverlauf</span>' +
          '<div class="pill-group" id="overview-period-pills">' +
            '<button class="pill-btn ' + (currentPeriod === '1W' ? 'active' : '') + '" data-period="1W">1W</button>' +
            '<button class="pill-btn ' + (currentPeriod === '1M' ? 'active' : '') + '" data-period="1M">1M</button>' +
            '<button class="pill-btn ' + (currentPeriod === '3M' ? 'active' : '') + '" data-period="3M">3M</button>' +
            '<button class="pill-btn ' + (currentPeriod === '6M' ? 'active' : '') + '" data-period="6M">6M</button>' +
            '<button class="pill-btn ' + (currentPeriod === '1Y' ? 'active' : '') + '" data-period="1Y">1J</button>' +
            '<button class="pill-btn ' + (currentPeriod === '5Y' ? 'active' : '') + '" data-period="5Y">5J</button>' +
            '<button class="pill-btn ' + (currentPeriod === '10Y' ? 'active' : '') + '" data-period="10Y">10J</button>' +
          '</div>' +
        '</div>' +
        '<div style="height: 180px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="overview-price-canvas"></canvas>' +
        '</div>' +
        '<div class="perf-grid" id="overview-perf-grid"></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Insider Activity</span>' +
          '<span class="period-tag">Letzte 2Q</span>' +
          '<span style="margin-left: auto; font-size: 0.75rem; font-weight: 700; color: ' + getSentimentColor(insider.summary.sentiment) + ';">' + (insider.summary.sentiment || 'Neutral') + '</span>' +
        '</div>' +
        renderInsiderSummaryBar(insider.summary) +
        '<div style="margin-top: 10px; font-size: 0.75rem; color: var(--text-dim); text-align: right;">' +
          '<a href="#/stock/' + stock.ticker + '/insider" style="color: var(--accent-purple-light); text-decoration: none; font-weight: 600;">View Insider Tab &rarr;</a>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Financials Trend</span>' +
          '<span class="period-tag">TTM / Quartale</span>' +
        '</div>' +
        '<div style="height: 160px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="overview-financials-canvas"></canvas>' +
        '</div>' +
      '</div>' : '');

    container.innerHTML = html;
    
    if (window.App.News) window.App.News.fillTicker(stock.ticker, container.querySelector('#news-card'));

    // Live-Kurs über eigenen Cloudflare Proxy abrufen mit Währungsumrechnung
    var refreshBtn = container.querySelector('#btn-refresh-stock');
    if (refreshBtn) {
      refreshBtn.onclick = function() {
        var originalHtml = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<div class="spinner" style="width: 14px; height: 14px; border-width: 2px; display: inline-block; vertical-align: middle; margin-right: 6px;"></div> Lade...';
        refreshBtn.disabled = true;

        var proxyUrl = "https://yahoo-proxy.spamispam018.workers.dev/?ticker=" + encodeURIComponent(currentStock.ticker);

        fetch(proxyUrl)
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
              throw new Error("Keine Daten von Yahoo erhalten.");
            }
            
            var result = data.chart.result[0];
            var meta = result.meta;
            var livePrice = meta.regularMarketPrice;
            var prevClose = meta.chartPreviousClose || meta.previousClose || livePrice;
            var currency = meta.currency;

            if (!livePrice) throw new Error("Kein Kurs im Datenpaket.");

            // Wenn die Aktie in USD (oder anderer Währung) notiert ist, rechnen wir live in EUR um
            if (currency !== 'EUR') {
              var fxProxyUrl = "https://yahoo-proxy.spamispam018.workers.dev/?ticker=EUR" + currency + "=X";
              
              fetch(fxProxyUrl)
                .then(function(fxRes) { return fxRes.json(); })
                .then(function(fxData) {
                  if (fxData.chart && fxData.chart.result && fxData.chart.result.length > 0) {
                    var fxRate = fxData.chart.result[0].meta.regularMarketPrice;
                    if (fxRate) {
                      livePrice = livePrice / fxRate;
                      prevClose = prevClose / fxRate;
                      updatePriceUI(livePrice, prevClose, 'EUR');
                    } else {
                      updatePriceUI(livePrice, prevClose, currency);
                    }
                  } else {
                    updatePriceUI(livePrice, prevClose, currency);
                  }
                })
                .catch(function() { updatePriceUI(livePrice, prevClose, currency); });
            } else {
              updatePriceUI(livePrice, prevClose, currency);
            }

            function updatePriceUI(price, prev, curr) {
              // 1. Header aktualisieren
              var priceEl = document.getElementById('stock-header-price');
              var changeEl = document.getElementById('stock-header-change');
              if (priceEl && changeEl) {
                priceEl.textContent = window.App.Format.currency(price, curr);
                var pct = ((price - prev) / prev) * 100;
                var chgCls = window.App.Format.changeClass(pct);
                var sign = pct >= 0 ? '+' : '';
                changeEl.className = 'badge-pill ' + chgCls;
                changeEl.textContent = sign + window.App.Format.number(pct, 2) + ' %';
              }

              // 2. Daten im Speicher aktualisieren
              currentStock.quote.price = price;
              currentStock.quote.changePercent = ((price - prev) / prev) * 100;
              currentStock.quote.currency = curr;

              // 3. Zeitstempel auf JETZT setzen
              var now = new Date();
              currentStock.updatedAt = now.toISOString();
              var tsEl = document.getElementById('overview-timestamp');
              if (tsEl) {
                var formatted = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' +
                                now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
                tsEl.textContent = 'Stand: ' + formatted;
              }

              // 4. Den Live-Preis an die Chart-History anhängen (oder heutigen Tag überschreiben)
              var todayStr = now.toISOString().slice(0, 10);
              var history = currentStock.chartHistory || [];
              var lastEntry = history[history.length - 1];
              
              if (lastEntry && lastEntry.date === todayStr) {
                // Wenn der letzte Eintrag von heute ist, überschreiben wir ihn mit dem Live-Preis
                lastEntry.close = price;
              } else {
                // Sonst fügen wir einen neuen Punkt für heute hinzu
                history.push({ date: todayStr, close: price });
              }
              currentStock.chartHistory = history;

              // 5. Chart und Performance-Kacheln neu zeichnen
              drawPriceChart();
              updatePerfGrid();

              // Button zurücksetzen
              refreshBtn.innerHTML = originalHtml;
              refreshBtn.disabled = false;
            }
          })
          .catch(function(err) {
            console.error(err);
            refreshBtn.innerHTML = originalHtml;
            refreshBtn.disabled = false;
            alert('Live-Kurs konnte nicht geladen werden. Der Proxy hat eventuell ein Problem beim Abruf gemeldet.');
          });
      };
    }

    if (!isDataMissing) {
        longHistory = null;
        drawPriceChart();
        updatePerfGrid();
        drawFinancialsChart(financials);
        bindPeriodPillEvents(container);

        var loadingTicker = stock.ticker;
        window.App.Data.getLongHistory(loadingTicker).then(function (pts) {
          if (!currentStock || currentStock.ticker !== loadingTicker) return;
          longHistory = pts || [];
          updatePerfGrid();
          if (currentPeriod === '5Y' || currentPeriod === '10Y') drawPriceChart();
        });
    }
  }

  function renderMetricsHtml(quote, ratios, peTrailingDisplay, forwardPeDisplay, divYieldDisplay, isDataMissing) {
    return '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Bewertungs- &amp; Marktkennzahlen</span>' +
          '<span class="period-tag">Aktuell</span>' +
        '</div>' +
        '<div class="metrics-grid-2col">' +
          '<div class="metric-cell"><span class="metric-label">Marktkapitalisierung:</span><span class="metric-value">' + window.App.Format.compactNumber(quote.marketCap, quote.currency) + '</span></div>' +
          '<div class="metric-cell"><span class="metric-label">KGV (Trailing):</span><span class="metric-value">' + peTrailingDisplay + '</span></div>' +
          '<div class="metric-cell"><span class="metric-label">Forward KGV:</span><span class="metric-value">' + forwardPeDisplay + '</span></div>' +
          '<div class="metric-cell"><span class="metric-label">Dividendenrendite:</span><span class="metric-value">' + divYieldDisplay + '</span></div>' +
          '<div class="metric-cell"><span class="metric-label">52W Tief:</span><span class="metric-value">' + window.App.Format.currency(quote.fiftyTwoWeekLow, quote.currency) + '</span></div>' +
          '<div class="metric-cell"><span class="metric-label">52W Hoch:</span><span class="metric-value">' + window.App.Format.currency(quote.fiftyTwoWeekHigh, quote.currency) + '</span></div>' +
        '</div>' +
        (!isDataMissing ? renderFiftyTwoWeekRange(quote.price, quote.fiftyTwoWeekLow, quote.fiftyTwoWeekHigh, quote.currency) : '') +
      '</div>';
  }

  function renderEtfHoldingsHtml(holdings) {
    if (!holdings || !Array.isArray(holdings) || holdings.length === 0) return '';
    var html = '' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Größte Positionen (Top Holdings)</span>' +
          '<span class="period-tag">ETF Bestand</span>' +
        '</div>' +
        '<div style="display: flex; flex-direction: column; gap: 8px;">';

    holdings.forEach(function (h) {
      var w = Math.max(0, Math.min(100, h.weight || 0));
      html += '' +
        '<div style="display: flex; flex-direction: column; gap: 2px;">' +
          '<div style="display: flex; justify-content: space-between; font-size: 0.78rem;">' +
            '<span style="font-weight: 600; color: var(--text-main);">' + esc(h.name) + '</span>' +
            '<span style="font-variant-numeric: tabular-nums; font-weight: 700;">' + window.App.Format.number(w, 2) + ' %</span>' +
          '</div>' +
          '<div style="height: 6px; width: 100%; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden;">' +
            '<div style="height: 100%; width: ' + w + '%; background: var(--accent-purple-light, #818cf8); border-radius: 3px;"></div>' +
          '</div>' +
        '</div>';
    });

    html += '</div></div>';
    return html;
  }

  function renderFiftyTwoWeekRange(price, low, high, currency) {
    if (!price || !low || !high || high <= low) return '';
    var pct = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
    return '' +
      '<div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--border-subtle);">' +
        '<div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-dim); margin-bottom: 6px;">' +
          '<span>52W-Spanne</span>' +
          '<span>Aktuell: ' + window.App.Format.currency(price, currency) + ' (' + pct.toFixed(0) + ' %)</span>' +
        '</div>' +
        '<div style="height: 6px; width: 100%; background: var(--bg-tertiary); border-radius: 3px; position: relative; overflow: visible;">' +
          '<div style="height: 100%; width: ' + pct + '%; background: linear-gradient(90deg, var(--bearish), var(--bullish)); border-radius: 3px;"></div>' +
          '<div style="position: absolute; left: calc(' + pct + '% - 5px); top: -3px; width: 10px; height: 12px; background: #fff; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.5);"></div>' +
        '</div>' +
      '</div>';
  }

  function renderInsiderSummaryBar(sum) {
    if (!sum) sum = { buysCount2Q: 0, sellsCount2Q: 0, buyValueTotal: 0, sellValueTotal: 0 };
    var buyVal = sum.buyValueTotal || 0;
    var sellVal = sum.sellValueTotal || 0;
    var total = buyVal + sellVal;
    var buyPct = total > 0 ? (buyVal / total) * 100 : 50;
    var sellPct = total > 0 ? (sellVal / total) * 100 : 50;
    return '' +
      '<div style="margin-top: 6px;">' +
        '<div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 6px;">' +
          '<span style="color: var(--bullish); font-weight: 700;">' + sum.buysCount2Q + ' Käufe (' + window.App.Format.compactNumber(buyVal, 'EUR') + ')</span>' +
          '<span style="color: var(--bearish); font-weight: 700;">' + sum.sellsCount2Q + ' Verkäufe (' + window.App.Format.compactNumber(sellVal, 'EUR') + ')</span>' +
        '</div>' +
        '<div style="height: 8px; width: 100%; display: flex; border-radius: 4px; overflow: hidden; background: var(--bg-tertiary);">' +
          '<div style="height: 100%; width: ' + buyPct + '%; background: var(--bullish);"></div>' +
          '<div style="height: 100%; width: ' + sellPct + '%; background: var(--bearish);"></div>' +
        '</div>' +
      '</div>';
  }

  function drawPriceChart() {
    var canvas = document.getElementById('overview-price-canvas');
    if (!canvas || !currentStock) return;

    var filtered = getPeriodSeries(currentPeriod);
    var isLong = (currentPeriod === '5Y' || currentPeriod === '10Y');

    if (filtered === null || filtered.length < 2) {
      var setupCtx = canvas.getContext('2d');
      var w = canvas.parentElement ? canvas.parentElement.clientWidth : 300;
      canvas.width = w; canvas.height = 180;
      canvas.style.width = w + 'px'; canvas.style.height = '180px';
      setupCtx.clearRect(0, 0, w, 180);
      setupCtx.fillStyle = '#64748b';
      setupCtx.font = '12px sans-serif';
      setupCtx.textAlign = 'center';
      setupCtx.fillText(
        isLong && longHistory === null ? 'Lade Langzeitdaten…' : 'Langzeitdaten noch nicht verfügbar (nächstes Update)',
        w / 2, 90
      );
      return;
    }

    var cur = currentStock.quote ? currentStock.quote.currency : 'EUR';
    window.App.Charts.renderLineChart(canvas, {
      labels: filtered.map(function (p) { var d = String(p.date || ''); return d.slice(5, 7) + '/' + d.slice(2, 4); }),
      values: filtered.map(function (p) { return p.close; }),
      formatY: function (v) { return window.App.Format.currency(v, cur, 0); }
    });
  }

  function getPeriodSeries(period) {
    if (period === '5Y' || period === '10Y') {
      if (!longHistory || longHistory.length < 2) return null;
      if (period === '10Y') return longHistory;
      var last = longHistory[longHistory.length - 1].date;
      var cutoff = (parseInt(last.slice(0, 4), 10) - 5) + last.slice(4);
      return longHistory.filter(function (p) { return p.date >= cutoff; });
    }
    return sliceHistoryByPeriod((currentStock && currentStock.chartHistory) || [], period);
  }

  function updatePerfGrid() {
    var grid = document.getElementById('overview-perf-grid');
    if (!grid || !currentStock) return;
    
    var periods = [['1W', '1W'], ['1M', '1M'], ['3M', '3M'], ['6M', '6M'], ['1Y', '1J'], ['5Y', '5J'], ['10Y', '10J']];
    var html = '';
    
    grid.style.display = 'flex';
    grid.style.flexWrap = 'wrap';
    grid.style.gap = '8px';
    
    periods.forEach(function (pd) {
      var series = getPeriodSeries(pd[0]);
      var txt = '—';
      var cls = '';
      if (series && series.length >= 2 && series[0].close) {
        var pct = (series[series.length - 1].close / series[0].close - 1) * 100;
        txt = (pct >= 0 ? '+' : '') + window.App.Format.number(pct, 1) + ' %';
        cls = pct >= 0 ? 'up' : 'down';
      } else if ((pd[0] === '5Y' || pd[0] === '10Y') && longHistory === null) {
        txt = '…';
      }
      
      html += '<div class="perf-cell ' + cls + (pd[0] === currentPeriod ? ' selected' : '') + '" style="flex: 1 1 calc(25% - 8px); min-width: 60px;">' +
        '<span class="perf-label">' + pd[1] + '</span>' +
        '<span class="perf-value">' + txt + '</span></div>';
    });
    grid.innerHTML = html;
  }

  function sliceHistoryByPeriod(history, period) {
    if (!history || history.length === 0) return [];
    var days = { '1W': 7, '1M': 30, '3M': 91, '6M': 182, '1Y': 365 };
    var span = days[period] || 365;
    var last = history[history.length - 1];
    var t = new Date(last.date + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() - span);
    var cutoff = t.toISOString().slice(0, 10);
    var start = 0;
    for (var i = 0; i < history.length; i++) {
      if (history[i].date <= cutoff) start = i; else break;
    }
    return history.slice(start);
  }

  function drawFinancialsChart(financials) {
    var canvas = document.getElementById('overview-financials-canvas');
    if (!canvas) return;

    var incQuarterly = (financials.incomeStatement && financials.incomeStatement.quarterly) ? financials.incomeStatement.quarterly : [];
    var recent = incQuarterly.slice(-6);
    if (recent.length === 0) {
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Keine Quartalsfinanzdaten verfügbar', canvas.width / 2, canvas.height / 2);
      return;
    }

    var labels = recent.map(function (item) { return (item.date || '').slice(2, 7); });
    var revenues = recent.map(function (item) { return item.Total_Revenue || item.Operating_Revenue || 0; });

    window.App.Charts.renderGroupedBarChart(canvas, {
      labels: labels,
      series: [{ name: 'Umsatz', data: revenues, color: 'rgba(99, 102, 241, 0.85)' }],
      formatY: function (v) { return window.App.Format.axisMoney(v); }
    });
  }

  function bindPeriodPillEvents(container) {
    var pills = container.querySelectorAll('#overview-period-pills .pill-btn');
    pills.forEach(function (pill) {
      pill.onclick = function () {
        pills.forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        currentPeriod = pill.getAttribute('data-period');
        drawPriceChart();
        updatePerfGrid();
      };
    });
  }

  function getSentimentColor(sentiment) {
    if (sentiment === 'Bullish') return 'var(--bullish)';
    if (sentiment === 'Bearish') return 'var(--bearish)';
    return 'var(--text-muted)';
  }

  return {
    render: render
  };
})();
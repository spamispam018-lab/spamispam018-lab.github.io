/**
 * js/stock-overview.js
 * Verwaltet den Tab "Overview" der Aktiendetailansicht:
 * - Bewertungs- und Marktkennzahlen (mit sauberer Behandlung von fehlendem/negativem KGV)
 * - 52-Wochen-Spannenbalken
 * - Inline-Chart mit Umschalt-Pillen (1W, 1M, 3M, 6M, 1J)
 * - Kompakte Insider-Aktivitätskarte mit Stimmungsbalken
 * - Quartalsweiser Finanztrend (Umsatz & Nettoergebnis)
 * - KI-Analyse Banner (öffnet Gemini mit generiertem Prompt inkl. technischem Bild)
 * - Aktualisieren-Button zum Triggern der GitHub Action (nur für diesen Ticker) inkl. Timestamp
 */

window.App = window.App || {};

window.App.StockOverview = (function () {
  'use strict';

  var currentStock = null;
  var currentPeriod = '1Y';
  var longHistory = null; // null = lädt noch, [] = nicht vorhanden

  /**
   * Haupt-Renderfunktion für die Overview-Ansicht.
   * @param {HTMLElement} container - Ziel-DOM-Element
   * @param {Object} stock - Vollständiges Datenobjekt der Aktie
   */
  function render(container, stock) {
    if (!container || !stock) return;
    currentStock = stock;

    var quote = stock.quote || {};
    var ratios = stock.ratios || {};
    var insider = stock.insider || { summary: {}, trades: [] };
    var financials = stock.financials || {};

    // Trailing-KGV prüfen: Wenn kein positiver Wert vorliegt, aber ein Forward-KGV existiert oder Verluste vorliegen
    var peTrailingDisplay;
    if (ratios.peTrailing !== null && ratios.peTrailing !== undefined && ratios.peTrailing > 0) {
      peTrailingDisplay = window.App.Format.number(ratios.peTrailing, 1);
    } else if (ratios.peForward || ratios.profitMargins < 0) {
      peTrailingDisplay = '<span style="color: var(--bearish); font-size: 0.78rem; font-weight: 600;">Negativ (Verlust)</span>';
    } else {
      peTrailingDisplay = '—';
    }

    var forwardPeDisplay = (ratios.peForward && ratios.peForward > 0)
      ? window.App.Format.number(ratios.peForward, 1)
      : '—';

    var divYieldDisplay = (ratios.dividendYield !== null && ratios.dividendYield !== undefined && ratios.dividendYield > 0)
      ? window.App.Format.number(ratios.dividendYield, 2) + ' %'
      : '0,00 %';

    // Aktualisierungsdatum formatieren
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
          '<button id="btn-ask-gemini" class="chip-btn active" style="background: var(--accent-purple); border-color: var(--accent-purple); font-size: 0.75rem; flex-shrink: 0; box-shadow: 0 4px 14px var(--accent-purple-glow);">Fragen</button>' +
        '</div>' +
      '</div>' +

      '<!-- Daten aktualisieren Button (GitHub Action Trigger - Single Ticker) & Zeitstempel -->' +
      '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">' +
        '<div style="font-size: 0.7rem; color: var(--text-dim);">Stand: ' + updatedAtDisplay + '</div>' +
        '<button id="btn-refresh-stock" class="chip-btn" style="font-size: 0.72rem; display: flex; align-items: center; gap: 6px;">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>' +
          'Live-Kurs abrufen' +
        '</button>' +
      '</div>' +

      '<div id="news-card"></div>' +
      '<!-- 1. Bewertungs- & Marktkennzahlen -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Bewertungs- &amp; Marktkennzahlen</span>' +
          '<span class="period-tag">Aktuell</span>' +
        '</div>' +
        '<div class="metrics-grid-2col">' +
          '<div class="metric-cell">' +
            '<span class="metric-label">Marktkapitalisierung:</span>' +
            '<span class="metric-value">' + window.App.Format.compactNumber(quote.marketCap, quote.currency) + '</span>' +
          '</div>' +
          '<div class="metric-cell">' +
            '<span class="metric-label">KGV (Trailing):</span>' +
            '<span class="metric-value">' + peTrailingDisplay + '</span>' +
          '</div>' +
          '<div class="metric-cell">' +
            '<span class="metric-label">Forward KGV:</span>' +
            '<span class="metric-value">' + forwardPeDisplay + '</span>' +
          '</div>' +
          '<div class="metric-cell">' +
            '<span class="metric-label">Dividendenrendite:</span>' +
            '<span class="metric-value">' + divYieldDisplay + '</span>' +
          '</div>' +
          '<div class="metric-cell">' +
            '<span class="metric-label">52W Tief:</span>' +
            '<span class="metric-value">' + window.App.Format.currency(quote.fiftyTwoWeekLow, quote.currency) + '</span>' +
          '</div>' +
          '<div class="metric-cell">' +
            '<span class="metric-label">52W Hoch:</span>' +
            '<span class="metric-value">' + window.App.Format.currency(quote.fiftyTwoWeekHigh, quote.currency) + '</span>' +
          '</div>' +
        '</div>' +
        renderFiftyTwoWeekRange(quote.price, quote.fiftyTwoWeekLow, quote.fiftyTwoWeekHigh, quote.currency) +
      '</div>' +

      '<!-- 2. Kursverlauf Chart -->' +
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

      '<!-- 3. Insider-Aktivität Kurzüberblick -->' +
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

      '<!-- 4. Quartals-Trend (Finanzen) -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Financials Trend</span>' +
          '<span class="period-tag">TTM / Quartale</span>' +
        '</div>' +
        '<div style="height: 160px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="overview-financials-canvas"></canvas>' +
        '</div>' +
      '</div>';

    container.innerHTML = html;
    if (window.App.News) window.App.News.fillTicker(stock.ticker, container.querySelector('#news-card'));

    // Gemini Event Listener binden
    var geminiBtn = container.querySelector('#btn-ask-gemini');
    if (geminiBtn) {
      geminiBtn.onclick = function() {
        var sName = currentStock.profile.name || currentStock.ticker;
        var sTicker = currentStock.ticker;
        var sPrice = window.App.Format.currency(currentStock.quote.price, currentStock.quote.currency);
        var sChange = window.App.Format.number(currentStock.quote.changePercent, 2) + ' %';
        var sPe = (currentStock.ratios && currentStock.ratios.peTrailing) ? window.App.Format.number(currentStock.ratios.peTrailing, 1) : 'unbekannt';

        var promptText = "Hallo Gemini! Bitte prüfe zuerst meine Daten. Kannst du mir danach bitte erklären, warum sich der Aktienkurs von " + sName + " (" + sTicker + ") aktuell so verhält? " +
                         "Der Kurs liegt bei " + sPrice + " mit einer heutigen Änderung von " + sChange + ". Das KGV beträgt " + sPe + ". ";

        if (currentStock.chartHistory && currentStock.chartHistory.length > 60 && window.App.StockChart) {
            var hist = currentStock.chartHistory.filter(function (p) { return p && p.close > 0; });
            var closes = hist.map(function (p) { return p.close; });
            var n = closes.length;
            var cPrice = closes[n - 1];

            var s50 = window.App.StockChart._sma(closes, 50);
            var s200 = window.App.StockChart._sma(closes, 200);
            var rsiArr = window.App.StockChart._rsi(closes, 14);
            var m = window.App.StockChart._macd(closes);

            function lastValid(arr) {
                for (var i = arr.length - 1; i >= 0; i--) {
                    if (arr[i] !== null && arr[i] !== undefined && isFinite(arr[i])) return arr[i];
                }
                return null;
            }

            var s50Last = lastValid(s50);
            var s200Last = lastValid(s200);
            var rsiLast = lastValid(rsiArr);
            var macdLast = lastValid(m.line);
            var sigLast = lastValid(m.signal);
            var mom3m = n > 63 ? (cPrice / closes[n - 1 - 63] - 1) * 100 : null;

            var techText = "Hier ist das aktuelle technische Bild: ";
            if (s200Last !== null) techText += "Der Abstand zur 200-Tage-Linie beträgt " + window.App.Format.number((cPrice / s200Last - 1) * 100, 1) + " %. ";
            if (s50Last !== null) techText += "Der Abstand zur 50-Tage-Linie beträgt " + window.App.Format.number((cPrice / s50Last - 1) * 100, 1) + " %. ";
            if (rsiLast !== null) techText += "Der RSI (14) liegt bei " + window.App.Format.number(rsiLast, 0) + ". ";
            if (macdLast !== null && sigLast !== null) {
                techText += "Der MACD liegt " + (macdLast > sigLast ? "über" : "unter") + " der Signallinie. ";
            }
            if (mom3m !== null) techText += "Das Momentum auf 3 Monate liegt bei " + window.App.Format.number(mom3m, 1) + " %. ";

            var bc = window.App.StockChart._bottom(closes);
            if (bc && bc.state) techText += "Boden-Check: " + ({ base: 'Bodenbildung möglich', knife: 'fallendes Messer', wait: 'unklar' })[bc.state] + " (" + bc.score + " von 6 Stabilisierungs-Signalen, " + window.App.Format.number(Math.abs(bc.dd) * 100, 0) + " % unter dem 52W-Hoch). ";
            if (window.App.ChartAnalyse) techText += window.App.ChartAnalyse.promptText(currentStock);
            promptText += techText;
        }

        var nws = window.App.News && window.App.News.promptBlock(sTicker, 5);
        if (nws) promptText += "\n\nAktuelle Nachrichten (englisch, mit automatischer FinBERT-Stimmungseinschätzung):\n" + nws + "\nBitte beziehe diese Nachrichten in deine Erklärung und Bewertung ein. ";
        promptText += "Bitte gib mir eine Bewertung der Aktie anhand dieser fundamentalen und technischen Daten und der aktuellen Marktlage.";
        
        var urlText = promptText.length > 1800 ? "Hallo Gemini! Mein Prompt mit Kursdaten und aktuellen Nachrichten liegt in der Zwischenablage – bitte einfügen und absenden." : promptText;
        var geminiUrl = "https://gemini.google.com/app?q=" + encodeURIComponent(urlText);
        
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(promptText).then(function() {
                window.open(geminiUrl, '_blank');
            }).catch(function() {
                window.open(geminiUrl, '_blank');
            });
        } else {
            window.open(geminiUrl, '_blank');
        }
      };
    }

    // GitHub Action Trigger & Refresh Event Listener (Single Ticker)
    var refreshBtn = container.querySelector('#btn-refresh-stock');
    if (refreshBtn) {
      refreshBtn.onclick = function() {
        var token = localStorage.getItem('GITHUB_PAT');
        
        if (!token) {
            token = prompt("Um Live-Daten abzurufen, gib bitte dein GitHub Personal Access Token (mit 'repo' Berechtigung) ein.\n\nEs wird sicher nur lokal in deinem Browser (localStorage) gespeichert.");
            if (token) {
                localStorage.setItem('GITHUB_PAT', token);
            } else {
                return; // Abbruch durch Nutzer
            }
        }

        var originalHtml = refreshBtn.innerHTML;
        // Zeige Trigger-Zustand
        refreshBtn.innerHTML = '<div class="spinner" style="width: 14px; height: 14px; border-width: 2px; display: inline-block; vertical-align: middle; margin-right: 6px;"></div> Action startet...';
        refreshBtn.disabled = true;

        var workflowFilename = 'update_data.yml';
        var githubApiUrl = 'https://api.github.com/repos/spamispam018-lab/spamispam018-lab.github.io/actions/workflows/' + workflowFilename + '/dispatches';

        // 1. GitHub Action via API triggern (nur für currentStock.ticker)
        fetch(githubApiUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': 'token ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ref: 'main',
                inputs: { 
                    sync_mode: 'delta',
                    ticker: currentStock.ticker
                }
            })
        })
        .then(function(response) {
            if (!response.ok) {
                if (response.status === 401 || response.status === 403 || response.status === 404) {
                    localStorage.removeItem('GITHUB_PAT');
                    throw new Error("Token ungültig, abgelaufen oder fehlende Berechtigungen. Bitte Seite neu laden und erneut versuchen.");
                }
                throw new Error("GitHub API Fehler: " + response.status);
            }
            
            // 2. Action läuft -> Da es nur ein Ticker ist, reicht eine kürzere Wartezeit (15 Sekunden)
            refreshBtn.innerHTML = '<div class="spinner" style="width: 14px; height: 14px; border-width: 2px; display: inline-block; vertical-align: middle; margin-right: 6px;"></div> Warte auf Yahoo (15s)...';
            
            setTimeout(function() {
                // 3. Nach Wartezeit die aktualisierten JSON-Daten auslesen (Cache bypassen)
                window.App.Data.getStock(currentStock.ticker)
                  .then(function(updatedStock) {
                    // Header der Detailansicht aktualisieren
                    var priceEl = document.getElementById('stock-header-price');
                    var changeEl = document.getElementById('stock-header-change');
                    if (priceEl && changeEl && updatedStock.quote) {
                        priceEl.textContent = window.App.Format.currency(updatedStock.quote.price, updatedStock.quote.currency);
                        var chgCls = window.App.Format.changeClass(updatedStock.quote.changePercent);
                        var sign = (updatedStock.quote.changePercent >= 0) ? '+' : '';
                        changeEl.className = 'badge-pill ' + chgCls;
                        changeEl.textContent = sign + window.App.Format.number(updatedStock.quote.changePercent, 2) + ' %';
                    }
                    // Overview-Tab neu rendern
                    window.App.StockOverview.render(container, updatedStock);
                  })
                  .catch(function(err) {
                    console.error("Fehler beim Laden der neuen Daten:", err);
                    refreshBtn.innerHTML = originalHtml;
                    refreshBtn.disabled = false;
                    alert('Die Action wurde gestartet, aber die neuen Daten konnten noch nicht geladen werden. Bitte in wenigen Momenten nochmal versuchen.');
                  });
            }, 15000); // 15 Sekunden warten
        })
        .catch(function(err) {
            console.error(err);
            refreshBtn.innerHTML = originalHtml;
            refreshBtn.disabled = false;
            alert(err.message);
        });
      };
    }

    // Charts zeichnen und Events verdrahten
    longHistory = null;
    drawPriceChart();
    updatePerfGrid();
    drawFinancialsChart(financials);
    bindPeriodPillEvents(container);

    // Langzeit-Historie (5/10 Jahre) nachladen
    var loadingTicker = stock.ticker;
    window.App.Data.getLongHistory(loadingTicker).then(function (pts) {
      if (!currentStock || currentStock.ticker !== loadingTicker) return;
      longHistory = pts || [];
      updatePerfGrid();
      if (currentPeriod === '5Y' || currentPeriod === '10Y') drawPriceChart();
    });
  }

  /**
   * Rendert den 52-Wochen-Spannenbalken mit relativem Zeiger auf den aktuellen Kurs.
   */
  function renderFiftyTwoWeekRange(price, low, high, currency) {
    if (!price || !low || !high || high <= low) return '';

    var pct = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));

    return '' +
      '<div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--border-subtle);">' +
        '<div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-dim); margin-bottom: 6px;">' +
          '<span>52W-Spanne</span>' +
          '<span>Aktuell: ' + window.App.Format.currency(price, currency) + ' (' + pct.toFixed(0) + ' %)</span>' +
        '</div>' +
        '<div style="height: 6px; width: 100%; background: var(--bg-surface-elevated); border-radius: 3px; position: relative; overflow: visible;">' +
          '<div style="height: 100%; width: ' + pct + '%; background: linear-gradient(90deg, var(--bearish), var(--bullish)); border-radius: 3px;"></div>' +
          '<div style="position: absolute; left: calc(' + pct + '% - 5px); top: -3px; width: 10px; height: 12px; background: #fff; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.5);"></div>' +
        '</div>' +
      '</div>';
  }

  /**
   * Rendert das Verhältnis von Insider-Käufen zu -Verkäufen.
   */
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
        '<div style="height: 8px; width: 100%; display: flex; border-radius: 4px; overflow: hidden; background: var(--bg-surface-elevated);">' +
          '<div style="height: 100%; width: ' + buyPct + '%; background: var(--bullish);"></div>' +
          '<div style="height: 100%; width: ' + sellPct + '%; background: var(--bearish);"></div>' +
        '</div>' +
      '</div>';
  }

  /**
   * Zeichnet den Kursverlauf über window.App.Charts.
   */
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

  /**
   * Liefert die Kursreihe für eine Periode oder null, wenn Langzeitdaten fehlen.
   */
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

  /**
   * Prozentuale Veränderung je Zeitraum (1W … 10J) unter dem Chart.
   */
  function updatePerfGrid() {
    var grid = document.getElementById('overview-perf-grid');
    if (!grid || !currentStock) return;
    
    // 1W zur Liste der Kacheln hinzugefügt
    var periods = [['1W', '1W'], ['1M', '1M'], ['3M', '3M'], ['6M', '6M'], ['1Y', '1J'], ['5Y', '5J'], ['10Y', '10J']];
    var html = '';
    
    // Da wir 7 Kacheln haben, ordnen wir sie am besten flexibel an (z.B. 4 oben, 3 unten)
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

  /**
   * Schneidet den Kursverlauf auf die gewählte Periode zu.
   */
  function sliceHistoryByPeriod(history, period) {
    if (!history || history.length === 0) return [];
    // Kalenderbasiert (wie Yahoo & Marktübersicht): Basis ist der letzte Schlusskurs
    // am oder vor dem Stichtag (Enddatum minus Zeitraum)
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

  /**
   * Zeichnet den Quartals-Umsatztrend.
   */
  function drawFinancialsChart(financials) {
    var canvas = document.getElementById('overview-financials-canvas');
    if (!canvas) return;

    var incQuarterly = (financials.incomeStatement && financials.incomeStatement.quarterly)
      ? financials.incomeStatement.quarterly
      : [];

    var recent = incQuarterly.slice(-6);
    if (recent.length === 0) {
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Keine Quartalsfinanzdaten verfügbar', canvas.width / 2, canvas.height / 2);
      return;
    }

    var labels = recent.map(function (item) {
      return (item.date || '').slice(2, 7);
    });

    var revenues = recent.map(function (item) {
      return item.Total_Revenue || item.Operating_Revenue || 0;
    });

    window.App.Charts.renderGroupedBarChart(canvas, {
      labels: labels,
      series: [{ name: 'Umsatz', data: revenues, color: 'rgba(99, 102, 241, 0.85)' }],
      formatY: function (v) { return window.App.Format.axisMoney(v); }
    });
  }

  /**
   * Bindet die Klick-Events auf die Zeitbereich-Pillen.
   */
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


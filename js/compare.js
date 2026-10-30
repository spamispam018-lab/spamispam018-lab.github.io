/**
 * js/compare.js
 * Ermöglicht den direkten Vergleich von 2 bis 4 Aktien:
 * - Ticker-Auswahl über Schnellauswahl oder Direkteingabe (mit Autocomplete-Suche & localStorage-Persistenz)
 * - Normierter Kursvergleich (Basis 100 %) als Canvas-Liniendiagramm inkl. Zeitbereich-Steuerung
 * - Gegenüberstellung der Kernmetriken (Bewertung, Wachstum, Margen, Verschuldung)
 * - Margenvergleich als gruppiertes Balkendiagramm
 * - KI-Vergleichsanalyse mit Gemini (inkl. technischem Bild aller Werte)
 */

window.App = window.App || {};

window.App.Compare = (function () {
  'use strict';

  var STORAGE_KEY = 'app_compare_tickers';
  var selectedTickers = ['AAPL', 'MSFT'];
  var loadedStocksData = {};
  var currentPeriod = '1Y'; // Standardzeitraum für den Chart

  var COLOR_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ec4899'];

  /**
   * Speichert die aktuelle Auswahl persistent im Browser.
   */
  function saveTickers() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedTickers));
    } catch (e) {}
  }

  /**
   * Lädt die gespeicherte Auswahl aus dem Browser.
   */
  function loadSavedTickers() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          selectedTickers = parsed.slice(0, 4);
        }
      }
    } catch (e) {}
  }

  /**
   * Initialisiert die Compare-View.
   */
  function initView(params) {
    var container = document.getElementById('app-view-content');
    if (!container) return;

    var headerFilterBtn = document.getElementById('btn-header-filter');
    if (headerFilterBtn) {
      headerFilterBtn.style.display = 'none';
    }

    if (params && params.tickers) {
      selectedTickers = params.tickers.split(',').slice(0, 4);
      saveTickers();
    } else if (params && params.ticker) {
      if (selectedTickers.indexOf(params.ticker) === -1) {
        selectedTickers[0] = params.ticker;
      }
      saveTickers();
    } else {
      loadSavedTickers();
    }

    renderShell(container);
    loadAndRenderComparison();
  }

  /**
   * Erzeugt das Grundgerüst der Vergleichsansicht.
   */
  function renderShell(container) {
    var html = '' +
      '<div class="view-container">' +
        '<!-- Header & Ticker Chips -->' +
        '<div style="margin-bottom: 16px;">' +
          '<h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">Aktienvergleich</h2>' +
          '<div style="font-size: 0.78rem; color: var(--text-dim);">2 bis 4 Unternehmen im direkten Kennzahlen- &amp; Performance-Vergleich</div>' +
        '</div>' +

        '<div class="card" style="padding: 12px; margin-bottom: 14px; position: relative; overflow: visible;">' +
          '<div style="font-size: 0.72rem; color: var(--text-dim); margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">Ausgewählte Titel</div>' +
          '<div id="compare-chips-container" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;"></div>' +
          '<div style="display: flex; gap: 8px; margin-top: 10px; position: relative;">' +
            '<input type="text" id="compare-add-input" class="search-input" placeholder="Name oder Ticker suchen..." style="height: 38px; padding-left: 14px; flex: 1;" autocomplete="off">' +
            '<!-- Dropdown für Suchergebnisse -->' +
            '<div id="compare-autocomplete" style="display: none; position: absolute; top: 44px; left: 0; right: 0; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); max-height: 240px; overflow-y: auto; z-index: 1000; box-shadow: 0 10px 25px rgba(0,0,0,0.5);"></div>' +
          '</div>' +
        '</div>' +

        '<div id="compare-content-area">' +
          '<div class="state-box"><div class="spinner"></div><p>Lade Vergleichsdaten...</p></div>' +
        '</div>' +
      '</div>';

    container.innerHTML = html;
    bindInputEvents();
  }

  /**
   * Lädt die Detaildaten für alle ausgewählten Aktien parallel.
   */
  function loadAndRenderComparison() {
    renderChips();
    var contentArea = document.getElementById('compare-content-area');
    if (!contentArea) return;

    if (selectedTickers.length === 0) {
      contentArea.innerHTML = '<div class="state-box"><p>Wähle mindestens eine Aktie zum Vergleich aus.</p></div>';
      return;
    }

    var promises = selectedTickers.map(function (ticker) {
      return window.App.Data.getStock(ticker).catch(function () {
        return null;
      });
    });

    Promise.all(promises).then(function (results) {
      loadedStocksData = {};
      var validStocks = [];

      results.forEach(function (st, idx) {
        if (st && st.ticker) {
          loadedStocksData[st.ticker] = st;
          validStocks.push(st);
        } else {
          var t = selectedTickers[idx];
          var dummy = { ticker: t, profile: { name: t }, quote: { price: 0 }, ratios: {} };
          loadedStocksData[t] = dummy;
          validStocks.push(dummy);
        }
      });

      renderComparisonResults(contentArea, validStocks);
    });
  }

  /**
   * Rendert Ticker-Chips mit Lösch-Funktion.
   */
  function renderChips() {
    var container = document.getElementById('compare-chips-container');
    if (!container) return;

    var html = '';
    selectedTickers.forEach(function (ticker, idx) {
      var color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
      html += '' +
        '<span class="chip-btn" style="border-color:' + color + '; color:#fff; background: rgba(255,255,255,0.05);">' +
          '<span style="width:8px; height:8px; border-radius:50%; background:' + color + ';"></span>' +
          '<strong>' + ticker + '</strong>' +
          '<span data-remove-ticker="' + ticker + '" style="cursor:pointer; margin-left:4px; opacity:0.7;">&times;</span>' +
        '</span>';
    });

    container.innerHTML = html;

    var removeBtns = container.querySelectorAll('[data-remove-ticker]');
    removeBtns.forEach(function (btn) {
      btn.onclick = function () {
        var t = btn.getAttribute('data-remove-ticker');
        selectedTickers = selectedTickers.filter(function (item) { return item !== t; });
        saveTickers();
        loadAndRenderComparison();
      };
    });
  }

  /**
   * Hilfsfunktion zum Hinzufügen einer Aktie, Speichern und Neuladen.
   */
  function addTickerToCompare(ticker) {
    if (!ticker) return;
    var upperTicker = ticker.toUpperCase().trim();
    if (selectedTickers.indexOf(upperTicker) === -1) {
      if (selectedTickers.length >= 4) {
        alert('Maximal 4 Aktien gleichzeitig im Vergleich.');
        return;
      }
      selectedTickers.push(upperTicker);
      saveTickers();
      loadAndRenderComparison();
    }
  }

  /**
   * Bindet das Hinzufügen weiterer Ticker inkl. Autocomplete-Suche.
   */
  function bindInputEvents() {
    var addInput = document.getElementById('compare-add-input');
    var autocompleteBox = document.getElementById('compare-autocomplete');
    var universe = [];

    window.App.Data.getUniverse().then(function(data) {
      universe = data || [];
    });

    if (addInput) {
      addInput.oninput = function (e) {
        var query = e.target.value.toLowerCase().trim();
        
        if (!query) {
          autocompleteBox.style.display = 'none';
          return;
        }

        var matches = universe.filter(function (item) {
          var tick = (item.ticker || '').toLowerCase();
          var name = (item.name || '').toLowerCase();
          var sector = (item.sector || '').toLowerCase();
          return tick.indexOf(query) !== -1 || name.indexOf(query) !== -1 || sector.indexOf(query) !== -1;
        }).slice(0, 10);

        if (matches.length > 0) {
          var listHtml = '';
          matches.forEach(function (m) {
            listHtml += '' +
              '<div class="autocomplete-item" data-ticker="' + m.ticker + '" style="padding: 10px 14px; border-bottom: 1px solid var(--border-subtle); cursor: pointer; display: flex; justify-content: space-between; align-items: center;">' +
                '<div style="display: flex; flex-direction: column; overflow: hidden;">' +
                  '<span style="font-weight: 600; font-size: 0.85rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + (m.name || m.ticker) + '</span>' +
                  '<span style="font-size: 0.7rem; color: var(--text-dim);">' + m.ticker + ' &bull; ' + (m.sector || 'N/A') + '</span>' +
                '</div>' +
                '<div style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted);">' + 
                  window.App.Format.currency(m.price, m.currency) + 
                '</div>' +
              '</div>';
          });
          autocompleteBox.innerHTML = listHtml;
          autocompleteBox.style.display = 'block';

          var items = autocompleteBox.querySelectorAll('.autocomplete-item');
          items.forEach(function (item) {
            item.onclick = function () {
              var t = this.getAttribute('data-ticker');
              addTickerToCompare(t);
              addInput.value = '';
              autocompleteBox.style.display = 'none';
            };
          });
        } else {
          autocompleteBox.innerHTML = '<div style="padding: 10px 14px; font-size: 0.8rem; color: var(--text-dim);">Keine Treffer gefunden</div>';
          autocompleteBox.style.display = 'block';
        }
      };

      addInput.onblur = function () {
        setTimeout(function () {
          if (autocompleteBox) autocompleteBox.style.display = 'none';
        }, 200);
      };

      addInput.onkeydown = function (e) {
        if (e.key === 'Enter') {
          var val = addInput.value.trim();
          addTickerToCompare(val);
          addInput.value = '';
          autocompleteBox.style.display = 'none';
        }
      };
    }
  }

  /**
   * Rendert alle Vergleichskarten, Charts und die Kennzahlen-Tabelle.
   */
  function renderComparisonResults(container, stocks) {
    var html = '' +
      '<!-- KI-Analyse mit Gemini -->' +
      '<div class="card" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%); border: 1px solid var(--accent-purple); padding: 14px; margin-bottom: 14px;">' +
        '<div style="display: flex; justify-content: space-between; align-items: center;">' +
          '<div style="flex: 1; padding-right: 12px;">' +
            '<div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main); margin-bottom: 2px; display: flex; align-items: center; gap: 6px;">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple-light)" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>' +
              'KI-Vergleichsanalyse' +
            '</div>' +
            '<div style="font-size: 0.72rem; color: var(--text-muted);">Lass Gemini die Aktien vergleichen und den besten Einstieg finden.</div>' +
          '</div>' +
          '<button id="btn-compare-gemini" class="chip-btn active" style="background: var(--accent-purple); border-color: var(--accent-purple); font-size: 0.75rem; flex-shrink: 0; box-shadow: 0 4px 14px var(--accent-purple-glow);">Analysieren</button>' +
        '</div>' +
      '</div>' +

      '<!-- Normierter Kursvergleich Chart mit Zeitsteuerung -->' +
      '<div class="card">' +
        '<div class="card-header-dotted" style="flex-wrap: wrap; gap: 8px;">' +
          '<div class="card-title">Normierter Kursverlauf (Basis 100 %)</div>' +
          '<div class="pill-group" id="compare-period-pills">' +
            '<button class="pill-btn ' + (currentPeriod === '1W' ? 'active' : '') + '" data-period="1W">1W</button>' +
            '<button class="pill-btn ' + (currentPeriod === '1M' ? 'active' : '') + '" data-period="1M">1M</button>' +
            '<button class="pill-btn ' + (currentPeriod === '3M' ? 'active' : '') + '" data-period="3M">3M</button>' +
            '<button class="pill-btn ' + (currentPeriod === '6M' ? 'active' : '') + '" data-period="6M">6M</button>' +
            '<button class="pill-btn ' + (currentPeriod === '1Y' ? 'active' : '') + '" data-period="1Y">1J</button>' +
          '</div>' +
        '</div>' +
        '<div class="chart-container">' +
          '<canvas id="compare-perf-canvas" class="chart-canvas" style="height: 220px;"></canvas>' +
          '<div class="chart-legend" id="compare-chart-legend"></div>' +
        '</div>' +
      '</div>' +

      '<!-- Kennzahlen Matrix-Tabelle -->' +
      '<div class="card" style="padding: 10px;">' +
        '<div class="card-header-dotted" style="padding: 6px 6px 10px;">' +
          '<div class="card-title">Kennzahlen-Gegenüberstellung</div>' +
        '</div>' +
        '<div class="table-responsive-wrapper">' +
          renderMatrixTable(stocks) +
        '</div>' +
      '</div>' +

      '<!-- Margenvergleich -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<div class="card-title">Margenvergleich im Überblick</div>' +
          '<span class="period-tag">% Werte</span>' +
        '</div>' +
        '<div class="chart-container">' +
          '<canvas id="compare-margins-canvas" class="chart-canvas" style="height: 200px;"></canvas>' +
        '</div>' +
      '</div>';

    container.innerHTML = html;
    
    bindPeriodPillEvents(stocks);

    var geminiBtn = container.querySelector('#btn-compare-gemini');
    if (geminiBtn) {
      geminiBtn.onclick = function() {
        var promptText = "Hallo Gemini! Bitte prüfe zuerst meine bereitgestellten Daten zu den folgenden Aktien auf Plausibilität. " +
                         "Erkläre mir anschließend basierend auf den Fundamentaldaten und dem technischen Bild, welche dieser Aktien aktuell für einen Einstieg am besten geeignet ist " +
                         "und wie sich das langfristige Potenzial der Unternehmen weiterentwickeln könnte.\n\n";

        stocks.forEach(function(s) {
            var sName = s.profile ? (s.profile.name || s.ticker) : s.ticker;
            var sPrice = window.App.Format.currency(s.quote.price, s.quote.currency);
            var sChange = window.App.Format.number(s.quote.changePercent, 2) + " %";
            var sPe = (s.ratios && s.ratios.peTrailing) ? window.App.Format.number(s.ratios.peTrailing, 1) : "unbekannt";

            promptText += "### " + sName + " (" + s.ticker + ") ###\n" +
                          "- Kurs: " + sPrice + " (Änderung heute: " + sChange + ")\n" +
                          "- KGV (Trailing): " + sPe + "\n";

            if (s.chartHistory && s.chartHistory.length > 60 && window.App.StockChart) {
                var hist = s.chartHistory.filter(function (p) { return p && p.close > 0; });
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

                promptText += "- Technisches Bild: ";
                if (s200Last !== null) promptText += "Abstand 200-Tage-Linie " + window.App.Format.number((cPrice / s200Last - 1) * 100, 1) + " %. ";
                if (s50Last !== null) promptText += "Abstand 50-Tage-Linie " + window.App.Format.number((cPrice / s50Last - 1) * 100, 1) + " %. ";
                if (rsiLast !== null) promptText += "RSI (14) bei " + window.App.Format.number(rsiLast, 0) + ". ";
                if (macdLast !== null && sigLast !== null) {
                    promptText += "MACD " + (macdLast > sigLast ? "über" : "unter") + " Signallinie. ";
                }
                if (mom3m !== null) promptText += "Momentum 3M bei " + window.App.Format.number(mom3m, 1) + " %.";
                promptText += "\n";
            }
            promptText += "\n";
        });
        
        var geminiUrl = "https://gemini.google.com/app?q=" + encodeURIComponent(promptText);
        
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

    // Charts zeichnen
    initNormalizedPerformanceChart(stocks);
    initMarginsBarChart(stocks);
  }

  /**
   * Bindet die Zeitbereich-Pillen für den Vergleichschart
   */
  function bindPeriodPillEvents(stocks) {
    var pills = document.querySelectorAll('#compare-period-pills .pill-btn');
    pills.forEach(function (pill) {
      pill.onclick = function () {
        pills.forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        currentPeriod = pill.getAttribute('data-period');
        initNormalizedPerformanceChart(stocks);
      };
    });
  }

  /**
   * Baut die Gegenüberstellungs-Tabelle auf.
   */
  function renderMatrixTable(stocks) {
    var rows = [
      { label: 'Aktueller Kurs', fn: function (s) { return window.App.Format.currency(s.quote.price, s.quote.currency); } },
      { label: 'Marktkapitalisierung', fn: function (s) { return window.App.Format.compactNumber(s.quote.marketCap, s.quote.currency); } },
      { label: 'KGV (Trailing)', fn: function (s) { return window.App.Format.number(s.ratios.peTrailing, 1); } },
      { label: 'Forward KGV', fn: function (s) { return window.App.Format.number(s.ratios.peForward, 1); } },
      { label: 'PEG Ratio', fn: function (s) { return window.App.Format.number(s.ratios.pegRatio, 2); } },
      { label: 'Dividendenrendite', fn: function (s) { return window.App.Format.percent((s.ratios.dividendYield || 0), false, 2); } },
      { label: 'Umsatzwachstum YoY', fn: function (s) { return window.App.Format.percent((s.ratios.revenueGrowth || 0) * 100, true, 1); } },
      { label: 'Nettomarge', fn: function (s) { return window.App.Format.percent((s.ratios.profitMargins || 0) * 100, false, 1); } },
      { label: 'Eigenkapitalrendite (ROE)', fn: function (s) { return window.App.Format.percent((s.ratios.returnOnEquity || 0) * 100, false, 1); } },
      { label: 'Debt to Equity', fn: function (s) { return window.App.Format.number(s.ratios.debtToEquity, 1) + ' %'; } }
    ];

    var html = '<table class="data-table"><thead><tr><th>Kennzahl</th>';
    stocks.forEach(function (s, idx) {
      var color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
      html += '<th style="text-align: right; color: ' + color + ';">' + s.ticker + '</th>';
    });
    html += '</tr></thead><tbody>';

    rows.forEach(function (r) {
      html += '<tr><td style="color: var(--text-muted);">' + r.label + '</td>';
      stocks.forEach(function (s) {
        html += '<td style="text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;">' + r.fn(s) + '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
  }

  /**
   * Zeichnet den normierten Kursvergleich (Basis 100 %) auf ein gemeinsames Canvas.
   */
  function initNormalizedPerformanceChart(stocks) {
    var canvas = document.getElementById('compare-perf-canvas');
    var legendContainer = document.getElementById('compare-chart-legend');
    if (!canvas) return;

    var targetDays = 260; // 1Y
    if (currentPeriod === '1W') targetDays = 5;
    else if (currentPeriod === '1M') targetDays = 22;
    else if (currentPeriod === '3M') targetDays = 65;
    else if (currentPeriod === '6M') targetDays = 130;
    else if (currentPeriod === '1Y') targetDays = 260;

    var minLen = targetDays;
    stocks.forEach(function (s) {
      var hist = s.chartHistory || [];
      if (hist.length > 0 && hist.length < minLen) minLen = hist.length;
    });

    if (minLen === 0) return;

    var labels = [];
    var baseDateList = (stocks[0].chartHistory || []).slice(-minLen);
    baseDateList.forEach(function (pt) {
      labels.push(pt.date ? pt.date.slice(5, 7) + '/' + pt.date.slice(2, 4) : '');
    });

    var seriesData = [];
    stocks.forEach(function (s, sIdx) {
      var hist = (s.chartHistory || []).slice(-minLen);
      var basePrice = hist[0] ? hist[0].close : 1;
      var normVals = hist.map(function (pt) {
        return basePrice > 0 ? (pt.close / basePrice) * 100 : 100;
      });

      seriesData.push({
        ticker: s.ticker,
        color: COLOR_PALETTE[sIdx % COLOR_PALETTE.length],
        values: normVals
      });
    });

    if (seriesData.length > 0) {
      // Das erneute Rendern auf das gleiche Canvas-Element leert dieses automatisch
      window.App.Charts.renderMultiLineChart(canvas, {
        labels: labels,
        series: seriesData.map(function (sd) { return { name: sd.ticker, color: sd.color, values: sd.values }; }),
        formatY: function (v) { return v.toFixed(0) + ' %'; }
      });
    }

    if (legendContainer) {
      var legHtml = '';
      seriesData.forEach(function (s) {
        legHtml += '' +
          '<div class="legend-item">' +
            '<span class="legend-dot" style="background:' + s.color + ';"></span>' +
            '<span>' + s.ticker + '</span>' +
          '</div>';
      });
      legendContainer.innerHTML = legHtml;
    }
  }

  /**
   * Zeichnet den Margenvergleich (Brutto-, Operative und Nettomarge) als gruppierten Balken.
   */
  function initMarginsBarChart(stocks) {
    var canvas = document.getElementById('compare-margins-canvas');
    if (!canvas || stocks.length === 0) return;

    var labels = ['Bruttomarge', 'Operativ', 'Nettomarge'];
    var series = stocks.map(function (s, idx) {
      var r = s.ratios || {};
      return {
        name: s.ticker,
        color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
        data: [
          (r.grossMargins || 0) * 100,
          (r.operatingMargins || 0) * 100,
          (r.profitMargins || 0) * 100
        ]
      };
    });

    window.App.Charts.renderGroupedBarChart(canvas, {
      labels: labels,
      series: series,
      formatY: function (v) { return v.toFixed(0) + ' %'; }
    });
  }

  return {
    initView: initView
  };
})();

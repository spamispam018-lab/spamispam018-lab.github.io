/**
 * js/compare.js
 * Ermöglicht den direkten Vergleich von 2 bis 4 Aktien:
 * - Ticker-Auswahl über Schnellauswahl oder Direkteingabe
 * - Normierter Kursvergleich (Basis 100 %) als Canvas-Liniendiagramm
 * - Gegenüberstellung der Kernmetriken (Bewertung, Wachstum, Margen, Verschuldung)
 * - Margenvergleich als gruppiertes Balkendiagramm
 */

window.App = window.App || {};

window.App.Compare = (function () {
  'use strict';

  var selectedTickers = ['AAPL', 'MSFT'];
  var loadedStocksData = {};

  var COLOR_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ec4899'];

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
    } else if (params && params.ticker) {
      if (selectedTickers.indexOf(params.ticker) === -1) {
        selectedTickers[0] = params.ticker;
      }
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

        '<div class="card" style="padding: 12px; margin-bottom: 14px;">' +
          '<div style="font-size: 0.72rem; color: var(--text-dim); margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">Ausgewählte Titel</div>' +
          '<div id="compare-chips-container" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;"></div>' +
          '<div style="display: flex; gap: 8px; margin-top: 10px;">' +
            '<input type="text" id="compare-add-input" class="search-input" placeholder="Ticker hinzufügen (z.B. NVDA)..." style="height: 38px; padding-left: 14px;">' +
            '<button id="compare-add-btn" class="chip-btn active" style="border-radius: var(--radius-md); padding: 0 16px;">+ Add</button>' +
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
          // Fallback Dummy aus Universe erzeugen falls Detaildaten fehlen
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
        loadAndRenderComparison();
      };
    });
  }

  /**
   * Bindet das Hinzufügen weiterer Ticker.
   */
  function bindInputEvents() {
    var addBtn = document.getElementById('compare-add-btn');
    var addInput = document.getElementById('compare-add-input');

    function handleAdd() {
      if (!addInput) return;
      var val = (addInput.value || '').trim().toUpperCase();
      if (val && selectedTickers.indexOf(val) === -1) {
        if (selectedTickers.length >= 4) {
          alert('Maximal 4 Aktien gleichzeitig im Vergleich.');
          return;
        }
        selectedTickers.push(val);
        addInput.value = '';
        loadAndRenderComparison();
      }
    }

    if (addBtn) addBtn.onclick = handleAdd;
    if (addInput) {
      addInput.onkeydown = function (e) {
        if (e.key === 'Enter') handleAdd();
      };
    }
  }

  /**
   * Rendert alle Vergleichskarten, Charts und die Kennzahlen-Tabelle.
   */
  function renderComparisonResults(container, stocks) {
    var html = '' +
      '<!-- Normierter Kursvergleich Chart -->' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<div class="card-title">Normierter Kursverlauf (Basis 100 %)</div>' +
          '<span class="period-tag">1 Jahr</span>' +
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

    // Charts zeichnen
    initNormalizedPerformanceChart(stocks);
    initMarginsBarChart(stocks);
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

    // Gemeinsame Datenlänge ermitteln
    var minLen = 9999;
    stocks.forEach(function (s) {
      var hist = s.chartHistory || [];
      if (hist.length > 0 && hist.length < minLen) minLen = hist.length;
    });

    if (minLen === 9999 || minLen === 0) return;

    var labels = [];
    var baseDateList = (stocks[0].chartHistory || []).slice(-minLen);
    baseDateList.forEach(function (pt) {
      labels.push(pt.date ? pt.date.slice(5) : '');
    });

    // Erster Kurs jedes Titels = 100 %
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

    // Erstes Set als Referenzlinie rendern
    if (seriesData.length > 0) {
      window.App.Charts.renderLineChart(canvas, {
        labels: labels,
        values: seriesData[0].values,
        formatY: function (v) { return v.toFixed(0) + ' %'; }
      });
    }

    // HTML-Legende
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

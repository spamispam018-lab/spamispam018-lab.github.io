// js/stock-compare.js
// Ermöglicht den Vergleich von bis zu 4 Aktien anhand wählbarer Kennzahlen
// (z. B. KGV, Umsatz, Nettogewinn, Margen, Cashflow) als Zeitreihen-Diagramm und Gegenüberstellungstabelle.

(function () {
  "use strict";

  const MAX_COMPARE_COUNT = 4;
  let compareTickers = [];
  let selectedMetric = "trailingPE";
  const tickerDataMap = {};

  // Verfügbare Kennzahlen für den Vergleich
  const COMPARE_METRICS = [
    { id: "trailingPE", label: "KGV (Trailing P/E)", type: "multiple", isHistory: false },
    { id: "forwardPE", label: "Forward KGV", type: "multiple", isHistory: false },
    { id: "priceToSales", label: "KUV (P/S)", type: "multiple", isHistory: false },
    { id: "marketCap", label: "Marktkapitalisierung", type: "currency", isHistory: false },
    { id: "revenue", label: "Umsatz (Letzte 4Q)", type: "currency", isHistory: true, key: "revenue" },
    { id: "netIncome", label: "Nettogewinn (Letzte 4Q)", type: "currency", isHistory: true, key: "netIncome" },
    { id: "operatingMargin", label: "Operative Marge", type: "percent", isHistory: true, isRatio: true },
    { id: "netMargin", label: "Nettomarge", type: "percent", isHistory: true, isRatio: true },
    { id: "freeCashFlow", label: "Free Cashflow (Letzte 4Q)", type: "currency", isHistory: true, key: "freeCashFlow" }
  ];

  function render(currentStockData) {
    const container = document.getElementById("compareWrapper");
    if (!container) return;

    // Aktuellen Ticker standardmäßig als ersten Vergleichswert aufnehmen
    if (currentStockData && currentStockData.ticker) {
      const sym = currentStockData.ticker.toUpperCase();
      tickerDataMap[sym] = currentStockData;
      if (!compareTickers.includes(sym)) {
        compareTickers.unshift(sym);
        if (compareTickers.length > MAX_COMPARE_COUNT) {
          compareTickers = compareTickers.slice(0, MAX_COMPARE_COUNT);
        }
      }
    }

    container.innerHTML =
      // 1. STEUERUNG & TICKER-AUSWAHL
      '<div class="info-card" style="margin-bottom: 14px;">' +
        '<div class="chart-header">' +
          '<div class="chart-title-group">' +
            '<span class="chart-title">Aktien vergleichen</span>' +
            '<span class="chart-badge">Max. 4 Ticker</span>' +
          '</div>' +
        '</div>' +

        // Ticker-Chips der aktuellen Auswahl
        '<div id="compareChipsContainer" style="display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 12px 0;">' +
          renderCompareChips() +
        '</div>' +

        // Eingabefeld für weiteren Ticker
        '<div style="display: flex; gap: 8px; margin-bottom: 12px;">' +
          '<input type="text" id="addCompareInput" class="form-select-dark" placeholder="Ticker hinzufügen (z.B. MSFT)..." style="flex: 1; text-transform: uppercase;" autocomplete="off" autocapitalize="characters">' +
          '<button type="button" class="stmt-toggle-btn active" id="addCompareBtn" style="padding: 6px 14px;">+ Hinzufügen</button>' +
        '</div>' +

        // Kennzahl-Auswahl Dropdown
        '<div class="control-group" style="justify-content: space-between;">' +
          '<label for="compareMetricSelect" style="color: var(--text-main); font-weight: 600;">Vergleichs-Kennzahl:</label>' +
          '<select id="compareMetricSelect" class="form-select-dark" style="min-width: 170px;">' +
            COMPARE_METRICS.map(function (m) {
              return '<option value="' + m.id + '" ' + (m.id === selectedMetric ? "selected" : "") + '>' + m.label + '</option>';
            }).join("") +
          '</select>' +
        '</div>' +
      '</div>' +

      // 2. DIAGRAMM-KARTE FÜR DEN VERGLEICH
      window.StockCharts.createChartCardHTML({
        id: "compare_chart_card",
        title: "Historischer Trend / Kennzahl",
        badge: "Vergleich",
        series: compareTickers.map(function (sym, idx) {
          const colors = [
            window.StockCharts.PALETTE.blue,
            window.StockCharts.PALETTE.green,
            window.StockCharts.PALETTE.yellow,
            window.StockCharts.PALETTE.purple
          ];
          return { label: sym, color: colors[idx % colors.length] };
        })
      }) +

      // 3. GEGENÜBERSTELLUNGS-TABELLE
      '<div class="info-card" style="margin-top: 14px;">' +
        '<div class="chart-header" style="margin-bottom: 8px;">' +
          '<span class="chart-title">Kennzahlen-Matrix</span>' +
          '<span class="chart-badge">Direktvergleich</span>' +
        '</div>' +
        '<div class="table-scroll-container">' +
          renderMatrixTable() +
        '</div>' +
      '</div>';

    attachCompareEvents();
    loadMissingTickerData().then(function () {
      updateCompareView();
    });
  }

  function renderCompareChips() {
    if (compareTickers.length === 0) {
      return '<span style="font-size: 11px; color: var(--text-muted);">Keine Aktien ausgewählt.</span>';
    }

    return compareTickers.map(function (sym) {
      return (
        '<div class="ticker-chip" style="font-size: 13px; padding: 3px 10px;">' +
          '<span>' + sym + '</span>' +
          '<button type="button" class="chip-clear-btn" data-remove-ticker="' + sym + '" style="font-size: 15px; margin-left: 6px;">&times;</button>' +
        '</div>'
      );
    }).join("");
  }

  function renderMatrixTable() {
    let thead = '<thead><tr><th>Metrik</th>';
    compareTickers.forEach(function (sym) {
      thead += '<th>' + sym + '</th>';
    });
    thead += '</tr></thead>';

    let tbody = '<tbody>';
    COMPARE_METRICS.forEach(function (m) {
      tbody += '<tr>';
      tbody += '<td style="font-weight: 600;">' + m.label + '</td>';

      compareTickers.forEach(function (sym) {
        const data = tickerDataMap[sym];
        let valFormatted = "-";

        if (data) {
          const val = extractMetricValue(data, m);
          if (val !== null && val !== undefined) {
            valFormatted = window.StockCharts.formatCompactNumber(val, m.type);
          }
        }

        tbody += '<td>' + valFormatted + '</td>';
      });

      tbody += '</tr>';
    });
    tbody += '</tbody>';

    return '<table class="financial-table">' + thead + tbody + '</table>';
  }

  function extractMetricValue(stockData, metric) {
    if (!stockData) return null;
    const overview = stockData.overview || {};
    const history = stockData.financialsHistory || [];

    if (!metric.isHistory) {
      return overview[metric.id] != null ? overview[metric.id] : null;
    }

    if (history.length === 0) return null;
    const last4 = history.slice(-4);

    if (metric.isRatio) {
      let revSum = 0, opSum = 0, netSum = 0;
      last4.forEach(function (q) {
        if (q.revenue) revSum += q.revenue;
        if (q.operatingIncome) opSum += q.operatingIncome;
        if (q.netIncome) netSum += q.netIncome;
      });
      if (revSum <= 0) return null;
      if (metric.id === "operatingMargin") return (opSum / revSum) * 100;
      if (metric.id === "netMargin") return (netSum / revSum) * 100;
      return null;
    }

    let sum = 0;
    last4.forEach(function (q) {
      if (q[metric.key] != null) sum += q[metric.key];
    });
    return sum;
  }

  function loadMissingTickerData() {
    const promises = [];
    compareTickers.forEach(function (sym) {
      if (!tickerDataMap[sym]) {
        promises.push(
          window.StockData.fetchStockDetail(sym, false)
            .then(function (res) {
              tickerDataMap[sym] = res;
            })
            .catch(function () {
              console.warn("Vergleichsdaten für " + sym + " konnten nicht geladen werden.");
            })
        );
      }
    });
    return Promise.all(promises);
  }

  function updateCompareView() {
    const tableContainer = document.querySelector("#compareWrapper .table-scroll-container");
    if (tableContainer) {
      tableContainer.innerHTML = renderMatrixTable();
    }
    drawCompareChart();
  }

  function drawCompareChart() {
    const metricObj = COMPARE_METRICS.find(function (m) { return m.id === selectedMetric; }) || COMPARE_METRICS[0];

    // Einheitliche Quartals-Labels aus allen verfügbaren Ticker-Historien ermitteln
    const datesSet = new Set();
    compareTickers.forEach(function (sym) {
      const data = tickerDataMap[sym];
      if (data && data.financialsHistory) {
        data.financialsHistory.slice(-8).forEach(function (row) {
          if (row.date) datesSet.add(row.date);
        });
      }
    });

    const sortedDates = Array.from(datesSet).sort().slice(-8);
    const labels = sortedDates.map(function (d) {
      const p = d.split("-");
      return p.length >= 2 ? (p[1] + "/" + p[0].slice(2)) : d;
    });

    const colors = [
      window.StockCharts.PALETTE.blue,
      window.StockCharts.PALETTE.green,
      window.StockCharts.PALETTE.yellow,
      window.StockCharts.PALETTE.purple
    ];

    const datasets = compareTickers.map(function (sym, idx) {
      const data = tickerDataMap[sym];
      const seriesVals = [];

      sortedDates.forEach(function (dt) {
        let val = null;
        if (data && data.financialsHistory) {
          const match = data.financialsHistory.find(function (r) { return r.date === dt; });
          if (match) {
            if (metricObj.isHistory && metricObj.key) {
              val = match[metricObj.key];
            } else if (metricObj.id === "operatingMargin" && match.revenue && match.operatingIncome) {
              val = (match.operatingIncome / match.revenue) * 100;
            } else if (metricObj.id === "netMargin" && match.revenue && match.netIncome) {
              val = (match.netIncome / match.revenue) * 100;
            } else {
              // Konstante Kennzahl (wie P/E) als Referenzlinie
              val = data.overview ? data.overview[metricObj.id] : null;
            }
          }
        }
        seriesVals.push(val != null ? val : null);
      });

      return {
        label: sym,
        data: seriesVals,
        color: colors[idx % colors.length],
        fill: false
      };
    });

    window.StockCharts.renderLineChart(
      "compare_chart_card_canvas",
      labels,
      datasets,
      metricObj.type
    );
  }

  function attachCompareEvents() {
    const addInput = document.getElementById("addCompareInput");
    const addBtn = document.getElementById("addCompareBtn");
    const metricSelect = document.getElementById("compareMetricSelect");

    function addTicker() {
      if (!addInput) return;
      const sym = (addInput.value || "").trim().toUpperCase();
      if (!sym) return;

      if (compareTickers.includes(sym)) {
        addInput.value = "";
        return;
      }

      if (compareTickers.length >= MAX_COMPARE_COUNT) {
        alert("Maximal " + MAX_COMPARE_COUNT + " Aktien können gleichzeitig verglichen werden.");
        return;
      }

      compareTickers.push(sym);
      addInput.value = "";
      render();
    }

    if (addBtn) addBtn.addEventListener("click", addTicker);
    if (addInput) {
      addInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          addTicker();
        }
      });
    }

    if (metricSelect) {
      metricSelect.addEventListener("change", function () {
        selectedMetric = this.value;
        drawCompareChart();
      });
    }

    // Ticker entfernen via Chip-Klick
    const chipsContainer = document.getElementById("compareChipsContainer");
    if (chipsContainer) {
      chipsContainer.addEventListener("click", function (e) {
        const btn = e.target.closest("[data-remove-ticker]");
        if (btn) {
          const symToRemove = btn.getAttribute("data-remove-ticker");
          compareTickers = compareTickers.filter(function (s) { return s !== symToRemove; });
          render();
        }
      });
    }
  }

  window.StockCompare = {
    render: render
  };
})();

// js/stock-statements.js
// Visualisiert GuV, Bilanz und Cashflow-Rechnung in einer horizontal scrollbaren Tabelle
// mit fixierter (sticky) erster Spalte, Umschalter zwischen Quartals- und Jahresdaten.

(function () {
  "use strict";

  let currentStatementType = "income"; // income | balance | cashflow
  let currentPeriodType = "Quarterly";  // Quarterly | Annual

  // Zeilen-Definitionen je Statement-Typ mit Bezeichnern und passenden Datenfeldern
  const STATEMENT_DEFINITIONS = {
    income: {
      title: "Gewinn- und Verlustrechnung (GuV)",
      rows: [
        { label: "Umsatzerlöse", key: "revenue", bold: true },
        { label: "Umsatzkosten (Cost of Rev.)", key: "costOfRevenue", indent: true },
        { label: "Bruttogewinn (Gross Profit)", key: "grossProfit", bold: true },
        { label: "Operatives Ergebnis (EBIT)", key: "operatingIncome", bold: true },
        { label: "Nettogewinn (Net Income)", key: "netIncome", bold: true, highlight: true }
      ]
    },
    balance: {
      title: "Bilanz (Balance Sheet)",
      rows: [
        { label: "Gesamtvermögen (Assets)", key: "totalAssets", bold: true },
        { label: "Umlaufvermögen (Current Assets)", key: "currentAssets", indent: true },
        { label: "Liquide Mittel & Äquivalente", key: "cashAndEquivalents", indent: true },
        { label: "Gesamtverbindlichkeiten", key: "totalLiabilities", bold: true },
        { label: "Kurzfristige Verbindlichkeiten", key: "currentLiabilities", indent: true },
        { label: "Gesamtschulden (Total Debt)", key: "totalDebt", indent: true },
        { label: "Eigenkapital (Stockholders Equity)", key: "stockholdersEquity", bold: true, highlight: true },
        { label: "Ausstehende Aktien", key: "sharesOutstanding", format: "compact" }
      ]
    },
    cashflow: {
      title: "Kapitalflussrechnung (Cash Flow)",
      rows: [
        { label: "Operativer Cashflow (OCF)", key: "operatingCashFlow", bold: true },
        { label: "Investitionsausgaben (CapEx)", key: "capitalExpenditure", indent: true },
        { label: "Freier Cashflow (FCF)", key: "freeCashFlow", bold: true, highlight: true },
        { label: "Gezahlte Dividenden", key: "dividendsPaid", indent: true }
      ]
    }
  };

  function render(stockData) {
    const container = document.getElementById("statementTableContainer");
    if (!container) return;

    if (!stockData || !stockData.financialsHistory || stockData.financialsHistory.length === 0) {
      container.innerHTML = '<div class="empty-data-hint">Keine Finanzberichte verfügbar.</div>';
      return;
    }

    initControls(stockData);

    const history = stockData.financialsHistory;
    const columnsData = prepareStatementColumns(history, currentPeriodType);

    if (columnsData.length === 0) {
      container.innerHTML = '<div class="empty-data-hint">Keine Daten für diesen Berichtszeitraum vorhanden.</div>';
      return;
    }

    const currentDef = STATEMENT_DEFINITIONS[currentStatementType] || STATEMENT_DEFINITIONS.income;
    container.innerHTML = buildTableHTML(currentDef, columnsData, stockData.currency || "USD");
  }

  function initControls(stockData) {
    const periodSelect = document.getElementById("stmtPeriodSelect");
    if (periodSelect && !periodSelect.dataset.listenerAttached) {
      periodSelect.value = currentPeriodType;
      periodSelect.addEventListener("change", function () {
        currentPeriodType = this.value;
        render(stockData);
      });
      periodSelect.dataset.listenerAttached = "true";
    }

    const toggleBtns = document.querySelectorAll(".statements-controls-bar .stmt-toggle-btn");
    toggleBtns.forEach(function (btn) {
      if (!btn.dataset.listenerAttached) {
        btn.addEventListener("click", function () {
          toggleBtns.forEach(function (b) { b.classList.remove("active"); });
          this.classList.add("active");
          currentStatementType = this.getAttribute("data-stmt") || "income";
          render(stockData);
        });
        btn.dataset.listenerAttached = "true";
      }
    });
  }

  function prepareStatementColumns(history, periodType) {
    let sorted = history.slice().sort(function (a, b) {
      return (b.date || "").localeCompare(a.date || ""); // Neueste Spalte zuerst links
    });

    if (periodType === "Annual") {
      const yearMap = {};
      sorted.forEach(function (row) {
        const y = (row.date || "").split("-")[0];
        if (!y) return;
        if (!yearMap[y]) {
          yearMap[y] = Object.assign({}, row, { date: y, isAnnual: true });
        } else {
          // Flow-Größen summieren
          ["revenue", "grossProfit", "costOfRevenue", "operatingIncome", "netIncome", "operatingCashFlow", "freeCashFlow", "capitalExpenditure", "dividendsPaid"].forEach(function (k) {
            if (row[k] != null) {
              yearMap[y][k] = (yearMap[y][k] || 0) + row[k];
            }
          });
        }
      });
      return Object.keys(yearMap).map(function (y) { return yearMap[y]; }).slice(0, 10);
    }

    // Quarterly: Bis zu 12 Quartale
    return sorted.slice(0, 12);
  }

  function buildTableHTML(definition, columns, currency) {
    let theadHTML = '<thead><tr><th>Kennzahl (' + currency + ')</th>';
    columns.forEach(function (col) {
      let label = col.date || "-";
      if (!col.isAnnual && label.includes("-")) {
        const parts = label.split("-");
        label = parts[1] + "/" + parts[0].slice(2);
      }
      theadHTML += '<th>' + label + '</th>';
    });
    theadHTML += '</tr></thead>';

    let tbodyHTML = '<tbody>';
    definition.rows.forEach(function (rowDef) {
      const rowStyle = rowDef.highlight ? ' style="background-color: rgba(56, 139, 253, 0.08);"' : '';
      tbodyHTML += '<tr' + rowStyle + '>';

      let nameClass = rowDef.bold ? 'font-weight: 700;' : '';
      let indentStyle = rowDef.indent ? 'padding-left: 20px; color: var(--text-muted);' : '';
      tbodyHTML += '<td style="' + nameClass + indentStyle + '">' + rowDef.label + '</td>';

      columns.forEach(function (col) {
        const val = col[rowDef.key];
        let valFormatted = "-";

        if (val !== null && val !== undefined) {
          if (rowDef.format === "compact") {
            valFormatted = window.StockCharts.formatCompactNumber(val);
          } else {
            valFormatted = window.StockCharts.formatCompactNumber(val, "currency");
          }
        }

        let cellColor = "";
        if (rowDef.highlight && val !== null && val !== undefined) {
          cellColor = val >= 0 ? ' class="val-positive"' : ' class="val-negative"';
        }

        tbodyHTML += '<td' + cellColor + '>' + valFormatted + '</td>';
      });

      tbodyHTML += '</tr>';
    });
    tbodyHTML += '</tbody>';

    return '<table class="financial-table">' + theadHTML + tbodyHTML + '</table>';
  }

  window.StockStatements = {
    render: render
  };
})();

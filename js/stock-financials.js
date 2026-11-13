/**
 * js/stock-financials.js
 * Verwaltet den Financials-Tab.
 * NEU: Robuster Zugriff auf Datenfelder (unterstützt sowohl snake_case "Total_Revenue"
 * als auch camelCase "TotalRevenue", da yfinance die API geändert hat).
 */

window.App = window.App || {};

window.App.StockFinancials = (function () {
  'use strict';

  var currentSubView = 'charts';
  var activePeriod = 'quarterly';
  var activeStatement = 'income';

  // NEU: Hilfsfunktion, um Werte unabhängig von der Schreibweise zu holen
  function getVal(obj, camelKey, snakeKey) {
    if (!obj) return undefined;
    if (obj[camelKey] !== undefined && obj[camelKey] !== null) return obj[camelKey];
    if (snakeKey && obj[snakeKey] !== undefined && obj[snakeKey] !== null) return obj[snakeKey];
    return undefined;
  }

  function render(container, stock) {
    if (!container || !stock) return;

    var html = '' +
      '<!-- Financials Sub-Navigation: Charts vs Statements -->' +
      '<div class="main-tabs-row" style="margin-bottom: 14px;">' +
        '<button class="main-tab-btn ' + (currentSubView === 'charts' ? 'active' : '') + '" data-fin-sub="charts">Kennzahlen-Charts</button>' +
        '<button class="main-tab-btn ' + (currentSubView === 'statements' ? 'active' : '') + '" data-fin-sub="statements">Finanzberichte (Statements)</button>' +
      '</div>' +
      '<div id="financials-subview-content"></div>';

    container.innerHTML = html;

    bindSubNavEvents(container, stock);
    renderActiveSubView(stock);
  }

  function bindSubNavEvents(container, stock) {
    var buttons = container.querySelectorAll('[data-fin-sub]');
    buttons.forEach(function (btn) {
      btn.onclick = function () {
        buttons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentSubView = btn.getAttribute('data-fin-sub');
        renderActiveSubView(stock);
      };
    });
  }

  function renderActiveSubView(stock) {
    var subContainer = document.getElementById('financials-subview-content');
    if (!subContainer) return;

    if (currentSubView === 'charts') {
      renderChartsView(subContainer, stock);
    } else {
      renderStatementsView(subContainer, stock);
    }
  }

  function renderChartsView(container, stock) {
    var currency = (stock.quote && stock.quote.currency) || 'EUR';

    var html = '' +
      '<!-- Steuerungsleiste: Periode -->' +
      '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">' +
        '<div class="horizontal-scroll-row" style="margin-bottom: 0; padding-bottom: 0;">' +
          '<button class="chip-btn ' + (activePeriod === 'quarterly' ? 'active' : '') + '" data-chart-period="quarterly">Quartalsweise</button>' +
          '<button class="chip-btn ' + (activePeriod === 'annual' ? 'active' : '') + '" data-chart-period="annual">Jährlich</button>' +
        '</div>' +
        '<span style="font-size: 0.72rem; color: var(--text-dim);">' + (activePeriod === 'quarterly' ? 'Letzte 4–8 Quartale' : 'Letzte Geschäftsjahre') + '</span>' +
      '</div>' +

      '<!-- Chart Kacheln Grid -->' +
      '<div id="financials-charts-grid">' +
        renderChartCardHtml('chart-rev', 'Umsatzerlöse (Revenue)', 'Balken') +
        renderChartCardHtml('chart-net-inc', 'Jahresüberschuss (Net Income)', 'Balken') +
        renderChartCardHtml('chart-cf', 'Free Cash Flow &amp; Operating CF', 'Vergleich') +
        renderChartCardHtml('chart-margins', 'Margen-Entwicklung (Gross, Op., Net)', 'Linien in %') +
        renderChartCardHtml('chart-debt-cash', 'Cash vs. Gesamtverschuldung', 'Balken') +
        renderChartCardHtml('chart-returns', 'Kapitalrenditen (ROE &amp; ROA)', 'Linien in %') +
      '</div>';

    container.innerHTML = html;

    var periodBtns = container.querySelectorAll('[data-chart-period]');
    periodBtns.forEach(function (btn) {
      btn.onclick = function () {
        periodBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        activePeriod = btn.getAttribute('data-chart-period');
        drawAllCharts(stock, currency);
      };
    });

    drawAllCharts(stock, currency);
  }

  function renderChartCardHtml(canvasId, title, subTag) {
    return '' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">' + title + '</span>' +
          '<span class="period-tag">' + subTag + '</span>' +
        '</div>' +
        '<div class="chart-container">' +
          '<canvas id="' + canvasId + '" class="chart-canvas" style="height: 180px;"></canvas>' +
        '</div>' +
      '</div>';
  }

  function drawAllCharts(stock, currency) {
    var fin = stock.financials || {};
    var incList = (fin.incomeStatement && fin.incomeStatement[activePeriod]) || [];
    var balList = (fin.balanceSheet && fin.balanceSheet[activePeriod]) || [];
    var cfList = (fin.cashFlow && fin.cashFlow[activePeriod]) || [];

    if (incList.length === 0) {
      // Fallback, falls die Daten leer sind
      var grid = document.getElementById('financials-charts-grid');
      if (grid) grid.innerHTML = '<div class="state-box"><p>Keine Finanzdaten verfügbar.</p></div>';
      return;
    }

    var labels = incList.map(function (it) {
      return it.date ? it.date.slice(2, 7) : 'P';
    });

    // 1. Revenue
    var canvasRev = document.getElementById('chart-rev');
    if (canvasRev) {
      var revVals = incList.map(function (it) {
        var v = getVal(it, 'TotalRevenue', 'Total_Revenue');
        return v !== undefined ? v : 0;
      });
      window.App.Charts.renderGroupedBarChart(canvasRev, {
        labels: labels,
        series: [{ name: 'Revenue', data: revVals, color: '#6366f1' }],
        formatY: function (v) { return window.App.Format.axisMoney(v); }
      });
    }

    // 2. Net Income
    var canvasNet = document.getElementById('chart-net-inc');
    if (canvasNet) {
      var netVals = incList.map(function (it) {
        var v = getVal(it, 'NetIncome', 'Net_Income');
        return v !== undefined ? v : 0;
      });
      window.App.Charts.renderGroupedBarChart(canvasNet, {
        labels: labels,
        series: [{ name: 'Net Income', data: netVals, color: '#10b981' }],
        formatY: function (v) { return window.App.Format.axisMoney(v); }
      });
    }

    // 3. Operating vs Free Cash Flow
    var canvasCf = document.getElementById('chart-cf');
    if (canvasCf) {
      var ocfVals = cfList.map(function (it) {
        var v = getVal(it, 'OperatingCashFlow', 'Operating_Cash_Flow');
        return v !== undefined ? v : 0;
      });
      var fcfVals = cfList.map(function (it) {
        var v = getVal(it, 'FreeCashFlow', 'Free_Cash_Flow');
        return v !== undefined ? v : 0;
      });
      window.App.Charts.renderGroupedBarChart(canvasCf, {
        labels: labels,
        series: [
          { name: 'OCF', data: ocfVals, color: '#3b82f6' },
          { name: 'FCF', data: fcfVals, color: '#059669' }
        ],
        formatY: function (v) { return window.App.Format.axisMoney(v); }
      });
    }

    // 4. Margins (%)
    var canvasMargins = document.getElementById('chart-margins');
    if (canvasMargins) {
      var mLabels = [], netMargVals = [];
      incList.forEach(function (it, i) {
        var r = getVal(it, 'TotalRevenue', 'Total_Revenue');
        var ni = getVal(it, 'NetIncome', 'Net_Income');
        if (!r || ni === undefined || ni === null) return;
        mLabels.push(labels[i]);
        netMargVals.push((ni / r) * 100);
      });
      window.App.Charts.renderLineChart(canvasMargins, {
        labels: mLabels,
        values: netMargVals,
        formatY: function (v) { return window.App.Format.axisPercent(v); }
      });
    }

    // 5. Cash vs Debt
    var canvasDebt = document.getElementById('chart-debt-cash');
    if (canvasDebt) {
      var cashVals = balList.map(function (it) {
        var v = getVal(it, 'CashAndCashEquivalents', 'Cash_And_Cash_Equivalents');
        return v !== undefined ? v : 0;
      });
      var debtVals = balList.map(function (it) {
        var v = getVal(it, 'TotalDebt', 'Total_Debt');
        return v !== undefined ? v : 0;
      });
      window.App.Charts.renderGroupedBarChart(canvasDebt, {
        labels: labels,
        series: [
          { name: 'Cash', data: cashVals, color: '#10b981' },
          { name: 'Debt', data: debtVals, color: '#ef4444' }
        ],
        formatY: function (v) { return window.App.Format.axisMoney(v); }
      });
    }

    // 6. Returns (%)
    var canvasReturns = document.getElementById('chart-returns');
    if (canvasReturns) {
      var rLabels = [], roeVals = [];
      incList.forEach(function (it, i) {
        var eq = balList[i] ? getVal(balList[i], 'StockholdersEquity', 'Stockholders_Equity') : undefined;
        var ni = getVal(it, 'NetIncome', 'Net_Income');
        if (!eq || ni === undefined || ni === null) return;
        rLabels.push(labels[i]);
        roeVals.push((ni / eq) * 100);
      });
      window.App.Charts.renderLineChart(canvasReturns, {
        labels: rLabels,
        values: roeVals,
        formatY: function (v) { return window.App.Format.axisPercent(v); }
      });
    }
  }

  function renderStatementsView(container, stock) {
    var currency = (stock.quote && stock.quote.currency) || 'EUR';

    var html = '' +
      '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">' +
        '<div class="horizontal-scroll-row" style="margin-bottom: 0; padding-bottom: 0;">' +
          '<button class="sub-tab-btn ' + (activeStatement === 'income' ? 'active' : '') + '" data-stmt="income">Gewinn &amp; Verlust</button>' +
          '<button class="sub-tab-btn ' + (activeStatement === 'balance' ? 'active' : '') + '" data-stmt="balance">Bilanz</button>' +
          '<button class="sub-tab-btn ' + (activeStatement === 'cashflow' ? 'active' : '') + '" data-stmt="cashflow">Cash Flow</button>' +
        '</div>' +
        '<select id="stmt-period-select" class="sort-select">' +
          '<option value="quarterly" ' + (activePeriod === 'quarterly' ? 'selected' : '') + '>Quartale</option>' +
          '<option value="annual" ' + (activePeriod === 'annual' ? 'selected' : '') + '>Jährlich</option>' +
        '</select>' +
      '</div>' +

      '<div class="card" style="padding: 10px;">' +
        '<div id="statement-table-wrapper" class="table-responsive-wrapper"></div>' +
      '</div>';

    container.innerHTML = html;

    var stmtBtns = container.querySelectorAll('[data-stmt]');
    stmtBtns.forEach(function (btn) {
      btn.onclick = function () {
        stmtBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        activeStatement = btn.getAttribute('data-stmt');
        renderSelectedStatementTable(stock, currency);
      };
    });

    var periodSelect = document.getElementById('stmt-period-select');
    if (periodSelect) {
      periodSelect.onchange = function (e) {
        activePeriod = e.target.value;
        renderSelectedStatementTable(stock, currency);
      };
    }

    renderSelectedStatementTable(stock, currency);
  }

  function renderSelectedStatementTable(stock, currency) {
    var wrapper = document.getElementById('statement-table-wrapper');
    if (!wrapper) return;

    var fin = stock.financials || {};
    var dataList = [];
    var rowsMeta = [];

    if (activeStatement === 'income') {
      dataList = (fin.incomeStatement && fin.incomeStatement[activePeriod]) || [];
      rowsMeta = [
        { label: 'Umsatzerlöse (Total Revenue)', camel: 'TotalRevenue', snake: 'Total_Revenue' },
        { label: 'Herstellungskosten (Cost of Revenue)', camel: 'CostOfRevenue', snake: 'Cost_Of_Revenue' },
        { label: 'Bruttoergebnis (Gross Profit)', camel: 'GrossProfit', snake: 'Gross_Profit', bold: true },
        { label: 'Betriebsergebnis (Operating Income)', camel: 'OperatingIncome', snake: 'Operating_Income', bold: true },
        { label: 'Jahresüberschuss (Net Income)', camel: 'NetIncome', snake: 'Net_Income', highlight: true },
        { label: 'Verwässertes EPS', camel: 'DilutedEPS', snake: 'Diluted_EPS', isNumber: true }
      ];
    } else if (activeStatement === 'balance') {
      dataList = (fin.balanceSheet && fin.balanceSheet[activePeriod]) || [];
      rowsMeta = [
        { label: 'Umlaufvermögen (Current Assets)', camel: 'CurrentAssets', snake: 'Current_Assets' },
        { label: 'Zahlungsmittel (Cash &amp; Equiv.)', camel: 'CashAndCashEquivalents', snake: 'Cash_And_Cash_Equivalents' },
        { label: 'Gesamtvermögen (Total Assets)', camel: 'TotalAssets', snake: 'Total_Assets', bold: true },
        { label: 'Kurzfristige Verbindlichkeiten', camel: 'CurrentLiabilities', snake: 'Current_Liabilities' },
        { label: 'Gesamtverschuldung (Total Debt)', camel: 'TotalDebt', snake: 'Total_Debt' },
        { label: 'Gesamtverbindlichkeiten', camel: 'TotalLiabilitiesNetMinorityInterest', snake: 'Total_Liabilities_Net_Minority_Interest' },
        { label: 'Eigenkapital (Stockholders Equity)', camel: 'StockholdersEquity', snake: 'Stockholders_Equity', highlight: true }
      ];
    } else {
      dataList = (fin.cashFlow && fin.cashFlow[activePeriod]) || [];
      rowsMeta = [
        { label: 'Operativer Cashflow (Operating CF)', camel: 'OperatingCashFlow', snake: 'Operating_Cash_Flow', bold: true },
        { label: 'Investitionsausgaben (CapEx)', camel: 'CapitalExpenditure', snake: 'Capital_Expenditure' },
        { label: 'Free Cash Flow (FCF)', camel: 'FreeCashFlow', snake: 'Free_Cash_Flow', highlight: true }
      ];
    }

    if (dataList.length === 0) {
      wrapper.innerHTML = '<div class="state-box"><p>Keine Daten für diesen Bericht verfügbar.</p></div>';
      return;
    }

    var html = '<table class="data-table"><thead><tr><th>Position (' + currency + ')</th>';
    dataList.forEach(function (entry) {
      html += '<th style="text-align: right;">' + window.App.Format.date(entry.date) + '</th>';
    });
    html += '</tr></thead><tbody>';

    rowsMeta.forEach(function (row) {
      var rowStyle = row.highlight ? 'font-weight: 700; color: #fff; background: rgba(99, 102, 241, 0.12);' : (row.bold ? 'font-weight: 600;' : '');
      html += '<tr style="' + rowStyle + '"><td>' + row.label + '</td>';

      dataList.forEach(function (entry) {
        var rawVal = getVal(entry, row.camel, row.snake);
        var formatted = '—';
        if (rawVal !== undefined && rawVal !== null) {
          formatted = row.isNumber ? window.App.Format.number(rawVal, 2) : window.App.Format.compactNumber(rawVal);
        }
        html += '<td style="text-align: right; font-variant-numeric: tabular-nums;">' + formatted + '</td>';
      });

      html += '</tr>';
    });

    html += '</tbody></table>';
    wrapper.innerHTML = html;
  }

  return {
    render: render
  };
})();
// js/stock-financials.js
// Visualisiert fundamentale Kennzahlen im Financials-Tab unter "Charts".
// Beinhaltet Zeitraum- (1Y, 3Y, 5Y, 10Y, MAX) und Periodenfilter (Quarterly, Annual, TTM)
// für alle geforderten Diagrammkategorien (Erträge, Cashflows, Multiples, Margen, Liquidität, Verschuldung).

(function () {
  "use strict";

  let currentTimeframe = "5Y";
  let currentPeriod = "Quarterly"; // Quarterly | Annual | TTM

  function render(stockData) {
    const container = document.getElementById("financialChartsGrid");
    if (!container) return;

    if (!stockData || !stockData.financialsHistory || stockData.financialsHistory.length === 0) {
      container.innerHTML = '<div class="empty-data-hint">Keine Finanzhistorie verfügbar.</div>';
      return;
    }

    // Controls synchronisieren
    initControls(stockData);

    // Daten aggregieren und filtern
    const seriesData = prepareFinancialSeries(stockData.financialsHistory, currentTimeframe, currentPeriod, stockData.overview);

    if (seriesData.labels.length === 0) {
      container.innerHTML = '<div class="empty-data-hint">Keine Daten für den gewählten Zeitraum vorhanden.</div>';
      return;
    }

    const badgeLabel = currentPeriod;

    // Erzeuge HTML für alle Diagrammkarten
    container.innerHTML =
      // 1. Revenue & Gross Profit
      window.StockCharts.createChartCardHTML({
        id: "fin_chart_rev_gp",
        title: "Umsatz & Bruttogewinn",
        badge: badgeLabel,
        series: [
          { label: "Umsatz", color: window.StockCharts.PALETTE.blue },
          { label: "Bruttogewinn", color: window.StockCharts.PALETTE.green }
        ]
      }) +

      // 2. Operating Income & Net Income
      window.StockCharts.createChartCardHTML({
        id: "fin_chart_income",
        title: "Operatives Ergebnis & Reingewinn",
        badge: badgeLabel,
        series: [
          { label: "Operatives Ergebnis", color: window.StockCharts.PALETTE.yellow },
          { label: "Reingewinn", color: window.StockCharts.PALETTE.purple }
        ]
      }) +

      // 3. Cash Flow (Operating Cash Flow & Free Cash Flow)
      window.StockCharts.createChartCardHTML({
        id: "fin_chart_cf",
        title: "Cashflow (OCF & FCF)",
        badge: badgeLabel,
        series: [
          { label: "Operativer Cashflow", color: window.StockCharts.PALETTE.green },
          { label: "Free Cashflow", color: window.StockCharts.PALETTE.blue }
        ]
      }) +

      // 4. Margins (Gross, Operating, Net, FCF)
      window.StockCharts.createChartCardHTML({
        id: "fin_chart_margins",
        title: "Margenverlauf",
        badge: badgeLabel,
        series: [
          { label: "Bruttomarge", color: window.StockCharts.PALETTE.blue },
          { label: "Operative Marge", color: window.StockCharts.PALETTE.yellow },
          { label: "Nettomarge", color: window.StockCharts.PALETTE.purple },
          { label: "FCF-Marge", color: window.StockCharts.PALETTE.green }
        ]
      }) +

      // 5. Returns on Capital (ROE & ROIC)
      window.StockCharts.createChartCardHTML({
        id: "fin_chart_returns",
        title: "Kapitalrenditen (ROE & ROIC)",
        badge: badgeLabel,
        series: [
          { label: "ROE", color: window.StockCharts.PALETTE.pink },
          { label: "ROIC", color: window.StockCharts.PALETTE.green }
        ]
      }) +

      // 6. Liquidity (Current Ratio & Quick Ratio)
      window.StockCharts.createChartCardHTML({
        id: "fin_chart_liquidity",
        title: "Liquiditätskennzahlen",
        badge: badgeLabel,
        series: [
          { label: "Current Ratio", color: window.StockCharts.PALETTE.blue },
          { label: "Assets / Liabilities", color: window.StockCharts.PALETTE.yellow }
        ]
      }) +

      // 7. Cash vs. Debt
      window.StockCharts.createChartCardHTML({
        id: "fin_chart_debt",
        title: "Liquide Mittel vs. Gesamtverschuldung",
        badge: badgeLabel,
        series: [
          { label: "Cash & Äquivalente", color: window.StockCharts.PALETTE.green },
          { label: "Finanzschulden", color: window.StockCharts.PALETTE.red }
        ]
      }) +

      // 8. Capital Intensity (CapEx / Umsatz)
      window.StockCharts.createChartCardHTML({
        id: "fin_chart_capex",
        title: "Kapitalintensität (CapEx / Umsatz)",
        badge: badgeLabel,
        series: [
          { label: "CapEx Quote", color: window.StockCharts.PALETTE.orange }
        ]
      });

    // Diagramme zeichnen
    drawCharts(seriesData);
  }

  function initControls(stockData) {
    const tfSelect = document.getElementById("chartTimeframeSelect");
    const periodSelect = document.getElementById("chartPeriodSelect");

    if (tfSelect && !tfSelect.dataset.listenerAttached) {
      tfSelect.value = currentTimeframe;
      tfSelect.addEventListener("change", function () {
        currentTimeframe = this.value;
        render(stockData);
      });
      tfSelect.dataset.listenerAttached = "true";
    }

    if (periodSelect && !periodSelect.dataset.listenerAttached) {
      periodSelect.value = currentPeriod;
      periodSelect.addEventListener("change", function () {
        currentPeriod = this.value;
        render(stockData);
      });
      periodSelect.dataset.listenerAttached = "true";
    }
  }

  function prepareFinancialSeries(history, timeframe, period) {
    let sorted = history.slice().sort(function (a, b) {
      return (a.date || "").localeCompare(b.date || "");
    });

    // Aggregation: Falls Annual oder TTM gewählt ist
    let processed = [];
    if (period === "Annual") {
      const yearMap = {};
      sorted.forEach(function (row) {
        const y = (row.date || "").split("-")[0];
        if (!y) return;
        if (!yearMap[y]) {
          yearMap[y] = Object.assign({}, row, { date: y, periodCount: 0 });
        }
        yearMap[y].revenue = (yearMap[y].revenue || 0) + (row.revenue || 0);
        yearMap[y].grossProfit = (yearMap[y].grossProfit || 0) + (row.grossProfit || 0);
        yearMap[y].operatingIncome = (yearMap[y].operatingIncome || 0) + (row.operatingIncome || 0);
        yearMap[y].netIncome = (yearMap[y].netIncome || 0) + (row.netIncome || 0);
        yearMap[y].operatingCashFlow = (yearMap[y].operatingCashFlow || 0) + (row.operatingCashFlow || 0);
        yearMap[y].freeCashFlow = (yearMap[y].freeCashFlow || 0) + (row.freeCashFlow || 0);
        yearMap[y].capitalExpenditure = (yearMap[y].capitalExpenditure || 0) + (row.capitalExpenditure || 0);
        // Bilanzwerte zum Jahresende übernehmen
        yearMap[y].totalAssets = row.totalAssets != null ? row.totalAssets : yearMap[y].totalAssets;
        yearMap[y].currentAssets = row.currentAssets != null ? row.currentAssets : yearMap[y].currentAssets;
        yearMap[y].totalLiabilities = row.totalLiabilities != null ? row.totalLiabilities : yearMap[y].totalLiabilities;
        yearMap[y].currentLiabilities = row.currentLiabilities != null ? row.currentLiabilities : yearMap[y].currentLiabilities;
        yearMap[y].stockholdersEquity = row.stockholdersEquity != null ? row.stockholdersEquity : yearMap[y].stockholdersEquity;
        yearMap[y].totalDebt = row.totalDebt != null ? row.totalDebt : yearMap[y].totalDebt;
        yearMap[y].cashAndEquivalents = row.cashAndEquivalents != null ? row.cashAndEquivalents : yearMap[y].cashAndEquivalents;
        yearMap[y].periodCount++;
      });
      processed = Object.keys(yearMap).map(function (k) { return yearMap[k]; });
    } else if (period === "TTM") {
      for (let i = 0; i < sorted.length; i++) {
        const windowSlice = sorted.slice(Math.max(0, i - 3), i + 1);
        const latest = sorted[i];
        let revTTM = 0, gpTTM = 0, opTTM = 0, netTTM = 0, ocfTTM = 0, fcfTTM = 0, capexTTM = 0;
        windowSlice.forEach(function (item) {
          revTTM += (item.revenue || 0);
          gpTTM += (item.grossProfit || 0);
          opTTM += (item.operatingIncome || 0);
          netTTM += (item.netIncome || 0);
          ocfTTM += (item.operatingCashFlow || 0);
          fcfTTM += (item.freeCashFlow || 0);
          capexTTM += (item.capitalExpenditure || 0);
        });

        processed.push(Object.assign({}, latest, {
          revenue: revTTM,
          grossProfit: gpTTM,
          operatingIncome: opTTM,
          netIncome: netTTM,
          operatingCashFlow: ocfTTM,
          freeCashFlow: fcfTTM,
          capitalExpenditure: capexTTM
        }));
      }
    } else {
      processed = sorted;
    }

    // Zeitraum filtern (z. B. 1Y = 4 Q, 3Y = 12 Q, 5Y = 20 Q, 10Y = 40 Q)
    let limit = processed.length;
    if (period === "Annual") {
      if (timeframe === "1Y") limit = 2;
      else if (timeframe === "3Y") limit = 3;
      else if (timeframe === "5Y") limit = 5;
      else if (timeframe === "10Y") limit = 10;
    } else {
      if (timeframe === "1Y") limit = 4;
      else if (timeframe === "3Y") limit = 12;
      else if (timeframe === "5Y") limit = 20;
      else if (timeframe === "10Y") limit = 40;
    }

    const filtered = processed.slice(-limit);

    const labels = filtered.map(function (item) {
      if (!item.date) return "";
      if (period === "Annual") return item.date;
      const parts = item.date.split("-");
      return parts.length >= 2 ? (parts[1] + "/" + parts[0].slice(2)) : item.date;
    });

    return {
      labels: labels,
      revenue: filtered.map(function (d) { return d.revenue != null ? d.revenue : null; }),
      grossProfit: filtered.map(function (d) { return d.grossProfit != null ? d.grossProfit : null; }),
      operatingIncome: filtered.map(function (d) { return d.operatingIncome != null ? d.operatingIncome : null; }),
      netIncome: filtered.map(function (d) { return d.netIncome != null ? d.netIncome : null; }),
      ocf: filtered.map(function (d) { return d.operatingCashFlow != null ? d.operatingCashFlow : null; }),
      fcf: filtered.map(function (d) { return d.freeCashFlow != null ? d.freeCashFlow : null; }),
      grossMargin: filtered.map(function (d) { return (d.revenue && d.grossProfit) ? (d.grossProfit / d.revenue) * 100 : null; }),
      operatingMargin: filtered.map(function (d) { return (d.revenue && d.operatingIncome) ? (d.operatingIncome / d.revenue) * 100 : null; }),
      netMargin: filtered.map(function (d) { return (d.revenue && d.netIncome) ? (d.netIncome / d.revenue) * 100 : null; }),
      fcfMargin: filtered.map(function (d) { return (d.revenue && d.freeCashFlow) ? (d.freeCashFlow / d.revenue) * 100 : null; }),
      roe: filtered.map(function (d) { return (d.stockholdersEquity && d.stockholdersEquity > 0 && d.netIncome) ? (d.netIncome / d.stockholdersEquity) * 100 : null; }),
      roic: filtered.map(function (d) {
        const invCap = (d.totalAssets != null && d.currentLiabilities != null) ? (d.totalAssets - d.currentLiabilities) : null;
        return (invCap && invCap > 0 && d.operatingIncome) ? (d.operatingIncome / invCap) * 100 : null;
      }),
      currentRatio: filtered.map(function (d) { return (d.currentAssets && d.currentLiabilities) ? (d.currentAssets / d.currentLiabilities) : null; }),
      assetsToLiabilities: filtered.map(function (d) { return (d.totalAssets && d.totalLiabilities) ? (d.totalAssets / d.totalLiabilities) : null; }),
      cash: filtered.map(function (d) { return d.cashAndEquivalents != null ? d.cashAndEquivalents : null; }),
      debt: filtered.map(function (d) { return d.totalDebt != null ? d.totalDebt : null; }),
      capexRatio: filtered.map(function (d) { return (d.revenue && d.capitalExpenditure) ? (Math.abs(d.capitalExpenditure) / d.revenue) * 100 : null; })
    };
  }

  function drawCharts(data) {
    const P = window.StockCharts.PALETTE;

    // 1. Umsatz & Bruttogewinn (Balken)
    window.StockCharts.renderBarChart("fin_chart_rev_gp_canvas", data.labels, [
      { label: "Umsatz", data: data.revenue, color: P.blue },
      { label: "Bruttogewinn", data: data.grossProfit, color: P.green }
    ], "currency");

    // 2. Operatives Ergebnis & Reingewinn (Balken)
    window.StockCharts.renderBarChart("fin_chart_income_canvas", data.labels, [
      { label: "Operatives Ergebnis", data: data.operatingIncome, color: P.yellow },
      { label: "Reingewinn", data: data.netIncome, color: P.purple }
    ], "currency");

    // 3. Cashflow OCF & FCF (Balken)
    window.StockCharts.renderBarChart("fin_chart_cf_canvas", data.labels, [
      { label: "Operativer Cashflow", data: data.ocf, color: P.green },
      { label: "Free Cashflow", data: data.fcf, color: P.blue }
    ], "currency");

    // 4. Margenverlauf (Linie)
    window.StockCharts.renderLineChart("fin_chart_margins_canvas", data.labels, [
      { label: "Bruttomarge", data: data.grossMargin, color: P.blue, fill: false },
      { label: "Operative Marge", data: data.operatingMargin, color: P.yellow, fill: false },
      { label: "Nettomarge", data: data.netMargin, color: P.purple, fill: false },
      { label: "FCF-Marge", data: data.fcfMargin, color: P.green, fill: true }
    ], "percent");

    // 5. Kapitalrenditen ROE & ROIC (Linie)
    window.StockCharts.renderLineChart("fin_chart_returns_canvas", data.labels, [
      { label: "ROE", data: data.roe, color: P.pink, fill: false },
      { label: "ROIC", data: data.roic, color: P.green, fill: true }
    ], "percent");

    // 6. Liquidität (Linie)
    window.StockCharts.renderLineChart("fin_chart_liquidity_canvas", data.labels, [
      { label: "Current Ratio", data: data.currentRatio, color: P.blue, fill: false },
      { label: "Assets / Liabilities", data: data.assetsToLiabilities, color: P.yellow, fill: false }
    ], "multiple");

    // 7. Cash vs. Debt (Balken)
    window.StockCharts.renderBarChart("fin_chart_debt_canvas", data.labels, [
      { label: "Cash & Äquivalente", data: data.cash, color: P.green },
      { label: "Finanzschulden", data: data.debt, color: P.red }
    ], "currency");

    // 8. Kapitalintensität CapEx Quote (Linie)
    window.StockCharts.renderLineChart("fin_chart_capex_canvas", data.labels, [
      { label: "CapEx / Umsatz", data: data.capexRatio, color: P.orange, fill: true }
    ], "percent");
  }

  window.StockFinancials = {
    render: render
  };
})();

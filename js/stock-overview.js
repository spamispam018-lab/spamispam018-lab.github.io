// js/stock-overview.js
// Rendert den Overview-Tab: Kompakte Karten (Kurs, Insider, Funds, Financials-Mini-Chart)
// mit Links auf die passenden Tabs.

(function () {
  "use strict";

  function render(stockData) {
    const container = document.getElementById("overviewGrid");
    if (!container) return;
    if (!stockData) {
      container.innerHTML = '<div class="empty-data-hint">Keine Daten verfügbar.</div>';
      return;
    }

    const overview = stockData.overview || {};
    const holdings = stockData.holdings || {};
    const insiders = holdings.insiders || {};
    const insiderSummary = insiders.summary || {};
    const funds = holdings.funds || {};
    const topHolders = funds.topHolders || [];
    const financialsHistory = stockData.financialsHistory || [];

    // 1. Kurs & Bewertung Quick-Facts
    const pe = overview.trailingPE != null ? Number(overview.trailingPE).toFixed(1) + "x" : "-";
    const fwdPe = overview.forwardPE != null ? Number(overview.forwardPE).toFixed(1) + "x" : "-";
    const mktCap = window.StockCharts.formatCompactNumber(overview.marketCap, "currency");
    const divYield = overview.dividendYield != null ? (Number(overview.dividendYield) * 100).toFixed(2) + "%" : "-";
    const low52 = overview.fiftyTwoWeekLow != null ? Number(overview.fiftyTwoWeekLow).toFixed(2) : "-";
    const high52 = overview.fiftyTwoWeekHigh != null ? Number(overview.fiftyTwoWeekHigh).toFixed(2) : "-";

    // 2. Insider Activity Zusammenfassung
    const buyCnt = insiderSummary.buyCount || 0;
    const sellCnt = insiderSummary.sellCount || 0;
    const buyVal = insiderSummary.totalBoughtValue || 0;
    const sellVal = insiderSummary.totalSoldValue || 0;
    const netVal = buyVal - sellVal;

    let insiderSentiment = "Neutral";
    let insiderClass = "val-neutral";
    if (buyCnt > sellCnt && netVal > 0) {
      insiderSentiment = "Bullish";
      insiderClass = "val-positive";
    } else if (sellCnt > buyCnt || netVal < 0) {
      insiderSentiment = "Bearish";
      insiderClass = "val-negative";
    }

    // 3. Funds Activity Zusammenfassung
    const fundsHeldPercent = funds.institutionsPercentHeld != null
      ? (Number(funds.institutionsPercentHeld) * 100).toFixed(1) + "%"
      : (topHolders.length > 0 ? topHolders.length + " Top-Fonds gemeldet" : "Keine Meldungen");
    const topHolderName = topHolders.length > 0 ? (topHolders[0].holder || "Unbekannt") : "-";

    container.innerHTML =
      // Karte 1: Key Metrics
      '<div class="info-card" style="cursor: pointer;" id="cardKeyMetrics">' +
        '<div class="chart-header">' +
          '<span class="chart-title">Kennzahlen-Überblick</span>' +
          '<span class="chart-badge">Key Stats</span>' +
        '</div>' +
        '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px;">' +
          '<div><div style="font-size: 10px; color: var(--text-muted);">Marktkap.</div><div style="font-weight: 700;">' + mktCap + '</div></div>' +
          '<div><div style="font-size: 10px; color: var(--text-muted);">KGV (P/E)</div><div style="font-weight: 700;">' + pe + '</div></div>' +
          '<div><div style="font-size: 10px; color: var(--text-muted);">Forward KGV</div><div style="font-weight: 700;">' + fwdPe + '</div></div>' +
          '<div><div style="font-size: 10px; color: var(--text-muted);">Div.-Rendite</div><div style="font-weight: 700;">' + divYield + '</div></div>' +
          '<div><div style="font-size: 10px; color: var(--text-muted);">52W Tief</div><div style="font-weight: 700;">' + low52 + '</div></div>' +
          '<div><div style="font-size: 10px; color: var(--text-muted);">52W Hoch</div><div style="font-weight: 700;">' + high52 + '</div></div>' +
        '</div>' +
      '</div>' +

      // Karte 2: Insider Activity
      '<div class="info-card" style="cursor: pointer;" id="cardInsider">' +
        '<div class="chart-header">' +
          '<span class="chart-title">Insider Activity</span>' +
          '<span class="chart-badge ' + insiderClass + '">' + insiderSentiment + '</span>' +
        '</div>' +
        '<div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px;">' +
          '<div>Käufe: <strong>' + buyCnt + '</strong> (' + window.StockCharts.formatCompactNumber(buyVal, "currency") + ')</div>' +
          '<div>Verkäufe: <strong>' + sellCnt + '</strong> (' + window.StockCharts.formatCompactNumber(sellVal, "currency") + ')</div>' +
        '</div>' +
        '<div style="margin-top: 6px; font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between;">' +
          '<span>Netto-Volumen:</span>' +
          '<span class="' + (netVal >= 0 ? "val-positive" : "val-negative") + '" style="font-weight: 700;">' +
            (netVal >= 0 ? "+" : "") + window.StockCharts.formatCompactNumber(netVal, "currency") +
          '</span>' +
        '</div>' +
      '</div>' +

      // Karte 3: Funds Activity
      '<div class="info-card" style="cursor: pointer;" id="cardFunds">' +
        '<div class="chart-header">' +
          '<span class="chart-title">Institutional & Funds</span>' +
          '<span class="chart-badge">Holdings</span>' +
        '</div>' +
        '<div style="margin-top: 8px; font-size: 12px;">' +
          '<div style="display: flex; justify-content: space-between;">' +
            '<span style="color: var(--text-muted);">Institutioneller Anteil:</span>' +
            '<strong style="color: var(--text-main);">' + fundsHeldPercent + '</strong>' +
          '</div>' +
          '<div style="display: flex; justify-content: space-between; margin-top: 4px;">' +
            '<span style="color: var(--text-muted);">Größter Anteilseigner:</span>' +
            '<strong style="max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + topHolderName + '</strong>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Karte 4: Mini-Financials Chart (Letzte 4 Quartale)
      window.StockCharts.createChartCardHTML({
        id: "overview_mini_financials",
        title: "Financials (Letzte 4 Quartale)",
        badge: "Quarterly",
        series: [
          { label: "Umsatz", color: window.StockCharts.PALETTE.blue },
          { label: "Op. Cashflow", color: window.StockCharts.PALETTE.green },
          { label: "Nettogewinn", color: window.StockCharts.PALETTE.purple }
        ]
      });

    // Klick-Events für Tab-Navigation
    const cardKeyMetrics = document.getElementById("cardKeyMetrics");
    if (cardKeyMetrics) {
      cardKeyMetrics.addEventListener("click", function () {
        window.StockNav.switchTab("financials");
      });
    }

    const cardInsider = document.getElementById("cardInsider");
    if (cardInsider) {
      cardInsider.addEventListener("click", function () {
        window.StockNav.switchTab("holdings");
      });
    }

    const cardFunds = document.getElementById("cardFunds");
    if (cardFunds) {
      cardFunds.addEventListener("click", function () {
        window.StockNav.switchTab("holdings");
      });
    }

    const chartCard = document.getElementById("overview_mini_financials");
    if (chartCard) {
      chartCard.style.cursor = "pointer";
      chartCard.addEventListener("click", function (e) {
        if (e.target.tagName !== "CANVAS") {
          window.StockNav.switchTab("financials");
        }
      });
    }

    // Mini-Chart rendern
    renderMiniChart(financialsHistory);
  }

  function renderMiniChart(history) {
    if (!history || history.length === 0) return;
    const last4 = history.slice(-4);
    if (last4.length === 0) return;

    const labels = last4.map(function (item) {
      const parts = (item.date || "").split("-");
      return parts.length >= 2 ? (parts[1] + "/" + parts[0].slice(2)) : item.date;
    });

    const revData = last4.map(function (item) { return item.revenue != null ? item.revenue : 0; });
    const ocfData = last4.map(function (item) { return item.operatingCashFlow != null ? item.operatingCashFlow : 0; });
    const netData = last4.map(function (item) { return item.netIncome != null ? item.netIncome : 0; });

    window.StockCharts.renderBarChart(
      "overview_mini_financials_canvas",
      labels,
      [
        { label: "Umsatz", data: revData, color: window.StockCharts.PALETTE.blue },
        { label: "Op. Cashflow", data: ocfData, color: window.StockCharts.PALETTE.green },
        { label: "Nettogewinn", data: netData, color: window.StockCharts.PALETTE.purple }
      ],
      "currency"
    );
  }

  window.StockOverview = {
    render: render
  };
})();

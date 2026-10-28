// js/stock-holdings.js
// Visualisiert Insider- und Institutional/Funds-Aktivitäten ohne Politician-Daten.
// Beinhaltet Kacheln (Käufe/Verkäufe), Filter-Tabs, scrollbare Tabellen und den Buy/Sell-Chart.

(function () {
  "use strict";

  let currentInsiderFilter = "ALL"; // ALL | BUYS | SELLS

  function render(stockData) {
    const container = document.getElementById("holdingsWrapper");
    if (!container) return;

    if (!stockData || !stockData.holdings) {
      container.innerHTML = '<div class="empty-data-hint">Keine Holdings- oder Insider-Daten verfügbar.</div>';
      return;
    }

    const holdings = stockData.holdings;
    const insiders = holdings.insiders || {};
    const summary = insiders.summary || {};
    const transactions = insiders.transactions || [];
    const funds = holdings.funds || {};
    const topHolders = funds.topHolders || [];

    const buyCnt = summary.buyCount || 0;
    const sellCnt = summary.sellCount || 0;
    const buyVal = summary.totalBoughtValue || 0;
    const sellVal = summary.totalSoldValue || 0;
    const netVal = buyVal - sellVal;

    let sentiment = "Neutral";
    let sentimentClass = "val-neutral";
    if (buyCnt > sellCnt && netVal > 0) {
      sentiment = "Bullish";
      sentimentClass = "val-positive";
    } else if (sellCnt > buyCnt || netVal < 0) {
      sentiment = "Bearish";
      sentimentClass = "val-negative";
    }

    container.innerHTML =
      // 1. INSIDER ACTIVITY SECTION
      '<div class="info-card" style="margin-bottom: 14px;">' +
        '<div class="chart-header">' +
          '<div class="chart-title-group">' +
            '<span class="chart-title">Insider Activity (Form 4)</span>' +
            '<span class="chart-badge ' + sentimentClass + '">' + sentiment + '</span>' +
          '</div>' +
          '<span style="font-size: 11px; color: var(--text-muted);">' + (transactions.length) + ' Transaktionen</span>' +
        '</div>' +

        // Kacheln: Käufe vs Verkäufe
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0;">' +
          '<div style="background-color: var(--bg-chip); border-radius: 8px; padding: 10px; border-left: 3px solid var(--color-green);">' +
            '<div style="font-size: 11px; color: var(--text-muted);">Käufe (Trades)</div>' +
            '<div style="font-size: 16px; font-weight: 700; color: var(--color-green); margin-top: 2px;">' +
              window.StockCharts.formatCompactNumber(buyVal, "currency") +
            '</div>' +
            '<div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">' + buyCnt + ' Transaktionen</div>' +
          '</div>' +
          '<div style="background-color: var(--bg-chip); border-radius: 8px; padding: 10px; border-left: 3px solid var(--color-red);">' +
            '<div style="font-size: 11px; color: var(--text-muted);">Verkäufe (Trades)</div>' +
            '<div style="font-size: 16px; font-weight: 700; color: var(--color-red); margin-top: 2px;">' +
              window.StockCharts.formatCompactNumber(sellVal, "currency") +
            '</div>' +
            '<div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">' + sellCnt + ' Transaktionen</div>' +
          '</div>' +
        '</div>' +

        // Netto-Übersicht
        '<div style="display: flex; justify-content: space-between; font-size: 12px; padding: 4px 2px 8px 2px; border-bottom: 1px solid var(--border-color);">' +
          '<span style="color: var(--text-muted);">Netto Insider-Volumen:</span>' +
          '<strong class="' + (netVal >= 0 ? "val-positive" : "val-negative") + '">' +
            (netVal >= 0 ? "+" : "") + window.StockCharts.formatCompactNumber(netVal, "currency") +
          '</strong>' +
        '</div>' +

        // Filter-Umschalter: Alle / Buys / Sells
        '<div style="display: flex; justify-content: space-between; align-items: center; margin: 10px 0 8px 0;">' +
          '<div style="display: flex; gap: 4px;">' +
            '<button type="button" class="stmt-toggle-btn ' + (currentInsiderFilter === "ALL" ? "active" : "") + '" id="insiderFilterAll">Alle</button>' +
            '<button type="button" class="stmt-toggle-btn ' + (currentInsiderFilter === "BUYS" ? "active" : "") + '" id="insiderFilterBuys">Käufe</button>' +
            '<button type="button" class="stmt-toggle-btn ' + (currentInsiderFilter === "SELLS" ? "active" : "") + '" id="insiderFilterSells">Verkäufe</button>' +
          '</div>' +
        '</div>' +

        // Scrollbare Tabelle für Transaktionen
        '<div class="table-scroll-container" style="max-height: 240px; overflow-y: auto;">' +
          renderInsiderTable(transactions, currentInsiderFilter) +
        '</div>' +
      '</div>' +

      // 2. INSIDER TRADES VOLUMEN CHART
      window.StockCharts.createChartCardHTML({
        id: "holdings_insider_chart",
        title: "Insider Transaktionsvolumen",
        badge: "Letzte Aktivitäten",
        series: [
          { label: "Käufe", color: window.StockCharts.PALETTE.green },
          { label: "Verkäufe", color: window.StockCharts.PALETTE.red }
        ]
      }) +

      // 3. FUNDS & INSTITUTIONAL ACTIVITY SECTION
      '<div class="info-card">' +
        '<div class="chart-header">' +
          '<div class="chart-title-group">' +
            '<span class="chart-title">Top Institutional & Funds</span>' +
            '<span class="chart-badge">Holdings</span>' +
          '</div>' +
        '</div>' +
        '<div style="margin: 8px 0 10px 0; font-size: 12px; color: var(--text-muted);">' +
          'Gemeldete Bestände der größten institutionellen Investoren und Fonds.' +
        '</div>' +
        '<div class="table-scroll-container" style="max-height: 280px; overflow-y: auto;">' +
          renderFundsTable(topHolders) +
        '</div>' +
      '</div>';

    attachFilterEvents(stockData);
    renderInsiderChart(transactions);
  }

  function renderInsiderTable(transactions, filter) {
    if (!transactions || transactions.length === 0) {
      return '<div class="empty-data-hint">Keine Transaktionen gemeldet.</div>';
    }

    const filtered = transactions.filter(function (t) {
      const txt = (t.transaction || "").toLowerCase();
      const isBuy = txt.includes("buy") || txt.includes("purchase");
      const isSell = txt.includes("sale") || txt.includes("sell");
      if (filter === "BUYS") return isBuy;
      if (filter === "SELLS") return isSell;
      return true;
    });

    if (filtered.length === 0) {
      return '<div class="empty-data-hint">Keine Transaktionen für diesen Filter.</div>';
    }

    let rows = filtered.map(function (t) {
      const txt = (t.transaction || "").toLowerCase();
      const isBuy = txt.includes("buy") || txt.includes("purchase");
      const isSell = txt.includes("sale") || txt.includes("sell");
      const badgeClass = isBuy ? "val-positive" : (isSell ? "val-negative" : "val-neutral");

      const dateStr = t.date ? t.date.substring(2) : "-";
      const shares = t.shares != null ? Number(t.shares).toLocaleString("de-DE") : "-";
      const value = t.value != null ? window.StockCharts.formatCompactNumber(t.value, "currency") : "-";

      return (
        '<tr>' +
          '<td title="' + (t.insider || "-") + '">' + (t.insider || "Unbekannt") + '<div style="font-size: 9px; color: var(--text-muted);">' + (t.position || "") + '</div></td>' +
          '<td>' + dateStr + '</td>' +
          '<td class="' + badgeClass + '" style="font-weight: 600;">' + (isBuy ? "Kauf" : (isSell ? "Verkauf" : "Sonstiges")) + '</td>' +
          '<td>' + shares + '</td>' +
          '<td style="font-weight: 700;">' + value + '</td>' +
        '</tr>'
      );
    }).join("");

    return (
      '<table class="financial-table">' +
        '<thead>' +
          '<tr>' +
            '<th>Insider</th>' +
            '<th>Datum</th>' +
            '<th>Typ</th>' +
            '<th>Aktien</th>' +
            '<th>Wert</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>'
    );
  }

  function renderFundsTable(topHolders) {
    if (!topHolders || topHolders.length === 0) {
      return '<div class="empty-data-hint">Keine Fondspositionen gemeldet.</div>';
    }

    let rows = topHolders.map(function (f) {
      const shares = f.shares != null ? window.StockCharts.formatCompactNumber(f.shares) : "-";
      const val = f.value != null ? window.StockCharts.formatCompactNumber(f.value, "currency") : "-";
      const pct = f.percentOut != null ? (Number(f.percentOut) * 100).toFixed(2) + "%" : "-";
      const dt = f.dateReported ? f.dateReported.substring(2) : "-";

      return (
        '<tr>' +
          '<td title="' + (f.holder || "-") + '">' + (f.holder || "Unbekannt") + '</td>' +
          '<td>' + pct + '</td>' +
          '<td>' + shares + '</td>' +
          '<td style="font-weight: 700;">' + val + '</td>' +
          '<td>' + dt + '</td>' +
        '</tr>'
      );
    }).join("");

    return (
      '<table class="financial-table">' +
        '<thead>' +
          '<tr>' +
            '<th>Fonds / Institution</th>' +
            '<th>Anteil</th>' +
            '<th>Aktien</th>' +
            '<th>Wert</th>' +
            '<th>Gemeldet</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>'
    );
  }

  function renderInsiderChart(transactions) {
    if (!transactions || transactions.length === 0) return;

    // Aggregation der Transaktionswerte nach Datum (chronologisch sortiert)
    const dateMap = {};
    const sorted = transactions.slice().sort(function (a, b) {
      return (a.date || "").localeCompare(b.date || "");
    });

    sorted.forEach(function (t) {
      if (!t.date || !t.value) return;
      const d = t.date;
      if (!dateMap[d]) {
        dateMap[d] = { buy: 0, sell: 0 };
      }
      const txt = (t.transaction || "").toLowerCase();
      if (txt.includes("buy") || txt.includes("purchase")) {
        dateMap[d].buy += Number(t.value);
      } else if (txt.includes("sale") || txt.includes("sell")) {
        dateMap[d].sell += Number(t.value);
      }
    });

    const dates = Object.keys(dateMap).slice(-8); // Letzte 8 Meldedaten
    if (dates.length === 0) return;

    const labels = dates.map(function (dt) {
      const p = dt.split("-");
      return p.length >= 3 ? (p[2] + "." + p[1]) : dt;
    });

    const buyData = dates.map(function (d) { return dateMap[d].buy; });
    const sellData = dates.map(function (d) { return dateMap[d].sell; });

    window.StockCharts.renderBarChart(
      "holdings_insider_chart_canvas",
      labels,
      [
        { label: "Käufe", data: buyData, color: window.StockCharts.PALETTE.green },
        { label: "Verkäufe", data: sellData, color: window.StockCharts.PALETTE.red }
      ],
      "currency"
    );
  }

  function attachFilterEvents(stockData) {
    const btnAll = document.getElementById("insiderFilterAll");
    const btnBuys = document.getElementById("insiderFilterBuys");
    const btnSells = document.getElementById("insiderFilterSells");

    function setFilter(type) {
      currentInsiderFilter = type;
      render(stockData);
    }

    if (btnAll) btnAll.addEventListener("click", function () { setFilter("ALL"); });
    if (btnBuys) btnBuys.addEventListener("click", function () { setFilter("BUYS"); });
    if (btnSells) btnSells.addEventListener("click", function () { setFilter("SELLS"); });
  }

  window.StockHoldings = {
    render: render
  };
})();

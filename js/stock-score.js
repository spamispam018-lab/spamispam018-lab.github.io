// js/stock-score.js
// Berechnet und visualisiert den 1-bis-5-Sterne-Score pro Kategorie (Profitabilität, Bewertung,
// Wachstum, Finanzielle Stärke) inklusive 5-Quadrate-Ampelkacheln und Score-Historie.

(function () {
  "use strict";

  // Erzeugt das HTML für die 5 Quadrate (grün, gelb, grau)
  function renderScoreSquares(score) {
    let html = '<div class="score-squares-row">';
    for (let i = 1; i <= 5; i++) {
      let colorClass = "sq-gray";
      if (score !== null && score !== undefined) {
        if (i <= score) {
          colorClass = score >= 4 ? "sq-green" : (score >= 3 ? "sq-yellow" : "sq-yellow");
        }
      }
      html += '<span class="score-sq ' + colorClass + '"></span>';
    }
    html += '</div>';
    return html;
  }

  // Ermittelt aus den Rohdaten die aktuellen Kennzahlen für das Scoring
  function extractMetricValues(stockData) {
    const overview = stockData.overview || {};
    const history = stockData.financialsHistory || [];
    const analyst = stockData.analyst || {};
    const epsEstimates = analyst.epsEstimates || [];

    const latest = history.length > 0 ? history[history.length - 1] : {};
    const prevYear = history.length >= 5 ? history[history.length - 5] : null;

    // TTM Summenbildung für Margen (letzte 4 Quartale)
    const last4 = history.slice(-4);
    let revTTM = 0, opIncTTM = 0, netIncTTM = 0, fcfTTM = 0, capexTTM = 0;
    last4.forEach(function (q) {
      if (q.revenue) revTTM += q.revenue;
      if (q.operatingIncome) opIncTTM += q.operatingIncome;
      if (q.netIncome) netIncTTM += q.netIncome;
      if (q.freeCashFlow) fcfTTM += q.freeCashFlow;
      if (q.capitalExpenditure) capexTTM += Math.abs(q.capitalExpenditure);
    });

    const opMargin = revTTM > 0 ? (opIncTTM / revTTM) * 100 : null;
    const netMargin = revTTM > 0 ? (netIncTTM / revTTM) * 100 : null;
    const fcfMargin = revTTM > 0 ? (fcfTTM / revTTM) * 100 : null;

    // Renditen
    const equity = latest.stockholdersEquity || null;
    const roe = (equity && equity > 0 && netIncTTM) ? (netIncTTM / equity) * 100 : null;
    const totalAssets = latest.totalAssets || null;
    const currLiab = latest.currentLiabilities || 0;
    const investedCap = (totalAssets && currLiab) ? (totalAssets - currLiab) : null;
    const roic = (investedCap && investedCap > 0 && opIncTTM) ? (opIncTTM / investedCap) * 100 : null;

    // Wachstum YoY
    let revGrowth = null, netGrowth = null, fcfGrowth = null;
    if (prevYear && prevYear.revenue && latest.revenue) {
      revGrowth = ((latest.revenue - prevYear.revenue) / Math.abs(prevYear.revenue)) * 100;
    }
    if (prevYear && prevYear.netIncome && latest.netIncome) {
      netGrowth = ((latest.netIncome - prevYear.netIncome) / Math.abs(prevYear.netIncome)) * 100;
    }
    if (prevYear && prevYear.freeCashFlow && latest.freeCashFlow) {
      fcfGrowth = ((latest.freeCashFlow - prevYear.freeCashFlow) / Math.abs(prevYear.freeCashFlow)) * 100;
    }

    // EPS Surprises Durchschnitt
    let epsSurpAvg = null;
    if (epsEstimates.length > 0) {
      const validSurps = epsEstimates.filter(function (e) { return e.surprisePercent !== null && !isNaN(e.surprisePercent); });
      if (validSurps.length > 0) {
        const sum = validSurps.reduce(function (acc, e) { return acc + Number(e.surprisePercent); }, 0);
        epsSurpAvg = sum / validSurps.length;
      }
    }

    // Bilanzkennzahlen
    const currAssets = latest.currentAssets || null;
    const currentRatio = (currAssets && latest.currentLiabilities) ? (currAssets / latest.currentLiabilities) : null;
    const totalDebt = latest.totalDebt || null;
    const debtToEquity = (totalDebt && equity && equity > 0) ? (totalDebt / equity) : null;
    const cash = latest.cashAndEquivalents || null;
    const cashToDebt = (cash && totalDebt && totalDebt > 0) ? (cash / totalDebt) : null;
    const capexToRev = (revTTM > 0 && capexTTM > 0) ? (capexTTM / revTTM) * 100 : null;

    // KCV (P/FCF)
    const mktCap = overview.marketCap;
    const pFcf = (mktCap && fcfTTM > 0) ? (mktCap / fcfTTM) : null;

    return {
      operatingMargin: opMargin,
      netMargin: netMargin,
      fcfMargin: fcfMargin,
      roe: roe,
      roic: roic,
      trailingPE: overview.trailingPE,
      forwardPE: overview.forwardPE,
      priceToSales: overview.priceToSales,
      priceToBook: overview.priceToBook,
      priceToFCF: pFcf,
      revenueGrowthYoY: revGrowth,
      netIncomeGrowthYoY: netGrowth,
      fcfGrowthYoY: fcfGrowth,
      epsSurpriseAvg: epsSurpAvg,
      currentRatio: currentRatio,
      debtToEquity: debtToEquity,
      cashToDebt: cashToDebt,
      capexToRevenue: capexToRev
    };
  }

  function render(stockData) {
    const summaryHeader = document.getElementById("scoreSummaryHeader");
    const categoriesList = document.getElementById("scoreCategoriesList");
    if (!summaryHeader || !categoriesList) return;

    if (!stockData || !window.ScoreConfig) {
      summaryHeader.innerHTML = '<div class="empty-data-hint">Score-Daten nicht verfügbar.</div>';
      categoriesList.innerHTML = "";
      return;
    }

    const metricValues = extractMetricValues(stockData);
    const cfg = window.ScoreConfig;
    const categories = cfg.categories;

    let totalScoreSum = 0;
    let totalWeight = 0;
    let categoryScores = {};

    let categoriesHTML = "";

    // Kategorien durchlaufen
    Object.keys(categories).forEach(function (catKey) {
      const cat = categories[catKey];
      let catSum = 0;
      let validMetricCount = 0;

      let metricsRowsHTML = "";

      cat.metrics.forEach(function (m) {
        const val = metricValues[m.id];
        const score = cfg.calculateScore(m, val);

        if (score !== null) {
          catSum += score;
          validMetricCount++;
        }

        let valDisplay = "-";
        if (val !== null && val !== undefined) {
          valDisplay = Number(val).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " " + m.unit;
        }

        metricsRowsHTML +=
          '<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(48, 54, 61, 0.4); font-size: 12px;">' +
            '<span style="color: var(--text-main);">' + m.label + '</span>' +
            '<div style="display: flex; align-items: center; gap: 8px;">' +
              '<span style="color: var(--text-muted); font-variant-numeric: tabular-nums; min-width: 55px; text-align: right;">' + valDisplay + '</span>' +
              renderScoreSquares(score) +
            '</div>' +
          '</div>';
      });

      const catAvg = validMetricCount > 0 ? (catSum / validMetricCount) : 0;
      categoryScores[catKey] = catAvg;
      totalScoreSum += catAvg * (cat.weight || 0.25);
      totalWeight += (cat.weight || 0.25);

      categoriesHTML +=
        '<div class="info-card" style="margin-bottom: 12px;">' +
          '<div class="chart-header" style="margin-bottom: 8px;">' +
            '<div class="chart-title-group">' +
              '<span class="chart-title">' + cat.title + '</span>' +
              '<span class="chart-badge">' + catAvg.toFixed(1) + ' / 5.0</span>' +
            '</div>' +
            renderScoreSquares(Math.round(catAvg)) +
          '</div>' +
          '<div>' + metricsRowsHTML + '</div>' +
        '</div>';
    });

    const finalOverallScore = totalWeight > 0 ? (totalScoreSum / totalWeight) : 0;

    // Header mit Gesamt-Score-Badge und Radar/Verteilungs-Karte
    summaryHeader.innerHTML =
      '<div class="info-card" style="text-align: center; padding: 18px 12px; margin-bottom: 14px;">' +
        '<div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px;">Gesamt-Score</div>' +
        '<div style="font-size: 38px; font-weight: 800; color: var(--color-yellow); line-height: 1.1; margin: 6px 0;">' +
          finalOverallScore.toFixed(1) + '<span style="font-size: 18px; color: var(--text-muted); font-weight: 500;"> / 5.0</span>' +
        '</div>' +
        '<div style="display: flex; justify-content: center; margin-bottom: 8px;">' +
          renderScoreSquares(Math.round(finalOverallScore)) +
        '</div>' +
        '<div style="font-size: 11px; color: var(--text-muted);">' +
          'Berechnet aus ' + Object.keys(categories).length + ' transparenten Kennzahlen-Kategorien' +
        '</div>' +
      '</div>';

    categoriesList.innerHTML = categoriesHTML;
  }

  window.StockScore = {
    render: render
  };
})();

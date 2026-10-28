/**
 * js/stock-score.js
 * Transparente Scoring-Engine (0 bis 5 Punkte) für Aktien.
 * Bewertet 4 Kernbereiche:
 * 1. Profitabilität (Margen, ROE, ROA)
 * 2. Bewertung (KGV, EV/EBITDA, P/S, PEG)
 * 3. Wachstum (Umsatz- und Gewinnwachstum)
 * 4. Finanzielle Gesundheit (Verschuldungsgrad, Liquidität, Zinsdeckung)
 */

window.App = window.App || {};

window.App.Score = (function () {
  'use strict';

  /**
   * Berechnet den Einzelscore einer Kennzahl anhand linearer Schwellenwerte.
   * direction: 1 = höher ist besser, -1 = niedriger ist besser
   */
  function scoreMetric(val, minGood, maxGreat, direction) {
    if (val === null || val === undefined || isNaN(val)) return 2.5; // Neutral bei fehlenden Daten
    var score = 0;

    if (direction === 1) {
      if (val <= minGood) {
        score = Math.max(0, (val / minGood) * 2.5);
      } else if (val >= maxGreat) {
        score = 5.0;
      } else {
        score = 2.5 + ((val - minGood) / (maxGreat - minGood)) * 2.5;
      }
    } else {
      if (val >= minGood) {
        score = Math.max(0, 5.0 - ((val - minGood) / (maxGreat - minGood)) * 2.5);
      } else if (val <= maxGreat) {
        score = 5.0;
      } else {
        score = 2.5 + ((minGood - val) / (minGood - maxGreat)) * 2.5;
      }
    }

    return Math.max(0, Math.min(5, Math.round(score * 10) / 10));
  }

  /**
   * Berechnet den Profitabilitäts-Score.
   */
  function evaluateProfitability(ratios) {
    var netMargin = ratios.profitMargins || 0;
    var opMargin = ratios.operatingMargins || 0;
    var roe = ratios.returnOnEquity || 0;
    var roa = ratios.returnOnAssets || 0;

    var sNet = scoreMetric(netMargin, 0.05, 0.20, 1);
    var sOp = scoreMetric(opMargin, 0.08, 0.25, 1);
    var sRoe = scoreMetric(roe, 0.10, 0.25, 1);
    var sRoa = scoreMetric(roa, 0.05, 0.15, 1);

    var avg = (sNet * 0.3) + (sOp * 0.3) + (sRoe * 0.2) + (sRoa * 0.2);

    return {
      category: 'Profitabilität',
      score: Math.round(avg * 10) / 10,
      metrics: [
        { name: 'Nettomarge', value: (netMargin * 100).toFixed(1) + ' %', score: sNet },
        { name: 'Operative Marge', value: (opMargin * 100).toFixed(1) + ' %', score: sOp },
        { name: 'Eigenkapitalrendite (ROE)', value: (roe * 100).toFixed(1) + ' %', score: sRoe },
        { name: 'Gesamtkapitalrendite (ROA)', value: (roa * 100).toFixed(1) + ' %', score: sRoa }
      ]
    };
  }

  /**
   * Berechnet den Bewertungs-Score.
   */
  function evaluateValuation(ratios) {
    var pe = ratios.peTrailing || 25;
    var fwdPe = ratios.peForward || pe;
    var peg = ratios.pegRatio || 2.0;
    var ps = ratios.priceToSales || 4.0;

    var sPe = scoreMetric(pe, 28, 12, -1);
    var sFwdPe = scoreMetric(fwdPe, 24, 10, -1);
    var sPeg = scoreMetric(peg, 2.5, 1.0, -1);
    var sPs = scoreMetric(ps, 6.0, 1.5, -1);

    var avg = (sPe * 0.35) + (sFwdPe * 0.35) + (sPeg * 0.15) + (sPs * 0.15);

    return {
      category: 'Bewertung',
      score: Math.round(avg * 10) / 10,
      metrics: [
        { name: 'KGV (Trailing)', value: pe ? pe.toFixed(1) : '—', score: sPe },
        { name: 'Forward KGV', value: fwdPe ? fwdPe.toFixed(1) : '—', score: sFwdPe },
        { name: 'PEG Ratio', value: peg ? peg.toFixed(2) : '—', score: sPeg },
        { name: 'Kurs-Umsatz-Verhältnis (KUV)', value: ps ? ps.toFixed(1) : '—', score: sPs }
      ]
    };
  }

  /**
   * Berechnet den Wachstums-Score.
   */
  function evaluateGrowth(ratios) {
    var revG = ratios.revenueGrowth || 0;
    var earnG = ratios.earningsGrowth || 0;

    var sRev = scoreMetric(revG, 0.05, 0.20, 1);
    var sEarn = scoreMetric(earnG, 0.05, 0.25, 1);

    var avg = (sRev * 0.5) + (sEarn * 0.5);

    return {
      category: 'Wachstum',
      score: Math.round(avg * 10) / 10,
      metrics: [
        { name: 'Umsatzwachstum (YoY)', value: (revG * 100).toFixed(1) + ' %', score: sRev },
        { name: 'Gewinnwachstum (YoY)', value: (earnG * 100).toFixed(1) + ' %', score: sEarn }
      ]
    };
  }

  /**
   * Berechnet den Score für Finanzielle Gesundheit.
   */
  function evaluateHealth(ratios) {
    var debtToEquity = ratios.debtToEquity || 100;
    var currentRatio = ratios.currentRatio || 1.2;
    var quickRatio = ratios.quickRatio || 1.0;

    var sDebt = scoreMetric(debtToEquity, 150, 40, -1);
    var sCurr = scoreMetric(currentRatio, 1.0, 2.0, 1);
    var sQuick = scoreMetric(quickRatio, 0.8, 1.5, 1);

    var avg = (sDebt * 0.4) + (sCurr * 0.3) + (sQuick * 0.3);

    return {
      category: 'Finanzielle Gesundheit',
      score: Math.round(avg * 10) / 10,
      metrics: [
        { name: 'Debt to Equity', value: debtToEquity.toFixed(1) + ' %', score: sDebt },
        { name: 'Current Ratio', value: currentRatio.toFixed(2), score: sCurr },
        { name: 'Quick Ratio', value: quickRatio.toFixed(2), score: sQuick }
      ]
    };
  }

  /**
   * Ermittelt das Gesamtrating und alle Subkategorien.
   */
  function calculateTotalScore(stock) {
    var ratios = (stock && stock.ratios) || {};
    var prof = evaluateProfitability(ratios);
    var val = evaluateValuation(ratios);
    var gro = evaluateGrowth(ratios);
    var hea = evaluateHealth(ratios);

    var overall = (prof.score * 0.30) + (val.score * 0.25) + (gro.score * 0.25) + (hea.score * 0.20);
    var roundedTotal = Math.round(overall * 10) / 10;

    return {
      totalScore: roundedTotal,
      categories: [prof, val, gro, hea]
    };
  }

  /**
   * Erzeugt das HTML für die 5-Segment-Balkenanzeige.
   */
  function renderSegmentBarHtml(score) {
    var numFilled = Math.min(5, Math.max(0, Math.round(score)));
    var colorClass = numFilled >= 4 ? 'filled-green' : (numFilled >= 2 ? 'filled-yellow' : 'filled-red');
    var html = '<div class="score-segments">';

    for (var i = 1; i <= 5; i++) {
      var isFilled = i <= numFilled;
      html += '<div class="score-segment-block ' + (isFilled ? colorClass : '') + '"></div>';
    }

    html += '</div>';
    return html;
  }

  return {
    calculateTotalScore: calculateTotalScore,
    renderSegmentBarHtml: renderSegmentBarHtml
  };
})();

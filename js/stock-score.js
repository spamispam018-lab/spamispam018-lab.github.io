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
  function evaluateGrowth(ratios, stock) {
    var revG = ratios.revenueGrowth || 0;
    var earnG = resolveEarningsGrowth(ratios, stock);
    var hasEarn = earnG !== null;

    var sRev = scoreMetric(revG, 0.05, 0.20, 1);
    var sEarn = hasEarn ? scoreMetric(earnG, 0.05, 0.25, 1) : null;

    // Fehlt das Gewinnwachstum, zählt nur das Umsatzwachstum
    var avg = hasEarn ? (sRev * 0.5) + (sEarn * 0.5) : sRev;

    return {
      category: 'Wachstum',
      score: Math.round(avg * 10) / 10,
      metrics: [
        { name: 'Umsatzwachstum (YoY)', value: (revG * 100).toFixed(1) + ' %', score: sRev },
        { name: 'Gewinnwachstum (YoY)', value: hasEarn ? (earnG * 100).toFixed(1) + ' %' : '—', score: sEarn }
      ]
    };
  }

  /**
   * Gewinnwachstum (YoY): bevorzugt ratios.earningsGrowth, sonst Nettoergebnis
   * des letzten Quartals gegenüber dem Vorjahresquartal. null = nicht berechenbar
   * (z. B. Vorjahresquartal negativ oder keine Quartalsdaten).
   */
  function resolveEarningsGrowth(ratios, stock) {
    // Bei gewähltem Zeitraum (Quartal/Jahr) kein Fallback auf einen anderen Zeitraum
    if (ratios._period) {
      var gp = ratios.earningsGrowth;
      return (gp !== null && gp !== undefined && !isNaN(gp)) ? Number(gp) : null;
    }
    var g = ratios.earningsGrowth;
    if (g !== null && g !== undefined && !isNaN(g)) return Number(g);

    try {
      var q = (((stock || {}).financials || {}).incomeStatement || {}).quarterly || [];
      var rows = q.filter(function (r) {
        return r && r.date && r.Net_Income !== null && r.Net_Income !== undefined && !isNaN(r.Net_Income);
      }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (rows.length < 2) return null;

      var last = rows[rows.length - 1];
      var lastT = new Date(last.date).getTime();
      var prev = null, bestDiff = Infinity;
      rows.forEach(function (r) {
        if (r === last) return;
        var diffDays = Math.abs((lastT - new Date(r.date).getTime()) / 86400000 - 365);
        if (diffDays < bestDiff) { bestDiff = diffDays; prev = r; }
      });
      if (!prev || bestDiff > 45 || !(prev.Net_Income > 0)) return null;
      return (last.Net_Income - prev.Net_Income) / prev.Net_Income;
    } catch (e) {
      return null;
    }
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

  var PERIOD_KEY = 'app_score_period';

  function getPeriod() {
    try {
      var v = localStorage.getItem(PERIOD_KEY);
      if (v === 'quarter' || v === 'year') return v;
    } catch (e) {}
    return 'year';
  }

  function setPeriod(p) {
    try { localStorage.setItem(PERIOD_KEY, p === 'quarter' ? 'quarter' : 'year'); } catch (e) {}
  }

  function num(v) {
    return (v !== null && v !== undefined && v !== '' && !isNaN(v)) ? Number(v) : null;
  }

  function sortedRows(list) {
    return (list || []).filter(function (r) { return r && r.date; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  /** Vorperiode: bei Quartal das Vorjahresquartal (~365 Tage), bei Jahr das Vorjahr. */
  function findPrior(rows, last) {
    var lastT = new Date(last.date).getTime();
    var best = null, bestDiff = Infinity;
    rows.forEach(function (r) {
      if (r === last) return;
      var diff = Math.abs((lastT - new Date(r.date).getTime()) / 86400000 - 365);
      if (diff < bestDiff) { bestDiff = diff; best = r; }
    });
    return (best && bestDiff <= 45) ? best : null;
  }

  function growth(cur, prev) {
    cur = num(cur); prev = num(prev);
    if (cur === null || prev === null || !(prev > 0)) return null;
    return (cur - prev) / prev;
  }

  /**
   * Leitet die Kennzahlen aus den Quartals- bzw. Jahresabschlüssen ab.
   * Quartal: Gewinn-/Umsatzgrößen werden für KGV, KUV, ROE und ROA auf 12 Monate hochgerechnet (x4).
   * Nicht berechenbare Werte bleiben aus den Standard-Kennzahlen (ratios) erhalten.
   */
  function deriveRatios(stock, period) {
    var base = (stock && stock.ratios) || {};
    var out = {};
    for (var k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k]; }
    out._period = period;
    out.earningsGrowth = null;

    var fin = (stock && stock.financials) || {};
    var key = period === 'quarter' ? 'quarterly' : 'annual';
    var factor = period === 'quarter' ? 4 : 1;

    var inc = sortedRows((fin.incomeStatement || {})[key]);
    var bs = sortedRows((fin.balanceSheet || {})[key]);
    var mcap = num(((stock && stock.quote) || {}).marketCap);

    var last = inc.length ? inc[inc.length - 1] : null;
    if (last) {
      var prior = findPrior(inc, last);
      var ni = num(last.Net_Income), rev = num(last.Total_Revenue), op = num(last.Operating_Income);

      if (ni !== null && rev) out.profitMargins = ni / rev;
      if (op !== null && rev) out.operatingMargins = op / rev;
      if (mcap && ni !== null && ni > 0) out.peTrailing = mcap / (ni * factor);
      if (mcap && rev) out.priceToSales = mcap / (rev * factor);

      if (prior) {
        var rg = growth(rev, prior.Total_Revenue);
        if (rg !== null) out.revenueGrowth = rg;
        out.earningsGrowth = growth(ni, prior.Net_Income);
      }

      var lastBs = bs.length ? bs[bs.length - 1] : null;
      if (lastBs) {
        var eq = num(lastBs.Stockholders_Equity), ta = num(lastBs.Total_Assets);
        var debt = num(lastBs.Total_Debt);
        var ca = num(lastBs.Current_Assets), cl = num(lastBs.Current_Liabilities);
        var inv = num(lastBs.Inventory) || 0;

        if (ni !== null && eq && eq > 0) out.returnOnEquity = (ni * factor) / eq;
        if (ni !== null && ta && ta > 0) out.returnOnAssets = (ni * factor) / ta;
        if (debt !== null && eq && eq > 0) out.debtToEquity = (debt / eq) * 100;
        if (ca !== null && cl) {
          out.currentRatio = ca / cl;
          out.quickRatio = (ca - inv) / cl;
        }
      }
    }
    return out;
  }

  /**
   * Ermittelt das Gesamtrating und alle Subkategorien.
   */
  function calculateTotalScore(stock, period) {
    var ratios = (period === 'quarter' || period === 'year')
      ? deriveRatios(stock, period)
      : ((stock && stock.ratios) || {});
    var prof = evaluateProfitability(ratios);
    var val = evaluateValuation(ratios);
    var gro = evaluateGrowth(ratios, stock);
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
    getPeriod: getPeriod,
    setPeriod: setPeriod,
    renderSegmentBarHtml: renderSegmentBarHtml
  };
})();

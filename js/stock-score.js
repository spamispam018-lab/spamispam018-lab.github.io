/**
 * js/stock-score.js
 * Transparente Scoring-Engine (0 bis 5 Punkte) für Aktien.
 * Bewertet 4 Kernbereiche:
 * 1. Profitabilität (Margen, ROE, ROA)
 * 2. Bewertung (KGV, EV/EBITDA, P/S, PEG)
 * 3. Wachstum (Umsatz- und Gewinnwachstum)
 * 4. Finanzielle Gesundheit (Verschuldungsgrad, Liquidität, Zinsdeckung)
 *
 * *NEU:* Bei ETFs wird der Score als gewichteter Durchschnitt der Top 5 Holdings berechnet.
 *
 * FIX 1: `calculateTotalScore` wird als Alias für `calculateBaseTotalScore` exportiert
 *         (index.html ruft es auf – vorher war es nicht definiert → Score-Tab leer).
 * FIX 2: Fehlende Kennzahlen werden nicht mehr durch Defaults (25, 2.0, 4.0 etc.)
 *         verfälscht, sondern dynamisch aus den verfügbaren Metriken gewichtet.
 */

window.App = window.App || {};

window.App.Score = (function () {
  'use strict';

  var nameToTickerMap = {};

  // FIX: Helper für robuste Zahlen-Konvertierung
  function num(v) {
    return (v !== null && v !== undefined && v !== '' && !isNaN(v)) ? Number(v) : null;
  }

  function buildNameLookup(universe) {
    nameToTickerMap = {};
    (universe || []).forEach(function (u) {
      nameToTickerMap[u.ticker.toLowerCase()] = u.ticker;
      if (u.name) {
        var cleanName = u.name.toLowerCase().replace(/inc\.|inc|corp\.|corp|ltd\.|ltd|plc|ag|se|co\./g, '').trim();
        nameToTickerMap[cleanName] = u.ticker;
      }
    });
  }

  function scoreMetric(val, minGood, maxGreat, direction) {
    if (val === null || val === undefined || isNaN(val)) return 2.5;
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

  // FIX: Dynamische Gewichtung nach verfügbaren Metriken (fehlende Werte verzerren den Schnitt nicht mehr)
  function weightedAvg(parts) {
    var totalWeight = parts.reduce(function (a, p) { return a + p[1]; }, 0);
    if (totalWeight <= 0) return 2.5;
    return parts.reduce(function (acc, p) { return acc + p[0] * p[1]; }, 0) / totalWeight;
  }

  function evaluateProfitability(ratios) {
    var netMargin = num(ratios.profitMargins);
    var opMargin = num(ratios.operatingMargins);
    var roe = num(ratios.returnOnEquity);
    var roa = num(ratios.returnOnAssets);

    var parts = [];
    var sNet = netMargin !== null ? scoreMetric(netMargin, 0.05, 0.20, 1) : null;
    var sOp = opMargin !== null ? scoreMetric(opMargin, 0.08, 0.25, 1) : null;
    var sRoe = roe !== null ? scoreMetric(roe, 0.10, 0.25, 1) : null;
    var sRoa = roa !== null ? scoreMetric(roa, 0.05, 0.15, 1) : null;

    if (sNet !== null) parts.push([sNet, 0.3]);
    if (sOp !== null) parts.push([sOp, 0.3]);
    if (sRoe !== null) parts.push([sRoe, 0.2]);
    if (sRoa !== null) parts.push([sRoa, 0.2]);

    var avg = weightedAvg(parts);

    return {
      category: 'Profitabilität',
      score: Math.round(avg * 10) / 10,
      metrics: [
        { name: 'Nettomarge', value: netMargin !== null ? (netMargin * 100).toFixed(1) + ' %' : '—', score: sNet },
        { name: 'Operative Marge', value: opMargin !== null ? (opMargin * 100).toFixed(1) + ' %' : '—', score: sOp },
        { name: 'Eigenkapitalrendite (ROE)', value: roe !== null ? (roe * 100).toFixed(1) + ' %' : '—', score: sRoe },
        { name: 'Gesamtkapitalrendite (ROA)', value: roa !== null ? (roa * 100).toFixed(1) + ' %' : '—', score: sRoa }
      ]
    };
  }

  function evaluateValuation(ratios) {
    var pe = num(ratios.peTrailing);
    var fwdPe = num(ratios.peForward);
    var peg = num(ratios.pegRatio);
    var ps = num(ratios.priceToSales);

    var parts = [];
    // Negatives KGV (Verlust) = 0 Punkte, fehlendes KGV = neutral (nicht 25 annehmen!)
    var sPe = pe !== null ? (pe > 0 ? scoreMetric(pe, 28, 12, -1) : 0) : null;
    var sFwdPe = fwdPe !== null ? (fwdPe > 0 ? scoreMetric(fwdPe, 24, 10, -1) : 0) : null;
    var sPeg = (peg !== null && peg > 0) ? scoreMetric(peg, 2.5, 1.0, -1) : null;
    var sPs = (ps !== null && ps > 0) ? scoreMetric(ps, 6.0, 1.5, -1) : null;

    if (sPe !== null) parts.push([sPe, 0.35]);
    if (sFwdPe !== null) parts.push([sFwdPe, 0.35]);
    if (sPeg !== null) parts.push([sPeg, 0.15]);
    if (sPs !== null) parts.push([sPs, 0.15]);

    var avg = weightedAvg(parts);

    return {
      category: 'Bewertung',
      score: Math.round(avg * 10) / 10,
      metrics: [
        { name: 'KGV (Trailing)', value: pe !== null ? pe.toFixed(1) : '—', score: sPe },
        { name: 'Forward KGV', value: fwdPe !== null ? fwdPe.toFixed(1) : '—', score: sFwdPe },
        { name: 'PEG Ratio', value: peg !== null ? peg.toFixed(2) : '—', score: sPeg },
        { name: 'Kurs-Umsatz-Verhältnis (KUV)', value: ps !== null ? ps.toFixed(1) : '—', score: sPs }
      ]
    };
  }

  function evaluateGrowth(ratios, stock) {
    var revG = num(ratios.revenueGrowth);
    var earnG = resolveEarningsGrowth(ratios, stock);

    var parts = [];
    var sRev = revG !== null ? scoreMetric(revG, 0.05, 0.20, 1) : null;
    var sEarn = earnG !== null ? scoreMetric(earnG, 0.05, 0.25, 1) : null;

    if (sRev !== null) parts.push([sRev, 0.5]);
    if (sEarn !== null) parts.push([sEarn, 0.5]);

    var avg = weightedAvg(parts);

    return {
      category: 'Wachstum',
      score: Math.round(avg * 10) / 10,
      metrics: [
        { name: 'Umsatzwachstum (YoY)', value: revG !== null ? (revG * 100).toFixed(1) + ' %' : '—', score: sRev },
        { name: 'Gewinnwachstum (YoY)', value: earnG !== null ? (earnG * 100).toFixed(1) + ' %' : '—', score: sEarn }
      ]
    };
  }

  function resolveEarningsGrowth(ratios, stock) {
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

  function evaluateHealth(ratios) {
    var debtToEquity = num(ratios.debtToEquity);
    var currentRatio = num(ratios.currentRatio);
    var quickRatio = num(ratios.quickRatio);

    var parts = [];
    var sDebt = debtToEquity !== null ? scoreMetric(debtToEquity, 150, 40, -1) : null;
    var sCurr = currentRatio !== null ? scoreMetric(currentRatio, 1.0, 2.0, 1) : null;
    var sQuick = quickRatio !== null ? scoreMetric(quickRatio, 0.8, 1.5, 1) : null;

    if (sDebt !== null) parts.push([sDebt, 0.4]);
    if (sCurr !== null) parts.push([sCurr, 0.3]);
    if (sQuick !== null) parts.push([sQuick, 0.3]);

    var avg = weightedAvg(parts);

    return {
      category: 'Finanzielle Gesundheit',
      score: Math.round(avg * 10) / 10,
      metrics: [
        { name: 'Debt to Equity', value: debtToEquity !== null ? debtToEquity.toFixed(1) + ' %' : '—', score: sDebt },
        { name: 'Current Ratio', value: currentRatio !== null ? currentRatio.toFixed(2) : '—', score: sCurr },
        { name: 'Quick Ratio', value: quickRatio !== null ? quickRatio.toFixed(2) : '—', score: sQuick }
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

  function sortedRows(list) {
    return (list || []).filter(function (r) { return r && r.date; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

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

  function calculateBaseTotalScore(stock, period) {
    var ratios = (period === 'quarter' || period === 'year')
      ? deriveRatios(stock, period)
      : ((stock && stock.ratios) || {});
    var prof = evaluateProfitability(ratios);
    var val = evaluateValuation(ratios);
    var gro = evaluateGrowth(ratios, stock);
    var hea = evaluateHealth(ratios);

    var overall = (prof.score * 0.30) + (val.score * 0.25) + (gro.score * 0.25) + (hea.score * 0.20);
    return {
      totalScore: Math.round(overall * 10) / 10,
      categories: [prof, val, gro, hea]
    };
  }

  /**
   * Lädt die Scores der Top 5 Holdings und gewichtet sie zu einem Gesamtscore.
   */
  function calculateTotalScoreAsync(stock, period) {
    return new Promise(function (resolve) {
      var isEtf = (stock.sector === 'Sonstige' || stock.sector === 'ETF' || !stock.sector);
      var holdings = stock.holdings || [];

      if (!isEtf || holdings.length === 0) {
        resolve(Object.assign({ isAggregated: false }, calculateBaseTotalScore(stock, period)));
        return;
      }

      window.App.Data.getUniverse().then(function (universe) {
        buildNameLookup(universe);
        var top5 = holdings.slice(0, 5);

        var promises = top5.map(function (h) {
          var cleanName = h.name.toLowerCase().replace(/inc\.|inc|corp\.|corp|ltd\.|ltd|plc|ag|se|co\./g, '').trim();
          var targetTicker = nameToTickerMap[cleanName] || nameToTickerMap[h.name.toLowerCase()] || null;

          if (!targetTicker) {
            var possible = universe.find(function (u) { return u.ticker.indexOf(h.name) === 0; });
            if (possible) targetTicker = possible.ticker;
          }

          if (targetTicker) {
            return window.App.Data.getStock(targetTicker).then(function (res) {
              return { data: res, weight: h.weight || 0 };
            }).catch(function () { return null; });
          }
          return Promise.resolve(null);
        });

        Promise.all(promises).then(function (results) {
          var validHoldings = results.filter(function (r) { return r && r.data; });

          if (validHoldings.length === 0) {
            resolve(Object.assign({ isAggregated: false }, calculateBaseTotalScore(stock, period)));
            return;
          }

          var totalWeight = validHoldings.reduce(function (sum, r) { return sum + r.weight; }, 0);

          var aggTotalScore = 0;
          var catScores = [0, 0, 0, 0];

          var templateCategories = calculateBaseTotalScore(validHoldings[0].data, period).categories;

          validHoldings.forEach(function (r) {
            var normWeight = totalWeight > 0 ? (r.weight / totalWeight) : (1 / validHoldings.length);
            var hs = calculateBaseTotalScore(r.data, period);

            aggTotalScore += hs.totalScore * normWeight;

            hs.categories.forEach(function (cat, idx) {
              catScores[idx] += cat.score * normWeight;
            });
          });

          var finalCategories = templateCategories.map(function (t, idx) {
            return {
              category: t.category,
              score: Math.round(catScores[idx] * 10) / 10,
              metrics: t.metrics.map(function (m) {
                return { name: m.name, value: '— (Gewichtet)', score: catScores[idx] };
              })
            };
          });

          resolve({
            totalScore: Math.round(aggTotalScore * 10) / 10,
            categories: finalCategories,
            isAggregated: true
          });
        });
      }).catch(function () {
        resolve(Object.assign({ isAggregated: false }, calculateBaseTotalScore(stock, period)));
      });
    });
  }

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
    // FIX: Alias, damit index.html `calculateTotalScore` weiterhin aufrufen kann
    calculateTotalScore: calculateBaseTotalScore,
    calculateBaseTotalScore: calculateBaseTotalScore,
    calculateTotalScoreAsync: calculateTotalScoreAsync,
    getPeriod: getPeriod,
    setPeriod: setPeriod,
    renderSegmentBarHtml: renderSegmentBarHtml
  };
})();
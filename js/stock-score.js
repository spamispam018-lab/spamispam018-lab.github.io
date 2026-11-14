/**
 * js/stock-score.js
 * Ganzheitliche Scoring-Engine (0 bis 100) auf Basis ALLER verfügbaren Daten.
 * Kombiniert Fundamentaldaten, Technik, Analysten und Smart Money/News.
 */
window.App = window.App || {};

window.App.Score = (function () {
  'use strict';

  var nameToTickerMap = {};
  var PERIOD_KEY = 'app_score_period';

  // Hilfsfunktion für robuste Zahlen
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

  // ===========================================================================
  // 1. FUNDAMENTAL-SCORES (Bisherige Logik, leicht angepasst)
  // ===========================================================================
  function scoreMetric(val, minGood, maxGreat, direction) {
    if (val === null || val === undefined || isNaN(val)) return 2.5;
    var score = 0;
    if (direction === 1) {
      if (val <= minGood) score = Math.max(0, (val / minGood) * 2.5);
      else if (val >= maxGreat) score = 5.0;
      else score = 2.5 + ((val - minGood) / (maxGreat - minGood)) * 2.5;
    } else {
      if (val >= minGood) score = Math.max(0, 5.0 - ((val - minGood) / (maxGreat - minGood)) * 2.5);
      else if (val <= maxGreat) score = 5.0;
      else score = 2.5 + ((minGood - val) / (minGood - maxGreat)) * 2.5;
    }
    return Math.max(0, Math.min(5, Math.round(score * 10) / 10));
  }

  function weightedAvg(parts) {
    var totalWeight = parts.reduce(function (a, p) { return a + p[1]; }, 0);
    if (totalWeight <= 0) return 2.5;
    return parts.reduce(function (acc, p) { return acc + p[0] * p[1]; }, 0) / totalWeight;
  }

  function evalFundamentals(stock, period) {
    var r = stock.ratios || {};
    // Fallback auf einfache Ratio-Prüfung, wenn deriveRatios fehlschlägt
    var pe = num(r.peTrailing);
    var fwdPe = num(r.peForward);
    var pm = num(r.profitMargins);
    var revG = num(r.revenueGrowth);
    var de = num(r.debtToEquity);
    var div = num(r.dividendYield);

    var parts = [];
    if (pe !== null) parts.push([pe > 0 ? scoreMetric(pe, 28, 12, -1) : 0, 0.3]);
    if (fwdPe !== null) parts.push([fwdPe > 0 ? scoreMetric(fwdPe, 24, 10, -1) : 0, 0.3]);
    if (pm !== null) parts.push([scoreMetric(pm, 0.05, 0.20, 1), 0.2]);
    if (revG !== null) parts.push([scoreMetric(revG, 0.05, 0.20, 1), 0.2]);
    if (de !== null) parts.push([scoreMetric(de, 150, 40, -1), 0.1]);
    if (div !== null && div > 0) parts.push([scoreMetric(div, 0, 4, 1), 0.1]);

    return Math.round(weightedAvg(parts) * 10) / 10; // 0 bis 5
  }

  // ===========================================================================
  // 2. TECHNIK-SCORE (RSI, SMA, Trends)
  // ===========================================================================
  function evalTechnicals(stock) {
    var rsi = num(stock.rsi);
    var cross = stock.cross; 
    var price = num(stock.quote ? stock.quote.price : null);
    var r = stock.ratios || {};
    
    var parts = [];
    
    // RSI: 30-70 ist neutral (2.5). Unter 30 (überverkauft) = 4-5 (Kaufchance). Über 70 = 1-2.
    if (rsi !== null) {
      if (rsi <= 30) parts.push([4.5, 0.3]);
      else if (rsi >= 70) parts.push([1.5, 0.3]);
      else parts.push([2.5, 0.3]);
    }
    
    // Golden/Death Cross
    if (cross === 'golden') parts.push([4.5, 0.4]);
    else if (cross === 'death') parts.push([1.5, 0.4]);
    else parts.push([2.5, 0.4]);

    // Trend (Kurs über SMA 50/200) - grob geschätzt über das Tief/Hoch Verhältnis
    var rangePos = num(stock.rangePos);
    if (rangePos !== null) {
        // Kurs nahe Hoch (80-100%) ist gut für Trend, aber schlecht für Einstieg
        if (rangePos > 80) parts.push([4.0, 0.3]);
        else if (rangePos < 20) parts.push([2.0, 0.3]); // Bounce-Kandidat
        else parts.push([3.0, 0.3]);
    }
    
    return Math.round(weightedAvg(parts) * 10) / 10;
  }

  // ===========================================================================
  // 3. ANALYSTEN-SCORE (Kursziele & Ratings)
  // ===========================================================================
  function evalAnalysts(stock) {
    var an = stock.analysts || {};
    var targets = an.targets || {};
    var recs = an.recommendations || {};
    var price = num(stock.quote ? stock.quote.price : null);
    
    var parts = [];
    
    // Upside Potential
    if (price > 0 && num(targets.mean) > 0) {
      var upside = ((targets.mean - price) / price) * 100;
      parts.push([scoreMetric(upside, 0, 25, 1), 0.6]); // 25% Upside = 5 Sterne
    }
    
    // Empfehlungs-Score (1=Strong Buy, 5=Sell)
    var recScore = num(recs.score);
    if (recScore !== null) {
      // Umdrehen: 1 wird zu 5, 5 wird zu 1
      var mappedScore = 6 - recScore;
      parts.push([Math.max(0, Math.min(5, mappedScore)), 0.4]);
    }
    
    return parts.length > 0 ? Math.round(weightedAvg(parts) * 10) / 10 : 2.5;
  }

  // ===========================================================================
  // 4. SMART MONEY & NEWS SCORE
  // ===========================================================================
  function evalSmartMoney(stock) {
    var insider = stock.insider || {};
    var summary = insider.summary || {};
    var parts = [];
    
    // Insider Sentiment
    if (summary.sentiment === 'Bullish') parts.push([4.5, 0.5]);
    else if (summary.sentiment === 'Bearish') parts.push([1.5, 0.5]);
    else parts.push([2.5, 0.5]);
    
    // News (FinBERT) Score
    var newsScore = 0;
    if (window.App.News && window.App.News.cache && window.App.News.cache.index) {
        var n = window.App.News.cache.index[stock.ticker];
        if (n && n.score !== undefined) newsScore = n.score;
    }
    
    // News Score geht meist von -1 bis +1
    if (newsScore > 0.2) parts.push([4.0, 0.5]);
    else if (newsScore < -0.2) parts.push([2.0, 0.5]);
    else parts.push([3.0, 0.5]);
    
    return Math.round(weightedAvg(parts) * 10) / 10;
  }

  // ===========================================================================
  // HAUPTFUNKTION
  // ===========================================================================
  function calculateHolisticScore(stock, period) {
    // 1. Fundamentaldaten (0-5)
    var sFund = evalFundamentals(stock, period);
    // 2. Technik (0-5)
    var sTech = evalTechnicals(stock);
    // 3. Analysten (0-5)
    var sAnalyst = evalAnalysts(stock);
    // 4. Smart Money & News (0-5)
    var sSmart = evalSmartMoney(stock);

    // Gewichtung: 40% Fundamental, 25% Technik, 20% Analysten, 15% Smart Money
    var totalPoints = (sFund * 0.40) + (sTech * 0.25) + (sAnalyst * 0.20) + (sSmart * 0.15);
    
    // Umgerechnet auf 0 - 100 (da 5 Punkte = 100)
    var finalScore100 = Math.round(totalPoints * 20);

    return {
      totalScore: Math.round(totalPoints * 10) / 10, // z.B. 3.8 von 5.0
      score100: finalScore100, // z.B. 76 von 100
      categories: [
        { category: 'Fundamentaldaten', score: sFund, weight: '40%', metrics: [] },
        { category: 'Technisches Bild', score: sTech, weight: '25%', metrics: [] },
        { category: 'Analysten-Konsens', score: sAnalyst, weight: '20%', metrics: [] },
        { category: 'Smart Money & News', score: sSmart, weight: '15%', metrics: [] }
      ]
    };
  }

  // ETF-Logik (bleibt erhalten)
  function calculateTotalScoreAsync(stock, period) {
    return new Promise(function (resolve) {
      var isEtf = (stock.sector === 'Sonstige' || stock.sector === 'ETF' || !stock.sector);
      var holdings = stock.holdings || [];

      if (!isEtf || holdings.length === 0) {
        resolve(Object.assign({ isAggregated: false }, calculateHolisticScore(stock, period)));
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
            resolve(Object.assign({ isAggregated: false }, calculateHolisticScore(stock, period)));
            return;
          }

          var totalWeight = validHoldings.reduce(function (sum, r) { return sum + r.weight; }, 0);
          var aggTotalScore = 0;
          var catScores = [0, 0, 0, 0];

          validHoldings.forEach(function (r) {
            var normWeight = totalWeight > 0 ? (r.weight / totalWeight) : (1 / validHoldings.length);
            var hs = calculateHolisticScore(r.data, period);
            aggTotalScore += hs.totalScore * normWeight;
            hs.categories.forEach(function (cat, idx) {
              catScores[idx] += cat.score * normWeight;
            });
          });

          var finalCategories = [
            { category: 'Fundamentaldaten', score: Math.round(catScores[0]*10)/10, weight: '40%', metrics: [] },
            { category: 'Technisches Bild', score: Math.round(catScores[1]*10)/10, weight: '25%', metrics: [] },
            { category: 'Analysten-Konsens', score: Math.round(catScores[2]*10)/10, weight: '20%', metrics: [] },
            { category: 'Smart Money & News', score: Math.round(catScores[3]*10)/10, weight: '15%', metrics: [] }
          ];

          resolve({
            totalScore: Math.round(aggTotalScore * 10) / 10,
            score100: Math.round(aggTotalScore * 20),
            categories: finalCategories,
            isAggregated: true
          });
        });
      }).catch(function () {
        resolve(Object.assign({ isAggregated: false }, calculateHolisticScore(stock, period)));
      });
    });
  }

  function getPeriod() { return 'year'; }
  function setPeriod(p) {}
  
  function renderSegmentBarHtml(score) {
    var numFilled = Math.min(5, Math.max(0, Math.round(score)));
    var colorClass = numFilled >= 4 ? 'filled-green' : (numFilled >= 2 ? 'filled-yellow' : 'filled-red');
    var html = '<div class="score-segments">';
    for (var i = 1; i <= 5; i++) {
      html += '<div class="score-segment-block ' + (i <= numFilled ? colorClass : '') + '"></div>';
    }
    return html + '</div>';
  }

  return {
    calculateTotalScore: calculateHolisticScore,
    calculateBaseTotalScore: calculateHolisticScore,
    calculateTotalScoreAsync: calculateTotalScoreAsync,
    getPeriod: getPeriod,
    setPeriod: setPeriod,
    renderSegmentBarHtml: renderSegmentBarHtml
  };
})();
/**
 * js/stock-score.js
 * Ganzheitliche Scoring-Engine (0 bis 100) auf Basis ALLER verfügbaren Daten.
 */
window.App = window.App || {};

window.App.Score = (function () {
  'use strict';

  var nameToTickerMap = {};

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

  function evalFundamentals(stock) {
    var r = stock.ratios || {};
    var pe = num(r.peTrailing);
    var fwdPe = num(r.peForward);
    var pm = num(r.profitMargins);
    var revG = num(r.revenueGrowth);
    var de = num(r.debtToEquity);
    var div = num(r.dividendYield);

    var parts = [];
    var metrics = [];
    var pros = [], cons = [];

    if (pe !== null) {
      var sPe = pe > 0 ? scoreMetric(pe, 28, 12, -1) : 0;
      parts.push([sPe, 0.3]);
      metrics.push({ name: 'KGV (Trailing)', value: pe > 0 ? pe.toFixed(1) : 'Negativ' });
      if (pe > 0 && pe < 15) pros.push('günstiges KGV');
      if (pe > 30 || pe <= 0) cons.push('hohes/negatives KGV');
    }
    
    if (fwdPe !== null) {
      var sFwd = fwdPe > 0 ? scoreMetric(fwdPe, 24, 10, -1) : 0;
      parts.push([sFwd, 0.3]);
      metrics.push({ name: 'Forward KGV', value: fwdPe > 0 ? fwdPe.toFixed(1) : 'Negativ' });
    }

    if (pm !== null) {
      parts.push([scoreMetric(pm, 0.05, 0.20, 1), 0.2]);
      metrics.push({ name: 'Nettomarge', value: (pm * 100).toFixed(1) + ' %' });
      if (pm > 0.15) pros.push('hohe Marge');
      if (pm < 0) cons.push('Verlustmarge');
    }
    
    if (revG !== null) {
      parts.push([scoreMetric(revG, 0.05, 0.20, 1), 0.2]);
      metrics.push({ name: 'Umsatzwachstum', value: (revG * 100).toFixed(1) + ' %' });
      if (revG > 0.1) pros.push('starkes Umsatzwachstum');
      if (revG < 0) cons.push('schrumpfender Umsatz');
    }
    
    if (de !== null) {
      parts.push([scoreMetric(de, 150, 40, -1), 0.1]);
      metrics.push({ name: 'Verschuldung (D/E)', value: de.toFixed(0) + ' %' });
      if (de < 50) pros.push('niedrige Verschuldung');
      if (de > 150) cons.push('hohe Verschuldung');
    }

    var score = Math.round(weightedAvg(parts) * 10) / 10;
    var reason = '';
    if (score >= 4) reason = 'Sehr solide Fundamentaldaten. ' + (pros.length ? 'Besonders positiv: ' + pros.join(', ') + '.' : '');
    else if (score <= 2) reason = 'Fundamentale Schwächen. ' + (cons.length ? 'Achtung bei: ' + cons.join(', ') + '.' : '');
    else reason = 'Gemischtes fundamentales Bild. ' + (pros.length ? 'Stärken: ' + pros.join(', ') + '. ' : '') + (cons.length ? 'Schwächen: ' + cons.join(', ') + '.' : '');

    return { category: 'Fundamentaldaten', score: score, metrics: metrics, reason: reason };
  }

  function evalTechnicals(stock) {
    var rsi = num(stock.rsi);
    var cross = stock.cross; 
    var rangePos = num(stock.rangePos);
    
    var parts = [];
    var metrics = [];
    var pros = [], cons = [];
    
    if (rsi !== null) {
      metrics.push({ name: 'RSI (14)', value: rsi.toFixed(0) });
      if (rsi <= 30) { parts.push([4.5, 0.3]); pros.push('überverkauft (Kaufchance)'); }
      else if (rsi >= 70) { parts.push([1.5, 0.3]); cons.push('überkauft (Rücksetzer-Risiko)'); }
      else parts.push([2.5, 0.3]);
    }
    
    if (cross) {
      metrics.push({ name: 'SMA-Kreuzung', value: cross === 'golden' ? 'Golden Cross' : 'Death Cross' });
      if (cross === 'golden') { parts.push([4.5, 0.4]); pros.push('Golden Cross (Aufwärtstrend)'); }
      else if (cross === 'death') { parts.push([1.5, 0.4]); cons.push('Death Cross (Abwärtstrend)'); }
    } else {
        metrics.push({ name: 'SMA-Kreuzung', value: 'Keine' });
        parts.push([2.5, 0.4]);
    }

    if (rangePos !== null) {
        metrics.push({ name: '52W-Spanne', value: rangePos.toFixed(0) + ' %' });
        if (rangePos > 80) { parts.push([4.0, 0.3]); pros.push('nahe am Jahreshoch'); }
        else if (rangePos < 20) { parts.push([2.0, 0.3]); cons.push('nahe am Jahrestief'); }
        else parts.push([3.0, 0.3]);
    }
    
    var score = Math.round(weightedAvg(parts) * 10) / 10;
    var reason = '';
    if (score >= 4) reason = 'Starker technischer Aufwärtstrend. ' + (pros.length ? pros.join(', ') + '.' : '');
    else if (score <= 2) reason = 'Technisch angeschlagen. ' + (cons.length ? cons.join(', ') + '.' : '');
    else reason = 'Technisch neutral. ' + (pros.length ? 'Positiv: ' + pros.join(', ') + '. ' : '') + (cons.length ? 'Negativ: ' + cons.join(', ') + '.' : '');

    return { category: 'Technisches Bild', score: score, metrics: metrics, reason: reason };
  }

  function evalAnalysts(stock) {
    var an = stock.analysts || {};
    var targets = an.targets || {};
    var recs = an.recommendations || {};
    var price = num(stock.quote ? stock.quote.price : null);
    
    var parts = [];
    var metrics = [];
    var pros = [], cons = [];
    
    if (price > 0 && num(targets.mean) > 0) {
      var upside = ((targets.mean - price) / price) * 100;
      parts.push([scoreMetric(upside, 0, 25, 1), 0.6]);
      metrics.push({ name: 'Kursziel-Potenzial', value: (upside > 0 ? '+' : '') + upside.toFixed(1) + ' %' });
      if (upside > 15) pros.push('großes Upside-Potenzial');
      if (upside < 0) cons.push('Kursziel unter aktuellem Kurs');
    }
    
    var recScore = num(recs.score);
    if (recScore !== null) {
      var mappedScore = 6 - recScore;
      parts.push([Math.max(0, Math.min(5, mappedScore)), 0.4]);
      metrics.push({ name: 'Empfehlungs-Score', value: recScore.toFixed(1) + ' (1=Buy, 5=Sell)' });
      if (recScore <= 2) pros.push('Kaufempfehlung der Analysten');
      if (recScore >= 4) cons.push('Verkaufsempfehlung der Analysten');
    }
    
    var score = parts.length > 0 ? Math.round(weightedAvg(parts) * 10) / 10 : 2.5;
    var reason = '';
    if (score >= 4) reason = 'Analysten sind sehr zuversichtlich. ' + (pros.length ? pros.join(', ') + '.' : '');
    else if (score <= 2) reason = 'Analysten sind skeptisch. ' + (cons.length ? cons.join(', ') + '.' : '');
    else reason = 'Geteilte Meinung der Analysten. ' + (pros.length ? pros.join(', ') + '.' : '');

    return { category: 'Analysten-Konsens', score: score, metrics: metrics, reason: reason };
  }

  function evalSmartMoney(stock) {
    var insider = stock.insider || {};
    var summary = insider.summary || {};
    var parts = [];
    var metrics = [];
    var pros = [], cons = [];
    
    if (summary.sentiment) {
      metrics.push({ name: 'Insider-Aktivität', value: summary.sentiment });
      if (summary.sentiment === 'Bullish') { parts.push([4.5, 0.5]); pros.push('Insider kaufen'); }
      else if (summary.sentiment === 'Bearish') { parts.push([1.5, 0.5]); cons.push('Insider verkaufen'); }
      else parts.push([2.5, 0.5]);
    }
    
    var newsScore = 0;
    var newsCount = 0;
    if (window.App.News && window.App.News.cache && window.App.News.cache.index) {
        var n = window.App.News.cache.index[stock.ticker];
        if (n && n.score !== undefined) {
            newsScore = n.score;
            newsCount = n.n;
        }
    }
    
    if (newsCount > 0) {
        metrics.push({ name: 'News-Stimmung', value: (newsScore > 0 ? '+' : '') + newsScore.toFixed(2) + ' (' + newsCount + ' News)' });
        if (newsScore > 0.2) { parts.push([4.0, 0.5]); pros.push('positive Nachrichten'); }
        else if (newsScore < -0.2) { parts.push([2.0, 0.5]); cons.push('negative Nachrichten'); }
        else parts.push([3.0, 0.5]);
    } else {
        metrics.push({ name: 'News-Stimmung', value: 'Keine Daten' });
        parts.push([2.5, 0.5]);
    }
    
    var score = Math.round(weightedAvg(parts) * 10) / 10;
    var reason = 'Insider und Nachrichtenlage: ' + (pros.length || cons.length ? '' : 'Unauffällig. ') + pros.concat(cons).join(', ') + (pros.length || cons.length ? '.' : '');

    return { category: 'Smart Money & News', score: score, metrics: metrics, reason: reason };
  }

  function calculateHolisticScore(stock) {
    var catFund = evalFundamentals(stock);
    var catTech = evalTechnicals(stock);
    var catAnalyst = evalAnalysts(stock);
    var catSmart = evalSmartMoney(stock);

    var totalPoints = (catFund.score * 0.40) + (catTech.score * 0.25) + (catAnalyst.score * 0.20) + (catSmart.score * 0.15);
    var finalScore100 = Math.round(totalPoints * 20);

    catFund.weight = '40%'; catTech.weight = '25%'; catAnalyst.weight = '20%'; catSmart.weight = '15%';

    return {
      totalScore: Math.round(totalPoints * 10) / 10,
      score100: finalScore100,
      categories: [catFund, catTech, catAnalyst, catSmart]
    };
  }

  function calculateTotalScoreAsync(stock) {
    return new Promise(function (resolve) {
      var isEtf = (stock.sector === 'Sonstige' || stock.sector === 'ETF' || !stock.sector);
      var holdings = stock.holdings || [];

      if (!isEtf || holdings.length === 0) {
        resolve(Object.assign({ isAggregated: false }, calculateHolisticScore(stock)));
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
            resolve(Object.assign({ isAggregated: false }, calculateHolisticScore(stock)));
            return;
          }

          var totalWeight = validHoldings.reduce(function (sum, r) { return sum + r.weight; }, 0);
          var aggTotalScore = 0;
          var catScores = [0, 0, 0, 0];

          validHoldings.forEach(function (r) {
            var normWeight = totalWeight > 0 ? (r.weight / totalWeight) : (1 / validHoldings.length);
            var hs = calculateHolisticScore(r.data);
            aggTotalScore += hs.totalScore * normWeight;
            hs.categories.forEach(function (cat, idx) {
              catScores[idx] += cat.score * normWeight;
            });
          });

          var finalCategories = [
            { category: 'Fundamentaldaten', score: Math.round(catScores[0]*10)/10, weight: '40%', metrics: [{name: 'Info', value: 'Gewichteter ETF-Durchschnitt'}], reason: 'Basiert auf den Fundamentaldaten der Top-Holdings.' },
            { category: 'Technisches Bild', score: Math.round(catScores[1]*10)/10, weight: '25%', metrics: [{name: 'Info', value: 'Gewichteter ETF-Durchschnitt'}], reason: 'Basiert auf dem Chartbild der Top-Holdings.' },
            { category: 'Analysten-Konsens', score: Math.round(catScores[2]*10)/10, weight: '20%', metrics: [{name: 'Info', value: 'Gewichteter ETF-Durchschnitt'}], reason: 'Basiert auf den Analystenmeinungen der Top-Holdings.' },
            { category: 'Smart Money & News', score: Math.round(catScores[3]*10)/10, weight: '15%', metrics: [{name: 'Info', value: 'Gewichteter ETF-Durchschnitt'}], reason: 'Basiert auf Insidern und News der Top-Holdings.' }
          ];

          resolve({
            totalScore: Math.round(aggTotalScore * 10) / 10,
            score100: Math.round(aggTotalScore * 20),
            categories: finalCategories,
            isAggregated: true
          });
        });
      }).catch(function () {
        resolve(Object.assign({ isAggregated: false }, calculateHolisticScore(stock)));
      });
    });
  }

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
    renderSegmentBarHtml: renderSegmentBarHtml
  };
})();
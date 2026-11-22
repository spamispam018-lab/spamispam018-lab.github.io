/**
 * js/stock-score.js
 * Ganzheitliche Scoring-Engine (0 bis 100) auf Basis ALLER verfügbaren Daten.
 *
 * NEU: - Kategorie "Reddit & Stimmung" (ApeWisdom + WSB). Sie zählt nur, wenn genug Reddit-Daten vorliegen;
 *        sonst bleiben die Gewichte 40/25/20/15 und die Scores unverändert.
 *      - Kategorie "Warnsignale": Abzüge für Hype, Widerspruch Reddit/News, Fallendes Messer, schwaches CRV.
 *      - Universe-Score (calculateUniverseScore / attachUniverseScores) für Filter und Sortierung im Screener.
 */
window.App = window.App || {};

window.App.Score = (function () {
  'use strict';

  var nameToTickerMap = {};

  // Schalter und Schwellen (hier anpassen)
  var CONFIG = {
    useReddit: true,          // Reddit-Kategorie berücksichtigen
    useFlags: true,           // Warnsignale als Abzug berücksichtigen
    redditWeight: 0.08,       // Anteil der Reddit-Kategorie, wenn Daten vorliegen
    redditMinMentions: 10,    // darunter ist die Stichprobe zu klein
    redditMinComments: 10,    // WSB-Kommentare für die Stimmung
    trendPct: 50, trendMinMentions: 20,
    hypePerf1m: 30, hypeRsi: 70, hypeRangePos: 90,
    maxPenalty: 15            // maximaler Abzug in Punkten (0 bis 100)
  };
  var BANDS = [
    { min: 75, label: 'Sehr stark', color: '#10b981' },
    { min: 60, label: 'Gut', color: '#84cc16' },
    { min: 45, label: 'Neutral', color: '#f59e0b' },
    { min: 30, label: 'Schwach', color: '#f97316' },
    { min: 0,  label: 'Kritisch', color: '#ef4444' }
  ];
  function scoreBand(score100) {
    for (var i = 0; i < BANDS.length; i++) if (score100 >= BANDS[i].min) return BANDS[i];
    return BANDS[BANDS.length - 1];
  }

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

  // Trend-Kennzahlen: aus der Kurshistorie (Detail) oder aus Universe-Feldern (Screener)
  function smaOf(c, n) {
    if (!c || c.length < n) return null;
    var t = 0;
    for (var i = c.length - n; i < c.length; i++) t += c[i];
    return t / n;
  }
  function trendInfo(stock) {
    var out = { px: null, dd: null, p1m: null, p3m: null, sma50: null, sma200: null, below50: null, below200: null };
    var hist = stock.chartHistory;
    var c = Array.isArray(hist) ? hist.map(function (h) { return h && num(h.close); }).filter(function (v) { return v !== null && v > 0; }) : [];
    var px = num(stock.quote ? stock.quote.price : null);
    if (c.length >= 60) {
      px = px || c[c.length - 1];
      var hi = Math.max.apply(null, c.slice(-252));
      out.dd = (px / hi - 1) * 100;
      if (c.length > 21) out.p1m = (px / c[c.length - 22] - 1) * 100;
      if (c.length > 63) out.p3m = (px / c[c.length - 64] - 1) * 100;
      out.sma50 = smaOf(c, 50); out.sma200 = smaOf(c, 200);
    } else {
      if (px && num(stock.high52)) out.dd = (px / stock.high52 - 1) * 100;
      out.p1m = num(stock.perf1m); out.p3m = num(stock.perf3m);
    }
    out.px = px;
    if (px && out.sma50) out.below50 = px < out.sma50;
    if (px && out.sma200) out.below200 = px < out.sma200;
    return out;
  }
  function fmtPct(v) { return (v > 0 ? '+' : '') + v.toFixed(1) + ' %'; }

  function evalTechnicals(stock) {
    var rsi = num(stock.rsi);
    var cross = stock.cross; 
    var rangePos = num(stock.rangePos);
    
    var parts = [];
    var metrics = [];
    var pros = [], cons = [];
    var tr = trendInfo(stock);
    var downtrend = (tr.below200 === true && tr.p3m !== null && tr.p3m <= -15) || (tr.dd !== null && tr.dd <= -30 && tr.p3m !== null && tr.p3m <= -10);
    
    if (rsi !== null) {
      metrics.push({ name: 'RSI (14)', value: rsi.toFixed(0) });
      if (rsi <= 30 && downtrend) { parts.push([2.5, 0.3]); cons.push('überverkauft, aber Abwärtstrend noch intakt'); }
      else if (rsi <= 30) { parts.push([4.5, 0.3]); pros.push('überverkauft (Kaufchance)'); }
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

    // NEU: Trendstruktur und Momentum (damit ein anhaltender Kursverfall nicht als neutral durchgeht)
    if (tr.below200 !== null && tr.below50 !== null) {
      var sT = tr.below200 && tr.below50 ? 1.0 : tr.below200 ? 2.2 : tr.below50 ? 3.0 : 4.5;
      parts.push([sT, 0.35]);
      metrics.push({ name: 'Trend (SMA 50/200)', value: tr.below200 && tr.below50 ? 'unter beiden' : tr.below200 ? 'unter SMA200' : tr.below50 ? 'unter SMA50' : 'über beiden' });
      if (tr.below200 && tr.below50) cons.push('Kurs unter SMA50 und SMA200');
      if (!tr.below200 && !tr.below50) pros.push('Kurs über SMA50 und SMA200');
    }
    if (tr.p3m !== null) {
      var sMo = tr.p3m <= -25 ? 1.0 : tr.p3m <= -10 ? 2.0 : tr.p3m >= 25 ? 4.5 : tr.p3m >= 10 ? 4.0 : 3.0;
      parts.push([sMo, 0.2]);
      metrics.push({ name: 'Performance 3 Monate', value: fmtPct(tr.p3m) });
      if (tr.p3m <= -25) cons.push('starker Kursverfall (3 Monate)');
      if (tr.p3m >= 25) pros.push('starkes Momentum (3 Monate)');
    }
    if (tr.dd !== null) {
      metrics.push({ name: 'Abstand zum 52W-Hoch', value: fmtPct(tr.dd) });
      if (tr.dd <= -30) cons.push('deutlich unter dem 52W-Hoch');
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

  // ---------------------------------------------------------------------------
  // Hilfen für News / Reddit
  // ---------------------------------------------------------------------------
  function newsOf(ticker) {
    var N = window.App.News;
    return (N && N.cache && N.cache.index) ? N.cache.index[ticker] || null : null;
  }
  function redditOf(ticker) {
    var N = window.App.News;
    if (!N || !N.cache) return null;
    return (N.cache.reddit && N.cache.reddit[ticker]) || (N.cache.redditIndex && N.cache.redditIndex[ticker]) || null;
  }
  function isNewsNegative(n) { return !!n && n.n >= 3 && num(n.score) !== null && n.score <= -0.2; }
  function isRedditTrend(r) { return !!r && num(r.mentions) >= CONFIG.trendMinMentions && num(r.change_pct) !== null && r.change_pct >= CONFIG.trendPct; }
  function isWsbBull(r) { return !!r && String(r.sentiment || '').toLowerCase() === 'bullish' && (num(r.wsb_comments) || 0) >= CONFIG.redditMinComments; }

  // ---------------------------------------------------------------------------
  // NEU: Reddit & Stimmung (nur bei ausreichend Daten, sonst null = Kategorie entfällt)
  // ---------------------------------------------------------------------------
  function evalReddit(stock) {
    var r = redditOf(stock.ticker);
    if (!r) return null;
    var parts = [], metrics = [], pros = [], cons = [];
    var ment = num(r.mentions), ch = num(r.change_pct);

    if (ment !== null && ment >= CONFIG.redditMinMentions && ch !== null) {
      var sM = ch >= CONFIG.trendPct ? 4.0 : ch >= 15 ? 3.5 : ch <= -40 ? 1.8 : ch <= -15 ? 2.2 : 3.0;
      parts.push([sM, 0.5]);
      metrics.push({ name: 'Reddit-Erwähnungen (24h)', value: ment + ' (' + (ch > 0 ? '+' : '') + Math.round(ch) + ' %)' });
      if (ch >= CONFIG.trendPct) pros.push('stark steigende Aufmerksamkeit');
      if (ch <= -40) cons.push('Aufmerksamkeit bricht ein');
      if (num(r.rank) !== null) metrics.push({ name: 'Reddit-Rang', value: '#' + r.rank });
    }
    var comments = num(r.wsb_comments) || 0;
    if (r.sentiment && comments >= CONFIG.redditMinComments) {
      var bull = String(r.sentiment).toLowerCase() === 'bullish';
      parts.push([bull ? 4.0 : 1.5, 0.5]);
      var sc = num(r.sentiment_score);
      metrics.push({ name: 'WSB-Stimmung', value: (bull ? 'Bullish' : 'Bearish') + (sc !== null ? ' (Score ' + (sc > 0 ? '+' : '') + sc + ')' : '') + ', ' + comments + ' Kommentare' });
      (bull ? pros : cons).push(bull ? 'WSB bullisch' : 'WSB bärisch');
    }
    if (!parts.length) return null;

    var score = Math.round(weightedAvg(parts) * 10) / 10;
    var reason = 'Reddit-Aufmerksamkeit und WSB-Stimmung. ' + (pros.length ? 'Positiv: ' + pros.join(', ') + '. ' : '') + (cons.length ? 'Negativ: ' + cons.join(', ') + '. ' : '') +
      'Hohe Aufmerksamkeit ist kein Kaufsignal, oft ist der Kurs schon gelaufen.';
    return { category: 'Reddit & Stimmung', score: score, metrics: metrics, reason: reason };
  }

  // ---------------------------------------------------------------------------
  // NEU: Warnsignale (nur Dinge, die in den Kategorien oben nicht schon stecken)
  // ---------------------------------------------------------------------------
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr);
    if (isNaN(d)) return null;
    return Math.round((d.getTime() - Date.now()) / 86400000);
  }

  function evalFlags(stock) {
    var flags = [], info = [];
    var r = redditOf(stock.ticker), n = newsOf(stock.ticker);
    var rsi = num(stock.rsi), rangePos = num(stock.rangePos), p1m = num(stock.perf1m);

    var hot = (rsi !== null && rsi >= CONFIG.hypeRsi) || (rangePos !== null && rangePos >= CONFIG.hypeRangePos) || (p1m !== null && p1m >= CONFIG.hypePerf1m);
    if (isRedditTrend(r) && hot) flags.push({ text: 'Hype-Warnung: Reddit-Trend bei bereits gelaufenem Kurs', pts: -5 });
    if (isWsbBull(r) && isNewsNegative(n)) flags.push({ text: 'Widerspruch: WSB bullisch, aber negative News', pts: -4 });
    var tr = trendInfo(stock);
    if (tr.dd !== null && tr.dd <= -30 && ((tr.below200 === true) || (tr.p3m !== null && tr.p3m <= -10))) {
      flags.push({ text: 'Starker Abwärtstrend: ' + Math.round(tr.dd) + ' % unter dem 52W-Hoch', pts: -6 });
    } else if (tr.p3m !== null && tr.p3m <= -25) {
      flags.push({ text: 'Kursverfall: ' + Math.round(tr.p3m) + ' % in 3 Monaten', pts: -4 });
    }
    if (rangePos !== null && rangePos <= 5) flags.push({ text: 'Nahe am 52-Wochen-Tief', pts: -3 });
    if (stock.bottom === 'knife') flags.push({ text: 'Fallendes Messer: Abwärtstrend noch intakt', pts: -6 });
    if (num(stock.rrCrv) !== null && stock.rrCrv < 1) flags.push({ text: 'Schwaches Chance-Risiko-Verhältnis (CRV unter 1)', pts: -3 });

    var ed = daysUntil(stock.analysts && stock.analysts.nextEarningsDate ? stock.analysts.nextEarningsDate : stock.nextEarningsDate);
    if (ed !== null && ed >= 0 && ed <= 14) info.push('Quartalsbericht in ' + ed + ' Tagen (höhere Schwankung möglich)');

    var penalty = flags.reduce(function (a, f) { return a + f.pts; }, 0);
    penalty = Math.max(-CONFIG.maxPenalty, penalty);
    return { flags: flags, info: info, penalty: penalty };
  }

  function flagsCategory(f) {
    var metrics = f.flags.map(function (x) { return { name: x.text, value: x.pts + ' Pkt' }; })
      .concat(f.info.map(function (t) { return { name: 'Hinweis', value: t }; }));
    var score = Math.max(0, Math.round((5 + f.penalty / 3) * 10) / 10);
    return {
      category: 'Warnsignale', score: score, weight: 'Abzug', metrics: metrics.length ? metrics : [{ name: 'Status', value: 'Keine' }],
      reason: f.flags.length ? 'Abzug von ' + Math.abs(f.penalty) + ' Punkten auf den Gesamtscore.' : '5,0 von 5 heißt: keine Abzüge, nicht „besonders gut“. Keine Warnsignale erkannt.' + (f.info.length ? ' ' + f.info.join('. ') + '.' : '')
    };
  }

  function calculateHolisticScore(stock) {
    var catFund = evalFundamentals(stock);
    var catTech = evalTechnicals(stock);
    var catAnalyst = evalAnalysts(stock);
    var catSmart = evalSmartMoney(stock);
    var catReddit = CONFIG.useReddit ? evalReddit(stock) : null;

    // Gewichte: ohne Reddit-Daten exakt 40/25/20/15 wie bisher
    var base = [0.40, 0.25, 0.20, 0.15], rw = catReddit ? CONFIG.redditWeight : 0;
    var w = base.map(function (x) { return x * (1 - rw); });
    var cats = [catFund, catTech, catAnalyst, catSmart];
    var totalPoints = 0;
    cats.forEach(function (c, i) { totalPoints += c.score * w[i]; c.weight = Math.round(w[i] * 100) + '%'; });
    if (catReddit) { totalPoints += catReddit.score * rw; catReddit.weight = Math.round(rw * 100) + '%'; cats.push(catReddit); }

    var f = CONFIG.useFlags ? evalFlags(stock) : { flags: [], info: [], penalty: 0 };
    var adjPoints = Math.max(0, Math.min(5, totalPoints + f.penalty / 20));
    if (CONFIG.useFlags) cats.push(flagsCategory(f));

    return {
      totalScore: Math.round(adjPoints * 10) / 10,
      score100: Math.round(adjPoints * 20),
      baseScore100: Math.round(totalPoints * 20),
      penalty: f.penalty,
      flags: f.flags.map(function (x) { return x.text; }),
      notes: f.info,
      band: scoreBand(Math.round(adjPoints * 20)),
      categories: cats
    };
  }

  // ---------------------------------------------------------------------------
  // NEU: Score für Universe-Einträge (Screener-Filter und Sortierung)
  // ---------------------------------------------------------------------------
  function hasN(v) { return v !== null && v !== undefined && v !== '' && !isNaN(v); }

  function stockFromUniverse(u) {
    var price = hasN(u.price) ? Number(u.price) : null;
    var enough = hasN(u.analystCount) && u.analystCount >= 5;
    var pseudo = {
      ticker: u.ticker, sector: u.sector, name: u.name,
      ratios: { peTrailing: u.pe, peForward: u.forwardPe, profitMargins: u.profitMargins, revenueGrowth: u.revGrowth,
                debtToEquity: u.debtToEquity, dividendYield: u.dividendYield },
      rsi: u.rsi, cross: u.cross, rangePos: u.rangePos, perf1m: u.perf1m, perf3m: u.perf3m, high52: u.high52, bottom: u.bottom, rrCrv: u.rrCrv,
      nextEarningsDate: u.nextEarningsDate,
      quote: { price: price },
      analysts: { targets: {}, recommendations: {} },
      insider: {}
    };
    if (price > 0 && hasN(u.upside) && enough) pseudo.analysts.targets.mean = price * (1 + Number(u.upside) / 100);
    if (hasN(u.buyPct) && enough) pseudo.analysts.recommendations.score = 5 - 4 * (Number(u.buyPct) / 100);
    return pseudo;
  }

  var uniCache = {};
  function calculateUniverseScore(u) {
    if (!u || !u.ticker) return null;
    var N = window.App.News;
    var sig = [u.price, u.liveTs || u.updatedAt || '', N && N.cache && N.cache.index ? 1 : 0, N && N.cache && N.cache.redditIndex ? 1 : 0].join('|');
    var hit = uniCache[u.ticker];
    if (hit && hit.sig === sig) return hit.val;
    var val = calculateHolisticScore(stockFromUniverse(u));
    uniCache[u.ticker] = { sig: sig, val: val };
    return val;
  }

  /** Setzt u.score100, u.scoreBand und u.scoreFlags an jeden Eintrag (für Filter, Sortierung und Chips). */
  function attachUniverseScores(list) {
    (list || []).forEach(function (u) {
      var r = calculateUniverseScore(u);
      if (!r) return;
      u.score100 = r.score100; u.scoreBand = r.band.label; u.scoreFlags = r.flags; u.scorePenalty = r.penalty;
    });
    return list;
  }

  /** Lädt News- und Reddit-Index, damit der Score vollständig ist. */
  function prepare() {
    var N = window.App.News;
    if (!N) return Promise.resolve();
    return Promise.all([
      N.loadIndex ? N.loadIndex() : null,
      N.loadRedditIndex ? N.loadRedditIndex() : null
    ]).catch(function () { return null; }).then(function () { return null; });
  }

  function calculateTotalScoreAsync(stock) {
    return prepare().then(function () { return calculateTotalScoreAsyncInner(stock); });
  }

  function calculateTotalScoreAsyncInner(stock) {
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
    renderSegmentBarHtml: renderSegmentBarHtml,
    // NEU
    calculateUniverseScore: calculateUniverseScore,
    attachUniverseScores: attachUniverseScores,
    prepare: prepare,
    scoreBand: scoreBand,
    bands: BANDS,
    config: CONFIG
  };
})();
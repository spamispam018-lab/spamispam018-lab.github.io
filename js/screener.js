/**
 * js/screener.js
 * Verwaltet den Aktien-Screener.
 * NEU: Strategie-Button neben "Filter speichern" platziert.
 */
window.App = window.App || {};

window.App.Screener = (function () {
  'use strict';

  var PROGNOSE_STEIGEND_MIN = 10;   
  var PROGNOSE_FALLEND_MAX = 0;     
  var MIN_ANALYSTS = 5;             
  var EMA_CROSS_RECENT_DAYS = 10;   // EMA-12/26-Kreuz gilt als frisch
  var CROSS_RECENT_DAYS = 60;       
  var QUALITY_MIN_MARGIN = 0.10;    
  var QUALITY_MAX_DEBT_EQUITY = 100; 
  var EARNINGS_GROWTH_MIN = 0.15;   
  var RECOVERY_MAX_RANGEPOS = 33;   
  var OVERSOLD_RSI_MAX = 30;        
  var EARNINGS_SOON_DAYS = 14;      
  var CONSENSUS_BUY_MIN = 70;       
  var VALUE_DISCOUNT = 0.15;        
  var VALUE_FALLBACK_PE = 18;       
  var MIN_SECTOR_SIZE = 5;          
  var RR_MIN_CRV = 2;               
  var RR_MAX_STOP_PCT = 5;          
  var STALE_AFTER_HOURS = 84;       

  var STORAGE_KEY = 'screener_state_v1';
  var SNAPSHOT_KEY = 'screener_snapshot_v1';
  var SCREENER_ALERTS_KEY = 'screener_alerts_v1';

  var allStocks = [];
  var filteredStocks = [];

  var currentSearchQuery = '';
  var currentSort = 'marketCap_desc';
  var activePresets = [];   
  var autoSorted = false;   
  var sliderFilters = { maxPe: null, minYield: 0, minPerf: null, minCrv: null, maxStop: null };

  var sectorPe = {};        
  var dataStamp = null;     
  var newSets = {};         
  var presetCounts = {};    

  var SORT_OPTIONS = [
    { v: 'marketCap_desc', label: 'Marktkapitalisierung (Höchste)' },
    { v: 'change_desc', label: 'Tagesgewinner (%)' },
    { v: 'change_asc', label: 'Tagesverlierer (%)' },
    { v: 'name_asc', label: 'Name (A–Z)' },
    { v: 'pe_asc', label: 'KGV (Niedrigste)' },
    { v: 'upside_desc', label: 'Kursziel-Potenzial (Höchstes)' },
    { v: 'upside_asc', label: 'Kursziel-Potenzial (Niedrigstes)' },
    { v: 'rsi_asc', label: 'RSI (Niedrigster)' },
    { v: 'dividend_desc', label: 'Dividendenrendite (Höchste)' },
    { v: 'perf52w_desc', label: '52W-Performance (Beste)' },
    { v: 'crv_desc', label: 'CRV (Bestes)' },
    { v: 'stop_asc', label: 'Stop-Abstand (Kleinster)' }
  ];

  var PRESET_EXCLUSIVE = {
    forecast_up: 'forecast_down', forecast_down: 'forecast_up',
    death_cross: 'golden_cross', golden_cross: 'death_cross',
    ema_up: 'ema_down', ema_down: 'ema_up',
    tech_bullish: 'tech_bearish', tech_bearish: 'tech_bullish'
  };

  var PRESET_SORTS = { forecast_up: 'upside_desc', forecast_down: 'upside_asc', oversold: 'rsi_asc', low_risk: 'crv_desc' };

  function hasNum(v) { return typeof v === 'number' && isFinite(v); }
  function hasUpside(s) { return hasNum(s.upside); }
  
  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtNum(v, d) { return window.App.Format.number(v, d); }
  function isActive(p) { return activePresets.indexOf(p) !== -1; }

  function loadJson(key) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function saveJson(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }

  function cmpNum(x, y, dir) {
    var hx = hasNum(x), hy = hasNum(y);
    if (!hx && !hy) return 0;
    if (!hx) return 1;
    if (!hy) return -1;
    return dir === 'asc' ? x - y : y - x;
  }

  function isLoss(s) {
    if (hasNum(s.pe)) return s.pe < 0;
    return hasNum(s.profitMargins) && s.profitMargins < 0;
  }
  function analystOk(s) { return !hasNum(s.analystCount) || s.analystCount >= MIN_ANALYSTS; }
  function peLimit(s) { var median = sectorPe[s.sector]; return median ? median * (1 - VALUE_DISCOUNT) : VALUE_FALLBACK_PE; }
  function isCheap(s) { return s.pe > 0 && s.pe <= peLimit(s); }

  function isUndervalued(s) {
    if (!isCheap(s)) return false;
    if (hasNum(s.peg) && !(s.peg > 0 && s.peg <= 1.5)) return false;
    if (!(s.profitMargins > 0)) return false;
    if (hasNum(s.debtToEquity) && s.debtToEquity > 150) return false;
    if ((s.revGrowth || 0) < 0) return false;
    if (!hasNum(s.rangePos) || s.rangePos > 50) return false;
    return true;
  }

  function isTurnaround(s) {
    if (!isLoss(s)) return false;
    if (!(s.forwardPe > 0 && s.forwardPe <= 12)) return false;
    if (hasNum(s.debtToEquity) && s.debtToEquity > 150) return false;
    if (!hasNum(s.rangePos) || s.rangePos > 50) return false;
    return true;
  }

  function isQuality(s) {
    if (!hasNum(s.profitMargins) || s.profitMargins < QUALITY_MIN_MARGIN) return false;
    if (!hasNum(s.revGrowth) || s.revGrowth < 0) return false;
    if (hasNum(s.debtToEquity) && s.debtToEquity > QUALITY_MAX_DEBT_EQUITY) return false;
    return true;
  }

  function isEarningsGrowth(s) {
    if (!(s.pe > 0) || !(s.forwardPe > 0)) return false;
    return s.forwardPe <= s.pe * (1 - EARNINGS_GROWTH_MIN);
  }

  function isRecovery(s) {
    if (!hasNum(s.rangePos) || s.rangePos > RECOVERY_MAX_RANGEPOS) return false;
    return hasUpside(s) && s.upside >= PROGNOSE_STEIGEND_MIN && analystOk(s);
  }

  function isOversold(s) { return hasNum(s.rsi) && s.rsi <= OVERSOLD_RSI_MAX; }

  function daysTo(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    return Math.round((d.getTime() - Date.now()) / 86400000);
  }

  function isEarningsSoon(s) {
    var d = daysTo(s.nextEarningsDate);
    return d !== null && d >= 0 && d <= EARNINGS_SOON_DAYS;
  }

  function isConsensusBuy(s) { return hasNum(s.buyPct) && s.buyPct >= CONSENSUS_BUY_MIN && analystOk(s); }

  var NEWS_MIN_ITEMS = 3, NEWS_SHARE_MIN = 0.5, NEWS_SCORE_MIN = 0.2;
  function newsOf(s) {
    var idx = window.App.News && window.App.News.cache.index;
    return idx ? idx[s.ticker] : null;
  }
  function isNewsPositive(s) {
    var x = newsOf(s);
    return !!x && x.n >= NEWS_MIN_ITEMS && x.pos / x.n >= NEWS_SHARE_MIN && x.score >= NEWS_SCORE_MIN;
  }
  function isNewsNegative(s) {
    var x = newsOf(s);
    return !!x && x.n >= NEWS_MIN_ITEMS && x.neg / x.n >= NEWS_SHARE_MIN && x.score <= -NEWS_SCORE_MIN;
  }

  function isConsensusSell(s) { return hasNum(s.buyPct) && s.buyPct <= 20 && analystOk(s); }
  function isLowRisk(s) { return hasNum(s.rrCrv) && hasNum(s.rrStopPct) && s.rrCrv >= RR_MIN_CRV && s.rrStopPct <= RR_MAX_STOP_PCT; }
  function hasRecentCross(s, type) { return s.cross === type && hasNum(s.crossDaysAgo) && s.crossDaysAgo <= CROSS_RECENT_DAYS; }
  function hasEmaCross(s, type) { return s.emaCross === type && hasNum(s.emaCrossDaysAgo) && s.emaCrossDaysAgo <= EMA_CROSS_RECENT_DAYS; }
  function hasTechPattern(s, id) { return Array.isArray(s.chartPatterns) && s.chartPatterns.indexOf(id) !== -1; }

  var PRESET_FILTERS = {
    high_dividend: function (s) { return (s.dividendYield || 0) >= 3; },
    value: function (s) { return isCheap(s); },
    undervalued: function (s) { return isUndervalued(s); },
    turnaround: function (s) { return isTurnaround(s); },
    growth: function (s) { return (s.revGrowth || 0) >= 0.10; },
    top_performer: function (s) { return (s.perf52w || 0) >= 15; },
    forecast_up: function (s) { return hasUpside(s) && s.upside >= PROGNOSE_STEIGEND_MIN && analystOk(s); },
    forecast_down: function (s) { return hasUpside(s) && s.upside < PROGNOSE_FALLEND_MAX && analystOk(s); },
    death_cross: function (s) { return hasRecentCross(s, 'death'); },
    golden_cross: function (s) { return hasRecentCross(s, 'golden'); },
    ema_up: function (s) { return hasEmaCross(s, 'up'); },
    ema_down: function (s) { return hasEmaCross(s, 'down'); },
    ema_trend: function (s) { return s.emaTrend === true; },
    quality: function (s) { return isQuality(s); },
    earnings_growth: function (s) { return isEarningsGrowth(s); },
    recovery: function (s) { return isRecovery(s); },
    oversold: function (s) { return isOversold(s); },
    earnings_soon: function (s) { return isEarningsSoon(s); },
    consensus_buy: function (s) { return isConsensusBuy(s); },
    consensus_sell: function (s) { return isConsensusSell(s); },
    bottom_base: function (s) { return s.bottom === 'base'; },
    bottom_knife: function (s) { return s.bottom === 'knife'; },
    low_risk: function (s) { return isLowRisk(s); },
    news_positive: function (s) { return isNewsPositive(s); },
    news_negative: function (s) { return isNewsNegative(s); },
    tech_bullish: function (s) { return !!s.hasBullishPattern; },
    tech_bearish: function (s) { return !!s.hasBearishPattern; },
    tech_double_top: function (s) { return hasTechPattern(s, 'double_top'); },
    tech_double_bottom: function (s) { return hasTechPattern(s, 'double_bottom'); },
    tech_squeeze: function (s) { return s.bollingerSqueeze === true || hasTechPattern(s, 'squeeze'); }
  };

  var PRESETS = [
    { id: 'high_dividend', chip: '💰 Hohe Dividende', name: 'Hohe Dividende', info: function () { return 'Dividendenrendite mindestens 3 %.'; } },
    { id: 'value', chip: '💎 Value (KGV &lt; Branche)', name: 'Value', info: function () { return 'KGV positiv und mindestens ' + Math.round(VALUE_DISCOUNT * 100) + ' % unter dem Median der eigenen Branche.'; } },
    { id: 'undervalued', chip: '🔎 Unterbewertet', name: 'Unterbewertet', info: function () { return 'Günstiges KGV (wie Value), PEG ≤ 1,5, positive Marge, Verschuldung ≤ 150, Umsatzwachstum ≥ 0 und Kurs in der unteren Hälfte der 52W-Spanne.'; } },
    { id: 'turnaround', chip: '🔄 Turnaround', name: 'Turnaround', info: function () { return 'Aktuell Verlust, aber Forward-KGV ≤ 12, Verschuldung ≤ 150 und Kurs in der unteren Hälfte der 52W-Spanne. Hohes Risiko.'; } },
    { id: 'growth', chip: '🚀 Growth', name: 'Growth', info: function () { return 'Umsatzwachstum mindestens 10 %.'; } },
    { id: 'top_performer', chip: '📈 Top Performer (1J)', name: 'Top Performer (1J)', info: function () { return '52-Wochen-Performance mindestens 15 %.'; } },
    { id: 'forecast_up', chip: '🔼 Prognose steigend', name: 'Prognose steigend', info: function () { return 'Mittleres Analysten-Kursziel mindestens ' + PROGNOSE_STEIGEND_MIN + ' % über dem Kurs, bei mindestens ' + MIN_ANALYSTS + ' Analysten.'; } },
    { id: 'forecast_down', chip: '🔽 Prognose fallend', name: 'Prognose fallend', info: function () { return 'Mittleres Analysten-Kursziel unter dem aktuellen Kurs, bei mindestens ' + MIN_ANALYSTS + ' Analysten.'; } },
    { id: 'death_cross', chip: '☠️ Death Cross', name: 'Death Cross', info: function () { return 'SMA 50 hat SMA 200 in den letzten ' + CROSS_RECENT_DAYS + ' Handelstagen von oben nach unten gekreuzt (Abwärtssignal).'; } },
    { id: 'golden_cross', chip: '✨ Golden Cross', name: 'Golden Cross', info: function () { return 'SMA 50 hat SMA 200 in den letzten ' + CROSS_RECENT_DAYS + ' Handelstagen von unten nach oben gekreuzt (Aufwärtssignal).'; } },
    { id: 'ema_up', chip: '⚡ EMA-Aufwärtskreuz', name: 'EMA-Aufwärtskreuz', info: function () { return 'EMA 12 hat EMA 26 in den letzten ' + EMA_CROSS_RECENT_DAYS + ' Handelstagen von unten nach oben gekreuzt (früheres Signal als der Golden Cross, aber anfälliger für Fehlsignale).'; } },
    { id: 'ema_down', chip: '🔻 EMA-Abwärtskreuz', name: 'EMA-Abwärtskreuz', info: function () { return 'EMA 12 hat EMA 26 in den letzten ' + EMA_CROSS_RECENT_DAYS + ' Handelstagen von oben nach unten gekreuzt (Warnsignal).'; } },
    { id: 'ema_trend', chip: '📶 EMA-Trend intakt', name: 'EMA-Trend intakt', info: function () { return 'Kurs über dem EMA 50 und der EMA 50 über dem EMA 200: etablierter Aufwärtstrend.'; } },
    { id: 'quality', chip: '🏆 Qualität', name: 'Qualität', info: function () { return 'Nettomarge ≥ ' + Math.round(QUALITY_MIN_MARGIN * 100) + ' %, Umsatzwachstum ≥ 0 % und Verschuldung (Debt/Equity) ≤ ' + QUALITY_MAX_DEBT_EQUITY + '.'; } },
    { id: 'earnings_growth', chip: '📈 Gewinnwachstum erwartet', name: 'Gewinnwachstum erwartet', info: function () { return 'KGV positiv und Forward-KGV mindestens ' + Math.round(EARNINGS_GROWTH_MIN * 100) + ' % unter dem aktuellen KGV (Analysten erwarten steigende Gewinne).'; } },
    { id: 'recovery', chip: '🌱 Erholung', name: 'Erholung', info: function () { return 'Kurs im unteren Drittel der 52W-Spanne (≤ ' + RECOVERY_MAX_RANGEPOS + ' %), Kursziel mindestens ' + PROGNOSE_STEIGEND_MIN + ' % darüber, bei mindestens ' + MIN_ANALYSTS + ' Analysten.'; } },
    { id: 'oversold', chip: '📉 Überverkauft', name: 'Überverkauft', info: function () { return 'RSI(14) höchstens ' + OVERSOLD_RSI_MAX + ' (stark gefallen, mögliche Gegenbewegung).'; } },
    { id: 'earnings_soon', chip: '📅 Bericht ≤ 14 Tage', name: 'Bericht in den nächsten 14 Tagen', info: function () { return 'Nächster Quartalsbericht innerhalb der nächsten ' + EARNINGS_SOON_DAYS + ' Tage (laut Datenpipeline).'; } },
    { id: 'consensus_buy', chip: '👍 Kaufkonsens', name: 'Kaufkonsens', info: function () { return 'Mindestens ' + CONSENSUS_BUY_MIN + ' % der Analysten mit Buy/StrongBuy, bei mindestens ' + MIN_ANALYSTS + ' Analysten.'; } },
    { id: 'consensus_sell', chip: '👎 Verkaufskonsens', name: 'Verkaufskonsens', info: function () { return 'Höchstens 20 % der Analysten mit Buy/StrongBuy, bei mindestens ' + MIN_ANALYSTS + ' Analysten.'; } },
    { id: 'bottom_base', chip: '🌅 Bodenbildung', name: 'Bodenbildung', info: function () { return 'Kurs mindestens 20 % unter dem 52W-Hoch und mindestens 4 von 6 Stabilisierungs-Signalen. Möglicher Boden, keine Garantie.'; } },
    { id: 'bottom_knife', chip: '🔪 Fallendes Messer', name: 'Fallendes Messer', info: function () { return 'Kurs mindestens 20 % unter dem 52W-Hoch, höchstens 2 von 6 Stabilisierungs-Signalen und frisches Tief. Abwärtstrend noch intakt.'; } },
    { id: 'low_risk', chip: '🛡️ Kleines Risiko', name: 'Kleines Risiko', info: function () { return 'Long-Setup mit begrenztem Risiko: Stop knapp unter der nächsten Unterstützung höchstens ' + RR_MAX_STOP_PCT + ' % unter dem Kurs und Chance-Risiko-Verhältnis (CRV) mindestens ' + RR_MIN_CRV + ':1.'; } },
    { id: 'news_positive', chip: '📰 Positive News', name: 'Positive Nachrichten', info: function () { return 'Mindestens ' + NEWS_MIN_ITEMS + ' aktuelle Nachrichten, davon mindestens ' + Math.round(NEWS_SHARE_MIN * 100) + ' % positiv (automatische FinBERT-Einschätzung).'; } },
    { id: 'news_negative', chip: '⚠️ Negative News', name: 'Negative Nachrichten', info: function () { return 'Mindestens ' + NEWS_MIN_ITEMS + ' aktuelle Nachrichten, davon mindestens ' + Math.round(NEWS_SHARE_MIN * 100) + ' % negativ (automatische FinBERT-Einschätzung).'; } },
    { id: 'tech_bullish', chip: '📊 Bullisches Chartmuster', name: 'Bullisches Chartmuster', info: function () { return 'In der Daten-Pipeline wurde mindestens ein bullisches Chartmuster erkannt (Doppel-Boden, Golden Cross, aufsteigendes Dreieck). Vergangene Kursdaten, keine Prognose.'; } },
    { id: 'tech_bearish', chip: '📉 Bärisches Chartmuster', name: 'Bärisches Chartmuster', info: function () { return 'In der Daten-Pipeline wurde mindestens ein bärisches Chartmuster erkannt (Doppel-Top, Death Cross, Schulter-Kopf-Schulter). Vergangene Kursdaten, keine Prognose.'; } },
    { id: 'tech_double_top', chip: '⛰️ Doppel-Top', name: 'Doppel-Top', info: function () { return 'Chartmuster mit zwei etwa gleich hohen Hochpunkten – gilt als bärisches Umkehrsignal.'; } },
    { id: 'tech_double_bottom', chip: '🏔️ Doppel-Boden', name: 'Doppel-Boden', info: function () { return 'Chartmuster mit zwei etwa gleich tiefen Tiefpunkten – gilt als bullisches Umkehrsignal.'; } },
    { id: 'tech_squeeze', chip: '🎯 Bollinger-Squeeze', name: 'Bollinger-Squeeze', info: function () { return 'Bollinger-Bänder sehr eng – oft Vorläufer einer stärkeren Bewegung (Richtung offen).'; } }
  ];

  function presetName(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i].name;
    return id;
  }

  function normSliders(sl) {
    sl = sl || {};
    return {
      maxPe: hasNum(sl.maxPe) ? sl.maxPe : null,
      minYield: hasNum(sl.minYield) ? sl.minYield : 0,
      minPerf: hasNum(sl.minPerf) ? sl.minPerf : null,
      minCrv: hasNum(sl.minCrv) ? sl.minCrv : null,
      maxStop: hasNum(sl.maxStop) ? sl.maxStop : null
    };
  }

  function passesSliders(s) {
    if (sliderFilters.maxPe !== null && !(s.pe > 0 && s.pe <= sliderFilters.maxPe)) return false;
    if (sliderFilters.minYield > 0 && !((s.dividendYield || 0) >= sliderFilters.minYield)) return false;
    if (sliderFilters.minPerf !== null && !(hasNum(s.perf52w) && s.perf52w >= sliderFilters.minPerf)) return false;
    if (sliderFilters.minCrv !== null && !(hasNum(s.rrCrv) && s.rrCrv >= sliderFilters.minCrv)) return false;
    if (sliderFilters.maxStop !== null && !(hasNum(s.rrStopPct) && s.rrStopPct <= sliderFilters.maxStop)) return false;
    return true;
  }

  function passesSlidersWith(s, sl) {
    if (sl.maxPe !== null && !(s.pe > 0 && s.pe <= sl.maxPe)) return false;
    if (sl.minYield > 0 && !((s.dividendYield || 0) >= sl.minYield)) return false;
    if (sl.minPerf !== null && !(hasNum(s.perf52w) && s.perf52w >= sl.minPerf)) return false;
    if (sl.minCrv !== null && !(hasNum(s.rrCrv) && s.rrCrv >= sl.minCrv)) return false;
    if (sl.maxStop !== null && !(hasNum(s.rrStopPct) && s.rrStopPct <= sl.maxStop)) return false;
    return true;
  }

  function slidersActive() {
    return sliderFilters.maxPe !== null || sliderFilters.minYield > 0 || sliderFilters.minPerf !== null ||
      sliderFilters.minCrv !== null || sliderFilters.maxStop !== null;
  }

  function peRank(s) {
    if (isLoss(s)) {
      var depth = hasNum(s.pe) && s.pe < 0 ? s.pe : (s.profitMargins || 0);
      return -1e6 + depth;
    }
    if (s.pe && s.pe > 0) return s.pe;
    return 1e9;
  }

  function computeSectorMedians(stocks) {
    var groups = {};
    stocks.forEach(function (s) {
      var sec = s.sector;
      if (!sec || sec === 'N/A' || sec === 'Sonstige' || sec === 'Markt') return;
      if (!(s.pe > 0 && s.pe < 150)) return;
      (groups[sec] = groups[sec] || []).push(s.pe);
    });
    var out = {};
    Object.keys(groups).forEach(function (sec) {
      var arr = groups[sec].slice().sort(function (a, b) { return a - b; });
      if (arr.length < MIN_SECTOR_SIZE) return;
      var mid = Math.floor(arr.length / 2);
      out[sec] = arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    });
    return out;
  }

  function computeDataStamp(stocks) {
    var max = null;
    stocks.forEach(function (s) {
      if (!s.updatedAt) return;
      var t = new Date(s.updatedAt).getTime();
      if (!isNaN(t) && (max === null || t > max)) max = t;
    });
    return max === null ? null : new Date(max);
  }

  function computePresetCounts(stocks) {
    var counts = {};
    Object.keys(PRESET_FILTERS).forEach(function (p) { counts[p] = stocks.filter(PRESET_FILTERS[p]).length; });
    return counts;
  }

  function toMap(arr) {
    var m = {};
    (arr || []).forEach(function (t) { m[t] = true; });
    return m;
  }

  function computeNewSets(stocks) {
    newSets = {};
    if (!dataStamp) return;
    var stamp = dataStamp.toISOString();
    var snap = loadJson(SNAPSHOT_KEY);

    if (snap && snap.stamp === stamp && snap.newSets) {
      Object.keys(snap.newSets).forEach(function (p) { newSets[p] = toMap(snap.newSets[p]); });
      return;
    }

    var sets = {};
    var fresh = {};
    Object.keys(PRESET_FILTERS).forEach(function (p) {
      sets[p] = stocks.filter(PRESET_FILTERS[p]).map(function (s) { return s.ticker; });
      var prev = snap && snap.sets ? snap.sets[p] : null;
      if (prev && prev.length > 0) {
        var prevMap = toMap(prev);
        fresh[p] = sets[p].filter(function (t) { return !prevMap[t]; });
      } else {
        fresh[p] = [];
      }
      newSets[p] = toMap(fresh[p]);
    });
    saveJson(SNAPSHOT_KEY, { stamp: stamp, sets: sets, newSets: fresh });
  }

  function isNewInActiveFilter(s) {
    for (var i = 0; i < activePresets.length; i++) {
      var m = newSets[activePresets[i]];
      if (m && m[s.ticker]) return true;
    }
    return false;
  }

  function saveState() {
    saveJson(STORAGE_KEY, {
      presets: activePresets,
      sort: currentSort,
      autoSorted: autoSorted,
      sliders: sliderFilters
    });
  }

  function restoreState() {
    var st = loadJson(STORAGE_KEY);
    if (!st) return;
    if (Array.isArray(st.presets)) {
      activePresets = st.presets.filter(function (p) { return PRESET_FILTERS[p]; });
    }
    if (typeof st.sort === 'string' && SORT_OPTIONS.some(function (o) { return o.v === st.sort; })) {
      currentSort = st.sort;
    }
    autoSorted = !!st.autoSorted;
    if (st.sliders) {
      sliderFilters = normSliders(st.sliders);
    }
  }

  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;

    unlockPageScroll();
    container.innerHTML = getTemplateHtml();
    var filterOpenBtn = document.getElementById('screener-filter-open');
    if (filterOpenBtn) filterOpenBtn.onclick = openSheet;
    var moreBtn = document.getElementById('screener-more-btn');
    if (moreBtn) moreBtn.onclick = openMoreActions;
    if (window.App.StrategyScanner) {
      window.App.StrategyScanner.mount(document.getElementById('screener-scanner-slot'), { startCollapsed: true });
    }
    var searchInput = document.getElementById('screener-search-input');
    if (searchInput) searchInput.value = currentSearchQuery;
    updateHeaderFilterIndicator();

    Promise.resolve(window.App.News ? window.App.News.loadIndex() : null)
      .then(function () { return window.App.Data.getUniverse(); })
      .then(function (stocks) {
        allStocks = stocks || [];
        sectorPe = computeSectorMedians(allStocks);
        dataStamp = computeDataStamp(allStocks);
        presetCounts = computePresetCounts(allStocks);
        computeNewSets(allStocks);
        updateHeroBanner(allStocks);
        renderDataStamp();
        renderChipCounts();
        applyFiltersAndRender();
        bindEvents();
      })
      .catch(function (err) {
        var listContainer = document.getElementById('screener-list-container');
        if (listContainer) {
          listContainer.innerHTML = '<div class="state-box"><p>Fehler beim Laden: ' + esc(err && err.message) + '</p></div>';
        }
      });
  }

  function updateHeroBanner(stocks) {
    var countEl = document.getElementById('screener-hero-count');
    var winnerEl = document.getElementById('screener-hero-winner');
    var peEl = document.getElementById('screener-hero-pe');
    var yieldEl = document.getElementById('screener-hero-yield');

    if (!stocks || stocks.length === 0) return;

    if (countEl) countEl.textContent = stocks.length + ' Titel';

    var winner = stocks.reduce(function (best, item) {
      if (!hasNum(item.changePercent)) return best;
      return (best === null || item.changePercent > best.changePercent) ? item : best;
    }, null);

    if (winnerEl && winner) {
      var sign = winner.changePercent >= 0 ? '+' : '';
      winnerEl.innerHTML = '<b>' + esc(winner.ticker || '—') + '</b> <span style="color: var(--bullish); font-weight: 600;">' + sign + fmtNum(winner.changePercent, 2) + ' %</span>';
    }

    var peValues = stocks.filter(function (s) { return s.pe && s.pe > 0 && s.pe < 150; });
    var avgPe = peValues.length > 0 ? peValues.reduce(function (sum, s) { return sum + s.pe; }, 0) / peValues.length : 0;
    if (peEl) peEl.textContent = avgPe > 0 ? fmtNum(avgPe, 1) : '—';

    var divValues = stocks.filter(function (s) { return s.dividendYield && s.dividendYield > 0 && s.dividendYield < 25; });
    var avgYield = divValues.length > 0 ? (divValues.reduce(function (sum, s) { return sum + s.dividendYield; }, 0) / divValues.length) : 0;
    if (yieldEl) yieldEl.textContent = avgYield > 0 ? fmtNum(avgYield, 1) + ' %' : '—';
  }

  function renderDataStamp() {
    var el = document.getElementById('screener-data-stamp');
    if (!el) return;
    if (!dataStamp) { el.innerHTML = ''; return; }
    var txt;
    try {
      txt = dataStamp.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      txt = dataStamp.toISOString();
    }
    var ageH = (Date.now() - dataStamp.getTime()) / 3600000;
    if (ageH > STALE_AFTER_HOURS) {
      el.innerHTML = '<span style="color: var(--bearish); font-weight: 700;">⚠ Daten evtl. veraltet – Stand: ' + esc(txt) + ' Uhr</span>';
    } else {
      el.textContent = 'Datenstand: ' + txt + ' Uhr';
    }
  }

  function renderChipCounts() {
    var nodes = document.querySelectorAll('[data-count-for]');
    nodes.forEach(function (n) {
      var p = n.getAttribute('data-count-for');
      n.textContent = presetCounts[p] !== undefined ? '· ' + presetCounts[p] : '';
      if (/^ema_/.test(p) && allStocks.length && !emaDataPresent()) { n.textContent = '· ⚠'; n.title = 'EMA-Daten fehlen noch: Daten-Pipeline einmal neu laufen lassen'; }
    });
    var miss = allStocks.length && !emaDataPresent();
    document.querySelectorAll('.ema-missing-note').forEach(function (w) { w.style.display = miss ? 'block' : 'none'; });
  }

  // EMA-Kennzahlen kommen aus der Pipeline (fetch_market_data.py); ältere Datenstände enthalten sie nicht
  function emaDataPresent() {
    for (var i = 0; i < allStocks.length; i++) if (allStocks[i].emaTrend !== undefined || allStocks[i].emaCross !== undefined) return true;
    return false;
  }

  function applyFiltersAndRender() {
    var list = allStocks.slice();

    if (currentSearchQuery) {
      var q = currentSearchQuery.toLowerCase().trim();
      list = list.filter(function (item) {
        var tick = (item.ticker || '').toLowerCase();
        var name = (item.name || '').toLowerCase();
        var sector = (item.sector || '').toLowerCase();
        return tick.indexOf(q) !== -1 || name.indexOf(q) !== -1 || sector.indexOf(q) !== -1;
      });
    }

    activePresets.forEach(function (p) {
      var fn = PRESET_FILTERS[p];
      if (fn) list = list.filter(fn);
    });

    list = list.filter(passesSliders);

    list.sort(function (a, b) {
      switch (currentSort) {
        case 'change_desc': return cmpNum(a.changePercent, b.changePercent, 'desc');
        case 'change_asc': return cmpNum(a.changePercent, b.changePercent, 'asc');
        case 'pe_asc': return peRank(a) - peRank(b);
        case 'upside_desc': return cmpNum(a.upside, b.upside, 'desc');
        case 'upside_asc': return cmpNum(a.upside, b.upside, 'asc');
        case 'rsi_asc': return cmpNum(a.rsi, b.rsi, 'asc');
        case 'dividend_desc': return cmpNum(a.dividendYield, b.dividendYield, 'desc');
        case 'perf52w_desc': return cmpNum(a.perf52w, b.perf52w, 'desc');
        case 'crv_desc': return cmpNum(a.rrCrv, b.rrCrv, 'desc');
        case 'stop_asc': return cmpNum(a.rrStopPct, b.rrStopPct, 'asc');
        case 'name_asc': return (a.name || a.ticker || '').localeCompare(b.name || b.ticker || '');
        default: return cmpNum(a.marketCap, b.marketCap, 'desc');
      }
    });

    filteredStocks = list;

    var resultCountEl = document.getElementById('screener-result-count');
    if (resultCountEl) resultCountEl.textContent = filteredStocks.length + ' Ergebnisse';

    renderSummary();
    renderSavedRow();
    renderAiBanner(filteredStocks, activePresets);
    renderStockCards(filteredStocks);
    saveState();
  }

  function sliderSummaryParts() {
    var parts = [];
    if (sliderFilters.maxPe !== null) parts.push('KGV ≤ ' + sliderFilters.maxPe);
    if (sliderFilters.minYield > 0) parts.push('Dividende ≥ ' + sliderFilters.minYield + ' %');
    if (sliderFilters.minPerf !== null) parts.push('52W ≥ ' + sliderFilters.minPerf + ' %');
    if (sliderFilters.minCrv !== null) parts.push('CRV ≥ ' + sliderFilters.minCrv + ':1');
    if (sliderFilters.maxStop !== null) parts.push('Stop ≤ ' + sliderFilters.maxStop + ' %');
    return parts;
  }

  function renderSummary() {
    var el = document.getElementById('screener-active-summary');
    if (!el) return;

    var lines = [];
    if (activePresets.length > 0) {
      lines.push('<b>' + activePresets.map(function (p) { return esc(presetName(p)); }).join(' + ') + '</b>' + (activePresets.length > 1 ? ' – alle Filter müssen zutreffen' : ''));
    }
    var sl = sliderSummaryParts();
    if (sl.length > 0) lines.push('Feinfilter: ' + esc(sl.join(' · ')));

    if (lines.length === 0) { el.innerHTML = ''; return; }

    if (activePresets.length > 0) {
      var wl = window.App.Data.getWatchlist() || [];
      var wlCount = filteredStocks.filter(function (s) { return wl.indexOf(s.ticker) !== -1; }).length;
      var newCount = filteredStocks.filter(isNewInActiveFilter).length;
      var extra = [];
      if (wlCount > 0) extra.push('★ ' + wlCount + (wlCount === 1 ? ' Watchlist-Aktie erfüllt' : ' Watchlist-Aktien erfüllen') + ' den Filter');
      if (newCount > 0) extra.push('🆕 ' + newCount + ' neu seit dem letzten Daten-Update');
      if (extra.length > 0) lines.push(extra.join(' · '));
    }

    el.innerHTML = '<div style="font-size: 0.74rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 10px;">' + lines.join('<br>') + '</div>';
  }

  function crossTag(s) {
    if (!s.cross || !hasNum(s.crossDaysAgo) || s.crossDaysAgo > CROSS_RECENT_DAYS) return '';
    var isDeath = s.cross === 'death';
    var when = s.crossDaysAgo === 0 ? 'heute' : 'vor ' + s.crossDaysAgo + ' Tg.';
    return '<span class="sector-label" style="color: var(' + (isDeath ? '--bearish' : '--bullish') + '); font-weight: 700;">• ' + (isDeath ? 'Death Cross ' : 'Golden Cross ') + when + '</span>';
  }

  function greenTag(txt) { return '<span class="sector-label" style="color: var(--bullish); font-weight: 700;">• ' + esc(txt) + '</span>'; }

  function extraTags(s) {
    var tags = [];
    if (isActive('quality') && hasNum(s.profitMargins)) tags.push('Marge ' + fmtNum(s.profitMargins * 100, 0) + ' %');
    if (isActive('earnings_growth') && hasNum(s.pe) && hasNum(s.forwardPe)) tags.push('KGV ' + fmtNum(s.pe, 0) + ' → ' + fmtNum(s.forwardPe, 0));
    if (isActive('recovery') && hasNum(s.rangePos)) tags.push('52W-Spanne ' + fmtNum(s.rangePos, 0) + ' %');
    if ((isActive('ema_up') || isActive('ema_down')) && s.emaCross && hasNum(s.emaCrossDaysAgo)) tags.push('EMA-Kreuz ' + (s.emaCross === 'up' ? '▲' : '▼') + ' ' + (s.emaCrossDaysAgo === 0 ? 'heute' : 'vor ' + s.emaCrossDaysAgo + ' Tg.'));
    if (isActive('oversold') && hasNum(s.rsi)) tags.push('RSI ' + fmtNum(s.rsi, 0));
    if (isActive('low_risk') && hasNum(s.rrCrv)) tags.push('CRV ' + fmtNum(s.rrCrv, 1) + ' · Stop −' + fmtNum(s.rrStopPct, 1) + ' % · Ziel +' + fmtNum(s.rrTgtPct, 1) + ' %');
    if ((isActive('value') || isActive('undervalued')) && hasNum(s.pe) && s.pe > 0) {
      var med = sectorPe[s.sector];
      tags.push('KGV ' + fmtNum(s.pe, 0) + (med ? ' (Branche Ø ' + fmtNum(med, 0) + ')' : ''));
    }
    if ((isActive('tech_bullish') || isActive('tech_bearish')) && Array.isArray(s.chartPatterns) && s.chartPatterns.length > 0) {
      var prettyMap = { golden_cross: 'Golden Cross', death_cross: 'Death Cross', double_top: 'Doppel-Top', double_bottom: 'Doppel-Boden', squeeze: 'Squeeze' };
      var pretty = s.chartPatterns.slice(0, 2).map(function (id) { return prettyMap[id] || id; }).join(', ');
      tags.push('Muster: ' + pretty);
    }
    return tags.map(greenTag).join('');
  }

  function targetTag(s) {
    var wanted = isActive('undervalued') || isActive('turnaround') || isActive('forecast_up') || isActive('forecast_down') || isActive('recovery');
    if (!wanted || !hasUpside(s)) return '';
    var color = s.upside >= 0 ? '--bullish' : '--bearish';
    var analysts = hasNum(s.analystCount) && s.analystCount > 0 ? ' (' + s.analystCount + ' Analysten)' : '';
    return '<span class="sector-label" style="color: var(' + color + '); font-weight: 700;">• Ziel ' + (s.upside >= 0 ? '+' : '') + fmtNum(s.upside, 0) + ' %' + esc(analysts) + '</span>';
  }

  function renderStockCards(list) {
    var container = document.getElementById('screener-list-container');
    if (!container) return;

    if (list.length === 0) {
      container.innerHTML = '<div class="state-box"><p>Keine passenden Aktien gefunden.</p></div>';
      return;
    }

    var watchlist = window.App.Data.getWatchlist();

    var html = '';
    list.forEach(function (stock) {
      var isStarred = watchlist.indexOf(stock.ticker) !== -1;
      var chgCls = window.App.Format.changeClass(stock.changePercent);
      var sign = (stock.changePercent || 0) >= 0 ? '+' : '';
      var newBadge = activePresets.length > 0 && isNewInActiveFilter(stock) ? '<span class="sector-label" style="color: var(--accent-purple-light); font-weight: 700;">• NEU</span>' : '';

      html += '' +
        '<div class="stock-card" data-ticker="' + esc(stock.ticker) + '">' +
          '<div style="display:flex; align-items:center; flex:1; min-width:0;">' +
            '<button class="star-btn ' + (isStarred ? 'active' : '') + '" data-star-ticker="' + esc(stock.ticker) + '">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + (isStarred ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2">' +
                '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>' +
              '</svg>' +
            '</button>' +
            '<div class="stock-info-left" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
              '<div class="stock-name" style="overflow:hidden; text-overflow:ellipsis;">' + esc(stock.name || stock.ticker) + '</div>' +
              '<div class="stock-tags">' +
                '<span class="ticker-badge">' + esc(stock.ticker) + '</span>' +
                '<span class="sector-label">• ' + esc(stock.sector || 'Markt') + '</span>' +
                newBadge +
                targetTag(stock) +
                (activePresets.length > 0 ? crossTag(stock) : '') +
                extraTags(stock) +
                (isLoss(stock) ? '<span class="sector-label" style="color: var(--bearish); font-weight: 700;">• KGV neg.</span>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="stock-info-right">' +
            '<div class="stock-price">' + esc(window.App.Format.currency(stock.price, stock.currency || 'EUR')) + '</div>' +
            '<div class="badge-pill ' + chgCls + '">' + sign + fmtNum(stock.changePercent, 2) + ' %</div>' +
          '</div>' +
        '</div>';
    });

    container.innerHTML = html;
    bindCardEvents(container);
  }

  function bindCardEvents(container) {
    var cards = container.querySelectorAll('.stock-card');
    cards.forEach(function (card) {
      card.onclick = function (e) {
        if (e.target.closest('.star-btn')) return;
        var ticker = card.getAttribute('data-ticker');
        window.App.Data.setLastTicker(ticker);
        window.App.Router.navigate('/stock/' + ticker + '/overview');
      };
    });

    var starBtns = container.querySelectorAll('[data-star-ticker]');
    starBtns.forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var ticker = btn.getAttribute('data-star-ticker');
        var isNowActive = window.App.Data.toggleWatchlist(ticker);
        btn.classList.toggle('active', isNowActive);
        var svg = btn.querySelector('svg');
        if (svg) svg.setAttribute('fill', isNowActive ? 'currentColor' : 'none');
        renderSummary();
      };
    });
  }

  function renderAiBanner(list, presets) {
    var container = document.getElementById('screener-ai-banner-container');
    if (!container) return;

    if (!presets || presets.length === 0 || list.length === 0) {
      container.innerHTML = '';
      return;
    }

    var filterName = presets.map(presetName).join(' + ');

    var html = '' +
      '<div class="card" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%); border: 1px solid var(--accent-purple); padding: 14px; margin-bottom: 14px;">' +
        '<div style="display: flex; justify-content: space-between; align-items: center;">' +
          '<div style="flex: 1; padding-right: 12px;">' +
            '<div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main); margin-bottom: 2px; display: flex; align-items: center; gap: 6px;">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple-light)" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>' +
              'KI-Screening' +
            '</div>' +
            '<div style="font-size: 0.72rem; color: var(--text-muted);">Lass Gemini die besten 5 aus dieser Liste ermitteln. (' + list.length + ' Treffer)</div>' +
          '</div>' +
          '<button id="btn-screener-gemini" class="chip-btn active" style="background: var(--accent-purple); border-color: var(--accent-purple); font-size: 0.75rem; flex-shrink: 0; box-shadow: 0 4px 14px var(--accent-purple-glow);">Analysieren</button>' +
        '</div>' +
      '</div>';

    container.innerHTML = html;

    var geminiBtn = document.getElementById('btn-screener-gemini');
    if (!geminiBtn) return;

    geminiBtn.onclick = function () {
      var promptText = "Hallo Gemini! Bitte prüfe zuerst meine Daten. Hier ist eine Liste von " + list.length + " Aktien, die aktuell in meinem Screener den Filter '" + filterName + "' erfüllen. " +
        "Bitte analysiere diese Liste basierend auf den mitgelieferten Kennzahlen und der aktuellen Marktlage. " +
        "Empfiehl mir danach die 5 besten Kandidaten für einen Einstieg und begründe deine Wahl kurz.\n\n";

      list.forEach(function (s) {
        var parts = [];
        parts.push((s.name || s.ticker) + " (" + s.ticker + ")");
        parts.push("Sektor: " + (s.sector || 'N/A'));
        parts.push("Kurs: " + window.App.Format.currency(s.price, s.currency || 'EUR') + " (" + fmtNum(s.changePercent, 2) + " %)");
        parts.push("KGV: " + (hasNum(s.pe) ? fmtNum(s.pe, 1) : "N/A"));
        if (hasNum(s.forwardPe)) parts.push("Forward-KGV: " + fmtNum(s.forwardPe, 1));
        if (sectorPe[s.sector]) parts.push("Branchen-KGV: " + fmtNum(sectorPe[s.sector], 1));
        if (hasNum(s.profitMargins)) parts.push("Marge: " + fmtNum(s.profitMargins * 100, 0) + " %");
        if (hasNum(s.revGrowth)) parts.push("Umsatzwachstum: " + fmtNum(s.revGrowth * 100, 0) + " %");
        if (hasNum(s.debtToEquity)) parts.push("Debt/Equity: " + fmtNum(s.debtToEquity, 0));
        if (hasNum(s.rangePos)) parts.push("52W-Spanne: " + fmtNum(s.rangePos, 0) + " %");
        if (hasNum(s.rsi)) parts.push("RSI: " + fmtNum(s.rsi, 0));
        if (hasNum(s.rrCrv)) parts.push("Risk/Reward (Long): CRV " + fmtNum(s.rrCrv, 1) + ", Stop −" + fmtNum(s.rrStopPct, 1) + " % an der Unterstützung, Ziel +" + fmtNum(s.rrTgtPct, 1) + " %");
        if (hasNum(s.perf52w)) parts.push("52W-Perf.: " + fmtNum(s.perf52w, 0) + " %");
        if (hasUpside(s)) parts.push("Upside-Ziel: " + fmtNum(s.upside, 1) + " %" + (hasNum(s.analystCount) ? " (" + s.analystCount + " Analysten)" : ""));
        if (hasRecentCross(s, 'death')) parts.push("Death Cross vor " + s.crossDaysAgo + " Tg.");
        if (hasRecentCross(s, 'golden')) parts.push("Golden Cross vor " + s.crossDaysAgo + " Tg.");
        if (Array.isArray(s.chartPatterns) && s.chartPatterns.length > 0) parts.push("Chart-Muster: " + s.chartPatterns.join(', '));
        if (s.bottom) parts.push("Boden-Check: " + ({ base: 'Bodenbildung', knife: 'fallendes Messer', wait: 'unklar' })[s.bottom]);
        var nl = window.App.News && window.App.News.indexLine(s.ticker, true);
        if (nl) parts.push(nl);
        promptText += "- " + parts.join(" | ") + "\n";
      });

      var safeUrlText = promptText;
      var needsClipboardPaste = false;

      if (promptText.length > 2000) {
        safeUrlText = "Hallo Gemini! Ich habe eine große Liste mit " + list.length + " Aktien für den Filter '" + filterName + "' ermittelt. Ich füge dir die detaillierten Kennzahlen gleich in meiner nächsten Nachricht ein. Bitte antworte zunächst nur mit 'Bereit', damit ich die Daten einfügen kann.";
        needsClipboardPaste = true;
      }

      var geminiUrl = "https://gemini.google.com/app?q=" + encodeURIComponent(safeUrlText);

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(promptText).then(function () {
          if (needsClipboardPaste) {
            window.alert("Hinweis: Da die Liste mit " + list.length + " Aktien sehr lang ist, wurde sie automatisch in deine Zwischenablage kopiert. Füge den Text bei Gemini einfach über 'Einfügen' (oder Strg+V) in das Chat-Feld ein.");
          }
          window.open(geminiUrl, '_blank');
        }).catch(function () {
          window.open(geminiUrl, '_blank');
        });
      } else {
        window.open(geminiUrl, '_blank');
      }
    };
  }

  function peLabel(v) { return v >= 80 ? 'Beliebig' : '≤ ' + v; }
  function yieldLabel(v) { return v > 0 ? '≥ ' + v + ' %' : 'Beliebig'; }
  function perfLabel(v) { return v <= -50 ? 'Beliebig' : '≥ ' + v + ' %'; }
  function crvLabel(v) { return v <= 0 ? 'Beliebig' : '≥ ' + String(v).replace('.', ',') + ' : 1'; }
  function stopLabel(v) { return v >= 15 ? 'Beliebig' : '≤ ' + v + ' %'; }

  var scrollLocked = false;
  var savedBodyStyle = { overflow: '', overscroll: '' };

  function lockPageScroll() {
    if (scrollLocked || !document.body) return;
    savedBodyStyle.overflow = document.body.style.overflow || '';
    savedBodyStyle.overscroll = document.body.style.overscrollBehavior || '';
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    if (document.documentElement) document.documentElement.style.overscrollBehavior = 'none';
    scrollLocked = true;
  }

  function unlockPageScroll() {
    if (!scrollLocked || !document.body) return;
    document.body.style.overflow = savedBodyStyle.overflow;
    document.body.style.overscrollBehavior = savedBodyStyle.overscroll;
    if (document.documentElement) document.documentElement.style.overscrollBehavior = '';
    scrollLocked = false;
  }

  function openSheet() {
    var sheet = document.getElementById('filter-bottom-sheet');
    var backdrop = document.getElementById('filter-sheet-backdrop');
    if (!sheet || !backdrop) return;
    syncSliderInputs();
    sheet.style.transform = '';
    sheet.style.transition = '';
    lockPageScroll();
    sheet.classList.add('open');
    backdrop.classList.add('open');
  }

  function closeSheet() {
    unlockPageScroll();
    var sheet = document.getElementById('filter-bottom-sheet');
    var backdrop = document.getElementById('filter-sheet-backdrop');
    if (sheet) {
      sheet.style.transform = '';
      sheet.style.transition = '';
      sheet.classList.remove('open');
    }
    if (backdrop) backdrop.classList.remove('open');
  }

  function bindSheetSwipe() {
    var sheet = document.getElementById('filter-bottom-sheet');
    var backdrop = document.getElementById('filter-sheet-backdrop');
    if (!sheet) return;

    sheet.style.overscrollBehavior = 'contain';
    var handle = sheet.querySelector('.sheet-handle');
    if (handle) handle.style.touchAction = 'none';

    var startY = null;
    var dy = 0;
    var dragging = false;

    sheet.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) { startY = null; return; }
      startY = e.touches[0].clientY;
      dy = 0;
      dragging = false;
    }, { passive: true });

    sheet.addEventListener('touchmove', function (e) {
      if (startY === null || !e.touches || e.touches.length !== 1) return;
      var cur = e.touches[0].clientY;
      if (!dragging) {
        if (sheet.scrollTop > 0) {
          startY = cur;
          return;
        }
        if (cur - startY <= 6) return;
        dragging = true;
        sheet.style.transition = 'none';
      }
      dy = Math.max(0, cur - startY);
      sheet.style.transform = 'translateY(' + dy + 'px)';
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    function endSwipe() {
      if (!dragging) { startY = null; return; }
      var shouldClose = dy > 100 || dy > sheet.offsetHeight * 0.25;
      dragging = false;
      startY = null;
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (shouldClose) closeSheet();
    }
    sheet.addEventListener('touchend', endSwipe, { passive: true });
    sheet.addEventListener('touchcancel', endSwipe, { passive: true });

    if (backdrop) {
      backdrop.addEventListener('touchmove', function (e) {
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
    }
  }

  function syncSliderInputs() {
    var pe = document.getElementById('filter-slider-pe');
    var yl = document.getElementById('filter-slider-yield');
    var pf = document.getElementById('filter-slider-perf');
    if (pe) pe.value = sliderFilters.maxPe === null ? 80 : sliderFilters.maxPe;
    if (yl) yl.value = sliderFilters.minYield;
    if (pf) pf.value = sliderFilters.minPerf === null ? -50 : sliderFilters.minPerf;
    var cr = document.getElementById('filter-slider-crv');
    var st = document.getElementById('filter-slider-stop');
    if (cr) cr.value = sliderFilters.minCrv === null ? 0 : sliderFilters.minCrv;
    if (st) st.value = sliderFilters.maxStop === null ? 15 : sliderFilters.maxStop;
    updateSliderLabels();
  }

  function updateSliderLabels() {
    var pe = document.getElementById('filter-slider-pe');
    var yl = document.getElementById('filter-slider-yield');
    var pf = document.getElementById('filter-slider-perf');
    var lPe = document.getElementById('label-max-pe');
    var lYl = document.getElementById('label-min-yield');
    var lPf = document.getElementById('label-min-perf');
    if (pe && lPe) lPe.textContent = peLabel(Number(pe.value));
    if (yl && lYl) lYl.textContent = yieldLabel(Number(yl.value));
    if (pf && lPf) lPf.textContent = perfLabel(Number(pf.value));
    var cr = document.getElementById('filter-slider-crv'), st = document.getElementById('filter-slider-stop');
    var lCr = document.getElementById('label-min-crv'), lSt = document.getElementById('label-max-stop');
    if (cr && lCr) lCr.textContent = crvLabel(Number(cr.value));
    if (st && lSt) lSt.textContent = stopLabel(Number(st.value));
  }

  function activeSliderCount() {
    var n = 0;
    if (sliderFilters.maxPe !== null) n++;
    if (sliderFilters.minYield > 0) n++;
    if (sliderFilters.minPerf !== null) n++;
    if (sliderFilters.minCrv !== null) n++;
    if (sliderFilters.maxStop !== null) n++;
    return n;
  }

  function updateHeaderFilterIndicator() {
    var btn = document.getElementById('screener-filter-open');
    var badge = document.getElementById('screener-filter-badge');
    var n = activeSliderCount();
    if (btn) btn.classList.toggle('active', n > 0);
    if (badge) {
      badge.textContent = String(n);
      badge.style.display = n > 0 ? 'inline-flex' : 'none';
    }
  }

  /** ⋯-Menü der Ergebnisliste: seltener genutzte Aktionen gebündelt */
  function openMoreActions() {
    var UI = window.App.UI;
    var items = [
      { label: 'Als CSV exportieren', desc: filteredStocks.length + ' Treffer herunterladen', onClick: exportCsv },
      { label: 'Filter speichern', desc: 'Aktuelle Auswahl als eigenen Filter-Chip ablegen', onClick: saveCurrentFilter },
      { label: 'Als Alarm speichern', desc: 'Benachrichtigen, wenn neue Aktien den Filter erfüllen', onClick: createScreenerAlert },
      { label: 'Treffer mit Strategie-Scanner prüfen', desc: 'Kauf-Signale für die aktuelle Liste suchen', onClick: openScanner },
      { label: 'Fertige Strategien', desc: 'Value, Momentum, Dividende, Buy the Dip …', onClick: function () { window.App.Router.navigate('/strategies'); } }
    ];
    if (UI) UI.actionSheet('Aktionen für diese Liste', items);
  }

  function exportCsv() {
    if (!filteredStocks.length) {
      window.alert('Keine Ergebnisse zum Exportieren.');
      return;
    }
    window.App.Export.downloadStocks('screener', filteredStocks);
  }

  function openScanner() {
    var slot = document.getElementById('screener-scanner-slot');
    if (!slot || !window.App.StrategyScanner) return;
    window.App.StrategyScanner.mount(slot, { startCollapsed: false });
    setTimeout(function () { slot.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 50);
  }

  function applySliders() {
    var pe = Number(document.getElementById('filter-slider-pe').value);
    var yl = Number(document.getElementById('filter-slider-yield').value);
    var pf = Number(document.getElementById('filter-slider-perf').value);
    var crEl = document.getElementById('filter-slider-crv'), stEl = document.getElementById('filter-slider-stop');
    var cr = crEl ? Number(crEl.value) : 0, st = stEl ? Number(stEl.value) : 15;
    sliderFilters = {
      maxPe: pe >= 80 ? null : pe,
      minYield: yl,
      minPerf: pf <= -50 ? null : pf,
      minCrv: cr <= 0 ? null : cr,
      maxStop: st >= 15 ? null : st
    };
    updateHeaderFilterIndicator();
    applyFiltersAndRender();
  }

  function resetSliders() {
    sliderFilters = normSliders(null);
    syncSliderInputs();
    updateHeaderFilterIndicator();
    applyFiltersAndRender();
  }

  function syncPresetStates() {
    function mark(nodes, attr) {
      nodes.forEach(function (b) {
        var bp = b.getAttribute(attr);
        var on = bp === 'all' ? activePresets.length === 0 : isActive(bp);
        if (on) b.classList.add('active'); else b.classList.remove('active');
      });
    }
    mark(document.querySelectorAll('[data-preset]'), 'data-preset');
    mark(document.querySelectorAll('[data-sheet-preset]'), 'data-sheet-preset');
  }

  function togglePreset(p) {
    if (p === 'all') {
      activePresets = [];
    } else {
      var idx = activePresets.indexOf(p);
      if (idx !== -1) {
        activePresets.splice(idx, 1);
      } else {
        var other = PRESET_EXCLUSIVE[p];
        if (other && isActive(other)) activePresets.splice(activePresets.indexOf(other), 1);
        activePresets.push(p);
      }
    }
    syncPresetStates();

    if (activePresets.length === 1 && PRESET_SORTS[activePresets[0]]) {
      currentSort = PRESET_SORTS[activePresets[0]];
      autoSorted = true;
    } else if (activePresets.length === 0 && autoSorted) {
      currentSort = 'marketCap_desc';
      autoSorted = false;
    }
    var sortEl = document.getElementById('screener-sort-select');
    if (sortEl) sortEl.value = currentSort;
    applyFiltersAndRender();
  }

  function bindEvents() {
    var searchInput = document.getElementById('screener-search-input');
    if (searchInput) {
      searchInput.oninput = function (e) {
        currentSearchQuery = e.target.value;
        applyFiltersAndRender();
      };
    }

    var sortSelect = document.getElementById('screener-sort-select');
    if (sortSelect) {
      sortSelect.onchange = function (e) {
        currentSort = e.target.value;
        autoSorted = false;
        applyFiltersAndRender();
      };
    }

    document.querySelectorAll('[data-preset]').forEach(function (btn) {
      btn.onclick = function () { togglePreset(btn.getAttribute('data-preset')); };
    });
    document.querySelectorAll('[data-sheet-preset]').forEach(function (btn) {
      btn.onclick = function () { togglePreset(btn.getAttribute('data-sheet-preset')); };
    });

    ['filter-slider-pe', 'filter-slider-yield', 'filter-slider-perf', 'filter-slider-crv', 'filter-slider-stop'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.oninput = updateSliderLabels;
    });
    var applyBtn = document.getElementById('sheet-apply-btn');
    if (applyBtn) applyBtn.onclick = function () { applySliders(); closeSheet(); };
    var clearBtn = document.getElementById('sheet-clear-btn');
    if (clearBtn) clearBtn.onclick = function () { togglePreset('all'); };
    var resetBtn = document.getElementById('sheet-reset-btn');
    if (resetBtn) resetBtn.onclick = resetSliders;
    var backdrop = document.getElementById('filter-sheet-backdrop');
    if (backdrop) backdrop.onclick = closeSheet;
    bindSheetSwipe();
    bindSavedAndExport();

    var saveAlertBtn = document.getElementById('screener-save-alert-btn');
    if (saveAlertBtn) saveAlertBtn.onclick = createScreenerAlert;
    renderScreenerAlerts();
  }

  var SAVED_KEY = 'screener_saved_filters_v1';
  var MAX_SAVED = 12;

  function loadSavedFilters() {
    var arr = loadJson(SAVED_KEY);
    return Array.isArray(arr) ? arr : [];
  }

  function currentFilterSignature() {
    return JSON.stringify({
      p: activePresets.slice().sort(),
      pe: sliderFilters.maxPe, y: sliderFilters.minYield, pf: sliderFilters.minPerf,
      cr: sliderFilters.minCrv, st: sliderFilters.maxStop
    });
  }

  function savedSignature(f) {
    var sl = f.sliders || {};
    return JSON.stringify({
      p: (f.presets || []).slice().sort(),
      pe: hasNum(sl.maxPe) ? sl.maxPe : null,
      y: hasNum(sl.minYield) ? sl.minYield : 0,
      pf: hasNum(sl.minPerf) ? sl.minPerf : null,
      cr: hasNum(sl.minCrv) ? sl.minCrv : null,
      st: hasNum(sl.maxStop) ? sl.maxStop : null
    });
  }

  function renderSavedRow() {
    var row = document.getElementById('screener-saved-row');
    if (!row) return;
    var saved = loadSavedFilters();
    var sig = currentFilterSignature();
    
    // Nur eigene, gespeicherte Filter. "Speichern" & "Strategie" liegen im ⋯-Menü.
    var html = '';
    
    saved.forEach(function (f) {
      var on = savedSignature(f) === sig && (activePresets.length > 0 || slidersActive());
      html += '<button class="chip-btn' + (on ? ' active' : '') + '" data-saved-id="' + esc(f.id) + '" style="flex-shrink:0;">' +
        '★ ' + esc(f.name) +
        '<span data-saved-del="' + esc(f.id) + '" style="margin-left: 8px; opacity: 0.65;" title="Löschen">✕</span>' +
      '</button>';
    });
    row.innerHTML = html;
    row.style.display = saved.length ? '' : 'none';
    row.querySelectorAll('[data-saved-id]').forEach(function (btn) {
      btn.onclick = function (e) {
        var id = btn.getAttribute('data-saved-id');
        if (e.target.closest('[data-saved-del]')) {
          deleteSavedFilter(id);
        } else {
          applySavedFilter(id);
        }
      };
    });
  }

  function saveCurrentFilter() {
    if (activePresets.length === 0 && !slidersActive()) {
      window.alert('Wähle zuerst mindestens einen Filter oder Feinfilter aus, den du speichern möchtest.');
      return;
    }
    var saved = loadSavedFilters();
    if (saved.length >= MAX_SAVED) {
      window.alert('Maximal ' + MAX_SAVED + ' gespeicherte Filter. Lösche zuerst einen mit dem ✕.');
      return;
    }
    var def = activePresets.map(presetName).join(' + ') || 'Eigener Filter';
    var name = window.prompt('Name für diesen Filter:', def);
    if (name === null) return;
    name = String(name).trim();
    if (!name) name = def;
    saved.push({
      id: 'f' + Date.now(),
      name: name.slice(0, 40),
      presets: activePresets.slice(),
      sliders: normSliders(sliderFilters),
      sort: currentSort
    });
    saveJson(SAVED_KEY, saved);
    renderSavedRow();
  }

  function applySavedFilter(id) {
    var f = loadSavedFilters().filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    activePresets = (f.presets || []).filter(function (p) { return PRESET_FILTERS[p]; });
    sliderFilters = normSliders(f.sliders);
    if (f.sort && SORT_OPTIONS.some(function (o) { return o.v === f.sort; })) currentSort = f.sort;
    autoSorted = false;
    var sortEl = document.getElementById('screener-sort-select');
    if (sortEl) sortEl.value = currentSort;
    syncPresetStates();
    syncSliderInputs();
    updateHeaderFilterIndicator();
    applyFiltersAndRender();
  }

  function deleteSavedFilter(id) {
    var saved = loadSavedFilters();
    var f = saved.filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    if (!window.confirm('Gespeicherten Filter „' + f.name + '" löschen?')) return;
    saveJson(SAVED_KEY, saved.filter(function (x) { return x.id !== id; }));
    renderSavedRow();
  }

  function bindSavedAndExport() {
    renderSavedRow();
    // CSV-Export: jetzt im ⋯-Menü (openMoreActions)
  }

  function loadScreenerAlerts() {
    var list = loadJson(SCREENER_ALERTS_KEY);
    return Array.isArray(list) ? list : [];
  }

  function saveScreenerAlerts(list) {
    saveJson(SCREENER_ALERTS_KEY, list || []);
  }

  function currentAlertSnapshot() {
    var sig = currentFilterSignature();
    var tickers = filteredStocks.map(function (s) { return s.ticker; }).sort();
    return { signature: sig, tickers: tickers };
  }

  function createScreenerAlert() {
    if (activePresets.length === 0 && !slidersActive()) {
      window.alert('Wähle zuerst mindestens einen Filter oder Feinfilter aus.');
      return;
    }
    var def = activePresets.map(presetName).join(' + ') || 'Eigener Filter';
    var name = window.prompt('Name für diesen Alert:', def);
    if (name === null) return;
    name = String(name).trim() || def;

    var sig = currentAlertSnapshot();
    var list = loadScreenerAlerts();
    var existing = list.filter(function (a) { return a.signature === sig.signature; })[0];

    if (existing) {
      if (!window.confirm('Für diesen Filter existiert bereits ein Alert. Aktualisieren?')) return;
      existing.name = name;
      existing.tickers = sig.tickers;
      existing.updatedAt = new Date().toISOString();
    } else {
      list.push({
        id: 'sa' + Date.now(),
        name: name.slice(0, 60),
        signature: sig.signature,
        presets: activePresets.slice(),
        sliders: normSliders(sliderFilters),
        tickers: sig.tickers,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    saveScreenerAlerts(list);
    window.alert('Alert "' + name + '" gespeichert. Beim nächsten App-Start wirst du über neue Treffer informiert.');
    renderScreenerAlerts();
  }

  function renderScreenerAlerts() {
    var container = document.getElementById('screener-alerts-container');
    if (!container) return;
    var list = loadScreenerAlerts();
    if (!list.length) { container.innerHTML = ''; return; }

    var html = '<div class="card" style="padding: 12px 14px;">' +
      '<div class="card-header-dotted"><span class="card-title">Gespeicherte Alerts</span>' +
      '<span class="sector-label">' + list.length + '</span></div>';

    list.forEach(function (a) {
      var filterLabel = (a.presets || []).map(presetName).join(' + ') || 'Eigener Filter';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-subtle);gap:10px;">' +
        '<div style="min-width:0;flex:1;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-main);">' + esc(a.name) + '</div>' +
          '<div style="font-size:0.7rem;color:var(--text-dim);line-height:1.4;">' + esc(filterLabel) + ' · ' + (a.tickers || []).length + ' Treffer · ' + window.App.Format.date(a.updatedAt) + '</div>' +
        '</div>' +
        '<button class="chip-btn alert-del" data-id="' + esc(a.id) + '" style="padding:2px 7px;font-size:0.7rem;" title="Löschen">🗑</button>' +
      '</div>';
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.alert-del').forEach(function (btn) {
      btn.onclick = function () {
        if (!window.confirm('Alert löschen?')) return;
        saveScreenerAlerts(loadScreenerAlerts().filter(function (a) { return a.id !== btn.getAttribute('data-id'); }));
        renderScreenerAlerts();
      };
    });
  }

  function checkScreenerAlerts() {
    var alerts = loadScreenerAlerts();
    if (!alerts.length) return Promise.resolve([]);

    return window.App.Data.getUniverse().then(function (universe) {
      var stocks = universe || [];
      var newly = [];

      var oldSectorPe = sectorPe;
      sectorPe = computeSectorMedians(stocks);

      try {
        alerts.forEach(function (a) {
          var filterList = stocks.slice();
          (a.presets || []).forEach(function (p) {
            var fn = PRESET_FILTERS[p];
            if (fn) filterList = filterList.filter(fn);
          });
          var sl = normSliders(a.sliders);
          filterList = filterList.filter(function (s) { return passesSlidersWith(s, sl); });

          var prevMap = toMap(a.tickers || []);
          var fresh = filterList.filter(function (s) { return !prevMap[s.ticker]; });

          if (fresh.length > 0) {
            newly.push({ alert: a, fresh: fresh.map(function (s) { return s.ticker; }) });
            a.tickers = filterList.map(function (s) { return s.ticker; }).sort();
            a.updatedAt = new Date().toISOString();
          }
        });
      } finally {
        sectorPe = oldSectorPe;
      }

      if (newly.length) {
        saveScreenerAlerts(alerts);
        showScreenerAlertBanners(newly);
      }
      return newly;
    }).catch(function () { return []; });
  }

  function showScreenerAlertBanners(newly) {
    var container = document.getElementById('alerts-banner-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'alerts-banner-container';
      container.style.cssText = 'position:fixed;top:10px;left:10px;right:10px;z-index:9999;display:flex;flex-direction:column;gap:6px;pointer-events:none;';
      document.body.appendChild(container);
    }
    var BANNER_MAX = 5;
    while (container.children.length >= BANNER_MAX) {
      container.removeChild(container.firstChild);
    }

    newly.forEach(function (n) {
      var div = document.createElement('div');
      div.style.cssText = 'background:var(--bg-secondary);border:1px solid var(--accent-purple-light);border-radius:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,0.5);font-size:0.82rem;color:var(--text-main);pointer-events:auto;';
      var preview = n.fresh.slice(0, 3).join(', ') + (n.fresh.length > 3 ? '…' : '');
      div.innerHTML = '<div style="flex:1;min-width:0;">🎯 <strong>' + esc(n.alert.name) + '</strong>: ' +
        n.fresh.length + ' neue' + (n.fresh.length === 1 ? 'r' : '') + ' Treffer (' + esc(preview) + ')</div>' +
        '<button aria-label="Schließen" style="background:none;border:none;color:inherit;font-size:1.1rem;cursor:pointer;padding:2px 6px;flex-shrink:0;">&#10005;</button>';
      div.querySelector('button').onclick = function (e) { e.stopPropagation(); if (div.parentNode) div.parentNode.removeChild(div); };
      div.onclick = function () {
        if (div.parentNode) div.parentNode.removeChild(div);
        window.App.Router.navigate('/screener');
      };
      container.appendChild(div);
      setTimeout(function () { if (div.parentNode) div.parentNode.removeChild(div); }, 20000);
    });
  }

  function getTemplateHtml() {
    var chips = '<button class="chip-btn' + (activePresets.length === 0 ? ' active' : '') + '" data-preset="all">Alle</button>';
    PRESETS.forEach(function (p) {
      chips += '<button class="chip-btn' + (isActive(p.id) ? ' active' : '') + '" data-preset="' + p.id + '">' +
        p.chip + '<span data-count-for="' + p.id + '" style="font-size: 0.68rem; opacity: 0.75;"></span></button>';
    });

    var sortOptions = SORT_OPTIONS.map(function (o) {
      return '<option value="' + o.v + '"' + (o.v === currentSort ? ' selected' : '') + '>' + o.label + '</option>';
    }).join('');

    var sheetFilters = '';
    PRESETS.forEach(function (p) {
      sheetFilters += '<div style="padding: 8px 0; border-bottom: 1px solid var(--border-color);">' +
        '<button class="chip-btn' + (isActive(p.id) ? ' active' : '') + '" data-sheet-preset="' + p.id + '">' +
          p.chip + '<span data-count-for="' + p.id + '" style="font-size: 0.68rem; opacity: 0.75;"></span></button>' +
        '<div style="font-size: 0.7rem; color: var(--text-dim); line-height: 1.4; margin-top: 5px;">' + esc(p.info()) + '</div>' +
        (/^ema_/.test(p.id) ? '<div class="ema-missing-note" style="display:none;font-size:0.7rem;color:var(--bearish);line-height:1.4;margin-top:4px;">⚠ Im aktuellen Datenstand fehlen die EMA-Kennzahlen. Starte die Daten-Pipeline (GitHub-Workflow) einmal neu, dann zeigt der Filter Treffer.</div>' : '') +
      '</div>';
    });

    var peVal = sliderFilters.maxPe === null ? 80 : sliderFilters.maxPe;
    var perfVal = sliderFilters.minPerf === null ? -50 : sliderFilters.minPerf;
    var crvVal = sliderFilters.minCrv === null ? 0 : sliderFilters.minCrv;
    var stopVal = sliderFilters.maxStop === null ? 15 : sliderFilters.maxStop;

    return '' +
      '<div class="view-container">' +
        '<div class="scr-statline">' +
          '<span><b id="screener-hero-count">Lade Titel...</b> · Ø KGV <span id="screener-hero-pe">—</span> · Ø Div. <span id="screener-hero-yield">—</span></span>' +
          '<span>Top heute: <span id="screener-hero-winner">—</span></span>' +
        '</div>' +
        '<div id="screener-data-stamp" style="font-size: 0.7rem; color: var(--text-dim); margin: -4px 2px 10px;"></div>' +

        '<div class="scr-toolrow">' +
          '<div class="search-bar-wrapper">' +
            '<svg class="search-icon-left" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
              '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>' +
            '</svg>' +
            '<input type="text" id="screener-search-input" class="search-input" placeholder="Name, Ticker oder Branche" autocomplete="off" aria-label="Aktien durchsuchen">' +
          '</div>' +
          '<button class="scr-filter-btn" id="screener-filter-open" aria-label="Feinfilter öffnen">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M7 12h10M10 18h4"/></svg>' +
            'Filter<span class="scr-badge" id="screener-filter-badge" style="display:none;">0</span>' +
          '</button>' +
        '</div>' +

        '<div class="horizontal-scroll-row">' + chips + '</div>' +
        '<div class="horizontal-scroll-row" id="screener-saved-row" style="display:none;"></div>' +
        '<div id="screener-active-summary"></div>' +

        '<div class="sub-header-bar">' +
          '<span id="screener-result-count">0 Ergebnisse</span>' +
          '<span style="display:flex;align-items:center;">' +
            '<select id="screener-sort-select" class="sort-select" aria-label="Sortierung">' + sortOptions + '</select>' +
            '<button class="scr-more-btn" id="screener-more-btn" aria-label="Weitere Aktionen: Export, Speichern, Alarm, Scanner">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>' +
            '</button>' +
          '</span>' +
        '</div>' +

        '<div id="screener-ai-banner-container"></div>' +
        '<div id="screener-scanner-slot"></div>' +
        '<div id="screener-alerts-container"></div>' +

        '<div id="screener-list-container">' +
          '<div class="state-box"><div class="spinner"></div><p>Lade Aktien...</p></div>' +
        '</div>' +
      '</div>' +

      '<div id="filter-sheet-backdrop" class="sheet-backdrop"></div>' +
      '<div id="filter-bottom-sheet" class="bottom-sheet">' +
        '<div class="sheet-handle"></div>' +
        '<div class="sheet-header">' +
          '<h3 style="font-size: 1.1rem; font-weight: 700;">Filter</h3>' +
          '<button id="sheet-clear-btn" class="chip-btn" style="padding: 4px 10px;">Alle abwählen</button>' +
        '</div>' +
        '<div style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 6px;">Mehrere Filter kombinieren: Es müssen alle gewählten zutreffen. Die Zahl zeigt die Treffer im gesamten Universum. Kennzahlen von Yahoo Finance, Lücken möglich. Keine Anlageberatung.</div>' +
        '<div style="margin-bottom: 16px;">' + sheetFilters + '</div>' +
        '<div class="sheet-header" style="margin-bottom: 10px;">' +
          '<h3 style="font-size: 1.0rem; font-weight: 700;">Feinfilter</h3>' +
          '<button id="sheet-reset-btn" class="chip-btn" style="padding: 4px 10px;">Zurücksetzen</button>' +
        '</div>' +
        '<div class="filter-group">' +
          '<div class="filter-label"><span>Maximales KGV</span><span id="label-max-pe">' + peLabel(peVal) + '</span></div>' +
          '<input type="range" id="filter-slider-pe" class="range-slider" min="5" max="80" step="5" value="' + peVal + '">' +
        '</div>' +
        '<div class="filter-group">' +
          '<div class="filter-label"><span>Mindest-Dividendenrendite</span><span id="label-min-yield">' + yieldLabel(sliderFilters.minYield) + '</span></div>' +
          '<input type="range" id="filter-slider-yield" class="range-slider" min="0" max="8" step="0.5" value="' + sliderFilters.minYield + '">' +
        '</div>' +
        '<div class="filter-group">' +
          '<div class="filter-label"><span>Mindest-Performance 52W</span><span id="label-min-perf">' + perfLabel(perfVal) + '</span></div>' +
          '<input type="range" id="filter-slider-perf" class="range-slider" min="-50" max="100" step="10" value="' + perfVal + '">' +
        '</div>' +
        '<div class="filter-group">' +
          '<div class="filter-label"><span>Mindest-CRV (Long, Risk/Reward)</span><span id="label-min-crv">' + crvLabel(crvVal) + '</span></div>' +
          '<input type="range" id="filter-slider-crv" class="range-slider" min="0" max="5" step="0.5" value="' + crvVal + '">' +
        '</div>' +
        '<div class="filter-group">' +
          '<div class="filter-label"><span>Maximaler Stop-Abstand (an der Unterstützung)</span><span id="label-max-stop">' + stopLabel(stopVal) + '</span></div>' +
          '<input type="range" id="filter-slider-stop" class="range-slider" min="1" max="15" step="1" value="' + stopVal + '">' +
        '</div>' +
        '<div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 10px;">Wirkt zusätzlich zu den Chips. Aktien ohne den jeweiligen Wert werden dann ausgeblendet.</div>' +
        '<button id="sheet-apply-btn" class="btn-primary" style="margin-top: 4px;">Fertig</button>' +
      '</div>';
  }

  restoreState();

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('hashchange', closeSheet);
  }

  return {
    initView: initView,
    checkScreenerAlerts: checkScreenerAlerts,
    // aktuell angezeigte (gefilterte, sortierte) Treffer; vom Strategie-Scanner genutzt
    getFilteredStocks: function () { return filteredStocks.slice(); }
  };
})();
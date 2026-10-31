/**
 * js/screener.js
 * Verwaltet den Aktien-Screener:
 * - Marktübersicht Hero-Banner mit Kennzahlen und Datenstand
 * - Volltextsuche über Name, Ticker und Branche
 * - Robuste Sortierung (fehlende Werte immer zuletzt, 0 % ist ein gültiger Wert)
 * - Filter-Chips mit Mehrfachauswahl (UND-Verknüpfung), Trefferzahl und Erklärung
 * - Feinfilter per Slider (Header-Filter-Icon): max. KGV, min. Dividende, min. 52W-Performance
 * - Branchenvergleich beim KGV (Value / Unterbewertet)
 * - "Neu im Filter"-Markierung und Watchlist-Hinweis
 * - Merken der Auswahl (localStorage)
 * - KI-Screening via Gemini für jede Filterauswahl
 */

window.App = window.App || {};

window.App.Screener = (function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Schwellenwerte (hier anpassen)
  // ---------------------------------------------------------------------------
  var PROGNOSE_STEIGEND_MIN = 10;   // Kursziel mindestens 10 % über Kurs
  var PROGNOSE_FALLEND_MAX = 0;     // Kursziel unter aktuellem Kurs
  var MIN_ANALYSTS = 5;             // Kursziel-Filter nur ab so vielen Analysten
  var CROSS_RECENT_DAYS = 60;       // "Kürzlich" = SMA-50/200-Kreuz in den letzten 60 Handelstagen
  var QUALITY_MIN_MARGIN = 0.10;    // Nettomarge mind. 10 %
  var QUALITY_MAX_DEBT_EQUITY = 100; // Verschuldung (Debt/Equity in %) höchstens 100
  var EARNINGS_GROWTH_MIN = 0.15;   // Forward-KGV mind. 15 % unter aktuellem KGV
  var RECOVERY_MAX_RANGEPOS = 33;   // Kurs im unteren Drittel der 52-Wochen-Spanne
  var OVERSOLD_RSI_MAX = 30;        // RSI(14) höchstens 30
  var VALUE_DISCOUNT = 0.15;        // KGV mind. 15 % unter dem Branchen-Median
  var VALUE_FALLBACK_PE = 18;       // feste KGV-Grenze, wenn die Branche zu klein ist
  var MIN_SECTOR_SIZE = 5;          // Mindestanzahl Aktien für einen Branchen-Median
  var STALE_AFTER_HOURS = 84;       // Daten älter als 3,5 Tage gelten als veraltet (Wochenende eingerechnet)

  var STORAGE_KEY = 'screener_state_v1';
  var SNAPSHOT_KEY = 'screener_snapshot_v1';

  // ---------------------------------------------------------------------------
  // Zustand
  // ---------------------------------------------------------------------------
  var allStocks = [];
  var filteredStocks = [];

  var currentSearchQuery = '';
  var currentSort = 'marketCap_desc';
  var activePresets = [];   // leer = "Alle"; mehrere aktive Filter = alle müssen zutreffen (UND)
  var autoSorted = false;   // true, wenn die Sortierung automatisch durch einen Filter gesetzt wurde
  var sliderFilters = { maxPe: null, minYield: 0, minPerf: null };

  var sectorPe = {};        // Branche -> Median-KGV
  var dataStamp = null;     // Date des letzten Daten-Updates
  var newSets = {};         // Preset -> { ticker: true } (neu seit dem letzten Daten-Update)
  var presetCounts = {};    // Preset -> Trefferzahl im gesamten Universum

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
    { v: 'perf52w_desc', label: '52W-Performance (Beste)' }
  ];

  // Filter, die sich gegenseitig ausschließen (Antippen des einen schaltet den anderen ab)
  var PRESET_EXCLUSIVE = {
    forecast_up: 'forecast_down', forecast_down: 'forecast_up',
    death_cross: 'golden_cross', golden_cross: 'death_cross'
  };

  // Passende Standard-Sortierung, wenn genau ein Filter aktiv ist
  var PRESET_SORTS = { forecast_up: 'upside_desc', forecast_down: 'upside_asc', oversold: 'rsi_asc' };

  // ---------------------------------------------------------------------------
  // Kleine Helfer
  // ---------------------------------------------------------------------------
  function hasNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function hasUpside(s) {
    return hasNum(s.upside);
  }

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtNum(v, d) {
    return window.App.Format.number(v, d);
  }

  function isActive(p) {
    return activePresets.indexOf(p) !== -1;
  }

  function loadJson(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveJson(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* voll oder gesperrt: ignorieren */ }
  }

  function cmpNum(x, y, dir) {
    // Fehlende Werte stehen immer am Ende; 0 ist ein gültiger Wert.
    var hx = hasNum(x);
    var hy = hasNum(y);
    if (!hx && !hy) return 0;
    if (!hx) return 1;
    if (!hy) return -1;
    return dir === 'asc' ? x - y : y - x;
  }

  // ---------------------------------------------------------------------------
  // Filter-Logik
  // ---------------------------------------------------------------------------
  function isLoss(s) {
    if (hasNum(s.pe)) return s.pe < 0;
    return hasNum(s.profitMargins) && s.profitMargins < 0;
  }

  function analystOk(s) {
    // Unbekannte Anzahl (Daten noch ohne Feld) schließt nicht aus; bekannte Anzahl muss reichen.
    return !hasNum(s.analystCount) || s.analystCount >= MIN_ANALYSTS;
  }

  /** KGV-Obergrenze für "günstig": Branchen-Median minus Abschlag, sonst fester Wert. */
  function peLimit(s) {
    var median = sectorPe[s.sector];
    return median ? median * (1 - VALUE_DISCOUNT) : VALUE_FALLBACK_PE;
  }

  function isCheap(s) {
    return s.pe > 0 && s.pe <= peLimit(s);
  }

  /**
   * "Unterbewertet": günstiges KGV (relativ zur Branche) bei solider Qualität und Kurs in der unteren Hälfte der 52W-Spanne.
   * Fehlende Werte (PEG, Verschuldung – z. B. bei Banken) schließen eine Aktie nicht aus.
   */
  function isUndervalued(s) {
    if (!isCheap(s)) return false;
    if (hasNum(s.peg) && !(s.peg > 0 && s.peg <= 1.5)) return false;
    if (!(s.profitMargins > 0)) return false;
    if (hasNum(s.debtToEquity) && s.debtToEquity > 150) return false;
    if ((s.revGrowth || 0) < 0) return false;
    if (!hasNum(s.rangePos) || s.rangePos > 50) return false;
    return true;
  }

  /**
   * "Turnaround": aktuell Verlust (negatives/fehlendes KGV), aber niedriges Forward-KGV,
   * moderate Verschuldung und Kurs im unteren Bereich der 52W-Spanne. Hohes Risiko!
   */
  function isTurnaround(s) {
    if (!isLoss(s)) return false;
    if (!(s.forwardPe > 0 && s.forwardPe <= 12)) return false;
    if (hasNum(s.debtToEquity) && s.debtToEquity > 150) return false;
    if (!hasNum(s.rangePos) || s.rangePos > 50) return false;
    return true;
  }

  /** "Qualität": solide Marge, wachsender Umsatz, moderate Verschuldung. */
  function isQuality(s) {
    if (!hasNum(s.profitMargins) || s.profitMargins < QUALITY_MIN_MARGIN) return false;
    if (!hasNum(s.revGrowth) || s.revGrowth < 0) return false;
    if (hasNum(s.debtToEquity) && s.debtToEquity > QUALITY_MAX_DEBT_EQUITY) return false;
    return true;
  }

  /** "Gewinnwachstum erwartet": Forward-KGV deutlich unter dem aktuellen KGV. */
  function isEarningsGrowth(s) {
    if (!(s.pe > 0) || !(s.forwardPe > 0)) return false;
    return s.forwardPe <= s.pe * (1 - EARNINGS_GROWTH_MIN);
  }

  /** "Erholung": Kurs im unteren Drittel der 52W-Spanne, aber Kursziel deutlich darüber. */
  function isRecovery(s) {
    if (!hasNum(s.rangePos) || s.rangePos > RECOVERY_MAX_RANGEPOS) return false;
    return hasUpside(s) && s.upside >= PROGNOSE_STEIGEND_MIN && analystOk(s);
  }

  /** "Überverkauft": RSI(14) <= 30. */
  function isOversold(s) {
    return hasNum(s.rsi) && s.rsi <= OVERSOLD_RSI_MAX;
  }

  /** SMA 50 hat SMA 200 kürzlich von oben nach unten (death) bzw. unten nach oben (golden) gekreuzt. */
  function hasRecentCross(s, type) {
    return s.cross === type && hasNum(s.crossDaysAgo) && s.crossDaysAgo <= CROSS_RECENT_DAYS;
  }

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
    quality: function (s) { return isQuality(s); },
    earnings_growth: function (s) { return isEarningsGrowth(s); },
    recovery: function (s) { return isRecovery(s); },
    oversold: function (s) { return isOversold(s); }
  };

  // Chip-Beschriftung (HTML), Klartext-Name (für den Gemini-Prompt) und Erklärung
  var PRESETS = [
    { id: 'high_dividend', chip: '💰 Hohe Dividende', name: 'Hohe Dividende',
      info: function () { return 'Dividendenrendite mindestens 3 %.'; } },
    { id: 'value', chip: '💎 Value (KGV &lt; Branche)', name: 'Value',
      info: function () { return 'KGV positiv und mindestens ' + Math.round(VALUE_DISCOUNT * 100) + ' % unter dem Median der eigenen Branche. Ist die Branche zu klein, gilt KGV ≤ ' + VALUE_FALLBACK_PE + '.'; } },
    { id: 'undervalued', chip: '🔎 Unterbewertet', name: 'Unterbewertet',
      info: function () { return 'Günstiges KGV (wie Value), PEG ≤ 1,5, positive Marge, Verschuldung ≤ 150, Umsatzwachstum ≥ 0 und Kurs in der unteren Hälfte der 52W-Spanne.'; } },
    { id: 'turnaround', chip: '🔄 Turnaround', name: 'Turnaround',
      info: function () { return 'Aktuell Verlust, aber Forward-KGV ≤ 12, Verschuldung ≤ 150 und Kurs in der unteren Hälfte der 52W-Spanne. Hohes Risiko.'; } },
    { id: 'growth', chip: '🚀 Growth', name: 'Growth',
      info: function () { return 'Umsatzwachstum mindestens 10 %.'; } },
    { id: 'top_performer', chip: '📈 Top Performer', name: 'Top Performer',
      info: function () { return '52-Wochen-Performance mindestens 15 %.'; } },
    { id: 'forecast_up', chip: '🔼 Prognose steigend', name: 'Prognose steigend',
      info: function () { return 'Mittleres Analysten-Kursziel mindestens ' + PROGNOSE_STEIGEND_MIN + ' % über dem Kurs, bei mindestens ' + MIN_ANALYSTS + ' Analysten.'; } },
    { id: 'forecast_down', chip: '🔽 Prognose fallend', name: 'Prognose fallend',
      info: function () { return 'Mittleres Analysten-Kursziel unter dem aktuellen Kurs, bei mindestens ' + MIN_ANALYSTS + ' Analysten.'; } },
    { id: 'death_cross', chip: '☠️ Death Cross', name: 'Death Cross',
      info: function () { return 'SMA 50 hat SMA 200 in den letzten ' + CROSS_RECENT_DAYS + ' Handelstagen von oben nach unten gekreuzt (Abwärtssignal).'; } },
    { id: 'golden_cross', chip: '✨ Golden Cross', name: 'Golden Cross',
      info: function () { return 'SMA 50 hat SMA 200 in den letzten ' + CROSS_RECENT_DAYS + ' Handelstagen von unten nach oben gekreuzt (Aufwärtssignal).'; } },
    { id: 'quality', chip: '🏆 Qualität', name: 'Qualität',
      info: function () { return 'Nettomarge ≥ ' + Math.round(QUALITY_MIN_MARGIN * 100) + ' %, Umsatzwachstum ≥ 0 % und Verschuldung (Debt/Equity) ≤ ' + QUALITY_MAX_DEBT_EQUITY + '.'; } },
    { id: 'earnings_growth', chip: '📈 Gewinnwachstum erwartet', name: 'Gewinnwachstum erwartet',
      info: function () { return 'KGV positiv und Forward-KGV mindestens ' + Math.round(EARNINGS_GROWTH_MIN * 100) + ' % unter dem aktuellen KGV (Analysten erwarten steigende Gewinne).'; } },
    { id: 'recovery', chip: '🌱 Erholung', name: 'Erholung',
      info: function () { return 'Kurs im unteren Drittel der 52W-Spanne (≤ ' + RECOVERY_MAX_RANGEPOS + ' %), Kursziel mindestens ' + PROGNOSE_STEIGEND_MIN + ' % darüber, bei mindestens ' + MIN_ANALYSTS + ' Analysten.'; } },
    { id: 'oversold', chip: '📉 Überverkauft', name: 'Überverkauft',
      info: function () { return 'RSI(14) höchstens ' + OVERSOLD_RSI_MAX + ' (stark gefallen, mögliche Gegenbewegung).'; } }
  ];

  function presetName(id) {
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === id) return PRESETS[i].name;
    }
    return id;
  }

  function passesSliders(s) {
    if (sliderFilters.maxPe !== null && !(s.pe > 0 && s.pe <= sliderFilters.maxPe)) return false;
    if (sliderFilters.minYield > 0 && !((s.dividendYield || 0) >= sliderFilters.minYield)) return false;
    if (sliderFilters.minPerf !== null && !(hasNum(s.perf52w) && s.perf52w >= sliderFilters.minPerf)) return false;
    return true;
  }

  function slidersActive() {
    return sliderFilters.maxPe !== null || sliderFilters.minYield > 0 || sliderFilters.minPerf !== null;
  }

  function peRank(s) {
    // Verlust (negatives KGV) zuerst, dann positives KGV aufsteigend, unbekannt zuletzt
    if (isLoss(s)) {
      var depth = hasNum(s.pe) && s.pe < 0 ? s.pe : (s.profitMargins || 0);
      return -1e6 + depth;
    }
    if (s.pe && s.pe > 0) return s.pe;
    return 1e9;
  }

  // ---------------------------------------------------------------------------
  // Abgeleitete Daten: Branchen-Median, Datenstand, Trefferzahlen, "neu im Filter"
  // ---------------------------------------------------------------------------
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
    Object.keys(PRESET_FILTERS).forEach(function (p) {
      counts[p] = stocks.filter(PRESET_FILTERS[p]).length;
    });
    return counts;
  }

  function toMap(arr) {
    var m = {};
    (arr || []).forEach(function (t) { m[t] = true; });
    return m;
  }

  /**
   * Vergleicht die Filter-Treffer mit dem Stand des letzten Daten-Updates (pro Gerät im localStorage).
   * Neue Treffer bleiben bis zum nächsten Daten-Update als "NEU" markiert.
   */
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
      // Ohne Vorgänger-Stand (oder bei leerem Vorgänger) keine Markierung, sonst wäre alles "neu"
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

  // ---------------------------------------------------------------------------
  // Zustand merken
  // ---------------------------------------------------------------------------
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
      sliderFilters = {
        maxPe: hasNum(st.sliders.maxPe) ? st.sliders.maxPe : null,
        minYield: hasNum(st.sliders.minYield) ? st.sliders.minYield : 0,
        minPerf: hasNum(st.sliders.minPerf) ? st.sliders.minPerf : null
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Initialisierung
  // ---------------------------------------------------------------------------
  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;

    var headerFilterBtn = document.getElementById('btn-header-filter');
    if (headerFilterBtn) {
      headerFilterBtn.style.display = 'inline-flex';
      headerFilterBtn.onclick = openSheet;
    }

    container.innerHTML = getTemplateHtml();
    var searchInput = document.getElementById('screener-search-input');
    if (searchInput) searchInput.value = currentSearchQuery;
    updateHeaderFilterIndicator();

    window.App.Data.getUniverse()
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
      winnerEl.innerHTML = esc(winner.ticker || '—') + '<br><span style="font-size:0.75rem;">(' + sign + fmtNum(winner.changePercent, 2) + ' %)</span>';
    }

    var peValues = stocks.filter(function (s) { return s.pe && s.pe > 0 && s.pe < 150; });
    var avgPe = peValues.length > 0
      ? peValues.reduce(function (sum, s) { return sum + s.pe; }, 0) / peValues.length
      : 0;
    if (peEl) peEl.textContent = avgPe > 0 ? fmtNum(avgPe, 1) : '—';

    var divValues = stocks.filter(function (s) { return s.dividendYield && s.dividendYield > 0 && s.dividendYield < 25; });
    var avgYield = divValues.length > 0
      ? (divValues.reduce(function (sum, s) { return sum + s.dividendYield; }, 0) / divValues.length)
      : 0;
    if (yieldEl) yieldEl.textContent = avgYield > 0 ? fmtNum(avgYield, 1) + ' %' : '—';
  }

  function renderDataStamp() {
    var el = document.getElementById('screener-data-stamp');
    if (!el) return;
    if (!dataStamp) {
      el.innerHTML = '';
      return;
    }
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
    });
  }

  // ---------------------------------------------------------------------------
  // Filtern, Sortieren, Rendern
  // ---------------------------------------------------------------------------
  function applyFiltersAndRender() {
    var list = allStocks.slice();

    // 1. Volltextsuche: Ticker, Name und Branche
    if (currentSearchQuery) {
      var q = currentSearchQuery.toLowerCase().trim();
      list = list.filter(function (item) {
        var tick = (item.ticker || '').toLowerCase();
        var name = (item.name || '').toLowerCase();
        var sector = (item.sector || '').toLowerCase();
        return tick.indexOf(q) !== -1 || name.indexOf(q) !== -1 || sector.indexOf(q) !== -1;
      });
    }

    // 2. Preset-Filter (mehrere aktiv = alle müssen zutreffen)
    activePresets.forEach(function (p) {
      var fn = PRESET_FILTERS[p];
      if (fn) list = list.filter(fn);
    });

    // 3. Feinfilter (Slider)
    list = list.filter(passesSliders);

    // 4. Sortierung (fehlende Werte immer zuletzt)
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
        case 'name_asc': return (a.name || a.ticker || '').localeCompare(b.name || b.ticker || '');
        default: return cmpNum(a.marketCap, b.marketCap, 'desc');
      }
    });

    filteredStocks = list;

    var resultCountEl = document.getElementById('screener-result-count');
    if (resultCountEl) {
      resultCountEl.textContent = filteredStocks.length + ' Ergebnisse';
    }

    renderSummary();
    renderAiBanner(filteredStocks, activePresets);
    renderStockCards(filteredStocks);
    saveState();
  }

  function sliderSummaryParts() {
    var parts = [];
    if (sliderFilters.maxPe !== null) parts.push('KGV ≤ ' + sliderFilters.maxPe);
    if (sliderFilters.minYield > 0) parts.push('Dividende ≥ ' + sliderFilters.minYield + ' %');
    if (sliderFilters.minPerf !== null) parts.push('52W ≥ ' + sliderFilters.minPerf + ' %');
    return parts;
  }

  /** Zeile unter den Chips: aktive Filter, Watchlist-Treffer und neue Treffer. */
  function renderSummary() {
    var el = document.getElementById('screener-active-summary');
    if (!el) return;

    var lines = [];
    if (activePresets.length > 0) {
      lines.push('<b>' + activePresets.map(function (p) { return esc(presetName(p)); }).join(' + ') + '</b>' +
        (activePresets.length > 1 ? ' – alle Filter müssen zutreffen' : ''));
    }
    var sl = sliderSummaryParts();
    if (sl.length > 0) lines.push('Feinfilter: ' + esc(sl.join(' · ')));

    if (lines.length === 0) {
      el.innerHTML = '';
      return;
    }

    if (activePresets.length > 0) {
      var wl = window.App.Data.getWatchlist() || [];
      var wlCount = filteredStocks.filter(function (s) { return wl.indexOf(s.ticker) !== -1; }).length;
      var newCount = filteredStocks.filter(isNewInActiveFilter).length;
      var extra = [];
      if (wlCount > 0) extra.push('★ ' + wlCount + (wlCount === 1 ? ' Watchlist-Aktie erfüllt' : ' Watchlist-Aktien erfüllen') + ' den Filter');
      if (newCount > 0) extra.push('🆕 ' + newCount + ' neu seit dem letzten Daten-Update');
      if (extra.length > 0) lines.push(extra.join(' · '));
    }

    el.innerHTML = '<div style="font-size: 0.74rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 10px;">' +
      lines.join('<br>') + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Karten-Tags
  // ---------------------------------------------------------------------------
  function crossTag(s) {
    if (!s.cross || !hasNum(s.crossDaysAgo) || s.crossDaysAgo > CROSS_RECENT_DAYS) return '';
    var isDeath = s.cross === 'death';
    var when = s.crossDaysAgo === 0 ? 'heute' : 'vor ' + s.crossDaysAgo + ' Tg.';
    return '<span class="sector-label" style="color: var(' + (isDeath ? '--bearish' : '--bullish') + '); font-weight: 700;">• ' +
      (isDeath ? 'Death Cross ' : 'Golden Cross ') + when + '</span>';
  }

  function greenTag(txt) {
    return '<span class="sector-label" style="color: var(--bullish); font-weight: 700;">• ' + esc(txt) + '</span>';
  }

  function extraTags(s) {
    var tags = [];
    if (isActive('quality') && hasNum(s.profitMargins)) tags.push('Marge ' + fmtNum(s.profitMargins * 100, 0) + ' %');
    if (isActive('earnings_growth') && hasNum(s.pe) && hasNum(s.forwardPe)) tags.push('KGV ' + fmtNum(s.pe, 0) + ' → ' + fmtNum(s.forwardPe, 0));
    if (isActive('recovery') && hasNum(s.rangePos)) tags.push('52W-Spanne ' + fmtNum(s.rangePos, 0) + ' %');
    if (isActive('oversold') && hasNum(s.rsi)) tags.push('RSI ' + fmtNum(s.rsi, 0));
    if ((isActive('value') || isActive('undervalued')) && hasNum(s.pe) && s.pe > 0) {
      var med = sectorPe[s.sector];
      tags.push('KGV ' + fmtNum(s.pe, 0) + (med ? ' (Branche Ø ' + fmtNum(med, 0) + ')' : ''));
    }
    return tags.map(greenTag).join('');
  }

  function targetTag(s) {
    var wanted = isActive('undervalued') || isActive('turnaround') || isActive('forecast_up') ||
      isActive('forecast_down') || isActive('recovery');
    if (!wanted || !hasUpside(s)) return '';
    var color = s.upside >= 0 ? '--bullish' : '--bearish';
    var analysts = hasNum(s.analystCount) && s.analystCount > 0 ? ' (' + s.analystCount + ' Analysten)' : '';
    return '<span class="sector-label" style="color: var(' + color + '); font-weight: 700;">• Ziel ' +
      (s.upside >= 0 ? '+' : '') + fmtNum(s.upside, 0) + ' %' + esc(analysts) + '</span>';
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
      var newBadge = activePresets.length > 0 && isNewInActiveFilter(stock)
        ? '<span class="sector-label" style="color: var(--accent-purple-light); font-weight: 700;">• NEU</span>' : '';

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

  // ---------------------------------------------------------------------------
  // KI-Screening (Gemini)
  // ---------------------------------------------------------------------------
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

      // Alle Treffer in den Prompt aufnehmen (ohne Limit)
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
        if (hasNum(s.perf52w)) parts.push("52W-Perf.: " + fmtNum(s.perf52w, 0) + " %");
        if (hasUpside(s)) parts.push("Upside-Ziel: " + fmtNum(s.upside, 1) + " %" + (hasNum(s.analystCount) ? " (" + s.analystCount + " Analysten)" : ""));
        if (hasRecentCross(s, 'death')) parts.push("Death Cross vor " + s.crossDaysAgo + " Tg.");
        if (hasRecentCross(s, 'golden')) parts.push("Golden Cross vor " + s.crossDaysAgo + " Tg.");
        promptText += "- " + parts.join(" | ") + "\n";
      });

      // Bei langem Text würde die URL zu groß: voller Text in die Zwischenablage, URL bekommt nur einen kurzen Start-Satz.
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
            alert("Hinweis: Da die Liste mit " + list.length + " Aktien sehr lang ist, wurde sie automatisch in deine Zwischenablage kopiert. Füge den Text bei Gemini einfach über 'Einfügen' (oder Strg+V) in das Chat-Feld ein.");
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

  // ---------------------------------------------------------------------------
  // Feinfilter-Sheet (Header-Filter-Icon)
  // ---------------------------------------------------------------------------
  function peLabel(v) { return v >= 80 ? 'Beliebig' : '≤ ' + v; }
  function yieldLabel(v) { return v > 0 ? '≥ ' + v + ' %' : 'Beliebig'; }
  function perfLabel(v) { return v <= -50 ? 'Beliebig' : '≥ ' + v + ' %'; }

  function openSheet() {
    var sheet = document.getElementById('filter-bottom-sheet');
    var backdrop = document.getElementById('filter-sheet-backdrop');
    if (!sheet || !backdrop) return;
    syncSliderInputs();
    sheet.classList.add('open');
    backdrop.classList.add('open');
  }

  function closeSheet() {
    var sheet = document.getElementById('filter-bottom-sheet');
    var backdrop = document.getElementById('filter-sheet-backdrop');
    if (sheet) sheet.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }

  function syncSliderInputs() {
    var pe = document.getElementById('filter-slider-pe');
    var yl = document.getElementById('filter-slider-yield');
    var pf = document.getElementById('filter-slider-perf');
    if (pe) pe.value = sliderFilters.maxPe === null ? 80 : sliderFilters.maxPe;
    if (yl) yl.value = sliderFilters.minYield;
    if (pf) pf.value = sliderFilters.minPerf === null ? -50 : sliderFilters.minPerf;
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
  }

  function updateHeaderFilterIndicator() {
    var btn = document.getElementById('btn-header-filter');
    if (!btn) return;
    btn.style.borderColor = slidersActive() ? 'var(--accent-purple)' : '';
    btn.style.color = slidersActive() ? 'var(--accent-purple-light)' : '';
  }

  function applySliders() {
    var pe = Number(document.getElementById('filter-slider-pe').value);
    var yl = Number(document.getElementById('filter-slider-yield').value);
    var pf = Number(document.getElementById('filter-slider-perf').value);
    sliderFilters = {
      maxPe: pe >= 80 ? null : pe,
      minYield: yl,
      minPerf: pf <= -50 ? null : pf
    };
    updateHeaderFilterIndicator();
    applyFiltersAndRender();
  }

  function resetSliders() {
    sliderFilters = { maxPe: null, minYield: 0, minPerf: null };
    syncSliderInputs();
    updateHeaderFilterIndicator();
    applyFiltersAndRender();
  }

  // ---------------------------------------------------------------------------
  // Filter an-/abschalten (Chips und Filter-Fenster nutzen dieselbe Logik)
  // ---------------------------------------------------------------------------
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

    // Sinnvolle Standard-Sortierung nur, wenn genau ein Filter aktiv ist
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

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
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

    // Feinfilter-Sheet
    ['filter-slider-pe', 'filter-slider-yield', 'filter-slider-perf'].forEach(function (id) {
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
  }

  // ---------------------------------------------------------------------------
  // Template
  // ---------------------------------------------------------------------------
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
      '</div>';
    });

    var peVal = sliderFilters.maxPe === null ? 80 : sliderFilters.maxPe;
    var perfVal = sliderFilters.minPerf === null ? -50 : sliderFilters.minPerf;

    return '' +
      '<div class="view-container">' +
        '<div class="hero-banner">' +
          '<div class="hero-tag">Marktübersicht (Aktienuniversum)</div>' +
          '<div class="hero-count" id="screener-hero-count">Lade Titel...</div>' +
          '<div class="hero-stats-grid">' +
            '<div><div class="hero-stat-label">Top-Gewinner</div><div class="hero-stat-value" id="screener-hero-winner" style="color: #6ee7b7;">—</div></div>' +
            '<div><div class="hero-stat-label">Ø KGV</div><div class="hero-stat-value" id="screener-hero-pe">—</div></div>' +
            '<div><div class="hero-stat-label">Ø Div.-Rendite</div><div class="hero-stat-value" id="screener-hero-yield">—</div></div>' +
          '</div>' +
        '</div>' +
        '<div id="screener-data-stamp" style="font-size: 0.7rem; color: var(--text-dim); margin: -4px 2px 10px;"></div>' +

        '<div class="search-bar-wrapper">' +
          '<svg class="search-icon-left" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>' +
          '</svg>' +
          '<input type="text" id="screener-search-input" class="search-input" placeholder="Name, Ticker oder Branche suchen..." autocomplete="off">' +
        '</div>' +

        '<div class="horizontal-scroll-row">' + chips + '</div>' +
        '<div id="screener-active-summary"></div>' +

        '<div class="sub-header-bar">' +
          '<span id="screener-result-count">0 Ergebnisse</span>' +
          '<select id="screener-sort-select" class="sort-select">' + sortOptions + '</select>' +
        '</div>' +

        '<div id="screener-ai-banner-container"></div>' +

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
        '<div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 10px;">Wirkt zusätzlich zu den Chips. Aktien ohne den jeweiligen Wert werden dann ausgeblendet.</div>' +
        '<button id="sheet-apply-btn" class="btn-primary" style="margin-top: 4px;">Fertig</button>' +
      '</div>';
  }

  // Gemerkte Auswahl laden (muss nach Definition aller Tabellen passieren)
  restoreState();

  return {
    initView: initView
  };
})();

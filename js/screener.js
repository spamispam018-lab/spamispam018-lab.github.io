/**
 * js/screener.js
 * Verwaltet den Aktien-Screener:
 * - Marktübersicht Hero-Banner mit Kennzahlen
 * - Volltextsuche über Name und Ticker (Groß-/Kleinschreibung tolerant)
 * - Robuste Sortierung ohne Ausblenden von Titeln mit fehlenden Daten
 * - Filter-Presets & Detail-Navigation
 * - KI-Screening für spezielle Filter (Unterbewertet, Turnaround)
 */

window.App = window.App || {};

window.App.Screener = (function () {
  'use strict';

  var allStocks = [];
  var filteredStocks = [];

  var currentSearchQuery = '';
  var currentSort = 'marketCap_desc';
  var activePresets = []; // leer = "Alle"; mehrere aktive Filter = alle müssen zutreffen (UND)

  var PRESET_LABELS = {
    high_dividend: 'Hohe Dividende', value: 'Value', undervalued: 'Unterbewertet', turnaround: 'Turnaround',
    growth: 'Growth', top_performer: 'Top Performer', forecast_up: 'Prognose steigend', forecast_down: 'Prognose fallend',
    death_cross: 'Death Cross', golden_cross: 'Golden Cross', quality: 'Qualität',
    earnings_growth: 'Gewinnwachstum erwartet', recovery: 'Erholung', oversold: 'Überverkauft'
  };

  // Filter, die sich gegenseitig ausschließen (Antippen des einen schaltet den anderen ab)
  var PRESET_EXCLUSIVE = { forecast_up: 'forecast_down', forecast_down: 'forecast_up', death_cross: 'golden_cross', golden_cross: 'death_cross' };

  // Passende Standard-Sortierung, wenn genau ein Filter aktiv ist
  var PRESET_SORTS = { forecast_up: 'upside_desc', forecast_down: 'upside_asc', oversold: 'rsi_asc' };
  var autoSorted = false; // true, wenn die Sortierung automatisch durch einen Filter gesetzt wurde

  function isActive(p) {
    return activePresets.indexOf(p) !== -1;
  }

  // Prognose-Filter (Basis: mittleres Analysten-Kursziel gegenüber aktuellem Kurs, Feld "upside" in %)
  var PROGNOSE_STEIGEND_MIN = 10; // Kursziel mindestens 10 % über Kurs
  var PROGNOSE_FALLEND_MAX = 0;   // Kursziel unter aktuellem Kurs
  var CROSS_RECENT_DAYS = 60;     // "Kürzlich" = SMA-50/200-Kreuz in den letzten 60 Handelstagen

  // Schwellen für Qualität / Gewinnwachstum / Erholung / Überverkauft
  var QUALITY_MIN_MARGIN = 0.10;      // Nettomarge mind. 10 %
  var QUALITY_MAX_DEBT_EQUITY = 100;  // Verschuldung (Debt/Equity in %) höchstens 100
  var EARNINGS_GROWTH_MIN = 0.15;     // Forward-KGV mind. 15 % unter aktuellem KGV
  var RECOVERY_MAX_RANGEPOS = 33;     // Kurs im unteren Drittel der 52-Wochen-Spanne
  var OVERSOLD_RSI_MAX = 30;          // RSI(14) höchstens 30

  // Filterfunktionen je Preset (Hilfsfunktionen sind weiter unten per Hoisting verfügbar)
  var PRESET_FILTERS = {
    high_dividend: function (s) { return (s.dividendYield || 0) >= 3; },
    value: function (s) { return s.pe && s.pe > 0 && s.pe <= 18; },
    undervalued: function (s) { return isUndervalued(s); },
    turnaround: function (s) { return isTurnaround(s); },
    growth: function (s) { return (s.revGrowth || 0) >= 0.10; },
    top_performer: function (s) { return (s.perf52w || 0) >= 15; },
    forecast_up: function (s) { return hasUpside(s) && s.upside >= PROGNOSE_STEIGEND_MIN; },
    forecast_down: function (s) { return hasUpside(s) && s.upside < PROGNOSE_FALLEND_MAX; },
    death_cross: function (s) { return hasRecentCross(s, 'death'); },
    golden_cross: function (s) { return hasRecentCross(s, 'golden'); },
    quality: function (s) { return isQuality(s); },
    earnings_growth: function (s) { return isEarningsGrowth(s); },
    recovery: function (s) { return isRecovery(s); },
    oversold: function (s) { return isOversold(s); }
  };

  /**
   * Initialisiert und rendert den Screener.
   */
  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;

    // Filter-Icon im Header einblenden
    var headerFilterBtn = document.getElementById('btn-header-filter');
    if (headerFilterBtn) {
      headerFilterBtn.style.display = 'inline-flex';
    }

    // HTML-Grundgerüst einfügen
    container.innerHTML = getTemplateHtml();

    // Daten laden
    window.App.Data.getUniverse()
      .then(function (stocks) {
        allStocks = stocks || [];
        updateHeroBanner(allStocks);
        applyFiltersAndRender();
        bindEvents();
      })
      .catch(function (err) {
        var listContainer = document.getElementById('screener-list-container');
        if (listContainer) {
          listContainer.innerHTML = '<div class="state-box"><p>Fehler beim Laden: ' + err.message + '</p></div>';
        }
      });
  }

  /**
   * Aktualisiert die Kennzahlen im oberen violetten Hero-Banner.
   */
  function updateHeroBanner(stocks) {
    var countEl = document.getElementById('screener-hero-count');
    var winnerEl = document.getElementById('screener-hero-winner');
    var peEl = document.getElementById('screener-hero-pe');
    var yieldEl = document.getElementById('screener-hero-yield');

    if (!stocks || stocks.length === 0) return;

    if (countEl) countEl.textContent = stocks.length + ' Titel';

    // Top-Gewinner ermitteln
    var winner = stocks.reduce(function (max, item) {
      return (item.changePercent || 0) > (max.changePercent || -999) ? item : max;
    }, stocks[0]);

    if (winnerEl && winner) {
      var sign = (winner.changePercent || 0) >= 0 ? '+' : '';
      winnerEl.innerHTML = (winner.ticker || '—') + '<br><span style="font-size:0.75rem;">(' + sign + window.App.Format.number(winner.changePercent, 2) + ' %)</span>';
    }

    // Durchschnitts-KGV berechnen (nur valide Werte > 0 und < 150)
    var peValues = stocks.filter(function (s) { return s.pe && s.pe > 0 && s.pe < 150; });
    var avgPe = peValues.length > 0
      ? peValues.reduce(function (sum, s) { return sum + s.pe; }, 0) / peValues.length
      : 0;
    if (peEl) peEl.textContent = avgPe > 0 ? window.App.Format.number(avgPe, 1) : '—';

    // Durchschnitts-Dividendenrendite berechnen
    var divValues = stocks.filter(function (s) { return s.dividendYield && s.dividendYield > 0 && s.dividendYield < 25; });
    var avgYield = divValues.length > 0
      ? (divValues.reduce(function (sum, s) { return sum + s.dividendYield; }, 0) / divValues.length)
      : 0;
    if (yieldEl) yieldEl.textContent = avgYield > 0 ? window.App.Format.number(avgYield, 1) + ' %' : '—';
  }

  /**
   * Wendet Suche, Presets und Sortierung an, ohne Aktien zu verwerfen.
   */
  function applyFiltersAndRender() {
    var list = allStocks.slice();

    // 1. Volltextsuche: Prüft Ticker, Name und Branche
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

    // 3. Sortierung (null/undefined sicher mit 0 als Fallback)
    list.sort(function (a, b) {
      switch (currentSort) {
        case 'marketCap_desc':
          return (b.marketCap || 0) - (a.marketCap || 0);
        case 'change_desc':
          return (b.changePercent || -999) - (a.changePercent || -999);
        case 'change_asc':
          return (a.changePercent || 999) - (b.changePercent || 999);
        case 'pe_asc':
          // Verlust (negatives KGV) zuerst, dann positives KGV aufsteigend, unbekannt zuletzt
          return peRank(a) - peRank(b);
        case 'upside_desc':
          return (b.upside === null || b.upside === undefined ? -999 : b.upside) - (a.upside === null || a.upside === undefined ? -999 : a.upside);
        case 'upside_asc':
          // Fehlende Prognose ans Ende
          return (hasUpside(a) ? a.upside : 999) - (hasUpside(b) ? b.upside : 999);
        case 'rsi_asc':
          return (hasNum(a.rsi) ? a.rsi : 999) - (hasNum(b.rsi) ? b.rsi : 999);
        case 'dividend_desc':
          return (b.dividendYield || 0) - (a.dividendYield || 0);
        case 'perf52w_desc':
          return (b.perf52w || -999) - (a.perf52w || -999);
        case 'name_asc':
          return (a.name || a.ticker || '').localeCompare(b.name || b.ticker || '');
        default:
          return (b.marketCap || 0) - (a.marketCap || 0);
      }
    });

    filteredStocks = list;

    // Trefferzahl aktualisieren
    var resultCountEl = document.getElementById('screener-result-count');
    if (resultCountEl) {
      resultCountEl.textContent = filteredStocks.length + ' Ergebnisse';
    }

    renderAiBanner(filteredStocks, activePresets);
    renderStockCards(filteredStocks);
  }

  /**
   * SMA 50 hat SMA 200 kürzlich von oben nach unten (death) bzw. unten nach oben (golden) gekreuzt.
   * Daten (cross, crossDaysAgo) kommen aus universe.json und werden vom täglichen Update berechnet.
   */
  function hasRecentCross(s, type) {
    return s.cross === type && s.crossDaysAgo !== null && s.crossDaysAgo !== undefined && s.crossDaysAgo <= CROSS_RECENT_DAYS;
  }

  function crossTag(s) {
    if (!s.cross || s.crossDaysAgo === null || s.crossDaysAgo === undefined || s.crossDaysAgo > CROSS_RECENT_DAYS) return '';
    var isDeath = s.cross === 'death';
    var when = s.crossDaysAgo === 0 ? 'heute' : 'vor ' + s.crossDaysAgo + ' Tg.';
    return '<span class="sector-label" style="color: var(' + (isDeath ? '--bearish' : '--bullish') + '); font-weight: 700;">• ' + (isDeath ? 'Death Cross ' : 'Golden Cross ') + when + '</span>';
  }

  function hasNum(v) {
    return v !== null && v !== undefined && !isNaN(v);
  }

  /**
   * "Qualität": solide Marge, wachsender Umsatz und moderate Verschuldung.
   * Fehlende Verschuldung (z. B. bei Banken) schließt nicht aus.
   */
  function isQuality(s) {
    if (!hasNum(s.profitMargins) || s.profitMargins < QUALITY_MIN_MARGIN) return false;
    if (!hasNum(s.revGrowth) || s.revGrowth < 0) return false;
    if (hasNum(s.debtToEquity) && s.debtToEquity > QUALITY_MAX_DEBT_EQUITY) return false;
    return true;
  }

  /**
   * "Gewinnwachstum erwartet": positives KGV, Forward-KGV deutlich darunter (Analysten erwarten steigende Gewinne).
   */
  function isEarningsGrowth(s) {
    if (!(s.pe > 0) || !(s.forwardPe > 0)) return false;
    return s.forwardPe <= s.pe * (1 - EARNINGS_GROWTH_MIN);
  }

  /**
   * "Erholung": Kurs im unteren Drittel der 52W-Spanne, aber Analysten-Kursziel deutlich darüber.
   */
  function isRecovery(s) {
    if (!hasNum(s.rangePos) || s.rangePos > RECOVERY_MAX_RANGEPOS) return false;
    return hasNum(s.upside) && s.upside >= PROGNOSE_STEIGEND_MIN;
  }

  /**
   * "Überverkauft": RSI(14) <= 30 (wird im täglichen Update aus der Kurshistorie berechnet).
   */
  function isOversold(s) {
    return hasNum(s.rsi) && s.rsi <= OVERSOLD_RSI_MAX;
  }

  /** Kleine Kennzahl auf der Karte passend zum aktiven Filter. */
  function extraTag(s) {
    var F = window.App.Format;
    var tags = [];
    if (isActive('quality') && hasNum(s.profitMargins)) tags.push('Marge ' + F.number(s.profitMargins * 100, 0) + ' %');
    if (isActive('earnings_growth') && hasNum(s.pe) && hasNum(s.forwardPe)) tags.push('KGV ' + F.number(s.pe, 0) + ' \u2192 ' + F.number(s.forwardPe, 0));
    if (isActive('recovery') && hasNum(s.rangePos)) tags.push('52W-Spanne ' + F.number(s.rangePos, 0) + ' %');
    if (isActive('oversold') && hasNum(s.rsi)) tags.push('RSI ' + F.number(s.rsi, 0));
    return tags.map(function (txt) {
      return '<span class="sector-label" style="color: var(--bullish); font-weight: 700;">\u2022 ' + txt + '</span>';
    }).join('');
  }

  function hasUpside(s) {
    return s.upside !== null && s.upside !== undefined && !isNaN(s.upside);
  }

  /**
   * KGV-Sortierung: negatives KGV (Verlust) < positives KGV < unbekannt.
   */
  function isLoss(s) {
    if (s.pe !== null && s.pe !== undefined) return s.pe < 0;
    return s.profitMargins !== null && s.profitMargins !== undefined && s.profitMargins < 0;
  }

  /**
   * "Unterbewertet": günstiges KGV bei solider Qualität und Kurs im unteren Hälfte der 52W-Spanne.
   * Fehlende Werte (PEG, Verschuldung – z. B. bei Banken) schließen eine Aktie nicht aus.
   */
  function isUndervalued(s) {
    if (!(s.pe > 0 && s.pe <= 18)) return false;
    if (s.peg !== null && s.peg !== undefined && !(s.peg > 0 && s.peg <= 1.5)) return false;
    if (!(s.profitMargins > 0)) return false;
    if (s.debtToEquity !== null && s.debtToEquity !== undefined && s.debtToEquity > 150) return false;
    if ((s.revGrowth || 0) < 0) return false;
    if (s.rangePos === null || s.rangePos === undefined || s.rangePos > 50) return false;
    return true;
  }

  /**
   * "Turnaround": aktuell Verlust (negatives/fehlendes KGV), aber niedriges Forward-KGV,
   * moderate Verschuldung und Kurs im unteren Bereich der 52W-Spanne. Hohes Risiko!
   */
  function isTurnaround(s) {
    if (!isLoss(s)) return false;
    if (!(s.forwardPe > 0 && s.forwardPe <= 12)) return false;
    if (s.debtToEquity !== null && s.debtToEquity !== undefined && s.debtToEquity > 150) return false;
    if (s.rangePos === null || s.rangePos === undefined || s.rangePos > 50) return false;
    return true;
  }

  function peRank(s) {
    if (isLoss(s)) {
      var depth = (s.pe < 0) ? s.pe : (s.profitMargins || 0);
      return -1e6 + depth;
    }
    if (s.pe && s.pe > 0) return s.pe;
    return 1e9;
  }

  /**
   * Rendert den KI-Banner, wenn bestimmte Presets aktiv sind.
   */
  function renderAiBanner(list, presets) {
    var container = document.getElementById('screener-ai-banner-container');
    if (!container) return;

    if (!presets || presets.length === 0) {
      container.innerHTML = '';
      return;
    }

    if (list.length === 0) {
      container.innerHTML = '';
      return;
    }

    var presetName = presets.map(function (p) { return PRESET_LABELS[p] || p; }).join(' + ');

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
    if (geminiBtn) {
      geminiBtn.onclick = function() {
        var promptText = "Hallo Gemini! Bitte prüfe zuerst meine Daten. Hier ist eine Liste von " + list.length + " Aktien, die aktuell in meinem Screener den Filter '" + presetName + "' erfüllen. " +
                         "Bitte analysiere diese Liste basierend auf den mitgelieferten Kennzahlen und der aktuellen Marktlage. " +
                         "Empfiehl mir danach die 5 besten Kandidaten für einen Einstieg und begründe deine Wahl kurz.\n\n";
        
        // Alle Treffer in den Prompt aufnehmen (ohne Limit)
        list.forEach(function(s) {
            var sName = s.name || s.ticker;
            var sPrice = window.App.Format.currency(s.price, s.currency || 'EUR');
            var sChange = window.App.Format.number(s.changePercent, 2) + " %";
            var sPe = (s.pe !== null && s.pe !== undefined) ? window.App.Format.number(s.pe, 1) : "N/A";
            var sUpside = (s.upside !== null && s.upside !== undefined) ? window.App.Format.number(s.upside, 1) + " %" : "N/A";

            promptText += "- " + sName + " (" + s.ticker + ") | Sektor: " + (s.sector || 'N/A') + " | Kurs: " + sPrice + " (" + sChange + ") | KGV: " + sPe + " | Upside-Ziel: " + sUpside + "\n";
        });

        // Wenn der Text sehr lang ist (z.B. über 2000 Zeichen), sprengt das die URL.
        // Wir packen den vollen Text in die Zwischenablage und senden der URL nur einen kurzen Start-Satz.
        var safeUrlText = promptText;
        var needsClipboardPaste = false;

        if (promptText.length > 2000) {
            safeUrlText = "Hallo Gemini! Ich habe eine große Liste mit " + list.length + " Aktien für den Filter '" + presetName + "' ermittelt. Ich füge dir die detaillierten Kennzahlen gleich in meiner nächsten Nachricht ein. Bitte antworte zunächst nur mit 'Bereit', damit ich die Daten einfügen kann.";
            needsClipboardPaste = true;
        }

        var geminiUrl = "https://gemini.google.com/app?q=" + encodeURIComponent(safeUrlText);

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(promptText).then(function() {
                if (needsClipboardPaste) {
                    alert("Hinweis: Da die Liste mit " + list.length + " Aktien sehr lang ist, wurde sie automatisch in deine Zwischenablage kopiert. Füge den Text bei Gemini einfach über 'Einfügen' (oder Strg+V) in das Chat-Feld ein.");
                }
                window.open(geminiUrl, '_blank');
            }).catch(function() {
                window.open(geminiUrl, '_blank');
            });
        } else {
            window.open(geminiUrl, '_blank');
        }
      };
    }
  }

  /**
   * Rendert die Liste der Aktienkarten.
   */
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

      html += '' +
        '<div class="stock-card" data-ticker="' + stock.ticker + '">' +
          '<div style="display:flex; align-items:center; flex:1; min-width:0;">' +
            '<button class="star-btn ' + (isStarred ? 'active' : '') + '" data-star-ticker="' + stock.ticker + '">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + (isStarred ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2">' +
                '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>' +
              '</svg>' +
            '</button>' +
            '<div class="stock-info-left" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
              '<div class="stock-name" style="overflow:hidden; text-overflow:ellipsis;">' + (stock.name || stock.ticker) + '</div>' +
              '<div class="stock-tags">' +
                '<span class="ticker-badge">' + stock.ticker + '</span>' +
                '<span class="sector-label">• ' + (stock.sector || 'Markt') + '</span>' +
                ((isActive('undervalued') || isActive('turnaround') || isActive('forecast_up') || isActive('forecast_down')) && stock.upside !== null && stock.upside !== undefined ? '<span class="sector-label" style="color: var(' + (stock.upside >= 0 ? '--bullish' : '--bearish') + '); font-weight: 700;">• Ziel ' + (stock.upside >= 0 ? '+' : '') + window.App.Format.number(stock.upside, 0) + ' %</span>' : '') +
                (activePresets.length > 0 ? crossTag(stock) : '') +
                extraTag(stock) +
                (isLoss(stock) ? '<span class="sector-label" style="color: var(--bearish); font-weight: 700;">• KGV neg.</span>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="stock-info-right">' +
            '<div class="stock-price">' + window.App.Format.currency(stock.price, stock.currency || 'EUR') + '</div>' +
            '<div class="badge-pill ' + chgCls + '">' + sign + window.App.Format.number(stock.changePercent, 2) + ' %</div>' +
          '</div>' +
        '</div>';
    });

    container.innerHTML = html;
    bindCardEvents(container);
  }

  /**
   * Bindet Klick-Events für Karten und Favoriten-Sterne.
   */
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
      };
    });
  }

  /**
   * Bindet Suchfeld, Presets und Sortierung.
   */
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

    var presetBtns = document.querySelectorAll('[data-preset]');
    presetBtns.forEach(function (btn) {
      btn.onclick = function () {
        var p = btn.getAttribute('data-preset');
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
        // Chips (de)aktivieren
        presetBtns.forEach(function (b) {
          var bp = b.getAttribute('data-preset');
          var on = bp === 'all' ? activePresets.length === 0 : isActive(bp);
          if (on) b.classList.add('active'); else b.classList.remove('active');
        });
        // Sinnvolle Standard-Sortierung nur, wenn genau ein Filter aktiv ist
        if (activePresets.length === 1 && PRESET_SORTS[activePresets[0]]) { currentSort = PRESET_SORTS[activePresets[0]]; autoSorted = true; }
        else if (activePresets.length === 0 && autoSorted) { currentSort = 'marketCap_desc'; autoSorted = false; }
        var sortEl = document.getElementById('screener-sort-select');
        if (sortEl) sortEl.value = currentSort;
        applyFiltersAndRender();
      };
    });
  }

  /**
   * HTML-Template für die Ansicht.
   */
  function getTemplateHtml() {
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

        '<div class="search-bar-wrapper">' +
          '<svg class="search-icon-left" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>' +
          '</svg>' +
          '<input type="text" id="screener-search-input" class="search-input" placeholder="Name oder Ticker suchen..." autocomplete="off">' +
        '</div>' +

        '<div class="horizontal-scroll-row">' +
          '<button class="chip-btn active" data-preset="all">Alle</button>' +
          '<button class="chip-btn" data-preset="high_dividend">💰 Hohe Dividende</button>' +
          '<button class="chip-btn" data-preset="value">💎 Value (KGV &lt; 18)</button>' +
          '<button class="chip-btn" data-preset="undervalued">🔎 Unterbewertet</button>' +
          '<button class="chip-btn" data-preset="turnaround">🔄 Turnaround</button>' +
          '<button class="chip-btn" data-preset="growth">🚀 Growth</button>' +
          '<button class="chip-btn" data-preset="top_performer">📈 Top Performer</button>' +
          '<button class="chip-btn" data-preset="forecast_up">🔼 Prognose steigend</button>' +
          '<button class="chip-btn" data-preset="forecast_down">🔽 Prognose fallend</button>' +
          '<button class="chip-btn" data-preset="death_cross">☠️ Death Cross</button>' +
          '<button class="chip-btn" data-preset="golden_cross">✨ Golden Cross</button>' +
          '<button class="chip-btn" data-preset="quality">🏆 Qualität</button>' +
          '<button class="chip-btn" data-preset="earnings_growth">📈 Gewinnwachstum erwartet</button>' +
          '<button class="chip-btn" data-preset="recovery">🌱 Erholung</button>' +
          '<button class="chip-btn" data-preset="oversold">📉 Überverkauft</button>' +
        '</div>' +

        '<div class="sub-header-bar">' +
          '<span id="screener-result-count">0 Ergebnisse</span>' +
          '<select id="screener-sort-select" class="sort-select">' +
            '<option value="marketCap_desc">Marktkapitalisierung (Höchste)</option>' +
            '<option value="change_desc">Tagesgewinner (%)</option>' +
            '<option value="change_asc">Tagesverlierer (%)</option>' +
            '<option value="name_asc">Name (A–Z)</option>' +
            '<option value="pe_asc">KGV (Niedrigste)</option>' +
            '<option value="upside_desc">Kursziel-Potenzial (Höchstes)</option>' +
            '<option value="upside_asc">Kursziel-Potenzial (Niedrigstes)</option>' +
            '<option value="rsi_asc">RSI (Niedrigster)</option>' +
            '<option value="dividend_desc">Dividendenrendite (Höchste)</option>' +
            '<option value="perf52w_desc">52W-Performance (Beste)</option>' +
          '</select>' +
        '</div>' +

        '<div id="screener-ai-banner-container"></div>' +

        '<div id="screener-list-container">' +
          '<div class="state-box"><div class="spinner"></div><p>Lade Aktien...</p></div>' +
        '</div>' +
      '</div>';
  }

  return {
    initView: initView
  };
})();

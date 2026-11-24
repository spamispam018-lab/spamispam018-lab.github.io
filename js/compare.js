/**
 * js/compare.js
 * Aktienvergleich 2-4 Titel + Radar-Chart.
 * FIX: Entfernt den Aufruf von getPeriod() und nutzt die neuen Score-Kategorien.
 * FIX: Robusteres Rendering, falls Daten (chartHistory, quote) fehlen.
 */
window.App = window.App || {};

window.App.Compare = (function () {
  'use strict';

  var STORAGE_KEY = 'app_compare_tickers';
  var selectedTickers = ['AAPL', 'MSFT'];
  var loadedStocksData = {};
  var currentPeriod = '1Y';

  var COLOR_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ec4899'];

  function saveTickers() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedTickers)); } catch (e) {}
  }

  function loadSavedTickers() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) selectedTickers = parsed.slice(0, 4);
      }
    } catch (e) {}
  }

  function initView(params) {
    var container = document.getElementById('app-view-content');
    if (!container) return;

    var headerFilterBtn = document.getElementById('btn-header-filter');
    if (headerFilterBtn) headerFilterBtn.style.display = 'none';

    if (params && params.tickers) {
      selectedTickers = params.tickers.split(',').slice(0, 4);
      saveTickers();
    } else if (params && params.ticker) {
      // Aus der Detailansicht: Aktie vorne einreihen, bisherige Auswahl behalten
      loadSavedTickers();
      var tk = String(params.ticker).toUpperCase();
      selectedTickers = [tk].concat(selectedTickers.filter(function (t) { return t !== tk; })).slice(0, 4);
      if (selectedTickers.length < 2) selectedTickers.push(tk === 'MSFT' ? 'AAPL' : 'MSFT');
      saveTickers();
    } else {
      loadSavedTickers();
    }

    renderShell(container);
    loadAndRenderComparison();
  }

  function renderShell(container) {
    var html = '' +
      '<div class="view-container">' +
        '<div style="margin-bottom: 16px;">' +
          '<h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">Aktienvergleich</h2>' +
          '<div style="font-size: 0.78rem; color: var(--text-dim);">2 bis 4 Unternehmen im direkten Kennzahlen- &amp; Performance-Vergleich</div>' +
        '</div>' +
        '<div class="card" style="padding: 12px; margin-bottom: 14px; position: relative; overflow: visible;">' +
          '<div style="font-size: 0.72rem; color: var(--text-dim); margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">Ausgewählte Titel</div>' +
          '<div id="compare-chips-container" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;"></div>' +
          '<div style="display: flex; gap: 8px; margin-top: 10px; position: relative;">' +
            '<input type="text" id="compare-add-input" class="search-input" placeholder="Name oder Ticker suchen..." style="height: 38px; padding-left: 14px; flex: 1;" autocomplete="off">' +
            '<div id="compare-autocomplete" style="display: none; position: absolute; top: 44px; left: 0; right: 0; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); max-height: 240px; overflow-y: auto; z-index: 1000; box-shadow: 0 10px 25px rgba(0,0,0,0.5);"></div>' +
          '</div>' +
        '</div>' +
        '<div id="compare-content-area">' +
          '<div class="state-box"><div class="spinner"></div><p>Lade Vergleichsdaten...</p></div>' +
        '</div>' +
      '</div>';
    container.innerHTML = html;
    bindInputEvents();
  }

  function loadAndRenderComparison() {
    renderChips();
    var contentArea = document.getElementById('compare-content-area');
    if (!contentArea) return;
    if (selectedTickers.length === 0) {
      contentArea.innerHTML = '<div class="state-box"><p>Wähle mindestens eine Aktie zum Vergleich aus.</p></div>';
      return;
    }

    var promises = selectedTickers.map(function (ticker) {
      return window.App.Data.getStock(ticker).catch(function () { return null; });
    });

    var uniPromise = window.App.Data.getUniverse()
      .then(function (u) { universeCache = u || []; })
      .catch(function () { universeCache = []; });

    Promise.all(promises).then(function (results) {
      return uniPromise.then(function () { return results; });
    }).then(function (results) {
      loadedStocksData = {};
      var validStocks = [];
      results.forEach(function (st, idx) {
        if (st && st.ticker) { loadedStocksData[st.ticker] = st; validStocks.push(st); }
        else {
          var t = selectedTickers[idx];
          var dummy = { ticker: t, profile: { name: t }, quote: { price: 0 }, ratios: {} };
          loadedStocksData[t] = dummy;
          validStocks.push(dummy);
        }
      });
      renderComparisonResults(contentArea, validStocks);
    });
  }

  function renderChips() {
    var container = document.getElementById('compare-chips-container');
    if (!container) return;
    var html = '';
    selectedTickers.forEach(function (ticker, idx) {
      var color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
      html += '<span class="chip-btn" style="border-color:' + color + '; color:var(--text-main); background: var(--bg-tertiary);">' +
        '<span style="width:8px; height:8px; border-radius:50%; background:' + color + ';"></span>' +
        '<strong>' + ticker + '</strong>' +
        '<span data-remove-ticker="' + ticker + '" style="cursor:pointer; margin-left:4px; opacity:0.7;">&times;</span>' +
      '</span>';
    });
    container.innerHTML = html;
    container.querySelectorAll('[data-remove-ticker]').forEach(function (btn) {
      btn.onclick = function () {
        var t = btn.getAttribute('data-remove-ticker');
        selectedTickers = selectedTickers.filter(function (item) { return item !== t; });
        saveTickers();
        loadAndRenderComparison();
      };
    });
  }

  function addTickerToCompare(ticker) {
    if (!ticker) return;
    var upperTicker = ticker.toUpperCase().trim();
    if (selectedTickers.indexOf(upperTicker) === -1) {
      if (selectedTickers.length >= 4) { alert('Maximal 4 Aktien gleichzeitig im Vergleich.'); return; }
      selectedTickers.push(upperTicker);
      saveTickers();
      loadAndRenderComparison();
    }
  }

  function bindInputEvents() {
    var addInput = document.getElementById('compare-add-input');
    var autocompleteBox = document.getElementById('compare-autocomplete');
    var universe = [];
    window.App.Data.getUniverse().then(function (data) { universe = data || []; });

    if (addInput) {
      addInput.oninput = function (e) {
        var query = e.target.value.toLowerCase().trim();
        if (!query) { autocompleteBox.style.display = 'none'; return; }
        var matches = universe.filter(function (item) {
          var tick = (item.ticker || '').toLowerCase();
          var name = (item.name || '').toLowerCase();
          var sector = (item.sector || '').toLowerCase();
          return tick.indexOf(query) !== -1 || name.indexOf(query) !== -1 || sector.indexOf(query) !== -1;
        }).slice(0, 10);

        if (matches.length > 0) {
          var listHtml = '';
          matches.forEach(function (m) {
            listHtml += '<div class="autocomplete-item" data-ticker="' + m.ticker + '" style="padding: 10px 14px; border-bottom: 1px solid var(--border-subtle); cursor: pointer; display: flex; justify-content: space-between; align-items: center;">' +
              '<div style="display: flex; flex-direction: column; overflow: hidden;">' +
                '<span style="font-weight: 600; font-size: 0.85rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + (m.name || m.ticker) + '</span>' +
                '<span style="font-size: 0.7rem; color: var(--text-dim);">' + m.ticker + ' &bull; ' + (m.sector || 'N/A') + '</span>' +
              '</div>' +
              '<div style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted);">' + window.App.Format.currency(m.price, m.currency) + '</div>' +
            '</div>';
          });
          autocompleteBox.innerHTML = listHtml;
          autocompleteBox.style.display = 'block';
          autocompleteBox.querySelectorAll('.autocomplete-item').forEach(function (item) {
            item.onclick = function () {
              addTickerToCompare(this.getAttribute('data-ticker'));
              addInput.value = '';
              autocompleteBox.style.display = 'none';
            };
          });
        } else {
          autocompleteBox.innerHTML = '<div style="padding: 10px 14px; font-size: 0.8rem; color: var(--text-dim);">Keine Treffer gefunden</div>';
          autocompleteBox.style.display = 'block';
        }
      };
      addInput.onblur = function () {
        setTimeout(function () { if (autocompleteBox) autocompleteBox.style.display = 'none'; }, 200);
      };
      addInput.onkeydown = function (e) {
        if (e.key === 'Enter') {
          var val = addInput.value.trim();
          addTickerToCompare(val);
          addInput.value = '';
          autocompleteBox.style.display = 'none';
        }
      };
    }
  }

  function renderComparisonResults(container, stocks) {
    var html = '' +
      '<div class="card" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%); border: 1px solid var(--accent-purple); padding: 14px; margin-bottom: 14px;">' +
        '<div style="display: flex; justify-content: space-between; align-items: center;">' +
          '<div style="flex: 1; padding-right: 12px;">' +
            '<div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main); margin-bottom: 2px; display: flex; align-items: center; gap: 6px;">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple-light)" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>' +
              'KI-Vergleichsanalyse' +
            '</div>' +
            '<div style="font-size: 0.72rem; color: var(--text-muted);">Lass Gemini die Aktien vergleichen und den besten Einstieg finden.</div>' +
          '</div>' +
          '<button id="btn-compare-gemini" class="chip-btn active" style="background: var(--accent-purple); border-color: var(--accent-purple); font-size: 0.75rem; flex-shrink: 0; box-shadow: 0 4px 14px var(--accent-purple-glow);">Analysieren</button>' +
        '</div>' +
      '</div>' +

      // Radar-Chart
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<div class="card-title">Kennzahlen-Radar</div>' +
          '<span class="period-tag">0–5 Punkte</span>' +
        '</div>' +
        '<div class="chart-container">' +
          '<canvas id="compare-radar-canvas" class="chart-canvas" style="height: 320px;"></canvas>' +
          '<div class="chart-legend" id="compare-radar-legend"></div>' +
        '</div>' +
        '<div class="chart-note">Bewertung: 5 = günstig/gut, 0 = teuer/schlecht. Jede Achse ist auf 0–5 normalisiert.</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header-dotted" style="flex-wrap: wrap; gap: 8px;">' +
          '<div class="card-title">Normierter Kursverlauf (Basis 100 %)</div>' +
          '<div class="pill-group" id="compare-period-pills">' +
            '<button class="pill-btn ' + (currentPeriod === '1W' ? 'active' : '') + '" data-period="1W">1W</button>' +
            '<button class="pill-btn ' + (currentPeriod === '1M' ? 'active' : '') + '" data-period="1M">1M</button>' +
            '<button class="pill-btn ' + (currentPeriod === '3M' ? 'active' : '') + '" data-period="3M">3M</button>' +
            '<button class="pill-btn ' + (currentPeriod === '6M' ? 'active' : '') + '" data-period="6M">6M</button>' +
            '<button class="pill-btn ' + (currentPeriod === '1Y' ? 'active' : '') + '" data-period="1Y">1J</button>' +
          '</div>' +
        '</div>' +
        '<div class="chart-container">' +
          '<canvas id="compare-perf-canvas" class="chart-canvas" style="height: 220px;"></canvas>' +
          '<div class="chart-legend" id="compare-chart-legend"></div>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="padding: 10px;">' +
        '<div class="card-header-dotted" style="padding: 6px 6px 10px;">' +
          '<div class="card-title">Kennzahlen-Gegenüberstellung</div>' +
        '</div>' +
        '<div class="table-responsive-wrapper">' + renderMatrixTable(stocks) + '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<div class="card-title">Margenvergleich im Überblick</div>' +
          '<span class="period-tag">% Werte</span>' +
        '</div>' +
        '<div class="chart-container">' +
          '<canvas id="compare-margins-canvas" class="chart-canvas" style="height: 200px;"></canvas>' +
        '</div>' +
      '</div>';

    container.innerHTML = html;
    bindPeriodPillEvents(stocks);

    var geminiBtn = container.querySelector('#btn-compare-gemini');
    if (geminiBtn) {
      geminiBtn.onclick = function () { openGemini(geminiBtn, stocks); };
    }

    initRadarChart(stocks);
    initNormalizedPerformanceChart(stocks);
    initMarginsBarChart(stocks);
  }

  // =====================================================================
  // KI-Prompt (Gemini): alle relevanten Kennzahlen pro Aktie
  // =====================================================================
  var universeCache = [];
  var NA = 'unbekannt';
  var PATTERN_NAMES = {
    double_top: 'Doppel-Top', double_bottom: 'Doppel-Boden', squeeze: 'Bollinger-Squeeze'
  };

  function nn(v) {
    return v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && !isFinite(v));
  }
  function fnum(v, d) {
    return Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function N(v, d, suffix) { return nn(v) ? fnum(v, d) + (suffix || '') : NA; }
  function P(v, d) { return nn(v) ? fnum(v, d === undefined ? 1 : d) + ' %' : NA; }          // Wert liegt schon in Prozent vor
  function F(v, d) { return nn(v) ? fnum(v * 100, d === undefined ? 1 : d) + ' %' : NA; }    // Bruch (0.15) -> Prozent
  function E(v, d) { return nn(v) ? fnum(v, d === undefined ? 2 : d) + ' €' : NA; }
  function MC(v) {
    if (!nn(v) || v <= 0) return NA;
    return v >= 1e9 ? fnum(v / 1e9, 1) + ' Mrd. €' : fnum(v / 1e6, 0) + ' Mio. €';
  }
  function dateDe(str) {
    var d = new Date(str);
    return isNaN(d.getTime()) ? String(str) : d.toLocaleDateString('de-DE');
  }
  function medianOf(arr) {
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var n = a.length;
    if (!n) return null;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }
  function findUniverse(ticker) {
    for (var i = 0; i < universeCache.length; i++) {
      if (universeCache[i].ticker === ticker) return universeCache[i];
    }
    return null;
  }
  function sectorMedianPe(sector) {
    if (!sector) return null;
    var arr = universeCache.filter(function (x) { return x.sector === sector && x.pe > 0 && x.pe < 500; })
                           .map(function (x) { return x.pe; });
    return arr.length >= 5 ? { v: medianOf(arr), n: arr.length } : null;
  }

  function techLine(s) {
    if (!(s.chartHistory && s.chartHistory.length > 60 && window.App.StockChart)) return '';
    var hist = s.chartHistory.filter(function (p) { return p && p.close > 0; });
    var closes = hist.map(function (p) { return p.close; });
    var n = closes.length, cPrice = closes[n - 1];
    var s50 = window.App.StockChart._sma(closes, 50);
    var s200 = window.App.StockChart._sma(closes, 200);
    var rsiArr = window.App.StockChart._rsi(closes, 14);
    var m = window.App.StockChart._macd(closes);
    function lastValid(arr) {
      for (var i = arr.length - 1; i >= 0; i--) if (arr[i] !== null && arr[i] !== undefined && isFinite(arr[i])) return arr[i];
      return null;
    }
    var s50Last = lastValid(s50), s200Last = lastValid(s200), rsiLast = lastValid(rsiArr);
    var macdLast = lastValid(m.line), sigLast = lastValid(m.signal);
    var mom3m = n > 63 ? (cPrice / closes[n - 1 - 63] - 1) * 100 : null;
    var t = '';
    if (s200Last !== null) t += 'Abstand 200-Tage-Linie ' + P((cPrice / s200Last - 1) * 100) + '. ';
    if (s50Last !== null) t += 'Abstand 50-Tage-Linie ' + P((cPrice / s50Last - 1) * 100) + '. ';
    if (rsiLast !== null) t += 'RSI (14) bei ' + fnum(rsiLast, 0) + '. ';
    if (macdLast !== null && sigLast !== null) t += 'MACD ' + (macdLast > sigLast ? 'über' : 'unter') + ' Signallinie. ';
    if (mom3m !== null) t += 'Momentum 3M ' + P(mom3m) + '.';
    return t.trim();
  }

  function stockBlock(s) {
    var u = findUniverse(s.ticker);
    var hasU = !!u;
    u = u || {};
    var prof = s.profile || {}, q = s.quote || {}, r = s.ratios || {}, an = s.analysts || {};
    var tg = an.targets || {};
    var rec = (an.recommendations && an.recommendations.breakdown) || {};
    var price = q.price;
    var sector = prof.sector || u.sector;
    var sm = sectorMedianPe(sector);

    var pe = nn(r.peTrailing) ? r.peTrailing : u.pe;
    var upside = nn(u.upside) ? u.upside : ((nn(tg.mean) && price > 0) ? (tg.mean / price - 1) * 100 : null);
    var recTotal = 0;
    Object.keys(rec).forEach(function (k) { recTotal += Number(rec[k]) || 0; });
    var buyPct = nn(u.buyPct) ? u.buyPct : (recTotal > 0 ? (((rec.strongBuy || 0) + (rec.buy || 0)) / recTotal) * 100 : null);
    var cnt = nn(tg.analystCount) ? tg.analystCount : u.analystCount;
    var earn = an.nextEarningsDate || u.nextEarningsDate;
    var lo = q.fiftyTwoWeekLow, hi = q.fiftyTwoWeekHigh;
    var rangePos = nn(u.rangePos) ? u.rangePos : ((nn(lo) && nn(hi) && hi > lo && price > 0) ? ((price - lo) / (hi - lo)) * 100 : null);
    var upd = u.updatedAt || s.updatedAt;

    var L = [];
    L.push('### ' + (prof.name || s.ticker) + ' (' + s.ticker + ') ###');
    L.push('- Einordnung: Sektor ' + (sector || NA) + ', Branche ' + (prof.industry && prof.industry !== 'N/A' ? prof.industry : (u.industry || NA)) +
           ', Land ' + (prof.country || u.country || NA) + ', Marktkapitalisierung ' + MC(q.marketCap) +
           (upd ? ', Datenstand ' + dateDe(upd) : ''));
    L.push('- Kurs: ' + E(price) + ' (Änderung heute: ' + P(q.changePercent, 2) + ')');
    L.push('- Bewertung: KGV (Trailing) ' + N(pe, 1) + ', Forward-KGV ' + N(r.peForward, 1) + ', PEG ' + N(r.pegRatio, 2) +
           (sm ? ', Sektor-Median-KGV ' + N(sm.v, 1) + ' (' + sm.n + ' Aktien im Sektor)' : ''));
    L.push('- Wachstum & Qualität: Umsatzwachstum (YoY) ' + F(r.revenueGrowth) + ', Nettomarge ' + F(r.profitMargins) +
           ', operative Marge ' + F(r.operatingMargins) + ', Bruttomarge ' + F(r.grossMargins) +
           ', Eigenkapitalrendite (ROE) ' + F(r.returnOnEquity) + ', Gesamtkapitalrendite (ROA) ' + F(nn(r.returnOnAssets) ? r.returnOnAssets : u.roa));
    L.push('- Bilanz: Schulden/EBITDA ' + N(r.debtToEbitda, 1) + ', Verschuldung/Eigenkapital ' + N(r.debtToEquity, 0, ' %'));
    L.push('- Dividende: Rendite ' + P(r.dividendYield, 2) + ', Ausschüttungsquote ' + F(r.payoutRatio, 0));
    L.push('- Analysten: mittleres Kursziel ' + E(tg.mean) + ' (Spanne ' + E(tg.low) + ' bis ' + E(tg.high) + '), Potenzial ' + P(upside) +
           ', ' + (nn(cnt) ? fnum(cnt, 0) + ' Analysten' : 'Analystenzahl ' + NA) + ', Kaufempfehlung ' + (nn(buyPct) ? 'bei ' + P(buyPct, 0) + ' der Analysten' : NA) + ', nächste Zahlen am ' + (earn ? dateDe(earn) : NA));
    L.push('- Kursverlauf: Lage in der 52-Wochen-Spanne ' + N(rangePos, 0, ' %') + ' (Tief ' + E(lo) + ', Hoch ' + E(hi) + '), Performance 1W ' + P(u.perf1w) +
           ', 1M ' + P(u.perf1m) + ', 3M ' + P(u.perf3m) + ', YTD ' + P(u.perfYtd) + ', 1J ' + P(u.perf52w) +
           ', RS-Rating ' + N(u.rsRating, 0, ' von 99'));

    var tech = techLine(s);
    if (tech) L.push('- Technisches Bild: ' + tech);

    var sig = [];
    if (u.cross && nn(u.crossDaysAgo)) sig.push((u.cross === 'golden' ? 'Golden Cross' : 'Death Cross') + ' (SMA50/200) vor ' + u.crossDaysAgo + ' Handelstagen');
    if (Array.isArray(u.chartPatterns)) {
      var pats = u.chartPatterns.filter(function (x) { return x !== 'golden_cross' && x !== 'death_cross'; })
                                .map(function (x) { return PATTERN_NAMES[x] || x; });
      if (pats.length) sig.push('Chartmuster: ' + pats.join(', '));
    }
    if (hasU) {
      var bt = u.bottom === 'base' ? 'Bodenbildung möglich'
             : u.bottom === 'knife' ? 'Fallendes Messer (Abwärtstrend noch intakt)'
             : u.bottom === 'wait' ? 'unklar, abwarten'
             : 'kein Signal';
      sig.push('Boden-Check: ' + bt);
    }
    if (nn(u.rrCrv)) {
      sig.push('Chance/Risiko (CRV) ' + N(u.rrCrv, 1) + ', Stop-Abstand ' + P(u.rrStopPct) + ' (Stop knapp unter dem 60-Tage-Tief), Ziel-Abstand ' + P(u.rrTgtPct));
    }
    if (sig.length) L.push('- Signale: ' + sig.join('. ') + '.');

    var nl = window.App.News && window.App.News.indexLine(s.ticker);
    if (nl) L.push('- ' + nl);
    return L.join('\n');
  }

  function buildGeminiPrompt(stocks) {
    var today = new Date().toLocaleDateString('de-DE');
    var head =
      'Du bist ein erfahrener Aktienanalyst. Datum: ' + today + '. Alle Preise in EUR.\n\n' +
      'AUFGABE: Vergleiche die folgenden ' + stocks.length + ' Aktien. Sage mir, welche aktuell am besten für einen Einstieg geeignet ist ' +
      'und wie sich das langfristige Potenzial der Unternehmen entwickeln könnte.\n\n' +
      'REGELN:\n' +
      '- Prüfe zuerst kurz die Plausibilität der Daten (Ausreißer, widersprüchliche Werte).\n' +
      '- Nutze für Kennzahlen ausschließlich die Zahlen unten. Steht dort "unbekannt", sage das ausdrücklich und rate nicht. ' +
      'Eigenes Wissen nur zur qualitativen Einordnung des Geschäftsmodells, ohne neue Kennzahlen zu nennen.\n' +
      '- Bewerte KGV, Margen und Verschuldung relativ zum Sektor. Aktien aus verschiedenen Sektoren nicht allein über das KGV vergleichen.\n\n' +
      'LEGENDE: Lage in der 52-Wochen-Spanne: 0 % = Jahrestief, 100 % = Jahreshoch. RS-Rating: Perzentil der 3-Monats-Performance im gesamten ' +
      'Aktienuniversum der App (99 = stärkste). CRV = Chance/Risiko-Verhältnis. Boden-Check: "Bodenbildung" = mindestens 20 % unter dem 52W-Hoch und ' +
      'mindestens 4 von 6 Stabilisierungssignalen; "Fallendes Messer" = mindestens 20 % unter dem Hoch, höchstens 2 von 6 Signalen. ' +
      'News-Stimmung: Skala der App, positiv bis negativ.\n\n' +
      'AUSGABE: 1) Kurze Datenprüfung. 2) Tabelle mit Rangfolge (Bewertung, Qualität, Technik, Risiko). 3) Je Aktie Pro und Contra in 2 bis 3 Stichpunkten. ' +
      '4) Einstiegsidee mit Risiko (Stop-Abstand aus den Daten). 5) Langfristiges Potenzial und die wichtigsten Risiken. ' +
      '6) Hinweis, dass dies keine Anlageberatung ist.\n\n' +
      'DATEN:\n\n';
    return head + stocks.map(stockBlock).join('\n\n') + '\n';
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text)
        .then(function () { return true; })
        .catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  // Kurze Prompts gehen direkt per URL an Gemini. Lange Prompts (URL-Limit) werden kopiert.
  var MAX_ENCODED_URL_PROMPT = 6000;

  function openGemini(btn, stocks) {
    var promptText = buildGeminiPrompt(stocks);
    var enc = encodeURIComponent(promptText);
    var viaUrl = enc.length <= MAX_ENCODED_URL_PROMPT;
    var base = 'https://gemini.google.com/app';

    copyText(promptText).then(function (ok) {
      var url = base;
      if (viaUrl || !ok) url += '?q=' + enc;   // Fallback: Kopieren ging nicht -> lieber gekürzt per URL
      window.open(url, '_blank');
      if (!viaUrl && ok) {
        var old = btn.textContent;
        btn.textContent = 'Kopiert – in Gemini einfügen';
        setTimeout(function () { btn.textContent = old; }, 5000);
      }
    });
  }

  function bindPeriodPillEvents(stocks) {
    var pills = document.querySelectorAll('#compare-period-pills .pill-btn');
    pills.forEach(function (pill) {
      pill.onclick = function () {
        pills.forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        currentPeriod = pill.getAttribute('data-period');
        initNormalizedPerformanceChart(stocks);
      };
    });
  }

  function renderMatrixTable(stocks) {
    var rows = [
      { label: 'Aktueller Kurs', fn: function (s) { return window.App.Format.currency(s.quote ? s.quote.price : 0, s.quote ? s.quote.currency : 'EUR'); } },
      { label: 'Marktkapitalisierung', fn: function (s) { return window.App.Format.compactNumber(s.quote ? s.quote.marketCap : 0, s.quote ? s.quote.currency : 'EUR'); } },
      { label: 'KGV (Trailing)', fn: function (s) { return window.App.Format.number(s.ratios ? s.ratios.peTrailing : null, 1); } },
      { label: 'Forward KGV', fn: function (s) { return window.App.Format.number(s.ratios ? s.ratios.peForward : null, 1); } },
      { label: 'PEG Ratio', fn: function (s) { return window.App.Format.number(s.ratios ? s.ratios.pegRatio : null, 2); } },
      { label: 'Dividendenrendite', fn: function (s) { return window.App.Format.percent(s.ratios ? (s.ratios.dividendYield || 0) : 0, false, 2); } },
      { label: 'Umsatzwachstum YoY', fn: function (s) { return window.App.Format.percent(s.ratios ? ((s.ratios.revenueGrowth || 0) * 100) : 0, true, 1); } },
      { label: 'Nettomarge', fn: function (s) { return window.App.Format.percent(s.ratios ? ((s.ratios.profitMargins || 0) * 100) : 0, false, 1); } },
      { label: 'Eigenkapitalrendite (ROE)', fn: function (s) { return window.App.Format.percent(s.ratios ? ((s.ratios.returnOnEquity || 0) * 100) : 0, false, 1); } },
      { label: 'Debt to Equity', fn: function (s) { return window.App.Format.number(s.ratios ? s.ratios.debtToEquity : null, 1) + ' %'; } }
    ];

    var html = '<table class="data-table"><thead><tr><th>Kennzahl</th>';
    stocks.forEach(function (s, idx) {
      var color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
      html += '<th style="text-align: right; color: ' + color + ';">' + s.ticker + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr><td style="color: var(--text-muted);">' + r.label + '</td>';
      stocks.forEach(function (s) {
        html += '<td style="text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;">' + r.fn(s) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function initRadarChart(stocks) {
    var canvas = document.getElementById('compare-radar-canvas');
    var legend = document.getElementById('compare-radar-legend');
    if (!canvas) return;

    // FIX: Neue Kategorien und kein getPeriod() mehr
    var axes = ['Fundament', 'Technik', 'Analysten', 'SmartMoney', 'Score'];
    var series = [];

    stocks.forEach(function (s, idx) {
      var color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
      var scoreData = window.App.Score.calculateBaseTotalScore(s);
      var cats = scoreData.categories || [];
      
      function getScore(catName) {
          var cat = cats.find(function (c) { return c.category === catName; });
          return cat ? cat.score : 0;
      }

      series.push({
        name: s.ticker,
        color: color,
        values: [
            getScore('Fundamentaldaten'),
            getScore('Technisches Bild'),
            getScore('Analysten-Konsens'),
            getScore('Smart Money & News'),
            scoreData.totalScore
        ]
      });
    });

    window.App.Charts.renderRadarChart(canvas, { axes: axes, series: series });

    if (legend) {
      var legHtml = '';
      series.forEach(function (sr) {
        legHtml += '<div class="legend-item"><span class="legend-dot" style="background:' + sr.color + ';"></span><span>' + sr.name + '</span></div>';
      });
      legend.innerHTML = legHtml;
    }
  }

  function initNormalizedPerformanceChart(stocks) {
    var canvas = document.getElementById('compare-perf-canvas');
    var legendContainer = document.getElementById('compare-chart-legend');
    if (!canvas) return;

    var targetDays = 260;
    if (currentPeriod === '1W') targetDays = 5;
    else if (currentPeriod === '1M') targetDays = 22;
    else if (currentPeriod === '3M') targetDays = 65;
    else if (currentPeriod === '6M') targetDays = 130;
    else if (currentPeriod === '1Y') targetDays = 260;

    var minLen = targetDays;
    stocks.forEach(function (s) {
      var hist = s.chartHistory || [];
      if (hist.length > 0 && hist.length < minLen) minLen = hist.length;
    });
    
    if (minLen === 0) {
      canvas.parentElement.innerHTML = '<div class="state-box" style="padding:20px;"><p style="font-size:0.78rem;color:var(--text-dim);">Keine Kursdaten für diese Aktien verfügbar. Bitte die Daten-Pipeline aktualisieren.</p></div>';
      return;
    }

    var labels = [];
    var baseDateList = (stocks[0].chartHistory || []).slice(-minLen);
    baseDateList.forEach(function (pt) {
      labels.push(pt.date ? pt.date.slice(5, 7) + '/' + pt.date.slice(2, 4) : '');
    });

    var seriesData = [];
    stocks.forEach(function (s, sIdx) {
      var hist = (s.chartHistory || []).slice(-minLen);
      var basePrice = hist[0] ? hist[0].close : 1;
      var normVals = hist.map(function (pt) {
        return basePrice > 0 ? (pt.close / basePrice) * 100 : 100;
      });
      seriesData.push({
        ticker: s.ticker,
        color: COLOR_PALETTE[sIdx % COLOR_PALETTE.length],
        values: normVals
      });
    });

    if (seriesData.length > 0) {
      window.App.Charts.renderMultiLineChart(canvas, {
        labels: labels,
        series: seriesData.map(function (sd) { return { name: sd.ticker, color: sd.color, values: sd.values }; }),
        formatY: function (v) { return v.toFixed(0) + ' %'; }
      });
    }

    if (legendContainer) {
      var legHtml = '';
      seriesData.forEach(function (s) {
        legHtml += '<div class="legend-item"><span class="legend-dot" style="background:' + s.color + ';"></span><span>' + s.ticker + '</span></div>';
      });
      legendContainer.innerHTML = legHtml;
    }
  }

  function initMarginsBarChart(stocks) {
    var canvas = document.getElementById('compare-margins-canvas');
    if (!canvas || stocks.length === 0) return;
    var labels = ['Bruttomarge', 'Operativ', 'Nettomarge'];
    var series = stocks.map(function (s, idx) {
      var r = s.ratios || {};
      return {
        name: s.ticker,
        color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
        data: [(r.grossMargins || 0) * 100, (r.operatingMargins || 0) * 100, (r.profitMargins || 0) * 100]
      };
    });
    window.App.Charts.renderGroupedBarChart(canvas, {
      labels: labels, series: series,
      formatY: function (v) { return v.toFixed(0) + ' %'; }
    });
  }

  return { initView: initView, _buildGeminiPrompt: buildGeminiPrompt };
})();
/**
 * js/stock-overview.js
 * Verwaltet den Tab "Overview".
 * NEU: Pre-Market-Karte (US-Vorbörse vs. Xetra) zwischen Kennzahlen und Chart.
 * FIX: drawFinancialsChart filtert zukünftige Daten und unterstützt camelCase.
 * NEU: Gemini-Prompt an compare.js angeglichen (strukturierter Datenblock,
 *      Copy-Fallback, URL-Längenprüfung, Button-Feedback).
 * NEU: News.promptBlock (FinBERT) + ChartAnalyse.promptText wieder integriert.
 * NEU: Reddit-Karte & Reddit-Prompt (ApeWisdom & Tradestie) integriert.
 */

window.App = window.App || {};

window.App.StockOverview = (function () {
  'use strict';

  var PROXY_URL = "https://yahoo-proxy.spamispam018.workers.dev";

  var currentStock = null;
  var currentPeriod = '1Y';
  var longHistory = null;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function render(container, stock) {
    if (!container || !stock) return;
    currentStock = stock;

    try {
      // Gespeicherte Kurse (Detail-Button oder Markt-Button) – gemeinsamer Speicher
      var cachedLive = window.App.Live && window.App.Live.getEntry(stock.ticker);
      if (cachedLive && cachedLive.price > 0 && cachedLive.ts > new Date(stock.updatedAt).getTime()) {
        stock.quote.price = cachedLive.price;
        stock.quote.changePercent = cachedLive.changePercent;
        stock.quote.currency = 'EUR';
        stock.updatedAt = new Date(cachedLive.ts).toISOString();
        currentStock.livePrice = cachedLive.price;
      } else if (cachedLive && cachedLive.price > 0 && stock.livePrice) {
        currentStock.livePrice = stock.livePrice;
      }
    } catch (e) {}

    var quote = stock.quote || {};
    var ratios = stock.ratios || {};
    var insider = stock.insider || { summary: {}, trades: [] };
    var financials = stock.financials || {};
    var holdings = stock.holdings || [];

    var isDataMissing = !quote.price || quote.price <= 0;

    var peTrailingDisplay;
    if (ratios.peTrailing !== null && ratios.peTrailing !== undefined && ratios.peTrailing > 0) {
      peTrailingDisplay = window.App.Format.number(ratios.peTrailing, 1);
    } else if (ratios.peForward || ratios.profitMargins < 0) {
      peTrailingDisplay = '<span style="color: var(--bearish); font-size: 0.78rem; font-weight: 600;">Negativ (Verlust)</span>';
    } else {
      peTrailingDisplay = '—';
    }

    var forwardPeDisplay = (ratios.peForward && ratios.peForward > 0) ? window.App.Format.number(ratios.peForward, 1) : '—';
    var divYieldDisplay = (ratios.dividendYield !== null && ratios.dividendYield !== undefined && ratios.dividendYield > 0) ? window.App.Format.number(ratios.dividendYield, 2) + ' %' : '0,00 %';

    var updatedAtDisplay = 'Unbekannt';
    if (stock.updatedAt) {
      var d = new Date(stock.updatedAt);
      if (!isNaN(d.getTime())) {
        updatedAtDisplay = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' +
                           d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
      }
    }

    var html = '' +
      '<!-- KI-Analyse mit Gemini -->' +
      '<div class="card" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%); border: 1px solid var(--accent-purple); padding: 14px; margin-bottom: 8px;">' +
        '<div style="display: flex; justify-content: space-between; align-items: center;">' +
          '<div style="flex: 1; padding-right: 12px;">' +
            '<div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main); margin-bottom: 2px; display: flex; align-items: center; gap: 6px;">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple-light)" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>' +
              'KI-Analyse' +
            '</div>' +
            '<div style="font-size: 0.72rem; color: var(--text-muted);">Frage Gemini nach den Gründen für die Kursentwicklung und einer Bewertung.</div>' +
          '</div>' +
          '<button id="btn-ask-gemini" class="chip-btn active" style="background: var(--accent-purple); border-color: var(--accent-purple); font-size: 0.75rem; flex-shrink: 0; box-shadow: 0 4px 14px var(--accent-purple-glow);" ' + (isDataMissing ? 'disabled style="opacity:0.5;box-shadow:none;"' : '') + '>Fragen</button>' +
        '</div>' +
      '</div>' +

      '<!-- Daten aktualisieren Button & Zeitstempel -->' +
      '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">' +
        '<div id="stock-updated-at" style="font-size: 0.7rem; color: var(--text-dim);">Stand: ' + updatedAtDisplay + '</div>' +
        '<button id="btn-refresh-stock" class="chip-btn" style="font-size: 0.72rem; display: flex; align-items: center; gap: 6px;">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>' +
          'Live-Kurs abrufen' +
        '</button>' +
      '</div>' +

      (isDataMissing ? '<div class="card" style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--bearish); padding: 16px; margin-bottom: 14px; text-align: center;">' +
        '<div style="font-size: 1.1rem; font-weight: 700; color: var(--bearish); margin-bottom: 4px;">Keine Kursdaten verfügbar</div>' +
        '<div style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">Bitte klicke oben auf <b>Live-Kurs abrufen</b>, um die Daten neu zu ziehen.</div>' +
      '</div>' : '') +

      '<div id="news-card"></div>' +
      '<div id="reddit-card" style="margin-bottom: 14px;"></div>' +
      renderEtfHoldingsHtml(holdings) +
      renderMetricsHtml(quote, ratios, peTrailingDisplay, forwardPeDisplay, divYieldDisplay, isDataMissing) +

      (!isDataMissing ?
      '<!-- NEU: Pre-Market-Karte (US-Vorbörse vs. Xetra) -->' +
      '<div id="pm-slot"></div>' +

      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Kursverlauf</span>' +
          '<div class="pill-group" id="overview-period-pills">' +
            '<button class="pill-btn ' + (currentPeriod === '1W' ? 'active' : '') + '" data-period="1W">1W</button>' +
            '<button class="pill-btn ' + (currentPeriod === '1M' ? 'active' : '') + '" data-period="1M">1M</button>' +
            '<button class="pill-btn ' + (currentPeriod === '3M' ? 'active' : '') + '" data-period="3M">3M</button>' +
            '<button class="pill-btn ' + (currentPeriod === '6M' ? 'active' : '') + '" data-period="6M">6M</button>' +
            '<button class="pill-btn ' + (currentPeriod === '1Y' ? 'active' : '') + '" data-period="1Y">1J</button>' +
            '<button class="pill-btn ' + (currentPeriod === '5Y' ? 'active' : '') + '" data-period="5Y">5J</button>' +
            '<button class="pill-btn ' + (currentPeriod === '10Y' ? 'active' : '') + '" data-period="10Y">10J</button>' +
          '</div>' +
        '</div>' +
        '<div style="height: 180px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="overview-price-canvas"></canvas>' +
        '</div>' +
        '<div class="perf-grid" id="overview-perf-grid"></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Insider Activity</span>' +
          '<span class="period-tag">Letzte 2Q</span>' +
          '<span style="margin-left: auto; font-size: 0.75rem; font-weight: 700; color: ' + getSentimentColor(insider.summary.sentiment) + ';">' + (insider.summary.sentiment || 'Neutral') + '</span>' +
        '</div>' +
        renderInsiderSummaryBar(insider.summary) +
        '<div style="margin-top: 10px; font-size: 0.75rem; color: var(--text-dim); text-align: right;">' +
          '<a href="#/stock/' + stock.ticker + '/insider" style="color: var(--accent-purple-light); text-decoration: none; font-weight: 600;">View Insider Tab &rarr;</a>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Financials Trend</span>' +
          '<span class="period-tag">TTM / Quartale</span>' +
        '</div>' +
        '<div style="height: 160px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="overview-financials-canvas"></canvas>' +
        '</div>' +
      '</div>' : '');

    container.innerHTML = html;

    if (window.App.News) {
      window.App.News.fillTicker(
        stock.ticker, 
        container.querySelector('#news-card'),
        container.querySelector('#reddit-card')
      );
    }

    // NEU: Pre-Market-Karte rendern (nur bei US-Tickern und wenn Daten vorhanden)
    if (window.App.PreMarket && !isDataMissing) {
      var pmSlot = container.querySelector('#pm-slot');
      if (pmSlot) window.App.PreMarket.render(pmSlot, stock);
    }

    // Gemini Event Listener
    var geminiBtn = container.querySelector('#btn-ask-gemini');
    if (geminiBtn && !isDataMissing) {
      geminiBtn.onclick = function () { openGemini(geminiBtn, currentStock); };
    }

    // Live-Kurs über Cloudflare Proxy abrufen
    var refreshBtn = container.querySelector('#btn-refresh-stock');
    if (refreshBtn) {
      refreshBtn.onclick = function () {
        var originalHtml = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<div class="spinner" style="width: 14px; height: 14px; border-width: 2px; display: inline-block; vertical-align: middle; margin-right: 6px;"></div> Lade...';
        refreshBtn.disabled = true;

        var dateEl = document.getElementById('stock-updated-at');
        if (dateEl) dateEl.innerHTML = '<span style="color:var(--accent-purple-light);">Rufe Live-Daten ab...</span>';

        fetch(PROXY_URL + '/?ticker=' + encodeURIComponent(currentStock.ticker) + '&t=' + Date.now())
          .then(function(res) {
            if (!res.ok) throw new Error("HTTP Fehler beim Aktienkurs: " + res.status);
            return res.json();
          })
          .then(function(data) {
            if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
              throw new Error("Yahoo lieferte keine Daten für diesen Ticker.");
            }

            var result = data.chart.result[0];
            var meta = result.meta;

            var livePrice = null;
            var livePct = null;

            try {
              var quotes = result.indicators.quote[0];
              if (quotes && quotes.close && quotes.close.length > 0) {
                for (var i = quotes.close.length - 1; i >= 0; i--) {
                  if (quotes.close[i] !== null) {
                    livePrice = quotes.close[i];
                    break;
                  }
                }
              }
            } catch(e) {}

            if (!livePrice) livePrice = meta.regularMarketPrice;
            if (!livePrice) throw new Error("Kein Kurs gefunden.");

            var prevClose = meta.chartPreviousClose || meta.previousClose || livePrice;
            livePct = ((livePrice - prevClose) / prevClose) * 100;
            var currency = meta.currency;

            if (currency !== 'EUR') {
              var pair = 'EUR' + currency + '=X';
              return fetch(PROXY_URL + '/?ticker=' + encodeURIComponent(pair) + '&t=' + Date.now())
                .then(function(res) { return res.json(); })
                .then(function(fxData) {
                  var fxRate = fxData.chart.result[0].meta.regularMarketPrice;
                  var priceInEur = livePrice / fxRate;
                  return { price: priceInEur, pct: livePct };
                });
            } else {
              return { price: livePrice, pct: livePct };
            }
          })
          .then(function(finalData) {
            var now = new Date();

            currentStock.livePrice = finalData.price;

            try {
              if (window.App.Live) window.App.Live.storeLive(currentStock.ticker, finalData.price, finalData.pct);
            } catch (e) {}

            var priceEl = document.getElementById('stock-header-price');
            var changeEl = document.getElementById('stock-header-change');

            if (priceEl && changeEl) {
              priceEl.textContent = window.App.Format.currency(finalData.price, 'EUR');
              var chgCls = window.App.Format.changeClass(finalData.pct);
              var sign = finalData.pct >= 0 ? '+' : '';
              changeEl.className = 'badge-pill ' + chgCls;
              changeEl.textContent = sign + window.App.Format.number(finalData.pct, 2) + ' %';
            }

            currentStock.quote.price = finalData.price;
            currentStock.quote.changePercent = finalData.pct;
            currentStock.quote.currency = 'EUR';
            currentStock.updatedAt = now.toISOString();

            if (dateEl) {
              var timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
              dateEl.innerHTML = '<span style="color:var(--bullish); font-weight:700;">✓ Erfolgreich aktualisiert (' + timeStr + ' Uhr)</span>';
            }

            drawPriceChart();
            updatePerfGrid();

            refreshBtn.innerHTML = originalHtml;
            refreshBtn.disabled = false;
          })
          .catch(function(err) {
            console.error('Live-Kurs Fehler:', err);
            refreshBtn.innerHTML = originalHtml;
            refreshBtn.disabled = false;
            if (dateEl) dateEl.textContent = 'Stand: Fehler beim Laden';

            var msg = err.message;
            if (msg === 'Failed to fetch') msg = "Netzwerkfehler. Bitte Verbindung prüfen.";
            alert('Live-Kurs Fehler:\n' + msg);
          });
      };
    }

    if (!isDataMissing) {
        longHistory = null;
        drawPriceChart();
        updatePerfGrid();
        drawFinancialsChart(financials);
        bindPeriodPillEvents(container);

        var loadingTicker = stock.ticker;
        window.App.Data.getLongHistory(loadingTicker).then(function (pts) {
          if (!currentStock || currentStock.ticker !== loadingTicker) return;
          longHistory = pts || [];
          updatePerfGrid();
          if (currentPeriod === '5Y' || currentPeriod === '10Y') drawPriceChart();
        });
    }
  }

  // =====================================================================
  // KI-Prompt (Gemini) — an compare.js angeglichen
  // + wieder integriert: News.promptBlock (FinBERT) & ChartAnalyse.promptText
  // =====================================================================
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
  function P(v, d) { return nn(v) ? fnum(v, d === undefined ? 1 : d) + ' %' : NA; }
  function F(v, d) { return nn(v) ? fnum(v * 100, d === undefined ? 1 : d) + ' %' : NA; }
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
  function findUniverseItem(ticker, universe) {
    if (!Array.isArray(universe)) return null;
    for (var i = 0; i < universe.length; i++) {
      if (universe[i].ticker === ticker) return universe[i];
    }
    return null;
  }
  function sectorMedianPeFor(sector, universe) {
    if (!sector || !Array.isArray(universe)) return null;
    var arr = universe.filter(function (x) { return x.sector === sector && x.pe > 0 && x.pe < 500; })
                     .map(function (x) { return x.pe; });
    return arr.length >= 5 ? { v: medianOf(arr), n: arr.length } : null;
  }

  function techLineFor(s) {
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

  function stockBlock(s, universe) {
    var u = findUniverseItem(s.ticker, universe);
    var hasU = !!u;
    u = u || {};
    var prof = s.profile || {}, q = s.quote || {}, r = s.ratios || {}, an = s.analysts || {};
    var tg = an.targets || {};
    var rec = (an.recommendations && an.recommendations.breakdown) || {};
    var price = q.price;
    var sector = prof.sector || u.sector;
    var sm = sectorMedianPeFor(sector, universe);

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

    var tech = techLineFor(s);
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

    // WICHTIG: Ausführlicher News-Block mit FinBERT-Stimmung (wie im Original)
    var nws = (window.App.News && window.App.News.promptBlock)
      ? window.App.News.promptBlock(s.ticker, 5)
      : '';
    if (nws) {
      L.push('- Aktuelle Nachrichten (englisch, mit automatischer FinBERT-Stimmungseinschätzung):');
      String(nws).split('\n').forEach(function (line) {
        if (line.trim()) L.push('  ' + line);
      });
    }

    // NEU: Reddit-Stimmung aus ApeWisdom & Tradestie hinzufügen
    var redditInfo = (window.App.News && window.App.News.redditLine)
      ? window.App.News.redditLine(s.ticker)
      : '';
    if (redditInfo) {
      L.push('- ' + redditInfo);
    }

    return L.join('\n');
  }

  function buildGeminiPrompt(stock, universe) {
    var today = new Date().toLocaleDateString('de-DE');
    var head =
      'Du bist ein erfahrener Aktienanalyst. Datum: ' + today + '. Alle Preise in EUR.\n\n' +
      'AUFGABE: Erkläre die aktuelle Kursentwicklung der folgenden Aktie und bewerte sie. ' +
      'Sage mir, ob die Aktie aktuell für einen Einstieg geeignet ist und wie sich das langfristige Potenzial des Unternehmens entwickeln könnte. ' +
      'Beziehe die aktuellen Nachrichten in deine Erklärung und Bewertung ein.\n\n' +
      'REGELN:\n' +
      '- Prüfe zuerst kurz die Plausibilität der Daten (Ausreißer, widersprüchliche Werte).\n' +
      '- Nutze für Kennzahlen ausschließlich die Zahlen unten. Steht dort "unbekannt", sage das ausdrücklich und rate nicht. ' +
      'Eigenes Wissen nur zur qualitativen Einordnung des Geschäftsmodells, ohne neue Kennzahlen zu nennen.\n' +
      '- Bewerte KGV, Margen und Verschuldung relativ zum Sektor.\n\n' +
      'LEGENDE: Lage in der 52-Wochen-Spanne: 0 % = Jahrestief, 100 % = Jahreshoch. RS-Rating: Perzentil der 3-Monats-Performance im gesamten ' +
      'Aktienuniversum der App (99 = stärkste). CRV = Chance/Risiko-Verhältnis. Boden-Check: "Bodenbildung" = mindestens 20 % unter dem 52W-Hoch und ' +
      'mindestens 4 von 6 Stabilisierungssignalen; "Fallendes Messer" = mindestens 20 % unter dem Hoch, höchstens 2 von 6 Signalen. ' +
      'News-Stimmung: Skala der App, positiv bis negativ.\n\n' +
      'AUSGABE: 1) Kurze Datenprüfung. 2) Erklärung der aktuellen Kursbewegung. 3) Bewertung (Bewertung, Qualität, Technik, Risiko). ' +
      '4) Pro und Contra in 2 bis 3 Stichpunkten. 5) Einstiegsidee mit Risiko (Stop-Abstand aus den Daten). 6) Langfristiges Potenzial und die wichtigsten Risiken. ' +
      '7) Hinweis, dass dies keine Anlageberatung ist.\n\n' +
      'DATEN:\n\n';

    var body = stockBlock(stock, universe || []);

    // WICHTIG: Chartmuster-Analyse aus ChartAnalyse (wie im Original)
    var chartText = '';
    if (window.App.ChartAnalyse && typeof window.App.ChartAnalyse.promptText === 'function') {
      try {
        var ca = window.App.ChartAnalyse.promptText(stock);
        if (ca) chartText = '\nChartmuster-Analyse:\n' + ca + '\n';
      } catch (e) { /* defensiv ignorieren */ }
    }

    return head + body + chartText + '\n';
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

  function openGemini(btn, stock) {
    var universePromise = (window.App.Data && window.App.Data.getUniverse)
      ? window.App.Data.getUniverse().catch(function () { return []; })
      : Promise.resolve([]);

    universePromise.then(function (universe) {
      var promptText = buildGeminiPrompt(stock, universe || []);
      var enc = encodeURIComponent(promptText);
      var viaUrl = enc.length <= MAX_ENCODED_URL_PROMPT;
      var base = 'https://gemini.google.com/app';

      copyText(promptText).then(function (ok) {
        var url = base;
        if (viaUrl || !ok) url += '?q=' + enc;   // Fallback: Kopieren ging nicht -> lieber per URL
        window.open(url, '_blank');
        if (!viaUrl && ok) {
          var old = btn.textContent;
          btn.textContent = 'Kopiert – in Gemini einfügen';
          setTimeout(function () { btn.textContent = old; }, 5000);
        }
      });
    });
  }

  // =====================================================================
  // HTML-Renderer (unverändert)
  // =====================================================================

  function renderMetricsHtml(quote, ratios, peTrailingDisplay, forwardPeDisplay, divYieldDisplay, isDataMissing) {
    return '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Bewertungs- &amp; Marktkennzahlen</span>' +
          '<span class="period-tag">Aktuell</span>' +
        '</div>' +
        '<div class="metrics-grid-2col">' +
          '<div class="metric-cell"><span class="metric-label">Marktkapitalisierung:</span><span class="metric-value">' + window.App.Format.compactNumber(quote.marketCap, quote.currency) + '</span></div>' +
          '<div class="metric-cell"><span class="metric-label">KGV (Trailing):</span><span class="metric-value">' + peTrailingDisplay + '</span></div>' +
          '<div class="metric-cell"><span class="metric-label">Forward KGV:</span><span class="metric-value">' + forwardPeDisplay + '</span></div>' +
          '<div class="metric-cell"><span class="metric-label">Dividendenrendite:</span><span class="metric-value">' + divYieldDisplay + '</span></div>' +
          '<div class="metric-cell"><span class="metric-label">52W Tief:</span><span class="metric-value">' + window.App.Format.currency(quote.fiftyTwoWeekLow, quote.currency) + '</span></div>' +
          '<div class="metric-cell"><span class="metric-label">52W Hoch:</span><span class="metric-value">' + window.App.Format.currency(quote.fiftyTwoWeekHigh, quote.currency) + '</span></div>' +
        '</div>' +
        (!isDataMissing ? renderFiftyTwoWeekRange(quote.price, quote.fiftyTwoWeekLow, quote.fiftyTwoWeekHigh, quote.currency) : '') +
      '</div>';
  }

  function renderEtfHoldingsHtml(holdings) {
    if (!holdings || !Array.isArray(holdings) || holdings.length === 0) return '';
    var html = '' +
      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Größte Positionen (Top Holdings)</span>' +
          '<span class="period-tag">ETF Bestand</span>' +
        '</div>' +
        '<div style="display: flex; flex-direction: column; gap: 8px;">';

    holdings.forEach(function (h) {
      var w = Math.max(0, Math.min(100, h.weight || 0));
      html += '' +
        '<div style="display: flex; flex-direction: column; gap: 2px;">' +
          '<div style="display: flex; justify-content: space-between; font-size: 0.78rem;">' +
            '<span style="font-weight: 600; color: var(--text-main);">' + esc(h.name) + '</span>' +
            '<span style="font-variant-numeric: tabular-nums; font-weight: 700;">' + window.App.Format.number(w, 2) + ' %</span>' +
          '</div>' +
          '<div style="height: 6px; width: 100%; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden;">' +
            '<div style="height: 100%; width: ' + w + '%; background: var(--accent-purple-light, #818cf8); border-radius: 3px;"></div>' +
          '</div>' +
        '</div>';
    });

    html += '</div></div>';
    return html;
  }

  function renderFiftyTwoWeekRange(price, low, high, currency) {
    if (!price || !low || !high || high <= low) return '';
    var pct = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
    return '' +
      '<div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--border-subtle);">' +
        '<div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-dim); margin-bottom: 6px;">' +
          '<span>52W-Spanne</span>' +
          '<span>Aktuell: ' + window.App.Format.currency(price, currency) + ' (' + pct.toFixed(0) + ' %)</span>' +
        '</div>' +
        '<div style="height: 6px; width: 100%; background: var(--bg-tertiary); border-radius: 3px; position: relative; overflow: visible;">' +
          '<div style="height: 100%; width: ' + pct + '%; background: linear-gradient(90deg, var(--bearish), var(--bullish)); border-radius: 3px;"></div>' +
          '<div style="position: absolute; left: calc(' + pct + '% - 5px); top: -3px; width: 10px; height: 12px; background: #fff; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.5);"></div>' +
        '</div>' +
      '</div>';
  }

  function renderInsiderSummaryBar(sum) {
    if (!sum) sum = { buysCount2Q: 0, sellsCount2Q: 0, buyValueTotal: 0, sellValueTotal: 0 };
    var buyVal = sum.buyValueTotal || 0;
    var sellVal = sum.sellValueTotal || 0;
    var total = buyVal + sellVal;
    var buyPct = total > 0 ? (buyVal / total) * 100 : 50;
    var sellPct = total > 0 ? (sellVal / total) * 100 : 50;
    return '' +
      '<div style="margin-top: 6px;">' +
        '<div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 6px;">' +
          '<span style="color: var(--bullish); font-weight: 700;">' + sum.buysCount2Q + ' Käufe (' + window.App.Format.compactNumber(buyVal, 'EUR') + ')</span>' +
          '<span style="color: var(--bearish); font-weight: 700;">' + sum.sellsCount2Q + ' Verkäufe (' + window.App.Format.compactNumber(sellVal, 'EUR') + ')</span>' +
        '</div>' +
        '<div style="height: 8px; width: 100%; display: flex; border-radius: 4px; overflow: hidden; background: var(--bg-tertiary);">' +
          '<div style="height: 100%; width: ' + buyPct + '%; background: var(--bullish);"></div>' +
          '<div style="height: 100%; width: ' + sellPct + '%; background: var(--bearish);"></div>' +
        '</div>' +
      '</div>';
  }

  function drawPriceChart() {
    var canvas = document.getElementById('overview-price-canvas');
    if (!canvas || !currentStock) return;

    var filtered = getPeriodSeries(currentPeriod);
    var isLong = (currentPeriod === '5Y' || currentPeriod === '10Y');

    if (filtered === null || filtered.length < 2) {
      var setupCtx = canvas.getContext('2d');
      var w = canvas.parentElement ? canvas.parentElement.clientWidth : 300;
      canvas.width = w; canvas.height = 180;
      canvas.style.width = w + 'px'; canvas.style.height = '180px';
      setupCtx.clearRect(0, 0, w, 180);
      setupCtx.fillStyle = '#64748b';
      setupCtx.font = '12px sans-serif';
      setupCtx.textAlign = 'center';
      setupCtx.fillText(
        isLong && longHistory === null ? 'Lade Langzeitdaten…' : 'Langzeitdaten noch nicht verfügbar (nächstes Update)',
        w / 2, 90
      );
      return;
    }

    var cur = currentStock.quote ? currentStock.quote.currency : 'EUR';

    var chartData = filtered.slice();
    if (currentStock.livePrice) {
      var todayStr = new Date().toISOString().slice(0, 10);
      var lastPoint = chartData[chartData.length - 1];
      if (lastPoint.date < todayStr) {
        chartData.push({ date: todayStr, close: currentStock.livePrice });
      } else {
        lastPoint.close = currentStock.livePrice;
      }
    }

    window.App.Charts.renderLineChart(canvas, {
      labels: chartData.map(function (p) { var d = String(p.date || ''); return d.slice(5, 7) + '/' + d.slice(2, 4); }),
      values: chartData.map(function (p) { return p.close; }),
      formatY: function (v) { return window.App.Format.currency(v, cur, 0); }
    });
  }

  function getPeriodSeries(period) {
    if (period === '5Y' || period === '10Y') {
      if (!longHistory || longHistory.length < 2) return null;
      if (period === '10Y') return longHistory;
      var last = longHistory[longHistory.length - 1].date;
      var cutoff = (parseInt(last.slice(0, 4), 10) - 5) + last.slice(4);
      return longHistory.filter(function (p) { return p.date >= cutoff; });
    }
    return sliceHistoryByPeriod((currentStock && currentStock.chartHistory) || [], period);
  }

  function updatePerfGrid() {
    var grid = document.getElementById('overview-perf-grid');
    if (!grid || !currentStock) return;

    var periods = [['1W', '1W'], ['1M', '1M'], ['3M', '3M'], ['6M', '6M'], ['1Y', '1J'], ['5Y', '5J'], ['10Y', '10J']];
    var html = '';

    grid.style.display = 'flex';
    grid.style.flexWrap = 'wrap';
    grid.style.gap = '8px';

    periods.forEach(function (pd) {
      var series = getPeriodSeries(pd[0]);
      var txt = '—';
      var cls = '';

      if (series && series.length >= 1 && series[0].close) {
        var endPrice = currentStock.livePrice || series[series.length - 1].close;
        var pct = (endPrice / series[0].close - 1) * 100;
        txt = (pct >= 0 ? '+' : '') + window.App.Format.number(pct, 1) + ' %';
        cls = pct >= 0 ? 'up' : 'down';
      } else if ((pd[0] === '5Y' || pd[0] === '10Y') && longHistory === null) {
        txt = '…';
      }

      html += '<div class="perf-cell ' + cls + (pd[0] === currentPeriod ? ' selected' : '') + '" style="flex: 1 1 calc(25% - 8px); min-width: 60px;">' +
        '<span class="perf-label">' + pd[1] + '</span>' +
        '<span class="perf-value">' + txt + '</span></div>';
    });
    grid.innerHTML = html;
  }

  function sliceHistoryByPeriod(history, period) {
    if (!history || history.length === 0) return [];
    var days = { '1W': 7, '1M': 30, '3M': 91, '6M': 182, '1Y': 365 };
    var span = days[period] || 365;
    var last = history[history.length - 1];
    var t = new Date(last.date + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() - span);
    var cutoff = t.toISOString().slice(0, 10);
    var start = 0;
    for (var i = 0; i < history.length; i++) {
      if (history[i].date <= cutoff) start = i; else break;
    }
    return history.slice(start);
  }

  // Finanz-Chart filtert zukünftige Daten & unterstützt camelCase
  function drawFinancialsChart(financials) {
    var canvas = document.getElementById('overview-financials-canvas');
    if (!canvas) return;

    var incQuarterly = (financials.incomeStatement && financials.incomeStatement.quarterly) ? financials.incomeStatement.quarterly : [];

    // 1. Zukünftige Daten herausfiltern und chronologisch sortieren
    var nowStr = new Date().toISOString().slice(0, 10);
    var validData = incQuarterly
      .filter(function(item) {
          return item && item.date && item.date <= nowStr; // Keine Prognosen aus der Zukunft
      })
      .sort(function(a, b) {
          return a.date < b.date ? -1 : 1;
      });

    // 2. Die letzten 6 Quartale nehmen
    var recent = validData.slice(-6);

    if (recent.length === 0) {
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Keine Quartalsfinanzdaten verfügbar', canvas.width / 2, canvas.height / 2);
      return;
    }

    var labels = recent.map(function (item) {
        var d = String(item.date || '');
        return d.length >= 7 ? d.slice(2, 4) + '-' + d.slice(5, 7) : d;
    });

    // 3. Robuster Zugriff (camelCase & snake_case)
    var revenues = recent.map(function (item) {
        var rev = item.TotalRevenue !== undefined ? item.TotalRevenue
                : item.Total_Revenue !== undefined ? item.Total_Revenue
                : item.OperatingRevenue !== undefined ? item.OperatingRevenue
                : item.Operating_Revenue !== undefined ? item.Operating_Revenue
                : 0;
        return Number(rev) || 0;
    });

    window.App.Charts.renderGroupedBarChart(canvas, {
      labels: labels,
      series: [{ name: 'Umsatz', data: revenues, color: 'rgba(99, 102, 241, 0.85)' }],
      formatY: function (v) { return window.App.Format.axisMoney(v); }
    });
  }

  function bindPeriodPillEvents(container) {
    var pills = container.querySelectorAll('#overview-period-pills .pill-btn');
    pills.forEach(function (pill) {
      pill.onclick = function () {
        pills.forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        currentPeriod = pill.getAttribute('data-period');
        drawPriceChart();
        updatePerfGrid();
      };
    });
  }

  function getSentimentColor(sentiment) {
    if (sentiment === 'Bullish') return 'var(--bullish)';
    if (sentiment === 'Bearish') return 'var(--bearish)';
    return 'var(--text-muted)';
  }

  return {
    render: render,
    _buildGeminiPrompt: buildGeminiPrompt   // für Tests/Debug
  };
})();
/**
 * js/app.js
 * Routen, Header und Aktien-Detailansicht.
 *
 * Bedienkonzept:
 * - 4 Bereiche unten (Markt, Entdecken, Watchlist, Depot), Unterseiten über die
 *   Umschalter-Leiste (js/ui.js).
 * - Die Aktien-Detailansicht ist kein eigener Tab mehr, sondern öffnet sich aus
 *   Suche, Listen und Heatmap. Statt 13 Tabs gibt es 5 Bereiche mit einklappbaren Karten.
 * - Alte Links wie #/stock/NVDA/insider funktionieren weiter: Sie öffnen den passenden
 *   Bereich und klappen die Karte auf.
 */
(function () {
  'use strict';

  var App = window.App;
  var headerTitle = document.getElementById('app-header-title');
  var headerSubtitle = document.getElementById('app-header-subtitle');
  var backBtn = document.getElementById('btn-header-back');

  /** Rechtsform-Zusätze entfernen: "Apple Inc." -> "Apple", "Merck & Company, Inc." -> "Merck & Company" */
  function shortName(name) {
    if (!name) return '';
    var orig = String(name).trim();
    var n = orig.replace(/\s*\(the\)\s*$/i, '');
    var re = /[,\s]+(inc\.?|incorporated|corp\.?|corporation|co\.?|company|ltd\.?|limited|plc|ag|se|sa|s\.a\.|n\.v\.|nv|a\/s|kgaa|gmbh|aktiengesellschaft|holdings?|group)$/i;
    for (var i = 0; i < 3; i++) {
      var next = n.replace(re, '').trim();
      // "Merck & Company" nicht zu "Merck &" kürzen
      if (!next || next === n || /(&|\band)$/i.test(next)) break;
      n = next;
    }
    return n || orig;
  }

  function setHeader(title, subtitle, showBack) {
    if (headerTitle) {
      headerTitle.textContent = title;
      headerTitle.title = (detail && detail.fullName && title === detail.title) ? detail.fullName : title;
    }
    if (headerSubtitle) headerSubtitle.textContent = subtitle || '';
    if (backBtn) backBtn.style.display = showBack ? 'inline-flex' : 'none';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------------- Routen der Bereiche ----------------

  function page(path, title, subtitle, init) {
    App.Router.register(path, function (params) {
      setHeader(title, subtitle, false);
      init(params);
    });
  }

  // Entdecken
  page('/screener', 'Entdecken', 'Aktien filtern & finden', function () { App.Screener.initView(); });
  page('/ai', 'Entdecken', 'KI-Vorschläge', function () {
    if (App.AIInsights) App.AIInsights.initView();
  });
  page('/strategies', 'Entdecken', 'Fertige Strategien', function () { App.Strategies.initView(); });
  page('/backtest', 'Entdecken', 'Filter-Performance simulieren', function () { App.Backtest.initView(); });
  page('/compare', 'Entdecken', 'Aktien im Vergleich', function () { App.Compare.initView(); });
  page('/compare/:ticker', 'Entdecken', 'Aktien im Vergleich', function (p) { App.Compare.initView({ ticker: p.ticker }); });

  // Markt
  page('/market', 'Markt', 'Sektoren, Heatmap & Trends', function () { App.Market.initView(); });
  page('/macro', 'Markt', 'Makro-Umfeld', function () {
    var c = document.getElementById('app-view-content');
    if (!c) return;
    if (!App.Macro) { c.innerHTML = '<div class="view-container"><div class="state-box"><p>Modul js/macro.js nicht geladen.</p></div></div>'; return; }
    c.innerHTML = '<div class="view-container">' + App.Macro.html() + '</div>';
    App.Macro.bind();
  });

  // Watchlist
  page('/watchlist', 'Watchlist', 'Favoriten, Alarme & Termine', function () { App.Watchlist.initView(); });
  page('/watchlist/:tab', 'Watchlist', 'Favoriten, Alarme & Termine', function (p) { App.Watchlist.initView(p); });

  // Depot
  page('/portfolio', 'Depot', 'Bestände & Performance', function () { App.Portfolio.initView(); });
  page('/dividends', 'Depot', 'Kalender & Yield on Cost', function () { App.Dividends.initView(); });
  page('/journal', 'Depot', 'Thesen & Notizen', function () { App.Journal.initView(); });

  // ---------------- Aktien-Detailansicht ----------------

  var OPEN_KEY = 'detail_cards_open_v1';

  /**
   * Bereiche und Karten. `bare` = ohne Klapp-Rahmen (Hauptinhalt des Bereichs),
   * `expert` = nur im Experten-Modus sichtbar.
   */
  var SECTIONS = [
    { id: 'ueberblick', label: 'Überblick', cards: [
      { id: 'overview', bare: true, render: function (el, s) { App.StockOverview.render(el, s); } },
      { id: 'score', title: 'Score im Detail', desc: 'Alle Kategorien mit Gewichtung, Begründung und Einzelwerten', render: renderScoreView }
    ] },
    { id: 'chart', label: 'Chart', cards: [
      { id: 'chart', bare: true, render: function (el, s) { App.StockChart.render(el, s); } },
      { id: 'options', title: 'Optionen', desc: 'Optionskette und Put/Call-Verhältnis', expert: true, render: function (el, s) { App.StockOptions.render(el, s); } }
    ] },
    { id: 'fundamental', label: 'Fundamental', cards: [
      { id: 'financials', title: 'Finanzzahlen', desc: 'Umsatz, Gewinn, Margen und Cashflow', render: function (el, s) { App.StockFinancials.render(el, s); } },
      { id: 'fairvalue', title: 'Fairer Wert', desc: 'DCF und Multiplikatoren-Bewertung', render: function (el, s) { App.StockFairValue.render(el, s); } },
      { id: 'analyst', title: 'Analysten', desc: 'Kursziele und Empfehlungen', render: function (el, s) { App.StockAnalyst.render(el, s); } },
      { id: 'peers', title: 'Wettbewerber', desc: 'Kennzahlen im Branchenvergleich', render: function (el, s) { App.StockPeers.render(el, s); } }
    ] },
    { id: 'eigentuemer', label: 'Eigentümer', cards: [
      { id: 'insider', title: 'Insider', desc: 'Käufe und Verkäufe des Managements', render: function (el, s) { App.StockInsider.render(el, s); } },
      { id: 'institutional', title: 'Institutionen', desc: 'Größte institutionelle Anleger', expert: true, render: function (el, s) { App.StockInstitutional.render(el, s); } }
    ] },
    { id: 'risiko', label: 'Risiko & Strategie', cards: [
      { id: 'risk', title: 'Risiko', desc: 'Volatilität, maximaler Verlust, Beta', render: function (el, s) { App.StockRisk.render(el, s); } },
      { id: 'strategy', title: 'Backtest dieser Aktie', desc: 'Handelsstrategien auf den Kursverlauf testen', render: function (el, s) { App.StockStrategy.render(el, s); } },
      { id: 'live', title: 'Live-Signale', desc: 'Signale der Backtest-Strategie mit heutigem Kurs', render: function (el, s) { App.StockLive.render(el, s); } }
    ] }
  ];

  function findSection(tab) {
    var sec = null, card = null;
    SECTIONS.forEach(function (s) {
      if (s.id === tab) sec = s;
      s.cards.forEach(function (c) { if (c.id === tab) { sec = s; card = c; } });
    });
    return { section: sec || SECTIONS[0], card: card };
  }

  function loadOpen() {
    try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveOpen(map) {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(map)); } catch (e) {}
  }

  var detail = { ticker: null, stock: null, sectionId: null };

  App.Router.register('/stock', function () {
    App.Router.navigate('/stock/' + App.Data.getLastTicker() + '/overview');
  });

  App.Router.register('/stock/:ticker', function (p) {
    App.Router.navigate('/stock/' + String(p.ticker).toUpperCase() + '/overview');
  });

  App.Router.register('/stock/:ticker/:tab', function (params) {
    var ticker = (params.ticker || App.Data.getLastTicker()).toUpperCase();
    var target = findSection(params.tab || 'overview');
    App.Data.setLastTicker(ticker);
    if (App.UI) App.UI.addRecent(ticker);
    setHeader(ticker, 'Detailanalyse', true);

    // Gleiche Aktie, nur anderer Bereich: Kopf bleibt stehen, nur Inhalt wechselt
    if (detail.ticker === ticker && detail.stock && document.getElementById('dt-section-area')) {
      setHeader(detail.title || ticker, detail.subtitle || 'Detailanalyse', true);
      showSection(target.section, target.card);
      return;
    }
    renderStockDetailShell(ticker, target.section, target.card);
  });

  function iconStar() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
  }

  function renderStockDetailShell(ticker, section, focusCard) {
    var container = document.getElementById('app-view-content');
    if (!container) return;
    container.innerHTML = '<div class="view-container"><div class="state-box"><div class="spinner"></div><p>Lade ' + esc(ticker) + '...</p></div></div>';
    detail = { ticker: ticker, stock: null, sectionId: null };

    App.Data.getStock(ticker)
      .then(function (stock) {
        if (detail.ticker !== ticker) return; // inzwischen andere Aktie gewählt
        detail.stock = stock;
        var profile = stock.profile || {};
        var quote = stock.quote || {};
        var isStarred = App.Data.isWatchlisted(ticker);
        var chgCls = App.Format.changeClass(quote.changePercent);
        var sign = (quote.changePercent || 0) >= 0 ? '+' : '';

        detail.title = shortName(profile.name) || ticker;
        detail.fullName = profile.name || ticker;
        detail.subtitle = ticker + (profile.sector ? ' · ' + profile.sector : '') + (profile.exchange ? ' · ' + profile.exchange : '');
        setHeader(detail.title, detail.subtitle, true);

        var html = '' +
          '<div class="view-container">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:14px;">' +
              '<div style="min-width:0;">' +
                '<div style="display:flex;align-items:center;gap:6px;font-size:0.75rem;margin-bottom:2px;">' +
                  '<span class="ticker-badge">' + esc(ticker) + '</span>' +
                  '<span class="sector-label">' + esc(profile.sector || 'Markt') + '</span>' +
                '</div>' +
                '<div id="stock-header-price" style="font-size:1.6rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.2;">' + App.Format.currency(quote.price, quote.currency) + '</div>' +
              '</div>' +
              '<div id="stock-header-change" class="badge-pill ' + chgCls + '">' + sign + App.Format.number(quote.changePercent, 2) + ' %</div>' +
            '</div>' +

            '<div class="dt-actions">' +
              '<button class="dt-action' + (isStarred ? ' active' : '') + '" id="dt-act-star" aria-pressed="' + isStarred + '">' + iconStar() + '<span>Merken</span></button>' +
              '<button class="dt-action" id="dt-act-alarm"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/></svg><span>Alarm</span></button>' +
              '<button class="dt-action" id="dt-act-compare"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4v16M17 4v16M3 8h8M13 16h8"/></svg><span>Vergleich</span></button>' +
              '<button class="dt-action" id="dt-act-note"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg><span>Notiz</span></button>' +
              '<button class="dt-action" id="dt-act-depot"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg><span>Depot</span></button>' +
            '</div>' +

            '<div class="dt-sections" id="dt-sections"><div class="horizontal-scroll-row" role="tablist" aria-label="Bereiche der Analyse">' +
              SECTIONS.map(function (s) {
                return '<button class="chip-btn" role="tab" data-dt-section="' + s.id + '">' + esc(s.label) + '</button>';
              }).join('') +
            '</div></div>' +

            '<div id="dt-section-area"></div>' +
          '</div>';

        container.innerHTML = html;
        bindActions(ticker);

        container.querySelectorAll('[data-dt-section]').forEach(function (btn) {
          btn.onclick = function () {
            App.Router.navigate('/stock/' + ticker + '/' + btn.getAttribute('data-dt-section'));
          };
        });

        // In setTimeout, damit Fehler beim Rendern nicht als "Aktie nicht gefunden" landen
        setTimeout(function () { showSection(section, focusCard); }, 0);
      })
      .catch(function (err) {
        console.error('Detailansicht ' + ticker + ':', err);
        container.innerHTML = '<div class="view-container"><div class="state-box">' +
          '<p style="color: var(--bearish); font-weight: 700;">Aktie nicht gefunden</p>' +
          '<p style="font-size: 0.85rem;">Keine Daten für "' + esc(ticker) + '" verfügbar.</p>' +
          '<button class="chip-btn active" style="margin-top: 10px;" id="dt-open-search">Andere Aktie suchen</button>' +
          '</div></div>';
        var b = document.getElementById('dt-open-search');
        if (b) b.onclick = function () { App.CommandPalette.open(); };
      });
  }

  function bindActions(ticker) {
    var star = document.getElementById('dt-act-star');
    if (star) star.onclick = function () {
      var on = App.Data.toggleWatchlist(ticker);
      star.classList.toggle('active', on);
      star.setAttribute('aria-pressed', on);
    };
    var alarm = document.getElementById('dt-act-alarm');
    if (alarm) alarm.onclick = function () {
      App.Router.navigate('/watchlist/alerts');
      App.UI.prefill({ 'al-in-ticker': ticker }, 'al-in-target');
    };
    var cmp = document.getElementById('dt-act-compare');
    if (cmp) cmp.onclick = function () { App.Router.navigate('/compare/' + ticker); };
    var note = document.getElementById('dt-act-note');
    if (note) note.onclick = function () {
      App.Router.navigate('/journal');
      App.UI.prefill({ 'jn-ticker': ticker }, 'jn-thesis');
    };
    var depot = document.getElementById('dt-act-depot');
    if (depot) depot.onclick = function () {
      App.Router.navigate('/portfolio');
      App.UI.prefill({ 'pf-in-ticker': ticker }, 'pf-in-shares');
    };
  }

  function showSection(section, focusCard) {
    var area = document.getElementById('dt-section-area');
    if (!area || !detail.stock) return;
    var stock = detail.stock;
    var changed = detail.sectionId !== section.id;

    // Gleicher Bereich: nichts neu aufbauen (Eingaben/Ergebnisse bleiben erhalten),
    // höchstens die gewünschte Karte aufklappen
    if (!changed && area.childNodes.length) {
      if (!focusCard) return;
      var existing = document.getElementById('dt-card-' + focusCard.id);
      if (existing) {
        if (!existing.classList.contains('open')) existing.querySelector('.dt-card-head').click();
        setTimeout(function () { existing.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 80);
        return;
      }
    }
    detail.sectionId = section.id;
    if (App.PreMarket && App.PreMarket.stopAutoRefresh) App.PreMarket.stopAutoRefresh();

    document.querySelectorAll('[data-dt-section]').forEach(function (b) {
      var on = b.getAttribute('data-dt-section') === section.id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
      if (on && b.scrollIntoView && changed) b.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    });

    var expert = App.UI ? App.UI.isExpert() : true;
    var openMap = loadOpen();
    var hasBare = section.cards.some(function (c) { return c.bare; });
    var firstAccordion = null;
    var hidden = 0;
    area.innerHTML = '';

    section.cards.forEach(function (card) {
      var forced = focusCard && focusCard.id === card.id;
      if (card.expert && !expert && !forced) { hidden++; return; }

      if (card.bare) {
        var bare = document.createElement('div');
        bare.id = 'dt-bare-' + card.id;
        area.appendChild(bare);
        safeRender(card, bare, stock);
        return;
      }

      if (!firstAccordion) firstAccordion = card.id;
      var isOpen = forced || (openMap[card.id] !== undefined ? openMap[card.id] : (!hasBare && firstAccordion === card.id));

      var wrap = document.createElement('div');
      wrap.className = 'dt-card' + (isOpen ? ' open' : '');
      wrap.id = 'dt-card-' + card.id;
      wrap.innerHTML =
        '<button class="dt-card-head" aria-expanded="' + isOpen + '">' +
          '<span><span class="dt-card-title">' + esc(card.title) + '</span><span class="dt-card-desc">' + esc(card.desc) + '</span></span>' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
        '<div class="dt-card-body"></div>';
      area.appendChild(wrap);
      var body = wrap.querySelector('.dt-card-body');
      var head = wrap.querySelector('.dt-card-head');

      if (isOpen) safeRender(card, body, stock);
      head.onclick = function () {
        var nowOpen = !wrap.classList.contains('open');
        wrap.classList.toggle('open', nowOpen);
        head.setAttribute('aria-expanded', nowOpen);
        var m = loadOpen(); m[card.id] = nowOpen; saveOpen(m);
        if (nowOpen && !body.getAttribute('data-rendered')) safeRender(card, body, stock);
      };
    });

    if (hidden > 0) {
      var more = document.createElement('button');
      more.className = 'dt-more-btn';
      more.textContent = hidden === 1 ? '1 weitere Analyse einblenden (Experten-Modus)' : hidden + ' weitere Analysen einblenden (Experten-Modus)';
      more.onclick = function () { App.UI.setExpert(true); };
      area.appendChild(more);
    }

    if (focusCard && !focusCard.bare) {
      setTimeout(function () {
        var el = document.getElementById('dt-card-' + focusCard.id);
        if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }, 120);
    } else if (changed) {
      var bar = document.getElementById('dt-sections');
      if (bar && bar.getBoundingClientRect().top < 60) {
        window.scrollTo({ top: Math.max(0, window.scrollY + bar.getBoundingClientRect().top - 56), behavior: 'auto' });
      }
    }
  }

  function safeRender(card, el, stock) {
    el.setAttribute('data-rendered', '1');
    try {
      card.render(el, stock);
    } catch (e) {
      console.error('Karte ' + card.id + ':', e);
      el.innerHTML = '<div class="state-box"><p>Dieser Bereich konnte nicht geladen werden: ' + esc(e.message) + '</p></div>';
    }
  }

  // Experten-Modus umgeschaltet: aktuellen Bereich neu aufbauen
  window.addEventListener('app:expertchange', function () {
    if ((window.location.hash || '').indexOf('#/stock/') !== 0 || !detail.stock) return;
    var sec = SECTIONS.filter(function (s) { return s.id === detail.sectionId; })[0] || SECTIONS[0];
    detail.sectionId = null;
    showSection(sec, null);
  });

  function renderScoreView(container, stock) {
    container.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Berechne Score...</p></div>';

    try {
      App.Score.calculateTotalScoreAsync(stock).then(function (scoreData) {
        var html =
          (scoreData.isAggregated ? '<div style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 12px; padding: 8px 12px; background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);"><b>Hinweis (ETF):</b> Score ist gewichteter Durchschnitt der Top-5-Holdings.</div>' : '') +
          '<div class="card" style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px;">' +
            '<div><div style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; font-weight: 600;">Gesamt-Score (0-100)</div>' +
              '<div style="font-size: 1.05rem; font-weight: 800; color: var(--text-main);">' + (scoreData.score100 >= 65 ? 'Starkes Profil' : scoreData.score100 >= 45 ? 'Gemischtes Profil' : 'Schwaches Profil') + '</div></div>' +
            '<div class="score-badge-large">' + scoreData.score100 + '</div></div>';

        scoreData.categories.forEach(function (cat) {
          html += '<div class="card">' +
            '<div class="card-header-dotted">' +
              '<div style="display:flex; flex-direction:column;">' +
                '<span class="card-title">' + cat.category + '</span>' +
                '<span style="font-size:0.65rem; color:var(--text-dim);">Gewichtung: ' + cat.weight + '</span>' +
              '</div>' +
              '<span style="font-weight: 800; font-size: 0.95rem; color: var(--accent-purple-light);">' + cat.score.toFixed(1) + ' / 5.0</span>' +
            '</div>' +
            App.Score.renderSegmentBarHtml(cat.score) +
            '<div style="margin-top: 12px; padding: 10px; background: var(--bg-tertiary); border-radius: var(--radius-sm); font-size: 0.78rem; color: var(--text-muted); line-height: 1.4;">' +
              '<strong style="color: var(--text-main);">Begründung:</strong> ' + cat.reason +
            '</div>' +
            '<div style="display: flex; flex-direction: column; gap: 6px; margin-top: 12px; font-size: 0.8rem;">';
          cat.metrics.forEach(function (m) {
            html += '<div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--border-subtle);">' +
              '<span style="color: var(--text-dim);">' + m.name + '</span>' +
              '<strong style="font-variant-numeric: tabular-nums; color: var(--text-main);">' + m.value + '</strong></div>';
          });
          html += '</div></div>';
        });

        container.innerHTML = html;
      }).catch(function (err) {
        container.innerHTML = '<div class="state-box"><p>Score fehlgeschlagen: ' + esc((err && err.message) || 'Unbekannt') + '</p></div>';
      });
    } catch (e) {
      console.error('Score Init Error:', e);
      container.innerHTML = '<div class="state-box"><p>Score konnte nicht gestartet werden: ' + esc(e.message) + '</p></div>';
    }
  }

  // ---------------- Start ----------------

  window.addEventListener('DOMContentLoaded', function () {
    App.Theme.init();
    App.PWA.init();
    App.CommandPalette.init();

    var cmdkBtn = document.getElementById('btn-cmdk-open');
    if (cmdkBtn) cmdkBtn.onclick = function () { App.CommandPalette.open(); };
    var menuBtn = document.getElementById('btn-app-menu');
    if (menuBtn) menuBtn.onclick = function () { App.UI.openMenu(); };
    var inAppNavs = 0;
    if (backBtn) backBtn.onclick = function () {
      // Nur innerhalb der App zurück; beim Direkteinstieg zur Startseite
      if (inAppNavs > 0) window.history.back();
      else App.Router.navigate('/screener');
    };

    // Beim Verlassen der Detailansicht Zustand zurücksetzen
    window.addEventListener('hashchange', function () {
      inAppNavs++;
      if ((window.location.hash || '').indexOf('#/stock/') !== 0) detail = { ticker: null, stock: null, sectionId: null };
    });

    App.Router.init();

    if (App.Alerts) App.Alerts.checkAndNotify();
    if (App.Transactions) App.Transactions.migrateOldPortfolio();
    if (App.Screener && App.Screener.checkScreenerAlerts) App.Screener.checkScreenerAlerts();
  });
})();

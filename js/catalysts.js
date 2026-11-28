/**
 * js/catalysts.js – Treiber & Termine (Markt › Treiber, Route #/catalysts)
 *
 * Zeigt data/catalysts.json (scripts/fetch_catalysts.py): politische Entscheidungen, Regulierung, Zölle,
 * Notenbanken und Konjunkturtermine, die Kurse bewegen können – mit Status (bevorstehend / beschlossen /
 * laufend), möglicher Richtung und den betroffenen Aktien der App.
 *
 * App.Catalysts.initView()
 * App.Catalysts.load()                  -> Promise data
 * App.Catalysts.forTicker(data, ticker) -> relevante Einträge zu einer Aktie
 * App.Catalysts.renderForStock(host, ticker) -> Hinweiskarte in der Aktienansicht
 */
window.App = window.App || {};
window.App.Catalysts = (function () {
  'use strict';

  var cache = null, cacheAt = 0;
  var filter = 'all';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function load() {
    if (cache && Date.now() - cacheAt < 5 * 60 * 1000) return Promise.resolve(cache);
    return window.App.Data.getJsonFile('catalysts.json', { fresh: true }).then(function (d) {
      cache = d && Array.isArray(d.items) ? d : { items: [] };
      cacheAt = Date.now();
      return cache;
    }).catch(function () { return cache || { items: [] }; });
  }

  function daysUntil(date) {
    if (!date) return null;
    var t = new Date(date + 'T00:00:00'), today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((t - today) / 86400000);
  }
  function whenText(it) {
    var d = daysUntil(it.date);
    var ds = it.date ? new Date(it.date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
    if (it.status === 'bevorstehend') {
      if (d === null) return 'bevorstehend, Termin offen';
      return d === 0 ? 'heute' : d === 1 ? 'morgen' : d > 1 ? 'in ' + d + ' Tagen (' + ds + ')' : ds;
    }
    if (it.status === 'beschlossen') return 'beschlossen' + (ds ? ' am ' + ds : '');
    if (it.status === 'vorbei') return 'Termin war am ' + ds;
    return 'laufend';
  }
  var DIR = {
    positiv: { label: '▲ eher positiv', color: 'var(--bullish)' },
    negativ: { label: '▼ eher negativ', color: 'var(--bearish)' },
    unklar: { label: '◆ Richtung unklar', color: 'var(--text-muted)' }
  };
  function isNew(it) { var t = Date.parse(it.firstSeen || ''); return t && Date.now() - t < 30 * 3600 * 1000; }

  /** Einträge, die eine Aktie betreffen (nur aktuelle: bevorstehend, laufend oder vor höchstens 5 Tagen beschlossen). */
  function forTicker(data, ticker) {
    return ((data && data.items) || []).filter(function (it) {
      if ((it.tickers || []).indexOf(ticker) === -1) return false;
      if (it.status === 'vorbei') return false;
      if (it.status === 'beschlossen') { var d = daysUntil(it.date); return d === null || d >= -5; }
      return true;
    });
  }

  function myTickers() {
    var set = {};
    try { (window.App.Data.getWatchlist() || []).forEach(function (t) { set[t] = true; }); } catch (e) {}
    try { if (window.App.Transactions) Object.keys(window.App.Transactions.computePositions()).forEach(function (t) { set[t] = true; }); } catch (e) {}
    return set;
  }

  function card(it, mine) {
    var dir = DIR[it.direction] || DIR.unklar;
    var soon = it.status === 'bevorstehend' && daysUntil(it.date) !== null && daysUntil(it.date) <= 7 && daysUntil(it.date) >= 0;
    var html = '<div class="card" style="padding:12px 14px;margin-bottom:10px;">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">' +
        '<span style="font-size:0.66rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-dim);">' + esc(it.themeTitle || '') + '</span>' +
        (isNew(it) ? '<span style="font-size:0.62rem;font-weight:800;color:#fff;background:var(--accent-purple,#6366f1);border-radius:6px;padding:1px 6px;">NEU</span>' : '') +
      '</div>' +
      '<div style="font-weight:700;font-size:0.92rem;line-height:1.35;margin:4px 0 6px;">' + esc(it.title) + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px 12px;font-size:0.74rem;margin-bottom:6px;">' +
        '<span style="font-weight:700;color:' + (soon ? '#f59e0b' : 'var(--text-muted)') + ';">🗓 ' + esc(whenText(it)) + '</span>' +
        '<span style="font-weight:700;color:' + dir.color + ';">' + dir.label + '</span>' +
      '</div>' +
      (it.why ? '<div style="font-size:0.8rem;color:var(--text-muted);line-height:1.45;">' + esc(it.why) + '</div>' : '');
    if ((it.tickers || []).length) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;">' + it.tickers.map(function (t) {
        return '<button class="chip-btn' + (mine[t] ? ' active' : '') + '" data-cat-t="' + esc(t) + '" style="padding:2px 8px;font-size:0.72rem;">' + esc(t) + '</button>';
      }).join('') + '</div>';
    } else if ((it.sectors || []).length) {
      html += '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:6px;">Betrifft: ' + esc(it.sectors.join(', ')) + '</div>';
    }
    if ((it.sources || []).length) {
      html += '<details style="margin-top:8px;"><summary style="font-size:0.72rem;color:var(--text-dim);cursor:pointer;">Quellen (' + it.sources.length + ')</summary>' +
        it.sources.map(function (s) {
          return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener" style="display:block;font-size:0.74rem;color:var(--text-muted);margin-top:5px;line-height:1.4;text-decoration:none;">' +
            esc(s.title) + ' <span style="color:var(--text-dim);">· ' + esc(s.source || '') + '</span></a>';
        }).join('') + '</details>';
    }
    return html + '</div>';
  }

  function section(title, list, mine) {
    if (!list.length) return '';
    return '<div style="font-size:0.74rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);margin:16px 2px 8px;">' + esc(title) + ' (' + list.length + ')</div>' +
      list.map(function (it) { return card(it, mine); }).join('');
  }

  // ---------- Aktien mit Rückenwind / Gegenwind ----------
  /** Gewicht eines Treibers: frisch beschlossen oder bald anstehend zählt mehr als "läuft schon länger". */
  function weight(it) {
    var d = daysUntil(it.date);
    if (it.status === 'bevorstehend') return d === null ? 0.6 : d <= 7 ? 1 : d <= 21 ? 0.8 : 0.5;
    if (it.status === 'beschlossen') return d === null ? 0.7 : d >= -2 ? 1 : d >= -5 ? 0.8 : 0;
    if (it.status === 'laufend') return 0.5;
    return 0;
  }

  /** Je Aktie: Summe der direkt genannten Treiber (positiv +, negativ -), gewichtet nach Aktualität. */
  function rankStocks(data, uni) {
    var byT = {};
    (uni || []).forEach(function (u) { byT[u.ticker] = u; });
    var acc = {};
    (data.items || []).forEach(function (it) {
      var w = weight(it);
      if (!w || !(it.tickers || []).length) return;
      var sign = it.direction === 'positiv' ? 1 : it.direction === 'negativ' ? -1 : 0;
      it.tickers.forEach(function (t) {
        if (!byT[t]) return;
        var a = acc[t] = acc[t] || { ticker: t, score: 0, pos: [], neg: [], open: [] };
        a.score += sign * w;
        (sign > 0 ? a.pos : sign < 0 ? a.neg : a.open).push(it);
      });
    });
    return Object.keys(acc).map(function (t) { var a = acc[t]; a.u = byT[t]; a.score = Math.round(a.score * 10) / 10; return a; });
  }

  function pct(v) {
    if (v == null || isNaN(v)) return '–';
    return (v > 0 ? '+' : '') + Number(v).toFixed(1).replace('.', ',') + ' %';   // perf1w ist bereits in Prozent
  }

  function stockRow(a, mine, up) {
    var u = a.u || {};
    var main = (up ? a.pos : a.neg).slice().sort(function (x, y) { return weight(y) - weight(x); });
    var other = up ? a.neg : a.pos;
    var col = a.score > 0 ? 'var(--bullish)' : 'var(--bearish)';
    var wk = u.perf1w != null ? u.perf1w : null;
    // Schon stark gelaufen? Dann ist die Nachricht vermutlich eingepreist
    var priced = wk != null && (up ? wk > 8 : wk < -8);
    return '<div class="card" data-cat-t="' + esc(a.ticker) + '" style="padding:11px 14px;margin-bottom:8px;cursor:pointer;">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">' +
        '<div style="min-width:0;"><span style="font-weight:800;">' + esc(a.ticker) + '</span>' + (mine[a.ticker] ? ' <span style="color:#f59e0b;">★</span>' : '') +
        ' <span style="font-size:0.78rem;color:var(--text-muted);">' + esc(u.name || '') + '</span></div>' +
        '<span style="font-weight:800;color:' + col + ';white-space:nowrap;">' + (a.score > 0 ? '+' : '') + String(a.score).replace('.', ',') + '</span>' +
      '</div>' +
      '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:2px;">1 Woche: <b style="color:' + (wk > 0 ? 'var(--bullish)' : wk < 0 ? 'var(--bearish)' : 'var(--text-muted)') + ';">' + pct(wk) + '</b>' +
        (priced ? ' · <span style="color:#f59e0b;">schon deutlich ' + (up ? 'gestiegen' : 'gefallen') + ' – evtl. eingepreist</span>' : '') +
        (other.length ? ' · ' + other.length + (up ? ' negativer' : ' positiver') + ' Treiber' : '') + '</div>' +
      main.slice(0, 3).map(function (it) {
        return '<div style="font-size:0.78rem;margin-top:5px;line-height:1.35;"><span style="color:' + col + ';">' + (up ? '▲' : '▼') + '</span> ' + esc(it.title) +
          ' <span style="color:var(--text-dim);">· ' + esc(whenText(it)) + '</span></div>';
      }).join('') +
      (main.length > 3 ? '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:3px;">+ ' + (main.length - 3) + ' weitere</div>' : '') +
    '</div>';
  }

  function renderStocks(data, uni, mine, up) {
    var list = rankStocks(data, uni).filter(function (a) { return up ? a.score > 0 : a.score < 0; })
      .sort(function (a, b) { return up ? b.score - a.score : a.score - b.score; }).slice(0, 30);
    var html = '<div style="font-size:0.74rem;color:var(--text-muted);line-height:1.5;margin:12px 2px 8px;">' +
      (up ? 'Aktien, die von aktuellen Entscheidungen und Terminen eher profitieren könnten.' : 'Aktien, denen aktuelle Entscheidungen und Termine eher schaden könnten.') +
      ' Punkte: jeder direkt betroffene Treiber zählt 0,5–1 (frisch beschlossen oder in den nächsten 7 Tagen = 1), Gegen-Treiber werden abgezogen. ' +
      'Keine Kursprognose – prüfe Chart und Bewertung selbst.</div>';
    if (!list.length) return html + '<div class="state-box"><p>Aktuell keine Aktie mit überwiegend ' + (up ? 'positiven' : 'negativen') + ' Treibern.</p></div>';
    return html + list.map(function (a) { return stockRow(a, mine, up); }).join('');
  }

  /** Übersichtskarte: je 5 Aktien mit dem stärksten Rückenwind und Gegenwind. */
  function overviewCard(data, uni, mine) {
    if (!uni) return '<div class="card" style="padding:12px 14px;margin-top:12px;"><div style="font-size:0.78rem;color:var(--text-dim);">Lade Aktien…</div></div>';
    var all = rankStocks(data, uni);
    var ups = all.filter(function (a) { return a.score > 0; }).sort(function (a, b) { return b.score - a.score; });
    var downs = all.filter(function (a) { return a.score < 0; }).sort(function (a, b) { return a.score - b.score; });
    if (!ups.length && !downs.length) return '';
    var col = function (title, list, up) {
      var c = up ? 'var(--bullish)' : 'var(--bearish)';
      return '<div style="flex:1 1 220px;min-width:0;">' +
        '<div style="font-size:0.7rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:' + c + ';margin-bottom:4px;">' + title + ' (' + list.length + ')</div>' +
        (list.length ? list.slice(0, 5).map(function (a) {
          var top = (up ? a.pos : a.neg).slice().sort(function (x, y) { return weight(y) - weight(x); })[0];
          var wk = a.u && a.u.perf1w;
          return '<div data-cat-t="' + esc(a.ticker) + '" style="padding:6px 0;border-top:1px solid var(--border);cursor:pointer;">' +
            '<div style="display:flex;justify-content:space-between;gap:6px;font-size:0.82rem;">' +
              '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><b>' + esc(a.ticker) + '</b>' + (mine[a.ticker] ? ' <span style="color:#f59e0b;">★</span>' : '') +
              ' <span style="color:var(--text-muted);font-size:0.74rem;">' + esc((a.u && a.u.name) || '') + '</span></span>' +
              '<span style="font-weight:800;color:' + c + ';white-space:nowrap;">' + (a.score > 0 ? '+' : '') + String(a.score).replace('.', ',') +
              (wk != null ? ' <span style="font-weight:400;font-size:0.7rem;color:var(--text-dim);">1W ' + pct(wk) + '</span>' : '') + '</span></div>' +
            (top ? '<div style="font-size:0.72rem;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(top.title) + '</div>' : '') +
          '</div>';
        }).join('') : '<div style="font-size:0.76rem;color:var(--text-dim);">keine</div>') +
        (list.length > 5 ? '<button class="chip-btn" data-cat-f="' + (up ? 'up' : 'down') + '" style="margin-top:6px;padding:2px 9px;font-size:0.7rem;">Alle ' + list.length + ' ansehen</button>' : '') +
      '</div>';
    };
    return '<div class="card" style="padding:12px 14px;margin-top:12px;">' +
      '<div style="font-size:0.74rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);">Mögliche Gewinner &amp; Verlierer</div>' +
      '<div style="font-size:0.72rem;color:var(--text-dim);margin:2px 0 8px;">Nach direkt betroffenen Treibern gewichtet – keine Kursprognose.</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:14px;">' + col('📈 Könnten steigen', ups, true) + col('📉 Könnten fallen', downs, false) + '</div></div>';
  }

  function render(container, data, uni) {
    var mine = myTickers();
    if (!uni) {
      // Kursdaten für Rangliste und Übersichtskarte nachladen, dann neu zeichnen
      window.App.Data.getUniverse().then(function (u) { if (document.body.contains(container)) render(container, data, u || []); })
        .catch(function () { if (document.body.contains(container)) render(container, data, []); });
      if (filter === 'up' || filter === 'down') return;
    }
    var items = (data.items || []).slice();
    var stockMode = filter === 'up' || filter === 'down';
    if (filter === 'mine') items = items.filter(function (it) { return (it.tickers || []).some(function (t) { return mine[t]; }); });
    if (filter === 'positiv' || filter === 'negativ') items = items.filter(function (it) { return it.direction === filter; });

    var upcoming = items.filter(function (it) { return it.status === 'bevorstehend'; }).sort(function (a, b) {
      if (!a.date && !b.date) return 0; if (!a.date) return 1; if (!b.date) return -1; return a.date < b.date ? -1 : 1;
    });
    var decided = items.filter(function (it) { return it.status === 'beschlossen'; }).sort(function (a, b) { return (b.date || b.firstSeen || '') < (a.date || a.firstSeen || '') ? -1 : 1; });
    var running = items.filter(function (it) { return it.status === 'laufend'; });

    var upd = data.updatedAt ? new Date(data.updatedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
    var chip = function (k, l) { return '<button class="chip-btn' + (filter === k ? ' active' : '') + '" data-cat-f="' + k + '" style="flex-shrink:0;">' + l + '</button>'; };
    var html = '<div class="view-container">' +
      '<div class="card" style="padding:14px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
          '<div><div style="font-weight:800;font-size:1.05rem;">Treiber &amp; Termine</div>' +
          '<div style="font-size:0.74rem;color:var(--text-dim);margin-top:2px;">Stand ' + esc(upd) + (data.stale ? ' (älter)' : '') + '</div></div>' +
          '<button class="chip-btn" id="cat-update">↻ Neu</button></div>' +
        '<div style="font-size:0.74rem;color:var(--text-muted);line-height:1.5;margin-top:8px;">Politik, Regulierung, Zölle und Notenbanken aus den Nachrichten, von der KI eingeordnet. ' +
          'Die Richtung ist eine Einschätzung, keine Prognose – oft ist eine erwartete Entscheidung schon im Kurs.</div>' +
        '<div class="horizontal-scroll-row" style="margin-top:10px;gap:6px;">' +
          chip('up', '📈 Rückenwind') + chip('down', '📉 Gegenwind') +
          chip('all', 'Alle') + chip('mine', '★ Meine Werte') + chip('positiv', '▲ positiv') + chip('negativ', '▼ negativ') + '</div>' +
      '</div>';
    if (stockMode) {
      html += renderStocks(data, uni, mine, filter === 'up');
    } else if (filter === 'all') {
      html += overviewCard(data, uni, mine);
    }
    if (!stockMode && !items.length) {
      html += '<div class="state-box"><p>' + (filter === 'all' ? 'Noch keine Einträge. Unter ⋯ › Daten-Updates „Treiber & Termine“ starten.' : 'Nichts für diesen Filter.') + '</p></div>';
    }
    if (!stockMode) html += section('Bevorstehend', upcoming, mine) + section('Gerade beschlossen', decided, mine) + section('Laufend', running, mine);
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('[data-cat-f]').forEach(function (b) {
      b.onclick = function () { filter = b.getAttribute('data-cat-f'); render(container, data, uni); };
    });
    container.querySelectorAll('[data-cat-t]').forEach(function (b) {
      b.onclick = function () { window.App.Router.navigate('/stock/' + b.getAttribute('data-cat-t') + '/overview'); };
    });
    var up = container.querySelector('#cat-update');
    if (up) up.onclick = function () { if (window.App.Sync) window.App.Sync.open({ highlight: 'update_catalysts.yml' }); };
  }

  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;
    container.innerHTML = '<div class="view-container"><div class="state-box"><div class="spinner"></div><p>Lade Treiber &amp; Termine…</p></div></div>';
    cacheAt = 0;
    load().then(function (d) { if (document.body.contains(container)) render(container, d); });
  }

  // Englischer App-Sektor -> Stichwörter in den (deutschen) Sektorangaben der KI
  var SECTOR_KEYS = {
    'Technology': ['tech', 'halbleiter', 'chip', 'software', 'it-', 'ki'],
    'Consumer Cyclical': ['auto', 'zykl', 'einzelhandel', 'konsum', 'luxus', 'reise'],
    'Consumer Defensive': ['basiskonsum', 'lebensmittel', 'getränk', 'nahrung', 'konsumgüter'],
    'Healthcare': ['gesundheit', 'pharma', 'biotech', 'medizin', 'krankenvers'],
    'Financial Services': ['bank', 'finanz', 'versicher'],
    'Industrials': ['industrie', 'rüstung', 'verteidigung', 'luftfahrt', 'maschinen', 'bau', 'transport', 'logistik'],
    'Energy': ['energie', 'öl', 'gas'],
    'Utilities': ['versorger', 'strom', 'erneuerbar', 'solar', 'wind'],
    'Basic Materials': ['rohstoff', 'chemie', 'stahl', 'bergbau', 'metall', 'kupfer'],
    'Communication Services': ['kommunikation', 'medien', 'telekom', 'internet', 'werbung'],
    'Real Estate': ['immobilien']
  };
  var MARKET_KEYS = ['gesamtmarkt', 'markt', 'alle', 'breit'];

  function matchesSector(it, sector) {
    var keys = SECTOR_KEYS[sector];
    if (!keys) return false;
    return (it.sectors || []).some(function (x) {
      x = String(x).toLowerCase();
      return keys.some(function (k) { return x.indexOf(k) !== -1; });
    });
  }
  function isMarketWide(it) {
    return (it.sectors || []).some(function (x) { x = String(x).toLowerCase(); return MARKET_KEYS.some(function (k) { return x.indexOf(k) !== -1; }); }) ||
      it.theme === 'fed' || it.theme === 'ecb' || it.theme === 'termine' || it.theme === 'us_fiscal';
  }
  function current(it) {
    if (it.status === 'vorbei') return false;
    var d = daysUntil(it.date);
    if (it.status === 'beschlossen') return d === null || d >= -5;
    if (it.status === 'bevorstehend') return d === null || d <= 21;
    return true;
  }

  /** Treiber einer Aktie in drei Stufen: direkt genannt, über die Branche, marktweit (nächste Termine). */
  function groupsFor(d, ticker, sector) {
    var items = ((d && d.items) || []).filter(current);
    var direct = items.filter(function (it) { return (it.tickers || []).indexOf(ticker) !== -1; });
    var used = {};
    direct.forEach(function (it) { used[it.id] = 1; });
    var branch = items.filter(function (it) { return !used[it.id] && matchesSector(it, sector); });
    branch.forEach(function (it) { used[it.id] = 1; });
    var market = items.filter(function (it) { return !used[it.id] && isMarketWide(it) && it.status !== 'laufend'; })
      .sort(function (a, b) { return String(a.date || '9').localeCompare(String(b.date || '9')); });
    return { direct: direct, branch: branch.slice(0, 3), market: market.slice(0, 3) };
  }

  function miniRow(it) {
    var dir = DIR[it.direction] || DIR.unklar;
    return '<div style="padding:7px 0;border-top:1px solid var(--border);">' +
      '<div style="font-size:0.84rem;font-weight:700;line-height:1.35;">' + esc(it.title) + (isNew(it) ? ' <span style="font-size:0.6rem;color:#fff;background:var(--accent-purple,#6366f1);border-radius:5px;padding:0 5px;vertical-align:middle;">NEU</span>' : '') + '</div>' +
      '<div style="font-size:0.74rem;margin-top:2px;"><span style="color:' + dir.color + ';font-weight:700;">' + dir.label + '</span> · <span style="color:var(--text-muted);">' + esc(whenText(it)) + '</span></div>' +
      (it.why ? '<div style="font-size:0.76rem;color:var(--text-muted);margin-top:2px;line-height:1.4;">' + esc(it.why) + '</div>' : '') + '</div>';
  }

  /** Karte "Treiber" oben im Überblick der Aktienansicht. */
  function renderForStock(host, ticker, sector) {
    if (!host || !ticker) return;
    load().then(function (d) {
      if (!document.body.contains(host)) return;
      var g = groupsFor(d, ticker, sector);
      var any = g.direct.length || g.branch.length || g.market.length;
      var head = function (t) { return '<div style="font-size:0.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);margin:10px 0 2px;">' + t + '</div>'; };
      var div = document.createElement('div');
      div.className = 'card';
      div.id = 'stock-catalysts';
      div.style.cssText = 'padding:12px 14px;margin-bottom:12px;' + (g.direct.length ? 'border-left:3px solid #f59e0b;' : '');
      // Eingeklappt: nur Kopfzeile mit Anzahl; Zustand wird für alle Aktien gemerkt
      var collapsed = true;
      try { collapsed = localStorage.getItem('app_cat_collapsed_v1') !== '0'; } catch (_) {}
      var parts = [];
      if (g.direct.length) parts.push('<b style="color:#f59e0b;">' + g.direct.length + ' direkt</b>');
      if (g.branch.length) parts.push(g.branch.length + ' Branche');
      if (g.market.length) parts.push(g.market.length + ' Markt');
      var html = '<div data-cat-toggle style="display:flex;justify-content:space-between;align-items:center;gap:8px;cursor:pointer;user-select:none;">' +
        '<div style="display:flex;align-items:center;gap:8px;min-width:0;">' +
          '<span data-cat-arrow style="display:inline-block;transition:transform .15s;font-size:0.7rem;color:var(--text-dim);">▶</span>' +
          '<span style="font-size:0.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);">⚡ Treiber</span>' +
          '<span style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (parts.length ? parts.join(' · ') : 'keine') + '</span>' +
        '</div>' +
        '<button class="chip-btn" style="padding:2px 9px;font-size:0.7rem;flex-shrink:0;" data-cat-all>Alle ansehen</button></div>' +
        '<div data-cat-body>';
      if (!any) {
        html += '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:6px;">' +
          ((d.items || []).length ? 'Aktuell keine Meldungen zu Politik, Regulierung oder Terminen, die diese Aktie betreffen.' : 'Noch keine Treiber geladen – unter ⋯ › Daten-Updates „Treiber & Termine“ starten.') + '</div>';
      }
      if (g.direct.length) html += head('Direkt betroffen') + g.direct.map(miniRow).join('');
      if (g.branch.length) html += head('Branche') + g.branch.map(miniRow).join('');
      if (g.market.length) html += head('Gesamtmarkt') + g.market.map(miniRow).join('');
      html += '</div>';
      div.innerHTML = html;
      var body = div.querySelector('[data-cat-body]');
      var arrow = div.querySelector('[data-cat-arrow]');
      var apply = function () {
        body.style.display = collapsed ? 'none' : '';
        arrow.style.transform = collapsed ? '' : 'rotate(90deg)';
      };
      apply();
      div.querySelector('[data-cat-toggle]').onclick = function (e) {
        if (e.target.closest('[data-cat-all]')) return;
        collapsed = !collapsed;
        try { localStorage.setItem('app_cat_collapsed_v1', collapsed ? '1' : '0'); } catch (_) {}
        apply();
      };
      var old = host.querySelector('#stock-catalysts');
      if (old) old.remove();
      host.insertBefore(div, host.firstChild);
      div.querySelector('[data-cat-all]').onclick = function (e) { e.stopPropagation(); window.App.Router.navigate('/catalysts'); };
    });
  }

  return { rankStocks: rankStocks, initView: initView, load: load, forTicker: forTicker, groupsFor: groupsFor, renderForStock: renderForStock, whenText: whenText };
})();

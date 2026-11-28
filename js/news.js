/**
 * js/news.js – Nachrichten + FinBERT-Bewertung (Daten: data/news/*.json, erzeugt von scripts/fetch_news.py)
 * + Reddit-Aufmerksamkeit (ApeWisdom) + WSB-Sentiment (Tradestie)
 * Aktien-Karte, Sektor-Karte, Reddit-Buzz-Karte und Textbausteine für die Gemini-Prompts.
 */
window.App = window.App || {};
window.App.News = (function () {
  'use strict';
  var RAW = 'https://raw.githubusercontent.com/spamispam018-lab/spamispam018-lab.github.io/main/data/news/';
  // Cloudflare Worker: live Schlagzeilen und Reddit-Daten (Dateien aus GitHub bleiben Rückfall + FinBERT-Quelle)
  var WORKER = 'https://yahoo-proxy.spamispam018.workers.dev';
  var cache = { index: null, sectors: null, tickers: {}, reddit: {}, redditIndex: null, redditMeta: null, live: {} };
  var COL = { positive: '#22c55e', neutral: '#94a3b8', negative: '#ef4444' };
  var TXT = { positive: 'positiv', neutral: 'neutral', negative: 'negativ' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function getJson(name) {
    var q = '?v=' + Date.now();
    return fetch('/data/news/' + name + q).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .catch(function () { return fetch(RAW + name + q).then(function (r) { if (!r.ok) throw 0; return r.json(); }); });
  }
  function load(key, name, sub) {
    var hit = sub ? cache[key][sub] : cache[key];
    if (hit) return Promise.resolve(hit);
    return getJson(name).then(function (d) { if (sub) cache[key][sub] = d; else cache[key] = d; return d; }).catch(function () { return null; });
  }
  function loadIndex() { return load('index', '_index.json'); }
  function loadSectors() { return load('sectors', '_sectors.json'); }
  function loadFileTicker(t) { return load('tickers', encodeURIComponent(t) + '.json', t); }

  function workerJson(path, force) {
    return fetch(WORKER + path + (path.indexOf('?') === -1 ? '?' : '&') + (force ? 'refresh=1&' : '') + 't=' + Date.now())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  function normTitle(t) { return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  /**
   * Nachrichten einer Aktie: live Schlagzeilen vom Worker (Google News, Ersatz Yahoo), ergänzt um die FinBERT-Bewertung
   * aus den GitHub-Daten (Zuordnung über den Titel). Neue, noch nicht bewertete Meldungen
   * erscheinen grau. force = true holt sofort neue Schlagzeilen.
   */
  function loadTicker(t, force) {
    if (!force && cache.live[t]) return Promise.resolve(cache.live[t]);
    return Promise.all([
      loadFileTicker(t),
      // Firmenname für die Google-News-Suche im Worker (ohne Namen nutzt der Worker Yahoo)
      window.App.Data.getUniverse().then(function (uni) {
        var u = (uni || []).filter(function (x) { return x.ticker === t; })[0];
        return workerJson('/news?ticker=' + encodeURIComponent(t) + (u && u.name ? '&name=' + encodeURIComponent(u.name) : ''), force);
      }).catch(function () { return null; })
    ]).then(function (res) {
      var file = res[0] || {};
      var live = res[1];
      var rated = {};
      (file.items || []).forEach(function (i) { rated[normTitle(i.title)] = i; });
      var items;
      if (live && live.items && live.items.length) {
        items = live.items.map(function (i) {
          var r = rated[normTitle(i.title)];
          return r ? Object.assign({}, i, { label: r.label, score: r.score, id: r.id }) : Object.assign({ label: null, score: null }, i);
        });
        // Ältere bewertete Meldungen, die live nicht mehr kommen, hinten anhängen
        var liveTitles = {};
        items.forEach(function (i) { liveTitles[normTitle(i.title)] = 1; });
        (file.items || []).forEach(function (i) { if (!liveTitles[normTitle(i.title)]) items.push(i); });
        items.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
        items = items.slice(0, 15);
      } else {
        items = (file.items || []).slice();
      }
      var withLabel = items.filter(function (i) { return i.label; });
      var out = {
        ticker: t,
        items: items,
        n: withLabel.length,
        pos: withLabel.filter(function (i) { return i.label === 'positive'; }).length,
        neu: withLabel.filter(function (i) { return i.label === 'neutral'; }).length,
        neg: withLabel.filter(function (i) { return i.label === 'negative'; }).length,
        unrated: items.length - withLabel.length,
        fetchedAt: live ? live.fetchedAt : (file.updatedAt || null),
        live: !!live,
        stale: !!(live && live.stale),
        // Quelle der Live-Schlagzeilen (google / bing / yahoo); leer = nur GitHub-Datei
        source: live && live.items && live.items.length ? (live.source || 'yahoo') : '',
        sourceErrors: (live && live.errors) || []
      };
      cache.tickers[t] = out;   // für Prompt-Bausteine
      cache.live[t] = out;
      return out;
    });
  }

  /**
   * Reddit-Daten aller Aktien: live vom Worker, auf das App-Universum beschränkt.
   * Rückfall: data/news/_reddit_index.json aus GitHub.
   */
  function loadRedditIndex(force) {
    if (!force && cache.redditIndex) return Promise.resolve(cache.redditIndex);
    var uniP = (window.App.Data && window.App.Data.getUniverse) ? window.App.Data.getUniverse().catch(function () { return []; }) : Promise.resolve([]);
    return Promise.all([workerJson('/reddit', force).catch(function () { return null; }), uniP]).then(function (res) {
      var live = res[0];
      var uni = res[1] || [];
      if (live && live.items) {
        var allowed = {};
        uni.forEach(function (u) { allowed[String(u.ticker).toUpperCase()] = 1; });
        var useFilter = uni.length > 0;
        var idx = {};
        Object.keys(live.items).forEach(function (t) { if (!useFilter || allowed[t]) idx[t] = live.items[t]; });
        // Buzz relativ zum Spitzenwert innerhalb des Universums (wie im Python-Skript)
        var maxM = 1;
        Object.keys(idx).forEach(function (t) { maxM = Math.max(maxM, idx[t].mentions || 0); });
        Object.keys(idx).forEach(function (t) { idx[t] = Object.assign({}, idx[t], { buzz: Math.round((idx[t].mentions || 0) / maxM * 1000) / 1000 }); });
        cache.redditIndex = idx;
        cache.reddit = idx;
        cache.redditMeta = { fetchedAt: live.fetchedAt, live: true, stale: !!live.stale };
        return idx;
      }
      if (cache.redditIndex && !force) return cache.redditIndex;
      return getJson('_reddit_index.json').then(function (d) {
        cache.redditIndex = d || {};
        cache.reddit = cache.redditIndex;
        var any = Object.keys(cache.redditIndex)[0];
        cache.redditMeta = { fetchedAt: any ? cache.redditIndex[any].updatedAt : null, live: false };
        return cache.redditIndex;
      }).catch(function () { return cache.redditIndex || {}; });
    });
  }

  function loadReddit(t, force) {
    return loadRedditIndex(force).then(function (idx) { return (idx && idx[t]) || null; });
  }

  function redditMeta() { return cache.redditMeta || {}; }

  function dateStr(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  }
  function bar(s) {
    if (!s || !s.n) return '';
    return '<div style="display:flex;gap:10px;font-size:.72rem;margin-bottom:8px;">' +
      '<span style="color:' + COL.positive + '">' + s.pos + ' positiv</span>' +
      '<span style="color:' + COL.neutral + '">' + s.neu + ' neutral</span>' +
      '<span style="color:' + COL.negative + '">' + s.neg + ' negativ</span></div>';
  }
  function list(items, showTicker) {
    return items.map(function (i) {
      var l = i.label;
      var dot = l
        ? '<span title="' + TXT[l] + ' (' + (i.score > 0 ? '+' : '') + i.score + ')" style="flex:0 0 9px;height:9px;margin-top:5px;border-radius:50%;background:' + COL[l] + '"></span>'
        : '<span title="neu, noch nicht bewertet" style="flex:0 0 9px;height:9px;margin-top:5px;border-radius:50%;border:1.5px solid var(--text-dim);box-sizing:border-box;"></span>';
      return '<a href="' + esc(i.url) + '" target="_blank" rel="noopener" style="display:flex;gap:8px;padding:8px 0;border-top:1px solid var(--border-color,rgba(255,255,255,.08));text-decoration:none;color:inherit;">' +
        dot +
        '<span style="flex:1;font-size:.8rem;line-height:1.35;">' + esc(i.title) +
        '<span style="display:block;font-size:.66rem;color:var(--text-dim);margin-top:2px;">' + esc(i.source) + ' · ' + dateStr(i.date) + (showTicker && i.ticker ? ' · ' + esc(i.ticker) : '') + '</span></span></a>';
    }).join('');
  }
  function updBtn(key, iso, title) {
    return (window.App.UI && window.App.UI.updateButton) ? window.App.UI.updateButton(key, iso, title) : '';
  }

  function card(title, data, showTicker, updKey) {
    var note = 'Automatische Einschätzung (FinBERT), keine Anlageberatung.';
    if (data && data.unrated) note = 'Farbpunkt = FinBERT-Einschätzung (abends aktualisiert). Leerer Kreis = neue Meldung, noch nicht bewertet. Keine Anlageberatung.';
    if (data && data.stale) note = 'Neue Schlagzeilen gerade nicht abrufbar – letzter Stand. ' + note;
    if (data && data.live !== undefined) {
      var SRC = { google: 'Google News', bing: 'Bing News', yahoo: 'Yahoo Finance' };
      var src = data.source ? 'Quelle: ' + SRC[data.source] : 'Quelle: gespeicherte Daten';
      if (data.source !== 'google' && data.sourceErrors && data.sourceErrors.length) src += ' (' + data.sourceErrors.join('; ') + ')';
      note = esc(src) + '. ' + note;
    }
    var body = (data && data.items && data.items.length)
      ? bar(data) + list(data.items, showTicker) + '<div style="font-size:.62rem;color:var(--text-dim);margin-top:6px;line-height:1.4;">' + note + '</div>'
      : '<div style="font-size:.75rem;color:var(--text-dim);">Keine aktuellen Nachrichten vorhanden.</div>';
    return '<div class="card"><div class="card-header-dotted" style="align-items:center;"><span class="card-title">' + esc(title) + '</span>' +
      (updKey ? updBtn(updKey, data && data.fetchedAt, title + ' aktualisieren') : '') + '</div>' + body + '</div>';
  }

  // ---------- Reddit (ApeWisdom + Tradestie) ----------
  function redditBuzzBar(data, ticker) {
    if (!data) return '';
    var html = '';

    // 1. ApeWisdom Zeile (Momentum / Buzz)
    if (data.mentions) {
      var pct = (data.change_pct > 0 ? '+' : '') + data.change_pct;
      var color = data.change_pct > 0 ? COL.positive : data.change_pct < 0 ? COL.negative : COL.neutral;
      
      // Link zur allgemeinen Reddit-Suche
      var redditSearchUrl = 'https://www.reddit.com/search/?q=' + encodeURIComponent(ticker) + '&sort=new';
      
      html += '<div style="display:flex;gap:12px;font-size:.72rem;margin-bottom:6px;align-items:center;flex-wrap:wrap;">' +
        '<span style="color:' + color + ';font-weight:600;">' + pct + '% Mentions (24h)</span>' +
        '<a href="' + redditSearchUrl + '" target="_blank" rel="noopener" style="color:var(--text-dim);text-decoration:none;">' + 
          data.mentions + ' Erwähnungen ↗</a>' +
        (data.upvotes ? '<span style="color:var(--text-dim);">' + data.upvotes + ' Upvotes</span>' : '') +
        (data.rank ? '<span style="color:var(--text-dim);">Rang #' + data.rank + '</span>' : '') +
        '</div>';
    }

    // 2. Tradestie Zeile (Sentiment)
    if (data.sentiment) {
      var isBull = data.sentiment.toLowerCase() === 'bullish';
      var sColor = isBull ? COL.positive : COL.negative;
      var scoreStr = data.sentiment_score !== undefined && data.sentiment_score !== null 
                     ? (data.sentiment_score > 0 ? '+' : '') + data.sentiment_score : '';
      
      // Link zur gezielten Wallstreetbets-Suche
      var wsbSearchUrl = 'https://www.reddit.com/r/wallstreetbets/search/?q=' + encodeURIComponent(ticker) + '&restrict_sr=1&sort=new';

      html += '<div style="display:flex;gap:12px;font-size:.72rem;margin-bottom:8px;align-items:center;flex-wrap:wrap;">' +
        '<span style="color:' + sColor + ';font-weight:600;">WSB-Sentiment: ' + (isBull ? 'Bullish' : 'Bearish') + '</span>' +
        (scoreStr ? '<span style="color:var(--text-dim);">Score: ' + scoreStr + '</span>' : '') +
        (data.wsb_comments ? '<a href="' + wsbSearchUrl + '" target="_blank" rel="noopener" style="color:var(--text-dim);text-decoration:none;">' + 
          data.wsb_comments + ' Kommentare ↗</a>' : '') +
        '</div>';
    }

    return html;
  }

  function redditCardHtml(ticker, slotEl, force) {
    loadReddit(ticker, force).then(function (d) {
      if (!slotEl) return;
      var meta = redditMeta();
      var head = '<div class="card-header-dotted" style="align-items:center;"><span class="card-title">Reddit-Analyse</span>' +
        updBtn('reddit', meta.fetchedAt, 'Reddit-Daten aktualisieren') + '</div>';
      if (!d || (!d.mentions && !d.sentiment)) {
        slotEl.innerHTML = '<div class="card">' + head +
          '<div style="font-size:.75rem;color:var(--text-dim);">Keine Reddit-Daten für diesen Ticker gefunden.</div></div>';
      } else {
        slotEl.innerHTML = '<div class="card">' + head +
          redditBuzzBar(d, ticker) +
          '<div style="font-size:.62rem;color:var(--text-dim);margin-top:6px;">Quellen: ApeWisdom & Tradestie' + (meta.live ? ' (live)' : '') + ', keine Anlageberatung.</div>' +
          '</div>';
      }
      var btn = slotEl.querySelector('[data-upd="reddit"]');
      if (btn) btn.onclick = function () {
        window.App.UI.setUpdating(btn, true);
        redditCardHtml(ticker, slotEl, true);
      };
    });
  }

  function newsSlot(ticker, slotEl, force) {
    loadTicker(ticker, force).then(function (d) {
      if (!slotEl) return;
      slotEl.innerHTML = card('Nachrichten', d, false, 'news');
      var btn = slotEl.querySelector('[data-upd="news"]');
      if (btn) btn.onclick = function () {
        window.App.UI.setUpdating(btn, true);
        newsSlot(ticker, slotEl, true);
      };
    });
  }

  function fillTicker(ticker, slotEl, redditSlotEl) {
    if (slotEl) newsSlot(ticker, slotEl, false);
    if (redditSlotEl) redditCardHtml(ticker, redditSlotEl);
  }
  function sectorCardHtml(sector) {
    loadSectors().then(function (all) {
      var el = document.getElementById('news-sector-slot');
      if (el) el.innerHTML = card('Nachrichten · ' + sector, all && all[sector], true);
    });
    return '<div id="news-sector-slot"></div>';
  }

  // Prompt-Bausteine
  function promptBlock(ticker, n) {
    var d = cache.tickers[ticker];
    if (!d || !d.items || !d.items.length) return '';
    return d.items.slice(0, n || 5).map(function (i) {
      var rating = i.label ? i.label + ', ' + (i.score > 0 ? '+' : '') + i.score : 'noch nicht bewertet';
      return '- [' + (i.date || '').slice(0, 10) + '] (' + rating + ') ' + i.title + ' – ' + i.source;
    }).join('\n');
  }
  function indexLine(ticker, short) {
    var s = cache.index && cache.index[ticker];
    if (!s || !s.n) return '';
    var t = 'News-Stimmung: ' + (s.score > 0 ? '+' : '') + s.score + ' (' + s.pos + ' pos/' + s.neu + ' neu/' + s.neg + ' neg)';
    if (s.top) t += ', Top-Schlagzeile (' + s.top.l + '): ' + (short ? s.top.t.slice(0, 80) : s.top.t);
    return t;
  }
  function redditLine(ticker) {
    var d = cache.reddit && cache.reddit[ticker];
    if (!d) return '';
    var parts = [];
    if (d.mentions) {
      parts.push('ApeWisdom: ' + d.mentions + ' Mentions (24h), ' + (d.change_pct > 0 ? '+' : '') + d.change_pct + '% vs. Vortag');
    }
    if (d.sentiment) {
      parts.push('Tradestie (WSB): ' + d.sentiment + (d.sentiment_score !== undefined ? ' (Score: ' + d.sentiment_score + ')' : ''));
    }
    return parts.length ? 'Reddit-Aktivität: ' + parts.join(' | ') : '';
  }

  loadIndex(); loadSectors();
  return { cache: cache, loadIndex: loadIndex, loadSectors: loadSectors, loadTicker: loadTicker, loadReddit: loadReddit, loadRedditIndex: loadRedditIndex, redditMeta: redditMeta,
           fillTicker: fillTicker, sectorCardHtml: sectorCardHtml, redditCardHtml: redditCardHtml,
           promptBlock: promptBlock, indexLine: indexLine, redditLine: redditLine };
})();
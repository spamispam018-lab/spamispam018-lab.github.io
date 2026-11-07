/**
 * js/news.js – Nachrichten + FinBERT-Bewertung (Daten: data/news/*.json, erzeugt von scripts/fetch_news.py)
 * Aktien-Karte, Sektor-Karte und Textbausteine für die Gemini-Prompts.
 */
window.App = window.App || {};
window.App.News = (function () {
  'use strict';
  var RAW = 'https://raw.githubusercontent.com/spamispam018-lab/spamispam018-lab.github.io/main/data/news/';
  var cache = { index: null, sectors: null, tickers: {} };
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
  function loadTicker(t) { return load('tickers', encodeURIComponent(t) + '.json', t); }

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
      var l = i.label || 'neutral';
      return '<a href="' + esc(i.url) + '" target="_blank" rel="noopener" style="display:flex;gap:8px;padding:8px 0;border-top:1px solid var(--border-color,rgba(255,255,255,.08));text-decoration:none;color:inherit;">' +
        '<span title="' + TXT[l] + ' (' + (i.score > 0 ? '+' : '') + i.score + ')" style="flex:0 0 9px;height:9px;margin-top:5px;border-radius:50%;background:' + COL[l] + '"></span>' +
        '<span style="flex:1;font-size:.8rem;line-height:1.35;">' + esc(i.title) +
        '<span style="display:block;font-size:.66rem;color:var(--text-dim);margin-top:2px;">' + esc(i.source) + ' · ' + dateStr(i.date) + (showTicker && i.ticker ? ' · ' + esc(i.ticker) : '') + '</span></span></a>';
    }).join('');
  }
  function card(title, data, showTicker) {
    var body = (data && data.items && data.items.length)
      ? bar(data) + list(data.items, showTicker) + '<div style="font-size:.62rem;color:var(--text-dim);margin-top:6px;">Automatische Einschätzung (FinBERT), keine Anlageberatung.</div>'
      : '<div style="font-size:.75rem;color:var(--text-dim);">Keine aktuellen Nachrichten vorhanden.</div>';
    return '<div class="card"><div class="card-header-dotted"><span class="card-title">' + esc(title) + '</span></div>' + body + '</div>';
  }

  function fillTicker(ticker, slotEl) {
    loadTicker(ticker).then(function (d) { if (slotEl) slotEl.innerHTML = card('Nachrichten', d, false); });
  }
  function sectorCardHtml(sector) {
    loadSectors().then(function (all) {
      var el = document.getElementById('news-sector-slot');
      if (el) el.innerHTML = card('Nachrichten · ' + sector, all && all[sector], true);
    });
    return '<div id="news-sector-slot"></div>';
  }

  // Prompt-Bausteine (synchron, nutzen den Cache)
  function promptBlock(ticker, n) {
    var d = cache.tickers[ticker];
    if (!d || !d.items || !d.items.length) return '';
    return d.items.slice(0, n || 5).map(function (i) {
      return '- [' + (i.date || '').slice(0, 10) + '] (' + i.label + ', ' + (i.score > 0 ? '+' : '') + i.score + ') ' + i.title + ' – ' + i.source;
    }).join('\n');
  }
  function indexLine(ticker, short) {
    var s = cache.index && cache.index[ticker];
    if (!s || !s.n) return '';
    var t = 'News-Stimmung: ' + (s.score > 0 ? '+' : '') + s.score + ' (' + s.pos + ' pos/' + s.neu + ' neu/' + s.neg + ' neg)';
    if (s.top) t += ', Top-Schlagzeile (' + s.top.l + '): ' + (short ? s.top.t.slice(0, 80) : s.top.t);
    return t;
  }

  loadIndex(); loadSectors();
  return { cache: cache, loadIndex: loadIndex, loadSectors: loadSectors, loadTicker: loadTicker, fillTicker: fillTicker,
           sectorCardHtml: sectorCardHtml, promptBlock: promptBlock, indexLine: indexLine };
})();


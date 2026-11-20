/**
 * js/macro.js – Makro-Umfeld (Markt-Tab)
 * Zeigt Zinsen, Inflation, VIX, EUR/USD, Arbeitsmarkt, Kreditaufschläge und Kreditausfälle aus
 * data/macro.json (erzeugt von scripts/fetch_macro.py, Workflow "Makro-Daten aktualisieren").
 * Die Ampel basiert auf einfachen Faustregeln, keine Prognose und keine Anlageberatung.
 */
window.App = window.App || {};

window.App.Macro = (function () {
  'use strict';

  var GROUP_ORDER = ['Zinsen', 'Inflation', 'Marktangst', 'Wechselkurs', 'Arbeitsmarkt', 'Kreditaufschläge', 'Kreditausfälle'];
  var GROUP_ICON = { 'Zinsen': '🏦', 'Inflation': '🛒', 'Marktangst': '😨', 'Wechselkurs': '💱', 'Arbeitsmarkt': '👷', 'Kreditaufschläge': '📉', 'Kreditausfälle': '🏠' };
  var COLORS = { ok: 'var(--tag-green, #10b981)', warn: 'var(--tag-yellow, #f59e0b)', bad: 'var(--tag-red, #ef4444)', neutral: 'var(--text-dim, #94a3b8)' };
  var LABEL = { ok: 'unauffällig', warn: 'erhöht', bad: 'kritisch', neutral: 'neutral' };

  var cache = null;      // { data, error }
  var loading = null;
  var openGroups = {};   // Gruppe -> bool
  var expanded = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function load() {
    if (cache) return Promise.resolve(cache);
    if (loading) return loading;
    var D = window.App.Data;
    var p = (D && D.getJsonFile) ? D.getJsonFile('macro.json') : Promise.reject(new Error('Data.getJsonFile fehlt'));
    loading = p.then(function (data) {
      cache = { data: data, error: null };
      loading = null;
      return cache;
    }).catch(function (e) {
      loading = null;
      return { data: null, error: e && e.message ? e.message : 'Fehler' };
    });
    return loading;
  }

  function fmt(v, dec) {
    if (v == null || !isFinite(v)) return '–';
    return Number(v).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function spark(series, color) {
    if (!series || series.length < 2) return '';
    var w = 64, h = 22, mn = Math.min.apply(null, series), mx = Math.max.apply(null, series), rng = mx - mn || 1;
    var pts = series.map(function (v, i) {
      return (i / (series.length - 1) * w).toFixed(1) + ',' + (h - 2 - (v - mn) / rng * (h - 4)).toFixed(1);
    }).join(' ');
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="flex-shrink:0;"><polyline fill="none" stroke="' + color +
      '" stroke-width="1.5" stroke-linejoin="round" points="' + pts + '"/></svg>';
  }

  function dateDe(iso) {
    var d = new Date(iso);
    return isFinite(d) ? d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : iso;
  }

  function rowHtml(it) {
    var col = COLORS[it.signal] || COLORS.neutral;
    var val = fmt(it.value, it.decimals) + (it.unit && it.unit !== 'Pp' ? ' ' + it.unit : it.unit === 'Pp' ? ' Pp' : '');
    var d = it.delta;
    var dTxt = (d == null) ? '' : ((d >= 0 ? '+' : '') + fmt(d, Math.max(it.decimals, 1)) + ' ' + (it.deltaLabel || ''));
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px dashed var(--border-color,rgba(148,163,184,.2));">' +
      '<span title="' + esc(LABEL[it.signal]) + '" style="width:9px;height:9px;border-radius:50%;background:' + col + ';flex-shrink:0;"></span>' +
      '<div style="min-width:0;flex:1;">' +
        '<div style="font-size:.8rem;font-weight:600;color:var(--text-main);line-height:1.3;">' + esc(it.title) + '</div>' +
        '<div style="font-size:.68rem;color:var(--text-dim);margin-top:2px;">' + esc(dTxt) + (it.stale ? ' · veraltet' : '') + ' · Stand ' + esc(dateDe(it.date)) + '</div>' +
        (it.hint ? '<div style="font-size:.66rem;color:var(--text-dim);margin-top:2px;opacity:.85;">' + esc(it.hint) + '</div>' : '') +
      '</div>' +
      spark(it.series, col) +
      '<div style="font-size:.85rem;font-weight:700;color:var(--text-main);min-width:62px;text-align:right;">' + esc(val) + '</div>' +
    '</div>';
  }

  function summary(items) {
    var c = { ok: 0, warn: 0, bad: 0 };
    items.forEach(function (it) { if (c[it.signal] !== undefined) c[it.signal]++; });
    var rated = c.ok + c.warn + c.bad;
    if (!rated) return '';
    var tone = c.bad >= 2 ? 'bad' : (c.bad + c.warn >= Math.ceil(rated / 2) ? 'warn' : 'ok');
    var txt = { ok: 'Makro-Umfeld überwiegend unauffällig', warn: 'Makro-Umfeld gemischt, einige Warnsignale', bad: 'Makro-Umfeld angespannt, mehrere kritische Signale' }[tone];
    return '<span style="color:' + COLORS[tone] + ';font-weight:700;">● ' + txt + '</span>' +
      '<span style="color:var(--text-dim);"> (' + c.ok + ' unauffällig, ' + c.warn + ' erhöht, ' + c.bad + ' kritisch)</span>';
  }

  function bodyHtml(res) {
    if (!res.data) {
      return '<div style="font-size:.75rem;color:var(--text-dim);line-height:1.5;">Noch keine Makro-Daten vorhanden. Starte in GitHub unter Actions den Workflow „Makro-Daten aktualisieren" einmal manuell.' +
        (res.error ? ' <span style="opacity:.7;">(' + esc(res.error) + ')</span>' : '') + '</div>';
    }
    var items = res.data.items || [];
    var h = '<div style="font-size:.74rem;line-height:1.5;margin-bottom:6px;">' + summary(items) + '</div>';
    GROUP_ORDER.forEach(function (g) {
      var list = items.filter(function (it) { return it.group === g; });
      if (!list.length) return;
      var open = expanded || openGroups[g];
      var worst = list.some(function (i) { return i.signal === 'bad'; }) ? 'bad' : list.some(function (i) { return i.signal === 'warn'; }) ? 'warn' : list.every(function (i) { return i.signal === 'neutral'; }) ? 'neutral' : 'ok';
      h += '<div class="mac-group">' +
        '<button class="mac-toggle" data-g="' + esc(g) + '" style="all:unset;cursor:pointer;display:flex;align-items:center;gap:8px;width:100%;padding:10px 0;box-sizing:border-box;">' +
          '<span style="font-size:1rem;">' + (GROUP_ICON[g] || '') + '</span>' +
          '<span style="font-size:.82rem;font-weight:700;color:var(--text-main);flex:1;">' + esc(g) + '</span>' +
          '<span style="width:9px;height:9px;border-radius:50%;background:' + COLORS[worst] + ';"></span>' +
          '<span style="font-size:.8rem;color:var(--text-dim);">' + (open ? '▾' : '▸') + '</span>' +
        '</button>' +
        (open ? list.map(rowHtml).join('') : '') +
      '</div>';
    });
    var upd = res.data.updated ? new Date(res.data.updated) : null;
    h += '<div style="font-size:.64rem;color:var(--text-dim);margin-top:8px;line-height:1.5;">Quellen: FRED (US-Notenbank St. Louis) und Yahoo Finance' +
      (upd && isFinite(upd) ? ', Abruf ' + upd.toLocaleDateString('de-DE') + ' ' + upd.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : '') +
      '. Ampel nach Faustregeln, keine Prognose. Einkaufsmanagerindizes sind nicht kostenlos verfügbar, daher stehen Arbeitsmarktdaten (Sahm-Regel, Erstanträge) als Konjunktur-Frühindikatoren da. Keine Anlageberatung.</div>';
    return h;
  }

  function cardShell() {
    return '<div class="card" id="mac-card">' +
      '<div class="card-header-dotted" style="align-items:center;"><span class="card-title">Makro-Umfeld</span>' +
        '<button id="mac-expand" class="chip-btn" style="height:28px;font-size:.7rem;">' + (expanded ? 'Alles zuklappen' : 'Alles aufklappen') + '</button></div>' +
      '<div id="mac-body" style="font-size:.75rem;color:var(--text-dim);">Lade Makro-Daten…</div></div>';
  }

  function paint() {
    var body = document.getElementById('mac-body');
    var btn = document.getElementById('mac-expand');
    if (!body || !cache) return;
    body.innerHTML = bodyHtml(cache);
    if (btn) btn.textContent = expanded ? 'Alles zuklappen' : 'Alles aufklappen';
    [].forEach.call(body.querySelectorAll('.mac-toggle'), function (b) {
      b.onclick = function () {
        var g = b.getAttribute('data-g');
        if (expanded) { expanded = false; GROUP_ORDER.forEach(function (x) { openGroups[x] = true; }); openGroups[g] = false; }
        else openGroups[g] = !openGroups[g];
        paint();
      };
    });
  }

  /** HTML-Karte (wird in den Markt-Tab eingefügt). */
  function html() { return cardShell(); }

  /** Nach dem Einfügen aufrufen: lädt die Daten und zeichnet die Karte. */
  function bind() {
    var btn = document.getElementById('mac-expand');
    if (btn) btn.onclick = function () { expanded = !expanded; if (!expanded) openGroups = {}; paint(); };
    load().then(function (res) { cache = res; paint(); });
  }

  return { html: html, bind: bind };
})();

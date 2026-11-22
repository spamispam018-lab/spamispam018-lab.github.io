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

  var cache = null;        // { data, error }
  var loading = null;
  var openGroups = {};     // Gruppe -> bool
  var expanded = false;
  var openCharts = {};     // item.id -> bool (z.B. '^VIX': true)
  var activeIdx = {};      // item.id -> index in series (für Touch/Hover)

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

  function resolveSeriesDates(it, count) {
    if (Array.isArray(it.seriesDates) && it.seriesDates.length === count) {
      return it.seriesDates;
    }
    var endMs = it.date ? Date.parse(it.date) : NaN;
    if (!isFinite(endMs) || count < 2) return null;

    var stepsBack = count - 1;
    var daysPerStep = 1.4; // ca. 5 Handelstage pro 7 Kalendertage
    if (it.freq === 'w') daysPerStep = 7;
    else if (it.freq === 'm') daysPerStep = 30.4375;
    else if (it.freq === 'q') daysPerStep = 91.25;

    var out = [];
    for (var i = 0; i < count; i++) {
      var offsetDays = (stepsBack - i) * daysPerStep;
      out.push(new Date(endMs - offsetDays * 86400000).toISOString().slice(0, 10));
    }
    return out;
  }

  function detailChartHtml(it, col) {
    var series = it.series;
    if (!series || series.length < 2) {
      return '<div style="font-size:.7rem;color:var(--text-dim);padding:6px 0;">Nicht genügend Verlaufswerte vorhanden.</div>';
    }

    var isVix = it.id === '^VIX';
    var dates = resolveSeriesDates(it, series.length);

    var rawMin = Math.min.apply(null, series);
    var rawMax = Math.max.apply(null, series);
    var mn = rawMin;
    var mx = rawMax;

    if (isVix) {
      mn = Math.min(mn, 15);
      mx = Math.max(mx, 32);
    }

    var pad = (mx - mn) * 0.08 || 1;
    var yMin = mn - pad;
    var yMax = mx + pad;
    var yRng = yMax - yMin || 1;

    var w = 360, h = 132;
    var left = 36, right = 10, top = 12, bottom = 20;
    var pw = w - left - right;
    var ph = h - top - bottom;

    function xPos(i) {
      return left + (i / (series.length - 1)) * pw;
    }
    function yPos(v) {
      return top + (1 - (v - yMin) / yRng) * ph;
    }

    var coords = series.map(function (v, i) {
      return { x: xPos(i), y: yPos(v), v: v, i: i };
    });

    var linePts = coords.map(function (p) {
      return p.x.toFixed(1) + ',' + p.y.toFixed(1);
    }).join(' ');

    var areaPts = linePts +
      ' ' + coords[coords.length - 1].x.toFixed(1) + ',' + (top + ph).toFixed(1) +
      ' ' + coords[0].x.toFixed(1) + ',' + (top + ph).toFixed(1);

    var gradId = 'mac-grad-' + String(it.id).replace(/[^a-zA-Z0-9_-]/g, '_');

    var refLines = '';
    if (isVix) {
      [
        { val: 20, label: '20', color: 'rgba(245, 158, 11, 0.55)' },
        { val: 30, label: '30', color: 'rgba(239, 68, 68, 0.6)' }
      ].forEach(function (th) {
        if (th.val >= yMin && th.val <= yMax) {
          var ty = yPos(th.val);
          refLines += '<line x1="' + left + '" y1="' + ty.toFixed(1) + '" x2="' + (w - right) + '" y2="' + ty.toFixed(1) +
            '" stroke="' + th.color + '" stroke-width="1" stroke-dasharray="3,3"/>' +
            '<text x="' + (w - right - 2) + '" y="' + (ty - 3).toFixed(1) + '" text-anchor="end" fill="' + th.color +
            '" font-size="8.5" font-weight="600">' + th.label + '</text>';
        }
      });
    }

    var selIdx = (activeIdx[it.id] != null && activeIdx[it.id] >= 0 && activeIdx[it.id] < series.length)
      ? activeIdx[it.id]
      : series.length - 1;
    var sel = coords[selIdx];
    var selLabel = fmt(sel.v, it.decimals) + (it.unit && it.unit !== 'Pp' ? ' ' + it.unit : it.unit === 'Pp' ? ' Pp' : '');
    var selDate = dates ? dateDe(dates[selIdx]) : ('Punkt ' + (selIdx + 1) + '/' + series.length);

    var avg = series.reduce(function (acc, v) { return acc + v; }, 0) / series.length;

    return '<div class="mac-chart-box" data-id="' + esc(it.id) + '" style="margin:2px 0 10px 19px;padding:8px 10px;border-radius:10px;background:rgba(148,163,184,.07);border:1px solid var(--border-color,rgba(148,163,184,.2));">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px;font-size:.69rem;">' +
        '<span style="color:var(--text-main);font-weight:700;">' + esc(selLabel) + ' <span style="color:var(--text-dim);font-weight:400;">(' + esc(selDate) + ')</span></span>' +
        '<span style="color:var(--text-dim);font-size:.64rem;">' + series.length + ' Werte · Ø ' + esc(fmt(avg, it.decimals)) + '</span>' +
      '</div>' +
      '<svg class="mac-svg" data-id="' + esc(it.id) + '" data-count="' + series.length + '" data-left="' + left + '" data-pw="' + pw +
        '" viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto;display:block;touch-action:none;cursor:crosshair;">' +
        '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="' + col + '" stop-opacity="0.24"/>' +
          '<stop offset="100%" stop-color="' + col + '" stop-opacity="0.01"/>' +
        '</linearGradient></defs>' +
        '<line x1="' + left + '" y1="' + top + '" x2="' + (w - right) + '" y2="' + top + '" stroke="rgba(148,163,184,.16)" stroke-width="1"/>' +
        '<line x1="' + left + '" y1="' + (top + ph) + '" x2="' + (w - right) + '" y2="' + (top + ph) + '" stroke="rgba(148,163,184,.22)" stroke-width="1"/>' +
        '<text x="' + (left - 5) + '" y="' + (top + 4) + '" text-anchor="end" fill="rgba(148,163,184,.85)" font-size="8.5">' + esc(fmt(yMax, it.decimals)) + '</text>' +
        '<text x="' + (left - 5) + '" y="' + (top + ph) + '" text-anchor="end" fill="rgba(148,163,184,.85)" font-size="8.5">' + esc(fmt(yMin, it.decimals)) + '</text>' +
        refLines +
        '<polygon points="' + areaPts + '" fill="url(#' + gradId + ')"/>' +
        '<polyline fill="none" stroke="' + col + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" points="' + linePts + '"/>' +
        '<line x1="' + sel.x.toFixed(1) + '" y1="' + top + '" x2="' + sel.x.toFixed(1) + '" y2="' + (top + ph) + '" stroke="rgba(148,163,184,.45)" stroke-width="1" stroke-dasharray="2,2"/>' +
        '<circle cx="' + sel.x.toFixed(1) + '" cy="' + sel.y.toFixed(1) + '" r="3.6" fill="' + col + '" stroke="#0f172a" stroke-width="1.2"/>' +
        '<text x="' + left + '" y="' + (h - 4) + '" text-anchor="start" fill="rgba(148,163,184,.8)" font-size="8.5">' +
          esc(dates ? dateDe(dates[0]) : 'Start') + '</text>' +
        '<text x="' + (w - right) + '" y="' + (h - 4) + '" text-anchor="end" fill="rgba(148,163,184,.8)" font-size="8.5">' +
          esc(dates ? dateDe(dates[dates.length - 1]) : 'Aktuell') + '</text>' +
      '</svg>' +
      '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:.62rem;color:var(--text-dim);">' +
        '<span>Tief: ' + esc(fmt(rawMin, it.decimals)) + '</span>' +
        '<span>Hoch: ' + esc(fmt(rawMax, it.decimals)) + '</span>' +
        '<span>Wischen/Tippen zum Prüfen</span>' +
      '</div>' +
    '</div>';
  }

  function rowHtml(it) {
    var col = COLORS[it.signal] || COLORS.neutral;
    var val = fmt(it.value, it.decimals) + (it.unit && it.unit !== 'Pp' ? ' ' + it.unit : it.unit === 'Pp' ? ' Pp' : '');
    var d = it.delta;
    var dTxt = (d == null) ? '' : ((d >= 0 ? '+' : '') + fmt(d, Math.max(it.decimals, 1)) + ' ' + (it.deltaLabel || ''));
    var hasSeries = Array.isArray(it.series) && it.series.length >= 2;
    var chartOpen = hasSeries && !!openCharts[it.id];

    return '<div class="mac-row-wrap">' +
      '<div class="mac-row" data-id="' + esc(it.id) + '" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px dashed var(--border-color,rgba(148,163,184,.2));' +
        (hasSeries ? 'cursor:pointer;' : '') + '">' +
        '<span title="' + esc(LABEL[it.signal]) + '" style="width:9px;height:9px;border-radius:50%;background:' + col + ';flex-shrink:0;"></span>' +
        '<div style="min-width:0;flex:1;">' +
          '<div style="font-size:.8rem;font-weight:600;color:var(--text-main);line-height:1.3;display:flex;align-items:center;gap:5px;">' +
            '<span>' + esc(it.title) + '</span>' +
            (hasSeries ? '<span style="font-size:.66rem;color:var(--text-dim);">' + (chartOpen ? '▾' : '▸') + '</span>' : '') +
          '</div>' +
          '<div style="font-size:.68rem;color:var(--text-dim);margin-top:2px;">' + esc(dTxt) + (it.stale ? ' · veraltet' : '') + ' · Stand ' + esc(dateDe(it.date)) + '</div>' +
          (it.hint ? '<div style="font-size:.66rem;color:var(--text-dim);margin-top:2px;opacity:.85;">' + esc(it.hint) + '</div>' : '') +
        '</div>' +
        spark(it.series, col) +
        '<div style="font-size:.85rem;font-weight:700;color:var(--text-main);min-width:62px;text-align:right;">' + esc(val) + '</div>' +
      '</div>' +
      (chartOpen ? detailChartHtml(it, col) : '') +
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

  function scrubSvg(svg, clientX) {
    var rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    var vbW = 360;
    var left = Number(svg.getAttribute('data-left') || 36);
    var pw = Number(svg.getAttribute('data-pw') || 314);
    var count = Number(svg.getAttribute('data-count') || 0);
    if (count < 2) return;

    var xInVb = ((clientX - rect.left) / rect.width) * vbW;
    var ratio = Math.max(0, Math.min(1, (xInVb - left) / pw));
    var idx = Math.round(ratio * (count - 1));
    var id = svg.getAttribute('data-id');
    if (id && activeIdx[id] !== idx) {
      activeIdx[id] = idx;
      paint();
    }
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

    [].forEach.call(body.querySelectorAll('.mac-row'), function (r) {
      r.onclick = function () {
        var id = r.getAttribute('data-id');
        if (!id) return;
        openCharts[id] = !openCharts[id];
        if (!openCharts[id]) delete activeIdx[id];
        paint();
      };
    });

    [].forEach.call(body.querySelectorAll('.mac-svg'), function (svg) {
      svg.onpointerdown = function (e) {
        e.stopPropagation();
        if (svg.setPointerCapture && e.pointerId != null) {
          try { svg.setPointerCapture(e.pointerId); } catch (_) {}
        }
        scrubSvg(svg, e.clientX);
      };
      svg.onpointermove = function (e) {
        if (e.buttons === 1 || e.pointerType === 'touch') {
          scrubSvg(svg, e.clientX);
        }
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

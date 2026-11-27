/**
 * js/ai-insights.js
 * Entdecken › KI: nächtliche KI-Vorschläge (data/ai_insights.json, erzeugt von scripts/fetch_ai_insights.py).
 * - Top 10 über alle Sektoren mit Marktübersicht
 * - Je Sektor: Zusammenfassung, Kandidaten, Warnungen
 * - Filter nach Region (USA, Deutschland, Europa)
 */
window.App = window.App || {};

window.App.AIInsights = (function () {
  'use strict';

  var state = { region: 'alle', sector: null };
  var cache = null;      // { data, uni }

  var REGIONS = [
    { id: 'alle', label: 'Alle' },
    { id: 'USA', label: 'USA' },
    { id: 'DE', label: 'Deutschland' },
    { id: 'EU', label: 'Europa' }
  ];

  var INFO = {
    about: { title: 'Wie entstehen die Vorschläge?', text: 'Jeden Abend nach dem Datenabruf wertet eine KI (Google Gemini) die Kennzahlen aller Aktien aus – je Sektor getrennt, damit nur vergleichbare Unternehmen verglichen werden. Danach vergleicht sie die besten Kandidaten aller Sektoren und erstellt die Top 10 (höchstens 3 je Sektor). Die KI sieht nur die Zahlen aus deinen Daten, keine Nachrichtenartikel im Volltext und nicht dein Depot. Ticker, die nicht in den Daten stehen, werden automatisch verworfen.' },
    limits: { title: 'Wie verlässlich ist das?', text: 'Es ist eine Einschätzung auf Basis vergangener Zahlen, keine Anlageberatung und keine Prognose. Die KI kann Zahlen falsch gewichten. Prüfe jeden Vorschlag in der Detailansicht (Chart, Fundamental, Risiko), bevor du handelst.' },
    conviction: { title: 'Überzeugung (1–5)', text: 'Wie deutlich die Zahlen aus Sicht der KI für den Kandidaten sprechen. Kein Maß für die Sicherheit eines Gewinns.' }
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function info(k) { return window.App.UI && window.App.UI.info ? window.App.UI.info(k) : ''; }

  function regionMatch(region) {
    if (state.region === 'alle') return true;
    if (state.region === 'USA') return region === 'USA';
    if (state.region === 'DE') return region === 'DAX' || region === 'MDAX' || region === 'Deutschland';
    if (state.region === 'EU') return region === 'Europa';
    return true;
  }

  function fmtStamp(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' Uhr';
  }

  function priceHtml(t) {
    var u = cache && cache.uni[t];
    if (!u || u.price == null) return '';
    var F = window.App.Format;
    var chg = u.changePercent || 0;
    return '<span style="text-align:right;flex-shrink:0;">' +
      '<span style="display:block;font-weight:700;font-variant-numeric:tabular-nums;">' + F.currency(u.price, u.currency) + '</span>' +
      '<span class="' + F.changeClass(chg) + '" style="display:block;font-size:0.72rem;font-weight:700;">' + (chg >= 0 ? '+' : '') + F.number(chg, 2) + ' %</span>' +
    '</span>';
  }

  var WARN_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true" style="flex-shrink:0;margin-top:2px;"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>';

  function itemHtml(o) {
    // o: { ticker, name, badge, thesis, lines[], risk, conviction }
    var dots = '';
    if (o.conviction) {
      for (var i = 1; i <= 5; i++) dots += '<span style="display:inline-block;width:6px;height:6px;border-radius:3px;margin-left:2px;background:' + (i <= o.conviction ? 'var(--accent-purple-light)' : 'var(--border-color)') + ';"></span>';
    }
    return '<div class="ai-item" role="link" tabindex="0" data-ticker="' + esc(o.ticker) + '">' +
      '<div style="display:flex;align-items:flex-start;gap:10px;">' +
        (o.rank ? '<span class="ai-rank">' + o.rank + '</span>' : '') +
        '<span style="flex:1;min-width:0;">' +
          '<span style="display:block;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(o.name) + '</span>' +
          '<span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px;">' +
            '<span class="ticker-badge">' + esc(o.ticker) + '</span>' +
            (o.badge ? '<span class="period-tag" style="font-size:0.62rem;">' + esc(o.badge) + '</span>' : '') +
            (dots ? '<span title="Überzeugung ' + o.conviction + ' von 5" aria-label="Überzeugung ' + o.conviction + ' von 5">' + dots + '</span>' : '') +
          '</span>' +
        '</span>' +
        priceHtml(o.ticker) +
      '</div>' +
      (o.thesis ? '<div style="font-weight:600;font-size:0.85rem;margin-top:8px;line-height:1.35;">' + esc(o.thesis) + '</div>' : '') +
      (o.lines && o.lines.length ? '<ul class="ai-reasons">' + o.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '') +
      (o.risk ? '<div class="ai-risk">' + WARN_SVG + '<span>' + esc(o.risk) + '</span></div>' : '') +
    '</div>';
  }

  function emptyHtml(msg) {
    return '<div style="font-size:0.82rem;color:var(--text-dim);padding:6px 0;">' + msg + '</div>';
  }

  function render(container) {
    var d = cache.data;
    var sectors = d.sectors || {};
    var sectorKeys = Object.keys(sectors).sort(function (a, b) {
      if (a === 'ETF') return 1;
      if (b === 'ETF') return -1;
      return (sectors[b].count || 0) - (sectors[a].count || 0);
    });
    if (!state.sector || !sectors[state.sector]) state.sector = sectorKeys[0] || null;

    var html = '<div class="view-container">';

    // Kopf
    html += '<div class="card" style="padding:14px 16px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
        '<div><div style="font-weight:800;font-size:1.05rem;display:flex;align-items:center;">KI-Vorschläge' + info('about') + '</div>' +
        '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:2px;">Stand ' + esc(fmtStamp(d.updatedAt)) + ' · ' + esc(d.universeSize || '') + ' Werte</div></div>' +
        '<span class="period-tag" style="display:inline-flex;align-items:center;white-space:nowrap;flex-shrink:0;">Keine Beratung' + info('limits') + '</span>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:10px;">' +
        '<button type="button" class="upd-btn" id="ai-rerun">Neu auswerten</button>' +
      '</div>' +
      ((d.pending && d.pending.length) ? '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:8px;line-height:1.4;">Noch nicht neu ausgewertet: ' + esc(d.pending.join(', ')) + '. Der nächste Lauf macht dort weiter.</div>' :
        (d.errors && d.errors.length) ? '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:8px;">Nicht aktualisiert: ' + esc(d.errors.map(function (e) { return e.segment; }).join(', ')) + ' (vorheriger Stand oder fehlend).</div>' : '') +
    '</div>';

    // Region
    html += '<div class="segbar" role="tablist" aria-label="Region" style="margin-bottom:14px;">' +
      REGIONS.map(function (r) {
        var on = state.region === r.id;
        return '<button class="segbar-btn' + (on ? ' active' : '') + '" role="tab" aria-selected="' + on + '" data-ai-region="' + r.id + '">' + r.label + '</button>';
      }).join('') + '</div>';

    // Top 10
    var overall = d.overall || {};
    var top = (overall.top || []).filter(function (x) { return regionMatch(x.region); });
    html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Top 10 über alle Sektoren</span>' +
      (overall.stale ? '<span class="period-tag">älterer Stand</span>' : '') + '</div>';
    if (overall.updatedAt || (overall.stale && d.pending && d.pending.length)) {
      html += '<div style="font-size:0.7rem;color:var(--text-dim);margin:-2px 0 8px;">' +
        (overall.updatedAt ? 'Stand ' + esc(fmtStamp(overall.updatedAt)) : '') +
        (overall.stale && d.pending && d.pending.length ? (overall.updatedAt ? ' · ' : '') + 'wird neu erstellt, sobald alle Sektoren aktuell sind' : '') + '</div>';
    }
    if (overall.marketView) html += '<div class="ai-summary">' + esc(overall.marketView) + '</div>';
    html += top.length ? top.map(function (x) {
      return itemHtml({ rank: x.rank, ticker: x.ticker, name: x.name, badge: (x.sectorDe || '') + (x.type ? ' · ' + x.type : ''), thesis: x.thesis, lines: x.why ? [x.why] : [], risk: x.risk });
    }).join('') : emptyHtml(state.region === 'alle' ? 'Noch keine Gesamtauswertung vorhanden.' : 'Keine Top-Werte aus dieser Region.');
    html += '</div>';

    // Sektoren
    if (sectorKeys.length) {
      var sec = sectors[state.sector];
      html += '<div class="card"><div class="card-header-dotted"><span class="card-title" style="display:flex;align-items:center;">Nach Sektor' + info('conviction') + '</span>' +
        (sec && sec.stale ? '<span class="period-tag">älterer Stand</span>' : '') + '</div>';
      html += '<div class="horizontal-scroll-row" style="margin:0 -4px 12px;padding:0 4px;">' + sectorKeys.map(function (k) {
        var s = sectors[k];
        var n = (s.picks || []).filter(function (p) { return regionMatch(p.region); }).length;
        return '<button class="chip-btn' + (k === state.sector ? ' active' : '') + '" style="flex-shrink:0;white-space:nowrap;" data-ai-sector="' + esc(k) + '">' + esc(s.name || k) + (n ? ' (' + n + ')' : '') + '</button>';
      }).join('') + '</div>';

      if (sec) {
        if (sec.updatedAt) html += '<div style="font-size:0.7rem;color:var(--text-dim);margin:-4px 0 8px;">Stand ' + esc(fmtStamp(sec.updatedAt)) + '</div>';
        if (sec.summary) html += '<div class="ai-summary">' + esc(sec.summary) + '</div>';
        var picks = (sec.picks || []).filter(function (p) { return regionMatch(p.region); });
        html += picks.length ? picks.map(function (p) {
          return itemHtml({ ticker: p.ticker, name: p.name, badge: p.type, thesis: p.thesis, lines: p.reasons || [], risk: (p.risks || [])[0], conviction: p.conviction });
        }).join('') : emptyHtml('Keine Kandidaten aus dieser Region in diesem Sektor.');

        var warns = (sec.warnings || []).filter(function (w) { return regionMatch(w.region); });
        if (warns.length) {
          html += '<div class="ai-warn-title">Vorsicht bei</div>';
          html += warns.map(function (w) {
            return '<div class="ai-item ai-item-warn" role="link" tabindex="0" data-ticker="' + esc(w.ticker) + '">' +
              '<div style="display:flex;align-items:flex-start;gap:10px;">' +
                '<span style="flex:1;min-width:0;"><span style="display:block;font-weight:700;">' + esc(w.name) + ' <span class="ticker-badge" style="margin-left:4px;">' + esc(w.ticker) + '</span></span>' +
                '<span class="ai-risk" style="margin-top:6px;">' + WARN_SVG + '<span>' + esc(w.reason) + '</span></span></span>' +
                priceHtml(w.ticker) +
              '</div></div>';
          }).join('');
        }
      }
      html += '</div>';
    }

    html += '<div style="font-size:0.7rem;color:var(--text-dim);line-height:1.45;padding:2px 4px 12px;">' +
      'Automatisch erstellt von ' + esc(String(d.model || 'KI').replace(/(^|, )groq:(openai\/)?/g, '$1Groq ').replace(/(^|, )gemini:/g, '$1')) + ' auf Basis der App-Daten. Keine Anlageberatung – Vorschläge immer selbst prüfen.</div>';
    html += '</div>';

    container.innerHTML = html;
    bind(container);
  }

  function bind(container) {
    if (window.App.UI && window.App.UI.bindInfo) window.App.UI.bindInfo(container, INFO);
    var rerun = container.querySelector('#ai-rerun');
    if (rerun) rerun.onclick = function () { if (window.App.Sync) window.App.Sync.open({ highlight: 'update_ai.yml' }); };
    container.querySelectorAll('[data-ai-region]').forEach(function (b) {
      b.onclick = function () { state.region = b.getAttribute('data-ai-region'); render(container); };
    });
    container.querySelectorAll('[data-ai-sector]').forEach(function (b) {
      b.onclick = function () { state.sector = b.getAttribute('data-ai-sector'); render(container); };
    });
    container.querySelectorAll('.ai-item[data-ticker]').forEach(function (el) {
      var go = function () { window.App.Router.navigate('/stock/' + el.getAttribute('data-ticker') + '/overview'); };
      el.onclick = function (e) { if (e.target.closest('.info-i')) return; go(); };
      el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
  }

  function setupHtml() {
    return '<div class="view-container"><div class="card" style="padding:18px;">' +
      '<div style="font-weight:800;font-size:1.05rem;margin-bottom:6px;">KI-Vorschläge einrichten</div>' +
      '<div style="font-size:0.82rem;color:var(--text-muted);line-height:1.55;">Noch keine Auswertung vorhanden. So richtest du sie einmalig ein:</div>' +
      '<ol style="font-size:0.82rem;color:var(--text-muted);line-height:1.6;padding-left:18px;margin:10px 0 0;">' +
        '<li>In Google AI Studio einen kostenlosen API-Schlüssel erstellen.</li>' +
        '<li>Im GitHub-Repo unter Settings › Secrets and variables › Actions ein Secret <b>GEMINI_API_KEY</b> mit dem Schlüssel anlegen.</li>' +
        '<li>Unter Actions › „KI-Vorschläge“ › Run workflow den ersten Lauf starten. Danach läuft er jeden Abend automatisch nach dem Marktdaten-Update.</li>' +
      '</ol></div></div>';
  }

  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;
    container.innerHTML = '<div class="view-container"><div class="state-box"><div class="spinner"></div><p>Lade KI-Vorschläge…</p></div></div>';

    var D = window.App.Data;
    Promise.all([
      D.getJsonFile('ai_insights.json', { fresh: true }).catch(function () { return null; }),
      D.getUniverse().catch(function () { return []; })
    ]).then(function (res) {
      if (!document.body.contains(container)) return;
      var data = res[0];
      if (!data || (!data.overall && !data.sectors)) { container.innerHTML = setupHtml(); return; }
      var uni = {};
      (res[1] || []).forEach(function (u) { uni[u.ticker] = u; });
      cache = { data: data, uni: uni };
      render(container);
    });
  }

  // Nach einem fertigen KI-Lauf: neue Datei abwarten (GitHub Pages braucht ein paar Minuten) und Seite neu zeichnen
  var waitTimer = null;
  window.addEventListener('app:workflow-done', function (ev) {
    if (!ev.detail || ev.detail.file !== 'update_ai.yml' || !ev.detail.success) return;
    var before = cache && cache.data && cache.data.updatedAt;
    var tries = 0;
    clearTimeout(waitTimer);
    (function check() {
      tries++;
      window.App.Data.getJsonFile('ai_insights.json', { fresh: true }).then(function (d) {
        if (d && d.updatedAt && d.updatedAt !== before) {
          if (cache) cache.data = d;
          var c = document.getElementById('app-view-content');
          if (location.hash.indexOf('#/ai') === 0 && c) initView();
          if (window.App.UI && window.App.UI.toast) window.App.UI.toast('Neue KI-Auswertung geladen');
          return;
        }
        if (tries < 16) waitTimer = setTimeout(check, 30000);
      }).catch(function () { if (tries < 16) waitTimer = setTimeout(check, 30000); });
    })();
  });

  return { initView: initView };
})();

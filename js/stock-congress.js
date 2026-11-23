/**
 * js/stock-congress.js
 * Kongress-Tab der Aktiendetailseite: Aktiengeschäfte von US-Senatoren und Abgeordneten (STOCK-Act-Meldungen).
 * Quelle: Financial Modeling Prep (Senat + Repräsentantenhaus), Key wird lokal im Browser gespeichert (js/providers.js).
 * Ansichten: „Diese Aktie“ und „Neueste Meldungen“ (alle Aktien).
 */

window.App = window.App || {};

window.App.StockCongress = (function () {
  'use strict';

  var P = function () { return window.App.Providers; };
  var F = function () { return window.App.Format; };
  var state = { scope: 'symbol', type: 'all', chamber: 'all' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function typeBadge(t) {
    if (t.type === 'buy') return '<span class="badge-pill" style="background:var(--bullish-bg);color:var(--bullish);">Kauf</span>';
    if (t.type === 'sell') {
      var partial = /partial/i.test(t.rawType) ? ' (teil)' : '';
      return '<span class="badge-pill" style="background:var(--bearish-bg);color:var(--bearish);">Verkauf' + partial + '</span>';
    }
    return '<span class="badge-pill">' + esc(t.rawType || 'Sonstige') + '</span>';
  }

  function daysBetween(a, b) {
    if (!a || !b) return null;
    var d = Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
    return isFinite(d) && d >= 0 ? d : null;
  }

  function fmtUsd(v) {
    if (v == null) return '—';
    if (v >= 1e6) return F().number(v / 1e6, 1) + ' Mio. $';
    return F().number(v / 1e3, 0) + ' Tsd. $';
  }

  function render(container, stock) {
    var ticker = (stock.ticker || (stock.profile && stock.profile.ticker) || '').toUpperCase();
    draw(container, ticker, false);
  }

  function keyCardHtml(has) {
    return '<div class="card" data-congress-key>' +
      '<div class="card-header-dotted"><span class="card-title">FMP-Key für Kongress-Trades</span></div>' +
      '<div style="font-size:0.75rem;color:var(--text-dim);line-height:1.5;margin-bottom:10px;">' +
        'Die Meldungen kommen von Financial Modeling Prep (Senat- und Repräsentantenhaus-Endpunkte; je nach Tarif evtl. kostenpflichtig). ' +
        'Der Key bleibt in diesem Browser und geht nur an FMP. ' +
        '<a href="' + P().META.fmp.signup + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent-purple-light);">Key beantragen ↗</a></div>' +
      '<div style="display:flex;gap:8px;">' +
        '<input type="password" class="search-input" data-key-input autocomplete="off" spellcheck="false" placeholder="' + (has ? '•••••••• (gespeichert)' : 'FMP-Key einfügen') + '" style="flex:1;padding-left:12px;">' +
        '<button class="chip-btn active" data-key-save>Speichern</button>' +
        (has ? '<button class="chip-btn" data-key-delete>Löschen</button>' : '') +
      '</div></div>';
  }

  function bindKey(container, ticker) {
    var card = container.querySelector('[data-congress-key]');
    if (!card) return;
    var input = card.querySelector('[data-key-input]'), save = card.querySelector('[data-key-save]'), del = card.querySelector('[data-key-delete]');
    if (save) save.onclick = function () {
      var v = (input.value || '').trim();
      if (!v) return;
      P().setKey('fmp', v);
      draw(container, ticker, true);
    };
    if (input) input.onkeydown = function (e) { if (e.key === 'Enter' && save) save.click(); };
    if (del) del.onclick = function () { P().setKey('fmp', ''); draw(container, ticker, false); };
  }

  function draw(container, ticker, force) {
    var scopeChips =
      '<button class="chip-btn ' + (state.scope === 'symbol' ? 'active' : '') + '" data-cg-scope="symbol">' + esc(ticker) + '</button>' +
      '<button class="chip-btn ' + (state.scope === 'latest' ? 'active' : '') + '" data-cg-scope="latest">Neueste Meldungen (alle)</button>';
    var head = '<div class="horizontal-scroll-row" style="margin-bottom:12px;">' + scopeChips + '</div>';

    if (!P().getKey('fmp')) {
      container.innerHTML = head + keyCardHtml(false);
      bindScope(container, ticker);
      bindKey(container, ticker);
      return;
    }
    container.innerHTML = head + '<div id="cg-body"><div class="state-box"><div class="spinner"></div><p>Lade Kongress-Meldungen…</p></div></div>';
    bindScope(container, ticker);

    var scope = state.scope;
    P().getCongressTrades(scope === 'symbol' ? ticker : null, { force: force }).then(function (data) {
      if (state.scope !== scope) return;
      drawData(container, ticker, data, scope);
    }).catch(function (err) {
      if (state.scope !== scope) return;
      var body = container.querySelector('#cg-body');
      body.innerHTML = '<div class="state-box"><p style="color:var(--bearish);font-weight:700;">Abruf fehlgeschlagen</p><p style="font-size:0.85rem;">' + esc(err && err.message) + '</p>' +
        '<button class="chip-btn active" id="cg-retry" style="margin-top:10px;">Erneut versuchen</button></div>' +
        '<details style="margin-top:10px;"><summary style="font-size:0.75rem;color:var(--text-dim);cursor:pointer;">API-Key verwalten</summary><div style="margin-top:8px;">' + keyCardHtml(true) + '</div></details>';
      body.querySelector('#cg-retry').onclick = function () { draw(container, ticker, true); };
      bindKey(container, ticker);
    });
  }

  function bindScope(container, ticker) {
    container.querySelectorAll('[data-cg-scope]').forEach(function (b) {
      b.onclick = function () { state.scope = b.getAttribute('data-cg-scope'); draw(container, ticker, false); };
    });
  }

  function drawData(container, ticker, data, scope) {
    var f = F();
    var body = container.querySelector('#cg-body');
    var all = data.trades;

    var yearAgo = new Date(); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    var cut = yearAgo.toISOString().slice(0, 10);
    var recent = all.filter(function (t) { return t.txDate >= cut; });
    var buys = recent.filter(function (t) { return t.type === 'buy'; });
    var sells = recent.filter(function (t) { return t.type === 'sell'; });
    var mid = function (list) {
      return list.reduce(function (s, t) { return s + (t.amtLow != null ? (t.amtLow + t.amtHigh) / 2 : 0); }, 0);
    };

    var filtered = all.filter(function (t) {
      if (state.type !== 'all' && t.type !== state.type) return false;
      if (state.chamber !== 'all' && t.chamber !== state.chamber) return false;
      return true;
    });

    function pill(group, val, label) {
      return '<button class="chip-btn ' + (state[group] === val ? 'active' : '') + '" data-cg-' + group + '="' + val + '">' + label + '</button>';
    }

    var html = '';
    if (data.notes && data.notes.length) {
      html += '<div class="card" style="font-size:0.75rem;color:var(--text-dim);line-height:1.5;">' + data.notes.map(function (n) { return '<div>• ' + esc(n) + '</div>'; }).join('') + '</div>';
    }

    if (scope === 'symbol') {
      html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Letzte 12 Monate</span><span class="period-tag">' + recent.length + ' Meldungen</span></div>' +
        '<div class="metrics-grid-2col" style="margin-bottom:0;">' +
          '<div class="metric-cell"><span class="metric-label">Käufe</span><span class="metric-value" style="color:var(--bullish);">' + buys.length + '</span><span style="font-size:0.65rem;color:var(--text-dim);">≈ ' + fmtUsd(mid(buys)) + ' (Spannen-Mitte)</span></div>' +
          '<div class="metric-cell"><span class="metric-label">Verkäufe</span><span class="metric-value" style="color:var(--bearish);">' + sells.length + '</span><span style="font-size:0.65rem;color:var(--text-dim);">≈ ' + fmtUsd(mid(sells)) + ' (Spannen-Mitte)</span></div>' +
        '</div></div>';
    }

    html += '<div class="horizontal-scroll-row" style="margin-bottom:12px;">' +
      pill('type', 'all', 'Alle') + pill('type', 'buy', 'Käufe') + pill('type', 'sell', 'Verkäufe') +
      pill('chamber', 'all', 'Beide Kammern') + pill('chamber', 'Senat', 'Senat') + pill('chamber', 'Repräsentantenhaus', 'Abgeordnetenhaus') + '</div>';

    html += '<div class="card"><div class="card-header-dotted"><span class="card-title">' + (scope === 'symbol' ? 'Meldungen zu ' + esc(ticker) : 'Neueste Meldungen') + '</span>' +
      '<span class="period-tag">' + filtered.length + '</span></div>';

    if (!filtered.length) {
      html += '<div style="font-size:0.82rem;color:var(--text-dim);">' + (all.length ? 'Keine Meldungen für diesen Filter.' : (scope === 'symbol' ? 'Keine Kongress-Meldungen zu ' + esc(ticker) + ' gefunden.' : 'Keine Meldungen erhalten.')) + '</div>';
    } else {
      html += '<div class="table-responsive-wrapper"><table class="data-table compact"><thead><tr><th>Trade</th>' + (scope === 'latest' ? '<th>Aktie</th>' : '') +
        '<th>Person</th><th>Art / Betrag</th></tr></thead><tbody>';
      filtered.slice(0, 60).forEach(function (t) {
        var lag = daysBetween(t.txDate, t.discDate);
        var who = t.link ? '<a href="' + esc(t.link) + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent-purple-light);">' + esc(t.name) + ' ↗</a>' : esc(t.name);
        var tick = t.ticker ? '<a href="#/stock/' + encodeURIComponent(t.ticker) + '/congress" style="color:var(--accent-purple-light);font-weight:700;">' + esc(t.ticker) + '</a>' : '—';
        html += '<tr><td style="white-space:nowrap;">' + (t.txDate ? f.date(t.txDate) : '—') +
            '<div style="font-size:0.68rem;color:var(--text-dim);">' + (lag == null ? '' : 'gemeldet nach ' + lag + ' Tagen') + '</div></td>' +
          (scope === 'latest' ? '<td>' + tick + '</td>' : '') +
          '<td>' + who + '<div style="font-size:0.68rem;color:var(--text-dim);">' + esc(t.chamber) + (t.owner ? ' · ' + esc(t.owner) : '') + '</div></td>' +
          '<td>' + typeBadge(t) + '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:3px;">' + esc(t.amountText || '—') + '</div></td></tr>';
      });
      html += '</tbody></table></div>';
      if (filtered.length > 60) html += '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:6px;">Die neuesten 60 von ' + filtered.length + ' Meldungen.</div>';
    }
    html += '</div>';

    html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:0.7rem;color:var(--text-dim);padding:2px 4px 8px;flex-wrap:wrap;">' +
        '<span>Stand: ' + f.date(String(data.fetchedAt).slice(0, 10)) + (data.fromCache ? ' (zwischengespeichert)' : '') + '</span>' +
        '<button class="chip-btn" id="cg-reload">Neu laden</button></div>' +
      '<details style="margin-bottom:12px;"><summary style="font-size:0.75rem;color:var(--text-dim);cursor:pointer;">API-Key verwalten</summary><div style="margin-top:8px;">' + keyCardHtml(true) + '</div></details>' +
      '<div style="font-size:0.7rem;color:var(--text-dim);line-height:1.45;padding:2px 4px 12px;">' +
        'Mitglieder des Kongresses müssen Geschäfte nach dem STOCK Act spätestens nach 45 Tagen melden – die Daten sind also verzögert. ' +
        'Beträge werden nur als Spannen gemeldet. Ein Trade ist kein Kaufsignal; Hintergründe und Motive sind unbekannt. Keine Anlageberatung.</div>';

    body.innerHTML = html;

    ['type', 'chamber'].forEach(function (group) {
      body.querySelectorAll('[data-cg-' + group + ']').forEach(function (b) {
        b.onclick = function () { state[group] = b.getAttribute('data-cg-' + group); drawData(container, ticker, data, scope); };
      });
    });
    var reload = body.querySelector('#cg-reload');
    if (reload) reload.onclick = function () { draw(container, ticker, true); };
    bindKey(container, ticker);
  }

  return { render: render };
})();

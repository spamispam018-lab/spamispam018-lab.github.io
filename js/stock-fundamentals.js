/**
 * js/stock-fundamentals.js
 * Fundamentals-Tab der Aktiendetailseite: Kennzahlen und Jahresabschlüsse von FMP, Alpha Vantage, Polygon.io
 * und den SEC-Originaldaten (EDGAR). API-Keys werden lokal im Browser gespeichert (js/providers.js).
 * Der bestehende Financials-Tab (yfinance) bleibt unverändert.
 */

window.App = window.App || {};

window.App.StockFundamentals = (function () {
  'use strict';

  var P = function () { return window.App.Providers; };
  var F = function () { return window.App.Format; };
  var ORDER = ['fmp', 'av', 'polygon', 'edgar'];
  var state = { provider: 'fmp' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fmtBig(v, cur) {
    if (v == null || !isFinite(v)) return '—';
    var abs = Math.abs(v), sign = v < 0 ? '−' : '', sym = cur === 'USD' ? ' $' : ' ' + (cur || '');
    if (abs >= 1e12) return sign + F().number(abs / 1e12, 2) + ' Bio.' + sym;
    if (abs >= 1e9) return sign + F().number(abs / 1e9, 2) + ' Mrd.' + sym;
    if (abs >= 1e6) return sign + F().number(abs / 1e6, 1) + ' Mio.' + sym;
    return sign + F().number(abs, 0) + sym;
  }

  function fmtVal(r, cur) {
    var v = r.value;
    if (v == null || !isFinite(v)) return '—';
    switch (r.kind) {
      case 'x': return F().number(v, 2);
      case 'frac': return F().number(v * 100, 1) + ' %';
      case 'pct': return F().number(v, 1) + ' %';
      case 'big': return fmtBig(v, cur);
      case 'cur': return F().number(v, 2) + (cur === 'USD' ? ' $' : '');
      default: return F().number(v, 2);
    }
  }

  function yearLabel(date) { return date ? String(date).slice(0, 4) : ''; }

  function render(container, stock) {
    var ticker = (stock.ticker || (stock.profile && stock.profile.ticker) || '').toUpperCase();
    draw(container, ticker, false);
  }

  function draw(container, ticker, force) {
    var P_ = P();
    var provider = state.provider;
    var meta = P_.META[provider];

    var chips = ORDER.map(function (k) {
      return '<button class="chip-btn ' + (k === provider ? 'active' : '') + '" data-fund-provider="' + k + '">' + esc(P_.META[k].name) + '</button>';
    }).join('');

    var head = '<div class="horizontal-scroll-row" style="margin-bottom:12px;">' + chips + '</div>';

    if (!P_.isUsSymbol(ticker)) {
      head += '<div class="card" style="font-size:0.78rem;color:var(--text-dim);line-height:1.45;">' +
        '<strong style="color:var(--text-main);">Hinweis:</strong> ' + esc(ticker) + ' ist kein US-Titel. ' +
        'FMP, Alpha Vantage, Polygon und EDGAR decken vor allem US-Börsen ab – für europäische Titel bleibt meist nur der Financials-Tab.</div>';
    }

    container.innerHTML = head + '<div id="fund-body"></div>';
    bindProviderChips(container, ticker);
    var body = container.querySelector('#fund-body');

    if (meta.needsKey && !P_.getKey(provider)) {
      body.innerHTML = keyCard(provider, false);
      bindKeyCard(container, ticker);
      return;
    }

    body.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Lade Daten von ' + esc(meta.full) + '…</p></div>';
    P_.getFundamentals(provider, ticker, { force: force }).then(function (data) {
      if (state.provider !== provider) return;       // Anbieter wurde inzwischen gewechselt
      drawData(container, body, ticker, data);
    }).catch(function (err) {
      if (state.provider !== provider) return;
      var msg = (err && err.message) || 'Unbekannter Fehler';
      var extra = '';
      if (err && err.code === 'nofile') {
        extra = '<div style="font-size:0.75rem;color:var(--text-dim);margin-top:8px;line-height:1.5;">' +
          'EDGAR-Daten kommen aus dem GitHub-Workflow <strong>„SEC-EDGAR-Update“</strong>. Dort „Run workflow“ wählen und optional den Ticker ' + esc(ticker) + ' angeben.</div>';
      }
      var keyBtn = (meta.needsKey && (err.code === 'auth' || err.code === 'nokey'))
        ? '<div style="margin-top:10px;">' + keyCard(provider, true) + '</div>' : '';
      body.innerHTML = '<div class="state-box"><p style="color:var(--bearish);font-weight:700;">Abruf fehlgeschlagen</p><p style="font-size:0.85rem;">' + esc(msg) + '</p>' + extra +
        '<button class="chip-btn active" id="fund-retry" style="margin-top:10px;">Erneut versuchen</button>' + keyBtn + '</div>';
      var retry = body.querySelector('#fund-retry');
      if (retry) retry.onclick = function () { draw(container, ticker, true); };
      bindKeyCard(container, ticker);
    });
  }

  function bindProviderChips(container, ticker) {
    container.querySelectorAll('[data-fund-provider]').forEach(function (btn) {
      btn.onclick = function () {
        state.provider = btn.getAttribute('data-fund-provider');
        draw(container, ticker, false);
      };
    });
  }

  function keyCard(provider, compact) {
    var meta = P().META[provider];
    var has = !!P().getKey(provider);
    return '<div class="card" data-key-card="' + provider + '"' + (compact ? ' style="text-align:left;"' : '') + '>' +
      '<div class="card-header-dotted"><span class="card-title">API-Key für ' + esc(meta.full) + '</span></div>' +
      '<div style="font-size:0.75rem;color:var(--text-dim);line-height:1.5;margin-bottom:10px;">' +
        'Der Key wird nur in diesem Browser gespeichert und direkt an ' + esc(meta.full) + ' gesendet – nicht ins Repository und nicht an Dritte. ' +
        'Ein kostenloser Key genügt zum Ausprobieren; die Gratis-Kontingente sind klein, deshalb werden Antworten 12 Stunden zwischengespeichert. ' +
        '<a href="' + meta.signup + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent-purple-light);">Key beantragen ↗</a></div>' +
      '<div style="display:flex;gap:8px;">' +
        '<input type="password" class="search-input" data-key-input autocomplete="off" spellcheck="false" placeholder="' + (has ? '•••••••• (gespeichert)' : 'API-Key einfügen') + '" style="flex:1;padding-left:12px;">' +
        '<button class="chip-btn active" data-key-save>Speichern</button>' +
        (has ? '<button class="chip-btn" data-key-delete>Löschen</button>' : '') +
      '</div></div>';
  }

  function bindKeyCard(container, ticker) {
    container.querySelectorAll('[data-key-card]').forEach(function (card) {
      var provider = card.getAttribute('data-key-card');
      var save = card.querySelector('[data-key-save]');
      var del = card.querySelector('[data-key-delete]');
      var input = card.querySelector('[data-key-input]');
      if (save) save.onclick = function () {
        var v = (input.value || '').trim();
        if (!v) return;
        P().setKey(provider, v);
        draw(container, ticker, true);
      };
      if (input) input.onkeydown = function (e) { if (e.key === 'Enter' && save) save.click(); };
      if (del) del.onclick = function () { P().setKey(provider, ''); draw(container, ticker, false); };
    });
  }

  function drawData(container, body, ticker, data) {
    var f = F(), cur = data.currency || 'USD';
    var html = '';

    if (data.notes && data.notes.length) {
      html += '<div class="card" style="font-size:0.75rem;color:var(--text-dim);line-height:1.5;">' +
        data.notes.map(function (n) { return '<div>• ' + esc(n) + '</div>'; }).join('') + '</div>';
    }

    // Kennzahlen
    if (data.ratios.length) {
      html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Kennzahlen</span><span class="period-tag">' + esc(data.label) + '</span></div>' +
        '<div class="metrics-grid-2col">' +
        data.ratios.map(function (r) {
          return '<div class="metric-cell"><span class="metric-label">' + esc(r.label) + '</span>' +
            '<span class="metric-value">' + fmtVal(r, cur) + '</span>' +
            (r.hint ? '<span style="font-size:0.65rem;color:var(--text-dim);">' + esc(r.hint) + '</span>' : '') + '</div>';
        }).join('') + '</div></div>';
    }

    // Jahresabschlüsse
    var rows = data.annual.slice(0, 6);
    if (rows.length) {
      var hasEps = rows.some(function (r) { return r.eps != null; });
      var asc = rows.slice().reverse();
      html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Jahresabschlüsse</span><span class="period-tag">Angaben in ' + esc(cur) + '</span></div>' +
        '<div style="height:180px;position:relative;margin-bottom:12px;"><canvas id="fund-chart" class="chart-canvas" style="height:100%;"></canvas></div>' +
        '<div style="font-size:0.7rem;color:var(--text-dim);margin:-6px 0 10px;"><span style="color:#6366f1;">●</span> Umsatz &nbsp;<span style="color:#10b981;">●</span> Nettogewinn</div>' +
        '<div class="table-responsive-wrapper"><table class="data-table compact"><thead><tr><th>Jahr</th><th style="text-align:right;">Umsatz</th><th style="text-align:right;">Brutto</th><th style="text-align:right;">Operativ</th><th style="text-align:right;">Netto</th>' +
        (hasEps ? '<th style="text-align:right;">EPS</th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td><strong>' + esc(yearLabel(r.date)) + '</strong></td>' +
            '<td style="text-align:right;">' + fmtBig(r.revenue, cur) + '</td>' +
            '<td style="text-align:right;">' + fmtBig(r.grossProfit, cur) + '</td>' +
            '<td style="text-align:right;">' + fmtBig(r.operatingIncome, cur) + '</td>' +
            '<td style="text-align:right;font-weight:700;color:' + (r.netIncome == null ? '' : r.netIncome >= 0 ? 'var(--bullish)' : 'var(--bearish)') + ';">' + fmtBig(r.netIncome, cur) + '</td>' +
            (hasEps ? '<td style="text-align:right;">' + (r.eps == null ? '—' : f.number(r.eps, 2)) + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div></div>';
      body.innerHTML = html;
      var canvas = body.querySelector('#fund-chart');
      if (canvas) {
        window.App.Charts.renderGroupedBarChart(canvas, {
          labels: asc.map(function (r) { return yearLabel(r.date); }),
          series: [
            { data: asc.map(function (r) { return r.revenue || 0; }), color: '#6366f1' },
            { data: asc.map(function (r) { return r.netIncome || 0; }), color: '#10b981', negColor: '#ef4444' }
          ],
          formatY: function (v) { return Math.abs(v) >= 1e9 ? f.number(v / 1e9, 0) + ' Mrd' : f.number(v / 1e6, 0) + ' Mio'; }
        });
      }
    } else {
      body.innerHTML = html;
    }

    // SEC-Filings (nur EDGAR)
    if (data.filings && data.filings.length) {
      var fh = '<div class="card"><div class="card-header-dotted"><span class="card-title">Aktuelle SEC-Meldungen</span><span class="period-tag">EDGAR</span></div>' +
        '<div class="table-responsive-wrapper"><table class="data-table"><thead><tr><th>Datum</th><th>Formular</th><th>Inhalt</th></tr></thead><tbody>' +
        data.filings.slice(0, 15).map(function (x) {
          var link = /^https:\/\/www\.sec\.gov\//.test(x.url || '') ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent-purple-light);">' + esc(x.form) + ' ↗</a>' : esc(x.form);
          return '<tr><td>' + f.date(x.date) + '</td><td><strong>' + link + '</strong></td><td style="color:var(--text-dim);font-size:0.75rem;">' + esc(x.desc || '') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
      body.insertAdjacentHTML('beforeend', fh);
    }

    // Fuß: Stand, Neu laden, Key
    var stamp = data.fetchedAt ? f.date(String(data.fetchedAt).slice(0, 10)) : '';
    var meta = P().META[data.provider];
    body.insertAdjacentHTML('beforeend',
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:0.7rem;color:var(--text-dim);padding:2px 4px 10px;flex-wrap:wrap;">' +
        '<span>Stand: ' + stamp + (data.fromCache ? ' (zwischengespeichert)' : '') + '</span>' +
        (data.provider !== 'edgar' ? '<button class="chip-btn" id="fund-reload">Neu laden</button>' : '') +
      '</div>' +
      (meta.needsKey ? '<details style="margin-bottom:12px;"><summary style="font-size:0.75rem;color:var(--text-dim);cursor:pointer;">API-Key verwalten</summary><div style="margin-top:8px;">' + keyCard(data.provider, true) + '</div></details>' : '') +
      '<div style="font-size:0.7rem;color:var(--text-dim);line-height:1.45;padding:2px 4px 12px;">Die Anbieter definieren Kennzahlen teils unterschiedlich (TTM vs. Geschäftsjahr, Bereinigungen) – Abweichungen zwischen den Quellen sind normal. Keine Anlageberatung.</div>');

    var reload = body.querySelector('#fund-reload');
    if (reload) reload.onclick = function () { draw(container, ticker, true); };
    bindKeyCard(container, ticker);
  }

  return { render: render };
})();

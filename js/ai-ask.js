/**
 * js/ai-ask.js – KI-Einschätzung auf Abruf (über den Worker /ai/ask, Groq)
 *
 * App.AIAsk.stock(ticker)          Einschätzung zu einer Aktie / einem ETF
 * App.AIAsk.list(kind, tickers, w) kritischer Blick auf Watchlist (kind 'watchlist') oder Depot ('depot', w = Gewichte in %)
 *
 * Die App schickt eine kompakte Datenzusammenfassung, der Worker fragt Groq und hält die Antwort
 * 12 Stunden im Cache (gleiche Frage am selben Tag kostet kein Kontingent). Passwort = App-Passwort
 * der Daten-Updates.
 */
window.App = window.App || {};
window.App.AIAsk = (function () {
  'use strict';

  var WORKER = 'https://yahoo-proxy.spamispam018.workers.dev';
  var KEY_STORE = 'app_gh_key';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
  function setKey(v) { try { if (v) localStorage.setItem(KEY_STORE, v); else localStorage.removeItem(KEY_STORE); } catch (e) {} }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v.toFixed(d == null ? 1 : d) : '-'; }

  /* ---------- Datenzusammenfassung ---------- */
  function rowLine(u) {
    return [u.ticker, (u.name || '').slice(0, 28), u.sector || '-', num(u.price, 2), num(u.changePercent), num(u.perf1m), num(u.perf3m), num(u.perfYtd),
      num(u.pe), num(u.forwardPe), num(u.peg, 2), num(u.dividendYield, 2), num(u.upside), (typeof u.buyPct === 'number' ? Math.round(u.buyPct) + '% Kauf' : '-') + (u.analystCount ? ' (' + u.analystCount + ')' : ''),
      num(u.rsi, 0), num(u.rangePos, 0), u.emaTrend === true ? 'ja' : u.emaTrend === false ? 'nein' : '-',
      u.cross ? u.cross + (u.crossDaysAgo != null ? '(' + u.crossDaysAgo + 'T)' : '') : '-'].join('|');
  }
  var HEAD = 'Ticker|Name|Sektor|Kurs€|Tag%|1M%|3M%|YTD%|KGV|FwdKGV|PEG|Div%|Kursziel-Potenzial%|Analysten|RSI|52W-Pos%|EMA-Trend|SMA-Kreuz';

  function stockPrompt(u, stock, news) {
    var t = (stock && stock.analysts && stock.analysts.targets) || {};
    var lines = ['Bewerte diesen Wert für einen Privatanleger. Daten (Kurse in EUR, Stand heute):', HEAD, rowLine(u)];
    if (t.mean) lines.push('Analysten-Kursziele: tief ' + num(t.low, 2) + ', Mittel ' + num(t.mean, 2) + ', hoch ' + num(t.high, 2) + ', Anzahl ' + (t.analystCount || '-'));
    var extra = [['Umsatzwachstum%', u.revGrowth], ['Gewinnmarge%', u.profitMargins], ['ROE%', u.returnOnEquity], ['Verschuldung D/E', u.debtToEquity], ['Ausschüttungsquote%', u.payoutRatio]]
      .filter(function (x) { return typeof x[1] === 'number'; }).map(function (x) { return x[0] + ' ' + num(x[1]); });
    if (extra.length) lines.push('Fundamental: ' + extra.join(', '));
    if (Array.isArray(u.chartPatterns) && u.chartPatterns.length) lines.push('Chartmuster: ' + u.chartPatterns.join(', '));
    if (stock && stock.holdings && stock.holdings.length) {
      lines.push('ETF-Top-Positionen: ' + stock.holdings.slice(0, 10).map(function (h) { return (h.symbol || h.name) + ' ' + num(h.weight) + '%'; }).join(', '));
    }
    if (news && news.length) {
      lines.push('Aktuelle Schlagzeilen (Stimmung laut FinBERT):');
      news.slice(0, 6).forEach(function (n) { lines.push('- ' + (n.label || '?') + ': ' + String(n.title || '').slice(0, 140)); });
    }
    lines.push('', 'Antworte als JSON: {"bild":"positiv|gemischt|negativ","kurz":"1–2 Sätze Gesamteindruck",' +
      '"staerken":["bis 3 konkrete Punkte mit Zahlen"],"schwaechen":["bis 3 konkrete Punkte mit Zahlen"],' +
      '"beobachten":["bis 2 Dinge, auf die man in den nächsten Wochen achten sollte"]}');
    return lines.join('\n');
  }

  function listPrompt(kind, rows, weights) {
    var lines = [kind === 'depot'
      ? 'Das ist das Depot eines Privatanlegers (Gewicht = Anteil am Depotwert). Prüfe es kritisch: Klumpenrisiken, schwache Werte, Werte mit auffälligen Signalen.'
      : 'Das ist die Watchlist eines Privatanlegers. Ordne jeden Wert kurz ein und hebe die interessantesten und die kritischsten hervor.',
      'Daten (Kurse in EUR, Stand heute):', HEAD + (weights ? '|Gewicht%' : '')];
    rows.forEach(function (u) { lines.push(rowLine(u) + (weights ? '|' + num(weights[u.ticker]) : '')); });
    lines.push('', 'Antworte als JSON: {"ueberblick":"2–3 Sätze","werte":[{"ticker":"…","einschaetzung":"stark|neutral|kritisch","grund":"1 Satz mit Zahl"}],' +
      '"risiken":["bis 3 übergreifende Risiken' + (kind === 'depot' ? ', z. B. Klumpen nach Sektor/Region' : '') + '"]}. Nimm jeden Ticker genau einmal in "werte" auf.');
    return lines.join('\n');
  }

  /* ---------- Anfrage ---------- */
  function ask(id, prompt, force) {
    return fetch(WORKER + '/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Key': getKey() },
      body: JSON.stringify({ id: id, prompt: prompt, force: !!force })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; });
    });
  }

  /* ---------- Darstellung ---------- */
  var TONE = { positiv: 'var(--bullish)', stark: 'var(--bullish)', gemischt: '#f59e0b', neutral: '#f59e0b', negativ: 'var(--bearish)', kritisch: 'var(--bearish)' };
  function list(title, arr, color) {
    if (!arr || !arr.length) return '';
    return '<div style="margin-top:12px;"><div style="font-size:0.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:' + (color || 'var(--text-dim)') + ';">' + esc(title) + '</div>' +
      '<ul style="margin:6px 0 0;padding-left:18px;font-size:0.84rem;line-height:1.5;color:var(--text-muted);">' +
      arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
  }

  function answerHtml(a, kind) {
    if (kind === 'stock') {
      var tone = TONE[a.bild] || 'var(--text-muted)';
      return '<div style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:0.75rem;font-weight:800;color:' + tone + ';border:1px solid ' + tone + ';">Bild: ' + esc(a.bild || '–') + '</div>' +
        '<p style="font-size:0.9rem;line-height:1.55;margin:10px 0 0;">' + esc(a.kurz || '') + '</p>' +
        list('Stärken', a.staerken, 'var(--bullish)') + list('Schwächen', a.schwaechen, 'var(--bearish)') + list('Beobachten', a.beobachten);
    }
    var html = '<p style="font-size:0.9rem;line-height:1.55;margin:0;">' + esc(a.ueberblick || '') + '</p>';
    var werte = (a.werte || []).slice().sort(function (x, y) {
      var o = { kritisch: 0, stark: 1, neutral: 2 }; return (o[x.einschaetzung] == null ? 3 : o[x.einschaetzung]) - (o[y.einschaetzung] == null ? 3 : o[y.einschaetzung]);
    });
    if (werte.length) {
      html += '<div style="margin-top:12px;">' + werte.map(function (w) {
        var tone = TONE[w.einschaetzung] || 'var(--text-muted)';
        return '<div data-aiask-t="' + esc(w.ticker) + '" style="padding:8px 0;border-top:1px solid var(--border);cursor:pointer;">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;"><b style="font-size:0.85rem;">' + esc(w.ticker) + '</b>' +
          '<span style="font-size:0.72rem;font-weight:800;color:' + tone + ';">' + esc(w.einschaetzung || '') + '</span></div>' +
          '<div style="font-size:0.8rem;color:var(--text-muted);line-height:1.45;margin-top:2px;">' + esc(w.grund || '') + '</div></div>';
      }).join('') + '</div>';
    }
    return html + list('Risiken', a.risiken, 'var(--bearish)');
  }

  function open(title, id, buildPrompt, kind) {
    var UI = window.App.UI;
    UI.openSheet('<div id="aiask-body"></div>', function (root) {
      function frame(inner) {
        return '<div style="padding:4px 2px 8px;">' +
          '<div style="font-weight:800;font-size:1.05rem;margin-bottom:10px;">' + esc(title) + '</div>' + inner + '</div>';
      }
      function setHtml(h) {
        var body = root.querySelector('#aiask-body');
        body.innerHTML = frame(h);
        return body;
      }
      function askKey(msg) {
        var b = setHtml('<div style="font-size:0.82rem;color:var(--text-muted);line-height:1.5;margin-bottom:10px;">' + esc(msg ||
          'Für die KI-Einschätzung brauchst du das App-Passwort (dasselbe wie bei den Daten-Updates).') + '</div>' +
          '<form id="aiask-key"><input class="ui-input" type="password" autocomplete="current-password" placeholder="App-Passwort" style="width:100%;margin-bottom:10px;">' +
          '<button class="ui-btn" type="submit" style="width:100%;">Weiter</button></form>');
        b.querySelector('#aiask-key').onsubmit = function (e) {
          e.preventDefault();
          var v = b.querySelector('input').value.trim();
          if (v) { setKey(v); run(false); }
        };
      }
      function run(force) {
        if (!getKey()) { askKey(); return; }
        setHtml('<div class="state-box" style="padding:24px 0;"><div class="spinner"></div><p>KI wertet aus … (bis 30 Sekunden)</p></div>');
        Promise.resolve(buildPrompt()).then(function (prompt) {
          return ask(id, prompt, force);
        }).then(function (res) {
          if (!document.body.contains(root)) return;
          if (res.__status === 401) { setKey(''); askKey('Das Passwort war falsch. Bitte erneut eingeben.'); return; }
          if (res.__status === 503 && res.setup) {
            setHtml('<div style="font-size:0.84rem;color:var(--text-muted);line-height:1.55;">' + esc(res.error) +
              '<br><br>Trage in Cloudflare beim Worker unter Settings › Variables and Secrets ein Secret <b>GROQ_API_KEY</b> ein (derselbe Schlüssel wie in GitHub).</div>');
            return;
          }
          if (!res.answer) { setHtml('<div style="font-size:0.84rem;color:var(--bearish);">KI nicht erreichbar: ' + esc(res.error || 'unbekannter Fehler') + '</div>'); return; }
          var b = setHtml(answerHtml(res.answer, kind) +
            '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:14px;line-height:1.45;">' +
              (res.stale ? 'Älterer Stand (KI gerade nicht erreichbar). ' : '') +
              'Erstellt ' + esc(new Date(res.fetchedAt || Date.now()).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) +
              ' · ' + esc(String(res.model || 'KI').replace(/^openai\//, '')) + '. Automatische Einordnung der App-Daten, keine Anlageberatung.</div>' +
            '<button class="chip-btn" id="aiask-again" style="margin-top:10px;">↻ Neu erstellen</button>');
          b.querySelector('#aiask-again').onclick = function () { run(true); };
          b.querySelectorAll('[data-aiask-t]').forEach(function (el) {
            el.onclick = function () { UI.closeSheet(); window.App.Router.navigate('/stock/' + el.getAttribute('data-aiask-t') + '/overview'); };
          });
        }).catch(function () {
          if (document.body.contains(root)) setHtml('<div style="font-size:0.84rem;color:var(--bearish);">Worker nicht erreichbar.</div>');
        });
      }
      run(false);
    });
  }

  function universeMap() {
    return window.App.Data.getUniverse().then(function (uni) { var m = {}; uni.forEach(function (u) { m[u.ticker] = u; }); return m; });
  }

  function stock(ticker) {
    open('KI-Einschätzung ' + ticker, 'stock/' + ticker, function () {
      var D = window.App.Data;
      return Promise.all([
        universeMap(),
        D.getStock(ticker).catch(function () { return null; }),
        D.getJsonFile('news/' + ticker + '.json').catch(function () { return null; })
      ]).then(function (r) {
        var u = r[0][ticker] || { ticker: ticker, name: (r[1] && r[1].name) || ticker };
        return stockPrompt(u, r[1], (r[2] && r[2].items) || []);
      });
    }, 'stock');
  }

  function listCheck(kind, tickers, weights) {
    var ids = tickers.slice().sort().join(',');
    var hash = 0;
    for (var i = 0; i < ids.length; i++) hash = (hash * 31 + ids.charCodeAt(i)) | 0;
    open(kind === 'depot' ? 'KI-Check Depot' : 'KI-Check Watchlist', kind + '/' + (hash >>> 0).toString(36), function () {
      return universeMap().then(function (m) {
        var rows = tickers.map(function (t) { return m[t]; }).filter(Boolean).slice(0, 60);
        return listPrompt(kind, rows, weights);
      });
    }, 'list');
  }

  return { stock: stock, list: listCheck };
})();

/**
 * js/premarket.js
 * US-Vorbörsenhandel-Indikator für deutsche Anleger.
 * Zeigt die Pre-Market-Bewegung als gestrichelte Linie und berechnet,
 * ob der deutsche Kurs voraussichtlich folgen wird.
 * 
 * UPDATE: 
 * - Kein Auto-Refresh mehr (spart Requests).
 * - Kein DE-Ticker-Abruf mehr (nutzt den App-Kurs).
 * - Zeitanzeige mit "heute" und "morgen".
 * - Trade Republic Handelszeit (bis 23:00) integriert.
 */
window.App = window.App || {};

window.App.PreMarket = (function () {
  'use strict';

  var PROXY_URL = 'https://yahoo-proxy.spamispam018.workers.dev';
  var state = { ticker: null };

  function isUsTicker(t) {
    return t && !/\.(DE|PA|AS|L|SW|MI|MC|T|TO|AX|CO)$/i.test(t);
  }

  function etHour() {
    var now = new Date();
    var s = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
    var m = s.match(/(\d+):(\d+):(\d+)/);
    return m ? parseInt(m[1], 10) + parseInt(m[2], 10) / 60 : 0;
  }

  function cetHour() {
    var now = new Date();
    var s = now.toLocaleString('en-US', { timeZone: 'Europe/Berlin', hour12: false });
    var m = s.match(/(\d+):(\d+):(\d+)/);
    return m ? parseInt(m[1], 10) + parseInt(m[2], 10) / 60 : 0;
  }

  function fetchChart(ticker, withPrePost) {
    var url = PROXY_URL + '/?ticker=' + encodeURIComponent(ticker) +
              '&interval=1m&range=1d' +
              (withPrePost ? '&includePrePost=true' : '') +
              '&t=' + Date.now();
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function fetchFx() {
    return fetchChart('EURUSD=X', false).then(function (d) {
      try {
        return d.chart.result[0].meta.regularMarketPrice;
      } catch (e) { return 1.09; }
    });
  }

  function extractSeries(data, fxToEur) {
    try {
      var result = data.chart.result[0];
      var ts = result.timestamp || [];
      var closes = result.indicators.quote[0].close || [];
      var pts = [];
      for (var i = 0; i < ts.length; i++) {
        if (closes[i] != null) {
          pts.push({ t: ts[i] * 1000, price: closes[i] * fxToEur });
        }
      }
      return { points: pts, meta: result.meta };
    } catch (e) { return { points: [], meta: {} }; }
  }

  function classifySession(ms) {
    var d = new Date(ms);
    var s = d.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
    var m = s.match(/(\d+):(\d+)/);
    if (!m) return 'closed';
    var h = parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
    if (h >= 4 && h < 9.5) return 'pre';
    if (h >= 9.5 && h < 16) return 'regular';
    if (h >= 16 && h < 20) return 'post';
    return 'closed';
  }

  // NEU: Berechnet die Zeit bis zu einem Ziel und gibt "heute" oder "morgen" aus
  function getTimeInfo(targetHour, currentHour) {
    var isTomorrow = targetHour < currentHour;
    var diff = isTomorrow ? (targetHour + 24) - currentHour : targetHour - currentHour;
    var hh = Math.floor(diff);
    var mm = Math.round((diff - hh) * 60);
    var timeStr = hh + 'h ' + (mm < 10 ? '0' : '') + mm + 'min';
    var dayStr = isTomorrow ? ' (morgen)' : ' (heute)';
    return timeStr + dayStr;
  }

  function fmt(v) {
    if (v == null || isNaN(v)) return '—';
    return window.App.Format.number(v, 2);
  }

  function computeSignal(preEur, currentEur) {
    if (!preEur || !currentEur) return null;
    var delta = (preEur / currentEur - 1) * 100;
    var dir = delta > 0.3 ? 'up' : delta < -0.3 ? 'down' : 'flat';
    var strength = Math.abs(delta) < 1 ? 'leicht' : Math.abs(delta) < 2.5 ? 'deutlich' : 'stark';
    return { delta: delta, direction: dir, strength: strength };
  }

  function render(container, stock) {
    if (!container || !stock) return;
    var ticker = (stock.ticker || '').toUpperCase();
    state.ticker = ticker;

    if (!isUsTicker(ticker)) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = buildShell(ticker);
    bindEvents(container, ticker, stock);
    
    // Initialer Aufruf beim Öffnen der Aktie
    refresh(container, ticker, stock);
  }

  function buildShell(ticker) {
    return '' +
      '<div class="card" id="pm-card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">🇺🇸 US-Vorbörse · ' + ticker + '</span>' +
          '<span id="pm-session-badge" class="period-tag">—</span>' +
        '</div>' +
        '<div id="pm-status" style="font-size:0.78rem;color:var(--text-dim);">Lade Vorbörsen-Daten…</div>' +
        '<div id="pm-signal" style="margin:10px 0;"></div>' +
        '<div style="height:140px;position:relative;margin-top:6px;">' +
          '<canvas id="pm-canvas" style="width:100%;height:100%;"></canvas>' +
        '</div>' +
        '<div id="pm-times" style="margin-top:10px;font-size:0.72rem;color:var(--text-dim);line-height:1.6;"></div>' +
        '<div style="margin-top:12px;display:flex;gap:8px;">' +
          '<button class="chip-btn active" id="pm-refresh" style="flex:1;justify-content:center;height:38px;">🔄 Jetzt aktualisieren</button>' +
        '</div>' +
        '<div id="pm-info" style="font-size:0.68rem;color:var(--text-dim);margin-top:10px;line-height:1.5;"></div>' +
      '</div>';
  }

  function bindEvents(container, ticker, stock) {
    var btn = container.querySelector('#pm-refresh');
    if (btn) btn.onclick = function () { 
      // Button deaktivieren während des Ladens
      btn.innerHTML = '<div class="spinner" style="width: 14px; height: 14px; border-width: 2px; display: inline-block; vertical-align: middle; margin-right: 6px;"></div> Lädt...';
      btn.style.opacity = '0.7';
      btn.disabled = true;
      
      refresh(container, ticker, stock).then(function() {
        btn.innerHTML = '🔄 Jetzt aktualisieren';
        btn.style.opacity = '1';
        btn.disabled = false;
      });
    };
  }

  function refresh(container, ticker, stock) {
    var statusEl = container.querySelector('#pm-status');
    if (statusEl) statusEl.textContent = 'Rufe Vorbörsen-Daten…';

    // Nur noch 2 Requests: US-Chart und EUR/USD Wechselkurs
    return Promise.all([
      fetchChart(ticker, true),
      fetchFx()
    ]).then(function (res) {
      renderData(container, ticker, stock, res[0], res[1]);
    }).catch(function (err) {
      if (statusEl) statusEl.innerHTML =
        '<span style="color:var(--bearish);">Fehler: ' + (err.message || err) + '</span>' +
        '<div style="font-size:0.7rem;margin-top:4px;">Prüfe den Proxy oder versuche es später erneut.</div>';
    });
  }

  function renderData(container, ticker, stock, preData, fx) {
    var usdToEur = fx > 0 ? 1 / fx : 0.92;
    var preSeries = extractSeries(preData, usdToEur);
    var currentPriceEur = (stock.quote && stock.quote.price) || 0;

    var prePoints = preSeries.points || [];
    var lastPre = prePoints.length ? prePoints[prePoints.length - 1] : null;

    // Da wir den deutschen Ticker nicht mehr abrufen, nutzen wir den Kurs aus den App-Daten
    var germanNow = currentPriceEur;

    var session = lastPre ? classifySession(lastPre.t) : 'closed';
    var sessionBadge = container.querySelector('#pm-session-badge');
    if (sessionBadge) {
      sessionBadge.textContent = session === 'pre' ? 'Vorbörse läuft' :
                                 session === 'regular' ? 'US-Handel läuft' :
                                 session === 'post' ? 'Nachbörse' : 'geschlossen';
      sessionBadge.style.background = session === 'pre' ? 'var(--tag-yellow-bg)' :
                                       session === 'regular' ? 'var(--bullish-bg)' :
                                       session === 'post' ? 'var(--bg-tertiary)' : 'var(--bg-tertiary)';
      sessionBadge.style.color = session === 'pre' ? 'var(--tag-yellow)' :
                                  session === 'regular' ? 'var(--bullish)' : 'var(--text-dim)';
    }

    // Statuszeile
    var statusEl = container.querySelector('#pm-status');
    if (statusEl) {
      if (lastPre) {
        var labelText = session === 'pre' ? 'Letzter Vorbörsenkurs' : (session === 'regular' ? 'Letzter US-Kurs' : 'Letzter Nachbörsenkurs');
        statusEl.innerHTML = labelText + ': <strong>' +
          window.App.Format.currency(lastPre.price, 'EUR') + '</strong>' +
          ' um ' + new Date(lastPre.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      } else {
        statusEl.textContent = 'Keine Vorbörsen-Daten – US-Börse geschlossen oder noch keine Trades.';
      }
    }

    // Signal
    var signalEl = container.querySelector('#pm-signal');
    if (signalEl) {
      var signal = computeSignal(lastPre ? lastPre.price : null, germanNow);
      if (!signal) {
        signalEl.innerHTML = '<div style="font-size:0.78rem;color:var(--text-dim);">Kein Signal berechenbar.</div>';
      } else {
        var isUp = signal.direction === 'up';
        var isFlat = signal.direction === 'flat';
        var color = isFlat ? 'var(--tag-yellow)' : (isUp ? 'var(--bullish)' : 'var(--bearish)');
        var arrow = isFlat ? '→' : (isUp ? '▲' : '▼');
        var text = isFlat
          ? 'Seitwärts – kein klarer Vorsprung'
          : (isUp
              ? 'Vorbörse ' + signal.strength + ' über deutschem Kurs – deutscher Kurs könnte steigen'
              : 'Vorbörse ' + signal.strength + ' unter deutschem Kurs – deutscher Kurs könnte fallen');

        signalEl.innerHTML = '' +
          '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-secondary);border-radius:var(--radius-sm);border-left:3px solid ' + color + ';">' +
            '<div style="font-size:1.4rem;color:' + color + ';font-weight:800;">' + arrow + '</div>' +
            '<div style="flex:1;">' +
              '<div style="font-weight:700;color:' + color + ';font-size:0.92rem;">' +
                (signal.delta >= 0 ? '+' : '') + fmt(signal.delta) + ' %' +
              '</div>' +
              '<div style="font-size:0.72rem;color:var(--text-muted);line-height:1.4;">' + text + '</div>' +
            '</div>' +
          '</div>';
      }
    }

    // Zeit-Info mit heute/morgen und Trade Republic
    var timesEl = container.querySelector('#pm-times');
    if (timesEl) {
      timesEl.innerHTML =
        '⏱️ US-Open in <strong>' + getTimeInfo(9.5, etHour()) + '</strong> (15:30 CET)<br>' +
        '⏱️ US-Close in <strong>' + getTimeInfo(16, etHour()) + '</strong> (22:00 CET)<br>' +
        '⏱️ Trade Republic (23:00) in <strong>' + getTimeInfo(23, cetHour()) + '</strong><br>' +
        '⏱️ Xetra schließt in <strong>' + getTimeInfo(17.5, cetHour()) + '</strong> (17:30 CET)';
    }

    // Info-Zeile (ohne DE-Ticker Verweis)
    var infoEl = container.querySelector('#pm-info');
    if (infoEl) {
      infoEl.innerHTML = 'Vergleich: US-Vorbörse in EUR vs. letzter Kurs in der App (' +
        window.App.Format.currency(germanNow, 'EUR') + '). ' +
        'Der Pfeil zeigt, in welche Richtung der deutsche Kurs zur US-Eröffnung tendiert.';
    }

    // Mini-Chart
    drawChart(container, prePoints, germanNow);
  }

  function drawChart(container, points, germanNow) {
    var canvas = container.querySelector('#pm-canvas');
    if (!canvas) return;

    var filtered = points.filter(function (p) {
      var s = classifySession(p.t);
      return s === 'pre' || s === 'post' || s === 'regular';
    });
    
    if (filtered.length < 2) {
      var g = canvas.getContext('2d');
      var W = canvas.parentElement.clientWidth;
      canvas.width = W; canvas.height = 140;
      g.fillStyle = '#64748b';
      g.font = '12px sans-serif';
      g.textAlign = 'center';
      g.fillText('Noch keine Vorbörsen-Bewegung heute.', W / 2, 70);
      return;
    }

    var labels = filtered.map(function (p) {
      var d = new Date(p.t);
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    });
    var values = filtered.map(function (p) { return p.price; });

    window.App.Charts.renderLineChart(canvas, {
      labels: labels,
      values: values,
      formatY: function (v) { return window.App.Format.currency(v, 'EUR', 2); },
      horizontalLines: [{
        value: germanNow,
        color: '#818cf8',
        label: 'App-Kurs ' + window.App.Format.currency(germanNow, 'EUR', 2),
        dashed: true
      }]
    });
  }

  // Stub, damit alte Aufrufe (z.B. in index.html) nicht crashen
  function stopAutoRefresh() { /* Kein Timer mehr vorhanden */ }

  return { render: render, stopAutoRefresh: stopAutoRefresh };
})();
/**
 * js/premarket.js
 * US-Vorbörsenhandel-Indikator für deutsche Anleger.
 * Zeigt die Pre-Market-Bewegung als gestrichelte Linie und berechnet,
 * ob der deutsche Kurs voraussichtlich folgen wird.
 */
window.App = window.App || {};

window.App.PreMarket = (function () {
  'use strict';

  var PROXY_URL = 'https://yahoo-proxy.spamispam018.workers.dev';
  var REFRESH_MS = 60_000;      // 1 Minute
  var ACTIVE_START_CET = 14;    // ab 14:00 CET auto-refresh
  var ACTIVE_END_CET = 22;      // bis 22:00 CET

  // US → deutsche Börse-Mapping (Xetra)
  // Für alle, die nicht drin sind, wird "kein Twin" angezeigt.
  var US_TO_DE = {
    'AAPL': 'APC.DE', 'MSFT': 'MSF.DE', 'GOOGL': 'ABEA.DE',
    'AMZN': 'AMZ.DE', 'TSLA': 'TL0.DE', 'META': 'FB2A.DE',
    'NVDA': 'NVD.DE', 'AMD': 'AMD.DE', 'INTC': 'INL.DE',
    'NFLX': 'NFC.DE', 'JPM': 'CMC.DE', 'V': '3V64.DE',
    'MA': 'M4I.DE', 'JNJ': 'JNJ.DE', 'PFE': 'PFE.DE',
    'KO': 'CCC3.DE', 'PEP': 'PEP.DE', 'MCD': 'MDO.DE',
    'DIS': 'WDP.DE', 'BA': 'BCO.DE', 'CAT': 'CAT1.DE',
    'XOM': 'XONA.DE', 'CVX': 'CHV.DE', 'WMT': 'WMT.DE',
    'PG': 'PRG.DE', 'HD': 'HDI.DE', 'UNH': 'UNH.DE',
    'GS': 'GOS.DE', 'MS': 'MSY.DE', 'BAC': 'BAC.DE',
    'BRK-B': 'BRYN.DE', 'CRM': 'FOO.DE', 'ORCL': 'ORC.DE',
    'QCOM': 'QCI.DE', 'AVGO': 'AVGO.DE', 'TXN': 'TXN.DE'
  };

  var state = { timer: null, visible: true, ticker: null };

  function isUsTicker(t) {
    return t && !/\.(DE|PA|AS|L|SW|MI|MC|T|TO|AX|CO)$/i.test(t);
  }

  function cetHour() {
    var now = new Date();
    var s = now.toLocaleString('en-US', { timeZone: 'Europe/Berlin', hour12: false });
    var m = s.match(/(\d+):(\d+):(\d+)/);
    return m ? parseInt(m[1], 10) + parseInt(m[2], 10) / 60 : 0;
  }

  function etHour() {
    var now = new Date();
    var s = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
    var m = s.match(/(\d+):(\d+):(\d+)/);
    return m ? parseInt(m[1], 10) + parseInt(m[2], 10) / 60 : 0;
  }

  function shouldAutoRefresh() {
    var h = cetHour();
    return state.visible && h >= ACTIVE_START_CET && h < ACTIVE_END_CET;
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
    // EUR/USD – wir brauchen USD → EUR = 1 / EURUSD
    return fetchChart('EURUSD=X', false).then(function (d) {
      try {
        return d.chart.result[0].meta.regularMarketPrice; // z. B. 1.09
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

  function timeUntilEt(targetHour) {
    var h = etHour();
    var diff = targetHour - h;
    if (diff < 0) diff += 24;
    var hh = Math.floor(diff);
    var mm = Math.round((diff - hh) * 60);
    return hh + 'h ' + (mm < 10 ? '0' : '') + mm + 'min';
  }

  function timeUntilCet(targetHour) {
    var h = cetHour();
    var diff = targetHour - h;
    if (diff < 0) diff += 24;
    var hh = Math.floor(diff);
    var mm = Math.round((diff - hh) * 60);
    return hh + 'h ' + (mm < 10 ? '0' : '') + mm + 'min';
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
    refresh(container, ticker, stock);

    stopAutoRefresh();
    if (shouldAutoRefresh()) {
      state.timer = setInterval(function () {
        if (shouldAutoRefresh() && document.getElementById('pm-card')) {
          refresh(container, ticker, stock, true);
        }
      }, REFRESH_MS);
    }
  }

  function buildShell(ticker) {
    var de = US_TO_DE[ticker];
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
          '<button class="chip-btn" id="pm-refresh" style="flex:1;justify-content:center;">🔄 Jetzt aktualisieren</button>' +
          (de
            ? '<button class="chip-btn" id="pm-de-goto" data-ticker="' + de + '" style="flex:1;justify-content:center;">🇩🇪 ' + de + ' öffnen</button>'
            : '') +
        '</div>' +
        '<div id="pm-info" style="font-size:0.68rem;color:var(--text-dim);margin-top:10px;line-height:1.5;"></div>' +
      '</div>';
  }

  function bindEvents(container, ticker, stock) {
    var btn = container.querySelector('#pm-refresh');
    if (btn) btn.onclick = function () { refresh(container, ticker, stock); };
    var deBtn = container.querySelector('#pm-de-goto');
    if (deBtn) deBtn.onclick = function () {
      window.App.Router.navigate('/stock/' + deBtn.getAttribute('data-ticker') + '/overview');
    };
  }

  function refresh(container, ticker, stock, silent) {
    var statusEl = container.querySelector('#pm-status');
    if (!silent && statusEl) statusEl.textContent = 'Rufe Vorbörsen-Daten…';

    var de = US_TO_DE[ticker];

    Promise.all([
      fetchChart(ticker, true),
      de ? fetchChart(de, false) : Promise.resolve(null),
      fetchFx()
    ]).then(function (res) {
      renderData(container, ticker, stock, de, res[0], res[1], res[2]);
    }).catch(function (err) {
      if (statusEl) statusEl.innerHTML =
        '<span style="color:var(--bearish);">Fehler: ' + (err.message || err) + '</span>' +
        '<div style="font-size:0.7rem;margin-top:4px;">Prüfe den Proxy oder versuche es später erneut.</div>';
    });
  }

  function renderData(container, ticker, stock, de, preData, deData, fx) {
    // Umrechnung USD → EUR (FX von Yahoo ist EURUSD, also 1 EUR = x USD)
    var usdToEur = fx > 0 ? 1 / fx : 0.92;
    var preSeries = extractSeries(preData, usdToEur);
    var deSeries = deData ? extractSeries(deData, 1) : null;

    var currentPriceEur = (stock.quote && stock.quote.price) || 0;
    var prePoints = preSeries.points || [];
    var lastPre = prePoints.length ? prePoints[prePoints.length - 1] : null;
    var lastDe = deSeries && deSeries.points.length ? deSeries.points[deSeries.points.length - 1] : null;

    // Bevorzugt deutschen Live-Kurs (falls vorhanden), sonst stock.quote
    var germanNow = lastDe ? lastDe.price : currentPriceEur;

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
        statusEl.innerHTML = 'Letzter Vorbörsenkurs: <strong>' +
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

    // Zeit-Info
    var timesEl = container.querySelector('#pm-times');
    if (timesEl) {
      var usOpen = timeUntilEt(9.5);
      var usClose = timeUntilEt(16);
      var xetraClose = timeUntilCet(17.5);
      timesEl.innerHTML =
        '⏱️ US-Open in <strong>' + usOpen + '</strong> (15:30 CET)<br>' +
        '⏱️ US-Close in <strong>' + usClose + '</strong> (22:00 CET)<br>' +
        '⏱️ Xetra schließt in <strong>' + xetraClose + '</strong> (17:30 CET)';
    }

    // Info-Zeile
    var infoEl = container.querySelector('#pm-info');
    if (infoEl) {
      infoEl.innerHTML = de
        ? 'Vergleich: US-Vorbörse in EUR vs. <strong>' + de + '</strong> (Xetra, ' +
          window.App.Format.currency(germanNow, 'EUR') + '). ' +
          'Der Pfeil zeigt, in welche Richtung der deutsche Kurs zur US-Eröffnung tendiert.'
        : 'Vergleich: US-Vorbörse in EUR vs. letzter Kurs in der App (' +
          window.App.Format.currency(currentPriceEur, 'EUR') + '). ' +
          'Für diesen Ticker ist kein Xetra-Pendant hinterlegt.';
    }

    // Mini-Chart
    drawChart(container, prePoints, germanNow);
  }

  function drawChart(container, points, germanNow) {
    var canvas = container.querySelector('#pm-canvas');
    if (!canvas) return;

    // Nur Pre-Market- und Post-Market-Punkte
    var filtered = points.filter(function (p) {
      var s = classifySession(p.t);
      return s === 'pre' || s === 'post';
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

    // Fallback auf Charts-Engine – aber wir brauchen eine horizontale Linie
    // für den deutschen Kurs.
    var labels = filtered.map(function (p) {
      var d = new Date(p.t);
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    });
    var values = filtered.map(function (p) { return p.price; });

    // Hier ruft die Charts-Engine eine horizontale Linie auf
    window.App.Charts.renderLineChart(canvas, {
      labels: labels,
      values: values,
      formatY: function (v) { return window.App.Format.currency(v, 'EUR', 2); },
      horizontalLines: [{
        value: germanNow,
        color: '#818cf8',
        label: 'Xetra ' + window.App.Format.currency(germanNow, 'EUR', 2),
        dashed: true
      }]
    });
  }

  function stopAutoRefresh() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  document.addEventListener('visibilitychange', function () {
    state.visible = document.visibilityState === 'visible';
  });

  return { render: render, stopAutoRefresh: stopAutoRefresh };
})();
function renderData(container, ticker, stock, preData, fxData, nqData, esData) {
  var fx = 1.09;
  try { fx = fxData.chart.result[0].meta.regularMarketPrice; } catch(e){}
  var usdToEur = fx > 0 ? 1 / fx : 0.92;

  var preSeries = extractSeries(preData, usdToEur);
  var currentPriceEur = (stock.quote && stock.quote.price) || 0;

  var prePoints = preSeries.points || [];
  var lastPre = prePoints.length ? prePoints[prePoints.length - 1] : null;

  var germanNow = currentPriceEur;
  var xetraOpen = isXetraOpen();

  // Futures rendern
  var nq = extractFutures(nqData);
  var es = extractFutures(esData);
  var futNqEl = container.querySelector('#fut-nq');
  var futEsEl = container.querySelector('#fut-es');
  if (futNqEl) {
    futNqEl.innerHTML = 'NASDAQ: <span style="color:' + (nq.pct >= 0 ? 'var(--bullish)' : 'var(--bearish)') + ';">' + (nq.pct >= 0 ? '+' : '') + fmt(nq.pct) + '%</span>';
  }
  if (futEsEl) {
    futEsEl.innerHTML = 'S&P 500: <span style="color:' + (es.pct >= 0 ? 'var(--bullish)' : 'var(--bearish)') + ';">' + (es.pct >= 0 ? '+' : '') + fmt(es.pct) + '%</span>';
  }

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

  var statusEl = container.querySelector('#pm-status');
  if (statusEl) {
    if (lastPre) {
      var labelText = session === 'pre' ? 'Letzter Vorbörsenkurs' : (session === 'regular' ? 'Letzter US-Kurs' : 'Letzter Nachbörsenkurs');
      statusEl.innerHTML = labelText + ': <strong>' +
        window.App.Format.currency(lastPre.price, 'EUR') + '</strong>' +
        ' um ' + new Date(lastPre.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    } else {
      statusEl.textContent = 'Keine Daten – Börse geschlossen oder noch keine Trades.';
    }
  }

  // Indikatoren (Volumen, VWAP, RSI) - Jetzt auch im regulären Handel!
  var indEl = container.querySelector('#pm-indicators');
  if (indEl && (session === 'pre' || session === 'regular')) {
    var totalVol = prePoints.reduce(function(sum, p) { return sum + p.volume; }, 0);
    var vwap = computeVwap(prePoints);
    var rsi15 = computeRsi15m(prePoints);

    var isHighVol = totalVol > 500000; 
    var volStr = totalVol > 1000000 ? (totalVol/1000000).toFixed(2)+'M' : (totalVol/1000).toFixed(0)+'k';
    var volColor = isHighVol ? 'var(--tag-yellow)' : 'var(--text-main)';
    var rsiColor = rsi15 >= 70 ? 'var(--bearish)' : rsi15 <= 30 ? 'var(--bullish)' : 'var(--text-main)';
    
    indEl.style.display = 'grid';
    indEl.innerHTML = 
      '<div style="background:var(--bg-secondary); padding:6px; border-radius:4px; text-align:center;">' +
        '<div style="font-size:0.6rem; color:var(--text-dim);">Volumen</div>' +
        '<div style="font-weight:700; font-size:0.8rem; color:' + volColor + ';">' + volStr + '</div>' +
      '</div>' +
      '<div style="background:var(--bg-secondary); padding:6px; border-radius:4px; text-align:center;">' +
        '<div style="font-size:0.6rem; color:var(--text-dim);">VWAP</div>' +
        '<div style="font-weight:700; font-size:0.8rem; color:#3b82f6;">' + (vwap ? window.App.Format.currency(vwap, 'EUR', 2) : '—') + '</div>' +
      '</div>' +
      '<div style="background:var(--bg-secondary); padding:6px; border-radius:4px; text-align:center;">' +
        '<div style="font-size:0.6rem; color:var(--text-dim);">RSI (15m)</div>' +
        '<div style="font-weight:700; font-size:0.8rem; color:' + rsiColor + ';">' + (rsi15 ? fmt(rsi15, 0) : '—') + '</div>' +
      '</div>';
  } else if (indEl) {
    indEl.style.display = 'none';
  }

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
      
      // NEU: Dynamischer Text je nach Session
      var sessionName = session === 'pre' ? 'Vorbörse' : 'US-Handel';
      var text = isFlat
        ? 'Seitwärts – kein klarer Vorsprung'
        : (isUp
            ? sessionName + ' ' + signal.strength + ' über deutschem Kurs – deutscher Kurs könnte steigen'
            : sessionName + ' ' + signal.strength + ' unter deutschem Kurs – deutscher Kurs könnte fallen');

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

  var momEl = container.querySelector('#pm-momentum');
  if (momEl) {
    var mom = computeMomentum(prePoints);
    if (mom && (session === 'pre' || session === 'regular')) {
      var isDangerZone = (cetHour() >= 15.0 && cetHour() <= 15.5); 
      
      if (mom.dir === 'down') {
        var alertColor = isDangerZone ? 'var(--bearish)' : 'var(--tag-yellow)';
        var alertBg = isDangerZone ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.05)';
        var alertTitle = isDangerZone ? '⚠️ Achtung: Kurs dreht kurz vor US-Open!' : '📉 Kurs dreht nach unten';
        var alertText = isDangerZone 
          ? 'Der Preis fällt (' + fmt(mom.delta) + '% in 15 Min). Wenn du verkaufen willst, solltest du das jetzt tun.'
          : 'Der Kurs verliert an Momentum (' + fmt(mom.delta) + '% in 15 Min).';

        momEl.innerHTML = '<div style="padding:10px; background:' + alertBg + '; border-left:3px solid ' + alertColor + '; border-radius:4px; margin-top:8px;">' +
          '<div style="font-weight:700; color:' + alertColor + '; font-size:0.8rem;">' + alertTitle + '</div>' +
          '<div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px; line-height:1.4;">' + alertText + '</div></div>';
      } else if (mom.dir === 'up') {
        momEl.innerHTML = '<div style="font-size:0.72rem; color:var(--bullish); text-align:center; margin-top:6px; font-weight:600;">📈 Momentum: +' + fmt(mom.delta) + '% (letzte 15 Min)</div>';
      } else {
        momEl.innerHTML = '<div style="font-size:0.72rem; color:var(--text-muted); text-align:center; margin-top:6px;">➡️ Momentum: seitwärts (letzte 15 Min)</div>';
      }
    } else {
      momEl.innerHTML = '';
    }
  }

  var timesEl = container.querySelector('#pm-times');
  if (timesEl) {
    var xetraTimeStr = '';
    if (xetraOpen) {
      xetraTimeStr = '⏱️ Xetra schließt in <strong>' + getTimeInfo(17.5, cetHour()) + '</strong> (17:30 CET)<br>';
    } else {
      xetraTimeStr = '⏱️ Xetra öffnet in <strong>' + getTimeInfo(9, cetHour()) + '</strong> (09:00 CET)<br>';
    }

    timesEl.innerHTML =
      '⏱️ US-Open in <strong>' + getTimeInfo(9.5, etHour()) + '</strong> (15:30 CET)<br>' +
      '⏱️ US-Close in <strong>' + getTimeInfo(16, etHour()) + '</strong> (22:00 CET)<br>' +
      '⏱️ Trade Republic (23:00) in <strong>' + getTimeInfo(23, cetHour()) + '</strong><br>' +
      xetraTimeStr;
  }

  var infoEl = container.querySelector('#pm-info');
  if (infoEl) {
    var xetraLabel = xetraOpen 
      ? '<strong style="color:var(--bullish);">Xetra ist geöffnet</strong>' 
      : '<strong style="color:var(--text-dim);">Xetra ist geschlossen</strong>';

    infoEl.innerHTML = 'Vergleich: ' + (session === 'pre' ? 'US-Vorbörse' : 'US-Handel') + ' in EUR vs. letzter Kurs in der App (' +
      window.App.Format.currency(germanNow, 'EUR') + '). ' + xetraLabel + '. ' +
      'Der Pfeil zeigt, in welche Richtung der deutsche Kurs tendiert.';
  }

  // VWAP als zweite horizontale Linie (auch im regulären Handel)
  var hLines = [{
    value: germanNow,
    color: '#f59e0b',
    width: 2,
    label: 'App-Kurs ' + window.App.Format.currency(germanNow, 'EUR', 2),
    dashed: true
  }];
  
  if (session === 'pre' || session === 'regular') {
    var vwapVal = computeVwap(prePoints);
    if (vwapVal) {
      hLines.push({
        value: vwapVal,
        color: '#3b82f6', 
        width: 1.5,
        label: 'VWAP ' + window.App.Format.currency(vwapVal, 'EUR', 2),
        dashed: false 
      });
    }
  }

  drawChart(container, prePoints, hLines);
}
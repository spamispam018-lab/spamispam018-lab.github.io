/**
 * js/stock-live.js
 * Tab „Live“ (hinter Backtest): Strategie und Parameter werden aus dem Backtest-Tab übernommen (Tageskurs-Werte).
 * Die Tages-Historie bis gestern bleibt unverändert; als „heutiger Schlusskurs“ wird jeweils der Live-Kurs (Minutendaten)
 * eingesetzt. So zeigt der Chart, bei welchem Kurs des heutigen Tages die Strategie kaufen bzw. verkaufen würde.
 * „Jetzt aktualisieren“ lädt frische Kurse und berechnet die Signale neu.
 */
window.App = window.App || {};

window.App.StockLive = (function () {
  'use strict';

  var INTERVALS = [{ m: 1, label: '1 Min' }, { m: 5, label: '5 Min' }, { m: 15, label: '15 Min' }];
  var RANGES = [{ k: '1d', label: '1T' }, { k: '6h', label: '6h' }, { k: '3h', label: '3h' }, { k: '2h', label: '2h' }, { k: '1h', label: '1h' }];
  var BUY = '#10b981', SELL = '#ef4444', PRICE = '#818cf8';

  var state = { type: 'sma_cross', params: {}, interval: 5, range: '1d' };
  var data = null;   // { ticker, points:[{t,price}], currency, us, fetchedAt }
  var daily = null;  // [{date, close}] der aktuellen Aktie

  function Q() { return window.App.Quant; }
  function F() { return window.App.Format; }
  function PM() { return window.App.PreMarket; }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function currentParams() {
    var out = {};
    Q().STRATEGIES[state.type].params.forEach(function (d) {
      var v = Number(state.params[state.type + '.' + d.key]);
      if (!isFinite(v) || v <= 0) { out[d.key] = d.def; return; }
      v = d.float ? Math.round(v * 100) / 100 : Math.round(v);
      out[d.key] = Math.min(d.max, Math.max(d.min, v));
    });
    return out;
  }

  // Strategie und Parameter aus dem Backtest-Tab holen
  function adoptBacktest() {
    var cfg = window.App.StockStrategy && window.App.StockStrategy.getConfig ? window.App.StockStrategy.getConfig() : null;
    if (!cfg || !Q().STRATEGIES[cfg.type]) return false;
    state.type = cfg.type;
    Object.keys(cfg.params).forEach(function (k) { state.params[cfg.type + '.' + k] = cfg.params[k]; });
    return true;
  }

  /* ---------- Daten ---------- */
  function load(ticker) {
    var pm = PM();
    var us = pm.isUsTicker(ticker);
    return Promise.all([
      pm.fetchChart(ticker, us, '5d'),
      pm.fetchChart('EURUSD=X', false).catch(function () { return null; })
    ]).then(function (res) {
      var meta = {};
      try { meta = res[0].chart.result[0].meta || {}; } catch (e) { /* leer */ }
      var cur = meta.currency || 'EUR';
      var fx = 1;
      if (cur === 'USD') {
        try { var r = res[1].chart.result[0].meta.regularMarketPrice; if (r > 0) fx = 1 / r; else fx = 0.92; } catch (e2) { fx = 0.92; }
        cur = 'EUR';
      }
      var pts = pm.extractSeries(res[0], fx).points;
      if (us) pts = pts.filter(function (p) { var s = pm.classifySession(p.t); return s === 'pre' || s === 'regular' || s === 'post'; });
      data = { ticker: ticker, points: pts, currency: cur, us: us, fetchedAt: Date.now() };
      return data;
    });
  }

  function dayKey(t) {
    return data && data.us ? PM().etDate(t) : new Date(t).toLocaleDateString('en-CA');
  }

  function aggregate(points, minutes) {
    if (minutes <= 1) return points.map(function (p) { return { t: p.t, price: p.price }; });
    var ms = minutes * 60000, out = [], lastBucket = null;
    points.forEach(function (p) {
      var b = Math.floor(p.t / ms);
      if (b === lastBucket) { out[out.length - 1].price = p.price; out[out.length - 1].t = p.t; }
      else { out.push({ t: p.t, price: p.price }); lastBucket = b; }
    });
    return out;
  }

  /* ---------- Berechnung ---------- */
  function compute() {
    var q = Q();
    if (!daily || daily.length < 60) return { error: 'Zu wenig Tageskurse für die Strategie (mindestens 60 Handelstage).' };
    if (!data.points.length) return { error: 'Keine Minutenkurse verfügbar (Börse geschlossen oder Proxy ohne Daten).' };

    var params = currentParams();
    var problem = q.validateParams(state.type, params);
    if (problem) return { error: problem };

    // Nur der aktuelle (zuletzt gehandelte) Tag zählt als „heute“
    var allBars = aggregate(data.points, state.interval);
    var today = dayKey(allBars[allBars.length - 1].t);
    var bars = allBars.filter(function (b) { return dayKey(b.t) === today; });
    if (state.range !== '1d') {
      var cut = bars[bars.length - 1].t - parseInt(state.range, 10) * 3600000;
      bars = bars.filter(function (b) { return b.t >= cut; });
    }
    if (bars.length < 3) return { error: 'Zu wenige Kerzen im gewählten Zeitfenster.' };

    var base = daily.filter(function (d) { return d.date < today; });
    if (base.length < 60) return { error: 'Zu wenig Tageskurse vor heute.' };
    var nb = base.length;
    var lastDaily = base[nb - 1].close, lastLive = bars[bars.length - 1].price;
    var mismatch = lastDaily > 0 && Math.abs(lastLive / lastDaily - 1) > 0.35;

    var hist = base.map(function (d) { return { date: d.date, close: d.close }; });
    hist.push({ date: today, close: lastLive });
    var closes = hist.map(function (h) { return h.close; });
    var dates = hist.map(function (h) { return h.date; });

    // Zustand zum gestrigen Schluss
    var prevSig = q.computeSignals(closes.slice(0, nb), state.type, params, dates.slice(0, nb))[nb - 1];

    // Je Kerze: „Was wäre das Signal, wenn der Tag hier schließt?“
    var sig = [], overlays = null, panels = null, j, k;
    for (j = 0; j < bars.length; j++) {
      hist[nb].close = bars[j].price; closes[nb] = bars[j].price;
      sig.push(q.computeSignals(closes, state.type, params, dates)[nb]);
      var ind = q.indicatorSeries(hist, state.type, params);
      if (!overlays) {
        overlays = ind.overlays.map(function (o) { return { name: o.name, color: o.color, dash: o.dash, width: o.width, values: [] }; });
        panels = ind.panels.map(function (pn) {
          return { title: pn.title, refLines: pn.refLines, min: pn.min, max: pn.max, lines: pn.lines.map(function (l) { return { name: l.name, color: l.color, values: [] }; }), bars: pn.bars ? [] : null };
        });
      }
      for (k = 0; k < overlays.length; k++) overlays[k].values.push(ind.overlays[k].values[nb]);
      for (k = 0; k < panels.length; k++) {
        panels[k].lines.forEach(function (l, li) { l.values.push(ind.panels[k].lines[li].values[nb]); });
        if (panels[k].bars) panels[k].bars.push(ind.panels[k].bars[nb]);
      }
    }
    var noteInd = q.indicatorSeries(hist, state.type, params).note;

    var events = [], prev = prevSig;
    for (j = 0; j < bars.length; j++) {
      if (sig[j] !== prev) events.push({ i: j, type: sig[j] === 1 ? 'Buy' : 'Sell', t: bars[j].t, price: bars[j].price });
      prev = sig[j];
    }
    return { bars: bars, sig: sig, prevSig: prevSig, overlays: overlays, panels: panels, events: events, params: params, today: today, lastDaily: lastDaily, mismatch: mismatch, note: noteInd };
  }

  function hm(t) { return new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }

  /* ---------- Darstellung ---------- */
  function shell(ticker) {
    var q = Q();
    var opts = Object.keys(q.STRATEGIES).map(function (k) {
      return '<option value="' + k + '"' + (k === state.type ? ' selected' : '') + '>' + esc(q.STRATEGIES[k].label) + '</option>';
    }).join('');
    var ivs = INTERVALS.map(function (v) {
      return '<button class="pill-btn' + (v.m === state.interval ? ' active' : '') + '" data-lv-interval="' + v.m + '">' + v.label + '</button>';
    }).join('');
    var rgs = RANGES.map(function (v) {
      return '<button class="pill-btn' + (v.k === state.range ? ' active' : '') + '" data-lv-range="' + v.k + '">' + v.label + '</button>';
    }).join('');
    return '' +
      '<div class="card" id="lv-card">' +
        '<div class="card-header-dotted"><span class="card-title">⚡ Live-Signal · ' + esc(ticker) + '</span><span class="period-tag" id="lv-session">—</span></div>' +
        '<div style="font-size:0.74rem;color:var(--text-dim);line-height:1.45;margin-bottom:10px;" id="lv-adopted"></div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
          '<div><label for="lv-type" style="font-size:0.72rem;color:var(--text-dim);">Strategie</label>' +
            '<select id="lv-type" class="sort-select" style="width:100%;margin-top:4px;">' + opts + '</select>' +
            '<div id="lv-desc" style="font-size:0.72rem;color:var(--text-dim);margin-top:6px;line-height:1.4;"></div></div>' +
          '<div id="lv-params" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;"></div>' +
          '<button class="chip-btn" id="lv-adopt" style="justify-content:center;">↩ Werte erneut aus Backtest übernehmen</button>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">Kurs &amp; Signale heute</span><span class="period-tag" id="lv-stamp">—</span></div>' +
        '<div id="lv-summary" style="margin:6px 0 10px;"></div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">' +
          '<span style="font-size:0.72rem;color:var(--text-dim);font-weight:600;">Kerzenlänge</span><div class="pill-group" id="lv-intervals">' + ivs + '</div></div>' +
        '<div id="lv-chart-wrap"><div class="state-box"><div class="spinner"></div><p>Lade Kurse…</p></div></div>' +
        '<div class="pill-group" id="lv-ranges" style="margin-top:10px;justify-content:center;display:flex;">' + rgs + '</div>' +
        '<div style="margin-top:12px;"><button class="chip-btn active" id="lv-refresh" style="width:100%;justify-content:center;height:38px;">🔄 Jetzt aktualisieren</button></div>' +
        '<div id="lv-events" style="margin-top:12px;"></div>' +
        '<div style="font-size:0.68rem;color:var(--text-dim);margin-top:10px;line-height:1.5;">' +
          'So lesen: Die Strategie arbeitet mit den <strong>Tageskursen</strong> bis gestern. Für „heute“ wird der jeweilige Live-Kurs als Schlusskurs eingesetzt. ' +
          '▲/▼ zeigen, bei welchem Kurs des heutigen Tages sich das Signal geändert hätte. Maßgeblich ist erst der Schlusskurs: Nahe an einer Schwelle kann das Signal im Tagesverlauf mehrfach wechseln. ' +
          'Der Backtest handelt erst am Schlusskurs des Folgetags. Keine Anlageberatung.</div>' +
      '</div>';
  }

  function drawParams(root) {
    var def = Q().STRATEGIES[state.type];
    root.querySelector('#lv-desc').textContent = def.desc;
    var cur = currentParams();
    root.querySelector('#lv-params').innerHTML = def.params.map(function (d) {
      return '<div><label style="font-size:0.7rem;color:var(--text-dim);">' + esc(d.label) + '</label>' +
        '<input class="search-input" type="number" data-lv-param="' + d.key + '" min="' + d.min + '" max="' + d.max + '" step="' + (d.step || (d.float ? 0.1 : 1)) +
        '" inputmode="decimal" value="' + cur[d.key] + '" style="width:100%;margin-top:4px;padding-left:12px;"></div>';
    }).join('') || '<div style="font-size:0.75rem;color:var(--text-dim);">Diese Strategie hat keine Parameter.</div>';
    var def2 = def.params.map(function (d) { return cur[d.key]; }).join(' / ');
    root.querySelector('#lv-adopted').innerHTML = 'Aktiv: <strong>' + esc(def.label) + '</strong>' + (def2 ? ' (' + esc(def2) + ')' : '') + ' – Werte aus dem Backtest-Tab, hier änderbar.';
  }

  function update(root) {
    var out = root.querySelector('#lv-chart-wrap'), sum = root.querySelector('#lv-summary'), evBox = root.querySelector('#lv-events');
    if (!data) return;
    var cur = data.currency;
    var money = function (v) { return F().currency(v, cur, 2); };

    var badge = root.querySelector('#lv-session');
    if (data.points.length) {
      var lastT = data.points[data.points.length - 1].t;
      var sess = data.us ? PM().classifySession(lastT) : 'regular';
      badge.textContent = sess === 'pre' ? 'Vorbörse' : sess === 'post' ? 'Nachbörse' : sess === 'regular' ? 'Handel' : 'Geschlossen';
    }
    root.querySelector('#lv-stamp').textContent = 'Stand ' + new Date(data.fetchedAt).toLocaleTimeString('de-DE');

    var c = compute();
    if (c.error) { sum.innerHTML = ''; out.innerHTML = '<div class="state-box"><p>' + esc(c.error) + '</p></div>'; evBox.innerHTML = ''; return; }

    var n = c.bars.length, last = c.bars[n - 1];
    var inPos = c.sig[n - 1] === 1, changedToday = (inPos ? 1 : 0) !== c.prevSig;
    var lastEv = c.events.length ? c.events[c.events.length - 1] : null;
    var headline = inPos ? 'Kaufsignal aktiv (investiert)' : 'Kein Kaufsignal (Cash)';
    var detail;
    if (!c.events.length) detail = 'Seit dem gestrigen Schluss unverändert (' + (c.prevSig === 1 ? 'investiert' : 'Cash') + ').';
    else detail = 'Gestern Schluss: ' + (c.prevSig === 1 ? 'investiert' : 'Cash') + ' · heute zuletzt ' + (lastEv.type === 'Buy' ? 'Kauf' : 'Verkauf') + ' um ' + hm(lastEv.t) + ' bei ' + money(lastEv.price) + '.';
    sum.innerHTML = '<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;background:var(--bg-tertiary);border-left:4px solid ' + (inPos ? BUY : SELL) + ';">' +
      '<div style="font-size:1.4rem;color:' + (inPos ? BUY : SELL) + ';">' + (inPos ? '▲' : '▼') + '</div><div style="flex:1;">' +
      '<div style="font-weight:800;">' + headline + (changedToday ? ' · neu heute' : '') + '</div>' +
      '<div style="font-size:0.76rem;color:var(--text-dim);margin-top:2px;">' + detail + '</div>' +
      '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:2px;">Aktueller Kurs ' + money(last.price) + ' (' + F().percent((last.price / c.lastDaily - 1) * 100, true, 2) + ' zum gestrigen Schluss) · ' + c.events.length + ' Wechsel im Zeitfenster</div>' +
      (c.mismatch ? '<div style="font-size:0.72rem;color:var(--bearish);margin-top:4px;">Achtung: Live-Kurs und Tageskurse weichen stark ab (Währung?). Signale sind dann unzuverlässig.</div>' : '') +
      '</div></div>';

    var labels = c.bars.map(function (b) { return hm(b.t); });
    var dot = function (color, label) { return '<div class="legend-item"><span class="legend-dot" style="background:' + color + ';"></span><span>' + label + '</span></div>'; };
    var legend = dot(PRICE, 'Kurs') + c.overlays.map(function (o) { return dot(o.color, esc(o.name)); }).join('') +
      '<div class="legend-item"><span style="color:' + BUY + ';font-size:0.8rem;">▲</span><span>Wechsel zu Kauf</span></div>' +
      '<div class="legend-item"><span style="color:' + SELL + ';font-size:0.8rem;">▼</span><span>Wechsel zu Cash</span></div>' +
      '<div class="legend-item"><span class="legend-dot" style="background:rgba(16,185,129,0.35);"></span><span>Kaufsignal</span></div>';

    var h = '<div style="height:240px;position:relative;"><canvas id="lv-price" class="chart-canvas" style="height:100%;"></canvas></div><div class="legend-row">' + legend + '</div>' +
      (c.note ? '<div style="font-size:0.72rem;color:var(--text-dim);line-height:1.45;margin-top:6px;">' + esc(c.note) + '</div>' : '');
    c.panels.forEach(function (pn, k) {
      h += '<div style="font-size:0.74rem;color:var(--text-dim);font-weight:600;margin:14px 0 4px;">' + esc(pn.title) + '</div>' +
        '<div style="height:120px;position:relative;"><canvas id="lv-p' + k + '" class="chart-canvas" style="height:100%;"></canvas></div>' +
        '<div class="legend-row">' + pn.lines.map(function (l) { return dot(l.color, esc(l.name)); }).join('') + '</div>';
    });
    out.innerHTML = h;

    var shade = c.sig.map(function (v) { return v === 1; });
    var C = window.App.Charts;
    var series = [{ values: c.bars.map(function (b) { return b.price; }), color: PRICE, width: 2 }];
    c.overlays.forEach(function (o) { series.push({ values: o.values, color: o.color, width: o.width || 1.5, dash: o.dash || undefined }); });
    C.renderMultiLineChart(out.querySelector('#lv-price'), {
      labels: labels, series: series, shade: shade,
      markers: c.events.map(function (e) { return { index: e.i, type: e.type }; }),
      formatY: function (v) { return F().currency(v, cur, 2); }
    });
    c.panels.forEach(function (pn, k) {
      C.renderIndicatorChart(out.querySelector('#lv-p' + k), {
        labels: labels,
        lines: pn.lines.map(function (l) { return { values: l.values, color: l.color }; }),
        bars: pn.bars, refLines: pn.refLines || [], shade: shade, min: pn.min, max: pn.max,
        formatY: function (v) { return Math.abs(v) < 10 ? F().number(v, 1) : F().number(v, 0); }
      });
    });

    var list = c.events.slice().reverse().slice(0, 10);
    evBox.innerHTML = list.length
      ? '<div style="font-size:0.74rem;color:var(--text-dim);font-weight:600;margin-bottom:4px;">Signalwechsel heute</div>' +
        '<table class="data-table compact"><thead><tr><th>Zeit</th><th>Signal</th><th style="text-align:right;">Kurs</th></tr></thead><tbody>' +
        list.map(function (e) {
          return '<tr><td>' + hm(e.t) + '</td><td style="color:' + (e.type === 'Buy' ? BUY : SELL) + ';font-weight:700;">' + (e.type === 'Buy' ? '▲ Kauf' : '▼ Verkauf') + '</td><td style="text-align:right;">' + money(e.price) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div style="font-size:0.78rem;color:var(--text-dim);">Heute noch kein Signalwechsel im gewählten Zeitfenster.</div>';
  }

  function render(container, stock) {
    var ticker = (stock.ticker || (stock.profile && stock.profile.ticker) || '').toUpperCase();
    if (!PM() || !Q()) { container.innerHTML = '<div class="state-box"><p>Live-Modul nicht verfügbar.</p></div>'; return; }
    daily = (stock.chartHistory || []).filter(function (p) { return p && p.close > 0 && p.date; }).map(function (p) { return { date: String(p.date).slice(0, 10), close: p.close }; });
    data = null;
    adoptBacktest();
    container.innerHTML = shell(ticker);
    drawParams(container);

    var btn = container.querySelector('#lv-refresh');
    function refresh() {
      btn.disabled = true; btn.style.opacity = '0.7';
      btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></div> Lädt…';
      return load(ticker).then(function () { update(container); }).catch(function (err) {
        container.querySelector('#lv-chart-wrap').innerHTML = '<div class="state-box"><p style="color:var(--bearish);">Fehler: ' + esc(err && err.message) + '</p>' +
          '<p style="font-size:0.72rem;">Prüfe den Proxy oder versuche es später erneut.</p></div>';
      }).then(function () {
        btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = '🔄 Jetzt aktualisieren';
      });
    }
    btn.onclick = refresh;

    container.querySelector('#lv-adopt').onclick = function () { adoptBacktest(); container.querySelector('#lv-type').value = state.type; drawParams(container); if (data) update(container); };
    container.querySelector('#lv-type').onchange = function (e) { state.type = e.target.value; drawParams(container); if (data) update(container); };
    container.querySelector('#lv-params').addEventListener('change', function (e) {
      var k = e.target && e.target.getAttribute && e.target.getAttribute('data-lv-param');
      if (!k) return;
      state.params[state.type + '.' + k] = e.target.value;
      drawParams(container); if (data) update(container);
    });
    function pills(sel, attr, key, num) {
      container.querySelectorAll(sel + ' .pill-btn').forEach(function (b) {
        b.onclick = function () {
          var v = b.getAttribute(attr); state[key] = num ? Number(v) : v;
          container.querySelectorAll(sel + ' .pill-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
          if (data) update(container);
        };
      });
    }
    pills('#lv-intervals', 'data-lv-interval', 'interval', true);
    pills('#lv-ranges', 'data-lv-range', 'range', false);

    refresh();
  }

  return { render: render };
})();

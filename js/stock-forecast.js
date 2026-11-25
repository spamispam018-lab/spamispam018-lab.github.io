/**
 * js/stock-forecast.js – Szenario-Chart (keine Prognose!)
 * Folgt dem Analysezeitraum der Chart-Seite: gleich langer Blick zurück und nach vorn.
 * Zeigt Szenarien (niedriges/mittleres/hohes Analystenziel – bei ETFs aus den Top-Holdings gewichtet),
 * statistische Schwankungsbreite (1σ), Trendkanal und Unterstützungszone (52W-Tief).
 *
 * ETFs: Szenarien aus den Analystenzielen der Top-10-Positionen, nach Gewicht gemittelt (js/etf-holdings.js).
 */
window.App = window.App || {};
window.App.Forecast = (function () {
  'use strict';
  var WIN = { '1W': 5, '1M': 21, '3M': 63, '6M': 126, '1Y': 250 };
  var PL = { '1W': ['1 Woche', '1 Wo.'], '1M': ['1 Monat', '1 Mon.'], '3M': ['3 Monate', '3 Mon.'], '6M': ['6 Monate', '6 Mon.'], '1Y': ['12 Monate', '12 Mon.'] };
  var state = { analyst: true, cone: true, trend: false };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  
  /** Kursziel-Szenarien eines ETFs aus seinen Top-10-Positionen (js/etf-holdings.js). */
  function fetchEtfTargets(stock) {
    return window.App.EtfHoldings ? window.App.EtfHoldings.targets(stock, 10) : Promise.resolve(null);
  }

  function compute(closes, targets, period, stock) {
    var full = closes.slice(-250);
    if (full.length < 60) return null;
    var win = WIN[period] || 250, F = win;
    var c = closes.slice(-(win + 1)), n = c.length, px = c[n - 1], i;
    var rets = [];
    for (i = 1; i < full.length; i++) rets.push(Math.log(full[i] / full[i - 1]));
    var mu = rets.reduce(function (a, b) { return a + b; }, 0) / rets.length;
    var sigma = Math.sqrt(rets.reduce(function (a, b) { return a + (b - mu) * (b - mu); }, 0) / (rets.length - 1));
    var m = { c: c, n: n, F: F, px: px, sigma: sigma, period: PL[period] ? period : '1Y', hasTrend: closes.length >= 20 };
    if (m.hasTrend) {
      // Kurze Zeiträume (1 Woche): Kanal über mindestens 20 Handelstage berechnen, nur der sichtbare Teil wird gezeichnet
      var fitN = Math.min(closes.length, Math.max(n, 20)), cf = closes.slice(-fitN);
      m.off = fitN - n;
      var ly = cf.map(Math.log), mx = (fitN - 1) / 2, my = ly.reduce(function (a, b) { return a + b; }, 0) / fitN, sxy = 0, sxx = 0, res = 0;
      for (i = 0; i < fitN; i++) { sxy += (i - mx) * (ly[i] - my); sxx += (i - mx) * (i - mx); }
      m.b = sxy / sxx; m.a = my - m.b * mx;
      for (i = 0; i < fitN; i++) res += Math.pow(ly[i] - (m.a + m.b * i), 2);
      m.s = Math.sqrt(res / (fitN - 2));
    }
    var low = Math.min.apply(null, full);
    m.support = [low, low * 1.05];
    m.coneLo = px * Math.exp(-sigma * Math.sqrt(F)); m.coneHi = px * Math.exp(sigma * Math.sqrt(F));
    
    var t = targets || {}, r = Math.min(1, F / 252);
    m.raw = { low: t.low || null, mean: t.mean || null, high: t.high || null };
    m.tCount = t.analystCount || null;
    m.isEtfHoldingsTarget = t.isAggregated || false;
    m.etf = t.isAggregated ? t : null;

    // Wenn keine direkten Analystenziele da sind, aber Holdings (ETF) vorliegen, haben wir sie extern geladen.
    // Der Fallback (Fake-Zahlen) ist entfernt.

    ['low', 'mean', 'high'].forEach(function (k) { m['t' + k] = m.raw[k] ? px + (m.raw[k] - px) * r : null; });
    return m;
  }

  function mount(slot, stock, closes, period) {
    if (!slot) return;

    var isEtf = window.App.EtfHoldings ? window.App.EtfHoldings.isEtf(stock) : (stock.sector === 'Sonstige' || stock.sector === 'ETF' || !stock.sector);
    var hasDirectTargets = stock.analysts && stock.analysts.targets && stock.analysts.targets.mean;

    if (isEtf && !hasDirectTargets && stock.holdings && stock.holdings.length > 0) {
      // Ladezustand anzeigen
      slot.innerHTML = '<div class="card" style="padding: 30px; text-align: center;"><div class="spinner" style="margin: 0 auto 12px;"></div><p style="font-size: 0.85rem; color: var(--text-dim);">Berechne Szenarien aus den größten ETF-Positionen…</p></div>';
      
      fetchEtfTargets(stock).then(function(aggTargets) {
        var m = compute(closes, aggTargets, period, stock);
        renderChart(slot, stock, closes, period, m);
      }).catch(function() {
        var m = compute(closes, stock.analysts && stock.analysts.targets, period, stock);
        renderChart(slot, stock, closes, period, m);
      });
    } else {
      var m = compute(closes, stock.analysts && stock.analysts.targets, period, stock);
      renderChart(slot, stock, closes, period, m);
    }
  }

  function renderChart(slot, stock, closes, period, m) {
    if (!m) { slot.innerHTML = ''; return; }
    var F = window.App.Format, cur = (stock.quote && stock.quote.currency) || 'EUR', pl = PL[m.period];
    function eur(v) { return F.currency(v, cur); }
    function pill(k, label) { return '<button class="pill-btn fc-toggle ' + (state[k] ? 'active' : '') + '" data-k="' + k + '">' + label + '</button>'; }
    var sum = '';
    
    var labels = ['Pessimistisch', 'Basis', 'Optimistisch'];
    var descs = m.isEtfHoldingsTarget ? ['niedrige Kursziele der Top-Positionen', 'mittlere Kursziele, gewichtet', 'hohe Kursziele der Top-Positionen'] : ['niedrigstes Kursziel', 'mittleres Kursziel', 'höchstes Kursziel'];

    [['low', '#ef4444', 0], ['mean', '#a78bfa', 1], ['high', '#22c55e', 2]].forEach(function (r, idx) {
      var v = m.raw[r[0]];
      if (!v) return;
      var d = (v / m.px - 1) * 100;
      sum += '<div class="chart-signal-row"><span class="chart-dot" style="background:' + r[1] + ';"></span><div class="chart-signal-text"><div class="chart-signal-value">' +
        labels[idx] + ' (' + descs[idx] + '): ' + eur(v) + ' (' + (d >= 0 ? '+' : '') + F.number(d, 0) + ' %)' +
        (m.period !== '1Y' ? '<div style="color:var(--text-dim);font-size:.72rem;">Punkt im Chart (anteilig bis in ' + pl[1] + '): ' + eur(m['t' + r[0]]) + '</div>' : '') +
        '</div></div></div>';
    });

    if (!m.raw.low && !m.raw.mean && !m.raw.high) {
      sum += '<div class="chart-signal-value" style="color:var(--text-dim);">Keine Analysten-Kursziele vorhanden.</div>';
    } else {
      sum += '<div class="chart-signal-value" style="color:var(--text-dim);">' + 
        (m.etf ? '<b>ETF:</b> Kurspotenzial nach Gewicht gemittelt aus ' + (m.etf.used < m.etf.total ? m.etf.used + ' der ' : 'den ') + m.etf.total +
            ' größten Positionen' + (m.etf.used < m.etf.total ? ' (nur Werte mit Kurszielen in der App)' : '') + ', zusammen ' +
            F.number(m.etf.coveredWeight, 0) + ' % des ETFs' +
            (m.etf.via && m.etf.via !== 'fest' ? ' (Positionen laut ' + esc(m.etf.via) + ', US-ETF auf denselben Index)' : (m.etf.via === 'fest' ? ' (Positionen aus fester Liste, evtl. veraltet)' : '')) + '. ' +
            '<span style="white-space:normal;">' + m.etf.items.map(function (x) { return esc(x.ticker) + ' ' + F.number(x.weight, 1) + ' % → ' + (x.upside >= 0 ? '+' : '') + F.number(x.upside, 0) + ' %'; }).join(' · ') + '</span>. '
          : (m.tCount ? 'Basis aus ' + m.tCount + ' Analysten. ' : '')) +
        (m.period !== '1Y' ? 'Kursziele gelten ca. 12 Monate, die Punkte im Chart zeigen den anteiligen Wert bis in ' + pl[1] + '.' : '') + '</div>';
    }
    sum += '<div class="chart-signal-value">Typische Schwankungsbreite bis in ' + pl[1] + ' (1σ, ca. 68 %): ' + eur(m.coneLo) + ' – ' + eur(m.coneHi) + '</div>';
    
    slot.innerHTML = '<div class="card"><div class="card-header-dotted"><span class="card-title">Szenario-Chart</span><span class="period-tag">' + pl[0] + '</span></div>' +
      '<div class="pill-group" style="margin-bottom:8px;">' + pill('analyst', 'Szenarien') + pill('cone', 'Schwankungsbreite') + (m.hasTrend ? pill('trend', 'Trendkanal') : '') + '</div>' +
      '<div style="position:relative;width:100%;height:240px;"><canvas id="fc-canvas" style="width:100%;height:100%;"></canvas></div>' +
      '<div style="margin-top:8px;">' + sum + '</div>' +
      '<div class="chart-note">Szenario-Darstellung, keine Kursprognose. Der Zeitraum folgt dem Analysezeitraum oben. Die Szenario-Linien basieren auf Analystenzielen' + (m.isEtfHoldingsTarget ? ' der größten ETF-Positionen' : '') + ', die Bandbreite beruht auf vergangenen Schwankungen. Keine Anlageberatung. Blaue Zone: 52W-Tief-Bereich als mögliche Unterstützung.</div></div>';
    
    draw(slot.querySelector('#fc-canvas'), m);
    
    [].forEach.call(slot.querySelectorAll('.fc-toggle'), function (btn) {
      btn.onclick = function () { var k = btn.getAttribute('data-k'); state[k] = !state[k]; mount(slot, stock, closes, period); };
    });
  }

  function draw(cv, m) {
    if (!cv) return;
    var dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 320, H = cv.clientHeight || 240;
    cv.width = W * dpr; cv.height = H * dpr;
    var g = cv.getContext('2d'); g.scale(dpr, dpr);
    var css = getComputedStyle(cv);
    var txt = css.getPropertyValue('--text-main').trim() || '#e5e7eb', dim = css.getPropertyValue('--text-dim').trim() || '#94a3b8';
    var n = m.n, F = m.F, X = n - 1, total = n + F, i, trendOn = state.trend && m.hasTrend, tf = Math.round(F / 2);
    var vals = m.c.slice();
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = hi - lo || hi * 0.02;
    var supOk = m.support[0] >= lo - span * 0.5 && m.support[1] <= hi + span * 0.5;
    if (supOk) vals.push(m.support[0], m.support[1]);
    if (state.cone) vals.push(m.coneLo, m.coneHi);
    if (state.analyst) [m.tlow, m.tmean, m.thigh].forEach(function (v) { if (v) vals.push(v); });
    var mn = Math.min.apply(null, vals), mxv = Math.max.apply(null, vals), pad = (mxv - mn) * 0.06; mn = Math.max(0, mn - pad); mxv += pad;
    var L = 6, R = 52, T = 8, B = 22, pw = W - L - R, ph = H - T - B;
    function x(k) { return L + (k / (total - 1)) * pw; }
    function y(v) { return T + (1 - (v - mn) / (mxv - mn)) * ph; }
    g.font = '10px sans-serif'; g.textBaseline = 'middle';
    var rng = (mxv - mn) / 4, ex10 = Math.pow(10, Math.floor(Math.log(rng) / Math.LN10)), fr = rng / ex10;
    var step = (fr < 1.5 ? 1 : fr < 3 ? 2 : fr < 7 ? 5 : 10) * ex10, dec = step >= 1 ? 0 : (step >= 0.1 ? 1 : 2);
    for (var tv = Math.ceil(mn / step) * step; tv <= mxv + step * 1e-6; tv += step) {
      var yy = y(tv);
      g.strokeStyle = 'rgba(148,163,184,.15)'; g.lineWidth = 1; g.beginPath(); g.moveTo(L, yy); g.lineTo(W - R, yy); g.stroke();
      g.fillStyle = dim; g.textAlign = 'left'; g.fillText(tv.toFixed(dec), W - R + 4, yy);
    }
    g.save(); g.beginPath(); g.rect(L - 1, T - 2, pw + 9, ph + 4); g.clip();
    if (supOk) { g.fillStyle = 'rgba(59,130,246,.22)'; g.fillRect(x(0), y(m.support[1]), x(total - 1) - x(0), y(m.support[0]) - y(m.support[1])); }
    if (state.cone) {
      var st = Math.max(1, Math.round(F / 60));
      g.fillStyle = 'rgba(148,163,184,.18)'; g.beginPath(); g.moveTo(x(X), y(m.px));
      for (i = st; i <= F; i += st) g.lineTo(x(X + i), y(m.px * Math.exp(m.sigma * Math.sqrt(i))));
      g.lineTo(x(total - 1), y(m.coneHi)); g.lineTo(x(total - 1), y(m.coneLo));
      for (i = F - (F % st); i >= st; i -= st) g.lineTo(x(X + i), y(m.px * Math.exp(-m.sigma * Math.sqrt(i))));
      g.closePath(); g.fill();
    }
    if (trendOn) {
      [[0, '#8b5cf6'], [1.5, 'rgba(139,92,246,.6)'], [-1.5, 'rgba(139,92,246,.6)']].forEach(function (d) {
        g.strokeStyle = d[1]; g.lineWidth = 1; g.setLineDash(d[0] === 0 ? [2, 3] : []); g.beginPath();
        var step = Math.max(1, Math.round((n - 1 + tf) / 60));
        for (var k = 0; k <= n - 1 + tf; k += step) { var px_ = x(k), py_ = y(Math.exp(m.a + m.b * (k + m.off) + d[0] * m.s)); if (k === 0) g.moveTo(px_, py_); else g.lineTo(px_, py_); }
        g.stroke(); g.setLineDash([]);
      });
    }
    g.strokeStyle = txt; g.lineWidth = 1.6; g.beginPath();
    for (i = 0; i < n; i++) { if (i === 0) g.moveTo(x(i), y(m.c[i])); else g.lineTo(x(i), y(m.c[i])); }
    g.stroke();
    g.strokeStyle = dim; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x(X), T); g.lineTo(x(X), T + ph); g.stroke(); g.setLineDash([]);
    if (state.analyst) {
      var ex = x(total - 1);
      [[m.tlow, '#ef4444'], [m.tmean, '#a78bfa'], [m.thigh, '#22c55e']].forEach(function (sc) {
        if (!sc[0]) return;
        g.strokeStyle = sc[1]; g.fillStyle = sc[1]; g.lineWidth = 1.5; g.setLineDash([5, 4]);
        g.beginPath(); g.moveTo(x(X), y(m.px)); g.lineTo(ex, y(sc[0])); g.stroke(); g.setLineDash([]);
        g.beginPath(); g.arc(ex, y(sc[0]), 4, 0, 6.283); g.fill();
      });
    }
    g.restore();
    var pl = PL[m.period][1];
    g.fillStyle = dim; g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillText('vor ' + pl, L, H - 6);
    g.textAlign = 'center'; g.fillText('Heute', x(X), H - 6); g.textAlign = 'right'; g.fillText('in ' + pl, W - R, H - 6);
  }

  return { mount: mount, _compute: compute };
})();
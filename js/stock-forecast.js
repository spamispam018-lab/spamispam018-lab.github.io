/**
 * js/stock-forecast.js – Szenario-Chart (keine Prognose!)
 * Folgt dem Analysezeitraum der Chart-Seite: gleich langer Blick zurück und nach vorn.
 * Zeigt Szenarien (niedriges/mittleres/hohes Analystenziel), statistische Schwankungsbreite (1σ),
 * Trendkanal und Unterstützungszone (52W-Tief).
 */
window.App = window.App || {};
window.App.Forecast = (function () {
  'use strict';
  var WIN = { '1W': 5, '1M': 21, '3M': 63, '6M': 126, '1Y': 250 };
  var PL = { '1W': ['1 Woche', '1 Wo.'], '1M': ['1 Monat', '1 Mon.'], '3M': ['3 Monate', '3 Mon.'], '6M': ['6 Monate', '6 Mon.'], '1Y': ['12 Monate', '12 Mon.'] };
  var state = { analyst: true, cone: true, trend: false };

  function compute(closes, targets, period) {
    var full = closes.slice(-250);
    if (full.length < 60) return null;
    var win = WIN[period] || 250, F = win;
    var c = closes.slice(-(win + 1)), n = c.length, px = c[n - 1], i;
    var rets = [];
    for (i = 1; i < full.length; i++) rets.push(Math.log(full[i] / full[i - 1]));
    var mu = rets.reduce(function (a, b) { return a + b; }, 0) / rets.length;
    var sigma = Math.sqrt(rets.reduce(function (a, b) { return a + (b - mu) * (b - mu); }, 0) / (rets.length - 1));
    var m = { c: c, n: n, F: F, px: px, sigma: sigma, period: PL[period] ? period : '1Y', hasTrend: n >= 20 };
    if (m.hasTrend) { // Trendkanal: lineare Regression auf ln(Kurs) im angezeigten Zeitraum
      var ly = c.map(Math.log), mx = (n - 1) / 2, my = ly.reduce(function (a, b) { return a + b; }, 0) / n, sxy = 0, sxx = 0, res = 0;
      for (i = 0; i < n; i++) { sxy += (i - mx) * (ly[i] - my); sxx += (i - mx) * (i - mx); }
      m.b = sxy / sxx; m.a = my - m.b * mx;
      for (i = 0; i < n; i++) res += Math.pow(ly[i] - (m.a + m.b * i), 2);
      m.s = Math.sqrt(res / (n - 2));
    }
    var low = Math.min.apply(null, full);
    m.support = [low, low * 1.05];
    m.coneLo = px * Math.exp(-sigma * Math.sqrt(F)); m.coneHi = px * Math.exp(sigma * Math.sqrt(F));
    var t = targets || {}, r = Math.min(1, F / 252); // Kursziele gelten ca. 12 Monate: bei kürzerem Zeitraum anteilig
    m.raw = { low: t.low || null, mean: t.mean || null, high: t.high || null };
    ['low', 'mean', 'high'].forEach(function (k) { m['t' + k] = m.raw[k] ? px + (m.raw[k] - px) * r : null; });
    m.tCount = t.analystCount || null;
    return m;
  }

  function mount(slot, stock, closes, period) {
    if (!slot) return;
    var m = compute(closes, stock.analysts && stock.analysts.targets, period);
    if (!m) { slot.innerHTML = ''; return; }
    var F = window.App.Format, cur = (stock.quote && stock.quote.currency) || 'EUR', pl = PL[m.period];
    function eur(v) { return F.currency(v, cur); }
    function pill(k, label) { return '<button class="pill-btn fc-toggle ' + (state[k] ? 'active' : '') + '" data-k="' + k + '">' + label + '</button>'; }
    var sum = '';
    [['Pessimistisch', 'low', '#ef4444', 'niedrigstes Kursziel'], ['Basis', 'mean', '#a78bfa', 'mittleres Kursziel'], ['Optimistisch', 'high', '#22c55e', 'höchstes Kursziel']].forEach(function (r) {
      var v = m.raw[r[1]];
      if (!v) return;
      var d = (v / m.px - 1) * 100;
      sum += '<div class="chart-signal-row"><span class="chart-dot" style="background:' + r[2] + ';"></span><div class="chart-signal-text"><div class="chart-signal-value">' +
        r[0] + ' (' + r[3] + '): ' + eur(v) + ' (' + (d >= 0 ? '+' : '') + F.number(d, 0) + ' %)' +
        (m.period !== '1Y' ? '<div style="color:var(--text-dim);font-size:.72rem;">Punkt im Chart (anteilig bis in ' + pl[1] + '): ' + eur(m['t' + r[1]]) + '</div>' : '') +
        '</div></div></div>';
    });
    if (!m.raw.low && !m.raw.mean && !m.raw.high) sum += '<div class="chart-signal-value">Keine Analysten-Kursziele vorhanden.</div>';
    else {
      sum += '<div class="chart-signal-value" style="color:var(--text-dim);">' + (m.tCount ? 'Basis aus ' + m.tCount + ' Analysten' + (m.tCount < 5 ? ' (wenige, wenig aussagekräftig)' : '') + '. ' : '') +
        (m.period !== '1Y' ? 'Kursziele gelten ca. 12 Monate, die Punkte im Chart zeigen den anteiligen Wert bis in ' + pl[1] + '.' : '') + '</div>';
    }
    sum += '<div class="chart-signal-value">Typische Schwankungsbreite bis in ' + pl[1] + ' (1σ, ca. 68 %): ' + eur(m.coneLo) + ' – ' + eur(m.coneHi) + '</div>';
    slot.innerHTML = '<div class="card"><div class="card-header-dotted"><span class="card-title">Szenario-Chart</span><span class="period-tag">' + pl[0] + '</span></div>' +
      '<div class="pill-group" style="margin-bottom:8px;">' + pill('analyst', 'Szenarien') + pill('cone', 'Schwankungsbreite') + (m.hasTrend ? pill('trend', 'Trendkanal') : '') + '</div>' +
      '<div style="position:relative;width:100%;height:240px;"><canvas id="fc-canvas" style="width:100%;height:100%;"></canvas></div>' +
      '<div style="margin-top:8px;">' + sum + '</div>' +
      '<div class="chart-note">Szenario-Darstellung, keine Kursprognose. Der Zeitraum folgt dem Analysezeitraum oben. Die drei Szenario-Linien folgen den Kurszielen der Analysten, die Bandbreite beruht nur auf vergangenen Schwankungen. Beides kann weit danebenliegen, keine Anlageberatung. Blaue Zone: 52W-Tief-Bereich als mögliche Unterstützung.</div></div>';
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
    var supOk = m.support[0] >= lo - span * 0.5 && m.support[1] <= hi + span * 0.5; // Zone nur zeigen, wenn sie im Bild sinnvoll liegt
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
    g.save(); g.beginPath(); g.rect(L - 1, T - 2, pw + 9, ph + 4); g.clip(); // Linien nicht über den Rand hinaus zeichnen
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
        for (var k = 0; k <= n - 1 + tf; k += step) { var px_ = x(k), py_ = y(Math.exp(m.a + m.b * k + d[0] * m.s)); if (k === 0) g.moveTo(px_, py_); else g.lineTo(px_, py_); }
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

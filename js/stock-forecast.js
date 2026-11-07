/**
 * js/stock-forecast.js – Szenario-Chart (keine Prognose!)
 * Zeigt Kursverlauf + Analysten-Kursziele + statistische Schwankungsbreite (1σ) + Trendkanal + Unterstützungszone.
 */
window.App = window.App || {};
window.App.Forecast = (function () {
  'use strict';
  var HIST = 250, FUT = 252, TREND_FUT = 126;
  var state = { analyst: true, cone: true, trend: false };

  function compute(closes, targets) {
    var c = closes.slice(-HIST), n = c.length;
    if (n < 60) return null;
    var px = c[n - 1], i, rets = [];
    for (i = 1; i < n; i++) rets.push(Math.log(c[i] / c[i - 1]));
    var mu = rets.reduce(function (a, b) { return a + b; }, 0) / rets.length;
    var sigma = Math.sqrt(rets.reduce(function (a, b) { return a + (b - mu) * (b - mu); }, 0) / (rets.length - 1));
    // Trendkanal: lineare Regression auf ln(Kurs)
    var ly = c.map(Math.log), mx = (n - 1) / 2, my = ly.reduce(function (a, b) { return a + b; }, 0) / n, sxy = 0, sxx = 0;
    for (i = 0; i < n; i++) { sxy += (i - mx) * (ly[i] - my); sxx += (i - mx) * (i - mx); }
    var b = sxy / sxx, a = my - b * mx, res = 0;
    for (i = 0; i < n; i++) res += Math.pow(ly[i] - (a + b * i), 2);
    var s = Math.sqrt(res / (n - 2));
    var low = Math.min.apply(null, c);
    var t = targets || {};
    return { c: c, n: n, px: px, sigma: sigma, a: a, b: b, s: s, support: [low, low * 1.05],
             coneLo: px * Math.exp(-sigma * Math.sqrt(FUT)), coneHi: px * Math.exp(sigma * Math.sqrt(FUT)),
             tLow: t.low || null, tMean: t.mean || null, tHigh: t.high || null, tCount: t.analystCount || null };
  }

  function mount(slot, stock, closes) {
    if (!slot) return;
    var m = compute(closes, stock.analysts && stock.analysts.targets);
    if (!m) { slot.innerHTML = ''; return; }
    var F = window.App.Format, cur = (stock.quote && stock.quote.currency) || 'EUR';
    function eur(v) { return F.currency(v, cur); }
    function pill(k, label) {
      return '<button class="pill-btn fc-toggle ' + (state[k] ? 'active' : '') + '" data-k="' + k + '">' + label + '</button>';
    }
    var sum = '';
    var SC = [['Pessimistisch', m.tLow, '#ef4444', 'niedrigstes Kursziel'], ['Basis', m.tMean, '#a78bfa', 'mittleres Kursziel'], ['Optimistisch', m.tHigh, '#22c55e', 'höchstes Kursziel']];
    SC.forEach(function (r) {
      if (!r[1]) return;
      var d = (r[1] / m.px - 1) * 100;
      sum += '<div class="chart-signal-row"><span class="chart-dot" style="background:' + r[2] + ';"></span><div class="chart-signal-text"><div class="chart-signal-value">' +
        r[0] + ' (' + r[3] + '): ' + eur(r[1]) + ' (' + (d >= 0 ? '+' : '') + F.number(d, 0) + ' %)</div></div></div>';
    });
    if (!m.tMean && !m.tLow && !m.tHigh) sum += '<div class="chart-signal-value">Keine Analysten-Kursziele vorhanden.</div>';
    else if (m.tCount) sum += '<div class="chart-signal-value" style="color:var(--text-dim);">Basis aus ' + m.tCount + ' Analysten' + (m.tCount < 5 ? ' (wenige, wenig aussagekräftig)' : '') + '</div>';
    sum += '<div class="chart-signal-value">Typische Schwankungsbreite in 12 Monaten (1σ, ca. 68 %): ' + eur(m.coneLo) + ' – ' + eur(m.coneHi) + '</div>';
    slot.innerHTML = '<div class="card"><div class="card-header-dotted"><span class="card-title">Szenario-Chart</span><span class="period-tag">12 Monate</span></div>' +
      '<div class="pill-group" style="margin-bottom:8px;">' + pill('analyst', 'Szenarien') + pill('cone', 'Schwankungsbreite') + pill('trend', 'Trendkanal') + '</div>' +
      '<div style="position:relative;width:100%;height:240px;"><canvas id="fc-canvas" style="width:100%;height:100%;"></canvas></div>' +
      '<div style="margin-top:8px;">' + sum + '</div>' +
      '<div class="chart-note">Szenario-Darstellung, keine Kursprognose. Kursziele von Analysten und statistische Bandbreiten können weit danebenliegen. Keine Anlageberatung. Die drei Szenario-Linien folgen den Kurszielen der Analysten (niedrigstes, mittleres, höchstes). Blaue Zone: 52W-Tief-Bereich als mögliche Unterstützung.</div></div>';
    var cv = slot.querySelector('#fc-canvas');
    draw(cv, m);
    [].forEach.call(slot.querySelectorAll('.fc-toggle'), function (btn) {
      btn.onclick = function () { state[btn.getAttribute('data-k')] = !state[btn.getAttribute('data-k')]; mount(slot, stock, closes); };
    });
  }

  function draw(cv, m) {
    if (!cv) return;
    var dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 320, H = cv.clientHeight || 240;
    cv.width = W * dpr; cv.height = H * dpr;
    var g = cv.getContext('2d'); g.scale(dpr, dpr);
    var css = getComputedStyle(cv);
    var txt = css.getPropertyValue('--text-main').trim() || '#e5e7eb', dim = css.getPropertyValue('--text-dim').trim() || '#94a3b8';
    var n = m.n, X = n - 1, total = n + FUT, i;
    var vals = m.c.concat([m.support[0], m.support[1]]);
    if (state.cone) vals.push(m.coneLo, m.coneHi);
    if (state.analyst) [m.tLow, m.tMean, m.tHigh].forEach(function (v) { if (v) vals.push(v); });
    if (state.trend) { vals.push(Math.exp(m.a + m.b * (n - 1 + TREND_FUT) + 1.5 * m.s), Math.exp(m.a + m.b * (n - 1 + TREND_FUT) - 1.5 * m.s)); }
    var mn = Math.min.apply(null, vals), mxv = Math.max.apply(null, vals), pad = (mxv - mn) * 0.06; mn = Math.max(0, mn - pad); mxv += pad;
    var L = 6, R = 52, T = 8, B = 22, pw = W - L - R, ph = H - T - B;
    function x(k) { return L + (k / (total - 1)) * pw; }
    function y(v) { return T + (1 - (v - mn) / (mxv - mn)) * ph; }
    g.font = '10px sans-serif'; g.textBaseline = 'middle';
    for (i = 0; i <= 4; i++) {
      var v = mn + (mxv - mn) * i / 4, yy = y(v);
      g.strokeStyle = 'rgba(148,163,184,.15)'; g.lineWidth = 1; g.beginPath(); g.moveTo(L, yy); g.lineTo(W - R, yy); g.stroke();
      g.fillStyle = dim; g.textAlign = 'left'; g.fillText(v >= 100 ? v.toFixed(0) : v.toFixed(1), W - R + 4, yy);
    }
    // Unterstützungszone
    g.fillStyle = 'rgba(59,130,246,.22)'; g.fillRect(x(0), y(m.support[1]), x(total - 1) - x(0), y(m.support[0]) - y(m.support[1]));
    // Schwankungsbreite
    if (state.cone) {
      g.fillStyle = 'rgba(148,163,184,.18)'; g.beginPath(); g.moveTo(x(X), y(m.px));
      for (i = 1; i <= FUT; i += 4) g.lineTo(x(X + i), y(m.px * Math.exp(m.sigma * Math.sqrt(i))));
      g.lineTo(x(total - 1), y(m.coneHi));
      g.lineTo(x(total - 1), y(m.coneLo));
      for (i = FUT; i >= 1; i -= 4) g.lineTo(x(X + i), y(m.px * Math.exp(-m.sigma * Math.sqrt(i))));
      g.closePath(); g.fill();
    }
    // Trendkanal
    if (state.trend) {
      [[0, '#8b5cf6'], [1.5, 'rgba(139,92,246,.6)'], [-1.5, 'rgba(139,92,246,.6)']].forEach(function (d) {
        g.strokeStyle = d[1]; g.lineWidth = 1; g.setLineDash(d[0] === 0 ? [2, 3] : []); g.beginPath();
        for (var k = 0; k <= n - 1 + TREND_FUT; k += 5) { var px_ = x(k), py_ = y(Math.exp(m.a + m.b * k + d[0] * m.s)); if (k === 0) g.moveTo(px_, py_); else g.lineTo(px_, py_); }
        g.stroke(); g.setLineDash([]);
      });
    }
    // Kursverlauf
    g.strokeStyle = txt; g.lineWidth = 1.6; g.beginPath();
    for (i = 0; i < n; i++) { if (i === 0) g.moveTo(x(i), y(m.c[i])); else g.lineTo(x(i), y(m.c[i])); }
    g.stroke();
    // Heute-Linie
    g.strokeStyle = dim; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x(X), T); g.lineTo(x(X), T + ph); g.stroke(); g.setLineDash([]);
    // Szenarien (niedriges / mittleres / hohes Analystenziel)
    if (state.analyst) {
      var ex = x(total - 1);
      [[m.tLow, '#ef4444'], [m.tMean, '#a78bfa'], [m.tHigh, '#22c55e']].forEach(function (sc) {
        if (!sc[0]) return;
        g.strokeStyle = sc[1]; g.fillStyle = sc[1]; g.lineWidth = 1.5; g.setLineDash([5, 4]);
        g.beginPath(); g.moveTo(x(X), y(m.px)); g.lineTo(ex, y(sc[0])); g.stroke(); g.setLineDash([]);
        g.beginPath(); g.arc(ex, y(sc[0]), 4, 0, 6.283); g.fill();
      });
    }
    g.fillStyle = dim; g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillText('vor 1 J.', L, H - 6);
    g.textAlign = 'center'; g.fillText('Heute', x(X), H - 6); g.textAlign = 'right'; g.fillText('in 12 Mon.', W - R, H - 6);
  }

  return { mount: mount, _compute: compute };
})();

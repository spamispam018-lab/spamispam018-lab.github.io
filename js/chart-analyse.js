/**
 * js/chart-analyse.js – erweiterte Chart-Analyse (eigenständiges Modul)
 * Chartmuster (mehrere gleichzeitig), Kerzenmuster, Divergenz, Squeeze, ADX/ATR/OBV,
 * Ausbruch mit Volumen, Support/Widerstand, Risk/Reward (Stop an Unterstützung oder ATR), Chart-Score.
 * Alles wird im Browser aus stock.chartHistory berechnet. Keine Anlageberatung.
 *
 * Einbindung:  window.App.ChartAnalyse.mount(slotElement, stock, period)
 *              window.App.ChartAnalyse.promptText(stock)   -> Text für den Gemini-Prompt
 */
window.App = window.App || {};
window.App.ChartAnalyse = (function () {
  'use strict';

  var WIN = { '1W': 63, '1M': 63, '3M': 63, '6M': 126, '1Y': 250 };
  var BIAS = { bull: '#22c55e', bear: '#ef4444', neutral: '#f59e0b' };
  var BIAS_TXT = { bull: 'bullisch', bear: 'bärisch', neutral: 'neutral' };
  
  var ui = { chart: true, candle: true, sr: false, zigzag: false, bollinger: false, capital: 10000, risk: 1, stop: 'support', target: 'resistance' };
  try { var sv = JSON.parse(localStorage.getItem('ca_ui') || 'null'); if (sv) for (var k0 in sv) ui[k0] = sv[k0]; } catch (e) { /* ignorieren */ }
  function saveUi() { try { localStorage.setItem('ca_ui', JSON.stringify(ui)); } catch (e) { /* ignorieren */ } }

  // ---------------------------------------------------------------------------
  // Glossar & Erklärungen für Fachbegriffe
  // ---------------------------------------------------------------------------
  var GLOSSARY = {
    ADX: { name: 'ADX (Average Directional Index)', text: 'Misst die Trendstärke unabhängig von der Richtung (Skala von 0 bis 100). Unter 20 gibt es keinen klaren Trend, über 25 bis 40 zeigt einen intakten Trend an, über 40 einen sehr starken Trend.' },
    ATR: { name: 'ATR (Average True Range)', text: 'Die durchschnittliche tägliche Schwankungsbreite der Aktie in Euro über die letzten 14 Tage. Hilft bei der Einschätzung des täglichen Risikos.' },
    OBV: { name: 'OBV (On-Balance Volume)', text: 'Ein Volumenindikator, der das Handelsvolumen an Aufwärts- und Abwärtstagen kumuliert. Steigendes OBV zeigt an, dass Geld in den Markt fließt; wenn es dem Kurs widerspricht, deutet das auf eine Divergenz hin.' },
    Bollinger: { name: 'Bollinger-Bänder', text: 'Ein Volatilitätsindikator. Ein "Squeeze" (sehr enge Bänder) signalisiert eine Phase geringer Volatilität, auf die oft eine stärkere Kursbewegung folgt. Berührt der Kurs das obere/untere Band, gilt er oft als überkauft/überverkauft.' },
    Support: { name: 'Unterstützung & Widerstand', text: 'Unterstützung ist ein Kursbereich, an dem der Kurs in der Vergangenheit oft nach oben gedreht hat. Widerstand ist eine Marke, an der der Kurs oft nach unten abgeprallt ist.' },
    CRV: { name: 'Chance-Risiko-Verhältnis (CRV)', text: 'Das Verhältnis zwischen dem möglichen Gewinn (Ziel minus Einstieg) und dem möglichen Verlust (Einstieg minus Stop). Werte ab 2:1 gelten als erstrebenswert.' },
    Score: { name: 'Chart-Score', text: 'Ein Gesamtwert von 0 bis 100 (50 = neutral), der fünf verschiedene technische Bereiche (Trend, Momentum, Muster, Signale und S/R-Lage) bündelt.' },
    Chartmuster: { name: 'Chartmuster', text: 'Automatische Erkennung klassischer Formationen wie Schulter-Kopf-Schulter, Dreiecken oder Doppel-Tops/Bodens.' },
    Kerzenmuster: { name: 'Kerzenmuster', text: 'Erkennung von kurzfristigen Umkehrsignalen (1-3 Tage) wie Hammer oder Engulfing auf Basis der Kerzenkörper.' },
    ZigZag: { name: 'Wendepunkte (ZigZag)', text: 'Verbindet markante Hoch- und Tiefpunkte im Chart und filtert kleinere Schwankungen (Rauschen) heraus, um den Haupttrend sichtbar zu machen.' }
  };

  var TERM_RULES = [
    [/^ADX/, 'ADX'],
    [/^ATR/, 'ATR'],
    [/^OBV/, 'OBV'],
    [/Bollinger/, 'Bollinger'],
    [/Unterstützung|Widerstand/, 'Support'],
    [/Chance-Risiko-Verhältnis|CRV/, 'CRV'],
    [/Chart-Score/, 'Score'],
    [/Chartmuster/, 'Chartmuster'],
    [/Kerzenmuster/, 'Kerzenmuster'],
    [/Wendepunkte|ZigZag/, 'ZigZag']
  ];

  function termKeyFor(label) {
    for (var i = 0; i < TERM_RULES.length; i++) {
      if (TERM_RULES[i][0].test(label)) return TERM_RULES[i][1];
    }
    return null;
  }

  function termLink(label) {
    var key = termKeyFor(label);
    if (!key || !GLOSSARY[key]) return label;
    return '<span class="term-link" data-term="' + key + '" style="cursor: pointer; border-bottom: 1px dotted var(--text-dim);">' +
      label + ' <span style="font-size: 0.7em; opacity: 0.6;">ⓘ</span></span>';
  }

  function bindTerms(container) {
    if (container.__termBound) return;
    container.__termBound = true;
    container.addEventListener('click', function (ev) {
      var link = ev.target && ev.target.closest ? ev.target.closest('.term-link') : null;
      if (!link) return;
      var key = link.getAttribute('data-term');
      var card = link.closest('.card');
      if (!card || !GLOSSARY[key]) return;
      var box = container.querySelector('#ca-term-info');
      if (box && box.getAttribute('data-term') === key && box.previousElementSibling === card) {
        box.parentNode.removeChild(box);
        return;
      }
      if (!box) {
        box = document.createElement('div');
        box.id = 'ca-term-info';
      }
      box.setAttribute('data-term', key);
      box.setAttribute('style', 'margin: -6px 0 16px; padding: 12px 14px; border-radius: var(--radius-sm); background-color: var(--bg-secondary); border: 1px solid var(--border-subtle); font-size: 0.8rem; color: var(--text-main); line-height: 1.45;');
      box.innerHTML = '<div style="font-weight: 700; margin-bottom: 4px; color: var(--accent-purple-light);">' + GLOSSARY[key].name + '</div>' + GLOSSARY[key].text;
      card.parentNode.insertBefore(box, card.nextSibling);
    });
  }

  // ---------------------------------------------------------------------------
  // Basis-Rechnungen
  // ---------------------------------------------------------------------------
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }
  function maxOf(a) { return Math.max.apply(null, a); }
  function minOf(a) { return Math.min.apply(null, a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function prep(hist) {
    var d = hist.filter(function (p) { return p && p.close > 0; });
    var T = { date: [], c: [], o: [], h: [], l: [], v: [], ohlc: false };
    d.forEach(function (p, i) {
      var prev = i ? d[i - 1].close : p.close;
      var o = p.open > 0 ? p.open : prev;
      var h = p.high > 0 ? p.high : Math.max(o, p.close);
      var l = p.low > 0 ? p.low : Math.min(o, p.close);
      if (p.open > 0 && p.high > 0 && p.low > 0) T.ohlc = true;
      T.date.push(p.date); T.c.push(p.close); T.o.push(o); T.h.push(Math.max(h, o, p.close)); T.l.push(Math.min(l, o, p.close)); T.v.push(p.volume || 0);
    });
    return T;
  }

  function ema(values, n) {
    var out = [], k = 2 / (n + 1), prev = null, buf = [];
    values.forEach(function (v) {
      if (v === null || v === undefined) { out.push(null); return; }
      if (prev === null) { buf.push(v); if (buf.length === n) { prev = avg(buf); out.push(prev); } else out.push(null); }
      else { prev = v * k + prev * (1 - k); out.push(prev); }
    });
    return out;
  }

  function rsiArr(c, n) {
    var out = [null], ag = 0, al = 0;
    for (var i = 1; i < c.length; i++) {
      var d = c[i] - c[i - 1], g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
      if (i <= n) { ag += g / n; al += l / n; if (i < n) { out.push(null); continue; } }
      else { ag = (ag * (n - 1) + g) / n; al = (al * (n - 1) + l) / n; }
      out.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
    }
    return out;
  }

  function atrArr(h, l, c, len) {
    var out = [], prev = null, sum = 0;
    for (var i = 0; i < c.length; i++) {
      var tr = i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
      if (i < len - 1) { sum += tr; out.push(null); }
      else if (i === len - 1) { sum += tr; prev = sum / len; out.push(prev); }
      else { prev = (prev * (len - 1) + tr) / len; out.push(prev); }
    }
    return out;
  }

  function adxLast(h, l, c, len) {
    var n = c.length, tr = [], pdm = [], mdm = [], i;
    if (n < len * 2 + 2) return null;
    for (i = 1; i < n; i++) {
      var up = h[i] - h[i - 1], dn = l[i - 1] - l[i];
      pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0);
      tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
    }
    var sT = 0, sP = 0, sM = 0, dxs = [];
    for (i = 0; i < len; i++) { sT += tr[i]; sP += pdm[i]; sM += mdm[i]; }
    function push() { var p = 100 * sP / sT, m = 100 * sM / sT; dxs.push({ dx: p + m === 0 ? 0 : 100 * Math.abs(p - m) / (p + m), p: p, m: m }); }
    push();
    for (i = len; i < tr.length; i++) { sT = sT - sT / len + tr[i]; sP = sP - sP / len + pdm[i]; sM = sM - sM / len + mdm[i]; push(); }
    if (dxs.length < len) return null;
    var a = 0;
    for (i = 0; i < len; i++) a += dxs[i].dx;
    a /= len;
    for (i = len; i < dxs.length; i++) a = (a * (len - 1) + dxs[i].dx) / len;
    var last = dxs[dxs.length - 1];
    return { adx: a, pdi: last.p, mdi: last.m };
  }

  function lineFit(pts) {
    var n = pts.length, mx = avg(pts.map(function (p) { return p[0]; })), my = avg(pts.map(function (p) { return p[1]; })), sxy = 0, sxx = 0;
    pts.forEach(function (p) { sxy += (p[0] - mx) * (p[1] - my); sxx += (p[0] - mx) * (p[0] - mx); });
    var b = sxx ? sxy / sxx : 0;
    return { a: my - b * mx, b: b, n: n };
  }

  // ---------------------------------------------------------------------------
  // Wendepunkte (Zigzag)
  // ---------------------------------------------------------------------------
  function zigzag(h, l, th) {
    var n = h.length, piv = [], dir = 0, hiI = 0, loI = 0, ext = 0, i, j;
    for (i = 1; i < n; i++) {
      if (dir === 0) {
        if (h[i] > h[hiI]) hiI = i;
        if (l[i] < l[loI]) loI = i;
        if (h[i] >= l[loI] * (1 + th)) { piv.push({ i: loI, p: l[loI], t: 'L' }); dir = 1; ext = i; for (j = loI; j <= i; j++) if (h[j] > h[ext]) ext = j; }
        else if (l[i] <= h[hiI] * (1 - th)) { piv.push({ i: hiI, p: h[hiI], t: 'H' }); dir = -1; ext = i; for (j = hiI; j <= i; j++) if (l[j] < l[ext]) ext = j; }
      } else if (dir === 1) {
        if (h[i] > h[ext]) ext = i;
        else if (l[i] <= h[ext] * (1 - th)) { piv.push({ i: ext, p: h[ext], t: 'H' }); dir = -1; ext = i; }
      } else {
        if (l[i] < l[ext]) ext = i;
        else if (h[i] >= l[ext] * (1 + th)) { piv.push({ i: ext, p: l[ext], t: 'L' }); dir = 1; ext = i; }
      }
    }
    if (dir !== 0) piv.push({ i: ext, p: dir === 1 ? h[ext] : l[ext], t: dir === 1 ? 'H' : 'L', open: true });
    return piv;
  }

  // ---------------------------------------------------------------------------
  // Chartmuster
  // ---------------------------------------------------------------------------
  function twoPivotPatterns(V, px, N, out) {
    var len = V.length, k, a, b, c;
    for (k = 0; k + 2 < len; k++) {
      if (len - 1 - (k + 2) > 1) continue;
      a = V[k]; b = V[k + 1]; c = V[k + 2];
      if (c.open || c.i < N - 45 || c.i - a.i < 10) continue;
      if (a.t === 'H' && b.t === 'L' && c.t === 'H') {
        var top = Math.min(a.p, c.p);
        if (Math.abs(a.p - c.p) / a.p <= 0.03 && (top - b.p) / top >= 0.05 && px <= Math.max(a.p, c.p) * 1.03) {
          var conf = px < b.p * 0.995;
          out.push({ kind: 'chart', name: 'Doppel-Top', bias: 'bear', status: conf ? 'bestätigt' : 'in Bildung', level: b.p, levelName: 'Nackenlinie',
            target: b.p - (avg([a.p, c.p]) - b.p), score: conf ? 10 : 6, from: a.i, to: c.i,
            lines: [[a.i, b.p, N - 1, b.p, 1]], pts: [[a.i, a.p], [b.i, b.p], [c.i, c.p]] });
        }
      }
      if (a.t === 'L' && b.t === 'H' && c.t === 'L') {
        var bot = Math.max(a.p, c.p);
        if (Math.abs(a.p - c.p) / a.p <= 0.03 && (b.p - bot) / b.p >= 0.05 && px >= Math.min(a.p, c.p) * 0.97) {
          var conf2 = px > b.p * 1.005;
          out.push({ kind: 'chart', name: 'Doppel-Boden', bias: 'bull', status: conf2 ? 'bestätigt' : 'in Bildung', level: b.p, levelName: 'Nackenlinie',
            target: b.p + (b.p - avg([a.p, c.p])), score: conf2 ? 10 : 6, from: a.i, to: c.i,
            lines: [[a.i, b.p, N - 1, b.p, 1]], pts: [[a.i, a.p], [b.i, b.p], [c.i, c.p]] });
        }
      }
    }
  }

  function headShoulders(V, px, N, out) {
    var len = V.length, k, p;
    for (k = 0; k + 4 < len; k++) {
      if (len - 1 - (k + 4) > 1) continue;
      p = V.slice(k, k + 5);
      if (p[4].open || p[4].i < N - 50 || p[4].i - p[0].i < 20) continue;
      if (p[0].t === 'H' && p[1].t === 'L' && p[2].t === 'H') {
        var sh = avg([p[0].p, p[4].p]), neck = avg([p[1].p, p[3].p]);
        if (p[2].p >= sh * 1.03 && Math.abs(p[0].p - p[4].p) / sh <= 0.08 && Math.abs(p[1].p - p[3].p) / neck <= 0.05 && px <= p[4].p * 1.03) {
          var cf = px < neck * 0.995;
          out.push({ kind: 'chart', name: 'Schulter-Kopf-Schulter', bias: 'bear', status: cf ? 'bestätigt' : 'in Bildung', level: neck, levelName: 'Nackenlinie',
            target: neck - (p[2].p - neck), score: cf ? 12 : 7, from: p[0].i, to: p[4].i,
            lines: [[p[1].i, neck, N - 1, neck, 1]], pts: p.map(function (q) { return [q.i, q.p]; }) });
        }
      }
      if (p[0].t === 'L' && p[1].t === 'H' && p[2].t === 'L') {
        var sh2 = avg([p[0].p, p[4].p]), neck2 = avg([p[1].p, p[3].p]);
        if (p[2].p <= sh2 * 0.97 && Math.abs(p[0].p - p[4].p) / sh2 <= 0.08 && Math.abs(p[1].p - p[3].p) / neck2 <= 0.05 && px >= p[4].p * 0.97) {
          var cf2 = px > neck2 * 1.005;
          out.push({ kind: 'chart', name: 'Umgekehrte Schulter-Kopf-Schulter', bias: 'bull', status: cf2 ? 'bestätigt' : 'in Bildung', level: neck2, levelName: 'Nackenlinie',
            target: neck2 + (neck2 - p[2].p), score: cf2 ? 12 : 7, from: p[0].i, to: p[4].i,
            lines: [[p[1].i, neck2, N - 1, neck2, 1]], pts: p.map(function (q) { return [q.i, q.p]; }) });
        }
      }
    }
  }

  function trendPatterns(Vw, px, N, out) {
    var H = Vw.filter(function (p) { return p.t === 'H'; }).slice(-3), L = Vw.filter(function (p) { return p.t === 'L'; }).slice(-3);
    if (H.length < 2 || L.length < 2) return;
    var i0 = Math.min(H[0].i, L[0].i), last = Math.max(H[H.length - 1].i, L[L.length - 1].i);
    if (N - 1 - i0 < 20 || last < N - 30) return;
    var fh = lineFit(H.map(function (p) { return [p.i, p.p]; })), fl = lineFit(L.map(function (p) { return [p.i, p.p]; }));
    var ok = true;
    H.forEach(function (p) { if (Math.abs(p.p - (fh.a + fh.b * p.i)) / p.p > 0.025) ok = false; });
    L.forEach(function (p) { if (Math.abs(p.p - (fl.a + fl.b * p.i)) / p.p > 0.025) ok = false; });
    if (!ok) return;
    function hAt(i) { return fh.a + fh.b * i; }
    function lAt(i) { return fl.a + fl.b * i; }
    var g0 = hAt(i0) - lAt(i0), g1 = hAt(N - 1) - lAt(N - 1);
    if (g0 <= 0 || g1 <= 0) return;
    var conv = g1 / g0, sH = fh.b / px, sL = fl.b / px, flat = 0.0006, sig = 0.0010, name = null, bias = 'neutral', note = '';
    if (conv < 0.8) {
      if (Math.abs(sH) <= flat && sL >= sig) { name = 'Aufsteigendes Dreieck'; bias = 'bull'; }
      else if (Math.abs(sL) <= flat && sH <= -sig) { name = 'Absteigendes Dreieck'; bias = 'bear'; }
      else if (sH < -flat && sL > flat) { name = 'Symmetrisches Dreieck'; }
      else if (sH > flat && sL > flat) { name = 'Steigender Keil (Rising Wedge)'; bias = 'bear'; }
      else if (sH < -flat && sL < -flat) { name = 'Fallender Keil (Falling Wedge)'; bias = 'bull'; }
    } else if (conv <= 1.25) {
      if (sH > sig && sL > sig) name = 'Aufwärtskanal';
      else if (sH < -sig && sL < -sig) name = 'Abwärtskanal';
      else if (Math.abs(sH) < flat && Math.abs(sL) < flat) name = 'Seitwärtsrange';
    }
    if (!name) return;
    var up = px > hAt(N - 1) * 1.005, dn = px < lAt(N - 1) * 0.995, status = 'in Bildung', target = null, sc = 5, isChan = /kanal|range/i.test(name);
    if (isChan) { status = up ? 'Ausbruch nach oben' : dn ? 'Ausbruch nach unten' : 'intakt'; sc = up || dn ? 6 : 3; if (up) bias = 'bull'; if (dn) bias = 'bear'; }
    else if (up) { status = 'Ausbruch nach oben'; target = hAt(N - 1) + g0; bias = 'bull'; sc = 9; }
    else if (dn) { status = 'Ausbruch nach unten'; target = lAt(N - 1) - g0; bias = 'bear'; sc = 9; }
    if (bias === 'neutral') sc = 0;
    out.push({ kind: 'chart', name: name, bias: bias, status: status, level: null, target: target, score: sc, from: i0, to: N - 1,
      lines: [[i0, hAt(i0), N - 1, hAt(N - 1), 0], [i0, lAt(i0), N - 1, lAt(N - 1), 0]], pts: H.concat(L).map(function (p) { return [p.i, p.p]; }),
      note: note });
  }

  function flagPatterns(c, N, out) {
    var look = Math.min(N, 45), s = N - look, j, j1, j0, px = c[N - 1];
    j1 = s; for (j = s; j <= N - 6; j++) if (c[j] >= c[j1]) j1 = j;
    j0 = Math.max(s, j1 - 15); for (j = j0; j <= j1; j++) if (c[j] <= c[j0]) j0 = j;
    var pole = c[j1] / c[j0] - 1;
    if (pole >= 0.12 && N - 1 - j1 >= 5 && N - 1 - j1 <= 25) {
      var low = minOf(c.slice(j1)), retr = (c[j1] - low) / (c[j1] - c[j0]);
      if (retr <= 0.5 && px >= c[j0] + 0.5 * (c[j1] - c[j0]) && px <= c[j1] * 1.05) {
        var br = px > c[j1];
        out.push({ kind: 'chart', name: 'Bullische Flagge', bias: 'bull', status: br ? 'Ausbruch nach oben' : 'in Bildung', level: c[j1], levelName: 'Flaggenhoch',
          target: c[j1] + (c[j1] - c[j0]), score: br ? 9 : 6, from: j0, to: N - 1, lines: [[j0, c[j0], j1, c[j1], 0], [j1, c[j1], N - 1, c[N - 1], 1]], pts: [[j0, c[j0]], [j1, c[j1]]] });
      }
    }
    j1 = s; for (j = s; j <= N - 6; j++) if (c[j] <= c[j1]) j1 = j;
    j0 = Math.max(s, j1 - 15); for (j = j0; j <= j1; j++) if (c[j] >= c[j0]) j0 = j;
    var drop = 1 - c[j1] / c[j0];
    if (drop >= 0.12 && N - 1 - j1 >= 5 && N - 1 - j1 <= 25) {
      var high = maxOf(c.slice(j1)), retr2 = (high - c[j1]) / (c[j0] - c[j1]);
      if (retr2 <= 0.5 && px <= c[j0] - 0.5 * (c[j0] - c[j1]) && px >= c[j1] * 0.95) {
        var br2 = px < c[j1];
        out.push({ kind: 'chart', name: 'Bärische Flagge', bias: 'bear', status: br2 ? 'Ausbruch nach unten' : 'in Bildung', level: c[j1], levelName: 'Flaggentief',
          target: c[j1] - (c[j0] - c[j1]), score: br2 ? 9 : 6, from: j0, to: N - 1, lines: [[j0, c[j0], j1, c[j1], 0], [j1, c[j1], N - 1, c[N - 1], 1]], pts: [[j0, c[j0]], [j1, c[j1]]] });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Kerzenmuster (letzte 10 Handelstage)
  // ---------------------------------------------------------------------------
  function candlePatterns(T, off, N, out) {
    if (!T.ohlc) return;
    var n = T.c.length, i, o = T.o, h = T.h, l = T.l, c = T.c;
    function body(idx) { return Math.abs(c[idx] - o[idx]); }
    function rng(idx) { return h[idx] - l[idx]; }
    function upSh(idx) { return h[idx] - Math.max(o[idx], c[idx]); }
    function loSh(idx) { return Math.min(o[idx], c[idx]) - l[idx]; }
    function ch(idx, k) { return idx - k >= 0 ? c[idx - 1] / c[idx - k] - 1 : 0; }
    function down(idx) { return ch(idx, 6) <= -0.03 || ch(idx, 11) <= -0.06; }
    function upT(idx) { return ch(idx, 6) >= 0.03 || ch(idx, 11) >= 0.06; }
    for (i = Math.max(6, n - 10); i < n; i++) {
      var r = rng(i), b = body(i), name = null, bias = 'neutral';
      if (r <= 0) continue;
      if (i >= 2 && c[i - 2] < o[i - 2] && body(i - 2) >= 0.5 * rng(i - 2) && body(i - 1) <= 0.4 * body(i - 2) && c[i] > o[i] && c[i] > (o[i - 2] + c[i - 2]) / 2 && down(i - 1)) { name = 'Morning Star'; bias = 'bull'; }
      else if (i >= 2 && c[i - 2] > o[i - 2] && body(i - 2) >= 0.5 * rng(i - 2) && body(i - 1) <= 0.4 * body(i - 2) && c[i] < o[i] && c[i] < (o[i - 2] + c[i - 2]) / 2 && upT(i - 1)) { name = 'Evening Star'; bias = 'bear'; }
      else if (c[i - 1] < o[i - 1] && c[i] > o[i] && o[i] <= c[i - 1] && c[i] >= o[i - 1] && b > body(i - 1) && down(i)) { name = 'Bullisches Engulfing'; bias = 'bull'; }
      else if (c[i - 1] > o[i - 1] && c[i] < o[i] && o[i] >= c[i - 1] && c[i] <= o[i - 1] && b > body(i - 1) && upT(i)) { name = 'Bärisches Engulfing'; bias = 'bear'; }
      else if (loSh(i) >= 0.6 * r && upSh(i) <= 0.25 * r && b <= 0.35 * r && down(i)) { name = 'Hammer'; bias = 'bull'; }
      else if (upSh(i) >= 0.6 * r && loSh(i) <= 0.25 * r && b <= 0.35 * r && upT(i)) { name = 'Shooting Star'; bias = 'bear'; }
      else if (n - 1 - i <= 2 && r / c[i] >= 0.008 && b <= 0.1 * r) { name = 'Doji'; }
      if (name) out.push({ kind: 'candle', name: name, bias: bias, i: i - off, date: T.date[i], score: n - 1 - i <= 2 && bias !== 'neutral' ? 3 : 0 });
    }
  }

  // ---------------------------------------------------------------------------
  // Support/Widerstand aus Wendepunkten
  // ---------------------------------------------------------------------------
  function levels(P, px) {
    var prices = P.map(function (p) { return p.p; }).sort(function (a, b) { return a - b; }), cl = [], cur = null;
    prices.forEach(function (v) {
      if (cur && v <= cur.max * 1.015) { cur.vals.push(v); cur.max = v; } else { cur = { vals: [v], max: v }; cl.push(cur); }
    });
    var lv = cl.filter(function (c) { return c.vals.length >= 2; }).map(function (c) { return { p: avg(c.vals), n: c.vals.length }; });
    var sup = lv.filter(function (x) { return x.p < px * 0.995; }).sort(function (a, b) { return b.p - a.p; })[0] || null;
    var res = lv.filter(function (x) { return x.p > px * 1.005; }).sort(function (a, b) { return a.p - b.p; })[0] || null;
    return { sup: sup, res: res, all: lv };
  }

  // ---------------------------------------------------------------------------
  // Gesamtanalyse
  // ---------------------------------------------------------------------------
  function analyse(stock, period) {
    var T = prep(stock.chartHistory || []), n = T.c.length;
    if (n < 80) return null;
    var N = Math.min(250, n), off = n - N, px = T.c[n - 1];
    var w = Math.min(WIN[period] || 126, N), from = N - w;
    var c = T.c.slice(off), h = T.h.slice(off), l = T.l.slice(off);
    var atr = atrArr(T.h, T.l, T.c, 14), atrV = atr[n - 1] || px * 0.02;
    var th = clamp(2.2 * atrV / px, 0.035, 0.12);
    var P = zigzag(h, l, th), Vw = P.filter(function (p) { return p.i >= from; });
    var pats = [];
    twoPivotPatterns(Vw, px, N, pats); headShoulders(Vw, px, N, pats); trendPatterns(Vw, px, N, pats);
    if (from <= N - 12) flagPatterns(c, N, pats);
    candlePatterns(T, off, N, pats);

    var rsi = rsiArr(T.c, 14), r0 = rsi[n - 1];
    var e12 = ema(T.c, 12), e26 = ema(T.c, 26), line = e12.map(function (v, i) { return v !== null && e26[i] !== null ? v - e26[i] : null; }), sigl = ema(line, 9);
    var macdBull = line[n - 1] !== null && sigl[n - 1] !== null && line[n - 1] > sigl[n - 1];
    var s50 = n >= 50 ? avg(T.c.slice(-50)) : null, s200 = n >= 200 ? avg(T.c.slice(-200)) : null;
    var adx = adxLast(T.h, T.l, T.c, 14);

    var obv = [0], i;
    for (i = 1; i < n; i++) obv.push(obv[i - 1] + (T.c[i] > T.c[i - 1] ? T.v[i] : T.c[i] < T.c[i - 1] ? -T.v[i] : 0));
    var hasVol = T.v.slice(-20).some(function (v) { return v > 0; });
    var obvTrend = hasVol ? Math.sign(obv[n - 1] - obv[n - 21]) : 0, pTrend = Math.sign(px - T.c[n - 21]);

    var bw = [], pb = null, bb = [];
    for (i = 19; i < n; i++) {
      var sl = T.c.slice(i - 19, i + 1), m = avg(sl), sd = Math.sqrt(avg(sl.map(function (x) { return (x - m) * (x - m); })));
      bw.push((4 * sd) / m);
      bb.push({ i: i - off, m: m, u: m + 2 * sd, d: m - 2 * sd }); // KORREKTUR: i - off
      if (i === n - 1) pb = sd > 0 ? (px - (m - 2 * sd)) / (4 * sd) : 0.5;
    }
    var bwLast = bw[bw.length - 1], bwWin = bw.slice(-120), rank = bwWin.filter(function (x) { return x <= bwLast; }).length / bwWin.length;

    var div = null, Ls = P.filter(function (p) { return p.t === 'L'; }).slice(-2), Hs = P.filter(function (p) { return p.t === 'H'; }).slice(-2);
    if (Ls.length === 2 && Ls[1].i >= N - 25 && Ls[1].i - Ls[0].i >= 5) {
      var ra = rsi[off + Ls[0].i], rb = rsi[off + Ls[1].i];
      if (ra !== null && rb !== null && Ls[1].p < Ls[0].p * 0.995 && rb > ra + 2) div = { type: 'bull', text: 'Bullische RSI-Divergenz: neues Tief im Kurs, aber höheres Tief im RSI' };
    }
    if (!div && Hs.length === 2 && Hs[1].i >= N - 25 && Hs[1].i - Hs[0].i >= 5) {
      var rc = rsi[off + Hs[0].i], rd = rsi[off + Hs[1].i];
      if (rc !== null && rd !== null && Hs[1].p > Hs[0].p * 1.005 && rd < rc - 2) div = { type: 'bear', text: 'Bärische RSI-Divergenz: neues Hoch im Kurs, aber tieferes Hoch im RSI' };
    }

    var brk = null;
    if (hasVol && n > 25) {
      var av = avg(T.v.slice(-21, -1)), vr = av > 0 ? T.v[n - 1] / av : 0, hi20 = maxOf(T.c.slice(-21, -1)), lo20 = minOf(T.c.slice(-21, -1));
      if (px > hi20) brk = { type: 'bull', text: 'Ausbruch über das 20-Tage-Hoch ' + (vr >= 1.5 ? 'mit Volumen (' + vr.toFixed(1).replace('.', ',') + '× Schnitt)' : 'ohne Volumenbestätigung'), strong: vr >= 1.5 };
      else if (px < lo20) brk = { type: 'bear', text: 'Bruch des 20-Tage-Tiefs ' + (vr >= 1.5 ? 'mit Volumen (' + vr.toFixed(1).replace('.', ',') + '× Schnitt)' : 'ohne Volumenbestätigung'), strong: vr >= 1.5 };
    }

    var lv = levels(P, px);

    var parts = [], tTrend = 0, tMom = 0, tPat = 0, tSig = 0, tPos = 0;
    if (s200) tTrend += px > s200 ? 10 : -10;
    if (s50) tTrend += px > s50 ? 10 : -10;
    if (s50 && s200) tTrend += s50 > s200 ? 10 : -10;
    if (r0 !== null) tMom += r0 >= 50 ? 5 : -5;
    tMom += macdBull ? 8 : -8;
    if (hasVol) tMom += obvTrend > 0 ? 6 : obvTrend < 0 ? -6 : 0;
    pats.forEach(function (p) { tPat += (p.bias === 'bull' ? 1 : p.bias === 'bear' ? -1 : 0) * (p.score || 0); });
    tPat = clamp(tPat, -20, 20);
    if (div) tSig += div.type === 'bull' ? 8 : -8;
    if (brk) tSig += (brk.type === 'bull' ? 1 : -1) * (brk.strong ? 8 : 3);
    tSig = clamp(tSig, -15, 15);
    if (lv.sup && lv.res) {
      var ratio = (lv.res.p / px - 1) / (px / lv.sup.p - 1);
      tPos = ratio >= 2 ? 15 : ratio >= 1.5 ? 8 : ratio <= 0.4 ? -15 : ratio <= 0.7 ? -8 : 0;
    }
    parts = [
      ['Trend (SMA 50/200)', tTrend, 30], 
      ['Momentum (RSI, MACD, OBV)', tMom, 20], 
      ['Muster', tPat, 20], 
      ['Signale (Divergenz, Ausbruch)', tSig, 15], 
      ['Lage zu Support/Widerstand', tPos, 15]
    ];
    var total = parts.reduce(function (a, p) { return a + p[1]; }, 0), score = Math.round(clamp(50 + total / 2, 0, 100));

    return { T: T, n: n, N: N, off: off, from: from, w: w, px: px, c: c, h: h, l: l, atr: atrV, th: th, pivots: P, pats: pats, rsi: r0, macdBull: macdBull, s50: s50, s200: s200,
      adx: adx, hasVol: hasVol, obvTrend: obvTrend, pTrend: pTrend, bw: bwLast, bb: bb, squeeze: rank <= 0.2, pctB: pb, div: div, brk: brk, lv: lv, parts: parts, score: score,
      label: score >= 65 ? 'bull' : score <= 35 ? 'bear' : 'neutral' };
  }

  // ---------------------------------------------------------------------------
  // Darstellung
  // ---------------------------------------------------------------------------
  function F() { return window.App.Format; }
  function eur(v, cur) { return F().currency(v, cur); }
  function num(v, d) { return F().number(v, d === undefined ? 1 : d); }
  function deDate(iso) { return iso && iso.length >= 10 ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' : ''; }
  function row(color, text, sub) {
    return '<div class="chart-signal-row"><span class="chart-dot" style="background:' + color + ';"></span><div class="chart-signal-text"><div class="chart-signal-value">' + text + '</div>' +
      (sub ? '<div style="font-size:.72rem;color:var(--text-dim);">' + sub + '</div>' : '') + '</div></div>';
  }
  function pill(k, label, on) { return '<button class="pill-btn ca-btn ' + (on ? 'active' : '') + '" data-k="' + k + '">' + label + '</button>'; }
  function card(title, tag, body) {
    return '<div class="card"><div class="card-header-dotted"><span class="card-title">' + title + '</span>' + (tag || '') + '</div>' + body + '</div>';
  }
  
  function chip(k, label, on, termKey) {
    var icon = termKey ? ' <span class="term-link" data-term="' + termKey + '" style="margin-left: 4px; opacity: 0.7;">ⓘ</span>' : '';
    return '<button class="chip-btn ca-btn ' + (on ? 'active' : '') + '" data-k="' + k + '">' + label + icon + '</button>';
  }

  var NOTE = '<div class="chart-note">Regelbasierte Erkennung auf vergangenen Kursen, keine Anlageberatung. Muster können sich auflösen oder fehlschlagen.</div>';

  function scoreCard(A) {
    var V = { bull: ['Bullisch', 'badge-bullish'], bear: ['Bärisch', 'badge-bearish'], neutral: ['Neutral', 'badge-neutral'] }[A.label];
    var rows = A.parts.map(function (p) { 
      var titleText = termLink(p[0].split(' ')[0]); 
      return row(p[1] > 0 ? 'var(--bullish)' : p[1] < 0 ? 'var(--bearish)' : 'var(--text-dim)', titleText + ': ' + (p[1] > 0 ? '+' : '') + p[1] + ' von ±' + p[2]); 
    }).join('');
    return card(termLink('Chart-Score'), '<span class="badge-pill ' + V[1] + '">' + V[0] + ' · ' + A.score + ' / 100</span>',
      '<div class="chart-signal-list">' + rows + '</div><div class="chart-note">Gesamtwert aus fünf Teilen (50 = neutral). Er fasst Chartsignale zusammen und ist keine Prognose.</div>');
  }

  function patternsCard(A, cur) {
    var chartP = A.pats.filter(function (p) { return p.kind === 'chart'; }), candP = A.pats.filter(function (p) { return p.kind === 'candle'; });
    var rows = '';
    chartP.forEach(function (p) {
      var sub = p.status + (p.level ? ' · ' + p.levelName + ' ' + eur(p.level, cur) : '') + (p.target ? ' · Kursziel ≈ ' + eur(p.target, cur) + ' (' + (p.target >= A.px ? '+' : '') + num((p.target / A.px - 1) * 100, 0) + ' %)' : '');
      rows += row(BIAS[p.bias], '<b>' + p.name + '</b> (' + BIAS_TXT[p.bias] + ')', sub);
    });
    candP.forEach(function (p) { rows += row(BIAS[p.bias], '<b>' + p.name + '</b> (' + BIAS_TXT[p.bias] + ')', 'Kerze vom ' + deDate(p.date)); });
    if (!rows) rows = '<div class="chart-signal-value" style="color:var(--text-dim);">Im gewählten Zeitraum wurde kein Muster erkannt' + (A.T.ohlc ? '' : ' (Kerzenmuster brauchen Open/High/Low-Daten)') + '.</div>';
    
    var toolbar = '<div class="horizontal-scroll-row" id="ca-tools-toolbar" style="margin-top: 8px; margin-bottom: 8px; padding-bottom: 4px;">' +
      chip('chart', 'Chartmuster', ui.chart, 'Chartmuster') +
      chip('candle', 'Kerzenmuster', ui.candle, 'Kerzenmuster') +
      chip('sr', 'Support/Res', ui.sr, 'Support') +
      chip('zigzag', 'Wendepunkte', ui.zigzag, 'ZigZag') +
      chip('bollinger', 'Bollinger', ui.bollinger, 'Bollinger') +
    '</div>';

    return card('Muster & Chart Tools', '<span class="period-tag">' + chartP.length + ' Chart · ' + candP.length + ' Kerzen</span>',
      toolbar +
      '<div style="position:relative;width:100%;height:240px;"><canvas id="ca-canvas" style="width:100%;height:100%;"></canvas></div>' +
      '<div style="margin-top:8px;" class="chart-signal-list">' + rows + '</div>' + NOTE);
  }

  function signalsCard(A, cur) {
    var r = '';
    if (A.adx) {
      var s = A.adx.adx, dir = A.adx.pdi > A.adx.mdi ? 'aufwärts' : 'abwärts';
      r += row(s >= 25 ? (A.adx.pdi > A.adx.mdi ? 'var(--bullish)' : 'var(--bearish)') : '#f59e0b', termLink('ADX') + ' ' + num(s, 0) + (s < 20 ? ' – kein klarer Trend' : s < 40 ? ' – intakter Trend ' + dir : ' – sehr starker Trend ' + dir), 'Trendstärke, nicht Richtung. +DI ' + num(A.adx.pdi, 0) + ' / −DI ' + num(A.adx.mdi, 0));
    }
    r += row('var(--text-dim)', termLink('ATR') + ' ' + eur(A.atr, cur) + ' (' + num(A.atr / A.px * 100, 1) + ' % vom Kurs)', 'typische tägliche Schwankung');
    if (A.hasVol) r += row(A.obvTrend > 0 ? 'var(--bullish)' : A.obvTrend < 0 ? 'var(--bearish)' : 'var(--text-dim)', termLink('OBV') + ' ' + (A.obvTrend > 0 ? 'steigt' : A.obvTrend < 0 ? 'fällt' : 'seitwärts') +
      (A.obvTrend && A.pTrend && A.obvTrend !== A.pTrend ? ' – widerspricht dem Kurs (Divergenz)' : A.obvTrend ? ' – bestätigt den Kurs' : ''), 'Volumenfluss, letzte 20 Tage');
    r += row(A.squeeze ? '#f59e0b' : 'var(--text-dim)', termLink('Bollinger') + ': ' + (A.squeeze ? 'Squeeze – Bänder sehr eng' : 'Bänder normal') + ' (%B ' + num(A.pctB * 100, 0) + ' %)', A.squeeze ? 'Oft folgt eine größere Bewegung, die Richtung ist offen.' : 'Bandbreite nicht ungewöhnlich eng');
    if (A.div) r += row(BIAS[A.div.type], A.div.text);
    if (A.brk) r += row(BIAS[A.brk.type], A.brk.text);
    r += row('var(--text-dim)', 'Nächste ' + termLink('Support') + ': ' + (A.lv.sup ? eur(A.lv.sup.p, cur) + ' (' + A.lv.sup.n + ' Berührungen, ' + num((A.lv.sup.p / A.px - 1) * 100, 1) + ' %)' : 'keine erkennbar'));
    r += row('var(--text-dim)', 'Nächster ' + termLink('Support') + ': ' + (A.lv.res ? eur(A.lv.res.p, cur) + ' (' + A.lv.res.n + ' Berührungen, +' + num((A.lv.res.p / A.px - 1) * 100, 1) + ' %)' : 'keiner erkennbar'));
    return card('Trend, Volumen & Signale', '', '<div class="chart-signal-list">' + r + '</div>' + NOTE);
  }

  function rrCalc(A, stock) {
    var px = A.px, sup = A.lv.sup, res = A.lv.res, notes = [], stop, tgt;
    var stopSup = sup ? sup.p * 0.985 : null, stopAtr = px - 2 * A.atr, mean = stock.analysts && stock.analysts.targets && stock.analysts.targets.mean;
    if (ui.stop === 'support' && stopSup && px - stopSup >= 0.8 * A.atr) stop = stopSup;
    else { stop = stopAtr; if (ui.stop === 'support') notes.push(sup ? 'Unterstützung liegt zu nah am Kurs, Stop daher 2× ATR.' : 'Keine Unterstützung erkennbar, Stop daher 2× ATR.'); }
    if (ui.target === 'resistance' && res) tgt = res.p;
    else if (ui.target === 'analyst' && mean && mean > px) tgt = mean;
    else { tgt = px + 2 * (px - stop); if (ui.target !== 'rr2') notes.push(ui.target === 'resistance' ? 'Kein Widerstand erkennbar, Ziel daher CRV 2:1.' : 'Kein Analystenziel über dem Kurs, Ziel daher CRV 2:1.'); }
    var risk = px - stop, reward = tgt - px, crv = risk > 0 ? reward / risk : 0;
    var shares = risk > 0 ? Math.floor((ui.capital * ui.risk / 100) / risk) : 0;
    return { stop: stop, tgt: tgt, risk: risk, reward: reward, crv: crv, shares: shares, notes: notes };
  }

  function rrCard(A, stock, cur) {
    var R = rrCalc(A, stock), col = R.crv >= 2 ? 'var(--bullish)' : R.crv >= 1 ? '#f59e0b' : 'var(--bearish)';
    var inp = 'style="width:84px;background:var(--bg-card,#111);color:inherit;border:1px solid var(--border-color,#333);border-radius:8px;padding:4px 6px;"';
    var body = '<div style="font-size:.72rem;color:var(--text-dim);margin-bottom:4px;">Stop</div><div class="pill-group" style="margin-bottom:8px;">' + pill('stop:support', 'Unterstützung', ui.stop === 'support') + pill('stop:atr', '2× ATR', ui.stop === 'atr') + '</div>' +
      '<div style="font-size:.72rem;color:var(--text-dim);margin-bottom:4px;">Ziel</div><div class="pill-group" style="margin-bottom:8px;">' + pill('target:resistance', 'Widerstand', ui.target === 'resistance') + pill('target:analyst', 'Analystenziel', ui.target === 'analyst') + pill('target:rr2', 'CRV 2:1', ui.target === 'rr2') + '</div>' +
      '<div class="chart-signal-list">' +
      row('var(--bullish)', 'Ziel: <b>' + eur(R.tgt, cur) + '</b> (+' + num(R.reward / A.px * 100, 1) + ' %)') +
      row('var(--text-main)', 'Einstieg: <b>' + eur(A.px, cur) + '</b>') +
      row('var(--bearish)', 'Stop: <b>' + eur(R.stop, cur) + '</b> (−' + num(R.risk / A.px * 100, 1) + ' %)') +
      row(col, termLink('CRV') + ': <b>' + num(R.crv, 2) + '</b>', R.crv < 1 ? 'Das mögliche Risiko ist größer als die Chance.' : R.crv >= 2 ? 'mindestens 2:1' : 'zwischen 1:1 und 2:1') + '</div>' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:8px 0;font-size:.78rem;">Kapital <input id="ca-cap" type="number" inputmode="decimal" min="0" value="' + ui.capital + '" ' + inp + '> Risiko <input id="ca-risk" type="number" inputmode="decimal" min="0.1" step="0.1" value="' + ui.risk + '" ' + inp + '> %</div>' +
      '<div class="chart-signal-value">' + (R.shares > 0 ? 'Bei ' + eur(ui.capital, cur) + ' Kapital und ' + num(ui.risk, 1) + ' % Risiko: ca. <b>' + R.shares + ' Stück</b> (≈ ' + eur(R.shares * A.px, cur) + '). Maximaler Verlust ≈ ' + eur(R.shares * R.risk, cur) + ', möglicher Gewinn ≈ ' + eur(R.shares * R.reward, cur) + '.' : 'Mit diesen Angaben ergibt sich keine ganze Stückzahl.') + '</div>' +
      (R.notes.length ? '<div style="font-size:.72rem;color:var(--text-dim);margin-top:4px;">' + R.notes.join(' ') + '</div>' : '') + NOTE;
    return card('Risk/Reward (Long)', '<span class="period-tag">CRV ' + num(R.crv, 1) + '</span>', body);
  }

  function niceTicks(mn, mx) {
    var rng = (mx - mn) / 4, e = Math.pow(10, Math.floor(Math.log(rng) / Math.LN10)), f = rng / e, st = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e, out = [];
    for (var v = Math.ceil(mn / st) * st; v <= mx + st * 1e-6; v += st) out.push(v);
    return { vals: out, dec: st >= 1 ? 0 : st >= 0.1 ? 1 : 2 };
  }

  function draw(cv, A) {
    if (!cv) return;
    var dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 320, H = cv.clientHeight || 240;
    cv.width = W * dpr; cv.height = H * dpr;
    var g = cv.getContext('2d'); g.scale(dpr, dpr);
    var css = getComputedStyle(cv), txt = css.getPropertyValue('--text-main').trim() || '#e5e7eb', dim = css.getPropertyValue('--text-dim').trim() || '#94a3b8';
    var from = A.from, N = A.N, bars = N - from, i;
    
    var maxH = maxOf(A.h.slice(from)), minL = minOf(A.l.slice(from));
    if (ui.bollinger && A.bb) {
      A.bb.forEach(function(b) { if (b.i >= from) { maxH = Math.max(maxH, b.u); minL = Math.min(minL, b.d); } });
    }
    var pad = (maxH - minL) * 0.06 || maxH * 0.02, mn = minL - pad, mx = maxH + pad;
    
    var L = 6, R = 52, T = 8, B = 20, pw = W - L - R, ph = H - T - B;
    function x(k) { return L + (k - from) / Math.max(1, bars - 1) * pw; }
    function y(v) { return T + (1 - (v - mn) / (mx - mn)) * ph; }
    
    g.font = '10px sans-serif'; g.textBaseline = 'middle';
    var tk = niceTicks(mn, mx);
    tk.vals.forEach(function (v) {
      g.strokeStyle = 'rgba(148,163,184,.15)'; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y(v)); g.lineTo(W - R, y(v)); g.stroke();
      g.fillStyle = dim; g.textAlign = 'left'; g.fillText(v.toFixed(tk.dec), W - R + 4, y(v));
    });
    g.save(); g.beginPath(); g.rect(L - 1, T - 2, pw + 3, ph + 4); g.clip();
    
    if (ui.sr) {
      g.lineWidth = 1; g.setLineDash([4, 4]);
      if (A.lv.sup) { g.strokeStyle = 'rgba(16,185,129,0.7)'; g.beginPath(); g.moveTo(L, y(A.lv.sup.p)); g.lineTo(W - R, y(A.lv.sup.p)); g.stroke(); }
      if (A.lv.res) { g.strokeStyle = 'rgba(239,68,68,0.7)'; g.beginPath(); g.moveTo(L, y(A.lv.res.p)); g.lineTo(W - R, y(A.lv.res.p)); g.stroke(); }
      g.setLineDash([]);
    }

    if (ui.bollinger && A.bb) {
      g.lineWidth = 1;
      g.setLineDash([]);
      g.strokeStyle = 'rgba(16, 185, 129, 0.4)';
      g.beginPath();
      var firstU = true;
      A.bb.forEach(function(b) {
        if (b.i >= from) {
          if (firstU) { g.moveTo(x(b.i), y(b.u)); firstU = false; }
          else { g.lineTo(x(b.i), y(b.u)); }
        }
      });
      if (!firstU) g.stroke();

      g.strokeStyle = 'rgba(239, 68, 68, 0.4)';
      g.beginPath();
      var firstD = true;
      A.bb.forEach(function(b) {
        if (b.i >= from) {
          if (firstD) { g.moveTo(x(b.i), y(b.d)); firstD = false; }
          else { g.lineTo(x(b.i), y(b.d)); }
        }
      });
      if (!firstD) g.stroke();
    }

    g.strokeStyle = txt; g.lineWidth = 1.5; g.beginPath();
    for (i = from; i < N; i++) { if (i === from) g.moveTo(x(i), y(A.c[i])); else g.lineTo(x(i), y(A.c[i])); }
    g.stroke();
    
    if (ui.zigzag && A.pivots && A.pivots.length) {
      g.strokeStyle = '#0ea5e9';
      g.lineWidth = 1.5; g.setLineDash([]);
      g.beginPath();
      var firstP = true;
      A.pivots.forEach(function (p) {
        if (p.i >= from) {
          if (firstP) { g.moveTo(x(p.i), y(p.p)); firstP = false; }
          else { g.lineTo(x(p.i), y(p.p)); }
        }
      });
      if (!firstP) g.stroke();
    }

    if (ui.chart) {
      A.pats.filter(function (p) { return p.kind === 'chart'; }).forEach(function (p) {
        var col = BIAS[p.bias];
        g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.5;
        p.lines.forEach(function (ln) { g.setLineDash(ln[4] ? [5, 4] : []); g.beginPath(); g.moveTo(x(Math.max(from, ln[0])), y(ln[1])); g.lineTo(x(ln[2]), y(ln[3])); g.stroke(); });
        g.setLineDash([]);
        p.pts.forEach(function (pt) { if (pt[0] >= from) { g.beginPath(); g.arc(x(pt[0]), y(pt[1]), 3, 0, 6.283); g.fill(); } });
      });
    }
    if (ui.candle) {
      A.pats.filter(function (p) { return p.kind === 'candle'; }).forEach(function (p) {
        var col = BIAS[p.bias], up = p.bias === 'bull', xx = x(p.i), yy = up ? y(A.l[p.i]) + 9 : y(A.h[p.i]) - 9;
        g.fillStyle = col; g.beginPath();
        if (up) { g.moveTo(xx, yy - 6); g.lineTo(xx - 4, yy + 2); g.lineTo(xx + 4, yy + 2); } else { g.moveTo(xx, yy + 6); g.lineTo(xx - 4, yy - 2); g.lineTo(xx + 4, yy - 2); }
        g.closePath(); g.fill();
      });
    }
    g.restore();
    g.fillStyle = dim; g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillText(deDate(A.T.date[A.off + from]), L, H - 5);
    g.textAlign = 'right'; g.fillText('Heute', W - R, H - 5);
  }

  function mount(slot, stock, period) {
    if (!slot || !stock) return;
    var A = null;
    try { A = analyse(stock, period); } catch (e) { A = null; if (window.console) console.error('ChartAnalyse', e); }
    if (!A) { slot.innerHTML = ''; return; }
    
    var oldToolbar = slot.querySelector('#ca-tools-toolbar');
    var savedScroll = oldToolbar ? oldToolbar.scrollLeft : 0;
    
    var cur = (stock.quote && stock.quote.currency) || 'EUR';
    slot.innerHTML = scoreCard(A) + patternsCard(A, cur) + signalsCard(A, cur) + rrCard(A, stock, cur);
    
    var newToolbar = slot.querySelector('#ca-tools-toolbar');
    if (newToolbar && savedScroll > 0) newToolbar.scrollLeft = savedScroll;
    
    bindTerms(slot);

    draw(slot.querySelector('#ca-canvas'), A);
    
    [].forEach.call(slot.querySelectorAll('.ca-btn'), function (b) {
      b.onclick = function (e) {
        if (e.target && e.target.closest('.term-link')) return; 
        var k = b.getAttribute('data-k'), p = k.split(':');
        if (p.length === 2) ui[p[0]] = p[1]; else ui[k] = !ui[k];
        saveUi();
        mount(slot, stock, period);
      };
    });
    
    function num2(id, key, min) {
      var el = slot.querySelector(id);
      if (el) el.onchange = function () { var v = parseFloat(String(el.value).replace(',', '.')); if (isFinite(v) && v >= min) { ui[key] = v; saveUi(); mount(slot, stock, period); } };
    }
    num2('#ca-cap', 'capital', 1); num2('#ca-risk', 'risk', 0.1);
  }

  function promptText(stock) {
    var A = null;
    try { A = analyse(stock, '6M'); } catch (e) { return ''; }
    if (!A) return '';
    var cur = (stock.quote && stock.quote.currency) || 'EUR', s = 'Chart-Analyse: Score ' + A.score + '/100 (' + BIAS_TXT[A.label] + ')';
    var names = A.pats.filter(function (p) { return p.kind === 'chart'; }).map(function (p) { return p.name + ' (' + BIAS_TXT[p.bias] + ', ' + p.status + ')'; });
    var cand = A.pats.filter(function (p) { return p.kind === 'candle'; }).map(function (p) { return p.name + ' am ' + deDate(p.date); });
    if (names.length) s += '; Chartmuster: ' + names.join(', ');
    if (cand.length) s += '; Kerzenmuster: ' + cand.join(', ');
    if (A.adx) s += '; ADX ' + num(A.adx.adx, 0);
    if (A.squeeze) s += '; Bollinger-Squeeze';
    if (A.div) s += '; ' + A.div.text;
    if (A.brk) s += '; ' + A.brk.text;
    if (A.lv.sup) s += '; Unterstützung ' + eur(A.lv.sup.p, cur);
    if (A.lv.res) s += '; Widerstand ' + eur(A.lv.res.p, cur);
    return s + '. ';
  }

  return { mount: mount, promptText: promptText, _analyse: analyse, _zigzag: zigzag };
})();

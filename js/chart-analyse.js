/**
 * js/chart-analyse.js – erweiterte Chart-Analyse (eigenständiges Modul)
 * Chartmuster (mehrere gleichzeitig), Kerzenmuster, Divergenz, Squeeze, ADX/ATR/OBV,
 * Ausbruch mit Volumen, Support/Widerstand, Risk/Reward (Stop an Unterstützung oder ATR), Chart-Score.
 * Marktzyklus-Phase (überarbeitet): Phase aus Abstand zum SMA200, SMA200-Steigung, RSI (5 Tage geglättet),
 * Rückgang vom 52-Wochen-Hoch und ADX; jede Phase liegt exakt auf der Beschriftung der Kurve.
 */
window.App = window.App || {};
window.App.ChartAnalyse = (function () {
  'use strict';

  var WIN = { '1W': 63, '1M': 63, '3M': 63, '6M': 126, '1Y': 250 };
  var BIAS = { bull: '#22c55e', bear: '#ef4444', neutral: '#f59e0b' };
  var BIAS_TXT = { bull: 'bullisch', bear: 'bärisch', neutral: 'neutral' };
  
  var ui = { chart: true, candle: true, sr: false, zigzag: false, bollinger: false, capital: 10000, risk: 1, stop: 'support', target: 'resistance', tradeDir: 'long', cycle: true };
  var lastClickedToolTerm = null; 

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
    Support: { name: 'Unterstützung & Widerstand', text: 'Starke Zonen (ab 4 Berührungen) sind durchgezogen und kräftig. Mittlere (3) normal gestrichelt. Schwache (2) sind stark transparent und weit gestrichelt.' },
    CRV: { name: 'Chance-Risiko-Verhältnis (CRV)', text: 'Das Verhältnis zwischen dem möglichen Gewinn (Ziel minus Einstieg) und dem möglichen Verlust (Einstieg minus Stop). Werte ab 2:1 gelten als erstrebenswert.' },
    Score: { name: 'Chart-Score', text: 'Ein Gesamtwert von 0 bis 100 (50 = neutral), der fünf verschiedene technische Bereiche (Trend, Momentum, Muster, Signale und S/R-Lage) bündelt.' },
    Chartmuster: { name: 'Chartmuster', text: 'Automatische Erkennung klassischer Formationen (Doppel-Tops, SKS, Dreiecke, Flaggen). Ausbrüche werden stärker gewichtet, wenn sie mit hohem Volumen einhergehen.' },
    Kerzenmuster: { name: 'Kerzenmuster', text: 'Erkennung von kurzfristigen Umkehrsignalen (1-3 Tage) wie Hammer oder Engulfing auf Basis der Kerzenkörper.' },
    ZigZag: { name: 'Wendepunkte (ZigZag)', text: 'Verbindet markante Hoch- und Tiefpunkte im Chart und filtert kleinere Schwankungen (Rauschen) heraus, um den Haupttrend sichtbar zu machen.' },
    Zyklus: { name: 'Marktzyklus (Psychologie)', text: 'Schematisches Modell der Marktpsychologie: von Stealth und Take off über Enthusiasmus, Mania und Blow off bis zu Denial, Bull Trap, Fear und Despair. Die Phase wird aus dem Abstand zum SMA200, der Steigung des SMA200, dem RSI, dem Rückgang vom 52-Wochen-Hoch und der Trendstärke (ADX) abgeleitet. Die Y-Achse der Grafik ist nur eine Illustration, keine Bewertung. Keine Prognose.' }
  };

  var TERM_RULES = [
    [/^ADX/, 'ADX'], [/^ATR/, 'ATR'], [/^OBV/, 'OBV'], [/Bollinger/, 'Bollinger'],
    [/Unterstützung|Widerstand/, 'Support'], [/Chance-Risiko-Verhältnis|CRV/, 'CRV'],
    [/Chart-Score/, 'Score'], [/Chartmuster/, 'Chartmuster'], [/Kerzenmuster/, 'Kerzenmuster'],
    [/Wendepunkte|ZigZag/, 'ZigZag'], [/Marktzyklus/, 'Zyklus']
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
  // Chartmuster (Dynamisch mit ATR & Volumen)
  // ---------------------------------------------------------------------------
  function twoPivotPatterns(V, px, N, atr, volBrk, out) {
    var len = V.length, k, a, b, c;
    for (k = 0; k + 2 < len; k++) {
      if (len - 1 - (k + 2) > 1) continue;
      a = V[k]; b = V[k + 1]; c = V[k + 2];
      if (c.open || c.i < N - 45 || c.i - a.i < 10) continue;
      
      var tol = atr * 0.7; 
      
      if (a.t === 'H' && b.t === 'L' && c.t === 'H') {
        var top = Math.min(a.p, c.p);
        if (Math.abs(a.p - c.p) <= tol && (top - b.p) >= (atr * 1.5) && px <= Math.max(a.p, c.p) + tol) {
          var conf = px < b.p * 0.995;
          out.push({ kind: 'chart', name: 'Doppel-Top', bias: 'bear', status: conf ? 'bestätigt' : 'in Bildung', level: b.p, levelName: 'Nackenlinie',
            target: b.p - (avg([a.p, c.p]) - b.p), score: conf ? (volBrk ? 12 : 9) : 6, from: a.i, to: c.i,
            lines: [[a.i, b.p, N - 1, b.p, 1]], pts: [[a.i, a.p], [b.i, b.p], [c.i, c.p]] });
        }
      }
      if (a.t === 'L' && b.t === 'H' && c.t === 'L') {
        var bot = Math.max(a.p, c.p);
        if (Math.abs(a.p - c.p) <= tol && (b.p - bot) >= (atr * 1.5) && px >= Math.min(a.p, c.p) - tol) {
          var conf2 = px > b.p * 1.005;
          out.push({ kind: 'chart', name: 'Doppel-Boden', bias: 'bull', status: conf2 ? 'bestätigt' : 'in Bildung', level: b.p, levelName: 'Nackenlinie',
            target: b.p + (b.p - avg([a.p, c.p])), score: conf2 ? (volBrk ? 12 : 9) : 6, from: a.i, to: c.i,
            lines: [[a.i, b.p, N - 1, b.p, 1]], pts: [[a.i, a.p], [b.i, b.p], [c.i, c.p]] });
        }
      }
    }
  }

  function triplePivotPatterns(V, px, N, atr, volBrk, out) {
    var len = V.length, k, a, b, c, d, e;
    for (k = 0; k + 4 < len; k++) {
      if (len - 1 - (k + 4) > 1) continue;
      a = V[k]; b = V[k + 1]; c = V[k + 2]; d = V[k + 3]; e = V[k + 4];
      if (e.open || e.i < N - 60 || e.i - a.i < 15) continue;
      
      var tol = atr * 0.8;
      
      if (a.t === 'H' && b.t === 'L' && c.t === 'H' && d.t === 'L' && e.t === 'H') {
        var tops = [a.p, c.p, e.p], maxT = Math.max.apply(null, tops), minT = Math.min.apply(null, tops);
        var neck = avg([b.p, d.p]);
        if ((maxT - minT) <= tol && (minT - neck) >= atr * 1.5 && px <= maxT + tol) {
          var conf = px < neck * 0.995;
          out.push({ kind: 'chart', name: 'Triple-Top', bias: 'bear', status: conf ? 'bestätigt' : 'in Bildung', level: neck, levelName: 'Nackenlinie', 
            target: neck - (avg(tops) - neck), score: conf ? (volBrk ? 14 : 10) : 7, from: a.i, to: e.i, 
            lines: [[a.i, neck, N - 1, neck, 1]], pts: [[a.i, a.p], [b.i, b.p], [c.i, c.p], [d.i, d.p], [e.i, e.p]] });
        }
      }
      if (a.t === 'L' && b.t === 'H' && c.t === 'L' && d.t === 'H' && e.t === 'L') {
        var bots = [a.p, c.p, e.p], maxB = Math.max.apply(null, bots), minB = Math.min.apply(null, bots);
        var neck2 = avg([b.p, d.p]);
        if ((maxB - minB) <= tol && (neck2 - maxB) >= atr * 1.5 && px >= minB - tol) {
          var conf2 = px > neck2 * 1.005;
          out.push({ kind: 'chart', name: 'Triple-Boden', bias: 'bull', status: conf2 ? 'bestätigt' : 'in Bildung', level: neck2, levelName: 'Nackenlinie', 
            target: neck2 + (neck2 - avg(bots)), score: conf2 ? (volBrk ? 14 : 10) : 7, from: a.i, to: e.i, 
            lines: [[a.i, neck2, N - 1, neck2, 1]], pts: [[a.i, a.p], [b.i, b.p], [c.i, c.p], [d.i, d.p], [e.i, e.p]] });
        }
      }
    }
  }

  function headShoulders(V, px, N, atr, volBrk, out) {
    var len = V.length, k, p;
    for (k = 0; k + 4 < len; k++) {
      if (len - 1 - (k + 4) > 1) continue;
      p = V.slice(k, k + 5);
      if (p[4].open || p[4].i < N - 50 || p[4].i - p[0].i < 20) continue;
      
      var tol = atr * 0.8;
      
      if (p[0].t === 'H' && p[1].t === 'L' && p[2].t === 'H' && p[3].t === 'L' && p[4].t === 'H') {
        var sh = avg([p[0].p, p[4].p]), neck = avg([p[1].p, p[3].p]);
        if (p[2].p >= sh + atr && Math.abs(p[0].p - p[4].p) <= tol && Math.abs(p[1].p - p[3].p) <= tol && px <= p[4].p + tol) {
          var cf = px < neck * 0.995;
          out.push({ kind: 'chart', name: 'Schulter-Kopf-Schulter', bias: 'bear', status: cf ? 'bestätigt' : 'in Bildung', level: neck, levelName: 'Nackenlinie',
            target: neck - (p[2].p - neck), score: cf ? (volBrk ? 14 : 10) : 7, from: p[0].i, to: p[4].i,
            lines: [[p[1].i, neck, N - 1, neck, 1]], pts: p.map(function (q) { return [q.i, q.p]; }) });
        }
      }
      if (p[0].t === 'L' && p[1].t === 'H' && p[2].t === 'L' && p[3].t === 'H' && p[4].t === 'L') {
        var sh2 = avg([p[0].p, p[4].p]), neck2 = avg([p[1].p, p[3].p]);
        if (p[2].p <= sh2 - atr && Math.abs(p[0].p - p[4].p) <= tol && Math.abs(p[1].p - p[3].p) <= tol && px >= p[4].p - tol) {
          var cf2 = px > neck2 * 1.005;
          out.push({ kind: 'chart', name: 'Umgekehrte SKS', bias: 'bull', status: cf2 ? 'bestätigt' : 'in Bildung', level: neck2, levelName: 'Nackenlinie',
            target: neck2 + (neck2 - p[2].p), score: cf2 ? (volBrk ? 14 : 10) : 7, from: p[0].i, to: p[4].i,
            lines: [[p[1].i, neck2, N - 1, neck2, 1]], pts: p.map(function (q) { return [q.i, q.p]; }) });
        }
      }
    }
  }

  function trendPatterns(Vw, px, N, volBrk, out) {
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
    if (isChan) { 
      status = up ? 'Ausbruch nach oben' : dn ? 'Ausbruch nach unten' : 'intakt'; 
      sc = up || dn ? (volBrk ? 9 : 6) : 3; 
      if (up) bias = 'bull'; 
      if (dn) bias = 'bear'; 
    }
    else if (up) { status = 'Ausbruch nach oben'; target = hAt(N - 1) + g0; bias = 'bull'; sc = volBrk ? 13 : 9; }
    else if (dn) { status = 'Ausbruch nach unten'; target = lAt(N - 1) - g0; bias = 'bear'; sc = volBrk ? 13 : 9; }
    if (bias === 'neutral') sc = 0;
    out.push({ kind: 'chart', name: name, bias: bias, status: status, level: null, target: target, score: sc, from: i0, to: N - 1,
      lines: [[i0, hAt(i0), N - 1, hAt(N - 1), 0], [i0, lAt(i0), N - 1, lAt(N - 1), 0]], pts: H.concat(L).map(function (p) { return [p.i, p.p]; }),
      note: note });
  }

  function flagPatterns(c, N, volBrk, out) {
    var look = Math.min(N, 45), s = N - look, j, j1, j0, px = c[N - 1];
    j1 = s; for (j = s; j <= N - 6; j++) if (c[j] >= c[j1]) j1 = j;
    j0 = Math.max(s, j1 - 15); for (j = j0; j <= j1; j++) if (c[j] <= c[j0]) j0 = j;
    var pole = c[j1] / c[j0] - 1;
    if (pole >= 0.12 && N - 1 - j1 >= 5 && N - 1 - j1 <= 25) {
      var low = minOf(c.slice(j1)), retr = (c[j1] - low) / (c[j1] - c[j0]);
      if (retr <= 0.5 && px >= c[j0] + 0.5 * (c[j1] - c[j0]) && px <= c[j1] * 1.05) {
        var br = px > c[j1];
        out.push({ kind: 'chart', name: 'Bullische Flagge', bias: 'bull', status: br ? 'Ausbruch nach oben' : 'in Bildung', level: c[j1], levelName: 'Flaggenhoch',
          target: c[j1] + (c[j1] - c[j0]), score: br ? (volBrk ? 12 : 8) : 5, from: j0, to: N - 1, lines: [[j0, c[j0], j1, c[j1], 0], [j1, c[j1], N - 1, c[N - 1], 1]], pts: [[j0, c[j0]], [j1, c[j1]]] });
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
          target: c[j1] - (c[j0] - c[j1]), score: br2 ? (volBrk ? 12 : 8) : 5, from: j0, to: N - 1, lines: [[j0, c[j0], j1, c[j1], 0], [j1, c[j1], N - 1, c[N - 1], 1]], pts: [[j0, c[j0]], [j1, c[j1]]] });
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
  function levels(P, px, atr) {
    var pivs = P.slice().sort(function (a, b) { return a.p - b.p; }), cl = [], cur = null;
    var tol = atr * 0.6; 
    
    pivs.forEach(function (pt) {
      if (cur && (pt.p - cur.min) <= tol) { 
        cur.vals.push(pt.p); 
        cur.max = Math.max(cur.max, pt.p); 
        cur.touches++;
      } else { 
        cur = { vals: [pt.p], min: pt.p, max: pt.p, touches: 1 }; 
        cl.push(cur); 
      }
    });
    
    var lv = cl.filter(function (c) { return c.touches >= 2; }).map(function (c) { 
      return { p: avg(c.vals), n: c.touches }; 
    });
    
    function getScore(lvl, isSup) {
      var distAtr = Math.abs(lvl.p - px) / atr;
      if (isSup && lvl.p >= px * 0.99) return -999;
      if (!isSup && lvl.p <= px * 1.01) return -999;
      return lvl.n / (1 + distAtr);
    }

    var sups = lv.filter(function (x) { return x.p < px; }).sort(function(a, b) { return getScore(b, true) - getScore(a, true); });
    var ress = lv.filter(function (x) { return x.p > px; }).sort(function(a, b) { return getScore(b, false) - getScore(a, false); });

    return { sup: sups[0] || null, res: ress[0] || null, all: lv };
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
    
    var hasVol = T.v.slice(-20).some(function (v) { return v > 0; });
    var strongVolBrk = false;
    if (hasVol && n > 25) {
      var avgVol21 = avg(T.v.slice(-21, -1));
      if (avgVol21 > 0 && (T.v[n - 1] / avgVol21) >= 1.5) strongVolBrk = true;
    }

    var th = clamp(2.2 * atrV / px, 0.035, 0.12);
    
    var P = zigzag(h, l, th), Vw = P.filter(function (p) { return p.i >= from; });
    var P_major = zigzag(h, l, th * 1.5), Vw_major = P_major.filter(function (p) { return p.i >= from; });

    var pats = [];
    twoPivotPatterns(Vw, px, N, atrV, strongVolBrk, pats);
    triplePivotPatterns(Vw_major, px, N, atrV, strongVolBrk, pats); 
    headShoulders(Vw_major, px, N, atrV, strongVolBrk, pats);       
    trendPatterns(Vw, px, N, strongVolBrk, pats);
    if (from <= N - 12) flagPatterns(c, N, strongVolBrk, pats);
    candlePatterns(T, off, N, pats);

    var rsi = rsiArr(T.c, 14), r0 = rsi[n - 1];
    var e12 = ema(T.c, 12), e26 = ema(T.c, 26), line = e12.map(function (v, i) { return v !== null && e26[i] !== null ? v - e26[i] : null; }), sigl = ema(line, 9);
    var macdBull = line[n - 1] !== null && sigl[n - 1] !== null && line[n - 1] > sigl[n - 1];
    var s50 = n >= 50 ? avg(T.c.slice(-50)) : null, s200 = n >= 200 ? avg(T.c.slice(-200)) : null;
    var adx = adxLast(T.h, T.l, T.c, 14);
    // Zusatzdaten für den Marktzyklus: SMA200 vor 20 Tagen, 52-Wochen-Spanne, Volumenspitze
    var s200p = n >= 220 ? avg(T.c.slice(-220, -20)) : null;
    var yr = T.c.slice(-252), hi252 = maxOf(yr), lo252 = minOf(yr);
    var volSpike = false;
    if (hasVol && n > 55) {
      var v5 = avg(T.v.slice(-5)), v50 = avg(T.v.slice(-55, -5));
      volSpike = v50 > 0 && v5 / v50 >= 1.5;
    }

    var obv = [0], i;
    for (i = 1; i < n; i++) obv.push(obv[i - 1] + (T.c[i] > T.c[i - 1] ? T.v[i] : T.c[i] < T.c[i - 1] ? -T.v[i] : 0));
    var obvTrend = hasVol ? Math.sign(obv[n - 1] - obv[n - 21]) : 0, pTrend = Math.sign(px - T.c[n - 21]);

    var bw = [], pb = null, bb = [];
    for (i = 19; i < n; i++) {
      var sl = T.c.slice(i - 19, i + 1), m = avg(sl), sd = Math.sqrt(avg(sl.map(function (x) { return (x - m) * (x - m); })));
      bw.push((4 * sd) / m);
      bb.push({ i: i - off, m: m, u: m + 2 * sd, d: m - 2 * sd }); 
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
      var hi20 = maxOf(T.c.slice(-21, -1)), lo20 = minOf(T.c.slice(-21, -1));
      if (px > hi20) brk = { type: 'bull', text: 'Ausbruch über das 20-Tage-Hoch ' + (strongVolBrk ? 'mit starkem Volumen' : 'ohne Volumenbestätigung'), strong: strongVolBrk };
      else if (px < lo20) brk = { type: 'bear', text: 'Bruch des 20-Tage-Tiefs ' + (strongVolBrk ? 'mit starkem Volumen' : 'ohne Volumenbestätigung'), strong: strongVolBrk };
    }

    var lv = levels(P, px, atrV);

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

    return { T: T, n: n, N: N, off: off, from: from, w: w, px: px, c: c, h: h, l: l, atr: atrV, th: th, pivots: P, pats: pats, rsi: r0, rsiSeries: rsi, macdBull: macdBull, s50: s50, s200: s200, s200p: s200p, hi: hi252, lo: lo252, volSpike: volSpike,
      adx: adx, hasVol: hasVol, obvTrend: obvTrend, pTrend: pTrend, bw: bwLast, bb: bb, squeeze: rank <= 0.2, pctB: pb, div: div, brk: brk, lv: lv, parts: parts, score: score,
      label: score >= 65 ? 'bull' : score <= 35 ? 'bear' : 'neutral' };
  }

  // ---------------------------------------------------------------------------
  // Marktzyklus Phase & Rendering
  // ---------------------------------------------------------------------------
  var CYCLE_CURVE = [
    { x: 0.0, y: 0.15 }, { x: 0.15, y: 0.22 }, { x: 0.25, y: 0.28 }, { x: 0.45, y: 0.42 },
    { x: 0.55, y: 0.55 }, { x: 0.65, y: 0.75 }, { x: 0.68, y: 0.95 }, { x: 0.75, y: 0.75 },
    { x: 0.78, y: 0.85 }, { x: 0.85, y: 0.45 }, { x: 0.95, y: 0.15 }, { x: 1.0, y: 0.40 }
  ];
  var TONE_COLOR = { ok: '#10b981', warn: '#f59e0b', risk: '#ef4444', chance: '#38bdf8' };
  var TONE_TXT = { ok: 'Trend intakt', warn: 'Vorsicht', risk: 'erhöhtes Risiko', chance: 'Chance mit hohem Risiko' };

  // Jede Phase liegt auf einem Eckpunkt der Kurve (x) und passt zur Beschriftung dort.
  var PHASES = {
    stealth:    { name: 'Stealth / Bodenbildung', x: 0.15, tone: 'ok',
      desc: 'Der Kurs pendelt ruhig um den SMA200, die Trendstärke ist gering und das Hoch liegt weit zurück. Oft die Phase, in der leise aufgebaut wird.' },
    takeoff:    { name: 'Take off / Aufwärtstrend', x: 0.25, tone: 'ok',
      desc: 'Der Kurs liegt über dem SMA200 und der Trend etabliert sich ohne Übertreibung.' },
    firstsell:  { name: 'First Sell off / Rücksetzer', x: 0.45, tone: 'warn',
      desc: 'Rücksetzer im Aufwärtstrend. Entscheidend ist, ob der SMA200 als Unterstützung hält.' },
    enthusiasm: { name: 'Enthusiasmus', x: 0.55, tone: 'ok',
      desc: 'Der Kurs liegt deutlich über dem SMA200 bei gutem Momentum. Der Trend ist stark, die Gier nimmt zu.' },
    mania:      { name: 'Mania', x: 0.65, tone: 'warn',
      desc: 'Der Kurs ist weit über den SMA200 gelaufen und der RSI ist hoch. Rücksetzer werden wahrscheinlicher.' },
    blowoff:    { name: 'Blow off / Erschöpfung', x: 0.68, tone: 'risk',
      desc: 'Stark überdehnt, die Trendstärke lässt nach oder es gibt eine bärische Divergenz. Hohes Korrekturrisiko.' },
    denial:     { name: 'Denial / Erholung', x: 0.75, tone: 'warn',
      desc: 'Der Kurs liegt unter dem SMA200 und erholt sich leicht. Der SMA200 wirkt oft als Widerstand.' },
    trap:       { name: 'Bull Trap Gefahr', x: 0.78, tone: 'warn',
      desc: 'Kräftige Erholung, aber der SMA200 fällt noch oder der Kurs liegt darunter. Die Bewährungsprobe steht aus.' },
    fear:       { name: 'Fear / Abwärtstrend', x: 0.85, tone: 'risk',
      desc: 'Der Kurs liegt unter dem SMA200 bei schwachem Momentum. Der Abwärtstrend ist intakt.' },
    despair:    { name: 'Despair / Kapitulation', x: 0.95, tone: 'chance',
      desc: 'Starker Kursverfall bei überverkauftem Momentum. Oft Kapitulation und historisch eine Chance, aber mit hohem Risiko.' }
  };

  function cycleMetrics(A) {
    if (!A || !A.s200) return null;     // ohne 200 Handelstage keine verlässliche Einschätzung
    var rs = (A.rsiSeries || []).slice(-5).filter(function (v) { return v !== null && v !== undefined; });
    var slope = A.s200p ? (A.s200 / A.s200p - 1) * 100 : null;   // SMA200-Veränderung über 20 Tage in %
    return {
      dev: (A.px / A.s200 - 1) * 100,
      slope: slope,
      flat: slope !== null && Math.abs(slope) <= 1,
      slopeUp: slope !== null ? slope > 0.3 : (A.s50 ? A.s50 > A.s200 : false),
      slopeDown: slope !== null ? slope < -0.3 : (A.s50 ? A.s50 < A.s200 : false),
      dd: A.hi ? (A.px / A.hi - 1) * 100 : 0,     // Abstand zum 52-Wochen-Hoch (negativ)
      up: A.lo ? (A.px / A.lo - 1) * 100 : 0,     // Abstand zum 52-Wochen-Tief (positiv)
      rsi: rs.length ? avg(rs) : (A.rsi !== null && A.rsi !== undefined ? A.rsi : 50),
      adx: A.adx ? A.adx.adx : 0
    };
  }

  function getCyclePhase(A) {
    var m = cycleMetrics(A);
    if (!m) return null;
    var bearDiv = !!(A.div && A.div.type === 'bear'), key;

    if (m.dd <= -30 && m.rsi < 32) key = 'despair';
    else if (Math.abs(m.dev) <= 6 && m.flat && m.adx < 22 && m.dd <= -10 && m.dd > -35) key = 'stealth';
    else if (m.dev <= 0 && m.dev > -6 && m.slopeUp && m.dd > -20) key = 'firstsell';
    else if (m.dev < 0) {
      if (m.rsi < 45) key = 'fear';
      else if (m.rsi >= 52 && m.up >= 10) key = 'trap';
      else key = 'denial';
    } else {
      if (m.dev >= 25 && m.rsi >= 70 && (bearDiv || m.adx < 25)) key = 'blowoff';
      else if (m.dev >= 20 && m.rsi >= 65) key = 'mania';
      else if (m.slopeDown && m.dev <= 6) key = 'trap';
      else if (m.dd <= -10 && m.dd > -30 && m.rsi < 50) key = 'firstsell';
      else if (m.dev >= 10 && m.rsi >= 55 && m.adx >= 20) key = 'enthusiasm';
      else key = 'takeoff';
    }

    var ph = PHASES[key], desc = ph.desc;
    if (key === 'despair' && A.volSpike) desc += ' Erhöhtes Volumen stützt die Kapitulations-These.';
    if (key === 'blowoff' && bearDiv) desc += ' Zusätzlich liegt eine bärische RSI-Divergenz vor.';

    // Y-Wert nur zur Platzierung auf der Kurve (keine Bewertung)
    var y = 0.4;
    for (var i = 0; i < CYCLE_CURVE.length - 1; i++) {
      if (ph.x >= CYCLE_CURVE[i].x && ph.x <= CYCLE_CURVE[i + 1].x) {
        var t = (ph.x - CYCLE_CURVE[i].x) / (CYCLE_CURVE[i + 1].x - CYCLE_CURVE[i].x);
        y = CYCLE_CURVE[i].y + t * (CYCLE_CURVE[i + 1].y - CYCLE_CURVE[i].y);
        break;
      }
    }

    var f1 = function (v) { return (v >= 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + ' %'; };
    var facts = 'Abstand zum SMA200 ' + f1(m.dev) +
      (m.slope !== null ? ', SMA200 ' + (m.slopeUp ? 'steigend' : m.slopeDown ? 'fallend' : 'seitwärts') : '') +
      ', RSI (5T) ' + Math.round(m.rsi) + ', ADX ' + Math.round(m.adx) +
      ', zum 52W-Hoch ' + f1(m.dd);

    return { key: key, x: ph.x, y: y, phase: ph.name, desc: desc, tone: ph.tone, color: TONE_COLOR[ph.tone], facts: facts, metrics: m };
  }

  function renderCycleChart(canvas, phaseData, A) {
    var dpr = window.devicePixelRatio || 1, W = canvas.clientWidth || 300, H = canvas.clientHeight || 180;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    var css = getComputedStyle(canvas), txt = css.getPropertyValue('--text-main').trim() || '#e5e7eb', dim = css.getPropertyValue('--text-dim').trim() || '#94a3b8';
    
    var padL = 10, padR = 10, padT = 25, padB = 30;
    var pw = W - padL - padR, ph = H - padT - padB;
    function px(x) { return padL + x * pw; }
    function py(y) { return padT + (1 - y) * ph; }

    // DYNAMISCHE MEAN-LINIE:
    // Wenn der Kurs stark über dem SMA200 liegt, sinkt die Mean-Linie (visuelle Überbewertung)
    // Wenn der Kurs stark darunter liegt, steigt sie relativ an.
    var dev = A.s200 ? (A.px / A.s200 - 1) : 0; 
    var meanOffset = clamp(dev * 0.5, -0.15, 0.15); 
    
    var meanStartY = 0.15 - meanOffset;
    var meanEndY = 0.40 - meanOffset;

    ctx.strokeStyle = 'rgba(148,163,184,.3)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(px(0), py(meanStartY)); ctx.lineTo(px(1), py(meanEndY)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = dim; ctx.font = '9px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('Mean (SMA 200)', px(1) - 5, py(meanEndY) - 5);

    // Die Kurve zeichnen
    var pts = CYCLE_CURVE;
    
    ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(px(pts[0].x), py(pts[0].y));
    for (var i = 1; i < pts.length; i++) {
      var p0 = pts[i-1], p1 = pts[i];
      var cp1x = px(p0.x + (p1.x - p0.x) / 3), cp1y = py(p0.y);
      var cp2x = px(p0.x + 2 * (p1.x - p0.x) / 3), cp2y = py(p1.y);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, px(p1.x), py(p1.y));
    }
    ctx.stroke();

    // Text-Labels an der Kurve (Sauber nach oben versetzt)
    ctx.fillStyle = dim; ctx.font = '9px sans-serif'; ctx.textBaseline = 'bottom';
    var labels = [
      {x: 0.08, y: 0.22, text: 'Stealth', align: 'left'},
      {x: 0.25, y: 0.35, text: 'Take off', align: 'center'},
      {x: 0.45, y: 0.50, text: 'First Sell off', align: 'center'},
      {x: 0.55, y: 0.60, text: 'Enthusiasmus', align: 'center'},
      {x: 0.65, y: 0.82, text: 'Mania', align: 'center'},
      {x: 0.68, y: 1.02, text: 'Blow off', align: 'center'},
      {x: 0.75, y: 0.82, text: 'Denial', align: 'center'},
      {x: 0.78, y: 0.92, text: 'Bull trap', align: 'center'},
      {x: 0.85, y: 0.52, text: 'Fear', align: 'right'},
      {x: 0.95, y: 0.22, text: 'Despair', align: 'center'},
      {x: 0.98, y: 0.45, text: 'Return to mean', align: 'right'}
    ];
    labels.forEach(function(l) { 
      ctx.textAlign = l.align;
      ctx.fillText(l.text, px(l.x), py(l.y) - 4); 
    });

    // Aktueller Punkt (Marker) mit dynamischer Farbe
    var dotColor = phaseData.color || '#10b981';

        var cx = px(phaseData.x), cy = py(phaseData.y);
    
    // Pulsierender Kreis
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = dotColor + '4D'; // 30% Transparenz
    ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    
    // Label für den aktuellen Punkt
    ctx.fillStyle = dotColor; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('Aktuell', cx + 10, cy);
  }

  function cycleCard(A) {
    var phaseData = getCyclePhase(A);
    if (!phaseData) {
      return card(termLink('Marktzyklus') + '-Phase', '<span class="period-tag">n/a</span>',
        '<div class="chart-signal-list">' + row('var(--text-dim)', '<b>Zu wenig Historie</b>', 'Für die Einschätzung werden mindestens 200 Handelstage Kursdaten benötigt (SMA200).') + '</div>' + NOTE);
    }
    return card(termLink('Marktzyklus') + '-Phase', '<span class="period-tag">' + phaseData.phase + '</span>',
      '<div style="position:relative;width:100%;height:180px;margin-bottom:8px;"><canvas id="ca-cycle-canvas" style="width:100%;height:100%;"></canvas></div>' +
      '<div class="chart-signal-list">' +
        row(phaseData.color, '<b>' + phaseData.phase + '</b> · ' + TONE_TXT[phaseData.tone], phaseData.desc) +
        row('var(--text-dim)', 'Grundlage', phaseData.facts) +
      '</div>' +
      '<div class="chart-note">Schematische Darstellung der Marktpsychologie. Die Höhe in der Grafik ist keine Bewertung. Regelbasierte Einschätzung, keine Prognose und keine Anlageberatung.</div>');
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
    var icon = termKey ? ' <span style="margin-left: 4px; opacity: 0.7;">ⓘ</span>' : '';
    return '<button class="chip-btn ca-btn ' + (on ? 'active' : '') + '" data-k="' + k + '" data-term="' + (termKey || '') + '">' + label + icon + '</button>';
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

    var infoBoxHtml = '';
    if (lastClickedToolTerm && GLOSSARY[lastClickedToolTerm]) {
      infoBoxHtml = '<div id="ca-term-info" data-term="' + lastClickedToolTerm + '" style="margin-bottom: 12px; padding: 12px 14px; border-radius: var(--radius-sm); background-color: var(--bg-secondary); border: 1px solid var(--border-subtle); font-size: 0.8rem; color: var(--text-main); line-height: 1.45;">' +
        '<div style="font-weight: 700; margin-bottom: 4px; color: var(--accent-purple-light);">' + GLOSSARY[lastClickedToolTerm].name + '</div>' +
        GLOSSARY[lastClickedToolTerm].text +
        '</div>';
    }

    return card('Muster & Chart Tools', '<span class="period-tag">' + chartP.length + ' Chart · ' + candP.length + ' Kerzen</span>',
      toolbar + infoBoxHtml +
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

  // --- Risk/Reward Berechnung ---
  function rrCompute(A, stock, dir, stopMode, tgtMode) {
    var px = A.px, sup = A.lv.sup, res = A.lv.res, notes = [], stop, tgt, stopType = 'atr', tgtType = 'rr2';
    var mean = stock.analysts && stock.analysts.targets && stock.analysts.targets.mean;
    var isLong = dir !== 'short';

    if (isLong) {
      var stopSup = sup ? sup.p * 0.985 : null, stopAtr = px - 2 * A.atr;
      if (stopMode === 'support' && stopSup && px - stopSup >= 0.8 * A.atr) { stop = stopSup; stopType = 'struct'; }
      else { stop = stopAtr; if (stopMode === 'support') notes.push(sup ? 'Unterstützung liegt zu nah, Stop daher 2× ATR.' : 'Keine Unterstützung erkennbar, Stop daher 2× ATR.'); }

      if (tgtMode === 'resistance' && res) { tgt = res.p; tgtType = 'struct'; }
      else if (tgtMode === 'analyst' && mean && mean > px) { tgt = mean; tgtType = 'analyst'; }
      else { tgt = px + 2 * (px - stop); if (tgtMode !== 'rr2') notes.push(tgtMode === 'resistance' ? 'Kein Widerstand erkennbar, Ziel daher CRV 2:1.' : 'Kein Analystenziel über dem Kurs, Ziel daher CRV 2:1.'); }
    } else {
      var stopRes = res ? res.p * 1.015 : null, stopAtrShort = px + 2 * A.atr;
      if (stopMode === 'support' && stopRes && stopRes - px >= 0.8 * A.atr) { stop = stopRes; stopType = 'struct'; }
      else { stop = stopAtrShort; if (stopMode === 'support') notes.push(res ? 'Widerstand liegt zu nah, Stop daher 2× ATR.' : 'Kein Widerstand erkennbar, Stop daher 2× ATR.'); }

      if (tgtMode === 'resistance' && sup) { tgt = sup.p; tgtType = 'struct'; }
      else if (tgtMode === 'analyst' && mean && mean < px) { tgt = mean; tgtType = 'analyst'; }
      else { tgt = px - 2 * (stop - px); if (tgtMode !== 'rr2') notes.push(tgtMode === 'resistance' ? 'Keine Unterstützung erkennbar, Ziel daher CRV 2:1.' : 'Kein Analystenziel unter dem Kurs, Ziel daher CRV 2:1.'); }
    }

    var risk = isLong ? px - stop : stop - px;
    var reward = isLong ? tgt - px : px - tgt;
    var crv = risk > 0 ? reward / risk : 0;
    var sharesRisk = risk > 0 ? Math.floor((ui.capital * ui.risk / 100) / risk) : 0;
    var sharesCap = px > 0 ? Math.floor(ui.capital / px) : 0;
    var shares = Math.min(sharesRisk, sharesCap);

    return { isLong: isLong, stop: stop, tgt: tgt, risk: risk, reward: reward, crv: crv, shares: shares, sharesRisk: sharesRisk, sharesCap: sharesCap, capped: sharesRisk > sharesCap, notes: notes, stopType: stopType, tgtType: tgtType };
  }

  function rrCalc(A, stock) { return rrCompute(A, stock, ui.tradeDir, ui.stop, ui.target); }
  function trendFit(A, isLong) { return isLong ? A.score - 50 : 50 - A.score; }

  function comboScore(A, R) {
    var s = Math.min(R.crv, 3) + trendFit(A, R.isLong) / 25;
    if (R.stopType === 'struct') s += 0.25;
    if (R.tgtType === 'struct') s += 0.25; else if (R.tgtType === 'analyst') s += 0.15;
    if (A.atr > 0) {
      s -= Math.min(2, Math.max(0, R.reward / A.atr - 6) * 0.25);
      s -= Math.min(1, Math.max(0, R.risk / A.atr - 4) * 0.2);
    }
    return s;
  }

  function rankCombos(A, stock, dir) {
    var out = [];
    ['support', 'atr'].forEach(function (st) {
      ['resistance', 'analyst', 'rr2'].forEach(function (tg) {
        var R = rrCompute(A, stock, dir, st, tg);
        if (R.notes.length || !(R.risk > 0)) return;
        out.push({ dir: dir, stop: st, target: tg, R: R, score: comboScore(A, R) });
      });
    });
    return out.sort(function (a, b) { return b.score - a.score; });
  }

  function stopLabel(isLong, t) { return t === 'atr' ? '2× ATR' : (isLong ? 'Unterstützung' : 'Widerstand'); }
  function targetLabel(isLong, t) { return t === 'analyst' ? 'Analystenziel' : t === 'rr2' ? 'CRV 2:1' : (isLong ? 'Widerstand' : 'Unterstützung'); }

  function explainBox(A, R, cur) {
    var fit = trendFit(A, R.isLong), li = [];
    var fitTxt = fit >= 10 ? 'passt zum Chart-Trend' : fit <= -10 ? 'läuft gegen den Chart-Trend – das erhöht das Risiko' : 'Chart ist ohne klare Richtung';
    li.push('<b>' + (R.isLong ? 'Long' : 'Short') + ':</b> ' + (R.isLong ? 'Du setzt auf steigende Kurse.' : 'Du setzt auf fallende Kurse.') + ' Das ' + fitTxt + ' (Chart-Score ' + A.score + '/100).');

    var stopPct = num(Math.abs(R.stop / A.px - 1) * 100, 1), stopAtr = num(R.risk / A.atr, 1);
    li.push('<b>Stop ' + eur(R.stop, cur) + ':</b> ' + (R.stopType === 'struct'
      ? (R.isLong ? 'knapp unter der Unterstützung' : 'knapp über dem Widerstand') + (R.isLong ? ' – bricht der Kurs dort nach unten durch, ist die Idee widerlegt.' : ' – bricht der Kurs dort nach oben aus, ist die Idee widerlegt.')
      : 'zwei typische Tagesschwankungen (ATR) vom Einstieg entfernt.') + ' Abstand ' + stopPct + ' % (' + stopAtr + '× ATR)' + (R.risk / A.atr > 4 ? ' – das ist weit, die Position wird entsprechend klein.' : '.'));

    var tgtPct = num(Math.abs(R.tgt / A.px - 1) * 100, 1);
    li.push('<b>Ziel ' + eur(R.tgt, cur) + ':</b> ' + (R.tgtType === 'struct'
      ? (R.isLong ? 'am nächsten Widerstand, dort drehen Kurse oft ab.' : 'an der nächsten Unterstützung, dort fangen Kurse sich oft.')
      : R.tgtType === 'analyst' ? 'durchschnittliches Analystenziel.'
      : 'rechnerisch das Doppelte des Risikos, ohne Chart-Level dahinter.') + ' Entfernung ' + tgtPct + ' %.');

    var be = num(100 / (1 + R.crv), 0);
    li.push('<b>CRV ' + num(R.crv, 2) + ':</b> ' + (R.crv < 1
      ? 'Du riskierst mehr, als du gewinnen kannst – du müsstest in über ' + be + ' % der Trades richtig liegen, um nicht draufzuzahlen.'
      : R.crv >= 2 ? 'Gutes Verhältnis – schon ab ca. ' + be + ' % Trefferquote bist du im Plus.'
      : 'Akzeptabel – Break-even bei ca. ' + be + ' % Trefferquote.'));

    return '<div style="margin-top:12px;padding:12px 14px;border-radius:var(--radius-sm);background-color:var(--bg-secondary);border:1px solid var(--border-subtle);font-size:.78rem;line-height:1.45;color:var(--text-main);">' +
      '<div style="font-weight:700;margin-bottom:6px;color:var(--accent-purple-light);">Deine Auswahl erklärt</div>' +
      li.map(function (t) { return '<div style="margin-bottom:5px;">' + t + '</div>'; }).join('') + '</div>';
  }

  function recommendBox(A, stock, R, cur) {
    var bl = rankCombos(A, stock, 'long')[0], bs = rankCombos(A, stock, 'short')[0];
    var best = !bs || (bl && bl.score >= bs.score) ? bl : bs;
    if (!best) return '';
    var sameDir = best.dir === (R.isLong ? 'long' : 'short');
    var isLong = best.dir === 'long', B = best.R;

    function desc(c) {
      var il = c.dir === 'long';
      return '<b>' + (il ? 'Long' : 'Short') + ' · Stop: ' + stopLabel(il, c.stop) + ' · Ziel: ' + targetLabel(il, c.target) + '</b><br>' +
        'Einstieg ' + eur(A.px, cur) + ' · Stop ' + eur(c.R.stop, cur) + ' · Ziel ' + eur(c.R.tgt, cur) + ' · CRV ' + num(c.R.crv, 2);
    }
    function isCurrent(c) { return c.dir === (R.isLong ? 'long' : 'short') && c.stop === ui.stop && c.target === ui.target; }

    var why;
    if (B.crv < 1) why = 'Kein Setup überzeugt: selbst die beste Kombination hat nur CRV ' + num(B.crv, 2) + '. Abwarten oder einen besseren Einstiegskurs ist hier oft sinnvoller.';
    else {
      var fit = trendFit(A, isLong);
      why = 'Beste Mischung aus CRV ' + num(B.crv, 2) + (fit >= 10 ? ' und passender Trendlage.' : fit <= -10 ? ' (Achtung: gegen den Chart-Trend).' : ' bei neutralem Chart.') +
        (B.stopType === 'struct' && B.tgtType === 'struct' ? ' Stop und Ziel liegen an echten Chart-Leveln.' : '');
    }

    var html = '<div style="margin-top:6px;">' + desc(best) + '</div><div style="margin-top:5px;color:var(--text-dim);">' + why + '</div>';

    if (isCurrent(best)) html += '<div style="margin-top:6px;color:var(--bullish);">✓ Entspricht bereits deiner Auswahl.</div>';
    else html += '<button class="pill-btn" id="ca-apply-rec" data-dir="' + best.dir + '" data-stop="' + best.stop + '" data-target="' + best.target + '" style="margin-top:8px;">Empfehlung übernehmen</button>';

    if (!sameDir) {
      var mine = rankCombos(A, stock, R.isLong ? 'long' : 'short')[0];
      if (mine && !isCurrent(mine)) html += '<div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--border-subtle);">Falls du bei ' + (R.isLong ? 'Long' : 'Short') + ' bleiben willst:<br>' + desc(mine) +
        '<br><button class="pill-btn" id="ca-apply-rec2" data-dir="' + mine.dir + '" data-stop="' + mine.stop + '" data-target="' + mine.target + '" style="margin-top:8px;">Diese übernehmen</button></div>';
    }

    return '<div style="margin-top:10px;padding:12px 14px;border-radius:var(--radius-sm);background-color:var(--bg-secondary);border:1px solid var(--border-subtle);font-size:.78rem;line-height:1.45;color:var(--text-main);">' +
      '<div style="font-weight:700;color:var(--accent-purple-light);">Empfehlung für diese Aktie</div>' + html + '</div>';
  }

  function rrCard(A, stock, cur) {
    var R = rrCalc(A, stock);
    var col = R.crv >= 2 ? 'var(--bullish)' : R.crv >= 1 ? '#f59e0b' : 'var(--bearish)';
    var inp = 'style="width:84px;background:var(--bg-card,#111);color:inherit;border:1px solid var(--border-color,#333);border-radius:8px;padding:4px 6px;"';
    
    var dirPills = '<div class="pill-group" style="margin-bottom:8px;">' + pill('tradeDir:long', 'Long (Kauf)', R.isLong) + pill('tradeDir:short', 'Short (Verkauf)', !R.isLong) + '</div>';
    
    var body = '<div style="font-size:.72rem;color:var(--text-dim);margin-bottom:4px;">Richtung</div>' + dirPills +
      '<div style="font-size:.72rem;color:var(--text-dim);margin-bottom:4px;">Stop Loss Level</div><div class="pill-group" style="margin-bottom:8px;">' + pill('stop:support', R.isLong ? 'Unterstützung' : 'Widerstand', ui.stop === 'support') + pill('stop:atr', '2× ATR', ui.stop === 'atr') + '</div>' +
      '<div style="font-size:.72rem;color:var(--text-dim);margin-bottom:4px;">Take Profit Ziel</div><div class="pill-group" style="margin-bottom:8px;">' + pill('target:resistance', R.isLong ? 'Widerstand' : 'Unterstützung', ui.target === 'resistance') + pill('target:analyst', 'Analystenziel', ui.target === 'analyst') + pill('target:rr2', 'CRV 2:1', ui.target === 'rr2') + '</div>';
    
    var totalRange = R.risk + R.reward;
    var riskPct = totalRange > 0 ? (R.risk / totalRange) * 100 : 33;
    var rewardPct = totalRange > 0 ? (R.reward / totalRange) * 100 : 66;
    
    var visualBar = '<div style="display:flex; height:6px; border-radius:3px; overflow:hidden; margin: 12px 0;">' +
      '<div style="width:' + (R.isLong ? riskPct : rewardPct) + '%; background:' + (R.isLong ? 'var(--bearish)' : 'var(--bullish)') + ';"></div>' +
      '<div style="width:2px; background:var(--text-main);"></div>' +
      '<div style="width:' + (R.isLong ? rewardPct : riskPct) + '%; background:' + (R.isLong ? 'var(--bullish)' : 'var(--bearish)') + ';"></div>' +
      '</div>';

    var resultList = '<div class="chart-signal-list">' +
      row('var(--bullish)', 'Ziel: <b>' + eur(R.tgt, cur) + '</b> (' + (R.isLong ? '+' : '-') + num(Math.abs(R.tgt / A.px - 1) * 100, 1) + ' %)') +
      row('var(--text-main)', 'Einstieg: <b>' + eur(A.px, cur) + '</b>') +
      row('var(--bearish)', 'Stop: <b>' + eur(R.stop, cur) + '</b> (' + (R.isLong ? '-' : '+') + num(Math.abs(R.stop / A.px - 1) * 100, 1) + ' %)') +
      row(col, termLink('CRV') + ': <b>' + num(R.crv, 2) + '</b>', R.crv < 1 ? 'Das Risiko ist größer als die Chance.' : R.crv >= 2 ? 'Optimales Setup (>= 2:1)' : 'Akzeptables Setup (1:1 bis 2:1)') + 
      '</div>';

    var calcHtml = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0 8px 0;font-size:.78rem;">Kapital <input id="ca-cap" type="number" inputmode="decimal" min="0" value="' + ui.capital + '" ' + inp + '> Risiko <input id="ca-risk" type="number" inputmode="decimal" min="0.1" step="0.1" value="' + ui.risk + '" ' + inp + '> %</div>' +
      '<div class="chart-signal-value">' + (R.shares > 0 ? 'Ergebnis: <b>' + R.shares + ' Stück</b> (Position: ' + eur(R.shares * A.px, cur) + ').<br>Max Verlust ≈ ' + eur(R.shares * R.risk, cur) + ' · Möglicher Gewinn ≈ ' + eur(R.shares * R.reward, cur) + '.' : (R.sharesCap < 1 ? 'Dein Kapital reicht nicht für eine ganze Aktie (Kurs ' + eur(A.px, cur) + ').' : 'Mit diesen Angaben ergibt sich keine ganze Stückzahl.')) + '</div>' +
      (R.capped ? '<div style="font-size:.72rem;color:var(--text-dim);margin-top:6px;">Begrenzt durch dein Kapital. Nach dem Risiko-Budget wären es ' + R.sharesRisk + ' Stück (Position ' + eur(R.sharesRisk * A.px, cur) + '). Der mögliche Verlust liegt deshalb unter deinen ' + num(ui.risk, 1) + ' % Risiko.</div>' : '');
      
    var notesHtml = R.notes.length ? '<div style="font-size:.72rem;color:var(--text-dim);margin-top:8px;">' + R.notes.join(' ') + '</div>' : '';

    return card('Risk/Reward Rechner', '<span class="period-tag">CRV ' + num(R.crv, 1) + '</span>', body + visualBar + resultList + calcHtml + notesHtml + explainBox(A, R, cur) + recommendBox(A, stock, R, cur) + NOTE);
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
    
    if (ui.sr && A.lv && A.lv.all) {
      A.lv.all.forEach(function(lvl) {
        var isSup = lvl.p < A.px;
        var touches = lvl.n;
        var isStrong = touches >= 4;
        var isMedium = touches === 3;
        
        var alpha = isStrong ? 0.9 : (isMedium ? 0.5 : 0.25);
        var w = isStrong ? 2.5 : (isMedium ? 1.5 : 1);
        
        g.lineWidth = w;
        g.setLineDash(isStrong ? [] : (isMedium ? [4, 4] : [2, 6]));
        
        g.strokeStyle = isSup ? 'rgba(16,185,129,' + alpha + ')' : 'rgba(239,68,68,' + alpha + ')';
        g.beginPath(); g.moveTo(L, y(lvl.p)); g.lineTo(W - R, y(lvl.p)); g.stroke();
      });
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
    slot.innerHTML = scoreCard(A) + cycleCard(A) + patternsCard(A, cur) + signalsCard(A, cur) + rrCard(A, stock, cur);
    
    var newToolbar = slot.querySelector('#ca-tools-toolbar');
    if (newToolbar && savedScroll > 0) newToolbar.scrollLeft = savedScroll;
    
    bindTerms(slot);
    draw(slot.querySelector('#ca-canvas'), A);
    var cycCanvas = slot.querySelector('#ca-cycle-canvas'), cycData = getCyclePhase(A);
    if (cycCanvas && cycData) renderCycleChart(cycCanvas, cycData, A);
    
    [].forEach.call(slot.querySelectorAll('.ca-btn'), function (b) {
      b.onclick = function (e) {
        if (e.target && e.target.closest('.term-link')) return; 
        var k = b.getAttribute('data-k'), p = k.split(':');
        var termKey = b.getAttribute('data-term');

        if (p.length === 2) {
          ui[p[0]] = p[1];
          lastClickedToolTerm = null;
        } else {
          ui[k] = !ui[k];
          if (termKey) { lastClickedToolTerm = ui[k] ? termKey : null; } 
          else { lastClickedToolTerm = null; }
        }
        saveUi();
        mount(slot, stock, period);
      };
    });
    
    function num2(id, key, min) {
      var el = slot.querySelector(id);
      if (el) el.onchange = function () { var v = parseFloat(String(el.value).replace(',', '.')); if (isFinite(v) && v >= min) { ui[key] = v; saveUi(); mount(slot, stock, period); } };
    }
    num2('#ca-cap', 'capital', 1); num2('#ca-risk', 'risk', 0.1);

    ['#ca-apply-rec', '#ca-apply-rec2'].forEach(function (id) {
      var btn = slot.querySelector(id);
      if (btn) btn.onclick = function () {
        ui.tradeDir = btn.getAttribute('data-dir');
        ui.stop = btn.getAttribute('data-stop');
        ui.target = btn.getAttribute('data-target');
        lastClickedToolTerm = null;
        saveUi();
        mount(slot, stock, period);
      };
    });
  }

  function promptText(stock) {
    var A = null;
    try { A = analyse(stock, '6M'); } catch (e) { return ''; }
    if (!A) return '';
    var cur = (stock.quote && stock.quote.currency) || 'EUR', s = 'Chart-Analyse: Score ' + A.score + '/100 (' + BIAS_TXT[A.label] + ')';
    
    var cp = getCyclePhase(A);
    if (cp) s += '; Marktzyklus-Phase: ' + cp.phase + ' (' + cp.facts + ')';
    
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
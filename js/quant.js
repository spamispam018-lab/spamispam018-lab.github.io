/**
 * js/quant.js
 * Gemeinsame Kennzahlen-Mathematik für Risiko-Tab und Strategie-Backtest:
 * Renditen, Volatilität, Drawdown, VaR/CVaR, Sharpe/Sortino, Beta,
 * Indikatoren (SMA, RSI) und die Backtest-Engine für Einzelaktien-Strategien.
 *
 * Alles läuft lokal im Browser auf den vorhandenen Kursdaten (chartHistory / long/*.json).
 */

window.App = window.App || {};

window.App.Quant = (function () {
  'use strict';

  var TD = 252;       // Handelstage pro Jahr
  var RF = 0.02;      // Risikofreier Zins für Sharpe/Sortino (wie im Screener-Backtest)

  /* ---------- Grundlagen ---------- */
  function mean(a) {
    if (!a.length) return 0;
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }

  function std(a) {                                  // Stichproben-Standardabweichung
    if (a.length < 2) return 0;
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / (a.length - 1));
  }

  function quantile(sortedAsc, q) {
    if (!sortedAsc.length) return 0;
    var pos = (sortedAsc.length - 1) * q;
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
  }

  /** Bereinigt eine Kurshistorie: gültige Punkte, aufsteigend nach Datum, ohne Duplikate. */
  function cleanHistory(hist) {
    var seen = {}, out = [];
    (hist || []).forEach(function (p) {
      if (!p || !p.date || !(Number(p.close) > 0) || seen[p.date]) return;
      seen[p.date] = true;
      out.push({ date: p.date, close: Number(p.close) });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  /** Schneidet die letzten `years` Jahre aus einer (bereinigten) Historie. null = alles. */
  function sliceYears(hist, years) {
    if (!years || !hist.length) return hist;
    var last = new Date(hist[hist.length - 1].date + 'T00:00:00');
    last.setDate(last.getDate() - Math.round(years * 365.25));
    var cut = last.toISOString().slice(0, 10);
    var out = hist.filter(function (p) { return p.date >= cut; });
    return out.length > 1 ? out : hist;
  }

  /** Spannweite der Historie in Jahren. */
  function spanYears(hist) {
    if (hist.length < 2) return 0;
    var a = new Date(hist[0].date + 'T00:00:00'), b = new Date(hist[hist.length - 1].date + 'T00:00:00');
    return (b - a) / (365.25 * 86400000);
  }

  function returns(closes) {
    var out = [];
    for (var i = 1; i < closes.length; i++) out.push(closes[i] / closes[i - 1] - 1);
    return out;
  }

  function cagr(startVal, endVal, years) {
    if (!(startVal > 0) || !(endVal > 0) || !(years > 0.05)) return null;
    return Math.pow(endVal / startVal, 1 / years) - 1;
  }

  /* ---------- Risiko-Kennzahlen ---------- */
  function annualVol(rets) { return std(rets) * Math.sqrt(TD); }

  function sharpe(rets) {
    var s = std(rets);
    return s > 0 ? (mean(rets) * TD - RF) / (s * Math.sqrt(TD)) : null;
  }

  function sortino(rets) {
    if (!rets.length) return null;
    var dailyRf = RF / TD, ss = 0;
    for (var i = 0; i < rets.length; i++) {
      var d = Math.min(0, rets[i] - dailyRf);
      ss += d * d;
    }
    var dd = Math.sqrt(ss / rets.length) * Math.sqrt(TD);
    return dd > 0 ? (mean(rets) * TD - RF) / dd : null;
  }

  /** Historischer Value at Risk: Verlust (positiv, als Anteil), der an (1-conf) der Tage überschritten wurde. */
  function varHist(rets, conf) {
    if (rets.length < 20) return null;
    var sorted = rets.slice().sort(function (a, b) { return a - b; });
    return Math.max(0, -quantile(sorted, 1 - conf));
  }

  /** Expected Shortfall (CVaR): Ø-Verlust an den Tagen, die schlechter als der VaR waren. */
  function cvarHist(rets, conf) {
    if (rets.length < 20) return null;
    var sorted = rets.slice().sort(function (a, b) { return a - b; });
    var q = quantile(sorted, 1 - conf);
    var tail = sorted.filter(function (r) { return r <= q; });
    return tail.length ? Math.max(0, -mean(tail)) : null;
  }

  /** Drawdown-Reihe in Prozent (≤ 0) plus Kennzahlen zum maximalen Drawdown. */
  function drawdown(closes, dates) {
    var peak = closes[0], peakIdx = 0, series = [], mdd = 0, mddPeak = 0, mddTrough = 0;
    for (var i = 0; i < closes.length; i++) {
      if (closes[i] > peak) { peak = closes[i]; peakIdx = i; }
      var dd = (closes[i] / peak - 1) * 100;
      series.push(dd);
      if (dd < mdd) { mdd = dd; mddPeak = peakIdx; mddTrough = i; }
    }
    var recovery = null;
    for (var j = mddTrough + 1; j < closes.length; j++) {
      if (closes[j] >= closes[mddPeak]) { recovery = dates[j]; break; }
    }
    return {
      series: series,
      maxDD: mdd,
      peakDate: dates[mddPeak],
      troughDate: dates[mddTrough],
      recoveryDate: recovery,
      current: series[series.length - 1] || 0
    };
  }

  /** Richtet zwei Historien nach gemeinsamen Datumsangaben aus und liefert deren Tagesrenditen. */
  function alignedReturns(histA, histB) {
    var mapB = {};
    histB.forEach(function (p) { mapB[p.date] = p.close; });
    var a = [], b = [];
    histA.forEach(function (p) {
      if (mapB[p.date] > 0) { a.push(p.close); b.push(mapB[p.date]); }
    });
    return { a: returns(a), b: returns(b), n: a.length };
  }

  /** Beta und Korrelation von Renditereihe a gegenüber b. */
  function betaCorr(ra, rb) {
    var n = Math.min(ra.length, rb.length);
    if (n < 30) return { beta: null, corr: null };
    ra = ra.slice(-n); rb = rb.slice(-n);
    var ma = mean(ra), mb = mean(rb), cov = 0, vb = 0, va = 0;
    for (var i = 0; i < n; i++) {
      cov += (ra[i] - ma) * (rb[i] - mb);
      vb += (rb[i] - mb) * (rb[i] - mb);
      va += (ra[i] - ma) * (ra[i] - ma);
    }
    if (vb === 0 || va === 0) return { beta: null, corr: null };
    return { beta: cov / vb, corr: cov / Math.sqrt(va * vb) };
  }

  /** Histogramm der Tagesrenditen (in %), Klassen symmetrisch um 0, Randklassen sammeln Ausreißer. */
  function histogram(rets, binWidth, halfBins) {
    var bins = [], counts = [];
    for (var k = -halfBins; k <= halfBins; k++) { bins.push(k * binWidth); counts.push(0); }
    rets.forEach(function (r) {
      var idx = Math.round((r * 100) / binWidth) + halfBins;
      idx = Math.max(0, Math.min(bins.length - 1, idx));
      counts[idx]++;
    });
    return { bins: bins, counts: counts };
  }

  /* ---------- Indikatoren ---------- */
  function sma(vals, n) {
    var out = new Array(vals.length), sum = 0;
    for (var i = 0; i < vals.length; i++) {
      sum += vals[i];
      if (i >= n) sum -= vals[i - n];
      out[i] = i >= n - 1 ? sum / n : null;
    }
    return out;
  }

  function rsi(vals, n) {                            // Wilder-Glättung
    var out = new Array(vals.length), gain = 0, loss = 0, i;
    for (i = 0; i < vals.length; i++) out[i] = null;
    if (vals.length <= n) return out;
    for (i = 1; i <= n; i++) {
      var d = vals[i] - vals[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    gain /= n; loss /= n;
    out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    for (i = n + 1; i < vals.length; i++) {
      var dd = vals[i] - vals[i - 1];
      gain = (gain * (n - 1) + (dd > 0 ? dd : 0)) / n;
      loss = (loss * (n - 1) + (dd < 0 ? -dd : 0)) / n;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
    return out;
  }

  /* ---------- Strategien ---------- */
  var STRATEGIES = {
    buyhold: {
      explain: "Du kaufst am Anfang und verkaufst nie. Das ist die Messlatte: Eine aktive Strategie ist nur dann interessant, wenn sie nach Kosten mehr Rendite bringt – oder bei ähnlicher Rendite deutlich kleinere Rückgänge (Drawdowns) hat.",
      label: 'Buy & Hold',
      desc: 'Einmal kaufen und halten – die Vergleichsbasis.',
      params: []
    },
    sma_cross: {
      explain: "SMA = einfacher gleitender Durchschnitt der letzten N Schlusskurse. <strong>Kauf</strong>, wenn der schnelle Durchschnitt (z. B. 50 Tage) den langsamen (z. B. 200 Tage) von unten kreuzt („Golden Cross“); <strong>Verkauf</strong>, wenn er ihn von oben kreuzt („Death Cross“). Stärke: folgt langen Trends und hält Phasen mit starken Kursverlusten oft teilweise fern. Schwäche: reagiert spät und erzeugt in Seitwärtsphasen viele Fehlsignale.",
      label: 'SMA-Crossover',
      desc: 'Long, solange der schnelle Durchschnitt über dem langsamen liegt (Golden/Death Cross).',
      params: [
        { key: 'fast', label: 'Schnell (Tage)', def: 50, min: 2, max: 400 },
        { key: 'slow', label: 'Langsam (Tage)', def: 200, min: 3, max: 600 }
      ]
    },
    price_sma: {
      explain: "<strong>Kauf</strong>, sobald der Schlusskurs über seinem gleitenden Durchschnitt liegt, <strong>Verkauf</strong>, sobald er darunter fällt. Der 200-Tage-Durchschnitt ist die verbreitete Trendlinie. Reagiert schneller als der Crossover (nur eine Linie), wechselt dafür öfter – das kostet Gebühren und bringt mehr Fehlsignale.",
      label: 'Kurs über SMA',
      desc: 'Long, solange der Schlusskurs über seinem gleitenden Durchschnitt liegt.',
      params: [{ key: 'n', label: 'SMA (Tage)', def: 200, min: 5, max: 600 }]
    },
    rsi_revert: {
      explain: "Der RSI (0–100) misst, wie stark die Kurse zuletzt gestiegen oder gefallen sind; unter 30 gilt eine Aktie als „überverkauft“. <strong>Kauf</strong>, wenn der RSI unter die Kauf-Schwelle fällt, <strong>Verkauf</strong>, wenn er über die Verkaufs-Schwelle steigt. Das ist eine Gegenstrategie: Sie setzt auf die Rückkehr zum Mittelwert. Stärke: passt zu Seitwärtsmärkten. Schwäche: In anhaltenden Abwärtstrends kauft sie zu früh („fallendes Messer“), und oft ist sie lange gar nicht investiert.",
      label: 'RSI Mean-Reversion',
      desc: 'Kauft überverkaufte Phasen (RSI unter Kauf-Schwelle), verkauft bei Erholung (RSI über Verkaufs-Schwelle).',
      params: [
        { key: 'n', label: 'RSI-Periode', def: 14, min: 2, max: 60 },
        { key: 'lo', label: 'Kaufen unter', def: 30, min: 5, max: 50 },
        { key: 'hi', label: 'Verkaufen über', def: 55, min: 40, max: 95 }
      ]
    },
    breakout: {
      explain: "Donchian-Kanal: <strong>Kauf</strong> bei einem neuen Schlusshoch der letzten N Tage (Ausbruch), <strong>Verkauf</strong> bei einem neuen Schlusstief der letzten M Tage. Klassische Trendfolge (nach diesem Muster handelten auch die „Turtle Traders“). Stärke: erwischt große Trends. Schwäche: viele kleine Verluste bei falschen Ausbrüchen, und der Einstieg erfolgt erst nach einem deutlichen Anstieg.",
      label: 'Breakout (Donchian)',
      desc: 'Kauft bei neuem N-Tage-Schlusshoch, verkauft bei neuem M-Tage-Schlusstief.',
      params: [
        { key: 'up', label: 'Einstieg: Hoch (Tage)', def: 55, min: 5, max: 300 },
        { key: 'down', label: 'Ausstieg: Tief (Tage)', def: 20, min: 3, max: 200 }
      ]
    },
    momentum: {
      explain: "Idee: Was zuletzt gestiegen ist, steigt tendenziell noch eine Weile weiter. Die Strategie ist <strong>investiert</strong>, solange die Rendite der letzten N Tage (126 Tage ≈ 6 Monate) positiv ist, sonst in Cash. Stärke: einfach und meidet längere Abwärtsphasen. Schwäche: reagiert mit Verzögerung auf Trendwenden und kann bei schnellen Umschwüngen zweimal verlieren.",
      label: 'Momentum',
      desc: 'Long, solange die Rendite der letzten N Tage positiv ist.',
      params: [{ key: 'n', label: 'Rückblick (Tage)', def: 126, min: 10, max: 400 }]
    },
    ema_cross: {
      explain: "Der EMA (exponentieller gleitender Durchschnitt) gewichtet neuere Kurse stärker als ältere und reagiert dadurch schneller als der SMA. <strong>Kauf</strong>, wenn der schnelle EMA über den langsamen steigt, <strong>Verkauf</strong>, wenn er darunter fällt. Stärke: früherer Einstieg bei Trendwenden. Schwäche: Mehr Fehlsignale und mehr Trades als beim SMA, vor allem in Seitwärtsphasen.",
      label: "EMA-Crossover",
      desc: "Wie der SMA-Crossover, aber mit exponentiellen Durchschnitten, die neuere Kurse stärker gewichten.",
      params: [
        { key: "fast", label: "Schnell (Tage)", def: 12, min: 2, max: 300 },
        { key: "slow", label: "Langsam (Tage)", def: 26, min: 3, max: 500 }
      ]
    },
    macd: {
      explain: "MACD = EMA(schnell) minus EMA(langsam), meist 12 und 26 Tage; die Signallinie ist ein EMA des MACD (meist 9 Tage). <strong>Long</strong>, solange der MACD über der Signallinie liegt, sonst Cash. Er misst Richtung und Stärke des Trends. Stärke: erkennt Trendwechsel relativ früh. Schwäche: viele Wechsel in Seitwärtsmärkten, Signale kommen oft nach dem Großteil der Bewegung.",
      label: "MACD-Signal",
      desc: "Long, solange die MACD-Linie über ihrer Signallinie liegt.",
      params: [
        { key: "fast", label: "Schnell (Tage)", def: 12, min: 2, max: 100 },
        { key: "slow", label: "Langsam (Tage)", def: 26, min: 3, max: 200 },
        { key: "signal", label: "Signal (Tage)", def: 9, min: 2, max: 50 }
      ]
    },
    bollinger: {
      explain: "Die Bollinger-Bänder liegen k Standardabweichungen über und unter dem N-Tage-Durchschnitt. <strong>Kauf</strong>, wenn der Schlusskurs unter das untere Band fällt (ungewöhnlich tief), <strong>Verkauf</strong>, sobald er den Durchschnitt (die Mitte) wieder erreicht. Gegenstrategie auf kurzfristige Übertreibungen. Stärke: passt zu Seitwärtsmärkten und schwankenden Titeln. Schwäche: In starken Abwärtstrends kauft sie zu früh und hält lange Verlierer.",
      label: "Bollinger Mean-Reversion",
      desc: "Kauft Kurse weit unter ihrem Durchschnitt, verkauft bei Rückkehr zur Mitte.",
      params: [
        { key: "n", label: "Fenster (Tage)", def: 20, min: 5, max: 100 },
        { key: "k", label: "Abstand (Std.-Abw.)", def: 2, min: 0.5, max: 4, float: true, step: 0.5 }
      ]
    },
    dip_trend: {
      explain: "Kombination aus Trend und Gegenbewegung (angelehnt an die „RSI(2)“-Strategie von Larry Connors): Nur wenn der Kurs über seinem langen Durchschnitt liegt (Aufwärtstrend), wird bei einem sehr niedrigen kurzfristigen RSI gekauft. <strong>Verkauf</strong>, sobald der Kurs über einen kurzen Durchschnitt (z. B. 5 Tage) steigt oder der Trend bricht. Stärke: kurze Haltedauer, kaufen in den Trend hinein. Schwäche: viele kleine Gewinne, einzelne große Verluste, wenn der Rücksetzer der Beginn einer Abwärtsphase ist.",
      label: "RSI-Rücksetzer im Aufwärtstrend",
      desc: "Kauft kurze, tiefe Rücksetzer – aber nur, solange der langfristige Trend noch intakt ist.",
      params: [
        { key: "trend", label: "Trend-SMA (Tage)", def: 200, min: 20, max: 400 },
        { key: "n", label: "RSI-Periode", def: 2, min: 2, max: 14 },
        { key: "lo", label: "Kaufen unter RSI", def: 10, min: 2, max: 40 },
        { key: "exit", label: "Verkauf über SMA (Tage)", def: 5, min: 2, max: 30 }
      ]
    },
    sma_band: {
      explain: "Wie „Kurs über SMA“, nur mit einem Band um den Durchschnitt: <strong>Kauf</strong>, wenn der Kurs mindestens X % <em>über</em> dem SMA schließt, <strong>Verkauf</strong>, wenn er mindestens X % <em>darunter</em> schließt; dazwischen bleibt die Position unverändert. Das verringert Fehlsignale und Handelskosten. Stärke: ruhiger, weniger Trades. Schwäche: Ein- und Ausstieg kommen später, ein Teil der Bewegung geht verloren.",
      label: "Kurs über SMA mit Band",
      desc: "Wie „Kurs über SMA“, aber mit Puffer, damit kleine Ausschläge nicht sofort umschalten.",
      params: [
        { key: "n", label: "SMA (Tage)", def: 200, min: 5, max: 500 },
        { key: "band", label: "Band (%)", def: 2, min: 0.5, max: 15, float: true, step: 0.5 }
      ]
    },
    high52: {
      explain: "Aktien nahe ihrem 52-Wochen-Hoch (252 Handelstage) laufen laut Studien tendenziell weiter. <strong>Long</strong>, solange der Schlusskurs höchstens X % unter dem höchsten Schlusskurs der letzten N Tage liegt, sonst Cash. Stärke: bleibt in starken Trends investiert und steigt bei größeren Rückgängen aus. Schwäche: Ausstieg erst nach einem merklichen Rückgang; in Seitwärtsphasen wechselt die Position oft.",
      label: "Nähe zum Hoch",
      desc: "Long, solange der Kurs nahe seinem Hoch der letzten N Tage liegt.",
      params: [
        { key: "look", label: "Rückblick (Tage)", def: 252, min: 20, max: 500 },
        { key: "within", label: "Maximal unter Hoch (%)", def: 10, min: 1, max: 40, float: true }
      ]
    },
    trailing: {
      explain: "Start investiert. Der <strong>Stop</strong> zieht mit jedem neuen Hoch mit: Fällt der Kurs um X % vom höchsten Schlusskurs seit dem Einstieg, wird verkauft. <strong>Wiedereinstieg</strong>, sobald der Kurs über seinem SMA schließt. Begrenzt große Verluste. Stärke: Schutz vor Crashs, einfach zu verstehen. Schwäche: Ein enger Stop wird bei normalen Schwankungen „ausgestoppt“; nach dem Verkauf wird oft ein Teil der Erholung verpasst.",
      label: "Trailing-Stop",
      desc: "Investiert, bis der Kurs X % vom Hoch fällt; Wiedereinstieg über einem SMA.",
      params: [
        { key: "stop", label: "Stop (% unter Hoch)", def: 15, min: 2, max: 50, float: true },
        { key: "n", label: "Wiedereinstieg: SMA (Tage)", def: 50, min: 5, max: 300 }
      ]
    },
    season: {
      explain: "Die „Halloween-Regel“: Aktien sollen von November bis April besser laufen als von Mai bis Oktober. <strong>Long</strong> ab dem Einstiegsmonat bis einschließlich Monat vor dem Ausstiegsmonat (Standard: Nov = 11 bis Mai = 5, also Nov–Apr), sonst Cash. Kein Kurssignal, nur Kalender. Stärke: wenig Trades, sehr einfach. Schwäche: Der Effekt ist in einzelnen Aktien und Jahren unzuverlässig und kann zufällig sein.",
      label: "Saison (Halloween)",
      desc: "Nur in bestimmten Monaten investiert – klassisch November bis April („Sell in May“).",
      params: [
        { key: "start", label: "Einstiegsmonat (1–12)", def: 11, min: 1, max: 12 },
        { key: "end", label: "Ausstiegsmonat (1–12)", def: 5, min: 1, max: 12 }
      ]
    }
  };


  /** Exponentieller Durchschnitt; Eingabe darf führende null-Werte haben. Start mit dem SMA der ersten n gültigen Werte. */
  function ema(vals, n) {
    var out = new Array(vals.length), i, s = -1;
    for (i = 0; i < vals.length; i++) out[i] = null;
    for (i = 0; i < vals.length; i++) { if (vals[i] != null) { s = i; break; } }
    if (s < 0 || vals.length - s < n) return out;
    var sum = 0, k = 2 / (n + 1);
    for (i = s; i < s + n; i++) sum += vals[i];
    out[s + n - 1] = sum / n;
    for (i = s + n; i < vals.length; i++) out[i] = vals[i] * k + out[i - 1] * (1 - k);
    return out;
  }

  /** Rollender Durchschnitt und Standardabweichung (Stichprobe) über n Werte. */
  function rollingMeanStd(vals, n) {
    var mean_ = new Array(vals.length), sd = new Array(vals.length);
    for (var i = 0; i < vals.length; i++) {
      if (i < n - 1) { mean_[i] = null; sd[i] = null; continue; }
      var m = 0, a, v = 0;
      for (a = i - n + 1; a <= i; a++) m += vals[a];
      m /= n;
      for (a = i - n + 1; a <= i; a++) v += (vals[a] - m) * (vals[a] - m);
      mean_[i] = m; sd[i] = Math.sqrt(v / (n - 1));
    }
    return { mean: mean_, sd: sd };
  }

  /** Prüft Parameter auf unsinnige Kombinationen; liefert eine Meldung oder null. */
  function validateParams(type, p) {
    if ((type === 'sma_cross' || type === 'ema_cross' || type === 'macd') && p.fast >= p.slow) return 'Der schnelle Durchschnitt muss kürzer sein als der langsame.';
    if (type === 'breakout' && p.down >= p.up) return 'Das Ausstiegs-Fenster muss kürzer sein als das Einstiegs-Fenster.';
    if (type === 'rsi_revert' && p.lo >= p.hi) return 'Die Kauf-Schwelle muss unter der Verkaufs-Schwelle liegen.';
    if (type === 'season' && p.start === p.end) return 'Einstiegs- und Ausstiegsmonat dürfen nicht gleich sein.';
    return null;
  }

  function defaultParams(type) {
    var o = {};
    ((STRATEGIES[type] || {}).params || []).forEach(function (p) { o[p.key] = p.def; });
    return o;
  }

  /** Liefert je Handelstag das Zielsignal (1 = investiert, 0 = Cash) nach Schlusskurs des Tages. */
  function computeSignals(closes, type, p, dates) {
    var n = closes.length, sig = new Array(n), i;
    for (i = 0; i < n; i++) sig[i] = 0;

    if (type === 'buyhold') {
      for (i = 0; i < n; i++) sig[i] = 1;
    } else if (type === 'sma_cross') {
      var f = sma(closes, p.fast), s = sma(closes, p.slow);
      for (i = 0; i < n; i++) sig[i] = (f[i] != null && s[i] != null && f[i] > s[i]) ? 1 : 0;
    } else if (type === 'price_sma') {
      var m = sma(closes, p.n);
      for (i = 0; i < n; i++) sig[i] = (m[i] != null && closes[i] > m[i]) ? 1 : 0;
    } else if (type === 'rsi_revert') {
      var r = rsi(closes, p.n), pos = 0;
      for (i = 0; i < n; i++) {
        if (r[i] == null) { sig[i] = 0; continue; }
        if (pos === 0 && r[i] < p.lo) pos = 1;
        else if (pos === 1 && r[i] > p.hi) pos = 0;
        sig[i] = pos;
      }
    } else if (type === 'breakout') {
      var pos2 = 0;
      for (i = 0; i < n; i++) {
        if (pos2 === 0 && i >= p.up) {
          var hi = -Infinity;
          for (var a = i - p.up; a < i; a++) if (closes[a] > hi) hi = closes[a];
          if (closes[i] > hi) pos2 = 1;
        } else if (pos2 === 1 && i >= p.down) {
          var lo = Infinity;
          for (var b = i - p.down; b < i; b++) if (closes[b] < lo) lo = closes[b];
          if (closes[i] < lo) pos2 = 0;
        }
        sig[i] = pos2;
      }
    } else if (type === 'momentum') {
      for (i = 0; i < n; i++) sig[i] = (i >= p.n && closes[i] / closes[i - p.n] - 1 > 0) ? 1 : 0;
    } else if (type === 'ema_cross') {
      var ef = ema(closes, p.fast), es = ema(closes, p.slow);
      for (i = 0; i < n; i++) sig[i] = (ef[i] != null && es[i] != null && ef[i] > es[i]) ? 1 : 0;
    } else if (type === 'macd') {
      var mf = ema(closes, p.fast), ms = ema(closes, p.slow), line = new Array(n);
      for (i = 0; i < n; i++) line[i] = (mf[i] != null && ms[i] != null) ? mf[i] - ms[i] : null;
      var sg = ema(line, p.signal);
      for (i = 0; i < n; i++) sig[i] = (line[i] != null && sg[i] != null && line[i] > sg[i]) ? 1 : 0;
    } else if (type === 'bollinger') {
      var bb = rollingMeanStd(closes, p.n), pb = 0;
      for (i = 0; i < n; i++) {
        if (bb.mean[i] == null) { sig[i] = 0; continue; }
        if (pb === 0 && closes[i] < bb.mean[i] - p.k * bb.sd[i]) pb = 1;
        else if (pb === 1 && closes[i] >= bb.mean[i]) pb = 0;
        sig[i] = pb;
      }
    } else if (type === 'dip_trend') {
      var tr = sma(closes, p.trend), rs = rsi(closes, p.n), ex = sma(closes, p.exit), pd = 0;
      for (i = 0; i < n; i++) {
        if (tr[i] == null || rs[i] == null) { sig[i] = 0; continue; }
        if (pd === 0 && closes[i] > tr[i] && rs[i] < p.lo) pd = 1;
        else if (pd === 1 && ((ex[i] != null && closes[i] > ex[i]) || closes[i] < tr[i])) pd = 0;
        sig[i] = pd;
      }
    } else if (type === 'sma_band') {
      var sb = sma(closes, p.n), pbd = 0;
      for (i = 0; i < n; i++) {
        if (sb[i] == null) { sig[i] = 0; continue; }
        if (closes[i] > sb[i] * (1 + p.band / 100)) pbd = 1;
        else if (closes[i] < sb[i] * (1 - p.band / 100)) pbd = 0;
        sig[i] = pbd;
      }
    } else if (type === 'high52') {
      for (i = p.look - 1; i < n; i++) {
        var hi52 = -Infinity;
        for (var w = i - p.look + 1; w <= i; w++) if (closes[w] > hi52) hi52 = closes[w];
        sig[i] = closes[i] >= hi52 * (1 - p.within / 100) ? 1 : 0;
      }
    } else if (type === 'trailing') {
      var st = sma(closes, p.n), pt = 1, peak = closes[0];
      for (i = 0; i < n; i++) {
        if (pt === 1) {
          if (closes[i] > peak) peak = closes[i];
          if (closes[i] < peak * (1 - p.stop / 100)) pt = 0;
        } else if (st[i] != null && closes[i] > st[i]) { pt = 1; peak = closes[i]; }
        sig[i] = pt;
      }
    } else if (type === 'season') {
      for (i = 0; i < n; i++) {
        var mo = dates ? Number(String(dates[i]).slice(5, 7)) : 0;
        sig[i] = (p.start <= p.end ? (mo >= p.start && mo < p.end) : (mo >= p.start || mo < p.end)) ? 1 : 0;
      }
    }
    return sig;
  }

  function perfStats(eq, dates, rets) {
    var yrs = (new Date(dates[dates.length - 1] + 'T00:00:00') - new Date(dates[0] + 'T00:00:00')) / (365.25 * 86400000);
    var dd = drawdown(eq, dates);
    var c = cagr(eq[0], eq[eq.length - 1], yrs);
    return {
      totalReturn: (eq[eq.length - 1] / eq[0] - 1) * 100,
      cagr: c == null ? null : c * 100,
      vol: annualVol(rets) * 100,
      maxDD: dd.maxDD,
      sharpe: sharpe(rets),
      calmar: (c != null && dd.maxDD < 0) ? (c * 100) / Math.abs(dd.maxDD) : null
    };
  }

  /**
   * Führt eine Long-only-Strategie auf täglichen Schlusskursen aus.
   * Ausführung: Signal am Schlusskurs von Tag t, Fill am Schlusskurs von Tag t+1 (kein Look-ahead).
   * @param {Array} hist  bereinigte Historie [{date, close}]
   * @param {string} type Strategie-Schlüssel
   * @param {Object} p    Parameter
   * @param {number} fee  Kosten je Kauf/Verkauf als Anteil (0.001 = 0,1 %)
   */
  function backtest(hist, type, p, fee) {
    var n = hist.length;
    if (n < 30) return { error: 'Zu wenig Kursdaten (mindestens 30 Handelstage).' };
    var closes = hist.map(function (h) { return h.close; });
    var dates = hist.map(function (h) { return h.date; });

    var sig = computeSignals(closes, type, p, dates);
    var pos = new Array(n), i;
    for (i = 0; i < n; i++) pos[i] = i >= 2 ? sig[i - 2] : 0;     // 1 Tag Verzögerung bis zum Fill

    var eq = [100], rets = [0], bh = [100, 100 * (1 - fee)];   // B&H steigt wie die Strategien frühestens am 2. Handelstag ein
    for (i = 1; i < n; i++) {
      if (pos[i] !== pos[i - 1]) eq[i - 1] *= (1 - fee);          // Kosten beim Fill
      var r = closes[i] / closes[i - 1] - 1;
      eq.push(eq[i - 1] * (1 + pos[i] * r));
      rets.push(eq[i] / eq[i - 1] - 1);
      if (i >= 2) bh.push(bh[1] * closes[i] / closes[1]);
    }

    // Trades aus den Positionswechseln
    var trades = [], entry = null;
    for (i = 1; i < n; i++) {
      if (pos[i] === 1 && pos[i - 1] === 0) entry = i - 1;
      if (pos[i] === 0 && pos[i - 1] === 1 && entry != null) {
        trades.push(makeTrade(entry, i - 1, false));
        entry = null;
      }
    }
    if (entry != null) trades.push(makeTrade(entry, n - 1, true));

    function makeTrade(e, x, open) {
      var gross = closes[x] / closes[e];
      var net = gross * (1 - fee) * (open ? 1 : (1 - fee)) - 1;
      return { entryDate: dates[e], exitDate: dates[x], entry: closes[e], exit: closes[x], ret: net * 100, days: x - e, open: open };
    }

    var stats = perfStats(eq, dates, rets.slice(1));
    var held = 0;
    for (i = 0; i < n; i++) held += pos[i];
    stats.exposure = held / n * 100;
    stats.trades = trades.length;
    var wins = trades.filter(function (t) { return t.ret > 0; }).length;
    stats.winRate = trades.length ? wins / trades.length * 100 : null;
    stats.avgTrade = trades.length ? mean(trades.map(function (t) { return t.ret; })) : null;
    stats.bestTrade = trades.length ? Math.max.apply(null, trades.map(function (t) { return t.ret; })) : null;
    stats.worstTrade = trades.length ? Math.min.apply(null, trades.map(function (t) { return t.ret; })) : null;

    var bhStats = perfStats(bh, dates, returns(bh));
    bhStats.exposure = 100;

    return {
      dates: dates, equity: eq, buyHold: bh, trades: trades,
      stats: stats, bhStats: bhStats,
      pendingSignal: sig[n - 1] === 1 ? 'long' : 'cash'
    };
  }


  /* ---------- Parameter-Suche ---------- */
  var PARAM_GRIDS = {
    sma_cross: { fast: [10, 20, 30, 40, 50, 60, 80, 100], slow: [50, 80, 100, 120, 150, 200, 250, 300] },
    price_sma: { n: [20, 30, 50, 75, 100, 125, 150, 200, 250, 300] },
    rsi_revert: { n: [7, 14, 21], lo: [20, 25, 30, 35, 40], hi: [50, 55, 60, 65, 70, 75] },
    breakout: { up: [20, 30, 40, 55, 80, 100, 150, 200], down: [10, 15, 20, 30, 40, 50, 75, 100] },
    momentum: { n: [20, 40, 60, 90, 126, 180, 250] },
    ema_cross: { fast: [5, 8, 10, 12, 15, 20, 30, 50], slow: [20, 26, 40, 50, 80, 100, 150, 200] },
    macd: { fast: [8, 10, 12, 16], slow: [20, 24, 26, 35], signal: [5, 7, 9, 12] },
    bollinger: { n: [10, 15, 20, 30, 50], k: [1, 1.5, 2, 2.5, 3] },
    dip_trend: { trend: [100, 150, 200], n: [2, 3, 5], lo: [5, 10, 15, 20], exit: [3, 5, 7, 10] },
    sma_band: { n: [50, 100, 150, 200, 250], band: [0.5, 1, 2, 3, 5] },
    high52: { look: [60, 120, 180, 252], within: [3, 5, 10, 15, 20] },
    trailing: { stop: [5, 8, 10, 15, 20, 25, 30], n: [20, 50, 100, 150, 200] },
    season: { start: [8, 9, 10, 11, 12], end: [3, 4, 5, 6] }
  };

  function gridCombos(type) {
    var grid = PARAM_GRIDS[type];
    if (!grid) return [];
    var keys = Object.keys(grid), combos = [{}];
    keys.forEach(function (k) {
      var next = [];
      combos.forEach(function (c) {
        grid[k].forEach(function (v) { var o = {}; for (var kk in c) o[kk] = c[kk]; o[k] = v; next.push(o); });
      });
      combos = next;
    });
    return combos.filter(function (c) { return validateParams(type, c) === null; });
  }

  /**
   * Testet alle Parameter-Kombinationen einer Strategie und vergleicht sie mit Buy & Hold.
   * Zusätzlich je Kombination: Schlägt sie Buy & Hold auch in BEIDEN Zeitraum-Hälften (Plausibilitätscheck gegen Überanpassung)?
   * Kombinationen ohne einen einzigen Trade werden ausgelassen (sie wären bei fallendem Kurs „Cash schlägt Verlust“).
   */
  function searchParams(hist, type, fee) {
    var combos = gridCombos(type), rows = [], skipped = 0, bhStats = null, n = hist.length, mid = Math.floor(n / 2);
    combos.forEach(function (p) {
      var res = backtest(hist, type, p, fee);
      if (res.error) return;
      if (!bhStats) bhStats = res.bhStats;
      if (res.stats.trades === 0) { skipped++; return; }
      var eq = res.equity, bh = res.buyHold;
      var s1 = eq[mid] / eq[0] - 1, s2 = eq[n - 1] / eq[mid] - 1;
      var b1 = bh[mid] / bh[0] - 1, b2 = bh[n - 1] / bh[mid] - 1;
      rows.push({
        params: p,
        total: res.stats.totalReturn, cagr: res.stats.cagr, maxDD: res.stats.maxDD, sharpe: res.stats.sharpe,
        trades: res.stats.trades, exposure: res.stats.exposure,
        excess: res.stats.totalReturn - res.bhStats.totalReturn,
        beats: res.stats.totalReturn > res.bhStats.totalReturn,
        half1: s1 > b1, half2: s2 > b2
      });
    });
    return { rows: rows, tested: combos.length, skipped: skipped, bh: bhStats };
  }


  /**
   * Findet die „beste“ Strategie mit Out-of-Sample-Test:
   * Je Strategie werden die Parameter nur auf den ersten (1-testFrac) der Daten gesucht (beste Sharpe, mind. 3 Trades),
   * danach wird genau diese Einstellung auf dem restlichen Testzeitraum bewertet, den die Suche nie gesehen hat.
   * Verglichen wird mit Buy & Hold im selben Testzeitraum.
   */
  function findBest(hist, fee, testFrac) {
    var n = hist.length;
    if (n < 1000) return { error: 'Zu wenig Daten: Für einen aussagekräftigen Test werden mindestens etwa 4 Jahre Kurse benötigt. Wähle einen längeren Zeitraum.' };
    var split = Math.floor(n * (1 - (testFrac || 0.3)));
    var train = hist.slice(0, split + 1);
    var dates = hist.map(function (h) { return h.date; });
    var testDates = dates.slice(split);
    function segStats(curve) {
      var seg = curve.slice(split);
      var st = perfStats(seg, testDates, returns(seg));
      return st;
    }
    var rows = [], bhRes = backtest(hist, 'buyhold', {}, fee);
    if (bhRes.error) return { error: bhRes.error };
    var bhTest = segStats(bhRes.buyHold);
    Object.keys(STRATEGIES).forEach(function (type) {
      if (type === 'buyhold') return;
      var sr = searchParams(train, type, fee);
      var cands = sr.rows.filter(function (r) { return r.trades >= 3; });
      if (!cands.length) cands = sr.rows;
      if (!cands.length) return;
      var best = cands.slice().sort(function (a, b) { return (b.sharpe == null ? -99 : b.sharpe) - (a.sharpe == null ? -99 : a.sharpe); })[0];
      var full = backtest(hist, type, best.params, fee);
      if (full.error) return;
      var t = segStats(full.equity);
      rows.push({
        type: type, params: best.params, trainSharpe: best.sharpe,
        test: t, full: full.stats, trades: full.stats.trades,
        beatsTest: t.totalReturn > bhTest.totalReturn
      });
    });
    return {
      rows: rows, bhTest: bhTest, bhFull: bhRes.bhStats,
      split: split, trainEnd: dates[split], testStart: dates[split], testEnd: dates[n - 1], days: n - split
    };
  }

  /* ---------- Historie laden ---------- */
  /**
   * Lädt die längste verfügbare Historie: long/<TICKER>.json oder – falls kürzer – die chartHistory aus der Aktie.
   * @returns {Promise<Array>} bereinigte Historie [{date, close}]
   */
  function loadHistory(ticker, fallbackHistory) {
    var fallback = cleanHistory(fallbackHistory);
    var D = window.App.Data;
    if (!D || !D.getLongHistory) return Promise.resolve(fallback);
    return D.getLongHistory(ticker).then(function (long) {
      var l = cleanHistory(long);
      return l.length > fallback.length ? l : fallback;
    }).catch(function () { return fallback; });
  }

  /** Lädt die Historie eines beliebigen Tickers (z. B. Benchmark-ETF). */
  function loadHistoryFor(ticker) {
    var D = window.App.Data;
    return D.getStock(ticker).then(function (s) {
      return loadHistory(ticker, s.chartHistory);
    }).catch(function () { return []; });
  }

  return {
    TD: TD, RF: RF,
    mean: mean, std: std, quantile: quantile,
    cleanHistory: cleanHistory, sliceYears: sliceYears, spanYears: spanYears,
    returns: returns, cagr: cagr,
    annualVol: annualVol, sharpe: sharpe, sortino: sortino,
    varHist: varHist, cvarHist: cvarHist, drawdown: drawdown,
    alignedReturns: alignedReturns, betaCorr: betaCorr, histogram: histogram,
    sma: sma, ema: ema, rsi: rsi, validateParams: validateParams,
    STRATEGIES: STRATEGIES, defaultParams: defaultParams, computeSignals: computeSignals, backtest: backtest,
    PARAM_GRIDS: PARAM_GRIDS, gridCombos: gridCombos, searchParams: searchParams, findBest: findBest,
    loadHistory: loadHistory, loadHistoryFor: loadHistoryFor
  };
})();

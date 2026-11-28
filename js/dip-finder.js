/**
 * js/dip-finder.js – "Buy the Dip": gesunde Aktien in einem Rücksetzer finden
 *
 * Ein Dip im Sinne dieses Filters:
 *   1. Rücksetzer: Kurs liegt min–max % unter dem Hoch der letzten ~3 Monate
 *   2. Langfristtrend intakt: Kurs nicht mehr als 3 % unter dem EMA 200 (sonst ist es eher ein Abwärtstrend)
 *   3. Kurzfristig ausverkauft: RSI höchstens rsiMax
 *   4. Kein "fallendes Messer" (Boden-Check der Pipeline) und Qualität: ROE, KGV, Börsenwert
 * Pluspunkte für den Rang (Dip-Score): Rücksetzer im Bereich 10–20 %, niedriger RSI, Abstand über EMA 200,
 * Stabilisierung (Kurs über dem Tief der letzten 5 Tage), Analysten-Kurspotenzial.
 *
 * App.DipFinder.evaluate(stock, opts) -> { ok, dd, rsi, trend, stable, score, reasons[], miss[] }
 * App.DipFinder.DEFAULTS
 */
window.App = window.App || {};
window.App.DipFinder = (function () {
  'use strict';

  var DEFAULTS = { ddMin: 7, ddMax: 25, rsiMax: 45, needTrend: true, minRoe: 10, maxPe: 35, minCap: 1e9 };

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  function ema200(s) {
    if (num(s.ema200Live)) return s.ema200Live;
    var b = s.liveBase && s.liveBase.e200;
    return b && num(b[1]) ? b[1] : null;
  }

  function evaluate(s, opts) {
    var o = {};
    var k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    for (k in (opts || {})) o[k] = opts[k];
    var res = { ok: false, dd: null, rsi: num(s.rsi), trend: null, stable: false, score: 0, reasons: [], miss: [] };
    var price = num(s.price);
    var closes = Array.isArray(s.closes) ? s.closes.filter(function (c) { return c > 0; }) : [];
    if (!price || closes.length < 20) { res.miss.push('zu wenige Kursdaten'); return res; }

    // 1. Rücksetzer vom 3-Monats-Hoch
    var high = Math.max.apply(null, closes.concat([price]));
    res.dd = (price / high - 1) * 100;
    var depth = -res.dd;
    if (depth < o.ddMin) res.miss.push('Rücksetzer nur ' + depth.toFixed(1).replace('.', ',') + ' %');
    if (depth > o.ddMax) res.miss.push('Rücksetzer ' + depth.toFixed(0) + ' % zu tief');

    // 2. Langfristtrend
    var e200 = ema200(s);
    if (e200) {
      res.trend = (price / e200 - 1) * 100;
      if (o.needTrend && res.trend < -3) res.miss.push('unter EMA 200');
    } else if (o.needTrend) {
      // ohne EMA 200: Jahresperformance als Ersatz
      if (!(num(s.perf52w) > 0)) res.miss.push('kein Aufwärtstrend (1 J.)');
    }

    // 3. RSI
    if (res.rsi !== null && res.rsi > o.rsiMax) res.miss.push('RSI ' + Math.round(res.rsi));

    // 4. Kein fallendes Messer, Qualität
    if (s.bottom === 'knife') res.miss.push('fallendes Messer');
    var roe = num(s.returnOnEquity);
    if (roe !== null && roe * 100 < o.minRoe) res.miss.push('ROE ' + Math.round(roe * 100) + ' %');
    var pe = num(s.pe);
    if (pe !== null && (pe <= 0 || pe > o.maxPe)) res.miss.push(pe <= 0 ? 'Verlust' : 'KGV ' + Math.round(pe));
    var cap = num(s.marketCap) || num(s.mcap);
    if (cap !== null && cap < o.minCap) res.miss.push('klein');

    // Stabilisierung: Kurs über dem Tief der letzten 5 Tage
    var last5 = closes.slice(-5).concat([price]);
    var low5 = Math.min.apply(null, last5);
    res.stable = price > low5 * 1.005;

    res.ok = res.miss.length === 0;

    // Dip-Score (0–100) für die Reihenfolge
    var sc = 0;
    sc += Math.max(0, 30 - Math.abs(depth - 15) * 2);                      // ideal 10–20 %
    if (res.rsi !== null) sc += Math.max(0, Math.min(25, (50 - res.rsi) * 1.25));
    if (res.trend !== null) sc += Math.max(0, Math.min(20, res.trend));     // je weiter über EMA 200, desto stabiler der Trend
    else if (num(s.perf52w) > 0) sc += 8;
    if (res.stable) sc += 10;
    if (num(s.upside) !== null) sc += Math.max(0, Math.min(15, s.upside / 2));
    res.score = Math.round(Math.max(0, Math.min(100, sc)));

    res.reasons.push('−' + depth.toFixed(1).replace('.', ',') + ' % vom 3M-Hoch');
    if (res.rsi !== null) res.reasons.push('RSI ' + Math.round(res.rsi));
    if (res.trend !== null) res.reasons.push((res.trend >= 0 ? '+' : '') + res.trend.toFixed(0) + ' % zum EMA 200');
    if (res.stable) res.reasons.push('stabilisiert sich');
    if (num(s.upside) !== null && s.upside > 0) res.reasons.push('Kursziel +' + Math.round(s.upside) + ' %');
    return res;
  }

  /* ------------------------------------------------------------------
   * "Qualität im Ausverkauf": starke Firmen nach einem kräftigen Kurseinbruch.
   * Anders als beim Dip darf der Kurs unter dem EMA 200 liegen und der Boden-Check "fallendes Messer"
   * melden – das wird als Risiko angezeigt, nicht ausgeschlossen. Dafür strengere Qualität.
   * ------------------------------------------------------------------ */
  var SELLOFF_DEFAULTS = { ddMin: 20, minRoe: 15, maxFwdPe: 30, minUpside: 10, minCap: 5e9 };

  function evaluateSelloff(s, opts) {
    var o = {}, k;
    for (k in SELLOFF_DEFAULTS) o[k] = SELLOFF_DEFAULTS[k];
    for (k in (opts || {})) o[k] = opts[k];
    var res = { ok: false, dd: null, rsi: num(s.rsi), trend: null, stable: false, score: 0, reasons: [], risks: [], miss: [] };
    var price = num(s.price);
    var closes = Array.isArray(s.closes) ? s.closes.filter(function (c) { return c > 0; }) : [];
    if (!price || closes.length < 20) { res.miss.push('zu wenige Kursdaten'); return res; }

    var high = Math.max.apply(null, closes.concat([price]));
    res.dd = (price / high - 1) * 100;
    var depth = -res.dd;
    if (depth < o.ddMin) res.miss.push('Rückgang nur ' + depth.toFixed(0) + ' %');

    // Qualität (fehlende Werte zählen als nicht erfüllt – bei einem Einbruch soll die Firma nachweislich solide sein)
    var roe = num(s.returnOnEquity), pe = num(s.pe), fpe = num(s.forwardPe), up = num(s.upside), de = num(s.debtToEquity);
    var cap = num(s.marketCap) || num(s.mcap);
    if (roe === null || roe * 100 < o.minRoe) res.miss.push(roe === null ? 'ROE fehlt' : 'ROE ' + Math.round(roe * 100) + ' %');
    if (pe !== null && pe <= 0) res.miss.push('Verlust');
    if (fpe !== null && (fpe <= 0 || fpe > o.maxFwdPe)) res.miss.push('Fwd-KGV ' + Math.round(fpe));
    if (o.minUpside > 0 && (up === null || up < o.minUpside)) res.miss.push(up === null ? 'kein Kursziel' : 'Kursziel +' + Math.round(up) + ' %');
    if (cap !== null && cap < o.minCap) res.miss.push('klein');
    if (de !== null && de > 250) res.miss.push('hohe Schulden');

    // Risiken (kein Ausschluss)
    var e200 = ema200(s);
    if (e200) {
      res.trend = (price / e200 - 1) * 100;
      if (res.trend < -3) res.risks.push(Math.round(-res.trend) + ' % unter EMA 200');
    }
    if (s.bottom === 'knife') res.risks.push('fallendes Messer');
    if (num(s.perf1m) !== null && s.perf1m <= -20) res.risks.push(Math.round(s.perf1m) + ' % in 1 Monat');

    var last5 = closes.slice(-5).concat([price]);
    res.stable = price > Math.min.apply(null, last5) * 1.005;
    res.ok = res.miss.length === 0;

    // Score: Qualität und Bewertung zählen mehr als die Tiefe des Einbruchs
    var sc = 0;
    if (roe !== null) sc += Math.min(25, roe * 100 / 2);
    if (fpe !== null && fpe > 0) sc += Math.max(0, Math.min(20, (30 - fpe)));
    if (up !== null) sc += Math.max(0, Math.min(20, up / 2));
    sc += Math.min(15, depth / 3);
    if (res.rsi !== null) sc += Math.max(0, Math.min(10, (45 - res.rsi) / 1.5));
    if (res.stable) sc += 10;
    sc -= res.risks.length * 3;
    res.score = Math.round(Math.max(0, Math.min(100, sc)));

    res.reasons.push('−' + depth.toFixed(0) + ' % vom 3M-Hoch');
    if (roe !== null) res.reasons.push('ROE ' + Math.round(roe * 100) + ' %');
    if (fpe !== null) res.reasons.push('Fwd-KGV ' + fpe.toFixed(1).replace('.', ','));
    if (up !== null) res.reasons.push('Kursziel ' + (up >= 0 ? '+' : '') + Math.round(up) + ' %');
    if (res.rsi !== null) res.reasons.push('RSI ' + Math.round(res.rsi));
    if (res.stable) res.reasons.push('stabilisiert sich');
    return res;
  }

  return { evaluate: evaluate, DEFAULTS: DEFAULTS, evaluateSelloff: evaluateSelloff, SELLOFF_DEFAULTS: SELLOFF_DEFAULTS };
})();

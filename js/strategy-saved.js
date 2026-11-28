/**
 * Gespeicherte Handelsstrategien je Aktie und ihr aktuelles Signal.
 *
 * - Eine Strategie (Typ + Parameter) oder ein Ensemble (3 Strategien, Mehrheitsentscheid) wird pro Ticker
 *   im Browser gespeichert, samt Risikoregeln (Stopps, Markt-Filter, Ziel-Schwankung) und Kosten.
 * - signal(ticker) rechnet mit den Schlusskursen (und, falls vorhanden, dem heutigen Live-Kurs) aus,
 *   ob man laut Strategie gerade investiert sein sollte und ob sich das heute ändert (Kaufen / Verkaufen).
 * - autoFind(...) testet alle Strategien und das Ensemble im Walk-Forward-Test und rankt sie.
 *
 * Alles läuft im Browser, keine Anlageberatung.
 */
window.App = window.App || {};
window.App.SavedStrategy = (function () {
  'use strict';

  var KEY = 'app_saved_strategies_v1';
  var Q = function () { return window.App.Quant; };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  };

  /* ---------- Speicher ---------- */
  function all() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function get(ticker) { return all()[String(ticker || '').toUpperCase()] || null; }
  function save(ticker, cfg) {
    var a = all();
    cfg.savedAt = new Date().toISOString();
    a[String(ticker).toUpperCase()] = cfg;
    try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (_) {}
    sigCache = {};
    window.dispatchEvent(new CustomEvent('app:strategy-saved', { detail: { ticker: ticker } }));
  }
  function remove(ticker) {
    var a = all();
    delete a[String(ticker).toUpperCase()];
    try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (_) {}
    sigCache = {};
    window.dispatchEvent(new CustomEvent('app:strategy-saved', { detail: { ticker: ticker } }));
  }

  function label(cfg) {
    var q = Q();
    if (!cfg) return '';
    if (cfg.kind === 'ensemble') {
      return 'Ensemble: ' + (cfg.members || []).map(function (m) { return (q.STRATEGIES[m.type] || {}).label || m.type; }).join(' + ');
    }
    var def = q.STRATEGIES[cfg.type] || { label: cfg.type, params: [] };
    var p = (def.params || []).map(function (d) { return cfg.params[d.key]; }).join(' / ');
    return def.label + (p ? ' (' + p + ')' : '');
  }

  /* ---------- Hilfen ---------- */
  function addDays(d, n) {
    var x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function riskOpts(risk) {
    var r = risk || {};
    return { stop: (r.stop || 0) / 100, trail: (r.trail || 0) / 100, target: (r.target || 0) / 100, volTarget: (r.volTarget || 0) / 100 };
  }

  /** Mehrheitssignal (mind. 2 von 3) der Ensemble-Mitglieder. */
  function ensembleSignal(hist, members) {
    var q = Q(), ppy = q.periodsPerYear(hist);
    var closes = hist.map(function (h) { return h.close; }), dates = hist.map(function (h) { return h.date; });
    var sigs = members.map(function (m) { return q.computeSignals(closes, m.type, q.scaleParams(m.type, m.params, ppy), dates); });
    var need = Math.min(2, sigs.length);
    return {
      vote: closes.map(function (_, k) { var s = 0; sigs.forEach(function (sg) { s += sg[k] === 1 ? 1 : 0; }); return need && s >= need ? 1 : 0; }),
      each: sigs
    };
  }

  /**
   * Signal der gespeicherten Strategie am letzten Kurs.
   * Trick: Zwei Hilfstage mit unverändertem Kurs anhängen; die Position am letzten Hilfstag ist genau die
   * Entscheidung, die am heutigen Schlusskurs (bzw. Live-Kurs) fällt – inklusive Stopps und Markt-Filter.
   */
  function evaluate(cfg, hist, live, marketHist) {
    var q = Q();
    var h = q.sliceYears(q.cleanHistory(hist), 6).slice();
    if (h.length < 60) return { error: 'Zu wenig Kursdaten' };
    var last = h[h.length - 1], provisional = false;
    if (live && live.price > 0 && live.date && live.date > last.date) {
      h.push({ date: live.date, close: live.price });
      provisional = true;
    }
    if (last.date >= todayStr()) provisional = true;           // heutiger Kurs während des Handels
    var realN = h.length, lastDate = h[realN - 1].date, px = h[realN - 1].close;
    h.push({ date: addDays(lastDate, 1), close: px }, { date: addDays(lastDate, 2), close: px });

    var opts = riskOpts(cfg.risk);
    if (marketHist && marketHist.length) {
      var reg = q.regimeSeries(marketHist, h.map(function (x) { return x.date; }), 200);
      if (reg) opts.regime = reg;
    }
    var fee = (cfg.fee != null ? cfg.fee : 0.1) / 100, res, each = null;
    if (cfg.kind === 'ensemble') {
      var es = ensembleSignal(h, cfg.members || []);
      each = (cfg.members || []).map(function (m, i) { return { type: m.type, on: es.each[i][realN - 1] === 1 }; });
      res = q.backtest(h, 'custom', { sig: es.vote }, fee, opts);
    } else {
      res = q.backtest(h, cfg.type, cfg.params, fee, opts);
    }
    if (res.error) return { error: res.error };
    var n = res.pos.length;
    var held = res.pos[realN - 1], next = res.pos[n - 1];
    var k = realN - 1;
    while (k > 0 && res.pos[k - 1] === held) k--;
    var action = next && !held ? 'buy' : !next && held ? 'sell' : next ? 'hold' : 'out';
    return {
      action: action, held: held, next: next, since: h[Math.max(0, k - 1)].date,
      size: res.size ? Math.round(res.size[n - 1] * 100) : 100,
      date: lastDate, price: px, provisional: provisional, members: each
    };
  }

  var sigCache = {};
  /**
   * Signal für einen Ticker mit gespeicherter Strategie. live = { price, date } (optional).
   * Ergebnis wird 10 Minuten zwischengespeichert.
   */
  function signal(ticker, live) {
    var cfg = get(ticker);
    if (!cfg) return Promise.resolve(null);
    var ck = ticker + '|' + (live ? live.price + live.date : '');
    var c = sigCache[ck];
    if (c && Date.now() - c.t < 10 * 60 * 1000) return c.p;
    var q = Q();
    var market = cfg.risk && cfg.risk.market && cfg.risk.market !== 'none' ? q.loadHistoryFor(cfg.risk.market) : Promise.resolve(null);
    var p = Promise.all([q.loadHistoryFor(ticker), market]).then(function (r) {
      var out = evaluate(cfg, r[0], live, r[1]);
      out.cfg = cfg;
      return out;
    }).catch(function (e) { return { error: (e && e.message) || 'Fehler', cfg: cfg }; });
    sigCache[ck] = { t: Date.now(), p: p };
    return p;
  }

  var ACTION = {
    buy: { text: 'Kaufen', color: 'var(--bullish)', bg: 'rgba(16,185,129,0.14)', icon: '▲' },
    sell: { text: 'Verkaufen', color: 'var(--bearish)', bg: 'rgba(239,68,68,0.14)', icon: '▼' },
    hold: { text: 'Halten', color: 'var(--bullish)', bg: 'transparent', icon: '●' },
    out: { text: 'Nicht investiert', color: 'var(--text-muted)', bg: 'transparent', icon: '○' }
  };

  /** Kleines Abzeichen für Listen. */
  function badgeHtml(s) {
    if (!s) return '';
    if (s.error) return '<span style="font-size:0.68rem;color:var(--text-dim);">Strategie: keine Daten</span>';
    var a = ACTION[s.action];
    var strong = s.action === 'buy' || s.action === 'sell';
    return '<span title="' + esc(label(s.cfg)) + '" style="display:inline-flex;align-items:center;gap:4px;font-size:0.7rem;font-weight:' + (strong ? 800 : 600) + ';' +
      'color:' + a.color + ';background:' + a.bg + ';' + (strong ? 'padding:2px 7px;border-radius:999px;border:1px solid ' + a.color + ';' : '') + '">' +
      a.icon + ' ' + a.text + (s.action === 'hold' && s.size < 100 ? ' ' + s.size + ' %' : '') + (s.provisional ? '*' : '') + '</span>';
  }

  /** Ausführliche Box (Detailansicht). */
  function detailHtml(s, F) {
    var cfg = s.cfg, a = ACTION[s.action] || ACTION.out;
    var since = F && s.since ? F.date(s.since) : s.since;
    var text = {
      buy: 'Das Kaufsignal ist heute entstanden – laut Strategie am nächsten Schlusskurs kaufen.',
      sell: 'Heute ist ein Verkaufssignal entstanden – laut Strategie am nächsten Schlusskurs verkaufen.',
      hold: 'Laut Strategie investiert bleiben (seit ' + since + ').',
      out: 'Laut Strategie nicht investiert (seit ' + since + '). Auf das nächste Kaufsignal warten.'
    }[s.action];
    return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<span style="font-size:1.05rem;font-weight:800;color:' + a.color + ';">' + a.icon + ' ' + a.text + '</span>' +
        (s.next && s.size < 100 ? '<span class="period-tag">Positionsgröße ' + s.size + ' %</span>' : '') + '</div>' +
      '<div style="font-size:0.8rem;color:var(--text-muted);line-height:1.5;margin-top:4px;">' + text + '</div>' +
      (s.members ? '<div style="font-size:0.74rem;color:var(--text-dim);margin-top:6px;">' + s.members.map(function (m) {
        return esc((Q().STRATEGIES[m.type] || {}).label || m.type) + ': ' + (m.on ? '<span style="color:var(--bullish);">Kauf</span>' : 'Cash');
      }).join(' · ') + '</div>' : '') +
      '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:6px;">Stand: Kurs vom ' + (F ? F.date(s.date) : s.date) +
        (s.provisional ? ' (Live-Kurs, vorläufig – entscheidend ist der Schlusskurs)' : '') + '. Keine Anlageberatung.</div>';
  }

  /* ---------- Automatische Suche ---------- */
  function rowFromWF(type, label, wf) {
    var trades = (wf.windows || []).reduce(function (a, w) { return a + (w.trades || 0); }, 0);
    return {
      type: type, label: label, wf: wf,
      total: wf.stats.totalReturn, cagr: wf.stats.cagr, maxDD: wf.stats.maxDD, sharpe: wf.stats.sharpe,
      sortino: wf.stats.sortino, calmar: wf.stats.calmar, trades: trades,
      beat: wf.beatWindows, windows: wf.windows.length
    };
  }

  /**
   * Testet jede Strategie und das Ensemble im Walk-Forward-Test (gleiche Fenster) und sortiert nach dem
   * Optimierungsziel – bewertet werden nur die Testjahre, die die Suche nie gesehen hat.
   */
  function autoFind(hist, fee, opts, trainYears, onProgress) {
    var q = Q();
    var types = Object.keys(q.STRATEGIES).filter(function (t) { return t !== 'buyhold'; });
    var rows = [], bh = null, i = 0, total = types.length + 1;
    return new Promise(function (resolve) {
      (function step() {
        if (i < types.length) {
          var t = types[i++];
          var wf = q.walkForward(hist, t, fee, opts, trainYears, 1);
          if (!wf.error) {
            rows.push(rowFromWF(t, q.STRATEGIES[t].label, wf));
            if (!bh) bh = wf;
          }
          if (onProgress) onProgress(i, total, q.STRATEGIES[t].label);
          setTimeout(step, 0);
          return;
        }
        if (onProgress) onProgress(i, total, 'Ensemble (Top 3)');
        q.walkForwardEnsemble(hist, fee, opts, trainYears, 1).then(function (ens) {
          if (!ens.error) rows.push(rowFromWF('ensemble', 'Ensemble (Top 3)', ens));
          if (!rows.length) { resolve({ error: (bh && bh.error) || 'Zu wenig Kursdaten für den Walk-Forward-Test.' }); return; }
          var bhRow = {
            type: 'buyhold', label: 'Buy & Hold', total: bh.bhStats.totalReturn, cagr: bh.bhStats.cagr, maxDD: bh.bhStats.maxDD,
            sharpe: bh.bhStats.sharpe, sortino: bh.bhStats.sortino, calmar: bh.bhStats.calmar, trades: 1
          };
          var obj = opts && opts.objective;
          rows.sort(function (a, b) { return q.objScore(b, obj) - q.objScore(a, obj); });
          rows.forEach(function (r) { r.beatsBH = q.objScore(r, obj) > q.objScore(bhRow, obj); });
          resolve({ rows: rows, bh: bhRow, trainYears: trainYears, from: bh.windows[0].testFrom, to: bh.windows[bh.windows.length - 1].testTo, windows: bh.windows.length });
        });
      })();
    });
  }

  /**
   * Parameter für den Einsatz ab heute: auf den letzten trainYears Jahren gesucht (wie im Walk-Forward,
   * nur mit dem neuesten Fenster). Für das Ensemble: die 3 besten Strategien dieses Fensters.
   */
  function currentPick(hist, type, fee, opts, trainYears) {
    var q = Q();
    var train = q.sliceYears(hist, trainYears);
    var o = opts;
    if (opts && opts.regime) o = Object.assign({}, opts, { regime: opts.regime.slice(opts.regime.length - train.length) });
    var obj = opts && opts.objective;
    if (type !== 'ensemble') {
      var best = q.pickBest(q.searchParams(train, type, fee, o).rows, obj);
      return { kind: 'single', type: type, params: best ? best.params : q.defaultParams(type) };
    }
    var ranked = [];
    Object.keys(q.STRATEGIES).forEach(function (t) {
      if (t === 'buyhold') return;
      var b = q.pickBest(q.searchParams(train, t, fee, o).rows, obj);
      if (b) ranked.push({ type: t, params: b.params, score: q.objScore(b, obj) });
    });
    ranked.sort(function (a, b) { return b.score - a.score; });
    return { kind: 'ensemble', members: ranked.slice(0, 3).map(function (m) { return { type: m.type, params: m.params }; }) };
  }

  /** Abzeichen in eine Liste setzen: Elemente mit data-sig-ticker; live(ticker) liefert {price,date} oder null. */
  function decorate(root, live) {
    if (!root) return;
    root.querySelectorAll('[data-sig-ticker]').forEach(function (el) {
      var t = el.getAttribute('data-sig-ticker');
      if (!get(t)) { el.innerHTML = ''; return; }
      el.innerHTML = '<span style="font-size:0.68rem;color:var(--text-dim);">Strategie …</span>';
      signal(t, live ? live(t) : null).then(function (s) { if (document.body.contains(el)) el.innerHTML = badgeHtml(s); });
    });
  }

  return {
    all: all, get: get, save: save, remove: remove, label: label,
    signal: signal, evaluate: evaluate, badgeHtml: badgeHtml, detailHtml: detailHtml, decorate: decorate,
    autoFind: autoFind, currentPick: currentPick, todayStr: todayStr, ACTION: ACTION
  };
})();

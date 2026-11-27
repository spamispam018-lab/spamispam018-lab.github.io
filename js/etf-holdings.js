/**
 * js/etf-holdings.js – Top-Positionen eines ETFs den Aktien der App zuordnen
 *
 * Die Pipeline liefert je ETF bis zu 10 Positionen (Name, Gewicht in %, meist Yahoo-Symbol;
 * "via" = US-ETF auf denselben Index, falls das Xetra-Listing selbst keine Positionen hat).
 *
 * App.EtfHoldings.match(stock, n)   -> Promise [{ name, weight, symbol, ticker, u }]  (u = Universums-Eintrag oder null)
 * App.EtfHoldings.targets(stock, n) -> Promise Kursziel-Szenarien für den ETF oder null
 *     Gewichteter Mittelwert des Kurspotenzials der zugeordneten Positionen (tief/mittel/hoch),
 *     angewendet auf den ETF-Kurs. Positionen ohne Kursziel fallen heraus, die übrigen Gewichte
 *     werden auf 100 % hochgerechnet.
 */
window.App = window.App || {};
window.App.EtfHoldings = (function () {
  'use strict';

  var LEGAL = /\b(incorporated|inc|corporation|corp|company|co|limited|ltd|plc|ag|se|sa|nv|n\s?v|s\s?a|spa|asa|ab|oyj|a\/s|kgaa|holdings?|group|the|class\s+[a-z]|cl\s+[a-z]|shs|registered|reg|adr|ord|common|stock)\b/g;

  function norm(name) {
    return String(name || '').toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\.com\b/g, '')
      .replace(/[.,'’()\-\/]/g, ' ')
      .replace(LEGAL, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isEtf(stock) {
    if (!stock) return false;
    var qt = String((stock.profile && stock.profile.quoteType) || stock.quoteType || '').toUpperCase();
    if (qt === 'ETF' || qt === 'MUTUALFUND') return true;
    var sector = stock.sector || (stock.profile && stock.profile.sector) || '';
    if (sector === 'ETF' || sector === 'Sonstige') return true;
    // ohne Sektor nur dann ETF, wenn Positionen bekannt sind (sonst wäre jede Aktie ohne Profil ein "ETF")
    return !sector && !!(stock.holdings && stock.holdings.length);
  }

  var indexCache = null;
  function buildIndex(universe) {
    if (indexCache && indexCache.src === universe) return indexCache;
    var bySym = {}, byName = {}, names = [];
    universe.forEach(function (u) {
      var t = String(u.ticker || '').toUpperCase();
      if (!t) return;
      bySym[t] = u;
      var base = t.split('.')[0];
      if (!bySym[base]) bySym[base] = u;              // SAP -> SAP.DE, ASML -> ASML.AS
      bySym[t.replace(/-/g, '.')] = bySym[t.replace(/-/g, '.')] || u;   // BRK.B <-> BRK-B
      var n = norm(u.name);
      if (n) { if (!byName[n]) byName[n] = u; names.push([n, u]); }
    });
    indexCache = { src: universe, bySym: bySym, byName: byName, names: names };
    return indexCache;
  }

  function findOne(h, idx) {
    var sym = String(h.symbol || '').toUpperCase().trim();
    if (sym) {
      var cands = [sym, sym.replace(/\./g, '-'), sym.replace(/-/g, '.')];
      if (sym === 'GOOG') cands.push('GOOGL');
      if (sym === 'GOOGL') cands.push('GOOG');
      for (var i = 0; i < cands.length; i++) if (idx.bySym[cands[i]]) return idx.bySym[cands[i]];
    }
    var n = norm(h.name);
    if (!n) return null;
    if (idx.byName[n]) return idx.byName[n];
    // Präfix-Treffer ("taiwan semiconductor manufacturing" <-> "taiwan semiconductor manufacturing company")
    if (n.length >= 5) {
      for (var k = 0; k < idx.names.length; k++) {
        var un = idx.names[k][0];
        if (un.length >= 5 && (un.indexOf(n + ' ') === 0 || n.indexOf(un + ' ') === 0)) return idx.names[k][1];
      }
    }
    return null;
  }

  function match(stock, n) {
    var holdings = ((stock && stock.holdings) || []).slice()
      .sort(function (a, b) { return (b.weight || 0) - (a.weight || 0); });
    if (!holdings.length) return Promise.resolve([]);
    return window.App.Data.getUniverse().then(function (universe) {
      var idx = buildIndex(universe || []);
      var seen = {};
      return holdings.map(function (h) {
        var u = findOne(h, idx);
        // Alphabet A und C sind dieselbe Firma: Gewicht zusammenfassen statt doppelt zählen
        if (u && seen[u.ticker]) { seen[u.ticker].weight += Number(h.weight) || 0; return null; }
        var r = { name: h.name, weight: Number(h.weight) || 0, symbol: h.symbol || null, via: h.via || null, ticker: u ? u.ticker : null, u: u || null };
        if (u) seen[u.ticker] = r;
        return r;
      }).filter(Boolean).slice(0, n || 10);   // erst zusammenfassen, dann die 10 größten
    });
  }

  /** Kurspotenzial (tief/mittel/hoch in %) einer Position – aus dem Universum, sonst aus der Aktien-Datei. */
  function upsides(r) {
    var u = r.u || {};
    var have = typeof u.upside === 'number' && isFinite(u.upside);
    var haveRange = typeof u.upsideLow === 'number' && typeof u.upsideHigh === 'number';
    if (have && haveRange) return Promise.resolve({ low: u.upsideLow, mean: u.upside, high: u.upsideHigh, count: u.analystCount || 0 });
    return window.App.Data.getStock(r.ticker).then(function (st) {
      var tg = (st && st.analysts && st.analysts.targets) || {};
      var px = (st && st.quote && st.quote.price) || tg.current;
      if (!(px > 0) || !tg.mean) return have ? { low: null, mean: u.upside, high: null, count: u.analystCount || 0 } : null;
      return {
        low: tg.low ? (tg.low / px - 1) * 100 : null,
        mean: have ? u.upside : (tg.mean / px - 1) * 100,
        high: tg.high ? (tg.high / px - 1) * 100 : null,
        count: tg.analystCount || 0
      };
    }).catch(function () { return have ? { low: null, mean: u.upside, high: null, count: u.analystCount || 0 } : null; });
  }

  function targets(stock, n) {
    var px = stock && stock.quote && stock.quote.price;
    if (!(px > 0)) return Promise.resolve(null);
    return match(stock, n || 10).then(function (list) {
      var withT = list.filter(function (r) { return r.ticker; });
      return Promise.all(withT.map(upsides)).then(function (ups) {
        var used = [];
        withT.forEach(function (r, i) { if (ups[i] && typeof ups[i].mean === 'number') used.push({ r: r, up: ups[i] }); });
        if (!used.length) return null;
        var wSum = used.reduce(function (a, x) { return a + (x.r.weight || 0); }, 0);
        var w = function (x) { return wSum > 0 ? x.r.weight / wSum : 1 / used.length; };
        var agg = { low: 0, mean: 0, high: 0 }, count = 0;
        used.forEach(function (x) {
          var m = x.up.mean;
          agg.mean += m * w(x);
          agg.low += (typeof x.up.low === 'number' ? x.up.low : m) * w(x);
          agg.high += (typeof x.up.high === 'number' ? x.up.high : m) * w(x);
          count += x.up.count || 0;
        });
        var totalW = list.reduce(function (a, r) { return a + r.weight; }, 0);
        return {
          current: px,
          low: px * (1 + agg.low / 100),
          mean: px * (1 + agg.mean / 100),
          high: px * (1 + agg.high / 100),
          analystCount: count,
          isAggregated: true,
          used: used.length,
          total: list.length,
          coveredWeight: wSum,
          totalWeight: totalW,
          via: (list[0] && list[0].via) || null,
          items: used.map(function (x) { return { name: x.r.name, ticker: x.r.ticker, weight: x.r.weight, upside: x.up.mean }; })
        };
      });
    }).catch(function () { return null; });
  }

  return { isEtf: isEtf, match: match, targets: targets, norm: norm };
})();

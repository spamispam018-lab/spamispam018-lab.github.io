/**
 * js/providers.js
 * Externe Datenanbieter für Fundamentaldaten und Kongress-Trades:
 *   - Financial Modeling Prep (FMP)   → Kennzahlen, Jahresabschlüsse, Senat-/Repräsentantenhaus-Trades
 *   - Alpha Vantage                   → Kennzahlen (OVERVIEW), Jahresabschlüsse
 *   - Polygon.io                      → Jahresabschlüsse, Marktkapitalisierung
 *   - SEC EDGAR                       → Jahresabschlüsse & Filings, vorab per GitHub-Action nach data/edgar/ geschrieben
 *
 * API-Schlüssel bleiben ausschließlich im localStorage dieses Browsers und gehen nur an den jeweiligen Anbieter.
 * Antworten werden zwischengespeichert, um die kleinen Gratis-Kontingente zu schonen.
 *
 * Alle Anbieter liefern dasselbe normalisierte Format:
 *   { provider, label, currency, fetchedAt, ratios:[{label,value,kind,hint?}], annual:[{date,revenue,grossProfit,
 *     operatingIncome,netIncome,eps,assets,equity,opCashFlow}], filings:[...], notes:[...] }
 * kind: 'x' (Faktor), 'frac' (Anteil → %), 'pct' (schon in %), 'num', 'big' (Mrd./Mio.), 'cur'
 */

window.App = window.App || {};

window.App.Providers = (function () {
  'use strict';

  var KEYS_STORAGE = 'app_provider_keys_v1';
  var CACHE_PREFIX = 'app_prov_cache_';
  var CACHE_TTL = 12 * 3600 * 1000;       // 12 h
  var TIMEOUT_MS = 20000;

  var META = {
    fmp:     { name: 'FMP',           full: 'Financial Modeling Prep', needsKey: true,  signup: 'https://site.financialmodelingprep.com/developer/docs' },
    av:      { name: 'Alpha Vantage', full: 'Alpha Vantage',          needsKey: true,  signup: 'https://www.alphavantage.co/support/#api-key' },
    polygon: { name: 'Polygon',       full: 'Polygon.io',             needsKey: true,  signup: 'https://polygon.io/' },
    edgar:   { name: 'SEC EDGAR',     full: 'SEC EDGAR',              needsKey: false, signup: 'https://www.sec.gov/edgar' }
  };

  var URLS = {
    fmp: 'https://financialmodelingprep.com/stable/',
    av: 'https://www.alphavantage.co/query',
    polygon: 'https://api.polygon.io/'
  };

  /* ---------- Schlüssel ---------- */
  function readKeys() {
    try { return JSON.parse(localStorage.getItem(KEYS_STORAGE) || '{}') || {}; } catch (e) { return {}; }
  }
  function getKey(p) { return (readKeys()[p] || '').trim(); }
  function setKey(p, key) {
    var k = readKeys();
    if (key && key.trim()) k[p] = key.trim(); else delete k[p];
    try { localStorage.setItem(KEYS_STORAGE, JSON.stringify(k)); } catch (e) {}
  }
  function hasKey(p) { return !META[p].needsKey || !!getKey(p); }

  /* ---------- Cache ---------- */
  function cacheGet(key, ttl) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (o && o.t && Date.now() - o.t < (ttl || CACHE_TTL)) return o.v;
    } catch (e) {}
    return null;
  }
  function cacheSet(key, value) {
    var payload = JSON.stringify({ t: Date.now(), v: value });
    try { localStorage.setItem(CACHE_PREFIX + key, payload); }
    catch (e) {
      try {                                          // Platz schaffen: alte Provider-Caches löschen
        Object.keys(localStorage).forEach(function (k) { if (k.indexOf(CACHE_PREFIX) === 0) localStorage.removeItem(k); });
        localStorage.setItem(CACHE_PREFIX + key, payload);
      } catch (e2) {}
    }
  }
  function clearCache() {
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(CACHE_PREFIX) === 0) localStorage.removeItem(k); }); } catch (e) {}
  }

  /* ---------- Hilfsfunktionen ---------- */
  function toNum(v) {
    if (v == null || v === '' || v === 'None' || v === '-' || v === 'N/A') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : null;
  }

  /** Erster vorhandener numerischer Wert aus mehreren möglichen Feldnamen (Anbieter benennen Felder gelegentlich um). */
  function pick(obj, names) {
    if (!obj) return null;
    for (var i = 0; i < names.length; i++) {
      var v = toNum(obj[names[i]]);
      if (v != null) return v;
    }
    return null;
  }

  function fail(code, msg) { var e = new Error(msg); e.code = code; return e; }

  /** fetch mit Timeout und verständlichen deutschen Fehlern. Liefert geparstes JSON. */
  function getJson(url, provider) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    var name = META[provider].full;
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (res.status === 401 || res.status === 403) {
          throw fail('auth', name + ' lehnt den Zugriff ab (HTTP ' + res.status + '). Key prüfen oder Endpoint ist im Tarif nicht enthalten.');
        }
        if (res.status === 402) throw fail('plan', 'Dieser Abruf ist im ' + name + '-Tarif nicht enthalten (HTTP 402).');
        if (res.status === 429) throw fail('limit', name + ': Anfrage-Limit erreicht. Später erneut versuchen.');
        if (!res.ok) throw fail('http', name + ' antwortet mit HTTP ' + res.status + '.');
        return data;
      });
    }).catch(function (err) {
      if (err && err.code) throw err;
      if (err && err.name === 'AbortError') throw fail('timeout', name + ' antwortet nicht (Zeitüberschreitung).');
      throw fail('network', 'Anfrage an ' + name + ' blockiert oder offline (Netzwerk/CORS).');
    }).then(function (d) { if (timer) clearTimeout(timer); return d; },
            function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  function qs(params) {
    return Object.keys(params).filter(function (k) { return params[k] != null && params[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  }

  function sortNewest(list) {
    return list.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }

  /** Kennzahlen, die sich aus dem letzten Jahresabschluss selbst berechnen lassen (Polygon, EDGAR). */
  function ratiosFromAnnual(annual) {
    var a = annual[0];
    if (!a) return [];
    var r = [];
    function div(x, y) { return (x != null && y) ? x / y : null; }
    r.push({ label: 'Umsatz (letztes GJ)', value: a.revenue, kind: 'big' });
    r.push({ label: 'Nettogewinn (letztes GJ)', value: a.netIncome, kind: 'big' });
    r.push({ label: 'Bruttomarge', value: div(a.grossProfit, a.revenue), kind: 'frac' });
    r.push({ label: 'Operative Marge', value: div(a.operatingIncome, a.revenue), kind: 'frac' });
    r.push({ label: 'Nettomarge', value: div(a.netIncome, a.revenue), kind: 'frac' });
    r.push({ label: 'Eigenkapitalrendite (ROE)', value: div(a.netIncome, a.equity), kind: 'frac', hint: 'Nettogewinn ÷ Eigenkapital' });
    r.push({ label: 'Gesamtkapitalrendite (ROA)', value: div(a.netIncome, a.assets), kind: 'frac', hint: 'Nettogewinn ÷ Bilanzsumme' });
    r.push({ label: 'Eigenkapitalquote', value: div(a.equity, a.assets), kind: 'frac' });
    var prev = annual[1];
    if (prev && prev.revenue > 0 && a.revenue != null) r.push({ label: 'Umsatzwachstum (GJ)', value: a.revenue / prev.revenue - 1, kind: 'frac' });
    if (prev && prev.netIncome > 0 && a.netIncome != null) r.push({ label: 'Gewinnwachstum (GJ)', value: a.netIncome / prev.netIncome - 1, kind: 'frac' });
    if (a.eps != null) r.push({ label: 'EPS (verwässert)', value: a.eps, kind: 'num' });
    if (a.opCashFlow != null) r.push({ label: 'Operativer Cashflow', value: a.opCashFlow, kind: 'big' });
    return r.filter(function (x) { return x.value != null && isFinite(x.value); });
  }

  /* ============================================================
     FMP
     ============================================================ */
  function fmpGet(path, params) {
    params.apikey = getKey('fmp');
    return getJson(URLS.fmp + path + '?' + qs(params), 'fmp').then(function (d) {
      if (d && !Array.isArray(d) && (d['Error Message'] || d.error)) {
        throw fail('auth', 'FMP: ' + String(d['Error Message'] || d.error).slice(0, 160));
      }
      return d;
    });
  }

  function settle(promise) {
    return promise.then(function (v) { return { ok: true, v: v }; }, function (e) { return { ok: false, e: e }; });
  }

  function fmpFundamentals(symbol) {
    return Promise.all([
      settle(fmpGet('ratios-ttm', { symbol: symbol })),
      settle(fmpGet('key-metrics-ttm', { symbol: symbol })),
      settle(fmpGet('income-statement', { symbol: symbol, limit: 6 }))
    ]).then(function (res) {
      if (!res[0].ok && !res[1].ok && !res[2].ok) throw res[0].e;
      var first = function (r) { return r.ok && Array.isArray(r.v) ? r.v[0] : (r.ok && r.v && !Array.isArray(r.v) ? r.v : null); };
      var rt = first(res[0]), km = first(res[1]);
      var notes = [];
      res.forEach(function (r, i) {
        if (!r.ok) notes.push(['Ratios', 'Key-Metrics', 'Gewinn- und Verlustrechnung'][i] + ': ' + r.e.message);
      });

      var ratios = [
        { label: 'KGV (TTM)', value: pick(rt, ['priceToEarningsRatioTTM', 'peRatioTTM']), kind: 'x' },
        { label: 'KBV', value: pick(rt, ['priceToBookRatioTTM']), kind: 'x' },
        { label: 'KUV', value: pick(rt, ['priceToSalesRatioTTM']), kind: 'x' },
        { label: 'PEG', value: pick(rt, ['priceToEarningsGrowthRatioTTM', 'pegRatioTTM']), kind: 'x' },
        { label: 'EV/EBITDA', value: pick(km, ['evToEBITDATTM', 'enterpriseValueOverEBITDATTM']), kind: 'x' },
        { label: 'Bruttomarge', value: pick(rt, ['grossProfitMarginTTM']), kind: 'frac' },
        { label: 'Operative Marge', value: pick(rt, ['operatingProfitMarginTTM']), kind: 'frac' },
        { label: 'Nettomarge', value: pick(rt, ['netProfitMarginTTM']), kind: 'frac' },
        { label: 'ROE', value: pick(km, ['returnOnEquityTTM']), kind: 'frac' },
        { label: 'ROIC', value: pick(km, ['returnOnInvestedCapitalTTM', 'roicTTM']), kind: 'frac' },
        { label: 'Verschuldung (D/E)', value: pick(rt, ['debtToEquityRatioTTM', 'debtEquityRatioTTM']), kind: 'x' },
        { label: 'Current Ratio', value: pick(rt, ['currentRatioTTM']), kind: 'x' },
        { label: 'FCF-Rendite', value: pick(km, ['freeCashFlowYieldTTM']), kind: 'frac' },
        { label: 'Dividendenrendite', value: pick(rt, ['dividendYieldTTM']), kind: 'frac' }
      ].filter(function (x) { return x.value != null; });

      var annual = res[2].ok && Array.isArray(res[2].v) ? res[2].v.map(function (r) {
        return {
          date: r.date || r.fiscalYear || '',
          revenue: pick(r, ['revenue']), grossProfit: pick(r, ['grossProfit']),
          operatingIncome: pick(r, ['operatingIncome']), netIncome: pick(r, ['netIncome']),
          eps: pick(r, ['epsDiluted', 'epsdiluted', 'eps'])
        };
      }) : [];

      if (!ratios.length && !annual.length) throw fail('empty', 'FMP liefert für dieses Symbol keine Daten.');
      return { provider: 'fmp', label: META.fmp.full, currency: (res[2].ok && res[2].v && res[2].v[0] && res[2].v[0].reportedCurrency) || 'USD',
               ratios: ratios, annual: sortNewest(annual), filings: [], notes: notes };
    });
  }

  /* ============================================================
     Alpha Vantage
     ============================================================ */
  function avGet(fn, symbol) {
    return getJson(URLS.av + '?' + qs({ function: fn, symbol: symbol, apikey: getKey('av') }), 'av').then(function (d) {
      if (d && (d.Note || d.Information)) throw fail('limit', 'Alpha Vantage: ' + String(d.Note || d.Information).slice(0, 160));
      if (d && d['Error Message']) throw fail('empty', 'Alpha Vantage kennt dieses Symbol nicht.');
      return d || {};
    });
  }

  function avFundamentals(symbol) {
    return Promise.all([settle(avGet('OVERVIEW', symbol)), settle(avGet('INCOME_STATEMENT', symbol))]).then(function (res) {
      if (!res[0].ok && !res[1].ok) throw res[0].e;
      var ov = res[0].ok ? res[0].v : {};
      var notes = [];
      if (!res[0].ok) notes.push('Overview: ' + res[0].e.message);
      if (!res[1].ok) notes.push('Gewinn- und Verlustrechnung: ' + res[1].e.message);

      var ratios = [
        { label: 'KGV', value: toNum(ov.PERatio), kind: 'x' },
        { label: 'Forward-KGV', value: toNum(ov.ForwardPE), kind: 'x' },
        { label: 'KBV', value: toNum(ov.PriceToBookRatio), kind: 'x' },
        { label: 'KUV (TTM)', value: toNum(ov.PriceToSalesRatioTTM), kind: 'x' },
        { label: 'PEG', value: toNum(ov.PEGRatio), kind: 'x' },
        { label: 'EV/EBITDA', value: toNum(ov.EVToEBITDA), kind: 'x' },
        { label: 'Nettomarge', value: toNum(ov.ProfitMargin), kind: 'frac' },
        { label: 'Operative Marge (TTM)', value: toNum(ov.OperatingMarginTTM), kind: 'frac' },
        { label: 'ROE (TTM)', value: toNum(ov.ReturnOnEquityTTM), kind: 'frac' },
        { label: 'ROA (TTM)', value: toNum(ov.ReturnOnAssetsTTM), kind: 'frac' },
        { label: 'Dividendenrendite', value: toNum(ov.DividendYield), kind: 'frac' },
        { label: 'EPS (TTM)', value: toNum(ov.EPS), kind: 'num' },
        { label: 'Beta', value: toNum(ov.Beta), kind: 'num' },
        { label: 'Marktkapitalisierung', value: toNum(ov.MarketCapitalization), kind: 'big' },
        { label: 'Kursziel Analysten', value: toNum(ov.AnalystTargetPrice), kind: 'cur' }
      ].filter(function (x) { return x.value != null; });

      var reports = (res[1].ok && res[1].v && res[1].v.annualReports) || [];
      var annual = reports.map(function (r) {
        return { date: r.fiscalDateEnding || '', revenue: toNum(r.totalRevenue), grossProfit: toNum(r.grossProfit),
                 operatingIncome: toNum(r.operatingIncome), netIncome: toNum(r.netIncome) };
      });

      if (!ratios.length && !annual.length) throw fail('empty', 'Alpha Vantage liefert für dieses Symbol keine Daten (evtl. kein US-Titel).');
      return { provider: 'av', label: META.av.full, currency: ov.Currency || 'USD', ratios: ratios, annual: sortNewest(annual), filings: [], notes: notes };
    });
  }

  /* ============================================================
     Polygon.io
     ============================================================ */
  function polygonGet(path, params) {
    params.apiKey = getKey('polygon');
    return getJson(URLS.polygon + path + '?' + qs(params), 'polygon').then(function (d) {
      if (d && (d.status === 'ERROR' || d.status === 'NOT_AUTHORIZED')) {
        throw fail('auth', 'Polygon: ' + String(d.message || d.error || d.status).slice(0, 160));
      }
      return d || {};
    });
  }

  function polygonFundamentals(symbol) {
    var sym = symbol.replace('-', '.');                // BRK-B → BRK.B
    return Promise.all([
      settle(polygonGet('vX/reference/financials', { ticker: sym, timeframe: 'annual', order: 'desc', limit: 6, sort: 'period_of_report_date' })),
      settle(polygonGet('v3/reference/tickers/' + encodeURIComponent(sym), {}))
    ]).then(function (res) {
      if (!res[0].ok && !res[1].ok) throw res[0].e;
      var notes = [];
      if (!res[0].ok) notes.push('Jahresabschlüsse: ' + res[0].e.message);
      var results = (res[0].ok && res[0].v.results) || [];
      var val = function (o) { return o && o.value != null ? toNum(o.value) : null; };

      var annual = results.map(function (r) {
        var f = r.financials || {}, is = f.income_statement || {}, bs = f.balance_sheet || {}, cf = f.cash_flow_statement || {};
        return {
          date: r.end_date || (r.fiscal_year ? r.fiscal_year + '' : ''),
          revenue: val(is.revenues), grossProfit: val(is.gross_profit), operatingIncome: val(is.operating_income_loss),
          netIncome: val(is.net_income_loss) != null ? val(is.net_income_loss) : val(is.net_income_loss_attributable_to_parent),
          eps: val(is.diluted_earnings_per_share), assets: val(bs.assets), equity: val(bs.equity),
          opCashFlow: val(cf.net_cash_flow_from_operating_activities)
        };
      });
      annual = sortNewest(annual);

      var ratios = ratiosFromAnnual(annual);
      var tk = res[1].ok && res[1].v && res[1].v.results;
      if (tk && tk.market_cap) ratios.unshift({ label: 'Marktkapitalisierung', value: toNum(tk.market_cap), kind: 'big' });

      if (!ratios.length && !annual.length) throw fail('empty', 'Polygon liefert für dieses Symbol keine Finanzdaten (evtl. nicht im Tarif enthalten).');
      return { provider: 'polygon', label: META.polygon.full, currency: 'USD', ratios: ratios, annual: annual, filings: [],
               notes: notes.concat(['Kennzahlen aus dem letzten Jahresabschluss berechnet.']) };
    });
  }

  /* ============================================================
     SEC EDGAR (statische JSON, erzeugt von scripts/fetch_edgar.py)
     ============================================================ */
  function edgarFundamentals(symbol) {
    return window.App.Data.getJsonFile('edgar/' + symbol + '.json').then(function (d) {
      if (!d || !Array.isArray(d.annual)) throw fail('empty', 'Ungültige EDGAR-Daten.');
      var annual = sortNewest(d.annual.map(function (r) {
        return { date: r.date, revenue: toNum(r.revenue), grossProfit: toNum(r.grossProfit), operatingIncome: toNum(r.operatingIncome),
                 netIncome: toNum(r.netIncome), eps: toNum(r.eps), assets: toNum(r.assets), equity: toNum(r.equity), opCashFlow: toNum(r.opCashFlow) };
      }));
      return { provider: 'edgar', label: 'SEC EDGAR' + (d.name ? ' · ' + d.name : ''), currency: 'USD', ratios: ratiosFromAnnual(annual),
               annual: annual, filings: d.filings || [], fetchedAt: d.fetchedAt,
               notes: ['Offizielle XBRL-Daten der Börsenaufsicht (10-K). Kennzahlen aus dem letzten Jahresabschluss berechnet.'] };
    }, function () {
      throw fail('nofile', 'Für ' + symbol + ' liegen noch keine EDGAR-Daten vor.');
    });
  }

  /* ---------- Öffentliche API: Fundamentaldaten ---------- */
  function isUsSymbol(ticker) { return !/\.[A-Z]{1,3}$/.test(ticker); }   // .DE, .PA, .L … = nicht US

  function getFundamentals(provider, ticker, opts) {
    var force = opts && opts.force;
    var symbol = ticker.toUpperCase();
    if (META[provider].needsKey && !getKey(provider)) return Promise.reject(fail('nokey', 'Kein API-Key hinterlegt.'));
    var ck = 'fund_' + provider + '_' + symbol;
    if (!force) { var hit = cacheGet(ck); if (hit) { hit.fromCache = true; return Promise.resolve(hit); } }

    var fn = provider === 'fmp' ? fmpFundamentals : provider === 'av' ? avFundamentals : provider === 'polygon' ? polygonFundamentals : edgarFundamentals;
    return fn(symbol).then(function (data) {
      data.fetchedAt = data.fetchedAt || new Date().toISOString();
      if (provider !== 'edgar') cacheSet(ck, data);
      return data;
    });
  }

  /* ============================================================
     Kongress-Trades (FMP: Senat + Repräsentantenhaus)
     ============================================================ */
  function parseAmount(text) {
    var nums = String(text || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || [];
    if (!nums.length) return { low: null, high: null };
    var lo = parseFloat(nums[0]), hi = nums.length > 1 ? parseFloat(nums[1]) : lo;
    if (/over/i.test(text) && nums.length === 1) hi = lo;
    return { low: lo, high: hi };
  }

  function normType(raw) {
    var t = String(raw || '').toLowerCase();
    if (t.indexOf('purchase') !== -1 || t === 'buy') return 'buy';
    if (t.indexOf('sale') !== -1 || t === 'sell') return 'sell';
    return 'other';
  }

  function normTrade(r, chamber) {
    var name = [r.firstName, r.lastName].filter(Boolean).join(' ') || r.representative || r.senator || r.office || '—';
    var amt = parseAmount(r.amount);
    return {
      chamber: chamber,
      name: name,
      ticker: (r.symbol || r.ticker || '').toUpperCase(),
      asset: r.assetDescription || r.asset || '',
      type: normType(r.type),
      rawType: r.type || '',
      txDate: (r.transactionDate || '').slice(0, 10),
      discDate: (r.disclosureDate || '').slice(0, 10),
      amountText: r.amount || '',
      amtLow: amt.low, amtHigh: amt.high,
      owner: r.owner || '',
      link: /^https:\/\//.test(r.link || '') ? r.link : ''
    };
  }

  /**
   * @param {string|null} symbol  Ticker oder null für die aktuellsten Meldungen aller Aktien
   */
  function getCongressTrades(symbol, opts) {
    var force = opts && opts.force;
    if (!getKey('fmp')) return Promise.reject(fail('nokey', 'Kein FMP-Key hinterlegt.'));
    var ck = 'congress_' + (symbol || 'latest');
    if (!force) { var hit = cacheGet(ck, 6 * 3600 * 1000); if (hit) { hit.fromCache = true; return Promise.resolve(hit); } }

    var senateReq = symbol ? fmpGet('senate-trades', { symbol: symbol }) : fmpGet('senate-latest', { page: 0, limit: 100 });
    var houseReq = symbol ? fmpGet('house-trades', { symbol: symbol }) : fmpGet('house-latest', { page: 0, limit: 100 });

    return Promise.all([settle(senateReq), settle(houseReq)]).then(function (res) {
      if (!res[0].ok && !res[1].ok) throw res[0].e;
      var trades = [];
      if (res[0].ok && Array.isArray(res[0].v)) res[0].v.forEach(function (r) { trades.push(normTrade(r, 'Senat')); });
      if (res[1].ok && Array.isArray(res[1].v)) res[1].v.forEach(function (r) { trades.push(normTrade(r, 'Repräsentantenhaus')); });
      trades.sort(function (a, b) { return (b.txDate || '').localeCompare(a.txDate || ''); });
      var notes = [];
      if (!res[0].ok) notes.push('Senat: ' + res[0].e.message);
      if (!res[1].ok) notes.push('Repräsentantenhaus: ' + res[1].e.message);
      var data = { trades: trades, notes: notes, fetchedAt: new Date().toISOString() };
      cacheSet(ck, data);
      return data;
    });
  }

  return {
    META: META,
    getKey: getKey, setKey: setKey, hasKey: hasKey, clearCache: clearCache,
    isUsSymbol: isUsSymbol,
    getFundamentals: getFundamentals,
    getCongressTrades: getCongressTrades,
    _test: { parseAmount: parseAmount, normTrade: normTrade, ratiosFromAnnual: ratiosFromAnnual, pick: pick, toNum: toNum }
  };
})();

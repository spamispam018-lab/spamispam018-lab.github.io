/**
 * workers/yahoo-proxy.js
 * Cloudflare Worker für die Aktien-App.
 *
 * Bereiche:
 *   /?ticker=…            Kursdaten von Yahoo (wie bisher, unverändert)
 *   /news?ticker=AAPL      Aktuelle Schlagzeilen einer Aktie (Yahoo)       Cache 15 Min.
 *   /reddit                Reddit-Aufmerksamkeit (ApeWisdom + Tradestie)   Cache 30 Min.
 *   /macro                 Makro-Umfeld (FRED + Yahoo)                     Cache 6 Std.
 *
 * Bei /news, /reddit und /macro holt "&refresh=1" sofort neue Daten (Aktualisieren-Knopf in der App).
 * Damit die Quellen nicht überlastet werden, wird ein Refresh frühestens 60 Sekunden nach dem
 * letzten Abruf ausgeführt; davor kommt der gerade erst geholte Stand zurück.
 *
 *   /lookup?q=ISIN         Wertpapier-Suche (ISIN, WKN, Name) über Yahoo   Cache 7 Tage
 *   /gh/status             Letzter Lauf der GitHub-Workflows                (App-Passwort nötig)
 *   /gh/dispatch  (POST)   GitHub-Workflow starten                          (App-Passwort nötig)
 *   /ai/ask       (POST)   KI-Einschätzung auf Abruf über Groq              (App-Passwort nötig) Cache 12 Std.
 *
 * Optional (Settings › Variables and Secrets):
 *   FRED_API_KEY   kostenloser Schlüssel von fred.stlouisfed.org – zuverlässiger als der CSV-Download
 *   GITHUB_TOKEN   Fine-grained Token, nur dieses Repo, Berechtigung "Actions: Read and write"
 *   APP_PASSWORD   frei gewähltes Passwort; die App schickt es im Header X-App-Key mit
 *   GITHUB_REPO    optional, Standard: spamispam018-lab/spamispam018-lab.github.io
 *   GROQ_API_KEY   Schlüssel von console.groq.com – für /ai/ask (KI-Einschätzung in der App)
 *
 * Kursdaten-Parameter (wie bisher):
 *   ticker (Pflicht), interval (Standard 1d), range (Standard 1d), includePrePost, crumb
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-App-Key'
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const MIN_REFRESH_SECONDS = 60;

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const force = url.searchParams.get('refresh') === '1';

    try {
      if (path === '/news') {
        const ticker = cleanTicker(url.searchParams.get('ticker'));
        if (!ticker) return jsonResponse({ error: 'Bitte ?ticker=XXX anhängen' }, 400);
        return await cachedJson('news/' + ticker, 15 * 60, force, () => buildNews(ticker));
      }
      if (path === '/reddit') {
        return await cachedJson('reddit', 30 * 60, force, () => buildReddit());
      }
      if (path === '/macro') {
        return await cachedJson('macro', 6 * 60 * 60, force, () => buildMacro(env));
      }
      if (path === '/lookup') {
        const q = String(url.searchParams.get('q') || '').trim().toUpperCase();
        if (!/^[A-Z0-9.\- ]{2,30}$/.test(q)) return jsonResponse({ error: 'Ungültige Suche' }, 400);
        return await cachedJson('lookup/' + encodeURIComponent(q), 7 * 24 * 60 * 60, false, () => buildLookup(q));
      }
      if (path === '/gh/status') {
        return await ghStatus(request, env);
      }
      if (path === '/gh/dispatch') {
        return await ghDispatch(request, env);
      }
      if (path === '/ai/ask') {
        return await aiAsk(request, env);
      }
    } catch (error) {
      return jsonResponse({ error: String(error && error.message || error) }, 500);
    }

    // Standard: Kursdaten (unverändertes Verhalten)
    return handleChart(url);
  }
};

// ===========================================================================
// Hilfsfunktionen
// ===========================================================================

function jsonResponse(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({}, CORS, { 'Content-Type': 'application/json; charset=utf-8' }, extra || {})
  });
}

function cleanTicker(t) {
  const s = String(t || '').trim().toUpperCase();
  return /^[A-Z0-9.\-^=]{1,15}$/.test(s) ? s : '';
}

/**
 * Antwort aus dem Edge-Cache, sonst neu erzeugen.
 * force = true holt neue Daten, außer der letzte Abruf ist jünger als MIN_REFRESH_SECONDS.
 * Schlägt das Neu-Erzeugen fehl, wird ein vorhandener alter Stand mit stale: true geliefert.
 */
async function cachedJson(name, ttl, force, producer) {
  const cache = caches.default;
  const key = new Request('https://aktien-app.internal/v1/' + name, { method: 'GET' });
  // Der Cache-Eintrag lebt länger als die Frische-Zeit, damit bei Fehlern ein alter Stand bleibt
  const hit = await cache.match(key);
  let hitObj = null;
  let age = Infinity;
  if (hit) {
    try {
      hitObj = await hit.json();
      age = (Date.now() - Date.parse(hitObj.fetchedAt)) / 1000;
    } catch (_) { hitObj = null; }
  }

  const fresh = hitObj && age < ttl;
  const tooSoon = hitObj && age < MIN_REFRESH_SECONDS;
  if (hitObj && ((fresh && !force) || tooSoon)) {
    return jsonResponse(hitObj, 200, { 'X-Cache': 'HIT', 'X-Age': String(Math.round(age)) });
  }

  try {
    const data = await producer();
    data.fetchedAt = new Date().toISOString();
    const store = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=' + (ttl * 8) }
    });
    try { await cache.put(key, store); } catch (_) { /* Speicher voll o. Ä. – ignorieren */ }
    return jsonResponse(data, 200, { 'X-Cache': 'MISS' });
  } catch (error) {
    if (hitObj) {
      hitObj.stale = true;
      hitObj.error = String(error && error.message || error);
      return jsonResponse(hitObj, 200, { 'X-Cache': 'STALE' });
    }
    throw error;
  }
}

async function fetchText(url, headers, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
  try {
    const res = await fetch(url, { headers: Object.assign({ 'User-Agent': UA }, headers || {}), signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' von ' + new URL(url).hostname);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, headers, timeoutMs) {
  return JSON.parse(await fetchText(url, Object.assign({ 'Accept': 'application/json' }, headers || {}), timeoutMs));
}

// Yahoo-Sitzung (Cookie + Crumb), einmal pro Aufruf geholt
async function yahooSession() {
  const cookieRes = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } });
  const setCookie = cookieRes.headers.getSetCookie ? cookieRes.headers.getSetCookie() : [cookieRes.headers.get('set-cookie')];
  const cookies = setCookie.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const crumb = await fetchText('https://query1.finance.yahoo.com/v1/test/getcrumb', { 'Cookie': cookies });
  if (!crumb || crumb.includes('<html') || crumb.length > 30) throw new Error('Yahoo-Crumb nicht verfügbar');
  return { cookies, crumb };
}

// ===========================================================================
// /news – Schlagzeilen
// ===========================================================================

async function buildNews(ticker) {
  const url = 'https://query2.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(ticker) +
    '&quotesCount=0&newsCount=15&enableFuzzyQuery=false&listsCount=0';
  let data;
  try {
    data = await fetchJson(url);
  } catch (e) {
    // Manche Anfragen verlangen eine Yahoo-Sitzung
    const s = await yahooSession();
    data = await fetchJson(url + '&crumb=' + encodeURIComponent(s.crumb), { 'Cookie': s.cookies });
  }
  const seen = new Set();
  const items = [];
  for (const n of (data && data.news) || []) {
    const title = String(n.title || '').trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    const ts = Number(n.providerPublishTime);
    items.push({
      title,
      source: n.publisher || '',
      date: ts ? new Date(ts * 1000).toISOString() : null,
      url: n.link || ''
    });
  }
  items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { ticker, items: items.slice(0, 15) };
}

// ===========================================================================
// /lookup – ISIN/WKN/Name -> Yahoo-Symbole
// ===========================================================================

async function buildLookup(q) {
  const url = 'https://query2.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(q) +
    '&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false';
  let data;
  try {
    data = await fetchJson(url);
  } catch (e) {
    const s = await yahooSession();
    data = await fetchJson(url + '&crumb=' + encodeURIComponent(s.crumb), { 'Cookie': s.cookies });
  }
  const quotes = ((data && data.quotes) || []).filter((x) => x.symbol).map((x) => ({
    symbol: String(x.symbol).toUpperCase(),
    name: x.longname || x.shortname || x.symbol,
    exchange: x.exchDisp || x.exchange || '',
    type: x.typeDisp || x.quoteType || ''
  }));
  return { q, quotes };
}

// ===========================================================================
// /reddit – ApeWisdom + Tradestie (gleiche Felder wie scripts/fetch_reddit.py)
// ===========================================================================

const APE_FILTERS = ['all-stocks', 'wallstreetbets'];
const APE_MAX_PAGES = 4;        // je Filter; schont das Anfrage-Limit des Workers
const REDDIT_MAX_TICKERS = 400;

function toInt(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

async function fetchApe(filter) {
  const out = [];
  for (let page = 1; page <= APE_MAX_PAGES; page++) {
    let data;
    try {
      data = await fetchJson('https://apewisdom.io/api/v1.0/filter/' + filter + '/page/' + page);
    } catch (e) {
      if (page === 1) throw e;
      break;
    }
    out.push(...(data.results || []));
    if (page >= (data.pages || 1)) break;
  }
  return out;
}

async function buildReddit() {
  const [apeLists, tsList] = await Promise.all([
    Promise.allSettled(APE_FILTERS.map(fetchApe)),
    fetchJson('https://tradestie.com/api/v1/apps/reddit').catch(() => [])
  ]);

  const ape = {};
  let apeOk = false;
  for (const r of apeLists) {
    if (r.status !== 'fulfilled') continue;
    apeOk = true;
    for (const item of r.value) {
      const t = String(item.ticker || '').toUpperCase();
      if (!t) continue;
      const d = ape[t] || (ape[t] = { mentions: 0, upvotes: 0, mentions_24h_ago: 0, rank: null });
      d.mentions += toInt(item.mentions);
      d.upvotes += toInt(item.upvotes);
      d.mentions_24h_ago += toInt(item.mentions_24h_ago);
      const rk = toInt(item.rank);
      if (rk && (d.rank === null || rk < d.rank)) d.rank = rk;
    }
  }

  const ts = {};
  for (const item of Array.isArray(tsList) ? tsList : []) {
    const t = String(item.ticker || '').toUpperCase();
    if (t) ts[t] = { sentiment: item.sentiment || null, sentiment_score: item.sentiment_score ?? null, wsb_comments: toInt(item.no_of_comments) };
  }
  if (!apeOk && !Object.keys(ts).length) throw new Error('ApeWisdom und Tradestie nicht erreichbar');

  const tickers = Array.from(new Set([...Object.keys(ape), ...Object.keys(ts)]));
  tickers.sort((a, b) => ((ape[b] || {}).mentions || 0) - ((ape[a] || {}).mentions || 0));
  const top = tickers.slice(0, REDDIT_MAX_TICKERS);
  const maxMentions = Math.max(1, ...top.map((t) => (ape[t] || {}).mentions || 0));

  const items = {};
  for (const t of top) {
    const d = ape[t] || {};
    const s = ts[t] || {};
    const mentions = d.mentions || 0;
    const old = d.mentions_24h_ago || 0;
    items[t] = {
      ticker: t,
      mentions,
      upvotes: d.upvotes || 0,
      rank: d.rank ?? null,
      change_pct: old ? Math.round((mentions - old) / old * 1000) / 10 : 0,
      buzz: mentions ? Math.round(mentions / maxMentions * 1000) / 1000 : 0,
      sentiment: s.sentiment || null,
      sentiment_score: s.sentiment_score ?? null,
      wsb_comments: s.wsb_comments || 0
    };
  }
  return { sources: { apewisdom: apeOk, tradestie: Object.keys(ts).length > 0 }, items };
}

// ===========================================================================
// /macro – gleiche Reihen, Regeln und Ausgabe wie scripts/fetch_macro.py
// ===========================================================================

const KEEP = 60;

const SIG = {
  yield10: (v) => [v >= 5.0 ? 'bad' : v >= 4.5 ? 'warn' : 'ok', 'Hohe Renditen belasten Wachstums- und Immobilienwerte.'],
  curve: (v) => [v < 0 ? 'warn' : 'ok', 'Negativ = invertierte Zinskurve, historisch ein Rezessions-Warnsignal.'],
  neutral: () => ['neutral', ''],
  infl: (v) => [v >= 4 ? 'bad' : v >= 3 ? 'warn' : 'ok', 'Über ca. 3 % bleiben die Notenbanken tendenziell vorsichtig.'],
  vix: (v) => [v >= 30 ? 'bad' : v >= 20 ? 'warn' : 'ok', 'Über 20 nervöser Markt, über 30 Stress.'],
  sahm: (v) => [v >= 0.5 ? 'bad' : v >= 0.3 ? 'warn' : 'ok', 'Ab 0,5 Prozentpunkten gilt die Sahm-Regel als Rezessionssignal.'],
  claims: (v) => [v >= 300000 ? 'bad' : v >= 260000 ? 'warn' : 'ok', 'Steigende Erstanträge deuten auf einen schwächeren Arbeitsmarkt.'],
  unrate: (v, d) => [d != null && d >= 0.3 ? 'warn' : 'ok', 'Ein schneller Anstieg ist ein Warnsignal.'],
  hy: (v) => [v >= 5.5 ? 'bad' : v >= 4.0 ? 'warn' : 'ok', 'Steigende Aufschläge zeigen Kreditstress, oft vor Kursverlusten.'],
  ig: (v) => [v >= 2.0 ? 'bad' : v >= 1.4 ? 'warn' : 'ok', 'Aufschlag guter Unternehmensanleihen, steigt bei Stress.'],
  delinq: (v, d) => [d != null && d > 0.15 ? 'warn' : 'neutral', 'Steigende Ausfälle belasten vor allem Banken und Immobilienfirmen (Daten hinken hinterher).']
};

// [ids, Gruppe, Titel, Einheit, Art, Frequenz, Nachkommastellen, Regel, Erklärung]
const FRED_SERIES = [
  [['DGS10'], 'Zinsen', 'US-Rendite 10 Jahre', '%', 'level', 'd', 2, 'yield10', 'Referenzzins für Bewertungen weltweit.'],
  [['T10Y2Y'], 'Zinsen', 'US-Zinskurve (10J minus 2J)', 'Pp', 'level', 'd', 2, 'curve', 'Abstand zwischen langen und kurzen Zinsen.'],
  [['DFF'], 'Zinsen', 'US-Leitzins (Fed Funds)', '%', 'level', 'd', 2, 'neutral', 'Zinsniveau der US-Notenbank.'],
  [['ECBDFR'], 'Zinsen', 'EZB-Einlagenzins', '%', 'level', 'd', 2, 'neutral', 'Leitzins der Europäischen Zentralbank.'],
  [['CPIAUCSL'], 'Inflation', 'US-Inflation (Vorjahr)', '%', 'yoy', 'm', 1, 'infl', 'Bestimmt den Zinspfad der Fed.'],
  [['CP0000EZ19M086NEST', 'CP0000EZ20M086NEST'], 'Inflation', 'Eurozone-Inflation (Vorjahr)', '%', 'yoy', 'm', 1, 'infl', 'Bestimmt den Zinspfad der EZB.'],
  [['SAHMREALTIME'], 'Arbeitsmarkt', 'Rezessionsindikator (Sahm-Regel)', 'Pp', 'level', 'm', 2, 'sahm', 'Anstieg der Arbeitslosigkeit gegenüber dem Vorjahrestief.'],
  [['ICSA'], 'Arbeitsmarkt', 'US-Erstanträge Arbeitslosenhilfe', '', 'level', 'w', 0, 'claims', 'Wöchentlicher Frühindikator für den Arbeitsmarkt.'],
  [['UNRATE'], 'Arbeitsmarkt', 'US-Arbeitslosenquote', '%', 'level', 'm', 1, 'unrate', 'Zeigt die Konjunkturlage.'],
  [['BAMLH0A0HYM2'], 'Kreditaufschläge', 'Hochzins-Aufschlag (US)', 'Pp', 'level', 'd', 2, 'hy', 'Risikoaufschlag riskanter Unternehmensanleihen.'],
  [['BAMLC0A0CM'], 'Kreditaufschläge', 'Unternehmensanleihen-Aufschlag (US, gute Bonität)', 'Pp', 'level', 'd', 2, 'ig', 'Aufschlag guter Unternehmensanleihen.'],
  [['DRSFRMACBS'], 'Kreditausfälle', 'Ausfallquote Wohnimmobilienkredite (US-Banken)', '%', 'level', 'q', 2, 'delinq', 'Quartalsdaten, hinkt der Lage hinterher.'],
  [['DRCRELEXFACBS'], 'Kreditausfälle', 'Ausfallquote Gewerbeimmobilienkredite (US-Banken)', '%', 'level', 'q', 2, 'delinq', 'Quartalsdaten, relevant für Banken und Immobilienfirmen.']
];

const YAHOO_SERIES = [
  ['^VIX', 'Marktangst', 'VIX (Schwankungsindex)', '', 'level', 'd', 1, 'vix', 'Erwartete Schwankung des S&P 500.'],
  ['EURUSD=X', 'Wechselkurs', 'EUR/USD', '', 'level', 'd', 4, 'neutral', 'Steigt der Euro, sinkt der Euro-Wert von US-Aktien.']
];

// Nur so viel Historie laden wie nötig (spart Rechenzeit im Worker)
const YEARS_BACK = { d: 1, w: 2, m: 7, q: 16 };

function startDate(freq) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - (YEARS_BACK[freq] || 2));
  return d.toISOString().slice(0, 10);
}

function parseCsv(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const [date, val] = lines[i].split(',');
    if (!date || !val || val === '.' ) continue;
    const v = parseFloat(val);
    if (!isNaN(v)) out.push([date, v]);
  }
  return out;
}

async function fetchFred(id, freq, env) {
  const start = startDate(freq);
  const key = env && env.FRED_API_KEY;
  if (key) {
    try {
      const data = await fetchJson('https://api.stlouisfed.org/fred/series/observations?series_id=' + id +
        '&api_key=' + encodeURIComponent(key) + '&file_type=json&observation_start=' + start);
      const pts = (data.observations || []).filter((o) => o.value !== '.' && o.value !== '')
        .map((o) => [o.date, parseFloat(o.value)]).filter((p) => !isNaN(p[1]));
      if (pts.length) return pts;
    } catch (_) { /* weiter mit CSV */ }
  }
  let csvError = null;
  try {
    const text = await fetchText('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id + '&cosd=' + start, { 'Accept': 'text/csv,*/*' });
    if (/^\s*</.test(text)) throw new Error('FRED liefert HTML statt CSV (Sperre)');
    const pts = parseCsv(text);
    if (pts.length) return pts;
    csvError = new Error('keine Werte');
  } catch (e) {
    csvError = e;
  }
  // Ausweichquelle DBnomics (spiegelt FRED). Nur für Monats-, Wochen- und Quartalsreihen,
  // Tagesreihen wären dort zu groß für die Rechenzeit des kostenlosen Workers.
  if (freq !== 'd') {
    try {
      const data = await fetchJson('https://api.db.nomics.world/v22/series/FRED/' + id + '?observations=1');
      const doc = data && data.series && data.series.docs && data.series.docs[0];
      if (doc) {
        const pts = [];
        const periods = doc.period || [];
        const values = doc.value || [];
        for (let i = 0; i < periods.length; i++) {
          if (values[i] == null || values[i] === 'NA' || periods[i] < start) continue;
          const d = String(periods[i]);
          // DBnomics: 2024-03 / 2024-Q1 / 2024-W12 / 2024-03-15 -> Datum
          let iso = d;
          let m;
          if ((m = /^(\d{4})-Q(\d)$/.exec(d))) iso = m[1] + '-' + String((+m[2] - 1) * 3 + 1).padStart(2, '0') + '-01';
          else if (/^\d{4}-\d{2}$/.test(d)) iso = d + '-01';
          const v = parseFloat(values[i]);
          if (!isNaN(v) && /^\d{4}-\d{2}-\d{2}$/.test(iso)) pts.push([iso, v]);
        }
        if (pts.length) return pts;
      }
    } catch (_) { /* unten melden */ }
  }
  throw new Error('FRED nicht erreichbar (' + (csvError && csvError.message || 'unbekannt') + ')' + (key ? '' : ' – FRED_API_KEY beim Worker hinterlegen'));
}

/** Führt Aufgaben mit begrenzter Parallelität aus (FRED drosselt viele gleichzeitige Anfragen). */
async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}

async function fetchYahooDaily(symbol, session) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) +
    '?interval=1d&range=1y' + (session ? '&crumb=' + encodeURIComponent(session.crumb) : '');
  const data = await fetchJson(url, session ? { 'Cookie': session.cookies } : {});
  const r = data && data.chart && data.chart.result && data.chart.result[0];
  if (!r) throw new Error('keine Daten');
  const ts = r.timestamp || [];
  const close = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  const pts = [];
  for (let i = 0; i < ts.length; i++) {
    if (close[i] != null && isFinite(close[i])) pts.push([new Date(ts[i] * 1000).toISOString().slice(0, 10), close[i]]);
  }
  return pts;
}

function toYoy(points) {
  const res = [];
  for (let i = 12; i < points.length; i++) {
    const prev = points[i - 12][1];
    if (prev) res.push([points[i][0], (points[i][1] / prev - 1) * 100]);
  }
  return res;
}

function deltaFor(points, freq) {
  if (points.length < 2) return [null, ''];
  const last = points[points.length - 1];
  if (freq === 'd') {
    const target = Date.parse(last[0]) - 30 * 86400000;
    let ref = null;
    for (let i = points.length - 2; i >= 0; i--) {
      if (Date.parse(points[i][0]) <= target) { ref = points[i][1]; break; }
    }
    if (ref === null) ref = points[0][1];
    return [last[1] - ref, 'ggü. 1 Monat'];
  }
  if (freq === 'w') {
    const ref = points.length >= 5 ? points[points.length - 5][1] : points[0][1];
    return [last[1] - ref, 'ggü. 4 Wochen'];
  }
  return [last[1] - points[points.length - 2][1], 'ggü. Vorperiode'];
}

function round4(v) { return Math.round(v * 10000) / 10000; }

function buildItem(spec, id, points) {
  const [, group, title, unit, kind, freq, dec, rule, why] = spec;
  if (kind === 'yoy') points = toYoy(points);
  if (freq === 'w' && points.length >= 4) {
    const sm = [];
    for (let i = 3; i < points.length; i++) {
      sm.push([points[i][0], (points[i][1] + points[i - 1][1] + points[i - 2][1] + points[i - 3][1]) / 4]);
    }
    points = sm;
  }
  if (!points.length) return null;
  const value = points[points.length - 1][1];
  const [delta, deltaLabel] = deltaFor(points, freq);
  const [signal, hint] = SIG[rule](value, delta);
  return {
    id, group, title, unit, freq, decimals: dec,
    value: round4(value), delta: delta == null ? null : round4(delta), deltaLabel,
    date: points[points.length - 1][0], signal, hint, why,
    series: points.slice(-KEEP).map((p) => round4(p[1]))
  };
}

async function buildMacro(env) {
  const errors = [];

  const fredJobs = mapLimit(FRED_SERIES, 3, async (spec) => {
    const [ids, , , , , freq] = spec;
    for (const id of ids) {
      try {
        const item = buildItem(spec, ids[0], await fetchFred(id, freq, env));
        if (item) return item;
      } catch (e) {
        errors.push(id + ': ' + (e && e.message || e));
      }
    }
    return null;
  });

  let session = null;
  try { session = await yahooSession(); } catch (_) { /* Chart-Endpoint geht oft auch ohne */ }
  const yahooJobs = YAHOO_SERIES.map(async (spec) => {
    try {
      const item = buildItem([null].concat(spec.slice(1)), spec[0], await fetchYahooDaily(spec[0], session));
      return item;
    } catch (e) {
      errors.push(spec[0] + ': ' + (e && e.message || e));
      return null;
    }
  });

  const items = (await fredJobs).concat(await Promise.all(yahooJobs)).filter(Boolean);

  // Ersatz für die 10-jährige US-Rendite
  if (!items.some((i) => i.id === 'DGS10')) {
    try {
      const it = buildItem(FRED_SERIES[0], 'DGS10', await fetchYahooDaily('^TNX', session));
      if (it) { it.title = 'US-Rendite 10 Jahre (Yahoo)'; items.unshift(it); }
    } catch (_) {}
  }

  if (!items.length) throw new Error('Keine Makro-Daten abrufbar: ' + errors.slice(0, 3).join('; '));
  return { updated: new Date().toISOString(), items, errors };
}

// ===========================================================================
// /gh/* – GitHub-Workflows aus der App starten
// ===========================================================================

// Nur diese Workflows dürfen gestartet werden; erlaubte Eingaben je Workflow
const GH_WORKFLOWS = {
  'update_data.yml': { inputs: { sync_mode: ['delta', 'full'], ticker: 'ticker', only: 'any' } },
  'update_news.yml': { inputs: {} },
  'fetch_reddit.yml': { inputs: {} },
  'update_macro.yml': { inputs: {} },
  'update_ai.yml': { inputs: { only: 'any' } },
  'update_de_symbols.yml': { inputs: { ticker: 'ticker', max: 'number' } }
};

function ghRepo(env) {
  return (env && env.GITHUB_REPO) || 'spamispam018-lab/spamispam018-lab.github.io';
}

function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function ghCheckAuth(request, env) {
  if (!env || !env.GITHUB_TOKEN || !env.APP_PASSWORD) {
    return jsonResponse({ error: 'Im Worker fehlen GITHUB_TOKEN oder APP_PASSWORD (Settings › Variables and Secrets).', setup: true }, 503);
  }
  if (!safeEqual(request.headers.get('X-App-Key'), env.APP_PASSWORD)) {
    return jsonResponse({ error: 'Falsches App-Passwort.', auth: true }, 401);
  }
  return null;
}

// ===========================================================================
// /ai/ask – KI-Einschätzung auf Abruf (Groq)
// ===========================================================================

const AI_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'];
const AI_SYSTEM = 'Du bist ein nüchterner, sorgfältiger Aktienanalyst. Du gibst keine Kauf- oder Verkaufsempfehlungen, ' +
  'sondern ordnest Kennzahlen, Chart-Signale und Nachrichten ein. Stütze dich nur auf die gelieferten Daten, erfinde keine Zahlen. ' +
  'Schreibe auf Deutsch, knapp und konkret. Antworte ausschließlich mit einem gültigen JSON-Objekt im verlangten Format.';

async function aiAsk(request, env) {
  if (request.method !== 'POST') return jsonResponse({ error: 'POST erwartet' }, 405);
  if (!env || !env.APP_PASSWORD || !env.GROQ_API_KEY) {
    return jsonResponse({ error: 'Im Worker fehlen GROQ_API_KEY oder APP_PASSWORD (Settings › Variables and Secrets).', setup: true }, 503);
  }
  if (!safeEqual(request.headers.get('X-App-Key'), env.APP_PASSWORD)) {
    return jsonResponse({ error: 'Falsches App-Passwort.', auth: true }, 401);
  }
  let body;
  try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Ungültige Anfrage' }, 400); }
  const prompt = String(body.prompt || '');
  const id = String(body.id || '').replace(/[^A-Za-z0-9._\-\/]/g, '').slice(0, 80);
  if (!prompt || prompt.length > 16000 || !id) return jsonResponse({ error: 'Anfrage leer oder zu groß' }, 400);
  const day = new Date().toISOString().slice(0, 10);
  return await cachedJson('ai/' + id + '/' + day, 12 * 60 * 60, !!body.force, () => groqAsk(env, prompt));
}

async function groqAsk(env, prompt) {
  let last = '';
  for (const model of AI_MODELS) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.GROQ_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({
        model,
        messages: [{ role: 'system', content: AI_SYSTEM }, { role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_completion_tokens: 2000
      }, model.indexOf('gpt-oss') !== -1 ? { reasoning_effort: 'low' } : {}))
    });
    const text = await res.text();
    if (res.ok) {
      try {
        const j = JSON.parse(text);
        const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        return { model, answer: JSON.parse(content) };
      } catch (e) { last = 'Antwort nicht lesbar'; continue; }
    }
    last = 'HTTP ' + res.status + ': ' + text.slice(0, 200);
    // Minutenlimit, zu groß, überlastet, Modell weg -> nächstes Modell
    if ([400, 404, 413, 429, 498, 500, 502, 503].indexOf(res.status) === -1) break;
  }
  throw new Error(last || 'Keine Antwort');
}

async function ghApi(env, path, init) {
  const res = await fetch('https://api.github.com/repos/' + ghRepo(env) + path, Object.assign({}, init || {}, {
    headers: Object.assign({
      'Authorization': 'Bearer ' + env.GITHUB_TOKEN,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'aktien-app-worker'
    }, (init && init.headers) || {})
  }));
  return res;
}

async function lastRun(env, file) {
  const res = await ghApi(env, '/actions/workflows/' + file + '/runs?per_page=1');
  if (!res.ok) return { file, error: 'HTTP ' + res.status };
  const data = await res.json();
  const r = (data.workflow_runs || [])[0];
  if (!r) return { file, status: 'none' };
  return {
    file,
    status: r.status,                 // queued | in_progress | completed
    conclusion: r.conclusion,         // success | failure | cancelled | null
    event: r.event,                   // schedule | workflow_dispatch | workflow_run
    startedAt: r.run_started_at || r.created_at,
    updatedAt: r.updated_at,
    url: r.html_url
  };
}

async function ghStatus(request, env) {
  const denied = ghCheckAuth(request, env);
  if (denied) return denied;
  const runs = await Promise.all(Object.keys(GH_WORKFLOWS).map((f) => lastRun(env, f).catch((e) => ({ file: f, error: String(e.message || e) }))));
  const out = {};
  runs.forEach((r) => { out[r.file] = r; });
  return jsonResponse({ repo: ghRepo(env), runs: out, checkedAt: new Date().toISOString() });
}

async function ghDispatch(request, env) {
  if (request.method !== 'POST') return jsonResponse({ error: 'Bitte POST verwenden.' }, 405);
  const denied = ghCheckAuth(request, env);
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Ungültige Anfrage.' }, 400); }
  const file = String(body.workflow || '');
  const spec = GH_WORKFLOWS[file];
  if (!spec) return jsonResponse({ error: 'Dieser Workflow ist nicht freigegeben.' }, 400);

  // Eingaben prüfen: nur bekannte Felder, nur gültige Werte
  const inputs = {};
  const given = body.inputs || {};
  for (const [k, rule] of Object.entries(spec.inputs)) {
    if (given[k] === undefined || given[k] === null || given[k] === '') continue;
    const v = String(given[k]).trim();
    if (Array.isArray(rule) && !rule.includes(v)) return jsonResponse({ error: 'Ungültiger Wert für ' + k }, 400);
    if (rule === 'ticker' && !cleanTicker(v)) return jsonResponse({ error: 'Ungültiger Ticker' }, 400);
    if (rule === 'number' && !/^\d{1,4}$/.test(v)) return jsonResponse({ error: 'Ungültige Zahl für ' + k }, 400);
    if (rule === 'any' && !/^[\w .,\-]{1,40}$/.test(v)) return jsonResponse({ error: 'Ungültiger Wert für ' + k }, 400);
    inputs[k] = rule === 'ticker' ? cleanTicker(v) : v;
  }

  // Nicht doppelt starten, solange ein Lauf wartet oder läuft
  const prev = await lastRun(env, file).catch(() => null);
  if (prev && (prev.status === 'queued' || prev.status === 'in_progress')) {
    return jsonResponse({ ok: false, running: true, error: 'Läuft bereits.', run: prev }, 409);
  }

  const res = await ghApi(env, '/actions/workflows/' + file + '/dispatches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs })
  });
  if (res.status !== 204) {
    const txt = (await res.text()).slice(0, 300);
    return jsonResponse({ ok: false, error: 'GitHub antwortet ' + res.status + ': ' + txt }, 502);
  }
  return jsonResponse({ ok: true, workflow: file, inputs, startedAt: new Date().toISOString() });
}

// ===========================================================================
// Kursdaten (bisheriges Verhalten)
// ===========================================================================

async function handleChart(url) {
  const ticker = url.searchParams.get('ticker');
  if (!ticker) {
    return new Response('Bitte ?ticker=XXX anhängen', { status: 400, headers: CORS });
  }

  const interval = sanitizeInterval(url.searchParams.get('interval') || '1d');
  const range = sanitizeRange(url.searchParams.get('range') || '1d');
  const includePrePost = url.searchParams.get('includePrePost') === 'true' ? 'true' : 'false';
  const useCrumb = url.searchParams.get('crumb') !== 'false';

  const cacheKey = new Request(
    'https://yahoo-proxy.internal/' + encodeURIComponent(ticker) + '/' +
      interval + '/' + range + '/' + includePrePost + '/' + (useCrumb ? 'c' : 'n'),
    { method: 'GET' }
  );
  const cache = caches.default;

  const cacheTTL =
    interval === '1m' ? 30 :
    interval === '2m' ? 45 :
    interval === '5m' ? 60 :
    interval === '15m' ? 120 :
    interval === '30m' ? 180 :
    (interval === '60m' || interval === '1h') ? 300 :
    900;

  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));
    headers.set('X-Cache', 'HIT');
    return new Response(cached.body, { status: cached.status, headers });
  }

  try {
    let cookies = '';
    let crumb = '';
    if (useCrumb) {
      const s = await yahooSession();
      cookies = s.cookies;
      crumb = s.crumb;
    }

    const chartUrl =
      'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) +
      '?interval=' + interval + '&range=' + range + '&includePrePost=' + includePrePost +
      '&events=div%2Csplit%2CcapitalGain' + (useCrumb ? '&crumb=' + encodeURIComponent(crumb) : '');

    const chartRes = await fetch(chartUrl, {
      headers: { 'User-Agent': UA, 'Cookie': cookies, 'Accept': 'application/json' }
    });
    if (!chartRes.ok) throw new Error('HTTP ' + chartRes.status + ' von Yahoo');

    const data = await chartRes.json();
    const isError = !data || !data.chart || data.chart.error || !data.chart.result || data.chart.result.length === 0;
    if (isError) {
      return new Response(JSON.stringify(data), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const responseToCache = new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=' + cacheTTL }
    });
    try { await cache.put(cacheKey, responseToCache.clone()); } catch (_) {}

    return new Response(responseToCache.body, {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/json',
        'X-Cache': 'MISS',
        'X-Interval': interval,
        'X-Range': range,
        'X-PrePost': includePrePost
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
}

function sanitizeInterval(i) {
  const allowed = ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo'];
  return allowed.includes(i) ? i : '1d';
}

function sanitizeRange(r) {
  const allowed = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'];
  return allowed.includes(r) ? r : '1d';
}

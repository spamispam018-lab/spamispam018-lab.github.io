/**
 * sw.js – Service Worker (muss im Hauptordner liegen, damit er die ganze App abdeckt).
 *
 * Strategie:
 * - App-Dateien (HTML, JS, CSS): Netzwerk zuerst, bei fehlender Verbindung aus dem Cache.
 *   So kommen Updates nach einem Push sofort an, ohne dass die Cache-Version erhöht werden muss.
 * - Daten (/data/… und raw.githubusercontent.com): Netzwerk zuerst, offline der letzte Stand.
 *   Der Zeitstempel-Parameter (?v=…) wird für den Cache ignoriert, damit sich keine Kopien ansammeln.
 * - Fremde Server (Live-Kurse, KI, Schriften): werden nicht angefasst.
 */
'use strict';

var CACHE_NAME = 'aktien-app-v2';
var NETWORK_TIMEOUT_MS = 4000;   // danach Cache verwenden (schwaches Netz)

var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './css/styles.css',
  './data/fallback.js',
  './js/format.js', './js/theme.js', './js/live-prices.js', './js/data.js', './js/transactions.js',
  './js/charts.js', './js/stock-score.js', './js/ui.js', './js/router.js', './js/export.js',
  './js/command-palette.js', './js/pwa.js', './js/screener.js', './js/market.js', './js/watchlist.js',
  './js/news.js', './js/stock-overview.js', './js/chart-analyse.js', './js/stock-chart.js',
  './js/stock-forecast.js', './js/stock-peers.js', './js/stock-fairvalue.js', './js/stock-insider.js',
  './js/stock-analyst.js', './js/stock-financials.js', './js/stock-institutional.js', './js/stock-options.js',
  './js/quant.js', './js/stock-risk.js', './js/strategy-saved.js', './js/stock-strategy.js', './js/strategy-scanner.js',
  './js/stock-live.js', './js/compare.js', './js/backtest.js', './js/portfolio.js', './js/dividends.js',
  './js/journal.js', './js/alerts.js', './js/earnings.js', './js/strategies.js', './js/macro.js',
  './js/premarket.js', './js/ai-insights.js', './js/sync.js', './js/app.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Einzeln laden: eine fehlende Datei darf nicht den ganzen Cache verhindern
      return Promise.all(APP_SHELL.map(function (u) {
        return cache.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function cacheKey(req) {
  var url = new URL(req.url);
  url.search = '';            // ?v=… / &t=… nicht als eigene Einträge speichern
  url.hash = '';
  return url.toString();
}

/** Netzwerk zuerst (mit Zeitlimit), sonst Cache. Erfolgreiche Antworten werden gespeichert. */
function networkFirst(req) {
  var key = cacheKey(req);
  // Eigene Dateien immer beim Server nachfragen (304 = günstig), damit kein veralteter HTTP-Cache greift
  var sameOrigin = new URL(req.url).origin === self.location.origin;
  var network = fetch(sameOrigin && req.mode !== 'navigate' ? new Request(req, { cache: 'no-cache' }) : req).then(function (res) {
    if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
      var copy = res.clone();
      caches.open(CACHE_NAME).then(function (c) { c.put(key, copy); });
    }
    return res;
  });

  var timeout = new Promise(function (resolve) {
    setTimeout(function () {
      caches.match(key).then(function (hit) { if (hit) resolve(hit); });
    }, NETWORK_TIMEOUT_MS);
  });

  return Promise.race([network, timeout]).catch(function () {
    return caches.match(key).then(function (hit) {
      if (hit) return hit;
      // Offline und nicht im Cache: bei Seitenaufrufen die App-Startseite liefern
      if (req.mode === 'navigate') return caches.match(new URL('./index.html', self.registration.scope).toString());
      return Response.error();
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  var sameOrigin = url.origin === self.location.origin;
  var githubData = url.hostname === 'raw.githubusercontent.com';
  if (!sameOrigin && !githubData) return;   // Live-Kurse, KI, Schriften: Browser regelt das selbst

  event.respondWith(networkFirst(req));
});

self.addEventListener('push', function (event) {
  var data = { title: 'Aktien-App', body: 'Neue Benachrichtigung' };
  try { if (event.data) data = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Aktien-App', {
      body: data.body || '',
      tag: data.tag || 'alerts',
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(target) !== -1 && 'focus' in list[i]) return list[i].focus();
      }
      return clients.openWindow(target);
    })
  );
});

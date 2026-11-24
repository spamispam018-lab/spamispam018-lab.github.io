/**
 * sw.js – Service Worker für PWA-Offline-Fähigkeit.
 * Cacht App-Shell; Netzwerk-Anfragen laufen mit Cache-Fallback.
 */
'use strict';
var CACHE_NAME = 'aktien-app-v29';
var APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './data/fallback.js',
  './js/format.js',
  './js/theme.js',
  './js/live-prices.js',
  './js/data.js',
  './js/transactions.js',
  './js/charts.js',
  './js/stock-score.js',
  './js/ui.js',
  './js/router.js',
  './js/export.js',
  './js/command-palette.js',
  './js/pwa.js',
  './js/screener.js',
  './js/market.js',
  './js/watchlist.js',
  './js/news.js',
  './js/stock-overview.js',
  './js/chart-analyse.js',
  './js/stock-chart.js',
  './js/stock-forecast.js',
  './js/stock-peers.js',
  './js/stock-fairvalue.js',
  './js/stock-insider.js',
  './js/stock-analyst.js',
  './js/stock-financials.js',
  './js/stock-institutional.js',
  './js/stock-options.js',
  './js/quant.js',
  './js/stock-risk.js',
  './js/stock-strategy.js',
  './js/strategy-scanner.js',
  './js/stock-live.js',
  './js/compare.js',
  './js/backtest.js',
  './js/portfolio.js',
  './js/dividends.js',
  './js/journal.js',
  './js/alerts.js',
  './js/earnings.js',
  './js/strategies.js',
  './js/macro.js',
  './js/premarket.js',
  './js/app.js',
  './manifest.json'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL).catch(function () {});
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

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // API/Data: Network-first, Cache-Fallback
  if (url.pathname.indexOf('/data/') === 0 || url.hostname === 'raw.githubusercontent.com') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  // App-Shell: Cache-first
  event.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});

self.addEventListener('push', function (event) {
  var data = { title: 'Aktien-App', body: 'Neue Benachrichtigung' };
  try { if (event.data) data = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Aktien-App', {
      body: data.body || '',
      icon: './manifest.json',
      badge: './manifest.json',
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
/**
 * js/transactions.js
 * Transaktions-Log mit FIFO-Kostenbasis.
 * Berechnet Positionen (Stück, Ø-Kaufkurs) aus Käufen/Verkäufen.
 */
window.App = window.App || {};
window.App.Transactions = (function () {
  'use strict';
  var STORAGE_KEY = 'app_transactions_v1';

  function getAll() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function add(tx) {
    var list = getAll();
    tx.id = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    list.push(tx);
    list.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    save(list);
    return tx;
  }

  function remove(id) {
    save(getAll().filter(function (t) { return t.id !== id; }));
  }

  /** FIFO-Positionen aus Transaktionen berechnen. */
  function computePositions() {
    var list = getAll();
    var byTicker = {};
    list.forEach(function (tx) {
      if (!byTicker[tx.ticker]) byTicker[tx.ticker] = [];
      byTicker[tx.ticker].push(tx);
    });
    var positions = {};
    Object.keys(byTicker).forEach(function (ticker) {
      var txs = byTicker[ticker].slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var lots = [];
      var realized = 0;
      txs.forEach(function (tx) {
        if (tx.type === 'buy') {
          lots.push({ shares: tx.shares, price: tx.price, date: tx.date });
        } else if (tx.type === 'sell') {
          var remaining = tx.shares;
          while (remaining > 0 && lots.length > 0) {
            var lot = lots[0];
            var use = Math.min(lot.shares, remaining);
            realized += (tx.price - lot.price) * use;
            lot.shares -= use;
            remaining -= use;
            if (lot.shares <= 0) lots.shift();
          }
        }
      });
      var totalShares = lots.reduce(function (a, l) { return a + l.shares; }, 0);
      var totalCost = lots.reduce(function (a, l) { return a + l.shares * l.price; }, 0);
      if (totalShares > 0) {
        positions[ticker] = {
          ticker: ticker,
          shares: totalShares,
          buyPrice: totalCost / totalShares,
          realized: realized
        };
      }
    });
    return positions;
  }

  /** Migriert altes app_portfolio_v1 einmalig. */
  function migrateOldPortfolio() {
    var OLD_KEY = 'app_portfolio_v1';
    var MIGRATED_KEY = 'app_portfolio_migrated_v1';
    if (localStorage.getItem(MIGRATED_KEY)) return;
    try {
      var old = JSON.parse(localStorage.getItem(OLD_KEY) || '[]');
      if (Array.isArray(old) && old.length) {
        var list = getAll();
        var today = new Date().toISOString().slice(0, 10);
        old.forEach(function (h) {
          list.push({
            id: 'mig_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            ticker: h.ticker,
            type: 'buy',
            shares: h.shares,
            price: h.buyPrice,
            date: today,
            note: 'Migriert aus altem Portfolio',
            migrated: true
          });
        });
        save(list);
        localStorage.setItem(MIGRATED_KEY, '1');
      }
    } catch (e) {}
  }

  return {
    getAll: getAll,
    add: add,
    remove: remove,
    computePositions: computePositions,
    migrateOldPortfolio: migrateOldPortfolio
  };
})();
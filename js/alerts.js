/**
 * js/alerts.js
 * Preisalarme: Zielkurs über/unter aktuellem Kurs, gespeichert in localStorage.
 * Beim App-Start (checkAndNotify) werden ausgelöste Alarme erkannt und als
 * Banner eingeblendet. Verwaltung über Watchlist-Reiter "Alarme".
 */
window.App = window.App || {};

window.App.Alerts = (function () {
  'use strict';

  var STORAGE_KEY = 'app_alerts_v1';

  function getAlerts() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveAlerts(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Prüft, ob ein Alarm mit dem gegebenen Kurs ausgelöst ist. */
  function isTriggered(alert, price) {
    if (price === null || price === undefined || isNaN(Number(price))) return false;
    return alert.direction === 'above' ? price >= alert.target : price <= alert.target;
  }

  /**
   * Lädt Kurse für alle aktiven Alarm-Ticker (bulk via Universum) und markiert
   * ausgelöste Alarme. Gibt die Liste der NEU ausgelösten Alarme zurück.
   */
  function checkAndNotify() {
    var alerts = getAlerts().filter(function (a) { return !a.triggeredAt; });
    if (!alerts.length) return Promise.resolve([]);

    var tickers = alerts.map(function (a) { return a.ticker; });
    return window.App.Data.getUniverse().then(function (universe) {
      var map = {};
      universe.forEach(function (u) { map[u.ticker] = u.price; });

      return Promise.all(tickers.map(function (t) {
        if (map[t] !== undefined && map[t] !== null) return Promise.resolve();
        return window.App.Data.getStock(t)
          .then(function (st) { map[t] = st.quote && st.quote.price; })
          .catch(function () { map[t] = undefined; });
      })).then(function () {
        var all = getAlerts();
        var newly = [];
        all.forEach(function (a) {
          if (!a.triggeredAt && isTriggered(a, map[a.ticker])) {
            a.triggeredAt = new Date().toISOString();
            a.triggerPrice = map[a.ticker];
            newly.push(a);
          }
        });
        if (newly.length) saveAlerts(all);
        newly.forEach(showBanner);
        return newly;
      });
    }).catch(function () { return []; });
  }

  /** Zeigt ein festes Banner oben für einen ausgelösten Alarm. */
  function showBanner(alert) {
    var F = window.App.Format;
    var div = document.createElement('div');
    div.style.cssText = 'position: fixed; top: 10px; left: 10px; right: 10px; z-index: 9999;' +
      'background: #1e293b; border: 1px solid var(--accent-purple-light, #818cf8); border-radius: 10px;' +
      'padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px;' +
      'box-shadow: 0 8px 24px rgba(0,0,0,0.5); font-size: 0.82rem;';
    div.innerHTML = '<div>🔔 <strong>' + esc(alert.ticker) + '</strong> hat ' +
      (alert.direction === 'above' ? 'über' : 'unter') + ' ' + F.currency(alert.target) +
      ' gehandelt (jetzt ' + F.currency(alert.triggerPrice) + ')</div>' +
      '<button style="background: none; border: none; color: #fff; font-size: 1.1rem; cursor: pointer;">&#10005;</button>';
    div.querySelector('button').onclick = function (e) { e.stopPropagation(); div.remove(); };
    div.onclick = function () {
      div.remove();
      window.App.Router.navigate('/stock/' + alert.ticker + '/overview');
    };
    document.body.appendChild(div);
    setTimeout(function () { if (div.parentNode) div.remove(); }, 15000);
  }

  function initView(host) {
    var container = host || document.getElementById('app-view-content');
    if (!container) return;
    var F = window.App.Format;

    container.innerHTML = '<div class="state-box"><div style="font-size: 0.85rem;">Alarme werden geladen…</div></div>';

    window.App.Data.getUniverse().then(function (universe) {
      var map = {};
      universe.forEach(function (u) { map[u.ticker] = u; });

      var alerts = getAlerts().slice().sort(function (a, b) {
        return (a.triggeredAt ? 1 : 0) - (b.triggeredAt ? 1 : 0);
      });

      var active = alerts.filter(function (a) { return !a.triggeredAt; });
      var done = alerts.filter(function (a) { return a.triggeredAt; });

      var datalist = universe.map(function (u) {
        return '<option value="' + esc(u.ticker) + '">' + esc(u.name) + '</option>';
      }).join('');

      var html = '' +
        '<div class="card" style="padding: 14px 16px; margin-bottom: 14px;">' +
          '<div class="card-header-dotted"><span class="card-title">Neuer Preisalarm</span></div>' +
          '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; align-items: end;">' +
            '<div><label style="font-size: 0.7rem; color: var(--text-dim);">Ticker</label>' +
              '<input id="al-in-ticker" class="search-input" style="width: 100%;" list="al-tickers" placeholder="TSLA" autocomplete="off">' +
              '<datalist id="al-tickers">' + datalist + '</datalist></div>' +
            '<div><label style="font-size: 0.7rem; color: var(--text-dim);">Zielkurs (€)</label>' +
              '<input id="al-in-target" class="search-input" style="width: 100%;" type="number" min="0" step="any" placeholder="200"></div>' +
            '<div><label style="font-size: 0.7rem; color: var(--text-dim);">Richtung</label>' +
              '<select id="al-in-dir" class="search-input" style="width: 100%; height: 38px;">' +
                '<option value="above">Kurs steigt über ⬆</option>' +
                '<option value="below">Kurs fällt unter ⬇</option>' +
              '</select></div>' +
            '<button class="chip-btn active" id="al-add-btn" style="height: 38px;">+ Alarm</button>' +
          '</div>' +
          '<div style="font-size: 0.68rem; color: var(--text-dim); margin-top: 8px;">' +
            'Alarme werden beim Öffnen der App gegen die neuesten Kursdaten geprüft (Datenstand der Pipeline).</div>' +
        '</div>';

      html += '<div style="font-size: 0.78rem; color: var(--text-dim); margin-bottom: 8px;">Aktive Alarme (' + active.length + ')</div>';
      if (!active.length) {
        html += '<div class="state-box" style="margin-bottom: 14px;"><div style="font-size: 0.8rem;">Keine aktiven Alarme.</div></div>';
      }
      active.forEach(function (a) {
        var u = map[a.ticker] || {};
        var px = u.price;
        var dist = (px !== undefined && px !== null) ? ((a.target / px) - 1) * 100 : null;
        html += '' +
          '<div class="card" style="padding: 10px 14px; margin-bottom: 8px;">' +
            '<div style="display: flex; justify-content: space-between; align-items: center;">' +
              '<div style="cursor: pointer;" class="al-goto" data-ticker="' + esc(a.ticker) + '"><strong>' + esc(a.ticker) + '</strong> ' +
                '<span style="font-size: 0.72rem; color: var(--text-dim);">' + esc(u.name || '') + '</span>' +
                '<div style="font-size: 0.72rem; color: var(--text-dim);">' +
                  (a.direction === 'above' ? '⬆ über' : '⬇ unter') + ' ' + F.currency(a.target) +
                  (px !== undefined && px !== null ? ' · aktuell ' + F.currency(px) : '') +
                  (dist !== null ? ' · <span style="color:' + (dist >= 0 ? 'var(--bullish, #34d399)' : 'var(--bearish, #f87171)') + ';">' + F.percent(dist, true, 1) + '</span>' : '') +
                '</div></div>' +
              '<button class="chip-btn al-del-btn" style="padding: 2px 8px; font-size: 0.7rem;" data-id="' + esc(a.id) + '">🗑</button>' +
            '</div>' +
          '</div>';
      });

      if (done.length) {
        html += '<div style="font-size: 0.78rem; color: var(--text-dim); margin: 14px 0 8px;">Ausgelöst (' + done.length + ')</div>';
        done.slice(-10).reverse().forEach(function (a) {
          html += '' +
            '<div class="card" style="padding: 10px 14px; margin-bottom: 8px; opacity: 0.65;">' +
              '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                '<div>✅ <strong>' + esc(a.ticker) + '</strong> ' +
                  '<span style="font-size: 0.72rem;">' + (a.direction === 'above' ? 'über' : 'unter') + ' ' +
                  F.currency(a.target) + ' (Kurs: ' + F.currency(a.triggerPrice) + ')</span></div>' +
                '<div style="font-size: 0.68rem; color: var(--text-dim);">' + F.date(a.triggeredAt) + '</div>' +
              '</div>' +
            '</div>';
        });
      }

      container.innerHTML = html;

      document.getElementById('al-add-btn').onclick = function () {
        var t = (document.getElementById('al-in-ticker').value || '').trim().toUpperCase();
        var target = parseFloat(document.getElementById('al-in-target').value);
        var dir = document.getElementById('al-in-dir').value;
        if (!t || !(target > 0)) { alert('Bitte Ticker und Zielkurs ausfüllen.'); return; }
        var list = getAlerts();
        list.push({
          id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          ticker: t, target: target, direction: dir,
          createdAt: new Date().toISOString(), triggeredAt: null
        });
        saveAlerts(list);
        initView(host);
      };

      container.querySelectorAll('.al-del-btn').forEach(function (btn) {
        btn.onclick = function () {
          saveAlerts(getAlerts().filter(function (a) { return a.id !== btn.getAttribute('data-id'); }));
          initView(host);
        };
      });

      container.querySelectorAll('.al-goto').forEach(function (el) {
        el.onclick = function () {
          window.App.Router.navigate('/stock/' + el.getAttribute('data-ticker') + '/overview');
        };
      });
    });
  }

  return { initView: initView, checkAndNotify: checkAndNotify };
})();

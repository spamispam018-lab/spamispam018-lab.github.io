/**
 * js/earnings.js
 * Earnings-Kalender: zeigt die nächsten Quartalsberichte aller Watchlist-Werte
 * sortiert nach Datum, mit historischen EPS-Überraschungen.
 * Nutzt das Pipeline-Feld analysts.nextEarningsDate.
 */
window.App = window.App || {};

window.App.Earnings = (function () {
  'use strict';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function daysTo(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    return Math.round((d.getTime() - Date.now()) / 86400000);
  }

  /** Ø EPS-Überraschung der letzten N Quartale mit tatsächlichem EPS. */
  function avgSurprise(epsEstimates) {
    var vals = (epsEstimates || [])
      .filter(function (e) { return e.actual !== null && e.actual !== undefined && e.surprisePercent !== null && e.surprisePercent !== undefined; })
      .slice(-4)
      .map(function (e) { return e.surprisePercent; });
    if (!vals.length) return null;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }

  function initView(host) {
    var container = host || document.getElementById('app-view-content');
    if (!container) return;
    var F = window.App.Format;
    var tickers = window.App.Data.getWatchlist();

    if (!tickers.length) {
      container.innerHTML = '<div class="state-box"><div style="font-size: 0.85rem;">Watchlist ist leer – keine Termine verfügbar.</div></div>';
      return;
    }

    container.innerHTML = '<div class="state-box"><div style="font-size: 0.85rem;">Termine werden geladen…</div></div>';

    Promise.all(tickers.map(function (t) {
      return window.App.Data.getStock(t)
        .then(function (st) {
          var analysts = st.analysts || {};
          return {
            ticker: t,
            name: (st.profile && st.profile.name) || t,
            nextDate: analysts.nextEarningsDate || null,
            epsEstimates: analysts.epsEstimates || []
          };
        })
        .catch(function () {
          return { ticker: t, name: t, nextDate: null, epsEstimates: [] };
        });
    })).then(function (items) {
      items.forEach(function (it) { it.days = daysTo(it.nextDate); });
      items.sort(function (a, b) {
        if (a.days === null && b.days === null) return a.ticker.localeCompare(b.ticker);
        if (a.days === null) return 1;
        if (b.days === null) return -1;
        return a.days - b.days;
      });

      var groups = [
        { key: 'soon', label: '⚡ Heute / überfällig', pred: function (d) { return d !== null && d <= 0; } },
        { key: 'week', label: '📅 Diese Woche', pred: function (d) { return d !== null && d >= 1 && d <= 7; } },
        { key: 'two_weeks', label: '🗓️ In 8–14 Tagen', pred: function (d) { return d !== null && d >= 8 && d <= 14; } },
        { key: 'later', label: '🔜 Später', pred: function (d) { return d !== null && d > 14; } },
        { key: 'unknown', label: '❓ Datum unbekannt', pred: function (d) { return d === null; } }
      ];

      var html = '';
      var knownCount = items.filter(function (it) { return it.days !== null; }).length;
      html += '<div style="font-size: 0.78rem; color: var(--text-dim); margin-bottom: 12px;">' +
        knownCount + ' von ' + items.length + ' Watchlist-Werten mit bekanntem Berichtstermin.</div>';

      groups.forEach(function (g) {
        var groupItems = items.filter(function (it) { return g.pred(it.days); });
        if (!groupItems.length) return;
        html += '<div style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin: 14px 0 8px;">' +
          g.label + ' (' + groupItems.length + ')</div>';
        groupItems.forEach(function (it) {
          var avg = avgSurprise(it.epsEstimates);
          var last = (it.epsEstimates || []).slice(-1)[0];
          html += '' +
            '<div class="card" style="padding: 10px 14px; margin-bottom: 8px;">' +
              '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                '<div style="cursor: pointer;" class="ec-goto" data-ticker="' + esc(it.ticker) + '">' +
                  '<strong>' + esc(it.ticker) + '</strong>' +
                  '<span style="font-size: 0.72rem; color: var(--text-dim);"> ' + esc(it.name) + '</span>' +
                  '<div style="font-size: 0.7rem; color: var(--text-dim); margin-top: 2px;">' +
                    (avg !== null
                      ? 'Ø EPS-Überraschung (4Q): <span style="color:' + (avg >= 0 ? 'var(--bullish, #34d399)' : 'var(--bearish, #f87171)') + ';">' + F.percent(avg, true, 1) + '</span>'
                      : 'Keine EPS-Historie') +
                    (last && last.surprisePercent !== null && last.surprisePercent !== undefined
                      ? ' · letztes Q: ' + F.percent(last.surprisePercent, true, 1) : '') +
                  '</div>' +
                '</div>' +
                '<div style="text-align: right;">' +
                  (it.nextDate
                    ? '<div style="font-weight: 700;">' + F.date(it.nextDate) + '</div>'
                    : '') +
                  '<div style="font-size: 0.7rem; color: var(--text-dim);">' +
                    (it.days !== null
                      ? (it.days <= 0 ? 'heute' : (it.days === 1 ? 'in 1 Tag' : 'in ' + it.days + ' Tagen'))
                      : 'Termin n. bekannt') +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>';
        });
      });

      container.innerHTML = html || '<div class="state-box"><div style="font-size: 0.85rem;">Keine Daten.</div></div>';

      container.querySelectorAll('.ec-goto').forEach(function (el) {
        el.onclick = function () {
          window.App.Router.navigate('/stock/' + el.getAttribute('data-ticker') + '/overview');
        };
      });
    });
  }

  return { initView: initView };
})();

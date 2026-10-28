/**
 * Chart-Modul: Kapselt die Diagrammerstellung fuer Detailansichten und Mini-Sparklines.
 * Nutzt die lokale Canvas-Engine aus js/lib/chart.umd.js.
 */

window.App = window.App || {};

(function(App) {
  'use strict';

  var activeDetailChart = null;

  var ChartService = {
    /**
     * Erstellt oder aktualisiert das Haupt-Chart in der Detailansicht.
     * @param {HTMLCanvasElement|string} canvasElement
     * @param {Object} stock
     */
    renderDetailChart: function(canvasElement, stock) {
      if (!stock || !stock.history || stock.history.length === 0) {
        return;
      }

      var canvas = typeof canvasElement === 'string'
        ? document.getElementById(canvasElement)
        : canvasElement;

      if (!canvas) return;

      if (activeDetailChart) {
        activeDetailChart.destroy();
        activeDetailChart = null;
      }

      var history = stock.history;
      var isPositive = history[history.length - 1] >= history[0];
      var lineColor = isPositive ? '#10b981' : '#f43f5e';

      var labels = history.map(function(_, idx) {
        return 'P' + (idx + 1);
      });

      if (typeof window.Chart === 'function') {
        activeDetailChart = new window.Chart(canvas, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              data: history,
              borderColor: lineColor,
              borderWidth: 2.8
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false
          }
        });
      }
    },

    /**
     * Zerstört bestehende Chart-Instanzen (z. B. beim Schließen oder View-Wechsel).
     */
    destroyCurrentChart: function() {
      if (activeDetailChart) {
        activeDetailChart.destroy();
        activeDetailChart = null;
      }
    }
  };

  App.ChartService = ChartService;
})(window.App);

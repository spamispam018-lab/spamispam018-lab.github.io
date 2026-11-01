/**
 * js/export.js
 * CSV-Export (Excel-tauglich: Semikolon, UTF-8 mit BOM, deutsches Dezimalkomma).
 */
window.App = window.App || {};

window.App.Export = (function () {
  'use strict';

  function cell(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number') {
      if (!isFinite(v)) return '';
      return String(Math.round(v * 10000) / 10000).replace('.', ',');
    }
    var s = String(v);
    if (/[;"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /**
   * columns: [{ label: 'Ticker', get: function (row) { return row.ticker; } }, ...]
   */
  function downloadCsv(filename, columns, rows) {
    var lines = [columns.map(function (c) { return cell(c.label); }).join(';')];
    rows.forEach(function (r) {
      lines.push(columns.map(function (c) { return cell(c.get(r)); }).join(';'));
    });
    var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  }

  /** Standardspalten für Universum-Einträge (Screener, Watchlist). */
  var STOCK_COLUMNS = [
    { label: 'Ticker', get: function (s) { return s.ticker; } },
    { label: 'Name', get: function (s) { return s.name; } },
    { label: 'Sektor', get: function (s) { return s.sector; } },
    { label: 'Branche', get: function (s) { return s.industry; } },
    { label: 'Kurs (EUR)', get: function (s) { return s.price; } },
    { label: 'Marktkapitalisierung (EUR)', get: function (s) { return s.marketCap; } },
    { label: 'Tag %', get: function (s) { return s.changePercent; } },
    { label: '1 Woche %', get: function (s) { return s.perf1w; } },
    { label: '1 Monat %', get: function (s) { return s.perf1m; } },
    { label: '3 Monate %', get: function (s) { return s.perf3m; } },
    { label: 'YTD %', get: function (s) { return s.perfYtd; } },
    { label: '52W %', get: function (s) { return s.perf52w; } },
    { label: 'KGV', get: function (s) { return s.pe; } },
    { label: 'Forward KGV', get: function (s) { return s.forwardPe; } },
    { label: 'PEG', get: function (s) { return s.peg; } },
    { label: 'Dividendenrendite %', get: function (s) { return s.dividendYield; } },
    { label: 'Umsatzwachstum', get: function (s) { return s.revGrowth; } },
    { label: 'Nettomarge', get: function (s) { return s.profitMargins; } },
    { label: 'Debt/Equity', get: function (s) { return s.debtToEquity; } },
    { label: 'RSI', get: function (s) { return s.rsi; } },
    { label: 'Kursziel-Potenzial %', get: function (s) { return s.upside; } },
    { label: 'Analysten', get: function (s) { return s.analystCount; } }
  ];

  function today() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function downloadStocks(prefix, stocks) {
    downloadCsv(prefix + '_' + today() + '.csv', STOCK_COLUMNS, stocks);
  }

  return { downloadCsv: downloadCsv, downloadStocks: downloadStocks, STOCK_COLUMNS: STOCK_COLUMNS };
})();

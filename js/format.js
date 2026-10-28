/**
 * js/format.js
 * Deutsche Zahlen-, Währungs-, Prozent- und Einheiten-Formatierung.
 * Alle Funktionen arbeiten defensiv und fangen null/undefined/NaN sauber ab.
 */

window.App = window.App || {};

window.App.Format = (function () {
  'use strict';

  var GERMAN_LOCALE = 'de-DE';

  /**
   * Formatiert Dezimalzahlen nach deutschem Standard (z.B. 1.234,56).
   */
  function number(val, decimals) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    var d = typeof decimals === 'number' ? decimals : 2;
    return new Intl.NumberFormat(GERMAN_LOCALE, {
      minimumFractionDigits: d,
      maximumFractionDigits: d
    }).format(val);
  }

  /**
   * Formatiert Währungsbeträge mit Symbol (z.B. 215,20 € oder $ 215,20).
   */
  function currency(val, curr, decimals) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    var c = curr || 'EUR';
    var d = typeof decimals === 'number' ? decimals : 2;
    try {
      return new Intl.NumberFormat(GERMAN_LOCALE, {
        style: 'currency',
        currency: c,
        minimumFractionDigits: d,
        maximumFractionDigits: d
      }).format(val);
    } catch (e) {
      return number(val, d) + ' ' + c;
    }
  }

  /**
   * Formatiert Prozentwerte mit Vorzeichen und % (z.B. +3,40 % oder -1,25 %).
   */
  function percent(val, showSign, decimals) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    var d = typeof decimals === 'number' ? decimals : 2;
    var sign = '';
    if (showSign && val > 0) {
      sign = '+';
    }
    return sign + number(val, d) + ' %';
  }

  /**
   * Kompakte deutsche Notation für große Zahlen (Mrd. / Mio. / Tsd.).
   * z.B. 3.420.000.000.000 -> 3,42 Bio., 12.300.000.000 -> 12,30 Mrd.
   */
  function compactNumber(val, curr) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    var absVal = Math.abs(val);
    var suffix = '';
    var divisor = 1;

    if (absVal >= 1e12) {
      divisor = 1e12;
      suffix = ' Bio.';
    } else if (absVal >= 1e9) {
      divisor = 1e9;
      suffix = ' Mrd.';
    } else if (absVal >= 1e6) {
      divisor = 1e6;
      suffix = ' Mio.';
    } else if (absVal >= 1e3) {
      divisor = 1e3;
      suffix = ' Tsd.';
    }

    var formatted = number(val / divisor, 2) + suffix;
    if (curr) {
      formatted += ' ' + (curr === 'EUR' ? '€' : curr);
    }
    return formatted;
  }

  /**
   * Formatiert ISO-Datumsstrings (YYYY-MM-DD) ins deutsche Format (DD.MM.YYYY).
   */
  function date(dateStr) {
    if (!dateStr) return '—';
    var parts = String(dateStr).slice(0, 10).split('-');
    if (parts.length === 3) {
      return parts[2] + '.' + parts[1] + '.' + parts[0];
    }
    return String(dateStr);
  }

  /**
   * Gibt CSS-Klassen für Kursänderungen zurück (Bullish / Bearish).
   */
  function changeClass(val) {
    if (val === null || val === undefined || isNaN(val)) return '';
    if (val > 0) return 'badge-bullish';
    if (val < 0) return 'badge-bearish';
    return '';
  }

  return {
    number: number,
    currency: currency,
    percent: percent,
    compactNumber: compactNumber,
    date: date,
    changeClass: changeClass
  };
})();

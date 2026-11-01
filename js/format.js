/**
 * js/format.js
 * Deutsche Formatierungs-Helfer für Zahlen, Währungen, Prozentwerte und Datumsangaben.
 * Konvertiert alle Beträge einheitlich in deutsche Zahlenformate mit Euro (€) als Standardwährung.
 */

window.App = window.App || {};

window.App.Format = (function () {
  'use strict';

  var LOCALE = 'de-DE';

  /**
   * Formatiert eine Zahl nach deutschem Standard (z. B. 1.234,56).
   * @param {number|string} value - Zu formatierender numerischer Wert
   * @param {number} [decimals=2] - Anzahl der Nachkommastellen
   * @returns {string} Formatierte Zahl oder '—'
   */
  function number(value, decimals) {
    if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
      return '—';
    }
    var num = Number(value);
    var d = decimals !== undefined ? decimals : 2;
    return new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: d,
      maximumFractionDigits: d
    }).format(num);
  }

  /**
   * Formatiert einen Betrag als Währung.
   * Standardmäßig wird immer auf Euro ('EUR') formatiert.
   * @param {number|string} value - Betrag
   * @param {string} [currencyCode='EUR'] - Währungscode (z. B. 'EUR', 'USD')
   * @param {number} [decimals=2] - Nachkommastellen
   * @returns {string} Formatierter Währungsbetrag (z. B. '123,45 €')
   */
  function currency(value, currencyCode, decimals) {
    if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
      return '—';
    }
    var num = Number(value);
    var code = (currencyCode && typeof currencyCode === 'string' && currencyCode.length === 3)
      ? currencyCode.toUpperCase()
      : 'EUR';
    var d = decimals !== undefined ? decimals : 2;

    try {
      return new Intl.NumberFormat(LOCALE, {
        style: 'currency',
        currency: code,
        minimumFractionDigits: d,
        maximumFractionDigits: d
      }).format(num);
    } catch (e) {
      return number(num, d) + ' €';
    }
  }

  /**
   * Formatiert große Zahlen kompakt auf Deutsch (Tsd., Mio., Mrd., Bio.) immer in Euro.
   * @param {number|string} value - Große Kennzahl (z. B. Marktkapitalisierung, Umsatz)
   * @param {string} [currencyCode='EUR'] - Währungscode
   * @returns {string} Kompakte Darstellung (z. B. '1,45 Mrd. €')
   */
  function compactNumber(value, currencyCode) {
    if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
      return '—';
    }
    var num = Number(value);
    var abs = Math.abs(num);
    var sign = num < 0 ? '-' : '';
    var suffix = ' €';

    if (abs >= 1e12) {
      return sign + number(abs / 1e12, 2) + ' Bio.' + suffix;
    }
    if (abs >= 1e9) {
      return sign + number(abs / 1e9, 2) + ' Mrd.' + suffix;
    }
    if (abs >= 1e6) {
      return sign + number(abs / 1e6, 2) + ' Mio.' + suffix;
    }
    if (abs >= 1e3) {
      return sign + number(abs / 1e3, 1) + ' Tsd.' + suffix;
    }
    return currency(num, 'EUR', 2);
  }

  /**
   * Formatiert Prozentwerte mit optionalem Vorzeichen (+/-).
   * @param {number|string} value - Prozentwert (z. B. 3.42 für 3,42 %)
   * @param {boolean} [showSign=false] - Bei true wird ein positives Vorzeichen '+' vorangestellt
   * @param {number} [decimals=2] - Nachkommastellen
   * @returns {string} Formatierter Prozentstring (z. B. '+3,42 %')
   */
  function percent(value, showSign, decimals) {
    if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
      return '—';
    }
    var num = Number(value);
    var d = decimals !== undefined ? decimals : 2;
    var sign = '';
    if (showSign && num > 0) {
      sign = '+';
    }
    return sign + number(num, d) + ' %';
  }

  /**
   * Formatiert ein ISO-Datum oder Datums-String ins deutsche Format (TT.MM.JJJJ).
   * @param {string} dateStr - Eingangsdatum
   * @returns {string} TT.MM.JJJJ oder Ursprungswert
   */
  function date(dateStr) {
    if (!dateStr) return '—';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(LOCALE, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (e) {
      return dateStr;
    }
  }

  /**
   * Ermittelt die CSS-Klasse basierend auf Kursänderung / Performance.
   * @param {number|string} value - Prozentuale oder absolute Veränderung
   * @returns {string} 'badge-bullish', 'badge-bearish' oder 'change-neutral'
   */
  function changeClass(value) {
    if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
      return 'change-neutral';
    }
    var num = Number(value);
    if (num > 0) return 'badge-bullish';
    if (num < 0) return 'badge-bearish';
    return 'change-neutral';
  }

  /**
   * Kompakte Achsenbeschriftung für große Beträge: nur so viele Nachkommastellen wie nötig
   * (z. B. '0 €', '-5 Mrd. €', '2,5 Mrd. €').
   */
  function axisMoney(value) {
    if (value === null || value === undefined || isNaN(Number(value))) return '—';
    var num = Number(value);
    var abs = Math.abs(num);
    if (abs < 1e-9) return '0 €';
    var units = [[1e12, ' Bio. €'], [1e9, ' Mrd. €'], [1e6, ' Mio. €'], [1e3, ' Tsd. €']];
    for (var i = 0; i < units.length; i++) {
      if (abs >= units[i][0]) {
        var scaled = num / units[i][0];
        var d = Math.abs(scaled - Math.round(scaled)) < 1e-9 ? 0 : 1;
        return number(scaled, d) + units[i][1];
      }
    }
    return number(num, 0) + ' €';
  }

  /**
   * Prozent-Achsenbeschriftung ohne überflüssige Nachkommastellen ('0 %', '10 %', '2,5 %').
   */
  function axisPercent(value) {
    if (value === null || value === undefined || isNaN(Number(value))) return '—';
    var num = Number(value);
    var abs = Math.abs(num);
    var d;
    if (Math.abs(num - Math.round(num)) < 1e-9) d = 0;
    else d = abs >= 1 ? 1 : 2;
    return number(num, d) + ' %';
  }

  return {
    number: number,
    currency: currency,
    compactNumber: compactNumber,
    percent: percent,
    date: date,
    changeClass: changeClass,
    axisMoney: axisMoney,
    axisPercent: axisPercent
  };
})();

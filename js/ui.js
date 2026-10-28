/**
 * UI-Controller: Kuemmert sich um deutsches Zahlenformatting, Rendern der Aktienkarten,
 * Oeffnen/Schliessen des Bottom-Sheets, Sortier-Events und View-Umschaltungen.
 */

window.App = window.App || {};

(function(App) {
  'use strict';

  var UIController = {
    /**
     * Formatiert Waehrungsbetraege nach deutschem Standard (z. B. 1.234,56 €)
     */
    formatCurrency: function(value, currency) {
      var curr = currency || 'EUR';
      var num = typeof value === 'number' ? value : parseFloat(value) || 0;
      var symbol = curr === 'EUR' ? '€' : curr === 'USD' ? '$' : curr;

      return num.toLocaleString('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }) + ' ' + symbol;
    },

    /**
     * Formatiert Prozentwerte mit Vorzeichen (z. B. +2,45 % oder -1,12 %)
     */
    formatPercent: function(value) {
      var num = typeof value === 'number' ? value : parseFloat(value) || 0;
      var sign = num > 0 ? '+' : '';
      return sign + num.toLocaleString('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }) + ' %';
    },

    /**
     * Formatiert grosse Zahlen (Marktkapitalisierung) kompakt (z. B. 245,5 Mrd. €)
     */
    formatMarketCap: function(value) {
      var num = typeof value === 'number' ? value : parseFloat(value) || 0;
      if (num >= 1000000000000) {
        return (num / 1000000000000).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' Bio. €';
      }
      if (num >= 1000000000) {
        return (num / 1000000000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Mrd. €';
      }
      if (num >= 1000000) {
        return (num / 1000000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Mio. €';
      }
      return num.toLocaleString('de-DE') + ' €';
    },

    /**
     * Rendert die Liste der Aktienkarten in den angegebenen Container
     */
    renderStockList: function(containerElement, stocks, onCardClick) {
      var container = typeof containerElement === 'string'
        ? document.getElementById(containerElement)
        : containerElement;

      if (!container) return;

      if (!stocks || stocks.length === 0) {
        container.innerHTML = [
          '<div class="empty-state">',
          '  <div class="empty-state-title">Keine Aktien gefunden</div>',
          '  <p>Passe deine Filterkriterien oder Suchbegriffe an.</p>',
          '</div>'
        ].join('');
        return;
      }

      var html = [];
      for (var i = 0; i < stocks.length; i++) {
        var s = stocks[i];
        var isPos = (s.changePercent || 0) >= 0;
        var badgeClass = isPos ? 'stock-badge pos' : 'stock-badge neg';

        html.push([
          '<div class="stock-card" data-ticker="' + s.ticker + '">',
          '  <div class="stock-card-left">',
          '    <div class="stock-name">' + s.name + '</div>',
          '    <div class="stock-meta">',
          '      <span class="stock-ticker-pill">' + s.ticker + '</span>',
          '      <span>•</span>',
          '      <span>' + (s.sector || 'Sonstige') + '</span>',
          '    </div>',
          '  </div>',
          '  <div class="stock-card-right">',
          '    <div class="stock-price">' + this.formatCurrency(s.price, s.currency) + '</div>',
          '    <div class="' + badgeClass + '">' + this.formatPercent(s.changePercent) + '</div>',
          '  </div>',
          '</div>'
        ].join(''));
      }

      container.innerHTML = html.join('');

      // Click-Handler anbinden
      var cards = container.querySelectorAll('.stock-card');
      for (var j = 0; j < cards.length; j++) {
        cards[j].addEventListener('click', function() {
          var ticker = this.getAttribute('data-ticker');
          if (typeof onCardClick === 'function') {
            onCardClick(ticker);
          }
        });
      }
    },

    /**
     * Oeffnet oder schliesst das Bottom-Sheet fuer die Filter
     */
    toggleBottomSheet: function(isOpen) {
      var sheet = document.getElementById('filterSheet');
      var backdrop = document.getElementById('sheetBackdrop');
      if (!sheet || !backdrop) return;

      if (isOpen) {
        sheet.classList.add('visible');
        backdrop.classList.add('visible');
        document.body.style.overflow = 'hidden';
      } else {
        sheet.classList.remove('visible');
        backdrop.classList.remove('visible');
        document.body.style.overflow = '';
      }
    },

    /**
     * Befuellt die Sektor- und Laender-Dropdowns im Filter-Sheet
     */
    populateFilterDropdowns: function() {
      if (!App.DataService) return;

      var sectorSelect = document.getElementById('filterSector');
      var countrySelect = document.getElementById('filterCountry');

      if (sectorSelect) {
        var sectors = App.DataService.getSectors();
        var sHtml = ['<option value="">Alle Branchen</option>'];
        for (var i = 0; i < sectors.length; i++) {
          sHtml.push('<option value="' + sectors[i] + '">' + sectors[i] + '</option>');
        }
        sectorSelect.innerHTML = sHtml.join('');
      }

      if (countrySelect) {
        var countries = App.DataService.getCountries();
        var cHtml = ['<option value="">Alle Regionen</option>'];
        for (var j = 0; j < countries.length; j++) {
          cHtml.push('<option value="' + countries[j] + '">' + countries[j] + '</option>');
        }
        countrySelect.innerHTML = cHtml.join('');
      }
    }
  };

  App.UIController = UIController;
})(window.App);

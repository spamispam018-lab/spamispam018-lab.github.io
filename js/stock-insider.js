/**
 * js/stock-insider.js
 * Verwaltet den Insider-Tab der Aktiendetailseite:
 * - Summary-Kacheln (Buys/Sells letzte 2 Quartale, Volumina, Sentiment)
 * - Filter-Pillen: Alle Trades, Nur Käufe (Buys), Nur Verkäufe (Sells)
 * - Horizontal scrollbare Tabelle (Insider, Datum, Aktivität, Anteile, Wert, [Firma bei ETFs])
 * - Historischer Kurschart mit vertikalen Buy- (grün) und Sell-Markierungen (rot)
 *
 * *NEU:* Bei ETFs werden die Insider-Trades und Volumina der Top 5 Holdings aggregiert!
 */

window.App = window.App || {};

window.App.StockInsider = (function () {
  'use strict';

  var activeFilter = 'all'; // 'all' | 'Buy' | 'Sell'

  // Umkehr-Lookup für Namen zu Tickern (für ETF-Holdings)
  var nameToTickerMap = {};

  /**
   * Baut einen Lookup-Katalog aus dem Universum, um Holding-Namen in Ticker zu übersetzen.
   */
  function buildNameLookup(universe) {
    nameToTickerMap = {};
    (universe || []).forEach(function(u) {
      // 1. Suche nach echtem Ticker
      nameToTickerMap[u.ticker.toLowerCase()] = u.ticker;
      // 2. Suche nach Firmennamen (in Kleinbuchstaben, bereinigt)
      if (u.name) {
        var cleanName = u.name.toLowerCase().replace(/inc\.|inc|corp\.|corp|ltd\.|ltd|plc|ag|se|co\./g, '').trim();
        nameToTickerMap[cleanName] = u.ticker;
      }
    });
  }

  /**
   * Lädt die Insider-Daten der Top 5 Holdings, falls es sich um einen ETF handelt.
   * Gibt ein Promise zurück, das die aggregierten Insider-Daten auflöst.
   */
  function fetchEtfInsiderData(stock) {
    return new Promise(function(resolve) {
      var isEtf = (stock.sector === 'Sonstige' || stock.sector === 'ETF' || !stock.sector);
      var holdings = stock.holdings || [];
      
      // Wenn es kein ETF ist oder keine Holdings vorhanden sind, liefere die nativen Daten
      if (!isEtf || holdings.length === 0) {
        resolve(stock.insider || { summary: {}, trades: [] });
        return;
      }

      window.App.Data.getUniverse().then(function(universe) {
        buildNameLookup(universe);
        
        var top5 = holdings.slice(0, 5);
        var promises = top5.map(function(h) {
          // Versuche den Ticker aus dem Namen abzuleiten
          var cleanName = h.name.toLowerCase().replace(/inc\.|inc|corp\.|corp|ltd\.|ltd|plc|ag|se|co\./g, '').trim();
          var targetTicker = nameToTickerMap[cleanName] || nameToTickerMap[h.name.toLowerCase()] || null;
          
          if (!targetTicker) {
            // Letzter Notnagel: Wenn der Name fast wie ein Ticker aussieht (z.B. "AAPL")
            var possibleTicker = universe.find(function(u) { return u.ticker.indexOf(h.name) === 0; });
            if (possibleTicker) targetTicker = possibleTicker.ticker;
          }

          if (targetTicker) {
            return window.App.Data.getStock(targetTicker).catch(function() { return null; });
          }
          return Promise.resolve(null);
        });

        Promise.all(promises).then(function(results) {
          var aggTrades = [];
          var buys = 0, sells = 0, buyVal = 0, sellVal = 0;

          results.forEach(function(res, idx) {
            if (res && res.insider && res.insider.trades) {
              var sourceName = top5[idx].name; // Ursprungsfirma für die Tabelle
              var tList = res.insider.trades || [];
              
              tList.forEach(function(t) {
                // Füge den Firmennamen in das Trade-Objekt ein
                var tCopy = Object.assign({}, t);
                tCopy.sourceCompany = sourceName;
                aggTrades.push(tCopy);

                if (t.type === 'Buy') {
                  buys++;
                  buyVal += (t.value || 0);
                } else if (t.type === 'Sell') {
                  sells++;
                  sellVal += (t.value || 0);
                }
              });
            }
          });

          // Trades chronologisch absteigend sortieren
          aggTrades.sort(function(a, b) {
            return (a.date < b.date) ? 1 : ((a.date > b.date) ? -1 : 0);
          });

          var sentiment = 'Neutral';
          if (buyVal > sellVal * 1.2) sentiment = 'Bullish';
          elif (sellVal > buyVal * 1.2) sentiment = 'Bearish';

          resolve({
            summary: {
              buysCount2Q: buys,
              sellsCount2Q: sells,
              buyValueTotal: buyVal,
              sellValueTotal: sellVal,
              sentiment: sentiment
            },
            trades: aggTrades,
            isAggregated: true // Flag für die UI
          });
        });
      }).catch(function() {
        resolve(stock.insider || { summary: {}, trades: [] });
      });
    });
  }


  /**
   * Rendert den Insider-Tab.
   */
  function render(container, stock) {
    if (!container || !stock) return;

    container.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Lade Insider-Daten...</p></div>';

    fetchEtfInsiderData(stock).then(function(insiderData) {
      var summary = insiderData.summary || {};
      var trades = insiderData.trades || [];
      var currency = (stock.quote && stock.quote.currency) || 'EUR';
      var chartHistory = stock.chartHistory || [];

      var buyVal = summary.buyValueTotal || 0;
      var sellVal = summary.sellValueTotal || 0;
      var sentiment = summary.sentiment || 'Neutral';
      var sentimentClass = sentiment === 'Bullish' ? 'badge-bullish' : (sentiment === 'Bearish' ? 'badge-bearish' : 'badge-pill');

      // Hinweis anzeigen, wenn Daten aus Top 5 aggregiert wurden
      var aggNote = insiderData.isAggregated 
        ? '<div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:12px; padding:8px 12px; background:var(--bg-tertiary); border-radius:var(--radius-sm); border:1px solid var(--border-subtle);">' +
          '<b>Hinweis (ETF):</b> Da ETFs selbst keine Insider-Trades haben, werden hier die Trades der 5 größten enthaltenen Aktien (Top Holdings) aggregiert.</div>' 
        : '';

      var html = '' +
        aggNote +
        '<!-- Summary Kacheln -->' +
        '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px;">' +
          '<div class="card" style="padding: 12px; margin-bottom: 0;">' +
            '<div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 4px;">Käufe (2Q)</div>' +
            '<div style="font-size: 1.05rem; font-weight: 700; color: var(--bullish);">' + (summary.buysCount2Q || 0) + '</div>' +
            '<div style="font-size: 0.72rem; color: var(--text-muted);">' + window.App.Format.compactNumber(buyVal, currency) + '</div>' +
          '</div>' +

          '<div class="card" style="padding: 12px; margin-bottom: 0;">' +
            '<div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 4px;">Verkäufe (2Q)</div>' +
            '<div style="font-size: 1.05rem; font-weight: 700; color: var(--bearish);">' + (summary.sellsCount2Q || 0) + '</div>' +
            '<div style="font-size: 0.72rem; color: var(--text-muted);">' + window.App.Format.compactNumber(sellVal, currency) + '</div>' +
          '</div>' +

          '<div class="card" style="padding: 12px; margin-bottom: 0;">' +
            '<div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 4px;">Sentiment</div>' +
            '<div style="margin-top: 6px;"><span class="badge-pill ' + sentimentClass + '">' + sentiment + '</span></div>' +
          '</div>' +
        '</div>' +

        '<!-- Kurschart mit Buy/Sell Markierungen -->' +
        '<div class="card">' +
          '<div class="card-header-dotted">' +
            '<div class="card-title">' +
              '<span>Kursverlauf &amp; Insider-Timing</span>' +
              '<span class="period-tag">1 Jahr</span>' +
            '</div>' +
          '</div>' +

          '<div class="chart-container">' +
            '<canvas id="insider-chart-canvas" class="chart-canvas" style="height: 220px;"></canvas>' +
            '<div class="chart-legend">' +
              '<div class="legend-item"><span class="legend-dot" style="background:#818cf8;"></span><span>Schlusskurs</span></div>' +
              '<div class="legend-item"><span class="legend-dot" style="background:#10b981;"></span><span>Insider-Kauf</span></div>' +
              '<div class="legend-item"><span class="legend-dot" style="background:#ef4444;"></span><span>Insider-Verkauf</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- Transaktions-Tabelle mit Filter-Pillen -->' +
        '<div class="card">' +
          '<div class="card-header-dotted">' +
            '<div class="card-title">Transaktionsprotokoll</div>' +
            '<div class="horizontal-scroll-row" style="margin-bottom: 0; padding-bottom: 0;">' +
              '<button class="sub-tab-btn active" data-insider-filter="all">Alle</button>' +
              '<button class="sub-tab-btn" data-insider-filter="Buy">Käufe</button>' +
              '<button class="sub-tab-btn" data-insider-filter="Sell">Verkäufe</button>' +
            '</div>' +
          '</div>' +

          '<div id="insider-table-container">' +
            renderTradesTableHtml(trades, currency, activeFilter, insiderData.isAggregated) +
          '</div>' +
        '</div>';

      container.innerHTML = html;

      // Chart mit Markern zeichnen
      initInsiderChart(chartHistory, trades, currency);

      // Filter-Buttons binden
      bindFilterEvents(trades, currency, insiderData.isAggregated);
    });
  }

  /**
   * Rendert die horizontal scrollbare HTML-Tabelle der Transaktionen.
   */
  function renderTradesTableHtml(trades, currency, filter, isAggregated) {
    var filtered = trades || [];
    if (filter && filter !== 'all') {
      filtered = filtered.filter(function (t) {
        return t.type === filter;
      });
    }

    if (filtered.length === 0) {
      return '<div class="state-box" style="padding: 24px 0;"><p>Keine Einträge für diesen Filter vorhanden.</p></div>';
    }

    var companyHeader = isAggregated ? '<th>Unternehmen</th>' : '';

    var html = '' +
      '<div class="table-responsive-wrapper">' +
        '<table class="data-table">' +
          '<thead>' +
            '<tr>' +
              '<th>Datum</th>' +
              companyHeader +
              '<th>Insider</th>' +
              '<th>Position</th>' +
              '<th>Aktivität</th>' +
              '<th style="text-align: right;">Aktien</th>' +
              '<th style="text-align: right;">Wert</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>';

    filtered.forEach(function (t) {
      var isBuy = t.type === 'Buy';
      var badgeCls = isBuy ? 'badge-bullish' : (t.type === 'Sell' ? 'badge-bearish' : 'badge-pill');
      var companyCell = isAggregated ? '<td style="font-weight: 600; color: var(--accent-purple-light);">' + (t.sourceCompany || '—') + '</td>' : '';

      html += '' +
        '<tr>' +
          '<td>' + window.App.Format.date(t.date) + '</td>' +
          companyCell +
          '<td style="font-weight: 600; color: var(--text-main);">' + t.insider + '</td>' +
          '<td>' + (t.position || '—') + '</td>' +
          '<td><span class="badge-pill ' + badgeCls + '">' + t.type + '</span></td>' +
          '<td style="text-align: right; font-variant-numeric: tabular-nums;">' + window.App.Format.number(t.shares, 0) + '</td>' +
          '<td style="text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;">' + window.App.Format.currency(t.value, currency, 0) + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
  }

  /**
   * Mappt Insider-Transaktionen auf die Kursdaten und zeichnet das Canvas-Diagramm.
   */
  function initInsiderChart(history, trades, currency) {
    var canvas = document.getElementById('insider-chart-canvas');
    if (!canvas || !history || history.length === 0) return;

    var labels = [];
    var values = [];
    var dateMap = {};

    history.forEach(function (pt, idx) {
      labels.push(pt.date.slice(5)); // z.B. 10-01
      values.push(pt.close);
      dateMap[pt.date] = idx;
    });

    // Marker auf Datumsindex mappen
    var markers = [];
    (trades || []).forEach(function (t) {
      if (t.type === 'Buy' || t.type === 'Sell') {
        var idx = dateMap[t.date];
        // Falls kein exakter Handelstag: nächsten Tag suchen
        if (idx === undefined) {
          for (var i = 0; i < history.length; i++) {
            if (history[i].date >= t.date) {
              idx = i;
              break;
            }
          }
        }
        if (idx !== undefined) {
          markers.push({
            index: idx,
            type: t.type,
            text: t.insider
          });
        }
      }
    });

    window.App.Charts.renderLineChart(canvas, {
      labels: labels,
      values: values,
      markers: markers,
      formatY: function (val) {
        return window.App.Format.currency(val, currency, 0);
      }
    });
  }

  /**
   * Bindet die Filter-Tabs (Alle / Käufe / Verkäufe).
   */
  function bindFilterEvents(trades, currency, isAggregated) {
    var buttons = document.querySelectorAll('[data-insider-filter]');
    buttons.forEach(function (btn) {
      btn.onclick = function () {
        buttons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        activeFilter = btn.getAttribute('data-insider-filter');

        var tableContainer = document.getElementById('insider-table-container');
        if (tableContainer) {
          tableContainer.innerHTML = renderTradesTableHtml(trades, currency, activeFilter, isAggregated);
        }
      };
    });
  }

  return {
    render: render
  };
})();

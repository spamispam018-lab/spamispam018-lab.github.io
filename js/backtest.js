/**
 * js/backtest.js – Backtesting für Screener-Presets.
 * Simuliert monatlich: Filter anwenden, gleichgewichtet kaufen, 12 Monate halten.
 */
window.App = window.App || {};
window.App.Backtest = (function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var PRESET_HELP = {"": "Kein Filter: Es werden alle Aktien des Testuniversums gleichgewichtet gekauft. Das ist die Vergleichsbasis für alle anderen Filter.", "value": "Wählt Aktien mit einem KGV über 0 und unter 20, also vergleichsweise günstig bewertet gemessen am Gewinn.", "quality": "Wählt Aktien mit Nettomarge über 10 %, positivem Umsatzwachstum und höchstens 100 % Verschuldung (Debt/Equity) – profitabel, wachsend, nicht überschuldet.", "growth": "Wählt Aktien, deren Umsatz zuletzt um mindestens 10 % gewachsen ist.", "high_dividend": "Wählt Aktien mit einer Dividendenrendite von mindestens 3 %.", "consensus_buy": "Wählt Aktien, die mindestens 70 % der Analysten zum Kauf empfehlen.", "golden_cross": "Wählt Aktien, bei denen der 50-Tage-Durchschnitt den 200-Tage-Durchschnitt in den letzten 60 Tagen von unten gekreuzt hat (Trendwende nach oben).", "oversold": "Wählt überverkaufte Aktien mit einem RSI von höchstens 30 – Kandidaten für eine Erholung, aber auch „fallende Messer“.", "low_risk": "Wählt Aktien mit einem Chance-Risiko-Verhältnis (CRV) von mindestens 2 und einem Stop-Abstand von höchstens 5 %."};
  var SIM_HELP = [["Was wird simuliert?", "Aus den 80 größten Aktien des Universums (nach Marktkapitalisierung, mit genug Kurshistorie) wird jeden Monat der gewählte Filter angewendet. Die Treffer werden gleichgewichtet gekauft und 12 Monate gehalten. Mehrere solche Monats-Käufe überlappen sich."], ["Wichtigste Einschränkung: heutige Kennzahlen", "Der Filter nutzt die <strong>aktuellen</strong> Kennzahlen (KGV, Wachstum, RSI, Analystenurteil …) und wendet sie auf die ganze Vergangenheit an. Aktien, die heute als „günstig“, „wachsend“ oder „Golden Cross“ gelten, sind oft genau die, die zuletzt gut gelaufen sind – das Ergebnis wirkt dadurch besser, als der Filter damals tatsächlich gewesen wäre (Blick in die Zukunft)."], ["Weitere Verzerrungen", "Das Universum besteht nur aus Aktien, die es heute noch gibt (Überlebensverzerrung). Es gibt keine Transaktionskosten, Spreads, Steuern oder Dividenden-Details; Kurse sind in Euro umgerechnet. Ein Filter-Backtest ist deshalb eher ein Plausibilitätscheck als ein Beleg."], ["Vergleichswert", "Starte zuerst ohne Filter und vergleiche dann: Nur wenn ein Filter sichtbar besser abschneidet als „alle Aktien“, hat er überhaupt etwas beigetragen."]];
  var RESULT_HELP = [["CAGR", "Durchschnittliche Rendite pro Jahr (Zinseszins-Rate), damit Zeiträume vergleichbar sind."], ["Volatilität", "Wie stark die Ergebnisse schwanken, aufs Jahr hochgerechnet. Höher heißt unruhigerer Verlauf."], ["Max. Drawdown", "Der größte Rückgang vom Höchststand der Simulation bis zum folgenden Tief. Er zeigt, was man hätte aushalten müssen."], ["Sharpe", "Überrendite gegenüber 2 % Zins je Einheit Schwankung. Um 0,5 gilt als mäßig, ab 1 als gut; sehr hohe Werte sind meist ein Warnzeichen für Verzerrungen."], ["Trefferquote", "Anteil der einzelnen Käufe, die im Plus endeten. Eine hohe Quote sagt allein wenig: Entscheidend ist auch, wie groß Gewinne und Verluste sind."], ["Endwert", "Wert eines Startkapitals von 100 am Ende der Simulation."], ["Trades-Tabelle", "Einzelne simulierte Käufe mit Kauf- und Verkaufsdatum und Rendite (die ersten 30)."], ["Aussagekraft", "Nur wenige Aktien im Filter oder kurze Zeiträume machen das Ergebnis zufällig. Prüfe mehrere Zeiträume und achte darauf, ob der Filter in allen besser ist als „kein Filter“."]];

  function helpCard(title, items, openByDefault) {
    return '<details class="card"' + (openByDefault ? ' open' : '') + ' style="padding:14px 16px;">' +
      '<summary style="font-weight:700;font-size:0.85rem;cursor:pointer;">' + title + '</summary>' +
      '<div style="margin-top:12px;">' + items.map(function (it) {
        return '<div style="margin-bottom:12px;"><div style="font-weight:700;font-size:0.8rem;color:var(--text-main);">' + it[0] + '</div>' +
          '<div style="font-size:0.76rem;color:var(--text-dim);line-height:1.55;margin-top:2px;">' + it[1] + '</div></div>';
      }).join('') + '</div></details>';
  }

  function initView() {
    var container = document.getElementById('app-view-content');
    if (!container) return;
    var headerFilterBtn = document.getElementById('btn-header-filter');
    if (headerFilterBtn) headerFilterBtn.style.display = 'none';

    container.innerHTML =
      '<div class="view-container">' +
        '<div style="margin-bottom:16px;">' +
          '<h2 style="font-size:1.25rem;font-weight:700;margin-bottom:4px;">Backtesting</h2>' +
          '<div style="font-size:0.78rem;color:var(--text-dim);">Simulation vergangener Filter-Performance (monatlich, 12-Monats-Haltedauer).</div>' +
        '</div>' +
        '<div id="scanner-slot"></div>' +
        '<div class="card"><div class="card-header-dotted"><span class="card-title">Konfiguration</span></div>' +
          '<div style="display:flex;flex-direction:column;gap:10px;">' +
            '<div><label style="font-size:0.72rem;color:var(--text-dim);">Preset-Filter</label>' +
              '<select id="bt-preset" class="sort-select" style="width:100%;margin-top:4px;">' +
                '<option value="">— Kein Filter (alle Aktien) —</option>' +
                '<option value="value">Value (KGV unter Branche)</option>' +
                '<option value="quality">Qualität (Marge + Wachstum)</option>' +
                '<option value="growth">Growth (Umsatz ≥ 10 %)</option>' +
                '<option value="high_dividend">Hohe Dividende (≥ 3 %)</option>' +
                '<option value="consensus_buy">Kaufkonsens (≥ 70 % Buy)</option>' +
                '<option value="golden_cross">Golden Cross (letzte 60 Tage)</option>' +
                '<option value="oversold">Überverkauft (RSI ≤ 30)</option>' +
                '<option value="low_risk">Kleines Risiko (CRV ≥ 2, Stop ≤ 5 %)</option>' +
              '</select>' +
              '<div id="bt-preset-desc" style="font-size:0.72rem;color:var(--text-dim);margin-top:6px;line-height:1.45;"></div></div>' +
            '<div><label style="font-size:0.72rem;color:var(--text-dim);">Simulations-Zeitraum</label>' +
              '<select id="bt-period" class="sort-select" style="width:100%;margin-top:4px;">' +
                '<option value="1Y">1 Jahr</option>' +
                '<option value="2Y" selected>2 Jahre</option>' +
                '<option value="3Y">3 Jahre</option>' +
              '</select></div>' +
            '<button class="chip-btn active" id="bt-run" style="height:42px;justify-content:center;">Simulation starten</button>' +
          '</div>' +
          '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:10px;line-height:1.4;">' +
            'Achtung: Vergangenheitsdaten. Überlebensverzerrung, keine Transaktionskosten, kein Slippage. Keine Prognose.' +
          '</div>' +
        '</div>' +
        helpCard('So funktioniert die Simulation', SIM_HELP, false) +
        '<div id="bt-results"></div>' +
      '</div>';

    if (window.App.StrategyScanner) window.App.StrategyScanner.mount(document.getElementById('scanner-slot'), { startCollapsed: false });

    var presetSel = document.getElementById('bt-preset');
    var presetDesc = document.getElementById('bt-preset-desc');
    function showPresetDesc() { presetDesc.textContent = PRESET_HELP[presetSel.value] || ''; }
    presetSel.onchange = showPresetDesc;
    showPresetDesc();

    document.getElementById('bt-run').onclick = runBacktest;
  }

  function runBacktest() {
    var preset = document.getElementById('bt-preset').value;
    var period = document.getElementById('bt-period').value;
    var resultsEl = document.getElementById('bt-results');
    resultsEl.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Simuliere Filter-Performance…</p></div>';

    var monthCount = period === '1Y' ? 12 : period === '3Y' ? 36 : 24;
    var endDays = monthCount * 21;

    window.App.Data.getUniverse().then(function (universe) {
      if (!universe || !universe.length) {
        resultsEl.innerHTML = '<div class="state-box"><p>Keine Universum-Daten.</p></div>';
        return;
      }

      // Wähle Sample: Top 100 nach MarketCap, um Ladezeit zu begrenzen
      var sample = universe.slice()
        .filter(function (s) { return Number(s.marketCap) > 0; })
        .sort(function (a, b) { return Number(b.marketCap) - Number(a.marketCap); })
        .slice(0, 80);

      var promises = sample.map(function (s) {
        return window.App.Data.getLongHistory(s.ticker).then(function (h) {
          return { ticker: s.ticker, sector: s.sector, history: h || [] };
        }).catch(function () { return { ticker: s.ticker, sector: s.sector, history: [] }; });
      });

      Promise.all(promises).then(function (rows) {
        var valid = rows.filter(function (r) { return r.history.length >= endDays + 250; });
        if (valid.length < 5) {
          resultsEl.innerHTML = '<div class="state-box"><p>Zu wenige Ticker mit ausreichender Historie für Simulation.</p></div>';
          return;
        }
        var result = simulate(valid, monthCount, endDays, preset, sample);
        renderResults(resultsEl, result, preset, period);
      });
    });
  }

  function simulate(rows, monthCount, endDays, preset, sample) {
    // Preismatrix
    var dateToPrice = {};
    rows.forEach(function (r) {
      r.priceMap = {};
      r.history.forEach(function (p) { r.priceMap[p.date] = p.close; });
    });

    // Gemeinsame Datumsspanne
    var allDates = {};
    rows.forEach(function (r) { r.history.forEach(function (p) { allDates[p.date] = true; }); });
    var sortedDates = Object.keys(allDates).sort();
    if (sortedDates.length < endDays) return { trades: [], error: 'Zu wenige gemeinsame Handelstage' };

    var lastIdx = sortedDates.length - 1;
    var startIdx = sortedDates.length - endDays;
    var HOLD = 12;                       // Haltedauer je Kohorte in Monaten
    var nav = 100;                       // Basis 100
    var navSeries = [];
    var allTrades = [];
    var monthlyReturns = [];
    var maxDD = 0;
    var peak = 100;
    var cohorts = [];                    // je Kaufmonat: { start, tickers }

    function idxOf(k) { return Math.min(startIdx + k * 21, lastIdx); }

    for (var m = 0; m < monthCount; m++) {
      var buyIdx = idxOf(m);
      var nextIdx = idxOf(m + 1);
      if (buyIdx >= lastIdx) break;

      // Neue Kohorte: Filter heute gültig (Look-ahead, siehe Hinweis), gleichgewichtet
      var picked = rows.filter(function (r) {
        var s = sample.filter(function (x) { return x.ticker === r.ticker; })[0] || {};
        return matchesPreset(s, preset) && (r.priceMap[sortedDates[buyIdx]] > 0);
      });
      if (picked.length) cohorts.push({ start: m, tickers: picked });

      // Echte Monatsrendite: Mittel über alle aktiven Kohorten (je höchstens 12 Monate gehalten)
      var cohortRets = [];
      cohorts.forEach(function (c) {
        if (m >= c.start + HOLD) return;
        var sum = 0, cnt = 0;
        c.tickers.forEach(function (r) {
          var p0 = r.priceMap[sortedDates[buyIdx]], p1 = r.priceMap[sortedDates[nextIdx]];
          if (p0 > 0 && p1 > 0) { sum += p1 / p0 - 1; cnt++; }
        });
        if (cnt) cohortRets.push(sum / cnt);
      });
      if (!cohortRets.length) continue;
      var portfolioReturn = cohortRets.reduce(function (a, x) { return a + x; }, 0) / cohortRets.length;

      monthlyReturns.push(portfolioReturn);
      nav = nav * (1 + portfolioReturn);
      if (nav > peak) peak = nav;
      var dd = (nav / peak - 1) * 100;
      if (dd < maxDD) maxDD = dd;
      navSeries.push({ month: m + 1, nav: nav });
    }

    // Trades je Kohorte und Titel; unvollständige Haltedauer wird markiert und nicht in die Trefferquote gezählt
    cohorts.forEach(function (c) {
      var bi = idxOf(c.start), si = Math.min(bi + 21 * HOLD, lastIdx);
      var complete = bi + 21 * HOLD <= lastIdx;
      c.tickers.forEach(function (r) {
        var p0 = r.priceMap[sortedDates[bi]], p1 = r.priceMap[sortedDates[si]];
        if (p0 > 0 && p1 > 0) allTrades.push({ ticker: r.ticker, buyDate: sortedDates[bi], sellDate: sortedDates[si], ret: p1 / p0 - 1, open: !complete });
      });
    });

    if (!monthlyReturns.length) return { trades: [], error: 'Keine Trades generiert' };

    var avgReturn = monthlyReturns.reduce(function (a, b) { return a + b; }, 0) / monthlyReturns.length;
    var variance = monthlyReturns.reduce(function (a, b) { return a + (b - avgReturn) * (b - avgReturn); }, 0) / monthlyReturns.length;
    var vol = Math.sqrt(variance) * Math.sqrt(12) * 100;
    var cagr = (nav / 100) ** (12 / monthlyReturns.length) - 1;
    var sharpe = vol > 0 ? (cagr * 100 - 2) / vol : 0;
    var closedTrades = allTrades.filter(function (t) { return !t.open; });
    var winRate = closedTrades.length > 0 ? closedTrades.filter(function (t) { return t.ret > 0; }).length / closedTrades.length : 0;

    return {
      navSeries: navSeries,
      trades: allTrades,
      finalNav: nav,
      cagr: cagr * 100,
      vol: vol,
      maxDD: maxDD,
      sharpe: sharpe,
      winRate: winRate * 100,
      months: monthlyReturns.length
    };
  }

  function matchesPreset(s, preset) {
    if (!preset) return true;
    if (preset === 'value') return (s.pe > 0 && s.pe < 20);
    if (preset === 'quality') return (s.profitMargins > 0.1 && s.revGrowth > 0 && (s.debtToEquity == null || s.debtToEquity <= 100));
    if (preset === 'growth') return (s.revGrowth || 0) >= 0.10;
    if (preset === 'high_dividend') return (s.dividendYield || 0) >= 3;
    if (preset === 'consensus_buy') return (s.buyPct || 0) >= 70;
    if (preset === 'golden_cross') return s.cross === 'golden' && (s.crossDaysAgo || 999) <= 60;
    if (preset === 'oversold') return (s.rsi || 99) <= 30;
    if (preset === 'low_risk') return (s.rrCrv || 0) >= 2 && (s.rrStopPct || 99) <= 5;
    return true;
  }

  function renderResults(container, result, preset, period) {
    if (result.error) {
      container.innerHTML = '<div class="state-box"><p>' + esc(result.error) + '</p></div>';
      return;
    }
    var F = window.App.Format;
    var cagrClass = result.cagr >= 0 ? 'var(--bullish)' : 'var(--bearish)';

    var html = '<div class="card"><div class="card-header-dotted"><span class="card-title">Ergebnis</span><span class="period-tag">' + esc(period) + '</span></div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">' +
      '<div class="metric-cell"><span class="metric-label">CAGR</span><span class="metric-value" style="color:' + cagrClass + ';">' + (result.cagr >= 0 ? '+' : '') + F.number(result.cagr, 1) + ' %</span></div>' +
      '<div class="metric-cell"><span class="metric-label">Volatilität</span><span class="metric-value">' + F.number(result.vol, 1) + ' %</span></div>' +
      '<div class="metric-cell"><span class="metric-label">Max. Drawdown</span><span class="metric-value" style="color:var(--bearish);">' + F.number(result.maxDD, 1) + ' %</span></div>' +
      '<div class="metric-cell"><span class="metric-label">Sharpe</span><span class="metric-value">' + F.number(result.sharpe, 2) + '</span></div>' +
      '<div class="metric-cell"><span class="metric-label">Trefferquote</span><span class="metric-value">' + F.number(result.winRate, 1) + ' %</span></div>' +
      '<div class="metric-cell"><span class="metric-label">Endwert</span><span class="metric-value">' + F.number(result.finalNav, 0) + ' (Basis 100)</span></div>' +
      '</div>';

    html += '<div style="height:200px;position:relative;"><canvas id="bt-nav-chart" class="chart-canvas"></canvas></div>';
    html += '</div>';

    // Trades-Tabelle
    html += '<div class="card"><div class="card-header-dotted"><span class="card-title">Trades (' + result.trades.length + ')</span></div>';
    html += '<div class="table-responsive-wrapper"><table class="data-table"><thead><tr><th>Ticker</th><th>Kauf</th><th>Verkauf</th><th style="text-align:right;">Rendite</th></tr></thead><tbody>';
    result.trades.slice(0, 30).forEach(function (t) {
      html += '<tr><td><strong>' + esc(t.ticker) + '</strong></td>' +
        '<td>' + F.date(t.buyDate) + '</td>' +
        '<td>' + F.date(t.sellDate) + '</td>' +
        '<td style="text-align:right;font-weight:700;color:' + (t.ret >= 0 ? 'var(--bullish)' : 'var(--bearish)') + ';">' + (t.ret >= 0 ? '+' : '') + F.number(t.ret * 100, 1) + ' %</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '</div>';
    html += helpCard('Was bedeuten die Werte?', RESULT_HELP, false);

    container.innerHTML = html;

    // NAV-Chart
    var canvas = document.getElementById('bt-nav-chart');
    if (canvas) {
      window.App.Charts.renderLineChart(canvas, {
        labels: result.navSeries.map(function (v) { return 'M' + v.month; }),
        values: result.navSeries.map(function (v) { return v.nav; }),
        formatY: function (v) { return F.number(v, 0); }
      });
    }
  }

  return { initView: initView };
})();
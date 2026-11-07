    // -------------------------------------------------------------------------
    // Serien aufbauen (inkl. aktivierter Tools)
    // -------------------------------------------------------------------------
    var labels = slicedDates.map(shortLabel);
    var seriesArr = [
      { name: 'Kurs', color: COLORS.price, values: slicedCloses, width: 2 },
      { name: 'SMA 50', color: COLORS.sma50, values: s50.slice(-tail), width: 1.5 },
      { name: 'SMA 200', color: COLORS.sma200, values: s200.slice(-tail), width: 1.5 }
    ];

    if (activeTools.bollinger) {
      var bb = bollingerBands(closes, 20, 2);
      seriesArr.push({ name: 'BB Up', color: 'rgba(16,185,129,0.5)', values: bb.up.slice(-tail), width: 1, dash: [4, 4] });
      seriesArr.push({ name: 'BB Dn', color: 'rgba(239,68,68,0.5)', values: bb.dn.slice(-tail), width: 1, dash: [4, 4] });
    }

    if (activeTools.vwap) {
      var vwapData = anchoredVwap(closes, vols, closes.length - tail);
      seriesArr.push({ name: 'VWAP', color: 'var(--accent-purple-light)', values: vwapData.slice(-tail), width: 2, dash: [2, 2] });
    }

    if (activeTools.fibo) {
      var fDiff = hi - lo;
      [0.382, 0.5, 0.618].forEach(function(lvl) {
        var val = hi - (fDiff * lvl);
        seriesArr.push({ name: 'Fib ' + (lvl*100).toFixed(1)+'%', color: 'rgba(236,72,153,0.7)', values: fillArr(val, tail), width: 1, dash: [2, 4] });
      });
    }

    if (activeTools.sr) {
      seriesArr.push({ name: 'Res', color: 'rgba(239,68,68,0.7)', values: fillArr(hi, tail), width: 1.5, dash: [10, 5] });
      seriesArr.push({ name: 'Sup', color: 'rgba(16,185,129,0.7)', values: fillArr(lo, tail), width: 1.5, dash: [10, 5] });
    }

    if (activeTools.pivot) {
      var pivs = pivotPoints(hi, lo, price);
      seriesArr.push({ name: 'Pivot', color: '#a855f7', values: fillArr(pivs.p, tail), width: 1.5, dash: [5, 5] });
      seriesArr.push({ name: 'R1', color: 'rgba(239,68,68,0.5)', values: fillArr(pivs.r1, tail), width: 1, dash: [5, 5] });
      seriesArr.push({ name: 'S1', color: 'rgba(16,185,129,0.5)', values: fillArr(pivs.s1, tail), width: 1, dash: [5, 5] });
    }

    // --- Dynamische Legende für den Hauptchart generieren ---
    function legendItem(color, label) {
      // Wenn die Farbe rgba(...) mit Transparenz ist, machen wir sie für die Legende etwas kräftiger
      var dotColor = color;
      if (color.indexOf('rgba') === 0) {
        dotColor = color.replace(/[^,]+(?=\))/, '1.0'); 
      }
      return '<div class="legend-item"><span class="legend-dot" style="background:' + dotColor + ';"></span><span>' + label + '</span></div>';
    }
    
    var dynamicLegendHtml = '<div class="legend-row">';
    seriesArr.forEach(function(series) {
      dynamicLegendHtml += legendItem(series.color, series.name);
    });
    dynamicLegendHtml += '</div>';

    // -------------------------------------------------------------------------
    // HTML String zusammenbauen
    // -------------------------------------------------------------------------
    var html = '' +
      '<div class="card" style="padding: 10px 16px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">' +
        '<span style="font-size: 0.78rem; font-weight: 600; color: var(--text-dim); text-transform: uppercase;">Zeitraum</span>' +
        '<div class="pill-group" id="chart-period-pills">' +
          '<button class="pill-btn ' + (currentPeriod === '1W' ? 'active' : '') + '" data-period="1W">1W</button>' +
          '<button class="pill-btn ' + (currentPeriod === '1M' ? 'active' : '') + '" data-period="1M">1M</button>' +
          '<button class="pill-btn ' + (currentPeriod === '3M' ? 'active' : '') + '" data-period="3M">3M</button>' +
          '<button class="pill-btn ' + (currentPeriod === '6M' ? 'active' : '') + '" data-period="6M">6M</button>' +
          '<button class="pill-btn ' + (currentPeriod === '1Y' ? 'active' : '') + '" data-period="1Y">1J</button>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header-dotted">' +
          '<span class="card-title">Technisches Bild</span>' +
          '<span class="badge-pill ' + overallCls + '">' + overall + '</span>' +
        '</div>' +
        '<div class="chart-signal-list">' + signalRows + '</div>' +
      '</div>' +

      bottomCardHtml(bottomCheck(closes)) +
      '<div id="forecast-slot"></div>' +
      
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">Auffälligkeiten</span></div>' +
        '<div class="auff-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px;">' +
          '<div class="auff-col auff-col-plus" style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-top: 2px solid var(--bullish); padding: 10px;">' +
            '<div class="auff-col-head" style="font-size: 0.68rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; margin-bottom: 4px;">Auffällig günstig / stark</div>' +
            auffColHtml(auff.plus, 'Keine Auffälligkeit.') +
          '</div>' +
          '<div class="auff-col auff-col-minus" style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-top: 2px solid var(--bearish); padding: 10px;">' +
            '<div class="auff-col-head" style="font-size: 0.68rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; margin-bottom: 4px;">Auffällig teuer / schwach</div>' +
            auffColHtml(auff.minus, 'Keine Auffälligkeit.') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- Kurs + SMA & Tools Toolbar -->' +
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">Kurs &amp; Chart Tools</span></div>' +
        '<div class="horizontal-scroll-row" id="chart-tools-toolbar" style="margin-top: 8px; margin-bottom: 8px; padding-bottom: 4px;">' +
          '<button class="chip-btn ' + (activeTools.bollinger ? 'active' : '') + '" data-tool="bollinger">Bollinger <span class="term-link" data-term="Bollinger" style="margin-left: 4px; opacity: 0.7;">ⓘ</span></button>' +
          '<button class="chip-btn ' + (activeTools.vwap ? 'active' : '') + '" data-tool="vwap">AVWAP <span class="term-link" data-term="VWAP" style="margin-left: 4px; opacity: 0.7;">ⓘ</span></button>' +
          '<button class="chip-btn ' + (activeTools.fibo ? 'active' : '') + '" data-tool="fibo">Fibonacci <span class="term-link" data-term="Fibo" style="margin-left: 4px; opacity: 0.7;">ⓘ</span></button>' +
          '<button class="chip-btn ' + (activeTools.sr ? 'active' : '') + '" data-tool="sr">Support/Res <span class="term-link" data-term="Support" style="margin-left: 4px; opacity: 0.7;">ⓘ</span></button>' +
          '<button class="chip-btn ' + (activeTools.pivot ? 'active' : '') + '" data-tool="pivot">Pivots <span class="term-link" data-term="Pivot" style="margin-left: 4px; opacity: 0.7;">ⓘ</span></button>' +
          '<button class="chip-btn ' + (activeTools.pattern ? 'active' : '') + '" data-tool="pattern">Patterns <span class="term-link" data-term="Pattern" style="margin-left: 4px; opacity: 0.7;">ⓘ</span></button>' +
          '<button class="chip-btn ' + (activeTools.rr ? 'active' : '') + '" data-tool="rr" style="border-color: var(--accent-purple); color: var(--accent-purple-light);">Risk/Reward <span class="term-link" data-term="RiskReward" style="margin-left: 4px; opacity: 0.7;">ⓘ</span></button>' +
        '</div>' +
        '<div style="height: 220px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="chart-tab-price" style="width: 100%; height: 220px; display: block;"></canvas>' +
        '</div>' +
        dynamicLegendHtml +
      '</div>' +

      '<!-- Wochenkerzen -->' +
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">Wochenkerzen</span><span class="period-tag" id="candle-info">—</span></div>' +
        '<div class="pill-group" id="candle-range-pills" style="margin-top: 6px;">' +
          '<button class="pill-btn ' + (candleWeeks === 26 ? 'active' : '') + '" data-weeks="26">6M</button>' +
          '<button class="pill-btn ' + (candleWeeks === 52 ? 'active' : '') + '" data-weeks="52">1J</button>' +
          '<button class="pill-btn ' + (candleWeeks === 104 ? 'active' : '') + '" data-weeks="104">2J</button>' +
        '</div>' +
        '<div style="height: 240px; width: 100%; position: relative; margin-top: 8px;">' +
          '<canvas id="chart-tab-candles" style="width: 100%; height: 240px; display: block;"></canvas>' +
        '</div>' +
        '<div class="legend-row">' +
          legendItem('#10b981', 'Woche im Plus') +
          legendItem('#ef4444', 'Woche im Minus') +
          legendItem(COLORS.sma50, '10-Wochen-Linie') +
        '</div>' +
      '</div>' +

      '<!-- RSI -->' +
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">RSI (14)</span><span class="period-tag">' + (rsiLast !== null ? fmt(rsiLast, 0) : '—') + '</span></div>' +
        '<div style="height: 130px; width: 100%; position: relative; margin-top: 8px;"><canvas id="chart-tab-rsi" style="width: 100%; height: 130px; display: block;"></canvas></div>' +
        '<div class="chart-note">Über 70 = überkauft, unter 30 = überverkauft.</div>' +
      '</div>' +

      '<!-- MACD -->' +
      '<div class="card">' +
        '<div class="card-header-dotted"><span class="card-title">MACD (12/26/9)</span></div>' +
        '<div style="height: 140px; width: 100%; position: relative; margin-top: 8px;"><canvas id="chart-tab-macd" style="width: 100%; height: 140px; display: block;"></canvas></div>' +
        '<div class="legend-row">' +
          legendItem(COLORS.macd, 'MACD') +
          legendItem(COLORS.signal, 'Signal') +
          legendItem('rgba(16,185,129,1.0)', 'Histogramm') +
        '</div>' +
      '</div>';

    container.innerHTML = html;

    // ... (ab hier folgt der bestehende Code: window.App.Forecast.mount, bindTerms, etc.)
    if (window.App.Forecast) window.App.Forecast.mount(container.querySelector('#forecast-slot'), stock, closes, currentPeriod);
    
    bindTerms(container);
    bindPeriodPills(container, stock, hist);

    // Toolbar Tool-Events
    container.querySelectorAll('#chart-tools-toolbar .chip-btn').forEach(function(btn) {
      btn.onclick = function(e) {
        if (e.target.closest('.term-link')) return; 

        var tool = btn.getAttribute('data-tool');
        activeTools[tool] = !activeTools[tool]; 
        buildView(container, stock, hist); 
        
        if (tool === 'pattern' && activeTools.pattern) {
          var p = detectPatterns(closes, tail);
          if (p) alert("Muster erkannt: " + p.type + " bei " + window.App.Format.currency(p.val, currency));
          else {
            alert("Kein klares Doppel-Top/Boden Muster im gewählten Zeitraum erkannt.");
            activeTools.pattern = false;
            buildView(container, stock, hist);
          }
        }
      };
    });

    window.App.Charts.renderMultiLineChart(document.getElementById('chart-tab-price'), {
      labels: labels,
      series: seriesArr,
      formatY: function (v) { return window.App.Format.currency(v, currency, 0); }
    });

    if (activeTools.rr) {
       toggleRiskRewardOverlay(container, price, currency);
    }

    drawCandles(container, hist, currency);
    container.querySelectorAll('#candle-range-pills .pill-btn').forEach(function (pill) {
      pill.onclick = function () {
        candleWeeks = parseInt(pill.getAttribute('data-weeks'), 10) || 52;
        container.querySelectorAll('#candle-range-pills .pill-btn').forEach(function (b) { b.classList.remove('active'); });
        pill.classList.add('active');
        drawCandles(container, hist, currency);
      };
    });

    window.App.Charts.renderIndicatorChart(document.getElementById('chart-tab-rsi'), {
      labels: labels,
      lines: [{ values: rsiArr.slice(-tail), color: COLORS.rsi }],
      refLines: [{ value: 70, color: 'rgba(239, 68, 68, 0.6)' }, { value: 30, color: 'rgba(16, 185, 129, 0.6)' }],
      min: 0, max: 100,
      formatY: function (v) { return String(Math.round(v)); }
    });

    window.App.Charts.renderIndicatorChart(document.getElementById('chart-tab-macd'), {
      labels: labels,
      lines: [{ values: m.line.slice(-tail), color: COLORS.macd }, { values: m.signal.slice(-tail), color: COLORS.signal }],
      bars: m.hist.slice(-tail),
      refLines: [{ value: 0, color: 'rgba(255, 255, 255, 0.25)' }],
      formatY: function (v) { return fmt(v, Math.abs(v) < 10 ? 1 : 0); }
    });

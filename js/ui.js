// js/ui.js
// Verwaltet die Benutzeroberfläche des Screeners, das Rendern der Aktienkarten und Tabellen
// sowie die Interaktionen (Favoriten, Sortierung, Verlinkung in die Detailansicht Views/stock.html).

(function () {
  "use strict";

  // Hilfsfunktion zur Formatierung von Zahlen
  function formatNumber(val, decimals, suffix) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    const num = Number(val);
    const formatted = num.toLocaleString("de-DE", {
      minimumFractionDigits: decimals || 0,
      maximumFractionDigits: decimals || 0
    });
    return suffix ? formatted + suffix : formatted;
  }

  // Kompakte Währungs- und Volumendarstellung (B, M, K)
  function formatCompact(val, suffix) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    const num = Number(val);
    const abs = Math.abs(num);
    let str = "";

    if (abs >= 1e12) {
      str = (num / 1e12).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "T";
    } else if (abs >= 1e9) {
      str = (num / 1e9).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "B";
    } else if (abs >= 1e6) {
      str = (num / 1e6).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M";
    } else if (abs >= 1e3) {
      str = (num / 1e3).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "K";
    } else {
      str = num.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }

    return suffix ? str + " " + suffix : str;
  }

  // Navigation zur neuen Detailansicht (Views/stock.html)
  function openStockDetail(ticker, event) {
    // Klick auf den Watchlist-Stern soll keine Navigation auslösen
    if (event && event.target && event.target.closest(".watchlist-star-btn")) {
      return;
    }
    if (!ticker) return;
    window.location.href = "Views/stock.html?ticker=" + encodeURIComponent(ticker.toUpperCase());
  }

  // Rendert die Aktienliste für mobile Ansicht (Karten) und Desktop (Tabelle)
  function renderStockList(stocks, containerId) {
    const container = document.getElementById(containerId || "stockListContainer");
    if (!container) return;

    if (!stocks || stocks.length === 0) {
      container.innerHTML = '<div class="empty-state-hint" style="text-align: center; padding: 40px 10px; color: var(--text-muted); font-size: 13px;">Keine Aktien gefunden, die den Kriterien entsprechen.</div>';
      return;
    }

    const isWatchlist = typeof window.Watchlist !== "undefined";

    const cardsHTML = stocks.map(function (s) {
      const ticker = (s.ticker || s.symbol || "").toUpperCase();
      const name = s.name || ticker;
      const price = s.price != null ? formatNumber(s.price, 2, " €") : "-";
      const change = Number(s.change || s.dayChange || 0);
      const changeClass = change > 0 ? "val-positive" : (change < 0 ? "val-negative" : "val-neutral");
      const changeSign = change > 0 ? "+" : "";
      const changeStr = s.change != null || s.dayChange != null ? changeSign + formatNumber(change, 2, "%") : "-";

      const pe = s.pe != null || s.trailingPE != null ? formatNumber(s.pe || s.trailingPE, 1, "x") : "-";
      const fwdPe = s.forwardPE != null ? formatNumber(s.forwardPE, 1, "x") : "-";
      const divYield = s.dividendYield != null ? formatNumber(s.dividendYield * (s.dividendYield < 1 ? 100 : 1), 2, "%") : "-";
      const mktCap = formatCompact(s.marketCap || s.mktCap);

      const isFav = isWatchlist && window.Watchlist.isFavorite ? window.Watchlist.isFavorite(ticker) : false;
      const starIcon = isFav ? "★" : "☆";
      const starClass = isFav ? "active" : "";

      return (
        '<div class="screener-stock-card" data-ticker="' + ticker + '" style="cursor: pointer;">' +
          '<div class="stock-card-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">' +
            '<div style="display: flex; align-items: center; gap: 8px;">' +
              '<button type="button" class="watchlist-star-btn ' + starClass + '" data-ticker="' + ticker + '" aria-label="Favorit umschalten" style="background: none; border: none; font-size: 18px; line-height: 1; cursor: pointer; color: ' + (isFav ? "var(--color-yellow, #e3b341)" : "var(--text-muted, #8b949e)") + ';">' +
                starIcon +
              '</button>' +
              '<div>' +
                '<div style="font-weight: 700; font-size: 15px; color: var(--text-main, #f0f6fc);">' + ticker + '</div>' +
                '<div style="font-size: 11px; color: var(--text-muted, #8b949e); max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + name + '</div>' +
              '</div>' +
            '</div>' +
            '<div style="text-align: right;">' +
              '<div style="font-weight: 700; font-size: 15px; color: var(--text-main, #f0f6fc); font-variant-numeric: tabular-nums;">' + price + '</div>' +
              '<div class="' + changeClass + '" style="font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums;">' + changeStr + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="stock-card-metrics" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding-top: 8px; border-top: 1px solid var(--border-color, #30363d); font-size: 10px; text-align: center;">' +
            '<div><span style="color: var(--text-muted, #8b949e); display: block;">KGV</span><strong style="color: var(--text-main, #f0f6fc);">' + pe + '</strong></div>' +
            '<div><span style="color: var(--text-muted, #8b949e); display: block;">Fwd KGV</span><strong style="color: var(--text-main, #f0f6fc);">' + fwdPe + '</strong></div>' +
            '<div><span style="color: var(--text-muted, #8b949e); display: block;">Dividende</span><strong style="color: var(--text-main, #f0f6fc);">' + divYield + '</strong></div>' +
            '<div><span style="color: var(--text-muted, #8b949e); display: block;">Marktkap.</span><strong style="color: var(--text-main, #f0f6fc);">' + mktCap + '</strong></div>' +
          '</div>' +
        '</div>'
      );
    }).join("");

    container.innerHTML = cardsHTML;
    attachCardEvents(container);
  }

  // Klick-Events für Karten (Öffnen von Views/stock.html) und Favoriten-Sterne
  function attachCardEvents(container) {
    const cards = container.querySelectorAll(".screener-stock-card");
    cards.forEach(function (card) {
      card.addEventListener("click", function (e) {
        const starBtn = e.target.closest(".watchlist-star-btn");
        if (starBtn) {
          e.stopPropagation();
          const ticker = starBtn.getAttribute("data-ticker");
          if (window.Watchlist && window.Watchlist.toggleFavorite) {
            window.Watchlist.toggleFavorite(ticker);
            const isFav = window.Watchlist.isFavorite(ticker);
            starBtn.textContent = isFav ? "★" : "☆";
            starBtn.style.color = isFav ? "var(--color-yellow, #e3b341)" : "var(--text-muted, #8b949e)";
            starBtn.classList.toggle("active", isFav);
          }
          return;
        }

        const sym = this.getAttribute("data-ticker");
        openStockDetail(sym, e);
      });
    });
  }

  // Globaler Export für Screener & Watchlist
  window.UI = {
    renderStockList: renderStockList,
    openStockDetail: openStockDetail,
    formatNumber: formatNumber,
    formatCompact: formatCompact
  };
})();

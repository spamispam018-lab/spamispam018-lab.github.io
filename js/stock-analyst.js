/**
 * Controller für Analysten-Konsens, Kursziele und Ratings im Dark-Mode
 */
const StockAnalyst = (function () {
  function formatEuroPrice(val) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    return Number(val).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " €";
  }

  function renderAnalystSummary(containerId, analystData = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const consensus = analystData.consensus || analystData.recommendationKey || "Neutral";
    const targetHigh = analystData.targetHigh || analystData.targetPriceHigh;
    const targetLow = analystData.targetLow || analystData.targetPriceLow;
    const targetMean = analystData.targetMean || analystData.targetPriceMean;
    const numberOfAnalysts = analystData.numberOfAnalysts || analystData.count || 0;

    const buyCount = analystData.buy || 0;
    const holdCount = analystData.hold || 0;
    const sellCount = analystData.sell || 0;
    const totalCount = buyCount + holdCount + sellCount || numberOfAnalysts || 1;

    const buyPct = Math.round((buyCount / totalCount) * 100);
    const holdPct = Math.round((holdCount / totalCount) * 100);
    const sellPct = 100 - (buyPct + holdPct);

    let html = `
      <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">KONSENS</span>
          <span style="font-size: 0.85rem; font-weight: 800; color: #a5b4fc; text-transform: uppercase;">${consensus}</span>
        </div>

        <!-- Gestapelter Verteilungsbalken -->
        <div style="display: flex; height: 10px; border-radius: 5px; overflow: hidden; background-color: var(--border-color); margin-bottom: 0.75rem;">
          <div style="width: ${buyPct}%; background-color: var(--green);" title="Kaufen: ${buyPct}%"></div>
          <div style="width: ${holdPct}%; background-color: #f59e0b;" title="Halten: ${holdPct}%"></div>
          <div style="width: ${sellPct}%; background-color: var(--red);" title="Verkaufen: ${sellPct}%"></div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted);">
          <span>Kaufen: ${buyPct}%</span>
          <span>Halten: ${holdPct}%</span>
          <span>Verkaufen: ${sellPct}%</span>
        </div>
      </div>

      <!-- Kursziel Spanne -->
      <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem;">
        <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.5rem;">KURSZIELE DER ANALYSTEN</div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
          <div style="text-align: left;">
            <div style="font-size: 0.7rem; color: var(--text-sub);">TIEF</div>
            <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main);">${formatEuroPrice(targetLow)}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 0.7rem; color: var(--text-sub);">MITTEL</div>
            <div style="font-size: 1.05rem; font-weight: 800; color: #a5b4fc;">${formatEuroPrice(targetMean)}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.7rem; color: var(--text-sub);">HOCH</div>
            <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main);">${formatEuroPrice(targetHigh)}</div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  function renderRecommendationsList(containerId, recommendations = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.82rem; text-align: center; padding: 1rem 0;">Keine aktuellen Einzelanalysen hinterlegt.</p>';
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.6rem; margin-top: 1rem;">';

    recommendations.slice(0, 5).forEach(item => {
      const firm = item.firm || item.Firm || "Analyst";
      const toGrade = item.toGrade || item.ToGrade || item.action || "Neutral";
      const date = item.date || item.Date || "-";

      let badgeBg = "rgba(148, 163, 184, 0.15)";
      let badgeColor = "#94a3b8";

      const lowerGrade = toGrade.toLowerCase();
      if (lowerGrade.includes("buy") || lowerGrade.includes("outperform") || lowerGrade.includes("overweight")) {
        badgeBg = "var(--green-bg)";
        badgeColor = "var(--green)";
      } else if (lowerGrade.includes("sell") || lowerGrade.includes("underperform")) {
        badgeBg = "var(--red-bg)";
        badgeColor = "var(--red)";
      }

      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
          <div>
            <div style="font-size: 0.88rem; font-weight: 700; color: var(--text-main);">${firm}</div>
            <div style="font-size: 0.75rem; color: var(--text-sub);">${date}</div>
          </div>
          <span style="background: ${badgeBg}; color: ${badgeColor}; font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.55rem; border-radius: 6px;">
            ${toGrade}
          </span>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  async function init() {
    let stock = window.StockDataHandler ? window.StockDataHandler.getCurrentStock() : null;
    if (!stock && window.StockDataHandler) {
      stock = await window.StockDataHandler.initCurrentStock();
    }
    if (!stock) return;

    const analystData = stock.analystRatings || stock.analysts || {};
    renderAnalystSummary("analyst-summary", analystData);
    renderRecommendationsList("analyst-recommendations-list", analystData.history || analystData.recommendations || []);
  }

  return {
    init
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("analyst-summary")) {
    StockAnalyst.init();
  }
});

window.StockAnalyst = StockAnalyst;

/**
 * Aufbereitung und Darstellung von Analysten-Empfehlungen und Preiszielen
 */
const StockAnalyst = (function () {
  function renderRecommendations(recommendations = []) {
    const container = document.getElementById("analyst-recommendations-list");
    const summaryContainer = document.getElementById("analyst-summary");

    if (!container) return;

    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      container.innerHTML = '<p class="text-muted">Keine aktuellen Analystenbewertungen vorhanden.</p>';
      if (summaryContainer) summaryContainer.innerHTML = '';
      return;
    }

    // Zählung für Konsens-Auswertung
    let buyCount = 0;
    let holdCount = 0;
    let sellCount = 0;

    let html = '<div class="table-responsive"><table class="analyst-table"><thead><tr>';
    html += '<th>Datum / Periode</th><th>Firma / Analyst</th><th>Einstufung</th><th>Aktion</th>';
    html += '</tr></thead><tbody>';

    recommendations.forEach(rec => {
      const firm = rec.Firm || rec.firm || "-";
      const toGrade = rec["To Grade"] || rec.toGrade || rec.grade || "-";
      const action = rec.Action || rec.action || "-";
      const date = rec.Date || rec.date || "-";

      const gradeUpper = String(toGrade).toUpperCase();
      let badgeClass = "badge-neutral";
      if (gradeUpper.includes("BUY") || gradeUpper.includes("OUTPERFORM") || gradeUpper.includes("OVERWEIGHT")) {
        badgeClass = "badge-success";
        buyCount++;
      } else if (gradeUpper.includes("SELL") || gradeUpper.includes("UNDERPERFORM") || gradeUpper.includes("UNDERWEIGHT")) {
        badgeClass = "badge-danger";
        sellCount++;
      } else {
        holdCount++;
      }

      html += `<tr>
        <td>${date}</td>
        <td><strong>${firm}</strong></td>
        <td><span class="analyst-badge ${badgeClass}">${toGrade}</span></td>
        <td>${action}</td>
      </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    // Konsens-Zusammenfassung rendern
    if (summaryContainer) {
      const total = buyCount + holdCount + sellCount;
      if (total > 0) {
        let consensusText = "Halten";
        let consensusClass = "text-yellow";

        if (buyCount > holdCount && buyCount > sellCount) {
          consensusText = "Kaufen (Buy)";
          consensusClass = "text-green";
        } else if (sellCount > buyCount && sellCount > holdCount) {
          consensusText = "Verkaufen (Sell)";
          consensusClass = "text-red";
        }

        summaryContainer.innerHTML = `
          <div class="analyst-summary-card">
            <h4>Analysten-Konsens: <span class="${consensusClass}">${consensusText}</span></h4>
            <div class="analyst-bar-wrapper">
              <span class="bar-part bg-green" style="width: ${(buyCount / total) * 100}%" title="Kaufen: ${buyCount}"></span>
              <span class="bar-part bg-yellow" style="width: ${(holdCount / total) * 100}%" title="Halten: ${holdCount}"></span>
              <span class="bar-part bg-red" style="width: ${(sellCount / total) * 100}%" title="Verkaufen: ${sellCount}"></span>
            </div>
            <div class="analyst-legend">
              <span class="legend-item"><span class="dot bg-green"></span> Kaufen: ${buyCount}</span>
              <span class="legend-item"><span class="dot bg-yellow"></span> Halten: ${holdCount}</span>
              <span class="legend-item"><span class="dot bg-red"></span> Verkaufen: ${sellCount}</span>
            </div>
          </div>
        `;
      }
    }
  }

  async function init() {
    let stock = window.StockDataHandler ? window.StockDataHandler.getCurrentStock() : null;
    if (!stock && window.StockDataHandler) {
      stock = await window.StockDataHandler.initCurrentStock();
    }
    if (!stock) return;

    renderRecommendations(stock.recommendations);
  }

  return {
    init
  };
})();

// DOM-Ready Hook
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("analyst-recommendations-list")) {
    StockAnalyst.init();
  }
});

// Global verfügbar machen
window.StockAnalyst = StockAnalyst;

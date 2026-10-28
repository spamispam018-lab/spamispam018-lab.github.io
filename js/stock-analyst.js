/**
 * stock-analyst.js
 * Visualisierung von Analysten-Einschätzungen, Kurszielen und Historie
 */

function renderAnalystTab(stock) {
    const container = document.getElementById('analyst-content');
    if (!container) return;

    const ratings = stock.analystRatings || {};
    const buy = ratings.buy || 0;
    const hold = ratings.hold || 0;
    const sell = ratings.sell || 0;
    const total = buy + hold + sell;

    let buyPct = 0;
    let holdPct = 0;
    let sellPct = 0;

    if (total > 0) {
        buyPct = Math.round((buy / total) * 100);
        holdPct = Math.round((hold / total) * 100);
        sellPct = 100 - buyPct - holdPct; // Verhindert Rundungsfehler
    }

    const consensus = ratings.consensus || 'N/A';
    const numAnalysts = ratings.numberOfAnalysts || total || 'N/A';

    // Kursziele
    const targetLow = ratings.targetLow ? `${ratings.targetLow.toFixed(2)} $` : 'N/A';
    const targetMean = ratings.targetMean ? `${ratings.targetMean.toFixed(2)} $` : 'N/A';
    const targetHigh = ratings.targetHigh ? `${ratings.targetHigh.toFixed(2)} $` : 'N/A';
    const currentPrice = stock.price ? `${stock.price.toFixed(2)} $` : 'N/A';

    // Upside / Downside berechnen
    let potentialHtml = '';
    if (ratings.targetMean && stock.price) {
        const diff = ((ratings.targetMean - stock.price) / stock.price) * 100;
        const diffClass = diff >= 0 ? 'text-success' : 'text-danger';
        const sign = diff >= 0 ? '+' : '';
        potentialHtml = `<span class="${diffClass}">(${sign}${diff.toFixed(1)} %)</span>`;
    }

    // Historie rendern
    let historyHtml = '<p class="text-muted">Keine Historie verfügbar.</p>';
    if (ratings.history && ratings.history.length > 0) {
        historyHtml = `
            <div class="table-responsive">
                <table class="table table-sm table-striped">
                    <thead>
                        <tr>
                            <th>Datum</th>
                            <th>Analysehaus</th>
                            <th>Einstufung</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ratings.history.map(item => `
                            <tr>
                                <td>${item.date || '-'}</td>
                                <td>${item.firm || '-'}</td>
                                <td><span class="badge bg-secondary">${item.toGrade || '-'}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // HTML Zusammensetzen
    container.innerHTML = `
        <div class="row mb-4">
            <!-- Konsens & Verteilung -->
            <div class="col-md-6 mb-3">
                <div class="card h-100 shadow-sm">
                    <div class="card-body">
                        <h5 class="card-title">Analysten-Konsens</h5>
                        <div class="d-flex align-items-baseline mb-3">
                            <h3 class="mb-0 text-capitalize me-2">${translateConsensus(consensus)}</h3>
                            <span class="text-muted">(${numAnalysts} Analysten)</span>
                        </div>

                        ${total === 0 ? `
                            <div class="alert alert-light border text-center text-muted py-2 mb-2">
                                Keine Analystendaten verfügbar
                            </div>
                            <div class="progress" style="height: 24px;">
                                <div class="progress-bar bg-secondary" role="progressbar" style="width: 100%">Keine Daten</div>
                            </div>
                        ` : `
                            <div class="progress mb-2" style="height: 24px;">
                                <div class="progress-bar bg-success" role="progressbar" style="width: ${buyPct}%" title="Kaufen: ${buyPct}%">
                                    ${buyPct > 10 ? buyPct + '%' : ''}
                                </div>
                                <div class="progress-bar bg-warning text-dark" role="progressbar" style="width: ${holdPct}%" title="Halten: ${holdPct}%">
                                    ${holdPct > 10 ? holdPct + '%' : ''}
                                </div>
                                <div class="progress-bar bg-danger" role="progressbar" style="width: ${sellPct}%" title="Verkaufen: ${sellPct}%">
                                    ${sellPct > 10 ? sellPct + '%' : ''}
                                </div>
                            </div>
                            <div class="d-flex justify-content-between small text-muted">
                                <span><span class="badge bg-success">&nbsp;</span> Kaufen: ${buy} (${buyPct}%)</span>
                                <span><span class="badge bg-warning">&nbsp;</span> Halten: ${hold} (${holdPct}%)</span>
                                <span><span class="badge bg-danger">&nbsp;</span> Verkaufen: ${sell} (${sellPct}%)</span>
                            </div>
                        `}
                    </div>
                </div>
            </div>

            <!-- Kursziele -->
            <div class="col-md-6 mb-3">
                <div class="card h-100 shadow-sm">
                    <div class="card-body">
                        <h5 class="card-title">Kursziele</h5>
                        <div class="row text-center mt-3">
                            <div class="col-4">
                                <small class="text-muted d-block">Niedrig</small>
                                <strong class="fs-5">${targetLow}</strong>
                            </div>
                            <div class="col-4 border-start border-end">
                                <small class="text-muted d-block">Mittelwert</small>
                                <strong class="fs-5 text-primary">${targetMean}</strong>
                                <div>${potentialHtml}</div>
                            </div>
                            <div class="col-4">
                                <small class="text-muted d-block">Hoch</small>
                                <strong class="fs-5">${targetHigh}</strong>
                            </div>
                        </div>
                        <div class="text-center mt-3 pt-2 border-top">
                            <small class="text-muted">Aktueller Kurs: <strong>${currentPrice}</strong></small>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Rating Historie -->
        <div class="row">
            <div class="col-12">
                <div class="card shadow-sm">
                    <div class="card-body">
                        <h5 class="card-title">Neueste Einstufungen & Kurszieländerungen</h5>
                        ${historyHtml}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function translateConsensus(key) {
    if (!key || key === 'N/A') return 'Nicht verfügbar';
    const map = {
        'strong_buy': 'Starker Kauf',
        'buy': 'Kaufen',
        'hold': 'Halten',
        'underperform': 'Untergewichten',
        'sell': 'Verkaufen'
    };
    return map[key.toLowerCase()] || key;
}

// Global verfügbar machen
window.renderAnalystTab = renderAnalystTab;

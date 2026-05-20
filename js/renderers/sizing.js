/**
 * renderers/sizing.js - Onglet Dimensionnement réseau (EDF)
 * Dépend de : app_state.js, constants.js, charts/, sizing.js, export.js
 */

function calcSizing() {
  if (!AppState.weatherData) {
    showToast('Sélectionnez un lieu avec des données météo.', 'error');
    return;
  }
  const input      = SizingEngine.readFormInput();
  const annualConso = input.bill.monthlyKwh.reduce((s, k) => s + k, 0);
  if (annualConso === 0) {
    document.getElementById('sizing-results').innerHTML = `<div class="result-placeholder">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 11h-2v2H9v-2H7v-2h2V9h2v2h2v2z"/></svg>
      <p>Renseignez votre consommation mensuelle<br>puis cliquez sur <strong>Dimensionner</strong></p>
    </div>`;
    return;
  }
  if (!input.site.maxSurfaceM2) {
    document.getElementById('sizing-results').innerHTML = `<div class="result-placeholder">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
      <p>Renseignez la surface disponible en toiture<br>puis cliquez sur <strong>Dimensionner</strong></p>
    </div>`;
    return;
  }
  const { recommended, allCandidates, currentBill } =
    SizingEngine.run(input, AppState.weatherData, AppState.location.lat);
  AppState.lastSizingResult = recommended;
  AppState.lastSizingInput  = input;
  renderSizingResults(recommended, allCandidates, currentBill, annualConso);
}

function renderSizingResults(rec, allCandidates, currentBill, annualConso) {
  const el = document.getElementById('sizing-results');
  if (!rec) {
    el.innerHTML = '<div class="alert alert-warning">Impossible de calculer - vérifiez les données.</div>';
    return;
  }

  const c1 = 'chart-sz1-' + Date.now();
  const c2 = 'chart-sz2-' + Date.now();
  const c3 = 'chart-sz3-' + Date.now();
  const c4 = 'chart-sz4-' + Date.now();

  const tableRows = rec.monthlyMetrics.map(m => `
    <tr>
      <td>${m.name}</td>
      <td>${Math.round(m.conso)}</td>
      <td>${Math.round(m.prod)}</td>
      <td style="color:var(--color-success);font-weight:700">${Math.round(m.autoconsoKwh)}</td>
      <td style="color:var(--color-danger)">${Math.round(m.deficit)}</td>
      <td style="color:var(--color-accent-dark)">${Math.round(m.surplus)}</td>
    </tr>`).join('');

  const slotBadge = rec.slotLevel
    ? `<span style="font-size:11px;background:#e8f5e9;color:var(--color-success);padding:2px 8px;border-radius:10px;margin-left:8px">Simulation 30min Enedis</span>`
    : `<span style="font-size:11px;background:var(--color-bg);color:var(--color-text-muted);padding:2px 8px;border-radius:10px;margin-left:8px">Profil mensuel agrégé</span>`;

  el.innerHTML = `
    <div class="card" style="border-left:4px solid var(--color-accent);margin-bottom:16px">
      <div class="card-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        Installation recommandée - ${AppState.location.name}${slotBadge}
      </div>
      <div class="kpi-grid">
        <div class="kpi-card" style="border-left:3px solid var(--color-accent)">
          <div class="kpi-value accent">${rec.Ppeak}</div>
          <div class="kpi-label">Puissance recommandée<br><span class="kpi-unit">kWc</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${rec.nPanels}</div>
          <div class="kpi-label">Nombre de panneaux<br><span class="kpi-unit">unités</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value" style="color:var(--color-success)">${rec.coverageRate} %</div>
          <div class="kpi-label">Taux de couverture<br><span class="kpi-unit">autoconso / conso totale</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${rec.autoconsoRate} %</div>
          <div class="kpi-label">Autoconsommation<br><span class="kpi-unit">% produit consommé</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value accent">${rec.paybackYears ? rec.paybackYears + ' ans' : '> 40 ans'}</div>
          <div class="kpi-label">Retour invest. actualisé<br><span class="kpi-unit">avec +3 %/an électricité</span></div>
        </div>
        <div class="kpi-card">
          ${rec.incentive > 0
            ? `<div class="kpi-value" style="color:var(--color-text-muted);font-size:1rem;text-decoration:line-through">${rec.systemCostBrut.toLocaleString('fr')}</div>
               <div class="kpi-value accent">${rec.systemCost.toLocaleString('fr')} €</div>
               <div class="kpi-label">Coût net après prime<br><span class="kpi-unit">Prime autoconso −${rec.incentive.toLocaleString('fr')} €</span></div>`
            : `<div class="kpi-value">${rec.systemCost.toLocaleString('fr')}</div>
               <div class="kpi-label">Coût système<br><span class="kpi-unit">€ HT estimé</span></div>`
          }
        </div>
        ${rec.npv25 != null && rec.systemCost > 0 ? `
        <div class="kpi-card" style="border-left:3px solid ${rec.npv25 >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}">
          <div class="kpi-value" style="color:${rec.npv25 >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}">
            ${rec.npv25 >= 0 ? '+' : ''}${rec.npv25.toLocaleString('fr')} €
          </div>
          <div class="kpi-label">VAN 25 ans (4 %)<br><span class="kpi-unit">gain net actualisé</span></div>
        </div>` : ''}
        ${rec.lcoe > 0 ? `
        <div class="kpi-card">
          <div class="kpi-value info">${rec.lcoe.toFixed(3)}</div>
          <div class="kpi-label">LCOE<br><span class="kpi-unit">€/kWh produit (25 ans)</span></div>
        </div>` : ''}
      </div>
      <div style="font-size:11px;color:var(--color-text-muted);margin-top:-8px;margin-bottom:4px">
        Hypothèses financières : dégradation panneau ${(PANEL_DEGRADATION * 100).toFixed(1)} %/an · hausse électricité ${(ELEC_ESCALATION * 100).toFixed(0)} %/an · taux actualisation ${(DISCOUNT_RATE * 100).toFixed(0)} %
      </div>
    </div>

    <div class="card">
      <div class="section-header">
        <div class="card-title">Analyse détaillée</div>
        <div class="btn-group">
          <button class="btn btn-outline btn-sm" onclick="SizingEngine.exportCSV(AppState.lastSizingResult)">CSV</button>
          <button class="btn btn-outline btn-sm" onclick="Exporter.exportPDF()">PDF</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="chart-container"><canvas id="${c1}"></canvas></div>
        <div class="chart-container"><canvas id="${c2}"></canvas></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="chart-container"><canvas id="${c3}"></canvas></div>
        <div class="chart-container"><canvas id="${c4}"></canvas></div>
      </div>
      <hr>
      <table class="data-table">
        <thead>
          <tr>
            <th>Mois</th>
            <th>Conso<br>kWh</th>
            <th>Prod PV<br>kWh</th>
            <th style="color:var(--color-success)">Autoconso<br>kWh</th>
            <th style="color:var(--color-danger)">Déficit<br>kWh</th>
            <th style="color:var(--color-accent-dark)">Surplus<br>kWh</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;

  setTimeout(() => {
    Charts.renderSizingProductionVsConso(c1, rec);
    Charts.renderSizingEnergyFlow(c2, rec);
    Charts.renderSizingRoiCurve(c3, allCandidates, rec.Ppeak);
    Charts.renderSizingDonut(c4, rec);
  }, 50);
}

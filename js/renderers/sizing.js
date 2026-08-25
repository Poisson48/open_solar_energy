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
  AppState.lastSizingResult     = recommended;
  AppState.lastSizingCandidates = allCandidates;
  AppState.lastSizingInput      = input;
  renderSizingResults(recommended, allCandidates, currentBill, annualConso);

  // Commit git après dimensionnement
  if (typeof gitAutoSave === 'function' && recommended) {
    gitAutoSave(`Calcul dimensionnement — ${recommended.Ppeak} kWc`);
  }
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

  const escPct = ((rec.elecEscalation ?? ELEC_ESCALATION) * 100).toFixed(1).replace(/\.0$/, '');
  const paybackTxt = rec.paybackYears
    ? `environ ${rec.paybackYears} an${rec.paybackYears > 1 ? 's' : ''}`
    : 'plus de 40 ans';
  const costTxt = rec.systemCost.toLocaleString('fr');
  const summary = `Environ <strong>${rec.nPanels} panneau${rec.nPanels > 1 ? 'x' : ''}</strong> `
    + `(<strong>${rec.Ppeak.toLocaleString('fr')} kWc</strong>) pour couvrir `
    + `<strong>~${rec.coverageRate.toLocaleString('fr')}&nbsp;%</strong> de votre consommation, `
    + `rentabilisé en <strong>${paybackTxt}</strong>`
    + (rec.systemCost > 0 ? `, pour environ <strong>${costTxt}&nbsp;€</strong> après aide` : '')
    + '.';

  const slotBadge = rec.slotLevel
    ? `<span class="ose-rec-badge ose-rec-badge-ok">Données Enedis 30 min</span>`
    : `<span class="ose-rec-badge">Profil mensuel</span>`;

  const costBlock = rec.incentive > 0
    ? `<div class="kpi-value accent">${costTxt} €</div>
       <div class="kpi-label">À payer (après prime)<br><span class="kpi-unit">${rec.systemCostBrut.toLocaleString('fr')} € − ${rec.incentive.toLocaleString('fr')} € d’aide</span></div>`
    : `<div class="kpi-value">${costTxt} €</div>
       <div class="kpi-label">Coût estimé<br><span class="kpi-unit">€ HT</span></div>`;

  el.innerHTML = `
    <div class="card ose-rec-card">
      <div class="card-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        Recommandation — ${AppState.location.name}
        ${slotBadge}
      </div>
      <p class="ose-rec-summary">${summary}</p>
      <div class="kpi-grid ose-rec-kpis">
        <div class="kpi-card" style="border-left:3px solid var(--color-accent)">
          <div class="kpi-value accent">${rec.Ppeak.toLocaleString('fr')} <span class="kpi-unit">kWc</span></div>
          <div class="kpi-label">${rec.nPanels} panneau${rec.nPanels > 1 ? 'x' : ''}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value" style="color:var(--color-success)">${rec.coverageRate.toLocaleString('fr')} %</div>
          <div class="kpi-label">de votre conso couverte<br><span class="kpi-unit">par l’électricité produite et consommée sur place</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value accent">${rec.paybackYears ? rec.paybackYears + ' ans' : '> 40 ans'}</div>
          <div class="kpi-label">pour rentabiliser<br><span class="kpi-unit">hausse élec. +${escPct} %/an prise en compte</span></div>
        </div>
        <div class="kpi-card">
          ${costBlock}
        </div>
      </div>

      <details class="ose-rec-details">
        <summary>Détails techniques et financiers</summary>
        <ul class="ose-rec-dl">
          <li><span>Autoconsommation</span><strong>${rec.autoconsoRate.toLocaleString('fr')} %</strong>
            <em>part de la production consommée sur place (le reste est injecté / revendu)</em></li>
          ${rec.npv25 != null && rec.systemCost > 0 ? `
          <li><span>Gain net sur 25 ans (VAN)</span>
            <strong style="color:${rec.npv25 >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}">${rec.npv25 >= 0 ? '+' : ''}${rec.npv25.toLocaleString('fr')} €</strong>
            <em>après actualisation ${(DISCOUNT_RATE * 100).toFixed(0)} %/an — positif = rentable</em></li>` : ''}
          ${rec.lcoe > 0 ? `
          <li><span>Coût du kWh produit (LCOE)</span><strong>${rec.lcoe.toLocaleString('fr', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/kWh</strong>
            <em>coût moyen de production sur 25 ans</em></li>` : ''}
          <li><span>Hypothèses</span><strong>—</strong>
            <em>dégradation panneaux ${(PANEL_DEGRADATION * 100).toFixed(1)} %/an · hausse électricité +${escPct} %/an · actualisation ${(DISCOUNT_RATE * 100).toFixed(0)} %</em></li>
        </ul>
      </details>

      <button type="button" class="btn btn-primary" style="width:100%;margin-top:12px" onclick="applySizingToGrid()">
        → Appliquer au Système PV réseau (${rec.nPanels} panneaux · ${rec.Ppeak.toLocaleString('fr')} kWc)
      </button>
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

/** Reco Dimensionnement → onglet Système PV réseau (mode Fixe + calcul). */
function applySizingToGrid() {
  const rec = AppState.lastSizingResult;
  if (!rec || !rec.nPanels) {
    showToast('Lancez d\'abord un dimensionnement.', 'warning');
    return;
  }

  const copy = (fromId, toId) => {
    const from = document.getElementById(fromId);
    const to   = document.getElementById(toId);
    if (from && to && from.value !== '') to.value = from.value;
  };

  copy('sz-tilt', 'inp-tilt');
  copy('sz-azimuth', 'inp-azimuth');
  copy('sz-surface', 'inp-surface');
  copy('sz-panel-wp', 'inp-panel-wp');
  copy('sz-panel-m2', 'inp-panel-m2');
  copy('sz-losses', 'inp-losses');
  copy('sz-panel-model', 'inp-panel-model');
  copy('sz-tech', 'sel-tech');
  copy('sz-feedin', 'inp-kwh-price');

  if (rec.systemCost > 0) {
    const costEl = document.getElementById('inp-cost');
    if (costEl) costEl.value = rec.systemCost;
  }

  // Surface au moins égale à l'emprise des panneaux recommandés
  const panelM2 = parseFloat(document.getElementById('inp-panel-m2')?.value) || 1.96;
  const surfEl  = document.getElementById('inp-surface');
  const needM2  = Math.round(rec.nPanels * panelM2 * 10) / 10;
  if (surfEl) {
    const cur = parseFloat(surfEl.value) || 0;
    if (cur < needM2) surfEl.value = needM2;
  }

  if (typeof readInstallFromTab === 'function') readInstallFromTab('sizing');
  if (typeof writeInstallToTab === 'function') writeInstallToTab('grid');

  if (typeof setPanelMode === 'function') setPanelMode('grid', 'fixe');
  const nEl = document.getElementById('grid-npanels-fixe');
  if (nEl) nEl.value = rec.nPanels;
  if (typeof calcGridPanels === 'function') calcGridPanels();

  if (typeof activateTab === 'function') activateTab('grid');

  if (AppState.weatherData && typeof calcGridSystem === 'function') {
    calcGridSystem();
  }

  showToast(`✓ Appliqué au système réseau : ${rec.nPanels} panneaux (${rec.Ppeak} kWc)`);
}

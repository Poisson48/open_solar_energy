/**
 * renderers.js — Fonctions d'affichage des résultats de calcul
 * Extrait de main.js v1.4
 * Dépend de : app_state.js, charts.js, export.js, sizing.js, offgrid_sizing.js
 */

// ══════════════════════════════════════════════════════════════
//  SYSTÈME PV RÉSEAU
// ══════════════════════════════════════════════════════════════

/** Calcule et affiche en temps réel le nombre de panneaux + Ppeak depuis surface */
function calcGridPanels() {
  const surface  = parseFloat(document.getElementById('inp-surface')?.value)   || 0;
  const panelM2  = parseFloat(document.getElementById('inp-panel-m2')?.value)  || 1.96;
  const panelWp  = parseFloat(document.getElementById('inp-panel-wp')?.value)  || 400;

  const nPanels = Math.floor(surface / panelM2);
  const Ppeak   = (nPanels * panelWp) / 1000;

  const nEl    = document.getElementById('grid-npanels');
  const pEl    = document.getElementById('grid-ppeak-display');
  const hidden = document.getElementById('inp-ppeak');

  if (nEl)    nEl.textContent    = nPanels > 0 ? `${nPanels} panneaux` : '—';
  if (pEl)    pEl.textContent    = Ppeak   > 0 ? `${Ppeak.toFixed(2)} kWc` : '—';
  if (hidden) hidden.value       = Ppeak   > 0 ? Ppeak : 3;
}

function calcGridSystem() {
  if (!AppState.weatherData) {
    alert('Veuillez sélectionner un lieu avec des données météo.');
    return;
  }

  // Recalculer Ppeak depuis les inputs surface/panneau au moment du clic
  calcGridPanels();

  const surface  = parseFloat(document.getElementById('inp-surface')?.value)  || 0;
  if (!surface) {
    document.getElementById('grid-results').innerHTML = `<div class="result-placeholder">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
      <p>Renseignez la surface disponible en toiture<br>puis cliquez sur <strong>Calculer</strong></p>
    </div>`;
    return;
  }
  const panelM2  = parseFloat(document.getElementById('inp-panel-m2')?.value) || 1.96;
  const panelWp  = parseFloat(document.getElementById('inp-panel-wp')?.value) || 400;
  const nPanels  = Math.floor(surface / panelM2);
  const Ppeak    = nPanels > 0 ? (nPanels * panelWp) / 1000 : 3;

  const params = {
    lat:        AppState.location.lat,
    weatherData: AppState.weatherData,
    Ppeak,
    nPanels,
    panelWp,
    surface,
    panelM2,
    losses:     parseFloat(document.getElementById('inp-losses').value) || 14,
    tilt:       parseFloat(document.getElementById('inp-tilt').value) || 30,
    azimuth:    parseFloat(document.getElementById('inp-azimuth').value) || 0,
    tech:       document.getElementById('sel-tech').value,
    systemCost: parseFloat(document.getElementById('inp-cost').value) || 0,
    kwhPrice:   parseFloat(document.getElementById('inp-kwh-price').value) || 0.13,
    co2Factor:  parseFloat(document.getElementById('inp-co2').value) || 0.052
  };
  const results = SolarMath.gridSystemAnnual(params);
  AppState.lastGridResult = results;
  AppState.lastGridParams = params;
  renderGridResults(results, params);
}

function renderGridResults(results, params) {
  const el = document.getElementById('grid-results');
  el.innerHTML = '';

  const kpiHtml = `
    <div class="kpi-grid">
      <div class="kpi-card" style="border-left:3px solid var(--color-primary)">
        <div class="kpi-value">${params.nPanels ?? '—'}</div>
        <div class="kpi-label">Panneaux installés<br><span class="kpi-unit">${params.nPanels ? `${params.panelWp} Wc × ${params.nPanels}` : '—'}</span></div>
      </div>
      <div class="kpi-card" style="border-left:3px solid var(--color-accent)">
        <div class="kpi-value accent">${params.Ppeak.toFixed(2)}</div>
        <div class="kpi-label">Puissance crête<br><span class="kpi-unit">kWc</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${results.E_annual.toLocaleString('fr')}</div>
        <div class="kpi-label">Production annuelle<br><span class="kpi-unit">kWh/an</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value accent">${results.specificYield.toLocaleString('fr')}</div>
        <div class="kpi-label">Rendement spécifique<br><span class="kpi-unit">kWh/kWc/an</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value info">${results.PR}</div>
        <div class="kpi-label">Performance Ratio<br><span class="kpi-unit">—</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${results.CF} %</div>
        <div class="kpi-label">Facteur de capacité<br><span class="kpi-unit">%</span></div>
      </div>
      ${results.ROI > 0 ? `<div class="kpi-card">
        <div class="kpi-value accent">${results.ROI}</div>
        <div class="kpi-label">Retour invest.<br><span class="kpi-unit">années</span></div>
      </div>` : ''}
      <div class="kpi-card">
        <div class="kpi-value" style="color:var(--color-success)">${results.CO2.toLocaleString('fr')}</div>
        <div class="kpi-label">CO₂ évité<br><span class="kpi-unit">kg/an</span></div>
      </div>
    </div>`;

  const chartId  = 'chart-grid-' + Date.now();
  const chartId2 = 'chart-grid2-' + Date.now();
  const tableHtml = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Mois</th>
          <th>Irr. inclinée<br>kWh/m²</th>
          <th>Prod. PV<br>kWh</th>
          <th>T° moy.<br>°C</th>
        </tr>
      </thead>
      <tbody>
        ${results.monthly.map(m => `
          <tr>
            <td>${m.name}</td>
            <td>${m.Htilt}</td>
            <td>${m.E_month}</td>
            <td>${m.T_avg}</td>
          </tr>`).join('')}
        <tr><td>Total</td><td>${results.H_annual}</td><td>${results.E_annual.toLocaleString('fr')}</td><td>—</td></tr>
      </tbody>
    </table>`;

  el.innerHTML = `
    ${kpiHtml}
    <div class="card">
      <div class="section-header">
        <div class="card-title">Production mensuelle</div>
        <div class="btn-group">
          <button class="btn btn-outline btn-sm" onclick="Exporter.exportGridCSV(AppState.lastGridResult, AppState.lastGridParams)">CSV</button>
          <button class="btn btn-outline btn-sm" onclick="Exporter.exportGridJSON(AppState.lastGridResult, AppState.lastGridParams)">JSON</button>
          <button class="btn btn-outline btn-sm" onclick="Exporter.exportPDF()">PDF</button>
        </div>
      </div>
      <div class="chart-container"><canvas id="${chartId}"></canvas></div>
      <div style="margin-top:16px"><div class="chart-container-sm"><canvas id="${chartId2}"></canvas></div></div>
      <hr>
      ${tableHtml}
    </div>`;

  setTimeout(() => {
    Charts.renderMonthlyProduction(chartId, results);
    Charts.renderIrradiationTemp(chartId2, results);
  }, 50);
}

// ══════════════════════════════════════════════════════════════
//  HORS RÉSEAU (ancien module simple)
// ══════════════════════════════════════════════════════════════
function calcOffgrid() {
  if (!AppState.weatherData) return;
  const params = {
    lat:              AppState.location.lat,
    weatherData:      AppState.weatherData,
    Ppeak:            parseFloat(document.getElementById('og-ppeak')?.value) || 300,
    battCap:          parseFloat(document.getElementById('og-batt')?.value) || 2400,
    dod:              parseFloat(document.getElementById('og-dod')?.value) || 80,
    dailyConsumption: parseFloat(document.getElementById('og-consumption')?.value) || 1000,
    tilt:             parseFloat(document.getElementById('og-tilt')?.value) || 30,
    azimuth:          0
  };
  const results = SolarMath.offgridSystem(params);
  AppState.lastOffgridResult = results;
  renderOffgridResults(results);
}

function renderOffgridResults(monthly) {
  const el = document.getElementById('offgrid-results');
  if (!el) return;
  const chartId = 'chart-offgrid-' + Date.now();
  const tableRows = monthly.map(m => {
    const cls = m.coverageRatio >= 80 ? '' : m.coverageRatio >= 50 ? 'medium' : 'low';
    return `
      <tr>
        <td>${m.name}</td>
        <td>${m.solarDaily}</td>
        <td>
          <div class="coverage-bar">
            <div class="coverage-fill ${cls}" style="width:${m.coverageRatio}%"></div>
            <span style="font-size:11px;min-width:30px">${m.coverageRatio}%</span>
          </div>
        </td>
        <td>${m.autonomyDays}</td>
        <td>${m.deficit > 0 ? m.deficit : '✓'}</td>
      </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="card">
      <div class="section-header">
        <div class="card-title">Couverture solaire mensuelle</div>
        <button class="btn btn-outline btn-sm" onclick="Exporter.exportOffgridCSV(AppState.lastOffgridResult)">CSV</button>
      </div>
      <div class="chart-container"><canvas id="${chartId}"></canvas></div>
      <hr>
      <table class="data-table" style="margin-top:10px">
        <thead>
          <tr><th>Mois</th><th>Prod.<br>kWh/j</th><th>Couverture</th><th>Autonomie<br>jours</th><th>Déficit<br>kWh</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;

  setTimeout(() => Charts.renderOffgridCoverage(chartId, monthly), 50);
}

// ══════════════════════════════════════════════════════════════
//  DONNÉES IRRADIATION MENSUELLE
// ══════════════════════════════════════════════════════════════
function renderIrradiationData() {
  if (!AppState.weatherData) return;
  const el = document.getElementById('irradiation-results');
  const chartId = 'chart-irr-' + Date.now();

  el.innerHTML = `
    <div class="card">
      <div class="section-header">
        <div class="card-title">Irradiation mensuelle — ${AppState.location.name}</div>
        <button class="btn btn-outline btn-sm" onclick="Exporter.exportIrradiationCSV(AppState.weatherData)">CSV</button>
      </div>
      <div class="chart-container"><canvas id="${chartId}"></canvas></div>
      <hr style="margin:14px 0">
      <table class="data-table">
        <thead>
          <tr>
            <th>Mois</th><th>GHI<br>kWh/m²</th><th>DHI<br>kWh/m²</th>
            <th>DNI<br>kWh/m²</th><th>T° moy<br>°C</th>
          </tr>
        </thead>
        <tbody>
          ${AppState.weatherData.map(m => `
            <tr>
              <td>${m.name}</td><td>${m.GHI}</td><td>${m.DHI}</td>
              <td>${m.DNI}</td><td>${m.T_avg}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  setTimeout(() => Charts.renderIrradiationMonthly(chartId, AppState.weatherData), 50);
}

// ══════════════════════════════════════════════════════════════
//  OPTIMISATION ANGLE
// ══════════════════════════════════════════════════════════════
function calcOptimization() {
  if (!AppState.weatherData) return;
  const el = document.getElementById('optimizer-results');
  const heatmap = SolarMath.tiltAzimuthHeatmap(AppState.location.lat, AppState.weatherData);
  const optTilt = SolarMath.optimalTilt(AppState.location.lat, AppState.weatherData, false);
  const optBoth = SolarMath.optimalTilt(AppState.location.lat, AppState.weatherData, true);
  const chartId = 'hm-opt-' + Date.now();

  el.innerHTML = `
    <div class="card">
      <div class="kpi-grid" style="margin-bottom:14px">
        <div class="kpi-card">
          <div class="kpi-value">${optTilt.tilt}°</div>
          <div class="kpi-label">Inclinaison optimale<br><span class="kpi-unit">azimut 0° (plein Sud)</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value accent">${optBoth.tilt}° / ${optBoth.azimuth > 0 ? '+' : ''}${optBoth.azimuth}°</div>
          <div class="kpi-label">Optimal tilt + azimut<br><span class="kpi-unit">inclinaison / orientation</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value accent">${Math.round(AppState.location.lat * 0.85)}°</div>
          <div class="kpi-label">Règle empirique<br><span class="kpi-unit">lat × 0.85</span></div>
        </div>
      </div>
      <div class="card-title">Carte de chaleur (inclinaison × azimut)</div>
      <div class="heatmap-container" id="${chartId}"></div>
    </div>`;

  setTimeout(() => renderHeatmap(chartId, heatmap), 50);
}

function renderHeatmap(containerId, heatmap) {
  const tilts    = [...new Set(heatmap.map(h => h.tilt))];
  const azimuths = [...new Set(heatmap.map(h => h.az))];
  const container = document.getElementById(containerId);

  const rows = tilts.map(tilt => {
    const cells = azimuths.map(az => {
      const d = heatmap.find(h => h.tilt === tilt && h.az === az);
      const pct = d ? d.pct : 0;
      const color = heatmapColor(pct);
      return `<td style="background:${color};color:${pct > 60 ? '#fff' : '#333'}">${pct}%</td>`;
    }).join('');
    return `<tr><th>${tilt}°</th>${cells}</tr>`;
  }).join('');

  container.innerHTML = `
    <table class="heatmap-table">
      <thead>
        <tr>
          <th>Incl. \\ Az.</th>
          ${azimuths.map(a => `<th>${a > 0 ? '+' : ''}${a}°</th>`).join('')}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:11px;color:var(--color-text-muted);margin-top:8px">
      100% = production maximale. Az. 0° = plein Sud. Valeurs relatives.
    </p>`;
}

function heatmapColor(pct) {
  if (pct >= 90) return `hsl(${120 - (100 - pct) * 1.2}, 65%, 42%)`;
  if (pct >= 70) return `hsl(${(pct - 70) * 3}, 70%, 48%)`;
  return `hsl(0, ${30 + pct * 0.5}%, ${75 - pct * 0.3}%)`;
}

// ══════════════════════════════════════════════════════════════
//  DIMENSIONNEMENT RÉSEAU (EDF)
// ══════════════════════════════════════════════════════════════
function calcSizing() {
  if (!AppState.weatherData) {
    alert('Veuillez sélectionner un lieu avec des données météo.');
    return;
  }
  const input = SizingEngine.readFormInput();
  const annualConso = input.bill.monthlyKwh.reduce((s, k) => s + k, 0);
  if (annualConso === 0) {
    const el = document.getElementById('sizing-results');
    el.innerHTML = `<div class="result-placeholder">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 11h-2v2H9v-2H7v-2h2V9h2v2h2v2z"/></svg>
      <p>Renseignez votre consommation mensuelle<br>puis cliquez sur <strong>Dimensionner</strong></p>
    </div>`;
    return;
  }
  const surface = input.site.maxSurfaceM2;
  if (!surface) {
    const el = document.getElementById('sizing-results');
    el.innerHTML = `<div class="result-placeholder">
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
    el.innerHTML = '<div class="alert alert-warning">Impossible de calculer — vérifiez les données.</div>';
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

  el.innerHTML = `
    <div class="card" style="border-left:4px solid var(--color-accent);margin-bottom:16px">
      <div class="card-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        Installation recommandée — ${AppState.location.name}
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
          <div class="kpi-label">Taux de couverture<br><span class="kpi-unit">production/conso</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${rec.selfSufficiencyRate} %</div>
          <div class="kpi-label">Autoconsommation<br><span class="kpi-unit">% produit consommé</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value accent">${rec.ROI}</div>
          <div class="kpi-label">Retour sur invest.<br><span class="kpi-unit">années</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${rec.systemCost.toLocaleString('fr')}</div>
          <div class="kpi-label">Coût système<br><span class="kpi-unit">€ HT</span></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-header">
        <div class="card-title">Analyse détaillée</div>
        <div class="btn-group">
          <button class="btn btn-outline btn-sm" onclick="Exporter.exportGridCSV(AppState.lastSizingResult, AppState.lastSizingInput)">CSV</button>
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

// ══════════════════════════════════════════════════════════════
//  DIMENSIONNEMENT HORS RÉSEAU
// ══════════════════════════════════════════════════════════════
function calcOffgridSizing() {
  if (!AppState.weatherData) { alert('Sélectionnez un lieu avec des données météo.'); return; }
  const input = OffgridSizing.readFormInput();
  const { recommended: rec, allCandidates, tech, annual_conso } =
    OffgridSizing.run(input, AppState.weatherData, AppState.location.lat);
  AppState.lastOffgridSizingResult = rec;
  renderOffgridSizingResults(rec, allCandidates, tech, annual_conso);
}

function renderOffgridSizingResults(rec, allCandidates, tech, annual_conso) {
  const el = document.getElementById('offgrid2-results');
  if (!rec) {
    el.innerHTML = '<div class="alert alert-warning">Aucune configuration trouvée — réduisez la cible ou augmentez la surface.</div>';
    return;
  }

  const c1 = 'chart-og1-' + Date.now();
  const c2 = 'chart-og2-' + Date.now();
  const hmId = 'hm-og-' + Date.now();

  const tableRows = rec.monthly.map(m => {
    const cls = m.deficit_days === 0 ? 'color:var(--color-success)' : m.deficit_days <= 3 ? 'color:var(--color-accent-dark)' : 'color:var(--color-danger)';
    return `<tr>
      <td>${m.name}</td>
      <td>${Math.round(m.e_prod_day * 1000)}</td>
      <td>${Math.round(m.e_conso_day * 1000)}</td>
      <td style="${cls};font-weight:700">${m.deficit_days > 0 ? m.deficit_days + ' j' : '✓'}</td>
      <td>${m.deficit_kwh > 0 ? m.deficit_kwh : '—'}</td>
      <td>${m.soc_end_pct}%</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="card" style="border-left:4px solid var(--color-accent);margin-bottom:16px">
      <div class="card-title">Système autonome recommandé — ${tech.label}</div>
      <div class="kpi-grid">
        <div class="kpi-card" style="border-left:3px solid var(--color-accent)">
          <div class="kpi-value accent">${rec.Ppeak}</div>
          <div class="kpi-label">Puissance PV<br><span class="kpi-unit">kWc</span></div>
        </div>
        <div class="kpi-card" style="border-left:3px solid var(--color-info)">
          <div class="kpi-value info">${rec.C_batt_gross}</div>
          <div class="kpi-label">Capacité batterie<br><span class="kpi-unit">kWh brut (${rec.C_usable} kWh utiles)</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${rec.nPanels}</div>
          <div class="kpi-label">Panneaux<br><span class="kpi-unit">unités</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value" style="color:var(--color-success)">${rec.coverageRate} %</div>
          <div class="kpi-label">Taux de couverture<br><span class="kpi-unit">% autonome</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value ${rec.deficit_days > 10 ? 'accent' : ''}" style="${rec.deficit_days === 0 ? 'color:var(--color-success)' : ''}">
            ${rec.deficit_days}
          </div>
          <div class="kpi-label">Jours déficit/an<br><span class="kpi-unit">(${rec.total_deficit} kWh manquants)</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value accent">${rec.systemCost.toLocaleString('fr')}</div>
          <div class="kpi-label">Coût total<br><span class="kpi-unit">€ HT</span></div>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="card">
        <div class="section-header">
          <div class="card-title">Production vs Consommation</div>
          <button class="btn btn-outline btn-sm" onclick="OffgridSizing.exportCSV(AppState.lastOffgridSizingResult)">CSV</button>
        </div>
        <div class="chart-container"><canvas id="${c1}"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Jours de déficit par mois</div>
        <div class="chart-container"><canvas id="${c2}"></canvas></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Matrice couverture — PV × Batterie</div>
      <div id="${hmId}"></div>
    </div>

    <div class="card">
      <div class="card-title">Détail mensuel</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Mois</th><th>Prod.<br>Wh/j</th><th>Conso<br>Wh/j</th>
            <th>Déficit<br>jours</th><th>Manquant<br>kWh</th><th>SOC fin<br>mois %</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;

  setTimeout(() => {
    Charts.renderOffgridBalance(c1, rec);
    Charts.renderOffgridDeficitDays(c2, rec);
    Charts.renderOffgridHeatmap(hmId, allCandidates, rec.Ppeak, rec.C_batt_gross);
  }, 50);
}

// ══════════════════════════════════════════════════════════════
//  BIND FONCTIONS AUXILIAIRES
// ══════════════════════════════════════════════════════════════
function bindOptimizeCheckboxes() {
  const chkTilt = document.getElementById('chk-optimize-tilt');
  const chkAz   = document.getElementById('chk-optimize-az');
  const inpTilt = document.getElementById('inp-tilt');
  const inpAz   = document.getElementById('inp-azimuth');

  function update() {
    inpTilt.disabled = chkTilt.checked;
    inpAz.disabled   = chkAz.checked || chkTilt.checked;
    if (chkTilt.checked && AppState.weatherData) {
      const opt = SolarMath.optimalTilt(AppState.location.lat, AppState.weatherData, chkAz.checked);
      inpTilt.value = opt.tilt;
      if (chkAz.checked) inpAz.value = opt.azimuth;
    }
  }
  chkTilt?.addEventListener('change', update);
  chkAz?.addEventListener('change', update);
}

function bindBatteryInfo() {
  const sel = document.getElementById('og2-batt-tech');
  if (!sel) return;
  function update() {
    const tech = OffgridSizing.BATTERY_TECH[sel.value];
    if (!tech) return;
    const el = document.getElementById('og2-batt-info');
    if (!el) return;
    const bmsStr = tech.bmsFixed > 0 ? ` · BMS ~${tech.bmsFixed} €` : '';
    el.textContent = `DoD ${tech.dod*100}% · η ${tech.eta*100}% · ${tech.cycles} cycles · ~${tech.costPerKwh} €/kWh${bmsStr}`;
  }
  sel.addEventListener('change', update);
  update();
}

function bindSizingLiveTotal() {
  const inputs = Array.from({length:12}, (_, i) => document.getElementById(`sz-kwh-${i+1}`));
  function updateTotal() {
    const total = inputs.reduce((s, el) => s + (parseFloat(el?.value) || 0), 0);
    const el = document.getElementById('sz-annual-total');
    if (el) el.textContent = `Total annuel : ${total.toLocaleString('fr')} kWh/an`;
  }
  inputs.forEach(el => el?.addEventListener('input', updateTotal));
  updateTotal();
}

function bindOffgridLiveTotal() {
  const defInput = document.getElementById('og2-daily-default');
  const monthInputs = Array.from({length:12}, (_, i) => document.getElementById(`og2-day-${i+1}`));
  function update() {
    const def = parseFloat(defInput?.value) || 1000;
    const total = monthInputs.reduce((s, el, i) => {
      const v = parseFloat(el?.value) || 0;
      return s + (v > 0 ? v : def) * DAYS[i];
    }, 0) / 1000;
    const el = document.getElementById('og2-annual-total');
    if (el) el.textContent = `Total annuel : ${Math.round(total).toLocaleString('fr')} kWh/an`;
  }
  defInput?.addEventListener('input', update);
  monthInputs.forEach(el => el?.addEventListener('input', update));
  update();
}

function optimizeTiltFor(prefix, withAz = false) {
  if (!AppState.weatherData) {
    alert('Sélectionnez d\'abord un lieu avec des données météo.');
    return;
  }
  const opt = SolarMath.optimalTilt(AppState.location.lat, AppState.weatherData, withAz);
  const tiltEl = document.getElementById(`${prefix}-tilt`);
  const azEl   = document.getElementById(`${prefix}-azimuth`);
  if (tiltEl) tiltEl.value = opt.tilt;
  if (withAz && azEl) azEl.value = opt.azimuth;
}

function importEDFToOffgrid() {
  const input = AppState.lastSizingInput;
  const statusEl = document.getElementById('og2-edf-import-status');
  if (!input?.bill?.monthlyKwh) {
    if (statusEl) statusEl.textContent = '⚠ Aucune donnée EDF — lancez d\'abord le dimensionnement réseau.';
    return;
  }
  const kwh = input.bill.monthlyKwh;
  kwh.forEach((k, i) => {
    const el = document.getElementById(`og2-day-${i+1}`);
    if (el) el.value = Math.round(k * 1000 / DAYS[i]);
  });
  const avg = Math.round(kwh.reduce((s, k, i) => s + k * 1000 / DAYS[i], 0) / 12);
  const defEl = document.getElementById('og2-daily-default');
  if (defEl) defEl.value = avg;
  if (statusEl) statusEl.textContent = `✓ Consommation importée (${Math.round(kwh.reduce((s, k) => s + k, 0))} kWh/an)`;
  document.getElementById('og2-day-1')?.dispatchEvent(new Event('input'));
}

// ══════════════════════════════════════════════════════════════
//  MODAL ENEDIS
// ══════════════════════════════════════════════════════════════
function openEnedisModal() {
  document.getElementById('enedis-modal').style.display = 'block';
}
function closeEnedisModal() {
  document.getElementById('enedis-modal').style.display = 'none';
}

function handleEnedisCSV(input) {
  const file = input.files[0];
  const statusEl = document.getElementById('sz-csv-status');
  if (!file) return;

  statusEl.style.display = 'block';
  statusEl.style.color = 'var(--color-text-muted)';
  statusEl.textContent = '⏳ Lecture du fichier…';

  EnedisImport.handleFile(file, result => {
    input.value = '';
    if (result.error) {
      statusEl.style.color = 'var(--color-danger)';
      statusEl.textContent = '✗ ' + result.error;
      return;
    }
    // ── Onglet dimensionnement ──────────────────────────────────
    result.monthlyKwh.forEach((kwh, i) => {
      const el = document.getElementById(`sz-kwh-${i + 1}`);
      if (el) el.value = kwh;
    });
    if (result.monthlyKwhHp) {
      const tariffEl = document.getElementById('sz-tariff');
      if (tariffEl) tariffEl.value = 'hphc';
    }

    // ── Onglet hors-réseau : conso journalière (Wh/j) ──────────
    result.monthlyKwh.forEach((kwh, i) => {
      const whPerDay = Math.round(kwh * 1000 / DAYS_IN_MONTH[i]);
      const el = document.getElementById(`og2-day-${i + 1}`);
      if (el) el.value = whPerDay;
    });
    const avgWhPerDay = Math.round(result.monthlyKwh.reduce((s, k, i) => s + k * 1000 / DAYS_IN_MONTH[i], 0) / 12);
    const defEl = document.getElementById('og2-daily-default');
    if (defEl) defEl.value = avgWhPerDay;
    document.getElementById('og2-day-1')?.dispatchEvent(new Event('input'));

    // ── Données 30min → module horaire ─────────────────────────
    if (result.halfHourlyData) {
      AppState.hourlyEnedisData = result.halfHourlyData;
      if (typeof HourlyModule !== 'undefined') {
        HourlyModule.setData(result.halfHourlyData);
        document.getElementById('hourly-data-status') &&
          (document.getElementById('hourly-data-status').textContent =
            '✓ Données 30min disponibles pour l\'analyse horaire');
      }
    }

    // ── Stocker kWh mensuels dans AppState ──────────────────────
    AppState.monthlyKwh = result.monthlyKwh.slice();

    document.getElementById('sz-kwh-1')?.dispatchEvent(new Event('input'));
    const warns = result.warnings.length ? ` — ⚠ ${result.warnings[0]}` : '';
    statusEl.style.color = 'var(--color-success)';
    statusEl.textContent =
      `✓ ${result.format} ${result.year} importé — ${result.totalAnnual.toLocaleString('fr')} kWh/an${warns}`;
  });
}

// ══════════════════════════════════════════════════════════════
//  MODULE DEVIS
// ══════════════════════════════════════════════════════════════
function updateQuoteLine(key) {
  const qty   = parseFloat(document.getElementById(`dv-line-${key}-qty`)?.value)   || 0;
  const price = parseFloat(document.getElementById(`dv-line-${key}-price`)?.value) || 0;
  const total = qty * price;
  const el = document.getElementById(`dv-line-${key}-total`);
  if (el) el.textContent = total > 0 ? total.toLocaleString('fr', {minimumFractionDigits:0, maximumFractionDigits:0}) + ' €' : '—';
  updateQuoteTotals();
}

function updateQuoteTotals() {
  const lineIds = ['panels','inverter','fixations','cabling','labor','admin','misc'];
  const subtotalHT = lineIds.reduce((s, k) => {
    const qty   = parseFloat(document.getElementById(`dv-line-${k}-qty`)?.value)   || 0;
    const price = parseFloat(document.getElementById(`dv-line-${k}-price`)?.value) || 0;
    return s + qty * price;
  }, 0);

  const tvaRate   = parseFloat(document.getElementById('dv-tva')?.value)    || 10;
  const remisePct = parseFloat(document.getElementById('dv-remise')?.value) || 0;
  const remise    = subtotalHT * remisePct / 100;
  const baseHT    = subtotalHT - remise;
  const tva       = baseHT * tvaRate / 100;
  const totalTTC  = baseHT + tva;

  const fmt   = n => n.toLocaleString('fr', {minimumFractionDigits:0, maximumFractionDigits:0}) + ' €';
  const setEl = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

  setEl('dv-total-ht',   fmt(subtotalHT));
  setEl('dv-base-ht',    fmt(baseHT));
  setEl('dv-total-tva',  fmt(tva));
  setEl('dv-total-ttc',  fmt(totalTTC));
  setEl('dv-tva-pct',    tvaRate);

  const remRow = document.getElementById('dv-remise-row');
  if (remRow) remRow.style.display = remisePct > 0 ? '' : 'none';
  setEl('dv-remise-pct',   remisePct);
  setEl('dv-total-remise', '− ' + fmt(remise));
}

function importSizingToQuote() {
  const rec = AppState.lastSizingResult;
  const inp = AppState.lastSizingInput;
  if (!rec && !inp) { showToast('⚠ Lancez d\'abord un dimensionnement.', 'error'); return; }
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };

  if (rec?.Ppeak)       setVal('dv-sys-ppeak',   rec.Ppeak);
  if (rec?.Ppeak && inp?.site?.panelWattPeak)
    setVal('dv-sys-panels', Math.ceil(rec.Ppeak * 1000 / inp.site.panelWattPeak));
  if (rec?.annualProd)  setVal('dv-sys-prod',    Math.round(rec.annualProd));
  if (rec?.co2Saved)    setVal('dv-sys-co2',     Math.round(rec.co2Saved));

  setVal('dv-site-address', AppState.location.name || '');
  if (inp?.tilt)              setVal('dv-site-tilt',    inp.tilt);
  if (inp?.azimuth !== undefined) setVal('dv-site-azimuth', inp.azimuth);
  if (inp?.surface)           setVal('dv-site-surface', inp.surface);

  const dateEl = document.getElementById('dv-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toLocaleDateString('fr-FR');

  showToast('✓ Données importées depuis le dimensionnement');
}

function previewQuote() {
  if (typeof QuoteGen === 'undefined') { showToast('Erreur : QuoteGen non chargé', 'error'); return; }
  QuoteGen.preview();
}
function printQuote() {
  if (typeof QuoteGen === 'undefined') { showToast('Erreur : QuoteGen non chargé', 'error'); return; }
  QuoteGen.print();
}
function saveInstallerData() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const data = {
    company: v('dv-ins-company'), siret: v('dv-ins-siret'),
    address: v('dv-ins-address'), phone:  v('dv-ins-phone'),
    email:   v('dv-ins-email'),   rge:    v('dv-ins-rge')
  };
  if (typeof QuoteGen !== 'undefined') QuoteGen.saveInstaller(data);
  showToast('✓ Informations installateur mémorisées');
}
function loadInstallerData() {
  if (typeof QuoteGen === 'undefined') return;
  const data   = QuoteGen.loadInstaller();
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
  setVal('dv-ins-company', data.company);
  setVal('dv-ins-siret',   data.siret);
  setVal('dv-ins-address', data.address);
  setVal('dv-ins-phone',   data.phone);
  setVal('dv-ins-email',   data.email);
  setVal('dv-ins-rge',     data.rge);
}
function initQuoteTab() {
  loadInstallerData();
  const dateEl = document.getElementById('dv-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toLocaleDateString('fr-FR');
  updateQuoteTotals();
  document.getElementById('dv-tva')?.addEventListener('change', updateQuoteTotals);
  document.getElementById('dv-remise')?.addEventListener('input', updateQuoteTotals);
}

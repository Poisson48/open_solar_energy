/**
 * renderers/grid.js - Onglets Système PV réseau, Hors réseau simple,
 *                     Données irradiation, Optimisation
 * Dépend de : app_state.js, charts/, solar_math.js, export.js
 */

// ── Mode automatique panneaux (Surface / Conso / Fixe) ─────────
const _panelMode = {}; // { grid: 'surface', og2: 'surface', dv: 'fixe' }

function setPanelMode(prefix, mode) {
  _panelMode[prefix] = mode;
  ['surface', 'conso', 'fixe'].forEach(m => {
    const btn = document.getElementById(`${prefix}-pmode-${m}`);
    if (btn) btn.classList.toggle('active', m === mode);
  });
  const fixeWrap = document.getElementById(`${prefix}-npanels-fixe-wrap`);
  if (fixeWrap) fixeWrap.style.display = mode === 'fixe' ? '' : 'none';
  const dvPanel = document.getElementById('dv-sys-panels');
  if (prefix === 'dv' && dvPanel) dvPanel.readOnly = (mode !== 'fixe');
  const modeInput = document.getElementById(`${prefix}-panel-mode`);
  if (modeInput) modeInput.value = mode;
  calcPanelsForMode(prefix);
}

function calcPanelsForMode(prefix) {
  const mode   = _panelMode[prefix] || (prefix === 'dv' ? 'fixe' : 'surface');
  const wpId   = prefix === 'grid' ? 'inp-panel-wp' : `${prefix}-panel-wp`;
  const m2Id   = prefix === 'grid' ? 'inp-panel-m2' : `${prefix}-panel-m2`;
  const panelWp = parseFloat(document.getElementById(wpId)?.value) || 400;
  const panelM2 = parseFloat(document.getElementById(m2Id)?.value) || 1.96;

  let nPanels = 0;
  if (mode === 'surface') {
    const surfId  = prefix === 'grid' ? 'inp-surface' : (prefix === 'og2' ? 'og2-surface' : 'dv-site-surface');
    const surface = parseFloat(document.getElementById(surfId)?.value) || 0;
    nPanels = Math.floor(surface / panelM2);
  } else if (mode === 'conso') {
    if (prefix === 'dv' && AppState.lastSizingResult?.Ppeak) {
      nPanels = Math.ceil(AppState.lastSizingResult.Ppeak * 1000 / panelWp);
    } else {
      const annualKwh       = _getPanelConsoKwh(prefix);
      const yieldKwhPerKwp  = _estimateSpecificYield();
      if (annualKwh > 0 && yieldKwhPerKwp > 0) {
        nPanels = Math.ceil((annualKwh / yieldKwhPerKwp) * 1000 / panelWp);
      }
    }
  } else {
    nPanels = parseInt(document.getElementById(`${prefix}-npanels-fixe`)?.value) || 0;
  }

  const Ppeak = (nPanels * panelWp) / 1000;

  if (prefix === 'grid') {
    const nEl   = document.getElementById('grid-npanels');
    const pEl   = document.getElementById('grid-ppeak-display');
    const hidden = document.getElementById('inp-ppeak');
    if (nEl)    nEl.textContent  = nPanels > 0 ? `${nPanels} panneaux` : '-';
    if (pEl)    pEl.textContent  = Ppeak   > 0 ? `${Ppeak.toFixed(2)} kWc` : '-';
    if (hidden) hidden.value     = Ppeak   > 0 ? Ppeak : 3;
  } else if (prefix === 'og2') {
    const el = document.getElementById('og2-npanels-display');
    if (el) {
      el.textContent = mode === 'conso'
        ? 'Auto (dimensionnement libre)'
        : nPanels > 0 ? `${nPanels} panneaux · ${Ppeak.toFixed(2)} kWc` : '-';
    }
  } else if (prefix === 'dv') {
    if (mode !== 'fixe') {
      const panelsEl = document.getElementById('dv-sys-panels');
      const ppeakEl  = document.getElementById('dv-sys-ppeak');
      if (panelsEl && nPanels > 0) panelsEl.value = nPanels;
      if (ppeakEl  && Ppeak   > 0) ppeakEl.value  = Ppeak.toFixed(1);
    }
  }
}

function _getPanelConsoKwh(prefix) {
  if (prefix === 'og2') {
    const def = parseFloat(document.getElementById('og2-daily-default')?.value) || 1000;
    return DAYS_IN_MONTH.reduce((sum, days, i) => {
      const v = parseFloat(document.getElementById(`og2-day-${i + 1}`)?.value) || 0;
      return sum + (v > 0 ? v : def) * days / 1000;
    }, 0);
  }
  let total = 0;
  for (let i = 1; i <= 12; i++) total += parseFloat(document.getElementById(`sz-kwh-${i}`)?.value) || 0;
  return total;
}

function _estimateSpecificYield() {
  if (AppState.weatherData && typeof SolarMath?.tiltedIrradiation === 'function') {
    const lat     = AppState.location?.lat ?? 44;
    const tilt    = parseFloat(document.getElementById('inp-tilt')?.value)    || 30;
    const azimuth = parseFloat(document.getElementById('inp-azimuth')?.value) || 0;
    const losses  = parseFloat(document.getElementById('inp-losses')?.value)  || 14;
    const annualHtilt = AppState.weatherData.reduce((s, m, i) =>
      s + SolarMath.tiltedIrradiation(m.GHI, m.DHI, lat, tilt, azimuth, i + 1), 0);
    return annualHtilt * (1 - losses / 100) * 0.85; // PR thermique ≈ 0.85
  }
  return 1000; // kWh/kWc par défaut (moyenne France)
}

function calcGridPanels() {
  calcPanelsForMode('grid');
}

function calcGridSystem() {
  if (!AppState.weatherData) {
    showToast('Sélectionnez un lieu avec des données météo.', 'error');
    return;
  }

  calcGridPanels();

  const panelWp = parseFloat(document.getElementById('inp-panel-wp')?.value) || 400;
  const panelM2 = parseFloat(document.getElementById('inp-panel-m2')?.value) || 1.96;
  const Ppeak   = parseFloat(document.getElementById('inp-ppeak')?.value) || 0;
  if (!Ppeak) {
    document.getElementById('grid-results').innerHTML = `<div class="result-placeholder">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
      <p>Renseignez les paramètres de l'installation<br>puis cliquez sur <strong>Calculer</strong></p>
    </div>`;
    return;
  }
  const nPanels = Math.round(Ppeak * 1000 / panelWp);
  const surface = parseFloat(document.getElementById('inp-surface')?.value) || nPanels * panelM2;

  const params = {
    lat:        AppState.location.lat,
    weatherData: AppState.weatherData,
    Ppeak, nPanels, panelWp, surface, panelM2,
    losses:     parseFloat(document.getElementById('inp-losses').value) || 14,
    tilt:       parseFloat(document.getElementById('inp-tilt').value) || 30,
    azimuth:    parseFloat(document.getElementById('inp-azimuth').value) || 0,
    tech:       document.getElementById('sel-tech').value,
    systemCost: parseFloat(document.getElementById('inp-cost').value) || 0,
    kwhPrice:   parseFloat(document.getElementById('inp-kwh-price').value) || 0.2516,
    co2Factor:  parseFloat(document.getElementById('inp-co2').value) || 0.052
  };
  const results = SolarMath.gridSystemAnnual(params);
  AppState.lastGridResult = results;
  AppState.lastGridParams = params;
  renderGridResults(results, params);

  // Commit git après calcul réseau
  if (typeof gitAutoSave === 'function') {
    gitAutoSave(`Calcul réseau — ${params.Ppeak.toFixed(2)} kWc · ${results.E_annual.toLocaleString('fr')} kWh/an`);
  }
}

function renderGridResults(results, params) {
  const el = document.getElementById('grid-results');
  el.innerHTML = '';

  const kpiHtml = `
    <div class="kpi-grid">
      <div class="kpi-card" style="border-left:3px solid var(--color-primary)">
        <div class="kpi-value">${params.nPanels ?? '-'}</div>
        <div class="kpi-label">Panneaux installés<br><span class="kpi-unit">${params.nPanels ? `${params.panelWp} Wc × ${params.nPanels}` : '-'}</span></div>
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
        <div class="kpi-label">Performance Ratio<br><span class="kpi-unit">-</span></div>
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
        <tr><td>Total</td><td>${results.H_annual}</td><td>${results.E_annual.toLocaleString('fr')}</td><td>-</td></tr>
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

// ── Hors réseau simple ──────────────────────────────────────────
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
  const chartId   = 'chart-offgrid-' + Date.now();
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

// ── Données irradiation mensuelle ───────────────────────────────
function renderIrradiationData() {
  if (!AppState.weatherData) return;
  const el      = document.getElementById('irradiation-results');
  const chartId = 'chart-irr-' + Date.now();

  el.innerHTML = `
    <div class="card">
      <div class="section-header">
        <div class="card-title">Irradiation mensuelle - ${AppState.location.name}</div>
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

// ── Optimisation angle ──────────────────────────────────────────
function calcOptimization() {
  if (!AppState.weatherData) return;
  const el      = document.getElementById('optimizer-results');
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
      const d   = heatmap.find(h => h.tilt === tilt && h.az === az);
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

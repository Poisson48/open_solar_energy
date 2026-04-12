/**
 * main.js — Initialisation et coordination générale
 */

// ── Version ──────────────────────────────────────────────────
const APP_VERSION = '1.1.0';
// Historique :
//   1.0.0 — Base : carte, onglets, calcul PV réseau, dimensionnement EDF, hors réseau
//   1.1.0 — Lien EDF→offgrid, prix HT pro, batteries DIY VE (CATL/EVE, Leaf, Zoé, Tesla)

// ── État global ──────────────────────────────────────────────
const AppState = {
  location: { lat: 48.8566, lon: 2.3522, alt: 35, name: 'Paris, France' },
  weatherData: null,
  demoData: null,
  map: null,
  marker: null,
  activeTab: 'sizing',
  lastGridResult: null,
  lastOffgridResult: null,
  lastSizingResult: null,
  lastSizingInput: null
};

// ── Chargement données météo démo ────────────────────────────
async function loadDemoData() {
  try {
    const r = await fetch('./data/demo_weather.json');
    AppState.demoData = await r.json();
    setLocation('paris');
  } catch (e) {
    console.warn('Impossible de charger les données météo démo', e);
  }
}

// ── Initialisation carte Leaflet ─────────────────────────────
function initMap() {
  AppState.map = L.map('map', { zoomControl: true, attributionControl: false }).setView(
    [AppState.location.lat, AppState.location.lon], 6
  );

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(AppState.map);

  L.control.attribution({ prefix: '© OpenStreetMap' }).addTo(AppState.map);

  const icon = L.divIcon({
    html: `<div style="width:20px;height:20px;background:var(--color-accent);border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  AppState.marker = L.marker([AppState.location.lat, AppState.location.lon], { icon, draggable: true })
    .addTo(AppState.map);

  AppState.marker.on('dragend', e => {
    const { lat, lng } = e.target.getLatLng();
    setLocationCoords(lat, lng);
  });

  AppState.map.on('click', e => {
    setLocationCoords(e.latlng.lat, e.latlng.lng);
  });
}

// ── Définir localisation par preset ─────────────────────────
function setLocation(key) {
  if (!AppState.demoData) return;
  const loc = AppState.demoData.locations[key];
  if (!loc) return;
  AppState.location = { lat: loc.lat, lon: loc.lon, alt: loc.alt, name: loc.name };
  AppState.weatherData = loc.monthly;
  updateLocationUI();
  updateMapMarker();
  document.querySelectorAll('.preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.loc === key);
  });
}

// ── Définir localisation par coordonnées ────────────────────
function setLocationCoords(lat, lon) {
  AppState.location.lat = Math.round(lat * 10000) / 10000;
  AppState.location.lon = Math.round(lon * 10000) / 10000;

  // Chercher la ville la plus proche dans les données démo
  if (AppState.demoData) {
    let minDist = Infinity;
    let bestKey = 'paris';
    Object.entries(AppState.demoData.locations).forEach(([key, loc]) => {
      const d = Math.hypot(loc.lat - lat, loc.lon - lon);
      if (d < minDist) { minDist = d; bestKey = key; }
    });
    const loc = AppState.demoData.locations[bestKey];
    AppState.weatherData = loc.monthly;
    AppState.location.alt = loc.alt;
    AppState.location.name = `${loc.name} (approx.)`;

    document.querySelectorAll('.preset-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.loc === bestKey);
    });
  }
  updateLocationUI();
  updateMapMarker();
}

function updateMapMarker() {
  if (!AppState.map || !AppState.marker) return;
  AppState.marker.setLatLng([AppState.location.lat, AppState.location.lon]);
  AppState.map.setView([AppState.location.lat, AppState.location.lon], AppState.map.getZoom());
}

function updateLocationUI() {
  document.getElementById('inp-lat').value = AppState.location.lat.toFixed(4);
  document.getElementById('inp-lon').value = AppState.location.lon.toFixed(4);
  document.getElementById('inp-alt').value = AppState.location.alt;
  document.getElementById('loc-name').textContent = AppState.location.name;
  document.getElementById('coord-lat').textContent = AppState.location.lat.toFixed(4) + '°';
  document.getElementById('coord-lon').textContent = AppState.location.lon.toFixed(4) + '°';
  document.getElementById('coord-alt').textContent = AppState.location.alt + ' m';
}

// ── Gestion des onglets ──────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + tab).classList.add('active');
      AppState.activeTab = tab;
    });
  });
}

// ── Bind coordonnées manuelles ───────────────────────────────
function initLocationInputs() {
  document.getElementById('btn-go-coords').addEventListener('click', () => {
    const lat = parseFloat(document.getElementById('inp-lat').value);
    const lon = parseFloat(document.getElementById('inp-lon').value);
    if (isNaN(lat) || isNaN(lon)) return;
    setLocationCoords(lat, lon);
  });

  document.getElementById('inp-address').addEventListener('keydown', e => {
    if (e.key === 'Enter') geocodeAddress();
  });

  document.getElementById('btn-geocode').addEventListener('click', geocodeAddress);

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => setLocation(btn.dataset.loc));
  });
}

// ── Géocodage Nominatim ──────────────────────────────────────
async function geocodeAddress() {
  const address = document.getElementById('inp-address').value.trim();
  if (!address) return;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
    const data = await r.json();
    if (data.length > 0) {
      const { lat, lon, display_name } = data[0];
      AppState.location.name = display_name.split(',').slice(0, 2).join(',');
      setLocationCoords(parseFloat(lat), parseFloat(lon));
      AppState.map.setView([lat, lon], 10);
    }
  } catch (e) {
    console.warn('Géocodage échoué', e);
  }
}

// ── Gestion optimisation angle ───────────────────────────────
function bindOptimizeCheckboxes() {
  const chkTilt = document.getElementById('chk-optimize-tilt');
  const chkAz = document.getElementById('chk-optimize-az');
  const inpTilt = document.getElementById('inp-tilt');
  const inpAz = document.getElementById('inp-azimuth');

  function update() {
    inpTilt.disabled = chkTilt.checked;
    inpAz.disabled = chkAz.checked || chkTilt.checked;
    if (chkTilt.checked && AppState.weatherData) {
      const opt = SolarMath.optimalTilt(AppState.location.lat, AppState.weatherData);
      inpTilt.value = opt;
    }
  }
  chkTilt.addEventListener('change', update);
  chkAz.addEventListener('change', update);
}

// ── Calcul système PV réseau ─────────────────────────────────
function calcGridSystem() {
  if (!AppState.weatherData) {
    alert('Veuillez sélectionner un lieu avec des données météo.');
    return;
  }

  const params = {
    lat: AppState.location.lat,
    weatherData: AppState.weatherData,
    Ppeak: parseFloat(document.getElementById('inp-ppeak').value) || 3,
    losses: parseFloat(document.getElementById('inp-losses').value) || 14,
    tilt: parseFloat(document.getElementById('inp-tilt').value) || 30,
    azimuth: parseFloat(document.getElementById('inp-azimuth').value) || 0,
    tech: document.getElementById('sel-tech').value,
    systemCost: parseFloat(document.getElementById('inp-cost').value) || 0,
    kwhPrice: parseFloat(document.getElementById('inp-kwh-price').value) || 0.13,
    co2Factor: parseFloat(document.getElementById('inp-co2').value) || 0.052
  };

  const results = SolarMath.gridSystemAnnual(params);
  AppState.lastGridResult = results;
  AppState.lastGridParams = params;
  renderGridResults(results, params);
}

function renderGridResults(results, params) {
  const el = document.getElementById('grid-results');
  el.innerHTML = '';

  // KPIs
  const kpiHtml = `
    <div class="kpi-grid">
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

  // Chart + table
  const chartId = 'chart-grid-' + Date.now();
  const chartId2 = 'chart-grid2-' + Date.now();
  const tableHtml = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Mois</th>
          <th data-tooltip="Irradiation sur plan incliné (kWh/m²)">Irr. inclinée<br>kWh/m²</th>
          <th data-tooltip="Production électrique estimée">Prod. PV<br>kWh</th>
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
          </tr>
        `).join('')}
        <tr>
          <td>Total</td>
          <td>${results.H_annual}</td>
          <td>${results.E_annual.toLocaleString('fr')}</td>
          <td>—</td>
        </tr>
      </tbody>
    </table>`;

  el.innerHTML = `
    ${kpiHtml}
    <div class="card">
      <div class="section-header">
        <div class="card-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 22V8h16v14H4zm2-2h12V10H6v10zm1-4h10v2H7v-2zm0-3h10v2H7v-2zM3 8V6h18v2H3zM8 6V4h8v2H8z"/></svg>
          Production mensuelle
        </div>
        <div class="btn-group">
          <button class="btn btn-outline btn-sm" onclick="Exporter.exportGridCSV(AppState.lastGridResult, AppState.lastGridParams)">CSV</button>
          <button class="btn btn-outline btn-sm" onclick="Exporter.exportGridJSON(AppState.lastGridResult, AppState.lastGridParams)">JSON</button>
          <button class="btn btn-outline btn-sm" onclick="Exporter.exportPDF()">PDF</button>
        </div>
      </div>
      <div class="chart-container"><canvas id="${chartId}"></canvas></div>
      <div style="margin-top:16px;"><div class="chart-container-sm"><canvas id="${chartId2}"></canvas></div></div>
      <hr>
      ${tableHtml}
    </div>`;

  // Rendre les graphiques après insertion dans le DOM
  setTimeout(() => {
    Charts.renderMonthlyProduction(chartId, results);
    Charts.renderIrradiationTemp(chartId2, results);
  }, 50);
}

// ── Calcul système hors réseau ───────────────────────────────
function calcOffgrid() {
  if (!AppState.weatherData) return;

  const params = {
    lat: AppState.location.lat,
    weatherData: AppState.weatherData,
    Ppeak: parseFloat(document.getElementById('og-ppeak').value) || 300,
    battCap: parseFloat(document.getElementById('og-batt').value) || 2400,
    dod: parseFloat(document.getElementById('og-dod').value) || 80,
    dailyConsumption: parseFloat(document.getElementById('og-consumption').value) || 1000,
    tilt: parseFloat(document.getElementById('og-tilt').value) || 30,
    azimuth: 0
  };

  const results = SolarMath.offgridSystem(params);
  AppState.lastOffgridResult = results;
  renderOffgridResults(results);
}

function renderOffgridResults(monthly) {
  const el = document.getElementById('offgrid-results');
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
          <tr>
            <th>Mois</th>
            <th>Prod. solaire<br>kWh/j</th>
            <th>Couverture</th>
            <th>Autonomie<br>jours</th>
            <th>Déficit<br>kWh</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;

  setTimeout(() => Charts.renderOffgridCoverage(chartId, monthly), 50);
}

// ── Données irradiation mensuelle ────────────────────────────
function renderIrradiationData() {
  if (!AppState.weatherData) return;
  const el = document.getElementById('irradiation-results');
  const chartId = 'chart-irr-' + Date.now();

  el.innerHTML = `
    <div class="card">
      <div class="section-header">
        <div class="card-title">Données d'irradiation mensuelle — ${AppState.location.name}</div>
        <button class="btn btn-outline btn-sm" onclick="Exporter.exportIrradiationCSV(AppState.weatherData)">CSV</button>
      </div>
      <div class="chart-container"><canvas id="${chartId}"></canvas></div>
      <hr style="margin:14px 0">
      <table class="data-table">
        <thead>
          <tr>
            <th>Mois</th>
            <th>GHI<br>kWh/m²</th>
            <th>DHI<br>kWh/m²</th>
            <th>DNI<br>kWh/m²</th>
            <th>T° moy<br>°C</th>
          </tr>
        </thead>
        <tbody>
          ${AppState.weatherData.map(m => `
            <tr>
              <td>${m.name}</td>
              <td>${m.GHI}</td>
              <td>${m.DHI}</td>
              <td>${m.DNI}</td>
              <td>${m.T_avg}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;

  setTimeout(() => Charts.renderIrradiationMonthly(chartId, AppState.weatherData), 50);
}

// ── Optimisation inclinaison ─────────────────────────────────
function calcOptimization() {
  if (!AppState.weatherData) return;
  const el = document.getElementById('optimizer-results');
  const heatmap = SolarMath.tiltAzimuthHeatmap(AppState.location.lat, AppState.weatherData);
  const optTilt = SolarMath.optimalTilt(AppState.location.lat, AppState.weatherData);
  const chartId = 'chart-opt-' + Date.now();

  el.innerHTML = `
    <div class="card">
      <div class="kpi-grid" style="margin-bottom:14px">
        <div class="kpi-card">
          <div class="kpi-value">${optTilt}°</div>
          <div class="kpi-label">Inclinaison optimale<br><span class="kpi-unit">azimut 0° (Sud)</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value accent">${Math.round(AppState.location.lat * 0.85)}°</div>
          <div class="kpi-label">Règle empirique<br><span class="kpi-unit">lat × 0.85</span></div>
        </div>
      </div>
      <div class="card-title">Carte de chaleur production (inclinaison × azimut)</div>
      <div class="heatmap-container" id="${chartId}"></div>
    </div>`;

  setTimeout(() => renderHeatmap(chartId, heatmap), 50);
}

function renderHeatmap(containerId, heatmap) {
  const tilts = [...new Set(heatmap.map(h => h.tilt))];
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
  // Gradient rouge → orange → vert
  if (pct >= 90) return `hsl(${120 - (100 - pct) * 1.2}, 65%, 42%)`;
  if (pct >= 70) return `hsl(${(pct - 70) * 3}, 70%, 48%)`;
  return `hsl(0, ${30 + pct * 0.5}%, ${75 - pct * 0.3}%)`;
}

// ── Dimensionnement hors réseau ──────────────────────────────
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
  if (!rec) { el.innerHTML = '<div class="alert alert-warning">Aucune configuration trouvée — réduisez la cible de couverture ou augmentez la surface disponible.</div>'; return; }

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
    <!-- Recommandation -->
    <div class="card" style="border-left:4px solid var(--color-accent);margin-bottom:16px">
      <div class="card-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>
        Système autonome recommandé — ${tech.label}
      </div>
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
          <div class="kpi-label">Taux de couverture<br><span class="kpi-unit">énergie autonome</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value ${rec.deficit_days > 10 ? 'accent' : ''}" style="${rec.deficit_days === 0 ? 'color:var(--color-success)' : ''}">
            ${rec.deficit_days}
          </div>
          <div class="kpi-label">Jours de déficit/an<br><span class="kpi-unit">(${rec.total_deficit} kWh manquants)</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${annual_conso.toLocaleString('fr')}</div>
          <div class="kpi-label">Consommation annuelle<br><span class="kpi-unit">kWh/an</span></div>
        </div>
      </div>
      <div class="kpi-grid" style="margin-top:8px">
        <div class="kpi-card" style="border-left:3px solid var(--color-primary)">
          <div class="kpi-value">${rec.costPV.toLocaleString('fr')}</div>
          <div class="kpi-label">Coût PV + pose<br><span class="kpi-unit">€</span></div>
        </div>
        <div class="kpi-card" style="border-left:3px solid var(--color-info)">
          <div class="kpi-value">${rec.costBatt.toLocaleString('fr')}</div>
          <div class="kpi-label">Coût batterie (${tech.label.split('(')[0].trim()})<br><span class="kpi-unit">€</span></div>
        </div>
        <div class="kpi-card" style="border-left:3px solid var(--color-accent)">
          <div class="kpi-value accent">${rec.systemCost.toLocaleString('fr')}</div>
          <div class="kpi-label">Coût total système<br><span class="kpi-unit">€ HT pro (BOS inclus, +20% TVA)</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${rec.battLifeYears}</div>
          <div class="kpi-label">Durée de vie batterie<br><span class="kpi-unit">années (est.)</span></div>
        </div>
      </div>
    </div>

    <!-- Graphiques -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="card">
        <div class="section-header">
          <div class="card-title">Production vs Consommation journalière</div>
          <button class="btn btn-outline btn-sm" onclick="OffgridSizing.exportCSV(AppState.lastOffgridSizingResult)">CSV</button>
        </div>
        <div class="chart-container"><canvas id="${c1}"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Jours de déficit par mois</div>
        <div class="chart-container"><canvas id="${c2}"></canvas></div>
      </div>
    </div>

    <!-- Heatmap PV × Batterie -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Matrice couverture — PV × Batterie</div>
      <div id="${hmId}"></div>
    </div>

    <!-- Tableau mensuel -->
    <div class="card">
      <div class="card-title">Détail mensuel</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Mois</th>
            <th>Prod. moy.<br>Wh/j</th>
            <th>Conso<br>Wh/j</th>
            <th>Déficit<br>jours</th>
            <th>Énergie<br>manquante kWh</th>
            <th>SOC fin<br>mois %</th>
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

// ── Info batterie live ────────────────────────────────────────
function bindBatteryInfo() {
  const sel = document.getElementById('og2-batt-tech');
  if (!sel) return;
  function update() {
    const tech = OffgridSizing.BATTERY_TECH[sel.value];
    if (!tech) return;
    const el = document.getElementById('og2-batt-info');
    if (!el) return;
    const bmsStr = tech.bmsFixed > 0 ? ` · BMS ~${tech.bmsFixed} €` : '';
    el.textContent = `DoD ${tech.dod*100}% · η ${tech.eta*100}% · ${tech.cycles} cycles · ~${tech.costPerKwh} €/kWh${bmsStr} (prix HT pro)`;
  }
  sel.addEventListener('change', update);
  update();
}

function importEDFToOffgrid() {
  const input = AppState.lastSizingInput;
  const DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
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

// ── Mise à jour total annuel offgrid ─────────────────────────
function bindOffgridLiveTotal() {
  const defInput = document.getElementById('og2-daily-default');
  const monthInputs = Array.from({length:12}, (_, i) => document.getElementById(`og2-day-${i+1}`));
  const DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
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

// ── Dimensionnement réseau ────────────────────────────────────
function calcSizing() {
  if (!AppState.weatherData) {
    alert('Veuillez sélectionner un lieu avec des données météo.');
    return;
  }
  const input = SizingEngine.readFormInput();
  const { recommended, allCandidates, currentBill, annualConso } =
    SizingEngine.run(input, AppState.weatherData, AppState.location.lat);

  AppState.lastSizingResult = recommended;
  AppState.lastSizingInput  = input;
  renderSizingResults(recommended, allCandidates, currentBill, annualConso);
}

function renderSizingResults(rec, allCandidates, currentBill, annualConso) {
  const el = document.getElementById('sizing-results');
  if (!rec) { el.innerHTML = '<div class="alert alert-warning">Impossible de calculer — vérifiez les données.</div>'; return; }

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
    <!-- Recommandation principale -->
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
          <div class="kpi-label">Nombre de panneaux<br><span class="kpi-unit">${Math.round(rec.Ppeak*1000/rec.nPanels)} Wc/panneau</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${rec.surfaceNeeded}</div>
          <div class="kpi-label">Surface nécessaire<br><span class="kpi-unit">m²</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value accent">${rec.systemCost.toLocaleString('fr')}</div>
          <div class="kpi-label">Coût estimé<br><span class="kpi-unit">€ TTC</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value" style="color:var(--color-success)">${rec.coverageRate} %</div>
          <div class="kpi-label">Taux de couverture<br><span class="kpi-unit">facture couverte</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value info">${rec.selfSufficiencyRate} %</div>
          <div class="kpi-label">Taux autoconsommation<br><span class="kpi-unit">prod. utilisée sur place</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value" style="color:var(--color-success)">${rec.savedOnBill.toLocaleString('fr')}</div>
          <div class="kpi-label">Économies annuelles<br><span class="kpi-unit">€/an</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value accent">${rec.ROI}</div>
          <div class="kpi-label">Retour investissement<br><span class="kpi-unit">années</span></div>
        </div>
      </div>
      <div class="kpi-grid" style="margin-top:8px">
        <div class="kpi-card" style="background:#fff3e0;border-color:#ffcc02">
          <div class="kpi-value" style="color:#e65100">${currentBill.toLocaleString('fr')}</div>
          <div class="kpi-label">Facture actuelle<br><span class="kpi-unit">€/an</span></div>
        </div>
        <div class="kpi-card" style="background:#e8f5e9;border-color:#a5d6a7">
          <div class="kpi-value" style="color:var(--color-success)">${rec.newAnnualBill.toLocaleString('fr')}</div>
          <div class="kpi-label">Nouvelle facture estimée<br><span class="kpi-unit">€/an</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${rec.annualProd.toLocaleString('fr')}</div>
          <div class="kpi-label">Production annuelle<br><span class="kpi-unit">kWh/an</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${annualConso.toLocaleString('fr')}</div>
          <div class="kpi-label">Consommation annuelle<br><span class="kpi-unit">kWh/an</span></div>
        </div>
      </div>
    </div>

    <!-- Graphiques -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="card">
        <div class="section-header">
          <div class="card-title">Production vs Consommation</div>
          <button class="btn btn-outline btn-sm" onclick="SizingEngine.exportCSV(AppState.lastSizingResult)">CSV</button>
        </div>
        <div class="chart-container"><canvas id="${c1}"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Répartition de l'énergie</div>
        <div class="chart-container-sm" style="height:220px"><canvas id="${c4}"></canvas></div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="card">
        <div class="card-title">Flux mensuels (autoconso / déficit / surplus)</div>
        <div class="chart-container"><canvas id="${c2}"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Courbe ROI selon puissance installée</div>
        <div class="chart-container"><canvas id="${c3}"></canvas></div>
      </div>
    </div>

    <!-- Tableau mensuel -->
    <div class="card">
      <div class="card-title">Détail mensuel</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Mois</th>
            <th>Conso<br>kWh</th>
            <th>Prod. PV<br>kWh</th>
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

// ── Mise à jour total annuel en temps réel ────────────────────
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

// ── Point d'entrée ───────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Injecter la version dans le badge
  const badgeEl = document.querySelector('.badge');
  if (badgeEl) badgeEl.textContent = `v${APP_VERSION} — Open Source`;

  await loadDemoData();
  initMap();
  initTabs();
  initLocationInputs();
  bindOptimizeCheckboxes();
  bindSizingLiveTotal();
  bindBatteryInfo();
  bindOffgridLiveTotal();

  document.getElementById('btn-calc-sizing').addEventListener('click', calcSizing);
  document.getElementById('btn-calc-offgrid2').addEventListener('click', calcOffgridSizing);
  document.getElementById('btn-calc-grid').addEventListener('click', calcGridSystem);
  document.getElementById('btn-calc-irr').addEventListener('click', renderIrradiationData);
  document.getElementById('btn-calc-opt').addEventListener('click', calcOptimization);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === 'irradiation') renderIrradiationData();
    });
  });

  setTimeout(() => {
    renderIrradiationData();
    calcSizing();  // dimensionnement par défaut au démarrage
  }, 300);
});

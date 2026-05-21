/**
 * renderers/offgrid.js - Onglet Dimensionnement hors réseau
 * Dépend de : app_state.js, charts/, offgrid_sizing.js, solar_math.js
 */

function calcOffgridSizing() {
  if (!AppState.weatherData) { showToast('Sélectionnez un lieu avec des données météo.', 'error'); return; }
  const input      = OffgridSizing.readFormInput();
  const totalConso = input.conso.dailyWh.reduce((s, v) => s + v, 0);
  const hasEnedis  = !!(AppState.hourlyEnedisData?.halfHourly?.length);
  if (totalConso === 0 && !hasEnedis) {
    showToast('Renseignez la consommation journalière (Wh/j) ou importez un fichier Enedis.', 'error');
    return;
  }
  const { recommended: rec, allCandidates, tech, annual_conso, useHourly } =
    OffgridSizing.run(input, AppState.weatherData, AppState.location.lat);
  AppState.lastOffgridSizingResult    = rec;
  AppState.lastOffgridSizingCandidates = allCandidates;
  renderOffgridSizingResults(rec, allCandidates, tech, annual_conso, useHourly);

  // Commit git après dimensionnement hors-réseau
  if (typeof gitAutoSave === 'function' && rec) {
    gitAutoSave(`Calcul hors-réseau — ${rec.Ppeak} kWc · ${rec.C_batt_gross} kWh batterie`);
  }
}

function renderOffgridSizingResults(rec, allCandidates, tech, annual_conso, hourlyMode) {
  const el = document.getElementById('offgrid2-results');
  if (!rec) {
    el.innerHTML = '<div class="alert alert-warning">Aucune configuration trouvée - réduisez la cible ou augmentez la surface.</div>';
    return;
  }

  const c1    = 'chart-og1-' + Date.now();
  const c2    = 'chart-og2-' + Date.now();
  const hmId  = 'hm-og-' + Date.now();
  const hourlyBadge = hourlyMode
    ? `<span style="font-size:11px;background:#e8f5e9;color:var(--color-success);padding:2px 8px;border-radius:10px;margin-left:8px">Simulation heure/heure (données Enedis)</span>`
    : `<span style="font-size:11px;background:var(--color-bg);color:var(--color-text-muted);padding:2px 8px;border-radius:10px;margin-left:8px">Profil journalier moyen</span>`;

  const tableRows = rec.monthly.map(m => {
    const cls = m.deficit_days === 0 ? 'color:var(--color-success)' : m.deficit_days <= 3 ? 'color:var(--color-accent-dark)' : 'color:var(--color-danger)';
    return `<tr>
      <td>${m.name}</td>
      <td>${Math.round(m.e_prod_day * 1000)}</td>
      <td>${Math.round(m.e_conso_day * 1000)}</td>
      <td style="${cls};font-weight:700">${m.deficit_days > 0 ? m.deficit_days + ' j' : '✓'}</td>
      <td>${m.deficit_kwh > 0 ? m.deficit_kwh : '-'}</td>
      <td>${m.soc_end_pct}%</td>
    </tr>`;
  }).join('');

  const tilt    = parseFloat(document.getElementById('og2-tilt')?.value)    || 30;
  const azimuth = parseFloat(document.getElementById('og2-azimuth')?.value) || 0;
  const dodPct  = Math.round((tech.dod || 0.8) * 100);

  el.innerHTML = `
    <div class="card" style="border-left:4px solid var(--color-accent);margin-bottom:16px">
      <div class="section-header">
        <div class="card-title">Système autonome recommandé - ${tech.label}${hourlyBadge}</div>
        <button class="btn btn-accent btn-sm"
          onclick="applyOffgridToHourly(${rec.Ppeak}, ${rec.C_batt_gross}, ${dodPct}, ${tilt}, ${azimuth})"
          title="Reporter ces valeurs dans l'onglet Analyse horaire">
          ↗ Utiliser pour la simulation horaire
        </button>
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
      <div class="card-title">Matrice couverture - PV × Batterie</div>
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

function applyOffgridToHourly(Ppeak, battKwh, dodPct, tilt, azimuth) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('hourly-ppeak',   Ppeak);
  set('hourly-batt',    battKwh);
  set('hourly-dod',     dodPct);
  set('hourly-tilt',    tilt);
  set('hourly-azimuth', azimuth);
  if (typeof activateTab === 'function') activateTab('daily');
  showToast(`✓ ${Ppeak} kWc · ${battKwh} kWh (DoD ${dodPct}%) reportés dans l'analyse horaire`);
}

function autoCalcOffgridPanelWp() {
  if (!AppState.weatherData) {
    showToast('Sélectionnez d\'abord un lieu avec des données météo.', 'error');
    return;
  }
  const getVal = id => parseFloat(document.getElementById(id)?.value) || 0;

  const surface    = getVal('og2-surface');
  const panelM2    = getVal('og2-panel-m2')          || 1.96;
  const losses     = getVal('og2-losses')             || 14;
  const tilt       = getVal('og2-tilt')               || 30;
  const azimuth    = getVal('og2-azimuth')            || 0;
  const targetPct  = getVal('og2-target-coverage')    || 90;

  if (!surface) { showToast('Renseignez d\'abord la surface disponible.', 'error'); return; }

  const defaultDay  = getVal('og2-daily-default') || 1000;
  const dailyWh     = Array.from({length: 12}, (_, i) => {
    const v = getVal(`og2-day-${i + 1}`);
    return v > 0 ? v : defaultDay;
  });
  const annualConso = dailyWh.reduce((s, v, i) => s + v * DAYS_IN_MONTH[i], 0) / 1000;

  if (annualConso < 10) { showToast('Renseignez d\'abord la consommation.', 'error'); return; }

  const annualProdPerKwc = AppState.weatherData.reduce((sum, m, i) => {
    const Htilt = SolarMath.tiltedIrradiation(m.GHI, m.DHI, AppState.location.lat, tilt, azimuth, i + 1);
    return sum + SolarMath.pvProduction(Htilt, 1.0, losses, m.T_avg, AppState.install?.tech || 'crystSi', i + 1, AppState.location.lat);
  }, 0);

  if (annualProdPerKwc < 100) { showToast('Données météo insuffisantes.', 'error'); return; }

  const neededPpeak  = (annualConso * targetPct / 100) / annualProdPerKwc;
  const STANDARD_WP  = [300, 320, 350, 375, 400, 420, 450, 480, 500, 550, 600, 650, 700];
  const nPanelsMax   = Math.floor(surface / panelM2);
  if (nPanelsMax < 1) { showToast('Surface insuffisante pour un panneau.', 'error'); return; }

  let chosen = null;
  for (const wp of STANDARD_WP) {
    const nNeeded = Math.ceil(neededPpeak * 1000 / wp);
    if (nNeeded <= nPanelsMax) {
      chosen = { wp, nPanels: nNeeded, ppeak: +(nNeeded * wp / 1000).toFixed(2) };
      break;
    }
  }

  if (!chosen) {
    const wpMax = STANDARD_WP[STANDARD_WP.length - 1];
    const ppeak = +(nPanelsMax * wpMax / 1000).toFixed(2);
    chosen = { wp: wpMax, nPanels: nPanelsMax, ppeak };
    showToast(`⚠ Surface insuffisante pour ${neededPpeak.toFixed(1)} kWc - max possible : ${ppeak} kWc avec ${nPanelsMax}× ${wpMax} Wc`, 'error');
  } else {
    showToast(`✓ ${chosen.wp} Wc × ${chosen.nPanels} panneaux = ${chosen.ppeak} kWc pour ${targetPct}% de couverture annuelle`);
  }

  const wpEl = document.getElementById('og2-panel-wp');
  if (wpEl) wpEl.value = chosen.wp;
}

function importEDFToOffgrid() {
  const input    = AppState.lastSizingInput;
  const statusEl = document.getElementById('og2-edf-import-status');
  if (!input?.bill?.monthlyKwh) {
    if (statusEl) statusEl.textContent = '⚠ Aucune donnée EDF - lancez d\'abord le dimensionnement réseau.';
    return;
  }
  const kwh = input.bill.monthlyKwh;
  const daysArr = AppState.enedisYear ? getMonthlyDays(AppState.enedisYear) : DAYS_IN_MONTH;
  kwh.forEach((k, i) => {
    const el = document.getElementById(`og2-day-${i + 1}`);
    if (el) el.value = Math.round(k * 1000 / daysArr[i]);
  });
  const avg = Math.round(kwh.reduce((s, k, i) => s + k * 1000 / daysArr[i], 0) / 12);
  const defEl = document.getElementById('og2-daily-default');
  if (defEl) defEl.value = avg;
  if (statusEl) statusEl.textContent = `✓ Consommation importée (${Math.round(kwh.reduce((s, k) => s + k, 0))} kWh/an)`;
  document.getElementById('og2-day-1')?.dispatchEvent(new Event('input'));
}

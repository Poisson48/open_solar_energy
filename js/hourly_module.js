/**
 * hourly_module.js — Analyse horaire de la consommation et de la production PV
 *
 * Sources de données :
 *   1. Données Enedis 30min importées (si disponibles) → profil réel
 *   2. Profil synthétique basé sur les consommations mensuelles (fallback)
 *
 * Dépend de : app_state.js, solar_math.js, charts.js
 */

const HourlyModule = (() => {

  // Données brutes 30min (tableau de 17520 valeurs = 365j × 48 slots)
  let _rawData = null;    // Float32Array ou Array<number> en kWh par slot 30min
  let _rawYear = null;

  /** Stocker les données brutes Enedis 30min */
  function setData(data) {
    if (!data) return;
    _rawData = data.values;  // tableau de valeurs kWh
    _rawYear = data.year;
    _updateSourceStatus();
  }

  function _updateSourceStatus() {
    const el = document.getElementById('hourly-source-status');
    if (!el) return;
    if (_rawData) {
      el.style.background = '#e8f5e9';
      el.style.color = 'var(--color-success)';
      el.textContent = `✓ Données Enedis réelles — ${_rawYear || ''} (${_rawData.length} mesures 30min)`;
    } else {
      el.style.background = 'var(--color-bg)';
      el.style.color = 'var(--color-text-muted)';
      el.textContent = '⚠ Profil synthétique (pas de données Enedis 30min)';
    }
  }

  /**
   * Retourne un profil de consommation horaire (24 valeurs en kWh)
   * pour un mois donné (1–12).
   * Si données réelles disponibles : moyenne des jours du mois.
   * Sinon : profil synthétique basé sur les kWh mensuels.
   */
  function getHourlyConsumptionProfile(month) {
    if (_rawData && _rawData.length > 0) {
      return _buildRealProfile(month);
    }
    return _buildSyntheticProfile(month);
  }

  /** Construit le profil réel depuis les données 30min Enedis */
  function _buildRealProfile(month) {
    const DAYS = DAYS_IN_MONTH;
    // Calculer le jour de début du mois dans l'année
    let startDay = 0;
    for (let m = 0; m < month - 1; m++) startDay += DAYS[m];
    const endDay = startDay + DAYS[month - 1];

    // Profil 24h initialisé à 0
    const profile = new Array(24).fill(0);
    const counts  = new Array(24).fill(0);

    for (let day = startDay; day < endDay; day++) {
      for (let slot = 0; slot < 48; slot++) {
        const idx = day * 48 + slot;
        if (idx >= _rawData.length) break;
        const hour = Math.floor(slot / 2);
        profile[hour] += _rawData[idx] || 0;
        counts[hour]++;
      }
    }

    // Moyenne par heure
    return profile.map((v, h) => counts[h] > 0 ? v / counts[h] : 0);
  }

  /**
   * Profil synthétique basé sur les kWh mensuels saisis dans le formulaire
   * Répartition : résidentiel typique français
   *   - Matin : pic 7h-9h (petit-déjeuner, départ)
   *   - Midi : creux relatif
   *   - Soir : pic 18h-22h (retour, cuisine, TV)
   *   - Nuit : faible
   */
  function _buildSyntheticProfile(month) {
    // Lire la consommation mensuelle depuis le formulaire
    const monthKwh = parseFloat(document.getElementById(`sz-kwh-${month}`)?.value) || 200;
    const days = SolarMath.DAYS_IN_MONTH[month - 1];
    const dailyKwh = monthKwh / days;

    // Poids horaires relatifs (somme = 1)
    const weights = [
      0.020, 0.015, 0.012, 0.010, 0.012, 0.020,  // 0h-5h (nuit)
      0.030, 0.065, 0.075, 0.060, 0.040, 0.035,  // 6h-11h (matin)
      0.040, 0.038, 0.035, 0.035, 0.040, 0.055,  // 12h-17h (journée)
      0.080, 0.090, 0.085, 0.070, 0.055, 0.038   // 18h-23h (soir)
    ];
    // Normaliser (au cas où)
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => (w / sum) * dailyKwh);
  }

  /**
   * Calcule la production PV horaire (kWh) pour un mois donné
   * en utilisant SolarMath.hourlyIrradiance
   */
  function getHourlyPvProduction(month, Ppeak, tilt, azimuth, losses) {
    if (!AppState.weatherData || month < 1 || month > 12) return new Array(24).fill(0);
    const monthData = AppState.weatherData[month - 1];
    const lossF = 1 - (losses || 14) / 100;
    return Array.from({length: 24}, (_, h) => {
      const irr = SolarMath.hourlyIrradiance(AppState.location.lat, month, h, monthData, tilt, azimuth);
      return irr * Ppeak * lossF / 1000;  // kWh
    });
  }

  /**
   * Simulation batterie sur une journée typique
   * @returns {Array} 24 objets { hour, pv, conso, balance, soc, autoconso, surplus, grid }
   */
  function simulateDailyBattery(pvHours, consoHours, battKwh, dod, eta = 0.95) {
    const usable = battKwh * (dod / 100);
    let soc = usable * 0.5;  // SoC initial : 50%
    return pvHours.map((pv, h) => {
      const conso   = consoHours[h];
      const balance = pv - conso;
      let autoconso, surplus, grid;

      if (balance >= 0) {
        // Surplus → charger la batterie
        autoconso = conso;
        const charge = Math.min(balance * eta, usable - soc);
        soc += charge;
        surplus = balance - charge / eta;
        grid = 0;
      } else {
        // Déficit → décharger la batterie
        autoconso = pv;
        const discharge = Math.min(-balance / eta, soc);
        soc = Math.max(0, soc - discharge);
        const fromBatt = discharge * eta;
        grid = Math.max(0, -balance - fromBatt);
        autoconso += fromBatt;
      }

      return { hour: h, pv, conso, soc: Math.round(soc * 100) / 100, autoconso, surplus, grid };
    });
  }

  /**
   * Lance l'analyse complète et affiche les résultats dans l'onglet
   */
  function compute() {
    if (!AppState.weatherData) {
      showToast('⚠ Sélectionnez d\'abord un lieu avec des données météo.', 'error');
      return;
    }

    const month   = parseInt(document.getElementById('hourly-month')?.value)   || 6;
    const Ppeak   = parseFloat(document.getElementById('hourly-ppeak')?.value) || 3;
    const battKwh = parseFloat(document.getElementById('hourly-batt')?.value)  || 0;
    const dod     = parseFloat(document.getElementById('hourly-dod')?.value)   || 80;
    const tilt    = parseFloat(document.getElementById('hourly-tilt')?.value)  || 30;
    const azimuth = parseFloat(document.getElementById('hourly-azimuth')?.value) || 0;

    const consoH = getHourlyConsumptionProfile(month);
    const pvH    = getHourlyPvProduction(month, Ppeak, tilt, azimuth, 14);
    const sim    = battKwh > 0
      ? simulateDailyBattery(pvH, consoH, battKwh, dod)
      : pvH.map((pv, h) => {
          const conso = consoH[h];
          const autoconso = Math.min(pv, conso);
          return { hour: h, pv, conso, soc: 0, autoconso, surplus: Math.max(0, pv - conso), grid: Math.max(0, conso - pv) };
        });

    // KPIs journaliers
    const totalPv      = sim.reduce((s, r) => s + r.pv, 0);
    const totalConso   = sim.reduce((s, r) => s + r.conso, 0);
    const totalAuto    = sim.reduce((s, r) => s + r.autoconso, 0);
    const totalSurplus = sim.reduce((s, r) => s + r.surplus, 0);
    const totalGrid    = sim.reduce((s, r) => s + r.grid, 0);
    const autoPct      = totalPv > 0 ? Math.round(totalAuto / totalPv * 100) : 0;
    const coverPct     = totalConso > 0 ? Math.round(totalAuto / totalConso * 100) : 0;

    const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const monthName = MONTHS[month - 1];
    const dataSource = _rawData ? 'Données Enedis réelles' : 'Profil synthétique';

    const chartId1 = 'hourly-chart-main-' + Date.now();
    const chartId2 = battKwh > 0 ? 'hourly-chart-soc-' + Date.now() : null;

    const el = document.getElementById('hourly-results');
    el.innerHTML = `
      <div class="kpi-grid" style="margin-bottom:12px">
        <div class="kpi-card">
          <div class="kpi-value accent">${Math.round(totalPv * 1000)} Wh</div>
          <div class="kpi-label">Production PV<br><span class="kpi-unit">jour typique ${monthName}</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${Math.round(totalConso * 1000)} Wh</div>
          <div class="kpi-label">Consommation<br><span class="kpi-unit">jour typique ${monthName}</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value" style="color:var(--color-success)">${autoPct} %</div>
          <div class="kpi-label">Taux d'autoconso<br><span class="kpi-unit">PV directement consommé</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value info">${coverPct} %</div>
          <div class="kpi-label">Taux de couverture<br><span class="kpi-unit">conso couverte par PV</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value" style="color:var(--color-accent-dark)">${Math.round(totalSurplus * 1000)} Wh</div>
          <div class="kpi-label">Surplus injecté<br><span class="kpi-unit">réseau / perdu</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value" style="color:var(--color-danger)">${Math.round(totalGrid * 1000)} Wh</div>
          <div class="kpi-label">Soutirage réseau<br><span class="kpi-unit">déficit non couvert</span></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-title" style="margin-bottom:6px">
          Profil horaire — ${monthName} · ${Ppeak} kWc · ${dataSource}
        </div>
        <div class="chart-container"><canvas id="${chartId1}"></canvas></div>
      </div>

      ${battKwh > 0 ? `
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">État de charge batterie (${battKwh} kWh · DoD ${dod}%)</div>
        <div class="chart-container"><canvas id="${chartId2}"></canvas></div>
      </div>` : ''}

      <div class="card">
        <div class="card-title" style="margin-bottom:8px">Tableau horaire</div>
        <div style="overflow-x:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Heure</th>
                <th>PV<br>Wh</th>
                <th>Conso<br>Wh</th>
                <th style="color:var(--color-success)">Autoconso<br>Wh</th>
                <th style="color:var(--color-accent-dark)">Surplus<br>Wh</th>
                <th style="color:var(--color-danger)">Réseau<br>Wh</th>
                ${battKwh > 0 ? '<th>SoC<br>kWh</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${sim.map(r => `
                <tr>
                  <td>${String(r.hour).padStart(2,'0')}h</td>
                  <td>${Math.round(r.pv * 1000)}</td>
                  <td>${Math.round(r.conso * 1000)}</td>
                  <td style="color:var(--color-success)">${Math.round(r.autoconso * 1000)}</td>
                  <td style="color:var(--color-accent-dark)">${Math.round(r.surplus * 1000)}</td>
                  <td style="color:var(--color-danger)">${Math.round(r.grid * 1000)}</td>
                  ${battKwh > 0 ? `<td>${r.soc}</td>` : ''}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    // Rendre les graphiques
    setTimeout(() => {
      Charts.renderHourlyProfile(chartId1, sim, monthName);
      if (battKwh > 0 && chartId2) {
        Charts.renderHourlySoc(chartId2, sim, battKwh * dod / 100);
      }
    }, 50);
  }

  return { setData, getHourlyConsumptionProfile, getHourlyPvProduction, simulateDailyBattery, compute, updateSourceStatus: _updateSourceStatus };
})();

/**
 * hourly_module.js - Analyse horaire de la consommation et de la production PV
 *
 * Sources de données :
 *   1. Données Enedis 30min importées (si disponibles) → profil réel
 *   2. Profil synthétique basé sur les consommations mensuelles (fallback)
 *
 * v1.8.0 :
 *   - Auto-affichage si weatherData + hourlyEnedisData disponibles
 *   - computeAllMonths() : calcule et affiche les 12 mois
 *   - Graphe superposition 12 mois (Charts.renderMonthlyOverlay)
 *
 * Dépend de : app_state.js, solar_math.js, charts.js
 */

const HourlyModule = (() => {

  // Données brutes 30min (tableau de 17520 valeurs = 365j × 48 slots)
  let _rawData = null;    // Float32Array ou Array<number> en kWh par slot 30min
  let _rawYear = null;

  // Dernier mois affiché (pour navigation)
  let _currentMonth = 6;

  const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const MONTHS_LONG = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  /** Stocker les données brutes Enedis 30min. setData(null) réinitialise. */
  function setData(data) {
    if (!data) { _rawData = null; _rawYear = null; _updateSourceStatus(); return; }
    _rawData = data.values;
    _rawYear = data.year;
    _updateSourceStatus();
  }

  function _updateSourceStatus() {
    const el = document.getElementById('hourly-source-status');
    if (!el) return;
    if (_rawData) {
      el.style.background = '#e8f5e9';
      el.style.color = 'var(--color-success)';
      el.textContent = `✓ Données Enedis réelles - ${_rawYear || ''} (${_rawData.length} mesures 30min)`;
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

  /**
   * Construit le profil synthétique depuis les données disponibles.
   * Priorité : onglet dimensionnement (sz-kwh-*) → onglet hors-réseau (og2-day-*)
   * → valeur par défaut 200 kWh/mois.
   */
  function _buildSyntheticProfile(month) {
    const days = DAYS_IN_MONTH[month - 1];

    // 1. Onglet dimensionnement (kWh/mois)
    const szKwh = parseFloat(document.getElementById(`sz-kwh-${month}`)?.value) || 0;
    if (szKwh > 0) {
      const dailyKwh = szKwh / days;
      const weights = [
        0.020, 0.015, 0.012, 0.010, 0.012, 0.020,
        0.030, 0.065, 0.075, 0.060, 0.040, 0.035,
        0.040, 0.038, 0.035, 0.035, 0.040, 0.055,
        0.080, 0.090, 0.085, 0.070, 0.055, 0.038
      ];
      const sum = weights.reduce((a, b) => a + b, 0);
      return weights.map(w => (w / sum) * dailyKwh);
    }

    // 2. Onglet hors-réseau (Wh/j) - rempli manuellement ou via import Enedis
    const ogWhDay = parseFloat(document.getElementById(`og2-day-${month}`)?.value) || 0;
    const ogDef   = parseFloat(document.getElementById('og2-daily-default')?.value) || 0;
    const whDay   = ogWhDay > 0 ? ogWhDay : ogDef;
    if (whDay > 0) {
      const dailyKwh = whDay / 1000;
      const weights = [
        0.020, 0.015, 0.012, 0.010, 0.012, 0.020,
        0.030, 0.065, 0.075, 0.060, 0.040, 0.035,
        0.040, 0.038, 0.035, 0.035, 0.040, 0.055,
        0.080, 0.090, 0.085, 0.070, 0.055, 0.038
      ];
      const sum = weights.reduce((a, b) => a + b, 0);
      return weights.map(w => (w / sum) * dailyKwh);
    }

    // 3. Fallback
    const dailyKwh = 200 / days;
    const weights = [
      0.020, 0.015, 0.012, 0.010, 0.012, 0.020,
      0.030, 0.065, 0.075, 0.060, 0.040, 0.035,
      0.040, 0.038, 0.035, 0.035, 0.040, 0.055,
      0.080, 0.090, 0.085, 0.070, 0.055, 0.038
    ];
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => (w / sum) * dailyKwh);
  }

  /** Construit le profil réel depuis les données 30min Enedis */
  function _buildRealProfile(month) {
    const DAYS = _rawYear ? getMonthlyDays(_rawYear) : DAYS_IN_MONTH;
    // Calculer le jour de début du mois dans l'année
    let startDay = 0;
    for (let m = 0; m < month - 1; m++) startDay += DAYS[m];
    const endDay = startDay + DAYS[month - 1];

    // Profil 24h initialisé à 0
    const profile = new Array(24).fill(0);
    const nDays = endDay - startDay;

    for (let day = startDay; day < endDay; day++) {
      for (let slot = 0; slot < 48; slot++) {
        const idx = day * 48 + slot;
        if (idx >= _rawData.length) break;
        const hour = Math.floor(slot / 2);
        profile[hour] += _rawData[idx] || 0;
      }
    }

    // Moyenne par heure (somme des 2 slots 30min / nombre de jours)
    return profile.map(v => nDays > 0 ? v / nDays : 0);
  }


  /**
   * Calcule la production PV horaire (kWh) pour un mois donné
   * en utilisant SolarMath.hourlyIrradiance + correction thermique NOCT
   * (cohérente avec solar_math.js pvProduction - évite l'écart ~8-15 % en été)
   */
  function getHourlyPvProduction(month, Ppeak, tilt, azimuth, losses) {
    if (!AppState.weatherData || month < 1 || month > 12) return new Array(24).fill(0);
    const monthData = AppState.weatherData[month - 1];
    const lat  = AppState.location?.lat ?? 44;
    const tech = AppState.install?.tech || 'crystSi';

    // Correction thermique NOCT (même modèle que pvProduction dans solar_math.js)
    const tempCoeff = { crystSi: -0.0045, CIS: -0.0036, CdTe: -0.0025, unknown: -0.004 };
    const gamma  = tempCoeff[tech] || -0.004;
    const days   = DAYS_IN_MONTH[month - 1];
    const Htilt  = SolarMath.tiltedIrradiation(monthData.GHI, monthData.DHI, lat, tilt, azimuth, month);
    const sunH   = Math.max(3, SolarMath.daylightHours(lat, month));
    const G_eff  = Htilt > 0 ? (Htilt / days * 1000) / sunH : 0;
    const Tcell  = (monthData.T_avg || 15) + 25 * G_eff / 800;
    const PR_temp = 1 + gamma * Math.max(0, Tcell - 25);
    const lossF  = Math.max(0.5, (1 - (losses || 14) / 100) * Math.min(1, PR_temp));

    return Array.from({length: 24}, (_, h) => {
      const irr = SolarMath.hourlyIrradiance(lat, month, h, monthData, tilt, azimuth);
      return irr * Ppeak * lossF / 1000;  // kWh
    });
  }

  /**
   * Simulation batterie sur une journée typique.
   *
   * Convention rendement (cohérente avec offgrid_sizing.js/simulateMonth) :
   *   - eta = rendement aller-retour (ex: 0.97 pour LFP)
   *   - Pertes appliquées uniquement en CHARGE : stocké = surplus × eta
   *   - Décharge sans perte supplémentaire → round-trip = eta (et non eta²)
   *
   * @returns {Array} 24 objets { hour, pv, conso, soc, autoconso, surplus, grid }
   */
  function simulateDailyBattery(pvHours, consoHours, battKwh, dod, eta = 0.97) {
    const usable = battKwh * (dod / 100);
    let soc = usable * 0.5;
    return pvHours.map((pv, h) => {
      const conso   = consoHours[h];
      const balance = pv - conso;
      let autoconso, surplus, grid;

      if (balance >= 0) {
        autoconso = conso;
        const charge = Math.min(balance * eta, usable - soc);
        soc += charge;
        surplus = balance - charge / eta;
        grid    = 0;
      } else {
        autoconso = pv;
        const needed   = -balance;
        const fromBatt = Math.min(needed, soc);
        soc -= fromBatt;
        surplus  = 0;
        grid     = needed - fromBatt;
        autoconso += fromBatt;
      }

      return { hour: h, pv, conso, soc: Math.round(soc * 100) / 100, autoconso, surplus, grid };
    });
  }

  /** Simule un mois et retourne les données + KPIs */
  function _simulateMonth(month, Ppeak, battKwh, dod, tilt, azimuth) {
    const losses  = AppState.install?.losses ?? 14;
    const consoH  = getHourlyConsumptionProfile(month);
    const pvH     = getHourlyPvProduction(month, Ppeak, tilt, azimuth, losses);
    const sim     = battKwh > 0
      ? simulateDailyBattery(pvH, consoH, battKwh, dod)
      : pvH.map((pv, h) => {
          const conso     = consoH[h];
          const autoconso = Math.min(pv, conso);
          return { hour: h, pv, conso, soc: 0, autoconso,
                   surplus: Math.max(0, pv - conso), grid: Math.max(0, conso - pv) };
        });

    const totalPv      = sim.reduce((s, r) => s + r.pv, 0);
    const totalConso   = sim.reduce((s, r) => s + r.conso, 0);
    const totalAuto    = sim.reduce((s, r) => s + r.autoconso, 0);
    const totalSurplus = sim.reduce((s, r) => s + r.surplus, 0);
    const totalGrid    = sim.reduce((s, r) => s + r.grid, 0);
    const autoPct      = totalPv > 0 ? Math.round(totalAuto / totalPv * 100) : 0;
    const coverPct     = totalConso > 0
      ? (totalGrid > 0 ? Math.min(99, Math.round(totalAuto / totalConso * 100)) : 100)
      : 0;

    return { sim, totalPv, totalConso, totalAuto, totalSurplus, totalGrid, autoPct, coverPct };
  }

  /** Construit le bloc HTML d'un seul mois */
  function _buildMonthHTML(month, data, battKwh, dod, Ppeak, dataSource) {
    const monthName = MONTHS_FR[month - 1];
    const isOffgrid = AppState.installationType === 'offgrid';
    const labelSurplus      = isOffgrid ? 'Surplus (énergie perdue)' : 'Surplus injecté';
    const labelSurplusUnit  = isOffgrid ? 'non consommé, dissipé' : 'réseau / perdu';
    const labelDeficit      = isOffgrid ? 'Déficit non couvert' : 'Soutirage réseau';
    const labelDeficitUnit  = isOffgrid ? 'batterie vide, manque' : 'déficit non couvert';
    const labelColDeficit   = isOffgrid ? 'Déficit<br>Wh' : 'Réseau<br>Wh';

    const ts        = `${month}-${Date.now()}`;
    const chartId1  = `hourly-chart-main-${ts}`;
    const chartId2  = battKwh > 0 ? `hourly-chart-soc-${ts}` : null;
    const { sim, totalPv, totalConso, totalSurplus, totalGrid, autoPct, coverPct } = data;

    return `
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
          <div class="kpi-label">${labelSurplus}<br><span class="kpi-unit">${labelSurplusUnit}</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value" style="color:var(--color-danger)">${Math.round(totalGrid * 1000)} Wh</div>
          <div class="kpi-label">${labelDeficit}<br><span class="kpi-unit">${labelDeficitUnit}</span></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-title" style="margin-bottom:6px">
          Profil horaire - ${monthName} · ${Ppeak} kWc · ${dataSource}
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
                <th style="color:var(--color-danger)">${labelColDeficit}</th>
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
  }

  /**
   * Lance l'analyse des 12 mois et affiche les résultats dans l'onglet.
   * C'est la fonction principale appelée par le bouton "Analyser les 12 mois"
   * ainsi qu'en auto-trigger si les données sont disponibles.
   */
  function computeAllMonths() {
    if (!AppState.weatherData) {
      showToast('Sélectionnez d\'abord un lieu avec des données météo.', 'error');
      return;
    }

    const Ppeak   = parseFloat(document.getElementById('hourly-ppeak')?.value)   || 3;
    const battKwh = parseFloat(document.getElementById('hourly-batt')?.value)    || 0;
    const dod     = parseFloat(document.getElementById('hourly-dod')?.value)     || 80;
    const tilt    = parseFloat(document.getElementById('hourly-tilt')?.value)    || 30;
    const azimuth = parseFloat(document.getElementById('hourly-azimuth')?.value) || 0;

    const dataSource = _rawData ? 'Données Enedis réelles' : 'Profil synthétique';
    const isOffgrid  = AppState.installationType === 'offgrid';
    const chartGridLabel = isOffgrid ? 'Déficit non couvert (Wh)' : 'Soutirage réseau (Wh)';

    // Simuler les 12 mois
    const allData = Array.from({ length: 12 }, (_, i) =>
      _simulateMonth(i + 1, Ppeak, battKwh, dod, tilt, azimuth)
    );

    // ID unique pour le graphe overlay
    const overlayId = 'hourly-chart-overlay-' + Date.now();

    // Construire l'UI : tabs de navigation mois + contenu
    const tabBtns = MONTHS_FR.map((m, i) => `
      <button class="hourly-month-tab${i === _currentMonth - 1 ? ' active' : ''}"
              data-month="${i + 1}"
              style="padding:4px 10px;border:1px solid var(--color-border);border-radius:4px;background:${i === _currentMonth - 1 ? 'var(--color-accent)' : 'var(--color-bg)'};color:${i === _currentMonth - 1 ? '#fff' : 'inherit'};cursor:pointer;font-size:12px;white-space:nowrap">
        ${m}
      </button>`).join('');

    const monthPanels = MONTHS_LONG.map((mLong, i) => {
      const isActive = (i + 1) === _currentMonth;
      const monthHtml = _buildMonthHTML(i + 1, allData[i], battKwh, dod, Ppeak, dataSource);
      return `
        <div id="hourly-panel-${i + 1}"
             style="display:${isActive ? 'block' : 'none'}">
          <div class="card-title" style="font-size:14px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--color-border)">
            ${mLong}
          </div>
          ${monthHtml}
        </div>`;
    }).join('');

    const el = document.getElementById('hourly-results');
    el.innerHTML = `
      <!-- Graphe superposition 12 mois -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-title" style="margin-bottom:6px">Vue annuelle — Superposition des 12 mois</div>
        <div class="chart-container" style="height:280px"><canvas id="${overlayId}"></canvas></div>
      </div>

      <!-- Navigation mois -->
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;align-items:center">
        <span style="font-size:12px;color:var(--color-text-muted);margin-right:4px">Mois :</span>
        ${tabBtns}
      </div>

      <!-- Panneau par mois -->
      <div id="hourly-month-panels">
        ${monthPanels}
      </div>`;

    // Navigation entre mois
    el.querySelectorAll('.hourly-month-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = parseInt(btn.dataset.month);
        _currentMonth = m;
        // Mettre à jour les styles des boutons
        el.querySelectorAll('.hourly-month-tab').forEach(b => {
          const active = parseInt(b.dataset.month) === m;
          b.style.background   = active ? 'var(--color-accent)' : 'var(--color-bg)';
          b.style.color        = active ? '#fff' : 'inherit';
        });
        // Afficher le bon panneau
        el.querySelectorAll('[id^="hourly-panel-"]').forEach(panel => {
          panel.style.display = panel.id === `hourly-panel-${m}` ? 'block' : 'none';
        });
      });
    });

    // Rendre les graphiques avec un léger délai pour que le DOM soit prêt
    setTimeout(() => {
      // Graphe superposition annuelle
      const overlayInput = allData.map((d, i) => ({
        monthName: MONTHS_FR[i],
        sim: d.sim
      }));
      Charts.renderMonthlyOverlay(overlayId, overlayInput);

      // Graphes de chaque mois (seulement le mois actif au premier rendu,
      // les autres seront rendus à la demande au survol des tabs)
      allData.forEach((d, i) => {
        const month = i + 1;
        const ts    = `${month}-`;
        // Chercher le canvas du mois (par préfixe d'ID dans le panel correspondant)
        const panel = document.getElementById(`hourly-panel-${month}`);
        if (!panel) return;

        const mainCanvas = panel.querySelector(`[id^="hourly-chart-main-"]`);
        const socCanvas  = panel.querySelector(`[id^="hourly-chart-soc-"]`);

        if (mainCanvas) {
          Charts.renderHourlyProfile(mainCanvas.id, d.sim, MONTHS_FR[i], chartGridLabel);
        }
        if (socCanvas && battKwh > 0) {
          Charts.renderHourlySoc(socCanvas.id, d.sim, battKwh * dod / 100);
        }
      });
    }, 50);
  }

  /**
   * Ancienne fonction compute() — conservée pour compatibilité.
   * Désormais délègue à computeAllMonths().
   */
  function compute() {
    computeAllMonths();
  }

  /**
   * Auto-trigger : affiche les résultats si les données nécessaires sont déjà disponibles.
   * Appelé à l'activation de l'onglet daily ou après chargement d'un projet.
   */
  function autoComputeIfReady() {
    if (AppState.weatherData) {
      // On a les données météo — on peut calculer (avec profil réel ou synthétique)
      computeAllMonths();
    }
  }

  return {
    setData,
    getHourlyConsumptionProfile,
    getHourlyPvProduction,
    simulateDailyBattery,
    compute,
    computeAllMonths,
    autoComputeIfReady,
    updateSourceStatus: _updateSourceStatus
  };
})();

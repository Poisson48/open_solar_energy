/**
 * offgrid_sizing.js — Dimensionnement système PV + batterie hors réseau
 *
 * Algorithme :
 *   Pour chaque combinaison (Ppeak × C_batt), simule le bilan énergétique
 *   journalier sur 365 jours (approximé par 12 profils mensuels).
 *   Retourne les métriques de couverture, jours de déficit, coût système.
 *
 * Technologies batterie :
 *   LFP  (lithium fer phosphate) : DoD 80%, η 97%, 3000+ cycles, ~500 €/kWh brut
 *   AGM  (plomb carbone)          : DoD 50%, η 85%, 600  cycles, ~150 €/kWh brut
 *   NMC  (lithium NMC)            : DoD 90%, η 97%, 1000 cycles, ~450 €/kWh brut
 */

const OffgridSizing = (() => {

  // DAYS_IN_MONTH et MONTH_NAMES définis dans constants.js
  const DAYS = DAYS_IN_MONTH;

  const BATTERY_TECH = {
    lfp:       { label:'LFP standard (neuf)',             dod:0.80, eta:0.97, cycles:3000, costPerKwh:400, bmsFixed:0,   color:'#2d9e5c' },
    lfp_diy:   { label:'LFP DIY cellules CATL/EVE 280Ah', dod:0.90, eta:0.97, cycles:3000, costPerKwh:100, bmsFixed:200, color:'#1a6b3c' },
    agm:       { label:'AGM (plomb carbone)',              dod:0.50, eta:0.85, cycles:600,  costPerKwh:120, bmsFixed:0,   color:'#1565c0' },
    nmc_leaf:  { label:'NMC recondit. Nissan Leaf',        dod:0.80, eta:0.96, cycles:800,  costPerKwh:45,  bmsFixed:150, color:'#7b1fa2' },
    nmc_zoe:   { label:'NMC recondit. Renault Zoé',        dod:0.80, eta:0.96, cycles:900,  costPerKwh:50,  bmsFixed:150, color:'#e91e63' },
    nmc_tesla: { label:'NMC recondit. Tesla',              dod:0.85, eta:0.97, cycles:1000, costPerKwh:65,  bmsFixed:200, color:'#d32f2f' }
  };

  const INVERTER_EFF  = 0.93;
  const CONTROLLER_EFF= 0.96;
  const PV_COST_PER_KWP = 650; // €HT pro/kWc (panneau + pose)
  const BOS_COST = 500;         // €HT (câblage, support, régulateur...)

  // ── Simulation énergétique mensuelle ─────────────────────────
  /**
   * Simule le bilan batterie sur un mois en utilisant les journées moyennes.
   * Retourne jours de déficit et énergie manquante.
   *
   * @param {number} e_prod_day  production PV moyenne journalière (kWh/j)
   * @param {number} e_conso_day consommation journalière (kWh/j)
   * @param {number} C_usable    capacité batterie utilisable (kWh)
   * @param {number} days        jours dans le mois
   * @param {number} soc_init    état de charge initial (kWh)
   * @param {number} eta         rendement batterie (aller-retour)
   * @returns {{ soc_end, deficit_days, deficit_kwh, surplus_kwh }}
   */
  function simulateMonth(e_prod_day, e_conso_day, C_usable, days, soc_init, eta) {
    let soc = Math.min(soc_init, C_usable);
    let deficit_days = 0;
    let deficit_kwh  = 0;
    let surplus_kwh  = 0;

    for (let d = 0; d < days; d++) {
      // Énergie nette après production et consommation directe
      const balance = e_prod_day * CONTROLLER_EFF * INVERTER_EFF - e_conso_day;

      if (balance >= 0) {
        // Surplus → charge batterie
        const stored = Math.min(balance * eta, C_usable - soc);
        soc += stored;
        surplus_kwh += (balance - stored / eta);  // surplus perdu (batterie pleine)
      } else {
        // Déficit → décharge batterie
        const needed = -balance;
        const from_batt = Math.min(needed, soc);
        soc -= from_batt;
        const unmet = needed - from_batt;
        if (unmet > 0.05) { // seuil 50 Wh pour ignorer les micro-déficits
          deficit_days++;
          deficit_kwh += unmet;
        }
      }
    }
    return { soc_end: soc, deficit_days, deficit_kwh, surplus_kwh };
  }

  // ── Simulation horaire d'un mois (utilise données Enedis si dispo) ──
  function simulateMonthHourly(month, monthData, Ppeak, losses, tilt, azimuth, lat, C_usable, eta, soc_init) {
    const lossF = 1 - losses / 100;
    const days  = DAYS[month - 1];

    // Profil PV horaire (24h)
    const pvH = Array.from({length: 24}, (_, h) => {
      const irr = SolarMath.hourlyIrradiance(lat, month, h, monthData, tilt, azimuth);
      return irr * Ppeak * lossF / 1000;
    });

    // Profil conso horaire — données réelles Enedis si disponibles
    const consoH = HourlyModule.getHourlyConsumptionProfile(month);

    let soc = soc_init !== undefined ? Math.min(soc_init, C_usable) : C_usable * 0.5;
    let deficit_days = 0, deficit_kwh = 0, surplus_kwh = 0;

    for (let d = 0; d < days; d++) {
      let day_deficit = 0;
      for (let h = 0; h < 24; h++) {
        const balance = pvH[h] - consoH[h];
        if (balance >= 0) {
          const stored = Math.min(balance * eta, C_usable - soc);
          soc += stored;
          surplus_kwh += balance - stored / eta;
        } else {
          const needed   = -balance;
          const from_batt = Math.min(needed, soc);
          soc -= from_batt;
          day_deficit += needed - from_batt;
        }
      }
      if (day_deficit > 0.05) { deficit_days++; deficit_kwh += day_deficit; }
    }
    return { soc_end: soc, deficit_days, deficit_kwh, surplus_kwh };
  }

  // ── Simulation annuelle ───────────────────────────────────────
  function simulateYear(monthlyHtilt, dailyConso, Ppeak, losses, weatherData, C_usable, eta, tilt, azimuth, lat) {
    // Mode horaire si données Enedis 30min disponibles
    const useHourly = !!(AppState.hourlyEnedisData && tilt !== undefined && lat !== undefined);
    let soc = C_usable * 0.5;
    const monthly = [];
    const lossF   = 1 - (losses || 14) / 100;

    for (let i = 0; i < 12; i++) {
      const days = DAYS[i];
      let res;
      let e_prod_day, e_conso_day;
      if (useHourly) {
        res = simulateMonthHourly(i + 1, weatherData[i], Ppeak, losses, tilt, azimuth, lat, C_usable, eta, soc);
        const Htilt = monthlyHtilt[i];
        e_prod_day  = SolarMath.pvProduction(Htilt, Ppeak, losses, weatherData[i].T_avg, 'crystSi', i+1) / days;
        const consoH = HourlyModule.getHourlyConsumptionProfile(i + 1);
        e_conso_day = consoH.reduce((s, v) => s + v, 0);
      } else {
        const Htilt = monthlyHtilt[i];
        e_prod_day  = SolarMath.pvProduction(Htilt, Ppeak, losses, weatherData[i].T_avg, 'crystSi', i+1) / days;
        e_conso_day = dailyConso[i] / 1000;
        res = simulateMonth(e_prod_day, e_conso_day, C_usable, days, soc, eta);
      }
      soc = res.soc_end;

      monthly.push({
        month: i+1, name: MONTH_NAMES[i],
        e_prod_day:   Math.round(e_prod_day * 100) / 100,
        e_conso_day:  Math.round(e_conso_day * 100) / 100,
        deficit_days: res.deficit_days,
        deficit_kwh:  Math.round(res.deficit_kwh * 10) / 10,
        surplus_kwh:  Math.round(res.surplus_kwh * 10) / 10,
        soc_end_pct:  C_usable > 0 ? Math.round((res.soc_end / C_usable) * 100) : 0
      });
    }

    const total_days   = DAYS.reduce((s, d) => s + d, 0);
    const deficit_days = monthly.reduce((s, m) => s + m.deficit_days, 0);
    // En mode horaire, la conso est portée par monthly.e_conso_day × jours du mois
    const total_conso  = useHourly
      ? monthly.reduce((s, m, i) => s + m.e_conso_day * DAYS[i], 0)
      : dailyConso.reduce((s, v, i) => s + v * DAYS[i], 0) / 1000;
    const total_deficit = monthly.reduce((s, m) => s + m.deficit_kwh, 0);
    const coverageRate  = total_conso > 0 ? Math.max(0, (total_conso - total_deficit) / total_conso * 100) : 0;
    const autonomyDays  = total_deficit > 0 ? Math.round((deficit_days / total_days) * 365) : 0;

    return {
      monthly,
      total_days,
      deficit_days,
      total_conso: Math.round(total_conso),
      total_deficit: Math.round(total_deficit * 10) / 10,
      coverageRate: Math.round(coverageRate * 10) / 10,
      autonomyDays
    };
  }

  // ── Moteur principal ───────────────────────────────────────────
  /**
   * Trouve la combinaison optimale (Ppeak, C_batt) pour le système hors réseau.
   *
   * @param {object} input      { site, conso, battery, sizing }
   * @param {array}  weatherData 12 mois {GHI, DHI, T_avg}
   * @param {number} lat        latitude
   */
  function run(input, weatherData, lat, hourlyConsoProfiles) {
    const { site, conso, battery, sizing } = input;
    const tech   = BATTERY_TECH[battery.type] || BATTERY_TECH.lfp;
    const losses = site.losses || 14;

    // Pré-calcul irradiation inclinée
    const monthlyHtilt = weatherData.map((m, i) =>
      SolarMath.tiltedIrradiation(m.GHI, m.DHI, lat, site.tilt, site.azimuth, i+1)
    );

    // Consommation journalière par mois (Wh/j)
    const dailyConso = Array.from({length:12}, (_, i) => conso.dailyWh[i] || conso.dailyWh[0]);
    const annual_conso = dailyConso.reduce((s, v, i) => s + v * DAYS[i], 0) / 1000;

    // Contraintes physiques
    const nPanelsMax = site.nPanelsFixed > 0
      ? site.nPanelsFixed
      : Math.floor((site.maxSurfaceM2 || 30) / (site.panelSurfaceM2 || 1.96));
    const PpeakMax   = Math.min(15, (nPanelsMax * (site.panelWattPeak || 400)) / 1000);

    // Grille de recherche : Ppeak × C_batt (fixe = une seule valeur)
    const ppeaks = [];
    if (site.nPanelsFixed > 0) {
      ppeaks.push(PpeakMax);
    } else {
      for (let p = 0.5; p <= PpeakMax + 0.05; p = Math.round((p + 0.5) * 10) / 10) ppeaks.push(p);
    }
    // Plafond auto : 5× la conso journalière max, entre 10 et 50 kWh
    // Si données Enedis dispo, utiliser la vraie conso max (évite le plafond artificiel si le formulaire est vide)
    let maxDailyKwh = Math.max(...dailyConso) / 1000;
    if (AppState.hourlyEnedisData) {
      const realMax = Math.max(...Array.from({length: 12}, (_, i) =>
        HourlyModule.getHourlyConsumptionProfile(i + 1).reduce((s, v) => s + v, 0)
      ));
      if (realMax > 0) maxDailyKwh = Math.max(maxDailyKwh, realMax);
    }
    const battCeil = Math.min(50, Math.max(10, Math.ceil(maxDailyKwh * 5)));
    const batts = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50].filter(b => b <= battCeil);

    const allCandidates = [];

    ppeaks.forEach(Ppeak => {
      batts.forEach(C_batt_gross => {
        const C_usable = C_batt_gross * tech.dod;
        const yearSim  = simulateYear(monthlyHtilt, dailyConso, Ppeak, losses, weatherData, C_usable, tech.eta, site.tilt, site.azimuth, lat);

        const nPanels  = Math.ceil((Ppeak * 1000) / (site.panelWattPeak || 400));
        const systemCostPV   = Ppeak * (sizing.pvCostPerKwp || PV_COST_PER_KWP);
        const systemCostBatt = C_batt_gross * tech.costPerKwh + (tech.bmsFixed || 0);
        const systemCost     = systemCostPV + systemCostBatt + (sizing.bosCost != null ? sizing.bosCost : BOS_COST);

        // Durée de vie batterie (années) basée sur cycles/an
        const cycles_per_year = 365 * 0.6; // estimation (pas plein cycle tous les jours)
        const battLifeYears   = Math.round(tech.cycles / cycles_per_year);

        allCandidates.push({
          Ppeak,
          C_batt_gross,
          C_usable: Math.round(C_usable * 10) / 10,
          nPanels,
          systemCost:  Math.round(systemCost),
          costPV:      Math.round(systemCostPV),
          costBatt:    Math.round(systemCostBatt),
          ...yearSim,
          battLifeYears,
          annual_conso: Math.round(annual_conso)
        });
      });
    });

    // Sélection : minimiser les jours de déficit d'abord, puis le coût
    const target = sizing.targetCoveragePct || 90;
    const candidates_ok = allCandidates.filter(c => c.coverageRate >= target);

    let recommended;
    if (candidates_ok.length > 0) {
      // Chercher le moins cher satisfaisant aussi le budget jours-déficit
      // (nb jours déficit ≤ budget énergétique : si cible 90 % → max 37 j/an)
      const maxDeficitDays = Math.round((1 - target / 100) * 365);
      const candidates_comfort = candidates_ok.filter(c => c.deficit_days <= maxDeficitDays);
      const pool = candidates_comfort.length > 0 ? candidates_comfort : candidates_ok;
      recommended = pool.sort((a, b) => a.systemCost - b.systemCost)[0];
    } else {
      // Fallback : max couverture, puis min coût
      const maxCov = Math.max(...allCandidates.map(c => c.coverageRate));
      recommended = allCandidates.filter(c => c.coverageRate >= maxCov - 1)
        .sort((a, b) => a.systemCost - b.systemCost)[0];
    }

    const useHourly = !!(AppState.hourlyEnedisData);
    return { recommended, allCandidates, monthlyHtilt, tech, annual_conso: Math.round(annual_conso), useHourly };
  }

  // ── Lecture du formulaire ─────────────────────────────────────
  function readFormInput() {
    const getVal = id => parseFloat(document.getElementById(id)?.value) || 0;
    const getStr = id => document.getElementById(id)?.value || '';

    // Consommation mensuelle (Wh/j par mois, ou uniforme si non renseigné)
    const defaultDay = getVal('og2-daily-default') || 1000;
    const dailyWh = Array.from({length:12}, (_, i) => {
      const v = getVal(`og2-day-${i+1}`);
      return v > 0 ? v : defaultDay;
    });

    const fixeMode  = document.getElementById('og2-pmode-fixe')?.classList.contains('active');
    const consoMode = document.getElementById('og2-pmode-conso')?.classList.contains('active');
    const nPanelsFixed = fixeMode ? (parseInt(document.getElementById('og2-npanels-fixe')?.value) || 0) : 0;
    const maxSurf = consoMode ? 9999 : (getVal('og2-surface') || 20);

    return {
      site: {
        tilt:          getVal('og2-tilt')      || 30,
        azimuth:       getVal('og2-azimuth')   || 0,
        maxSurfaceM2:  maxSurf,
        panelWattPeak: getVal('og2-panel-wp')  || 400,
        panelSurfaceM2:getVal('og2-panel-m2')  || 1.96,
        losses:        getVal('og2-losses')    || 14,
        nPanelsFixed
      },
      conso: { dailyWh },
      battery: {
        type: getStr('og2-batt-tech') || 'lfp'
      },
      sizing: {
        targetCoveragePct: getVal('og2-target-coverage') || 90,
        pvCostPerKwp:      getVal('og2-pv-cost-kwp')     || PV_COST_PER_KWP,
        bosCost:           getVal('og2-bos-cost')
      }
    };
  }

  // ── Export CSV ────────────────────────────────────────────────
  function exportCSV(result) {
    const lines = ['Mois;Prod_kWh_j;Conso_Wh_j;Déficit_jours;Déficit_kWh;Surplus_kWh;SOC_fin_%'];
    result.monthly.forEach(m => {
      lines.push([m.name, m.e_prod_day, m.e_conso_day*1000, m.deficit_days, m.deficit_kwh, m.surplus_kwh, m.soc_end_pct].join(';'));
    });
    const blob = new Blob([lines.join('\n')], {type:'text/csv'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'dimensionnement_hors_reseau.csv'; a.click();
  }

  return { run, readFormInput, exportCSV, BATTERY_TECH, DAYS, MONTH_NAMES };
})();

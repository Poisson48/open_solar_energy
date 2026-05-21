/**
 * sizing.js - Moteur de dimensionnement PV depuis facture EDF
 *
 * Logique : l'utilisateur saisit sa consommation réelle, le logiciel
 * calcule le kWp optimal par balayage discret (0.1 kWc de pas).
 *
 * Entrée  → SizingEngine.run(input, weatherData, lat)
 * Sortie  → { recommended, allCandidates, monthlyHtilt }
 */

const SizingEngine = (() => {

  // DAYS_IN_MONTH et MONTH_NAMES définis dans constants.js
  const DAYS = DAYS_IN_MONTH;

  // ── Sélection de l'optimal selon la stratégie ─────────────────
  function selectOptimal(results, strategy, targetCoveragePct) {
    if (!results.length) return null;
    switch (strategy) {
      case 'autoconso_max': {
        // Max autoconso en évitant les installations où > 40% part au réseau
        const goodRatio = results.filter(r => r.autoconsoRate >= 60);
        const pool = goodRatio.length ? goodRatio : [...results];
        return pool.sort((a, b) =>
          b.annualAutoconsoKwh !== a.annualAutoconsoKwh
            ? b.annualAutoconsoKwh - a.annualAutoconsoKwh
            : a.Ppeak - b.Ppeak
        )[0];
      }

      case 'roi_optimal':
        return [...results].filter(r => r.ROI < 30).sort((a, b) => a.ROI - b.ROI)[0]
          || results[0];

      case 'bill_coverage_pct': {
        const target = targetCoveragePct || 60;
        return results.find(r => r.coverageRate >= target) || results[results.length - 1];
      }

      default:
        return [...results].sort((a, b) => a.ROI - b.ROI)[0];
    }
  }

  // ── Autoconsommation slot-à-slot sans batterie (réseau) ──────────
  // pvSlotsFlat : Float32Array(nHours×2) par kWc - index = slot absolu
  function _calcSlotMetrics(pvSlotsFlat, Ppeak, enedis) {
    const data    = enedis.halfHourly;
    const daysArr = enedis.year ? getMonthlyDays(enedis.year) : DAYS;
    const monthly = Array.from({length: 12}, (_, i) => ({
      month: i + 1, name: MONTH_NAMES[i],
      prod: 0, conso: 0, autoconsoKwh: 0, surplus: 0, deficit: 0
    }));
    let dayIdx = 0;
    for (let m = 0; m < 12; m++) {
      const nDays = daysArr[m];
      for (let d = 0; d < nDays; d++) {
        for (let s = 0; s < 48; s++) {
          const idx = dayIdx * 48 + s;
          if (idx >= data.length) break;
          const c = data[idx] || 0;
          const p = (pvSlotsFlat[idx] || 0) * Ppeak;
          monthly[m].prod         += p;
          monthly[m].conso        += c;
          monthly[m].autoconsoKwh += Math.min(p, c);
          monthly[m].surplus      += Math.max(0, p - c);
          monthly[m].deficit      += Math.max(0, c - p);
        }
        dayIdx++;
      }
    }
    return monthly;
  }

  // ── Moteur principal ───────────────────────────────────────────
  /**
   * @param {object} input       Données saisies (bill, site, sizing)
   * @param {array}  weatherData 12 mois {GHI, DHI, T_avg, ...}
   * @param {number} lat         Latitude du site
   * @returns {{ recommended, allCandidates, monthlyHtilt, currentBill }}
   */
  function run(input, weatherData, lat) {
    const { bill, site, sizing } = input;

    // 1. Pré-calcul irradiation sur plan incliné
    const monthlyHtilt = weatherData.map((m, i) =>
      SolarMath.tiltedIrradiation(m.GHI, m.DHI, lat, site.tilt, site.azimuth, i + 1)
    );

    // 2. Contrainte physique
    const nPanelsMax = Math.floor((site.maxSurfaceM2 || 30) / (site.panelSurfaceM2 || 1.96));
    const PpeakMax = Math.min(20, (nPanelsMax * (site.panelWattPeak || 400)) / 1000);

    // 3. Facture actuelle
    const currentBill = FinanceCalc.calcCurrentAnnualBill(bill);
    const annualConso  = bill.monthlyKwh.reduce((s, k) => s + k, 0);

    // 4. Pré-calcul profil PV 30min si données Enedis disponibles
    // Priorité : météo horaire réelle (jour-à-jour) > profil mensuel moyen aplati
    const enedis = typeof AppState !== 'undefined' ? AppState.hourlyEnedisData : null;
    const hasEnedisSlots = !!(enedis?.halfHourly?.length >= 48 * 365);
    let pvProfilesPerKwc = null;  // Float32Array(nHours×2) par kWc si dispo
    if (hasEnedisSlots) {
      const daysArr = enedis.year ? getMonthlyDays(enedis.year) : DAYS;
      const hourlyWx = typeof AppState !== 'undefined' ? AppState.hourlyWeatherData : null;
      if (hourlyWx) {
        pvProfilesPerKwc = SolarMath.buildYearPvSlots(
          hourlyWx, site.tilt, site.azimuth, site.losses, site.tech, lat,
          (typeof AppState !== 'undefined' && AppState.location?.lon) || 0
        );
      } else {
        const monthlyProfs = PvProfiles.buildMonthlyProfiles(weatherData, monthlyHtilt, site.losses, site.tilt, site.azimuth, lat, site.tech);
        pvProfilesPerKwc = new Float32Array(daysArr.reduce((s, d) => s + d, 0) * 48);
        let di = 0;
        for (let m = 0; m < 12; m++) {
          for (let d = 0; d < daysArr[m]; d++, di++) pvProfilesPerKwc.set(monthlyProfs[m], di * 48);
        }
      }
    }

    // 5. Balayage de 0.5 à PpeakMax (pas 0.1 kWc)
    const allCandidates = [];
    for (let Ppeak = 0.5; Ppeak <= PpeakMax + 0.05; Ppeak = Math.round((Ppeak + 0.1) * 10) / 10) {

      // Métriques mensuelles : slot-à-slot si Enedis dispo, sinon mensuel agrégé
      let monthlyMetrics;
      if (pvProfilesPerKwc) {
        monthlyMetrics = _calcSlotMetrics(pvProfilesPerKwc, Ppeak, enedis);
      } else {
        const monthlyProd = monthlyHtilt.map((Htilt, i) =>
          SolarMath.pvProduction(Htilt, Ppeak, site.losses, weatherData[i].T_avg, site.tech, i + 1, lat)
        );
        monthlyMetrics = monthlyProd.map((prod, i) => {
          const conso       = bill.monthlyKwh[i];
          const autoconsoKwh = Math.min(prod, conso);
          const surplus      = Math.max(0, prod - conso);
          const deficit      = Math.max(0, conso - prod);
          return { month: i+1, name: MONTH_NAMES[i], prod, conso, autoconsoKwh, surplus, deficit };
        });
      }

      // Agrégation annuelle
      const annualProd          = monthlyMetrics.reduce((s, m) => s + m.prod, 0);
      const annualAutoconsoKwh  = monthlyMetrics.reduce((s, m) => s + m.autoconsoKwh, 0);
      const annualSurplus       = monthlyMetrics.reduce((s, m) => s + m.surplus, 0);
      const annualDeficit       = monthlyMetrics.reduce((s, m) => s + m.deficit, 0);
      // Conso réelle Enedis (plus précise que la facture mensuelle arrondée)
      const annualConsoReal     = pvProfilesPerKwc
        ? monthlyMetrics.reduce((s, m) => s + m.conso, 0)
        : annualConso;

      const coverageRate        = annualConsoReal > 0 ? annualAutoconsoKwh / annualConsoReal : 0;
      const autoconsoRate = annualProd   > 0 ? annualAutoconsoKwh / annualProd   : 0;

      // Finance
      const savedOnBill    = FinanceCalc.calcSavingsOnBill(monthlyMetrics, bill);
      const feedinRevenue  = annualSurplus * (sizing.feedinTariff || 0);
      const totalAnnualGain = savedOnBill + feedinRevenue;
      const systemCostBrut = sizing.realTotalCost > 0
        ? sizing.realTotalCost
        : Ppeak * (sizing.systemCostPerKwp || 900);
      // Prime autoconso France (réduit le coût net pour rentabilité)
      const incentive      = sizing.includeIncentive !== false ? FinanceCalc.calcFrenchIncentive(Ppeak) : 0;
      const systemCost     = Math.max(0, systemCostBrut - incentive);
      const ROI            = totalAnnualGain > 0 ? systemCost / totalAnnualGain : 99;
      const nPanels        = Math.ceil((Ppeak * 1000) / (site.panelWattPeak || 400));
      const surfaceNeeded  = nPanels * (site.panelSurfaceM2 || 1.96);
      const newAnnualBill  = Math.max(0, currentBill - savedOnBill);

      // Métriques financières avancées (sur coût net après prime)
      const paybackYears   = FinanceCalc.calcPayback(systemCost, totalAnnualGain);
      const npv25          = Math.round(FinanceCalc.calcNPV(systemCost, totalAnnualGain));
      const lcoe           = Math.round(FinanceCalc.calcLCOE(systemCostBrut, annualProd) * 10000) / 10000;

      allCandidates.push({
        Ppeak: Math.round(Ppeak * 10) / 10,
        nPanels,
        surfaceNeeded: Math.round(surfaceNeeded * 10) / 10,
        systemCostBrut: Math.round(systemCostBrut),
        incentive:   Math.round(incentive),
        systemCost: Math.round(systemCost),
        annualProd:  Math.round(annualProd),
        annualConso: Math.round(annualConsoReal),
        annualAutoconsoKwh: Math.round(annualAutoconsoKwh),
        annualSurplus:  Math.round(annualSurplus),
        annualDeficit:  Math.round(annualDeficit),
        coverageRate:   Math.round(coverageRate   * 1000) / 10,  // %
        autoconsoRate: Math.round(autoconsoRate * 1000) / 10,  // %
        savedOnBill:    Math.round(savedOnBill),
        feedinRevenue:  Math.round(feedinRevenue),
        totalAnnualGain: Math.round(totalAnnualGain),
        newAnnualBill:  Math.round(newAnnualBill),
        ROI:            Math.round(ROI * 10) / 10,
        paybackYears,
        npv25,
        lcoe,
        co2Saved:       Math.round(annualAutoconsoKwh * 0.052),
        slotLevel:      hasEnedisSlots,
        monthlyMetrics
      });
    }

    const recommended = selectOptimal(
      allCandidates,
      sizing.strategy,
      sizing.targetCoveragePct
    );

    // Expose currentBill dans recommended pour l'accès via AppAPI.getResults('sizing')
    if (recommended) recommended.currentBill = Math.round(currentBill);

    return { recommended, allCandidates, monthlyHtilt, currentBill: Math.round(currentBill), annualConso };
  }

  // ── Lecture du formulaire depuis le DOM ───────────────────────
  function readFormInput() {
    const getVal = id => parseFloat(document.getElementById(id)?.value) || 0;
    const getStr = id => document.getElementById(id)?.value || '';

    const monthlyKwh = Array.from({length:12}, (_, i) =>
      getVal(`sz-kwh-${i+1}`)
    );

    return {
      bill: {
        tariff:             getStr('sz-tariff'),
        monthlyKwh,
        monthlyKwh_hp:      (typeof AppState !== 'undefined' && AppState.monthlyKwhHp) || null,
        priceBase:          getVal('sz-price-base') || FinanceCalc.TARIFS.base.price,
        priceHpHc: {
          hp:               getVal('sz-price-hp')   || FinanceCalc.TARIFS.hphc.hp,
          hc:               getVal('sz-price-hc')   || FinanceCalc.TARIFS.hphc.hc
        },
        subscriptionPerYear: (() => { const v = parseFloat(document.getElementById('sz-subscription')?.value); return isNaN(v) ? 147 : v; })()
      },
      site: {
        tilt:            getVal('sz-tilt')        || 30,
        azimuth:         getVal('sz-azimuth')     || 0,
        maxSurfaceM2:    getVal('sz-surface'),
        panelWattPeak:   getVal('sz-panel-wp')    || 400,
        panelSurfaceM2:  getVal('sz-panel-m2')    || 1.96,
        losses:          getVal('sz-losses')      || 14,
        tech:            getStr('sz-tech')        || 'crystSi'
      },
      sizing: {
        strategy:           getStr('sz-strategy'),
        targetCoveragePct:  getVal('sz-target-coverage') || 60,
        feedinTariff:       getVal('sz-feedin')   || 0,
        systemCostPerKwp:   getVal('sz-cost-kwp') || 900,
        realTotalCost:      getVal('sz-cost-total') || 0,
        // _includeIncentive : positionné via API (AppState) ou UI si checkbox existe
        includeIncentive:   typeof AppState !== 'undefined'
                              ? (AppState._includeIncentive ?? true)
                              : true
      }
    };
  }

  // ── Export CSV des résultats ───────────────────────────────────
  function exportCSV(result) {
    const lines = ['Mois;Consommation_kWh;Production_kWh;Autoconso_kWh;Surplus_kWh;Déficit_kWh'];
    result.monthlyMetrics.forEach(m => {
      lines.push([m.name, m.conso.toFixed(0), m.prod.toFixed(1), m.autoconsoKwh.toFixed(1), m.surplus.toFixed(1), m.deficit.toFixed(1)].join(';'));
    });
    lines.push(['TOTAL', result.annualConso, result.annualProd, result.annualAutoconsoKwh, result.annualSurplus, result.annualDeficit].join(';'));
    const blob = new Blob([lines.join('\n')], {type:'text/csv'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'dimensionnement_pv.csv'; a.click();
  }

  return { run, readFormInput, exportCSV, TARIFS: FinanceCalc.TARIFS, MONTH_NAMES };
})();

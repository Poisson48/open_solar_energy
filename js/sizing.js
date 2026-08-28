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
  // Couverture = part de la conso couverte (autoconso/conso).
  // Autoconso  = part de la prod consommée sur place (autoconso/prod).
  // Sans batterie, 90 % d’autoconso ⇒ installation souvent plus petite ;
  // 90 % de couverture ⇒ installation plus grande (ou batterie).
  function selectOptimal(results, strategy, targetPct) {
    if (!results.length) return null;
    switch (strategy) {
      case 'autoconso_max': {
        const goodRatio = results.filter(r => r.autoconsoRate >= 60);
        const pool = goodRatio.length ? goodRatio : [...results];
        return pool.sort((a, b) =>
          b.annualAutoconsoKwh !== a.annualAutoconsoKwh
            ? b.annualAutoconsoKwh - a.annualAutoconsoKwh
            : a.Ppeak - b.Ppeak
        )[0];
      }

      case 'autoconso_pct': {
        // Plus grande installation qui tient encore le taux d’autoconso cible
        const target = targetPct || 90;
        const ok = results.filter(r => r.autoconsoRate >= target);
        if (ok.length) return ok[ok.length - 1];
        return results[0];
      }

      case 'roi_optimal':
        return [...results].filter(r => r.ROI < 30).sort((a, b) => a.ROI - b.ROI)[0]
          || results[0];

      case 'bill_coverage_pct': {
        const target = targetPct || 60;
        return results.find(r => r.coverageRate >= target) || results[results.length - 1];
      }

      default:
        return [...results].sort((a, b) => a.ROI - b.ROI)[0];
    }
  }

  // ── Autoconsommation slot-à-slot sans batterie (réseau) ──────────
  // pvSlotsFlat / loadSlots : Float32Array(nDays×48) — index = slot absolu
  function _calcSlotMetrics(pvSlotsFlat, Ppeak, loadSlots, daysArr) {
    const monthly = Array.from({length: 12}, (_, i) => ({
      month: i + 1, name: MONTH_NAMES[i],
      prod: 0, conso: 0, autoconsoKwh: 0, surplus: 0, deficit: 0
    }));
    let dayIdx = 0;
    const nSlots = Math.min(pvSlotsFlat.length, loadSlots.length);
    for (let m = 0; m < 12; m++) {
      const nDays = daysArr[m];
      for (let d = 0; d < nDays; d++) {
        for (let s = 0; s < 48; s++) {
          const idx = dayIdx * 48 + s;
          if (idx >= nSlots) break;
          const c = loadSlots[idx] || 0;
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

  // ── Autoconsommation minute-par-minute AVEC batterie hybride ──
  // Données sources : créneaux 30 min (Enedis / météo). Chaque créneau est
  // découpé en 30 pas d’1 minute (énergie conservée). La nuit : PV≈0, conso>0
  // → décharge batterie avant import réseau. Ombrage déjà appliqué sur pvSlotsFlat
  // (demi-heure via PvProfiles.applySiteShade), pas un simple % forfaitaire ici.
  function _calcSlotMetricsWithBattery(pvSlotsFlat, Ppeak, loadSlots, daysArr, C_usable, eta) {
    const monthly = Array.from({length: 12}, (_, i) => ({
      month: i + 1, name: MONTH_NAMES[i],
      prod: 0, conso: 0, autoconsoKwh: 0, autoconsoDirect: 0, autoconsoBatt: 0,
      surplus: 0, deficit: 0, battCharge: 0, battDischarge: 0,
      nightBattDischarge: 0, nightConso: 0
    }));
    let soc = C_usable * 0.5;
    let dayIdx = 0;
    const nSlots = Math.min(pvSlotsFlat.length, loadSlots.length);
    for (let m = 0; m < 12; m++) {
      const nDays = daysArr[m];
      for (let d = 0; d < nDays; d++) {
        for (let s = 0; s < 48; s++) {
          const idx = dayIdx * 48 + s;
          if (idx >= nSlots) break;
          const hour = Math.floor(s / 2);
          const isNight = hour < 6 || hour >= 21;
          // kWh du créneau 30 min → débit constant par minute
          const pMin = ((pvSlotsFlat[idx] || 0) * Ppeak) / 30;
          const cMin = (loadSlots[idx] || 0) / 30;
          for (let min = 0; min < 30; min++) {
            const p = pMin;
            const c = cMin;
            monthly[m].prod  += p;
            monthly[m].conso += c;
            if (isNight) monthly[m].nightConso += c;
            const direct = Math.min(p, c);
            monthly[m].autoconsoDirect += direct;
            const balance = p - c;
            if (balance >= 0) {
              const room   = Math.max(0, C_usable - soc);
              const stored = Math.min(balance * eta, room);
              soc = Math.min(C_usable, soc + stored);
              monthly[m].battCharge += stored;
              monthly[m].surplus    += Math.max(0, balance - stored / eta);
            } else {
              const needed   = -balance;
              const fromBatt = Math.min(needed, soc);
              soc -= fromBatt;
              monthly[m].battDischarge += fromBatt;
              monthly[m].autoconsoBatt += fromBatt;
              monthly[m].deficit       += needed - fromBatt;
              if (isNight) monthly[m].nightBattDischarge += fromBatt;
            }
          }
        }
        dayIdx++;
      }
    }
    monthly.forEach(mo => { mo.autoconsoKwh = mo.autoconsoDirect + mo.autoconsoBatt; });
    return monthly;
  }

  // ── Fallback mensuel avec batterie (conservé pour diagnostics / tests) ──
  // Approxime la charge/décharge à partir des moyennes prod/conso du mois
  // (même principe que simulateMonth() d'offgrid_sizing.js, réutilisé ici).
  function _calcMonthlyMetricsWithBattery(monthlyProd, monthlyConso, C_usable, eta, daysArr) {
    let soc = C_usable * 0.5;
    return monthlyProd.map((prod, i) => {
      const days        = daysArr[i] || 30;
      const conso       = monthlyConso[i] || 0;
      const e_prod_day  = prod  / days;
      const e_conso_day = conso / days;
      const sim = OffgridSizing.simulateMonth(e_prod_day, e_conso_day, C_usable, days, soc, eta);
      soc = sim.soc_end;
      const deficit      = Math.round(sim.deficit_kwh * 100) / 100;
      const surplus      = Math.round(sim.surplus_kwh * 100) / 100;
      const autoconsoKwh = Math.max(0, conso - deficit);
      return { month: i + 1, name: MONTH_NAMES[i], prod, conso, autoconsoKwh, surplus, deficit };
    });
  }

  /** Ombrage site (profil demi-heure ou forfait mensuel). */
  function _siteSurveyShade() {
    return (typeof AppState !== 'undefined') ? AppState.siteSurvey : null;
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

    if (typeof LayoutRoofs !== 'undefined') LayoutRoofs.saveActiveFromForm?.();
    const productionRoofs = typeof LayoutRoofs !== 'undefined'
      ? LayoutRoofs.getProductionRoofs()
      : [];
    const useMultiRoofProduction = productionRoofs.length > 0;

    // 1. Pré-calcul irradiation — mix multi-toiture si implantation définie (ex. 10 Sud + 5 Est)
    let monthlyHtilt = weatherData.map((m, i) =>
      SolarMath.tiltedIrradiation(m.GHI, m.DHI, lat, site.tilt, site.azimuth, i + 1)
    );
    if (useMultiRoofProduction) {
      const weighted = LayoutRoofs.weightedMonthlyHtilt(lat, weatherData, site.panelWattPeak || 400);
      if (weighted) monthlyHtilt = weighted;
    }

    // 2. Limite de puissance : objectif (libre) | toiture m² | nb fixe — sans plafond implantation
    const panelM2 = site.panelSurfaceM2 || 1.96;
    const panelWp = site.panelWattPeak || 400;
    const limitMode = site.limitMode || 'objectif';
    let nPanelsMax;
    let PpeakMax;
    let forcedNPanels = 0;

    if (limitMode === 'fixe' && site.nPanelsFixed > 0) {
      forcedNPanels = Math.floor(site.nPanelsFixed);
      nPanelsMax = forcedNPanels;
      PpeakMax = Math.min(20, (forcedNPanels * panelWp) / 1000);
    } else if (limitMode === 'surface') {
      let maxSurfaceM2 = site.maxSurfaceM2;
      if ((!maxSurfaceM2 || maxSurfaceM2 <= 0) && useMultiRoofProduction) {
        const roofSurface = LayoutRoofs.totalRoofSurfaceM2();
        if (roofSurface > 0) maxSurfaceM2 = roofSurface;
      }
      if (!maxSurfaceM2 || maxSurfaceM2 <= 0) {
        return {
          recommended: null, allCandidates: [], monthlyHtilt,
          currentBill: 0, annualConso: 0, error: 'missing_surface',
        };
      }
      nPanelsMax = Math.floor(maxSurfaceM2 / panelM2);
      PpeakMax = Math.min(20, (nPanelsMax * panelWp) / 1000);
    } else {
      PpeakMax = 20;
      nPanelsMax = Math.floor((PpeakMax * 1000) / panelWp);
    }
    if (nPanelsMax < 1 || PpeakMax < 0.5) {
      return {
        recommended: null,
        allCandidates: [],
        monthlyHtilt,
        currentBill: 0,
        annualConso: bill.monthlyKwh.reduce((s, k) => s + k, 0),
        error: limitMode === 'fixe' ? 'invalid_npanels' : 'surface_too_small',
      };
    }

    // 3. Facture actuelle
    const currentBill = FinanceCalc.calcCurrentAnnualBill(bill);
    const annualConso  = bill.monthlyKwh.reduce((s, k) => s + k, 0);

    // 4. Profils 30 min TOUJOURS — jamais de min(prod,conso) mensuel (trop optimiste)
    // Charge : Enedis réel si dispo, sinon profil résidentiel synthétique calé sur la facture
    // PV     : météo horaire réelle si dispo, sinon forme mensuelle aplatie jour/jour
    const enedis = typeof AppState !== 'undefined' ? AppState.hourlyEnedisData : null;
    const hasEnedisSlots = !!(enedis?.halfHourly?.length >= 48 * 365);
    const yearForDays = enedis?.year || (typeof AppState !== 'undefined' && AppState.enedisYear) || null;
    const daysArrYear = yearForDays ? getMonthlyDays(yearForDays) : DAYS;
    const siteShade = _siteSurveyShade();
    const hasTemporalShade = !!(siteShade?.halfHourlyKeep?.length === 12);
    const hasMonthlyShade = !!(siteShade?.monthlyLoss?.length === 12);

    // 4b. Batterie hybride (réseau + stockage) — optionnelle
    const useBattery = !!(sizing.battery?.enabled && sizing.battery.capacityKwh > 0);
    const battTech   = useBattery ? (OffgridSizing.BATTERY_TECH[sizing.battery.type] || OffgridSizing.BATTERY_TECH.lfp) : null;
    const C_usable   = useBattery ? sizing.battery.capacityKwh * battTech.dod : 0;
    const battSystemCost = useBattery
      ? sizing.battery.capacityKwh * battTech.costPerKwh + (battTech.bmsFixed || 0)
      : 0;

    const hourlyWx = typeof AppState !== 'undefined' ? AppState.hourlyWeatherData : null;
    const hasHourlyWx = !!(hourlyWx?.ghi?.length >= 24 * 365);
    let pvSource = 'monthly_shape';
    let pvProfilesPerKwc;
    const multiRoofMix = useMultiRoofProduction
      ? productionRoofs.map(r => ({
          name: r.name, nPanels: r.nPanels, tilt: r.tilt, azimuth: r.azimuth,
        }))
      : null;

    if (useMultiRoofProduction && typeof PvProfiles.buildMultiRoofProfilePerKwc === 'function') {
      pvProfilesPerKwc = PvProfiles.buildMultiRoofProfilePerKwc({
        roofs: productionRoofs,
        weatherData,
        lat,
        lon: (typeof AppState !== 'undefined' && AppState.location?.lon) || 0,
        losses: site.losses,
        tech: site.tech,
        panelWp,
        daysArr: daysArrYear,
        siteShade,
        hourlyWx: hasHourlyWx ? hourlyWx : null,
      });
      pvSource = hasHourlyWx ? 'hourly_weather_multi_roof' : 'monthly_shape_multi_roof';
    }

    if (!pvProfilesPerKwc) {
      if (hasHourlyWx) {
        pvProfilesPerKwc = SolarMath.buildYearPvSlots(
          hourlyWx, site.tilt, site.azimuth, site.losses, site.tech, lat,
          (typeof AppState !== 'undefined' && AppState.location?.lon) || 0
        );
        PvProfiles.applySiteShade(pvProfilesPerKwc, daysArrYear, siteShade);
        pvSource = 'hourly_weather';
      } else {
        const monthlyProfs = PvProfiles.buildMonthlyProfiles(
          weatherData, monthlyHtilt, site.losses, site.tilt, site.azimuth, lat, site.tech
        );
        PvProfiles.applySiteShade(monthlyProfs, null, siteShade);
        pvProfilesPerKwc = PvProfiles.flattenToYear(monthlyProfs, daysArrYear);
        pvSource = 'monthly_shape';
      }
    }

    let loadSlots;
    let loadSource;
    if (hasEnedisSlots) {
      loadSlots = enedis.halfHourly;
      loadSource = 'enedis_30min';
    } else if ((bill.dayKwhPerDay > 0 || bill.nightKwhPerDay > 0)) {
      loadSlots = PvProfiles.buildDayNightLoadYear(
        bill.monthlyKwh, bill.dayKwhPerDay || 0, bill.nightKwhPerDay || 0, yearForDays
      );
      loadSource = 'day_night';
    } else {
      loadSlots = PvProfiles.buildSyntheticLoadYear(bill.monthlyKwh, yearForDays);
      loadSource = 'synthetic_diurnal';
    }

    const shadeTag = hasTemporalShade ? '+shade_hh' : (hasMonthlyShade ? '+site_shade' : '');
    const precisionMode = `${loadSource}+${pvSource}${shadeTag}${useBattery ? '+batt_1min' : ''}`;

    // 5. Balayage de 0.5 à PpeakMax (pas 0.1 kWc)
    const allCandidates = [];
    for (let Ppeak = 0.5; Ppeak <= PpeakMax + 0.05; Ppeak = Math.round((Ppeak + 0.1) * 10) / 10) {

      // Coincidence temporelle 30 min (Enedis réel ou profil synthétique)
      const monthlyMetrics = useBattery
        ? _calcSlotMetricsWithBattery(pvProfilesPerKwc, Ppeak, loadSlots, daysArrYear, C_usable, battTech.eta)
        : _calcSlotMetrics(pvProfilesPerKwc, Ppeak, loadSlots, daysArrYear);

      // Agrégation annuelle
      const annualProd          = monthlyMetrics.reduce((s, m) => s + m.prod, 0);
      const annualAutoconsoKwh  = monthlyMetrics.reduce((s, m) => s + m.autoconsoKwh, 0);
      const annualSurplus       = monthlyMetrics.reduce((s, m) => s + m.surplus, 0);
      const annualDeficit       = monthlyMetrics.reduce((s, m) => s + m.deficit, 0);
      const annualConsoReal     = monthlyMetrics.reduce((s, m) => s + m.conso, 0);

      const coverageRate        = annualConsoReal > 0 ? annualAutoconsoKwh / annualConsoReal : 0;
      const autoconsoRate = annualProd   > 0 ? annualAutoconsoKwh / annualProd   : 0;

      // Finance
      const savedOnBill    = FinanceCalc.calcSavingsOnBill(monthlyMetrics, bill);
      const feedinRevenue  = annualSurplus * (sizing.feedinTariff || 0);
      const totalAnnualGain = savedOnBill + feedinRevenue;
      const systemCostBrut = sizing.realTotalCost > 0
        ? sizing.realTotalCost
        : Ppeak * (sizing.systemCostPerKwp || 900) + battSystemCost;
      const incentive = (() => {
        const mode = sizing.incentiveMode || 'auto';
        if (mode === 'none' || sizing.includeIncentive === false) return 0;
        if (mode === 'manual') {
          const v = Number(sizing.incentiveManual);
          return (!isNaN(v) && v >= 0) ? Math.round(v) : 0;
        }
        return FinanceCalc.calcFrenchIncentive(Ppeak);
      })();
      const systemCost     = Math.max(0, systemCostBrut - incentive);
      const ROI            = totalAnnualGain > 0 ? systemCost / totalAnnualGain : 99;
      const nPanels        = Math.ceil((Ppeak * 1000) / (site.panelWattPeak || 400));
      const surfaceNeeded  = nPanels * (site.panelSurfaceM2 || 1.96);
      const newAnnualBill  = Math.max(0, currentBill - savedOnBill);

      const finOpts = {
        elecEscalation:   sizing.elecEscalation   ?? ELEC_ESCALATION,
        discountRate:     sizing.discountRate     ?? DISCOUNT_RATE,
        panelDegradation: sizing.panelDegradation ?? PANEL_DEGRADATION,
        lifetime:         sizing.financeYears     ?? SYSTEM_LIFETIME
      };
      const paybackYears   = FinanceCalc.calcPayback(systemCost, totalAnnualGain, finOpts);
      const npv25          = Math.round(FinanceCalc.calcNPV(systemCost, totalAnnualGain, finOpts));
      const lcoe           = Math.round(FinanceCalc.calcLCOE(systemCostBrut, annualProd, finOpts) * 10000) / 10000;

      allCandidates.push({
        Ppeak: Math.round(Ppeak * 10) / 10,
        nPanels,
        surfaceNeeded: Math.round(surfaceNeeded * 10) / 10,
        systemCostBrut: Math.round(systemCostBrut),
        incentive:   Math.round(incentive),
        incentiveMode: sizing.incentiveMode || 'auto',
        incentiveAuto: Math.round(FinanceCalc.calcFrenchIncentive(Ppeak)),
        systemCost: Math.round(systemCost),
        battery: useBattery ? {
          type: sizing.battery.type,
          capacityKwh: sizing.battery.capacityKwh,
          usableKwh: Math.round(C_usable * 10) / 10,
          dod: battTech.dod,
          eta: battTech.eta,
          cost: Math.round(battSystemCost)
        } : null,
        annualProd:  Math.round(annualProd),
        annualConso: Math.round(annualConsoReal),
        annualAutoconsoKwh: Math.round(annualAutoconsoKwh),
        annualSurplus:  Math.round(annualSurplus),
        annualDeficit:  Math.round(annualDeficit),
        coverageRate:   Math.round(coverageRate   * 1000) / 10,
        autoconsoRate: Math.round(autoconsoRate * 1000) / 10,
        savedOnBill:    Math.round(savedOnBill),
        feedinRevenue:  Math.round(feedinRevenue),
        totalAnnualGain: Math.round(totalAnnualGain),
        newAnnualBill:  Math.round(newAnnualBill),
        ROI:            Math.round(ROI * 10) / 10,
        paybackYears,
        npv25,
        lcoe,
        elecEscalation:   finOpts.elecEscalation,
        discountRate:     finOpts.discountRate,
        panelDegradation: finOpts.panelDegradation,
        financeYears:     finOpts.lifetime,
        co2Saved:       Math.round(annualAutoconsoKwh * 0.052),
        slotLevel:      true,
        loadSource,
        pvSource,
        precisionMode,
        siteShadeApplied: !!(hasTemporalShade || hasMonthlyShade),
        siteShadeTemporal: hasTemporalShade,
        batteryMinuteSim: !!useBattery,
        multiRoofMix,
        monthlyMetrics
      });
    }

    let recommended = selectOptimal(
      allCandidates,
      sizing.strategy,
      sizing.targetCoveragePct
    );
    // Mode nb. fixe : forcer le candidat à ce nombre de panneaux
    if (forcedNPanels > 0 && allCandidates.length) {
      const hit = allCandidates.find(c => c.nPanels === forcedNPanels)
        || allCandidates.reduce((best, c) =>
          (!best || Math.abs(c.nPanels - forcedNPanels) < Math.abs(best.nPanels - forcedNPanels)) ? c : best, null);
      if (hit) recommended = hit;
    }

    // Expose currentBill dans recommended pour l'accès via AppAPI.getResults('sizing')
    if (recommended) recommended.currentBill = Math.round(currentBill);

    return { recommended, allCandidates, monthlyHtilt, currentBill: Math.round(currentBill), annualConso };
  }

  // ── Lecture du formulaire depuis le DOM ───────────────────────
  function readFormInput() {
    const getVal = id => parseFloat(document.getElementById(id)?.value) || 0;
    const getStr = id => document.getElementById(id)?.value || '';

    const monthlyKwhRaw = Array.from({length:12}, (_, i) =>
      getVal(`sz-kwh-${i+1}`)
    );
    const dayKwhPerDay = (() => {
      const el = document.getElementById('sz-load-day');
      if (!el || el.value === '') return 0;
      return Math.max(0, parseFloat(el.value) || 0);
    })();
    const nightKwhPerDay = (() => {
      const el = document.getElementById('sz-load-night');
      if (!el || el.value === '') return 0;
      return Math.max(0, parseFloat(el.value) || 0);
    })();
    const dailyTyp = dayKwhPerDay + nightKwhPerDay;
    const daysArrBill = (typeof DAYS_IN_MONTH !== 'undefined') ? DAYS_IN_MONTH : [31,28,31,30,31,30,31,31,30,31,30,31];
    const hasMonthly = monthlyKwhRaw.some(v => v > 0);
    const monthlyKwh = hasMonthly
      ? monthlyKwhRaw
      : (dailyTyp > 0
          ? daysArrBill.map(d => dailyTyp * d)
          : monthlyKwhRaw);

    return {
      bill: {
        tariff:             getStr('sz-tariff'),
        monthlyKwh,
        dayKwhPerDay,
        nightKwhPerDay,
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
        limitMode:       getStr('sz-limit-mode') || 'objectif',
        nPanelsFixed:    getVal('sz-npanels-fixe'),
        roofLengthM:     getVal('sz-roof-length'),
        roofWidthM:      getVal('sz-roof-width'),
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
        elecEscalation: (() => {
          const el = document.getElementById('sz-elec-escalation');
          const pct = parseFloat(el?.value);
          if (el == null || el.value === '' || isNaN(pct)) return ELEC_ESCALATION;
          return Math.max(0, Math.min(0.20, pct / 100));
        })(),
        discountRate: (() => {
          const el = document.getElementById('sz-discount-rate');
          const pct = parseFloat(el?.value);
          if (el == null || el.value === '' || isNaN(pct)) return DISCOUNT_RATE;
          return Math.max(0, Math.min(0.20, pct / 100));
        })(),
        panelDegradation: (() => {
          const el = document.getElementById('sz-panel-degradation');
          const pct = parseFloat(el?.value);
          if (el == null || el.value === '' || isNaN(pct)) return PANEL_DEGRADATION;
          return Math.max(0, Math.min(0.05, pct / 100));
        })(),
        financeYears: (() => {
          const el = document.getElementById('sz-finance-years');
          const y = parseInt(el?.value, 10);
          if (el == null || el.value === '' || isNaN(y)) return SYSTEM_LIFETIME;
          return Math.max(5, Math.min(40, y));
        })(),
        // _includeIncentive : positionné via API (AppState) ou UI si checkbox existe
        includeIncentive:   typeof AppState !== 'undefined'
                              ? (AppState._includeIncentive ?? true)
                              : true,
        incentiveMode: (() => {
          const m = getStr('sz-incentive-mode') || 'auto';
          if (m === 'none') {
            if (typeof AppState !== 'undefined') AppState._includeIncentive = false;
            return 'none';
          }
          if (typeof AppState !== 'undefined') AppState._includeIncentive = true;
          return (m === 'manual') ? 'manual' : 'auto';
        })(),
        incentiveManual: (() => {
          const el = document.getElementById('sz-incentive');
          if (!el || el.value === '') return null;
          const v = parseFloat(el.value);
          return isNaN(v) ? null : Math.max(0, v);
        })(),
        // Batterie hybride (réseau + stockage) — active seulement en mode 'hybrid'
        battery: {
          enabled:      (typeof AppState !== 'undefined' && AppState.installationType === 'hybrid'),
          type:         getStr('sz-batt-tech') || 'lfp',
          capacityKwh:  getVal('sz-batt-kwh') || 0
        }
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

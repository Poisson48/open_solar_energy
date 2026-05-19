/**
 * sizing.js — Moteur de dimensionnement PV depuis facture EDF
 *
 * Logique : l'utilisateur saisit sa consommation réelle, le logiciel
 * calcule le kWp optimal par balayage discret (0.1 kWc de pas).
 *
 * Entrée  → SizingEngine.run(input, weatherData, lat)
 * Sortie  → { recommended, allCandidates, monthlyHtilt }
 */

const SizingEngine = (() => {

  // ── Tarifs EDF 2024 (défauts) ──────────────────────────────────
  const TARIFS = {
    base: { price: 0.2516 },
    hphc: { hp: 0.2460, hc: 0.1860 }
  };

  // DAYS_IN_MONTH et MONTH_NAMES définis dans constants.js
  const DAYS = DAYS_IN_MONTH;

  // ── Calcul des économies selon le tarif ───────────────────────
  function calcSavingsOnBill(monthlyMetrics, bill) {
    if (bill.tariff === 'base') {
      return monthlyMetrics.reduce((sum, m) => sum + m.autoconsoKwh * bill.priceBase, 0);
    }
    // HP/HC : PV produit pendant la journée (heures pleines) → économies au tarif HP
    const hp = bill.priceHpHc?.hp ?? TARIFS.hphc.hp;
    return monthlyMetrics.reduce((sum, m) => sum + m.autoconsoKwh * hp, 0);
  }

  // ── Calcul de la facture annuelle actuelle ─────────────────────
  function calcCurrentAnnualBill(bill) {
    let total = bill.subscriptionPerYear || 0;
    if (bill.tariff === 'base') {
      total += bill.monthlyKwh.reduce((s, k) => s + k * bill.priceBase, 0);
    } else {
      bill.monthlyKwh.forEach((kwh, i) => {
        if (kwh <= 0) return;
        const hpRatio = (bill.monthlyKwh_hp && kwh > 0)
          ? Math.min(1, Math.max(0, bill.monthlyKwh_hp[i] / kwh))
          : 0.65;
        const hp = bill.priceHpHc?.hp ?? TARIFS.hphc.hp;
        const hc = bill.priceHpHc?.hc ?? TARIFS.hphc.hc;
        total += kwh * hpRatio * hp + kwh * (1 - hpRatio) * hc;
      });
    }
    return total;
  }

  // ── Helpers financiers ────────────────────────────────────────
  // Constantes définies dans constants.js : PANEL_DEGRADATION, ELEC_ESCALATION,
  // DISCOUNT_RATE, SYSTEM_LIFETIME

  /**
   * Payback actualisé (années) avec dégradation panneaux + hausse prix électricité.
   * Résultat < ROI simple car les gains augmentent avec l'électricité.
   */
  function calcPayback(systemCost, firstYearGain) {
    if (firstYearGain <= 0 || systemCost <= 0) return null;
    let cum = 0;
    for (let y = 1; y <= 40; y++) {
      cum += firstYearGain
           * Math.pow(1 + ELEC_ESCALATION,   y - 1)
           * Math.pow(1 - PANEL_DEGRADATION, y - 1);
      if (cum >= systemCost) return y;
    }
    return null;
  }

  /**
   * Valeur Actuelle Nette (€) sur SYSTEM_LIFETIME ans.
   * VAN > 0 → investissement rentable au taux d'actualisation DISCOUNT_RATE.
   */
  function calcNPV(systemCost, firstYearGain) {
    if (systemCost <= 0) return 0;
    if (firstYearGain <= 0) return -systemCost;
    let npv = -systemCost;
    for (let y = 1; y <= SYSTEM_LIFETIME; y++) {
      const gain = firstYearGain
                 * Math.pow(1 + ELEC_ESCALATION,   y - 1)
                 * Math.pow(1 - PANEL_DEGRADATION, y - 1);
      npv += gain / Math.pow(1 + DISCOUNT_RATE, y);
    }
    return npv;
  }

  /**
   * LCOE (€/kWh) avec dégradation + maintenance annuelle + remplacement onduleur.
   * O&M ≈ 0.5 %/an du coût install, onduleur remplacé à 15 ans (~300 €/kWc).
   */
  function calcLCOE(systemCost, annualProd) {
    if (annualProd <= 0 || systemCost <= 0) return 0;
    const omRate       = 0.005; // 0.5 %/an
    const inverterRepl = systemCost * 0.12; // ~12 % du coût (onduleur) remplacé à 15 ans
    let cumProd = 0, cumCost = systemCost;
    for (let y = 1; y <= SYSTEM_LIFETIME; y++) {
      cumProd += annualProd * Math.pow(1 - PANEL_DEGRADATION, y - 1);
      cumCost += systemCost * omRate;
      if (y === 15) cumCost += inverterRepl;
    }
    return cumCost / cumProd;
  }

  /**
   * Prime à l'autoconsommation solaire (France — décret 2021-1444).
   * Varie chaque trimestre — vérifier l'arrêté en vigueur sur energie.gouv.fr
   * Valeurs indicatives 2025 (à vérifier sur energie.gouv.fr chaque trimestre) :
   *   ≤ 3 kWc  : 300 €/kWc  |  ≤ 9 kWc : 230 €/kWc
   *   ≤ 36 kWc : 100 €/kWc  |  ≤ 100 kWc : 60 €/kWc
   */
  function calcFrenchIncentive(Ppeak) {
    if (Ppeak <= 0)   return 0;
    if (Ppeak <= 3)   return Math.round(Ppeak * 300);
    if (Ppeak <= 9)   return Math.round(Ppeak * 230);
    if (Ppeak <= 36)  return Math.round(Ppeak * 100);
    if (Ppeak <= 100) return Math.round(Ppeak * 60);
    return 0;
  }

  // ── Sélection de l'optimal selon la stratégie ─────────────────
  function selectOptimal(results, strategy, targetCoveragePct) {
    if (!results.length) return null;
    switch (strategy) {
      case 'autoconso_max': {
        // Max autoconso en évitant les installations où > 40% part au réseau
        const goodRatio = results.filter(r => r.autoconsoRate >= 60);
        const pool = goodRatio.length ? goodRatio : results;
        return pool.sort((a, b) =>
          b.annualAutoconsoKwh !== a.annualAutoconsoKwh
            ? b.annualAutoconsoKwh - a.annualAutoconsoKwh
            : a.Ppeak - b.Ppeak  // à égalité d'autoconso, préférer le plus petit système
        )[0];
      }

      case 'roi_optimal':
        return results.filter(r => r.ROI < 30).sort((a, b) => a.ROI - b.ROI)[0]
          || results[0];

      case 'bill_coverage_pct': {
        const target = targetCoveragePct || 60;
        return results.find(r => r.coverageRate >= target) || results[results.length - 1];
      }

      default:
        return results.sort((a, b) => a.ROI - b.ROI)[0];
    }
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
    const currentBill = calcCurrentAnnualBill(bill);
    const annualConso  = bill.monthlyKwh.reduce((s, k) => s + k, 0);

    // 4. Balayage de 0.5 à PpeakMax (pas 0.1 kWc)
    const allCandidates = [];
    for (let Ppeak = 0.5; Ppeak <= PpeakMax + 0.05; Ppeak = Math.round((Ppeak + 0.1) * 10) / 10) {

      // Production mensuelle (lat transmis pour correction thermique exacte)
      const monthlyProd = monthlyHtilt.map((Htilt, i) =>
        SolarMath.pvProduction(Htilt, Ppeak, site.losses, weatherData[i].T_avg, site.tech, i + 1, lat)
      );

      // Métriques mensuelles
      const monthlyMetrics = monthlyProd.map((prod, i) => {
        const conso       = bill.monthlyKwh[i];
        const autoconsoKwh = Math.min(prod, conso);
        const surplus      = Math.max(0, prod - conso);
        const deficit      = Math.max(0, conso - prod);
        return { month: i+1, name: MONTH_NAMES[i], prod, conso, autoconsoKwh, surplus, deficit };
      });

      // Agrégation annuelle
      const annualProd          = monthlyMetrics.reduce((s, m) => s + m.prod, 0);
      const annualAutoconsoKwh  = monthlyMetrics.reduce((s, m) => s + m.autoconsoKwh, 0);
      const annualSurplus       = monthlyMetrics.reduce((s, m) => s + m.surplus, 0);
      const annualDeficit       = monthlyMetrics.reduce((s, m) => s + m.deficit, 0);

      const coverageRate        = annualConso  > 0 ? annualAutoconsoKwh / annualConso  : 0;
      const autoconsoRate = annualProd   > 0 ? annualAutoconsoKwh / annualProd   : 0;

      // Finance
      const savedOnBill    = calcSavingsOnBill(monthlyMetrics, bill);
      const feedinRevenue  = annualSurplus * (sizing.feedinTariff || 0);
      const totalAnnualGain = savedOnBill + feedinRevenue;
      const systemCostBrut = sizing.realTotalCost > 0
        ? sizing.realTotalCost
        : Ppeak * (sizing.systemCostPerKwp || 900);
      // Prime autoconso France (réduit le coût net pour rentabilité)
      const incentive      = sizing.includeIncentive !== false ? calcFrenchIncentive(Ppeak) : 0;
      const systemCost     = Math.max(0, systemCostBrut - incentive);
      const ROI            = totalAnnualGain > 0 ? systemCost / totalAnnualGain : 99;
      const nPanels        = Math.ceil((Ppeak * 1000) / (site.panelWattPeak || 400));
      const surfaceNeeded  = nPanels * (site.panelSurfaceM2 || 1.96);
      const newAnnualBill  = Math.max(0, currentBill - savedOnBill);

      // Métriques financières avancées (sur coût net après prime)
      const paybackYears   = calcPayback(systemCost, totalAnnualGain);
      const npv25          = Math.round(calcNPV(systemCost, totalAnnualGain));
      const lcoe           = Math.round(calcLCOE(systemCostBrut, annualProd) * 10000) / 10000;

      allCandidates.push({
        Ppeak: Math.round(Ppeak * 10) / 10,
        nPanels,
        surfaceNeeded: Math.round(surfaceNeeded * 10) / 10,
        systemCostBrut: Math.round(systemCostBrut),
        incentive:   Math.round(incentive),
        systemCost: Math.round(systemCost),
        annualProd:  Math.round(annualProd),
        annualConso,
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
        monthlyMetrics
      });
    }

    const recommended = selectOptimal(
      allCandidates,
      sizing.strategy,
      sizing.targetCoveragePct
    );

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
        priceBase:          getVal('sz-price-base') || TARIFS.base.price,
        priceHpHc: {
          hp:               getVal('sz-price-hp')   || TARIFS.hphc.hp,
          hc:               getVal('sz-price-hc')   || TARIFS.hphc.hc
        },
        subscriptionPerYear: getVal('sz-subscription') || 147
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
        realTotalCost:      getVal('sz-cost-total') || 0
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

  return { run, readFormInput, exportCSV, TARIFS, MONTH_NAMES };
})();

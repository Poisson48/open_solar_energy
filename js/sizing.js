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

  const DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
  const MONTH_NAMES = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

  // ── Calcul des économies selon le tarif ───────────────────────
  function calcSavingsOnBill(monthlyMetrics, bill) {
    if (bill.tariff === 'base') {
      return monthlyMetrics.reduce((sum, m) => sum + m.autoconsoKwh * bill.priceBase, 0);
    }
    // HP/HC : les panneaux produisent surtout en heures pleines (journée)
    return monthlyMetrics.reduce((sum, m, i) => {
      const total = bill.monthlyKwh[i] || 1;
      const hpRatio = bill.monthlyKwh_hp ? (bill.monthlyKwh_hp[i] / total) : 0.65;
      const autoHp = m.autoconsoKwh * hpRatio;
      const autoHc = m.autoconsoKwh * (1 - hpRatio);
      const hp = bill.priceHpHc?.hp ?? TARIFS.hphc.hp;
      const hc = bill.priceHpHc?.hc ?? TARIFS.hphc.hc;
      return sum + autoHp * hp + autoHc * hc;
    }, 0);
  }

  // ── Calcul de la facture annuelle actuelle ─────────────────────
  function calcCurrentAnnualBill(bill) {
    let total = bill.subscriptionPerYear || 0;
    if (bill.tariff === 'base') {
      total += bill.monthlyKwh.reduce((s, k) => s + k * bill.priceBase, 0);
    } else {
      bill.monthlyKwh.forEach((kwh, i) => {
        const hpRatio = bill.monthlyKwh_hp ? (bill.monthlyKwh_hp[i] / kwh) : 0.65;
        const hp = bill.priceHpHc?.hp ?? TARIFS.hphc.hp;
        const hc = bill.priceHpHc?.hc ?? TARIFS.hphc.hc;
        total += kwh * hpRatio * hp + kwh * (1 - hpRatio) * hc;
      });
    }
    return total;
  }

  // ── Sélection de l'optimal selon la stratégie ─────────────────
  function selectOptimal(results, strategy, targetCoveragePct) {
    if (!results.length) return null;
    switch (strategy) {
      case 'autoconso_max':
        // Max autoconso en évitant les installations où > 40% part au réseau
        const goodRatio = results.filter(r => r.selfSufficiencyRate >= 0.60);
        if (goodRatio.length)
          return goodRatio.sort((a, b) => b.annualAutoconsoKwh - a.annualAutoconsoKwh)[0];
        return results.sort((a, b) => b.annualAutoconsoKwh - a.annualAutoconsoKwh)[0];

      case 'roi_optimal':
        return results.filter(r => r.ROI < 30).sort((a, b) => a.ROI - b.ROI)[0]
          || results[0];

      case 'bill_coverage_pct':
        const target = (targetCoveragePct || 60) / 100;
        return results.find(r => r.coverageRate >= target) || results[results.length - 1];

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

      // Production mensuelle
      const monthlyProd = monthlyHtilt.map((Htilt, i) =>
        SolarMath.pvProduction(Htilt, Ppeak, site.losses, weatherData[i].T_avg, site.tech, i + 1)
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
      const selfSufficiencyRate = annualProd   > 0 ? annualAutoconsoKwh / annualProd   : 0;

      // Finance
      const savedOnBill    = calcSavingsOnBill(monthlyMetrics, bill);
      const feedinRevenue  = annualSurplus * (sizing.feedinTariff || 0);
      const totalAnnualGain = savedOnBill + feedinRevenue;
      const systemCost     = Ppeak * (sizing.systemCostPerKwp || 1200);
      const ROI            = totalAnnualGain > 0 ? systemCost / totalAnnualGain : 99;
      const nPanels        = Math.ceil((Ppeak * 1000) / (site.panelWattPeak || 400));
      const surfaceNeeded  = nPanels * (site.panelSurfaceM2 || 1.96);
      const newAnnualBill  = currentBill - savedOnBill;

      allCandidates.push({
        Ppeak: Math.round(Ppeak * 10) / 10,
        nPanels,
        surfaceNeeded: Math.round(surfaceNeeded * 10) / 10,
        systemCost: Math.round(systemCost),
        annualProd:  Math.round(annualProd),
        annualConso,
        annualAutoconsoKwh: Math.round(annualAutoconsoKwh),
        annualSurplus:  Math.round(annualSurplus),
        annualDeficit:  Math.round(annualDeficit),
        coverageRate:   Math.round(coverageRate   * 1000) / 10,  // %
        selfSufficiencyRate: Math.round(selfSufficiencyRate * 1000) / 10,  // %
        savedOnBill:    Math.round(savedOnBill),
        feedinRevenue:  Math.round(feedinRevenue),
        totalAnnualGain: Math.round(totalAnnualGain),
        newAnnualBill:  Math.round(newAnnualBill),
        ROI:            Math.round(ROI * 10) / 10,
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
        maxSurfaceM2:    getVal('sz-surface')     || 20,
        panelWattPeak:   getVal('sz-panel-wp')    || 400,
        panelSurfaceM2:  getVal('sz-panel-m2')    || 1.96,
        losses:          getVal('sz-losses')      || 14,
        tech:            getStr('sz-tech')        || 'crystSi'
      },
      sizing: {
        strategy:           getStr('sz-strategy'),
        targetCoveragePct:  getVal('sz-target-coverage') || 60,
        feedinTariff:       getVal('sz-feedin')   || 0,
        systemCostPerKwp:   getVal('sz-cost-kwp') || 900
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

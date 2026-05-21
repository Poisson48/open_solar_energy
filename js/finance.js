/**
 * finance.js - Calculs financiers liés au système PV
 *
 * Contient : tarifs EDF, calcul facture, économies, payback actualisé,
 * VAN, LCOE et prime autoconsommation France.
 *
 * Dépendances globales (constants.js) :
 *   ELEC_ESCALATION, PANEL_DEGRADATION, DISCOUNT_RATE, SYSTEM_LIFETIME
 */

const FinanceCalc = (() => {

  // ── Tarifs EDF 2024 (défauts) ──────────────────────────────────
  const TARIFS = {
    base: { price: 0.2516 },
    hphc: { hp: 0.2460, hc: 0.1860 }
  };

  // ── Calcul de la facture annuelle actuelle ─────────────────────
  function calcCurrentAnnualBill(bill) {
    let total = bill.subscriptionPerYear || 0;
    if (bill.tariff === 'base') {
      total += bill.monthlyKwh.reduce((s, k) => s + k * bill.priceBase, 0);
    } else {
      bill.monthlyKwh.forEach((kwh, i) => {
        if (kwh <= 0) return;
        // Fallback 65% HP seulement si aucune donnée HP/HC Enedis disponible.
        // Quand monthlyKwh_hp[i]=0 (toute consommation en HC), ne pas utiliser 0.65.
        const hpRatio = bill.monthlyKwh_hp != null
          ? Math.min(1, Math.max(0, (bill.monthlyKwh_hp[i] ?? 0) / kwh))
          : 0.65;
        const hp = bill.priceHpHc?.hp ?? TARIFS.hphc.hp;
        const hc = bill.priceHpHc?.hc ?? TARIFS.hphc.hc;
        total += kwh * hpRatio * hp + kwh * (1 - hpRatio) * hc;
      });
    }
    return total;
  }

  // ── Calcul des économies selon le tarif ───────────────────────
  function calcSavingsOnBill(monthlyMetrics, bill) {
    if (bill.tariff === 'base') {
      return monthlyMetrics.reduce((sum, m) => sum + m.autoconsoKwh * bill.priceBase, 0);
    }
    // HP/HC : PV produit pendant la journée (heures pleines) → économies au tarif HP
    const hp = bill.priceHpHc?.hp ?? TARIFS.hphc.hp;
    return monthlyMetrics.reduce((sum, m) => sum + m.autoconsoKwh * hp, 0);
  }

  // ── Helpers financiers ────────────────────────────────────────
  // Constantes définies dans constants.js : PANEL_DEGRADATION, ELEC_ESCALATION,
  // DISCOUNT_RATE, SYSTEM_LIFETIME

  /**
   * Payback actualisé (DCF, années) — flux nets actualisés au DISCOUNT_RATE.
   * Inclut dégradation panneaux, hausse prix électricité, O&M, remplacement onduleur.
   */
  function calcPayback(systemCost, firstYearGain) {
    if (firstYearGain <= 0 || systemCost <= 0) return null;
    const omCost      = systemCost * 0.005;
    const inverterRpl = systemCost * 0.12;
    let cum = 0;
    for (let y = 1; y <= 40; y++) {
      const gain = firstYearGain
                 * Math.pow(1 + ELEC_ESCALATION,   y - 1)
                 * Math.pow(1 - PANEL_DEGRADATION, y - 1);
      const netGain = gain - omCost - (y === 15 ? inverterRpl : 0);
      cum += netGain / Math.pow(1 + DISCOUNT_RATE, y);
      if (cum >= systemCost) return y;
    }
    return null;
  }

  /**
   * Valeur Actuelle Nette (€) sur SYSTEM_LIFETIME ans.
   * VAN > 0 → investissement rentable au taux d'actualisation DISCOUNT_RATE.
   * Inclut O&M (0,5 %/an) et remplacement onduleur (12 % à 15 ans) - cohérent avec LCOE.
   */
  function calcNPV(systemCost, firstYearGain) {
    if (systemCost <= 0) return 0;
    if (firstYearGain <= 0) return -systemCost;
    const omCost      = systemCost * 0.005;
    const inverterRpl = systemCost * 0.12;
    let npv = -systemCost;
    for (let y = 1; y <= SYSTEM_LIFETIME; y++) {
      const gain = firstYearGain
                 * Math.pow(1 + ELEC_ESCALATION,   y - 1)
                 * Math.pow(1 - PANEL_DEGRADATION, y - 1);
      const netGain = gain - omCost - (y === 15 ? inverterRpl : 0);
      npv += netGain / Math.pow(1 + DISCOUNT_RATE, y);
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
   * Prime à l'autoconsommation solaire (France - décret 2021-1444).
   * Varie chaque trimestre - vérifier l'arrêté en vigueur sur energie.gouv.fr
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

  return { TARIFS, calcCurrentAnnualBill, calcSavingsOnBill, calcPayback, calcNPV, calcLCOE, calcFrenchIncentive };
})();

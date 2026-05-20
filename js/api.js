/**
 * api.js — API de pilotage pour tester l'app depuis la console ou des scripts
 *
 * Usage basique :
 *   AppAPI.setSizing({ monthlyKwh: [300,280,...], surface: 20 }).calc('sizing')
 *   AppAPI.runScenario({ install: { tilt:30 }, sizing: { ... }, tab: 'sizing' })
 *
 * Toutes les méthodes sauf calc() sont chainables (retournent AppAPI).
 * calc() retourne directement les résultats.
 */

const AppAPI = (() => {

  // ── Helpers ──────────────────────────────────────────────────

  function setField(id, value) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // ── Navigation ───────────────────────────────────────────────

  function goTo(tab) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (btn) btn.click();
    return AppAPI;
  }

  // ── Paramètres partagés (tilt, azimuth, surface, panneaux) ───

  function setInstall(params = {}) {
    const fieldMap = {
      tilt:    ['sz-tilt',     'inp-tilt',     'og2-tilt'    ],
      azimuth: ['sz-azimuth',  'inp-azimuth',  'og2-azimuth' ],
      surface: ['sz-surface',  'inp-surface',  'og2-surface'  ],
      panelWp: ['sz-panel-wp', 'inp-panel-wp', 'og2-panel-wp'],
      panelM2: ['sz-panel-m2', 'inp-panel-m2', 'og2-panel-m2'],
      losses:  ['sz-losses',   'inp-losses',   'og2-losses'  ],
      tech:    ['sz-tech',     'sel-tech'                    ],
    };
    for (const [key, ids] of Object.entries(fieldMap)) {
      if (params[key] === undefined) continue;
      ids.forEach(id => setField(id, params[key]));
      AppState.install[key] = params[key];
    }
    return AppAPI;
  }

  // ── Paramètres onglet Dimensionnement (EDF) ──────────────────

  function setSizing(params = {}) {
    if (params.tariff            !== undefined) setField('sz-tariff',          params.tariff);
    if (params.priceBase         !== undefined) setField('sz-price-base',      params.priceBase);
    if (params.priceHp           !== undefined) setField('sz-price-hp',        params.priceHp);
    if (params.priceHc           !== undefined) setField('sz-price-hc',        params.priceHc);
    if (params.subscription      !== undefined) setField('sz-subscription',    params.subscription);
    if (params.costKwp           !== undefined) setField('sz-cost-kwp',        params.costKwp);
    if (params.costTotal         !== undefined) setField('sz-cost-total',      params.costTotal);
    if (params.strategy          !== undefined) setField('sz-strategy',        params.strategy);
    if (params.targetCoverage    !== undefined) setField('sz-target-coverage', params.targetCoverage);
    if (params.feedin            !== undefined) setField('sz-feedin',          params.feedin);
    if (params.surface           !== undefined) setField('sz-surface',         params.surface);
    if (params.tech              !== undefined) {
      setField('sz-tech', params.tech);
      AppState.install.tech = params.tech;  // synchronise le module horaire qui lit AppState.install.tech
    }
    if (params.monthlyKwh) {
      params.monthlyKwh.forEach((v, i) => setField(`sz-kwh-${i + 1}`, v));
    }
    // HP/HC mensuel réel (ex: importé depuis Enedis)
    if (params.monthlyKwhHp) {
      AppState.monthlyKwhHp = params.monthlyKwhHp.slice();
    }
    // Prime autoconso : true (défaut) = inclure, false = désactiver
    // Toujours réinitialiser pour éviter un état persistant entre appels API
    AppState._includeIncentive = params.includeIncentive !== undefined ? params.includeIncentive : true;
    return AppAPI;
  }

  // ── Paramètres onglet Hors-réseau ────────────────────────────

  function setOffgrid(params = {}) {
    if (params.dailyDefault   !== undefined) setField('og2-daily-default',    params.dailyDefault);
    if (params.battTech       !== undefined) setField('og2-batt-tech',         params.battTech);
    if (params.targetCoverage !== undefined) setField('og2-target-coverage',   params.targetCoverage);
    if (params.pvCostKwp      !== undefined) setField('og2-pv-cost-kwp',       params.pvCostKwp);
    if (params.surface        !== undefined) setField('og2-surface',           params.surface);
    if (params.dailyByMonth) {
      params.dailyByMonth.forEach((v, i) => setField(`og2-day-${i + 1}`, v));
    }
    // bosCost : passer 0 pour désactiver (champ vide → défaut 500€)
    if (params.bosCost !== undefined) {
      const el = document.getElementById('og2-bos-cost');
      if (el) {
        el.value = params.bosCost === null ? '' : params.bosCost;
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    // nPanelsFixed : active le mode "nombre de panneaux fixe"
    if (params.nPanelsFixed !== undefined) {
      const btn = document.getElementById('og2-pmode-fixe');
      if (btn && !btn.classList.contains('active')) btn.click();
      setField('og2-npanels-fixe', params.nPanelsFixed);
    }
    return AppAPI;
  }

  // ── Localisation ─────────────────────────────────────────────

  function setLocation(lat, lon, name = '') {
    AppState.location.lat  = lat;
    AppState.location.lon  = lon;
    if (name) AppState.location.name = name;
    const latEl = document.getElementById('inp-lat');
    const lonEl = document.getElementById('inp-lon');
    if (latEl) setField('inp-lat', lat);
    if (lonEl) setField('inp-lon', lon);
    return AppAPI;
  }

  // ── Calcul ───────────────────────────────────────────────────

  const CALC_FNS = {
    sizing:  () => calcSizing(),
    grid:    () => calcGridSystem(),
    offgrid: () => calcOffgridSizing(),
  };

  const RESULT_KEYS = {
    sizing:  () => AppState.lastSizingResult,
    grid:    () => AppState.lastGridResult,
    offgrid: () => AppState.lastOffgridSizingResult,
  };

  function calc(tab) {
    const fn = CALC_FNS[tab];
    if (!fn) throw new Error(`Onglet inconnu : "${tab}". Valeurs : sizing, grid, offgrid`);
    fn();
    return getResults(tab);
  }

  function getResults(tab) {
    const getter = RESULT_KEYS[tab];
    if (!getter) return null;
    return getter();
  }

  // ── Scénario complet ─────────────────────────────────────────

  /**
   * Applique tous les paramètres et lance le calcul en une seule appel.
   * @param {object} config
   * @param {object} [config.install]  — paramètres partagés (tilt, azimuth, surface…)
   * @param {object} [config.sizing]   — paramètres onglet Dimensionnement
   * @param {object} [config.offgrid]  — paramètres onglet Hors-réseau
   * @param {string} [config.tab]      — 'sizing' | 'grid' | 'offgrid'
   * @returns résultats AppState
   */
  function runScenario({ install, sizing, offgrid, tab = 'sizing' } = {}) {
    if (install) setInstall(install);
    if (sizing)  setSizing(sizing);
    if (offgrid) setOffgrid(offgrid);
    goTo(tab);
    return calc(tab);
  }

  // ── Introspection ────────────────────────────────────────────

  function state() {
    return {
      location:  AppState.location,
      install:   AppState.install,
      activeTab: AppState.activeTab,
      results: {
        sizing:  AppState.lastSizingResult,
        grid:    AppState.lastGridResult,
        offgrid: AppState.lastOffgridSizingResult,
      }
    };
  }

  // ── Help ─────────────────────────────────────────────────────

  function help() {
    console.log(`
AppAPI — pilotage de l'app Open Solar Energy
─────────────────────────────────────────────
AppAPI.goTo('sizing'|'grid'|'offgrid'|...)   → navigation tab

AppAPI.setInstall({ tilt, azimuth, surface, panelWp, panelM2, losses })
  → Paramètres partagés entre tous les onglets

AppAPI.setSizing({
  monthlyKwh:[...12],          // kWh/mois
  monthlyKwhHp:[...12],        // kWh HP/mois (optionnel, Enedis HP/HC)
  tariff,                      // 'base' | 'hphc'
  priceBase, priceHp, priceHc, // €/kWh
  subscription,                // abonnement €/an
  costKwp,                     // €/kWc (coût installation)
  costTotal,                   // coût total fixe (écrase costKwp×Ppeak)
  strategy,                    // 'bill_coverage_pct' | 'autoconso_max' | 'roi_optimal'
  targetCoverage,              // % couverture cible (bill_coverage_pct)
  feedin,                      // tarif rachat €/kWh (0 = pas de rachat)
  surface,                     // m² disponibles
  tech,                        // 'crystSi' | 'CIS' | 'CdTe'
  includeIncentive,            // true (défaut) | false — prime autoconso France
})

AppAPI.setOffgrid({
  dailyDefault,                // Wh/j (uniforme sur 12 mois)
  dailyByMonth:[...12],        // Wh/j par mois
  battTech,                    // 'lfp' | 'lfp_diy' | 'agm' | 'nmc_leaf' | 'nmc_zoe' | 'nmc_tesla'
  targetCoverage,              // % autonomie cible (90 = défaut)
  pvCostKwp,                   // €/kWc panneaux (650 = défaut)
  bosCost,                     // €HT câblage/support — null/omis → 500€, 0 → pas de BOS
  nPanelsFixed,                // nombre de panneaux fixé (désactive la recherche)
  surface,                     // m² disponibles
})

AppAPI.setLocation(lat, lon, name?)
AppAPI.calc('sizing'|'grid'|'offgrid')       → résultats
AppAPI.getResults('sizing'|'grid'|'offgrid') → résultats sans recalculer
AppAPI.runScenario({ install, sizing, offgrid, tab }) → one-shot
AppAPI.state()                               → snapshot AppState

Résultats sizing  : Ppeak, nPanels, surfaceNeeded, annualProd, coverageRate (%), savedOnBill,
                    feedinRevenue, totalAnnualGain, newAnnualBill, currentBill, paybackYears,
                    npv25, lcoe, incentive, systemCost, systemCostBrut, ROI, co2Saved
Résultats offgrid : Ppeak, C_batt_gross, C_usable, coverageRate (%), systemCost, deficit_days,
                    autonomyDays, total_conso, total_deficit, costPV, costBatt, battLifeYears

Exemple :
  const r = AppAPI
    .setInstall({ tilt: 30, azimuth: 0, surface: 25 })
    .setSizing({
      monthlyKwh: [350,300,280,250,240,230,240,250,270,310,340,360],
      strategy: 'bill_coverage_pct', targetCoverage: 80,
      includeIncentive: false
    })
    .calc('sizing');
  console.table(r);
`);
  }

  return { goTo, setInstall, setSizing, setOffgrid, setLocation, calc, getResults, runScenario, state, help };
})();

window.AppAPI = AppAPI;

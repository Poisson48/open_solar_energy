/**
 * api.js - API de pilotage pour tester l'app depuis la console ou des scripts
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
    // null explicite = réinitialiser, undefined = ne pas toucher
    if (params.monthlyKwhHp !== undefined) {
      AppState.monthlyKwhHp = Array.isArray(params.monthlyKwhHp) ? params.monthlyKwhHp.slice() : null;
    } else if (params.monthlyKwh) {
      // Nouvelle conso mensuelle sans split HP/HC → effacer l'ancien split
      AppState.monthlyKwhHp = null;
    }
    // Prime autoconso : si non précisé, ne PAS toucher l'état existant
    if (params.includeIncentive !== undefined) {
      AppState._includeIncentive = params.includeIncentive;
    }
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

  // ── Données météo ─────────────────────────────────────────────

  /**
   * Injecte les données météo directement (utile pour les tests).
   * @param {Array} data  12 objets { GHI, DHI, T_avg, name? } en kWh/m²/mois
   */
  function setWeatherData(data) {
    AppState.weatherData = data;
    return AppAPI;
  }

  /**
   * Injecte des données Enedis sans passer par le parser CSV.
   * @param {object} config
   * @param {number[]}      [config.monthlyKwh]   kWh/mois (12 valeurs) - remplit sz-kwh-*
   * @param {number[]|Float32Array} [config.halfHourly] kWh/slot 30min (n×48 valeurs) - simulation batterie
   * @param {number[]}      [config.monthlyKwhHp]  kWh HP/mois (optionnel, tarif HP/HC)
   * @param {number}        [config.year]          année des données (défaut 2023)
   */
  function setEnedisData({ monthlyKwh, halfHourly, monthlyKwhHp, year = 2023 } = {}) {
    if (monthlyKwh) {
      monthlyKwh.forEach((v, i) => setField(`sz-kwh-${i + 1}`, v));
    }
    if (monthlyKwhHp) {
      AppState.monthlyKwhHp = monthlyKwhHp.slice();
    } else if (monthlyKwh) {
      AppState.monthlyKwhHp = null;
    }
    if (halfHourly) {
      const arr = halfHourly instanceof Float32Array ? halfHourly : new Float32Array(halfHourly);
      AppState.hourlyEnedisData = { halfHourly: arr, year };
      if (typeof HourlyModule?.setData === 'function') {
        HourlyModule.setData({ values: arr, year });
      }
    } else if (monthlyKwh) {
      // kWh mensuels fournis mais pas de données 30min
      AppState.hourlyEnedisData = null;
    }
    AppState.enedisYear = year;
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
    hourly:  () => HourlyModule.compute(),
  };

  const RESULT_KEYS = {
    sizing:  () => AppState.lastSizingResult,
    grid:    () => AppState.lastGridResult,
    offgrid: () => AppState.lastOffgridSizingResult,
  };

  const CANDIDATES_KEYS = {
    sizing:  () => AppState.lastSizingCandidates,
    offgrid: () => AppState.lastOffgridSizingCandidates,
  };

  function calc(tab) {
    const fn = CALC_FNS[tab];
    if (!fn) throw new Error(`Onglet inconnu : "${tab}". Valeurs : sizing, grid, offgrid, hourly`);
    fn();
    return getResults(tab);
  }

  function getResults(tab) {
    const getter = RESULT_KEYS[tab];
    if (!getter) return null;
    return getter();
  }

  /**
   * Retourne tous les candidats calculés pour un onglet (sizing ou offgrid).
   * Disponibles après un appel à calc() ou depuis le dernier calcul UI.
   * @param {string} tab  'sizing' | 'offgrid'
   * @returns {Array|null}
   */
  function getAllCandidates(tab) {
    const getter = CANDIDATES_KEYS[tab];
    if (!getter) return null;
    return getter();
  }

  /**
   * Réinitialise l'état Enedis + HP/HC sans toucher aux paramètres d'installation.
   * Utile entre deux scénarios de test pour repartir d'un état propre.
   */
  function reset() {
    AppState.hourlyEnedisData   = null;
    AppState.monthlyKwhHp       = null;
    AppState.enedisYear         = null;
    AppState._includeIncentive  = true;
    if (typeof HourlyModule !== 'undefined' && typeof HourlyModule.setData === 'function') {
      HourlyModule.setData(null);
    }
    return AppAPI;
  }

  // ── Scénario complet ─────────────────────────────────────────

  /**
   * Applique tous les paramètres et lance le calcul en une seule appel.
   * @param {object} config
   * @param {object} [config.install]  - paramètres partagés (tilt, azimuth, surface…)
   * @param {object} [config.sizing]   - paramètres onglet Dimensionnement
   * @param {object} [config.offgrid]  - paramètres onglet Hors-réseau
   * @param {string} [config.tab]      - 'sizing' | 'grid' | 'offgrid'
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
      location:      AppState.location,
      install:       AppState.install,
      activeTab:     AppState.activeTab,
      enedisYear:    AppState.enedisYear || null,
      hasEnedis30min: !!(AppState.hourlyEnedisData?.halfHourly?.length >= 48 * 365),
      monthlyKwhHp:  AppState.monthlyKwhHp || null,
      includeIncentive: AppState._includeIncentive ?? true,
      results: {
        sizing:  AppState.lastSizingResult,
        grid:    AppState.lastGridResult,
        offgrid: AppState.lastOffgridSizingResult,
      }
    };
  }

  // ── Diagnostic ───────────────────────────────────────────────

  /**
   * Lance une batterie de tests sur les moteurs de calcul et affiche un rapport.
   * Utilise les données démo Toulouse si disponibles, sinon les données actuelles.
   * Retourne { pass, fail, warn, tests[] }.
   */
  function runDiagnostic() {
    const report = { pass: 0, fail: 0, warn: 0, tests: [] };

    function check(name, ok, expected, actual, isWarn = false) {
      const status = ok ? 'pass' : (isWarn ? 'warn' : 'fail');
      report.tests.push({ name, status, expected: String(expected), actual: String(actual) });
      if (ok) report.pass++;
      else if (isWarn) { report.warn++; console.warn(`⚠ ${name} - attendu: ${expected}, obtenu: ${actual}`); }
      else { report.fail++; console.error(`✗ ${name} - attendu: ${expected}, obtenu: ${actual}`); }
    }

    // Sauvegarder l'état complet
    const savedWeather        = AppState.weatherData;
    const savedLocation       = { ...AppState.location };
    const savedEnedis         = AppState.hourlyEnedisData;
    const savedMonthlyKwhHp   = AppState.monthlyKwhHp;
    const savedIncludeIncentive = AppState._includeIncentive;

    try {
      const demoWeather = AppState.demoData?.locations?.toulouse?.monthly;
      const weather = demoWeather || AppState.weatherData;
      if (!weather) { console.error('Aucune donnée météo disponible - importez un lieu d\'abord.'); return report; }

      AppState.weatherData = weather;
      if (demoWeather) { AppState.location.lat = 43.6; AppState.location.lon = 1.44; }
      AppState.hourlyEnedisData = null; // forcer profil journalier moyen

      const lat = AppState.location.lat;

      // ── Test 1 : Géométrie solaire ──────────────────────────
      const Htilt_juillet = SolarMath.tiltedIrradiation(weather[6].GHI, weather[6].DHI, lat, 30, 0, 7);
      check('Htilt juillet > 0', Htilt_juillet > 0, '>0 kWh/m²', Htilt_juillet.toFixed(1));
      check('Htilt juillet ≤ 300 kWh/m²', Htilt_juillet <= 300, '≤300', Htilt_juillet.toFixed(1));

      const Htilt_janv = SolarMath.tiltedIrradiation(weather[0].GHI, weather[0].DHI, lat, 30, 0, 1);
      check('Htilt janvier < juillet', Htilt_janv < Htilt_juillet, `<${Htilt_juillet.toFixed(0)}`, Htilt_janv.toFixed(1));

      // ── Test 2 : Production PV (SolarMath.pvProduction) ──────
      const annualHtilt = weather.reduce((s, m, i) => s + SolarMath.tiltedIrradiation(m.GHI, m.DHI, lat, 30, 0, i+1), 0);
      const annualProd3kw = weather.reduce((s, m, i) => {
        const H = SolarMath.tiltedIrradiation(m.GHI, m.DHI, lat, 30, 0, i+1);
        return s + SolarMath.pvProduction(H, 3, 14, m.T_avg, 'crystSi', i+1, lat);
      }, 0);
      const pr = annualProd3kw / (3 * annualHtilt);
      check('Production 3 kWc entre 2000 et 5000 kWh/an', annualProd3kw >= 2000 && annualProd3kw <= 5000, '2000–5000', Math.round(annualProd3kw));
      check('Performance Ratio entre 0.70 et 0.92', pr >= 0.70 && pr <= 0.92, '0.70–0.92', pr.toFixed(3));

      // ── Test 3 : SizingEngine ────────────────────────────────
      const CONSO_TEST = [385,345,310,268,228,192,182,188,222,278,335,392]; // 3325 kWh/an
      const annualKwh = CONSO_TEST.reduce((s,v) => s+v, 0);
      AppAPI.setInstall({ tilt: 30, azimuth: 0, surface: 20, losses: 14 })
        .setSizing({ monthlyKwh: CONSO_TEST, tariff: 'base', priceBase: 0.2516,
                     subscription: 147, strategy: 'autoconso_max', surface: 20 });
      const siz = AppAPI.calc('sizing');

      check('sizing – résultat non null', !!siz, 'objet', siz ? 'OK' : 'null');
      if (siz) {
        check('sizing – Ppeak entre 0.5 et 15 kWc', siz.Ppeak >= 0.5 && siz.Ppeak <= 15, '0.5–15', siz.Ppeak);
        check('sizing – coverageRate entre 1 et 100%', siz.coverageRate >= 1 && siz.coverageRate <= 100, '1–100', siz.coverageRate + '%');
        check('sizing – autoconsoKwh ≤ annualProd', siz.annualAutoconsoKwh <= siz.annualProd, '≤annualProd', `${siz.annualAutoconsoKwh}≤${siz.annualProd}`);
        check('sizing – autoconsoKwh ≤ annualConso', siz.annualAutoconsoKwh <= siz.annualConso, '≤annualConso', `${siz.annualAutoconsoKwh}≤${siz.annualConso}`);
        check('sizing – annualConso exact', siz.annualConso === annualKwh, annualKwh + ' kWh', siz.annualConso + ' kWh');
        const expectedBill = Math.round(147 + annualKwh * 0.2516);
        check('sizing – currentBill cohérent (±10€)', Math.abs(siz.currentBill - expectedBill) <= 10, expectedBill + ' €', siz.currentBill + ' €');
        check('sizing – newAnnualBill < currentBill', siz.newAnnualBill < siz.currentBill, `<${siz.currentBill}`, siz.newAnnualBill);
        check('sizing – savedOnBill > 0', siz.savedOnBill > 0, '>0 €', siz.savedOnBill + ' €');
        check('sizing – systemCost > 0', siz.systemCost > 0, '>0 €', siz.systemCost + ' €');
        check('sizing – ROI entre 3 et 30 ans', siz.ROI >= 3 && siz.ROI <= 30, '3–30 ans', siz.ROI + ' ans', siz.ROI > 30);
        const autoRate = siz.annualProd > 0 ? siz.annualAutoconsoKwh / siz.annualProd : 0;
        check('sizing – autoconsoRate cohérent avec calcul', Math.abs(autoRate - siz.autoconsoRate / 100) < 0.01, (autoRate * 100).toFixed(1) + '%', siz.autoconsoRate + '%');
      }

      // ── Test 4 : Tarif HP/HC ─────────────────────────────────
      const kwhHpTest = CONSO_TEST.map(v => Math.round(v * 0.65));
      AppAPI.setSizing({ tariff: 'hphc', priceHp: 0.246, priceHc: 0.186,
                         monthlyKwh: CONSO_TEST,
                         monthlyKwhHp: kwhHpTest });
      const sizHphc = AppAPI.calc('sizing');
      if (sizHphc) {
        const billHphc = sizHphc.currentBill;
        check('sizing HP/HC – facture plausible (>0)', billHphc > 0, '>0', billHphc + ' €');
        // Facture attendue : abo + somme(k * 0.65 * 0.246 + k * 0.35 * 0.186)
        const expectedHphc = Math.round(147 + CONSO_TEST.reduce((s, k) =>
          s + k * 0.65 * 0.246 + k * 0.35 * 0.186, 0));
        check('sizing HP/HC – facture correcte (±10€)',
          Math.abs(billHphc - expectedHphc) <= 10, expectedHphc + ' €', billHphc + ' €');
        // Facture HP/HC > facture base (HP 0.246 > base 0.2516 est faux, mais la pondération donne < base)
        // Vérifier juste que les économies autoconso sont > 0
        check('sizing HP/HC – savedOnBill > 0', sizHphc.savedOnBill > 0, '>0 €', sizHphc.savedOnBill + ' €');
      }

      // Test 4b : mois avec HP=0 (toute conso en HC) → bug précédent appliquait fallback 65%
      const kwhHpWithZero = [...kwhHpTest]; kwhHpWithZero[0] = 0; // Janvier = 100% HC
      AppAPI.setSizing({ monthlyKwh: CONSO_TEST, monthlyKwhHp: kwhHpWithZero });
      const sizHphcZero = AppAPI.calc('sizing');
      if (sizHphcZero) {
        // Janvier avec HP=0 → coût = CONSO[0] × 0.186 (pur HC)
        // Avec bug fallback 65% → coût = CONSO[0] × (0.65×0.246 + 0.35×0.186) > pur HC
        const janHC = CONSO_TEST[0] * 0.186;
        const janFallback = CONSO_TEST[0] * (0.65 * 0.246 + 0.35 * 0.186);
        check('sizing HP/HC – ratio HP=0 correctement géré (< fallback 65%)',
          sizHphcZero.currentBill < Math.round(147 + CONSO_TEST.reduce((s, k) =>
            s + k * 0.65 * 0.246 + k * 0.35 * 0.186, 0)),
          '< facture fallback 65%', sizHphcZero.currentBill + ' €');
      }

      // Test 4c : vérifier que setSizing(monthlyKwhHp: null) réinitialise bien l'état
      AppAPI.setSizing({ tariff: 'base', monthlyKwhHp: null });
      check('setSizing(null) – HP/HC effacé de AppState',
        AppAPI.state().monthlyKwhHp === null, 'null', String(AppAPI.state().monthlyKwhHp));

      // ── Test 5 : Hors réseau LFP ─────────────────────────────
      AppAPI.reset().setInstall({ tilt: 30, azimuth: 0, losses: 14 })
        .setOffgrid({ dailyDefault: 1000, battTech: 'lfp', targetCoverage: 90, surface: 15 });
      const og = AppAPI.calc('offgrid');

      check('offgrid – résultat non null', !!og, 'objet', og ? 'OK' : 'null');
      if (og) {
        check('offgrid – Ppeak > 0', og.Ppeak > 0, '>0 kWc', og.Ppeak);
        check('offgrid – C_batt_gross > 0', og.C_batt_gross > 0, '>0 kWh', og.C_batt_gross);
        check('offgrid – coverageRate ≥ 85%', og.coverageRate >= 85, '≥85%', og.coverageRate + '%', og.coverageRate >= 80);
        check('offgrid – systemCost > 0', og.systemCost > 0, '>0 €', og.systemCost + ' €');
        check('offgrid – total_conso ≈ 365 kWh/an', Math.abs(og.total_conso - 365) <= 30, '335–395 kWh', og.total_conso + ' kWh');
        check('offgrid – C_usable ≤ C_batt_gross', og.C_usable <= og.C_batt_gross, '≤brut', `${og.C_usable}≤${og.C_batt_gross}`);
        // costPV + costBatt + BOS ≈ systemCost
        const reconstituted = og.costPV + og.costBatt;
        check('offgrid – costPV + costBatt ≤ systemCost', reconstituted <= og.systemCost, `≤${og.systemCost}`, reconstituted);
        // Cohérence couverture vs déficit
        const covCalc = og.total_conso > 0
          ? Math.round((og.total_conso - og.total_deficit) / og.total_conso * 1000) / 10
          : 0;
        check('offgrid – coverageRate cohérent vs déficit',
          Math.abs(covCalc - og.coverageRate) < 0.5, covCalc + '%', og.coverageRate + '%');
        // getAllCandidates doit retourner un tableau non vide
        const cands = AppAPI.getAllCandidates('offgrid');
        check('offgrid – getAllCandidates() non vide', Array.isArray(cands) && cands.length > 0,
          'array>0', cands ? cands.length + ' candidats' : 'null');
      }

      // ── Test 5b : Batterie AGM (DoD 50%, η 85%) ─────────────────
      AppAPI.setOffgrid({ battTech: 'agm', targetCoverage: 85 });
      const ogAgm = AppAPI.calc('offgrid');
      if (ogAgm) {
        check('offgrid AGM – coverageRate ≥ 80%', ogAgm.coverageRate >= 80, '≥80%', ogAgm.coverageRate + '%', ogAgm.coverageRate >= 75);
        // AGM DoD=50% → C_usable ≤ C_batt_gross * 0.5
        check('offgrid AGM – C_usable ≤ 50% brut',
          ogAgm.C_usable <= ogAgm.C_batt_gross * 0.51, '≤50%', (ogAgm.C_usable / ogAgm.C_batt_gross * 100).toFixed(0) + '%');
      }

      // ── Test 6 : Autonomie totale (100%) ─────────────────────
      AppAPI.setOffgrid({ dailyDefault: 500, battTech: 'lfp', targetCoverage: 100, surface: 30 });
      const og100 = AppAPI.calc('offgrid');
      if (og100) {
        check('offgrid 100% – déficit ≤ 1 Wh ou non nul signalé',
          og100.total_deficit < 0.01 || og100.coverageRate >= 99,
          'déficit ≈ 0', `${og100.total_deficit} kWh / ${og100.coverageRate}%`, og100.total_deficit < 0.1);
      }

      // ── Test 7 : Données Enedis synthétiques ─────────────────
      // Profil réaliste : 1 kWh/j, plus élevé de 7h à 23h (ratio 5:1 jour/nuit)
      // Normalisation : w[s]/wSum donne exactement 1 kWh par jour (sum sur 48 slots)
      const syntheticEnedis = new Float32Array(365 * 48);
      const slotWeights = Array.from({length: 48}, (_, s) => (s / 2 >= 7 && s / 2 < 23) ? 2.5 : 0.5);
      const wSum = slotWeights.reduce((a, b) => a + b, 0); // = 32×2.5 + 16×0.5 = 88
      for (let day = 0; day < 365; day++) {
        for (let s = 0; s < 48; s++) {
          syntheticEnedis[day * 48 + s] = slotWeights[s] / wSum; // kWh/slot, sum=1 kWh/j
        }
      }
      const annualEnedis = Array.from(syntheticEnedis).reduce((s, v) => s + v, 0);
      check('Enedis synthétique – somme ≈ 365 kWh', Math.abs(annualEnedis - 365) < 5, '360–370 kWh', annualEnedis.toFixed(1) + ' kWh');

      AppAPI.reset().setEnedisData({ halfHourly: syntheticEnedis, year: 2023 })
        .setOffgrid({ dailyDefault: 1000, battTech: 'lfp', targetCoverage: 90, surface: 15 });
      const ogEnedis = AppAPI.calc('offgrid');
      check('offgrid Enedis – slotLevel actif', ogEnedis?.slotLevel === true, 'true', ogEnedis?.slotLevel);
      if (ogEnedis) {
        // total_conso depuis Enedis doit être ≈ 365 kWh (1 kWh/j × 365 j)
        check('offgrid Enedis – total_conso ≈ 365 kWh', Math.abs(ogEnedis.total_conso - 365) <= 15, '350–380 kWh', ogEnedis.total_conso + ' kWh');
        // Vérifier la cohérence couverture vs déficit sur données slot réelles
        const covEnedis = ogEnedis.total_conso > 0
          ? Math.round((ogEnedis.total_conso - ogEnedis.total_deficit) / ogEnedis.total_conso * 1000) / 10
          : 0;
        check('offgrid Enedis – coverageRate cohérent',
          Math.abs(covEnedis - ogEnedis.coverageRate) < 0.5, covEnedis + '%', ogEnedis.coverageRate + '%');
      }

      // ── Test 8 : getAllCandidates sizing ───────────────────────
      AppAPI.reset().setInstall({ tilt: 30, azimuth: 0, surface: 20, losses: 14 })
        .setSizing({ monthlyKwh: CONSO_TEST, tariff: 'base', priceBase: 0.2516,
                     subscription: 147, strategy: 'autoconso_max' });
      AppAPI.calc('sizing');
      const sizCands = AppAPI.getAllCandidates('sizing');
      check('getAllCandidates sizing – tableau non vide', Array.isArray(sizCands) && sizCands.length > 0,
        'array>0', sizCands ? sizCands.length + ' candidats' : 'null');
      if (sizCands?.length > 1) {
        // Vérifier que les candidats sont triés par Ppeak croissant
        const sorted = sizCands.every((c, i) => i === 0 || c.Ppeak >= sizCands[i - 1].Ppeak);
        check('getAllCandidates sizing – Ppeak croissant', sorted, 'true', String(sorted));
      }

    } finally {
      AppState.weatherData        = savedWeather;
      AppState.location           = savedLocation;
      AppState.hourlyEnedisData   = savedEnedis;
      AppState.monthlyKwhHp       = savedMonthlyKwhHp;
      AppState._includeIncentive  = savedIncludeIncentive;
    }

    const sym = report.fail ? '✗' : report.warn ? '⚠' : '✓';
    console.log(`\n${sym} Diagnostic - ${report.pass} ✓  ${report.warn} ⚠  ${report.fail} ✗ (total ${report.tests.length})`);
    console.table(report.tests.map(t => ({
      Test:     t.name,
      Statut:   t.status === 'pass' ? '✓' : t.status === 'warn' ? '⚠' : '✗',
      Attendu:  t.expected,
      Obtenu:   t.actual
    })));
    return report;
  }

  // ── Help ─────────────────────────────────────────────────────

  function help() {
    console.log(`
AppAPI - pilotage de l'app Open Solar Energy
─────────────────────────────────────────────
AppAPI.goTo('sizing'|'grid'|'offgrid'|...)

AppAPI.setInstall({ tilt, azimuth, surface, panelWp, panelM2, losses, tech })
  → Paramètres partagés entre tous les onglets

AppAPI.setSizing({
  monthlyKwh:[...12],          // kWh/mois
  monthlyKwhHp:[...12]|null,   // kWh HP/mois (Enedis HP/HC) - null efface l'état
  tariff,                      // 'base' | 'hphc'
  priceBase, priceHp, priceHc, // €/kWh
  subscription,                // abonnement €/an (0 = pas d'abo)
  costKwp, costTotal,          // coût €/kWc ou coût total fixe
  strategy,                    // 'autoconso_max' | 'roi_optimal' | 'bill_coverage_pct'
  targetCoverage,              // % couverture cible
  feedin,                      // tarif rachat surplus €/kWh
  surface, tech,
  includeIncentive,            // true|false - prime autoconso France (ne change pas si omis)
})
  Note HP/HC : monthlyKwhHp=null efface explicitement les données HP. Si omis, l'état
  existant est conservé. Nouvelle conso (monthlyKwh) sans monthlyKwhHp efface aussi.

AppAPI.setOffgrid({
  dailyDefault,                // Wh/j uniforme
  dailyByMonth:[...12],        // Wh/j par mois
  battTech,                    // 'lfp'|'lfp_diy'|'agm'|'nmc_leaf'|'nmc_zoe'|'nmc_tesla'
  targetCoverage,              // % autonomie cible (90 = défaut)
  pvCostKwp, bosCost,          // null/omis → 500€, 0 → pas de BOS
  nPanelsFixed, surface,
})

AppAPI.setWeatherData(data)
  → data = [{GHI, DHI, T_avg, name?}, ...] ×12 en kWh/m²/mois

AppAPI.setEnedisData({ monthlyKwh, halfHourly?, monthlyKwhHp?, year? })
  → monthlyKwh    : kWh/mois × 12 (remplit sz-kwh-*)
  → halfHourly    : Float32Array ou Array kWh/slot × (n×48) pour simulation batterie
  → monthlyKwhHp  : kWh HP × 12 pour tarif HP/HC (optionnel)

AppAPI.setLocation(lat, lon, name?)
AppAPI.reset()                               → réinitialise Enedis + HP/HC (chaînable)
AppAPI.calc('sizing'|'grid'|'offgrid'|'hourly') → résultats
AppAPI.getResults('sizing'|'grid'|'offgrid')    → résultats sans recalculer
AppAPI.getAllCandidates('sizing'|'offgrid')      → tous les candidats du dernier calc
AppAPI.runScenario({ install, sizing, offgrid, tab }) → one-shot
AppAPI.runDiagnostic()                       → tests automatiques (console + rapport)
AppAPI.state()                               → snapshot AppState enrichi

Résultats sizing  : Ppeak, nPanels, annualProd, annualConso, annualAutoconsoKwh,
                    coverageRate(%), autoconsoRate(%), savedOnBill, feedinRevenue,
                    totalAnnualGain, newAnnualBill, currentBill, paybackYears,
                    npv25, lcoe, incentive, systemCost, systemCostBrut, ROI, co2Saved
Résultats offgrid : Ppeak, C_batt_gross, C_usable, coverageRate(%), systemCost,
                    deficit_days, autonomyDays, total_conso, total_deficit,
                    costPV, costBatt, battLifeYears, slotLevel (bool)

Conventions batterie :
  - eta = rendement aller-retour (ex: LFP 97%)
  - Pertes en CHARGE uniquement : stocké = surplus × eta (pas de perte en décharge)
  - Round-trip réel = eta (et non eta²)
  - Seuil micro-déficit : 50 Wh/j ignorés pour éviter le bruit numérique

Exemple sizing :
  AppAPI.reset().setInstall({ tilt:30, azimuth:0, surface:20, losses:14 })
    .setSizing({ monthlyKwh:[350,300,280,250,240,230,240,250,270,310,340,360],
                 strategy:'bill_coverage_pct', targetCoverage:80 })
    .calc('sizing');

Exemple offgrid avec données Enedis :
  AppAPI.reset().setEnedisData({ monthlyKwh:[400,360,...], year:2023 })
    .setOffgrid({ battTech:'lfp', targetCoverage:90, surface:15 })
    .calc('offgrid');

Diagnostic complet :
  AppAPI.runDiagnostic();
`);
  }

  return { goTo, setInstall, setSizing, setOffgrid, setLocation, setWeatherData, setEnedisData,
           calc, getResults, getAllCandidates, reset, runScenario, runDiagnostic, state, help };
})();

window.AppAPI = AppAPI;

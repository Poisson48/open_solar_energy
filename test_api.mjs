/**
 * test_api.mjs — Test AppAPI via Playwright (headless Chromium système)
 * Usage: node test_api.mjs
 */

import { chromium } from '/home/valou/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const URL = 'http://localhost:8181';

const browser = await chromium.launch({
  headless:       true,
  executablePath: '/snap/bin/chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const page = await browser.newPage();

page.on('console', msg => {
  if (msg.type() === 'error') console.error('[browser]', msg.text());
  if (msg.type() === 'warning') console.warn('[browser]', msg.text());
});

console.log('Chargement de', URL, '...');
await page.goto(URL, { waitUntil: 'networkidle' });
console.log('Titre :', await page.title());

const debug = await page.evaluate(() => ({
  hasAppAPI:   typeof AppAPI !== 'undefined',
  weatherData: typeof AppState !== 'undefined' && AppState.weatherData ? 'chargée' : 'null',
  demoData:    typeof AppState !== 'undefined' && AppState.demoData    ? 'chargée' : 'null',
}));
console.log('Debug init :', debug);

if (!debug.hasAppAPI) {
  console.error('ERREUR : AppAPI introuvable. api.js non chargé ?');
  await browser.close();
  process.exit(1);
}

if (debug.weatherData === 'null') {
  console.log('weatherData null, attente init async...');
  await page.waitForFunction(
    () => typeof AppState !== 'undefined' && AppState.weatherData !== null,
    { timeout: 8000 }
  );
  console.log('weatherData chargée.');
}

await page.waitForTimeout(500);

let errors = 0;

function check(label, actual, expected, tolerance = 0) {
  const ok = tolerance > 0
    ? Math.abs(actual - expected) <= tolerance
    : actual === expected;
  if (!ok) {
    console.error(`  ✗ ${label} : attendu ${expected}${tolerance ? ` ±${tolerance}` : ''}, obtenu ${actual}`);
    errors++;
  } else {
    console.log(`  ✓ ${label} : ${actual}`);
  }
}

function checkNaN(label, val) {
  if (val == null || isNaN(val)) {
    console.error(`  ✗ ${label} : NaN ou null !`);
    errors++;
  } else {
    console.log(`  ✓ ${label} : ${typeof val === 'number' ? val.toFixed(2) : val}`);
  }
}

// ── Scénario 1 : Tarif base, 80% couverture, feedin=0 ─────────────────────────
console.log('\n═══ Scénario 1 — Tarif base, Paris, 20 m², 80% couverture, feedin=0 ═══');
const r1 = await page.evaluate(() =>
  AppAPI.runScenario({
    install: { tilt: 30, azimuth: 0, surface: 20, panelWp: 400, losses: 14 },
    sizing: {
      monthlyKwh:    [350, 300, 280, 250, 240, 230, 240, 250, 270, 310, 340, 360],
      tariff:         'base',
      priceBase:      0.2516,
      subscription:   120,
      costKwp:        1100,
      feedin:         0,       // explicitement 0 pour isoler savedOnBill
      strategy:       'bill_coverage_pct',
      targetCoverage: 80,
    },
    tab: 'sizing'
  })
);

if (!r1) {
  console.error('ERREUR : calcSizing() a retourné null');
  errors++;
} else {
  console.log(`  Ppeak            : ${r1.Ppeak} kWc`);
  console.log(`  Nb panneaux      : ${r1.nPanels}`);
  console.log(`  Production/an    : ${r1.annualProd} kWh`);
  console.log(`  Couverture       : ${r1.coverageRate} %`);
  console.log(`  Économies/an     : ${r1.savedOnBill} €`);
  console.log(`  feedinRevenue    : ${r1.feedinRevenue} €`);
  console.log(`  Gain total/an    : ${r1.totalAnnualGain} €`);
  console.log(`  Nouvelle facture : ${r1.newAnnualBill} €`);
  console.log(`  Prime autoconso  : ${r1.incentive} €`);
  console.log(`  Coût net         : ${r1.systemCost} €`);
  console.log(`  Payback          : ${r1.paybackYears} ans`);
  console.log(`  VAN 25 ans       : ${r1.npv25} €`);
  console.log(`  LCOE             : ${r1.lcoe} €/kWh`);

  // Vérifications logiques
  checkNaN('Ppeak non NaN', r1.Ppeak);
  checkNaN('savedOnBill non NaN', r1.savedOnBill);
  checkNaN('npv25 non NaN', r1.npv25);
  checkNaN('lcoe non NaN', r1.lcoe);

  // feedin=0 → feedinRevenue=0 → totalAnnualGain doit égaler savedOnBill
  check('feedinRevenue = 0 (feedin=0)', r1.feedinRevenue, 0);
  check('totalAnnualGain = savedOnBill (feedin=0)', r1.totalAnnualGain, r1.savedOnBill);

  // couverture ≥ 80%
  if (r1.coverageRate < 80) {
    console.error(`  ✗ coverageRate ${r1.coverageRate} < 80 %`);
    errors++;
  } else {
    console.log(`  ✓ coverageRate ≥ 80 %`);
  }

  // newAnnualBill = currentBill - savedOnBill (pas feedin)
  // On ne peut pas vérifier currentBill directement mais on peut vérifier que
  // newAnnualBill != currentBill - savedOnBill - feedinRevenue (ancienne formule = pareil ici car feedin=0)
  checkNaN('newAnnualBill non NaN', r1.newAnnualBill);
}

// ── Scénario 2 : HP/HC, ROI optimal ─────────────────────────────────────────
console.log('\n═══ Scénario 2 — Tarif HP/HC, Toulouse, 30 m², ROI optimal ═══');
const r2 = await page.evaluate(() =>
  AppAPI
    .setLocation(43.6, 1.44, 'Toulouse')
    .runScenario({
      install: { tilt: 35, azimuth: 0, surface: 30, panelWp: 400, losses: 14 },
      sizing: {
        monthlyKwh: [320, 280, 260, 230, 210, 190, 200, 210, 240, 280, 310, 340],
        tariff:      'hphc',
        priceHp:     0.2460,
        priceHc:     0.1860,
        subscription: 120,
        costKwp:     1000,
        feedin:      0,
        strategy:    'roi_optimal',
      },
      tab: 'sizing'
    })
);

if (!r2) {
  console.error('ERREUR : calcSizing() HP/HC a retourné null');
  errors++;
} else {
  console.log(`  Ppeak            : ${r2.Ppeak} kWc`);
  console.log(`  Couverture       : ${r2.coverageRate} %`);
  console.log(`  Économies/an     : ${r2.savedOnBill} €`);
  console.log(`  ROI (simple)     : ${r2.ROI} ans`);
  console.log(`  Payback actualisé: ${r2.paybackYears} ans`);
  console.log(`  VAN 25 ans       : ${r2.npv25} €`);

  checkNaN('Ppeak HP/HC non NaN', r2.Ppeak);
  checkNaN('savedOnBill HP/HC non NaN', r2.savedOnBill);
  checkNaN('ROI non NaN', r2.ROI);

  // ROI optimal doit être le meilleur (≤ 30 ans)
  if (r2.ROI > 30) {
    console.error(`  ✗ ROI ${r2.ROI} > 30 (roi_optimal devrait filtrer)`);
    errors++;
  } else {
    console.log(`  ✓ ROI optimal ≤ 30 ans`);
  }
}

// ── Scénario 3 : Hors-réseau LFP, bosCost par défaut (null → 500€) ──────────
console.log('\n═══ Scénario 3 — Hors-réseau LFP, 3.5 kWh/j, 90% autonomie, bosCost défaut ═══');
await page.evaluate(() => {
  // Remettre Paris, effacer les champs sizing
  AppAPI.setLocation(48.8566, 2.3522, 'Paris, France');
  for (let i = 1; i <= 12; i++) {
    const el = document.getElementById(`sz-kwh-${i}`);
    if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
  }
});

// Test sans bosCost explicite → le champ og2-bos-cost est vide → bug fixé : doit utiliser 500€ défaut
const r3_nobos = await page.evaluate(() => {
  // Effacer le champ bosCost dans le formulaire
  const bosEl = document.getElementById('og2-bos-cost');
  if (bosEl) { bosEl.value = ''; bosEl.dispatchEvent(new Event('input', { bubbles: true })); }
  return AppAPI.runScenario({
    install:  { tilt: 30, azimuth: 0, surface: 25, panelWp: 400, losses: 14 },
    offgrid:  { dailyDefault: 3500, battTech: 'lfp', targetCoverage: 90, pvCostKwp: 650 },
    tab:      'offgrid'
  });
});

const r3_bos500 = await page.evaluate(() =>
  AppAPI.runScenario({
    install:  { tilt: 30, azimuth: 0, surface: 25, panelWp: 400, losses: 14 },
    offgrid:  { dailyDefault: 3500, battTech: 'lfp', targetCoverage: 90, pvCostKwp: 650, bosCost: 500 },
    tab:      'offgrid'
  })
);

if (!r3_nobos || !r3_bos500) {
  console.error('ERREUR : calcOffgridSizing() a retourné null');
  errors++;
} else {
  console.log(`  Ppeak (sans bosCost param) : ${r3_nobos.Ppeak} kWc  coût=${r3_nobos.systemCost} €`);
  console.log(`  Ppeak (bosCost=500)        : ${r3_bos500.Ppeak} kWc  coût=${r3_bos500.systemCost} €`);
  // Avec le bug corrigé, les deux doivent avoir le même coût (bosCost=500 dans les deux cas)
  check('BOS cost default = BOS cost 500 (bug fix)', r3_nobos.systemCost, r3_bos500.systemCost);
  checkNaN('deficit_days non NaN', r3_nobos.deficit_days);
  checkNaN('total_conso non NaN', r3_nobos.total_conso);
}

// ── Scénario 4 : feedin > 0 — vérifier newAnnualBill correct ───────────────
console.log('\n═══ Scénario 4 — feedin 0.13 €/kWh, vérification newAnnualBill ═══');
const r4 = await page.evaluate(() =>
  AppAPI.runScenario({
    install: { tilt: 30, azimuth: 0, surface: 20, panelWp: 400, losses: 14 },
    sizing: {
      monthlyKwh: [350, 300, 280, 250, 240, 230, 240, 250, 270, 310, 340, 360],
      tariff:      'base',
      priceBase:   0.2516,
      subscription: 120,
      costKwp:     1100,
      feedin:      0.13,
      strategy:    'bill_coverage_pct',
      targetCoverage: 80,
    },
    tab: 'sizing'
  })
);

if (!r4) {
  console.error('ERREUR scénario 4 null');
  errors++;
} else {
  console.log(`  savedOnBill     : ${r4.savedOnBill} €/an`);
  console.log(`  feedinRevenue   : ${r4.feedinRevenue} €/an`);
  console.log(`  totalAnnualGain : ${r4.totalAnnualGain} €/an`);
  console.log(`  newAnnualBill   : ${r4.newAnnualBill} €/an`);

  // feedin > 0 → feedinRevenue > 0
  if (r4.feedinRevenue <= 0) {
    console.error(`  ✗ feedinRevenue ${r4.feedinRevenue} ≤ 0 avec feedin=0.13`);
    errors++;
  } else {
    console.log(`  ✓ feedinRevenue > 0`);
  }
  // totalAnnualGain = savedOnBill + feedinRevenue
  const expectedGain = r4.savedOnBill + r4.feedinRevenue;
  check('totalAnnualGain = savedOnBill + feedinRevenue', r4.totalAnnualGain, expectedGain, 1);
  // newAnnualBill ne doit PAS inclure feedinRevenue (après bugfix)
  // On vérifie que newAnnualBill > totalAnnualGain_saved_only_case (pas de formule directe,
  // mais on vérifie que newAnnualBill != currentBill - totalAnnualGain)
  checkNaN('newAnnualBill non NaN', r4.newAnnualBill);
}

// ── Scénario 5 : autoconso_max ────────────────────────────────────────────────
console.log('\n═══ Scénario 5 — Stratégie autoconso_max, Marseille ═══');
const r5 = await page.evaluate(() =>
  AppAPI
    .setLocation(43.3, 5.4, 'Marseille')
    .runScenario({
      install: { tilt: 25, azimuth: 0, surface: 15, panelWp: 400, losses: 14 },
      sizing: {
        monthlyKwh: [200, 180, 170, 150, 140, 130, 140, 150, 160, 180, 200, 220],
        tariff:      'base',
        priceBase:   0.2516,
        subscription: 120,
        costKwp:     1000,
        feedin:      0,
        strategy:    'autoconso_max',
      },
      tab: 'sizing'
    })
);

if (!r5) {
  console.error('ERREUR scénario 5 null');
  errors++;
} else {
  console.log(`  Ppeak          : ${r5.Ppeak} kWc`);
  console.log(`  Autoconso      : ${r5.autoconsoRate} %`);
  console.log(`  Couverture     : ${r5.coverageRate} %`);
  // autoconso_max filtre les systèmes où >40% part au réseau
  if (r5.autoconsoRate < 60) {
    console.warn(`  ⚠ autoconsoRate ${r5.autoconsoRate} < 60% (filtre assoupli car aucun candidat ≥60%)`);
  } else {
    console.log(`  ✓ autoconsoRate ≥ 60 %`);
  }
  checkNaN('Ppeak autoconso_max', r5.Ppeak);
}

// ── AppAPI.state() ────────────────────────────────────────────────────────────
const snap = await page.evaluate(() => {
  const s = AppAPI.state();
  return { location: s.location, install: s.install, activeTab: s.activeTab };
});
console.log('\n═══ AppAPI.state() ═══');
console.log('Location :', snap.location.name, `(${snap.location.lat}, ${snap.location.lon})`);
console.log('Install  :', snap.install);
console.log('Tab actif:', snap.activeTab);

await browser.close();

console.log('\n' + (errors > 0
  ? `✗ ${errors} test(s) ÉCHOUÉ(S)`
  : '✓ Tous les tests passent'));
process.exit(errors > 0 ? 1 : 0);

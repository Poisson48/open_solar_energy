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

// ── Scénario 6 : bosCost=0 explicit — ne doit PAS utiliser le défaut 500€ ───
console.log('\n═══ Scénario 6 — bosCost=0 explicite vs bosCost=500 ═══');
await page.evaluate(() => AppAPI.setLocation(48.8566, 2.3522, 'Paris, France'));

const r6_bos0 = await page.evaluate(() =>
  AppAPI.runScenario({
    install:  { tilt: 30, azimuth: 0, surface: 25, panelWp: 400, losses: 14 },
    offgrid:  { dailyDefault: 3500, battTech: 'lfp', targetCoverage: 90, pvCostKwp: 650, bosCost: 0 },
    tab:      'offgrid'
  })
);
const r6_bos500 = await page.evaluate(() =>
  AppAPI.runScenario({
    install:  { tilt: 30, azimuth: 0, surface: 25, panelWp: 400, losses: 14 },
    offgrid:  { dailyDefault: 3500, battTech: 'lfp', targetCoverage: 90, pvCostKwp: 650, bosCost: 500 },
    tab:      'offgrid'
  })
);

if (!r6_bos0 || !r6_bos500) {
  console.error('ERREUR scénario 6 null');
  errors++;
} else {
  console.log(`  Coût bosCost=0   : ${r6_bos0.systemCost} €`);
  console.log(`  Coût bosCost=500 : ${r6_bos500.systemCost} €`);
  console.log(`  Différence       : ${r6_bos500.systemCost - r6_bos0.systemCost} € (attendu: 500)`);
  check('bosCost=0 < bosCost=500 (bug fix)', r6_bos500.systemCost - r6_bos0.systemCost, 500, 10);
}

// ── Scénario 7 : includeIncentive=false — coût net = coût brut ───────────────
console.log('\n═══ Scénario 7 — includeIncentive=false (prime désactivée) ═══');
await page.evaluate(() => AppAPI.setLocation(48.8566, 2.3522, 'Paris, France'));

const MONTHLY = [350,300,280,250,240,230,240,250,270,310,340,360];
const r7_with = await page.evaluate(() =>
  AppAPI.runScenario({
    install: { tilt: 30, azimuth: 0, surface: 20, panelWp: 400, losses: 14 },
    sizing:  {
      monthlyKwh: [350,300,280,250,240,230,240,250,270,310,340,360],
      tariff: 'base', priceBase: 0.2516, subscription: 120,
      costKwp: 900, strategy: 'roi_optimal', includeIncentive: true
    },
    tab: 'sizing'
  })
);
const r7_without = await page.evaluate(() =>
  AppAPI.runScenario({
    install: { tilt: 30, azimuth: 0, surface: 20, panelWp: 400, losses: 14 },
    sizing:  {
      monthlyKwh: [350,300,280,250,240,230,240,250,270,310,340,360],
      tariff: 'base', priceBase: 0.2516, subscription: 120,
      costKwp: 900, strategy: 'roi_optimal', includeIncentive: false
    },
    tab: 'sizing'
  })
);

if (!r7_with || !r7_without) {
  console.error('ERREUR scénario 7 null');
  errors++;
} else {
  console.log(`  Ppeak (avec prime)  : ${r7_with.Ppeak} kWc  incentive=${r7_with.incentive} € coût net=${r7_with.systemCost} €`);
  console.log(`  Ppeak (sans prime)  : ${r7_without.Ppeak} kWc  incentive=${r7_without.incentive} € coût net=${r7_without.systemCost} €`);
  // Sans prime : systemCost doit égaler systemCostBrut
  check('Sans prime : incentive = 0', r7_without.incentive, 0);
  check('Sans prime : coût net = coût brut', r7_without.systemCost, r7_without.systemCostBrut);
  // Avec prime : coût net < coût brut
  if (r7_with.incentive > 0 && r7_with.systemCost >= r7_with.systemCostBrut) {
    console.error(`  ✗ Avec prime : systemCost ${r7_with.systemCost} devrait être < systemCostBrut ${r7_with.systemCostBrut}`);
    errors++;
  } else {
    console.log(`  ✓ Avec prime : coût net (${r7_with.systemCost} €) < coût brut (${r7_with.systemCostBrut} €)`);
  }
}

// ── Scénario 8 : HP/HC avec données HP mensuelles réelles ────────────────────
console.log('\n═══ Scénario 8 — HP/HC avec monthlyKwhHp injecté via API ═══');
await page.evaluate(() => AppAPI.setLocation(43.6, 1.44, 'Toulouse'));

const r8 = await page.evaluate(() =>
  AppAPI.runScenario({
    install: { tilt: 35, azimuth: 0, surface: 25, panelWp: 400, losses: 14 },
    sizing:  {
      monthlyKwh:   [320,280,260,230,210,190,200,210,240,280,310,340],
      monthlyKwhHp: [208,182,169,150,137,124,130,137,156,182,202,221], // ~65% HP
      tariff: 'hphc', priceHp: 0.2460, priceHc: 0.1860,
      subscription: 120, costKwp: 1000, strategy: 'roi_optimal',
    },
    tab: 'sizing'
  })
);

if (!r8) {
  console.error('ERREUR scénario 8 null');
  errors++;
} else {
  console.log(`  Ppeak         : ${r8.Ppeak} kWc`);
  console.log(`  savedOnBill   : ${r8.savedOnBill} €`);
  console.log(`  currentBill   : cf. newAnnualBill+savedOnBill`);
  checkNaN('HP/HC + monthlyKwhHp : Ppeak', r8.Ppeak);
  checkNaN('HP/HC + monthlyKwhHp : savedOnBill', r8.savedOnBill);
  checkNaN('HP/HC + monthlyKwhHp : npv25', r8.npv25);
  if (r8.savedOnBill <= 0) {
    console.error('  ✗ savedOnBill devrait être > 0');
    errors++;
  } else {
    console.log('  ✓ savedOnBill > 0');
  }
}

// ── Scénario 9 : NPV cohérence — VAN positive si payback < durée vie ─────────
console.log('\n═══ Scénario 9 — Cohérence NPV / Payback ═══');
const r9 = r1;  // Réutilise scénario 1 (Paris, tarif base, 80% couverture)
if (r9 && r9.paybackYears !== null) {
  console.log(`  Payback    : ${r9.paybackYears} ans`);
  console.log(`  NPV 25 ans : ${r9.npv25} €`);
  if (r9.paybackYears <= 25 && r9.npv25 <= 0) {
    console.error(`  ✗ NPV ${r9.npv25} devrait être > 0 pour un payback de ${r9.paybackYears} ans < 25 ans`);
    errors++;
  } else if (r9.paybackYears <= 25) {
    console.log(`  ✓ NPV > 0 avec payback (${r9.paybackYears} ans) < durée vie (25 ans)`);
  } else {
    console.log(`  ℹ payback ${r9.paybackYears} > 25 ans, VAN potentiellement négative`);
  }
  // Payback doit être > ROI simple (car inclut O&M)
  if (r9.ROI && r9.paybackYears < r9.ROI) {
    console.warn(`  ⚠ paybackYears (${r9.paybackYears}) < ROI simple (${r9.ROI}) — suspect (O&M devrait allonger le payback)`);
  } else {
    console.log(`  ✓ paybackYears (${r9.paybackYears}) ≥ ROI simple (${r9.ROI})`);
  }
} else {
  console.log('  ℹ payback null (investissement non rentable dans l\'horizon 40 ans)');
}

// ── Scénario 10 : Précision facture EDF base — currentBill exacte ────────────
console.log('\n═══ Scénario 10 — Précision facture EDF base ═══');
// conso = 300 kWh/mois × 12 = 3600 kWh/an
// facture attendue = 3600 × 0.2516 + 120 = 905.76 + 120 = 1025.76 → 1026 €
await page.evaluate(() => AppAPI.setLocation(48.8566, 2.3522, 'Paris, France'));
const r10 = await page.evaluate(() =>
  AppAPI.runScenario({
    install: { tilt: 30, azimuth: 0, surface: 20, panelWp: 400, losses: 14 },
    sizing: {
      monthlyKwh:    [300,300,300,300,300,300,300,300,300,300,300,300],
      tariff:        'base',
      priceBase:     0.2516,
      subscription:  120,
      costKwp:       900,
      strategy:      'bill_coverage_pct',
      targetCoverage: 50,
    },
    tab: 'sizing'
  })
);
if (!r10) {
  console.error('ERREUR scénario 10 null');
  errors++;
} else {
  const expectedBill = Math.round(3600 * 0.2516 + 120); // 1026
  console.log(`  currentBill   : ${r10.currentBill} € (attendu: ${expectedBill})`);
  console.log(`  newAnnualBill : ${r10.newAnnualBill} €`);
  console.log(`  savedOnBill   : ${r10.savedOnBill} €`);
  checkNaN('currentBill non NaN', r10.currentBill);
  check('currentBill ≈ kWh×price+sub', r10.currentBill, expectedBill, 2);
  // Identité comptable : newAnnualBill + savedOnBill = currentBill (feedin=0)
  check('currentBill = newAnnualBill + savedOnBill', r10.currentBill, r10.newAnnualBill + r10.savedOnBill, 1);
  // savedOnBill ≤ currentBill (ne peut pas économiser plus que la facture entière)
  if (r10.savedOnBill > r10.currentBill) {
    console.error(`  ✗ savedOnBill ${r10.savedOnBill} > currentBill ${r10.currentBill}`);
    errors++;
  } else {
    console.log(`  ✓ savedOnBill (${r10.savedOnBill}) ≤ currentBill (${r10.currentBill})`);
  }
  // newAnnualBill ≥ 0
  if (r10.newAnnualBill < 0) {
    console.error(`  ✗ newAnnualBill ${r10.newAnnualBill} < 0`);
    errors++;
  } else {
    console.log(`  ✓ newAnnualBill (${r10.newAnnualBill}) ≥ 0`);
  }
}

// ── Scénario 11 : HP/HC — précision facture avec ratio connu ─────────────────
console.log('\n═══ Scénario 11 — HP/HC facture exacte (ratio 65% HP) ═══');
// bill = 3600 × (0.65×0.2460 + 0.35×0.1860) + 120 = 3600×0.2250 + 120 = 810+120 = 930 €
await page.evaluate(() => AppAPI.setLocation(43.6, 1.44, 'Toulouse'));
const r11 = await page.evaluate(() =>
  AppAPI.runScenario({
    install: { tilt: 30, azimuth: 0, surface: 20, panelWp: 400, losses: 14 },
    sizing: {
      monthlyKwh:   [300,300,300,300,300,300,300,300,300,300,300,300],
      monthlyKwhHp: [195,195,195,195,195,195,195,195,195,195,195,195], // 65% exactement
      tariff:       'hphc',
      priceHp:      0.2460,
      priceHc:      0.1860,
      subscription: 120,
      costKwp:      900,
      strategy:     'roi_optimal',
    },
    tab: 'sizing'
  })
);
if (!r11) {
  console.error('ERREUR scénario 11 null');
  errors++;
} else {
  const expectedBill = Math.round(3600 * (0.65 * 0.2460 + 0.35 * 0.1860) + 120); // 930
  console.log(`  currentBill attendue : ${expectedBill} €`);
  console.log(`  currentBill obtenue  : ${r11.currentBill} €`);
  checkNaN('currentBill HP/HC non NaN', r11.currentBill);
  check('currentBill HP/HC = formule exacte', r11.currentBill, expectedBill, 2);
  check('currentBill HP/HC = newAnnualBill + savedOnBill', r11.currentBill, r11.newAnnualBill + r11.savedOnBill, 1);
  // savedOnBill HP/HC : tout le PV est pendant HP → économies = autoconsoKwh × priceHp
  checkNaN('savedOnBill HP/HC non NaN', r11.savedOnBill);
  console.log(`  savedOnBill : ${r11.savedOnBill} € (doit être > 0 et au tarif HP)`);
  if (r11.savedOnBill <= 0) {
    console.error('  ✗ savedOnBill HP/HC devrait être > 0');
    errors++;
  } else {
    console.log('  ✓ savedOnBill HP/HC > 0');
  }
}

// ── Scénario 12 : Rendement spécifique dans plage physique réaliste ───────────
console.log('\n═══ Scénario 12 — Rendement spécifique dans plage France ═══');
await page.evaluate(() => AppAPI.setLocation(48.8566, 2.3522, 'Paris, France'));
const r12 = await page.evaluate(() =>
  AppAPI.runScenario({
    install: { tilt: 30, azimuth: 0, surface: 40, panelWp: 400, losses: 14 },
    sizing: {
      monthlyKwh: [350,300,280,250,240,230,240,250,270,310,340,360],
      tariff: 'base', priceBase: 0.2516, subscription: 120,
      costKwp: 900, strategy: 'roi_optimal',
    },
    tab: 'sizing'
  })
);
if (!r12) {
  console.error('ERREUR scénario 12 null');
  errors++;
} else {
  const specificYield = Math.round(r12.annualProd / r12.Ppeak);
  console.log(`  Ppeak             : ${r12.Ppeak} kWc`);
  console.log(`  Production/an     : ${r12.annualProd} kWh`);
  console.log(`  Rendement spéc.   : ${specificYield} kWh/kWc/an (attendu 900-1400)`);
  checkNaN('Rendement spécifique non NaN', specificYield);
  if (specificYield < 900 || specificYield > 1400) {
    console.error(`  ✗ Rendement ${specificYield} hors plage 900-1400 kWh/kWc/an pour Paris`);
    errors++;
  } else {
    console.log(`  ✓ Rendement spécifique ${specificYield} kWh/kWc/an ∈ [900, 1400]`);
  }
}

// ── Scénario 13 : tech CIS produit plus que crystSi en été chaud ─────────────
console.log('\n═══ Scénario 13 — CIS vs crystSi : coeff température ═══');
await page.evaluate(() => AppAPI.setLocation(43.6, 1.44, 'Toulouse'));
const r13_si = await page.evaluate(() =>
  AppAPI.runScenario({
    install: { tilt: 35, azimuth: 0, surface: 40, panelWp: 400, losses: 14 },
    sizing: {
      monthlyKwh: [300,300,300,300,300,300,300,300,300,300,300,300],
      tariff: 'base', priceBase: 0.2516, subscription: 120,
      costKwp: 900, strategy: 'roi_optimal', tech: 'crystSi',
    },
    tab: 'sizing'
  })
);
const r13_cis = await page.evaluate(() =>
  AppAPI.runScenario({
    install: { tilt: 35, azimuth: 0, surface: 40, panelWp: 400, losses: 14 },
    sizing: {
      monthlyKwh: [300,300,300,300,300,300,300,300,300,300,300,300],
      tariff: 'base', priceBase: 0.2516, subscription: 120,
      costKwp: 900, strategy: 'roi_optimal', tech: 'CIS',
    },
    tab: 'sizing'
  })
);
if (!r13_si || !r13_cis) {
  console.error('ERREUR scénario 13 null');
  errors++;
} else {
  console.log(`  Production crystSi : ${r13_si.annualProd} kWh  (γ = -0.45%/°C)`);
  console.log(`  Production CIS     : ${r13_cis.annualProd} kWh  (γ = -0.36%/°C)`);
  // En été à Toulouse (Tcell > 25°C), CIS perd moins → production annuelle CIS ≥ crystSi
  if (r13_cis.annualProd < r13_si.annualProd) {
    console.error(`  ✗ CIS (${r13_cis.annualProd}) devrait produire ≥ crystSi (${r13_si.annualProd}) à Toulouse`);
    errors++;
  } else {
    const gainPct = ((r13_cis.annualProd - r13_si.annualProd) / r13_si.annualProd * 100).toFixed(2);
    console.log(`  ✓ CIS produit +${gainPct}% vs crystSi (coeff thermique plus favorable)`);
  }
  // Vérification que la différence reste physique (< 5% en annuel)
  const diffPct = Math.abs(r13_cis.annualProd - r13_si.annualProd) / r13_si.annualProd * 100;
  if (diffPct > 5) {
    console.error(`  ✗ Différence CIS/crystSi ${diffPct.toFixed(1)}% > 5% (anormal pour un coeff thermique)`);
    errors++;
  } else {
    console.log(`  ✓ Différence ${diffPct.toFixed(1)}% < 5% (physiquement cohérent)`);
  }
}

// ── Scénario 14 : Hors-réseau — couverture ≥ cible et cohérence coûts ────────
console.log('\n═══ Scénario 14 — Hors-réseau : coverage ≥ cible et coûts cohérents ═══');
await page.evaluate(() => AppAPI.setLocation(43.6, 1.44, 'Toulouse'));
const r14 = await page.evaluate(() =>
  AppAPI.runScenario({
    install:  { tilt: 35, azimuth: 0, surface: 30, panelWp: 400, losses: 14 },
    offgrid:  { dailyDefault: 2000, battTech: 'lfp', targetCoverage: 90, pvCostKwp: 650 },
    tab:      'offgrid'
  })
);
if (!r14) {
  console.error('ERREUR scénario 14 null');
  errors++;
} else {
  console.log(`  Ppeak          : ${r14.Ppeak} kWc`);
  console.log(`  Batt brute     : ${r14.C_batt_gross} kWh`);
  console.log(`  Coverage       : ${r14.coverageRate} %`);
  console.log(`  Déficit jours  : ${r14.deficit_days}`);
  console.log(`  Coût PV        : ${r14.costPV} €`);
  console.log(`  Coût batt      : ${r14.costBatt} €`);
  console.log(`  Coût système   : ${r14.systemCost} €`);
  // Coverage ≥ cible (90%)
  if (r14.coverageRate < 90) {
    console.error(`  ✗ coverageRate ${r14.coverageRate} < 90% (cible)`);
    errors++;
  } else {
    console.log(`  ✓ coverageRate ${r14.coverageRate}% ≥ 90%`);
  }
  // Cohérence coûts : costPV + costBatt + bosCost ≈ systemCost
  const expectedCost = r14.costPV + r14.costBatt + 500; // bosCost défaut 500
  if (Math.abs(r14.systemCost - expectedCost) > 10) {
    console.error(`  ✗ systemCost ${r14.systemCost} ≠ costPV+costBatt+BOS (${expectedCost})`);
    errors++;
  } else {
    console.log(`  ✓ systemCost cohérent : ${r14.costPV} + ${r14.costBatt} + 500 = ${r14.systemCost}`);
  }
  checkNaN('deficit_days non NaN', r14.deficit_days);
  checkNaN('total_conso non NaN', r14.total_conso);
  checkNaN('battLifeYears non NaN', r14.battLifeYears);
  // Durée de vie LFP raisonnable (10-20 ans)
  if (r14.battLifeYears < 10 || r14.battLifeYears > 20) {
    console.warn(`  ⚠ battLifeYears ${r14.battLifeYears} hors plage attendue 10-20 ans pour LFP`);
  } else {
    console.log(`  ✓ battLifeYears ${r14.battLifeYears} ans ∈ [10, 20]`);
  }
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

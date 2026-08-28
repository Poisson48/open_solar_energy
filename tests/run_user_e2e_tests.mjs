/**
 * tests/run_user_e2e_tests.mjs — Tests utilisateur réels (Playwright)
 * - Multi-viewports (Android portrait/paysage, tablette, desktop)
 * - Persistance des champs lors des changements d'onglet
 * - Dimensionnement avec toutes les hypothèses
 * - Parcours journey-nav vs clic onglet vs activateTab direct
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from './playwright.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '../..');
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const VIEWPORTS = [
  { name: 'Android Pixel 7 portrait', ...devices['Pixel 7'].viewport, isMobile: true },
  { name: 'Android Pixel 7 landscape', width: 915, height: 412, isMobile: true },
  { name: 'Galaxy S8 portrait', ...devices['Galaxy S8'].viewport, isMobile: true },
  { name: 'Galaxy S8 landscape', width: 740, height: 360, isMobile: true },
  { name: 'iPad mini portrait', width: 768, height: 1024, isMobile: false },
  { name: 'Desktop FHD', width: 1920, height: 1080, isMobile: false },
  { name: 'Desktop laptop', width: 1280, height: 800, isMobile: false },
];

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = join(ROOT, decodeURIComponent((req.url || '/').split('?')[0]));
      const file = path.endsWith('/') ? join(path, 'index.html') : path;
      if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

let fails = 0;
const findings = [];
function check(label, ok, detail = '') {
  const line = `${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`;
  if (ok) console.log(`  ${line}`);
  else { console.error(`  ${line}`); fails++; findings.push({ label, detail }); }
}

const server = await startServer();
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

async function openDemo(page) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof ProjectManager !== 'undefined' && typeof AppState !== 'undefined');
  await page.waitForFunction(() => AppState.demoData != null, { timeout: 12000 });
  await page.evaluate(() => {
    seedDemoProject();
    loadProject(DEMO_PROJECT_ID);
    if (typeof closeStartupModal === 'function') closeStartupModal();
  });
  await page.waitForTimeout(350);
}

function readFields(page) {
  return page.evaluate(() => {
    const g = id => document.getElementById(id)?.value ?? null;
    const fields = {
      'sz-kwh-1': g('sz-kwh-1'), 'sz-kwh-6': g('sz-kwh-6'), 'sz-kwh-12': g('sz-kwh-12'),
      'sz-price-base': g('sz-price-base'), 'sz-subscription': g('sz-subscription'),
      'sz-discount-rate': g('sz-discount-rate'), 'sz-elec-escalation': g('sz-elec-escalation'),
      'sz-panel-degradation': g('sz-panel-degradation'), 'sz-finance-years': g('sz-finance-years'),
      'sz-surface': g('sz-surface'), 'sz-tilt': g('sz-tilt'), 'sz-azimuth': g('sz-azimuth'),
      'sz-panel-wp': g('sz-panel-wp'), 'sz-losses': g('sz-losses'),
      'sz-strategy': g('sz-strategy'), 'sz-target-coverage': g('sz-target-coverage'),
      'sz-cost-kwp': g('sz-cost-kwp'), 'sz-feedin': g('sz-feedin'),
      'sz-load-day': g('sz-load-day'), 'sz-load-night': g('sz-load-night'),
      'inp-surface': g('inp-surface'), 'inp-tilt': g('inp-tilt'),
    };
    return fields;
  });
}

console.log('═══════════════════════════════════════════════════════════');
console.log(' Open Solar Energy — tests utilisateur E2E réels');
console.log('═══════════════════════════════════════════════════════════\n');

// ── A. Persistance champs dimensionnement (bug signalé) ─────────
console.log('═══ A. Persistance valeurs → onglet Dimensionnement ═══');
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  await openDemo(page);
  await page.click('.tab-btn[data-tab="sizing"]', { force: true });
  await page.waitForTimeout(200);

  // Saisie utilisateur réaliste
  const custom = {
    'sz-kwh-1': '450', 'sz-kwh-6': '380', 'sz-kwh-12': '520',
    'sz-price-base': '0.22', 'sz-subscription': '180',
    'sz-discount-rate': '5.5', 'sz-elec-escalation': '4',
    'sz-surface': '42', 'sz-tilt': '28', 'sz-azimuth': '175',
    'sz-cost-kwp': '1350', 'sz-feedin': '0.08',
    'sz-load-day': '12', 'sz-load-night': '8',
  };
  // Saisie utilisateur réaliste (evaluate = champs visibles ou non, ex. HP/HC masque prix base)
  await page.evaluate((vals) => {
    for (const [id, val] of Object.entries(vals)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const strat = document.getElementById('sz-strategy');
    if (strat) { strat.value = 'bill_coverage_pct'; strat.dispatchEvent(new Event('change')); }
    const tgt = document.getElementById('sz-target-coverage');
    if (tgt) { tgt.value = '75'; tgt.dispatchEvent(new Event('input')); }
  }, custom);

  const before = await readFields(page);

  // Parcours 1 : Lieu → retour Dimensionnement (clic onglet)
  await page.click('.tab-btn[data-tab="location"]', { force: true });
  await page.waitForTimeout(250);
  await page.click('.tab-btn[data-tab="sizing"]', { force: true });
  await page.waitForTimeout(250);
  let after = await readFields(page);
  for (const [k, v] of Object.entries(custom)) {
    check(`[tab click] ${k} conservé`, after[k] === v, `attendu=${v} obtenu=${after[k]}`);
  }
  check('[tab click] stratégie conservée', after['sz-strategy'] === 'bill_coverage_pct');
  check('[tab click] couverture cible conservée', after['sz-target-coverage'] === '75');

  // Parcours 2 : Système PV → retour (sync install)
  await page.click('.tab-btn[data-tab="grid"]', { force: true });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const el = document.getElementById('inp-surface');
    if (el) { el.value = '55'; el.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.click('.tab-btn[data-tab="sizing"]', { force: true });
  await page.waitForTimeout(250);
  after = await readFields(page);
  check('[grid→sizing] surface synchronisée depuis grid', after['sz-surface'] === '55', after['sz-surface']);
  check('[grid→sizing] kWh janvier conservé', after['sz-kwh-1'] === '450');
  check('[grid→sizing] prix base conservé', after['sz-price-base'] === '0.22');

  // Parcours 3 : activateTab direct (barre projet / code) SANS readInstallFromTab
  await page.evaluate(() => {
    const el = document.getElementById('sz-surface');
    if (el) { el.value = '48'; el.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.evaluate(() => activateTab('location'));
  await page.waitForTimeout(200);
  await page.evaluate(() => activateTab('sizing'));
  await page.waitForTimeout(200);
  after = await readFields(page);
  check('[activateTab direct] surface sizing conservée', after['sz-surface'] === '48', after['sz-surface']);
  check('[activateTab direct] kWh juin conservé', after['sz-kwh-6'] === '380');

  // Parcours 4 : Site → goNextPrimaryTab (journey nav)
  await page.evaluate(() => activateTab('site'));
  await page.waitForTimeout(200);
  await page.evaluate(() => goNextPrimaryTab());
  await page.waitForTimeout(300);
  after = await readFields(page);
  check('[journey nav] onglet actif = sizing',
    await page.evaluate(() => AppState.activeTab === 'sizing'),
    await page.evaluate(() => AppState.activeTab));
  check('[journey nav] discount-rate conservé', after['sz-discount-rate'] === '5.5');
  check('[journey nav] feedin conservé', after['sz-feedin'] === '0.08');
  check('[journey nav] load day/night conservés',
    after['sz-load-day'] === '12' && after['sz-load-night'] === '8');

  // Parcours 5 : calcul dimensionnement puis re-clic onglet
  const calcResult = await page.evaluate(async () => {
    calcSizing();
    await new Promise(r => setTimeout(r, 150));
    return {
      hasResult: !!AppState.lastSizingResult,
      ppeak: AppState.lastSizingResult?.Ppeak,
      disc: AppState.lastSizingResult?.discountRate,
      esc: AppState.lastSizingResult?.elecEscalation,
      strategy: AppState.lastSizingInput?.sizing?.strategy,
      target: AppState.lastSizingInput?.sizing?.targetCoveragePct,
      annualConso: AppState.lastSizingInput?.bill?.monthlyKwh?.reduce((s, v) => s + v, 0),
    };
  });
  check('calcSizing produit un résultat', calcResult.hasResult && calcResult.ppeak > 0, `Ppeak=${calcResult.ppeak}`);
  check('calcSizing utilise discount 5.5%', Math.abs(calcResult.disc - 0.055) < 0.001, String(calcResult.disc));
  check('calcSizing utilise hausse élec 4%', Math.abs(calcResult.esc - 0.04) < 0.001, String(calcResult.esc));
  check('calcSizing stratégie couverture facture', calcResult.strategy === 'bill_coverage_pct', calcResult.strategy);
  check('calcSizing conso mensuelle prise en compte', calcResult.annualConso > 3000, String(calcResult.annualConso));

  // Re-clic dimensionnement après calcul
  await page.click('.tab-btn[data-tab="grid"]', { force: true });
  await page.waitForTimeout(150);
  await page.click('.tab-btn[data-tab="sizing"]', { force: true });
  await page.waitForTimeout(200);
  after = await readFields(page);
  check('[post-calcul] champs saisis toujours là', after['sz-kwh-1'] === '450' && after['sz-discount-rate'] === '5.5');
  const resultsHtml = await page.evaluate(() => document.getElementById('sizing-results')?.innerHTML || '');
  check('[post-calcul] résultats affichés ou stale', /ose-rec-summary|Paramètres modifiés|Dimensionner/.test(resultsHtml));

  check('aucune pageerror (persistance)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await page.close();
}

// ── B. Multi-viewports : layout + saisie + dimensionnement ──────
console.log('\n═══ B. Multi-viewports (portrait / paysage / desktop) ═══');
for (const vp of VIEWPORTS) {
  console.log(`\n  -- ${vp.name} (${vp.width}×${vp.height}) --`);
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
  });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  await openDemo(page);
  await page.click('.tab-btn[data-tab="sizing"]', { force: true });
  await page.waitForTimeout(200);

  const layout = await page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const sw = document.documentElement.scrollWidth;
    const header = document.querySelector('header');
    const tabs = document.querySelector('.tabs-bar');
    const btnCalc = document.getElementById('btn-calc-sizing');
    const r = btnCalc?.getBoundingClientRect();
    return {
      overflow: sw - cw,
      headerH: header?.getBoundingClientRect().height || 0,
      tabVisible: tabs?.getBoundingClientRect().width > 0,
      btnCalcVisible: r && r.width > 20 && r.height > 20 && r.top >= 0 && r.left >= 0 && r.right <= cw + 2,
      btnCalcText: btnCalc?.textContent?.trim().slice(0, 30),
    };
  });
  check(`${vp.name}: pas débordement horizontal`, layout.overflow <= 10, `Δ=${layout.overflow}px`);
  check(`${vp.name}: bouton Dimensionner visible`, layout.btnCalcVisible, layout.btnCalcText);

  // Saisie + calcul sur chaque viewport
  await page.locator('#sz-kwh-1').fill('400');
  await page.locator('#sz-kwh-1').dispatchEvent('input');
  const calc = await page.evaluate(async () => {
    calcSizing();
    await new Promise(r => setTimeout(r, 120));
    return { ok: !!AppState.lastSizingResult?.Ppeak, ppeak: AppState.lastSizingResult?.Ppeak };
  });
  check(`${vp.name}: dimensionnement calculé`, calc.ok, `Ppeak=${calc.ppeak}`);
  check(`${vp.name}: pas d'erreur JS`, pageErrors.length === 0, pageErrors[0] || '');

  // Grille graphiques
  const chartCols = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'ose-charts-grid';
    probe.style.cssText = 'position:absolute;left:-9999px';
    document.body.appendChild(probe);
    const cols = getComputedStyle(probe).gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
    probe.remove();
    return cols.length;
  });
  const isLandscape = vp.width > vp.height;
  const expectOneCol = vp.width <= 900 && !(isLandscape && vp.height <= 520);
  check(`${vp.name}: grille graphiques (${expectOneCol ? '1' : '2'} col)`,
    expectOneCol ? chartCols <= 1 : chartCols >= 2, String(chartCols));

  await page.close();
}

// ── C. Scénario utilisateur complet démo → modifier → dimensionner ─
console.log('\n═══ C. Parcours utilisateur complet (démo modifiée) ═══');
{
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await openDemo(page);

  // Mobile : ouvrir onglets avancés si besoin
  await page.evaluate(() => {
    if (typeof window.__oseSyncAdvancedTabs === 'function') window.__oseSyncAdvancedTabs();
    const more = document.getElementById('btn-toggle-advanced-tabs');
    if (more && getComputedStyle(more).display !== 'none') more.click();
  });
  await page.waitForTimeout(150);

  // Lieu
  await page.click('.tab-btn[data-tab="location"]', { force: true });
  await page.waitForTimeout(300);

  // Dimensionnement mobile
  await page.click('.tab-btn[data-tab="sizing"]', { force: true });
  await page.waitForTimeout(200);

  const r = await page.evaluate(async () => {
    // Modifier objectif autoconso 90%
    const strat = document.getElementById('sz-strategy');
    if (strat) { strat.value = 'autoconso_pct'; strat.dispatchEvent(new Event('change')); }
    const tgt = document.getElementById('sz-target-coverage');
    if (tgt) tgt.value = '90';

    calcSizing();
    await new Promise(res => setTimeout(res, 150));

    const rec = AppState.lastSizingResult;
    return {
      autoconso: rec?.autoconsoRate,
      coverage: rec?.coverageRate,
      ppeak: rec?.Ppeak,
      hasSummary: /ose-rec-summary/.test(document.getElementById('sizing-results')?.innerHTML || ''),
      janKwh: document.getElementById('sz-kwh-1')?.value,
    };
  });
  check('mobile: démo conso toujours présente', parseFloat(r.janKwh) > 0, r.janKwh);
  check('mobile: autoconso ≥ 89%', r.autoconso >= 89.5, String(r.autoconso));
  check('mobile: UI résumé dimensionnement', r.hasSummary);
  check('mobile: Ppeak > 0', r.ppeak > 0, String(r.ppeak));

  await page.close();
}

await browser.close();
server.close();

writeFileSync(join(ROOT, 'tests/user-e2e-report.json'), JSON.stringify({
  timestamp: new Date().toISOString(),
  fails,
  findings,
}, null, 2));

console.log(`\n${'═'.repeat(59)}`);
console.log(fails === 0 ? '✅ TESTS UTILISATEUR E2E OK' : `❌ ${fails} ÉCHEC(S) — voir tests/user-e2e-report.json`);
console.log('═'.repeat(59));
process.exit(fails === 0 ? 0 : 1);

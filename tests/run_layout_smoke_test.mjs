/**
 * tests/run_layout_smoke_test.mjs — Smoke test Playwright de l'onglet "Implantation"
 * Usage : node tests/run_layout_smoke_test.mjs
 *
 * Vérifie :
 *   - aucune pageerror JS au chargement
 *   - l'onglet "Implantation" s'ouvre (bouton avancé → onglet)
 *   - le canvas #layout-canvas a un contexte 2D valide et contient des pixels non blancs
 *   - la légende (panneaux placés, surface, couverture) est renseignée
 *   - les contrôles (nPanels, tilt, azimuth, roof) redessinent sans erreur
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/data/leo/memoire_des_cevennes/node_modules/playwright/index.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '../..');
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

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
function check(label, ok, detail = '') {
  if (ok) console.log(`  \u2713 ${label}${detail ? ' \u2014 ' + detail : ''}`);
  else { console.error(`  \u2717 ${label}${detail ? ' \u2014 ' + detail : ''}`); fails++; }
}

const server = await startServer();
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({
  headless: true,
  executablePath: '/snap/bin/chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

console.log('== Chargement de l\'application ==');
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// Ferme la modale de démarrage (hub projets) — même approche que run_journey_tests.mjs
await page.evaluate(() => {
  if (typeof closeStartupModal === 'function') closeStartupModal();
});
await page.waitForTimeout(200);

console.log('\n== Ouverture des outils avancés + onglet Implantation ==');
const advToggle = page.locator('#btn-toggle-advanced-tabs');
check('bouton "Outils avancés" présent', await advToggle.count() > 0);
await advToggle.click({ force: true });
await page.waitForTimeout(200);

const layoutTabBtn = page.locator('.tab-btn[data-tab="layout"]');
check('onglet "Implantation" visible après clic', await layoutTabBtn.isVisible().catch(() => false));
await layoutTabBtn.click({ force: true });
await page.waitForTimeout(300);

const pane = page.locator('#tab-layout');
check('panneau #tab-layout actif', await pane.evaluate(el => el.classList.contains('active')).catch(() => false));

console.log('\n== Vérification du canvas ==');
const canvasInfo = await page.evaluate(() => {
  const c = document.getElementById('layout-canvas');
  if (!c) return { exists: false };
  const ctx = c.getContext('2d');
  if (!ctx) return { exists: true, ctxOk: false };
  const w = c.width, h = c.height;
  let nonWhite = 0;
  try {
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < data.length; i += 4 * 97) { // échantillonnage
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a > 0 && !(r === 255 && g === 255 && b === 255)) nonWhite++;
    }
  } catch (e) { return { exists: true, ctxOk: true, w, h, error: String(e) }; }
  return { exists: true, ctxOk: true, w, h, nonWhite };
});
check('canvas #layout-canvas existe', canvasInfo.exists);
check('getContext("2d") fonctionne', canvasInfo.ctxOk === true, canvasInfo.error || '');
check('canvas a une taille non nulle', (canvasInfo.w || 0) > 0 && (canvasInfo.h || 0) > 0, `${canvasInfo.w}x${canvasInfo.h}`);
check('canvas contient des pixels non blancs (rendu visible)', (canvasInfo.nonWhite || 0) > 0, `${canvasInfo.nonWhite} échantillons`);

console.log('\n== Légende ==');
const legend = await page.evaluate(() => ({
  panels: document.getElementById('lay-kpi-panels')?.textContent,
  dims: document.getElementById('lay-kpi-grid-dims')?.textContent,
  surface: document.getElementById('lay-kpi-surface')?.textContent,
  roof: document.getElementById('lay-kpi-roof')?.textContent,
  coverage: document.getElementById('lay-kpi-coverage')?.textContent,
}));
check('légende panneaux renseignée', !!legend.panels && legend.panels !== '-', legend.panels);
check('légende rangées×colonnes renseignée', !!legend.dims && legend.dims !== '-', legend.dims);
check('légende surface utilisée renseignée', !!legend.surface && legend.surface !== '-', legend.surface);
check('légende surface toiture renseignée', !!legend.roof && legend.roof !== '-', legend.roof);
check('légende taux de couverture renseigné', !!legend.coverage && legend.coverage !== '-', legend.coverage);

console.log('\n== Interaction : changement des contrôles ==');
await page.fill('#lay-npanels', '20');
await page.locator('#lay-npanels').dispatchEvent('input');
await page.fill('#lay-rows', '4');
await page.locator('#lay-rows').dispatchEvent('input');
await page.fill('#lay-tilt', '15');
await page.locator('#lay-tilt').dispatchEvent('input');
await page.fill('#lay-azimuth', '-45');
await page.locator('#lay-azimuth').dispatchEvent('input');
await page.waitForTimeout(200);
const legend2 = await page.evaluate(() => ({
  panels: document.getElementById('lay-kpi-panels')?.textContent,
  dims: document.getElementById('lay-kpi-grid-dims')?.textContent,
}));
check('légende mise à jour après changement des contrôles', legend2.dims?.includes('4 rangées') || legend2.dims?.includes('4 rangée'), legend2.dims);
check('nombre de panneaux mis à jour', legend2.panels?.startsWith('20'), legend2.panels);

console.log('\n== Bouton de synchronisation ("Depuis Système PV") ==');
await page.click('.tab-btn[data-tab="grid"]', { force: true }).catch(() => {});
await page.waitForTimeout(150);
await page.click('#btn-calc-grid', { force: true }).catch(() => {});
await page.waitForTimeout(300);
await layoutTabBtn.click({ force: true });
await page.waitForTimeout(150);
await page.click('button:has-text("Depuis Système PV")', { force: true }).catch(() => {});
await page.waitForTimeout(200);
const npanelsAfterSync = await page.inputValue('#lay-npanels').catch(() => null);
check('synchronisation "Depuis Système PV" exécutée sans erreur', pageErrors.length === 0, `nPanels=${npanelsAfterSync}`);

console.log('\n== Export image ==');
const exportOk = await page.evaluate(() => {
  const c = document.getElementById('layout-canvas');
  try { const url = c.toDataURL('image/png'); return url.startsWith('data:image/png'); }
  catch (e) { return false; }
});
check('canvas exportable en PNG (toDataURL)', exportOk);

console.log('\n== Erreurs JS ==');
check('aucune pageerror', pageErrors.length === 0, pageErrors.join(' | '));
check('aucune erreur console critique', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();
server.close();

console.log(`\n${fails === 0 ? '✅ TOUS LES TESTS PASSENT' : `❌ ${fails} test(s) en échec`}`);
process.exit(fails === 0 ? 0 : 1);

/**
 * tests/run_layout_smoke_test.mjs — Smoke test Playwright de l'onglet "Implantation"
 * Usage : node tests/run_layout_smoke_test.mjs
 *
 * Vérifie :
 *   - aucune pageerror JS au chargement
 *   - l'onglet "Implantation" s'ouvre (bouton avancé → onglet)
 *   - la vue 3D (#layout-3d-host WebGL ou #layout-canvas 2D) a un rendu visible
 *   - la légende (panneaux placés, surface, couverture) est renseignée
 *   - les contrôles (nPanels, tilt, azimuth, roof) redessinent sans erreur
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './playwright.mjs';

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

/** Inspecte le canvas implantation (WebGL Three.js ou fallback 2D). */
function canvasInspectScript() {
  const host = document.getElementById('layout-3d-host');
  const c = host?.querySelector('canvas') || document.getElementById('layout-canvas');
  if (!c) return { exists: false };
  const w = c.width, h = c.height;
  const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
  if (gl) {
    let nonWhite = 0;
    try {
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      for (let i = 0; i < buf.length; i += 4 * 97) {
        const r = buf[i], g = buf[i + 1], b = buf[i + 2], a = buf[i + 3];
        if (a > 0 && !(r === 255 && g === 255 && b === 255)) nonWhite++;
      }
    } catch (e) {
      return { exists: true, webgl: true, ctxOk: true, w, h, error: String(e) };
    }
    if (nonWhite === 0) {
      try {
        const url = c.toDataURL('image/png');
        nonWhite = url.length > 5000 ? 1 : 0;
      } catch (_) {}
    }
    return { exists: true, webgl: true, ctxOk: true, w, h, nonWhite };
  }
  const ctx = c.getContext('2d');
  if (!ctx) return { exists: true, ctxOk: false, w, h };
  let nonWhite = 0;
  try {
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < data.length; i += 4 * 97) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a > 0 && !(r === 255 && g === 255 && b === 255)) nonWhite++;
    }
  } catch (e) {
    return { exists: true, ctxOk: true, webgl: false, w, h, error: String(e) };
  }
  return { exists: true, ctxOk: true, webgl: false, w, h, nonWhite };
}

const server = await startServer();
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const t = msg.text() || '';
  // Ignorer 403 réseau (ex. API GitHub rate-limit sur check MAJ) — pas un bug app
  if (/Failed to load resource:.*\b403\b/i.test(t)) return;
  if (/net::ERR_/i.test(t) && /api\.github\.com/i.test(t)) return;
  if (/releases\.atom|Poisson48\/open_solar_energy/i.test(t)) return;
  if (/ERR_FAILED/i.test(t)) return;
  consoleErrors.push(t);
});

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

console.log('\n== Vérification du canvas / vue 3D ==');
await page.waitForTimeout(400);
const canvasInfo = await page.evaluate(canvasInspectScript);
check('canvas implantation existe', canvasInfo.exists);
check('contexte rendu valide (WebGL ou 2D)', canvasInfo.ctxOk === true, canvasInfo.error || (canvasInfo.webgl ? 'WebGL' : '2D'));
check('canvas a une taille non nulle', (canvasInfo.w || 0) > 0 && (canvasInfo.h || 0) > 0, `${canvasInfo.w}x${canvasInfo.h}`);
check('rendu visible (pixels non blancs)', (canvasInfo.nonWhite || 0) > 0, `${canvasInfo.nonWhite} échantillons`);

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

console.log('\n== Lien "Vers Câbles (longueur DC)" ==');
await layoutTabBtn.click({ force: true });
await page.waitForTimeout(150);
await page.fill('#lay-npanels', '18');
await page.locator('#lay-npanels').dispatchEvent('input');
await page.fill('#lay-rows', '3');
await page.locator('#lay-rows').dispatchEvent('input');
await page.fill('#lay-panel-w', '1.1');
await page.locator('#lay-panel-w').dispatchEvent('input');
await page.waitForTimeout(150);
await page.click('button:has-text("Vers Câbles")', { force: true }).catch(() => {});
await page.waitForTimeout(250);
const cablesLink = await page.evaluate(() => ({
  activeTab: AppState.activeTab,
  cblRows: document.getElementById('cbl-dc-rows')?.value,
  cblNpanels: document.getElementById('cbl-dc-npanels')?.value,
  cblL: parseFloat(document.getElementById('cbl-dc-l')?.value || '0'),
}));
check('activation de l\'onglet Câbles après le lien implantation', cablesLink.activeTab === 'cables', cablesLink.activeTab);
check('rangées transmises à l\'onglet Câbles', cablesLink.cblRows === '3', cablesLink.cblRows);
check('longueur DC estimée transmise (> 0)', cablesLink.cblL > 0, String(cablesLink.cblL));
// 18 panneaux / 3 rangées = 6/rangée, pitch 1.1m, distance par défaut 10m, marge 1.15
// → (6*1.1 + 10) * 1.15 ≈ 18.7 m
check('longueur DC cohérente avec l\'implantation (~18.7 m)', Math.abs(cablesLink.cblL - 18.7) < 1, String(cablesLink.cblL));

console.log('\n== Export image ==');
const exportOk = await page.evaluate(() => {
  const host = document.getElementById('layout-3d-host');
  const c = host?.querySelector('canvas') || document.getElementById('layout-canvas');
  try { const url = c.toDataURL('image/png'); return url.startsWith('data:image/png'); }
  catch (e) { return false; }
});
check('canvas exportable en PNG (toDataURL)', exportOk);

console.log('\n== Multi-toiture : ajout d\'une 2e orientation ==');
await layoutTabBtn.click({ force: true });
await page.waitForTimeout(150);
const beforeAdd = await page.evaluate(() => ({
  panelsKpi: document.getElementById('lay-kpi-panels')?.textContent,
  totalPanels: typeof LayoutRoofs !== 'undefined' ? LayoutRoofs.totalPanels() : 0,
}));
const addBtn = page.locator('button:has-text("Ajouter toiture")');
if (await addBtn.count() > 0) {
  await addBtn.click({ force: true });
} else {
  await page.evaluate(() => { if (typeof LayoutRoofs !== 'undefined') LayoutRoofs.addRoof(); });
}
await page.waitForTimeout(250);

const multiRoof = await page.evaluate(() => {
  const tabs = document.querySelectorAll('.lay-roof-tab');
  const roofs = typeof LayoutRoofs !== 'undefined' ? LayoutRoofs.getRoofs() : [];
  const azimuths = roofs.map(r => r.azimuth);
  if (typeof renderPanelLayoutTab === 'function') renderPanelLayoutTab();
  const host = document.getElementById('layout-3d-host');
  const c = host?.querySelector('canvas') || document.getElementById('layout-canvas');
  let nonWhite = 0;
  if (c) {
    const w = c.width, h = c.height;
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      try {
        const buf = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        for (let i = 0; i < buf.length; i += 4 * 97) {
          const r = buf[i], g = buf[i + 1], b = buf[i + 2], a = buf[i + 3];
          if (a > 0 && !(r === 255 && g === 255 && b === 255)) nonWhite++;
        }
      } catch (_) {}
      if (!nonWhite) {
        try { nonWhite = c.toDataURL('image/png').length > 5000 ? 1 : 0; } catch (_) {}
      }
    } else {
      const ctx = c.getContext('2d');
      if (ctx && w > 0 && h > 0) {
        try {
          const data = ctx.getImageData(0, 0, w, h).data;
          for (let i = 0; i < data.length; i += 4 * 97) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a > 0 && !(r === 255 && g === 255 && b === 255)) nonWhite++;
          }
        } catch (_) {}
      }
    }
  }
  return {
    tabCount: tabs.length,
    roofCount: roofs.length,
    azimuths,
    distinctAz: new Set(azimuths).size,
    nonWhite,
    panelsKpi: document.getElementById('lay-kpi-panels')?.textContent,
    totalPanels: typeof LayoutRoofs !== 'undefined' ? LayoutRoofs.totalPanels() : null,
  };
});
check('2 onglets toiture après ajout', multiRoof.tabCount === 2, `tabs=${multiRoof.tabCount}`);
check('2 toitures en mémoire', multiRoof.roofCount === 2, `roofs=${multiRoof.roofCount}`);
check('azimuts distincts entre toitures', multiRoof.distinctAz >= 2, multiRoof.azimuths.join(', '));
check('canvas multi-toiture contient des pixels', (multiRoof.nonWhite || 0) > 0, `${multiRoof.nonWhite} échantillons`);
check('KPI panneaux total mis à jour (+6 panneaux)', multiRoof.totalPanels === beforeAdd.totalPanels + 6,
  `kpi=${multiRoof.panelsKpi} total=${multiRoof.totalPanels} avant=${beforeAdd.totalPanels}`);

console.log('\n== Erreurs JS ==');
check('aucune pageerror', pageErrors.length === 0, pageErrors.join(' | '));
check('aucune erreur console critique', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();
server.close();

console.log(`\n${fails === 0 ? '✅ TOUS LES TESTS PASSENT' : `❌ ${fails} test(s) en échec`}`);
process.exit(fails === 0 ? 0 : 1);

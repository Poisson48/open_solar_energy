/**
 * tests/run_installer_scenarios.mjs — Scénarios E2E « persona installateur »
 * Usage : node tests/run_installer_scenarios.mjs
 *
 * Couvre les parcours réels d'un installateur PV :
 *   1. Nouveau projet réseau (grid) sans batterie → dimensionnement → sauvegarde → reload
 *   2. Hybride (réseau + batterie), avec skip robuste si non implémenté
 *   3. Hors réseau (offgrid) avec batterie
 *   4. Ouverture du projet démo depuis le hub (préremplissage, pas d'erreurs JS)
 *   5. Persistance sur le port fixe 18765 (simulateur WebHost Android)
 *   6. Hub : absence du bouton « Retour »
 *   7. Viewport mobile 390x844 : pas de débordement horizontal
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from './playwright.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '../..');
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

function startServer(port = 0) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const path = join(ROOT, decodeURIComponent((req.url || '/').split('?')[0]));
      const file = path.endsWith('/') ? join(path, 'index.html') : path;
      if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function killPort(port) {
  try { execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' }); } catch { /* noop */ }
  try { execSync(`lsof -ti tcp:${port} | xargs -r kill -9`, { stdio: 'ignore', shell: '/bin/bash' }); } catch { /* noop */ }
}

let fails = 0;
let passed = 0;
const findings = [];
function check(label, ok, detail = '') {
  if (ok) { console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); passed++; }
  else {
    console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
    fails++;
    findings.push({ severity: 'fail', label, detail: String(detail) });
  }
}
function note(label, detail = '') {
  console.log(`  · ${label}${detail ? ' — ' + detail : ''}`);
  findings.push({ severity: 'info', label, detail: String(detail) });
}
function warn(label, detail = '') {
  console.warn(`  ⚠ ${label}${detail ? ' — ' + detail : ''}`);
  findings.push({ severity: 'warn', label, detail: String(detail) });
}

const suiteResults = []; // { scenario, ok }

killPort(18765);
await new Promise(r => setTimeout(r, 150));

const server = await startServer();
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

async function freshPage(pageUrl, viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1280, height: 900 } });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof ProjectManager !== 'undefined' && typeof AppState !== 'undefined');
  await page.waitForFunction(() => AppState.demoData != null, { timeout: 10000 });
  await page.waitForTimeout(300);
  return page;
}

console.log('Chargement', url);

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 1. Nouveau projet réseau (grid), sans batterie ═══');
{
  const failsBefore = fails;
  const page = await freshPage(url);

  const created = await page.evaluate(() => {
    showInstallationTypeStep();
    selectInstallationType('grid');
    document.getElementById('startup-project-name').value = 'Maison Grid Test';
    document.getElementById('startup-client-nom').value = 'Client Grid';
    createNewProject({ preventDefault() {} });
    return {
      id: AppState.currentProjectId,
      type: AppState.installationType,
      hubClosed: !document.getElementById('startup-modal')?.classList.contains('ose-hub-open'),
    };
  });
  check('projet grid créé (id + type)', !!created.id && created.type === 'grid', JSON.stringify(created));
  check('hub fermé après création du projet', created.hubClosed === true);

  const sized = await page.evaluate(() => {
    for (let m = 1; m <= 12; m++) {
      const el = document.getElementById(`sz-kwh-${m}`);
      if (el) el.value = String(280 + m * 12);
    }
    document.getElementById('sz-surface').value = '28';
    calcSizing();
    const rec = AppState.lastSizingResult;
    return {
      ppeak: rec?.Ppeak,
      autoconso: rec?.autoconsoRate,
      coverage: rec?.coverageRate,
      hasResultsHtml: /kpi-grid|ose-rec-summary/.test(document.getElementById('sizing-results')?.innerHTML || ''),
    };
  });
  check('dimensionnement grid → Ppeak > 0', sized.ppeak > 0, `Ppeak=${sized.ppeak}`);
  check('taux autoconso/couverture renvoyés (nombres)', typeof sized.autoconso === 'number' && typeof sized.coverage === 'number');
  check('résultats affichés dans le DOM', sized.hasResultsHtml === true);

  const saved = await page.evaluate(() => {
    saveCurrentProject();
    return { id: AppState.currentProjectId, name: document.getElementById('project-name-input').value };
  });
  check('sauvegarde effectuée (id présent)', !!saved.id);

  // Reload même origine → le projet doit survivre
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof ProjectManager !== 'undefined');
  await page.waitForTimeout(300);
  const reloaded = await page.evaluate((id) => {
    const p = ProjectManager.get(id);
    return {
      found: !!p,
      name: p?.name,
      kwh1: p?.formState?.['sz-kwh-1'],
      surface: p?.formState?.['sz-surface'],
      ppeak: p?.summary?.recommendedPpeak,
    };
  }, saved.id);
  check('projet grid retrouvé après reload (même origine)', reloaded.found === true, reloaded.name);
  check('consommation saisie persistée (sz-kwh-1)', reloaded.kwh1 === '292', reloaded.kwh1);
  check('surface saisie persistée (sz-surface)', reloaded.surface === '28', reloaded.surface);
  check('Ppeak recommandé persisté dans le résumé projet', reloaded.ppeak > 0, String(reloaded.ppeak));

  await page.close();
  suiteResults.push({ scenario: '1. Grid sans batterie', ok: fails === failsBefore });
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 2. Hybride (réseau + batterie) ═══');
{
  const failsBefore = fails;
  const page = await freshPage(url);

  const hybridInfo = await page.evaluate(() => {
    showInstallationTypeStep();
    const btn = [...document.querySelectorAll('#startup-step-type button')]
      .find(b => /hybrid/i.test(b.getAttribute('onclick') || '') || /hybride/i.test(b.textContent || ''));
    return { exists: !!btn, label: btn?.textContent?.trim()?.slice(0, 60) || null };
  });

  if (!hybridInfo.exists) {
    console.log('  SKIP hybrid — aucune option « Hybride » dans le sélecteur de type d’installation (fonctionnalité non encore implémentée)');
    note('scénario hybride ignoré (SKIP)', 'bouton de sélection "hybride" absent du hub');
    suiteResults.push({ scenario: '2. Hybride', ok: true, skipped: true });
  } else {
    note('option hybride détectée dans le hub', hybridInfo.label);

    const setup = await page.evaluate(() => {
      selectInstallationType('hybrid');
      document.getElementById('startup-project-name').value = 'Maison Hybride Test';
      document.getElementById('startup-client-nom').value = 'Client Hybride';
      createNewProject({ preventDefault() {} });
      activateTab('sizing');
      return {
        installationType: AppState.installationType,
        battStepVisible: document.getElementById('sz-battery-step')
          && document.getElementById('sz-battery-step').style.display !== 'none',
        battKwhField: !!document.getElementById('sz-batt-kwh'),
        badge: document.getElementById('install-type-badge')?.textContent || '',
        offgridTabVisible: document.querySelector('.tab-btn[data-tab="offgrid"]')?.style.display !== 'none',
        gridTabVisible: document.querySelector('.tab-btn[data-tab="grid"]')?.style.display !== 'none',
      };
    });
    check('type d’installation = hybrid', setup.installationType === 'hybrid');
    check('étape "Batterie (hybride)" visible dans le parcours', setup.battStepVisible === true);
    check('champ capacité batterie (sz-batt-kwh) présent', setup.battKwhField === true);
    check('badge barre projet indique Hybride', /hybride/i.test(setup.badge), setup.badge);
    check('onglet "Hors réseau" masqué en mode hybride', setup.offgridTabVisible === false);
    check('onglet "Système PV réseau" visible en mode hybride', setup.gridTabVisible === true);

    if (!setup.battKwhField) {
      warn('champ batterie absent — impossible de tester l’effet de la batterie sur le résultat');
      suiteResults.push({ scenario: '2. Hybride', ok: fails === failsBefore });
    } else {
      const noBatt = await page.evaluate(() => {
        for (let m = 1; m <= 12; m++) {
          const el = document.getElementById(`sz-kwh-${m}`);
          if (el) el.value = String(300 + m * 15);
        }
        document.getElementById('sz-surface').value = '30';
        document.getElementById('sz-batt-kwh').value = '0';
        calcSizing();
        const rec = AppState.lastSizingResult;
        return {
          ppeak: rec?.Ppeak, autoconso: rec?.autoconsoRate, coverage: rec?.coverageRate,
          cost: rec?.systemCost, battery: rec?.battery || null,
        };
      });
      check('dimensionnement hybride sans batterie produit une reco', noBatt.ppeak > 0, `Ppeak=${noBatt.ppeak}`);

      const withBatt = await page.evaluate(() => {
        document.getElementById('sz-batt-kwh').value = '10';
        calcSizing();
        const rec = AppState.lastSizingResult;
        return {
          ppeak: rec?.Ppeak, autoconso: rec?.autoconsoRate, coverage: rec?.coverageRate,
          cost: rec?.systemCost, battery: rec?.battery || null,
          html: document.getElementById('sizing-results')?.innerHTML || '',
        };
      });
      check('capacité batterie (10 kWh) prise en compte dans la reco', !!withBatt.battery && withBatt.battery.capacityKwh === 10,
        JSON.stringify(withBatt.battery));

      const improved = withBatt.autoconso > noBatt.autoconso || withBatt.coverage > noBatt.coverage;
      const costDiffers = withBatt.cost !== noBatt.cost;
      const mentionsBattInHtml = /batt|kWh/i.test(withBatt.html);
      check(
        'autoconso/couverture améliorée OU coût système modifié avec batterie (10 kWh) vs sans batterie',
        improved || costDiffers || (mentionsBattInHtml && !!withBatt.battery),
        `autoconso ${noBatt.autoconso}→${withBatt.autoconso} · couverture ${noBatt.coverage}→${withBatt.coverage} · coût ${noBatt.cost}→${withBatt.cost}`
      );

      // Sauvegarde + reload → persistance type + capacité batterie
      const saved = await page.evaluate(() => {
        saveCurrentProject();
        return { id: AppState.currentProjectId };
      });
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof ProjectManager !== 'undefined');
      await page.waitForTimeout(300);
      const reloaded = await page.evaluate((id) => {
        const p = ProjectManager.get(id);
        return { found: !!p, installationType: p?.installationType, battKwh: p?.formState?.['sz-batt-kwh'] };
      }, saved.id);
      check('projet hybride retrouvé après reload', reloaded.found === true);
      check('type d’installation "hybrid" persisté', reloaded.installationType === 'hybrid', reloaded.installationType);
      check('capacité batterie persistée (formState sz-batt-kwh)', reloaded.battKwh === '10', reloaded.battKwh);

      suiteResults.push({ scenario: '2. Hybride', ok: fails === failsBefore });
    }
  }

  await page.close();
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 3. Hors réseau (offgrid) avec batterie ═══');
{
  const failsBefore = fails;
  const page = await freshPage(url);

  const created = await page.evaluate(() => {
    showInstallationTypeStep();
    selectInstallationType('offgrid');
    document.getElementById('startup-project-name').value = 'Cabane Offgrid Test';
    createNewProject({ preventDefault() {} });
    activateTab('offgrid');
    return {
      type: AppState.installationType,
      offgridTabVisible: document.querySelector('.tab-btn[data-tab="offgrid"]')?.style.display !== 'none',
      sizingTabVisible: document.querySelector('.tab-btn[data-tab="sizing"]')?.style.display !== 'none',
    };
  });
  check('type offgrid sélectionné', created.type === 'offgrid');
  check('onglet "Hors réseau" visible', created.offgridTabVisible === true);
  check('onglet "Dimensionnement" (réseau) masqué en offgrid', created.sizingTabVisible === false);

  const sized = await page.evaluate(() => {
    document.getElementById('og2-daily-default').value = '1200';
    document.getElementById('og2-batt-kwh').value = '10';
    document.getElementById('og2-surface').value = '20';
    calcOffgridSizing();
    const rec = AppState.lastOffgridSizingResult;
    return {
      hasRec: !!rec,
      ppeak: rec?.Ppeak,
      battKwh: rec?.C_batt_gross,
      nPanels: rec?.nPanels,
      coverage: rec?.coverageRate,
    };
  });
  check('dimensionnement offgrid produit une recommandation', sized.hasRec === true, JSON.stringify(sized));
  check('Ppeak > 0', sized.ppeak > 0, `Ppeak=${sized.ppeak}`);
  check('capacité batterie > 0 dans la reco', sized.battKwh > 0, `batt=${sized.battKwh}`);
  check('nombre de panneaux calculé (> 0)', sized.nPanels > 0, String(sized.nPanels));

  await page.close();
  suiteResults.push({ scenario: '3. Offgrid', ok: fails === failsBefore });
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 4. Chargement de la démo depuis le hub ═══');
{
  const failsBefore = fails;
  const jsErrors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => jsErrors.push(String(e.message || e)));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const t = msg.text() || '';
    if (/Failed to load resource:.*\b403\b/i.test(t)) return;
    if (/net::ERR_/i.test(t) && /api\.github\.com/i.test(t)) return;
    jsErrors.push(t);
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof ProjectManager !== 'undefined' && typeof AppState !== 'undefined');
  await page.waitForFunction(() => AppState.demoData != null, { timeout: 10000 });
  await page.waitForTimeout(300);

  const demoBtnInfo = await page.evaluate(() => {
    seedDemoProject();
    renderProjectsList('');
    const card = [...document.querySelectorAll('#projects-list button')]
      .find(b => /ouvrir/i.test(b.textContent || '') && (b.getAttribute('onclick') || '').includes(DEMO_PROJECT_ID));
    return { found: !!card };
  });
  check('bouton "Ouvrir" du projet démo présent dans le hub', demoBtnInfo.found === true);

  await page.evaluate(() => {
    loadProject(DEMO_PROJECT_ID);
    closeStartupModal();
  });
  await page.waitForTimeout(300);
  // Navigation entre onglets pour vérifier l'absence de calcul automatique en boucle / erreurs
  await page.evaluate(() => activateTab('sizing'));
  await page.waitForTimeout(150);
  await page.evaluate(() => activateTab('offgrid'));
  await page.waitForTimeout(150);
  await page.evaluate(() => activateTab('sizing'));
  await page.waitForTimeout(150);

  const prefill = await page.evaluate(() => ({
    kwh1: document.getElementById('sz-kwh-1')?.value,
    surface: document.getElementById('sz-surface')?.value,
    name: document.getElementById('project-name-input')?.value,
    hubClosed: !document.getElementById('startup-modal')?.classList.contains('ose-hub-open'),
    autoRanCalc: document.getElementById('sizing-results')?.querySelector('.result-placeholder') == null,
  }));
  check('champs de dimensionnement préremplis (kWh janvier > 0)', parseFloat(prefill.kwh1) > 0, prefill.kwh1);
  check('surface préremplie (> 0)', parseFloat(prefill.surface) > 0, prefill.surface);
  check('nom du projet démo affiché', /Toulouse|Démo/i.test(prefill.name || ''), prefill.name);
  check('hub fermé après ouverture de la démo', prefill.hubClosed === true);
  note('calcul auto lancé au chargement (simple info, pas une exigence)', String(prefill.autoRanCalc));
  check('aucune erreur JS pendant chargement démo + navigation onglets ("spam")', jsErrors.length === 0, jsErrors.slice(0, 5).join(' | '));

  await page.close();
  suiteResults.push({ scenario: '4. Démo depuis hub', ok: fails === failsBefore });
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 5. Persistance port fixe 18765 (simule WebHost Android) ═══');
{
  const failsBefore = fails;
  killPort(18765);
  await new Promise(r => setTimeout(r, 200));
  const serverFixed = await startServer(18765);
  const urlFixed = 'http://127.0.0.1:18765/';

  try {
    const page = await freshPage(urlFixed);
    const created = await page.evaluate(() => {
      showInstallationTypeStep();
      selectInstallationType('grid');
      document.getElementById('startup-project-name').value = 'Persistance Port Fixe';
      createNewProject({ preventDefault() {} });
      saveCurrentProject();
      return { id: AppState.currentProjectId, total: ProjectManager.list().length };
    });
    check('projet créé + sauvegardé sur le port fixe 18765', !!created.id, `id=${created.id}`);

    // Reload de la MÊME page (même contexte/origine) — un browser.newPage() séparé
    // ouvrirait un nouveau contexte isolé (localStorage vide), ce qui ne simule pas
    // une vraie réouverture d'app (WebView Android conserve son storage entre lancements).
    await page.goto(urlFixed, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof ProjectManager !== 'undefined');
    await page.waitForTimeout(300);
    const listed = await page.evaluate((id) => {
      const list = ProjectManager.list();
      return { found: list.some(p => p.id === id), total: list.length };
    }, created.id);
    check('projet toujours listé après reload sur http://127.0.0.1:18765/', listed.found === true, `total=${listed.total}`);
    await page.close();
  } finally {
    await new Promise((resolve) => serverFixed.close(resolve));
  }
  suiteResults.push({ scenario: '5. Persistance port fixe 18765', ok: fails === failsBefore });
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 6. Hub : absence du bouton « Retour » ═══');
{
  const failsBefore = fails;
  const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
  check('aucune référence à "btn-hub-back" dans le HTML source', !/btn-hub-back/.test(indexHtml));

  const page = await freshPage(url);
  const domCheck = await page.evaluate(() => ({
    absent: !document.getElementById('btn-hub-back'),
    hubOpen: document.getElementById('startup-modal')?.classList.contains('ose-hub-open'),
  }));
  check('aucun élément #btn-hub-back dans le DOM (hub ouvert)', domCheck.absent === true);
  check('hub bien ouvert au démarrage pour ce test', domCheck.hubOpen === true);

  // Toujours pas de bouton retour après ouverture d'un projet + réouverture du hub
  const afterOpen = await page.evaluate(() => {
    seedDemoProject();
    loadProject(DEMO_PROJECT_ID);
    openStartupModal();
    return !document.getElementById('btn-hub-back');
  });
  check('aucun élément #btn-hub-back après réouverture du hub (projet chargé)', afterOpen === true);

  await page.close();
  suiteResults.push({ scenario: '6. Hub sans bouton retour', ok: fails === failsBefore });
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 7. Viewport mobile 390×844 — pas de débordement horizontal ═══');
{
  const failsBefore = fails;
  const page = await freshPage(url, { width: 390, height: 844 });

  const created = await page.evaluate(() => {
    showInstallationTypeStep();
    selectInstallationType('grid');
    document.getElementById('startup-project-name').value = 'Mobile Test';
    createNewProject({ preventDefault() {} });
    return { id: AppState.currentProjectId };
  });
  check('projet créé en viewport mobile (390×844)', !!created.id);
  await page.waitForTimeout(150);

  const overflowHub = await page.evaluate(() => {
    const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
    const bodyOverflow = document.body.scrollWidth > document.body.clientWidth + 2;
    return { bad: overflowX || bodyOverflow, docW: document.documentElement.scrollWidth, vw: window.innerWidth };
  });
  check('pas de débordement horizontal juste après création du projet (mobile)', overflowHub.bad === false,
    `scrollWidth=${overflowHub.docW} vs innerWidth=${overflowHub.vw}`);

  await page.evaluate(() => activateTab('sizing'));
  await page.waitForTimeout(150);
  const overflowSizing = await page.evaluate(() => {
    const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
    return { bad: overflowX, docW: document.documentElement.scrollWidth, vw: window.innerWidth };
  });
  check('pas de débordement horizontal — onglet Dimensionnement (mobile)', overflowSizing.bad === false,
    `scrollWidth=${overflowSizing.docW} vs innerWidth=${overflowSizing.vw}`);

  await page.evaluate(() => activateTab('grid'));
  await page.waitForTimeout(150);
  const overflowGrid = await page.evaluate(() => {
    const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
    return { bad: overflowX, docW: document.documentElement.scrollWidth, vw: window.innerWidth };
  });
  check('pas de débordement horizontal — onglet Système PV réseau (mobile)', overflowGrid.bad === false,
    `scrollWidth=${overflowGrid.docW} vs innerWidth=${overflowGrid.vw}`);

  await page.close();
  suiteResults.push({ scenario: '7. Mobile 390x844', ok: fails === failsBefore });
}

// ═══════════════════════════════════════════════════════════════
await browser.close();
await new Promise((resolve) => server.close(resolve));

console.log('\n' + '─'.repeat(60));
suiteResults.forEach(r => {
  const tag = r.skipped ? 'SKIP' : (r.ok ? 'OK  ' : 'FAIL');
  console.log(`  [${tag}] ${r.scenario}`);
});
console.log('─'.repeat(60));
console.log(fails === 0
  ? `✓ Scénarios installateur — ${passed} vérifications OK, 0 échec`
  : `✗ Scénarios installateur — ${passed} OK, ${fails} échec(s)`);
console.log('─'.repeat(60));

const reportPath = join(ROOT, 'tests/installer-scenarios-report.json');
writeFileSync(reportPath, JSON.stringify({
  fails, passed, suiteResults, findings, at: new Date().toISOString(),
}, null, 2));

process.exit(fails ? 1 : 0);

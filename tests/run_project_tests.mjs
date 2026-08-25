/**
 * tests/run_project_tests.mjs — Vérifie le système de projets (CRUD, démo, roundtrip)
 * Usage : node tests/run_project_tests.mjs
 * Prérequis : serveur HTTP local (lancé automatiquement) + Chromium (snap)
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
  if (ok) console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`);
  else { console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); fails++; }
}

const server = await startServer();
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({
  headless: true,
  executablePath: '/snap/bin/chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const page = await browser.newPage();
page.on('pageerror', e => console.error('[pageerror]', e.message));

console.log('Chargement', url);
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof ProjectManager !== 'undefined' && typeof AppState !== 'undefined');
await page.waitForFunction(() => AppState.demoData != null, { timeout: 8000 });
await page.waitForTimeout(400);

// Fermer le modal démarrage pour éviter les clics bloqués
await page.evaluate(() => { if (typeof closeStartupModal === 'function') closeStartupModal(); });

console.log('\n═══ 1. Seed projet démo ═══');
const demoSeed = await page.evaluate(() => {
  seedDemoProject();
  const p = ProjectManager.get(DEMO_PROJECT_ID);
  return {
    exists: !!p,
    id: p?.id,
    isDemo: p?.isDemo,
    seed: p?.demoSeedVersion,
    name: p?.name,
    slots: p?.hourlyEnedisData?.halfHourly?.length || 0,
    hasForm: !!p?.formState?.['sz-kwh-1'],
    battKwh: p?.formState?.['og2-batt-kwh'],
    tariff: p?.formState?.['sz-tariff'],
    annual: p?.summary?.annualConso,
    client: p?.client?.nom,
  };
});
check('démo présente', demoSeed.exists, demoSeed.name);
check('isDemo=true', demoSeed.isDemo === true);
check('seed version', demoSeed.seed >= 2, String(demoSeed.seed));
check('Enedis 30min ≥ 365×48', demoSeed.slots >= 365 * 48, String(demoSeed.slots));
check('formulaire conso', !!demoSeed.hasForm);
check('capacité batterie', demoSeed.battKwh === '15', String(demoSeed.battKwh));
check('tarif HP/HC', demoSeed.tariff === 'hphc');
check('client rempli', !!demoSeed.client);

console.log('\n═══ 2. Charger la démo ═══');
const loaded = await page.evaluate(async () => {
  loadProject(DEMO_PROJECT_ID);
  await new Promise(r => setTimeout(r, 500));
  return {
    currentId: AppState.currentProjectId,
    name: document.getElementById('project-name-input')?.value,
    client: AppState.currentClient?.nom,
    lat: AppState.location?.lat,
    weatherMonths: AppState.weatherData?.length,
    enedisSlots: AppState.hourlyEnedisData?.halfHourly?.length || 0,
    szJan: document.getElementById('sz-kwh-1')?.value,
    battTech: document.getElementById('og2-batt-tech')?.value,
    battKwh: document.getElementById('og2-batt-kwh')?.value,
    dvClient: document.getElementById('dv-cli-name')?.value,
    installType: AppState.installationType,
  };
});
check('currentProjectId = démo', loaded.currentId === 'demo_ose_v2');
check('nom projet dans barre', /Toulouse|Démo/i.test(loaded.name || ''), loaded.name);
check('client AppState', !!loaded.client);
check('météo 12 mois', loaded.weatherMonths === 12);
check('Enedis en mémoire', loaded.enedisSlots >= 365 * 48, String(loaded.enedisSlots));
check('sz-kwh-1 restauré', parseFloat(loaded.szJan) > 0, loaded.szJan);
check('batt tech', !!loaded.battTech, loaded.battTech);
check('batt kwh champ', loaded.battKwh === '15', loaded.battKwh);
check('devis client prérempli', !!loaded.dvClient, loaded.dvClient);

console.log('\n═══ 3. Sauvegarde préserve isDemo ═══');
const afterSave = await page.evaluate(() => {
  saveCurrentProject();
  const p = ProjectManager.get(DEMO_PROJECT_ID);
  return { isDemo: p?.isDemo, seed: p?.demoSeedVersion, slots: p?.hourlyEnedisData?.halfHourly?.length || 0 };
});
check('isDemo conservé après save', afterSave.isDemo === true);
check('seed conservé', afterSave.seed >= 2, String(afterSave.seed));
check('Enedis conservé', afterSave.slots >= 365 * 48);

console.log('\n═══ 4. Nouveau projet + save + reload ═══');
const crud = await page.evaluate(() => {
  // Nouveau projet
  AppState.currentProjectId = null;
  AppState.currentClient = { nom: 'Test CRUD', adresse: '1 rue Test', tel: '0600000000', email: 't@t.fr' };
  AppState.installationType = 'grid';
  document.getElementById('project-name-input').value = 'Projet Test CRUD';
  document.getElementById('sz-kwh-1').value = '111';
  document.getElementById('sz-kwh-2').value = '222';
  document.getElementById('inp-tilt').value = '27';
  if (document.getElementById('og2-batt-kwh')) document.getElementById('og2-batt-kwh').value = '9.5';
  saveCurrentProject();
  const id = AppState.currentProjectId;
  const saved = ProjectManager.get(id);

  // Modifier puis recharger
  document.getElementById('sz-kwh-1').value = '999';
  loadProject(id);
  return {
    id,
    savedOk: !!saved,
    savedName: saved?.name,
    savedClient: saved?.client?.nom,
    formJan: saved?.formState?.['sz-kwh-1'],
    formBatt: saved?.formState?.['og2-batt-kwh'],
    reloadedJan: document.getElementById('sz-kwh-1')?.value,
    reloadedTilt: document.getElementById('inp-tilt')?.value,
    reloadedBatt: document.getElementById('og2-batt-kwh')?.value,
    reloadedClient: AppState.currentClient?.nom,
    listHas: ProjectManager.list().some(p => p.id === id),
  };
});
check('projet créé', crud.savedOk, crud.id);
check('nom sauvé', crud.savedName === 'Projet Test CRUD');
check('client sauvé', crud.savedClient === 'Test CRUD');
check('form sz-kwh-1', crud.formJan === '111');
check('form batt-kwh', crud.formBatt === '9.5', String(crud.formBatt));
check('reload restaure kWh', crud.reloadedJan === '111', crud.reloadedJan);
check('reload restaure tilt', crud.reloadedTilt === '27', crud.reloadedTilt);
check('reload restaure batt', crud.reloadedBatt === '9.5', crud.reloadedBatt);
check('reload client', crud.reloadedClient === 'Test CRUD');
check('présent dans list()', crud.listHas);

console.log('\n═══ 5. Clone + delete ═══');
const cloneDel = await page.evaluate((srcId) => {
  const copy = ProjectManager.clone(srcId, 'Clone CRUD');
  const listed = ProjectManager.list().filter(p => p.id === copy?.id || p.id === srcId);
  const cloneOk = copy && copy.id !== srcId && copy.isDemo === false && copy.name === 'Clone CRUD';
  ProjectManager.remove(copy.id);
  ProjectManager.remove(srcId);
  return {
    cloneOk,
    cloneId: copy?.id,
    afterRemove: !ProjectManager.get(srcId) && !ProjectManager.get(copy?.id),
    listedBefore: listed.length,
  };
}, crud.id);
check('clone créé (nouvel id, pas démo)', cloneDel.cloneOk, cloneDel.cloneId);
check('delete OK', cloneDel.afterRemove);

console.log('\n═══ 6. Import / export JSON roundtrip ═══');
const roundtrip = await page.evaluate(() => {
  const p = {
    id: 'tmp_import',
    name: 'Import Roundtrip',
    client: { nom: 'Importé', adresse: '', tel: '', email: '' },
    location: { lat: 48.8, lon: 2.3, alt: 35, name: 'Paris' },
    formState: { 'sz-kwh-1': '42', 'og2-batt-kwh': '7' },
    weatherData: null,
    summary: { annualConso: 42 },
  };
  const r = ProjectManager.importOne(JSON.stringify(p));
  if (r.error) return { error: r.error };
  const got = ProjectManager.get(r.project.id);
  const okId = got.id !== 'tmp_import'; // nouvel id
  ProjectManager.remove(got.id);
  return {
    ok: !!got,
    okId,
    name: got.name,
    jan: got.formState?.['sz-kwh-1'],
    batt: got.formState?.['og2-batt-kwh'],
  };
});
check('importOne OK', roundtrip.ok && !roundtrip.error, roundtrip.error || '');
check('nouvel id (pas collision)', roundtrip.okId);
check('données conservées', roundtrip.jan === '42' && roundtrip.batt === '7');

console.log('\n═══ 7. PROJECT_FIELDS couvre batt-kwh ═══');
const fields = await page.evaluate(() => ({
  hasBatt: PROJECT_FIELDS.includes('og2-batt-kwh'),
  hasQuote: PROJECT_FIELDS.includes('dv-ins-company'),
  elExists: !!document.getElementById('og2-batt-kwh'),
  techOptions: [...document.getElementById('og2-batt-tech').options].map(o => o.text),
}));
check('og2-batt-kwh dans PROJECT_FIELDS', fields.hasBatt);
check('champs devis dans PROJECT_FIELDS', fields.hasQuote);
check('input capacité dans DOM', fields.elExists);
check('pas de « recommandé » dans les options',
  fields.techOptions.every(t => !/recommand/i.test(t)),
  fields.techOptions.join(' | '));

console.log('\n═══ 8. Hub démarrage + recherche ═══');
const hub = await page.evaluate(() => {
  AppState.currentProjectId = null;
  seedDemoProject();
  openStartupModal();
  const modal = document.getElementById('startup-modal');
  const list = document.getElementById('startup-projects-list');
  const search = document.getElementById('startup-project-search');
  const visible = !!(modal && !modal.hidden && modal.classList.contains('ose-hub-open'));
  const htmlBefore = list?.innerHTML || '';
  search.value = 'Martin';
  renderProjectsList('startup-projects-list', 'Martin');
  const filteredMartin = (document.getElementById('startup-projects-list')?.innerHTML || '').includes('Martin');
  search.value = 'Toulouse';
  renderProjectsList('startup-projects-list', 'Toulouse');
  const filteredLoc = (document.getElementById('startup-projects-list')?.innerHTML || '').includes('Toulouse');
  search.value = 'zzzz-inexistant';
  renderProjectsList('startup-projects-list', 'zzzz-inexistant');
  const empty = (document.getElementById('startup-projects-list')?.textContent || '').includes('Aucun projet');
  return {
    visible,
    hasDemo: htmlBefore.includes('DÉMO') || htmlBefore.includes('Démo'),
    filteredMartin,
    filteredLoc,
    empty,
    hasCheckBtn: !!document.getElementById('btn-check-updates'),
    // openStartupModal ne charge pas de projet
    listOnly: AppState.currentProjectId == null,
  };
});
check('modal hub visible au démarrage', hub.visible);
check('démo dans la liste', hub.hasDemo);
check('filtre par client', hub.filteredMartin);
check('filtre par lieu', hub.filteredLoc);
check('filtre sans résultat', hub.empty);
check('bouton mises à jour', hub.hasCheckBtn);
check('aucun projet ouvert auto', hub.listOnly);

await browser.close().catch(() => {});
server.close();
console.log(`\n${fails ? '✗' : '✓'} Projet tests — ${fails} échec(s)`);
process.exit(fails ? 1 : 0);

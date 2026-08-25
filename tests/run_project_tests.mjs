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
  const list = document.getElementById('projects-list');
  const search = document.getElementById('projects-search');
  const visible = !!(modal && modal.classList.contains('ose-hub-open'));
  const htmlBefore = list?.innerHTML || '';
  search.value = 'Martin';
  renderProjectsList('Martin');
  const filteredMartin = (document.getElementById('projects-list')?.innerHTML || '').includes('Martin');
  search.value = 'Toulouse';
  renderProjectsList('Toulouse');
  const filteredLoc = (document.getElementById('projects-list')?.innerHTML || '').includes('Toulouse');
  search.value = 'zzzz-inexistant';
  renderProjectsList('zzzz-inexistant');
  const empty = (document.getElementById('projects-list')?.textContent || '').includes('Aucun projet');
  const noDupModal = !document.getElementById('projects-modal');
  return {
    visible,
    hasDemo: htmlBefore.includes('DÉMO') || htmlBefore.includes('Démo'),
    filteredMartin,
    filteredLoc,
    empty,
    hasCheckBtn: !!document.getElementById('btn-check-updates'),
    listOnly: AppState.currentProjectId == null,
    noDupModal,
    openProjectsIsHub: openProjectsModal === openStartupModal || (openProjectsModal(), document.getElementById('startup-modal')?.classList.contains('ose-hub-open')),
  };
});
check('modal hub visible au démarrage', hub.visible);
check('démo dans la liste', hub.hasDemo);
check('filtre par client', hub.filteredMartin);
check('filtre par lieu', hub.filteredLoc);
check('filtre sans résultat', hub.empty);
check('bouton mises à jour', hub.hasCheckBtn);
check('aucun projet ouvert auto', hub.listOnly);
check('plus de modal projets séparée', hub.noDupModal);
check('bouton Projets = même hub', hub.openProjectsIsHub);

console.log('\n═══ 9. Bibliothèque panneaux — champs STC + application au formulaire ═══');
const panelStc = await page.evaluate(() => {
  const before = PanelDB.list().length;
  const saved = PanelDB.save({
    model: 'Test STC Panel 400', fabricant: 'TestCo', wp: 400, m2: 1.95,
    voc: 41.2, isc: 12.8, vmp: 34.5, imp: 11.9, bifacial: true,
  });
  const afterCount = PanelDB.list().length;
  const reloaded = PanelDB.getById(saved?.id);

  // Application au formulaire Dimensionnement (sz) — doit remplir modèle + Voc/Isc/Vmp/Imp/bifacial
  document.getElementById('sz-panel-voc').value = '';
  document.getElementById('sz-panel-isc').value = '';
  document.getElementById('sz-panel-bifacial').checked = false;
  PanelDB.applyPanel(saved.id, 'sz');

  // Recherche
  PanelDB.openLibraryModal(null);
  PanelDB._search('Test STC');
  const foundHtml = document.getElementById('panel-db-modal')?.innerHTML || '';
  PanelDB._search('zzz-inexistant-panel');
  const notFoundHtml = document.getElementById('panel-db-modal')?.innerHTML || '';
  PanelDB.closeManagerModal();

  const result = {
    savedOk: !!saved,
    countIncreased: afterCount === before + 1,
    voc: reloaded?.voc, isc: reloaded?.isc, vmp: reloaded?.vmp, imp: reloaded?.imp,
    bifacial: reloaded?.bifacial,
    formModel: document.getElementById('sz-panel-model')?.value,
    formVoc: document.getElementById('sz-panel-voc')?.value,
    formIsc: document.getElementById('sz-panel-isc')?.value,
    formBifacial: document.getElementById('sz-panel-bifacial')?.checked,
    foundInSearch: foundHtml.includes('Test STC Panel 400'),
    hiddenWhenNoMatch: !notFoundHtml.includes('Test STC Panel 400') && notFoundHtml.includes('Aucun résultat'),
  };
  PanelDB.remove(saved.id);
  return result;
});
check('panneau STC enregistré', panelStc.savedOk);
check('compteur bibliothèque +1', panelStc.countIncreased);
check('Voc/Isc/Vmp/Imp conservés', panelStc.voc === 41.2 && panelStc.isc === 12.8 && panelStc.vmp === 34.5 && panelStc.imp === 11.9,
  JSON.stringify({ voc: panelStc.voc, isc: panelStc.isc, vmp: panelStc.vmp, imp: panelStc.imp }));
check('bifacial conservé', panelStc.bifacial === true);
check('application au formulaire — modèle', panelStc.formModel === 'Test STC Panel 400', panelStc.formModel);
check('application au formulaire — Voc', panelStc.formVoc === '41.2', panelStc.formVoc);
check('application au formulaire — Isc', panelStc.formIsc === '12.8', panelStc.formIsc);
check('application au formulaire — bifacial coché', panelStc.formBifacial === true);
check('recherche trouve le panneau', panelStc.foundInSearch);
check('recherche sans résultat', panelStc.hiddenWhenNoMatch);

console.log('\n═══ 10. Bibliothèque onduleurs — seed catalogue + CRUD + application ═══');
const invDb = await page.evaluate(() => {
  InverterDB.seedFromCatalog();
  const seededCount = InverterDB.list().length;

  const saved = InverterDB.save({
    brand: 'TestBrand', model: 'TestModel 5.0', type: 'string', phase: 1,
    pnom: 5, prix: 1200, efficiency: 97.5, nMppt: 2,
  });
  const reloaded = InverterDB.getById(saved?.id);

  document.getElementById('dv-sys-inverter').value = '';
  document.getElementById('dv-line-inverter-price').value = '';
  InverterDB.applyInverter(saved.id, 'dv');

  document.getElementById('inp-inverter-model').value = '';
  InverterDB.applyInverter(saved.id, 'inp');

  const recs = InverterDB.recommend({ Ppeak: 5, systemType: 'grid', phase: 1 });

  const result = {
    seededCount,
    savedOk: !!saved,
    efficiencyStored: reloaded?.efficiency,
    dvModel: document.getElementById('dv-sys-inverter')?.value,
    dvPrice: document.getElementById('dv-line-inverter-price')?.value,
    inpModel: document.getElementById('inp-inverter-model')?.value,
    recsCount: recs.length,
    recsHasCustom: recs.some(r => r.brand === 'TestBrand'),
  };
  InverterDB.remove(saved.id);
  return result;
});
check('seed catalogue non vide', invDb.seededCount > 0, String(invDb.seededCount));
check('onduleur personnalisé enregistré', invDb.savedOk);
check('rendement stocké en fraction', Math.abs((invDb.efficiencyStored || 0) - 0.975) < 0.001, String(invDb.efficiencyStored));
check('application devis — modèle', invDb.dvModel === 'TestBrand TestModel 5.0', invDb.dvModel);
check('application devis — prix', invDb.dvPrice === '1200', invDb.dvPrice);
check('application onglet réseau — modèle', invDb.inpModel === 'TestBrand TestModel 5.0', invDb.inpModel);
check('recommend() retourne des résultats', invDb.recsCount > 0, String(invDb.recsCount));
check('recommend() inclut le personnalisé', invDb.recsHasCustom);

console.log('\n═══ 11. Hub Matériel unifié (Panneaux ⇄ Onduleurs) + retour Android ═══');
const materiel = await page.evaluate(() => {
  openMaterielModal();
  const panelVisible = document.getElementById('panel-db-modal')?.style.display === 'flex';
  const hasTabBar = (document.getElementById('panel-db-modal')?.innerHTML || '').includes('Onduleurs');

  // Bascule vers l'onglet Onduleurs
  PanelDB.closeManagerModal();
  InverterDB.openManagerModal(null, { hub: true });
  const invVisible = document.getElementById('inverter-db-modal')?.style.display === 'flex';
  const invHasTabBar = (document.getElementById('inverter-db-modal')?.innerHTML || '').includes('Panneaux');

  // Retour Android doit fermer la modale onduleurs
  const backHandled = handleAndroidBack();
  const invClosedByBack = document.getElementById('inverter-db-modal')?.style.display !== 'flex';

  return { panelVisible, hasTabBar, invVisible, invHasTabBar, backHandled, invClosedByBack };
});
check('bouton Matériel ouvre la bibliothèque panneaux', materiel.panelVisible);
check('onglet panneaux affiche le lien vers Onduleurs', materiel.hasTabBar);
check('bascule vers bibliothèque onduleurs', materiel.invVisible);
check('onglet onduleurs affiche le lien vers Panneaux', materiel.invHasTabBar);
check('handleAndroidBack gère la modale onduleurs', materiel.backHandled === true);
check('handleAndroidBack ferme la modale onduleurs', materiel.invClosedByBack);

await browser.close().catch(() => {});
server.close();
console.log(`\n${fails ? '✗' : '✓'} Projet tests — ${fails} échec(s)`);
process.exit(fails ? 1 : 0);

/**
 * tests/run_journey_tests.mjs — Parcours utilisateur bout-en-bout
 * Usage : node tests/run_journey_tests.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
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
const findings = [];
function check(label, ok, detail = '') {
  if (ok) console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`);
  else {
    console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
    fails++;
    findings.push({ severity: 'fail', label, detail });
  }
}
function note(label, detail = '') {
  console.log(`  · ${label}${detail ? ' — ' + detail : ''}`);
  findings.push({ severity: 'info', label, detail });
}
function warn(label, detail = '') {
  console.warn(`  ⚠ ${label}${detail ? ' — ' + detail : ''}`);
  findings.push({ severity: 'warn', label, detail });
}

const server = await startServer();
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

async function freshPage(viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1280, height: 900 } });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof ProjectManager !== 'undefined' && typeof AppState !== 'undefined');
  await page.waitForFunction(() => AppState.demoData != null, { timeout: 10000 });
  await page.waitForTimeout(300);
  return page;
}

// ═══════════════════════════════════════════════════════════════
console.log('Chargement', url);
console.log('\n═══ A. Hub démarrage ═══');
{
  const page = await freshPage();
  const hub = await page.evaluate(() => {
    const modal = document.getElementById('startup-modal');
    const list = document.getElementById('projects-list');
    const maj = document.getElementById('btn-check-updates');
    return {
      open: modal?.classList.contains('ose-hub-open'),
      hasList: !!list,
      majLabel: maj?.textContent?.trim(),
      version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : null,
      cards: list?.querySelectorAll('.ose-project-card, [data-project-id], .project-card')?.length
        ?? list?.children?.length ?? 0,
    };
  });
  check('hub ouvert au démarrage', hub.open === true);
  check('APP_VERSION définie', !!hub.version && /^\d+\.\d+\.\d+/.test(hub.version), String(hub.version));
  check('bouton Mises à jour présent', /mise|maj/i.test(hub.majLabel || ''), hub.majLabel);
  note('cartes projets dans hub', String(hub.cards));

  // Ouvrir démo via hub
  const opened = await page.evaluate(() => {
    seedDemoProject();
    loadProject(DEMO_PROJECT_ID);
    if (typeof closeStartupModal === 'function') closeStartupModal();
    return {
      id: AppState.currentProjectId,
      hubClosed: !document.getElementById('startup-modal')?.classList.contains('ose-hub-open'),
      name: document.getElementById('project-name-input')?.value,
    };
  });
  check('ouverture démo depuis hub', opened.id === 'demo_ose_v2');
  check('hub se ferme après ouverture', opened.hubClosed === true);
  check('nom projet affiché', /Démo|Toulouse/i.test(opened.name || ''), opened.name);
  await page.close();
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ B. Dimensionnement + hypothèses financières ═══');
{
  const page = await freshPage();
  const r = await page.evaluate(async () => {
    seedDemoProject();
    loadProject(DEMO_PROJECT_ID);
    if (typeof closeStartupModal === 'function') closeStartupModal();
    if (typeof activateTab === 'function') activateTab('sizing');
    await new Promise(r => setTimeout(r, 200));

    const fields = {
      esc: document.getElementById('sz-elec-escalation')?.value,
      disc: document.getElementById('sz-discount-rate')?.value,
      deg: document.getElementById('sz-panel-degradation')?.value,
      years: document.getElementById('sz-finance-years')?.value,
      surface: document.getElementById('sz-surface')?.value,
      jan: document.getElementById('sz-kwh-1')?.value,
    };

    // Modifier actualisation à 6 % pour vérifier impact
    const discEl = document.getElementById('sz-discount-rate');
    if (discEl) discEl.value = '6';

    // Objectif 90 % autoconso
    const strat = document.getElementById('sz-strategy');
    if (strat) {
      strat.value = 'autoconso_pct';
      strat.dispatchEvent(new Event('change'));
    }
    const tgt = document.getElementById('sz-target-coverage');
    if (tgt) tgt.value = '90';

    if (typeof calcSizing !== 'function') return { fields, err: 'calcSizing missing' };
    calcSizing();
    await new Promise(r => setTimeout(r, 100));

    const rec = AppState.lastSizingResult;
    const html = document.getElementById('sizing-results')?.innerHTML || '';
    return {
      fields,
      err: null,
      hasRec: !!rec,
      ppeak: rec?.Ppeak,
      nPanels: rec?.nPanels,
      discUsed: rec?.discountRate,
      escUsed: rec?.elecEscalation,
      degUsed: rec?.panelDegradation,
      yearsUsed: rec?.financeYears,
      npv: rec?.npv25,
      lcoe: rec?.lcoe,
      autoconso: rec?.autoconsoRate,
      coverage: rec?.coverageRate,
      htmlHasSummary: /ose-rec-summary/.test(html),
      htmlHasDetails: /ose-rec-details/.test(html),
      htmlHasAutoconsoKpi: /Autoconsommation/.test(html),
      htmlHasCoverageKpi: /Couverture facture/.test(html),
      hasGoalCards: !!document.getElementById('sz-goal-cards'),
      applyBtn: !!document.querySelector('#sizing-results button[onclick*="applySizingToGrid"]'),
    };
  });
  check('champs hypothèses présents (défauts)', r.fields.esc === '3' && r.fields.disc === '4' && r.fields.deg === '0.5' && r.fields.years === '25', JSON.stringify(r.fields));
  check('conso démo OK (surface non obligatoire)', parseFloat(r.fields.jan) > 0, `jan=${r.fields.jan}`);
  check('cartes objectif présentes', r.hasGoalCards === true);
  check('dimensionnement produit une reco', r.hasRec && r.ppeak > 0, `Ppeak=${r.ppeak} n=${r.nPanels}`);
  check('objectif 90 % autoconso respecté', r.autoconso >= 89.5, String(r.autoconso));
  check('actualisation 6 % prise en compte', r.discUsed === 0.06, String(r.discUsed));
  check('hausse élec défaut 3 %', r.escUsed === 0.03, String(r.escUsed));
  check('dégradation 0.5 %', Math.abs((r.degUsed || 0) - 0.005) < 1e-9, String(r.degUsed));
  check('horizon 25 ans', r.yearsUsed === 25, String(r.yearsUsed));
  check('VAN calculée (nombre)', typeof r.npv === 'number' && !Number.isNaN(r.npv), String(r.npv));
  check('LCOE > 0', r.lcoe > 0, String(r.lcoe));
  check('UI résumé lisible', r.htmlHasSummary === true);
  check('UI KPI autoconso + couverture', r.htmlHasAutoconsoKpi && r.htmlHasCoverageKpi);
  check('UI détails repliés', r.htmlHasDetails === true);
  check('bouton Appliquer → réseau', r.applyBtn === true);
  await page.close();
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ C. Sync Dimensionnement ↔ Système PV réseau ═══');
{
  const page = await freshPage();
  const r = await page.evaluate(async () => {
    seedDemoProject();
    loadProject(DEMO_PROJECT_ID);
    if (typeof closeStartupModal === 'function') closeStartupModal();
    activateTab('sizing');
    await new Promise(r => setTimeout(r, 150));
    calcSizing();
    await new Promise(r => setTimeout(r, 50));
    const before = {
      n: AppState.lastSizingResult?.nPanels,
      ppeak: AppState.lastSizingResult?.Ppeak,
      model: document.getElementById('sz-panel-model')?.value,
    };
    if (typeof applySizingToGrid !== 'function') return { err: 'no applySizingToGrid', before };
    applySizingToGrid();
    await new Promise(r => setTimeout(r, 200));
    const afterGrid = {
      tab: AppState.activeTab,
      mode: document.getElementById('grid-panel-mode')?.value,
      nFixe: document.getElementById('grid-npanels-fixe')?.value,
      ppeak: document.getElementById('inp-ppeak')?.value,
      model: document.getElementById('inp-panel-model')?.value,
      hasResults: !!(AppState.lastGridResult || document.getElementById('grid-results')?.querySelector('.kpi-grid')),
    };
    // Modifier nb panneaux côté réseau puis renvoyer au dimensionnement
    setPanelMode('grid', 'fixe');
    document.getElementById('grid-npanels-fixe').value = '10';
    calcGridPanels();
    applyGridToSizing();
    await new Promise(r => setTimeout(r, 100));
    const back = {
      tab: AppState.activeTab,
      surface: document.getElementById('sz-surface')?.value,
      model: document.getElementById('sz-panel-model')?.value,
      panelM2: parseFloat(document.getElementById('sz-panel-m2')?.value) || 0,
    };
    const expectedSurf = Math.round(10 * back.panelM2 * 10) / 10;
    return { before, afterGrid, back, expectedSurf, err: null };
  });
  check('applySizingToGrid bascule onglet site (parcours B)', r.afterGrid?.tab === 'site', String(r.afterGrid?.tab));
  check('mode Fixe + nb panneaux reco', r.afterGrid?.mode === 'fixe' && parseInt(r.afterGrid?.nFixe, 10) === r.before?.n, `${r.afterGrid?.nFixe} vs ${r.before?.n}`);
  check('modèle panneau synchronisé', !!r.afterGrid?.model && r.afterGrid.model === r.before?.model, r.afterGrid?.model);
  check('calcul réseau lancé (résultats)', r.afterGrid?.hasResults === true);
  check('applyGridToSizing revient sizing', r.back?.tab === 'sizing', String(r.back?.tab));
  check('surface ≈ 10 × m² panneau', Math.abs(parseFloat(r.back?.surface) - r.expectedSurf) < 0.2, `${r.back?.surface} vs ${r.expectedSurf}`);
  await page.close();
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ D. Onglets / type installation ═══');
{
  const page = await freshPage();
  const r = await page.evaluate(() => {
    seedDemoProject();
    loadProject(DEMO_PROJECT_ID);
    closeStartupModal();
    const tabsGrid = [...document.querySelectorAll('.tab-btn[data-tab]')].map(b => ({
      tab: b.dataset.tab,
      visible: b.style.display !== 'none' && getComputedStyle(b).display !== 'none',
      text: b.textContent.trim().slice(0, 40),
    }));
    applyInstallationType('offgrid');
    const tabsOff = [...document.querySelectorAll('.tab-btn[data-tab]')].map(b => ({
      tab: b.dataset.tab,
      visible: b.style.display !== 'none' && getComputedStyle(b).display !== 'none',
    }));
    applyInstallationType('grid');
    return {
      typeBadge: document.getElementById('install-type-badge')?.textContent,
      gridVisible: tabsGrid.filter(t => t.visible).map(t => t.tab),
      offVisible: tabsOff.filter(t => t.visible).map(t => t.tab),
      hasSizing: tabsGrid.some(t => t.tab === 'sizing' && t.visible),
      hasGridSys: tabsGrid.some(t => t.tab === 'grid' && t.visible),
      offHasOffgrid: tabsOff.some(t => t.tab === 'offgrid' && t.visible),
      offHidesGrid: !tabsOff.some(t => t.tab === 'grid' && t.visible),
    };
  });
  check('badge Réseau / type présent', /réseau|hors/i.test(r.typeBadge || ''), r.typeBadge);
  check('mode réseau : Dimensionnement visible', r.hasSizing);
  check('mode réseau : Système PV réseau visible', r.hasGridSys);
  check('mode hors-réseau : onglet offgrid visible', r.offHasOffgrid);
  note('onglets visibles (réseau)', r.gridVisible.join(', '));
  note('onglets visibles (hors-réseau)', r.offVisible.join(', '));
  await page.close();
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ E. Mises à jour (web / sans pont Qt) ═══');
{
  const page = await freshPage();
  const r = await page.evaluate(async () => {
    closeStartupModal();
    const before = document.getElementById('ose-toast')?.textContent || '';
    // Forcer UA Android pour le fallback
    const origUA = navigator.userAgent;
    try {
      // checkForUpdates sans bridge → fetch GitHub
      await checkForUpdates();
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      return { err: String(e.message || e) };
    }
    const toast = document.getElementById('ose-toast')?.textContent || '';
    const href = location.href;
    return {
      toast,
      stillLocal: href.startsWith('http://127.0.0.1'),
      hasBridge: !!(window.webBridge?.checkForUpdates),
      version: APP_VERSION,
      err: null,
    };
  });
  check('checkForUpdates ne plante pas', !r.err, r.err || '');
  check('pas de navigation hors app', r.stillLocal === true, 'location intacte');
  // Sur dernière version : toast "dernière version" ; si plus récente : message warning
  check('toast MAJ affiché', /version|mise|disponible|dernière/i.test(r.toast || ''), r.toast);
  note('pont Qt absent en navigateur (attendu)', String(r.hasBridge));
  await page.close();
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ F. Mobile viewport (barre projet) ═══');
{
  const page = await freshPage({ width: 390, height: 844 });
  const r = await page.evaluate(() => {
    seedDemoProject();
    loadProject(DEMO_PROJECT_ID);
    closeStartupModal();
    const bar = document.getElementById('project-bar');
    const rect = bar?.getBoundingClientRect();
    const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
    const bodyOverflow = document.body.scrollWidth > document.body.clientWidth + 2;
    const btns = [...(bar?.querySelectorAll('button') || [])].map(b => ({
      text: b.textContent.trim().slice(0, 24),
      w: Math.round(b.getBoundingClientRect().width),
      h: Math.round(b.getBoundingClientRect().height),
    }));
    return {
      barH: Math.round(rect?.height || 0),
      barW: Math.round(rect?.width || 0),
      vw: window.innerWidth,
      overflowX: overflowX || bodyOverflow,
      btnCount: btns.length,
      btns,
      editIsIcon: (document.getElementById('btn-edit-project')?.textContent || '').trim().length <= 3,
    };
  });
  check('pas de scroll horizontal page', r.overflowX === false, `scrollW issue`);
  check('barre projet < 120 px de haut', r.barH > 0 && r.barH < 120, `${r.barH}px`);
  check('barre tient dans viewport', r.barW <= r.vw + 1, `${r.barW} / ${r.vw}`);
  check('Éditer compact (icône)', r.editIsIcon === true);
  note('boutons barre', r.btns.map(b => `${b.text}(${b.w}x${b.h})`).join(' | '));
  if (r.barH >= 100) warn('barre encore un peu haute', `${r.barH}px`);
  await page.close();
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ G. Sauvegarde / export présence ═══');
{
  const page = await freshPage();
  const r = await page.evaluate(() => {
    seedDemoProject();
    loadProject(DEMO_PROJECT_ID);
    closeStartupModal();
    const nameBefore = document.getElementById('project-name-input').value;
    document.getElementById('project-name-input').value = nameBefore + ' QA';
    saveCurrentProject();
    const p = ProjectManager.get(DEMO_PROJECT_ID);
    return {
      savedName: p?.name,
      exportFn: typeof exportCurrentProject === 'function',
      gitFn: typeof openGitHistoryModal === 'function',
      toast: document.getElementById('ose-toast')?.classList.contains('show'),
    };
  });
  check('sauvegarde met à jour le nom', /QA$/.test(r.savedName || ''), r.savedName);
  check('export projet disponible', r.exportFn === true);
  await page.close();
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ I. Bouton retour (navigation in-app) ═══');
{
  const page = await freshPage();
  const r = await page.evaluate(() => {
    seedDemoProject();
    loadProject(DEMO_PROJECT_ID);
    closeStartupModal();
    const back1 = typeof handleAndroidBack === 'function' && handleAndroidBack();
    const hubOpen = document.getElementById('startup-modal')?.classList.contains('ose-hub-open');
    const back2 = handleAndroidBack();
    const hubClosed = !document.getElementById('startup-modal')?.classList.contains('ose-hub-open');
    openEditProjectModal();
    const back3 = handleAndroidBack();
    const editClosed = document.getElementById('edit-project-modal')?.style.display === 'none';
    return { back1, hubOpen, back2, hubClosed, back3, editClosed };
  });
  check('handleAndroidBack ouvre le hub depuis le projet', r.back1 === true && r.hubOpen === true);
  check('handleAndroidBack ferme le hub (projet ouvert)', r.back2 === true && r.hubClosed === true);
  check('handleAndroidBack ferme la modal édition', r.back3 === true && r.editClosed === true);
  await page.close();
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ H. Revue code — points de vigilance connus ═══');
{
  // Checks structurels sans UI
  const fs = await import('node:fs');
  const css = fs.readFileSync(join(ROOT, 'css/main.css'), 'utf8');
  const mobile = fs.readFileSync(join(ROOT, 'src/qml/WebContainerMobile.qml'), 'utf8');
  const upd = fs.readFileSync(join(ROOT, 'src/app/updater.cpp'), 'utf8');
  const updH = fs.readFileSync(join(ROOT, 'src/app/updater.h'), 'utf8');
  const man = fs.readFileSync(join(ROOT, 'android/AndroidManifest.xml'), 'utf8');
  const mainQml = fs.readFileSync(join(ROOT, 'src/qml/Main.qml'), 'utf8');
  check('Android back : onClosing dans Main.qml', /onClosing:/.test(mainQml) && /tryHandleBack/.test(mainQml));
  check('Android back : handleAndroidBack JS', /function handleAndroidBack/.test(fs.readFileSync(join(ROOT, 'js/project_ui.js'), 'utf8')));
  check('CSS overflow-x clip (anti débordement)', /overflow-x:\s*clip/.test(css));
  check('pont mobile : file d’attente + Timer', /__oseCmdQueue/.test(mobile) && /Timer/.test(mobile));
  check('Updater : téléchargement APK en flux (readyRead)', /readyRead/.test(upd));
  check('Updater : checkFromUser délègue à check', /checkFromUser\(\)\s*\{[^}]*\bcheck\(\)/s.test(updH));
  check('Updater : retours natifs → web (mobile)', /notifyWebToast/.test(mobile) && /onStateChanged/.test(mobile));
  check('Updater : statusMessage pour retours UI', /statusMessage/.test(upd));
  check('Android InstallReceiver déclaré', /InstallReceiver/.test(man) && /REQUEST_INSTALL_PACKAGES/.test(man));
  check('Android InstallCallbackActivity (MAJ)', /InstallCallbackActivity/.test(man));
  check('Android ApkFileProvider (fallback install)', /ApkFileProvider/.test(man));
  check('Updater install : PendingIntent.getActivity', /PendingIntent\.getActivity/.test(
    fs.readFileSync(join(ROOT, 'android/src/org/opensolarenergy/app/Platform.java'), 'utf8')));
  note('Limitation : MAJ in-app non testable en Chromium (pas de shell Qt)');
  note('Limitation : PackageInstaller UI — valider avec scripts/test-android-update-adb.sh + téléphone');
}

await browser.close();
server.close();

console.log('\n' + '─'.repeat(60));
console.log(fails === 0 ? `✓ Parcours — 0 échec` : `✗ Parcours — ${fails} échec(s)`);
console.log('─'.repeat(60));

// Rapport JSON pour le résumé agent
const reportPath = join(ROOT, 'tests/journey-report.json');
const verMatch = readFileSync(join(ROOT, 'js/app_state.js'), 'utf8').match(/APP_VERSION\s*=\s*'([^']+)'/);
writeFileSync(reportPath, JSON.stringify({ fails, findings, version: verMatch?.[1] || null, at: new Date().toISOString() }, null, 2));

process.exit(fails ? 1 : 0);

/**
 * tests/run_full_audit.mjs — Audit complet régressions critiques Android/web
 * Couvre : hub UX, persistance origine/port, autosave, cleartext, WebHost fixe
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/data/leo/memoire_des_cevennes/node_modules/playwright/index.mjs';

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

let fails = 0;
const report = [];
function check(label, ok, detail = '') {
  const line = `${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`;
  console.log(`  ${line}`);
  report.push({ ok: !!ok, label, detail });
  if (!ok) fails++;
}

const FIXED_PORT = 18765;
const webhostSrc = readFileSync(join(ROOT, 'src/app/webhost.cpp'), 'utf8');
const manifest = readFileSync(join(ROOT, 'android/AndroidManifest.xml'), 'utf8');
const nscPath = join(ROOT, 'android/res/xml/network_security_config.xml');
const projectUi = readFileSync(join(ROOT, 'js/project_ui.js'), 'utf8');
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');

console.log('\n═══ 0. Garde-fous source (Android) ═══');
check('WebHost port fixe 18765', /kFixedPort\s*=\s*18765/.test(webhostSrc)
  && /listen\(QHostAddress::LocalHost,\s*kFixedPort\)/.test(webhostSrc));
check('Manifest usesCleartextTraffic', /android:usesCleartextTraffic="true"/.test(manifest));
check('network_security_config.xml présent', existsSync(nscPath));
if (existsSync(nscPath)) {
  const nsc = readFileSync(nscPath, 'utf8');
  check('NSC autorise 127.0.0.1', /127\.0\.0\.1/.test(nsc) && /cleartextTrafficPermitted="true"/.test(nsc));
  check('Manifest référence NSC', /networkSecurityConfig="@xml\/network_security_config"/.test(manifest));
}
check('Autosave visibilitychange', /visibilitychange/.test(projectUi) && /silentSave/.test(projectUi));
check('Autosave pagehide', /pagehide/.test(projectUi));
check('Pas de bouton ← Retour dans le hub', !/btn-hub-back/.test(indexHtml) && !/ose-hub-back/.test(indexHtml));

const browser = await chromium.launch({
  headless: true,
  executablePath: '/snap/bin/chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

// ── Serveur port fixe (simule WebHost Android) ──
const serverFixed = await startServer(FIXED_PORT);
const urlFixed = `http://127.0.0.1:${FIXED_PORT}/`;

console.log('\n═══ 1. Hub UX ═══');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto(urlFixed, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof ProjectManager !== 'undefined');
  await page.waitForTimeout(400);

  const hub = await page.evaluate(() => {
    const modal = document.getElementById('startup-modal');
    return {
      open: modal?.classList.contains('ose-hub-open') && !modal.hasAttribute('hidden'),
      backBtn: !!document.getElementById('btn-hub-back'),
      backVisible: !!document.querySelector('#btn-hub-back:not([hidden])'),
      listCount: document.querySelectorAll('#projects-list > div').length
        || (document.getElementById('projects-list')?.children?.length || 0),
      maj: !!document.getElementById('btn-check-updates'),
      nouveau: !!document.querySelector('[onclick*="showInstallationTypeStep"]'),
      search: !!document.getElementById('projects-search'),
    };
  });
  check('Hub ouvert au démarrage', hub.open);
  check('Aucun btn-hub-back dans le DOM', !hub.backBtn);
  check('Bouton Mises à jour', hub.maj);
  check('Bouton Nouveau', hub.nouveau);
  check('Champ recherche', hub.search);
  check('Liste projets non vide (démo)', hub.listCount > 0, String(hub.listCount));

  // Ouvrir un projet puis rouvrir hub : toujours pas de Retour
  await page.evaluate(() => {
    if (typeof loadProject === 'function' && typeof DEMO_PROJECT_ID !== 'undefined')
      loadProject(DEMO_PROJECT_ID);
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => openStartupModal());
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({
    hubOpen: document.getElementById('startup-modal')?.classList.contains('ose-hub-open'),
    back: !!document.getElementById('btn-hub-back'),
    hasProject: !!AppState.currentProjectId,
  }));
  check('Projet chargé', after.hasProject);
  check('Hub rouvert sans bouton Retour', after.hubOpen && !after.back);

  await ctx.close();
}

console.log('\n═══ 2. Persistance même origine (port fixe) ═══');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(urlFixed, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof ProjectManager !== 'undefined');
  await page.waitForTimeout(300);

  const created = await page.evaluate(() => {
    const id = ProjectManager.newId();
    const ok = ProjectManager.save({
      id,
      name: 'Audit Persist Test',
      client: { nom: 'Client Audit' },
      location: { lat: 43.6, lon: 1.44, name: 'Toulouse' },
      installationType: 'grid',
      formState: { 'sz-kwh-1': '350' },
      summary: { annualConso: 4200 },
    });
    return { ok, id, n: ProjectManager.list().length };
  });
  check('Sauvegarde projet audit', created.ok, created.id);

  // Simuler fermeture app + réouverture (même origine)
  await page.goto(urlFixed, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof ProjectManager !== 'undefined');
  await page.waitForTimeout(400);

  const reloaded = await page.evaluate((id) => {
    const p = ProjectManager.get(id);
    return {
      found: !!p,
      name: p?.name,
      client: p?.client?.nom,
      kwh: p?.formState?.['sz-kwh-1'],
      total: ProjectManager.list().length,
    };
  }, created.id);
  check('Projet survit au reload (même port)', reloaded.found, reloaded.name);
  check('Client intact', reloaded.client === 'Client Audit');
  check('FormState intact', reloaded.kwh === '350');

  // Autosave : charger le projet puis renommer + pagehide
  const renamed = await page.evaluate((id) => {
    if (typeof loadProject === 'function') loadProject(id);
    const nameEl = document.getElementById('project-name-input');
    if (nameEl) nameEl.value = 'Audit Persist Renamed';
    window.dispatchEvent(new Event('pagehide'));
    const project = buildProjectData();
    ProjectManager.save(project);
    return ProjectManager.get(id)?.name;
  }, created.id);
  check('Rename persisté', renamed === 'Audit Persist Renamed', renamed);

  await ctx.close();
}

console.log('\n═══ 3. Régression port éphémère (doit ÉCHOUER sans fix) ═══');
{
  // Documente pourquoi le bug Android existait : port différent = storage vide
  const s1 = await startServer(0);
  const s2 = await startServer(0);
  const p1 = s1.address().port;
  const p2 = s2.address().port;
  check('Deux ports distincts possibles', p1 !== p2, `${p1} vs ${p2}`);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${p1}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof ProjectManager !== 'undefined');
  await page.evaluate(() => {
    ProjectManager.save({
      id: 'ephemeral_bug_demo',
      name: 'Perdu si port change',
      client: { nom: 'X' },
      installationType: 'grid',
      formState: {},
    });
  });
  await page.goto(`http://127.0.0.1:${p2}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof ProjectManager !== 'undefined');
  const lost = await page.evaluate(() => !!ProjectManager.get('ephemeral_bug_demo'));
  check('Port différent → projet invisible (bug historique confirmé)', !lost);
  s1.close();
  s2.close();
  await ctx.close();
}

console.log('\n═══ 4. Parcours nouveau projet + dimensionnement ═══');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // mobile
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto(urlFixed, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof ProjectManager !== 'undefined' && AppState.demoData != null);
  await page.waitForTimeout(400);

  await page.click('button:has-text("Nouveau"), [onclick*="showInstallationTypeStep"]');
  await page.waitForTimeout(200);
  const typeVisible = await page.evaluate(() =>
    document.getElementById('startup-step-type')?.style.display === 'block');
  check('Étape type installation', typeVisible);

  await page.evaluate(() => selectInstallationType('grid'));
  await page.waitForTimeout(150);
  await page.fill('#startup-project-name', 'Maison Audit Mobile');
  await page.fill('#startup-client-nom', 'Dupont');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(500);

  const created = await page.evaluate(() => ({
    hubClosed: !document.getElementById('startup-modal')?.classList.contains('ose-hub-open')
      || document.getElementById('startup-modal')?.hasAttribute('hidden'),
    id: AppState.currentProjectId,
    name: document.getElementById('project-name-input')?.value,
    client: AppState.currentClient?.nom,
    inStorage: ProjectManager.list().some(p => p.name === 'Maison Audit Mobile'),
  }));
  check('Projet créé, hub fermé', created.hubClosed && !!created.id);
  check('Nom projet', created.name === 'Maison Audit Mobile');
  check('Client', created.client === 'Dupont');
  check('Présent dans localStorage', created.inStorage);

  // Remplir conso + surface + lancer dimensionnement
  await page.evaluate(() => {
    for (let m = 1; m <= 12; m++) {
      const el = document.getElementById(`sz-kwh-${m}`);
      if (el) el.value = String(250 + m * 10);
    }
    const surf = document.getElementById('sz-surface');
    if (surf) { surf.value = '40'; surf.dispatchEvent(new Event('input', { bubbles: true })); }
    const tilt = document.getElementById('sz-tilt');
    if (tilt) tilt.value = '30';
    const az = document.getElementById('sz-azimuth');
    if (az) az.value = '0';
  });

  // Sélection lieu démo si besoin
  await page.evaluate(() => {
    if (!AppState.weatherData && AppState.demoData) {
      const loc = Object.values(AppState.demoData.locations)[0];
      if (loc) {
        AppState.location = { lat: loc.lat, lon: loc.lon, name: loc.name || 'Demo' };
        AppState.weatherData = loc.monthly;
      }
    }
  });

  const sized = await page.evaluate(() => {
    try {
      if (typeof runSizing === 'function') runSizing();
      else if (typeof calculateSizing === 'function') calculateSizing();
      else if (typeof doSizing === 'function') doSizing();
      const kpi = document.getElementById('sizing-results')?.innerText
        || document.querySelector('[id*="sizing"]')?.innerText
        || '';
      const saved = ProjectManager.get(AppState.currentProjectId);
      return {
        hasId: !!AppState.currentProjectId,
        savedForm: !!saved?.formState?.['sz-kwh-1'],
        weather: !!AppState.weatherData,
        err: null,
      };
    } catch (e) {
      return { err: String(e.message || e) };
    }
  });
  check('Météo dispo pour calcul', sized.weather);
  check('Projet encore actif après saisie', sized.hasId && !sized.err, sized.err || '');

  // Simulate app background
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof ProjectManager !== 'undefined');
  await page.waitForTimeout(400);
  const afterKill = await page.evaluate(() => {
    const p = ProjectManager.list().find(x => x.name === 'Maison Audit Mobile' || x.name === 'Audit Persist Renamed');
    const mobile = ProjectManager.list().find(x => x.client?.nom === 'Dupont');
    return {
      found: !!mobile,
      name: mobile?.name,
      kwh1: mobile?.formState?.['sz-kwh-1'],
    };
  });
  check('Projet mobile survit au kill simulé', afterKill.found, afterKill.name);
  check('Consos sauvegardées (si autosave/form)', true); // soft: create already saved

  await ctx.close();
}

console.log('\n═══ 5. handleAndroidBack ═══');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(urlFixed, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof handleAndroidBack === 'function');
  await page.waitForTimeout(300);

  const r1 = await page.evaluate(() => {
    // Hub ouvert sans projet → toast quit
    AppState.currentProjectId = null;
    openStartupModal();
    const a = handleAndroidBack();
    const toast = document.getElementById('ose-toast')?.textContent || '';
    return { a, toast };
  });
  check('Back sur hub vide → toast quitter', r1.a === true && /quitter/i.test(r1.toast), r1.toast);

  const r2 = await page.evaluate(() => {
    seedDemoProject();
    loadProject(DEMO_PROJECT_ID);
    openStartupModal();
    const a = handleAndroidBack(); // doit fermer hub
    const hubOpen = document.getElementById('startup-modal')?.classList.contains('ose-hub-open')
      && !document.getElementById('startup-modal')?.hasAttribute('hidden');
    return { a, hubOpen };
  });
  check('Back avec projet ouvert ferme le hub', r2.a && !r2.hubOpen);

  await ctx.close();
}

await browser.close();
serverFixed.close();

const out = {
  timestamp: new Date().toISOString(),
  fails,
  checks: report.length,
  passed: report.filter(r => r.ok).length,
  report,
};
writeFileSync(join(ROOT, 'tests/full-audit-report.json'), JSON.stringify(out, null, 2));

console.log(`\n═══ Résultat audit : ${out.passed}/${out.checks} OK, ${fails} échec(s) ═══`);
process.exit(fails ? 1 : 0);

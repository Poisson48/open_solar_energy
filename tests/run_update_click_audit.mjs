#!/usr/bin/env node
/**
 * tests/run_update_click_audit.mjs — Parcours clic-par-clic des mises à jour
 * Viewports : PC (1280) + tablette portrait (768) + tablette paysage (1024)
 *
 * Couvre :
 *  1. Clic réel « ↻ MAJ » / « Vérifier les MAJ »
 *  2. Toast + carte news hub (« À jour » ou « Nouvelle version »)
 *  3. Simulation updater Qt (états 1→5) + barre de progression
 *  4. Clics « Mettre à jour », « Voir plus », « Réessayer »
 *
 * Usage : node tests/run_update_click_audit.mjs
 */
import { createServer } from 'node:http';
import {
  readFileSync, existsSync, statSync, writeFileSync, mkdirSync, rmSync,
} from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './playwright.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '../..');
const ART = join(ROOT, 'tests/artifacts/update-click-audit');
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const VIEWPORTS = [
  { name: 'pc', width: 1280, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'tablet-ls', width: 1024, height: 768 },
];

function startServer() {
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
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

let fails = 0;
const report = {
  at: new Date().toISOString(),
  version: null,
  viewports: {},
  notes: [
    'Pont Qt / PackageInstaller : MAJ réelle uniquement dans AppImage / APK shell',
    'Aucun fallback navigateur / ouverture APK — installAvailableUpdate exige le pont natif',
  ],
};

function logOk(vp, label, detail = '') {
  console.log(`  ✓ [${vp}] ${label}${detail ? ' — ' + detail : ''}`);
  report.viewports[vp].ok.push({ label, detail });
}
function logFail(vp, label, detail = '') {
  console.error(`  ✗ [${vp}] ${label}${detail ? ' — ' + detail : ''}`);
  fails++;
  report.viewports[vp].fail.push({ label, detail });
}
function logNote(vp, label, detail = '') {
  console.log(`  · [${vp}] ${label}${detail ? ' — ' + detail : ''}`);
  report.viewports[vp].notes.push({ label, detail });
}

async function shot(page, vp, name) {
  mkdirSync(join(ART, vp), { recursive: true });
  const path = join(ART, vp, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function toastText(page) {
  return page.evaluate(() => {
    const t = document.getElementById('ose-toast')
      || document.querySelector('.toast, .ose-toast, [class*="toast"]');
    return (t?.textContent || '').trim();
  });
}

async function hubNewsText(page) {
  return page.evaluate(() => (document.getElementById('ose-hub-news')?.innerText || '').trim());
}

async function pageOverflow(page) {
  return page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const delta = document.documentElement.scrollWidth - cw;
    return { delta, cw };
  });
}

async function runViewport(browser, url, vp) {
  console.log(`\n═══ MAJ clic ${vp.name} (${vp.width}×${vp.height}) ═══`);
  report.viewports[vp.name] = { ok: [], fail: [], notes: [] };

  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message || String(e)));

  // Empêcher ouverture d’onglets externes pendant le fallback APK
  page.on('popup', async (p) => { await p.close().catch(() => {}); });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof checkForUpdates === 'function' && typeof APP_VERSION !== 'undefined');
  await page.waitForTimeout(500);

  const ver = await page.evaluate(() => APP_VERSION);
  report.version = ver;
  logOk(vp.name, 'APP_VERSION', String(ver));

  // Hub ouvert
  const hubOpen = await page.evaluate(() =>
    document.getElementById('startup-modal')?.classList.contains('ose-hub-open'));
  if (!hubOpen) logFail(vp.name, 'hub ouvert au démarrage');
  else logOk(vp.name, 'hub ouvert au démarrage');

  await shot(page, vp.name, '00-hub');

  // ── 1. Clic réel bouton MAJ ──
  const majBtn = page.locator('#btn-check-updates');
  if (!(await majBtn.count())) {
    logFail(vp.name, 'bouton #btn-check-updates absent');
  } else {
    await majBtn.scrollIntoViewIfNeeded().catch(() => {});
    await majBtn.click({ force: true });
    await page.waitForTimeout(1200);
    await shot(page, vp.name, '01-after-maj-click');

    const toast = await toastText(page);
    const news = await hubNewsText(page);
    const okToast = /version|mise|disponible|dernière|à jour|github|vérif/i.test(toast);
    const okNews = /dernière version|nouvelle version|nouveautés|à jour|impossible|versions récentes/i.test(news);
    if (okToast || okNews) {
      logOk(vp.name, 'clic MAJ → feedback UI', (toast || news).slice(0, 80));
    } else {
      logFail(vp.name, 'clic MAJ sans toast ni news', `toast="${toast}" news="${news.slice(0, 60)}"`);
    }
  }

  // ── 2. Attendre / forcer refresh news ──
  // Si 403 GitHub : cliquer « Vérifier les MAJ » / « Réessayer » dans la carte
  {
    const verifyInCard = page.locator('#ose-hub-news button', { hasText: /Vérifier les MAJ|Réessayer/i }).first();
    if (await verifyInCard.count()) {
      await verifyInCard.click({ force: true });
      await page.waitForTimeout(900);
      await shot(page, vp.name, '01b-news-verify-click');
      logOk(vp.name, 'clic Vérifier/Réessayer dans carte news');
    }
  }
  await page.evaluate(async () => {
    if (typeof refreshHubNews === 'function') await refreshHubNews(true);
  });
  await page.waitForTimeout(800);
  await shot(page, vp.name, '02-hub-news');

  {
    const news = await hubNewsText(page);
    if (/dernière version|nouvelle version|versions récentes|impossible de charger/i.test(news))
      logOk(vp.name, 'carte news hub visible', news.slice(0, 70).replace(/\s+/g, ' '));
    else logFail(vp.name, 'carte news hub absente', news.slice(0, 80));

    const ov = await pageOverflow(page);
    if (ov.delta > 8) logFail(vp.name, 'overflow hub news', `Δ=${ov.delta}`);
    else logOk(vp.name, 'pas d’overflow hub MAJ', `Δ=${ov.delta}`);
  }

  // ── 3. Simuler version plus ancienne → carte « Nouvelle version » ──
  await page.evaluate(() => {
    window.__oseNativeVersion = '2.0.50';
    window.__oseUpdaterLatest = '2.0.63';
    window.__oseUpdaterNotes = 'Correctifs MAJ — test audit clic.';
    window.__oseUpdaterState = 2;
  });
  await page.evaluate(async () => {
    // Cache minimal si GitHub rate-limit
    if (!_hubNewsCache?.releases?.length) {
      _hubNewsCache = {
        at: Date.now(),
        releases: [{
          ver: '2.0.63',
          name: 'Open Solar Energy v2.0.63',
          notes: 'Suppression fallback APK navigateur.',
          date: new Date().toISOString(),
          url: 'https://github.com/Poisson48/open_solar_energy/releases/tag/v2.0.63',
          apk: 'https://github.com/Poisson48/open_solar_energy/releases/download/v2.0.63/opensolarenergy-v2.0.63-arm64.apk',
        }],
      };
    }
    if (typeof refreshHubNews === 'function') await refreshHubNews(false);
    else if (typeof _renderHubNews === 'function') {
      _renderHubNews(document.getElementById('ose-hub-news'), '2.0.50', _hubNewsCache.releases, {
        nativeLatest: '2.0.63',
        nativeNotes: window.__oseUpdaterNotes,
        nativeState: 2,
      });
    }
  });
  await page.waitForTimeout(400);
  await shot(page, vp.name, '03-update-available');

  const featured = page.locator('#ose-hub-update-featured');
  if (await featured.isVisible().catch(() => false)) {
    logOk(vp.name, 'carte « Nouvelle version » visible');
  } else {
    const news = await hubNewsText(page);
    if (/nouvelle version|mettre à jour/i.test(news))
      logOk(vp.name, 'UI MAJ disponible (texte)', news.slice(0, 60));
    else logFail(vp.name, 'carte MAJ disponible absente', news.slice(0, 80));
  }

  // Voir plus
  {
    const more = page.locator('#ose-hub-update-featured button', { hasText: 'Voir plus' }).first();
    if (await more.count()) {
      await more.click({ force: true });
      await page.waitForTimeout(200);
      const expanded = await page.evaluate(() =>
        document.getElementById('ose-hub-news-update-body')?.classList.contains('expanded'));
      if (expanded) logOk(vp.name, 'clic Voir plus → expanded');
      else logFail(vp.name, 'Voir plus sans expanded');
      await shot(page, vp.name, '04-voir-plus');
    } else {
      logNote(vp.name, 'Voir plus', 'bouton absent (notes courtes)');
    }
  }

  // Mettre à jour sans pont → message clair (jamais ouverture APK / navigateur)
  {
    const opened = [];
    await page.exposeFunction?.('__oseTrackOpen').catch(() => {});
    await page.evaluate(() => {
      window.__oseOpenedUrls = [];
      const orig = window.open;
      window.open = function (url) {
        window.__oseOpenedUrls.push(String(url || ''));
        return null;
      };
      window.__oseOrigOpen = orig;
    });
    const upd = page.locator('button', { hasText: 'Mettre à jour' }).first();
    if (await upd.count()) {
      await upd.click({ force: true });
      await page.waitForTimeout(2800);
      await shot(page, vp.name, '05-after-mettre-a-jour');
      const info = await page.evaluate(() => ({
        progress: (document.getElementById('ose-hub-update-progress')?.innerText || '').trim(),
        toast: (document.getElementById('ose-toast')?.textContent
          || document.querySelector('.toast, .ose-toast')?.textContent || '').trim(),
        opened: window.__oseOpenedUrls || [],
        hasApkBtn: !!document.querySelector('#ose-hub-update-progress button[onclick*="openUpdateApkFallback"], button[onclick*="openUpdateApkFallback"]'),
        hasFallbackFn: typeof openUpdateApkFallback === 'function',
      }));
      if (info.hasFallbackFn || info.hasApkBtn)
        logFail(vp.name, 'fallback APK encore présent', JSON.stringify(info));
      else if (info.opened.length)
        logFail(vp.name, 'window.open déclenché (interdit)', info.opened.join(','));
      else if (/ouverture du téléchargement apk|ouvrir l’apk/i.test(info.toast + info.progress))
        logFail(vp.name, 'toast fallback APK', info.toast || info.progress);
      else if (/appimage|android|in-app|native|indisponible|mise à jour/i.test(info.toast + info.progress))
        logOk(vp.name, 'clic Mettre à jour → message in-app (pas d’APK)', (info.toast || info.progress).slice(0, 80));
      else
        logFail(vp.name, 'clic Mettre à jour sans feedback correct', JSON.stringify(info).slice(0, 160));
    } else {
      logFail(vp.name, 'bouton Mettre à jour absent');
    }
  }

  // ── 4. Simulation états updater Qt (PC / tablette shell) ──
  const states = [
    { st: 1, msg: 'Vérification…', shot: '06-state-checking', expect: /vérif|en cours/i },
    { st: 3, msg: 'Téléchargement…', shot: '07-state-download', expect: /télécharg|%|en cours/i, prog: 0.42, bytes: 12e6 },
    { st: 4, msg: 'Prêt à installer', shot: '08-state-ready', expect: /install|android|prêt/i },
    { st: 5, msg: 'Échec simulé réseau', shot: '09-state-failed', expect: /échec|erreur|réessayer/i },
  ];

  for (const s of states) {
    await page.evaluate(({ st, msg, prog, bytes }) => {
      window.__oseUpdateRequested = true;
      window.__oseUpdaterState = st;
      if (prog != null) window.__oseUpdaterProgress = prog;
      if (bytes != null) window.__oseUpdaterBytes = bytes;
      if (typeof __oseOnUpdaterState === 'function') __oseOnUpdaterState(st, msg);
      else if (typeof _renderHubUpdateProgress === 'function') _renderHubUpdateProgress(st, msg);
    }, s);
    await page.waitForTimeout(250);
    await shot(page, vp.name, s.shot);
    const txt = await page.evaluate(() =>
      (document.getElementById('ose-hub-update-progress')?.innerText || '').trim());
    if (s.expect.test(txt)) logOk(vp.name, `état updater ${s.st}`, txt.slice(0, 60).replace(/\s+/g, ' '));
    else logFail(vp.name, `état updater ${s.st} UI`, txt.slice(0, 80));
  }

  // Réessayer après échec
  {
    const retry = page.locator('#ose-hub-update-progress button', { hasText: 'Réessayer' }).first();
    if (await retry.count()) {
      await retry.click({ force: true });
      await page.waitForTimeout(600);
      await shot(page, vp.name, '10-retry');
      logOk(vp.name, 'clic Réessayer');
    } else {
      logFail(vp.name, 'bouton Réessayer absent après échec');
    }
  }

  // Bouton Vérifier les MAJ dans news (si erreur charge) — sinon re-clic hub MAJ
  {
    await page.locator('#btn-check-updates').click({ force: true }).catch(() => {});
    await page.waitForTimeout(900);
    await shot(page, vp.name, '11-recheck');
    logOk(vp.name, 're-clic MAJ hub');
  }

  if (pageErrors.length)
    logFail(vp.name, 'pageerrors JS', pageErrors.slice(0, 4).join(' | '));
  else logOk(vp.name, 'aucune pageerror');

  await page.close();
}

// ── main ──
rmSync(ART, { recursive: true, force: true });
mkdirSync(ART, { recursive: true });

const server = await startServer();
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;
console.log(`Serveur: ${url}`);
console.log(`Artefacts: ${ART}`);

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

for (const vp of VIEWPORTS) {
  try {
    await runViewport(browser, url, vp);
  } catch (e) {
    fails++;
    console.error(`  ✗ viewport ${vp.name} crash — ${e.message || e}`);
    if (!report.viewports[vp.name]) report.viewports[vp.name] = { ok: [], fail: [], notes: [] };
    report.viewports[vp.name].fail.push({ label: 'crash', detail: e.message || String(e) });
  }
}

await browser.close();
server.close();

report.fails = fails;
writeFileSync(join(ROOT, 'tests/update-click-audit-report.json'), JSON.stringify(report, null, 2));
writeFileSync(join(ART, 'report.json'), JSON.stringify(report, null, 2));

console.log('\n' + '─'.repeat(60));
console.log(fails === 0 ? '✅ UPDATE CLICK AUDIT OK' : `❌ UPDATE CLICK AUDIT — ${fails} échec(s)`);
console.log('Rapport: tests/update-click-audit-report.json');
console.log('─'.repeat(60));
process.exit(fails === 0 ? 0 : 1);

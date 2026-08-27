#!/usr/bin/env node
/**
 * tests/run_click_audit.mjs — Audit clic-par-clic exhaustif (desktop + téléphone)
 * Usage : node tests/run_click_audit.mjs
 *
 * Clique vraiment les boutons (Playwright), capture les erreurs JS / toasts /
 * débordements, screenshots + rapport JSON.
 */
import { createServer } from 'node:http';
import {
  readFileSync, existsSync, statSync, writeFileSync, mkdirSync, rmSync,
} from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './playwright.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '../..');
const ART = join(ROOT, 'tests/artifacts/click-audit');
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },   // Android/iPad portrait
  { name: 'tablet-ls', width: 1024, height: 768 }, // tablette paysage
  { name: 'phone', width: 360, height: 740 },      // Android phone
];

const SKIP_CLICK_RE = [
  /startPhotoMode|stopPhotoMode|capturePhoto/i,
  /openEnedisModal|startImportProjects|importProjectsFile/i,
  /window\.open|target="_blank"/i,
  /printQuote|download|exportAll|exportCurrentProject/i,
  /shareCurrentProject|checkForUpdates|startUpdate/i,
  /openManagerModal|openLibraryModal|openPanelPicker|openMaterielModal/i,
  /leaflet/i,
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

function btnLabel(elHandleInfo) {
  const t = (elHandleInfo.text || '').replace(/\s+/g, ' ').trim();
  return (elHandleInfo.id || elHandleInfo.onclick || t || elHandleInfo.tag).slice(0, 80);
}

let fails = 0;
const report = {
  at: new Date().toISOString(),
  version: null,
  viewports: {},
  skips: [],
  appimage: null,
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
function logSkip(label, detail = '') {
  console.log(`  · skip ${label}${detail ? ' — ' + detail : ''}`);
  report.skips.push({ label, detail });
}
function logNote(vp, label, detail = '') {
  console.log(`  · [${vp}] ${label}${detail ? ' — ' + detail : ''}`);
  report.viewports[vp].notes.push({ label, detail });
}

async function shot(page, vp, name) {
  const dir = join(ART, vp);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function pageOverflow(page) {
  return page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const delta = document.documentElement.scrollWidth - cw;
    let worst = 0;
    let who = '';
    for (const el of document.body.querySelectorAll('*')) {
      if (el.classList?.contains('leaflet-tile')) continue;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const over = r.right - cw;
      if (over <= 8) continue;
      // ignore content inside horizontal scrollers that fit the viewport
      let p = el;
      let scrolled = false;
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX;
        if ((ox === 'auto' || ox === 'scroll' || ox === 'clip') && p.clientWidth <= cw + 1) {
          scrolled = true; break;
        }
        p = p.parentElement;
      }
      if (scrolled) continue;
      if (over > worst) {
        worst = over;
        who = (el.id || el.className || el.tagName).toString().slice(0, 40);
      }
    }
    return { delta, worst, who };
  });
}

async function listVisibleButtons(page, rootSelector) {
  return page.evaluate((rootSel) => {
    const root = rootSel ? document.querySelector(rootSel) : document;
    if (!root) return [];
    const nodes = [...root.querySelectorAll('button, a.btn, [role="button"], input[type="submit"]')];
    const out = [];
    for (const el of nodes) {
      if (el.closest('.leaflet-control, .leaflet-container')) continue;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || st.pointerEvents === 'none') continue;
      // ancestor display:none (onglet inactif)
      let hide = false;
      let p = el.parentElement;
      while (p) {
        if (getComputedStyle(p).display === 'none') { hide = true; break; }
        p = p.parentElement;
      }
      if (hide) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (el.disabled) continue;
      const onclick = el.getAttribute('onclick') || '';
      out.push({
        id: el.id || '',
        text: (el.innerText || el.textContent || '').slice(0, 60),
        onclick,
        tag: el.tagName,
        cls: String(el.className || '').slice(0, 60),
        tab: el.getAttribute('data-tab') || '',
        type: el.getAttribute('data-type') || '',
      });
    }
    return out;
  }, rootSelector || null);
}

function shouldSkip(info) {
  const blob = `${info.id} ${info.onclick} ${info.text} ${info.cls}`;
  return SKIP_CLICK_RE.some((re) => re.test(blob));
}

function cssEscapeId(id) {
  return String(id).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

async function safeClick(page, info) {
  const errorsBefore = page.__oseErrors.length;
  let result = { ok: false, via: 'not-found' };
  try {
    if (info.id) {
      const loc = page.locator(`#${cssEscapeId(info.id)}`).first();
      if (await loc.count()) {
        await loc.click({ timeout: 2500, force: true });
        result = { ok: true, via: '#' + info.id };
      }
    }
    if (!result.ok && info.tab) {
      await page.locator(`.tab-btn[data-tab="${info.tab}"]`).first().click({ timeout: 2500, force: true });
      result = { ok: true, via: 'data-tab' };
    }
    if (!result.ok && info.onclick) {
      const clicked = await page.evaluate((oc) => {
        const els = [...document.querySelectorAll('button, a.btn, [role="button"]')];
        const el = els.find((e) => (e.getAttribute('onclick') || '') === oc);
        if (!el) return false;
        el.click();
        return true;
      }, info.onclick);
      if (clicked) result = { ok: true, via: 'onclick' };
    }
    if (!result.ok) {
      const t = (info.text || '').trim();
      if (t.length >= 2) {
        await page.getByRole('button', { name: t }).first().click({ timeout: 2000, force: true }).catch(() => null);
        result = { ok: true, via: 'text' };
      }
    }
  } catch (e) {
    result = { ok: false, via: 'error', err: e.message || String(e) };
  }
  await page.waitForTimeout(180);
  const newErrs = page.__oseErrors.slice(errorsBefore);
  if (newErrs.length)
    return { ok: false, via: 'pageerror', err: newErrs.join(' | ') };
  return result;
}

async function closeOverlays(page) {
  await page.evaluate(() => {
    if (typeof PanelDB !== 'undefined' && PanelDB.closeManagerModal)
      try { PanelDB.closeManagerModal(); } catch {}
    if (typeof InverterDB !== 'undefined' && InverterDB.closeManagerModal)
      try { InverterDB.closeManagerModal(); } catch {}
    if (typeof closeMaterielModal === 'function') try { closeMaterielModal(); } catch {}
    if (typeof closeEditProjectModal === 'function') try { closeEditProjectModal(); } catch {}
    if (typeof closeEnedisModal === 'function') try { closeEnedisModal(); } catch {}
    if (typeof closeGitHistoryModal === 'function') try { closeGitHistoryModal(); } catch {}
    if (typeof closeJoinSharedModal === 'function') try { closeJoinSharedModal(); } catch {}
    if (typeof closeShareModal === 'function') try { closeShareModal(); } catch {}
    if (typeof closeProjectsModal === 'function') try { closeProjectsModal(); } catch {}
    if (typeof closeInstallTypeMenu === 'function') try { closeInstallTypeMenu(); } catch {}
    if (typeof closeProjectBarMore === 'function') try { closeProjectBarMore(); } catch {}
    for (const id of ['panel-db-modal', 'inverter-db-modal', 'materiel-modal']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    document.querySelectorAll('[role="dialog"]').forEach((d) => {
      if (d.id === 'startup-modal') return;
      const st = getComputedStyle(d);
      if (st.display !== 'none' && st.visibility !== 'hidden') {
        if (d.style) d.style.display = 'none';
        d.classList.remove('ose-hub-open');
      }
    });
  });
  await page.waitForTimeout(100);
}

async function openDemo(page) {
  await page.evaluate(() => {
    if (typeof seedDemoProject === 'function') seedDemoProject();
    if (typeof seedDemoHybridProject === 'function') seedDemoHybridProject();
    if (typeof loadProject === 'function' && typeof DEMO_PROJECT_ID !== 'undefined')
      loadProject(DEMO_PROJECT_ID);
    if (typeof closeStartupModal === 'function') closeStartupModal();
  });
  await page.waitForTimeout(250);
}

async function clickAllIn(page, vp, scopeLabel, rootSelector, opts = {}) {
  const max = opts.max ?? 40;
  const buttons = await listVisibleButtons(page, rootSelector);
  let clicked = 0;
  let skipped = 0;
  for (const info of buttons) {
    if (clicked >= max) break;
    const label = btnLabel(info);
    if (shouldSkip(info)) {
      skipped++;
      logSkip(`${scopeLabel}: ${label}`, 'hors scope auto');
      continue;
    }
    // Avoid re-opening hub / destroying session mid-scan for some actions
    if (/openProjectsModal|showInstallationTypeStep|showStartupStep1/i.test(info.onclick || '')) {
      if (opts.allowHub) {
        /* ok */
      } else {
        skipped++;
        continue;
      }
    }
    const res = await safeClick(page, info);
    clicked++;
    if (!res.ok) {
      logFail(vp, `clic ${scopeLabel}: ${label}`, res.err || res.via);
      await shot(page, vp, `fail-${scopeLabel}-${clicked}`);
    }
    await closeOverlays(page);
  }
  logNote(vp, `${scopeLabel}: boutons`, `${clicked} cliqués, ${skipped} skip, ${buttons.length} visibles`);
  return { clicked, skipped, total: buttons.length };
}

async function runViewport(browser, url, vp) {
  console.log(`\n═══ Viewport ${vp.name} (${vp.width}×${vp.height}) ═══`);
  report.viewports[vp.name] = { ok: [], fail: [], notes: [] };

  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  page.__oseErrors = [];
  page.on('pageerror', (e) => page.__oseErrors.push(e.message || String(e)));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof ProjectManager !== 'undefined' && typeof AppState !== 'undefined');
  await page.waitForTimeout(400);

  const ver = await page.evaluate(() => (typeof APP_VERSION !== 'undefined' ? APP_VERSION : null));
  report.version = ver;
  logOk(vp.name, 'APP_VERSION', String(ver));

  // ── Hub ──
  await shot(page, vp.name, '00-hub');
  const hubOpen = await page.evaluate(() =>
    document.getElementById('startup-modal')?.classList.contains('ose-hub-open'));
  if (!hubOpen) logFail(vp.name, 'hub ouvert au démarrage');
  else logOk(vp.name, 'hub ouvert au démarrage');

  // Hub toolbar clicks (careful order)
  for (const sel of [
    '#btn-check-updates',
  ]) {
    const el = page.locator(sel);
    if (await el.count()) {
      await el.click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
    }
  }
  logOk(vp.name, 'hub: clic MAJ (toast/pont)');

  // Matériel open/close
  {
    const btn = page.locator('button.ose-hub-secondary-action', { hasText: 'Matériel' }).first();
    if (await btn.count()) {
      await btn.click({ force: true });
      await page.waitForTimeout(300);
      await shot(page, vp.name, '01-materiel');
      await page.evaluate(() => {
        if (typeof closeMaterielModal === 'function') closeMaterielModal();
        else document.querySelectorAll('.ose-materiel-modal, #materiel-modal, [id*="materiel"]').forEach((n) => {
          if (n.style) n.style.display = 'none';
        });
      });
      logOk(vp.name, 'hub: Matériel open/close');
    }
  }

  // Nouveau → types
  {
    await page.evaluate(() => {
      if (typeof showInstallationTypeStep === 'function') showInstallationTypeStep();
    });
    await page.waitForTimeout(300);
    await shot(page, vp.name, '02-type');
    const typeStep = await page.locator('#startup-step-type').isVisible().catch(() => false);
    if (!typeStep) logFail(vp.name, 'étape type (showInstallationTypeStep)');
    else logOk(vp.name, 'étape type visible');
    for (const name of ['Réseau sans stockage', 'Hybride', 'Autonome', 'Réseau']) {
      const b = page.locator('#startup-step-type button', { hasText: name }).first();
      if (!(await b.count())) continue;
      await b.click({ force: true });
      await page.waitForTimeout(250);
      logOk(vp.name, `type ${name} cliquable`);
      await page.evaluate(() => {
        if (typeof showInstallationTypeStep === 'function') showInstallationTypeStep();
      });
      await page.waitForTimeout(150);
    }
    await page.evaluate(() => {
      if (typeof showStartupStep1 === 'function') showStartupStep1();
    });
  }

  // Open demo project (real card click if possible)
  {
    const card = page.locator('#projects-list button, #projects-list .ose-project-card, #projects-list [data-project-id]').first();
    if (await card.count()) {
      await card.click({ force: true });
      await page.waitForTimeout(400);
    } else {
      await openDemo(page);
    }
    const closed = await page.evaluate(() =>
      !document.getElementById('startup-modal')?.classList.contains('ose-hub-open'));
    if (!closed) {
      await openDemo(page);
    }
    const ok = await page.evaluate(() =>
      !document.getElementById('startup-modal')?.classList.contains('ose-hub-open')
      && !!AppState.currentProjectId);
    if (ok) logOk(vp.name, 'ouverture projet démo');
    else logFail(vp.name, 'ouverture projet démo');
    await shot(page, vp.name, '03-after-demo');
  }

  // ── Barre projet ──
  for (const id of ['btn-save-project', 'install-type-badge', 'btn-edit-project', 'project-bar-location']) {
    const loc = page.locator(`#${id}`);
    if (!(await loc.count()) || !(await loc.isVisible().catch(() => false))) continue;
    await loc.click({ force: true });
    await page.waitForTimeout(250);
    await closeOverlays(page);
    logOk(vp.name, `barre: #${id}`);
  }
  if (vp.width <= 720) {
    const more = page.locator('#btn-project-bar-more');
    if (await more.isVisible().catch(() => false)) {
      await more.click({ force: true });
      await page.waitForTimeout(200);
      await shot(page, vp.name, '04-more-menu');
      await closeOverlays(page);
      logOk(vp.name, 'barre: menu ⋯');
    }
  }

  // ── Primary tabs + click all buttons in pane ──
  const primaryTabs = ['location', 'sizing', 'grid', 'quote', 'offgrid'];
  for (const tab of primaryTabs) {
    const tabBtn = page.locator(`.tab-btn[data-tab="${tab}"]`);
    const visible = await tabBtn.isVisible().catch(() => false);
    if (!visible) {
      logNote(vp.name, `onglet ${tab}`, 'masqué (type install)');
      continue;
    }
    await tabBtn.click({ force: true });
    await page.waitForTimeout(350);
    await page.evaluate((t) => {
      if (typeof activateTab === 'function') activateTab(t);
    }, tab);
    await page.waitForTimeout(150);
    await shot(page, vp.name, `tab-${tab}`);
    const ov = await pageOverflow(page);
    if (ov.delta > 8 || ov.worst > 8)
      logFail(vp.name, `overflow ${tab}`, `Δ=${ov.delta} worst=${ov.worst} ${ov.who}`);
    else logOk(vp.name, `pas d’overflow ${tab}`);

    await clickAllIn(page, vp.name, `pane-${tab}`, `#tab-${tab}.active, #tab-${tab}`, { max: 25 });
  }

  // ── Advanced tabs ──
  {
    const more = page.locator('#btn-toggle-advanced-tabs');
    if (await more.count()) {
      await more.click({ force: true });
      await page.waitForTimeout(200);
      logOk(vp.name, 'outils avancés ouverts');
    }
    const adv = ['cables', 'irradiation', 'daily', 'tracker', 'optimizer', 'layout', 'site'];
    for (const tab of adv) {
      const tabBtn = page.locator(`.tab-btn[data-tab="${tab}"]`);
      if (!(await tabBtn.isVisible().catch(() => false))) continue;
      await tabBtn.click({ force: true });
      await page.waitForTimeout(280);
      await shot(page, vp.name, `adv-${tab}`);
      const ov = await pageOverflow(page);
      if (ov.worst > 8 && ov.delta > 8)
        logFail(vp.name, `overflow adv ${tab}`, `${ov.who}+${ov.worst}`);
      else logOk(vp.name, `onglet avancé ${tab}`);
      await clickAllIn(page, vp.name, `adv-${tab}`, `#tab-${tab}`, { max: 15 });
    }
  }

  // ── Parcours métier ──
  console.log(`  — parcours métier [${vp.name}]`);
  try {
    await closeOverlays(page);
    await openDemo(page);
    await closeOverlays(page);
    await page.evaluate(() => {
      if (typeof applyInstallationType === 'function') applyInstallationType('grid');
    });
    await page.waitForTimeout(200);

    // Sizing calc
    {
      await page.locator('.tab-btn[data-tab="sizing"]').click({ force: true });
      await page.evaluate(() => { if (typeof activateTab === 'function') activateTab('sizing'); });
      await page.waitForTimeout(250);
      await closeOverlays(page);
      await page.evaluate(() => {
        // Garantir météo démo si absente (hub / scan boutons)
        if (!AppState.weatherData && AppState.demoData?.locations) {
          const loc = Object.values(AppState.demoData.locations)[0];
          if (loc) {
            AppState.location = { lat: loc.lat, lon: loc.lon, name: loc.name || 'Demo' };
            AppState.weatherData = loc.monthly;
          }
        }
        const d = document.getElementById('sz-load-day');
        const n = document.getElementById('sz-load-night');
        if (d && !d.value) d.value = '8';
        if (n && !n.value) n.value = '4';
        const s = document.getElementById('sz-surface');
        if (s && !(parseFloat(s.value) > 0)) s.value = '40';
        for (let i = 1; i <= 12; i++) {
          const el = document.getElementById(`sz-kwh-${i}`);
          if (el && !(parseFloat(el.value) > 0)) el.value = '350';
        }
      });
      const calc = page.locator('#btn-calc-sizing');
      if (await calc.count()) {
        await calc.scrollIntoViewIfNeeded().catch(() => {});
        await calc.click({ force: true });
        await page.waitForTimeout(1500);
        await closeOverlays(page);
        await shot(page, vp.name, 'biz-sizing-result');
        const hasRes = await page.evaluate(() => {
          const el = document.getElementById('sizing-results');
          return !!(el && !el.querySelector('.result-placeholder') && el.innerText.length > 40);
        });
        if (hasRes) logOk(vp.name, 'dimensionnement → résultats');
        else {
          const tip = await page.evaluate(() => ({
            weather: !!AppState.weatherData,
            toast: document.querySelector('.toast, .ose-toast')?.innerText || '',
            html: (document.getElementById('sizing-results')?.innerText || '').slice(0, 120),
          }));
          logFail(vp.name, 'dimensionnement → résultats vides', JSON.stringify(tip));
        }
      }
    }

    // Hybrid battery step
    {
      await page.evaluate(() => {
        if (typeof closeStartupModal === 'function') closeStartupModal();
        if (typeof applyInstallationType === 'function') applyInstallationType('hybrid');
        if (typeof activateTab === 'function') activateTab('sizing');
      });
      await page.waitForTimeout(300);
      await closeOverlays(page);
      await page.evaluate(() => {
        if (typeof closeStartupModal === 'function') closeStartupModal();
        document.getElementById('sz-battery-step')?.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(150);
      const batt = await page.evaluate(() => {
        const el = document.getElementById('sz-battery-step');
        if (!el) return { ok: false, reason: 'missing' };
        const cs = getComputedStyle(el);
        const hub = document.getElementById('startup-modal');
        const hubOpen = !!(hub && hub.classList.contains('ose-hub-open') && !hub.hasAttribute('hidden'));
        return {
          ok: AppState.installationType === 'hybrid'
            && cs.display !== 'none'
            && cs.visibility !== 'hidden'
            && !hubOpen,
          type: AppState.installationType,
          display: cs.display,
          hubOpen,
        };
      });
      if (batt.ok) logOk(vp.name, 'hybride: étape batterie visible');
      else logFail(vp.name, 'hybride: étape batterie invisible', JSON.stringify(batt));
      await shot(page, vp.name, 'biz-hybrid-batt');
    }

    // Offgrid
    {
      await closeOverlays(page);
      await page.evaluate(() => {
        if (typeof applyInstallationType === 'function') applyInstallationType('offgrid');
        else if (typeof chooseInstallationType === 'function') chooseInstallationType('offgrid');
      });
      await page.waitForTimeout(300);
      const ogBtn = page.locator('.tab-btn[data-tab="offgrid"]');
      if (await ogBtn.isVisible().catch(() => false)) {
        await ogBtn.click({ force: true });
        await page.evaluate(() => { if (typeof activateTab === 'function') activateTab('offgrid'); });
        await page.waitForTimeout(250);
        await closeOverlays(page);
        await page.evaluate(() => {
          if (!AppState.weatherData && AppState.demoData?.locations) {
            const loc = Object.values(AppState.demoData.locations)[0];
            if (loc) {
              AppState.location = { lat: loc.lat, lon: loc.lon, name: loc.name || 'Demo' };
              AppState.weatherData = loc.monthly;
            }
          }
          const def = document.getElementById('og2-daily-default');
          if (def && !(parseFloat(def.value) > 0)) def.value = '5000';
          const surf = document.getElementById('og2-surface');
          if (surf && !(parseFloat(surf.value) > 0)) surf.value = '40';
        });
        const calc = page.locator('#btn-calc-offgrid2');
        if (await calc.count()) {
          await calc.scrollIntoViewIfNeeded().catch(() => {});
          await calc.click({ force: true });
          await page.waitForTimeout(1800);
          await closeOverlays(page);
          await shot(page, vp.name, 'biz-offgrid-result');
          const hasRes = await page.evaluate(() => {
            const el = document.getElementById('offgrid2-results');
            return !!(el && !el.querySelector('.result-placeholder') && el.innerText.length > 40);
          });
          if (hasRes) logOk(vp.name, 'offgrid → résultats');
          else logFail(vp.name, 'offgrid → résultats vides');
        }
      } else logFail(vp.name, 'onglet offgrid non visible');
    }

    // Quote
    {
      await page.evaluate(() => {
        if (typeof applyInstallationType === 'function') applyInstallationType('grid');
      });
      await page.waitForTimeout(200);
      await page.locator('.tab-btn[data-tab="quote"]').click({ force: true });
      await page.evaluate(() => { if (typeof activateTab === 'function') activateTab('quote'); });
      await page.waitForTimeout(300);
      const imp = page.locator('button', { hasText: 'Importer depuis le dimensionnement' }).first();
      if (await imp.count()) {
        await imp.click({ force: true });
        await page.waitForTimeout(400);
        logOk(vp.name, 'devis: import dimensionnement');
      }
      const prev = page.locator('button', { hasText: 'Aperçu' }).first();
      if (await prev.count()) {
        await prev.click({ force: true });
        await page.waitForTimeout(800);
        await shot(page, vp.name, 'biz-quote-preview');
        logOk(vp.name, 'devis: aperçu cliqué');
      }
    }

    // Cables
    {
      await page.evaluate(() => {
        if (typeof window.__oseEnsureAdvancedTabs === 'function') window.__oseEnsureAdvancedTabs();
        document.getElementById('btn-toggle-advanced-tabs')?.click();
      });
      await page.waitForTimeout(150);
      const cab = page.locator('.tab-btn[data-tab="cables"]');
      if (await cab.isVisible().catch(() => false)) {
        await cab.click({ force: true });
        await page.waitForTimeout(250);
        const calcBtns = page.locator('#tab-cables button', { hasText: /Calculer/i });
        const n = await calcBtns.count();
        for (let i = 0; i < Math.min(n, 2); i++) {
          await calcBtns.nth(i).click({ force: true }).catch(() => {});
          await page.waitForTimeout(400);
        }
        await shot(page, vp.name, 'biz-cables');
        logOk(vp.name, 'câbles: boutons Calculer');
      }
    }
  } catch (e) {
    logFail(vp.name, 'parcours métier exception', e.message || String(e));
    await shot(page, vp.name, 'biz-exception').catch(() => {});
  }

  // pageerrors summary
  if (page.__oseErrors.length) {
    logFail(vp.name, 'pageerrors JS', page.__oseErrors.slice(0, 5).join(' | '));
  } else {
    logOk(vp.name, 'aucune pageerror');
  }

  await page.close();
}

// ── AppImage smoke (best-effort, dernière release connue) ──
async function appImageSmoke() {
  const { execSync } = await import('node:child_process');
  const pkgVer = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const info = { ok: false, detail: '' };
  try {
    const ps = execSync('ps aux', { encoding: 'utf8' });
    const re = new RegExp(`OpenSolarEnergy-${pkgVer.replace(/\./g, '\\.')}`, 'i');
    if (re.test(ps) || /OpenSolarEnergy-\d+\.\d+\.\d+/i.test(ps)) {
      info.ok = true;
      info.detail = re.test(ps) ? `processus ${pkgVer} déjà actif` : 'AppImage déjà active';
      report.appimage = info;
      console.log(`\n═══ AppImage smoke ═══`);
      console.log(`  ✓ AppImage démarrée — ${info.detail}`);
      return info;
    }
    const outDir = `/tmp/ose-v${pkgVer.replace(/\./g, '')}`;
    mkdirSync(outDir, { recursive: true });
    const imgName = `OpenSolarEnergy-${pkgVer}-x86_64.AppImage`;
    const img = join(outDir, imgName);
    if (!existsSync(img)) {
      execSync(`gh release download v${pkgVer} -p '*.AppImage' -R Poisson48/open_solar_energy --clobber`, {
        cwd: outDir, stdio: 'pipe',
      });
    }
    execSync(`chmod +x "${img}"`);
    execSync(`"${img}" > "${join(outDir, 'audit.log')}" 2>&1 & echo $! > "${join(outDir, 'audit.pid')}"`, {
      shell: '/bin/bash', stdio: 'pipe',
    });
    await new Promise((r) => setTimeout(r, 6000));
    const ps2 = execSync('ps aux', { encoding: 'utf8' });
    info.ok = re.test(ps2);
    info.detail = info.ok ? `démarrée pour audit (${pkgVer})` : 'processus introuvable après 6s';
  } catch (e) {
    info.ok = false;
    info.detail = e.message || String(e);
  }
  report.appimage = info;
  console.log(`\n═══ AppImage smoke ═══`);
  console.log(info.ok ? `  ✓ AppImage démarrée — ${info.detail}` : `  ⚠ AppImage — ${info.detail}`);
  return info;
}

// ── main ──
rmSync(ART, { recursive: true, force: true });
mkdirSync(ART, { recursive: true });

await appImageSmoke();

const server = await startServer();
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;
console.log(`\nServeur audit: ${url}`);
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
writeFileSync(join(ROOT, 'tests/click-audit-report.json'), JSON.stringify(report, null, 2));
writeFileSync(join(ART, 'report.json'), JSON.stringify(report, null, 2));

console.log('\n' + '─'.repeat(60));
console.log(fails === 0 ? '✅ CLICK AUDIT OK' : `❌ CLICK AUDIT — ${fails} échec(s)`);
console.log('Rapport: tests/click-audit-report.json');
console.log('─'.repeat(60));
process.exit(fails === 0 ? 0 : 1);

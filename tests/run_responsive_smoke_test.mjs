/**
 * tests/run_responsive_smoke_test.mjs — Layout mobile multi-tailles
 * Viewports : Pixel 7, iPhone SE, Galaxy S8, iPad mini, desktop.
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

const VIEWPORTS = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'Pixel 7', width: 412, height: 915 },
  { name: 'Galaxy S8', width: 360, height: 740 },
  { name: 'Phone landscape', width: 740, height: 360 },
  { name: 'iPad mini portrait', width: 768, height: 1024 },
  { name: 'iPad mini landscape', width: 1024, height: 768 },
  { name: 'Tablet landscape', width: 1180, height: 820 },
  { name: 'Desktop', width: 1280, height: 800 },
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
function check(label, ok, detail = '') {
  if (ok) console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`);
  else { console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); fails++; }
}

const server = await startServer();
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

for (const vp of VIEWPORTS) {
  console.log(`\n== ${vp.name} (${vp.width}×${vp.height}) ==`);
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    if (typeof closeStartupModal === 'function') closeStartupModal();
  });
  await page.waitForTimeout(200);

  const metrics = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const clientW = document.documentElement.clientWidth;
    const header = document.querySelector('header');
    const bar = document.getElementById('project-bar');
    const actions = document.querySelector('.project-bar-actions');
    const tabs = document.querySelector('.tabs-bar');
    const buttons = actions ? [...actions.querySelectorAll(':scope > button, :scope > .btn, :scope > .ose-type-switcher > button')] : [];
    const clippedBtns = buttons.filter(b => {
      const r = b.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false; // hors écran / menu fermé
      if (getComputedStyle(b).visibility === 'hidden' || getComputedStyle(b).display === 'none') return false;
      // Texte vraiment coupé dans le bouton visible
      return b.clientWidth > 20 && b.scrollWidth > b.clientWidth + 4;
    }).map(b => (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28));

    // Vérifier que les boutons de la barre ne sont pas écrasés (flex scroll)
    const actionsOverflow = actions
      ? actions.scrollWidth > actions.clientWidth + 1 || buttons.every(b => {
          const cs = getComputedStyle(b);
          return cs.flexGrow === '0' || cs.flex === '0 0 auto';
        })
      : true;

    const tabBtns = tabs ? [...tabs.querySelectorAll('.tab-btn')] : [];
    const tabOverflowOk = !tabs || tabs.scrollWidth >= tabs.clientWidth;

    // Site tab photo wrap markup exists after switch
    return {
      overflowX: docW - clientW,
      headerH: header ? header.getBoundingClientRect().height : 0,
      barTop: bar ? getComputedStyle(bar).top : '',
      clippedBtns,
      btnFlexOk: actionsOverflow,
      tabCount: tabBtns.length,
      tabOverflowOk,
      hasChartsGridCss: !!document.querySelector('style, link') &&
        [...document.styleSheets].some(s => {
          try {
            return [...(s.cssRules || [])].some(r => String(r.cssText || '').includes('ose-charts-grid'));
          } catch { return false; }
        }),
    };
  });

  check('pas de débordement horizontal majeur', metrics.overflowX <= 8, `Δ=${metrics.overflowX}px`);
  check('header sticky présent', metrics.headerH > 0, `${Math.round(metrics.headerH)}px`);
  check('boutons barre non tronqués (texte)', metrics.clippedBtns.length === 0, metrics.clippedBtns.join('|'));
  check('barre actions scrollable / non flex-écrasée', metrics.btnFlexOk);
  check('onglets présents', metrics.tabCount > 0, String(metrics.tabCount));

  // Ouvrir Site / Ombrage et vérifier le markup photo
  await page.evaluate(() => {
    if (typeof window.__oseSyncAdvancedTabs === 'function') window.__oseSyncAdvancedTabs();
    const more = document.getElementById('btn-toggle-advanced-tabs');
    if (more && getComputedStyle(more).display !== 'none') more.click();
  });
  await page.waitForTimeout(150);
  const siteBtn = page.locator('.tab-btn[data-tab="site"]');
  if (await siteBtn.count()) {
    await siteBtn.click({ force: true });
    await page.waitForTimeout(250);
    const siteOk = await page.evaluate(() => {
      const wrap = document.getElementById('site-photo-wrap');
      const video = document.getElementById('site-photo-video');
      const btn = document.querySelector('button[onclick*="startPhotoMode"]');
      return {
        hasWrap: !!wrap,
        hasVideo: !!video && video.hasAttribute('playsinline'),
        hasBtn: !!btn,
        videoMaxW: video ? video.getBoundingClientRect().width : 0,
        clientW: document.documentElement.clientWidth,
      };
    });
    check('UI photo ombrage présente', siteOk.hasWrap && siteOk.hasVideo && siteOk.hasBtn);
    // wrap est display:none tant que le mode photo n'est pas lancé — largeur 0 attendue
    check('markup vidéo playsinline OK', siteOk.hasVideo);
  } else {
    check('onglet Site accessible', false, 'bouton introuvable');
  }

  // Dimensionnement : grille graphiques selon largeur / orientation
  await page.click('.tab-btn[data-tab="sizing"]', { force: true }).catch(() => {});
  await page.waitForTimeout(200);
  const layoutInfo = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'ose-charts-grid';
    probe.style.cssText = 'position:absolute;left:-9999px;visibility:hidden';
    document.body.appendChild(probe);
    const cols = getComputedStyle(probe).gridTemplateColumns;
    probe.remove();
    const app = document.querySelector('.app-layout');
    const appCols = app ? getComputedStyle(app).gridTemplateColumns : '';
    return { chartCols: cols, appCols };
  });
  const tracks = layoutInfo.chartCols.trim().split(/\s+/).filter(t => t && t !== '/');
  const appTracks = layoutInfo.appCols.trim().split(/\s+/).filter(t => t && t !== '/' && !t.startsWith('['));
  const isLandscape = vp.width > vp.height;
  const expectChartOneCol = vp.width <= 900 && !(isLandscape && vp.height <= 520);
  if (expectChartOneCol) {
    check('graphiques en 1 colonne', tracks.length <= 1, layoutInfo.chartCols);
  } else {
    check('graphiques en 2 colonnes', tracks.length >= 2, layoutInfo.chartCols);
  }
  // Lieu est un onglet : app-layout = colonne unique (plus de grille sidebar|contenu)
  check('app-layout sans sidebar permanente', appTracks.length <= 1, layoutInfo.appCols);

  // Débordement réel par onglet (hors tuiles Leaflet) — le scrollWidth seul ment
  async function tabOverflow(tab) {
    await page.click(`.tab-btn[data-tab="${tab}"]`, { force: true }).catch(() => {});
    await page.waitForTimeout(220);
    return page.evaluate((tabName) => {
      const cw = document.documentElement.clientWidth;
      const pane = document.getElementById('tab-' + tabName);
      if (!pane) return { ok: false, detail: 'pane missing' };

      function inXScroll(el) {
        let p = el.parentElement;
        while (p && p !== document.body) {
          const st = getComputedStyle(p);
          const ox = st.overflowX;
          if ((ox === 'auto' || ox === 'scroll' || ox === 'clip') && p.clientWidth <= cw + 1)
            return true;
          // table display:block + overflow-x auto on itself
          if (p.tagName === 'TABLE') {
            const ts = getComputedStyle(p);
            if ((ts.overflowX === 'auto' || ts.overflowX === 'scroll') && p.clientWidth <= cw + 1)
              return true;
          }
          p = p.parentElement;
        }
        const self = getComputedStyle(el);
        if ((self.overflowX === 'auto' || self.overflowX === 'scroll') && el.clientWidth <= cw + 1)
          return true;
        return false;
      }

      let worst = 0;
      let who = '';
      for (const el of pane.querySelectorAll('*')) {
        if (el.classList?.contains('leaflet-tile')) continue;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        const over = r.right - cw;
        if (over <= 8) continue;
        if (inXScroll(el)) continue;
        if (over > worst) {
          worst = over;
          who = (el.id || el.className || el.tagName).toString().slice(0, 40);
        }
      }
      const pageDelta = document.documentElement.scrollWidth - cw;
      return {
        ok: worst <= 8 && pageDelta <= 8,
        detail: worst > 8 ? `${who}+${Math.round(worst)}px` : (pageDelta > 8 ? `pageΔ${pageDelta}` : '0'),
      };
    }, tab);
  }
  for (const tab of ['sizing', 'quote', 'grid', 'daily']) {
    if (tab === 'daily') {
      await page.evaluate(() => {
        if (typeof window.__oseEnsureAdvancedTabs === 'function') window.__oseEnsureAdvancedTabs();
      });
      await page.waitForTimeout(80);
    }
    const o = await tabOverflow(tab);
    check(`pas de débordement UI (${tab})`, o.ok, o.detail);
  }

  check('aucune pageerror', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  await page.close();
}

await browser.close();
server.close();

console.log(`\n${fails === 0 ? '✅ RESPONSIVE OK' : `❌ ${fails} échec(s)`}`);
process.exit(fails === 0 ? 0 : 1);

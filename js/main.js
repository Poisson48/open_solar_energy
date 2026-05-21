/**
 * main.js - Point d'entrée v1.5
 * Orchestre l'initialisation de tous les modules.
 * La logique métier est répartie dans :
 *   location.js, project_ui.js, renderers.js, hourly_module.js, inverter_sizing.js
 */

// ── Type d'installation : masque les onglets irrelevants ─────
const TABS_GRID_ONLY    = ['sizing', 'grid', 'tracker', 'optimizer'];
const TABS_OFFGRID_ONLY = ['offgrid'];

function applyInstallationType(type) {
  AppState.installationType = type;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    const tab  = btn.dataset.tab;
    const hide = (type === 'grid' && TABS_OFFGRID_ONLY.includes(tab))
              || (type === 'offgrid' && TABS_GRID_ONLY.includes(tab));
    btn.style.display = hide ? 'none' : '';
  });

  // Si l'onglet actif est masqué, aller au premier onglet visible
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn && activeBtn.style.display === 'none') {
    const first = document.querySelector('.tab-btn:not([style*="display: none"])');
    if (first) first.click();
  }

  // Badge dans la barre projet
  const badge = document.getElementById('install-type-badge');
  if (badge) {
    if (type === 'grid') {
      badge.textContent = '⚡ Réseau';
      badge.style.color = 'var(--color-accent)';
      badge.style.borderColor = 'var(--color-accent)';
      badge.style.background = 'rgba(245,166,35,0.08)';
    } else {
      badge.textContent = '🔋 Autonome';
      badge.style.color = 'var(--color-primary)';
      badge.style.borderColor = 'var(--color-primary)';
      badge.style.background = 'rgba(30,90,200,0.08)';
    }
  }
}

function toggleInstallationType() {
  const newType = AppState.installationType === 'grid' ? 'offgrid' : 'grid';
  applyInstallationType(newType);
}

// ── Synchronisation des paramètres d'installation partagés ──
const INSTALL_FIELDS = {
  sizing:  { tilt:'sz-tilt',    azimuth:'sz-azimuth',    surface:'sz-surface',    panelWp:'sz-panel-wp',    panelM2:'sz-panel-m2',    losses:'sz-losses'    },
  grid:    { tilt:'inp-tilt',   azimuth:'inp-azimuth',   surface:'inp-surface',   panelWp:'inp-panel-wp',   panelM2:'inp-panel-m2',   losses:'inp-losses'   },
  offgrid: { tilt:'og2-tilt',   azimuth:'og2-azimuth',   surface:'og2-surface',   panelWp:'og2-panel-wp',   panelM2:'og2-panel-m2',   losses:'og2-losses'   },
  daily:   { tilt:'hourly-tilt',azimuth:'hourly-azimuth' },
};

function readInstallFromTab(tab) {
  const map = INSTALL_FIELDS[tab];
  if (!map) return;
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const v = el.value !== '' ? parseFloat(el.value) : null;
    if (v !== null && !isNaN(v)) AppState.install[key] = v;
  }
}

function writeInstallToTab(tab) {
  const map = INSTALL_FIELDS[tab];
  if (!map) return;
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el || AppState.install[key] == null) continue;
    if (parseFloat(el.value) !== AppState.install[key]) el.value = AppState.install[key];
  }
}

function bindInstallSync(tab) {
  const map = INSTALL_FIELDS[tab];
  if (!map) return;
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      if (!isNaN(v)) AppState.install[key] = v;
    });
  }
}

// ── Gestion des onglets ──────────────────────────────────────
function activateTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
    b.setAttribute('tabindex', '-1');
  });
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (btn) {
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    btn.setAttribute('tabindex', '0');
  }
  const pane = document.getElementById('tab-' + tab);
  if (pane) pane.classList.add('active');
  AppState.activeTab = tab;
  if (tab === 'irradiation') renderIrradiationData();
  // Auto-affichage onglet horaire si données disponibles
  if (tab === 'daily') HourlyModule.autoComputeIfReady();
}

function initTabs() {
  const btns = [...document.querySelectorAll('.tab-btn')];
  btns.forEach((btn, idx) => {
    btn.setAttribute('tabindex', btn.classList.contains('active') ? '0' : '-1');
    btn.addEventListener('click', () => {
      const prev = AppState.activeTab;
      readInstallFromTab(prev);
      activateTab(btn.dataset.tab);
      writeInstallToTab(btn.dataset.tab);
    });
    btn.addEventListener('keydown', (e) => {
      const visible = btns.filter(b => b.style.display !== 'none');
      const vi = visible.indexOf(btn);
      let target = null;
      if (e.key === 'ArrowRight') target = visible[(vi + 1) % visible.length];
      if (e.key === 'ArrowLeft')  target = visible[(vi - 1 + visible.length) % visible.length];
      if (e.key === 'Home') target = visible[0];
      if (e.key === 'End')  target = visible[visible.length - 1];
      if (target) {
        e.preventDefault();
        target.focus();
        const prev = AppState.activeTab;
        readInstallFromTab(prev);
        activateTab(target.dataset.tab);
        writeInstallToTab(target.dataset.tab);
      }
    });
  });
}

// ── Point d'entrée ───────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {

  // 1. Injecter le HTML de chaque onglet
  initTabSizing();
  initTabGrid();
  initTabTracker();
  initTabOffgrid();
  initTabIrradiation();
  initTabDaily();
  initTabOptimizer();
  initTabQuote();

  // 2. Charger les données météo démo, initialiser la carte, injecter le projet démo
  await loadDemoData();
  seedDemoProject();
  initMap();
  initTabs();
  Object.keys(INSTALL_FIELDS).forEach(bindInstallSync);
  writeInstallToTab('sizing');
  applyInstallationType(AppState.installationType);
  initLocationInputs();

  // 3. Bind les interactions des formulaires
  bindOptimizeCheckboxes();
  bindSizingLiveTotal();
  bindBatteryInfo();
  bindOffgridLiveTotal();
  bindSharedParamSync();
  initQuoteTab();
  calcGridPanels(); // initialise l'affichage panneaux/kWc

  // 4. Brancher les boutons de calcul (avec état de chargement)
  document.getElementById('btn-calc-sizing')?.addEventListener('click',   () => withLoading('btn-calc-sizing',   calcSizing));
  document.getElementById('btn-calc-offgrid2')?.addEventListener('click', () => withLoading('btn-calc-offgrid2', calcOffgridSizing));
  document.getElementById('btn-calc-grid')?.addEventListener('click',     () => withLoading('btn-calc-grid',     calcGridSystem));
  document.getElementById('btn-calc-irr')?.addEventListener('click',      () => withLoading('btn-calc-irr',      renderIrradiationData));
  document.getElementById('btn-calc-opt')?.addEventListener('click',      () => withLoading('btn-calc-opt',      calcOptimization));
  document.getElementById('btn-calc-hourly')?.addEventListener('click',   () => withLoading('btn-calc-hourly',   () => HourlyModule.computeAllMonths()));

  // 5. Initialiser l'UI projets (modal démarrage, Ctrl+S, etc.)
  initProjectUI();

  // 6. Initialiser le module PVGIS Import
  setTimeout(() => {
    if (typeof PVGISImport !== 'undefined') PVGISImport.init();
  }, 100);

  // 7. Calculs initiaux
  setTimeout(() => {
    renderIrradiationData();
    calcSizing();
    HourlyModule.updateSourceStatus();
    // Si l'onglet daily est actif dès le démarrage, déclencher l'analyse
    if (AppState.activeTab === 'daily') HourlyModule.autoComputeIfReady();
  }, 350);

});

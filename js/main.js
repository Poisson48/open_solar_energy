/**
 * main.js — Point d'entrée v1.5
 * Orchestre l'initialisation de tous les modules.
 * La logique métier est répartie dans :
 *   location.js, project_ui.js, renderers.js, hourly_module.js, inverter_sizing.js
 */

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
}

function initTabs() {
  const btns = [...document.querySelectorAll('.tab-btn')];
  btns.forEach((btn, idx) => {
    btn.setAttribute('tabindex', btn.classList.contains('active') ? '0' : '-1');
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    btn.addEventListener('keydown', (e) => {
      let next = -1;
      if (e.key === 'ArrowRight') next = (idx + 1) % btns.length;
      if (e.key === 'ArrowLeft')  next = (idx - 1 + btns.length) % btns.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End')  next = btns.length - 1;
      if (next >= 0) {
        e.preventDefault();
        btns[next].focus();
        activateTab(btns[next].dataset.tab);
      }
    });
  });
}

// ── Fermeture des modales avec Échap ─────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const startup = document.getElementById('startup-modal');
  if (startup && startup.style.display !== 'none') { closeStartupModal(); return; }
  const enedis = document.getElementById('enedis-modal');
  if (enedis && enedis.style.display !== 'none') { closeEnedisModal(); return; }
  const projects = document.getElementById('projects-modal');
  if (projects && projects.style.display !== 'none') { closeProjectsModal(); return; }
});

// ── État de chargement sur les boutons de calcul ──────────────
function withLoading(btnId, fn) {
  const btn = document.getElementById(btnId);
  if (!btn) { fn(); return; }
  btn.disabled = true;
  btn.classList.add('btn-loading');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { fn(); } finally {
      btn.disabled = false;
      btn.classList.remove('btn-loading');
    }
  }));
}

// ── Synchronisation des paramètres partagés entre onglets ────
/**
 * Les onglets Simulation, Dimensionnement et Hors-réseau partagent
 * des paramètres physiques identiques (surface, panneau, pertes, etc.).
 * Quand l'utilisateur modifie un champ dans un onglet, les champs
 * équivalents des autres onglets sont mis à jour automatiquement.
 */
function bindSharedParamSync() {
  // Groupes de champs partageant la même valeur physique
  const SHARED = [
    ['inp-surface',  'sz-surface',  'og2-surface'],
    ['inp-panel-wp', 'sz-panel-wp', 'og2-panel-wp'],
    ['inp-panel-m2', 'sz-panel-m2', 'og2-panel-m2'],
    ['inp-losses',   'sz-losses',   'og2-losses'],
    ['inp-tilt',     'sz-tilt',     'og2-tilt'],
    ['inp-azimuth',  'sz-azimuth',  'og2-azimuth'],
    ['sel-tech',     'sz-tech'],
  ];

  SHARED.forEach(group => {
    group.forEach(sourceId => {
      const el = document.getElementById(sourceId);
      if (!el) return;
      el.addEventListener('input', () => {
        const val = el.value;
        group.forEach(targetId => {
          if (targetId === sourceId) return;
          const target = document.getElementById(targetId);
          if (target && target.value !== val) target.value = val;
        });
        // Re-calculer l'affichage panneau/kWc si un champ grille change
        if (['inp-surface', 'inp-panel-m2', 'inp-panel-wp'].includes(sourceId)) {
          calcGridPanels();
        }
      });
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
  document.getElementById('btn-calc-hourly')?.addEventListener('click',   () => withLoading('btn-calc-hourly',   () => HourlyModule.compute()));

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
  }, 350);

});

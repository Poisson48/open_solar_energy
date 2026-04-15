/**
 * main.js — Point d'entrée v1.5
 * Orchestre l'initialisation de tous les modules.
 * La logique métier est répartie dans :
 *   location.js, project_ui.js, renderers.js, hourly_module.js, inverter_sizing.js
 */

// ── Gestion des onglets ──────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + tab).classList.add('active');
      AppState.activeTab = tab;
      // Rafraîchir automatiquement certains onglets
      if (tab === 'irradiation') renderIrradiationData();
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
  initQuoteTab();
  calcGridPanels(); // initialise l'affichage panneaux/kWc

  // 4. Brancher les boutons de calcul
  document.getElementById('btn-calc-sizing')?.addEventListener('click', calcSizing);
  document.getElementById('btn-calc-offgrid2')?.addEventListener('click', calcOffgridSizing);
  document.getElementById('btn-calc-grid')?.addEventListener('click', calcGridSystem);
  document.getElementById('btn-calc-irr')?.addEventListener('click', renderIrradiationData);
  document.getElementById('btn-calc-opt')?.addEventListener('click', calcOptimization);
  document.getElementById('btn-calc-hourly')?.addEventListener('click', () => HourlyModule.compute());

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

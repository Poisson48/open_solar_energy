/**
 * main.js - Point d'entrée v1.5
 * Orchestre l'initialisation de tous les modules.
 * La logique métier est répartie dans :
 *   location.js, project_ui.js, renderers.js, hourly_module.js, inverter_sizing.js
 */

// ── Type d'installation : masque les onglets irrelevants ─────
// 'grid'    = raccordé réseau, sans batterie
// 'hybrid'  = raccordé réseau + batterie (autoconso maximisée, surplus injecté)
// 'offgrid' = autonome, hors réseau
// Parcours B (réseau/hybride) : Lieu → Dim → Site → PV → Implantation → Câbles → Analyse → Devis
const TABS_GRID_ONLY    = ['sizing', 'grid', 'tracker', 'optimizer'];
const TABS_OFFGRID_ONLY = ['offgrid'];
const GRID_LIKE_TYPES   = ['grid', 'hybrid'];
/** Ordre du parcours principal (Devis toujours en dernier). */
const PRIMARY_FLOW_GRID    = ['location', 'sizing', 'site', 'grid', 'layout', 'cables', 'daily', 'quote'];
const PRIMARY_FLOW_OFFGRID = ['location', 'offgrid', 'site', 'layout', 'cables', 'daily', 'quote'];
// Libellés lisibles installateur (badge + menu déroulant barre projet)
const INSTALL_TYPE_LABELS = { grid: 'Réseau', hybrid: 'Hybride', offgrid: 'Autonome' };

function getPrimaryTabFlow() {
  return (AppState.installationType === 'offgrid') ? PRIMARY_FLOW_OFFGRID : PRIMARY_FLOW_GRID;
}

/** Passe à l’onglet primary suivant visible (skip libre). */
function goNextPrimaryTab() {
  const flow = getPrimaryTabFlow();
  const cur = AppState.activeTab
    || document.querySelector('.tab-btn.active')?.dataset?.tab
    || flow[0];
  let i = flow.indexOf(cur);
  if (i < 0) i = -1;
  for (let k = i + 1; k < flow.length; k++) {
    const id = flow[k];
    const btn = document.querySelector(`.tab-btn[data-tab="${id}"]`);
    if (!btn || btn.style.display === 'none') continue;
    if (typeof activateTab === 'function') activateTab(id);
    if (typeof writeInstallToTab === 'function') writeInstallToTab(id);
    return id;
  }
  return null;
}
window.goNextPrimaryTab = goNextPrimaryTab;

function applyInstallationType(type) {
  AppState.installationType = type;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    const tab  = btn.dataset.tab;
    const hide = (GRID_LIKE_TYPES.includes(type) && TABS_OFFGRID_ONLY.includes(tab))
              || (type === 'offgrid' && TABS_GRID_ONLY.includes(tab));
    if (hide) {
      btn.style.display = 'none';
      return;
    }
    // Les onglets « avancés » restent masqués sauf si l’utilisateur les a ouverts
    if (btn.dataset.tier === 'advanced') {
      if (typeof window.__oseSyncAdvancedTabs === 'function')
        window.__oseSyncAdvancedTabs();
      else
        btn.style.display = 'none';
      return;
    }
    btn.style.display = '';
  });

  // Si l'onglet actif est masqué, aller au premier onglet visible
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn && activeBtn.style.display === 'none') {
    const first = document.querySelector('.tab-btn[data-tab]:not([style*="display: none"])');
    if (first?.dataset?.tab && typeof activateTab === 'function')
      activateTab(first.dataset.tab);
    else if (first)
      first.click();
  }

  // Répercuter AppState.install sur l’onglet visible (activateTab seul ne le fait pas)
  const syncTab = AppState.activeTab
    || document.querySelector('.tab-btn.active')?.dataset?.tab;
  if (syncTab && typeof writeInstallToTab === 'function') writeInstallToTab(syncTab);
  if (GRID_LIKE_TYPES.includes(type) && syncTab !== 'sizing' && typeof writeInstallToTab === 'function')
    writeInstallToTab('sizing');
  if (type === 'offgrid' && syncTab !== 'offgrid' && typeof writeInstallToTab === 'function')
    writeInstallToTab('offgrid');

  // Afficher/masquer l'étape batterie du parcours dimensionnement (onglet sizing)
  const battStep = document.getElementById('sz-battery-step');
  if (battStep) battStep.style.display = (type === 'hybrid') ? '' : 'none';
  if (typeof updateSizingBatteryHelp === 'function') updateSizingBatteryHelp();
  // Type d’install (ex. hybride ↔ réseau) change le moteur de dimensionnement
  if (typeof refreshSizingValidity === 'function') refreshSizingValidity();

  // Rappel : la batterie hybride profite particulièrement des données Enedis 30 min
  const hybridEnedisNote = document.getElementById('sz-hybrid-enedis-note');
  if (hybridEnedisNote) hybridEnedisNote.style.display = (type === 'hybrid') ? '' : 'none';

  // Rappel dans l'onglet Système PV : la batterie hybride se règle ailleurs (évite de la chercher ici)
  const gridHybridNote = document.getElementById('grid-hybrid-note');
  if (gridHybridNote) gridHybridNote.style.display = (type === 'hybrid') ? '' : 'none';

  // Badge dans la barre projet — ouvre un menu pour choisir le type directement
  // (voir toggleInstallTypeMenu / chooseInstallationType, plus clair qu'un cycle à l'aveugle)
  const badge = document.getElementById('install-type-badge');
  if (badge) {
    if (type === 'hybrid') {
      badge.innerHTML = '<span class="pba-full">⚡🔋 Hybride</span><span class="pba-short">⚡🔋</span>';
      badge.style.color = 'var(--color-primary)';
      badge.style.borderColor = 'var(--color-primary)';
      badge.style.background = 'rgba(30,90,200,0.08)';
    } else if (type === 'grid') {
      badge.innerHTML = '<span class="pba-full">⚡ Réseau</span><span class="pba-short">⚡</span>';
      badge.style.color = 'var(--color-accent)';
      badge.style.borderColor = 'var(--color-accent)';
      badge.style.background = 'rgba(245,166,35,0.08)';
    } else {
      badge.innerHTML = '<span class="pba-full">🔋 Autonome</span><span class="pba-short">🔋</span>';
      badge.style.color = 'var(--color-primary)';
      badge.style.borderColor = 'var(--color-primary)';
      badge.style.background = 'rgba(30,90,200,0.08)';
    }
    badge.title = `Type actuel : ${INSTALL_TYPE_LABELS[type]}. Cliquer pour changer de type d'installation.`;
    badge.setAttribute('aria-label', badge.title);
  }

  // Coche l'option active dans le menu déroulant (voir toggleInstallTypeMenu)
  document.querySelectorAll('#install-type-menu .ose-type-menu-item').forEach(btn => {
    const on = btn.dataset.type === type;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-current', on ? 'true' : 'false');
  });
}

// ── Menu déroulant du type d'installation (barre projet) ────────
// Remplace l'ancien cycle "cliquer pour basculer" par un choix direct et
// explicite des 3 options — plus clair qu'un badge dont le clic était opaque.
function toggleInstallTypeMenu(evt) {
  evt?.stopPropagation();
  const menu = document.getElementById('install-type-menu');
  const badge = document.getElementById('install-type-badge');
  if (!menu || !badge) return;
  if (!menu.hidden) { closeInstallTypeMenu(); return; }

  // Positionnement en `position:fixed` calculé en JS : évite que le menu soit
  // rogné par les conteneurs `overflow-x:auto` de la barre projet (mobile).
  const rect = badge.getBoundingClientRect();
  menu.style.top   = `${Math.round(rect.bottom + 6)}px`;
  menu.style.right = `${Math.round(window.innerWidth - rect.right)}px`;
  menu.hidden = false;
  badge.setAttribute('aria-expanded', 'true');

  const onDocClick = (e) => {
    if (menu.hidden) return;
    if (!menu.contains(e.target) && e.target !== badge) closeInstallTypeMenu();
  };
  const onKeyDown = (e) => { if (e.key === 'Escape') closeInstallTypeMenu(); };
  // Écouteurs one-shot nettoyés dans closeInstallTypeMenu (évite l'accumulation)
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKeyDown);
  window.__oseTypeMenuCleanup = () => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKeyDown);
  };
}

function closeInstallTypeMenu() {
  const menu = document.getElementById('install-type-menu');
  if (menu) menu.hidden = true;
  document.getElementById('install-type-badge')?.setAttribute('aria-expanded', 'false');
  if (typeof window.__oseTypeMenuCleanup === 'function') {
    window.__oseTypeMenuCleanup();
    window.__oseTypeMenuCleanup = null;
  }
}

function chooseInstallationType(type) {
  closeInstallTypeMenu();
  if (type !== AppState.installationType) applyInstallationType(type);
}

// ── Synchronisation des paramètres d'installation partagés ──
// L'onglet « daily » (horaire) n'utilise volontairement que tilt/azimuth :
// ne pas y ajouter panelModel ni les autres champs (cf. point 6).
const INSTALL_FIELDS = {
  sizing:  { tilt:'sz-tilt',    azimuth:'sz-azimuth',    surface:'sz-surface',    panelWp:'sz-panel-wp',    panelM2:'sz-panel-m2',    losses:'sz-losses',    panelModel:'sz-panel-model'  },
  grid:    { tilt:'inp-tilt',   azimuth:'inp-azimuth',   surface:'inp-surface',   panelWp:'inp-panel-wp',   panelM2:'inp-panel-m2',   losses:'inp-losses',   panelModel:'inp-panel-model' },
  offgrid: { tilt:'og2-tilt',   azimuth:'og2-azimuth',   surface:'og2-surface',   panelWp:'og2-panel-wp',   panelM2:'og2-panel-m2',   losses:'og2-losses',   panelModel:'og2-panel-model' },
  daily:   { tilt:'hourly-tilt',azimuth:'hourly-azimuth' },
};

// Champs texte (pas de parseFloat) parmi les clés d'INSTALL_FIELDS.
const INSTALL_STRING_FIELDS = new Set(['panelModel']);

function readInstallFromTab(tab) {
  const map = INSTALL_FIELDS[tab];
  if (!map) return;
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (INSTALL_STRING_FIELDS.has(key)) {
      AppState.install[key] = el.value;
      continue;
    }
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
    if (INSTALL_STRING_FIELDS.has(key)) {
      if (el.value !== AppState.install[key]) el.value = AppState.install[key];
      continue;
    }
    if (parseFloat(el.value) !== AppState.install[key]) el.value = AppState.install[key];
  }
}

// Répercute la valeur d'un champ partagé sur les AUTRES onglets en direct
// (le tab source vient d'être édité par l'utilisateur, on ne le retouche pas).
function propagateInstallField(key, sourceTab) {
  const value = AppState.install[key];
  if (value == null) return;
  const isString = INSTALL_STRING_FIELDS.has(key);
  for (const [tab, map] of Object.entries(INSTALL_FIELDS)) {
    if (tab === sourceTab) continue;
    const id = map[key];
    if (!id) continue;
    const el = document.getElementById(id);
    if (!el) continue;
    if (isString) {
      if (el.value !== value) el.value = value;
    } else if (parseFloat(el.value) !== value) {
      el.value = value;
    }
  }
}

// ── Sync des caractéristiques électriques STC (Voc/Isc/Vmp/Imp/bifacial) ──
// Même principe que panelModel dans INSTALL_FIELDS (sync live entre onglets),
// mais table à part car `bifacial` est une case à cocher (checked, événement
// 'change') alors que les autres champs sont des nombres (value, 'input').
const ELECTRICAL_FIELDS = {
  sizing:  { voc:'sz-panel-voc',  isc:'sz-panel-isc',  vmp:'sz-panel-vmp',  imp:'sz-panel-imp',  bifacial:'sz-panel-bifacial'  },
  grid:    { voc:'inp-panel-voc', isc:'inp-panel-isc', vmp:'inp-panel-vmp', imp:'inp-panel-imp', bifacial:'inp-panel-bifacial' },
  offgrid: { voc:'og2-panel-voc', isc:'og2-panel-isc', vmp:'og2-panel-vmp', imp:'og2-panel-imp', bifacial:'og2-panel-bifacial' },
};

const ELECTRICAL_CHECKBOX_FIELDS = new Set(['bifacial']);

// Répercute la valeur d'un champ électrique sur les AUTRES onglets en direct.
function propagateElectricalField(key, sourceTab) {
  const srcMap = ELECTRICAL_FIELDS[sourceTab];
  if (!srcMap) return;
  const srcEl = document.getElementById(srcMap[key]);
  if (!srcEl) return;
  const isChk = ELECTRICAL_CHECKBOX_FIELDS.has(key);
  const value = isChk ? srcEl.checked : srcEl.value;
  for (const [tab, map] of Object.entries(ELECTRICAL_FIELDS)) {
    if (tab === sourceTab) continue;
    const id = map[key];
    if (!id) continue;
    const el = document.getElementById(id);
    if (!el) continue;
    if (isChk) {
      if (el.checked !== value) el.checked = value;
    } else if (el.value !== value) {
      el.value = value;
    }
  }
}

function bindElectricalSync(tab) {
  const map = ELECTRICAL_FIELDS[tab];
  if (!map) return;
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const evtName = ELECTRICAL_CHECKBOX_FIELDS.has(key) ? 'change' : 'input';
    el.addEventListener(evtName, () => propagateElectricalField(key, tab));
  }
}

// Mémorise la dernière valeur synchronisée par champ devis/site pour ne pas
// écraser une saisie/effacement volontaire de l'utilisateur (cf. point 4).
const _quoteSiteSyncMemo = {};

// Répercute tilt/azimut/surface de l'installation sur l'onglet Devis (site),
// uniquement si l'utilisateur n'a pas modifié le champ depuis la dernière sync.
function syncQuoteSiteFields() {
  const map = { tilt: 'dv-site-tilt', azimuth: 'dv-site-azimuth', surface: 'dv-site-surface' };
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const v = AppState.install[key];
    if (v == null || isNaN(v)) continue;
    const current = el.value !== '' ? parseFloat(el.value) : null;
    const lastSynced = _quoteSiteSyncMemo[id];
    // Le champ a été modifié/vidé manuellement depuis la dernière sync → on respecte ce choix.
    if (lastSynced !== undefined && current !== lastSynced) continue;
    if (current !== v) el.value = v;
    _quoteSiteSyncMemo[id] = v;
  }
}

function bindInstallSync(tab) {
  const map = INSTALL_FIELDS[tab];
  if (!map) return;
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('input', () => {
      if (INSTALL_STRING_FIELDS.has(key)) {
        AppState.install[key] = el.value;
      } else {
        const v = el.value !== '' ? parseFloat(el.value) : null;
        if (v === null || isNaN(v)) return;
        AppState.install[key] = v;
      }
      propagateInstallField(key, tab);
      syncQuoteSiteFields();
    });
  }
}

// ── Gestion des onglets ──────────────────────────────────────
function activateTab(tab) {
  if (!tab) return;
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
    b.setAttribute('tabindex', '-1');
  });
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (btn?.dataset.tier === 'advanced' && typeof window.__oseEnsureAdvancedTabs === 'function')
    window.__oseEnsureAdvancedTabs();
  if (btn) {
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    btn.setAttribute('tabindex', '0');
    try { btn.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' }); } catch (_) {}
  }
  const pane = document.getElementById('tab-' + tab);
  if (pane) pane.classList.add('active');
  AppState.activeTab = tab;
  if (tab === 'irradiation') renderIrradiationData();
  if (tab === 'daily') HourlyModule.autoComputeIfReady();
  if (tab === 'layout' && typeof renderPanelLayoutTab === 'function') renderPanelLayoutTab();
  if (tab === 'site' && typeof SiteSurvey !== 'undefined') {
    SiteSurvey.loadFromAppState();
    SiteSurvey.redraw();
  }
  if (tab === 'sizing' || tab === 'offgrid') {
    if (typeof updateWizardIntroStatus === 'function') updateWizardIntroStatus();
    else if (typeof updateDemoPrefillNote === 'function') updateDemoPrefillNote();
  }
  if (tab === 'cables' && typeof CablesUI !== 'undefined') CablesUI.prefill();
  if (tab === 'location') {
    // Leaflet doit recalculer la taille hors sidebar
    setTimeout(() => {
      if (AppState.map) {
        try { AppState.map.invalidateSize(); } catch (_) {}
      }
    }, 50);
  }
}

function initTabs() {
  const btns = [...document.querySelectorAll('.tab-btn[data-tab]')];
  btns.forEach((btn) => {
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
  // Hub visible dès que possible (même si le reste échoue)
  try {
    if (typeof seedDemoProject === 'function') seedDemoProject();
    if (typeof openStartupModal === 'function') openStartupModal();
  } catch (e) { console.warn('[init] hub', e); }

  try {
  // 1. Injecter le HTML de chaque onglet
  initTabSizing();
  initTabGrid();
  initTabTracker();
  initTabOffgrid();
  initTabIrradiation();
  initTabDaily();
  initTabOptimizer();
  initTabLayout();
  initTabSite();
  initTabQuote();
  initTabCables();

  // 2. Charger les données météo démo, initialiser la carte
  await loadDemoData();
  seedDemoProject();
  initMap();
  initTabs();
  Object.keys(INSTALL_FIELDS).forEach(bindInstallSync);
  Object.keys(ELECTRICAL_FIELDS).forEach(bindElectricalSync);
  writeInstallToTab('sizing');
  applyInstallationType(AppState.installationType);
  initLocationInputs();
  if (typeof SiteSurvey !== 'undefined') SiteSurvey.init();
  if (typeof RexelCatalog !== 'undefined') RexelCatalog.autoImportIfEmpty();

  // 3. Bind les interactions des formulaires
  bindOptimizeCheckboxes();
  bindSizingLiveTotal();
  bindBatteryInfo('og2');
  bindBatteryInfo('sz');
  if (typeof bindSizingResultGuards === 'function') bindSizingResultGuards();
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
  document.getElementById('btn-calc-cables')?.addEventListener('click',   () => withLoading('btn-calc-cables',   CablesUI.calc));

  // 5. Initialiser l'UI projets (raccourcis, etc.) — hub déjà ouvert
  if (typeof initProjectUI === 'function') initProjectUI();

  // 6. Initialiser le module PVGIS Import
  setTimeout(() => {
    if (typeof PVGISImport !== 'undefined') PVGISImport.init();
  }, 100);

  // 7. Calculs initiaux (sans ouvrir de projet — hub projets déjà affiché)
  setTimeout(() => {
    renderIrradiationData();
    HourlyModule.updateSourceStatus();
  }, 350);
  } catch (e) {
    console.error('[init]', e);
    if (typeof openStartupModal === 'function') openStartupModal();
  }
});

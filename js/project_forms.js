/**
 * project_forms.js - Capture/restauration des formulaires et construction des données projet
 * Dépend de : app_state.js, project_manager.js
 */

// ══════════════════════════════════════════════════════════════
//  CAPTURE / RESTAURATION FORMULAIRES
// ══════════════════════════════════════════════════════════════
function captureFormState() {
  if (typeof QuoteLines !== 'undefined') QuoteLines.sync();
  const fields = {};
  PROJECT_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    fields[id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return fields;
}

function restoreFormState(fields) {
  if (!fields) return;
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = val;
  });
  // Recalculs et affichages dépendants
  document.getElementById('sz-tariff')?.dispatchEvent(new Event('change'));
  document.getElementById('sz-strategy')?.dispatchEvent(new Event('change'));
  document.getElementById('sz-incentive-mode')?.dispatchEvent(new Event('change'));
  document.getElementById('sz-kwh-1')?.dispatchEvent(new Event('input'));
  document.getElementById('og2-day-1')?.dispatchEvent(new Event('input'));
  document.getElementById('og2-batt-tech')?.dispatchEvent(new Event('change'));
  document.getElementById('sz-batt-tech')?.dispatchEvent(new Event('change'));
  // Restaurer les modes panneaux
  if (typeof setPanelMode === 'function') {
    setPanelMode('grid', fields['grid-panel-mode'] || 'surface');
    setPanelMode('og2',  fields['og2-panel-mode']  || 'surface');
  }
  // Lignes devis dynamiques (JSON ou migration anciens champs)
  if (typeof QuoteLines !== 'undefined') QuoteLines.afterRestore(fields);
  else if (typeof updateQuoteTotals === 'function') updateQuoteTotals();
}

// ══════════════════════════════════════════════════════════════
//  CONSTRUCTION DES DONNÉES DU PROJET (logique commune)
// ══════════════════════════════════════════════════════════════
function buildProjectData() {
  const nameEl = document.getElementById('project-name-input');
  const name   = (nameEl?.value || '').trim() || 'Projet sans nom';

  const sizingRec  = AppState.lastSizingResult;
  const offgridRec = AppState.lastOffgridSizingResult;
  const summary = {
    annualConso:      AppState.lastSizingInput?.bill?.monthlyKwh?.reduce((s, v) => s + v, 0) || null,
    recommendedPpeak: sizingRec?.Ppeak || offgridRec?.Ppeak || null,
    systemCost:       sizingRec?.systemCost || offgridRec?.systemCost || null,
    coverageRate:     sizingRec?.coverageRate || offgridRec?.coverageRate || null,
    locationName:     AppState.location.name,
  };

  const enedisSerial = AppState.hourlyEnedisData?.halfHourly
    ? { ...AppState.hourlyEnedisData, halfHourly: Array.from(AppState.hourlyEnedisData.halfHourly) }
    : null;

  const existing = AppState.currentProjectId
    ? ProjectManager.get(AppState.currentProjectId)
    : null;

  return {
    id:               AppState.currentProjectId || ProjectManager.newId(),
    name,
    installationType: AppState.installationType || 'grid',
    client:           { ...AppState.currentClient },
    createdAt:        null,
    updatedAt:        null,
    location:         { ...AppState.location },
    weatherData:      AppState.weatherData,
    hourlyEnedisData: enedisSerial,
    monthlyKwhHp:     AppState.monthlyKwhHp ? AppState.monthlyKwhHp.slice() : null,
    enedisYear:       AppState.enedisYear || null,
    formState:        captureFormState(),
    siteSurvey:       AppState.siteSurvey ? JSON.parse(JSON.stringify(AppState.siteSurvey)) : null,
    summary,
    // Préserver les métadonnées démo à la re-sauvegarde
    isDemo:           existing?.isDemo || false,
    demoSeedVersion:  existing?.demoSeedVersion,
    // Préserver le partage multi-appareils (clé Nostr)
    share:            existing?.share || undefined,
  };
}

// ══════════════════════════════════════════════════════════════
//  REMISE À ZÉRO DES FORMULAIRES (nouveau projet vierge)
// ══════════════════════════════════════════════════════════════
function resetForNewProject() {
  // 1. Vider tous les champs persistés
  PROJECT_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = false;
    else if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });

  // 2. Remettre les zones de résultats en état placeholder
  [
    { id: 'sizing-results',   text: 'Renseignez vos données de facture<br>puis cliquez sur <strong>Dimensionner</strong>' },
    { id: 'grid-results',     text: 'Cliquez sur <strong>Calculer</strong> pour lancer la simulation' },
    { id: 'offgrid2-results', text: 'Renseignez votre consommation et cliquez sur <strong>Dimensionner</strong>' },
    { id: 'hourly-results',   text: 'Sélectionnez un mois et cliquez sur <strong>Analyser</strong>' },
  ].forEach(({ id, text }) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div class="result-placeholder"><p>${text}</p></div>`;
  });

  // 3. Vider les résultats en mémoire
  AppState.lastGridResult          = null;
  AppState.lastGridParams          = null;
  AppState.lastSizingResult        = null;
  AppState.lastSizingInput         = null;
  AppState.lastOffgridResult       = null;
  AppState.lastOffgridSizingResult = null;
  AppState.lastOffgridSizingRecommended = null;
  AppState.lastOffgridSizingEconomic    = null;
  AppState.hourlyEnedisData        = null;
  AppState.monthlyKwhHp            = null;
  AppState.enedisYear              = null;
  AppState._includeIncentive       = true;
  AppState.siteSurvey              = null;
  if (typeof SiteSurvey !== 'undefined') {
    SiteSurvey.clearPoints();
    SiteSurvey.getState().terrain = null;
    SiteSurvey.persist();
  }
  if (typeof setMapEditEnabled === 'function') setMapEditEnabled(true);

  // 4. Remettre à zéro les labels et statuts secondaires
  const szTotal = document.getElementById('sz-annual-total');
  if (szTotal) szTotal.textContent = '';
  const ogTotal = document.getElementById('og2-annual-total');
  if (ogTotal) ogTotal.textContent = '';
  const csvStatus = document.getElementById('sz-csv-status');
  if (csvStatus) { csvStatus.textContent = ''; csvStatus.style.display = 'none'; }
  const hourlyStatus = document.getElementById('hourly-data-status');
  if (hourlyStatus) hourlyStatus.textContent = '';

  // 5. Rafraîchir les affichages calculés depuis les champs
  if (typeof calcGridPanels === 'function') calcGridPanels();
  document.getElementById('og2-batt-tech')?.dispatchEvent(new Event('change'));
  // 6. Remettre les lignes de devis par défaut
  if (typeof QuoteLines !== 'undefined') QuoteLines.boot(true);
}

// ══════════════════════════════════════════════════════════════
//  PRÉ-REMPLISSAGE DEVIS CLIENT
// ══════════════════════════════════════════════════════════════
function prefillClientInQuote() {
  const c = AppState.currentClient || {};
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('dv-cli-name',    c.nom);
  setVal('dv-cli-address', c.adresse);
  setVal('dv-cli-phone',   c.tel);
  setVal('dv-cli-email',   c.email);
  // Adresse chantier : ne préremplir que si le champ est encore vide, pour ne
  // jamais écraser une adresse chantier différente déjà saisie/restaurée
  // (ex. rechargement d'un projet où chantier ≠ adresse client).
  // Pour resynchroniser après une modification de l'adresse client existante,
  // voir syncSiteAddressWithClient().
  const siteEl = document.getElementById('dv-site-address');
  if (siteEl && !siteEl.value.trim()) {
    siteEl.value = c.adresse || AppState.location?.name || '';
  }
}

/**
 * Aligne dv-site-address sur la nouvelle adresse client quand l'adresse chantier
 * n'a pas été personnalisée : elle est vide, ou identique à l'ancienne adresse
 * client (donc probablement encore un simple reflet de celle-ci). Si l'utilisateur
 * a saisi une adresse chantier différente, on ne la touche pas.
 * @param {string} oldAddress adresse client avant modification
 * @param {string} newAddress nouvelle adresse client (après modification)
 */
function syncSiteAddressWithClient(oldAddress, newAddress) {
  const siteEl = document.getElementById('dv-site-address');
  if (!siteEl) return;
  const cur  = (siteEl.value || '').trim();
  const prev = (oldAddress || '').trim();
  if (!cur || cur === prev) {
    siteEl.value = newAddress || AppState.location?.name || '';
  }
}

// Édition directe de l'adresse client dans l'onglet Devis (dv-cli-address) :
// répercuter sur AppState.currentClient et appliquer la même règle de
// synchronisation pour l'adresse chantier (minimal, pas de nouveau bouton).
document.addEventListener('change', (e) => {
  if (!e.target || e.target.id !== 'dv-cli-address') return;
  const oldAddress = AppState.currentClient?.adresse || '';
  const newAddress = e.target.value;
  if (newAddress === oldAddress) return;
  if (!AppState.currentClient) AppState.currentClient = { nom: '', adresse: '', tel: '', email: '' };
  AppState.currentClient.adresse = newAddress;
  syncSiteAddressWithClient(oldAddress, newAddress);
});

/**
 * Aligne le libellé lieu (carte / loc-name) sur l’adresse chantier client.
 * @param {{ force?: boolean }} [opts] force=true remplace même un nom déjà défini
 *        (ex. résidu « Nice, France (démo hybride) » à la création d’un projet).
 */
function syncLocationLabelFromClient(opts) {
  const addr = (AppState.currentClient?.adresse || '').trim();
  if (!addr) return;
  const force = !!(opts && opts.force);
  const cur = (AppState.location?.name || '').trim();
  const isDemoLabel = /\(démo\b|\(demo\b/i.test(cur)
    || /approx\.\)\s*$/i.test(cur)
    || !cur;
  if (!force && !isDemoLabel && cur && cur !== addr) return;
  if (!AppState.location) AppState.location = { lat: 46.6, lon: 2.4, alt: 0, name: '' };
  AppState.location.name = addr;
  if (typeof updateLocationUI === 'function') updateLocationUI();
  // Champ adresse carte : afficher l’adresse chantier (pas seulement le cleanName géocodé)
  const inp = document.getElementById('inp-address');
  if (inp) inp.value = addr;
}

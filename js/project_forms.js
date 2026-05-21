/**
 * project_forms.js - Capture/restauration des formulaires et construction des données projet
 * Dépend de : app_state.js, project_manager.js
 */

// ══════════════════════════════════════════════════════════════
//  CAPTURE / RESTAURATION FORMULAIRES
// ══════════════════════════════════════════════════════════════
function captureFormState() {
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
  document.getElementById('sz-kwh-1')?.dispatchEvent(new Event('input'));
  document.getElementById('og2-day-1')?.dispatchEvent(new Event('input'));
  document.getElementById('og2-batt-tech')?.dispatchEvent(new Event('change'));
  // Restaurer les modes panneaux
  if (typeof setPanelMode === 'function') {
    setPanelMode('grid', fields['grid-panel-mode'] || 'surface');
    setPanelMode('og2',  fields['og2-panel-mode']  || 'surface');
  }
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
    summary,
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
  AppState.hourlyEnedisData        = null;
  AppState.monthlyKwhHp            = null;
  AppState.enedisYear              = null;
  AppState._includeIncentive       = true;

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
}

// ══════════════════════════════════════════════════════════════
//  PRÉ-REMPLISSAGE DEVIS CLIENT
// ══════════════════════════════════════════════════════════════
function prefillClientInQuote() {
  const c = AppState.currentClient;
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('dv-cli-name',    c.nom);
  setVal('dv-cli-address', c.adresse);
  setVal('dv-cli-phone',   c.tel);
  setVal('dv-cli-email',   c.email);
  setVal('dv-site-address', AppState.location?.name || '');
}

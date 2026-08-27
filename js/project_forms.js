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
/** Empreinte des facteurs externes (hors formulaire) qui influencent le dimensionnement. */
function sizingContextFingerprint() {
  const w = AppState.weatherData;
  const ghi = Array.isArray(w)
    ? w.map(m => Math.round(Number(m?.GHI) || 0)).join(',')
    : '';
  const hp = Array.isArray(AppState.monthlyKwhHp)
    ? AppState.monthlyKwhHp.map(v => Math.round(Number(v) || 0)).join(',')
    : '';
  const slots = AppState.hourlyEnedisData?.halfHourly?.length || 0;
  const hw = AppState.hourlyWeatherData;
  const hwSig = hw?.ghi?.length
    ? `${hw.year || ''}:${hw.ghi.length}:${Math.round(Array.from(hw.ghi).reduce((s, v) => s + (v || 0), 0) / 1000)}`
    : '';
  const shade = Array.isArray(AppState.siteSurvey?.monthlyLoss)
    ? AppState.siteSurvey.monthlyLoss.map(v => Math.round((Number(v) || 0) * 1000) / 1000).join(',')
    : '';
  return JSON.stringify({
    lat: Math.round((AppState.location?.lat || 0) * 1e5) / 1e5,
    lon: Math.round((AppState.location?.lon || 0) * 1e5) / 1e5,
    ghi,
    install: AppState.installationType || 'grid',
    hourlySlots: slots >= 48 * 365 ? slots : 0,
    year: AppState.enedisYear || AppState.hourlyEnedisData?.year || null,
    hp,
    hourlyWx: hwSig,
    siteShade: shade,
  });
}

function _stableJson(obj) {
  try { return JSON.stringify(obj); } catch (_) { return ''; }
}

function slimSizingCandidates(list) {
  if (!Array.isArray(list)) return null;
  return list.map(c => ({
    Ppeak: c.Ppeak,
    ROI: c.ROI,
    coverageRate: c.coverageRate,
    autoconsoRate: c.autoconsoRate,
    systemCost: c.systemCost,
    nPanels: c.nPanels,
    paybackYears: c.paybackYears,
  }));
}

function slimOffgridCandidates(list) {
  if (!Array.isArray(list)) return null;
  return list.map(c => ({
    Ppeak: c.Ppeak,
    C_batt_gross: c.C_batt_gross,
    coverageRate: c.coverageRate,
    deficit_days: c.deficit_days,
    nPanels: c.nPanels,
    systemCost: c.systemCost,
  }));
}

/** Snapshot des résultats de dimensionnement à persister avec le projet. */
function captureCalcResults() {
  const out = {};
  if (AppState.lastSizingResult && AppState.lastSizingInput) {
    out.sizing = {
      result:     AppState.lastSizingResult,
      candidates: slimSizingCandidates(AppState.lastSizingCandidates),
      input:      AppState.lastSizingInput,
      context:    AppState.lastSizingContext || sizingContextFingerprint(),
    };
  }
  if (AppState.lastOffgridSizingResult && AppState.lastOffgridSizingInput) {
    const techKey = document.getElementById('og2-batt-tech')?.value
      || AppState.lastOffgridSizingTech?.key
      || 'lfp';
    out.offgrid = {
      result:      AppState.lastOffgridSizingResult,
      recommended: AppState.lastOffgridSizingRecommended,
      economic:    AppState.lastOffgridSizingEconomic,
      candidates:  slimOffgridCandidates(AppState.lastOffgridSizingCandidates),
      input:       AppState.lastOffgridSizingInput,
      context:     AppState.lastOffgridSizingContext || sizingContextFingerprint(),
      annual:      AppState.lastOffgridSizingAnnual,
      techKey,
      hourly:      !!AppState.lastOffgridSizingHourly,
    };
  }
  return Object.keys(out).length ? out : null;
}

function clearGridSizingResults(reason) {
  AppState.lastSizingResult     = null;
  AppState.lastSizingCandidates = null;
  AppState.lastSizingInput      = null;
  AppState.lastSizingContext    = null;
  const el = document.getElementById('sizing-results');
  if (!el) return;
  const msg = reason === 'stale'
    ? 'Paramètres modifiés — relancez <strong>Dimensionner</strong> pour mettre à jour.'
    : 'Renseignez vos données de facture<br>puis cliquez sur <strong>Dimensionner</strong>';
  el.innerHTML = `<div class="result-placeholder"><p>${msg}</p></div>`;
}

function clearOffgridSizingResults(reason) {
  AppState.lastOffgridSizingResult      = null;
  AppState.lastOffgridSizingRecommended = null;
  AppState.lastOffgridSizingEconomic    = null;
  AppState.lastOffgridSizingCandidates  = null;
  AppState.lastOffgridSizingInput       = null;
  AppState.lastOffgridSizingContext     = null;
  AppState.lastOffgridSizingAnnual      = null;
  AppState.lastOffgridSizingTech        = null;
  AppState.lastOffgridSizingHourly      = null;
  const el = document.getElementById('offgrid2-results');
  if (!el) return;
  const msg = reason === 'stale'
    ? 'Paramètres modifiés — relancez <strong>Dimensionner</strong> pour mettre à jour.'
    : 'Renseignez votre consommation et cliquez sur <strong>Dimensionner</strong>';
  el.innerHTML = `<div class="result-placeholder"><p>${msg}</p></div>`;
}

/**
 * Invalide le dimensionnement affiché si un paramètre influent a changé.
 * Ne fait rien pendant la restauration d’un projet.
 */
function refreshSizingValidity() {
  if (AppState._restoringProject) return;
  const ctxNow = sizingContextFingerprint();

  if (AppState.lastSizingResult && AppState.lastSizingInput
      && typeof SizingEngine !== 'undefined') {
    let same = false;
    try {
      const cur = SizingEngine.readFormInput();
      same = _stableJson(cur) === _stableJson(AppState.lastSizingInput)
        && (AppState.lastSizingContext || '') === ctxNow;
    } catch (_) { same = false; }
    if (!same) clearGridSizingResults('stale');
  }

  if (AppState.lastOffgridSizingResult && AppState.lastOffgridSizingInput
      && typeof OffgridSizing !== 'undefined') {
    let same = false;
    try {
      const cur = OffgridSizing.readFormInput();
      same = _stableJson(cur) === _stableJson(AppState.lastOffgridSizingInput)
        && (AppState.lastOffgridSizingContext || '') === ctxNow;
    } catch (_) { same = false; }
    if (!same) clearOffgridSizingResults('stale');
  }
}

/** Restaure l’UI des résultats si les entrées actuelles correspondent au snapshot. */
function restoreCalcResultsFromProject(project) {
  const cr = project?.calcResults;
  if (!cr) return;
  const ctxNow = sizingContextFingerprint();

  if (cr.sizing?.result && cr.sizing?.input && typeof renderSizingResults === 'function') {
    AppState.lastSizingResult     = cr.sizing.result;
    AppState.lastSizingCandidates = cr.sizing.candidates || null;
    AppState.lastSizingInput      = cr.sizing.input;
    AppState.lastSizingContext    = cr.sizing.context || null;
    let ok = false;
    try {
      const cur = typeof SizingEngine !== 'undefined' ? SizingEngine.readFormInput() : null;
      ok = !!cur
        && _stableJson(cur) === _stableJson(cr.sizing.input)
        && (cr.sizing.context || '') === ctxNow;
    } catch (_) { ok = false; }
    if (ok) {
      const annual = (cr.sizing.input.bill?.monthlyKwh || []).reduce((s, k) => s + (k || 0), 0);
      renderSizingResults(cr.sizing.result, cr.sizing.candidates || [], 0, annual);
    } else {
      clearGridSizingResults('stale');
    }
  }

  if (cr.offgrid?.result && cr.offgrid?.input && typeof renderOffgridSizingResults === 'function') {
    AppState.lastOffgridSizingResult      = cr.offgrid.result;
    AppState.lastOffgridSizingRecommended = cr.offgrid.recommended || cr.offgrid.result;
    AppState.lastOffgridSizingEconomic    = cr.offgrid.economic || null;
    AppState.lastOffgridSizingCandidates  = cr.offgrid.candidates || null;
    AppState.lastOffgridSizingInput       = cr.offgrid.input;
    AppState.lastOffgridSizingContext     = cr.offgrid.context || null;
    AppState.lastOffgridSizingAnnual      = cr.offgrid.annual;
    AppState.lastOffgridSizingHourly      = !!cr.offgrid.hourly;
    const techKey = cr.offgrid.techKey || 'lfp';
    AppState.lastOffgridSizingTech = (typeof OffgridSizing !== 'undefined'
      && OffgridSizing.BATTERY_TECH?.[techKey])
      || OffgridSizing?.BATTERY_TECH?.lfp
      || { label: 'Batterie', dod: 0.8, key: techKey };
    let ok = false;
    try {
      const cur = typeof OffgridSizing !== 'undefined' ? OffgridSizing.readFormInput() : null;
      ok = !!cur
        && _stableJson(cur) === _stableJson(cr.offgrid.input)
        && (cr.offgrid.context || '') === ctxNow;
    } catch (_) { ok = false; }
    if (ok) {
      renderOffgridSizingResults(
        cr.offgrid.result,
        cr.offgrid.candidates || [],
        AppState.lastOffgridSizingTech,
        cr.offgrid.annual || 0,
        !!cr.offgrid.hourly
      );
    } else {
      clearOffgridSizingResults('stale');
    }
  }
}

/** Écoute les champs du parcours dimensionnement (réseau + autonome). */
function bindSizingResultGuards() {
  if (bindSizingResultGuards._done) return;
  bindSizingResultGuards._done = true;
  let t = null;
  const schedule = () => {
    if (AppState._restoringProject) return;
    clearTimeout(t);
    t = setTimeout(() => refreshSizingValidity(), 200);
  };
  document.addEventListener('change', (e) => {
    const id = e.target?.id || '';
    if (/^(sz-|og2-)/.test(id)) schedule();
  });
  document.addEventListener('input', (e) => {
    const id = e.target?.id || '';
    if (/^(sz-|og2-)/.test(id)) schedule();
  });
}

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

  const hourlyWx = AppState.hourlyWeatherData?.ghi
    ? {
        year: AppState.hourlyWeatherData.year,
        nHours: AppState.hourlyWeatherData.nHours,
        ghi: Array.from(AppState.hourlyWeatherData.ghi),
        dhi: Array.from(AppState.hourlyWeatherData.dhi || []),
        temp: Array.from(AppState.hourlyWeatherData.temp || []),
      }
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
    hourlyWeatherData: hourlyWx,
    hourlyEnedisData: enedisSerial,
    monthlyKwhHp:     AppState.monthlyKwhHp ? AppState.monthlyKwhHp.slice() : null,
    enedisYear:       AppState.enedisYear || null,
    formState:        captureFormState(),
    siteSurvey:       AppState.siteSurvey ? JSON.parse(JSON.stringify(AppState.siteSurvey)) : null,
    calcResults:      captureCalcResults(),
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
  AppState.lastOffgridResult       = null;
  clearGridSizingResults();
  clearOffgridSizingResults();
  AppState.hourlyEnedisData        = null;
  AppState.hourlyWeatherData       = null;
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

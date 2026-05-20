/**
 * project_ui.js - Gestion de projets (UI) + modal démarrage + infos client
 * Dépend de : app_state.js, project_manager.js
 */

// ══════════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════════
let _toastTimer = null;
function showToast(msg, type = 'ok') {
  const el = document.getElementById('ose-toast');
  if (!el) return;
  el.textContent = msg;
  el.style.background = type === 'error' ? 'var(--color-danger)' : 'var(--color-primary)';
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ══════════════════════════════════════════════════════════════
//  BARRE PROJET - affichage client
// ══════════════════════════════════════════════════════════════
function updateProjectBar() {
  const clientEl = document.getElementById('project-bar-client');
  const c = AppState.currentClient;
  if (clientEl) clientEl.textContent = c.nom ? `· ${c.nom}` : '';
}

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
//  SAUVEGARDE GIT AUTOMATIQUE
// ══════════════════════════════════════════════════════════════
/**
 * Sauvegarde le projet courant dans localStorage ET dans un commit git.
 * Ne fait rien si aucun projet actif ou si l'API Electron n'est pas disponible
 * (ex. : navigateur web sans Electron, ou git absent sur la machine).
 *
 * @param {string} actionMessage - Message de commit descriptif
 */
async function gitAutoSave(actionMessage) {
  const project = buildProjectData();
  // Auto-crée un projet si aucun n'est actif (premier calcul sans sauvegarde manuelle)
  if (!AppState.currentProjectId) {
    AppState.currentProjectId = project.id;
    const nameEl = document.getElementById('project-name-input');
    if (nameEl && !nameEl.value.trim()) nameEl.value = project.name;
    updateProjectBar();
  } else {
    AppState.currentProjectId = project.id;
  }

  // Sauvegarde localStorage (compatibilité existante)
  ProjectManager.save(project);

  // Sauvegarde git (optionnelle : nécessite Electron + git installé)
  if (!window.electronAPI) return;
  try {
    await window.electronAPI.gitSave(
      AppState.currentProjectId,
      JSON.stringify(project, null, 2),
      actionMessage
    );
  } catch (e) {
    console.warn('[gitAutoSave] git non disponible :', e);
  }
}

// ══════════════════════════════════════════════════════════════
//  SAUVEGARDER LE PROJET (Ctrl+S / bouton)
// ══════════════════════════════════════════════════════════════
function saveCurrentProject() {
  const nameEl = document.getElementById('project-name-input');
  const name   = (nameEl?.value || '').trim() || 'Projet sans nom';
  if (nameEl) nameEl.value = name;

  const project = buildProjectData();
  const ok = ProjectManager.save(project);
  AppState.currentProjectId = project.id;

  const btn = document.getElementById('btn-save-project');
  if (btn) {
    btn.textContent = ok ? '✓ Sauvegardé' : '✗ Erreur';
    btn.style.background  = ok ? 'var(--color-success)' : 'var(--color-danger)';
    btn.style.borderColor = btn.style.background;
    btn.style.color = '#fff';
    setTimeout(() => {
      btn.textContent = '💾 Sauvegarder';
      btn.style.background = btn.style.borderColor = btn.style.color = '';
    }, 2500);
  }
  showToast(ok ? `\u2713 Projet "${name}" sauvegardé` : '\u2717 Erreur de sauvegarde (localStorage plein ?)', ok ? 'ok' : 'error');

  // Commit git après le toast (non bloquant)
  gitAutoSave('Sauvegarde manuelle');
}

// ══════════════════════════════════════════════════════════════
//  CHARGER UN PROJET
// ══════════════════════════════════════════════════════════════
function loadProject(id) {
  const project = ProjectManager.get(id);
  if (!project) return;

  AppState.currentProjectId = project.id;
  AppState.location = { ...project.location };
  if (project.weatherData) {
    AppState.weatherData = project.weatherData;
  } else if (AppState.demoData && project.location) {
    // Projet ancien sans météo : utiliser la ville démo la plus proche
    const { lat, lon } = project.location;
    let best = null, minDist = Infinity;
    Object.values(AppState.demoData.locations).forEach(loc => {
      const d = Math.hypot(loc.lat - lat, loc.lon - lon);
      if (d < minDist) { minDist = d; best = loc; }
    });
    if (best) AppState.weatherData = best.monthly;
  }
  AppState.hourlyEnedisData = project.hourlyEnedisData?.halfHourly
    ? { ...project.hourlyEnedisData, halfHourly: new Float32Array(project.hourlyEnedisData.halfHourly) }
    : null;
  AppState.monthlyKwhHp = project.monthlyKwhHp ? project.monthlyKwhHp.slice() : null;
  AppState.enedisYear   = project.enedisYear || null;
  // Restaurer monthlyKwh depuis le formState sauvegardé
  if (project.formState) {
    const kwh = Array.from({length:12}, (_, i) => parseFloat(project.formState[`sz-kwh-${i+1}`]) || 0);
    if (kwh.some(v => v > 0)) AppState.monthlyKwh = kwh;
  }
  if (AppState.hourlyEnedisData && typeof HourlyModule?.setData === 'function') {
    HourlyModule.setData({ values: AppState.hourlyEnedisData.halfHourly, year: AppState.hourlyEnedisData.year });
    // Repeupler les champs og2-day-* si vides (projet ancien ou import fait avant la sauvegarde)
    const anyFilled = Array.from({length:12}, (_, i) => document.getElementById(`og2-day-${i+1}`)?.value)
      .some(v => parseFloat(v) > 0);
    if (!anyFilled) {
      for (let m = 1; m <= 12; m++) {
        const profile = HourlyModule.getHourlyConsumptionProfile(m);
        const whPerDay = Math.round(profile.reduce((s, v) => s + v, 0) * 1000);
        const el = document.getElementById(`og2-day-${m}`);
        if (el) el.value = whPerDay;
      }
      document.getElementById('og2-day-1')?.dispatchEvent(new Event('input'));
    }
  }
  const installType = project.installationType || 'grid';
  AppState.installationType = installType;
  if (typeof applyInstallationType === 'function') applyInstallationType(installType);

  // Infos client
  AppState.currentClient = project.client
    ? { ...project.client }
    : { nom: '', adresse: '', tel: '', email: '' };
  updateProjectBar();

  // UI localisation
  updateLocationUI();
  updateMapMarker();

  // Formulaires
  restoreFormState(project.formState);

  // Restaurer le statut import météo (PVGIS / Open-Meteo)
  if (AppState.weatherData && AppState.location?.name) {
    const source = AppState.location.name.match(/\((PVGIS[^)]*|Open-Meteo)\)/)?.[1];
    if (source) {
      const totalGHI = Math.round(AppState.weatherData.reduce((s, m) => s + (m.GHI || 0), 0));
      const statusEl = document.getElementById('pvgis-import-status');
      if (statusEl) {
        statusEl.style.color   = '#2e7d32';
        statusEl.textContent   = `✓ ${source} - GHI annuel : ${totalGHI} kWh/m²/an`;
        statusEl.style.display = 'block';
      }
    }
  }

  // Restaurer les indicateurs de statut Enedis
  if (AppState.enedisYear || AppState.hourlyEnedisData) {
    const year = AppState.enedisYear || AppState.hourlyEnedisData?.year || '';
    const msg  = `✓ Données Enedis${year ? ' ' + year : ''} chargées`;
    ['sz-csv-status', 'og2-edf-import-status'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = 'block';
      el.style.color   = 'var(--color-success)';
      el.textContent   = msg;
    });
    const hStatus = document.getElementById('hourly-data-status');
    if (hStatus && AppState.hourlyEnedisData)
      hStatus.textContent = '✓ Données 30min disponibles pour l\'analyse horaire';
  }

  // Synchroniser AppState.install avec les valeurs restaurées
  if (typeof readInstallFromTab === 'function') {
    Object.keys(INSTALL_FIELDS).forEach(readInstallFromTab);
  }

  // Nom projet
  const nameEl = document.getElementById('project-name-input');
  if (nameEl) nameEl.value = project.name;

  closeProjectsModal();
  closeStartupModal();
  prefillClientInQuote();
  showToast(`✓ Projet "${project.name}" chargé`);

  // Relancer les calculs après restauration des formulaires
  setTimeout(() => {
    if (typeof calcGridPanels        === 'function') calcGridPanels();
    if (typeof calcSizing            === 'function') calcSizing();
    if (installType === 'offgrid' && typeof calcOffgridSizing === 'function') calcOffgridSizing();
    if (typeof renderIrradiationData === 'function') renderIrradiationData();
  }, 100);
}

// ══════════════════════════════════════════════════════════════
//  EXPORT D'UN PROJET (fichier local)
// ══════════════════════════════════════════════════════════════
async function exportCurrentProject() {
  if (!AppState.currentProjectId) {
    showToast('⚠ Sauvegardez d\'abord le projet', 'error');
    return;
  }
  await ProjectManager.exportOneZip(AppState.currentProjectId);
}

// ══════════════════════════════════════════════════════════════
//  MODAL ÉDITION DU PROJET (nom + infos client)
// ══════════════════════════════════════════════════════════════
function openEditProjectModal() {
  document.getElementById('edit-project-name').value    = document.getElementById('project-name-input')?.value || '';
  document.getElementById('edit-client-nom').value      = AppState.currentClient.nom     || '';
  document.getElementById('edit-client-adresse').value  = AppState.currentClient.adresse || '';
  document.getElementById('edit-client-tel').value      = AppState.currentClient.tel     || '';
  document.getElementById('edit-client-email').value    = AppState.currentClient.email   || '';
  document.getElementById('edit-project-modal').style.display = 'block';
  document.getElementById('edit-project-name').focus();
}

function closeEditProjectModal() {
  document.getElementById('edit-project-modal').style.display = 'none';
}

function saveEditProject(event) {
  event.preventDefault();
  const newName = document.getElementById('edit-project-name').value.trim() || 'Projet sans nom';
  const nameEl  = document.getElementById('project-name-input');
  if (nameEl) nameEl.value = newName;

  AppState.currentClient = {
    nom:     document.getElementById('edit-client-nom').value.trim(),
    adresse: document.getElementById('edit-client-adresse').value.trim(),
    tel:     document.getElementById('edit-client-tel').value.trim(),
    email:   document.getElementById('edit-client-email').value.trim(),
  };
  updateProjectBar();
  prefillClientInQuote();
  closeEditProjectModal();
  showToast('✓ Informations du projet mises à jour');
}

// ══════════════════════════════════════════════════════════════
//  MODAL PROJETS (liste)
// ══════════════════════════════════════════════════════════════
function openProjectsModal() {
  renderProjectsList();
  document.getElementById('projects-modal').style.display = 'block';
}
function closeProjectsModal() {
  document.getElementById('projects-modal').style.display = 'none';
}

function renderProjectsList(containerId = 'projects-list-container') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const projects = ProjectManager.list();

  if (projects.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--color-text-muted)">
      Aucun projet sauvegardé. Créez-en un nouveau pour commencer.
    </div>`;
    return;
  }

  container.innerHTML = projects.map(p => {
    const date = new Date(p.updatedAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
    const isCurrent = p.id === AppState.currentProjectId;
    const clientName = p.client?.nom ? ` · ${p.client.nom}` : '';
    const kwh   = p.summary?.annualConso ? `${p.summary.annualConso.toLocaleString('fr')} kWh/an` : '';
    const ppeak = p.summary?.recommendedPpeak ? `· ${p.summary.recommendedPpeak} kWc` : '';
    const cost  = p.summary?.systemCost ? `· ${p.summary.systemCost.toLocaleString('fr')} €` : '';
    const loc   = p.summary?.locationName || p.location?.name || '';

    const demoTag = p.isDemo
      ? `<span style="background:var(--color-accent);color:#fff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:6px;vertical-align:middle">DÉMO</span>`
      : '';
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--color-border)${isCurrent?';background:var(--color-surface2);margin:0 -22px;padding-left:22px;padding-right:22px':''}" >
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px${isCurrent?';color:var(--color-accent)':''}">${p.name}${demoTag}${clientName}${isCurrent ? ' <span style="font-size:11px;font-weight:400;color:var(--color-text-muted)">(actif)</span>' : ''}</div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">${loc} · ${date} ${kwh} ${ppeak} ${cost}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-outline btn-sm" onclick="loadProject('${p.id}')">Charger</button>
        <button class="btn btn-outline btn-sm" onclick="ProjectManager.exportOne('${p.id}')" title="Exporter en fichier JSON">📤</button>
        <button class="btn btn-outline btn-sm" onclick="cloneProject('${p.id}')">Cloner</button>
        ${p.isDemo ? '' : `<button class="btn btn-sm" style="color:var(--color-danger);border-color:var(--color-danger);background:none" onclick="deleteProject('${p.id}')">✕</button>`}
      </div>
    </div>`;
  }).join('');
}

function cloneProject(id) {
  const src = ProjectManager.get(id);
  const name = prompt('Nom du clone :', (src?.name || '') + ' - variante');
  if (name === null) return;
  const copy = ProjectManager.clone(id, name.trim() || src.name + ' (copie)');
  if (copy) { renderProjectsList(); showToast(`✓ Clone "${copy.name}" créé`); }
}

function deleteProject(id) {
  const p = ProjectManager.get(id);
  if (!p) return;
  if (!confirm(`Supprimer "${p.name}" ?`)) return;
  ProjectManager.remove(id);
  if (AppState.currentProjectId === id) {
    AppState.currentProjectId = null;
    const nameEl = document.getElementById('project-name-input');
    if (nameEl) nameEl.value = '';
  }
  renderProjectsList();
}

async function importProjectsFile(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';

  if (file.name.endsWith('.zip')) {
    try {
      const zip = await JSZip.loadAsync(file);
      const projectFile = zip.file('project.json');
      if (!projectFile) { alert('ZIP invalide : project.json manquant'); return; }
      let jsonText = await projectFile.async('string');

      // Restaurer enedis_30min.csv si présent dans le ZIP
      const enedisFile = zip.file('enedis_30min.csv');
      if (enedisFile) {
        const csvText = await enedisFile.async('string');
        const lines   = csvText.trim().split('\n').slice(1); // skip header
        const arr     = new Float32Array(lines.length);
        lines.forEach((line, i) => { arr[i] = parseFloat(line.split(',')[1]) || 0; });
        const parsed = JSON.parse(jsonText);
        if (parsed.hourlyEnedisData?.halfHourly === '__enedis_30min.csv__') {
          parsed.hourlyEnedisData.halfHourly = Array.from(arr);
        }
        jsonText = JSON.stringify(parsed);
      }

      const result = ProjectManager.importOne(jsonText);
      if (result.error) { alert('Erreur import ZIP : ' + result.error); return; }
      showToast(`✓ Projet "${result.project.name}" importé depuis ZIP`);
      renderProjectsList();
      renderProjectsList('startup-projects-list');
    } catch(e) { alert('Erreur lecture ZIP : ' + e.message); }
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    let result;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        result = ProjectManager.importFromJSON(text);
        if (!result.error) result._msg = `✓ ${result.added} projet(s) importé(s)`;
      } else {
        result = ProjectManager.importOne(text);
        if (!result.error) result._msg = `✓ Projet "${result.project.name}" importé`;
      }
    } catch { result = { error: 'Fichier JSON invalide' }; }
    if (result.error) { alert('Erreur import : ' + result.error); }
    else {
      showToast(result._msg);
      renderProjectsList();
      renderProjectsList('startup-projects-list');
    }
  };
  reader.readAsText(file, 'UTF-8');
}

// ══════════════════════════════════════════════════════════════
//  MODAL DE DÉMARRAGE
// ══════════════════════════════════════════════════════════════
function openStartupModal() {
  showStartupStep1();
  document.getElementById('startup-modal').style.display = 'flex';
}

function closeStartupModal() {
  document.getElementById('startup-modal').style.display = 'none';
}

function showStartupStep1() {
  document.getElementById('startup-step-1').style.display    = 'block';
  document.getElementById('startup-step-type').style.display = 'none';
  document.getElementById('startup-step-new').style.display  = 'none';
  document.getElementById('startup-step-load').style.display = 'none';
}

function showInstallationTypeStep() {
  document.getElementById('startup-step-1').style.display    = 'none';
  document.getElementById('startup-step-type').style.display = 'block';
  document.getElementById('startup-step-new').style.display  = 'none';
  document.getElementById('startup-step-load').style.display = 'none';
}

function selectInstallationType(type) {
  AppState.installationType = type;
  if (typeof applyInstallationType === 'function') applyInstallationType(type);
  showNewProjectForm();
}

function showNewProjectForm() {
  document.getElementById('startup-step-1').style.display    = 'none';
  document.getElementById('startup-step-type').style.display = 'none';
  document.getElementById('startup-step-new').style.display  = 'block';
  document.getElementById('startup-step-load').style.display = 'none';
  document.getElementById('startup-project-name').focus();
}

function showLoadProjectList() {
  document.getElementById('startup-step-1').style.display  = 'none';
  document.getElementById('startup-step-new').style.display  = 'none';
  document.getElementById('startup-step-load').style.display = 'block';
  renderProjectsList('startup-projects-list');
}

function createNewProject(event) {
  event.preventDefault();
  const name = document.getElementById('startup-project-name').value.trim() || 'Nouveau projet';
  const nom     = document.getElementById('startup-client-nom').value.trim();
  const adresse = document.getElementById('startup-client-adresse').value.trim();
  const tel     = document.getElementById('startup-client-tel').value.trim();
  const email   = document.getElementById('startup-client-email').value.trim();

  // Nouveau projet vierge
  AppState.currentProjectId = null;
  AppState.currentClient = { nom, adresse, tel, email };

  const nameEl = document.getElementById('project-name-input');
  if (nameEl) nameEl.value = name;

  updateProjectBar();
  resetForNewProject();
  closeStartupModal();

  // Pré-remplir les infos client dans l'onglet devis
  prefillClientInQuote();

  showToast(`✓ Projet "${name}" créé`);
}

function prefillClientInQuote() {
  const c = AppState.currentClient;
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('dv-cli-name',    c.nom);
  setVal('dv-cli-address', c.adresse);
  setVal('dv-cli-phone',   c.tel);
  setVal('dv-cli-email',   c.email);
  setVal('dv-site-address', AppState.location?.name || '');
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
//  NOUVEAU PROJET VIERGE (depuis la modal projets)
// ══════════════════════════════════════════════════════════════
function newProjectBlank() {
  AppState.currentProjectId = null;
  AppState.currentClient = { nom: '', adresse: '', tel: '', email: '' };
  const nameEl = document.getElementById('project-name-input');
  if (nameEl) nameEl.value = '';
  updateProjectBar();
  resetForNewProject();
  closeProjectsModal();
}

// ══════════════════════════════════════════════════════════════
//  PROJET DÉMO
// ══════════════════════════════════════════════════════════════
const DEMO_PROJECT_ID = 'demo_ose_v1';

/**
 * Insère le projet démo dans localStorage si absent.
 * Utilise les données météo Toulouse depuis AppState.demoData.
 */
function seedDemoProject() {
  if (ProjectManager.get(DEMO_PROJECT_ID)) return; // déjà présent

  const toulouse = AppState.demoData?.locations?.toulouse;
  if (!toulouse) return;

  const formState = {
    // Dimensionnement réseau
    'sz-tariff':           'base',
    'sz-price-base':       '0.2516',
    'sz-subscription':     '147',
    'sz-kwh-1':  '385', 'sz-kwh-2':  '345', 'sz-kwh-3':  '310',
    'sz-kwh-4':  '268', 'sz-kwh-5':  '228', 'sz-kwh-6':  '192',
    'sz-kwh-7':  '182', 'sz-kwh-8':  '188', 'sz-kwh-9':  '222',
    'sz-kwh-10': '278', 'sz-kwh-11': '335', 'sz-kwh-12': '392',
    'sz-tilt':           '32',
    'sz-azimuth':        '0',
    'sz-surface':        '22',
    'sz-panel-wp':       '400',
    'sz-panel-m2':       '1.96',
    'sz-losses':         '14',
    'sz-tech':           'crystSi',
    'sz-strategy':       'autoconso_max',
    'sz-target-coverage':'60',
    'sz-cost-kwp':       '900',
    'sz-cost-total':     '',
    'sz-feedin':         '0.13',
    // Système réseau (simulation directe)
    'inp-surface':   '22',
    'inp-panel-wp':  '400',
    'inp-panel-m2':  '1.96',
    'sel-tech':      'crystSi',
    'inp-losses':    '14',
    'inp-tilt':      '32',
    'inp-azimuth':   '0',
    'inp-cost':      '4400',
    'inp-kwh-price': '0.13',
    'inp-co2':       '0.052',
    // Hors réseau
    'og2-daily-default': '850',
    'og2-batt-tech':     'lfp',
    'og2-tilt':          '32',
    'og2-azimuth':       '0',
    'og2-surface':       '12',
    'og2-panel-wp':      '400',
    'og2-panel-m2':      '1.96',
    'og2-losses':        '14',
    'og2-target-coverage':'90',
    'og2-pv-cost-kwp':   '650',
    'og2-bos-cost':      '500',
    ...Object.fromEntries(Array.from({length:12}, (_,i) => [`og2-day-${i+1}`, '0']))
  };

  const annualConso = Object.entries(formState)
    .filter(([k]) => k.startsWith('sz-kwh-'))
    .reduce((s, [, v]) => s + parseFloat(v), 0);

  const demo = {
    id:        DEMO_PROJECT_ID,
    name:      'Démo - Maison Toulouse',
    isDemo:    true,
    client: {
      nom:     'Famille Dupont',
      adresse: '12 allée des Capucines, 31000 Toulouse',
      tel:     '06 12 34 56 78',
      email:   'dupont@example.fr'
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    location:  { lat: toulouse.lat, lon: toulouse.lon, alt: toulouse.alt, name: toulouse.name },
    weatherData: toulouse.monthly,
    formState,
    summary: {
      annualConso,
      recommendedPpeak: 4.4,
      systemCost:       3960,
      coverageRate:     62,
      locationName:     toulouse.name
    }
  };

  ProjectManager.save(demo);
}

// ══════════════════════════════════════════════════════════════
//  MODAL HISTORIQUE GIT
// ══════════════════════════════════════════════════════════════

async function openGitHistoryModal() {
  const modal = document.getElementById('git-history-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  const listEl    = document.getElementById('git-history-list');
  const branchBar = document.getElementById('git-branch-bar');

  if (!window.electronAPI) {
    if (branchBar) branchBar.style.display = 'none';
    listEl.innerHTML = `<p style="color:var(--color-text-muted);text-align:center;padding:20px">
      L'historique git n'est disponible que dans l'application Electron.<br>
      <span style="font-size:11px">En mode navigateur, seule la sauvegarde localStorage est active.</span>
    </p>`;
    return;
  }

  if (!AppState.currentProjectId) {
    if (branchBar) branchBar.style.display = 'none';
    listEl.innerHTML = `<p style="color:var(--color-text-muted);text-align:center;padding:20px">
      Effectuez une action (calcul, import, Ctrl+S) pour créer le premier point de sauvegarde.
    </p>`;
    return;
  }

  listEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;padding:20px">Chargement…</p>';

  // Charger branches et commits en parallèle
  try {
    const [commits, branches] = await Promise.all([
      window.electronAPI.gitLog(AppState.currentProjectId),
      window.electronAPI.gitBranches(AppState.currentProjectId),
    ]);

    // Afficher la barre des branches si plusieurs ou une branche connue
    if (branchBar && branches && branches.length > 0) {
      branchBar.style.display = 'block';
      const branchListEl = document.getElementById('git-branch-list');
      if (branchListEl) {
        branchListEl.innerHTML = branches.map(b => {
          const style = b.current
            ? 'background:var(--color-accent);color:#fff;border-color:var(--color-accent)'
            : '';
          return `<button class="btn btn-outline btn-sm" style="${style};font-size:11px"
            onclick="gitSwitchBranch('${b.name.replace(/'/g, '')}')"
            ${b.current ? 'disabled' : ''}>
            ${b.current ? '✓ ' : ''}${b.name}
          </button>`;
        }).join('');
      }
    } else if (branchBar) {
      branchBar.style.display = 'block'; // afficher quand même pour le bouton "+ Nouvelle variante"
      const branchListEl = document.getElementById('git-branch-list');
      if (branchListEl) branchListEl.innerHTML = '<span style="font-size:11px;color:var(--color-text-muted)">main</span>';
    }

    if (!commits || commits.length === 0) {
      listEl.innerHTML = `<p style="color:var(--color-text-muted);text-align:center;padding:20px">
        Aucun historique git disponible pour ce projet.<br>
        <span style="font-size:11px">Effectuez une action (calcul, import, Ctrl+S) pour créer le premier point de sauvegarde.</span>
      </p>`;
      return;
    }
    listEl.innerHTML = commits.map((c, i) => {
      const date  = new Date(c.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const isCur = i === 0;
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--color-border)${isCur ? ';background:var(--color-surface2);margin:0 -4px;padding-left:4px;padding-right:4px' : ''}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:${isCur ? '700' : '500'};font-size:13px;color:${isCur ? 'var(--color-accent)' : 'inherit'}">${c.message}${isCur ? ' <span style="font-size:10px;font-weight:400;color:var(--color-text-muted)">(actuel)</span>' : ''}</div>
          <div style="font-size:11px;color:var(--color-text-muted)">${date} · <code style="font-size:10px">${c.hash.slice(0, 7)}</code></div>
        </div>
        ${!isCur ? `<button class="btn btn-outline btn-sm" onclick="restoreGitVersion('${c.hash}')" title="Restaurer cette version">Restaurer</button>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    listEl.innerHTML = `<p style="color:var(--color-danger);text-align:center;padding:20px">Erreur : ${e.message}</p>`;
  }
}

async function gitNewBranch() {
  if (!window.electronAPI || !AppState.currentProjectId) return;
  const name = prompt('Nom de la variante (ex : option-batterie-15kWh, devis-client-v2) :');
  if (!name || !name.trim()) return;
  try {
    const res = await window.electronAPI.gitCreateBranch(AppState.currentProjectId, name.trim());
    if (res.ok) {
      showToast(`✓ Variante "${res.branchName}" créée — vous travaillez maintenant dessus`);
      openGitHistoryModal(); // rafraîchir
    }
  } catch (e) {
    showToast('Erreur : ' + e.message, 'error');
  }
}

async function gitSwitchBranch(branchName) {
  if (!window.electronAPI || !AppState.currentProjectId) return;
  try {
    // Sauvegarder l'état courant avant de switcher
    await window.electronAPI.gitSave(
      AppState.currentProjectId,
      JSON.stringify(buildProjectData(), null, 2),
      'Sauvegarde avant changement de variante'
    );
    await window.electronAPI.gitSwitchBranch(AppState.currentProjectId, branchName);
    // Lire le project.json de la branche cible
    const jsonText = await window.electronAPI.gitRead(AppState.currentProjectId);
    const project  = JSON.parse(jsonText);
    if (project.hourlyEnedisData?.halfHourly) {
      project.hourlyEnedisData.halfHourly = new Float32Array(project.hourlyEnedisData.halfHourly);
    }
    ProjectManager.save(project);
    closeGitHistoryModal();
    loadProject(project.id);
    showToast(`✓ Variante "${branchName}" chargée`);
  } catch (e) {
    showToast('Erreur : ' + e.message, 'error');
  }
}

function closeGitHistoryModal() {
  const modal = document.getElementById('git-history-modal');
  if (modal) modal.style.display = 'none';
}

async function restoreGitVersion(hash) {
  if (!window.electronAPI || !AppState.currentProjectId) return;
  if (!confirm(`Restaurer la version ${hash.slice(0, 7)} ? L'état actuel non sauvegardé sera perdu.`)) return;
  try {
    const jsonText = await window.electronAPI.gitCheckout(AppState.currentProjectId, hash);
    const project  = JSON.parse(jsonText);
    // Recréer Float32Array pour les données Enedis si nécessaire
    if (project.hourlyEnedisData?.halfHourly) {
      project.hourlyEnedisData.halfHourly = new Float32Array(project.hourlyEnedisData.halfHourly);
    }
    ProjectManager.save(project);
    closeGitHistoryModal();
    loadProject(project.id);
    showToast(`\u2713 Version ${hash.slice(0, 7)} restaurée`);
  } catch (e) {
    showToast('Erreur lors de la restauration : ' + e.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════════
//  INIT : afficher le modal au démarrage si besoin
// ══════════════════════════════════════════════════════════════
function initProjectUI() {
  // Fermer modal projets sur fond ou Escape
  document.getElementById('projects-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeProjectsModal();
  });
  document.getElementById('startup-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeStartupModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeProjectsModal();
      closeStartupModal();
    }
  });

  // Ctrl+S → sauvegarder (toast + commit git)
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentProject();
    }
  });

  // Toujours montrer le modal de démarrage
  openStartupModal();
}

/**
 * project_ui.js — Gestion de projets (UI) + modal démarrage + infos client
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
//  BARRE PROJET — affichage client
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
  document.getElementById('sz-kwh-1')?.dispatchEvent(new Event('input'));
  document.getElementById('og2-day-1')?.dispatchEvent(new Event('input'));
  document.getElementById('og2-batt-tech')?.dispatchEvent(new Event('change'));
}

// ══════════════════════════════════════════════════════════════
//  SAUVEGARDER LE PROJET
// ══════════════════════════════════════════════════════════════
function saveCurrentProject() {
  const nameEl = document.getElementById('project-name-input');
  const name = (nameEl?.value || '').trim() || 'Projet sans nom';
  if (nameEl) nameEl.value = name;

  const sizingRec  = AppState.lastSizingResult;
  const offgridRec = AppState.lastOffgridSizingResult;
  const summary = {
    annualConso:      AppState.lastSizingInput?.bill?.monthlyKwh?.reduce((s,v)=>s+v,0) || null,
    recommendedPpeak: sizingRec?.Ppeak || offgridRec?.Ppeak || null,
    systemCost:       sizingRec?.systemCost || offgridRec?.systemCost || null,
    coverageRate:     sizingRec?.coverageRate || offgridRec?.coverageRate || null,
    locationName:     AppState.location.name
  };

  const project = {
    id:          AppState.currentProjectId || ProjectManager.newId(),
    name,
    client:      { ...AppState.currentClient },
    createdAt:   null,
    updatedAt:   null,
    location:    { ...AppState.location },
    weatherData: AppState.weatherData,
    formState:   captureFormState(),
    summary
  };

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
  showToast(ok ? `✓ Projet "${name}" sauvegardé` : '✗ Erreur de sauvegarde (localStorage plein ?)', ok ? 'ok' : 'error');
}

// ══════════════════════════════════════════════════════════════
//  CHARGER UN PROJET
// ══════════════════════════════════════════════════════════════
function loadProject(id) {
  const project = ProjectManager.get(id);
  if (!project) return;

  AppState.currentProjectId = project.id;
  AppState.location = { ...project.location };
  if (project.weatherData) AppState.weatherData = project.weatherData;

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

  // Nom projet
  const nameEl = document.getElementById('project-name-input');
  if (nameEl) nameEl.value = project.name;

  closeProjectsModal();
  closeStartupModal();
  showToast(`✓ Projet "${project.name}" chargé`);
}

// ══════════════════════════════════════════════════════════════
//  EXPORT D'UN PROJET (fichier local)
// ══════════════════════════════════════════════════════════════
function exportCurrentProject() {
  if (!AppState.currentProjectId) {
    showToast('⚠ Sauvegardez d\'abord le projet', 'error');
    return;
  }
  ProjectManager.exportOne(AppState.currentProjectId);
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

    return `
    <div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--color-border)${isCurrent?';background:var(--color-surface2);margin:0 -22px;padding-left:22px;padding-right:22px':''}" >
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px${isCurrent?';color:var(--color-accent)':''}">${p.name}${clientName}${isCurrent ? ' <span style="font-size:11px;font-weight:400;color:var(--color-text-muted)">(actif)</span>' : ''}</div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">${loc} · ${date} ${kwh} ${ppeak} ${cost}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-outline btn-sm" onclick="loadProject('${p.id}')">Charger</button>
        <button class="btn btn-outline btn-sm" onclick="ProjectManager.exportOne('${p.id}')" title="Exporter en fichier JSON">📤</button>
        <button class="btn btn-outline btn-sm" onclick="cloneProject('${p.id}')">Cloner</button>
        <button class="btn btn-sm" style="color:var(--color-danger);border-color:var(--color-danger);background:none" onclick="deleteProject('${p.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

function cloneProject(id) {
  const src = ProjectManager.get(id);
  const name = prompt('Nom du clone :', (src?.name || '') + ' — variante');
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

function importProjectsFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    let result;
    // Détecter si c'est un projet unique (objet) ou une liste (tableau)
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        result = ProjectManager.importFromJSON(text);
        if (!result.error) result._msg = `✓ ${result.added} projet(s) importé(s)`;
      } else {
        result = ProjectManager.importOne(text);
        if (!result.error) result._msg = `✓ Projet "${result.project.name}" importé`;
      }
    } catch {
      result = { error: 'Fichier JSON invalide' };
    }
    if (result.error) {
      alert('Erreur import : ' + result.error);
    } else {
      showToast(result._msg);
      renderProjectsList();
      renderProjectsList('startup-projects-list');
    }
    input.value = '';
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
  document.getElementById('startup-step-1').style.display  = 'block';
  document.getElementById('startup-step-new').style.display  = 'none';
  document.getElementById('startup-step-load').style.display = 'none';
}

function showNewProjectForm() {
  document.getElementById('startup-step-1').style.display  = 'none';
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
  closeStartupModal();

  // Pré-remplir les infos client dans l'onglet devis
  prefillClientInQuote();

  showToast(`✓ Projet "${name}" créé`);
}

function prefillClientInQuote() {
  const c = AppState.currentClient;
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
  setVal('dv-cli-name',    c.nom);
  setVal('dv-cli-address', c.adresse);
  setVal('dv-cli-phone',   c.tel);
  setVal('dv-cli-email',   c.email);
  if (AppState.location?.name) setVal('dv-site-address', AppState.location.name);
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
  closeProjectsModal();
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

  // Ctrl+S → sauvegarder
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentProject();
    }
  });

  // Toujours montrer le modal de démarrage
  openStartupModal();
}

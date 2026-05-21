/**
 * project_ui.js - Sauvegarde/chargement projets, liste, modals
 * Dépend de : app_state.js, project_manager.js, project_forms.js, project_git.js, project_startup.js
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
  showToast(ok ? `✓ Projet "${name}" sauvegardé` : '✗ Erreur de sauvegarde (localStorage plein ?)', ok ? 'ok' : 'error');

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
  if (AppState.hourlyEnedisData && typeof HourlyModule?.setData === 'function') {
    HourlyModule.setData({ values: AppState.hourlyEnedisData.halfHourly, year: AppState.hourlyEnedisData.year });
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

  AppState.currentClient = project.client
    ? { ...project.client }
    : { nom: '', adresse: '', tel: '', email: '' };
  updateProjectBar();

  updateLocationUI();
  updateMapMarker();

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

  if (typeof readInstallFromTab === 'function') {
    Object.keys(INSTALL_FIELDS).forEach(readInstallFromTab);
  }

  const nameEl = document.getElementById('project-name-input');
  if (nameEl) nameEl.value = project.name;

  closeProjectsModal();
  closeStartupModal();
  prefillClientInQuote();
  showToast(`✓ Projet "${project.name}" chargé`);

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

      const enedisFile = zip.file('enedis_30min.csv');
      if (enedisFile) {
        const csvText = await enedisFile.async('string');
        const lines   = csvText.trim().split('\n').slice(1);
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
//  INIT : afficher le modal au démarrage si besoin
// ══════════════════════════════════════════════════════════════
function initProjectUI() {
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

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentProject();
    }
  });

  openStartupModal();
}

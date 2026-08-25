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
  el.innerHTML = typeof emStr === 'function' ? emStr(String(msg)) : String(msg);
  el.style.background = type === 'error' ? 'var(--color-danger)'
    : type === 'warning' ? 'var(--color-warning)'
    : 'var(--color-primary)';
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
    const label = ok ? '✓ Sauvegardé' : '✗ Erreur';
    btn.innerHTML = typeof emStr === 'function' ? emStr(label) : label;
    btn.style.background  = ok ? 'var(--color-success)' : 'var(--color-danger)';
    btn.style.borderColor = btn.style.background;
    btn.style.color = '#fff';
    setTimeout(() => {
      btn.innerHTML = typeof emStr === 'function' ? emStr('💾 Sauvegarder') : '💾 Sauvegarder';
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
    if (typeof HourlyModule?.computeAllMonths === 'function' && AppState.hourlyEnedisData)
      HourlyModule.computeAllMonths();
    // Devis : totaux + import résultats dimensionnement si dispo
    ['panels','inverter','fixations','cabling','labor','admin','misc'].forEach(k => {
      if (typeof updateQuoteLine === 'function') updateQuoteLine(k);
    });
    if (typeof updateQuoteTotals === 'function') updateQuoteTotals();
    if (typeof importSizingToQuote === 'function' && AppState.lastSizingResult)
      importSizingToQuote();
    // Rafraîchir le résumé projet après calculs réels
    if (project.isDemo && typeof saveCurrentProject === 'function') {
      try { saveCurrentProject(); } catch (_) { /* ignore */ }
    }
  }, 100);
}

// ══════════════════════════════════════════════════════════════
//  EXPORT D'UN PROJET (fichier local)
// ══════════════════════════════════════════════════════════════
async function exportCurrentProject() {
  if (!AppState.currentProjectId) {
    showToast('Sauvegardez d\'abord le projet avant d\'exporter.', 'warning');
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
//  HUB PROJETS (unique — accueil + bouton « Projets »)
// ══════════════════════════════════════════════════════════════
function openProjectsModal() {
  openStartupModal();
}
function closeProjectsModal() {
  closeStartupModal();
}

function _escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Filtre projets : nom, client, localisation, date (texte libre). */
function filterProjects(projects, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return projects;
  return projects.filter(p => {
    const dateFr = p.updatedAt
      ? new Date(p.updatedAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' })
      : '';
    const dateIso = (p.updatedAt || '').slice(0, 10);
    const hay = [
      p.name,
      p.client?.nom,
      p.client?.adresse,
      p.client?.email,
      p.summary?.locationName,
      p.location?.name,
      dateFr,
      dateIso,
      p.isDemo ? 'demo démo' : '',
    ].join(' ').toLowerCase();
    return q.split(/\s+/).every(token => hay.includes(token));
  });
}

/** Affiche la liste unique du hub. Legacy : renderProjectsList(containerId, query). */
function renderProjectsList(queryOrId = '', maybeQuery) {
  const query = (arguments.length >= 2) ? String(maybeQuery ?? '') : String(queryOrId ?? '');
  const container = document.getElementById('projects-list');
  if (!container) return;
  const all = ProjectManager.list();
  const sorted = [...all].sort((x, y) => {
    if (x.isDemo && !y.isDemo) return -1;
    if (!x.isDemo && y.isDemo) return 1;
    return new Date(y.updatedAt) - new Date(x.updatedAt);
  });
  const projects = filterProjects(sorted, query);

  if (all.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--color-text-muted)">
      Aucun projet sauvegardé. Créez-en un nouveau pour commencer.
    </div>`;
    return;
  }

  if (projects.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:28px;color:var(--color-text-muted)">
      Aucun projet ne correspond à « ${_escHtml(query)} ».
    </div>`;
    return;
  }

  container.innerHTML = projects.map(p => {
    const date = new Date(p.updatedAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
    const isCurrent = p.id === AppState.currentProjectId;
    const clientName = p.client?.nom ? ` · ${_escHtml(p.client.nom)}` : '';
    const kwh   = p.summary?.annualConso ? `${p.summary.annualConso.toLocaleString('fr')} kWh/an` : '';
    const ppeak = p.summary?.recommendedPpeak ? ` · ${p.summary.recommendedPpeak} kWc` : '';
    const cost  = p.summary?.systemCost ? ` · ${p.summary.systemCost.toLocaleString('fr')} €` : '';
    const loc   = p.summary?.locationName || p.location?.name || '';

    const demoTag = p.isDemo
      ? `<span style="background:var(--color-accent);color:#fff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:6px;vertical-align:middle">DÉMO</span>`
      : '';
    const activeTag = isCurrent
      ? `<span style="font-size:11px;font-weight:400;color:var(--color-text-muted);margin-left:4px">(actif)</span>`
      : '';
    return `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-bottom:1px solid var(--color-border)${isCurrent ? ';background:var(--color-surface2);margin:0 -8px;padding:12px 8px;border-radius:8px' : ''}">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px${isCurrent ? ';color:var(--color-accent)' : ''}">${_escHtml(p.name)}${demoTag}${clientName}${activeTag}</div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:3px">${loc ? _escHtml(loc) + ' · ' : ''}${date}${kwh ? ' · ' + kwh : ''}${ppeak}${cost}</div>
        <div id="project-actions-${p.id}" style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">
          ${_projectActionsHTML(p)}
        </div>
      </div>
    </div>`;
  }).join('');
}

function _projectActionsHTML(p) {
  return `<button class="btn btn-primary btn-sm" onclick="loadProject('${p.id}')">Ouvrir</button>
          <button class="btn btn-outline btn-sm" onclick="startCloneProject('${p.id}')">Cloner</button>
          <button class="btn btn-outline btn-sm" onclick="ProjectManager.exportOne('${p.id}')" title="Exporter en fichier JSON">📤 Export</button>
          ${p.isDemo ? '' : `<button class="btn btn-outline btn-sm" style="color:var(--color-danger);border-color:var(--color-danger)" onclick="confirmDeleteProject('${p.id}')">✕ Supprimer</button>`}`;
}

function confirmDeleteProject(id) {
  const actionsEl = document.getElementById(`project-actions-${id}`);
  if (!actionsEl) return;
  const p = ProjectManager.get(id);
  if (!p) return;
  actionsEl.innerHTML = `
    <span style="font-size:12px;color:var(--color-danger);font-weight:600;align-self:center">Supprimer « ${p.name} » ?</span>
    <button class="btn btn-danger btn-sm" onclick="deleteProject('${id}')">Oui, supprimer</button>
    <button class="btn btn-outline btn-sm" onclick="cancelProjectAction('${id}')">Annuler</button>`;
}

function startCloneProject(id) {
  const actionsEl = document.getElementById(`project-actions-${id}`);
  if (!actionsEl) return;
  const p = ProjectManager.get(id);
  if (!p) return;
  const defaultName = (p.name || '') + ' — variante';
  actionsEl.innerHTML = `
    <input type="text" id="clone-name-${id}" value="${defaultName}" placeholder="Nom du clone…"
           style="flex:1;min-width:140px;padding:4px 8px;font-size:12px;border:1px solid var(--color-accent);border-radius:var(--radius);outline:none"
           onkeydown="if(event.key==='Enter')submitCloneProject('${id}');if(event.key==='Escape')cancelProjectAction('${id}')">
    <button class="btn btn-primary btn-sm" onclick="submitCloneProject('${id}')">Créer</button>
    <button class="btn btn-outline btn-sm" onclick="cancelProjectAction('${id}')">Annuler</button>`;
  document.getElementById(`clone-name-${id}`)?.focus();
}

function submitCloneProject(id) {
  const input = document.getElementById(`clone-name-${id}`);
  const name  = input?.value.trim();
  const src   = ProjectManager.get(id);
  if (!src) return;
  const copy = ProjectManager.clone(id, name || src.name + ' (copie)');
  if (copy) {
    showToast(`✓ Clone "${copy.name}" créé`);
    _refreshProjectLists();
  }
}

function cancelProjectAction(id) {
  const actionsEl = document.getElementById(`project-actions-${id}`);
  if (!actionsEl) return;
  const p = ProjectManager.get(id);
  if (p) actionsEl.innerHTML = _projectActionsHTML(p);
}

function cloneProject(id) {
  startCloneProject(id);
}

function deleteProject(id) {
  const p = ProjectManager.get(id);
  if (!p) return;
  ProjectManager.remove(id);
  if (AppState.currentProjectId === id) {
    AppState.currentProjectId = null;
    const nameEl = document.getElementById('project-name-input');
    if (nameEl) nameEl.value = '';
    updateProjectBar();
  }
  showToast(`✓ Projet "${p.name}" supprimé`);
  _refreshProjectLists();
}

function _refreshProjectLists() {
  renderProjectsList(document.getElementById('projects-search')?.value || '');
}

async function importProjectsFile(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';

  if (file.name.endsWith('.zip')) {
    try {
      const zip = await JSZip.loadAsync(file);
      const projectFile = zip.file('project.json');
      if (!projectFile) { showToast('ZIP invalide : project.json manquant', 'error'); return; }
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
      if (result.error) { showToast('Erreur import ZIP : ' + result.error, 'error'); return; }
      showToast(`✓ Projet "${result.project.name}" importé depuis ZIP`);
      _refreshProjectLists();
    } catch(e) { showToast('Erreur lecture ZIP : ' + e.message, 'error'); }
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
    if (result.error) { showToast('Erreur import : ' + result.error, 'error'); }
    else {
      showToast(result._msg);
      _refreshProjectLists();
    }
  };
  reader.readAsText(file, 'UTF-8');
}

// ══════════════════════════════════════════════════════════════
//  NOUVEAU PROJET VIERGE (depuis la modal projets)
// ══════════════════════════════════════════════════════════════
function newProjectBlank() {
  startNewProjectFlow();
}

// ══════════════════════════════════════════════════════════════
//  MISES À JOUR (GitHub Releases — comme Colo Course)
// ══════════════════════════════════════════════════════════════
function _versionParts(v) {
  const s = String(v || '').replace(/^[vV]/, '');
  return s.split('.').map(p => parseInt(p, 10) || 0);
}
function _isNewerVersion(candidate, current) {
  const a = _versionParts(candidate);
  const b = _versionParts(current);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function checkForUpdates() {
  const btn = document.getElementById('btn-check-updates');
  const label = typeof emStr === 'function' ? emStr('↻ Mises à jour') : '↻ Mises à jour';
  if (btn) { btn.disabled = true; btn.innerHTML = '…'; }
  try {
    // Pont Qt natif (AppImage / APK) si exposé
    const bridge = typeof getNativeBridge === 'function' ? getNativeBridge() : (window.webBridge || null);
    if (bridge?.checkForUpdates) {
      bridge.checkForUpdates();
      showToast('Vérification des mises à jour…');
      return;
    }

    const res = await fetch(
      'https://api.github.com/repos/Poisson48/open_solar_energy/releases?per_page=15',
      { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'OpenSolarEnergy' } }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const releases = await res.json();
    const current = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '0.0.0';
    let best = null;
    for (const r of releases) {
      if (r.draft || r.prerelease) continue;
      const ver = String(r.tag_name || '').replace(/^[vV]/, '');
      if (!ver) continue;
      if (_isNewerVersion(ver, current) && (!best || _isNewerVersion(ver, best.ver)))
        best = { ver, url: r.html_url, name: r.name };
    }
    if (!best) {
      showToast(`✓ Vous avez la dernière version (v${current})`);
      return;
    }
    showToast(`Nouvelle version v${best.ver} disponible`, 'warning');
    const open = (bridge?.openExternal)
      ? ((u) => bridge.openExternal(u))
      : ((u) => window.open(u, '_blank', 'noopener'));
    if (confirm(`Open Solar Energy v${best.ver} est disponible.\nVous avez la v${current}.\n\nOuvrir la page de téléchargement ?`))
      open(best.url);
  } catch (e) {
    showToast('Impossible de vérifier les mises à jour : ' + (e.message || e), 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  INIT : hub projets au démarrage (pas d'ouverture auto)
// ══════════════════════════════════════════════════════════════
function initProjectUI() {
  // Hub unique : pas de fermeture par clic extérieur
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeEditProjectModal();
      closeGitHistoryModal();
      if (typeof closeEnedisModal === 'function') closeEnedisModal();
      const hub = document.getElementById('startup-modal');
      if (hub && hub.classList.contains('ose-hub-open')) {
        const onList = document.getElementById('startup-step-1')?.style.display !== 'none';
        if (!onList) showStartupStep1();
        else if (AppState.currentProjectId) closeStartupModal();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentProject();
    }
  });

  openStartupModal();
}

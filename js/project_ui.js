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
  if (clientEl) clientEl.textContent = c.nom ? `Projet · ${c.nom}` : '';
  if (typeof updateLocationUI === 'function') updateLocationUI();
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
      btn.innerHTML = typeof emStr === 'function' ? emStr('💾 Sauver') : '💾 Sauver';
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

  AppState._restoringProject = true;
  AppState.currentProjectId = project.id;
  // Éviter de garder le dimensionnement du projet précédent (mémoire + UI)
  if (typeof clearGridSizingResults === 'function') clearGridSizingResults();
  else {
    AppState.lastSizingResult = null;
    AppState.lastSizingCandidates = null;
    AppState.lastSizingInput = null;
    AppState.lastSizingContext = null;
  }
  if (typeof clearOffgridSizingResults === 'function') clearOffgridSizingResults();
  else {
    AppState.lastOffgridSizingResult = null;
    AppState.lastOffgridSizingRecommended = null;
    AppState.lastOffgridSizingEconomic = null;
    AppState.lastOffgridSizingCandidates = null;
    AppState.lastOffgridSizingInput = null;
    AppState.lastOffgridSizingContext = null;
    AppState.lastOffgridSizingAnnual = null;
    AppState.lastOffgridSizingTech = null;
    AppState.lastOffgridSizingHourly = null;
  }
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
  AppState.hourlyEnedisData = deserializeEnedisHourly(project.hourlyEnedisData);
  AppState.hourlyWeatherData = deserializeHourlyWeather(project.hourlyWeatherData);
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
  // Si le lieu affiche encore un libellé démo, le remplacer par l’adresse chantier
  if (typeof syncLocationLabelFromClient === 'function')
    syncLocationLabelFromClient();
  updateMapMarker();
  if (typeof setMapEditEnabled === 'function') setMapEditEnabled(false);

  AppState.siteSurvey = project.siteSurvey
    ? JSON.parse(JSON.stringify(project.siteSurvey))
    : null;
  if (typeof SiteSurvey !== 'undefined') SiteSurvey.loadFromAppState();

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
    // Pas de recalcul auto : on restaure le dimensionnement déjà calculé s’il est
    // encore valide (mêmes paramètres influents), sinon placeholder.
    if (typeof calcGridPanels        === 'function') calcGridPanels();
    if (typeof renderIrradiationData === 'function') renderIrradiationData();
    if (typeof HourlyModule?.computeAllMonths === 'function' && AppState.hourlyEnedisData)
      HourlyModule.computeAllMonths();
    ['panels','inverter','fixations','cabling','labor','admin','misc'].forEach(k => {
      if (typeof updateQuoteLine === 'function') updateQuoteLine(k);
    });
    if (typeof updateQuoteTotals === 'function') updateQuoteTotals();
    updateDemoPrefillNote();
    if (typeof restoreCalcResultsFromProject === 'function')
      restoreCalcResultsFromProject(project);
    AppState._restoringProject = false;
  }, 100);
}

function _escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Lieu + météo prêts pour un calcul ? */
function isLocationWeatherReady() {
  const loc = AppState.location;
  const hasCoords = !!(loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lon)));
  const wx = AppState.weatherData;
  const hasWx = Array.isArray(wx) && wx.length >= 12;
  return !!(hasCoords && hasWx);
}

function _updateDemoPrefillNoteContent(ready) {
  const note = document.getElementById('ose-demo-prefill-note');
  if (!note) return;
  const p = AppState.currentProjectId ? ProjectManager.get(AppState.currentProjectId) : null;
  const show = !!(p && p.isDemo);
  note.hidden = !show;
  if (!show) return;

  const surf = document.getElementById('sz-surface')?.value;
  note.classList.toggle('is-ready', ready);
  if (ready) {
    note.textContent = surf
      ? `✓ Démo prête (surface ${surf} m², conso, etc. préremplies). Modifiez si besoin, ou « Nouveau » pour partir de zéro.`
      : `✓ Démo prête — valeurs préremplies. Modifiez-les ou créez « Nouveau » pour un parcours à blanc.`;
  } else {
    note.textContent = surf
      ? `Projet démo : valeurs préremplies (surface ${surf} m², conso, etc.). Vérifiez le lieu, puis calculez — ou créez « Nouveau » pour partir de zéro.`
      : `Projet démo : certaines valeurs sont préremplies. Vérifiez le lieu / météo avant de calculer.`;
  }
}

/**
 * Bandeaux d’intro (dimensionnement / hors-réseau) :
 * warning « vérifiez le lieu » → confirmé dès que lieu + météo sont OK.
 */
function updateWizardIntroStatus() {
  const ready = isLocationWeatherReady();
  const rawName = (AppState.location?.name || '').trim();
  const cleanName = rawName
    .replace(/ \(Open-Meteo\)| \(PVGIS[^)]*\)| \(approx\.\)/gi, '')
    .replace(/\s*\(démo[^)]*\)/gi, '')
    .replace(/\s*\(demo[^)]*\)/gi, '')
    .trim();
  const place = cleanName || (AppState.currentClient?.adresse || '').trim();

  document.querySelectorAll('.ose-wizard-location-note').forEach((el) => {
    el.classList.toggle('is-ready', ready);
    if (ready) {
      el.innerHTML = place
        ? `✓ Lieu et météo confirmés — <strong>${_escHtml(place)}</strong>. Vous pouvez lancer le calcul.`
        : `✓ Lieu et météo confirmés. Vous pouvez lancer le calcul.`;
    } else {
      el.innerHTML =
        `📍 Avant de calculer : vérifiez le lieu et la météo dans l’onglet <strong>📍 Lieu</strong> (ou cliquez le lieu dans la barre projet).`;
    }
  });

  _updateDemoPrefillNoteContent(ready);
}

/** Alias historique (chargement projet / onglet sizing). */
function updateDemoPrefillNote() {
  updateWizardIntroStatus();
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

function shareCurrentProject() {
  if (!AppState.currentProjectId) {
    showToast('Sauvegardez d\'abord le projet avant de le partager.', 'warning');
    return;
  }
  if (typeof openProjectShare === 'function') openProjectShare(AppState.currentProjectId);
  else showToast('Partage indisponible.', 'error');
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

  const oldAddress = AppState.currentClient?.adresse || '';
  AppState.currentClient = {
    nom:     document.getElementById('edit-client-nom').value.trim(),
    adresse: document.getElementById('edit-client-adresse').value.trim(),
    tel:     document.getElementById('edit-client-tel').value.trim(),
    email:   document.getElementById('edit-client-email').value.trim(),
  };
  updateProjectBar();
  if (typeof syncLocationLabelFromClient === 'function')
    syncLocationLabelFromClient({ force: true });
  // Adresse chantier : suivre la nouvelle adresse client seulement si elle était
  // vide ou identique à l'ancienne (sinon l'utilisateur l'a personnalisée).
  if (typeof syncSiteAddressWithClient === 'function')
    syncSiteAddressWithClient(oldAddress, AppState.currentClient.adresse);
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

// ══════════════════════════════════════════════════════════════
//  BIBLIOTHÈQUE MATÉRIEL (📚 Panneaux | Onduleurs — hub + barre projet)
// ══════════════════════════════════════════════════════════════
/** Ouvre la bibliothèque matériel en mode gestionnaire (pas de sélecteur de champ cible). */
function openMaterielModal() {
  try {
    if (typeof PanelDB !== 'undefined' && typeof PanelDB.openManagerModal === 'function') {
      PanelDB.openManagerModal(null, { hub: true });
      // S’assurer que le modal est au-dessus du hub (z-index)
      const m = document.getElementById('panel-db-modal');
      if (m) {
        m.style.zIndex = '11050';
        m.style.display = 'flex';
      }
      return;
    }
  } catch (e) {
    console.error('[materiel]', e);
  }
  if (typeof showToast === 'function')
    showToast('Bibliothèque matériel indisponible', 'error');
}
window.openMaterielModal = openMaterielModal;

/** Bouton retour Android / Escape : referme modales et hub avant de quitter l’app. */
let _lastBackQuitAt = 0;

function _modalVisible(id, displayValues) {
  const el = document.getElementById(id);
  if (!el) return false;
  const d = el.style.display;
  if (!d || d === 'none') return false;
  return !displayValues || displayValues.includes(d);
}

function handleAndroidBack() {
  if (typeof exitMapFullscreenIfNeeded === 'function' && exitMapFullscreenIfNeeded())
    return true;
  const shareModal = document.getElementById('ose-share-modal');
  if (shareModal?.classList.contains('open')) {
    ProjectShare.closeShareModal();
    return true;
  }
  const joinModal = document.getElementById('ose-join-modal');
  if (joinModal?.classList.contains('open')) {
    ProjectShare.closeJoinModal();
    return true;
  }
  if (_modalVisible('panel-db-modal', ['flex'])) {
    if (typeof PanelDB !== 'undefined' && PanelDB.closeManagerModal)
      PanelDB.closeManagerModal();
    return true;
  }
  if (_modalVisible('inverter-db-modal', ['flex'])) {
    if (typeof InverterDB !== 'undefined' && InverterDB.closeManagerModal)
      InverterDB.closeManagerModal();
    return true;
  }
  if (_modalVisible('enedis-modal', ['block', 'flex'])) {
    if (typeof closeEnedisModal === 'function') closeEnedisModal();
    return true;
  }
  if (_modalVisible('git-history-modal', ['flex', 'block'])) {
    closeGitHistoryModal();
    return true;
  }
  if (_modalVisible('edit-project-modal', ['block', 'flex'])) {
    closeEditProjectModal();
    return true;
  }

  const hub = document.getElementById('startup-modal');
  const hubOpen = hub && hub.classList.contains('ose-hub-open') && !hub.hasAttribute('hidden');

  if (hubOpen) {
    const stepNew = document.getElementById('startup-step-new');
    const stepType = document.getElementById('startup-step-type');
    const stepVisible = (el) => el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none';
    if (stepVisible(stepNew)) {
      showInstallationTypeStep();
      return true;
    }
    if (stepVisible(stepType)) {
      showStartupStep1();
      return true;
    }
    if (AppState.currentProjectId) {
      closeStartupModal();
      return true;
    }
  } else if (AppState.currentProjectId) {
    openStartupModal();
    return true;
  }

  const now = Date.now();
  if (now - _lastBackQuitAt < 2500)
    return false;
  _lastBackQuitAt = now;
  showToast('Appuyez encore pour quitter');
  return true;
}

window.handleAndroidBack = handleAndroidBack;

function _escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _fmtReleaseDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
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
  const shareBadge = p.share?.enabled
    ? ' <span title="Partage actif" style="font-size:10px;color:var(--color-accent)">☁</span>'
    : '';
  return `<button class="btn btn-primary btn-sm" onclick="loadProject('${p.id}')">Ouvrir</button>
          <button class="btn btn-outline btn-sm" onclick="startCloneProject('${p.id}')">Cloner</button>
          <button class="btn btn-outline btn-sm" onclick="openProjectShare('${p.id}')" title="Partager via clé / QR (sans serveur)">🔗 Partager${shareBadge}</button>
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

function startImportProjects() {
  const bridge = (typeof getNativeBridge === 'function' ? getNativeBridge() : null)
              || window.webBridge || null;
  if (bridge?.pickImportFile) {
    bridge.pickImportFile();
    return;
  }
  const input = document.getElementById('ose-import-projects-input');
  if (input) input.click();
}

async function _importZipBytes(bytes, label) {
  const zip = await JSZip.loadAsync(bytes);
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
  showToast(`✓ Projet "${result.project.name}" importé${label ? ' depuis ' + label : ''}`);
  _refreshProjectLists();
}

function _importJsonText(text) {
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
}

async function importProjectsFile(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';

  if (file.name.toLowerCase().endsWith('.zip')) {
    try {
      await _importZipBytes(file, 'ZIP');
    } catch (e) { showToast('Erreur lecture ZIP : ' + e.message, 'error'); }
    return;
  }

  const reader = new FileReader();
  reader.onload = e => _importJsonText(e.target.result);
  reader.readAsText(file, 'UTF-8');
}

/** Import déclenché par le shell Android (contenu base64). */
async function importProjectsFromNative(filename, contentBase64) {
  try {
    const name = String(filename || 'import.bin');
    const bin = atob(String(contentBase64 || ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    if (/\.zip$/i.test(name) || (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b)) {
      await _importZipBytes(bytes, 'ZIP');
      return;
    }
    const text = new TextDecoder('utf-8').decode(bytes);
    _importJsonText(text);
  } catch (e) {
    showToast('Erreur import : ' + (e.message || e), 'error');
  }
}
window.importProjectsFromNative = importProjectsFromNative;

// ══════════════════════════════════════════════════════════════
//  NOUVEAU PROJET VIERGE (depuis la modal projets)
// ══════════════════════════════════════════════════════════════
function newProjectBlank() {
  startNewProjectFlow();
}

// ══════════════════════════════════════════════════════════════
//  MISES À JOUR (GitHub Releases — APK in-app via shell Qt)
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
function _apkAssetUrl(release) {
  const assets = release?.assets || [];
  for (const a of assets) {
    const name = String(a.name || '');
    if (/\.apk$/i.test(name) && a.browser_download_url)
      return a.browser_download_url;
  }
  return null;
}

function _notesFromReleaseBody(body) {
  if (!body) return '';
  const lines = String(body).split('\n');
  const kept = [];
  for (const line of lines) {
    if (line.trim() === '---') break;
    let clean = line.replace(/^#+\s*/, '').trim();
    kept.push(clean);
  }
  while (kept.length && !kept[kept.length - 1]) kept.pop();
  return kept.join('\n').trim();
}

function _htmlToPlainNotes(html) {
  if (!html) return '';
  let s = String(html)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  s = s.replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const cut = s.search(/\n---\n|\nInstallation\b/i);
  if (cut > 0) s = s.slice(0, cut).trim();
  return s;
}

function _bundledHubReleases() {
  const list = (typeof OSE_RELEASE_FEED !== 'undefined' && Array.isArray(OSE_RELEASE_FEED))
    ? OSE_RELEASE_FEED : [];
  return list.map((r) => ({
    ver: String(r.ver || '').replace(/^[vV]/, ''),
    name: r.name || ('Open Solar Energy v' + r.ver),
    notes: r.notes || '',
    date: r.date || '',
    url: r.url || (`https://github.com/Poisson48/open_solar_energy/releases/tag/v${r.ver}`),
    apk: r.apk || null,
  })).filter((r) => r.ver);
}

function _loadHubNewsDiskCache() {
  try {
    const raw = localStorage.getItem('ose_hub_news_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.releases) || !parsed.releases.length) return null;
    return parsed;
  } catch { return null; }
}

function _saveHubNewsDiskCache(releases) {
  try {
    localStorage.setItem('ose_hub_news_v1', JSON.stringify({
      at: Date.now(),
      releases: (releases || []).slice(0, 12),
    }));
  } catch (_) {}
}

async function _fetchHubReleasesFromApi() {
  const res = await fetch(
    'https://api.github.com/repos/Poisson48/open_solar_energy/releases?per_page=12',
    { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'OpenSolarEnergy' } }
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const raw = await res.json();
  return (Array.isArray(raw) ? raw : [])
    .filter((r) => r && !r.draft && !r.prerelease)
    .map((r) => ({
      ver: String(r.tag_name || '').replace(/^[vV]/, ''),
      name: r.name || r.tag_name || '',
      notes: _notesFromReleaseBody(r.body),
      date: r.published_at || '',
      url: r.html_url || '',
      apk: _apkAssetUrl(r),
    }))
    .filter((r) => r.ver);
}

async function _fetchHubReleasesFromAtom() {
  const res = await fetch(
    'https://github.com/Poisson48/open_solar_energy/releases.atom',
    { headers: { Accept: 'application/atom+xml', 'User-Agent': 'OpenSolarEnergy' } }
  );
  if (!res.ok) throw new Error('Atom HTTP ' + res.status);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Atom parse error');
  const entries = [...doc.querySelectorAll('entry')];
  return entries.map((el) => {
    const title = el.querySelector('title')?.textContent || '';
    const link = el.querySelector('link')?.getAttribute('href') || '';
    const updated = el.querySelector('updated')?.textContent || '';
    const content = el.querySelector('content')?.textContent || '';
    const verMatch = (link.match(/\/tag\/v?([\d.]+)/i) || title.match(/v?(\d+\.\d+\.\d+)/i) || []);
    const ver = verMatch[1] || '';
    return {
      ver,
      name: title.trim() || ('v' + ver),
      notes: _htmlToPlainNotes(content),
      date: updated,
      url: link,
      apk: null,
    };
  }).filter((r) => r.ver);
}

let _hubNewsCache = null;
let _hubNewsFetching = false;

/**
 * Affiche les nouveautés / MAJ sur le hub projets.
 * Sources (dans l’ordre) : mémoire → API GitHub → flux Atom → localStorage → notes embarquées.
 * Ne montre jamais d’échec bloquant si les sources news sont indisponibles.
 */
async function refreshHubNews(force) {
  const box = document.getElementById('ose-hub-news');
  if (!box) return;

  const current = (typeof window.__oseNativeVersion === 'string' && window.__oseNativeVersion)
    || (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '0.0.0');

  const nativeLatest = window.__oseUpdaterLatest || '';
  const nativeNotes = window.__oseUpdaterNotes || '';
  const nativeState = window.__oseUpdaterState;
  const nativeOpts = { nativeLatest, nativeNotes, nativeState };

  if (!force && _hubNewsCache && (Date.now() - _hubNewsCache.at) < 5 * 60 * 1000) {
    _renderHubNews(box, current, _hubNewsCache.releases, nativeOpts);
    return;
  }

  if (_hubNewsFetching && !force) return;
  _hubNewsFetching = true;
  if (!_hubNewsCache)
    box.innerHTML = '<div class="ose-hub-news-loading">Chargement des nouveautés…</div>';

  let releases = null;
  let source = '';

  try {
    try {
      releases = await _fetchHubReleasesFromApi();
      source = 'api';
    } catch (apiErr) {
      console.warn('[hub-news] API', apiErr);
      try {
        releases = await _fetchHubReleasesFromAtom();
        source = 'atom';
      } catch (atomErr) {
        console.warn('[hub-news] Atom', atomErr);
      }
    }

    if (releases?.length) {
      _hubNewsCache = { at: Date.now(), releases, source };
      _saveHubNewsDiskCache(releases);
      _renderHubNews(box, current, releases, nativeOpts);
      return;
    }

    const disk = _loadHubNewsDiskCache();
    if (disk?.releases?.length) {
      _hubNewsCache = { at: Date.now(), releases: disk.releases, source: 'disk' };
      _renderHubNews(box, current, disk.releases, nativeOpts);
      return;
    }

    releases = _bundledHubReleases();
    _hubNewsCache = { at: Date.now(), releases, source: 'bundled' };
    _renderHubNews(box, current, releases, nativeOpts);
  } catch (e) {
    console.warn('[hub-news]', e);
    const fallback = _loadHubNewsDiskCache()?.releases || _bundledHubReleases();
    _hubNewsCache = { at: Date.now(), releases: fallback, source: 'fallback' };
    _renderHubNews(box, current, fallback, nativeOpts);
  } finally {
    _hubNewsFetching = false;
  }
}

function _renderHubNews(box, current, releases, native = {}) {
  if (!box) return;
  const list = Array.isArray(releases) ? releases : [];
  let newer = list.filter(r => _isNewerVersion(r.ver, current));
  // Prefer native latest if updater already found one
  if (native.nativeLatest && _isNewerVersion(native.nativeLatest, current)) {
    const hit = list.find(r => r.ver === native.nativeLatest);
    if (hit) newer = [hit, ...newer.filter(r => r.ver !== hit.ver)];
    else newer = [{
      ver: native.nativeLatest,
      name: 'v' + native.nativeLatest,
      notes: native.nativeNotes || '',
      date: '',
      url: '',
      apk: null,
    }, ...newer];
  }

  const parts = [];
  const cur = String(current).replace(/^[vV]/, '');
  let featuredVer = '';

  if (newer.length) {
    const top = newer[0];
    featuredVer = top.ver;
    let notes = (top.notes || native.nativeNotes || '').trim()
      || 'Correctifs et améliorations — touchez Mettre à jour pour installer.';
    // Évite de répéter « vX.Y.Z — … » juste sous le titre
    notes = notes.replace(new RegExp('^v?' + top.ver.replace(/\./g, '\\.') + '\\s*[—\\-–:].*\\n?', 'i'), '').trim()
      || notes;
    parts.push(`<div class="ose-hub-news-card update" id="ose-hub-update-featured">
      <div class="ose-hub-news-kicker">Nouvelle version disponible</div>
      <h4>v${_escHtml(top.ver)} — vous avez v${_escHtml(cur)}</h4>
      ${top.date ? `<div class="ose-hub-news-meta">Publiée le ${_escHtml(_fmtReleaseDate(top.date))}</div>` : ''}
      <div class="ose-hub-news-body" id="ose-hub-news-update-body">${_escHtml(notes)}</div>
      <div class="ose-hub-news-actions">
        <button type="button" class="btn btn-accent btn-sm" onclick="installAvailableUpdate()">⬇ Mettre à jour</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('ose-hub-news-update-body')?.classList.toggle('expanded')">Voir plus</button>
        ${top.url ? `<a class="btn btn-outline btn-sm" href="${_escHtml(top.url)}" target="_blank" rel="noopener">Notes GitHub</a>` : ''}
      </div>
    </div>`);
  } else {
    parts.push(`<div class="ose-hub-news-card">
      <div class="ose-hub-news-kicker">À jour</div>
      <div class="ose-hub-news-ok">✓ Vous avez la dernière version (v${_escHtml(cur)})</div>
    </div>`);
  }

  // Historique : pas de doublon avec la carte « Nouvelle version » ci-dessus
  const news = list.filter(r => r.ver !== featuredVer).slice(0, 3);
  if (news.length) {
    parts.push(`<div class="ose-hub-news-section-title">Versions récentes</div>`);
    news.forEach((r, i) => {
      const isNew = _isNewerVersion(r.ver, cur);
      const isCur = r.ver === cur;
      const badge = isNew ? 'à installer' : (isCur ? 'installée' : 'précédente');
      const preview = (r.notes || 'Voir les notes de version sur GitHub.')
        .split('\n').filter(Boolean).slice(0, 6).join('\n');
      const bodyId = `ose-hub-news-body-${i}`;
      parts.push(`<div class="ose-hub-news-card${isNew ? ' update' : ''}">
        <div class="ose-hub-news-kicker">v${_escHtml(r.ver)} · ${_escHtml(badge)}</div>
        <h4>${_escHtml(r.name || ('Open Solar Energy v' + r.ver))}</h4>
        ${r.date ? `<div class="ose-hub-news-meta">${_escHtml(_fmtReleaseDate(r.date))}</div>` : ''}
        <div class="ose-hub-news-body" id="${bodyId}">${_escHtml(preview)}</div>
        <div class="ose-hub-news-actions">
          <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('${bodyId}')?.classList.toggle('expanded')">Voir plus</button>
          ${r.url ? `<a class="btn btn-outline btn-sm" href="${_escHtml(r.url)}" target="_blank" rel="noopener">GitHub</a>` : ''}
          ${isNew ? `<button type="button" class="btn btn-accent btn-sm" onclick="installAvailableUpdate()">⬇ Mettre à jour</button>` : ''}
        </div>
      </div>`);
    });
  }

  box.innerHTML = parts.join('') || '<div class="ose-hub-news-loading">Pas de news pour le moment.</div>';
}

// Callback depuis le shell Qt (WebContainerMobile.notifyWebUpdaterState)
window.__oseOnUpdaterState = function __oseOnUpdaterState(state, msg) {
  try {
    const st = Number(state);
    if (st === 3 || st === 4 || st === 5)
      window.__oseUpdateRequested = true;
    if (st === 0)
      window.__oseUpdateRequested = false;
    _renderHubUpdateProgress(st, msg);
    // Ne pas recharger les news pendant téléchargement / install (évite de faire
    // disparaître la barre de progression).
    if (st !== 1 && st !== 3 && st !== 4) {
      const hub = document.getElementById('startup-modal');
      if (hub && hub.classList.contains('ose-hub-open') && typeof refreshHubNews === 'function')
        refreshHubNews(false);
    }
  } catch (_) {}
};

function _renderHubUpdateProgress(state, msg) {
  let bar = document.getElementById('ose-hub-update-progress');
  const hubBody = document.getElementById('startup-step-1');
  if (!hubBody) return;
  const st = Number(state);
  const requested = !!window.__oseUpdateRequested;
  // Idle : masquer. Available : garder si l’utilisateur a lancé la MAJ.
  const checking = st === 1;
  const available = st === 2 && requested;
  const downloading = st === 3;
  const ready = st === 4;
  const failed = st === 5;
  if (!checking && !available && !downloading && !ready && !failed) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'ose-hub-update-progress';
    bar.className = 'ose-hub-news-card update ose-hub-update-progress';
    const news = document.getElementById('ose-hub-news');
    if (news) hubBody.insertBefore(bar, news);
    else hubBody.prepend(bar);
  }
  const pct = Math.max(0, Math.min(100, Math.round((window.__oseUpdaterProgress || 0) * 100)));
  const bytes = Number(window.__oseUpdaterBytes || 0);
  const mo = bytes > 0 ? (bytes / 1e6).toFixed(1) + ' Mo' : '';
  const title = checking ? (msg || 'Vérification…')
    : available ? (msg || 'Préparation du téléchargement…')
    : downloading ? (msg || 'Téléchargement…')
    : ready ? (msg || 'Installation Android…')
    : (msg || 'Échec de la mise à jour');
  const indeterminate = checking || available || (downloading && pct < 2);
  const widthPct = indeterminate ? 32 : Math.max(pct, ready ? 100 : 4);
  bar.innerHTML = `
    <div class="ose-hub-news-kicker">${failed ? 'Erreur MAJ' : 'Mise à jour en cours'}</div>
    <h4 style="margin:4px 0 8px;font-size:14px">${_escHtml(title)}</h4>
    ${!failed ? `
      <div class="ose-hub-update-track">
        <div class="ose-hub-update-fill${indeterminate ? ' indeterminate' : ''}" style="width:${widthPct}%"></div>
      </div>
      <div class="ose-hub-news-meta" style="margin-top:6px">
        ${downloading && pct > 0 ? pct + ' %' : (indeterminate ? 'En cours…' : '')}${mo ? (pct > 0 ? ' · ' : '') + mo : ''}
        ${ready ? 'Confirmez l’installation sur l’écran Android si demandé.' : ''}
      </div>
    ` : `
      <p class="ose-hub-news-meta" style="margin:0 0 8px;line-height:1.4">${_escHtml(msg || 'Échec')}</p>
      <div class="ose-hub-news-actions">
        <button type="button" class="btn btn-accent btn-sm" onclick="installAvailableUpdate()">Réessayer</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="checkForUpdates()">Vérifier à nouveau</button>
      </div>
    `}`;
  try { bar.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
}

async function installAvailableUpdate() {
  function waitNativeBridge(ms) {
    return new Promise(resolve => {
      const t0 = Date.now();
      (function poll() {
        const b = (typeof getNativeBridge === 'function' ? getNativeBridge() : null)
               || window.webBridge || null;
        if (b && (window.__oseNativeInjected || b.nativeReady || b.startUpdate || b.checkForUpdates))
          return resolve(b);
        if (Date.now() - t0 >= ms)
          return resolve(b || null);
        setTimeout(poll, 80);
      })();
    });
  }

  window.__oseUpdateRequested = true;
  window.__oseUpdaterProgress = window.__oseUpdaterProgress || 0;
  _renderHubUpdateProgress(1, 'Lancement de la mise à jour…');

  try {
    const bridge = await waitNativeBridge(2500);
    if (bridge?.startUpdate) {
      bridge.startUpdate();
      // Watchdog : si le natif ne passe pas en téléchargement, afficher l’erreur (pas d’ouverture navigateur)
      clearTimeout(window.__oseUpdateWatchdog);
      window.__oseUpdateWatchdog = setTimeout(() => {
        const st = Number(window.__oseUpdaterState || 0);
        const prog = Number(window.__oseUpdaterProgress || 0);
        if (!window.__oseUpdateRequested) return;
        if (st === 3 && prog > 0.02) return;
        if (st === 4) return;
        if (st === 5) return;
        const hint = st === 1
          ? 'Vérification trop longue. Réessayez depuis le hub.'
          : 'Le téléchargement ne démarre pas. Réessayez — la MAJ passe uniquement par l’app (AppImage / Android).';
        _renderHubUpdateProgress(5, hint);
      }, 18000);
      return;
    }
    if (bridge?.checkForUpdates) {
      bridge.checkForUpdates();
      showToast('Vérification des mises à jour…');
      return;
    }
    // Navigateur / pas de pont Qt : jamais ouvrir d’APK ou d’onglet externe
    _renderHubUpdateProgress(5,
      'Mise à jour in-app indisponible ici. Utilisez l’AppImage (PC) ou l’APK (Android) — pas de téléchargement navigateur.');
    showToast('MAJ uniquement dans l’app native (AppImage / Android)', 'warning');
  } catch (e) {
    _renderHubUpdateProgress(5, 'Mise à jour impossible : ' + (e.message || e));
    showToast('Mise à jour impossible : ' + (e.message || e), 'error');
  }
}

async function checkForUpdates() {
  const btn = document.getElementById('btn-check-updates');
  const label = typeof emStr === 'function' ? emStr('↻ Mises à jour') : '↻ Mises à jour';
  if (btn) { btn.disabled = true; btn.innerHTML = '…'; }

  function finish() {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  }

  function waitNativeBridge(ms) {
    return new Promise(resolve => {
      const t0 = Date.now();
      (function poll() {
        const b = (typeof getNativeBridge === 'function' ? getNativeBridge() : null)
               || window.webBridge || null;
        if (b?.checkForUpdates && (window.__oseNativeInjected || b.nativeReady))
          return resolve(b);
        if (Date.now() - t0 >= ms)
          return resolve(b?.checkForUpdates ? b : null);
        setTimeout(poll, 80);
      })();
    });
  }

  try {
    const bridge = await waitNativeBridge(2500);
    if (bridge?.checkForUpdates) {
      // Ne pas fermer le hub : la bannière Qt s’affiche au-dessus.
      bridge.checkForUpdates();
      showToast('Vérification des mises à jour…');
      setTimeout(() => { if (typeof refreshHubNews === 'function') refreshHubNews(true); }, 1200);
      return;
    }

    // Sans pont Qt : vérifier via sources news (API → Atom → feed embarqué)
    const current = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '0.0.0';
    let best = null;
    try {
      const list = await _fetchHubReleasesFromApi();
      for (const r of list) {
        if (_isNewerVersion(r.ver, current) && (!best || _isNewerVersion(r.ver, best.ver)))
          best = r;
      }
    } catch (_) {
      try {
        const list = await _fetchHubReleasesFromAtom();
        for (const r of list) {
          if (_isNewerVersion(r.ver, current) && (!best || _isNewerVersion(r.ver, best.ver)))
            best = r;
        }
      } catch (_) {
        for (const r of _bundledHubReleases()) {
          if (_isNewerVersion(r.ver, current) && (!best || _isNewerVersion(r.ver, best.ver)))
            best = r;
        }
      }
    }
    if (typeof refreshHubNews === 'function') await refreshHubNews(true);
    if (!best) {
      showToast(`✓ Vous avez la dernière version (v${current})`);
      return;
    }
    showToast(`Nouvelle version v${best.ver} — installez via l’AppImage ou l’app Android`, 'warning');
  } catch (e) {
    showToast('Impossible de vérifier les mises à jour : ' + (e.message || e), 'error');
  } finally {
    finish();
  }
}

// ══════════════════════════════════════════════════════════════
//  INIT : hub projets au démarrage (pas d'ouverture auto)
// ══════════════════════════════════════════════════════════════
function closeProjectBarMore() {
  const menu = document.getElementById('project-bar-more-menu');
  const btn = document.getElementById('btn-project-bar-more');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleProjectBarMore(event) {
  event?.stopPropagation?.();
  const menu = document.getElementById('project-bar-more-menu');
  const btn = document.getElementById('btn-project-bar-more');
  if (!menu || !btn) return;
  const open = menu.hidden;
  try {
    const typeMenu = document.getElementById('install-type-menu');
    if (typeMenu) typeMenu.hidden = true;
  } catch (_) {}
  menu.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function initProjectUI() {
  // Hub unique : pas de fermeture par clic extérieur
  document.addEventListener('click', (e) => {
    const more = document.querySelector('.project-bar-more');
    if (more && !more.contains(e.target)) closeProjectBarMore();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeProjectBarMore();
      if (handleAndroidBack()) return;
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentProject();
    }
  });

  // Android : sauver dès que l’app passe en arrière-plan / est tuée
  const silentSave = () => {
    if (!AppState.currentProjectId) return;
    try {
      const project = buildProjectData();
      ProjectManager.save(project);
      if (typeof ProjectShare !== 'undefined') ProjectShare.onProjectSaved(project);
    } catch (e) {
      console.warn('silentSave:', e);
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') silentSave();
  });
  window.addEventListener('pagehide', silentSave);

  openStartupModal();
  if (typeof ProjectShare !== 'undefined') {
    try { ProjectShare.resumeAllShared(); } catch (e) { console.warn('share resume', e); }
  }
}

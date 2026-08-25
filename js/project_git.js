/**
 * project_git.js - Historique des versions (snapshots locaux + git Qt desktop)
 *
 * Android / navigateur : snapshots localStorage (pas de git).
 * AppImage desktop : git natif via WebBridge si gitLog/gitSave sont exposés.
 */
(() => {
  const HIST_KEY = 'ose_project_history_v1';
  const MAX_SNAPSHOTS = 40;

  function _bridge() {
    return (typeof getNativeBridge === 'function' ? getNativeBridge() : null)
        || window.webBridge || window.nativeBridge || null;
  }

  function _hasNativeGit() {
    const b = _bridge();
    return !!(b && typeof b.gitLog === 'function' && typeof b.gitSave === 'function');
  }

  function _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _loadAll() {
    try {
      return JSON.parse(localStorage.getItem(HIST_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function _saveAll(all) {
    try {
      localStorage.setItem(HIST_KEY, JSON.stringify(all));
      return true;
    } catch (e) {
      // Quota : garder seulement les 10 plus récents par projet
      console.warn('[history] localStorage plein, compaction…', e);
      Object.keys(all).forEach(pid => {
        if (Array.isArray(all[pid])) all[pid] = all[pid].slice(0, 10);
      });
      try {
        localStorage.setItem(HIST_KEY, JSON.stringify(all));
        return true;
      } catch (e2) {
        console.error('[history] impossible de sauver', e2);
        return false;
      }
    }
  }

  /** Snapshot léger : retire les gros tableaux horaires (référencés ailleurs). */
  function _slimProject(project) {
    const p = JSON.parse(JSON.stringify(project));
    if (p.hourlyEnedisData?.halfHourly) {
      p.hourlyEnedisData = {
        year: p.hourlyEnedisData.year,
        format: p.hourlyEnedisData.format || '30min',
        halfHourly: null,
        _omitted: true,
        _len: Array.isArray(project.hourlyEnedisData.halfHourly)
          ? project.hourlyEnedisData.halfHourly.length
          : (project.hourlyEnedisData.halfHourly?.length || 0),
      };
    }
    return p;
  }

  function localList(projectId) {
    if (!projectId) return [];
    const all = _loadAll();
    return Array.isArray(all[projectId]) ? all[projectId] : [];
  }

  function localPush(projectId, project, message) {
    if (!projectId || !project) return null;
    const all = _loadAll();
    const list = Array.isArray(all[projectId]) ? all[projectId] : [];
    const entry = {
      id: 'snap_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      date: new Date().toISOString(),
      message: String(message || 'Sauvegarde').slice(0, 200),
      project: _slimProject(project),
    };
    // Éviter les doublons immédiats (même message < 2 s)
    if (list[0] && list[0].message === entry.message
        && (Date.now() - new Date(list[0].date).getTime()) < 2000) {
      list[0] = entry;
    } else {
      list.unshift(entry);
    }
    while (list.length > MAX_SNAPSHOTS) list.pop();
    all[projectId] = list;
    _saveAll(all);
    return entry;
  }

  function localGet(projectId, snapId) {
    return localList(projectId).find(s => s.id === snapId) || null;
  }

  function localClear(projectId) {
    const all = _loadAll();
    delete all[projectId];
    _saveAll(all);
  }

  // Exposé pour debug / autres modules
  window.ProjectHistory = { list: localList, push: localPush, get: localGet, clear: localClear, hasNativeGit: _hasNativeGit };

  /**
   * Sauvegarde le projet courant + point d’historique.
   */
  window.gitAutoSave = async function gitAutoSave(actionMessage) {
    if (!AppState.currentProjectId) return;
    const project = buildProjectData();
    AppState.currentProjectId = project.id;

    ProjectManager.save(project);
    localPush(project.id, project, actionMessage);

    if (!_hasNativeGit()) return;
    try {
      await _bridge().gitSave(
        AppState.currentProjectId,
        JSON.stringify(project, null, 2),
        actionMessage
      );
    } catch (e) {
      console.warn('[gitAutoSave] git natif :', e);
    }
  };

  function _renderLocalHistory(listEl, branchBar) {
    if (branchBar) branchBar.style.display = 'none';
    const pid = AppState.currentProjectId;
    const snaps = localList(pid);
    if (!snaps.length) {
      listEl.innerHTML = `<p style="color:var(--color-text-muted);text-align:center;padding:20px">
        Aucun point de sauvegarde pour ce projet.<br>
        <span style="font-size:11px">Effectuez une action (calcul, import, Sauver) pour en créer un.</span>
      </p>`;
      return;
    }
    listEl.innerHTML = snaps.map((s, i) => {
      const date = new Date(s.date).toLocaleString('fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const isCur = i === 0;
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--color-border)${isCur ? ';background:var(--color-surface2);margin:0 -4px;padding-left:4px;padding-right:4px' : ''}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:${isCur ? '700' : '500'};font-size:13px;color:${isCur ? 'var(--color-accent)' : 'inherit'}">${_esc(s.message)}${isCur ? ' <span style="font-size:10px;font-weight:400;color:var(--color-text-muted)">(actuel)</span>' : ''}</div>
          <div style="font-size:11px;color:var(--color-text-muted)">${_esc(date)}</div>
        </div>
        ${!isCur ? `<button type="button" class="btn btn-outline btn-sm" data-restore-snap="${_esc(s.id)}" onclick="restoreLocalVersionConfirm('${s.id}')" title="Restaurer cette version">Restaurer</button>` : ''}
      </div>`;
    }).join('');
  }

  window.openGitHistoryModal = async function openGitHistoryModal() {
    const modal = document.getElementById('git-history-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    const listEl = document.getElementById('git-history-list');
    const branchBar = document.getElementById('git-branch-bar');
    if (!listEl) return;

    if (!AppState.currentProjectId) {
      if (branchBar) branchBar.style.display = 'none';
      listEl.innerHTML = `<p style="color:var(--color-text-muted);text-align:center;padding:20px">
        Ouvrez un projet, puis effectuez une action (calcul, import, Sauver) pour créer le premier point de sauvegarde.
      </p>`;
      return;
    }

    // Si aucun snapshot encore : en créer un à partir de l’état courant
    if (!_hasNativeGit() && localList(AppState.currentProjectId).length === 0) {
      try {
        const cur = typeof buildProjectData === 'function' ? buildProjectData() : ProjectManager.get(AppState.currentProjectId);
        if (cur) localPush(AppState.currentProjectId, cur, 'État actuel');
      } catch (_) {}
    }

    // Préférer git natif (AppImage) s’il est vraiment branché
    if (_hasNativeGit()) {
      listEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;padding:20px">Chargement…</p>';
      try {
        const [commits, branches] = await Promise.all([
          _bridge().gitLog(AppState.currentProjectId),
          typeof _bridge().gitBranches === 'function'
            ? _bridge().gitBranches(AppState.currentProjectId)
            : Promise.resolve([]),
        ]);

        if (branchBar && branches && branches.length > 0) {
          branchBar.style.display = 'block';
          // Restaurer la barre si elle avait été remplacée par le formulaire nouvelle branche
          if (!document.getElementById('git-branch-list')) {
            branchBar.innerHTML = `
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span style="font-size:12px;font-weight:600;color:var(--color-text-muted)">Variante :</span>
                <div id="git-branch-list" style="display:flex;gap:6px;flex-wrap:wrap;flex:1"></div>
                <button class="btn btn-outline btn-sm" onclick="gitNewBranch()" style="white-space:nowrap">+ Nouvelle variante</button>
              </div>`;
          }
          const branchListEl = document.getElementById('git-branch-list');
          if (branchListEl) {
            branchListEl.innerHTML = branches.map(b => {
              const style = b.current
                ? 'background:var(--color-accent);color:#fff;border-color:var(--color-accent)'
                : '';
              return `<button class="btn btn-outline btn-sm" style="${style};font-size:11px"
                onclick="gitSwitchBranch('${String(b.name).replace(/'/g, '')}')"
                ${b.current ? 'disabled' : ''}>
                ${b.current ? '✓ ' : ''}${_esc(b.name)}
              </button>`;
            }).join('');
          }
        } else if (branchBar) {
          branchBar.style.display = 'block';
          if (!document.getElementById('git-branch-list')) {
            branchBar.innerHTML = `
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span style="font-size:12px;font-weight:600;color:var(--color-text-muted)">Variante :</span>
                <div id="git-branch-list" style="display:flex;gap:6px;flex-wrap:wrap;flex:1"></div>
                <button class="btn btn-outline btn-sm" onclick="gitNewBranch()" style="white-space:nowrap">+ Nouvelle variante</button>
              </div>`;
          }
          const branchListEl = document.getElementById('git-branch-list');
          if (branchListEl)
            branchListEl.innerHTML = '<span style="font-size:11px;color:var(--color-text-muted)">main</span>';
        }

        if (!commits || commits.length === 0) {
          // Fallback local si git vide
          _renderLocalHistory(listEl, null);
          return;
        }
        listEl.innerHTML = commits.map((c, i) => {
          const date = new Date(c.date).toLocaleString('fr-FR', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
          });
          const isCur = i === 0;
          const hash = String(c.hash || '');
          return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--color-border)${isCur ? ';background:var(--color-surface2);margin:0 -4px;padding-left:4px;padding-right:4px' : ''}">
            <div style="flex:1;min-width:0">
              <div style="font-weight:${isCur ? '700' : '500'};font-size:13px;color:${isCur ? 'var(--color-accent)' : 'inherit'}">${_esc(c.message)}${isCur ? ' <span style="font-size:10px;font-weight:400;color:var(--color-text-muted)">(actuel)</span>' : ''}</div>
              <div style="font-size:11px;color:var(--color-text-muted)">${_esc(date)} · <code style="font-size:10px">${_esc(hash.slice(0, 7))}</code></div>
            </div>
            ${!isCur ? `<button type="button" class="btn btn-outline btn-sm" data-restore-hash="${_esc(hash)}" onclick="restoreGitVersionConfirm('${hash}')" title="Restaurer cette version">Restaurer</button>` : ''}
          </div>`;
        }).join('');
        return;
      } catch (e) {
        console.warn('[history] git natif échoué, fallback local', e);
      }
    }

    // Android / navigateur / fallback
    _renderLocalHistory(listEl, branchBar);

    // Sur mobile : proposer « Nouvelle variante » = clone local
    if (branchBar) {
      branchBar.style.display = 'block';
      branchBar.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:12px;color:var(--color-text-muted);flex:1;line-height:1.35">
            Historique local (jusqu’à ${MAX_SNAPSHOTS} points). Variante = copie du projet.
          </span>
          <button type="button" class="btn btn-outline btn-sm" onclick="gitLocalVariant()" style="white-space:nowrap">+ Nouvelle variante</button>
        </div>`;
    }
  };

  window.gitLocalVariant = function gitLocalVariant() {
    if (!AppState.currentProjectId) return;
    const name = prompt('Nom de la variante (copie du projet) :', 'Variante');
    if (!name || !name.trim()) return;
    const copy = ProjectManager.clone(AppState.currentProjectId, name.trim());
    if (!copy) {
      showToast('Impossible de créer la variante', 'error');
      return;
    }
    // Snapshot initial pour la copie
    localPush(copy.id, copy, 'Création de la variante');
    closeGitHistoryModal();
    loadProject(copy.id);
    showToast(`✓ Variante « ${copy.name} » créée`);
  };

  window.gitNewBranch = function gitNewBranch() {
    if (!_hasNativeGit() || !AppState.currentProjectId) {
      gitLocalVariant();
      return;
    }
    const bar = document.getElementById('git-branch-bar');
    if (!bar) return;

    bar.innerHTML = `
      <form id="git-new-branch-form" onsubmit="gitNewBranchSubmit(event)"
            style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:12px;font-weight:600;color:var(--color-text-muted);white-space:nowrap">Nom de la variante :</span>
        <input id="git-new-branch-input" type="text"
               placeholder="ex : option-batterie-15kWh"
               style="flex:1;min-width:180px;font-size:12px;padding:4px 8px;border:1px solid var(--color-accent);border-radius:6px;background:var(--color-bg);color:var(--color-text);outline:none"
               autocomplete="off" spellcheck="false">
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button type="submit" class="btn btn-accent btn-sm" id="git-new-branch-btn" style="font-size:11px">Créer</button>
          <button type="button" class="btn btn-outline btn-sm" onclick="openGitHistoryModal()" style="font-size:11px">Annuler</button>
        </div>
      </form>`;
    bar.style.display = 'block';
    document.getElementById('git-new-branch-input')?.focus();
  };

  window.gitNewBranchSubmit = async function gitNewBranchSubmit(event) {
    event.preventDefault();
    if (!_hasNativeGit()) { gitLocalVariant(); return; }
    const input = document.getElementById('git-new-branch-input');
    const btn = document.getElementById('git-new-branch-btn');
    const name = input?.value.trim();
    if (!name) { input?.focus(); return; }

    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    if (input) input.disabled = true;

    try {
      const res = await _bridge().gitCreateBranch(AppState.currentProjectId, name);
      if (res.ok) {
        showToast(`✓ Variante "${res.branchName}" créée — vous travaillez maintenant dessus`);
        openGitHistoryModal();
      } else {
        showToast(`Erreur : ${res.reason || 'impossible de créer la branche'}`, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Créer'; }
        if (input) { input.disabled = false; input.focus(); }
      }
    } catch (e) {
      showToast('Erreur : ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Créer'; }
      if (input) { input.disabled = false; input.focus(); }
    }
  };

  window.gitSwitchBranch = async function gitSwitchBranch(branchName) {
    if (!_hasNativeGit() || !AppState.currentProjectId) return;
    try {
      await _bridge().gitSave(
        AppState.currentProjectId,
        JSON.stringify(buildProjectData(), null, 2),
        'Sauvegarde avant changement de variante'
      );
      await _bridge().gitSwitchBranch(AppState.currentProjectId, branchName);
      const jsonText = await _bridge().gitRead(AppState.currentProjectId);
      const project = JSON.parse(jsonText);
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
  };

  window.closeGitHistoryModal = function closeGitHistoryModal() {
    const modal = document.getElementById('git-history-modal');
    if (modal) modal.style.display = 'none';
  };

  window.restoreLocalVersionConfirm = function restoreLocalVersionConfirm(snapId) {
    const btn = document.querySelector(`[data-restore-snap="${snapId}"]`);
    if (!btn) {
      restoreLocalVersion(snapId);
      return;
    }
    const original = btn.textContent;
    btn.textContent = 'Confirmer ?';
    btn.style.cssText += ';background:var(--color-danger);color:#fff;border-color:var(--color-danger)';
    const timer = setTimeout(() => {
      if (btn.isConnected) {
        btn.textContent = original;
        btn.style.background = btn.style.color = btn.style.borderColor = '';
        btn.onclick = () => restoreLocalVersionConfirm(snapId);
      }
    }, 3000);
    btn.onclick = () => { clearTimeout(timer); restoreLocalVersion(snapId); };
  };

  window.restoreLocalVersion = function restoreLocalVersion(snapId) {
    const pid = AppState.currentProjectId;
    const snap = localGet(pid, snapId);
    if (!snap?.project) {
      showToast('Snapshot introuvable', 'error');
      return;
    }
    const project = JSON.parse(JSON.stringify(snap.project));
    project.id = pid;
    // Réinjecter les données horaires actuelles si le snapshot les avait omises
    if (project.hourlyEnedisData?._omitted) {
      const cur = ProjectManager.get(pid);
      if (cur?.hourlyEnedisData?.halfHourly) {
        project.hourlyEnedisData = JSON.parse(JSON.stringify(cur.hourlyEnedisData));
      } else {
        project.hourlyEnedisData = null;
      }
    }
    ProjectManager.save(project);
    localPush(pid, project, `Restauration : ${snap.message}`);
    closeGitHistoryModal();
    loadProject(pid);
    showToast('✓ Version restaurée');
  };

  window.restoreGitVersionConfirm = function restoreGitVersionConfirm(hash) {
    const btn = document.querySelector(`[data-restore-hash="${hash}"]`);
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = 'Confirmer ?';
    btn.style.cssText += ';background:var(--color-danger);color:#fff;border-color:var(--color-danger)';
    const timer = setTimeout(() => {
      if (btn.isConnected) {
        btn.textContent = original;
        btn.style.background = btn.style.color = btn.style.borderColor = '';
        btn.onclick = () => restoreGitVersionConfirm(hash);
      }
    }, 3000);
    btn.onclick = () => { clearTimeout(timer); restoreGitVersion(hash); };
  };

  window.restoreGitVersion = async function restoreGitVersion(hash) {
    if (!_hasNativeGit() || !AppState.currentProjectId) return;
    try {
      const jsonText = await _bridge().gitCheckout(AppState.currentProjectId, hash);
      const project = JSON.parse(jsonText);
      if (project.hourlyEnedisData?.halfHourly) {
        project.hourlyEnedisData.halfHourly = new Float32Array(project.hourlyEnedisData.halfHourly);
      }
      ProjectManager.save(project);
      localPush(AppState.currentProjectId, project, `Restauration git ${hash.slice(0, 7)}`);
      closeGitHistoryModal();
      loadProject(project.id);
      showToast(`✓ Version ${hash.slice(0, 7)} restaurée`);
    } catch (e) {
      showToast('Erreur lors de la restauration : ' + e.message, 'error');
    }
  };
})();

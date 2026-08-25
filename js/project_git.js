/**
 * project_git.js — Historique git unifié (téléphone + PC)
 *
 * Backend : OseGit (isomorphic-git / IndexedDB) partout.
 * Le pont Qt desktop peut coexister ; OseGit.polyfill assure la parité Android.
 */
(() => {
  function _bridge() {
    if (typeof OseGit !== 'undefined' && OseGit.polyfillNativeBridge)
      OseGit.polyfillNativeBridge();
    return (typeof getNativeBridge === 'function' ? getNativeBridge() : null)
        || window.webBridge || window.nativeBridge || null;
  }

  function _gitApi() {
    const b = _bridge();
    if (b && typeof b.gitLog === 'function' && typeof b.gitSave === 'function')
      return b;
    if (typeof OseGit !== 'undefined')
      return OseGit;
    return null;
  }

  function _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _restoreBranchBarShell() {
    const bar = document.getElementById('git-branch-bar');
    if (!bar) return null;
    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:12px;font-weight:600;color:var(--color-text-muted)">Variante :</span>
        <div id="git-branch-list" style="display:flex;gap:6px;flex-wrap:wrap;flex:1"></div>
        <button type="button" class="btn btn-outline btn-sm" onclick="gitNewBranch()" style="white-space:nowrap">+ Nouvelle variante</button>
      </div>`;
    bar.style.display = 'block';
    return document.getElementById('git-branch-list');
  }

  async function _applyProjectJson(jsonText, toastMsg) {
    const project = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
    if (project.hourlyEnedisData?.halfHourly
        && !(project.hourlyEnedisData.halfHourly instanceof Float32Array)) {
      project.hourlyEnedisData.halfHourly = new Float32Array(project.hourlyEnedisData.halfHourly);
    }
    // Garder l’id du projet ouvert
    if (AppState.currentProjectId)
      project.id = AppState.currentProjectId;
    ProjectManager.save(project);
    closeGitHistoryModal();
    loadProject(project.id);
    if (toastMsg) showToast(toastMsg);
  }

  /**
   * Sauvegarde projet + commit git (IndexedDB / isomorphic-git).
   */
  window.gitAutoSave = async function gitAutoSave(actionMessage) {
    if (!AppState.currentProjectId) return;
    const project = buildProjectData();
    AppState.currentProjectId = project.id;
    ProjectManager.save(project);

    const api = _gitApi();
    if (!api) return;
    try {
      if (typeof OseGit !== 'undefined') await OseGit.ready();
      const payload = JSON.stringify(project, null, 2);
      // Toujours passer par OseGit si dispo (parité tel/PC)
      if (typeof OseGit !== 'undefined') {
        await OseGit.save(project.id, payload, actionMessage);
      } else if (api.gitSave) {
        await api.gitSave(project.id, payload, actionMessage);
      } else if (api.save) {
        await api.save(project.id, payload, actionMessage);
      }
    } catch (e) {
      console.warn('[gitAutoSave]', e);
    }
  };

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
        Ouvrez un projet, puis effectuez une action (calcul, import, Sauver) pour créer le premier commit.
      </p>`;
      return;
    }

    listEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;padding:20px">Chargement de l’historique git…</p>';

    const api = _gitApi();
    if (!api) {
      listEl.innerHTML = `<p style="color:var(--color-danger);text-align:center;padding:20px">
        Moteur git indisponible (scripts vendor manquants).
      </p>`;
      return;
    }

    try {
      if (typeof OseGit !== 'undefined') await OseGit.ready();

      // Premier commit si le dépôt est vide mais le projet existe
      let commits = await (api.gitLog
        ? api.gitLog(AppState.currentProjectId)
        : api.log(AppState.currentProjectId));
      if (!commits?.length) {
        const cur = buildProjectData();
        ProjectManager.save(cur);
        await (api.gitSave
          ? api.gitSave(AppState.currentProjectId, JSON.stringify(cur, null, 2), 'État initial')
          : api.save(AppState.currentProjectId, JSON.stringify(cur, null, 2), 'État initial'));
        commits = await (api.gitLog
          ? api.gitLog(AppState.currentProjectId)
          : api.log(AppState.currentProjectId));
      }

      const branches = await (api.gitBranches
        ? api.gitBranches(AppState.currentProjectId)
        : api.branches(AppState.currentProjectId));

      const branchListEl = _restoreBranchBarShell();
      if (branchListEl) {
        const list = (branches && branches.length)
          ? branches
          : [{ name: 'main', current: true }];
        branchListEl.innerHTML = list.map(b => {
          const style = b.current
            ? 'background:var(--color-accent);color:#fff;border-color:var(--color-accent)'
            : '';
          return `<button type="button" class="btn btn-outline btn-sm" style="${style};font-size:11px"
            onclick="gitSwitchBranch('${String(b.name).replace(/'/g, '')}')"
            ${b.current ? 'disabled' : ''}>
            ${b.current ? '✓ ' : ''}${_esc(b.name)}
          </button>`;
        }).join('');
      }

      if (!commits?.length) {
        listEl.innerHTML = `<p style="color:var(--color-text-muted);text-align:center;padding:20px">
          Aucun commit. Cliquez Sauver ou lancez un calcul.
        </p>`;
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
    } catch (e) {
      console.error(e);
      listEl.innerHTML = `<p style="color:var(--color-danger);text-align:center;padding:20px">Erreur git : ${_esc(e.message || e)}</p>`;
    }
  };

  window.gitNewBranch = function gitNewBranch() {
    if (!AppState.currentProjectId) return;
    const bar = document.getElementById('git-branch-bar');
    if (!bar) return;
    bar.innerHTML = `
      <form id="git-new-branch-form" onsubmit="gitNewBranchSubmit(event)"
            style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:12px;font-weight:600;color:var(--color-text-muted);white-space:nowrap">Nom de la variante :</span>
        <input id="git-new-branch-input" type="text"
               placeholder="ex : option-batterie-15kWh"
               style="flex:1;min-width:160px;font-size:12px;padding:4px 8px;border:1px solid var(--color-accent);border-radius:6px;background:var(--color-bg);color:var(--color-text);outline:none"
               autocomplete="off" spellcheck="false">
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button type="submit" class="btn btn-accent btn-sm" id="git-new-branch-btn" style="font-size:11px">Créer</button>
          <button type="button" class="btn btn-outline btn-sm" onclick="openGitHistoryModal()" style="font-size:11px">Annuler</button>
        </div>
        <div style="font-size:10px;color:var(--color-text-muted);width:100%">
          Suggestions :
          <span style="cursor:pointer;color:var(--color-accent)" onclick="document.getElementById('git-new-branch-input').value='option-A'">option-A</span> ·
          <span style="cursor:pointer;color:var(--color-accent)" onclick="document.getElementById('git-new-branch-input').value='devis-client-v2'">devis-client-v2</span>
        </div>
      </form>`;
    bar.style.display = 'block';
    document.getElementById('git-new-branch-input')?.focus();
  };

  window.gitNewBranchSubmit = async function gitNewBranchSubmit(event) {
    event.preventDefault();
    const input = document.getElementById('git-new-branch-input');
    const btn = document.getElementById('git-new-branch-btn');
    const name = input?.value.trim();
    if (!name) { input?.focus(); return; }
    const api = _gitApi();
    if (!api || !AppState.currentProjectId) return;

    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    if (input) input.disabled = true;

    try {
      // Sauver l’état courant avant de brancher
      await gitAutoSave('Sauvegarde avant nouvelle variante');
      const res = await (api.gitCreateBranch
        ? api.gitCreateBranch(AppState.currentProjectId, name)
        : api.createBranch(AppState.currentProjectId, name));
      if (res?.ok) {
        showToast(`✓ Variante « ${res.branchName || name} » créée`);
        openGitHistoryModal();
      } else {
        showToast(`Erreur : ${res?.reason || 'création impossible'}`, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Créer'; }
        if (input) { input.disabled = false; input.focus(); }
      }
    } catch (e) {
      showToast('Erreur : ' + (e.message || e), 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Créer'; }
      if (input) { input.disabled = false; input.focus(); }
    }
  };

  window.gitSwitchBranch = async function gitSwitchBranch(branchName) {
    const api = _gitApi();
    if (!api || !AppState.currentProjectId) return;
    try {
      await gitAutoSave('Sauvegarde avant changement de variante');
      await (api.gitSwitchBranch
        ? api.gitSwitchBranch(AppState.currentProjectId, branchName)
        : api.switchBranch(AppState.currentProjectId, branchName));
      const jsonText = await (api.gitRead
        ? api.gitRead(AppState.currentProjectId)
        : api.read(AppState.currentProjectId));
      if (!jsonText) throw new Error('project.json vide sur cette branche');
      await _applyProjectJson(jsonText, `✓ Variante « ${branchName} » chargée`);
    } catch (e) {
      showToast('Erreur : ' + (e.message || e), 'error');
    }
  };

  window.closeGitHistoryModal = function closeGitHistoryModal() {
    const modal = document.getElementById('git-history-modal');
    if (modal) modal.style.display = 'none';
  };

  window.restoreGitVersionConfirm = function restoreGitVersionConfirm(hash) {
    const btn = document.querySelector(`[data-restore-hash="${hash}"]`);
    if (!btn) { restoreGitVersion(hash); return; }
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
    const api = _gitApi();
    if (!api || !AppState.currentProjectId) return;
    try {
      const jsonText = await (api.gitCheckout
        ? api.gitCheckout(AppState.currentProjectId, hash)
        : api.checkout(AppState.currentProjectId, hash));
      if (!jsonText) throw new Error('Contenu introuvable');
      // Nouveau commit « restauration » pour garder l’historique linéaire sur la branche
      const project = JSON.parse(jsonText);
      if (AppState.currentProjectId) project.id = AppState.currentProjectId;
      ProjectManager.save(project);
      await (api.gitSave
        ? api.gitSave(AppState.currentProjectId, JSON.stringify(project, null, 2),
            `Restauration ${String(hash).slice(0, 7)}`)
        : api.save(AppState.currentProjectId, JSON.stringify(project, null, 2),
            `Restauration ${String(hash).slice(0, 7)}`));
      closeGitHistoryModal();
      loadProject(project.id);
      showToast(`✓ Version ${String(hash).slice(0, 7)} restaurée`);
    } catch (e) {
      showToast('Erreur lors de la restauration : ' + (e.message || e), 'error');
    }
  };

  // Compat anciennes APIs snapshots (no-op utiles)
  window.ProjectHistory = {
    hasNativeGit: () => true,
    list: () => [],
    push: () => null,
    get: () => null,
    clear: () => {},
  };
  window.gitLocalVariant = window.gitNewBranch;
  window.restoreLocalVersionConfirm = () => {};
  window.restoreLocalVersion = () => {};
})();

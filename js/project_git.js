/**
 * project_git.js - Sauvegarde git automatique et historique des versions
 * Dépend de : app_state.js, project_manager.js, project_forms.js
 */

// ══════════════════════════════════════════════════════════════
//  SAUVEGARDE GIT AUTOMATIQUE
// ══════════════════════════════════════════════════════════════
/**
 * Sauvegarde le projet courant dans localStorage ET dans un commit git.
 * Ne fait rien si aucun projet actif ou si l'API Electron n'est pas disponible.
 */
async function gitAutoSave(actionMessage) {
  if (!AppState.currentProjectId) return;
  const project = buildProjectData();
  AppState.currentProjectId = project.id;

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

  try {
    const [commits, branches] = await Promise.all([
      window.electronAPI.gitLog(AppState.currentProjectId),
      window.electronAPI.gitBranches(AppState.currentProjectId),
    ]);

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
      branchBar.style.display = 'block';
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
        ${!isCur ? `<button class="btn btn-outline btn-sm" data-restore-hash="${c.hash}" onclick="restoreGitVersionConfirm('${c.hash}')" title="Restaurer cette version">Restaurer</button>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    listEl.innerHTML = `<p style="color:var(--color-danger);text-align:center;padding:20px">Erreur : ${e.message}</p>`;
  }
}

function gitNewBranch() {
  if (!window.electronAPI || !AppState.currentProjectId) return;
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
      <div style="font-size:10px;color:var(--color-text-muted);width:100%;margin-top:2px">
        Suggestions : <span style="cursor:pointer;color:var(--color-accent)" onclick="document.getElementById('git-new-branch-input').value='option-A'">option-A</span> ·
        <span style="cursor:pointer;color:var(--color-accent)" onclick="document.getElementById('git-new-branch-input').value='devis-client-v2'">devis-client-v2</span> ·
        <span style="cursor:pointer;color:var(--color-accent)" onclick="document.getElementById('git-new-branch-input').value='puissance-reduite'">puissance-reduite</span>
      </div>
    </form>`;

  bar.style.display = 'block';
  document.getElementById('git-new-branch-input')?.focus();
}

async function gitNewBranchSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('git-new-branch-input');
  const btn   = document.getElementById('git-new-branch-btn');
  const name  = input?.value.trim();
  if (!name) { input?.focus(); return; }

  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  if (input) input.disabled = true;

  try {
    const res = await window.electronAPI.gitCreateBranch(AppState.currentProjectId, name);
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
}

async function gitSwitchBranch(branchName) {
  if (!window.electronAPI || !AppState.currentProjectId) return;
  try {
    await window.electronAPI.gitSave(
      AppState.currentProjectId,
      JSON.stringify(buildProjectData(), null, 2),
      'Sauvegarde avant changement de variante'
    );
    await window.electronAPI.gitSwitchBranch(AppState.currentProjectId, branchName);
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

function restoreGitVersionConfirm(hash) {
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
}

async function restoreGitVersion(hash) {
  if (!window.electronAPI || !AppState.currentProjectId) return;
  try {
    const jsonText = await window.electronAPI.gitCheckout(AppState.currentProjectId, hash);
    const project  = JSON.parse(jsonText);
    if (project.hourlyEnedisData?.halfHourly) {
      project.hourlyEnedisData.halfHourly = new Float32Array(project.hourlyEnedisData.halfHourly);
    }
    ProjectManager.save(project);
    closeGitHistoryModal();
    loadProject(project.id);
    showToast(`✓ Version ${hash.slice(0, 7)} restaurée`);
  } catch (e) {
    showToast('Erreur lors de la restauration : ' + e.message, 'error');
  }
}

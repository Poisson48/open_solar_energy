/**
 * project_manager.js - Gestion de projets (localStorage + miroir natif AppImage/APK)
 *
 * Un projet contient :
 *   - Métadonnées : id, name, description, createdAt, updatedAt
 *   - Localisation : lat, lon, alt, name
 *   - weatherData  : données météo (12 mois) pour ne pas re-fetcher
 *   - formState    : snapshot de tous les champs de formulaire
 *   - summary      : résumé calculé pour l'affichage dans la liste
 */

const ProjectManager = (() => {

  const STORAGE_KEY = 'ose_projects_v1';
  let _backupRestored = false;

  function _bridge() {
    return (typeof getNativeBridge === 'function' ? getNativeBridge() : null)
        || (typeof window !== 'undefined' ? (window.webBridge || window.nativeBridge) : null)
        || null;
  }

  /** Restaure depuis le fichier natif si localStorage est vide (ex. profil OTR / MAJ). */
  function _restoreFromNativeBackupIfNeeded() {
    if (_backupRestored) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          _backupRestored = true;
          return;
        }
      }
    } catch { /* continue restore */ }

    const b = _bridge();
    // Pont Qt pas encore prêt → réessayer plus tard (native_bridge appellera list())
    if (!b || typeof b.loadProjectsBackup !== 'function') return;

    _backupRestored = true;
    try {
      const backup = b.loadProjectsBackup();
      if (!backup || typeof backup !== 'string' || backup.length < 3) return;
      const parsed = JSON.parse(backup);
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      console.info('[ProjectManager] Restauré', parsed.length, 'projet(s) depuis la sauvegarde native');
    } catch (e) {
      console.warn('[ProjectManager] restore backup:', e);
    }
  }

  function _mirrorToNative(projects) {
    try {
      const b = _bridge();
      if (!b || typeof b.saveProjectsBackup !== 'function') return;
      b.saveProjectsBackup(JSON.stringify(projects));
    } catch (e) {
      console.warn('[ProjectManager] mirror backup:', e);
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────

  function list() {
    _restoreFromNativeBackupIfNeeded();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const projects = raw ? JSON.parse(raw) : [];
      return projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    } catch { return []; }
  }

  function get(id) {
    return list().find(p => p.id === id) || null;
  }

  function save(project, opts = {}) {
    const projects = list();
    const idx = projects.findIndex(p => p.id === project.id);
    if (!opts.keepUpdatedAt)
      project.updatedAt = new Date().toISOString();
    else if (!project.updatedAt)
      project.updatedAt = new Date().toISOString();
    if (idx >= 0) {
      project.createdAt = projects[idx].createdAt || project.updatedAt;
      projects[idx] = project;
    } else {
      project.createdAt = project.createdAt || project.updatedAt;
      projects.unshift(project);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
      _mirrorToNative(projects);
      return true;
    } catch (e) {
      console.error('ProjectManager: localStorage plein ?', e);
      // Dernière chance : miroir natif seul (récupérable au prochain démarrage)
      try { _mirrorToNative(projects); } catch (_) {}
      return false;
    }
  }

  function remove(id) {
    const projects = list().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    _mirrorToNative(projects);
  }

  function clone(id, newName) {
    const src = get(id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id     = 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    copy.name   = newName || src.name + ' (copie)';
    copy.isDemo = false;
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    delete copy.share; // ne pas hériter du canal de partage
    save(copy);
    return copy;
  }

  // ── Nouvelle ID ───────────────────────────────────────────────
  function newId() {
    return 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  }

  // ── Téléchargement / partage (Android WebView : pas de <a download>) ──
  function _bytesToBase64(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk)
      bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    return btoa(bin);
  }

  async function _downloadOrShare(filename, data, mime) {
    const bridge = _bridge();
    if (bridge?.shareFile) {
      let b64;
      if (typeof data === 'string') {
        b64 = _bytesToBase64(new TextEncoder().encode(data));
      } else if (data instanceof Blob) {
        b64 = _bytesToBase64(new Uint8Array(await data.arrayBuffer()));
      } else if (data instanceof ArrayBuffer) {
        b64 = _bytesToBase64(new Uint8Array(data));
      } else if (data instanceof Uint8Array) {
        b64 = _bytesToBase64(data);
      } else {
        b64 = _bytesToBase64(new TextEncoder().encode(String(data)));
      }
      bridge.shareFile(filename, mime || 'application/octet-stream', b64);
      if (typeof showToast === 'function')
        showToast('Choisissez où enregistrer / partager le fichier');
      return;
    }
    const blob = data instanceof Blob
      ? data
      : new Blob([data], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ── Export / Import JSON ──────────────────────────────────────
  async function exportAll() {
    const filename = 'ose_projets_' + new Date().toISOString().slice(0, 10) + '.json';
    const text = JSON.stringify(list(), null, 2);
    await _downloadOrShare(filename, text, 'application/json');
  }

  /** Exporte un seul projet en fichier JSON local */
  async function exportOne(id) {
    const project = get(id);
    if (!project) return;
    const safeName = (project.name || 'projet').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    const filename = `ose_${safeName}_${new Date().toISOString().slice(0, 10)}.json`;
    await _downloadOrShare(filename, JSON.stringify(project, null, 2), 'application/json');
  }

  /** Exporte un projet en ZIP (project.json + enedis_30min.csv si présent) */
  async function exportOneZip(id) {
    const project = get(id);
    if (!project) return;
    const safeName = (project.name || 'projet').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    const zip = new JSZip();

    // Séparer les données Enedis volumineuses du JSON principal
    let enedisCsv = null;
    const projectClean = { ...project };
    if (projectClean.hourlyEnedisData?.halfHourly?.length) {
      const arr = projectClean.hourlyEnedisData.halfHourly;
      const lines = ['slot_30min,wh'];
      arr.forEach((v, i) => lines.push(`${i},${(+v).toFixed(1)}`));
      enedisCsv = lines.join('\n');
      projectClean.hourlyEnedisData = { ...projectClean.hourlyEnedisData, halfHourly: '__enedis_30min.csv__' };
    }

    zip.file('project.json', JSON.stringify(projectClean, null, 2));
    if (enedisCsv) zip.file('enedis_30min.csv', enedisCsv);

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    await _downloadOrShare(
      `ose_${safeName}_${new Date().toISOString().slice(0, 10)}.zip`,
      blob,
      'application/zip'
    );
  }

  /** Importe un projet unique depuis un texte JSON */
  function importOne(jsonText) {
    try {
      const p = JSON.parse(jsonText);
      if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Format invalide');
      if (!p.name) throw new Error('Le fichier ne contient pas de projet valide');
      // Réattribuer un ID pour éviter les collisions
      p.id = newId();
      p.updatedAt = new Date().toISOString();
      p.createdAt = p.createdAt || p.updatedAt;
      save(p);
      return { project: p };
    } catch (e) {
      return { error: e.message };
    }
  }

  function importFromJSON(jsonText) {
    try {
      const incoming = JSON.parse(jsonText);
      if (!Array.isArray(incoming)) throw new Error('Format invalide');
      const existing = list();
      const existingIds = new Set(existing.map(p => p.id));
      let added = 0;
      incoming.forEach(p => {
        if (!p.id || !p.name) return;
        if (existingIds.has(p.id)) {
          p.id = newId(); // éviter collision
        }
        existing.push(p);
        added++;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
      _mirrorToNative(existing);
      return { added };
    } catch (e) {
      return { error: e.message };
    }
  }

  /** Force une resync miroir (après join / import). */
  function flushBackup() {
    _mirrorToNative(list());
  }

  return {
    list, get, save, remove, clone, newId,
    exportAll, exportOne, exportOneZip, importOne, importFromJSON,
    flushBackup,
    _downloadOrShare,
  };
})();

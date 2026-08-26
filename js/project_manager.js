/**
 * project_manager.js - Gestion de projets (localStorage)
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

  // ── CRUD ──────────────────────────────────────────────────────

  function list() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const projects = raw ? JSON.parse(raw) : [];
      return projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    } catch { return []; }
  }

  function get(id) {
    return list().find(p => p.id === id) || null;
  }

  function save(project) {
    const projects = list();
    const idx = projects.findIndex(p => p.id === project.id);
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
      return true;
    } catch (e) {
      console.error('ProjectManager: localStorage plein ?', e);
      return false;
    }
  }

  function remove(id) {
    const projects = list().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
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
    const bridge = (typeof getNativeBridge === 'function' ? getNativeBridge() : null)
                || window.webBridge || null;
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
    const safeName = (project.name || 'projet').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `ose_${safeName}_${new Date().toISOString().slice(0, 10)}.json`;
    await _downloadOrShare(filename, JSON.stringify(project, null, 2), 'application/json');
  }

  /** Exporte un projet en ZIP (project.json + enedis_30min.csv si présent) */
  async function exportOneZip(id) {
    const project = get(id);
    if (!project) return;
    const safeName = (project.name || 'projet').replace(/[^a-z0-9]/gi, '_').toLowerCase();
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
      return { added };
    } catch (e) {
      return { error: e.message };
    }
  }

  return {
    list, get, save, remove, clone, newId,
    exportAll, exportOne, exportOneZip, importOne, importFromJSON,
    _downloadOrShare,
  };
})();

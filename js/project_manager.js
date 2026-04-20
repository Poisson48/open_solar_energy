/**
 * project_manager.js — Gestion de projets (localStorage)
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
    copy.id   = 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    copy.name = newName || src.name + ' (copie)';
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    save(copy);
    return copy;
  }

  // ── Nouvelle ID ───────────────────────────────────────────────
  function newId() {
    return 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  }

  // ── Export / Import JSON ──────────────────────────────────────
  function exportAll() {
    const blob = new Blob([JSON.stringify(list(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ose_projets_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
  }

  /** Exporte un seul projet en fichier JSON local */
  function exportOne(id) {
    const project = get(id);
    if (!project) return;
    const safeName = (project.name || 'projet').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ose_${safeName}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ose_${safeName}_${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
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

  return { list, get, save, remove, clone, newId, exportAll, exportOne, exportOneZip, importOne, importFromJSON };
})();

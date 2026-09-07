/**
 * rexel_catalog.js — Catalogue Rexel embarqué (panneaux + onduleurs)
 * Source : data/rexel_catalog/catalog.json (lu une fois, en mémoire).
 * Pas d’import manuel : PanelDB / InverterDB fusionnent ce catalogue
 * avec les entrées personnalisées (localStorage).
 */
const RexelCatalog = (() => {

  const CATALOG_URL = 'data/rexel_catalog/catalog.json';
  const FLAG_LEGACY = 'ose_rexel_catalog_imported_v1';

  let _cache = null;
  let _loadPromise = null;
  let _panels = null;
  let _inverters = null;

  function panelFromEntry(p) {
    const m2 = (p.largeur && p.hauteur) ? +(p.largeur * p.hauteur).toFixed(4) : null;
    const entry = {
      id: 'rexel_panel_' + p.sku,
      model: p.model || p.name || ('SKU ' + p.sku),
      fabricant: p.fabricant || p.brand || '',
      wp: p.wp,
      largeur: p.largeur || null,
      hauteur: p.hauteur || null,
      m2,
      tech: p.tech || (p.bifacial ? 'bifacial' : 'mono'),
      rendement: null,
      coef_temp: p.coef_temp ?? null,
      voc: p.voc ?? null,
      isc: p.isc ?? null,
      vmp: p.vmp ?? null,
      imp: p.imp ?? null,
      bifacial: !!p.bifacial,
      prix: null,
      garantie_p: p.garantie_p ?? null,
      url: p.url || '',
      datasheet: p.datasheetLocal || p.datasheetUrl || '',
      notes: [
        'Catalogue Rexel',
        p.rexelPartNumber ? ('Réf. ' + p.rexelPartNumber) : '',
        p.sku ? ('SKU ' + p.sku) : '',
      ].filter(Boolean).join(' · '),
      seeded: true,
      source: 'rexel',
      sku: p.sku,
      savedAt: p.scrapedAt || '1970-01-01T00:00:00.000Z',
    };
    if (entry.wp && entry.m2)
      entry.rendement = +(entry.wp / (entry.m2 * 1000) * 100).toFixed(1);
    return entry;
  }

  /** Exclut accessoires / passerelles / câbles scrapés par erreur dans « onduleurs ». */
  function isRealInverter(inv) {
    const blob = `${inv.name || ''} ${inv.model || ''} ${inv.brand || ''} ${inv.fabricant || ''}`;
    if (/passerelle|gateway|\bECU[- ]|câble|cable|bouchon|borne de recharge|compteur(?!.*onduleur)|coffret de|optimiseur|q-seal|q cable/i.test(blob))
      return false;
    // Garder micro même si pnom petit ; sinon exiger une puissance
    if (inv.type === 'micro') return true;
    return !!(inv.pnom > 0);
  }

  function inverterFromEntry(inv) {
    return {
      id: 'rexel_inv_' + inv.sku,
      brand: inv.brand || inv.fabricant || '',
      model: inv.model || inv.name || ('SKU ' + inv.sku),
      type: inv.type || 'string',
      phase: inv.phase || 1,
      pnom: inv.pnom ?? null,
      nMppt: inv.nMppt ?? null,
      maxMpptCurrent: null,
      maxVocInput: null,
      maxBattV: null,
      maxChargeCurrent: null,
      efficiency: null,
      prix: null,
      garantie_p: null,
      url: inv.url || '',
      datasheet: inv.datasheetLocal || inv.datasheetUrl || '',
      notes: [
        'Catalogue Rexel',
        inv.rexelPartNumber ? ('Réf. ' + inv.rexelPartNumber) : '',
        inv.sku ? ('SKU ' + inv.sku) : '',
      ].filter(Boolean).join(' · '),
      seeded: true,
      source: 'rexel',
      sku: inv.sku,
      savedAt: inv.scrapedAt || '1970-01-01T00:00:00.000Z',
    };
  }

  function _rebuildMaps() {
    const panels = Array.isArray(_cache?.panels) ? _cache.panels : [];
    const inverters = Array.isArray(_cache?.inverters) ? _cache.inverters : [];
    _panels = panels.filter(p => p.wp > 0).map(panelFromEntry);
    _inverters = inverters.filter(isRealInverter).map(inverterFromEntry);
  }

  async function ensureLoaded(force) {
    if (_cache && !force) return _cache;
    if (_loadPromise && !force) return _loadPromise;
    _loadPromise = (async () => {
      const res = await fetch(CATALOG_URL + (force ? ('?t=' + Date.now()) : ''), {
        cache: force ? 'no-store' : 'default',
      });
      if (!res.ok) throw new Error('Catalogue introuvable (HTTP ' + res.status + ')');
      _cache = await res.json();
      _rebuildMaps();
      // Nettoyage : anciennes copies Rexel dans localStorage (quota mobile)
      _purgeLegacyLocalCopies();
      return _cache;
    })();
    try {
      return await _loadPromise;
    } finally {
      _loadPromise = null;
    }
  }

  function _purgeLegacyLocalCopies() {
    try {
      const strip = (key, prefix) => {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) return;
        const next = list.filter(x => !(x.id || '').startsWith(prefix));
        if (next.length !== list.length)
          localStorage.setItem(key, JSON.stringify(next));
      };
      strip('ose_panels_v1', 'rexel_panel_');
      strip('ose_inverters_v1', 'rexel_inv_');
      localStorage.removeItem(FLAG_LEGACY);
    } catch (e) {
      console.warn('RexelCatalog purge', e);
    }
  }

  function getPanels() {
    return _panels ? _panels.slice() : [];
  }

  function getInverters() {
    return _inverters ? _inverters.slice() : [];
  }

  function getPanelById(id) {
    return (_panels || []).find(p => p.id === id) || null;
  }

  function getInverterById(id) {
    return (_inverters || []).find(i => i.id === id) || null;
  }

  function isReady() {
    return !!_panels;
  }

  /** Au démarrage : charge le JSON (pas d’écriture localStorage du catalogue). */
  async function boot() {
    try {
      await ensureLoaded(false);
    } catch (e) {
      console.warn('RexelCatalog boot', e);
    }
  }

  // Compat anciennes API (plus d’import UI)
  async function autoImportIfEmpty() { return boot(); }
  async function importWithUi() { await boot(); return { panels: getPanels().length, inverters: getInverters().length }; }
  async function importIntoLibraries() { await boot(); return { panels: getPanels().length, inverters: getInverters().length }; }

  return {
    ensureLoaded,
    boot,
    getPanels,
    getInverters,
    getPanelById,
    getInverterById,
    isReady,
    autoImportIfEmpty,
    importWithUi,
    importIntoLibraries,
    CATALOG_URL,
  };
})();

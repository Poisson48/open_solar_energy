/**
 * rexel_catalog.js — Import du catalogue Rexel (panneaux + onduleurs)
 * depuis data/rexel_catalog/catalog.json vers PanelDB / InverterDB.
 */
const RexelCatalog = (() => {

  const CATALOG_URL = 'data/rexel_catalog/catalog.json';
  const FLAG_KEY = 'ose_rexel_catalog_imported_v1';

  let _cache = null;

  function _toast(msg, kind) {
    if (typeof showToast === 'function') showToast(msg, kind);
  }

  async function loadCatalog(force) {
    if (_cache && !force) return _cache;
    const res = await fetch(CATALOG_URL + (force ? ('?t=' + Date.now()) : ''), { cache: force ? 'no-store' : 'default' });
    if (!res.ok) throw new Error('Catalogue introuvable (HTTP ' + res.status + ')');
    _cache = await res.json();
    return _cache;
  }

  function panelFromEntry(p) {
    const m2 = (p.largeur && p.hauteur) ? +(p.largeur * p.hauteur).toFixed(4) : null;
    return {
      id: 'rexel_panel_' + p.sku,
      model: p.model || p.name || ('SKU ' + p.sku),
      fabricant: p.fabricant || p.brand || '',
      wp: p.wp,
      largeur: p.largeur || null,
      hauteur: p.hauteur || null,
      m2,
      tech: p.tech || 'mono',
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
        p.datasheetPurpose || '',
      ].filter(Boolean).join(' · '),
      seeded: true,
      source: 'rexel',
      sku: p.sku,
      savedAt: new Date().toISOString(),
    };
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
        inv.datasheetPurpose || '',
      ].filter(Boolean).join(' · '),
      seeded: true,
      source: 'rexel',
      sku: inv.sku,
      savedAt: new Date().toISOString(),
    };
  }

  /**
   * Fusionne le catalogue Rexel dans les bibliothèques (écrase les entrées rexel_*).
   * @returns {{ panels: number, inverters: number }}
   */
  async function importIntoLibraries(opts) {
    const replace = !opts || opts.replace !== false;
    const cat = await loadCatalog(!!(opts && opts.forceReload));
    const panels = Array.isArray(cat.panels) ? cat.panels : [];
    const inverters = Array.isArray(cat.inverters) ? cat.inverters : [];

    if (typeof PanelDB !== 'undefined') {
      let list = PanelDB.list().filter(p => !(replace && (p.id || '').startsWith('rexel_panel_')));
      const mapped = panels.filter(p => p.wp > 0).map(panelFromEntry);
      // recalcul rendement via savePanel logique — write direct pour perf
      mapped.forEach(p => {
        if (p.wp && p.m2) p.rendement = +(p.wp / (p.m2 * 1000) * 100).toFixed(1);
      });
      list = mapped.concat(list);
      try {
        localStorage.setItem('ose_panels_v1', JSON.stringify(list));
      } catch (e) {
        throw new Error('Stockage panneaux plein : ' + (e.message || e));
      }
    }

    if (typeof InverterDB !== 'undefined') {
      let list = InverterDB.list().filter(i => !(replace && (i.id || '').startsWith('rexel_inv_')));
      const mapped = inverters.map(inverterFromEntry);
      list = mapped.concat(list);
      try {
        localStorage.setItem('ose_inverters_v1', JSON.stringify(list));
        try { localStorage.setItem('ose_inverters_seeded_v1', '1'); } catch { /* ignore */ }
      } catch (e) {
        throw new Error('Stockage onduleurs plein : ' + (e.message || e));
      }
    }

    try { localStorage.setItem(FLAG_KEY, cat.scrapedAt || '1'); } catch { /* ignore */ }
    return { panels: panels.length, inverters: inverters.length, scrapedAt: cat.scrapedAt };
  }

  async function importWithUi() {
    try {
      _toast('Import catalogue Rexel…');
      const r = await importIntoLibraries({ replace: true, forceReload: true });
      _toast(`Catalogue Rexel : ${r.panels} panneaux, ${r.inverters} onduleurs`);
      if (typeof PanelDB !== 'undefined' && PanelDB._renderManager) PanelDB._renderManager();
      if (typeof InverterDB !== 'undefined' && InverterDB._renderManager) InverterDB._renderManager();
      return r;
    } catch (e) {
      console.error(e);
      _toast('Import Rexel échoué : ' + (e.message || e), 'error');
      return null;
    }
  }

  function wasImported() {
    try { return !!localStorage.getItem(FLAG_KEY); } catch { return false; }
  }

  /** Au démarrage : importe une fois si bibliothèque panneaux vide. */
  async function autoImportIfEmpty() {
    try {
      if (wasImported()) return;
      const emptyPanels = typeof PanelDB === 'undefined' || PanelDB.list().length === 0;
      if (!emptyPanels) return;
      await importIntoLibraries({ replace: true });
    } catch (e) {
      console.warn('RexelCatalog auto-import', e);
    }
  }

  return {
    loadCatalog,
    importIntoLibraries,
    importWithUi,
    wasImported,
    autoImportIfEmpty,
    CATALOG_URL,
  };
})();

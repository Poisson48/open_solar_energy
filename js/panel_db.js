/**
 * panel_db.js - Bibliotheque de panneaux solaires (globale, partagee entre projets)
 * Stockage : localStorage, cle ose_panels_v1
 * Chaque panneau : { id, model, wp, m2, savedAt }
 */

const PanelDB = (() => {

  const STORAGE_KEY = 'ose_panels_v1';

  // ── CRUD ──────────────────────────────────────────────────────

  function list() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const panels = raw ? JSON.parse(raw) : [];
      return panels.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    } catch { return []; }
  }

  function save(model, wp, m2) {
    model = (model || '').trim();
    wp    = parseFloat(wp);
    m2    = parseFloat(m2);
    if (!model || isNaN(wp) || isNaN(m2) || wp <= 0 || m2 <= 0) return null;

    const panels = list();
    // Deduplication sur le modele exact (case-insensitive)
    const existing = panels.find(p => p.model.toLowerCase() === model.toLowerCase());
    if (existing) {
      // Mettre a jour les valeurs
      existing.wp     = wp;
      existing.m2     = m2;
      existing.savedAt = new Date().toISOString();
    } else {
      panels.unshift({
        id:      'panel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        model,
        wp,
        m2,
        savedAt: new Date().toISOString()
      });
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
      return existing || panels[0];
    } catch (e) {
      console.error('PanelDB: localStorage plein ?', e);
      return null;
    }
  }

  function remove(id) {
    const panels = list().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
  }

  // ── UI helpers ────────────────────────────────────────────────

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /**
   * Affiche le modal de la bibliotheque de panneaux pour un prefixe donne.
   * @param {string} prefix - 'inp' | 'sz' | 'og2'
   */
  function openLibraryModal(prefix) {
    const panels = list();
    const rows = panels.length === 0
      ? `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);padding:16px">
           Aucun panneau enregistre. Saisissez un modele et cliquez sur Enregistrer.
         </td></tr>`
      : panels.map(p => `
          <tr style="border-bottom:1px solid var(--color-border)">
            <td style="padding:6px 8px">${escHtml(p.model)}</td>
            <td style="padding:6px 8px;text-align:right">${p.wp} Wc</td>
            <td style="padding:6px 8px;text-align:right">${p.m2} m²</td>
            <td style="padding:6px 8px;text-align:right;white-space:nowrap">
              <button class="btn btn-outline btn-sm" onclick="PanelDB.applyPanel('${p.id}','${prefix}');PanelDB.closeLibraryModal()" style="padding:2px 8px;font-size:11px">Utiliser</button>
              <button class="btn btn-sm" onclick="PanelDB.removePanel('${p.id}','${prefix}')" style="padding:2px 8px;font-size:11px;background:var(--color-danger);color:#fff;border:none;border-radius:4px;cursor:pointer" title="Supprimer">✕</button>
            </td>
          </tr>`
        ).join('');

    let modal = document.getElementById('panel-library-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'panel-library-modal';
      modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.6);align-items:center;justify-content:center';
      modal.onclick = e => { if (e.target === modal) closeLibraryModal(); };
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:var(--color-surface);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.35);width:min(560px,95vw);max-height:80vh;overflow:hidden;display:flex;flex-direction:column">
        <div style="background:var(--color-primary);padding:16px 20px;color:#fff;display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:16px;font-weight:700">Bibliotheque de panneaux</span>
          <button onclick="PanelDB.closeLibraryModal()" style="background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:16px;width:28px;height:28px;border-radius:50%;cursor:pointer">✕</button>
        </div>
        <div style="overflow-y:auto;flex:1;padding:12px 16px">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="border-bottom:2px solid var(--color-border)">
                <th style="text-align:left;padding:6px 8px">Modele</th>
                <th style="text-align:right;padding:6px 8px">Puissance</th>
                <th style="text-align:right;padding:6px 8px">Surface</th>
                <th style="text-align:right;padding:6px 8px">Action</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div style="padding:10px 16px;border-top:1px solid var(--color-border);text-align:right">
          <button class="btn btn-outline btn-sm" onclick="PanelDB.closeLibraryModal()">Fermer</button>
        </div>
      </div>`;

    modal.style.display = 'flex';
  }

  function closeLibraryModal() {
    const modal = document.getElementById('panel-library-modal');
    if (modal) modal.style.display = 'none';
  }

  /**
   * Applique les donnees d'un panneau aux champs du formulaire.
   * @param {string} id - ID du panneau dans la DB
   * @param {string} prefix - 'inp' | 'sz' | 'og2'
   */
  function applyPanel(id, prefix) {
    const panel = list().find(p => p.id === id);
    if (!panel) return;

    const modelEl = document.getElementById(`${prefix}-panel-model`);
    const wpEl    = document.getElementById(`${prefix}-panel-wp`);
    const m2El    = document.getElementById(`${prefix}-panel-m2`);

    if (modelEl) modelEl.value = panel.model;
    if (wpEl)    { wpEl.value = panel.wp; wpEl.dispatchEvent(new Event('input')); }
    if (m2El)    { m2El.value = panel.m2; m2El.dispatchEvent(new Event('input')); }

    // Synchroniser le modele vers le devis si vide
    syncModelToQuote(panel.model);

    if (typeof showToast === 'function')
      showToast(`Panneau "${panel.model}" charge`);
  }

  /**
   * Enregistre le panneau depuis les champs du formulaire.
   * @param {string} prefix - 'inp' | 'sz' | 'og2'
   */
  function saveFromForm(prefix) {
    const model = (document.getElementById(`${prefix}-panel-model`)?.value || '').trim();
    const wp    = parseFloat(document.getElementById(`${prefix}-panel-wp`)?.value);
    const m2    = parseFloat(document.getElementById(`${prefix}-panel-m2`)?.value);

    if (!model) {
      if (typeof showToast === 'function') showToast('Saisissez un nom de modele avant d\'enregistrer.', 'error');
      return;
    }
    if (isNaN(wp) || wp <= 0) {
      if (typeof showToast === 'function') showToast('Saisissez une puissance Wc valide.', 'error');
      return;
    }
    if (isNaN(m2) || m2 <= 0) {
      if (typeof showToast === 'function') showToast('Saisissez une surface panneau valide.', 'error');
      return;
    }

    const saved = save(model, wp, m2);
    if (saved) {
      syncModelToQuote(model);
      if (typeof showToast === 'function') showToast(`Panneau "${model}" enregistre dans la bibliotheque`);
    } else {
      if (typeof showToast === 'function') showToast('Erreur lors de l\'enregistrement.', 'error');
    }
  }

  /**
   * Supprime un panneau et rafraichit le modal.
   */
  function removePanel(id, prefix) {
    remove(id);
    openLibraryModal(prefix);
    if (typeof showToast === 'function') showToast('Panneau supprime');
  }

  /**
   * Propage le modele de panneau vers le champ devis si celui-ci est vide.
   */
  function syncModelToQuote(model) {
    const dvEl = document.getElementById('dv-sys-panel-model');
    if (dvEl && !dvEl.value) dvEl.value = model;
  }

  // ── Export public ─────────────────────────────────────────────
  return {
    list,
    save,
    remove,
    openLibraryModal,
    closeLibraryModal,
    applyPanel,
    saveFromForm,
    removePanel,
    syncModelToQuote,
  };

})();

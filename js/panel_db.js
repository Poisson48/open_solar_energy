/**
 * panel_db.js - Bibliothèque de panneaux solaires (globale, partagée entre projets)
 * Stockage : localStorage, clé ose_panels_v1
 * Schéma panneau : { id, model, fabricant, wp, largeur, hauteur, m2, tech,
 *                    rendement, coef_temp, prix, garantie_p, url, datasheet, notes, savedAt }
 */

const PanelDB = (() => {

  const STORAGE_KEY = 'ose_panels_v1';

  // ── HELPERS ───────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function calcM2(largeur, hauteur) {
    const l = parseFloat(largeur), h = parseFloat(hauteur);
    return (!isNaN(l) && !isNaN(h) && l > 0 && h > 0) ? +(l * h).toFixed(4) : null;
  }

  function calcRendement(wp, m2) {
    const w = parseFloat(wp), m = parseFloat(m2);
    return (!isNaN(w) && !isNaN(m) && m > 0) ? +(w / (m * 1000) * 100).toFixed(1) : null;
  }

  // ── CRUD ──────────────────────────────────────────────────────

  function list() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)) : [];
    } catch { return []; }
  }

  function getById(id) {
    return list().find(p => p.id === id) || null;
  }

  function savePanel(data) {
    const model = (data.model || '').trim();
    const wp    = parseFloat(data.wp);
    if (!model || isNaN(wp) || wp <= 0) return null;

    const largeur = parseFloat(data.largeur) || null;
    const hauteur = parseFloat(data.hauteur) || null;
    const m2computed = calcM2(largeur, hauteur);
    const m2 = m2computed || parseFloat(data.m2) || null;

    const panels   = list();
    const existing = data.id ? panels.find(p => p.id === data.id) : null;
    const entry = {
      id:         existing ? existing.id : 'panel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      model,
      fabricant:  (data.fabricant || '').trim(),
      wp,
      largeur,
      hauteur,
      m2,
      tech:       data.tech || 'mono',
      rendement:  calcRendement(wp, m2) || parseFloat(data.rendement) || null,
      coef_temp:  parseFloat(data.coef_temp) || null,
      prix:       parseFloat(data.prix) || null,
      garantie_p: parseInt(data.garantie_p) || null,
      url:        (data.url || '').trim(),
      datasheet:  (data.datasheet || '').trim(),
      notes:      (data.notes || '').trim(),
      savedAt:    new Date().toISOString(),
    };

    if (existing) {
      Object.assign(existing, entry);
    } else {
      panels.unshift(entry);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
      return entry;
    } catch (e) {
      console.error('PanelDB: localStorage plein ?', e);
      return null;
    }
  }

  function remove(id) {
    const panels = list().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
  }

  // ── MODAL GESTIONNAIRE ────────────────────────────────────────

  let _pickerPrefix = null; // null = mode gestionnaire seul, 'inp'/'sz'/'og2' = mode sélecteur

  function openManagerModal(prefix) {
    _pickerPrefix = prefix || null;
    _ensureModal();
    _renderManager();
    document.getElementById('panel-db-modal').style.display = 'flex';
  }

  function openLibraryModal(prefix) { openManagerModal(prefix); }

  function closeManagerModal() {
    const m = document.getElementById('panel-db-modal');
    if (m) m.style.display = 'none';
    _pickerPrefix = null;
  }

  function closeLibraryModal() { closeManagerModal(); }

  function _ensureModal() {
    if (document.getElementById('panel-db-modal')) return;
    const m = document.createElement('div');
    m.id = 'panel-db-modal';
    m.style.cssText = 'display:none;position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,0.72);align-items:center;justify-content:center';
    m.onclick = e => { if (e.target === m) closeManagerModal(); };
    document.body.appendChild(m);
  }

  function _renderManager(editingId) {
    const modal   = document.getElementById('panel-db-modal');
    const panels  = list();
    const editing = editingId ? getById(editingId) : null;
    const isPicker = !!_pickerPrefix;

    const techOptions = [
      ['mono','Monocristallin'],['poly','Polycristallin'],['bifacial','Bifacial'],
      ['half-cut','Half-cut'],['cis','CIS/CIGS'],['cpv','CPV'],['autre','Autre'],
    ].map(([v, l]) => `<option value="${v}"${(editing?.tech||'mono')===v?' selected':''}>${l}</option>`).join('');

    const listHTML = panels.length === 0
      ? `<div style="padding:24px;text-align:center;color:var(--color-text-muted);font-size:13px">Aucun panneau enregistré.<br>Cliquez sur <strong>+ Nouveau panneau</strong>.</div>`
      : panels.map(p => {
          const isEdit = p.id === editingId;
          const dims   = p.largeur && p.hauteur ? `${p.largeur}×${p.hauteur} m` : p.m2 ? `${p.m2} m²` : '';
          const rend   = p.rendement ? `${p.rendement}%` : '';
          return `
          <div style="padding:10px 12px;border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:8px;${isEdit?'background:var(--color-surface2)':''}">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.model)}</div>
              <div style="font-size:11px;color:var(--color-text-muted)">
                ${p.fabricant ? esc(p.fabricant)+' · ' : ''}${p.wp} Wc${dims?' · '+dims:''}${rend?' · '+rend:''}${p.prix?' · '+p.prix+' €':''}
              </div>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0">
              ${isPicker ? `<button class="btn btn-accent btn-sm" onclick="PanelDB._applyAndClose('${p.id}')" style="font-size:11px;padding:2px 8px">Utiliser</button>` : ''}
              <button class="btn btn-outline btn-sm" onclick="PanelDB._renderManager('${p.id}')" style="font-size:11px;padding:2px 8px" title="Modifier">✏️</button>
              <button class="btn btn-sm" data-del="${p.id}" onclick="PanelDB._confirmDelete('${p.id}')" style="font-size:11px;padding:2px 8px;background:var(--color-danger);color:#fff;border:none;border-radius:4px;cursor:pointer" title="Supprimer">✕</button>
            </div>
          </div>`;
        }).join('');

    const formHTML = `
      <form id="panel-db-form" onsubmit="PanelDB._submitForm(event)" autocomplete="off">
        <input type="hidden" id="pdb-id" value="${esc(editing?.id||'')}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="form-group" style="grid-column:1/-1">
            <label style="font-weight:600">Modèle <span style="color:var(--color-danger)">*</span></label>
            <input type="text" id="pdb-model" value="${esc(editing?.model||'')}" placeholder="ex : JA Solar JAM60S20-385MR" required style="font-size:13px">
          </div>
          <div class="form-group">
            <label>Fabricant</label>
            <input type="text" id="pdb-fabricant" value="${esc(editing?.fabricant||'')}" placeholder="JA Solar, Longi...">
          </div>
          <div class="form-group">
            <label>Technologie</label>
            <select id="pdb-tech">${techOptions}</select>
          </div>
          <div class="form-group">
            <label>Puissance <span style="color:var(--color-danger)">*</span></label>
            <div class="input-unit"><input type="number" id="pdb-wp" value="${editing?.wp||''}" min="1" step="1" required oninput="PanelDB._autoRendement()" placeholder="385"><span class="unit-tag">Wc</span></div>
          </div>
          <div class="form-group">
            <label>Prix unitaire</label>
            <div class="input-unit"><input type="number" id="pdb-prix" value="${editing?.prix||''}" min="0" step="0.01" placeholder="89.90"><span class="unit-tag">€ HT</span></div>
          </div>
          <div class="form-group">
            <label>Largeur</label>
            <div class="input-unit"><input type="number" id="pdb-largeur" value="${editing?.largeur||''}" min="0" step="0.001" placeholder="1.134" oninput="PanelDB._autoDims()"><span class="unit-tag">m</span></div>
          </div>
          <div class="form-group">
            <label>Hauteur</label>
            <div class="input-unit"><input type="number" id="pdb-hauteur" value="${editing?.hauteur||''}" min="0" step="0.001" placeholder="1.722" oninput="PanelDB._autoDims()"><span class="unit-tag">m</span></div>
          </div>
          <div class="form-group">
            <label>Surface</label>
            <div class="input-unit"><input type="number" id="pdb-m2" value="${editing?.m2||''}" min="0" step="0.0001" placeholder="Auto si L×H renseignés" oninput="PanelDB._autoRendement()"><span class="unit-tag">m²</span></div>
          </div>
          <div class="form-group">
            <label>Rendement</label>
            <div class="input-unit"><input type="number" id="pdb-rendement" value="${editing?.rendement||''}" min="0" step="0.1" placeholder="Auto calculé"><span class="unit-tag">%</span></div>
          </div>
          <div class="form-group">
            <label>Coef. temp. Pmax</label>
            <div class="input-unit"><input type="number" id="pdb-coef-temp" value="${editing?.coef_temp||''}" step="0.01" placeholder="-0.35"><span class="unit-tag">%/°C</span></div>
          </div>
          <div class="form-group">
            <label>Garantie puissance</label>
            <div class="input-unit"><input type="number" id="pdb-garantie" value="${editing?.garantie_p||''}" min="0" step="1" placeholder="25"><span class="unit-tag">ans</span></div>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Lien produit (URL)</label>
            <div style="display:flex;gap:6px">
              <input type="url" id="pdb-url" value="${esc(editing?.url||'')}" placeholder="https://..." style="flex:1;font-size:12px">
              ${editing?.url ? `<button type="button" class="btn btn-outline btn-sm" onclick="PanelDB._openLink('pdb-url')" style="white-space:nowrap">Ouvrir</button>` : ''}
            </div>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Fiche technique / Datasheet (URL ou chemin PDF)</label>
            <div style="display:flex;gap:6px">
              <input type="text" id="pdb-datasheet" value="${esc(editing?.datasheet||'')}" placeholder="https://... ou /home/user/docs/panneau.pdf" style="flex:1;font-size:12px">
              <button type="button" class="btn btn-outline btn-sm" onclick="PanelDB._browseFile()" style="white-space:nowrap">📂 Parcourir</button>
              ${editing?.datasheet ? `<button type="button" class="btn btn-outline btn-sm" onclick="PanelDB._openLink('pdb-datasheet')" style="white-space:nowrap">Ouvrir</button>` : ''}
            </div>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Notes</label>
            <textarea id="pdb-notes" rows="2" style="width:100%;resize:vertical;font-size:12px;font-family:inherit;border:1px solid var(--color-border);border-radius:6px;padding:6px;background:var(--color-bg);color:var(--color-text)">${esc(editing?.notes||'')}</textarea>
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
          ${editingId ? `<button type="button" class="btn btn-outline btn-sm" onclick="PanelDB._renderManager()" style="margin-right:auto">Annuler</button>` : ''}
          <button type="submit" class="btn btn-accent btn-sm">${editing ? 'Enregistrer les modifications' : '+ Ajouter ce panneau'}</button>
        </div>
      </form>`;

    modal.innerHTML = `
      <div style="background:var(--color-surface);border-radius:14px;box-shadow:0 12px 48px rgba(0,0,0,0.4);width:min(940px,96vw);max-height:90vh;display:flex;flex-direction:column;overflow:hidden">
        <!-- En-tête -->
        <div style="background:var(--color-primary);padding:16px 20px;color:#fff;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <span style="font-size:16px;font-weight:700">📋 Bibliothèque de panneaux${isPicker?' — Sélectionner un panneau':''}</span>
          <button onclick="PanelDB.closeManagerModal()" style="background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:18px;width:30px;height:30px;border-radius:50%;cursor:pointer;line-height:1">✕</button>
        </div>
        <!-- Corps : liste | formulaire -->
        <div style="display:grid;grid-template-columns:1fr 1fr;flex:1;min-height:0;overflow:hidden">
          <!-- Liste -->
          <div style="border-right:1px solid var(--color-border);display:flex;flex-direction:column;min-height:0">
            <div style="padding:10px 12px;border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
              <span style="font-size:12px;font-weight:600;color:var(--color-text-muted)">${panels.length} panneau${panels.length>1?'x':''} enregistré${panels.length>1?'s':''}</span>
              <button class="btn btn-outline btn-sm" onclick="PanelDB._renderManager(null)" style="font-size:11px">+ Nouveau panneau</button>
            </div>
            <div style="overflow-y:auto;flex:1">${listHTML}</div>
          </div>
          <!-- Formulaire -->
          <div style="overflow-y:auto;padding:16px">
            <div style="font-size:13px;font-weight:600;color:var(--color-primary);margin-bottom:12px">${editing ? 'Modifier : '+esc(editing.model) : 'Nouveau panneau'}</div>
            ${formHTML}
          </div>
        </div>
      </div>`;
  }

  function _autoDims() {
    const l  = parseFloat(document.getElementById('pdb-largeur')?.value);
    const h  = parseFloat(document.getElementById('pdb-hauteur')?.value);
    const m2El = document.getElementById('pdb-m2');
    if (!isNaN(l) && !isNaN(h) && l > 0 && h > 0 && m2El) {
      m2El.value = (l * h).toFixed(4);
      _autoRendement();
    }
  }

  function _autoRendement() {
    const wp = parseFloat(document.getElementById('pdb-wp')?.value);
    const m2 = parseFloat(document.getElementById('pdb-m2')?.value);
    const rEl = document.getElementById('pdb-rendement');
    if (!isNaN(wp) && !isNaN(m2) && m2 > 0 && rEl) {
      rEl.value = (wp / (m2 * 1000) * 100).toFixed(1);
    }
  }

  function _submitForm(event) {
    event.preventDefault();
    const data = {
      id:         document.getElementById('pdb-id')?.value || null,
      model:      document.getElementById('pdb-model')?.value,
      fabricant:  document.getElementById('pdb-fabricant')?.value,
      wp:         document.getElementById('pdb-wp')?.value,
      largeur:    document.getElementById('pdb-largeur')?.value,
      hauteur:    document.getElementById('pdb-hauteur')?.value,
      m2:         document.getElementById('pdb-m2')?.value,
      tech:       document.getElementById('pdb-tech')?.value,
      rendement:  document.getElementById('pdb-rendement')?.value,
      coef_temp:  document.getElementById('pdb-coef-temp')?.value,
      prix:       document.getElementById('pdb-prix')?.value,
      garantie_p: document.getElementById('pdb-garantie')?.value,
      url:        document.getElementById('pdb-url')?.value,
      datasheet:  document.getElementById('pdb-datasheet')?.value,
      notes:      document.getElementById('pdb-notes')?.value,
    };
    const saved = savePanel(data);
    if (!saved) {
      if (typeof showToast === 'function') showToast('Modèle et puissance requis.', 'error');
      return;
    }
    if (typeof showToast === 'function') showToast(`Panneau "${saved.model}" enregistré`);
    _renderManager(); // retour à la liste, formulaire vierge
  }

  function _confirmDelete(id) {
    const p = getById(id);
    if (!p) return;
    const btn = document.querySelector(`[data-del="${id}"]`);
    if (!btn) return;
    const container = btn.parentElement;
    container.innerHTML = `
      <span style="font-size:11px;color:var(--color-danger);white-space:nowrap;align-self:center">Supprimer ?</span>
      <button class="btn btn-sm" onclick="PanelDB._deleteConfirmed('${id}')" style="font-size:11px;padding:2px 8px;background:var(--color-danger);color:#fff;border:none;border-radius:4px;cursor:pointer">Oui</button>
      <button class="btn btn-outline btn-sm" onclick="PanelDB._renderManager()" style="font-size:11px;padding:2px 8px">Non</button>`;
  }

  function _deleteConfirmed(id) {
    remove(id);
    _renderManager();
    if (typeof showToast === 'function') showToast('Panneau supprimé');
  }

  function _applyAndClose(id) {
    applyPanel(id, _pickerPrefix);
    closeManagerModal();
  }

  function _openLink(inputId) {
    const url = document.getElementById(inputId)?.value?.trim();
    if (!url) return;
    // Electron : shell.openExternal via IPC — sinon window.open
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }

  async function _browseFile() {
    if (window.electronAPI?.openFileDialog) {
      const filePath = await window.electronAPI.openFileDialog();
      if (filePath) {
        const el = document.getElementById('pdb-datasheet');
        if (el) el.value = filePath;
      }
    } else {
      if (typeof showToast === 'function') showToast('Parcourir disponible uniquement dans l\'application Electron.', 'error');
    }
  }

  // ── APPLIQUER UN PANNEAU AUX CHAMPS FORMULAIRE ────────────────

  function applyPanel(id, prefix) {
    const panel = getById(id);
    if (!panel || !prefix) return;

    const set = (field, val) => {
      const el = document.getElementById(`${prefix}-${field}`);
      if (el && val != null) { el.value = val; el.dispatchEvent(new Event('input')); }
    };
    set('panel-model', panel.model);
    set('panel-wp',    panel.wp);
    set('panel-m2',    panel.m2);
    syncModelToQuote(panel.model);
    if (typeof showToast === 'function') showToast(`Panneau "${panel.model}" chargé`);
  }

  function saveFromForm(prefix) {
    const g = id => document.getElementById(`${prefix}-${id}`)?.value;
    const model = (g('panel-model') || '').trim();
    const wp    = parseFloat(g('panel-wp'));
    const m2    = parseFloat(g('panel-m2'));
    if (!model) { showToast?.('Saisissez un nom de modèle avant d\'enregistrer.', 'error'); return; }
    if (isNaN(wp) || wp <= 0) { showToast?.('Saisissez une puissance Wc valide.', 'error'); return; }
    if (isNaN(m2) || m2 <= 0) { showToast?.('Saisissez une surface panneau valide.', 'error'); return; }
    const saved = savePanel({ model, wp, m2 });
    if (saved) { syncModelToQuote(model); showToast?.(`Panneau "${model}" enregistré dans la bibliothèque`); }
    else         showToast?.('Erreur lors de l\'enregistrement.', 'error');
  }

  function syncModelToQuote(model) {
    const el = document.getElementById('dv-sys-panel-model');
    if (el && !el.value) el.value = model;
  }

  function removePanel(id, prefix) {
    remove(id);
    openLibraryModal(prefix);
    showToast?.('Panneau supprimé');
  }

  // ── EXPORT PUBLIC ──────────────────────────────────────────────
  return {
    list, getById, save: savePanel, remove,
    openLibraryModal, closeLibraryModal,
    openManagerModal, closeManagerModal,
    applyPanel, saveFromForm, removePanel, syncModelToQuote,
    // Internals exposés pour les onclick inline
    _renderManager, _autoDims, _autoRendement,
    _submitForm, _confirmDelete, _deleteConfirmed, _applyAndClose,
    _openLink, _browseFile,
  };

})();

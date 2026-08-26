/**
 * panel_db.js - Bibliothèque de panneaux solaires (globale, partagée entre projets)
 * Stockage : localStorage, clé ose_panels_v1
 * Schéma panneau : { id, model, fabricant, wp, largeur, hauteur, m2, tech,
 *                    rendement, coef_temp, voc, isc, vmp, imp, bifacial,
 *                    prix, garantie_p, url, datasheet, notes, savedAt }
 * Champs électriques STC (voc/isc/vmp/imp) : optionnels, utilisés pour le
 * calcul de chaînage (stringing) avec les onduleurs — cf. InverterSizing.calcStringing.
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

  /** Entrées utilisateur uniquement (localStorage). */
  function listUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      // Ne plus stocker de copies Rexel (catalogue en mémoire)
      return list.filter(p => !(p.id || '').startsWith('rexel_panel_') && p.source !== 'rexel');
    } catch { return []; }
  }

  /** Catalogue Rexel (mémoire) + panneaux personnalisés. */
  function list() {
    const catalog = (typeof RexelCatalog !== 'undefined' && RexelCatalog.getPanels)
      ? RexelCatalog.getPanels() : [];
    const user = listUser();
    return catalog.concat(user).sort((a, b) => {
      // Personnalisés d’abord, puis par Wc décroissant, puis nom
      const au = (a.id || '').startsWith('rexel_') ? 1 : 0;
      const bu = (b.id || '').startsWith('rexel_') ? 1 : 0;
      if (au !== bu) return au - bu;
      if ((b.wp || 0) !== (a.wp || 0)) return (b.wp || 0) - (a.wp || 0);
      return String(a.model || '').localeCompare(String(b.model || ''), 'fr');
    });
  }

  function getById(id) {
    if (!id) return null;
    if (typeof RexelCatalog !== 'undefined' && RexelCatalog.getPanelById) {
      const c = RexelCatalog.getPanelById(id);
      if (c) return c;
    }
    return listUser().find(p => p.id === id) || null;
  }

  function savePanel(data) {
    const model = (data.model || '').trim();
    const wp    = parseFloat(data.wp);
    if (!model || isNaN(wp) || wp <= 0) return null;

    const largeur = parseFloat(data.largeur) || null;
    const hauteur = parseFloat(data.hauteur) || null;
    const m2computed = calcM2(largeur, hauteur);
    const m2 = m2computed || parseFloat(data.m2) || null;

    // Édition d’une entrée catalogue → copie utilisateur
    let id = data.id;
    if (id && String(id).startsWith('rexel_panel_'))
      id = 'panel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    const panels   = listUser();
    const existing = id ? panels.find(p => p.id === id) : null;
    const entry = {
      id:         existing ? existing.id : (id || ('panel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6))),
      model,
      fabricant:  (data.fabricant || '').trim(),
      wp,
      largeur,
      hauteur,
      m2,
      tech:       data.tech || 'mono',
      rendement:  calcRendement(wp, m2) || parseFloat(data.rendement) || null,
      coef_temp:  parseFloat(data.coef_temp) || null,
      voc:        parseFloat(data.voc) || null,
      isc:        parseFloat(data.isc) || null,
      vmp:        parseFloat(data.vmp) || null,
      imp:        parseFloat(data.imp) || null,
      bifacial:   !!data.bifacial,
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
    if ((id || '').startsWith('rexel_panel_')) {
      if (typeof showToast === 'function')
        showToast('Les panneaux du catalogue Rexel ne peuvent pas être supprimés.', 'warning');
      return;
    }
    const panels = listUser().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
  }

  function _matchPanel(p, q) {
    if (!q) return true;
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hay = [
      p.model, p.fabricant, p.tech, p.notes, p.sku,
      p.wp != null ? String(p.wp) : '',
      p.wp != null ? (p.wp + 'wc') : '',
      p.bifacial ? 'bifacial' : '',
      p.source || '',
    ].join(' ').toLowerCase();
    return tokens.every(t => hay.includes(t));
  }

  // ── MODAL GESTIONNAIRE ────────────────────────────────────────

  let _pickerPrefix = null; // null = mode gestionnaire seul, 'inp'/'sz'/'og2' = mode sélecteur
  let _hubMode = false; // true = ouvert depuis le hub « 📚 Matériel » (affiche les onglets Panneaux|Onduleurs)

  function openManagerModal(prefix, opts) {
    _pickerPrefix = prefix || null;
    _hubMode = !!(opts && opts.hub);
    _searchQuery = '';
    _ensureModal();
    _renderManager();
    document.getElementById('panel-db-modal').style.display = 'flex';
    if (typeof RexelCatalog !== 'undefined' && RexelCatalog.ensureLoaded) {
      RexelCatalog.ensureLoaded().then(() => {
        const m = document.getElementById('panel-db-modal');
        if (m && m.style.display === 'flex') _renderManager();
      }).catch(() => {});
    }
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
    m.style.cssText = 'display:none;position:fixed;inset:0;z-index:11050;background:rgba(0,0,0,0.72);align-items:center;justify-content:center';
    m.onclick = e => { if (e.target === m) closeManagerModal(); };
    document.body.appendChild(m);
  }

  let _searchQuery = '';

  function _renderManager(editingId) {
    const modal   = document.getElementById('panel-db-modal');
    if (!modal) return;
    const allPanels = list();
    const q = _searchQuery.trim();
    const panels = q
      ? allPanels.filter(p => _matchPanel(p, q))
      : allPanels;
    const editing = editingId ? getById(editingId) : null;
    const isPicker = !!_pickerPrefix;
    const nCat = allPanels.filter(p => (p.id || '').startsWith('rexel_')).length;
    const nUser = allPanels.length - nCat;

    const techOptions = [
      ['mono','Monocristallin'],['poly','Polycristallin'],['bifacial','Bifacial'],
      ['half-cut','Half-cut'],['cis','CIS/CIGS'],['cpv','CPV'],['autre','Autre'],
    ].map(([v, l]) => `<option value="${v}"${(editing?.tech||'mono')===v?' selected':''}>${l}</option>`).join('');

    const listHTML = panels.length === 0
      ? `<div style="padding:24px;text-align:center;color:var(--color-text-muted);font-size:13px">${q ? 'Aucun résultat pour cette recherche.' : 'Aucun panneau enregistré.<br>Cliquez sur <strong>+ Nouveau panneau</strong>.'}</div>`
      : panels.map(p => {
          const isEdit = p.id === editingId;
          const dims   = p.largeur && p.hauteur ? `${p.largeur}×${p.hauteur} m` : p.m2 ? `${p.m2} m²` : '';
          const rend   = p.rendement ? `${p.rendement}%` : '';
          const elec   = (p.voc && p.isc) ? `Voc ${p.voc}V / Isc ${p.isc}A` : '';
          return `
          <div style="padding:10px 12px;border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:8px;${isEdit?'background:var(--color-surface2)':''}">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.model)}${p.bifacial ? ' <span style="font-size:9px;background:var(--color-accent);color:#fff;padding:1px 5px;border-radius:3px;font-weight:600">BIFACIAL</span>' : ''}${(p.id||'').startsWith('rexel_') ? ' <span style="font-size:9px;background:var(--color-surface2);color:var(--color-text-muted);padding:1px 5px;border-radius:3px">Rexel</span>' : ''}</div>
              <div style="font-size:11px;color:var(--color-text-muted)">
                ${p.fabricant ? esc(p.fabricant)+' · ' : ''}${p.wp} Wc${dims?' · '+dims:''}${rend?' · '+rend:''}${p.prix?' · '+p.prix+' €':''}${elec?' · '+elec:''}
              </div>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0">
              ${isPicker ? `<button class="btn btn-accent btn-sm" onclick="PanelDB._applyAndClose('${p.id}')" style="font-size:11px;padding:2px 8px">Utiliser</button>` : ''}
              ${p.datasheet ? `<button class="btn btn-outline btn-sm" onclick="PanelDB._openDatasheet('${p.id}')" style="font-size:11px;padding:2px 8px" title="Fiche PDF">📄</button>` : ''}
              <button class="btn btn-outline btn-sm" onclick="PanelDB._renderManager('${p.id}')" style="font-size:11px;padding:2px 8px" title="${(p.id||'').startsWith('rexel_')?'Copier / adapter':'Modifier'}">✏️</button>
              ${(p.id||'').startsWith('rexel_') ? '' : `<button class="btn btn-sm" data-del="${p.id}" onclick="PanelDB._confirmDelete('${p.id}')" style="font-size:11px;padding:2px 8px;background:var(--color-danger);color:#fff;border:none;border-radius:4px;cursor:pointer" title="Supprimer">✕</button>`}
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
          <div style="grid-column:1/-1;font-size:12px;font-weight:700;color:var(--color-primary);margin-top:6px;padding-top:6px;border-top:1px dashed var(--color-border)">
            ⚡ Caractéristiques électriques STC <span style="font-weight:400;color:var(--color-text-muted)">(pour le calcul de chaînage onduleur)</span>
          </div>
          <div class="form-group">
            <label>Voc (circuit ouvert)</label>
            <div class="input-unit"><input type="number" id="pdb-voc" value="${editing?.voc||''}" min="0" step="0.01" placeholder="41.9"><span class="unit-tag">V</span></div>
          </div>
          <div class="form-group">
            <label>Isc (court-circuit)</label>
            <div class="input-unit"><input type="number" id="pdb-isc" value="${editing?.isc||''}" min="0" step="0.01" placeholder="13.3"><span class="unit-tag">A</span></div>
          </div>
          <div class="form-group">
            <label>Vmp (tension puissance max)</label>
            <div class="input-unit"><input type="number" id="pdb-vmp" value="${editing?.vmp||''}" min="0" step="0.01" placeholder="34.9"><span class="unit-tag">V</span></div>
          </div>
          <div class="form-group">
            <label>Imp (courant puissance max)</label>
            <div class="input-unit"><input type="number" id="pdb-imp" value="${editing?.imp||''}" min="0" step="0.01" placeholder="12.3"><span class="unit-tag">A</span></div>
          </div>
          <div class="checkbox-row" style="grid-column:1/-1">
            <input type="checkbox" id="pdb-bifacial" ${editing?.bifacial?'checked':''}>
            <label for="pdb-bifacial">Panneau bifacial (gain de production face arrière)</label>
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
              ${editing?.datasheet ? `<button type="button" class="btn btn-outline btn-sm" onclick="PanelDB._openLink('pdb-datasheet')" style="white-space:nowrap">📄 Visionneuse PDF</button>` : ''}
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

    const tabBarHTML = _hubMode ? `
      <div style="display:flex;gap:6px">
        <button style="background:rgba(255,255,255,0.25);border:none;color:#fff;font-size:12px;font-weight:700;padding:6px 12px;border-radius:6px;cursor:default">📋 Panneaux</button>
        <button onclick="PanelDB.closeManagerModal();InverterDB.openManagerModal('${_pickerPrefix||''}',{hub:true})" style="background:rgba(255,255,255,0.08);border:none;color:#fff;font-size:12px;font-weight:600;padding:6px 12px;border-radius:6px;cursor:pointer">🔌 Onduleurs</button>
      </div>` : `<span style="font-size:16px;font-weight:700">📋 Bibliothèque de panneaux${isPicker?' — Sélectionner un panneau':''}</span>`;

    modal.innerHTML = `
      <div class="ose-lib-shell">
        <div class="ose-lib-head">
          ${tabBarHTML}
          <button type="button" class="ose-lib-close" onclick="PanelDB.closeManagerModal()" aria-label="Fermer">✕</button>
        </div>
        <div class="ose-lib-body">
          <div class="ose-lib-list-pane">
            <div class="ose-lib-list-toolbar">
              <span class="ose-lib-count">${panels.length}${q ? ' / ' + allPanels.length : ''} panneau${allPanels.length>1?'x':''}${nCat ? ` · ${nCat} Rexel` : ''}${nUser ? ` · ${nUser} perso` : ''}</span>
              <div style="display:flex;gap:4px;flex-wrap:wrap">
                <button class="btn btn-outline btn-sm" onclick="PanelDB._renderManager(null)" style="font-size:11px;white-space:nowrap">+ Nouveau</button>
              </div>
            </div>
            <div class="ose-lib-search">
              <input type="search" placeholder="🔎 Filtrer : modèle, marque, Wc, bifacial…" value="${esc(_searchQuery)}" oninput="PanelDB._search(this.value)" autocomplete="off">
            </div>
            <div class="ose-lib-list">${listHTML}</div>
          </div>
          <div class="ose-lib-form-pane">
            <div class="ose-lib-form-title">${editing ? 'Modifier : '+esc(editing.model) : 'Nouveau panneau'}</div>
            ${formHTML}
          </div>
        </div>
      </div>`;
  }

  function _search(q) {
    _searchQuery = q || '';
    const active = document.activeElement;
    const wasSearch = active && active.getAttribute('oninput') === 'PanelDB._search(this.value)';
    const selStart = wasSearch ? active.selectionStart : null;
    const selEnd = wasSearch ? active.selectionEnd : null;
    _renderManager();
    if (wasSearch) {
      const inp = document.querySelector('#panel-db-modal input[type="search"]');
      if (inp) {
        inp.focus();
        try { inp.setSelectionRange(selStart, selEnd); } catch (_) {}
      }
    }
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
      voc:        document.getElementById('pdb-voc')?.value,
      isc:        document.getElementById('pdb-isc')?.value,
      vmp:        document.getElementById('pdb-vmp')?.value,
      imp:        document.getElementById('pdb-imp')?.value,
      bifacial:   document.getElementById('pdb-bifacial')?.checked,
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
    if (inputId === 'pdb-datasheet' && typeof Datasheet !== 'undefined') {
      Datasheet.open(url, { filename: (getById(document.getElementById('pdb-id')?.value)?.model || 'fiche') + '.pdf' });
      return;
    }
    const bridge = typeof getNativeBridge === 'function' ? getNativeBridge() : null;
    if (bridge?.openExternal) {
      bridge.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }

  function _openDatasheet(id) {
    const p = getById(id);
    if (!p?.datasheet) {
      if (typeof showToast === 'function') showToast('Pas de fiche PDF pour ce panneau.', 'warning');
      return;
    }
    if (typeof Datasheet !== 'undefined') {
      Datasheet.open(p.datasheet, { filename: (p.model || 'panneau').replace(/[^\w.\-]+/g, '_') + '.pdf' });
    } else {
      _openLink('pdb-datasheet');
    }
  }

  async function _browseFile() {
    const bridge = typeof getNativeBridge === 'function' ? getNativeBridge() : null;
    if (bridge?.openFileDialog) {
      const filePath = await bridge.openFileDialog();
      if (filePath) {
        const el = document.getElementById('pdb-datasheet');
        if (el) el.value = filePath;
      }
    } else {
      if (typeof showToast === 'function')
        showToast('Parcourir disponible uniquement dans l\'application Qt (desktop).', 'error');
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
    const setChk = (field, val) => {
      const el = document.getElementById(`${prefix}-${field}`);
      if (el && el.type === 'checkbox') { el.checked = !!val; el.dispatchEvent(new Event('change')); }
    };
    set('panel-model', panel.model);
    set('panel-wp',    panel.wp);
    set('panel-m2',    panel.m2);
    // Champs électriques STC — remplis seulement si présents dans le formulaire cible
    if (panel.voc != null) set('panel-voc', panel.voc);
    if (panel.isc != null) set('panel-isc', panel.isc);
    if (panel.vmp != null) set('panel-vmp', panel.vmp);
    if (panel.imp != null) set('panel-imp', panel.imp);
    setChk('panel-bifacial', panel.bifacial);
    markFromLibrary(prefix, true);
    syncModelToQuote(panel.model);
    if (typeof showToast === 'function') showToast(`Panneau "${panel.model}" chargé`);
  }

  /** Marque Wp/m² comme issus de la bibliothèque → masque Auto Wc (hors-réseau). */
  function markFromLibrary(prefix, fromLib) {
    const wp = document.getElementById(`${prefix}-panel-wp`);
    const m2 = document.getElementById(`${prefix}-panel-m2`);
    const model = document.getElementById(`${prefix}-panel-model`);
    [wp, m2, model].forEach(el => {
      if (!el) return;
      if (fromLib) el.dataset.fromLibrary = '1';
      else delete el.dataset.fromLibrary;
    });
    syncLibraryWpAutoUI(prefix);
  }

  function isFromLibrary(prefix) {
    const wp = document.getElementById(`${prefix}-panel-wp`);
    return !!(wp && wp.dataset.fromLibrary === '1');
  }

  function syncLibraryWpAutoUI(prefix) {
    const fromLib = isFromLibrary(prefix);
    const autoBtn = document.getElementById(`${prefix}-panel-wp-auto`);
    const hint = document.getElementById(`${prefix}-panel-wp-lib-hint`);
    if (autoBtn) autoBtn.style.display = fromLib ? 'none' : '';
    if (hint) hint.style.display = fromLib ? '' : 'none';
    // Si l’utilisateur modifie manuellement le modèle / Wc, lever le verrou
    const model = document.getElementById(`${prefix}-panel-model`);
    const wp = document.getElementById(`${prefix}-panel-wp`);
    if (model && !model._oseLibListen) {
      model._oseLibListen = true;
      model.addEventListener('input', () => {
        if (model.dataset.fromLibrary === '1') markFromLibrary(prefix, false);
      });
    }
    if (wp && !wp._oseLibListen) {
      wp._oseLibListen = true;
      wp.addEventListener('input', () => {
        // Ne pas lever au premier set programmatique ; seulement si déjà fromLib et user tape
        if (wp.dataset.fromLibrary === '1' && document.activeElement === wp)
          markFromLibrary(prefix, false);
      });
    }
  }

  /** Si modèle+Wc correspondent à un panneau bibliothèque, verrouille Auto Wc. */
  function syncFromLibraryIfMatch(prefix) {
    const model = (document.getElementById(`${prefix}-panel-model`)?.value || '').trim();
    const wp = parseFloat(document.getElementById(`${prefix}-panel-wp`)?.value);
    if (!model || isNaN(wp)) {
      syncLibraryWpAutoUI(prefix);
      return false;
    }
    const hit = list().find(p => p.model === model && Number(p.wp) === Number(wp));
    if (hit) {
      markFromLibrary(prefix, true);
      return true;
    }
    syncLibraryWpAutoUI(prefix);
    return false;
  }

  function saveFromForm(prefix) {
    const g = id => document.getElementById(`${prefix}-${id}`)?.value;
    const gChk = id => document.getElementById(`${prefix}-${id}`)?.checked;
    const model = (g('panel-model') || '').trim();
    const wp    = parseFloat(g('panel-wp'));
    const m2    = parseFloat(g('panel-m2'));
    if (!model) { showToast?.('Saisissez un nom de modèle avant d\'enregistrer.', 'error'); return; }
    if (isNaN(wp) || wp <= 0) { showToast?.('Saisissez une puissance Wc valide.', 'error'); return; }
    if (isNaN(m2) || m2 <= 0) { showToast?.('Saisissez une surface panneau valide.', 'error'); return; }
    const saved = savePanel({
      model, wp, m2,
      voc: g('panel-voc'), isc: g('panel-isc'), vmp: g('panel-vmp'), imp: g('panel-imp'),
      bifacial: gChk('panel-bifacial'),
    });
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

  /**
   * Bloc HTML repliable "Caractéristiques électriques STC" (Voc/Isc/Vmp/Imp/bifacial)
   * à insérer dans un formulaire d'onglet (sz/og2/inp...). Optionnel — sert au
   * chaînage onduleur (InverterSizing.calcStringing) quand renseigné.
   */
  function electricalFieldsHTML(prefix) {
    return `
      <details style="margin-bottom:10px">
        <summary style="cursor:pointer;font-size:11px;font-weight:600;color:var(--color-text-muted)">⚡ Caractéristiques électriques STC (optionnel — chaînage onduleur)</summary>
        <div class="params-grid" style="margin-top:6px">
          <div class="form-group">
            <label for="${prefix}-panel-voc">Voc</label>
            <div class="input-unit"><input type="number" id="${prefix}-panel-voc" step="0.01" min="0" placeholder="41.9"><span class="unit-tag">V</span></div>
          </div>
          <div class="form-group">
            <label for="${prefix}-panel-isc">Isc</label>
            <div class="input-unit"><input type="number" id="${prefix}-panel-isc" step="0.01" min="0" placeholder="13.3"><span class="unit-tag">A</span></div>
          </div>
          <div class="form-group">
            <label for="${prefix}-panel-vmp">Vmp</label>
            <div class="input-unit"><input type="number" id="${prefix}-panel-vmp" step="0.01" min="0" placeholder="34.9"><span class="unit-tag">V</span></div>
          </div>
          <div class="form-group">
            <label for="${prefix}-panel-imp">Imp</label>
            <div class="input-unit"><input type="number" id="${prefix}-panel-imp" step="0.01" min="0" placeholder="12.3"><span class="unit-tag">A</span></div>
          </div>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="${prefix}-panel-bifacial">
          <label for="${prefix}-panel-bifacial">Panneau bifacial</label>
        </div>
      </details>`;
  }

  // ── EXPORT PUBLIC ──────────────────────────────────────────────
  return {
    list, getById, save: savePanel, remove,
    openLibraryModal, closeLibraryModal,
    openManagerModal, closeManagerModal,
    applyPanel, saveFromForm, removePanel, syncModelToQuote, electricalFieldsHTML,
    markFromLibrary, isFromLibrary, syncLibraryWpAutoUI, syncFromLibraryIfMatch,
    // Internals exposés pour les onclick inline
    _renderManager, _autoDims, _autoRendement, _search,
    _submitForm, _confirmDelete, _deleteConfirmed, _applyAndClose,
    _openLink, _browseFile, _openDatasheet,
  };

})();

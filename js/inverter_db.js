/**
 * inverter_db.js - Bibliothèque d'onduleurs (globale, partagée entre projets)
 * Stockage : localStorage, clé ose_inverters_v1
 * Schéma onduleur : { id, brand, model, type ('string'|'hybrid'|'micro'), phase (1|3),
 *                     pnom (kW, puissance nominale AC — ou puissance unitaire pour micro),
 *                     nMppt, maxMpptCurrent, maxVocInput, maxBattV, maxChargeCurrent,
 *                     efficiency (0-1), prix, garantie_p, url, datasheet, notes,
 *                     seeded (bool — vient du catalogue par défaut), savedAt }
 *
 * Au premier lancement, la bibliothèque est pré-remplie (« seed ») à partir du
 * catalogue simplifié InverterSizing.CATALOG (un modèle par taille disponible).
 * InverterDB.recommend() délègue à InverterSizing.recommend() en fusionnant les
 * onduleurs personnalisés (non « seeded ») ajoutés par l'installateur.
 *
 * Dépend de : inverter_sizing.js (catalogue + algorithme de recommandation)
 */

const InverterDB = (() => {

  const STORAGE_KEY = 'ose_inverters_v1';
  const SEED_FLAG_KEY = 'ose_inverters_seeded_v1';

  // ── HELPERS ───────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── CRUD ──────────────────────────────────────────────────────

  function list() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)) : [];
    } catch { return []; }
  }

  function getById(id) {
    return list().find(i => i.id === id) || null;
  }

  function saveInverter(data) {
    const brand = (data.brand || '').trim();
    const model = (data.model || '').trim();
    if (!brand && !model) return null;

    const inverters = list();
    const existing = data.id ? inverters.find(i => i.id === data.id) : null;
    const entry = {
      id:              existing ? existing.id : 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      brand,
      model,
      type:            data.type || 'string',
      phase:           parseInt(data.phase) || 1,
      pnom:            parseFloat(data.pnom) || null,
      nMppt:           parseInt(data.nMppt) || null,
      maxMpptCurrent:  parseFloat(data.maxMpptCurrent) || null,
      maxVocInput:     parseFloat(data.maxVocInput) || null,
      maxBattV:        parseFloat(data.maxBattV) || null,
      maxChargeCurrent: parseFloat(data.maxChargeCurrent) || null,
      efficiency:      data.efficiency != null && data.efficiency !== '' ? parseFloat(data.efficiency) / (parseFloat(data.efficiency) > 1 ? 100 : 1) : null,
      prix:            parseFloat(data.prix) || null,
      garantie_p:      parseInt(data.garantie_p) || null,
      url:             (data.url || '').trim(),
      datasheet:       (data.datasheet || '').trim(),
      notes:           (data.notes || '').trim(),
      seeded:          existing ? !!existing.seeded : !!data.seeded,
      savedAt:         new Date().toISOString(),
    };

    if (existing) {
      Object.assign(existing, entry);
    } else {
      inverters.unshift(entry);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inverters));
      return entry;
    } catch (e) {
      console.error('InverterDB: localStorage plein ?', e);
      return null;
    }
  }

  function remove(id) {
    const inverters = list().filter(i => i.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inverters));
  }

  // ── SEED DEPUIS LE CATALOGUE INTÉGRÉ ────────────────────────────

  function seedFromCatalog() {
    try {
      if (localStorage.getItem(SEED_FLAG_KEY)) return;
    } catch { /* localStorage indisponible */ }
    if (typeof InverterSizing === 'undefined' || !Array.isArray(InverterSizing.CATALOG)) return;
    if (list().length > 0) { _markSeeded(); return; } // bibliothèque déjà peuplée (ex. import) — ne pas dupliquer

    const seeded = [];
    InverterSizing.CATALOG.forEach(fam => {
      if (fam.type === 'micro') {
        seeded.push({
          id: 'inv_seed_' + fam.id,
          brand: fam.brand, model: fam.model, type: 'micro', phase: fam.phase || 1,
          pnom: fam.nominalPower, nMppt: null, maxMpptCurrent: null, maxVocInput: null,
          maxBattV: null, maxChargeCurrent: null,
          efficiency: fam.efficiency || null, prix: fam.pricePerUnit || null,
          garantie_p: null, url: '', datasheet: '',
          notes: `Micro-onduleur — panneaux ${fam.panelPowerRange?.[0]}-${fam.panelPowerRange?.[1]} Wc — prix par unité`,
          seeded: true, savedAt: new Date().toISOString(),
        });
      } else {
        (fam.sizes || []).forEach(size => {
          seeded.push({
            id: 'inv_seed_' + fam.id + '_' + size,
            brand: fam.brand, model: `${fam.model} ${size}`, type: fam.type, phase: fam.phase || 1,
            pnom: size, nMppt: fam.nMppt || null, maxMpptCurrent: fam.maxMpptCurrent || null,
            maxVocInput: fam.maxVocInput || null, maxBattV: fam.maxBattV || null,
            maxChargeCurrent: fam.maxChargeCurrent || null,
            efficiency: fam.efficiency || null, prix: Math.round(size * (fam.pricePerKw || 300)),
            garantie_p: null, url: '', datasheet: '',
            notes: (fam.features || []).join(', ') || 'Catalogue par défaut',
            seeded: true, savedAt: new Date().toISOString(),
          });
        });
      }
    });

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      _markSeeded();
    } catch (e) {
      console.error('InverterDB: seed impossible', e);
    }
  }

  function _markSeeded() {
    try { localStorage.setItem(SEED_FLAG_KEY, '1'); } catch { /* ignore */ }
  }

  // ── FUSION AVEC LE MOTEUR DE RECOMMANDATION ────────────────────

  function _toFamilyShape(entry) {
    if (entry.type === 'micro') {
      return {
        id: entry.id, brand: entry.brand, model: entry.model, type: 'micro', phase: 1,
        panelPowerRange: [100, 600], nominalPower: entry.pnom || 0.35,
        features: entry.notes ? [entry.notes] : ['personnalisé'],
        pricePerUnit: entry.prix || 150, efficiency: entry.efficiency || 0.97,
      };
    }
    const size = entry.pnom || 3;
    return {
      id: entry.id, brand: entry.brand, model: entry.model, type: entry.type, phase: entry.phase || 1,
      sizes: [size], maxPvRatio: 1.6, minPvRatio: 0.6,
      nMppt: entry.nMppt || 2, maxMpptCurrent: entry.maxMpptCurrent || 15,
      maxVocInput: entry.maxVocInput || 1000,
      maxBattV: entry.maxBattV, maxChargeCurrent: entry.maxChargeCurrent,
      features: entry.notes ? [entry.notes] : ['personnalisé'],
      pricePerKw: entry.prix && size ? Math.round(entry.prix / size) : 300,
      efficiency: entry.efficiency || 0.97,
    };
  }

  /** Recommandation fusionnant le catalogue intégré et les onduleurs personnalisés (non « seeded »). */
  function recommend(params) {
    if (typeof InverterSizing === 'undefined') return [];
    seedFromCatalog();
    const custom = list().filter(i => !i.seeded && i.pnom).map(_toFamilyShape);
    return InverterSizing.recommend({ ...params, extraCatalog: custom });
  }

  // ── MODAL GESTIONNAIRE ────────────────────────────────────────

  let _pickerPrefix = null;
  let _hubMode = false;
  let _searchQuery = '';

  function openManagerModal(prefix, opts) {
    seedFromCatalog();
    _pickerPrefix = prefix || null;
    _hubMode = !!(opts && opts.hub);
    _searchQuery = '';
    _ensureModal();
    _renderManager();
    document.getElementById('inverter-db-modal').style.display = 'flex';
  }

  function openLibraryModal(prefix) { openManagerModal(prefix); }

  function closeManagerModal() {
    const m = document.getElementById('inverter-db-modal');
    if (m) m.style.display = 'none';
    _pickerPrefix = null;
  }

  function closeLibraryModal() { closeManagerModal(); }

  function _ensureModal() {
    if (document.getElementById('inverter-db-modal')) return;
    const m = document.createElement('div');
    m.id = 'inverter-db-modal';
    m.style.cssText = 'display:none;position:fixed;inset:0;z-index:11050;background:rgba(0,0,0,0.72);align-items:center;justify-content:center';
    m.onclick = e => { if (e.target === m) closeManagerModal(); };
    document.body.appendChild(m);
  }

  const TYPE_LABEL = { string: 'String', hybrid: 'Hybride', micro: 'Micro' };
  const TYPE_ICON  = { string: '⚡', hybrid: '🔋', micro: '🔲' };

  function _renderManager(editingId) {
    const modal = document.getElementById('inverter-db-modal');
    const allInverters = list();
    const q = _searchQuery.trim().toLowerCase();
    const inverters = q
      ? allInverters.filter(i => `${i.brand} ${i.model}`.toLowerCase().includes(q))
      : allInverters;
    const editing = editingId ? getById(editingId) : null;
    const isPicker = !!_pickerPrefix;

    const typeOptions = [['string','String (réseau)'],['hybrid','Hybride (batterie)'],['micro','Micro-onduleur']]
      .map(([v, l]) => `<option value="${v}"${(editing?.type||'string')===v?' selected':''}>${l}</option>`).join('');
    const phaseOptions = [[1,'Monophasé'],[3,'Triphasé']]
      .map(([v, l]) => `<option value="${v}"${(editing?.phase||1)===v?' selected':''}>${l}</option>`).join('');

    const listHTML = inverters.length === 0
      ? `<div style="padding:24px;text-align:center;color:var(--color-text-muted);font-size:13px">${q ? 'Aucun résultat pour cette recherche.' : 'Aucun onduleur enregistré.'}</div>`
      : inverters.map(i => {
          const isEdit = i.id === editingId;
          const pnomTxt = i.pnom ? (i.type === 'micro' ? `${Math.round(i.pnom*1000)} W/unité` : `${i.pnom} kW`) : '';
          return `
          <div style="padding:10px 12px;border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:8px;${isEdit?'background:var(--color-surface2)':''}">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${TYPE_ICON[i.type]||'⚡'} ${esc(i.brand)} ${esc(i.model)}${i.seeded ? ' <span style="font-size:9px;background:var(--color-surface2);color:var(--color-text-muted);padding:1px 5px;border-radius:3px">catalogue</span>' : ''}</div>
              <div style="font-size:11px;color:var(--color-text-muted)">
                ${TYPE_LABEL[i.type]||i.type}${i.phase?' · '+i.phase+'~':''}${pnomTxt?' · '+pnomTxt:''}${i.efficiency?' · '+Math.round(i.efficiency*1000)/10+'%':''}${i.prix?' · '+i.prix.toLocaleString('fr')+' €':''}
              </div>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0">
              ${isPicker ? `<button class="btn btn-accent btn-sm" onclick="InverterDB._applyAndClose('${i.id}')" style="font-size:11px;padding:2px 8px">Utiliser</button>` : ''}
              ${i.datasheet ? `<button class="btn btn-outline btn-sm" onclick="InverterDB._openDatasheet('${i.id}')" style="font-size:11px;padding:2px 8px" title="Fiche PDF">📄</button>` : ''}
              <button class="btn btn-outline btn-sm" onclick="InverterDB._renderManager('${i.id}')" style="font-size:11px;padding:2px 8px" title="Modifier">✏️</button>
              <button class="btn btn-sm" data-del="${i.id}" onclick="InverterDB._confirmDelete('${i.id}')" style="font-size:11px;padding:2px 8px;background:var(--color-danger);color:#fff;border:none;border-radius:4px;cursor:pointer" title="Supprimer">✕</button>
            </div>
          </div>`;
        }).join('');

    const formHTML = `
      <form id="inverter-db-form" onsubmit="InverterDB._submitForm(event)" autocomplete="off">
        <input type="hidden" id="idb-id" value="${esc(editing?.id||'')}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="form-group">
            <label>Marque <span style="color:var(--color-danger)">*</span></label>
            <input type="text" id="idb-brand" value="${esc(editing?.brand||'')}" placeholder="Fronius, SMA, Huawei..." style="font-size:13px">
          </div>
          <div class="form-group">
            <label>Modèle <span style="color:var(--color-danger)">*</span></label>
            <input type="text" id="idb-model" value="${esc(editing?.model||'')}" placeholder="Primo 5.0" style="font-size:13px">
          </div>
          <div class="form-group">
            <label>Type</label>
            <select id="idb-type" onchange="InverterDB._toggleTypeFields()">${typeOptions}</select>
          </div>
          <div class="form-group">
            <label>Phase</label>
            <select id="idb-phase">${phaseOptions}</select>
          </div>
          <div class="form-group">
            <label id="idb-pnom-label">Puissance nominale</label>
            <div class="input-unit"><input type="number" id="idb-pnom" value="${editing?.pnom||''}" min="0" step="0.1" placeholder="5.0"><span class="unit-tag">kW</span></div>
          </div>
          <div class="form-group">
            <label>Prix unitaire</label>
            <div class="input-unit"><input type="number" id="idb-prix" value="${editing?.prix||''}" min="0" step="1" placeholder="1200"><span class="unit-tag">€ HT</span></div>
          </div>
          <div class="form-group">
            <label>Nb. trackers MPPT</label>
            <div class="input-unit"><input type="number" id="idb-nmppt" value="${editing?.nMppt||''}" min="0" step="1" placeholder="2"><span class="unit-tag">MPPT</span></div>
          </div>
          <div class="form-group">
            <label>Courant max. MPPT</label>
            <div class="input-unit"><input type="number" id="idb-maxmpptcurrent" value="${editing?.maxMpptCurrent||''}" min="0" step="0.1" placeholder="15"><span class="unit-tag">A</span></div>
          </div>
          <div class="form-group">
            <label>Tension DC max. entrée</label>
            <div class="input-unit"><input type="number" id="idb-maxvoc" value="${editing?.maxVocInput||''}" min="0" step="1" placeholder="1000"><span class="unit-tag">V</span></div>
          </div>
          <div class="form-group">
            <label>Rendement</label>
            <div class="input-unit"><input type="number" id="idb-efficiency" value="${editing?.efficiency?Math.round(editing.efficiency*1000)/10:''}" min="0" max="100" step="0.1" placeholder="97.5"><span class="unit-tag">%</span></div>
          </div>
          <div class="form-group" id="idb-battv-wrap" style="${(editing?.type||'string')==='hybrid'?'':'display:none'}">
            <label>Tension batterie max.</label>
            <div class="input-unit"><input type="number" id="idb-maxbattv" value="${editing?.maxBattV||''}" min="0" step="1" placeholder="58"><span class="unit-tag">V</span></div>
          </div>
          <div class="form-group" id="idb-chargecurrent-wrap" style="${(editing?.type||'string')==='hybrid'?'':'display:none'}">
            <label>Courant charge max.</label>
            <div class="input-unit"><input type="number" id="idb-chargecurrent" value="${editing?.maxChargeCurrent||''}" min="0" step="0.1" placeholder="25"><span class="unit-tag">A</span></div>
          </div>
          <div class="form-group">
            <label>Garantie</label>
            <div class="input-unit"><input type="number" id="idb-garantie" value="${editing?.garantie_p||''}" min="0" step="1" placeholder="10"><span class="unit-tag">ans</span></div>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Lien produit (URL)</label>
            <div style="display:flex;gap:6px">
              <input type="url" id="idb-url" value="${esc(editing?.url||'')}" placeholder="https://..." style="flex:1;font-size:12px">
              ${editing?.url ? `<button type="button" class="btn btn-outline btn-sm" onclick="InverterDB._openLink('idb-url')" style="white-space:nowrap">Ouvrir</button>` : ''}
            </div>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Fiche technique / Datasheet (URL ou PDF)</label>
            <div style="display:flex;gap:6px">
              <input type="text" id="idb-datasheet" value="${esc(editing?.datasheet||'')}" placeholder="https://... ou chemin PDF" style="flex:1;font-size:12px">
              ${editing?.datasheet ? `<button type="button" class="btn btn-outline btn-sm" onclick="InverterDB._openLink('idb-datasheet')" style="white-space:nowrap">📄 Visionneuse PDF</button>` : ''}
            </div>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Notes</label>
            <textarea id="idb-notes" rows="2" style="width:100%;resize:vertical;font-size:12px;font-family:inherit;border:1px solid var(--color-border);border-radius:6px;padding:6px;background:var(--color-bg);color:var(--color-text)">${esc(editing?.notes||'')}</textarea>
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
          ${editingId ? `<button type="button" class="btn btn-outline btn-sm" onclick="InverterDB._renderManager()" style="margin-right:auto">Annuler</button>` : ''}
          <button type="submit" class="btn btn-accent btn-sm">${editing ? 'Enregistrer les modifications' : '+ Ajouter cet onduleur'}</button>
        </div>
      </form>`;

    const tabBarHTML = _hubMode ? `
      <div style="display:flex;gap:6px">
        <button onclick="InverterDB.closeManagerModal();PanelDB.openManagerModal('${_pickerPrefix||''}',{hub:true})" style="background:rgba(255,255,255,0.08);border:none;color:#fff;font-size:12px;font-weight:600;padding:6px 12px;border-radius:6px;cursor:pointer">📋 Panneaux</button>
        <button style="background:rgba(255,255,255,0.25);border:none;color:#fff;font-size:12px;font-weight:700;padding:6px 12px;border-radius:6px;cursor:default">🔌 Onduleurs</button>
      </div>` : `<span style="font-size:16px;font-weight:700">🔌 Bibliothèque d'onduleurs${isPicker?' — Sélectionner un onduleur':''}</span>`;

    modal.innerHTML = `
      <div style="background:var(--color-surface);border-radius:14px;box-shadow:0 12px 48px rgba(0,0,0,0.4);width:min(940px,96vw);max-height:90vh;display:flex;flex-direction:column;overflow:hidden">
        <div style="background:var(--color-primary);padding:16px 20px;color:#fff;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;gap:12px">
          ${tabBarHTML}
          <button onclick="InverterDB.closeManagerModal()" style="background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:18px;width:30px;height:30px;border-radius:50%;cursor:pointer;line-height:1;flex-shrink:0">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;flex:1;min-height:0;overflow:hidden">
          <div style="border-right:1px solid var(--color-border);display:flex;flex-direction:column;min-height:0">
            <div style="padding:10px 12px;border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;gap:8px;flex-wrap:wrap">
              <span style="font-size:12px;font-weight:600;color:var(--color-text-muted);white-space:nowrap">${allInverters.length} onduleur${allInverters.length>1?'s':''}</span>
              <div style="display:flex;gap:4px;flex-wrap:wrap">
                <button class="btn btn-outline btn-sm" onclick="RexelCatalog.importWithUi()" style="font-size:11px;white-space:nowrap" title="Importer catalogue Rexel">⬇ Rexel</button>
                <button class="btn btn-outline btn-sm" onclick="InverterDB._renderManager(null)" style="font-size:11px;white-space:nowrap">+ Nouveau</button>
              </div>
            </div>
            <div style="padding:8px 12px;border-bottom:1px solid var(--color-border);flex-shrink:0">
              <input type="search" placeholder="🔎 Rechercher marque ou modèle…" value="${esc(_searchQuery)}" oninput="InverterDB._search(this.value)" style="width:100%;font-size:12px;padding:6px 8px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-bg);color:var(--color-text)">
            </div>
            <div style="overflow-y:auto;flex:1">${listHTML}</div>
          </div>
          <div style="overflow-y:auto;padding:16px">
            <div style="font-size:13px;font-weight:600;color:var(--color-primary);margin-bottom:12px">${editing ? 'Modifier : '+esc(editing.brand)+' '+esc(editing.model) : 'Nouvel onduleur'}</div>
            ${formHTML}
          </div>
        </div>
      </div>`;

    _updatePnomLabel();
  }

  function _updatePnomLabel() {
    const type  = document.getElementById('idb-type')?.value;
    const label = document.getElementById('idb-pnom-label');
    if (label) label.textContent = type === 'micro' ? 'Puissance nominale (par unité)' : 'Puissance nominale';
  }

  function _toggleTypeFields() {
    const type = document.getElementById('idb-type')?.value;
    const battWrap = document.getElementById('idb-battv-wrap');
    const chargeWrap = document.getElementById('idb-chargecurrent-wrap');
    if (battWrap)   battWrap.style.display   = type === 'hybrid' ? '' : 'none';
    if (chargeWrap) chargeWrap.style.display = type === 'hybrid' ? '' : 'none';
    _updatePnomLabel();
  }

  function _search(q) {
    _searchQuery = q || '';
    _renderManager();
  }

  function _submitForm(event) {
    event.preventDefault();
    const data = {
      id:               document.getElementById('idb-id')?.value || null,
      brand:            document.getElementById('idb-brand')?.value,
      model:            document.getElementById('idb-model')?.value,
      type:             document.getElementById('idb-type')?.value,
      phase:            document.getElementById('idb-phase')?.value,
      pnom:             document.getElementById('idb-pnom')?.value,
      prix:             document.getElementById('idb-prix')?.value,
      nMppt:            document.getElementById('idb-nmppt')?.value,
      maxMpptCurrent:   document.getElementById('idb-maxmpptcurrent')?.value,
      maxVocInput:      document.getElementById('idb-maxvoc')?.value,
      efficiency:       document.getElementById('idb-efficiency')?.value,
      maxBattV:         document.getElementById('idb-maxbattv')?.value,
      maxChargeCurrent: document.getElementById('idb-chargecurrent')?.value,
      garantie_p:       document.getElementById('idb-garantie')?.value,
      url:              document.getElementById('idb-url')?.value,
      datasheet:        document.getElementById('idb-datasheet')?.value,
      notes:            document.getElementById('idb-notes')?.value,
    };
    const saved = saveInverter(data);
    if (!saved) {
      if (typeof showToast === 'function') showToast('Marque ou modèle requis.', 'error');
      return;
    }
    if (typeof showToast === 'function') showToast(`Onduleur "${saved.brand} ${saved.model}" enregistré`);
    _renderManager();
  }

  function _confirmDelete(id) {
    const i = getById(id);
    if (!i) return;
    const btn = document.querySelector(`[data-del="${id}"]`);
    if (!btn) return;
    const container = btn.parentElement;
    container.innerHTML = `
      <span style="font-size:11px;color:var(--color-danger);white-space:nowrap;align-self:center">Supprimer ?</span>
      <button class="btn btn-sm" onclick="InverterDB._deleteConfirmed('${id}')" style="font-size:11px;padding:2px 8px;background:var(--color-danger);color:#fff;border:none;border-radius:4px;cursor:pointer">Oui</button>
      <button class="btn btn-outline btn-sm" onclick="InverterDB._renderManager()" style="font-size:11px;padding:2px 8px">Non</button>`;
  }

  function _deleteConfirmed(id) {
    remove(id);
    _renderManager();
    if (typeof showToast === 'function') showToast('Onduleur supprimé');
  }

  function _applyAndClose(id) {
    applyInverter(id, _pickerPrefix);
    closeManagerModal();
  }

  function _openLink(inputId) {
    const url = document.getElementById(inputId)?.value?.trim();
    if (!url) return;
    if (inputId === 'idb-datasheet' && typeof Datasheet !== 'undefined') {
      Datasheet.open(url, { filename: ((getById(document.getElementById('idb-id')?.value)?.model) || 'fiche') + '.pdf' });
      return;
    }
    const bridge = typeof getNativeBridge === 'function' ? getNativeBridge() : null;
    if (bridge?.openExternal) bridge.openExternal(url);
    else window.open(url, '_blank', 'noopener');
  }

  function _openDatasheet(id) {
    const inv = getById(id);
    if (!inv?.datasheet) {
      if (typeof showToast === 'function') showToast('Pas de fiche PDF pour cet onduleur.', 'warning');
      return;
    }
    if (typeof Datasheet !== 'undefined') {
      Datasheet.open(inv.datasheet, { filename: ((inv.brand || '') + '_' + (inv.model || 'ond')).replace(/[^\w.\-]+/g, '_') + '.pdf' });
    }
  }

  // ── APPLIQUER UN ONDULEUR AUX CHAMPS FORMULAIRE ────────────────

  // Correspondance prefix → champs cibles réels (le devis utilise des ids historiques
  // différents du schéma `${prefix}-inverter-*` générique utilisé ailleurs).
  const FIELD_MAP = {
    dv: { model: 'dv-sys-inverter', price: 'dv-line-inverter-price' },
  };
  function _targetFields(prefix) {
    return FIELD_MAP[prefix] || { model: `${prefix}-inverter-model`, price: `${prefix}-inverter-price` };
  }

  function applyInverter(id, prefix) {
    const inv = getById(id);
    if (!inv || !prefix) return;
    const f = _targetFields(prefix);
    const label = [inv.brand, inv.model].filter(Boolean).join(' ').trim();

    const modelEl = document.getElementById(f.model);
    if (modelEl) { modelEl.value = label; modelEl.dispatchEvent(new Event('input')); }

    if (f.price && inv.prix) {
      const priceEl = document.getElementById(f.price);
      if (priceEl) { priceEl.value = inv.prix; priceEl.dispatchEvent(new Event('input')); }
    }
    if (typeof showToast === 'function') showToast(`Onduleur "${label}" chargé`);
  }

  function saveFromForm(prefix) {
    const f = _targetFields(prefix);
    const raw = (document.getElementById(f.model)?.value || '').trim();
    if (!raw) { if (typeof showToast === 'function') showToast('Saisissez un modèle d\'onduleur avant d\'enregistrer.', 'error'); return; }
    const parts = raw.split(/\s+/);
    const brand = parts.shift() || raw;
    const model = parts.join(' ') || raw;
    const price = f.price ? parseFloat(document.getElementById(f.price)?.value) : null;
    const saved = saveInverter({ brand, model, type: 'string', phase: 1, prix: price || null, notes: 'Ajouté depuis un formulaire' });
    if (saved) { if (typeof showToast === 'function') showToast(`Onduleur "${raw}" enregistré dans la bibliothèque`); }
    else if (typeof showToast === 'function') showToast('Erreur lors de l\'enregistrement.', 'error');
  }

  // ── EXPORT PUBLIC ──────────────────────────────────────────────
  return {
    list, getById, save: saveInverter, remove, seedFromCatalog, recommend,
    openLibraryModal, closeLibraryModal, openManagerModal, closeManagerModal,
    applyInverter, saveFromForm,
    // Internals exposés pour les onclick inline
    _renderManager, _search, _submitForm, _confirmDelete, _deleteConfirmed,
    _applyAndClose, _openLink, _openDatasheet, _toggleTypeFields,
  };

})();

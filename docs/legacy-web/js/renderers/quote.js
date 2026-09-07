/**
 * renderers/quote.js - Onglet Devis professionnel
 * Dépend de : app_state.js, quote_generator.js
 *
 * QuoteLines : lignes de coût dynamiques (onduleur, câbles, main d’œuvre, extras…).
 */

const QuoteLines = (() => {
  const CORE = [
    { key: 'panels',     label: 'Panneaux photovoltaïques',        qty: 8, unit: 'u',       price: 180, locked: false },
    { key: 'inverter',   label: 'Onduleur',                        qty: 1, unit: 'u',       price: 900, locked: false },
    { key: 'battery',    label: 'Batterie / stockage',             qty: 0, unit: 'u',       price: 0,   locked: false },
    { key: 'fixations', label: 'Fixations / structure',           qty: 1, unit: 'forfait', price: 350, locked: false },
    { key: 'cabling',    label: 'Câblage DC/AC + protections',     qty: 1, unit: 'forfait', price: 250, locked: false },
    { key: 'labor',      label: "Main d'œuvre pose",               qty: 2, unit: 'jours',   price: 400, locked: false },
    { key: 'admin',      label: 'Démarches administratives',      qty: 1, unit: 'forfait', price: 200, locked: false },
    { key: 'misc',       label: '',                                qty: 0, unit: '',        price: 0,   locked: false },
  ];

  const PRESETS = {
    battery:    { label: 'Batterie LFP',              qty: 1, unit: 'u',       price: 0 },
    optimizers: { label: 'Optimiseurs de puissance', qty: 1, unit: 'u',       price: 0 },
    monitoring: { label: 'Monitoring / passerelle',   qty: 1, unit: 'u',       price: 0 },
    transport:  { label: 'Transport / livraison',     qty: 1, unit: 'forfait', price: 0 },
    scaffold:   { label: 'Échafaudage / nacelle',     qty: 1, unit: 'forfait', price: 0 },
    other:      { label: '',                         qty: 1, unit: 'u',       price: 0 },
  };

  let _booted = false;

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function body() {
    return document.getElementById('dv-lines-body');
  }

  function rowHTML(line, { removable }) {
    const k = line.key;
    const ph = k === 'misc' || String(k).startsWith('extra_') ? 'placeholder="Désignation libre…"' : '';
    return `<tr class="dv-cost-row" data-quote-key="${esc(k)}">
      <td><input type="text" id="dv-line-${esc(k)}-label" value="${esc(line.label)}" ${ph}
        style="width:100%;border:none;background:transparent;font-size:12px" oninput="QuoteLines.sync()"></td>
      <td><input type="number" id="dv-line-${esc(k)}-qty" value="${line.qty ?? 0}" min="0" step="any"
        style="width:100%;border:none;background:transparent;font-size:12px;text-align:center"
        oninput="updateQuoteLine('${esc(k)}')"></td>
      <td><input type="text" id="dv-line-${esc(k)}-unit" value="${esc(line.unit || '')}"
        style="width:100%;border:none;background:transparent;font-size:12px;text-align:center" oninput="QuoteLines.sync()"></td>
      <td><input type="number" id="dv-line-${esc(k)}-price" value="${line.price ?? 0}" min="0" step="any"
        style="width:100%;border:none;background:transparent;font-size:12px;text-align:right"
        oninput="updateQuoteLine('${esc(k)}')"></td>
      <td id="dv-line-${esc(k)}-total" style="text-align:right;padding:4px 6px;font-weight:600">-</td>
      <td style="text-align:center;padding:2px">
        ${removable
          ? `<button type="button" class="btn btn-outline btn-sm" onclick="QuoteLines.remove('${esc(k)}')"
               title="Supprimer la ligne" style="padding:1px 6px;font-size:11px;color:var(--color-danger)">✕</button>`
          : ''}
      </td>
    </tr>`;
  }

  function listKeys() {
    return [...(body()?.querySelectorAll('[data-quote-key]') || [])]
      .map(tr => tr.getAttribute('data-quote-key'))
      .filter(Boolean);
  }

  function readLine(key) {
    const n = id => parseFloat(document.getElementById(id)?.value) || 0;
    const v = id => (document.getElementById(id)?.value || '').trim();
    return {
      key,
      label: v(`dv-line-${key}-label`),
      qty: n(`dv-line-${key}-qty`),
      unit: v(`dv-line-${key}-unit`),
      price: n(`dv-line-${key}-price`),
    };
  }

  function collect() {
    return listKeys().map(readLine);
  }

  function persist() {
    const jsonEl = document.getElementById('dv-quote-lines-json');
    if (!jsonEl) return;
    try { jsonEl.value = JSON.stringify(collect()); } catch (_) { jsonEl.value = '[]'; }
  }

  function sync() {
    persist();
    if (typeof updateQuoteTotals === 'function') updateQuoteTotals();
  }

  function render(lines) {
    const el = body();
    if (!el) return;
    const coreKeys = new Set(CORE.map(c => c.key));
    el.innerHTML = lines.map(l => rowHTML(l, {
      removable: !coreKeys.has(l.key) || String(l.key).startsWith('extra_'),
    })).join('');
    lines.forEach(l => {
      const qty   = parseFloat(document.getElementById(`dv-line-${l.key}-qty`)?.value)   || 0;
      const price = parseFloat(document.getElementById(`dv-line-${l.key}-price`)?.value) || 0;
      const total = qty * price;
      const cell  = document.getElementById(`dv-line-${l.key}-total`);
      if (cell) {
        cell.textContent = total > 0
          ? total.toLocaleString('fr', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
          : '-';
      }
    });
    sync();
  }

  function linesFromJson(raw) {
    let fromJson = null;
    try { fromJson = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { fromJson = null; }
    if (!Array.isArray(fromJson) || !fromJson.length) return null;
    const byKey = Object.fromEntries(fromJson.filter(l => l?.key).map(l => [l.key, l]));
    const merged = CORE.map(c => byKey[c.key] ? { ...c, ...byKey[c.key] } : { ...c });
    fromJson.filter(l => l?.key && !CORE.some(c => c.key === l.key)).forEach(l => merged.push(l));
    return merged;
  }

  function boot(force) {
    const el = body();
    if (!el) return;
    if (_booted && !force && el.children.length) {
      sync();
      return;
    }
    if (force) {
      const jsonEl = document.getElementById('dv-quote-lines-json');
      if (jsonEl) jsonEl.value = '';
    }
    const jsonEl = document.getElementById('dv-quote-lines-json');
    const merged = (!force && jsonEl?.value) ? linesFromJson(jsonEl.value) : null;
    render(merged || CORE.map(c => ({ ...c })));
    _booted = true;
  }

  function add(preset) {
    boot();
    const p = typeof preset === 'string' ? (PRESETS[preset] || PRESETS.other) : (preset || PRESETS.other);
    const key = 'extra_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const el = body();
    if (!el) return;
    el.insertAdjacentHTML('beforeend', rowHTML({
      key,
      label: p.label || '',
      qty: p.qty ?? 1,
      unit: p.unit || 'u',
      price: p.price ?? 0,
    }, { removable: true }));
    updateQuoteLine(key);
    sync();
    const labelInp = document.getElementById(`dv-line-${key}-label`);
    if (labelInp) {
      labelInp.focus();
      try { labelInp.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
    }
  }

  function addPreset(name) { add(name); }

  function remove(key) {
    if (!key) return;
    if (String(key).startsWith('extra_')) {
      body()?.querySelector(`[data-quote-key="${key}"]`)?.remove();
      sync();
      return;
    }
    // Lignes de base : vider plutôt que supprimer (structure devis stable)
    const def = CORE.find(c => c.key === key);
    const set = (suf, val) => { const el = document.getElementById(`dv-line-${key}-${suf}`); if (el) el.value = val; };
    set('label', key === 'misc' ? '' : (def?.label ?? ''));
    set('qty', 0);
    set('unit', key === 'misc' ? '' : (def?.unit ?? ''));
    set('price', (key === 'misc' || key === 'battery') ? 0 : (def?.price ?? 0));
    updateQuoteLine(key);
  }

  function setLine(key, { label, qty, unit, price } = {}) {
    boot();
    if (!document.getElementById(`dv-line-${key}-label`)) {
      // créer si absente (ex. battery sur vieux projet)
      const def = CORE.find(c => c.key === key) || { key, label: '', qty: 0, unit: 'u', price: 0 };
      body()?.insertAdjacentHTML('beforeend', rowHTML({ ...def, key }, { removable: String(key).startsWith('extra_') }));
    }
    const set = (suf, val) => {
      if (val == null) return;
      const el = document.getElementById(`dv-line-${key}-${suf}`);
      if (el) el.value = val;
    };
    set('label', label);
    set('qty', qty);
    set('unit', unit);
    set('price', price);
    updateQuoteLine(key);
    sync();
  }

  /** Après restoreFormState : JSON moderne ou migration anciens champs dv-line-*. */
  function afterRestore(fields) {
    _booted = false;
    const jsonEl = document.getElementById('dv-quote-lines-json');
    const fromJson = jsonEl?.value ? linesFromJson(jsonEl.value) : null;
    if (fromJson) {
      render(fromJson);
      _booted = true;
      return;
    }
    const src = fields || {};
    const hasLegacy = CORE.some(c =>
      src[`dv-line-${c.key}-label`] != null
      || src[`dv-line-${c.key}-qty`] != null
      || src[`dv-line-${c.key}-price`] != null
    );
    if (hasLegacy) {
      const lines = CORE.map(c => ({
        key: c.key,
        label: src[`dv-line-${c.key}-label`] ?? c.label,
        qty: parseFloat(src[`dv-line-${c.key}-qty`]) || 0,
        unit: src[`dv-line-${c.key}-unit`] ?? c.unit,
        price: parseFloat(src[`dv-line-${c.key}-price`]) || 0,
      }));
      render(lines);
      _booted = true;
      return;
    }
    boot(true);
  }

  return { boot, add, addPreset, remove, sync, persist, collect, listKeys, setLine, afterRestore, CORE };
})();

function updateQuoteLine(key) {
  const qty   = parseFloat(document.getElementById(`dv-line-${key}-qty`)?.value)   || 0;
  const price = parseFloat(document.getElementById(`dv-line-${key}-price`)?.value) || 0;
  const total = qty * price;
  const el    = document.getElementById(`dv-line-${key}-total`);
  if (el) el.textContent = total > 0
    ? total.toLocaleString('fr', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
    : '-';
  if (typeof QuoteLines !== 'undefined') QuoteLines.persist();
  updateQuoteTotals();
}

function updateQuoteTotals() {
  const keys = (typeof QuoteLines !== 'undefined' && QuoteLines.listKeys().length)
    ? QuoteLines.listKeys()
    : ['panels', 'inverter', 'battery', 'fixations', 'cabling', 'labor', 'admin', 'misc'];
  const subtotalHT = keys.reduce((s, k) => {
    const qty   = parseFloat(document.getElementById(`dv-line-${k}-qty`)?.value)   || 0;
    const price = parseFloat(document.getElementById(`dv-line-${k}-price`)?.value) || 0;
    return s + qty * price;
  }, 0);

  const tvaRate   = parseFloat(document.getElementById('dv-tva')?.value)    || 10;
  const remisePct = parseFloat(document.getElementById('dv-remise')?.value) || 0;
  const remise    = subtotalHT * remisePct / 100;
  const baseHT    = subtotalHT - remise;
  const tva       = baseHT * tvaRate / 100;
  const totalTTC  = baseHT + tva;

  const fmt   = n => n.toLocaleString('fr', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
  const setEl = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

  setEl('dv-total-ht',   fmt(subtotalHT));
  setEl('dv-base-ht',    fmt(baseHT));
  setEl('dv-total-tva',  fmt(tva));
  setEl('dv-total-ttc',  fmt(totalTTC));
  setEl('dv-tva-pct',    tvaRate);

  const remRow = document.getElementById('dv-remise-row');
  if (remRow) remRow.style.display = remisePct > 0 ? '' : 'none';
  setEl('dv-remise-pct',   remisePct);
  setEl('dv-total-remise', '− ' + fmt(remise));
}

function importSizingToQuote() {
  const recGrid = AppState.lastSizingResult;
  const inpGrid = AppState.lastSizingInput;
  const recOg   = AppState.lastOffgridSizingResult;
  if (!recGrid && !inpGrid && !recOg) {
    showToast('Lancez d\'abord un dimensionnement (réseau ou autonome) pour importer les données.', 'warning');
    return;
  }
  if (typeof QuoteLines !== 'undefined') QuoteLines.boot();
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  const isOffgrid = !recGrid && !!recOg;
  const rec = isOffgrid ? recOg : recGrid;
  const inp = inpGrid;

  if (rec?.Ppeak) setVal('dv-sys-ppeak', rec.Ppeak);

  if (isOffgrid) {
    if (rec.nPanels) setVal('dv-sys-panels', rec.nPanels);
    if (rec.C_batt_gross) setVal('dv-sys-batt', rec.C_batt_gross);
    if (rec.coverageRate != null) {
      setVal('dv-sys-autonomy', `${rec.coverageRate} % autonome (${rec.deficit_days || 0} j déficit/an)`);
    }
    if (Array.isArray(rec.monthly) && typeof DAYS_IN_MONTH !== 'undefined') {
      const annualProd = rec.monthly.reduce((s, m, i) => {
        const days = DAYS_IN_MONTH[i] || 30;
        return s + (m.e_prod_day || 0) * days;
      }, 0);
      if (annualProd > 0) setVal('dv-sys-prod', Math.round(annualProd));
    }
    if (rec.costPV > 0 && typeof QuoteLines !== 'undefined') {
      QuoteLines.setLine('panels', {
        qty: rec.nPanels || 1,
        unit: rec.nPanels ? 'u' : 'forfait',
        price: rec.nPanels ? Math.round(rec.costPV / rec.nPanels) : rec.costPV,
        label: document.getElementById('og2-panel-model')?.value
          ? `Panneaux ${document.getElementById('og2-panel-model').value}`
          : undefined,
      });
    }
    if (rec.costBatt > 0 && typeof QuoteLines !== 'undefined') {
      const battTech = document.getElementById('og2-batt-tech');
      const techKey  = battTech?.value || '';
      const techLabel = (typeof OffgridSizing !== 'undefined'
        && OffgridSizing.BATTERY_TECH?.[techKey]?.label) || 'Batterie';
      QuoteLines.setLine('battery', {
        label: `${techLabel} ${rec.C_batt_gross} kWh`,
        qty: 1,
        unit: 'u',
        price: rec.costBatt,
      });
    }
  } else {
    if (rec?.Ppeak && inp?.site?.panelWattPeak)
      setVal('dv-sys-panels', Math.ceil(rec.Ppeak * 1000 / inp.site.panelWattPeak));
    if (rec?.annualProd)  setVal('dv-sys-prod',    Math.round(rec.annualProd));
    if (rec?.co2Saved)    setVal('dv-sys-co2',     Math.round(rec.co2Saved));

    if (rec?.battery?.capacityKwh) {
      setVal('dv-sys-batt', rec.battery.capacityKwh);
      if (typeof QuoteLines !== 'undefined') {
        const battTechLabel = (typeof OffgridSizing !== 'undefined'
          && OffgridSizing.BATTERY_TECH[rec.battery.type]?.label) || rec.battery.type;
        QuoteLines.setLine('battery', {
          label: `Batterie ${battTechLabel} ${rec.battery.capacityKwh} kWh`,
          qty: 1,
          unit: 'u',
          price: rec.battery.cost || 0,
        });
      }
    }
  }

  const panelModelEl = document.getElementById('dv-sys-panel-model');
  if (panelModelEl && !panelModelEl.value) {
    const modelSz  = (document.getElementById('sz-panel-model')?.value  || '').trim();
    const modelInp = (document.getElementById('inp-panel-model')?.value || '').trim();
    const modelOg  = (document.getElementById('og2-panel-model')?.value || '').trim();
    if (modelSz) panelModelEl.value = modelSz;
    else if (modelOg) panelModelEl.value = modelOg;
    else if (modelInp) panelModelEl.value = modelInp;
  }

  // Onduleur : modèle saisi (réseau) > modèle sz/og2 s'il existe > recommandation de dimensionnement
  const invEl = document.getElementById('dv-sys-inverter');
  if (invEl && !invEl.value) {
    const invModel = (document.getElementById('inp-inverter-model')?.value || '').trim()
      || (document.getElementById('sz-inverter-model')?.value || '').trim()
      || (document.getElementById('og2-inverter-model')?.value || '').trim();
    const invLabel = invModel
      || (recGrid?.inverter?.model
        ? [recGrid.inverter.brand, recGrid.inverter.model].filter(Boolean).join(' ')
        : '');
    if (invLabel) {
      invEl.value = invLabel;
      if (typeof QuoteLines !== 'undefined') {
        const patch = { label: invLabel, qty: 1, unit: 'u' };
        const currentPrice = parseFloat(document.getElementById('dv-line-inverter-price')?.value) || 0;
        if (recGrid?.inverter?.price) {
          patch.price = recGrid.inverter.price;
        } else if (currentPrice === 0 && typeof InverterDB !== 'undefined') {
          const found = InverterDB.list().find(
            i => `${i.brand} ${i.model}`.trim().toLowerCase() === invLabel.toLowerCase()
          );
          if (found?.prix) patch.price = found.prix;
          // sinon : on laisse le prix à 0, à saisir par l'utilisateur
        }
        QuoteLines.setLine('inverter', patch);
      }
    }
  }

  // Adresse : ne pas écraser une saisie manuelle lors d'un ré-import
  const addrEl = document.getElementById('dv-site-address');
  if (addrEl && !addrEl.value) {
    addrEl.value = (AppState.currentClient?.adresse || '').trim() || AppState.location.name || '';
  }
  if (isOffgrid) {
    const tilt = document.getElementById('og2-tilt')?.value;
    const az   = document.getElementById('og2-azimuth')?.value;
    const surf = document.getElementById('og2-surface')?.value;
    if (tilt) setVal('dv-site-tilt', tilt);
    if (az !== undefined && az !== '') setVal('dv-site-azimuth', az);
    if (surf) setVal('dv-site-surface', surf);
  } else {
    if (inp?.tilt)                   setVal('dv-site-tilt',    inp.tilt);
    if (inp?.azimuth !== undefined)  setVal('dv-site-azimuth', inp.azimuth);
    if (inp?.surface)                setVal('dv-site-surface', inp.surface);
  }

  const dateEl = document.getElementById('dv-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toLocaleDateString('fr-FR');

  showToast(isOffgrid
    ? '✓ Données importées depuis le dimensionnement autonome'
    : '✓ Données importées depuis le dimensionnement');
}

function previewQuote() {
  if (typeof QuoteGen === 'undefined') { showToast('Erreur : QuoteGen non chargé', 'error'); return; }
  QuoteGen.preview();
}

function printQuote() {
  if (typeof QuoteGen === 'undefined') { showToast('Erreur : QuoteGen non chargé', 'error'); return; }
  QuoteGen.print();
}

function saveInstallerData() {
  const v    = id => (document.getElementById(id)?.value || '').trim();
  const data = {
    company: v('dv-ins-company'), siret: v('dv-ins-siret'),
    address: v('dv-ins-address'), phone: v('dv-ins-phone'),
    email:   v('dv-ins-email'),   rge:   v('dv-ins-rge')
  };
  if (typeof QuoteGen !== 'undefined') QuoteGen.saveInstaller(data);
  showToast('✓ Informations installateur mémorisées');
}

function loadInstallerData() {
  if (typeof QuoteGen === 'undefined') return;
  const data   = QuoteGen.loadInstaller();
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
  setVal('dv-ins-company', data.company);
  setVal('dv-ins-siret',   data.siret);
  setVal('dv-ins-address', data.address);
  setVal('dv-ins-phone',   data.phone);
  setVal('dv-ins-email',   data.email);
  setVal('dv-ins-rge',     data.rge);
}

/** Met à jour la capacité (kWh) dans le libellé de la ligne batterie si celui-ci la contient déjà. */
function refreshBatteryLineLabel() {
  if (typeof QuoteLines === 'undefined') return;
  const labelEl = document.getElementById('dv-line-battery-label');
  const battEl  = document.getElementById('dv-sys-batt');
  if (!labelEl || !battEl || !labelEl.value) return;
  if (!/Batterie/i.test(labelEl.value)) return;
  const capacity = battEl.value;
  if (!capacity) return;
  const updated = /[\d.,]+\s*kWh/i.test(labelEl.value)
    ? labelEl.value.replace(/[\d.,]+(\s*kWh)/i, `${capacity}$1`)
    : `${labelEl.value.trim()} ${capacity} kWh`;
  if (updated !== labelEl.value) {
    labelEl.value = updated;
    QuoteLines.sync();
  }
}

function initQuoteTab() {
  loadInstallerData();
  const dateEl = document.getElementById('dv-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toLocaleDateString('fr-FR');
  if (typeof QuoteLines !== 'undefined') QuoteLines.boot();
  updateQuoteTotals();
  document.getElementById('dv-tva')?.addEventListener('change', updateQuoteTotals);
  document.getElementById('dv-remise')?.addEventListener('input', updateQuoteTotals);
  document.getElementById('dv-sys-batt')?.addEventListener('input', refreshBatteryLineLabel);
}

/**
 * renderers/cables.js - Onglet Câbles (DC + AC)
 * Dépend de : app_state.js, cable_calc.js, panel_db.js (optionnel)
 * Toute la logique DOM/UI de l'onglet est regroupée dans l'objet `CablesUI`.
 */
const CablesUI = (() => {

  const val    = id => document.getElementById(id)?.value ?? '';
  const numVal = id => parseFloat(document.getElementById(id)?.value);
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null && !Number.isNaN(v)) el.value = v; };

  // ── Préremplissage depuis AppState (Ppeak, nPanels, Voc/Isc si connus) ──

  /** Voc/Isc saisis directement dans un des formulaires panneau (si les champs existent). */
  function readPanelElectricalFromForms() {
    for (const prefix of ['sz', 'inp', 'og2']) {
      const isc = numVal(`${prefix}-panel-isc`);
      const voc = numVal(`${prefix}-panel-voc`);
      if ((isc > 0) || (voc > 0)) {
        return { isc: isc > 0 ? isc : null, voc: voc > 0 ? voc : null, source: `formulaire (${prefix})` };
      }
    }
    return null;
  }

  /** Ordre de priorité des préfixes de formulaire (sz/inp/og2) selon le type d'installation. */
  function _prefixPriority() {
    switch (AppState.installationType) {
      case 'offgrid': return ['og2', 'sz', 'inp'];
      case 'grid':    return ['inp', 'sz', 'og2'];
      case 'hybrid':  return ['sz', 'inp', 'og2'];
      default:        return ['sz', 'inp', 'og2'];
    }
  }

  function findMatchingPanel() {
    if (typeof PanelDB === 'undefined') return null;
    const prefixes = _prefixPriority();
    const modelCandidates = [
      ...prefixes.map(p => val(`${p}-panel-model`)),
      val('dv-sys-panel-model'),
    ].map(s => (s || '').trim().toLowerCase()).filter(Boolean);
    if (!modelCandidates.length) return null;
    const panels = PanelDB.list();
    for (const model of modelCandidates) {
      const found = panels.find(p => (p.model || '').trim().toLowerCase() === model);
      if (found) return found;
    }
    return null;
  }

  function getSharedInstallData() {
    const gridP    = AppState.lastGridParams;
    const sizingR  = AppState.lastSizingResult;
    const sizingIn = AppState.lastSizingInput;
    const prefixes = _prefixPriority();

    const Ppeak = gridP?.Ppeak || sizingR?.Ppeak || numVal('inp-ppeak') || null;
    let panelWp = null;
    for (const p of prefixes) {
      panelWp = numVal(`${p}-panel-wp`);
      if (panelWp) break;
    }
    panelWp = panelWp
      || gridP?.panelWp
      || sizingIn?.site?.panelWattPeak
      || 400;

    let nPanels = gridP?.nPanels || null;
    if (!nPanels) {
      const label = document.getElementById('grid-npanels')?.textContent || '';
      const m = label.match(/(\d+)/);
      if (m) nPanels = parseInt(m[1], 10);
    }
    if (!nPanels && Ppeak) nPanels = Math.round(Ppeak * 1000 / panelWp);

    return { Ppeak, panelWp, nPanels, installType: AppState.installationType || 'grid' };
  }

  function prefill() {
    const { Ppeak, panelWp, nPanels, installType } = getSharedInstallData();
    const formElectrical = readPanelElectricalFromForms();
    const panel = findMatchingPanel();

    const noteParts = [];

    // ── DC : longueur (implantation) ──
    if (nPanels) setVal('cbl-dc-npanels', nPanels);

    // ── DC : électrique — priorité au formulaire actif, puis bibliothèque, puis estimation Wc ──
    const iscKnown = formElectrical?.isc || panel?.isc || null;
    const vocKnown = formElectrical?.voc || panel?.voc || null;
    setVal('cbl-dc-isc', iscKnown || CableCalc.estimateIscFromWp(panelWp));
    setVal('cbl-dc-voc', vocKnown || CableCalc.estimateVocFromWp(panelWp));
    if (formElectrical) {
      noteParts.push(`Isc/Voc repris du ${formElectrical.source}`);
    } else if (iscKnown || vocKnown) {
      noteParts.push(`Isc/Voc repris du panneau "${panel.model}" (bibliothèque)`);
    } else if (panelWp) {
      noteParts.push(`Isc/Voc estimés depuis ${panelWp} Wc (à corriger avec la datasheet réelle)`);
    }

    if (nPanels) {
      const panelsSeries = Math.max(1, Math.min(nPanels, 12));
      setVal('cbl-dc-panels-series', panelsSeries);
      setVal('cbl-dc-strings-parallel', Math.max(1, Math.ceil(nPanels / panelsSeries)));
      noteParts.push(`${nPanels} panneaux détectés (${Ppeak ? Ppeak.toFixed(2) + ' kWc' : ''})`);
    }

    // Calcule I/U DC par défaut à partir des estimations ci-dessus
    estimateDcElectrical({ silent: true });
    if (!val('cbl-dc-l')) estimateDcLength({ silent: true });

    // ── AC : mode selon puissance (>6 kWc → triphasé usuel en France) ──
    const acMode = Ppeak && Ppeak > 6 ? 'ac_tri' : 'ac_mono';
    setVal('cbl-ac-mode', acMode);
    onAcModeChange({ silent: true });
    if (Ppeak) setVal('cbl-ac-p', Math.round(Ppeak * 1000 * 0.97)); // ≈ pertes onduleur 3%
    estimateAcCurrent({ silent: true });
    if (!val('cbl-ac-l')) estimateAcLength({ silent: true });

    const note = document.getElementById('cbl-dc-prefill-note');
    if (note) {
      if (noteParts.length) {
        note.style.display = '';
        note.innerHTML = `🔎 Préremplissage : ${noteParts.join(' · ')}. Type d'installation : <strong>${installType}</strong>. Vérifiez chaque valeur avant de calculer.`;
      } else {
        note.style.display = 'none';
      }
    }
  }

  // ── Helpers longueur / électrique (DC) ──
  function estimateDcLength(opts = {}) {
    const len = CableCalc.estimateDcLength({
      nPanels:            numVal('cbl-dc-npanels') || 1,
      rows:               numVal('cbl-dc-rows') || 1,
      pitch:              numVal('cbl-dc-pitch') || 1.8,
      distanceToInverter: numVal('cbl-dc-dist-inv') || 0,
    });
    setVal('cbl-dc-l', len);
    if (!opts.silent && typeof showToast === 'function') showToast(`Longueur DC estimée : ${len} m (aller)`);
  }

  function estimateDcElectrical(opts = {}) {
    const isc = numVal('cbl-dc-isc') || 0;
    const voc = numVal('cbl-dc-voc') || 0;
    const strings = numVal('cbl-dc-strings-parallel') || 1;
    const series  = numVal('cbl-dc-panels-series') || 1;
    if (isc > 0) setVal('cbl-dc-i', CableCalc.estimateStringCurrent({ iscPerPanel: isc, stringsParallel: strings }));
    if (voc > 0) setVal('cbl-dc-u', CableCalc.estimateStringVoltage({ vocPerPanel: voc, panelsSeries: series }));
    if (!opts.silent && typeof showToast === 'function') showToast('Courant/tension DC estimés (Isc×1,25 sécurité, Voc×nb série)');
  }

  // ── Helpers longueur / électrique (AC) ──
  function estimateAcLength(opts = {}) {
    const distEl = document.getElementById('cbl-ac-dist');
    const raw = distEl?.value;
    // Distance vide → défaut résidentiel 8 m (sinon L=0 bloque Calculer)
    const distance = (raw === '' || raw == null)
      ? (opts.defaultDistance ?? 8)
      : Math.max(0, numVal('cbl-ac-dist') || 0);
    if ((raw === '' || raw == null) && distEl) distEl.value = String(distance);
    const len = CableCalc.estimateAcLength({ distance });
    setVal('cbl-ac-l', len);
    if (!opts.silent && typeof showToast === 'function') showToast(`Longueur AC estimée : ${len} m (aller)`);
  }

  function estimateAcCurrent(opts = {}) {
    const P = numVal('cbl-ac-p') || 0;
    const U = numVal('cbl-ac-u') || 230;
    const mode = val('cbl-ac-mode') || 'ac_mono';
    const cosPhi = numVal('cbl-ac-cosphi') || 1;
    if (P > 0) {
      const i = CableCalc.estimateAcCurrent({ P_W: P, U_system: U, circuit: mode, cosPhi });
      setVal('cbl-ac-i', i);
      if (!opts.silent && typeof showToast === 'function') showToast(`Courant AC estimé : ${i} A`);
    }
  }

  function onAcModeChange(opts = {}) {
    const mode = val('cbl-ac-mode');
    const uEl  = document.getElementById('cbl-ac-u');
    if (uEl) {
      const current = parseFloat(uEl.value);
      // Ne remplace la tension que si vide ou encore sur une valeur "par défaut" standard
      if (!uEl.value || current === 230 || current === 400) {
        uEl.value = mode === 'ac_tri' ? 400 : 230;
      }
    }
    if (!opts.silent) estimateAcCurrent({ silent: true });
  }

  // ── Calcul principal ──
  function calc() {
    const dcParams = {
      I: numVal('cbl-dc-i'), L: numVal('cbl-dc-l'), U_system: numVal('cbl-dc-u'),
      maxDropPct: numVal('cbl-dc-maxdrop') || CableCalc.DEFAULT_MAX_DROP_PCT.dc,
      material: val('cbl-dc-material') || 'Cu', circuit: 'dc',
    };
    const acParams = {
      I: numVal('cbl-ac-i'), L: numVal('cbl-ac-l'), U_system: numVal('cbl-ac-u'),
      maxDropPct: numVal('cbl-ac-maxdrop') || CableCalc.DEFAULT_MAX_DROP_PCT.ac,
      material: val('cbl-ac-material') || 'Cu', circuit: val('cbl-ac-mode') || 'ac_mono',
      cosPhi: numVal('cbl-ac-cosphi') || 1,
    };

    if (!dcParams.I || !dcParams.L || !dcParams.U_system) {
      showToast('Renseignez au minimum I, L et la tension côté DC.', 'error');
      return;
    }
    if (!acParams.I || !acParams.L || !acParams.U_system) {
      showToast('Renseignez au minimum I, L et la tension côté AC.', 'error');
      return;
    }

    const dcResult = CableCalc.calcSection(dcParams);
    const acResult = CableCalc.calcSection(acParams);

    AppState.lastCableResult = { dc: dcResult, ac: acResult };
    render(dcResult, acResult);

    if (typeof gitAutoSave === 'function') {
      gitAutoSave(`Calcul câblage — DC ${dcResult.sectionMm2}mm² / AC ${acResult.sectionMm2}mm²`);
    }
  }

  // ── Rendu résultats ──
  function circuitLabel(circuit) {
    return CableCalc.CIRCUIT_TYPES[circuit]?.label || circuit;
  }

  function sectionTableHtml(result, idPrefix) {
    return `
      <table class="data-table" id="${idPrefix}-table" style="margin-top:8px">
        <thead>
          <tr><th>Section</th><th>Chute ΔU</th><th>Chute %</th><th>Pertes</th><th>Conforme</th></tr>
        </thead>
        <tbody>
          ${result.table.map(r => `
            <tr style="${r.recommended ? 'background:rgba(30,90,200,0.08);font-weight:700' : ''}">
              <td>${r.section} mm²${r.recommended ? ' ✓' : ''}</td>
              <td>${r.dropV} V</td>
              <td>${r.dropPct} %</td>
              <td>${r.lossW} W</td>
              <td>${r.ok ? '✅' : '❌'}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function kpiBlockHtml(title, result) {
    return `
      <div class="card">
        <div class="card-title">${title}</div>
        <div class="kpi-grid" style="margin-bottom:4px">
          <div class="kpi-card" style="border-left:3px solid var(--color-primary)">
            <div class="kpi-value accent">${result.sectionRecommended}</div>
            <div class="kpi-label">Section recommandée<br><span class="kpi-unit">mm² — ${MATERIALS_LABEL(result.input.material)}</span></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">${result.dropPct} %</div>
            <div class="kpi-label">Chute de tension<br><span class="kpi-unit">visée ≤ ${result.input.maxDropPct} %</span></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">${result.dropV} V</div>
            <div class="kpi-label">Chute de tension<br><span class="kpi-unit">${circuitLabel(result.input.circuit)}</span></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value" style="color:${result.lossW > 50 ? 'var(--color-danger)' : 'var(--color-success)'}">${result.lossW}</div>
            <div class="kpi-label">Pertes Joule<br><span class="kpi-unit">W</span></div>
          </div>
        </div>
        ${result.warning ? `<div class="alert alert-warning">${result.warning}</div>` : ''}
        <div style="font-size:11px;color:var(--color-text-muted)">I = ${result.input.I} A · L (aller) = ${result.input.L} m · U = ${result.input.U_system} V</div>
      </div>`;
  }

  function MATERIALS_LABEL(m) { return CableCalc.MATERIALS[m]?.label || m; }

  function render(dcResult, acResult) {
    const el = document.getElementById('cables-results');
    el.innerHTML = `
      ${kpiBlockHtml('Câblage DC (strings PV)', dcResult)}
      <details class="card" style="margin-top:10px">
        <summary class="card-title" style="cursor:pointer;user-select:none">Détail sections normalisées — DC</summary>
        ${sectionTableHtml(dcResult, 'cbl-dc')}
      </details>

      ${kpiBlockHtml('Câblage AC (onduleur → tableau)', acResult)}
      <details class="card" style="margin-top:10px">
        <summary class="card-title" style="cursor:pointer;user-select:none">Détail sections normalisées — AC</summary>
        ${sectionTableHtml(acResult, 'cbl-ac')}
      </details>

      <button type="button" class="btn btn-primary" style="width:100%;margin-top:12px" onclick="CablesUI.sendToQuote()">
        → Envoyer au devis (ligne câblage)
      </button>`;
  }

  // ── Envoi vers le devis ──
  function sendToQuote() {
    const res = AppState.lastCableResult;
    if (!res) { showToast('Calculez d\'abord le câblage.', 'error'); return; }

    if (typeof QuoteLines !== 'undefined') QuoteLines.boot();
    const labelEl = document.getElementById('dv-line-cabling-label');
    if (!labelEl) { showToast('Onglet Devis introuvable.', 'error'); return; }

    const dcMat = MATERIALS_LABEL(res.dc.input.material);
    const acMat = MATERIALS_LABEL(res.ac.input.material);
    const label = `Câblage DC ${res.dc.sectionRecommended} mm² ${dcMat} (${res.dc.input.L} m) `
      + `+ AC ${res.ac.sectionRecommended} mm² ${acMat} (${res.ac.input.L} m) + protections`;

    if (typeof QuoteLines !== 'undefined') {
      const qty = parseFloat(document.getElementById('dv-line-cabling-qty')?.value) || 0;
      QuoteLines.setLine('cabling', {
        label,
        qty: qty > 0 ? qty : 1,
        unit: document.getElementById('dv-line-cabling-unit')?.value || 'forfait',
      });
    } else {
      labelEl.value = label;
      const qtyEl  = document.getElementById('dv-line-cabling-qty');
      const unitEl = document.getElementById('dv-line-cabling-unit');
      if (unitEl && !unitEl.value) unitEl.value = 'forfait';
      if (qtyEl && (!qtyEl.value || qtyEl.value === '0')) qtyEl.value = 1;
      if (typeof updateQuoteLine === 'function') updateQuoteLine('cabling');
    }

    showToast('✓ Ligne de câblage envoyée au devis');
    if (typeof goNextPrimaryTab === 'function') goNextPrimaryTab();
    else if (typeof activateTab === 'function') activateTab('daily');
  }

  return {
    prefill, calc,
    estimateDcLength, estimateDcElectrical,
    estimateAcLength, estimateAcCurrent, onAcModeChange,
    sendToQuote,
  };
})();

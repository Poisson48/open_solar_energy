/**
 * renderers/quote.js - Onglet Devis professionnel
 * Dépend de : app_state.js, quote_generator.js
 */

function updateQuoteLine(key) {
  const qty   = parseFloat(document.getElementById(`dv-line-${key}-qty`)?.value)   || 0;
  const price = parseFloat(document.getElementById(`dv-line-${key}-price`)?.value) || 0;
  const total = qty * price;
  const el    = document.getElementById(`dv-line-${key}-total`);
  if (el) el.textContent = total > 0
    ? total.toLocaleString('fr', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
    : '-';
  updateQuoteTotals();
}

function updateQuoteTotals() {
  const lineIds    = ['panels', 'inverter', 'fixations', 'cabling', 'labor', 'admin', 'misc'];
  const subtotalHT = lineIds.reduce((s, k) => {
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
    // Production annuelle estimée depuis le bilan mensuel
    if (Array.isArray(rec.monthly) && typeof DAYS_IN_MONTH !== 'undefined') {
      const annualProd = rec.monthly.reduce((s, m, i) => {
        const days = DAYS_IN_MONTH[i] || 30;
        return s + (m.e_prod_day || 0) * days;
      }, 0);
      if (annualProd > 0) setVal('dv-sys-prod', Math.round(annualProd));
    }
    // Lignes de coût hors-réseau
    if (rec.costPV > 0) {
      setVal('dv-line-panels-qty', 1);
      setVal('dv-line-panels-price', rec.costPV);
      if (typeof updateQuoteLine === 'function') updateQuoteLine('panels');
    }
    if (rec.costBatt > 0) {
      const battLine = document.getElementById('dv-line-misc-label');
      const battTech = document.getElementById('og2-batt-tech');
      const techKey  = battTech?.value || '';
      const techLabel = (typeof OffgridSizing !== 'undefined'
        && OffgridSizing.BATTERY_TECH?.[techKey]?.label) || 'Batterie';
      if (battLine) battLine.value = `${techLabel} ${rec.C_batt_gross} kWh`;
      setVal('dv-line-misc-qty', 1);
      setVal('dv-line-misc-unit', 'u');
      setVal('dv-line-misc-price', rec.costBatt);
      if (typeof updateQuoteLine === 'function') updateQuoteLine('misc');
    }
  } else {
    if (rec?.Ppeak && inp?.site?.panelWattPeak)
      setVal('dv-sys-panels', Math.ceil(rec.Ppeak * 1000 / inp.site.panelWattPeak));
    if (rec?.annualProd)  setVal('dv-sys-prod',    Math.round(rec.annualProd));
    if (rec?.co2Saved)    setVal('dv-sys-co2',     Math.round(rec.co2Saved));

    // Batterie hybride (réseau + stockage)
    if (rec?.battery?.capacityKwh) {
      setVal('dv-sys-batt', rec.battery.capacityKwh);
      const battLine = document.getElementById('dv-line-misc-label');
      if (battLine && !battLine.value) {
        const battTechLabel = (typeof OffgridSizing !== 'undefined'
          && OffgridSizing.BATTERY_TECH[rec.battery.type]?.label) || rec.battery.type;
        battLine.value = `Batterie ${battTechLabel} ${rec.battery.capacityKwh} kWh`;
        setVal('dv-line-misc-qty', 1);
        setVal('dv-line-misc-unit', 'u');
        setVal('dv-line-misc-price', rec.battery.cost || 0);
        if (typeof updateQuoteLine === 'function') updateQuoteLine('misc');
      }
    }
  }

  // Modèle panneau : dimensionnement / réseau / hors-réseau
  const panelModelEl = document.getElementById('dv-sys-panel-model');
  if (panelModelEl && !panelModelEl.value) {
    const modelSz  = (document.getElementById('sz-panel-model')?.value  || '').trim();
    const modelInp = (document.getElementById('inp-panel-model')?.value || '').trim();
    const modelOg  = (document.getElementById('og2-panel-model')?.value || '').trim();
    if (modelSz) panelModelEl.value = modelSz;
    else if (modelOg) panelModelEl.value = modelOg;
    else if (modelInp) panelModelEl.value = modelInp;
  }

  setVal('dv-site-address', AppState.location.name || '');
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

function initQuoteTab() {
  loadInstallerData();
  const dateEl = document.getElementById('dv-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toLocaleDateString('fr-FR');
  updateQuoteTotals();
  document.getElementById('dv-tva')?.addEventListener('change', updateQuoteTotals);
  document.getElementById('dv-remise')?.addEventListener('input', updateQuoteTotals);
}

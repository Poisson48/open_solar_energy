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
  const rec = AppState.lastSizingResult;
  const inp = AppState.lastSizingInput;
  if (!rec && !inp) { showToast('⚠ Lancez d\'abord un dimensionnement.', 'error'); return; }
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };

  if (rec?.Ppeak)       setVal('dv-sys-ppeak',   rec.Ppeak);
  if (rec?.Ppeak && inp?.site?.panelWattPeak)
    setVal('dv-sys-panels', Math.ceil(rec.Ppeak * 1000 / inp.site.panelWattPeak));
  if (rec?.annualProd)  setVal('dv-sys-prod',    Math.round(rec.annualProd));
  if (rec?.co2Saved)    setVal('dv-sys-co2',     Math.round(rec.co2Saved));

  // Propager le modele panneau depuis les onglets dimensionnement / réseau
  const panelModelEl = document.getElementById('dv-sys-panel-model');
  if (panelModelEl && !panelModelEl.value) {
    const modelSz  = (document.getElementById('sz-panel-model')?.value  || '').trim();
    const modelInp = (document.getElementById('inp-panel-model')?.value || '').trim();
    if (modelSz)  panelModelEl.value = modelSz;
    else if (modelInp) panelModelEl.value = modelInp;
  }

  setVal('dv-site-address', AppState.location.name || '');
  if (inp?.tilt)                   setVal('dv-site-tilt',    inp.tilt);
  if (inp?.azimuth !== undefined)  setVal('dv-site-azimuth', inp.azimuth);
  if (inp?.surface)                setVal('dv-site-surface', inp.surface);

  const dateEl = document.getElementById('dv-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toLocaleDateString('fr-FR');

  showToast('✓ Données importées depuis le dimensionnement');
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

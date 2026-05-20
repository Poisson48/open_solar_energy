/**
 * quote_generator.js - Générateur de devis professionnel
 *
 * Fonctions exposées :
 *   QuoteGen.readForm()          → lit le formulaire devis
 *   QuoteGen.saveInstaller(data) → sauvegarde infos installateur (localStorage)
 *   QuoteGen.loadInstaller()     → charge infos installateur
 *   QuoteGen.buildHTML(data)     → génère le HTML du devis (pour aperçu + impression)
 *   QuoteGen.print(data)         → ouvre la fenêtre d'impression
 *   QuoteGen.calcTotals(lines,tva) → calcule les totaux
 */

const QuoteGen = (() => {

  const INSTALLER_KEY = 'ose_installer_v1';
  const TVA_RATES = { '5.5': 0.055, '10': 0.10, '20': 0.20 };

  // ── Persistence installateur ──────────────────────────────────
  function saveInstaller(data) {
    localStorage.setItem(INSTALLER_KEY, JSON.stringify(data));
  }
  function loadInstaller() {
    try { return JSON.parse(localStorage.getItem(INSTALLER_KEY) || '{}'); }
    catch { return {}; }
  }

  // ── Lecture du formulaire ─────────────────────────────────────
  function readForm() {
    const v = id => (document.getElementById(id)?.value || '').trim();
    const n = id => parseFloat(document.getElementById(id)?.value) || 0;

    // Lignes de coût
    const lineIds = ['panels','inverter','fixations','cabling','labor','admin','misc'];
    const lines = lineIds.map(k => ({
      key: k,
      label:  v(`dv-line-${k}-label`),
      qty:    n(`dv-line-${k}-qty`),
      unit:   v(`dv-line-${k}-unit`),
      unitHT: n(`dv-line-${k}-price`),
      totalHT: n(`dv-line-${k}-qty`) * n(`dv-line-${k}-price`)
    })).filter(l => l.totalHT > 0 || l.label);

    const tvaRate = v('dv-tva') || '10';
    const remisePct = n('dv-remise');
    const totals = calcTotals(lines, tvaRate, remisePct);

    return {
      installer: {
        company: v('dv-ins-company'), siret: v('dv-ins-siret'),
        address: v('dv-ins-address'), phone: v('dv-ins-phone'),
        email: v('dv-ins-email'), rge: v('dv-ins-rge')
      },
      client: {
        name: v('dv-cli-name'), company: v('dv-cli-company'),
        address: v('dv-cli-address'), phone: v('dv-cli-phone'),
        email: v('dv-cli-email')
      },
      chantier: {
        address: v('dv-site-address'), type: v('dv-site-type'),
        surface: n('dv-site-surface'), tilt: n('dv-site-tilt'),
        azimuth: n('dv-site-azimuth')
      },
      system: {
        ppeak: n('dv-sys-ppeak'), panels: n('dv-sys-panels'),
        panelModel: v('dv-sys-panel-model'), inverterModel: v('dv-sys-inverter'),
        battCapacity: n('dv-sys-batt'), annualProd: n('dv-sys-prod'),
        co2: n('dv-sys-co2'), autonomy: v('dv-sys-autonomy')
      },
      lines,
      tvaRate,
      remisePct,
      totals,
      notes: v('dv-notes'),
      validity: v('dv-validity') || '30',
      date: v('dv-date') || new Date().toLocaleDateString('fr-FR'),
      ref: v('dv-ref') || ('DEV-' + Date.now().toString(36).toUpperCase().slice(-6))
    };
  }

  // ── Calcul des totaux ─────────────────────────────────────────
  function calcTotals(lines, tvaRate, remisePct = 0) {
    const subtotalHT = lines.reduce((s, l) => s + (l.totalHT || 0), 0);
    const remise     = subtotalHT * (remisePct / 100);
    const baseHT     = subtotalHT - remise;
    const tva        = baseHT * (TVA_RATES[tvaRate] || 0.10);
    return {
      subtotalHT: Math.round(subtotalHT * 100) / 100,
      remise:     Math.round(remise     * 100) / 100,
      baseHT:     Math.round(baseHT     * 100) / 100,
      tva:        Math.round(tva        * 100) / 100,
      totalTTC:   Math.round((baseHT + tva) * 100) / 100,
      tvaRate
    };
  }

  // ── Formatage ─────────────────────────────────────────────────
  function fmt(n) { return Number(n).toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}); }
  function fmtDate() { return new Date().toLocaleDateString('fr-FR'); }

  // ── Génération HTML du devis ──────────────────────────────────
  function buildHTML(d) {
    const lineRows = d.lines.map(l => `
      <tr>
        <td>${l.label}</td>
        <td style="text-align:center">${l.qty > 0 ? l.qty : ''}</td>
        <td style="text-align:center">${l.unit}</td>
        <td style="text-align:right">${l.qty > 0 ? fmt(l.unitHT) : ''}</td>
        <td style="text-align:right;font-weight:600">${fmt(l.totalHT)} €</td>
      </tr>`).join('');

    const remiseLine = d.remisePct > 0 ? `
      <tr style="color:#e53935">
        <td colspan="4" style="text-align:right;font-style:italic">Remise ${d.remisePct}%</td>
        <td style="text-align:right">− ${fmt(d.totals.remise)} €</td>
      </tr>` : '';

    const sysRows = [
      d.system.ppeak       ? `<tr><td>Puissance crête</td><td><strong>${d.system.ppeak} kWc</strong></td></tr>` : '',
      d.system.panels      ? `<tr><td>Nombre de panneaux</td><td>${d.system.panels} modules</td></tr>` : '',
      d.system.panelModel  ? `<tr><td>Modèle panneau</td><td>${d.system.panelModel}</td></tr>` : '',
      d.system.inverterModel ? `<tr><td>Onduleur</td><td>${d.system.inverterModel}</td></tr>` : '',
      d.system.battCapacity ? `<tr><td>Batterie</td><td>${d.system.battCapacity} kWh</td></tr>` : '',
      d.system.annualProd  ? `<tr><td>Production annuelle estimée</td><td>${Math.round(d.system.annualProd).toLocaleString('fr')} kWh/an</td></tr>` : '',
      d.system.co2         ? `<tr><td>CO₂ évité</td><td>${Math.round(d.system.co2)} kg/an</td></tr>` : '',
      d.system.autonomy    ? `<tr><td>Autonomie estimée</td><td>${d.system.autonomy}</td></tr>` : '',
    ].filter(Boolean).join('');

    const chantierStr = [
      d.chantier.address,
      d.chantier.type ? `Type : ${d.chantier.type}` : '',
      d.chantier.surface ? `Surface : ${d.chantier.surface} m²` : '',
      d.chantier.tilt ? `Inclinaison : ${d.chantier.tilt}° / Azimut : ${d.chantier.azimuth}°` : '',
    ].filter(Boolean).join('<br>');

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Devis ${d.ref}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; background: #fff; padding: 20mm; }
  .dv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid #1565c0; }
  .dv-logo { font-size: 18pt; font-weight: 800; color: #1565c0; }
  .dv-logo span { color: #f5a623; }
  .dv-ins-info { font-size: 9pt; color: #555; text-align: right; line-height: 1.6; }
  .dv-title-block { text-align: center; margin: 18px 0; }
  .dv-title-block h2 { font-size: 20pt; font-weight: 700; color: #1565c0; letter-spacing: 2px; }
  .dv-title-block .ref { font-size: 10pt; color: #888; margin-top: 4px; }
  .dv-parties { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin: 16px 0; }
  .dv-box { border: 1px solid #dde3ed; border-radius: 6px; padding: 12px 14px; }
  .dv-box h4 { font-size: 9pt; font-weight: 700; color: #1565c0; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; border-bottom: 1px solid #dde3ed; padding-bottom: 4px; }
  .dv-box p { font-size: 10pt; line-height: 1.65; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; }
  thead th { background: #1565c0; color: #fff; padding: 8px 10px; font-size: 10pt; text-align: left; }
  tbody tr:nth-child(even) { background: #f4f7fc; }
  tbody td { padding: 7px 10px; font-size: 10pt; border-bottom: 1px solid #e8edf5; vertical-align: middle; }
  .dv-sys table thead th { background: #e8f0fb; color: #1565c0; }
  .totals-box { margin-left: auto; width: 320px; border: 1px solid #dde3ed; border-radius: 6px; padding: 12px 16px; margin-top: 8px; }
  .totals-box tr td { padding: 4px 6px; font-size: 10pt; border: none; background: none; }
  .totals-box .ttc td { background: #1565c0; color: #fff; font-weight: 700; font-size: 12pt; border-radius: 4px; padding: 8px 6px; }
  .notes { margin-top: 18px; font-size: 9.5pt; color: #555; line-height: 1.6; border-top: 1px solid #dde3ed; padding-top: 12px; }
  .footer { margin-top: 24px; font-size: 8.5pt; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
  .validity { background: #fffde7; border: 1px solid #f9a825; border-radius: 4px; padding: 6px 12px; font-size: 9.5pt; display: inline-block; margin-top: 10px; }
  .rge-badge { background: #e8f5e9; border: 1px solid #4caf50; color: #1b5e20; border-radius: 4px; padding: 2px 8px; font-size: 9pt; display: inline-block; margin-top: 4px; }
  @page { size: A4; margin: 15mm; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>

<div class="dv-header">
  <div>
    <div class="dv-logo">☀ Open<span>Solar</span></div>
    <div style="font-size:10pt;color:#1565c0;margin-top:2px">Dimensionnement &amp; Devis photovoltaïque</div>
    ${d.installer.rge ? `<div class="rge-badge">✓ Certifié RGE n° ${d.installer.rge}</div>` : ''}
  </div>
  <div class="dv-ins-info">
    ${d.installer.company ? `<strong>${d.installer.company}</strong><br>` : ''}
    ${d.installer.address ? d.installer.address.replace(/\n/g,'<br>') + '<br>' : ''}
    ${d.installer.phone   ? `☎ ${d.installer.phone}<br>` : ''}
    ${d.installer.email   ? `✉ ${d.installer.email}<br>` : ''}
    ${d.installer.siret   ? `SIRET : ${d.installer.siret}` : ''}
  </div>
</div>

<div class="dv-title-block">
  <h2>DEVIS</h2>
  <div class="ref">Réf. ${d.ref} · Établi le ${d.date}</div>
</div>

<div class="dv-parties">
  <div class="dv-box">
    <h4>Client</h4>
    <p>
      ${d.client.company ? `<strong>${d.client.company}</strong><br>` : ''}
      ${d.client.name    ? d.client.name + '<br>' : ''}
      ${d.client.address ? d.client.address.replace(/\n/g,'<br>') + '<br>' : ''}
      ${d.client.phone   ? `☎ ${d.client.phone}<br>` : ''}
      ${d.client.email   ? `✉ ${d.client.email}` : ''}
    </p>
  </div>
  <div class="dv-box">
    <h4>Site d'installation</h4>
    <p>${chantierStr || '-'}</p>
  </div>
  <div class="dv-box">
    <h4>Système PV</h4>
    <table style="margin:0">${sysRows || '<tr><td>-</td></tr>'}</table>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:42%">Désignation</th>
      <th style="width:10%;text-align:center">Qté</th>
      <th style="width:12%;text-align:center">Unité</th>
      <th style="width:16%;text-align:right">Prix unit. HT</th>
      <th style="width:20%;text-align:right">Montant HT</th>
    </tr>
  </thead>
  <tbody>
    ${lineRows}
    ${remiseLine}
  </tbody>
</table>

<table class="totals-box">
  <tbody>
    <tr><td>Sous-total HT</td><td style="text-align:right">${fmt(d.totals.subtotalHT)} €</td></tr>
    ${d.remisePct > 0 ? `<tr style="color:#e53935"><td>Remise (${d.remisePct}%)</td><td style="text-align:right">− ${fmt(d.totals.remise)} €</td></tr>` : ''}
    <tr><td>Base HT</td><td style="text-align:right"><strong>${fmt(d.totals.baseHT)} €</strong></td></tr>
    <tr><td>TVA (${d.tvaRate}%)</td><td style="text-align:right">${fmt(d.totals.tva)} €</td></tr>
    <tr class="ttc"><td>TOTAL TTC</td><td style="text-align:right">${fmt(d.totals.totalTTC)} €</td></tr>
  </tbody>
</table>

<div class="validity">⏱ Devis valable <strong>${d.validity} jours</strong> à compter du ${d.date}</div>

${d.notes ? `<div class="notes"><strong>Notes et conditions :</strong><br>${d.notes.replace(/\n/g,'<br>')}</div>` : ''}

<div class="notes" style="margin-top:14px">
  <strong>Signature du client</strong> (précédée de la mention « Bon pour accord ») :<br>
  <div style="height:40px;border-bottom:1px solid #ccc;margin-top:8px;width:60%"></div>
</div>

<div class="footer">
  Devis généré par Open Solar Energy v${typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''} - open source · Document non contractuel avant signature
</div>

</body></html>`;
  }

  // ── Impression ────────────────────────────────────────────────
  function print(data) {
    const html = buildHTML(data || readForm());
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('Autorisez les popups pour imprimer le devis.'); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
  }

  // ── Aperçu dans la page ───────────────────────────────────────
  function preview(data) {
    const html = buildHTML(data || readForm());
    const frame = document.getElementById('dv-preview-frame');
    if (!frame) return;
    frame.srcdoc = html;
  }

  return { readForm, saveInstaller, loadInstaller, buildHTML, print, preview, calcTotals, fmt };
})();

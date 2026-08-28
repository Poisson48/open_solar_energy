/**
 * pdf_export.js — Génération de vrais fichiers PDF (devis + rapport)
 * Utilise html2pdf.js (jsPDF + html2canvas) via CDN.
 * Sur Android : partage natif via ProjectManager._downloadOrShare.
 */
const PdfExport = (() => {

  function _toast(msg, kind) {
    if (typeof showToast === 'function') showToast(msg, kind || 'ok');
  }

  function _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _fmt(n, d = 0) {
    return Number(n).toLocaleString('fr-FR', {
      minimumFractionDigits: d, maximumFractionDigits: d
    });
  }

  function _hasHtml2Pdf() {
    return typeof html2pdf === 'function';
  }

  /** Convertit un HTML complet en Blob PDF. */
  async function htmlToPdfBlob(html, opts = {}) {
    if (!_hasHtml2Pdf()) throw new Error('html2pdf indisponible (réseau / CDN)');

    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'pdf-render');
    iframe.style.cssText = 'position:fixed;left:-12000px;top:0;width:794px;height:2000px;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    // Attendre fonts / layout
    await new Promise(r => setTimeout(r, 350));
    try {
      if (doc.fonts?.ready) await doc.fonts.ready;
    } catch (_) {}

    const target = doc.body;
    if (!target || target.childElementCount === 0)
      throw new Error('Document PDF vide');

    try {
      const worker = html2pdf().set({
        margin:       opts.margin ?? [10, 10, 12, 10],
        filename:     opts.filename || 'document.pdf',
        image:        { type: 'jpeg', quality: 0.92 },
        html2canvas:  {
          scale: opts.scale ?? 1.5,
          useCORS: true,
          logging: false,
          windowWidth: 794,
          scrollY: 0,
          scrollX: 0,
        },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] },
      }).from(target);

      const blob = await worker.outputPdf('blob');
      if (!blob || blob.size < 8000)
        throw new Error('PDF trop petit (' + (blob?.size || 0) + ' o) — rendu incomplet');
      return blob;
    } finally {
      iframe.remove();
    }
  }

  async function savePdf(blob, filename) {
    if (!blob || blob.size < 100) throw new Error('PDF vide');
    if (typeof ProjectManager !== 'undefined' && ProjectManager._downloadOrShare) {
      await ProjectManager._downloadOrShare(filename, blob, 'application/pdf');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /** Fallback : ouvrir HTML dans un onglet / iframe pour impression navigateur. */
  function openPrintableHtml(html) {
    const win = window.open('', '_blank');
    if (!win) {
      _toast('Pop-ups bloqués — autorisez-les ou utilisez le téléchargement PDF.', 'warning');
      return false;
    }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { try { win.focus(); win.print(); } catch (_) {} }, 400);
    return true;
  }

  // ── Enrichissement devis avec données dimensionnement ─────────
  function enrichQuoteData(d) {
    const data = JSON.parse(JSON.stringify(d || (typeof QuoteGen !== 'undefined' ? QuoteGen.readForm() : {})));
    const rec = (typeof AppState !== 'undefined') ? AppState.lastSizingResult : null;
    const loc = (typeof AppState !== 'undefined') ? AppState.location : null;
    data.extras = data.extras || {};
    if (loc?.name) data.extras.locationName = loc.name;
    if (loc?.lat != null) data.extras.lat = loc.lat;
    if (loc?.lon != null) data.extras.lon = loc.lon;
    data.extras.projectName = document.getElementById('project-name-input')?.value || '';
    data.extras.installType = (typeof AppState !== 'undefined' ? AppState.installationType : 'grid') || 'grid';
    if (rec) {
      data.extras.sizing = {
        Ppeak: rec.Ppeak,
        nPanels: rec.nPanels,
        annualProd: rec.annualProd,
        annualConso: rec.annualConso,
        annualAutoconsoKwh: rec.annualAutoconsoKwh,
        autoconsoRate: rec.autoconsoRate,
        coverageRate: rec.coverageRate,
        paybackYears: rec.paybackYears,
        npv25: rec.npv25,
        lcoe: rec.lcoe,
        incentive: rec.incentive,
        incentiveMode: rec.incentiveMode,
        systemCost: rec.systemCost,
        systemCostBrut: rec.systemCostBrut,
        savedOnBill: rec.savedOnBill,
        feedinRevenue: rec.feedinRevenue,
        totalAnnualGain: rec.totalAnnualGain,
        battery: rec.battery || null,
        monthly: (rec.monthlyMetrics || []).map(m => ({
          name: m.name, prod: m.prod, conso: m.conso,
          autoconsoKwh: m.autoconsoKwh, surplus: m.surplus, deficit: m.deficit
        }))
      };
      // Compléter système devis si vide
      if (!data.system.ppeak && rec.Ppeak) data.system.ppeak = rec.Ppeak;
      if (!data.system.panels && rec.nPanels) data.system.panels = rec.nPanels;
      if (!data.system.annualProd && rec.annualProd) data.system.annualProd = Math.round(rec.annualProd);
      if (!data.system.co2 && rec.co2Saved) data.system.co2 = Math.round(rec.co2Saved);
      if (!data.system.battCapacity && rec.battery?.capacityKwh)
        data.system.battCapacity = rec.battery.capacityKwh;
    }
    return data;
  }

  function buildCompleteQuoteHTML(data) {
    const d = enrichQuoteData(data);
    let html = (typeof QuoteGen !== 'undefined') ? QuoteGen.buildHTML(d) : '<html><body>Devis</body></html>';
    const sx = d.extras?.sizing;
    if (!sx) return html;

    const typeLabel = { grid: 'Réseau', hybrid: 'Hybride (réseau + batterie)', offgrid: 'Autonome' }[d.extras.installType] || d.extras.installType;
    const monthRows = (sx.monthly || []).map(m =>
      `<tr>
        <td>${_esc(m.name)}</td>
        <td style="text-align:right">${_fmt(m.conso, 0)}</td>
        <td style="text-align:right">${_fmt(m.prod, 0)}</td>
        <td style="text-align:right">${_fmt(m.autoconsoKwh, 0)}</td>
        <td style="text-align:right">${_fmt(m.surplus, 0)}</td>
        <td style="text-align:right">${_fmt(m.deficit, 0)}</td>
      </tr>`).join('');

    const financeBits = [
      sx.paybackYears != null ? `<tr><td>Temps de retour</td><td><strong>${sx.paybackYears} ans</strong></td></tr>` : '',
      sx.npv25 != null ? `<tr><td>VAN 25 ans</td><td><strong>${sx.npv25 >= 0 ? '+' : ''}${_fmt(sx.npv25, 0)} €</strong></td></tr>` : '',
      sx.lcoe > 0 ? `<tr><td>LCOE</td><td>${_fmt(sx.lcoe, 3)} €/kWh</td></tr>` : '',
      sx.incentive > 0 ? `<tr><td>Prime d’État${sx.incentiveMode === 'manual' ? ' (manuelle)' : ''}</td><td>${_fmt(sx.incentive, 0)} €</td></tr>` : '',
      sx.savedOnBill != null ? `<tr><td>Économies facture / an</td><td>${_fmt(sx.savedOnBill, 0)} €</td></tr>` : '',
      sx.feedinRevenue != null ? `<tr><td>Revente surplus / an</td><td>${_fmt(sx.feedinRevenue, 0)} €</td></tr>` : '',
      sx.totalAnnualGain != null ? `<tr><td>Gain annuel total</td><td><strong>${_fmt(sx.totalAnnualGain, 0)} €</strong></td></tr>` : '',
      sx.battery ? `<tr><td>Batterie</td><td>${sx.battery.capacityKwh} kWh (${sx.battery.type})</td></tr>` : '',
    ].filter(Boolean).join('');

    const extra = `
<div style="page-break-before:always;margin-top:8mm">
  <h3 style="color:#1565c0;font-size:14pt;margin:0 0 10px;border-bottom:2px solid #1565c0;padding-bottom:6px">
    Annexe — Dimensionnement &amp; performance
  </h3>
  <p style="font-size:10pt;margin:0 0 10px;color:#555">
    ${d.extras.projectName ? `Projet <strong>${_esc(d.extras.projectName)}</strong> · ` : ''}
    Type : <strong>${_esc(typeLabel)}</strong>
    ${d.extras.locationName ? ` · Lieu : <strong>${_esc(d.extras.locationName)}</strong>` : ''}
    ${d.extras.lat != null ? ` (${Number(d.extras.lat).toFixed(4)}°, ${Number(d.extras.lon).toFixed(4)}°)` : ''}
  </p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
    <div class="dv-box">
      <h4>Indicateurs clés</h4>
      <table style="margin:0">
        <tr><td>Puissance</td><td><strong>${_fmt(sx.Ppeak, 1)} kWc</strong> (${sx.nPanels || '—'} panneaux)</td></tr>
        <tr><td>Production / an</td><td>${_fmt(sx.annualProd, 0)} kWh</td></tr>
        <tr><td>Consommation / an</td><td>${_fmt(sx.annualConso, 0)} kWh</td></tr>
        <tr><td>Autoconsommation</td><td>${_fmt(sx.autoconsoRate, 1)} %</td></tr>
        <tr><td>Couverture conso</td><td>${_fmt(sx.coverageRate, 1)} %</td></tr>
      </table>
    </div>
    <div class="dv-box">
      <h4>Économie &amp; aides</h4>
      <table style="margin:0">${financeBits || '<tr><td>—</td></tr>'}</table>
    </div>
  </div>
  ${monthRows ? `
  <h4 style="color:#1565c0;font-size:11pt;margin:12px 0 6px">Bilan mensuel (kWh)</h4>
  <table>
    <thead><tr>
      <th>Mois</th><th style="text-align:right">Conso</th><th style="text-align:right">Prod</th>
      <th style="text-align:right">Autoconso</th><th style="text-align:right">Surplus</th><th style="text-align:right">Déficit</th>
    </tr></thead>
    <tbody>${monthRows}</tbody>
  </table>` : ''}
  <p style="font-size:8.5pt;color:#888;margin-top:12px">
    Annexe informative — les montants du devis commercial font foi. Calculs Open Solar Energy v${typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''}.
  </p>
</div>`;

    // Injecter avant </body>
    if (html.includes('</body>'))
      html = html.replace('</body>', extra + '</body>');
    else
      html += extra;
    return html;
  }

  /** Rapport dimensionnement (sans devis commercial). */
  function buildSizingReportHTML() {
    const rec = (typeof AppState !== 'undefined') ? AppState.lastSizingResult : null;
    const off = (typeof AppState !== 'undefined') ? AppState.lastOffgridSizingResult : null;
    const loc = (typeof AppState !== 'undefined') ? AppState.location : {};
    const name = document.getElementById('project-name-input')?.value || 'Projet';
    const client = (typeof AppState !== 'undefined' && AppState.currentClient?.nom) || '';
    const type = (typeof AppState !== 'undefined' ? AppState.installationType : 'grid') || 'grid';
    const typeLabel = { grid: 'Réseau', hybrid: 'Hybride', offgrid: 'Hors réseau' }[type] || type;

    if (!rec && !off) {
      return null;
    }

    let body = '';
    if (rec) {
      const monthRows = (rec.monthlyMetrics || []).map(m =>
        `<tr>
          <td>${_esc(m.name)}</td>
          <td style="text-align:right">${_fmt(m.conso, 0)}</td>
          <td style="text-align:right">${_fmt(m.prod, 0)}</td>
          <td style="text-align:right">${_fmt(m.autoconsoKwh, 0)}</td>
          <td style="text-align:right">${_fmt(m.surplus, 0)}</td>
          <td style="text-align:right">${_fmt(m.deficit, 0)}</td>
        </tr>`).join('');
      body += `
        <h2>Dimensionnement ${typeLabel}</h2>
        <div class="grid2">
          <div class="box"><h4>Système</h4>
            <p><strong>${_fmt(rec.Ppeak, 1)} kWc</strong> · ${rec.nPanels} panneaux<br>
            Surface ~ ${_fmt(rec.surfaceNeeded || 0, 1)} m²<br>
            ${rec.battery ? `Batterie ${rec.battery.capacityKwh} kWh (${_esc(rec.battery.type)})` : 'Sans batterie'}</p>
          </div>
          <div class="box"><h4>Performance</h4>
            <p>Prod. ${_fmt(rec.annualProd, 0)} kWh/an<br>
            Autoconso ${_fmt(rec.autoconsoRate, 1)} % · Couverture ${_fmt(rec.coverageRate, 1)} %<br>
            Retour ${rec.paybackYears != null ? rec.paybackYears + ' ans' : '—'}
            ${rec.incentive > 0 ? `<br>Prime ${_fmt(rec.incentive, 0)} €` : ''}</p>
          </div>
        </div>
        <div class="box"><h4>Finances</h4>
          <p>Coût brut ${_fmt(rec.systemCostBrut, 0)} € · Net ${_fmt(rec.systemCost, 0)} €<br>
          Économies / an ${_fmt(rec.savedOnBill || 0, 0)} € · Surplus ${_fmt(rec.feedinRevenue || 0, 0)} €<br>
          Gain annuel ${_fmt(rec.totalAnnualGain || 0, 0)} €
          ${rec.npv25 != null ? ` · VAN ${_fmt(rec.npv25, 0)} €` : ''}
          ${rec.lcoe > 0 ? ` · LCOE ${_fmt(rec.lcoe, 3)} €/kWh` : ''}</p>
        </div>
        <h3>Bilan mensuel (kWh)</h3>
        <table>
          <thead><tr><th>Mois</th><th>Conso</th><th>Prod</th><th>Autoconso</th><th>Surplus</th><th>Déficit</th></tr></thead>
          <tbody>${monthRows}</tbody>
        </table>`;
    }
    if (off?.recommended || off?.Ppeak) {
      const r = off.recommended || off;
      const eco = (typeof AppState !== 'undefined') ? AppState.lastOffgridSizingEconomic : null;
      const recRef = (typeof AppState !== 'undefined') ? (AppState.lastOffgridSizingRecommended || r) : r;
      body += `
        <h2 style="margin-top:18px">Hors réseau — Autonome</h2>
        <div class="grid2">
          <div class="box"><h4>Système</h4>
            <p><strong>${_fmt(r.Ppeak, 1)} kWc</strong> · ${r.nPanels || '—'} panneaux<br>
            Batterie ${r.C_batt_gross || r.battKwh || '—'} kWh (${_fmt(r.C_usable, 1)} kWh utiles)<br>
            Coût ${_fmt(r.systemCost, 0)} € HT</p>
          </div>
          <div class="box"><h4>Performance</h4>
            <p>Couverture ${_fmt(r.coverageRate ?? r.coverage, 1)} %<br>
            Jours déficit/an : ${r.deficit_days ?? '—'}<br>
            Manquant ${_fmt(r.total_deficit, 0)} kWh/an</p>
          </div>
        </div>`;
      if (eco && (eco.Ppeak !== recRef.Ppeak || eco.C_batt_gross !== recRef.C_batt_gross)) {
        body += `
        <h3>Config économique (coût min. couverture cible)</h3>
        <div class="box">
          <p><strong>${_fmt(eco.Ppeak, 1)} kWc</strong> · Batterie ${eco.C_batt_gross} kWh<br>
          Couverture ${_fmt(eco.coverageRate, 1)} % · ${eco.deficit_days} j déficit/an<br>
          Coût ${_fmt(eco.systemCost, 0)} € (${eco.systemCost <= recRef.systemCost ? '−' : '+'}${_fmt(Math.abs(eco.systemCost - recRef.systemCost), 0)} € vs Autonome)</p>
        </div>`;
      }
    }

    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Rapport — ${_esc(name)}</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;font-size:10.5pt;color:#1a1a1a;padding:12mm;margin:0}
  h1{color:#1565c0;font-size:18pt;margin:0 0 4px}
  h2{color:#1565c0;font-size:13pt;margin:16px 0 8px;border-bottom:2px solid #1565c0;padding-bottom:4px}
  h3{color:#1565c0;font-size:11pt;margin:14px 0 6px}
  .meta{color:#666;font-size:9.5pt;margin-bottom:14px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .box{border:1px solid #dde3ed;border-radius:6px;padding:10px 12px;margin-bottom:8px}
  .box h4{margin:0 0 6px;color:#1565c0;font-size:9pt;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  th{background:#1565c0;color:#fff;padding:6px 8px;text-align:left;font-size:9.5pt}
  td{padding:5px 8px;border-bottom:1px solid #e8edf5;font-size:9.5pt}
  tr:nth-child(even) td{background:#f4f7fc}
  .foot{margin-top:16px;font-size:8pt;color:#999;border-top:1px solid #eee;padding-top:8px;text-align:center}
  @page{size:A4;margin:12mm}
</style></head><body>
  <h1>Rapport de dimensionnement PV</h1>
  <div class="meta">
    <strong>${_esc(name)}</strong>
    ${client ? ` · Client : ${_esc(client)}` : ''}
    ${loc?.name ? ` · ${_esc(loc.name)}` : ''}
    · ${new Date().toLocaleDateString('fr-FR')}
  </div>
  ${body}
  <div class="foot">Open Solar Energy v${typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''} — document informatif</div>
</body></html>`;
  }

  async function downloadQuotePdf() {
    try {
      _toast('Génération du PDF devis…');
      const html = buildCompleteQuoteHTML();
      const ref = (typeof QuoteGen !== 'undefined' ? QuoteGen.readForm()?.ref : null) || 'devis';
      const filename = `devis_${String(ref).replace(/[^\w\-]+/g, '_')}.pdf`;
      if (_hasHtml2Pdf()) {
        const blob = await htmlToPdfBlob(html, { filename });
        await savePdf(blob, filename);
        _toast('✓ PDF devis téléchargé / partagé');
      } else {
        openPrintableHtml(html);
        _toast('Aperçu ouvert — utilisez « Enregistrer en PDF » de l’imprimante', 'warning');
      }
    } catch (e) {
      console.error(e);
      _toast('PDF devis : ' + (e.message || e) + ' — ouverture aperçu', 'error');
      try { openPrintableHtml(buildCompleteQuoteHTML()); } catch (_) {}
    }
  }

  async function downloadSizingPdf() {
    try {
      const html = buildSizingReportHTML();
      if (!html) {
        _toast('Lancez d’abord un dimensionnement pour générer le rapport PDF.', 'warning');
        return;
      }
      _toast('Génération du rapport PDF…');
      const safe = (document.getElementById('project-name-input')?.value || 'rapport')
        .replace(/[^\w\-]+/gi, '_').slice(0, 40);
      const filename = `rapport_pv_${safe}.pdf`;
      if (_hasHtml2Pdf()) {
        const blob = await htmlToPdfBlob(html, { filename });
        await savePdf(blob, filename);
        _toast('✓ Rapport PDF téléchargé / partagé');
      } else {
        openPrintableHtml(html);
        _toast('Aperçu ouvert — Enregistrer en PDF via l’imprimante', 'warning');
      }
    } catch (e) {
      console.error(e);
      _toast('Rapport PDF : ' + (e.message || e), 'error');
      const html = buildSizingReportHTML();
      if (html) openPrintableHtml(html);
    }
  }

  return {
    downloadQuotePdf,
    downloadSizingPdf,
    buildCompleteQuoteHTML,
    buildSizingReportHTML,
    htmlToPdfBlob,
  };
})();

/**
 * renderers/offgrid.js - Onglet Dimensionnement hors réseau
 * Dépend de : app_state.js, charts/, offgrid_sizing.js, solar_math.js
 */

function calcOffgridSizing() {
  if (!AppState.weatherData) { showToast('Sélectionnez un lieu avec des données météo.', 'error'); return; }
  const input      = OffgridSizing.readFormInput();
  const totalConso = input.conso.dailyWh.reduce((s, v) => s + v, 0);
  const hasEnedis  = !!(AppState.hourlyEnedisData?.halfHourly?.length);
  if (totalConso === 0 && !hasEnedis) {
    showToast('Renseignez la consommation journalière (Wh/j) ou importez un fichier Enedis.', 'error');
    return;
  }
  const { recommended: rec, economic, allCandidates, tech, annual_conso, useHourly } =
    OffgridSizing.run(input, AppState.weatherData, AppState.location.lat);
  AppState.lastOffgridSizingResult    = rec;
  // Recommandations d'origine, figées pour cette exécution — la sélection d'une
  // case de la heatmap ne les écrase pas (cf. selectOffgridCandidate).
  AppState.lastOffgridSizingRecommended = rec;
  AppState.lastOffgridSizingEconomic    = economic;
  AppState.lastOffgridSizingCandidates = allCandidates;
  AppState.lastOffgridSizingAnnual    = annual_conso;
  AppState.lastOffgridSizingTech      = tech;
  AppState.lastOffgridSizingHourly    = useHourly;
  renderOffgridSizingResults(rec, allCandidates, tech, annual_conso, useHourly);

  // Commit git après dimensionnement hors-réseau
  if (typeof gitAutoSave === 'function' && rec) {
    gitAutoSave(`Calcul hors-réseau — ${rec.Ppeak} kWc · ${rec.C_batt_gross} kWh batterie`);
  }
}

function renderOffgridSizingResults(rec, allCandidates, tech, annual_conso, hourlyMode) {
  const el = document.getElementById('offgrid2-results');
  if (!rec) {
    el.innerHTML = '<div class="alert alert-warning">Aucune configuration trouvée - réduisez la cible ou augmentez la surface.</div>';
    return;
  }

  const c1    = 'chart-og1-' + Date.now();
  const c2    = 'chart-og2-' + Date.now();
  const hmId  = 'hm-og-' + Date.now();
  const hourlyBadge = hourlyMode
    ? `<span style="font-size:11px;background:#e8f5e9;color:var(--color-success);padding:2px 8px;border-radius:10px;margin-left:8px">Simulation heure/heure (données Enedis)</span>`
    : `<span style="font-size:11px;background:var(--color-bg);color:var(--color-text-muted);padding:2px 8px;border-radius:10px;margin-left:8px">Profil journalier moyen</span>`;

  const tableRows = rec.monthly.map(m => {
    const cls = m.deficit_days === 0 ? 'color:var(--color-success)' : m.deficit_days <= 3 ? 'color:var(--color-accent-dark)' : 'color:var(--color-danger)';
    return `<tr>
      <td>${m.name}</td>
      <td>${Math.round(m.e_prod_day * 1000)}</td>
      <td>${Math.round(m.e_conso_day * 1000)}</td>
      <td style="${cls};font-weight:700">${m.deficit_days > 0 ? m.deficit_days + ' j' : '✓'}</td>
      <td>${m.deficit_kwh > 0 ? m.deficit_kwh : '-'}</td>
      <td>${m.soc_end_pct}%</td>
    </tr>`;
  }).join('');

  const tilt    = parseFloat(document.getElementById('og2-tilt')?.value)    || 30;
  const azimuth = parseFloat(document.getElementById('og2-azimuth')?.value) || 0;
  const dodPct  = Math.round((tech.dod || 0.8) * 100);
  const targetPct = parseFloat(document.getElementById('og2-target-coverage')?.value) || 90;
  const fixeMode = !!document.getElementById('og2-pmode-fixe')?.classList.contains('active');
  const undersized = (rec.coverageRate || 0) + 0.5 < targetPct || (rec.deficit_days || 0) >= 300;
  const avgConsoKwh = rec.monthly?.length
    ? Math.round(rec.monthly.reduce((s, m) => s + (m.e_conso_day || 0), 0) / rec.monthly.length * 10) / 10
    : null;

  const warnHTML = undersized ? `
    <div class="alert alert-warning ose-offgrid-warn" style="margin-bottom:14px">
      <strong>Configuration insuffisante pour ${targetPct}&nbsp;% d’autonomie</strong>
      <p style="margin:6px 0 0;font-size:13px;line-height:1.4">
        Meilleure config possible avec les contraintes actuelles&nbsp;:
        <strong>${rec.coverageRate}&nbsp;%</strong> de couverture,
        <strong>${rec.deficit_days}&nbsp;j</strong> de déficit/an
        (${rec.total_deficit}&nbsp;kWh manquants)${avgConsoKwh != null ? ` · conso ~${avgConsoKwh}&nbsp;kWh/j` : ''}.
        ${fixeMode
          ? 'Mode <em>nombre de panneaux fixe</em> actif — passez en dimensionnement auto (selon conso) ou augmentez le nombre / la surface.'
          : 'Augmentez la surface dispo, baissez la conso, ou visez un taux de couverture plus bas.'}
      </p>
    </div>` : '';

  const titleLabel = undersized
    ? `Meilleure config sous contraintes — ${tech.label}`
    : `Système autonome recommandé — ${tech.label}`;

  // Config "Économique" : coût minimal atteignant la cible de couverture, sans la
  // contrainte de confort sur les jours de déficit consécutifs qu'impose "Autonome".
  // Comparée à la recommandation "Autonome" d'origine (figée), pas à la config
  // actuellement affichée (qui peut être une autre case choisie dans la heatmap).
  const recommendedRef = AppState.lastOffgridSizingRecommended || rec;
  const eco = AppState.lastOffgridSizingEconomic;
  const showEco = eco && (eco.Ppeak !== recommendedRef.Ppeak || eco.C_batt_gross !== recommendedRef.C_batt_gross);
  const ecoDeltaCost = showEco ? eco.systemCost - recommendedRef.systemCost : 0;
  const ecoHTML = showEco ? `
    <div class="card" style="border-left:4px solid var(--color-info);margin-bottom:16px">
      <div class="section-header ose-offgrid-rec-head">
        <div class="card-title">💶 Config économique — coût min. pour ${targetPct}&nbsp;% de couverture</div>
        <button class="btn btn-outline btn-sm"
          onclick="selectOffgridCandidate(${eco.Ppeak}, ${eco.C_batt_gross})"
          title="Afficher cette config en détail (graphiques + tableau mensuel)">
          👁 Voir cette config
        </button>
      </div>
      <div class="kpi-grid">
        <div class="kpi-card" style="border-left:3px solid var(--color-info)">
          <div class="kpi-value info">${eco.Ppeak}</div>
          <div class="kpi-label">Puissance PV<br><span class="kpi-unit">kWc</span></div>
        </div>
        <div class="kpi-card" style="border-left:3px solid var(--color-info)">
          <div class="kpi-value info">${eco.C_batt_gross}</div>
          <div class="kpi-label">Capacité batterie<br><span class="kpi-unit">kWh brut</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value" style="color:${eco.coverageRate >= targetPct ? 'var(--color-success)' : 'var(--color-accent-dark)'}">${eco.coverageRate} %</div>
          <div class="kpi-label">Taux de couverture<br><span class="kpi-unit">cible ${targetPct}%</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value ${eco.deficit_days > 10 ? 'accent' : ''}">${eco.deficit_days}</div>
          <div class="kpi-label">Jours déficit/an<br><span class="kpi-unit">vs ${recommendedRef.deficit_days} j (Autonome)</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value accent">${eco.systemCost.toLocaleString('fr')}</div>
          <div class="kpi-label">Coût total<br><span class="kpi-unit">€ HT (${ecoDeltaCost <= 0 ? '' : '+'}${ecoDeltaCost.toLocaleString('fr')} vs Autonome)</span></div>
        </div>
      </div>
      <p style="font-size:11px;color:var(--color-text-muted);margin-top:8px">
        Même surface/cible de couverture que "Autonome", mais sans limiter les jours de déficit consécutifs
        (peut donc subir des coupures groupées, ex. en hiver) — à réserver aux usages tolérants aux coupures.
      </p>
    </div>` : '';

  el.innerHTML = `
    ${warnHTML}
    <div class="card" style="border-left:4px solid ${undersized ? 'var(--color-accent)' : 'var(--color-accent)'};margin-bottom:16px">
      <div class="section-header ose-offgrid-rec-head">
        <div class="card-title">${titleLabel}${hourlyBadge}</div>
        <button class="btn btn-accent btn-sm"
          onclick="applyOffgridToHourly(${rec.Ppeak}, ${rec.C_batt_gross}, ${dodPct}, ${tilt}, ${azimuth})"
          title="Reporter ces valeurs dans l'onglet Analyse horaire">
          ↗ Simulation horaire
        </button>
      </div>
      <div class="kpi-grid">
        <div class="kpi-card" style="border-left:3px solid var(--color-accent)">
          <div class="kpi-value accent">${rec.Ppeak}</div>
          <div class="kpi-label">Puissance PV<br><span class="kpi-unit">kWc</span></div>
        </div>
        <div class="kpi-card" style="border-left:3px solid var(--color-info)">
          <div class="kpi-value info">${rec.C_batt_gross}</div>
          <div class="kpi-label">Capacité batterie<br><span class="kpi-unit">kWh brut (${rec.C_usable} kWh utiles)</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${rec.nPanels}</div>
          <div class="kpi-label">Panneaux<br><span class="kpi-unit">unités</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value" style="color:${rec.coverageRate >= targetPct ? 'var(--color-success)' : 'var(--color-accent-dark)'}">${rec.coverageRate} %</div>
          <div class="kpi-label">Taux de couverture<br><span class="kpi-unit">% autonome (cible ${targetPct}%)</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value ${rec.deficit_days > 10 ? 'accent' : ''}" style="${rec.deficit_days === 0 ? 'color:var(--color-success)' : ''}">
            ${rec.deficit_days}
          </div>
          <div class="kpi-label">Jours déficit/an<br><span class="kpi-unit">(${rec.total_deficit} kWh manquants)</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value accent">${rec.systemCost.toLocaleString('fr')}</div>
          <div class="kpi-label">Coût total<br><span class="kpi-unit">€ HT</span></div>
        </div>
      </div>
    </div>

    <div class="ose-offgrid-apply-actions">
      <button type="button" class="btn btn-primary ose-btn-wrap"
        onclick="applyOffgridRecommendation()">
        ✓ Appliquer (${rec.nPanels} panneaux · ${rec.C_batt_gross} kWh batt.)
      </button>
      <button type="button" class="btn btn-accent ose-btn-wrap"
        onclick="applyOffgridRecommendation(); importSizingToQuote(); activateTab('quote')">
        ✓ Appliquer et ouvrir le Devis →
      </button>
    </div>

    ${ecoHTML}

    <div class="ose-offgrid-charts">
      <div class="card">
        <div class="section-header">
          <div class="card-title">Production vs Consommation</div>
          <button class="btn btn-outline btn-sm" onclick="OffgridSizing.exportCSV(AppState.lastOffgridSizingResult)">CSV</button>
        </div>
        <div class="chart-container"><canvas id="${c1}"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Jours de déficit par mois</div>
        <div class="chart-container"><canvas id="${c2}"></canvas></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Matrice couverture - PV × Batterie</div>
      <div id="${hmId}"></div>
    </div>

    <div class="card">
      <div class="card-title">Détail mensuel</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Mois</th><th>Prod.<br>Wh/j</th><th>Conso<br>Wh/j</th>
            <th>Déficit<br>jours</th><th>Manquant<br>kWh</th><th>SOC fin<br>mois %</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;

  setTimeout(() => {
    Charts.renderOffgridBalance(c1, rec);
    Charts.renderOffgridDeficitDays(c2, rec);
    // recommendedRef = recommandation "Autonome" d'origine (★) ; rec = config actuellement
    // affichée/sélectionnée (✓) — peuvent différer si l'utilisateur a cliqué une autre case.
    Charts.renderOffgridHeatmap(hmId, allCandidates, recommendedRef.Ppeak, recommendedRef.C_batt_gross, rec.Ppeak, rec.C_batt_gross);
  }, 50);
}

function applyOffgridToHourly(Ppeak, battKwh, dodPct, tilt, azimuth) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('hourly-ppeak',   Ppeak);
  set('hourly-batt',    battKwh);
  set('hourly-dod',     dodPct);
  set('hourly-tilt',    tilt);
  set('hourly-azimuth', azimuth);
  if (typeof activateTab === 'function') activateTab('daily');
  showToast(`✓ ${Ppeak} kWc · ${battKwh} kWh (DoD ${dodPct}%) reportés dans l'analyse horaire`);
}

function autoCalcOffgridPanelWp() {
  if (typeof PanelDB !== 'undefined' && PanelDB.isFromLibrary?.('og2')) {
    showToast('Puissance Wc fixée par le modèle bibliothèque — Auto désactivé. Modifiez le modèle pour réactiver.', 'warning');
    return;
  }
  if (!AppState.weatherData) {
    showToast('Sélectionnez d\'abord un lieu avec des données météo.', 'error');
    return;
  }
  const getVal = id => parseFloat(document.getElementById(id)?.value) || 0;

  const surface    = getVal('og2-surface');
  const panelM2    = getVal('og2-panel-m2')          || 1.96;
  const losses     = getVal('og2-losses')             || 14;
  const tilt       = getVal('og2-tilt')               || 30;
  const azimuth    = getVal('og2-azimuth')            || 0;
  const targetPct  = getVal('og2-target-coverage')    || 90;

  if (!surface) { showToast('Renseignez d\'abord la surface disponible.', 'error'); return; }

  const defaultDay  = getVal('og2-daily-default') || 1000;
  const dailyWh     = Array.from({length: 12}, (_, i) => {
    const v = getVal(`og2-day-${i + 1}`);
    return v > 0 ? v : defaultDay;
  });
  const annualConso = dailyWh.reduce((s, v, i) => s + v * DAYS_IN_MONTH[i], 0) / 1000;

  if (annualConso < 10) { showToast('Renseignez d\'abord la consommation.', 'error'); return; }

  const annualProdPerKwc = AppState.weatherData.reduce((sum, m, i) => {
    const Htilt = SolarMath.tiltedIrradiation(m.GHI, m.DHI, AppState.location.lat, tilt, azimuth, i + 1);
    return sum + SolarMath.pvProduction(Htilt, 1.0, losses, m.T_avg, AppState.install?.tech || 'crystSi', i + 1, AppState.location.lat);
  }, 0);

  if (annualProdPerKwc < 100) { showToast('Données météo insuffisantes.', 'error'); return; }

  const neededPpeak  = (annualConso * targetPct / 100) / annualProdPerKwc;
  const STANDARD_WP  = [300, 320, 350, 375, 400, 420, 450, 480, 500, 550, 600, 650, 700];
  const nPanelsMax   = Math.floor(surface / panelM2);
  if (nPanelsMax < 1) { showToast('Surface insuffisante pour un panneau.', 'error'); return; }

  let chosen = null;
  for (const wp of STANDARD_WP) {
    const nNeeded = Math.ceil(neededPpeak * 1000 / wp);
    if (nNeeded <= nPanelsMax) {
      chosen = { wp, nPanels: nNeeded, ppeak: +(nNeeded * wp / 1000).toFixed(2) };
      break;
    }
  }

  if (!chosen) {
    const wpMax = STANDARD_WP[STANDARD_WP.length - 1];
    const ppeak = +(nPanelsMax * wpMax / 1000).toFixed(2);
    chosen = { wp: wpMax, nPanels: nPanelsMax, ppeak };
    showToast(`Surface insuffisante pour ${neededPpeak.toFixed(1)} kWc — max possible : ${ppeak} kWc avec ${nPanelsMax}× ${wpMax} Wc`, 'warning');
  } else {
    showToast(`✓ ${chosen.wp} Wc × ${chosen.nPanels} panneaux = ${chosen.ppeak} kWc pour ${targetPct}% de couverture annuelle`);
  }

  const wpEl = document.getElementById('og2-panel-wp');
  if (wpEl) wpEl.value = chosen.wp;
}

function importEDFToOffgrid() {
  const input    = AppState.lastSizingInput;
  const statusEl = document.getElementById('og2-edf-import-status');
  if (!input?.bill?.monthlyKwh) {
    if (statusEl) statusEl.textContent = '⚠ Aucune donnée EDF - lancez d\'abord le dimensionnement réseau.';
    return;
  }
  const kwh = input.bill.monthlyKwh;
  const daysArr = AppState.enedisYear ? getMonthlyDays(AppState.enedisYear) : DAYS_IN_MONTH;
  kwh.forEach((k, i) => {
    const el = document.getElementById(`og2-day-${i + 1}`);
    if (el) el.value = Math.round(k * 1000 / daysArr[i]);
  });
  const avg = Math.round(kwh.reduce((s, k, i) => s + k * 1000 / daysArr[i], 0) / 12);
  const defEl = document.getElementById('og2-daily-default');
  if (defEl) defEl.value = avg;
  if (statusEl) statusEl.textContent = `✓ Consommation importée (${Math.round(kwh.reduce((s, k) => s + k, 0))} kWh/an)`;
  document.getElementById('og2-day-1')?.dispatchEvent(new Event('input'));
}

/**
 * Sélectionne une case de la matrice PV × batterie et met à jour les KPI / graphiques.
 */
function selectOffgridCandidate(ppeak, battKwh) {
  const list = AppState.lastOffgridSizingCandidates || [];
  const p = Number(ppeak);
  const b = Number(battKwh);
  const cand = list.find(c => Number(c.Ppeak) === p && Number(c.C_batt_gross) === b);
  if (!cand) {
    showToast('Configuration introuvable dans la matrice.', 'warning');
    return;
  }
  AppState.lastOffgridSizingResult = cand;
  const tech = AppState.lastOffgridSizingTech
    || (typeof OffgridSizing !== 'undefined' && OffgridSizing.BATTERY_TECH
      ? (OffgridSizing.BATTERY_TECH[document.getElementById('og2-batt-tech')?.value] || OffgridSizing.BATTERY_TECH.lfp)
      : { label: 'Batterie', dod: 0.8 });
  const annual = AppState.lastOffgridSizingAnnual ?? cand.annual_conso ?? 0;
  const hourly = !!AppState.lastOffgridSizingHourly;
  renderOffgridSizingResults(cand, list, tech, annual, hourly);
  showToast(`Config sélectionnée : ${cand.Ppeak} kWc · ${cand.C_batt_gross} kWh · ${cand.coverageRate} %`);
  const el = document.getElementById('offgrid2-results');
  if (el) try { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) {}
}

/**
 * Figé la recommandation hors-réseau dans le formulaire (nb panneaux + batterie)
 * pour que le devis / recalculs partent de ces valeurs.
 */
function applyOffgridRecommendation() {
  const rec = AppState.lastOffgridSizingResult;
  if (!rec || !rec.nPanels) {
    showToast('Lancez d\'abord un dimensionnement autonome.', 'warning');
    return false;
  }

  if (typeof setPanelMode === 'function') setPanelMode('og2', 'fixe');
  const nEl = document.getElementById('og2-npanels-fixe');
  if (nEl) {
    nEl.value = rec.nPanels;
    nEl.dispatchEvent(new Event('input'));
  }
  if (typeof calcPanelsForMode === 'function') calcPanelsForMode('og2');

  const battEl = document.getElementById('og2-batt-kwh');
  if (battEl && rec.C_batt_gross != null) {
    battEl.value = rec.C_batt_gross;
    battEl.dispatchEvent(new Event('input'));
  }

  AppState.offgridRecommendationApplied = true;
  showToast(`✓ Recommandation appliquée : ${rec.nPanels} panneaux (${rec.Ppeak} kWc) · batterie ${rec.C_batt_gross} kWh`);
  return true;
}

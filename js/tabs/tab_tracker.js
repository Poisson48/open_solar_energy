/**
 * tab_tracker.js - Suiveur PV : comparaison fixe vs 1 axe (calcul réel projet)
 */
function initTabTracker() {
  document.getElementById('tab-tracker').innerHTML = `
    <div class="ose-wizard-intro">
      <strong>Suiveur solaire</strong>
      <span>Compare la production d’un tracker 1 axe horizontal vs votre inclinaison fixe actuelle (données météo du projet).</span>
    </div>
    <div class="tab-form-col">
      <div class="card">
        <div class="card-title">Paramètres</div>
        <div class="form-row" style="gap:10px;flex-wrap:wrap">
          <div class="form-group" style="flex:1;min-width:120px">
            <label for="trk-tilt">Inclinaison fixe (°)</label>
            <input type="number" id="trk-tilt" min="0" max="90" step="1" value="30">
          </div>
          <div class="form-group" style="flex:1;min-width:120px">
            <label for="trk-azimuth">Azimut fixe (°)</label>
            <input type="number" id="trk-azimuth" min="-180" max="180" step="1" value="0">
          </div>
          <div class="form-group" style="flex:1;min-width:120px">
            <label for="trk-ppeak">Puissance (kWc)</label>
            <input type="number" id="trk-ppeak" min="0.1" step="0.1" value="6">
          </div>
          <div class="form-group" style="flex:1;min-width:120px">
            <label for="trk-losses">Pertes (%)</label>
            <input type="number" id="trk-losses" min="0" max="40" step="0.5" value="14">
          </div>
          <div class="form-group" style="flex:1;min-width:140px">
            <label for="trk-axis">Type suiveur</label>
            <select id="trk-axis">
              <option value="1h">1 axe horizontal (Est-Ouest)</option>
              <option value="1tilt">1 axe incliné (+5 % vs horizontal)</option>
              <option value="2axis">2 axes (idéal théorique ~+30 %)</option>
            </select>
          </div>
        </div>
        <button type="button" class="btn btn-primary" id="btn-calc-tracker" style="margin-top:10px">Comparer fixe vs suiveur</button>
        <p id="trk-status" style="font-size:11px;color:var(--color-text-muted);margin-top:8px"></p>
      </div>
      <div id="trk-results"><div class="result-placeholder"><p>Cliquez sur <strong>Comparer</strong> — utilise la météo de l’onglet Lieu.</p></div></div>
    </div>`;

  document.getElementById('btn-calc-tracker')?.addEventListener('click', calcTrackerComparison);
}

/** Facteur gain suiveur vs fixe (approx. literature + latitude). */
function _trackerGainFactor(axisType, lat) {
  const absLat = Math.abs(lat || 45);
  const latBonus = Math.max(0, (absLat - 30) * 0.003);
  switch (axisType) {
    case '1h':   return 1.15 + latBonus;
    case '1tilt': return 1.20 + latBonus;
    case '2axis': return 1.28 + latBonus * 1.5;
    default: return 1.15;
  }
}

function _annualProdKwh(weather, lat, tilt, azimuth, ppeak, losses, tech, gainMul = 1) {
  if (!weather?.length || !ppeak) return 0;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const m = weather[i];
    const Htilt = SolarMath.tiltedIrradiation(m.GHI, m.DHI, lat, tilt, azimuth, i + 1);
    sum += SolarMath.pvProduction(Htilt, ppeak, losses, m.T_avg, tech, i + 1, lat) * gainMul;
  }
  return sum;
}

function calcTrackerComparison() {
  const status = document.getElementById('trk-status');
  const el = document.getElementById('trk-results');
  if (!AppState.weatherData?.length) {
    if (status) status.textContent = '⚠ Importez d’abord la météo (onglet Lieu).';
    showToast('Météo requise — onglet Lieu.', 'error');
    return;
  }
  const lat = AppState.location?.lat ?? 45;
  const tilt = parseFloat(document.getElementById('trk-tilt')?.value) || 30;
  const azimuth = parseFloat(document.getElementById('trk-azimuth')?.value) || 0;
  const ppeak = parseFloat(document.getElementById('trk-ppeak')?.value) || 6;
  const losses = parseFloat(document.getElementById('trk-losses')?.value) || 14;
  const axis = document.getElementById('trk-axis')?.value || '1h';
  const tech = AppState.install?.tech || 'crystSi';
  const gain = _trackerGainFactor(axis, lat);

  const prodFixe = _annualProdKwh(AppState.weatherData, lat, tilt, azimuth, ppeak, losses, tech, 1);
  const prodTrk  = _annualProdKwh(AppState.weatherData, lat, tilt, azimuth, ppeak, losses, tech, gain);
  const delta = prodTrk - prodFixe;
  const pct = prodFixe > 0 ? Math.round((delta / prodFixe) * 1000) / 10 : 0;

  const costExtra = { '1h': 0.32, '1tilt': 0.40, '2axis': 0.75 }[axis] || 0.32;
  const costFixe = ppeak * 900;
  const costTrk = costFixe * (1 + costExtra);
  const kwhPrice = parseFloat(document.getElementById('sz-price-base')?.value)
    || parseFloat(document.getElementById('inp-kwh-price')?.value) || 0.25;
  const gainEur = delta * kwhPrice;

  const axisLabel = { '1h': '1 axe horizontal', '1tilt': '1 axe incliné', '2axis': '2 axes' }[axis];
  if (status) status.textContent = `✓ ${AppState.location?.name || 'Site'} · lat ${lat.toFixed(2)}° · ${axisLabel}`;

  const monthRows = AppState.weatherData.map((m, i) => {
    const H = SolarMath.tiltedIrradiation(m.GHI, m.DHI, lat, tilt, azimuth, i + 1);
    const pf = SolarMath.pvProduction(H, ppeak, losses, m.T_avg, tech, i + 1, lat);
    const pt = pf * gain;
    return `<tr><td>${MONTH_NAMES[i]}</td><td style="text-align:right">${Math.round(pf)}</td><td style="text-align:right">${Math.round(pt)}</td><td style="text-align:right;color:var(--color-success)">+${Math.round(pt - pf)}</td></tr>`;
  }).join('');

  el.innerHTML = `
    <div class="card" style="border-left:4px solid var(--color-accent)">
      <div class="card-title">Fixe ${tilt}° / ${azimuth}° vs ${axisLabel}</div>
      <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-value">${Math.round(prodFixe).toLocaleString('fr')}</div><div class="kpi-label">Prod. fixe<br><span class="kpi-unit">kWh/an</span></div></div>
        <div class="kpi-card"><div class="kpi-value accent">${Math.round(prodTrk).toLocaleString('fr')}</div><div class="kpi-label">Prod. suiveur<br><span class="kpi-unit">kWh/an (+${pct} %)</span></div></div>
        <div class="kpi-card"><div class="kpi-value" style="color:var(--color-success)">+${Math.round(delta).toLocaleString('fr')}</div><div class="kpi-label">Gain annuel<br><span class="kpi-unit">kWh</span></div></div>
        <div class="kpi-card"><div class="kpi-value">${Math.round(gainEur).toLocaleString('fr')} €</div><div class="kpi-label">Valeur énergie<br><span class="kpi-unit">@${kwhPrice} €/kWh</span></div></div>
      </div>
      <p style="font-size:12px;color:var(--color-text-muted);margin-top:10px">
        Coût estimé : fixe ${Math.round(costFixe).toLocaleString('fr')} € → suiveur ~${Math.round(costTrk).toLocaleString('fr')} € HT (+${Math.round(costExtra * 100)} %).
        Le suiveur est rentable si le gain énergétique compense l’investissement et la maintenance (~2–4 %/an).
      </p>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-title">Production mensuelle (kWh)</div>
      <table class="data-table"><thead><tr><th>Mois</th><th>Fixe</th><th>Suiveur</th><th>Δ</th></tr></thead><tbody>${monthRows}</tbody></table>
    </div>`;
}
window.calcTrackerComparison = calcTrackerComparison;

/** Préremplit depuis le dimensionnement quand l’onglet s’ouvre. */
function prefillTrackerFromProject() {
  const map = [
    ['trk-tilt', 'sz-tilt', 'inp-tilt'],
    ['trk-azimuth', 'sz-azimuth', 'inp-azimuth'],
    ['trk-ppeak', null, 'inp-ppeak'],
    ['trk-losses', 'sz-losses', 'inp-losses'],
  ];
  map.forEach(([tid, ...srcs]) => {
    const el = document.getElementById(tid);
    if (!el || el.value) return;
    for (const sid of srcs) {
      const v = document.getElementById(sid)?.value;
      if (v) { el.value = v; break; }
    }
  });
  const rec = AppState.lastSizingResult?.Ppeak || AppState.lastGridResult?.annualProd && AppState.lastSizingResult?.Ppeak;
  if (rec && !document.getElementById('trk-ppeak')?.value) {
    const p = AppState.lastSizingResult?.Ppeak || parseFloat(document.getElementById('inp-ppeak')?.value);
    if (p) document.getElementById('trk-ppeak').value = p;
  }
}

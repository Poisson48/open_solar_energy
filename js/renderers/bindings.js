/**
 * renderers/bindings.js - Liaisons événements + modal Enedis
 * Dépend de : app_state.js, solar_math.js, offgrid_sizing.js, enedis_import.js
 */

function bindOptimizeCheckboxes() {
  const chkTilt = document.getElementById('chk-optimize-tilt');
  const chkAz   = document.getElementById('chk-optimize-az');
  const inpTilt = document.getElementById('inp-tilt');
  const inpAz   = document.getElementById('inp-azimuth');

  function update() {
    inpTilt.disabled = chkTilt.checked;
    inpAz.disabled   = chkAz.checked || chkTilt.checked;
    if (chkTilt.checked && AppState.weatherData) {
      const opt = SolarMath.optimalTilt(AppState.location.lat, AppState.weatherData, chkAz.checked);
      inpTilt.value = opt.tilt;
      if (chkAz.checked) inpAz.value = opt.azimuth;
    }
  }
  chkTilt?.addEventListener('change', update);
  chkAz?.addEventListener('change', update);
}

function bindBatteryInfo() {
  const sel = document.getElementById('og2-batt-tech');
  if (!sel) return;
  function update() {
    const tech = OffgridSizing.BATTERY_TECH[sel.value];
    if (!tech) return;
    const el = document.getElementById('og2-batt-info');
    if (!el) return;
    const bmsStr = tech.bmsFixed > 0 ? ` · BMS ~${tech.bmsFixed} €` : '';
    el.textContent = `DoD ${tech.dod * 100}% · η ${tech.eta * 100}% · ${tech.cycles} cycles · ~${tech.costPerKwh} €/kWh${bmsStr}`;
  }
  sel.addEventListener('change', update);
  update();
}

function bindSizingLiveTotal() {
  const inputs = Array.from({length: 12}, (_, i) => document.getElementById(`sz-kwh-${i + 1}`));
  function updateTotal() {
    const total = inputs.reduce((s, el) => s + (parseFloat(el?.value) || 0), 0);
    const el    = document.getElementById('sz-annual-total');
    if (el) el.textContent = `Total annuel : ${total.toLocaleString('fr')} kWh/an`;
  }
  inputs.forEach(el => el?.addEventListener('input', updateTotal));
  updateTotal();
}

function bindOffgridLiveTotal() {
  const defInput    = document.getElementById('og2-daily-default');
  const monthInputs = Array.from({length: 12}, (_, i) => document.getElementById(`og2-day-${i + 1}`));
  function update() {
    const def   = parseFloat(defInput?.value) || 0;
    const total = monthInputs.reduce((s, el, i) => {
      const v = parseFloat(el?.value) || 0;
      return s + (v > 0 ? v : def) * DAYS_IN_MONTH[i];
    }, 0) / 1000;
    const el = document.getElementById('og2-annual-total');
    if (el) el.textContent = `Total annuel : ${Math.round(total).toLocaleString('fr')} kWh/an`;
  }
  defInput?.addEventListener('input', update);
  monthInputs.forEach(el => el?.addEventListener('input', update));
  update();
}

function optimizeTiltFor(prefix, withAz = false) {
  if (!AppState.weatherData) {
    alert('Sélectionnez d\'abord un lieu avec des données météo.');
    return;
  }
  const opt    = SolarMath.optimalTilt(AppState.location.lat, AppState.weatherData, withAz);
  const tiltEl = document.getElementById(`${prefix}-tilt`);
  const azEl   = document.getElementById(`${prefix}-azimuth`);
  if (tiltEl)        tiltEl.value = opt.tilt;
  if (withAz && azEl) azEl.value  = opt.azimuth;
}

// ── Modal Enedis ────────────────────────────────────────────────
function openEnedisModal() {
  document.getElementById('enedis-modal').style.display = 'block';
}

function closeEnedisModal() {
  document.getElementById('enedis-modal').style.display = 'none';
}

function handleEnedisCSV(input, statusId = 'sz-csv-status') {
  const file     = input.files[0];
  const statusEl = document.getElementById(statusId);
  if (!file) return;

  statusEl.style.display = 'block';
  statusEl.style.color   = 'var(--color-text-muted)';
  statusEl.textContent   = '⏳ Lecture du fichier…';

  EnedisImport.handleFile(file, result => {
    input.value = '';
    if (result.error) {
      statusEl.style.color   = 'var(--color-danger)';
      statusEl.textContent   = '✗ ' + result.error;
      return;
    }

    // Onglet dimensionnement
    result.monthlyKwh.forEach((kwh, i) => {
      const el = document.getElementById(`sz-kwh-${i + 1}`);
      if (el) el.value = kwh;
    });
    if (result.monthlyKwhHp) {
      const tariffEl = document.getElementById('sz-tariff');
      if (tariffEl) {
        tariffEl.value = 'hphc';
        tariffEl.dispatchEvent(new Event('change'));
      }
    }

    // Onglet hors-réseau : conso journalière (Wh/j) - jours corrects pour années bissextiles
    const daysArr = result.year ? getMonthlyDays(result.year) : DAYS_IN_MONTH;
    result.monthlyKwh.forEach((kwh, i) => {
      const whPerDay = Math.round(kwh * 1000 / daysArr[i]);
      const el = document.getElementById(`og2-day-${i + 1}`);
      if (el) el.value = whPerDay;
    });
    const avgWhPerDay = Math.round(
      result.monthlyKwh.reduce((s, k, i) => s + k * 1000 / daysArr[i], 0) / 12
    );
    const defEl = document.getElementById('og2-daily-default');
    if (defEl) defEl.value = avgWhPerDay;
    document.getElementById('og2-day-1')?.dispatchEvent(new Event('input'));

    // Données 30min → module horaire
    if (result.halfHourlyData) {
      AppState.hourlyEnedisData = {
        halfHourly: result.halfHourlyData.values,
        year:       result.halfHourlyData.year,
        format:     result.halfHourlyData.format
      };
      if (typeof HourlyModule !== 'undefined') {
        HourlyModule.setData({ values: AppState.hourlyEnedisData.halfHourly, year: AppState.hourlyEnedisData.year });
        const hStatus = document.getElementById('hourly-data-status');
        if (hStatus) hStatus.textContent = '✓ Données 30min disponibles pour l\'analyse horaire';
      }
    }

    AppState.monthlyKwh   = result.monthlyKwh.slice();
    AppState.monthlyKwhHp = result.monthlyKwhHp ? result.monthlyKwhHp.slice() : null;
    AppState.enedisYear   = result.year || null;
    document.getElementById('sz-kwh-1')?.dispatchEvent(new Event('input'));

    const warns = result.warnings.length ? ` - ⚠ ${result.warnings[0]}` : '';
    statusEl.style.color = 'var(--color-success)';
    statusEl.textContent =
      `✓ ${result.format} ${result.year} importé - ${result.totalAnnual.toLocaleString('fr')} kWh/an${warns}`;
    showToast(`✓ Enedis ${result.year} importé — ${result.totalAnnual.toLocaleString('fr')} kWh/an${warns}`);
  });
}

// ── Wrapper bouton : état chargement ────────────────────────────
/**
 * Désactive le bouton, déclenche fn() dans un setTimeout pour laisser
 * le navigateur repeindre avant le calcul lourd, puis réactive.
 */
function withLoading(btnId, fn) {
  const btn = document.getElementById(btnId);
  const origHtml = btn?.innerHTML;
  if (btn) {
    btn.disabled    = true;
    btn.style.opacity = '0.65';
  }
  setTimeout(() => {
    try { fn(); } catch (e) { console.error('[withLoading]', e); }
    if (btn) {
      btn.disabled    = false;
      btn.style.opacity = '';
      if (origHtml) btn.innerHTML = origHtml;
    }
  }, 20);
}

// ── Sync paramètres partagés (appel unique au démarrage) ────────
/**
 * Lie les champs qui ne sont pas déjà synchronisés par bindInstallSync
 * ni par les attributs oninput inline des formulaires.
 */
function bindSharedParamSync() {
  // Offgrid tab : surface/panelWp/panelM2 → mise à jour affichage panneaux
  ['og2-surface', 'og2-panel-wp', 'og2-panel-m2'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => calcPanelsForMode('og2'));
  });

  // Sizing tab : changement de tarif → affichage/masquage des prix HP/HC
  const tariffSel    = document.getElementById('sz-tariff');
  if (tariffSel) {
    const updateTariff = () => {
      const isHpHc = tariffSel.value === 'hphc';
      const baseRow = document.getElementById('sz-price-base-row');
      const hphcRow = document.getElementById('sz-price-hphc-row');
      if (baseRow) baseRow.style.display = isHpHc ? 'none' : '';
      if (hphcRow) hphcRow.style.display = isHpHc ? '' : 'none';
    };
    tariffSel.addEventListener('change', updateTariff);
    updateTariff();
  }
}

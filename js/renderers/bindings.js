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

// Affiche les specs techno + la capacité utile en direct (brut × DoD) — même
// présentation pour l'onglet hybride (sz-) et hors-réseau (og2-), pour que
// « brut » vs « utile » soit compris de la même façon partout dans l'appli.
function bindBatteryInfo(prefix = 'og2') {
  const sel = document.getElementById(`${prefix}-batt-tech`);
  const kwhInput = document.getElementById(`${prefix}-batt-kwh`);
  if (!sel) return;
  function update() {
    const tech = OffgridSizing.BATTERY_TECH[sel.value];
    if (!tech) return;
    const el = document.getElementById(`${prefix}-batt-info`);
    if (!el) return;
    const bmsStr = tech.bmsFixed > 0 ? ` · BMS ~${tech.bmsFixed} €` : '';
    const capacity = parseFloat(kwhInput?.value);
    const usableStr = capacity > 0
      ? ` · <strong>${Math.round(capacity * tech.dod * 10) / 10} kWh utiles</strong> sur ${capacity} kWh brut`
      : '';
    el.innerHTML = `DoD ${tech.dod * 100}% · η ${tech.eta * 100}% · ${tech.cycles} cycles · ~${tech.costPerKwh} €/kWh${bmsStr}${usableStr}`;
  }
  sel.addEventListener('change', update);
  kwhInput?.addEventListener('input', update);
  update();
}

// ── Aide contextuelle batterie hybride (onglet Dimensionnement) ──
function updateSizingBatteryHelp() {
  if (typeof window.__oseUpdateSizingStrategyHelp === 'function')
    window.__oseUpdateSizingStrategyHelp();
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
    showToast('Sélectionnez d\'abord un lieu avec des données météo.', 'error');
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

function handleEnedisCSV(input) {
  const file = input.files[0];
  if (!file) return;

  const STATUS_IDS = ['sz-csv-status', 'og2-edf-import-status'];
  const setStatus = (color, text) => {
    STATUS_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = 'block';
      el.style.color   = color;
      el.textContent   = text;
    });
  };

  setStatus('var(--color-text-muted)', '⏳ Lecture du fichier…');

  EnedisImport.handleFile(file, result => {
    input.value = '';
    if (result.error) {
      setStatus('var(--color-danger)', '✗ ' + result.error);
      showToast('✗ Import Enedis : ' + result.error, 'error');
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
    const msg   = `✓ ${result.format} ${result.year} importé - ${result.totalAnnual.toLocaleString('fr')} kWh/an${warns}`;
    setStatus('var(--color-success)', msg);
    showToast(`✓ Enedis ${result.year} importé — ${result.totalAnnual.toLocaleString('fr')} kWh/an${warns}`);

    if (typeof refreshSizingValidity === 'function') refreshSizingValidity();

    // Météo horaire alignée sur l’année Enedis → production jour/jour (pas seulement forme mensuelle)
    const lat = AppState.location?.lat;
    const lon = AppState.location?.lon;
    if (lat && lon && typeof PVGISImport !== 'undefined' && typeof PVGISImport.doImportHourlyWeather === 'function') {
      PVGISImport.doImportHourlyWeather().catch?.(() => {});
    } else if (lat && lon && document.getElementById('btn-hourly-weather')) {
      // Fallback : déclencher le même flux UI sans bloquer l’import Enedis
      try { document.getElementById('btn-hourly-weather').click(); } catch (_) {}
    }

    // Commit git après import Enedis
    if (typeof gitAutoSave === 'function') {
      gitAutoSave(`Import Enedis ${result.year || ''}`);
    }
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
  // Si un modèle bibliothèque est déjà chargé (projet / démo), masquer Auto Wc
  if (typeof PanelDB !== 'undefined' && PanelDB.syncFromLibraryIfMatch) {
    ['og2', 'sz', 'inp'].forEach(p => {
      try { PanelDB.syncFromLibraryIfMatch(p); } catch (_) {}
    });
  }

  // Système PV : hint "Chaînes" — se met à jour dès que Voc panneau ou modèle
  // d'onduleur change (saisie manuelle ou application depuis une bibliothèque,
  // qui déclenche un événement 'input' sur ces mêmes champs).
  ['inp-panel-voc', 'inp-panel-model', 'inp-inverter-model'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      if (typeof updateChainsHint === 'function') updateChainsHint();
    });
  });

  // Onduleur : Système PV réseau (inp-inverter-model) → Devis (dv-sys-inverter),
  // seulement si le champ devis est vide ou égal à la dernière valeur synchronisée
  // (on respecte une saisie/effacement manuel côté devis, cf. syncQuoteSiteFields).
  const invModelEl = document.getElementById('inp-inverter-model');
  invModelEl?.addEventListener('input', () => {
    const value = invModelEl.value;
    const dvInv = document.getElementById('dv-sys-inverter');
    if (dvInv) {
      const lastSynced = AppState.install.inverterModel;
      if (dvInv.value === '' || dvInv.value === lastSynced) {
        dvInv.value = value;
        if (typeof QuoteLines !== 'undefined' && typeof QuoteLines.setLine === 'function' && value) {
          QuoteLines.setLine('inverter', { label: value });
        }
      }
    }
    AppState.install.inverterModel = value;
  });

  // Tarif rachat/revente surplus : sz-feedin (Dimensionnement) et inp-kwh-price
  // (Système PV réseau) désignent le même prix de revente — sync live bidirectionnelle.
  const feedinEl   = document.getElementById('sz-feedin');
  const kwhPriceEl = document.getElementById('inp-kwh-price');
  if (feedinEl && kwhPriceEl) {
    feedinEl.addEventListener('input', () => {
      if (feedinEl.value !== '' && kwhPriceEl.value !== feedinEl.value) kwhPriceEl.value = feedinEl.value;
    });
    kwhPriceEl.addEventListener('input', () => {
      if (kwhPriceEl.value !== '' && feedinEl.value !== kwhPriceEl.value) feedinEl.value = kwhPriceEl.value;
    });
  }

  // Sizing tab : changement de tarif → affichage/masquage des prix HP/HC
  const tariffSel = document.getElementById('sz-tariff');
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

  // Sizing : cartes objectif + champ cible selon stratégie
  const strategySel = document.getElementById('sz-strategy');
  const goalCards = document.getElementById('sz-goal-cards');
  if (strategySel) {
    const updateStrategy = () => {
      const v = strategySel.value;
      const group = document.getElementById('sz-target-coverage-group');
      const label = document.getElementById('sz-target-coverage-label');
      const help = document.getElementById('sz-target-help');
      const needsTarget = v === 'bill_coverage_pct' || v === 'autoconso_pct';
      if (group) group.style.display = needsTarget ? '' : 'none';
      if (label) {
        label.textContent = v === 'autoconso_pct'
          ? 'Taux d’autoconsommation cible'
          : 'Taux de couverture de facture cible';
      }
      const isHybrid = AppState.installationType === 'hybrid';
      if (help) {
        if (v === 'autoconso_pct') {
          help.textContent = isHybrid
            ? 'Avec batterie hybride, le surplus est stocké puis restitué le soir : 90 % d’autoconso est atteignable même avec une installation plus grande.'
            : 'Sans batterie, 90 % d’autoconso est réaliste avec une petite puissance. Ce n’est pas la même chose que 90 % de couverture de facture.';
        } else {
          help.textContent = 'Part de votre consommation annuelle couverte par l’électricité produite et consommée sur place.';
        }
      }
      if (goalCards) {
        goalCards.querySelectorAll('.ose-goal-card').forEach(btn => {
          const on = btn.dataset.strategy === v;
          btn.classList.toggle('active', on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      }
    };
    strategySel.addEventListener('change', updateStrategy);
    window.__oseUpdateSizingStrategyHelp = updateStrategy;
    if (goalCards) {
      goalCards.querySelectorAll('.ose-goal-card').forEach(btn => {
        btn.addEventListener('click', () => {
          strategySel.value = btn.dataset.strategy;
          strategySel.dispatchEvent(new Event('change'));
          if (btn.dataset.strategy === 'autoconso_pct') {
            const t = document.getElementById('sz-target-coverage');
            if (t && (!t.value || Number(t.value) < 50)) t.value = '90';
          }
          if (btn.dataset.strategy === 'bill_coverage_pct') {
            const t = document.getElementById('sz-target-coverage');
            if (t && Number(t.value) > 85) t.value = '70';
          }
        });
      });
    }
    updateStrategy();
  }

  // Prime d'État : afficher le champ montant seulement en mode manuel
  window.syncIncentiveModeUI = function syncIncentiveModeUI() {
    const mode = document.getElementById('sz-incentive-mode')?.value || 'auto';
    const wrap = document.getElementById('sz-incentive-manual-wrap');
    const help = document.getElementById('sz-incentive-help');
    const inp = document.getElementById('sz-incentive');
    if (wrap) wrap.style.display = mode === 'manual' ? '' : 'none';
    if (help) {
      if (mode === 'manual')
        help.textContent = 'Saisissez le montant total de la prime (pas €/kWc) tel qu’indiqué sur votre devis ou l’arrêté en vigueur.';
      else if (mode === 'none')
        help.textContent = 'Aucune prise en compte dans le ROI / VAN / coût net.';
      else
        help.textContent = 'Barème indicatif (ex. ≤3 kWc → 300 €/kWc). Change chaque trimestre — utilisez « Montant manuel » pour coller à la réalité.';
    }
    if (mode === 'manual' && inp && !inp.value) inp.focus();
  };
  document.getElementById('sz-incentive-mode')?.addEventListener('change', window.syncIncentiveModeUI);
  window.syncIncentiveModeUI();

  // Afficher / masquer les onglets avancés
  const advToggle = document.getElementById('btn-toggle-advanced-tabs');
  if (advToggle) {
    let showAdv = false;
    const syncAdv = () => {
      document.querySelectorAll('.tab-btn[data-tier="advanced"]').forEach(btn => {
        const type = AppState.installationType || 'grid';
        const tab = btn.dataset.tab;
        const typeHide = ((type === 'grid' || type === 'hybrid') && tab === 'offgrid')
          || (type === 'offgrid' && ['sizing', 'grid', 'tracker', 'optimizer'].includes(tab));
        btn.style.display = (!showAdv || typeHide) ? 'none' : '';
      });
      const full = advToggle.querySelector('.tab-label-full');
      const short = advToggle.querySelector('.tab-label-short');
      if (full && short) {
        full.textContent = showAdv ? 'Masquer outils' : 'Outils avancés';
        short.textContent = showAdv ? 'Moins' : 'Plus';
      } else {
        advToggle.textContent = showAdv ? 'Masquer outils avancés' : 'Outils avancés';
      }
      advToggle.setAttribute('aria-expanded', showAdv ? 'true' : 'false');
    };
    advToggle.addEventListener('click', () => {
      showAdv = !showAdv;
      syncAdv();
    });
    window.__oseSyncAdvancedTabs = syncAdv;
    window.__oseEnsureAdvancedTabs = () => {
      if (!showAdv) {
        showAdv = true;
        syncAdv();
      }
    };
    syncAdv();
  }
}

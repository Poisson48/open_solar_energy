/**
 * pvgis_import.js — Import direct depuis l'API PVGIS (JRC)
 *
 * API base : https://re.jrc.ec.europa.eu/api/v5_2/
 * Endpoints utilisés :
 *   - MRcalc  → irradiation mensuelle + température
 *   - PVcalc  → production PV mensuelle + annuelle (comparaison)
 *   - SHScalc → système hors réseau
 */

const PVGISImport = (() => {

  const BASE = 'https://re.jrc.ec.europa.eu/api/v5_2';
  const MONTH_NAMES = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

  // ── Utilitaire fetch avec gestion d'erreurs ───────────────────
  async function apiFetch(endpoint, params) {
    const url = new URL(`${BASE}/${endpoint}`);
    Object.entries({ ...params, outputformat: 'json', browser: '1' })
      .forEach(([k, v]) => url.searchParams.set(k, v));

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`PVGIS API ${resp.status}: ${resp.statusText}`);
    return resp.json();
  }

  /**
   * Importe les données météo mensuelles depuis MRcalc
   * Retourne un tableau de 12 mois compatible AppState.weatherData
   */
  async function importWeather(lat, lon) {
    const data = await apiFetch('MRcalc', {
      lat, lon,
      avtemp: 1,
      horirrad: 1,
      mr_dni: 1
    });

    const monthly = data.outputs.monthly;

    // PVGIS renvoie 12*N années — on moyenne sur toutes les années disponibles
    const byMonth = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      name: MONTH_NAMES[i],
      GHI: 0, DHI: 0, DNI: 0, T_avg: 0, count: 0
    }));

    monthly.forEach(row => {
      const m = byMonth[row.month - 1];
      // Noms de champs PVGIS v5.2 (avec parenthèses dans les clés JSON)
      const ghi = row['H(h)_m']  ?? row['Hh_m']  ?? row['H_sun'] ?? 0;
      const dhi = row['Hd_m']    ?? row['H(d)_m'] ?? 0;
      const dni = row['Hb(n)_m'] ?? row['Hb_m']   ?? row['DNI_m'] ?? 0;
      const t   = row['T2m']     ?? row['T_2m']    ?? 0;
      m.GHI   += ghi;
      m.DHI   += dhi;
      m.DNI   += dni;
      m.T_avg += t;
      m.count++;
    });

    return byMonth.map(m => ({
      month:  m.month,
      name:   m.name,
      GHI:    m.count ? Math.round((m.GHI   / m.count) * 10) / 10 : 0,
      DHI:    m.count ? Math.round((m.DHI   / m.count) * 10) / 10 : 0,
      DNI:    m.count ? Math.round((m.DNI   / m.count) * 10) / 10 : 0,
      T_avg:  m.count ? Math.round((m.T_avg / m.count) * 10) / 10 : 0
    }));
  }

  /**
   * Importe les résultats PV depuis PVcalc
   * Retourne { monthly, totals } au format PVGIS brut + converti
   */
  async function importPVCalc(lat, lon, { peakpower, loss, angle, aspect, pvtech, mounting }) {
    const data = await apiFetch('PVcalc', {
      lat, lon,
      peakpower,
      loss,
      angle,
      aspect,
      pvtechchoice: pvtech,
      mountingplace: mounting
    });

    const raw = data.outputs;

    const monthly = (raw.monthly ?? []).map((row, i) => ({
      month:    row.month ?? (i + 1),
      name:     MONTH_NAMES[(row.month ?? i + 1) - 1],
      E_m:      row['E_m']    ?? 0,   // kWh/mois
      H_i_m:    row['H(i)_m'] ?? 0,   // kWh/m²/mois sur plan incliné
      SD_m:     row['SD_m']   ?? 0    // écart-type mensuel
    }));

    const totals = raw.totals?.fixed ?? raw.totals ?? {};

    return {
      monthly,
      totals: {
        E_y:    totals['E_y']    ?? 0,
        H_i_y:  totals['H(i)_y'] ?? 0,
        l_total: totals['l_total'] ?? 0,
        l_tg:   totals['l_tg']   ?? 0,
        l_aoi:  totals['l_aoi']  ?? 0
      },
      meta: data.inputs ?? {}
    };
  }

  /**
   * Importe les résultats off-grid depuis SHScalc
   */
  async function importOffgrid(lat, lon, { peakpower, batterysize, cutoff, consumptionday, angle }) {
    const data = await apiFetch('SHScalc', {
      lat, lon,
      peakpower,
      batterysize,
      cutoff,
      consumptionday,
      angle
    });

    const raw = data.outputs;

    const monthly = (raw.monthly ?? []).map((row, i) => ({
      month:     row.month ?? (i + 1),
      name:      MONTH_NAMES[(row.month ?? i + 1) - 1],
      E_d:       row['E_d']      ?? 0,   // Wh/j produit
      E_lost_d:  row['E_lost_d'] ?? 0,   // Wh/j perdu (batterie pleine)
      f_f:       row['f_f']      ?? 0,   // % jours batterie pleine
      f_e:       row['f_e']      ?? 0    // % jours batterie vide
    }));

    const totals = raw.totals ?? {};

    return {
      monthly,
      totals: {
        f_f:    totals['f_f']    ?? 0,
        f_e:    totals['f_e']    ?? 0,
        E_lost: totals['E_lost'] ?? 0,
        E_miss: totals['E_miss'] ?? 0
      }
    };
  }

  // ── UI : bouton d'import avec statut ─────────────────────────
  function setImportStatus(msg, type = 'info') {
    const el = document.getElementById('pvgis-import-status');
    if (!el) return;
    const colors = { info: '#1565c0', success: '#2e7d32', error: '#c62828', loading: '#666' };
    el.style.color = colors[type] || '#666';
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }

  /**
   * Import météo + mise à jour de l'app
   */
  async function doImportWeather() {
    const { lat, lon } = AppState.location;
    setImportStatus('⏳ Connexion à PVGIS...', 'loading');

    try {
      const weather = await importWeather(lat, lon);
      AppState.weatherData = weather;
      AppState.location.name += ' (PVGIS)';
      document.getElementById('loc-name').textContent = AppState.location.name;

      setImportStatus(`✓ ${weather.length} mois importés depuis PVGIS`, 'success');

      // Recalculer les onglets actifs
      if (document.getElementById('tab-irradiation').classList.contains('active') ||
          document.getElementById('tab-irradiation')) {
        renderIrradiationData();
      }

      showImportPreview(weather);

    } catch (err) {
      console.error('PVGIS import error:', err);
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        setImportStatus('✗ Erreur réseau — vérifiez votre connexion Internet', 'error');
      } else {
        setImportStatus(`✗ Erreur PVGIS : ${err.message}`, 'error');
      }
    }
  }

  /**
   * Import PV et affichage de la comparaison PVGIS vs calcul local
   */
  async function doImportPVCalc() {
    const { lat, lon } = AppState.location;
    const peakpower = parseFloat(document.getElementById('inp-ppeak')?.value) || 3;
    const loss = parseFloat(document.getElementById('inp-losses')?.value) || 14;
    const angle = parseFloat(document.getElementById('inp-tilt')?.value) || 30;
    const aspect = parseFloat(document.getElementById('inp-azimuth')?.value) || 0;
    const pvtech = document.getElementById('sel-tech')?.value || 'crystSi';

    const pvtechMap = { crystSi: 'crystSi', CIS: 'CIS', CdTe: 'CdTe', unknown: 'Unknown' };

    setImportStatus('⏳ Import PVcalc depuis PVGIS...', 'loading');

    try {
      const result = await importPVCalc(lat, lon, {
        peakpower, loss, angle, aspect,
        pvtech: pvtechMap[pvtech] || 'crystSi',
        mounting: 'free'
      });

      setImportStatus(`✓ Données PV importées — Production PVGIS : ${Math.round(result.totals.E_y)} kWh/an`, 'success');
      showPVCalcComparison(result, peakpower);

    } catch (err) {
      console.error('PVGIS PVcalc error:', err);
      setImportStatus(`✗ Erreur PVcalc : ${err.message}`, 'error');
    }
  }

  /**
   * Affiche un aperçu des données météo importées
   */
  function showImportPreview(weather) {
    const container = document.getElementById('pvgis-import-preview');
    if (!container) return;

    const total_GHI = weather.reduce((s, m) => s + m.GHI, 0);
    const avg_T = weather.reduce((s, m) => s + m.T_avg, 0) / 12;

    container.innerHTML = `
      <div class="alert alert-success" style="margin-top:10px">
        <div>
          <strong>Données PVGIS importées avec succès</strong><br>
          <span style="font-size:11px">
            GHI annuel : <strong>${Math.round(total_GHI)} kWh/m²/an</strong> —
            T° moy. : <strong>${Math.round(avg_T * 10) / 10} °C</strong>
          </span>
        </div>
      </div>
      <table class="data-table" style="font-size:11px;margin-top:6px">
        <thead>
          <tr><th>Mois</th><th>GHI</th><th>DHI</th><th>DNI</th><th>T°C</th></tr>
        </thead>
        <tbody>
          ${weather.map(m => `
            <tr>
              <td>${m.name}</td>
              <td>${m.GHI}</td>
              <td>${m.DHI}</td>
              <td>${m.DNI}</td>
              <td>${m.T_avg}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
    container.style.display = 'block';
  }

  /**
   * Affiche comparaison PVGIS vs calcul local dans l'onglet PV réseau
   */
  function showPVCalcComparison(pvgisResult, peakpower) {
    let container = document.getElementById('pvgis-comparison');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pvgis-comparison';
      const gridResults = document.getElementById('grid-results');
      if (gridResults) gridResults.appendChild(container);
    }

    const localResult = AppState.lastGridResult;
    const chartId = 'chart-cmp-' + Date.now();

    container.innerHTML = `
      <div class="card" style="border-left: 3px solid var(--color-accent)">
        <div class="card-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>
          Comparaison PVGIS vs Calcul local
        </div>
        ${localResult ? `
        <div class="kpi-grid" style="margin-bottom:14px">
          <div class="kpi-card" style="border-left:3px solid var(--color-accent)">
            <div class="kpi-value accent">${Math.round(pvgisResult.totals.E_y).toLocaleString('fr')}</div>
            <div class="kpi-label">Production PVGIS<br><span class="kpi-unit">kWh/an</span></div>
          </div>
          <div class="kpi-card" style="border-left:3px solid var(--color-primary)">
            <div class="kpi-value">${localResult.E_annual.toLocaleString('fr')}</div>
            <div class="kpi-label">Production locale<br><span class="kpi-unit">kWh/an</span></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value ${Math.abs(pvgisResult.totals.E_y - localResult.E_annual) / pvgisResult.totals.E_y < 0.1 ? '' : 'accent'}">
              ${pvgisResult.totals.E_y > 0 ? (((localResult.E_annual - pvgisResult.totals.E_y) / pvgisResult.totals.E_y) * 100).toFixed(1) : '—'} %
            </div>
            <div class="kpi-label">Écart<br><span class="kpi-unit">local vs PVGIS</span></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value info">${pvgisResult.totals.l_total.toFixed(1)} %</div>
            <div class="kpi-label">Pertes totales PVGIS<br><span class="kpi-unit">température + AOI + spectral</span></div>
          </div>
        </div>
        ` : ''}
        <div class="chart-container"><canvas id="${chartId}"></canvas></div>
        <p style="font-size:11px;color:var(--color-text-muted);margin-top:8px">
          Source : PVGIS (JRC European Commission) — Base PVGIS-SARAH2 / ERA5
        </p>
      </div>`;

    // Graphique de comparaison
    setTimeout(() => {
      const labels = pvgisResult.monthly.map(m => m.name);
      const pvgisData = pvgisResult.monthly.map(m => Math.round(m.E_m));
      const localData = localResult ? localResult.monthly.map(m => m.E_month) : [];

      Charts.destroy && Charts.destroy(chartId);
      const existing = Chart.getChart(chartId);
      if (existing) existing.destroy();

      new Chart(document.getElementById(chartId), {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'PVGIS (kWh/mois)',
              data: pvgisData,
              backgroundColor: 'rgba(245,166,35,0.75)',
              borderRadius: 3
            },
            ...(localData.length ? [{
              label: 'Calcul local (kWh/mois)',
              data: localData,
              backgroundColor: 'rgba(26,107,60,0.65)',
              borderRadius: 3
            }] : [])
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { boxWidth: 12, padding: 10 } }
          },
          scales: {
            y: {
              title: { display: true, text: 'Production (kWh/mois)' },
              grid: { color: 'rgba(0,0,0,0.06)' }
            }
          }
        }
      });
    }, 50);
  }

  // ── Init : injecte le panneau d'import dans la sidebar ────────
  function init() {
    const section = document.getElementById('pvgis-import-section');
    if (!section) return;

    document.getElementById('btn-pvgis-weather').addEventListener('click', doImportWeather);
    document.getElementById('btn-pvgis-pvcalc').addEventListener('click', doImportPVCalc);
  }

  return { init, doImportWeather, doImportPVCalc, importWeather, importPVCalc, importOffgrid };
})();

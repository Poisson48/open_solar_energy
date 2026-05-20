/**
 * pvgis_import.js — Import données solaires et météo
 *
 * Sources :
 *   1. Open-Meteo Archive API  → GHI + T° (CORS natif, aucune clé requise)
 *   2. PVGIS JRC via proxy     → Production PV officielle + comparaison
 *   3. PVGIS lien direct       → Fallback : URL à ouvrir manuellement
 *
 * Pourquoi Open-Meteo et pas PVGIS directement ?
 *   PVGIS ne renvoie pas de headers Access-Control-Allow-Origin.
 *   Le navigateur bloque donc toute requête cross-origin (protocole file:// ou http://).
 */

const PVGISImport = (() => {

  const OPENMETEO_BASE  = 'https://archive-api.open-meteo.com/v1/archive';
  const PVGIS_BASE      = 'https://re.jrc.ec.europa.eu/api/v5_2';
  const CORS_PROXY      = 'https://corsproxy.io/?url=';
  // MONTH_NAMES et DAYS_IN_MONTH définis dans constants.js

  // ─────────────────────────────────────────────────────────────
  // 1. OPEN-METEO : irradiation mensuelle (GHI) + température
  //    shortwave_radiation_sum est en MJ/m²/jour → × 0.2778 = kWh/m²/jour
  // ─────────────────────────────────────────────────────────────
  async function fetchOpenMeteo(lat, lon, year = 2023) {
    const url = new URL(OPENMETEO_BASE);
    url.searchParams.set('latitude',   lat);
    url.searchParams.set('longitude',  lon);
    url.searchParams.set('start_date', `${year}-01-01`);
    url.searchParams.set('end_date',   `${year}-12-31`);
    url.searchParams.set('daily',      'shortwave_radiation_sum,temperature_2m_mean');
    url.searchParams.set('timezone',   'auto');

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`Open-Meteo ${resp.status}`);
    return resp.json();
  }

  /**
   * Modèle Erbs : estime DHI depuis GHI et la fraction diffuse
   * basée sur l'indice de clarté Kt = GHI / H0
   * Retourne { DHI, DNI } en kWh/m²/mois
   */
  function estimateDHI_DNI(GHI_monthly, lat) {
    return GHI_monthly.map((GHI, i) => {
      // H0 : irradiation extraterrestre horizontale (simplifiée)
      const H0 = SolarMath?.extraterrestrialIrradiation
        ? SolarMath.extraterrestrialIrradiation(lat, i + 1)
        : extraterrestrialApprox(lat, i + 1);

      const Kt = H0 > 0 ? Math.min(1, GHI / H0) : 0.5;

      // Corrélation Erbs (1982) pour données mensuelles
      let Kd;
      if      (Kt <= 0.17) Kd = 0.99;
      else if (Kt <= 0.75) Kd = 1.188 - 2.272*Kt + 9.473*Kt**2 - 21.856*Kt**3 + 14.648*Kt**4;
      else                 Kd = 0.165;

      const DHI = Math.max(0, Math.round(GHI * Kd * 10) / 10);
      const DNI = Math.max(0, Math.round((GHI - DHI) / Math.max(0.01, Math.cos((Math.PI/180) * solarZenithApprox(lat, i+1))) * 10) / 10);
      return { DHI, DNI };
    });
  }

  /** Angle zénithal solaire moyen mensuel (approximation) */
  function solarZenithApprox(lat, month) {
    const decl = 23.45 * Math.sin((Math.PI/180) * (360/365) * (284 + midDay(month)));
    return Math.abs(lat - decl);
  }

  /** Irradiation extraterrestre mensuelle approximative (kWh/m²/mois) */
  function extraterrestrialApprox(lat, month) {
    const day = midDay(month);
    const decl = (Math.PI/180) * 23.45 * Math.sin((Math.PI/180) * (360/365) * (284 + day));
    const latR = (Math.PI/180) * lat;
    const Gsc = 1.367; // kW/m²
    const B = (2*Math.PI*day)/365;
    const E0 = 1 + 0.033*Math.cos(B);
    const cosW = -Math.tan(latR)*Math.tan(decl);
    const ws = Math.abs(cosW) > 1 ? (cosW<0?Math.PI:0) : Math.acos(Math.max(-1,Math.min(1,cosW)));
    const H0 = (24/Math.PI)*Gsc*E0*(ws*Math.sin(latR)*Math.sin(decl) + Math.cos(latR)*Math.cos(decl)*Math.sin(ws));
    return Math.max(1, H0 * DAYS_IN_MONTH[month-1]); // kWh/m²/mois
  }

  function midDay(month) {
    let d = 0;
    for (let i=0; i<month-1; i++) d += DAYS_IN_MONTH[i];
    return d + Math.round(DAYS_IN_MONTH[month-1]/2);
  }

  /**
   * Import principal : Open-Meteo → données mensuelles
   * Moyenne sur plusieurs années pour réduire la variabilité inter-annuelle
   */
  async function importWeatherOpenMeteo(lat, lon) {
    setStatus('⏳ Connexion à Open-Meteo...', 'loading');

    // Moyenne 2020-2023
    const years = [2020, 2021, 2022, 2023];
    const allYears = await Promise.all(years.map(y => fetchOpenMeteo(lat, lon, y)));

    // Agréger par mois
    const byMonth = Array.from({length:12}, (_,i) => ({
      month: i+1, name: MONTH_NAMES[i], GHI:[], T:[]
    }));

    allYears.forEach(data => {
      const daily  = data.daily;
      const times  = daily.time;
      const ghi    = daily.shortwave_radiation_sum;
      const temp   = daily.temperature_2m_mean;

      const monthSums = Array(12).fill(0);
      const monthTemps= Array.from({length:12}, ()=>[]);

      times.forEach((date, i) => {
        const m = parseInt(date.slice(5, 7)) - 1;
        if (ghi[i]  != null) monthSums[m]  += ghi[i];
        if (temp[i] != null) monthTemps[m].push(temp[i]);
      });

      monthSums.forEach((sum, m) => {
        byMonth[m].GHI.push(sum * 0.2778);  // MJ/m²/mois → kWh/m²/mois
      });
      monthTemps.forEach((temps, m) => {
        if (temps.length) byMonth[m].T.push(temps.reduce((a,b)=>a+b,0)/temps.length);
      });
    });

    const GHI_monthly = byMonth.map(m => Math.round((m.GHI.reduce((a,b)=>a+b,0)/m.GHI.length)*10)/10);
    const T_monthly   = byMonth.map(m => Math.round((m.T.reduce((a,b)=>a+b,0)/m.T.length)*10)/10);
    const diffuse     = estimateDHI_DNI(GHI_monthly, lat);

    return byMonth.map((m, i) => ({
      month:  m.month,
      name:   m.name,
      GHI:    GHI_monthly[i],
      DHI:    diffuse[i].DHI,
      DNI:    diffuse[i].DNI,
      T_avg:  T_monthly[i],
      source: 'Open-Meteo (2020-2023)'
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // 1b. Open-Meteo HORAIRE — GHI + DHI + T° à la résolution 1h
  //     Même API que le mensuel, paramètre `hourly` au lieu de `daily`.
  //     Données en UTC → correction longitude appliquée dans buildYearPvSlots.
  // ─────────────────────────────────────────────────────────────
  async function fetchOpenMeteoHourly(lat, lon, year) {
    const url = new URL(OPENMETEO_BASE);
    url.searchParams.set('latitude',   lat);
    url.searchParams.set('longitude',  lon);
    url.searchParams.set('start_date', `${year}-01-01`);
    url.searchParams.set('end_date',   `${year}-12-31`);
    url.searchParams.set('hourly',     'shortwave_radiation,diffuse_radiation,temperature_2m');
    url.searchParams.set('timezone',   'UTC');
    const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(30000) });
    if (!resp.ok) throw new Error(`Open-Meteo hourly ${resp.status}`);
    return resp.json();
  }

  async function importHourlyWeather(lat, lon) {
    // Aligner l'année sur les données Enedis si disponibles
    const year = AppState.hourlyEnedisData?.year || AppState.enedisYear || 2023;
    setStatus(`⏳ Météo horaire ${year} en cours (Open-Meteo)…`, 'loading');

    const data = await fetchOpenMeteoHourly(lat, lon, year);
    const h = data.hourly;
    if (!h?.shortwave_radiation?.length) throw new Error('Données horaires absentes');

    const n    = h.shortwave_radiation.length;
    const ghi  = new Float32Array(n);
    const dhi  = new Float32Array(n);
    const temp = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      ghi[i]  = Math.max(0, h.shortwave_radiation[i] || 0);
      dhi[i]  = Math.max(0, Math.min(h.diffuse_radiation[i] || 0, ghi[i]));
      temp[i] = h.temperature_2m[i] ?? 15;
    }

    AppState.hourlyWeatherData = { ghi, dhi, temp, year, nHours: n };
    return { year, nHours: n, annualGhiKwh: Array.from(ghi).reduce((s, v) => s + v, 0) / 1000 };
  }

  async function doImportHourlyWeather() {
    const { lat, lon } = AppState.location;
    if (!lat || !lon) { showToast('⚠ Sélectionnez un lieu d\'abord.', 'error'); return; }

    const btn = document.getElementById('btn-hourly-weather');
    if (btn) { btn.disabled = true; btn.classList.add('btn-loading'); }

    try {
      const { year, nHours, annualGhiKwh } = await importHourlyWeather(lat, lon);
      setStatus(`✓ Météo horaire ${year} — ${nHours} mesures — GHI ≈ ${Math.round(annualGhiKwh)} kWh/m²`, 'success');
      showToast(`✓ Météo horaire ${year} importée (${nHours} points)`);
      const statusEl = document.getElementById('hourly-weather-status');
      if (statusEl) {
        statusEl.textContent = `✓ Météo horaire ${year} — production jour/jour activée`;
        statusEl.style.display = 'block';
      }
    } catch (err) {
      console.error(err);
      setStatus(`✗ Import horaire échoué : ${err.message}`, 'error');
      showToast('✗ Import météo horaire échoué', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('btn-loading'); }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 1c. PVGIS MRcalc — GHI + DHI + T° depuis satellite SARAH3
  //     Meilleur que Open-Meteo + Erbs : DHI mesuré, pas estimé.
  //     CORS bloqué en file:// → tentative proxy.
  // ─────────────────────────────────────────────────────────────
  async function fetchPVGIS_MRcalc(lat, lon) {
    const pvgisUrl = new URL(`${PVGIS_BASE}/MRcalc`);
    pvgisUrl.searchParams.set('lat', lat);
    pvgisUrl.searchParams.set('lon', lon);
    pvgisUrl.searchParams.set('raddatabase', 'PVGIS-SARAH3');
    pvgisUrl.searchParams.set('mr_dni', '1');
    pvgisUrl.searchParams.set('outputformat', 'json');

    // Essai direct puis proxy CORS
    for (const url of [pvgisUrl.toString(), CORS_PROXY + encodeURIComponent(pvgisUrl.toString())]) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (r.ok) return r.json();
      } catch (_) {}
    }
    throw new Error('MRcalc inaccessible (CORS)');
  }

  async function importWeatherPVGIS_MRcalc(lat, lon) {
    setStatus('⏳ Import PVGIS MRcalc (SARAH3)...', 'loading');
    const data = await fetchPVGIS_MRcalc(lat, lon);
    // Format PVGIS MRcalc : outputs.monthly[{month, H_h_m, Hd_h_m, T2m, ...}]
    const rawMonthly = data.outputs?.monthly;
    if (!Array.isArray(rawMonthly) || rawMonthly.length < 12)
      throw new Error('Format MRcalc inattendu');

    return rawMonthly.map((row, i) => {
      const GHI = Math.round((row['H(h)_m'] ?? row['Gh_m'] ?? row['G_m'] ?? 0) * 10) / 10;
      const DHI = Math.round((row['Dh_m']  ?? row['Hd_h_m'] ?? 0) * 10) / 10;
      const T   = Math.round((row['T2m']   ?? 10) * 10) / 10;
      const GHIb = Math.max(0, GHI - DHI);
      const DNI  = GHIb > 0 ? Math.round(GHIb / Math.max(0.1, Math.cos((Math.PI / 180) * solarZenithApprox(lat, i + 1))) * 10) / 10 : 0;
      return {
        month: i + 1, name: MONTH_NAMES[i],
        GHI, DHI, DNI, T_avg: T,
        source: 'PVGIS-SARAH3'
      };
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 2. PVGIS via proxy CORS → PVcalc pour comparaison
  // ─────────────────────────────────────────────────────────────
  async function fetchPVGIS(endpoint, params) {
    const pvgisUrl = new URL(`${PVGIS_BASE}/${endpoint}`);
    Object.entries({ ...params, outputformat: 'json' })
      .forEach(([k, v]) => pvgisUrl.searchParams.set(k, v));

    // Essai 1 : direct (fonctionnel si app servie en HTTPS avec CORS)
    try {
      const r = await fetch(pvgisUrl.toString(), { signal: AbortSignal.timeout(5000) });
      if (r.ok) return r.json();
    } catch (_) {}

    // Essai 2 : via proxy CORS
    const proxied = CORS_PROXY + encodeURIComponent(pvgisUrl.toString());
    const r2 = await fetch(proxied, { signal: AbortSignal.timeout(10000) });
    if (!r2.ok) throw new Error(`PVGIS proxy ${r2.status}`);
    return r2.json();
  }

  async function importPVCalc(lat, lon, { peakpower, loss, angle, aspect, pvtech, mounting }) {
    const pvtechMap = { crystSi:'crystSi', CIS:'CIS', CdTe:'CdTe', unknown:'Unknown' };
    const data = await fetchPVGIS('PVcalc', {
      lat, lon, peakpower, loss,
      angle, aspect,
      pvtechchoice: pvtechMap[pvtech] || 'crystSi',
      mountingplace: mounting || 'free'
    });

    const raw = data.outputs;
    const rawMonthly = Array.isArray(raw.monthly?.fixed) ? raw.monthly.fixed
                     : Array.isArray(raw.monthly) ? raw.monthly
                     : [];
    const monthly = rawMonthly.map((row, i) => ({
      month:  row.month ?? (i+1),
      name:   MONTH_NAMES[(row.month ?? i+1) - 1],
      E_m:    row['E_m']    ?? 0,
      H_i_m:  row['H(i)_m'] ?? 0,
      SD_m:   row['SD_m']   ?? 0
    }));
    const totals = raw.totals?.fixed ?? raw.totals ?? {};
    return {
      monthly,
      totals: {
        E_y:     totals['E_y']     ?? 0,
        H_i_y:   totals['H(i)_y']  ?? 0,
        l_total: totals['l_total'] ?? 0,
        l_tg:    totals['l_tg']    ?? 0,
        l_aoi:   totals['l_aoi']   ?? 0
      }
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Lien direct PVGIS (fallback : ouvrir + copier-coller JSON)
  // ─────────────────────────────────────────────────────────────
  function pvgisDirectLink(lat, lon, params = {}) {
    const base = `${PVGIS_BASE}/PVcalc`;
    const p = new URLSearchParams({
      lat, lon,
      peakpower:    params.peakpower    || 3,
      loss:         params.loss         || 14,
      angle:        params.angle        || 30,
      aspect:       0,
      pvtechchoice: 'crystSi',
      mountingplace:'free',
      outputformat: 'json',
      browser: 1
    });
    return `${base}?${p}`;
  }

  // ─────────────────────────────────────────────────────────────
  // UI helpers
  // ─────────────────────────────────────────────────────────────
  function setStatus(msg, type = 'info') {
    const el = document.getElementById('pvgis-import-status');
    if (!el) return;
    const colors = { info:'#1565c0', success:'#2e7d32', error:'#c62828', loading:'#888' };
    el.style.color = colors[type] || '#666';
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }

  async function doImportWeather() {
    const { lat, lon } = AppState.location;
    const btn = document.getElementById('btn-pvgis-weather');
    if (btn) { btn.disabled = true; btn.classList.add('btn-loading'); }

    let weather = null;
    let source  = '';
    try {
      // Priorité 1 : PVGIS MRcalc (SARAH3) — GHI + DHI mesurés par satellite
      try {
        weather = await importWeatherPVGIS_MRcalc(lat, lon);
        source  = 'PVGIS-SARAH3';
      } catch (e1) {
        // Fallback : Open-Meteo + estimation DHI via Erbs
        weather = await importWeatherOpenMeteo(lat, lon);
        source  = 'Open-Meteo';
      }
      AppState.weatherData = weather;
      const tag = ` (${source})`;
      AppState.location.name = AppState.location.name
        .replace(/ \(PVGIS[^)]*\)/, '').replace(/ \(Open-Meteo\)/, '') + tag;
      document.getElementById('loc-name').textContent = AppState.location.name;

      const totalGHI = weather.reduce((s, m) => s + m.GHI, 0);
      setStatus(`✓ ${source} — GHI annuel : ${Math.round(totalGHI)} kWh/m²/an`, 'success');
      showWeatherPreview(weather, source);
      if (typeof showToast === 'function') showToast(`☀️ Météo ${source} — ${Math.round(totalGHI)} kWh/m²/an`);
    } catch (err) {
      console.error(err);
      setStatus(`✗ Import météo échoué : ${err.message}`, 'error');
      if (typeof showToast === 'function') showToast('✗ Import météo échoué', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('btn-loading'); }
    }

    if (weather) renderIrradiationData();
  }

  async function doImportPVCalc() {
    const { lat, lon } = AppState.location;
    const peakpower = parseFloat(document.getElementById('inp-ppeak')?.value) || 3;
    const loss      = parseFloat(document.getElementById('inp-losses')?.value) || 14;
    const angle     = parseFloat(document.getElementById('inp-tilt')?.value) || 30;
    const aspect    = parseFloat(document.getElementById('inp-azimuth')?.value) || 0;
    const pvtech    = document.getElementById('sel-tech')?.value || 'crystSi';

    setStatus('⏳ Import PVcalc (PVGIS + proxy)...', 'loading');
    try {
      const result = await importPVCalc(lat, lon, { peakpower, loss, angle, aspect, pvtech });
      setStatus(`✓ PVGIS PVcalc — ${Math.round(result.totals.E_y)} kWh/an`, 'success');
      showPVCalcComparison(result);
    } catch (err) {
      console.error(err);
      // Fallback : lien direct
      const link = pvgisDirectLink(lat, lon, { peakpower, loss, angle: angle });
      setStatus('', 'info');
      showPVGISFallback(link);
    }
  }

  function showWeatherPreview(weather, source) {
    const container = document.getElementById('pvgis-import-preview');
    if (!container) return;
    const totalGHI = Math.round(weather.reduce((s, m) => s + m.GHI, 0));
    const avgT     = Math.round(weather.reduce((s, m) => s + m.T_avg, 0) / 12 * 10) / 10;
    const dhiNote  = source === 'PVGIS-SARAH3'
      ? 'DHI satellite (mesure directe)' : 'DHI estimé via modèle Erbs';
    container.innerHTML = `
      <div class="alert alert-success" style="margin-top:8px">
        <div style="font-size:11px">
          <strong>${source || 'Données météo'}</strong><br>
          GHI : <strong>${totalGHI} kWh/m²/an</strong> — T°moy : <strong>${avgT}°C</strong><br>
          <span style="color:var(--color-text-muted)">${dhiNote}</span>
        </div>
      </div>`;
    container.style.display = 'block';
  }

  function showPVCalcComparison(pvgisResult) {
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
      <div class="card" style="border-left:3px solid var(--color-accent)">
        <div class="card-title">Comparaison PVGIS vs Calcul local</div>
        ${localResult ? `
        <div class="kpi-grid" style="margin-bottom:14px">
          <div class="kpi-card" style="border-left:3px solid var(--color-accent)">
            <div class="kpi-value accent">${Math.round(pvgisResult.totals.E_y).toLocaleString('fr')}</div>
            <div class="kpi-label">Production PVGIS<br><span class="kpi-unit">kWh/an</span></div>
          </div>
          <div class="kpi-card" style="border-left:3px solid var(--color-primary)">
            <div class="kpi-value">${localResult.E_annual.toLocaleString('fr')}</div>
            <div class="kpi-label">Calcul local<br><span class="kpi-unit">kWh/an</span></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">
              ${pvgisResult.totals.E_y > 0
                ? ((localResult.E_annual - pvgisResult.totals.E_y) / pvgisResult.totals.E_y * 100).toFixed(1) + ' %'
                : '—'}
            </div>
            <div class="kpi-label">Écart local/PVGIS<br><span class="kpi-unit"></span></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value info">${pvgisResult.totals.l_total.toFixed(1)} %</div>
            <div class="kpi-label">Pertes totales PVGIS<br><span class="kpi-unit"></span></div>
          </div>
        </div>` : ''}
        <div class="chart-container"><canvas id="${chartId}"></canvas></div>
        <p style="font-size:11px;color:var(--color-text-muted);margin-top:8px">
          Source PVGIS : JRC European Commission — Base PVGIS-SARAH2 / ERA5
        </p>
      </div>`;

    setTimeout(() => {
      const existing = Chart.getChart(chartId);
      if (existing) existing.destroy();
      new Chart(document.getElementById(chartId), {
        type: 'bar',
        data: {
          labels: pvgisResult.monthly.map(m => m.name),
          datasets: [
            { label:'PVGIS (kWh/mois)', data: pvgisResult.monthly.map(m => Math.round(m.E_m)), backgroundColor:'rgba(245,166,35,0.75)', borderRadius:3 },
            ...(localResult ? [{ label:'Calcul local (kWh/mois)', data: localResult.monthly.map(m => m.E_month), backgroundColor:'rgba(26,107,60,0.65)', borderRadius:3 }] : [])
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position:'top', labels:{ boxWidth:12, padding:10 } } },
          scales: { y: { title:{ display:true, text:'Production (kWh/mois)' }, grid:{ color:'rgba(0,0,0,0.06)' } } }
        }
      });
    }, 50);
  }

  function showPVGISFallback(link) {
    const container = document.getElementById('pvgis-import-preview');
    if (!container) return;
    container.innerHTML = `
      <div class="alert alert-warning" style="margin-top:8px">
        <div style="font-size:11px">
          <strong>Proxy CORS indisponible</strong><br>
          <a href="${link}" target="_blank" style="color:var(--color-primary);font-weight:700">
            Ouvrir PVGIS PVcalc ↗
          </a> — télécharger le JSON puis :
          <label class="btn btn-outline btn-sm" style="margin-top:6px;display:inline-flex;cursor:pointer">
            <input type="file" accept=".json" style="display:none" onchange="PVGISImport.importFromFile(this)">
            Importer le fichier JSON
          </label>
        </div>
      </div>`;
    container.style.display = 'block';
  }

  /** Import depuis fichier JSON PVGIS téléchargé manuellement */
  function importFromFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        const result = parsePVCalcJSON(data);
        if (result) {
          setStatus(`✓ Fichier PVGIS importé — ${Math.round(result.totals.E_y)} kWh/an`, 'success');
          showPVCalcComparison(result);
        }
      } catch (err) {
        setStatus('✗ Fichier JSON invalide', 'error');
      }
    };
    reader.readAsText(file);
  }

  function parsePVCalcJSON(data) {
    const raw = data.outputs;
    if (!raw) return null;
    const rawMonthly = Array.isArray(raw.monthly?.fixed) ? raw.monthly.fixed
                     : Array.isArray(raw.monthly) ? raw.monthly
                     : [];
    const monthly = rawMonthly.map((row, i) => ({
      month: row.month ?? (i+1),
      name:  MONTH_NAMES[(row.month ?? i+1) - 1],
      E_m:   row['E_m']    ?? 0,
      H_i_m: row['H(i)_m'] ?? 0
    }));
    const totals = raw.totals?.fixed ?? raw.totals ?? {};
    return {
      monthly,
      totals: {
        E_y:     totals['E_y']     ?? 0,
        H_i_y:   totals['H(i)_y']  ?? 0,
        l_total: totals['l_total'] ?? 0,
        l_tg:    totals['l_tg']    ?? 0,
        l_aoi:   totals['l_aoi']   ?? 0
      }
    };
  }

  function init() {
    document.getElementById('btn-pvgis-weather')?.addEventListener('click', doImportWeather);
    document.getElementById('btn-pvgis-pvcalc')?.addEventListener('click', doImportPVCalc);
    document.getElementById('btn-hourly-weather')?.addEventListener('click', doImportHourlyWeather);
  }

  return { init, doImportWeather, doImportPVCalc, doImportHourlyWeather, importFromFile, setStatus };
})();

/**
 * site_survey.js — Diagramme solaire / horizon / ombrage / terrain / boussole
 *
 * Conventions :
 *   - Points d'horizon : azimut boussole 0°=Nord, 90°=Est, élévation 0–90°
 *   - Panneaux : azimut 0°=Sud (convention PV de l'appli)
 */
const SiteSurvey = (() => {
  const DEG = Math.PI / 180;
  const STORAGE_COMPASS = 'ose_compass_offset_v1';

  const state = {
    points: [],           // { az, elev, source?: 'manual'|'photo' }
    compassOffset: 0,     // ° ajoutés à la lecture brute
    lastHeading: null,
    lastPitch: null,
    photoActive: false,
    orientationBound: false,
    stream: null,
    monthlyLoss: null,    // [12] fraction beam perdue 0–1
    annualLossPct: 0,
    terrain: null,        // { tilt, azimuth, slopePct, source }
  };

  try {
    const saved = parseFloat(localStorage.getItem(STORAGE_COMPASS));
    if (!isNaN(saved)) state.compassOffset = saved;
  } catch (_) {}

  function _toast(msg, kind) {
    if (typeof showToast === 'function') showToast(msg, kind || 'ok');
  }

  function _normAz(a) {
    let x = Number(a) % 360;
    if (x < 0) x += 360;
    return x;
  }

  /** Position du soleil : élévation + azimut boussole (0=N). */
  function sunPos(lat, dayOfYear, solarHour) {
    const latR = lat * DEG;
    // déclinaison (Spencer / Cooper approx. comme SolarMath)
    const B = 2 * Math.PI * (dayOfYear - 1) / 365;
    const declR = (
      0.006918 - 0.399912 * Math.cos(B) + 0.070257 * Math.sin(B)
      - 0.006758 * Math.cos(2 * B) + 0.000907 * Math.sin(2 * B)
      - 0.002697 * Math.cos(3 * B) + 0.00148 * Math.sin(3 * B)
    );
    const omR = (solarHour - 12) * 15 * DEG;
    const sinEl = Math.sin(latR) * Math.sin(declR)
      + Math.cos(latR) * Math.cos(declR) * Math.cos(omR);
    const elev = Math.asin(Math.max(-1, Math.min(1, sinEl))) / DEG;
    const cosEl = Math.cos(elev * DEG);
    let cosAz = cosEl > 1e-6
      ? (Math.sin(declR) - Math.sin(latR) * sinEl) / (Math.cos(latR) * cosEl)
      : 0;
    cosAz = Math.max(-1, Math.min(1, cosAz));
    let az = Math.acos(cosAz) / DEG; // 0..180 from N toward E/W
    if (omR > 0) az = 360 - az;     // après-midi → Ouest
    return { elev, az: _normAz(az) };
  }

  function midDay(month) {
    let d = 0;
    const days = (typeof DAYS_IN_MONTH !== 'undefined')
      ? DAYS_IN_MONTH
      : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let i = 0; i < month - 1; i++) d += days[i];
    return d + Math.round(days[month - 1] / 2);
  }

  /** Élévation d'horizon interpolée à un azimut donné. */
  function horizonElevAt(az) {
    if (!state.points.length) return 0;
    const pts = [...state.points]
      .map(p => ({ az: _normAz(p.az), elev: Math.max(0, Math.min(90, +p.elev || 0)) }))
      .sort((a, b) => a.az - b.az);
    if (pts.length === 1) return pts[0].elev;
    const a = _normAz(az);
    // Dupliquer pour circularité
    const ext = [
      { az: pts[pts.length - 1].az - 360, elev: pts[pts.length - 1].elev },
      ...pts,
      { az: pts[0].az + 360, elev: pts[0].elev },
    ];
    for (let i = 0; i < ext.length - 1; i++) {
      if (a >= ext[i].az && a <= ext[i + 1].az) {
        const t = (a - ext[i].az) / Math.max(1e-6, ext[i + 1].az - ext[i].az);
        return ext[i].elev + t * (ext[i + 1].elev - ext[i].elev);
      }
    }
    return 0;
  }

  /**
   * Fraction de l'énergie directe perdue (ombre) par mois + annuelle.
   * Diffuse considérée disponible même à l'ombre.
   */
  function computeShading(lat) {
    const weather = (typeof AppState !== 'undefined') ? AppState.weatherData : null;
    const monthly = [];
    let sumBeam = 0, sumLost = 0;

    for (let m = 1; m <= 12; m++) {
      const day = midDay(m);
      let beam = 0, lost = 0;
      const ghi = weather?.[m - 1]?.GHI || 100;
      const dhi = weather?.[m - 1]?.DHI || 40;
      const beamShare = Math.max(0.15, Math.min(0.85, (ghi - dhi) / Math.max(1, ghi)));

      for (let h = 5; h <= 19; h += 0.5) {
        const sun = sunPos(lat, day, h);
        if (sun.elev <= 0) continue;
        const w = Math.sin(sun.elev * DEG); // proxy énergie
        beam += w;
        if (sun.elev < horizonElevAt(sun.az)) lost += w;
      }
      const frac = beam > 0 ? lost / beam : 0;
      monthly.push(frac);
      // Pondération mensuelle par GHI
      sumBeam += ghi * beamShare;
      sumLost += ghi * beamShare * frac;
    }

    state.monthlyLoss = monthly;
    state.annualLossPct = sumBeam > 0
      ? Math.round((sumLost / sumBeam) * 1000) / 10
      : Math.round((monthly.reduce((s, v) => s + v, 0) / 12) * 1000) / 10;
    return { monthly, annualLossPct: state.annualLossPct };
  }

  function addPoint(az, elev, source = 'manual') {
    state.points.push({
      az: Math.round(_normAz(az) * 10) / 10,
      elev: Math.round(Math.max(0, Math.min(90, +elev)) * 10) / 10,
      source,
    });
    state.points.sort((a, b) => a.az - b.az);
    persist();
    redraw();
    recompute();
  }

  function removePoint(idx) {
    if (idx < 0 || idx >= state.points.length) return;
    state.points.splice(idx, 1);
    persist();
    redraw();
    recompute();
  }

  function clearPoints() {
    state.points = [];
    state.monthlyLoss = null;
    state.annualLossPct = 0;
    persist();
    redraw();
    updateResultsUI();
  }

  function setCompassOffset(deg) {
    state.compassOffset = ((+deg || 0) % 360 + 360) % 360;
    if (state.compassOffset > 180) state.compassOffset -= 360;
    try { localStorage.setItem(STORAGE_COMPASS, String(state.compassOffset)); } catch (_) {}
    updateCompassUI();
  }

  function calibrateCompassTo(trueHeading) {
    if (state.lastHeading == null) {
      _toast('Activez d’abord la boussole (mode photo ou lecture).', 'warning');
      return;
    }
    // rawDisplayed = raw + offset_old ; we want displayed = true
    // true = raw + newOffset → newOffset = true - raw = true - (displayed - offset_old)
    const raw = _normAz(state.lastHeading - state.compassOffset);
    const next = _normAz(trueHeading) - raw;
    setCompassOffset(next);
    _toast(`Boussole calibrée (offset ${state.compassOffset.toFixed(1)}°).`);
  }

  function correctedHeading(raw) {
    return _normAz(raw + state.compassOffset);
  }

  // ── Orientation device ─────────────────────────────────────
  function _onOrient(e) {
    let heading = null;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
      heading = e.webkitCompassHeading;
    } else if (typeof e.alpha === 'number') {
      // absolute: alpha ~0 when pointing north (varies by browser)
      heading = e.absolute === false ? (360 - e.alpha) : (360 - e.alpha);
    }
    if (heading != null) {
      state.lastHeading = correctedHeading(heading);
    }
    if (typeof e.beta === 'number') {
      // beta ~0 téléphone à plat ; ~90 vertical → élévation regard ≈ 90 - |beta|
      const beta = e.beta;
      state.lastPitch = beta;
    }
    updateCompassUI();
  }

  async function startOrientation() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined'
          && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const p = await DeviceOrientationEvent.requestPermission();
        if (p !== 'granted') {
          _toast('Permission orientation refusée.', 'error');
          return false;
        }
      }
    } catch (err) {
      _toast('Orientation inaccessible : ' + (err.message || err), 'error');
      return false;
    }
    if (!state.orientationBound) {
      window.addEventListener('deviceorientationabsolute', _onOrient, true);
      window.addEventListener('deviceorientation', _onOrient, true);
      state.orientationBound = true;
    }
    return true;
  }

  function stopOrientation() {
    if (!state.orientationBound) return;
    window.removeEventListener('deviceorientationabsolute', _onOrient, true);
    window.removeEventListener('deviceorientation', _onOrient, true);
    state.orientationBound = false;
  }

  async function ensureNativeCameraPermission() {
    const bridge = window.webBridge || window.nativeBridge;
    if (!bridge || typeof bridge.requestCameraPermission !== 'function')
      return true; // navigateur / desktop : getUserMedia gère tout
    if (typeof bridge.hasCameraPermission === 'function' && bridge.hasCameraPermission())
      return true;
    try {
      bridge.requestCameraPermission();
    } catch (_) {
      return true;
    }
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 200));
      let st = null;
      try {
        st = typeof bridge.pollCameraPermission === 'function'
          ? bridge.pollCameraPermission()
          : (window.__oseCamLast || null);
      } catch (_) {}
      if (st === 'granted') return true;
      if (st === 'denied' || st === 'unavailable') return false;
      if (typeof bridge.hasCameraPermission === 'function' && bridge.hasCameraPermission())
        return true;
      // pending → continuer
    }
    return !!(typeof bridge.hasCameraPermission === 'function' && bridge.hasCameraPermission());
  }

  async function startPhotoMode() {
    const ok = await startOrientation();
    if (!ok && !window.DeviceOrientationEvent) {
      _toast('Pas de boussole — utilisez le mode manuel (azimut / élévation).', 'warning');
    }
    const video = document.getElementById('site-photo-video');
    const wrap = document.getElementById('site-photo-wrap');
    const camOk = await ensureNativeCameraPermission();
    if (!camOk) {
      _toast('Permission caméra refusée — autorisez-la dans Paramètres → Apps → Open Solar.', 'error');
      state.photoActive = true;
      if (wrap) wrap.style.display = '';
      updateCompassUI();
      return;
    }
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        state.stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (video) {
          video.setAttribute('playsinline', '');
          video.setAttribute('muted', '');
          video.muted = true;
          video.srcObject = state.stream;
          await video.play().catch(() => {});
        }
        _toast('Tournez-vous, visez l’obstacle, ajoutez un point.');
      } else {
        _toast('Caméra indisponible — mode boussole seul.', 'warning');
      }
    } catch (err) {
      const name = err?.name || '';
      const msg = err?.message || String(err);
      if (name === 'NotAllowedError' || /Permission|denied|NotAllowed/i.test(msg)) {
        _toast('Caméra refusée — vérifiez Paramètres → Apps → Open Solar → Caméra.', 'error');
      } else if (name === 'NotFoundError') {
        _toast('Aucune caméra détectée sur cet appareil.', 'warning');
      } else {
        _toast('Caméra : ' + msg + ' — boussole seule OK.', 'warning');
      }
    }
    state.photoActive = true;
    if (wrap) wrap.style.display = '';
    updateCompassUI();
  }

  function stopPhotoMode() {
    state.photoActive = false;
    const wrap = document.getElementById('site-photo-wrap');
    if (wrap) wrap.style.display = 'none';
    if (state.stream) {
      state.stream.getTracks().forEach(t => t.stop());
      state.stream = null;
    }
    const video = document.getElementById('site-photo-video');
    if (video) video.srcObject = null;
    stopOrientation();
  }

  function addPointFromPhoto() {
    let az = state.lastHeading;
    if (az == null) {
      const man = parseFloat(document.getElementById('site-man-az')?.value);
      if (isNaN(man)) {
        _toast('Boussole non disponible — saisissez l’azimut manuellement.', 'warning');
        return;
      }
      az = man;
    }
    let elev;
    if (state.lastPitch != null) {
      // Téléphone vertical (beta≈90) → horizon ~0° ; penché vers le haut → elev+
      elev = Math.max(0, Math.min(90, 90 - Math.abs(state.lastPitch)));
    } else {
      elev = parseFloat(document.getElementById('site-man-elev')?.value);
      if (isNaN(elev)) elev = 15;
    }
    // Permettre override manuel si champ rempli
    const elevOverride = document.getElementById('site-photo-elev')?.value;
    if (elevOverride !== '' && elevOverride != null && !isNaN(parseFloat(elevOverride)))
      elev = parseFloat(elevOverride);

    addPoint(az, elev, 'photo');
    _toast(`Point ${state.points.length} : az ${az.toFixed(0)}° · élév ${(+elev).toFixed(0)}°`);
  }

  function addPointManual() {
    const az = parseFloat(document.getElementById('site-man-az')?.value);
    const elev = parseFloat(document.getElementById('site-man-elev')?.value);
    if (isNaN(az) || isNaN(elev)) {
      _toast('Indiquez azimut et élévation.', 'warning');
      return;
    }
    addPoint(az, elev, 'manual');
  }

  // ── Terrain 3D (grille d’altitudes Open-Meteo) ─────────────
  async function importTerrainElevations() {
    const lat = AppState.location?.lat;
    const lon = AppState.location?.lon;
    if (lat == null || lon == null) {
      _toast('Fixez d’abord le lieu (Localisation).', 'warning');
      return;
    }
    _toast('Import terrain (altitudes)…');
    const stepM = 40;
    const n = 5; // 5×5
    const dLat = stepM / 111320;
    const dLon = stepM / (111320 * Math.max(0.2, Math.cos(lat * DEG)));
    const lats = [], lons = [], xs = [], ys = [];
    const half = (n - 1) / 2;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const dy = (i - half) * stepM; // m nord
        const dx = (j - half) * stepM; // m est
        xs.push(dx);
        ys.push(dy);
        lats.push(lat + (i - half) * dLat);
        lons.push(lon + (j - half) * dLon);
      }
    }
    try {
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lons.join(',')}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const elevs = data.elevation;
      if (!Array.isArray(elevs) || elevs.length !== xs.length)
        throw new Error('Réponse altitude incomplète');

      // Plan z = a·x + b·y + c  (moindres carrés)
      let Sx = 0, Sy = 0, Sz = 0, Sxx = 0, Syy = 0, Sxy = 0, Sxz = 0, Syz = 0;
      const N = xs.length;
      for (let k = 0; k < N; k++) {
        const x = xs[k], y = ys[k], z = elevs[k];
        Sx += x; Sy += y; Sz += z;
        Sxx += x * x; Syy += y * y; Sxy += x * y;
        Sxz += x * z; Syz += y * z;
      }
      // Solve 2×2 for a,b after centering
      const mx = Sx / N, my = Sy / N, mz = Sz / N;
      let cxx = 0, cyy = 0, cxy = 0, cxz = 0, cyz = 0;
      for (let k = 0; k < N; k++) {
        const x = xs[k] - mx, y = ys[k] - my, z = elevs[k] - mz;
        cxx += x * x; cyy += y * y; cxy += x * y;
        cxz += x * z; cyz += y * z;
      }
      const det = cxx * cyy - cxy * cxy;
      if (Math.abs(det) < 1e-8) throw new Error('Terrain trop plat / données insuffisantes');
      const a = (cxz * cyy - cyz * cxy) / det; // dz/dx (est)
      const b = (cyz * cxx - cxz * cxy) / det; // dz/dy (nord)

      const slopeRad = Math.atan(Math.sqrt(a * a + b * b));
      const tilt = slopeRad / DEG;
      // Aspect : direction de la plus grande pente descendante, en azimut PV 0=Sud
      // Gradient pointe vers la montée ; face toiture ≈ direction de la descente
      let aspectN = Math.atan2(-a, -b) / DEG; // from north, clockwise-ish
      if (aspectN < 0) aspectN += 360;
      // Convertir boussole → convention PV (0=Sud) : azPV = aspectN - 180
      let azPV = aspectN - 180;
      if (azPV > 180) azPV -= 360;
      if (azPV < -180) azPV += 360;

      const altCenter = elevs[Math.floor(N / 2)];
      state.terrain = {
        tilt: Math.round(tilt * 10) / 10,
        azimuth: Math.round(azPV * 10) / 10,
        slopePct: Math.round(Math.tan(slopeRad) * 1000) / 10,
        alt: altCenter,
        source: 'open-meteo-elevation',
      };
      if (typeof AppState !== 'undefined' && AppState.location) {
        AppState.location.alt = Math.round(altCenter);
        if (typeof updateLocationUI === 'function') updateLocationUI();
      }
      persist();
      updateTerrainUI();
      _toast(`Terrain : inclinaison ~${state.terrain.tilt}° · azimut ${state.terrain.azimuth}° (0=Sud)`);
    } catch (err) {
      console.error(err);
      _toast('Import terrain échoué : ' + (err.message || err), 'error');
    }
  }

  function applyTerrainToInstall() {
    if (!state.terrain) {
      _toast('Importez d’abord le terrain.', 'warning');
      return;
    }
    const { tilt, azimuth } = state.terrain;
    const ids = [
      ['sz-tilt', tilt], ['sz-azimuth', azimuth],
      ['inp-tilt', tilt], ['inp-azimuth', azimuth],
      ['og2-tilt', tilt], ['og2-azimuth', azimuth],
      ['lay-tilt', tilt], ['lay-azimuth', azimuth],
      ['dv-site-tilt', tilt], ['dv-site-azimuth', azimuth],
    ];
    ids.forEach(([id, v]) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    });
    if (typeof AppState !== 'undefined' && AppState.install) {
      AppState.install.tilt = tilt;
      AppState.install.azimuth = azimuth;
    }
    _toast('Inclinaison / orientation appliquées au projet.');
  }

  function applyShadingToLosses() {
    recompute();
    const shade = state.annualLossPct || 0;
    const baseEl = document.getElementById('sz-losses');
    const base = parseFloat(baseEl?.value) || 14;
    // Remplacer une éventuelle composante ombrage précédente : on ajoute sur base « système »
    // Heuristique : pertes système hors ombrage ~14 %, on fixe pertes = 14 + shade (plafonné)
    const next = Math.min(45, Math.round((14 + shade) * 10) / 10);
    ['sz-losses', 'inp-losses', 'og2-losses'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = next;
    });
    if (typeof AppState !== 'undefined' && AppState.install)
      AppState.install.losses = next;
    _toast(`Pertes système → ${next}% (base ~14 % + ombrage ${shade} %).`);
  }

  function recompute() {
    const lat = AppState?.location?.lat ?? 46;
    computeShading(lat);
    updateResultsUI();
    redraw();
  }

  // ── Canvas diagramme ───────────────────────────────────────
  function redraw() {
    const canvas = document.getElementById('site-solar-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) * 0.42;
    ctx.clearRect(0, 0, W, H);

    // Fond
    ctx.fillStyle = '#0b1a2a';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // Cercles d'élévation 0 / 30 / 60
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    [0, 30, 60, 90].forEach(el => {
      const r = R * (1 - el / 90);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      if (el > 0 && el < 90) ctx.fillText(el + '°', cx + 4, cy - r + 10);
    });

    // Axes N E S O
    const labels = [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'O']];
    labels.forEach(([az, lab]) => {
      const ang = (az - 90) * DEG; // 0°N en haut
      const x = cx + Math.cos(ang) * (R + 14);
      const y = cy + Math.sin(ang) * (R + 14);
      ctx.fillStyle = '#f5a623';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(lab, x, y + 4);
      ctx.strokeStyle = 'rgba(245,166,35,0.35)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
      ctx.stroke();
    });

    // Trajectoires solaires (solstices + équinoxe)
    const lat = AppState?.location?.lat ?? 46;
    const paths = [
      { day: 172, color: 'rgba(255,200,80,0.55)' },  // été
      { day: 80, color: 'rgba(180,200,255,0.45)' },  // équinoxe
      { day: 355, color: 'rgba(140,180,255,0.4)' },  // hiver
    ];
    paths.forEach(({ day, color }) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (let h = 4; h <= 20; h += 0.25) {
        const s = sunPos(lat, day, h);
        if (s.elev <= 0) { started = false; continue; }
        const r = R * (1 - s.elev / 90);
        const ang = (s.az - 90) * DEG;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // Profil d'horizon
    if (state.points.length) {
      ctx.fillStyle = 'rgba(80,100,120,0.75)';
      ctx.strokeStyle = '#90a4ae';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const step = 2;
      for (let az = 0; az <= 360; az += step) {
        const el = horizonElevAt(az);
        const r = R * (1 - el / 90);
        const ang = (az - 90) * DEG;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        if (az === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      // Remplir vers le bord (élév 0)
      for (let az = 360; az >= 0; az -= step) {
        const ang = (az - 90) * DEG;
        ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
      }
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      for (let az = 0; az <= 360; az += step) {
        const el = horizonElevAt(az);
        const r = R * (1 - el / 90);
        const ang = (az - 90) * DEG;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        if (az === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Points
      state.points.forEach(p => {
        const r = R * (1 - p.elev / 90);
        const ang = (p.az - 90) * DEG;
        ctx.fillStyle = p.source === 'photo' ? '#66bb6a' : '#42a5f5';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Heading actuel
    if (state.lastHeading != null) {
      const ang = (state.lastHeading - 90) * DEG;
      ctx.strokeStyle = '#ef5350';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
      ctx.stroke();
    }
  }

  function updateCompassUI() {
    const el = document.getElementById('site-compass-readout');
    if (el) {
      const h = state.lastHeading;
      const p = state.lastPitch;
      el.textContent = h == null
        ? `Boussole : — (offset ${state.compassOffset.toFixed(1)}°)`
        : `Cap ${h.toFixed(0)}° · pitch ${p != null ? p.toFixed(0) + '°' : '—'} · offset ${state.compassOffset.toFixed(1)}°`;
    }
    const off = document.getElementById('site-compass-offset');
    if (off && document.activeElement !== off) off.value = state.compassOffset;
  }

  function updateResultsUI() {
    const box = document.getElementById('site-shade-results');
    if (!box) return;
    if (!state.points.length) {
      box.innerHTML = '<p style="color:var(--color-text-muted);font-size:12px">Ajoutez des points d’horizon pour estimer l’ombrage saisonnier.</p>';
      renderPointsList();
      return;
    }
    const months = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
    const bars = (state.monthlyLoss || []).map((f, i) => {
      const pct = Math.round(f * 100);
      return `<div style="display:flex;align-items:center;gap:6px;font-size:11px">
        <span style="width:28px">${months[i]}</span>
        <div style="flex:1;height:8px;background:var(--color-border);border-radius:4px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${pct > 40 ? '#e53935' : pct > 15 ? '#f5a623' : '#43a047'}"></div>
        </div>
        <span style="width:36px;text-align:right">${pct}%</span>
      </div>`;
    }).join('');
    box.innerHTML = `
      <div style="font-size:14px;font-weight:700;margin-bottom:8px">
        Ombrage annuel estimé (direct) : <span style="color:var(--color-accent)">${state.annualLossPct} %</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">${bars}</div>
      <p style="font-size:11px;color:var(--color-text-muted);margin-top:8px;line-height:1.4">
        Part du rayonnement <em>direct</em> masquée par le profil d’horizon (diffuse conservée).
        Appliquez aux pertes système pour le dimensionnement.
      </p>`;
    renderPointsList();
  }

  function renderPointsList() {
    const ul = document.getElementById('site-points-list');
    if (!ul) return;
    if (!state.points.length) {
      ul.innerHTML = '<li style="color:var(--color-text-muted);font-size:12px">Aucun point</li>';
      return;
    }
    ul.innerHTML = state.points.map((p, i) =>
      `<li style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:4px 0;border-bottom:1px solid var(--color-border)">
        <span>#${i + 1} · az <strong>${p.az}°</strong> · élév <strong>${p.elev}°</strong>
        <span style="color:var(--color-text-muted)">${p.source === 'photo' ? '📷' : '✋'}</span></span>
        <button type="button" class="btn btn-outline btn-sm" onclick="SiteSurvey.removePoint(${i})" style="padding:2px 8px">✕</button>
      </li>`
    ).join('');
  }

  function updateTerrainUI() {
    const el = document.getElementById('site-terrain-result');
    if (!el) return;
    if (!state.terrain) {
      el.innerHTML = '<span style="color:var(--color-text-muted);font-size:12px">Pas encore de terrain importé.</span>';
      return;
    }
    const t = state.terrain;
    el.innerHTML = `
      <div style="font-size:13px;line-height:1.55">
        Inclinaison estimée : <strong>${t.tilt}°</strong>
        (${t.slopePct} %)<br>
        Orientation (0°=Sud) : <strong>${t.azimuth > 0 ? '+' : ''}${t.azimuth}°</strong><br>
        Altitude centre : ${t.alt} m
      </div>`;
  }

  function persist() {
    if (typeof AppState === 'undefined') return;
    AppState.siteSurvey = {
      points: state.points.map(p => ({ ...p })),
      annualLossPct: state.annualLossPct,
      monthlyLoss: state.monthlyLoss ? state.monthlyLoss.slice() : null,
      terrain: state.terrain ? { ...state.terrain } : null,
      compassOffset: state.compassOffset,
    };
  }

  function loadFromAppState() {
    const s = AppState?.siteSurvey;
    if (!s) return;
    state.points = Array.isArray(s.points) ? s.points.map(p => ({ ...p })) : [];
    state.annualLossPct = s.annualLossPct || 0;
    state.monthlyLoss = s.monthlyLoss ? s.monthlyLoss.slice() : null;
    state.terrain = s.terrain ? { ...s.terrain } : null;
    if (typeof s.compassOffset === 'number') state.compassOffset = s.compassOffset;
    redraw();
    updateResultsUI();
    updateTerrainUI();
    updateCompassUI();
  }

  function onCanvasClick(ev) {
    const canvas = document.getElementById('site-solar-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (ev.clientX - rect.left) * scaleX;
    const y = (ev.clientY - rect.top) * scaleY;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const R = Math.min(canvas.width, canvas.height) * 0.42;
    const dx = x - cx, dy = y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > R * 1.05 || dist < 4) return;
    let az = Math.atan2(dy, dx) / DEG + 90; // invert draw mapping
    az = _normAz(az);
    const elev = Math.max(0, Math.min(90, (1 - dist / R) * 90));
    addPoint(az, elev, 'manual');
  }

  function init() {
    loadFromAppState();
    const canvas = document.getElementById('site-solar-canvas');
    canvas?.addEventListener('click', onCanvasClick);
    document.getElementById('site-compass-offset')?.addEventListener('change', e => {
      setCompassOffset(parseFloat(e.target.value) || 0);
    });
    redraw();
    updateResultsUI();
    updateTerrainUI();
    updateCompassUI();
  }

  return {
    init, redraw, recompute,
    addPoint, addPointManual, addPointFromPhoto, removePoint, clearPoints,
    startPhotoMode, stopPhotoMode, startOrientation,
    setCompassOffset, calibrateCompassTo,
    importTerrainElevations, applyTerrainToInstall, applyShadingToLosses,
    loadFromAppState, persist,
    getState: () => state,
    sunPos, horizonElevAt, computeShading,
  };
})();

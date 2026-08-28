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
    compassOffset: 0,     // ° ajoutés à la lecture brute (après correction écran)
    lastHeading: null,    // cap 0=N, déjà corrigé écran + offset
    lastRawHeading: null, // cap avant offset utilisateur
    lastAlpha: null,
    lastWebkitHeading: null,
    lastPitch: null,      // pitch « écran » (°), ~90 = vertical / horizon
    lastElev: null,       // élévation regard 0–90° dérivée du pitch
    lastScreenAngle: 0,   // 0 portrait, 90/270 paysage…
    lastBeta: null,
    lastGamma: null,
    dragIndex: -1,
    dragMoved: false,
    photoActive: false,
    orientationBound: false,
    screenOrientBound: false,
    /** Une fois un event absolute reçu, on ignore deviceorientation (relatif) — sinon le cap oscille (ex. 90°↔300°). */
    gotAbsoluteOrient: false,
    _smoothHeading: null,
    stream: null,
    monthlyLoss: null,    // [12] fraction beam perdue 0–1 (moyenne mensuelle)
    halfHourlyKeep: null, // [12][48] facteur multiplicatif PV restant (0–1) par demi-heure typique
    halfHourlyKeepByDay: null, // [12][{day, keep[48]}] variation jour-à-jour
    panelShadeDetail: null,
    shadeMode: null,
    obstacles: [],        // { type, x, y, w, d, h, label } sur plan toiture (m)
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
   * Ombrage 3D : panneaux, obstacles, inter-rangées, profil/jour, diffuse SVF.
   * Délègue à ShadingEngine si disponible ; sinon repli horizon seul.
   */
  function computeShading(lat) {
    if (typeof ShadingEngine !== 'undefined' && ShadingEngine.computeFull) {
      const r = ShadingEngine.computeFull({
        lat,
        weather: AppState?.weatherData,
        horizonPoints: state.points,
      });
      state.monthlyLoss = r.monthlyLoss;
      state.halfHourlyKeep = r.halfHourlyKeep;
      state.halfHourlyKeepByDay = r.halfHourlyKeepByDay;
      state.panelShadeDetail = r.panelDetail;
      state.annualLossPct = r.annualLossPct;
      state.shadeMode = r.mode;
      return r;
    }

    const weather = (typeof AppState !== 'undefined') ? AppState.weatherData : null;
    const monthly = [];
    const halfHourlyKeep = Array.from({ length: 12 }, () => new Float32Array(48).fill(1));
    let sumBeam = 0, sumLost = 0;

    for (let m = 1; m <= 12; m++) {
      const day = midDay(m);
      let beam = 0, lost = 0;
      const ghi = weather?.[m - 1]?.GHI || 100;
      const dhi = weather?.[m - 1]?.DHI || 40;
      const beamShare = Math.max(0.15, Math.min(0.85, (ghi - dhi) / Math.max(1, ghi)));

      const slotBeam = new Float32Array(48);
      const slotLost = new Float32Array(48);

      // 1 minute → demi-heure ( ind 0..47 )
      for (let mi = 0; mi < 24 * 60; mi++) {
        const h = mi / 60;
        const sun = sunPos(lat, day, h);
        if (sun.elev <= 0) continue;
        const w = Math.sin(sun.elev * DEG);
        const s = Math.min(47, Math.floor(mi / 30));
        slotBeam[s] += w;
        beam += w;
        if (sun.elev < horizonElevAt(sun.az)) {
          slotLost[s] += w;
          lost += w;
        }
      }

      for (let s = 0; s < 48; s++) {
        if (slotBeam[s] <= 0) {
          halfHourlyKeep[m - 1][s] = 1;
          continue;
        }
        const shadeFrac = slotLost[s] / slotBeam[s]; // 0..1 de beam perdu
        // PV AC ≈ beam + diffus : on retire beamShare × shadeFrac
        halfHourlyKeep[m - 1][s] = Math.max(0, Math.min(1, 1 - beamShare * shadeFrac));
      }

      const frac = beam > 0 ? lost / beam : 0;
      monthly.push(frac);
      sumBeam += ghi * beamShare;
      sumLost += ghi * beamShare * frac;
    }

    state.monthlyLoss = monthly;
    state.halfHourlyKeep = halfHourlyKeep;
    state.annualLossPct = sumBeam > 0
      ? Math.round((sumLost / sumBeam) * 1000) / 10
      : Math.round((monthly.reduce((s, v) => s + v, 0) / 12) * 1000) / 10;
    return { monthly, halfHourlyKeep, annualLossPct: state.annualLossPct };
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
    state.halfHourlyKeep = null;
    state.halfHourlyKeepByDay = null;
    state.panelShadeDetail = null;
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
    if (state.lastHeading == null && state.lastRawHeading == null) {
      _toast('Activez d’abord la boussole (mode photo ou lecture).', 'warning');
      return;
    }
    const raw = state.lastRawHeading != null
      ? state.lastRawHeading
      : _normAz(state.lastHeading - state.compassOffset);
    // affiché = raw + offset → offset = vrai − raw
    const next = _normAz(trueHeading) - raw;
    setCompassOffset(next);
    state._smoothHeading = null;
    _applyOrientationSample(
      state.lastAlpha, state.lastBeta, state.lastGamma, state.lastWebkitHeading
    );
    _toast(`Boussole calibrée (offset ${state.compassOffset.toFixed(1)}°).`);
  }

  function correctedHeading(raw) {
    return _normAz(raw + state.compassOffset);
  }

  /**
   * Angle de rotation de l’écran (CSS / Android) :
   * 0 = portrait, 90 = paysage (sens antihoraire device), 180, 270.
   * Indispensable : alpha/beta/gamma sont liés au boîtier, pas au viewport.
   */
  function screenAngle() {
    try {
      if (screen.orientation && typeof screen.orientation.angle === 'number'
          && !isNaN(screen.orientation.angle)) {
        return ((screen.orientation.angle % 360) + 360) % 360;
      }
    } catch (_) {}
    if (typeof window.orientation === 'number' && !isNaN(window.orientation)) {
      return ((window.orientation % 360) + 360) % 360;
    }
    return (typeof window.innerWidth === 'number'
      && typeof window.innerHeight === 'number'
      && window.innerWidth > window.innerHeight) ? 90 : 0;
  }

  function screenAngleLabel(ang) {
    const a = ((ang % 360) + 360) % 360;
    if (a > 45 && a < 135) return 'paysage';
    if (a >= 135 && a < 225) return 'portrait inversé';
    if (a >= 225 && a < 315) return 'paysage';
    return 'portrait';
  }

  /**
   * Cap boussole du regard caméra (vecteur sortant par l’arrière de l’écran),
   * formule W3C Device Orientation — valable téléphone debout (portrait / paysage).
   * alpha/beta/gamma doivent être absolus (référentiel terrestre).
   */
  function compassHeadingFromEuler(alpha, beta, gamma) {
    const degtorad = Math.PI / 180;
    const _x = (Number(beta) || 0) * degtorad;
    const _y = (Number(gamma) || 0) * degtorad;
    const _z = (Number(alpha) || 0) * degtorad;
    const cX = Math.cos(_x);
    const cY = Math.cos(_y);
    const cZ = Math.cos(_z);
    const sX = Math.sin(_x);
    const sY = Math.sin(_y);
    const sZ = Math.sin(_z);
    // Composantes horizontales du vecteur « hors du dos de l’écran »
    const Vx = -cZ * sY - sZ * sX * cY;
    const Vy = -sZ * sY + cZ * sX * cY;
    if (Math.abs(Vx) < 1e-10 && Math.abs(Vy) < 1e-10) return null;
    let heading = Math.atan2(Vx, Vy) * (180 / Math.PI);
    if (heading < 0) heading += 360;
    return heading;
  }

  /** Écran quasi horizontal (à plat sur une table). */
  function isDeviceFlat(beta, gamma) {
    const b = Math.abs(Number(beta) || 0);
    const g = Math.abs(Number(gamma) || 0);
    return b < 25 && g < 25;
  }

  /**
   * Cap brut capteur (0=N) → cap dans le repère écran / viseur caméra.
   * En paysage à plat seulement : on ajoute l’angle d’écran (axes liés au boîtier).
   * Debout : inutile — compassHeadingFromEuler intègre déjà le roll.
   */
  function headingWithScreen(rawHeading, screenAng) {
    return _normAz(rawHeading + (screenAng || 0));
  }

  /**
   * Cap utile pour le viseur :
   *  - iOS : webkitCompassHeading (+ angle écran en paysage)
   *  - à plat : 360−alpha (+ angle écran)
   *  - debout portrait/paysage : formule W3C (direction caméra)
   */
  function computeCompassHeading(opts) {
    const alpha = opts?.alpha;
    const beta = opts?.beta;
    const gamma = opts?.gamma;
    const webkitHeading = opts?.webkitHeading;
    const screenAng = opts?.screenAng || 0;

    if (typeof webkitHeading === 'number' && !isNaN(webkitHeading))
      return headingWithScreen(webkitHeading, screenAng);

    if (typeof alpha !== 'number' || isNaN(alpha)) return null;

    const b = (typeof beta === 'number' && !isNaN(beta)) ? beta : 0;
    const g = (typeof gamma === 'number' && !isNaN(gamma)) ? gamma : 0;

    if (isDeviceFlat(b, g))
      return headingWithScreen(360 - alpha, screenAng);

    const upright = compassHeadingFromEuler(alpha, b, g);
    if (upright == null)
      return headingWithScreen(360 - alpha, screenAng);
    // Pas de +screenAng : alpha/beta/gamma sont dans le repère boîtier fixe
    return _normAz(upright);
  }

  /**
   * Pitch dans le plan de l’écran (~90° = appareil vertical, regard horizon).
   * Portrait : surtout beta ; paysage : surtout gamma.
   */
  function screenPitchFromSensors(beta, gamma, screenAng) {
    const b = (typeof beta === 'number' && !isNaN(beta)) ? beta : 0;
    const g = (typeof gamma === 'number' && !isNaN(gamma)) ? gamma : 0;
    const a = ((screenAng || 0) * Math.PI) / 180;
    return b * Math.cos(a) - g * Math.sin(a);
  }

  /** Élévation du regard caméra (0=horizon, + = ciel). pitch écran ~90 à la verticale. */
  function elevationFromScreenPitch(pitch) {
    if (typeof pitch !== 'number' || isNaN(pitch)) return null;
    // Debout : pitch≈90 → élév 0 ; penché vers le ciel : pitch↑ → élév↑
    return Math.max(0, Math.min(90, pitch - 90));
  }

  // ── Orientation device ─────────────────────────────────────

  /** Lissage circulaire léger (réduit le bruit capteur, pas les vrais virages). */
  function _smoothCompassHeading(next) {
    if (next == null || isNaN(next)) return next;
    if (state._smoothHeading == null) {
      state._smoothHeading = next;
      return next;
    }
    let d = next - state._smoothHeading;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    // Gros saut résiduel : rattrapage plus lent (évite le clignotement 90↔300)
    const k = Math.abs(d) > 60 ? 0.25 : 0.5;
    state._smoothHeading = _normAz(state._smoothHeading + d * k);
    return state._smoothHeading;
  }

  function _applyOrientationSample(alpha, beta, gamma, webkitHeading) {
    const ang = screenAngle();
    state.lastScreenAngle = ang;
    if (typeof alpha === 'number' && !isNaN(alpha)) state.lastAlpha = alpha;
    if (typeof beta === 'number' && !isNaN(beta)) state.lastBeta = beta;
    if (typeof gamma === 'number' && !isNaN(gamma)) state.lastGamma = gamma;
    if (typeof webkitHeading === 'number' && !isNaN(webkitHeading))
      state.lastWebkitHeading = webkitHeading;

    const heading = computeCompassHeading({
      alpha: state.lastAlpha,
      beta: state.lastBeta,
      gamma: state.lastGamma,
      webkitHeading: state.lastWebkitHeading,
      screenAng: ang,
    });

    if (heading != null && !isNaN(heading)) {
      // lastRawHeading = cap avant offset utilisateur (pour calibration)
      state.lastRawHeading = heading;
      state.lastHeading = _smoothCompassHeading(correctedHeading(heading));
    }

    if ((typeof state.lastBeta === 'number')
        || (typeof state.lastGamma === 'number')) {
      const pitch = screenPitchFromSensors(state.lastBeta, state.lastGamma, ang);
      state.lastPitch = pitch;
      state.lastElev = elevationFromScreenPitch(pitch);
    }
    updateCompassUI();
    if (state.orientationBound || state.photoActive) redraw();
  }

  function _onOrientAbsolute(e) {
    state.gotAbsoluteOrient = true;
    const webkit = (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading))
      ? e.webkitCompassHeading : null;
    _applyOrientationSample(
      typeof e.alpha === 'number' ? e.alpha : state.lastAlpha,
      typeof e.beta === 'number' ? e.beta : state.lastBeta,
      typeof e.gamma === 'number' ? e.gamma : state.lastGamma,
      // Sur Android absolute, préférer la formule W3C (pas webkit)
      null
    );
    // Si pas d’alpha mais webkit (rare), fallback
    if ((typeof e.alpha !== 'number' || isNaN(e.alpha)) && webkit != null)
      _applyOrientationSample(state.lastAlpha, state.lastBeta, state.lastGamma, webkit);
  }

  function _onOrientRelative(e) {
    // Ne pas mélanger avec absolute : les deux se disputent (typique Android WebView → 90°↔300°)
    if (state.gotAbsoluteOrient) return;
    if (e && e.absolute === true) {
      _onOrientAbsolute(e);
      return;
    }
    const webkit = (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading))
      ? e.webkitCompassHeading : null;
    if (webkit != null) {
      _applyOrientationSample(
        typeof e.alpha === 'number' ? e.alpha : state.lastAlpha,
        typeof e.beta === 'number' ? e.beta : state.lastBeta,
        typeof e.gamma === 'number' ? e.gamma : state.lastGamma,
        webkit
      );
      return;
    }
    if (typeof e?.alpha === 'number' && !isNaN(e.alpha)) {
      // Dernier recours sans absolute : après délai, traiter comme absolu
      if (!state._relativeAlphaFallback) return;
      _applyOrientationSample(
        e.alpha,
        typeof e.beta === 'number' ? e.beta : state.lastBeta,
        typeof e.gamma === 'number' ? e.gamma : state.lastGamma,
        null
      );
    }
  }

  /** Recalcule cap/pitch si l’utilisateur tourne la tablette sans nouveau event capteur. */
  function _onScreenOrientationChange() {
    if (state.lastAlpha == null && state.lastWebkitHeading == null) return;
    state._smoothHeading = null; // reset lissage au flip portrait/paysage
    _applyOrientationSample(
      state.lastAlpha, state.lastBeta, state.lastGamma, state.lastWebkitHeading
    );
  }

  function _bindScreenOrientation() {
    if (state.screenOrientBound) return;
    const handler = () => _onScreenOrientationChange();
    // Pas de « resize » : sur tablette ça bascule portrait/paysage à tort (clavier, barres).
    window.addEventListener('orientationchange', handler);
    try {
      if (screen.orientation && typeof screen.orientation.addEventListener === 'function') {
        screen.orientation.addEventListener('change', handler);
      }
    } catch (_) {}
    state.screenOrientBound = true;
    state._screenOrientHandler = handler;
  }

  function _unbindScreenOrientation() {
    if (!state.screenOrientBound) return;
    const handler = state._screenOrientHandler;
    if (handler) {
      window.removeEventListener('orientationchange', handler);
      try {
        if (screen.orientation && typeof screen.orientation.removeEventListener === 'function') {
          screen.orientation.removeEventListener('change', handler);
        }
      } catch (_) {}
    }
    state.screenOrientBound = false;
    state._screenOrientHandler = null;
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
      state.gotAbsoluteOrient = false;
      state._relativeAlphaFallback = false;
      state._smoothHeading = null;
      window.addEventListener('deviceorientationabsolute', _onOrientAbsolute, true);
      window.addEventListener('deviceorientation', _onOrientRelative, true);
      state.orientationBound = true;
      // Si aucun absolute en ~1,2 s → autoriser alpha relatif (appareils sans boussole abs.)
      clearTimeout(state._absFallbackTimer);
      state._absFallbackTimer = setTimeout(() => {
        if (!state.gotAbsoluteOrient) state._relativeAlphaFallback = true;
      }, 1200);
    }
    _bindScreenOrientation();
    state.lastScreenAngle = screenAngle();
    updateCompassUI();
    _toast('Boussole active — secouez l’appareil pour calibrer le capteur.');
    return true;
  }

  function stopOrientation() {
    if (state.orientationBound) {
      window.removeEventListener('deviceorientationabsolute', _onOrientAbsolute, true);
      window.removeEventListener('deviceorientation', _onOrientRelative, true);
      state.orientationBound = false;
    }
    clearTimeout(state._absFallbackTimer);
    state._absFallbackTimer = null;
    state.gotAbsoluteOrient = false;
    state._relativeAlphaFallback = false;
    state._smoothHeading = null;
    _unbindScreenOrientation();
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
    // Élévation = pitch live (prioritaire), sinon override, sinon champ manuel
    let elev = null;
    const elevOverride = document.getElementById('site-photo-elev')?.value;
    if (elevOverride !== '' && elevOverride != null && !isNaN(parseFloat(elevOverride))) {
      elev = parseFloat(elevOverride);
    } else if (state.lastElev != null) {
      elev = state.lastElev;
    } else if (state.lastPitch != null) {
      elev = elevationFromScreenPitch(state.lastPitch);
    } else {
      elev = parseFloat(document.getElementById('site-man-elev')?.value);
    }
    if (elev == null || isNaN(elev)) {
      _toast('Pitch / élévation indisponible — penchez l’appareil ou saisissez l’élévation.', 'warning');
      return;
    }

    addPoint(az, elev, 'photo');
    _toast(`Point ${state.points.length} : az ${(+az).toFixed(0)}° · élév ${(+elev).toFixed(0)}° (pitch)`);
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
  function _setTerrainStatus(msg, type) {
    const el = document.getElementById('terrain-import-status');
    if (!el) return;
    const colors = { info: '#1565c0', success: '#2e7d32', error: '#c62828', loading: '#888' };
    el.style.color = colors[type] || '#666';
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
  }

  async function importTerrainElevations() {
    const lat = AppState.location?.lat;
    const lon = AppState.location?.lon;
    if (lat == null || lon == null) {
      _toast('Fixez d’abord le lieu (onglet 📍 Lieu).', 'warning');
      _setTerrainStatus('✗ Fixez d’abord le lieu sur la carte', 'error');
      return;
    }
    const btn = document.getElementById('btn-import-terrain');
    if (btn) { btn.disabled = true; btn.classList.add('btn-loading'); }
    _setTerrainStatus('⏳ Import terrain (altitudes)…', 'loading');
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
      const msg = `✓ Terrain : ${state.terrain.tilt}° · az ${state.terrain.azimuth > 0 ? '+' : ''}${state.terrain.azimuth}° · ${Math.round(state.terrain.alt)} m`;
      _setTerrainStatus(msg, 'success');
      _toast(`Terrain : inclinaison ~${state.terrain.tilt}° · azimut ${state.terrain.azimuth}° (0=Sud)`);
      if (typeof persistCurrentProjectQuiet === 'function')
        persistCurrentProjectQuiet('Import terrain (relief)');
    } catch (err) {
      console.error(err);
      _setTerrainStatus('✗ Import terrain échoué : ' + (err.message || err), 'error');
      _toast('Import terrain échoué : ' + (err.message || err), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('btn-loading'); }
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
      if (!el) return;
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (el.tagName === 'SELECT') el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (typeof AppState !== 'undefined' && AppState.install) {
      AppState.install.tilt = tilt;
      AppState.install.azimuth = azimuth;
    }
    if (typeof renderPanelLayoutTab === 'function') renderPanelLayoutTab();
    _toast('Inclinaison / orientation appliquées au projet.');
    if (typeof persistCurrentProjectQuiet === 'function')
      persistCurrentProjectQuiet('Application terrain → inclinaison/azimut');
  }

  /**
   * Enregistre l’ombrage demi-heure dans le projet pour le Dimensionnement /
   * Hors réseau (plus de panneaux / batterie si besoin).
   * Ne gonfle PAS les pertes système (% ) : l’ombrage est déjà appliqué
   * créneau par créneau (évite le double comptage).
   */
  function applyShadingToLosses() {
    recompute();
    const shade = state.annualLossPct || 0;
    const slots = state.halfHourlyKeep?.length === 12;
    const mode = state.shadeMode || 'horizon';
    const nObs = state.obstacles?.length || 0;
    const nPan = state.panelShadeDetail?.length || 0;
    const parts = [`Ombrage ${shade} % enregistré`];
    if (mode === '3d_panels') parts.push(`${nPan} panneaux · profil/jour`);
    else if (nObs) parts.push(`${nObs} obstacle(s) 3D`);
    if (slots) parts.push('profil 30 min');
    parts.push('— relancez Dimensionner / Hors réseau.');
    _toast(parts.join(' · '));
    if (typeof persistCurrentProjectQuiet === 'function')
      persistCurrentProjectQuiet('Ombrage site → dimensionnement');
  }

  function addObstacle(o) {
    const obs = {
      type: o.type || 'box',
      roofId: o.roofId || null,
      x: +o.x || 0, y: +o.y || 0,
      w: Math.max(0.1, +o.w || 0.6),
      d: Math.max(0.1, +o.d || 0.6),
      h: Math.max(0.1, +o.h || 1.5),
      label: (o.label || '').trim() || `Obstacle ${state.obstacles.length + 1}`,
    };
    state.obstacles.push(obs);
    persist();
    recompute();
    renderObstaclesList();
    if (typeof Scene3D !== 'undefined') Scene3D.refresh?.();
    _toast(`Obstacle « ${obs.label} » ajouté`);
  }

  function removeObstacle(idx) {
    if (idx < 0 || idx >= state.obstacles.length) return;
    state.obstacles.splice(idx, 1);
    persist();
    recompute();
    renderObstaclesList();
  }

  function addObstacleFromForm() {
    const roof = typeof LayoutRoofs !== 'undefined' ? LayoutRoofs.getActiveRoof() : null;
    addObstacle({
      roofId: roof?.id || null,
      x: parseFloat(document.getElementById('site-obs-x')?.value) || 0,
      y: parseFloat(document.getElementById('site-obs-y')?.value) || 0,
      w: parseFloat(document.getElementById('site-obs-w')?.value) || 0.6,
      d: parseFloat(document.getElementById('site-obs-d')?.value) || 0.6,
      h: parseFloat(document.getElementById('site-obs-h')?.value) || 1.5,
      label: document.getElementById('site-obs-label')?.value || '',
    });
  }

  function renderObstaclesList() {
    const ul = document.getElementById('site-obstacles-list');
    if (!ul) return;
    if (!state.obstacles.length) {
      ul.innerHTML = '<li style="color:var(--color-text-muted);font-size:12px">Aucun obstacle volumétrique (cheminée, arbre…)</li>';
      return;
    }
    ul.innerHTML = state.obstacles.map((o, i) =>
      `<li style="display:flex;justify-content:space-between;gap:6px;font-size:12px;padding:4px 0;border-bottom:1px solid var(--color-border)">
        <span><strong>${o.label || 'Obstacle'}</strong> · ${o.w}×${o.d} m · h ${o.h} m @ (${o.x}, ${o.y})${o.roofId ? ` · ${o.roofId}` : ''}</span>
        <button type="button" class="btn btn-outline btn-sm" onclick="SiteSurvey.removeObstacle(${i})" style="padding:2px 8px">✕</button>
      </li>`
    ).join('');
  }

  function recompute() {
    const lat = AppState?.location?.lat ?? 46;
    computeShading(lat);
    persist(); // halfHourlyKeep doit être dans AppState avant Dimensionner
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

      // Points (plus gros si sélectionnés / déplaçables)
      state.points.forEach((p, i) => {
        const r = R * (1 - p.elev / 90);
        const ang = (p.az - 90) * DEG;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        const sel = state.dragIndex === i;
        ctx.fillStyle = sel ? '#ffee58' : (p.source === 'photo' ? '#66bb6a' : '#42a5f5');
        ctx.beginPath();
        ctx.arc(x, y, sel ? 8 : 6, 0, Math.PI * 2);
        ctx.fill();
        if (sel) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    }

    // Heading + élévation actuels (visée)
    if (state.lastHeading != null) {
      const elevAim = state.lastElev != null ? state.lastElev : 0;
      const rAim = R * (1 - elevAim / 90);
      const ang = (state.lastHeading - 90) * DEG;
      ctx.strokeStyle = '#ef5350';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
      ctx.stroke();
      // Marqueur d’élévation (pitch)
      ctx.fillStyle = '#ef5350';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * rAim, cy + Math.sin(ang) * rAim, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function _canvasGeom(canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const R = Math.min(canvas.width, canvas.height) * 0.42;
    return { rect, scaleX, scaleY, cx, cy, R };
  }

  function _clientToAzElev(canvas, clientX, clientY) {
    const { rect, scaleX, scaleY, cx, cy, R } = _canvasGeom(canvas);
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const dx = x - cx, dy = y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > R * 1.08 || dist < 2) return null;
    let az = Math.atan2(dy, dx) / DEG + 90;
    az = _normAz(az);
    const elev = Math.max(0, Math.min(90, (1 - dist / R) * 90));
    return { az, elev, x, y, dist, cx, cy, R };
  }

  function _hitTestPoint(canvas, clientX, clientY) {
    const { rect, scaleX, scaleY, cx, cy, R } = _canvasGeom(canvas);
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const hitR = 14 * Math.max(scaleX, scaleY);
    let best = -1, bestD = hitR;
    state.points.forEach((p, i) => {
      const r = R * (1 - p.elev / 90);
      const ang = (p.az - 90) * DEG;
      const px = cx + Math.cos(ang) * r;
      const py = cy + Math.sin(ang) * r;
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function movePoint(idx, az, elev) {
    if (idx < 0 || idx >= state.points.length) return;
    state.points[idx].az = Math.round(_normAz(az) * 10) / 10;
    state.points[idx].elev = Math.round(Math.max(0, Math.min(90, +elev)) * 10) / 10;
    state.points.sort((a, b) => a.az - b.az);
    // Ré-index après tri : retrouver le point déplacé
    // (approximatif via valeurs)
    persist();
    recompute();
  }

  function onPointerDown(ev) {
    const canvas = document.getElementById('site-solar-canvas');
    if (!canvas) return;
    const clientX = ev.clientX ?? ev.touches?.[0]?.clientX;
    const clientY = ev.clientY ?? ev.touches?.[0]?.clientY;
    if (clientX == null) return;
    const hit = _hitTestPoint(canvas, clientX, clientY);
    if (hit >= 0) {
      state.dragIndex = hit;
      state.dragMoved = false;
      canvas.style.cursor = 'grabbing';
      ev.preventDefault();
      redraw();
      return;
    }
    state.dragIndex = -1;
  }

  function onPointerMove(ev) {
    const canvas = document.getElementById('site-solar-canvas');
    if (!canvas || state.dragIndex < 0) return;
    const clientX = ev.clientX ?? ev.touches?.[0]?.clientX;
    const clientY = ev.clientY ?? ev.touches?.[0]?.clientY;
    if (clientX == null) return;
    const pos = _clientToAzElev(canvas, clientX, clientY);
    if (!pos) return;
    state.dragMoved = true;
    const idx = state.dragIndex;
    // Mettre à jour sans re-trier à chaque pixel (garde l’index)
    state.points[idx].az = Math.round(pos.az * 10) / 10;
    state.points[idx].elev = Math.round(pos.elev * 10) / 10;
    redraw();
    ev.preventDefault();
  }

  function onPointerUp(ev) {
    const canvas = document.getElementById('site-solar-canvas');
    if (!canvas) return;
    canvas.style.cursor = 'crosshair';
    if (state.dragIndex >= 0) {
      if (state.dragMoved) {
        state.points.sort((a, b) => a.az - b.az);
        persist();
        recompute();
        _toast('Point déplacé');
      }
      state.dragIndex = -1;
      state.dragMoved = false;
      redraw();
      return;
    }
    // Clic simple : ajouter un point
    const clientX = ev.clientX ?? ev.changedTouches?.[0]?.clientX;
    const clientY = ev.clientY ?? ev.changedTouches?.[0]?.clientY;
    if (clientX == null) return;
    const pos = _clientToAzElev(canvas, clientX, clientY);
    if (!pos) return;
    addPoint(pos.az, pos.elev, 'manual');
  }

  function updateCompassUI() {
    const el = document.getElementById('site-compass-readout');
    if (el) {
      const h = state.lastHeading;
      const elev = state.lastElev;
      const ang = state.lastScreenAngle ?? screenAngle();
      const orient = screenAngleLabel(ang);
      if (h == null) {
        el.textContent = `Boussole : — · ${orient} · offset ${state.compassOffset.toFixed(1)}°`;
      } else {
        const elevStr = elev != null ? `${elev.toFixed(0)}°` : '—';
        el.textContent = `Cap ${h.toFixed(0)}° · élév ${elevStr} · ${orient} (${ang}°) · offset ${state.compassOffset.toFixed(1)}°`;
      }
    }
    const off = document.getElementById('site-compass-offset');
    if (off && document.activeElement !== off) off.value = state.compassOffset;

    // HUD mode photo : cap + élévation live (pitch pris en compte)
    const hud = document.getElementById('site-photo-hud');
    if (hud) {
      const h = state.lastHeading;
      const elev = state.lastElev;
      if (h == null && elev == null) {
        hud.textContent = 'Cap — · Élév — (activez la boussole)';
      } else {
        hud.textContent = `Cap ${h != null ? h.toFixed(0) + '°' : '—'} · Élév ${elev != null ? elev.toFixed(0) + '°' : '—'} · ${screenAngleLabel(state.lastScreenAngle ?? screenAngle())}`;
      }
    }
    // Préremplir les champs manuels si non focus (visée photo)
    if (state.photoActive) {
      const azEl = document.getElementById('site-man-az');
      const elevEl = document.getElementById('site-man-elev');
      if (azEl && document.activeElement !== azEl && state.lastHeading != null)
        azEl.value = Math.round(state.lastHeading * 10) / 10;
      if (elevEl && document.activeElement !== elevEl && state.lastElev != null)
        elevEl.value = Math.round(state.lastElev * 10) / 10;
      const pe = document.getElementById('site-photo-elev');
      if (pe && document.activeElement !== pe && state.lastElev != null)
        pe.placeholder = `auto ${state.lastElev.toFixed(0)}°`;
    }
  }

  function updateResultsUI() {
    const box = document.getElementById('site-shade-results');
    if (!box) return;
    const has3d = state.halfHourlyKeep?.length === 12
      || state.obstacles?.length
      || state.panelShadeDetail?.length;
    if (!state.points.length && !has3d) {
      box.innerHTML = `<p style="color:var(--color-text-muted);font-size:12px;line-height:1.45">
        Ajoutez des points d’horizon <em>ou</em> des obstacles 3D + implantation panneaux (onglet Implantation),
        puis <strong>Recalculer ombrage</strong>. Profil demi-heure généré même sans horizon.</p>`;
      renderPointsList();
      renderObstaclesList();
      return;
    }
    if (!state.monthlyLoss?.length) {
      recompute();
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
    const modeLabel = {
      '3d_panels': '3D panneau par panneau + inter-rangées',
      '3d_obstacles': '3D obstacles volumétriques',
      horizon: 'Horizon + 3D',
    }[state.shadeMode] || 'Ombrage combiné';
    const panelInfo = state.panelShadeDetail?.length
      ? `<p style="font-size:11px;margin-top:6px">${state.panelShadeDetail.length} panneaux modélisés (pertes individuelles).</p>`
      : '';
    box.innerHTML = `
      <div style="font-size:14px;font-weight:700;margin-bottom:8px">
        Ombrage annuel : <span style="color:var(--color-accent)">${state.annualLossPct} %</span>
        <span style="font-size:11px;font-weight:400;color:var(--color-text-muted)"> · ${modeLabel}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">${bars}</div>
      ${panelInfo}
      <p style="font-size:11px;color:var(--color-text-muted);margin-top:8px;line-height:1.4">
        Direct masqué + diffuse réduit (SVF ciel). Profil <strong>30 min × 5 jours/mois</strong> (variation jour-à-jour).
        Relancez <strong>Dimensionner</strong> après modification.
      </p>`;
    renderPointsList();
    renderObstaclesList();
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
    if (el) {
      if (!state.terrain) {
        el.innerHTML = '<span style="color:var(--color-text-muted);font-size:12px">Pas encore de terrain importé.</span>';
      } else {
        const t = state.terrain;
        el.innerHTML = `
          <div style="font-size:13px;line-height:1.55">
            Inclinaison estimée : <strong>${t.tilt}°</strong>
            (${t.slopePct} %)<br>
            Orientation (0°=Sud) : <strong>${t.azimuth > 0 ? '+' : ''}${t.azimuth}°</strong><br>
            Altitude centre : ${t.alt} m
          </div>`;
      }
    }
    // Statut sidebar (même zone que météo)
    if (state.terrain) {
      const t = state.terrain;
      _setTerrainStatus(
        `✓ Terrain : ${t.tilt}° · az ${t.azimuth > 0 ? '+' : ''}${t.azimuth}° · ${Math.round(t.alt)} m`,
        'success'
      );
    }
  }

  function persist() {
    if (typeof AppState === 'undefined') return;
    AppState.siteSurvey = {
      points: state.points.map(p => ({ ...p })),
      annualLossPct: state.annualLossPct,
      monthlyLoss: state.monthlyLoss ? state.monthlyLoss.slice() : null,
      halfHourlyKeep: state.halfHourlyKeep
        ? state.halfHourlyKeep.map(row => Array.from(row))
        : null,
      halfHourlyKeepByDay: state.halfHourlyKeepByDay
        ? state.halfHourlyKeepByDay.map(month =>
            month.map(s => ({ day: s.day, keep: Array.from(s.keep) }))
          )
        : null,
      panelShadeDetail: state.panelShadeDetail || null,
      shadeMode: state.shadeMode || null,
      obstacles: Array.isArray(state.obstacles) ? state.obstacles.map(o => ({ ...o })) : [],
      roof: (typeof ShadingEngine !== 'undefined' && ShadingEngine.readRoofAndPanels)
        ? ShadingEngine.readRoofAndPanels().roof
        : null,
      roofs: typeof LayoutRoofs !== 'undefined' ? LayoutRoofs.getRoofs() : null,
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
    state.halfHourlyKeep = Array.isArray(s.halfHourlyKeep) && s.halfHourlyKeep.length === 12
      ? s.halfHourlyKeep.map(row => new Float32Array(row))
      : null;
    state.halfHourlyKeepByDay = Array.isArray(s.halfHourlyKeepByDay) && s.halfHourlyKeepByDay.length === 12
      ? s.halfHourlyKeepByDay.map(month =>
          month.map(entry => ({
            day: entry.day,
            keep: Array.isArray(entry.keep) ? entry.keep.slice() : entry.keep,
          }))
        )
      : null;
    state.panelShadeDetail = s.panelShadeDetail || null;
    state.shadeMode = s.shadeMode || null;
    state.obstacles = Array.isArray(s.obstacles) ? s.obstacles.map(o => ({ ...o })) : [];
    state.terrain = s.terrain ? { ...s.terrain } : null;
    if (typeof s.compassOffset === 'number') state.compassOffset = s.compassOffset;
    redraw();
    updateResultsUI();
    updateTerrainUI();
    updateCompassUI();
  }

  function initScene3D() {
    const canvas = document.getElementById('site-scene-3d-canvas');
    if (!canvas || typeof Scene3D === 'undefined') return;
    if (typeof LayoutRoofs !== 'undefined') LayoutRoofs.loadFromAppState?.();
    Scene3D.attach(canvas);
  }

  function init() {
    loadFromAppState();
    const canvas = document.getElementById('site-solar-canvas');
    if (canvas) {
      canvas.style.touchAction = 'none';
      canvas.style.cursor = 'crosshair';
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerUp);
      // Fallback souris / tactile
      canvas.addEventListener('mousedown', onPointerDown);
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);
      canvas.addEventListener('touchstart', onPointerDown, { passive: false });
      canvas.addEventListener('touchmove', onPointerMove, { passive: false });
      canvas.addEventListener('touchend', onPointerUp);
    }
    document.getElementById('site-compass-offset')?.addEventListener('change', e => {
      setCompassOffset(parseFloat(e.target.value) || 0);
    });
    // Sidebar Localisation : mêmes actions que l’onglet Site
    document.getElementById('btn-import-terrain')?.addEventListener('click', () => {
      importTerrainElevations();
    });
    document.getElementById('btn-apply-terrain')?.addEventListener('click', () => {
      applyTerrainToInstall();
    });
    redraw();
    updateResultsUI();
    updateTerrainUI();
    updateCompassUI();
    renderObstaclesList();
    initScene3D();
  }

  return {
    init, redraw, recompute,
    addPoint, addPointManual, addPointFromPhoto, removePoint, clearPoints, movePoint,
    startPhotoMode, stopPhotoMode, startOrientation, stopOrientation,
    setCompassOffset, calibrateCompassTo,
    importTerrainElevations, applyTerrainToInstall, applyShadingToLosses,
    addObstacle, addObstacleFromForm, removeObstacle, renderObstaclesList,
    loadFromAppState, persist,
    initScene3D,
    getState: () => state,
    sunPos, horizonElevAt, computeShading,
    // helpers orientation (tests + debug)
    screenAngle, screenAngleLabel, headingWithScreen,
    screenPitchFromSensors, elevationFromScreenPitch,
    compassHeadingFromEuler, computeCompassHeading, isDeviceFlat,
  };
})();

/**
 * shading_engine.js — Ombrage 3D : panneau par panneau, obstacles, inter-rangées,
 * profil demi-heure jour par jour, diffuse (SVF), sans horizon obligatoire.
 *
 * Dépend de : constants.js (DAYS_IN_MONTH), PanelLayout3D (optionnel)
 */
const ShadingEngine = (() => {
  const DEG = Math.PI / 180;
  const SAMPLE_DAYS = [-14, -7, 0, 7, 14]; // offsets autour du jour médian du mois

  function normAz(a) {
    let x = Number(a) % 360;
    if (x < 0) x += 360;
    return x;
  }

  /** Soleil : élévation + azimut boussole (0=N), comme SiteSurvey. */
  function sunPos(lat, dayOfYear, solarHour) {
    const latR = lat * DEG;
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
    let az = Math.acos(cosAz) / DEG;
    if (omR > 0) az = 360 - az;
    return { elev, az: normAz(az) };
  }

  function horizonElevAt(az, points) {
    if (!points?.length) return 0;
    const pts = [...points]
      .map(p => ({ az: normAz(p.az), elev: Math.max(0, Math.min(90, +p.elev || 0)) }))
      .sort((a, b) => a.az - b.az);
    if (pts.length === 1) return pts[0].elev;
    const a = normAz(az);
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

  /** Lit géométrie toiture + panneaux depuis l’onglet Implantation ou AppState. */
  function readRoofAndPanels() {
    if (typeof LayoutRoofs !== 'undefined' && LayoutRoofs.buildPanelsForShading) {
      const built = LayoutRoofs.buildPanelsForShading();
      if (built && built.roofs && built.roofs.length) {
        const active = typeof LayoutRoofs.getActiveRoof === 'function' ? LayoutRoofs.getActiveRoof() : null;
        const primary = built.roofs.find(r => r.id === active?.id) || built.roofs[0];
        return {
          roof: primary
            ? { widthM: primary.widthM, depthM: primary.depthM, tilt: primary.tilt, azimuth: primary.azimuth }
            : null,
          roofs: built.roofs,
          panels: built.panels,
          layout: null,
        };
      }
    }

    const stored = (typeof AppState !== 'undefined' && AppState.siteSurvey?.roof) || null;
    const g = (id) => parseFloat(document.getElementById(id)?.value);
    const roofW = stored?.widthM ?? g('lay-roof-w') ?? 8;
    const roofD = stored?.depthM ?? g('lay-roof-d') ?? 6;
    const panelW = stored?.panelW ?? g('lay-panel-w') ?? 1.13;
    const panelH = stored?.panelH ?? g('lay-panel-h') ?? 1.76;
    const nPanels = Math.max(0, Math.round(stored?.nPanels ?? g('lay-npanels') ?? 0));
    const rows = Math.max(1, Math.round(stored?.rows ?? g('lay-rows') ?? 2));
    const tilt = stored?.tilt ?? g('lay-tilt') ?? (AppState?.install?.tilt ?? 30);
    const azimuth = stored?.azimuth ?? g('lay-azimuth') ?? (AppState?.install?.azimuth ?? 0);
    const gap = stored?.gap ?? 0.02;

    let layout = null;
    if (typeof PanelLayout3D !== 'undefined' && PanelLayout3D.computeLayout) {
      layout = PanelLayout3D.computeLayout({
        roofW, roofD, panelW, panelH: panelH, nPanels, rows, gap, tilt, azimuth,
      });
    }

    const panels = [];
    if (layout && layout.nPanels > 0 && layout.cols > 0) {
      const { cols, panelW: pw, footprintH, gap: gp, roofW: rw, roofD: rd } = layout;
      const arrayW = cols * pw + (cols - 1) * gp;
      const arrayD = layout.rows * footprintH + (layout.rows - 1) * gp;
      const offX = (rw - arrayW) / 2;
      const offY = (rd - arrayD) / 2;
      let placed = 0;
      for (let r = 0; r < layout.rows && placed < layout.nPanels; r++) {
        for (let c = 0; c < cols && placed < layout.nPanels; c++, placed++) {
          panels.push({
            id: placed,
            row: r, col: c,
            x: offX + c * (pw + gp),
            y: offY + r * (footprintH + gp),
            w: pw, d: footprintH,
            h: panelH * Math.sin((tilt * DEG)),
            tilt, azimuth,
          });
        }
      }
    } else if (nPanels > 0) {
      // Panneau unique centré si pas de grille détaillée
      panels.push({
        id: 0, row: 0, col: 0,
        x: (roofW - panelW) / 2, y: (roofD - panelH * Math.cos(tilt * DEG)) / 2,
        w: panelW, d: panelH * Math.cos(tilt * DEG),
        h: panelH * Math.sin(tilt * DEG),
        tilt, azimuth,
      });
    }

    return {
      roof: { widthM: roofW, depthM: roofD, tilt, azimuth },
      roofs: [{ id: null, name: null, widthM: roofW, depthM: roofD, tilt, azimuth, sceneX: 0, sceneY: 0 }],
      panels,
      layout,
    };
  }

  function readObstacles() {
    const list = (typeof AppState !== 'undefined' && AppState.siteSurvey?.obstacles)
      ? AppState.siteSurvey.obstacles.slice()
      : [];
    return list.map(o => ({
      type: o.type || 'box',
      x: +o.x || 0, y: +o.y || 0,
      w: Math.max(0.1, +o.w || 0.5),
      d: Math.max(0.1, +o.d || 0.5),
      h: Math.max(0.1, +o.h || 1),
      label: o.label || '',
      roofId: o.roofId || null,
    }));
  }

  /** Ombre portée d’un obstacle / panneau : rectangle au sol. */
  function shadowRect(obj, sunElev, sunAzCompass) {
    if (sunElev <= 0.5) return null;
    const tanEl = Math.tan(sunElev * DEG);
    const len = (obj.h || 0) / tanEl;
    const azRad = sunAzCompass * DEG;
    const dx = -Math.sin(azRad) * len;
    const dy = -Math.cos(azRad) * len;
    const x0 = obj.x, y0 = obj.y;
    const x1 = obj.x + obj.w, y1 = obj.y + obj.d;
    return {
      poly: [
        [x0, y0], [x1, y0], [x1 + dx, y0 + dy], [x0 + dx, y0 + dy],
        [x0, y1], [x1, y1], [x1 + dx, y1 + dy], [x0 + dx, y1 + dy],
      ],
      bbox: {
        minX: Math.min(x0, x1, x0 + dx, x1 + dx),
        maxX: Math.max(x0, x1, x0 + dx, x1 + dx),
        minY: Math.min(y0, y1, y0 + dy, y1 + dy),
        maxY: Math.max(y0, y1, y0 + dy, y1 + dy),
      },
    };
  }

  /** Un obstacle sans roofId (legacy) s’applique à tous les panneaux ; sinon seulement à sa toiture. */
  function obstacleAppliesTo(obstacle, panel) {
    return !obstacle.roofId || !panel?.roofId || obstacle.roofId === panel.roofId;
  }

  function pointInRect(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.d;
  }

  function pointInShadow(px, py, obj, sunElev, sunAz) {
    if (sunElev <= 0.5) return true;
    const sh = shadowRect(obj, sunElev, sunAz);
    if (!sh) return false;
    const b = sh.bbox;
    if (px < b.minX || px > b.maxX || py < b.minY || py > b.maxY) return false;
    const tanEl = Math.tan(sunElev * DEG);
    const azRad = sunAz * DEG;
    const sx = -Math.sin(azRad) / tanEl;
    const sy = -Math.cos(azRad) / tanEl;
    const corners = [
      [obj.x, obj.y], [obj.x + obj.w, obj.y],
      [obj.x + obj.w, obj.y + obj.d], [obj.x, obj.y + obj.d],
    ];
    for (const [cx, cy] of corners) {
      const projX = cx + obj.h * sx;
      const projY = cy + obj.h * sy;
      if (px >= Math.min(cx, projX) && px <= Math.max(cx, projX)
          && py >= Math.min(cy, projY) && py <= Math.max(cy, projY)) {
        const t = Math.abs((px - cx) * sy - (py - cy) * sx) / Math.max(1e-9, Math.hypot(sx, sy));
        if (t <= Math.max(obj.w, obj.d) * 0.6) return true;
      }
    }
    const mx = obj.x + obj.w / 2;
    const my = obj.y + obj.d / 2;
    const tipX = mx + obj.h * sx;
    const tipY = my + obj.h * sy;
    const minX = Math.min(mx, tipX) - obj.w / 2;
    const maxX = Math.max(mx, tipX) + obj.w / 2;
    const minY = Math.min(my, tipY) - obj.d / 2;
    const maxY = Math.max(my, tipY) + obj.d / 2;
    return px >= minX && px <= maxX && py >= minY && py <= maxY;
  }

  /** Facteur de vue du ciel (SVF) simplifié pour le diffuse. */
  function skyViewFactor(panel, obstacles, horizonPoints, sunAz) {
    let block = 0;
    const hElev = horizonElevAt(sunAz, horizonPoints);
    block = Math.max(block, hElev / 90);
    for (const o of obstacles) {
      if (!obstacleAppliesTo(o, panel)) continue;
      const dist = Math.hypot(
        (panel.x + panel.w / 2) - (o.x + o.w / 2),
        (panel.y + panel.d / 2) - (o.y + o.d / 2),
      );
      const ang = Math.atan2(o.h, Math.max(0.5, dist)) / (Math.PI / 2);
      block = Math.max(block, ang * 0.85);
    }
    for (const p of obstacles.length ? [] : []) { /* noop */ }
    return Math.max(0.15, Math.min(1, 1 - block * 0.9));
  }

  /**
   * keep direct + diffuse pour un panneau à un instant.
   * beamShare : fraction directe du GHI (Erbs-like).
   */
  function panelKeepAt(panel, sun, obstacles, allPanels, horizonPoints, beamShare) {
    if (sun.elev <= 0) return { keep: 0, direct: 0, diffuse: 0.15 * (1 - beamShare) };

    const cx = panel.x + panel.w / 2;
    const cy = panel.y + panel.d / 2;

    let directBlocked = sun.elev < horizonElevAt(sun.az, horizonPoints);

    if (!directBlocked) {
      for (const o of obstacles) {
        if (!obstacleAppliesTo(o, panel)) continue;
        if (pointInShadow(cx, cy, o, sun.elev, sun.az)) {
          directBlocked = true;
          break;
        }
      }
    }
    if (!directBlocked) {
      for (const p of allPanels) {
        if (p.id === panel.id) continue;
        if (panel.roofId != null && p.roofId != null && p.roofId !== panel.roofId) continue;
        if (p.row >= panel.row && p.y >= panel.y - 0.01) continue;
        if (pointInShadow(cx, cy, p, sun.elev, sun.az)) {
          directBlocked = true;
          break;
        }
      }
    }

    const svf = skyViewFactor(panel, obstacles, horizonPoints, sun.az);
    const keepDirect = directBlocked ? 0 : 1;
    const keepDiffuse = 0.25 + 0.75 * svf;
    const keep = keepDirect * beamShare + keepDiffuse * (1 - beamShare);
    return { keep: Math.max(0, Math.min(1, keep)), direct: keepDirect, diffuse: keepDiffuse };
  }

  function midDay(month, year) {
    const days = year && typeof getMonthlyDays === 'function'
      ? getMonthlyDays(year)
      : (typeof DAYS_IN_MONTH !== 'undefined' ? DAYS_IN_MONTH : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    let d = 0;
    for (let i = 0; i < month - 1; i++) d += days[i];
    return d + Math.round(days[month - 1] / 2);
  }

  /**
   * Calcul complet : profils demi-heure par jour échantillon + moyenne mensuelle + détail panneau.
   */
  function computeFull(options = {}) {
    const lat = options.lat ?? AppState?.location?.lat ?? 46;
    const weather = options.weather ?? AppState?.weatherData;
    const horizonPoints = options.horizonPoints
      ?? AppState?.siteSurvey?.points
      ?? [];
    const { roof, roofs, panels } = readRoofAndPanels();
    const obstacles = readObstacles();
    const year = options.year ?? AppState?.enedisYear ?? new Date().getFullYear();
    const daysArr = typeof getMonthlyDays === 'function'
      ? getMonthlyDays(year)
      : (typeof DAYS_IN_MONTH !== 'undefined' ? DAYS_IN_MONTH : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

    const halfHourlyKeep = Array.from({ length: 12 }, () => new Float32Array(48).fill(1));
    const halfHourlyKeepByDay = [];
    const panelDetail = panels.map(p => ({
      id: p.id, roofId: p.roofId ?? null, row: p.row, col: p.col,
      annualLossPct: 0,
      halfHourlyKeep: new Float32Array(48).fill(1),
    }));

    let sumBeam = 0, sumLost = 0;
    const monthlyLoss = [];

    for (let m = 1; m <= 12; m++) {
      const ghi = weather?.[m - 1]?.GHI || 100;
      const dhi = weather?.[m - 1]?.DHI || 40;
      const beamShare = Math.max(0.15, Math.min(0.85, (ghi - dhi) / Math.max(1, ghi)));
      const md = midDay(m, year);
      const monthSamples = [];

      for (const offset of SAMPLE_DAYS) {
        const dayOfYear = Math.max(1, Math.min(365, md + offset));
        const slotBeam = new Float32Array(48);
        const slotKeep = new Float32Array(48);
        const slotPanelKeeps = panels.length
          ? Array.from({ length: panels.length }, () => new Float32Array(48))
          : null;

        for (let mi = 0; mi < 24 * 60; mi++) {
          const h = mi / 60;
          const sun = sunPos(lat, dayOfYear, h);
          const s = Math.min(47, Math.floor(mi / 30));
          if (sun.elev <= 0) continue;
          const w = Math.sin(sun.elev * DEG);

          if (panels.length === 0) {
            const hElev = horizonElevAt(sun.az, horizonPoints);
            const directOk = sun.elev >= hElev;
            let keep = directOk ? 1 : 0;
            if (!directOk) keep = 0.25 + 0.75 * 0.5;
            else {
              for (const o of obstacles) {
                if (pointInShadow(0, 0, o, sun.elev, sun.az)) { keep = 0.25; break; }
              }
            }
            keep = keep * beamShare + (0.25 + 0.75 * 0.7) * (1 - beamShare);
            slotBeam[s] += w;
            slotKeep[s] += w * keep;
          } else {
            let sumK = 0, sumA = 0;
            panels.forEach((panel, pi) => {
              const { keep } = panelKeepAt(panel, sun, obstacles, panels, horizonPoints, beamShare);
              const area = panel.w * panel.d;
              sumK += keep * area;
              sumA += area;
              if (slotPanelKeeps) slotPanelKeeps[pi][s] += w * keep;
            });
            const avgK = sumA > 0 ? sumK / sumA : 1;
            slotBeam[s] += w;
            slotKeep[s] += w * avgK;
          }
        }

        for (let s = 0; s < 48; s++) {
          slotKeep[s] = slotBeam[s] > 0 ? slotKeep[s] / slotBeam[s] : 1;
          if (slotPanelKeeps) {
            for (let pi = 0; pi < panels.length; pi++) {
              slotPanelKeeps[pi][s] = slotBeam[s] > 0 ? slotPanelKeeps[pi][s] / slotBeam[s] : 1;
            }
          }
        }

        const dayInMonth = Math.max(1, Math.min(daysArr[m - 1], md + offset));
        monthSamples.push({ day: dayInMonth, dayOfYear, keep: Array.from(slotKeep) });
      }

      halfHourlyKeepByDay.push(monthSamples);

      const avgSlot = new Float32Array(48);
      for (let s = 0; s < 48; s++) {
        let sum = 0;
        for (const sample of monthSamples) sum += sample.keep[s];
        avgSlot[s] = sum / monthSamples.length;
      }
      halfHourlyKeep[m - 1] = avgSlot;

      let beam = 0, lost = 0;
      for (let s = 0; s < 48; s++) {
        beam += avgSlot[s] > 0 ? 1 : 0;
        lost += (1 - avgSlot[s]);
      }
      const frac = beam > 0 ? lost / beam : 0;
      monthlyLoss.push(Math.max(0, Math.min(1, 1 - avgSlot.reduce((a, b) => a + b, 0) / 48)));

      sumBeam += ghi * beamShare;
      sumLost += ghi * beamShare * (1 - avgSlot.reduce((a, b) => a + b, 0) / 48);

      if (panelDetail.length && monthSamples.length) {
        const ref = monthSamples[Math.floor(monthSamples.length / 2)].keep;
        panelDetail.forEach((pd, pi) => {
          const p = panels[pi];
          if (!p) return;
          let pl = 0, n = 0;
          for (let s = 0; s < 48; s++) {
            if (ref[s] < 1) { pl += (1 - ref[s]); n++; }
          }
          pd.annualLossPct = Math.round((pl / Math.max(1, n)) * 1000) / 10;
        });
      }
    }

    const annualLossPct = sumBeam > 0
      ? Math.round((sumLost / sumBeam) * 1000) / 10
      : Math.round((monthlyLoss.reduce((s, v) => s + v, 0) / 12) * 1000) / 10;

    return {
      halfHourlyKeep,
      halfHourlyKeepByDay,
      monthlyLoss,
      annualLossPct,
      roof,
      roofs,
      panels,
      obstacles,
      panelDetail,
      mode: panels.length ? '3d_panels' : (obstacles.length ? '3d_obstacles' : 'horizon'),
    };
  }

  /** Interpolation jour → profil 48 slots pour une date donnée. */
  function keepForDay(halfHourlyKeepByDay, month, dayOfMonth) {
    const samples = halfHourlyKeepByDay?.[month - 1];
    if (!samples?.length) return null;
    let best = samples[0];
    let bestDist = Math.abs(samples[0].day - dayOfMonth);
    for (const s of samples) {
      const d = Math.abs(s.day - dayOfMonth);
      if (d < bestDist) { best = s; bestDist = d; }
    }
    return new Float32Array(best.keep);
  }

  return {
    computeFull,
    keepForDay,
    readRoofAndPanels,
    readObstacles,
    sunPos,
    horizonElevAt,
    panelKeepAt,
    SAMPLE_DAYS,
  };
})();

if (typeof window !== 'undefined') window.ShadingEngine = ShadingEngine;

/**
 * panel_3d.js - Visualiseur d'implantation panneaux 2.5D (isométrique, Canvas 2D pur)
 *
 * Aucune dépendance externe : fonctionne 100% hors-ligne (APK Android / WebView Qt).
 * Ne dépend d'aucun autre module de l'app — prend un <canvas> + une config en entrée
 * et retourne les métriques calculées (surface utilisée, rangées×colonnes, etc.).
 *
 * Convention azimut identique au reste de l'app : 0° = Sud, -90° = Est, +90° = Ouest.
 */
const PanelLayout3D = (() => {
  const ISO_ANGLE = Math.PI / 6; // 30°
  const ISO_COS = Math.cos(ISO_ANGLE);
  const ISO_SIN = Math.sin(ISO_ANGLE);

  function clampNum(v, min, max, fallback) {
    const n = Number(v);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  /**
   * Calcule la disposition des panneaux (pur, sans rendu) : dimensions du
   * tableau, nombre de rangées/colonnes, surface utilisée, dépassement toiture.
   */
  function computeLayout(cfg = {}) {
    const roofW   = clampNum(cfg.roofW, 1, 200, 8);
    const roofD   = clampNum(cfg.roofD, 1, 200, 6);
    const panelW  = clampNum(cfg.panelW, 0.2, 3, 1.13);
    const panelH  = clampNum(cfg.panelH, 0.2, 3, 1.76);
    const nPanels = Math.max(0, Math.round(Number(cfg.nPanels) || 0));
    const rows    = Math.max(1, Math.round(Number(cfg.rows) || 1));
    const gap     = cfg.gap != null ? clampNum(cfg.gap, 0, 1, 0.02) : 0.02;
    const tilt    = clampNum(cfg.tilt, 0, 90, 30);
    const azimuth = clampNum(cfg.azimuth, -180, 180, 0);

    const cols = nPanels > 0 ? Math.ceil(nPanels / rows) : 0;
    const tiltRad = (tilt * Math.PI) / 180;
    // Le panneau incliné se "raccourcit" en projection au sol (cos) et se
    // soulève d'autant (sin) — cf. drawPanel().
    const footprintH = panelH * Math.cos(tiltRad);
    const riseZ = panelH * Math.sin(tiltRad);

    const arrayW = cols > 0 ? cols * panelW + (cols - 1) * gap : 0;
    const arrayD = rows > 0 && cols > 0 ? rows * footprintH + (rows - 1) * gap : 0;
    const fitsW = arrayW <= roofW + 1e-6;
    const fitsD = arrayD <= roofD + 1e-6;
    const fits = fitsW && fitsD;

    const panelsPlaced = Math.min(nPanels, rows * cols);
    const panelArea = panelW * panelH;
    const surfaceUsed = Math.round(panelsPlaced * panelArea * 100) / 100;
    const surfaceRoof = Math.round(roofW * roofD * 100) / 100;
    const coveragePct = surfaceRoof > 0 ? Math.round((surfaceUsed / surfaceRoof) * 1000) / 10 : 0;

    return {
      roofW, roofD, panelW, panelH, nPanels, rows, cols, gap, tilt, azimuth,
      tiltRad, footprintH, riseZ, arrayW, arrayD, fits, fitsW, fitsD,
      panelsPlaced, surfaceUsed, surfaceRoof, coveragePct,
    };
  }

  function projectRaw(x, y, z) {
    return [(x - y) * ISO_COS, (x + y) * ISO_SIN - z];
  }

  function makeProjector(origin, scale) {
    return (x, y, z) => [
      origin.x + (x - y) * ISO_COS * scale,
      origin.y + ((x + y) * ISO_SIN - z) * scale,
    ];
  }

  function drawPoly(ctx, pts, fill, stroke, lineWidth) {
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 1; ctx.stroke(); }
  }

  function lerpPt(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

  /** Rotation 2D d'un point (x,y) autour de (cx,cy) — utilisée pour l'azimut du tableau. */
  function rotateAround(x, y, cx, cy, cosA, sinA) {
    const dx = x - cx, dy = y - cy;
    return [cx + dx * cosA - dy * sinA, cy + dx * sinA + dy * cosA];
  }

  function drawPanel(ctx, project, x, y, w, d, riseZ, overflow, rotate) {
    const rot = rotate || ((px, py) => [px, py]);
    // Bord avant-bas (z=0) → bord arrière-haut (z=riseZ) : donne l'effet "quad relevé".
    // rot() tourne l'empreinte au sol (x,y) selon l'azimut avant projection — voir
    // commentaire dans render() pour la justification de cette rotation simplifiée.
    const [flx, fly] = rot(x, y + d);
    const [frx, fry] = rot(x + w, y + d);
    const [brx, bry] = rot(x + w, y);
    const [blx, bly] = rot(x, y);
    const pFL = project(flx, fly, 0);
    const pFR = project(frx, fry, 0);
    const pBR = project(brx, bry, riseZ);
    const pBL = project(blx, bly, riseZ);

    const topA = overflow ? '#e0704a' : '#2f6fb3';
    const topB = overflow ? '#c1502c' : '#123a63';
    const edgeColor = overflow ? '#7a2c18' : '#0a1f38';

    const grad = ctx.createLinearGradient(pBL[0], pBL[1], pFL[0], pFL[1]);
    grad.addColorStop(0, topA);
    grad.addColorStop(1, topB);
    drawPoly(ctx, [pFL, pFR, pBR, pBL], grad, edgeColor, 1);

    // Fines lignes de cellules (esthétique — évoque les cellules du panneau).
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 0.6;
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      const a = lerpPt(pFL, pFR, t);
      const b = lerpPt(pBL, pBR, t);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }

    // Fine tranche basse (rail de fixation) pour renforcer l'illusion de relief.
    drawPoly(ctx, [pFL, pFR, [pFR[0], pFR[1] + 3], [pFL[0], pFL[1] + 3]], edgeColor, null);
  }

  function drawCompass(ctx, cx, cy, r, azimuth) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fill();
    ctx.strokeStyle = '#8a9990';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    ctx.font = '600 9px sans-serif';
    ctx.fillStyle = '#1a2e23';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', cx, cy - r + 9);
    ctx.fillText('N', cx, cy + r - 8);
    ctx.fillText('E', cx - r + 9, cy);
    ctx.fillText('O', cx + r - 9, cy);

    // Flèche = orientation des panneaux (0°=Sud vers le haut de l'icône).
    const angleRad = (azimuth * Math.PI) / 180;
    const dx = Math.sin(angleRad) * (r - 7);
    const dy = -Math.cos(angleRad) * (r - 7);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dx, cy + dy);
    ctx.strokeStyle = '#f5a623';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#f5a623';
    ctx.fill();
    ctx.restore();
  }

  /**
   * Dessine l'implantation sur le canvas fourni. Retourne les métriques
   * calculées par computeLayout() (utile pour la légende de l'appelant).
   */
  function render(canvas, cfg) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const layout = computeLayout(cfg);
    const { roofW, roofD, rows, cols, panelW, footprintH, riseZ, gap, nPanels, arrayW, arrayD } = layout;

    const cssW = Math.max(1, canvas.clientWidth || canvas.width || 600);
    const cssH = Math.max(1, canvas.clientHeight || canvas.height || 400);
    const dpr = window.devicePixelRatio || 1;
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#eef3ef';
    ctx.fillRect(0, 0, cssW, cssH);

    // ── Cadrage : 1re passe à l'échelle 1 pour trouver la boîte englobante
    //    (toiture + tableau de panneaux, même s'il déborde), puis on déduit
    //    l'échelle et l'origine pour centrer proprement dans le canvas. ──
    const offX = (roofW - arrayW) / 2;
    const offY = (roofD - arrayD) / 2;
    const rawPts = [
      projectRaw(0, 0, 0), projectRaw(roofW, 0, 0),
      projectRaw(roofW, roofD, 0), projectRaw(0, roofD, 0),
    ];
    if (nPanels > 0) {
      rawPts.push(
        projectRaw(offX, offY + arrayD, 0),
        projectRaw(offX + arrayW, offY + arrayD, 0),
        projectRaw(offX, offY, riseZ),
        projectRaw(offX + arrayW, offY, riseZ)
      );
    }
    const xs = rawPts.map(p => p[0]);
    const ys = rawPts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const margin = 46;
    const availW = Math.max(20, cssW - margin * 2);
    const availH = Math.max(20, cssH - margin * 2);
    const spanX = Math.max(0.5, maxX - minX);
    const spanY = Math.max(0.5, maxY - minY);
    const scale = clampNum(Math.min(availW / spanX, availH / spanY), 2, 260, 40);
    const origin = {
      x: margin + (availW - spanX * scale) / 2 - minX * scale,
      y: margin + (availH - spanY * scale) / 2 - minY * scale,
    };
    const project = makeProjector(origin, scale);

    // ── Toiture ──
    const roofPts = [project(0, 0, 0), project(roofW, 0, 0), project(roofW, roofD, 0), project(0, roofD, 0)];
    drawPoly(ctx, roofPts, '#cdbb9e', '#8a7a5c', 2);
    ctx.strokeStyle = 'rgba(138,122,92,0.35)';
    ctx.lineWidth = 1;
    for (let gx = 1; gx < Math.ceil(roofW); gx++) {
      const p1 = project(gx, 0, 0), p2 = project(gx, roofD, 0);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
    for (let gy = 1; gy < Math.ceil(roofD); gy++) {
      const p1 = project(0, gy, 0), p2 = project(roofW, gy, 0);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }

    // ── Panneaux (ordre arrière→avant pour un chevauchement correct) ──
    // Azimut : on tourne l'empreinte du tableau de panneaux (au sol) autour de son
    // propre centre, dans le plan de la toiture, avant projection isométrique.
    // Ce n'est pas une vraie reprojection 3D de l'inclinaison selon l'azimut (qui
    // demanderait de faire pivoter tout le repère caméra) — c'est une approximation
    // schématique volontairement simple qui suffit à rendre visuellement différentes
    // une pose Sud (0°), Est (-90°) ou Ouest (+90°), tout en gardant le calcul de
    // computeLayout() (surface, ajustement toiture) inchangé.
    const azimuthRad = (layout.azimuth * Math.PI) / 180;
    let rotate = null;
    if (nPanels > 0 && Math.abs(layout.azimuth) > 1e-6) {
      const cosA = Math.cos(azimuthRad), sinA = Math.sin(azimuthRad);
      const rcx = offX + arrayW / 2, rcy = offY + arrayD / 2;
      rotate = (px, py) => rotateAround(px, py, rcx, rcy, cosA, sinA);
    }
    if (nPanels > 0 && rows > 0 && cols > 0) {
      let placed = 0;
      const cells = [];
      for (let r = 0; r < rows && placed < nPanels; r++) {
        for (let c = 0; c < cols && placed < nPanels; c++, placed++) {
          const x0 = offX + c * (panelW + gap);
          const y0 = offY + r * (footprintH + gap);
          const overflow = x0 < -1e-6 || y0 < -1e-6 || x0 + panelW > roofW + 1e-6 || y0 + footprintH > roofD + 1e-6;
          cells.push({ x0, y0, overflow, r });
        }
      }
      cells.sort((a, b) => a.r - b.r);
      cells.forEach(cell => drawPanel(ctx, project, cell.x0, cell.y0, panelW, footprintH, riseZ, cell.overflow, rotate));
    }

    // ── Boussole azimut ──
    drawCompass(ctx, cssW - 42, 42, 28, layout.azimuth);

    return layout;
  }

  /** Boîte volumétrique (cheminée, arbre…) sur le plan toiture. */
  function drawObstacleBox(ctx, project, ox, oy, obs, selected) {
    const x = ox + (obs.x || 0);
    const y = oy + (obs.y || 0);
    const w = Math.max(0.1, obs.w || 0.5);
    const d = Math.max(0.1, obs.d || 0.5);
    const h = Math.max(0.1, obs.h || 1);

    const p = (px, py, pz) => project(px, py, pz);
    const base = [p(x, y, 0), p(x + w, y, 0), p(x + w, y + d, 0), p(x, y + d, 0)];
    const top = [p(x, y, h), p(x + w, y, h), p(x + w, y + d, h), p(x, y + d, h)];

    const sideA = obs.type === 'tree' ? '#3d6b45' : '#7a6a58';
    const sideB = obs.type === 'tree' ? '#2a4d32' : '#5c4f42';
    const topC = obs.type === 'tree' ? '#4a8f55' : '#9a8878';
    const edge = selected ? '#f5a623' : '#3a3028';

    drawPoly(ctx, [base[0], base[1], top[1], top[0]], sideA, edge, selected ? 2 : 1);
    drawPoly(ctx, [base[1], base[2], top[2], top[1]], sideB, edge, selected ? 2 : 1);
    drawPoly(ctx, [top[0], top[1], top[2], top[3]], topC, edge, selected ? 2 : 1);

    if (obs.label) {
      const cx = (top[0][0] + top[2][0]) / 2;
      const cy = (top[0][1] + top[2][1]) / 2 - 4;
      ctx.save();
      ctx.font = '600 9px sans-serif';
      ctx.fillStyle = '#1a2e23';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(obs.label).slice(0, 14), cx, cy);
      ctx.restore();
    }

    const xs = [...base, ...top].map(pt => pt[0]);
    const ys = [...base, ...top].map(pt => pt[1]);
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys),
      roofLocal: { x: obs.x || 0, y: obs.y || 0, w, d },
    };
  }

  /** Prépare les toitures en coordonnées scène (comme renderMulti). */
  function buildSceneItems(roofs, sceneGap = 1.5) {
    if (!Array.isArray(roofs) || !roofs.length) return [];
    let sceneX = 0;
    return roofs.map((cfg, i) => {
      const layout = computeLayout(cfg);
      const item = {
        cfg,
        id: cfg.id || `roof-${i}`,
        name: cfg.name || `Toiture ${i + 1}`,
        layout,
        sceneX,
        sceneY: 0,
      };
      sceneX += layout.roofW + sceneGap;
      return item;
    });
  }

  function unprojectGround(sx, sy, origin, scale) {
    const px = (sx - origin.x) / scale;
    const py = (sy - origin.y) / scale;
    const a = px / ISO_COS;
    const b = py / ISO_SIN;
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }

  /** Dessine une toiture + panneaux décalée de (ox, oy) en coordonnées scène. */
  function drawRoofScene(ctx, project, layout, ox, oy, highlight) {
    const { roofW, roofD, rows, cols, panelW, footprintH, riseZ, gap, nPanels, arrayW, arrayD } = layout;
    const offX = ox + (roofW - arrayW) / 2;
    const offY = oy + (roofD - arrayD) / 2;

    const roofPts = [
      project(ox, oy, 0), project(ox + roofW, oy, 0),
      project(ox + roofW, oy + roofD, 0), project(ox, oy + roofD, 0),
    ];
    const roofFill = highlight ? '#d4c4a8' : '#cdbb9e';
    const roofEdge = highlight ? '#f5a623' : '#8a7a5c';
    drawPoly(ctx, roofPts, roofFill, roofEdge, highlight ? 2.5 : 2);
    ctx.strokeStyle = 'rgba(138,122,92,0.35)';
    ctx.lineWidth = 1;
    for (let gx = 1; gx < Math.ceil(roofW); gx++) {
      const p1 = project(ox + gx, oy, 0), p2 = project(ox + gx, oy + roofD, 0);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
    for (let gy = 1; gy < Math.ceil(roofD); gy++) {
      const p1 = project(ox, oy + gy, 0), p2 = project(ox + roofW, oy + gy, 0);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }

    const azimuthRad = (layout.azimuth * Math.PI) / 180;
    let rotate = null;
    if (nPanels > 0 && Math.abs(layout.azimuth) > 1e-6) {
      const cosA = Math.cos(azimuthRad), sinA = Math.sin(azimuthRad);
      const rcx = offX + arrayW / 2, rcy = offY + arrayD / 2;
      rotate = (px, py) => rotateAround(px, py, rcx, rcy, cosA, sinA);
    }
    if (nPanels > 0 && rows > 0 && cols > 0) {
      let placed = 0;
      const cells = [];
      for (let r = 0; r < rows && placed < nPanels; r++) {
        for (let c = 0; c < cols && placed < nPanels; c++, placed++) {
          const x0 = offX + c * (panelW + gap);
          const y0 = offY + r * (footprintH + gap);
          const overflow = x0 < ox - 1e-6 || y0 < oy - 1e-6
            || x0 + panelW > ox + roofW + 1e-6 || y0 + footprintH > oy + roofD + 1e-6;
          cells.push({ x0, y0, overflow, r });
        }
      }
      cells.sort((a, b) => a.r - b.r);
      cells.forEach(cell => drawPanel(ctx, project, cell.x0, cell.y0, panelW, footprintH, riseZ, cell.overflow, rotate));
    }
    return { offX, offY, roofCenterX: ox + roofW / 2 };
  }

  /**
   * Dessine plusieurs toitures côte à côte (écart ~1,5 m). Chaque entrée = config
   * computeLayout/render + name optionnel. Retourne métriques agrégées.
   */
  function renderMulti(canvas, roofs) {
    if (!canvas || typeof canvas.getContext !== 'function' || !Array.isArray(roofs) || !roofs.length) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const SCENE_GAP = 1.5;
    const items = roofs.map((cfg, i) => ({
      cfg,
      name: cfg.name || `Toiture ${i + 1}`,
      layout: computeLayout(cfg),
      sceneX: 0,
    }));

    let sceneX = 0;
    items.forEach(item => {
      item.sceneX = sceneX;
      sceneX += item.layout.roofW + SCENE_GAP;
    });

    const cssW = Math.max(1, canvas.clientWidth || canvas.width || 600);
    const cssH = Math.max(1, canvas.clientHeight || canvas.height || 400);
    const dpr = window.devicePixelRatio || 1;
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#eef3ef';
    ctx.fillRect(0, 0, cssW, cssH);

    const rawPts = [];
    items.forEach(({ layout, sceneX: sx }) => {
      const { roofW, roofD, nPanels, arrayW, arrayD, riseZ } = layout;
      const offX = sx + (roofW - arrayW) / 2;
      const offY = (roofD - arrayD) / 2;
      rawPts.push(
        projectRaw(sx, 0, 0), projectRaw(sx + roofW, 0, 0),
        projectRaw(sx + roofW, roofD, 0), projectRaw(sx, roofD, 0),
      );
      if (nPanels > 0) {
        rawPts.push(
          projectRaw(offX, offY + arrayD, 0),
          projectRaw(offX + arrayW, offY + arrayD, 0),
          projectRaw(offX, offY, riseZ),
          projectRaw(offX + arrayW, offY, riseZ),
        );
      }
    });

    const xs = rawPts.map(p => p[0]);
    const ys = rawPts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const margin = 46;
    const labelMargin = items.length > 1 ? 18 : 0;
    const availW = Math.max(20, cssW - margin * 2);
    const availH = Math.max(20, cssH - margin * 2 - labelMargin);
    const spanX = Math.max(0.5, maxX - minX);
    const spanY = Math.max(0.5, maxY - minY);
    const scale = clampNum(Math.min(availW / spanX, availH / spanY), 2, 260, 40);
    const origin = {
      x: margin + (availW - spanX * scale) / 2 - minX * scale,
      y: margin + labelMargin + (availH - spanY * scale) / 2 - minY * scale,
    };
    const project = makeProjector(origin, scale);

    const labelAnchors = [];
    items.forEach(item => {
      const anchor = drawRoofScene(ctx, project, item.layout, item.sceneX, 0);
      labelAnchors.push({ name: item.name, cx: anchor.roofCenterX, cy: 0 });
    });

    if (items.length > 1) {
      ctx.save();
      ctx.font = '600 11px sans-serif';
      ctx.fillStyle = '#1a2e23';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      labelAnchors.forEach(({ name, cx }) => {
        const [lx, ly] = project(cx, 0, 0);
        ctx.fillText(name, lx, ly - 6);
      });
      ctx.restore();
    }

    const compassAz = items.find(i => i.layout.nPanels > 0)?.layout.azimuth ?? items[0].layout.azimuth;
    drawCompass(ctx, cssW - 42, 42, 28, compassAz);

    let nPanels = 0, panelsPlaced = 0, surfaceUsed = 0, surfaceRoof = 0;
    let totalRows = 0, maxCols = 0;
    const perRoof = [];
    const overflowWarnings = [];

    items.forEach(item => {
      const L = item.layout;
      nPanels += L.nPanels;
      panelsPlaced += L.panelsPlaced;
      surfaceUsed += L.surfaceUsed;
      surfaceRoof += L.surfaceRoof;
      totalRows += L.rows;
      if (L.cols > maxCols) maxCols = L.cols;
      perRoof.push({ name: item.name, id: item.cfg.id, ...L });
      if (L.nPanels > 0 && !L.fits) {
        overflowWarnings.push({ name: item.name, fitsW: L.fitsW, fitsD: L.fitsD });
      }
    });

    surfaceUsed = Math.round(surfaceUsed * 100) / 100;
    surfaceRoof = Math.round(surfaceRoof * 100) / 100;
    const coveragePct = surfaceRoof > 0 ? Math.round((surfaceUsed / surfaceRoof) * 1000) / 10 : 0;
    const fits = overflowWarnings.length === 0;

    return {
      nPanels, panelsPlaced, surfaceUsed, surfaceRoof, coveragePct, fits,
      rows: totalRows, cols: maxCols, perRoof, overflowWarnings,
    };
  }

  return {
    computeLayout, render, renderMulti,
    buildSceneItems, drawObstacleBox, drawRoofScene, drawCompass,
    projectRaw, makeProjector, unprojectGround,
    SCENE_GAP: 1.5,
  };
})();

if (typeof window !== 'undefined') window.PanelLayout3D = PanelLayout3D;
if (typeof module !== 'undefined' && module.exports) module.exports = PanelLayout3D;

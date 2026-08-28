/**
 * scene_3d.js — Éditeur 3D simple : toitures + panneaux + obstacles (Canvas isométrique).
 * Dépend de : panel_3d.js, layout_roofs.js, site_survey.js (optionnel)
 */
const Scene3D = (() => {
  const PRESETS = {
    chimney: { type: 'box', w: 0.6, d: 0.6, h: 1.5, label: 'Cheminée' },
    tree:    { type: 'tree', w: 1.2, d: 1.2, h: 4, label: 'Arbre' },
    wall:    { type: 'box', w: 2, d: 0.35, h: 2.5, label: 'Mur' },
    velux:   { type: 'box', w: 1.2, d: 0.8, h: 0.4, label: 'Velux' },
  };

  let _canvas = null;
  let _mode = 'select';
  let _selectedObstacle = -1;
  let _drag = null;
  let _lastView = null;

  function roofsFromLayout() {
    if (typeof LayoutRoofs !== 'undefined') {
      LayoutRoofs.saveActiveFromForm?.();
      return LayoutRoofs.getRoofs().map(r => ({ ...r, id: r.id, name: r.name }));
    }
    return [{ id: 'roof-1', name: 'Toiture 1', roofW: 8, roofD: 6, panelW: 1.13, panelH: 1.76, nPanels: 12, rows: 2, tilt: 30, azimuth: 0 }];
  }

  function obstaclesFromSite() {
    if (typeof SiteSurvey !== 'undefined' && SiteSurvey.getState) {
      return SiteSurvey.getState().obstacles || [];
    }
    return AppState?.siteSurvey?.obstacles || [];
  }

  function activeRoofId() {
    if (typeof LayoutRoofs !== 'undefined') return LayoutRoofs.getActiveRoof()?.id || null;
    return roofsFromLayout()[0]?.id || null;
  }

  function pickRoofAt(world) {
    const items = _lastView?.items || [];
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const lx = world.x - it.sceneX;
      const ly = world.y - it.sceneY;
      if (lx >= 0 && lx <= it.layout.roofW && ly >= 0 && ly <= it.layout.roofD) {
        return { item: it, localX: lx, localY: ly };
      }
    }
    return null;
  }

  function pickObstacleAt(clientX, clientY) {
    const hits = _lastView?.obstacleHits || [];
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (clientX >= h.minX && clientX <= h.maxX && clientY >= h.minY && clientY <= h.maxY) {
        return h.idx;
      }
    }
    return -1;
  }

  function canvasCoords(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const scaleX = (canvas.width / dpr) / rect.width;
    const scaleY = (canvas.height / dpr) / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function render(canvas, options = {}) {
    if (!canvas || typeof PanelLayout3D === 'undefined') return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const roofs = options.roofs || roofsFromLayout();
    const obstacles = options.obstacles || obstaclesFromSite();
    const selectedRoofId = options.selectedRoofId ?? activeRoofId();
    const selectedObstacle = options.selectedObstacle ?? _selectedObstacle;
    const items = PanelLayout3D.buildSceneItems(roofs, PanelLayout3D.SCENE_GAP);

    const rawPts = [];
    items.forEach(({ layout, sceneX: sx }) => {
      const { roofW, roofD, nPanels, arrayW, arrayD, riseZ } = layout;
      const offX = sx + (roofW - arrayW) / 2;
      const offY = (roofD - arrayD) / 2;
      rawPts.push(
        PanelLayout3D.projectRaw(sx, 0, 0), PanelLayout3D.projectRaw(sx + roofW, 0, 0),
        PanelLayout3D.projectRaw(sx + roofW, roofD, 0), PanelLayout3D.projectRaw(sx, roofD, 0),
      );
      if (nPanels > 0) {
        rawPts.push(
          PanelLayout3D.projectRaw(offX, offY + arrayD, 0),
          PanelLayout3D.projectRaw(offX + arrayW, offY + arrayD, 0),
          PanelLayout3D.projectRaw(offX, offY, riseZ),
          PanelLayout3D.projectRaw(offX + arrayW, offY, riseZ),
        );
      }
    });
    obstacles.forEach(o => {
      const it = items.find(i => !o.roofId || i.id === o.roofId) || items[0];
      if (!it) return;
      const bx = it.sceneX + (o.x || 0);
      const by = (o.y || 0);
      const h = o.h || 1;
      rawPts.push(
        PanelLayout3D.projectRaw(bx, by, h),
        PanelLayout3D.projectRaw(bx + (o.w || 0.5), by + (o.d || 0.5), h),
      );
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
    ctx.fillStyle = '#e8efe9';
    ctx.fillRect(0, 0, cssW, cssH);

    const xs = rawPts.map(p => p[0]);
    const ys = rawPts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const margin = 52;
    const labelMargin = items.length > 1 ? 20 : 8;
    const availW = Math.max(20, cssW - margin * 2);
    const availH = Math.max(20, cssH - margin * 2 - labelMargin);
    const spanX = Math.max(0.5, maxX - minX);
    const spanY = Math.max(0.5, maxY - minY);
    const scale = Math.min(availW / spanX, availH / spanY);
    const origin = {
      x: margin + (availW - spanX * scale) / 2 - minX * scale,
      y: margin + labelMargin + (availH - spanY * scale) / 2 - minY * scale,
    };
    const project = PanelLayout3D.makeProjector(origin, scale);

    const obstacleHits = [];
    items.forEach(item => {
      const hi = item.id === selectedRoofId;
      PanelLayout3D.drawRoofScene(ctx, project, item.layout, item.sceneX, item.sceneY, hi);
    });

    obstacles.forEach((o, idx) => {
      const it = items.find(i => !o.roofId || i.id === o.roofId) || items[0];
      if (!it) return;
      const sel = idx === selectedObstacle;
      const bb = PanelLayout3D.drawObstacleBox(ctx, project, it.sceneX, it.sceneY, o, sel);
      obstacleHits.push({ idx, roofId: it.id, ...bb });
    });

    if (items.length) {
      ctx.save();
      ctx.font = '600 11px sans-serif';
      ctx.fillStyle = '#1a2e23';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      items.forEach(item => {
        const [lx, ly] = project(item.sceneX + item.layout.roofW / 2, 0, 0);
        const tag = item.id === selectedRoofId ? `▸ ${item.name}` : item.name;
        ctx.fillText(tag, lx, ly - 8);
        ctx.font = '400 9px sans-serif';
        ctx.fillStyle = '#5a6a60';
        ctx.fillText(`${item.layout.tilt}° · az ${item.layout.azimuth > 0 ? '+' : ''}${item.layout.azimuth}°`, lx, ly + 4);
        ctx.font = '600 11px sans-serif';
        ctx.fillStyle = '#1a2e23';
      });
      ctx.restore();
    }

    const compassAz = items.find(i => i.id === selectedRoofId)?.layout.azimuth
      ?? items[0]?.layout.azimuth ?? 0;
    PanelLayout3D.drawCompass(ctx, cssW - 44, 44, 30, compassAz);

    ctx.save();
    ctx.font = '400 10px sans-serif';
    ctx.fillStyle = '#5a6a60';
    ctx.textAlign = 'left';
    ctx.fillText('Clic = sélection · Glisser = déplacer obstacle · Outils = placer', margin, cssH - 10);
    ctx.restore();

    _lastView = { items, origin, scale, obstacleHits, cssW, cssH };
    return _lastView;
  }

  function setMode(mode) {
    _mode = mode || 'select';
    document.querySelectorAll('[data-scene-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sceneMode === _mode);
    });
    if (_canvas) _canvas.style.cursor = _mode === 'move' ? 'grab' : 'crosshair';
  }

  function syncObstacle(idx, patch, opts = {}) {
    if (typeof SiteSurvey === 'undefined' || !SiteSurvey.getState) return;
    const obs = SiteSurvey.getState().obstacles;
    if (idx < 0 || idx >= obs.length) return;
    Object.assign(obs[idx], patch);
    SiteSurvey.persist?.();
    if (opts.recompute) {
      SiteSurvey.renderObstaclesList?.();
      SiteSurvey.recompute?.();
    }
  }

  function addObstacleAt(roofId, localX, localY, presetKey) {
    const preset = PRESETS[presetKey] || PRESETS.chimney;
    const it = _lastView?.items?.find(i => i.id === roofId);
    if (!it) return;
    const w = preset.w;
    const d = preset.d;
    let x = localX - w / 2;
    let y = localY - d / 2;
    x = Math.max(0, Math.min(it.layout.roofW - w, x));
    y = Math.max(0, Math.min(it.layout.roofD - d, y));
    const label = `${preset.label} ${(obstaclesFromSite().filter(o => o.roofId === roofId).length + 1)}`;
    if (typeof SiteSurvey !== 'undefined' && SiteSurvey.addObstacle) {
      SiteSurvey.addObstacle({
        type: preset.type,
        roofId,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        w, d, h: preset.h,
        label,
      });
    }
    refresh();
  }

  function refresh() {
    if (!_canvas) return;
    render(_canvas, { selectedObstacle: _selectedObstacle, selectedRoofId: activeRoofId() });
  }

  function onPointerDown(e) {
    if (!_canvas || !_lastView) return;
    e.preventDefault();
    const pt = canvasCoords(_canvas, e.clientX, e.clientY);
    const world = PanelLayout3D.unprojectGround(pt.x, pt.y, _lastView.origin, _lastView.scale);

    const obsIdx = pickObstacleAt(pt.x, pt.y);
    if (_mode === 'move' || (_mode === 'select' && obsIdx >= 0)) {
      if (obsIdx >= 0) {
        _selectedObstacle = obsIdx;
        _drag = { idx: obsIdx, startWorld: world, startObs: { ...obstaclesFromSite()[obsIdx] } };
        _canvas.style.cursor = 'grabbing';
        refresh();
        return;
      }
    }

    if (_mode === 'select' && obsIdx < 0) {
      _selectedObstacle = -1;
    }

    const hit = pickRoofAt(world);
    if (!hit) return;

    if (typeof LayoutRoofs !== 'undefined') LayoutRoofs.setActive(hit.item.id);

    if (_mode.startsWith('place-')) {
      const key = _mode.replace('place-', '');
      addObstacleAt(hit.item.id, hit.localX, hit.localY, key);
      return;
    }

    refresh();
  }

  function onPointerMove(e) {
    if (!_drag || !_canvas || !_lastView) return;
    e.preventDefault();
    const pt = canvasCoords(_canvas, e.clientX, e.clientY);
    const world = PanelLayout3D.unprojectGround(pt.x, pt.y, _lastView.origin, _lastView.scale);
    const obs = _drag.startObs;
    const it = _lastView.items.find(i => !obs.roofId || i.id === obs.roofId) || _lastView.items[0];
    if (!it) return;
    const dx = world.x - _drag.startWorld.x;
    const dy = world.y - _drag.startWorld.y;
    let nx = _drag.startObs.x + dx;
    let ny = _drag.startObs.y + dy;
    nx = Math.max(0, Math.min(it.layout.roofW - (obs.w || 0.5), nx));
    ny = Math.max(0, Math.min(it.layout.roofD - (obs.d || 0.5), ny));
    syncObstacle(_drag.idx, {
      x: Math.round(nx * 100) / 100,
      y: Math.round(ny * 100) / 100,
    });
    refresh();
  }

  function onPointerUp() {
    if (_drag && typeof SiteSurvey !== 'undefined') {
      SiteSurvey.renderObstaclesList?.();
      SiteSurvey.recompute?.();
    }
    _drag = null;
    if (_canvas) _canvas.style.cursor = _mode === 'move' ? 'grab' : 'crosshair';
  }

  function deleteSelected() {
    if (_selectedObstacle < 0) return;
    if (typeof SiteSurvey !== 'undefined' && SiteSurvey.removeObstacle) {
      SiteSurvey.removeObstacle(_selectedObstacle);
      _selectedObstacle = -1;
      refresh();
    }
  }

  function attach(canvas) {
    if (!canvas) return;
    if (_canvas && _canvas !== canvas) detach(_canvas);
    else if (_canvas === canvas) detach(canvas);
    _canvas = canvas;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    setMode('select');
    refresh();
  }

  function detach(canvas) {
    if (!canvas) return;
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    if (_canvas === canvas) _canvas = null;
  }

  return {
    PRESETS,
    render,
    refresh,
    attach,
    detach,
    setMode,
    deleteSelected,
    getMode: () => _mode,
  };
})();

if (typeof window !== 'undefined') window.Scene3D = Scene3D;

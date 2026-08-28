/**
 * scene_3d.js — Façade éditeur 3D : WebGL (Three.js) si dispo, sinon canvas isométrique 2D.
 */
const Scene3D = (() => {
  const PRESETS = typeof RoofModel3D !== 'undefined' ? RoofModel3D.PRESETS : {
    chimney: { type: 'box', w: 0.6, d: 0.6, h: 1.5, label: 'Cheminée' },
    tree:    { type: 'tree', w: 1.2, d: 1.2, h: 4, label: 'Arbre' },
    wall:    { type: 'box', w: 2, d: 0.35, h: 2.5, label: 'Mur' },
    velux:   { type: 'box', w: 1.2, d: 0.8, h: 0.4, label: 'Velux' },
  };

  let _useWebGL = false;
  let _legacyCanvas = null;
  let _mode = 'select';
  let _selectedObstacle = -1;
  let _drag = null;
  let _lastView = null;

  function useWebGL() {
    return typeof RoofModel3D !== 'undefined' && RoofModel3D.isReady();
  }

  function attach(el) {
    if (!el) return;
    if (useWebGL()) {
      _useWebGL = true;
      _legacyCanvas = null;
      const host = el.id === 'site-scene-3d-canvas' ? el.parentElement : el;
      if (el.tagName === 'CANVAS') {
        el.style.display = 'none';
      }
      RoofModel3D.attach(host, { showObstacles: true });
      setMode('select');
      return;
    }
    _useWebGL = false;
    _legacyCanvas = el.tagName === 'CANVAS' ? el : el.querySelector('canvas');
    if (!_legacyCanvas) return;
    _legacyCanvas.style.display = 'block';
    _legacyAttachLegacy(_legacyCanvas);
  }

  function refresh() {
    if (_useWebGL && typeof RoofModel3D !== 'undefined') {
      RoofModel3D.refresh();
      return;
    }
    if (_legacyCanvas) _legacyRender(_legacyCanvas);
  }

  function setMode(mode) {
    _mode = mode || 'select';
    document.querySelectorAll('[data-scene-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sceneMode === _mode);
    });
    if (_useWebGL && typeof RoofModel3D !== 'undefined') {
      RoofModel3D.setMode(_mode);
      return;
    }
    if (_legacyCanvas) _legacyCanvas.style.cursor = _mode === 'move' ? 'grab' : 'crosshair';
  }

  function setView(preset) {
    if (_useWebGL && typeof RoofModel3D !== 'undefined') {
      RoofModel3D.setView(preset);
    }
  }

  function deleteSelected() {
    if (_useWebGL && typeof RoofModel3D !== 'undefined') {
      RoofModel3D.deleteSelected();
      return;
    }
    _legacyDeleteSelected();
  }

  function detach(el) {
    if (_useWebGL && typeof RoofModel3D !== 'undefined') RoofModel3D.detach();
    _useWebGL = false;
    if (_legacyCanvas) _legacyDetach(_legacyCanvas);
  }

  /* ── Legacy 2D (repli sans WebGL) ── */
  function roofsFromLayout() {
    if (typeof LayoutRoofs !== 'undefined') {
      LayoutRoofs.saveActiveFromForm?.();
      return LayoutRoofs.getRoofs().map(r => ({ ...r, id: r.id, name: r.name }));
    }
    return [{ id: 'roof-1', name: 'Toiture 1', roofW: 8, roofD: 6, panelW: 1.13, panelH: 1.76, nPanels: 12, rows: 2, tilt: 30, azimuth: 0 }];
  }

  function obstaclesFromSite() {
    if (typeof SiteSurvey !== 'undefined' && SiteSurvey.getState) return SiteSurvey.getState().obstacles || [];
    return AppState?.siteSurvey?.obstacles || [];
  }

  function activeRoofId() {
    if (typeof LayoutRoofs !== 'undefined') return LayoutRoofs.getActiveRoof()?.id || null;
    return roofsFromLayout()[0]?.id || null;
  }

  function _legacyRender(canvas) {
    if (!canvas || typeof PanelLayout3D === 'undefined') return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const roofs = roofsFromLayout();
    const obstacles = obstaclesFromSite();
    const selectedRoofId = activeRoofId();
    const items = PanelLayout3D.buildSceneItems(roofs, PanelLayout3D.SCENE_GAP);
    const rawPts = [];
    items.forEach(({ layout, sceneX: sx }) => {
      const { roofW, roofD, nPanels, arrayW, arrayD, riseZ } = layout;
      const offX = sx + (roofW - arrayW) / 2;
      const offY = (roofD - arrayD) / 2;
      rawPts.push(PanelLayout3D.projectRaw(sx, 0, 0), PanelLayout3D.projectRaw(sx + roofW, 0, 0));
      if (nPanels > 0) rawPts.push(PanelLayout3D.projectRaw(offX, offY, riseZ));
    });
    const cssW = Math.max(1, canvas.clientWidth || 600);
    const cssH = Math.max(1, canvas.clientHeight || 360);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#e8efe9';
    ctx.fillRect(0, 0, cssW, cssH);
    const xs = rawPts.map(p => p[0]);
    const ys = rawPts.map(p => p[1]);
    const margin = 52;
    const scale = Math.min((cssW - margin * 2) / Math.max(0.5, Math.max(...xs) - Math.min(...xs)),
      (cssH - margin * 2) / Math.max(0.5, Math.max(...ys) - Math.min(...ys)));
    const origin = { x: margin, y: margin };
    const project = PanelLayout3D.makeProjector(origin, scale);
    const obstacleHits = [];
    items.forEach(item => {
      PanelLayout3D.drawRoofScene(ctx, project, item.layout, item.sceneX, item.sceneY, item.id === selectedRoofId);
    });
    obstacles.forEach((o, idx) => {
      const it = items.find(i => !o.roofId || i.id === o.roofId) || items[0];
      if (!it) return;
      const bb = PanelLayout3D.drawObstacleBox(ctx, project, it.sceneX, it.sceneY, o, idx === _selectedObstacle);
      obstacleHits.push({ idx, ...bb });
    });
    _lastView = { items, origin, scale, obstacleHits, cssW, cssH };
    return _lastView;
  }

  function _legacyAttachLegacy(canvas) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', _legacyOnDown);
    canvas.addEventListener('pointermove', _legacyOnMove);
    canvas.addEventListener('pointerup', _legacyOnUp);
    setMode('select');
    _legacyRender(canvas);
  }

  function _legacyDetach(canvas) {
    canvas.removeEventListener('pointerdown', _legacyOnDown);
    canvas.removeEventListener('pointermove', _legacyOnMove);
    canvas.removeEventListener('pointerup', _legacyOnUp);
  }

  function _legacyOnDown(e) {
    if (!_lastView || !PanelLayout3D) return;
    e.preventDefault();
    const pt = _legacyCanvasCoords(_legacyCanvas, e.clientX, e.clientY);
    const obsIdx = _legacyPickObs(pt.x, pt.y);
    if (_mode === 'move' || (_mode === 'select' && obsIdx >= 0)) {
      if (obsIdx >= 0) {
        _selectedObstacle = obsIdx;
        _drag = { idx: obsIdx };
        _legacyRender(_legacyCanvas);
        return;
      }
    }
    const world = PanelLayout3D.unprojectGround(pt.x, pt.y, _lastView.origin, _lastView.scale);
    const hit = _legacyPickRoof(world);
    if (!hit) return;
    if (typeof LayoutRoofs !== 'undefined') LayoutRoofs.setActive(hit.item.id);
    if (_mode.startsWith('place-')) {
      _legacyAddObs(hit.item.id, hit.localX, hit.localY, _mode.replace('place-', ''));
    } else {
      _selectedObstacle = -1;
      _legacyRender(_legacyCanvas);
    }
  }

  function _legacyOnMove(e) {
    if (!_drag || !_lastView) return;
    e.preventDefault();
    const pt = _legacyCanvasCoords(_legacyCanvas, e.clientX, e.clientY);
    const world = PanelLayout3D.unprojectGround(pt.x, pt.y, _lastView.origin, _lastView.scale);
    const obs = obstaclesFromSite()[_drag.idx];
    const it = _lastView.items.find(i => !obs.roofId || i.id === obs.roofId) || _lastView.items[0];
    if (!obs || !it) return;
    const lx = world.x - it.sceneX;
    const ly = world.y;
    let nx = lx - (obs.w || 0.5) / 2;
    let ny = ly - (obs.d || 0.5) / 2;
    nx = Math.max(0, Math.min(it.layout.roofW - (obs.w || 0.5), nx));
    ny = Math.max(0, Math.min(it.layout.roofD - (obs.d || 0.5), ny));
    if (typeof SiteSurvey !== 'undefined' && SiteSurvey.getState) {
      Object.assign(SiteSurvey.getState().obstacles[_drag.idx], { x: Math.round(nx * 100) / 100, y: Math.round(ny * 100) / 100 });
      SiteSurvey.persist?.();
    }
    _legacyRender(_legacyCanvas);
  }

  function _legacyOnUp() {
    if (_drag && typeof SiteSurvey !== 'undefined') {
      SiteSurvey.renderObstaclesList?.();
      SiteSurvey.recompute?.();
    }
    _drag = null;
  }

  function _legacyDeleteSelected() {
    if (_selectedObstacle < 0) return;
    if (typeof SiteSurvey !== 'undefined') SiteSurvey.removeObstacle(_selectedObstacle);
    _selectedObstacle = -1;
    _legacyRender(_legacyCanvas);
  }

  function _legacyCanvasCoords(canvas, cx, cy) {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return { x: (cx - r.left) * (canvas.width / dpr / r.width), y: (cy - r.top) * (canvas.height / dpr / r.height) };
  }

  function _legacyPickObs(x, y) {
    const hits = _lastView?.obstacleHits || [];
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (x >= h.minX && x <= h.maxX && y >= h.minY && y <= h.maxY) return h.idx;
    }
    return -1;
  }

  function _legacyPickRoof(world) {
    for (let i = (_lastView?.items?.length || 0) - 1; i >= 0; i--) {
      const it = _lastView.items[i];
      const lx = world.x - it.sceneX;
      const ly = world.y;
      if (lx >= 0 && lx <= it.layout.roofW && ly >= 0 && ly <= it.layout.roofD) {
        return { item: it, localX: lx, localY: ly };
      }
    }
    return null;
  }

  function _legacyAddObs(roofId, lx, ly, key) {
    const preset = PRESETS[key] || PRESETS.chimney;
    if (typeof SiteSurvey !== 'undefined' && SiteSurvey.addObstacle) {
      SiteSurvey.addObstacle({
        type: preset.type, roofId, x: lx - preset.w / 2, y: ly - preset.d / 2,
        w: preset.w, d: preset.d, h: preset.h, label: preset.label,
      });
    }
    _legacyRender(_legacyCanvas);
  }

  return {
    PRESETS,
    attach,
    detach,
    refresh,
    setMode,
    setView,
    deleteSelected,
    getMode: () => _mode,
    isWebGL: () => _useWebGL,
  };
})();

if (typeof window !== 'undefined') window.Scene3D = Scene3D;

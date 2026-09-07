/**
 * roof_model_3d.js — Modélisation 3D WebGL (Three.js) : toitures inclinées, panneaux, obstacles.
 * Dépend de : vendor/three.min.js, panel_3d.js, layout_roofs.js
 */
const RoofModel3D = (() => {
  const DEG = Math.PI / 180;
  const PRESETS = {
    chimney: { type: 'box', w: 0.6, d: 0.6, h: 1.5, label: 'Cheminée', color: 0x8a7355 },
    tree:    { type: 'tree', w: 1.2, d: 1.2, h: 4, label: 'Arbre', color: 0x3d8a4a },
    wall:    { type: 'box', w: 2, d: 0.35, h: 2.5, label: 'Mur', color: 0x6a6a72 },
    velux:   { type: 'box', w: 1.2, d: 0.8, h: 0.4, label: 'Velux', color: 0x4a7ab8 },
  };

  let _host = null;
  let _renderer = null;
  let _scene = null;
  let _camera = null;
  let _raycaster = null;
  let _pointer = null;
  let _root = null;
  let _animId = null;
  let _mode = 'select';
  let _showObstacles = true;
  let _selectedObstacle = -1;
  let _drag = null;
  let _orbit = null;
  let _meshes = { roofs: new Map(), obstacles: [] };
  let _framed = false;

  function isReady() {
    return typeof THREE !== 'undefined';
  }

  function saveLayout() {
    if (typeof LayoutRoofs !== 'undefined') LayoutRoofs.saveActiveFromForm?.();
  }

  function roofsData() {
    saveLayout();
    if (typeof LayoutRoofs !== 'undefined') return LayoutRoofs.getRoofs();
    return [{ id: 'r1', name: 'Toiture 1', roofW: 8, roofD: 6, panelW: 1.13, panelH: 1.76, nPanels: 12, rows: 2, tilt: 30, azimuth: 0 }];
  }

  function obstaclesData() {
    if (typeof SiteSurvey !== 'undefined' && SiteSurvey.getState) return SiteSurvey.getState().obstacles || [];
    return AppState?.siteSurvey?.obstacles || [];
  }

  function activeRoofId() {
    return typeof LayoutRoofs !== 'undefined' ? LayoutRoofs.getActiveRoof()?.id : null;
  }

  /** Contrôles orbite légers (sans module ES). */
  function createOrbit(camera, dom) {
    const state = {
      target: new THREE.Vector3(4, 2, 0),
      radius: 22,
      phi: 0.85,
      theta: 0.6,
      dragging: false,
      panning: false,
      lastX: 0,
      lastY: 0,
    };
    function apply() {
      const { radius, phi, theta, target } = state;
      const x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      const y = target.y + radius * Math.cos(phi);
      const z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.position.set(x, y, z);
      camera.lookAt(target);
    }
    apply();
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      state.radius = Math.max(6, Math.min(80, state.radius + e.deltaY * 0.04));
      apply();
    }, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    return {
      state,
      apply,
      onPointerDown(x, y, btn) {
        state.lastX = x;
        state.lastY = y;
        state.dragging = btn === 0;
        state.panning = btn === 2 || btn === 1;
      },
      onPointerMove(x, y) {
        if (!state.dragging && !state.panning) return;
        const dx = x - state.lastX;
        const dy = y - state.lastY;
        state.lastX = x;
        state.lastY = y;
        if (state.dragging) {
          state.theta -= dx * 0.008;
          state.phi = Math.max(0.25, Math.min(1.45, state.phi + dy * 0.008));
        } else if (state.panning) {
          const pan = new THREE.Vector3();
          const dir = new THREE.Vector3();
          camera.getWorldDirection(dir);
          const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
          pan.copy(right).multiplyScalar(-dx * 0.02).add(new THREE.Vector3(0, 1, 0).multiplyScalar(dy * 0.02));
          state.target.add(pan);
        }
        apply();
      },
      onPointerUp() {
        state.dragging = false;
        state.panning = false;
      },
      setView(preset) {
        if (preset === 'top') { state.phi = 0.2; state.theta = 0; }
        else if (preset === 'south') { state.phi = 1.05; state.theta = Math.PI; }
        else { state.phi = 0.85; state.theta = 0.6; }
        apply();
      },
      frameBox(box) {
        if (!box || box.isEmpty()) return;
        const c = box.getCenter(new THREE.Vector3());
        const s = box.getSize(new THREE.Vector3());
        state.target.copy(c);
        state.radius = Math.max(12, Math.max(s.x, s.y, s.z) * 2.2);
        apply();
      },
    };
  }

  function roofWorldX(index, roofs) {
    let x = 0;
    const gap = 2;
    for (let i = 0; i < index; i++) x += (roofs[i].roofW || 8) + gap;
    return x + (roofs[index].roofW || 8) / 2;
  }

  function buildRoofGroup(roof, index, roofs, activeId) {
    const group = new THREE.Group();
    group.userData = { type: 'roof', roofId: roof.id, roofIndex: index };
    const worldX = roofWorldX(index, roofs);
    group.position.set(worldX, 0, 0);

    const oriented = new THREE.Group();
    oriented.rotation.y = -(roof.azimuth ?? 0) * DEG;
    oriented.rotation.x = -(roof.tilt ?? 30) * DEG;
    group.add(oriented);
    group.userData.oriented = oriented;

    const rw = roof.roofW || 8;
    const rd = roof.roofD || 6;
    const isActive = roof.id === activeId;
    const deckMat = new THREE.MeshStandardMaterial({
      color: isActive ? 0xd4c4a8 : 0xcdbb9e,
      roughness: 0.85,
      metalness: 0.05,
    });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.14, rd), deckMat);
    deck.position.y = 0.07;
    deck.userData = { type: 'roofHit', roofId: roof.id };
    oriented.add(deck);

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(rw, 0.14, rd)),
      new THREE.LineBasicMaterial({ color: isActive ? 0xf5a623 : 0x5a4a3a })
    );
    edge.position.copy(deck.position);
    oriented.add(edge);

    if (typeof PanelLayout3D !== 'undefined' && PanelLayout3D.computeLayout) {
      const layout = PanelLayout3D.computeLayout({
        roofW: rw, roofD: rd,
        panelW: roof.panelW, panelH: roof.panelH,
        nPanels: roof.nPanels, rows: roof.rows,
        gap: roof.gap ?? 0.02,
        tilt: roof.tilt, azimuth: roof.azimuth,
      });
      if (layout.nPanels > 0 && layout.cols > 0) {
        const { cols, panelW, footprintH, gap, rows, riseZ } = layout;
        const arrayW = cols * panelW + (cols - 1) * gap;
        const arrayD = rows * footprintH + (rows - 1) * gap;
        const offX = -arrayW / 2;
        const offZ = -arrayD / 2;
        const panelMat = new THREE.MeshStandardMaterial({ color: 0x1e4a7a, roughness: 0.35, metalness: 0.4 });
        let placed = 0;
        for (let r = 0; r < rows && placed < layout.nPanels; r++) {
          for (let c = 0; c < cols && placed < layout.nPanels; c++, placed++) {
            const px = offX + c * (panelW + gap) + panelW / 2;
            const pz = offZ + r * (footprintH + gap) + footprintH / 2;
            const pm = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.04, footprintH), panelMat);
            pm.position.set(px, 0.14 + riseZ * 0.5, pz);
            oriented.add(pm);
            const back = new THREE.Mesh(
              new THREE.BoxGeometry(panelW, riseZ, 0.03),
              new THREE.MeshStandardMaterial({ color: 0x123a63, roughness: 0.5 })
            );
            back.position.set(px, 0.14 + riseZ / 2, pz - footprintH / 2 + 0.015);
            oriented.add(back);
          }
        }
      }
    }

    const label = makeLabel(roof.name || `Toiture ${index + 1}`, isActive);
    label.position.set(0, 2.5, 0);
    group.add(label);

    return group;
  }

  function makeLabel(text, active) {
    const cvs = document.createElement('canvas');
    cvs.width = 256;
    cvs.height = 64;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = active ? 'rgba(245,166,35,0.9)' : 'rgba(255,255,255,0.85)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#1a2e23';
    ctx.font = '600 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.slice(0, 18), 128, 32);
    const tex = new THREE.CanvasTexture(cvs);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(3.5, 0.9, 1);
    return sp;
  }

  function addObstacleMesh(obs, idx, roofGroup, roof) {
    const oriented = roofGroup.userData.oriented;
    if (!oriented) return null;
    const w = obs.w || 0.5;
    const d = obs.d || 0.5;
    const h = obs.h || 1;
    const rw = roof.roofW || 8;
    const rd = roof.roofD || 6;
    const preset = PRESETS[obs.type] || PRESETS.chimney;
    const color = preset.color || 0x888888;
    const sel = idx === _selectedObstacle;
    const mat = new THREE.MeshStandardMaterial({
      color: sel ? 0xf5a623 : color,
      roughness: 0.7,
      emissive: sel ? 0x332200 : 0x000000,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(
      (obs.x || 0) + w / 2 - rw / 2,
      0.14 + h / 2,
      (obs.y || 0) + d / 2 - rd / 2,
    );
    mesh.userData = { type: 'obstacle', idx, roofId: roof.id };
    oriented.add(mesh);
    if (obs.type === 'tree') {
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(w, d) * 0.55, h * 0.45, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a9a55, roughness: 0.8 })
      );
      crown.position.set(mesh.position.x, mesh.position.y + h * 0.35, mesh.position.z);
      crown.userData = mesh.userData;
      oriented.add(crown);
    }
    return mesh;
  }

  function rebuild() {
    if (!_scene || !_root) return;
    while (_root.children.length) {
      const ch = _root.children[0];
      _root.remove(ch);
      ch.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
    }
    _meshes.roofs.clear();
    _meshes.obstacles = [];

    const roofs = roofsData();
    const activeId = activeRoofId();
    roofs.forEach((roof, i) => {
      const g = buildRoofGroup(roof, i, roofs, activeId);
      _root.add(g);
      _meshes.roofs.set(roof.id, g);
    });

    if (_showObstacles) {
      const obstacles = obstaclesData();
      obstacles.forEach((obs, idx) => {
        const rid = obs.roofId || roofs[0]?.id;
        const rg = _meshes.roofs.get(rid);
        const roof = roofs.find(r => r.id === rid) || roofs[0];
        if (!rg || !roof) return;
        const m = addObstacleMesh(obs, idx, rg, roof);
        if (m) _meshes.obstacles.push(m);
      });
    }

    const box = new THREE.Box3().setFromObject(_root);
    if (_orbit && !box.isEmpty() && !_framed) {
      _orbit.frameBox(box);
      _framed = true;
    }
  }

  function pointerNDC(host, clientX, clientY) {
    const r = host.getBoundingClientRect();
    _pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
    _pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
  }

  function raycastMeshes(filter) {
    _raycaster.setFromCamera(_pointer, _camera);
    const hits = _raycaster.intersectObjects(_root.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o) {
        if (filter(o)) return { object: o, point: h.point, hit: h };
        o = o.parent;
      }
    }
    return null;
  }

  function worldToRoofPlan(point, roofGroup, roof) {
    const oriented = roofGroup.userData.oriented;
    const local = oriented.worldToLocal(point.clone());
    const rw = roof.roofW || 8;
    const rd = roof.roofD || 6;
    return { x: local.x + rw / 2, y: local.z + rd / 2 };
  }

  function syncObstacle(idx, patch, recompute) {
    if (typeof SiteSurvey === 'undefined' || !SiteSurvey.getState) return;
    const obs = SiteSurvey.getState().obstacles;
    if (idx < 0 || idx >= obs.length) return;
    Object.assign(obs[idx], patch);
    SiteSurvey.persist?.();
    if (recompute) {
      SiteSurvey.renderObstaclesList?.();
      SiteSurvey.recompute?.();
    }
  }

  function addObstacleAt(roofId, lx, ly, presetKey) {
    const preset = PRESETS[presetKey] || PRESETS.chimney;
    const roof = roofsData().find(r => r.id === roofId);
    if (!roof) return;
    const w = preset.w;
    const d = preset.d;
    let x = lx - w / 2;
    let y = ly - d / 2;
    x = Math.max(0, Math.min((roof.roofW || 8) - w, x));
    y = Math.max(0, Math.min((roof.roofD || 6) - d, y));
    const n = obstaclesData().filter(o => o.roofId === roofId).length + 1;
    if (typeof SiteSurvey !== 'undefined' && SiteSurvey.addObstacle) {
      SiteSurvey.addObstacle({
        type: preset.type,
        roofId,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        w, d, h: preset.h,
        label: `${preset.label} ${n}`,
      });
    }
    refresh();
  }

  function onPointerDown(e) {
    if (!_host || !_camera) return;
    if (e.button === 0 && (_mode === 'select' || _mode === 'move' || _mode.startsWith('place-'))) {
      /* left: scene edit */
    } else {
      _orbit?.onPointerDown(e.clientX, e.clientY, e.button);
      return;
    }
    e.preventDefault();
    pointerNDC(_host, e.clientX, e.clientY);

    const obsHit = raycastMeshes(o => o.userData?.type === 'obstacle');
    if (obsHit && (_mode === 'move' || _mode === 'select')) {
      _selectedObstacle = obsHit.object.userData.idx;
      _drag = { idx: _selectedObstacle, roofId: obsHit.object.userData.roofId };
      _host.style.cursor = 'grabbing';
      rebuild();
      return;
    }

    const roofHit = raycastMeshes(o => o.userData?.type === 'roofHit' || o.userData?.type === 'roof');
    if (roofHit) {
      const roofId = roofHit.object.userData.roofId;
      if (typeof LayoutRoofs !== 'undefined') LayoutRoofs.setActive(roofId);
      if (_mode.startsWith('place-')) {
        const roof = roofsData().find(r => r.id === roofId);
        const rg = _meshes.roofs.get(roofId);
        if (roof && rg) {
          const plan = worldToRoofPlan(roofHit.point, rg, roof);
          addObstacleAt(roofId, plan.x, plan.y, _mode.replace('place-', ''));
        }
        return;
      }
      _selectedObstacle = -1;
      refresh();
      return;
    }
    _orbit?.onPointerDown(e.clientX, e.clientY, e.button);
  }

  function onPointerMove(e) {
    if (_drag && _host) {
      e.preventDefault();
      pointerNDC(_host, e.clientX, e.clientY);
      const rg = _meshes.roofs.get(_drag.roofId);
      const roof = roofsData().find(r => r.id === _drag.roofId);
      const obs = obstaclesData()[_drag.idx];
      if (!rg || !roof || !obs) return;
      const hit = raycastMeshes(o => o.userData?.roofId === _drag.roofId);
      if (!hit) return;
      const plan = worldToRoofPlan(hit.point, rg, roof);
      let x = plan.x - (obs.w || 0.5) / 2;
      let y = plan.y - (obs.d || 0.5) / 2;
      x = Math.max(0, Math.min((roof.roofW || 8) - (obs.w || 0.5), x));
      y = Math.max(0, Math.min((roof.roofD || 6) - (obs.d || 0.5), y));
      syncObstacle(_drag.idx, { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }, false);
      rebuild();
      return;
    }
    if (_orbit?.state.dragging || _orbit?.state.panning) {
      _orbit.onPointerMove(e.clientX, e.clientY);
    }
  }

  function onPointerUp() {
    if (_drag) {
      syncObstacle(_drag.idx, {}, true);
      _drag = null;
      if (_host) _host.style.cursor = _mode === 'move' ? 'grab' : 'crosshair';
    }
    _orbit?.onPointerUp();
  }

  function loop() {
    _animId = requestAnimationFrame(loop);
    _renderer?.render(_scene, _camera);
  }

  function resize() {
    if (!_host || !_renderer || !_camera) return;
    const w = Math.max(1, _host.clientWidth);
    const h = Math.max(1, _host.clientHeight);
    _renderer.setSize(w, h, false);
    _camera.aspect = w / h;
    _camera.updateProjectionMatrix();
  }

  function attach(hostEl, options = {}) {
    if (!isReady() || !hostEl) return false;
    detach();
    _host = hostEl;
    _framed = false;
    _showObstacles = options.showObstacles !== false;
    _mode = options.mode || 'select';

    hostEl.innerHTML = '';
    hostEl.classList.add('ose-roof-3d-host');

    _renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    _renderer.shadowMap.enabled = true;
    _renderer.setClearColor(0xe8efe9);
    hostEl.appendChild(_renderer.domElement);

    _scene = new THREE.Scene();
    _scene.background = new THREE.Color(0xe8efe9);
    _scene.fog = new THREE.Fog(0xe8efe9, 40, 120);

    _camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    _raycaster = new THREE.Raycaster();
    _pointer = new THREE.Vector2();

    _scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.1);
    sun.position.set(12, 28, 10);
    sun.castShadow = true;
    _scene.add(sun);
    _scene.add(new THREE.HemisphereLight(0xbfdfff, 0x8a7a60, 0.35));

    const grid = new THREE.GridHelper(60, 60, 0xa8b8ac, 0xc8d4cc);
    grid.position.y = -0.01;
    _scene.add(grid);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0xdde8df, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    _scene.add(ground);

    _root = new THREE.Group();
    _scene.add(_root);

    _orbit = createOrbit(_camera, _renderer.domElement);
    _renderer.domElement.style.touchAction = 'none';
    _renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    const ro = new ResizeObserver(() => resize());
    ro.observe(hostEl);
    hostEl._oseRo = ro;

    resize();
    rebuild();
    loop();
    return true;
  }

  function detach() {
    if (_animId) cancelAnimationFrame(_animId);
    _animId = null;
    if (_host?._oseRo) {
      _host._oseRo.disconnect();
      delete _host._oseRo;
    }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    if (_renderer?.domElement) {
      _renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    }
    if (_renderer) {
      _renderer.dispose();
      _renderer.domElement?.remove();
    }
    _host = null;
    _renderer = null;
    _scene = null;
    _orbit = null;
  }

  function refresh() {
    rebuild();
  }

  function setMode(mode) {
    _mode = mode || 'select';
    document.querySelectorAll('[data-scene-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sceneMode === _mode);
    });
    if (_host) _host.style.cursor = _mode === 'move' ? 'grab' : 'crosshair';
  }

  function setView(preset) {
    _orbit?.setView(preset);
  }

  function deleteSelected() {
    if (_selectedObstacle < 0) return;
    if (typeof SiteSurvey !== 'undefined' && SiteSurvey.removeObstacle) {
      SiteSurvey.removeObstacle(_selectedObstacle);
      _selectedObstacle = -1;
      refresh();
    }
  }

  return {
    PRESETS,
    isReady,
    attach,
    detach,
    refresh,
    rebuild,
    setMode,
    setView,
    deleteSelected,
  };
})();

if (typeof window !== 'undefined') window.RoofModel3D = RoofModel3D;

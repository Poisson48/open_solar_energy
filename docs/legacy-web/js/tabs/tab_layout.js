/**
 * tab_layout.js - Onglet "Implantation" : visualiseur 2.5D des panneaux sur toiture
 * Dépend de : panel_3d.js, layout_roofs.js, app_state.js (AppState)
 */

function initTabLayout() {
  document.getElementById('tab-layout').innerHTML = `
    <div class="tab-form-col">

      <!-- Paramètres -->
      <div>
        <div class="card">
          <div class="card-title">Paramètres de l'implantation</div>

          <div class="lay-roof-bar" style="margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px">
              <span id="lay-roof-count" style="font-size:12px;font-weight:600;color:var(--color-text-muted)">1 toiture</span>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button type="button" class="btn btn-outline btn-sm" onclick="LayoutRoofs.addRoof()">+ Ajouter toiture</button>
                <button type="button" class="btn btn-outline btn-sm" id="lay-roof-remove" onclick="LayoutRoofs.removeRoof(LayoutRoofs.getActiveRoof()?.id)" disabled>Supprimer</button>
              </div>
            </div>
            <div id="lay-roof-tabs" class="lay-roof-tabs"></div>
          </div>

          <div class="form-group" style="margin-bottom:10px">
            <label for="lay-roof-name">Nom de la toiture</label>
            <input type="text" id="lay-roof-name" value="Toiture 1" maxlength="40" oninput="renderPanelLayoutTab()">
          </div>

          <div class="form-row" style="gap:8px;margin-bottom:10px">
            <div class="form-group">
              <label for="lay-roof-w">Largeur toiture</label>
              <div class="input-unit">
                <input type="number" id="lay-roof-w" value="8" step="0.1" min="1" oninput="renderPanelLayoutTab()">
                <span class="unit-tag">m</span>
              </div>
            </div>
            <div class="form-group">
              <label for="lay-roof-d">Profondeur toiture</label>
              <div class="input-unit">
                <input type="number" id="lay-roof-d" value="6" step="0.1" min="1" oninput="renderPanelLayoutTab()">
                <span class="unit-tag">m</span>
              </div>
            </div>
          </div>

          <div class="form-row" style="gap:8px;margin-bottom:10px">
            <div class="form-group">
              <label for="lay-panel-w">Largeur panneau</label>
              <div class="input-unit">
                <input type="number" id="lay-panel-w" value="1.13" step="0.01" min="0.2" oninput="renderPanelLayoutTab()">
                <span class="unit-tag">m</span>
              </div>
            </div>
            <div class="form-group">
              <label for="lay-panel-h">Longueur panneau</label>
              <div class="input-unit">
                <input type="number" id="lay-panel-h" value="1.76" step="0.01" min="0.2" oninput="renderPanelLayoutTab()">
                <span class="unit-tag">m</span>
              </div>
            </div>
          </div>

          <div class="form-row" style="gap:8px;margin-bottom:10px">
            <div class="form-group">
              <label for="lay-npanels">Nombre de panneaux</label>
              <input type="number" id="lay-npanels" value="12" step="1" min="0" oninput="renderPanelLayoutTab()">
            </div>
            <div class="form-group">
              <label for="lay-rows">Rangées</label>
              <input type="number" id="lay-rows" value="2" step="1" min="1" oninput="renderPanelLayoutTab()">
            </div>
          </div>

          <div class="form-row" style="gap:8px;margin-bottom:10px">
            <div class="form-group">
              <label for="lay-tilt">Inclinaison</label>
              <div class="input-unit">
                <input type="number" id="lay-tilt" value="30" step="1" min="0" max="90" oninput="renderPanelLayoutTab()">
                <span class="unit-tag">°</span>
              </div>
            </div>
            <div class="form-group">
              <label for="lay-azimuth">Azimut <span style="font-weight:400;color:var(--color-text-muted)">(0°=Sud)</span></label>
              <div class="input-unit">
                <input type="number" id="lay-azimuth" value="0" step="5" min="-180" max="180" oninput="renderPanelLayoutTab()">
                <span class="unit-tag">°</span>
              </div>
            </div>
          </div>

          <hr>

          <div style="display:flex;flex-direction:column;gap:6px">
            <button type="button" class="btn btn-outline" style="width:100%" onclick="syncPanelLayoutFrom('sizing')" title="Reprendre le nombre de panneaux du Dimensionnement">
              ↺ Depuis Dimensionnement
            </button>
            <button type="button" class="btn btn-outline" style="width:100%" onclick="syncPanelLayoutFrom('grid')" title="Reprendre le nombre de panneaux du Système PV">
              ↺ Depuis Système PV
            </button>
            <button type="button" class="btn btn-outline" style="width:100%" onclick="syncPanelLayoutFrom('offgrid')" title="Reprendre le nombre de panneaux du dimensionnement Autonome (hors réseau)">
              ↺ Depuis Autonome
            </button>
            <button type="button" class="btn btn-outline" style="width:100%" onclick="syncLayoutToCableLength()" title="Estimer la longueur de câble DC à partir de cette implantation (rangées, panneaux/rangée)">
              📏 Vers Câbles (longueur DC)
            </button>
            <button type="button" class="btn btn-accent" style="width:100%" onclick="exportPanelLayoutImage()">
              📷 Exporter l'image
            </button>
          </div>
        </div>
      </div>

      <!-- Rendu + légende -->
      <div>
        <div class="card" style="padding:10px">
          <div class="alert alert-info" style="font-size:12px;font-weight:600;margin-bottom:8px">
            Vue <strong>3D</strong> — inclinaison réelle, orbite souris (clic gauche) · zoom molette · pan clic droit.
            Éditez les champs : la scène se met à jour. Obstacles : onglet <strong>Site</strong>.
          </div>
          <div class="ose-scene-toolbar" style="margin-bottom:6px">
            <button type="button" class="ose-scene-tool" onclick="Layout3DView.setView('perspective')">🎥 Perspective</button>
            <button type="button" class="ose-scene-tool" onclick="Layout3DView.setView('top')">⬇ Dessus</button>
            <button type="button" class="ose-scene-tool" onclick="Layout3DView.setView('south')">🧭 Sud</button>
          </div>
          <div id="layout-canvas-wrap" style="position:relative;width:100%;height:420px;border-radius:10px;overflow:hidden;border:1px solid var(--color-border)">
            <div id="layout-3d-host" class="ose-roof-3d-host" style="width:100%;height:100%"></div>
            <canvas id="layout-canvas" style="display:none;width:100%;height:100%"></canvas>
          </div>
          <p style="margin-top:8px;font-size:11px;color:var(--color-text-muted)">
            Clic sur une toiture pour la sélectionner (onglets ci-dessus).
            <a href="#" onclick="switchToTab('site');return false" style="color:var(--color-primary)">Site → Modèle 3D</a> pour cheminées et arbres.
          </p>
        </div>

        <div class="card" style="margin-top:12px">
          <div class="card-title">Légende de l'implantation</div>
          <p id="lay-kpi-subtitle" style="margin:-4px 0 10px;font-size:12px;color:var(--color-text-muted)"></p>
          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-value" id="lay-kpi-panels">-</div>
              <div class="kpi-label">Panneaux placés<br><span class="kpi-unit" id="lay-kpi-grid-dims">-</span></div>
            </div>
            <div class="kpi-card">
              <div class="kpi-value accent" id="lay-kpi-surface">-</div>
              <div class="kpi-label">Surface utilisée<br><span class="kpi-unit">m² de panneaux</span></div>
            </div>
            <div class="kpi-card">
              <div class="kpi-value info" id="lay-kpi-roof">-</div>
              <div class="kpi-label">Surface toiture<br><span class="kpi-unit">m² disponibles</span></div>
            </div>
            <div class="kpi-card">
              <div class="kpi-value" id="lay-kpi-coverage">-</div>
              <div class="kpi-label">Taux de couverture<br><span class="kpi-unit">de la toiture</span></div>
            </div>
            <div class="kpi-card">
              <div class="kpi-value" id="lay-kpi-azimuth">-</div>
              <div class="kpi-label">Orientation (active)<br><span class="kpi-unit" id="lay-kpi-azimuth-deg">-</span></div>
            </div>
          </div>
          <div id="lay-warning" class="alert alert-warning" style="display:none;margin-top:10px">
            ⚠️ Le tableau de panneaux dépasse la surface de toiture disponible — réduisez le nombre de panneaux, augmentez les rangées ou agrandissez la toiture.
          </div>
        </div>
        <div class="ose-journey-nav">
          <button type="button" class="btn btn-outline" onclick="goNextPrimaryTab()">Passer →</button>
          <button type="button" class="btn btn-primary" onclick="goNextPrimaryTab()">Continuer → Câbles</button>
        </div>
      </div>

    </div>`;

  window.addEventListener('resize', () => {
    if (AppState.activeTab === 'layout') renderPanelLayoutTab();
  });

  if (typeof LayoutRoofs !== 'undefined') {
    LayoutRoofs.loadFromAppState();
    LayoutRoofs.renderRoofTabs();
  }
}

/** Lit la configuration courante du formulaire "Implantation". */
function readPanelLayoutConfig() {
  const num = (id, fallback) => {
    const el = document.getElementById(id);
    const n = el ? parseFloat(el.value) : NaN;
    return isFinite(n) ? n : fallback;
  };
  return {
    roofW:   num('lay-roof-w', 8),
    roofD:   num('lay-roof-d', 6),
    panelW:  num('lay-panel-w', 1.13),
    panelH:  num('lay-panel-h', 1.76),
    nPanels: num('lay-npanels', 12),
    rows:    num('lay-rows', 2),
    tilt:    num('lay-tilt', 30),
    azimuth: num('lay-azimuth', 0),
  };
}

/** Configs toiture pour le rendu multi (inclut le nom). */
function readMultiRoofConfigs() {
  if (typeof LayoutRoofs === 'undefined') {
    return [{ ...readPanelLayoutConfig(), name: 'Toiture 1' }];
  }
  return LayoutRoofs.getRoofs().map(r => ({
    id: r.id,
    roofW: r.roofW, roofD: r.roofD,
    panelW: r.panelW, panelH: r.panelH,
    nPanels: r.nPanels, rows: r.rows,
    tilt: r.tilt, azimuth: r.azimuth,
    gap: r.gap,
    name: r.name || 'Toiture',
  }));
}

/** Libellé compas (8 directions) pour un azimut donné (0°=Sud, -90°=Est, +90°=Ouest, ±180°=Nord). */
function azimuthCompassLabel(az) {
  const dirs = ['Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest', 'Nord', 'Nord-Est', 'Est', 'Sud-Est'];
  const normalized = ((Number(az) % 360) + 360) % 360;
  const idx = Math.round(normalized / 45) % 8;
  return dirs[idx];
}

/** Redessine le canvas isométrique et met à jour la légende. Appelée à chaque saisie et à l'activation de l'onglet. */
function renderPanelLayoutTab() {
  const canvas = document.getElementById('layout-canvas');
  if (!canvas || typeof PanelLayout3D === 'undefined') return null;

  if (typeof LayoutRoofs !== 'undefined') LayoutRoofs.saveActiveFromForm();

  const roofs = readMultiRoofConfigs();
  const layout = PanelLayout3D.renderMulti
    ? PanelLayout3D.renderMulti(canvas, roofs)
    : PanelLayout3D.render(canvas, roofs[0]);
  if (!layout) return null;

  const active = typeof LayoutRoofs !== 'undefined' ? LayoutRoofs.getActiveRoof() : null;
  const activeLayout = active && layout.perRoof
    ? layout.perRoof.find(r => r.id === active.id) || layout.perRoof[0]
    : layout;

  const nf = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  const roofCount = roofs.length;

  const panelsEl = document.getElementById('lay-kpi-panels');
  if (panelsEl) panelsEl.textContent = layout.nPanels > 0
    ? `${layout.panelsPlaced}${layout.panelsPlaced < layout.nPanels ? ` / ${layout.nPanels}` : ''}`
    : '0';

  const dimsEl = document.getElementById('lay-kpi-grid-dims');
  if (dimsEl) {
    if (roofCount > 1) {
      dimsEl.textContent = `${roofCount} toiture${roofCount > 1 ? 's' : ''} — Σ ${layout.rows} rangée${layout.rows > 1 ? 's' : ''}`;
    } else if (layout.nPanels > 0) {
      const r0 = layout.perRoof?.[0] || layout;
      dimsEl.textContent = `${r0.rows} rangée${r0.rows > 1 ? 's' : ''} × ${r0.cols} colonne${r0.cols > 1 ? 's' : ''}`;
    } else {
      dimsEl.textContent = '-';
    }
  }

  const subEl = document.getElementById('lay-kpi-subtitle');
  if (subEl) {
    subEl.textContent = active
      ? (roofCount > 1
        ? `Totaux toutes toitures — édition : ${active.name || 'Toiture'}`
        : `Toiture : ${active.name || 'Toiture 1'}`)
      : '';
  }

  const surfEl = document.getElementById('lay-kpi-surface');
  if (surfEl) surfEl.textContent = nf(layout.surfaceUsed);
  const roofEl = document.getElementById('lay-kpi-roof');
  if (roofEl) roofEl.textContent = nf(layout.surfaceRoof);
  const covEl = document.getElementById('lay-kpi-coverage');
  if (covEl) covEl.textContent = `${nf(layout.coveragePct)}%`;

  const az = activeLayout?.azimuth ?? layout.azimuth ?? 0;
  const azEl = document.getElementById('lay-kpi-azimuth');
  if (azEl) azEl.textContent = azimuthCompassLabel(az);
  const azDegEl = document.getElementById('lay-kpi-azimuth-deg');
  if (azDegEl) azDegEl.textContent = `${az > 0 ? '+' : ''}${nf(az)}° (0°=Sud)`;

  const warnEl = document.getElementById('lay-warning');
  if (warnEl) {
    const overflows = layout.overflowWarnings || [];
    if (overflows.length) {
      warnEl.style.display = '';
      const names = overflows.map(w => w.name).join(', ');
      warnEl.textContent = overflows.length === 1
        ? `⚠️ ${names} : le tableau dépasse la toiture — réduisez les panneaux ou agrandissez la toiture.`
        : `⚠️ Débordement sur ${names} — réduisez les panneaux ou agrandissez les toitures concernées.`;
    } else {
      warnEl.style.display = (layout.nPanels > 0 && !layout.fits) ? '' : 'none';
      if (layout.nPanels > 0 && !layout.fits) {
        warnEl.textContent = '⚠️ Le tableau de panneaux dépasse la surface de toiture disponible — réduisez le nombre de panneaux, augmentez les rangées ou agrandissez la toiture.';
      }
    }
  }

  if (typeof LayoutRoofs !== 'undefined') LayoutRoofs.renderRoofTabs();

  const host3d = document.getElementById('layout-3d-host');
  if (host3d && typeof RoofModel3D !== 'undefined' && RoofModel3D.isReady()) {
    if (!host3d.dataset.ose3d) {
      RoofModel3D.attach(host3d, { showObstacles: false });
      host3d.dataset.ose3d = '1';
    } else {
      RoofModel3D.refresh();
    }
  } else if (canvas) {
    canvas.style.display = 'block';
    if (host3d) host3d.style.display = 'none';
  }

  return layout;
}

/** Vues caméra implantation 3D */
const Layout3DView = {
  setView(preset) {
    if (typeof RoofModel3D !== 'undefined') RoofModel3D.setView(preset);
  },
};

/** Synchronise nombre de panneaux / dimensions depuis un autre onglet déjà calculé. */
function syncPanelLayoutFrom(source) {
  const setVal = (id, v) => {
    if (v == null || !isFinite(v)) return;
    const el = document.getElementById(id);
    if (el) el.value = v;
  };
  const getNum = (id) => {
    const el = document.getElementById(id);
    const n = el ? parseFloat(el.value) : NaN;
    return isFinite(n) ? n : null;
  };
  const getStr = (id) => {
    const v = document.getElementById(id)?.value;
    return v ? v.trim() : '';
  };

  const panelDimsFromM2 = (m2) => {
    const w = Math.sqrt(m2 / 1.56);
    return { w: Math.round(w * 100) / 100, h: Math.round(w * 1.56 * 100) / 100 };
  };

  const toMeters = (v) => {
    const n = parseFloat(v);
    if (!isFinite(n) || n <= 0) return null;
    return n > 10 ? n / 1000 : n;
  };

  const findPanelDims = (model) => {
    if (!model || typeof PanelDB === 'undefined' || typeof PanelDB.list !== 'function') return null;
    const hit = PanelDB.list().find(p => (p.model || '').trim().toLowerCase() === model.toLowerCase());
    if (!hit) return null;
    const w = toMeters(hit.largeur), h = toMeters(hit.hauteur);
    return (w && h) ? { w, h } : null;
  };

  let nPanels = null, surfaceNeeded = null, panelM2 = AppState.install?.panelM2;
  let tilt = AppState.install?.tilt, azimuth = AppState.install?.azimuth;
  let panelModel = null;

  if (source === 'sizing') {
    const rec = AppState.lastSizingResult;
    nPanels = rec?.nPanels ?? null;
    surfaceNeeded = rec?.surfaceNeeded ?? null;
    panelModel = getStr('sz-panel-model');
  } else if (source === 'grid') {
    const params = AppState.lastGridParams;
    nPanels = params?.nPanels ?? null;
    surfaceNeeded = (params?.nPanels && params?.panelM2) ? params.nPanels * params.panelM2 : null;
    panelM2 = params?.panelM2 ?? panelM2;
    panelModel = getStr('inp-panel-model');
  } else if (source === 'offgrid') {
    const rec = AppState.lastOffgridSizingResult;
    const panelWp = getNum('og2-panel-wp') || AppState.install?.panelWp || 400;
    nPanels = rec?.nPanels ?? (rec?.Ppeak ? Math.ceil((rec.Ppeak * 1000) / panelWp) : null);
    panelM2 = getNum('og2-panel-m2') || panelM2;
    surfaceNeeded = getNum('og2-surface') || (nPanels && panelM2 ? nPanels * panelM2 : null);
    tilt = getNum('og2-tilt') ?? tilt;
    azimuth = getNum('og2-azimuth') ?? azimuth;
    panelModel = getStr('og2-panel-model');
  }

  setVal('lay-tilt', tilt);
  setVal('lay-azimuth', azimuth);

  if (nPanels && typeof LayoutRoofs !== 'undefined') {
    LayoutRoofs.distributePanels(nPanels);
    if (typeof showToast === 'function') {
      const mix = LayoutRoofs.productionMixLabel();
      showToast(`Répartition : ${mix || nPanels + ' panneaux'}`, 'success');
    }
  } else if (nPanels) {
    setVal('lay-npanels', nPanels);
  }

  const dims = findPanelDims(panelModel) || (panelM2 ? panelDimsFromM2(panelM2) : null);
  if (dims) {
    setVal('lay-panel-w', dims.w);
    setVal('lay-panel-h', dims.h);
  }

  if (surfaceNeeded && surfaceNeeded > 0) {
    const side = Math.ceil(Math.sqrt(surfaceNeeded * 1.3) * 10) / 10;
    setVal('lay-roof-w', side);
    setVal('lay-roof-d', side);
  }

  const rowsEl = document.getElementById('lay-rows');
  if (rowsEl && (!parseInt(rowsEl.value, 10) || parseInt(rowsEl.value, 10) < 1)) rowsEl.value = 1;

  renderPanelLayoutTab();
}

/**
 * Envoie le nombre de panneaux / rangées de l'implantation vers le calculateur de
 * câblage DC (onglet Câbles) et estime directement la longueur de string.
 */
function syncLayoutToCableLength() {
  if (typeof LayoutRoofs !== 'undefined') LayoutRoofs.saveActiveFromForm();

  const roofs = typeof LayoutRoofs !== 'undefined' ? LayoutRoofs.getRoofs() : [readPanelLayoutConfig()];
  const nPanels = typeof LayoutRoofs !== 'undefined'
    ? LayoutRoofs.totalPanels()
    : (readPanelLayoutConfig().nPanels || 0);

  if (!nPanels || nPanels <= 0) {
    if (typeof showToast === 'function') showToast('Renseignez d\'abord le nombre de panneaux de l\'implantation.', 'error');
    return;
  }
  if (typeof CableCalc === 'undefined') return;

  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  const rows = Math.max(1, ...roofs.map(r => Math.max(1, Math.round(r.rows || 1))));
  const active = typeof LayoutRoofs !== 'undefined' ? LayoutRoofs.getActiveRoof() : null;
  const pitch = (active?.panelW > 0 ? active.panelW : readPanelLayoutConfig().panelW)
    || (parseFloat(document.getElementById('cbl-dc-pitch')?.value) || 1.8);

  setVal('cbl-dc-npanels', nPanels);
  setVal('cbl-dc-rows', rows);
  setVal('cbl-dc-pitch', pitch);
  const distanceToInverter = parseFloat(document.getElementById('cbl-dc-dist-inv')?.value) || 10;
  setVal('cbl-dc-dist-inv', distanceToInverter);

  const len = CableCalc.estimateDcLength({ nPanels, rows, pitch, distanceToInverter });
  setVal('cbl-dc-l', len);

  const roofNote = roofs.length > 1 ? ` (${roofs.length} toitures, ${nPanels} panneaux)` : '';
  if (typeof showToast === 'function')
    showToast(`📏 Longueur DC estimée depuis l'implantation${roofNote} : ${len} m (aller) — onglet Câbles`);
  if (typeof activateTab === 'function') activateTab('cables');
}

/** Exporte le rendu courant en image PNG (utile pour joindre au devis / présentation client). */
function exportPanelLayoutImage() {
  const host = document.getElementById('layout-3d-host');
  const webglCanvas = host?.querySelector('canvas');
  const canvas = webglCanvas || document.getElementById('layout-canvas');
  if (!canvas) return;
  try {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'implantation-panneaux.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {
    console.warn('[panel_layout] export image impossible', e);
  }
}

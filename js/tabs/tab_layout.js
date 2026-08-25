/**
 * tab_layout.js - Onglet "Implantation" : visualiseur 2.5D des panneaux sur toiture
 * Dépend de : panel_3d.js (rendu Canvas pur), app_state.js (AppState)
 */

function initTabLayout() {
  document.getElementById('tab-layout').innerHTML = `
    <div class="tab-form-col">

      <!-- Paramètres -->
      <div>
        <div class="card">
          <div class="card-title">Paramètres de l'implantation</div>

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
            <button type="button" class="btn btn-accent" style="width:100%" onclick="exportPanelLayoutImage()">
              📷 Exporter l'image
            </button>
          </div>
        </div>
      </div>

      <!-- Rendu + légende -->
      <div>
        <div class="card" style="padding:10px">
          <div id="layout-canvas-wrap" style="position:relative;width:100%;height:420px;border-radius:10px;overflow:hidden;border:1px solid var(--color-border)">
            <canvas id="layout-canvas" style="display:block;width:100%;height:100%"></canvas>
          </div>
          <p style="margin-top:8px;font-size:11px;color:var(--color-text-muted)">
            Vue 2.5D schématique (non contractuelle) — la flèche orange indique l'orientation des panneaux.
          </p>
        </div>

        <div class="card" style="margin-top:12px">
          <div class="card-title">Légende de l'implantation</div>
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
          </div>
          <div id="lay-warning" class="alert alert-warning" style="display:none;margin-top:10px">
            ⚠️ Le tableau de panneaux dépasse la surface de toiture disponible — réduisez le nombre de panneaux, augmentez les rangées ou agrandissez la toiture.
          </div>
        </div>
      </div>

    </div>`;

  // Rendu adaptatif : le canvas n'a une taille réelle que si l'onglet est visible.
  window.addEventListener('resize', () => {
    if (AppState.activeTab === 'layout') renderPanelLayoutTab();
  });
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

/** Redessine le canvas isométrique et met à jour la légende. Appelée à chaque saisie et à l'activation de l'onglet. */
function renderPanelLayoutTab() {
  const canvas = document.getElementById('layout-canvas');
  if (!canvas || typeof PanelLayout3D === 'undefined') return null;
  const layout = PanelLayout3D.render(canvas, readPanelLayoutConfig());
  if (!layout) return null;

  const nf = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  const panelsEl = document.getElementById('lay-kpi-panels');
  if (panelsEl) panelsEl.textContent = layout.nPanels > 0
    ? `${layout.panelsPlaced}${layout.panelsPlaced < layout.nPanels ? ` / ${layout.nPanels}` : ''}`
    : '0';
  const dimsEl = document.getElementById('lay-kpi-grid-dims');
  if (dimsEl) dimsEl.textContent = layout.nPanels > 0
    ? `${layout.rows} rangée${layout.rows > 1 ? 's' : ''} × ${layout.cols} colonne${layout.cols > 1 ? 's' : ''}`
    : '-';
  const surfEl = document.getElementById('lay-kpi-surface');
  if (surfEl) surfEl.textContent = nf(layout.surfaceUsed);
  const roofEl = document.getElementById('lay-kpi-roof');
  if (roofEl) roofEl.textContent = nf(layout.surfaceRoof);
  const covEl = document.getElementById('lay-kpi-coverage');
  if (covEl) covEl.textContent = `${nf(layout.coveragePct)}%`;
  const warnEl = document.getElementById('lay-warning');
  if (warnEl) warnEl.style.display = (layout.nPanels > 0 && !layout.fits) ? '' : 'none';

  return layout;
}

/** Synchronise nombre de panneaux / dimensions depuis un autre onglet déjà calculé. */
function syncPanelLayoutFrom(source) {
  const setVal = (id, v) => {
    if (v == null || !isFinite(v)) return;
    const el = document.getElementById(id);
    if (el) el.value = v;
  };

  if (AppState.install) {
    setVal('lay-tilt', AppState.install.tilt);
    setVal('lay-azimuth', AppState.install.azimuth);
  }

  // Format standard portrait ~1 : 1.56 (proche des panneaux résidentiels courants)
  const panelDimsFromM2 = (m2) => {
    const w = Math.sqrt(m2 / 1.56);
    return { w: Math.round(w * 100) / 100, h: Math.round(w * 1.56 * 100) / 100 };
  };

  let nPanels = null, surfaceNeeded = null, panelM2 = AppState.install?.panelM2;

  if (source === 'sizing') {
    const rec = AppState.lastSizingResult;
    nPanels = rec?.nPanels ?? null;
    surfaceNeeded = rec?.surfaceNeeded ?? null;
  } else if (source === 'grid') {
    const params = AppState.lastGridParams;
    nPanels = params?.nPanels ?? null;
    surfaceNeeded = (params?.nPanels && params?.panelM2) ? params.nPanels * params.panelM2 : null;
    panelM2 = params?.panelM2 ?? panelM2;
  }

  if (nPanels) setVal('lay-npanels', nPanels);
  if (panelM2) {
    const { w, h } = panelDimsFromM2(panelM2);
    setVal('lay-panel-w', w);
    setVal('lay-panel-h', h);
  }
  if (surfaceNeeded && surfaceNeeded > 0) {
    // Toiture un peu plus grande que le strict besoin (marge de pose)
    const side = Math.ceil(Math.sqrt(surfaceNeeded * 1.3) * 10) / 10;
    setVal('lay-roof-w', side);
    setVal('lay-roof-d', side);
  }

  const rowsEl = document.getElementById('lay-rows');
  if (rowsEl && (!parseInt(rowsEl.value, 10) || parseInt(rowsEl.value, 10) < 1)) rowsEl.value = 1;

  renderPanelLayoutTab();
}

/** Exporte le rendu courant en image PNG (utile pour joindre au devis / présentation client). */
function exportPanelLayoutImage() {
  const canvas = document.getElementById('layout-canvas');
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

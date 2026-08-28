/**
 * tab_site.js — Onglet Site : terrain, orientation, diagramme solaire / ombrage
 */
function initTabSite() {
  const pane = document.getElementById('tab-site');
  if (!pane) return;
  pane.innerHTML = `
    <div class="tab-form-col">
      <div>
        <div class="card">
          <div class="card-title">Terrain &amp; orientation</div>
          <p style="font-size:12px;color:var(--color-text-muted);line-height:1.5;margin:0 0 10px">
            Même import que dans l’onglet <strong>📍 Lieu</strong> : grille d’altitudes Open-Meteo
            pour estimer l’inclinaison et l’orientation (0° = Sud).
            Calcule inclinaison/azimut depuis une grille d'altitude. L’ombrage 3D combine toiture, panneaux et obstacles volumétriques.
          </p>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button type="button" class="btn btn-primary" style="width:100%" onclick="SiteSurvey.importTerrainElevations()">
              🗻 Estimer pente (relief)
            </button>
            <button type="button" class="btn btn-outline" style="width:100%" onclick="SiteSurvey.applyTerrainToInstall()">
              Appliquer inclinaison / orientation
            </button>
          </div>
          <div id="site-terrain-result" style="margin-top:10px"></div>
        </div>

        <div class="card" style="margin-top:12px">
          <div class="card-title">Boussole</div>
          <p style="font-size:12px;color:var(--color-text-muted);line-height:1.45;margin:0 0 8px">
            Pour calibrer : <strong>secouez l’appareil</strong> (mouvement en 8) — la boussole devient en général assez précise.
            Cap = direction de la <strong>caméra</strong> (téléphone à plat ou debout, portrait / paysage).
            En dernier recours : visez un cap connu ou réglez l’offset.
          </p>
          <p id="site-compass-readout" style="font-size:12px;font-weight:600;margin:0 0 8px">Boussole : —</p>
          <div class="form-row" style="gap:8px;margin-bottom:8px">
            <div class="form-group" style="flex:1">
              <label for="site-compass-offset">Offset (°)</label>
              <input type="number" id="site-compass-offset" step="0.5" value="0">
            </div>
            <div class="form-group" style="flex:1">
              <label for="site-calib-true">Cap vrai (°)</label>
              <input type="number" id="site-calib-true" placeholder="ex. 180 = Sud" min="0" max="360">
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button type="button" class="btn btn-outline btn-sm" onclick="SiteSurvey.startOrientation()">Activer la boussole</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="SiteSurvey.calibrateCompassTo(parseFloat(document.getElementById('site-calib-true').value))">
              Calibrer sur le cap vrai
            </button>
          </div>
        </div>

        <div class="card" style="margin-top:12px">
          <div class="card-title">Obstacles 3D (toiture)</div>
          <p style="font-size:12px;color:var(--color-text-muted);line-height:1.45;margin:0 0 8px">
            Liste et saisie précise — ou utilisez le <strong>modèle 3D</strong> ci-dessus pour placer visuellement.
          </p>
          <ul id="site-obstacles-list" style="list-style:none;padding:0;margin:0 0 8px"></ul>
          <div class="form-row" style="gap:6px;flex-wrap:wrap;margin-bottom:6px">
            <div class="form-group" style="flex:1;min-width:70px"><label for="site-obs-x">X</label><input type="number" id="site-obs-x" step="0.1" value="0"></div>
            <div class="form-group" style="flex:1;min-width:70px"><label for="site-obs-y">Y</label><input type="number" id="site-obs-y" step="0.1" value="0"></div>
            <div class="form-group" style="flex:1;min-width:70px"><label for="site-obs-w">L</label><input type="number" id="site-obs-w" step="0.1" value="0.6"></div>
            <div class="form-group" style="flex:1;min-width:70px"><label for="site-obs-d">l</label><input type="number" id="site-obs-d" step="0.1" value="0.6"></div>
            <div class="form-group" style="flex:1;min-width:70px"><label for="site-obs-h">H</label><input type="number" id="site-obs-h" step="0.1" value="1.5"></div>
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label for="site-obs-label">Libellé</label>
            <input type="text" id="site-obs-label" placeholder="Cheminée, arbre…">
          </div>
          <button type="button" class="btn btn-outline btn-sm" style="width:100%" onclick="SiteSurvey.addObstacleFromForm()">+ Obstacle 3D</button>
        </div>

        <div class="card" style="margin-top:12px">
          <div class="card-title">Points d’horizon</div>
          <ul id="site-points-list" style="list-style:none;padding:0;margin:0 0 8px"></ul>
          <button type="button" class="btn btn-outline btn-sm" style="width:100%" onclick="SiteSurvey.clearPoints()">Effacer tous les points</button>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-title">Modèle 3D du site</div>
          <p style="font-size:12px;color:var(--color-text-muted);line-height:1.45;margin:0 0 8px">
            Visualisez toutes vos toitures (onglet <strong>Implantation</strong>), panneaux et obstacles en 3D isométrique.
            <strong>Clic</strong> sur une toiture pour la sélectionner · <strong>Glisser</strong> un obstacle pour le déplacer.
          </p>
          <div class="ose-scene-toolbar" role="toolbar" aria-label="Outils modèle 3D">
            <button type="button" class="ose-scene-tool active" data-scene-mode="select" onclick="Scene3D.setMode('select')">↖ Sélection</button>
            <button type="button" class="ose-scene-tool" data-scene-mode="move" onclick="Scene3D.setMode('move')">↔ Déplacer</button>
            <button type="button" class="ose-scene-tool" data-scene-mode="place-chimney" onclick="Scene3D.setMode('place-chimney')">🧱 Cheminée</button>
            <button type="button" class="ose-scene-tool" data-scene-mode="place-tree" onclick="Scene3D.setMode('place-tree')">🌳 Arbre</button>
            <button type="button" class="ose-scene-tool" data-scene-mode="place-wall" onclick="Scene3D.setMode('place-wall')">🧱 Mur</button>
            <button type="button" class="ose-scene-tool" data-scene-mode="place-velux" onclick="Scene3D.setMode('place-velux')">▭ Velux</button>
            <button type="button" class="ose-scene-tool ose-scene-tool-danger" onclick="Scene3D.deleteSelected()">🗑</button>
          </div>
          <div id="site-scene-3d-wrap" style="position:relative;width:100%;height:360px;border-radius:10px;overflow:hidden;border:1px solid var(--color-border);margin-top:8px">
            <canvas id="site-scene-3d-canvas" style="display:block;width:100%;height:100%"></canvas>
          </div>
          <p style="margin-top:8px;font-size:11px;color:var(--color-text-muted)">
            Toitures et panneaux : éditez l’<strong>Implantation</strong> (+ Ajouter toiture). Ici : placez les obstacles qui font de l’ombre.
          </p>
        </div>

        <div class="card" style="margin-top:12px">
          <div class="card-title">Diagramme solaire</div>
          <p style="font-size:12px;color:var(--color-text-muted);line-height:1.45;margin:0 0 10px">
            Cliquez dans le cercle pour placer un obstacle (manuel PC / téléphone),
            ou utilisez le mode photo + boussole (cap + pitch). Glissez un point sur le diagramme pour le déplacer.
            Trajectoires : été / équinoxe / hiver.
          </p>
          <canvas id="site-solar-canvas" width="520" height="520"
            style="width:100%;max-width:520px;height:auto;display:block;margin:0 auto;border-radius:8px;cursor:crosshair;background:#0b1a2a"></canvas>

          <div class="form-row" style="gap:8px;margin-top:12px">
            <div class="form-group">
              <label for="site-man-az">Azimut (0°=N)</label>
              <div class="input-unit"><input type="number" id="site-man-az" min="0" max="360" step="1" placeholder="180"><span class="unit-tag">°</span></div>
            </div>
            <div class="form-group">
              <label for="site-man-elev">Élévation</label>
              <div class="input-unit"><input type="number" id="site-man-elev" min="0" max="90" step="0.5" placeholder="20"><span class="unit-tag">°</span></div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" style="align-self:flex-end;margin-bottom:1px" onclick="SiteSurvey.addPointManual()">+ Point</button>
          </div>

          <div class="ose-site-actions" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">
            <button type="button" class="btn btn-accent" onclick="SiteSurvey.startPhotoMode()">📷 Mode photo + boussole</button>
            <button type="button" class="btn btn-outline" onclick="SiteSurvey.stopPhotoMode()">Stop photo</button>
            <button type="button" class="btn btn-outline" onclick="SiteSurvey.recompute()">Recalculer ombrage</button>
            <button type="button" class="btn btn-primary" onclick="SiteSurvey.applyShadingToLosses()">Appliquer au dimensionnement</button>
          </div>

          <div id="site-photo-wrap" style="display:none;margin-top:12px;position:relative;border-radius:10px;overflow:hidden;background:#000">
            <video id="site-photo-video" playsinline muted autoplay
              style="width:100%;max-height:320px;object-fit:cover;display:block;background:#111"></video>
            <div style="position:absolute;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center">
              <div style="width:36px;height:36px;border:2px solid #f5a623;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,0.4)"></div>
            </div>
            <div id="site-photo-hud" style="position:absolute;top:8px;left:8px;right:8px;pointer-events:none;background:rgba(0,0,0,0.65);color:#fff;font-size:12px;font-weight:600;padding:6px 10px;border-radius:6px;text-align:center">
              Cap — · Élév —
            </div>
            <div class="ose-photo-controls" style="padding:10px;background:rgba(0,0,0,0.75);display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <div class="form-group" style="margin:0;flex:1 1 120px;min-width:0">
                <label for="site-photo-elev" style="color:#ddd;font-size:11px">Élév. override (sinon = pitch live)</label>
                <input type="number" id="site-photo-elev" min="0" max="90" step="0.5" placeholder="auto" style="width:100%">
              </div>
              <button type="button" class="btn btn-accent" style="flex:1 1 auto" onclick="SiteSurvey.addPointFromPhoto()">➕ Placer le point (cap+pitch)</button>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:12px">
          <div class="card-title">Ombrage saisonnier</div>
          <div id="site-shade-results"></div>
        </div>
        <div class="ose-journey-nav">
          <button type="button" class="btn btn-outline" onclick="goNextPrimaryTab()">Passer →</button>
          <button type="button" class="btn btn-primary" id="site-journey-next" onclick="goNextPrimaryTab()">Continuer →</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * tab_grid.js - HTML de l'onglet Système PV réseau
 */
function initTabGrid() {
  document.getElementById('tab-grid').innerHTML = `
    <div class="tab-form-col">

      <!-- Paramètres -->
      <div>
        <div class="card">
          <div class="card-title">Paramètres système</div>

          <div class="form-group" style="margin-bottom:10px">
            <label for="sel-tech">Technologie PV</label>
            <select id="sel-tech">
              <option value="crystSi">Silicium cristallin (c-Si)</option>
              <option value="CIS">CIS / CIGS</option>
              <option value="CdTe">Cadmium Telluride (CdTe)</option>
              <option value="unknown">Inconnue</option>
            </select>
          </div>

          <div class="form-row" style="gap:8px;margin-bottom:10px">
            <div class="form-group">
              <label for="inp-surface">Surface disponible</label>
              <div class="input-unit">
                <input type="number" id="inp-surface" value="" step="1" min="1" placeholder="m²" oninput="calcGridPanels()">
                <span class="unit-tag">m²</span>
              </div>
            </div>
            <div class="form-group">
              <label for="inp-panel-m2">Surface / panneau</label>
              <div class="input-unit">
                <input type="number" id="inp-panel-m2" value="1.96" step="0.01" min="0.5" oninput="calcGridPanels()">
                <span class="unit-tag">m²</span>
              </div>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:6px">
            <label style="display:flex;align-items:center;justify-content:space-between">
              <span for="inp-panel-model">Modèle de panneau</span>
              <span style="display:inline-flex;gap:4px">
                <button type="button" class="btn btn-outline btn-sm" onclick="PanelDB.saveFromForm('inp')" style="padding:2px 8px;font-size:10px" title="Enregistrer dans la bibliothèque">💾 Enregistrer</button>
                <button type="button" class="btn btn-outline btn-sm" onclick="PanelDB.openLibraryModal('inp')" style="padding:2px 8px;font-size:10px" title="Choisir dans la bibliothèque">📋 Bibliothèque</button>
              </span>
            </label>
            <input type="text" id="inp-panel-model" placeholder="ex : Jinko Tiger Neo 415W" style="width:100%">
          </div>

          <div class="form-group" style="margin-bottom:10px">
            <label for="inp-panel-wp">Puissance unitaire panneau</label>
            <div class="input-unit">
              <input type="number" id="inp-panel-wp" value="400" step="10" min="50" oninput="calcGridPanels()">
              <span class="unit-tag">Wc</span>
            </div>
          </div>

          <div style="margin-bottom:6px">
            <label style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:12px;font-weight:600">Mode panneaux</span>
              <span style="display:inline-flex;gap:3px">
                <button type="button" id="grid-pmode-surface" class="btn btn-outline btn-sm active" onclick="setPanelMode('grid','surface')" style="padding:2px 8px;font-size:10px" title="Depuis la surface disponible">🏠 Surface</button>
                <button type="button" id="grid-pmode-conso"   class="btn btn-outline btn-sm"        onclick="setPanelMode('grid','conso')"   style="padding:2px 8px;font-size:10px" title="Depuis la consommation annuelle">⚡ Conso</button>
                <button type="button" id="grid-pmode-fixe"    class="btn btn-outline btn-sm"        onclick="setPanelMode('grid','fixe')"    style="padding:2px 8px;font-size:10px" title="Valeur fixée manuellement">✏️ Fixe</button>
              </span>
            </label>
            <input type="hidden" id="grid-panel-mode" value="surface">
            <div id="grid-npanels-fixe-wrap" style="display:none;margin-bottom:6px">
              <div class="input-unit">
                <input type="number" id="grid-npanels-fixe" value="8" min="1" step="1" oninput="calcGridPanels()">
                <span class="unit-tag">panneaux</span>
              </div>
            </div>
          </div>

          <div id="grid-panels-info" style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="color:var(--color-text-muted)">Panneaux installables</span>
              <span id="grid-npanels" style="font-weight:700;font-size:16px;color:var(--color-primary)">-</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
              <span style="color:var(--color-text-muted)">Puissance crête totale</span>
              <span id="grid-ppeak-display" style="font-weight:700;font-size:16px;color:var(--color-accent)">-</span>
            </div>
          </div>
          <input type="hidden" id="inp-ppeak" value="3">

          <div class="form-group" style="margin-bottom:10px">
            <label for="inp-losses">Pertes système</label>
            <div class="input-unit">
              <input type="number" id="inp-losses" value="14" step="0.5" min="0" max="50">
              <span class="unit-tag">%</span>
            </div>
          </div>

          <hr>

          <div class="form-group" style="margin-bottom:6px">
            <label for="inp-tilt">Inclinaison des panneaux</label>
            <div class="input-unit">
              <input type="number" id="inp-tilt" value="30" step="1" min="0" max="90">
              <span class="unit-tag">°</span>
            </div>
            <div class="checkbox-row">
              <input type="checkbox" id="chk-optimize-tilt">
              <label for="chk-optimize-tilt">Optimiser automatiquement</label>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:10px">
            <label for="inp-azimuth">Azimut <span style="font-weight:400;color:var(--color-text-muted)">(0°=Sud, -90°=Est)</span></label>
            <div class="input-unit">
              <input type="number" id="inp-azimuth" value="0" step="5" min="-180" max="180">
              <span class="unit-tag">°</span>
            </div>
            <div class="checkbox-row">
              <input type="checkbox" id="chk-optimize-az">
              <label for="chk-optimize-az">Optimiser avec l'inclinaison</label>
            </div>
          </div>

          <hr>

          <div class="card-title" style="margin-top:4px;font-size:12px">Données économiques</div>

          <div class="form-group" style="margin-bottom:8px">
            <label for="inp-cost">Coût total du système</label>
            <div class="input-unit">
              <input type="number" id="inp-cost" value="3600" step="100" min="0">
              <span class="unit-tag">€</span>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:8px">
            <label for="inp-kwh-price">Prix de revente kWh</label>
            <div class="input-unit">
              <input type="number" id="inp-kwh-price" value="0.13" step="0.01" min="0">
              <span class="unit-tag">€/kWh</span>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:14px">
            <label for="inp-co2">Facteur émission CO₂</label>
            <div class="input-unit">
              <input type="number" id="inp-co2" value="0.052" step="0.001" min="0">
              <span class="unit-tag">kgCO₂/kWh</span>
            </div>
          </div>

          <button class="btn btn-accent" id="btn-calc-grid" style="width:100%">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4 8h-2v2h-2v-2H9v-2h2V7h2v2h2v2z"/></svg>
            Calculer
          </button>
        </div>
      </div>

      <!-- Résultats -->
      <div id="grid-results">
        <div class="result-placeholder">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
          <p>Cliquez sur <strong>Calculer</strong> pour lancer la simulation</p>
        </div>
      </div>

    </div>`;
}

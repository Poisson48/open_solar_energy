/**
 * tab_offgrid.js — HTML de l'onglet Système hors réseau
 */
function initTabOffgrid() {
  document.getElementById('tab-offgrid').innerHTML = `
    <div style="display:grid;grid-template-columns:320px 1fr;gap:16px">

      <!-- Formulaire -->
      <div>

        <!-- Consommation -->
        <details class="card" open>
          <summary class="card-title" style="cursor:pointer;user-select:none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2-8 2 0-3.5 2.5-7 6-8-1 4-3 5-3 5 0 0-2-3-4-3H9c-.5 0-1 .5-1 1l-.5 4.5h.01c-.01.16-.01.33-.01.5C7.5 13 9.5 15 12 15c.5 0 1-.1 1.5-.2C15 14.2 16.4 12.5 17 11V8z"/></svg>
            Consommation journalière
          </summary>
          <div style="margin-top:10px">
            <div class="form-group" style="margin-bottom:10px">
              <label>Consommation par défaut (tous les mois)</label>
              <div class="input-unit">
                <input type="number" id="og2-daily-default" value="" step="50" min="0" placeholder="ex: 1000">
                <span class="unit-tag">Wh/j</span>
              </div>
              <div style="font-size:11px;color:var(--color-text-muted);margin-top:4px">
                Laissez les mois à 0 pour utiliser cette valeur pour tous.
              </div>
            </div>
            <button type="button" class="btn btn-outline btn-sm" onclick="importEDFToOffgrid()" style="margin-bottom:8px">
              ↓ Importer la consommation depuis la facture EDF
            </button>
            <div id="og2-edf-import-status" style="font-size:11px;color:var(--color-text-muted);margin-bottom:6px"></div>
            <div style="font-size:12px;font-weight:700;color:var(--color-primary);margin-bottom:6px">
              Profil mensuel détaillé (optionnel)
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px">
              <div class="form-group"><label>Jan</label><input type="number" id="og2-day-1"  value="0" min="0" step="50"></div>
              <div class="form-group"><label>Fév</label><input type="number" id="og2-day-2"  value="0" min="0" step="50"></div>
              <div class="form-group"><label>Mar</label><input type="number" id="og2-day-3"  value="0" min="0" step="50"></div>
              <div class="form-group"><label>Avr</label><input type="number" id="og2-day-4"  value="0" min="0" step="50"></div>
              <div class="form-group"><label>Mai</label><input type="number" id="og2-day-5"  value="0" min="0" step="50"></div>
              <div class="form-group"><label>Jun</label><input type="number" id="og2-day-6"  value="0" min="0" step="50"></div>
              <div class="form-group"><label>Jul</label><input type="number" id="og2-day-7"  value="0" min="0" step="50"></div>
              <div class="form-group"><label>Aoû</label><input type="number" id="og2-day-8"  value="0" min="0" step="50"></div>
              <div class="form-group"><label>Sep</label><input type="number" id="og2-day-9"  value="0" min="0" step="50"></div>
              <div class="form-group"><label>Oct</label><input type="number" id="og2-day-10" value="0" min="0" step="50"></div>
              <div class="form-group"><label>Nov</label><input type="number" id="og2-day-11" value="0" min="0" step="50"></div>
              <div class="form-group"><label>Déc</label><input type="number" id="og2-day-12" value="0" min="0" step="50"></div>
            </div>
            <p id="og2-annual-total" style="font-size:12px;font-weight:700;color:var(--color-primary);margin-top:6px;text-align:right"></p>
          </div>
        </details>

        <!-- Batterie -->
        <details class="card" open>
          <summary class="card-title" style="cursor:pointer;user-select:none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>
            Technologie batterie
          </summary>
          <div style="margin-top:10px">
            <div class="form-group" style="margin-bottom:10px">
              <label>Type de batterie</label>
              <select id="og2-batt-tech">
                <option value="lfp">LFP standard — Lithium Fer Phosphate (neuf, recommandé)</option>
                <option value="lfp_diy">LFP DIY — Cellules CATL/EVE 280Ah (meilleur rapport qualité/prix)</option>
                <option value="agm">AGM — Plomb Carbone (économique)</option>
                <option value="nmc_leaf">NMC recondit. — Nissan Leaf</option>
                <option value="nmc_zoe">NMC recondit. — Renault Zoé</option>
                <option value="nmc_tesla">NMC recondit. — Tesla</option>
              </select>
            </div>
            <div id="og2-batt-info" class="alert alert-info" style="font-size:11px"></div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:6px">
              La capacité optimale est calculée automatiquement selon votre consommation.
            </div>
          </div>
        </details>

        <!-- Toiture & stratégie -->
        <details class="card" open>
          <summary class="card-title" style="cursor:pointer;user-select:none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
            Toiture et objectif
          </summary>
          <div style="margin-top:10px">
            <div class="params-grid">
              <div class="form-group">
                <label>Inclinaison <button type="button" class="btn btn-outline btn-sm" onclick="optimizeTiltFor('og2')" style="padding:1px 7px;font-size:10px;margin-left:4px">⚡ Auto</button></label>
                <div class="input-unit"><input type="number" id="og2-tilt" value="30" min="0" max="90"><span class="unit-tag">°</span></div>
              </div>
              <div class="form-group">
                <label>Azimut <button type="button" class="btn btn-outline btn-sm" onclick="optimizeTiltFor('og2', true)" style="padding:1px 7px;font-size:10px;margin-left:4px">⚡ Auto</button></label>
                <div class="input-unit"><input type="number" id="og2-azimuth" value="0" min="-180" max="180"><span class="unit-tag">°</span></div>
              </div>
              <div class="form-group">
                <label>Surface dispo</label>
                <div class="input-unit"><input type="number" id="og2-surface" value="" placeholder="m²"><span class="unit-tag">m²</span></div>
              </div>
              <div class="form-group">
                <label>Panneaux (Wc)</label>
                <div class="input-unit"><input type="number" id="og2-panel-wp" value="400" step="10"><span class="unit-tag">Wc</span></div>
              </div>
              <div class="form-group">
                <label>Surface panneau</label>
                <div class="input-unit"><input type="number" id="og2-panel-m2" value="1.96" step="0.01"><span class="unit-tag">m²</span></div>
              </div>
              <div class="form-group">
                <label>Pertes système</label>
                <div class="input-unit"><input type="number" id="og2-losses" value="14" min="0"><span class="unit-tag">%</span></div>
              </div>
            </div>

            <div style="margin-top:8px">
              <label style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                <span style="font-size:12px;font-weight:600">Nombre de panneaux</span>
                <span style="display:inline-flex;gap:3px">
                  <button type="button" id="og2-pmode-surface" class="btn btn-outline btn-sm active" onclick="setPanelMode('og2','surface')" style="padding:2px 8px;font-size:10px" title="Limiter à la surface dispo">🏠 Surface</button>
                  <button type="button" id="og2-pmode-conso"   class="btn btn-outline btn-sm"        onclick="setPanelMode('og2','conso')"   style="padding:2px 8px;font-size:10px" title="Dimensionnement libre selon conso">⚡ Conso</button>
                  <button type="button" id="og2-pmode-fixe"    class="btn btn-outline btn-sm"        onclick="setPanelMode('og2','fixe')"    style="padding:2px 8px;font-size:10px" title="Fixer le nombre de panneaux">✏️ Fixe</button>
                </span>
              </label>
              <div id="og2-npanels-fixe-wrap" style="display:none;margin-bottom:4px">
                <div class="input-unit">
                  <input type="number" id="og2-npanels-fixe" value="8" min="1" step="1" oninput="calcPanelsForMode('og2')">
                  <span class="unit-tag">panneaux</span>
                </div>
              </div>
              <div id="og2-npanels-display" style="font-size:12px;color:var(--color-text-muted)">Auto depuis surface</div>
            </div>
            <div class="form-group" style="margin-top:4px">
              <label>Taux de couverture visé</label>
              <div class="input-unit"><input type="number" id="og2-target-coverage" value="90" min="50" max="100"><span class="unit-tag">%</span></div>
            </div>
          </div>
        </details>

        <details class="card">
          <summary class="card-title" style="cursor:pointer;user-select:none">💶 Coûts réels (optionnel)</summary>
          <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group">
              <label>Coût PV</label>
              <div class="input-unit"><input type="number" id="og2-pv-cost-kwp" value="650" step="50" min="0"><span class="unit-tag">€/kWc</span></div>
            </div>
            <div class="form-group">
              <label>BOS + câblage</label>
              <div class="input-unit"><input type="number" id="og2-bos-cost" value="500" step="50" min="0"><span class="unit-tag">€</span></div>
            </div>
          </div>
        </details>

        <button class="btn btn-accent" id="btn-calc-offgrid2" style="width:100%;margin-bottom:8px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>
          Dimensionner mon système autonome
        </button>
      </div>

      <!-- Résultats -->
      <div id="offgrid2-results">
        <div class="result-placeholder">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>
          <p>Renseignez votre consommation et cliquez sur <strong>Dimensionner</strong></p>
        </div>
      </div>

    </div>`;
}

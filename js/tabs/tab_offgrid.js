/**
 * tab_offgrid.js - HTML de l'onglet Système hors réseau
 */
function initTabOffgrid() {
  document.getElementById('tab-offgrid').innerHTML = `
    <div class="ose-wizard-intro">
      <strong>Dimensionnement autonome</strong>
      <span>Lieu (météo) + Site (ombrage 30 min) + conso jour/nuit → <strong>nombre de panneaux et capacité batterie</strong>. Puis Analyse.</span>
      <span class="ose-wizard-location-note">📍 Vérifiez <strong>Lieu</strong> et <strong>Site / Ombrage</strong> avant de dimensionner.</span>
    </div>

    <div class="tab-form-col">

      <!-- Formulaire -->
      <div>

        <!-- Consommation -->
        <details class="card" open>
          <summary class="card-title" style="cursor:pointer;user-select:none">
            <span class="ose-step-num" style="width:20px;height:20px;font-size:11px;flex:0 0 auto">1</span>
            Consommation journalière
          </summary>
          <div style="margin-top:10px">
            <div id="og2-daynight-block" class="ose-daynight-block" style="margin-bottom:10px;padding:10px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface-2,rgba(0,0,0,0.03))">
              <div style="font-size:12px;font-weight:700;color:var(--color-primary);margin-bottom:4px">Répartition jour / nuit (recommandé)</div>
              <p class="ose-field-help" style="margin:0 0 8px">
                Essentiel pour la batterie : la nuit (21h–6h) n’a <strong>pas de production PV</strong>.
                Deux chiffres suffisent ; le dimensionnement calcule la capacité pour couvrir la nuit.
              </p>
              <div class="form-row" style="gap:8px;margin-bottom:0">
                <div class="form-group" style="flex:1">
                  <label for="og2-load-day">Conso jour</label>
                  <div class="input-unit"><input type="number" id="og2-load-day" value="" min="0" step="0.1" placeholder="ex. 8"><span class="unit-tag">kWh/j</span></div>
                </div>
                <div class="form-group" style="flex:1">
                  <label for="og2-load-night">Conso nuit</label>
                  <div class="input-unit"><input type="number" id="og2-load-night" value="" min="0" step="0.1" placeholder="ex. 4"><span class="unit-tag">kWh/j</span></div>
                </div>
              </div>
              <p id="og2-daynight-hint" style="font-size:11px;color:var(--color-text-muted);margin:6px 0 0"></p>
            </div>

            <div class="form-group" style="margin-bottom:10px">
              <label for="og2-daily-default">Consommation par défaut (tous les mois) — optionnel si jour/nuit renseigné</label>
              <div class="input-unit">
                <input type="number" id="og2-daily-default" value="" step="50" min="0" placeholder="ex: 1000">
                <span class="unit-tag">Wh/j</span>
              </div>
              <div style="font-size:11px;color:var(--color-text-muted);margin-top:4px">
                Laissez les mois à 0 pour utiliser cette valeur pour tous.
              </div>
            </div>
            <button type="button" class="btn btn-outline btn-sm" style="margin-bottom:4px" onclick="openEnedisModal()">
              📂 Importer depuis Enedis
            </button>
            <div id="og2-edf-import-status" style="font-size:11px;color:var(--color-text-muted);margin-bottom:6px"></div>

            <details style="margin:8px 0 10px">
              <summary style="cursor:pointer;font-size:12px;font-weight:700;color:var(--color-primary);user-select:none">
                Profil toutes les 2 h (optionnel, plus précis)
              </summary>
              <p class="ose-field-help" style="margin:8px 0">
                kWh typiques par créneau de 2 h sur une journée. Prioritaire sur jour/nuit si au moins un créneau est rempli.
                Les mois ci-dessous restent optionnels (saisonnalité).
              </p>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px">
                ${[0,2,4,6,8,10,12,14,16,18,20,22].map((h, i) => `
                <div class="form-group">
                  <label for="og2-2h-${i}">${String(h).padStart(2,'0')}–${String(h+2).padStart(2,'0')}h</label>
                  <div class="input-unit"><input type="number" id="og2-2h-${i}" value="" min="0" step="0.1" placeholder="0"><span class="unit-tag">kWh</span></div>
                </div>`).join('')}
              </div>
            </details>

            <div style="font-size:12px;font-weight:700;color:var(--color-primary);margin-bottom:6px">
              Profil mensuel détaillé (optionnel)
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px">
              <div class="form-group"><label for="og2-day-1">Jan</label><input type="number" id="og2-day-1"  value="0" min="0" step="50"></div>
              <div class="form-group"><label for="og2-day-2">Fév</label><input type="number" id="og2-day-2"  value="0" min="0" step="50"></div>
              <div class="form-group"><label for="og2-day-3">Mar</label><input type="number" id="og2-day-3"  value="0" min="0" step="50"></div>
              <div class="form-group"><label for="og2-day-4">Avr</label><input type="number" id="og2-day-4"  value="0" min="0" step="50"></div>
              <div class="form-group"><label for="og2-day-5">Mai</label><input type="number" id="og2-day-5"  value="0" min="0" step="50"></div>
              <div class="form-group"><label for="og2-day-6">Jun</label><input type="number" id="og2-day-6"  value="0" min="0" step="50"></div>
              <div class="form-group"><label for="og2-day-7">Jul</label><input type="number" id="og2-day-7"  value="0" min="0" step="50"></div>
              <div class="form-group"><label for="og2-day-8">Aoû</label><input type="number" id="og2-day-8"  value="0" min="0" step="50"></div>
              <div class="form-group"><label for="og2-day-9">Sep</label><input type="number" id="og2-day-9"  value="0" min="0" step="50"></div>
              <div class="form-group"><label for="og2-day-10">Oct</label><input type="number" id="og2-day-10" value="0" min="0" step="50"></div>
              <div class="form-group"><label for="og2-day-11">Nov</label><input type="number" id="og2-day-11" value="0" min="0" step="50"></div>
              <div class="form-group"><label for="og2-day-12">Déc</label><input type="number" id="og2-day-12" value="0" min="0" step="50"></div>
            </div>
            <p id="og2-annual-total" style="font-size:12px;font-weight:700;color:var(--color-primary);margin-top:6px;text-align:right"></p>
          </div>
        </details>

        <!-- Batterie -->
        <details class="card" open>
          <summary class="card-title" style="cursor:pointer;user-select:none">
            <span class="ose-step-num" style="width:20px;height:20px;font-size:11px;flex:0 0 auto">2</span>
            Batterie
          </summary>
          <div style="margin-top:10px">
            <div class="params-grid">
              <div class="form-group">
                <label for="og2-batt-tech">Type de batterie</label>
                <select id="og2-batt-tech">
                  <option value="lfp">LFP — Lithium Fer Phosphate</option>
                  <option value="lfp_diy">LFP DIY — cellules CATL / EVE</option>
                  <option value="agm">AGM — plomb carbone</option>
                  <option value="nmc_leaf">NMC — Nissan Leaf (recond.)</option>
                  <option value="nmc_zoe">NMC — Renault Zoé (recond.)</option>
                  <option value="nmc_tesla">NMC — Tesla (recond.)</option>
                </select>
              </div>
              <div class="form-group">
                <label for="og2-batt-kwh">Capacité batterie</label>
                <div class="input-unit">
                  <input type="number" id="og2-batt-kwh" value="" min="0.5" step="0.5" placeholder="ex : 15">
                  <span class="unit-tag">kWh</span>
                </div>
              </div>
            </div>
            <div id="og2-batt-info" class="alert alert-info" style="font-size:11px;margin-top:8px"></div>
            <p class="ose-field-help">Capacité <strong>brute</strong> de votre parc. La capacité réellement <strong>utile</strong> (après DoD) sert à la simulation.
              Laissez vide pour rechercher automatiquement — le minimum est calé sur la <strong>conso de nuit</strong> (PV = 0).</p>
          </div>
        </details>

        <!-- Toiture & stratégie -->
        <details class="card" open>
          <summary class="card-title" style="cursor:pointer;user-select:none">
            <span class="ose-step-num" style="width:20px;height:20px;font-size:11px;flex:0 0 auto">3</span>
            Toiture et objectif
          </summary>
          <div style="margin-top:10px">
            <div class="form-group" style="margin-bottom:6px">
              <label style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">
                <span for="og2-panel-model">Modèle de panneau</span>
                <span style="display:inline-flex;gap:4px;flex-wrap:wrap">
                  <button type="button" class="btn btn-outline btn-sm" onclick="PanelDB.saveFromForm('og2')" style="padding:2px 8px;font-size:10px" title="Enregistrer dans la bibliothèque">💾 Enregistrer</button>
                  <button type="button" class="btn btn-outline btn-sm" onclick="PanelDB.openLibraryModal('og2')" style="padding:2px 8px;font-size:10px" title="Choisir dans la bibliothèque">📋 Bibliothèque</button>
                </span>
              </label>
              <input type="text" id="og2-panel-model" placeholder="ex : Jinko Tiger Neo 415W" style="width:100%">
            </div>
            ${typeof PanelDB !== 'undefined' ? PanelDB.electricalFieldsHTML('og2') : ''}
            <div class="params-grid">
              <div class="form-group">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
                  <label for="og2-tilt" style="margin:0">Inclinaison</label>
                  <button type="button" class="btn btn-outline btn-sm" onclick="optimizeTiltFor('og2')" style="padding:1px 7px;font-size:10px">⚡ Auto</button>
                </div>
                <div class="input-unit"><input type="number" id="og2-tilt" value="30" min="0" max="90"><span class="unit-tag">°</span></div>
              </div>
              <div class="form-group">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
                  <label for="og2-azimuth" style="margin:0">Azimut</label>
                  <button type="button" class="btn btn-outline btn-sm" onclick="optimizeTiltFor('og2', true)" style="padding:1px 7px;font-size:10px">⚡ Auto</button>
                </div>
                <div class="input-unit"><input type="number" id="og2-azimuth" value="0" min="-180" max="180"><span class="unit-tag">°</span></div>
              </div>
              <div class="form-group">
                <label for="og2-surface">Surface dispo</label>
                <div class="input-unit"><input type="number" id="og2-surface" value="" placeholder="m²"><span class="unit-tag">m²</span></div>
              </div>
              <div class="form-group">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
                  <label for="og2-panel-wp" style="margin:0">Panneaux (Wc)</label>
                  <button type="button" id="og2-panel-wp-auto" class="btn btn-outline btn-sm" onclick="autoCalcOffgridPanelWp()" style="padding:1px 7px;font-size:10px" title="Choisir une puissance standard selon surface et couverture">⚡ Auto</button>
                </div>
                <div class="input-unit"><input type="number" id="og2-panel-wp" value="400" step="10"><span class="unit-tag">Wc</span></div>
                <p id="og2-panel-wp-lib-hint" class="ose-field-help" style="display:none;margin-top:4px">Puissance issue de la bibliothèque — Auto désactivé.</p>
              </div>
              <div class="form-group">
                <label for="og2-panel-m2">Surface panneau</label>
                <div class="input-unit"><input type="number" id="og2-panel-m2" value="1.96" step="0.01"><span class="unit-tag">m²</span></div>
              </div>
              <div class="form-group">
                <label for="og2-losses">Pertes système</label>
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
              <input type="hidden" id="og2-panel-mode" value="surface">
              <div id="og2-npanels-fixe-wrap" style="display:none;margin-bottom:4px">
                <div class="input-unit">
                  <input type="number" id="og2-npanels-fixe" value="8" min="1" step="1" oninput="calcPanelsForMode('og2')">
                  <span class="unit-tag">panneaux</span>
                </div>
              </div>
              <div id="og2-npanels-display" style="font-size:12px;color:var(--color-text-muted)">Auto depuis surface</div>
            </div>
            <div class="form-group" style="margin-top:4px">
              <label for="og2-target-coverage">Taux de couverture visé</label>
              <div class="input-unit"><input type="number" id="og2-target-coverage" value="90" min="50" max="100"><span class="unit-tag">%</span></div>
            </div>
          </div>
        </details>

        <details class="card">
          <summary class="card-title" style="cursor:pointer;user-select:none">💶 Coûts réels (optionnel)</summary>
          <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group">
              <label for="og2-pv-cost-kwp">Coût PV</label>
              <div class="input-unit"><input type="number" id="og2-pv-cost-kwp" value="650" step="50" min="0"><span class="unit-tag">€/kWc</span></div>
            </div>
            <div class="form-group">
              <label for="og2-bos-cost">BOS + câblage</label>
              <div class="input-unit"><input type="number" id="og2-bos-cost" value="500" step="50" min="0"><span class="unit-tag">€</span></div>
            </div>
          </div>
        </details>

        <p class="ose-field-help" style="margin-bottom:6px">
          Le calcul utilise <strong>Lieu</strong> (météo) + <strong>Site</strong> (ombrage) + conso jour/nuit (ou 2 h / Enedis)
          pour dicter panneaux et batterie. Ensuite → Analyse.
        </p>
        <button class="btn btn-accent" id="btn-calc-offgrid2" style="width:100%;margin-bottom:8px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>
          Dimensionner mon système autonome
        </button>
        <div class="ose-journey-nav" style="margin-top:8px">
          <button type="button" class="btn btn-outline" onclick="goNextPrimaryTab()">Passer →</button>
          <button type="button" class="btn btn-primary" id="offgrid-journey-next" onclick="goNextPrimaryTab()">Continuer → Analyse</button>
        </div>
      </div>

      <!-- Résultats -->
      <div id="offgrid2-results">
        <div class="result-placeholder">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>
          <p>Après Lieu + Site : renseignez jour/nuit (batterie), puis <strong>Dimensionner</strong> — panneaux et kWh batt. sont calculés.</p>
        </div>
      </div>

    </div>`;
}

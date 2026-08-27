/**
 * tab_cables.js - HTML de l'onglet Câbles (dimensionnement DC + AC)
 * Dépend de : js/cable_calc.js (moteur pur), js/renderers/cables.js (logique/DOM)
 */
function initTabCables() {
  document.getElementById('tab-cables').innerHTML = `
    <div class="ose-wizard-intro">
      <strong>Calculateur de câblage DC/AC</strong>
      <span>Section de câble recommandée (mm²), chute de tension et pertes — pour ne plus sous-dimensionner un câblage sur chantier.</span>
      <span class="ose-wizard-location-note">📐 Formule NF C 15-100 simplifiée : ΔU = b·ρ·L·I·cosφ / S. Voir le détail dans chaque section.</span>
      <span class="ose-wizard-location-note">⚠️ Section basée sur la <strong>chute de tension</strong> uniquement. Vérifiez toujours le <strong>courant admissible</strong> du câble (mode de pose, température) selon NF C 15-100 / UTE C 15-712-1 — retenez la section la plus grande des deux critères.</span>
    </div>

    <div class="tab-form-col">

      <!-- Formulaire -->
      <div>

        <!-- Étape 1 : DC -->
        <section class="ose-step card" data-step="1">
          <div class="ose-step-head">
            <span class="ose-step-num">1</span>
            <div>
              <h3 class="ose-step-title">Câblage DC (strings PV → onduleur)</h3>
              <p class="ose-step-hint">Chute de tension max recommandée : 1 % côté DC (norme constructeur / bonnes pratiques).</p>
            </div>
          </div>
          <div class="ose-step-body">

            <div id="cbl-dc-prefill-note" class="alert alert-info" style="display:none"></div>

            <details style="margin-bottom:12px">
              <summary style="cursor:pointer;font-size:12px;font-weight:700;color:var(--color-primary)">📏 Estimer la longueur depuis l'implantation</summary>
              <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div class="form-group">
                  <label for="cbl-dc-npanels">Panneaux du string</label>
                  <input type="number" id="cbl-dc-npanels" min="1" step="1" placeholder="ex : 12">
                </div>
                <div class="form-group">
                  <label for="cbl-dc-rows">Nombre de rangées</label>
                  <input type="number" id="cbl-dc-rows" min="1" step="1" value="1">
                </div>
                <div class="form-group">
                  <label for="cbl-dc-pitch">Espacement entre panneaux</label>
                  <div class="input-unit"><input type="number" id="cbl-dc-pitch" min="0.1" step="0.05" value="1.8"><span class="unit-tag">m</span></div>
                </div>
                <div class="form-group">
                  <label for="cbl-dc-dist-inv">Distance rangée → onduleur</label>
                  <div class="input-unit"><input type="number" id="cbl-dc-dist-inv" min="0" step="0.5" value="10"><span class="unit-tag">m</span></div>
                </div>
              </div>
              <button type="button" class="btn btn-outline btn-sm" style="margin-top:6px" onclick="CablesUI.estimateDcLength()">↓ Estimer la longueur aller</button>
            </details>

            <details style="margin-bottom:12px">
              <summary style="cursor:pointer;font-size:12px;font-weight:700;color:var(--color-primary)">⚡ Estimer courant / tension du string</summary>
              <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div class="form-group">
                  <label for="cbl-dc-isc">Isc panneau (datasheet)</label>
                  <div class="input-unit"><input type="number" id="cbl-dc-isc" min="0" step="0.1" placeholder="ex : 12.5"><span class="unit-tag">A</span></div>
                </div>
                <div class="form-group">
                  <label for="cbl-dc-voc">Voc panneau (datasheet)</label>
                  <div class="input-unit"><input type="number" id="cbl-dc-voc" min="0" step="0.5" placeholder="ex : 41.2"><span class="unit-tag">V</span></div>
                </div>
                <div class="form-group">
                  <label for="cbl-dc-strings-parallel">Strings en parallèle</label>
                  <input type="number" id="cbl-dc-strings-parallel" min="1" step="1" value="1">
                </div>
                <div class="form-group">
                  <label for="cbl-dc-panels-series">Panneaux en série / string</label>
                  <input type="number" id="cbl-dc-panels-series" min="1" step="1" placeholder="ex : 12">
                </div>
              </div>
              <div style="font-size:11px;color:var(--color-text-muted);margin-top:4px">Sans datasheet, une estimation (~0,03 A/Wc, ~0,1 V/Wc) est utilisée depuis la puissance du panneau.</div>
              <button type="button" class="btn btn-outline btn-sm" style="margin-top:6px" onclick="CablesUI.estimateDcElectrical()">↓ Estimer courant (Isc×1,25) et tension (Voc)</button>
            </details>

            <hr>

            <div class="form-row" style="gap:8px;margin-bottom:10px">
              <div class="form-group">
                <label for="cbl-dc-i">Courant string I</label>
                <div class="input-unit"><input type="number" id="cbl-dc-i" min="0" step="0.1" placeholder="ex : 12"><span class="unit-tag">A</span></div>
              </div>
              <div class="form-group">
                <label for="cbl-dc-l">Longueur aller L</label>
                <div class="input-unit"><input type="number" id="cbl-dc-l" min="0" step="0.5" placeholder="ex : 20"><span class="unit-tag">m</span></div>
              </div>
            </div>
            <div class="form-row" style="gap:8px;margin-bottom:10px">
              <div class="form-group">
                <label for="cbl-dc-u">Tension système (Voc string)</label>
                <div class="input-unit"><input type="number" id="cbl-dc-u" min="1" step="1" placeholder="ex : 400"><span class="unit-tag">V</span></div>
              </div>
              <div class="form-group">
                <label for="cbl-dc-maxdrop">Chute de tension max visée</label>
                <div class="input-unit"><input type="number" id="cbl-dc-maxdrop" min="0.1" step="0.1" value="1"><span class="unit-tag">%</span></div>
              </div>
            </div>
            <div class="form-group" style="margin-bottom:4px">
              <label for="cbl-dc-material">Matériau conducteur</label>
              <select id="cbl-dc-material">
                <option value="Cu" selected>Cuivre</option>
                <option value="Al">Aluminium</option>
              </select>
            </div>
          </div>
        </section>

        <!-- Étape 2 : AC -->
        <section class="ose-step card" data-step="2">
          <div class="ose-step-head">
            <span class="ose-step-num">2</span>
            <div>
              <h3 class="ose-step-title">Câblage AC (onduleur → tableau électrique)</h3>
              <p class="ose-step-hint">Chute de tension max recommandée : 1,5 % côté AC (marge NF C 15-100 : 3 % production incluse).</p>
            </div>
          </div>
          <div class="ose-step-body">

            <div class="form-row" style="gap:8px;margin-bottom:10px">
              <div class="form-group">
                <label for="cbl-ac-mode">Type de raccordement</label>
                <select id="cbl-ac-mode" onchange="CablesUI.onAcModeChange()">
                  <option value="ac_mono" selected>Monophasé (230 V)</option>
                  <option value="ac_tri">Triphasé (400 V)</option>
                </select>
              </div>
              <div class="form-group">
                <label for="cbl-ac-cosphi">Facteur de puissance (cosφ)</label>
                <input type="number" id="cbl-ac-cosphi" min="0.5" max="1" step="0.01" value="1">
              </div>
            </div>

            <details style="margin-bottom:12px">
              <summary style="cursor:pointer;font-size:12px;font-weight:700;color:var(--color-primary)">🔌 Estimer le courant depuis la puissance onduleur</summary>
              <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div class="form-group">
                  <label for="cbl-ac-p">Puissance AC onduleur</label>
                  <div class="input-unit"><input type="number" id="cbl-ac-p" min="0" step="100" placeholder="ex : 3000"><span class="unit-tag">W</span></div>
                </div>
                <div class="form-group">
                  <label for="cbl-ac-dist">Distance onduleur → tableau</label>
                  <div class="input-unit"><input type="number" id="cbl-ac-dist" min="0" step="0.5" value="5"><span class="unit-tag">m</span></div>
                </div>
              </div>
              <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
                <button type="button" class="btn btn-outline btn-sm" onclick="CablesUI.estimateAcCurrent()">↓ Estimer le courant I</button>
                <button type="button" class="btn btn-outline btn-sm" onclick="CablesUI.estimateAcLength()">↓ Estimer la longueur aller</button>
              </div>
            </details>

            <hr>

            <div class="form-row" style="gap:8px;margin-bottom:10px">
              <div class="form-group">
                <label for="cbl-ac-i">Courant AC I</label>
                <div class="input-unit"><input type="number" id="cbl-ac-i" min="0" step="0.1" placeholder="ex : 13"><span class="unit-tag">A</span></div>
              </div>
              <div class="form-group">
                <label for="cbl-ac-l">Longueur aller L</label>
                <div class="input-unit"><input type="number" id="cbl-ac-l" min="0" step="0.5" placeholder="ex : 6"><span class="unit-tag">m</span></div>
              </div>
            </div>
            <div class="form-row" style="gap:8px;margin-bottom:10px">
              <div class="form-group">
                <label for="cbl-ac-u">Tension système</label>
                <div class="input-unit"><input type="number" id="cbl-ac-u" min="1" step="1" value="230"><span class="unit-tag">V</span></div>
              </div>
              <div class="form-group">
                <label for="cbl-ac-maxdrop">Chute de tension max visée</label>
                <div class="input-unit"><input type="number" id="cbl-ac-maxdrop" min="0.1" step="0.1" value="1.5"><span class="unit-tag">%</span></div>
              </div>
            </div>
            <div class="form-group" style="margin-bottom:4px">
              <label for="cbl-ac-material">Matériau conducteur</label>
              <select id="cbl-ac-material">
                <option value="Cu" selected>Cuivre</option>
                <option value="Al">Aluminium</option>
              </select>
            </div>
          </div>
        </section>

        <button class="btn btn-accent" id="btn-calc-cables" style="width:100%;margin-bottom:8px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4 8h-2v2h-2v-2H9v-2h2V7h2v2h2v2z"/></svg>
          Calculer
        </button>
      </div>

      <!-- Résultats -->
      <div id="cables-results">
        <div class="result-placeholder">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
          <p>Renseignez le DC et l'AC puis cliquez sur <strong>Calculer</strong></p>
        </div>
      </div>

      <div class="ose-journey-nav">
        <button type="button" class="btn btn-outline" onclick="goNextPrimaryTab()">Passer →</button>
        <button type="button" class="btn btn-primary" onclick="goNextPrimaryTab()">Continuer → Devis</button>
      </div>

    </div>`;
}

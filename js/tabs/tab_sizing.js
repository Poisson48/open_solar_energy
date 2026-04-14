/**
 * tab_sizing.js — HTML de l'onglet Dimensionnement EDF
 */
function initTabSizing() {
  document.getElementById('tab-sizing').innerHTML = `
    <div style="display:grid;grid-template-columns:320px 1fr;gap:16px">

      <!-- Formulaire -->
      <div>

        <!-- Facture EDF -->
        <details class="card" open>
          <summary class="card-title" style="cursor:pointer;user-select:none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
            Facture EDF / Enedis
          </summary>
          <div style="margin-top:10px">
            <div class="form-group" style="margin-bottom:8px">
              <label>Type de tarif</label>
              <select id="sz-tariff">
                <option value="base">Tarif Base</option>
                <option value="hphc">Heures Pleines / Heures Creuses</option>
              </select>
            </div>
            <div class="form-row" style="gap:6px;margin-bottom:8px">
              <div class="form-group">
                <label>Prix kWh Base</label>
                <div class="input-unit"><input type="number" id="sz-price-base" value="0.2516" step="0.001"><span class="unit-tag">€</span></div>
              </div>
              <div class="form-group">
                <label>Abonnement</label>
                <div class="input-unit"><input type="number" id="sz-subscription" value="147" step="1"><span class="unit-tag">€/an</span></div>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div style="font-size:12px;font-weight:700;color:var(--color-primary)">Consommation mensuelle (kWh)</div>
              <button type="button" class="btn btn-outline btn-sm" onclick="event.stopPropagation();openEnedisModal()">
                📂 Importer depuis Enedis
              </button>
            </div>
            <div id="sz-csv-status" style="font-size:11px;margin-bottom:6px;display:none"></div>
            <div id="hourly-data-status" style="font-size:11px;color:var(--color-success);margin-bottom:4px"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px">
              <div class="form-group"><label>Jan</label><input type="number" id="sz-kwh-1"  value="320" min="0"></div>
              <div class="form-group"><label>Fév</label><input type="number" id="sz-kwh-2"  value="290" min="0"></div>
              <div class="form-group"><label>Mar</label><input type="number" id="sz-kwh-3"  value="280" min="0"></div>
              <div class="form-group"><label>Avr</label><input type="number" id="sz-kwh-4"  value="240" min="0"></div>
              <div class="form-group"><label>Mai</label><input type="number" id="sz-kwh-5"  value="210" min="0"></div>
              <div class="form-group"><label>Jun</label><input type="number" id="sz-kwh-6"  value="180" min="0"></div>
              <div class="form-group"><label>Jul</label><input type="number" id="sz-kwh-7"  value="170" min="0"></div>
              <div class="form-group"><label>Aoû</label><input type="number" id="sz-kwh-8"  value="175" min="0"></div>
              <div class="form-group"><label>Sep</label><input type="number" id="sz-kwh-9"  value="200" min="0"></div>
              <div class="form-group"><label>Oct</label><input type="number" id="sz-kwh-10" value="250" min="0"></div>
              <div class="form-group"><label>Nov</label><input type="number" id="sz-kwh-11" value="300" min="0"></div>
              <div class="form-group"><label>Déc</label><input type="number" id="sz-kwh-12" value="340" min="0"></div>
            </div>
            <p id="sz-annual-total" style="font-size:12px;font-weight:700;color:var(--color-primary);margin-top:6px;text-align:right"></p>
          </div>
        </details>

        <!-- Toiture -->
        <details class="card" open>
          <summary class="card-title" style="cursor:pointer;user-select:none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
            Toiture et installation
          </summary>
          <div style="margin-top:10px">
            <div class="params-grid">
              <div class="form-group">
                <label>Inclinaison <button type="button" class="btn btn-outline btn-sm" onclick="optimizeTiltFor('sz')" style="padding:1px 7px;font-size:10px;margin-left:4px">⚡ Auto</button></label>
                <div class="input-unit"><input type="number" id="sz-tilt" value="30" min="0" max="90"><span class="unit-tag">°</span></div>
              </div>
              <div class="form-group">
                <label>Azimut <button type="button" class="btn btn-outline btn-sm" onclick="optimizeTiltFor('sz', true)" style="padding:1px 7px;font-size:10px;margin-left:4px">⚡ Auto</button></label>
                <div class="input-unit"><input type="number" id="sz-azimuth" value="0" min="-180" max="180"><span class="unit-tag">°</span></div>
              </div>
              <div class="form-group">
                <label>Surface dispo</label>
                <div class="input-unit"><input type="number" id="sz-surface" value="20" min="1"><span class="unit-tag">m²</span></div>
              </div>
              <div class="form-group">
                <label>Panneaux (Wc)</label>
                <div class="input-unit"><input type="number" id="sz-panel-wp" value="400" step="10"><span class="unit-tag">Wc</span></div>
              </div>
              <div class="form-group">
                <label>Surface panneau</label>
                <div class="input-unit"><input type="number" id="sz-panel-m2" value="1.96" step="0.01"><span class="unit-tag">m²</span></div>
              </div>
              <div class="form-group">
                <label>Pertes système</label>
                <div class="input-unit"><input type="number" id="sz-losses" value="14" min="0" max="30"><span class="unit-tag">%</span></div>
              </div>
            </div>
            <div class="form-group">
              <label>Technologie PV</label>
              <select id="sz-tech">
                <option value="crystSi">Silicium cristallin (c-Si)</option>
                <option value="CIS">CIS / CIGS</option>
                <option value="CdTe">CdTe</option>
              </select>
            </div>
          </div>
        </details>

        <!-- Stratégie -->
        <details class="card" open>
          <summary class="card-title" style="cursor:pointer;user-select:none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>
            Stratégie et économie
          </summary>
          <div style="margin-top:10px">
            <div class="form-group" style="margin-bottom:8px">
              <label>Objectif</label>
              <select id="sz-strategy">
                <option value="autoconso_max">Maximiser l'autoconsommation</option>
                <option value="roi_optimal">Meilleur retour sur investissement</option>
                <option value="bill_coverage_pct">Atteindre un taux de couverture cible</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:8px" id="sz-target-coverage-group">
              <label>Taux de couverture cible</label>
              <div class="input-unit"><input type="number" id="sz-target-coverage" value="60" min="10" max="100"><span class="unit-tag">%</span></div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Coût estimé <span style="font-weight:400;font-size:10px;color:var(--color-text-muted)">(si pas de coût réel)</span></label>
                <div class="input-unit"><input type="number" id="sz-cost-kwp" value="900" step="50"><span class="unit-tag">€/kWc HT</span></div>
              </div>
              <div class="form-group">
                <label>Tarif rachat surplus</label>
                <div class="input-unit"><input type="number" id="sz-feedin" value="0.13" step="0.01"><span class="unit-tag">€/kWh</span></div>
              </div>
            </div>
            <div class="form-group">
              <label>Coût réel total <span style="font-weight:400;font-size:10px;color:var(--color-text-muted)">(optionnel)</span></label>
              <div class="input-unit"><input type="number" id="sz-cost-total" value="" step="100" min="0" placeholder="ex : 8500"><span class="unit-tag">€ TTC</span></div>
            </div>
          </div>
        </details>

        <button class="btn btn-accent" id="btn-calc-sizing" style="width:100%;margin-bottom:8px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4 8h-2v2h-2v-2H9v-2h2V7h2v2h2v2z"/></svg>
          Dimensionner mon installation
        </button>
      </div>

      <!-- Résultats -->
      <div id="sizing-results">
        <div class="result-placeholder">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
          <p>Renseignez vos données de facture<br>puis cliquez sur <strong>Dimensionner</strong></p>
        </div>
      </div>

    </div>`;
}

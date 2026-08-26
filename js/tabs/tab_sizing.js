/**
 * tab_sizing.js - HTML de l'onglet Dimensionnement (parcours étape par étape)
 */
function initTabSizing() {
  document.getElementById('tab-sizing').innerHTML = `
    <div class="ose-wizard-intro">
      <strong>Parcours dimensionnement</strong>
      <span>Suivez les étapes dans l’ordre. Un seul calcul à la fin — pas de chiffres dispersés.</span>
      <span class="ose-wizard-location-note">📍 Avant de calculer : vérifiez le lieu et la météo dans la colonne de gauche — sans eux, le dimensionnement ne peut pas démarrer.</span>
      <span id="ose-demo-prefill-note" class="ose-demo-note" hidden>
        Projet démo : des valeurs sont préremplies (dont la surface). Modifiez-les ou créez un projet « Nouveau » pour partir de zéro.
      </span>
    </div>

    <div class="tab-form-col">
      <div>

        <!-- Étape 1 : consommation -->
        <section class="ose-step card" data-step="1">
          <div class="ose-step-head">
            <span class="ose-step-num">1</span>
            <div>
              <h3 class="ose-step-title">Votre consommation</h3>
              <p class="ose-step-hint">Facture EDF ou export Enedis — base de tout le calcul.</p>
            </div>
          </div>
          <div class="ose-step-body">
            <div class="form-group" style="margin-bottom:8px">
              <label for="sz-tariff">Type de tarif</label>
              <select id="sz-tariff">
                <option value="base">Tarif Base</option>
                <option value="hphc">Heures Pleines / Heures Creuses</option>
              </select>
            </div>
            <div id="sz-price-base-row" class="form-row" style="gap:6px;margin-bottom:8px">
              <div class="form-group">
                <label for="sz-price-base">Prix kWh Base</label>
                <div class="input-unit"><input type="number" id="sz-price-base" value="0.2516" step="0.001"><span class="unit-tag">€</span></div>
              </div>
              <div class="form-group">
                <label for="sz-subscription">Abonnement</label>
                <div class="input-unit"><input type="number" id="sz-subscription" value="147" step="1"><span class="unit-tag">€/an</span></div>
              </div>
            </div>
            <div id="sz-price-hphc-row" class="form-row" style="gap:6px;margin-bottom:8px;display:none">
              <div class="form-group">
                <label for="sz-price-hp">Prix kWh HP</label>
                <div class="input-unit"><input type="number" id="sz-price-hp" value="0.2460" step="0.001"><span class="unit-tag">€</span></div>
              </div>
              <div class="form-group">
                <label for="sz-price-hc">Prix kWh HC</label>
                <div class="input-unit"><input type="number" id="sz-price-hc" value="0.1860" step="0.001"><span class="unit-tag">€</span></div>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;flex-wrap:wrap">
              <div style="font-size:12px;font-weight:700;color:var(--color-primary)">Consommation mensuelle (kWh)</div>
              <button type="button" class="btn btn-outline btn-sm" onclick="event.stopPropagation();openEnedisModal()">
                📂 Importer depuis Enedis
              </button>
            </div>
            <div id="sz-hybrid-enedis-note" class="alert alert-info" style="font-size:11px;margin-bottom:6px;display:none">
              🔋 Batterie hybride : importez si possible le fichier Enedis <strong>30 min</strong> (courbe de charge) plutôt qu'une facture mensuelle — la simulation charge/décharge de la batterie est bien plus précise qu'avec une moyenne mensuelle.
            </div>
            <div id="sz-csv-status" style="font-size:11px;margin-bottom:6px;display:none"></div>
            <div id="hourly-data-status" style="font-size:11px;color:var(--color-success);margin-bottom:4px"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px">
              <div class="form-group"><label for="sz-kwh-1">Jan</label><input type="number" id="sz-kwh-1"  value="" min="0" placeholder="kWh"></div>
              <div class="form-group"><label for="sz-kwh-2">Fév</label><input type="number" id="sz-kwh-2"  value="" min="0" placeholder="kWh"></div>
              <div class="form-group"><label for="sz-kwh-3">Mar</label><input type="number" id="sz-kwh-3"  value="" min="0" placeholder="kWh"></div>
              <div class="form-group"><label for="sz-kwh-4">Avr</label><input type="number" id="sz-kwh-4"  value="" min="0" placeholder="kWh"></div>
              <div class="form-group"><label for="sz-kwh-5">Mai</label><input type="number" id="sz-kwh-5"  value="" min="0" placeholder="kWh"></div>
              <div class="form-group"><label for="sz-kwh-6">Jun</label><input type="number" id="sz-kwh-6"  value="" min="0" placeholder="kWh"></div>
              <div class="form-group"><label for="sz-kwh-7">Jul</label><input type="number" id="sz-kwh-7"  value="" min="0" placeholder="kWh"></div>
              <div class="form-group"><label for="sz-kwh-8">Aoû</label><input type="number" id="sz-kwh-8"  value="" min="0" placeholder="kWh"></div>
              <div class="form-group"><label for="sz-kwh-9">Sep</label><input type="number" id="sz-kwh-9"  value="" min="0" placeholder="kWh"></div>
              <div class="form-group"><label for="sz-kwh-10">Oct</label><input type="number" id="sz-kwh-10" value="" min="0" placeholder="kWh"></div>
              <div class="form-group"><label for="sz-kwh-11">Nov</label><input type="number" id="sz-kwh-11" value="" min="0" placeholder="kWh"></div>
              <div class="form-group"><label for="sz-kwh-12">Déc</label><input type="number" id="sz-kwh-12" value="" min="0" placeholder="kWh"></div>
            </div>
            <p id="sz-annual-total" style="font-size:12px;font-weight:700;color:var(--color-primary);margin-top:6px;text-align:right"></p>
          </div>
        </section>

        <!-- Étape 2 : toiture -->
        <section class="ose-step card" data-step="2">
          <div class="ose-step-head">
            <span class="ose-step-num">2</span>
            <div>
              <h3 class="ose-step-title">Toiture et panneaux</h3>
              <p class="ose-step-hint">Surface dispo + orientation. Lieu = colonne gauche (« Modifier le lieu »). Terrain / ombrage = onglet <strong>Site / Ombrage</strong>.</p>
            </div>
          </div>
          <div class="ose-step-body">
            <div class="form-group" style="margin-bottom:6px">
              <label style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">
                <span>Modèle de panneau</span>
                <span style="display:inline-flex;gap:4px;flex-wrap:wrap;flex-shrink:0">
                  <button type="button" class="btn btn-outline btn-sm" onclick="PanelDB.saveFromForm('sz')" style="padding:2px 8px;font-size:10px">💾 Enregistrer</button>
                  <button type="button" class="btn btn-outline btn-sm" onclick="PanelDB.openLibraryModal('sz')" style="padding:2px 8px;font-size:10px">📋 Bibliothèque</button>
                </span>
              </label>
              <input type="text" id="sz-panel-model" placeholder="ex : Jinko Tiger Neo 415W" style="width:100%">
            </div>
            ${typeof PanelDB !== 'undefined' ? PanelDB.electricalFieldsHTML('sz') : ''}
            <div class="params-grid">
              <div class="form-group">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
                  <label for="sz-tilt" style="margin:0">Inclinaison</label>
                  <button type="button" class="btn btn-outline btn-sm" onclick="optimizeTiltFor('sz')" style="padding:1px 7px;font-size:10px">⚡ Auto</button>
                </div>
                <div class="input-unit"><input type="number" id="sz-tilt" value="30" min="0" max="90"><span class="unit-tag">°</span></div>
              </div>
              <div class="form-group">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
                  <label for="sz-azimuth" style="margin:0">Azimut</label>
                  <button type="button" class="btn btn-outline btn-sm" onclick="optimizeTiltFor('sz', true)" style="padding:1px 7px;font-size:10px">⚡ Auto</button>
                </div>
                <div class="input-unit"><input type="number" id="sz-azimuth" value="0" min="-180" max="180"><span class="unit-tag">°</span></div>
              </div>
              <div class="form-group">
                <label for="sz-surface">Surface dispo <span class="ose-req">*</span></label>
                <div class="input-unit"><input type="number" id="sz-surface" value="" min="1" step="0.1" placeholder="obligatoire" required aria-required="true"><span class="unit-tag">m²</span></div>
                <p class="ose-field-help">Sans surface, le calcul ne démarre pas (aucune valeur inventée).</p>
              </div>
              <div class="form-group">
                <label for="sz-panel-wp">Panneaux (Wc)</label>
                <div class="input-unit"><input type="number" id="sz-panel-wp" value="400" step="10"><span class="unit-tag">Wc</span></div>
              </div>
              <div class="form-group">
                <label for="sz-panel-m2">Surface panneau</label>
                <div class="input-unit"><input type="number" id="sz-panel-m2" value="1.96" step="0.01"><span class="unit-tag">m²</span></div>
              </div>
              <div class="form-group">
                <label for="sz-losses">Pertes système</label>
                <div class="input-unit"><input type="number" id="sz-losses" value="14" min="0" max="30"><span class="unit-tag">%</span></div>
              </div>
            </div>
            <div class="form-group">
              <label for="sz-tech">Technologie PV</label>
              <select id="sz-tech">
                <option value="crystSi">Silicium cristallin (c-Si)</option>
                <option value="CIS">CIS / CIGS</option>
                <option value="CdTe">CdTe</option>
              </select>
            </div>
          </div>
        </section>

        <!-- Étape batterie (hybride uniquement : réseau + stockage) -->
        <section class="ose-step card" id="sz-battery-step" data-step="2b" style="display:none">
          <div class="ose-step-head">
            <span class="ose-step-num">🔋</span>
            <div>
              <h3 class="ose-step-title">Batterie (hybride)</h3>
              <p class="ose-step-hint">Stocke le surplus produit dans la journée pour le restituer le soir, avant injection du reste au réseau.</p>
            </div>
          </div>
          <div class="ose-step-body">
            <div class="params-grid">
              <div class="form-group">
                <label for="sz-batt-tech">Technologie batterie</label>
                <select id="sz-batt-tech">
                  <option value="lfp">LFP — Lithium Fer Phosphate</option>
                  <option value="lfp_diy">LFP DIY — cellules CATL / EVE</option>
                  <option value="agm">AGM — plomb carbone</option>
                  <option value="nmc_leaf">NMC — Nissan Leaf (recond.)</option>
                  <option value="nmc_zoe">NMC — Renault Zoé (recond.)</option>
                  <option value="nmc_tesla">NMC — Tesla (recond.)</option>
                </select>
              </div>
              <div class="form-group">
                <label for="sz-batt-kwh">Capacité batterie</label>
                <div class="input-unit"><input type="number" id="sz-batt-kwh" value="5" min="0" step="0.5"><span class="unit-tag">kWh</span></div>
              </div>
            </div>
            <div id="sz-batt-info" class="alert alert-info" style="font-size:11px;margin-top:4px"></div>
            <p class="ose-field-help">Capacité <strong>brute</strong> installée. La capacité réellement <strong>utile</strong> (après DoD, calculée ci-dessus) sert à la simulation. Son coût est ajouté au coût système pour le calcul ROI/VAN. Contrairement au hors-réseau, cette capacité est fixe (pas de recherche automatique).</p>
          </div>
        </section>

        <!-- Étape 3 : objectif -->
        <section class="ose-step card" data-step="3">
          <div class="ose-step-head">
            <span class="ose-step-num">3</span>
            <div>
              <h3 class="ose-step-title">Votre objectif</h3>
              <p class="ose-step-hint">Choisissez <em>une</em> cible. Autoconso ≠ couverture de facture.</p>
            </div>
          </div>
          <div class="ose-step-body">
            <input type="hidden" id="sz-strategy" value="autoconso_pct">
            <div class="ose-goal-cards" id="sz-goal-cards" role="radiogroup" aria-label="Objectif de dimensionnement">
              <button type="button" class="ose-goal-card active" data-strategy="autoconso_pct" aria-pressed="true">
                <strong>Autoconsommation cible</strong>
                <span>Ex. 90 % : presque toute la production est consommée chez vous (souvent installation plus petite).</span>
              </button>
              <button type="button" class="ose-goal-card" data-strategy="bill_coverage_pct" aria-pressed="false">
                <strong>Couverture de facture</strong>
                <span>Ex. 70 % : l’électricité PV couvre 70 % de votre conso annuelle (souvent plus de panneaux).</span>
              </button>
              <button type="button" class="ose-goal-card" data-strategy="roi_optimal" aria-pressed="false">
                <strong>Meilleur retour sur investissement</strong>
                <span>Équilibre économique (temps de retour / VAN) — pas un % fixe.</span>
              </button>
              <button type="button" class="ose-goal-card" data-strategy="autoconso_max" aria-pressed="false">
                <strong>Max. kWh autoconsommés</strong>
                <span>Maximise les kWh consommés sur place sans viser un % précis.</span>
              </button>
            </div>

            <div class="form-group" style="margin-top:12px" id="sz-target-coverage-group">
              <label for="sz-target-coverage" id="sz-target-coverage-label">Taux d’autoconsommation cible</label>
              <div class="input-unit"><input type="number" id="sz-target-coverage" value="90" min="10" max="100"><span class="unit-tag">%</span></div>
              <p id="sz-target-help" class="ose-field-help">Sans batterie, 90&nbsp;% d’autoconso est réaliste avec une petite puissance. 90&nbsp;% de couverture de facture est un autre objectif.</p>
            </div>

            <details class="ose-advanced-block">
              <summary>Coûts et hypothèses financières (optionnel)</summary>
              <div class="form-row" style="margin-top:10px">
                <div class="form-group">
                  <label for="sz-cost-kwp">Coût estimé</label>
                  <div class="input-unit"><input type="number" id="sz-cost-kwp" value="900" step="50"><span class="unit-tag">€/kWc HT</span></div>
                </div>
                <div class="form-group">
                  <label for="sz-feedin">Tarif rachat surplus</label>
                  <div class="input-unit"><input type="number" id="sz-feedin" value="0.13" step="0.01"><span class="unit-tag">€/kWh</span></div>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="sz-elec-escalation">Hausse prix électricité</label>
                  <div class="input-unit"><input type="number" id="sz-elec-escalation" value="3" min="0" max="20" step="0.5"><span class="unit-tag">%/an</span></div>
                </div>
                <div class="form-group">
                  <label for="sz-discount-rate">Taux d’actualisation</label>
                  <div class="input-unit"><input type="number" id="sz-discount-rate" value="4" min="0" max="20" step="0.5"><span class="unit-tag">%/an</span></div>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="sz-panel-degradation">Dégradation panneaux</label>
                  <div class="input-unit"><input type="number" id="sz-panel-degradation" value="0.5" min="0" max="5" step="0.1"><span class="unit-tag">%/an</span></div>
                </div>
                <div class="form-group">
                  <label for="sz-finance-years">Horizon d’analyse</label>
                  <div class="input-unit"><input type="number" id="sz-finance-years" value="25" min="5" max="40" step="1"><span class="unit-tag">ans</span></div>
                </div>
              </div>
              <div class="form-group">
                <label for="sz-cost-total">Coût réel total (optionnel)</label>
                <div class="input-unit"><input type="number" id="sz-cost-total" value="" step="100" min="0" placeholder="ex : 8500"><span class="unit-tag">€ TTC</span></div>
              </div>
              <div class="form-row" style="margin-top:8px">
                <div class="form-group" style="flex:1.2">
                  <label for="sz-incentive-mode">Prime d’État (autoconsommation)</label>
                  <select id="sz-incentive-mode" onchange="typeof syncIncentiveModeUI==='function'&&syncIncentiveModeUI()">
                    <option value="auto">Barème auto (indicatif)</option>
                    <option value="manual">Montant manuel</option>
                    <option value="none">Sans prime</option>
                  </select>
                  <p class="ose-field-help" id="sz-incentive-help">Le barème change chaque trimestre (energie.gouv.fr). Choisissez « Montant manuel » pour coller à votre devis / arrêté en vigueur.</p>
                </div>
                <div class="form-group" id="sz-incentive-manual-wrap" style="display:none;flex:1">
                  <label for="sz-incentive">Montant de la prime</label>
                  <div class="input-unit"><input type="number" id="sz-incentive" value="" min="0" step="50" placeholder="ex : 1200"><span class="unit-tag">€</span></div>
                </div>
              </div>
            </details>
          </div>
        </section>

        <!-- Étape 4 : lancer -->
        <section class="ose-step card ose-step-action" data-step="4">
          <div class="ose-step-head">
            <span class="ose-step-num">4</span>
            <div>
              <h3 class="ose-step-title">Calculer</h3>
              <p class="ose-step-hint">Lieu + météo (colonne gauche) et étapes 1 → 3 validés ? Lancez le dimensionnement.</p>
            </div>
          </div>
          <button class="btn btn-accent" id="btn-calc-sizing" style="width:100%">
            Dimensionner mon installation
          </button>
        </section>
      </div>

      <div id="sizing-results">
        <div class="result-placeholder">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
          <p>Lieu + météo à gauche, étapes 1 → 3 ci-contre, puis <strong>Dimensionner</strong>.<br>Les deux taux (autoconso et couverture) seront affichés clairement.</p>
        </div>
      </div>
    </div>`;
}

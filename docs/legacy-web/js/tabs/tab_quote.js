/**
 * tab_quote.js - HTML de l'onglet Devis professionnel
 */
function initTabQuote() {
  document.getElementById('tab-quote').innerHTML = `
    <div class="tab-form-col-half">

      <!-- Colonne gauche -->
      <div style="display:flex;flex-direction:column;gap:12px">

        <!-- Installateur -->
        <details class="card" open>
          <summary class="card-title" style="cursor:pointer;user-select:none">🏢 Installateur (votre société)</summary>
          <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group" style="grid-column:1/-1">
              <label for="dv-ins-company">Nom de la société</label>
              <input type="text" id="dv-ins-company" placeholder="Solar Pro SARL">
            </div>
            <div class="form-group">
              <label for="dv-ins-siret">SIRET</label>
              <input type="text" id="dv-ins-siret" placeholder="000 000 000 00000">
            </div>
            <div class="form-group">
              <label for="dv-ins-rge">N° RGE</label>
              <input type="text" id="dv-ins-rge" placeholder="E-E190909-1234">
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label for="dv-ins-address">Adresse</label>
              <textarea id="dv-ins-address" rows="2" placeholder="12 rue du Soleil&#10;31000 Toulouse"></textarea>
            </div>
            <div class="form-group">
              <label for="dv-ins-phone">Téléphone</label>
              <input type="tel" id="dv-ins-phone" placeholder="05 61 00 00 00">
            </div>
            <div class="form-group">
              <label for="dv-ins-email">Email</label>
              <input type="email" id="dv-ins-email" placeholder="contact@solarpro.fr">
            </div>
          </div>
        </details>

        <!-- Client -->
        <details class="card" open>
          <summary class="card-title" style="cursor:pointer;user-select:none">👤 Client</summary>
          <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group">
              <label for="dv-cli-name">Nom / Prénom</label>
              <input type="text" id="dv-cli-name" placeholder="Jean Dupont">
            </div>
            <div class="form-group">
              <label for="dv-cli-company">Société (si pro)</label>
              <input type="text" id="dv-cli-company" placeholder="">
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label for="dv-cli-address">Adresse</label>
              <textarea id="dv-cli-address" rows="2" placeholder="5 impasse des Collines&#10;31500 Toulouse"></textarea>
            </div>
            <div class="form-group">
              <label for="dv-cli-phone">Téléphone</label>
              <input type="tel" id="dv-cli-phone" placeholder="06 12 34 56 78">
            </div>
            <div class="form-group">
              <label for="dv-cli-email">Email</label>
              <input type="email" id="dv-cli-email" placeholder="client@mail.fr">
            </div>
          </div>
        </details>

        <!-- Chantier -->
        <details class="card" open>
          <summary class="card-title" style="cursor:pointer;user-select:none">📍 Site d'installation</summary>
          <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group" style="grid-column:1/-1">
              <label for="dv-site-address">Adresse du chantier</label>
              <input type="text" id="dv-site-address" placeholder="Identique au client ou autre adresse">
            </div>
            <div class="form-group">
              <label for="dv-site-type">Type de toiture</label>
              <select id="dv-site-type">
                <option value="">Sélectionner…</option>
                <option>Tuiles mécaniques</option>
                <option>Tuiles plates</option>
                <option>Ardoises</option>
                <option>Bac acier</option>
                <option>Membrane EPDM</option>
                <option>Sol / Auvent</option>
                <option>Autre</option>
              </select>
            </div>
            <div class="form-group">
              <label for="dv-site-surface">Surface disponible</label>
              <div class="input-unit"><input type="number" id="dv-site-surface" placeholder="20"><span class="unit-tag">m²</span></div>
            </div>
            <div class="form-group">
              <label for="dv-site-tilt">Inclinaison</label>
              <div class="input-unit"><input type="number" id="dv-site-tilt" placeholder="30"><span class="unit-tag">°</span></div>
            </div>
            <div class="form-group">
              <label for="dv-site-azimuth">Azimut (0=Sud)</label>
              <div class="input-unit"><input type="number" id="dv-site-azimuth" placeholder="0"><span class="unit-tag">°</span></div>
            </div>
          </div>
        </details>

        <!-- Système PV -->
        <details class="card" open>
          <summary class="card-title" style="cursor:pointer;user-select:none">
            ⚡ Système photovoltaïque
            <button type="button" class="btn btn-outline btn-sm" onclick="event.stopPropagation();importSizingToQuote()" style="margin-left:8px;padding:2px 8px;font-size:10px">↓ Importer depuis le dimensionnement</button>
          </summary>
          <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group">
              <label for="dv-sys-ppeak">Puissance crête (kWc)</label>
              <div class="input-unit"><input type="number" id="dv-sys-ppeak" step="0.1" placeholder="3.0"><span class="unit-tag">kWc</span></div>
            </div>
            <div class="form-group">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
                <label for="dv-sys-panels" style="margin:0">Nombre de panneaux</label>
                <span style="display:inline-flex;gap:2px">
                  <button type="button" id="dv-pmode-surface" class="btn btn-outline btn-sm" onclick="setPanelMode('dv','surface')" style="padding:1px 6px;font-size:10px" title="Depuis la surface du chantier">🏠</button>
                  <button type="button" id="dv-pmode-conso"   class="btn btn-outline btn-sm" onclick="setPanelMode('dv','conso')"   style="padding:1px 6px;font-size:10px" title="Depuis le dimensionnement">⚡</button>
                  <button type="button" id="dv-pmode-fixe"    class="btn btn-outline btn-sm active" onclick="setPanelMode('dv','fixe')" style="padding:1px 6px;font-size:10px" title="Valeur manuelle">✏️</button>
                </span>
              </div>
              <input type="number" id="dv-sys-panels" placeholder="8">
            </div>
            <div class="form-group">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;gap:6px">
                <label for="dv-sys-panel-model" style="margin:0">Modèle panneau</label>
                <button type="button" class="btn btn-outline btn-sm" onclick="PanelDB.openLibraryModal('dv')" style="padding:1px 7px;font-size:10px" title="Bibliothèque panneaux">📋</button>
              </div>
              <input type="text" id="dv-sys-panel-model" placeholder="Jinko Tiger 400W">
            </div>
            <div class="form-group">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;gap:6px">
                <label for="dv-sys-inverter" style="margin:0">Onduleur</label>
                <button type="button" class="btn btn-outline btn-sm" onclick="InverterDB.openLibraryModal('dv')" style="padding:1px 7px;font-size:10px" title="Bibliothèque onduleurs">🔌</button>
              </div>
              <input type="text" id="dv-sys-inverter" placeholder="Fronius Primo 3.0">
            </div>
            <div class="form-group">
              <label for="dv-sys-batt">Batterie</label>
              <div class="input-unit"><input type="number" id="dv-sys-batt" step="0.1" placeholder="0"><span class="unit-tag">kWh</span></div>
            </div>
            <div class="form-group">
              <label for="dv-sys-prod">Production annuelle</label>
              <div class="input-unit"><input type="number" id="dv-sys-prod" placeholder="3500"><span class="unit-tag">kWh/an</span></div>
            </div>
            <div class="form-group">
              <label for="dv-sys-co2">CO₂ évité</label>
              <div class="input-unit"><input type="number" id="dv-sys-co2" placeholder="0"><span class="unit-tag">kg/an</span></div>
            </div>
            <div class="form-group">
              <label for="dv-sys-autonomy">Autonomie estimée</label>
              <input type="text" id="dv-sys-autonomy" placeholder="Ex : 80 % de l'année">
            </div>
          </div>
        </details>

      </div><!-- /colonne gauche -->

      <!-- Colonne droite -->
      <div style="display:flex;flex-direction:column;gap:12px">

        <!-- Lignes de coût -->
        <details class="card" open>
          <summary class="card-title" style="cursor:pointer;user-select:none">💶 Détail du prix (HT)</summary>
          <div style="margin-top:10px">
            <p class="ose-field-help" style="margin:0 0 8px">Modifiez les lignes (onduleur, câbles, main d’œuvre…) ou ajoutez-en autant que vous voulez.</p>
            <div class="dv-lines-scroll">
            <table class="dv-lines-table" style="width:100%;border-collapse:collapse;font-size:12px">
              <thead>
                <tr style="border-bottom:2px solid var(--color-border)">
                  <th style="text-align:left;padding:4px 6px;width:34%">Désignation</th>
                  <th style="text-align:center;padding:4px 6px;width:10%">Qté</th>
                  <th style="text-align:center;padding:4px 6px;width:12%">Unité</th>
                  <th style="text-align:right;padding:4px 6px;width:18%">Prix unit. HT</th>
                  <th style="text-align:right;padding:4px 6px;width:18%">Montant HT</th>
                  <th style="width:8%"></th>
                </tr>
              </thead>
              <tbody id="dv-lines-body"></tbody>
            </table>
            </div>
            <div id="dv-lines-actions" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;align-items:center">
              <button type="button" class="btn btn-accent btn-sm" onclick="QuoteLines.add()">+ Ajouter une ligne</button>
              <button type="button" class="btn btn-outline btn-sm" onclick="QuoteLines.addPreset('battery')">+ Batterie</button>
              <button type="button" class="btn btn-outline btn-sm" onclick="QuoteLines.addPreset('optimizers')">+ Optimiseurs</button>
              <button type="button" class="btn btn-outline btn-sm" onclick="QuoteLines.addPreset('monitoring')">+ Monitoring</button>
              <button type="button" class="btn btn-outline btn-sm" onclick="QuoteLines.addPreset('transport')">+ Transport</button>
              <button type="button" class="btn btn-outline btn-sm" onclick="QuoteLines.addPreset('scaffold')">+ Échafaudage</button>
            </div>
            <input type="hidden" id="dv-quote-lines-json" value="">

            <div style="margin-top:12px;border-top:2px solid var(--color-border);padding-top:10px">
              <div style="display:flex;justify-content:flex-end">
                <table style="width:min(280px,100%);font-size:13px">
                  <tr>
                    <td style="padding:3px 8px">Sous-total HT</td>
                    <td id="dv-total-ht" style="text-align:right;padding:3px 8px;font-weight:600">0 €</td>
                  </tr>
                  <tr id="dv-remise-row" style="color:var(--color-danger);display:none">
                    <td style="padding:3px 8px">Remise (<span id="dv-remise-pct">0</span>%)</td>
                    <td id="dv-total-remise" style="text-align:right;padding:3px 8px">- €</td>
                  </tr>
                  <tr>
                    <td style="padding:3px 8px">Base HT</td>
                    <td id="dv-base-ht" style="text-align:right;padding:3px 8px;font-weight:600">0 €</td>
                  </tr>
                  <tr>
                    <td style="padding:3px 8px">TVA (<span id="dv-tva-pct">10</span>%)</td>
                    <td id="dv-total-tva" style="text-align:right;padding:3px 8px">0 €</td>
                  </tr>
                  <tr style="background:var(--color-primary);color:#fff;border-radius:4px">
                    <td style="padding:6px 8px;font-weight:700;font-size:14px">TOTAL TTC</td>
                    <td id="dv-total-ttc" style="text-align:right;padding:6px 8px;font-weight:700;font-size:14px">0 €</td>
                  </tr>
                </table>
              </div>
            </div>
          </div>
        </details>

        <!-- Conditions -->
        <details class="card" open>
          <summary class="card-title" style="cursor:pointer;user-select:none">📋 Conditions du devis</summary>
          <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div class="form-group">
              <label for="dv-date">Date</label>
              <input type="text" id="dv-date" placeholder="JJ/MM/AAAA">
            </div>
            <div class="form-group">
              <label for="dv-ref">Référence</label>
              <input type="text" id="dv-ref" placeholder="Auto si vide">
            </div>
            <div class="form-group">
              <label for="dv-validity">Validité (jours)</label>
              <input type="number" id="dv-validity" value="30" min="1">
            </div>
            <div class="form-group">
              <label for="dv-tva">TVA applicable</label>
              <select id="dv-tva" onchange="updateQuoteTotals()">
                <option value="10" selected>10 % - Rénovation résidentielle</option>
                <option value="5.5">5,5 % - Amélioration énergie</option>
                <option value="20">20 % - Neuf / Pro</option>
              </select>
            </div>
            <div class="form-group">
              <label for="dv-remise">Remise (%)</label>
              <div class="input-unit"><input type="number" id="dv-remise" value="0" min="0" max="100" step="0.5" oninput="updateQuoteTotals()"><span class="unit-tag">%</span></div>
            </div>
          </div>
          <div class="form-group" style="margin-top:8px">
            <label for="dv-notes">Notes / conditions particulières</label>
            <textarea id="dv-notes" rows="3" placeholder="Ex : Acompte 30% à la commande. Garantie main d'œuvre 10 ans."></textarea>
          </div>
        </details>

        <!-- Actions -->
        <div class="card" style="padding:12px 14px">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button class="btn btn-accent" onclick="printQuote()">📄 Télécharger PDF</button>
            <button class="btn btn-outline" onclick="previewQuote()">👁 Aperçu</button>
            <button class="btn btn-outline btn-sm" onclick="saveInstallerData()">💾 Mémoriser installateur</button>
          </div>
        </div>

        <!-- Aperçu -->
        <div class="card" style="padding:8px">
          <div class="card-title" style="margin-bottom:8px">Aperçu</div>
          <iframe id="dv-preview-frame" style="width:100%;height:600px;border:1px solid var(--color-border);border-radius:4px;background:#fff" srcdoc="<p style='padding:20px;color:#999;font-family:sans-serif'>Cliquez sur Aperçu pour voir le devis.</p>"></iframe>
        </div>

      </div><!-- /colonne droite -->

    </div>`;
}

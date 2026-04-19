/**
 * tab_quote.js — HTML de l'onglet Devis professionnel
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
            <button type="button" class="btn btn-outline btn-sm" onclick="importSizingToQuote()" style="margin-left:8px;padding:2px 8px;font-size:10px">↓ Importer depuis le dimensionnement</button>
          </summary>
          <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group">
              <label for="dv-sys-ppeak">Puissance crête (kWc)</label>
              <div class="input-unit"><input type="number" id="dv-sys-ppeak" step="0.1" placeholder="3.0"><span class="unit-tag">kWc</span></div>
            </div>
            <div class="form-group">
              <label for="dv-sys-panels">Nombre de panneaux</label>
              <input type="number" id="dv-sys-panels" placeholder="8">
            </div>
            <div class="form-group">
              <label for="dv-sys-panel-model">Modèle panneau</label>
              <input type="text" id="dv-sys-panel-model" placeholder="Jinko Tiger 400W">
            </div>
            <div class="form-group">
              <label for="dv-sys-inverter">Onduleur</label>
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
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead>
                <tr style="border-bottom:2px solid var(--color-border)">
                  <th style="text-align:left;padding:4px 6px;width:36%">Désignation</th>
                  <th style="text-align:center;padding:4px 6px;width:10%">Qté</th>
                  <th style="text-align:center;padding:4px 6px;width:12%">Unité</th>
                  <th style="text-align:right;padding:4px 6px;width:20%">Prix unit. HT</th>
                  <th style="text-align:right;padding:4px 6px;width:22%">Montant HT</th>
                </tr>
              </thead>
              <tbody id="dv-lines-body">
                <tr class="dv-cost-row">
                  <td><input type="text" id="dv-line-panels-label" value="Panneaux photovoltaïques" style="width:100%;border:none;background:transparent;font-size:12px"></td>
                  <td><input type="number" id="dv-line-panels-qty" value="8" min="0" style="width:100%;border:none;background:transparent;font-size:12px;text-align:center" oninput="updateQuoteLine('panels')"></td>
                  <td><input type="text" id="dv-line-panels-unit" value="u" style="width:100%;border:none;background:transparent;font-size:12px;text-align:center"></td>
                  <td><input type="number" id="dv-line-panels-price" value="180" min="0" style="width:100%;border:none;background:transparent;font-size:12px;text-align:right" oninput="updateQuoteLine('panels')"></td>
                  <td id="dv-line-panels-total" style="text-align:right;padding:4px 6px;font-weight:600">1 440 €</td>
                </tr>
                <tr class="dv-cost-row">
                  <td><input type="text" id="dv-line-inverter-label" value="Onduleur" style="width:100%;border:none;background:transparent;font-size:12px"></td>
                  <td><input type="number" id="dv-line-inverter-qty" value="1" min="0" style="width:100%;border:none;background:transparent;font-size:12px;text-align:center" oninput="updateQuoteLine('inverter')"></td>
                  <td><input type="text" id="dv-line-inverter-unit" value="u" style="width:100%;border:none;background:transparent;font-size:12px;text-align:center"></td>
                  <td><input type="number" id="dv-line-inverter-price" value="900" min="0" style="width:100%;border:none;background:transparent;font-size:12px;text-align:right" oninput="updateQuoteLine('inverter')"></td>
                  <td id="dv-line-inverter-total" style="text-align:right;padding:4px 6px;font-weight:600">900 €</td>
                </tr>
                <tr class="dv-cost-row">
                  <td><input type="text" id="dv-line-fixations-label" value="Fixations / structure" style="width:100%;border:none;background:transparent;font-size:12px"></td>
                  <td><input type="number" id="dv-line-fixations-qty" value="1" min="0" style="width:100%;border:none;background:transparent;font-size:12px;text-align:center" oninput="updateQuoteLine('fixations')"></td>
                  <td><input type="text" id="dv-line-fixations-unit" value="forfait" style="width:100%;border:none;background:transparent;font-size:12px;text-align:center"></td>
                  <td><input type="number" id="dv-line-fixations-price" value="350" min="0" style="width:100%;border:none;background:transparent;font-size:12px;text-align:right" oninput="updateQuoteLine('fixations')"></td>
                  <td id="dv-line-fixations-total" style="text-align:right;padding:4px 6px;font-weight:600">350 €</td>
                </tr>
                <tr class="dv-cost-row">
                  <td><input type="text" id="dv-line-cabling-label" value="Câblage DC/AC + protections" style="width:100%;border:none;background:transparent;font-size:12px"></td>
                  <td><input type="number" id="dv-line-cabling-qty" value="1" min="0" style="width:100%;border:none;background:transparent;font-size:12px;text-align:center" oninput="updateQuoteLine('cabling')"></td>
                  <td><input type="text" id="dv-line-cabling-unit" value="forfait" style="width:100%;border:none;background:transparent;font-size:12px;text-align:center"></td>
                  <td><input type="number" id="dv-line-cabling-price" value="250" min="0" style="width:100%;border:none;background:transparent;font-size:12px;text-align:right" oninput="updateQuoteLine('cabling')"></td>
                  <td id="dv-line-cabling-total" style="text-align:right;padding:4px 6px;font-weight:600">250 €</td>
                </tr>
                <tr class="dv-cost-row">
                  <td><input type="text" id="dv-line-labor-label" value="Main d'œuvre pose" style="width:100%;border:none;background:transparent;font-size:12px"></td>
                  <td><input type="number" id="dv-line-labor-qty" value="2" min="0" style="width:100%;border:none;background:transparent;font-size:12px;text-align:center" oninput="updateQuoteLine('labor')"></td>
                  <td><input type="text" id="dv-line-labor-unit" value="jours" style="width:100%;border:none;background:transparent;font-size:12px;text-align:center"></td>
                  <td><input type="number" id="dv-line-labor-price" value="400" min="0" style="width:100%;border:none;background:transparent;font-size:12px;text-align:right" oninput="updateQuoteLine('labor')"></td>
                  <td id="dv-line-labor-total" style="text-align:right;padding:4px 6px;font-weight:600">800 €</td>
                </tr>
                <tr class="dv-cost-row">
                  <td><input type="text" id="dv-line-admin-label" value="Démarches administratives" style="width:100%;border:none;background:transparent;font-size:12px"></td>
                  <td><input type="number" id="dv-line-admin-qty" value="1" min="0" style="width:100%;border:none;background:transparent;font-size:12px;text-align:center" oninput="updateQuoteLine('admin')"></td>
                  <td><input type="text" id="dv-line-admin-unit" value="forfait" style="width:100%;border:none;background:transparent;font-size:12px;text-align:center"></td>
                  <td><input type="number" id="dv-line-admin-price" value="200" min="0" style="width:100%;border:none;background:transparent;font-size:12px;text-align:right" oninput="updateQuoteLine('admin')"></td>
                  <td id="dv-line-admin-total" style="text-align:right;padding:4px 6px;font-weight:600">200 €</td>
                </tr>
                <tr class="dv-cost-row">
                  <td><input type="text" id="dv-line-misc-label" value="" placeholder="Ligne optionnelle" style="width:100%;border:none;background:transparent;font-size:12px"></td>
                  <td><input type="number" id="dv-line-misc-qty" value="0" min="0" style="width:100%;border:none;background:transparent;font-size:12px;text-align:center" oninput="updateQuoteLine('misc')"></td>
                  <td><input type="text" id="dv-line-misc-unit" value="" style="width:100%;border:none;background:transparent;font-size:12px;text-align:center"></td>
                  <td><input type="number" id="dv-line-misc-price" value="0" min="0" style="width:100%;border:none;background:transparent;font-size:12px;text-align:right" oninput="updateQuoteLine('misc')"></td>
                  <td id="dv-line-misc-total" style="text-align:right;padding:4px 6px;font-weight:600">—</td>
                </tr>
              </tbody>
            </table>

            <div style="margin-top:12px;border-top:2px solid var(--color-border);padding-top:10px">
              <div style="display:flex;justify-content:flex-end">
                <table style="width:280px;font-size:13px">
                  <tr>
                    <td style="padding:3px 8px">Sous-total HT</td>
                    <td id="dv-total-ht" style="text-align:right;padding:3px 8px;font-weight:600">3 940 €</td>
                  </tr>
                  <tr id="dv-remise-row" style="color:var(--color-danger);display:none">
                    <td style="padding:3px 8px">Remise (<span id="dv-remise-pct">0</span>%)</td>
                    <td id="dv-total-remise" style="text-align:right;padding:3px 8px">— €</td>
                  </tr>
                  <tr>
                    <td style="padding:3px 8px">Base HT</td>
                    <td id="dv-base-ht" style="text-align:right;padding:3px 8px;font-weight:600">3 940 €</td>
                  </tr>
                  <tr>
                    <td style="padding:3px 8px">TVA (<span id="dv-tva-pct">10</span>%)</td>
                    <td id="dv-total-tva" style="text-align:right;padding:3px 8px">394 €</td>
                  </tr>
                  <tr style="background:var(--color-primary);color:#fff;border-radius:4px">
                    <td style="padding:6px 8px;font-weight:700;font-size:14px">TOTAL TTC</td>
                    <td id="dv-total-ttc" style="text-align:right;padding:6px 8px;font-weight:700;font-size:14px">4 334 €</td>
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
                <option value="10" selected>10 % — Rénovation résidentielle</option>
                <option value="5.5">5,5 % — Amélioration énergie</option>
                <option value="20">20 % — Neuf / Pro</option>
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
            <button class="btn btn-accent" onclick="printQuote()">🖨 Imprimer / PDF</button>
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

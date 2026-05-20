/**
 * tab_daily.js - HTML de l'onglet Données horaires + analyse EDF 30min
 */
function initTabDaily() {
  document.getElementById('tab-daily').innerHTML = `
    <div class="tab-form-col">

      <!-- Paramètres -->
      <div>
        <div class="card">
          <div class="card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>
            Analyse horaire
          </div>

          <div class="alert alert-info" style="font-size:11px;margin-bottom:10px">
            Importez vos données Enedis (30min) depuis l'onglet <strong>Dimensionnement</strong> pour une analyse précise. Sinon, un profil synthétique est utilisé.
          </div>

          <div id="hourly-source-status" style="font-size:12px;margin-bottom:10px;padding:6px;border-radius:4px;background:var(--color-bg)">
            ⏳ En attente de données…
          </div>

          <div class="form-group" style="margin-bottom:8px">
            <label for="hourly-month">Mois à analyser</label>
            <select id="hourly-month">
              <option value="1">Janvier</option><option value="2">Février</option>
              <option value="3">Mars</option><option value="4">Avril</option>
              <option value="5">Mai</option><option value="6" selected>Juin</option>
              <option value="7">Juillet</option><option value="8">Août</option>
              <option value="9">Septembre</option><option value="10">Octobre</option>
              <option value="11">Novembre</option><option value="12">Décembre</option>
            </select>
          </div>

          <hr style="margin:10px 0">
          <div class="card-title" style="font-size:12px;margin-bottom:8px">Système PV (pour simulation)</div>

          <div class="form-group" style="margin-bottom:8px">
            <label for="hourly-ppeak">Puissance PV</label>
            <div class="input-unit"><input type="number" id="hourly-ppeak" value="3" step="0.5" min="0.1"><span class="unit-tag">kWc</span></div>
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label for="hourly-batt">Batterie</label>
            <div class="input-unit"><input type="number" id="hourly-batt" value="0" step="0.5" min="0"><span class="unit-tag">kWh</span></div>
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label for="hourly-dod">DoD batterie</label>
            <div class="input-unit"><input type="number" id="hourly-dod" value="80" step="5" min="20" max="100"><span class="unit-tag">%</span></div>
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label for="hourly-tilt">Inclinaison</label>
            <div class="input-unit"><input type="number" id="hourly-tilt" value="30" min="0" max="90"><span class="unit-tag">°</span></div>
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label for="hourly-azimuth">Azimut</label>
            <div class="input-unit"><input type="number" id="hourly-azimuth" value="0" min="-180" max="180"><span class="unit-tag">°</span></div>
          </div>

          <button class="btn btn-accent" id="btn-calc-hourly" style="width:100%">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>
            Analyser
          </button>
        </div>

        <!-- Durée d'ensoleillement -->
        <div class="card" style="margin-top:12px">
          <div class="card-title" style="font-size:12px">Durée d'ensoleillement mensuelle</div>
          <div id="daylight-table" style="margin-top:8px"></div>
        </div>
      </div>

      <!-- Résultats -->
      <div id="hourly-results">
        <div class="result-placeholder">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>
          <p>Sélectionnez un mois et cliquez sur <strong>Analyser</strong><br>
          <span style="font-size:11px;color:var(--color-text-muted)">Données Enedis 30min recommandées pour une analyse précise</span></p>
        </div>
      </div>

    </div>`;
}

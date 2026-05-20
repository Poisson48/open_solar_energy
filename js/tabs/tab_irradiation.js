/**
 * tab_irradiation.js - HTML de l'onglet Données mensuelles
 */
function initTabIrradiation() {
  document.getElementById('tab-irradiation').innerHTML = `
    <div style="margin-bottom:12px;display:flex;gap:10px;align-items:center">
      <button class="btn btn-accent" id="btn-calc-irr">Afficher les données</button>
      <span style="font-size:12px;color:var(--color-text-muted)">Irradiation et température pour le site sélectionné</span>
    </div>
    <div id="irradiation-results">
      <div class="result-placeholder">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>
        <p>Sélectionnez un lieu et cliquez sur <strong>Afficher les données</strong></p>
      </div>
    </div>`;
}

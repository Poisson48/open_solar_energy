/**
 * tab_optimizer.js — HTML de l'onglet Optimisation
 */
function initTabOptimizer() {
  document.getElementById('tab-optimizer').innerHTML = `
    <div style="margin-bottom:12px;display:flex;gap:10px;align-items:center">
      <button class="btn btn-accent" id="btn-calc-opt">Calculer l'optimum</button>
      <span style="font-size:12px;color:var(--color-text-muted)">Carte de chaleur production par inclinaison et azimut</span>
    </div>
    <div id="optimizer-results">
      <div class="result-placeholder">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        <p>Cliquez sur <strong>Calculer l'optimum</strong> pour générer la carte de chaleur</p>
      </div>
    </div>`;
}

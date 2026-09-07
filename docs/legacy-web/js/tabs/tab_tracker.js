/**
 * tab_tracker.js - HTML de l'onglet Suiveur PV
 */
function initTabTracker() {
  document.getElementById('tab-tracker').innerHTML = `
    <div class="alert alert-warning" style="font-weight:600">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
      ⚠️ Aperçu — calculs non disponibles : le module Suiveur PV (tracker 1 axe / 2 axes) n'est pas encore implémenté.
      Aucune donnée de votre projet n'est utilisée ici ; rien n'est calculé ni enregistré sur cet onglet.
    </div>
    <div class="card">
      <div class="card-title">Comparaison Fixe vs. Suiveur <span style="font-weight:400;color:var(--color-text-muted)">(valeurs génériques, à titre indicatif uniquement)</span></div>
      <table class="data-table" style="max-width:520px">
        <thead>
          <tr><th>Configuration</th><th>Gain production est.</th><th>Coût supplémentaire</th><th>Complexité</th></tr>
        </thead>
        <tbody>
          <tr><td>Plan fixe optimisé</td><td>Référence (100%)</td><td>-</td><td>Faible</td></tr>
          <tr><td>Suiveur 1 axe horizontal</td><td>+15 à +20%</td><td>+25 à +40%</td><td>Moyenne</td></tr>
          <tr><td>Suiveur 1 axe incliné</td><td>+18 à +25%</td><td>+30 à +50%</td><td>Moyenne</td></tr>
          <tr><td>Suiveur 2 axes</td><td>+25 à +40%</td><td>+60 à +100%</td><td>Élevée</td></tr>
        </tbody>
      </table>
      <p style="margin-top:12px;font-size:12px;color:var(--color-text-muted)">
        Tableau non interactif, fourni à titre indicatif uniquement. La simulation précise du suiveur
        (calcul heure par heure, propre à votre projet) sera disponible dans une prochaine version.
      </p>
    </div>`;
}

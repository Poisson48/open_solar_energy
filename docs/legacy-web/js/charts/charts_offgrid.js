/**
 * charts_offgrid.js - Graphiques onglet Dimensionnement hors réseau
 * Dépend de : charts_base.js
 */

(function () {

  /** Bilan énergétique journalier moyen par mois : prod vs conso */
  Charts.renderOffgridBalance = function (canvasId, result) {
    Charts.destroy(canvasId);
    const labels = result.monthly.map(m => m.name);
    new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Production PV moy. (kWh/j)',
            data: result.monthly.map(m => m.e_prod_day),
            backgroundColor: 'rgba(26,107,60,0.75)',
            borderRadius: 3,
            yAxisID: 'y'
          },
          {
            label: 'Consommation (kWh/j)',
            data: result.monthly.map(m => m.e_conso_day),
            type: 'line',
            borderColor: '#c62828',
            backgroundColor: 'rgba(198,40,40,0.08)',
            borderWidth: 2,
            pointRadius: 4,
            fill: false,
            tension: 0.3,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 12, padding: 10 } } },
        scales: { y: { title: { display: true, text: 'kWh/jour' }, grid: { color: 'rgba(0,0,0,0.06)' } } }
      }
    });
  };

  /** Jours de déficit par mois */
  Charts.renderOffgridDeficitDays = function (canvasId, result) {
    Charts.destroy(canvasId);
    const labels = result.monthly.map(m => m.name);
    new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Jours de déficit',
          data: result.monthly.map(m => m.deficit_days),
          backgroundColor: result.monthly.map(m =>
            m.deficit_days === 0 ? 'rgba(26,107,60,0.75)' :
            m.deficit_days <= 3  ? 'rgba(245,166,35,0.80)' :
                                   'rgba(198,40,40,0.75)'
          ),
          borderRadius: 3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} jour(s) sans énergie` } }
        },
        scales: { y: { title: { display: true, text: 'Jours de déficit / mois' }, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.06)' } } }
      }
    });
  };

  /**
   * Matrice couverture (Ppeak × C_batt) sous forme de heatmap HTML cliquable.
   * recPpeak/recBatt : recommandation "Autonome" d'origine (★, ne change pas avec la sélection).
   * selPpeak/selBatt : config actuellement affichée dans les KPI/graphiques (✓) — peut différer
   * de la recommandation si l'utilisateur a cliqué une autre case. Si les deux coïncident
   * (cas le plus courant), la case porte les deux marqueurs pour rester lisible.
   */
  Charts.renderOffgridHeatmap = function (containerId, allCandidates, recPpeak, recBatt, selPpeak, selBatt) {
    const ppeaks = [...new Set(allCandidates.map(c => c.Ppeak))].sort((a, b) => a - b);
    const batts  = [...new Set(allCandidates.map(c => c.C_batt_gross))].sort((a, b) => a - b);
    // Compat rétro : si non fournis, la sélection = la recommandation (ancien comportement)
    if (selPpeak == null) selPpeak = recPpeak;
    if (selBatt == null) selBatt = recBatt;

    const rows = ppeaks.map(p => {
      const cells = batts.map(b => {
        const c = allCandidates.find(x => x.Ppeak === p && x.C_batt_gross === b);
        if (!c) return '<td>-</td>';
        const pct    = c.coverageRate;
        const isRec  = (p === recPpeak && b === recBatt);
        const isSel  = (p === selPpeak && b === selBatt);
        const bg     = pct >= 95 ? 'rgba(26,107,60,0.85)' : pct >= 80 ? 'rgba(245,166,35,0.80)' : pct >= 60 ? 'rgba(230,119,0,0.70)' : 'rgba(198,40,40,0.65)';
        const badge  = isRec ? ' ★' : (isSel ? ' ✓' : '');
        const titleParts = [`${p} kWc · ${b} kWh — couverture ${pct} %, ${c.deficit_days || 0} j déficit, ${c.nPanels || '?'} panneaux`];
        if (isRec) titleParts.push('recommandé (Autonome)');
        if (isSel && !isRec) titleParts.push('actuellement affiché');
        titleParts.push('cliquer pour sélectionner');
        const title  = titleParts.join(' — ');
        const cls    = 'heatmap-cell' + (isSel ? ' heatmap-cell-selected' : '') + (isRec ? ' heatmap-cell-recommended' : '');
        return `<td class="${cls}" style="background:${bg}"
          role="button" tabindex="0"
          title="${title.replace(/"/g, '&quot;')}"
          onclick="selectOffgridCandidate(${p}, ${b})"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectOffgridCandidate(${p}, ${b});}">${pct}%${badge}</td>`;
      }).join('');
      return `<tr><th>${p} kWc</th>${cells}</tr>`;
    }).join('');

    document.getElementById(containerId).innerHTML = `
      <div style="overflow-x:auto">
        <table class="heatmap-table">
          <thead><tr><th>PV \\ Batt</th>${batts.map(b => `<th>${b} kWh</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="font-size:11px;color:var(--color-text-muted);margin-top:6px">
        Cliquez une case pour sélectionner cette config (KPI + graphiques).
        ★ = recommandation Autonome, ✓ = config actuellement affichée (si différente).
        Vert ≥95%, Orange ≥80%, Rouge &lt;80%.
      </p>`;
  };
})();

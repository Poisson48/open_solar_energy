/**
 * charts_sizing.js — Graphiques onglet Dimensionnement réseau (EDF)
 * Dépend de : charts_base.js
 */

(function () {

  /** Production vs Consommation mensuelle (barres groupées + ligne autoconso) */
  Charts.renderSizingProductionVsConso = function (canvasId, result) {
    Charts.destroy(canvasId);
    const labels = result.monthlyMetrics.map(m => m.name);
    new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Consommation (kWh)',
            data: result.monthlyMetrics.map(m => Math.round(m.conso)),
            backgroundColor: 'rgba(198,40,40,0.65)',
            borderRadius: 3,
            yAxisID: 'y'
          },
          {
            label: 'Production PV (kWh)',
            data: result.monthlyMetrics.map(m => Math.round(m.prod)),
            backgroundColor: 'rgba(26,107,60,0.72)',
            borderRadius: 3,
            yAxisID: 'y'
          },
          {
            label: 'Autoconsommé (kWh)',
            data: result.monthlyMetrics.map(m => Math.round(m.autoconsoKwh)),
            type: 'line',
            borderColor: '#f5a623',
            backgroundColor: 'rgba(245,166,35,0.1)',
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
        scales: {
          y: { title: { display: true, text: 'Énergie (kWh/mois)' }, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    });
  };

  /** Flux d'énergie empilés : autoconso + déficit + surplus */
  Charts.renderSizingEnergyFlow = function (canvasId, result) {
    Charts.destroy(canvasId);
    const labels = result.monthlyMetrics.map(m => m.name);
    new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Autoconsommé (kWh)',
            data: result.monthlyMetrics.map(m => Math.round(m.autoconsoKwh)),
            backgroundColor: 'rgba(26,107,60,0.80)',
            borderRadius: 2,
            stack: 'conso'
          },
          {
            label: 'Acheté réseau (kWh)',
            data: result.monthlyMetrics.map(m => Math.round(m.deficit)),
            backgroundColor: 'rgba(198,40,40,0.60)',
            borderRadius: 2,
            stack: 'conso'
          },
          {
            label: 'Surplus injecté (kWh)',
            data: result.monthlyMetrics.map(m => Math.round(m.surplus)),
            backgroundColor: 'rgba(245,166,35,0.75)',
            borderRadius: 2,
            stack: 'prod'
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 12, padding: 10 } } },
        scales: {
          y: { title: { display: true, text: 'kWh/mois' }, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    });
  };

  /** Courbe ROI en fonction de la puissance installée */
  Charts.renderSizingRoiCurve = function (canvasId, allCandidates, recommendedPpeak) {
    Charts.destroy(canvasId);
    new Chart(document.getElementById(canvasId), {
      type: 'line',
      data: {
        labels: allCandidates.map(c => c.Ppeak + ' kWc'),
        datasets: [
          {
            label: 'ROI (années)',
            data: allCandidates.map(c => Math.min(c.ROI, 30)),
            borderColor: '#1a6b3c',
            backgroundColor: 'rgba(26,107,60,0.08)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: allCandidates.map(c =>
              Math.abs(c.Ppeak - recommendedPpeak) < 0.05 ? 7 : 2
            ),
            pointBackgroundColor: allCandidates.map(c =>
              Math.abs(c.Ppeak - recommendedPpeak) < 0.05 ? '#f5a623' : '#1a6b3c'
            )
          },
          {
            label: 'Taux couverture (%)',
            data: allCandidates.map(c => c.coverageRate),
            borderColor: '#f5a623',
            borderDash: [4, 3],
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            pointRadius: 0,
            yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 12, padding: 10 } } },
        scales: {
          y:  { title: { display: true, text: 'ROI (années)' }, min: 0, max: 30, grid: { color: 'rgba(0,0,0,0.06)' } },
          y2: { position: 'right', title: { display: true, text: 'Couverture (%)' }, min: 0, max: 100, grid: { display: false } }
        }
      }
    });
  };

  /** Donut : répartition annuelle de l'énergie */
  Charts.renderSizingDonut = function (canvasId, result) {
    Charts.destroy(canvasId);
    new Chart(document.getElementById(canvasId), {
      type: 'doughnut',
      data: {
        labels: [
          `Autoconsommé (${result.annualAutoconsoKwh} kWh)`,
          `Acheté réseau (${result.annualDeficit} kWh)`,
          `Surplus injecté (${result.annualSurplus} kWh)`
        ],
        datasets: [{
          data: [result.annualAutoconsoKwh, result.annualDeficit, result.annualSurplus],
          backgroundColor: ['rgba(26,107,60,0.85)', 'rgba(198,40,40,0.70)', 'rgba(245,166,35,0.85)'],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 14, padding: 10, font: { size: 11 } } }
        },
        cutout: '60%'
      }
    });
  };
})();

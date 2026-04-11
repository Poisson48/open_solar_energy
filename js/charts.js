/**
 * charts.js — Wrappers Chart.js
 */

const Charts = (() => {
  const MONTH_COLORS_PROD = [
    '#1a6b3c','#1a6b3c','#2d9e5c','#2d9e5c','#f5a623','#f5a623',
    '#e8890a','#e8890a','#2d9e5c','#2d9e5c','#1a6b3c','#1a6b3c'
  ];

  const defaultFont = { family: "'Segoe UI', Arial, sans-serif", size: 11 };

  Chart.defaults.font = defaultFont;
  Chart.defaults.color = '#5a7265';

  function destroy(id) {
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
  }

  /** Production mensuelle PV (barres) + irradiation (ligne) */
  function renderMonthlyProduction(canvasId, results) {
    destroy(canvasId);
    const labels = results.monthly.map(m => m.name);
    new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Production PV (kWh)',
            data: results.monthly.map(m => m.E_month),
            backgroundColor: MONTH_COLORS_PROD,
            borderRadius: 4,
            yAxisID: 'y'
          },
          {
            label: 'Irradiation inclinée (kWh/m²)',
            data: results.monthly.map(m => m.Htilt),
            type: 'line',
            borderColor: '#f5a623',
            backgroundColor: 'rgba(245,166,35,0.1)',
            borderWidth: 2,
            pointRadius: 3,
            fill: false,
            tension: 0.3,
            yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, padding: 12 } },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('fr')} ${ctx.datasetIndex === 0 ? 'kWh' : 'kWh/m²'}`
            }
          }
        },
        scales: {
          y: {
            position: 'left',
            title: { display: true, text: 'Production (kWh)', font: { size: 11 } },
            grid: { color: 'rgba(0,0,0,0.06)' }
          },
          y2: {
            position: 'right',
            title: { display: true, text: 'Irradiation (kWh/m²)', font: { size: 11 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  /** Irradiation + température */
  function renderIrradiationTemp(canvasId, results) {
    destroy(canvasId);
    const labels = results.monthly.map(m => m.name);
    new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'GHI (kWh/m²)',
            data: results.monthly.map(m => m.GHI),
            backgroundColor: 'rgba(245,166,35,0.7)',
            borderRadius: 3,
            yAxisID: 'y'
          },
          {
            label: 'Température (°C)',
            data: results.monthly.map(m => m.T_avg),
            type: 'line',
            borderColor: '#e53935',
            backgroundColor: 'rgba(229,57,53,0.08)',
            borderWidth: 2,
            pointRadius: 3,
            fill: false,
            tension: 0.4,
            yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, padding: 10 } }
        },
        scales: {
          y: {
            title: { display: true, text: 'GHI (kWh/m²)' },
            grid: { color: 'rgba(0,0,0,0.06)' }
          },
          y2: {
            position: 'right',
            title: { display: true, text: 'Température (°C)' },
            grid: { display: false }
          }
        }
      }
    });
  }

  /** Couverture solaire hors réseau */
  function renderOffgridCoverage(canvasId, monthly) {
    destroy(canvasId);
    const labels = monthly.map(m => m.name);
    new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Couverture solaire (%)',
            data: monthly.map(m => m.coverageRatio),
            backgroundColor: monthly.map(m =>
              m.coverageRatio >= 80 ? 'rgba(46,125,50,0.75)' :
              m.coverageRatio >= 50 ? 'rgba(230,81,0,0.75)' :
              'rgba(198,40,40,0.75)'
            ),
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `Couverture : ${ctx.parsed.y}%` } }
        },
        scales: {
          y: {
            max: 100,
            title: { display: true, text: 'Couverture solaire (%)' },
            grid: { color: 'rgba(0,0,0,0.06)' }
          }
        }
      }
    });
  }

  /** Irradiation mensuelle (données brutes) */
  function renderIrradiationMonthly(canvasId, weatherData) {
    destroy(canvasId);
    const labels = weatherData.map(m => m.name);
    new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'GHI (kWh/m²)',
            data: weatherData.map(m => m.GHI),
            backgroundColor: 'rgba(245,166,35,0.75)',
            borderRadius: 3,
            stack: 'irr'
          },
          {
            label: 'DHI (kWh/m²)',
            data: weatherData.map(m => m.DHI),
            backgroundColor: 'rgba(100,181,246,0.7)',
            borderRadius: 3
          },
          {
            label: 'T° moy (°C)',
            data: weatherData.map(m => m.T_avg),
            type: 'line',
            borderColor: '#e53935',
            borderWidth: 2,
            pointRadius: 3,
            fill: false,
            tension: 0.4,
            yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, padding: 10 } }
        },
        scales: {
          y: {
            title: { display: true, text: 'Irradiation (kWh/m²)' },
            grid: { color: 'rgba(0,0,0,0.06)' }
          },
          y2: {
            position: 'right',
            title: { display: true, text: 'Température (°C)' },
            grid: { display: false }
          }
        }
      }
    });
  }

  // ── DIMENSIONNEMENT ────────────────────────────────────────────

  /** Production vs Consommation mensuelle (barres groupées + ligne couverture) */
  function renderSizingProductionVsConso(canvasId, result) {
    destroy(canvasId);
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
  }

  /** Flux d'énergie empilés : autoconso + déficit + surplus */
  function renderSizingEnergyFlow(canvasId, result) {
    destroy(canvasId);
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
  }

  /** Courbe ROI en fonction de la puissance installée */
  function renderSizingRoiCurve(canvasId, allCandidates, recommendedPpeak) {
    destroy(canvasId);
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
  }

  /** Donut : répartition annuelle de l'énergie */
  function renderSizingDonut(canvasId, result) {
    destroy(canvasId);
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
  }

  // ── HORS RÉSEAU ────────────────────────────────────────────────

  /** Bilan énergétique journalier moyen par mois : prod vs conso */
  function renderOffgridBalance(canvasId, result) {
    destroy(canvasId);
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
  }

  /** Jours de déficit par mois */
  function renderOffgridDeficitDays(canvasId, result) {
    destroy(canvasId);
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
  }

  /** Matrice couverture (Ppeak × C_batt) sous forme de heatmap */
  function renderOffgridHeatmap(containerId, allCandidates, recPpeak, recBatt) {
    const ppeaks = [...new Set(allCandidates.map(c => c.Ppeak))].sort((a,b) => a-b);
    const batts  = [...new Set(allCandidates.map(c => c.C_batt_gross))].sort((a,b) => a-b);

    const rows = ppeaks.map(p => {
      const cells = batts.map(b => {
        const c = allCandidates.find(x => x.Ppeak === p && x.C_batt_gross === b);
        if (!c) return '<td>—</td>';
        const pct   = c.coverageRate;
        const isRec = (p === recPpeak && b === recBatt);
        const bg    = pct >= 95 ? 'rgba(26,107,60,0.85)' : pct >= 80 ? 'rgba(245,166,35,0.80)' : pct >= 60 ? 'rgba(230,119,0,0.70)' : 'rgba(198,40,40,0.65)';
        const border= isRec ? 'outline:2px solid #fff;outline-offset:-2px;' : '';
        return `<td style="background:${bg};color:#fff;${border}">${pct}%${isRec ? ' ★' : ''}</td>`;
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
        Taux de couverture (%). ★ = configuration recommandée. Vert ≥95%, Orange ≥80%, Rouge &lt;80%.
      </p>`;
  }

  return {
    renderMonthlyProduction, renderIrradiationTemp, renderOffgridCoverage, renderIrradiationMonthly,
    renderSizingProductionVsConso, renderSizingEnergyFlow, renderSizingRoiCurve, renderSizingDonut,
    renderOffgridBalance, renderOffgridDeficitDays, renderOffgridHeatmap,
    destroy
  };
})();

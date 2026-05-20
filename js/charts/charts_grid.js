/**
 * charts_grid.js - Graphiques onglet Système PV réseau + données météo
 * Dépend de : charts_base.js
 */

(function () {
  const MONTH_COLORS_PROD = [
    '#1a6b3c', '#1a6b3c', '#2d9e5c', '#2d9e5c', '#f5a623', '#f5a623',
    '#e8890a', '#e8890a', '#2d9e5c', '#2d9e5c', '#1a6b3c', '#1a6b3c'
  ];

  /** Production mensuelle PV (barres) + irradiation (ligne) */
  Charts.renderMonthlyProduction = function (canvasId, results) {
    Charts.destroy(canvasId);
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
  };

  /** Irradiation + température */
  Charts.renderIrradiationTemp = function (canvasId, results) {
    Charts.destroy(canvasId);
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
  };

  /** Couverture solaire hors réseau (ancien module simple) */
  Charts.renderOffgridCoverage = function (canvasId, monthly) {
    Charts.destroy(canvasId);
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
  };

  /** Irradiation mensuelle (données brutes météo) */
  Charts.renderIrradiationMonthly = function (canvasId, weatherData) {
    Charts.destroy(canvasId);
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
  };
})();

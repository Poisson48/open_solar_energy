/**
 * charts_hourly.js - Graphiques onglet Analyse horaire
 * Dépend de : charts_base.js
 *
 * v1.8.0 : ajout renderMonthlyOverlay (superposition 12 mois PV vs Conso)
 */

(function () {

  /** Profil journalier : PV / Conso / Soutirage réseau */
  Charts.renderHourlyProfile = function (canvasId, sim, monthName, gridLabel = 'Soutirage réseau (Wh)') {
    Charts.destroy(canvasId);
    const labels = sim.map(r => `${String(r.hour).padStart(2, '0')}h`);
    new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Production PV (Wh)',
            data: sim.map(r => Math.round(r.pv * 1000)),
            backgroundColor: 'rgba(245,166,35,0.75)',
            order: 2
          },
          {
            label: 'Consommation (Wh)',
            data: sim.map(r => Math.round(r.conso * 1000)),
            backgroundColor: 'rgba(26,107,60,0.2)',
            borderColor: 'rgba(26,107,60,0.8)',
            borderWidth: 2,
            type: 'line',
            order: 1,
            fill: false,
            tension: 0.3
          },
          {
            label: gridLabel,
            data: sim.map(r => Math.round(r.grid * 1000)),
            backgroundColor: 'rgba(198,40,40,0.45)',
            order: 3
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: `Profil journalier typique - ${monthName}` },
          legend: { position: 'top' }
        },
        scales: {
          x: { stacked: false },
          y: { title: { display: true, text: 'Wh' }, beginAtZero: true }
        }
      }
    });
  };

  /** État de charge de la batterie (SoC) sur 24h */
  Charts.renderHourlySoc = function (canvasId, sim, usableKwh) {
    Charts.destroy(canvasId);
    const labels = sim.map(r => `${String(r.hour).padStart(2, '0')}h`);
    new Chart(document.getElementById(canvasId), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'SoC batterie (kWh)',
            data: sim.map(r => r.soc),
            borderColor: '#1565c0',
            backgroundColor: 'rgba(21,101,192,0.12)',
            fill: true,
            tension: 0.3,
            pointRadius: 3
          },
          {
            label: `SoC max (${usableKwh.toFixed(1)} kWh)`,
            data: new Array(24).fill(usableKwh),
            borderColor: '#4caf50',
            borderDash: [6, 3],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: { y: { title: { display: true, text: 'kWh' }, beginAtZero: true } }
      }
    });
  };

  /**
   * Superposition des 12 mois — PV (courbes jaune-orange) et Conso (courbes vert)
   * allMonths : tableau de 12 éléments { monthName, sim }
   * sim : tableau 24h d'objets { pv, conso, ... }
   */
  Charts.renderMonthlyOverlay = function (canvasId, allMonths) {
    Charts.destroy(canvasId);
    const labels = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}h`);

    // Palette de couleurs pour les 12 mois (PV : teintes chaudes, Conso : teintes froides)
    const pvColors = [
      'rgba(100,149,237,0.85)',   // Jan — bleu hivernal
      'rgba(130,167,230,0.85)',   // Fév
      'rgba(144,202,119,0.85)',   // Mar — vert printanier
      'rgba(180,220,90,0.85)',    // Avr
      'rgba(230,210,50,0.85)',    // Mai
      'rgba(245,166,35,0.95)',    // Jun — orange
      'rgba(240,120,20,0.95)',    // Jul — orange foncé
      'rgba(235,140,30,0.90)',    // Aoû
      'rgba(200,170,60,0.85)',    // Sep
      'rgba(160,140,80,0.85)',    // Oct
      'rgba(120,130,160,0.85)',   // Nov
      'rgba(90,120,200,0.85)',    // Déc
    ];

    const consoColors = [
      'rgba(198,40,40,0.5)',    // Jan
      'rgba(198,40,40,0.5)',    // Fév
      'rgba(198,40,40,0.5)',    // Mar
      'rgba(198,40,40,0.5)',    // Avr
      'rgba(198,40,40,0.5)',    // Mai
      'rgba(198,40,40,0.5)',    // Jun
      'rgba(198,40,40,0.5)',    // Jul
      'rgba(198,40,40,0.5)',    // Aoû
      'rgba(198,40,40,0.5)',    // Sep
      'rgba(198,40,40,0.5)',    // Oct
      'rgba(198,40,40,0.5)',    // Nov
      'rgba(198,40,40,0.5)',    // Déc
    ];

    const datasets = [];
    allMonths.forEach(({ monthName, sim }, i) => {
      // Courbe PV
      datasets.push({
        label: `PV ${monthName}`,
        data: sim.map(r => Math.round(r.pv * 1000)),
        borderColor: pvColors[i],
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: false
      });
      // Courbe Conso (une seule légende suffit — on n'affiche que la première)
      datasets.push({
        label: i === 0 ? 'Consommation' : `Conso ${monthName}`,
        data: sim.map(r => Math.round(r.conso * 1000)),
        borderColor: consoColors[i],
        backgroundColor: 'transparent',
        borderWidth: i === 0 ? 2 : 1,
        borderDash: i === 0 ? [] : [4, 3],
        pointRadius: 0,
        tension: 0.3,
        fill: false,
        // Masquer les courbes conso des mois 2-12 dans la légende
        hidden: i > 0
      });
    });

    new Chart(document.getElementById(canvasId), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          title: {
            display: true,
            text: 'Superposition des 12 mois — Production PV vs Consommation (Wh/h)'
          },
          legend: {
            position: 'top',
            labels: {
              // N'affiche que les courbes PV + la première conso
              filter: item => item.text.startsWith('PV ') || item.text === 'Consommation'
            },
            onClick: function (e, legendItem, legend) {
              // Clic sur un mois PV => toggle PV + Conso associée
              const idx = legendItem.datasetIndex;
              const chart = legend.chart;
              // PV datasets : indices pairs (0, 2, 4…), Conso : impairs (1, 3, 5…)
              const isPV = idx % 2 === 0;
              if (isPV) {
                const pvMeta   = chart.getDatasetMeta(idx);
                const consoMeta = chart.getDatasetMeta(idx + 1);
                const hidden = !pvMeta.hidden;
                pvMeta.hidden = hidden;
                consoMeta.hidden = hidden;
              } else {
                const meta = chart.getDatasetMeta(idx);
                meta.hidden = !meta.hidden;
              }
              chart.update();
            }
          },
          tooltip: {
            callbacks: {
              title: items => `${items[0].label}`,
              label: item => {
                if (item.datasetMeta && item.datasetMeta.hidden) return null;
                return `${item.dataset.label}: ${item.formattedValue} Wh`;
              }
            }
          }
        },
        scales: {
          x: { title: { display: false } },
          y: {
            title: { display: true, text: 'Wh' },
            beginAtZero: true
          }
        }
      }
    });
  };

})();

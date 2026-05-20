/**
 * charts_hourly.js - Graphiques onglet Analyse horaire
 * Dépend de : charts_base.js
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
})();

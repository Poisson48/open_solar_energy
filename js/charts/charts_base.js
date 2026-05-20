/**
 * charts_base.js - Initialisation globale Chart.js + utilitaire destroy
 * Doit être chargé EN PREMIER parmi les fichiers charts/
 */

const Charts = {};

(function () {
  Chart.defaults.font = { family: "'Segoe UI', Arial, sans-serif", size: 11 };
  Chart.defaults.color = '#5a7265';

  Charts.destroy = function (id) {
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
  };
})();

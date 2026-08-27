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

  /** Canvas visible et dimensionné — sinon Chart.js plante (surtout Qt WebEngine). */
  Charts.canvasReady = function (id) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el || typeof el.getContext !== 'function') return false;
    const r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  };

  Charts.safeCreate = function (canvasId, config) {
    Charts.destroy(canvasId);
    if (!Charts.canvasReady(canvasId)) return null;
    try {
      return new Chart(document.getElementById(canvasId), config);
    } catch (e) {
      console.warn('[Charts] create failed', canvasId, e);
      return null;
    }
  };
})();

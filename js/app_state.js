/**
 * app_state.js — État global partagé + constantes
 * Doit être chargé EN PREMIER avant tous les autres modules JS
 */

const APP_VERSION = '1.5.1';
// Historique :
//   1.4.0 — Module devis professionnel
//   1.5.0 — Refactoring multi-fichiers, modal démarrage, infos client,
//            module horaire EDF, dimensionnement onduleurs
//   1.5.1 — Serveur de développement local (.claude/launch.json)

const AppState = {
  location:   { lat: 48.8566, lon: 2.3522, alt: 35, name: 'Paris, France' },
  weatherData: null,
  demoData:   null,
  map:        null,
  marker:     null,
  activeTab:  'sizing',

  // Résultats de calcul
  lastGridResult:         null,
  lastGridParams:         null,
  lastOffgridResult:      null,
  lastSizingResult:       null,
  lastSizingInput:        null,
  lastOffgridSizingResult: null,

  // Gestion de projets
  currentProjectId: null,   // null = projet non sauvegardé
  currentClient: {           // infos client du projet en cours
    nom:     '',
    adresse: '',
    tel:     '',
    email:   ''
  },

  // Données horaires (depuis import Enedis 30min)
  hourlyEnedisData: null    // { halfHourly: Float32Array, year: 2023, format: '30min' }
};

// Champs de formulaire persistés dans un projet
const PROJECT_FIELDS = [
  // Système PV réseau
  'inp-ppeak','inp-losses','inp-tilt','inp-azimuth','inp-cost','inp-kwh-price','inp-co2',
  // Dimensionnement EDF
  'sz-tariff','sz-price-base','sz-subscription',
  ...Array.from({length:12}, (_,i) => `sz-kwh-${i+1}`),
  'sz-tilt','sz-azimuth','sz-surface','sz-panel-wp','sz-panel-m2','sz-losses','sz-tech',
  'sz-strategy','sz-target-coverage','sz-cost-kwp','sz-cost-total','sz-feedin',
  // Hors réseau
  'og2-daily-default',
  ...Array.from({length:12}, (_,i) => `og2-day-${i+1}`),
  'og2-batt-tech','og2-tilt','og2-azimuth','og2-surface',
  'og2-panel-wp','og2-panel-m2','og2-losses','og2-target-coverage',
  'og2-pv-cost-kwp','og2-bos-cost'
];

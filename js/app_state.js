/**
 * app_state.js - État global partagé + constantes
 * Doit être chargé EN PREMIER avant tous les autres modules JS
 */

const APP_VERSION = '1.7.3';
// Historique :
//   1.4.0 - Module devis professionnel
//   1.5.0 - Refactoring multi-fichiers, modal démarrage, infos client,
//            module horaire EDF, dimensionnement onduleurs
//   1.5.1 - Serveur de développement local (.claude/launch.json)
//   1.5.2 - Refacto constants.js · bugfixes (autoConso/ROI/panelWp)
//            · onglet réseau : calcul auto nb panneaux depuis surface
//   1.5.3 - Suppression valeurs par défaut · projet démo au démarrage
//   1.6.0 - Hors-réseau : import Enedis direct, simulation slot-par-slot 17520
//   1.6.1 - Script serve.sh Linux
//   1.7.0 - Rb intégration numérique (tout azimut), HDKR anisotrope, payback/VAN/LCOE
//   1.7.1 - Audit bugs B1-B10 : payback DCF, reset Enedis, selectOptimal sans mutation,
//            années bissextiles, AppState initialisé, LCOE nominal
//   1.7.2 - Fix sandbox Linux : AppImage utilisable sans --no-sandbox
//   1.7.3 - Fix sandbox Linux : wrapper --no-sandbox + release non-draft

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
  hourlyEnedisData: null,   // { halfHourly: Float32Array, year: 2023, format: '30min' }
  hourlyWeatherData: null,  // données météo horaires (PVGIS)
  enedisYear: null,         // année des données Enedis importées

  // Résultats de dimensionnement (candidats)
  lastSizingCandidates: null,
  lastOffgridSizingCandidates: null,

  // Données HP/HC mensuelles (Enedis)
  monthlyKwhHp: null,       // tableau 12 valeurs kWh HP par mois

  // Paramètre prime autoconso (modifiable via AppAPI)
  _includeIncentive: true,

  // Type d'installation : 'grid' (raccordé réseau) | 'offgrid' (autonome)
  installationType: 'grid',

  // Paramètres d'installation partagés entre onglets
  install: {
    tilt:    30,
    azimuth: 0,
    surface: null,
    panelWp: 400,
    panelM2: 1.96,
    losses:  14,
    tech:    'crystSi',
  }
};

// Champs de formulaire persistés dans un projet
const PROJECT_FIELDS = [
  // Système PV réseau (Ppeak calculé depuis surface + panneaux)
  'inp-surface','inp-panel-wp','inp-panel-m2','sel-tech','inp-losses','inp-tilt','inp-azimuth','inp-cost','inp-kwh-price','inp-co2',
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

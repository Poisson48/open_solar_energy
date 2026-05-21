/**
 * project_startup.js - Modal de démarrage et projet démo
 * Dépend de : app_state.js, project_manager.js, project_forms.js
 */

const DEMO_PROJECT_ID = 'demo_ose_v1';

// ══════════════════════════════════════════════════════════════
//  MODAL DE DÉMARRAGE
// ══════════════════════════════════════════════════════════════
function openStartupModal() {
  showStartupStep1();
  document.getElementById('startup-modal').style.display = 'flex';
}

function closeStartupModal() {
  document.getElementById('startup-modal').style.display = 'none';
}

function showStartupStep1() {
  document.getElementById('startup-step-1').style.display    = 'block';
  document.getElementById('startup-step-type').style.display = 'none';
  document.getElementById('startup-step-new').style.display  = 'none';
  document.getElementById('startup-step-load').style.display = 'none';
}

function showInstallationTypeStep() {
  document.getElementById('startup-step-1').style.display    = 'none';
  document.getElementById('startup-step-type').style.display = 'block';
  document.getElementById('startup-step-new').style.display  = 'none';
  document.getElementById('startup-step-load').style.display = 'none';
}

function selectInstallationType(type) {
  AppState.installationType = type;
  if (typeof applyInstallationType === 'function') applyInstallationType(type);
  showNewProjectForm();
}

function showNewProjectForm() {
  document.getElementById('startup-step-1').style.display    = 'none';
  document.getElementById('startup-step-type').style.display = 'none';
  document.getElementById('startup-step-new').style.display  = 'block';
  document.getElementById('startup-step-load').style.display = 'none';
  document.getElementById('startup-project-name').focus();
}

function showLoadProjectList() {
  document.getElementById('startup-step-1').style.display    = 'none';
  document.getElementById('startup-step-type').style.display = 'none';
  document.getElementById('startup-step-new').style.display  = 'none';
  document.getElementById('startup-step-load').style.display = 'block';
  renderProjectsList('startup-projects-list');
}

function createNewProject(event) {
  event.preventDefault();
  const name    = document.getElementById('startup-project-name').value.trim() || 'Nouveau projet';
  const nom     = document.getElementById('startup-client-nom').value.trim();
  const adresse = document.getElementById('startup-client-adresse').value.trim();
  const tel     = document.getElementById('startup-client-tel').value.trim();
  const email   = document.getElementById('startup-client-email').value.trim();

  AppState.currentProjectId = null;
  AppState.currentClient = { nom, adresse, tel, email };

  const nameEl = document.getElementById('project-name-input');
  if (nameEl) nameEl.value = name;

  updateProjectBar();
  resetForNewProject();
  closeStartupModal();
  prefillClientInQuote();
  showToast(`✓ Projet "${name}" créé`);
}

// ══════════════════════════════════════════════════════════════
//  PROJET DÉMO
// ══════════════════════════════════════════════════════════════
/**
 * Insère le projet démo dans localStorage si absent.
 * Utilise les données météo Toulouse depuis AppState.demoData.
 */
function seedDemoProject() {
  if (ProjectManager.get(DEMO_PROJECT_ID)) return;

  const toulouse = AppState.demoData?.locations?.toulouse;
  if (!toulouse) return;

  const formState = {
    // Dimensionnement réseau
    'sz-tariff':           'base',
    'sz-price-base':       '0.2516',
    'sz-subscription':     '147',
    'sz-kwh-1':  '385', 'sz-kwh-2':  '345', 'sz-kwh-3':  '310',
    'sz-kwh-4':  '268', 'sz-kwh-5':  '228', 'sz-kwh-6':  '192',
    'sz-kwh-7':  '182', 'sz-kwh-8':  '188', 'sz-kwh-9':  '222',
    'sz-kwh-10': '278', 'sz-kwh-11': '335', 'sz-kwh-12': '392',
    'sz-tilt':           '32',
    'sz-azimuth':        '0',
    'sz-surface':        '22',
    'sz-panel-wp':       '400',
    'sz-panel-m2':       '1.96',
    'sz-losses':         '14',
    'sz-tech':           'crystSi',
    'sz-strategy':       'autoconso_max',
    'sz-target-coverage':'60',
    'sz-cost-kwp':       '900',
    'sz-cost-total':     '',
    'sz-feedin':         '0.13',
    // Système réseau (simulation directe)
    'inp-surface':   '22',
    'inp-panel-wp':  '400',
    'inp-panel-m2':  '1.96',
    'sel-tech':      'crystSi',
    'inp-losses':    '14',
    'inp-tilt':      '32',
    'inp-azimuth':   '0',
    'inp-cost':      '4400',
    'inp-kwh-price': '0.13',
    'inp-co2':       '0.052',
    // Hors réseau
    'og2-daily-default': '850',
    'og2-batt-tech':     'lfp',
    'og2-tilt':          '32',
    'og2-azimuth':       '0',
    'og2-surface':       '12',
    'og2-panel-wp':      '400',
    'og2-panel-m2':      '1.96',
    'og2-losses':        '14',
    'og2-target-coverage':'90',
    'og2-pv-cost-kwp':   '650',
    'og2-bos-cost':      '500',
    ...Object.fromEntries(Array.from({length:12}, (_,i) => [`og2-day-${i+1}`, '0']))
  };

  const annualConso = Object.entries(formState)
    .filter(([k]) => k.startsWith('sz-kwh-'))
    .reduce((s, [, v]) => s + parseFloat(v), 0);

  const demo = {
    id:        DEMO_PROJECT_ID,
    name:      'Démo - Maison Toulouse',
    isDemo:    true,
    client: {
      nom:     'Famille Dupont',
      adresse: '12 allée des Capucines, 31000 Toulouse',
      tel:     '06 12 34 56 78',
      email:   'dupont@example.fr'
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    location:  { lat: toulouse.lat, lon: toulouse.lon, alt: toulouse.alt, name: toulouse.name },
    weatherData: toulouse.monthly,
    formState,
    summary: {
      annualConso,
      recommendedPpeak: 4.4,
      systemCost:       3960,
      coverageRate:     62,
      locationName:     toulouse.name
    }
  };

  ProjectManager.save(demo);
}

/**
 * project_startup.js - Modal de démarrage (hub projets) et projet démo
 * Dépend de : app_state.js, project_manager.js, project_forms.js
 *
 * Au lancement : liste des projets + recherche (pas d'ouverture auto).
 * Le projet démo est seedé dans localStorage et apparaît dans la liste.
 */

const DEMO_PROJECT_ID = 'demo_ose_v2';
const DEMO_SEED_VERSION = 5;

const DEMO_HYBRID_PROJECT_ID = 'demo_ose_hybrid_v1';
const DEMO_HYBRID_SEED_VERSION = 1;

// ══════════════════════════════════════════════════════════════
//  MODAL DE DÉMARRAGE = HUB PROJETS
// ══════════════════════════════════════════════════════════════
function openStartupModal() {
  showStartupStep1();
  const hub = document.getElementById('startup-modal');
  if (!hub) return;
  hub.classList.add('ose-hub-open');
  hub.removeAttribute('hidden');
  document.body.classList.add('ose-hub-active');
  const search = document.getElementById('projects-search');
  if (search) search.value = '';
  const sub = document.getElementById('ose-hub-sub');
  const hasProject = !!(typeof AppState !== 'undefined' && AppState.currentProjectId);
  if (sub) sub.textContent = hasProject
    ? 'Gérer vos projets ou en ouvrir un autre'
    : 'Choisissez un projet pour commencer';
  if (typeof renderProjectsList === 'function')
    renderProjectsList('');
}

function closeStartupModal() {
  const hub = document.getElementById('startup-modal');
  if (!hub) return;
  hub.classList.remove('ose-hub-open');
  hub.setAttribute('hidden', '');
  document.body.classList.remove('ose-hub-active');
}

function showStartupStep1() {
  document.getElementById('startup-step-1').style.display    = 'block';
  document.getElementById('startup-step-type').style.display = 'none';
  document.getElementById('startup-step-new').style.display  = 'none';
  const load = document.getElementById('startup-step-load');
  if (load) load.style.display = 'none';
  if (typeof renderProjectsList === 'function')
    renderProjectsList(document.getElementById('projects-search')?.value || '');
}

function showInstallationTypeStep() {
  document.getElementById('startup-step-1').style.display    = 'none';
  document.getElementById('startup-step-type').style.display = 'block';
  document.getElementById('startup-step-new').style.display  = 'none';
  const load = document.getElementById('startup-step-load');
  if (load) load.style.display = 'none';
}

/** Nouveau projet : même hub, étape type d'installation */
function startNewProjectFlow() {
  openStartupModal();
  showInstallationTypeStep();
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
  const load = document.getElementById('startup-step-load');
  if (load) load.style.display = 'none';
  document.getElementById('startup-project-name')?.focus();
}

function showLoadProjectList() {
  showStartupStep1();
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
  if (typeof saveCurrentProject === 'function') saveCurrentProject();
  else showToast(`✓ Projet "${name}" créé`);
}

// ══════════════════════════════════════════════════════════════
//  GÉNÉRATEURS DÉMO (cohérents, pas de résultats figés)
// ══════════════════════════════════════════════════════════════

function demoMonthDays(year) {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
}

function demoHalfHourWeights() {
  const w = new Float64Array(48);
  for (let s = 0; s < 48; s++) {
    const h = s / 2;
    if (h >= 0 && h < 6)       w[s] = 0.35;
    else if (h >= 6 && h < 7)  w[s] = 0.8;
    else if (h >= 7 && h < 9)  w[s] = 2.4;
    else if (h >= 9 && h < 12) w[s] = 1.1;
    else if (h >= 12 && h < 14) w[s] = 1.4;
    else if (h >= 14 && h < 17) w[s] = 1.0;
    else if (h >= 17 && h < 18) w[s] = 1.6;
    else if (h >= 18 && h < 22) w[s] = 2.6;
    else                        w[s] = 0.9;
  }
  let sum = 0;
  for (let i = 0; i < 48; i++) sum += w[i];
  for (let i = 0; i < 48; i++) w[i] /= sum;
  return w;
}

function buildSyntheticEnedis30min(monthlyKwh, year) {
  const days = demoMonthDays(year);
  const nDays = days.reduce((a, b) => a + b, 0);
  const out = new Float32Array(nDays * 48);
  const weights = demoHalfHourWeights();
  let dayIndex = 0;
  for (let m = 0; m < 12; m++) {
    const monthTotal = monthlyKwh[m];
    const dCount = days[m];
    const dayFactors = [];
    let factorSum = 0;
    for (let d = 0; d < dCount; d++) {
      const date = new Date(Date.UTC(year, m, d + 1));
      const wd = date.getUTCDay();
      const f = (wd === 0 || wd === 6) ? 1.12 : 0.96;
      dayFactors.push(f);
      factorSum += f;
    }
    for (let d = 0; d < dCount; d++) {
      const dayKwh = monthTotal * (dayFactors[d] / factorSum);
      for (let s = 0; s < 48; s++) {
        out[dayIndex * 48 + s] = dayKwh * weights[s];
      }
      dayIndex++;
    }
  }
  return out;
}

function demoMonthlyKwh() {
  return [385, 345, 310, 268, 228, 192, 182, 188, 222, 278, 335, 392];
}

function demoMonthlyKwhHp(monthly) {
  return monthly.map(v => Math.round(v * 0.58 * 10) / 10);
}

function seedDemoPanels() {
  if (typeof PanelDB === 'undefined' || !PanelDB.save) return;
  const existing = PanelDB.list();
  if (existing.some(p => p.model && p.model.includes('Tiger Neo 425'))) return;
  PanelDB.save({
    model: 'Jinko Tiger Neo N-type 425W',
    fabricant: 'JinkoSolar',
    wp: 425,
    largeur: 1.134,
    hauteur: 1.762,
    tech: 'mono',
    coef_temp: -0.29,
    prix: 95,
    garantie_p: 30,
    url: 'https://www.jinkosolar.com/',
    notes: 'Panneau démo Open Solar Energy'
  });
  PanelDB.save({
    model: 'Longi Hi-MO 6 430W',
    fabricant: 'LONGi',
    wp: 430,
    largeur: 1.134,
    hauteur: 1.722,
    tech: 'mono',
    coef_temp: -0.28,
    prix: 98,
    garantie_p: 25,
    notes: 'Panneau démo Open Solar Energy'
  });
}

function seedDemoInstaller() {
  if (typeof QuoteGen === 'undefined') return;
  const cur = QuoteGen.loadInstaller();
  if (cur && cur.company) return;
  QuoteGen.saveInstaller({
    company: 'Soleil Occitan SARL',
    siret: '812 345 678 00012',
    rge: 'E-E190909-4521',
    address: '18 avenue des Pyrénées\n31100 Toulouse',
    phone: '05 61 98 76 54',
    email: 'contact@soleil-occitan.fr'
  });
}

function seedDemoProject() {
  seedDemoPanels();
  seedDemoInstaller();
  seedDemoHybridProject();

  if (ProjectManager.get('demo_ose_v1')) ProjectManager.remove('demo_ose_v1');

  const existing = ProjectManager.get(DEMO_PROJECT_ID);
  if (existing && existing.demoSeedVersion === DEMO_SEED_VERSION) return;

  const toulouse = AppState.demoData?.locations?.toulouse;
  if (!toulouse) return;

  const year = 2024;
  const monthlyKwh = demoMonthlyKwh();
  const monthlyKwhHp = demoMonthlyKwhHp(monthlyKwh);
  const halfHourly = buildSyntheticEnedis30min(monthlyKwh, year);
  const days = demoMonthDays(year);

  const dailyWhByMonth = monthlyKwh.map((kwh, i) =>
    String(Math.round((kwh * 1000) / days[i]))
  );

  const panelModel = 'Jinko Tiger Neo N-type 425W';
  const panelWp = '425';
  const panelM2 = '2.00';
  const surface = '24';
  const tilt = '32';
  const azimuth = '-15';
  const losses = '12';
  const nPanels = '12';

  const formState = {
    'sz-tariff': 'hphc',
    'sz-price-base': '0.2516',
    'sz-price-hp': '0.27',
    'sz-price-hc': '0.2068',
    'sz-subscription': '164.64',
    ...Object.fromEntries(monthlyKwh.map((v, i) => [`sz-kwh-${i + 1}`, String(v)])),
    'sz-tilt': tilt,
    'sz-azimuth': azimuth,
    'sz-surface': surface,
    'sz-panel-model': panelModel,
    'sz-panel-wp': panelWp,
    'sz-panel-m2': panelM2,
    'sz-losses': losses,
    'sz-tech': 'crystSi',
    'sz-strategy': 'autoconso_pct',
    'sz-target-coverage': '90',
    'sz-cost-kwp': '1800',
    'sz-cost-total': '',
    'sz-feedin': '0.13',
    'sz-elec-escalation': '3',
    'sz-discount-rate': '4',
    'sz-panel-degradation': '0.5',
    'sz-finance-years': '25',
    'inp-surface': surface,
    'inp-panel-model': panelModel,
    'inp-panel-wp': panelWp,
    'inp-panel-m2': panelM2,
    'sel-tech': 'crystSi',
    'inp-losses': losses,
    'inp-tilt': tilt,
    'inp-azimuth': azimuth,
    'inp-cost': '9200',
    'inp-kwh-price': '0.2516',
    'inp-co2': '0.052',
    'grid-panel-mode': 'fixe',
    'grid-npanels-fixe': nPanels,
    'og2-daily-default': '0',
    ...Object.fromEntries(dailyWhByMonth.map((v, i) => [`og2-day-${i + 1}`, v])),
    'og2-batt-tech': 'lfp_diy',
    'og2-batt-kwh': '15',
    'og2-tilt': tilt,
    'og2-azimuth': azimuth,
    'og2-surface': surface,
    'og2-panel-model': panelModel,
    'og2-panel-wp': panelWp,
    'og2-panel-m2': panelM2,
    'og2-losses': losses,
    'og2-target-coverage': '90',
    'og2-pv-cost-kwp': '1200',
    'og2-bos-cost': '800',
    'og2-panel-mode': 'fixe',
    'og2-npanels-fixe': nPanels,
    'dv-ins-company': 'Soleil Occitan SARL',
    'dv-ins-siret': '812 345 678 00012',
    'dv-ins-rge': 'E-E190909-4521',
    'dv-ins-address': '18 avenue des Pyrénées\n31100 Toulouse',
    'dv-ins-phone': '05 61 98 76 54',
    'dv-ins-email': 'contact@soleil-occitan.fr',
    'dv-cli-name': 'Famille Martin',
    'dv-cli-company': '',
    'dv-cli-address': '7 chemin des Coteaux\n31400 Toulouse',
    'dv-cli-phone': '06 45 78 12 33',
    'dv-cli-email': 'martin.famille@example.fr',
    'dv-site-address': '7 chemin des Coteaux, 31400 Toulouse',
    'dv-site-type': 'Tuiles mécaniques',
    'dv-site-surface': surface,
    'dv-site-tilt': tilt,
    'dv-site-azimuth': azimuth,
    'dv-sys-ppeak': '',
    'dv-sys-panels': nPanels,
    'dv-sys-panel-model': panelModel,
    'dv-sys-inverter': 'Fronius Symo 5.0-3-M',
    'dv-sys-batt': '0',
    'dv-sys-prod': '',
    'dv-sys-co2': '',
    'dv-sys-autonomy': '',
    'dv-line-panels-label': 'Panneaux photovoltaïques Jinko 425W',
    'dv-line-panels-qty': nPanels,
    'dv-line-panels-unit': 'u',
    'dv-line-panels-price': '95',
    'dv-line-inverter-label': 'Onduleur Fronius Symo 5.0-3-M',
    'dv-line-inverter-qty': '1',
    'dv-line-inverter-unit': 'u',
    'dv-line-inverter-price': '1450',
    'dv-line-fixations-label': 'Fixations / structure toiture tuiles',
    'dv-line-fixations-qty': '1',
    'dv-line-fixations-unit': 'forfait',
    'dv-line-fixations-price': '680',
    'dv-line-cabling-label': 'Câblage DC/AC + protections + coffret',
    'dv-line-cabling-qty': '1',
    'dv-line-cabling-unit': 'forfait',
    'dv-line-cabling-price': '520',
    'dv-line-labor-label': "Main d'œuvre pose",
    'dv-line-labor-qty': '2',
    'dv-line-labor-unit': 'jours',
    'dv-line-labor-price': '450',
    'dv-line-admin-label': 'Démarches Consuel / Enedis / attestation',
    'dv-line-admin-qty': '1',
    'dv-line-admin-unit': 'forfait',
    'dv-line-admin-price': '350',
    'dv-line-misc-label': 'Monitoring Solar.web',
    'dv-line-misc-qty': '1',
    'dv-line-misc-unit': 'u',
    'dv-line-misc-price': '120',
    'dv-tva': '10',
    'dv-remise': '0',
    'dv-validity': '45',
    'dv-notes': "Acompte 30 % à la commande, solde à la mise en service.\nGarantie panneaux 30 ans (producteur), main d'œuvre 10 ans.\nDélai prévisionnel : 8 à 12 semaines après acceptation.",
    'dv-date': new Date().toLocaleDateString('fr-FR'),
    'dv-ref': 'DEV-DEMO-OSE'
  };

  const annualConso = monthlyKwh.reduce((s, v) => s + v, 0);

  const demo = {
    id: DEMO_PROJECT_ID,
    name: 'Démo complète — Maison Toulouse',
    isDemo: true,
    demoSeedVersion: DEMO_SEED_VERSION,
    installationType: 'grid',
    client: {
      nom: 'Famille Martin',
      adresse: '7 chemin des Coteaux, 31400 Toulouse',
      tel: '06 45 78 12 33',
      email: 'martin.famille@example.fr'
    },
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    location: {
      lat: toulouse.lat,
      lon: toulouse.lon,
      alt: toulouse.alt,
      name: toulouse.name + ' (démo)'
    },
    weatherData: toulouse.monthly,
    hourlyEnedisData: {
      halfHourly: Array.from(halfHourly),
      year,
      format: '30min'
    },
    monthlyKwhHp,
    enedisYear: year,
    formState,
    summary: {
      annualConso,
      recommendedPpeak: null,
      systemCost: null,
      coverageRate: null,
      locationName: toulouse.name,
      hasEnedis30min: true,
      note: 'Projet démo : calculs lancés à l’ouverture'
    }
  };

  ProjectManager.save(demo);
}

// ══════════════════════════════════════════════════════════════
//  DÉMO HYBRIDE (réseau + batterie) — second projet démo
// ══════════════════════════════════════════════════════════════
function seedDemoHybridProject() {
  const existing = ProjectManager.get(DEMO_HYBRID_PROJECT_ID);
  if (existing && existing.demoSeedVersion === DEMO_HYBRID_SEED_VERSION) return;

  const nice = AppState.demoData?.locations?.nice;
  if (!nice) return;

  const year = 2024;
  // Conso un peu plus élevée que la démo réseau : ménage type avec plus d'usages
  // le soir (justifie l'intérêt d'une batterie pour l'autoconsommation nocturne).
  const monthlyKwh = demoMonthlyKwh().map(v => Math.round(v * 1.15));
  const monthlyKwhHp = demoMonthlyKwhHp(monthlyKwh);
  const halfHourly = buildSyntheticEnedis30min(monthlyKwh, year);
  const days = demoMonthDays(year);

  const dailyWhByMonth = monthlyKwh.map((kwh, i) =>
    String(Math.round((kwh * 1000) / days[i]))
  );

  const panelModel = 'Longi Hi-MO 6 430W';
  const panelWp = '430';
  const panelM2 = '2.00';
  const surface = '28';
  const tilt = '28';
  const azimuth = '0';
  const losses = '12';
  const nPanels = '14';
  const battKwh = '7.5';

  const formState = {
    'sz-tariff': 'hphc',
    'sz-price-base': '0.2516',
    'sz-price-hp': '0.27',
    'sz-price-hc': '0.2068',
    'sz-subscription': '164.64',
    ...Object.fromEntries(monthlyKwh.map((v, i) => [`sz-kwh-${i + 1}`, String(v)])),
    'sz-tilt': tilt,
    'sz-azimuth': azimuth,
    'sz-surface': surface,
    'sz-panel-model': panelModel,
    'sz-panel-wp': panelWp,
    'sz-panel-m2': panelM2,
    'sz-losses': losses,
    'sz-tech': 'crystSi',
    'sz-strategy': 'bill_coverage_pct',
    'sz-target-coverage': '80',
    'sz-cost-kwp': '1800',
    'sz-cost-total': '',
    'sz-feedin': '0.13',
    'sz-elec-escalation': '3',
    'sz-discount-rate': '4',
    'sz-panel-degradation': '0.5',
    'sz-finance-years': '25',
    'sz-batt-tech': 'lfp',
    'sz-batt-kwh': battKwh,
    'inp-surface': surface,
    'inp-panel-model': panelModel,
    'inp-panel-wp': panelWp,
    'inp-panel-m2': panelM2,
    'sel-tech': 'crystSi',
    'inp-losses': losses,
    'inp-tilt': tilt,
    'inp-azimuth': azimuth,
    'inp-cost': '13500',
    'inp-kwh-price': '0.2516',
    'inp-co2': '0.052',
    'grid-panel-mode': 'fixe',
    'grid-npanels-fixe': nPanels,
    'dv-ins-company': 'Soleil Occitan SARL',
    'dv-ins-siret': '812 345 678 00012',
    'dv-ins-rge': 'E-E190909-4521',
    'dv-ins-address': '18 avenue des Pyrénées\n31100 Toulouse',
    'dv-ins-phone': '05 61 98 76 54',
    'dv-ins-email': 'contact@soleil-occitan.fr',
    'dv-cli-name': 'Famille Rossi',
    'dv-cli-company': '',
    'dv-cli-address': '22 boulevard de Cimiez\n06000 Nice',
    'dv-cli-phone': '06 78 90 12 45',
    'dv-cli-email': 'rossi.famille@example.fr',
    'dv-site-address': '22 boulevard de Cimiez, 06000 Nice',
    'dv-site-type': 'Tuiles plates',
    'dv-site-surface': surface,
    'dv-site-tilt': tilt,
    'dv-site-azimuth': azimuth,
    'dv-sys-ppeak': '',
    'dv-sys-panels': nPanels,
    'dv-sys-panel-model': panelModel,
    'dv-sys-inverter': 'Growatt SPH 6000',
    'dv-sys-batt': battKwh,
    'dv-sys-prod': '',
    'dv-sys-co2': '',
    'dv-sys-autonomy': '',
    'dv-line-panels-label': 'Panneaux photovoltaïques Longi 430W',
    'dv-line-panels-qty': nPanels,
    'dv-line-panels-unit': 'u',
    'dv-line-panels-price': '98',
    'dv-line-inverter-label': 'Onduleur hybride Growatt SPH 6000',
    'dv-line-inverter-qty': '1',
    'dv-line-inverter-unit': 'u',
    'dv-line-inverter-price': '1850',
    'dv-line-fixations-label': 'Fixations / structure toiture tuiles',
    'dv-line-fixations-qty': '1',
    'dv-line-fixations-unit': 'forfait',
    'dv-line-fixations-price': '720',
    'dv-line-cabling-label': 'Câblage DC/AC + protections + coffret',
    'dv-line-cabling-qty': '1',
    'dv-line-cabling-unit': 'forfait',
    'dv-line-cabling-price': '580',
    'dv-line-labor-label': "Main d'œuvre pose",
    'dv-line-labor-qty': '3',
    'dv-line-labor-unit': 'jours',
    'dv-line-labor-price': '450',
    'dv-line-admin-label': 'Démarches Consuel / Enedis / attestation',
    'dv-line-admin-qty': '1',
    'dv-line-admin-unit': 'forfait',
    'dv-line-admin-price': '350',
    'dv-line-misc-label': `Batterie LFP ${battKwh} kWh`,
    'dv-line-misc-qty': '1',
    'dv-line-misc-unit': 'u',
    'dv-line-misc-price': '3000',
    'dv-tva': '10',
    'dv-remise': '0',
    'dv-validity': '45',
    'dv-notes': "Acompte 30 % à la commande, solde à la mise en service.\nGarantie panneaux 30 ans (producteur), main d'œuvre 10 ans, batterie 10 ans.\nDélai prévisionnel : 8 à 12 semaines après acceptation.",
    'dv-date': new Date().toLocaleDateString('fr-FR'),
    'dv-ref': 'DEV-DEMO-HYBRIDE'
  };

  const annualConso = monthlyKwh.reduce((s, v) => s + v, 0);

  const demo = {
    id: DEMO_HYBRID_PROJECT_ID,
    name: 'Démo hybride — Villa Nice (réseau + batterie)',
    isDemo: true,
    demoSeedVersion: DEMO_HYBRID_SEED_VERSION,
    installationType: 'hybrid',
    client: {
      nom: 'Famille Rossi',
      adresse: '22 boulevard de Cimiez, 06000 Nice',
      tel: '06 78 90 12 45',
      email: 'rossi.famille@example.fr'
    },
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    location: {
      lat: nice.lat,
      lon: nice.lon,
      alt: nice.alt,
      name: nice.name + ' (démo hybride)'
    },
    weatherData: nice.monthly,
    hourlyEnedisData: {
      halfHourly: Array.from(halfHourly),
      year,
      format: '30min'
    },
    monthlyKwhHp,
    enedisYear: year,
    formState,
    summary: {
      annualConso,
      recommendedPpeak: null,
      systemCost: null,
      coverageRate: null,
      locationName: nice.name,
      hasEnedis30min: true,
      note: 'Projet démo hybride : réseau + batterie, calculs lancés à l’ouverture'
    }
  };

  ProjectManager.save(demo);
}

function openDemoProject() {
  seedDemoProject();
  loadProject(DEMO_PROJECT_ID);
}

function openDemoHybridProject() {
  seedDemoHybridProject();
  loadProject(DEMO_HYBRID_PROJECT_ID);
}

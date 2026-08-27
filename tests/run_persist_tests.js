/**
 * tests/run_persist_tests.js — Persistance projets (créer / rejoindre / seed / reload)
 * Usage : node tests/run_persist_tests.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
  console.log('  ✓', msg);
};

function loadPM(localStorage, bridge) {
  const sandbox = {
    localStorage,
    window: { webBridge: bridge, nativeBridge: bridge },
    getNativeBridge: () => bridge,
    console,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    TextEncoder,
    Blob: class Blob { constructor(parts) { this.parts = parts; } },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    document: { createElement: () => ({ click() {}, set href(v) {}, set download(v) {} }) },
    showToast() {},
    JSZip: null,
  };
  const src = fs.readFileSync(path.join(__dirname, '../js/project_manager.js'), 'utf8');
  vm.runInNewContext(src + '\nthis.PM = ProjectManager;', sandbox);
  return sandbox.PM;
}

console.log('\n═══ Persistance ProjectManager ═══');

const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};

let nativeBackup = '';
const bridge = {
  saveProjectsBackup(json) {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) throw new Error('not array');
    nativeBackup = JSON.stringify(parsed);
    return true;
  },
  loadProjectsBackup() {
    return nativeBackup;
  },
};

const PM = loadPM(localStorage, bridge);

const user = {
  id: 'proj_user_persist_1',
  name: 'Maison Test Persist',
  isDemo: false,
  installationType: 'grid',
  client: { nom: 'Dupont', adresse: '1 rue Test', tel: '', email: '' },
  location: { lat: 43.6, lon: 1.44, alt: 150, name: 'Toulouse' },
  weatherData: [{ GHI: 80 }, { GHI: 100 }],
  formState: { 'sz-kwh-1': '420', 'sz-tilt': '30' },
  summary: { annualConso: 4200, locationName: 'Toulouse' },
  calcResults: { recommendedPpeak: 3.2, fingerprint: 'abc' },
};
assert(PM.save(user) === true, 'save projet utilisateur');
assert(nativeBackup.includes('Maison Test Persist'), 'miroir natif après save');
assert(PM.get('proj_user_persist_1')?.formState?.['sz-kwh-1'] === '420', 'données form présentes');

const joined = {
  id: 'proj_joined_1',
  name: 'Projet Rejoint Collègue',
  isDemo: false,
  share: { enabled: true, keyB64: 'dGVzdGtleTEyMw==', rev: 3, createdAt: new Date().toISOString() },
  formState: { 'sz-kwh-1': '999' },
  location: { lat: 48.8, lon: 2.3, alt: 40, name: 'Paris' },
  summary: {},
};
assert(PM.save(joined) === true, 'save projet rejoint');
assert(typeof PM.flushBackup === 'function', 'flushBackup exposé');
PM.flushBackup();
assert(JSON.parse(nativeBackup).length >= 2, 'miroir contient user + join');

// Simuler MAJ : localStorage vide, backup natif intact
{
  const store2 = new Map();
  const ls2 = {
    getItem: (k) => (store2.has(k) ? store2.get(k) : null),
    setItem: (k, v) => { store2.set(k, String(v)); },
    removeItem: (k) => { store2.delete(k); },
  };
  const PM2 = loadPM(ls2, bridge);
  const restored = PM2.list();
  assert(restored.length >= 2, 'restauration depuis miroir natif après wipe localStorage');
  const u = restored.find(p => p.id === 'proj_user_persist_1');
  const j = restored.find(p => p.id === 'proj_joined_1');
  assert(!!u && u.formState['sz-kwh-1'] === '420', 'user: conso conservée après « MAJ »');
  assert(!!u && u.calcResults?.recommendedPpeak === 3.2, 'user: résultats calcul conservés');
  assert(!!j && j.share?.keyB64 === 'dGVzdGtleTEyMw==', 'join: clé share conservée');
  assert(j.formState['sz-kwh-1'] === '999', 'join: form conservé');
}

// Bridge pas prêt au 1er list : ne pas bloquer la restauration ultérieure
{
  const store3 = new Map();
  const ls3 = {
    getItem: (k) => (store3.has(k) ? store3.get(k) : null),
    setItem: (k, v) => { store3.set(k, String(v)); },
    removeItem: (k) => { store3.delete(k); },
  };
  let ready = false;
  const lateBridge = {
    saveProjectsBackup: bridge.saveProjectsBackup,
    loadProjectsBackup() { return ready ? nativeBackup : ''; },
  };
  // First load without methods
  const PM3 = loadPM(ls3, {});
  assert(PM3.list().length === 0, 'sans bridge : liste vide OK');
  // Attach bridge later
  ls3.window = { webBridge: lateBridge };
  // Re-bind via getNativeBridge
  const sandboxBridge = lateBridge;
  // Reload with bridge that becomes ready
  const PM4 = loadPM(ls3, {
    loadProjectsBackup() { return nativeBackup; },
    saveProjectsBackup: bridge.saveProjectsBackup,
  });
  assert(PM4.list().length >= 2, 'restauration quand bridge arrive après coup');
  ready = true;
}

console.log('\nTous les tests de persistance OK\n');

/**
 * tests/run_weather_persist_tests.js — sérialisation météo horaire compacte
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
  console.log('  ✓', msg);
};

const src = fs.readFileSync(path.join(__dirname, '../js/project_forms.js'), 'utf8');
// Ne charger que les helpers (avant captureFormState) pour éviter les listeners DOM
const cut = src.indexOf('function captureFormState');
if (cut < 0) throw new Error('captureFormState introuvable');
const helpers = src.slice(0, cut);

const sandbox = {
  console,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  Float32Array,
  Uint8Array,
};
vm.createContext(sandbox);
vm.runInContext(helpers, sandbox);

console.log('\n═══ Sérialisation météo horaire ═══');
const n = 8784;
const ghi = new Float32Array(n);
const dhi = new Float32Array(n);
const temp = new Float32Array(n);
for (let i = 0; i < n; i++) {
  ghi[i] = (i % 24) * 10;
  dhi[i] = (i % 24) * 3;
  temp[i] = 10 + (i % 12);
}

const enc = sandbox.serializeHourlyWeather({ ghi, dhi, temp, year: 2024, nHours: n });
assert(enc && enc.encoding === 'f32b64', 'encoding f32b64');
assert(typeof enc.ghi === 'string' && enc.ghi.length > 100, 'ghi en base64');
assert(enc.ghi.length < n * 8, 'plus compact qu’un JSON de nombres');

const dec = sandbox.deserializeHourlyWeather(enc);
assert(dec.ghi.length === n, 'ghi restauré');
assert(Math.abs(dec.ghi[100] - ghi[100]) < 1e-5, 'valeur ghi intacte');
assert(Math.abs(dec.temp[50] - temp[50]) < 1e-5, 'valeur temp intacte');

const legacy = sandbox.deserializeHourlyWeather({
  year: 2023,
  nHours: 3,
  ghi: [1, 2, 3],
  dhi: [0, 0, 0],
  temp: [10, 11, 12],
});
assert(legacy.ghi[2] === 3, 'legacy Array OK');

const en = sandbox.serializeEnedisHourly({ year: 2024, format: '30min', halfHourly: ghi });
const en2 = sandbox.deserializeEnedisHourly(en);
assert(en2.halfHourly.length === n, 'enedis roundtrip');

console.log('\nOK\n');

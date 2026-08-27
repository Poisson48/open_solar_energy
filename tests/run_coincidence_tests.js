#!/usr/bin/env node
/**
 * tests/run_coincidence_tests.js — Coincidence temporelle vs min(prod,conso) mensuel
 * Usage : node tests/run_coincidence_tests.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = {
  console,
  Math,
  parseFloat,
  parseInt,
  isNaN,
  isFinite,
  Array,
  Object,
  Float32Array,
  JSON,
  Number,
};
vm.createContext(ctx);

function load(rel) {
  let code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // Strip Node export lines for browser IIFEs
  code = code.replace(/if\s*\(typeof module[\s\S]*$/m, '');
  vm.runInContext(code, ctx, { filename: rel });
}
function evalCtx(expr) {
  return vm.runInContext(expr, ctx);
}

load('js/constants.js');
load('js/solar_math.js');
load('js/pv_profiles.js');

const SolarMath = evalCtx('SolarMath');
const PvProfiles = evalCtx('PvProfiles');
const DAYS = evalCtx('DAYS_IN_MONTH');

let fails = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else { console.error('  ✗', msg); fails++; }
}

const weather = Array.from({ length: 12 }, (_, i) => ({
  GHI: [50, 70, 110, 150, 190, 210, 220, 200, 150, 100, 55, 40][i],
  DHI: [25, 30, 45, 55, 65, 70, 70, 65, 55, 40, 28, 22][i],
  T_avg: [5, 6, 9, 12, 16, 20, 22, 22, 18, 13, 8, 5][i],
}));
const monthlyKwh = [450, 400, 380, 340, 320, 300, 290, 300, 330, 380, 420, 460];
const lat = 43.6, tilt = 30, az = 0, losses = 14;

const monthlyHtilt = weather.map((m, i) =>
  SolarMath.tiltedIrradiation(m.GHI, m.DHI, lat, tilt, az, i + 1)
);
const monthlyProd1kwc = monthlyHtilt.map((H, i) =>
  SolarMath.pvProduction(H, 1, losses, weather[i].T_avg, 'crystSi', i + 1, lat)
);

const monthlyAutoconso = monthlyProd1kwc.reduce((s, prod, i) => s + Math.min(prod, monthlyKwh[i]), 0);

const pvProf = PvProfiles.buildMonthlyProfiles(weather, monthlyHtilt, losses, tilt, az, lat, 'crystSi');
const pvFlat = PvProfiles.flattenToYear(pvProf, DAYS);
const loadFlat = PvProfiles.buildSyntheticLoadYear(monthlyKwh, 2023);

let slotAutoconso = 0, slotProd = 0, slotConso = 0;
for (let i = 0; i < pvFlat.length; i++) {
  const p = (pvFlat[i] || 0);
  const c = loadFlat[i] || 0;
  slotProd += p;
  slotConso += c;
  slotAutoconso += Math.min(p, c);
}

console.log('\n═══ Coincidence temporelle ═══');
console.log(`  monthly min(prod,conso) autoconso @1kWc = ${monthlyAutoconso.toFixed(1)} kWh`);
console.log(`  slot synthetic autoconso @1kWc         = ${slotAutoconso.toFixed(1)} kWh`);
console.log(`  ratio slot/monthly                     = ${(slotAutoconso / monthlyAutoconso).toFixed(3)}`);

assert(Math.abs(slotConso - monthlyKwh.reduce((a, b) => a + b, 0)) < 2, 'conso annuelle synthétique ≈ facture');
assert(slotAutoconso < monthlyAutoconso * 0.98, 'slots moins optimistes que min mensuel (≥2 % écart)');
assert(slotAutoconso > monthlyAutoconso * 0.4, 'slots pas absurdes (autoconso > 40 % du mensuel)');
assert(slotProd > 0 && slotProd < 2000, 'prod annuelle 1 kWc raisonnable');

const shaded = new Float32Array(pvFlat);
const loss = Array(12).fill(0.2);
PvProfiles.applyMonthlyShade(shaded, DAYS, loss);
const sumBefore = pvFlat.reduce((s, v) => s + v, 0);
const sumAfter = shaded.reduce((s, v) => s + v, 0);
assert(Math.abs(sumAfter / sumBefore - 0.8) < 0.02, 'ombrage 20 % → prod ×0.8');

console.log(fails ? `\nFAIL (${fails})` : '\nPASS');
process.exit(fails ? 1 : 0);

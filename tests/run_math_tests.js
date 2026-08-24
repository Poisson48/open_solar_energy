#!/usr/bin/env node
/**
 * Tests unitaires math — Open Solar Energy
 * Charge solar_math.js dans un contexte Node minimal.
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
};
vm.createContext(ctx);

function load(rel) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(code, ctx, { filename: rel });
}

load('js/constants.js');
load('js/solar_math.js');

function evalCtx(expr) {
  return vm.runInContext(expr, ctx);
}

const SM = evalCtx('SolarMath');
const lat = 43.6;
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL:', msg);
}

function near(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ~${b} (±${tol})`);
}

// T1 — Rb juin Toulouse 30° Sud
const rb = SM.calcRb(43.6, 30, 0, 6);
assert(rb > 0.85 && rb < 1.05, 'T1 calcRb juin');

// T2 — Azimut Est ≠ Sud
const rbEast = SM.calcRb(43.6, 30, -90, 6);
const rbSouth = SM.calcRb(43.6, 30, 0, 6);
assert(Math.abs(rbEast - rbSouth) > 0.01, 'T2 azimut modifie Rb');

// T3 — Conservation GHI horaire (tilt=0, profil sinusoïdal)
const monthData = { GHI: 218.6, DHI: 72.1 };
let sumH = 0;
for (let h = 0; h < 24; h++) sumH += SM.hourlyIrradiance(lat, 6, h, monthData, 0, 0);
near(sumH, monthData.GHI * 1000 / 30, monthData.GHI * 20, 'T3 conservation GHI horaire');

// T4 — pvProduction dimensionnelle
const prod = SM.pvProduction(150, 3, 14, 21, 'crystSi', 6, lat);
assert(prod > 300 && prod < 450, 'T4 pvProduction juin 3kWc');

// T5 — gridSystemAnnual Toulouse-like weather
const weather = [
  { name: 'Jan', GHI: 60, DHI: 30, T_avg: 5 },
  { name: 'Fév', GHI: 80, DHI: 40, T_avg: 6 },
  { name: 'Mar', GHI: 120, DHI: 55, T_avg: 9 },
  { name: 'Avr', GHI: 160, DHI: 70, T_avg: 12 },
  { name: 'Mai', GHI: 200, DHI: 85, T_avg: 16 },
  { name: 'Jun', GHI: 220, DHI: 90, T_avg: 21 },
  { name: 'Jul', GHI: 230, DHI: 95, T_avg: 24 },
  { name: 'Aoû', GHI: 210, DHI: 88, T_avg: 23 },
  { name: 'Sep', GHI: 170, DHI: 72, T_avg: 18 },
  { name: 'Oct', GHI: 120, DHI: 55, T_avg: 13 },
  { name: 'Nov', GHI: 70, DHI: 35, T_avg: 8 },
  { name: 'Déc', GHI: 55, DHI: 28, T_avg: 4 },
];
const grid = SM.gridSystemAnnual({
  lat, weatherData: weather, Ppeak: 3, losses: 14, tilt: 30, azimuth: 0,
  systemCost: 3600, kwhPrice: 0.25, co2Factor: 0.052
});
assert(grid.E_annual > 2500 && grid.E_annual < 5500, 'T5 production annuelle 3kWc');
assert(grid.PR > 0.7 && grid.PR <= 1, 'T5 PR');

// T7 — offgridSystem : production journalière réaliste (fix P0)
const off = SM.offgridSystem({
  lat, weatherData: weather, Ppeak: 3, battCap: 10000, dod: 80,
  dailyConsumption: 8000, tilt: 30, azimuth: 0
});
const june = off[5];
assert(june.solarDaily > 10 && june.solarDaily < 25, 'T7 offgrid solarDaily juin');

// T8 — optimalTilt retourne des valeurs
const opt = SM.optimalTilt(lat, weather, false);
assert(opt.tilt >= 0 && opt.tilt <= 90, 'T8 optimalTilt');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

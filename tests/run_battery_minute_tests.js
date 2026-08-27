#!/usr/bin/env node
/**
 * tests/run_battery_minute_tests.js — Batterie : nuit + ombrage temporel
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = {
  console, Math, parseFloat, parseInt, isNaN, isFinite,
  Array, Object, Float32Array, JSON, Number,
  document: { getElementById: () => null },
  window: {},
  AppState: { location: { lat: 43.6, lon: 1.4 }, siteSurvey: null, hourlyEnedisData: null, hourlyWeatherData: null },
};
vm.createContext(ctx);

function loadScript(rel) {
  let code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  code = code.replace(/if\s*\(typeof module[\s\S]*$/m, '');
  vm.runInContext(code, ctx, { filename: rel });
}
function evalCtx(expr) {
  return vm.runInContext(expr, ctx);
}

loadScript('js/constants.js');
loadScript('js/solar_math.js');
loadScript('js/pv_profiles.js');
loadScript('js/hourly_module.js');
loadScript('js/offgrid_sizing.js');

const PvProfiles = evalCtx('PvProfiles');
const OffgridSizing = evalCtx('OffgridSizing');
const DAYS = evalCtx('DAYS_IN_MONTH');

let fails = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else { console.error('  ✗', msg); fails++; }
}

console.log('\n═══ Batterie minute / nuit / ombrage ═══');

const daysArr = DAYS.slice();
const totalDays = daysArr.reduce((a, b) => a + b, 0);
const pvFlat = new Float32Array(totalDays * 48);
const loadFlat = new Float32Array(totalDays * 48);
let di = 0;
for (let m = 0; m < 12; m++) {
  for (let d = 0; d < daysArr[m]; d++, di++) {
    for (let s = 0; s < 48; s++) {
      const h = Math.floor(s / 2);
      const idx = di * 48 + s;
      loadFlat[idx] = 0.5 / 48;
      pvFlat[idx] = (h >= 9 && h < 16) ? 0.08 : 0;
    }
  }
}

const metrics = OffgridSizing.simulateYearSlots(loadFlat, pvFlat, 3, 5, 0.97, 2023);
assert(!!metrics, 'simulateYearSlots retourne des mois');
const nightBatt = metrics.reduce((s, m) => s + (m.night_batt_kwh || 0), 0);
const totalConso = metrics.reduce((s, m) => s + m.conso_kwh, 0);
assert(totalConso > 100, `conso annuelle > 100 kWh (${totalConso.toFixed(0)})`);
assert(nightBatt > 10, `décharge batterie de nuit > 10 kWh (${nightBatt.toFixed(1)})`);

const keep = Array.from({ length: 12 }, () => {
  const row = new Float32Array(48);
  for (let s = 0; s < 48; s++) row[s] = Math.floor(s / 2) < 12 ? 0 : 1;
  return row;
});
const pv2 = new Float32Array(totalDays * 48);
pv2.fill(0.05);
PvProfiles.applyTemporalShade(pv2, daysArr, keep);
let morning = 0, afternoon = 0;
di = 0;
for (let m = 0; m < 12; m++) {
  for (let d = 0; d < daysArr[m]; d++, di++) {
    for (let s = 0; s < 48; s++) {
      const v = pv2[di * 48 + s];
      if (s < 24) morning += v; else afternoon += v;
    }
  }
}
assert(morning < 1e-6, `ombrage matin → PV≈0 (${morning})`);
assert(afternoon > 100, `après-midi conservé (${afternoon.toFixed(0)})`);

const dn = PvProfiles.buildDayNightLoadYear(null, 8, 4, 2023);
assert(!!dn && dn.length >= 48 * 365, 'buildDayNightLoadYear longueur année');
let nightSum = 0, daySum = 0;
for (let i = 0; i < 48; i++) {
  const h = Math.floor(i / 2);
  const v = dn[i];
  if (h < 6 || h >= 21) nightSum += v; else daySum += v;
}
assert(Math.abs(daySum - 8) < 0.05, `jour ≈ 8 kWh (${daySum.toFixed(2)})`);
assert(Math.abs(nightSum - 4) < 0.05, `nuit ≈ 4 kWh (${nightSum.toFixed(2)})`);
const yearDn = Array.from(dn).reduce((a, b) => a + b, 0);
assert(Math.abs(yearDn - 12 * 365) < 1, `année ≈ 12×365 (${yearDn.toFixed(0)})`);

const pv3 = new Float32Array(48);
pv3.fill(1);
const daysTiny = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const keep2 = Array.from({ length: 12 }, () => new Float32Array(48).fill(0.5));
PvProfiles.applySiteShade(pv3, daysTiny, { halfHourlyKeep: keep2, monthlyLoss: new Array(12).fill(0.9) });
assert(Math.abs(pv3[0] - 0.5) < 1e-6, 'applySiteShade utilise halfHourlyKeep (0.5)');

const twoH = [0.5, 0.4, 0.3, 0.5, 0.8, 1.0, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5]; // sum 8
const flat2h = PvProfiles.buildTwoHourLoadYear(null, twoH, 2023);
assert(!!flat2h && flat2h.length >= 48 * 365, 'buildTwoHourLoadYear longueur');
const day2h = Array.from(flat2h.slice(0, 48)).reduce((a, b) => a + b, 0);
assert(Math.abs(day2h - 8) < 0.05, `profil 2h jour ≈ 8 kWh (${day2h.toFixed(2)})`);
const nightFrom2h = PvProfiles.nightKwhFromTwoHour(twoH);
assert(nightFrom2h > 1.5 && nightFrom2h < 3, `nuit depuis 2h ≈ 2 (${nightFrom2h.toFixed(2)})`);

// Offgrid : jour/nuit dicte plancher batterie
const wx = Array.from({ length: 12 }, (_, i) => ({
  GHI: 80 + i * 5, DHI: 30, T_avg: 15,
}));
ctx.AppState.weatherData = wx;
ctx.AppState.location = { lat: 43.6, lon: 1.4 };
ctx.AppState.siteSurvey = null;
ctx.AppState.hourlyEnedisData = null;
ctx.AppState.hourlyWeatherData = null;
const inputDN = {
  site: { tilt: 30, azimuth: 0, maxSurfaceM2: 40, panelWattPeak: 400, panelSurfaceM2: 1.96, losses: 14, nPanelsFixed: 0 },
  conso: { dailyWh: new Array(12).fill(0), dayKwhPerDay: 8, nightKwhPerDay: 4, twoHourKwh: null },
  battery: { type: 'lfp', capacityKwh: 0 },
  sizing: { targetCoveragePct: 90, pvCostPerKwp: 650, bosCost: 500 },
};
const out = OffgridSizing.run(inputDN, wx, 43.6);
assert(!!out.recommended, 'offgrid jour/nuit → recommandation');
assert(out.minBattFromNight >= 4 / 0.8 - 0.2, `plancher batt. nuit (${out.minBattFromNight})`);
assert(out.recommended.C_batt_gross + 0.05 >= out.minBattFromNight,
  `batt. reco ≥ plancher nuit (${out.recommended.C_batt_gross} ≥ ${out.minBattFromNight})`);
assert(out.loadSource === 'day_night', `loadSource day_night (${out.loadSource})`);

console.log(fails === 0 ? '\nOK\n' : `\n${fails} échec(s)\n`);
process.exit(fails === 0 ? 0 : 1);

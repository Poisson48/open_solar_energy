#!/usr/bin/env node
/**
 * tests/run_orientation_tests.js — Cap / pitch / écran (plat + debout portrait/paysage)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/site_survey.js'), 'utf8');

const sandbox = {
  console,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  window: {
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 800,
    innerHeight: 1200,
    orientation: 0,
  },
  document: { getElementById: () => null },
  screen: {
    orientation: {
      angle: 0,
      addEventListener() {},
      removeEventListener() {},
    },
  },
  Math,
  parseFloat,
  isNaN,
  Number,
  String,
  Array,
  Object,
  Date,
  setTimeout,
  clearTimeout,
};
sandbox.window.screen = sandbox.screen;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src + '\nthis.SiteSurvey = SiteSurvey;', sandbox);
const SS = sandbox.SiteSurvey;
if (!SS) {
  console.error('SiteSurvey non chargé');
  process.exit(1);
}

let fails = 0;
function check(label, ok, detail) {
  if (ok) console.log('  ✓ ' + label + (detail ? ' — ' + detail : ''));
  else {
    console.error('  ✗ ' + label + (detail ? ' — ' + detail : ''));
    fails++;
  }
}

function approx(a, b, tol) {
  return Math.abs(a - b) <= (tol == null ? 0.6 : tol);
}

function circClose(a, b, tol) {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d <= (tol == null ? 1.5 : tol);
}

console.log('== Angle écran / libellés ==');
check('portrait 0 → portrait', SS.screenAngleLabel(0) === 'portrait');
check('paysage 90 → paysage', SS.screenAngleLabel(90) === 'paysage');
check('paysage 270 → paysage', SS.screenAngleLabel(270) === 'paysage');
check('180 → portrait inversé', SS.screenAngleLabel(180) === 'portrait inversé');

console.log('\n== Cap à plat (360−alpha + écran) ==');
check('plat portrait nord', approx(
  SS.computeCompassHeading({ alpha: 0, beta: 0, gamma: 0, screenAng: 0 }), 0));
check('plat portrait est (alpha=270)', approx(
  SS.computeCompassHeading({ alpha: 270, beta: 5, gamma: 0, screenAng: 0 }), 90));
check('plat paysage +90', approx(
  SS.computeCompassHeading({ alpha: 0, beta: 0, gamma: 0, screenAng: 90 }), 90));
check('isDeviceFlat', SS.isDeviceFlat(10, 5) === true);
check('pas flat debout', SS.isDeviceFlat(90, 0) === false);

console.log('\n== Cap debout W3C (caméra) ==');
{
  // β=90, γ=0 → heading = −α ≡ 360−α (W3C)
  const h = SS.compassHeadingFromEuler(0, 90, 0);
  check('debout portrait nord (α=0,β=90)', circClose(h, 0), 'h=' + h);
  const h90 = SS.compassHeadingFromEuler(270, 90, 0);
  check('debout portrait est (α=270,β=90)', circClose(h90, 90), 'h=' + h90);
}
{
  // Même direction regardée, téléphone en paysage : β≈0, γ≈±90
  // α=0, γ=-90 → doit rester proche du nord (ou cohérent)
  const portrait = SS.compassHeadingFromEuler(45, 90, 0);
  const landscape = SS.compassHeadingFromEuler(45, 0, -90);
  check('paysage upright produit un cap fini', landscape != null && !isNaN(landscape),
    'h=' + landscape);
  // Les deux ne sont pas forcément égaux (axes différents) mais computeCompassHeading
  // ne doit PAS ajouter +90 en plus du W3C
  const viaApi = SS.computeCompassHeading({ alpha: 45, beta: 0, gamma: -90, screenAng: 90 });
  const viaW3c = SS.compassHeadingFromEuler(45, 0, -90);
  check('debout paysage : pas de double +screenAng',
    circClose(viaApi, viaW3c), viaApi + ' vs ' + viaW3c);
  check('portrait debout ignore screenAng',
    circClose(
      SS.computeCompassHeading({ alpha: 45, beta: 90, gamma: 0, screenAng: 90 }),
      SS.compassHeadingFromEuler(45, 90, 0)
    ));
  void portrait;
}

console.log('\n== Pitch écran (portrait / paysage) ==');
{
  const p = SS.screenPitchFromSensors(90, 0, 0);
  const e = SS.elevationFromScreenPitch(p);
  check('portrait vertical → pitch≈90', approx(p, 90), 'pitch=' + p.toFixed(1));
  check('portrait vertical → élév≈0', approx(e, 0), 'elev=' + e.toFixed(1));
}
{
  const p = SS.screenPitchFromSensors(120, 0, 0);
  const e = SS.elevationFromScreenPitch(p);
  check('portrait regard haut → élév≈30', approx(e, 30), 'elev=' + e.toFixed(1));
}
{
  const p = SS.screenPitchFromSensors(0, -90, 90);
  const e = SS.elevationFromScreenPitch(p);
  check('paysage 90 vertical → pitch≈90', approx(p, 90), 'pitch=' + p.toFixed(1));
  check('paysage 90 vertical → élév≈0', approx(e, 0), 'elev=' + e.toFixed(1));
}
{
  const p = SS.screenPitchFromSensors(0, -120, 90);
  const e = SS.elevationFromScreenPitch(p);
  check('paysage 90 regard haut → élév≈30', approx(e, 30), 'elev=' + e.toFixed(1));
}
{
  const p = SS.screenPitchFromSensors(0, 90, 270);
  const e = SS.elevationFromScreenPitch(p);
  check('paysage 270 vertical → pitch≈90', approx(p, 90), 'pitch=' + p.toFixed(1));
  check('paysage 270 vertical → élév≈0', approx(e, 0), 'elev=' + e.toFixed(1));
}

console.log('\n== Stabilité cap plat lors d’un roll portrait→paysage ==');
{
  const h0 = SS.headingWithScreen(180, 0);
  const h1 = SS.headingWithScreen(90, 90);
  check('cap stable après roll +90°', approx(h0, h1), h0.toFixed(0) + ' vs ' + h1.toFixed(0));
}

console.log('\n' + (fails === 0 ? '✅ ORIENTATION OK' : '❌ ' + fails + ' échec(s)'));
process.exit(fails === 0 ? 0 : 1);

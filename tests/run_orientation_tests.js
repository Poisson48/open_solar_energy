#!/usr/bin/env node
/**
 * tests/run_orientation_tests.js — Cap / pitch / écran (portrait ↔ paysage)
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
// const de premier niveau n'est pas exposé sur le contexte : on force l'export.
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

console.log('== Angle écran / libellés ==');
check('portrait 0 → portrait', SS.screenAngleLabel(0) === 'portrait');
check('paysage 90 → paysage', SS.screenAngleLabel(90) === 'paysage');
check('paysage 270 → paysage', SS.screenAngleLabel(270) === 'paysage');
check('180 → portrait inversé', SS.screenAngleLabel(180) === 'portrait inversé');

console.log('\n== Cap + compensation écran ==');
check('portrait : cap inchangé', approx(SS.headingWithScreen(180, 0), 180));
check('paysage 90 : +90°', approx(SS.headingWithScreen(180, 90), 270));
check('paysage 270 : +270°', approx(SS.headingWithScreen(10, 270), 280));
check('normalisation 350+90', approx(SS.headingWithScreen(350, 90), 80));

console.log('\n== Pitch écran (portrait / paysage) ==');
{
  const p = SS.screenPitchFromSensors(90, 0, 0);
  const e = SS.elevationFromScreenPitch(p);
  check('portrait vertical → pitch≈90', approx(p, 90), 'pitch=' + p.toFixed(1));
  check('portrait vertical → élév≈0', approx(e, 0), 'elev=' + e.toFixed(1));
}
{
  // Regard vers le ciel : beta > 90 (penché en arrière)
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
  // Paysage regard haut : |gamma| > 90 → pitch 120
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

console.log('\n== Stabilité cap lors d’un roll portrait→paysage ==');
{
  const h0 = SS.headingWithScreen(180, 0);
  const h1 = SS.headingWithScreen(90, 90);
  check('cap stable après roll +90°', approx(h0, h1), h0.toFixed(0) + ' vs ' + h1.toFixed(0));
}

console.log('\n' + (fails === 0 ? '✅ ORIENTATION OK' : '❌ ' + fails + ' échec(s)'));
process.exit(fails === 0 ? 0 : 1);

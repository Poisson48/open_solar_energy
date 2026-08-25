#!/usr/bin/env node
/**
 * Tests unitaires — Moteur câblage (cable_calc.js)
 * Charge js/cable_calc.js dans un contexte Node minimal (même approche que run_math_tests.js).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { console, Math, parseFloat, parseInt, isNaN, isFinite, Array, Object, JSON };
vm.createContext(ctx);

function load(rel) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(code, ctx, { filename: rel });
}

load('js/cable_calc.js');

function evalCtx(expr) {
  return vm.runInContext(expr, ctx);
}

const CC = evalCtx('CableCalc');
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

// ── T1 — Cas de référence : 10A, 30m aller, 400V DC, cuivre, chute 1% ────────
// S_min = 2 × (1/58) × 30 × 10 / (400×0.01) = 10.3448 / 4 ≈ 2.586 mm² → arrondi à 4 mm²
const t1 = CC.calcSection({ I: 10, L: 30, U_system: 400, circuit: 'dc', material: 'Cu' });
assert(t1.sectionMm2 === 4, `T1 section DC 10A/30m/400V Cu → 4mm² (got ${t1.sectionMm2})`);
near(t1.sectionMinRaw, 2.586, 0.01, 'T1 section théorique min');
near(t1.dropPct, 0.647, 0.01, 'T1 chute de tension % avec section retenue');
near(t1.lossW, 25.86, 0.1, 'T1 pertes Joule W');
assert(t1.compliant === true, 'T1 conforme à la chute de tension visée');

// ── T2 — Même cas en aluminium : résistivité plus élevée → section supérieure ──
const t2 = CC.calcSection({ I: 10, L: 30, U_system: 400, circuit: 'dc', material: 'Al' });
assert(t2.sectionMm2 >= t1.sectionMm2, 'T2 alu nécessite une section ≥ cuivre à courant/longueur égaux');
assert(t2.dropV > 0, 'T2 chute de tension positive');

// ── T3 — Une plus grande longueur augmente la section nécessaire ────────────
const t3short = CC.calcSection({ I: 10, L: 10, U_system: 400, circuit: 'dc', material: 'Cu' });
const t3long  = CC.calcSection({ I: 10, L: 60, U_system: 400, circuit: 'dc', material: 'Cu' });
assert(t3long.sectionMm2 >= t3short.sectionMm2, 'T3 section croît avec la longueur');
assert(t3long.dropPct > t3short.dropPct, 'T3 chute de tension croît avec la longueur');

// ── T4 — AC monophasé 230V, 16A, 20m, chute visée 1.5% (défaut AC) ──────────
const t4 = CC.calcSection({ I: 16, L: 20, U_system: 230, circuit: 'ac_mono', material: 'Cu' });
assert(t4.input.maxDropPct === 1.5, 'T4 défaut chute AC = 1.5%');
assert(CC.STANDARD_SECTIONS_MM2.includes(t4.sectionMm2), 'T4 section normalisée');
assert(t4.dropPct <= t4.input.maxDropPct + 1e-9, 'T4 conforme après arrondi');

// ── T5 — AC triphasé 400V utilise le facteur √3 pour la chute et 3 pour les pertes ─
const dropTri  = CC.evalSection({ section: 10, I: 20, L: 30, U_system: 400, circuit: 'ac_tri', material: 'Cu', cosPhi: 1 });
const dropMono = CC.evalSection({ section: 10, I: 20, L: 30, U_system: 400, circuit: 'ac_mono', material: 'Cu', cosPhi: 1 });
assert(dropTri.dropV < dropMono.dropV, 'T5 chute triphasée (√3) < monophasée (2) à section égale');
assert(dropTri.lossW > dropMono.lossW * 1.4, 'T5 pertes triphasées (facteur 3) > pertes mono (facteur 2)');

// ── T6 — cosφ réduit la chute de tension AC mais pas les pertes Joule ───────
const acFull = CC.evalSection({ section: 6, I: 15, L: 15, U_system: 230, circuit: 'ac_mono', cosPhi: 1 });
const acPf   = CC.evalSection({ section: 6, I: 15, L: 15, U_system: 230, circuit: 'ac_mono', cosPhi: 0.8 });
assert(acPf.dropV < acFull.dropV, 'T6 cosφ<1 réduit la chute de tension calculée');
near(acPf.lossW, acFull.lossW, 0.01, 'T6 pertes Joule indépendantes du cosφ (I²R)');

// ── T7 — roundUpToStandardSection : valeurs exactes ne sont pas surdimensionnées ──
assert(CC.roundUpToStandardSection(2.5) === 2.5, 'T7 valeur exacte 2.5 reste 2.5');
assert(CC.roundUpToStandardSection(2.51) === 4, 'T7 juste au-dessus de 2.5 → 4');
assert(CC.roundUpToStandardSection(0.5) === 1.5, 'T7 valeur sous le minimum → 1.5 (plus petite section standard)');
assert(CC.roundUpToStandardSection(500) === 300, 'T7 valeur hors plage → plafonnée à 300 (plus grande section)');

// ── T8 — table comparative : plus la section grandit, plus la chute diminue ─
const table = t1.table;
for (let i = 1; i < table.length; i++) {
  assert(table[i].dropPct <= table[i - 1].dropPct, `T8 chute décroissante section ${table[i].section}mm²`);
}
assert(table.some(r => r.recommended), 'T8 une ligne marquée recommandée');

// ── T9 — helper longueur DC depuis disposition panneaux ─────────────────────
// 12 panneaux, 2 rangées → 6 par rangée, pitch 1.8m, distance onduleur 8m, marge 1.15
// (6*1.8 + 8) * 1.15 = (10.8+8)*1.15 = 18.8*1.15 = 21.62
const dcLen = CC.estimateDcLength({ nPanels: 12, rows: 2, pitch: 1.8, distanceToInverter: 8 });
near(dcLen, 21.62, 0.05, 'T9 estimateDcLength');

// ── T10 — helper longueur AC onduleur → tableau ─────────────────────────────
const acLen = CC.estimateAcLength({ distance: 12 });
near(acLen, 13.2, 0.01, 'T10 estimateAcLength (marge 1.1)');

// ── T11 — helpers courant/tension string DC ─────────────────────────────────
const iString = CC.estimateStringCurrent({ iscPerPanel: 12, stringsParallel: 2 });
near(iString, 30, 0.01, 'T11 estimateStringCurrent (12A × 2 strings × 1.25)');
const uString = CC.estimateStringVoltage({ vocPerPanel: 41, panelsSeries: 10 });
near(uString, 410, 0.01, 'T11 estimateStringVoltage (41V × 10 panneaux)');

// ── T12 — helper courant AC depuis puissance onduleur ───────────────────────
const iAcMono = CC.estimateAcCurrent({ P_W: 3000, U_system: 230, circuit: 'ac_mono' });
near(iAcMono, 13.04, 0.05, 'T12 estimateAcCurrent monophasé 3000W/230V');
const iAcTri = CC.estimateAcCurrent({ P_W: 9000, U_system: 400, circuit: 'ac_tri' });
near(iAcTri, 12.99, 0.05, 'T12 estimateAcCurrent triphasé 9000W/400V');

// ── T13 — avertissement si aucune section standard ne convient ─────────────
const t13 = CC.calcSection({ I: 200, L: 500, U_system: 48, circuit: 'dc', material: 'Cu', maxDropPct: 1 });
assert(typeof t13.warning === 'string' && t13.warning.length > 0, 'T13 avertissement section hors plage');
assert(t13.sectionMm2 === 300, 'T13 section plafonnée à 300mm²');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

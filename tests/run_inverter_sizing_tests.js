#!/usr/bin/env node
/**
 * Tests unitaires — Dimensionnement onduleurs / chaînage (inverter_sizing.js)
 * Usage : node tests/run_inverter_sizing_tests.js
 */
'use strict';

const InverterSizing = require('../js/inverter_sizing.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL:', msg);
}

// ── T1 — maxSeriesFromVoc : cas de référence (panneau 41.2V, onduleur 1000V) ──
// floor(1000 / (41.2 × 1.15)) = floor(1000 / 47.38) = floor(21.11) = 21
const t1 = InverterSizing.maxSeriesFromVoc({ vocPanel: 41.2, maxVoc: 1000 });
assert(t1 === 21, `T1 maxSeriesFromVoc(41.2V, 1000V) → 21 (got ${t1})`);

// ── T2 — Voc plus élevé → moins de panneaux en série pour la même tension max ──
const t2a = InverterSizing.maxSeriesFromVoc({ vocPanel: 30, maxVoc: 1000 });
const t2b = InverterSizing.maxSeriesFromVoc({ vocPanel: 50, maxVoc: 1000 });
assert(t2a > t2b, `T2 Voc plus faible → chaîne plus longue (${t2a} vs ${t2b})`);

// ── T3 — maxVoc plus élevé → chaîne plus longue possible ──────────────────
const t3a = InverterSizing.maxSeriesFromVoc({ vocPanel: 40, maxVoc: 600 });
const t3b = InverterSizing.maxSeriesFromVoc({ vocPanel: 40, maxVoc: 1100 });
assert(t3b > t3a, `T3 maxVoc plus élevé → chaîne plus longue (${t3a} vs ${t3b})`);

// ── T4 — Données invalides / manquantes → 0 (pas de NaN, pas de crash) ─────
assert(InverterSizing.maxSeriesFromVoc({ vocPanel: 0, maxVoc: 1000 }) === 0, 'T4 Voc=0 → 0');
assert(InverterSizing.maxSeriesFromVoc({ vocPanel: 40, maxVoc: 0 }) === 0, 'T4 maxVoc=0 → 0');
assert(InverterSizing.maxSeriesFromVoc({}) === 0, 'T4 objet vide → 0');

// ── T5 — Voc × 1.15 dépassant déjà maxVoc → 0 chaîne possible ──────────────
const t5 = InverterSizing.maxSeriesFromVoc({ vocPanel: 900, maxVoc: 1000 });
assert(t5 === 0, `T5 Voc×1.15 > maxVoc → 0 panneau en série (got ${t5})`);

// ── T6 — Cohérence avec calcStringing() : même majoration Voc×1.15 ─────────
const stringing = InverterSizing.calcStringing({ Ppeak: 5, panelWp: 400, vocPanel: 41.2, iscPanel: 12, maxVoc: 1000, maxIsc: 20, nMppt: 2 });
assert(stringing.panelsPerString <= t1, `T6 calcStringing.panelsPerString (${stringing.panelsPerString}) ≤ maxSeriesFromVoc (${t1})`);

// ── T7 — recommend() : note MPPT insuffisant cohérente avec maxSeriesFromVoc ──
const recs = InverterSizing.recommend({ Ppeak: 6, systemType: 'grid', phase: 1, nPanels: 60, vocPanel: 41.2, iscPanel: 12 });
assert(Array.isArray(recs) && recs.length > 0, 'T7 recommend() renvoie des résultats');
const withMppt = recs.filter(r => r.nMppt);
assert(withMppt.length > 0, 'T7 au moins une reco string avec nMppt connu');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

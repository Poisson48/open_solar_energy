/**
 * cable_calc.js - Moteur de calcul câblage DC (strings PV) et AC (onduleur → tableau)
 *
 * Formules (chute de tension simplifiée, cohérente avec les usages électrotechniques
 * français NF C 15-100 / guide UTE C 15-712-1 pour le photovoltaïque) :
 *
 *   ΔU (V)   = b_U × ρ × L × I × cosφ / S
 *   P_perte  = b_P × ρ × L × I² / S
 *
 *   où : ρ = résistivité du conducteur (Ω·mm²/m), L = longueur aller (m, un seul sens),
 *        I = courant (A), S = section (mm²), cosφ = facteur de puissance (1 en DC),
 *        b_U = coefficient chute de tension : 2 en DC et AC monophasé (aller-retour),
 *              √3 en AC triphasé (tension composée, formule classique)
 *        b_P = coefficient pertes Joule : 2 en DC/AC mono (2 conducteurs parcourus par I),
 *              3 en AC triphasé (3 conducteurs de phase, neutre ~ nul si équilibré)
 *
 * Résistivité (conductivité normalisée) : Cuivre 1/58 Ω·mm²/m, Aluminium 1/34 Ω·mm²/m.
 *
 * Ce module est un moteur pur (aucun accès DOM) : utilisable en navigateur (window.CableCalc)
 * ou en Node (tests).
 */
const CableCalc = (() => {

  // ── Constantes ────────────────────────────────────────────────
  const RESISTIVITY = {
    Cu: 1 / 58, // ≈ 0.017241 Ω·mm²/m (cuivre recuit, conductivité 58 m/Ω·mm²)
    Al: 1 / 34, // ≈ 0.029412 Ω·mm²/m (aluminium, conductivité 34 m/Ω·mm²)
  };

  const MATERIALS = {
    Cu: { label: 'Cuivre',   resistivity: RESISTIVITY.Cu },
    Al: { label: 'Aluminium', resistivity: RESISTIVITY.Al },
  };

  // Sections commerciales normalisées (mm²)
  const STANDARD_SECTIONS_MM2 = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];

  // Coefficient chute de tension b_U (tension) et pertes Joule b_P (puissance)
  const CIRCUIT_TYPES = {
    dc:      { label: 'Courant continu (DC)',      dropFactor: 2,          lossFactor: 2, usesCosPhi: false },
    ac_mono: { label: 'Alternatif monophasé (AC)', dropFactor: 2,          lossFactor: 2, usesCosPhi: true  },
    ac_tri:  { label: 'Alternatif triphasé (AC)',  dropFactor: Math.sqrt(3), lossFactor: 3, usesCosPhi: true  },
  };

  const DC_ROUND_TRIP_FACTOR = CIRCUIT_TYPES.dc.dropFactor; // = 2, exposé tel que demandé

  const DEFAULT_MAX_DROP_PCT = { dc: 1, ac: 1.5 };

  // ── Utilitaires ───────────────────────────────────────────────
  function round(n, decimals = 2) {
    const f = Math.pow(10, decimals);
    return Math.round((n + Number.EPSILON) * f) / f;
  }

  function resolveMaterial(material) {
    return MATERIALS[material] ? material : 'Cu';
  }

  function resolveCircuit(circuit) {
    return CIRCUIT_TYPES[circuit] ? circuit : 'dc';
  }

  /** Arrondit une section théorique (mm²) à la section commerciale immédiatement supérieure. */
  function roundUpToStandardSection(sectionMm2) {
    for (const s of STANDARD_SECTIONS_MM2) {
      if (s >= sectionMm2 - 1e-9) return s;
    }
    return STANDARD_SECTIONS_MM2[STANDARD_SECTIONS_MM2.length - 1];
  }

  /**
   * Évalue une section donnée (mm²) pour un circuit : chute de tension, pertes.
   * @param {{section:number, I:number, L:number, U_system:number, material?:string, circuit?:string, cosPhi?:number}} p
   */
  function evalSection(p) {
    const material = resolveMaterial(p.material);
    const circuit  = resolveCircuit(p.circuit);
    const cfg      = CIRCUIT_TYPES[circuit];
    const rho      = MATERIALS[material].resistivity;
    const cosPhi   = cfg.usesCosPhi ? (p.cosPhi ?? 1) : 1;
    const I        = Math.max(0, p.I || 0);
    const L        = Math.max(0, p.L || 0);
    const S        = Math.max(0.01, p.section || 0);
    const U        = Math.max(1e-9, p.U_system || 0);

    const dropV   = cfg.dropFactor * rho * L * I * cosPhi / S;
    const dropPct = (dropV / U) * 100;
    const lossW   = cfg.lossFactor * rho * L * I * I / S;

    return {
      section:  S,
      dropV:    round(dropV, 3),
      dropPct:  round(dropPct, 3),
      lossW:    round(lossW, 2),
    };
  }

  /**
   * Calcule la section de câble recommandée pour respecter une chute de tension max.
   *
   * @param {object} p
   * @param {number} p.I            Courant (A)
   * @param {number} p.L            Longueur aller (m, un seul sens)
   * @param {number} p.U_system     Tension du système (V) — Voc string en DC, 230V/400V en AC
   * @param {number} [p.maxDropPct] Chute de tension max visée (%) — défaut 1% DC / 1.5% AC
   * @param {string} [p.material]   'Cu' (défaut) ou 'Al'
   * @param {string} [p.circuit]    'dc' (défaut) | 'ac_mono' | 'ac_tri'
   * @param {number} [p.cosPhi]     Facteur de puissance AC (défaut 1)
   * @returns résultat complet + table comparative de toutes les sections normalisées
   */
  function calcSection(p) {
    const material  = resolveMaterial(p.material);
    const circuit    = resolveCircuit(p.circuit);
    const cfg        = CIRCUIT_TYPES[circuit];
    const rho        = MATERIALS[material].resistivity;
    const cosPhi     = cfg.usesCosPhi ? (p.cosPhi ?? 1) : 1;
    const I          = Math.max(0, p.I || 0);
    const L          = Math.max(0, p.L || 0);
    const U_system   = Math.max(1e-9, p.U_system || 0);
    const maxDropPct = p.maxDropPct ?? DEFAULT_MAX_DROP_PCT[circuit === 'dc' ? 'dc' : 'ac'];

    const maxDropV = U_system * (maxDropPct / 100);
    // Section théorique minimale continue (avant arrondi commercial)
    const sectionMinRaw = maxDropV > 0
      ? (cfg.dropFactor * rho * L * I * cosPhi) / maxDropV
      : 0;

    let sectionMm2 = roundUpToStandardSection(sectionMinRaw);
    let warning = null;
    if (sectionMinRaw > STANDARD_SECTIONS_MM2[STANDARD_SECTIONS_MM2.length - 1]) {
      warning = `Aucune section standard (≤ ${STANDARD_SECTIONS_MM2[STANDARD_SECTIONS_MM2.length - 1]} mm²) ne respecte cette chute de tension : envisagez plusieurs câbles en parallèle, réduisez la longueur ou augmentez la tension du système.`;
    }

    const result = evalSection({ section: sectionMm2, I, L, U_system, material, circuit, cosPhi });

    // Table comparative pour affichage devis (toutes sections normalisées)
    const table = STANDARD_SECTIONS_MM2.map(s => {
      const r = evalSection({ section: s, I, L, U_system, material, circuit, cosPhi });
      return { ...r, ok: r.dropPct <= maxDropPct, recommended: s === sectionMm2 };
    });

    return {
      input: { I, L, U_system, maxDropPct, material, circuit, cosPhi },
      sectionMinRaw: round(sectionMinRaw, 3),
      sectionMm2,
      sectionRecommended: sectionMm2,
      dropV:   result.dropV,
      dropPct: result.dropPct,
      lossW:   result.lossW,
      compliant: result.dropPct <= maxDropPct,
      warning,
      table,
    };
  }

  // ── Helpers d'estimation de longueur ────────────────────────────

  /**
   * Estime la longueur aller (m) d'un string DC depuis la disposition des panneaux
   * jusqu'à l'onduleur/coffret de jonction.
   *
   * @param {object} p
   * @param {number} p.nPanels             Nombre total de panneaux (ou par string)
   * @param {number} [p.rows]               Nombre de rangées (défaut 1)
   * @param {number} [p.pitch]              Espacement entre panneaux le long d'une rangée (m, défaut 1.8)
   * @param {number} [p.distanceToInverter] Distance rangée → onduleur (m, défaut 10)
   * @param {number} [p.slackFactor]        Marge de cheminement (coudes, fixations) — défaut 1.15
   */
  function estimateDcLength(p) {
    const nPanels             = Math.max(1, p.nPanels || 1);
    const rows                = Math.max(1, p.rows || 1);
    const pitch                = p.pitch ?? 1.8;
    const distanceToInverter  = Math.max(0, p.distanceToInverter || 0);
    const slackFactor          = p.slackFactor ?? 1.15;

    const panelsPerRow = Math.ceil(nPanels / rows);
    const runAlongRow  = panelsPerRow * pitch;
    return round((runAlongRow + distanceToInverter) * slackFactor, 1);
  }

  /**
   * Estime la longueur aller (m) du câble AC onduleur → tableau électrique.
   * @param {object} p
   * @param {number} p.distance      Distance en ligne (m) onduleur → tableau
   * @param {number} [p.slackFactor] Marge de cheminement — défaut 1.1
   */
  function estimateAcLength(p) {
    const distance    = Math.max(0, p.distance || 0);
    const slackFactor = p.slackFactor ?? 1.1;
    return round(distance * slackFactor, 1);
  }

  // ── Helpers d'estimation de courant / tension (à partir de données panneau) ──

  /**
   * Estime le courant de string DC en A (avec majoration de sécurité NF C 15-712-1 : Isc × 1.25).
   * @param {object} p
   * @param {number} p.iscPerPanel      Isc unitaire panneau (A, datasheet)
   * @param {number} [p.stringsParallel] Nombre de strings en parallèle (défaut 1)
   * @param {number} [p.safetyFactor]    Facteur de sécurité (défaut 1.25)
   */
  function estimateStringCurrent(p) {
    const iscPerPanel     = Math.max(0, p.iscPerPanel || 0);
    const stringsParallel = Math.max(1, p.stringsParallel || 1);
    const safetyFactor    = p.safetyFactor ?? 1.25;
    return round(iscPerPanel * stringsParallel * safetyFactor, 2);
  }

  /**
   * Estime la tension de string DC en V (Voc unitaire × nb panneaux en série).
   * @param {object} p
   * @param {number} p.vocPerPanel    Voc unitaire panneau (V, datasheet)
   * @param {number} p.panelsSeries   Nombre de panneaux en série dans le string
   */
  function estimateStringVoltage(p) {
    const vocPerPanel  = Math.max(0, p.vocPerPanel || 0);
    const panelsSeries = Math.max(1, p.panelsSeries || 1);
    return round(vocPerPanel * panelsSeries, 1);
  }

  /**
   * Estime le courant AC (A) à partir d'une puissance (W) et d'une tension système.
   * @param {object} p
   * @param {number} p.P_W        Puissance active (W) — ex : puissance AC onduleur
   * @param {number} p.U_system   Tension (230 mono, 400 tri)
   * @param {string} [p.circuit]  'ac_mono' (défaut) | 'ac_tri'
   * @param {number} [p.cosPhi]   Facteur de puissance (défaut 1)
   */
  function estimateAcCurrent(p) {
    const P_W      = Math.max(0, p.P_W || 0);
    const U_system = Math.max(1e-9, p.U_system || 230);
    const circuit  = p.circuit === 'ac_tri' ? 'ac_tri' : 'ac_mono';
    const cosPhi   = p.cosPhi ?? 1;
    const denom    = circuit === 'ac_tri' ? Math.sqrt(3) * U_system * cosPhi : U_system * cosPhi;
    return denom > 0 ? round(P_W / denom, 2) : 0;
  }

  /**
   * Estimation grossière de l'Isc d'un panneau à partir de sa puissance crête (Wc),
   * utilisée uniquement en préremplissage quand la datasheet n'est pas renseignée
   * (ratio ≈ 0.03 A/Wc, cohérent avec les panneaux silicium cristallin courants).
   */
  function estimateIscFromWp(wp) {
    return round(Math.max(0, wp || 0) * 0.03, 1);
  }

  /** Idem pour Voc, ratio ≈ 0.1 V/Wc (panneaux ~400 Wc → Voc ~40-42V). */
  function estimateVocFromWp(wp) {
    return round(Math.max(0, wp || 0) * 0.1, 1);
  }

  return {
    MATERIALS,
    STANDARD_SECTIONS_MM2,
    CIRCUIT_TYPES,
    DC_ROUND_TRIP_FACTOR,
    DEFAULT_MAX_DROP_PCT,
    roundUpToStandardSection,
    evalSection,
    calcSection,
    estimateDcLength,
    estimateAcLength,
    estimateStringCurrent,
    estimateStringVoltage,
    estimateAcCurrent,
    estimateIscFromWp,
    estimateVocFromWp,
  };
})();

// Export Node (tests) si applicable, sans casser le contexte navigateur (vm.runInContext)
if (typeof module !== 'undefined' && module.exports) module.exports = CableCalc;

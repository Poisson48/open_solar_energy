/**
 * constants.js — Constantes partagées entre tous les modules
 * Doit être chargé APRÈS app_state.js
 */

const DAYS_IN_MONTH  = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const DAYS           = DAYS_IN_MONTH;
const MONTH_NAMES    = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
const MONTH_NAMES_FULL = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// ── Constantes financières ──────────────────────────────────────────────
const PANEL_DEGRADATION  = 0.005; // 0,5 %/an (garantie 80 % à 25 ans ≈ norme IEC)
const ELEC_ESCALATION    = 0.03;  // 3 %/an (moyenne historique France)
const DISCOUNT_RATE      = 0.04;  // 4 % (taux d'actualisation sans risque + prime)
const SYSTEM_LIFETIME    = 25;    // ans (durée de vie garantie des panneaux)

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
function getMonthlyDays(year) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
}

/**
 * pv_profiles.js - Profils PV demi-horaires normalisés
 *
 * Fonctions partagées entre SizingEngine et OffgridSizing :
 *   buildMonthlyProfiles  — profil [12][48] kWh/kWc par slot 30 min
 *   flattenToYear         — aplatit [12][48] en Float32Array(nDays×48)
 *
 * Dépendances globales : SolarMath, DAYS_IN_MONTH (constants.js)
 */

const PvProfiles = (() => {

  // DAYS_IN_MONTH défini dans constants.js
  const DAYS = DAYS_IN_MONTH;

  /**
   * Construit un profil PV demi-horaire normalisé par kWc, cohérent avec pvProduction mensuel.
   * Retourne un tableau [12][48] en kWh/kWc par slot 30 min, tel que
   * somme_slots_du_mois × jours = pvProduction(Htilt, 1 kWc, losses, T_avg, pvTech, m).
   *
   * @param {array}  weatherData   12 mois {GHI, DHI, T_avg, ...}
   * @param {array}  monthlyHtilt  irradiation inclinée par mois (kWh/m²)
   * @param {number} losses        pertes système (%)
   * @param {number} tilt          inclinaison (°)
   * @param {number} azimuth       azimut (°)
   * @param {number} lat           latitude
   * @param {string} pvTech        technologie PV ('crystSi', 'CIS', 'CdTe', ...)
   * @returns {Float32Array[]}     tableau de 12 Float32Array(48)
   */
  function buildMonthlyProfiles(weatherData, monthlyHtilt, losses, tilt, azimuth, lat, pvTech) {
    const tech = pvTech || 'crystSi';
    const profiles = [];
    for (let m = 1; m <= 12; m++) {
      const md   = weatherData[m - 1];
      const days = DAYS[m - 1];
      const shape = new Float32Array(48);
      let shapeSum = 0;
      for (let h = 0; h < 24; h++) {
        const irr = SolarMath.hourlyIrradiance(lat, m, h, md, tilt, azimuth);
        shape[h * 2]     = irr / 2;
        shape[h * 2 + 1] = irr / 2;
        shapeSum += irr;
      }
      const monthlyPerKwc = SolarMath.pvProduction(monthlyHtilt[m - 1], 1, losses, md.T_avg, tech, m, lat);
      const perDayPerKwc  = days > 0 ? monthlyPerKwc / days : 0;
      const slots = new Float32Array(48);
      if (shapeSum > 0) {
        for (let s = 0; s < 48; s++) slots[s] = shape[s] * perDayPerKwc / shapeSum;
      }
      profiles.push(slots);
    }
    return profiles;
  }

  /**
   * Aplatit un profil mensuel [12][48] en Float32Array(nDays×48).
   *
   * @param {Float32Array[]} profiles  tableau de 12 Float32Array(48)
   * @param {number[]}       daysArr   nombre de jours par mois (12 valeurs)
   * @returns {Float32Array}
   */
  function flattenToYear(profiles, daysArr) {
    const totalDays = daysArr.reduce((s, d) => s + d, 0);
    const flat = new Float32Array(totalDays * 48);
    let di = 0;
    for (let m = 0; m < 12; m++) {
      for (let d = 0; d < daysArr[m]; d++, di++) flat.set(profiles[m], di * 48);
    }
    return flat;
  }

  return { buildMonthlyProfiles, flattenToYear };
})();

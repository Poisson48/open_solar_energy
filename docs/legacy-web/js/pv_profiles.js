/**
 * pv_profiles.js - Profils PV demi-horaires normalisés
 *
 * Fonctions partagées entre SizingEngine et OffgridSizing :
 *   buildMonthlyProfiles  — profil [12][48] kWh/kWc par slot 30 min
 *   flattenToYear         — aplatit [12][48] en Float32Array(nDays×48)
 *   buildSyntheticLoadYear — conso 30 min synthétique (profil résidentiel FR)
 *   applyMonthlyShade     — applique siteSurvey.monthlyLoss mois par mois
 *
 * Dépendances globales : SolarMath, DAYS_IN_MONTH (constants.js)
 */

const PvProfiles = (() => {

  // DAYS_IN_MONTH défini dans constants.js
  const DAYS = DAYS_IN_MONTH;

  /** Poids horaires type résidentiel France (somme ≈ 1) — matin / soir plus élevés. */
  const RESIDENTIAL_HOUR_WEIGHTS = [
    0.020, 0.015, 0.012, 0.010, 0.012, 0.020,
    0.030, 0.065, 0.075, 0.060, 0.040, 0.035,
    0.040, 0.038, 0.035, 0.035, 0.040, 0.055,
    0.080, 0.090, 0.085, 0.070, 0.055, 0.038
  ];

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

  /**
   * Applique l’ombrage mensuel (siteSurvey.monthlyLoss, fraction 0–1) sur un profil [12][48]
   * ou un flat année. Mutation in-place.
   */
  function applyMonthlyShade(profilesOrFlat, daysArr, monthlyLoss) {
    if (!monthlyLoss || !monthlyLoss.length) return profilesOrFlat;
    if (Array.isArray(profilesOrFlat) && profilesOrFlat[0] && profilesOrFlat[0].length === 48) {
      for (let m = 0; m < 12; m++) {
        const f = Math.max(0, Math.min(1, 1 - (Number(monthlyLoss[m]) || 0)));
        const p = profilesOrFlat[m];
        for (let s = 0; s < 48; s++) p[s] *= f;
      }
      return profilesOrFlat;
    }
    if (profilesOrFlat instanceof Float32Array && daysArr) {
      let di = 0;
      for (let m = 0; m < 12; m++) {
        const f = Math.max(0, Math.min(1, 1 - (Number(monthlyLoss[m]) || 0)));
        const n = daysArr[m] || 0;
        for (let d = 0; d < n; d++, di++) {
          const base = di * 48;
          for (let s = 0; s < 48; s++) profilesOrFlat[base + s] *= f;
        }
      }
    }
    return profilesOrFlat;
  }

  /**
   * Ombrage demi-heure (siteSurvey.halfHourlyKeep[12][48]) — créneau par créneau.
   * Préférer à applyMonthlyShade pour la batterie (matin ombré ≠ après-midi clair).
   */
  function applyTemporalShade(profilesOrFlat, daysArr, halfHourlyKeep) {
    if (!halfHourlyKeep || halfHourlyKeep.length !== 12) return profilesOrFlat;
    if (Array.isArray(profilesOrFlat) && profilesOrFlat[0] && profilesOrFlat[0].length === 48) {
      for (let m = 0; m < 12; m++) {
        const keep = halfHourlyKeep[m];
        const p = profilesOrFlat[m];
        if (!keep || !p) continue;
        for (let s = 0; s < 48; s++) {
          const k = Number(keep[s]);
          p[s] *= Math.max(0, Math.min(1, Number.isFinite(k) ? k : 1));
        }
      }
      return profilesOrFlat;
    }
    if (profilesOrFlat && typeof profilesOrFlat.length === 'number' && daysArr) {
      let di = 0;
      for (let m = 0; m < 12; m++) {
        const keep = halfHourlyKeep[m];
        const n = daysArr[m] || 0;
        for (let d = 0; d < n; d++, di++) {
          const base = di * 48;
          for (let s = 0; s < 48; s++) {
            const k = keep ? Number(keep[s]) : 1;
            const f = Math.max(0, Math.min(1, Number.isFinite(k) ? k : 1));
            profilesOrFlat[base + s] *= f;
          }
        }
      }
    }
    return profilesOrFlat;
  }

  /** Applique ombrage site : temporel si dispo, sinon forfait mensuel. */
  function applySiteShade(profilesOrFlat, daysArr, siteSurvey) {
    if (!siteSurvey) return profilesOrFlat;
    if (siteSurvey.halfHourlyKeep?.length === 12)
      return applyTemporalShade(profilesOrFlat, daysArr, siteSurvey.halfHourlyKeep);
    if (siteSurvey.monthlyLoss?.length === 12)
      return applyMonthlyShade(profilesOrFlat, daysArr, siteSurvey.monthlyLoss);
    return profilesOrFlat;
  }

  /** Heures « nuit » alignées batterie (sizing/offgrid) : 21h–6h. */
  const NIGHT_HOURS = [21, 22, 23, 0, 1, 2, 3, 4, 5];

  /**
   * Année de conso 30 min à partir d’un split jour/nuit (kWh/jour typique).
   * Les totaux mensuels (facture) restent la référence d’énergie ; le split
   * ne fait que répartir chaque jour entre créneaux jour vs nuit.
   * Si monthlyKwh est vide/nul et day+night > 0 → mois = (day+night)×jours.
   *
   * @param {number[]} monthlyKwh
   * @param {number}   dayKwhPerDay    conso typique 6h–21h (kWh/j)
   * @param {number}   nightKwhPerDay  conso typique 21h–6h (kWh/j)
   * @param {number}   [year]
   * @returns {Float32Array}
   */
  function buildDayNightLoadYear(monthlyKwh, dayKwhPerDay, nightKwhPerDay, year) {
    const daysArr = (typeof getMonthlyDays === 'function' && year)
      ? getMonthlyDays(year)
      : DAYS.slice();
    const day = Math.max(0, Number(dayKwhPerDay) || 0);
    const night = Math.max(0, Number(nightKwhPerDay) || 0);
    const dailyTyp = day + night;
    const nightSet = new Set(NIGHT_HOURS);
    const nNightH = NIGHT_HOURS.length;
    const nDayH = 24 - nNightH;

    const months = Array.from({ length: 12 }, (_, m) => {
      const raw = Math.max(0, Number(monthlyKwh?.[m]) || 0);
      if (raw > 0) return raw;
      if (dailyTyp > 0) return dailyTyp * (daysArr[m] || 0);
      return 0;
    });

    const totalDays = daysArr.reduce((s, d) => s + d, 0);
    const flat = new Float32Array(totalDays * 48);
    let di = 0;
    for (let m = 0; m < 12; m++) {
      const days = daysArr[m] || 0;
      const monthTotal = months[m];
      const daily = days > 0 ? monthTotal / days : 0;
      // Ratio jour/nuit depuis la saisie ; si seulement un côté, tout de ce côté
      let dayShare = 0.5;
      if (dailyTyp > 0) dayShare = day / dailyTyp;
      else dayShare = nDayH / 24;
      const dayPart = daily * dayShare;
      const nightPart = daily * (1 - dayShare);
      const dayPerHour = nDayH > 0 ? dayPart / nDayH : 0;
      const nightPerHour = nNightH > 0 ? nightPart / nNightH : 0;

      for (let d = 0; d < days; d++, di++) {
        const base = di * 48;
        for (let h = 0; h < 24; h++) {
          const slot = (nightSet.has(h) ? nightPerHour : dayPerHour) / 2;
          flat[base + h * 2] = slot;
          flat[base + h * 2 + 1] = slot;
        }
      }
    }
    return flat;
  }

  /**
   * Année de conso 30 min depuis un profil 2 h (12 blocs kWh/jour typique).
   * monthlyKwh (optionnel) scale l’énergie ; sinon somme des 12 blocs = jour type.
   */
  function buildTwoHourLoadYear(monthlyKwh, twoHourKwhPerDay, year) {
    const daysArr = (typeof getMonthlyDays === 'function' && year)
      ? getMonthlyDays(year)
      : DAYS.slice();
    const shape = Array.from({ length: 12 }, (_, i) =>
      Math.max(0, Number(twoHourKwhPerDay?.[i]) || 0));
    const shapeSum = shape.reduce((a, b) => a + b, 0);
    const dailyTyp = shapeSum;

    const months = Array.from({ length: 12 }, (_, m) => {
      const raw = Math.max(0, Number(monthlyKwh?.[m]) || 0);
      if (raw > 0) return raw;
      if (dailyTyp > 0) return dailyTyp * (daysArr[m] || 0);
      return 0;
    });

    const totalDays = daysArr.reduce((s, d) => s + d, 0);
    const flat = new Float32Array(totalDays * 48);
    let di = 0;
    for (let m = 0; m < 12; m++) {
      const days = daysArr[m] || 0;
      const monthTotal = months[m];
      const daily = days > 0 ? monthTotal / days : 0;
      for (let d = 0; d < days; d++, di++) {
        const base = di * 48;
        for (let b = 0; b < 12; b++) {
          const blockShare = shapeSum > 0 ? shape[b] / shapeSum : 1 / 12;
          const blockKwh = daily * blockShare;
          const perSlot = blockKwh / 4; // 4 × 30 min
          for (let s = 0; s < 4; s++) flat[base + b * 4 + s] = perSlot;
        }
      }
    }
    return flat;
  }

  /** Conso nuit (kWh/j) estimée depuis un profil 2 h (blocs 22–6h + moitié 20–22). */
  function nightKwhFromTwoHour(twoHourKwhPerDay) {
    const s = Array.from({ length: 12 }, (_, i) => Math.max(0, Number(twoHourKwhPerDay?.[i]) || 0));
    // indices : 0=0-2, 1=2-4, 2=4-6, 10=20-22, 11=22-24
    return s[0] + s[1] + s[2] + s[11] + 0.5 * s[10];
  }

  /**
   * Construit une année de conso 30 min (kWh/slot) à partir des totaux mensuels,
   * en utilisant un profil diurnal résidentiel (évite min(prod,conso) mensuel trop optimiste).
   *
   * @param {number[]} monthlyKwh  12 totaux kWh
   * @param {number}   [year]      pour jours bissextiles
   * @returns {Float32Array}
   */
  function buildSyntheticLoadYear(monthlyKwh, year) {
    const daysArr = (typeof getMonthlyDays === 'function' && year)
      ? getMonthlyDays(year)
      : DAYS.slice();
    const wSum = RESIDENTIAL_HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
    const hourFrac = RESIDENTIAL_HOUR_WEIGHTS.map(w => w / wSum);
    const totalDays = daysArr.reduce((s, d) => s + d, 0);
    const flat = new Float32Array(totalDays * 48);
    let di = 0;
    for (let m = 0; m < 12; m++) {
      const days = daysArr[m] || 30;
      const monthTotal = Math.max(0, Number(monthlyKwh[m]) || 0);
      const daily = days > 0 ? monthTotal / days : 0;
      for (let d = 0; d < days; d++, di++) {
        const base = di * 48;
        for (let h = 0; h < 24; h++) {
          const slotKwh = (daily * hourFrac[h]) / 2;
          flat[base + h * 2]     = slotKwh;
          flat[base + h * 2 + 1] = slotKwh;
        }
      }
    }
    return flat;
  }

  return {
    buildMonthlyProfiles,
    flattenToYear,
    applyMonthlyShade,
    applyTemporalShade,
    applySiteShade,
    buildSyntheticLoadYear,
    buildDayNightLoadYear,
    buildTwoHourLoadYear,
    nightKwhFromTwoHour,
    RESIDENTIAL_HOUR_WEIGHTS,
    NIGHT_HOURS,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PvProfiles;

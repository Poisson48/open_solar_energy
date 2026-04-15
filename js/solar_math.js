/**
 * solar_math.js — Algorithmes de calcul solaire
 * Modèles : Liu & Jordan (transposition), SPA simplifié
 */

const SolarMath = (() => {

  // DAYS_IN_MONTH et MONTH_NAMES définis dans constants.js

  /** Jour julien moyen du mois (milieu du mois) */
  function midMonthDay(month) {
    let d = 0;
    for (let i = 0; i < month - 1; i++) d += DAYS_IN_MONTH[i];
    return d + Math.round(DAYS_IN_MONTH[month - 1] / 2);
  }

  /** Déclinaison solaire (degrés) — formule de Spencer */
  function declination(dayOfYear) {
    const B = (2 * Math.PI * (dayOfYear - 1)) / 365;
    return (180 / Math.PI) * (
      0.006918
      - 0.399912 * Math.cos(B)
      + 0.070257 * Math.sin(B)
      - 0.006758 * Math.cos(2 * B)
      + 0.000907 * Math.sin(2 * B)
      - 0.002697 * Math.cos(3 * B)
      + 0.00148  * Math.sin(3 * B)
    );
  }

  /** Angle horaire de lever/coucher du soleil (degrés) */
  function sunriseHourAngle(lat, decl) {
    const latR = (Math.PI / 180) * lat;
    const declR = (Math.PI / 180) * decl;
    const cosW = -Math.tan(latR) * Math.tan(declR);
    if (cosW < -1) return 90;
    if (cosW > 1) return 0;
    return (180 / Math.PI) * Math.acos(cosW);
  }

  /** Durée d'ensoleillement en heures */
  function daylightHours(lat, month) {
    const day = midMonthDay(month);
    const decl = declination(day);
    const ws = sunriseHourAngle(lat, decl);
    return (2 / 15) * ws;
  }

  /**
   * Irradiation extraterrestre horizontale mensuelle (kWh/m²/mois)
   * Utile pour le calcul du ratio diffus
   */
  function extraterrestrialIrradiation(lat, month) {
    const day = midMonthDay(month);
    const decl = declination(day);
    const ws = sunriseHourAngle(lat, decl);
    const latR = (Math.PI / 180) * lat;
    const declR = (Math.PI / 180) * decl;
    const wsR = (Math.PI / 180) * ws;
    // Constante solaire corrigée
    const Gsc = 1367;
    const B = (2 * Math.PI * day) / 365;
    const E0 = 1.000110 + 0.034221 * Math.cos(B) + 0.001280 * Math.sin(B)
                + 0.000719 * Math.cos(2 * B) + 0.000077 * Math.sin(2 * B);
    const H0 = (24 / Math.PI) * Gsc * E0 * (
      wsR * Math.sin(latR) * Math.sin(declR)
      + Math.cos(latR) * Math.cos(declR) * Math.sin(wsR)
    );
    return (H0 / 1000) * DAYS_IN_MONTH[month - 1]; // Wh→kWh × jours
  }

  /**
   * Transposition Liu & Jordan : irradiation sur plan incliné
   * @param {number} GHI  kWh/m²/mois
   * @param {number} DHI  kWh/m²/mois
   * @param {number} lat  degrés
   * @param {number} tilt degrés (inclinaison panneau)
   * @param {number} azimuth degrés (0=Sud, -90=Est, +90=Ouest)
   * @param {number} month 1-12
   * @param {number} albedo réflectance du sol (défaut 0.2)
   * @returns {number} irradiation sur plan incliné kWh/m²/mois
   */
  function tiltedIrradiation(GHI, DHI, lat, tilt, azimuth, month, albedo = 0.2) {
    const day = midMonthDay(month);
    const decl = declination(day);
    const ws = sunriseHourAngle(lat, decl);

    const latR = (Math.PI / 180) * lat;
    const declR = (Math.PI / 180) * decl;
    const wsR = (Math.PI / 180) * ws;
    const tiltR = (Math.PI / 180) * tilt;
    const azR = (Math.PI / 180) * azimuth;

    // Angle de latitude effective pour surface inclinée
    const latTilt = latR - tiltR;

    // Angle de lever/coucher pour surface inclinée
    const coswst = -Math.tan(latTilt) * Math.tan(declR);
    const wst = (Math.PI / 180) * (Math.abs(coswst) > 1 ? (coswst < 0 ? 90 : 0) : (180 / Math.PI) * Math.acos(Math.max(-1, Math.min(1, coswst))));
    const wsEff = Math.min(wsR, wst);

    // Facteur Rb (rapport rayonnement direct incliné / horizontal)
    const numerator = Math.cos(latTilt) * Math.cos(declR) * Math.sin(wsEff) + wsEff * Math.sin(latTilt) * Math.sin(declR);
    const denominator = Math.cos(latR) * Math.cos(declR) * Math.sin(wsR) + wsR * Math.sin(latR) * Math.sin(declR);
    const Rb = denominator > 0.001 ? Math.max(0, numerator / denominator) : 0;

    const DNI = GHI - DHI;
    const Ib = Math.max(0, DNI); // Direct beam

    // Composante directe
    const It_beam = Ib * Rb;

    // Composante diffuse (isotrope Liu & Jordan)
    const It_diff = DHI * (1 + Math.cos(tiltR)) / 2;

    // Composante réfléchie
    const It_refl = GHI * albedo * (1 - Math.cos(tiltR)) / 2;

    return Math.max(0, It_beam + It_diff + It_refl);
  }

  /**
   * Trouver l'inclinaison optimale pour maximiser la production annuelle
   */
  /**
   * Retourne { tilt, azimuth } optimaux pour maximiser l'irradiation annuelle.
   * Si optimizeAzimuth=false, azimut fixé à 0° (plein sud).
   */
  function optimalTilt(lat, weatherData, optimizeAzimuth = false) {
    const azimuths = optimizeAzimuth
      ? [-90,-75,-60,-45,-30,-15,0,15,30,45,60,75,90]
      : [0];
    let best = { tilt: 30, azimuth: 0, total: 0 };
    for (let tilt = 0; tilt <= 90; tilt++) {
      for (const az of azimuths) {
        let total = 0;
        weatherData.forEach((m, i) => {
          total += tiltedIrradiation(m.GHI, m.DHI, lat, tilt, az, i + 1);
        });
        if (total > best.total) best = { tilt, azimuth: az, total };
      }
    }
    return best;
  }

  /**
   * Calcul production PV mensuelle (kWh)
   * @param {number} Htilt   irradiation inclinée kWh/m²/mois
   * @param {number} Ppeak   puissance crête kWc
   * @param {number} losses  pertes système %
   * @param {number} Tavg    température ambiante °C
   * @param {string} tech    technologie PV
   * @param {number} month   numéro du mois (1-12) pour normalisation journalière
   */
  function pvProduction(Htilt, Ppeak, losses, Tavg, tech = 'crystSi', month = 6) {
    const tempCoeff = { crystSi: -0.0045, CIS: -0.0036, CdTe: -0.0025, unknown: -0.004 };
    const gamma = tempCoeff[tech] || -0.004;

    // Normaliser Htilt mensuel → journalier (kWh/m²/jour)
    const days = DAYS_IN_MONTH[month - 1];
    const Htilt_daily = Htilt / days;

    // Température cellule via NOCT (IEC 61215) :
    // G_eff ≈ irradiance moyenne pendant les heures de production (~6h/jour)
    // Tcell = Tamb + (NOCT - 20) × G_eff / 800
    const G_eff = (Htilt_daily * 1000) / 6.0; // W/m²
    const Tcell = Tavg + (45 - 20) * G_eff / 800;
    const dT = Math.max(0, Tcell - 25);
    const PR_temp = 1 + gamma * dT;

    const PR_system = (1 - losses / 100);
    const PR_total = Math.max(0.5, PR_system * Math.min(1, PR_temp));

    return Htilt * Ppeak * PR_total;
  }

  /**
   * Calcul complet annuel pour un système PV réseau
   */
  function gridSystemAnnual({ lat, weatherData, Ppeak, losses, tilt, azimuth, tech, systemCost, kwhPrice, co2Factor }) {
    const monthly = weatherData.map((m, i) => {
      const month = i + 1;
      const Htilt = tiltedIrradiation(m.GHI, m.DHI, lat, tilt, azimuth, month);
      const E = pvProduction(Htilt, Ppeak, losses, m.T_avg, tech, month);
      return {
        month,
        name: m.name,
        GHI: m.GHI,
        Htilt: Math.round(Htilt * 10) / 10,
        E_month: Math.round(E * 10) / 10,
        T_avg: m.T_avg
      };
    });

    const E_annual = monthly.reduce((s, m) => s + m.E_month, 0);
    const H_annual = monthly.reduce((s, m) => s + m.Htilt, 0);

    const PR = H_annual > 0 ? (E_annual / (Ppeak * H_annual)) : 0;
    const CF = E_annual / (Ppeak * 8760);
    const LCOE = systemCost > 0 ? systemCost / (E_annual * 25) : 0;
    const ROI = (E_annual * kwhPrice) > 0 ? (systemCost / (E_annual * kwhPrice)) : 0;
    const CO2 = E_annual * co2Factor;

    return {
      monthly,
      E_annual: Math.round(E_annual),
      H_annual: Math.round(H_annual),
      PR: Math.round(PR * 100) / 100,
      CF: Math.round(CF * 10000) / 100,
      ROI: Math.round(ROI * 10) / 10,
      CO2: Math.round(CO2),
      specificYield: Math.round(E_annual / Ppeak)
    };
  }

  /**
   * Calcul système hors réseau
   */
  function offgridSystem({ lat, weatherData, Ppeak, battCap, dod, dailyConsumption, tilt, azimuth }) {
    const usable = battCap * (dod / 100);
    return weatherData.map((m, i) => {
      const month = i + 1;
      const Htilt = tiltedIrradiation(m.GHI, m.DHI, lat, tilt, azimuth, month);
      const days = DAYS_IN_MONTH[i];
      const solarDaily = (Htilt / days) * Ppeak / 1000 * 0.8; // kWh/j avec PR=0.8
      const coverageRatio = Math.min(1, solarDaily / (dailyConsumption / 1000));
      const autonomyDays = usable / 1000 / Math.max(0.01, (dailyConsumption / 1000 - solarDaily));
      return {
        month,
        name: m.name,
        solarDaily: Math.round(solarDaily * 100) / 100,
        coverageRatio: Math.round(coverageRatio * 100),
        autonomyDays: Math.max(0, Math.round(autonomyDays * 10) / 10),
        deficit: Math.max(0, Math.round((dailyConsumption / 1000 - solarDaily) * days * 100) / 100)
      };
    });
  }

  /**
   * Heatmap inclinaison × azimut (production relative)
   */
  function tiltAzimuthHeatmap(lat, weatherData) {
    const tilts = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
    const azimuths = [-90, -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 90];
    const results = [];
    let maxVal = 0;

    tilts.forEach(tilt => {
      azimuths.forEach(az => {
        let total = 0;
        weatherData.forEach((m, i) => {
          total += tiltedIrradiation(m.GHI, m.DHI, lat, tilt, az, i + 1);
        });
        if (total > maxVal) maxVal = total;
        results.push({ tilt, az, value: Math.round(total) });
      });
    });

    return results.map(r => ({ ...r, pct: Math.round((r.value / maxVal) * 100) }));
  }

  /**
   * Irradiance horaire simplifiée (Wh/m²) pour une heure h d'un mois donné
   * Distribution sinusoïdale de la GHI journalière sur les heures d'ensoleillement
   * @param {number} lat  Latitude (degrés)
   * @param {number} month  1–12
   * @param {number} hour  Heure solaire locale (0–23)
   * @param {Object} monthData  { GHI, DHI, DNI, T_avg }
   * @param {number} tilt  Inclinaison panneau (°)
   * @param {number} azimuth  Azimut (°, 0=Sud)
   * @returns {number}  Irradiance Wh/m² pour cette heure
   */
  function hourlyIrradiance(lat, month, hour, monthData, tilt = 0, azimuth = 0) {
    const days = DAYS_IN_MONTH[month - 1];
    const daylightH = daylightHours(lat, month);
    const sunriseH = 12 - daylightH / 2;
    const sunsetH  = 12 + daylightH / 2;

    if (hour < sunriseH || hour >= sunsetH) return 0;

    // Profil sin : pic à midi solaire
    const angle = Math.PI * (hour - sunriseH) / daylightH;
    const sinWeight = Math.sin(angle);

    // Normaliser : intégrale discrète des sin sur les heures d'ensoleillement
    let totalWeight = 0;
    for (let h = Math.ceil(sunriseH); h < sunsetH; h++) {
      const a = Math.PI * (h - sunriseH) / daylightH;
      totalWeight += Math.sin(a);
    }
    if (totalWeight === 0) return 0;

    // GHI journalière (Wh/m²/j) → fraction de cette heure
    const dailyGHI = (monthData.GHI / days) * 1000;
    const ghiHour  = dailyGHI * sinWeight / totalWeight;

    // Diffuse horaire (même profil)
    const dailyDHI = (monthData.DHI / days) * 1000;
    const dhiHour  = dailyDHI * sinWeight / totalWeight;

    // Appliquer la transposition Liu & Jordan pour l'heure
    if (tilt === 0) return ghiHour;
    const tiltR = (Math.PI / 180) * tilt;
    const Rb = Math.max(0, (ghiHour - dhiHour) > 0
      ? 1 + 0.1 * tilt * Math.cos((Math.PI / 180) * azimuth)  // approximation simple
      : 0);
    const albedo = 0.2;
    const H_tilt = Math.max(0,
      (ghiHour - dhiHour) * Rb
      + dhiHour * (1 + Math.cos(tiltR)) / 2
      + ghiHour * albedo * (1 - Math.cos(tiltR)) / 2
    );
    return H_tilt;
  }

  return { tiltedIrradiation, pvProduction, gridSystemAnnual, offgridSystem, optimalTilt, tiltAzimuthHeatmap, daylightHours, hourlyIrradiance };
})();

/**
 * solar_math.js — Algorithmes de calcul solaire
 *
 * Modèles :
 *   Rb          : intégration numérique (Braun & Mitchell 1983) — valide pour tout azimut
 *   Transposit. : HDKR (Hay-Davies-Klucher-Reindl 1990) — anisotrope, +5-15 % vs Liu&Jordan
 *   Température : NOCT IEC 61215 avec durée d'ensoleillement réelle (lat, mois)
 */

const SolarMath = (() => {
  const DEG = Math.PI / 180;

  // ── Géométrie solaire de base ──────────────────────────────────

  function midMonthDay(month) {
    let d = 0;
    for (let i = 0; i < month - 1; i++) d += DAYS_IN_MONTH[i];
    return d + Math.round(DAYS_IN_MONTH[month - 1] / 2);
  }

  function declination(dayOfYear) {
    const B = 2 * Math.PI * (dayOfYear - 1) / 365;
    return (1 / DEG) * (
      0.006918 - 0.399912 * Math.cos(B) + 0.070257 * Math.sin(B)
      - 0.006758 * Math.cos(2*B) + 0.000907 * Math.sin(2*B)
      - 0.002697 * Math.cos(3*B) + 0.00148  * Math.sin(3*B)
    );
  }

  function sunriseHourAngle(lat, decl) {
    const cosW = -Math.tan(lat * DEG) * Math.tan(decl * DEG);
    if (cosW < -1) return 90;
    if (cosW >  1) return 0;
    return Math.acos(cosW) / DEG;
  }

  function daylightHours(lat, month) {
    const day = midMonthDay(month);
    return (2 / 15) * sunriseHourAngle(lat, declination(day));
  }

  /**
   * Irradiation extraterrestre horizontale mensuelle (kWh/m²/mois)
   */
  function extraterrestrialIrradiation(lat, month) {
    const day   = midMonthDay(month);
    const decl  = declination(day);
    const ws    = sunriseHourAngle(lat, decl);
    const latR  = lat * DEG, declR = decl * DEG, wsR = ws * DEG;
    const B     = 2 * Math.PI * day / 365;
    const E0    = 1.000110 + 0.034221*Math.cos(B) + 0.001280*Math.sin(B)
                + 0.000719*Math.cos(2*B) + 0.000077*Math.sin(2*B);
    const H0    = (24 / Math.PI) * 1367 * E0 * (
      wsR * Math.sin(latR) * Math.sin(declR)
      + Math.cos(latR) * Math.cos(declR) * Math.sin(wsR)
    );
    return (H0 / 1000) * DAYS_IN_MONTH[month - 1];
  }

  // ── Rb mensuel par intégration numérique ──────────────────────
  /**
   * Rapport irradiation directe sur plan incliné / horizontale (Rb),
   * calculé par intégration numérique (96 pas de 15 min) pour tout azimut.
   *
   * Remplace l'ancienne approximation cos(lat-tilt)/cos(lat) + azCorr
   * qui était fausse pour les azimuts non-sud.
   *
   * Formule Braun & Mitchell (1983) — cosine of incidence angle:
   *   cos θ = sinδ sinφ cosβ − sinδ cosφ sinβ cosγ
   *         + cosδ cosω cosφ cosβ + cosδ cosω sinφ sinβ cosγ
   *         + cosδ sinω sinβ sinγ
   */
  function calcRb(lat, tilt, azimuth, month) {
    const day   = midMonthDay(month);
    const decl  = declination(day);
    const ws    = sunriseHourAngle(lat, decl);
    const latR  = lat     * DEG;
    const declR = decl    * DEG;
    const tiltR = tilt    * DEG;
    const azR   = azimuth * DEG;
    // IAM verre standard (IEC 61853-1) — réduit le terme beam de ~2-4 %
    // Martin & Ruiz b0=0.05 : IAM(θ) = max(0, 1 − b0·(1/cosθ − 1))
    const b0 = 0.05;
    const N     = 96;
    const step  = 2 * ws / N;
    let num = 0, den = 0;
    for (let i = 0; i < N; i++) {
      const omR = (-ws + (i + 0.5) * step) * DEG;
      const cosZ = Math.sin(declR)*Math.sin(latR)
                 + Math.cos(declR)*Math.cos(omR)*Math.cos(latR);
      if (cosZ < 0.01) continue;
      const cosI = Math.sin(declR)*Math.sin(latR)*Math.cos(tiltR)
                 - Math.sin(declR)*Math.cos(latR)*Math.sin(tiltR)*Math.cos(azR)
                 + Math.cos(declR)*Math.cos(omR)*Math.cos(latR)*Math.cos(tiltR)
                 + Math.cos(declR)*Math.cos(omR)*Math.sin(latR)*Math.sin(tiltR)*Math.cos(azR)
                 + Math.cos(declR)*Math.sin(omR)*Math.sin(tiltR)*Math.sin(azR);
      const cI = Math.max(0, cosI);
      const iam = cI > 0.01 ? Math.max(0, 1 - b0 * (1 / cI - 1)) : 0;
      num += cI * iam;
      den += cosZ;
    }
    return den > 0 ? Math.max(0, num / den) : 0;
  }

  // ── Transposition HDKR ─────────────────────────────────────────
  /**
   * Irradiation sur plan incliné (kWh/m²/mois) — modèle HDKR
   * Hay-Davies-Klucher-Reindl (1990), Solar Energy 45(1):65-76
   *
   * Remplace Liu & Jordan isotrope : +5-15 % de précision sur
   * surfaces inclinées grâce à la composante circumsolaire (Hay)
   * et la brillance d'horizon (Reindl/Klucher).
   *
   * Convention azimut : 0°=Sud, -90°=Est, +90°=Ouest, ±180°=Nord
   */
  function tiltedIrradiation(GHI, DHI, lat, tilt, azimuth, month, albedo = 0.2) {
    if (GHI <= 0) return 0;
    const tiltR = tilt * DEG;
    const Ib    = Math.max(0, GHI - DHI);           // DNI projeté horizontal
    const Rb    = calcRb(lat, tilt, azimuth, month); // Rb intégré numériquement
    const H0    = extraterrestrialIrradiation(lat, month);
    // Hay : fraction de la diffuse suivant le soleil (composante circumsolaire)
    const Ai    = H0 > 0 ? Math.min(1, Ib / H0) : 0;
    // Reindl/Klucher : facteur de brillance d'horizon
    const f     = GHI > 0 ? Math.sqrt(Math.max(0, Ib / GHI)) : 0;
    const It_beam = (Ib + DHI * Ai) * Rb;
    const It_diff = DHI * (1 - Ai) * (1 + Math.cos(tiltR)) / 2
                  * (1 + f * Math.pow(Math.sin(tiltR / 2), 3));
    const It_refl = GHI * albedo * (1 - Math.cos(tiltR)) / 2;
    return Math.max(0, It_beam + It_diff + It_refl);
  }

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

  // ── Production PV mensuelle ────────────────────────────────────
  /**
   * Production PV mensuelle (kWh)
   *
   * Correction thermique NOCT (IEC 61215) améliorée :
   *   G_eff = Htilt_daily / daylightHours(lat, month)
   * au lieu de 6h fixe — meilleure précision en hiver (jours courts)
   * et en été (jours longs, irradiance plus étalée).
   *
   * @param {number} lat  Latitude (°) — optionnel, défaut 44°N (France centrale)
   */
  function pvProduction(Htilt, Ppeak, losses, Tavg, tech = 'crystSi', month = 6, lat = 44) {
    const tempCoeff = { crystSi: -0.0045, CIS: -0.0036, CdTe: -0.0025, unknown: -0.004 };
    const gamma     = tempCoeff[tech] || -0.004;
    const days      = DAYS_IN_MONTH[month - 1];
    const Htilt_daily = Htilt / days;
    const sunH      = Math.max(3, daylightHours(lat, month)); // h d'ensoleillement réelles
    const G_eff     = Htilt_daily > 0 ? (Htilt_daily * 1000) / sunH : 0;
    const Tcell     = (Tavg || 15) + (45 - 20) * G_eff / 800; // NOCT=45°C
    const PR_temp   = 1 + gamma * Math.max(0, Tcell - 25);
    const PR_total  = Math.max(0.5, (1 - losses / 100) * Math.min(1, PR_temp));
    return Htilt * Ppeak * PR_total;
  }

  // ── Calcul annuel système réseau ───────────────────────────────
  function gridSystemAnnual({ lat, weatherData, Ppeak, losses, tilt, azimuth, tech, systemCost, kwhPrice, co2Factor }) {
    const monthly = weatherData.map((m, i) => {
      const month = i + 1;
      const Htilt = tiltedIrradiation(m.GHI, m.DHI, lat, tilt, azimuth, month);
      const E     = pvProduction(Htilt, Ppeak, losses, m.T_avg, tech, month, lat);
      return {
        month, name: m.name, GHI: m.GHI,
        Htilt:   Math.round(Htilt * 10) / 10,
        E_month: Math.round(E * 10) / 10,
        T_avg: m.T_avg
      };
    });
    const E_annual = monthly.reduce((s, m) => s + m.E_month, 0);
    const H_annual = monthly.reduce((s, m) => s + m.Htilt, 0);
    const PR = H_annual > 0 ? E_annual / (Ppeak * H_annual) : 0;
    const CF = E_annual / (Ppeak * 8760);
    // LCOE avec dégradation 0,5 %/an sur 25 ans
    let cumProd25 = 0;
    for (let y = 1; y <= 25; y++) cumProd25 += E_annual * Math.pow(1 - 0.005, y - 1);
    const LCOE = (systemCost > 0 && cumProd25 > 0) ? systemCost / cumProd25 : 0;
    const ROI  = (E_annual * kwhPrice) > 0 ? systemCost / (E_annual * kwhPrice) : 0;
    const CO2  = E_annual * co2Factor;
    return {
      monthly,
      E_annual: Math.round(E_annual),
      H_annual: Math.round(H_annual),
      PR:       Math.round(PR * 100) / 100,
      CF:       Math.round(CF * 10000) / 100,
      ROI:      Math.round(ROI * 10) / 10,
      LCOE:     Math.round(LCOE * 10000) / 10000,
      CO2:      Math.round(CO2),
      specificYield: Math.round(E_annual / Ppeak)
    };
  }

  // ── Calcul simplifié hors réseau (onglet Données solaires) ────
  function offgridSystem({ lat, weatherData, Ppeak, battCap, dod, dailyConsumption, tilt, azimuth }) {
    const usable = battCap * (dod / 100);
    return weatherData.map((m, i) => {
      const month = i + 1;
      const Htilt = tiltedIrradiation(m.GHI, m.DHI, lat, tilt, azimuth, month);
      const days  = DAYS_IN_MONTH[i];
      const solarDaily    = (Htilt / days) * Ppeak / 1000 * 0.8;
      const coverageRatio = Math.min(1, solarDaily / (dailyConsumption / 1000));
      const autonomyDays  = usable / 1000 / Math.max(0.01, (dailyConsumption / 1000 - solarDaily));
      return {
        month, name: m.name,
        solarDaily:    Math.round(solarDaily * 100) / 100,
        coverageRatio: Math.round(coverageRatio * 100),
        autonomyDays:  Math.max(0, Math.round(autonomyDays * 10) / 10),
        deficit:       Math.max(0, Math.round((dailyConsumption / 1000 - solarDaily) * days * 100) / 100)
      };
    });
  }

  function tiltAzimuthHeatmap(lat, weatherData) {
    const tilts    = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
    const azimuths = [-90, -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 90];
    const results  = [];
    let maxVal = 0;
    tilts.forEach(tilt => {
      azimuths.forEach(az => {
        let total = 0;
        weatherData.forEach((m, i) => { total += tiltedIrradiation(m.GHI, m.DHI, lat, tilt, az, i + 1); });
        if (total > maxVal) maxVal = total;
        results.push({ tilt, az, value: Math.round(total) });
      });
    });
    return results.map(r => ({ ...r, pct: Math.round((r.value / maxVal) * 100) }));
  }

  // ── Irradiance horaire avec HDKR et Rb instantané ─────────────
  /**
   * Irradiance sur plan incliné (Wh/m²) pour une heure donnée.
   *
   * Corrections vs ancienne version :
   *   1. Rb horaire calculé avec l'angle d'incidence exact (formule Braun & Mitchell)
   *      tenant compte de l'azimut et de l'heure — l'ancienne formule utilisait
   *      cos(lat-tilt)/cos(lat) constant, ignorait azimut et heure.
   *   2. HDKR appliqué à l'heure (Ai_h = Ib_h / G0_h, f_h = sqrt(Ib_h/GHI_h))
   */
  function hourlyIrradiance(lat, month, hour, monthData, tilt = 0, azimuth = 0) {
    const days      = DAYS_IN_MONTH[month - 1];
    const daylightH = daylightHours(lat, month);
    const sunriseH  = 12 - daylightH / 2;
    const sunsetH   = 12 + daylightH / 2;
    if (hour < sunriseH || hour >= sunsetH) return 0;

    // Distribution sinusoïdale de la GHI journalière sur les heures d'ensoleillement
    const angle     = Math.PI * (hour - sunriseH) / daylightH;
    const sinWeight = Math.sin(angle);
    let totalWeight = 0;
    for (let h = Math.ceil(sunriseH); h < sunsetH; h++) {
      totalWeight += Math.sin(Math.PI * (h - sunriseH) / daylightH);
    }
    if (totalWeight === 0) return 0;

    const dailyGHI = (monthData.GHI / days) * 1000;
    const dailyDHI = (monthData.DHI / days) * 1000;
    const ghiHour  = dailyGHI * sinWeight / totalWeight;
    const dhiHour  = dailyDHI * sinWeight / totalWeight;
    if (tilt === 0) return ghiHour;

    const tiltR = tilt    * DEG;
    const azR   = azimuth * DEG;
    const latR  = lat     * DEG;
    const day   = midMonthDay(month);
    const declR = declination(day) * DEG;

    // Angle horaire au milieu de l'intervalle (15°/h, 0° à midi solaire)
    const omR = (hour + 0.5 - 12) * 15 * DEG;

    // Cos angle zénithal
    const cosZ = Math.sin(declR)*Math.sin(latR) + Math.cos(declR)*Math.cos(omR)*Math.cos(latR);
    if (cosZ < 0.01) return 0;

    // Cos angle d'incidence sur plan incliné (formule exacte Braun & Mitchell)
    const cosI = Math.sin(declR)*Math.sin(latR)*Math.cos(tiltR)
               - Math.sin(declR)*Math.cos(latR)*Math.sin(tiltR)*Math.cos(azR)
               + Math.cos(declR)*Math.cos(omR)*Math.cos(latR)*Math.cos(tiltR)
               + Math.cos(declR)*Math.cos(omR)*Math.sin(latR)*Math.sin(tiltR)*Math.cos(azR)
               + Math.cos(declR)*Math.sin(omR)*Math.sin(tiltR)*Math.sin(azR);
    const Rb_h = Math.max(0, cosI) / cosZ;

    // HDKR horaire
    const ibHour = Math.max(0, ghiHour - dhiHour);
    // Irradiance extraterrestre instantanée (W/m²)
    const B    = 2 * Math.PI * day / 365;
    const E0   = 1.000110 + 0.034221*Math.cos(B) + 0.001280*Math.sin(B);
    const G0h  = 1367 * E0 * cosZ;
    const Ai_h = G0h > 1 ? Math.min(1, ibHour / G0h) : 0;
    const f_h  = ghiHour > 0 ? Math.sqrt(Math.max(0, ibHour / ghiHour)) : 0;

    return Math.max(0,
      (ibHour + dhiHour * Ai_h) * Rb_h
      + dhiHour * (1 - Ai_h) * (1 + Math.cos(tiltR)) / 2
        * (1 + f_h * Math.pow(Math.sin(tiltR / 2), 3))
      + ghiHour * 0.2 * (1 - Math.cos(tiltR)) / 2
    );
  }

  return {
    tiltedIrradiation, pvProduction, gridSystemAnnual, offgridSystem,
    optimalTilt, tiltAzimuthHeatmap, daylightHours, hourlyIrradiance,
    calcRb, extraterrestrialIrradiation
  };
})();

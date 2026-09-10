#pragma once

#include <QtMath>
#include <cmath>

namespace ose {
namespace Azimuth {

/**
 * Contrats d’azimut (ombre 3D / soleil) :
 * - Soleil & horizon : toujours 0° = Nord, sens horaire (Est=90°).
 * - formState / tilt-azimut PV : 0° = Sud (northToPv / pvToNorth).
 * - Géométrie shade « monde » : Y-up, Est=+X, Nord=+Z, Sud=−Z
 *   (même repère que SolarScene3D + Layout3D.sunDirection).
 * - Toiture dans la scène : translation sceneX puis yaw Y = −azimuthPV
 *   ; le mesh d’ombrage applique la même transform pour coller au rendu GPU.
 */

/** Monde 3D / soleil / horizon : 0° = Nord, sens horaire. */
/** Champs UI / sizing / formState.azimuth : 0° = Sud. */

inline double norm360(double a)
{
    double x = std::fmod(a, 360.0);
    if (x < 0)
        x += 360.0;
    return x;
}

/** Nord → Sud (PV) : 0°N → 180°PV ≡ Sud… puis ramène en −180…180. */
inline double northToPv(double azNorth)
{
    double pv = norm360(azNorth) - 180.0;
    if (pv > 180.0)
        pv -= 360.0;
    if (pv <= -180.0)
        pv += 360.0;
    return pv;
}

/** Sud (PV) → Nord. */
inline double pvToNorth(double azPv)
{
    return norm360(azPv + 180.0);
}

/**
 * Direction soleil unitaire Y-up, azimut boussole 0°=Nord.
 * Est = +X, Nord = +Z, Sud = −Z.
 */
inline void sunDirectionFromNorth(double azNorthDeg, double elevDeg,
                                  double* outX, double* outY, double* outZ)
{
    const double az = azNorthDeg * M_PI / 180.0;
    const double el = elevDeg * M_PI / 180.0;
    const double cosEl = std::cos(el);
    if (outX)
        *outX = std::sin(az) * cosEl;
    if (outY)
        *outY = std::sin(el);
    if (outZ)
        *outZ = std::cos(az) * cosEl;
}

/**
 * eulerRotation DirectionalLight Quick3D (pointe −Z local = direction des rayons).
 * pitch = −elev : zenith → −90° (−Z vers −Y), horizon → 0°.
 * yaw = azNorth + 180 : −Z vers le soleil (Nord=+Z, Est=+X).
 * Doit rester synchronisé avec sunDirectionFromNorth (même az/élév SiteShade).
 */
inline void sunLightEulerFromNorth(double azNorthDeg, double elevDeg,
                                   double* outPitchX, double* outYawY, double* outRollZ)
{
    if (outPitchX)
        *outPitchX = -elevDeg;
    if (outYawY)
        *outYawY = azNorthDeg + 180.0;
    if (outRollZ)
        *outRollZ = 0.0;
}

} // namespace Azimuth
} // namespace ose

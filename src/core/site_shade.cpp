#include "site_shade.h"

#include "constants.h"
#include "solar_math.h"

#include <algorithm>
#include <cmath>
#include <vector>

namespace ose {
namespace {

double normAz(double a)
{
    double x = std::fmod(a, 360.0);
    if (x < 0)
        x += 360;
    return x;
}

struct Pt {
    double az;
    double elev;
};

double horizonElevAt(const std::vector<Pt>& points, double az)
{
    if (points.empty())
        return 0;
    std::vector<Pt> pts = points;
    for (Pt& p : pts) {
        p.az = normAz(p.az);
        p.elev = std::clamp(p.elev, 0.0, 90.0);
    }
    std::sort(pts.begin(), pts.end(), [](const Pt& a, const Pt& b) { return a.az < b.az; });
    if (pts.size() == 1)
        return pts[0].elev;
    const double a = normAz(az);
    std::vector<Pt> ext;
    ext.push_back({pts.back().az - 360, pts.back().elev});
    ext.insert(ext.end(), pts.begin(), pts.end());
    ext.push_back({pts.front().az + 360, pts.front().elev});
    for (size_t i = 0; i + 1 < ext.size(); ++i) {
        if (a >= ext[i].az && a <= ext[i + 1].az) {
            const double t = (a - ext[i].az) / std::max(1e-6, ext[i + 1].az - ext[i].az);
            return ext[i].elev + t * (ext[i + 1].elev - ext[i].elev);
        }
    }
    return 0;
}

} // namespace

SiteShade::SiteShade(QObject* parent) : QObject(parent) {}

QVariantMap SiteShade::sunPos(double lat, int dayOfYear, double solarHour) const
{
    const double latR = degToRad(lat);
    const double declR = degToRad(SolarMath::declination(dayOfYear));
    const double omR = (solarHour - 12) * 15 * degToRad(1);
    const double sinEl = std::sin(latR) * std::sin(declR)
                         + std::cos(latR) * std::cos(declR) * std::cos(omR);
    const double elev = radToDeg(std::asin(std::clamp(sinEl, -1.0, 1.0)));
    const double cosEl = std::cos(degToRad(elev));
    double cosAz = cosEl > 1e-6
                       ? (std::sin(declR) - std::sin(latR) * sinEl) / (std::cos(latR) * cosEl)
                       : 0;
    cosAz = std::clamp(cosAz, -1.0, 1.0);
    double az = radToDeg(std::acos(cosAz));
    if (omR > 0)
        az = 360 - az;
    return {{QStringLiteral("elev"), elev}, {QStringLiteral("az"), normAz(az)}};
}

QVariantMap SiteShade::computeShading(double lat, const QVariantList& points,
                                      const QVariantList& weatherData) const
{
    std::vector<Pt> pts;
    for (const QVariant& v : points) {
        const QVariantMap m = v.toMap();
        pts.push_back({m.value(QStringLiteral("az")).toDouble(),
                       m.value(QStringLiteral("elev")).toDouble()});
    }

    QVariantList monthly;
    QVariantList halfHourlyKeep;
    double sumBeam = 0;
    double sumLost = 0;

    for (int m = 1; m <= 12; ++m) {
        const int day = SolarMath::midMonthDay(m);
        double beam = 0;
        double lost = 0;
        double ghi = 100;
        double dhi = 40;
        if (m - 1 < weatherData.size()) {
            const QVariantMap w = weatherData[m - 1].toMap();
            ghi = w.value(QStringLiteral("GHI"), 100).toDouble();
            dhi = w.value(QStringLiteral("DHI"), 40).toDouble();
        }
        const double beamShare = std::clamp((ghi - dhi) / std::max(1.0, ghi), 0.15, 0.85);

        std::array<double, 48> slotBeam{};
        std::array<double, 48> slotLost{};

        for (int mi = 0; mi < 24 * 60; ++mi) {
            const double h = mi / 60.0;
            const QVariantMap sun = sunPos(lat, day, h);
            const double elev = sun.value(QStringLiteral("elev")).toDouble();
            if (elev <= 0)
                continue;
            const double w = std::sin(degToRad(elev));
            const int s = std::min(47, mi / 30);
            slotBeam[static_cast<size_t>(s)] += w;
            beam += w;
            if (elev < horizonElevAt(pts, sun.value(QStringLiteral("az")).toDouble())) {
                slotLost[static_cast<size_t>(s)] += w;
                lost += w;
            }
        }

        QVariantList keepRow;
        for (int s = 0; s < 48; ++s) {
            if (slotBeam[static_cast<size_t>(s)] <= 0) {
                keepRow.append(1.0);
                continue;
            }
            const double shadeFrac = slotLost[static_cast<size_t>(s)] / slotBeam[static_cast<size_t>(s)];
            keepRow.append(std::clamp(1.0 - beamShare * shadeFrac, 0.0, 1.0));
        }
        halfHourlyKeep.append(QVariant(keepRow));

        const double frac = beam > 0 ? lost / beam : 0;
        monthly.append(frac);
        sumBeam += ghi * beamShare;
        sumLost += ghi * beamShare * frac;
    }

    const double annual = sumBeam > 0
                              ? std::round((sumLost / sumBeam) * 1000) / 10
                              : 0;

    return {{QStringLiteral("monthly"), monthly},
            {QStringLiteral("halfHourlyKeep"), halfHourlyKeep},
            {QStringLiteral("annualLossPct"), annual}};
}

} // namespace ose

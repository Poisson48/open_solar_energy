#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>

namespace ose {

class SiteShade : public QObject {
    Q_OBJECT
public:
    explicit SiteShade(QObject* parent = nullptr);

    /** points: [{az, elev}], weather: monthly GHI/DHI. Retourne monthlyLoss, halfHourlyKeep, annualLossPct. */
    Q_INVOKABLE QVariantMap computeShading(double lat, const QVariantList& points,
                                           const QVariantList& weatherData) const;
    Q_INVOKABLE QVariantMap sunPos(double lat, int dayOfYear, double solarHour) const;
};

} // namespace ose

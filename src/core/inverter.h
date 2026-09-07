#pragma once

#include <QObject>
#include <QVariantMap>

namespace ose {

class InverterSizing : public QObject {
    Q_OBJECT
public:
    explicit InverterSizing(QObject* parent = nullptr);

    Q_INVOKABLE QVariantMap calcStringing(const QVariantMap& panel,
                                          const QVariantMap& inverter) const;
    Q_INVOKABLE int maxSeriesFromVoc(double voc, double maxInputV, double tempMin = -10) const;
};

} // namespace ose

#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>
#include <optional>

namespace ose {

class Finance : public QObject {
    Q_OBJECT
public:
    explicit Finance(QObject* parent = nullptr);

    Q_INVOKABLE double calcCurrentAnnualBill(const QVariantMap& bill) const;
    Q_INVOKABLE double calcSavingsOnBill(const QVariantList& monthlyMetrics,
                                         const QVariantMap& bill) const;
    Q_INVOKABLE QVariant calcPayback(double systemCost, double firstYearGain,
                                     const QVariantMap& opts = {}) const;
    Q_INVOKABLE double calcNPV(double systemCost, double firstYearGain,
                               const QVariantMap& opts = {}) const;
    Q_INVOKABLE double calcLCOE(double systemCost, double annualProd,
                                const QVariantMap& opts = {}) const;
    Q_INVOKABLE double calcFrenchIncentive(double Ppeak) const;
};

} // namespace ose

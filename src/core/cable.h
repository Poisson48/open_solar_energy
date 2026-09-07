#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>

namespace ose {

class CableCalc : public QObject {
    Q_OBJECT
public:
    explicit CableCalc(QObject* parent = nullptr);

    Q_INVOKABLE QVariantMap evalSection(const QVariantMap& p) const;
    Q_INVOKABLE QVariantMap calcSection(const QVariantMap& p) const;
};

} // namespace ose

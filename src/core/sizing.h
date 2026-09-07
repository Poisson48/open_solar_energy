#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>

namespace ose {

/** Dimensionnement réseau : balayage discret kWc + stratégies. */
class SizingEngine : public QObject {
    Q_OBJECT
public:
    explicit SizingEngine(QObject* parent = nullptr);

    Q_INVOKABLE QVariantMap run(const QVariantMap& input) const;
};

} // namespace ose

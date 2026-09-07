#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>

namespace ose {

class OffgridSizing : public QObject {
    Q_OBJECT
public:
    explicit OffgridSizing(QObject* parent = nullptr);

    Q_INVOKABLE QVariantMap run(const QVariantMap& input) const;
};

} // namespace ose

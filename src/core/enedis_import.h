#pragma once

#include <QObject>
#include <QVariantMap>

namespace ose {

class EnedisImport : public QObject {
    Q_OBJECT
public:
    explicit EnedisImport(QObject* parent = nullptr);

    /** Parse CSV/texte Enedis (mensuel ou journalier). Retourne monthlyKwh[12] + meta. */
    Q_INVOKABLE QVariantMap parse(const QString& text) const;
    Q_INVOKABLE QVariantMap parseFile(const QString& path) const;
};

} // namespace ose

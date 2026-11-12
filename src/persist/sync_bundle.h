#pragma once

#include <QByteArray>
#include <QHash>
#include <QString>

namespace ose {

/**
 * Archive .osebundle : ZIP « store » (sans compression), portable, sans zip(1).
 * Contenu typique : manifest.json, projects/<id>.json, catalogs/panels.json, git/<id>.bundle
 */
class SyncBundle {
public:
    bool isValid() const { return !m_files.isEmpty() && m_files.contains(QStringLiteral("manifest.json")); }

    void clear();
    void put(const QString& path, const QByteArray& data);
    QByteArray get(const QString& path) const;
    bool contains(const QString& path) const;
    QStringList paths() const;

    QByteArray toZipBytes() const;
    bool fromZipBytes(const QByteArray& zip);

private:
    QHash<QString, QByteArray> m_files;
};

} // namespace ose

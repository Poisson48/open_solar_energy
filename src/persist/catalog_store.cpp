#include "catalog_store.h"

#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRandomGenerator>
#include <QStandardPaths>

namespace ose {

CatalogStore::CatalogStore(QObject* parent) : QObject(parent) {}

QString CatalogStore::panelsPath() const
{
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QDir().mkpath(dir);
    return dir + QStringLiteral("/ose_panels_v1.json");
}

QString CatalogStore::invertersPath() const
{
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QDir().mkpath(dir);
    return dir + QStringLiteral("/ose_inverters_v1.json");
}

QJsonArray CatalogStore::readArray(const QString& path) const
{
    QFile f(path);
    if (!f.open(QIODevice::ReadOnly))
        return {};
    const QJsonDocument doc = QJsonDocument::fromJson(f.readAll());
    return doc.isArray() ? doc.array() : QJsonArray{};
}

bool CatalogStore::writeArray(const QString& path, const QJsonArray& arr) const
{
    QFile f(path);
    if (!f.open(QIODevice::WriteOnly | QIODevice::Truncate))
        return false;
    f.write(QJsonDocument(arr).toJson(QJsonDocument::Compact));
    return true;
}

void CatalogStore::load()
{
    m_panels = readArray(panelsPath());
    m_inverters = readArray(invertersPath());
    if (m_panels.isEmpty() && m_inverters.isEmpty())
        seedDefaults();
    emit panelsChanged();
    emit invertersChanged();
}

QVariantList CatalogStore::panels() const
{
    QVariantList out;
    for (const QJsonValue& v : m_panels)
        out.append(v.toObject().toVariantMap());
    return out;
}

QVariantList CatalogStore::inverters() const
{
    QVariantList out;
    for (const QJsonValue& v : m_inverters)
        out.append(v.toObject().toVariantMap());
    return out;
}

void CatalogStore::seedDefaults()
{
    if (m_panels.isEmpty()) {
        m_panels = QJsonArray{
            QJsonObject{{QStringLiteral("id"), QStringLiteral("panel_seed_400")},
                        {QStringLiteral("model"), QStringLiteral("Module 400 Wc")},
                        {QStringLiteral("fabricant"), QStringLiteral("Générique")},
                        {QStringLiteral("wp"), 400},
                        {QStringLiteral("largeur"), 1.134},
                        {QStringLiteral("hauteur"), 1.722},
                        {QStringLiteral("m2"), 1.95},
                        {QStringLiteral("tech"), QStringLiteral("crystSi")},
                        {QStringLiteral("voc"), 49.5},
                        {QStringLiteral("isc"), 10.2},
                        {QStringLiteral("vmp"), 41.0},
                        {QStringLiteral("imp"), 9.76},
                        {QStringLiteral("prix"), 120},
                        {QStringLiteral("seeded"), true}},
            QJsonObject{{QStringLiteral("id"), QStringLiteral("panel_seed_500")},
                        {QStringLiteral("model"), QStringLiteral("Module 500 Wc")},
                        {QStringLiteral("fabricant"), QStringLiteral("Générique")},
                        {QStringLiteral("wp"), 500},
                        {QStringLiteral("largeur"), 1.134},
                        {QStringLiteral("hauteur"), 1.96},
                        {QStringLiteral("m2"), 2.22},
                        {QStringLiteral("tech"), QStringLiteral("crystSi")},
                        {QStringLiteral("voc"), 51.5},
                        {QStringLiteral("isc"), 12.4},
                        {QStringLiteral("vmp"), 43.0},
                        {QStringLiteral("imp"), 11.63},
                        {QStringLiteral("prix"), 150},
                        {QStringLiteral("seeded"), true}},
        };
        writeArray(panelsPath(), m_panels);
    }
    if (m_inverters.isEmpty()) {
        m_inverters = QJsonArray{
            QJsonObject{{QStringLiteral("id"), QStringLiteral("inv_seed_3k")},
                        {QStringLiteral("brand"), QStringLiteral("Générique")},
                        {QStringLiteral("model"), QStringLiteral("Onduleur 3 kVA")},
                        {QStringLiteral("type"), QStringLiteral("string")},
                        {QStringLiteral("pac"), 3.0},
                        {QStringLiteral("mpptCount"), 2},
                        {QStringLiteral("maxInputV"), 600},
                        {QStringLiteral("mpptMinV"), 120},
                        {QStringLiteral("mpptMaxV"), 520},
                        {QStringLiteral("maxInputI"), 12},
                        {QStringLiteral("prix"), 900},
                        {QStringLiteral("seeded"), true}},
            QJsonObject{{QStringLiteral("id"), QStringLiteral("inv_seed_5k")},
                        {QStringLiteral("brand"), QStringLiteral("Générique")},
                        {QStringLiteral("model"), QStringLiteral("Hybride 5 kVA")},
                        {QStringLiteral("type"), QStringLiteral("hybrid")},
                        {QStringLiteral("pac"), 5.0},
                        {QStringLiteral("mpptCount"), 2},
                        {QStringLiteral("maxInputV"), 600},
                        {QStringLiteral("mpptMinV"), 150},
                        {QStringLiteral("mpptMaxV"), 550},
                        {QStringLiteral("maxInputI"), 15},
                        {QStringLiteral("prix"), 1800},
                        {QStringLiteral("seeded"), true}},
        };
        writeArray(invertersPath(), m_inverters);
    }
    emit panelsChanged();
    emit invertersChanged();
}

QString CatalogStore::savePanel(const QVariantMap& data)
{
    QJsonObject o = QJsonObject::fromVariantMap(data);
    QString id = o.value(QStringLiteral("id")).toString();
    if (id.isEmpty() || id.startsWith(QLatin1String("rexel_"))) {
        id = QStringLiteral("panel_%1_%2")
                 .arg(QDateTime::currentMSecsSinceEpoch())
                 .arg(QRandomGenerator::global()->bounded(0x10000), 4, 16, QLatin1Char('0'));
        o.insert(QStringLiteral("id"), id);
    }
    o.insert(QStringLiteral("savedAt"), QDateTime::currentDateTimeUtc().toString(Qt::ISODate));
    int idx = -1;
    for (int i = 0; i < m_panels.size(); ++i) {
        if (m_panels[i].toObject().value(QStringLiteral("id")).toString() == id) {
            idx = i;
            break;
        }
    }
    if (idx >= 0)
        m_panels.replace(idx, o);
    else
        m_panels.prepend(o);
    writeArray(panelsPath(), m_panels);
    emit panelsChanged();
    return id;
}

bool CatalogStore::removePanel(const QString& id)
{
    for (int i = 0; i < m_panels.size(); ++i) {
        if (m_panels[i].toObject().value(QStringLiteral("id")).toString() == id) {
            m_panels.removeAt(i);
            writeArray(panelsPath(), m_panels);
            emit panelsChanged();
            return true;
        }
    }
    return false;
}

QString CatalogStore::saveInverter(const QVariantMap& data)
{
    QJsonObject o = QJsonObject::fromVariantMap(data);
    QString id = o.value(QStringLiteral("id")).toString();
    if (id.isEmpty()) {
        id = QStringLiteral("inv_%1_%2")
                 .arg(QDateTime::currentMSecsSinceEpoch())
                 .arg(QRandomGenerator::global()->bounded(0x10000), 4, 16, QLatin1Char('0'));
        o.insert(QStringLiteral("id"), id);
    }
    o.insert(QStringLiteral("savedAt"), QDateTime::currentDateTimeUtc().toString(Qt::ISODate));
    int idx = -1;
    for (int i = 0; i < m_inverters.size(); ++i) {
        if (m_inverters[i].toObject().value(QStringLiteral("id")).toString() == id) {
            idx = i;
            break;
        }
    }
    if (idx >= 0)
        m_inverters.replace(idx, o);
    else
        m_inverters.prepend(o);
    writeArray(invertersPath(), m_inverters);
    emit invertersChanged();
    return id;
}

bool CatalogStore::removeInverter(const QString& id)
{
    for (int i = 0; i < m_inverters.size(); ++i) {
        if (m_inverters[i].toObject().value(QStringLiteral("id")).toString() == id) {
            m_inverters.removeAt(i);
            writeArray(invertersPath(), m_inverters);
            emit invertersChanged();
            return true;
        }
    }
    return false;
}

QVariantMap CatalogStore::getPanel(const QString& id) const
{
    for (const QJsonValue& v : m_panels) {
        const QJsonObject o = v.toObject();
        if (o.value(QStringLiteral("id")).toString() == id)
            return o.toVariantMap();
    }
    return {};
}

QVariantMap CatalogStore::getInverter(const QString& id) const
{
    for (const QJsonValue& v : m_inverters) {
        const QJsonObject o = v.toObject();
        if (o.value(QStringLiteral("id")).toString() == id)
            return o.toVariantMap();
    }
    return {};
}

} // namespace ose

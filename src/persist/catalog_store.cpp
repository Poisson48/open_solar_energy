#include "catalog_store.h"

#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRandomGenerator>
#include <QRegularExpression>
#include <QStandardPaths>

#include <algorithm>
#include <cmath>

namespace ose {
namespace {

QString makeId(const QString& prefix)
{
    return QStringLiteral("%1_%2_%3")
        .arg(prefix)
        .arg(QDateTime::currentMSecsSinceEpoch())
        .arg(QRandomGenerator::global()->bounded(0x10000), 4, 16, QLatin1Char('0'));
}

} // namespace

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

QJsonObject CatalogStore::normalizePanel(const QJsonObject& raw)
{
    QJsonObject o = raw;
    const QString sku = raw.value(QStringLiteral("sku")).toString();
    QString id = raw.value(QStringLiteral("id")).toString();
    if (id.isEmpty() && !sku.isEmpty())
        id = QStringLiteral("rexel_panel_") + sku;
    if (!id.isEmpty())
        o.insert(QStringLiteral("id"), id);

    if (!o.contains(QStringLiteral("fabricant")) && o.contains(QStringLiteral("brand")))
        o.insert(QStringLiteral("fabricant"), o.value(QStringLiteral("brand")));
    if (!o.contains(QStringLiteral("brand")) && o.contains(QStringLiteral("fabricant")))
        o.insert(QStringLiteral("brand"), o.value(QStringLiteral("fabricant")));

    const double wp = o.value(QStringLiteral("wp")).toDouble(o.value(QStringLiteral("pmax")).toDouble());
    o.insert(QStringLiteral("wp"), wp);
    o.insert(QStringLiteral("pmax"), wp);

    double largeur = o.value(QStringLiteral("largeur")).toDouble();
    double hauteur = o.value(QStringLiteral("hauteur")).toDouble();
    if (largeur <= 0)
        largeur = o.value(QStringLiteral("widthM")).toDouble();
    if (hauteur <= 0)
        hauteur = o.value(QStringLiteral("lengthM")).toDouble();
    // mm → m si besoin
    if (largeur > 20)
        largeur /= 1000.0;
    if (hauteur > 20)
        hauteur /= 1000.0;
    if (largeur > 0)
        o.insert(QStringLiteral("largeur"), largeur);
    if (hauteur > 0)
        o.insert(QStringLiteral("hauteur"), hauteur);
    o.insert(QStringLiteral("widthM"), largeur > 0 ? largeur : 1.134);
    o.insert(QStringLiteral("lengthM"), hauteur > 0 ? hauteur : 1.722);

    double m2 = o.value(QStringLiteral("m2")).toDouble();
    if (m2 <= 0 && largeur > 0 && hauteur > 0)
        m2 = std::round(largeur * hauteur * 10000) / 10000.0;
    if (m2 > 0)
        o.insert(QStringLiteral("m2"), m2);

    if (wp > 0 && m2 > 0 && !o.contains(QStringLiteral("rendement")))
        o.insert(QStringLiteral("rendement"), std::round(wp / (m2 * 1000.0) * 1000) / 10.0);

    if (o.value(QStringLiteral("model")).toString().isEmpty())
        o.insert(QStringLiteral("model"),
                 raw.value(QStringLiteral("name")).toString());

    if (!o.contains(QStringLiteral("datasheet")) && o.contains(QStringLiteral("datasheetUrl")))
        o.insert(QStringLiteral("datasheet"), o.value(QStringLiteral("datasheetUrl")));

    return o;
}

bool CatalogStore::isRealInverter(const QJsonObject& inv)
{
    const QString blob = QStringLiteral("%1 %2 %3 %4")
                             .arg(inv.value(QStringLiteral("name")).toString(),
                                  inv.value(QStringLiteral("model")).toString(),
                                  inv.value(QStringLiteral("brand")).toString(),
                                  inv.value(QStringLiteral("fabricant")).toString());
    static const QRegularExpression junk(
        QStringLiteral("passerelle|gateway|\\bECU[- ]|câble|cable|bouchon|borne de recharge|"
                       "compteur(?!.*onduleur)|coffret de|optimiseur|q-seal|q cable"),
        QRegularExpression::CaseInsensitiveOption);
    if (junk.match(blob).hasMatch())
        return false;
    if (inv.value(QStringLiteral("type")).toString() == QLatin1String("micro"))
        return true;
    return inv.value(QStringLiteral("pnom")).toDouble() > 0
           || inv.value(QStringLiteral("pac")).toDouble() > 0;
}

QJsonObject CatalogStore::normalizeInverter(const QJsonObject& raw)
{
    QJsonObject o = raw;
    const QString sku = raw.value(QStringLiteral("sku")).toString();
    QString id = raw.value(QStringLiteral("id")).toString();
    if (id.isEmpty() && !sku.isEmpty())
        id = QStringLiteral("rexel_inv_") + sku;
    if (!id.isEmpty())
        o.insert(QStringLiteral("id"), id);

    if (!o.contains(QStringLiteral("brand")) && o.contains(QStringLiteral("fabricant")))
        o.insert(QStringLiteral("brand"), o.value(QStringLiteral("fabricant")));
    if (!o.contains(QStringLiteral("fabricant")) && o.contains(QStringLiteral("brand")))
        o.insert(QStringLiteral("fabricant"), o.value(QStringLiteral("brand")));

    if (o.value(QStringLiteral("model")).toString().isEmpty())
        o.insert(QStringLiteral("model"), raw.value(QStringLiteral("name")).toString());

    const double pnom = o.value(QStringLiteral("pnom")).toDouble(o.value(QStringLiteral("pac")).toDouble());
    if (pnom > 0) {
        o.insert(QStringLiteral("pnom"), pnom);
        o.insert(QStringLiteral("pac"), pnom);
    }

    if (o.contains(QStringLiteral("nMppt")) && !o.contains(QStringLiteral("mpptCount")))
        o.insert(QStringLiteral("mpptCount"), o.value(QStringLiteral("nMppt")));
    if (o.contains(QStringLiteral("mpptCount")) && !o.contains(QStringLiteral("nMppt")))
        o.insert(QStringLiteral("nMppt"), o.value(QStringLiteral("mpptCount")));

    if (o.contains(QStringLiteral("maxVocInput")) && !o.contains(QStringLiteral("maxInputV")))
        o.insert(QStringLiteral("maxInputV"), o.value(QStringLiteral("maxVocInput")));
    if (o.contains(QStringLiteral("maxInputV")) && !o.contains(QStringLiteral("maxVocInput")))
        o.insert(QStringLiteral("maxVocInput"), o.value(QStringLiteral("maxInputV")));

    if (!o.contains(QStringLiteral("datasheet")) && o.contains(QStringLiteral("datasheetUrl")))
        o.insert(QStringLiteral("datasheet"), o.value(QStringLiteral("datasheetUrl")));

    if (o.value(QStringLiteral("type")).toString().isEmpty())
        o.insert(QStringLiteral("type"), QStringLiteral("string"));

    return o;
}

void CatalogStore::loadBundledRexel()
{
    m_catalogPanels = QJsonArray{};
    m_catalogInverters = QJsonArray{};
    QFile f(QStringLiteral(":/data/rexel_catalog/catalog.json"));
    if (!f.open(QIODevice::ReadOnly))
        return;
    const QJsonDocument doc = QJsonDocument::fromJson(f.readAll());
    if (!doc.isObject())
        return;
    const QJsonObject root = doc.object();
    for (const QJsonValue& v : root.value(QStringLiteral("panels")).toArray()) {
        const QJsonObject raw = v.toObject();
        if (raw.value(QStringLiteral("wp")).toDouble() <= 0)
            continue;
        QJsonObject p = normalizePanel(raw);
        p.insert(QStringLiteral("source"), QStringLiteral("rexel"));
        p.insert(QStringLiteral("seeded"), true);
        if (!p.contains(QStringLiteral("notes")))
            p.insert(QStringLiteral("notes"), QStringLiteral("Catalogue Rexel"));
        m_catalogPanels.append(p);
    }
    for (const QJsonValue& v : root.value(QStringLiteral("inverters")).toArray()) {
        const QJsonObject raw = v.toObject();
        if (!isRealInverter(raw))
            continue;
        QJsonObject inv = normalizeInverter(raw);
        inv.insert(QStringLiteral("source"), QStringLiteral("rexel"));
        inv.insert(QStringLiteral("seeded"), true);
        if (!inv.contains(QStringLiteral("notes")))
            inv.insert(QStringLiteral("notes"), QStringLiteral("Catalogue Rexel"));
        m_catalogInverters.append(inv);
    }
}

void CatalogStore::ensureDemoSeeds()
{
    auto hasModel = [&](const QString& needle) {
        for (const QJsonValue& v : m_userPanels) {
            if (v.toObject().value(QStringLiteral("model")).toString().contains(needle))
                return true;
        }
        return false;
    };

    const QList<QJsonObject> demos = {
        QJsonObject{{QStringLiteral("model"), QStringLiteral("Jinko Tiger Neo N-type 425W")},
                    {QStringLiteral("fabricant"), QStringLiteral("JinkoSolar")},
                    {QStringLiteral("brand"), QStringLiteral("JinkoSolar")},
                    {QStringLiteral("wp"), 425},
                    {QStringLiteral("largeur"), 1.134},
                    {QStringLiteral("hauteur"), 1.762},
                    {QStringLiteral("tech"), QStringLiteral("mono")},
                    {QStringLiteral("coef_temp"), -0.29},
                    {QStringLiteral("voc"), 31.79},
                    {QStringLiteral("isc"), 17.02},
                    {QStringLiteral("vmp"), 26.63},
                    {QStringLiteral("imp"), 15.96},
                    {QStringLiteral("garantie_p"), 30},
                    {QStringLiteral("seeded"), true},
                    {QStringLiteral("notes"), QStringLiteral("Panneau démo Open Solar Energy")}},
        QJsonObject{{QStringLiteral("model"), QStringLiteral("Longi Hi-MO 6 430W")},
                    {QStringLiteral("fabricant"), QStringLiteral("LONGi")},
                    {QStringLiteral("brand"), QStringLiteral("LONGi")},
                    {QStringLiteral("wp"), 430},
                    {QStringLiteral("largeur"), 1.134},
                    {QStringLiteral("hauteur"), 1.722},
                    {QStringLiteral("tech"), QStringLiteral("mono")},
                    {QStringLiteral("voc"), 41.9},
                    {QStringLiteral("isc"), 13.31},
                    {QStringLiteral("vmp"), 34.9},
                    {QStringLiteral("imp"), 12.32},
                    {QStringLiteral("garantie_p"), 25},
                    {QStringLiteral("seeded"), true}},
        QJsonObject{{QStringLiteral("model"), QStringLiteral("DualSun Flash 440W")},
                    {QStringLiteral("fabricant"), QStringLiteral("DualSun")},
                    {QStringLiteral("brand"), QStringLiteral("DualSun")},
                    {QStringLiteral("wp"), 440},
                    {QStringLiteral("largeur"), 1.134},
                    {QStringLiteral("hauteur"), 1.762},
                    {QStringLiteral("tech"), QStringLiteral("bifacial")},
                    {QStringLiteral("bifacial"), true},
                    {QStringLiteral("voc"), 33.9},
                    {QStringLiteral("isc"), 16.68},
                    {QStringLiteral("vmp"), 28.4},
                    {QStringLiteral("imp"), 15.5},
                    {QStringLiteral("garantie_p"), 25},
                    {QStringLiteral("seeded"), true}},
        QJsonObject{{QStringLiteral("model"), QStringLiteral("Trina Solar Vertex S+ 425W")},
                    {QStringLiteral("fabricant"), QStringLiteral("Trina Solar")},
                    {QStringLiteral("brand"), QStringLiteral("Trina Solar")},
                    {QStringLiteral("wp"), 425},
                    {QStringLiteral("largeur"), 1.134},
                    {QStringLiteral("hauteur"), 1.762},
                    {QStringLiteral("voc"), 32.1},
                    {QStringLiteral("isc"), 16.9},
                    {QStringLiteral("vmp"), 26.9},
                    {QStringLiteral("imp"), 15.8},
                    {QStringLiteral("garantie_p"), 25},
                    {QStringLiteral("seeded"), true}},
        QJsonObject{{QStringLiteral("model"), QStringLiteral("REC Alpha Pure-R 430W")},
                    {QStringLiteral("fabricant"), QStringLiteral("REC Group")},
                    {QStringLiteral("brand"), QStringLiteral("REC Group")},
                    {QStringLiteral("wp"), 430},
                    {QStringLiteral("largeur"), 1.134},
                    {QStringLiteral("hauteur"), 1.721},
                    {QStringLiteral("voc"), 44.9},
                    {QStringLiteral("isc"), 12.24},
                    {QStringLiteral("vmp"), 37.5},
                    {QStringLiteral("imp"), 11.47},
                    {QStringLiteral("garantie_p"), 25},
                    {QStringLiteral("seeded"), true}},
        QJsonObject{{QStringLiteral("model"), QStringLiteral("Qcells Q.TRON 420W")},
                    {QStringLiteral("fabricant"), QStringLiteral("Qcells")},
                    {QStringLiteral("brand"), QStringLiteral("Qcells")},
                    {QStringLiteral("wp"), 420},
                    {QStringLiteral("largeur"), 1.134},
                    {QStringLiteral("hauteur"), 1.879},
                    {QStringLiteral("voc"), 34.35},
                    {QStringLiteral("isc"), 15.7},
                    {QStringLiteral("vmp"), 28.9},
                    {QStringLiteral("imp"), 14.53},
                    {QStringLiteral("garantie_p"), 25},
                    {QStringLiteral("seeded"), true}},
    };

    bool changed = false;
    for (QJsonObject d : demos) {
        const QString model = d.value(QStringLiteral("model")).toString();
        const QString needle = model.section(QLatin1Char(' '), -2); // last tokens approx
        Q_UNUSED(needle);
        bool found = false;
        for (const QString& key : {QStringLiteral("Tiger Neo"), QStringLiteral("Hi-MO 6"),
                                   QStringLiteral("DualSun Flash"), QStringLiteral("Vertex S+"),
                                   QStringLiteral("Alpha Pure-R"), QStringLiteral("Q.TRON")}) {
            if (model.contains(key) && hasModel(key)) {
                found = true;
                break;
            }
        }
        if (found)
            continue;
        d.insert(QStringLiteral("id"), makeId(QStringLiteral("panel")));
        m_userPanels.prepend(normalizePanel(d));
        changed = true;
    }

    if (m_userInverters.isEmpty()) {
        m_userInverters = QJsonArray{
            normalizeInverter(QJsonObject{
                {QStringLiteral("id"), QStringLiteral("inv_seed_3k")},
                {QStringLiteral("brand"), QStringLiteral("Générique")},
                {QStringLiteral("model"), QStringLiteral("Onduleur 3 kVA")},
                {QStringLiteral("type"), QStringLiteral("string")},
                {QStringLiteral("phase"), 1},
                {QStringLiteral("pnom"), 3.0},
                {QStringLiteral("mpptCount"), 2},
                {QStringLiteral("maxInputV"), 600},
                {QStringLiteral("mpptMinV"), 120},
                {QStringLiteral("mpptMaxV"), 520},
                {QStringLiteral("maxInputI"), 12},
                {QStringLiteral("seeded"), true}}),
            normalizeInverter(QJsonObject{
                {QStringLiteral("id"), QStringLiteral("inv_seed_5k")},
                {QStringLiteral("brand"), QStringLiteral("Générique")},
                {QStringLiteral("model"), QStringLiteral("Hybride 5 kVA")},
                {QStringLiteral("type"), QStringLiteral("hybrid")},
                {QStringLiteral("phase"), 1},
                {QStringLiteral("pnom"), 5.0},
                {QStringLiteral("mpptCount"), 2},
                {QStringLiteral("maxInputV"), 600},
                {QStringLiteral("mpptMinV"), 150},
                {QStringLiteral("mpptMaxV"), 550},
                {QStringLiteral("maxInputI"), 15},
                {QStringLiteral("seeded"), true}}),
        };
        changed = true;
    }

    if (changed) {
        writeArray(panelsPath(), m_userPanels);
        writeArray(invertersPath(), m_userInverters);
    }
}

void CatalogStore::load()
{
    m_userPanels = readArray(panelsPath());
    m_userInverters = readArray(invertersPath());
    // Purge d’anciennes copies Rexel persistées (le catalogue est en mémoire)
    QJsonArray cleanP;
    for (const QJsonValue& v : m_userPanels) {
        const QJsonObject o = v.toObject();
        const QString id = o.value(QStringLiteral("id")).toString();
        if (id.startsWith(QLatin1String("rexel_panel_"))
            || o.value(QStringLiteral("source")).toString() == QLatin1String("rexel"))
            continue;
        cleanP.append(normalizePanel(o));
    }
    m_userPanels = cleanP;
    QJsonArray cleanI;
    for (const QJsonValue& v : m_userInverters) {
        const QJsonObject o = v.toObject();
        const QString id = o.value(QStringLiteral("id")).toString();
        if (id.startsWith(QLatin1String("rexel_inv_"))
            || o.value(QStringLiteral("source")).toString() == QLatin1String("rexel"))
            continue;
        cleanI.append(normalizeInverter(o));
    }
    m_userInverters = cleanI;

    loadBundledRexel();
    ensureDemoSeeds();
    writeArray(panelsPath(), m_userPanels);
    writeArray(invertersPath(), m_userInverters);
    emit panelsChanged();
    emit invertersChanged();
}

void CatalogStore::seedDefaults()
{
    ensureDemoSeeds();
    if (m_catalogPanels.isEmpty())
        loadBundledRexel();
    emit panelsChanged();
    emit invertersChanged();
}

QVariantList CatalogStore::mergePanels() const
{
    QVariantList out;
    for (const QJsonValue& v : m_userPanels)
        out.append(v.toObject().toVariantMap());
    for (const QJsonValue& v : m_catalogPanels)
        out.append(v.toObject().toVariantMap());
    std::sort(out.begin(), out.end(), [](const QVariant& a, const QVariant& b) {
        const QVariantMap ma = a.toMap();
        const QVariantMap mb = b.toMap();
        const bool au = ma.value(QStringLiteral("source")).toString() == QLatin1String("rexel");
        const bool bu = mb.value(QStringLiteral("source")).toString() == QLatin1String("rexel");
        if (au != bu)
            return !au; // perso d’abord
        const double wa = ma.value(QStringLiteral("wp")).toDouble();
        const double wb = mb.value(QStringLiteral("wp")).toDouble();
        if (wa != wb)
            return wa > wb;
        return ma.value(QStringLiteral("model")).toString()
            < mb.value(QStringLiteral("model")).toString();
    });
    return out;
}

QVariantList CatalogStore::mergeInverters() const
{
    QVariantList out;
    for (const QJsonValue& v : m_userInverters)
        out.append(v.toObject().toVariantMap());
    for (const QJsonValue& v : m_catalogInverters)
        out.append(v.toObject().toVariantMap());
    std::sort(out.begin(), out.end(), [](const QVariant& a, const QVariant& b) {
        const QVariantMap ma = a.toMap();
        const QVariantMap mb = b.toMap();
        const bool au = ma.value(QStringLiteral("source")).toString() == QLatin1String("rexel");
        const bool bu = mb.value(QStringLiteral("source")).toString() == QLatin1String("rexel");
        if (au != bu)
            return !au;
        auto pnom = [](const QVariantMap& m) {
            const double p = m.value(QStringLiteral("pnom")).toDouble();
            return p > 0 ? p : m.value(QStringLiteral("pac")).toDouble();
        };
        const double pa = pnom(ma);
        const double pb = pnom(mb);
        if (pa != pb)
            return pa > pb;
        return QStringLiteral("%1 %2")
                   .arg(ma.value(QStringLiteral("brand")).toString(),
                        ma.value(QStringLiteral("model")).toString())
            < QStringLiteral("%1 %2")
                   .arg(mb.value(QStringLiteral("brand")).toString(),
                        mb.value(QStringLiteral("model")).toString());
    });
    return out;
}

QVariantList CatalogStore::panels() const { return mergePanels(); }
QVariantList CatalogStore::inverters() const { return mergeInverters(); }

bool CatalogStore::matchTokens(const QString& hay, const QString& query)
{
    if (query.trimmed().isEmpty())
        return true;
    const QStringList tokens = query.toLower().split(QRegularExpression(QStringLiteral("\\s+")),
                                                     Qt::SkipEmptyParts);
    const QString h = hay.toLower();
    for (const QString& t : tokens) {
        if (!h.contains(t))
            return false;
    }
    return true;
}

QVariantList CatalogStore::searchPanels(const QString& query) const
{
    QVariantList out;
    for (const QVariant& v : mergePanels()) {
        const QVariantMap p = v.toMap();
        const QString hay = QStringLiteral("%1 %2 %3 %4 %5 %6 %7 %8 %9 %10")
                                .arg(p.value(QStringLiteral("model")).toString(),
                                     p.value(QStringLiteral("fabricant")).toString(),
                                     p.value(QStringLiteral("brand")).toString(),
                                     p.value(QStringLiteral("tech")).toString(),
                                     p.value(QStringLiteral("wp")).toString(),
                                     p.value(QStringLiteral("notes")).toString(),
                                     p.value(QStringLiteral("sku")).toString(),
                                     p.value(QStringLiteral("rexelPartNumber")).toString(),
                                     p.value(QStringLiteral("name")).toString(),
                                     p.value(QStringLiteral("id")).toString());
        if (matchTokens(hay, query))
            out.append(p);
    }
    return out;
}

QVariantList CatalogStore::searchInverters(const QString& query) const
{
    QVariantList out;
    for (const QVariant& v : mergeInverters()) {
        const QVariantMap i = v.toMap();
        const QString hay = QStringLiteral("%1 %2 %3 %4 %5 %6 %7 %8 %9 %10")
                                .arg(i.value(QStringLiteral("brand")).toString(),
                                     i.value(QStringLiteral("model")).toString(),
                                     i.value(QStringLiteral("type")).toString(),
                                     i.value(QStringLiteral("pnom")).toString(),
                                     i.value(QStringLiteral("phase")).toString(),
                                     i.value(QStringLiteral("notes")).toString(),
                                     i.value(QStringLiteral("sku")).toString(),
                                     i.value(QStringLiteral("rexelPartNumber")).toString(),
                                     i.value(QStringLiteral("name")).toString(),
                                     i.value(QStringLiteral("id")).toString());
        if (matchTokens(hay, query))
            out.append(i);
    }
    return out;
}

bool CatalogStore::isCatalogId(const QString& id) const
{
    return id.startsWith(QLatin1String("rexel_"));
}

QString CatalogStore::savePanel(const QVariantMap& data)
{
    QJsonObject o = normalizePanel(QJsonObject::fromVariantMap(data));
    QString id = o.value(QStringLiteral("id")).toString();
    if (id.isEmpty() || id.startsWith(QLatin1String("rexel_"))) {
        id = makeId(QStringLiteral("panel"));
        o.insert(QStringLiteral("id"), id);
    }
    o.remove(QStringLiteral("source")); // perso
    o.insert(QStringLiteral("savedAt"), QDateTime::currentDateTimeUtc().toString(Qt::ISODate));
    int idx = -1;
    for (int i = 0; i < m_userPanels.size(); ++i) {
        if (m_userPanels[i].toObject().value(QStringLiteral("id")).toString() == id) {
            idx = i;
            break;
        }
    }
    if (idx >= 0)
        m_userPanels.replace(idx, o);
    else
        m_userPanels.prepend(o);
    writeArray(panelsPath(), m_userPanels);
    emit panelsChanged();
    return id;
}

bool CatalogStore::removePanel(const QString& id)
{
    if (isCatalogId(id))
        return false;
    for (int i = 0; i < m_userPanels.size(); ++i) {
        if (m_userPanels[i].toObject().value(QStringLiteral("id")).toString() == id) {
            m_userPanels.removeAt(i);
            writeArray(panelsPath(), m_userPanels);
            emit panelsChanged();
            return true;
        }
    }
    return false;
}

QString CatalogStore::saveInverter(const QVariantMap& data)
{
    QJsonObject o = normalizeInverter(QJsonObject::fromVariantMap(data));
    QString id = o.value(QStringLiteral("id")).toString();
    if (id.isEmpty() || id.startsWith(QLatin1String("rexel_"))) {
        id = makeId(QStringLiteral("inv"));
        o.insert(QStringLiteral("id"), id);
    }
    o.remove(QStringLiteral("source"));
    o.insert(QStringLiteral("savedAt"), QDateTime::currentDateTimeUtc().toString(Qt::ISODate));
    int idx = -1;
    for (int i = 0; i < m_userInverters.size(); ++i) {
        if (m_userInverters[i].toObject().value(QStringLiteral("id")).toString() == id) {
            idx = i;
            break;
        }
    }
    if (idx >= 0)
        m_userInverters.replace(idx, o);
    else
        m_userInverters.prepend(o);
    writeArray(invertersPath(), m_userInverters);
    emit invertersChanged();
    return id;
}

bool CatalogStore::removeInverter(const QString& id)
{
    if (isCatalogId(id))
        return false;
    for (int i = 0; i < m_userInverters.size(); ++i) {
        if (m_userInverters[i].toObject().value(QStringLiteral("id")).toString() == id) {
            m_userInverters.removeAt(i);
            writeArray(invertersPath(), m_userInverters);
            emit invertersChanged();
            return true;
        }
    }
    return false;
}

QVariantMap CatalogStore::getPanel(const QString& id) const
{
    if (id.isEmpty())
        return {};
    for (const QJsonValue& v : m_userPanels) {
        const QJsonObject o = v.toObject();
        if (o.value(QStringLiteral("id")).toString() == id)
            return o.toVariantMap();
    }
    for (const QJsonValue& v : m_catalogPanels) {
        const QJsonObject o = v.toObject();
        if (o.value(QStringLiteral("id")).toString() == id)
            return o.toVariantMap();
    }
    return {};
}

QVariantMap CatalogStore::getInverter(const QString& id) const
{
    if (id.isEmpty())
        return {};
    for (const QJsonValue& v : m_userInverters) {
        const QJsonObject o = v.toObject();
        if (o.value(QStringLiteral("id")).toString() == id)
            return o.toVariantMap();
    }
    for (const QJsonValue& v : m_catalogInverters) {
        const QJsonObject o = v.toObject();
        if (o.value(QStringLiteral("id")).toString() == id)
            return o.toVariantMap();
    }
    return {};
}

} // namespace ose

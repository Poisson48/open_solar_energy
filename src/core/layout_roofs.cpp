#include "layout_roofs.h"

#include "layout_3d.h"

#include <QDateTime>
#include <QHash>
#include <QtMath>
#include <algorithm>
#include <cmath>

namespace ose {
namespace {

QString makeRoofId()
{
    static int seq = 0;
    return QStringLiteral("roof-%1-%2")
        .arg(QDateTime::currentMSecsSinceEpoch(), 0, 36)
        .arg(++seq, 0, 36);
}

QVariantMap clampRoof(QVariantMap r)
{
    r.insert(QStringLiteral("roofW"),
             std::clamp(r.value(QStringLiteral("roofW"), 8).toDouble(), 1.0, 200.0));
    r.insert(QStringLiteral("roofD"),
             std::clamp(r.value(QStringLiteral("roofD"), 6).toDouble(), 1.0, 200.0));
    r.insert(QStringLiteral("panelW"),
             std::clamp(r.value(QStringLiteral("panelW"), 1.13).toDouble(), 0.2, 3.0));
    r.insert(QStringLiteral("panelH"),
             std::clamp(r.value(QStringLiteral("panelH"), 1.76).toDouble(), 0.2, 3.0));
    r.insert(QStringLiteral("nPanels"),
             std::max(0, r.value(QStringLiteral("nPanels"), 0).toInt()));
    r.insert(QStringLiteral("rows"),
             std::max(1, r.value(QStringLiteral("rows"), 2).toInt()));
    r.insert(QStringLiteral("cols"),
             std::max(1, r.value(QStringLiteral("cols"), 4).toInt()));
    r.insert(QStringLiteral("tilt"),
             std::clamp(r.value(QStringLiteral("tilt"), 30).toDouble(), 0.0, 90.0));
    r.insert(QStringLiteral("azimuth"),
             std::clamp(r.value(QStringLiteral("azimuth"), 0).toDouble(), -180.0, 180.0));
    const double gapLegacy = std::clamp(r.value(QStringLiteral("gap"), 0.02).toDouble(), 0.0, 1.0);
    r.insert(QStringLiteral("gap"), gapLegacy);
    r.insert(QStringLiteral("gapX"),
             std::clamp(r.value(QStringLiteral("gapX"), gapLegacy).toDouble(), 0.0, 1.0));
    r.insert(QStringLiteral("gapZ"),
             std::clamp(r.value(QStringLiteral("gapZ"), gapLegacy).toDouble(), 0.0, 1.0));
    r.insert(QStringLiteral("mountHeight"),
             std::clamp(r.value(QStringLiteral("mountHeight"), 0.08).toDouble(), 0.0, 5.0));
    if (!r.contains(QStringLiteral("positions")))
        r.insert(QStringLiteral("positions"), QVariantList{});
    return r;
}

} // namespace

LayoutRoofs::LayoutRoofs(QObject* parent) : QObject(parent) {}

QVariantMap LayoutRoofs::defaultRoof(const QVariantMap& overrides) const
{
    QVariantMap r{
        {QStringLiteral("id"), overrides.value(QStringLiteral("id"), makeRoofId())},
        {QStringLiteral("name"), overrides.value(QStringLiteral("name"), QStringLiteral("Toiture 1"))},
        {QStringLiteral("roofW"), overrides.value(QStringLiteral("roofW"), 8)},
        {QStringLiteral("roofD"), overrides.value(QStringLiteral("roofD"), 6)},
        {QStringLiteral("panelW"), overrides.value(QStringLiteral("panelW"), 1.13)},
        {QStringLiteral("panelH"), overrides.value(QStringLiteral("panelH"), 1.76)},
        {QStringLiteral("nPanels"), overrides.value(QStringLiteral("nPanels"), 12)},
        {QStringLiteral("rows"), overrides.value(QStringLiteral("rows"), 2)},
        {QStringLiteral("cols"), overrides.value(QStringLiteral("cols"), 4)},
        {QStringLiteral("tilt"), overrides.value(QStringLiteral("tilt"), 30)},
        {QStringLiteral("azimuth"), overrides.value(QStringLiteral("azimuth"), 0)},
        {QStringLiteral("gap"), overrides.value(QStringLiteral("gap"), 0.02)},
        {QStringLiteral("gapX"), overrides.value(QStringLiteral("gapX"),
                                                 overrides.value(QStringLiteral("gap"), 0.02))},
        {QStringLiteral("gapZ"), overrides.value(QStringLiteral("gapZ"),
                                                 overrides.value(QStringLiteral("gap"), 0.02))},
        {QStringLiteral("mountHeight"), overrides.value(QStringLiteral("mountHeight"), 0.08)},
        {QStringLiteral("positions"), overrides.value(QStringLiteral("positions"), QVariantList{})},
    };
    // Apply remaining override keys
    for (auto it = overrides.begin(); it != overrides.end(); ++it)
        r.insert(it.key(), it.value());
    return clampRoof(r);
}

QVariantMap LayoutRoofs::migrate(const QVariantMap& layout) const
{
    if (layout.value(QStringLiteral("roofs")).toList().size() > 0)
        return ensure(layout);

    // Ancien format plat
    QVariantMap overrides{
        {QStringLiteral("name"), QStringLiteral("Toiture 1")},
        {QStringLiteral("roofW"), layout.value(QStringLiteral("roofL"),
                                               layout.value(QStringLiteral("roofW"), 10))},
        {QStringLiteral("roofD"), layout.contains(QStringLiteral("roofL"))
                                      ? layout.value(QStringLiteral("roofW"), 6)
                                      : layout.value(QStringLiteral("roofD"), 6)},
        {QStringLiteral("panelW"), layout.value(QStringLiteral("panelW"), 1.13)},
        {QStringLiteral("panelH"), layout.value(QStringLiteral("panelH"), 1.76)},
        {QStringLiteral("nPanels"), layout.value(QStringLiteral("panelCount"),
                                                 layout.value(QStringLiteral("nPanels"), 0))},
        {QStringLiteral("rows"), layout.value(QStringLiteral("rows"), 2)},
        {QStringLiteral("cols"), layout.value(QStringLiteral("cols"), 4)},
        {QStringLiteral("tilt"), layout.value(QStringLiteral("tilt"), 30)},
        {QStringLiteral("azimuth"), layout.value(QStringLiteral("azimuth"), 0)},
        {QStringLiteral("gap"), layout.value(QStringLiteral("gap"), 0.02)},
        {QStringLiteral("gapX"), layout.value(QStringLiteral("gapX"),
                                              layout.value(QStringLiteral("gap"), 0.02))},
        {QStringLiteral("gapZ"), layout.value(QStringLiteral("gapZ"),
                                              layout.value(QStringLiteral("gap"), 0.02))},
        {QStringLiteral("mountHeight"), layout.value(QStringLiteral("mountHeight"), 0.08)},
        {QStringLiteral("positions"), layout.value(QStringLiteral("positions"), QVariantList{})},
    };
    const QVariantList pos = overrides.value(QStringLiteral("positions")).toList();
    if (overrides.value(QStringLiteral("nPanels")).toInt() <= 0 && !pos.isEmpty())
        overrides.insert(QStringLiteral("nPanels"), pos.size());

    const QVariantMap roof = defaultRoof(overrides);
    return {
        {QStringLiteral("activeId"), roof.value(QStringLiteral("id"))},
        {QStringLiteral("roofs"), QVariantList{roof}},
    };
}

QVariantMap LayoutRoofs::ensure(const QVariantMap& layout) const
{
    QVariantMap st = layout;
    QVariantList roofs = st.value(QStringLiteral("roofs")).toList();
    if (roofs.isEmpty())
        return migrate(layout);

    QVariantList cleaned;
    for (const QVariant& v : roofs)
        cleaned.append(clampRoof(v.toMap()));
    st.insert(QStringLiteral("roofs"), cleaned);

    const QString active = st.value(QStringLiteral("activeId")).toString();
    bool found = false;
    for (const QVariant& v : cleaned) {
        if (v.toMap().value(QStringLiteral("id")).toString() == active) {
            found = true;
            break;
        }
    }
    if (!found)
        st.insert(QStringLiteral("activeId"),
                  cleaned.first().toMap().value(QStringLiteral("id")).toString());
    return st;
}

QVariantMap LayoutRoofs::getActiveRoof(const QVariantMap& layout) const
{
    const QVariantMap st = ensure(layout);
    const QString id = st.value(QStringLiteral("activeId")).toString();
    for (const QVariant& v : st.value(QStringLiteral("roofs")).toList()) {
        const QVariantMap r = v.toMap();
        if (r.value(QStringLiteral("id")).toString() == id)
            return r;
    }
    const QVariantList roofs = st.value(QStringLiteral("roofs")).toList();
    return roofs.isEmpty() ? QVariantMap{} : roofs.first().toMap();
}

QVariantMap LayoutRoofs::setActive(const QVariantMap& layout, const QString& id) const
{
    QVariantMap st = ensure(layout);
    for (const QVariant& v : st.value(QStringLiteral("roofs")).toList()) {
        if (v.toMap().value(QStringLiteral("id")).toString() == id) {
            st.insert(QStringLiteral("activeId"), id);
            return st;
        }
    }
    return st;
}

QVariantMap LayoutRoofs::addRoof(const QVariantMap& layout, const QString& name) const
{
    QVariantMap st = ensure(layout);
    QVariantList roofs = st.value(QStringLiteral("roofs")).toList();
    const QVariantMap base = getActiveRoof(st);
    const int n = roofs.size() + 1;
    const double baseAz = base.value(QStringLiteral("azimuth"), 0).toDouble();
    QVariantMap roof = defaultRoof({
        {QStringLiteral("name"), name.isEmpty() ? QStringLiteral("Toiture %1").arg(n) : name},
        {QStringLiteral("roofW"), base.value(QStringLiteral("roofW"), 8)},
        {QStringLiteral("roofD"), base.value(QStringLiteral("roofD"), 6)},
        {QStringLiteral("panelW"), base.value(QStringLiteral("panelW"), 1.13)},
        {QStringLiteral("panelH"), base.value(QStringLiteral("panelH"), 1.76)},
        {QStringLiteral("nPanels"), 6},
        {QStringLiteral("rows"), base.value(QStringLiteral("rows"), 2)},
        {QStringLiteral("tilt"), base.value(QStringLiteral("tilt"), 30)},
        {QStringLiteral("azimuth"), baseAz == 0 ? 90 : 0},
        {QStringLiteral("gap"), base.value(QStringLiteral("gap"), 0.02)},
        {QStringLiteral("gapX"), base.value(QStringLiteral("gapX"),
                                            base.value(QStringLiteral("gap"), 0.02))},
        {QStringLiteral("gapZ"), base.value(QStringLiteral("gapZ"),
                                            base.value(QStringLiteral("gap"), 0.02))},
        {QStringLiteral("mountHeight"), base.value(QStringLiteral("mountHeight"), 0.08)},
        {QStringLiteral("positions"), QVariantList{}},
    });
    roofs.append(roof);
    st.insert(QStringLiteral("roofs"), roofs);
    st.insert(QStringLiteral("activeId"), roof.value(QStringLiteral("id")));
    return st;
}

QVariantMap LayoutRoofs::removeRoof(const QVariantMap& layout, const QString& id) const
{
    QVariantMap st = ensure(layout);
    QVariantList roofs = st.value(QStringLiteral("roofs")).toList();
    if (roofs.size() <= 1)
        return st;
    QVariantList next;
    for (const QVariant& v : roofs) {
        if (v.toMap().value(QStringLiteral("id")).toString() != id)
            next.append(v);
    }
    if (next.isEmpty())
        return st;
    st.insert(QStringLiteral("roofs"), next);
    if (st.value(QStringLiteral("activeId")).toString() == id)
        st.insert(QStringLiteral("activeId"),
                  next.first().toMap().value(QStringLiteral("id")).toString());
    return st;
}

QVariantMap LayoutRoofs::updateRoof(const QVariantMap& layout, const QString& id,
                                    const QVariantMap& patch) const
{
    QVariantMap st = ensure(layout);
    QVariantList roofs = st.value(QStringLiteral("roofs")).toList();
    for (int i = 0; i < roofs.size(); ++i) {
        QVariantMap r = roofs[i].toMap();
        if (r.value(QStringLiteral("id")).toString() != id)
            continue;
        for (auto it = patch.begin(); it != patch.end(); ++it)
            r.insert(it.key(), it.value());
        roofs[i] = clampRoof(r);
        break;
    }
    st.insert(QStringLiteral("roofs"), roofs);
    return st;
}

QVariantMap LayoutRoofs::distributePanels(const QVariantMap& layout, int totalN) const
{
    QVariantMap st = ensure(layout);
    QVariantList roofs = st.value(QStringLiteral("roofs")).toList();
    const int n = std::max(0, totalN);
    if (roofs.isEmpty())
        return st;

    if (roofs.size() == 1) {
        QVariantMap r = roofs[0].toMap();
        r.insert(QStringLiteral("nPanels"), n);
        roofs[0] = clampRoof(r);
    } else {
        QList<int> current;
        int sum = 0;
        for (const QVariant& v : roofs) {
            const int c = std::max(0, v.toMap().value(QStringLiteral("nPanels")).toInt());
            current.append(c);
            sum += c;
        }
        if (sum > 0 && n > 0) {
            int assigned = 0;
            for (int i = 0; i < roofs.size(); ++i) {
                QVariantMap r = roofs[i].toMap();
                int part;
                if (i == roofs.size() - 1)
                    part = std::max(0, n - assigned);
                else {
                    part = int(std::round(n * current[i] / double(sum)));
                    assigned += part;
                }
                r.insert(QStringLiteral("nPanels"), part);
                roofs[i] = clampRoof(r);
            }
        } else if (n > 0) {
            const int base = n / roofs.size();
            int rem = n - base * roofs.size();
            for (int i = 0; i < roofs.size(); ++i) {
                QVariantMap r = roofs[i].toMap();
                r.insert(QStringLiteral("nPanels"), base + (i < rem ? 1 : 0));
                roofs[i] = clampRoof(r);
            }
        } else {
            for (int i = 0; i < roofs.size(); ++i) {
                QVariantMap r = roofs[i].toMap();
                r.insert(QStringLiteral("nPanels"), 0);
                roofs[i] = clampRoof(r);
            }
        }
    }
    st.insert(QStringLiteral("roofs"), roofs);
    return st;
}

QVariantMap LayoutRoofs::generateGrid(const QVariantMap& layout, int rows, int cols,
                                      const QVariantMap& dims, const QString& roofId) const
{
    QVariantMap st = ensure(layout);
    QVariantList roofs = st.value(QStringLiteral("roofs")).toList();
    if (roofs.isEmpty())
        st = addRoof(st, QStringLiteral("Toiture 1"));
    roofs = st.value(QStringLiteral("roofs")).toList();

    const int rRows = std::max(1, rows);
    const int rCols = std::max(1, cols);
    QString targetId = roofId;
    if (targetId.isEmpty())
        targetId = st.value(QStringLiteral("activeId")).toString();
    if (targetId.isEmpty() && !roofs.isEmpty())
        targetId = roofs.first().toMap().value(QStringLiteral("id")).toString();

    Layout3D lay;
    for (int i = 0; i < roofs.size(); ++i) {
        QVariantMap r = roofs[i].toMap();
        if (r.value(QStringLiteral("id")).toString() != targetId)
            continue;

        for (auto it = dims.begin(); it != dims.end(); ++it) {
            if (it.key() == QLatin1String("positions") || it.key() == QLatin1String("id"))
                continue;
            r.insert(it.key(), it.value());
        }
        r = clampRoof(r);
        r.insert(QStringLiteral("rows"), rRows);
        r.insert(QStringLiteral("cols"), rCols);
        r.insert(QStringLiteral("nPanels"), rRows * rCols);

        const double realTilt = r.value(QStringLiteral("tilt")).toDouble();
        // Emprise = footprint tilté pour que les rangées ne se chevauchent pas
        const QVariantMap computed = lay.computeLayout({
            {QStringLiteral("roofW"), r.value(QStringLiteral("roofW"))},
            {QStringLiteral("roofD"), r.value(QStringLiteral("roofD"))},
            {QStringLiteral("panelW"), r.value(QStringLiteral("panelW"))},
            {QStringLiteral("panelH"), r.value(QStringLiteral("panelH"))},
            {QStringLiteral("gap"), r.value(QStringLiteral("gap"))},
            {QStringLiteral("gapX"), r.value(QStringLiteral("gapX"), r.value(QStringLiteral("gap")))},
            {QStringLiteral("gapZ"), r.value(QStringLiteral("gapZ"), r.value(QStringLiteral("gap")))},
            {QStringLiteral("mountHeight"), r.value(QStringLiteral("mountHeight"), 0.08)},
            {QStringLiteral("tilt"), realTilt},
            {QStringLiteral("azimuth"), 0},
            {QStringLiteral("nPanels"), rRows * rCols},
            {QStringLiteral("rows"), rRows},
            {QStringLiteral("cols"), rCols},
        });

        QVariantList positions;
        const QString rid = r.value(QStringLiteral("id")).toString();
        const QVariantList raw = computed.value(QStringLiteral("positions")).toList();
        for (int j = 0; j < raw.size(); ++j) {
            QVariantMap p = raw[j].toMap();
            p.insert(QStringLiteral("id"), QStringLiteral("%1-g%2").arg(rid).arg(j));
            p.insert(QStringLiteral("yaw"), 0);
            p.insert(QStringLiteral("tilt"), realTilt);
            // y déjà coplanaire (layout_3d) — ne pas aplatir toutes les rangées
            positions.append(p);
        }
        r.insert(QStringLiteral("positions"), positions);
        r.insert(QStringLiteral("nPanels"), positions.size());
        roofs[i] = clampRoof(r);
        break;
    }

    st.insert(QStringLiteral("roofs"), roofs);
    st.insert(QStringLiteral("activeId"), targetId);
    return st;
}

int LayoutRoofs::totalPanels(const QVariantMap& layout) const
{
    int s = 0;
    for (const QVariant& v : ensure(layout).value(QStringLiteral("roofs")).toList()) {
        const QVariantMap r = v.toMap();
        const QVariantList pos = r.value(QStringLiteral("positions")).toList();
        if (!pos.isEmpty())
            s += pos.size();
        else
            s += std::max(0, r.value(QStringLiteral("nPanels")).toInt());
    }
    return s;
}

double LayoutRoofs::totalPanelSurfaceM2(const QVariantMap& layout) const
{
    double s = 0;
    for (const QVariant& v : ensure(layout).value(QStringLiteral("roofs")).toList()) {
        const QVariantMap r = v.toMap();
        const QVariantList pos = r.value(QStringLiteral("positions")).toList();
        const int n = !pos.isEmpty() ? pos.size()
                                     : std::max(0, r.value(QStringLiteral("nPanels")).toInt());
        s += n * r.value(QStringLiteral("panelW")).toDouble()
             * r.value(QStringLiteral("panelH")).toDouble();
    }
    return std::round(s * 100) / 100;
}

double LayoutRoofs::totalRoofSurfaceM2(const QVariantMap& layout) const
{
    double s = 0;
    for (const QVariant& v : ensure(layout).value(QStringLiteral("roofs")).toList()) {
        const QVariantMap r = v.toMap();
        s += r.value(QStringLiteral("roofW")).toDouble() * r.value(QStringLiteral("roofD")).toDouble();
    }
    return std::round(s * 100) / 100;
}

QVariantMap LayoutRoofs::weightedOrientation(const QVariantMap& layout, double panelWp) const
{
    double wSum = 0, tilt = 0, az = 0;
    for (const QVariant& v : ensure(layout).value(QStringLiteral("roofs")).toList()) {
        const QVariantMap r = v.toMap();
        const QVariantList pos = r.value(QStringLiteral("positions")).toList();
        const int n = !pos.isEmpty() ? pos.size()
                                     : std::max(0, r.value(QStringLiteral("nPanels")).toInt());
        if (n <= 0)
            continue;
        const double w = n * (panelWp > 0 ? panelWp : 400);
        wSum += w;
        tilt += r.value(QStringLiteral("tilt"), 30).toDouble() * w;
        az += r.value(QStringLiteral("azimuth"), 0).toDouble() * w;
    }
    if (wSum <= 0)
        return {};
    return {{QStringLiteral("tilt"), std::round(tilt / wSum * 10) / 10},
            {QStringLiteral("azimuth"), std::round(az / wSum)}};
}

QVariantMap LayoutRoofs::buildPanelsForShading(const QVariantMap& layout) const
{
    Layout3D lay;
    QVariantList allRoofs;
    QVariantList allPanels;
    double sceneX = 0;

    for (const QVariant& v : ensure(layout).value(QStringLiteral("roofs")).toList()) {
        const QVariantMap r = v.toMap();
        const QString roofId = r.value(QStringLiteral("id")).toString();
        const double roofW = r.value(QStringLiteral("roofW")).toDouble();
        const double roofD = r.value(QStringLiteral("roofD")).toDouble();
        const double tilt = r.value(QStringLiteral("tilt")).toDouble();
        const double azimuth = r.value(QStringLiteral("azimuth")).toDouble();
        const double panelW = r.value(QStringLiteral("panelW")).toDouble();
        const double panelH = r.value(QStringLiteral("panelH")).toDouble();
        const double tiltRad = tilt * M_PI / 180.0;
        const double footprintH = panelH * std::cos(tiltRad);
        const double rise = panelH * std::sin(tiltRad);

        allRoofs.append(QVariantMap{
            {QStringLiteral("id"), roofId},
            {QStringLiteral("name"), r.value(QStringLiteral("name"))},
            {QStringLiteral("widthM"), roofW},
            {QStringLiteral("depthM"), roofD},
            {QStringLiteral("tilt"), tilt},
            {QStringLiteral("azimuth"), azimuth},
            {QStringLiteral("sceneX"), sceneX},
            {QStringLiteral("sceneY"), 0},
        });

        const QVariantList positions = r.value(QStringLiteral("positions")).toList();
        if (!positions.isEmpty()) {
            // Positions monde centrées → plan local coin (0,0) : x' = x + roofW/2, y' = z + roofD/2
            int idx = 0;
            for (const QVariant& pv : positions) {
                const QVariantMap p = pv.toMap();
                const double wx = p.value(QStringLiteral("x")).toDouble();
                const double wz = p.value(QStringLiteral("z")).toDouble();
                const double pw = p.value(QStringLiteral("w"), panelW).toDouble();
                const double ph = p.value(QStringLiteral("h"), panelH).toDouble();
                const double fp = ph * std::cos((p.value(QStringLiteral("tilt"), tilt).toDouble()) * M_PI / 180.0);
                const double lx = wx + roofW / 2.0 - pw / 2.0;
                const double ly = wz + roofD / 2.0 - fp / 2.0;
                allPanels.append(QVariantMap{
                    {QStringLiteral("id"), p.value(QStringLiteral("id"), QStringLiteral("%1-%2").arg(roofId).arg(idx))},
                    {QStringLiteral("roofId"), roofId},
                    {QStringLiteral("row"), idx / 10},
                    {QStringLiteral("col"), idx % 10},
                    {QStringLiteral("x"), sceneX + lx},
                    {QStringLiteral("y"), ly},
                    {QStringLiteral("w"), pw},
                    {QStringLiteral("d"), fp},
                    {QStringLiteral("h"), ph * std::sin((p.value(QStringLiteral("tilt"), tilt).toDouble()) * M_PI / 180.0)},
                    {QStringLiteral("tilt"), p.value(QStringLiteral("tilt"), tilt)},
                    {QStringLiteral("azimuth"), p.value(QStringLiteral("yaw"), azimuth)},
                });
                ++idx;
            }
        } else {
            const int nPanels = r.value(QStringLiteral("nPanels")).toInt();
            if (nPanels > 0) {
                const QVariantMap computed = lay.computeLayout({
                    {QStringLiteral("roofW"), roofW},
                    {QStringLiteral("roofD"), roofD},
                    {QStringLiteral("panelW"), panelW},
                    {QStringLiteral("panelH"), panelH},
                    {QStringLiteral("nPanels"), nPanels},
                    {QStringLiteral("rows"), r.value(QStringLiteral("rows"), 2)},
                    {QStringLiteral("gap"), r.value(QStringLiteral("gap"), 0.02)},
                    {QStringLiteral("gapX"), r.value(QStringLiteral("gapX"),
                                                    r.value(QStringLiteral("gap"), 0.02))},
                    {QStringLiteral("gapZ"), r.value(QStringLiteral("gapZ"),
                                                    r.value(QStringLiteral("gap"), 0.02))},
                    {QStringLiteral("tilt"), tilt},
                    {QStringLiteral("azimuth"), 0}, // plan local sans yaw monde
                });
                const int cols = computed.value(QStringLiteral("cols")).toInt();
                const int rows = computed.value(QStringLiteral("rows")).toInt();
                const double gapX = computed.value(QStringLiteral("gapX")).toDouble();
                const double gapZ = computed.value(QStringLiteral("gapZ")).toDouble();
                const double arrayW = cols * panelW + (cols - 1) * gapX;
                const double arrayAlong = rows * panelH + (rows - 1) * gapZ;
                const double arrayD = arrayAlong * std::cos(tiltRad);
                const double offX = (roofW - arrayW) / 2.0;
                const double offY = (roofD - arrayD) / 2.0;
                const double stepAlong = panelH + gapZ;
                int placed = 0;
                for (int row = 0; row < rows && placed < nPanels; ++row) {
                    for (int col = 0; col < cols && placed < nPanels; ++col, ++placed) {
                        const double along = row * stepAlong;
                        allPanels.append(QVariantMap{
                            {QStringLiteral("id"), QStringLiteral("%1-%2").arg(roofId).arg(placed)},
                            {QStringLiteral("roofId"), roofId},
                            {QStringLiteral("row"), row},
                            {QStringLiteral("col"), col},
                            {QStringLiteral("x"), sceneX + offX + col * (panelW + gapX)},
                            {QStringLiteral("y"), offY + along * std::cos(tiltRad)},
                            {QStringLiteral("w"), panelW},
                            {QStringLiteral("d"), footprintH},
                            {QStringLiteral("h"), rise},
                            {QStringLiteral("tilt"), tilt},
                            {QStringLiteral("azimuth"), azimuth},
                        });
                    }
                }
            }
        }
        sceneX += roofW + kSceneGap;
    }

    return {{QStringLiteral("roofs"), allRoofs}, {QStringLiteral("panels"), allPanels}};
}

QVariantMap LayoutRoofs::buildWorldShadeMesh(const QVariantMap& layout,
                                             const QVariantList& obstacles) const
{
    QVariantList panelsOut;
    QVariantList obstaclesOut;
    double sceneX = 0;
    QHash<QString, double> roofSceneX;
    QHash<QString, double> roofAzimuth;
    QHash<QString, double> roofW;
    QHash<QString, double> roofD;

    for (const QVariant& v : ensure(layout).value(QStringLiteral("roofs")).toList()) {
        const QVariantMap r = v.toMap();
        const QString roofId = r.value(QStringLiteral("id")).toString();
        const double rw = r.value(QStringLiteral("roofW")).toDouble();
        const double rd = r.value(QStringLiteral("roofD")).toDouble();
        const double roofTilt = r.value(QStringLiteral("tilt"), 30).toDouble();
        const double azPv = r.value(QStringLiteral("azimuth"), 0).toDouble();
        const double panelW = r.value(QStringLiteral("panelW"), 1.13).toDouble();
        const double panelH = r.value(QStringLiteral("panelH"), 1.76).toDouble();
        roofSceneX.insert(roofId, sceneX);
        roofAzimuth.insert(roofId, azPv);
        roofW.insert(roofId, rw);
        roofD.insert(roofId, rd);

        const double yaw = -azPv * M_PI / 180.0; // même signe que SolarScene3D
        const double cosY = std::cos(yaw);
        const double sinY = std::sin(yaw);

        auto toWorld = [&](double lx, double ly, double lz, double& ox, double& oy, double& oz) {
            // Roof local → monde : rotY(yaw) puis +sceneX
            ox = lx * cosY + lz * sinY + sceneX;
            oy = ly;
            oz = -lx * sinY + lz * cosY;
        };

        QVariantList positions = r.value(QStringLiteral("positions")).toList();
        if (positions.isEmpty()) {
            // Synthèse via computeLayout (coords locales, yaw 0) puis apply roof yaw
            Layout3D lay;
            const int nPanels = r.value(QStringLiteral("nPanels")).toInt();
            if (nPanels > 0) {
                const QVariantMap computed = lay.computeLayout({
                    {QStringLiteral("roofW"), rw},
                    {QStringLiteral("roofD"), rd},
                    {QStringLiteral("panelW"), panelW},
                    {QStringLiteral("panelH"), panelH},
                    {QStringLiteral("nPanels"), nPanels},
                    {QStringLiteral("rows"), r.value(QStringLiteral("rows"), 2)},
                    {QStringLiteral("cols"), r.value(QStringLiteral("cols"), 0)},
                    {QStringLiteral("gap"), r.value(QStringLiteral("gap"), 0.02)},
                    {QStringLiteral("gapX"), r.value(QStringLiteral("gapX"),
                                                    r.value(QStringLiteral("gap"), 0.02))},
                    {QStringLiteral("gapZ"), r.value(QStringLiteral("gapZ"),
                                                    r.value(QStringLiteral("gap"), 0.02))},
                    {QStringLiteral("mountHeight"), r.value(QStringLiteral("mountHeight"), 0.08)},
                    {QStringLiteral("tilt"), roofTilt},
                    {QStringLiteral("azimuth"), 0},
                });
                positions = computed.value(QStringLiteral("positions")).toList();
            }
        }

        int idx = 0;
        for (const QVariant& pv : positions) {
            const QVariantMap p = pv.toMap();
            const double pw = p.value(QStringLiteral("w"), panelW).toDouble();
            const double ph = p.value(QStringLiteral("h"), panelH).toDouble();
            const double tilt = p.value(QStringLiteral("tilt"), roofTilt).toDouble();
            const double tiltR = tilt * M_PI / 180.0;
            const double sinT = std::sin(tiltR);
            const double cosT = std::cos(tiltR);
            const double cx = p.value(QStringLiteral("x")).toDouble();
            const double cy = p.value(QStringLiteral("y")).toDouble();
            const double cz = p.value(QStringLiteral("z")).toDouble();

            // Quad local : rotX(-tilt) sur (±w/2, 0, ±h/2) + centre — comme PanelArray3D
            const double hw = pw / 2.0;
            const double hh = ph / 2.0;
            const double localCorners[4][3] = {
                {-hw, hh * sinT, hh * cosT},
                {hw, hh * sinT, hh * cosT},
                {hw, -hh * sinT, -hh * cosT},
                {-hw, -hh * sinT, -hh * cosT},
            };
            QVariantList corners;
            double wx[4], wy[4], wz[4];
            for (int i = 0; i < 4; ++i) {
                const double lx = cx + localCorners[i][0];
                const double ly = cy + localCorners[i][1];
                const double lz = cz + localCorners[i][2];
                toWorld(lx, ly, lz, wx[i], wy[i], wz[i]);
                corners.append(QVariant(QVariantList{wx[i], wy[i], wz[i]}));
            }
            // Normale locale (0, cosT, -sinT) → monde
            double nx = 0, ny = cosT, nz = -sinT;
            const double nxl = nx * cosY + nz * sinY;
            const double nzl = -nx * sinY + nz * cosY;
            nx = nxl;
            nz = nzl;
            const double nlen = std::sqrt(nx * nx + ny * ny + nz * nz);
            if (nlen > 1e-9) {
                nx /= nlen;
                ny /= nlen;
                nz /= nlen;
            }
            double wcx = 0, wcy = 0, wcz = 0;
            toWorld(cx, cy, cz, wcx, wcy, wcz);

            panelsOut.append(QVariantMap{
                {QStringLiteral("id"),
                 p.value(QStringLiteral("id"), QStringLiteral("%1-%2").arg(roofId).arg(idx))},
                {QStringLiteral("roofId"), roofId},
                {QStringLiteral("cx"), wcx},
                {QStringLiteral("cy"), wcy},
                {QStringLiteral("cz"), wcz},
                {QStringLiteral("nx"), nx},
                {QStringLiteral("ny"), ny},
                {QStringLiteral("nz"), nz},
                {QStringLiteral("corners"), corners},
                {QStringLiteral("area"), pw * ph},
                {QStringLiteral("tilt"), tilt},
                {QStringLiteral("w"), pw},
                {QStringLiteral("h"), ph},
            });
            ++idx;
        }
        sceneX += rw + kSceneGap;
    }

    // Obstacles → triangles boîte en monde
    for (int oi = 0; oi < obstacles.size(); ++oi) {
        const QVariantMap o = obstacles[oi].toMap();
        const QString roofId = o.value(QStringLiteral("roofId")).toString();
        double sx = 0;
        double azPv = 0;
        double rw = 8;
        double rd = 6;
        if (!roofId.isEmpty() && roofSceneX.contains(roofId)) {
            sx = roofSceneX.value(roofId);
            azPv = roofAzimuth.value(roofId);
            rw = roofW.value(roofId, 8);
            rd = roofD.value(roofId, 6);
        } else if (!roofSceneX.isEmpty()) {
            // Première toiture par défaut
            sx = roofSceneX.begin().value();
            azPv = roofAzimuth.begin().value();
            rw = roofW.begin().value();
            rd = roofD.begin().value();
        }
        const double yaw = -azPv * M_PI / 180.0;
        const double cosY = std::cos(yaw);
        const double sinY = std::sin(yaw);
        const double ow = std::max(0.1, o.value(QStringLiteral("w"), 0.5).toDouble());
        const double od = std::max(0.1, o.value(QStringLiteral("d"), 0.5).toDouble());
        const double oh = std::max(0.1, o.value(QStringLiteral("h"), 1.0).toDouble());
        // Plan toiture → local centré (comme ObstacleLayer3D)
        const double lx = o.value(QStringLiteral("x")).toDouble() + ow / 2.0 - rw / 2.0;
        const double lz = o.value(QStringLiteral("y")).toDouble() + od / 2.0 - rd / 2.0;

        auto toWorld = [&](double x, double y, double z, double& ox, double& oy, double& oz) {
            ox = x * cosY + z * sinY + sx;
            oy = y;
            oz = -x * sinY + z * cosY;
        };

        // 8 coins boîte locale
        const double xs[2] = {lx - ow / 2.0, lx + ow / 2.0};
        const double zs[2] = {lz - od / 2.0, lz + od / 2.0};
        const double ys[2] = {0.0, oh};
        double c[2][2][2][3];
        for (int ix = 0; ix < 2; ++ix)
            for (int iy = 0; iy < 2; ++iy)
                for (int iz = 0; iz < 2; ++iz)
                    toWorld(xs[ix], ys[iy], zs[iz], c[ix][iy][iz][0], c[ix][iy][iz][1],
                            c[ix][iy][iz][2]);

        auto tri = [](double* a, double* b, double* c3) {
            return QVariant(QVariantList{
                QVariant(QVariantList{a[0], a[1], a[2]}),
                QVariant(QVariantList{b[0], b[1], b[2]}),
                QVariant(QVariantList{c3[0], c3[1], c3[2]}),
            });
        };
        QVariantList tris;
        tris.append(tri(c[0][0][0], c[1][0][0], c[1][1][0]));
        tris.append(tri(c[0][0][0], c[1][1][0], c[0][1][0]));
        tris.append(tri(c[0][0][1], c[0][1][1], c[1][1][1]));
        tris.append(tri(c[0][0][1], c[1][1][1], c[1][0][1]));
        tris.append(tri(c[0][0][0], c[0][1][0], c[0][1][1]));
        tris.append(tri(c[0][0][0], c[0][1][1], c[0][0][1]));
        tris.append(tri(c[1][0][0], c[1][0][1], c[1][1][1]));
        tris.append(tri(c[1][0][0], c[1][1][1], c[1][1][0]));
        tris.append(tri(c[0][0][0], c[0][0][1], c[1][0][1]));
        tris.append(tri(c[0][0][0], c[1][0][1], c[1][0][0]));
        tris.append(tri(c[0][1][0], c[1][1][0], c[1][1][1]));
        tris.append(tri(c[0][1][0], c[1][1][1], c[0][1][1]));

        obstaclesOut.append(QVariantMap{
            {QStringLiteral("id"), o.value(QStringLiteral("id"), QStringLiteral("obs-%1").arg(oi))},
            {QStringLiteral("roofId"), roofId},
            {QStringLiteral("triangles"), tris},
            {QStringLiteral("h"), oh},
        });
    }

    return {{QStringLiteral("panels"), panelsOut},
            {QStringLiteral("obstacles"), obstaclesOut},
            {QStringLiteral("panelCount"), panelsOut.size()},
            {QStringLiteral("obstacleCount"), obstaclesOut.size()}};
}

} // namespace ose

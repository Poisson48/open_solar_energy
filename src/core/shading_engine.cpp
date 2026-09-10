#include "shading_engine.h"

#include "azimuth.h"
#include "layout_roofs.h"
#include "site_shade.h"
#include "solar_math.h"
#include "year_pv.h"

#include <QtConcurrent>
#include <QThreadPool>
#include <QtMath>
#include <QElapsedTimer>
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace ose {
namespace {

constexpr double kDeg = M_PI / 180.0;
constexpr int kSampleOffsets[5] = {-14, -7, 0, 7, 14};

struct Vec3 {
    double x = 0, y = 0, z = 0;
};

struct ShadePanel {
    QString id;
    QString roofId;
    int row = 0;
    int col = 0;
    double x = 0, y = 0, w = 1, d = 1, h = 0.5;
    double tilt = 30, azimuth = 0;
};

struct ShadeObstacle {
    QString type;
    QString roofId;
    double x = 0, y = 0, w = 0.5, d = 0.5, h = 1;
};

struct HorzPt {
    double az = 0, elev = 0;
};

struct WorldPanel {
    QString id;
    QString roofId;
    Vec3 c{};
    Vec3 n{};
    Vec3 corners[4]{};
    double area = 1;
};

struct WorldTri {
    Vec3 a{}, b{}, c{};
};

struct WorldMesh {
    std::vector<WorldPanel> panels;
    std::vector<WorldTri> obstacleTris;
    std::vector<int> obstacleTriOwner; // index obstacle for SVF approx
    std::vector<ShadeObstacle> planObstacles; // for SVF
};

Vec3 vsub(const Vec3& a, const Vec3& b)
{
    return {a.x - b.x, a.y - b.y, a.z - b.z};
}
Vec3 vadd(const Vec3& a, const Vec3& b)
{
    return {a.x + b.x, a.y + b.y, a.z + b.z};
}
Vec3 vscale(const Vec3& a, double s)
{
    return {a.x * s, a.y * s, a.z * s};
}
double vdot(const Vec3& a, const Vec3& b)
{
    return a.x * b.x + a.y * b.y + a.z * b.z;
}
Vec3 vcross(const Vec3& a, const Vec3& b)
{
    return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}

bool rayHitTriangle(const Vec3& orig, const Vec3& dir, const Vec3& v0, const Vec3& v1,
                    const Vec3& v2, double* outT)
{
    constexpr double eps = 1e-7;
    const Vec3 e1 = vsub(v1, v0);
    const Vec3 e2 = vsub(v2, v0);
    const Vec3 pvec = vcross(dir, e2);
    const double det = vdot(e1, pvec);
    if (std::abs(det) < eps)
        return false;
    const double inv = 1.0 / det;
    const Vec3 tvec = vsub(orig, v0);
    const double u = vdot(tvec, pvec) * inv;
    if (u < 0.0 || u > 1.0)
        return false;
    const Vec3 qvec = vcross(tvec, e1);
    const double v = vdot(dir, qvec) * inv;
    if (v < 0.0 || u + v > 1.0)
        return false;
    const double t = vdot(e2, qvec) * inv;
    if (t <= eps)
        return false;
    if (outT)
        *outT = t;
    return true;
}

bool rayHitQuad(const Vec3& orig, const Vec3& dir, const Vec3 c[4], double* outT)
{
    double t = 0;
    if (rayHitTriangle(orig, dir, c[0], c[1], c[2], &t)
        || rayHitTriangle(orig, dir, c[0], c[2], c[3], &t)) {
        if (outT)
            *outT = t;
        return true;
    }
    return false;
}

Vec3 parseVec3List(const QVariantList& L)
{
    if (L.size() >= 3)
        return {L[0].toDouble(), L[1].toDouble(), L[2].toDouble()};
    return {};
}

WorldMesh parseWorldMesh(const QVariantMap& meshVar)
{
    WorldMesh m;
    for (const QVariant& v : meshVar.value(QStringLiteral("panels")).toList()) {
        const QVariantMap p = v.toMap();
        WorldPanel wp;
        wp.id = p.value(QStringLiteral("id")).toString();
        wp.roofId = p.value(QStringLiteral("roofId")).toString();
        wp.c = {p.value(QStringLiteral("cx")).toDouble(), p.value(QStringLiteral("cy")).toDouble(),
                p.value(QStringLiteral("cz")).toDouble()};
        wp.n = {p.value(QStringLiteral("nx")).toDouble(), p.value(QStringLiteral("ny")).toDouble(),
                p.value(QStringLiteral("nz")).toDouble()};
        wp.area = std::max(0.01, p.value(QStringLiteral("area"), 1).toDouble());
        const QVariantList corners = p.value(QStringLiteral("corners")).toList();
        for (int i = 0; i < 4; ++i)
            wp.corners[i] = i < corners.size() ? parseVec3List(corners[i].toList()) : wp.c;
        m.panels.push_back(wp);
    }
    int oi = 0;
    for (const QVariant& v : meshVar.value(QStringLiteral("obstacles")).toList()) {
        const QVariantMap o = v.toMap();
        ShadeObstacle so;
        so.roofId = o.value(QStringLiteral("roofId")).toString();
        so.h = o.value(QStringLiteral("h"), 1).toDouble();
        so.w = 1;
        so.d = 1;
        m.planObstacles.push_back(so);
        for (const QVariant& tv : o.value(QStringLiteral("triangles")).toList()) {
            const QVariantList tri = tv.toList();
            if (tri.size() < 3)
                continue;
            WorldTri t;
            t.a = parseVec3List(tri[0].toList());
            t.b = parseVec3List(tri[1].toList());
            t.c = parseVec3List(tri[2].toList());
            m.obstacleTris.push_back(t);
            m.obstacleTriOwner.push_back(oi);
        }
        ++oi;
    }
    return m;
}

double horizonElevAt(const std::vector<HorzPt>& points, double az)
{
    if (points.empty())
        return 0;
    std::vector<HorzPt> pts = points;
    for (HorzPt& p : pts) {
        p.az = Azimuth::norm360(p.az);
        p.elev = std::clamp(p.elev, 0.0, 90.0);
    }
    std::sort(pts.begin(), pts.end(), [](const HorzPt& a, const HorzPt& b) { return a.az < b.az; });
    if (pts.size() == 1)
        return pts[0].elev;
    const double a = Azimuth::norm360(az);
    std::vector<HorzPt> ext;
    ext.push_back({pts.back().az - 360, pts.back().elev});
    ext.insert(ext.end(), pts.begin(), pts.end());
    ext.push_back({pts.front().az + 360, pts.front().elev});
    for (size_t i = 0; i + 1 < ext.size(); ++i) {
        if (a >= ext[i].az && a <= ext[i + 1].az) {
            const double t = (a - ext[i].az) / std::max(1e-6, ext[i + 1].az - ext[i].az);
            return ext[i].elev + t * (ext[i + 1].elev - ext[i].elev);
        }
    }
    return 0;
}

bool obstacleAppliesTo(const ShadeObstacle& o, const ShadePanel& p)
{
    return o.roofId.isEmpty() || p.roofId.isEmpty() || o.roofId == p.roofId;
}

bool pointInShadow(double px, double py, double ox, double oy, double ow, double od, double oh,
                   double sunElev, double sunAz)
{
    if (sunElev <= 0.5)
        return true;
    const double tanEl = std::tan(sunElev * kDeg);
    const double azRad = sunAz * kDeg;
    const double sx = -std::sin(azRad) / tanEl;
    const double sy = -std::cos(azRad) / tanEl;
    const double corners[4][2] = {
        {ox, oy}, {ox + ow, oy}, {ox + ow, oy + od}, {ox, oy + od},
    };
    for (const auto& c : corners) {
        const double projX = c[0] + oh * sx;
        const double projY = c[1] + oh * sy;
        if (px >= std::min(c[0], projX) && px <= std::max(c[0], projX)
            && py >= std::min(c[1], projY) && py <= std::max(c[1], projY)) {
            const double t = std::abs((px - c[0]) * sy - (py - c[1]) * sx)
                             / std::max(1e-9, std::hypot(sx, sy));
            if (t <= std::max(ow, od) * 0.6)
                return true;
        }
    }
    const double mx = ox + ow / 2;
    const double my = oy + od / 2;
    const double tipX = mx + oh * sx;
    const double tipY = my + oh * sy;
    const double minX = std::min(mx, tipX) - ow / 2;
    const double maxX = std::max(mx, tipX) + ow / 2;
    const double minY = std::min(my, tipY) - od / 2;
    const double maxY = std::max(my, tipY) + od / 2;
    return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

double skyViewFactor(const ShadePanel& panel, const std::vector<ShadeObstacle>& obstacles,
                     const std::vector<HorzPt>& horizon, double sunAz)
{
    double block = horizonElevAt(horizon, sunAz) / 90.0;
    for (const ShadeObstacle& o : obstacles) {
        if (!obstacleAppliesTo(o, panel))
            continue;
        const double dist = std::hypot((panel.x + panel.w / 2) - (o.x + o.w / 2),
                                       (panel.y + panel.d / 2) - (o.y + o.d / 2));
        const double ang = std::atan2(o.h, std::max(0.5, dist)) / (M_PI / 2);
        block = std::max(block, ang * 0.85);
    }
    return std::clamp(1.0 - block * 0.9, 0.15, 1.0);
}

double skyViewFactorWorld(const WorldPanel& panel, const WorldMesh& mesh,
                          const std::vector<HorzPt>& horizon, double sunAz)
{
    double block = horizonElevAt(horizon, sunAz) / 90.0;
    for (const ShadeObstacle& o : mesh.planObstacles) {
        if (!o.roofId.isEmpty() && !panel.roofId.isEmpty() && o.roofId != panel.roofId)
            continue;
        const double ang = std::atan2(o.h, 8.0) / (M_PI / 2);
        block = std::max(block, ang * 0.5);
    }
    return std::clamp(1.0 - block * 0.9, 0.15, 1.0);
}

bool pointOccluded(const Vec3& point, const Vec3& sunDir, const WorldMesh& mesh,
                   const QString& selfId, double maxT = 1e6)
{
    // Rayon vers le soleil depuis le point (légèrement décalé le long de la normale)
    const Vec3 orig = point;
    for (size_t i = 0; i < mesh.panels.size(); ++i) {
        const WorldPanel& p = mesh.panels[i];
        if (p.id == selfId)
            continue;
        double t = 0;
        if (rayHitQuad(orig, sunDir, p.corners, &t) && t > 0.05 && t < maxT)
            return true;
    }
    for (const WorldTri& tri : mesh.obstacleTris) {
        double t = 0;
        if (rayHitTriangle(orig, sunDir, tri.a, tri.b, tri.c, &t) && t > 0.05 && t < maxT)
            return true;
    }
    return false;
}

double panelKeepPrecise(const WorldPanel& panel, const WorldMesh& mesh,
                        const std::vector<HorzPt>& horizon, double sunAz, double sunElev,
                        const Vec3& sunDir, double beamShare, int sampleMode)
{
    if (sunElev <= 0)
        return 0.15 * (1.0 - beamShare);

    if (sunElev < horizonElevAt(horizon, sunAz)) {
        const double svf = skyViewFactorWorld(panel, mesh, horizon, sunAz);
        return std::clamp(0.0 * beamShare + (0.25 + 0.75 * svf) * (1.0 - beamShare), 0.0, 1.0);
    }

    // Dos au soleil → pas de direct
    const double ndot = vdot(panel.n, sunDir);
    if (ndot <= 0.05) {
        const double svf = skyViewFactorWorld(panel, mesh, horizon, sunAz);
        return std::clamp((0.25 + 0.75 * svf) * (1.0 - beamShare), 0.0, 1.0);
    }

    // Points d’échantillon sur le panneau
    std::vector<Vec3> samples;
    const Vec3 lift = vscale(panel.n, 0.04);
    if (sampleMode <= 1) {
        samples.push_back(vadd(panel.c, lift));
    } else {
        samples.push_back(vadd(panel.c, lift));
        for (int i = 0; i < 4; ++i) {
            const Vec3 mid = vscale(vadd(panel.corners[i], panel.c), 0.5);
            samples.push_back(vadd(mid, lift));
        }
    }

    int lit = 0;
    for (const Vec3& s : samples) {
        if (!pointOccluded(s, sunDir, mesh, panel.id))
            ++lit;
    }
    const double keepDirect = samples.empty() ? 0.0 : lit / double(samples.size());
    const double svf = skyViewFactorWorld(panel, mesh, horizon, sunAz);
    const double keepDiffuse = 0.25 + 0.75 * svf;
    return std::clamp(keepDirect * beamShare + keepDiffuse * (1.0 - beamShare), 0.0, 1.0);
}

double panelKeepAt(const ShadePanel& panel, double sunAz, double sunElev,
                   const std::vector<ShadeObstacle>& obstacles,
                   const std::vector<ShadePanel>& allPanels,
                   const std::vector<HorzPt>& horizon, double beamShare)
{
    if (sunElev <= 0)
        return 0.15 * (1.0 - beamShare);

    const double cx = panel.x + panel.w / 2;
    const double cy = panel.y + panel.d / 2;
    bool directBlocked = sunElev < horizonElevAt(horizon, sunAz);

    if (!directBlocked) {
        for (const ShadeObstacle& o : obstacles) {
            if (!obstacleAppliesTo(o, panel))
                continue;
            if (pointInShadow(cx, cy, o.x, o.y, o.w, o.d, o.h, sunElev, sunAz)) {
                directBlocked = true;
                break;
            }
        }
    }
    if (!directBlocked) {
        for (const ShadePanel& p : allPanels) {
            if (p.id == panel.id)
                continue;
            if (!panel.roofId.isEmpty() && !p.roofId.isEmpty() && p.roofId != panel.roofId)
                continue;
            if (p.row >= panel.row && p.y >= panel.y - 0.01)
                continue;
            if (pointInShadow(cx, cy, p.x, p.y, p.w, p.d, p.h, sunElev, sunAz)) {
                directBlocked = true;
                break;
            }
        }
    }

    const double svf = skyViewFactor(panel, obstacles, horizon, sunAz);
    const double keepDirect = directBlocked ? 0.0 : 1.0;
    const double keepDiffuse = 0.25 + 0.75 * svf;
    return std::clamp(keepDirect * beamShare + keepDiffuse * (1.0 - beamShare), 0.0, 1.0);
}

std::vector<ShadePanel> parsePanels(const QVariantList& list)
{
    std::vector<ShadePanel> out;
    out.reserve(list.size());
    for (const QVariant& v : list) {
        const QVariantMap m = v.toMap();
        ShadePanel p;
        p.id = m.value(QStringLiteral("id")).toString();
        p.roofId = m.value(QStringLiteral("roofId")).toString();
        p.row = m.value(QStringLiteral("row")).toInt();
        p.col = m.value(QStringLiteral("col")).toInt();
        p.x = m.value(QStringLiteral("x")).toDouble();
        p.y = m.value(QStringLiteral("y")).toDouble();
        p.w = m.value(QStringLiteral("w"), 1).toDouble();
        p.d = m.value(QStringLiteral("d"), 1).toDouble();
        p.h = m.value(QStringLiteral("h"), 0.5).toDouble();
        p.tilt = m.value(QStringLiteral("tilt"), 30).toDouble();
        p.azimuth = m.value(QStringLiteral("azimuth"), 0).toDouble();
        out.push_back(p);
    }
    return out;
}

std::vector<ShadeObstacle> parseObstacles(const QVariantList& list)
{
    std::vector<ShadeObstacle> out;
    for (const QVariant& v : list) {
        const QVariantMap m = v.toMap();
        ShadeObstacle o;
        o.type = m.value(QStringLiteral("type"), QStringLiteral("box")).toString();
        o.roofId = m.value(QStringLiteral("roofId")).toString();
        o.x = m.value(QStringLiteral("x")).toDouble();
        o.y = m.value(QStringLiteral("y")).toDouble();
        o.w = std::max(0.1, m.value(QStringLiteral("w"), 0.5).toDouble());
        o.d = std::max(0.1, m.value(QStringLiteral("d"), 0.5).toDouble());
        o.h = std::max(0.1, m.value(QStringLiteral("h"), 1).toDouble());
        out.push_back(o);
    }
    return out;
}

std::vector<HorzPt> parseHorizon(const QVariantList& list)
{
    std::vector<HorzPt> out;
    for (const QVariant& v : list) {
        const QVariantMap m = v.toMap();
        out.push_back({m.value(QStringLiteral("az")).toDouble(),
                       m.value(QStringLiteral("elev")).toDouble()});
    }
    return out;
}

QVariantMap samplePreciseImpl(const WorldMesh& mesh, const std::vector<HorzPt>& horz,
                              double sunAzNorth, double sunElev, double beamShare, int sampleMode)
{
    const int total = int(mesh.panels.size());
    if (sunElev <= 0 || total == 0) {
        return {{QStringLiteral("keep"), 0.0},
                {QStringLiteral("litPanels"), 0},
                {QStringLiteral("totalPanels"), total},
                {QStringLiteral("shadedFraction"), total > 0 ? 100.0 : 0.0},
                {QStringLiteral("mode"), QStringLiteral("precise")}};
    }
    Vec3 sunDir{};
    Azimuth::sunDirectionFromNorth(sunAzNorth, sunElev, &sunDir.x, &sunDir.y, &sunDir.z);

    int lit = 0;
    double sumK = 0;
    double sumA = 0;
    for (const WorldPanel& p : mesh.panels) {
        const double k =
            panelKeepPrecise(p, mesh, horz, sunAzNorth, sunElev, sunDir, beamShare, sampleMode);
        sumK += k * p.area;
        sumA += p.area;
        if (k > 0.5)
            ++lit;
    }
    const double keep = sumA > 0 ? sumK / sumA : 0;
    return {{QStringLiteral("keep"), std::round(keep * 1000) / 1000},
            {QStringLiteral("litPanels"), lit},
            {QStringLiteral("totalPanels"), total},
            {QStringLiteral("shadedFraction"), std::round((1.0 - keep) * 1000) / 10},
            {QStringLiteral("mode"), QStringLiteral("precise")}};
}

} // namespace

ShadingEngine::ShadingEngine(QObject* parent) : QObject(parent) {}

QVariantMap ShadingEngine::sampleAt(const QVariantList& panels, const QVariantList& obstacles,
                                    const QVariantList& horizonPoints, double sunAzNorth,
                                    double sunElev, double beamShare) const
{
    const auto pans = parsePanels(panels);
    const auto obs = parseObstacles(obstacles);
    const auto horz = parseHorizon(horizonPoints);
    const int total = int(pans.size());
    if (sunElev <= 0 || total == 0) {
        return {{QStringLiteral("keep"), 0.0},
                {QStringLiteral("litPanels"), 0},
                {QStringLiteral("totalPanels"), total},
                {QStringLiteral("shadedFraction"), total > 0 ? 100.0 : 0.0},
                {QStringLiteral("mode"), QStringLiteral("fast")}};
    }
    int lit = 0;
    double sumK = 0;
    for (const ShadePanel& p : pans) {
        const double k = panelKeepAt(p, sunAzNorth, sunElev, obs, pans, horz, beamShare);
        sumK += k;
        if (k > 0.5)
            ++lit;
    }
    const double keep = sumK / total;
    return {{QStringLiteral("keep"), std::round(keep * 1000) / 1000},
            {QStringLiteral("litPanels"), lit},
            {QStringLiteral("totalPanels"), total},
            {QStringLiteral("shadedFraction"), std::round((1.0 - keep) * 1000) / 10},
            {QStringLiteral("mode"), QStringLiteral("fast")}};
}

QVariantMap ShadingEngine::samplePrecise(const QVariantMap& layout, const QVariantList& obstacles,
                                         const QVariantList& horizonPoints, double sunAzNorth,
                                         double sunElev, double beamShare) const
{
    LayoutRoofs lr;
    const QVariantMap meshVar = lr.buildWorldShadeMesh(layout, obstacles);
    const WorldMesh mesh = parseWorldMesh(meshVar);
    return samplePreciseImpl(mesh, parseHorizon(horizonPoints), sunAzNorth, sunElev, beamShare, 5);
}

QVariantMap ShadingEngine::computeFull(const QVariantMap& options) const
{
    return computeFullImpl(options, {});
}

QVariantMap ShadingEngine::estimateCompute(const QVariantMap& options) const
{
    LayoutRoofs lr;
    QVariantMap layout = options.value(QStringLiteral("layout")).toMap();
    const QVariantList obstaclesVar = options.value(QStringLiteral("obstacles")).toList();
    const QString engine = options.value(QStringLiteral("shadeEngine"), QStringLiteral("precise"))
                               .toString();
    const bool precise = engine != QLatin1String("fast");

    int panels = 0;
    int obstTris = 0;
    if (precise && !layout.isEmpty()) {
        const QVariantMap mesh = lr.buildWorldShadeMesh(layout, obstaclesVar);
        panels = mesh.value(QStringLiteral("panelCount")).toInt();
        for (const QVariant& v : mesh.value(QStringLiteral("obstacles")).toList())
            obstTris += v.toMap().value(QStringLiteral("triangles")).toList().size();
    } else {
        if (layout.isEmpty() && options.contains(QStringLiteral("layout")))
            layout = options.value(QStringLiteral("layout")).toMap();
        const QVariantMap built = lr.buildPanelsForShading(layout);
        panels = built.value(QStringLiteral("panels")).toList().size();
        obstTris = obstaclesVar.size() * 2;
    }

    // 12 mois × 5 jours × (1440/step) créneaux
    const int stepMin = precise ? 30 : 5;
    const int slotsPerDay = 1440 / stepMin;
    const int steps = 12 * 5 * slotsPerDay;
    // Coût empirique : ~0.8 µs × panneaux × (panneaux + tris/4) par créneau (ordre N² raycast)
    const double occluders = std::max(1.0, panels + obstTris / 4.0);
    const double work = double(steps) * std::max(1, panels) * occluders;
    const double etaSec = std::clamp(work * 8e-7, 0.05, 600.0);

    QString detail = QStringLiteral("%1 panneaux · %2 obstacles · %3 pas soleil")
                         .arg(panels)
                         .arg(obstaclesVar.size())
                         .arg(steps);
    return {{QStringLiteral("etaSec"), std::round(etaSec * 10) / 10},
            {QStringLiteral("steps"), steps},
            {QStringLiteral("panels"), panels},
            {QStringLiteral("obstacles"), obstaclesVar.size()},
            {QStringLiteral("detail"), detail}};
}

bool ShadingEngine::startComputeFull(const QVariantMap& options)
{
    if (m_computing)
        return false;
    m_computing = true;
    m_computePercent = 0;
    m_computeEtaSec = estimateCompute(options).value(QStringLiteral("etaSec")).toDouble();
    m_computeStatus = QStringLiteral("Démarrage…");
    emit computingChanged();
    emit computeProgressChanged();
    emit computeProgress(0, m_computeEtaSec, m_computeStatus);

    QtConcurrent::run(QThreadPool::globalInstance(), [this, options]() {
        QVariantMap result;
        try {
            result = computeFullImpl(options, [this](int pct, double eta, const QString& msg) {
                QMetaObject::invokeMethod(
                    this,
                    [this, pct, eta, msg]() {
                        m_computePercent = pct;
                        m_computeEtaSec = eta;
                        m_computeStatus = msg;
                        emit computeProgressChanged();
                        emit computeProgress(pct, eta, msg);
                    },
                    Qt::QueuedConnection);
            });
        } catch (const std::exception& e) {
            const QString err = QString::fromUtf8(e.what());
            QMetaObject::invokeMethod(
                this,
                [this, err]() {
                    m_computing = false;
                    m_computeStatus = err;
                    emit computingChanged();
                    emit computeProgressChanged();
                    emit computeFailed(err);
                },
                Qt::QueuedConnection);
            return;
        }
        QMetaObject::invokeMethod(
            this,
            [this, result]() {
                m_computing = false;
                m_computePercent = 100;
                m_computeEtaSec = 0;
                m_computeStatus = QStringLiteral("Terminé");
                emit computingChanged();
                emit computeProgressChanged();
                emit computeProgress(100, 0, m_computeStatus);
                emit computeFinished(result);
            },
            Qt::QueuedConnection);
    });
    return true;
}

QVariantMap ShadingEngine::computeFullImpl(
    const QVariantMap& options,
    const std::function<void(int, double, const QString&)>& onProgress) const
{
    const double lat = options.value(QStringLiteral("lat"), 46).toDouble();
    const QVariantList weather = options.value(QStringLiteral("weatherData")).toList();
    const QVariantList horizonPoints = options.value(QStringLiteral("horizonPoints")).toList();
    const QString engine = options.value(QStringLiteral("shadeEngine"), QStringLiteral("precise"))
                               .toString();
    const bool precise = engine != QLatin1String("fast");

    QVariantList panelsVar = options.value(QStringLiteral("panels")).toList();
    QVariantList roofsVar = options.value(QStringLiteral("roofs")).toList();
    QVariantList obstaclesVar = options.value(QStringLiteral("obstacles")).toList();
    QVariantMap layout = options.value(QStringLiteral("layout")).toMap();

    LayoutRoofs lr;
    WorldMesh worldMesh;
    if (precise) {
        if (layout.isEmpty() && !panelsVar.isEmpty()) {
            // Pas de layout : bascule fast
        } else {
            if (layout.isEmpty())
                layout = options.value(QStringLiteral("layout")).toMap();
            const QVariantMap meshVar = lr.buildWorldShadeMesh(layout, obstaclesVar);
            worldMesh = parseWorldMesh(meshVar);
            panelsVar = meshVar.value(QStringLiteral("panels")).toList();
        }
    }

    if (!precise || worldMesh.panels.empty()) {
        if (panelsVar.isEmpty() && options.contains(QStringLiteral("layout"))) {
            const QVariantMap built =
                lr.buildPanelsForShading(options.value(QStringLiteral("layout")).toMap());
            panelsVar = built.value(QStringLiteral("panels")).toList();
            roofsVar = built.value(QStringLiteral("roofs")).toList();
        }
    }

    const auto panels =
        parsePanels(precise && !worldMesh.panels.empty() ? QVariantList{} : panelsVar);
    const auto obstacles = parseObstacles(obstaclesVar);
    const auto horizon = parseHorizon(horizonPoints);
    const bool usePrecise = precise && !worldMesh.panels.empty();

    SiteShade shade;
    QVariantList monthlyLoss;
    QVariantList halfHourlyKeep;
    double sumBeam = 0;
    double sumLost = 0;

    const int stepMin = usePrecise ? 30 : 5;
    QElapsedTimer wall;
    wall.start();

    static const char* monthNames[12] = {"Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
                                         "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"};

    for (int m = 1; m <= 12; ++m) {
        double ghi = 100, dhi = 40;
        if (m - 1 < weather.size()) {
            const QVariantMap w = weather[m - 1].toMap();
            ghi = w.value(QStringLiteral("GHI"), 100).toDouble();
            dhi = w.value(QStringLiteral("DHI"), 40).toDouble();
        }
        const double beamShare = std::clamp((ghi - dhi) / std::max(1.0, ghi), 0.15, 0.85);
        const int md = SolarMath::midMonthDay(m);

        std::array<double, 48> avgSlot{};
        int sampleCount = 0;

        for (int offset : kSampleOffsets) {
            const int dayOfYear = std::clamp(md + offset, 1, 365);
            std::array<double, 48> slotBeam{};
            std::array<double, 48> slotKeep{};

            for (int mi = 0; mi < 24 * 60; mi += stepMin) {
                const double h = mi / 60.0;
                const QVariantMap sun = shade.sunPos(lat, dayOfYear, h);
                const double elev = sun.value(QStringLiteral("elev")).toDouble();
                const double az = sun.value(QStringLiteral("az")).toDouble();
                const int s = std::min(47, mi / 30);
                if (elev <= 0)
                    continue;
                const double w = std::sin(elev * kDeg);

                double avgK = 1.0;
                if (usePrecise) {
                    Vec3 sunDir{};
                    Azimuth::sunDirectionFromNorth(az, elev, &sunDir.x, &sunDir.y, &sunDir.z);
                    double sumK = 0, sumA = 0;
                    for (const WorldPanel& panel : worldMesh.panels) {
                        const double keep = panelKeepPrecise(panel, worldMesh, horizon, az, elev,
                                                             sunDir, beamShare, 1);
                        sumK += keep * panel.area;
                        sumA += panel.area;
                    }
                    avgK = sumA > 0 ? sumK / sumA : 1.0;
                } else if (panels.empty()) {
                    const bool directOk = elev >= horizonElevAt(horizon, az);
                    double keep = directOk ? 1.0 : 0.25;
                    if (directOk) {
                        for (const ShadeObstacle& o : obstacles) {
                            if (pointInShadow(0, 0, o.x, o.y, o.w, o.d, o.h, elev, az)) {
                                keep = 0.25;
                                break;
                            }
                        }
                    } else {
                        keep = 0.25 + 0.75 * 0.5;
                    }
                    keep = keep * beamShare + (0.25 + 0.75 * 0.7) * (1.0 - beamShare);
                    avgK = keep;
                } else {
                    double sumK = 0, sumA = 0;
                    for (const ShadePanel& panel : panels) {
                        const double keep =
                            panelKeepAt(panel, az, elev, obstacles, panels, horizon, beamShare);
                        const double area = panel.w * panel.d;
                        sumK += keep * area;
                        sumA += area;
                    }
                    avgK = sumA > 0 ? sumK / sumA : 1.0;
                }
                slotBeam[static_cast<size_t>(s)] += w;
                slotKeep[static_cast<size_t>(s)] += w * avgK;
            }

            for (int s = 0; s < 48; ++s) {
                const double b = slotBeam[static_cast<size_t>(s)];
                avgSlot[static_cast<size_t>(s)] += b > 0 ? slotKeep[static_cast<size_t>(s)] / b : 1.0;
            }
            ++sampleCount;
        }

        QVariantList keepRow;
        double sumKeep = 0;
        for (int s = 0; s < 48; ++s) {
            const double k = sampleCount > 0 ? avgSlot[static_cast<size_t>(s)] / sampleCount : 1.0;
            keepRow.append(k);
            sumKeep += k;
        }
        halfHourlyKeep.append(QVariant(keepRow));
        const double meanKeep = sumKeep / 48.0;
        const double frac = std::clamp(1.0 - meanKeep, 0.0, 1.0);
        monthlyLoss.append(std::round(frac * 1000) / 1000);

        sumBeam += ghi * beamShare;
        sumLost += ghi * beamShare * frac;

        if (onProgress) {
            const int pct = int(std::round(m * 100.0 / 12.0));
            const double elapsed = wall.elapsed() / 1000.0;
            const double eta = m > 0 ? elapsed * (12.0 - m) / double(m) : 0;
            onProgress(pct, eta,
                       QStringLiteral("Mois %1/12 (%2)…").arg(m).arg(QLatin1String(monthNames[m - 1])));
        }
    }

    const double annual = sumBeam > 0 ? std::round((sumLost / sumBeam) * 1000) / 10 : 0;

    const QVariantList halfHourlyKeepElectrical =
        YearPv::electricalKeepTable(halfHourlyKeep, 3, 1.0);

    QString mode = QStringLiteral("horizon");
    if (usePrecise)
        mode = QStringLiteral("3d_raycast");
    else if (!panels.empty())
        mode = QStringLiteral("3d_panels");
    else if (!obstacles.empty())
        mode = QStringLiteral("3d_obstacles");

    return {{QStringLiteral("monthlyLoss"), monthlyLoss},
            {QStringLiteral("halfHourlyKeep"), halfHourlyKeep},
            {QStringLiteral("halfHourlyKeepElectrical"), halfHourlyKeepElectrical},
            {QStringLiteral("annualLossPct"), annual},
            {QStringLiteral("roofs"), roofsVar},
            {QStringLiteral("panels"), panelsVar},
            {QStringLiteral("obstacles"), obstaclesVar},
            {QStringLiteral("mode"), mode},
            {QStringLiteral("shadeEngine"), usePrecise ? QStringLiteral("precise")
                                                       : QStringLiteral("fast")},
            {QStringLiteral("panelsPlaced"),
             usePrecise ? int(worldMesh.panels.size()) : int(panels.size())},
            {QStringLiteral("elapsedMs"), int(wall.elapsed())}};
}

} // namespace ose

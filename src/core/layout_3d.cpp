#include "layout_3d.h"

#include "azimuth.h"
#include "site_shade.h"

#include <QtMath>
#include <algorithm>
#include <cmath>

namespace ose {

Layout3D::Layout3D(QObject* parent) : QObject(parent) {}

QVariantMap Layout3D::computeLayout(const QVariantMap& cfg) const
{
    const double roofW = std::clamp(cfg.value(QStringLiteral("roofW"), 10).toDouble(), 1.0, 200.0);
    const double roofD = std::clamp(cfg.value(QStringLiteral("roofD"), 6).toDouble(), 1.0, 200.0);
    const double panelW = std::clamp(cfg.value(QStringLiteral("panelW"), 1.134).toDouble(), 0.2, 3.0);
    const double panelH = std::clamp(cfg.value(QStringLiteral("panelH"), 1.722).toDouble(), 0.2, 3.0);
    // gap legacy → les deux axes ; gapX (colonnes) / gapZ (rangées le long du plan)
    const double gapLegacy = std::clamp(cfg.value(QStringLiteral("gap"), 0.02).toDouble(), 0.0, 1.0);
    const double gapX = std::clamp(cfg.value(QStringLiteral("gapX"), gapLegacy).toDouble(), 0.0, 1.0);
    const double gapZ = std::clamp(cfg.value(QStringLiteral("gapZ"), gapLegacy).toDouble(), 0.0, 1.0);
    const double mountHeight =
        std::clamp(cfg.value(QStringLiteral("mountHeight"), 0.08).toDouble(), 0.0, 5.0);
    const double tilt = std::clamp(cfg.value(QStringLiteral("tilt"), 30).toDouble(), 0.0, 90.0);
    const double azimuth = std::clamp(cfg.value(QStringLiteral("azimuth"), 0).toDouble(), -180.0, 180.0);
    int nPanels = std::max(0, cfg.value(QStringLiteral("nPanels"), 0).toInt());
    int rows = std::max(1, cfg.value(QStringLiteral("rows"), 0).toInt());
    int cols = cfg.value(QStringLiteral("cols"), 0).toInt();

    if (nPanels <= 0 && cols > 0)
        nPanels = cols * rows;
    if (cols <= 0 && nPanels > 0)
        cols = int(std::ceil(nPanels / double(rows)));
    if (cols <= 0)
        cols = 1;

    const double tiltRad = tilt * M_PI / 180.0;
    const double cosT = std::cos(tiltRad);
    const double sinT = std::sin(tiltRad);
    // Emprise horizontale (plan + épaisseur ~7 cm à fort tilt / 90°)
    constexpr double kPanelThick = 0.07;
    const double footprintH = panelH * cosT + kPanelThick * sinT;
    const double riseZ = panelH * sinT;
    // Pas le long du plan des modules (rangées collées), puis projeté en XZ via sin/cos (pas tan → OK à 90°)
    const double stepAlong = panelH + gapZ;
    const double arrayAlong = rows > 0 ? rows * panelH + (rows - 1) * gapZ : 0;
    const double arrayW = cols > 0 ? cols * panelW + (cols - 1) * gapX : 0;
    const double arrayD = arrayAlong * cosT + kPanelThick * sinT;
    const bool fitsW = arrayW <= roofW + 1e-6;
    const bool fitsD = arrayD <= roofD + 1e-6;
    const int placed = std::min(nPanels, rows * cols);
    const double panelArea = panelW * panelH;
    const double surfaceUsed = std::round(placed * panelArea * 100) / 100;
    const double surfaceRoof = std::round(roofW * roofD * 100) / 100;

    // Positions monde Quick3D : Y up, toiture centrée sur origine, X=largeur, Z=profondeur
    // Azimut PV 0° = Sud → -Z monde
    // Rangées coplanaires : (z,y) = along·(cos,sin) — à 90° tout le pas est en Y, z≈0.
    const double yawRad = azimuth * M_PI / 180.0;
    const double cosY = std::cos(yawRad);
    const double sinY = std::sin(yawRad);
    const double clear = mountHeight + (arrayAlong / 2.0) * sinT;

    QVariantList positions;
    int n = 0;
    const double originX = -arrayW / 2.0;
    const double originAlong = -arrayAlong / 2.0;
    for (int r = 0; r < rows; ++r) {
        for (int c = 0; c < cols; ++c) {
            if (n >= placed)
                break;
            const double lx = originX + c * (panelW + gapX) + panelW / 2.0;
            const double along = originAlong + r * stepAlong + panelH / 2.0;
            const double lz = along * cosT;
            const double wy = along * sinT + clear;
            // Rotation yaw autour de Y
            const double wx = lx * cosY - lz * sinY;
            const double wz = lx * sinY + lz * cosY;
            positions.append(QVariantMap{
                {QStringLiteral("x"), wx},
                {QStringLiteral("y"), wy},
                {QStringLiteral("z"), wz},
                {QStringLiteral("along"), along},
                {QStringLiteral("tilt"), tilt},
                {QStringLiteral("yaw"), azimuth},
                {QStringLiteral("w"), panelW},
                {QStringLiteral("h"), panelH},
                {QStringLiteral("index"), n},
            });
            ++n;
        }
    }

    return {
        {QStringLiteral("roofW"), roofW},
        {QStringLiteral("roofD"), roofD},
        {QStringLiteral("panelW"), panelW},
        {QStringLiteral("panelH"), panelH},
        {QStringLiteral("nPanels"), nPanels},
        {QStringLiteral("rows"), rows},
        {QStringLiteral("cols"), cols},
        {QStringLiteral("gap"), gapLegacy},
        {QStringLiteral("gapX"), gapX},
        {QStringLiteral("gapZ"), gapZ},
        {QStringLiteral("mountHeight"), mountHeight},
        {QStringLiteral("tilt"), tilt},
        {QStringLiteral("azimuth"), azimuth},
        {QStringLiteral("footprintH"), footprintH},
        {QStringLiteral("riseZ"), riseZ},
        {QStringLiteral("arrayW"), arrayW},
        {QStringLiteral("arrayD"), arrayD},
        {QStringLiteral("arrayAlong"), arrayAlong},
        {QStringLiteral("fits"), fitsW && fitsD},
        {QStringLiteral("fitsW"), fitsW},
        {QStringLiteral("fitsD"), fitsD},
        {QStringLiteral("panelsPlaced"), placed},
        {QStringLiteral("surfaceUsed"), surfaceUsed},
        {QStringLiteral("surfaceRoof"), surfaceRoof},
        {QStringLiteral("coveragePct"),
         surfaceRoof > 0 ? std::round(surfaceUsed / surfaceRoof * 1000) / 10 : 0},
        {QStringLiteral("positions"), positions},
    };
}

QVariantMap Layout3D::sunDirection(double azimutNorthDeg, double elevDeg) const
{
    double x = 0, y = 0, z = 0;
    Azimuth::sunDirectionFromNorth(azimutNorthDeg, elevDeg, &x, &y, &z);
    return {{QStringLiteral("x"), x}, {QStringLiteral("y"), y}, {QStringLiteral("z"), z},
            {QStringLiteral("elev"), elevDeg}, {QStringLiteral("az"), azimutNorthDeg}};
}

QVariantMap Layout3D::sunLightEuler(double azimutNorthDeg, double elevDeg) const
{
    double pitch = 0, yaw = 0, roll = 0;
    Azimuth::sunLightEulerFromNorth(azimutNorthDeg, elevDeg, &pitch, &yaw, &roll);
    return {{QStringLiteral("x"), pitch}, {QStringLiteral("y"), yaw}, {QStringLiteral("z"), roll}};
}

double Layout3D::northToPv(double azNorth) const
{
    return Azimuth::northToPv(azNorth);
}

double Layout3D::pvToNorth(double azPv) const
{
    return Azimuth::pvToNorth(azPv);
}

static bool rayHitsObstacle(double px, double py, double pz, double dx, double dy, double dz,
                            const QVariantList& obstacles, double roofScale)
{
    if (dy <= 0.02) // soleil bas / sous horizon
        return true;
    // Obstacles : murs à distance autour de la toiture, hauteur = tan(elev)*dist
    for (const QVariant& v : obstacles) {
        const QVariantMap o = v.toMap();
        const double oAz = o.value(QStringLiteral("az")).toDouble() * M_PI / 180.0;
        const double oEl = o.value(QStringLiteral("elev")).toDouble() * M_PI / 180.0;
        if (oEl <= 0)
            continue;
        const double dist = o.value(QStringLiteral("dist"), roofScale * 1.2).toDouble();
        // Obstacles horizon : azimut 0°=Nord → Nord = +Z
        const double ox = std::sin(oAz) * dist;
        const double oz = std::cos(oAz) * dist;
        const double oh = std::tan(oEl) * dist;
        // Segment obstacle comme slab vertical (boîte mince)
        const double halfW = o.value(QStringLiteral("width"), 2.0).toDouble() / 2.0;
        // Paramètre t pour atteindre le plan de l'obstacle (projection horizontale)
        const double toObsX = ox - px;
        const double toObsZ = oz - pz;
        const double horiz = dx * toObsX + dz * toObsZ;
        const double den = dx * dx + dz * dz;
        if (den < 1e-9)
            continue;
        // Approche : le rayon intersecte le cylindre/angle autour de (ox,oz)
        const double t = (toObsX * dx + toObsZ * dz) / den;
        if (t <= 0 || t > 200)
            continue;
        const double ix = px + dx * t;
        const double iy = py + dy * t;
        const double iz = pz + dz * t;
        const double dHoriz = std::hypot(ix - ox, iz - oz);
        if (dHoriz <= halfW + 0.5 && iy >= 0 && iy <= oh)
            return true;
        Q_UNUSED(horiz);
    }
    return false;
}

QVariantMap Layout3D::sampleShading(const QVariantMap& layout, const QVariantList& obstacles,
                                    double sunAzNorth, double sunElev) const
{
    const QVariantMap sun = sunDirection(sunAzNorth, sunElev);
    const double dx = sun.value(QStringLiteral("x")).toDouble();
    const double dy = sun.value(QStringLiteral("y")).toDouble();
    const double dz = sun.value(QStringLiteral("z")).toDouble();
    const QVariantList positions = layout.value(QStringLiteral("positions")).toList();
    const double roofScale =
        std::max(layout.value(QStringLiteral("roofW")).toDouble(),
                 layout.value(QStringLiteral("roofD")).toDouble());

    int lit = 0;
    const int total = positions.size();
    if (sunElev <= 0 || total == 0) {
        return {{QStringLiteral("shadedFraction"), 1.0},
                {QStringLiteral("litPanels"), 0},
                {QStringLiteral("totalPanels"), total},
                {QStringLiteral("keep"), 0.0}};
    }

    for (const QVariant& v : positions) {
        const QVariantMap p = v.toMap();
        const double px = p.value(QStringLiteral("x")).toDouble();
        const double py = p.value(QStringLiteral("y")).toDouble() + 0.1;
        const double pz = p.value(QStringLiteral("z")).toDouble();
        // Cosinus d'incidence simplifié (normale panneau)
        const double tilt = p.value(QStringLiteral("tilt")).toDouble() * M_PI / 180.0;
        const double yaw = p.value(QStringLiteral("yaw")).toDouble() * M_PI / 180.0;
        // Normale : inclinaison vers Sud (yaw)
        const double nx = std::sin(yaw) * std::sin(tilt);
        const double ny = std::cos(tilt);
        const double nz = -std::cos(yaw) * std::sin(tilt);
        const double ndot = nx * dx + ny * dy + nz * dz;
        if (ndot <= 0.05)
            continue; // dos au soleil
        if (!rayHitsObstacle(px, py, pz, dx, dy, dz, obstacles, roofScale))
            ++lit;
    }
    const double keep = total > 0 ? lit / double(total) : 0;
    return {{QStringLiteral("shadedFraction"), std::round((1.0 - keep) * 1000) / 10},
            {QStringLiteral("litPanels"), lit},
            {QStringLiteral("totalPanels"), total},
            {QStringLiteral("keep"), std::round(keep * 1000) / 1000}};
}

QVariantList Layout3D::halfHourlyKeepForMonth(double lat, int month, const QVariantMap& layout,
                                              const QVariantList& obstacles) const
{
    SiteShade shade;
    static const int midDays[12] = {15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349};
    const int doy = midDays[std::clamp(month, 1, 12) - 1];

    QVariantList keep;
    for (int slot = 0; slot < 48; ++slot) {
        const double hour = slot / 2.0;
        const QVariantMap sp = shade.sunPos(lat, doy, hour);
        const double elev = sp.value(QStringLiteral("elev")).toDouble();
        const double az = sp.value(QStringLiteral("az")).toDouble();
        if (elev <= 0) {
            keep.append(0.0);
            continue;
        }
        const QVariantMap s = sampleShading(layout, obstacles, az, elev);
        keep.append(s.value(QStringLiteral("keep")).toDouble());
    }
    return keep;
}

QVariantMap Layout3D::computeSceneShading(double lat, const QVariantMap& layoutCfg,
                                          const QVariantList& obstacles,
                                          const QVariantList& weatherData) const
{
    // Positions manuelles de l’éditeur 3D prioritaires sur une grille auto
    QVariantMap layout;
    if (layoutCfg.value(QStringLiteral("positions")).toList().size() > 0) {
        layout = layoutCfg;
        if (!layout.contains(QStringLiteral("panelsPlaced")))
            layout.insert(QStringLiteral("panelsPlaced"),
                          layout.value(QStringLiteral("positions")).toList().size());
        if (!layout.contains(QStringLiteral("roofW")))
            layout.insert(QStringLiteral("roofW"), layoutCfg.value(QStringLiteral("roofW"), 10));
        if (!layout.contains(QStringLiteral("roofD")))
            layout.insert(QStringLiteral("roofD"), layoutCfg.value(QStringLiteral("roofD"), 6));
    } else {
        layout = computeLayout(layoutCfg);
    }
    QVariantList monthlyLoss;
    QVariantList keeps;
    double sumLoss = 0;
    double sumW = 0;
    for (int m = 1; m <= 12; ++m) {
        const QVariantList keep = halfHourlyKeepForMonth(lat, m, layout, obstacles);
        keeps.append(QVariant::fromValue(keep));
        double lossSum = 0;
        int daySlots = 0;
        for (const QVariant& k : keep) {
            const double v = k.toDouble();
            // keep=0 la nuit → ignorer ; sinon perte = 1-keep
            if (v <= 0.0 && daySlots == 0) {
                // could be night or fully shaded — count only if any keep>0 later
            }
            // Heuristique : slots avec keep==0 en masse = nuit ; on compte si
            // au moins un voisin diurne. Plus simple : moyenne des keep>0 ou
            // tous les slots où soleil théorique (approx keep défini via elev).
            // Recalcule via moyenne des keep non-triviaux : si keep==0 et majorité
            // → skip. On utilise : moyenne de (1-keep) sur slots keep définis
            // avec soleil (halfHourlyKeepForMonth met 0 si elev<=0).
            // Donc 0 = nuit OU ombre totale. Différencier : stocker -1 pour nuit.
            Q_UNUSED(v);
        }
        // Recalcule proprement : re-boucle soleil
        SiteShade shade;
        static const int midDays[12] = {15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349};
        const int doy = midDays[m - 1];
        lossSum = 0;
        daySlots = 0;
        for (int slot = 0; slot < 48; ++slot) {
            const QVariantMap sp = shade.sunPos(lat, doy, slot / 2.0);
            if (sp.value(QStringLiteral("elev")).toDouble() <= 0)
                continue;
            const double kv = keep.value(slot).toDouble();
            lossSum += (1.0 - kv);
            ++daySlots;
        }
        const double loss = daySlots > 0 ? lossSum / daySlots : 0;
        monthlyLoss.append(std::round(loss * 1000) / 1000);
        double w = 1;
        if (m - 1 < weatherData.size())
            w = std::max(1.0, weatherData[m - 1].toMap().value(QStringLiteral("GHI"), 100).toDouble());
        sumLoss += loss * w;
        sumW += w;
    }
    const double annual = sumW > 0 ? sumLoss / sumW : 0;
    return {{QStringLiteral("layout"), layout},
            {QStringLiteral("monthlyLoss"), monthlyLoss},
            {QStringLiteral("halfHourlyKeep"), keeps},
            {QStringLiteral("annualLossPct"), std::round(annual * 1000) / 10},
            {QStringLiteral("panelsPlaced"), layout.value(QStringLiteral("panelsPlaced"))}};
}

} // namespace ose

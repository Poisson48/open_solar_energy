#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>

namespace ose {

/**
 * Multi-toitures : CRUD, migration layout plat → roofs[], orientation pondérée,
 * panneaux pour ombrage (coords plan + offset scène).
 */
class LayoutRoofs : public QObject {
    Q_OBJECT
public:
    explicit LayoutRoofs(QObject* parent = nullptr);

    /** Toiture par défaut (mètres, azimut PV 0=Sud). */
    Q_INVOKABLE QVariantMap defaultRoof(const QVariantMap& overrides = {}) const;

    /**
     * Normalise un blob layout projet → { activeId, roofs: [...] }.
     * Migre l’ancien format plat (roofL/roofW/positions/…).
     */
    Q_INVOKABLE QVariantMap migrate(const QVariantMap& layout) const;

    Q_INVOKABLE QVariantMap ensure(const QVariantMap& layout) const;
    Q_INVOKABLE QVariantMap getActiveRoof(const QVariantMap& layout) const;
    Q_INVOKABLE QVariantMap setActive(const QVariantMap& layout, const QString& id) const;
    Q_INVOKABLE QVariantMap addRoof(const QVariantMap& layout, const QString& name = {}) const;
    Q_INVOKABLE QVariantMap removeRoof(const QVariantMap& layout, const QString& id) const;
    Q_INVOKABLE QVariantMap updateRoof(const QVariantMap& layout, const QString& id,
                                       const QVariantMap& patch) const;

    /** Répartit totalN panneaux sur les toitures (proportionnel ou égalitaire). */
    Q_INVOKABLE QVariantMap distributePanels(const QVariantMap& layout, int totalN) const;

    /**
     * Place une grille lignes×colonnes sur la toiture active (ou roofId).
     * dims optionnel : roofW, roofD, panelW, panelH, tilt, azimuth, gap/gapX/gapZ,
     * mountHeight, name.
     */
    Q_INVOKABLE QVariantMap generateGrid(const QVariantMap& layout, int rows, int cols,
                                         const QVariantMap& dims = {},
                                         const QString& roofId = {}) const;

    Q_INVOKABLE int totalPanels(const QVariantMap& layout) const;
    Q_INVOKABLE double totalPanelSurfaceM2(const QVariantMap& layout) const;
    Q_INVOKABLE double totalRoofSurfaceM2(const QVariantMap& layout) const;

    /** { tilt, azimuth } PV pondérés par nPanels × panelWp. */
    Q_INVOKABLE QVariantMap weightedOrientation(const QVariantMap& layout,
                                                double panelWp = 400) const;

    /**
     * { roofs: [...], panels: [...] } plan ombrage legacy (2.5D / fast).
     */
    Q_INVOKABLE QVariantMap buildPanelsForShading(const QVariantMap& layout) const;

    /**
     * Mesh ombrage monde (même transform que SolarScene3D) :
     * { panels: [{id,roofId,cx,cy,cz,nx,ny,nz,corners:[[x,y,z]×4], area}],
     *   obstacles: [{id,roofId,triangles: [[x,y,z]×3]… }],
     *   panelCount, obstacleCount }
     * corners = quad panneau (ordre CCW face au soleil) ; obstacles = triangles boîte.
     */
    Q_INVOKABLE QVariantMap buildWorldShadeMesh(const QVariantMap& layout,
                                                const QVariantList& obstacles = {}) const;

    /** Gap scène entre toitures (m). */
    static constexpr double kSceneGap = 2.0;
};

} // namespace ose

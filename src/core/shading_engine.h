#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>

#include <functional>

namespace ose {

/**
 * Ombrage 3D riche :
 * precise = raycast mesh monde ; fast = plan 2.5D legacy.
 * Azimuts soleil / horizon : 0° = Nord.
 */
class ShadingEngine : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool computing READ computing NOTIFY computingChanged)
    Q_PROPERTY(int computePercent READ computePercent NOTIFY computeProgressChanged)
    Q_PROPERTY(double computeEtaSec READ computeEtaSec NOTIFY computeProgressChanged)
    Q_PROPERTY(QString computeStatus READ computeStatus NOTIFY computeProgressChanged)
public:
    explicit ShadingEngine(QObject* parent = nullptr);

    bool computing() const { return m_computing; }
    int computePercent() const { return m_computePercent; }
    double computeEtaSec() const { return m_computeEtaSec; }
    QString computeStatus() const { return m_computeStatus; }

    /**
     * options: {
     *   lat, weatherData[], horizonPoints[],
     *   layout, obstacles[],
     *   shadeEngine: "precise" (défaut) | "fast"
     * }
     * Synchrone (bloque le thread appelant).
     */
    Q_INVOKABLE QVariantMap computeFull(const QVariantMap& options) const;

    /**
     * Estimation durée : { etaSec, steps, panels, obstacles, detail }.
     */
    Q_INVOKABLE QVariantMap estimateCompute(const QVariantMap& options) const;

    /** Lance computeFull en arrière-plan ; signaux computeProgress / computeFinished. */
    Q_INVOKABLE bool startComputeFull(const QVariantMap& options);

    /** Sample keep instantané (plan 2.5D legacy). */
    Q_INVOKABLE QVariantMap sampleAt(const QVariantList& panels, const QVariantList& obstacles,
                                     const QVariantList& horizonPoints, double sunAzNorth,
                                     double sunElev, double beamShare = 0.55) const;

    /**
     * Sample keep via raycast 3D (même soleil / géométrie que la scène).
     */
    Q_INVOKABLE QVariantMap samplePrecise(const QVariantMap& layout,
                                          const QVariantList& obstacles,
                                          const QVariantList& horizonPoints, double sunAzNorth,
                                          double sunElev, double beamShare = 0.55) const;

signals:
    void computingChanged();
    void computeProgressChanged();
    void computeProgress(int percent, double etaSec, const QString& message);
    void computeFinished(const QVariantMap& result);
    void computeFailed(const QString& error);

private:
    QVariantMap computeFullImpl(const QVariantMap& options,
                                const std::function<void(int, double, const QString&)>& onProgress) const;

    bool m_computing = false;
    int m_computePercent = 0;
    double m_computeEtaSec = 0;
    QString m_computeStatus;
};

} // namespace ose

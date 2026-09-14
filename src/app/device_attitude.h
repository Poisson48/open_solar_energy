#pragma once

#include <QObject>
#include <QPointF>
#include <QString>

class QAccelerometer;
class QMagnetometer;
class QTimer;

namespace app {

/**
 * Attitude regard caméra (−Z), style SkyView / Stellarium.
 * Android : vecteur de rotation HAL (gyro+accel+mag).
 * Secours : fusion accel + magnéto Qt Sensors.
 */
class DeviceAttitude : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool active READ active WRITE setActive NOTIFY activeChanged)
    Q_PROPERTY(bool available READ available NOTIFY availableChanged)
    Q_PROPERTY(qreal heading READ heading NOTIFY attitudeChanged)
    Q_PROPERTY(qreal elevation READ elevation NOTIFY attitudeChanged)
    Q_PROPERTY(qreal pitch READ pitch NOTIFY attitudeChanged)
    Q_PROPERTY(bool hasHeading READ hasHeading NOTIFY attitudeChanged)
    Q_PROPERTY(bool hasElevation READ hasElevation NOTIFY attitudeChanged)
    Q_PROPERTY(bool hasBasis READ hasBasis NOTIFY attitudeChanged)
    Q_PROPERTY(QString status READ status NOTIFY statusChanged)
    Q_PROPERTY(qreal screenAngle READ screenAngle WRITE setScreenAngle NOTIFY screenAngleChanged)

public:
    explicit DeviceAttitude(QObject* parent = nullptr);
    ~DeviceAttitude() override;

    bool active() const { return m_active; }
    void setActive(bool on);
    bool available() const { return m_available; }
    qreal heading() const { return m_heading; }
    qreal elevation() const { return m_elevation; }
    qreal pitch() const { return m_pitch; }
    bool hasHeading() const { return m_hasHeading; }
    bool hasElevation() const { return m_hasElevation; }
    bool hasBasis() const { return m_hasBasis; }
    QString status() const { return m_status; }
    qreal screenAngle() const { return m_screenAngle; }
    void setScreenAngle(qreal deg);

    Q_INVOKABLE QPointF projectToScreen(qreal azDeg, qreal elevDeg,
                                        qreal width, qreal height,
                                        qreal hFovDeg, qreal vFovDeg) const;

signals:
    void activeChanged();
    void availableChanged();
    void attitudeChanged();
    void statusChanged();
    void screenAngleChanged();

private:
    void setStatus(const QString& s);
    void refreshStatus();
    void onAccel();
    void onMag();
    void tryFusion();
    void pollAndroid();
    void applyAttitude(qreal heading, qreal elev,
                       qreal ex, qreal ey, qreal ez,
                       qreal nx, qreal ny, qreal nz,
                       qreal ux, qreal uy, qreal uz,
                       bool fromAndroid);

    bool m_active = false;
    bool m_available = false;
    bool m_useAndroid = false;
    qreal m_heading = 0;
    qreal m_elevation = 0;
    qreal m_pitch = 90;
    bool m_hasHeading = false;
    bool m_hasElevation = false;
    bool m_hasBasis = false;
    bool m_smoothInit = false;
    qreal m_screenAngle = 0;
    QString m_status;

    qreal m_ex = 1, m_ey = 0, m_ez = 0;
    qreal m_nx = 0, m_ny = 1, m_nz = 0;
    qreal m_ux = 0, m_uy = 0, m_uz = 1;

    qreal m_ax = 0, m_ay = 0, m_az = 9.81;
    qreal m_mx = 0, m_my = 1, m_mz = 0;
    bool m_haveAccel = false;
    bool m_haveMag = false;

    QAccelerometer* m_accel = nullptr;
    QMagnetometer* m_mag = nullptr;
    QTimer* m_androidPoll = nullptr;
};

} // namespace app

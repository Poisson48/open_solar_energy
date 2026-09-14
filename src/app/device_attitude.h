#pragma once

#include <QObject>
#include <QString>

class QCompass;
class QAccelerometer;
class QRotationSensor;

namespace app {

/**
 * Cap magnétique (0°=N) + élévation regard caméra (0°=horizon) pour le mode photo Site.
 * Source principale : boussole + accéléromètre (fiable sur Android).
 * Secours : QRotationSensor en angles d’Euler.
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
    Q_PROPERTY(QString status READ status NOTIFY statusChanged)

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
    QString status() const { return m_status; }

signals:
    void activeChanged();
    void availableChanged();
    void attitudeChanged();
    void statusChanged();

private:
    void setStatus(const QString& s);
    void refreshStatus();
    void onCompass();
    void onAccel();
    void onRotation();
    void applySmoothed(qreal heading, qreal elev, qreal pitch, bool haveH, bool haveE);

    bool m_active = false;
    bool m_available = false;
    qreal m_heading = 0;
    qreal m_elevation = 0;
    qreal m_pitch = 90;
    bool m_hasHeading = false;
    bool m_hasElevation = false;
    bool m_smoothInit = false;
    QString m_status;

    QCompass* m_compass = nullptr;
    QAccelerometer* m_accel = nullptr;
    QRotationSensor* m_rotation = nullptr;
};

} // namespace app

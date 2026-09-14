#include "device_attitude.h"

#include <QtMath>
#include <algorithm>
#include <cmath>

#ifdef OSE_HAS_SENSORS
#  include <QAccelerometer>
#  include <QAccelerometerReading>
#  include <QCompass>
#  include <QCompassReading>
#  include <QRotationReading>
#  include <QRotationSensor>
#endif

namespace app {
namespace {

qreal normAz(qreal a)
{
    while (a < 0)
        a += 360;
    while (a >= 360)
        a -= 360;
    return a;
}

qreal elevFromPitch(qreal pitch)
{
    // Debout : pitch≈90 → élév 0 ; penché vers le ciel → élév ↑
    return qBound(0.0, pitch - 90.0, 90.0);
}

/** Pitch écran portrait (0=à plat face up, ~90=debout) depuis la gravité. */
qreal pitchFromAccel(qreal ax, qreal ay, qreal az)
{
    const qreal g = std::sqrt(ax * ax + ay * ay + az * az);
    if (g < 1e-3)
        return 90.0;
    // Portrait : axe Y vers le haut de l’écran, Z vers l’utilisateur
    return qRadiansToDegrees(std::atan2(-ay, std::sqrt(ax * ax + az * az)));
}

} // namespace

DeviceAttitude::DeviceAttitude(QObject* parent) : QObject(parent)
{
#ifdef OSE_HAS_SENSORS
    m_compass = new QCompass(this);
    m_accel = new QAccelerometer(this);
    m_rotation = new QRotationSensor(this);

    const bool compOk = m_compass->connectToBackend();
    const bool accelOk = m_accel->connectToBackend();
    const bool rotOk = m_rotation->connectToBackend();
    m_available = compOk || accelOk || rotOk;

    if (compOk) {
        m_compass->setDataRate(25);
        connect(m_compass, &QCompass::readingChanged, this, &DeviceAttitude::onCompass);
    }
    if (accelOk) {
        m_accel->setDataRate(25);
        connect(m_accel, &QAccelerometer::readingChanged, this, &DeviceAttitude::onAccel);
    }
    if (rotOk) {
        // Secours / complément — x,y,z sont des angles d’Euler (°), pas un quaternion
        m_rotation->setDataRate(25);
        connect(m_rotation, &QRotationSensor::readingChanged, this, &DeviceAttitude::onRotation);
    }

    if (compOk && accelOk)
        setStatus(QStringLiteral("Boussole + accel OK — bougez l’appareil"));
    else if (compOk)
        setStatus(QStringLiteral("Boussole OK — élévation via force manuelle si besoin"));
    else if (rotOk)
        setStatus(QStringLiteral("Rotation OK"));
    else
        setStatus(QStringLiteral("Aucun capteur d’orientation"));
#else
    setStatus(QStringLiteral("Capteurs non compilés (desktop)"));
#endif
}

DeviceAttitude::~DeviceAttitude()
{
    setActive(false);
}

void DeviceAttitude::setStatus(const QString& s)
{
    if (m_status == s)
        return;
    m_status = s;
    emit statusChanged();
}

void DeviceAttitude::refreshStatus()
{
    if (m_hasHeading && m_hasElevation) {
        setStatus(QStringLiteral("Cap %1° · élév %2°")
                      .arg(qRound(m_heading))
                      .arg(qRound(m_elevation)));
    } else if (m_hasHeading) {
        setStatus(QStringLiteral("Cap %1° · élév — (penchez ou forcez)").arg(qRound(m_heading)));
    } else if (m_hasElevation) {
        setStatus(QStringLiteral("Cap — · élév %1°").arg(qRound(m_elevation)));
    }
}

void DeviceAttitude::setActive(bool on)
{
    if (m_active == on)
        return;
    m_active = on;
#ifdef OSE_HAS_SENSORS
    if (m_compass) {
        if (on)
            m_compass->start();
        else
            m_compass->stop();
    }
    if (m_accel) {
        if (on)
            m_accel->start();
        else
            m_accel->stop();
    }
    if (m_rotation) {
        if (on)
            m_rotation->start();
        else
            m_rotation->stop();
    }
#endif
    if (!on) {
        m_smoothInit = false;
        m_hasHeading = false;
        m_hasElevation = false;
    }
    emit activeChanged();
    emit attitudeChanged();
}

void DeviceAttitude::applySmoothed(qreal heading, qreal elev, qreal pitch, bool haveH, bool haveE)
{
    if (haveH) {
        if (!m_smoothInit || !m_hasHeading) {
            m_heading = heading;
        } else {
            qreal d = heading - m_heading;
            while (d > 180)
                d -= 360;
            while (d < -180)
                d += 360;
            m_heading = normAz(m_heading + 0.35 * d);
        }
        m_hasHeading = true;
    }
    if (haveE) {
        if (!m_smoothInit || !m_hasElevation)
            m_elevation = elev;
        else
            m_elevation = m_elevation * 0.65 + elev * 0.35;
        m_pitch = pitch;
        m_hasElevation = true;
    }
    m_smoothInit = true;
    emit attitudeChanged();
    refreshStatus();
}

void DeviceAttitude::onCompass()
{
#ifdef OSE_HAS_SENSORS
    if (!m_compass)
        return;
    auto* r = m_compass->reading();
    if (!r)
        return;
    applySmoothed(normAz(r->azimuth()), m_elevation, m_pitch, true, false);
#else
    Q_UNUSED(0);
#endif
}

void DeviceAttitude::onAccel()
{
#ifdef OSE_HAS_SENSORS
    if (!m_accel)
        return;
    auto* r = m_accel->reading();
    if (!r)
        return;
    const qreal pitch = pitchFromAccel(r->x(), r->y(), r->z());
    const qreal elev = elevFromPitch(pitch);
    applySmoothed(m_heading, elev, pitch, false, true);
#else
    Q_UNUSED(0);
#endif
}

void DeviceAttitude::onRotation()
{
#ifdef OSE_HAS_SENSORS
    if (!m_rotation)
        return;
    auto* r = m_rotation->reading();
    if (!r)
        return;
    // Qt : x,y,z = Euler en degrés (setFromEuler). Sur Android (orientation) :
    // z ≈ azimut, x ≈ pitch. On ne remplace la boussole / accel que si absents.
    const qreal rx = r->x();
    const qreal ry = r->y();
    const qreal rz = r->z();

    const bool needH = !m_hasHeading;
    const bool needE = !m_hasElevation;
    if (!needH && !needE)
        return;

    qreal heading = m_heading;
    qreal pitch = m_pitch;
    qreal elev = m_elevation;
    bool haveH = false;
    bool haveE = false;

    if (needH) {
        // Azimut souvent sur Z ; sinon combinaison typique orientation Android
        heading = normAz(rz);
        haveH = true;
    }
    if (needE) {
        // Pitch écran ≈ |x| en portrait (convention courante Qt/Android)
        pitch = std::abs(rx);
        if (pitch < 5.0 && std::abs(ry) > pitch)
            pitch = std::abs(ry);
        elev = elevFromPitch(pitch);
        haveE = true;
    }
    applySmoothed(heading, elev, pitch, haveH, haveE);
#else
    Q_UNUSED(0);
#endif
}

} // namespace app

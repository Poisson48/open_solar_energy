#include "device_attitude.h"

#include <QtMath>
#include <algorithm>
#include <cmath>

#ifdef OSE_HAS_SENSORS
#  include <QCompass>
#  include <QRotationReading>
#  include <QRotationSensor>
#  include <QSensor>
#  include <QTiltReading>
#  include <QTiltSensor>
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

/** Cap + élévation du regard caméra (−Z device) depuis quaternion capteur. */
bool attitudeFromQuat(qreal qx, qreal qy, qreal qz, qreal* headingOut, qreal* elevOut, qreal* pitchOut)
{
    const qreal n2 = qx * qx + qy * qy + qz * qz;
    if (n2 > 1.0)
        return false;
    const qreal qw = std::sqrt(std::max(0.0, 1.0 - static_cast<double>(n2)));

    // look = rotate (0,0,-1) by quaternion (caméra arrière)
    const qreal tx = 2.0 * (-qy);
    const qreal ty = 2.0 * qx;
    const qreal tz = 0.0;
    const qreal lx = 0.0 + qw * tx + (qy * tz - qz * ty);
    const qreal ly = 0.0 + qw * ty + (qz * tx - qx * tz);
    const qreal lz = -1.0 + qw * tz + (qx * ty - qy * tx);

    const qreal len = std::sqrt(lx * lx + ly * ly + lz * lz);
    if (len < 1e-6)
        return false;
    const qreal nx = lx / len;
    const qreal ny = ly / len;
    const qreal nz = lz / len;

    qreal heading = qRadiansToDegrees(std::atan2(nx, ny));
    heading = normAz(heading);
    const qreal elev = qBound(0.0, qRadiansToDegrees(std::asin(qBound(-1.0, nz, 1.0))), 90.0);
    const qreal pitch = elev + 90.0;
    if (headingOut)
        *headingOut = heading;
    if (elevOut)
        *elevOut = elev;
    if (pitchOut)
        *pitchOut = pitch;
    return true;
}

} // namespace

DeviceAttitude::DeviceAttitude(QObject* parent) : QObject(parent)
{
#ifdef OSE_HAS_SENSORS
    m_rotation = new QRotationSensor(this);
    m_compass = new QCompass(this);
    m_tilt = new QTiltSensor(this);

    const bool rotOk = m_rotation->connectToBackend();
    const bool compOk = m_compass->connectToBackend();
    const bool tiltOk = m_tilt->connectToBackend();
    m_available = rotOk || (compOk && tiltOk);
    if (rotOk) {
        m_rotation->setDataRate(25);
        connect(m_rotation, &QRotationSensor::readingChanged, this, &DeviceAttitude::onRotation);
        setStatus(QStringLiteral("Capteurs rotation OK"));
    } else if (compOk || tiltOk) {
        if (compOk) {
            m_compass->setDataRate(25);
            connect(m_compass, &QCompass::readingChanged, this, &DeviceAttitude::onCompass);
        }
        if (tiltOk) {
            m_tilt->setDataRate(25);
            connect(m_tilt, &QTiltSensor::readingChanged, this, &DeviceAttitude::onTilt);
        }
        setStatus(QStringLiteral("Boussole / tilt OK"));
    } else {
        setStatus(QStringLiteral("Aucun capteur d’orientation"));
    }
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

void DeviceAttitude::setActive(bool on)
{
    if (m_active == on)
        return;
    m_active = on;
#ifdef OSE_HAS_SENSORS
    if (m_rotation) {
        if (on)
            m_rotation->start();
        else
            m_rotation->stop();
    }
    if (m_compass) {
        if (on)
            m_compass->start();
        else
            m_compass->stop();
    }
    if (m_tilt) {
        if (on)
            m_tilt->start();
        else
            m_tilt->stop();
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
            // Lissage circulaire léger
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
}

void DeviceAttitude::onRotation()
{
#ifdef OSE_HAS_SENSORS
    if (!m_rotation)
        return;
    auto* r = m_rotation->reading();
    if (!r)
        return;
    qreal h = 0, e = 0, p = 90;
    if (!attitudeFromQuat(r->x(), r->y(), r->z(), &h, &e, &p))
        return;
    applySmoothed(h, e, p, true, true);
    setStatus(QStringLiteral("Cap %1° · élév %2°")
                  .arg(qRound(h))
                  .arg(qRound(e)));
#else
    Q_UNUSED(0);
#endif
}

void DeviceAttitude::onCompass()
{
#ifdef OSE_HAS_SENSORS
    if (!m_compass)
        return;
    auto* r = m_compass->reading();
    if (!r)
        return;
    applySmoothed(normAz(r->azimuth()), m_elevation, m_pitch, true, m_hasElevation);
    if (m_hasHeading && m_hasElevation)
        setStatus(QStringLiteral("Cap %1° · élév %2°")
                      .arg(qRound(m_heading))
                      .arg(qRound(m_elevation)));
    else if (m_hasHeading)
        setStatus(QStringLiteral("Cap %1° · élév —").arg(qRound(m_heading)));
#else
    Q_UNUSED(0);
#endif
}

void DeviceAttitude::onTilt()
{
#ifdef OSE_HAS_SENSORS
    if (!m_tilt)
        return;
    auto* r = m_tilt->reading();
    if (!r)
        return;
    // yRotation ≈ pitch écran en portrait (0 à plat, ~±90 debout)
    const qreal pitch = std::abs(r->yRotation());
    const qreal elev = elevFromPitch(pitch);
    applySmoothed(m_heading, elev, pitch, m_hasHeading, true);
    if (m_hasHeading && m_hasElevation)
        setStatus(QStringLiteral("Cap %1° · élév %2°")
                      .arg(qRound(m_heading))
                      .arg(qRound(m_elevation)));
    else
        setStatus(QStringLiteral("Cap — · élév %1°").arg(qRound(m_elevation)));
#else
    Q_UNUSED(0);
#endif
}

} // namespace app

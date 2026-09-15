#include "device_attitude.h"

#include <QTimer>
#include <QtMath>
#include <algorithm>
#include <cmath>

#ifdef Q_OS_ANDROID
#  include <QCoreApplication>
#  include <QJniEnvironment>
#  include <QJniObject>
#endif

#ifdef OSE_HAS_SENSORS
#  include <QAccelerometer>
#  include <QAccelerometerReading>
#  include <QMagnetometer>
#  include <QMagnetometerReading>
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

qreal clampf(qreal v, qreal lo, qreal hi)
{
    return std::max(lo, std::min(hi, v));
}

qreal length3(qreal x, qreal y, qreal z)
{
    return std::sqrt(x * x + y * y + z * z);
}

bool normalize3(qreal& x, qreal& y, qreal& z, qreal minLen)
{
    const qreal n = length3(x, y, z);
    if (n < minLen)
        return false;
    x /= n;
    y /= n;
    z /= n;
    return true;
}

bool basisFromAccelMag(qreal ax, qreal ay, qreal az,
                       qreal mx, qreal my, qreal mz,
                       qreal* ex, qreal* ey, qreal* ez,
                       qreal* nx, qreal* ny, qreal* nz,
                       qreal* ux, qreal* uy, qreal* uz,
                       qreal* headingOut, qreal* elevOut)
{
    qreal uxx = ax, uyy = ay, uzz = az;
    if (!normalize3(uxx, uyy, uzz, 1.0))
        return false;

    qreal exx = uyy * mz - uzz * my;
    qreal eyy = uzz * mx - uxx * mz;
    qreal ezz = uxx * my - uyy * mx;
    if (!normalize3(exx, eyy, ezz, 1e-6))
        return false;

    qreal nxx = eyy * uzz - ezz * uyy;
    qreal nyy = ezz * uxx - exx * uzz;
    qreal nzz = exx * uyy - eyy * uxx;
    if (!normalize3(nxx, nyy, nzz, 1e-6))
        return false;

    const qreal lookE = -ezz;
    const qreal lookN = -nzz;
    const qreal lookU = -uzz;
    const qreal elev = clampf(qRadiansToDegrees(std::asin(clampf(lookU, -1.0, 1.0))), 0.0, 90.0);
    if (lookE * lookE + lookN * lookN < 1e-8)
        return false;
    const qreal heading = normAz(qRadiansToDegrees(std::atan2(lookE, lookN)));

    *ex = exx;
    *ey = eyy;
    *ez = ezz;
    *nx = nxx;
    *ny = nyy;
    *nz = nzz;
    *ux = uxx;
    *uy = uyy;
    *uz = uzz;
    *headingOut = heading;
    *elevOut = elev;
    return true;
}

#ifdef Q_OS_ANDROID
constexpr const char* kCamAttitude = "org/opensolarenergy/app/CameraAttitude";

QJniObject androidContext()
{
    return QJniObject{QNativeInterface::QAndroidApplication::context()};
}
#endif

} // namespace

DeviceAttitude::DeviceAttitude(QObject* parent) : QObject(parent)
{
#ifdef Q_OS_ANDROID
    {
        const QJniObject ctx = androidContext();
        m_useAndroid = ctx.isValid()
            && QJniObject::callStaticMethod<jboolean>(
                   kCamAttitude, "available", "(Landroid/content/Context;)Z", ctx.object());
        if (m_useAndroid) {
            m_available = true;
            m_androidPoll = new QTimer(this);
            m_androidPoll->setInterval(33); // ~30 Hz UI
            connect(m_androidPoll, &QTimer::timeout, this, &DeviceAttitude::pollAndroid);
            setStatus(QStringLiteral("Rotation vector (qualité Stellarium)"));
        }
    }
#endif

#ifdef OSE_HAS_SENSORS
    if (!m_useAndroid) {
        m_accel = new QAccelerometer(this);
        m_mag = new QMagnetometer(this);
        const bool accelOk = m_accel->connectToBackend();
        const bool magOk = m_mag->connectToBackend();
        m_available = accelOk && magOk;
        if (accelOk) {
            m_accel->setDataRate(30);
            connect(m_accel, &QAccelerometer::readingChanged, this, &DeviceAttitude::onAccel);
        }
        if (magOk) {
            m_mag->setDataRate(30);
            m_mag->setReturnGeoValues(true);
            connect(m_mag, &QMagnetometer::readingChanged, this, &DeviceAttitude::onMag);
        }
        if (m_available)
            setStatus(QStringLiteral("Accel + magnéto"));
        else
            setStatus(QStringLiteral("Capteurs indisponibles"));
    }
#else
    if (!m_useAndroid)
        setStatus(QStringLiteral("Capteurs non compilés (desktop)"));
#endif
}

DeviceAttitude::~DeviceAttitude()
{
    setActive(false);
}

void DeviceAttitude::setScreenAngle(qreal deg)
{
    deg = normAz(std::round(deg / 90.0) * 90.0);
    if (qFuzzyCompare(m_screenAngle + 1.0, deg + 1.0))
        return;
    m_screenAngle = deg;
    emit screenAngleChanged();
    emit attitudeChanged();
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
    }
}

void DeviceAttitude::setActive(bool on)
{
    if (m_active == on)
        return;
    m_active = on;

#ifdef Q_OS_ANDROID
    if (m_useAndroid) {
        const QJniObject ctx = androidContext();
        if (on && ctx.isValid()) {
            const bool ok = QJniObject::callStaticMethod<jboolean>(
                kCamAttitude, "start", "(Landroid/content/Context;)Z", ctx.object());
            if (ok && m_androidPoll)
                m_androidPoll->start();
            else
                setStatus(QStringLiteral("Échec démarrage rotation vector"));
        } else {
            if (m_androidPoll)
                m_androidPoll->stop();
            QJniObject::callStaticMethod<void>(kCamAttitude, "stop", "()V");
        }
    }
#endif

#ifdef OSE_HAS_SENSORS
    if (!m_useAndroid) {
        if (m_accel) {
            if (on)
                m_accel->start();
            else
                m_accel->stop();
        }
        if (m_mag) {
            if (on)
                m_mag->start();
            else
                m_mag->stop();
        }
    }
#endif

    if (!on) {
        m_smoothInit = false;
        m_hasHeading = false;
        m_hasElevation = false;
        m_hasBasis = false;
        m_haveAccel = false;
        m_haveMag = false;
    }
    emit activeChanged();
    emit attitudeChanged();
}

void DeviceAttitude::applyAttitude(qreal heading, qreal elev,
                                   qreal ex, qreal ey, qreal ez,
                                   qreal nx, qreal ny, qreal nz,
                                   qreal ux, qreal uy, qreal uz,
                                   bool fromAndroid)
{
    // Overlay AR : base RAW (sinon les points « glissent » derrière le viseur).
    // HUD : léger lissage du cap / élévation affichés seulement.
    m_ex = ex;
    m_ey = ey;
    m_ez = ez;
    m_nx = nx;
    m_ny = ny;
    m_nz = nz;
    m_ux = ux;
    m_uy = uy;
    m_uz = uz;

    const qreal kH = fromAndroid ? 0.55 : 0.30;
    const qreal kE = fromAndroid ? 0.60 : 0.35;
    if (!m_smoothInit || !m_hasHeading) {
        m_heading = heading;
        m_elevation = elev;
    } else {
        qreal d = heading - m_heading;
        while (d > 180)
            d -= 360;
        while (d < -180)
            d += 360;
        m_heading = normAz(m_heading + kH * d);
        m_elevation = m_elevation * (1.0 - kE) + elev * kE;
    }

    m_pitch = m_elevation + 90.0;
    m_hasHeading = true;
    m_hasElevation = true;
    m_hasBasis = true;
    m_smoothInit = true;
    emit attitudeChanged();
    refreshStatus();
}

void DeviceAttitude::pollAndroid()
{
#ifdef Q_OS_ANDROID
    if (!m_useAndroid)
        return;
    const QJniObject arr = QJniObject::callStaticObjectMethod(kCamAttitude, "poll", "()[F");
    if (!arr.isValid())
        return;
    QJniEnvironment jni;
    JNIEnv* env = jni.jniEnv();
    if (!env)
        return;
    jfloatArray jarr = arr.object<jfloatArray>();
    if (!jarr)
        return;
    const jsize n = env->GetArrayLength(jarr);
    if (n < 12)
        return;
    jfloat buf[12];
    env->GetFloatArrayRegion(jarr, 0, 12, buf);
    // screenAngle depuis Display (plus fiable que QML Screen sur Android)
    setScreenAngle(buf[11]);
    applyAttitude(buf[0], buf[1],
                  buf[2], buf[3], buf[4],
                  buf[5], buf[6], buf[7],
                  buf[8], buf[9], buf[10],
                  true);
#else
    Q_UNUSED(0);
#endif
}

void DeviceAttitude::tryFusion()
{
    if (m_useAndroid || !m_haveAccel || !m_haveMag)
        return;
    qreal ex, ey, ez, nx, ny, nz, ux, uy, uz, h, e;
    if (!basisFromAccelMag(m_ax, m_ay, m_az, m_mx, m_my, m_mz,
                           &ex, &ey, &ez, &nx, &ny, &nz, &ux, &uy, &uz, &h, &e))
        return;
    applyAttitude(h, e, ex, ey, ez, nx, ny, nz, ux, uy, uz, false);
}

void DeviceAttitude::onAccel()
{
#ifdef OSE_HAS_SENSORS
    if (m_useAndroid || !m_accel)
        return;
    auto* r = m_accel->reading();
    if (!r)
        return;
    m_ax = r->x();
    m_ay = r->y();
    m_az = r->z();
    m_haveAccel = true;
    const qreal an = length3(m_ax, m_ay, m_az);
    if (an > 1.0 && !m_haveMag) {
        const qreal elev = clampf(qRadiansToDegrees(std::asin(clampf(-(m_az / an), -1.0, 1.0))), 0.0, 90.0);
        m_elevation = m_hasElevation ? (m_elevation * 0.75 + elev * 0.25) : elev;
        m_pitch = m_elevation + 90.0;
        m_hasElevation = true;
        emit attitudeChanged();
        refreshStatus();
    }
    tryFusion();
#else
    Q_UNUSED(0);
#endif
}

void DeviceAttitude::onMag()
{
#ifdef OSE_HAS_SENSORS
    if (m_useAndroid || !m_mag)
        return;
    auto* r = m_mag->reading();
    if (!r)
        return;
    m_mx = r->x();
    m_my = r->y();
    m_mz = r->z();
    m_haveMag = true;
    tryFusion();
#else
    Q_UNUSED(0);
#endif
}

QPointF DeviceAttitude::projectToScreen(qreal azDeg, qreal elevDeg,
                                        qreal width, qreal height,
                                        qreal hFovDeg, qreal vFovDeg) const
{
    if (!m_hasBasis || width < 1 || height < 1)
        return QPointF(-1, -1);

    const qreal az = azDeg * M_PI / 180.0;
    const qreal el = clampf(elevDeg, 0.0, 90.0) * M_PI / 180.0;
    const qreal ve = std::sin(az) * std::cos(el);
    const qreal vn = std::cos(az) * std::cos(el);
    const qreal vu = std::sin(el);

    const qreal dx = m_ex * ve + m_nx * vn + m_ux * vu;
    const qreal dy = m_ey * ve + m_ny * vn + m_uy * vu;
    const qreal dz = m_ez * ve + m_nz * vn + m_uz * vu;

    if (dz >= -1e-4)
        return QPointF(-1, -1);

    qreal ix = dx / (-dz);
    qreal iy = dy / (-dz);

    const qreal rad = -m_screenAngle * M_PI / 180.0;
    const qreal c = std::cos(rad);
    const qreal s = std::sin(rad);
    const qreal sx = ix * c - iy * s;
    const qreal sy = ix * s + iy * c;

    const qreal th = std::tan(hFovDeg * 0.5 * M_PI / 180.0);
    const qreal tv = std::tan(vFovDeg * 0.5 * M_PI / 180.0);
    if (th < 1e-6 || tv < 1e-6)
        return QPointF(-1, -1);

    const qreal ndcX = sx / th;
    const qreal ndcY = sy / tv;
    if (std::abs(ndcX) > 1.2 || std::abs(ndcY) > 1.2)
        return QPointF(-1, -1);

    return QPointF(width * 0.5 * (1.0 + ndcX), height * 0.5 * (1.0 - ndcY));
}

} // namespace app

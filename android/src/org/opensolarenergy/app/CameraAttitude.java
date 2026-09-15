package org.opensolarenergy.app;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.util.Log;
import android.view.Surface;
import android.view.WindowManager;

/**
 * Attitude type SkyView / Stellarium : vecteur de rotation Android
 * (fusion gyro + accel + magnéto côté HAL), indépendant de l’orientation
 * de l’écran. Le regard suit l’objectif caméra arrière (−Z appareil).
 */
public final class CameraAttitude implements SensorEventListener {
    private static final String TAG = "OSE-CamAttitude";
    private static final Object LOCK = new Object();
    private static CameraAttitude sInst;

    private final SensorManager mSm;
    private final WindowManager mWm;
    private Sensor mSensor;
    private boolean mRegistered;

    private final float[] mRotVec = new float[5];
    private final float[] mR = new float[9];
    private final float[] mOut = new float[12]; // heading, elev, E(3), N(3), U(3), screenAngle
    private boolean mHave;

    private CameraAttitude(Context ctx) {
        Context app = ctx.getApplicationContext();
        mSm = (SensorManager) app.getSystemService(Context.SENSOR_SERVICE);
        mWm = (WindowManager) app.getSystemService(Context.WINDOW_SERVICE);
    }

    public static boolean start(Context ctx) {
        if (ctx == null)
            return false;
        synchronized (LOCK) {
            if (sInst == null)
                sInst = new CameraAttitude(ctx);
            return sInst.register();
        }
    }

    public static void stop() {
        synchronized (LOCK) {
            if (sInst != null)
                sInst.unregister();
        }
    }

    /**
     * @return float[12] : heading, elev,
     *         east_x,y,z, north_x,y,z, up_x,y,z (repère appareil),
     *         screenAngleDeg — ou null si pas encore de sample
     */
    public static float[] poll() {
        synchronized (LOCK) {
            if (sInst == null || !sInst.mHave)
                return null;
            return sInst.mOut.clone();
        }
    }

    public static boolean available(Context ctx) {
        if (ctx == null)
            return false;
        SensorManager sm = (SensorManager) ctx.getApplicationContext()
                .getSystemService(Context.SENSOR_SERVICE);
        if (sm == null)
            return false;
        return sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null
                || sm.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR) != null;
    }

    private boolean register() {
        if (mSm == null)
            return false;
        if (mRegistered)
            return true;
        mSensor = mSm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        if (mSensor == null)
            mSensor = mSm.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR);
        if (mSensor == null) {
            Log.w(TAG, "Pas de rotation vector");
            return false;
        }
        // SENSOR_DELAY_UI ≈ 60 ms — assez fluide, moins de charge UI que GAME
        boolean ok = mSm.registerListener(this, mSensor, SensorManager.SENSOR_DELAY_UI);
        mRegistered = ok;
        Log.i(TAG, "start sensor=" + mSensor.getName() + " ok=" + ok);
        return ok;
    }

    private void unregister() {
        if (mSm != null && mRegistered) {
            mSm.unregisterListener(this);
            mRegistered = false;
            Log.i(TAG, "stop");
        }
        mHave = false;
    }

    private int displayRotation() {
        try {
            if (mWm == null || mWm.getDefaultDisplay() == null)
                return Surface.ROTATION_0;
            return mWm.getDefaultDisplay().getRotation();
        } catch (Exception e) {
            return Surface.ROTATION_0;
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_ROTATION_VECTOR
                && event.sensor.getType() != Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR)
            return;
        int n = Math.min(event.values.length, mRotVec.length);
        System.arraycopy(event.values, 0, mRotVec, 0, n);
        SensorManager.getRotationMatrixFromVector(mR, mRotVec);

        // world = R * device  (row-major 3×3)
        // Colonnes : axes appareil exprimés en monde
        // Lignes : axes monde exprimés en appareil
        // Est / Nord / Ciel dans le repère appareil = lignes de R
        final float ex = mR[0], ey = mR[1], ez = mR[2];
        final float nx = mR[3], ny = mR[4], nz = mR[5];
        final float ux = mR[6], uy = mR[7], uz = mR[8];

        // Regard caméra arrière = −Z appareil → monde
        final float lookE = -ez;
        final float lookN = -nz;
        final float lookU = -uz;

        float elev = (float) Math.toDegrees(Math.asin(clamp(lookU, -1f, 1f)));
        // Site : élévation obstacles ≥ 0 (sous l’horizon → 0)
        if (elev < 0f)
            elev = 0f;
        if (elev > 90f)
            elev = 90f;

        float heading = (float) Math.toDegrees(Math.atan2(lookE, lookN));
        if (heading < 0f)
            heading += 360f;

        final int rot = displayRotation();
        final float screenAng;
        switch (rot) {
        case Surface.ROTATION_90:
            screenAng = 90f;
            break;
        case Surface.ROTATION_180:
            screenAng = 180f;
            break;
        case Surface.ROTATION_270:
            screenAng = 270f;
            break;
        default:
            screenAng = 0f;
            break;
        }

        synchronized (LOCK) {
            mOut[0] = heading;
            mOut[1] = elev;
            mOut[2] = ex;
            mOut[3] = ey;
            mOut[4] = ez;
            mOut[5] = nx;
            mOut[6] = ny;
            mOut[7] = nz;
            mOut[8] = ux;
            mOut[9] = uy;
            mOut[10] = uz;
            mOut[11] = screenAng;
            mHave = true;
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // LOW → toast côté QML possible plus tard
    }

    private static float clamp(float v, float lo, float hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}

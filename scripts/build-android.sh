#!/usr/bin/env bash
set -euo pipefail

SDK_ROOT="${SDK_ROOT:-$HOME/Android/Sdk}"
NDK_VER="${NDK_VER:-26.1.10909125}"
QT_VER="${QT_VER:-6.8.2}"
QT_ROOT="${QT_ROOT:-$HOME/Qt}"
QT_ANDROID="${QT_ANDROID:-$QT_ROOT/$QT_VER/android_arm64_v8a}"
QT_HOST="${QT_HOST:-$QT_ROOT/$QT_VER/gcc_64}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${OUT:-$ROOT/opensolarenergy-arm64.apk}"

VERSION_NAME="${VERSION_NAME:-2.0.0}"
VERSION_CODE="${VERSION_CODE:-200}"

export ANDROID_SDK_ROOT="$SDK_ROOT"
export ANDROID_NDK_ROOT="${ANDROID_NDK_ROOT:-$SDK_ROOT/ndk/$NDK_VER}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"

sed -i -E \
  -e "s/android:versionName=\"[^\"]*\"/android:versionName=\"$VERSION_NAME\"/" \
  -e "s/android:versionCode=\"[^\"]*\"/android:versionCode=\"$VERSION_CODE\"/" \
  "$ROOT/android/AndroidManifest.xml"

"$QT_ANDROID/bin/qt-cmake" \
  -S "$ROOT" -B "$ROOT/build-android" -G Ninja \
  -DQT_HOST_PATH="$QT_HOST" \
  -DANDROID_SDK_ROOT="$SDK_ROOT" \
  -DANDROID_NDK_ROOT="$ANDROID_NDK_ROOT" \
  -DCMAKE_BUILD_TYPE=Release \
  -DOSE_VERSION_NAME="$VERSION_NAME" \
  -DOSE_VERSION_CODE="$VERSION_CODE"

cmake --build "$ROOT/build-android" --target apk -j"$(nproc)"

UNSIGNED="$(find "$ROOT/build-android" -name '*-release-unsigned.apk' | head -1)"
[ -n "$UNSIGNED" ] || { echo "APK non signé introuvable" >&2; exit 1; }

BUILD_TOOLS_VER="${BUILD_TOOLS_VER:-35.0.0}"

if [ -n "${ANDROID_KEYSTORE_B64:-}" ]; then
  KEYSTORE="$(mktemp -t ose-keystore.XXXXXX.jks)"
  trap 'rm -f "$KEYSTORE"' EXIT
  printf '%s' "$ANDROID_KEYSTORE_B64" | base64 -d > "$KEYSTORE"
  KEYALIAS="${KEYALIAS:?ANDROID_KEYSTORE_B64 sans KEYALIAS}"
  STOREPASS="${STOREPASS:?ANDROID_KEYSTORE_B64 sans STOREPASS}"
  KEYPASS="${KEYPASS:-$STOREPASS}"
else
  KEYSTORE="${KEYSTORE:-$HOME/.android/debug.keystore}"
  KEYALIAS="${KEYALIAS:-androiddebugkey}"
  STOREPASS="${STOREPASS:-android}"
  if [ ! -f "$KEYSTORE" ]; then
    mkdir -p "$(dirname "$KEYSTORE")"
    keytool -genkeypair -keystore "$KEYSTORE" -alias "$KEYALIAS" \
      -storepass "$STOREPASS" -keypass "$STOREPASS" \
      -keyalg RSA -keysize 2048 -validity 10000 \
      -dname "CN=Open Solar Energy Debug, O=OpenSolarEnergy, C=FR" >/dev/null
  fi
fi

BT="$SDK_ROOT/build-tools/$BUILD_TOOLS_VER"
"$BT/zipalign" -f -p 4 "$UNSIGNED" "$ROOT/build-android/aligned.apk"
"$BT/apksigner" sign \
  --ks "$KEYSTORE" --ks-key-alias "$KEYALIAS" \
  --ks-pass "pass:$STOREPASS" --key-pass "pass:${KEYPASS:-$STOREPASS}" \
  --out "$OUT" "$ROOT/build-android/aligned.apk"
"$BT/apksigner" verify "$OUT"

echo "APK signé : $OUT  (v$VERSION_NAME, code $VERSION_CODE)"

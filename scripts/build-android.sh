#!/usr/bin/env bash
set -euo pipefail

# Chemins locaux courants (override via env)
if [ -d "${HOME}/android-sdk" ] && [ -z "${SDK_ROOT:-}" ]; then
  SDK_ROOT="${HOME}/android-sdk"
elif [ -d "${HOME}/Android/Sdk" ] && [ -z "${SDK_ROOT:-}" ]; then
  SDK_ROOT="${HOME}/Android/Sdk"
fi
SDK_ROOT="${SDK_ROOT:-$HOME/Android/Sdk}"

# NDK : préfère la version demandée, sinon le premier NDK installé
NDK_VER="${NDK_VER:-}"
if [ -z "$NDK_VER" ]; then
  if [ -d "$SDK_ROOT/ndk/26.1.10909125" ]; then
    NDK_VER="26.1.10909125"
  elif [ -d "$SDK_ROOT/ndk" ]; then
    NDK_VER="$(ls -1 "$SDK_ROOT/ndk" | sort -V | tail -1)"
  else
    NDK_VER="26.1.10909125"
  fi
fi

QT_VER="${QT_VER:-6.8.2}"
QT_ROOT="${QT_ROOT:-$HOME/Qt}"
QT_ANDROID="${QT_ANDROID:-$QT_ROOT/$QT_VER/android_arm64_v8a}"
QT_HOST="${QT_HOST:-$QT_ROOT/$QT_VER/gcc_64}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${OUT:-$ROOT/opensolarenergy-arm64.apk}"

VERSION_NAME="${VERSION_NAME:-2.0.75}"
VERSION_CODE="${VERSION_CODE:-20075}"

# Dépendances Android (OpenSSL KDAB + secp256k1)
if [ ! -f "$ROOT/third_party/android_openssl/android_openssl.cmake" ]; then
  git clone --depth 1 https://github.com/KDAB/android_openssl.git \
    "$ROOT/third_party/android_openssl"
fi
if [ ! -f "$ROOT/third_party/secp256k1/include/secp256k1.h" ]; then
  git clone --depth 1 --branch v0.5.1 https://github.com/bitcoin-core/secp256k1.git \
    "$ROOT/third_party/secp256k1"
fi

export ANDROID_SDK_ROOT="$SDK_ROOT"
export ANDROID_NDK_ROOT="${ANDROID_NDK_ROOT:-$SDK_ROOT/ndk/$NDK_VER}"
if [ -d /usr/lib/jvm/java-17-openjdk-amd64 ]; then
  export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
elif [ -d /usr/lib/jvm/java-21-openjdk-amd64 ]; then
  export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
fi

echo "SDK=$SDK_ROOT"
echo "NDK=$ANDROID_NDK_ROOT"
echo "QT_ANDROID=$QT_ANDROID"
echo "JAVA_HOME=${JAVA_HOME:-}"

[ -x "$QT_ANDROID/bin/qt-cmake" ] || {
  echo "Qt Android manquant : $QT_ANDROID" >&2
  echo "Installer : aqt install-qt all_os android $QT_VER android_arm64_v8a -m qtcharts qtquick3d qtshadertools qtquicktimeline -O \$HOME/Qt" >&2
  exit 1
}
[ -d "$ANDROID_NDK_ROOT" ] || { echo "NDK manquant : $ANDROID_NDK_ROOT" >&2; exit 1; }

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

BUILD_TOOLS_VER="${BUILD_TOOLS_VER:-}"
if [ -z "$BUILD_TOOLS_VER" ]; then
  BUILD_TOOLS_VER="$(ls -1 "$SDK_ROOT/build-tools" | sort -V | tail -1)"
fi

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

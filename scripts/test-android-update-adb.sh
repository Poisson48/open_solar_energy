#!/usr/bin/env bash
# scripts/test-android-update-adb.sh — smoke MAJ sur téléphone branché (adb).
# Usage :
#   OLD_APK=.../opensolarenergy-v2.0.59-arm64.apk \
#   NEW_APK=.../opensolarenergy-v2.0.60-arm64.apk \
#   bash scripts/test-android-update-adb.sh
set -euo pipefail

PKG=org.opensolarenergy.app
OLD_APK="${OLD_APK:?définir OLD_APK}"
NEW_APK="${NEW_APK:?définir NEW_APK}"

command -v adb >/dev/null || { echo "adb requis" >&2; exit 1; }
adb get-state >/dev/null

echo "== Install ancienne version =="
adb install -r -d "$OLD_APK"
OLD_CODE=$(adb shell dumpsys package "$PKG" | awk -F= '/versionCode=/{print $2; exit}' | tr -d '\r')
OLD_NAME=$(adb shell dumpsys package "$PKG" | awk -F= '/versionName=/{print $2; exit}' | tr -d '\r')
echo "Installé : $OLD_NAME (code $OLD_CODE)"

echo "== Install nouvelle version par-dessus (-r) =="
adb install -r "$NEW_APK"
NEW_CODE=$(adb shell dumpsys package "$PKG" | awk -F= '/versionCode=/{print $2; exit}' | tr -d '\r')
NEW_NAME=$(adb shell dumpsys package "$PKG" | awk -F= '/versionName=/{print $2; exit}' | tr -d '\r')
echo "Après MAJ : $NEW_NAME (code $NEW_CODE)"

if [ -n "$OLD_CODE" ] && [ -n "$NEW_CODE" ] && [ "$NEW_CODE" -gt "$OLD_CODE" ]; then
  echo "OK — versionCode a bien augmenté ($OLD_CODE → $NEW_CODE)"
else
  echo "ÉCHEC — versionCode n’a pas augmenté (old=$OLD_CODE new=$NEW_CODE)" >&2
  exit 1
fi

echo
echo "Ensuite tester dans l’app : hub → Mettre à jour (téléchargement + écran confirmation)."
echo "Logs : adb logcat -s OSE-Platform:I OSE-Activity:I"

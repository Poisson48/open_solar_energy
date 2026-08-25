#!/usr/bin/env bash
# Clé de publication Android — une fois pour toutes (signature stable).
set -euo pipefail

OUT="${OUT:-$HOME/opensolarenergy-release.jks}"
ALIAS="${ALIAS:-opensolarenergy}"

if [ -f "$OUT" ]; then
  echo "Keystore existant : $OUT" >&2
  exit 1
fi

STOREPASS="$(head -c 48 /dev/urandom | base64 | tr -d '/+=' | cut -c1-32)"
keytool -genkeypair \
  -keystore "$OUT" -alias "$ALIAS" \
  -storepass "$STOREPASS" -keypass "$STOREPASS" \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Open Solar Energy, O=OpenSolarEnergy, C=FR" >/dev/null
chmod 600 "$OUT"

cat <<EOF
Keystore : $OUT  (alias $ALIAS)
Mot de passe : $STOREPASS

gh secret set ANDROID_KEYSTORE_B64 --body "\$(base64 -w0 "$OUT")"
gh secret set ANDROID_KEY_ALIAS --body "$ALIAS"
gh secret set ANDROID_KEYSTORE_PASS --body "$STOREPASS"
EOF

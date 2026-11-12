#!/usr/bin/env bash
# Empaquette opensolarenergy en AppImage Linux x86-64 (Qt Quick natif, sans WebEngine).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QT_ROOT="${QT_ROOT:-$HOME/Qt/6.8.2/gcc_64}"
VERSION_NAME="${VERSION_NAME:-2.0.114}"
OUT_DIR="${OUT_DIR:-$ROOT}"
BIN="$ROOT/build/src/opensolarenergy"
[ -x "$BIN" ] || BIN="$ROOT/build-qt/src/opensolarenergy"
[ -x "$BIN" ] || BIN="$ROOT/build-qml/src/opensolarenergy"

[ -x "$BIN" ] || { echo "Binaire absent : $BIN" >&2; exit 1; }
[ -x "$QT_ROOT/bin/qmake" ] || { echo "qmake introuvable : $QT_ROOT/bin" >&2; exit 1; }

APPDIR="$ROOT/build/AppDir"
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin" \
         "$APPDIR/usr/share/applications" \
         "$APPDIR/usr/share/icons/hicolor/512x512/apps"

cp "$BIN" "$APPDIR/usr/bin/opensolarenergy"

# Modules Qt optionnels chargés dynamiquement (caméra, PDF, spatial audio).
# linuxdeploy-plugin-qt ne les détecte pas toujours : on les copie avant le scan.
mkdir -p "$APPDIR/usr/lib" "$APPDIR/usr/qml/QtQuick"
for lib in Qt6Multimedia Qt6MultimediaQuick Qt6Pdf Qt6PdfQuick Qt6SpatialAudio Qt6Quick3DSpatialAudio; do
  for f in "$QT_ROOT/lib/lib${lib}.so.6"*; do
    [ -e "$f" ] && cp -a "$f" "$APPDIR/usr/lib/"
  done
done
if [ -d "$QT_ROOT/qml/QtQuick/Pdf" ]; then
  cp -a "$QT_ROOT/qml/QtQuick/Pdf" "$APPDIR/usr/qml/QtQuick/"
fi

if [ -f "$ROOT/packaging/open-solar-energy.png" ]; then
  cp "$ROOT/packaging/open-solar-energy.png" \
     "$APPDIR/usr/share/icons/hicolor/512x512/apps/opensolarenergy.png"
fi

cat > "$APPDIR/usr/share/applications/opensolarenergy.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Open Solar Energy
Comment=Dimensionnement photovoltaïque
Exec=opensolarenergy
Icon=opensolarenergy
Categories=Science;Education;
Terminal=false
EOF

TOOLS="$ROOT/build/appimage-tools"
mkdir -p "$TOOLS"
fetch() {
  local name="$1" url="$2"
  if [ ! -x "$TOOLS/$name" ]; then
    wget -q -O "$TOOLS/$name" "$url"
    chmod +x "$TOOLS/$name"
  fi
}
BASE="https://github.com/linuxdeploy"
fetch linuxdeploy "$BASE/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage"
fetch linuxdeploy-plugin-qt "$BASE/linuxdeploy-plugin-qt/releases/download/continuous/linuxdeploy-plugin-qt-x86_64.AppImage"

export APPIMAGE_EXTRACT_AND_RUN=1
export QML_SOURCES_PATHS="$ROOT/src/qml"
export QMAKE="$QT_ROOT/bin/qmake"
export PATH="$QT_ROOT/bin:$TOOLS:$PATH"
export LD_LIBRARY_PATH="$QT_ROOT/lib:${LD_LIBRARY_PATH:-}"

OUTPUT="OpenSolarEnergy-${VERSION_NAME}-x86_64.AppImage"
export OUTPUT

cd "$ROOT/build"
"$TOOLS/linuxdeploy" \
  --appdir "$APPDIR" \
  --plugin qt \
  --desktop-file "$APPDIR/usr/share/applications/opensolarenergy.desktop" \
  --icon-file "$APPDIR/usr/share/icons/hicolor/512x512/apps/opensolarenergy.png"

# Re-pin les bibliothèques Qt sur celles qui ont servi à compiler le binaire.
# Sans cela, linuxdeploy peut mélanger Qt 6.8 (build) et Qt 6.10 (système),
# ce qui casse QtQuick3D au démarrage.
for f in "$QT_ROOT"/lib/libQt6*.so.6*; do
  [ -e "$f" ] && cp -Lf "$f" "$APPDIR/usr/lib/$(basename "$f")"
done

# OpenSSL runtime : nécessaire au backend TLS de Qt (updater, partage).
# On embarque libssl ET libcrypto de la même version pour éviter un mélange hôte/CI.
for lib in ssl crypto; do
  f="$(ldconfig -p 2>/dev/null | awk -v n="lib${lib}.so.3" '$1 == n { print $NF; exit }')"
  [ -n "$f" ] && [ -e "$f" ] && cp -Lf "$f" "$APPDIR/usr/lib/"
done

fetch appimagetool "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"
# Runtime type2 : téléchargement manuel (évite les 504 appimagetool → GitHub)
RUNTIME="$TOOLS/runtime-x86_64"
if [ ! -f "$RUNTIME" ]; then
  for i in 1 2 3 4 5; do
    if wget -q --timeout=60 -O "$RUNTIME" \
      "https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-x86_64"; then
      break
    fi
    echo "runtime type2 tentatif $i échoué — nouvel essai…"
    rm -f "$RUNTIME"
    sleep $((i * 10))
  done
  [ -f "$RUNTIME" ] || { echo "Échec téléchargement runtime AppImage" >&2; exit 1; }
fi
cd "$ROOT/build"
ARCH=x86_64 "$TOOLS/appimagetool" --runtime-file "$RUNTIME" "$APPDIR" "$OUTPUT"

mkdir -p "$OUT_DIR"
mv "$ROOT/build/$OUTPUT" "$OUT_DIR/$OUTPUT"
echo "AppImage : $OUT_DIR/$OUTPUT"

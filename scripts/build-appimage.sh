#!/usr/bin/env bash
# Empaquette opensolarenergy en AppImage Linux x86-64 (Qt Quick natif, sans WebEngine).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QT_ROOT="${QT_ROOT:-$HOME/Qt/6.8.2/gcc_64}"
VERSION_NAME="${VERSION_NAME:-2.0.0}"
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

OUTPUT="OpenSolarEnergy-${VERSION_NAME}-x86_64.AppImage"
export OUTPUT

cd "$ROOT/build"
"$TOOLS/linuxdeploy" \
  --appdir "$APPDIR" \
  --plugin qt \
  --desktop-file "$APPDIR/usr/share/applications/opensolarenergy.desktop" \
  --icon-file "$APPDIR/usr/share/icons/hicolor/512x512/apps/opensolarenergy.png"

fetch appimagetool "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"
cd "$ROOT/build"
ARCH=x86_64 "$TOOLS/appimagetool" "$APPDIR" "$OUTPUT"

mkdir -p "$OUT_DIR"
mv "$ROOT/build/$OUTPUT" "$OUT_DIR/$OUTPUT"
echo "AppImage : $OUT_DIR/$OUTPUT"

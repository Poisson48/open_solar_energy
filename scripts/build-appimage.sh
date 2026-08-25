#!/usr/bin/env bash
# Empaquette opensolarenergy en AppImage Linux x86-64 (Qt + web embarqué).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QT_ROOT="${QT_ROOT:-$HOME/Qt/6.8.2/gcc_64}"
VERSION_NAME="${VERSION_NAME:-2.0.0}"
OUT_DIR="${OUT_DIR:-$ROOT}"
BIN="$ROOT/build/src/opensolarenergy"
[ -x "$BIN" ] || BIN="$ROOT/build-qt/src/opensolarenergy"
WEB_DST="$ROOT/build/AppDir/usr/share/opensolarenergy/web"

[ -x "$BIN" ] || { echo "Binaire absent : $BIN" >&2; exit 1; }
[ -x "$QT_ROOT/bin/qmake" ] || { echo "qmake introuvable : $QT_ROOT/bin" >&2; exit 1; }

APPDIR="$ROOT/build/AppDir"
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin" \
         "$APPDIR/usr/share/applications" \
         "$APPDIR/usr/share/icons/hicolor/512x512/apps" \
         "$(dirname "$WEB_DST")"

cp "$BIN" "$APPDIR/usr/bin/opensolarenergy"
mkdir -p "$WEB_DST"
rsync -a --exclude build --exclude build-qt --exclude build-android --exclude node_modules --exclude dist \
  "$ROOT/index.html" "$ROOT/css" "$ROOT/js" "$ROOT/data" "$ROOT/packaging" "$WEB_DST/"

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
  --output appimage \
  --desktop-file "$APPDIR/usr/share/applications/opensolarenergy.desktop" \
  --icon-file "$APPDIR/usr/share/icons/hicolor/512x512/apps/opensolarenergy.png"

mkdir -p "$OUT_DIR"
mv "$ROOT/build/$OUTPUT" "$OUT_DIR/$OUTPUT"
echo "AppImage : $OUT_DIR/$OUTPUT"

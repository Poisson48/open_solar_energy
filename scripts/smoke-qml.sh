#!/usr/bin/env bash
# Smoke QML natif : build + ctest + --self-test
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="${OSE_BUILD_DIR:-$ROOT/build-qml}"
cd "$ROOT"

BOLD="\033[1m"; GREEN="\033[32m"; RED="\033[31m"; CYAN="\033[36m"; RESET="\033[0m"
FAIL=0
log() { echo -e " ${CYAN}▸${RESET} $*"; }
ok()  { echo -e " ${GREEN}✓${RESET} $*"; }
err() { echo -e " ${RED}✗${RESET} $*"; FAIL=1; }

echo ""
echo -e " ${BOLD}Open Solar Energy — smoke QML${RESET}"

log "Configure + build ($BUILD)…"
if cmake -S "$ROOT" -B "$BUILD" -G Ninja -DCMAKE_BUILD_TYPE=Debug \
   && cmake --build "$BUILD" -j"$(nproc)"; then
  ok "Build OK"
else
  err "Build FAILED"
  exit 1
fi

log "ctest…"
if ctest --test-dir "$BUILD" --output-on-failure; then
  ok "ctest OK"
else
  err "ctest FAILED"
fi

BIN="$BUILD/src/opensolarenergy"
log "Self-test headless…"
if "$BIN" --self-test; then
  ok "self-test PASS"
else
  err "self-test FAIL"
fi

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
mkdir -p "$ROOT/validation"
cat > "$ROOT/validation/last-smoke.json" <<EOF
{"timestamp":"$TS","fail":$FAIL,"build":"$BUILD","mode":"qml-smoke"}
EOF

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo -e " ${GREEN}${BOLD}Smoke OK${RESET}"
  exit 0
else
  echo -e " ${RED}${BOLD}Smoke FAILED${RESET}"
  exit 1
fi

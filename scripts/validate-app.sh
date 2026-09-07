#!/usr/bin/env bash
# Validation Open Solar Energy — build Qt + ctest + self-test
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p validation

BOLD="\033[1m"; GREEN="\033[32m"; RED="\033[31m"; CYAN="\033[36m"; RESET="\033[0m"
FAIL=0

log() { echo -e " ${CYAN}▸${RESET} $*"; }
ok()  { echo -e " ${GREEN}✓${RESET} $*"; }
err() { echo -e " ${RED}✗${RESET} $*"; FAIL=1; }

echo ""
echo -e " ${BOLD}Open Solar Energy — validation (QML natif)${RESET}"
echo -e " ${CYAN}────────────────────────────────${RESET}"

BUILD="$ROOT/build-qt"
log "Configure + build…"
if cmake -S "$ROOT" -B "$BUILD" -G Ninja -DCMAKE_BUILD_TYPE=Debug \
   && cmake --build "$BUILD" -j"$(nproc)"; then
  ok "Build OK"
else
  err "Build FAILED"
fi

log "ctest…"
if ctest --test-dir "$BUILD" --output-on-failure; then
  ok "Tests OK"
else
  err "Tests FAILED"
fi

log "self-test…"
if [ -x "$BUILD/src/opensolarenergy" ] && "$BUILD/src/opensolarenergy" --self-test; then
  ok "Self-test OK"
else
  err "Self-test FAILED"
fi

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > validation/last-run.json <<EOF
{"timestamp":"$TS","fail":$FAIL,"root":"$ROOT","mode":"qml-native","selftest":true}
EOF

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo -e " ${GREEN}${BOLD}Validation OK${RESET}"
  exit 0
else
  echo -e " ${RED}${BOLD}Validation FAILED${RESET}"
  exit 1
fi

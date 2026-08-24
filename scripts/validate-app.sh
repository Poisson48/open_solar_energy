#!/usr/bin/env bash
# Validation complète Open Solar Energy — une passe
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
echo -e " ${BOLD}Open Solar Energy — validation${RESET}"
echo -e " ${CYAN}────────────────────────────────${RESET}"

# 1. Tests math
log "Tests mathématiques…"
if node tests/run_math_tests.js; then
  ok "Math OK"
else
  err "Math FAILED"
fi

# 2. Smoke HTTP
log "Smoke HTTP (index.html)…"
PORT=8765
python3 -m http.server "$PORT" &>/dev/null &
HTTP_PID=$!
trap 'kill $HTTP_PID 2>/dev/null || true' EXIT

for i in {1..10}; do
  if curl -sf "http://127.0.0.1:$PORT/index.html" | grep -q 'Open Solar Energy'; then
    ok "HTTP OK"
    break
  fi
  sleep 0.3
  if [ "$i" -eq 10 ]; then err "HTTP FAILED"; fi
done

# 3. Scripts chargés dans le bon ordre
log "Ordre des scripts…"
if grep -q 'bindings.js' index.html && grep -A1 'bindings.js' index.html | grep -q 'main.js'; then
  ok "bindings.js avant main.js"
else
  LAST_BIND=$(grep -n 'bindings.js' index.html | tail -1 | cut -d: -f1)
  LAST_MAIN=$(grep -n 'main.js' index.html | tail -1 | cut -d: -f1)
  if [ -n "$LAST_BIND" ] && [ -n "$LAST_MAIN" ] && [ "$LAST_BIND" -lt "$LAST_MAIN" ]; then
    ok "Ordre scripts OK"
  else
    err "Ordre scripts incorrect"
  fi
fi

# 4. Enedis parsePuissances30min branché
log "Parser Enedis ZIP…"
if grep -q 'parseZipCsv' js/enedis_import.js && grep -q 'parsePuissances30min' js/enedis_import.js; then
  ok "parsePuissances30min branché"
else
  err "Parser Enedis ZIP manquant"
fi

# 5. Build Qt applib (optionnel)
if command -v cmake &>/dev/null && [ -f CMakeLists.txt ]; then
  log "Build Qt (applib)…"
  if cmake -S "$ROOT" -B "$ROOT/build-qt" -G Ninja -DCMAKE_BUILD_TYPE=Release 2>/dev/null \
     && cmake --build "$ROOT/build-qt" --target applib -j"$(nproc)" 2>/dev/null; then
    ok "applib Qt OK"
  else
    log "Build Qt ignoré (installez Qt WebEngine/WebView pour l'app complète)"
  fi
fi

# Rapport JSON
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > validation/last-run.json <<EOF
{"timestamp":"$TS","math_fail":$FAIL,"root":"$ROOT"}
EOF

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo -e " ${GREEN}${BOLD}Validation OK${RESET}"
  exit 0
else
  echo -e " ${RED}${BOLD}Validation FAILED${RESET}"
  exit 1
fi

#!/usr/bin/env bash
# Boucle de validation — intervalle en secondes (défaut 600 = 10 min)
set -euo pipefail

INTERVAL="${1:-600}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Boucle validation Open Solar Energy — toutes les ${INTERVAL}s"
echo "Ctrl+C pour arrêter"

while true; do
  echo ""
  echo "══ $(date '+%Y-%m-%d %H:%M:%S') ══"
  if "$ROOT/scripts/validate-app.sh"; then
    echo "AGENT_LOOP_TICK_ose_validate {\"prompt\":\"Exécuter ./scripts/validate-app.sh et corriger toute régression détectée dans Open Solar Energy. Puis mettre à jour docs/PLAN-VALIDATION-QT.md si des bugs sont corrigés.\",\"status\":\"ok\"}"
  else
    echo "AGENT_LOOP_TICK_ose_validate {\"prompt\":\"ÉCHEC validation Open Solar Energy. Lire validation/last-run.json, ./scripts/validate-app.sh, corriger les régressions (math, Enedis, HTTP), relancer validate-app.sh jusqu'à OK.\",\"status\":\"fail\"}"
  fi
  sleep "$INTERVAL"
done

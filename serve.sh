#!/usr/bin/env bash
set -euo pipefail

PORT=8080
URL="http://localhost:$PORT"

# ── couleurs ──────────────────────────────────────────────────────────────────
BOLD="\033[1m"; CYAN="\033[36m"; GREEN="\033[32m"; YELLOW="\033[33m"; RESET="\033[0m"

echo ""
echo -e " ${BOLD}${CYAN}⚡ Open Solar Energy${RESET}"
echo -e " ${CYAN}────────────────────────────────────────${RESET}"

# ── Python ────────────────────────────────────────────────────────────────────
if command -v python3 &>/dev/null; then
    PYTHON=python3
elif command -v python &>/dev/null; then
    PYTHON=python
else
    echo -e " ${YELLOW}Erreur : python3 ou python introuvable.${RESET}"
    echo " Installez Python 3 : https://www.python.org/downloads/"
    exit 1
fi

# ── port libre ? ──────────────────────────────────────────────────────────────
if ss -tnlp 2>/dev/null | grep -q ":$PORT " || \
   lsof -iTCP:"$PORT" -sTCP:LISTEN &>/dev/null 2>&1; then
    echo -e " ${YELLOW}Port $PORT déjà utilisé.${RESET} Fermer le processus existant ou modifier PORT dans ce script."
    exit 1
fi

# ── démarrage ─────────────────────────────────────────────────────────────────
cleanup() {
    echo ""
    echo -e " ${CYAN}Serveur arrêté.${RESET}"
    kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$(dirname "$0")"
$PYTHON -m http.server "$PORT" &>/dev/null &
SERVER_PID=$!

# attendre que le serveur réponde (max 3s)
for i in {1..6}; do
    sleep 0.5
    if $PYTHON -c "import urllib.request; urllib.request.urlopen('$URL')" &>/dev/null 2>&1; then
        break
    fi
done

echo -e " ${GREEN}Serveur démarré${RESET} → ${BOLD}$URL${RESET}"
echo -e " ${CYAN}────────────────────────────────────────${RESET}"
echo -e " Appuyez sur ${BOLD}Ctrl+C${RESET} pour arrêter"
echo ""

# ── ouvrir le navigateur ──────────────────────────────────────────────────────
if command -v xdg-open &>/dev/null; then
    xdg-open "$URL" &>/dev/null &
elif command -v sensible-browser &>/dev/null; then
    sensible-browser "$URL" &>/dev/null &
fi

wait "$SERVER_PID"

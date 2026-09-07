#!/usr/bin/env bash
# Ancien serveur web — l’app produit est Qt/QML.
# Sert la landing Pages (docs/) ou l’archive legacy-web.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-8080}"

if [ -d "$ROOT/docs" ] && [ -f "$ROOT/docs/index.html" ]; then
  DIR="$ROOT/docs"
  echo "Landing Pages : http://localhost:$PORT/"
elif [ -d "$ROOT/docs/legacy-web" ]; then
  DIR="$ROOT/docs/legacy-web"
  echo "Archive web (legacy) : http://localhost:$PORT/"
else
  echo "Rien à servir. Compilez l’app Qt : cmake -S . -B build && cmake --build build" >&2
  exit 1
fi

cd "$DIR"
exec python3 -m http.server "$PORT"

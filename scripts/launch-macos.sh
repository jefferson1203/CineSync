#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST="127.0.0.1"
PORT="${PORT:-3000}"
URL="http://${HOST}:${PORT}"
LOG_DIR="${APP_DIR}/logs"
mkdir -p "$LOG_DIR"

# 1. Vérifier si une instance CineStudio AI est déjà active
if curl -fsS "${URL}/api/health" >/dev/null 2>&1; then
  echo "CineStudio AI est déjà actif sur ${URL}. Ouverture du navigateur..."
  open "$URL"
  exit 0
fi

echo "Démarrage du serveur local CineStudio AI sur ${URL}..."
cd "$APP_DIR"

# Lancer en mode production si dist/ existe, sinon en mode développement tsx
if [ -d "${APP_DIR}/dist" ]; then
  NODE_ENV=production HOST="$HOST" PORT="$PORT" nohup npx tsx server.ts >> "${LOG_DIR}/launcher.log" 2>&1 &
else
  HOST="$HOST" PORT="$PORT" nohup npx tsx server.ts >> "${LOG_DIR}/launcher.log" 2>&1 &
fi

# 2. Attendre que le serveur réponde sur 127.0.0.1
for i in $(seq 1 30); do
  if curl -fsS "${URL}/api/health" >/dev/null 2>&1; then
    echo "Serveur prêt. Ouverture automatique de CineStudio AI..."
    open "$URL"
    exit 0
  fi
  sleep 0.5
done

echo "Le serveur n'a pas répondu dans le délai imparti. Consultez ${LOG_DIR}/launcher.log"
exit 1

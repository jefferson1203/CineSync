#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LAUNCHER="${APP_DIR}/scripts/launch-macos.sh"
TARGET_APP="$HOME/Desktop/CineStudio AI.app"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "Ce script doit être exécuté sur macOS pour compiler CineStudio AI.app."
  exit 1
fi

chmod +x "$LAUNCHER"

osacompile -o "$TARGET_APP" -e "do shell script \"/bin/bash '\" & \"$LAUNCHER\" & \"' >/dev/null 2>&1 &\""

echo "Raccourci natif créé : $TARGET_APP"
echo "Vous pouvez le glisser dans votre dossier /Applications ou votre Dock."

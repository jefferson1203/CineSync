#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Installation de CineStudio AI sur macOS ==="
cd "$APP_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Erreur : Node.js (v20+) est requis. Installez-le via https://nodejs.org ou 'brew install node'."
  exit 1
fi

echo "1/3 Installation des dépendances npm..."
npm install

echo "2/3 Compilation de l'interface frontend..."
npm run build

echo "3/3 Attribution des permissions d'exécution aux scripts macOS..."
chmod +x "$APP_DIR/scripts/launch-macos.sh" \
         "$APP_DIR/scripts/setup-keychain-macos.sh" \
         "$APP_DIR/scripts/create-macos-app.sh"

echo ""
echo "Installation terminée avec succès."
echo "Prochaines étapes :"
echo "  1. Configurez votre clé Google dans le Trousseau macOS : ./scripts/setup-keychain-macos.sh"
echo "  2. Créez le raccourci CineStudio AI.app sur le Bureau : ./scripts/create-macos-app.sh"
echo "  3. Ou lancez directement : ./scripts/launch-macos.sh"

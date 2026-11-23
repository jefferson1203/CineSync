#!/usr/bin/env bash
set -euo pipefail

SERVICE="CineStudioAI"
ACCOUNT="gemini_api_key"

echo "=== Configuration sécurisée de la clé API Google Gemini (macOS) ==="
echo "La clé ne sera jamais enregistrée dans le projet ni dans le navigateur."
echo ""
read -rsp "Collez votre clé API Google Gemini (saisie masquée) : " API_KEY
echo ""

if [ -z "$API_KEY" ]; then
  echo "Aucune clé saisie. Opération annulée."
  exit 1
fi

if [[ "$(uname)" == "Darwin" ]] && command -v security >/dev/null 2>&1; then
  security add-generic-password -U -s "$SERVICE" -a "$ACCOUNT" -w "$API_KEY"
  echo "Clé enregistrée de manière sécurisée dans le Trousseau d'accès macOS (service: $SERVICE)."
else
  CONFIG_DIR="$HOME/.cinestudio-ai"
  CONFIG_FILE="$CONFIG_DIR/credentials.json"
  mkdir -p "$CONFIG_DIR"
  chmod 700 "$CONFIG_DIR"
  printf '{"geminiApiKey":"%s"}\n' "$API_KEY" > "$CONFIG_FILE"
  chmod 600 "$CONFIG_FILE"
  echo "Trousseau macOS indisponible : clé enregistrée dans $CONFIG_FILE (permissions strictes 0600)."
fi

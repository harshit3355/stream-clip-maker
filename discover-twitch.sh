#!/usr/bin/env bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="config/private/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Falta config/private/.env. Copia .env.example a config/private/.env y añade tus credenciales de Twitch."
  exit 2
fi
set -a
source "$ENV_FILE"
set +a
exec node discover-twitch.mjs "$@"

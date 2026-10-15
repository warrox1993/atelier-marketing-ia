#!/usr/bin/env bash
# Lance l'instance Paperclip locale de l'Atelier Marketing IA au premier plan.
# Chemin documenté par Paperclip : « pnpm paperclipai run » (onboarding
# automatique si la configuration manque, doctor, puis démarrage du serveur).
# Voir paperclip/docs/deploy/local-development.md.
# Arrêt : Ctrl+C dans ce terminal, ou scripts/arreter-instance.sh.
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FICHIER_ENV="${RACINE}/config/atelier.env"
SOCLE="${RACINE}/paperclip"

if [[ ! -f "${FICHIER_ENV}" ]]; then
  echo "Fichier ${FICHIER_ENV} absent : copiez config/atelier.env.example." >&2
  exit 1
fi
# Validation de la configuration (variables, plages, boucle locale, aucun secret).
"${RACINE}/scripts/verifier-config.sh" "${FICHIER_ENV}" || exit 1
if [[ ! -d "${SOCLE}/node_modules" ]]; then
  echo "Dépendances absentes : lancez scripts/preparer-socle.sh d'abord." >&2
  exit 1
fi

# Charge les variables documentées (aucun secret dans ce fichier).
set -a
# shellcheck disable=SC1090
source "${FICHIER_ENV}"
set +a

mkdir -p "${PAPERCLIP_HOME}"

# Refuse de démarrer si le port est déjà pris (évite deux serveurs sur la même
# instance, ce que la doc de mise à jour interdit).
if ss -ltn "sport = :${PORT}" 2>/dev/null | grep -q LISTEN; then
  echo "Le port ${PORT} est déjà utilisé : instance déjà lancée ?" >&2
  exit 1
fi

cd "${SOCLE}" || exit 1
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

CONFIG="${PAPERCLIP_HOME}/instances/${PAPERCLIP_INSTANCE_ID}/config.json"
if [[ ! -f "${CONFIG}" ]]; then
  # Premier lancement : onboarding « quickstart » (loopback, local_trusted),
  # sans service système, puis démarrage immédiat (cli/src/commands/onboard.ts).
  exec pnpm paperclipai onboard --yes --no-install-service "$@"
fi
# Lancements suivants. --no-repair : le diagnostic signale sans rien modifier.
exec pnpm paperclipai run --no-repair "$@"

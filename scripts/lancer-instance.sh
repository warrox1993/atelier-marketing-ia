#!/usr/bin/env bash
# Lance l'instance Paperclip locale de l'Atelier Marketing IA au premier plan.
# Chemin documenté par Paperclip : « pnpm paperclipai run » (onboarding
# automatique si la configuration manque, doctor, puis démarrage du serveur).
# Voir paperclip/docs/deploy/local-development.md.
# Arrêt : Ctrl+C dans ce terminal, ou scripts/arreter-instance.sh.
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FICHIER_ENV="${RACINE}/config/atelier.env"
# Surcharge facultative pour l'accès à distance (tailscale serve) : chargée APRÈS atelier.env.
FICHIER_DISTANT="${RACINE}/config/atelier-distant.env"
SOCLE="${RACINE}/paperclip"

if [[ ! -f "${FICHIER_ENV}" ]]; then
  echo "Fichier ${FICHIER_ENV} absent : copiez config/atelier.env.example." >&2
  exit 1
fi
# Validation de la configuration (variables, plages, boucle locale, aucun secret).
"${RACINE}/scripts/verifier-config.sh" "${FICHIER_ENV}" || exit 1
if [[ -f "${FICHIER_DISTANT}" ]]; then
  "${RACINE}/scripts/verifier-config.sh" --distant "${FICHIER_DISTANT}" || exit 1
fi
if [[ ! -d "${SOCLE}/node_modules" ]]; then
  echo "Dépendances absentes : lancez scripts/preparer-socle.sh d'abord." >&2
  exit 1
fi

# Charge les variables documentées (aucun secret dans ce fichier).
set -a
# shellcheck disable=SC1090
source "${FICHIER_ENV}"
if [[ -f "${FICHIER_DISTANT}" ]]; then
  echo "Surcharge d'accès à distance chargée : ${FICHIER_DISTANT}"
  # Jamais de « source » : le fichier a été validé ligne à ligne (liste blanche de clés) par
  # verifier-config.sh --distant ; on n'exporte ici que les paires CLE=valeur, une à une.
  while IFS= read -r ligne_distante || [[ -n "${ligne_distante}" ]]; do
    [[ "${ligne_distante}" =~ ^[[:space:]]*$ || "${ligne_distante}" =~ ^[[:space:]]*# ]] && continue
    if [[ ! "${ligne_distante}" =~ ^[A-Z_]+=[^\$\`\;\|\&]*$ ]]; then
      echo "Ligne inattendue dans ${FICHIER_DISTANT} : démarrage refusé." >&2
      exit 1
    fi
    export "${ligne_distante%%=*}=${ligne_distante#*=}"
  done < "${FICHIER_DISTANT}"
fi
set +a

# Refuse de démarrer si l'instance est déjà publiée sur le tailnet (tailscale serve) alors que la
# surcharge distante (mode authentifié) est absente : ce serait un accès sans authentification.
if command -v tailscale >/dev/null 2>&1 && [[ ! -f "${FICHIER_DISTANT}" ]]; then
  if tailscale serve status 2>/dev/null | grep -Eq "(127\.0\.0\.1|localhost):${PORT}([^0-9]|$)"; then
    echo "Instance publiée sur le tailnet sans authentification : \`tailscale serve\` redirige déjà vers le port ${PORT} alors que ${FICHIER_DISTANT} est absent." >&2
    echo "Lancer \`sudo tailscale serve reset\` ou rétablir la surcharge distante (config/atelier-distant.env). Démarrage refusé." >&2
    exit 1
  fi
fi

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

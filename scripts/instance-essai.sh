#!/usr/bin/env bash
# Instance Paperclip d'ESSAI isolée, pour tester sans toucher l'instance
# principale (« atelier », port 3100) qu'un autre lot peut utiliser.
# Même socle, même code patché, mêmes réglages documentés (config/atelier.env),
# mais identifiant d'instance, port HTTP et port PostgreSQL embarqué dédiés.
#
# Usage :
#   scripts/instance-essai.sh demarrer <id> <port> <port_pg>   (premier plan)
#   scripts/instance-essai.sh arreter  <id> <port> <port_pg>
# Exemple : scripts/instance-essai.sh demarrer atelier-lota 3120 54349
# Données : instance/instances/<id>/ (supprimables instance arrêtée).
set -uo pipefail

ACTION="${1:-}"; ID="${2:-}"; PORT_HTTP="${3:-}"; PORT_PG="${4:-}"
if [[ -z "${ACTION}" || -z "${ID}" || -z "${PORT_HTTP}" || -z "${PORT_PG}" ]]; then
  echo "Usage : $0 demarrer|arreter <id> <port> <port_pg>" >&2; exit 2
fi
if [[ ! "${ID}" =~ ^atelier-[a-z0-9-]+$ || "${ID}" == "atelier" ]]; then
  echo "Identifiant refusé : utiliser atelier-<suffixe> (jamais l'instance principale)." >&2; exit 2
fi

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${ACTION}" == "demarrer" ]]; then
  "${RACINE}/scripts/verifier-config.sh" "${RACINE}/config/atelier.env" >/dev/null || exit 1
fi
set -a
# shellcheck disable=SC1091
source "${RACINE}/config/atelier.env"
set +a
export PAPERCLIP_INSTANCE_ID="${ID}" PORT="${PORT_HTTP}"
DOSSIER="${PAPERCLIP_HOME}/instances/${ID}"
CONFIG="${DOSSIER}/config.json"

pid_ecoute() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }

case "${ACTION}" in
  demarrer)
    if [[ -n "$(pid_ecoute "${PORT_HTTP}")" || -n "$(pid_ecoute "${PORT_PG}")" ]]; then
      echo "Port ${PORT_HTTP} ou ${PORT_PG} déjà utilisé (reste d'une instance ? « $0 arreter ${ID} ${PORT_HTTP} ${PORT_PG} » nettoie un arrêt incomplet)." >&2; exit 1
    fi
    mkdir -p "${DOSSIER}"
    if [[ ! -f "${CONFIG}" ]]; then
      # Configuration calquée sur l'onboarding « quickstart » de l'instance
      # principale, avec chemins et ports propres à l'instance d'essai.
      python3 -I - "${PAPERCLIP_HOME}/instances/atelier/config.json" "${CONFIG}" "${DOSSIER}" "${PORT_HTTP}" "${PORT_PG}" <<'PY'
import json, sys
source, cible, dossier, port, port_pg = sys.argv[1:6]
c = json.load(open(source))
ancien = c["database"]["embeddedPostgresDataDir"].rsplit("/db", 1)[0]
texte = json.dumps(c).replace(ancien, dossier)
c = json.loads(texte)
c["database"]["embeddedPostgresPort"] = int(port_pg)
c["server"]["port"] = int(port)
c["$meta"]["source"] = "configure"  # valeurs permises : onboard, configure, doctor
json.dump(c, open(cible, "w"), indent=2)
PY
      chmod 600 "${CONFIG}"
    fi
    # Secret de signature des approbations d'actions d'outils (« Ask first ») : l'onboarding
    # de l'instance principale le crée, le diagnostic lancé par « run » ne le crée pas.
    # Sans lui, une action soumise à approbation échoue en 500 (signing_secret_unconfigured,
    # paperclip/doc/MCP-RUNTIME-OPERATIONS.md). Propre à cette instance, jamais affiché.
    ENV_INSTANCE="${DOSSIER}/.env"
    if ! grep -q '^PAPERCLIP_TOOL_ACTION_SIGNING_SECRET=' "${ENV_INSTANCE}" 2>/dev/null; then
      ( umask 077; printf 'PAPERCLIP_TOOL_ACTION_SIGNING_SECRET=%s\n' "$(openssl rand -hex 32)" >> "${ENV_INSTANCE}" )
    fi
    cd "${RACINE}/paperclip" || exit 1
    export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
    # Sans --no-repair : le diagnostic crée les fichiers propres à cette instance
    # (secrets JWT, clé maîtresse) dans son seul dossier.
    exec pnpm paperclipai run
    ;;
  arreter)
    # Arrêt complet (serveur ET PostgreSQL embarqué), y compris pendant un démarrage ou après un
    # arrêt incomplet : voir scripts/lib-arret-instance.sh.
    # shellcheck disable=SC1091
    source "${RACINE}/scripts/lib-arret-instance.sh"
    arreter_instance "${ID}" "${PORT_HTTP}" "${PORT_PG}" "${DOSSIER}/db" "${RACINE}"
    exit $?
    ;;
  *) echo "Action inconnue : ${ACTION}" >&2; exit 2 ;;
esac

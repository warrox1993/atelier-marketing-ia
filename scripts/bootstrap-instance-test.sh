#!/usr/bin/env bash
# Instance Paperclip d'ESSAI du lot B (bootstrap, sauvegarde, restauration), totalement
# isolée : PAPERCLIP_HOME, identifiant d'instance, port HTTP et port PostgreSQL embarqué
# propres, données locales du bootstrap séparées. Ne touche ni à l'instance principale
# (atelier, 3100) ni aux essais des lots A (3120) et C (3140).
# Copie paramétrée de scripts/instance-essai.sh, qui impose PAPERCLIP_HOME (lu dans
# config/atelier.env) et n'accepte pas d'autre dossier.
#
# Usage :
#   scripts/bootstrap-instance-test.sh demarrer   (premier plan : à lancer en arrière-plan)
#   scripts/bootstrap-instance-test.sh arreter
#   scripts/bootstrap-instance-test.sh env        (affiche les variables à exporter pour les scripts)
# Réglages (variables d'environnement, valeurs par défaut) :
#   ATELIER_TEST_ID=atelier-lotb  ATELIER_TEST_PORT=3160  ATELIER_TEST_PORT_PG=54360
#   ATELIER_TEST_HOME=<dépôt>/instance/essai-lotb
set -uo pipefail

ACTION="${1:-}"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ID="${ATELIER_TEST_ID:-atelier-lotb}"
PORT_HTTP="${ATELIER_TEST_PORT:-3160}"
PORT_PG="${ATELIER_TEST_PORT_PG:-54360}"
HOME_TEST="${ATELIER_TEST_HOME:-${RACINE}/instance/essai-lotb}"

if [[ ! "${ID}" =~ ^atelier-[a-z0-9-]+$ || "${ID}" == "atelier" ]]; then
  echo "Identifiant refusé : atelier-<suffixe>, jamais l'instance principale." >&2; exit 2
fi
case "${HOME_TEST}" in
  "${RACINE}/instance/"?*) ;;
  *) echo "ATELIER_TEST_HOME doit être un sous-dossier de ${RACINE}/instance/." >&2; exit 2 ;;
esac
DOSSIER="${HOME_TEST}/instances/${ID}"
CONFIG="${DOSSIER}/config.json"

pid_ecoute() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }

case "${ACTION}" in
  env)
    echo "export ATELIER_API=http://localhost:${PORT_HTTP}/api"
    echo "export PAPERCLIP_HOME='${HOME_TEST}'"
    echo "export PAPERCLIP_INSTANCE_ID='${ID}'"
    echo "export ATELIER_DONNEES_LOCALES='${HOME_TEST}/donnees-locales'"
    ;;
  demarrer)
    set -a
    # shellcheck disable=SC1091
    source "${RACINE}/config/atelier.env"
    set +a
    export PAPERCLIP_HOME="${HOME_TEST}" PAPERCLIP_INSTANCE_ID="${ID}" PORT="${PORT_HTTP}"
    if [[ -n "$(pid_ecoute "${PORT_HTTP}")" || -n "$(pid_ecoute "${PORT_PG}")" ]]; then
      echo "Port ${PORT_HTTP} ou ${PORT_PG} déjà utilisé." >&2; exit 1
    fi
    mkdir -p "${DOSSIER}"
    if [[ ! -f "${CONFIG}" ]]; then
      # Même configuration que l'onboarding « quickstart » de l'instance principale,
      # avec chemins et ports de l'instance d'essai.
      python3 -I - "${RACINE}/instance/instances/atelier/config.json" "${CONFIG}" "${DOSSIER}" "${PORT_HTTP}" "${PORT_PG}" <<'PY'
import json, sys
source, cible, dossier, port, port_pg = sys.argv[1:6]
c = json.load(open(source))
ancien = c["database"]["embeddedPostgresDataDir"].rsplit("/db", 1)[0]
c = json.loads(json.dumps(c).replace(ancien, dossier))
c["database"]["embeddedPostgresPort"] = int(port_pg)
c["server"]["port"] = int(port)
c["$meta"]["source"] = "configure"
json.dump(c, open(cible, "w"), indent=2)
PY
      chmod 600 "${CONFIG}"
    fi
    cd "${RACINE}/paperclip" || exit 1
    export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
    exec pnpm paperclipai run
    ;;
  arreter)
    PID="$(pid_ecoute "${PORT_HTTP}")"
    if [[ -z "${PID}" ]]; then echo "Instance d'essai déjà arrêtée."; exit 0; fi
    ENV_ID="$(tr '\0' '\n' < "/proc/${PID}/environ" 2>/dev/null | grep '^PAPERCLIP_INSTANCE_ID=' | cut -d= -f2-)"
    if [[ "${ENV_ID}" != "${ID}" ]]; then
      echo "Le PID ${PID} n'est pas l'instance ${ID} (trouvé : ${ENV_ID:-inconnu}) : abandon." >&2; exit 1
    fi
    kill -TERM "${PID}"
    for _ in $(seq 1 60); do
      if [[ -z "$(pid_ecoute "${PORT_HTTP}")" && -z "$(pid_ecoute "${PORT_PG}")" ]]; then
        echo "Instance ${ID} arrêtée."; exit 0
      fi
      sleep 1
    done
    echo "L'instance ${ID} ne s'est pas arrêtée en 60 s." >&2; exit 1
    ;;
  *) echo "Usage : $0 demarrer|arreter|env" >&2; exit 2 ;;
esac

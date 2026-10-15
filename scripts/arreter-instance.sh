#!/usr/bin/env bash
# Arrête proprement l'instance Paperclip de l'Atelier Marketing IA (serveur ET PostgreSQL embarqué).
# Méthode : voir scripts/lib-arret-instance.sh. Le serveur à l'écoute reçoit SIGTERM (arrêt gracieux :
# il arrête lui-même son PostgreSQL) ; un démarrage en cours est attendu ; un PostgreSQL resté actif
# sans serveur (arrêt incomplet) est arrêté par son PID vérifié. Jamais de pkill ni de kill -9.
# ATELIER_FICHIER_ENV (facultatif) : autre fichier de réglages que config/atelier.env, pour viser
# une instance d'essai (mêmes variables : PORT, PAPERCLIP_HOME, PAPERCLIP_INSTANCE_ID).
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FICHIER_ENV="${ATELIER_FICHIER_ENV:-${RACINE}/config/atelier.env}"
if [[ ! -r "${FICHIER_ENV}" ]]; then echo "Fichier de réglages illisible : ${FICHIER_ENV}" >&2; exit 2; fi
set -a
# shellcheck disable=SC1090
source "${FICHIER_ENV}"
set +a
# shellcheck disable=SC1091
source "${RACINE}/scripts/lib-arret-instance.sh"

CONFIG="${PAPERCLIP_HOME}/instances/${PAPERCLIP_INSTANCE_ID}/config.json"
# Port PostgreSQL et dossier de données lus dans la configuration de l'instance (défauts de Paperclip sinon).
LECTURE="$(python3 -I -c 'import json,sys
c = json.load(open(sys.argv[1]))["database"]
print(c.get("embeddedPostgresPort", 54329)); print(c.get("embeddedPostgresDataDir", ""))' "${CONFIG}" 2>/dev/null)"
PORT_PG="$(sed -n 1p <<<"${LECTURE}")"; PORT_PG="${PORT_PG:-54329}"
DONNEES_PG="$(sed -n 2p <<<"${LECTURE}")"; DONNEES_PG="${DONNEES_PG:-${PAPERCLIP_HOME}/instances/${PAPERCLIP_INSTANCE_ID}/db}"

arreter_instance "${PAPERCLIP_INSTANCE_ID}" "${PORT}" "${PORT_PG}" "${DONNEES_PG}" "${RACINE}"
exit $?

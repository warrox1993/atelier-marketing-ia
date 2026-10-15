#!/usr/bin/env bash
# Arrête proprement l'instance Paperclip de l'Atelier Marketing IA.
# Méthode : identifier le PID qui écoute sur 127.0.0.1:${PORT}, vérifier que
# c'est bien le serveur lancé depuis ce projet, lui envoyer SIGTERM (arrêt
# gracieux : le serveur arrête lui-même son PostgreSQL embarqué), attendre la
# libération des ports. Jamais de pkill -f.
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FICHIER_ENV="${RACINE}/config/atelier.env"
set -a
# shellcheck disable=SC1090
source "${FICHIER_ENV}"
set +a

PORT_PG="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["database"].get("embeddedPostgresPort",54329))' \
  "${PAPERCLIP_HOME}/instances/${PAPERCLIP_INSTANCE_ID}/config.json" 2>/dev/null || echo 54329)"

pid_ecoute() {
  ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2
}

PID="$(pid_ecoute "${PORT}")"
if [[ -z "${PID}" ]]; then
  echo "Aucun processus n'écoute sur le port ${PORT} : instance déjà arrêtée."
  exit 0
fi

# Vérifie que le processus appartient bien à ce projet (répertoire courant ou
# environnement PAPERCLIP_HOME de l'instance).
CWD_PID="$(readlink -f "/proc/${PID}/cwd" 2>/dev/null || true)"
HOME_PID="$(tr '\0' '\n' < "/proc/${PID}/environ" 2>/dev/null | grep '^PAPERCLIP_HOME=' | cut -d= -f2- || true)"
if [[ "${CWD_PID}" != "${RACINE}"* && "${HOME_PID}" != "${PAPERCLIP_HOME}" ]]; then
  echo "Le PID ${PID} sur le port ${PORT} n'appartient pas à ce projet (cwd=${CWD_PID}) : abandon." >&2
  exit 1
fi

echo "Arrêt gracieux du serveur Paperclip (PID ${PID}, $(ps -o comm= -p "${PID}"))."
kill -TERM "${PID}"

for _ in $(seq 1 60); do
  if [[ -z "$(pid_ecoute "${PORT}")" && -z "$(pid_ecoute "${PORT_PG}")" ]]; then
    echo "Instance arrêtée : ports ${PORT} et ${PORT_PG} libérés."
    exit 0
  fi
  sleep 1
done
echo "L'instance ne s'est pas arrêtée en 60 s. PID restants :" >&2
echo "  serveur : $(pid_ecoute "${PORT}")  postgres : $(pid_ecoute "${PORT_PG}")" >&2
echo "Vérifiez avec : ss -ltnp | grep -E ':(${PORT}|${PORT_PG})'" >&2
exit 1

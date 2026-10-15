#!/usr/bin/env bash
# Lance des fichiers de tests Vitest du serveur Paperclip dans le même
# environnement isolé que le lanceur officiel (scripts/run-vitest-stable.mjs) :
# PAPERCLIP_HOME/CONFIG/INSTANCE_ID et TMPDIR temporaires, un seul worker.
# N'utilise ni l'instance de l'atelier ni ~/.paperclip.
# Usage : scripts/tests-serveur.sh [fichiers…]   (défaut : tests de l'atelier)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOCLE="${RACINE}/paperclip"
BASE_TMP="${BASE_TMP:-/tmp/claude-1000}"
mkdir -p "${BASE_TMP}"
RACINE_TEST="$(mktemp -d "${BASE_TMP}/pv-XXXXXX")"
mkdir -p "${RACINE_TEST}/h" "${RACINE_TEST}/t"

export NODE_ENV=test
export PAPERCLIP_HOME="${RACINE_TEST}/h"
export PAPERCLIP_CONFIG="${RACINE_TEST}/h/config.json"
export PAPERCLIP_INSTANCE_ID="vt-atelier-$$"
export TMPDIR="${RACINE_TEST}/t"
export PAPERCLIP_TELEMETRY_DISABLED=1
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export LC_MESSAGES=C.UTF-8

if [[ $# -eq 0 ]]; then
  set -- server/src/__tests__/atelier-gardes.test.ts
fi

cd "${SOCLE}" || exit 1
# Environnement VIERGE : certains tests natifs vérifient la rédaction des
# valeurs d'environnement ; des variables du poste (ex. XDG_SESSION_CLASS=user)
# masqueraient alors des mots attendus. Constaté le 15/10/2026 sur
# heartbeat-process-recovery.test.ts (échec en shell normal, réussite à vide).
env -i PATH="${PATH}" HOME="${HOME}" NODE_ENV=test PAPERCLIP_HOME="${PAPERCLIP_HOME}" \
  PAPERCLIP_CONFIG="${PAPERCLIP_CONFIG}" PAPERCLIP_INSTANCE_ID="${PAPERCLIP_INSTANCE_ID}" \
  TMPDIR="${TMPDIR}" LC_MESSAGES=C.UTF-8 COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  pnpm exec vitest run --exclude '**/dist/**' --project @paperclipai/server --no-file-parallelism --maxWorkers=1 "$@"
code=$?

case "${RACINE_TEST}" in
  "${BASE_TMP}"/pv-*) rm -rf -- "${RACINE_TEST}" ;;
esac
exit "${code}"

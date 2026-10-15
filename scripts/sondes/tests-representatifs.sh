#!/usr/bin/env bash
# Lance une sélection représentative des tests Vitest du socle Paperclip, avec
# le même environnement isolé que le lanceur officiel scripts/run-vitest-stable.mjs
# (PAPERCLIP_HOME/CONFIG/INSTANCE_ID et TMPDIR temporaires ; un seul worker pour
# le serveur). N'utilise ni l'instance de l'atelier ni ~/.paperclip.
# Usage : scripts/sondes/tests-representatifs.sh
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOCLE="${RACINE}/paperclip"
# Racine courte : les sockets Unix (PostgreSQL de test) sont limités à ~107
# caractères, comme le rappelle le lanceur officiel.
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
# Messages de git en anglais : contournement du défaut amont décrit dans
# config/atelier.env.example (sans lui, 25 tests de claude-local échouent).
export LC_MESSAGES=C.UTF-8

SERVEUR=(
  server/src/__tests__/issue-execution-policy.test.ts
  server/src/__tests__/issues-service.test.ts
  server/src/__tests__/issue-stale-execution-lock-routes.test.ts
  server/src/services/issue-dependency-wakeups.test.ts
  server/src/services/issue-comment-wakeup.test.ts
  server/src/__tests__/budgets-service.test.ts
  server/src/__tests__/approvals-service.test.ts
  server/src/__tests__/approval-routes-idempotency.test.ts
  server/src/__tests__/company-portability.test.ts
  server/src/__tests__/export-fidelity.test.ts
  server/src/__tests__/live-events-ws.test.ts
  server/src/__tests__/plugin-scoped-api-routes.test.ts
  server/src/__tests__/plugin-routes-authz.test.ts
  server/src/__tests__/plugin-tenant-isolation.test.ts
  server/src/__tests__/claude-local-skill-sync.test.ts
  server/src/__tests__/run-secret-redaction.test.ts
  server/src/__tests__/secrets-routes.test.ts
)

cd "${SOCLE}" || exit 1
code_global=0

echo "=== Adaptateur claude-local (tous ses tests) ==="
debut=$(date +%s)
pnpm exec vitest run --exclude '**/dist/**' --project @paperclipai/adapter-claude-local
c=$?; echo "=== adaptateur : code ${c}, $(( $(date +%s) - debut )) s ==="; [[ $c -ne 0 ]] && code_global=$c

echo "=== Serveur : ${#SERVEUR[@]} fichiers ciblés (sérialisés) ==="
debut=$(date +%s)
pnpm exec vitest run --exclude '**/dist/**' --project @paperclipai/server \
  --no-file-parallelism --maxWorkers=1 "${SERVEUR[@]}"
c=$?; echo "=== serveur : code ${c}, $(( $(date +%s) - debut )) s ==="; [[ $c -ne 0 ]] && code_global=$c

# Nettoyage du seul dossier temporaire créé par ce script.
case "${RACINE_TEST}" in
  "${BASE_TMP}"/pv-*) rm -rf -- "${RACINE_TEST}" ;;
esac
exit "${code_global}"

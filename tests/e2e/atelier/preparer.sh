#!/usr/bin/env bash
# Prépare les tests de bout en bout de l'interface de l'atelier (lot C) sur une
# instance d'ESSAI isolée, sans toucher l'instance principale ni celle du lot A.
#
# Étapes : liens vers Playwright du socle, copie isolée du plugin construite,
# instance lancée à part (scripts/instance-essai.sh), plugin installé depuis la
# copie, organisation de démonstration appliquée.
#
# Usage : tests/e2e/atelier/preparer.sh [id=atelier-lotc] [port=3140] [port_pg=54369]
# Variable facultative ATELIER_COPIE : dossier de la copie du plugin (défaut instance/plugin-lotc), pour une instance à soi.
# L'instance est lancée en arrière-plan ; journal : instance/e2e-atelier-instance.log.
# Arrêt : scripts/instance-essai.sh arreter <id> <port> <port_pg>
set -uo pipefail

ID="${1:-atelier-lotc}"; PORT="${2:-3140}"; PORT_PG="${3:-54369}"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ICI="${RACINE}/tests/e2e/atelier"
COPIE="${ATELIER_COPIE:-${RACINE}/instance/plugin-lotc}"
API="http://127.0.0.1:${PORT}/api"

# 1. Playwright et chromium headless du socle (aucune installation).
PW_TEST="$(ls -d "${RACINE}"/paperclip/node_modules/.pnpm/@playwright+test@*/node_modules/@playwright/test 2>/dev/null | head -1)"
PW="$(ls -d "${RACINE}"/paperclip/node_modules/.pnpm/playwright@*/node_modules/playwright 2>/dev/null | head -1)"
if [[ -z "${PW_TEST}" || -z "${PW}" ]]; then
  echo "Playwright introuvable dans paperclip/node_modules : lancez scripts/preparer-socle.sh." >&2; exit 1
fi
mkdir -p "${ICI}/node_modules/@playwright"
ln -sfn "${PW_TEST}" "${ICI}/node_modules/@playwright/test"
ln -sfn "${PW}" "${ICI}/node_modules/playwright"

# 2. Copie isolée du plugin (le dist/ du dépôt reste celui du lot A).
(cd "${RACINE}/plugin-atelier" && node tests/ui/outils/construire-copie.mjs "${COPIE}") || exit 1

# 3. Instance d'essai.
if ! curl -sf -m 2 "${API}/health" >/dev/null; then
  nohup "${RACINE}/scripts/instance-essai.sh" demarrer "${ID}" "${PORT}" "${PORT_PG}" > "${RACINE}/instance/e2e-atelier-instance.log" 2>&1 &
  for _ in $(seq 1 90); do curl -sf -m 2 "${API}/health" >/dev/null && break; sleep 2; done
fi
curl -sf -m 2 "${API}/health" >/dev/null || { echo "Instance injoignable sur ${API}." >&2; exit 1; }

# 4. Plugin installé depuis la copie (idempotent).
if ! curl -s "${API}/plugins" | grep -q '"atelier.marketing-ia"'; then
  curl -s -m 180 -X POST "${API}/plugins/install" -H 'Content-Type: application/json' \
    -d "{\"packageName\":\"${COPIE}\",\"isLocalPath\":true}" >/dev/null
fi

# 4 bis. Recharger le worker : la surveillance des fichiers ne le recharge pas toujours après
# une reconstruction de la copie (constaté le 15/10/2026 ; voir docs/besoins-lot-c.md, B-4).
curl -s -m 30 -X POST "${API}/plugins/atelier.marketing-ia/disable" >/dev/null
curl -s -m 60 -X POST "${API}/plugins/atelier.marketing-ia/enable" >/dev/null

# 5. Organisation de démonstration (idempotent, aucun appel de modèle).
ATELIER_API="${API}" python3 -I "${RACINE}/scripts/bootstrap-organisation.py" appliquer --mode demonstration >/dev/null || exit 1
echo "Prêt : ${API} (plugin et organisation de démonstration)."
echo "Tests : ${ICI}/node_modules/@playwright/test/cli.js test --config ${ICI}/playwright.config.ts"

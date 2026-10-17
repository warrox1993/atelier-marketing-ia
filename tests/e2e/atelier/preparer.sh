#!/usr/bin/env bash
# Prépare les tests de bout en bout de l'interface de l'atelier (lot C) sur une
# instance d'ESSAI isolée, sans toucher l'instance principale ni celle du lot A.
#
# Étapes : liens vers Playwright du socle, copie isolée du plugin construite,
# instance lancée à part (scripts/instance-essai.sh), plugin installé depuis la
# copie, organisation d'essai appliquée (agents process déterministes).
#
# Usage : tests/e2e/atelier/preparer.sh [id=atelier-e2e] [port=3590] [port_pg=54790]
# Variable facultative ATELIER_COPIE : dossier de la copie du plugin (défaut instance/plugin-e2e-essai), pour une instance à soi.
# L'instance est lancée en arrière-plan ; journal : instance/e2e-atelier-instance.log.
# Arrêt : scripts/instance-essai.sh arreter <id> <port> <port_pg>
set -uo pipefail

ID="${1:-atelier-e2e}"; PORT="${2:-3590}"; PORT_PG="${3:-54790}"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ICI="${RACINE}/tests/e2e/atelier"
COPIE="${ATELIER_COPIE:-${RACINE}/instance/plugin-e2e-essai}"
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

# 3 bis. Le PostgreSQL embarqué doit écouter sur PORT_PG : si le port est pris au démarrage (54790 est dans la plage
# éphémère du noyau), Paperclip passe EN SILENCE au port suivant, et les essais qui lisent la base (psql sur PORT_PG)
# échouent loin de la cause (constaté le 17/10/2026 : 54790 demandé, 54791 utilisé). La 4e ligne de postmaster.pid
# donne le port réel.
ACCUEIL_PC="$(set -a; source "${RACINE}/config/atelier.env" >/dev/null 2>&1; echo "${PAPERCLIP_HOME:-}")"
PID_PG="${ACCUEIL_PC}/instances/${ID}/db/postmaster.pid"
PORT_REEL="$(sed -n 4p "${PID_PG}" 2>/dev/null | tr -d '[:space:]')"
if [[ "${PORT_REEL}" != "${PORT_PG}" ]]; then
  echo "PostgreSQL de l'instance ${ID} sur le port « ${PORT_REEL:-inconnu} » au lieu de ${PORT_PG} (port pris au démarrage ?) : arrêtez-la (scripts/instance-essai.sh arreter ${ID} ${PORT} ${PORT_PG}) puis relancez." >&2
  exit 1
fi

# 4. Plugin installé depuis la copie (idempotent). Une instance jetable réutilisée peut porter le plugin installé depuis
# une AUTRE copie (interface périmée) : dans ce cas il est désinstallé (sans purge des données) puis réinstallé.
if curl -s "${API}/plugins" | grep -q '"atelier.marketing-ia"' && ! curl -s "${API}/plugins" | grep -q "\"packagePath\":\"${COPIE}\""; then
  echo "Plugin installé depuis une autre copie : réinstallation depuis ${COPIE}."
  curl -s -m 60 -X DELETE "${API}/plugins/atelier.marketing-ia" >/dev/null
fi
if ! curl -s "${API}/plugins" | grep -q '"atelier.marketing-ia"'; then
  curl -s -m 180 -X POST "${API}/plugins/install" -H 'Content-Type: application/json' \
    -d "{\"packageName\":\"${COPIE}\",\"isLocalPath\":true}" >/dev/null
fi

# 4 bis. Recharger le worker : la surveillance des fichiers ne le recharge pas toujours après
# une reconstruction de la copie (constaté le 15/10/2026 ; voir docs/besoins-lot-c.md, B-4).
# Juste après le démarrage, cette réactivation peut croiser le chargement initial des plugins (« Worker already
# registered », enable 400, plugin en erreur : constaté le 17/10/2026) : l'état « ready » est donc exigé, avec de
# nouvelles tentatives espacées.
etat_plugin() {
  curl -s -m 5 "${API}/plugins" | python3 -I -c '
import json, sys
d = json.load(sys.stdin); d = d if isinstance(d, list) else d.get("items", [])
print(next((p.get("status", "") for p in d if p.get("pluginKey") == "atelier.marketing-ia"), ""))'
}
for essai in 1 2 3 4 5; do
  curl -s -m 30 -X POST "${API}/plugins/atelier.marketing-ia/disable" >/dev/null
  curl -s -m 60 -X POST "${API}/plugins/atelier.marketing-ia/enable" >/dev/null
  [[ "$(etat_plugin)" == "ready" ]] && break
  sleep 3
done
ETAT="$(etat_plugin)"
[[ "${ETAT}" == "ready" ]] || { echo "Plugin atelier.marketing-ia dans l'état « ${ETAT} » après réactivation (voir instance/e2e-atelier-instance.log)." >&2; exit 1; }

# 5. Organisation d'ESSAI : l'organisation modèle est créée en mode reel (agents claude_local en pause), puis ses
# agents sont basculés en `process` déterministes (plugin-atelier/demo/agent-demo.mjs) par l'API de l'instance
# jetable : aucun appel de modèle, aucun coût. L'état local du bootstrap est ISOLÉ (jamais instance/ de l'instance
# principale). Idempotent.
export ATELIER_DONNEES_LOCALES="${RACINE}/instance/essai-${ID}-donnees"
mkdir -p "${ATELIER_DONNEES_LOCALES}"
ATELIER_API="${API}" PAPERCLIP_INSTANCE_ID="${ID}" python3 -I "${RACINE}/scripts/bootstrap-organisation.py" appliquer --mode reel >/dev/null || exit 1
python3 -I "${ICI}/preparer_agents.py" "${API}" || exit 1
# 6. Dossiers de l'essai « appel exact » et « révocation de la preuve » (données locales isolées, aucun appel de modèle).
# Chaque essai consomme son dossier : une nouvelle préparation en crée de neufs (l'essai prend le plus récent).
PAPERCLIP_INSTANCE_ID="${ID}" python3 -I "${ICI}/preparer_appel.py" "${API}" propose || { echo "preparer_appel.py propose a échoué." >&2; exit 1; }
PAPERCLIP_INSTANCE_ID="${ID}" python3 -I "${ICI}/preparer_appel.py" "${API}" diffusee || { echo "preparer_appel.py diffusee a échoué." >&2; exit 1; }
echo "Prêt : ${API} (plugin et organisation d'essai, agents déterministes)."
echo "Tests : ${ICI}/node_modules/@playwright/test/cli.js test --config ${ICI}/playwright.config.ts"

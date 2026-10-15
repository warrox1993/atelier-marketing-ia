#!/usr/bin/env bash
# Démonstration de l'Atelier Marketing IA en UNE commande (aucun appel de modèle,
# aucune dépense, aucune diffusion réelle).
#
# Usage :
#   scripts/demonstration.sh                      lancer sur l'instance principale (config/atelier.env)
#   scripts/demonstration.sh arreter              arrêter l'instance principale
#   scripts/demonstration.sh lancer  --essai <id> <port> <port_pg>   instance d'essai isolée
#   scripts/demonstration.sh arreter --essai <id> <port> <port_pg>
#
# « lancer » : valide la configuration, prépare le socle et le plugin s'ils manquent,
# démarre l'instance en arrière-plan si elle est arrêtée, installe et recharge le
# plugin, applique l'organisation de démonstration, puis rejoue le début du scénario B
# avec le vrai moteur (dossier « prêt pour validation humaine ») et affiche l'adresse.
# Reprise : relancer la même commande ; tout est idempotent sauf le dossier rejoué
# (une nouvelle entreprise de démonstration à chaque lancement).
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTION="${1:-lancer}"; shift || true
ESSAI=()
if [[ "${1:-}" == "--essai" ]]; then
  if [[ $# -lt 4 ]]; then echo "Usage : $0 ${ACTION} --essai <id> <port> <port_pg>" >&2; exit 2; fi
  ESSAI=("$2" "$3" "$4")
fi

"${RACINE}/scripts/verifier-config.sh" >/dev/null || { "${RACINE}/scripts/verifier-config.sh"; exit 1; }
set -a
# shellcheck disable=SC1091
source "${RACINE}/config/atelier.env"
set +a
PORT_CIBLE="${ESSAI[1]:-${PORT}}"
API="http://127.0.0.1:${PORT_CIBLE}/api"
JOURNAUX="${PAPERCLIP_HOME}/journaux"
mkdir -p "${JOURNAUX}"

case "${ACTION}" in
  arreter)
    if (( ${#ESSAI[@]} )); then exec "${RACINE}/scripts/instance-essai.sh" arreter "${ESSAI[@]}"; fi
    exec "${RACINE}/scripts/arreter-instance.sh"
    ;;
  lancer) ;;
  *) echo "Action inconnue : ${ACTION} (lancer ou arreter)." >&2; exit 2 ;;
esac

echo "1/5 Socle et plugin"
if [[ ! -d "${RACINE}/paperclip/node_modules" ]]; then "${RACINE}/scripts/preparer-socle.sh" || exit 1; fi
if [[ ! -f "${RACINE}/plugin-atelier/dist/worker.js" ]]; then "${RACINE}/scripts/preparer-plugin.sh" || exit 1; fi

echo "2/5 Instance sur ${API}"
if ! curl -sf -m 2 "${API}/health" >/dev/null; then
  if (( ${#ESSAI[@]} )); then
    nohup "${RACINE}/scripts/instance-essai.sh" demarrer "${ESSAI[@]}" > "${JOURNAUX}/demonstration-${ESSAI[0]}.log" 2>&1 &
  else
    nohup "${RACINE}/scripts/lancer-instance.sh" > "${JOURNAUX}/demonstration-${PAPERCLIP_INSTANCE_ID}.log" 2>&1 &
  fi
  for _ in $(seq 1 120); do curl -sf -m 2 "${API}/health" >/dev/null && break; sleep 2; done
fi
curl -sf -m 2 "${API}/health" >/dev/null || { echo "Instance injoignable sur ${API} : voir ${JOURNAUX}/." >&2; exit 1; }

echo "3/5 Plugin atelier.marketing-ia"
if ! curl -s "${API}/plugins" | grep -q '"atelier.marketing-ia"'; then
  curl -s -m 180 -X POST "${API}/plugins/install" -H 'Content-Type: application/json' \
    -d "{\"packageName\":\"${RACINE}/plugin-atelier\",\"isLocalPath\":true}" >/dev/null
fi
# Recharger le worker : la surveillance des fichiers ne le fait pas toujours (REPRISE.md).
curl -s -m 30 -X POST "${API}/plugins/atelier.marketing-ia/disable" >/dev/null
curl -s -m 60 -X POST "${API}/plugins/atelier.marketing-ia/enable" >/dev/null
for _ in $(seq 1 30); do curl -s "${API}/plugins" | grep -q '"status":"ready"' && break; sleep 2; done

echo "4/5 Organisation de démonstration (10 agents + porte, compétences, projets)"
ATELIER_API="${API}" python3 -I "${RACINE}/scripts/bootstrap-organisation.py" appliquer --mode demonstration > "${JOURNAUX}/demonstration-organisation.log" 2>&1 \
  || { echo "Organisation non appliquée : voir ${JOURNAUX}/demonstration-organisation.log" >&2; exit 1; }

echo "5/5 Dossier de démonstration rejoué par le vrai moteur (quelques minutes)"
SORTIE="$(ATELIER_DOSSIER_NOM="Démonstration Atelier $(date +%H%M%S)" python3 -I "${RACINE}/tests/e2e/atelier/preparer_dossier.py" "${API}" 2> "${JOURNAUX}/demonstration-dossier.log" | tail -1)"
PREFIXE="$(printf '%s' "${SORTIE}" | python3 -I -c 'import json,sys; print(json.loads(sys.stdin.read() or "{}").get("prefixe") or "")' 2>/dev/null)"
if [[ -z "${PREFIXE}" ]]; then
  echo "Dossier non préparé : ${SORTIE:-aucune sortie} (voir ${JOURNAUX}/demonstration-dossier.log)." >&2
  exit 1
fi
echo
echo "Démonstration prête (mode démonstration : fixtures déterministes, aucune IA réelle)."
echo "  Contenus à valider : http://127.0.0.1:${PORT_CIBLE}/${PREFIXE}/atelier/contenus"
echo "  Arrêt              : scripts/demonstration.sh arreter${ESSAI[*]:+ --essai ${ESSAI[*]}}"

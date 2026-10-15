#!/usr/bin/env bash
# Valide config/atelier.env (ou le fichier passé en argument) AVANT un lancement.
# Contrôles : variables obligatoires présentes, valeurs dans les plages documentées,
# écoute locale seulement, télémétrie coupée, aucun secret dans le fichier.
# Sortie : 0 si conforme, 1 sinon (chaque écart est listé). Ne modifie rien.
# Usage : scripts/verifier-config.sh [fichier]
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FICHIER="${1:-${RACINE}/config/atelier.env}"
ECARTS=0
ecart() { echo "ÉCART : $*" >&2; ECARTS=$((ECARTS + 1)); }

if [[ ! -f "${FICHIER}" ]]; then
  echo "ÉCART : ${FICHIER} absent. Copiez config/atelier.env.example vers config/atelier.env." >&2
  exit 1
fi

# Secrets : le fichier ne doit en contenir aucun (ils vont dans le coffre de Paperclip).
if grep -Eiq '^[[:space:]]*[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|API_KEY|APIKEY|OAUTH)[A-Z0-9_]*=' "${FICHIER}"; then
  ecart "variable de type secret dans ${FICHIER} (jeton, mot de passe, clé) : à placer dans le coffre de Paperclip."
fi
if grep -Eq 'sk-ant-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY' "${FICHIER}"; then
  ecart "valeur ressemblant à une clé ou un jeton dans ${FICHIER}."
fi

# Lecture dans un sous-shell : le fichier est la source documentée des variables de l'instance.
mapfile -t LIGNES < <(set -a; source "${FICHIER}" >/dev/null 2>&1; set +a
  for v in PAPERCLIP_HOME PAPERCLIP_INSTANCE_ID PAPERCLIP_DEPLOYMENT_MODE PAPERCLIP_BIND PORT \
           PAPERCLIP_TELEMETRY_DISABLED ATELIER_MAX_RUNS_ACTIFS_PAR_ENTREPRISE; do
    printf '%s=%s\n' "$v" "${!v-}"
  done)
declare -A V
for l in "${LIGNES[@]}"; do V["${l%%=*}"]="${l#*=}"; done

for v in PAPERCLIP_HOME PAPERCLIP_INSTANCE_ID PAPERCLIP_DEPLOYMENT_MODE PAPERCLIP_BIND PORT; do
  [[ -n "${V[$v]}" ]] || ecart "${v} manquante."
done
[[ -z "${V[PAPERCLIP_HOME]}" || "${V[PAPERCLIP_HOME]}" == /* ]] || ecart "PAPERCLIP_HOME doit être un chemin absolu (${V[PAPERCLIP_HOME]})."
[[ -z "${V[PAPERCLIP_INSTANCE_ID]}" || "${V[PAPERCLIP_INSTANCE_ID]}" =~ ^[a-z0-9][a-z0-9-]*$ ]] || ecart "PAPERCLIP_INSTANCE_ID invalide (${V[PAPERCLIP_INSTANCE_ID]})."
[[ -z "${V[PAPERCLIP_DEPLOYMENT_MODE]}" || "${V[PAPERCLIP_DEPLOYMENT_MODE]}" == "local_trusted" ]] || ecart "PAPERCLIP_DEPLOYMENT_MODE doit valoir local_trusted pour cette installation locale (trouvé : ${V[PAPERCLIP_DEPLOYMENT_MODE]})."
[[ -z "${V[PAPERCLIP_BIND]}" || "${V[PAPERCLIP_BIND]}" == "loopback" ]] || ecart "PAPERCLIP_BIND doit valoir loopback : l'instance n'écoute que la boucle locale (trouvé : ${V[PAPERCLIP_BIND]})."
if [[ -n "${V[PORT]}" ]] && { [[ ! "${V[PORT]}" =~ ^[0-9]+$ ]] || (( V[PORT] < 1024 || V[PORT] > 65535 )); }; then
  ecart "PORT hors plage 1024-65535 (${V[PORT]})."
fi
[[ "${V[PAPERCLIP_TELEMETRY_DISABLED]}" == "1" ]] || ecart "PAPERCLIP_TELEMETRY_DISABLED doit valoir 1."
M="${V[ATELIER_MAX_RUNS_ACTIFS_PAR_ENTREPRISE]}"
if [[ -n "${M}" ]] && { [[ ! "${M}" =~ ^[0-9]+$ ]] || (( M < 1 || M > 20 )); }; then
  ecart "ATELIER_MAX_RUNS_ACTIFS_PAR_ENTREPRISE hors plage 1-20 (${M})."
fi

if (( ECARTS > 0 )); then
  echo "Configuration refusée : ${ECARTS} écart(s) dans ${FICHIER}." >&2
  exit 1
fi
echo "Configuration conforme : ${FICHIER} (instance ${V[PAPERCLIP_INSTANCE_ID]}, port ${V[PORT]}, boucle locale, télémétrie coupée, aucun secret)."

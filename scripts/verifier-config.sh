#!/usr/bin/env bash
# Valide config/atelier.env (ou le fichier passé en argument) AVANT un lancement.
# Contrôles : variables obligatoires présentes, valeurs dans les plages documentées,
# écoute locale seulement, télémétrie coupée, aucun secret dans le fichier.
# Sortie : 0 si conforme, 1 sinon (chaque écart est listé). Ne modifie rien.
# Surcharge d'accès à distance (config/atelier-distant.env, facultative) : contrôlée à part, car elle
# DOIT passer en mode authentifié (le contrôle local_trusted ci-dessous ne vaut que pour atelier.env).
# Usage : scripts/verifier-config.sh [fichier]            (atelier.env, puis atelier-distant.env s'il existe)
#         scripts/verifier-config.sh --distant <fichier>  (valide seulement une surcharge distante)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ECARTS=0
ecart() { echo "ÉCART : $*" >&2; ECARTS=$((ECARTS + 1)); }

# Valide un fichier de surcharge distante : mode authentifié, exposition privée, boucle locale,
# adresse publique https en .ts.net (tailscale serve), API en http://127.0.0.1, aucun secret.
verifier_distant() {
  local f="$1"
  if [[ ! -f "${f}" ]]; then
    echo "ÉCART : ${f} absent." >&2
    return 1
  fi
  if grep -Eiq '^[[:space:]]*(export[[:space:]]+)?[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|API_KEY|APIKEY|OAUTH|BOARD_KEY)[A-Z0-9_]*=' "${f}" \
     || grep -Eq 'sk-ant-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY' "${f}"; then
    ecart "secret dans ${f} : à placer dans le coffre de Paperclip ou l'environnement, jamais dans ce fichier."
  fi
  # Le fichier n'est JAMAIS exécuté (pas de source) : lecture ligne à ligne, liste blanche stricte des clés.
  # Seules sont admises les lignes vides, les commentaires et CLE=valeur (^[A-Z_]+=[^$`;|&]*$) ; tout le reste
  # (export, $(…), commandes, clé hors liste) est refusé. lancer-instance.sh relit le fichier de la même façon.
  local -A d=()
  local -A autorisees=([PAPERCLIP_DEPLOYMENT_MODE]=1 [PAPERCLIP_DEPLOYMENT_EXPOSURE]=1 [PAPERCLIP_BIND]=1
    [PAPERCLIP_PUBLIC_URL]=1 [PAPERCLIP_API_URL]=1 [PAPERCLIP_ALLOWED_HOSTNAMES]=1 [PAPERCLIP_AUTH_DISABLE_SIGN_UP]=1)
  local l cle valeur n=0
  local motif_ligne='^[A-Z_]+=[^$`;|&]*$'
  while IFS= read -r l || [[ -n "${l}" ]]; do
    n=$((n + 1))
    [[ "${l}" =~ ^[[:space:]]*$ || "${l}" =~ ^[[:space:]]*# ]] && continue
    if [[ ! "${l}" =~ ${motif_ligne} ]]; then
      ecart "ligne ${n} de ${f} refusée (forme CLE=valeur stricte exigée : ni export, ni \$, \`, ;, |, & ; pas d'espace avant la clé)."
      continue
    fi
    cle="${l%%=*}"
    valeur="${l#*=}"
    if [[ -z "${autorisees[${cle}]-}" ]]; then
      ecart "variable ${cle} (ligne ${n} de ${f}) hors de la liste autorisée : $(printf '%s ' "${!autorisees[@]}" | tr ' ' '\n' | sort | tr '\n' ' ')."
      continue
    fi
    if [[ "${valeur}" =~ [[:space:]\"\'\\] ]]; then
      ecart "valeur de ${cle} (ligne ${n}) : espaces, guillemets et barres obliques inverses interdits."
      continue
    fi
    if [[ -n "${d[${cle}]+x}" ]]; then
      ecart "variable ${cle} définie plusieurs fois dans ${f} (ligne ${n})."
      continue
    fi
    d["${cle}"]="${valeur}"
  done < "${f}"
  if [[ -n "${d[PAPERCLIP_AUTH_DISABLE_SIGN_UP]+x}" && "${d[PAPERCLIP_AUTH_DISABLE_SIGN_UP]}" != "true" ]]; then
    ecart "PAPERCLIP_AUTH_DISABLE_SIGN_UP ne peut valoir que true ou être absente (trouvé : ${d[PAPERCLIP_AUTH_DISABLE_SIGN_UP]:-vide})."
  fi
  [[ "${d[PAPERCLIP_DEPLOYMENT_MODE]}" == "authenticated" ]] || ecart "PAPERCLIP_DEPLOYMENT_MODE doit valoir authenticated dans ${f} (trouvé : ${d[PAPERCLIP_DEPLOYMENT_MODE]:-vide})."
  [[ "${d[PAPERCLIP_DEPLOYMENT_EXPOSURE]}" == "private" ]] || ecart "PAPERCLIP_DEPLOYMENT_EXPOSURE doit valoir private (trouvé : ${d[PAPERCLIP_DEPLOYMENT_EXPOSURE]:-vide})."
  [[ "${d[PAPERCLIP_BIND]}" == "loopback" ]] || ecart "PAPERCLIP_BIND doit valoir loopback : seul tailscale serve est exposé (trouvé : ${d[PAPERCLIP_BIND]:-vide})."
  [[ "${d[PAPERCLIP_PUBLIC_URL]}" =~ ^https://[A-Za-z0-9.-]+\.ts\.net/?$ && "${d[PAPERCLIP_PUBLIC_URL]}" != *'<'* ]] || ecart "PAPERCLIP_PUBLIC_URL doit être en https:// et se terminer par .ts.net, sans valeur d'exemple (trouvé : ${d[PAPERCLIP_PUBLIC_URL]:-vide})."
  [[ "${d[PAPERCLIP_API_URL]}" =~ ^http://127\.0\.0\.1(:[0-9]+)?/?$ ]] || ecart "PAPERCLIP_API_URL doit être en http://127.0.0.1 (trouvé : ${d[PAPERCLIP_API_URL]:-vide})."
  [[ -n "${d[PAPERCLIP_ALLOWED_HOSTNAMES]}" && "${d[PAPERCLIP_ALLOWED_HOSTNAMES]}" != *'<'* ]] || ecart "PAPERCLIP_ALLOWED_HOSTNAMES doit lister le nom .ts.net réel et localhost."
  if (( ECARTS > 0 )); then
    echo "Configuration distante refusée : ${ECARTS} écart(s) dans ${f}." >&2
    return 1
  fi
  echo "Configuration distante conforme : ${f} (authenticated, private, loopback, URL .ts.net en https, API locale)."
  return 0
}

if [[ "${1:-}" == "--distant" ]]; then
  verifier_distant "${2:-${RACINE}/config/atelier-distant.env}"
  exit $?
fi

FICHIER="${1:-${RACINE}/config/atelier.env}"

if [[ ! -f "${FICHIER}" ]]; then
  echo "ÉCART : ${FICHIER} absent. Copiez config/atelier.env.example vers config/atelier.env." >&2
  exit 1
fi

# Secrets : le fichier ne doit en contenir aucun (ils vont dans le coffre de Paperclip).
if grep -Eiq '^[[:space:]]*(export[[:space:]]+)?[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|API_KEY|APIKEY|OAUTH)[A-Z0-9_]*=' "${FICHIER}"; then
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

# Surcharge distante facultative : validée seulement si elle existe (et si on valide atelier.env par défaut).
DISTANT="${RACINE}/config/atelier-distant.env"
if [[ -z "${1:-}" && -f "${DISTANT}" ]]; then
  ECARTS=0
  verifier_distant "${DISTANT}" || exit 1
fi

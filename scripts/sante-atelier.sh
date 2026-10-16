#!/usr/bin/env bash
# Contrôle de santé d'une instance de l'Atelier marketing IA (lecture seule).
# Vérifie : /api/health (statut ok, sauvegarde de base présente, sans échec, de moins de 2 h),
# /api/plugins (plugin atelier.marketing-ia à « ready ») et /sante de la passerelle (facultatif).
# Code de sortie : 0 = tout va bien ; 1 = au moins une anomalie ; 2 = mauvais usage.
# Chaque anomalie est écrite sur la sortie d'erreur (donc dans journald sous systemd).
#
# Usage : scripts/sante-atelier.sh [--port N] [--passerelle URL] [--age-max-heures H] [--notifier]
#                                  [--fichier-reponse sante.json] [--fichier-plugins plugins.json]
#                                  [--fichier-passerelle passerelle.json]
# Variables : ATELIER_PORT (défaut 3100), ATELIER_PASSERELLE_URL (vide = passerelle non contrôlée),
#             ATELIER_SANTE_AGE_MAX_HEURES (défaut 2).
# Test avec réponse simulée : --fichier-reponse remplace l'appel à /api/health ; dans ce mode,
# plugins et passerelle ne sont contrôlés que si leur fichier simulé est donné aussi.
# Un fichier simulé absent ou vide équivaut à « pas de réponse ».
set -uo pipefail

PORT="${ATELIER_PORT:-3100}"
PASSERELLE="${ATELIER_PASSERELLE_URL:-}"
AGE_MAX="${ATELIER_SANTE_AGE_MAX_HEURES:-2}"
NOTIFIER=0
F_SANTE=""; F_PLUGINS=""; F_PASSERELLE=""
SIMULE=0
PLUGIN_ID="atelier.marketing-ia"

usage() { sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 || { usage; exit 2; } ;;
    --passerelle) PASSERELLE="${2:-}"; shift 2 || { usage; exit 2; } ;;
    --age-max-heures) AGE_MAX="${2:-}"; shift 2 || { usage; exit 2; } ;;
    --notifier) NOTIFIER=1; shift ;;
    --fichier-reponse) F_SANTE="${2:-}"; SIMULE=1; shift 2 || { usage; exit 2; } ;;
    --fichier-plugins) F_PLUGINS="${2:-}"; shift 2 || { usage; exit 2; } ;;
    --fichier-passerelle) F_PASSERELLE="${2:-}"; shift 2 || { usage; exit 2; } ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Argument inconnu : $1" >&2; usage; exit 2 ;;
  esac
done

[[ "${PORT}" =~ ^[0-9]+$ ]] || { echo "Port invalide : ${PORT}" >&2; exit 2; }
[[ "${AGE_MAX}" =~ ^[0-9]+([.][0-9]+)?$ ]] || { echo "Âge maximal invalide : ${AGE_MAX}" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "jq est requis (sudo apt install jq)." >&2; exit 2; }

PROBLEMES=()
alerte() { PROBLEMES+=("$1"); }

# Récupère le corps d'une réponse : fichier simulé si donné, sinon appel HTTP en lecture seule.
# Écrit le corps sur la sortie standard ; code 1 si pas de réponse exploitable.
recuperer() {
  local fichier="$1" url="$2" corps
  if [[ -n "${fichier}" ]]; then
    [[ -s "${fichier}" ]] || return 1
    cat "${fichier}"; return 0
  fi
  corps="$(curl -fsS --max-time 10 "${url}" 2>/dev/null)" || return 1
  [[ -n "${corps}" ]] || return 1
  printf '%s' "${corps}"
}

# --- 1. /api/health ---
SANTE_OK=0
if SANTE="$(recuperer "${F_SANTE}" "http://127.0.0.1:${PORT}/api/health")" && jq -e . >/dev/null 2>&1 <<<"${SANTE}"; then
  SANTE_OK=1
else
  alerte "pas de réponse exploitable de /api/health (instance sur le port ${PORT} arrêtée ou bloquée)"
fi

if [[ "${SANTE_OK}" -eq 1 ]]; then
  statut="$(jq -r '.status // "absent"' <<<"${SANTE}")"
  [[ "${statut}" == "ok" ]] || alerte "statut de santé « ${statut} » (attendu : ok)"

  if jq -e '.databaseBackup' >/dev/null 2>&1 <<<"${SANTE}"; then
    if [[ "$(jq -r '.databaseBackup.enabled' <<<"${SANTE}")" != "true" ]]; then
      alerte "sauvegarde automatique de la base désactivée"
    fi
    if [[ "$(jq -r '.databaseBackup.status // "absent"' <<<"${SANTE}")" != "ok" ]]; then
      while IFS= read -r ligne; do
        alerte "sauvegarde de base en échec ou en retard : ${ligne}"
      done < <(jq -r '(.databaseBackup.warnings // [])[] | "\(.code) : \(.message)"' <<<"${SANTE}")
      [[ "$(jq -r '(.databaseBackup.warnings // []) | length' <<<"${SANTE}")" -gt 0 ]] \
        || alerte "sauvegarde de base : statut « $(jq -r '.databaseBackup.status // "absent"' <<<"${SANTE}") »"
    fi
    # Âge de la dernière sauvegarde (présent seulement dans la réponse complète, authentifiée).
    age="$(jq -r '.databaseBackup.latestBackup.ageHours // empty' <<<"${SANTE}")"
    if [[ -n "${age}" ]] && awk -v a="${age}" -v m="${AGE_MAX}" 'BEGIN{exit !(a>m)}'; then
      alerte "dernière sauvegarde de base trop ancienne : ${age} h (maximum ${AGE_MAX} h)"
    fi
  else
    alerte "réponse /api/health sans informations de sauvegarde de base : contrôle impossible"
  fi
fi

# --- 2. Plugin ---
if [[ "${SIMULE}" -eq 0 || -n "${F_PLUGINS}" ]]; then
  if PLUGINS="$(recuperer "${F_PLUGINS}" "http://127.0.0.1:${PORT}/api/plugins")" && jq -e . >/dev/null 2>&1 <<<"${PLUGINS}"; then
    etat="$(jq -r --arg id "${PLUGIN_ID}" '(if type=="array" then . else (.plugins // []) end) | map(select(.pluginKey==$id)) | .[0].status // "absent"' <<<"${PLUGINS}")"
    [[ "${etat}" == "ready" ]] || alerte "plugin ${PLUGIN_ID} non prêt (état : ${etat})"
  else
    alerte "pas de réponse exploitable de /api/plugins"
  fi
fi

# --- 3. Passerelle ---
if [[ -n "${F_PASSERELLE}" || ( "${SIMULE}" -eq 0 && -n "${PASSERELLE}" ) ]]; then
  if PASS="$(recuperer "${F_PASSERELLE}" "${PASSERELLE%/}/sante")" && jq -e . >/dev/null 2>&1 <<<"${PASS}"; then
    [[ "$(jq -r '.ok' <<<"${PASS}")" == "true" ]] || alerte "passerelle ${PASSERELLE:-simulée} : /sante ne renvoie pas ok"
  else
    alerte "pas de réponse de la passerelle (${PASSERELLE:-simulée})"
  fi
fi

# --- Verdict ---
if [[ "${#PROBLEMES[@]}" -eq 0 ]]; then
  echo "Atelier (port ${PORT}) : tout va bien."
  exit 0
fi

for p in "${PROBLEMES[@]}"; do echo "ALERTE Atelier (port ${PORT}) : ${p}" >&2; done
if [[ "${NOTIFIER}" -eq 1 ]]; then
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -u critical "Atelier marketing IA : alerte" "$(printf '%s\n' "${PROBLEMES[@]}")" \
      || echo "notify-send a échoué (pas de session graphique ?)" >&2
  else
    echo "notify-send indisponible : notification bureau ignorée." >&2
  fi
fi
exit 1

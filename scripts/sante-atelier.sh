#!/usr/bin/env bash
# Contrôle de santé d'une instance de l'Atelier marketing IA (lecture seule).
# Vérifie : /api/health (statut ok, sauvegarde de base présente, sans échec, de moins de 2 h),
# /api/plugins (plugin atelier.marketing-ia à « ready »), /sante de la passerelle (facultatif), les services
# annexes, les agents des entreprises actives (statut error, 3 runs de suite en échec, connexion Claude perdue),
# l'espace disque, les limites inotify de l'utilisateur, le service système de la fabrique (atelier-fabrique)
# et son écart avec le dépôt (scripts/ecart-fabrique.sh).
# Code de sortie : 0 = tout va bien ; 1 = au moins une anomalie ; 2 = mauvais usage.
# Chaque anomalie est écrite sur la sortie d'erreur (donc dans journald sous systemd).
#
# Usage : scripts/sante-atelier.sh [--port N] [--passerelle URL] [--age-max-heures H] [--notifier]
#                                  [--fichier-reponse sante.json] [--fichier-plugins plugins.json]
#                                  [--fichier-passerelle passerelle.json] [--fichier-unites unites.txt]
#                                  [--fichier-agents agents.json --fichier-runs runs.json]
#                                  [--fichier-disques disques.txt] [--fichier-inotify inotify.txt]
#                                  [--fichier-fabrique etat.txt]
# Variables : ATELIER_PORT (défaut 3100), ATELIER_PASSERELLE_URL (vide = passerelle non contrôlée),
#             ATELIER_SANTE_AGE_MAX_HEURES (défaut 2), ATELIER_SANTE_UNITES (unités systemd annexes),
#             ATELIER_SANTE_DISQUES (défaut « / /mnt/donnees », dossiers absents ignorés),
#             ATELIER_SANTE_DISQUE_MAX (défaut 90 %), ATELIER_SANTE_ETAT (empreinte de la dernière alerte
#             envoyée par courriel, défaut ~/.local/state/atelier/sante-<port>.alerte).
# --notifier : notification bureau à chaque anomalie ; courriel (scripts/alerte-courriel.sh) seulement quand
# la liste des anomalies change, et un courriel « rétabli » au retour à la normale.
# Test avec réponse simulée : --fichier-reponse remplace l'appel à /api/health ; dans ce mode, chaque autre
# contrôle n'a lieu que si son fichier simulé est donné aussi.
# Un fichier simulé absent ou vide équivaut à « pas de réponse ».
# Fabrique : en simulation, la section n'a lieu que si --fichier-fabrique (état du service, un mot) est donné ;
# l'écart se calcule alors sur ATELIER_FABRIQUE_INSTALLEE et ATELIER_FABRIQUE_ETAT.
set -uo pipefail

PORT="${ATELIER_PORT:-3100}"
PASSERELLE="${ATELIER_PASSERELLE_URL:-}"
AGE_MAX="${ATELIER_SANTE_AGE_MAX_HEURES:-2}"
NOTIFIER=0
F_SANTE=""; F_PLUGINS=""; F_PASSERELLE=""; F_UNITES=""; F_AGENTS=""; F_RUNS=""; F_DISQUES=""; F_INOTIFY=""; F_FABRIQUE=""
DISQUES="${ATELIER_SANTE_DISQUES:-/ /mnt/donnees}"
DISQUE_MAX="${ATELIER_SANTE_DISQUE_MAX:-90}"
ETAT="${ATELIER_SANTE_ETAT:-}"
UNITES="${ATELIER_SANTE_UNITES:-}"
SIMULE=0
PLUGIN_ID="atelier.marketing-ia"
# Clé board facultative (mode authentifié) : ~/.config/atelier/board-<port>.key, voir lib-cle-board.sh.
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/lib-cle-board.sh"

usage() { sed -n '2,28p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 || { usage; exit 2; } ;;
    --passerelle) PASSERELLE="${2:-}"; shift 2 || { usage; exit 2; } ;;
    --age-max-heures) AGE_MAX="${2:-}"; shift 2 || { usage; exit 2; } ;;
    --notifier) NOTIFIER=1; shift ;;
    --fichier-reponse) F_SANTE="${2:-}"; SIMULE=1; shift 2 || { usage; exit 2; } ;;
    --fichier-plugins) F_PLUGINS="${2:-}"; shift 2 || { usage; exit 2; } ;;
    --fichier-passerelle) F_PASSERELLE="${2:-}"; shift 2 || { usage; exit 2; } ;;
    --fichier-unites) F_UNITES="${2:-}"; shift 2 || { usage; exit 2; } ;;
    --fichier-agents) F_AGENTS="${2:-}"; shift 2 || { usage; exit 2; } ;;
    --fichier-runs) F_RUNS="${2:-}"; shift 2 || { usage; exit 2; } ;;
    --fichier-disques) F_DISQUES="${2:-}"; shift 2 || { usage; exit 2; } ;;
    --fichier-inotify) F_INOTIFY="${2:-}"; shift 2 || { usage; exit 2; } ;;
    --fichier-fabrique) F_FABRIQUE="${2:-}"; shift 2 || { usage; exit 2; } ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Argument inconnu : $1" >&2; usage; exit 2 ;;
  esac
done

[[ "${PORT}" =~ ^[0-9]+$ ]] || { echo "Port invalide : ${PORT}" >&2; exit 2; }
[[ "${AGE_MAX}" =~ ^[0-9]+([.][0-9]+)?$ ]] || { echo "Âge maximal invalide : ${AGE_MAX}" >&2; exit 2; }
[[ "${DISQUE_MAX}" =~ ^[0-9]+$ ]] || { echo "Seuil disque invalide : ${DISQUE_MAX}" >&2; exit 2; }
ETAT="${ETAT:-${XDG_STATE_HOME:-${HOME}/.local/state}/atelier/sante-${PORT}.alerte}"
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
  corps="$(curl_atelier "${PORT}" -fsS --max-time 10 "${url}" 2>/dev/null)" || return 1
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
      # Le serveur compte son heure de sauvegarde depuis son démarrage : après un redémarrage, la
      # suivante peut tarder. On déclenche donc d'abord une sauvegarde (route native, même que le bouton
      # de l'interface) et on n'alerte que si elle échoue. Jamais en simulation.
      if [[ "${SIMULE}" -eq 0 ]] && reponse="$(curl_atelier "${PORT}" -fsS --max-time 300 -X POST -H 'Content-Type: application/json' -d '{}' \
          "http://127.0.0.1:${PORT}/api/instance/database-backups" 2>/dev/null)" \
          && [[ -n "$(jq -r '.backupFile // empty' <<<"${reponse}" 2>/dev/null)" ]]; then
        echo "Atelier (port ${PORT}) : sauvegarde de ${age} h, nouvelle sauvegarde faite : $(jq -r '.backupFile' <<<"${reponse}")"
      else
        alerte "dernière sauvegarde de base trop ancienne : ${age} h (maximum ${AGE_MAX} h), et la sauvegarde de rattrapage a échoué"
      fi
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

# --- 4. Services annexes (unités systemd utilisateur : e-mailing, pages, mesure d'audience, extraction…) ---
# Liste dans ATELIER_SANTE_UNITES (noms séparés par des espaces, vide = non contrôlé). En simulation,
# --fichier-unites donne une ligne « unité état [activation] » par service à la place de systemctl.
# Un service désactivé (is-enabled = disabled) est « à la demande » : il n'est contrôlé que s'il est activé.
if [[ -n "${F_UNITES}" || ( "${SIMULE}" -eq 0 && -n "${UNITES}" ) ]]; then
  if [[ -n "${F_UNITES}" ]]; then
    if [[ -s "${F_UNITES}" ]]; then
      while read -r unite etat activation _; do
        [[ -n "${unite}" ]] || continue
        [[ "${activation}" == "disabled" ]] && continue
        [[ "${etat}" == "active" ]] || alerte "service ${unite} arrêté (état : ${etat:-inconnu})"
      done < "${F_UNITES}"
    else
      alerte "aucun état de service lisible (${F_UNITES})"
    fi
  else
    for unite in ${UNITES}; do
      [[ "${unite}" =~ ^[A-Za-z0-9@._][A-Za-z0-9@._-]*$ ]] || { alerte "nom d'unité invalide : ${unite}"; continue; }
      # Service désactivé = « à la demande » (règle de l'opérateur du 01/11/2026) : arrêté, ce n'est pas une anomalie.
      [[ "$(systemctl --user is-enabled -- "${unite}" 2>/dev/null)" == "disabled" ]] && continue
      etat="$(systemctl --user is-active -- "${unite}" 2>/dev/null)"
      [[ "${etat}" == "active" ]] || alerte "service ${unite} arrêté (état : ${etat:-inconnu})"
    done
  fi
fi

# --- 4 bis. Fabrique : service système (lisible sans root) et écart entre la copie installée et le dépôt ---
if [[ -n "${F_FABRIQUE}" || "${SIMULE}" -eq 0 ]]; then
  if [[ -n "${F_FABRIQUE}" ]]; then
    etat_fabrique="$(head -n 1 "${F_FABRIQUE}" 2>/dev/null)"
  else
    etat_fabrique="$(systemctl is-active -- atelier-fabrique.service 2>/dev/null)"
  fi
  [[ "${etat_fabrique}" == "active" ]] || alerte "service atelier-fabrique arrêté (état : ${etat_fabrique:-inconnu})"
  ecart="$("$(dirname "${BASH_SOURCE[0]}")/ecart-fabrique.sh" 2>&1)"; code_ecart=$?
  case "${code_ecart}" in
    0) ;;
    1) lignes="$(grep -cE '^(modifié|absent du dépôt|non installé) : ' <<<"${ecart}")"
       premier="$(grep -m1 -E '^(modifié|absent du dépôt|non installé) : ' <<<"${ecart}" | sed 's/^[^:]* : //')"
       alerte "fabrique installée en retard sur le dépôt : ${lignes} fichier(s) (premier : ${premier}) ; réinstaller par sudo bash scripts/installer-fabrique.sh, file vide" ;;
    *) alerte "copie installée de la fabrique absente ou illisible (${ecart})" ;;
  esac
fi

# --- 5. Agents et runs des entreprises actives (EXP-C1, EXP-C4) ---
# Par agent hors pause : statut error, 3 derniers runs en échec (failed ou timed_out), ou dernier run
# refusé faute de connexion Claude. Les runs d'un agent absent de la liste (supprimé) sont ignorés.
controler_runs() {
  local entreprise="$1" agents="$2" runs="$3" ligne
  while IFS= read -r ligne; do
    [[ -n "${ligne}" ]] && alerte "${entreprise}${ligne}"
  done < <(jq -r --argjson A "${agents}" '
    ($A | map({key: .id, value: .}) | from_entries) as $par
    | ($A[] | select(.status == "error") | "agent \(.name) en erreur (statut error)"),
      (group_by(.agentId)[] | sort_by(.createdAt) | reverse | . as $r | $par[$r[0].agentId]
       | select(. != null and ((.status // "") | IN("paused", "terminated") | not)) | .name as $nom
       | (if $r[0].errorCode == "claude_auth_required"
          then "agent \($nom) : dernier run refusé, connexion Claude à refaire (claude_auth_required)" else empty end),
         (if ($r | length) >= 3 and ($r[:3] | all(.status == "failed" or .status == "timed_out"))
          then "agent \($nom) : 3 runs de suite en échec (dernier : \($r[0].errorCode // $r[0].status))" else empty end))
  ' <<<"${runs}" 2>/dev/null || echo "runs ou agents illisibles")
}
if [[ -n "${F_RUNS}" ]]; then
  AGENTS_SIM="[]"; [[ -s "${F_AGENTS}" ]] && AGENTS_SIM="$(cat "${F_AGENTS}")"
  if RUNS="$(recuperer "${F_RUNS}" "")" && jq -e 'type == "array"' >/dev/null 2>&1 <<<"${RUNS}"; then
    controler_runs "" "${AGENTS_SIM}" "${RUNS}"
  else
    alerte "runs simulés illisibles (${F_RUNS})"
  fi
elif [[ "${SIMULE}" -eq 0 && "${SANTE_OK}" -eq 1 ]]; then
  if ENTREPRISES="$(recuperer "" "http://127.0.0.1:${PORT}/api/companies")"; then
    while IFS=$'\t' read -r cid cnom; do
      [[ "${cid}" =~ ^[A-Za-z0-9-]+$ ]] || continue
      if AGENTS="$(recuperer "" "http://127.0.0.1:${PORT}/api/companies/${cid}/agents")" \
          && RUNS="$(recuperer "" "http://127.0.0.1:${PORT}/api/companies/${cid}/heartbeat-runs?limit=200&summary=true")"; then
        # shortcut: 200 runs par entreprise, un agent rare peut n'y avoir que 1 ou 2 runs ; passer par agentId si besoin.
        controler_runs "${cnom} : " "${AGENTS}" "${RUNS}"
      else
        alerte "${cnom} : agents ou runs illisibles"
      fi
    done < <(jq -r '.[] | select(.status == "active") | [.id, .name] | @tsv' <<<"${ENTREPRISES}" 2>/dev/null)
  else
    alerte "pas de réponse exploitable de /api/companies"
  fi
fi

# --- 6. Espace disque (EXP-C4) : une ligne « dossier pourcentage » par disque ---
if [[ -n "${F_DISQUES}" || "${SIMULE}" -eq 0 ]]; then
  if [[ -n "${F_DISQUES}" ]]; then
    ETAT_DISQUES="$(cat "${F_DISQUES}" 2>/dev/null)"
  else
    ETAT_DISQUES="$(for d in ${DISQUES}; do [[ -d "${d}" ]] && printf '%s %s\n' "${d}" "$(df --output=pcent -- "${d}" | tail -1 | tr -dc '0-9')"; done)"
  fi
  while read -r d pct; do
    [[ -n "${d}" ]] || continue
    [[ "${pct}" =~ ^[0-9]+$ ]] || { alerte "espace disque illisible pour ${d}"; continue; }
    (( pct < DISQUE_MAX )) || alerte "disque ${d} plein à ${pct} % (seuil ${DISQUE_MAX} %)"
  done <<<"${ETAT_DISQUES}"
fi

# --- 7. Limites inotify de l'utilisateur (EXP-C11 : 486 « No space left on device » le 21/10) ---
# Une ligne « limites <max instances> <max surveillances> », puis une ligne « processus surveillances » par
# instance inotify. Seuil : 90 % de l'une des deux limites ; l'alerte nomme le plus gros consommateur.
if [[ -n "${F_INOTIFY}" || "${SIMULE}" -eq 0 ]]; then
  if [[ -n "${F_INOTIFY}" ]]; then
    ETAT_INOTIFY="$(cat "${F_INOTIFY}" 2>/dev/null)"
  else
    ETAT_INOTIFY="limites $(cat /proc/sys/fs/inotify/max_user_instances) $(cat /proc/sys/fs/inotify/max_user_watches)"$'\n'
    while read -r dossier fd; do
      ETAT_INOTIFY+="$(tr ' ' '_' < "${dossier%/fd}/comm" 2>/dev/null || echo inconnu) $(grep -c '^inotify' "${dossier%/fd}/fdinfo/${fd}" 2>/dev/null)"$'\n'
    done < <(find /proc/[0-9]*/fd -lname 'anon_inode:inotify' -printf '%h %f\n' 2>/dev/null)
  fi
  while IFS= read -r ligne; do
    [[ -n "${ligne}" ]] && alerte "${ligne}"
  done < <(awk '$1 == "limites" {mi = $2; mw = $3; next}
    NF == 2 {n++; w += $2; par[$1] += $2}
    END {
      if (mi == "" || mw == "") { print "limites inotify illisibles"; exit }
      for (p in par) if (par[p] > max) { max = par[p]; gros = p }
      if (n >= 0.9 * mi) printf "instances inotify : %d sur %d (plus gros : %s)\n", n, mi, gros
      if (w >= 0.9 * mw) printf "surveillances inotify : %d sur %d (plus gros : %s (%d))\n", w, mw, gros, max
    }' <<<"${ETAT_INOTIFY}")
fi

# --- Courriel (EXP-C3) : seulement quand la liste des anomalies change ; chiffres ignorés (âges, pourcentages) ---
courriel() { "$(dirname "${BASH_SOURCE[0]}")/alerte-courriel.sh" "$1" "$2"; }

# --- Verdict ---
if [[ "${#PROBLEMES[@]}" -eq 0 ]]; then
  echo "Atelier (port ${PORT}) : tout va bien."
  if [[ "${NOTIFIER}" -eq 1 && -f "${ETAT}" ]]; then
    courriel "Atelier marketing IA : rétabli (port ${PORT})" "Plus aucune anomalie au contrôle de $(date '+%d/%m/%Y %H:%M') sur $(hostname)." \
      && rm -f "${ETAT}"
  fi
  exit 0
fi

for p in "${PROBLEMES[@]}"; do echo "ALERTE Atelier (port ${PORT}) : ${p}" >&2; done
if [[ "${NOTIFIER}" -eq 1 ]]; then
  empreinte="$(printf '%s\n' "${PROBLEMES[@]}" | tr -d '0-9' | sha256sum | cut -d' ' -f1)"
  if [[ "$(cat "${ETAT}" 2>/dev/null)" != "${empreinte}" ]]; then
    courriel "Atelier marketing IA : alerte (port ${PORT})" "$(printf -- '- %s\n' "${PROBLEMES[@]}")
Contrôle du $(date '+%d/%m/%Y %H:%M') sur $(hostname). Historique : journalctl --user -u atelier-sante@atelier" \
      && mkdir -p "$(dirname "${ETAT}")" && printf '%s\n' "${empreinte}" > "${ETAT}"
  fi
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -u critical "Atelier marketing IA : alerte" "$(printf '%s\n' "${PROBLEMES[@]}")" \
      || echo "notify-send a échoué (pas de session graphique ?)" >&2
  else
    echo "notify-send indisponible : notification bureau ignorée." >&2
  fi
fi
exit 1

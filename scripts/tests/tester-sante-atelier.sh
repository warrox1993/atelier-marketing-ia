#!/usr/bin/env bash
# Tests de scripts/sante-atelier.sh avec des réponses simulées (aucun appel réseau, aucune instance touchée).
# Usage : scripts/tests/tester-sante-atelier.sh   (code 0 si tout passe)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${RACINE}/scripts/sante-atelier.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/sante-test-XXXXXX")" || exit 1
trap 'rm -rf "${TMP}"' EXIT
ECHECS=0; TOTAL=0

# attendre <nom> <code attendu> <fragment attendu dans la sortie, ou vide> <arguments du script…>
attendre() {
  local nom="$1" attendu="$2" fragment="$3"; shift 3
  local sortie code
  sortie="$("${SCRIPT}" "$@" 2>&1)"; code=$?
  TOTAL=$((TOTAL + 1))
  if [[ "${attendu}" == "0" && "${code}" -ne 0 ]] || [[ "${attendu}" == "non0" && "${code}" -eq 0 ]]; then
    echo "ECHEC  ${nom} : code ${code}, attendu ${attendu}"; echo "${sortie}" | sed 's/^/         /'; ECHECS=$((ECHECS + 1)); return
  fi
  if [[ -n "${fragment}" && "${sortie}" != *"${fragment}"* ]]; then
    echo "ECHEC  ${nom} : message sans « ${fragment} »"; echo "${sortie}" | sed 's/^/         /'; ECHECS=$((ECHECS + 1)); return
  fi
  echo "OK     ${nom} (code ${code})"
}

ecrire() { printf '%s' "$2" > "${TMP}/$1"; }

ecrire ok.json '{"status":"ok","databaseBackup":{"enabled":true,"status":"ok","backupDir":"/x","maxAgeHours":2,"latestBackup":{"name":"a.sql.gz","ageHours":0.4},"lastFailure":null,"warnings":[]}}'
ecrire ok-masque.json '{"status":"ok","databaseBackup":{"enabled":true,"status":"ok","warnings":[]}}'
ecrire echec.json '{"status":"ok","databaseBackup":{"enabled":true,"status":"warning","warnings":[{"code":"database_backup_last_failure","message":"pg_dump a échoué"}]}}'
ecrire ancienne.json '{"status":"ok","databaseBackup":{"enabled":true,"status":"ok","latestBackup":{"name":"a.sql.gz","ageHours":5.2},"warnings":[]}}'
ecrire ancienne-masque.json '{"status":"ok","databaseBackup":{"enabled":true,"status":"warning","warnings":[{"code":"database_backup_stale","message":"Latest database backup is 9h old, exceeding 2h."}]}}'
ecrire statut-ko.json '{"status":"unhealthy","databaseBackup":{"enabled":true,"status":"ok","warnings":[]}}'
ecrire plugins-ok.json '[{"pluginKey":"atelier.marketing-ia","status":"ready"},{"pluginKey":"autre","status":"error"}]'
ecrire plugins-ko.json '[{"pluginKey":"atelier.marketing-ia","status":"error"}]'
ecrire plugins-absent.json '[{"pluginKey":"autre","status":"ready"}]'
ecrire pass-ok.json '{"ok":true,"mode":"demonstration"}'
ecrire pass-ko.json '{"ok":false}'
: > "${TMP}/muet.json"

attendre "réponse ok (réponse complète)"        0    "tout va bien"           --fichier-reponse "${TMP}/ok.json"
attendre "réponse ok (réponse masquée)"         0    "tout va bien"           --fichier-reponse "${TMP}/ok-masque.json"
attendre "tout ok avec plugin et passerelle"    0    "tout va bien"           --fichier-reponse "${TMP}/ok.json" --fichier-plugins "${TMP}/plugins-ok.json" --fichier-passerelle "${TMP}/pass-ok.json"
attendre "sauvegarde de base en échec"          non0 "pg_dump a échoué"       --fichier-reponse "${TMP}/echec.json"
attendre "sauvegarde trop ancienne (âge)"       non0 "trop ancienne"          --fichier-reponse "${TMP}/ancienne.json"
attendre "sauvegarde trop ancienne (alerte)"    non0 "database_backup_stale"  --fichier-reponse "${TMP}/ancienne-masque.json"
attendre "seuil réglable (âge 5,2 h < 6 h)"     0    "tout va bien"           --fichier-reponse "${TMP}/ancienne.json" --age-max-heures 6
attendre "statut de santé non ok"               non0 "unhealthy"              --fichier-reponse "${TMP}/statut-ko.json"
attendre "serveur muet (réponse vide)"          non0 "pas de réponse"         --fichier-reponse "${TMP}/muet.json"
attendre "serveur muet (fichier absent)"        non0 "pas de réponse"         --fichier-reponse "${TMP}/inexistant.json"
attendre "plugin non prêt"                      non0 "non prêt"               --fichier-reponse "${TMP}/ok.json" --fichier-plugins "${TMP}/plugins-ko.json"
attendre "plugin absent de la liste"            non0 "absent"                 --fichier-reponse "${TMP}/ok.json" --fichier-plugins "${TMP}/plugins-absent.json"
attendre "passerelle ko"                        non0 "passerelle"             --fichier-reponse "${TMP}/ok.json" --fichier-passerelle "${TMP}/pass-ko.json"
attendre "passerelle muette"                    non0 "passerelle"             --fichier-reponse "${TMP}/ok.json" --fichier-passerelle "${TMP}/muet.json"
attendre "port sans instance (appel réel local refusé)" non0 "pas de réponse" --port 1
attendre "argument inconnu"                     non0 "Argument inconnu"       --bidon

echo "---"; echo "${TOTAL} tests, ${ECHECS} échec(s)"
[[ "${ECHECS}" -eq 0 ]]

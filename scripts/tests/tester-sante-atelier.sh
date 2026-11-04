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
ecrire unites-ok.txt $'atelier-listmonk active\natelier-pages active\n'
ecrire unites-ko.txt $'atelier-listmonk active\natelier-umami failed\n'
attendre "services annexes actifs"              0    "tout va bien"           --fichier-reponse "${TMP}/ok.json" --fichier-unites "${TMP}/unites-ok.txt"
attendre "service annexe arrêté"                non0 "atelier-umami arrêté"   --fichier-reponse "${TMP}/ok.json" --fichier-unites "${TMP}/unites-ko.txt"
attendre "états des services illisibles"        non0 "aucun état"             --fichier-reponse "${TMP}/ok.json" --fichier-unites "${TMP}/muet.json"
# Troisième colonne = activation (systemctl is-enabled) : un service désactivé est « à la demande » (règle de l'opérateur du
# 01/11/2026, aucun conteneur au démarrage) ; arrêté ou marqué failed après un arrêt forcé, ce n'est pas une anomalie.
ecrire unites-demande.txt $'atelier-pages active enabled\natelier-umami failed disabled\natelier-mailpit inactive disabled\n'
ecrire unites-active-ko.txt $'atelier-pages failed enabled\natelier-umami inactive disabled\n'
attendre "services à la demande arrêtés"        0    "tout va bien"           --fichier-reponse "${TMP}/ok.json" --fichier-unites "${TMP}/unites-demande.txt"
attendre "service permanent arrêté"             non0 "atelier-pages arrêté"   --fichier-reponse "${TMP}/ok.json" --fichier-unites "${TMP}/unites-active-ko.txt"
# --- Runs et agents (EXP-C1, EXP-C4) ---
ecrire agents.json '[{"id":"a1","name":"Gardien","status":"active"},{"id":"a2","name":"Veille","status":"idle"},{"id":"a3","name":"Direction","status":"idle"},{"id":"a4","name":"Rédaction","status":"paused"},{"id":"a5","name":"Analyste","status":"error"}]'
ecrire runs-ok.json '[{"agentId":"a1","status":"succeeded","createdAt":"2026-10-21T12:03:00Z"},{"agentId":"a1","status":"failed","createdAt":"2026-10-21T12:02:00Z"},{"agentId":"a1","status":"failed","createdAt":"2026-10-21T12:01:00Z"},{"agentId":"a1","status":"failed","createdAt":"2026-10-21T12:00:00Z"}]'
ecrire runs-serie.json '[{"agentId":"a1","status":"failed","errorCode":"adapter_failed","createdAt":"2026-10-21T12:00:00Z"},{"agentId":"a1","status":"timed_out","createdAt":"2026-10-21T12:02:00Z"},{"agentId":"a1","status":"failed","createdAt":"2026-10-21T12:01:00Z"},{"agentId":"a1","status":"succeeded","createdAt":"2026-10-21T11:00:00Z"},{"agentId":"a2","status":"failed","createdAt":"2026-10-21T12:00:00Z"},{"agentId":"a2","status":"failed","createdAt":"2026-10-21T12:01:00Z"}]'
ecrire runs-auth.json '[{"agentId":"a3","status":"failed","errorCode":"claude_auth_required","createdAt":"2026-10-19T16:46:00Z"},{"agentId":"a3","status":"succeeded","createdAt":"2026-10-19T15:00:00Z"}]'
ecrire runs-pause.json '[{"agentId":"a4","status":"failed","createdAt":"2026-10-21T12:00:00Z"},{"agentId":"a4","status":"failed","createdAt":"2026-10-21T12:01:00Z"},{"agentId":"a4","status":"failed","createdAt":"2026-10-21T12:02:00Z"}]'
ecrire agents-ok.json '[{"id":"a1","name":"Gardien","status":"active"}]'
ecrire runs-deux.json '[{"agentId":"a1","status":"failed","createdAt":"2026-10-21T12:00:00Z"},{"agentId":"a1","status":"failed","createdAt":"2026-10-21T12:01:00Z"}]'
attendre "runs : dernier réussi après des échecs"   0    "tout va bien"            --fichier-reponse "${TMP}/ok.json" --fichier-agents "${TMP}/agents-ok.json" --fichier-runs "${TMP}/runs-ok.json"
attendre "runs : 3 échecs de suite (ordre mêlé)"   non0 "Gardien : 3 runs de suite en échec" --fichier-reponse "${TMP}/ok.json" --fichier-agents "${TMP}/agents-ok.json" --fichier-runs "${TMP}/runs-serie.json"
attendre "runs : 2 échecs seulement, pas d'alerte" 0    "tout va bien"            --fichier-reponse "${TMP}/ok.json" --fichier-agents "${TMP}/agents-ok.json" --fichier-runs "${TMP}/runs-deux.json"
attendre "runs d'un agent hors de la liste ignorés" 0   "tout va bien"            --fichier-reponse "${TMP}/ok.json" --fichier-agents "${TMP}/agents-ok.json" --fichier-runs "${TMP}/runs-pause.json"
attendre "runs : agent en pause ignoré"            non0 "Analyste en erreur"      --fichier-reponse "${TMP}/ok.json" --fichier-agents "${TMP}/agents.json" --fichier-runs "${TMP}/runs-pause.json"
sortie_pause="$("${SCRIPT}" --fichier-reponse "${TMP}/ok.json" --fichier-agents "${TMP}/agents.json" --fichier-runs "${TMP}/runs-pause.json" 2>&1)"
TOTAL=$((TOTAL + 1)); [[ "${sortie_pause}" != *"Rédaction"* ]] && echo "OK     runs : pas d'alerte pour l'agent en pause" || { echo "ECHEC  runs : agent en pause signalé"; ECHECS=$((ECHECS + 1)); }
attendre "agent en statut error"                   non0 "Analyste en erreur"      --fichier-reponse "${TMP}/ok.json" --fichier-agents "${TMP}/agents.json" --fichier-runs "${TMP}/runs-ok.json"
attendre "connexion Claude perdue"                 non0 "claude_auth_required"    --fichier-reponse "${TMP}/ok.json" --fichier-agents "${TMP}/agents.json" --fichier-runs "${TMP}/runs-auth.json"
attendre "runs illisibles"                         non0 "runs"                    --fichier-reponse "${TMP}/ok.json" --fichier-runs "${TMP}/muet.json"

# --- Disques (EXP-C4) et inotify (EXP-C11) ---
ecrire disques-ok.txt $'/ 65\n/mnt/donnees 43\n'
ecrire disques-ko.txt $'/ 91\n/mnt/donnees 43\n'
attendre "disques sous le seuil"                   0    "tout va bien"            --fichier-reponse "${TMP}/ok.json" --fichier-disques "${TMP}/disques-ok.txt"
attendre "disque plein à 91 %"                     non0 "disque / plein à 91 %"   --fichier-reponse "${TMP}/ok.json" --fichier-disques "${TMP}/disques-ko.txt"
ATELIER_SANTE_DISQUE_MAX=95 attendre "seuil disque réglable" 0 "tout va bien"     --fichier-reponse "${TMP}/ok.json" --fichier-disques "${TMP}/disques-ko.txt"
ecrire inotify-ok.txt $'limites 1024 524288\ngnome-shell 120\nnode 3000\n'
ecrire inotify-ko.txt $'limites 1024 524288\ngnome-shell 120\nnode 400000\nnode 80000\n'
ecrire inotify-inst.txt "limites 4 524288"$'\n'"a 1"$'\n'"b 1"$'\n'"c 1"$'\n'"d 1"$'\n'
attendre "inotify sous les limites"                0    "tout va bien"            --fichier-reponse "${TMP}/ok.json" --fichier-inotify "${TMP}/inotify-ok.txt"
attendre "inotify : surveillances presque épuisées" non0 "plus gros : node (480000)" --fichier-reponse "${TMP}/ok.json" --fichier-inotify "${TMP}/inotify-ko.txt"
attendre "inotify : instances presque épuisées"    non0 "instances inotify : 4 sur 4" --fichier-reponse "${TMP}/ok.json" --fichier-inotify "${TMP}/inotify-inst.txt"

# --- Notification et courriel (EXP-C3) : doublures de notify-send et de curl, aucun envoi réel ---
mkdir -p "${TMP}/bin"
printf '#!/usr/bin/env bash\necho notify >> "%s/notify.log"\n' "${TMP}" > "${TMP}/bin/notify-send"
printf '#!/usr/bin/env bash\ncat >> "%s/courriel.log"; echo "---" >> "%s/courriel.log"\n' "${TMP}" "${TMP}" > "${TMP}/bin/curl"
chmod +x "${TMP}/bin/notify-send" "${TMP}/bin/curl"
printf 'machine smtp.exemple.org login a@exemple.org password x\n' > "${TMP}/netrc"; chmod 600 "${TMP}/netrc"
printf 'ATELIER_ALERTE_A=jb@exemple.org\nATELIER_ALERTE_DE=atelier@exemple.org\nATELIER_ALERTE_SMTP=smtps://smtp.exemple.org:465\nATELIER_ALERTE_NETRC=%s/netrc\n' "${TMP}" > "${TMP}/alerte.env"
notifier() {
  PATH="${TMP}/bin:${PATH}" ATELIER_ALERTE_CONFIG="${TMP}/alerte.env" ATELIER_SANTE_ETAT="${TMP}/etat" \
    "${SCRIPT}" --notifier --fichier-reponse "${TMP}/ok.json" "$@" >/dev/null 2>&1
}
courriels() { grep -c '^---$' "${TMP}/courriel.log" 2>/dev/null || true; }
verifier() { TOTAL=$((TOTAL + 1)); if [[ "$2" == "$3" ]]; then echo "OK     $1"; else echo "ECHEC  $1 : $2 au lieu de $3"; ECHECS=$((ECHECS + 1)); fi; }
notifier --fichier-disques "${TMP}/disques-ko.txt"
verifier "anomalie : un courriel" "$(courriels)" 1
verifier "anomalie : une notification bureau" "$(grep -c notify "${TMP}/notify.log" 2>/dev/null)" 1
notifier --fichier-disques "${TMP}/disques-ko.txt"
verifier "même anomalie au contrôle suivant : pas de second courriel" "$(courriels)" 1
ecrire disques-ko2.txt $'/ 93\n/mnt/donnees 43\n'
notifier --fichier-disques "${TMP}/disques-ko2.txt"
verifier "même anomalie, chiffre changé : pas de courriel" "$(courriels)" 1
notifier --fichier-disques "${TMP}/disques-ko.txt" --fichier-runs "${TMP}/runs-serie.json" --fichier-agents "${TMP}/agents-ok.json"
verifier "nouvelle anomalie : nouveau courriel" "$(courriels)" 2
notifier --fichier-disques "${TMP}/disques-ok.txt"
verifier "retour à la normale : courriel « rétabli »" "$(courriels)" 3
verifier "courriel « rétabli » lisible" "$(grep -c "$(printf 'Atelier marketing IA : r\xc3\xa9tabli (port 3100)' | base64 -w0)" "${TMP}/courriel.log")" 1
notifier --fichier-disques "${TMP}/disques-ok.txt"
verifier "tout va bien ensuite : aucun courriel" "$(courriels)" 3

attendre "port sans instance (appel réel local refusé)" non0 "pas de réponse" --port 1
attendre "argument inconnu"                     non0 "Argument inconnu"       --bidon

echo "---"; echo "${TOTAL} tests, ${ECHECS} échec(s)"
[[ "${ECHECS}" -eq 0 ]]

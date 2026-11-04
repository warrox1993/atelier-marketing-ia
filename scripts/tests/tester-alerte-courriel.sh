#!/usr/bin/env bash
# Tests de scripts/alerte-courriel.sh : curl est remplacé par une doublure, aucun courriel ne part.
# Usage : scripts/tests/tester-alerte-courriel.sh   (code 0 si tout passe)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${RACINE}/scripts/alerte-courriel.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/alerte-courriel-test-XXXXXX")" || exit 1
trap 'rm -rf "${TMP}"' EXIT
ECHECS=0; TOTAL=0

# Doublure du transport : note ses arguments et le message reçu, code de sortie réglable.
mkdir -p "${TMP}/bin"
cat > "${TMP}/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "${DOUBLURE}/args"; cat > "${DOUBLURE}/message"; exit "${DOUBLURE_CODE:-0}"
EOF
chmod +x "${TMP}/bin/curl"
# Doublure du journal : rend des lignes reconnaissables et note ses arguments.
cat > "${TMP}/bin/journalctl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "${DOUBLURE}/args-journal"
if [[ -n "${DOUBLURE_JOURNAL:-}" ]]; then cat "${DOUBLURE_JOURNAL}"; else echo "2026-10-30T18:00:00+01:00 hote systemd[1]: unite.service: Failed with result 'exit-code'."; fi
EOF
chmod +x "${TMP}/bin/journalctl"
export PATH="${TMP}/bin:${PATH}" DOUBLURE="${TMP}"

printf 'machine smtp.exemple.org login a@exemple.org password x\n' > "${TMP}/netrc"; chmod 600 "${TMP}/netrc"
cat > "${TMP}/ok.env" <<EOF
ATELIER_ALERTE_A=jb@exemple.org
ATELIER_ALERTE_DE=atelier@exemple.org
ATELIER_ALERTE_SMTP=smtps://smtp.exemple.org:465
ATELIER_ALERTE_NETRC=${TMP}/netrc
EOF

# cas <nom> <code attendu> <fragment attendu dans la sortie ou les traces de la doublure> <config> <arguments…>
cas() {
  local nom="$1" attendu="$2" fragment="$3" config="$4"; shift 4
  rm -f "${TMP}/args" "${TMP}/message"
  local sortie code
  sortie="$(ATELIER_ALERTE_CONFIG="${config}" "${SCRIPT}" "$@" 2>&1)"; code=$?
  sortie+=$'\n'"$(cat "${TMP}/args" "${TMP}/message" 2>/dev/null)"
  TOTAL=$((TOTAL + 1))
  if [[ "${code}" != "${attendu}" ]]; then
    echo "ECHEC  ${nom} : code ${code}, attendu ${attendu}"; echo "${sortie}" | sed 's/^/         /'; ECHECS=$((ECHECS + 1)); return
  fi
  if [[ -n "${fragment}" && "${sortie}" != *"${fragment}"* ]]; then
    echo "ECHEC  ${nom} : sans « ${fragment} »"; echo "${sortie}" | sed 's/^/         /'; ECHECS=$((ECHECS + 1)); return
  fi
  echo "OK     ${nom} (code ${code})"
}

SUJET_B64="$(printf 'Atelier : échec' | base64 -w0)"
cas "envoi : sujet encodé en UTF-8"           0 "Subject: =?UTF-8?B?${SUJET_B64}?="  "${TMP}/ok.env" "Atelier : échec" $'ligne 1\nligne 2'
cas "envoi : TLS exigé et destinataire"       0 "--ssl-reqd"                          "${TMP}/ok.env" "s" "c"
cas "envoi : destinataire passé à curl"       0 "jb@exemple.org"                      "${TMP}/ok.env" "s" "c"
cas "envoi : corps transmis"                  0 "ligne 2"                             "${TMP}/ok.env" "s" $'ligne 1\nligne 2'
[[ ! -e "${TMP}/args" ]] || grep -q -- '--netrc-file' "${TMP}/args" || { echo "ECHEC  mot de passe hors ligne de commande"; ECHECS=$((ECHECS + 1)); }
cas "sujet sans saut de ligne (en-têtes)"     0 "$(printf 'a b' | base64 -w0)"        "${TMP}/ok.env" $'a\nb' "c"
cas "non configuré : rien n'est envoyé"       0 "non configuré"                       "${TMP}/absent.env" "s" "c"
[[ ! -e "${TMP}/args" ]] || { echo "ECHEC  non configuré : curl appelé"; ECHECS=$((ECHECS + 1)); }
DOUBLURE_CODE=67 cas "échec du transport signalé"  1 "échec de l'envoi"              "${TMP}/ok.env" "s" "c"
chmod 644 "${TMP}/netrc"
cas "mot de passe lisible par d'autres refusé" 1 "chmod 600"                          "${TMP}/ok.env" "s" "c"
chmod 600 "${TMP}/netrc"
sed 's/^ATELIER_ALERTE_A=.*/ATELIER_ALERTE_A=pas une adresse/' "${TMP}/ok.env" > "${TMP}/a.env"
cas "destinataire invalide refusé"            1 "invalide"                            "${TMP}/a.env" "s" "c"
sed 's|^ATELIER_ALERTE_SMTP=.*|ATELIER_ALERTE_SMTP=http://smtp.exemple.org|' "${TMP}/ok.env" > "${TMP}/s.env"
cas "serveur non SMTP refusé"                 1 "ATELIER_ALERTE_SMTP invalide"        "${TMP}/s.env" "s" "c"
cas "mauvais usage"                           2 "Usage"                               "${TMP}/ok.env" "seul"
# Reste L4 / B-2 : l'alerte d'une unité en échec ne joint QUE l'horodatage, l'unité et la ligne de résultat de systemd ;
# jamais le texte des messages (données de tiers, noms, adresses, numéros : aucune liste de masquage ne les attrape tous).
cas "journal de l'unité joint au courriel"    0 "Failed with result 'exit-code'"      "${TMP}/ok.env" --journal atelier-instance@atelier.service "s" "c"
grep -qx -- "--user" "${TMP}/args-journal" 2>/dev/null && grep -qx -- "atelier-instance@atelier.service" "${TMP}/args-journal" \
  || { echo "ECHEC  journal : journalctl --user -u <unité> attendu"; ECHECS=$((ECHECS + 1)); }
cas "journal : unité au nom invalide refusée" 2 "Usage"                               "${TMP}/ok.env" --journal 'a;b' "s" "c"
cat > "${TMP}/journal" <<'JOURNAL'
2026-10-30T18:00:00+01:00 hote node[42]: connexion refusée pour cabinet.dupont@prospect.example au 0470 12 34 56
2026-10-30T18:00:01+01:00 hote node[42]: rappel prospect 04 / 223 45 67 (Marie Exemple, rue de la Station 12, 4000 Liège)
2026-10-30T18:00:02+01:00 hote node[42]: {"level":50,"reqBody":{"nom":"Docteur Exemplaire"},"msg":"échec"}
2026-10-30T18:00:03+01:00 hote node[42]: en-tête Bearer eyJhbGciOiJIUzI1NiJ9.e30.c2lnbmF0dXJl et password=MotDePasse123
2026-10-30T18:00:04+01:00 hote node[42]: appel +32 4 222 33 44 ０４２２３４５６７ derniere ligne du journal
2026-10-30T18:00:05+01:00 hote systemd[1456]: atelier-essai.service: Main process exited, code=exited, status=1/FAILURE
2026-10-30T18:00:06+01:00 hote systemd[1456]: atelier-essai.service: Failed with result 'exit-code'.
2026-10-30T18:00:07+01:00 hote node[42]: faux résultat Marie Exemple, Failed with result 'x y' et 04 / 223 45 67
JOURNAL
DOUBLURE_JOURNAL="${TMP}/journal" cas "journal : horodatage, unité et résultat systemd gardés" 0 "2026-10-30T18:00:06+01:00 atelier-essai.service : Failed with result 'exit-code'" "${TMP}/ok.env" --journal atelier-essai.service "s" "c"
cas "journal : la commande pour lire le reste est indiquée" 0 "journalctl --user -u atelier-essai.service" "${TMP}/ok.env" --journal atelier-essai.service "s" "c"
for absent in "cabinet.dupont" "prospect.example" "0470 12 34 56" "04 / 223 45 67" "Marie Exemple" "rue de la Station" "Liège" "Docteur Exemplaire" "eyJhbGci" "c2lnbmF0dXJl" "MotDePasse123" "222 33 44" "０４２２３４５６７" "derniere ligne du journal" "connexion refusée" "Main process exited" "faux résultat" "sk_live_"; do
  TOTAL=$((TOTAL + 1))
  if grep -qF -- "${absent}" "${TMP}/message"; then echo "ECHEC  journal : « ${absent} » présent dans le corps"; ECHECS=$((ECHECS + 1)); else echo "OK     journal : sans « ${absent} »"; fi
done

echo "---"; echo "${TOTAL} tests, ${ECHECS} échec(s)"
[[ "${ECHECS}" -eq 0 ]]

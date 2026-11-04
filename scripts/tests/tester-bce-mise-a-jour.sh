#!/usr/bin/env bash
# Tests de scripts/bce-mise-a-jour.sh (AFC-A10) sur une arborescence FACTICE : le CLI de la passerelle est remplacé par
# un faux cli.js qui imite ses réponses ; aucun appel au portail BCE, aucun identifiant réel lu.
# Contrôle aussi la minuterie du dépôt (scripts/systemd/atelier-bce-maj.*), qui n'est pas installée.
# Usage : scripts/tests/tester-bce-mise-a-jour.sh   (code 0 si tout passe)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/bce-test-XXXXXX")" || exit 1
trap 'case "${TMP}" in "${TMPDIR:-/tmp}"/bce-test-*) rm -rf -- "${TMP}" ;; esac' EXIT
ECHECS=0; TOTAL=0
D="${TMP}/depot"; IDS="${TMP}/ids.txt"

mkdir -p "${D}/scripts" "${D}/passerelle/dist/src/reel/prospection" "${D}/instance/donnees/bce"
command cp -f "${RACINE}/scripts/bce-mise-a-jour.sh" "${D}/scripts/"
# Faux CLI : réponse choisie par BCE_FAUX (ok, refus, incomplet, panne), mêmes messages que telechargement.ts:39 et :180.
cat > "${D}/passerelle/dist/src/reel/prospection/cli.js" <<'EOF'
const r = process.env.BCE_FAUX;
if (r === "ok") { console.log("import terminé : 3 fichiers"); process.exit(0); }
if (r === "refus") console.error("Connexion au portail BCE refusée : identifiant ou mot de passe incorrect (ou compte non activé).");
if (r === "incomplet") console.error("PASSERELLE_BCE_IDENTIFIANTS_FICHIER : les lignes identifiant=… et mot_de_passe=… sont obligatoires.");
if (r === "panne") console.error("réseau indisponible");
process.exit(1);
EOF
printf 'identifiant=essai\nmot_de_passe=essai\n' > "${IDS}"; chmod 600 "${IDS}"

cas() {   # cas <nom> <code attendu> <fragment du journal> <BCE_FAUX> <fichier d'identifiants>
  local nom="$1" attendu="$2" fragment="$3" code
  : > "${D}/instance/donnees/bce/maj.log"
  BCE_FAUX="$4" PASSERELLE_BCE_IDENTIFIANTS_FICHIER="$5" "${D}/scripts/bce-mise-a-jour.sh" >/dev/null 2>&1; code=$?
  TOTAL=$((TOTAL + 1))
  if [[ "${code}" != "${attendu}" ]] || ! grep -qF -- "${fragment}" "${D}/instance/donnees/bce/maj.log"; then
    echo "ECHEC  ${nom} : code ${code}, attendu ${attendu} avec « ${fragment} » au journal"; sed 's/^/         /' "${D}/instance/donnees/bce/maj.log"
    ECHECS=$((ECHECS + 1)); return
  fi
  echo "OK     ${nom} (code ${code})"
}

cas "succès : import journalisé"                   0 "terminée avec succès"            ok        "${IDS}"
cas "identifiants refusés par le portail (21/10)"  3 "refuse les identifiants"         refus     "${IDS}"
cas "identifiants incomplets"                      2 "absents ou incomplets"           incomplet "${IDS}"
cas "échec d'une autre nature"                     1 "a échoué (code 1)"               panne     "${IDS}"
cas "fichier d'identifiants absent"                2 "absent ou illisible"             ok        "${TMP}/absent.txt"
chmod 644 "${IDS}"
cas "identifiants lisibles par d'autres refusés"   2 "chmod 600"                       ok        "${IDS}"
chmod 600 "${IDS}"
TOTAL=$((TOTAL + 1))
if grep -q "mot_de_passe=essai\|essai$" "${D}/instance/donnees/bce/maj.log"; then echo "ECHEC  journal sans identifiant"; ECHECS=$((ECHECS + 1)); else echo "OK     journal sans identifiant"; fi
rm -f "${D}/passerelle/dist/src/reel/prospection/cli.js"
cas "passerelle non compilée"                      4 "passerelle non compilée"         ok        "${IDS}"

# Minuterie du dépôt : le 5 du mois à 04 h, rattrapée au démarrage, alerte en cas d'échec.
U="${RACINE}/scripts/systemd"
TOTAL=$((TOTAL + 1))
if grep -qx 'OnCalendar=\*-\*-05 04:00:00' "${U}/atelier-bce-maj.timer" && grep -qx 'Persistent=true' "${U}/atelier-bce-maj.timer" \
   && grep -qx 'Unit=atelier-bce-maj.service' "${U}/atelier-bce-maj.timer" && grep -qx 'OnFailure=atelier-alerte@%n.service' "${U}/atelier-bce-maj.service" \
   && grep -q '^ExecStart=.*scripts/bce-mise-a-jour.sh$' "${U}/atelier-bce-maj.service"; then
  echo "OK     minuterie : le 5 à 04 h, Persistent, alerte OnFailure"
else
  echo "ECHEC  minuterie : OnCalendar, Persistent, Unit, OnFailure ou ExecStart inattendus"; ECHECS=$((ECHECS + 1))
fi
TOTAL=$((TOTAL + 1))
if systemd-analyze --user verify "${U}/atelier-bce-maj.service" "${U}/atelier-bce-maj.timer" 2>&1 | grep -q 'atelier-bce'; then
  echo "ECHEC  systemd-analyze signale un défaut sur les unités BCE"; ECHECS=$((ECHECS + 1))
else
  echo "OK     systemd-analyze --user verify sans remarque sur les unités BCE"
fi

echo "---"; echo "${TOTAL} tests, ${ECHECS} échec(s)"
[[ "${ECHECS}" -eq 0 ]]

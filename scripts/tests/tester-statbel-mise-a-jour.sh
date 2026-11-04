#!/usr/bin/env bash
# Tests de scripts/statbel-mise-a-jour.sh sur une fausse racine, sans réseau : on s'arrête au contrôle des réglages, avant tout
# téléchargement. Usage : scripts/tests/tester-statbel-mise-a-jour.sh   (code 0 si tout passe)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/statbel-test-XXXXXX")" || exit 1
trap 'rm -rf "${TMP}"' EXIT
ECHECS=0

mkdir -p "${TMP}/scripts" "${TMP}/passerelle/dist/src/reel/statbel"
cp "${RACINE}/scripts/statbel-mise-a-jour.sh" "${TMP}/scripts/"
: > "${TMP}/passerelle/dist/src/reel/statbel/cli.js"

# Mullvad est supprimé du poste depuis le 25/10/2026 (AFC-A17) : l'ancienne option ne doit plus rien changer, ni sortir en code 4.
sortie="$(STATBEL_HORS_VPN=1 STATBEL_ANNEE_MAX=abc bash "${TMP}/scripts/statbel-mise-a-jour.sh" 2>&1)"; code=$?
if [ "${code}" -eq 2 ] && [[ "${sortie}" == *"STATBEL_ANNEE_MAX doit être une année"* ]]; then
  echo "OK     STATBEL_HORS_VPN=1 ignorée : on atteint le contrôle de l'année (code 2)"
else
  echo "ECHEC  STATBEL_HORS_VPN=1 : code ${code}, attendu 2"; echo "${sortie}" | sed 's/^/         /'; ECHECS=$((ECHECS + 1))
fi
if grep -qiE 'mullvad|STATBEL_HORS_VPN' "${RACINE}/scripts/statbel-mise-a-jour.sh"; then
  echo "ECHEC  le script cite encore Mullvad ou STATBEL_HORS_VPN"; ECHECS=$((ECHECS + 1))
else
  echo "OK     plus aucune mention de Mullvad ni de STATBEL_HORS_VPN"
fi

[ "${ECHECS}" -eq 0 ]

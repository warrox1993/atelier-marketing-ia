#!/usr/bin/env bash
# Tests de scripts/sauvegarde-hors-machine.sh sur une arborescence factice (aucune instance réelle touchée).
# Usage : scripts/tests/tester-sauvegarde-hors-machine.sh   (code 0 si tout passe)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${RACINE}/scripts/sauvegarde-hors-machine.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/sauvegarde-test-XXXXXX")" || exit 1
trap 'rm -rf "${TMP}"' EXIT
ECHECS=0; TOTAL=0

# attendre <nom> <code attendu : 0|non0> <fragment attendu dans la sortie, ou vide> <arguments du script…>
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

verifie() {   # verifie <nom> <commande…> : réussit si la commande réussit
  local nom="$1"; shift
  TOTAL=$((TOTAL + 1))
  if "$@" >/dev/null 2>&1; then echo "OK     ${nom}"; else echo "ECHEC  ${nom}"; ECHECS=$((ECHECS + 1)); fi
}

# Arborescence factice : deux instances, éléments uniques.
fabriquer() {
  local s="$1" id
  for id in atelier atelier-apercu; do
    local b="${s}/instance/instances/${id}"
    mkdir -p "${b}/data/backups" "${b}/secrets" "${b}/companies/c1" "${b}/data/storage" "${b}/db"
    echo "ancienne" | gzip > "${b}/data/backups/paperclip-20260101-000000.sql.gz"
    echo "recente ${id}" | gzip > "${b}/data/backups/paperclip-20260102-000000.sql.gz"
    echo "cle-${id}" > "${b}/secrets/master.key"
    echo "doc" > "${b}/companies/c1/doc.md"
    echo "piece" > "${b}/data/storage/p.bin"
    echo "VIVANTE" > "${b}/db/base-vivante"
  done
  mkdir -p "${s}/instance/cles" "${s}/instance/secrets" "${s}/instance/passerelles" \
           "${s}/instance/plugin-jb" "${s}/instance/plugin-apercu" "${s}/instance/demo-reel" "${s}/passerelle/etat"
  echo k > "${s}/instance/cles/a.pem"; echo s > "${s}/instance/secrets/b.txt"; echo p > "${s}/instance/passerelles/p.env"
  echo j > "${s}/instance/plugin-jb/m.js"; echo a > "${s}/instance/plugin-apercu/m.js"
  echo d > "${s}/instance/demo-reel/d.json"; ln -s demo-reel "${s}/instance/demo-client"
  echo i > "${s}/passerelle/etat/index.db"
}

SRC="${TMP}/source"; DST="${TMP}/dest"; mkdir -p "${SRC}" "${DST}"; fabriquer "${SRC}"
COMMUN=(--source "${SRC}" --meme-disque)

# 1. Copie complète et empreintes identiques.
attendre "copie complète" 0 "empreintes vérifiées" "${DST}" "${COMMUN[@]}"
COPIE="$(find "${DST}" -mindepth 1 -maxdepth 1 -type d -name 'atelier-*' | head -n 1)"
verifie "dossier daté en 0700"                  test "$(stat -c %a "${COPIE}")" = "700"
verifie "EMPREINTES.sha256 présent"              test -s "${COPIE}/EMPREINTES.sha256"
verifie "contrôle sha256sum -c sur la copie"     bash -c "cd '${COPIE}' && sha256sum -c --quiet EMPREINTES.sha256"
verifie "--verifier accepte la copie"            "${SCRIPT}" --verifier "${COPIE}"
verifie "dernière sauvegarde copiée"             test -f "${COPIE}/instance/instances/atelier/data/backups/paperclip-20260102-000000.sql.gz"
verifie "ancienne sauvegarde non copiée"         test ! -e "${COPIE}/instance/instances/atelier/data/backups/paperclip-20260101-000000.sql.gz"
verifie "master.key copiée"                      cmp "${SRC}/instance/instances/atelier-apercu/secrets/master.key" "${COPIE}/instance/instances/atelier-apercu/secrets/master.key"
verifie "base vivante db/ non copiée"            test ! -e "${COPIE}/instance/instances/atelier/db"
verifie "data/storage et companies copiés"       test -f "${COPIE}/instance/instances/atelier/data/storage/p.bin" -a -f "${COPIE}/instance/instances/atelier/companies/c1/doc.md"
verifie "demo-client suivi (contenu copié)"      test -f "${COPIE}/instance/demo-client/d.json"
verifie "passerelle/etat et plugins copiés"      test -f "${COPIE}/passerelle/etat/index.db" -a -f "${COPIE}/instance/plugin-jb/m.js" -a -f "${COPIE}/instance/plugin-apercu/m.js"

# 2. Empreinte altérée → non nul.
echo "altéré" >> "${COPIE}/instance/cles/a.pem"
attendre "empreinte altérée détectée" non0 "empreinte différente" --verifier "${COPIE}"

# 3. Élément obligatoire manquant → non nul (et rien n'est créé).
AVANT="$(find "${DST}" -mindepth 1 -maxdepth 1 | wc -l)"
mv "${SRC}/instance/instances/atelier/secrets/master.key" "${TMP}/master.key.sauve"
attendre "master.key manquante"             non0 "master.key" "${DST}" "${COMMUN[@]}"
mv "${TMP}/master.key.sauve" "${SRC}/instance/instances/atelier/secrets/master.key"
mv "${SRC}/passerelle/etat" "${TMP}/etat.sauve"
attendre "passerelle/etat manquant"         non0 "passerelle/etat" "${DST}" "${COMMUN[@]}"
mv "${TMP}/etat.sauve" "${SRC}/passerelle/etat"
mv "${SRC}/instance/instances/atelier-apercu/data/backups" "${TMP}/backups.sauve"
attendre "aucune sauvegarde de base"        non0 "aucune sauvegarde de base" "${DST}" "${COMMUN[@]}"
mv "${TMP}/backups.sauve" "${SRC}/instance/instances/atelier-apercu/data/backups"
verifie "aucune copie créée en cas d'échec"  test "$(find "${DST}" -mindepth 1 -maxdepth 1 | wc -l)" = "${AVANT}"

# 4. Destination absente ; argument inconnu ; --garder invalide.
attendre "destination inexistante"          non0 "n'existe pas" "${TMP}/absent" "${COMMUN[@]}"
attendre "--garder invalide"                non0 "--garder" "${DST}" "${COMMUN[@]}" --garder 0

# 5. Même disque refusé (sans --meme-disque).
attendre "même disque refusé"               non0 "même disque" "${DST}" --source "${SRC}"

# 6. Mode essai : rien n'est copié.
D2="${TMP}/dest-essai"; mkdir -p "${D2}"
attendre "essai : affiche sans copier"     0    "ESSAI" "${D2}" "${COMMUN[@]}" --essai
verifie "essai : destination vide"          test -z "$(ls -A "${D2}")"

# 7. Rotation : 3 copies anciennes factices + la nouvelle, garder 2.
D3="${TMP}/dest-rotation"; mkdir -p "${D3}"
for n in 20250101-0100 20250102-0100 20250103-0100; do
  mkdir -p "${D3}/atelier-${n}"; echo x > "${D3}/atelier-${n}/EMPREINTES.sha256"
done
mkdir -p "${D3}/autre-dossier"
attendre "rotation (garder 2)"              0    "Rotation" "${D3}" "${COMMUN[@]}" --garder 2
verifie "rotation : 2 copies restantes"      test "$(find "${D3}" -maxdepth 1 -type d -name 'atelier-*' | wc -l)" = "2"
verifie "rotation : la plus récente gardée"  test -f "${D3}/atelier-20250103-0100/EMPREINTES.sha256"
verifie "rotation : les plus anciennes supprimées" test ! -e "${D3}/atelier-20250101-0100" -a ! -e "${D3}/atelier-20250102-0100"
verifie "rotation : dossier étranger intact" test -d "${D3}/autre-dossier"

echo "---"; echo "${TOTAL} tests, ${ECHECS} échec(s)"
[[ "${ECHECS}" -eq 0 ]]

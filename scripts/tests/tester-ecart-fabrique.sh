#!/usr/bin/env bash
# Test de scripts/ecart-fabrique.sh : dépôt et copie installée factices dans un dossier temporaire,
# jamais le vrai /opt ni le vrai /var/lib.
# Usage : scripts/tests/tester-ecart-fabrique.sh   (code 0 si tout passe)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ECHECS=0; TOTAL=0
ok() { TOTAL=$((TOTAL + 1)); echo "OK     $1"; }
ko() { TOTAL=$((TOTAL + 1)); ECHECS=$((ECHECS + 1)); echo "ECHEC  $1"; }

TMP="$(mktemp -d)" || { echo "mktemp impossible" >&2; exit 1; }
trap 'rm -rf -- "${TMP}"' EXIT

# Dépôt factice : le script est copié dans son dossier scripts/ (il en déduit la racine du dépôt).
DEPOT="${TMP}/depot"; INSTALLEE="${TMP}/opt/lib/fabrique"; ETAT="${TMP}/etat"
mkdir -p "${DEPOT}/scripts"
cp "${RACINE}/scripts/ecart-fabrique.sh" "${DEPOT}/scripts/" 2>/dev/null

construire() {
  rm -rf -- "${DEPOT}/fabrique" "${INSTALLEE}" "${ETAT}"
  mkdir -p "${DEPOT}/fabrique/generateurs" "${DEPOT}/fabrique/hyperframes/gabarits/a" \
    "${DEPOT}/fabrique/hyperframes/gabarits-images" "${DEPOT}/fabrique/tests" "${DEPOT}/fabrique/__pycache__" \
    "${DEPOT}/fabrique/polices/archivo" "${ETAT}/livrables/ent/t1"
  echo 'a = 1' > "${DEPOT}/fabrique/service.py"
  echo 'g = 1' > "${DEPOT}/fabrique/generateurs/voix.py"
  echo '{}' > "${DEPOT}/fabrique/modeles.json"
  echo '{}' > "${DEPOT}/fabrique/hyperframes/csp-hashes.json"
  echo 'x' > "${DEPOT}/fabrique/hyperframes/gabarits/a/index.html"
  echo 'y' > "${DEPOT}/fabrique/hyperframes/gabarits-images/b.html"
  echo 'font' > "${DEPOT}/fabrique/polices/archivo/OFL.txt"
  mkdir -p "$(dirname "${INSTALLEE}")"
  cp -a "${DEPOT}/fabrique" "${INSTALLEE}"
  # Éléments du dépôt qui ne sont jamais installés.
  echo 't' > "${DEPOT}/fabrique/tests/test_x.py"
  echo 'c' > "${DEPOT}/fabrique/__pycache__/service.cpython-312.pyc"
  rm -rf -- "${INSTALLEE}/tests" "${INSTALLEE}/__pycache__"
}

lancer() {
  SORTIE="$(ATELIER_FABRIQUE_INSTALLEE="${INSTALLEE}" ATELIER_FABRIQUE_ETAT="${ETAT}" \
    bash "${DEPOT}/scripts/ecart-fabrique.sh" 2>&1)"; CODE=$?
}
attendre() { # <libellé> <code> [motif...]
  local libelle="$1" code="$2" motif; shift 2
  if [[ "${CODE}" -ne "${code}" ]]; then ko "${libelle} : code ${CODE} au lieu de ${code} (${SORTIE})"; return; fi
  for motif in "$@"; do
    grep -qF -- "${motif}" <<<"${SORTIE}" || { ko "${libelle} : « ${motif} » absent (${SORTIE})"; return; }
  done
  ok "${libelle}"
}

bash -n "${RACINE}/scripts/ecart-fabrique.sh" && ok "syntaxe bash" || ko "syntaxe bash"

construire; lancer
attendre "copie identique : code 0" 0

construire; echo 'a = 2' > "${INSTALLEE}/service.py"; lancer
attendre "fichier modifié : code 1 et chemin nommé" 1 "service.py"

construire; echo 'v' > "${INSTALLEE}/vieux.py"; lancer
attendre "fichier installé absent du dépôt : code 1" 1 "vieux.py" "absent du dépôt"

construire; echo 'n' > "${DEPOT}/fabrique/generateurs/nouveau.py"; lancer
attendre "nouveau générateur non installé : code 1" 1 "generateurs/nouveau.py" "non installé"

construire; rm -rf -- "${INSTALLEE}"; lancer
attendre "copie installée absente : code 2" 2 "absente ou illisible"

construire
echo '{"etat": "en_cours"}' > "${ETAT}/livrables/ent/t1/etat.json"
mkdir -p "${ETAT}/livrables/ent/t2" "${ETAT}/livrables/ent/t3"
echo '{"etat": "en_attente_gpu"}' > "${ETAT}/livrables/ent/t2/etat.json"
echo '{"etat": "termine"}' > "${ETAT}/livrables/ent/t3/etat.json"
lancer
attendre "en_cours et en_attente_gpu comptés, termine non compté" 0 "travaux en cours : 2"

construire; lancer
if grep -qE 'pycache|tests' <<<"${SORTIE}"; then ko "dépôt avec __pycache__ et tests : écart signalé (${SORTIE})"
else attendre "dépôt avec __pycache__ et tests : aucun écart" 0; fi

echo "${TOTAL} contrôles, ${ECHECS} échec(s)."
[[ "${ECHECS}" -eq 0 ]]

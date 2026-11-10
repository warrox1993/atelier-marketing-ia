#!/usr/bin/env bash
# Écart entre la fabrique installée (/opt/atelier-fabrique/lib/fabrique) et le dépôt (lecture seule, sans root).
# Liste chaque fichier « modifié » ou « absent du dépôt » côté installé, et « non installé » côté dépôt, puis
# compte les travaux en cours (etat.json dont l'état n'est pas terminal, termine ou echec : un redémarrage les perdrait).
# Code de sortie : 0 = à jour ; 1 = écart (liste sur la sortie) ; 2 = copie installée absente ou illisible.
# Variables : ATELIER_FABRIQUE_INSTALLEE (défaut /opt/atelier-fabrique/lib/fabrique),
#             ATELIER_FABRIQUE_ETAT (défaut /var/lib/atelier-fabrique).
# Usage : scripts/ecart-fabrique.sh
set -uo pipefail

RACINE_DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALLEE="${ATELIER_FABRIQUE_INSTALLEE:-/opt/atelier-fabrique/lib/fabrique}"
ETAT="${ATELIER_FABRIQUE_ETAT:-/var/lib/atelier-fabrique}"
SOURCE="${RACINE_DEPOT}/fabrique"

if [[ ! -d "${INSTALLEE}" || ! -r "${INSTALLEE}" || ! -x "${INSTALLEE}" ]]; then
  echo "copie installée absente ou illisible : ${INSTALLEE}" >&2
  exit 2
fi

ECARTS=()
# Sens 1 : chaque fichier installé a un fichier du même chemin sous fabrique/ du dépôt.
while IFS= read -r -d '' fichier; do
  relatif="${fichier#"${INSTALLEE}"/}"
  if [[ ! -f "${SOURCE}/${relatif}" ]]; then
    ECARTS+=("absent du dépôt : ${relatif}")
  elif ! cmp -s -- "${fichier}" "${SOURCE}/${relatif}"; then
    ECARTS+=("modifié : ${relatif}")
  fi
done < <(find "${INSTALLEE}" -type f -print0 | sort -z)

# Sens 2 : fichiers du dépôt que l'installeur copie (sources, générateurs, JSON, gabarits) et qui manquent.
# shortcut: sélection recopiée de installer-fabrique.sh:108-133 (les polices, figées par empreinte, ne sont
# comparées que dans le sens 1) ; tester-installer-fabrique.sh vérifie que l'installeur garde ces motifs ;
# à fusionner dans une liste partagée si un troisième script a besoin de cette sélection.
while IFS= read -r -d '' fichier; do
  relatif="${fichier#"${SOURCE}"/}"
  [[ -f "${INSTALLEE}/${relatif}" ]] || ECARTS+=("non installé : ${relatif}")
done < <({
  find "${SOURCE}" -maxdepth 1 -type f \( -name '*.py' -o -name '*.json' \) -print0
  find "${SOURCE}/generateurs" -maxdepth 1 -type f -name '*.py' -print0 2>/dev/null
  find "${SOURCE}/hyperframes/gabarits" "${SOURCE}/hyperframes/gabarits-images" -type f -print0 2>/dev/null
  [[ -f "${SOURCE}/hyperframes/csp-hashes.json" ]] && printf '%s\0' "${SOURCE}/hyperframes/csp-hashes.json"
} | sort -z)

# Travaux en cours d'après les etat.json des livrables (lisibles par l'opérateur grâce aux ACL).
EN_COURS=0
while IFS= read -r -d '' etat; do
  grep -qE '"etat"[[:space:]]*:[[:space:]]*"(termine|echec)"' -- "${etat}" 2>/dev/null || EN_COURS=$((EN_COURS + 1))
done < <(find "${ETAT}/livrables" -mindepth 3 -maxdepth 3 -name etat.json -type f -print0 2>/dev/null)

if [[ "${#ECARTS[@]}" -eq 0 ]]; then
  echo "fabrique installée à jour (travaux en cours : ${EN_COURS})"
  exit 0
fi
printf '%s\n' "${ECARTS[@]}"
echo "travaux en cours : ${EN_COURS}"
exit 1

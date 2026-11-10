#!/usr/bin/env bash
# Répète une montée de version du socle Paperclip dans un clone TEMPORAIRE et rend un rapport (#81).
#   1. cible = --tag, sinon la plus récente étiquette stable de l'amont (canary, nightly et -rc écartés) ;
#   2. clone sur disque (jamais dans /tmp, en RAM) qui emprunte les objets du socle (--reference-if-able) ;
#   3. rejoue socle/patches/*.patch dans l'ordre : « sans conflit », « conflit » (fichiers nommés) ou « déjà en amont » ;
#   4. recopie les lignes de sécurité des notes de version ;
#   5. écrit <dossier>/rapport.md et l'affiche.
# Lecture seule sur le dépôt : n'écrit ni dans paperclip/ ni dans socle/, seulement dans le dossier de travail.
# Usage : scripts/repeter-montee-socle.sh [--tag vAAAA.MJJ.P] [--dossier DIR] [--si-nouvelle] [--garder] [--construire]
# Variables : SOCLE_VERSION_FICHIER, SOCLE_PATCHES, SOCLE_REFERENCE (par défaut ceux du dépôt),
#             REPETITION_ESPACE_MIN_GIO (espace libre minimal en Gio : 20 avec --construire, 2 sinon).
# Codes : 0 rapport écrit (même avec des conflits), 1 rapport impossible, 2 erreur d'usage.
set -Eeuo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FICHIER="${SOCLE_VERSION_FICHIER:-${RACINE}/socle/VERSION}"
PATCHES="${SOCLE_PATCHES:-${RACINE}/socle/patches}"
REFERENCE="${SOCLE_REFERENCE:-${RACINE}/paperclip}"

usage() { sed -n '2,/^[^#]/{/^#/p}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; }
erreur_usage() { echo "Erreur : $*" >&2; exit 2; }

CIBLE=""; DOSSIER=""; SI_NOUVELLE=0; GARDER=0; CONSTRUIRE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) [[ $# -ge 2 ]] || erreur_usage "--tag demande une valeur"; CIBLE="$2"; shift 2 ;;
    --dossier) [[ $# -ge 2 ]] || erreur_usage "--dossier demande une valeur"; DOSSIER="$2"; shift 2 ;;
    --si-nouvelle) SI_NOUVELLE=1; shift ;;
    --garder) GARDER=1; shift ;;
    --construire) CONSTRUIRE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage; erreur_usage "option inconnue : $1" ;;
  esac
done

[[ -r "${VERSION_FICHIER}" ]] || erreur_usage "fichier de version illisible : ${VERSION_FICHIER}"
lire() { grep -E "^$1=" "${VERSION_FICHIER}" | head -1 | cut -d= -f2-; }
DEPOT="$(lire DEPOT)"; TAG="$(lire TAG)"
[[ -n "${DEPOT}" && -n "${TAG}" ]] || erreur_usage "DEPOT ou TAG absent de ${VERSION_FICHIER}"

# Cible : la plus récente étiquette stable (les étiquettes annotées « ^{} » et les autres canaux sont écartés).
if [[ -z "${CIBLE}" ]]; then
  CIBLE="$(GIT_TERMINAL_PROMPT=0 git -c credential.helper= ls-remote --tags "${DEPOT}" \
    | sed -n 's|^[0-9a-f]*\trefs/tags/||p' | grep -E '^v[0-9]{4}\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1)" || true
  [[ -n "${CIBLE}" ]] || { echo "Aucune étiquette stable trouvée sur ${DEPOT}." >&2; exit 1; }
fi
[[ "${CIBLE}" =~ ^v[0-9]{4}\.[0-9]+\.[0-9]+$ ]] || erreur_usage "étiquette cible invalide : ${CIBLE}"

# Dossier de travail : sur disque, jamais dans le dépôt, dans le socle ni dans les correctifs.
[[ -n "${DOSSIER}" ]] || DOSSIER="${XDG_CACHE_HOME:-${HOME}/.cache}/atelier-repetition-socle/${CIBLE}"
DOSSIER="$(realpath -m -- "${DOSSIER}")"
dans() { [[ "$1" == "$2" || "$1" == "$2"/* ]]; }
for interdit in "${RACINE}" "${REFERENCE}" "${PATCHES}"; do
  for forme in "${interdit}" "$(realpath -m -- "${interdit}")"; do
    ! dans "${DOSSIER}" "${forme}" || erreur_usage "le dossier de travail ${DOSSIER} est dans ${forme} : refusé"
  done
done

if (( SI_NOUVELLE )); then
  [[ "${CIBLE}" != "${TAG}" ]] || { echo "Socle déjà à jour (${TAG}) : rien à répéter."; exit 0; }
  [[ ! -s "${DOSSIER}/rapport.md" ]] || { echo "Rapport déjà fait pour ${CIBLE} : ${DOSSIER}/rapport.md"; exit 0; }
fi

# Espace libre, mesuré sur le plus proche dossier existant, avant tout clone.
MIN_GIO="${REPETITION_ESPACE_MIN_GIO:-$(( CONSTRUIRE ? 20 : 2 ))}"
EXISTANT="${DOSSIER}"; while [[ ! -d "${EXISTANT}" ]]; do EXISTANT="$(dirname "${EXISTANT}")"; done
LIBRE_GIO=$(( $(df --output=avail -B1G "${EXISTANT}" | tail -n 1 | tr -d ' ') ))
(( LIBRE_GIO >= MIN_GIO )) || erreur_usage "espace libre insuffisant : ${LIBRE_GIO} Gio sur ${EXISTANT}, ${MIN_GIO} Gio demandés"
[[ ! -e "${DOSSIER}/clone" ]] || erreur_usage "${DOSSIER}/clone existe déjà : le supprimer ou choisir un autre dossier"

mkdir -p -- "${DOSSIER}"
CLONE="${DOSSIER}/clone"
nettoyer() { (( GARDER )) || rm -rf -- "${CLONE}" "${DOSSIER}/plugin-atelier"; }
trap nettoyer EXIT

echo "Cible : ${CIBLE} (socle actuel : ${TAG})"
GIT_TERMINAL_PROMPT=0 git -c credential.helper= clone --quiet --reference-if-able "${REFERENCE}" --dissociate \
  --branch "${CIBLE}" "${DEPOT}" "${CLONE}" || { echo "Échec du clone de ${DEPOT}." >&2; exit 1; }
CG=(git -C "${CLONE}" -c user.name="Répétition du socle" -c user.email="repetition@localhost" -c commit.gpgsign=false)
"${CG[@]}" checkout --quiet -b "repetition-${CIBLE}"

# Rejeu des correctifs dans l'ordre.
LIGNES=""; N_OK=0; N_CONFLIT=0; N_AMONT=0; FICHIERS_EN_CONFLIT=""
for p in "${PATCHES}"/*.patch; do
  [[ -e "${p}" ]] || continue
  nom="$(basename "${p}" .patch)"; num="${nom%%-*}"
  if "${CG[@]}" apply --check -R "${p}" >/dev/null 2>&1; then
    etat="déjà en amont"; fichiers="-"; N_AMONT=$((N_AMONT + 1))
  elif "${CG[@]}" am --3way --quiet "${p}" >/dev/null 2>&1; then
    etat="sans conflit"; fichiers="-"; N_OK=$((N_OK + 1))
  else
    fichiers="$("${CG[@]}" diff --name-only --diff-filter=U | paste -sd, -)"
    "${CG[@]}" am --skip >/dev/null 2>&1 || "${CG[@]}" am --abort >/dev/null 2>&1 || true
    "${CG[@]}" reset --quiet --hard
    N_CONFLIT=$((N_CONFLIT + 1)); notes=""
    if [[ -z "${fichiers}" ]]; then   # aucun fichier à fusionner : objets de départ absents, on nomme ceux du correctif
      fichiers="$("${CG[@]}" apply --numstat "${p}" | cut -f3 | paste -sd, -)"; notes="3-way impossible"
    fi
    for f in ${fichiers//,/ }; do
      [[ " ${FICHIERS_EN_CONFLIT} " != *" ${f} "* ]] || { notes="${notes:+${notes}, }cascade possible"; break; }
    done
    etat="conflit${notes:+ (${notes})}"
    FICHIERS_EN_CONFLIT="${FICHIERS_EN_CONFLIT} ${fichiers//,/ }"
  fi
  LIGNES+="| ${num} | ${etat} | ${fichiers:--} |"$'\n'
done

# Lignes de sécurité des notes de version.
NOTES="${CLONE}/releases/${CIBLE}.md"
if [[ -f "${NOTES}" ]]; then
  SECURITE="$(grep -iE 'security|sécurité|CVE|GHSA' "${NOTES}" || true)"
  [[ -n "${SECURITE}" ]] || SECURITE="Aucune ligne de sécurité dans les notes."
else
  SECURITE="Notes absentes (releases/${CIBLE}.md)."
fi

# Construction facultative (lourde : à lancer sous flock ~/.cache/verification-hooks/suite.lock).
construire() {   # écrit le résultat dans CONSTRUCTION
  local journal="${DOSSIER}/construction.log" plugin="${DOSSIER}/plugin-atelier" paquet n
  : > "${journal}"
  export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  command -v pnpm >/dev/null || { CONSTRUCTION="échec : pnpm absent"; return; }
  if ! (cd "${CLONE}" && pnpm install --frozen-lockfile) >> "${journal}" 2>&1; then CONSTRUCTION="socle : échec de pnpm install (voir ${journal})"; return; fi
  if ! (cd "${CLONE}" && pnpm build) >> "${journal}" 2>&1; then CONSTRUCTION="socle : échec de pnpm build (voir ${journal})"; return; fi
  # shortcut: compile le plugin committé (HEAD), pas l'arbre de travail, à changer si l'on veut répéter avant commit
  git -C "${RACINE}" archive HEAD plugin-atelier | tar -x -C "${DOSSIER}"
  for paquet in packages/plugins/sdk packages/shared; do
    if ! (cd "${CLONE}/${paquet}" && pnpm pack --pack-destination "${plugin}/.paperclip-sdk") >> "${journal}" 2>&1; then
      CONSTRUCTION="socle : construit ; échec de pnpm pack dans ${paquet} (voir ${journal})"; return
    fi
  done
  if ! (cd "${plugin}" && pnpm install --no-frozen-lockfile) >> "${journal}" 2>&1; then
    CONSTRUCTION="socle : construit ; plugin : échec de pnpm install contre le nouveau SDK (voir ${journal})"; return
  fi
  if (cd "${plugin}" && pnpm typecheck) > "${DOSSIER}/typecheck.log" 2>&1; then
    CONSTRUCTION="socle : construit ; typecheck : ok"
  else
    n="$(grep -c 'error TS' "${DOSSIER}/typecheck.log" || true)"
    CONSTRUCTION="socle : construit ; typecheck : échec, ${n} erreur(s) (voir ${DOSSIER}/typecheck.log)"
  fi
}
CONSTRUCTION="non demandée"
(( CONSTRUIRE )) && construire

RAPPORT="${DOSSIER}/rapport.md"
{
  echo "# Répétition de la montée du socle vers ${CIBLE}"
  echo
  echo "Cible : ${CIBLE} (socle actuel : ${TAG})"
  echo
  echo "| correctif | état | fichiers |"
  echo "| --- | --- | --- |"
  printf '%s' "${LIGNES}"
  echo
  echo "Sans conflit : ${N_OK}"
  echo "En conflit : ${N_CONFLIT}"
  echo "Déjà en amont : ${N_AMONT}"
  echo
  echo "## Sécurité (notes de version)"
  echo
  echo "${SECURITE}"
  echo
  echo "## Construction"
  echo
  echo "${CONSTRUCTION}"
} > "${RAPPORT}" || { echo "Impossible d'écrire ${RAPPORT}." >&2; exit 1; }
cat "${RAPPORT}"

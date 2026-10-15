#!/usr/bin/env bash
# Reconstruit le socle Paperclip épinglé dans ./paperclip, de façon reproductible :
#   1. clone (ou réutilise) le dépôt amont ;
#   2. vérifie que le tag stable pointe bien sur le SHA attendu ;
#   3. crée la branche locale sur ce tag et applique socle/patches/*.patch ;
#   4. installe les dépendances avec le lockfile figé (pnpm épinglé par
#      « packageManager », via corepack) ;
#   5. compile (pnpm build).
# Ne pousse rien, ne touche pas au système global. Idempotent : si la branche
# locale existe déjà au bon état, seules les étapes 4 et 5 sont rejouées.
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOCLE="${RACINE}/paperclip"
VERSION_FICHIER="${RACINE}/socle/VERSION"

lire() { grep -E "^$1=" "${VERSION_FICHIER}" | head -1 | cut -d= -f2-; }
DEPOT="$(lire DEPOT)"; TAG="$(lire TAG)"; SHA="$(lire SHA)"; BRANCHE="$(lire BRANCHE_LOCALE)"

echo "Socle attendu : ${TAG} (${SHA})"
if [[ ! -d "${SOCLE}/.git" ]]; then
  git clone --quiet "${DEPOT}" "${SOCLE}" || { echo "Échec du clone." >&2; exit 1; }
fi
cd "${SOCLE}" || exit 1
git fetch --quiet --tags origin || echo "Avertissement : fetch impossible, utilisation des tags locaux." >&2

REEL="$(git rev-list -n1 "${TAG}" 2>/dev/null || true)"
if [[ "${REEL}" != "${SHA}" ]]; then
  echo "Le tag ${TAG} pointe sur '${REEL}' au lieu de ${SHA} : arrêt." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "La copie de travail du socle contient des modifications : arrêt (rien n'est écrasé)." >&2
  git status --short | head -20 >&2
  exit 1
fi

NB_PATCHES="$(find "${RACINE}/socle/patches" -name '*.patch' | wc -l)"
ATTENDU_COMMITS="${NB_PATCHES}"
if git rev-parse --verify --quiet "${BRANCHE}" >/dev/null; then
  BASE_OK="$(git merge-base --is-ancestor "${SHA}" "${BRANCHE}" && echo oui || echo non)"
  NB="$(git rev-list --count "${SHA}..${BRANCHE}")"
  if [[ "${BASE_OK}" == "oui" && "${NB}" == "${ATTENDU_COMMITS}" ]]; then
    echo "Branche ${BRANCHE} déjà prête (${NB} patch(s) local(aux))."
    git checkout --quiet "${BRANCHE}" || exit 1
  else
    echo "La branche ${BRANCHE} existe mais diffère (${NB} commits au-dessus du tag) : arrêt, à examiner." >&2
    exit 1
  fi
else
  git checkout --quiet -b "${BRANCHE}" "${TAG}" || exit 1
  for p in "${RACINE}"/socle/patches/*.patch; do
    [[ -e "${p}" ]] || continue
    echo "Application de $(basename "${p}")"
    git am --quiet "${p}" || { echo "Échec de git am sur ${p}." >&2; git am --abort; exit 1; }
  done
fi

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
command -v pnpm >/dev/null || { echo "pnpm absent : corepack enable --install-directory ~/.local/bin pnpm" >&2; exit 1; }
echo "pnpm $(pnpm --version)"
pnpm install --frozen-lockfile || exit 1
pnpm build || exit 1
echo "Socle prêt : $(git log -1 --format='%h %s')"

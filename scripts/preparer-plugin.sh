#!/usr/bin/env bash
# Prépare le plugin de l'Atelier Marketing IA de façon reproductible :
#   1. empaquette le SDK de plugins et @paperclipai/shared depuis le socle
#      épinglé (pnpm pack est reproductible : mêmes octets, même empreinte) ;
#   2. installe les dépendances avec le lockfile figé (l'empreinte des archives
#      est contrôlée par pnpm : un SDK différent fait échouer l'installation) ;
#   3. vérifie les types, lance les tests et construit dist/.
# Ne touche ni l'instance, ni le système global.
# Usage : scripts/preparer-plugin.sh [--sans-tests]
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOCLE="${RACINE}/paperclip"
PLUGIN="${RACINE}/plugin-atelier"
SANS_TESTS=0
[[ "${1:-}" == "--sans-tests" ]] && SANS_TESTS=1

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
command -v pnpm >/dev/null || { echo "pnpm absent : corepack enable --install-directory ~/.local/bin pnpm" >&2; exit 1; }
[[ -d "${SOCLE}/packages/plugins/sdk/dist" ]] || { echo "Socle non construit : lancez scripts/preparer-socle.sh." >&2; exit 1; }

mkdir -p "${PLUGIN}/.paperclip-sdk"
for paquet in packages/plugins/sdk packages/shared; do
  echo "Empaquetage de ${paquet}"
  (cd "${SOCLE}/${paquet}" && pnpm pack --pack-destination "${PLUGIN}/.paperclip-sdk" >/dev/null) || {
    echo "Échec de pnpm pack dans ${paquet}." >&2; exit 1; }
done

cd "${PLUGIN}" || exit 1
pnpm install --frozen-lockfile || { echo "Installation figée refusée (SDK différent du lockfile ?)." >&2; exit 1; }
pnpm typecheck || exit 1
if [[ "${SANS_TESTS}" -eq 0 ]]; then
  pnpm test || exit 1
fi
pnpm build || exit 1
echo "Plugin prêt : ${PLUGIN}/dist"

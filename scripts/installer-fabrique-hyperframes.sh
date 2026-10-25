#!/usr/bin/env bash
# Installe le rendu de visuels animés de la fabrique (lot 10) :
#   1. /opt/atelier-fabrique/hyperframes/ : package.json et package-lock.json du dépôt
#      (fabrique/hyperframes/), `npm ci --ignore-scripts` : HyperFrames 0.8.192 et GSAP 3.15.0 exacts.
#      Le seul script d'installation du dépôt de paquets est celui d'esbuild (vérification du binaire) :
#      il n'est PAS indispensable, le binaire vient du paquet @esbuild/linux-x64 (contrôlé plus bas) ;
#   2. Node : celui du système s'il est en version 22 ou plus (HyperFrames exige >=22), sinon arrêt
#      (installer alors une version LTS figée sous /opt, voir docs/conception-execution-etroite.md §6.4) ;
#   3. /opt/atelier-fabrique/chrome/<version>/ : chrome-headless-shell à la version qu'exige
#      HyperFrames 0.8.192 (152.0.7977.30), archive de Chrome for Testing, empreinte sha256 contrôlée ;
#   4. contrôle : télémétrie coupée (`hyperframes telemetry disable`), Chrome et esbuild démarrent.
# À lancer en root (sudo). Idempotent : sans changement, ne retélécharge ni ne réinstalle rien.
set -uo pipefail

RACINE_DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_PAQUETS="$RACINE_DEPOT/fabrique/hyperframes"
RACINE="/opt/atelier-fabrique"
DEST="$RACINE/hyperframes"
CHROME_VERSION="152.0.7977.30"
CHROME_URL="https://storage.googleapis.com/chrome-for-testing-public/$CHROME_VERSION/linux64/chrome-headless-shell-linux64.zip"
# Empreinte relevée au premier téléchargement (Chrome for Testing ne publie pas de somme de contrôle).
CHROME_SHA256="1b150320178ecabe39726bcf3198ebb896ba2b7a07d870db1710914c42d55221"
CHROME_DEST="$RACINE/chrome/$CHROME_VERSION"
CHROME_BIN="$CHROME_DEST/chrome-headless-shell-linux64/chrome-headless-shell"
NODE_MIN=22

echec() { echo "erreur : $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || echec "à lancer en root (sudo)"
[[ -f "$SOURCE_PAQUETS/package.json" && -f "$SOURCE_PAQUETS/package-lock.json" ]] \
  || echec "package.json ou package-lock.json absent de $SOURCE_PAQUETS"
[[ -d "$RACINE" ]] || echec "$RACINE absent (lancer scripts/installer-fabrique.sh d'abord)"
for outil in node npm curl unzip sha256sum ffmpeg; do
  command -v "$outil" >/dev/null || echec "outil manquant : $outil"
done

# 2. Node du système.
majeure="$(node --version | sed 's/^v//; s/\..*//')"
[[ "$majeure" =~ ^[0-9]+$ && "$majeure" -ge "$NODE_MIN" ]] \
  || echec "Node $(node --version) trop ancien : HyperFrames exige >= $NODE_MIN"
echo "Node du système : $(node --version) (HyperFrames exige >= $NODE_MIN)"

# 1. Paquets figés.
install -d -m 0755 "$DEST" || echec "création de $DEST impossible"
if ! cmp -s "$SOURCE_PAQUETS/package-lock.json" "$DEST/package-lock.json" \
   || ! cmp -s "$SOURCE_PAQUETS/package.json" "$DEST/package.json" \
   || [[ ! -f "$DEST/node_modules/hyperframes/package.json" ]]; then
  install -m 0644 "$SOURCE_PAQUETS/package.json" "$SOURCE_PAQUETS/package-lock.json" "$DEST/" \
    || echec "copie des fichiers de paquets impossible"
  rm -rf "$DEST/node_modules"
  (cd "$DEST" && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error) \
    || echec "npm ci impossible"
  chmod -R go-w,a+rX "$DEST/node_modules"
else
  echo "Paquets déjà à jour : $DEST"
fi
version="$(node -p "require('$DEST/node_modules/hyperframes/package.json').version")"
[[ "$version" == "0.8.192" ]] || echec "HyperFrames $version au lieu de 0.8.192"
echo "HyperFrames $version, GSAP $(node -p "require('$DEST/node_modules/gsap/package.json').version")"
"$DEST/node_modules/.bin/esbuild" --version >/dev/null || echec "binaire esbuild inutilisable (sans script d'installation)"

# 3. chrome-headless-shell figé.
if [[ -x "$CHROME_BIN" ]] && "$CHROME_BIN" --version | grep -q "$CHROME_VERSION"; then
  echo "chrome-headless-shell déjà installé : $CHROME_DEST"
else
  tmp="$(mktemp -d)" || echec "mktemp impossible"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL -o "$tmp/chs.zip" "$CHROME_URL" || echec "téléchargement de $CHROME_URL impossible"
  somme="$(sha256sum "$tmp/chs.zip" | cut -d' ' -f1)"
  [[ "$somme" == "$CHROME_SHA256" ]] || echec "empreinte inattendue ($somme) : arrêt"
  rm -rf "$CHROME_DEST"
  install -d -m 0755 "$RACINE/chrome" "$CHROME_DEST" || echec "création de $CHROME_DEST impossible"
  unzip -q "$tmp/chs.zip" -d "$CHROME_DEST" || echec "décompression impossible"
  chmod -R go-w,a+rX "$CHROME_DEST"
  "$CHROME_BIN" --version | grep -q "$CHROME_VERSION" || echec "chrome-headless-shell ne démarre pas à la bonne version"
fi
chmod 0755 "$RACINE/chrome" "$CHROME_DEST"  # lisible dans la cage (les dossiers parents créés par install -d le seraient en 0750)
echo "chrome-headless-shell : $("$CHROME_BIN" --version)"

# 4. Télémétrie : coupée dans une configuration jetable (le $HOME de l'opérateur n'est pas touché).
maison="$(mktemp -d)" || echec "mktemp impossible"
statut="$(HOME="$maison" HYPERFRAMES_NO_UPDATE_CHECK=1 node "$DEST/node_modules/hyperframes/bin/hyperframes.mjs" telemetry disable 2>&1 \
  && HOME="$maison" node "$DEST/node_modules/hyperframes/bin/hyperframes.mjs" telemetry status 2>&1)"
rm -rf "$maison"
grep -qi "disabled" <<<"$statut" || echec "la télémétrie n'a pas pu être coupée : $statut"
echo "Télémétrie de HyperFrames : coupée (et forcée à chaque rendu par HYPERFRAMES_NO_TELEMETRY=1, DO_NOT_TRACK=1)."
echo "Installation terminée."

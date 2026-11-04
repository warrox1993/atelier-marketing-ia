#!/usr/bin/env bash
# Installe l'illustration IA de la fabrique (fond des images publicitaires) :
#   1. environnement /opt/atelier-fabrique/venv-image, construit avec le CPython de venv-voix (3.12 figé sous
#      /opt/atelier-fabrique/python), depuis fabrique/exigences-image.txt (versions figées, empreintes sha256
#      obligatoires, roues seulement, aucune résolution) ;
#   2. poids de FLUX 3 Image Klein (entrée « flux-3-image-klein » de fabrique/modeles.json), dans
#      /var/lib/atelier-fabrique/modeles/flux-3-image-klein@<revision>/, empreintes contrôlées. Si la variable
#      FABRIQUE_POIDS_FLUX_3_IMAGE_KLEIN désigne un dossier déjà téléchargé, les fichiers sont COPIÉS (aucun réseau) ;
#      sinon ils sont téléchargés une fois, hors cage, à la révision figée.
# À lancer en root (sudo), APRÈS scripts/installer-fabrique-voix.sh. Idempotent : sans changement, ne refait rien.
# Le code (generateurs/illustration.py) et modeles.json sont déployés par scripts/installer-fabrique.sh.
set -uo pipefail

RACINE_DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIGENCES="$RACINE_DEPOT/fabrique/exigences-image.txt"
MODELES_JSON="$RACINE_DEPOT/fabrique/modeles.json"
TELECHARGEUR="$RACINE_DEPOT/scripts/telecharger-modeles-voix.py"
RACINE="/opt/atelier-fabrique"
VENV_VOIX="$RACINE/venv-voix"
VENV="$RACINE/venv-image"
ETAT="$VENV/.etat-installation"
MODELES="/var/lib/atelier-fabrique/modeles"
GROUPE="atelier-fabrique"
NOM_MODELE="flux-3-image-klein"

echec() { echo "erreur : $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || echec "à lancer en root (sudo)"
for f in "$EXIGENCES" "$MODELES_JSON" "$TELECHARGEUR"; do
  [[ -f "$f" ]] || echec "fichier introuvable : $f"
done
[[ -x "$VENV_VOIX/bin/python" ]] || echec "$VENV_VOIX absent (lancer scripts/installer-fabrique-voix.sh d'abord)"
[[ -d "$MODELES" ]] || echec "$MODELES absent (lancer scripts/installer-fabrique-voix.sh d'abord)"
if [[ -n "${FABRIQUE_POIDS_FLUX_3_IMAGE_KLEIN:-}" ]]; then
  [[ -d "$FABRIQUE_POIDS_FLUX_3_IMAGE_KLEIN" ]] || echec "dossier de poids introuvable : $FABRIQUE_POIDS_FLUX_3_IMAGE_KLEIN"
  export FABRIQUE_POIDS_FLUX_3_IMAGE_KLEIN
fi

UV="${UV:-$(command -v uv || true)}"
if [[ -z "$UV" && -n "${SUDO_USER:-}" ]]; then
  maison="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
  [[ -x "$maison/.local/bin/uv" ]] && UV="$maison/.local/bin/uv"
fi
[[ -n "$UV" && -x "$UV" ]] || echec "uv introuvable (le passer par UV=/chemin/uv)"
PYTHON="$(readlink -f "$VENV_VOIX/bin/python")" || echec "CPython de venv-voix introuvable"
[[ "$PYTHON" == "$RACINE"/python/* ]] || echec "CPython hors de $RACINE/python : $PYTHON"

umask 022
CACHE="$(mktemp -d)" || echec "mktemp impossible"
trap 'rm -rf -- "$CACHE"' EXIT
export UV_CACHE_DIR="$CACHE/uv"

# 1. Environnement figé.
attendue="$(sha256sum -- "$EXIGENCES" | cut -d' ' -f1)-$("$PYTHON" -I -c 'import sys; print(sys.version.split()[0])')" \
  || echec "empreinte des exigences impossible"
if [[ -f "$ETAT" && "$(cat -- "$ETAT")" == "$attendue" && -x "$VENV/bin/python" ]]; then
  echo "Environnement déjà à jour : $VENV"
else
  rm -rf -- "$VENV" || echec "nettoyage de l'ancien environnement impossible"
  "$UV" venv --python "$PYTHON" "$VENV" >/dev/null || echec "création du venv impossible"
  "$UV" pip install --python "$VENV/bin/python" --require-hashes --no-deps --only-binary :all: \
    -r "$EXIGENCES" || echec "installation des dépendances impossible"
  "$VENV/bin/python" -I -c "import bitsandbytes, diffusers, torch, torchvision, transformers; \
assert torch.__version__.startswith('2.6.0'), torch.__version__; \
from diffusers.modular_pipelines.flux3.modular_blocks_flux3_distilled import Flux3DistilledAutoBlocks" || echec "contrôle d'import impossible"
  printf '%s\n' "$attendue" > "$ETAT" || echec "écriture de l'état impossible"
fi
chown -R root:root "$VENV" || echec "chown impossible"
chmod -R go-w,a+rX "$VENV" || echec "chmod impossible"

# 2. Poids : root:atelier-fabrique, lecture seule, révision figée (comme les modèles de voix).
HF_HOME="${HF_HOME:-$CACHE/hf}" "$VENV/bin/python" -I "$TELECHARGEUR" "$MODELES_JSON" "$MODELES" "$GROUPE" "$NOM_MODELE" \
  || echec "copie ou contrôle des poids impossible"
echo "Illustration IA prête : $VENV"

#!/usr/bin/env bash
# Installe la synthèse vocale de la fabrique (lot 7) :
#   1. CPython 3.12 figé sous /opt/atelier-fabrique/python (torch 2.6.0 et numpy 1.x n'ont pas de
#      roues pour Python 3.14 : voir fabrique/exigences-voix.txt) ;
#   2. environnement /opt/atelier-fabrique/venv-voix, depuis fabrique/exigences-voix.txt
#      (versions figées, empreintes sha256 obligatoires, roues seulement, aucune résolution) ;
#   3. poids des modèles, téléchargés UNE fois, hors cage, à une révision Hugging Face figée,
#      dans /var/lib/atelier-fabrique/modeles/<nom>@<revision>/ (empreintes de fabrique/modeles.json) ;
#   4. dossier voix-autorisees/ et registre initial (voix de synthèse seulement), s'il n'existe pas.
# À lancer en root (sudo). Idempotent : sans changement, ne refait rien et ne retélécharge rien.
set -uo pipefail

RACINE_DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIGENCES="$RACINE_DEPOT/fabrique/exigences-voix.txt"
MODELES_JSON="$RACINE_DEPOT/fabrique/modeles.json"
REGISTRE_INITIAL="$RACINE_DEPOT/fabrique/registre-voix-initial.json"
TELECHARGEUR="$RACINE_DEPOT/scripts/telecharger-modeles-voix.py"
RACINE="/opt/atelier-fabrique"
PYTHON_DIR="$RACINE/python"
VENV="$RACINE/venv-voix"
VERSION_PYTHON="3.12"
ETAT="$VENV/.etat-installation"
DONNEES="/var/lib/atelier-fabrique"
MODELES="$DONNEES/modeles"
VOIX="$DONNEES/voix-autorisees"
GROUPE="atelier-fabrique"

echec() { echo "erreur : $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || echec "à lancer en root (sudo)"
for f in "$EXIGENCES" "$MODELES_JSON" "$REGISTRE_INITIAL" "$TELECHARGEUR"; do
  [[ -f "$f" ]] || echec "fichier introuvable : $f"
done
getent group "$GROUPE" >/dev/null || echec "groupe $GROUPE absent (lancer scripts/installer-fabrique.sh d'abord)"
[[ -d "$DONNEES" ]] || echec "$DONNEES absent (lancer scripts/installer-fabrique.sh d'abord)"

# uv : dans le PATH de root, sinon dans celui de l'opérateur qui a lancé sudo.
UV="${UV:-$(command -v uv || true)}"
if [[ -z "$UV" && -n "${SUDO_USER:-}" ]]; then
  maison="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
  [[ -x "$maison/.local/bin/uv" ]] && UV="$maison/.local/bin/uv"
fi
[[ -n "$UV" && -x "$UV" ]] || echec "uv introuvable (le passer par UV=/chemin/uv)"

umask 022
install -d -o root -g root -m 0755 "$RACINE" || echec "création de $RACINE impossible"
CACHE="$(mktemp -d)" || echec "mktemp impossible"
trap 'rm -rf -- "$CACHE"' EXIT
export UV_CACHE_DIR="$CACHE/uv" UV_PYTHON_INSTALL_DIR="$PYTHON_DIR" UV_PYTHON_PREFERENCE=only-managed

# 1. CPython figé.
"$UV" python install "$VERSION_PYTHON" >/dev/null || echec "installation de CPython $VERSION_PYTHON impossible"
PYTHON="$("$UV" python find "$VERSION_PYTHON")" || echec "CPython $VERSION_PYTHON introuvable"
[[ "$PYTHON" == "$PYTHON_DIR"/* ]] || echec "CPython hors de $PYTHON_DIR : $PYTHON"

# 2. Environnement figé.
attendue="$(sha256sum -- "$EXIGENCES" | cut -d' ' -f1)-$("$PYTHON" -I -c 'import sys; print(sys.version.split()[0])')" \
  || echec "empreinte des exigences impossible"
if [[ -f "$ETAT" && "$(cat -- "$ETAT")" == "$attendue" && -x "$VENV/bin/python" ]]; then
  echo "Environnement déjà à jour : $VENV"
else
  rm -rf -- "$VENV" || echec "nettoyage de l'ancien environnement impossible"
  "$UV" venv --python "$PYTHON" "$VENV" >/dev/null || echec "création du venv impossible"
  "$UV" pip install --python "$VENV/bin/python" --require-hashes --no-deps --only-binary :all: \
    -r "$EXIGENCES" || echec "installation des dépendances impossible"
  "$VENV/bin/python" -I -c "import chatterbox.mtl_tts, kokoro, perth, torch; \
assert torch.__version__.startswith('2.6.0'), torch.__version__; \
assert perth.PerthImplicitWatermarker is not None, 'PerTh indisponible (pkg_resources ?)'" || echec "contrôle d'import impossible"
  printf '%s\n' "$attendue" > "$ETAT" || echec "écriture de l'état impossible"
fi
chown -R root:root "$VENV" "$PYTHON_DIR" || echec "chown impossible"
chmod -R go-w,a+rX "$VENV" "$PYTHON_DIR" || echec "chmod impossible"

# 3. Poids : root:atelier-fabrique, lecture seule, révision figée.
install -d -o root -g "$GROUPE" -m 0750 "$MODELES" || echec "création de $MODELES impossible"
HF_HOME="${HF_HOME:-$CACHE/hf}" "$VENV/bin/python" -I "$TELECHARGEUR" "$MODELES_JSON" "$MODELES" "$GROUPE" \
  || echec "téléchargement ou contrôle des poids impossible"

# 4. Registre des voix autorisées : tenu par root, jamais par un agent. Posé s'il manque, jamais écrasé.
install -d -o root -g "$GROUPE" -m 0750 "$VOIX" || echec "création de $VOIX impossible"
if [[ ! -f "$VOIX/registre.json" ]]; then
  install -o root -g "$GROUPE" -m 0640 "$REGISTRE_INITIAL" "$VOIX/registre.json" \
    || echec "pose du registre initial impossible"
  echo "Registre initial posé : $VOIX/registre.json"
else
  echo "Registre existant conservé : $VOIX/registre.json"
fi
echo "Synthèse vocale prête : $VENV"

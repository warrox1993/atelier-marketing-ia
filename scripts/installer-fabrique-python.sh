#!/usr/bin/env bash
# Crée l'environnement Python figé de la fabrique : /opt/atelier-fabrique/venv
# (propriété de root, lecture seule pour les autres), à partir de fabrique/exigences.txt
# (versions figées, empreintes sha256 obligatoires, aucune dépendance résolue à l'installation).
# À lancer en root (sudo). Idempotent : sans changement des exigences, ne refait rien.
set -uo pipefail

RACINE_DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIGENCES="$RACINE_DEPOT/fabrique/exigences.txt"
RACINE="/opt/atelier-fabrique"
VENV="$RACINE/venv"
EMPREINTE="$VENV/.exigences.sha256"
PYTHON="/usr/bin/python3"

echec() { echo "erreur : $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || echec "à lancer en root (sudo)"
[[ -f "$EXIGENCES" ]] || echec "fichier introuvable : $EXIGENCES"
[[ -x "$PYTHON" ]] || echec "$PYTHON introuvable"

attendue="$(sha256sum -- "$EXIGENCES" | cut -d' ' -f1)" || echec "empreinte des exigences impossible"
if [[ -f "$EMPREINTE" && "$(cat -- "$EMPREINTE")" == "$attendue" && -x "$VENV/bin/python" ]]; then
  echo "Environnement déjà à jour : $VENV"
  exit 0
fi

umask 022
install -d -o root -g root -m 0755 "$RACINE" || echec "création de $RACINE impossible"
rm -rf -- "$VENV" || echec "nettoyage de l'ancien environnement impossible"
"$PYTHON" -m venv --without-pip "$VENV" || echec "création du venv impossible"

# Installation avec le pip du système, cible = le venv (pip n'est pas installé dans le venv).
"$PYTHON" -m pip --python "$VENV/bin/python" install \
  --require-hashes --no-deps --only-binary=:all: --no-cache-dir \
  --disable-pip-version-check -r "$EXIGENCES" || echec "installation des dépendances impossible"

"$VENV/bin/python" -I -c "import docx, openpyxl, pptx, lxml, PIL, defusedxml, pypdf, xlsxwriter" \
  || echec "contrôle d'import impossible"

printf '%s\n' "$attendue" > "$EMPREINTE" || echec "écriture de l'empreinte impossible"
chown -R root:root "$VENV" || echec "chown impossible"
chmod -R go-w,a+rX "$VENV" || echec "chmod impossible"
echo "Environnement prêt : $VENV"

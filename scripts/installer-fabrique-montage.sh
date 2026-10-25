#!/usr/bin/env bash
# Installe les polices du montage vidéo de la fabrique : /opt/atelier-fabrique/polices
# (propriété de root, lecture seule pour les autres). Seul ce dossier est donné au filtre ASS
# de ffmpeg (option fontsdir), dans la cage de montage.
# Police copiée : DejaVu Sans (licence libre Bitstream Vera / domaine public), déjà sur le système.
# À lancer en root (sudo). Idempotent.
set -uo pipefail

RACINE="/opt/atelier-fabrique"
POLICES="$RACINE/polices"
SOURCE_POLICES="/usr/share/fonts/truetype/dejavu"
FICHIERS=(DejaVuSans.ttf DejaVuSans-Bold.ttf)

echec() { echo "erreur : $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || echec "à lancer en root (sudo)"
command -v ffmpeg >/dev/null 2>&1 || echec "ffmpeg introuvable"
command -v ffprobe >/dev/null 2>&1 || echec "ffprobe introuvable"

umask 022
install -d -o root -g root -m 0755 "$RACINE" || echec "création de $RACINE impossible"
install -d -o root -g root -m 0755 "$POLICES" || echec "création de $POLICES impossible"

for fichier in "${FICHIERS[@]}"; do
  [[ -f "$SOURCE_POLICES/$fichier" ]] || echec "police introuvable : $SOURCE_POLICES/$fichier (paquet fonts-dejavu-core)"
  install -o root -g root -m 0644 -- "$SOURCE_POLICES/$fichier" "$POLICES/$fichier" \
    || echec "copie de $fichier impossible"
done

echo "Polices prêtes : $POLICES"
ls -l -- "$POLICES"

#!/usr/bin/env bash
# Mise à jour mensuelle de l'index BCE : télécharge les fichiers manquants du portail BCE Open Data
# puis les importe dans instance/donnees/bce/bce.sqlite.
# Usage : scripts/bce-mise-a-jour.sh
# Journal daté : instance/donnees/bce/maj.log
# Identifiants : instance/secrets/bce-identifiants.txt (chmod 600, lignes identifiant=… et mot_de_passe=…),
#   surchargeable par PASSERELLE_BCE_IDENTIFIANTS_FICHIER.
# Codes de sortie : 0 succès, 1 échec du téléchargement ou de l'import, 2 identifiants absents ou illisibles,
#   3 identifiants refusés par le portail, 4 installation incomplète (node ou passerelle non compilée).
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DONNEES="$RACINE/instance/donnees/bce"
JOURNAL="$DONNEES/maj.log"
IDENTIFIANTS="${PASSERELLE_BCE_IDENTIFIANTS_FICHIER:-$RACINE/instance/secrets/bce-identifiants.txt}"
CLI="$RACINE/passerelle/dist/src/reel/prospection/cli.js"

mkdir -p "$DONNEES/archives" || { echo "erreur : impossible de créer $DONNEES/archives" >&2; exit 1; }
journal() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$JOURNAL"; }

command -v node >/dev/null 2>&1 || { journal "ERREUR : node introuvable."; exit 4; }
[ -f "$CLI" ] || { journal "ERREUR : passerelle non compilée ($CLI absent). Lancer la compilation de passerelle/."; exit 4; }

if [ ! -r "$IDENTIFIANTS" ]; then
  journal "ERREUR : fichier d'identifiants BCE absent ou illisible : $IDENTIFIANTS. S'inscrire au portail BCE Open Data puis y écrire les lignes identifiant=… et mot_de_passe=… (chmod 600)."
  exit 2
fi
perm="$(stat -c '%a' "$IDENTIFIANTS" 2>/dev/null || echo '?')"
if [ "$perm" != "600" ] && [ "$perm" != "400" ]; then
  journal "ERREUR : $IDENTIFIANTS a les droits $perm ; exécuter chmod 600 dessus."
  exit 2
fi

journal "Début de la mise à jour BCE."
sortie="$(mktemp)" || { journal "ERREUR : mktemp a échoué."; exit 1; }
trap 'rm -f "$sortie"' EXIT

PASSERELLE_BCE_IDENTIFIANTS_FICHIER="$IDENTIFIANTS" \
  node "$CLI" bce-telecharger --dossier "$DONNEES/archives" --index "$DONNEES/bce.sqlite" --importer > "$sortie" 2>&1
code=$?
# Le journal reçoit la sortie du CLI (sans identifiants : le CLI n'en écrit jamais).
sed 's/^/    /' "$sortie" >> "$JOURNAL"

if [ "$code" -eq 0 ]; then
  journal "Mise à jour BCE terminée avec succès."
  exit 0
fi

if grep -q 'PASSERELLE_BCE_IDENTIFIANTS_FICHIER' "$sortie"; then
  journal "ERREUR : identifiants BCE absents ou incomplets (voir le détail ci-dessus)."; exit 2
elif grep -q 'refusée : identifiant ou mot de passe incorrect' "$sortie"; then
  journal "ERREUR : le portail BCE refuse les identifiants (mot de passe changé, compte non activé ou expiré). Corriger $IDENTIFIANTS."; exit 3
fi
journal "ERREUR : la mise à jour BCE a échoué (code $code), voir le détail ci-dessus."
exit 1

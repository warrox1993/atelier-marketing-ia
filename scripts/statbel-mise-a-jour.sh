#!/usr/bin/env bash
# Mise à jour de l'index Statbel : télécharge les jeux de données ouverts de Statbel (population, revenus fiscaux, entreprises
# assujetties à la TVA par commune) et la table code postal / commune de bpost, puis les importe dans instance/donnees/statbel/statbel.sqlite.
# Usage : scripts/statbel-mise-a-jour.sh
# Journal daté : instance/donnees/statbel/maj.log ; téléchargements conservés dans instance/donnees/statbel/archives/.
# Aucun compte ni clé. Licence des données Statbel : CC BY 4.0 (citer Statbel).
# Variables : STATBEL_HORS_VPN=1 lance les téléchargements avec `mullvad-exclude` (le site de Statbel refuse certains relais VPN :
#   les données sont publiques, seul le trafic de ce script sort du tunnel) ; STATBEL_ANNEE_MAX pour borner l'année de recherche.
# Codes de sortie : 0 succès, 1 échec du téléchargement ou de l'import, 2 réglage invalide (STATBEL_ANNEE_MAX), 4 installation incomplète (node, curl, unzip ou passerelle non compilée).
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DONNEES="$RACINE/instance/donnees/statbel"
ARCHIVES="$DONNEES/archives"
JOURNAL="$DONNEES/maj.log"
INDEX="${PASSERELLE_STATBEL_INDEX:-$DONNEES/statbel.sqlite}"
CLI="$RACINE/passerelle/dist/src/reel/statbel/cli.js"
BASE="https://statbel.fgov.be/sites/default/files/files/opendata"
URL_POPULATION="$BASE/bevolking%20naar%20woonplaats%2C%20nationaliteit%20burgelijke%20staat%20%2C%20leeftijd%20en%20geslacht/TF_SOC_POP_STRUCT_@AN@.zip"
URL_FISCAL="$BASE/arbeid/TF_PSNL_INC_TAX_MUNTY.zip"
URL_TVA="$BASE/btw-plichtige/rechtsvorm/TF_VAT_NACE_@AN@.zip"
URL_CODES_POSTAUX="https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-belgium-postal-codes/exports/csv?select=postcode%2Cmun_code%2Cmun_name_fr%2Cmun_name_nl&delimiter=%7C"

mkdir -p "$ARCHIVES" || { echo "erreur : impossible de créer $ARCHIVES" >&2; exit 1; }
journal() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$JOURNAL"; }

for outil in node curl unzip; do
  command -v "$outil" >/dev/null 2>&1 || { journal "ERREUR : $outil introuvable."; exit 4; }
done
[ -f "$CLI" ] || { journal "ERREUR : passerelle non compilée ($CLI absent). Lancer « npm run build » dans passerelle/."; exit 4; }

SORTIE=()
if [ "${STATBEL_HORS_VPN:-0}" = "1" ]; then
  command -v mullvad-exclude >/dev/null 2>&1 || { journal "ERREUR : STATBEL_HORS_VPN=1 mais mullvad-exclude est introuvable."; exit 4; }
  SORTIE=(mullvad-exclude)
fi
# HTTPS seulement, y compris après redirection.
telecharger() { "${SORTIE[@]}" curl -sSL --proto '=https' --proto-redir '=https' --fail --max-time 600 -A 'Mozilla/5.0' "$@"; }
existe() { # l'URL répond-elle par un fichier zip ? (Statbel renvoie 404 pour une année non publiée)
  local type
  type="$("${SORTIE[@]}" curl -sIL --proto '=https' --proto-redir '=https' --max-time 60 -A 'Mozilla/5.0' -o /dev/null -w '%{http_code} %{content_type}' "$1" 2>/dev/null)" || return 1
  [[ "$type" == 200\ application/zip* ]]
}

annee_courante="${STATBEL_ANNEE_MAX:-$(date +%Y)}"
# Quatre chiffres exactement : la valeur entre dans une expression arithmétique de bash (évaluée, donc jamais libre).
[[ "$annee_courante" =~ ^[0-9]{4}$ ]] || { journal "ERREUR : STATBEL_ANNEE_MAX doit être une année sur quatre chiffres."; exit 2; }

# Dernière année disponible d'un jeu annuel : <modèle d'URL contenant @AN@> <année plancher> ; écrit l'année sur la sortie standard.
derniere_annee() {
  local modele="$1" plancher="$2" an
  for ((an = annee_courante; an >= plancher; an--)); do
    if existe "${modele//@AN@/$an}"; then echo "$an"; return 0; fi
  done
  return 1
}

# Télécharge <url> vers <archives/nom> (sauf si présent et non vide, sauf $3 = forcer) puis le dézippe dans un dossier d'extraction.
recuperer() {
  local url="$1" nom="$2" forcer="${3:-non}"
  if [ "$forcer" = "oui" ] || [ ! -s "$ARCHIVES/$nom" ]; then
    journal "Téléchargement de $nom…"
    telecharger -o "$ARCHIVES/$nom.part" "$url" || { journal "ERREUR : téléchargement de $nom échoué ($url)."; rm -f "$ARCHIVES/$nom.part"; return 1; }
    mv -f "$ARCHIVES/$nom.part" "$ARCHIVES/$nom" || return 1
  else
    journal "$nom déjà présent, réutilisé."
  fi
  # Empreinte de l'archive importée, gardée au journal (traçabilité des données utilisées).
  journal "SHA-256 de $nom : $(sha256sum "$ARCHIVES/$nom" | cut -d' ' -f1)"
  rm -rf "${ARCHIVES:?}/extraction-$nom" && mkdir -p "$ARCHIVES/extraction-$nom" || return 1
  unzip -oq "$ARCHIVES/$nom" -d "$ARCHIVES/extraction-$nom" || { journal "ERREUR : $nom n'est pas une archive zip valide."; return 1; }
}

journal "Début de la mise à jour Statbel."
an_pop="$(derniere_annee "$URL_POPULATION" 2024)" || { journal "ERREUR : aucun fichier de population trouvé chez Statbel (site injoignable ? essayer STATBEL_HORS_VPN=1)."; exit 1; }
an_tva="$(derniere_annee "$URL_TVA" 2022)" || { journal "ERREUR : aucun fichier TVA trouvé chez Statbel (site injoignable ? essayer STATBEL_HORS_VPN=1)."; exit 1; }
journal "Années retenues : population $an_pop (1er janvier), TVA $an_tva."

recuperer "${URL_POPULATION//@AN@/$an_pop}" "population-$an_pop.zip" || exit 1
recuperer "$URL_FISCAL" "revenus-fiscaux.zip" oui || exit 1 # le fichier est remplacé sur place à chaque nouvelle année de revenus
recuperer "${URL_TVA//@AN@/$an_tva}" "tva-$an_tva.zip" || exit 1
telecharger -o "$ARCHIVES/codes-postaux.csv" "$URL_CODES_POSTAUX" || { journal "ERREUR : téléchargement de la table des codes postaux échoué."; exit 1; }

un_seul() { # <dossier> <motif> : le seul fichier correspondant
  local f
  f="$(find "$1" -maxdepth 1 -type f -name "$2" | head -n 1)"
  [ -n "$f" ] || { journal "ERREUR : aucun fichier $2 dans $1."; return 1; }
  printf '%s\n' "$f"
}
f_pop="$(un_seul "$ARCHIVES/extraction-population-$an_pop.zip" '*.txt')" || exit 1
f_fisc="$(un_seul "$ARCHIVES/extraction-revenus-fiscaux.zip" '*.txt')" || exit 1
f_tva="$(un_seul "$ARCHIVES/extraction-tva-$an_tva.zip" '*.txt')" || exit 1

mkdir -p "$(dirname "$INDEX")" || exit 1
sortie="$(mktemp)" || { journal "ERREUR : mktemp a échoué."; exit 1; }
trap 'rm -f "$sortie"' EXIT
node "$CLI" importer --population "$f_pop" --annee-population "$an_pop" --fiscal "$f_fisc" --tva "$f_tva" --annee-tva "$an_tva" \
  --codes-postaux "$ARCHIVES/codes-postaux.csv" --index "$INDEX" > "$sortie" 2>&1
code=$?
sed 's/^/    /' "$sortie" >> "$JOURNAL"
rm -rf "${ARCHIVES:?}"/extraction-* # les fichiers extraits (plus de 400 Mo) ne servent plus ; les archives zip restent

if [ "$code" -eq 0 ]; then
  journal "Mise à jour Statbel terminée avec succès ($INDEX)."
  exit 0
fi
journal "ERREUR : l'importation Statbel a échoué (code $code), voir le détail ci-dessus."
exit 1

#!/usr/bin/env bash
# Recette de bout en bout de la fabrique, contre le service INSTALLÉ (atelier-fabrique).
#
# Elle dépose des travaux dans la file `entrant/` (comme le fait le plugin), attend leur résultat et vérifie :
#   (a) un document docx, xlsx, pptx et pdf : état `termine`, fichier, résultat.json, provenance.json
#       (sha256 recalculé), apercu.txt, etat.json (champ `tache`) ;
#   (a bis) un docx et un pptx avec charte d'essai (chartes-autorisees/recette-fabrique/document.json, posée via
#       sudo -n puis retirée) et un bloc graphique : parties word/charts et ppt/charts, aperçu « Charte appliquée : document » ;
#       une cellule `=SOMME(A1)` refusée ;
#   (b) une demande invalide : refusée dans `refuses/` (enveloppe), ou en `echec` propre (contenu) ;
#   (b bis) un travail d'une entreprise non inscrite : refusé, avec un avis `echec` lisible par l'opérateur dans
#       livrables/.refus/<uuid>.json (motif d'inscription) et aucun dossier livrables/<entreprise> créé ;
#   (c) une vidéo de 2 scènes : si la carte graphique est occupée (fabrique.gpu.gpu_disponible() faux, par
#       exemple JB joue), vérifie l'état `en_attente_gpu` avec sa raison, retire le travail proprement et
#       signale « vidéo réelle reportée » (code de sortie 3) ; sinon attend `termine` et contrôle ffprobe,
#       XMP trainedAlgorithmicMedia (exiftool) et provenance.
#
# Usage : scripts/recette-fabrique.sh [--sans-video]
# Codes de sortie : 0 tout est réussi ; 1 au moins une étape en échec ; 2 prérequis absent ;
#                   3 tout est réussi sauf la vidéo réelle, reportée faute de GPU libre.
# Variables : FABRIQUE_RACINE (défaut /var/lib/atelier-fabrique), RECETTE_DELAI_DOCUMENT_S (300),
#             RECETTE_DELAI_VIDEO_S (1800).
#
# Idempotente : tout ce qui est créé l'est sous l'entreprise `recette-fabrique` et retiré à la fin (et au
# début, si une exécution précédente a été interrompue). Le nettoyage de dossiers appartenant au service
# passe par `sudo -n`, limité aux chemins construits à partir des identifiants que cette recette a créés.
# La charte d'essai est posée dans $RACINE/chartes-autorisees/recette-fabrique/ et retirée par le même trap.
# L'entreprise `recette-fabrique` est ajoutée à `entreprises.json` (propriété de root, via `sudo -n`) au début
# et retirée à la fin, y compris en cas d'échec ou d'interruption (trap) : elle ne reste pas autorisée en production.
set -uo pipefail

DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RACINE="${FABRIQUE_RACINE:-/var/lib/atelier-fabrique}"
ENTREPRISE="recette-fabrique"
ENTREPRISE_NON_INSCRITE="recette-non-inscrite"  # jamais ajoutée à entreprises.json
DELAI_DOCUMENT_S="${RECETTE_DELAI_DOCUMENT_S:-300}"
DELAI_VIDEO_S="${RECETTE_DELAI_VIDEO_S:-1800}"
DELAI_ATTENTE_GPU_S=120
UUID_MOTIF='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

AVEC_VIDEO=1
for argument in "$@"; do
  case "$argument" in
    --sans-video) AVEC_VIDEO=0 ;;
    *) echo "usage : $0 [--sans-video]" >&2; exit 2 ;;
  esac
done

BILAN=()       # lignes « RÉUSSI|ÉCHEC|REPORTÉE : étape (détail) »
NB_ECHECS=0
VIDEO_REPORTEE=0
CREES=()       # identifiants de travaux créés par cette exécution
TMP="$(mktemp -d)" || { echo "mktemp impossible" >&2; exit 2; }

reussi() { BILAN+=("RÉUSSI : $1"); printf '  [RÉUSSI] %s\n' "$1"; }
echec() { BILAN+=("ÉCHEC : $1 ($2)"); NB_ECHECS=$((NB_ECHECS + 1)); printf '  [ÉCHEC] %s : %s\n' "$1" "$2"; }

# ---------- nettoyage ----------

# Retire un travail créé par la recette : livrable (propriété du service), dossier de travail éventuel.
retirer_travail() {
  local id="$1"
  [[ "$id" =~ $UUID_MOTIF ]] || return 0
  # travaux/ n'est pas traversable par l'opérateur : pas de test d'existence, suppression directe (-f).
  sudo -n rm -r -f --one-file-system -- "$RACINE/livrables/$ENTREPRISE/$id" "$RACINE/travaux/$id" 2>/dev/null
  rm -f -- "$RACINE/entrant/$id.json" 2>/dev/null
  return 0
}

# Retire les fichiers de refuses/ qui contiennent l'un des identifiants créés (lecture réservée au service).
retirer_refuses() {
  local id fichier
  for id in "$@"; do
    [[ "$id" =~ $UUID_MOTIF ]] || continue
    while IFS= read -r fichier; do
      [[ "$fichier" == "$RACINE/refuses/"*.refuse ]] && sudo -n rm -f -- "$fichier"
    done < <(sudo -n find "$RACINE/refuses" -maxdepth 1 -name '*.refuse' -exec grep -l -F -- "$id" {} + 2>/dev/null)
  done
  return 0
}

# Retire les avis de livrables/.refus/ des identifiants créés (propriété du service) : chemin construit depuis l'identifiant.
retirer_avis() {
  local id
  for id in "$@"; do
    [[ "$id" =~ $UUID_MOTIF ]] || continue
    sudo -n rm -f -- "$RACINE/livrables/.refus/$id.json"
  done
  return 0
}

LISTE_ENTREPRISES="$RACINE/entreprises.json"
DOSSIER_CHARTE="$RACINE/chartes-autorisees/$ENTREPRISE"
ENTREPRISE_AJOUTEE=0

# modifier_entreprises <ajouter|retirer> : réécrit entreprises.json en entier (fichier neuf puis renommage, jamais
# lu à moitié par le service), avec le propriétaire et les droits d'origine (root:atelier-fabrique 0640).
# Ne touche à rien si la liste est déjà dans l'état voulu.
modifier_entreprises() {
  local action="$1" filtre nouveau contenu
  case "$action" in
    ajouter) filtre='if any(.[]; . == $e) then . else . + [$e] end' ;;
    retirer) filtre='map(select(. != $e))' ;;
    *) return 1 ;;
  esac
  contenu="$(sudo -n cat -- "$LISTE_ENTREPRISES" 2>/dev/null)" || return 1
  nouveau="$(printf '%s' "$contenu" | jq --arg e "$ENTREPRISE" "$filtre")" || return 1
  [[ "$nouveau" == "$(printf '%s' "$contenu" | jq .)" ]] && return 0
  printf '%s\n' "$nouveau" > "$TMP/entreprises.json" || return 1
  sudo -n install -m 0640 -o root -g atelier-fabrique -- "$TMP/entreprises.json" "$LISTE_ENTREPRISES.recette.tmp" \
    && sudo -n mv -f -- "$LISTE_ENTREPRISES.recette.tmp" "$LISTE_ENTREPRISES"
}

# Retire la charte d'essai (dossier propre à l'entreprise de la recette, propriété de root).
retirer_charte() {
  sudo -n rm -r -f --one-file-system -- "$DOSSIER_CHARTE" 2>/dev/null
  return 0
}

nettoyer() {
  local id
  ((ENTREPRISE_AJOUTEE == 1)) && { modifier_entreprises retirer || echo "ATTENTION : $ENTREPRISE n'a pas pu être retirée de $LISTE_ENTREPRISES" >&2; }
  retirer_charte
  for id in "${CREES[@]:-}"; do [[ -n "$id" ]] && retirer_travail "$id"; done
  retirer_refuses "${CREES[@]:-}"
  retirer_avis "${CREES[@]:-}"
  # Reste d'une exécution précédente interrompue : les identifiants sont tous sous l'entreprise de la recette.
  if [[ -d "$RACINE/livrables/$ENTREPRISE" ]]; then
    sudo -n rm -r --one-file-system -- "$RACINE/livrables/$ENTREPRISE" 2>/dev/null
  fi
  rm -rf -- "$TMP"
}
trap nettoyer EXIT

# ---------- prérequis ----------

prerequis() {
  local manque=0 outil
  for outil in python3 jq sha256sum unzip ffprobe exiftool sudo; do
    command -v "$outil" >/dev/null || { echo "prérequis absent : $outil" >&2; manque=1; }
  done
  systemctl is-active --quiet atelier-fabrique || { echo "service atelier-fabrique inactif" >&2; manque=1; }
  [[ -w "$RACINE/entrant" ]] || { echo "dépôt impossible dans $RACINE/entrant (ACL de l'opérateur)" >&2; manque=1; }
  sudo -n true 2>/dev/null || { echo "sudo -n indisponible (nettoyage impossible)" >&2; manque=1; }
  ((manque == 0)) || exit 2
  ENTREPRISE_AJOUTEE=1  # avant l'ajout : un ajout à moitié fait doit aussi être défait
  modifier_entreprises ajouter || { echo "ajout de $ENTREPRISE à $LISTE_ENTREPRISES impossible" >&2; exit 2; }
  # Reste d'une exécution précédente interrompue.
  [[ -d "$RACINE/livrables/$ENTREPRISE" ]] && sudo -n rm -r --one-file-system -- "$RACINE/livrables/$ENTREPRISE" 2>/dev/null
  retirer_charte
  return 0
}

# ---------- dépôt et attente ----------

# deposer <type> <entreprise> <tache> <demande-json> : écrit l'entrée en deux temps (un nom caché n'est jamais
# lu par le service), puis la renomme. L'identifiant du travail est rendu dans DERNIER_ID (pas de sous-shell :
# la liste CREES, qui sert au nettoyage, doit être mise à jour dans le shell principal).
DERNIER_ID=""
deposer() {
  local type="$1" entreprise="$2" tache="$3" demande="$4" id
  DERNIER_ID=""
  id="$(python3 -c 'import uuid; print(uuid.uuid4())')" || return 1
  CREES+=("$id")
  python3 - "$type" "$entreprise" "$tache" "$id" "$demande" > "$RACINE/entrant/.$id.json.tmp" <<'PY' || return 1
import json, sys
type_, entreprise, tache, travail, demande = sys.argv[1:6]
print(json.dumps({"travail": travail, "entreprise": entreprise, "agent": "recette", "run": "recette",
                  "cree_le": "2026-10-24T10:00:00Z", "type": type_, "tache": tache,
                  "demande": json.loads(demande)}))
PY
  mv -- "$RACINE/entrant/.$id.json.tmp" "$RACINE/entrant/$id.json" || return 1
  DERNIER_ID="$id"
}

livrable() { printf '%s/livrables/%s/%s' "$RACINE" "$ENTREPRISE" "$1"; }

# attendre_etat <id> <délai s> <état>... : attend que etat.json prenne l'un des états ; imprime l'état atteint
# (ou « delai »). Les états terminaux inattendus (echec) interrompent aussi l'attente.
attendre_etat() {
  local id="$1" delai="$2" etat debut; shift 2
  debut=$SECONDS
  while ((SECONDS - debut < delai)); do
    etat="$(jq -r '.etat // empty' "$(livrable "$id")/etat.json" 2>/dev/null)"
    case " $* " in *" $etat "*) printf '%s\n' "$etat"; return 0 ;; esac
    [[ "$etat" == "echec" ]] && { printf 'echec\n'; return 0; }
    sleep 2
  done
  printf 'delai\n'
}

# ---------- vérifications d'un livrable ----------

# verifier_livrable <id> <tache> <extension> <vidéo:0|1> : code 0 si tout est conforme, sinon imprime le motif.
verifier_livrable() {
  local id="$1" tache="$2" extension="$3" dossier fichier sha_resultat sha_provenance sha_reel
  dossier="$(livrable "$id")"
  [[ "$(jq -r '.etat' "$dossier/etat.json" 2>/dev/null)" == "termine" ]] || { echo "etat.json n'est pas termine"; return 1; }
  [[ "$(jq -r '.tache' "$dossier/etat.json" 2>/dev/null)" == "$tache" ]] || { echo "etat.json : tache absente ou différente"; return 1; }
  fichier="$(jq -r '.fichiers[0].fichier // empty' "$dossier/resultat.json" 2>/dev/null)"
  [[ "$fichier" == *".$extension" && "$fichier" =~ ^[A-Za-z0-9._-]+$ && -f "$dossier/$fichier" ]] \
    || { echo "resultat.json : fichier .$extension introuvable"; return 1; }
  sha_reel="$(sha256sum -- "$dossier/$fichier" | cut -d' ' -f1)"
  sha_resultat="$(jq -r '.fichiers[0].sha256' "$dossier/resultat.json")"
  sha_provenance="$(jq -r '.sha256' "$dossier/provenance.json" 2>/dev/null)"
  [[ -n "$sha_reel" && "$sha_reel" == "$sha_resultat" ]] || { echo "sha256 de resultat.json différent du fichier"; return 1; }
  [[ "$sha_reel" == "$sha_provenance" ]] || { echo "sha256 de provenance.json différent du fichier"; return 1; }
  [[ "$(jq -r '.fichier' "$dossier/provenance.json")" == "$fichier" ]] || { echo "provenance.json vise un autre fichier"; return 1; }
  [[ "$(jq -r '.digital_source_type' "$dossier/provenance.json")" == *"/trainedAlgorithmicMedia" ]] \
    || { echo "provenance.json : digital_source_type absent"; return 1; }
  [[ -s "$dossier/apercu.txt" ]] || { echo "apercu.txt absent ou vide"; return 1; }
  case "$extension" in
    pdf) [[ "$(head -c 5 "$dossier/$fichier")" == "%PDF-" ]] || { echo "le fichier n'est pas un PDF"; return 1; } ;;
    docx | xlsx | pptx) unzip -tq "$dossier/$fichier" >/dev/null 2>&1 || { echo "archive Office invalide"; return 1; } ;;
  esac
  return 0
}

# ---------- (a) documents ----------

DEMANDE_DOCX='{"format":"docx","modele":"sobre","titre":"Recette docx","langue":"fr-BE","blocs":[{"type":"titre","niveau":1,"texte":"Bonjour"},{"type":"paragraphe","texte":"Texte de recette"},{"type":"liste","elements":["a","b"]}]}'
DEMANDE_XLSX='{"format":"xlsx","modele":"sobre","titre":"Recette xlsx","langue":"fr-BE","feuilles":[{"nom":"Budget","lignes":[[{"type":"texte","valeur":"Poste"},{"type":"nombre","valeur":42}]]}]}'
DEMANDE_PPTX='{"format":"pptx","modele":"sobre","titre":"Recette pptx","langue":"fr-BE","blocs":[{"type":"titre","niveau":1,"texte":"Diapo"},{"type":"paragraphe","texte":"Texte de recette"}]}'
DEMANDE_PDF='{"format":"pdf","modele":"sobre","titre":"Recette pdf","langue":"fr-BE","blocs":[{"type":"titre","niveau":1,"texte":"Page"},{"type":"paragraphe","texte":"Texte de recette"}]}'

etape_documents() {
  echo "Étape (a) : documents docx, xlsx, pptx, pdf"
  local formats=(docx xlsx pptx pdf) format demande id etat motif
  declare -A IDS TACHES
  for format in "${formats[@]}"; do
    case "$format" in
      docx) demande="$DEMANDE_DOCX" ;; xlsx) demande="$DEMANDE_XLSX" ;;
      pptx) demande="$DEMANDE_PPTX" ;; pdf) demande="$DEMANDE_PDF" ;;
    esac
    TACHES[$format]="recette-$format-$$"
    deposer document "$ENTREPRISE" "${TACHES[$format]}" "$demande" || echo "dépôt $format impossible"
    id="$DERNIER_ID"
    IDS[$format]="$id"
  done
  for format in "${formats[@]}"; do
    id="${IDS[$format]}"
    [[ -n "$id" ]] || { echec "document $format" "dépôt impossible"; continue; }
    etat="$(attendre_etat "$id" "$DELAI_DOCUMENT_S" termine)"
    if [[ "$etat" != "termine" ]]; then
      echec "document $format" "état « $etat » après attente (message : $(jq -r '.message // "aucun"' "$(livrable "$id")/etat.json" 2>/dev/null))"
      continue
    fi
    if motif="$(verifier_livrable "$id" "${TACHES[$format]}" "$format")"; then
      reussi "document $format (fichier, résultat, provenance sha256, aperçu, tâche)"
    else
      echec "document $format" "$motif"
    fi
  done
}

# ---------- (a bis) charte, graphique, formule ----------

GRAPHIQUE='{"type":"graphique","genre":"colonnes","titre":"Ventes par année","categories":["2025","2026"],"series":[{"nom":"Ventes","valeurs":[21,28.5]}],"source":"Données fictives de recette","texte_remplacement":"Colonnes : 28,5 en 2026 contre 21 en 2025."}'
DEMANDE_DOCX_GRAPHIQUE='{"format":"docx","modele":"sobre","titre":"Recette docx graphique","langue":"fr-BE","blocs":[{"type":"titre","niveau":1,"texte":"Bonjour"},'"$GRAPHIQUE"']}'
DEMANDE_PPTX_GRAPHIQUE='{"format":"pptx","modele":"sobre","titre":"Recette pptx graphique","langue":"fr-BE","blocs":[{"type":"titre","niveau":1,"texte":"Diapo"},'"$GRAPHIQUE"']}'
DEMANDE_XLSX_FORMULE='{"format":"xlsx","modele":"sobre","titre":"Recette formule","langue":"fr-BE","feuilles":[{"nom":"F1","lignes":[[{"type":"texte","valeur":"=SOMME(A1)"}]]}]}'

# poser_charte : charte d'essai sans nom de client, écrite par root (droits d'origine du registre : root:atelier-fabrique 0640).
poser_charte() {
  printf '%s\n' '{"id":"document","couleurs":{"fond":"#ffffff","texte":"#1b1b1b","accent":"#1f4e8c"},"police":"archivo"}' > "$TMP/document.json" || return 1
  sudo -n install -d -o root -g atelier-fabrique -m 0750 -- "$DOSSIER_CHARTE" \
    && sudo -n install -m 0640 -o root -g atelier-fabrique -- "$TMP/document.json" "$DOSSIER_CHARTE/document.json"
}

etape_charte_graphique() {
  echo "Étape (a bis) : charte d'essai, graphique natif, formule refusée"
  local format id etat motif message dossier
  declare -A IDS TACHES
  if ! poser_charte; then echec "charte d'essai" "pose impossible dans $DOSSIER_CHARTE"; return; fi
  for format in docx pptx; do
    TACHES[$format]="recette-graphique-$format-$$"
    if [[ "$format" == docx ]]; then deposer document "$ENTREPRISE" "${TACHES[$format]}" "$DEMANDE_DOCX_GRAPHIQUE"
    else deposer document "$ENTREPRISE" "${TACHES[$format]}" "$DEMANDE_PPTX_GRAPHIQUE"; fi
    IDS[$format]="$DERNIER_ID"
  done
  for format in docx pptx; do
    id="${IDS[$format]}"
    [[ -n "$id" ]] || { echec "document $format avec charte et graphique" "dépôt impossible"; continue; }
    etat="$(attendre_etat "$id" "$DELAI_DOCUMENT_S" termine)"
    if [[ "$etat" != "termine" ]]; then
      echec "document $format avec charte et graphique" "état « $etat » (message : $(jq -r '.message // "aucun"' "$(livrable "$id")/etat.json" 2>/dev/null))"
      continue
    fi
    dossier="$(livrable "$id")"
    if ! motif="$(verifier_livrable "$id" "${TACHES[$format]}" "$format")"; then echec "document $format avec charte et graphique" "$motif"; continue; fi
    if ! unzip -Z1 "$dossier/$(jq -r '.fichiers[0].fichier' "$dossier/resultat.json")" | grep -Eq "^(word|ppt)/charts/chart[0-9]*\.xml$"; then
      echec "document $format avec charte et graphique" "aucune partie charts dans l'archive"; continue
    fi
    if [[ "$(head -n 1 "$dossier/apercu.txt")" != "Charte appliquée : document" ]]; then
      echec "document $format avec charte et graphique" "aperçu sans « Charte appliquée : document »"; continue
    fi
    reussi "document $format avec charte et graphique (partie charts, aperçu de la charte)"
  done
  retirer_charte
  # Une cellule qui ressemble à une formule est refusée : échec propre, aucun fichier livré.
  deposer document "$ENTREPRISE" "recette-formule-$$" "$DEMANDE_XLSX_FORMULE" || { echec "formule refusée" "dépôt impossible"; return; }
  id="$DERNIER_ID"
  etat="$(attendre_etat "$id" 120 echec)"
  message="$(jq -r '.message // empty' "$(livrable "$id")/etat.json" 2>/dev/null)"
  if [[ "$etat" == "echec" && "$message" == "demande invalide"* && "$(find "$(livrable "$id")" -maxdepth 1 -type f ! -name etat.json | wc -l)" -eq 0 ]]; then
    reussi "cellule =SOMME(A1) refusée (« $message »), aucun fichier livré"
  else
    echec "formule refusée" "état « $etat », message « $message »"
  fi
}

# ---------- (b bis) entreprise non inscrite ----------

etape_non_inscrite() {
  echo "Étape (b bis) : travail d'une entreprise non inscrite, avis de refus"
  local id avis debut etat message
  deposer document "$ENTREPRISE_NON_INSCRITE" "recette-non-inscrite-$$" "$DEMANDE_DOCX" || { echec "entreprise non inscrite" "dépôt impossible"; return; }
  id="$DERNIER_ID"
  avis="$RACINE/livrables/.refus/$id.json"
  debut=$SECONDS
  while ((SECONDS - debut < 60)) && [[ ! -f "$avis" ]]; do sleep 2; done
  [[ -f "$avis" ]] || { echec "entreprise non inscrite" "aucun avis dans livrables/.refus/ après 60 s"; return; }
  etat="$(jq -r '.etat // empty' "$avis" 2>/dev/null)"
  message="$(jq -r '.message // empty' "$avis" 2>/dev/null)"
  if [[ "$etat" == "echec" && "$message" == *"non inscrite"* && ! -e "$RACINE/livrables/$ENTREPRISE_NON_INSCRITE" ]]; then
    reussi "entreprise non inscrite refusée avec avis lisible (« ${message:0:80} »), aucun dossier d'entreprise créé"
  else
    echec "entreprise non inscrite" "état « $etat », message « $message », dossier d'entreprise : $([[ -e "$RACINE/livrables/$ENTREPRISE_NON_INSCRITE" ]] && echo présent || echo absent)"
  fi
}

# ---------- (b) demande invalide ----------

etape_invalide() {
  echo "Étape (b) : demandes invalides"
  local id etat debut trouve=0 message
  # Enveloppe invalide (entreprise avec un chemin) : le service doit la déplacer dans refuses/.
  deposer document "../x" "recette-refus-$$" "$DEMANDE_DOCX" || { echec "demande refusée" "dépôt impossible"; return; }
  id="$DERNIER_ID"
  debut=$SECONDS
  while ((SECONDS - debut < 60)); do
    [[ -e "$RACINE/entrant/$id.json" ]] || { trouve=1; break; }
    sleep 1
  done
  if ((trouve == 0)); then
    echec "demande invalide refusée" "l'entrée est restée dans entrant/ après 60 s"
  elif [[ -n "$(sudo -n find "$RACINE/refuses" -maxdepth 1 -name '*.refuse' -exec grep -l -F -- "$id" {} + 2>/dev/null)" ]]; then
    reussi "demande invalide (entreprise ../x) déplacée dans refuses/"
  else
    echec "demande invalide refusée" "entrée partie de entrant/ mais absente de refuses/"
  fi
  [[ ! -e "$RACINE/livrables/../x" && ! -e "$RACINE/livrables/$ENTREPRISE/$id" ]] || echec "demande invalide" "un livrable a été créé"
  # Contenu invalide (modèle hors liste) : échec propre, aucun fichier livré.
  deposer document "$ENTREPRISE" "recette-echec-$$" '{"format":"docx","modele":"../../x","titre":"T","langue":"fr-BE"}' \
    || { echec "demande de contenu invalide" "dépôt impossible"; return; }
  id="$DERNIER_ID"
  etat="$(attendre_etat "$id" 120 echec)"
  message="$(jq -r '.message // empty' "$(livrable "$id")/etat.json" 2>/dev/null)"
  if [[ "$etat" == "echec" && "$message" == "demande invalide"* && "$(find "$(livrable "$id")" -maxdepth 1 -type f ! -name etat.json | wc -l)" -eq 0 ]]; then
    reussi "demande de contenu invalide : échec propre (« $message »), aucun fichier livré"
  else
    echec "demande de contenu invalide" "état « $etat », message « $message »"
  fi
}

# ---------- (c) vidéo ----------

DEMANDE_VIDEO='{"format_sortie":"1080x1920","sous_titres":true,"scenes":[
 {"texte_voix":"Bonjour, ceci est un essai.","voix":"synthese-chatterbox-fr","visuel":{"gabarit":"titre_plein_ecran","champs":{"titre":"Recette"}}},
 {"texte_voix":"Trois points à retenir.","voix":"synthese-chatterbox-fr","visuel":{"gabarit":"liste_3_points","champs":{"titre":"Points","points":["Un","Deux","Trois"]}}}]}'

gpu_libre() { (cd "$DEPOT" && python3 -c 'import sys; from fabrique import gpu; ok, raison = gpu.gpu_disponible(); print(raison); sys.exit(0 if ok else 1)'); }

verifier_video() {
  local id="$1" tache="$2" dossier fichier flux xmp
  dossier="$(livrable "$id")"
  verifier_livrable "$id" "$tache" mp4 || return 1
  fichier="$(jq -r '.fichiers[0].fichier' "$dossier/resultat.json")"
  flux="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height -of csv=p=0 "$dossier/$fichier" 2>&1)"
  [[ "$flux" == "h264,1080,1920" ]] || { echo "ffprobe vidéo : « $flux » au lieu de h264,1080,1920"; return 1; }
  [[ "$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$dossier/$fichier" 2>&1)" == "aac" ]] \
    || { echo "ffprobe : piste audio aac absente"; return 1; }
  xmp="$(exiftool -s3 -XMP-iptcExt:DigitalSourceType "$dossier/$fichier" 2>&1)"
  [[ "$xmp" == *"trainedAlgorithmicMedia" ]] || { echo "XMP DigitalSourceType : « $xmp »"; return 1; }
  [[ "$(jq -r '.filigrane_perth.detecte' "$dossier/provenance.json")" == "true" ]] \
    || { echo "provenance.json : filigrane PerTh non confirmé"; return 1; }
  return 0
}

etape_video() {
  echo "Étape (c) : vidéo de 2 scènes"
  local libre raison id etat motif tache="recette-video-$$"
  if libre="$(gpu_libre)"; then
    echo "  GPU libre : $libre. Vidéo réelle (30 min au plus)."
    deposer video "$ENTREPRISE" "$tache" "$DEMANDE_VIDEO" || { echec "vidéo" "dépôt impossible"; return; }
    id="$DERNIER_ID"
    etat="$(attendre_etat "$id" "$DELAI_VIDEO_S" termine en_attente_gpu)"
    case "$etat" in
      termine)
        if motif="$(verifier_video "$id" "$tache")"; then reussi "vidéo réelle (ffprobe, XMP, provenance, sha256)"
        else echec "vidéo réelle" "$motif"; fi ;;
      en_attente_gpu)
        VIDEO_REPORTEE=1; BILAN+=("REPORTÉE : vidéo réelle (le GPU a été repris pendant la recette)"); retirer_travail "$id" ;;
      *) echec "vidéo réelle" "état « $etat » : $(jq -r '.message // "aucun message"' "$(livrable "$id")/etat.json" 2>/dev/null)" ;;
    esac
    return
  fi
  echo "  GPU occupé : $libre"
  deposer video "$ENTREPRISE" "$tache" "$DEMANDE_VIDEO" || { echec "vidéo en attente du GPU" "dépôt impossible"; return; }
  id="$DERNIER_ID"
  etat="$(attendre_etat "$id" "$DELAI_ATTENTE_GPU_S" en_attente_gpu termine)"
  raison="$(jq -r '.raison // empty' "$(livrable "$id")/etat.json" 2>/dev/null)"
  if [[ "$etat" == "en_attente_gpu" && -n "$raison" && "$(jq -r '.tache' "$(livrable "$id")/etat.json")" == "$tache" ]]; then
    reussi "vidéo en attente du GPU avec raison (« ${raison:0:80} »)"
    VIDEO_REPORTEE=1
    BILAN+=("REPORTÉE : vidéo réelle (GPU occupé)")
    echo "  vidéo réelle reportée"
  elif [[ "$etat" == "termine" ]]; then
    # Le GPU s'est libéré entre-temps : la vidéo a été fabriquée, on la contrôle.
    if motif="$(verifier_video "$id" "$tache")"; then reussi "vidéo réelle (GPU libéré pendant la recette)"
    else echec "vidéo réelle" "$motif"; fi
  else
    echec "vidéo en attente du GPU" "état « $etat », raison « $raison »"
  fi
  # Retrait propre : le service garde le travail en mémoire ; on supprime ses dossiers. À sa reprise il
  # échouera (« erreur interne ») sans toucher au GPU ; ce résidu est purgé au début de la recette suivante.
  retirer_travail "$id"
}

# ---------- déroulement ----------

prerequis
etape_documents
etape_charte_graphique
etape_invalide
etape_non_inscrite
((AVEC_VIDEO == 1)) && etape_video

echo
echo "Bilan de la recette"
printf '  %s\n' "${BILAN[@]}"
if ((NB_ECHECS > 0)); then echo "Résultat : ÉCHEC ($NB_ECHECS étape(s) en échec)"; exit 1; fi
if ((VIDEO_REPORTEE == 1)); then echo "Résultat : RÉUSSI sauf la vidéo réelle, reportée"; exit 3; fi
echo "Résultat : RÉUSSI"
exit 0

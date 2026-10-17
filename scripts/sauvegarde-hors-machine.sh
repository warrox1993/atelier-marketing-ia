#!/usr/bin/env bash
# Sauvegarde hors machine de l'Atelier marketing IA : copie tout ce qu'il faut pour reconstruire les
# instances vers un AUTRE disque, avec empreintes sha256 vérifiées sur la copie. Aucune instance n'est
# arrêtée ni modifiée (lecture seule côté source ; la base vivante `db/` n'est jamais copiée : on prend
# la dernière sauvegarde logique de `data/backups/`).
#
# Usage : scripts/sauvegarde-hors-machine.sh <destination> [--instances a,b] [--garder N] [--essai]
#                                            [--meme-disque] [--source <racine>] [--phoenix <dossier>]
#         scripts/sauvegarde-hors-machine.sh --verifier <dossier-de-copie>
# Par instance (défaut : atelier) : dernière sauvegarde de base, secrets/ (dont master.key),
# companies/, data/storage/ (s'il existe). Une fois : instance/cles, instance/secrets, instance/passerelles,
# instance/plugin-jb, instance/demo-client (lien suivi), passerelle/etat.
# Phoenix (traces) : sa base SQLite (WAL) est copiée par l'API de sauvegarde SQLite, sans arrêter le service,
# vers phoenix/phoenix.db ; dossier absent = message et la sauvegarde continue (défaut : --phoenix
# ~/.local/share/atelier-phoenix/donnees).
# Copie : <destination>/atelier-AAAAMMJJ-HHMM/ (0700), rotation sur les N dernières (défaut 14).
# Code de sortie : 0 = tout va bien ; 1 = échec (élément manquant, empreinte différente, etc.) ; 2 = mauvais usage.
set -uo pipefail
umask 077

RACINE_DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${RACINE_DEPOT}"
DESTINATION=""; INSTANCES="atelier"; GARDER=14
ESSAI=0; MEME_DISQUE=0; VERIFIER=""
PHOENIX="${HOME}/.local/share/atelier-phoenix/donnees"

echec() { echo "ERREUR : $*" >&2; exit 1; }
usage() { echo "ERREUR : $*" >&2; sed -n '9,11p' "${BASH_SOURCE[0]}" | sed 's/^# //' >&2; exit 2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --essai) ESSAI=1 ;;
    --meme-disque) MEME_DISQUE=1 ;;
    --garder) [[ $# -ge 2 ]] || usage "--garder demande un nombre"; GARDER="$2"; shift ;;
    --instances) [[ $# -ge 2 ]] || usage "--instances demande une liste"; INSTANCES="$2"; shift ;;
    --source) [[ $# -ge 2 ]] || usage "--source demande un dossier"; SOURCE="$2"; shift ;;
    --phoenix) [[ $# -ge 2 ]] || usage "--phoenix demande un dossier"; PHOENIX="$2"; shift ;;
    --verifier) [[ $# -ge 2 ]] || usage "--verifier demande un dossier"; VERIFIER="$2"; shift ;;
    -h|--aide) sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) usage "Argument inconnu : $1" ;;
    *) [[ -z "${DESTINATION}" ]] || usage "Une seule destination attendue"; DESTINATION="$1" ;;
  esac
  shift
done

[[ "${GARDER}" =~ ^[1-9][0-9]*$ ]] || usage "--garder doit être un entier >= 1 (reçu : ${GARDER})"

# Contrôle sha256sum -c relu sur la copie. Code 0 si tout correspond.
verifier_copie() {
  local dossier="$1"
  [[ -f "${dossier}/EMPREINTES.sha256" ]] || { echo "ERREUR : ${dossier}/EMPREINTES.sha256 absent" >&2; return 1; }
  local sortie
  if ! sortie="$(cd "${dossier}" && sha256sum -c --quiet EMPREINTES.sha256 2>&1)"; then
    echo "ERREUR : empreinte différente ou fichier manquant dans la copie :" >&2
    echo "${sortie}" | sed 's/^/  /' >&2
    return 1
  fi
  return 0
}

if [[ -n "${VERIFIER}" ]]; then
  [[ -d "${VERIFIER}" ]] || echo "ERREUR : dossier introuvable : ${VERIFIER}" >&2
  [[ -d "${VERIFIER}" ]] || exit 1
  verifier_copie "${VERIFIER}" || exit 1
  echo "Copie ${VERIFIER} : toutes les empreintes correspondent."
  exit 0
fi

[[ -n "${DESTINATION}" ]] || usage "Destination manquante"
[[ -d "${SOURCE}" ]] || echo "ERREUR : source introuvable : ${SOURCE}" >&2
[[ -d "${SOURCE}" ]] || exit 1
[[ -d "${DESTINATION}" ]] || echo "ERREUR : la destination n'existe pas : ${DESTINATION} (créer le dossier d'abord)" >&2
[[ -d "${DESTINATION}" ]] || exit 1
[[ -w "${DESTINATION}" ]] || echo "ERREUR : destination non inscriptible : ${DESTINATION}" >&2
[[ -w "${DESTINATION}" ]] || exit 1
for outil in rsync sha256sum df du gzip; do
  command -v "${outil}" >/dev/null 2>&1 || echo "ERREUR : outil requis absent : ${outil}" >&2
  command -v "${outil}" >/dev/null 2>&1 || exit 1
done

# Refus d'une destination sur le même disque que la source (sauf --meme-disque).
disque_de() { df --output=source -- "$1" 2>/dev/null | tail -n 1 | tr -d ' '; }
DISQUE_SRC="$(disque_de "${SOURCE}")"; DISQUE_DST="$(disque_de "${DESTINATION}")"
if [[ -z "${DISQUE_SRC}" || -z "${DISQUE_DST}" ]]; then
  echo "ERREUR : disque de la source ou de la destination indéterminé (df)." >&2; exit 1
fi
if [[ "${DISQUE_SRC}" == "${DISQUE_DST}" && "${MEME_DISQUE}" -ne 1 ]]; then
  echo "ERREUR : la destination est sur le même disque que la source (${DISQUE_SRC}) : ce n'est pas une sauvegarde hors machine. Utiliser --meme-disque pour passer outre." >&2
  exit 1
fi

# Construction de la liste des éléments (chemins relatifs à SOURCE) ; manquants obligatoires cumulés.
ELEMENTS=(); MANQUANTS=()
exiger() { [[ -e "${SOURCE}/$1" ]] && ELEMENTS+=("$1") || MANQUANTS+=("$1"); }

IFS=',' read -r -a LISTE_INSTANCES <<< "${INSTANCES}"
for id in "${LISTE_INSTANCES[@]}"; do
  [[ -n "${id}" ]] || continue
  base="instance/instances/${id}"
  derniere=""
  if [[ -d "${SOURCE}/${base}/data/backups" ]]; then
    derniere="$(cd "${SOURCE}/${base}/data/backups" && ls -1 paperclip-*.sql.gz 2>/dev/null | sort | tail -n 1)"
  fi
  if [[ -n "${derniere}" ]]; then
    if gzip -t "${SOURCE}/${base}/data/backups/${derniere}" 2>/dev/null; then
      ELEMENTS+=("${base}/data/backups/${derniere}")
    else
      echo "ERREUR : la dernière sauvegarde de base de ${id} est corrompue : ${derniere}" >&2; exit 1
    fi
  else
    MANQUANTS+=("${base}/data/backups/paperclip-*.sql.gz (aucune sauvegarde de base)")
  fi
  exiger "${base}/secrets"
  [[ -f "${SOURCE}/${base}/secrets/master.key" ]] || MANQUANTS+=("${base}/secrets/master.key")
  exiger "${base}/companies"
  [[ -d "${SOURCE}/${base}/data/storage" ]] && ELEMENTS+=("${base}/data/storage")
done
for rel in instance/cles instance/secrets instance/passerelles instance/plugin-jb instance/demo-client passerelle/etat; do
  exiger "${rel}"
done

if [[ ${#MANQUANTS[@]} -gt 0 ]]; then
  echo "ERREUR : élément(s) obligatoire(s) manquant(s) dans ${SOURCE} :" >&2
  printf '  - %s\n' "${MANQUANTS[@]}" >&2
  exit 1
fi

# Tailles : les liens ne sont pas suivis (comme rsync -a), sauf demo-client (lien suivi à la copie).
taille_de() {
  local opt=-sh; [[ "$1" == "instance/demo-client" ]] && opt=-shL
  du "${opt}" -- "${SOURCE}/$1" 2>/dev/null | cut -f1
}

HORODATAGE="$(date +%Y%m%d-%H%M)"
NOM="atelier-${HORODATAGE}"
FINAL="${DESTINATION}/${NOM}"
TEMP="${DESTINATION}/.${NOM}.en-cours"

if [[ "${ESSAI}" -eq 1 ]]; then
  echo "ESSAI (rien n'est copié). Source : ${SOURCE} (disque ${DISQUE_SRC}) ; destination : ${FINAL} (disque ${DISQUE_DST})"
  for rel in "${ELEMENTS[@]}"; do printf '  %8s  %s\n' "$(taille_de "${rel}")" "${rel}"; done
  if [[ -f "${PHOENIX}/phoenix.db" ]]; then
    printf '  %8s  %s\n' "$(du -sh -- "${PHOENIX}/phoenix.db" | cut -f1)" "phoenix/phoenix.db (copie SQLite cohérente de ${PHOENIX})"
  else
    echo "  Phoenix : ${PHOENIX}/phoenix.db absent, ignoré."
  fi
  TOTAL="$(cd "${SOURCE}" && du -shc -- "${ELEMENTS[@]}" 2>/dev/null | tail -n 1 | cut -f1)"
  echo "Total à copier : ${TOTAL} ; rotation : garder ${GARDER} copie(s)."
  df -h --output=avail -- "${DESTINATION}" | tail -n 1 | sed 's/^ */Espace libre sur la destination : /'
  exit 0
fi

[[ ! -e "${FINAL}" ]] || echo "ERREUR : la copie ${FINAL} existe déjà (attendre la minute suivante)" >&2
[[ ! -e "${FINAL}" ]] || exit 1
rm -rf -- "${TEMP}" 2>/dev/null   # reste d'une exécution interrompue, créé par ce script
DEBUT="${SECONDS}"
mkdir -m 0700 -- "${TEMP}" || echo "ERREUR : création de ${TEMP} impossible" >&2
[[ -d "${TEMP}" ]] || exit 1
abandon() { rm -rf -- "${TEMP}"; echo "ERREUR : $* (copie abandonnée, rien conservé)" >&2; exit 1; }

for rel in "${ELEMENTS[@]}"; do
  # -R : reproduit le chemin relatif ; -L seulement pour demo-client (lien suivi).
  opts=(-aR); [[ "${rel}" == "instance/demo-client" ]] && opts=(-aRL)
  if ! (cd "${SOURCE}" && rsync "${opts[@]}" -- "./${rel}" "${TEMP}/") ; then
    abandon "rsync a échoué pour ${rel}"
  fi
done

# Phoenix : copie cohérente de la base SQLite en mode WAL, sans arrêter le service (API de sauvegarde SQLite,
# vers un fichier temporaire dans la copie en cours, donc jamais de copie à moitié écrite dans la destination).
if [[ -f "${PHOENIX}/phoenix.db" ]]; then
  mkdir -m 0700 -- "${TEMP}/phoenix" || abandon "création de ${TEMP}/phoenix impossible"
  PHX_TMP="${TEMP}/phoenix/.phoenix.db.en-cours"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 -cmd '.timeout 30000' "file:${PHOENIX}/phoenix.db?mode=ro" ".backup '${PHX_TMP}'" \
      || abandon "sauvegarde SQLite de Phoenix impossible (sqlite3)"
  else
    python3 -I -c 'import sqlite3, sys
src = sqlite3.connect("file:" + sys.argv[1] + "?mode=ro", uri=True, timeout=30)
dst = sqlite3.connect(sys.argv[2])
with dst:
    src.backup(dst)
dst.close(); src.close()' "${PHOENIX}/phoenix.db" "${PHX_TMP}" \
      || abandon "sauvegarde SQLite de Phoenix impossible (python3)"
  fi
  [[ "$(sqlite3 "${PHX_TMP}" 'PRAGMA integrity_check' 2>/dev/null || echo ok)" == "ok" ]] \
    || abandon "la copie de la base Phoenix est corrompue"
  mv -- "${PHX_TMP}" "${TEMP}/phoenix/phoenix.db" || abandon "renommage de la copie Phoenix impossible"
  chmod 600 "${TEMP}/phoenix/phoenix.db"
  echo "Phoenix : base copiée (${PHOENIX}/phoenix.db)."
else
  echo "Phoenix : ${PHOENIX}/phoenix.db absent, données Phoenix non sauvegardées (la sauvegarde continue)." >&2
fi

if [[ -L "${SOURCE}/instance/demo-client" ]]; then
  readlink "${SOURCE}/instance/demo-client" > "${TEMP}/instance/demo-client.lien"
fi

# Empreintes calculées sur la copie, puis contrôle relu.
( cd "${TEMP}" && find . -type f ! -name EMPREINTES.sha256 -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum > EMPREINTES.sha256 ) \
  || abandon "calcul des empreintes impossible"
chmod 600 "${TEMP}/EMPREINTES.sha256"
NB="$(wc -l < "${TEMP}/EMPREINTES.sha256")"
[[ "${NB}" -gt 0 ]] || abandon "aucun fichier copié"
verifier_copie "${TEMP}" || abandon "vérification des empreintes en échec"

# Cohérence avec la source : chaque sauvegarde de base copiée doit être identique à l'originale.
for rel in "${ELEMENTS[@]}"; do
  if [[ "${rel}" == */data/backups/*.sql.gz ]]; then
    cmp -s "${SOURCE}/${rel}" "${TEMP}/${rel}" || abandon "la copie de ${rel} diffère de la source"
  fi
done

mv -- "${TEMP}" "${FINAL}" || abandon "renommage final impossible"
chmod 0700 "${FINAL}"
echo "Copie terminée : ${FINAL} ($(du -sh -- "${FINAL}" | cut -f1), ${NB} fichiers, empreintes vérifiées, $((SECONDS - DEBUT)) s)."

# Rotation : seulement après une copie vérifiée, sur les dossiers de ce script (nom + EMPREINTES.sha256).
mapfile -t COPIES < <(find "${DESTINATION}" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended \
  -regex '.*/atelier-[0-9]{8}-[0-9]{4}' -printf '%f\n' | LC_ALL=C sort)
NB_COPIES=${#COPIES[@]}
if [[ "${NB_COPIES}" -gt "${GARDER}" ]]; then
  for ((i = 0; i < NB_COPIES - GARDER; i++)); do
    ancienne="${DESTINATION}/${COPIES[i]}"
    if [[ -f "${ancienne}/EMPREINTES.sha256" ]]; then
      rm -rf -- "${ancienne}" && echo "Rotation : ${COPIES[i]} supprimée."
    else
      echo "Rotation : ${COPIES[i]} ignorée (pas de EMPREINTES.sha256, dossier non reconnu)." >&2
    fi
  done
fi
exit 0

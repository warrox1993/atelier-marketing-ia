#!/usr/bin/env bash
# Sauvegarde hors machine de l'Atelier marketing IA : copie tout ce qu'il faut pour reconstruire les
# instances vers un AUTRE disque, avec empreintes sha256 vérifiées sur la copie. Aucune instance n'est
# arrêtée ni modifiée (lecture seule côté source ; la base vivante `db/` n'est jamais copiée : on prend
# la dernière sauvegarde logique de `data/backups/`).
#
# Usage : scripts/sauvegarde-hors-machine.sh <destination> [--instances a,b] [--garder N] [--essai]
#                                            [--meme-disque] [--source <racine>] [--phoenix <dossier>]
#                                            [--pages <fichier>] [--conteneurs c:base,…] [--manuel]
#         scripts/sauvegarde-hors-machine.sh --verifier <dossier-de-copie> [--dechiffrer]
# Par instance (défaut : atelier) : dernière sauvegarde de base, secrets/ (dont master.key),
# companies/, data/storage/ (s'il existe), .env et config.json de l'instance ; s'ils existent : skills/, projects/
# (espaces partagés des services), data/run-logs/. Une fois : instance/cles, instance/secrets, instance/passerelles,
# instance/plugin-jb, instance/demo-client (lien suivi), passerelle/etat ; s'ils existent (absence signalée) :
# instance/claude-config (mémoire des agents), instance/agents-atelier, instance/atelier-client, instance/atelier-demo
# (état local du bootstrap). Exclusion volontaire : instance/donnees (BCE, OSM, Statbel), reconstructible par les
# scripts *-mise-a-jour.sh.
# Bases des conteneurs (défaut : atelier-emailing-db:listmonk, dont les consentements, et atelier-umami-db:umami) :
# dump logique « pg_dump -Fc » dans le conteneur en marche, jamais le dossier pg vivant ; conteneur arrêté = message.
# Pages (preuves de consentement) : ~/.local/share/atelier/pages/pages.sqlite, copie SQLite cohérente comme Phoenix.
# Phoenix (traces) : sa base SQLite (WAL) est copiée par l'API de sauvegarde SQLite, sans arrêter le service,
# vers phoenix/phoenix.db ; dossier absent = message et la sauvegarde continue (défaut : --phoenix
# ~/.local/share/atelier-phoenix/donnees).
# Copie : <destination>/atelier-AAAAMMJJ-HHMM/ (0700), rotation sur les N dernières (défaut 14). --manuel nomme la
# copie manuel-AAAAMMJJ-HHMM : hors rotation, elle ne chasse jamais une copie quotidienne du minuteur.
# Chiffrement (AFD-M4) : la copie vérifiée est chiffrée avec une clé PUBLIQUE gpg (chemin : $ATELIER_SAUVEGARDE_CLE, à défaut
# ~/.config/atelier-sauvegarde/destinataire.asc ; la clé privée reste hors du poste). Le dossier final ne contient alors que
# copie.tar.gpg, copie.tar.gpg.sha256 et EMPREINTES.sha256 (empreintes des fichiers en clair) ; aucun fichier en clair ne reste.
# Le clair n'est JAMAIS écrit sur la destination (disque de données non chiffré, un « rm » n'efface pas les blocs) : il est préparé
# dans $XDG_CACHE_HOME/atelier-sauvegarde (défaut ~/.cache/atelier-sauvegarde, 0700, environ 350 Mo le temps de la copie) et supprimé
# ensuite ; seul le chiffré est écrit sur la destination. Idem pour le dossier de « --verifier --dechiffrer ». --sans-chiffrement
# et la copie faute de clé gardent la préparation sur la destination.
# Clé épinglée (B-8) : seule la clé d'empreinte FBA1811755A20A834C2DC0107017DCB221AA1441 est acceptée (une seule clé dans le
# fichier) ; sinon abandon « clé de chiffrement inattendue », code 1. Réglable pour les tests : $ATELIER_SAUVEGARDE_EMPREINTE
# (40 caractères hexadécimaux).
# gpg en échec = abandon (code 1, rien conservé). Clé absente ou illisible : copie EN CLAIR, avertissement et code 2 (alerte
# OnFailure) ; --sans-chiffrement la demande explicitement (transfert d'instance, tests) : avertissement, code 0.
# --verifier sur une copie chiffrée contrôle copie.tar.gpg.sha256 ; avec --dechiffrer (clé privée dans le trousseau gpg),
# il déchiffre vers un dossier temporaire du cache (0700, supprimé) et contrôle EMPREINTES.sha256.
# Code de sortie : 0 = tout va bien ; 1 = échec (élément manquant, empreinte différente, gpg, etc.) ; 2 = mauvais usage,
# dump plus ancien que le dernier (illisible) ou copie non chiffrée faute de clé.
set -uo pipefail
umask 077

RACINE_DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${RACINE_DEPOT}"
DESTINATION=""; INSTANCES="atelier"; GARDER=14
ESSAI=0; MEME_DISQUE=0; VERIFIER=""; DECHIFFRER=0; SANS_CHIFFREMENT=0
CLE="${ATELIER_SAUVEGARDE_CLE:-${HOME}/.config/atelier-sauvegarde/destinataire.asc}"
EMPREINTE_ATTENDUE="${ATELIER_SAUVEGARDE_EMPREINTE:-FBA1811755A20A834C2DC0107017DCB221AA1441}"
PREPARATION="${XDG_CACHE_HOME:-${HOME}/.cache}/atelier-sauvegarde"
PHOENIX="${HOME}/.local/share/atelier-phoenix/donnees"
PAGES="${HOME}/.local/share/atelier/pages/pages.sqlite"
CONTENEURS="atelier-emailing-db:listmonk,atelier-umami-db:umami"
MANUEL=0

echec() { echo "ERREUR : $*" >&2; exit 1; }
usage() { echo "ERREUR : $*" >&2; sed -n '7,10p' "${BASH_SOURCE[0]}" | sed 's/^# //' >&2; exit 2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --essai) ESSAI=1 ;;
    --meme-disque) MEME_DISQUE=1 ;;
    --garder) [[ $# -ge 2 ]] || usage "--garder demande un nombre"; GARDER="$2"; shift ;;
    --instances) [[ $# -ge 2 ]] || usage "--instances demande une liste"; INSTANCES="$2"; shift ;;
    --source) [[ $# -ge 2 ]] || usage "--source demande un dossier"; SOURCE="$2"; shift ;;
    --phoenix) [[ $# -ge 2 ]] || usage "--phoenix demande un dossier"; PHOENIX="$2"; shift ;;
    --pages) [[ $# -ge 2 ]] || usage "--pages demande un fichier"; PAGES="$2"; shift ;;
    --conteneurs) [[ $# -ge 2 ]] || usage "--conteneurs demande une liste (vide permise)"; CONTENEURS="$2"; shift ;;
    --manuel) MANUEL=1 ;;
    --dechiffrer) DECHIFFRER=1 ;;
    --sans-chiffrement) SANS_CHIFFREMENT=1 ;;
    --verifier) [[ $# -ge 2 ]] || usage "--verifier demande un dossier"; VERIFIER="$2"; shift ;;
    -h|--aide) sed -n '2,34p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) usage "Argument inconnu : $1" ;;
    *) [[ -z "${DESTINATION}" ]] || usage "Une seule destination attendue"; DESTINATION="$1" ;;
  esac
  shift
done

[[ "${GARDER}" =~ ^[1-9][0-9]*$ ]] || usage "--garder doit être un entier >= 1 (reçu : ${GARDER})"
[[ "${EMPREINTE_ATTENDUE}" =~ ^[0-9A-F]{40}$ ]] || usage "ATELIER_SAUVEGARDE_EMPREINTE doit être une empreinte de 40 caractères hexadécimaux majuscules"

# Dossier de préparation du clair (M-2), sur le disque système où les originaux sont déjà en clair. Les restes d'une exécution
# tuée (SIGKILL, coupure) vieux de plus de 6 h sont supprimés : 350 Mo de secrets en clair ne doivent pas s'accumuler.
preparer_cache() {
  mkdir -p -m 0700 -- "${PREPARATION}" && chmod 0700 -- "${PREPARATION}" || echec "dossier de préparation impossible : ${PREPARATION}"
  find "${PREPARATION}" -mindepth 1 -maxdepth 1 -type d \( -name '.atelier-*.en-cours' -o -name '.manuel-*.en-cours' -o -name '.dechiffre-*' \) \
    -mmin +360 -exec rm -rf -- {} + 2>/dev/null
  return 0
}

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
  if [[ -f "${VERIFIER}/copie.tar.gpg" ]]; then
    ( cd "${VERIFIER}" && sha256sum -c --quiet copie.tar.gpg.sha256 ) >/dev/null 2>&1 \
      || echec "empreinte différente ou fichier manquant : copie.tar.gpg de ${VERIFIER}"
    if [[ "${DECHIFFRER}" -eq 1 ]]; then
      preparer_cache
      CLAIR="$(mktemp -d -p "${PREPARATION}" .dechiffre-XXXXXX)" || echec "dossier temporaire impossible dans ${PREPARATION}"
      trap 'rm -rf -- "${CLAIR}"' EXIT
      gpg --batch --quiet --decrypt "${VERIFIER}/copie.tar.gpg" | tar -x -C "${CLAIR}" \
        || echec "déchiffrement impossible (clé privée absente du trousseau gpg ?)"
      verifier_copie "${CLAIR}" || exit 1
      echo "Copie chiffrée ${VERIFIER} : déchiffrée, toutes les empreintes correspondent."
    else
      echo "Copie chiffrée ${VERIFIER} : empreinte de copie.tar.gpg correcte (--dechiffrer pour contrôler le contenu)."
    fi
    exit 0
  fi
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
ELEMENTS=(); MANQUANTS=(); DUMPS_PERIMES=()
exiger() { [[ -e "${SOURCE}/$1" ]] && ELEMENTS+=("$1") || MANQUANTS+=("$1"); }

IFS=',' read -r -a LISTE_INSTANCES <<< "${INSTANCES}"
for id in "${LISTE_INSTANCES[@]}"; do
  [[ -n "${id}" ]] || continue
  base="instance/instances/${id}"
  # Dump le plus récent par date de modification (le tri par nom met « paperclip-transfert-… » après
  # « paperclip-2026… »), en ignorant ceux modifiés il y a moins de 60 s : Paperclip écrit le .sql.gz
  # sous son nom final, sans fichier temporaire, donc un dump récent peut être en cours d'écriture.
  derniere=""; invalides=0
  if [[ -d "${SOURCE}/${base}/data/backups" ]]; then
    while IFS= read -r -d '' f; do
      [[ -n "${derniere}" ]] && break
      nom="${f##*/}"
      if gzip -t "${f}" 2>/dev/null; then
        derniere="${nom}"
      else
        invalides=$((invalides + 1)); echo "Dump ignoré (illisible ou incomplet) : ${id}/${nom}" >&2
      fi
    done < <(find "${SOURCE}/${base}/data/backups" -maxdepth 1 -name 'paperclip-*.sql.gz' -type f ! -newermt '60 seconds ago' -printf '%T@ %p\0' \
               | sort -z -rn | sed -z 's/^[0-9.]* //')
  fi
  if [[ -n "${derniere}" ]]; then
    echo "Dump retenu pour ${id} : ${derniere}"
    ELEMENTS+=("${base}/data/backups/${derniere}")
    # Tri du plus récent au plus ancien : tout dump invalide compté ici est plus récent que celui retenu.
    if [[ "${invalides}" -gt 0 ]]; then
      DUMPS_PERIMES+=("${id}")
      echo "ATTENTION : ${id} : ${invalides} dump(s) plus récent(s) illisible(s) ; copie faite avec ${derniere}, plus ancien." >&2
    fi
  elif [[ "${invalides}" -gt 0 ]]; then
    echo "ERREUR : aucun dump valide pour ${id} (${invalides} dump(s) illisible(s) ou incomplet(s)) dans ${base}/data/backups" >&2; exit 1
  else
    MANQUANTS+=("${base}/data/backups/paperclip-*.sql.gz (aucune sauvegarde de base)")
  fi
  exiger "${base}/secrets"
  [[ -f "${SOURCE}/${base}/secrets/master.key" ]] || MANQUANTS+=("${base}/secrets/master.key")
  exiger "${base}/companies"
  [[ -d "${SOURCE}/${base}/data/storage" ]] && ELEMENTS+=("${base}/data/storage")
  # Secrets de signature de l'instance (jetons des agents, actions d'outils) et sa configuration :
  # sans le .env, le docteur de Paperclip refuse de démarrer l'instance restaurée.
  [[ -f "${SOURCE}/${base}/.env" ]] && ELEMENTS+=("${base}/.env")
  [[ -f "${SOURCE}/${base}/config.json" ]] && ELEMENTS+=("${base}/config.json")
  for rel in skills projects data/run-logs; do
    [[ -d "${SOURCE}/${base}/${rel}" ]] && ELEMENTS+=("${base}/${rel}")
  done
done
for rel in instance/cles instance/secrets instance/passerelles instance/plugin-jb instance/demo-client passerelle/etat; do
  exiger "${rel}"
done
for rel in instance/claude-config instance/agents-atelier instance/atelier-client instance/atelier-demo; do
  if [[ -e "${SOURCE}/${rel}" ]]; then ELEMENTS+=("${rel}"); else echo "ATTENTION : ${rel} absent, non sauvegardé." >&2; fi
done
IFS=',' read -r -a LISTE_CONTENEURS <<< "${CONTENEURS}"
for cb in "${LISTE_CONTENEURS[@]}"; do
  [[ -z "${cb}" || "${cb}" =~ ^[A-Za-z0-9_.-]+:[A-Za-z0-9_]+$ ]] || usage "--conteneurs : forme conteneur:base attendue (reçu : ${cb})"
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
NOM="atelier-${HORODATAGE}"; [[ "${MANUEL}" -eq 1 ]] && NOM="manuel-${HORODATAGE}"
FINAL="${DESTINATION}/${NOM}"
TEMP="${DESTINATION}/.${NOM}.en-cours"
TEMP_CHIFFRE="${DESTINATION}/.${NOM}.chiffre"

if [[ "${ESSAI}" -eq 1 ]]; then
  echo "ESSAI (rien n'est copié). Source : ${SOURCE} (disque ${DISQUE_SRC}) ; destination : ${FINAL} (disque ${DISQUE_DST})"
  for rel in "${ELEMENTS[@]}"; do printf '  %8s  %s\n' "$(taille_de "${rel}")" "${rel}"; done
  if [[ -f "${PHOENIX}/phoenix.db" ]]; then
    printf '  %8s  %s\n' "$(du -sh -- "${PHOENIX}/phoenix.db" | cut -f1)" "phoenix/phoenix.db (copie SQLite cohérente de ${PHOENIX})"
  else
    echo "  Phoenix : ${PHOENIX}/phoenix.db absent, ignoré."
  fi
  [[ -f "${PAGES}" ]] && printf '  %8s  %s\n' "$(du -sh -- "${PAGES}" | cut -f1)" "pages/pages.sqlite (copie SQLite cohérente de ${PAGES})"
  for cb in "${LISTE_CONTENEURS[@]}"; do [[ -n "${cb}" ]] && echo "  conteneurs/${cb#*:}.dump (pg_dump -Fc dans ${cb%%:*})"; done
  TOTAL="$(cd "${SOURCE}" && du -shc -- "${ELEMENTS[@]}" 2>/dev/null | tail -n 1 | cut -f1)"
  echo "Total à copier : ${TOTAL} ; rotation : garder ${GARDER} copie(s)."
  df -h --output=avail -- "${DESTINATION}" | tail -n 1 | sed 's/^ */Espace libre sur la destination : /'
  exit 0
fi

[[ ! -e "${FINAL}" ]] || echo "ERREUR : la copie ${FINAL} existe déjà (attendre la minute suivante)" >&2
[[ ! -e "${FINAL}" ]] || exit 1

# Chiffrement (AFD-M4), décidé AVANT de créer le moindre dossier : le clair n'ira sur la destination que si la copie reste en clair.
NON_CHIFFREE=0; CHIFFRE=0; SUFFIXE_CHIFFRE=""
if [[ "${SANS_CHIFFREMENT}" -eq 1 ]]; then
  echo "ATTENTION : copie NON chiffrée (--sans-chiffrement demandé)" >&2
elif [[ -f "${CLE}" && -r "${CLE}" && -s "${CLE}" ]]; then
  CHIFFRE=1
else
  echo "ATTENTION : copie NON chiffrée (clé publique absente : ${CLE})" >&2; NON_CHIFFREE=1
fi
if [[ "${CHIFFRE}" -eq 1 ]]; then
  command -v gpg >/dev/null 2>&1 || echec "gpg absent, chiffrement impossible (copie abandonnée, rien conservé)"
  # B-8 : une seule clé dans le fichier (--recipient-file chiffre pour toutes) et c'est celle dont l'empreinte est épinglée.
  CLE_COLONNES="$(gpg --batch --no-tty --show-keys --with-colons "${CLE}" 2>/dev/null)"
  if [[ "$(grep -c '^pub:' <<<"${CLE_COLONNES}")" -ne 1 \
        || "$(awk -F: '$1=="fpr"{print toupper($10); exit}' <<<"${CLE_COLONNES}")" != "${EMPREINTE_ATTENDUE}" ]]; then
    echec "clé de chiffrement inattendue dans ${CLE} (empreinte attendue : ${EMPREINTE_ATTENDUE}) : copie abandonnée, rien conservé"
  fi
  preparer_cache
  TEMP="${PREPARATION}/.${NOM}.en-cours"   # le clair reste hors de la destination (M-2)
fi
TEMP_CLAIR="${TEMP}"

rm -rf -- "${TEMP}" "${TEMP_CHIFFRE}" 2>/dev/null   # reste d'une exécution interrompue, créé par ce script
DEBUT="${SECONDS}"
mkdir -m 0700 -- "${TEMP}" || echo "ERREUR : création de ${TEMP} impossible" >&2
[[ -d "${TEMP}" ]] || exit 1
trap 'rm -rf -- "${TEMP_CLAIR}" "${TEMP_CHIFFRE}"' EXIT   # jamais de clair laissé derrière soi (cache ou destination)
trap 'exit 130' INT TERM
abandon() { rm -rf -- "${TEMP_CLAIR}" "${TEMP_CHIFFRE}"; echo "ERREUR : $* (copie abandonnée, rien conservé)" >&2; exit 1; }

for rel in "${ELEMENTS[@]}"; do
  # -R : reproduit le chemin relatif ; -L seulement pour demo-client (lien suivi).
  opts=(-aR); [[ "${rel}" == "instance/demo-client" ]] && opts=(-aRL)
  if ! (cd "${SOURCE}" && rsync "${opts[@]}" -- "./${rel}" "${TEMP}/") ; then
    abandon "rsync a échoué pour ${rel}"
  fi
done

# Copie cohérente d'une base SQLite en mode WAL, sans arrêter le service (API de sauvegarde SQLite), vers un fichier
# temporaire dans la copie en cours : jamais de copie à moitié écrite dans la destination. copie_sqlite <base> <dossier> <nom>
copie_sqlite() {
  local src="$1" dossier="${TEMP}/$2" tmp="${TEMP}/$2/.$3.en-cours"
  mkdir -p -m 0700 -- "${dossier}" || abandon "création de ${dossier} impossible"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 -cmd '.timeout 30000' "file:${src}?mode=ro" ".backup '${tmp}'" \
      || abandon "sauvegarde SQLite de ${src} impossible (sqlite3)"
  else
    python3 -I -c 'import sqlite3, sys
src = sqlite3.connect("file:" + sys.argv[1] + "?mode=ro", uri=True, timeout=30)
dst = sqlite3.connect(sys.argv[2])
with dst:
    src.backup(dst)
dst.close(); src.close()' "${src}" "${tmp}" \
      || abandon "sauvegarde SQLite de ${src} impossible (python3)"
  fi
  [[ "$(sqlite3 "${tmp}" 'PRAGMA integrity_check' 2>/dev/null || echo ok)" == "ok" ]] \
    || abandon "la copie de ${src} est corrompue"
  mv -- "${tmp}" "${dossier}/$3" || abandon "renommage de la copie de ${src} impossible"
  chmod 600 "${dossier}/$3"
}

if [[ -f "${PHOENIX}/phoenix.db" ]]; then
  copie_sqlite "${PHOENIX}/phoenix.db" phoenix phoenix.db
  echo "Phoenix : base copiée (${PHOENIX}/phoenix.db)."
else
  echo "Phoenix : ${PHOENIX}/phoenix.db absent, données Phoenix non sauvegardées (la sauvegarde continue)." >&2
fi
if [[ -f "${PAGES}" ]]; then
  copie_sqlite "${PAGES}" pages pages.sqlite
  echo "Pages : base copiée (${PAGES})."
else
  echo "ATTENTION : ${PAGES} absent, preuves de consentement des pages non sauvegardées." >&2
fi
# Bases Postgres des conteneurs : dump logique pris dans le conteneur en marche (cohérent, sans arrêt).
for cb in "${LISTE_CONTENEURS[@]}"; do
  [[ -n "${cb}" ]] || continue
  conteneur="${cb%%:*}"; base_pg="${cb#*:}"
  if [[ "$(podman container inspect -f '{{.State.Running}}' "${conteneur}" 2>/dev/null)" != "true" ]]; then
    echo "ATTENTION : conteneur ${conteneur} arrêté ou absent, base ${base_pg} non sauvegardée." >&2
    continue
  fi
  mkdir -p -m 0700 -- "${TEMP}/conteneurs" || abandon "création de ${TEMP}/conteneurs impossible"
  podman exec "${conteneur}" pg_dump -U "${base_pg}" -Fc "${base_pg}" > "${TEMP}/conteneurs/.${base_pg}.en-cours" \
    || abandon "pg_dump de ${base_pg} dans ${conteneur} impossible"
  [[ -s "${TEMP}/conteneurs/.${base_pg}.en-cours" ]] || abandon "dump vide pour ${base_pg}"
  mv -- "${TEMP}/conteneurs/.${base_pg}.en-cours" "${TEMP}/conteneurs/${base_pg}.dump" || abandon "renommage du dump ${base_pg} impossible"
  chmod 600 "${TEMP}/conteneurs/${base_pg}.dump"
  echo "Conteneur ${conteneur} : base ${base_pg} copiée."
done

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

# Chiffrement : tar direct dans gpg (clé publique seule), puis le clair est supprimé de la préparation. Seul le chiffré
# est écrit sur la destination.
if [[ "${CHIFFRE}" -eq 1 ]]; then
  mkdir -m 0700 -- "${TEMP_CHIFFRE}" || abandon "création de ${TEMP_CHIFFRE} impossible"
  tar -C "${TEMP}" -cf - . | gpg --batch --yes --quiet --no-tty --trust-model always --encrypt \
      --recipient-file "${CLE}" --output "${TEMP_CHIFFRE}/copie.tar.gpg" \
    || abandon "chiffrement gpg impossible (clé : ${CLE})"
  [[ -s "${TEMP_CHIFFRE}/copie.tar.gpg" ]] || abandon "copie chiffrée vide"
  ( cd "${TEMP_CHIFFRE}" && sha256sum copie.tar.gpg > copie.tar.gpg.sha256 && sha256sum -c --quiet copie.tar.gpg.sha256 ) >/dev/null \
    || abandon "empreinte de la copie chiffrée impossible"
  cp -- "${TEMP}/EMPREINTES.sha256" "${TEMP_CHIFFRE}/EMPREINTES.sha256" || abandon "copie de EMPREINTES.sha256 impossible"
  chmod 600 "${TEMP_CHIFFRE}"/*
  rm -rf -- "${TEMP_CLAIR}"
  TEMP="${TEMP_CHIFFRE}"; SUFFIXE_CHIFFRE=", chiffrée gpg"
fi

mv -- "${TEMP}" "${FINAL}" || abandon "renommage final impossible"
chmod 0700 "${FINAL}"
echo "Copie terminée : ${FINAL} ($(du -sh -- "${FINAL}" | cut -f1), ${NB} fichiers, empreintes vérifiées${SUFFIXE_CHIFFRE}, $((SECONDS - DEBUT)) s)."

# Rotation : seulement après une copie vérifiée, sur les dossiers de ce script (nom + EMPREINTES.sha256).
mapfile -t COPIES < <(find "${DESTINATION}" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended \
  -regex '.*/atelier-[0-9]{8}-[0-9]{4}' -printf '%f\n' | LC_ALL=C sort)
NB_COPIES=${#COPIES[@]}
if [[ "${NB_COPIES}" -gt "${GARDER}" ]]; then
  for ((i = 0; i < NB_COPIES - GARDER; i++)); do
    ancienne="${DESTINATION}/${COPIES[i]}"
    if [[ -f "${ancienne}/EMPREINTES.sha256" || -f "${ancienne}/copie.tar.gpg.sha256" ]]; then
      rm -rf -- "${ancienne}" && echo "Rotation : ${COPIES[i]} supprimée."
    else
      echo "Rotation : ${COPIES[i]} ignorée (pas de EMPREINTES.sha256, dossier non reconnu)." >&2
    fi
  done
fi
# Copie faite mais sur un dump plus ancien que le dernier : sortie non nulle pour que l'alerte (OnFailure) parte.
if [[ ${#DUMPS_PERIMES[@]} -gt 0 ]]; then
  echo "ERREUR : dernier dump illisible pour ${DUMPS_PERIMES[*]} : copie faite avec un dump plus ancien, à vérifier." >&2
  exit 2
fi
[[ "${NON_CHIFFREE}" -eq 0 ]] || exit 2   # alerte OnFailure : une copie non chiffrée ne passe jamais en silence
exit 0

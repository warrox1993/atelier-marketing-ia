#!/usr/bin/env bash
# Transfert de l'instance « atelier » de la tour vers un autre ordinateur (le portable de l'opérateur) par Tailscale,
# pour qu'un clone du dépôt démarre avec les mêmes données. S'appuie sur scripts/sauvegarde-hors-machine.sh
# (copie complète, empreintes sha256) : rien n'est réinventé, l'instance source n'est ni arrêtée ni modifiée.
#
# Usage :
#   scripts/transferer-instance.sh envoyer <hote-tailscale> [--chemin-distant DIR] [--instance ID] [--source <racine>]
#       Sur la tour. Fait un dump FRAIS de la base vivante (pg_dump en lecture, l'instance n'est ni arrêtée ni modifiée),
#       fabrique la copie vérifiée dans un brouillon, y ajoute config.json, config/atelier.env, le dump, les comptages,
#       l'empreinte de la machine (sha256 de /etc/machine-id) et instance/agents-atelier + instance/claude-config (secrets,
#       jamais affichés), puis l'envoie par « tailscale ssh <hote> » (tar | tar -x) et recontrôle les empreintes sur place.
#       DIR (défaut : atelier-transfert) est RELATIF au dossier personnel distant (créé en 700, même s'il existe déjà).
#   scripts/transferer-instance.sh recevoir <dossier-copie> [--instance ID] [--racine <clone>] [--remplacer] [--garder-copie]
#                                           [--port-http N] [--port-pg N]
#       Sur le portable, dans un clone. Vérifie la copie, refuse si elle vient de CETTE machine, restaure fichiers et base
#       (rejeu strict, comptages comparés à la source), réécrit les chemins du clone (config.json, atelier.env, fichiers et
#       base des agents), MET TOUS LES AGENTS EN PAUSE, puis SUPPRIME la copie reçue (elle contient master.key, .env, base,
#       clés) sauf avec --garder-copie ; en cas d'échec elle est conservée et son chemin est affiché.
#       Refuse d'écraser une instance existante sans --remplacer (l'ancienne est alors déplacée, jamais supprimée). Clés,
#       secrets, passerelles et agents déjà présents et différents sont gardés avec le suffixe .avant-transfert-<horodatage>.
#   scripts/transferer-instance.sh controler [--racine <clone>] [--port N]
#       Compte entreprises et agents par l'API d'une instance démarrée (à lancer après lancer-instance.sh).
# Après « recevoir » : scripts/preparer-socle.sh puis scripts/lancer-instance.sh, puis « controler », puis relancer les agents voulus.
# Tests seulement : --transport-test autorise ATELIER_TRANSFERT_COMMANDE (remplace « tailscale ssh <hote> », ex. « bash -c »)
# et ATELIER_MACHINE_ID_FICHIER (autre fichier que /etc/machine-id pour l'empreinte de machine).
# Non transféré : config/atelier-distant.env (propre à chaque machine) et les traces Phoenix.
# Code de sortie : 0 = succès ; 1 = échec ; 2 = mauvais usage.
set -uo pipefail
umask 077

RACINE_DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echec() { echo "ERREUR : $*" >&2; exit 1; }
usage() { echo "ERREUR : $*" >&2; sed -n '/^# Usage :/,/^# Après/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; exit 2; }
aide() { sed -n '2,/^# Code de sortie/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

# État partagé avec nettoyage_final (trap EXIT sans construction entre apostrophes).
BROUILLON=""; PG_TMP=""; PG_DEMARRE=0; BIN_PG=""; DEST_DB=""; COPIE_RECUE=""; RECEPTION_OK=0; GARDER_COPIE=0; TRANSPORT_TEST=0

nettoyage_final() {
  local code=$?
  case "${BROUILLON}" in */instance/transferts/brouillon-*) rm -rf -- "${BROUILLON}" ;; esac
  if [[ "${PG_DEMARRE}" -eq 1 ]]; then "${BIN_PG}/pg_ctl" -D "${DEST_DB}" -m fast -w stop >/dev/null 2>&1; fi
  case "${PG_TMP}" in "${TMPDIR:-/tmp}"/transfert-pg-*) rm -rf -- "${PG_TMP}" ;; esac
  if [[ -n "${COPIE_RECUE}" ]]; then
    if [[ "${RECEPTION_OK}" -eq 1 && "${GARDER_COPIE}" -eq 0 ]]; then
      if [[ -f "${COPIE_RECUE}/EMPREINTES.sha256" && -f "${COPIE_RECUE}/COMPLEMENT.sha256" ]]; then
        rm -rf -- "${COPIE_RECUE}" && echo "Copie reçue supprimée (elle contenait des secrets) : ${COPIE_RECUE}"
      fi
    elif [[ "${RECEPTION_OK}" -eq 1 ]]; then
      echo "Copie reçue CONSERVÉE (--garder-copie) : ${COPIE_RECUE}. Elle contient des secrets (master.key, .env, base, clés) : la supprimer dès qu'elle ne sert plus." >&2
    else
      echo "La copie reçue est CONSERVÉE : ${COPIE_RECUE}. Elle contient des secrets (master.key, .env, base de données, clés) : la supprimer à la main dès que le problème est réglé." >&2
    fi
  fi
  exit "${code}"
}
trap nettoyage_final EXIT

# Empreinte de la machine : sha256 de /etc/machine-id (jamais l'identifiant lui-même).
empreinte_machine() {
  local f="/etc/machine-id"
  [[ -n "${ATELIER_MACHINE_ID_FICHIER:-}" ]] && f="${ATELIER_MACHINE_ID_FICHIER}"
  [[ -r "${f}" && -s "${f}" ]] || return 1
  sha256sum < "${f}" | cut -d' ' -f1
}

[[ $# -ge 1 ]] || usage "sous-commande manquante (envoyer, recevoir ou controler)"
SOUS_COMMANDE="$1"; shift
case "${SOUS_COMMANDE}" in
  -h|--aide) aide; exit 0 ;;
  envoyer|recevoir|controler) ;;
  *) usage "sous-commande inconnue : ${SOUS_COMMANDE}" ;;
esac

# Valeurs communes aux sous-commandes.
INSTANCE="atelier"; CHEMIN_DISTANT="atelier-transfert"; SOURCE="${RACINE_DEPOT}"
CIBLE="${RACINE_DEPOT}"; RACINE_EXPLICITE=0; REMPLACER=0; PORT_HTTP=""; PORT_PG=""; ARGUMENT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance) [[ $# -ge 2 ]] || usage "--instance demande un identifiant"; INSTANCE="$2"; shift ;;
    --chemin-distant) [[ $# -ge 2 ]] || usage "--chemin-distant demande un dossier"; CHEMIN_DISTANT="$2"; shift ;;
    --source) [[ $# -ge 2 ]] || usage "--source demande un dossier"; SOURCE="$2"; shift ;;
    --racine) [[ $# -ge 2 ]] || usage "--racine demande un dossier"; CIBLE="$2"; RACINE_EXPLICITE=1; shift ;;
    --remplacer) REMPLACER=1 ;;
    --garder-copie) GARDER_COPIE=1 ;;
    --transport-test) TRANSPORT_TEST=1 ;;
    --port-http|--port) [[ $# -ge 2 ]] || usage "$1 demande un numéro de port"; PORT_HTTP="$2"; shift ;;
    --port-pg) [[ $# -ge 2 ]] || usage "--port-pg demande un numéro de port"; PORT_PG="$2"; shift ;;
    -h|--aide) aide; exit 0 ;;
    -*) usage "argument inconnu : $1" ;;
    *) [[ -z "${ARGUMENT}" ]] || usage "un seul argument positionnel attendu"; ARGUMENT="$1" ;;
  esac
  shift
done
[[ -z "${ATELIER_MACHINE_ID_FICHIER:-}" || "${TRANSPORT_TEST}" -eq 1 ]] || usage "ATELIER_MACHINE_ID_FICHIER n'est accepté qu'avec --transport-test (réservé aux tests)"
[[ "${INSTANCE}" =~ ^[a-z0-9][a-z0-9-]*$ ]] || usage "identifiant d'instance invalide : ${INSTANCE}"
for p in "${PORT_HTTP}" "${PORT_PG}"; do
  [[ -z "${p}" || "${p}" =~ ^[1-9][0-9]{1,4}$ ]] || usage "numéro de port invalide : ${p}"
done

# --------------------------------------------------------------------------------------------------
# envoyer
# --------------------------------------------------------------------------------------------------
envoyer() {
  local hote="${ARGUMENT}"
  [[ -n "${hote}" ]] || usage "hôte Tailscale manquant"
  [[ "${hote}" =~ ^[A-Za-z0-9._-]+$ ]] || usage "nom d'hôte invalide : ${hote}"
  [[ "${CHEMIN_DISTANT}" =~ ^[A-Za-z0-9._/-]+$ && "${CHEMIN_DISTANT}" != *..* ]] \
    || usage "--chemin-distant : caractères permis A-Z a-z 0-9 . _ / - , sans « .. »"
  [[ "${CHEMIN_DISTANT}" != /* ]] || usage "--chemin-distant : chemin relatif au dossier personnel distant (un chemin absolu est refusé)"
  local base="${SOURCE}/instance/instances/${INSTANCE}"
  [[ -f "${base}/config.json" ]] || echec "instance introuvable (config.json absent) : ${base}"
  [[ -x "${RACINE_DEPOT}/scripts/sauvegarde-hors-machine.sh" ]] || echec "scripts/sauvegarde-hors-machine.sh introuvable"
  local outil
  for outil in pg_dump psql gzip rsync sha256sum python3 tar; do
    command -v "${outil}" >/dev/null 2>&1 || echec "outil requis absent : ${outil}$([[ "${outil}" == pg_dump || "${outil}" == psql ]] && echo ' (apt install postgresql-client)')"
  done
  local empreinte_machine_locale
  empreinte_machine_locale="$(empreinte_machine)" || echec "empreinte de la machine impossible (/etc/machine-id illisible)"

  local transport=()
  if [[ -n "${ATELIER_TRANSFERT_COMMANDE:-}" ]]; then
    [[ "${TRANSPORT_TEST}" -eq 1 ]] || usage "ATELIER_TRANSFERT_COMMANDE n'est accepté qu'avec --transport-test (réservé aux tests)"
    read -r -a transport <<< "${ATELIER_TRANSFERT_COMMANDE}"
  else
    command -v tailscale >/dev/null 2>&1 || echec "tailscale introuvable"
    transport=(tailscale ssh "${hote}")
  fi

  mkdir -p -m 700 -- "${SOURCE}/instance/transferts" || echec "création de ${SOURCE}/instance/transferts impossible"
  BROUILLON="$(mktemp -d "${SOURCE}/instance/transferts/brouillon-XXXXXX")" || echec "brouillon impossible"
  local brouillon="${BROUILLON}"   # supprimé par nettoyage_final (trap EXIT)

  echo "== 1. Copie vérifiée (sauvegarde-hors-machine.sh)"
  # Les traces Phoenix ne sont pas transférées (--phoenix vers un dossier inexistant).
  "${RACINE_DEPOT}/scripts/sauvegarde-hors-machine.sh" "${brouillon}" --source "${SOURCE}" \
    --instances "${INSTANCE}" --garder 1 --meme-disque --phoenix "${brouillon}/sans-phoenix" 2>&1 | grep -v 'Phoenix' ; [[ "${PIPESTATUS[0]}" -eq 0 ]] || echec "la sauvegarde hors machine a échoué"
  local copie nom
  copie="$(find "${brouillon}" -mindepth 1 -maxdepth 1 -type d -name 'atelier-*' | head -n 1)"
  [[ -n "${copie}" ]] || echec "copie introuvable dans le brouillon"
  nom="$(basename "${copie}")"

  echo "== 2. Complément (réglages, dump frais de la base, agents ; contenu des secrets jamais affiché)"
  mkdir -m 700 -- "${copie}/complement" || echec "création du dossier complement impossible"
  /usr/bin/cp -f -- "${base}/config.json" "${copie}/complement/config.json" || echec "copie de config.json impossible"
  if [[ -f "${SOURCE}/config/atelier.env" ]]; then
    /usr/bin/cp -f -- "${SOURCE}/config/atelier.env" "${copie}/complement/atelier.env" || echec "copie de atelier.env impossible"
  else
    echo "Avertissement : ${SOURCE}/config/atelier.env absent, non transféré." >&2
  fi
  # Le .env de l'instance est déjà dans la sauvegarde hors machine (depuis 2d9d818) : il n'est pas copié une seconde fois.
  [[ -f "${base}/.env" ]] || echo "Avertissement : ${base}/.env absent, la copie n'en contiendra pas." >&2
  printf '%s\n' "${SOURCE}" > "${copie}/complement/RACINE_SOURCE"
  printf '%s\n' "${empreinte_machine_locale}" > "${copie}/complement/MACHINE_SOURCE"

  # Dump FRAIS de la base vivante (lecture seule, comme restaurer-element.sh), à la place de la dernière sauvegarde horaire.
  local port_pg_vivant
  port_pg_vivant="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["database"].get("embeddedPostgresPort", 54329))' "${base}/config.json")" \
    || echec "config.json illisible"
  local vivant=(psql -X -q -h 127.0.0.1 -p "${port_pg_vivant}" -U paperclip -d paperclip)
  PGPASSWORD="paperclip" "${vivant[@]}" -Atc 'SELECT 1' >/dev/null 2>&1 \
    || echec "base vivante inaccessible sur le port ${port_pg_vivant} (l'instance est-elle démarrée ?) : le transfert exige un dump frais"
  local table comptage
  : > "${copie}/complement/COMPTAGES"
  for table in companies agents; do
    comptage="$(PGPASSWORD="paperclip" "${vivant[@]}" -Atc "SELECT count(*) FROM public.${table}")" || echec "comptage de ${table} impossible"
    printf '%s=%s\n' "${table}" "${comptage}" >> "${copie}/complement/COMPTAGES"
  done
  PGPASSWORD="paperclip" pg_dump -h 127.0.0.1 -p "${port_pg_vivant}" -U paperclip -d paperclip --no-owner 2>"${brouillon}/pgdump.log" \
    | gzip > "${copie}/complement/base-fraiche.sql.gz"
  local etats_dump=("${PIPESTATUS[@]}")
  if [[ "${etats_dump[0]}" -ne 0 || "${etats_dump[1]}" -ne 0 ]]; then
    tail -n 5 "${brouillon}/pgdump.log" >&2
    echec "pg_dump de la base vivante a échoué"
  fi
  echo "Dump frais de la base vivante (port ${port_pg_vivant}) : $(tr '\n' ' ' < "${copie}/complement/COMPTAGES")"

  # Espaces de travail et configurations des agents (chemins absolus réécrits à la réception).
  local d
  for d in agents-atelier claude-config; do
    if [[ -d "${SOURCE}/instance/${d}" ]]; then
      rsync -a --no-specials --no-devices -- "${SOURCE}/instance/${d}/" "${copie}/complement/${d}/" || echec "copie de instance/${d} impossible"
    else
      echo "Avertissement : ${SOURCE}/instance/${d} absent, non transféré." >&2
    fi
  done
  find "${copie}/complement" -type d -exec chmod 700 {} + && find "${copie}/complement" -type f -exec chmod 600 {} + \
    || echec "droits du complément impossibles"
  ( cd "${copie}" && find complement -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > COMPLEMENT.sha256 ) \
    || echec "empreintes du complément impossibles"
  chmod 600 "${copie}/COMPLEMENT.sha256"
  "${RACINE_DEPOT}/scripts/sauvegarde-hors-machine.sh" --verifier "${copie}" || echec "vérification locale en échec"
  ( cd "${copie}" && sha256sum -c --quiet COMPLEMENT.sha256 ) || echec "empreintes du complément incorrectes"

  echo "== 3. Envoi vers ${hote}:${CHEMIN_DISTANT}/${nom} (tar | ssh tar -x)"
  local q_dossier; q_dossier="$(printf '%q' "${CHEMIN_DISTANT}")"
  tar -C "${brouillon}" -cf - "${nom}" | "${transport[@]}" "umask 077; mkdir -p ${q_dossier} && chmod 700 ${q_dossier} && tar -x -C ${q_dossier} -f -"
  local etats=("${PIPESTATUS[@]}")
  [[ "${etats[0]}" -eq 0 && "${etats[1]}" -eq 0 ]] || echec "l'envoi a échoué (tar local : ${etats[0]}, distant : ${etats[1]})"

  echo "== 4. Contrôle des empreintes sur la machine distante"
  "${transport[@]}" "cd ${q_dossier}/${nom} && sha256sum -c --quiet EMPREINTES.sha256 && sha256sum -c --quiet COMPLEMENT.sha256" \
    || echec "les empreintes ne correspondent pas côté distant : refaire l'envoi"
  echo "Copie reçue et vérifiée sur ${hote} : ${CHEMIN_DISTANT}/${nom}"
  echo "Suite, sur le portable, dans un clone du dépôt privé :"
  echo "  scripts/transferer-instance.sh recevoir ${CHEMIN_DISTANT}/${nom}"
  echo "  scripts/preparer-socle.sh && scripts/lancer-instance.sh"
  echo "  scripts/transferer-instance.sh controler"
}

# --------------------------------------------------------------------------------------------------
# contrôle par l'API (entreprises et agents)
# --------------------------------------------------------------------------------------------------
controler_api() {   # controler_api <port> ; affiche « N entreprise(s), M agent(s) » ; code 1 si l'API ne répond pas
  local port="$1" url="http://127.0.0.1:$1/api" entreprises ids id agents total=0
  command -v jq >/dev/null 2>&1 || { echo "ERREUR : jq requis pour le contrôle par l'API" >&2; return 1; }
  entreprises="$(curl -fsS -m 10 "${url}/companies" 2>/dev/null)" || return 1
  ids="$(jq -r '.[].id' <<<"${entreprises}" 2>/dev/null)" || return 1
  local n; n="$(jq 'length' <<<"${entreprises}")"
  for id in ${ids}; do
    agents="$(curl -fsS -m 20 "${url}/companies/${id}/agents" 2>/dev/null | jq 'length' 2>/dev/null)" || return 1
    total=$((total + agents))
  done
  echo "API (port ${port}) : ${n} entreprise(s), ${total} agent(s)."
}

controler() {
  local port="${PORT_HTTP}"
  if [[ -z "${port}" && -f "${CIBLE}/config/atelier.env" ]]; then
    port="$(grep -E '^PORT=' "${CIBLE}/config/atelier.env" | tail -n 1 | cut -d= -f2)"
  fi
  port="${port:-3100}"
  controler_api "${port}" || echec "l'API ne répond pas sur le port ${port} (lancer scripts/lancer-instance.sh d'abord)"
}

# --------------------------------------------------------------------------------------------------
# recevoir
# --------------------------------------------------------------------------------------------------
recevoir() {
  local copie="${ARGUMENT}"
  [[ -n "${copie}" ]] || usage "dossier de la copie manquant"
  [[ -d "${copie}" ]] || echec "dossier introuvable : ${copie}"
  copie="$(cd "${copie}" && pwd)"
  COPIE_RECUE="${copie}"   # supprimée en cas de succès (sauf --garder-copie), signalée en cas d'échec : voir nettoyage_final
  local racine="${CIBLE}"
  [[ -d "${racine}" ]] || echec "clone introuvable : ${racine}"
  racine="$(cd "${racine}" && pwd)"
  [[ -x "${racine}/scripts/sauvegarde-hors-machine.sh" ]] || echec "${racine} n'est pas un clone du dépôt (scripts/ absent)"
  for outil in rsync python3 psql gzip sha256sum ss; do
    command -v "${outil}" >/dev/null 2>&1 || echec "outil requis absent : ${outil}$([[ "${outil}" == psql ]] && echo ' (apt install postgresql-client)')"
  done

  echo "== 1. Vérification de la copie"
  "${racine}/scripts/sauvegarde-hors-machine.sh" --verifier "${copie}" || echec "la copie est incomplète ou altérée : refaire l'envoi"
  [[ -f "${copie}/COMPLEMENT.sha256" ]] || echec "COMPLEMENT.sha256 absent : copie non produite par « envoyer »"
  ( cd "${copie}" && sha256sum -c --quiet COMPLEMENT.sha256 ) || echec "empreintes du complément incorrectes"
  local base="instance/instances/${INSTANCE}" sauvegarde
  if [[ -f "${copie}/complement/base-fraiche.sql.gz" ]]; then
    sauvegarde="${copie}/complement/base-fraiche.sql.gz"
  else
    sauvegarde="$(find "${copie}/${base}/data/backups" -maxdepth 1 -name 'paperclip-*.sql.gz' 2>/dev/null | LC_ALL=C sort | tail -n 1)"
    echo "Avertissement : pas de dump frais dans la copie, repli sur la dernière sauvegarde horaire." >&2
  fi
  [[ -n "${sauvegarde}" ]] || echec "aucune sauvegarde de base pour l'instance ${INSTANCE} dans la copie"
  local source_racine; source_racine="$(head -n 1 "${copie}/complement/RACINE_SOURCE" 2>/dev/null)"
  [[ -n "${source_racine}" ]] || echec "complement/RACINE_SOURCE absent ou vide"
  # Empreinte de la machine d'origine (sha256 de /etc/machine-id) : « recevoir » se lance sur l'AUTRE machine.
  local machine_source machine_ici
  machine_source="$(head -n 1 "${copie}/complement/MACHINE_SOURCE" 2>/dev/null)"
  [[ -n "${machine_source}" ]] || echec "complement/MACHINE_SOURCE absent ou vide : copie non produite par cette version de « envoyer »"
  machine_ici="$(empreinte_machine)" || echec "empreinte de cette machine impossible (/etc/machine-id illisible)"
  if [[ "${machine_source}" == "${machine_ici}" ]]; then
    echec "la copie vient de CETTE machine (même /etc/machine-id) : « recevoir » se lance sur l'autre machine"
  fi
  # Les chemins sont réécrits dans la base et dans les fichiers : caractères sûrs seulement.
  [[ "${source_racine}" =~ ^[A-Za-z0-9._/@+-]+$ && "${racine}" =~ ^[A-Za-z0-9._/@+-]+$ ]] \
    || echec "chemin de la source ou du clone avec des caractères inattendus : réécriture des chemins refusée"

  # Ports : valeurs de la source, sauf demande contraire.
  local port_http_src port_pg_src
  port_http_src="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["server"]["port"])' "${copie}/complement/config.json")" \
    || echec "config.json de la copie illisible"
  port_pg_src="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["database"].get("embeddedPostgresPort", 54329))' "${copie}/complement/config.json")" \
    || echec "config.json de la copie illisible"
  local port_http="${PORT_HTTP:-${port_http_src}}" port_pg="${PORT_PG:-${port_pg_src}}"
  local p
  for p in "${port_http}" "${port_pg}"; do
    if ss -ltnH "sport = :${p}" 2>/dev/null | grep -q .; then echec "le port ${p} est déjà utilisé : arrêter l'instance qui l'occupe ou choisir --port-http / --port-pg"; fi
  done

  echo "== 2. Instance existante"
  local dest="${racine}/instance/instances/${INSTANCE}" horodatage; horodatage="$(date +%Y%m%d-%H%M%S)"
  DEST_DB="${dest}/db"
  if [[ -e "${dest}/config.json" || -e "${dest}/db/PG_VERSION" || -e "${dest}/companies" ]]; then
    [[ "${REMPLACER}" -eq 1 ]] || echec "une instance ${INSTANCE} existe déjà dans ${racine}/instance : relancer avec --remplacer (l'ancienne est déplacée, pas supprimée)"
    mv -- "${dest}" "${dest}.avant-transfert-${horodatage}" || echec "déplacement de l'ancienne instance impossible"
    echo "Ancienne instance déplacée : ${dest}.avant-transfert-${horodatage}"
  else
    echo "Aucune instance ${INSTANCE} en place."
  fi

  echo "== 3. Fichiers (secrets, entreprises, stockage, clés, passerelles, agents)"
  mkdir -p -m 700 -- "${racine}/instance" "${racine}/passerelle" "${racine}/config" || echec "création des dossiers impossible"
  # Clés, secrets et passerelles déjà présents : jamais écrasés sans copie (rsync --backup, suffixe daté).
  local suffixe=".avant-transfert-${horodatage}" d
  rsync -a --exclude 'data/backups/' --exclude 'demo-client.lien' --exclude '/cles/' --exclude '/secrets/' --exclude '/passerelles/' \
    -- "${copie}/instance/" "${racine}/instance/" || echec "rsync de instance/ a échoué"
  for d in cles secrets passerelles; do
    if [[ -d "${copie}/instance/${d}" ]]; then
      mkdir -p -m 700 -- "${racine}/instance/${d}" && rsync -a --backup --suffix="${suffixe}" -- "${copie}/instance/${d}/" "${racine}/instance/${d}/" \
        || echec "rsync de instance/${d} a échoué"
    fi
  done
  if [[ -d "${copie}/passerelle/etat" ]]; then
    mkdir -p -m 700 -- "${racine}/passerelle/etat" && rsync -a --backup --suffix="${suffixe}" -- "${copie}/passerelle/etat/" "${racine}/passerelle/etat/" \
      || echec "rsync de passerelle/etat a échoué"
  fi
  for d in agents-atelier claude-config; do
    if [[ -d "${copie}/complement/${d}" ]]; then
      mkdir -p -m 700 -- "${racine}/instance/${d}" && rsync -a --backup --suffix="${suffixe}" -- "${copie}/complement/${d}/" "${racine}/instance/${d}/" \
        || echec "rsync de ${d} a échoué"
    else
      echo "Avertissement : ${d} absent de la copie." >&2
    fi
  done
  local sauvegardes_gardees
  sauvegardes_gardees="$(find "${racine}/instance" "${racine}/passerelle" -name "*${suffixe}" 2>/dev/null | wc -l)"
  if [[ "${sauvegardes_gardees}" -gt 0 ]]; then
    echo "${sauvegardes_gardees} fichier(s) déjà présent(s) et différent(s) conservé(s) avec le suffixe ${suffixe}."
  fi
  # Chemins absolus de l'ancienne racine dans les fichiers texte des espaces et configurations des agents.
  python3 -I - "${source_racine}" "${racine}" "${racine}/instance/agents-atelier" "${racine}/instance/claude-config" <<'PY' \
    || echec "réécriture des chemins dans les fichiers des agents impossible"
import os, sys
ancienne, nouvelle, *dossiers = sys.argv[1:]
n = 0
for dossier in dossiers:
    for chemin, _, fichiers in os.walk(dossier):
        for nom in fichiers:
            if not nom.endswith((".json", ".mjs", ".md", ".sh", ".txt", ".toml", ".yaml", ".yml")):
                continue
            f = os.path.join(chemin, nom)
            try:
                if os.path.islink(f) or os.path.getsize(f) > 5_000_000:
                    continue
                t = open(f, encoding="utf-8").read()
            except (OSError, UnicodeDecodeError):
                continue
            if ancienne in t:
                st = os.stat(f)
                with open(f, "w", encoding="utf-8") as sortie:
                    sortie.write(t.replace(ancienne, nouvelle))
                os.chmod(f, st.st_mode & 0o7777)
                n += 1
print(f"Chemins réécrits dans {n} fichier(s) des agents.")
PY
  mkdir -p -m 700 -- "${dest}/data/backups" || echec "création de data/backups impossible"
  /usr/bin/cp -f -- "${sauvegarde}" "${dest}/data/backups/paperclip-transfert-${horodatage}.sql.gz" || echec "copie de la sauvegarde de base impossible"
  [[ -f "${dest}/secrets/master.key" ]] || echec "secrets/master.key absente après la restauration des fichiers"
  chmod 700 "${dest}/secrets"; chmod 600 "${dest}/secrets/master.key"
  if [[ -f "${dest}/.env" ]]; then
    chmod 600 "${dest}/.env"
  else
    echo "Avertissement : pas de .env d'instance dans la copie : Paperclip en générera un nouveau (signatures existantes invalidées)." >&2
  fi

  echo "== 4. Réglages adaptés au clone (config.json, config/atelier.env)"
  python3 -I - "${copie}/complement/config.json" "${dest}/config.json" "${source_racine}" "${racine}" "${port_http}" "${port_pg}" <<'PY' \
    || echec "réécriture de config.json impossible"
import json, os, sys
src, dst, ancienne, nouvelle, port_http, port_pg = sys.argv[1:7]
def remplacer(o):
    if isinstance(o, dict):
        return {k: remplacer(v) for k, v in o.items()}
    if isinstance(o, list):
        return [remplacer(v) for v in o]
    if isinstance(o, str):
        return o.replace(ancienne, nouvelle)
    return o
c = remplacer(json.load(open(src)))
c["server"]["port"] = int(port_http)
c["database"]["embeddedPostgresPort"] = int(port_pg)
fd = os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump(c, f, indent=2); f.write("\n")
PY
  if [[ -f "${copie}/complement/atelier.env" ]]; then
    if [[ -f "${racine}/config/atelier.env" ]] && ! cmp -s "${racine}/config/atelier.env" "${copie}/complement/atelier.env"; then
      /usr/bin/cp -f -- "${racine}/config/atelier.env" "${racine}/config/atelier.env.avant-transfert-${horodatage}"
      echo "config/atelier.env existant conservé : config/atelier.env.avant-transfert-${horodatage}"
    fi
    python3 -I - "${copie}/complement/atelier.env" "${racine}/config/atelier.env" "${source_racine}" "${racine}" "${port_http}" <<'PY' \
      || echec "réécriture de atelier.env impossible"
import os, re, sys
src, dst, ancienne, nouvelle, port = sys.argv[1:6]
lignes = open(src).read().replace(ancienne, nouvelle).splitlines()
lignes = [("PORT=" + port) if re.match(r"^PORT=", l) else l for l in lignes]
fd = os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    f.write("\n".join(lignes) + "\n")
PY
    echo "config/atelier.env écrit (PAPERCLIP_HOME et PORT adaptés, contenu non affiché)."
  else
    echo "Avertissement : pas de atelier.env dans la copie : copier config/atelier.env.example à la main." >&2
  fi

  echo "== 5. Base de données (PostgreSQL embarqué, port ${port_pg})"
  BIN_PG="${PG_BIN:-}"; local c
  if [[ -z "${BIN_PG}" ]]; then
    for c in "${racine}"/paperclip/node_modules/.pnpm/@embedded-postgres+linux-x64@*/node_modules/@embedded-postgres/linux-x64/native/bin /usr/lib/postgresql/*/bin; do
      if [[ -x "${c}/initdb" && -x "${c}/pg_ctl" ]]; then BIN_PG="${c}"; break; fi
    done
  fi
  [[ -n "${BIN_PG}" && -x "${BIN_PG}/initdb" ]] \
    || echec "initdb introuvable : lancer d'abord scripts/preparer-socle.sh (installe PostgreSQL embarqué) ou définir PG_BIN. Les fichiers sont déjà restaurés ; relancer avec --remplacer ensuite."
  PG_TMP="$(mktemp -d "${TMPDIR:-/tmp}/transfert-pg-XXXXXX")" || echec "dossier temporaire impossible"
  # Mêmes réglages que la bibliothèque embarquée de Paperclip (packages/db/src/migration-runtime.ts) : utilisateur
  # « paperclip », mot de passe fixe de la bibliothèque (base en boucle locale seulement), UTF8, locale C.
  printf '%s' "paperclip" > "${PG_TMP}/pw"
  "${BIN_PG}/initdb" -D "${dest}/db" -U paperclip --pwfile="${PG_TMP}/pw" --auth-local=password --auth-host=password \
    --encoding=UTF8 --locale=C --lc-messages=C > "${PG_TMP}/initdb.log" 2>&1 \
    || { tail -n 5 "${PG_TMP}/initdb.log" >&2; echec "initdb a échoué"; }
  rm -f -- "${PG_TMP}/pw"
  "${BIN_PG}/pg_ctl" -D "${dest}/db" -w -l "${PG_TMP}/serveur.log" \
    -o "-p ${port_pg} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${PG_TMP} -c fsync=off" start > /dev/null 2>&1 \
    || { tail -n 5 "${PG_TMP}/serveur.log" >&2; echec "démarrage de PostgreSQL impossible"; }
  PG_DEMARRE=1
  export PGPASSWORD="paperclip"
  local psql_pg=(psql -X -q -h 127.0.0.1 -p "${port_pg}" -U paperclip)
  "${psql_pg[@]}" -d postgres -c 'CREATE DATABASE paperclip' > /dev/null || echec "création de la base paperclip impossible"
  echo "Rejeu de $(basename "${sauvegarde}")…"
  # Rejeu strict : la première erreur arrête tout (une base à moitié restaurée serait pire qu'un échec net).
  gzip -dc -- "${sauvegarde}" | "${psql_pg[@]}" -d paperclip -v ON_ERROR_STOP=1 -f - > "${PG_TMP}/rejeu.log" 2>&1
  local etats_rejeu=("${PIPESTATUS[@]}")
  if [[ "${etats_rejeu[0]}" -ne 0 || "${etats_rejeu[1]}" -ne 0 ]]; then
    grep 'ERROR' "${PG_TMP}/rejeu.log" | head -n 5 >&2
    echec "le rejeu de la sauvegarde a échoué (première erreur ci-dessus) : instance NON restaurée, relancer avec --remplacer après correction"
  fi

  # Agents : chemins absolus (cwd, CLAUDE_CONFIG_DIR dans adapter_config) de l'ancienne racine vers la nouvelle, puis PAUSE de
  # tous les agents actifs (sinon ils se réveilleraient sur le portable pendant que la tour travaille sur les mêmes données).
  local resultat_agents
  resultat_agents="$("${psql_pg[@]}" -d paperclip -At -v ON_ERROR_STOP=1 -v "ancienne=${source_racine}" -v "nouvelle=${racine}" <<'SQL'
WITH r AS (
  UPDATE public.agents
     SET adapter_config = replace(adapter_config::text, :'ancienne', :'nouvelle')::jsonb
   WHERE position(:'ancienne' in adapter_config::text) > 0
  RETURNING 1)
SELECT count(*) FROM r;
WITH p AS (
  UPDATE public.agents
     SET status = 'paused', pause_reason = 'system', paused_at = now(), updated_at = now()
   WHERE status NOT IN ('paused', 'terminated', 'pending_approval')
  RETURNING 1)
SELECT count(*) FROM p;
SQL
  )" || echec "réécriture des chemins des agents ou mise en pause impossible"
  local nb_reecrits nb_pauses
  nb_reecrits="$(sed -n '1p' <<<"${resultat_agents}")"; nb_pauses="$(sed -n '2p' <<<"${resultat_agents}")"
  local nb_entreprises nb_agents nb_actifs
  nb_entreprises="$("${psql_pg[@]}" -d paperclip -Atc 'SELECT count(*) FROM public.companies' 2>/dev/null)"
  nb_agents="$("${psql_pg[@]}" -d paperclip -Atc 'SELECT count(*) FROM public.agents' 2>/dev/null)"
  nb_actifs="$("${psql_pg[@]}" -d paperclip -Atc "SELECT count(*) FROM public.agents WHERE status NOT IN ('paused', 'terminated', 'pending_approval')" 2>/dev/null)"
  if [[ -z "${nb_entreprises}" || -z "${nb_agents}" ]]; then
    echec "la base restaurée est illisible (tables absentes)"
  fi
  [[ "${nb_actifs}" == "0" ]] || echec "des agents restent actifs après la mise en pause (${nb_actifs}) : arrêt par sécurité"
  # Comptages comparés à ceux relevés sur la source au moment du dump.
  if [[ -f "${copie}/complement/COMPTAGES" ]]; then
    local attendu_e attendu_a
    attendu_e="$(sed -n 's/^companies=//p' "${copie}/complement/COMPTAGES")"; attendu_a="$(sed -n 's/^agents=//p' "${copie}/complement/COMPTAGES")"
    if [[ "${nb_entreprises}" != "${attendu_e}" || "${nb_agents}" != "${attendu_a}" ]]; then
      echec "comptages différents de la source : ${nb_entreprises} entreprise(s) et ${nb_agents} agent(s) restaurés, ${attendu_e} et ${attendu_a} attendus : refaire l'envoi"
    fi
  fi
  unset PGPASSWORD
  "${BIN_PG}/pg_ctl" -D "${dest}/db" -m fast -w stop > /dev/null 2>&1 || echec "arrêt de PostgreSQL impossible"
  PG_DEMARRE=0
  echo "Base restaurée (rejeu strict, sans erreur) : ${nb_entreprises} entreprise(s), ${nb_agents} agent(s), identiques à la source."
  echo "Agents : chemins réécrits pour ${nb_reecrits} agent(s) ; ${nb_pauses} agent(s) mis en PAUSE (aucun ne se réveillera tout seul)."
  RECEPTION_OK=1

  echo "== 6. Suite à faire"
  echo "  1. scripts/preparer-socle.sh        (construit le socle Paperclip, s'il ne l'est pas)"
  echo "  2. scripts/lancer-instance.sh       (démarre l'instance, qui applique les migrations en attente)"
  echo "  3. scripts/transferer-instance.sh controler    (compte entreprises et agents par l'API : attendu ${nb_entreprises} et ${nb_agents})"
  echo "  4. Relancer les agents voulus : bouton « Reprendre » de l'agent dans l'interface, ou"
  echo "     curl -X POST http://127.0.0.1:${port_http}/api/agents/<id-agent>/resume    (ne le faire que si la tour n'utilise plus les mêmes données)"
  if controler_api "${port_http}" 2>/dev/null; then
    echo "Une instance répond déjà sur le port ${port_http} : contrôle ci-dessus."
  else
    echo "Aucune instance ne répond sur le port ${port_http} pour l'instant (normal avant l'étape 2) ; contrôle par la base : OK."
  fi
  echo "Rappel : config/atelier-distant.env (accès à distance) n'est pas transféré ; le recréer sur ce poste si besoin."
}

case "${SOUS_COMMANDE}" in
  envoyer) envoyer ;;
  recevoir) recevoir ;;
  controler) controler ;;
esac

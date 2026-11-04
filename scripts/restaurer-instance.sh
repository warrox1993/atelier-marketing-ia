#!/usr/bin/env bash
# Restaure une instance complète depuis une copie de scripts/sauvegarde-hors-machine.sh (sinistre sur cette machine,
# ou répétition sur une arborescence d'essai avec --racine). Même rejeu strict que « transferer-instance.sh recevoir ».
#
# Usage : scripts/restaurer-instance.sh <copie> [--instance ID] [--racine <dossier>] [--port-pg N] [--confirmer]
#   <copie>       dossier atelier-AAAAMMJJ-HHMM ou manuel-AAAAMMJJ-HHMM produit par la sauvegarde hors machine (chiffrée : copie.tar.gpg, clé privée dans le trousseau gpg)
#   --instance    instance à restaurer (défaut : atelier)
#   --racine      arborescence à restaurer (défaut : ce dépôt ; un autre dossier pour une répétition)
#   --port-pg     port du PostgreSQL temporaire de la restauration (défaut : celui de config.json de la copie ;
#                 un autre port pour répéter pendant que l'instance réelle tourne ; config.json n'est pas modifié)
#   --confirmer   effectue la restauration ; sans lui : à blanc (copie vérifiée, rien n'est écrit)
#
# Déroulement : empreintes de la copie vérifiées ; refus si le port PostgreSQL est occupé (instance en marche) ;
# l'instance en place est DÉPLACÉE en <instance>.avant-restauration-<horodatage> (retour arrière, jamais supprimée) ;
# fichiers de l'instance remis ; dossiers partagés (clés, secrets, passerelles, plugin, mémoire des agents…) remis avec
# rsync --backup (un fichier différent déjà présent est gardé avec le suffixe .avant-restauration-<horodatage>) ;
# base recréée (initdb) et sauvegarde rejouée sans tolérer d'erreur ; agents actifs mis en PAUSE (sinon ils
# referaient au réveil des actions déjà faites après la sauvegarde, envois compris) ; PostgreSQL arrêté.
# Bases des conteneurs, pages et Phoenix : archives contrôlées, commandes de restauration affichées (services à part).
# Codes de sortie : 0 succès (ou à blanc réussi) ; 1 échec ; 2 mauvais usage.
set -uo pipefail
umask 077

RACINE_DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COPIE=""; INSTANCE="atelier"; CIBLE="${RACINE_DEPOT}"; PORT_PG=""; CONFIRMER=0
BIN_PG=""; PG_TMP=""; PG_DEMARRE=0; DEST_DB=""; CLAIR=""

echec() { echo "ERREUR : $*" >&2; exit 1; }
usage() { echo "ERREUR : $*" >&2; sed -n '5,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; exit 2; }
nettoyer() {
  [[ "${PG_DEMARRE}" -eq 1 ]] && "${BIN_PG}/pg_ctl" -D "${DEST_DB}" -m fast -w stop >/dev/null 2>&1
  [[ -n "${PG_TMP}" ]] && rm -rf -- "${PG_TMP}"
  [[ -n "${CLAIR}" ]] && rm -rf -- "${CLAIR}"
}
trap nettoyer EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance) [[ $# -ge 2 ]] || usage "--instance demande un identifiant"; INSTANCE="$2"; shift ;;
    --racine) [[ $# -ge 2 ]] || usage "--racine demande un dossier"; CIBLE="$2"; shift ;;
    --port-pg) [[ "${2:-}" =~ ^[0-9]+$ ]] || usage "--port-pg demande un numéro"; PORT_PG="$2"; shift ;;
    --confirmer) CONFIRMER=1 ;;
    -h|--aide) sed -n '2,/^set -uo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) usage "option inconnue : $1" ;;
    *) [[ -z "${COPIE}" ]] || usage "une seule copie attendue"; COPIE="$1" ;;
  esac
  shift
done
[[ -n "${COPIE}" ]] || usage "copie à restaurer absente"
[[ "${INSTANCE}" =~ ^[A-Za-z0-9_-]+$ ]] || usage "identifiant d'instance invalide : ${INSTANCE}"
[[ -d "${COPIE}" ]] || echec "copie introuvable : ${COPIE}"
COPIE="$(cd "${COPIE}" && pwd)"
mkdir -p -- "${CIBLE}" && CIBLE="$(cd "${CIBLE}" && pwd)" || echec "racine inutilisable : ${CIBLE}"
for outil in rsync psql gzip sha256sum ss python3; do command -v "${outil}" >/dev/null 2>&1 || echec "outil requis absent : ${outil}"; done

echo "== 1. Copie ${COPIE##*/}"
if [[ -f "${COPIE}/copie.tar.gpg" ]]; then
  # Copie chiffrée (AFD-M4) : empreinte du fichier chiffré, puis déchiffrement (clé privée du trousseau gpg) vers un
  # dossier temporaire en 0700 sous instance/ de la racine cible (même disque que la restauration), supprimé à la fin.
  "${RACINE_DEPOT}/scripts/sauvegarde-hors-machine.sh" --verifier "${COPIE}" || echec "copie chiffrée altérée (empreinte) : prendre une autre copie"
  command -v gpg >/dev/null 2>&1 || echec "outil requis absent : gpg"
  # Sous instance/ (ignoré par git partout), pas à la racine du dépôt : un « git add -A » ne peut pas l'embarquer (B-4).
  mkdir -p -m 0700 -- "${CIBLE}/instance" || echec "dossier ${CIBLE}/instance impossible"
  CLAIR="$(mktemp -d "${CIBLE}/instance/.restaurer-dechiffre-XXXXXX")" || echec "dossier temporaire impossible dans ${CIBLE}/instance"
  gpg --batch --quiet --decrypt "${COPIE}/copie.tar.gpg" | tar -x -C "${CLAIR}" \
    || echec "déchiffrement impossible (clé privée absente du trousseau gpg ?)"
  COPIE="${CLAIR}"
fi
"${RACINE_DEPOT}/scripts/sauvegarde-hors-machine.sh" --verifier "${COPIE}" || echec "copie incomplète ou altérée (empreintes) : prendre une autre copie"
SRC_INST="${COPIE}/instance/instances/${INSTANCE}"
[[ -f "${SRC_INST}/secrets/master.key" ]] || echec "secrets/master.key absente de la copie pour ${INSTANCE}"
[[ -f "${SRC_INST}/config.json" ]] || echec "config.json absent de la copie pour ${INSTANCE}"
DUMP="$(find "${SRC_INST}/data/backups" -maxdepth 1 -name 'paperclip-*.sql.gz' -type f 2>/dev/null | LC_ALL=C sort | tail -n 1)"
[[ -n "${DUMP}" ]] || echec "aucune sauvegarde de base dans la copie pour ${INSTANCE}"
gzip -t -- "${DUMP}" || echec "sauvegarde de base illisible : ${DUMP##*/}"
PORT_PG="${PORT_PG:-$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["database"].get("embeddedPostgresPort", 54329))' "${SRC_INST}/config.json")}" \
  || echec "config.json de la copie illisible"
echo "Base : ${DUMP##*/} ; PostgreSQL temporaire sur le port ${PORT_PG}."
if ss -ltnH "sport = :${PORT_PG}" 2>/dev/null | grep -q .; then
  echec "le port ${PORT_PG} est occupé : arrêter d'abord l'instance (systemctl --user stop atelier-instance@${INSTANCE}), ou --port-pg pour une répétition"
fi
PARTAGES=()
for rel in instance/cles instance/secrets instance/passerelles instance/plugin-jb instance/claude-config \
           instance/agents-atelier instance/atelier-client instance/atelier-demo passerelle/etat; do
  [[ -d "${COPIE}/${rel}" ]] && PARTAGES+=("${rel}")
done
echo "Dossiers partagés présents dans la copie : ${PARTAGES[*]:-aucun}"
ANNEXES=()
for f in "${COPIE}"/conteneurs/*.dump; do
  [[ -f "${f}" ]] || continue
  if command -v pg_restore >/dev/null 2>&1 && ! pg_restore --list -- "${f}" >/dev/null 2>&1; then echec "archive illisible : conteneurs/${f##*/}"; fi
  ANNEXES+=("conteneurs/${f##*/}")
done
[[ -f "${COPIE}/pages/pages.sqlite" ]] && ANNEXES+=("pages/pages.sqlite")
[[ -f "${COPIE}/phoenix/phoenix.db" ]] && ANNEXES+=("phoenix/phoenix.db")
echo "Bases annexes contrôlées : ${ANNEXES[*]:-aucune}"

DEST="${CIBLE}/instance/instances/${INSTANCE}"
if [[ "${CONFIRMER}" -ne 1 ]]; then
  echo "À BLANC : rien n'a été écrit. ${DEST} serait mis de côté puis restauré depuis la copie ; relancer avec --confirmer."
  exit 0
fi

for c in "${RACINE_DEPOT}"/paperclip/node_modules/.pnpm/@embedded-postgres+linux-x64@*/node_modules/@embedded-postgres/linux-x64/native/bin /usr/lib/postgresql/*/bin; do
  if [[ -x "${c}/initdb" && -x "${c}/pg_ctl" ]]; then BIN_PG="${c}"; break; fi
done
BIN_PG="${PG_BIN:-${BIN_PG}}"
[[ -n "${BIN_PG}" && -x "${BIN_PG}/initdb" ]] || echec "initdb introuvable : lancer scripts/preparer-socle.sh ou définir PG_BIN (rien n'a été modifié)"

echo "== 2. Instance en place"
HORODATAGE="$(date +%Y%m%d-%H%M%S)"; SUFFIXE=".avant-restauration-${HORODATAGE}"
if [[ -e "${DEST}" ]]; then
  mv -- "${DEST}" "${DEST}${SUFFIXE}" || echec "déplacement de l'instance en place impossible"
  echo "Instance en place mise de côté : ${DEST}${SUFFIXE} (retour arrière : la remettre à son nom, instance arrêtée)."
else
  echo "Aucune instance ${INSTANCE} en place."
fi

echo "== 3. Fichiers"
mkdir -p -- "${DEST}" && chmod 700 -- "${DEST}" || echec "création de ${DEST} impossible"
rsync -a -- "${SRC_INST}/" "${DEST}/" || echec "rsync de l'instance a échoué"
chmod 700 "${DEST}/secrets"; chmod 600 "${DEST}/secrets/master.key"; [[ -f "${DEST}/.env" ]] && chmod 600 "${DEST}/.env"
for rel in "${PARTAGES[@]}"; do
  mkdir -p -- "${CIBLE}/${rel}" && rsync -a --backup --suffix="${SUFFIXE}" -- "${COPIE}/${rel}/" "${CIBLE}/${rel}/" \
    || echec "rsync de ${rel} a échoué"
done
# demo-client est un lien : la copie porte son contenu (lien suivi) et sa cible dans demo-client.lien.
if [[ -f "${COPIE}/instance/demo-client.lien" ]]; then
  [[ -e "${CIBLE}/instance/demo-client" || -L "${CIBLE}/instance/demo-client" ]] \
    || ln -s -- "$(head -n 1 "${COPIE}/instance/demo-client.lien")" "${CIBLE}/instance/demo-client" || echec "lien demo-client impossible"
  if [[ ! -d "${CIBLE}/instance/demo-client/" && -d "${COPIE}/instance/demo-client" ]]; then
    mkdir -p -- "$(readlink -m "${CIBLE}/instance/demo-client")" \
      && rsync -a -- "${COPIE}/instance/demo-client/" "${CIBLE}/instance/demo-client/" || echec "contenu de demo-client impossible à restaurer"
  fi
fi
GARDES="$(find "${CIBLE}/instance" "${CIBLE}/passerelle" -name "*${SUFFIXE}" 2>/dev/null | wc -l)"
echo "Fichiers restaurés ; ${GARDES} élément(s) différent(s) déjà présent(s) gardé(s) avec le suffixe ${SUFFIXE}."

echo "== 4. Base de données"
DEST_DB="${DEST}/db"
PG_TMP="$(mktemp -d "${TMPDIR:-/tmp}/restaurer-instance-pg-XXXXXX")" || echec "dossier temporaire impossible"
# Mêmes réglages que la bibliothèque embarquée de Paperclip (voir transferer-instance.sh) : utilisateur et mot de passe
# « paperclip » de la bibliothèque, base en boucle locale seulement, UTF8, locale C.
printf '%s' "paperclip" > "${PG_TMP}/pw"
"${BIN_PG}/initdb" -D "${DEST_DB}" -U paperclip --pwfile="${PG_TMP}/pw" --auth-local=password --auth-host=password \
  --encoding=UTF8 --locale=C --lc-messages=C > "${PG_TMP}/initdb.log" 2>&1 || { tail -n 5 "${PG_TMP}/initdb.log" >&2; echec "initdb a échoué"; }
"${BIN_PG}/pg_ctl" -D "${DEST_DB}" -w -l "${PG_TMP}/serveur.log" \
  -o "-p ${PORT_PG} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${PG_TMP}" start > /dev/null 2>&1 \
  || { tail -n 5 "${PG_TMP}/serveur.log" >&2; echec "démarrage de PostgreSQL impossible"; }
PG_DEMARRE=1
export PGPASSWORD="paperclip"
PSQL=(psql -X -q -h 127.0.0.1 -p "${PORT_PG}" -U paperclip)
"${PSQL[@]}" -d postgres -c 'CREATE DATABASE paperclip' > /dev/null || echec "création de la base paperclip impossible"
# Rejeu strict : une base à moitié restaurée serait pire qu'un échec net (l'instance d'avant reste de côté).
gzip -dc -- "${DUMP}" | "${PSQL[@]}" -d paperclip -v ON_ERROR_STOP=1 -f - > "${PG_TMP}/rejeu.log" 2>&1
ETATS=("${PIPESTATUS[@]}")
if [[ "${ETATS[0]}" -ne 0 || "${ETATS[1]}" -ne 0 ]]; then
  grep 'ERROR' "${PG_TMP}/rejeu.log" | head -n 5 >&2
  echec "le rejeu de ${DUMP##*/} a échoué (première erreur ci-dessus) : instance NON restaurée"
fi
NB_PAUSES="$("${PSQL[@]}" -d paperclip -At -v ON_ERROR_STOP=1 -c "WITH p AS (UPDATE public.agents SET status = 'paused', pause_reason = 'system', paused_at = now(), updated_at = now() WHERE status NOT IN ('paused', 'terminated', 'pending_approval') RETURNING 1) SELECT count(*) FROM p")" \
  || echec "mise en pause des agents impossible"
NB_E="$("${PSQL[@]}" -d paperclip -Atc 'SELECT count(*) FROM public.companies')"; NB_A="$("${PSQL[@]}" -d paperclip -Atc 'SELECT count(*) FROM public.agents')"
[[ -n "${NB_E}" && -n "${NB_A}" ]] || echec "la base restaurée est illisible (tables absentes)"
unset PGPASSWORD
"${BIN_PG}/pg_ctl" -D "${DEST_DB}" -m fast -w stop > /dev/null 2>&1 || echec "arrêt de PostgreSQL impossible"
PG_DEMARRE=0
echo "Base restaurée (rejeu strict, sans erreur) : ${NB_E} entreprise(s), ${NB_A} agent(s) ; ${NB_PAUSES} agent(s) mis en PAUSE."

echo "== 5. Suite à faire"
echo "  1. systemctl --user start atelier-instance@${INSTANCE}   (applique les migrations en attente si besoin)"
echo "  2. python3 -I scripts/bootstrap-organisation.py etat    (contrôle de l'organisation)"
echo "  3. Reprendre les agents voulus dans l'interface (bouton « Reprendre »)."
for a in "${ANNEXES[@]}"; do
  case "${a}" in
    conteneurs/*) b="${a#conteneurs/}"; b="${b%.dump}"
      echo "  Base ${b} (conteneur en marche) : podman exec -i <conteneur de ${b}> pg_restore -U ${b} -d ${b} --clean --if-exists < ${COPIE}/${a}" ;;
    pages/*) echo "  Pages (service atelier-pages arrêté) : install -m 600 ${COPIE}/${a} ~/.local/share/atelier/pages/pages.sqlite" ;;
    phoenix/*) echo "  Phoenix (service atelier-phoenix arrêté) : install -m 600 ${COPIE}/${a} ~/.local/share/atelier-phoenix/donnees/phoenix.db" ;;
  esac
done
exit 0

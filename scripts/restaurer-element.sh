#!/usr/bin/env bash
# Restaure UN SEUL élément (tâche, document ou projet) depuis une sauvegarde horaire de Paperclip.
#
# Usage : scripts/restaurer-element.sh <instance> <sauvegarde> <type> <id> [--appliquer] [--sortie fichier.sql]
#   <instance>    nom d'une instance sous instance/instances/ (ex. atelier-apercu) ou chemin de son dossier
#   <sauvegarde>  fichier .sql.gz (ou .sql), nom d'un fichier du dossier de sauvegardes de l'instance,
#                 ou « derniere » pour la plus récente
#   <type>        issue | document | project
#   <id>          UUID ; pour issue, l'identifiant lisible (ex. ATE-12) est accepté ; pour project, le nom exact
#
# Fonctionnement : la sauvegarde est rejouée dans une base PostgreSQL TEMPORAIRE (dossier dans /tmp, port libre,
# détruite à la fin), les lignes de l'élément et de ses dépendances directes en sont extraites, et un fichier SQL
# d'insertion est écrit pour relecture. Les INSERT portent « ON CONFLICT DO NOTHING » : une ligne qui existe
# déjà dans la base vivante n'est jamais écrasée. Sans --appliquer, la base vivante n'est ni modifiée ni sollicitée.
#
# Dépendances directes extraites :
#   issue    : issues, issue_comments, issue_documents, documents et document_revisions liés
#   document : documents, document_revisions, issue_documents (liens vers les tâches)
#   project  : projects, project_goals, project_workspaces, project_memberships (pas ses tâches)
#
# --appliquer : après une copie de sécurité de la base vivante (pg_dump, lecture seule) à côté du fichier SQL,
# rejoue le fichier SQL en une seule transaction dans la base vivante de l'instance (serveur démarré requis).
# Codes de sortie : 0 succès, 1 erreur, 2 usage incorrect, 3 élément introuvable dans la sauvegarde.
set -uo pipefail
umask 077  # copies de la base et fichiers SQL : jamais lisibles par d'autres comptes, même pendant l'écriture

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
erreur() { echo "erreur : $*" >&2; }
usage() { sed -n '2,/^set -uo/p' "${BASH_SOURCE[0]}" | grep '^#' | sed 's/^# \{0,1\}//' >&2; }

APPLIQUER=0; SORTIE=""; POS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --appliquer) APPLIQUER=1;;
    --sortie) shift; SORTIE="${1:-}"; [ -n "$SORTIE" ] || { erreur "--sortie attend un fichier"; exit 2; };;
    -h|--help) usage; exit 0;;
    --*) erreur "option inconnue : $1"; usage; exit 2;;
    *) POS+=("$1");;
  esac
  shift
done
[ "${#POS[@]}" -eq 4 ] || { usage; exit 2; }
INSTANCE="${POS[0]}"; SAUVEGARDE="${POS[1]}"; TYPE="${POS[2]}"; ID="${POS[3]}"

case "$TYPE" in issue|document|project) ;; *) erreur "type inconnu : $TYPE (issue, document ou project)"; exit 2;; esac
# Valeur passée à psql en variable (jamais interpolée dans du shell ou du SQL brut) : jeu de caractères restreint.
if ! printf '%s' "$ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9 ._-]{0,127}$'; then erreur "identifiant invalide : $ID"; exit 2; fi

for outil in psql pg_dump; do command -v "$outil" >/dev/null 2>&1 || { erreur "$outil introuvable"; exit 1; }; done

# --- Instance ---
if [ -d "$INSTANCE" ]; then DOSSIER_INST="$(cd "$INSTANCE" && pwd)"; else DOSSIER_INST="$RACINE/instance/instances/$INSTANCE"; fi
[ -f "$DOSSIER_INST/config.json" ] || { erreur "instance introuvable (config.json absent) : $DOSSIER_INST"; exit 1; }
DOSSIER_SAUV="$(grep -o '"dir": *"[^"]*"' "$DOSSIER_INST/config.json" | head -1 | sed 's/.*: *"\(.*\)"/\1/')"
[ -n "$DOSSIER_SAUV" ] || DOSSIER_SAUV="$DOSSIER_INST/data/backups"

# --- Sauvegarde ---
if [ "$SAUVEGARDE" = "derniere" ]; then
  FICHIER="$(ls -t "$DOSSIER_SAUV"/paperclip-*.sql.gz 2>/dev/null | head -1)"
  [ -n "$FICHIER" ] || { erreur "aucune sauvegarde dans $DOSSIER_SAUV"; exit 1; }
elif [ -f "$SAUVEGARDE" ]; then FICHIER="$SAUVEGARDE"
elif [ -f "$DOSSIER_SAUV/$SAUVEGARDE" ]; then FICHIER="$DOSSIER_SAUV/$SAUVEGARDE"
else erreur "sauvegarde introuvable : $SAUVEGARDE"; exit 1; fi
case "$FICHIER" in *.gz) LECTEUR=(gzip -dc);; *.sql) LECTEUR=(cat);; *) erreur "format inconnu (attendu .sql.gz ou .sql) : $FICHIER"; exit 1;; esac

# --- Binaires du serveur PostgreSQL temporaire ---
BIN_PG="${PG_BIN:-}"
if [ -z "$BIN_PG" ]; then
  for c in "$RACINE"/paperclip/node_modules/.pnpm/@embedded-postgres+linux-x64@*/node_modules/@embedded-postgres/linux-x64/native/bin /usr/lib/postgresql/*/bin; do
    if [ -x "$c/initdb" ] && [ -x "$c/pg_ctl" ]; then BIN_PG="$c"; break; fi
  done
fi
[ -n "$BIN_PG" ] && [ -x "$BIN_PG/initdb" ] || { erreur "initdb introuvable (définir PG_BIN)"; exit 1; }

# --- Sortie ---
if [ -z "$SORTIE" ]; then
  mkdir -p "$RACINE/instance/restaurations" || { erreur "création de instance/restaurations impossible"; exit 1; }
  SORTIE="$RACINE/instance/restaurations/restauration-$TYPE-$(date +%Y%m%d-%H%M%S).sql"
fi

# --- Base temporaire ---
TMP="$(mktemp -d /tmp/restaurer-element.XXXXXX)" || { erreur "mktemp a échoué"; exit 1; }
PORT=""
nettoyer() {
  if [ -f "$TMP/db/postmaster.pid" ]; then "$BIN_PG/pg_ctl" -D "$TMP/db" -m immediate -w stop >/dev/null 2>&1; fi
  case "$TMP" in /tmp/restaurer-element.*) rm -rf "$TMP";; esac
}
trap nettoyer EXIT

for p in $(seq 54800 54899); do
  if ! ss -ltnH "sport = :$p" 2>/dev/null | grep -q .; then PORT="$p"; break; fi
done
[ -n "$PORT" ] || { erreur "aucun port libre entre 54800 et 54899"; exit 1; }

echo "Base temporaire : port $PORT, dossier $TMP"
"$BIN_PG/initdb" -D "$TMP/db" -U paperclip --auth=trust -E UTF8 >"$TMP/initdb.log" 2>&1 || { erreur "initdb a échoué (voir $TMP/initdb.log)"; cat "$TMP/initdb.log" >&2; exit 1; }
"$BIN_PG/pg_ctl" -D "$TMP/db" -w -l "$TMP/serveur.log" \
  -o "-p $PORT -c listen_addresses='' -c unix_socket_directories=$TMP -c fsync=off -c synchronous_commit=off -c full_page_writes=off" start >/dev/null 2>&1 \
  || { erreur "démarrage de PostgreSQL temporaire impossible"; tail -5 "$TMP/serveur.log" >&2; exit 1; }
TEMP=(psql -X -q -h "$TMP" -p "$PORT" -U paperclip)  # socket Unix seulement (dossier en 700), aucun port TCP ouvert
"${TEMP[@]}" -d postgres -c 'CREATE DATABASE paperclip' >/dev/null || { erreur "création de la base temporaire impossible"; exit 1; }
TEMP+=(-d paperclip)

echo "Restauration de $(basename "$FICHIER") dans la base temporaire…"
"${LECTEUR[@]}" "$FICHIER" | "${TEMP[@]}" -v ON_ERROR_STOP=0 -f - >"$TMP/restauration.log" 2>&1
ERREURS_REJEU="$(grep -c 'ERROR' "$TMP/restauration.log")"
NB_ISSUES_TEMP="$("${TEMP[@]}" -Atc 'SELECT count(*) FROM public.issues' 2>/dev/null)"
[ -n "$NB_ISSUES_TEMP" ] || { erreur "la sauvegarde n'a pas pu être rejouée (voir ci-dessous)"; head -5 "$TMP/restauration.log" >&2; exit 1; }
echo "Sauvegarde rejouée : $NB_ISSUES_TEMP tâche(s), $ERREURS_REJEU erreur(s) de rejeu tolérée(s)."

# --- Résolution de l'élément : UUID unique ---
case "$TYPE" in
  issue) REQ_ID="SELECT id FROM public.issues WHERE id::text = :'v' OR identifier = :'v'";;
  document) REQ_ID="SELECT id FROM public.documents WHERE id::text = :'v'";;
  project) REQ_ID="SELECT id FROM public.projects WHERE id::text = :'v' OR name = :'v'";;
esac
UUIDS="$(printf '%s\n' "$REQ_ID" | "${TEMP[@]}" -Atv "v=$ID" -f - 2>"$TMP/resolution.log")"
NB="$(printf '%s' "$UUIDS" | grep -c .)"
if [ "$NB" -eq 0 ]; then erreur "$TYPE « $ID » introuvable dans la sauvegarde $(basename "$FICHIER")."; exit 3; fi
if [ "$NB" -gt 1 ]; then erreur "$NB éléments correspondent à « $ID » ; utiliser l'UUID :"; printf '%s\n' "$UUIDS" >&2; exit 1; fi
U="$UUIDS"
printf '%s' "$U" | grep -Eq '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' || { erreur "UUID inattendu : $U"; exit 1; }

# --- Extraction dans un schéma d'étape (ordre d'insertion = ordre du tableau) ---
case "$TYPE" in
  issue)
    TABLES=(documents issues issue_comments issue_documents document_revisions)
    declare -A QUETE=(
      [documents]="SELECT * FROM public.documents WHERE id IN (SELECT document_id FROM public.issue_documents WHERE issue_id = '$U')"
      [issues]="SELECT * FROM public.issues WHERE id = '$U'"
      [issue_comments]="SELECT * FROM public.issue_comments WHERE issue_id = '$U' ORDER BY created_at"
      [issue_documents]="SELECT * FROM public.issue_documents WHERE issue_id = '$U'"
      [document_revisions]="SELECT * FROM public.document_revisions WHERE document_id IN (SELECT document_id FROM public.issue_documents WHERE issue_id = '$U') ORDER BY document_id, revision_number");;
  document)
    TABLES=(documents document_revisions issue_documents)
    declare -A QUETE=(
      [documents]="SELECT * FROM public.documents WHERE id = '$U'"
      [document_revisions]="SELECT * FROM public.document_revisions WHERE document_id = '$U' ORDER BY revision_number"
      [issue_documents]="SELECT * FROM public.issue_documents WHERE document_id = '$U'");;
  project)
    TABLES=(projects project_goals project_workspaces project_memberships)
    declare -A QUETE=(
      [projects]="SELECT * FROM public.projects WHERE id = '$U'"
      [project_goals]="SELECT * FROM public.project_goals WHERE project_id = '$U'"
      [project_workspaces]="SELECT * FROM public.project_workspaces WHERE project_id = '$U'"
      [project_memberships]="SELECT * FROM public.project_memberships WHERE project_id = '$U'");;
esac
"${TEMP[@]}" -v ON_ERROR_STOP=1 -c 'CREATE SCHEMA extrait' >/dev/null || { erreur "schéma d'étape impossible"; exit 1; }
for t in "${TABLES[@]}"; do
  "${TEMP[@]}" -v ON_ERROR_STOP=1 -c "CREATE TABLE extrait.$t AS ${QUETE[$t]}" >/dev/null || { erreur "extraction de $t impossible"; exit 1; }
done

# --- Écriture du fichier SQL ---
{
  echo "-- Restauration d'un seul élément : $TYPE $ID ($U)"
  echo "-- Sauvegarde : $(basename "$FICHIER") ; instance : $(basename "$DOSSIER_INST") ; généré le $(date '+%Y-%m-%d %H:%M:%S')"
  echo "-- À RELIRE avant de l'appliquer. Les lignes déjà présentes dans la base vivante sont ignorées (ON CONFLICT DO NOTHING)."
  echo "BEGIN;"
} > "$SORTIE" || { erreur "écriture impossible : $SORTIE"; exit 1; }
RESUME=()
for t in "${TABLES[@]}"; do
  n="$("${TEMP[@]}" -Atc "SELECT count(*) FROM extrait.$t")"
  RESUME+=("$t=$n")
  [ "$n" -gt 0 ] || continue
  echo "-- $t ($n ligne(s))" >> "$SORTIE"
  pg_dump -h "$TMP" -p "$PORT" -U paperclip -d paperclip --data-only --column-inserts --on-conflict-do-nothing --no-owner -t "extrait.$t" 2>"$TMP/pgdump.log" \
    | awk '/^INSERT INTO /{d=1} d{print}' \
    | sed 's/^INSERT INTO extrait\./INSERT INTO public./' \
    | awk '{l[NR]=$0} END{n=NR; while(n>0 && (l[n]=="" || l[n] ~ /^\\unrestrict / || l[n] ~ /^--/)) n--; for(i=1;i<=n;i++) print l[i]}' >> "$SORTIE"
  [ "${PIPESTATUS[0]}" -eq 0 ] || { erreur "pg_dump de $t a échoué"; cat "$TMP/pgdump.log" >&2; exit 1; }
done
echo "COMMIT;" >> "$SORTIE"
chmod 600 "$SORTIE" 2>/dev/null

# --- Contrôle : le fichier SQL doit reconstituer l'élément à partir de rien (base TEMPORAIRE seulement) ---
LISTE_TABLES="$(printf 'public.%s,' "${TABLES[@]}")"; LISTE_TABLES="${LISTE_TABLES%,}"
"${TEMP[@]}" -v ON_ERROR_STOP=1 -c "TRUNCATE $LISTE_TABLES CASCADE" >/dev/null 2>&1 || { erreur "contrôle impossible : vidage des tables temporaires"; exit 1; }
# Les clés étrangères vers des lignes hors extraction (parent, projet, agent…) sont suspendues pour ce contrôle seulement :
# dans la vraie base, ces lignes doivent exister (voir la documentation).
{ echo "SET session_replication_role = replica;"; cat "$SORTIE"; } | "${TEMP[@]}" -v ON_ERROR_STOP=1 -f - >/dev/null 2>"$TMP/controle.log" || { erreur "le fichier SQL produit ne se rejoue pas :"; cat "$TMP/controle.log" >&2; exit 1; }
for t in "${TABLES[@]}"; do
  attendu="$("${TEMP[@]}" -Atc "SELECT count(*) FROM extrait.$t")"
  obtenu="$("${TEMP[@]}" -Atc "SELECT count(*) FROM public.$t")"
  [ "$attendu" = "$obtenu" ] || { erreur "contrôle : $t a $obtenu ligne(s) après rejeu, $attendu attendue(s)"; exit 1; }
done
echo "Contrôle réussi : le fichier SQL reconstitue l'élément dans une base vide (temporaire)."
echo "Lignes extraites : ${RESUME[*]}"
echo "Fichier SQL à relire : $SORTIE"

if [ "$APPLIQUER" -ne 1 ]; then
  echo "Rien n'a été écrit dans la base vivante (relancer avec --appliquer après relecture)."
  exit 0
fi

# --- Application à la base vivante ---
PORT_VIVANT="$(grep -o '"embeddedPostgresPort": *[0-9]*' "$DOSSIER_INST/config.json" | grep -o '[0-9]*$')"
[ -n "$PORT_VIVANT" ] || { erreur "port PostgreSQL de l'instance introuvable dans config.json"; exit 1; }
export PGPASSWORD="${PGPASSWORD:-paperclip}"
VIVANT=(psql -X -q -h 127.0.0.1 -p "$PORT_VIVANT" -U paperclip -d paperclip)
"${VIVANT[@]}" -Atc 'SELECT 1' >/dev/null 2>&1 || { erreur "base vivante inaccessible sur le port $PORT_VIVANT (serveur de l'instance démarré ?)"; exit 1; }
COPIE="${SORTIE%.sql}-base-vivante-avant.sql.gz"
echo "Copie de sécurité de la base vivante : $COPIE"
pg_dump -h 127.0.0.1 -p "$PORT_VIVANT" -U paperclip -d paperclip --no-owner | gzip > "$COPIE"
[ "${PIPESTATUS[0]}" -eq 0 ] || { erreur "copie de sécurité impossible : rien n'a été appliqué"; rm -f "$COPIE"; exit 1; }
chmod 600 "$COPIE" 2>/dev/null
"${VIVANT[@]}" -v ON_ERROR_STOP=1 -f "$SORTIE" || { erreur "application échouée : la transaction est annulée, rien n'a changé"; exit 1; }
echo "Appliqué dans la base vivante (port $PORT_VIVANT). Copie de retour arrière : $COPIE"

#!/usr/bin/env bash
# Tests de scripts/transferer-instance.sh : « envoyer » (transport local à la place de Tailscale) puis
# « recevoir » dans un clone temporaire. La « source » est une base PostgreSQL temporaire (port d'essai 54370) où
# est rejouée la vraie dernière sauvegarde de l'instance « atelier » (lecture seule : copie du fichier .sql.gz) : « envoyer »
# y fait son dump frais. Puis démarrage réel sur les ports d'essai 3170 / 54370 et contrôle par l'API.
# L'instance de la tour (port 3100) n'est ni arrêtée ni modifiée.
# Usage : scripts/tests/tester-transferer-instance.sh [--sans-demarrage]   (code 0 si tout passe)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${RACINE}/scripts/transferer-instance.sh"
SANS_DEMARRAGE=0; [[ "${1:-}" == "--sans-demarrage" ]] && SANS_DEMARRAGE=1
PORT_HTTP=3170; PORT_PG=54370
TMP="$(mktemp -d "${TMPDIR:-/tmp}/transfert-test-XXXXXX")" || exit 1
ECHECS=0; TOTAL=0
BIN_PG=""; SOURCE_PG_ACTIVE=0; RESTAURE_PG_ACTIF=0
arreter_pg() {   # arreter_pg <dossier de données>
  "${BIN_PG}/pg_ctl" -D "$1" -m fast -w stop >/dev/null 2>&1
}
arreter_essai() {
  if [[ "${SOURCE_PG_ACTIVE}" -eq 1 ]]; then arreter_pg "${TMP}/source-db"; fi
  if [[ "${RESTAURE_PG_ACTIF}" -eq 1 ]]; then arreter_pg "${TMP}/clone/instance/instances/atelier/db"; fi
  if [[ -f "${TMP}/clone/config/atelier.env" && -x "${TMP}/clone/scripts/arreter-instance.sh" ]]; then
    ATELIER_FICHIER_ENV="${TMP}/clone/config/atelier.env" "${TMP}/clone/scripts/arreter-instance.sh" >/dev/null 2>&1
  fi
  case "${TMP}" in "${TMPDIR:-/tmp}"/transfert-test-*) rm -rf -- "${TMP}" ;; esac
}
trap arreter_essai EXIT

verifie() {   # verifie <nom> <commande…>
  local nom="$1"; shift
  TOTAL=$((TOTAL + 1))
  if "$@" >/dev/null 2>&1; then echo "OK     ${nom}"; else echo "ECHEC  ${nom}"; ECHECS=$((ECHECS + 1)); fi
}
attendre() {   # attendre <nom> <0|non0> <fragment ou vide> <commande…> ; la sortie est mise dans ${SORTIE}
  local nom="$1" attendu="$2" fragment="$3"; shift 3
  local code
  SORTIE="$("$@" 2>&1)"; code=$?
  TOTAL=$((TOTAL + 1))
  if [[ "${attendu}" == "0" && "${code}" -ne 0 ]] || [[ "${attendu}" == "non0" && "${code}" -eq 0 ]]; then
    echo "ECHEC  ${nom} : code ${code}, attendu ${attendu}"; echo "${SORTIE}" | tail -n 15 | sed 's/^/         /'; ECHECS=$((ECHECS + 1)); return
  fi
  if [[ -n "${fragment}" && "${SORTIE}" != *"${fragment}"* ]]; then
    echo "ECHEC  ${nom} : sortie sans « ${fragment} »"; echo "${SORTIE}" | tail -n 15 | sed 's/^/         /'; ECHECS=$((ECHECS + 1)); return
  fi
  echo "OK     ${nom} (code ${code})"
}

# Garde-fous : ports d'essai libres, et une dernière sauvegarde réelle à rejouer.
for p in "${PORT_HTTP}" "${PORT_PG}"; do
  if ss -ltnH "sport = :${p}" | grep -q .; then echo "ERREUR : port d'essai ${p} occupé"; exit 1; fi
done
REELLE="$(ls -1 "${RACINE}"/instance/instances/atelier/data/backups/paperclip-*.sql.gz 2>/dev/null | sort | tail -n 1)"
[[ -n "${REELLE}" ]] || { echo "ERREUR : aucune sauvegarde réelle de l'instance atelier à rejouer"; exit 1; }
trouver_bin_pg() {
  local c
  for c in "${RACINE}"/paperclip/node_modules/.pnpm/@embedded-postgres+linux-x64@*/node_modules/@embedded-postgres/linux-x64/native/bin /usr/lib/postgresql/*/bin; do
    if [[ -x "${c}/initdb" && -x "${c}/pg_ctl" ]]; then echo "${c}"; return 0; fi
  done
  return 1
}
BIN_PG="$(trouver_bin_pg)" || { echo "ERREUR : initdb introuvable (lancer scripts/preparer-socle.sh)"; exit 1; }
PID_TOUR="$(ss -ltnpH 'sport = :3100' 2>/dev/null | grep -o 'pid=[0-9]*' | head -n 1)"

# Source factice : fichiers synthétiques + la vraie sauvegarde de base ; ports d'essai dans les réglages.
SRC="${TMP}/source"; B="${SRC}/instance/instances/atelier"
mkdir -p "${B}/data/backups" "${B}/secrets" "${B}/companies/c1" "${B}/data/storage" "${SRC}/config" \
         "${SRC}/instance/cles" "${SRC}/instance/secrets" "${SRC}/instance/passerelles" "${SRC}/instance/plugin-jb" \
         "${SRC}/instance/demo-reel" "${SRC}/passerelle/etat" "${TMP}/distant" "${SRC}/instance/agents-atelier/c1/ag" \
         "${SRC}/instance/claude-config/c1/ag"
chmod 755 "${TMP}/distant"   # dossier distant déjà présent et trop ouvert : « envoyer » doit le forcer en 700
/usr/bin/cp -f -- "${REELLE}" "${B}/data/backups/"
rsync -a --exclude __pycache__ "${RACINE}/scripts/" "${SRC}/scripts/"   # la source a l'allure d'un clone (garde « même arborescence »)
printf '%s' "$(openssl rand -base64 32)" > "${B}/secrets/master.key"   # clé synthétique valide (32 octets en base64)
printf 'PAPERCLIP_AGENT_JWT_SECRET=jwt-synthetique-ne-pas-afficher\nPAPERCLIP_TOOL_ACTION_SIGNING_SECRET=signature-synthetique-ne-pas-afficher\n' > "${B}/.env"
echo doc > "${B}/companies/c1/doc.md"; echo piece > "${B}/data/storage/p.bin"
echo k > "${SRC}/instance/cles/a.pem"; echo s > "${SRC}/instance/secrets/b.txt"; echo p > "${SRC}/instance/passerelles/p.env"
echo j > "${SRC}/instance/plugin-jb/m.js"; echo d > "${SRC}/instance/demo-reel/d.json"
ln -s demo-reel "${SRC}/instance/demo-client"; echo i > "${SRC}/passerelle/etat/index.db"
echo "notes ${SRC}/x" > "${SRC}/instance/agents-atelier/c1/ag/note.md"
printf '{"hooks":"%s/scripts/hook.sh"}\n' "${SRC}" > "${SRC}/instance/claude-config/c1/ag/settings.json"
# Deux identifiants de machine distincts (la source et le portable sont ici le même poste).
printf 'machine-source-synthetique\n' > "${TMP}/id-source"; printf 'machine-portable-synthetique\n' > "${TMP}/id-portable"
python3 -I - "${RACINE}" "${SRC}" "${PORT_HTTP}" "${PORT_PG}" <<'PY'
import json, sys
racine, src, port_http, port_pg = sys.argv[1:5]
c = json.load(open(racine + "/instance/instances/atelier/config.json"))
def remplacer(o):
    if isinstance(o, dict): return {k: remplacer(v) for k, v in o.items()}
    if isinstance(o, list): return [remplacer(v) for v in o]
    return o.replace(racine, src) if isinstance(o, str) else o
c = remplacer(c)
c["server"]["port"] = int(port_http); c["database"]["embeddedPostgresPort"] = int(port_pg)
json.dump(c, open(src + "/instance/instances/atelier/config.json", "w"), indent=2)
env = open(racine + "/config/atelier.env").read().replace(racine, src).splitlines()
env = [("PORT=" + port_http) if l.startswith("PORT=") else l for l in env]
open(src + "/config/atelier.env", "w").write("\n".join(env) + "\n")
PY

# Base « vivante » de la source : PostgreSQL temporaire sur le port d'essai, avec la vraie sauvegarde rejouée, puis
# chemins de la source factice, un agent actif et un marqueur absent de la dernière sauvegarde horaire.
mkdir -m 700 "${TMP}/sock-src"; printf '%s' paperclip > "${TMP}/pw"
"${BIN_PG}/initdb" -D "${TMP}/source-db" -U paperclip --pwfile="${TMP}/pw" --auth-local=password --auth-host=password \
  --encoding=UTF8 --locale=C --lc-messages=C >/dev/null 2>&1 || { echo "ERREUR : initdb de la source"; exit 1; }
"${BIN_PG}/pg_ctl" -D "${TMP}/source-db" -w -l "${TMP}/source-pg.log" \
  -o "-p ${PORT_PG} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${TMP}/sock-src -c fsync=off" start >/dev/null 2>&1 \
  || { echo "ERREUR : démarrage de la base source"; exit 1; }
SOURCE_PG_ACTIVE=1
export PGPASSWORD=paperclip
PSQL_SRC=(psql -X -q -h 127.0.0.1 -p "${PORT_PG}" -U paperclip)
"${PSQL_SRC[@]}" -d postgres -c 'CREATE DATABASE paperclip' >/dev/null || { echo "ERREUR : base source"; exit 1; }
gzip -dc -- "${REELLE}" | "${PSQL_SRC[@]}" -d paperclip -v ON_ERROR_STOP=1 -f - >/dev/null 2>"${TMP}/rejeu-source.log" \
  || { echo "ERREUR : rejeu de la sauvegarde réelle dans la source"; head -n 5 "${TMP}/rejeu-source.log"; exit 1; }
"${PSQL_SRC[@]}" -d paperclip -v ON_ERROR_STOP=1 -v "r=${RACINE}" -v "s=${SRC}" >/dev/null <<'SQL' || { echo "ERREUR : préparation de la source"; exit 1; }
UPDATE public.agents SET adapter_config = replace(adapter_config::text, :'r', :'s')::jsonb;
UPDATE public.agents SET status = 'idle' WHERE id = (SELECT id FROM public.agents WHERE status <> 'terminated' ORDER BY id LIMIT 1);
CREATE TABLE public.marqueur_frais (x int);
SQL
ACTIFS_SOURCE="$("${PSQL_SRC[@]}" -d paperclip -Atc "SELECT count(*) FROM public.agents WHERE status NOT IN ('paused','terminated','pending_approval')")"
CHEMINS_SOURCE="$("${PSQL_SRC[@]}" -d paperclip -Atc "SELECT count(*) FROM public.agents WHERE position('${SRC}' in adapter_config::text) > 0")"
unset PGPASSWORD
TOTAL=$((TOTAL + 1))
if [[ "${ACTIFS_SOURCE}" -ge 1 && "${CHEMINS_SOURCE}" -ge 1 ]]; then echo "OK     source prête : ${ACTIFS_SOURCE} agent(s) actif(s), ${CHEMINS_SOURCE} avec chemins de la source"
else echo "ECHEC  source non préparée (actifs ${ACTIFS_SOURCE}, chemins ${CHEMINS_SOURCE})"; ECHECS=$((ECHECS + 1)); fi

# 1. envoyer : transport local (« bash -c ») à la place de « tailscale ssh <hote> ».
export ATELIER_TRANSFERT_COMMANDE="bash -c"
cd "${TMP}" || exit 1   # --chemin-distant est relatif au « dossier personnel distant » : ici le dossier de l'essai
attendre "envoyer sans --transport-test : ATELIER_TRANSFERT_COMMANDE refusé" non0 "--transport-test" \
  "${SCRIPT}" envoyer hote-test --source "${SRC}" --chemin-distant distant
attendre "ATELIER_MACHINE_ID_FICHIER sans --transport-test refusé" non0 "--transport-test" \
  env ATELIER_MACHINE_ID_FICHIER="${TMP}/id-source" "${SCRIPT}" envoyer hote-test --source "${SRC}"
attendre "envoyer : chemin distant absolu refusé" non0 "chemin relatif" \
  "${SCRIPT}" envoyer hote-test --source "${SRC}" --chemin-distant "${TMP}/distant" --transport-test
attendre "envoyer (transport local, dump frais)" 0 "Copie reçue et vérifiée" \
  env ATELIER_MACHINE_ID_FICHIER="${TMP}/id-source" "${SCRIPT}" envoyer hote-test --source "${SRC}" --chemin-distant distant --transport-test
verifie "dossier distant déjà présent forcé en 700" test "$(stat -c %a "${TMP}/distant")" = "700"
COPIE="$(find "${TMP}/distant" -mindepth 1 -maxdepth 1 -type d -name 'atelier-*' | head -n 1)"
verifie "copie arrivée avec EMPREINTES et COMPLEMENT" test -s "${COPIE}/EMPREINTES.sha256" -a -s "${COPIE}/COMPLEMENT.sha256"
verifie "config.json et atelier.env dans le complément" test -f "${COPIE}/complement/config.json" -a -f "${COPIE}/complement/atelier.env"
verifie "pas de traces Phoenix dans la copie" test ! -e "${COPIE}/phoenix"
verifie "dump frais dans le complément (marqueur absent de la sauvegarde horaire)" bash -c 'zcat "$1" | grep -q marqueur_frais && ! zcat "$2" | grep -q marqueur_frais' _ "${COPIE}/complement/base-fraiche.sql.gz" "${REELLE}"
verifie "empreinte de machine (sha256) et comptages dans le complément" bash -c 'grep -qx "$1" "$2" && grep -q "^agents=" "$3" && grep -q "^companies=" "$3"' _ "$(sha256sum < "${TMP}/id-source" | cut -d" " -f1)" "${COPIE}/complement/MACHINE_SOURCE" "${COPIE}/complement/COMPTAGES"
verifie ".env d'instance non copié deux fois (déjà dans la sauvegarde)" test ! -e "${COPIE}/complement/instance.env" -a -f "${COPIE}/instance/instances/atelier/.env"
verifie "agents-atelier et claude-config dans le complément" test -f "${COPIE}/complement/agents-atelier/c1/ag/note.md" -a -f "${COPIE}/complement/claude-config/c1/ag/settings.json"
verifie "brouillon d'envoi supprimé" test -z "$(ls -A "${SRC}/instance/transferts" 2>/dev/null)"
verifie "aucun secret dans la sortie d'envoi" bash -c '[[ "$1" != *synthetique-ne-pas-afficher* && "$1" != *"$(cat "$2")"* ]]' _ "${SORTIE}" "${B}/secrets/master.key"
attendre "envoyer : hôte invalide refusé" non0 "hôte" "${SCRIPT}" envoyer 'a;b' --source "${SRC}" --transport-test
arreter_pg "${TMP}/source-db"; SOURCE_PG_ACTIVE=0   # libère le port d'essai pour la restauration
COPIE2="${TMP}/copie-sauvegardee"; rsync -a "${COPIE}/" "${COPIE2}/"   # « recevoir » supprime la copie : on en garde une pour les cas de refus

# 2. recevoir dans un clone temporaire (scripts copiés ; socle partagé en lien, lecture seule).
CL="${TMP}/clone"; mkdir -p "${CL}/config"
rsync -a --exclude __pycache__ "${RACINE}/scripts/" "${CL}/scripts/"
ln -s "${RACINE}/paperclip" "${CL}/paperclip"
RECEVOIR=(env ATELIER_MACHINE_ID_FICHIER="${TMP}/id-portable" "${SCRIPT}")
attendre "recevoir sur une copie altérée refusé, copie conservée et signalée comme secrète" non0 "contient des secrets" bash -c '
  set -e; copie="$1"; autre="$2"; rsync -a "$copie/" "$autre/"; echo x >> "$autre/instance/cles/a.pem"
  exec env ATELIER_MACHINE_ID_FICHIER="$5" "$3" recevoir "$autre" --racine "$4" --transport-test' _ "${COPIE2}" "${TMP}/copie-alteree" "${SCRIPT}" "${CL}" "${TMP}/id-portable"
verifie "rien n'a été écrit après le refus" test ! -e "${CL}/instance/instances/atelier"
attendre "recevoir depuis la même machine refusé" non0 "CETTE machine" \
  env ATELIER_MACHINE_ID_FICHIER="${TMP}/id-source" "${SCRIPT}" recevoir "${COPIE2}" --racine "${CL}" --transport-test
verifie "rien n'a été écrit après le refus (même machine)" test ! -e "${CL}/instance/instances/atelier"
attendre "recevoir" 0 "Base restaurée" "${RECEVOIR[@]}" recevoir "${COPIE}" --racine "${CL}" --transport-test
echo "${SORTIE}" | grep -E "Base restaurée|Agents :|Aucune instance ne répond" | sed 's/^/         /'
RESTAURE="$(grep -oE '[0-9]+ entreprise\(s\), [0-9]+ agent\(s\)' <<<"${SORTIE}" | head -n 1)"
verifie "copie reçue supprimée après un recevoir réussi" test ! -e "${COPIE}"
verifie "la sortie annonce la suppression de la copie et la pause des agents" bash -c '[[ "$1" == *"Copie reçue supprimée"* && "$1" == *"mis en PAUSE"* && "$1" == *"/resume"* ]]' _ "${SORTIE}"
I="${CL}/instance/instances/atelier"
verifie "master.key identique" cmp "${B}/secrets/master.key" "${I}/secrets/master.key"
verifie "master.key en 600" test "$(stat -c %a "${I}/secrets/master.key")" = "600"
verifie "companies, stockage, clés, passerelle copiés" test -f "${I}/companies/c1/doc.md" -a -f "${I}/data/storage/p.bin" -a -f "${CL}/instance/cles/a.pem" -a -f "${CL}/passerelle/etat/index.db" -a -f "${CL}/instance/plugin-jb/m.js"
verifie ".env de l'instance restauré en 600" bash -c 'cmp -s "$1" "$2" && [[ "$(stat -c %a "$2")" == 600 ]]' _ "${B}/.env" "${I}/.env"
verifie "agents-atelier et claude-config restaurés, chemins du clone et aucun chemin de la source" bash -c '
  grep -q "$2" "$1/claude-config/c1/ag/settings.json" && ! grep -rq "$3" "$1/claude-config" "$1/agents-atelier" && grep -q "$2" "$1/agents-atelier/c1/ag/note.md"' _ "${CL}/instance" "${CL}" "${SRC}"
verifie "cluster PostgreSQL créé" test -f "${I}/db/PG_VERSION"
verifie "config.json : chemins du clone, aucun chemin de la source" bash -c 'grep -q "$1" "$3" && ! grep -q "$2" "$3"' _ "${CL}" "${SRC}" "${I}/config.json"
verifie "config.json en 600" test "$(stat -c %a "${I}/config.json")" = "600"
verifie "atelier.env : PAPERCLIP_HOME du clone et port d'essai" bash -c 'grep -qx "PAPERCLIP_HOME=$1/instance" "$2" && grep -qx "PORT=$3" "$2"' _ "${CL}" "${CL}/config/atelier.env" "${PORT_HTTP}"
verifie "aucun secret dans la sortie de recevoir" bash -c '[[ "$1" != *synthetique-ne-pas-afficher* && "$1" != *"$(cat "$2")"* ]]' _ "${SORTIE}" "${B}/secrets/master.key"
verifie "port PostgreSQL d'essai relâché après la restauration" bash -c '! ss -ltnH "sport = :$1" | grep -q .' _ "${PORT_PG}"
attendre "recevoir sur une instance existante refusé, copie conservée" non0 "--remplacer" "${RECEVOIR[@]}" recevoir "${COPIE2}" --racine "${CL}" --transport-test
verifie "la copie refusée est toujours là" test -f "${COPIE2}/EMPREINTES.sha256"

# Deuxième réception avec --remplacer et --garder-copie : clé locale différente gardée avec le suffixe .avant-transfert-.
echo "cle-locale-differente" > "${CL}/instance/cles/a.pem"
attendre "recevoir --remplacer --garder-copie" 0 "Copie reçue CONSERVÉE" "${RECEVOIR[@]}" recevoir "${COPIE2}" --racine "${CL}" --remplacer --garder-copie --transport-test
verifie "--garder-copie : la copie existe encore" test -f "${COPIE2}/EMPREINTES.sha256"
verifie "clé locale différente sauvegardée (.avant-transfert-), clé de la copie en place" bash -c '
  [[ "$(cat "$1/instance/cles/a.pem")" == k ]] && grep -qx cle-locale-differente "$1"/instance/cles/a.pem.avant-transfert-*' _ "${CL}"
verifie "ancienne instance déplacée, pas supprimée" bash -c 'ls -d "$1"/instance/instances/atelier.avant-transfert-* >/dev/null' _ "${CL}"

# Après restauration, AVANT lancer-instance.sh : tous les agents sont en pause et leurs chemins sont ceux du clone.
"${BIN_PG}/pg_ctl" -D "${I}/db" -w -l "${TMP}/restaure-pg.log" -o "-p ${PORT_PG} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${TMP}/sock-src -c fsync=off" start >/dev/null 2>&1
RESTAURE_PG_ACTIF=1
export PGPASSWORD=paperclip
ACTIFS_RESTAURE="$("${PSQL_SRC[@]}" -d paperclip -Atc "SELECT count(*) FROM public.agents WHERE status NOT IN ('paused','terminated','pending_approval')")"
ANCIENS_CHEMINS="$("${PSQL_SRC[@]}" -d paperclip -Atc "SELECT count(*) FROM public.agents WHERE position('${SRC}' in adapter_config::text) > 0")"
NOUVEAUX_CHEMINS="$("${PSQL_SRC[@]}" -d paperclip -Atc "SELECT count(*) FROM public.agents WHERE position('${CL}' in adapter_config::text) > 0")"
unset PGPASSWORD
arreter_pg "${I}/db"; RESTAURE_PG_ACTIF=0
verifie "base restaurée : aucun agent actif (pause avant lancer-instance.sh)" test "${ACTIFS_RESTAURE}" = "0"
verifie "base restaurée : chemins des agents réécrits (${NOUVEAUX_CHEMINS} avec le clone, ${ANCIENS_CHEMINS} avec la source)" test "${ANCIENS_CHEMINS}" = "0" -a "${NOUVEAUX_CHEMINS}" -ge 1

# 3. Démarrage réel sur les ports d'essai, puis contrôle par l'API.
if [[ "${SANS_DEMARRAGE}" -eq 1 ]]; then
  echo "SAUTÉ  démarrage réel et contrôle par l'API (--sans-demarrage)"
else
  ( cd "${CL}" && ./scripts/lancer-instance.sh > "${TMP}/lancement.log" 2>&1 ) &
  LANCEUR=$!
  PRET=0
  for _ in $(seq 1 90); do
    if curl -fsS -m 3 "http://127.0.0.1:${PORT_HTTP}/api/health" 2>/dev/null | grep -q '"ok"'; then PRET=1; break; fi
    kill -0 "${LANCEUR}" 2>/dev/null || break   # le lanceur s'est arrêté : inutile d'attendre
    sleep 4
  done
  TOTAL=$((TOTAL + 1))
  if [[ "${PRET}" -eq 1 ]]; then echo "OK     l'instance du clone répond sur le port ${PORT_HTTP}"
  else echo "ECHEC  l'instance du clone ne répond pas"; grep -E "✗|✖|■|fail|rror" "${TMP}/lancement.log" | head -n 15 | sed 's/^/         /'; ECHECS=$((ECHECS + 1)); fi
  if [[ "${PRET}" -eq 1 ]]; then
    attendre "controler (API)" 0 "entreprise(s)" "${SCRIPT}" controler --racine "${CL}"
    echo "         ${SORTIE}"
    verifie "API : mêmes nombres que la base restaurée (${RESTAURE})" bash -c '[[ "$1" == *"$2"* ]]' _ "${SORTIE}" "${RESTAURE}"
  fi
fi

PID_TOUR_APRES="$(ss -ltnpH 'sport = :3100' 2>/dev/null | grep -o 'pid=[0-9]*' | head -n 1)"
TOTAL=$((TOTAL + 1))
if [[ "${PID_TOUR}" == "${PID_TOUR_APRES}" ]]; then echo "OK     l'instance de la tour (3100) est restée la même (${PID_TOUR:-aucune})"
else echo "ECHEC  l'instance de la tour a changé (${PID_TOUR} -> ${PID_TOUR_APRES})"; ECHECS=$((ECHECS + 1)); fi

echo "----"
echo "${TOTAL} contrôle(s), ${ECHECS} échec(s)."
[[ "${ECHECS}" -eq 0 ]]

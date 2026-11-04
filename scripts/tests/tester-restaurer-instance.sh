#!/usr/bin/env bash
# Tests de scripts/restaurer-instance.sh (AFC-A4) sur une arborescence FACTICE : une copie est fabriquée par le vrai
# scripts/sauvegarde-hors-machine.sh depuis une source synthétique (base de quelques lignes, aucune donnée réelle),
# puis restaurée dans une autre arborescence factice avec un vrai PostgreSQL (port d'essai 54375).
# L'instance de la tour (instance/ du dépôt) n'est ni lue ni modifiée.
# Usage : scripts/tests/tester-restaurer-instance.sh   (code 0 si tout passe)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${RACINE}/scripts/restaurer-instance.sh"
PORT_HTTP=3175; PORT_PG=54375
TMP="$(mktemp -d "${TMPDIR:-/tmp}/restaurer-instance-test-XXXXXX")" || exit 1
ECHECS=0; TOTAL=0
BIN_PG=""
nettoyer() {
  [[ -f "${TMP}/cible/instance/instances/atelier/db/postmaster.pid" ]] \
    && "${BIN_PG}/pg_ctl" -D "${TMP}/cible/instance/instances/atelier/db" -m immediate -w stop >/dev/null 2>&1
  case "${TMP}" in "${TMPDIR:-/tmp}"/restaurer-instance-test-*) rm -rf -- "${TMP}" ;; esac
}
trap nettoyer EXIT

verifie() {   # verifie <nom> <commande…>
  local nom="$1"; shift
  TOTAL=$((TOTAL + 1))
  if "$@" >/dev/null 2>&1; then echo "OK     ${nom}"; else echo "ECHEC  ${nom}"; ECHECS=$((ECHECS + 1)); fi
}
attendre() {   # attendre <nom> <0|non0> <fragment ou vide> <arguments du script…> ; sortie dans ${SORTIE}
  local nom="$1" attendu="$2" fragment="$3"; shift 3
  local code
  SORTIE="$("${SCRIPT}" "$@" 2>&1)"; code=$?
  TOTAL=$((TOTAL + 1))
  if [[ "${attendu}" == "0" && "${code}" -ne 0 ]] || [[ "${attendu}" == "non0" && "${code}" -eq 0 ]]; then
    echo "ECHEC  ${nom} : code ${code}, attendu ${attendu}"; echo "${SORTIE}" | tail -n 15 | sed 's/^/         /'; ECHECS=$((ECHECS + 1)); return
  fi
  if [[ -n "${fragment}" && "${SORTIE}" != *"${fragment}"* ]]; then
    echo "ECHEC  ${nom} : sortie sans « ${fragment} »"; echo "${SORTIE}" | tail -n 15 | sed 's/^/         /'; ECHECS=$((ECHECS + 1)); return
  fi
  echo "OK     ${nom} (code ${code})"
}

for p in "${PORT_HTTP}" "${PORT_PG}"; do
  if ss -ltnH "sport = :${p}" | grep -q .; then echo "ERREUR : port d'essai ${p} occupé"; exit 1; fi
done
for c in "${RACINE}"/paperclip/node_modules/.pnpm/@embedded-postgres+linux-x64@*/node_modules/@embedded-postgres/linux-x64/native/bin /usr/lib/postgresql/*/bin; do
  if [[ -x "${c}/initdb" && -x "${c}/pg_ctl" ]]; then BIN_PG="${c}"; break; fi
done
[[ -n "${BIN_PG}" ]] || { echo "ERREUR : initdb introuvable (lancer scripts/preparer-socle.sh)"; exit 1; }

# Source synthétique : fichiers uniques et une sauvegarde de base au format de Paperclip (SQL compressé).
SRC="${TMP}/source"; B="${SRC}/instance/instances/atelier"
mkdir -p "${B}/data/backups" "${B}/secrets" "${B}/companies/c1" "${B}/skills/s1" \
         "${SRC}/instance/cles" "${SRC}/instance/secrets" "${SRC}/instance/passerelles" "${SRC}/instance/plugin-jb" \
         "${SRC}/instance/demo-reel" "${SRC}/instance/claude-config/ag" "${SRC}/passerelle/etat"
cat > "${B}/config.json" <<EOF
{"server": {"port": ${PORT_HTTP}}, "database": {"embeddedPostgresPort": ${PORT_PG}}}
EOF
echo cle > "${B}/secrets/master.key"; echo "JWT=x" > "${B}/.env"
echo "doc d'origine" > "${B}/companies/c1/AGENTS.md"; echo skill > "${B}/skills/s1/SKILL.md"
echo k > "${SRC}/instance/cles/a.pem"; echo s > "${SRC}/instance/secrets/b.txt"; echo p > "${SRC}/instance/passerelles/3190.env"
echo "plugin origine" > "${SRC}/instance/plugin-jb/m.js"; echo d > "${SRC}/instance/demo-reel/d.json"
ln -s demo-reel "${SRC}/instance/demo-client"; echo mem > "${SRC}/instance/claude-config/ag/MEMORY.md"
echo i > "${SRC}/passerelle/etat/index.db"
gzip > "${B}/data/backups/paperclip-20261030-030000.sql.gz" <<'SQL'
BEGIN;
CREATE TABLE public.companies (id int PRIMARY KEY, name text);
CREATE TABLE public.agents (id int PRIMARY KEY, company_id int, status text, pause_reason text, paused_at timestamptz, updated_at timestamptz);
INSERT INTO public.companies VALUES (1, 'a'), (2, 'b');
INSERT INTO public.agents VALUES (1, 1, 'idle', NULL, NULL, now()), (2, 1, 'paused', 'manual', now(), now()), (3, 2, 'running', NULL, NULL, now());
COMMIT;
SQL
touch -d '2 hours ago' "${B}/data/backups/paperclip-20261030-030000.sql.gz"
mkdir -p "${TMP}/copies"
"${RACINE}/scripts/sauvegarde-hors-machine.sh" "${TMP}/copies" --source "${SRC}" --meme-disque --conteneurs '' \
  --phoenix "${TMP}/absent" --pages "${TMP}/absent/pages.sqlite" --manuel --sans-chiffrement >/dev/null 2>&1 \
  || { echo "ERREUR : la sauvegarde de la source synthétique a échoué"; exit 1; }
COPIE="$(find "${TMP}/copies" -mindepth 1 -maxdepth 1 -type d -name 'manuel-*' | head -n 1)"
[[ -n "${COPIE}" ]] || { echo "ERREUR : copie introuvable"; exit 1; }

# Cible : instance existante, abîmée (sinistre simulé), qui doit être mise de côté et non supprimée.
C="${TMP}/cible"; I="${C}/instance/instances/atelier"
mkdir -p "${I}/companies/c1" "${I}/db" "${C}/instance/plugin-jb"
echo "abîmé" > "${I}/companies/c1/AGENTS.md"; echo "base abîmée" > "${I}/db/PG_VERSION"
# Taille différente de l'original : rsync saute un fichier de même taille et de même seconde de modification (test intermittent sinon).
echo "plugin abîmé par une coupure" > "${C}/instance/plugin-jb/m.js"

attendre "mauvais usage : copie absente"                    non0 "Usage"              --racine "${C}"
attendre "copie inexistante refusée"                        non0 "introuvable"        "${TMP}/nulle-part" --racine "${C}"
# À blanc par défaut : rien n'est écrit.
attendre "à blanc par défaut : liste ce qui serait restauré" 0    "--confirmer"        "${COPIE}" --racine "${C}"
verifie  "à blanc : instance abîmée intacte"                 grep -q "abîmé" "${I}/companies/c1/AGENTS.md"
verifie  "à blanc : aucune copie de côté"                    bash -c '! compgen -G "$1.avant-restauration-*"' _ "${I}"
# Copie chiffrée (AFD-M4) : clé gpg jetable dans un GNUPGHOME temporaire ; lue à blanc sans rien laisser en clair.
export GNUPGHOME="${TMP}/gnupg"; mkdir -m 700 "${GNUPGHOME}"
gpg --batch --quiet --pinentry-mode loopback --passphrase '' --quick-generate-key "essai-restauration <essai@example.invalid>" default default never >/dev/null 2>&1 \
  && gpg --batch --armor --export essai-restauration > "${TMP}/destinataire.asc" 2>/dev/null
# La copie chiffrée est fabriquée avec la clé jetable : empreinte réglée pour elle (B-8), clair préparé dans un cache jetable (M-2).
export ATELIER_SAUVEGARDE_EMPREINTE="$(gpg --batch --with-colons --show-keys "${TMP}/destinataire.asc" 2>/dev/null | awk -F: '$1=="fpr"{print $10; exit}')"
export XDG_CACHE_HOME="${TMP}/cache"
mkdir -p "${TMP}/copies-chiffrees"
ATELIER_SAUVEGARDE_CLE="${TMP}/destinataire.asc" "${RACINE}/scripts/sauvegarde-hors-machine.sh" "${TMP}/copies-chiffrees" --source "${SRC}" --meme-disque --conteneurs '' \
  --phoenix "${TMP}/absent" --pages "${TMP}/absent/pages.sqlite" --manuel >/dev/null 2>&1
COPIE_CH="$(find "${TMP}/copies-chiffrees" -mindepth 1 -maxdepth 1 -type d -name 'manuel-*' 2>/dev/null | head -n 1)"
verifie  "copie chiffrée fabriquée (copie.tar.gpg)"          test -f "${COPIE_CH}/copie.tar.gpg"
# B-4 : le clair déchiffré va sous « instance/ » de la racine cible (ignoré par git), jamais à la racine ; une doublure de tar
# note le dossier où le clair est extrait.
mkdir -p "${TMP}/espion"
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$@" >> "${ESPION}/tar-args"\nexec /usr/bin/tar "$@"\n' > "${TMP}/espion/tar"; chmod +x "${TMP}/espion/tar"
ESPION="${TMP}/espion" PATH="${TMP}/espion:${PATH}" attendre "copie chiffrée : à blanc, déchiffrée et contrôlée" 0    "--confirmer"        "${COPIE_CH}" --racine "${C}"
verifie  "copie chiffrée : clair extrait sous instance/ de la racine" grep -q "^${C}/instance/\.restaurer-dechiffre-" "${TMP}/espion/tar-args"
verifie  "git ignore le dossier de déchiffrement à la racine du dépôt" git -C "${RACINE}" check-ignore -q .restaurer-dechiffre-abc123/dump.sql
verifie  "copie chiffrée : aucun déchiffrement laissé"       bash -c '! compgen -G "$1/.restaurer-dechiffre-*" && ! compgen -G "$1/instance/.restaurer-dechiffre-*" && [[ -z "$(ls -A "$2")" || "$(ls -A "$2")" == "$(basename "$3")" ]]' _ "${C}" "${TMP}/copies-chiffrees" "${COPIE_CH}"
GNUPGHOME="${TMP}/gnupg-vide" attendre "copie chiffrée sans clé privée refusée" non0 "déchiffrement impossible" "${COPIE_CH}" --racine "${C}"
verifie  "copie chiffrée refusée : aucun reste en clair"     bash -c '! compgen -G "$1/.restaurer-dechiffre-*"' _ "${C}"
# Copie altérée : refus avant toute écriture.
echo "falsifié" >> "${COPIE}/instance/instances/atelier/companies/c1/AGENTS.md"
attendre "copie altérée refusée (empreintes)"               non0 "empreinte"          "${COPIE}" --racine "${C}" --confirmer
verifie  "copie altérée : instance abîmée intacte"           grep -q "abîmé" "${I}/companies/c1/AGENTS.md"
sed -i '$d' "${COPIE}/instance/instances/atelier/companies/c1/AGENTS.md"
# Port PostgreSQL occupé : l'instance tourne encore, refus.
python3 -I -c 'import socket,time,sys; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(("127.0.0.1", int(sys.argv[1]))); s.listen(); time.sleep(20)' "${PORT_PG}" &
OCCUPANT=$!
until ss -ltnH "sport = :${PORT_PG}" | grep -q .; do sleep 0.2; done
attendre "instance en marche (port occupé) refusée"         non0 "arrêter"            "${COPIE}" --racine "${C}" --confirmer
kill "${OCCUPANT}" 2>/dev/null; wait "${OCCUPANT}" 2>/dev/null
until ! ss -ltnH "sport = :${PORT_PG}" | grep -q .; do sleep 0.2; done

# Restauration réelle dans la cible factice.
attendre "restauration confirmée"                           0    "Base restaurée"     "${COPIE}" --racine "${C}" --confirmer
verifie  "fichiers de l'instance restaurés"                  grep -qx "doc d'origine" "${I}/companies/c1/AGENTS.md"
verifie  "master.key et .env restaurés (600)"                bash -c '[[ "$(stat -c %a "$1/secrets/master.key")" == 600 && "$(stat -c %a "$1/.env")" == 600 ]]' _ "${I}"
verifie  "skills restaurés"                                  test -f "${I}/skills/s1/SKILL.md"
verifie  "sauvegarde de base remise dans data/backups"      test -f "${I}/data/backups/paperclip-20261030-030000.sql.gz"
verifie  "ancienne instance mise de côté, pas supprimée"     bash -c 'grep -q "abîmé" "$1".avant-restauration-*/companies/c1/AGENTS.md' _ "${I}"
verifie  "plugin restauré, ancien gardé avec suffixe"        bash -c 'grep -qx "plugin origine" "$1/m.js" && compgen -G "$1/m.js.avant-restauration-*"' _ "${C}/instance/plugin-jb"
verifie  "mémoire des agents restaurée"                      test -f "${C}/instance/claude-config/ag/MEMORY.md"
verifie  "état de la passerelle restauré"                    test -f "${C}/passerelle/etat/index.db"
verifie  "lien demo-client recréé"                           bash -c '[[ "$(readlink "$1")" == demo-reel ]]' _ "${C}/instance/demo-client"
verifie  "contenu pointé par demo-client restauré"           test -f "${C}/instance/demo-reel/d.json"
verifie  "PostgreSQL arrêté après la restauration"           bash -c '! ss -ltnH "sport = :$1" | grep -q .' _ "${PORT_PG}"
[[ "${SORTIE}" == *"2 entreprise(s), 3 agent(s)"* ]] && r=0 || r=1
verifie  "comptages affichés"                                test "${r}" -eq 0
[[ "${SORTIE}" == *"2 agent(s) mis en PAUSE"* ]] && r=0 || r=1
verifie  "agents actifs mis en pause (aucun réveil seul)"    test "${r}" -eq 0
[[ "${SORTIE}" == *"systemctl --user start atelier-instance@atelier"* ]] && r=0 || r=1
verifie  "suite à faire : relance par systemd"               test "${r}" -eq 0

# Base réellement restaurée : on la relit avec le même PostgreSQL.
"${BIN_PG}/pg_ctl" -D "${I}/db" -w -l "${TMP}/pg.log" -o "-p ${PORT_PG} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${TMP}" start >/dev/null 2>&1
ACTIFS="$(PGPASSWORD=paperclip psql -X -At -h 127.0.0.1 -p "${PORT_PG}" -U paperclip -d paperclip -c "SELECT count(*) FROM public.agents WHERE status <> 'paused'" 2>/dev/null)"
"${BIN_PG}/pg_ctl" -D "${I}/db" -m fast -w stop >/dev/null 2>&1
verifie  "base relue : 0 agent actif"                        test "${ACTIFS}" = "0"

# Deuxième restauration sans rien changer : l'instance restaurée est à son tour mise de côté, jamais écrasée.
sleep 1
attendre "restauration répétée"                             0    "Base restaurée"     "${COPIE}" --racine "${C}" --confirmer
verifie  "deux copies de côté distinctes"                    bash -c '[[ $(compgen -G "$1.avant-restauration-*" | wc -l) -eq 2 ]]' _ "${I}"

echo "---"; echo "${TOTAL} tests, ${ECHECS} échec(s)"
[[ "${ECHECS}" -eq 0 ]]

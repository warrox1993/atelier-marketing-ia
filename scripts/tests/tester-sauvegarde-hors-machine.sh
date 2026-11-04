#!/usr/bin/env bash
# Tests de scripts/sauvegarde-hors-machine.sh sur une arborescence factice (aucune instance réelle touchée).
# Usage : scripts/tests/tester-sauvegarde-hors-machine.sh   (code 0 si tout passe)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${RACINE}/scripts/sauvegarde-hors-machine.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/sauvegarde-test-XXXXXX")" || exit 1
trap 'rm -rf "${TMP}"' EXIT
ECHECS=0; TOTAL=0
export XDG_CACHE_HOME="${TMP}/cache"   # dossier de préparation du clair (M-2) : jamais le vrai ~/.cache
PREPARATION="${XDG_CACHE_HOME}/atelier-sauvegarde"

# attendre <nom> <code attendu : 0|non0> <fragment attendu dans la sortie, ou vide> <arguments du script…>
attendre() {
  local nom="$1" attendu="$2" fragment="$3"; shift 3
  local sortie code
  sortie="$("${SCRIPT}" "$@" 2>&1)"; code=$?
  TOTAL=$((TOTAL + 1))
  if [[ "${attendu}" == "0" && "${code}" -ne 0 ]] || [[ "${attendu}" == "non0" && "${code}" -eq 0 ]] \
     || [[ "${attendu}" =~ ^[1-9]$ && "${code}" -ne "${attendu}" ]]; then
    echo "ECHEC  ${nom} : code ${code}, attendu ${attendu}"; echo "${sortie}" | sed 's/^/         /'; ECHECS=$((ECHECS + 1)); return
  fi
  if [[ -n "${fragment}" && "${sortie}" != *"${fragment}"* ]]; then
    echo "ECHEC  ${nom} : message sans « ${fragment} »"; echo "${sortie}" | sed 's/^/         /'; ECHECS=$((ECHECS + 1)); return
  fi
  echo "OK     ${nom} (code ${code})"
}

verifie() {   # verifie <nom> <commande…> : réussit si la commande réussit
  local nom="$1"; shift
  TOTAL=$((TOTAL + 1))
  if "$@" >/dev/null 2>&1; then echo "OK     ${nom}"; else echo "ECHEC  ${nom}"; ECHECS=$((ECHECS + 1)); fi
}

# Arborescence factice : deux instances, éléments uniques.
fabriquer() {
  local s="$1" id
  for id in atelier atelier-essai; do
    local b="${s}/instance/instances/${id}"
    mkdir -p "${b}/data/backups" "${b}/secrets" "${b}/companies/c1" "${b}/data/storage" "${b}/db"
    echo "ancienne" | gzip > "${b}/data/backups/paperclip-20260101-000000.sql.gz"
    echo "recente ${id}" | gzip > "${b}/data/backups/paperclip-20260102-000000.sql.gz"
    # Dates de modification anciennes : le script ignore les dumps modifiés il y a moins de 60 s.
    touch -d '3 hours ago' "${b}/data/backups/paperclip-20260101-000000.sql.gz"
    touch -d '2 hours ago' "${b}/data/backups/paperclip-20260102-000000.sql.gz"
    echo "cle-${id}" > "${b}/secrets/master.key"
    echo "doc" > "${b}/companies/c1/doc.md"
    echo "piece" > "${b}/data/storage/p.bin"
    echo "VIVANTE" > "${b}/db/base-vivante"
    mkdir -p "${b}/skills/s1" "${b}/projects/p1" "${b}/data/run-logs/r1"
    echo skill > "${b}/skills/s1/SKILL.md"; echo espace > "${b}/projects/p1/note.md"; echo run > "${b}/data/run-logs/r1/run.ndjson"
  done
  mkdir -p "${s}/instance/claude-config/agent1/memoire" "${s}/instance/agents-atelier/veille" "${s}/instance/atelier-client" "${s}/instance/atelier-demo"
  echo mem > "${s}/instance/claude-config/agent1/memoire/MEMORY.md"; echo esp > "${s}/instance/agents-atelier/veille/x.md"
  echo cli > "${s}/instance/atelier-client/c.json"; echo '{}' > "${s}/instance/atelier-demo/etat-bootstrap.json"
  mkdir -p "${s}/instance/cles" "${s}/instance/secrets" "${s}/instance/passerelles" \
           "${s}/instance/plugin-jb" "${s}/instance/demo-reel" "${s}/passerelle/etat"
  echo k > "${s}/instance/cles/a.pem"; echo s > "${s}/instance/secrets/b.txt"; echo p > "${s}/instance/passerelles/p.env"
  echo j > "${s}/instance/plugin-jb/m.js"
  echo d > "${s}/instance/demo-reel/d.json"; ln -s demo-reel "${s}/instance/demo-client"
  echo i > "${s}/passerelle/etat/index.db"
}

SRC="${TMP}/source"; DST="${TMP}/dest"; mkdir -p "${SRC}" "${DST}"; fabriquer "${SRC}"
PHX_ABSENT="${TMP}/phoenix-absent"   # les tests existants ne doivent jamais toucher le vrai Phoenix
# Ni les vraies pages ni les vrais conteneurs : pages absentes et aucun conteneur par défaut dans les tests.
COMMUN_BASE=(--source "${SRC}" --meme-disque --instances "atelier,atelier-essai" --phoenix "${PHX_ABSENT}" --pages "${TMP}/pages-absent.sqlite" --conteneurs "")
# Les cas historiques lisent la copie en clair : copie non chiffrée demandée explicitement. Le chiffrement a ses cas (section 10).
COMMUN=("${COMMUN_BASE[@]}" --sans-chiffrement)

# 1. Copie complète et empreintes identiques.
attendre "copie complète" 0 "empreintes vérifiées" "${DST}" "${COMMUN[@]}"
COPIE="$(find "${DST}" -mindepth 1 -maxdepth 1 -type d -name 'atelier-*' | head -n 1)"
verifie "dossier daté en 0700"                  test "$(stat -c %a "${COPIE}")" = "700"
verifie "EMPREINTES.sha256 présent"              test -s "${COPIE}/EMPREINTES.sha256"
verifie "contrôle sha256sum -c sur la copie"     bash -c "cd '${COPIE}' && sha256sum -c --quiet EMPREINTES.sha256"
verifie "--verifier accepte la copie"            "${SCRIPT}" --verifier "${COPIE}"
verifie "dernière sauvegarde copiée"             test -f "${COPIE}/instance/instances/atelier/data/backups/paperclip-20260102-000000.sql.gz"
verifie "ancienne sauvegarde non copiée"         test ! -e "${COPIE}/instance/instances/atelier/data/backups/paperclip-20260101-000000.sql.gz"
verifie "master.key copiée"                      cmp "${SRC}/instance/instances/atelier-essai/secrets/master.key" "${COPIE}/instance/instances/atelier-essai/secrets/master.key"
verifie "base vivante db/ non copiée"            test ! -e "${COPIE}/instance/instances/atelier/db"
verifie "data/storage et companies copiés"       test -f "${COPIE}/instance/instances/atelier/data/storage/p.bin" -a -f "${COPIE}/instance/instances/atelier/companies/c1/doc.md"
verifie "demo-client suivi (contenu copié)"      test -f "${COPIE}/instance/demo-client/d.json"
verifie "passerelle/etat et plugins copiés"      test -f "${COPIE}/passerelle/etat/index.db" -a -f "${COPIE}/instance/plugin-jb/m.js"
verifie "skills, projects, run-logs copiés"      test -f "${COPIE}/instance/instances/atelier/skills/s1/SKILL.md" -a -f "${COPIE}/instance/instances/atelier-essai/projects/p1/note.md" -a -f "${COPIE}/instance/instances/atelier/data/run-logs/r1/run.ndjson"
verifie "mémoire des agents copiée"              test -f "${COPIE}/instance/claude-config/agent1/memoire/MEMORY.md"
verifie "espaces et état du bootstrap copiés"    test -f "${COPIE}/instance/agents-atelier/veille/x.md" -a -f "${COPIE}/instance/atelier-client/c.json" -a -f "${COPIE}/instance/atelier-demo/etat-bootstrap.json"
verifie "mémoire des agents dans les empreintes" grep -q ' \./instance/claude-config/agent1/memoire/MEMORY.md$' "${COPIE}/EMPREINTES.sha256"

# 2. Empreinte altérée → non nul.
echo "altéré" >> "${COPIE}/instance/cles/a.pem"
attendre "empreinte altérée détectée" non0 "empreinte différente" --verifier "${COPIE}"

# 3. Élément obligatoire manquant → non nul (et rien n'est créé).
AVANT="$(find "${DST}" -mindepth 1 -maxdepth 1 | wc -l)"
mv "${SRC}/instance/instances/atelier/secrets/master.key" "${TMP}/master.key.sauve"
attendre "master.key manquante"             non0 "master.key" "${DST}" "${COMMUN[@]}"
mv "${TMP}/master.key.sauve" "${SRC}/instance/instances/atelier/secrets/master.key"
mv "${SRC}/passerelle/etat" "${TMP}/etat.sauve"
attendre "passerelle/etat manquant"         non0 "passerelle/etat" "${DST}" "${COMMUN[@]}"
mv "${TMP}/etat.sauve" "${SRC}/passerelle/etat"
mv "${SRC}/instance/instances/atelier-essai/data/backups" "${TMP}/backups.sauve"
attendre "aucune sauvegarde de base"        non0 "aucune sauvegarde de base" "${DST}" "${COMMUN[@]}"
mv "${TMP}/backups.sauve" "${SRC}/instance/instances/atelier-essai/data/backups"
verifie "aucune copie créée en cas d'échec"  test "$(find "${DST}" -mindepth 1 -maxdepth 1 | wc -l)" = "${AVANT}"

# 3 bis. Dumps : choix par date de modification, jamais un dump en cours d'écriture.
BK="${SRC}/instance/instances/atelier-essai/data/backups"
# a) dump récent (< 60 s) tronqué = écriture en cours : ignoré, repli sur le dernier dump complet.
head -c 10 "${BK}/paperclip-20260102-000000.sql.gz" > "${BK}/paperclip-20260103-000000.sql.gz"
D6="${TMP}/dest-dump-en-cours"; mkdir -p "${D6}"
attendre "dump en cours d'écriture ignoré" 0 "paperclip-20260102-000000.sql.gz" "${D6}" "${COMMUN[@]}"
C6="$(find "${D6}" -mindepth 1 -maxdepth 1 -type d -name 'atelier-*' | head -n 1)"
verifie "dump en cours : le dump complet est copié"  test -f "${C6}/instance/instances/atelier-essai/data/backups/paperclip-20260102-000000.sql.gz"
verifie "dump en cours : le dump tronqué n'est pas copié" test ! -e "${C6}/instance/instances/atelier-essai/data/backups/paperclip-20260103-000000.sql.gz"
rm -f "${BK}/paperclip-20260103-000000.sql.gz"
# b) « paperclip-transfert-… » ancien ne doit pas passer devant un dump plus récent (tri par nom piégeux).
cp "${BK}/paperclip-20260101-000000.sql.gz" "${BK}/paperclip-transfert-20251231.sql.gz"
touch -d '5 hours ago' "${BK}/paperclip-transfert-20251231.sql.gz"
D7="${TMP}/dest-tri-date"; mkdir -p "${D7}"
attendre "tri par date de modification" 0 "paperclip-20260102-000000.sql.gz" "${D7}" "${COMMUN[@]}"
C7="$(find "${D7}" -mindepth 1 -maxdepth 1 -type d -name 'atelier-*' | head -n 1)"
verifie "tri par date : transfert ancien non copié"  test ! -e "${C7}/instance/instances/atelier-essai/data/backups/paperclip-transfert-20251231.sql.gz"
rm -f "${BK}/paperclip-transfert-20251231.sql.gz"
# b bis) dernier dump terminé mais corrompu (> 60 s) : l'ancien valide est copié, mais la sortie est non nulle (alerte).
head -c 10 "${BK}/paperclip-20260102-000000.sql.gz" > "${BK}/paperclip-20260103-000000.sql.gz"
touch -d '10 minutes ago' "${BK}/paperclip-20260103-000000.sql.gz"
D8="${TMP}/dest-dump-corrompu"; mkdir -p "${D8}"
attendre "dernier dump corrompu signalé" non0 "plus ancien" "${D8}" "${COMMUN[@]}"
C8="$(find "${D8}" -mindepth 1 -maxdepth 1 -type d -name 'atelier-*' | head -n 1)"
verifie "dump corrompu : copie faite avec le dump valide" test -f "${C8}/instance/instances/atelier-essai/data/backups/paperclip-20260102-000000.sql.gz"
rm -f "${BK}/paperclip-20260103-000000.sql.gz"
# c) aucun dump valide : échec clair.
mkdir -p "${TMP}/bk-valides"; mv "${BK}"/*.sql.gz "${TMP}/bk-valides/"
head -c 10 "${TMP}/bk-valides/paperclip-20260102-000000.sql.gz" > "${BK}/paperclip-20260102-000000.sql.gz"
touch -d '2 hours ago' "${BK}/paperclip-20260102-000000.sql.gz"
attendre "aucun dump valide" non0 "aucun dump valide" "${DST}" "${COMMUN[@]}"
rm -f "${BK}"/*.sql.gz; mv "${TMP}/bk-valides"/*.sql.gz "${BK}/"

# 4. Destination absente ; argument inconnu ; --garder invalide.
attendre "destination inexistante"          non0 "n'existe pas" "${TMP}/absent" "${COMMUN[@]}"
attendre "--garder invalide"                non0 "--garder" "${DST}" "${COMMUN[@]}" --garder 0

# 5. Même disque refusé (sans --meme-disque).
attendre "même disque refusé"               non0 "même disque" "${DST}" --source "${SRC}"

# 6. Mode essai : rien n'est copié.
D2="${TMP}/dest-essai"; mkdir -p "${D2}"
attendre "essai : affiche sans copier"     0    "ESSAI" "${D2}" "${COMMUN[@]}" --essai
verifie "essai : destination vide"          test -z "$(ls -A "${D2}")"

# 7. Rotation : 3 copies anciennes factices + la nouvelle, garder 2.
D3="${TMP}/dest-rotation"; mkdir -p "${D3}"
for n in 20250101-0100 20250102-0100 20250103-0100; do
  mkdir -p "${D3}/atelier-${n}"; echo x > "${D3}/atelier-${n}/EMPREINTES.sha256"
done
mkdir -p "${D3}/autre-dossier"
attendre "rotation (garder 2)"              0    "Rotation" "${D3}" "${COMMUN[@]}" --garder 2
verifie "rotation : 2 copies restantes"      test "$(find "${D3}" -maxdepth 1 -type d -name 'atelier-*' | wc -l)" = "2"
verifie "rotation : la plus récente gardée"  test -f "${D3}/atelier-20250103-0100/EMPREINTES.sha256"
verifie "rotation : les plus anciennes supprimées" test ! -e "${D3}/atelier-20250101-0100" -a ! -e "${D3}/atelier-20250102-0100"
verifie "rotation : dossier étranger intact" test -d "${D3}/autre-dossier"

# 8. Phoenix : base SQLite factice en mode WAL, avec une écriture en cours pendant la sauvegarde.
PHX="${TMP}/phoenix-donnees"; D4="${TMP}/dest-phoenix"; mkdir -p "${PHX}" "${D4}"
python3 -I -c '
import os, sqlite3, subprocess, sys
base, script, source, dest = sys.argv[1:5]
c = sqlite3.connect(os.path.join(base, "phoenix.db"), isolation_level=None)
c.execute("PRAGMA journal_mode=WAL"); c.execute("PRAGMA wal_autocheckpoint=0")
c.execute("CREATE TABLE traces (id INTEGER PRIMARY KEY, v TEXT)")
for i in range(200):
    c.execute("INSERT INTO traces (v) VALUES (?)", ("validee-%d" % i,))
# Écriture en cours : transaction ouverte et non validée pendant toute la sauvegarde.
c.execute("BEGIN"); c.execute("INSERT INTO traces (v) VALUES (?)", ("EN-COURS",))
assert os.path.getsize(os.path.join(base, "phoenix.db-wal")) > 0, "les écritures validées doivent être dans le WAL"
r = subprocess.run([script, dest, "--source", source, "--meme-disque", "--instances", "atelier,atelier-essai", "--phoenix", base,
                    "--pages", os.path.join(base, "pages-absent.sqlite"), "--conteneurs", "", "--sans-chiffrement"],
                   capture_output=True, text=True)
sys.stdout.write(r.stdout + r.stderr)
c.execute("ROLLBACK")
sys.exit(r.returncode)
' "${PHX}" "${SCRIPT}" "${SRC}" "${D4}" > "${TMP}/phx.sortie" 2>&1
CODE_PHX=$?
TOTAL=$((TOTAL + 1))
if [[ "${CODE_PHX}" -eq 0 ]]; then
  echo "OK     sauvegarde avec base Phoenix WAL en écriture (code 0)"
else
  echo "ECHEC  sauvegarde Phoenix (code ${CODE_PHX})"; sed 's/^/         /' "${TMP}/phx.sortie"; ECHECS=$((ECHECS + 1))
fi
COPIE_PHX="$(find "${D4}" -mindepth 1 -maxdepth 1 -type d -name 'atelier-*' | head -n 1)"
requete() { python3 -I -c 'import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute(sys.argv[2]).fetchone()[0])' "${COPIE_PHX}/phoenix/phoenix.db" "$1"; }
verifie "Phoenix : base copiée dans la sauvegarde"    test -s "${COPIE_PHX}/phoenix/phoenix.db"
verifie "Phoenix : aucun fichier temporaire ni -wal"  test -z "$(find "${COPIE_PHX}/phoenix" -name '.*' -o -name '*-wal' -o -name '*-shm')"
verifie "Phoenix : copie cohérente (integrity_check)" test "$(requete 'PRAGMA integrity_check')" = "ok"
verifie "Phoenix : écritures validées présentes (200)" test "$(requete "SELECT count(*) FROM traces WHERE v LIKE 'validee-%'")" = "200"
verifie "Phoenix : écriture non validée absente"      test "$(requete "SELECT count(*) FROM traces WHERE v='EN-COURS'")" = "0"
verifie "Phoenix : empreinte de la base contrôlée"    grep -q ' \./phoenix/phoenix.db$' "${COPIE_PHX}/EMPREINTES.sha256"
verifie "Phoenix : --verifier accepte la copie"       "${SCRIPT}" --verifier "${COPIE_PHX}"

# 8 bis. Pages (preuves de consentement) : copie SQLite cohérente.
PG="${TMP}/pages.sqlite"; D9="${TMP}/dest-pages"; mkdir -p "${D9}"
python3 -I -c 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute("CREATE TABLE consentements (id INTEGER)"); c.executemany("INSERT INTO consentements VALUES (?)", [(i,) for i in range(7)]); c.commit()' "${PG}"
attendre "pages : base copiée" 0 "Pages : base copiée" "${D9}" "${COMMUN[@]}" --pages "${PG}"
C9="$(find "${D9}" -mindepth 1 -maxdepth 1 -type d -name 'atelier-*' | head -n 1)"
verifie "pages : 7 consentements dans la copie" test "$(python3 -I -c 'import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute("SELECT count(*) FROM consentements").fetchone()[0])' "${C9}/pages/pages.sqlite")" = "7"

# 8 ter. Bases des conteneurs : pg_dump dans le conteneur en marche (podman remplacé par une doublure).
FAUX="${TMP}/faux-bin"; mkdir -p "${FAUX}"
cat > "${FAUX}/podman" <<'DOUBLURE'
#!/usr/bin/env bash
case "$1 $2" in
  "container inspect") [[ "${!#}" == arrete ]] && echo false || echo true ;;
  "exec "*) echo "DUMP ${!#} depuis $2" ;;
  *) exit 9 ;;
esac
DOUBLURE
chmod +x "${FAUX}/podman"
D10="${TMP}/dest-conteneurs"; mkdir -p "${D10}"
PATH="${FAUX}:${PATH}" attendre "conteneurs : dumps logiques" 0 "base listmonk copiée" "${D10}" "${COMMUN[@]}" --conteneurs "emailing:listmonk,arrete:umami"
C10="$(find "${D10}" -mindepth 1 -maxdepth 1 -type d -name 'atelier-*' | head -n 1)"
verifie "conteneurs : dump listmonk pris dans le conteneur" grep -qx "DUMP listmonk depuis emailing" "${C10}/conteneurs/listmonk.dump"
verifie "conteneurs : conteneur arrêté sans dump"   test ! -e "${C10}/conteneurs/umami.dump"
attendre "conteneurs : forme invalide refusée" non0 "conteneur:base" "${D10}" "${COMMUN[@]}" --conteneurs "x;rm"

# 8 quater. Élément facultatif absent : signalé, la sauvegarde continue.
mv "${SRC}/instance/claude-config" "${TMP}/claude-config.sauve"
D11="${TMP}/dest-sans-memoire"; mkdir -p "${D11}"
attendre "mémoire absente : signalée, copie faite" 0 "instance/claude-config absent" "${D11}" "${COMMUN[@]}"
mv "${TMP}/claude-config.sauve" "${SRC}/instance/claude-config"

# 8 quinquies. Copie manuelle : hors rotation, elle ne chasse aucune copie quotidienne.
D12="${TMP}/dest-manuel"; mkdir -p "${D12}"
for n in 20250101-0100 20250102-0100; do mkdir -p "${D12}/atelier-${n}"; echo x > "${D12}/atelier-${n}/EMPREINTES.sha256"; done
attendre "copie manuelle" 0 "manuel-" "${D12}" "${COMMUN[@]}" --manuel --garder 2
verifie "manuelle : les 2 quotidiennes restent" test -d "${D12}/atelier-20250101-0100" -a -d "${D12}/atelier-20250102-0100"
verifie "manuelle : copie manuel-* créée et vérifiable" "${SCRIPT}" --verifier "$(find "${D12}" -mindepth 1 -maxdepth 1 -type d -name 'manuel-*' | head -n 1)"

# 9. Dossier Phoenix absent : message clair, la sauvegarde réussit quand même, sans dossier phoenix/.
D5="${TMP}/dest-sans-phoenix"; mkdir -p "${D5}"
attendre "Phoenix absent : la sauvegarde continue" 0 "données Phoenix non sauvegardées" "${D5}" "${COMMUN[@]}"
verifie "Phoenix absent : pas de dossier phoenix/"    test ! -e "$(find "${D5}" -mindepth 1 -maxdepth 1 -type d -name 'atelier-*' | head -n 1)/phoenix"

# 10. Chiffrement gpg de la copie (AFD-M4) : clé jetable dans un GNUPGHOME temporaire, jamais le trousseau de l'opérateur.
export GNUPGHOME="${TMP}/gnupg"; mkdir -m 700 "${GNUPGHOME}"
CLE_PUB="${TMP}/destinataire.asc"
gpg --batch --quiet --pinentry-mode loopback --passphrase '' --quick-generate-key "essai-sauvegarde <essai@example.invalid>" default default never >/dev/null 2>&1 \
  && gpg --batch --armor --export "essai-sauvegarde" > "${CLE_PUB}" 2>/dev/null
TOTAL=$((TOTAL + 1))
if [[ -s "${CLE_PUB}" ]]; then echo "OK     clé gpg jetable créée"; else echo "ECHEC  clé gpg jetable non créée"; ECHECS=$((ECHECS + 1)); fi
# B-8 : le script n'accepte que l'empreinte épinglée ; les tests règlent celle de la clé jetable par la variable documentée.
empreinte_de() { gpg --batch --with-colons --show-keys "$1" 2>/dev/null | awk -F: '$1=="fpr"{print $10; exit}'; }
EMPREINTE_JETABLE="$(empreinte_de "${CLE_PUB}")"
export ATELIER_SAUVEGARDE_EMPREINTE="${EMPREINTE_JETABLE}"

# 10 a. Avec la clé : 3 fichiers seulement, rien en clair, déchiffrement vérifié.
D13="${TMP}/dest-chiffre"; mkdir -p "${D13}"
ATELIER_SAUVEGARDE_CLE="${CLE_PUB}" attendre "chiffrement : copie chiffrée" 0 "chiffrée" "${D13}" "${COMMUN_BASE[@]}"
C13="$(find "${D13}" -mindepth 1 -maxdepth 1 -type d -name 'atelier-*' | head -n 1)"
verifie "chiffré : dossier daté en 0700"            test "$(stat -c %a "${C13}")" = "700"
verifie "chiffré : exactement les 3 fichiers"       test "$(ls -A "${C13}" | LC_ALL=C sort | tr '\n' ' ')" = "EMPREINTES.sha256 copie.tar.gpg copie.tar.gpg.sha256 "
verifie "chiffré : destination sans autre reste"    test "$(ls -A "${D13}" | wc -l)" = "1"
verifie "chiffré : master.key absente en clair"     bash -c "! grep -rqa 'cle-atelier' '${D13}'"
verifie "chiffré : --verifier contrôle le chiffré"  "${SCRIPT}" --verifier "${C13}"
verifie "chiffré : --verifier --dechiffrer rend 0"  "${SCRIPT}" --verifier "${C13}" --dechiffrer
verifie "chiffré : aucun reste du déchiffrement"    test "$(ls -A "${D13}" | wc -l)" = "1"
echo "altéré" >> "${C13}/copie.tar.gpg"
attendre "chiffré : altération détectée" non0 "empreinte différente" --verifier "${C13}"

# 10 b. Sans clé : copie en clair, avertissement, code 2.
D14="${TMP}/dest-sans-cle"; mkdir -p "${D14}"
ATELIER_SAUVEGARDE_CLE="${TMP}/absente.asc" attendre "sans clé : avertissement et code 2" 2 "ATTENTION : copie NON chiffrée (clé publique absente : ${TMP}/absente.asc)" "${D14}" "${COMMUN_BASE[@]}"
C14="$(find "${D14}" -mindepth 1 -maxdepth 1 -type d -name 'atelier-*' | head -n 1)"
verifie "sans clé : copie en clair vérifiable"      "${SCRIPT}" --verifier "${C14}"
verifie "sans clé : master.key en clair"            test -f "${C14}/instance/instances/atelier/secrets/master.key"

# 10 c. gpg échoue (clé corrompue) : code 1 et destination vide.
D15="${TMP}/dest-gpg-echec"; mkdir -p "${D15}"; echo "pas une clé" > "${TMP}/corrompue.asc"
ATELIER_SAUVEGARDE_CLE="${TMP}/corrompue.asc" attendre "gpg en échec : code 1" 1 "copie abandonnée" "${D15}" "${COMMUN_BASE[@]}"
verifie "gpg en échec : destination vide"           test -z "$(ls -A "${D15}")"

# 10 d. Rotation : une ancienne copie chiffrée est supprimée, la forme en clair aussi.
D16="${TMP}/dest-rotation-chiffree"; mkdir -p "${D16}"
for n in 20250101-0100 20250102-0100; do
  mkdir -p "${D16}/atelier-${n}"; echo x > "${D16}/atelier-${n}/EMPREINTES.sha256"; echo y > "${D16}/atelier-${n}/copie.tar.gpg"
done
mkdir -p "${D16}/atelier-20250103-0100"; echo x > "${D16}/atelier-20250103-0100/EMPREINTES.sha256"
ATELIER_SAUVEGARDE_CLE="${CLE_PUB}" attendre "rotation avec copies chiffrées" 0 "Rotation" "${D16}" "${COMMUN_BASE[@]}" --garder 2
verifie "rotation : anciennes copies chiffrée et claire supprimées" test ! -e "${D16}/atelier-20250101-0100" -a ! -e "${D16}/atelier-20250102-0100"
verifie "rotation : la copie chiffrée neuve est gardée" test "$(find "${D16}" -maxdepth 2 -name copie.tar.gpg | wc -l)" = "1"

# 11. M-2 : le clair n'est JAMAIS écrit sur la destination (disque non chiffré) ; il est préparé dans le cache de l'utilisateur.
# Doublures de tar (note le dossier d'extraction ou de lecture) et de gpg (note les fichiers présents sous la destination au moment
# du chiffrement, peut échouer à la demande après avoir laissé une sortie partielle).
GPG_REEL="$(command -v gpg)"; TAR_REEL="$(command -v tar)"; export GPG_REEL TAR_REEL
ESP="${TMP}/espion"; mkdir -p "${ESP}"
cat > "${ESP}/tar" <<'DOUBLURE'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${ESP}/tar-args"
exec "${TAR_REEL}" "$@"
DOUBLURE
cat > "${ESP}/gpg" <<'DOUBLURE'
#!/usr/bin/env bash
sortie=""; prev=""
for a in "$@"; do
  [[ "${prev}" == "--output" ]] && sortie="${a}"
  if [[ "${a}" == "--encrypt" || "${a}" == "--decrypt" ]]; then
    { echo "--- ${a}"; find "${ESPION_DESTINATION}" -type f; } >> "${ESP}/gpg-destination"
    if [[ "${a}" == "--encrypt" && "${ESPION_GPG_ECHEC:-0}" == 1 ]]; then
      [[ -n "${sortie}" ]] && echo "sortie partielle" > "${sortie}"
      cat > /dev/null; exit 2
    fi
  fi
  prev="${a}"
done
exec "${GPG_REEL}" "$@"
DOUBLURE
chmod +x "${ESP}/tar" "${ESP}/gpg"; export ESP
espions() { PATH="${ESP}:${PATH}" ESPION_DESTINATION="$1" "${@:2}"; }

# 11 a. Copie chiffrée : aucun fichier sous la destination pendant le chiffrement, clair préparé dans le cache, cache vidé après.
D17="${TMP}/dest-clair-cache"; mkdir -p "${D17}"; : > "${ESP}/tar-args"; : > "${ESP}/gpg-destination"
mkdir -p -m 0700 "${PREPARATION}/.atelier-20250101-0000.en-cours" "${PREPARATION}/.atelier-20250102-0000.en-cours"
echo reste > "${PREPARATION}/.atelier-20250101-0000.en-cours/clair"; echo recent > "${PREPARATION}/.atelier-20250102-0000.en-cours/clair"
touch -d '2 days ago' "${PREPARATION}/.atelier-20250101-0000.en-cours"
ESPION_DESTINATION="${D17}" PATH="${ESP}:${PATH}" ATELIER_SAUVEGARDE_CLE="${CLE_PUB}" attendre "M-2 : copie chiffrée avec espions" 0 "chiffrée" "${D17}" "${COMMUN_BASE[@]}"
verifie "M-2 : gpg a bien chiffré une fois"                       test "$(grep -c '^--- --encrypt$' "${ESP}/gpg-destination")" = "1"
verifie "M-2 : aucun fichier sous la destination pendant gpg"     test "$(grep -vc '^---' "${ESP}/gpg-destination")" = "0"
verifie "M-2 : le clair est lu dans le cache de préparation"      grep -qF -- "-C ${PREPARATION}/.atelier-" "${ESP}/tar-args"
verifie "M-2 : le clair n'est jamais lu sous la destination"      bash -c '! grep -qF -- "$1" "$2"' _ "${D17}" "${ESP}/tar-args"
verifie "M-2 : destination = 3 fichiers chiffrés seulement"       test "$(find "${D17}" -type f | wc -l)" = "3"
verifie "M-2 : reste périmé du cache supprimé, récent conservé"    bash -c '[[ ! -e "$1/.atelier-20250101-0000.en-cours" && -d "$1/.atelier-20250102-0000.en-cours" ]]' _ "${PREPARATION}"
rm -rf "${PREPARATION}/.atelier-20250102-0000.en-cours"
verifie "M-2 : cache de préparation vide après la copie"          test -z "$(ls -A "${PREPARATION}")"
verifie "M-2 : cache de préparation en 0700"                      test "$(stat -c %a "${PREPARATION}")" = "700"

# 11 b. gpg échoue (sortie partielle laissée) : code 1, rien sur la destination, cache vidé, jamais de clair sous la destination.
D18="${TMP}/dest-gpg-echec-clair"; mkdir -p "${D18}"; : > "${ESP}/gpg-destination"
ESPION_GPG_ECHEC=1 ESPION_DESTINATION="${D18}" PATH="${ESP}:${PATH}" ATELIER_SAUVEGARDE_CLE="${CLE_PUB}" attendre "M-2 : gpg en échec (sortie partielle) : code 1" 1 "copie abandonnée" "${D18}" "${COMMUN_BASE[@]}"
verifie "M-2 : gpg en échec : destination vide"                   test -z "$(ls -A "${D18}")"
verifie "M-2 : gpg en échec : aucun fichier sous la destination avant l'échec" test "$(grep -vc '^---' "${ESP}/gpg-destination")" = "0"
verifie "M-2 : gpg en échec : cache de préparation vidé"          test -z "$(ls -A "${PREPARATION}")"

# 11 c. --verifier --dechiffrer : le clair déchiffré va dans le cache, pas à côté de la copie ; supprimé ensuite.
: > "${ESP}/tar-args"; : > "${ESP}/gpg-destination"
verifie "M-2 : --verifier --dechiffrer rend 0 (espions)"          env ESPION_DESTINATION="${D17}" PATH="${ESP}:${PATH}" "${SCRIPT}" --verifier "$(find "${D17}" -mindepth 1 -maxdepth 1 -type d | head -n 1)" --dechiffrer
verifie "M-2 : le clair déchiffré est extrait dans le cache"      grep -qF -- "-x -C ${PREPARATION}/.dechiffre-" "${ESP}/tar-args"
verifie "M-2 : seuls les 3 fichiers chiffrés sous la destination pendant le déchiffrement" bash -c '[[ "$(grep -v "^---" "$1" | grep -cvE "/(copie\.tar\.gpg|copie\.tar\.gpg\.sha256|EMPREINTES\.sha256)$")" == 0 && "$(grep -c "^--- --decrypt$" "$1")" == 1 ]]' _ "${ESP}/gpg-destination"
verifie "M-2 : le clair déchiffré n'est jamais extrait sous la destination" bash -c '! grep -qF -- "$1" "$2"' _ "${D17}" "${ESP}/tar-args"
verifie "M-2 : cache vide après le déchiffrement"                 test -z "$(ls -A "${PREPARATION}")"

# 11 d. --sans-chiffrement garde l'ancien comportement : rien n'est préparé dans le cache.
D19="${TMP}/dest-sans-chiffrement-cache"; mkdir -p "${D19}"; rm -rf "${PREPARATION}"
attendre "M-2 : --sans-chiffrement toujours possible" 0 "NON chiffrée" "${D19}" "${COMMUN[@]}"
verifie "M-2 : --sans-chiffrement : cache de préparation non créé" test ! -e "${PREPARATION}"

# 12. B-8 : seule la clé d'empreinte épinglée est acceptée (remplacer destinataire.asc ne doit pas rediriger les copies).
( export GNUPGHOME="${TMP}/gnupg-autre"; mkdir -m 700 "${GNUPGHOME}"
  gpg --batch --quiet --pinentry-mode loopback --passphrase '' --quick-generate-key "autre-cle <autre@example.invalid>" default default never >/dev/null 2>&1 \
    && gpg --batch --armor --export "autre-cle" > "${TMP}/autre.asc" 2>/dev/null )
verifie "B-8 : autre clé publique fabriquée (trousseau jetable)"  test -s "${TMP}/autre.asc"
D20="${TMP}/dest-autre-cle"; mkdir -p "${D20}"
ATELIER_SAUVEGARDE_CLE="${TMP}/autre.asc" attendre "B-8 : autre clé refusée" 1 "clé de chiffrement inattendue" "${D20}" "${COMMUN_BASE[@]}"
verifie "B-8 : autre clé refusée : destination vide"              test -z "$(ls -A "${D20}")"
cat "${CLE_PUB}" "${TMP}/autre.asc" > "${TMP}/deux-cles.asc"
ATELIER_SAUVEGARDE_CLE="${TMP}/deux-cles.asc" attendre "B-8 : fichier à deux clés refusé" 1 "clé de chiffrement inattendue" "${D20}" "${COMMUN_BASE[@]}"
verifie "B-8 : fichier à deux clés : destination vide"            test -z "$(ls -A "${D20}")"
# Sans la variable de réglage, c'est l'empreinte épinglée dans le script qui s'applique : la clé jetable est refusée.
unset ATELIER_SAUVEGARDE_EMPREINTE
ATELIER_SAUVEGARDE_CLE="${CLE_PUB}" attendre "B-8 : empreinte épinglée par défaut (clé jetable refusée)" 1 "clé de chiffrement inattendue" "${D20}" "${COMMUN_BASE[@]}"
export ATELIER_SAUVEGARDE_EMPREINTE="${EMPREINTE_JETABLE}"
ATELIER_SAUVEGARDE_EMPREINTE="pas-une-empreinte" ATELIER_SAUVEGARDE_CLE="${CLE_PUB}" attendre "B-8 : empreinte de réglage invalide refusée" 2 "ATELIER_SAUVEGARDE_EMPREINTE" "${D20}" "${COMMUN_BASE[@]}"
verifie "B-8 : l'empreinte épinglée est celle de la clé de l'opérateur"     grep -q 'FBA1811755A20A834C2DC0107017DCB221AA1441' "${SCRIPT}"

echo "---"; echo "${TOTAL} tests, ${ECHECS} échec(s)"
[[ "${ECHECS}" -eq 0 ]]

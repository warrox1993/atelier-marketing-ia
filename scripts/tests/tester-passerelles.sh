#!/usr/bin/env bash
# Tests de scripts/passerelles.sh sur une fausse racine (fausse passerelle node en boucle locale, port libre tiré au sort).
# Aucune passerelle réelle touchée. Usage : scripts/tests/tester-passerelles.sh   (code 0 si tout passe)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/passerelles-test-XXXXXX")" || exit 1
F="${TMP}/r"
PORT="$(python3 -I -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
nettoyer() {
  # Arrêt par le PID exact écrit par le script, jamais par nom.
  local pid; pid="$(cat "${F}/instance/passerelles/${PORT}.pid" 2>/dev/null)"
  [ -n "${pid}" ] && kill "${pid}" 2>/dev/null
  rm -rf "${TMP}"
}
trap nettoyer EXIT
ECHECS=0; TOTAL=0

mkdir -p "${F}/scripts" "${F}/instance/passerelles" "${F}/passerelle/src" "${F}/passerelle/dist/src"
cp "${RACINE}/scripts/passerelles.sh" "${F}/scripts/"
: > "${F}/instance/passerelles/${PORT}.env"
cat > "${F}/passerelle/dist/src/demarrer.js" <<'JS'
require("http").createServer((q, r) => r.end('{"ok":true}')).listen(Number(process.env.PASSERELLE_PORT), "127.0.0.1");
JS
: > "${F}/passerelle/src/demarrer.ts"

# attendre <nom> <code attendu : 0 ou non0> <fragment attendu> <arguments du script…>
attendre() {
  local nom="$1" attendu="$2" fragment="$3"; shift 3
  local sortie code
  sortie="$(bash "${F}/scripts/passerelles.sh" "$@" 2>&1)"; code=$?
  TOTAL=$((TOTAL + 1))
  if [[ "${attendu}" == "0" && "${code}" -ne 0 ]] || [[ "${attendu}" == "non0" && "${code}" -eq 0 ]] || [[ "${sortie}" != *"${fragment}"* ]]; then
    echo "ECHEC  ${nom} : code ${code}, attendu ${attendu} et « ${fragment} »"; echo "${sortie}" | sed 's/^/         /'
    ECHECS=$((ECHECS + 1)); return
  fi
  echo "OK     ${nom} (code ${code})"
}

# Source modifiée après la compilation : le script refuse de lancer l'ancienne version (AFC-A17).
touch -d '2026-01-01 00:00' "${F}/passerelle/dist/src/demarrer.js"
touch -d '2026-01-02 00:00' "${F}/passerelle/src/demarrer.ts"
attendre "compilation plus ancienne que les sources : refus" non0 "compilée avant ses sources" demarrer "${PORT}"
attendre "rien lancé après le refus" 0 "rien à arrêter" arreter "${PORT}"

# Compilation à jour : démarrage puis arrêt par le PID exact.
touch -d '2026-01-03 00:00' "${F}/passerelle/dist/src/demarrer.js"
attendre "compilation à jour : démarrage" 0 "démarré" demarrer "${PORT}"
attendre "arrêt" 0 "arrêté" arreter "${PORT}"

echo "${TOTAL} cas, ${ECHECS} échec(s)"
[ "${ECHECS}" -eq 0 ]

#!/usr/bin/env bash
# Tests de l'arrêt d'une instance Paperclip d'essai (serveur ET PostgreSQL embarqué), sur de VRAIES
# instances jetables : cycles de démarrage et d'arrêt, arrêt PENDANT un démarrage, reste d'un arrêt
# incomplet (PostgreSQL orphelin, reproduit comme au constat du 15/10/2026), arrêt répété, refus d'un
# mauvais identifiant. Aucun appel de modèle ; n'utilise JAMAIS l'instance principale (3100).
#
# Usage : scripts/arret-instance-tests.sh [<id> <port_http> <port_pg>]
#         défauts : atelier-arret 3361 54561 (données dans instance/instances/<id>/, supprimables)
# À lancer en arrière-plan (plusieurs minutes) : le journal n'est lu qu'une fois, à la fin.
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ID="${1:-atelier-arret}"; PORT_HTTP="${2:-3361}"; PORT_PG="${3:-54561}"
ESSAI="${RACINE}/scripts/instance-essai.sh"
JOURNAL="$(mktemp -d "${TMPDIR:-/tmp}/atelier-arret-XXXXXX")"
trap 'case "${JOURNAL}" in */atelier-arret-*) rm -rf -- "${JOURNAL}" ;; esac' EXIT

reussis=0; echecs=0
ok() { echo "RÉUSSI  $*"; reussis=$((reussis + 1)); }
ko() { echo "ÉCHEC   $*"; echecs=$((echecs + 1)); }

pid_ecoute() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }
ports_libres() { [[ -z "$(pid_ecoute "${PORT_HTTP}")" && -z "$(pid_ecoute "${PORT_PG}")" ]]; }
# Attend (au plus $1 s) que la commande « $@ » réussisse.
attendre() { local d="$1" i; shift; for ((i = 0; i < d * 10; i++)); do "$@" && return 0; sleep 0.1; done; return 1; }
pg_ecoute() { [[ -n "$(pid_ecoute "${PORT_PG}")" ]]; }
http_ecoute() { curl -sf "http://127.0.0.1:${PORT_HTTP}/api/health" > /dev/null 2>&1; }
demarrer() { (setsid "${ESSAI}" demarrer "${ID}" "${PORT_HTTP}" "${PORT_PG}" > "${JOURNAL}/serveur-$1.log" 2>&1 &); }
arreter() { "${ESSAI}" arreter "${ID}" "${PORT_HTTP}" "${PORT_PG}"; }

if ! ports_libres; then echo "Ports ${PORT_HTTP} ou ${PORT_PG} déjà utilisés : abandon, rien n'est touché." >&2; exit 2; fi

# A. Cycle simple, trois fois de suite : démarrer, attendre le service, arrêter.
for n in 1 2 3; do
  demarrer "A${n}"
  if attendre 150 http_ecoute; then
    if arreter > "${JOURNAL}/A${n}.txt" 2>&1 && ports_libres; then ok "A${n}. cycle démarrage puis arrêt : $(tail -1 "${JOURNAL}/A${n}.txt")"
    else ko "A${n}. arrêt incomplet"; cat "${JOURNAL}/A${n}.txt"; ss -ltnp | grep -E ":(${PORT_HTTP}|${PORT_PG})\b"; fi
  else
    ko "A${n}. le service n'est pas prêt en 150 s"; tail -5 "${JOURNAL}/serveur-A${n}.log"; arreter > /dev/null 2>&1
  fi
done

# B. Arrêt PENDANT le démarrage (PostgreSQL déjà à l'écoute, serveur pas encore) : ancien comportement =
#    « déjà arrêtée » puis démarrage poursuivi. Attendu : attente de la fin du démarrage, arrêt gracieux.
demarrer B
if attendre 120 pg_ecoute && ! http_ecoute; then
  if arreter > "${JOURNAL}/B.txt" 2>&1 && ports_libres && grep -q "Démarrage de l'instance ${ID} en cours" "${JOURNAL}/B.txt"; then
    ok "B. arrêt pendant le démarrage : attente puis arrêt complet ($(tail -1 "${JOURNAL}/B.txt"))"
  else ko "B. arrêt pendant le démarrage"; cat "${JOURNAL}/B.txt"; ss -ltnp | grep -E ":(${PORT_HTTP}|${PORT_PG})\b"; fi
else
  ko "B. fenêtre de démarrage non observée (PostgreSQL non à l'écoute, ou service déjà prêt)"; arreter > /dev/null 2>&1
fi
attendre 20 ports_libres || { echo "Nettoyage de B…"; arreter > /dev/null 2>&1; }

# C. Reste d'un arrêt incomplet : SIGTERM au serveur PENDANT le démarrage (gestionnaire pas encore posé)
#    = PostgreSQL orphelin, reproduit. Attendu : arrêt détecte l'orphelin et l'arrête.
demarrer C
if attendre 120 pg_ecoute && ! http_ecoute; then
  PG="$(pid_ecoute "${PORT_PG}")"; PARENT="$(ps -o ppid= -p "${PG}" | tr -d ' ')"
  kill -TERM "${PARENT}" 2> /dev/null
  attendre 20 bash -c "! kill -0 ${PARENT} 2>/dev/null"
  if pg_ecoute && ! kill -0 "${PARENT}" 2> /dev/null; then
    echo "   (orphelin reproduit : serveur ${PARENT} mort, PostgreSQL ${PG} vivant)"
    if arreter > "${JOURNAL}/C.txt" 2>&1 && ports_libres && grep -q "reste d'un arrêt incomplet" "${JOURNAL}/C.txt"; then
      ok "C. PostgreSQL orphelin détecté et arrêté ($(tail -1 "${JOURNAL}/C.txt"))"
    else ko "C. orphelin non nettoyé"; cat "${JOURNAL}/C.txt"; fi
  else
    ko "C. orphelin non reproduit (serveur vivant : $(kill -0 "${PARENT}" 2> /dev/null && echo oui || echo non), PostgreSQL à l'écoute : $(pg_ecoute && echo oui || echo non))"
    arreter > /dev/null 2>&1
  fi
else
  ko "C. fenêtre de démarrage non observée"; arreter > /dev/null 2>&1
fi

# D. Arrêt répété sur une instance arrêtée : message clair, code 0.
if arreter > "${JOURNAL}/D.txt" 2>&1 && grep -q "déjà arrêtée" "${JOURNAL}/D.txt"; then ok "D. arrêt répété : $(cat "${JOURNAL}/D.txt")"
else ko "D. arrêt répété"; cat "${JOURNAL}/D.txt"; fi

# E. Mauvais identifiant : refus net, l'instance qui tourne n'est pas touchée.
demarrer E
if attendre 150 http_ecoute; then
  "${ESSAI}" arreter "atelier-autre" "${PORT_HTTP}" "${PORT_PG}" > "${JOURNAL}/E.txt" 2>&1
  code=$?
  if [[ "${code}" -ne 0 ]] && grep -q "n'est pas le serveur de l'instance atelier-autre" "${JOURNAL}/E.txt" && http_ecoute; then
    ok "E. mauvais identifiant refusé (code ${code}), l'instance ${ID} tourne toujours"
  else ko "E. mauvais identifiant : code=${code}"; cat "${JOURNAL}/E.txt"; fi
  arreter > "${JOURNAL}/E2.txt" 2>&1 && ports_libres && ok "E. arrêt final : $(tail -1 "${JOURNAL}/E2.txt")" || { ko "E. arrêt final"; cat "${JOURNAL}/E2.txt"; }
else
  ko "E. le service n'est pas prêt en 150 s"; arreter > /dev/null 2>&1
fi

# F. Plus aucun processus de l'instance (serveur, postgres) après tous les cycles.
RESTES="$(ss -ltnp 2> /dev/null | grep -E ":(${PORT_HTTP}|${PORT_PG})\b" || true)"
if [[ -z "${RESTES}" ]]; then ok "F. aucun port ni processus restant"; else ko "F. restes : ${RESTES}"; fi

echo "Bilan : ${reussis} réussi(s), ${echecs} échec(s)."
[[ "${echecs}" -eq 0 ]]

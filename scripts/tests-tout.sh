#!/usr/bin/env bash
# Point d'entrée unique des tests hors ligne du dépôt (AFC-A8) : une suite après l'autre, jamais en parallèle (une
# seule suite lourde à la fois sur le poste), bilan à la fin, code 1 si une suite échoue. Aucun appel de modèle,
# aucune instance : bootstrap-tests.sh tourne sans --instance.
# Usage : scripts/tests-tout.sh [--lister] [motif]   (motif : ne lance que les suites dont la commande le contient)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LISTER=0
MOTIF=""
for a in "$@"; do
  case "${a}" in
    --lister) LISTER=1 ;;
    -*) echo "Option inconnue : ${a}" >&2; exit 2 ;;
    *) MOTIF="${a}" ;;
  esac
done

suites=()
# tester-phoenix-exporter.py a besoin d'opentelemetry-proto, fourni par le venv de Phoenix.
VENV_PHOENIX="${HOME}/.local/share/atelier-phoenix/venv/bin/python"
for f in "${RACINE}"/scripts/tests/tester-*.py; do
  py=python3
  [[ "${f}" == */tester-phoenix-exporter.py && -x "${VENV_PHOENIX}" ]] && py="${VENV_PHOENIX} -I"
  suites+=("${py} ${f#"${RACINE}/"}")
done
for f in "${RACINE}"/scripts/tests/tester-*.sh; do suites+=("bash ${f#"${RACINE}/"}"); done
suites+=("bash scripts/bootstrap-tests.sh" "bash scripts/tests-serveur.sh"
         "cd plugin-atelier && pnpm typecheck" "cd plugin-atelier && pnpm test"
         "cd passerelle && pnpm typecheck" "cd passerelle && pnpm test")

echecs=()
lancees=0
for s in "${suites[@]}"; do
  [[ -z "${MOTIF}" || "${s}" == *"${MOTIF}"* ]] || continue
  if (( LISTER )); then echo "${s}"; continue; fi
  lancees=$((lancees + 1))
  echo "=== ${s}"
  if ! (cd "${RACINE}" && eval "${s}"); then echecs+=("${s}"); fi
done
(( LISTER )) && exit 0

echo "=== Bilan : $((lancees - ${#echecs[@]})) suite(s) réussie(s) sur ${lancees}"
for s in "${echecs[@]}"; do echo "ÉCHEC  ${s}"; done
(( ${#echecs[@]} == 0 ))

#!/usr/bin/env bash
# Déploie le plugin de l'Atelier Marketing IA sur les instances locales (recette appliquée à la main jusqu'ici).
# Étapes : vérifications préalables, construction du plugin, copie vers instance/plugin-jb et l'aperçu,
# construction de l'interface du socle, redémarrage, attente de « ready », puis liste des clients réels
# (aucun « appliquer » : plus de mode démonstration, les objectifs sur mesure ne sont jamais écrasés).
# Voir docs/exploitation.md, section « Déployer ». Jamais de pkill : on passe par les scripts d'arrêt existants.
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERROU="${HOME}/.cache/verification-hooks/suite.lock"
DELAI_ATTENTE=240   # 4 minutes maximum par instance

ESSAI=0; SANS_TESTS=0; CIBLE="toutes"; APERCU=""; JOURNAUX=""

aide() {
  cat <<'AIDE'
Usage : scripts/deployer.sh [options]
  --cible 3100|3580|toutes   instances à redémarrer (défaut : toutes)
  --apercu <dossier>         dossier d'aperçu (copie du plugin) ; absent : aperçu ignoré
  --journaux <dossier>       dossier des journaux de démarrage (obligatoire sauf avec --essai)
  --sans-tests               saute tsc et vitest (avertissement affiché)
  --essai                    affiche chaque commande sans l'exécuter (aucun effet)
  --aide                     cette aide
AIDE
}

erreur() { echo "ERREUR : $*" >&2; }
echec() { erreur "$*"; exit 1; }
etape() { echo; echo "== $* =="; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --essai) ESSAI=1 ;;
    --sans-tests) SANS_TESTS=1 ;;
    --cible) CIBLE="${2:-}"; shift ;;
    --apercu) APERCU="${2:-}"; shift ;;
    --journaux) JOURNAUX="${2:-}"; shift ;;
    --aide|-h|--help) aide; exit 0 ;;
    *) erreur "option inconnue : $1"; aide >&2; exit 2 ;;
  esac
  shift
done

case "${CIBLE}" in 3100|3580|toutes) ;; *) echec "--cible attend 3100, 3580 ou toutes (reçu : « ${CIBLE} »)" ;; esac
[[ -n "${JOURNAUX}" || "${ESSAI}" -eq 1 ]] || echec "--journaux <dossier> est obligatoire (hors --essai)"
JOURNAUX="${JOURNAUX:-/tmp/deployer-journaux}"
veut() { [[ "${CIBLE}" == "toutes" || "${CIBLE}" == "$1" ]]; }

# Exécute une commande (tableau), ou l'affiche seulement avec --essai.
executer() {
  if [[ "${ESSAI}" -eq 1 ]]; then printf '+ '; printf '%q ' "$@"; echo; return 0; fi
  "$@"
}
# Lance une commande détachée dont la sortie va dans un journal.
lancer_fond() {
  local journal="$1"; shift
  if [[ "${ESSAI}" -eq 1 ]]; then printf '+ setsid nohup '; printf '%q ' "$@"; echo "> ${journal} 2>&1 < /dev/null &"; return 0; fi
  setsid nohup "$@" > "${journal}" 2>&1 < /dev/null &
}

cd "${RACINE}" || exit 1
[[ "${ESSAI}" -eq 1 ]] && echo "MODE ESSAI : aucune commande n'est exécutée."
[[ "${ESSAI}" -eq 0 ]] && { mkdir -p "${JOURNAUX}" || echec "dossier de journaux inutilisable : ${JOURNAUX}"; }

NB_TESTS="non lancés"
# ---------- 1. Vérifications préalables ----------
etape "1. Vérifications préalables"
for d in "${RACINE}" "${RACINE}/paperclip"; do
  if [[ "${ESSAI}" -eq 1 ]]; then echo "+ git -C ${d} status --porcelain -- . (doit être vide)"; continue; fi
  sale="$(git -C "${d}" status --porcelain -- . 2>&1)" || echec "git a échoué dans ${d}"
  [[ -z "${sale}" ]] || { echo "${sale}" | head -10 >&2; echec "arbre git non propre dans ${d}"; }
done

if [[ "${SANS_TESTS}" -eq 1 ]]; then
  echo "AVERTISSEMENT : --sans-tests, tsc et vitest sautés." >&2
else
  if [[ "${ESSAI}" -eq 1 ]]; then
    echo "+ flock ${VERROU} bash -c 'cd plugin-atelier && npx tsc --noEmit && npx vitest run'"
  else
    mkdir -p "$(dirname "${VERROU}")"
    flock "${VERROU}" bash -c 'cd "$1/plugin-atelier" && npx tsc --noEmit && npx vitest run' _ "${RACINE}" 2>&1 | tee "${JOURNAUX}/deployer-tests.log"
    [[ "${PIPESTATUS[0]}" -eq 0 ]] || echec "tsc ou vitest en échec (voir ${JOURNAUX}/deployer-tests.log)"
    NB_TESTS="$(grep -E '^[[:space:]]*Tests[[:space:]]' "${JOURNAUX}/deployer-tests.log" | tail -1 | sed 's/^[[:space:]]*//')"
    NB_TESTS="${NB_TESTS:-inconnu}"
  fi
fi
executer python3 scripts/verifier-organisation.py || echec "verifier-organisation.py en échec"
executer scripts/verifier-config.sh || echec "verifier-config.sh en échec"

# ---------- 2. Construction du plugin ----------
etape "2. Construction du plugin"
if [[ "${ESSAI}" -eq 1 ]]; then echo "+ (cd plugin-atelier && node esbuild.config.mjs)"
else (cd "${RACINE}/plugin-atelier" && node esbuild.config.mjs) || echec "construction du plugin en échec"; fi

# ---------- 3. Copie ----------
etape "3. Copie vers instance/plugin-jb et l'aperçu"
copier_vers() {
  local dest="$1"
  executer mkdir -p "${dest}" || return 1
  executer rsync -a --delete "${RACINE}/plugin-atelier/dist/" "${dest}/dist/" || return 1
  executer rsync -a --delete "${RACINE}/plugin-atelier/migrations/" "${dest}/migrations/" || return 1
  executer command cp -f "${RACINE}/plugin-atelier/package.json" "${dest}/package.json" || return 1
}
copier_vers "${RACINE}/instance/plugin-jb" || echec "copie vers instance/plugin-jb en échec"
if [[ -n "${APERCU}" ]]; then
  copier_vers "${APERCU}" || echec "copie vers ${APERCU} en échec"
else
  echo "Aperçu : --apercu absent, copie ignorée."
fi

# ---------- 4. Interface du socle ----------
etape "4. Construction de l'interface du socle"
if [[ "${ESSAI}" -eq 1 ]]; then echo "+ (cd paperclip && pnpm --filter @paperclipai/ui build)"
else (cd "${RACINE}/paperclip" && pnpm --filter @paperclipai/ui build) || echec "construction de l'interface en échec"; fi

# ---------- 5. Redémarrage ----------
etape "5. Redémarrage (cible : ${CIBLE})"
if veut 3100; then
  executer scripts/arreter-instance.sh || echec "arrêt de l'instance 3100 en échec"
  lancer_fond "${JOURNAUX}/instance-3100.log" scripts/lancer-instance.sh
fi
if veut 3580; then
  executer scripts/instance-essai.sh arreter atelier-apercu 3580 54780 || echec "arrêt de l'instance 3580 en échec"
  if [[ "${ESSAI}" -eq 1 ]]; then
    echo "+ PAPERCLIP_ATELIER_GATEWAY_URL=http://127.0.0.1:3581 setsid nohup scripts/instance-essai.sh demarrer atelier-apercu 3580 54780 > ${JOURNAUX}/instance-3580.log 2>&1 < /dev/null &"
  else
    PAPERCLIP_ATELIER_GATEWAY_URL=http://127.0.0.1:3581 setsid nohup scripts/instance-essai.sh demarrer atelier-apercu 3580 54780 \
      > "${JOURNAUX}/instance-3580.log" 2>&1 < /dev/null &
  fi
fi

# ---------- 6. Attente ----------
etape "6. Attente du statut « ready » (4 minutes au plus par instance)"
PRETES=()
attendre() {
  local port="$1" debut="${SECONDS}"
  if [[ "${ESSAI}" -eq 1 ]]; then
    echo "+ attendre (max ${DELAI_ATTENTE} s) que curl -s http://127.0.0.1:${port}/api/plugins contienne \"status\":\"ready\""
    return 0
  fi
  while (( SECONDS - debut < DELAI_ATTENTE )); do
    if curl -s --max-time 5 "http://127.0.0.1:${port}/api/plugins" 2>/dev/null | grep -q '"status":"ready"'; then
      echo "Instance ${port} prête après $((SECONDS - debut)) s."; PRETES+=("${port}"); return 0
    fi
    sleep 5
  done
  erreur "instance ${port} pas prête après ${DELAI_ATTENTE} s (journal : ${JOURNAUX}/instance-${port}.log)"
  return 1
}
for p in 3100 3580; do veut "${p}" && { attendre "${p}" || exit 1; }; done

# ---------- 7. Clients réels ----------
# Plus de mode démonstration : rien n'est réappliqué automatiquement (les objectifs sur mesure
# des clients ne doivent pas être écrasés, et les anciens scripts recréeraient des entreprises de démo).
etape "7. Clients réels (liste seulement, aucun appliquer)"
CLIENTS=0
for fiche in "${RACINE}"/instance/atelier-client/*/entreprise.json; do
  [[ -f "${fiche}" ]] || continue
  echo "Client trouvé : $(basename "$(dirname "${fiche}")")"
  CLIENTS=$((CLIENTS + 1))
done
[[ "${CLIENTS}" -gt 0 ]] || echo "Aucun client trouvé dans instance/atelier-client/*/entreprise.json."

# ---------- 8. Résumé ----------
etape "8. Résumé"
echo "Version du plugin : $(git -C "${RACINE}" rev-parse --short HEAD)"
echo "Tests : ${NB_TESTS}"
if [[ "${ESSAI}" -eq 1 ]]; then echo "Instances prêtes : (essai, rien lancé)"; else echo "Instances prêtes : ${PRETES[*]:-aucune}"; fi
echo "Clients réels listés : ${CLIENTS} (aucune écriture : rien n'est réappliqué)"

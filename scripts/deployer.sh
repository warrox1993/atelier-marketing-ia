#!/usr/bin/env bash
# Déploie le plugin, la passerelle et l'interface du socle sur l'instance 3100 de l'Atelier Marketing IA.
# Étapes : vérifications préalables (arbres suivis propres, tests du plugin et de la passerelle, organisation, config),
# copie de la version en place (retour arrière), construction du plugin, de la passerelle et de l'interface du socle,
# copie du plugin vers instance/plugin-jb (et vers --apercu s'il est donné), redémarrage PAR SYSTEMD de l'instance et de
# la passerelle, attente de « ready » ; si l'instance n'est pas prête : retour arrière automatique sur la version d'avant.
# Puis liste des clients réels (aucun « appliquer » : les objectifs sur mesure ne sont jamais écrasés).
# Voir docs/exploitation.md, section « Déployer ». Le redémarrage passe par systemd : une instance lancée depuis une
# session (setsid) mourait avec elle, et doublait celle que Restart=on-failure relançait.
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Clé board facultative (mode authentifié) : ~/.config/atelier/board-<port>.key, voir lib-cle-board.sh.
# shellcheck disable=SC1091
source "${RACINE}/scripts/lib-cle-board.sh"
VERROU="${HOME}/.cache/verification-hooks/suite.lock"
DELAI_ATTENTE="${ATELIER_DEPLOI_DELAI:-240}"   # 4 minutes maximum (réglable pour les tests)
AVANT_GARDER=3                                 # copies « avant » gardées dans instance/deploiements/

ESSAI=0; SANS_TESTS=0; CIBLE="3100"; APERCU=""; JOURNAUX=""; PASSERELLE="3190"

aide() {
  cat <<'AIDE'
Usage : scripts/deployer.sh [options]
  --cible 3100|toutes        instance à redémarrer (défaut : 3100, la seule ; « toutes » est un synonyme)
  --passerelle <port>        passerelle à redémarrer (unité atelier-passerelle@<port>, défaut : 3190)
  --apercu <dossier>         facultatif : copie aussi le plugin dans ce dossier ; absent : copie ignorée
  --journaux <dossier>       dossier des journaux de tests (obligatoire sauf avec --essai)
  --sans-tests               saute les tests du plugin et de la passerelle (avertissement affiché)
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
    --passerelle) PASSERELLE="${2:-}"; shift ;;
    --apercu) APERCU="${2:-}"; shift ;;
    --journaux) JOURNAUX="${2:-}"; shift ;;
    --aide|-h|--help) aide; exit 0 ;;
    *) erreur "option inconnue : $1"; aide >&2; exit 2 ;;
  esac
  shift
done

case "${CIBLE}" in 3100|toutes) ;; *) echec "--cible attend 3100 ou toutes (reçu : « ${CIBLE} » ; l'instance 3580 n'existe plus)" ;; esac
[[ "${PASSERELLE}" =~ ^[0-9]+$ ]] || echec "--passerelle attend un port (reçu : « ${PASSERELLE} »)"
[[ -n "${JOURNAUX}" || "${ESSAI}" -eq 1 ]] || echec "--journaux <dossier> est obligatoire (hors --essai)"
UNITE_INSTANCE="atelier-instance@atelier"; UNITE_PASSERELLE="atelier-passerelle@${PASSERELLE}"

# Exécute une commande (tableau), ou l'affiche seulement avec --essai.
executer() {
  if [[ "${ESSAI}" -eq 1 ]]; then printf '+ '; printf '%q ' "$@"; echo; return 0; fi
  "$@"
}
# Lance une suite de tests dans un dossier, derrière le verrou commun, journal dans ${JOURNAUX}/<nom>.log.
tester() {
  local nom="$1" dossier="$2"; shift 2
  if [[ "${ESSAI}" -eq 1 ]]; then echo "+ flock ${VERROU} bash -c 'cd ${dossier} && $*'"; return 0; fi
  flock "${VERROU}" bash -c 'cd "$1" && shift && eval "$*"' _ "${RACINE}/${dossier}" "$@" 2>&1 | tee "${JOURNAUX}/${nom}.log"
  [[ "${PIPESTATUS[0]}" -eq 0 ]] || echec "tests ${nom} en échec (voir ${JOURNAUX}/${nom}.log)"
}

# Refuse de redémarrer l'instance pendant un run d'agent (L3-reste) : le redémarrage l'interromprait en plein travail.
# Instance injoignable = arrêtée, donc aucun run ; réponse illisible = refus par prudence. Les runs « queued » repartent seuls.
refuser_si_runs() {
  local url="http://127.0.0.1:3100/api" entreprises ids id runs actifs=""
  if [[ "${ESSAI}" -eq 1 ]]; then echo "+ refus si un run est « running » : GET ${url}/companies puis ${url}/companies/<id>/live-runs"; return 0; fi
  command -v jq >/dev/null 2>&1 || { erreur "jq absent : impossible de vérifier les runs en cours"; return 1; }
  if ! entreprises="$(curl_atelier 3100 -sf --max-time 5 "${url}/companies" 2>/dev/null)"; then
    echo "Instance injoignable (arrêtée) : aucun run en cours."; return 0
  fi
  ids="$(jq -r '.[].id' <<<"${entreprises}" 2>/dev/null)" || { erreur "liste des entreprises illisible : runs en cours inconnus, déploiement refusé"; return 1; }
  for id in ${ids}; do
    [[ "${id}" =~ ^[A-Za-z0-9-]+$ ]] || { erreur "identifiant d'entreprise inattendu : ${id}"; return 1; }
    runs="$(curl_atelier 3100 -sf --max-time 5 "${url}/companies/${id}/live-runs" 2>/dev/null)" \
      && actifs+="$(jq -r '.[] | select(.status == "running") | "  - \(.agentName // .agentId) (run \(.id))"' <<<"${runs}" 2>/dev/null)" \
      || { erreur "runs de l'entreprise ${id} illisibles : déploiement refusé par prudence"; return 1; }
  done
  [[ -z "${actifs}" ]] || { echo "${actifs}" >&2; erreur "run(s) en cours (liste ci-dessus) : attendre leur fin ou mettre les agents en pause, puis relancer"; return 1; }
  echo "Aucun run en cours."
}

cd "${RACINE}" || exit 1
[[ "${ESSAI}" -eq 1 ]] && echo "MODE ESSAI : aucune commande n'est exécutée."
[[ "${ESSAI}" -eq 0 ]] && { mkdir -p "${JOURNAUX}" || echec "dossier de journaux inutilisable : ${JOURNAUX}"; }

NB_TESTS="non lancés"
# ---------- 1. Vérifications préalables ----------
etape "1. Vérifications préalables"
# Seuls les fichiers suivis comptent : un fichier non suivi (lockfile, réglage local) ne part pas avec le déploiement.
for d in "${RACINE}" "${RACINE}/paperclip"; do
  if [[ "${ESSAI}" -eq 1 ]]; then echo "+ git -C ${d} status --porcelain --untracked-files=no (doit être vide)"; continue; fi
  sale="$(git -C "${d}" status --porcelain --untracked-files=no 2>&1)" || echec "git a échoué dans ${d}"
  [[ -z "${sale}" ]] || { echo "${sale}" | head -10 >&2; echec "arbre git non propre dans ${d} (fichiers suivis modifiés : les commiter d'abord)"; }
done

refuser_si_runs || exit 1
if [[ "${SANS_TESTS}" -eq 1 ]]; then
  echo "AVERTISSEMENT : --sans-tests, tests du plugin et de la passerelle sautés." >&2
else
  mkdir -p "$(dirname "${VERROU}")"
  tester plugin plugin-atelier "npx tsc --noEmit && npx vitest run"
  tester passerelle passerelle "pnpm typecheck && pnpm exec vitest run"
  if [[ "${ESSAI}" -eq 0 ]]; then
    NB_TESTS="plugin : $(grep -E '^[[:space:]]*Tests[[:space:]]' "${JOURNAUX}/plugin.log" | tail -1 | sed 's/^[[:space:]]*//') ; passerelle : $(grep -E '^[[:space:]]*Tests[[:space:]]' "${JOURNAUX}/passerelle.log" | tail -1 | sed 's/^[[:space:]]*//')"
  fi
fi
executer python3 -I scripts/bootstrap-organisation.py generer --verifier || echec "organisation générée pas à jour (generer --verifier)"
executer python3 scripts/verifier-organisation.py || echec "verifier-organisation.py en échec"
executer scripts/verifier-config.sh || echec "verifier-config.sh en échec"

# ---------- 2. Version en place, pour le retour arrière ----------
etape "2. Copie de la version en place (retour arrière)"
AVANT="${RACINE}/instance/deploiements/avant-$(date +%Y%m%d-%H%M%S)"
# <source> <nom dans AVANT> : plugin installé, passerelle compilée, interface compilée du socle.
PIECES=("instance/plugin-jb:plugin-jb" "passerelle/dist:passerelle-dist" "paperclip/ui/dist:ui-dist")
for p in "${PIECES[@]}"; do
  src="${p%%:*}"; [[ -d "${RACINE}/${src}" ]] || { echo "${src} absent : rien à garder."; continue; }
  executer mkdir -p "${AVANT}/${p#*:}" || echec "création de ${AVANT} impossible"
  executer rsync -a --delete "${RACINE}/${src}/" "${AVANT}/${p#*:}/" || echec "copie de ${src} impossible : rien n'a été déployé"
done
attendre_pret() {
  local debut="${SECONDS}"
  while (( SECONDS - debut < DELAI_ATTENTE )); do
    if curl_atelier 3100 -s --max-time 5 "http://127.0.0.1:3100/api/plugins" 2>/dev/null | grep -q '"status":"ready"'; then
      echo "Instance 3100 prête après $((SECONDS - debut)) s."; return 0
    fi
    sleep 1
  done
  erreur "instance 3100 pas prête après ${DELAI_ATTENTE} s (journal : journalctl --user -u ${UNITE_INSTANCE} -n 100)"
  return 1
}
remettre_avant() {
  local p
  for p in "${PIECES[@]}"; do
    [[ -d "${AVANT}/${p#*:}" ]] && rsync -a --delete "${AVANT}/${p#*:}/" "${RACINE}/${p%%:*}/"
  done
}
retour_arriere() {
  echo "RETOUR ARRIÈRE : remise de la version d'avant (${AVANT})." >&2
  remettre_avant
  systemctl --user restart "${UNITE_INSTANCE}" "${UNITE_PASSERELLE}"
  attendre_pret && echo "Version d'avant de nouveau en service." >&2
}

# ---------- 3. Construction ----------
etape "3. Construction du plugin, de la passerelle et de l'interface du socle"
if [[ "${ESSAI}" -eq 1 ]]; then
  echo "+ (cd plugin-atelier && node esbuild.config.mjs)"; echo "+ (cd passerelle && pnpm build)"; echo "+ (cd paperclip && pnpm --filter @paperclipai/ui build)"
else
  (cd "${RACINE}/plugin-atelier" && node esbuild.config.mjs) || echec "construction du plugin en échec"
  (cd "${RACINE}/passerelle" && pnpm build) || { retour_arriere; echec "construction de la passerelle en échec (version d'avant remise)"; }
  (cd "${RACINE}/paperclip" && pnpm --filter @paperclipai/ui build) || { retour_arriere; echec "construction de l'interface en échec (version d'avant remise)"; }
fi

# ---------- 4. Copie ----------
etape "4. Copie vers instance/plugin-jb (et le dossier --apercu s'il est donné)"
copier_vers() {
  local dest="$1"
  executer mkdir -p "${dest}" || return 1
  executer rsync -a --delete "${RACINE}/plugin-atelier/dist/" "${dest}/dist/" || return 1
  executer rsync -a --delete "${RACINE}/plugin-atelier/migrations/" "${dest}/migrations/" || return 1
  executer command cp -f "${RACINE}/plugin-atelier/package.json" "${dest}/package.json" || return 1
}
copier_vers "${RACINE}/instance/plugin-jb" || { [[ "${ESSAI}" -eq 1 ]] || retour_arriere; echec "copie vers instance/plugin-jb en échec"; }
if [[ -n "${APERCU}" ]]; then
  copier_vers "${APERCU}" || echec "copie vers ${APERCU} en échec"
else
  echo "Dossier supplémentaire : --apercu absent, copie ignorée."
fi

# ---------- 5. Redémarrage et attente ----------
etape "5. Redémarrage par systemd (${UNITE_INSTANCE}, ${UNITE_PASSERELLE}), attente de « ready »"
if [[ "${ESSAI}" -eq 1 ]]; then
  executer systemctl --user restart "${UNITE_INSTANCE}" "${UNITE_PASSERELLE}"
  echo "+ attendre (max ${DELAI_ATTENTE} s) que http://127.0.0.1:3100/api/plugins contienne \"status\":\"ready\", puis systemctl --user is-active ${UNITE_PASSERELLE}"
else
  # Un run a pu démarrer pendant les tests et la construction : contrôle refait juste avant l'arrêt.
  refuser_si_runs || { remettre_avant; echec "rien n'a été redémarré ; fichiers de la version d'avant remis (l'interface neuve n'est plus servie)"; }
  systemctl --user restart "${UNITE_INSTANCE}" "${UNITE_PASSERELLE}" || { retour_arriere; echec "redémarrage par systemd en échec (version d'avant remise)"; }
  attendre_pret || { retour_arriere; echec "déploiement annulé : version d'avant remise"; }
  # Type=simple : « active » dès le lancement ; vérifié après l'attente de l'instance, la passerelle a eu le temps de planter.
  systemctl --user is-active --quiet "${UNITE_PASSERELLE}" || { retour_arriere; echec "${UNITE_PASSERELLE} inactive : version d'avant remise"; }
fi

# ---------- 6. Clients réels ----------
# Plus de mode démonstration : rien n'est réappliqué automatiquement (les objectifs sur mesure
# des clients ne doivent pas être écrasés, et les anciens scripts recréeraient des entreprises de démo).
etape "6. Clients réels (liste seulement, aucun appliquer)"
CLIENTS=0
for fiche in "${RACINE}"/instance/atelier-client/*/entreprise.json; do
  [[ -f "${fiche}" ]] || continue
  echo "Client trouvé : $(basename "$(dirname "${fiche}")")"
  CLIENTS=$((CLIENTS + 1))
done
[[ "${CLIENTS}" -gt 0 ]] || echo "Aucun client trouvé dans instance/atelier-client/*/entreprise.json."

# ---------- 7. Résumé ----------
etape "7. Résumé"
echo "Version déployée : $(git -C "${RACINE}" rev-parse --short HEAD)"
echo "Tests : ${NB_TESTS}"
echo "Version d'avant : ${AVANT} (retour arrière manuel : rsync -a --delete de chaque dossier vers sa place, puis systemctl --user restart ${UNITE_INSTANCE} ${UNITE_PASSERELLE})"
if [[ "${ESSAI}" -eq 0 ]]; then
  # Rotation des copies « avant » de ce script (motif strict), les plus récentes gardées.
  find "${RACINE}/instance/deploiements" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended \
    -regex '.*/avant-[0-9]{8}-[0-9]{6}' -printf '%f\n' | LC_ALL=C sort | head -n "-${AVANT_GARDER}" \
    | while IFS= read -r v; do rm -rf -- "${RACINE}/instance/deploiements/${v}"; done
fi
echo "Clients réels listés : ${CLIENTS} (aucune écriture : rien n'est réappliqué)"

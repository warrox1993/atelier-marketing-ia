#!/usr/bin/env bash
# Installation de l'atelier chez un client, sur sa machine Linux, dans un compte Unix dédié.
# Conception, prérequis, étapes manuelles et retour arrière : docs/installation-client.md.
#
# Usage :
#   scripts/installer-chez-client.sh [--essai]        affiche les commandes, ne modifie rien (défaut)
#   sudo scripts/installer-chez-client.sh --appliquer [options]
# Options :
#   --compte <nom>            compte de service (défaut : atelier), créé sans sudo ni groupe d'administration
#   --code <dossier>          emplacement du code, en lecture seule pour le compte (défaut : /opt/atelier-marketing-ia)
#   --proprietaire <compte>   propriétaire du code, qui construit et met à jour (défaut : l'appelant de sudo)
#   --source <dossier>        copie git d'où viennent les fichiers SUIVIS (défaut : ce dépôt)
#   --port <n> --port-db <n> --port-passerelle <n>   (défauts : 3100, 54329, 3190)
#   --fiche <fichier>         fiche du client (hors dépôt) : appelle « nouveau-client » (à blanc puis réel)
#   --reel                    transmis à « nouveau-client » (mode réel ; la fiche doit aussi le demander)
#   --aide
# Ne contient et n'affiche aucun secret. Idempotent : relancer ne recrée rien et ne réécrit pas un fichier
# de réglages déjà présent (il signale seulement une différence). Aucune suppression, aucun pare-feu,
# aucun réglage AppArmor ni sudoers.
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="essai"
COMPTE="atelier"
CODE="/opt/atelier-marketing-ia"
PROPRIETAIRE="${SUDO_USER:-$(id -un)}"
SOURCE="${RACINE}"
PORT=3100
PORT_DB=54329
PORT_PASSERELLE=3190
FICHE=""
REEL=0

aide() { sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }
erreur() { echo "Erreur : $*" >&2; exit 2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --essai) MODE="essai"; shift ;;
    --appliquer) MODE="appliquer"; shift ;;
    --compte) COMPTE="${2:-}"; shift 2 || erreur "valeur manquante pour --compte" ;;
    --code) CODE="${2:-}"; shift 2 || erreur "valeur manquante pour --code" ;;
    --proprietaire) PROPRIETAIRE="${2:-}"; shift 2 || erreur "valeur manquante pour --proprietaire" ;;
    --source) SOURCE="${2:-}"; shift 2 || erreur "valeur manquante pour --source" ;;
    --port) PORT="${2:-}"; shift 2 || erreur "valeur manquante pour --port" ;;
    --port-db) PORT_DB="${2:-}"; shift 2 || erreur "valeur manquante pour --port-db" ;;
    --port-passerelle) PORT_PASSERELLE="${2:-}"; shift 2 || erreur "valeur manquante pour --port-passerelle" ;;
    --fiche) FICHE="${2:-}"; shift 2 || erreur "valeur manquante pour --fiche" ;;
    --reel) REEL=1; shift ;;
    --aide|-h|--help) aide; exit 0 ;;
    *) erreur "option inconnue : $1 (voir --aide)" ;;
  esac
done

# ---------------------------------------------------------------- contrôles (lecture seule)
if [[ "${MODE}" == "appliquer" && "$(id -u)" -ne 0 ]]; then
  erreur "--appliquer crée un compte et active la persistance (linger) : lancer avec sudo. Rien n'a été fait."
fi
[[ "${COMPTE}" =~ ^[a-z][a-z0-9-]{1,30}$ ]] || erreur "nom de compte refusé : ${COMPTE}"
case "${COMPTE}" in root|daemon|bin|sys|nobody|www-data|admin|sudo) erreur "nom de compte réservé : ${COMPTE}" ;; esac
[[ "${PROPRIETAIRE}" =~ ^[a-z_][a-z0-9_-]*$ ]] || erreur "propriétaire du code refusé : ${PROPRIETAIRE}"
[[ "${PROPRIETAIRE}" != "root" ]] || erreur "le code ne doit pas appartenir à root (construction avec pnpm) : passer --proprietaire <compte d'administration>"
[[ "${PROPRIETAIRE}" != "${COMPTE}" ]] || erreur "le propriétaire du code doit être différent du compte de service (sinon les agents peuvent réécrire le code)"
for p in "${PORT}" "${PORT_DB}" "${PORT_PASSERELLE}"; do
  [[ "${p}" =~ ^[0-9]+$ && "${p}" -ge 1024 && "${p}" -le 65535 ]] || erreur "port invalide : ${p}"
done
[[ "${CODE}" == /* && "${CODE}" != "/" && "${CODE}" != *..* ]] || erreur "--code doit être un chemin absolu propre : ${CODE}"
[[ "${CODE}" != /home/* ]] || erreur "--code ne doit pas être sous /home (le répertoire du compte ne contient qu'un lien vers le code)"
[[ -f "${SOURCE}/scripts/lancer-instance.sh" && -f "${SOURCE}/config/atelier.env.example" ]] \
  || erreur "--source ne ressemble pas au dépôt de l'atelier : ${SOURCE}"
if [[ -n "${FICHE}" ]]; then
  [[ -f "${FICHE}" ]] || erreur "fiche introuvable : ${FICHE}"
  case "$(cd "$(dirname "${FICHE}")" && pwd)/" in
    "${SOURCE}"/*|"${CODE}"/*) erreur "la fiche du client doit rester HORS du dépôt et du code" ;;
  esac
fi

ACCUEIL="$(getent passwd "${COMPTE}" | cut -d: -f6)"
COMPTE_EXISTE=0
if [[ -n "${ACCUEIL}" ]]; then COMPTE_EXISTE=1; else ACCUEIL="/home/${COMPTE}"; fi
INSTANCE="${CODE}/instance"
LIEN="${ACCUEIL}/Projets/atelier-marketing-ia"
UNITES="${ACCUEIL}/.config/systemd/user"
GROUPES_INTERDITS="sudo admin wheel adm root docker lxd incus libvirt kvm disk shadow"

echo "Installation de l'atelier chez un client (mode ${MODE}$([[ ${MODE} == essai ]] && echo ' : rien ne sera modifié'))"
echo "  compte de service : ${COMPTE} (répertoire ${ACCUEIL}, $([[ ${COMPTE_EXISTE} == 1 ]] && echo 'existe déjà' || echo 'à créer'))"
echo "  code              : ${CODE} (propriétaire ${PROPRIETAIRE}, groupe ${COMPTE}, lecture seule pour ${COMPTE})"
echo "  données           : ${INSTANCE} (${COMPTE}, 0700)"
echo "  ports             : instance ${PORT}, base ${PORT_DB}, passerelle ${PORT_PASSERELLE}"
echo

# Prérequis : signalés, jamais installés par ce script.
MANQUE=0
for outil in bwrap node python3 git curl rsync useradd loginctl systemctl runuser corepack; do
  if ! command -v "${outil}" >/dev/null 2>&1; then echo "Prérequis absent : ${outil}"; MANQUE=1; fi
done
if command -v node >/dev/null 2>&1; then
  VERSION_NODE="$(node -p 'process.versions.node' 2>/dev/null || echo 0)"
  if [[ "$(printf '%s\n24.11.0\n' "${VERSION_NODE}" | sort -V | head -1)" != "24.11.0" ]]; then
    echo "Prérequis : Node ${VERSION_NODE} trouvé, le socle exige >= 24.11.0"; MANQUE=1
  fi
fi
if [[ "${MANQUE}" == 1 ]]; then
  [[ "${MODE}" == "appliquer" ]] && { echo "Installer les prérequis (docs/installation-client.md, section 2) puis relancer." >&2; exit 3; }
  echo "(mode essai : on continue l'affichage)"
fi
if [[ "${COMPTE_EXISTE}" == 1 ]]; then
  for g in $(id -nG "${COMPTE}"); do
    for interdit in ${GROUPES_INTERDITS}; do
      [[ "${g}" == "${interdit}" ]] && erreur "le compte ${COMPTE} est dans le groupe « ${g} » : retirer ce droit à la main (gpasswd -d ${COMPTE} ${g}) puis relancer"
    done
  done
  [[ -L "${LIEN}" || ! -e "${LIEN}" ]] || erreur "${LIEN} existe et n'est pas un lien : déplacer ce dossier à la main puis relancer"
fi

# ---------------------------------------------------------------- outils d'exécution
ETAPE=0
etape() { ETAPE=$((ETAPE + 1)); echo; echo "== ${ETAPE}. $*"; }
# lancer <commande…> : affiche la commande ; l'exécute seulement en mode appliquer, arrêt au premier échec.
lancer() {
  printf '+'; printf ' %q' "$@"; printf '\n'
  [[ "${MODE}" == "appliquer" ]] || return 0
  "$@" || { echo "Échec de l'étape ${ETAPE} : arrêt (corriger puis relancer, le script est idempotent)." >&2; exit 1; }
}
# en_compte <commande…> : exécute en tant que compte de service, sans sudo (runuser, réservé à root).
en_compte() { lancer runuser -u "${COMPTE}" -- "$@"; }
# deposer <chemin> <propriétaire> <groupe> <mode> : contenu sur l'entrée standard. Ne remplace jamais un
# fichier existant différent (réglage local de l'opérateur) : il le signale.
deposer() {
  local cible="$1" proprio="$2" groupe="$3" droits="$4" contenu
  contenu="$(cat)"
  if [[ -f "${cible}" ]]; then
    if [[ "$(cat "${cible}" 2>/dev/null)" == "${contenu}" ]]; then echo "= ${cible} : inchangé"
    else echo "! ${cible} existe et diffère du modèle : laissé tel quel (comparer à la main)"; fi
    return 0
  fi
  echo "+ écrire ${cible} (${proprio}:${groupe} ${droits}) :"
  printf '%s\n' "${contenu}" | sed 's/^/    | /'
  [[ "${MODE}" == "appliquer" ]] || return 0
  local tmp; tmp="$(mktemp)" || exit 1
  printf '%s\n' "${contenu}" > "${tmp}"
  install -o "${proprio}" -g "${groupe}" -m "${droits}" "${tmp}" "${cible}" || { rm -f "${tmp}"; exit 1; }
  rm -f "${tmp}"
}

# ---------------------------------------------------------------- 1. compte de service
etape "Compte de service ${COMPTE} (sans sudo, connexion interactive impossible)"
if [[ "${COMPTE_EXISTE}" == 1 ]]; then
  echo "= le compte existe ; groupes : $(id -nG "${COMPTE}")"
else
  lancer useradd --create-home --home-dir "${ACCUEIL}" --shell /usr/sbin/nologin --user-group \
    --comment "Atelier marketing IA" "${COMPTE}"
fi
lancer chmod 0700 "${ACCUEIL}"

# ---------------------------------------------------------------- 2. code en lecture seule
etape "Code dans ${CODE} : propriétaire ${PROPRIETAIRE}, groupe ${COMPTE} en lecture seule"
lancer install -d -o "${PROPRIETAIRE}" -g "${COMPTE}" -m 0750 "${CODE}"
if [[ "$(cd "${SOURCE}" && pwd -P)" != "$(cd "${CODE}" 2>/dev/null && pwd -P || echo "${CODE}")" ]]; then
  # Seuls les fichiers SUIVIS par git sont copiés : jamais instance/ (données et clés), config/*.env,
  # journaux ni données d'un autre client. Pas de --delete : un fichier retiré du dépôt reste (signalé à la doc).
  [[ -d "${SOURCE}/.git" ]] || erreur "--source doit être une copie git (seuls les fichiers suivis sont copiés)"
  echo "+ git -C $(printf '%q' "${SOURCE}") ls-files -z | rsync -a --from0 --files-from=- --exclude=/instance/ --chmod=go-w,o-rwx $(printf '%q' "${SOURCE}/") $(printf '%q' "${CODE}/")"
  if [[ "${MODE}" == "appliquer" ]]; then
    git -C "${SOURCE}" ls-files -z | rsync -a --from0 --files-from=- --exclude=/instance/ --chmod=go-w,o-rwx "${SOURCE}/" "${CODE}/" \
      || { echo "Échec de la copie du code." >&2; exit 1; }
  fi
else
  echo "= le code est déjà dans ${CODE}"
fi
# Propriété et droits de tout le code sauf instance/ (le compte de service lit, n'écrit pas).
lancer find "${CODE}" -path "${INSTANCE}" -prune -o -exec chown -h "${PROPRIETAIRE}:${COMPTE}" {} +
lancer find "${CODE}" -path "${INSTANCE}" -prune -o ! -type l -exec chmod g-w,g+rX,o-rwx {} +
# Bit setgid sur les dossiers : ce que le propriétaire construit ensuite (pnpm, plugin) garde le groupe du compte.
lancer find "${CODE}" -path "${INSTANCE}" -prune -o -type d -exec chmod g+s {} +

# ---------------------------------------------------------------- 3. données de l'instance
etape "Données de l'instance : ${INSTANCE} (${COMPTE} seul)"
lancer install -d -o "${COMPTE}" -g "${COMPTE}" -m 0700 "${INSTANCE}"
lancer install -d -o "${COMPTE}" -g "${COMPTE}" -m 0700 "${INSTANCE}/passerelles" "${INSTANCE}/fiches"
deposer "${INSTANCE}/passerelles/${PORT_PASSERELLE}.env" "${COMPTE}" "${COMPTE}" 0600 <<EOF
# Réglages de la passerelle ${PORT_PASSERELLE} (chemins seulement, aucun secret en clair).
# Les deux fichiers sont créés par « bootstrap-organisation.py cles --confirmer » (docs/exploitation.md, section 11).
PASSERELLE_SIGNATURE_CLE_PRIVEE_FICHIER=${INSTANCE}/cles/passerelle-signature.pem
PASSERELLE_APPROBATION_CLE_PUBLIQUE_FICHIER=${INSTANCE}/cles/approbation-publiques.pub
EOF

# ---------------------------------------------------------------- 4. configuration (sans secret)
etape "Configuration de l'instance (aucun secret) : ${CODE}/config/atelier.env"
deposer "${CODE}/config/atelier.env" "${PROPRIETAIRE}" "${COMPTE}" 0640 < <(
  sed -e "s|^PAPERCLIP_HOME=.*|PAPERCLIP_HOME=${INSTANCE}|" -e "s|^PORT=.*|PORT=${PORT}|" \
    "${SOURCE}/config/atelier.env.example"
)

# ---------------------------------------------------------------- 5. répertoire du compte
etape "Répertoire de ${COMPTE} : uniquement le lien vers le code, ses réglages et ses unités"
lancer install -d -o "${COMPTE}" -g "${COMPTE}" -m 0700 "${ACCUEIL}/Projets" "${ACCUEIL}/.config" \
  "${ACCUEIL}/.config/atelier" "${ACCUEIL}/.config/systemd" "${UNITES}" "${ACCUEIL}/.local" "${ACCUEIL}/.local/bin"
if [[ "$(readlink "${LIEN}" 2>/dev/null)" == "${CODE}" ]]; then
  echo "= ${LIEN} -> ${CODE}"
else
  lancer ln -s "${CODE}" "${LIEN}"
  lancer chown -h "${COMPTE}:${COMPTE}" "${LIEN}"
fi
deposer "${ACCUEIL}/.config/atelier/atelier.env" "${COMPTE}" "${COMPTE}" 0600 <<EOF
ATELIER_PORT=${PORT}
ATELIER_PORT_DB=${PORT_DB}
ATELIER_PASSERELLE_URL=http://127.0.0.1:${PORT_PASSERELLE}
EOF
# pnpm (épinglé par « packageManager ») via corepack, dans ~/.local/bin, déjà dans le PATH des unités.
if [[ -x "${ACCUEIL}/.local/bin/pnpm" ]]; then
  echo "= pnpm présent dans ${ACCUEIL}/.local/bin"
else
  en_compte corepack enable --install-directory "${ACCUEIL}/.local/bin"
fi

# ---------------------------------------------------------------- 6. unités systemd utilisateur + linger
etape "Unités systemd utilisateur de ${COMPTE} et démarrage sans session ouverte (linger)"
for u in atelier-instance@.service atelier-passerelle@.service atelier-sante@.service atelier-sante@.timer; do
  if [[ -f "${UNITES}/${u}" ]] && cmp -s "${CODE}/scripts/systemd/${u}" "${UNITES}/${u}" 2>/dev/null; then
    echo "= ${UNITES}/${u} : inchangé"
  else
    lancer install -o "${COMPTE}" -g "${COMPTE}" -m 0644 "${CODE}/scripts/systemd/${u}" "${UNITES}/${u}"
  fi
done
if [[ "$(loginctl show-user "${COMPTE}" -p Linger --value 2>/dev/null)" == "yes" ]]; then
  echo "= linger déjà actif pour ${COMPTE}"
else
  lancer loginctl enable-linger "${COMPTE}"
fi

# ---------------------------------------------------------------- 7. socle construit ?
etape "Socle construit (par ${PROPRIETAIRE}, jamais par ${COMPTE})"
if [[ -d "${CODE}/paperclip/node_modules" && -d "${CODE}/plugin-atelier/dist" ]]; then
  echo "= socle et plugin construits"
else
  echo "Socle ou plugin non construit. À faire par ${PROPRIETAIRE}, puis relancer ce script :"
  echo "    sudo -u ${PROPRIETAIRE} ${CODE}/scripts/preparer-socle.sh"
  echo "    sudo -u ${PROPRIETAIRE} ${CODE}/scripts/preparer-plugin.sh"
  if [[ "${MODE}" == "appliquer" ]]; then
    echo "Arrêt avant le démarrage (le reste est prêt ; relancer après la construction)."
    exit 4
  fi
fi
# La CLI claude doit être hors d'atteinte en écriture du compte (sinon un agent pourrait la remplacer).
echo "+ vérifier que « claude » n'est pas modifiable par ${COMPTE} (installé par ${PROPRIETAIRE} ou root, mises à jour automatiques coupées)"
if [[ "${MODE}" == "appliquer" ]]; then
  CHEMIN_CLAUDE="$(runuser -u "${COMPTE}" -- env PATH="${ACCUEIL}/.local/bin:/usr/local/bin:/usr/bin:/bin" sh -c 'command -v claude' 2>/dev/null || true)"
  if [[ -z "${CHEMIN_CLAUDE}" ]]; then
    echo "Attention : « claude » introuvable pour ${COMPTE} (docs/installation-client.md, section 2)."
  elif runuser -u "${COMPTE}" -- test -w "$(readlink -f "${CHEMIN_CLAUDE}")"; then
    echo "Attention : ${CHEMIN_CLAUDE} est modifiable par ${COMPTE} : le réinstaller hors de son répertoire (section 2)."
  else
    echo "= ${CHEMIN_CLAUDE} non modifiable par ${COMPTE}"
  fi
fi

# ---------------------------------------------------------------- 8. démarrage
etape "Démarrage de l'instance et du contrôle de santé"
lancer systemctl --user -M "${COMPTE}@" daemon-reload
lancer systemctl --user -M "${COMPTE}@" enable --now atelier-instance@atelier.service atelier-sante@atelier.timer
if [[ -f "${INSTANCE}/cles/passerelle-signature.pem" ]]; then
  lancer systemctl --user -M "${COMPTE}@" enable --now "atelier-passerelle@${PORT_PASSERELLE}.service"
else
  echo "(passerelle non démarrée : ses clés n'existent pas encore ; voir docs/installation-client.md, section 5)"
fi
echo "+ attendre GET http://127.0.0.1:${PORT}/api/health (4 minutes au plus)"
if [[ "${MODE}" == "appliquer" ]]; then
  PRET=0
  for _ in $(seq 1 48); do
    if curl -fsS -m 4 "http://127.0.0.1:${PORT}/api/health" 2>/dev/null | grep -q '"ok"'; then PRET=1; break; fi
    sleep 5
  done
  [[ "${PRET}" == 1 ]] || { echo "Instance non prête : journalctl --user -M ${COMPTE}@ -u atelier-instance@atelier" >&2; exit 1; }
  echo "Instance prête."
fi

# ---------------------------------------------------------------- 9. entreprise du client
etape "Entreprise du client (bootstrap-organisation.py nouveau-client)"
if [[ -z "${FICHE}" ]]; then
  echo "(pas de --fiche : étape sautée ; la relancer avec --fiche <fichier hors dépôt>)"
else
  FICHE_LOCALE="${INSTANCE}/fiches/$(basename "${FICHE}")"
  lancer install -o "${COMPTE}" -g "${COMPTE}" -m 0600 "${FICHE}" "${FICHE_LOCALE}"
  OPTIONS_REEL=()
  [[ "${REEL}" == 1 ]] && OPTIONS_REEL=(--reel)
  en_compte env "ATELIER_API=http://127.0.0.1:${PORT}/api" python3 -I "${CODE}/scripts/bootstrap-organisation.py" \
    nouveau-client --fiche "${FICHE_LOCALE}" "${OPTIONS_REEL[@]}" --a-blanc
  en_compte env "ATELIER_API=http://127.0.0.1:${PORT}/api" python3 -I "${CODE}/scripts/bootstrap-organisation.py" \
    nouveau-client --fiche "${FICHE_LOCALE}" "${OPTIONS_REEL[@]}"
fi

# ---------------------------------------------------------------- 10. vérifications
etape "Vérifications"
lancer id "${COMPTE}"
lancer stat -c '%U:%G %a %n' "${ACCUEIL}" "${CODE}" "${CODE}/scripts/lancer-instance.sh" "${CODE}/config/atelier.env" "${INSTANCE}"
lancer runuser -u "${COMPTE}" -- test ! -w "${CODE}/scripts/lancer-instance.sh"
lancer systemctl --user -M "${COMPTE}@" is-active atelier-instance@atelier.service

echo
echo "Étapes manuelles restantes (docs/installation-client.md, section 5) : jeton d'abonnement (saisi par l'opérateur,"
echo "jamais dans un script), clés de l'entreprise (cles --entreprise <UUID> --confirmer), passerelle, confinement réseau."
[[ "${MODE}" == "essai" ]] && echo "Mode essai terminé : aucune modification. Relancer avec « sudo $0 --appliquer » et les mêmes options."
exit 0

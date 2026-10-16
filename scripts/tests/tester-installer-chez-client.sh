#!/usr/bin/env bash
# Tests de scripts/installer-chez-client.sh en mode essai : commandes attendues, aucune commande destructive,
# aucun changement sur le poste. N'exécute jamais --appliquer en tant que root, ne crée aucun compte.
# Usage : scripts/tests/tester-installer-chez-client.sh   (code 0 si tout passe)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${RACINE}/scripts/installer-chez-client.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/installer-test-XXXXXX")" || exit 1
trap 'rm -rf "${TMP}"' EXIT
ECHECS=0; TOTAL=0
COMPTE="atelier-essai-test"
CODE="${TMP}/opt-atelier"

if [[ "$(id -u)" -eq 0 ]]; then echo "Refus : ce test ne se lance pas en root."; exit 2; fi
if getent passwd "${COMPTE}" >/dev/null; then echo "Refus : le compte ${COMPTE} existe déjà sur ce poste."; exit 2; fi

ok() { TOTAL=$((TOTAL + 1)); echo "OK     $1"; }
ko() { TOTAL=$((TOTAL + 1)); ECHECS=$((ECHECS + 1)); echo "ECHEC  $1"; }
contient() { if [[ "${SORTIE}" == *"$2"* ]]; then ok "$1"; else ko "$1 : « $2 » absent"; fi; }
absent_motif() { if grep -Eq -- "$2" <<< "${SORTIE}"; then ko "$1 : motif « $2 » trouvé"; grep -En -- "$2" <<< "${SORTIE}" | head -3 | sed 's/^/         /'; else ok "$1"; fi; }

# Fiche fictive, hors dépôt (aucune donnée réelle).
printf '{"nomCommercial":"Entreprise fictive"}\n' > "${TMP}/fiche-fictive.json"

# 1. Essai complet, mode par défaut (sans --essai explicite).
SORTIE="$("${SCRIPT}" --compte "${COMPTE}" --code "${CODE}" --fiche "${TMP}/fiche-fictive.json" --port 3700 --port-db 54700 --port-passerelle 3790 2>&1)"; CODE_SORTIE=$?
[[ "${CODE_SORTIE}" -eq 0 ]] && ok "essai par défaut : code 0" || { ko "essai par défaut : code ${CODE_SORTIE}"; echo "${SORTIE}" | tail -5; }
contient "mode essai annoncé" "mode essai : rien ne sera modifié"
contient "création du compte sans shell" "useradd --create-home --home-dir /home/${COMPTE} --shell /usr/sbin/nologin --user-group"
contient "répertoire du compte fermé" "chmod 0700 /home/${COMPTE}"
contient "copie des seuls fichiers suivis" "ls-files -z | rsync -a --from0 --files-from=- --exclude=/instance/"
contient "code au propriétaire, groupe du compte" "chown -h ${USER:-$(id -un)}:${COMPTE}"
contient "code sans écriture pour le groupe" "chmod g-w\\,g+rX\\,o-rwx"
contient "données en 0700" "install -d -o ${COMPTE} -g ${COMPTE} -m 0700 ${CODE}/instance"
contient "configuration sans secret pointant l'instance" "PAPERCLIP_HOME=${CODE}/instance"
contient "port de l'instance" "PORT=3700"
contient "réglages de santé" "ATELIER_PASSERELLE_URL=http://127.0.0.1:3790"
contient "réglages de passerelle (chemins)" "PASSERELLE_SIGNATURE_CLE_PRIVEE_FICHIER=${CODE}/instance/cles/passerelle-signature.pem"
contient "lien du répertoire vers le code" "ln -s ${CODE} /home/${COMPTE}/Projets/atelier-marketing-ia"
contient "unité instance installée" "atelier-instance@.service /home/${COMPTE}/.config/systemd/user/atelier-instance@.service"
contient "unité santé installée" "atelier-sante@.timer /home/${COMPTE}/.config/systemd/user/atelier-sante@.timer"
contient "linger" "loginctl enable-linger ${COMPTE}"
contient "démarrage par le gestionnaire utilisateur du compte" "systemctl --user -M ${COMPTE}@ enable --now atelier-instance@atelier.service atelier-sante@atelier.timer"
contient "nouveau-client à blanc" "nouveau-client --fiche ${CODE}/instance/fiches/fiche-fictive.json --a-blanc"
contient "nouveau-client exécuté sous le compte" "runuser -u ${COMPTE} -- env ATELIER_API=http://127.0.0.1:3700/api python3 -I"
contient "vérification de non-écriture du code" "test \\! -w ${CODE}/scripts/lancer-instance.sh"

# Aucune commande destructive ni réglage hors périmètre dans les commandes affichées (lignes « + »).
COMMANDES="$(grep -E '^\+ ' <<< "${SORTIE}")"
SORTIE_COMPLETE="${SORTIE}"; SORTIE="${COMMANDES}"
absent_motif "pas de rm" '(^|[ |;])rm( |$)'
absent_motif "pas de suppression de compte" 'userdel|deluser|groupdel'
absent_motif "pas de rsync --delete" '--delete'
absent_motif "pas de kill" '(^|[ ])p?kill(all)?( |$)'
absent_motif "pas de pare-feu" '(^|[ ])(nft|iptables|ufw)( |$)'
absent_motif "pas d'AppArmor" 'apparmor|aa-'
absent_motif "pas de sudoers ni groupe sudo" 'sudoers|visudo|usermod|gpasswd'
absent_motif "pas de droits larges" 'chmod [0-7]?7[0-7]7|o\+w|a\+w'
absent_motif "pas de --reel sans demande" '--reel'
SORTIE="${SORTIE_COMPLETE}"
absent_motif "aucun jeton affiché" 'CLAUDE_CODE_OAUTH_TOKEN=|ANTHROPIC_API_KEY=|sk-ant-'

# Rien n'a changé sur le poste.
getent passwd "${COMPTE}" >/dev/null && ko "le compte a été créé" || ok "aucun compte créé"
[[ -e "${CODE}" ]] && ko "le dossier de code a été créé" || ok "aucun dossier de code créé"
[[ -e "/home/${COMPTE}" ]] && ko "un répertoire personnel a été créé" || ok "aucun répertoire personnel créé"

# 2. --reel transmis seulement s'il est demandé.
SORTIE="$("${SCRIPT}" --essai --compte "${COMPTE}" --code "${CODE}" --fiche "${TMP}/fiche-fictive.json" --reel 2>&1)"
contient "--reel transmis à nouveau-client" "fiche-fictive.json --reel --a-blanc"

# 3. Refus avant toute action.
attendre_refus() {
  local nom="$1" fragment="$2"; shift 2
  local sortie code
  sortie="$("${SCRIPT}" "$@" 2>&1)"; code=$?
  if [[ "${code}" -ne 0 && "${sortie}" == *"${fragment}"* && "${sortie}" != *"+ "* ]]; then ok "${nom}"
  else ko "${nom} : code ${code}"; echo "${sortie}" | head -3 | sed 's/^/         /'; fi
}
attendre_refus "--appliquer sans root refusé" "lancer avec sudo" --appliquer --compte "${COMPTE}" --code "${CODE}"
attendre_refus "compte réservé refusé" "réservé" --compte root
attendre_refus "nom de compte invalide refusé" "refusé" --compte "Atelier;id"
attendre_refus "propriétaire = compte refusé" "différent du compte" --compte "${COMPTE}" --proprietaire "${COMPTE}" --code "${CODE}"
attendre_refus "propriétaire root refusé" "root" --proprietaire root --compte "${COMPTE}" --code "${CODE}"
attendre_refus "code sous /home refusé" "sous /home" --compte "${COMPTE}" --code "/home/${COMPTE}/atelier"
attendre_refus "code relatif refusé" "chemin absolu" --compte "${COMPTE}" --code "opt/atelier"
attendre_refus "port invalide refusé" "port invalide" --compte "${COMPTE}" --code "${CODE}" --port 80
attendre_refus "fiche dans le dépôt refusée" "HORS du dépôt" --compte "${COMPTE}" --code "${CODE}" --fiche "${RACINE}/organisation/modeles/fiche-client.exemple.json"
attendre_refus "fiche absente refusée" "introuvable" --compte "${COMPTE}" --code "${CODE}" --fiche "${TMP}/absente.json"
attendre_refus "option inconnue refusée" "option inconnue" --supprimer

echo
echo "${TOTAL} contrôles, ${ECHECS} échec(s)."
[[ "${ECHECS}" -eq 0 ]]

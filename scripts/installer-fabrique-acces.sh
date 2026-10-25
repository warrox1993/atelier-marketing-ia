#!/usr/bin/env bash
# Donne à l'opérateur (et donc au plugin de l'atelier, qui tourne sous son uid) l'accès aux dossiers de la fabrique,
# par ACL POSIX, sans passer par le groupe atelier-fabrique.
#
# Pourquoi : l'utilisateur de l'opérateur a bien été ajouté au groupe atelier-fabrique, mais son gestionnaire
# systemd utilisateur (démarré avant) ne l'a pas : les services de l'atelier n'ont PAS le groupe. Une ACL pour
# l'uid de l'opérateur règle le problème sans redémarrer sa session.
#
# Droits posés (uid de l'opérateur) :
#   - /var/lib/atelier-fabrique          : traversée seule (--x), pas de liste ;
#   - entrant/                           : lecture, écriture, traversée (rwx), file de dépôt ;
#   - livrables/                         : lecture et traversée (r-x), récursif, avec ACL par défaut pour les
#                                          nouveaux dossiers et fichiers que crée le service ;
#   - voix-autorisees/registre.json      : lecture seule (porte de diffusion), traversée du dossier (--x).
# Rien d'autre n'est ouvert (travaux/, refuses/, modeles/, gabarits/ restent fermés à l'opérateur).
#
# À lancer en root par l'opérateur : sudo scripts/installer-fabrique-acces.sh [--retirer]. Idempotent.
set -uo pipefail

DONNEES="/var/lib/atelier-fabrique"

echec() { echo "erreur : $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || echec "à lancer en root (sudo)"
command -v setfacl >/dev/null || echec "setfacl absent (paquet acl)"
[[ -d "$DONNEES" ]] || echec "$DONNEES absent : installer d'abord la fabrique (scripts/installer-fabrique.sh)"

# uid de l'opérateur : celui qui a lancé sudo.
UID_OPERATEUR="${SUDO_UID:-}"
[[ "$UID_OPERATEUR" =~ ^[0-9]+$ && "$UID_OPERATEUR" -ne 0 ]] || echec "SUDO_UID absent ou invalide : lancer avec sudo depuis le compte de l'opérateur"

REGISTRE_VOIX="$DONNEES/voix-autorisees/registre.json"

if [[ "${1:-}" == "--retirer" ]]; then
  [[ $# -eq 1 ]] || echec "usage : installer-fabrique-acces.sh [--retirer]"
  for cible in "$DONNEES" "$DONNEES/entrant" "$DONNEES/livrables" "$DONNEES/voix-autorisees" "$REGISTRE_VOIX"; do
    [[ -e "$cible" ]] && setfacl -x "u:${UID_OPERATEUR}" "$cible"
  done
  [[ -d "$DONNEES/livrables" ]] && setfacl -R -x "u:${UID_OPERATEUR}" -x "d:u:${UID_OPERATEUR}" "$DONNEES/livrables"
  [[ -d "$DONNEES/entrant" ]] && setfacl -x "d:u:${UID_OPERATEUR}" "$DONNEES/entrant"
  echo "ACL de l'uid ${UID_OPERATEUR} retirées."
  exit 0
fi
[[ $# -eq 0 ]] || echec "usage : installer-fabrique-acces.sh [--retirer]"

poser() {  # poser <ACL> <cible...>
  local acl="$1"; shift
  setfacl -m "$acl" "$@" || echec "setfacl -m ${acl} $* impossible"
}

[[ -d "$DONNEES/entrant" && -d "$DONNEES/livrables" ]] || echec "entrant/ ou livrables/ absent de $DONNEES"

poser "u:${UID_OPERATEUR}:--x" "$DONNEES"
poser "u:${UID_OPERATEUR}:rwx" "$DONNEES/entrant"
# Fichiers déposés par l'opérateur : le service (groupe atelier-fabrique) doit pouvoir les lire.
poser "d:u:${UID_OPERATEUR}:rwx" "$DONNEES/entrant"
poser "d:g:atelier-fabrique:rw-" "$DONNEES/entrant"
# Livrables : existant (récursif) puis ACL par défaut sur tous les dossiers, pour les futurs travaux.
setfacl -R -m "u:${UID_OPERATEUR}:rX" "$DONNEES/livrables" || echec "ACL de livrables/ impossible"
find "$DONNEES/livrables" -type d -exec setfacl -m "d:u:${UID_OPERATEUR}:rX" {} + || echec "ACL par défaut de livrables/ impossible"
if [[ -d "$DONNEES/voix-autorisees" ]]; then
  poser "u:${UID_OPERATEUR}:--x" "$DONNEES/voix-autorisees"
  if [[ -f "$REGISTRE_VOIX" ]]; then
    poser "u:${UID_OPERATEUR}:r--" "$REGISTRE_VOIX"
  else
    echo "avertissement : $REGISTRE_VOIX absent (installer-fabrique-voix.sh pas encore passé)" >&2
  fi
fi

echo "ACL posées pour l'uid ${UID_OPERATEUR} :"
getfacl -p -s "$DONNEES" "$DONNEES/entrant" "$DONNEES/livrables" "$DONNEES/voix-autorisees" "$REGISTRE_VOIX" 2>/dev/null \
  | grep -E '^(# file|user:[0-9a-z]|default:user:[0-9a-z]|default:group:[0-9a-z]|mask)' | sed 's/^/  /'

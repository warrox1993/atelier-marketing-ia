#!/usr/bin/env bash
# Clé d'API « board » de l'instance pour les scripts (mode authentifié), FACULTATIVE.
# À sourcer (pas à exécuter). Fonctionne dans les deux modes :
#   - mode local_trusted : aucun fichier de clé, les requêtes partent sans jeton (comportement historique) ;
#   - mode authenticated : la clé est lue dans un fichier 0600 HORS DÉPÔT et envoyée en « Authorization: Bearer ».
# Fichier : ATELIER_CLE_BOARD_FICHIER s'il est défini, sinon ~/.config/atelier/board-<port>.key (une clé par
# instance, repérée par son port : l'instance réelle 3100 et une instance d'essai ne se mélangent jamais).
# Le fichier est créé par scripts/passer-en-mode-authentifie.sh. La clé ne passe JAMAIS dans les arguments d'une
# commande (visibles dans « ps ») : curl la lit par un descripteur (-H @<(…)), avec printf, commande interne du shell.

# chemin_cle_board <port> : écrit le chemin du fichier de clé s'il existe et est sûr (propriétaire = moi, aucun
# droit pour le groupe ni les autres) ; rien sinon. Un fichier trop ouvert est ignoré avec un avertissement.
chemin_cle_board() {
  local port="${1:-}" f
  f="${ATELIER_CLE_BOARD_FICHIER:-${HOME}/.config/atelier/board-${port}.key}"
  [[ -f "${f}" ]] || return 0
  if [[ ! -O "${f}" ]] || [[ "$(stat -c '%a' "${f}" 2>/dev/null)" != "600" && "$(stat -c '%a' "${f}" 2>/dev/null)" != "400" ]]; then
    echo "AVERTISSEMENT : ${f} ignoré (il doit m'appartenir et être en 0600) : requêtes envoyées sans clé." >&2
    return 0
  fi
  printf '%s\n' "${f}"
}

# curl_atelier <port> <arguments de curl…> : curl vers l'instance, avec la clé board si le fichier existe.
# À n'utiliser que vers http://127.0.0.1:<port> (la clé ne doit jamais partir ailleurs).
curl_atelier() {
  local port="$1"; shift
  local f cle
  f="$(chemin_cle_board "${port}")"
  if [[ -z "${f}" ]]; then
    curl "$@"
    return
  fi
  cle="$(tr -d '[:space:]' < "${f}")"
  if [[ ! "${cle}" =~ ^[A-Za-z0-9_.-]{16,512}$ ]]; then
    echo "AVERTISSEMENT : contenu de ${f} invalide : requêtes envoyées sans clé." >&2
    curl "$@"
    return
  fi
  curl -H @<(printf 'Authorization: Bearer %s\n' "${cle}") "$@"
}

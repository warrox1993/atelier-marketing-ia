#!/usr/bin/env bash
# Surcharge FACULTATIVE « mode authentifié » d'une instance (à sourcer, pas à exécuter).
# Fichier écrit par scripts/passer-en-mode-authentifie.sh, jamais suivi par git, sans aucun secret :
#   - instance réelle : config/atelier-auth.env (lu par scripts/lancer-instance.sh APRÈS config/atelier.env) ;
#   - instance d'essai : instance/instances/<id>/atelier-auth.env (lu par scripts/instance-essai.sh).
# Absent : rien ne change (mode local_trusted de config/atelier.env). Retour arrière : supprimer le fichier
# (ou « passer-en-mode-authentifie.sh --revenir ») puis redémarrer l'instance.
# Contenu admis (liste blanche stricte, forme CLE=valeur, jamais exécuté par « source ») :
#   PAPERCLIP_DEPLOYMENT_MODE=authenticated   (obligatoire)
#   PAPERCLIP_DEPLOYMENT_EXPOSURE=private     (obligatoire : réseau privé, jamais public)
#   PAPERCLIP_AUTH_DISABLE_SIGN_UP=true       (facultatif : inscriptions fermées après création du compte)

# verifier_surcharge_auth <fichier> : 0 si conforme ; chaque écart sur la sortie d'erreur.
verifier_surcharge_auth() {
  local f="$1" l cle valeur n=0 ecarts=0 mode="" exposition=""
  local motif='^[A-Z_]+=[a-z_]+$'
  [[ -f "${f}" ]] || { echo "ÉCART : ${f} absent." >&2; return 1; }
  while IFS= read -r l || [[ -n "${l}" ]]; do
    n=$((n + 1))
    [[ "${l}" =~ ^[[:space:]]*$ || "${l}" =~ ^[[:space:]]*# ]] && continue
    if [[ ! "${l}" =~ ${motif} ]]; then
      echo "ÉCART : ligne ${n} de ${f} refusée (forme CLE=valeur en minuscules exigée)." >&2; ecarts=$((ecarts + 1)); continue
    fi
    cle="${l%%=*}"; valeur="${l#*=}"
    case "${cle}=${valeur}" in
      PAPERCLIP_DEPLOYMENT_MODE=authenticated) mode="${valeur}" ;;
      PAPERCLIP_DEPLOYMENT_EXPOSURE=private) exposition="${valeur}" ;;
      PAPERCLIP_AUTH_DISABLE_SIGN_UP=true) ;;
      *) echo "ÉCART : ${cle}=${valeur} (ligne ${n} de ${f}) hors de la liste autorisée." >&2; ecarts=$((ecarts + 1)) ;;
    esac
  done < "${f}"
  [[ "${mode}" == "authenticated" ]] || { echo "ÉCART : PAPERCLIP_DEPLOYMENT_MODE=authenticated manquant dans ${f}." >&2; ecarts=$((ecarts + 1)); }
  [[ "${exposition}" == "private" ]] || { echo "ÉCART : PAPERCLIP_DEPLOYMENT_EXPOSURE=private manquant dans ${f}." >&2; ecarts=$((ecarts + 1)); }
  (( ecarts == 0 ))
}

# exporter_surcharge_auth <fichier> : valide puis exporte les paires CLE=valeur (code 1 si non conforme).
exporter_surcharge_auth() {
  local f="$1" l
  verifier_surcharge_auth "${f}" || { echo "Surcharge ${f} non conforme : démarrage refusé." >&2; return 1; }
  while IFS= read -r l || [[ -n "${l}" ]]; do
    [[ "${l}" =~ ^[[:space:]]*$ || "${l}" =~ ^[[:space:]]*# ]] && continue
    export "${l%%=*}=${l#*=}"
  done < "${f}"
  echo "Surcharge du mode authentifié chargée : ${f}"
}

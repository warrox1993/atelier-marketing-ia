#!/usr/bin/env bash
# Bibliothèque d'arrêt d'une instance Paperclip (serveur + PostgreSQL embarqué).
# À « source » depuis scripts/instance-essai.sh et scripts/arreter-instance.sh.
#
# Pourquoi elle existe (constat du 15/10/2026, reproduit) : le serveur ne pose son gestionnaire de
# SIGTERM qu'à la toute fin de son démarrage (paperclip/server/src/index.ts, « process.once("SIGTERM") »).
# Un SIGTERM reçu pendant le démarrage, alors que le PostgreSQL embarqué tourne déjà, tue le serveur
# sans arrêter PostgreSQL : le postmaster reste vivant, orphelin, et garde son port. L'ancien arrêt
# ne regardait que le port HTTP : démarrage en cours = « déjà arrêtée » (le démarrage se terminait
# ensuite) ; serveur déjà mort = rien à faire alors que PostgreSQL restait.
#
# Méthode : trois états, tous traités.
#   1. serveur à l'écoute        : SIGTERM au serveur (il arrête lui-même PostgreSQL), attente bornée ;
#   2. démarrage en cours        : le serveur est le parent du postmaster mais n'écoute pas encore ;
#                                  attente bornée qu'il écoute, puis arrêt comme en 1 ; au-delà, on le
#                                  termine et on arrête PostgreSQL nous-mêmes (état 3) ;
#   3. PostgreSQL orphelin       : arrêt « fast » (SIGINT) du postmaster identifié par postmaster.pid ET
#                                  par sa ligne de commande (-D <dossier de données>), jamais par motif.
# Ni pkill ni kill -9 : chaque signal vise un PID identifié et vérifié (identifiant d'instance dans son
# environnement, ou dossier de données de PostgreSQL).

# PID qui écoute sur un port TCP (vide si personne).
pid_ecoute() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }

# Variable d'environnement d'un processus (vide si illisible).
env_processus() { { tr '\0' '\n' < "/proc/$1/environ" | grep "^$2=" | head -1 | cut -d= -f2-; } 2>/dev/null; }

processus_vivant() { [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null; }

# Attend jusqu'à $1 secondes que la commande « $@ » réussisse ; code 0 si elle a réussi.
attendre_borne() {
  local delai="$1"; shift
  local i
  for ((i = 0; i < delai; i++)); do
    if "$@"; then return 0; fi
    sleep 1
  done
  "$@"
}

# Le processus $1 est-il le serveur de l'instance $2 ? Identifiant d'instance lu dans son
# environnement ; à défaut (environnement illisible ou sans identifiant), son dossier courant doit
# être sous la racine du projet $3.
est_serveur_instance() {
  local pid="$1" id="$2" racine="$3" env_id cwd
  env_id="$(env_processus "${pid}" PAPERCLIP_INSTANCE_ID)"
  if [[ -n "${env_id}" ]]; then [[ "${env_id}" == "${id}" ]]; return; fi
  cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
  [[ -n "${cwd}" && "${cwd}" == "${racine}"* ]]
}

# Le PostgreSQL de l'instance : renvoie « <pid> » du postmaster si postmaster.pid désigne un processus
# vivant dont la ligne de commande contient bien « -D <dossier de données> ». Vide sinon.
pid_postgres_instance() {
  local donnees="$1" fichier="${1}/postmaster.pid" pid cmd
  [[ -r "${fichier}" ]] || return 0
  pid="$(sed -n 1p "${fichier}" 2>/dev/null)"
  [[ "${pid}" =~ ^[0-9]+$ ]] && processus_vivant "${pid}" || return 0
  cmd="$({ tr '\0' ' ' < "/proc/${pid}/cmdline"; } 2>/dev/null)"
  [[ "${cmd}" == *"-D ${donnees} "* || "${cmd}" == *"-D ${donnees}" ]] && echo "${pid}"
  return 0
}

pid_parent() { ps -o ppid= -p "$1" 2>/dev/null | tr -d ' '; }

# arreter_instance <id> <port_http> <port_pg> <dossier_donnees_pg> <racine_projet>
# Variables facultatives : DELAI_ARRET (60 s, attente de l'arrêt gracieux du serveur),
# DELAI_DEMARRAGE (90 s, attente de la fin d'un démarrage en cours), DELAI_PG (30 s).
# Code 0 : instance arrêtée (ou déjà arrêtée) ; 1 : échec, message explicite sur la sortie d'erreur.
arreter_instance() {
  local id="$1" port_http="$2" port_pg="$3" donnees="$4" racine="$5"
  local delai_arret="${DELAI_ARRET:-60}" delai_demarrage="${DELAI_DEMARRAGE:-90}" delai_pg="${DELAI_PG:-30}"
  local pid_srv pid_pg parent

  pid_srv="$(pid_ecoute "${port_http}")"
  pid_pg="$(pid_postgres_instance "${donnees}")"

  if [[ -z "${pid_srv}" && -z "${pid_pg}" ]]; then
    local intrus
    intrus="$(pid_ecoute "${port_pg}")"
    if [[ -n "${intrus}" ]]; then
      echo "Le port PostgreSQL ${port_pg} est tenu par le PID ${intrus}, qui n'est pas le PostgreSQL de l'instance ${id} (${donnees}) : abandon, rien n'est touché." >&2
      return 1
    fi
    echo "Instance ${id} déjà arrêtée (ports ${port_http} et ${port_pg} libres)."
    return 0
  fi

  # État 1 : le serveur écoute.
  if [[ -n "${pid_srv}" ]]; then
    if ! est_serveur_instance "${pid_srv}" "${id}" "${racine}"; then
      echo "Le PID ${pid_srv} sur le port ${port_http} n'est pas le serveur de l'instance ${id} (identifiant trouvé : $(env_processus "${pid_srv}" PAPERCLIP_INSTANCE_ID)) : abandon, rien n'est touché." >&2
      return 1
    fi
    echo "Arrêt gracieux du serveur de l'instance ${id} (PID ${pid_srv}, SIGTERM ; il arrête lui-même son PostgreSQL)."
    kill -TERM "${pid_srv}" 2>/dev/null
    if ! attendre_borne "${delai_arret}" _serveur_arrete "${pid_srv}" "${port_http}"; then
      echo "Le serveur de l'instance ${id} (PID ${pid_srv}) ne s'est pas arrêté en ${delai_arret} s." >&2
      echo "Le serveur attend peut-être la fin d'un run en cours : relancez cet arrêt dans un instant, ou lisez le journal du serveur." >&2
      return 1
    fi
    # Serveur parti : PostgreSQL s'arrête avec lui (quelques secondes) ; sinon il est orphelin (état 3).
    attendre_borne 15 _pg_arrete "${port_pg}" "${donnees}" || true
    pid_pg="$(pid_postgres_instance "${donnees}")"
    if [[ -z "${pid_pg}" ]]; then echo "Instance ${id} arrêtée : serveur et PostgreSQL, ports ${port_http} et ${port_pg} libérés."; return 0; fi
  else
    # État 2 : PostgreSQL vit, le serveur n'écoute pas. Démarrage en cours ou PostgreSQL orphelin ?
    parent="$(pid_parent "${pid_pg}")"
    if [[ -n "${parent}" && "${parent}" != "1" ]] && est_serveur_instance "${parent}" "${id}" "${racine}"; then
      echo "Démarrage de l'instance ${id} en cours (serveur PID ${parent}) : attente de la fin du démarrage (${delai_demarrage} s au plus) pour un arrêt gracieux."
      if attendre_borne "${delai_demarrage}" _serveur_ecoute "${port_http}"; then
        arreter_instance "${id}" "${port_http}" "${port_pg}" "${donnees}" "${racine}"
        return
      fi
      echo "Le démarrage n'a pas abouti en ${delai_demarrage} s : arrêt du serveur PID ${parent}, puis de son PostgreSQL."
      kill -TERM "${parent}" 2>/dev/null
      attendre_borne 10 _processus_absent "${parent}" || { echo "Le serveur PID ${parent} ne répond pas au SIGTERM : abandon." >&2; return 1; }
    else
      echo "PostgreSQL de l'instance ${id} (PID ${pid_pg}) actif sans serveur : reste d'un arrêt incomplet."
    fi
    pid_pg="$(pid_postgres_instance "${donnees}")"
  fi

  # État 3 : PostgreSQL à arrêter nous-mêmes (SIGINT = arrêt « fast » du postmaster).
  if [[ -n "${pid_pg}" ]]; then
    echo "Arrêt de PostgreSQL (postmaster PID ${pid_pg}, port ${port_pg}, SIGINT)."
    kill -INT "${pid_pg}" 2>/dev/null
    if ! attendre_borne "${delai_pg}" _processus_absent "${pid_pg}"; then
      echo "PostgreSQL (PID ${pid_pg}) ne s'est pas arrêté en ${delai_pg} s ; vérifiez : ss -ltnp | grep :${port_pg}" >&2
      return 1
    fi
  fi
  if [[ -n "$(pid_ecoute "${port_http}")" || -n "$(pid_ecoute "${port_pg}")" ]]; then
    echo "Ports encore occupés après l'arrêt : HTTP ${port_http} (PID $(pid_ecoute "${port_http}")), PostgreSQL ${port_pg} (PID $(pid_ecoute "${port_pg}"))." >&2
    return 1
  fi
  echo "Instance ${id} arrêtée : ports ${port_http} et ${port_pg} libérés."
  return 0
}

_processus_absent() { ! processus_vivant "$1"; }
_serveur_ecoute() { [[ -n "$(pid_ecoute "$1")" ]]; }
_serveur_arrete() { processus_vivant "$1" && return 1; [[ -z "$(pid_ecoute "$2")" ]]; }
_pg_arrete() { [[ -z "$(pid_postgres_instance "$2")" && -z "$(pid_ecoute "$1")" ]]; }

#!/usr/bin/env bash
# Lancement, arrêt et état des passerelles (une par port).
# Usage : scripts/passerelles.sh demarrer|arreter|etat [port ...]
# Réglages : instance/passerelles/<port>.env (chemins de fichiers seulement, jamais de secret en clair).
# Sans port en argument : tous les ports qui ont un fichier de réglages.
# PASSERELLE_SERVICES_REELS_EXTRA (vide par défaut) ajoute des services réels, par ex. « bce,bnb ».
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOSSIER="$RACINE/instance/passerelles"
EXTRA="${PASSERELLE_SERVICES_REELS_EXTRA:-}"

erreur() { echo "erreur : $*" >&2; }

ports_cibles() {
  if [ "$#" -gt 0 ]; then printf '%s\n' "$@"; return; fi
  local f
  for f in "$DOSSIER"/*.env; do
    [ -e "$f" ] || continue
    basename "$f" .env
  done
}

# Un pid est « notre » passerelle si c'est un node qui exécute demarrer.js avec PASSERELLE_PORT=<port>.
pid_valide() {
  local pid="$1" port="$2"
  [ -r "/proc/$pid/cmdline" ] || return 1
  tr '\0' ' ' < "/proc/$pid/cmdline" | grep -q 'demarrer\.js' || return 1
  tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | grep -qx "PASSERELLE_PORT=$port"
}

pid_du_port() {
  local port="$1" pid
  if [ -r "$DOSSIER/$port.pid" ]; then
    pid="$(cat "$DOSSIER/$port.pid" 2>/dev/null)"
    if [ -n "$pid" ] && pid_valide "$pid" "$port"; then echo "$pid"; return 0; fi
  fi
  # Repli : processus qui écoute sur le port (passerelle lancée à la main)
  pid="$(ss -ltnpH "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
  if [ -n "$pid" ] && pid_valide "$pid" "$port"; then echo "$pid"; return 0; fi
  return 1
}

demarrer_un() {
  local port="$1" fichier="$DOSSIER/$1.env"
  case "$port" in ''|*[!0-9]*) erreur "port invalide : $port"; return 1;; esac
  if [ ! -r "$fichier" ]; then erreur "fichier de réglages absent : $fichier"; return 1; fi
  if pid_du_port "$port" >/dev/null; then echo "port $port : déjà démarré (pid $(pid_du_port "$port"))"; return 0; fi
  if ss -ltnH "sport = :$port" 2>/dev/null | grep -q .; then erreur "port $port occupé par un autre processus"; return 1; fi
  if [ ! -f "$RACINE/passerelle/dist/src/demarrer.js" ]; then erreur "passerelle non compilée (passerelle/dist/src/demarrer.js)"; return 1; fi
  local node_bin; node_bin="$(command -v node)" || { erreur "node introuvable"; return 1; }

  # Environnement minimal : seules les variables du fichier, plus PATH et HOME.
  (
    cd "$RACINE/passerelle" || exit 1
    # shellcheck disable=SC2030
    nohup env -i PATH="$PATH" HOME="$HOME" EXTRA="$EXTRA" PORT="$port" FICHIER="$fichier" NODE="$node_bin" \
      bash -c '
        set -a; . "$FICHIER"; set +a
        export PASSERELLE_MODE="${PASSERELLE_MODE:-demonstration}" PASSERELLE_PORT="$PORT"
        if [ -n "$EXTRA" ]; then export PASSERELLE_SERVICES_REELS="${PASSERELLE_SERVICES_REELS:+$PASSERELLE_SERVICES_REELS,}$EXTRA"; fi
        exec "$NODE" dist/src/demarrer.js
      ' >> "$DOSSIER/$port.log" 2>&1 < /dev/null &
    echo $! > "$DOSSIER/$port.pid"
  )
  chmod 600 "$DOSSIER/$port.log" "$DOSSIER/$port.pid" 2>/dev/null
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fs --max-time 2 "http://127.0.0.1:$port/sante" >/dev/null 2>&1; then
      echo "port $port : démarré (pid $(cat "$DOSSIER/$port.pid"))"; return 0
    fi
    sleep 1
  done
  erreur "port $port : ne répond pas sous 10 s, voir $DOSSIER/$port.log"
  return 1
}

arreter_un() {
  local port="$1" pid i
  if ! pid="$(pid_du_port "$port")"; then
    echo "port $port : rien à arrêter"; rm -f "$DOSSIER/$port.pid"; return 0
  fi
  kill "$pid" 2>/dev/null
  for i in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$pid" 2>/dev/null || { rm -f "$DOSSIER/$port.pid"; echo "port $port : arrêté (pid $pid)"; return 0; }
    sleep 0.5
  done
  erreur "port $port : le pid $pid ne s'arrête pas (kill -TERM sans effet)"
  return 1
}

etat_un() {
  local port="$1" pid rep
  pid="$(pid_du_port "$port")" || pid="-"
  if rep="$(curl -fs --max-time 3 "http://127.0.0.1:$port/sante" 2>/dev/null)"; then
    echo "port $port : actif (pid $pid) services_reels=$(printf '%s' "$rep" | grep -o '"services_reels":\[[^]]*\]' | cut -d: -f2)"
  else
    echo "port $port : arrêté"
    return 1
  fi
}

usage() { echo "usage : $0 demarrer|arreter|etat [port ...]" >&2; }

commande="${1:-}"; [ "$#" -gt 0 ] && shift
mkdir -p "$DOSSIER" && chmod 700 "$DOSSIER"
codes=0
case "$commande" in
  demarrer) fn=demarrer_un;;
  arreter)  fn=arreter_un;;
  etat)     fn=etat_un;;
  *) usage; exit 2;;
esac
mapfile -t cibles < <(ports_cibles "$@")
if [ "${#cibles[@]}" -eq 0 ]; then erreur "aucun fichier de réglages dans $DOSSIER"; exit 1; fi
for p in "${cibles[@]}"; do "$fn" "$p" || codes=1; done
exit "$codes"

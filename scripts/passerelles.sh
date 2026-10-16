#!/usr/bin/env bash
# Lancement, arrêt et état des passerelles (une par port).
# Usage : scripts/passerelles.sh demarrer|arreter|etat [port ...]  (et dictee-demarrer|dictee-arreter|dictee-etat, voir plus bas)
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

# ---------------------------------------------------------------------------
# Dictée vocale locale : whisper-server (whisper.cpp), en boucle locale seulement.
# Usage : scripts/passerelles.sh dictee-demarrer|dictee-arreter|dictee-etat
# Réglages (variables d'environnement) : WHISPER_DOSSIER (défaut ~/.local/src/whisper.cpp),
# WHISPER_MODELE (défaut <dossier>/models/ggml-large-v3-turbo.bin), WHISPER_PORT (défaut 8178).
# Arrêt par le PID exact du fichier PID, après vérification que ce PID est bien notre whisper-server.
# ---------------------------------------------------------------------------
WHISPER_DOSSIER="${WHISPER_DOSSIER:-$HOME/.local/src/whisper.cpp}"
WHISPER_MODELE="${WHISPER_MODELE:-$WHISPER_DOSSIER/models/ggml-large-v3-turbo.bin}"
WHISPER_PORT="${WHISPER_PORT:-8178}"
WHISPER_PID="$DOSSIER/whisper-$WHISPER_PORT.pid"
WHISPER_LOG="$DOSSIER/whisper-$WHISPER_PORT.log"

whisper_pid_valide() {
  local pid="$1"
  [ -r "/proc/$pid/cmdline" ] || return 1
  tr '\0' '\n' < "/proc/$pid/cmdline" | head -1 | grep -q 'whisper-server$'
}

whisper_pid() {
  local pid
  [ -r "$WHISPER_PID" ] || return 1
  pid="$(cat "$WHISPER_PID" 2>/dev/null)"
  [ -n "$pid" ] && whisper_pid_valide "$pid" || return 1
  echo "$pid"
}

dictee_demarrer() {
  local bin="$WHISPER_DOSSIER/build/bin/whisper-server" i args
  [ -x "$bin" ] || { erreur "whisper-server absent ($bin)"; return 1; }
  [ -r "$WHISPER_MODELE" ] || { erreur "modèle absent ($WHISPER_MODELE)"; return 1; }
  if whisper_pid >/dev/null; then echo "dictée : déjà démarrée (pid $(whisper_pid))"; return 0; fi
  if ss -ltnH "sport = :$WHISPER_PORT" 2>/dev/null | grep -q .; then erreur "port $WHISPER_PORT occupé par un autre processus"; return 1; fi
  args=(-m "$WHISPER_MODELE" -l fr --host 127.0.0.1 --port "$WHISPER_PORT")
  # --convert : ffmpeg convertit le webm et l'ogg du navigateur en wav.
  if command -v ffmpeg >/dev/null 2>&1; then args+=(--convert); fi
  nohup "$bin" "${args[@]}" >> "$WHISPER_LOG" 2>&1 < /dev/null &
  echo $! > "$WHISPER_PID"
  chmod 600 "$WHISPER_LOG" "$WHISPER_PID" 2>/dev/null
  # Le chargement du modèle prend quelques secondes (jusqu'à 60 s sur CPU).
  for i in $(seq 1 60); do
    if curl -fs --max-time 2 "http://127.0.0.1:$WHISPER_PORT/" >/dev/null 2>&1; then
      echo "dictée : démarrée (pid $(cat "$WHISPER_PID"), port $WHISPER_PORT)"; return 0
    fi
    whisper_pid >/dev/null || { erreur "dictée : le processus s'est arrêté, voir $WHISPER_LOG"; return 1; }
    sleep 1
  done
  erreur "dictée : ne répond pas sous 60 s, voir $WHISPER_LOG"
  return 1
}

dictee_arreter() {
  local pid i
  if ! pid="$(whisper_pid)"; then echo "dictée : rien à arrêter"; rm -f "$WHISPER_PID"; return 0; fi
  kill "$pid" 2>/dev/null
  for i in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || { rm -f "$WHISPER_PID"; echo "dictée : arrêtée (pid $pid)"; return 0; }
    sleep 0.5
  done
  erreur "dictée : le pid $pid ne s'arrête pas (kill -TERM sans effet)"
  return 1
}

dictee_etat() {
  local pid="-"
  pid="$(whisper_pid)" || pid="-"
  if curl -fs --max-time 3 "http://127.0.0.1:$WHISPER_PORT/" >/dev/null 2>&1; then
    echo "dictée : active (pid $pid, port $WHISPER_PORT)"
  else
    echo "dictée : arrêtée"; return 1
  fi
}

usage() { echo "usage : $0 demarrer|arreter|etat [port ...] | dictee-demarrer|dictee-arreter|dictee-etat" >&2; }

commande="${1:-}"; [ "$#" -gt 0 ] && shift
mkdir -p "$DOSSIER" && chmod 700 "$DOSSIER"
case "$commande" in
  dictee-demarrer) dictee_demarrer; exit $?;;
  dictee-arreter)  dictee_arreter; exit $?;;
  dictee-etat)     dictee_etat; exit $?;;
esac
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

#!/usr/bin/env bash
# Contrôle statique des unités systemd du dépôt (EXP-C5) : aucune unité installée, aucun systemctl.
# - chaque service atelier-* appelle atelier-alerte@ en cas d'échec (sauf l'alerte elle-même) ;
# - chaque service qui redémarre seul a une limite de démarrages, pour finir en « failed » et alerter
#   au lieu de boucler (53 redémarrages le 25/10).
# Usage : scripts/tests/tester-unites-systemd.sh   (code 0 si tout passe)
set -uo pipefail

DOSSIER="$(cd "$(dirname "${BASH_SOURCE[0]}")/../systemd" && pwd)"
ECHECS=0; TOTAL=0
echec() { echo "ECHEC  $1"; ECHECS=$((ECHECS + 1)); }

# valeur <fichier> <section> <clé> : dernière valeur de la clé dans la section.
valeur() {
  awk -v s="[$2]" -v k="$3" '/^\[/{dans=($0==s)} dans && index($0, k"=")==1 {v=substr($0, length(k)+2)} END{print v}' "$1"
}

for f in "${DOSSIER}"/atelier-*.service; do
  nom="$(basename "${f}")"
  TOTAL=$((TOTAL + 1))
  if [[ "${nom}" != "atelier-alerte@.service" ]]; then
    [[ "$(valeur "${f}" Unit OnFailure)" == "atelier-alerte@%n.service" ]] || { echec "${nom} : OnFailure=atelier-alerte@%n.service absent de [Unit]"; continue; }
  else
    [[ -z "$(valeur "${f}" Unit OnFailure)" ]] || { echec "${nom} : l'alerte ne doit pas s'appeler elle-même"; continue; }
  fi
  if [[ -n "$(valeur "${f}" Service Restart)" ]]; then
    intervalle="$(valeur "${f}" Unit StartLimitIntervalSec)"; rafale="$(valeur "${f}" Unit StartLimitBurst)"
    redemarrage="$(valeur "${f}" Service RestartSec)"
    [[ "${intervalle}" =~ ^[1-9][0-9]*$ && "${rafale}" =~ ^[1-9][0-9]*$ ]] \
      || { echec "${nom} : Restart= sans StartLimitIntervalSec ni StartLimitBurst chiffrés (intervalle « ${intervalle} », rafale « ${rafale} »)"; continue; }
    # La limite doit pouvoir être atteinte : rafale × RestartSec sous l'intervalle.
    (( rafale * ${redemarrage:-0} < intervalle )) \
      || { echec "${nom} : ${rafale} × RestartSec=${redemarrage} dépasse StartLimitIntervalSec=${intervalle}, la boucle ne s'arrête jamais"; continue; }
  fi
  echo "OK     ${nom}"
done

# Contrôle de santé : une anomalie (code 1) se notifie elle-même ; seul un plantage du script déclenche l'alerte.
TOTAL=$((TOTAL + 1))
if [[ "$(valeur "${DOSSIER}/atelier-sante@.service" Service SuccessExitStatus)" == "1" ]]; then
  echo "OK     atelier-sante@.service : code 1 (anomalie notifiée par le script) sans double alerte"
else
  echec "atelier-sante@.service : SuccessExitStatus=1 attendu (sinon chaque anomalie alerte deux fois)"
fi

# Arrêt volontaire (deployer.sh : systemctl stop) : Umami sort en 143 (SIGTERM) et listmonk en 2 (journal : 10 et 11 arrêts,
# toujours ce code, jamais d'autre sortie). Sans SuccessExitStatus, systemd marque l'unité « failed » et OnFailure alerte à tort.
for couple in "atelier-umami.service:143" "atelier-listmonk.service:2"; do
  TOTAL=$((TOTAL + 1))
  if [[ "$(valeur "${DOSSIER}/${couple%%:*}" Service SuccessExitStatus)" == "${couple#*:}" ]]; then
    echo "OK     ${couple%%:*} : SuccessExitStatus=${couple#*:} (arrêt volontaire sans fausse alerte)"
  else
    echec "${couple%%:*} : SuccessExitStatus=${couple#*:} attendu (sinon chaque arrêt volontaire alerte à tort)"
  fi
done

# L'alerte envoie aussi un courriel (EXP-C3) et une notification bureau ratée ne l'empêche pas.
TOTAL=$((TOTAL + 1))
alerte="${DOSSIER}/atelier-alerte@.service"
if grep -q '^ExecStart=-/usr/bin/notify-send' "${alerte}" && grep -q '^ExecStart=.*scripts/alerte-courriel.sh --journal %i ' "${alerte}"; then
  echo "OK     atelier-alerte@.service : notification bureau facultative puis courriel"
else
  echec "atelier-alerte@.service : « ExecStart=-/usr/bin/notify-send » puis « ExecStart=…scripts/alerte-courriel.sh --journal %i » attendus"
fi

# EXP-C9 : l'instance tourne hors production (journal pino-pretty, niveau « debug » par défaut) ; le niveau « info »
# explicite est nécessaire pour que les GET réussis passés au niveau debug par le socle quittent le journal.
TOTAL=$((TOTAL + 1))
if grep -q '^Environment=PAPERCLIP_LOG_LEVEL=info$' "${DOSSIER}/atelier-instance@.service"; then
  echo "OK     atelier-instance@.service : niveau de journal info"
else
  echec "atelier-instance@.service : Environment=PAPERCLIP_LOG_LEVEL=info attendu"
fi

# AFC-A13 : l'instance (serveur tsx, PostgreSQL et processus des agents dans le même cgroup, pic mesuré 3,19 Go le
# 30/10/2026) a une limite DOUCE : au-delà, le noyau la freine au lieu de laisser le poste entier manquer de mémoire.
TOTAL=$((TOTAL + 1))
if [[ "$(valeur "${DOSSIER}/atelier-instance@.service" Service MemoryHigh)" =~ ^[0-9]+G$ && -z "$(valeur "${DOSSIER}/atelier-instance@.service" Service MemoryMax)" ]]; then
  echo "OK     atelier-instance@.service : MemoryHigh en Go, sans MemoryMax (pas d'arrêt brutal)"
else
  echec "atelier-instance@.service : MemoryHigh=<n>G attendu, sans MemoryMax"
fi

echo "---"; echo "${TOTAL} tests, ${ECHECS} échec(s)"
[[ "${ECHECS}" -eq 0 ]]

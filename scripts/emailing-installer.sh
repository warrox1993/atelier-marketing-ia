#!/usr/bin/env bash
# Installation (idempotente) de l'e-mailing de l'atelier : listmonk v6.2.0 + PostgreSQL 18.6 + Mailpit v1.31.6,
# en Podman rootless sous unités systemd utilisateur, ports liés à 127.0.0.1 seulement.
#   - listmonk http://127.0.0.1:19000 ; Mailpit (SMTP seulement sur le réseau Podman, interface/API http://127.0.0.1:18025 avec mot de passe) ;
#   - la base n'a AUCUN port publié (réseau Podman dédié « atelier-emailing ») ;
#   - identifiants générés au premier lancement dans ~/.config/atelier/ (0600), jamais affichés ;
#   - tout l'envoi va à Mailpit tant que le SMTP réel n'est pas configuré : rien ne sort de la machine.
# Usage : scripts/emailing-installer.sh [--sans-demarrage]
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$HOME/.config/atelier"
UNITES=(atelier-emailing-db atelier-mailpit atelier-listmonk)
erreur() { echo "erreur : $*" >&2; }

command -v podman >/dev/null || { erreur "podman est introuvable"; exit 1; }
command -v openssl >/dev/null || { erreur "openssl est introuvable"; exit 1; }

# 1. Secrets (créés une seule fois, 0600, jamais affichés ni versionnés)
umask 077
mkdir -p "$CONFIG" "$RACINE/instance/emailing/pg" "$RACINE/instance/emailing/mailpit" || exit 1
if [ ! -s "$CONFIG/emailing-db.mdp" ]; then openssl rand -hex 24 > "$CONFIG/emailing-db.mdp" || exit 1; fi
if [ ! -s "$CONFIG/emailing-listmonk.env" ]; then
  printf 'LISTMONK_ADMIN_USER=atelier-admin\nLISTMONK_ADMIN_PASSWORD=%s\n' "$(openssl rand -hex 24)" > "$CONFIG/emailing-listmonk.env" || exit 1
fi
# Identifiants de l'interface et de l'API de Mailpit : « utilisateur:mot de passe » (lu par le test d'intégration réelle) et son htpasswd (apr1).
if [ ! -s "$CONFIG/emailing-mailpit.jeton" ] || [ ! -s "$CONFIG/emailing-mailpit.htpasswd" ]; then
  mdp_mailpit="$(openssl rand -hex 24)" || exit 1
  printf 'atelier-mailpit:%s\n' "$mdp_mailpit" > "$CONFIG/emailing-mailpit.jeton" || exit 1
  printf 'atelier-mailpit:%s\n' "$(openssl passwd -apr1 -stdin <<<"$mdp_mailpit")" > "$CONFIG/emailing-mailpit.htpasswd" || exit 1
  unset mdp_mailpit
fi
chmod 600 "$CONFIG/emailing-db.mdp" "$CONFIG/emailing-listmonk.env" "$CONFIG/emailing-mailpit.jeton" "$CONFIG/emailing-mailpit.htpasswd"

# 2. Images épinglées (jamais « latest », jamais la v7 bêta de listmonk)
for image in docker.io/library/postgres:18.6 docker.io/listmonk/listmonk:v6.2.0 docker.io/axllent/mailpit:v1.31.6; do
  podman image exists "$image" || podman pull -q "$image" >/dev/null || { erreur "téléchargement de $image impossible"; exit 1; }
done

# 3. Unités systemd utilisateur
mkdir -p "$HOME/.config/systemd/user" || exit 1
for u in "${UNITES[@]}"; do
  install -m 644 "$RACINE/scripts/systemd/$u.service" "$HOME/.config/systemd/user/" || exit 1
done
systemctl --user daemon-reload || exit 1
[ "${1:-}" = "--sans-demarrage" ] && { echo "unités installées, services non démarrés"; exit 0; }
systemctl --user enable --now atelier-emailing-db atelier-mailpit atelier-listmonk || exit 1

# 4. Attente de listmonk puis provisionnement (rôles, jetons, SMTP de test, gabarit)
for _ in $(seq 1 60); do
  curl -s -o /dev/null --max-time 3 http://127.0.0.1:19000/admin/login && break
  sleep 2
done
curl -s -o /dev/null --max-time 3 http://127.0.0.1:19000/admin/login || { erreur "listmonk ne répond pas sur 127.0.0.1:19000"; exit 1; }
python3 -I "$RACINE/scripts/emailing-provisionner.py" || exit 1
echo "e-mailing prêt : listmonk 127.0.0.1:19000, Mailpit 127.0.0.1:18025 (identifiants dans ~/.config/atelier/emailing-mailpit.jeton ; envoi de test, rien ne part)"

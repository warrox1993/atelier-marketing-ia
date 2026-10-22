#!/usr/bin/env bash
# Installe Umami 3.4.0 + PostgreSQL 18.6 en Podman rootless sous unités systemd utilisateur.
# Idempotent : les secrets existants sont conservés. Rien n'est écrit dans le dépôt.
set -uo pipefail

DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="$HOME/.config/atelier"
UNITES="$HOME/.config/systemd/user"
URL="http://127.0.0.1:3196"

echec() { echo "ERREUR : $*" >&2; exit 1; }

umask 077
mkdir -p "$CONF" "$UNITES" || echec "création des répertoires impossible"

if [ ! -f "$CONF/umami-db.env" ] || [ ! -f "$CONF/umami.env" ]; then
  mdp_base="$(openssl rand -hex 24)" || echec "openssl indisponible"
  printf 'POSTGRES_DB=umami\nPOSTGRES_USER=umami\nPOSTGRES_PASSWORD=%s\n' "$mdp_base" > "$CONF/umami-db.env" || echec "écriture umami-db.env"
  printf 'DATABASE_URL=postgresql://umami:%s@atelier-umami-db:5432/umami\nAPP_SECRET=%s\nTWO_FACTOR_ENCRYPTION_KEY=%s\n' \
    "$mdp_base" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > "$CONF/umami.env" || echec "écriture umami.env"
  echo "Secrets d'Umami générés."
fi
chmod 600 "$CONF/umami-db.env" "$CONF/umami.env" || echec "chmod secrets"

podman pull docker.io/library/postgres:18.6 >/dev/null || echec "pull postgres"
podman pull ghcr.io/umami-software/umami:3.4.0 >/dev/null || echec "pull umami"

for u in atelier-umami-db atelier-umami; do
  install -m 644 "$DEPOT/scripts/systemd/$u.service" "$UNITES/" || echec "installation de $u"
done
systemctl --user daemon-reload || echec "daemon-reload"
systemctl --user enable --now atelier-umami-db atelier-umami || echec "démarrage des unités"

echo "Attente d'Umami (premier démarrage : migrations de la base)..."
for _ in $(seq 1 60); do
  if curl -sf "$URL/api/heartbeat" >/dev/null 2>&1; then
    echo "Umami répond sur $URL"
    break
  fi
  sleep 5
done
curl -sf "$URL/api/heartbeat" >/dev/null 2>&1 || echec "Umami ne répond pas (journalctl --user -u atelier-umami)"

# Compte administrateur : Umami est livré avec admin/umami. On remplace ce mot de passe une seule fois ;
# le nouveau est rangé dans ~/.config/atelier/umami-admin.env (0600).
if [ ! -f "$CONF/umami-admin.env" ]; then
  nouveau="$(openssl rand -hex 24)" || echec "openssl"
  jeton="$(curl -sf -X POST "$URL/api/auth/login" -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"umami"}' | python3 -I -c 'import sys,json;print(json.load(sys.stdin)["token"])')" \
    || echec "connexion admin/umami refusée (mot de passe déjà changé hors de ce script ?)"
  id_admin="$(curl -sf "$URL/api/auth/verify" -X POST -H "Authorization: Bearer $jeton" | python3 -I -c 'import sys,json;print(json.load(sys.stdin)["id"])')" \
    || echec "lecture de l'identifiant admin"
  curl -sf -X POST "$URL/api/users/$id_admin" -H "Authorization: Bearer $jeton" -H 'Content-Type: application/json' \
    -d "{\"password\":\"$nouveau\"}" >/dev/null || echec "changement du mot de passe admin"
  printf 'UMAMI_URL=%s\nUMAMI_UTILISATEUR=admin\nUMAMI_MOT_DE_PASSE=%s\n' "$URL" "$nouveau" > "$CONF/umami-admin.env" || echec "écriture umami-admin.env"
  chmod 600 "$CONF/umami-admin.env"
  echo "Mot de passe admin d'Umami remplacé (fichier $CONF/umami-admin.env)."
fi
echo "Installation d'Umami terminée."

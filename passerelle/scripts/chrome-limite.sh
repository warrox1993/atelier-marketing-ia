#!/usr/bin/env bash
# Lance Chrome dans un scope systemd utilisateur limité à 2 Go de mémoire (audit de pages : un site tiers ne doit pas
# pouvoir épuiser la mémoire du poste). Les arguments sont transmis tels quels à Chrome ; les descripteurs hérités (tube de
# débogage 3 et 4) sont conservés, car systemd-run --scope remplace ce processus par la commande.
# Le nom du scope vient de ATELIER_AUDIT_SCOPE (l'appelant l'arrête explicitement à la fin), sinon il est tiré du pid.
set -uo pipefail

CHROME="${CHROME_REEL:-/usr/bin/google-chrome}"
# La passerelle est lancée avec un environnement minimal : retrouver le gestionnaire systemd de l'utilisateur.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

if ! command -v systemd-run >/dev/null 2>&1; then
  echo "chrome-limite : systemd-run introuvable, Chrome n'est pas lancé sans limite de mémoire." >&2
  exit 127
fi
exec systemd-run --user --scope --quiet --collect \
  --unit="${ATELIER_AUDIT_SCOPE:-atelier-audit-$$}" \
  -p MemoryMax=2G -p MemorySwapMax=0 \
  "$CHROME" "$@"

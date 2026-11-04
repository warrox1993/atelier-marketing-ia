#!/usr/bin/env bash
# Bascule une instance de l'atelier du mode local_trusted (toute requête locale sans jeton = administrateur
# « local-board ») au mode authenticated (connexion par compte), et retour. Mode d'emploi : docs/mode-authentifie.md.
#
# Usage :
#   scripts/passer-en-mode-authentifie.sh [--a-blanc]                 instance réelle (port de config/atelier.env)
#   scripts/passer-en-mode-authentifie.sh --essai [ID PORT PORT_PG]   instance d'essai (défaut atelier-e2e 3590 54790)
#   scripts/passer-en-mode-authentifie.sh [--essai …] --revenir       retour au mode local_trusted
# Options : --a-blanc (liste sans rien écrire), --redemarrer (instance réelle : redémarre par systemd sans s'arrêter),
#           --delai-minutes N (attente des gestes de l'opérateur, défaut 30).
# Idempotent : relancer reprend à l'étape suivante. Code 3 = geste de l'opérateur ou redémarrage attendu, relancer ensuite.
# Aucune clé ni URL de réclamation n'est écrite dans un fichier suivi : la clé va dans ~/.config/atelier/board-<port>.key
# (0600), l'URL de réclamation n'est qu'affichée.
set -uo pipefail
command -v psql >/dev/null 2>&1 || { echo "psql est requis (sudo apt install postgresql-client)." >&2; exit 2; }
exec python3 -I "$(dirname "${BASH_SOURCE[0]}")/passer-en-mode-authentifie.py" "$@"

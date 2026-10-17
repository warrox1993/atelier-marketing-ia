# Phoenix : traces de l'atelier, sur le PC

Arize Phoenix (licence Elastic 2.0, gratuit en auto-hébergement) reçoit les traces de l'atelier : verdicts du
relecteur et de la porte, décisions humaines et cycles de correction, regroupés par tâche. Tout reste sur le PC.

## Service

- Version : `arize-phoenix==20.23.0` (dernière version finale au 17/10/2026, ni préversion ni RC : PyPI et
  release GitHub `prerelease=false`), dans le venv `~/.local/share/atelier-phoenix/venv`.
- Unité utilisateur : `scripts/systemd/atelier-phoenix.service`, installée dans `~/.config/systemd/user/`
  (commandes d'installation en tête du fichier). `systemctl --user status atelier-phoenix`,
  `journalctl --user -u atelier-phoenix`.
- Interface : http://127.0.0.1:6006 (OTLP HTTP sur `/v1/traces`, gRPC sur 127.0.0.1:4317).
- Écoute sur 127.0.0.1 seulement : `PHOENIX_HOST=127.0.0.1` pour le web et l'OTLP HTTP ; le collecteur gRPC de
  Phoenix s'ouvre en dur sur toutes les interfaces, d'où `scripts/phoenix-lancer.py`, qui le ramène sur
  127.0.0.1 et refuse de démarrer s'il ne le peut pas. Contrôle : `ss -ltnp | grep -E ':(6006|4317)\b'`.
- Ni télémétrie ni ressource Internet (`PHOENIX_TELEMETRY_ENABLED=false`, `PHOENIX_ALLOW_EXTERNAL_RESOURCES=false`).
- Données (SQLite) : `~/.local/share/atelier-phoenix/donnees`.

## Exporteur

```sh
PGPASSWORD=<mot de passe de l'instance> ~/.local/share/atelier-phoenix/venv/bin/python -I \
  scripts/phoenix-exporter.py --pg-port 54329 [--a-blanc] [--entreprise UUID]
```

- Lit la table `journal` du plugin en lecture seule (`BEGIN READ ONLY`), comme `bootstrap-organisation.py`.
- Une trace par tâche (span racine `tache`, puis un span par évènement). Attributs `atelier.*` : entreprise,
  service, tâche, agent assigné et son rôle, compétences déclarées de l'agent, verdict et sa source
  (relecteur ou porte), motifs de la porte, décision humaine, nombre cumulé de corrections, cycles.
- Aucune donnée personnelle : ni commentaire ni texte libre lus ; toute valeur texte doit être un code sans
  espace ni « @ » ; un acteur qui n'est pas un agent n'apparaît que sous forme d'empreinte.
- Idempotent : état dans `~/.local/state/atelier-phoenix/exporteur-<port>-<schéma>.json` (hors dépôt). Code 2 si
  le journal est plus court que l'état (base recréée) : supprimer l'état pour tout réexporter.
- Tests : `~/.local/share/atelier-phoenix/venv/bin/python -I scripts/tests/tester-phoenix-exporter.py`.

### Export automatique (toutes les 15 minutes)

- Minuteur utilisateur versionné : `scripts/systemd/atelier-phoenix-export.service` (oneshot, lance l'exporteur sur
  l'instance 3100, `--pg-port 54329`) et `scripts/systemd/atelier-phoenix-export.timer` (5 min après le
  démarrage de la session, puis 15 min après chaque passage).
- Le mot de passe PostgreSQL n'est dans aucun fichier suivi : l'unité lit `EnvironmentFile=%h/.config/atelier/phoenix-export.env`
  (0600, hors dépôt). Le fichier d'exemple `config/phoenix-export.env.exemple` ne contient aucune valeur ; en local il
  porte la valeur par défaut documentée de l'instance embarquée (voir `scripts/restaurer-element.sh`).
- Installation :
  ```sh
  install -d -m 700 ~/.config/atelier
  install -m 600 config/phoenix-export.env.exemple ~/.config/atelier/phoenix-export.env   # puis renseigner PGPASSWORD
  install -m 644 scripts/systemd/atelier-phoenix-export.{service,timer} ~/.config/systemd/user/
  systemctl --user daemon-reload && systemctl --user enable --now atelier-phoenix-export.timer
  ```
- Contrôles : `systemctl --user list-timers atelier-phoenix-export.timer`, passage immédiat avec
  `systemctl --user start atelier-phoenix-export.service`, puis `journalctl --user -u atelier-phoenix-export -n 20`
  (code 0 attendu). Un échec (instance 3100 arrêtée, mauvais mot de passe) laisse le service en échec dans le journal ;
  l'exporteur étant idempotent, le passage suivant rattrape le retard.

## Sauvegarde

`scripts/sauvegarde-hors-machine.sh` copie aussi la base de Phoenix (`phoenix.db` sous
`~/.local/share/atelier-phoenix/donnees`, option `--phoenix <dossier>` pour un autre emplacement) vers
`phoenix/phoenix.db` dans la copie datée, avec empreinte sha256 comme le reste. La base étant en mode WAL, elle n'est
jamais copiée comme un simple fichier : l'API de sauvegarde SQLite (`sqlite3 … ".backup"`, à défaut `python3 -I` avec
`sqlite3.Connection.backup`) produit une image cohérente pendant que Phoenix écrit, sans l'arrêter, puis un
`integrity_check` la valide. Dossier Phoenix absent : message clair sur la sortie d'erreur, la sauvegarde continue.
Test : `scripts/tests/tester-sauvegarde-hors-machine.sh` (base factice en WAL avec écriture non validée en cours).

Les traces bêta de Claude Code (`CLAUDE_CODE_ENHANCED_TELEMETRY_BETA`) ne sont jamais utilisées.

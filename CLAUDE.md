# Atelier Marketing IA : interdits de l'usine

- Ne jamais modifier `paperclip/` (socle tiers) ni `socle/patches/` (correctifs figés).
- Les e2e tournent sur une instance neuve (3590/54790). Après chaque fusion dans main : déploiement sur 3100 (`scripts/deployer.sh` puis `bootstrap-organisation.py mettre-a-jour-client`, procédure `docs/observatoire/deploiement-phase-3.md`) et republication du dépôt public (`scripts/publier.sh`).
- Le Gardien exécute la copie principale contre 3100 : elle ne se synchronise qu'après fusion, par `guarded-merge.sh`.
- Aucun run d'agent de l'usine depuis Claude Code.
- Jamais le nom du client dans le dépôt, ni aucun secret.
- Migrations de plugin additives seulement : le socle refuse `DROP` et `DELETE FROM`, et une migration existante ne se réécrit pas.
- `organisation/agents/*/AGENTS.md` : la source est au-dessus du marqueur, le reste se régénère par `python3 -I scripts/bootstrap-organisation.py generer` ; leur total ne grandit pas.
- Circuit Tagout : issue, branche, PR, fusion squash ; commits et pushs par les gardes du kit.
- Pas de GitHub Actions : CI locale, commandes dans `.claude/skills/repo-profile.md`.
- Tout en français : code, commentaires, messages, documents.

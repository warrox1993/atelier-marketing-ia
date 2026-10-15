# Checklist avant utilisation réelle

À cocher par l'opérateur avant de confier un vrai client à l'atelier. Chaque ligne renvoie à la preuve
ou à la procédure. Rien ici n'est fait automatiquement.

## Accès nécessaires

- [ ] Jeton d'abonnement Claude créé par l'opérateur lui-même (`claude setup-token`), enregistré dans le
      coffre de secrets natif de Paperclip, jamais dans un fichier (`README.md`, « Activer le
      mode réel »).
- [ ] Un `CLAUDE_CONFIG_DIR` dédié par agent (`instance/claude-config/<slug>/`), jamais
      le `~/.claude` de l'opérateur (`docs/guide-agents-competences.md`).
- [ ] Budgets mensuels posés par agent et par entreprise (`docs/exploitation.md` §5).
- [ ] Une entreprise Paperclip par client (frontière dure d'isolement ; deux projets d'une
      même entreprise ne sont pas isolés entre eux).

## Contrôles techniques

- [ ] `scripts/verifier-config.sh` : configuration conforme (boucle locale, télémétrie coupée,
      aucun secret).
- [ ] Sauvegarde puis restauration rejouées sur une instance d'essai avec `pg_dump`
      (`docs/exploitation.md` §4) ; dossier `data/backups/` copié hors machine.
- [ ] Un run réel minimal d'un agent `claude_local` en mode réel, sur une campagne de test,
      avec plafond de budget bas ; vérifier dans « Équipe » que les compétences passent à la
      source « dernier run » avec leur empreinte.
- [ ] Lecture d'URL : en réel, interdire `curl` vers l'extérieur dans les outils autorisés et
      passer par les routes du plugin (l'outil d'agent n'est pas branché).

## Limites constatées à accepter ou à lever

- Aucun connecteur de diffusion ni de mesure : rien n'est publié, envoyé ni mesuré
  automatiquement ; une diffusion approuvée reste « préparée » (`docs/integrations.md`).
- Recherche Web non connectée.
- Pause et reprise de campagne indisponibles (limite du socle) : mettre en pause les agents.
- Reprise après arrêt du serveur : la tâche interrompue reste bloquée jusqu'à la
  réconciliation humaine native (`REPRISE.md`, scénario E).
- Système de plugins « alpha surface » selon l'amont (utilisé par choix explicite de l'opérateur).
- Base embarquée mono-machine ; une seule personne (`local_trusted`).
- Un livrable non conforme n'est jamais accepté : au-delà des cycles, seule la relance humaine
  (au moins un levier) le remet en production.

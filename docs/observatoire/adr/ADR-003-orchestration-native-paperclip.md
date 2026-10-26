# ADR-003 : réutiliser l'orchestration native de Paperclip

- **Statut** : Accepté
- **Décision de référence** : D2 du plan

## Contexte

Le pipeline de veille et de publication a besoin de planification, de files, de reprises, de budgets, d'approbations
humaines et de surveillance. Écrire un orchestrateur propre ajouterait une couche à maintenir et à tester, alors que
Paperclip fournit déjà ces mécanismes.

## Décision

Aucune nouvelle couche d'orchestration. L'Observatoire s'appuie sur :

- les **routines** (déclenchement cron, API ou webhook) pour le calendrier hebdomadaire ;
- les services `work-scheduler` et `plugin-job-scheduler` pour les jobs de plugin (collecte, diff, export) ;
- les **budgets** par agent et par service, avec réservations, et l'arrêt bloquant en cas de dépassement ;
- les **approbations** pour toute publication et tout essai en VM ;
- le **watchdog** et les reprises bornées pour les tâches bloquées ;
- les tâches (issues), l'activité (journal d'audit) et les rôles utilisateur du mode authentifié.

Le plugin ajoute uniquement ce qui manque : les tables `obs_*` (ADR-004), les jobs de collecte et d'export, la porte.

## Options écartées et pourquoi

- **Orchestrateur maison (file, planificateur, reprises)** : doublon de l'existant, surface de bogues et de sécurité
  en plus.
- **Outil externe (Airflow, n8n, cron système)** : une seconde source de vérité pour l'état des tâches, sans les
  budgets ni les approbations de Paperclip.

## Conséquences

- Positives : peu de code neuf ; budgets et approbations déjà éprouvés ; une seule interface de pilotage.
- Négatives : dépendance au socle Paperclip et à ses évolutions (voir `docs/mise-a-jour-socle.md`) ; les limites
  des routines natives s'imposent au calendrier. Le back-office est l'interface Paperclip enrichie de rubriques du
  plugin, sans administration séparée (D7).

## Références

- Plan : Livrable A (D2, D7), B.2 (composants), D.4 (mécanismes du cahier déjà présents), I.1 (chaîne et états).
- Dépôt : `paperclip/server/src/services/` (work-scheduler, plugin-job-scheduler, watchdog), `docs/architecture.md`,
  `docs/mise-a-jour-socle.md`.

# 10. L'open source face aux contributions écrites par l'IA

**Catégorie du site** : `outils-de-code` (IA.3).
**Remplace l'exemple** : « L'IA dans les équipes produit ».

## Angle

Une enquête de la Linux Foundation chiffre les deux faces de l'IA dans l'open source : la moitié du temps d'écriture de code gagné, mais un quart des pull requests entrantes jugées de mauvaise qualité. Au même moment, PostgreSQL 19 est retardé parce que la relecture assistée par IA trouve plus de défauts que les mainteneurs ne peuvent en corriger. Pour un développeur, c'est la question de ce qu'il envoie à un projet. Pour un décideur qui dépend de logiciels libres, c'est la charge des mainteneurs qui devient un risque.

## Public visé

Développeurs contributeurs, mainteneurs, responsables techniques qui dépendent de projets open source.

## Faits sourcés

| Fait | URL | Date | Extrait exact | Statut |
| --- | --- | --- | --- | --- |
| Un quart des pull requests entrantes est estimé de mauvaise qualité, produit par l'IA | https://www.linuxfoundation.org/press/new-lf-research-survey-shows-generative-ai-cuts-open-source-coding-time-in-half-but-25-of-incoming-pull-requests-are-considered-ai-slop | 20/10/2026 | 25% of incoming pull requests (PRs) are estimated to be low-quality “AI slop.” | rapporte_editeur |
| 59 % des mainteneurs voient les contributions augmenter, 69 % dans les gros projets | https://www.linuxfoundation.org/press/new-lf-research-survey-shows-generative-ai-cuts-open-source-coding-time-in-half-but-25-of-incoming-pull-requests-are-considered-ai-slop | 20/10/2026 | While 59% of maintainers report growing contribution volume since the rise of GenAI, increasing to 69% among large projects | rapporte_editeur |
| Gain de temps estimé de 52 % sur l'écriture de code, mais 21 % mettent plus de temps sur les tâches complexes | https://www.linuxfoundation.org/press/new-lf-research-survey-shows-generative-ai-cuts-open-source-coding-time-in-half-but-25-of-incoming-pull-requests-are-considered-ai-slop | 20/10/2026 | For high-complexity tasks, however, 21% of respondents report taking more time when using GenAI. | rapporte_editeur |
| 53 % des mainteneurs ne pensent pas que l'IA a amélioré la confiance dans la communauté | https://www.linuxfoundation.org/press/new-lf-research-survey-shows-generative-ai-cuts-open-source-coding-time-in-half-but-25-of-incoming-pull-requests-are-considered-ai-slop | 20/10/2026 | 53% of maintainers disagree that GenAI has improved community trust | rapporte_editeur |
| Seuls 35 % des projets ont une politique formelle sur l'IA, 32 % n'en ont aucune | https://www.linuxfoundation.org/press/new-lf-research-survey-shows-generative-ai-cuts-open-source-coding-time-in-half-but-25-of-incoming-pull-requests-are-considered-ai-slop | 20/10/2026 | Only 35% of projects have a formal policy permitting GenAI use, while 32% have no policy and no plans for one. | rapporte_editeur |
| PostgreSQL 19 est attendu vers le 19 novembre au lieu de fin septembre ou début octobre | https://www.theregister.com/databases/2026/10/16/postgres-19-delayed-after-ai-reviewers-find-more-bugs-than-humans-can-fix/5303471 | 16/10/2026 | PostgreSQL 19 is now expected to be generally available around November 19 | rapporte_tiers |
| Huit à dix fonctions importantes ont été retirées de la version | https://www.theregister.com/databases/2026/10/16/postgres-19-delayed-after-ai-reviewers-find-more-bugs-than-humans-can-fix/5303471 | 16/10/2026 | Developers have also dropped between eight and 10 significant features. | rapporte_tiers |
| Selon Peter Eisentraut, la relecture assistée par IA a relevé le niveau d'exigence après coup | https://www.theregister.com/databases/2026/10/16/postgres-19-delayed-after-ai-reviewers-find-more-bugs-than-humans-can-fix/5303471 | 16/10/2026 | The effective quality bar has been raised after the time the feature was written and committed. | rapporte_tiers |
| Il précise que la cause n'est pas le « vibe coding » | https://www.theregister.com/databases/2026/10/16/postgres-19-delayed-after-ai-reviewers-find-more-bugs-than-humans-can-fix/5303471 | 16/10/2026 | the reverts were not down to “vibe coding” in development | rapporte_tiers |

## Questions ouvertes

- Méthode de l'enquête (taille de l'échantillon, dates) : dans le rapport complet, non lu.
- L'enquête est financée par Red Hat d'après le communiqué : à mentionner.
- Le billet d'origine de Peter Eisentraut date du 09/10/2026, hors période : à lire et citer comme contexte, pas comme fait de la semaine.
- La décision du forum r/opensource d'exclure les projets assistés par IA (rapportée par heise et The Register le 26/10/2026) n'a pas pu être lue à la source : écartée de ce dossier.

## Sources complémentaires à lire

- https://www.linuxfoundation.org/research/oss-development-gen-ai-era-2026 (rapport complet)
- https://peter.eisentraut.org/blog/2026/10/09/the-reverts-will-continue-until-morale-improves (billet d'origine, 09/10/2026)
- https://www.infoq.cn/article/Q6mgHWCSqV6KeZzee3NT (traitement chinois de PostgreSQL 19, 23/10/2026)
- https://www.infoq.cn/article/9TSuUDxrUSGS26XTA2yB (traitement chinois de l'enquête, 25/10/2026)

## Plan proposé

1. Deux nouvelles, un même déséquilibre.
2. Ce que dit l'enquête de la Linux Foundation, chiffre par chiffre.
3. PostgreSQL 19 : quand la relecture par IA trouve trop.
4. Le paradoxe : de meilleurs outils, plus de travail pour les mainteneurs.
5. Les règles de contribution qui manquent.
6. Bonnes pratiques pour contribuer avec un assistant.

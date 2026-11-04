# Observatoire : registre initial des sources (proposition)

Statut : phase 1, proposition à valider par l'opérateur. Les cadences sont des valeurs de départ, ajustées selon l'activité de chaque source (voir I.2 du plan). Aucune URL n'est inventée : chaque ligne est marquée « vérifiée le 26/10/2026 » (réponse obtenue ce jour) ou « à vérifier par le collecteur ».

Types : primaire = publié par le titulaire ; secondaire = presse ou synthèse ; communautaire = contributions d'utilisateurs.
Une vérification porte sur la réponse de l'URL et la forme du flux, pas sur les conditions d'utilisation, à relire (voir `droits-collecte.md`).

## 1. Éditeurs de modèles et outils pour développeurs

| Nom | URL | Type | Méthode | Cadence | Licence ou conditions | Vérification |
| --- | --- | --- | --- | --- | --- | --- |
| Anthropic, actualités | https://www.anthropic.com/news | primaire | page (aucun lien de flux visible) | quotidienne | conditions du site à relire | vérifiée le 26/10/2026 (page répond, pas de flux repéré) |
| Claude Platform, notes de version | https://platform.claude.com/docs/en/release-notes/overview | primaire | page | quotidienne | conditions de la documentation à relire | vérifiée le 26/10/2026 |
| Claude Code, versions | https://github.com/anthropics/claude-code/releases.atom | primaire | Atom | quotidienne | licence du dépôt à relire | vérifiée le 26/10/2026 |
| OpenAI, actualités | https://openai.com/news/rss.xml | primaire | RSS | quotidienne | conditions du site à relire | vérifiée le 26/10/2026 |
| Google, blog IA | https://blog.google/technology/ai/rss/ | primaire | RSS | quotidienne | conditions du site à relire | vérifiée le 26/10/2026 |
| Hugging Face, blog | https://huggingface.co/blog/feed.xml | primaire | RSS | quotidienne | conditions du site à relire | vérifiée le 26/10/2026 |
| GitHub, changelog | https://github.blog/changelog/feed/ | primaire | RSS | quotidienne | conditions du site à relire | vérifiée le 26/10/2026 |
| Model Context Protocol, versions | https://github.com/modelcontextprotocol/modelcontextprotocol/releases.atom | primaire | Atom | hebdomadaire | licence du dépôt à relire | vérifiée le 26/10/2026 |
| Autres éditeurs de modèles (Mistral, Meta, Microsoft, xAI, DeepSeek, Alibaba/Qwen) et outils (VS Code, Cursor, JetBrains, etc.) | URL non listées ici | primaire | flux ou page officielle | quotidienne à hebdomadaire | à relire | à vérifier par le collecteur (URL à rechercher à la source) |

## 2. GitHub

| Nom | URL | Type | Méthode | Cadence | Licence ou conditions | Vérification |
| --- | --- | --- | --- | --- | --- | --- |
| Versions d'un projet suivi (modèle) | `https://github.com/<propriétaire>/<dépôt>/releases.atom` | primaire | Atom | quotidienne | licence de chaque dépôt | modèle vérifié le 26/10/2026 sur deux dépôts (rea, claude-code) |
| Pilote REA | https://github.com/morluto/rea/releases.atom | primaire | Atom | quotidienne | licence du dépôt à relire | vérifiée le 26/10/2026 (dernière entrée : rea-agents v6.8.0, 25/10/2026) |
| Recherche par sujets (`topic:mcp-server`, `topic:llm-agent`, autres) | https://api.github.com/search/repositories?q=topic:mcp-server | communautaire | API REST de recherche, authentifiée | hebdomadaire | 30 requêtes/minute ; conditions de l'API GitHub | documentation de la limite vérifiée le 26/10/2026 (docs.github.com/en/rest/search/search) ; requête à vérifier par le collecteur |

## 3. Registres de paquets

| Nom | URL | Type | Méthode | Cadence | Licence ou conditions | Vérification |
| --- | --- | --- | --- | --- | --- | --- |
| npm, dernière version d'un paquet (modèle) | `https://registry.npmjs.org/<paquet>/latest` | primaire | API JSON | quotidienne | conditions du registre à relire | vérifiée le 26/10/2026 (paquet astro, version 7.4.2) |
| PyPI, versions d'un paquet (modèle) | `https://pypi.org/rss/project/<paquet>/releases.xml` | primaire | RSS | quotidienne | conditions de PyPI à relire | vérifiée le 26/10/2026 (paquet anthropic, version 2.3.0) |

## 4. Recherche : arXiv

| Nom | URL | Type | Méthode | Cadence | Licence ou conditions | Vérification |
| --- | --- | --- | --- | --- | --- | --- |
| arXiv cs.AI | https://export.arxiv.org/rss/cs.AI | primaire | RSS | quotidienne | 1 requête/3 s ; métadonnées CC0 1.0 | vérifiée le 26/10/2026 |
| arXiv cs.CL | https://export.arxiv.org/rss/cs.CL | primaire | RSS | quotidienne | idem | à vérifier par le collecteur (même schéma d'URL que cs.AI) |
| arXiv cs.LG | https://export.arxiv.org/rss/cs.LG | primaire | RSS | quotidienne | idem | à vérifier par le collecteur (même schéma d'URL que cs.AI) |
| arXiv cs.MA | https://export.arxiv.org/rss/cs.MA | primaire | RSS | quotidienne | idem | à vérifier par le collecteur (même schéma d'URL que cs.AI) |

## 5. Textes officiels de l'UE sur l'IA

| Nom | URL | Type | Méthode | Cadence | Licence ou conditions | Vérification |
| --- | --- | --- | --- | --- | --- | --- |
| Commission européenne, page « AI Act » | https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai | primaire | page | mensuelle | règles de réutilisation de la Commission à relire | vérifiée le 26/10/2026 |
| Règlement (UE) 2024/1689 sur EUR-Lex | https://eur-lex.europa.eu/eli/reg/2024/1689/oj | primaire | page | mensuelle | règles de réutilisation d'EUR-Lex à relire | à vérifier par le collecteur (réponse vide à la lecture du 26/10/2026) |

## 6. Annuaires (jamais une preuve)

| Nom | URL | Type | Méthode | Cadence | Licence ou conditions | Vérification |
| --- | --- | --- | --- | --- | --- | --- |
| Listes « awesome » (par exemple awesome-mcp-servers, awesome-claude-code) | URL exacte à rechercher | communautaire | lecture du dépôt via l'API GitHub | mensuelle | licence de chaque liste | à vérifier par le collecteur ; chaque entrée est revérifiée à la source primaire |

## 7. Bilan des vérifications du 26/10/2026

Vérifiées (14) : anthropic.com/news, platform.claude.com (notes de version), flux Atom de claude-code, de rea et du Model Context Protocol, openai.com/news/rss.xml, blog.google (RSS), huggingface.co (RSS), github.blog/changelog (RSS), pypi.org (RSS anthropic), registry.npmjs.org (astro), export.arxiv.org (cs.AI), digital-strategy.ec.europa.eu (AI Act), docs.github.com (limite de recherche).

Non vérifiées, à confirmer par le collecteur : eur-lex.europa.eu (réponse vide), arXiv cs.CL, cs.LG et cs.MA (schéma d'URL identique à cs.AI), requête de recherche GitHub par sujet, annuaires « awesome », autres éditeurs et outils.

## 8. Base mondiale des sources (recensement du 26/10/2026)

`docs/observatoire/sources/base-sources.jsonl` : 709 sources uniques (presse, éditeurs, laboratoires, institutions,
chaînes YouTube, podcasts, newsletters, forums, annuaires) en 26 langues, recensées par 20 éclaireurs puis contrôlées par
programme le 26/10/2026. Une source par ligne JSON ; champs déclarés par l'éclaireur (`nom`, `url`, `pays`, `langue`,
`type`, `sujets`, `flux`, `frequence`, `editeur`, `verifie`, `verifie_le`, `note`, `lot`) et champs du contrôle
(`controle` : code HTTP de l'adresse, flux valide ou non, date la plus récente du flux ; `fiabilite`).

- `fiabilite` A (282) : adresse joignable et flux valide publié depuis moins de 6 mois ; B (378) : adresse ou flux
  joignable, activité non mesurée par flux ; C (49) : injoignable ou bloquée aux robots (403, 429, délai), à retester.
- Malgré son nom, `fiabilite` mesure la **joignabilité** de l'adresse, pas la confiance qu'on peut accorder à la source
  (une chaîne YouTube joignable est notée A comme une documentation officielle) : le plugin la reçoit et la rend sous le
  nom `joignabilite`. La confiance se juge fait par fait (statut et confiance de chaque Affirmation, politique de
  vérification) et par le type de la source (primaire, secondaire, communautaire).
- L'import (`importer_base.py`, route `obs.base.importer`) crée chaque source nouvelle à l'état `candidate` : listée,
  jamais citable, elle devient active à sa première lecture réussie par une collecte. Une source C se reteste ainsi à
  son premier usage.
- C'est un **annuaire de candidates**, jamais une preuve : la qualification (K5) et les droits de collecte (K4,
  `droits-collecte.md`) s'appliquent à chaque source avant toute collecte. Les médias généralistes se filtrent sur l'IA.
- Les sources des sections 1 à 6 restent la référence primaire (versions GitHub, registres, arXiv, textes de l'UE) ;
  la base les complète sans les remplacer.
- Trous connus : peu de sources IA dédiées en hindi, arabe, turc, d'Afrique de l'Est et d'Europe de l'Est ; Reddit
  refuse la lecture automatique ; pays non renseigné pour 194 sources.

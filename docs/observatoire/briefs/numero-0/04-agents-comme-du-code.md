# 04. L'agent devient un projet de code : SDK, versions et ruptures de la semaine

**Catégorie du site** : `outils-de-code` (IA.3).
**Remplace l'exemple** : « Un guide pour les outils IA ».

## Angle

Cursor rend disponible un SDK où un agent est un dossier de code, testé par des évaluations et déployé comme un service. OpenCode publie une version 2.1 qui casse volontairement ses contrats d'extension. Claude Code enchaîne les versions. Pour un développeur, l'outillage d'agent adopte les réflexes du logiciel : arborescence, tests, intégration continue, notes de rupture. Pour un décideur, ces outils changent vite et il faut prévoir la maintenance des intégrations.

## Public visé

Développeurs qui intègrent ou écrivent des agents de code ; équipes plateforme.

## Faits sourcés

| Fait | URL | Date | Extrait exact | Statut |
| --- | --- | --- | --- | --- |
| Cursor publie l'Agent SDK : un agent se définit comme un dossier de code, testé par des évaluations | https://cursor.com/changelog/agent-sdk | 20/10/2026 | It allows you to define an agent as a folder of code, test it with evals, and deploy it to Cursor or your own infrastructure. | confirme_doc_officielle |
| Structure imposée : `instructions.md` est l'invite, chaque fichier de `tools/` est une action typée | https://cursor.com/changelog/agent-sdk | 20/10/2026 | An agent is a project. instructions.md is the prompt. Each file in tools/ is one typed action the model can call. | confirme_doc_officielle |
| Une évaluation vérifie quels outils ont tourné, avec quelles entrées | https://cursor.com/changelog/agent-sdk | 20/10/2026 | An eval sends a fixed message to the bot and asserts on what it did | confirme_doc_officielle |
| Une vraie pull request peut être rejouée pour tester l'agent | https://cursor.com/changelog/agent-sdk | 20/10/2026 | turns a real pull request into signed webhook payloads and sends them to the bot | confirme_doc_officielle |
| OpenCode 2.1 change volontairement ses contrats publics (SDK, HTTP, extensions) | https://opencode.ai/changelog | 20/10/2026 | Version 2.1 makes intentional changes to public SDK, HTTP message/event, and plugin contracts | confirme_doc_officielle |
| Aucune migration de base n'est requise pour les sessions existantes | https://opencode.ai/changelog | 20/10/2026 | no database migration is required. | confirme_doc_officielle |
| OpenCode 2.1.4 affiche enfin les formulaires de saisie demandés par un serveur MCP | https://opencode.ai/changelog | 23/10/2026 | When an MCP server asks for input during a tool call, the form now shows up instead of the call waiting until it times out. | confirme_doc_officielle |
| Claude Code v2.1.311 corrige l'arrêt des sessions au-delà de 200 000 jetons : il compacte et continue | https://github.com/anthropics/claude-code/releases/tag/v2.1.311 | 26/10/2026 | Claude Code now compacts the conversation and continues | confirme_doc_officielle |
| La même version corrige des hooks SubagentStop lancés deux fois par minute | https://github.com/anthropics/claude-code/releases/tag/v2.1.311 | 26/10/2026 | Fixed SubagentStop hooks running about twice a minute for each running subagent instead of once when it finishes | confirme_doc_officielle |

## Questions ouvertes

- Cursor : tarification du déploiement sur son infrastructure non lue.
- OpenCode : liste complète des champs renommés en 2.1 à lire avant de conseiller une migration.
- Claude Code : dix versions publiées du 16 au 26/10 d'après le flux des versions ; un tableau des changements notables reste à faire.
- Le traitement d'heise (22/10/2026) sur OpenCode 2.1 est réservé aux abonnés en partie : non utilisé.

## Sources complémentaires à lire

- https://github.com/anthropics/claude-code/releases.atom (flux des versions)
- https://cursor.com/changelog/cloud-agent-canvases-and-environments (16/10/2026)
- https://github.com/zed-industries/zed/releases.atom et https://github.com/cline/cline/releases.atom (versions de la période, non lues)

## Plan proposé

1. Un agent, c'est maintenant un dépôt.
2. Cursor Agent SDK : arborescence, canaux, évaluations.
3. Tester un agent comme on teste un service : rejouer une pull request.
4. OpenCode 2.1 : une rupture assumée et documentée.
5. Claude Code : le rythme des correctifs.
6. Ce qu'un responsable technique doit prévoir.

# Matrice des capacités : cahier des charges → Paperclip v2026.1012.0

Établie le 15/10/2026 (phase 1). Socle : tag `v2026.1012.0` (`bba6a45f`) + correctif local
du lockfile. Chemins relatifs à `paperclip/` sauf mention.

## Légende

- **SU** stable utilisable : prouvé par le code **et** par un test exécuté le 15/10/2026
  (« sonde » = `scripts/sondes/scenario-phase1.py` contre l'instance réelle, passe 2 ;
  « vitest » = `scripts/sondes/tests-representatifs.sh`, 466 + 344 tests réussis).
- **SU\*** stable utilisable avec réserve explicite (écart ou limite constatée).
- **EXP** expérimental ou « alpha » selon l'amont (drapeau d'instance, ou doc qui le dit).
- **ABS** absent du socle : extension à construire.
- **NV** présent dans le code ou la doc mais non vérifié par un test exécuté ici.

Colonnes : exigence → capacité native → preuve → configuration → extension manquante →
test d'acceptation → classement.

## §0 Socle Paperclip, réutilisation, organisation, démarrage

| Exigence | Capacité native | Preuve | Configuration | Extension manquante | Test d'acceptation | Classe |
| --- | --- | --- | --- | --- | --- | --- |
| Version épinglée, URL, date | tag stable, SHA, date | `socle/VERSION` ; `gh release list` ; npm `latest` | `scripts/preparer-socle.sh` | aucune | le script refuse un tag qui ne pointe pas sur le SHA | SU |
| Entreprises, agents, hiérarchie | `companies`, `agents.reportsTo`, organigramme `GET /companies/:id/org` | sonde : 8 agents créés, cycle hiérarchique refusé 422 « Reporting relationship would create cycle » | une entreprise par client | aucune | bootstrap idempotent recrée la même hiérarchie | SU |
| Objectifs, projets | `goals`, `projects` (SPEC §7.4-7.5) | code ; routes `/companies/:id/projects` | | | création par bootstrap | NV |
| Tâches, dépendances, commentaires | `issues`, `blockedByIssueIds`, `issue_comments` | sonde : cycle de blocage refusé 422 ; vitest `issues-service` (« rejects blocking cycles », « only returns dependents once every blocker is done ») | | | graphe du scénario A sans cycle | SU |
| Livrables | documents révisionnés + `issue_work_products` + pièces jointes | sonde : document `livrable` v1 puis v2, 409 sans `baseRevisionId` (concurrence optimiste) | clé de document par livrable | métadonnées marketing (exigences couvertes, sources) | une révision invalide les verdicts de la révision précédente | SU (documents) / NV (work products) |
| Réclamation atomique | `POST /issues/:id/checkout`, 409 | sonde : 200 puis 409 « Issue checkout conflict » ; vitest `issues-service`, `issue-stale-execution-lock-routes` | | | deux agents, un seul gagnant | SU |
| Heartbeats, réveils, sessions | runs `heartbeat_runs`, réveil sur affectation, file de réveil | sonde : runs `invocationSource: assignment`, run annulé « Cancelled before issue reassignment » à la réaffectation ; vitest `issue-dependency-wakeups`, `issue-comment-wakeup` | minuterie désactivée par défaut (`runtimeConfig.heartbeat.enabled=false`, `server/src/services/heartbeat.ts:16826`) | | réveil du relecteur après interception | SU |
| Une mention ne réveille pas | règle explicite : « Agent @-mentions are context links only: they do not wake the mentioned agent » | `doc/SPEC-implementation.md:671-674` (le fichier `issue-comment-wakeup.test.ts` exécuté couvre les reprises et auto-commentaires, pas les mentions) | | | sonde : un commentaire mentionnant un agent ne crée aucun run pour lui | NV |
| Adaptateur Claude Code + diagnostic | `claude_local` (ACP par défaut, CLI optionnel), test d'environnement | code `packages/adapters/claude-local/src/server/*` ; vitest 344/344 (avec `LC_MESSAGES=C.UTF-8`) | `CLAUDE_CONFIG_DIR` dédié, modèle par rôle | isolement de la config Claude de l'opérateur | un run réel minimal (si l'opérateur l'autorise) | SU\* (tests unitaires) / NV (run réel) |
| Synchronisation des compétences | registre `company_skills`, versions, bundle `--add-dir` | vitest `claude-local-skill-sync` ; code `heartbeat.ts:21830-21870` | | journal lisible « skill + version » par run | le run liste la clé et le hash du skill obligatoire | SU\* (pas de version pour un skill local sans `enableBetaSkills`) |
| Budgets, usage, pause | plafonds entreprise/agent/projet, incidents, pause automatique | sonde : coût 150 c > plafond 100 c → agent `paused`, `pauseReason: budget` ; vitest `budgets-service` | | réservation pour tâches parallèles | scénario F | SU |
| Secrets | `company_secrets`, chiffrement local, refs | sonde : valeur absente des lectures et de l'export ; vitest `secrets-routes`, `run-secret-redaction` | `local_encrypted`, clé `instance/.../secrets/master.key` | | | SU |
| Décisions humaines | `approvals` (`request_board_approval`…), étapes `approval` des politiques, interactions (`request_confirmation`, `ask_user_questions`…) | sonde : approbation créée puis `approved` ; étape humaine finale → `done` | | portée et version de l'approbation | scénario A | SU (approvals, étapes) / NV (interactions) |
| Routines, événements, sauvegardes, export/import | routines, événements live, sauvegarde horaire, export/import | sonde : export OK, WebSocket OK ; santé : sauvegarde auto activée | | | | SU (export, live) / NV (routines, import, restauration) |
| Organisation importable | paquet `COMPANY.md` + `.paperclip.yaml` | sonde : export réel (agents, `COMPANY.md`, `.paperclip.yaml`) ; vitest `company-portability`, `export-fidelity` | | contrôle « pas de chemin local » avant export | export sans `/home/` ni secret | SU\* (les chemins absolus dans `args` partent dans l'export) |
| Identifiants natifs, pas de double statut | IDs UUID natifs | code | | tables marketing liées par `issue_id`, `company_id` | la vue marketing lit le statut natif | ABS (extension) |
| Base, migrations, démarrage | PostgreSQL embarqué, migrations Drizzle auto | démarrage réel (`Migrations applied`) ; `doctor` vert | `PAPERCLIP_HOME` dédié | | redémarrage sans perte | SU\* (paquet `embedded-postgres` étiqueté bêta, voir note §5) |
| Pas de runner expérimental obligatoire | `claude_local` suffit | `enableNativeRunner=true` par défaut mais non utilisé par `claude_local` | ne pas créer d'agent `paperclip_runner` | | | SU (à confirmer en run réel) |
| Télémétrie désactivée | réglage documenté | `/proc/<pid>/environ`, config `telemetry.enabled:false` | `config/atelier.env` | | | SU |
| Licence et notices | `LICENSE` amont conservée | `paperclip/LICENSE` intacte | | | | SU |
| Upgrade/rollback | notes de version + verrous de restauration | `releases/v2026.1012.0.md` (« Stop all old processes before upgrading ») | | guide d'upgrade de l'atelier | rejouer `preparer-socle.sh` sur un nouveau tag | NV |

## §1-§2 Mission et vérification technique

| Exigence | Capacité / preuve | Classe |
| --- | --- | --- |
| Note technique datée | `docs/note-technique-2026-10-15.md` | fait |
| Signatures vérifiées dans les types | `pnpm typecheck` : 0 erreur ; schémas Zod lus dans `packages/shared/src/validators/*` | SU |
| TypeScript strict, React + Vite, Express, Drizzle | `tsconfig.base.json` (`strict: true`), `ui/` Vite, `server/` Express, `packages/db` Drizzle | SU |
| Agent Teams non dépendantes | non utilisées : coordination par tâches/commentaires natifs | conforme |
| Pas d'orchestrateur superposé | aucun ajouté | conforme |

## §3 Modes démonstration et réel

| Exigence | Capacité native | Preuve | Extension manquante | Test d'acceptation | Classe |
| --- | --- | --- | --- | --- | --- |
| Fixtures déterministes dans le vrai cycle | adaptateur natif `process` (commande + args, jeton de run injecté) | sonde : agents-sondes Python réveillés, checkout, document, clôture interceptée, relecture, approbation | runner de fixtures marketing (scénarios A-F), mention « démonstration » sur tout résultat | scénario A complet sans modèle | SU (mécanisme) / ABS (fixtures marketing) |
| Mode réel par l'adaptateur | `claude_local` | code + tests unitaires | configuration par rôle, isolement `CLAUDE_CONFIG_DIR` | run réel minimal, déclaré « non exécuté » tant que l'opérateur n'a pas tranché | NV |
| États d'interface (démo, réel testé, configuré non vérifié…) | aucun | | statut de connexion par connecteur et par agent | affichage des 6 états | ABS |

## §4 Agents marketing

| Exigence | Capacité native | Extension | Classe |
| --- | --- | --- | --- |
| Registre versionné d'agents (rôle, instructions, compétences, outils, modèle, budget) | agents + `AGENTS.md` géré + révisions de config (`agentConfigRevision`) + `desiredSkills` + budget par agent | fiches des 10 rôles dans le paquet d'organisation (lot B) | SU (support) / ABS (contenu) |
| Coordinateur, 6 producteurs, 3 contrôleurs | hiérarchie native | modèle d'organisation | ABS |
| Plafond de 3 agents actifs | **aucun plafond par entreprise** ; seulement `maxConcurrentRuns` par agent (défaut 20, borné 1-50 : `packages/shared/src/constants.ts:77`, `server/src/services/heartbeat.ts:3754-3760`) | régulateur d'admission : n'affecter une tâche prête que si moins de 3 runs actifs ; `maxConcurrentRuns: 1` par agent | ABS |
| Missions inutiles ignorées avec justification | statut `cancelled` + commentaire | règle du coordinateur | NV |

## §5 Compétences

| Exigence | Capacité native | Preuve | Extension | Classe |
| --- | --- | --- | --- | --- |
| SKILL.md dans le registre natif | `company_skills`, `POST /companies/:id/skills`, import, versions | `docs/guides/agent-developer/skills-store.md` ; vitest `claude-local-skill-sync` | 16 skills FR (lot B) | SU\* |
| Injection vers Claude Code vérifiée | bundle géré + `--add-dir` | code `execute.ts:672-690` | vérifier le dossier réellement monté lors d'un run | NV |
| Chargement obligatoire explicite et journalisé | les skills désirés sont matérialisés à chaque run ; empreinte de config du run inclut `runtimeSkills` | `server/src/services/heartbeat.ts:5921-5932, 21830-21937` | journal lisible clé + hash/version ; assemblage contrôlé du contexte pour les contrôles obligatoires | ABS (journal lisible) |
| Versions épinglées par exécution | seulement avec `enableBetaSkills` (expérimental) | `heartbeat.ts:21834-21842` | stocker le hash du contenu au lancement | EXP |

## §6 Coordination et messages

| Exigence | Capacité native | Preuve | Extension | Classe |
| --- | --- | --- | --- | --- |
| État en base, commentaires, documents | natif | sonde | | SU |
| Message typé (messageId, type, contrat, références…) | commentaires en prose ; interactions typées réservées aux échanges avec l'humain | SPEC §10.11 | table `atelier_messages` liée à `issue_id`/`run_id`, validation Zod, contrôle d'appartenance | ABS |
| Pas de second bus | réveils natifs par affectation, blocage, revue ; « courier pattern » (`doc/execution-semantics.md`, §6) | sonde | les messages déclenchent des réveils **natifs** (création/affectation de tâche) | SU (réveils) |
| Pas d'escalade d'autorisation par message | agents : pas d'approbation, pas de budget (`doc/SPEC-implementation.md` §9.2) ; plugins sans capacité d'approbation (`doc/plugins/PLUGIN_SPEC.md` §15.2) | lecture ; sonde : l'approbation est faite par le board | test « un message ne crée pas d'approbation » | NV |
| Boîte de réception par agent, relève | boîte = tâches assignées (`heartbeat-protocol.md`, étape 3) | sonde (la sonde lit sa boîte) | | SU |

## §7 Exigences et informations manquantes

| Exigence | Capacité native | Extension | Classe |
| --- | --- | --- | --- |
| REQ-001…, couverture (non traité, partiel, couvert, bloqué, NA justifié) | aucune | table `atelier_exigences` + preuves localisables | ABS |
| Question précise au client | interactions `ask_user_questions`, `request_confirmation` ; statut `blocked` avec propriétaire nommé obligatoire (`doc/execution-semantics.md`, `blocked`) | gabarits de questions | NV |
| Hypothèse tracée | aucune | champ `hypotheses` sur livrable | ABS |

## §8 Chaîne de relecture

| Exigence | Capacité native | Preuve | Extension | Test d'acceptation | Classe |
| --- | --- | --- | --- | --- | --- |
| Clôture du producteur interceptée et routée vers le relecteur | `executionPolicy.stages` (review/approval) | sonde : `done` demandé → `in_review`, assigné au relecteur ; vitest `issue-execution-policy` | | | SU |
| Contextes distincts producteur/relecteur | runs distincts par agent | sonde (runs différents) | le relecteur reçoit brief + exigences + version, pas l'autoévaluation | | SU (mécanisme) |
| Trois contrôleurs indépendants | **un seul participant agit par étape** (`approvalsNeeded: 1`, `packages/shared/src/validators/issue.ts:387`) ; plusieurs étapes successives possibles | sonde : avec 2 relecteurs, seul le premier est sollicité | 3 étapes `review` successives (une par contrôleur) ou tâches de revue liées + consolidation serveur | | SU\* |
| Limite de tours, escalade humaine | `maxReviewRounds` (défaut 3, 1-50), escalade vers l'humain responsable | sonde : escalade après 3 (passe 1) et 2 tours (passe 2) ; `issue-execution-policy.ts:64-69, 860-895` | régler à 3 | | SU |
| Réaffectation au producteur après correction | `returnAssignee` | sonde : retour `in_progress` au producteur | | | SU |
| Décision avec commentaire obligatoire | 422 sans commentaire | sonde | | | SU |
| Verdict structuré, constats (findingId…) | aucun (commentaire libre) | | tables `atelier_verdicts`, `atelier_constats` | | ABS |
| Contrôle déterministe qui refuse PASS | aucun ; **un plugin ne peut pas opposer de veto** (SDK : événements, jobs, routes, outils ; pas de hook avant transition, `packages/plugins/sdk/src/define-plugin.ts:215-330`) | lecture | garde serveur d'achèvement + étape « contrôle déterministe » tenue par un agent `process` non-LLM | une exigence manquante bloque l'étape | ABS |
| Politique non contournable | **ÉCART** : un agent standard assigné retire `executionPolicy` (`PATCH executionPolicy: null` → 200) puis passe `done` sans relecture | sonde passes 1 et 2 (« contournement ») | garde serveur ciblée : refuser aux acteurs agents la modification/suppression d'une politique à étapes et toute clôture qui ne passe pas par les étapes | le contournement renvoie 403/422 | ABS (correctif serveur requis) |
| Protection par le preset `low_trust_review` | exige `enableIsolatedWorkspaces` (expérimental) | sonde : run en échec `low_trust_isolation_unavailable` | | | EXP |
| Invalidation après modification | révisions de document ; aucune invalidation de verdict | | lier chaque verdict à `revision_id` ; nouvelle révision = verdict périmé | | ABS |

## §9 Dossier humain et actions externes

| Exigence | Capacité native | Extension | Classe |
| --- | --- | --- | --- |
| États prêt / décision requise / approuvé / diffusé | statuts natifs + étape `approval` + `approvals` | table d'état de diffusion séparée ; mapping documenté | SU (support) / ABS (diffusion) |
| Approbation liée à une version et un périmètre | `approvals.payload` libre ; verrouillage de document par le board (`doc/SPEC-implementation.md` §7.15) | contrôle serveur : version + périmètre au moment d'agir ; invalidation si modification matérielle | ABS |
| Contrôles côté serveur | gardes natives (participant actif seul, 422) | gardes de l'atelier côté serveur | SU (natif) / ABS (marketing) |

## §10 Persistance, scheduler, reprise

| Exigence | Capacité native | Preuve | Extension | Classe |
| --- | --- | --- | --- | --- |
| Mapping des statuts fonctionnels | `backlog/todo/in_progress/in_review/done/blocked/cancelled` + `executionState` + incidents de budget | SPEC §8.2 | table de correspondance (lot A) | SU (natif) |
| Dépendances satisfaites seulement | blocages, réveil `issue_blockers_resolved` | vitest `issues-service`, `issue-dependency-wakeups` | | SU |
| Cycles et orphelines | cycles refusés ; liveness (`doc/execution-semantics.md` §8) | sonde 422 | détection d'orphelines marketing | SU (cycles) / NV (orphelines) |
| Lease, double clôture impossible | `checkoutRunId`, `executionRunId`, bail contrôleur (SPEC §11.6) | vitest `issue-stale-execution-lock-routes` | | SU |
| Reprise après arrêt | réconciliation au démarrage (« startup reap of orphaned heartbeat runs complete ») | journal de démarrage ; arrêt : « graceful heartbeat run drain complete » | scénario E | NV (scénario non joué) |
| Limites (tentatives, délais, tours, sorties) | `timeoutSec`, `maxTurnsPerRun`, `maxReviewRounds`, plafond de commentaires croisés (20/run) | code | taille des sorties | NV |
| Idempotence des effets externes | clés d'idempotence sur certaines routes (approbations : vitest `approval-routes-idempotency`) | vitest | réconciliation avant republication | SU (approbations) / ABS (diffusion) |

## §11 Mémoire et sources

| Exigence | Capacité native | Extension | Classe |
| --- | --- | --- | --- |
| Sources avec URL, date, statut d'accès | pièces jointes, documents | table `atelier_sources` liée au livrable | ABS |
| Recherche textuelle et filtres | recherche d'entreprise `GET /companies/:id/search` | | NV |
| Pas de mélange entre clients | frontière dure par entreprise | une entreprise Paperclip par client | NV (test d'accès croisé à écrire) |

## §12 Interface

| Exigence | Capacité native | Extension | Classe |
| --- | --- | --- | --- |
| Six rubriques en français | UI anglaise ; emplacements de plugin `page`, `sidebar`, `detailTab`, `dashboardWidget`, `routeSidebar` (`packages/shared/src/constants.ts:1476-1482`) | pages de l'atelier (lot C) | ABS |
| Plugins UI | même origine, non isolés, « alpha surface » (`doc/plugins/PLUGIN_AUTHORING_GUIDE.md:5`) ; vitest `plugin-scoped-api-routes`, `plugin-routes-authz`, `plugin-tenant-isolation` réussis | | EXP |
| Clair/sombre, mobile, clavier | système de design à jetons (`DESIGN.md`, `pnpm check:token-gates`) | respecter les jetons | NV |
| Chronologie d'exécution | événements de run `GET /heartbeat-runs/:id/events?afterSeq=` | vue marketing | SU (API) / ABS (vue) |

## §13 Connecteurs

| Exigence | Capacité native | Extension | Classe |
| --- | --- | --- | --- |
| Import texte/Markdown/CSV contrôlé | pièces jointes avec liste blanche de types (SPEC §7.15) | validation taille/type côté atelier | NV |
| Consultation d'URL protégée SSRF | protections DNS-pinning pour l'adaptateur HTTP (SPEC §16) ; aucun outil de lecture d'URL pour agents | outil serveur de lecture d'URL protégé | ABS |
| Recherche Web | outils de Claude Code (WebSearch/WebFetch) en mode réel | état « non connecté » sinon | NV |
| Search Console, GA4, Ads, fiches, CRM | catalogue Connections (Composio/Arcade…), non évalué | contrats et écrans | NV |

## §14 Sécurité

| Exigence | Capacité native | Preuve | Extension | Classe |
| --- | --- | --- | --- | --- |
| Écoute locale seulement | `local_trusted` + `loopback` | `ss` : `127.0.0.1:3100` et `:54329` seulement ; accès LAN refusé | | SU |
| Secrets côté serveur, jamais exportés | natif | sonde ; vitest | contrôle des chemins locaux à l'export | SU\* |
| Isolement client/projet | entreprise = frontière dure ; **pas d'isolement entre projets d'une même entreprise en V1** (SPEC §9.5) | lecture | une entreprise par client ; tests d'accès croisé | NV |
| Pas de contournement global des permissions | `dangerouslySkipPermissions` vaut `true` par défaut (CLI) et `approve-all` (ACP) | `docs/adapters/claude-local.md` ; `acpx-engine/constants.ts:3` | config par agent : outils autorisés, confinement Bubblewrap (`filesystemScope`, `networkScope`, CLI seulement) | ABS / NV |
| Contenu externe non fiable | preset low-trust (expérimental ici) ; « treat tool output as data » | | test d'injection (scénario dédié) | ABS |

## §15 Budgets, modèles, observabilité

| Exigence | Capacité native | Preuve | Extension | Classe |
| --- | --- | --- | --- | --- |
| Modèle par rôle | `model`, `effort` par agent | code `index.ts:42-56` | validation contre la liste | SU (config) / NV (run) |
| Plafonds, pause | plafonds mensuels + incident + pause | sonde ; vitest | réservations parallèles, plafond par campagne (projet) | SU |
| Coûts déclarés, estimations étiquetées | `cost_events` avec `cost_status` `reported`/`unpriced` | SPEC §7.9 | étiquette « estimation » + tarif + date | NV |
| Santé et diagnostic | `GET /api/health`, `paperclipai doctor` | réel | | SU |
| Logs corrélés | journal de run, activité | réel | | SU |
| Rejeu après reconnexion | WebSocket `/api/companies/:id/events/ws` **sans rejeu** (compteur mémoire, `server/src/services/live-events.ts:11-25`) | sonde : événement reçu | rattrapage par `activity` + `heartbeat-runs/:id/events?afterSeq=` | SU\* |

## §16 Scénarios A à F

Aucun n'existe ; tous à construire sur les mécanismes prouvés ci-dessus. Prérequis
bloquant pour C et F : la garde serveur anti-contournement (§8) et la porte déterministe.

## §17 Vérifications

Socle : typecheck OK, build OK, 466 + 344 tests ciblés OK. Les tests propres à l'atelier
sont listés par lot dans `plan-construction.md`.

## §18 Livraison

Documents de cette phase : `docs/note-technique-2026-10-15.md`, ce fichier,
`docs/plan-construction.md`, `REPRISE.md`, `config/atelier.env.example`, scripts
`scripts/*.sh`. Les livrables 1-12 du §18 sont planifiés dans `plan-construction.md`.

## Mise à jour après le lot A (15/10/2026, fin d'après-midi)

Option A retenue : extension en **plugin officiel** (choix explicite de l'opérateur pour le seul
système de plugins, documenté dans `docs/contrats.md` §1), plus un patch serveur isolé
(`socle/patches/0002`, `0003`). Preuves : « vitest » = tests exécutés le 15/10/2026
(`plugin-atelier` : 178 réussis ; serveur : `scripts/tests-serveur.sh`) ; « scénario X » =
`scripts/scenarios/atelier_scenarios.py X` contre une instance réelle d'essai
(`atelier-lota`, port 3120, même code que le socle patché), résultats bruts dans
`instance/scenarios/`. Les lignes ci-dessous remplacent le classement des lignes
correspondantes plus haut.

| Exigence (section du cahier) | Réalisation | Preuve | Classe |
| --- | --- | --- | --- |
| Identifiants natifs, pas de double statut (§0, §10) | schéma `plugin_atelier_f0322cc62c` lié par `company_id`/`issue_id`/`project_id`/révision ; statuts fonctionnels calculés à la lecture | `plugin-atelier/src/contrats/statuts.ts` ; vitest (15 cas) | SU |
| Fixtures déterministes dans le vrai cycle (§3) | `plugin-atelier/demo/agent-demo.mjs` (adaptateur natif `process`), mention démonstration | scénarios B, C, D, F | SU |
| Plafond de 3 runs actifs par entreprise (§4) | patch régulateur (réglage du plugin ou `ATELIER_MAX_RUNS_ACTIFS_PAR_ENTREPRISE`) | `atelier-gardes.test.ts` (6 admissions concurrentes, 3 admises) ; scénario F (max 3 actifs, file observée, 5 tâches terminées) | SU |
| Chargement obligatoire explicite et journalisé (§5) | patch : inventaire clé/version/SHA-256 par run, run refusé si une compétence obligatoire manque | `atelier-competences.test.ts` ; non joué avec `claude_local` réel | SU\* |
| Messages typés, appartenance, non-escalade (§6) | route `tache.messages.*`, Zod strict, clés interdites, rôles (décision, constats), débit | vitest ; scénario S (403 élévation, 404 hors entreprise) | SU |
| Exigences REQ-xxx, couverture, preuves (§7) | exigences versionnées, preuves vérifiées DANS le livrable, éléments attendus | vitest porte ; scénario B | SU |
| Information manquante, question précise (§7) | couverture `bloque` + question, message typé, interaction native `ask_user_questions`, tâche `blocked` | scénario D | SU |
| Trois contrôleurs indépendants (§8) | revues liées par révision (tâches enfants du plugin, une par rôle), consolidation par la porte | scénarios B, C | SU |
| Verdicts structurés et constats (§8) | `VerdictRevue`, `Constat`, résolution explicite, cohérence PASS/constat bloquant | vitest ; scénarios B, C | SU |
| Contrôle déterministe qui refuse PASS (§8) | porte P2 (fonction pure) + garde serveur sous verrou de ligne | `porte.spec.ts` (14 cas) ; `atelier-gardes.test.ts` ; scénarios B, C, D | SU |
| Politique non contournable (§8) | garde P1 (403 + activité native) | `atelier-gardes.test.ts` ; scénario F | SU |
| Invalidation après modification (§8, §9) | nouvelle révision : évaluations périmées, décisions invalidées ; fraîcheur comparée en SQL | `atelier-gardes.test.ts` ; vitest diffusion | SU |
| Limite de cycles, escalade (§8) | cycles = révisions refusées ; `maxReviewRounds` natif ; escalade vers `local-board` | scénario F (escalade, statut « décision humaine requise ») | SU |
| Approbation liée à une version et une portée (§9) | décision humaine + portée ; diffusion refusée sinon (canal, action, montant, durée) | vitest ; scénario B (payant et autre canal refusés) | SU |
| Idempotence des effets (§10) | clé d'idempotence unique par entreprise | scénarios B, E (même diffusion avant et après un redémarrage) | SU |
| Reprise après arrêt du serveur (§10) | politique native : run marqué `interrupted`, tâche bloquée SANS rejeu automatique ; reprise par réconciliation humaine (`POST /issues/:id/recovery-actions/resolve`, preuves tirées du journal de l'atelier) ; le producteur reprend à l'étape suivante | scénario E (10 OK) | SU |
| Sources et provenance (§11) | table `sources`, extrait, empreinte, `nonFiable`, injections signalées | scénarios C, S | SU |
| Lecture d'URL anti-SSRF, vérification de liens (§13, §14) | DNS contrôlé à la connexion, redirections revalidées, 200 + page d'erreur | `securite.spec.ts` ; scénarios C, S ; lecture réelle d'example.com (`ATELIER_TEST_RESEAU=1`) | SU |
| Import texte/Markdown/CSV contrôlé (§13) | taille, extension, encodage, CSV régulier, formules neutralisées | vitest ; scénario S | SU |
| Isolement entre entreprises (§14) | contrôle de l'hôte + revérification par le worker | scénario S (5 accès croisés 403, pont 502) | SU |
| Injection dans une source (§14) | contenu stocké comme donnée, signalé, aucune action | scénarios C, S | SU |
| Rattrapage après reconnexion (§15) | journal `afterSeq` (route et clé de données) | contrôle J | SU (interface : lot C) |
| Recherche Web (§13) | non connectée, déclarée telle | diagnostic | ABS (déclaré) |
| Outil d'agent pour la lecture d'URL (constat 7 du lot B) | les routes du plugin existent ; l'exposition comme outil d'agent `claude_local` n'est pas branchée | lecture du code | ABS |
| Pause et reprise de campagne (§12) | non disponible : Paperclip ne met un projet en pause que par budget | `non_implemente` explicite | ABS (limite du socle) |

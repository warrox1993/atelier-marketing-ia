# Plan de construction : Atelier Marketing IA sur Paperclip v2026.1012.0

Version 1, 15/10/2026 (fin de phase 1) ; **version 2 au §0** (décisions de l'opérateur, plan en cours d'exécution). S'appuie sur `docs/note-technique-2026-10-15.md`
et `docs/matrice-capacites.md`. État de construction : voir `REPRISE.md`.

## 0. Décisions de l'opérateur du 15/10/2026 et plan révisé (version 2)

Ce qui suit remplace les §2.2, §2.3 et §4 ci-dessous partout où ils divergent.

1. **Option A : plugin officiel.** Le plugin
   `atelier.marketing-ia` vit dans `plugin-atelier/` (dépôt enveloppe), installé par chemin
   local (`paperclip/doc/plugins/LOCAL_PLUGIN_DEVELOPMENT.md`). Persistance : espace de base du
   plugin (schéma `plugin_atelier_f0322cc62c`). Contrats : `docs/contrats.md`.
2. **Ce que le plugin ne peut pas garantir passe par un patch serveur isolé** (fichiers
   `paperclip/server/src/atelier/*.ts` + raccords d'une dizaine de lignes, série
   `socle/patches/0002`, `0003`) : P1 politique de relecture verrouillée pour les agents, P2
   porte déterministe sous verrou de ligne (board compris), régulateur de runs par entreprise,
   journal lisible des compétences par run et refus d'un run privé d'une compétence obligatoire,
   correction de la suppression d'entreprise (constat du lot B).
4. **Défauts du tag stable conservés** (embedded-postgres, réglages expérimentaux actifs par
   défaut) ; aucun autre réglage expérimental activé.
5. **Circuit de revue imposé par le moteur** (constaté sur instance réelle) : la récupération
   native bloque une étape de revue dont le participant termine son run sans décision. Les
   trois contrôleurs travaillent donc dans des **tâches de revue liées** (une par rôle et par
   révision, créées par le plugin, attente par bloqueurs natifs) ; l'unique étape native de
   revue est tenue par l'agent déterministe « Porte de contrôle », qui décide dans son run ;
   puis étape d'approbation humaine. Détail : `docs/contrats.md` §6 bis.
6. **Lots** : A (moteur, plugin hors interface, patch serveur, démonstration, scénarios),
   B (organisation, agents, compétences, bootstrap ; terminé, commit `ab12c39`),
   C (interface du plugin, `plugin-atelier/src/ui/**`, `tests/ui/**`).

## 1. Constats qui fixent l'architecture

1. Le cycle natif suffit pour la chaîne producteur → relecteur → humain : clôture
   interceptée, un relecteur par étape, retour au producteur, escalade après
   `maxReviewRounds`, étape d'approbation humaine, commentaire obligatoire (prouvé en réel).
2. **Ce cycle est contournable** : un agent standard assigné peut retirer
   `executionPolicy` puis clore sa tâche (prouvé en réel, deux fois). Le preset natif
   `low_trust_review` exige un réglage expérimental. → Une **garde serveur ciblée** est
   indispensable, quelle que soit l'option retenue.
3. Un plugin ne peut pas opposer de veto à une transition (pas de hook préalable dans le
   SDK). → La porte déterministe passe par une **étape de revue tenue par un agent
   non-LLM** (adaptateur `process`), dont seul l'agent désigné peut faire avancer l'étape.
5. Il n'existe ni plafond de concurrence par entreprise, ni exigences, verdicts, constats,
   messages typés, sources, approbation liée à une version : extensions métier.
6. Isolement des clients : la frontière dure de Paperclip est l'**entreprise** (pas le
   projet, SPEC §9.5). → **Une entreprise Paperclip par client** ; la campagne = un projet.
7. L'agent Claude local chargerait le `~/.claude` de l'opérateur .
   → `CLAUDE_CONFIG_DIR` dédié par agent, obligatoire.

## 2. Architecture retenue (recommandation, sous réserve de la question 1)

### 2.1 Socle

- `paperclip/` : clone amont, branche locale `atelier-marketing` = tag `v2026.1012.0` +
  commits locaux. Après chaque intégration : `git format-patch v2026.1012.0..atelier-marketing
  -o ../socle/patches` (le dépôt enveloppe garde la série de patches, donc la reproductibilité).
- Dépôt enveloppe `atelier-marketing-ia/` (git local, ignore `paperclip/` et `instance/`) :
  documents, modèle d'organisation, compétences, scripts, série de patches. **Pourquoi pas un
  fork ni un sous-module** : rien n'est poussé ; un sous-module exigerait une URL pour des
  commits locaux ; la série de patches se rejoue sur un nouveau tag (`git am`) et montre
  exactement l'écart avec l'amont.
- Mise à jour du socle : `socle/VERSION` → nouveau tag, `scripts/preparer-socle.sh` sur une
  copie neuve, `git am socle/patches/*`, tests, puis bascule. Les notes amont imposent
  d'arrêter tous les processus avant une mise à jour (`releases/v2026.1012.0.md`).

### 2.2 Extension (option B recommandée : module intégré isolé, sans API alpha)

| Élément | Emplacement | Rôle |
| --- | --- | --- |
| Paquet `@atelier/core` | `paperclip/packages/atelier/` (couvert par `packages/*` du workspace) | contrats Zod, schéma Drizzle, services, routeur Express, runner de fixtures |
| Schéma de données | schéma PostgreSQL **séparé `atelier`**, journal de migrations propre (`atelier.__migrations_atelier`), possible avec le migrateur installé (`drizzle-orm@0.45.2`, `MigrationConfig { migrationsFolder, migrationsTable?, migrationsSchema? }`, `migrator.d.ts:5-9`) | aucune collision avec la numérotation des migrations amont (0294-0305 au tag) |
| Raccord serveur | 3 points dans le cœur : montage `/api/atelier` (`server/src/app.ts`, près de la ligne 680), migrations atelier après `applyPendingMigrations` (`server/src/index.ts:298,319`), garde de politique (§2.3) | diff minimal, isolé, testé |
| Interface | `paperclip/ui/src/atelier/**` + 2 raccords : routes (`ui/src/App.tsx`) et entrée de navigation | six rubriques en français, jetons du système de design |
| Organisation, agents, skills | dépôt enveloppe `organisation/` (paquet `COMPANY.md` importable) | source canonique versionnée, importée par l'API native |
| Agents de démonstration | adaptateur natif `process` → `node packages/atelier/dist/fixtures/agent.js <rôle> <scénario>` (chemin **relatif** au `cwd`) | même cycle de vie que le réel, zéro appel de modèle, mention « démonstration » |
| Agents réels | adaptateur natif `claude_local` (moteur par défaut ACP ; CLI si confinement Bubblewrap) | `CLAUDE_CONFIG_DIR` dédié, modèle par rôle, `maxConcurrentRuns: 1` |

Option A  : même découpage,
mais `@atelier/core` devient un plugin (`packages/plugins/atelier-marketing` : worker,
`apiRoutes`, espace de base de données du plugin, emplacements UI `page`/`sidebar`/
`detailTab`). Avantage : aucun raccord UI ni migration dans le cœur. Inconvénients : API
« alpha », UI de plugin non isolée (même origine), et la garde de politique reste un patch du
cœur. Coût de bascule B → A : modéré si les services restent indépendants d'Express (règle
imposée au lot A).

### 2.3 Gardes serveur (patch du cœur, lot A, fichiers isolés)

- **P1 politique verrouillée** : un acteur agent ne peut ni modifier ni retirer
  `executionPolicy` d'une tâche qui a des étapes ; il ne peut pas non plus l'ajouter ou la
  vider à la création d'une sous-tâche marquée atelier. Réponse 403 explicite, entrée
  d'activité. Emplacement : `server/src/routes/issues.ts` (branche `req.body.executionPolicy`,
  près de la ligne 13179) via une fonction pure dans `server/src/atelier-garde-politique.ts`.
  Les humains (board) gardent le droit de modifier.
- **P2 porte déterministe** (sans patch du cœur) : avant l'étape `approval` humaine, une étape
  `review` dont l'unique participant est l'agent « Porte de contrôle » (adaptateur `process`).
  Réveillé par la revue native, il appelle `POST /api/atelier/portes/:issueId/evaluer` ; le
  serveur calcule le verdict (exigences obligatoires couvertes avec preuve, revues requises en
  PASS sur la **révision courante** du livrable, aucun constat critique/majeur ouvert) puis
  applique lui-même la transition native au nom de cet agent (`done` = passe, sinon
  `in_progress` + commentaire structuré). Une sortie de modèle disant PASS ne suffit jamais.
- **P3 parade locale** (option) : forcer `LC_ALL=C` dans `buildHardenedGitEnv`
  (`packages/adapter-utils/src/git-workspace-sync.ts`) ; en attendant, `LC_MESSAGES=C.UTF-8`
  dans `config/atelier.env`.

### 2.4 Correspondance des états du cahier (§10) avec l'état natif

| État fonctionnel | Représentation native (aucun enum amont modifié) |
| --- | --- |
| queued | `backlog`, non affectée (régulateur d'admission) |
| ready | `todo` affectée, blocages résolus |
| running | `in_progress` + run actif |
| awaiting_review | `in_review`, étape `review` en cours |
| changes_requested | `in_progress`, `executionState.status = changes_requested` |
| blocked_information | `blocked` + interaction `ask_user_questions` ou propriétaire nommé |
| blocked_dependency | `blocked` + `blockedByIssueIds` |
| blocked_budget | incident de budget / agent `paused` (`pauseReason: budget`) |
| ready_for_human | `in_review`, étape `approval` en cours (participant humain) |
| approved | `done` + `executionState.status = completed` |
| completed / failed / cancelled | `done` / run en échec + `blocked` / `cancelled` |

État du livrable (révision de document) et état de diffusion (table `atelier.diffusions`)
sont séparés de l'état de tâche.

## 3. Contrats partagés (étape T0, faite par l'intégrateur avant le parallèle)

Fichiers gelés en v1, toute modification passe par l'intégrateur :

- `packages/atelier/src/contrats/*.ts` (Zod, TypeScript strict) : `ModeExecution`
  (`demonstration` | `reel`), `Exigence` (id `REQ-001`, texte d'origine, interprétation,
  obligatoire, critères, dépendances, couverture `non_traite|partiel|couvert|bloque|na_justifie`),
  `Preuve` (livrable, révision, emplacement), `Verdict` (`PASS|CHANGES_REQUESTED|
  BLOCKED_INFORMATION|NOT_APPLICABLE_JUSTIFIED`, exigences examinées, limites), `Constat`
  (`findingId`, relecteur, `artifactVersion` = id de révision, `requirementIds`, catégorie,
  gravité `critique|majeure|mineure|info`, emplacement, description, preuve, correction
  attendue, statut), `MessageAgent` (10 types du §6 du cahier, `messageId`, `companyId`,
  `projectId`, `campaignId`, `runId`, `taskId`, expéditeur, destinataire, contenu, références,
  horodatage UTC, état de traitement), `Source`, `ApprobationPortee` (révision, canal, compte,
  audience, montant, durée, action), `DossierHumain`, `EtatConnecteur` (6 états du §3).
- `packages/atelier/src/contrats/chemins-api.ts` : préfixe `/api/atelier/companies/:companyId/…`
  (campagnes, briefs, exigences, livrables, verdicts, constats, messages, sources, portes,
  dossiers, approbations, connecteurs, diagnostic).
- `packages/atelier/src/schema/*.ts` + migration `0001` du schéma `atelier` : chaque table
  porte `company_id` et l'identifiant natif lié (`issue_id`, `project_id`, `run_id`,
  `document_revision_id`) ; aucune copie du statut de tâche.
- Exemples JSON de réponses (`packages/atelier/src/contrats/exemples/`) pour que le lot C
  travaille avant que le lot A ne serve les routes.
- Ajout du paquet au lockfile (`pnpm install` puis commit par l'intégrateur uniquement).

## 4. Trois lots parallélisables, sans fichier commun

Chaque lot travaille dans son worktree : `git -C paperclip worktree add ../wt-lot-a -b
atelier/lot-a atelier-marketing` (idem b, c). Un `pnpm install --frozen-lockfile` par worktree
(magasin partagé, quelques secondes). Au plus 3 agents sur le projet  ; une seule
suite lourde à la fois sur la machine : les lots lancent des tests ciblés, l'intégrateur lance
les suites complètes.

### Lot A : moteur, persistance, gardes, fixtures, adaptateur réel

- Fichiers : `paperclip/packages/atelier/**` (hors `contrats/` gelés), `paperclip/server/src/atelier-*.ts`,
  les 3 raccords serveur du §2.2, `paperclip/server/src/__tests__/atelier-*.test.ts`.
- Contenu : services (exigences, verdicts, constats, messages typés avec contrôle
  d'appartenance, sources, dossier humain, approbation liée à la révision, état de diffusion
  simulé), porte déterministe P2, garde P1, régulateur d'admission (au plus 3 runs actifs par
  entreprise, `maxConcurrentRuns: 1` par agent), journal lisible des skills transmis (clé +
  hash du contenu au lancement), outil serveur de lecture d'URL anti-SSRF, rattrapage
  d'événements par `activity` + `heartbeat-runs/:id/events?afterSeq=`, runner de fixtures
  (scénarios A à F).
- Tests : `pnpm --filter @atelier/core exec vitest run` ; puis, avec l'environnement isolé de
  `scripts/sondes/tests-representatifs.sh`, `pnpm exec vitest run --project @paperclipai/server
  --no-file-parallelism --maxWorkers=1 server/src/__tests__/atelier-*.test.ts` ;
  `pnpm --filter @atelier/core typecheck`. Acceptation : le contournement de la sonde renvoie
  403 ; une exigence manquante empêche d'atteindre l'étape humaine ; une nouvelle révision
  périme les verdicts ; deux entreprises ne voient pas les données l'une de l'autre.

### Lot B : agents, compétences, modèle d'organisation, bootstrap

- Fichiers : dépôt enveloppe uniquement : `organisation/**` (paquet `COMPANY.md`, 10 agents
  `agents/<rôle>/AGENTS.md`, 16 compétences `skills/<nom>/SKILL.md` en français avec les 9
  rubriques exigées par le §5, gabarits de politiques d'exécution JSON, projets et routines
  utiles), `scripts/bootstrap-demo.mjs`, `scripts/verifier-organisation.mjs`,
  `config/agents-reel.example.json`.
- Contenu : import par l'API native (aperçu puis application, stratégie de collision
  explicite, périmètre limité à l'entreprise « Démo Rénovation Liège » identifiée par marqueur),
  idempotent ; configuration réelle des agents `claude_local` avec `CLAUDE_CONFIG_DIR` dédié
  (`instance/claude-config/<agent>`), `DISABLE_TELEMETRY=1`, modèle par rôle validé contre la
  liste de l'adaptateur  ; aucun chemin absolu dans `args`.
- Tests : `node scripts/verifier-organisation.mjs` (format des compétences, aucun secret, aucun
  `/home/`), bootstrap deux fois de suite contre une instance jetable
  (`PAPERCLIP_INSTANCE_ID=atelier-lotb`, `PORT=3110`, port PostgreSQL 54339) : même résultat,
  aucun doublon ; export puis contrôle de l'export.

### Lot C : interface des six rubriques

- Fichiers : `paperclip/ui/src/atelier/**`, `paperclip/ui/src/api/atelier.ts`, les 2 raccords
  UI (`ui/src/App.tsx`, entrée de navigation), `paperclip/tests/e2e/atelier/*.spec.ts`.
- Contenu : Équipe et coordination, Campagnes, Contenus à valider, Calendrier éditorial,
  Résultats, Marque et sources ; paramètres (modèles, budgets, concurrence, compétences,
  connecteurs, diagnostic) ; chronologie d'exécution ; six états de connexion ; états vides,
  chargement, erreur, accès absent, interrompu, périmé ; clair/sombre, clavier, mobile ; dates
  affichées en Europe/Brussels. L'UI native de Paperclip reste en anglais
  (son i18n ne compte que 3 clés par langue) : seul l'espace de l'atelier est en français.
- Tests : `pnpm --filter @paperclipai/ui exec vitest run src/atelier`, `pnpm check:token-gates`,
  `pnpm --filter @paperclipai/ui typecheck` ; parcours Playwright lancés par l'intégrateur.
  Données : exemples JSON du T0 tant que le lot A n'est pas intégré.

### Responsable de l'intégration

La session principale (marche Opus : agent `analyste`) : gèle les contrats (T0), fusionne
A → B → C dans `atelier-marketing`, lance `pnpm typecheck`, `pnpm build`, la sélection de
tests du socle, les tests atelier, puis les parcours Playwright, rejoue les scénarios A à F,
exporte la série de patches dans `socle/patches/` et met à jour `REPRISE.md`.

## 5. Ordre de livraison (cahier §19)

1. **T0** contrats + squelette de migration (intégrateur).
2. **Tranche 1 bout en bout** (A+B+C en parallèle, périmètre réduit) : brief → exigences →
   tâche du producteur (fixture) → livrable révisionné → contrôleur des exigences (fixture) →
   porte déterministe → étape humaine → décision, visible dans « Contenus à valider ». Cas
   concret : scénario B (trois établissements, omission détectée puis corrigée).
3. Rôles marketing, compétences et dépendances (B majoritaire).
4. Messagerie typée et corrections automatiques (A).
5. Six rubriques et leurs actions (C).
6. Adaptateur Claude Code réel (selon la question 2) et connecteurs réalisables (A+B).
7. Reprise, budgets, permissions, observabilité (A) ; scénarios E et F.
8. Tests de bout en bout et documentation de livraison du §18 (intégrateur).

## 6. Risques

- Patch du cœur (P1, raccords) : conflits à chaque mise à jour du socle ; atténué par des
  fonctions pures dans des fichiers à nous et des raccords d'une ligne.
- Mise à jour imposant l'arrêt complet (verrous SQLite) : prévoir une fenêtre d'arrêt.
- Le runner natif est actif par défaut : ne créer aucun agent `paperclip_runner`.
- Le moteur ACP embarque son propre Claude Code (2.1.286) : le comportement peut différer du
  CLI 2.1.292 de l'opérateur ; le confinement Bubblewrap n'existe qu'en moteur CLI.
- `dangerouslySkipPermissions`/`approve-all` par défaut : à remplacer par une liste d'outils et,
  si possible, le confinement ; à tester avant tout mode réel.
- Export : chemins absolus dans `args` ; contrôle systématique avant export.
- Visibilité intra-entreprise totale : jamais deux clients dans la même entreprise.


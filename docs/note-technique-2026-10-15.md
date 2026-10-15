# Note technique datée : socle Paperclip de l'Atelier Marketing IA

Date de vérification : 15 octobre 2026 (Europe/Brussels), sur le poste de développement (Ubuntu 26.04,
noyau 7.0.0-38, 16 cœurs, 30 Go de RAM). Phase 1 : audit du socle, installation,
démarrage, preuves de capacités. Aucune ligne de l'extension marketing n'est écrite.

Légende des preuves : `fichier:ligne` dans `paperclip/` (tag épinglé + correctif
local), « sonde » = `scripts/sondes/scenario-phase1.py` exécutée contre l'instance
réelle (résultats bruts : `instance/sonde-phase1-resultats*.json`, non versionnés).

## 1. Versions épinglées et outillage

| Élément | Valeur retenue | Preuve |
| --- | --- | --- |
| Paperclip | tag `v2026.1012.0`, SHA `bba6a45f0d364cfd962ac59b3bdf2426a8222adb`, commit du 2026-10-12T18:20:52Z | `git rev-list -n1 v2026.1012.0` ; `socle/VERSION` |
| Canal | stable : GitHub Release marquée « Latest » (2026-10-12T21:06:53Z), npm `latest = 2026.1012.0` | `gh release list -R paperclipai/paperclip` ; `npm view paperclipai dist-tags` |
| Provenance | promotion de `2026.1006.0-beta.0` (SHA `22a3ea34`) ; le tag n'ajoute que les notes de version et un ajustement du lanceur de tests CI | `git diff --stat beta/v2026.1006.0-beta.0 v2026.1012.0` (3 fichiers : `releases/v2026.1012.0.md`, `scripts/run-vitest-stable.mjs` et son test) |
| Branche locale | `atelier-marketing` = tag + 1 commit local `eacb9dcaa` (lockfile, voir §4) ; jamais poussée | `socle/patches/0001-*.patch` |
| Dépôt amont | https://github.com/paperclipai/paperclip | `git remote -v` |
| Node.js | v24.21.0 (exigé : `>=24.11.0`, `.nvmrc` = 24) | `package.json` « engines » |
| npm | 11.19.0 (et non 9) | `npm -v` |
| corepack | 0.36.0 | `corepack --version` |
| pnpm | 9.15.4, imposé par `packageManager`, fourni par corepack | raccourcis `~/.local/bin/pnpm` et `pnpx` (corepack enable --install-directory) |
| Magasin pnpm | partagé, `~/.local/share/pnpm/store/v3` (même système de fichiers : liens physiques) | `pnpm store path` |
| TypeScript | 7.0.2 (= `latest` npm, stable) | `ui/node_modules/.bin/tsc --version` ; `npm view typescript dist-tags` |
| Vite / Vitest | `^8.2.2` / 4.1.11 (stables ; les bêtas sont 8.3.0-beta et 5.0.0-beta) | `package.json`, `npm view` |
| Rust | 1.97.1, épinglé par `packages/paperclip-runner/rust-toolchain.toml`, **installé automatiquement par rustup pendant le build** (602 Mo dans `~/.rustup/toolchains/1.97.1-*`) | journal du build |
| Claude Code (CLI de l'opérateur) | 2.1.292 | `claude --version` |
| Harnais Claude qualifié par Paperclip | Claude Agent SDK 0.3.286 (= Claude Code 2.1.286) via `@agentclientprotocol/claude-agent-acp@0.73.0` | `pnpm-workspace.yaml` « overrides » ; notes `releases/v2026.1012.0.md` |
| PostgreSQL embarqué | paquet npm `embedded-postgres@18.1.0-beta.16` (patché), binaires PostgreSQL 18.1 | `server/package.json`, `pnpm-workspace.yaml` « patchedDependencies » |
| Bubblewrap | 0.11.1 présent (requis par le confinement optionnel de l'adaptateur) | `bwrap --version` |

**Correction du choix initial.** La première passe avait créé la branche sur `v2026.916.1`.
Ce tag est stable mais ancien : `v2026.1001.0`, `v2026.1005.0` et `v2026.1012.0` sont
postérieurs. L'erreur vient d'un tri alphabétique des tags (« 916 » passe devant « 1012 »).
La branche ne contenait aucun travail ; elle a été replacée sur `v2026.1012.0` (l'ancien
point reste accessible par son tag). La note de version de la prochaine stable
(`releases/beta/v2026.1012.1-beta.0.md` sur `master`, intitulée v2026.1015.0) est en
période d'essai bêta : elle n'est pas retenue.

## 2. Adaptateur Claude Code et moteur réellement utilisés

- Type d'agent : `claude_local` (`packages/adapters/claude-local`). Le type
  `paperclip_runner` (runner natif Rust) n'est pas retenu.
- Moteur par défaut : **ACP** quand `engine` est absent ou `auto`
  (`packages/adapters/claude-local/src/server/acp.ts:86-91`) : pont `acpx` +
  `@agentclientprotocol/claude-agent-acp`, qui embarque le Claude Agent SDK 0.3.286, et non le
  `claude` 2.1.292 installé. Mode `persistent`, `permissionMode = "approve-all"`,
  `nonInteractivePermissions = "deny"` (`packages/adapter-utils/src/acpx-engine/constants.ts:2-4`).
  Un échec ACP fait échouer le run, sans repli silencieux sur un autre moteur (`acp.ts:99-112`).
- Moteur CLI (`engine: "cli"` explicite) : commande `claude` du PATH (`execute.ts:176`),
  arguments `--print --output-format stream-json --verbose`, puis
  `--dangerously-skip-permissions` si `dangerouslySkipPermissions` (défaut `true`),
  `--model`, `--effort`, `--max-turns`, `--append-system-prompt-file` (hors reprise),
  `--mcp-config … --strict-mcp-config`, `--add-dir <bundle de skills>`, puis `extraArgs`
  (`execute.ts:849-880`, `permissions.ts:11-13`).
- `cwd` : champ `cwd` de l'agent (créé si absent) ; les sessions Claude sont reprises
  seulement si le `cwd` n'a pas changé (`docs/adapters/claude-local.md`).
- Tours : `maxTurnsPerRun`, défaut 300 (`docs/adapters/claude-local.md`).
- Budget : le budget n'est pas passé à Claude ; il est appliqué par Paperclip (coûts
  déclarés, plafonds mensuels, pause automatique ; voir matrice §15).
- Modèles proposés (`packages/adapters/claude-local/src/index.ts:42-56`) :
  `claude-fable-5-1`, `claude-mythos-5`, `claude-opus-5-5`, `claude-sonnet-5-5`,
  `claude-haiku-4-5`, `claude-fable-5`, `claude-opus-5`, `claude-opus-4-8`, `claude-opus-4-7`,
  `claude-opus-4-6`, `claude-sonnet-5`, `claude-sonnet-4-6`, `claude-sonnet-4-5`. Défaut si
  vide : `claude-opus-5` (`index.ts:1`). Opus 5.5 exige Claude Code ≥ 2.1.280 et Sonnet 5.5
  ≥ 2.1.284 (`index.ts:95-96`) : le 2.1.292 de l'opérateur convient. Effort : `low|medium|high`, plus
  `xhigh|max` sur les modèles récents. 
- Confinement optionnel : `filesystemScope: "workspace"` et `networkScope: "deny" | "allowlist"`
  via Bubblewrap, **moteur CLI seulement** (l'ACP est refusé dans ce cas) ;
  désactivés par défaut (`doc/spec/agent-runs.md:319-321`, `index.ts:97`). **Non testé.**
- Skills : copie dans un « prompt bundle » géré par Paperclip, passé par `--add-dir`
  (`docs/adapters/claude-local.md`, « Skills Injection » ; `skills.ts`).

### Point critique : la configuration Claude de l'hôte est chargée

En exécution locale, sans `CLAUDE_CONFIG_DIR` explicite dans l'environnement de l'agent,
l'adaptateur utilise le dossier Claude partagé de l'hôte (`resolveSharedClaudeConfigDir`,
`execute.ts:567`) ; les hooks ne sont retirés que pour les exécutions distantes
(`claude-config.ts:44-58`). La documentation Anthropic confirme que le SDK charge
« from your project's `.claude/` and from `~/.claude/` ».  Remède documenté : `CLAUDE_CONFIG_DIR` (« Override the configuration directory
(default: `~/.claude`). All settings, session history, and plugins are stored under this
path. », https://code.claude.com/docs/en/env-vars) pointant vers un dossier dédié de
l'atelier, avec une authentification propre (voir §3). À câbler et tester en lot B.

## 3. Authentification et coût

- Modes acceptés par l'adaptateur : `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`
  (`claude setup-token`) ou la connexion d'abonnement disponible pour la cible
  (`docs/adapters/claude-local.md`, « Prerequisites »). La santé de l'instance annonce
  `"localAiLoginSupported": true`.
- Règle Anthropic (https://code.claude.com/docs/en/agent-sdk/overview, consultée le
  15/10/2026) : « Unless previously approved, Anthropic does not allow third party developers
  to offer claude.ai login or rate limits for their products, including agents built on the
  Claude Agent SDK. Use the API key authentication methods described in the Quickstart
  instead. » Et pour `ANTHROPIC_API_KEY` : « When set, this key is used instead of your Claude
  Pro, Max, Team, or Enterprise subscription even if you are logged in. In non-interactive
  mode (`-p`), the key is always used when present. » (https://code.claude.com/docs/en/env-vars).

## 4. Installation : commandes, durées, résultats

| Étape | Commande | Durée | Résultat |
| --- | --- | --- | --- |
| Raccourcis pnpm | `corepack enable --install-directory ~/.local/bin pnpm` | instantané | `pnpm --version` = 9.15.4 |
| Installation figée | `pnpm install --frozen-lockfile` | 0,4 s | **Échec** `ERR_PNPM_OUTDATED_LOCKFILE` : `server/package.json` déclare `@modelcontextprotocol/sdk ^1.30.0` et `light-my-request ^6.6.0`, absents du lockfile au tag stable |
| Repli documenté | `pnpm install --no-frozen-lockfile` | 30,6 s | OK. Diff du lockfile : +2 spécificateurs, `light-my-request@6.8.0` (+3 dépendances), déduplications `jose` 6.2.8→6.2.10 et `iconv-lite` 0.7.2→0.7.3 |
| Correctif local | commit `eacb9dcaa` sur `atelier-marketing` | | politique amont : « GitHub Actions owns `pnpm-lock.yaml` » (`doc/DEVELOPING.md:21-27`) ; repli sans lockfile figé documenté (`doc/DEVELOPING.md:333-338`) ; builds de promotion en `--no-frozen-lockfile` (`.github/workflows/release.yml:374-377`) |
| Installation figée rejouée | `pnpm install --frozen-lockfile` | 5,4 s | OK |
| Build | `pnpm build` | 2 min 31 s (1 067 s CPU) | OK (compile aussi le runner Rust ; avertissements Rust « unused » seulement) |
| Types | `pnpm typecheck` | 1 min 18 s (403 s CPU) | OK, 0 erreur TypeScript |
| Reconstruction reproductible | `scripts/preparer-socle.sh` (vérif. tag/SHA, branche, install figée, build) | 54 s (235 s CPU) | OK |
| Tests représentatifs | `scripts/sondes/tests-representatifs.sh` | voir §8 | voir §8 |

Accélération  : le magasin pnpm partagé est réutilisé ; la reconstruction
passe de 1 067 s à 235 s de CPU grâce aux caches existants (dossier `target/` de Cargo,
sorties `dist/`). Aucun `tsconfig` n'active `incremental` (seule l'UI fait `tsc -b`) ;
l'activer imposerait de modifier des fichiers suivis : non fait, consigné comme option.


## 5. Base embarquée : divergence tranchée par un test

- `AGENTS.md` (§4) dit « Use embedded PGlite » et `rm -rf data/pglite`.
- Le code n'a plus de PGlite : le mode `pglite` est un ancien nom réécrit en
  `embedded-postgres` (`packages/db/src/runtime-config.ts:114-130`,
  `cli/src/config/store.ts:57-70`) ; le serveur importe `embedded-postgres`
  (`server/src/index.ts:436-452`).
- Test : au démarrage, la bannière affiche `Mode embedded-postgres`, la base est dans
  `instance/instances/atelier/db` et un processus `postgres` écoute sur `127.0.0.1:54329`.
  **Décision : PostgreSQL embarqué (embedded-postgres), conforme à `doc/DATABASE.md` et
  `doc/SPEC-implementation.md` §6.2 ; `AGENTS.md` est périmé sur ce point.**

## 6. Télémétrie, traces et journaux

Trois chemins distincts (`AGENTS.md` §5.7) :

1. **Télémétrie Paperclip** (envoi à un point de collecte Paperclip, activée par défaut) :
   coupée par `PAPERCLIP_TELEMETRY_DISABLED=1` (`README.md:547-554`, lu par
   `packages/shared/src/telemetry/config.ts:71`) dans `config/atelier.env`, **et** par
   `telemetry.enabled: false` dans `instance/instances/atelier/config.json` (méthode « Config
   file » documentée ; l'onboarding avait écrit `true`). Vérifié dans l'environnement réel du
   processus serveur (`/proc/<pid>/environ`).
2. **Observabilité OpenTelemetry et Sentry** : inactives tant qu'aucun point
   `OTEL_EXPORTER_OTLP_ENDPOINT` ou `SENTRY_DSN*` n'est défini (`README.md:535-537`). Rien défini.
3. **Journal des runs** (`heartbeat_run_events`) : local, dans la base de l'instance.

Autres flux sortants : annonces publiques coupées (`PAPERCLIP_ANNOUNCEMENTS_ENABLED=false`,
`doc/ANNOUNCEMENTS.md:9`) ; partage des traces de retour mis à `not_allowed` par
`PAPERCLIP_SETTING_DEFAULTS` (défaut amont : `prompt`,
`packages/shared/src/types/feedback.ts:10`) ; la CLI vérifie les mises à jour sur le registre
npm public (`updates.checkEnabled: true`, laissé actif : simple lecture de version, utile pour
suivre les stables). Pendant toute la session, aucune connexion sortante n'a été observée sur
les processus de l'instance (`ss -tnp`). Côté Claude Code des agents, la télémétrie se coupe
par `DISABLE_TELEMETRY` ou `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
(https://code.claude.com/docs/en/env-vars) : à mettre dans l'environnement des agents (lot B).

## 7. Instance locale : démarrage, santé, arrêt

- Fichier d'environnement non suivi : `config/atelier.env` (copie de
  `config/atelier.env.example`, droits 600) : `PAPERCLIP_HOME=…/atelier-marketing-ia/instance`,
  `PAPERCLIP_INSTANCE_ID=atelier`, `PAPERCLIP_DEPLOYMENT_MODE=local_trusted`,
  `PAPERCLIP_BIND=loopback`, `PORT=3100`, plus les réglages du §6. Toutes ces variables
  figurent dans `docs/deploy/environment-variables.md`.
- Premier lancement : `scripts/lancer-instance.sh` → `pnpm paperclipai onboard --yes
  --no-install-service` (aucun service système installé, `cli/src/onboard-service.ts:217-226`) ;
  lancements suivants : `pnpm paperclipai run --no-repair`. Santé en ~18 s.
- `GET /api/health` : `status: ok`, `version: 2026.1012.0+1.git.eacb9dcaa`,
  `deploymentMode: local_trusted`, `deploymentExposure: private`, `bootstrapStatus: ready` ;
  seul avertissement : aucune sauvegarde encore produite (sauvegarde automatique horaire,
  rétention 30 jours, dans `instance/instances/atelier/data/backups`).
- `GET /` : HTTP 200, `text/html` (UI servie par le serveur, middleware Vite en mode source).
- Liaison : seuls `127.0.0.1:3100` (serveur) et `127.0.0.1:54329` (PostgreSQL) écoutent ;
  l'accès par les adresses du réseau local est refusé.
- Données créées dans `instance/instances/atelier/` : `config.json`, `.env` (secrets JWT et de
  signature générés, droits 600), `secrets/master.key` (600), `db/`, `logs/`, `data/storage`.
  `~/.paperclip` n'existe pas et n'a pas été créé.
- Arrêt : `scripts/arreter-instance.sh` identifie le PID qui écoute sur le port, vérifie qu'il
  appartient au projet, envoie SIGTERM, attend la libération des deux ports. Constaté : drainage
  des runs (0 interrompu), arrêt des plugins puis du PostgreSQL embarqué, code 0.

## 8. Tests exécutés

Lanceur : `scripts/sondes/tests-representatifs.sh` (même environnement isolé que
`scripts/run-vitest-stable.mjs` : `PAPERCLIP_HOME`, `PAPERCLIP_CONFIG`,
`PAPERCLIP_INSTANCE_ID` et `TMPDIR` temporaires sous `/tmp/claude-1000/pv-*`, chemin court
exigé par les sockets Unix ; supprimés à la fin ; serveur en un seul worker).

| Lot de tests | Résultat | Durée |
| --- | --- | --- |
| Serveur, 17 fichiers ciblés : `issue-execution-policy`, `issues-service` (checkout 409, blocages, cycles), `issue-stale-execution-lock-routes`, `issue-dependency-wakeups`, `issue-comment-wakeup`, `budgets-service`, `approvals-service`, `approval-routes-idempotency`, `company-portability`, `export-fidelity`, `live-events-ws`, `plugin-scoped-api-routes`, `plugin-routes-authz`, `plugin-tenant-isolation`, `claude-local-skill-sync`, `run-secret-redaction`, `secrets-routes` | **17/17 fichiers, 466/466 tests réussis** | 69 s |
| Adaptateur `claude-local` (tous ses tests), locale française du poste de développement | 25 échecs, 319 réussis, 1 ignoré (fichiers `acp.test.ts`, `test.probe.test.ts`, `test.remote.test.ts`) | 31 s |
| Même lot avec `LC_ALL=C.UTF-8` | **344 réussis, 1 ignoré, 0 échec** | 31 s |
| Même lot avec `LC_MESSAGES=C.UTF-8` seul (parade retenue) | **344 réussis, 1 ignoré, 0 échec** | 31 s |

Cause des 25 échecs, établie par lecture puis par test : git répond « ni ceci ni aucun de
ses répertoires parents … n'est un dépôt git » au lieu de « not a git repository », et
`isNotAGitRepositoryError` ne reconnaît que l'anglais
(`packages/adapter-utils/src/git-workspace-sync.ts:354-372`) ; l'environnement git « durci »
ne force pas la locale. Le même code sert à la synchronisation des espaces de travail
distants : le défaut peut donc toucher l'exécution, pas seulement les tests. Parade appliquée
sans modifier le socle : `LC_MESSAGES=C.UTF-8` dans `config/atelier.env` et dans le lanceur de
tests. Correctif amont possible (une ligne : forcer `LC_ALL=C` dans `buildHardenedGitEnv`),
non appliqué en phase 1.

Sonde réelle contre l'instance (`scripts/sondes/scenario-phase1.py`, agents `process`
déterministes, aucun modèle) : passe 1 = 8 OK, 3 écarts (dont 2 dus à un défaut de ma sonde,
corrigé : révision de document sans `baseRevisionId` → 409) ; **passe 2 = 11 OK, 1 écart**
(le contournement décrit dans la matrice §8). Suite complète `pnpm test:run` : **non lancée**
(926 fichiers serveur, plusieurs dizaines de minutes ; la sélection ci-dessus couvre les
invariants utilisés par l'atelier). Suites navigateur (`pnpm test:e2e`) : non lancées.

## 9. Divergences README / doc / code et tests qui les tranchent

| Sujet | Doc | Code / réalité | Tranché par |
| --- | --- | --- | --- |
| Base embarquée | `AGENTS.md` : PGlite | embedded-postgres | démarrage réel (§5) |
| Lockfile au tag stable | `pnpm install --frozen-lockfile` attendu | lockfile en retard sur `server/package.json` | installation réelle (§4) |
| Runner natif | `docs/deploy/environment-variables.md` : `enableNativeRunner` « default `false` » | `default(true)` (`packages/shared/src/validators/instance.ts:43`) | `GET /api/instance/settings/experimental` sur l'instance : `true`. Réglages « expérimentaux » actifs par défaut : `enableApps`, `enableMcpAggregators`, `enableNativeRunner`, `enableStreamlinedLeftNavigation`, `enableStreamlinedUi`, `enableWorkspaceBranchReconcileForward`, `enableWorkspaceDirtyQuarantineRepair` |
| Tours de revue | `docs/guides/execution-policy.md` ne cite pas de limite | `maxReviewRounds` (1 à 50), défaut 3, puis escalade vers l'humain responsable (`server/src/services/issue-execution-policy.ts:64-69,447-450,860-895`) | sonde : escalade après 3 tours (passe 1) et après 2 tours avec `maxReviewRounds: 2` (passe 2) |
| Plusieurs participants | doc : un seul est choisi (`approvalsNeeded: 1`) | `z.literal(1)` (`packages/shared/src/validators/issue.ts:387`) | sonde : seul le relecteur 1 est sollicité |
| Adaptateurs externes | `adapter-plugin.md` à la racine | ce fichier est un compte rendu de branche inachevé (« not finished yet »), pas un guide ; la référence est `docs/adapters/external-adapters.md` | lecture |
| Docker Compose | `doc/DATABASE.md` : `docker compose up -d` à la racine | le fichier est dans `docker/docker-compose.yml` | `ls` |
| Export « sans chemins locaux » | SPEC §21 : l'export retire les chemins propres à l'environnement | `cwd` et commande absolue retirés, mais **les chemins absolus dans `args` sont exportés** et les valeurs d'environnement locales partent avec un avertissement | sonde (export réel) |
| Doc en ligne | https://docs.paperclip.ing/reference/adapters/claude-code/ ne donne pas de modèle par défaut | doc du tag et code : `claude-opus-5` | lecture (référence retenue : tag) |
| Statut des plugins | pas de drapeau expérimental, SDK 1.0.0 | guide : « the alpha surface that exists now » (`doc/plugins/PLUGIN_AUTHORING_GUIDE.md:5,85`) | lecture |
| Versions de skills | le guide présente versions et épinglage | l'épinglage par exécution n'est actif qu'avec le réglage expérimental `enableBetaSkills` (`server/src/services/heartbeat.ts:21834-21842`) | lecture |
| Confinement low-trust | `doc/LOW-TRUST-PRESETS.md` | exige les espaces isolés, réglage expérimental `enableIsolatedWorkspaces` | sonde : run en échec `low_trust_isolation_unavailable` |
| Tests et locale | | `isNotAGitRepositoryError` ne reconnaît que le texte anglais de git (`packages/adapter-utils/src/git-workspace-sync.ts:354-372`) | voir §8 |

## 10. URLs consultées (15/10/2026)

- https://github.com/paperclipai/paperclip (clone, tags, `gh release list`)
- https://registry.npmjs.org (dist-tags `paperclipai`, `embedded-postgres`, `typescript`, `vite`, `vitest`)
- https://docs.paperclip.ing/reference/adapters/claude-code/
- https://code.claude.com/docs/en/agent-sdk/overview
- https://code.claude.com/docs/en/env-vars
- Les autres pages listées au §2 du cahier ont été lues dans leur source au tag
  (`paperclip/docs/` alimente docs.paperclip.ing, fichier `docs/docs.json`) : `docs/adapters/*`,
  `docs/guides/execution-policy.md`, `docs/guides/agent-developer/*`,
  `docs/guides/board-operator/importing-and-exporting.md`, `docs/deploy/*`, `doc/plugins/*`.
  Les pages Anthropic sur sous-agents, sessions, permissions, hooks, coûts, skills et Agent Teams
  n'ont pas été relues en phase 1 : à faire avant le lot B (non vérifié).

## 11. Limites de cette phase

- Aucun appel réel de modèle, aucun test du moteur ACP ou CLI avec Claude.
- Le confinement Bubblewrap, l'adaptateur externe en paquet, l'installation d'un plugin et
  le comportement exact du runner natif n'ont pas été exécutés.
- La sonde agit en mode `local_trusted` (acteur « board » implicite) : les règles
  d'authentification du mode `authenticated` ne sont pas couvertes.

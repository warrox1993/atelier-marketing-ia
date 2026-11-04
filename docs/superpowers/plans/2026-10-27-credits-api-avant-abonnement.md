# Crédits API avant l'abonnement : plan d'implémentation

> Pour les agents : suivre ce plan tâche par tâche (superpowers:executing-plans, discipline
> superpowers:test-driven-development). Cases `- [ ]` à cocher au fil de l'eau.

**Goal :** l'usine consomme d'abord les 200 $ de crédits API mensuels de l'opérateur, puis bascule toute seule sur l'abonnement
(crédit épuisé, plafond, facturation, clé refusée), revient sur l'API au cycle suivant, sans que les crédits remplissent
les plafonds de budget des services.

**Architecture :** patch du socle `0097` dans l'adaptateur `claude-local` (voie CLI) : classifieur d'échec de clé,
mémoire « épuisé jusqu'à » en mémoire du processus, relance de la même exécution sans `ANTHROPIC_API_KEY`. Patch `0098`
dans le serveur : les événements `credits` sortent des totaux de budget, un plafond d'instance par cycle du 12 au 12
est calculé avant chaque exécution `claude_local` et passé dans le contexte. Usine : commande
`bootstrap-organisation.py cle-api` qui range la clé comme secret de chaque entreprise et la lie aux seuls agents
`claude_local`.

**Tech Stack :** TypeScript, Vitest 5, Drizzle + PostgreSQL embarqué (tests du serveur), pnpm (socle Paperclip
v2026.1023.0 + 96 patches) ; Python 3, `unittest`, API Paperclip simulée (usine).

**Spec :** `docs/superpowers/specs/2026-10-27-credits-api-avant-abonnement-design.md`, y compris la section finale
« Décisions de l'opérateur (27/10/2026) » qui prime sur les sections 6, 10 et 13.

## Global Constraints

- Décisions de l'opérateur du 27/10/2026, appliquées partout :
  - plafond d'instance : **20000 centimes de dollar US** (200 $) par cycle, cycle du **12 au 12** (minuit UTC) ;
  - **401, clé refusée : bascule sur l'abonnement avec l'alerte « clé d'API refusée »** au journal ; l'usine ne
    s'arrête jamais à cause de la clé. Ceci REMPLACE la ligne 401 du tableau de la section 6 et le test 3 de la
    section 10 (plus de code `claude_cle_api_invalide` qui fait échouer l'exécution) ;
  - règle des budgets validée telle que la section 7.2.
- Sans clé configurée sur l'agent (cas de toute l'usine aujourd'hui) : arguments, environnement transmis, `billingType`
  et résultat identiques à l'actuel (test de caractérisation A4, écrit et vert AVANT de toucher `execute.ts`).
- La clé n'est jamais journalisée, affichée, comparée en clair ni conservée : seule l'empreinte (8 premiers caractères
  hexadécimaux du SHA-256) circule.
- Une seule bascule par exécution, jamais de retour vers l'API dans la même exécution.
- Voie ACP (`acp.ts`) et Bedrock : non touchés.
- Les patches du socle : UN commit par patch sur la branche `atelier-marketing-v2026.1023.0` de `paperclip/`, parce que
  `scripts/preparer-socle.sh:41-49` exige autant de commits au-dessus du tag que de fichiers `socle/patches/*.patch`.
  Dans les lots A et B, les étapes TDD ne commitent donc PAS dans `paperclip/` : le commit unique est la dernière
  tâche du lot (A7, B4). Les commits intermédiaires se font seulement dans le dépôt de l'usine (lot C).
- Commits dans `paperclip/` et dans l'usine : toujours `git add <fichiers> && git commit -q -o -m "…" -- <fichiers>`,
  jamais `git add .` (trois lots travaillent dans les mêmes copies de travail). Messages terminés par les deux lignes
  `Co-Authored-By` et `Claude-Session` de la session.
- Toute suite passe par le verrou : `flock ~/.cache/verification-hooks/suite.lock <commande>`. Jamais la suite complète
  du serveur dans les lots ; seulement les fichiers cités.
- Interdits : instance 3100, déploiement, worktree, sous-agent, relecture, lecture d'un secret,
  `docs/mode-authentifie.md` et `scripts/passer-en-mode-authentifie.*`.
- Graphe : `graphify query "<question>"` avant toute recherche hors des fichiers et lignes cités ici.
- Français partout (commentaires, messages, tests côté usine) ; noms de tests du socle en anglais comme le code amont,
  messages de journal en français (spec section 9).

## Review Focus

- Ordre des classifications dans `execute.ts` : la bascule doit être décidée AVANT `detectClaudeLoginRequired`, sinon
  un 401 sur clé devient `claude_auth_required` (A5).
- L'environnement réellement transmis au processus du second essai ne contient plus `ANTHROPIC_API_KEY` (le processus
  enfant hérite de `process.env`, `packages/adapter-utils/src/server-utils.ts:4719-4721`) ; garde `claude_cle_api_hote`.
- `billingType` calculé par essai, et le reçu de l'essai API échoué n'est jamais « non tarifé » (sinon la politique
  `block` de l'Observatoire met l'entreprise en pause, spec 7.2 point 4).
- `budgets.ts:202` : seule la somme exclut `credits` ; la règle des non-tarifés (`:203`) reste inchangée.
- Usine : `liaison_conforme` (`scripts/bootstrap-organisation.py:1136-1157`) compare l'ENSEMBLE des clés de `env` ;
  tout appelant de `liaison_voulue` / `lier_agents` qui oublie `cle_id` efface la clé au prochain `appliquer`.

## Lots parallèles (au plus 3 agents, fichiers disjoints)

| Lot | Tâches | Fichiers (et seulement eux) |
| --- | --- | --- |
| A : bascule dans l'adaptateur, patch 0097 | A1 à A7 | `paperclip/packages/adapters/claude-local/src/server/parse.ts`, `…/parse.credits.test.ts` (nouveau), `…/credits-memoire.ts` (nouveau), `…/credits-memoire.test.ts` (nouveau), `…/execute.ts`, `…/index.ts`, `…/__fixtures__/credits-cli.json` (nouveau), `paperclip/server/src/__tests__/claude-local-credits-bascule.test.ts` (nouveau), `socle/patches/0097-*.patch` (nouveau) |
| B : budgets, patch 0098 | B1 à B4 | `paperclip/server/src/services/budgets.ts`, `paperclip/server/src/services/heartbeat/runtime-execution.ts`, `paperclip/server/src/__tests__/budgets-credits.test.ts` (nouveau), `socle/patches/0098-*.patch` (nouveau) |
| C : commande de l'usine | C1 à C3 | `scripts/bootstrap-organisation.py`, `scripts/tests/tester-cle-api.py` (nouveau) |
| Fin (après A, B, C) | V | aucun fichier modifié |

Interface partagée entre A et B (fixée ici, à ne pas renommer) : le serveur pose dans le contexte de l'exécution

```ts
context.paperclipClaudeCreditsPlafond = { atteint: true, depenseCentimes: number, plafondCentimes: number }
```

seulement quand le plafond est atteint ; l'adaptateur lit `parseObject(context.paperclipClaudeCreditsPlafond).atteint === true`.

Ordre des fichiers de patch : A produit `0097`, B produit `0098`, quel que soit l'ordre des deux commits sur la branche
(fichiers disjoints, `git am` les applique dans les deux ordres ; V le prouve par un rejeu).

Variables (toutes facultatives, défauts entre parenthèses) :

| Variable | Où | Rôle |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | env de l'agent, `secret_ref` | la clé |
| `PAPERCLIP_CLAUDE_CLE_API` | env de l'agent, `plain` | `credits_inclus` : `billingType` `credits` au lieu de `api` |
| `PAPERCLIP_CLAUDE_CREDITS_REESSAI_HEURES` | env du serveur (6) | durée de la mémoire « épuisé jusqu'à » |
| `PAPERCLIP_CLAUDE_CREDITS_PLAFOND_CENTIMES` | env du serveur (20000) | plafond d'instance, centimes de dollar |
| `PAPERCLIP_CLAUDE_CREDITS_JOUR_CYCLE` | env du serveur (12) | jour de début du cycle |

## Procédure du dépôt pour un patch numéroté du socle

Relevée dans `scripts/preparer-socle.sh` et `docs/mise-a-jour-socle.md:56-97` ; modèle : commit `8a46331` de l'usine
(ajout du seul fichier `socle/patches/0096-…patch`, produit par `git format-patch` d'un commit unique de la branche).

```bash
cd ~/Projets/atelier-marketing-ia
git -C paperclip branch --show-current          # attendu : atelier-marketing-v2026.1023.0
git -C paperclip rev-list --count v2026.1023.0..HEAD   # attendu : 96 (97 après le premier des deux patches)
# … travail TDD sans commit …
git -C paperclip add <fichiers du lot>
git -C paperclip commit -q -o -m "feat(claude-local): …" -- <fichiers du lot>
SHA=$(git -C paperclip rev-parse HEAD)
git -C paperclip format-patch -1 "$SHA" --start-number 97 -o ../socle/patches   # 98 pour le lot B
ls socle/patches | tail -2                      # le nouveau fichier 0097-… (ou 0098-…)
git add socle/patches/0097-*.patch
git commit -q -o -m "feat(socle): patch 0097, …" -- socle/patches/0097-*.patch
```

`format-patch` doit être lancé depuis `paperclip/` avec `-o ../socle/patches` : `-C paperclip` résout `-o` par rapport
à `paperclip/`, d'où le `../`. Le rejeu complet (`git am` sur le tag dans un clone jetable) est fait une fois, en V.

## Commandes des suites ciblées

```bash
P=~/Projets/atelier-marketing-ia/paperclip
L=~/.cache/verification-hooks/suite.lock
# Adaptateur, tests unitaires (paquet, vitest.config.ts du paquet)
cd $P/packages/adapters/claude-local && flock $L pnpm exec vitest run src/server/parse.credits.test.ts src/server/credits-memoire.test.ts
# Adaptateur, exécution avec faux binaire claude (le serveur importe le paquet par ses sources, package.json "exports")
cd $P/server && flock $L pnpm exec vitest run src/__tests__/claude-local-credits-bascule.test.ts
# Non-régression de l'adaptateur
cd $P/server && flock $L pnpm exec vitest run src/__tests__/claude-local-execute.test.ts src/__tests__/claude-local-adapter.test.ts src/__tests__/claude-local-adapter-environment.test.ts
cd $P/packages/adapters/claude-local && flock $L pnpm exec vitest run src/server/parse.test.ts
# Budgets (PostgreSQL embarqué ; vérifier « skipped 0 » : sans support, describe.skip rend la suite verte à vide)
cd $P/server && flock $L pnpm exec vitest run src/__tests__/budgets-credits.test.ts src/__tests__/budgets-service.test.ts
# Typage
cd $P && flock $L pnpm --filter @paperclipai/adapter-claude-local typecheck
cd $P && flock $L pnpm --filter @paperclipai/server typecheck
# Usine
cd ~/Projets/atelier-marketing-ia && python3 -I scripts/tests/tester-cle-api.py
```

---

## Lot A : bascule dans l'adaptateur (patch 0097)

### Tâche A1 : relever les textes du CLI installé (NON VÉRIFIÉ par la spec, 15 min)

La spec (section 6) n'a relevé ni le texte du plafond de dépense (400) ni celui du plafond mensuel du palier (429 sans
`retry-after`), ni la forme exacte de l'événement `billing_error`, ni celle du 401 sur clé. Rien n'est écrit sur une
supposition : les tests A2 lisent ce fichier.

**Fichiers :** créer `paperclip/packages/adapters/claude-local/src/server/__fixtures__/credits-cli.json`.

- [ ] Étape 1 : identifier le binaire réellement utilisé.
  ```bash
  readlink -f "$(command -v claude)"; claude --version
  ```
  Attendu : un chemin sous `~/.local/share/claude/versions/` et la version. Si elle n'est pas 2.1.308, le relevé se
  fait sur la version installée et le JSON le dit.
- [ ] Étape 2 : extraire les chaînes candidates (lecture seule).
  ```bash
  B=$(readlink -f "$(command -v claude)")
  strings -n 12 "$B" | grep -n -i -E "credit balance|spend(ing)? (limit|cap)|usage limit|monthly (usage|spend)|billing_error|credit_balance_low|invalid api key|authentication_failed|x-api-key" | head -80
  strings -n 12 "$B" | grep -o -E '.{0,240}billing_error.{0,240}' | head -20
  ```
  Attendu : l'expression `/^Your credit balance is too low…$/` et `UBn="Credit balance is too low"` déjà cités
  (spec 2.3) ; à repérer en plus : le texte affiché à la limite de dépense d'organisation ou d'espace de travail, celui
  du plafond mensuel du palier, celui du 401 sur clé, et l'emplacement du champ `error` (événement `assistant`,
  `result`, ou les deux).
- [ ] Étape 3 (facultative, sans secret ni coût) : observer la vraie sortie d'un 401 avec une clé factice, isolée de la
  configuration de l'opérateur :
  ```bash
  D=$(mktemp -d); env -u CLAUDE_CODE_OAUTH_TOKEN CLAUDE_CONFIG_DIR="$D" ANTHROPIC_API_KEY=sk-ant-api03-cle-factice \
    claude -p "ok" --output-format stream-json --verbose < /dev/null > "$D/sortie.jsonl" 2>"$D/erreurs.txt"; echo "code $?"
  head -c 3000 "$D/sortie.jsonl"; cat "$D/erreurs.txt" | head -20
  ```
  Attendu : code non nul, un événement portant `authentication_failed` ou « Invalid API key ». Recopier les lignes dans
  le JSON (elles ne contiennent aucun secret : la clé est factice).
- [ ] Étape 4 : écrire `credits-cli.json` :
  ```json
  { "cliVersion": "<version>", "releveLe": "2026-10-27",
    "creditsEpuises": { "brutApi": "…", "affiche": "…", "evenement": { … } },
    "plafondDepense": { "texte": "… ou null si introuvable" },
    "plafondPalier": { "texte": "… ou null si introuvable" },
    "cleRefusee": { "texte": "…", "evenement": { … } } }
  ```
  Toute valeur introuvable vaut `null` et la raison est notée dans le rapport du lot : le classifieur ne reconnaîtra
  alors PAS ce cas (aucune expression devinée).

### Tâche A2 : classifieur d'échec de la clé (25 min)

**Fichiers :** modifier `paperclip/packages/adapters/claude-local/src/server/parse.ts` (nouvelle fonction après
`isClaudeProviderQuotaError`, `:582-602`, et ses expressions près de `:23-26`) ; créer `…/src/server/parse.credits.test.ts`.

**Interfaces :**

```ts
export type ClaudeApiKeyFailure = "credits_epuises" | "facturation" | "plafond_depense" | "cle_refusee";
export function classifyClaudeApiKeyFailure(input: {
  parsed?: Record<string, unknown> | null;
  stdout?: string | null;
  stderr?: string | null;
  errorMessage?: string | null;
}): ClaudeApiKeyFailure | null;
```

Écart assumé avec la spec : elle nomme `isClaudeApiCreditExhausted` (booléen) ; la décision 2 de l'opérateur ajoute le 401 qui
bascule lui aussi, et le journal a besoin de la raison : un seul classifieur à quatre valeurs.

Règles : le texte « credit balance (is )too low » est cherché dans les champs terminaux (`parsed.result`,
`parsed.errors`), `stderr` et `errorMessage`, jamais dans la prose des événements d'assistant ; le marqueur
`"error":"billing_error"` est cherché dans les événements JSON de `stdout` (non échappé, donc absent d'une citation dans
un texte). `402` / « billing » de facturation → `facturation`. Plafonds : seulement les textes relevés en A1.
401 : `authentication_failed` ou le texte relevé en A1. Rien d'autre (529, 429 avec délai, quotas de l'abonnement) ne
renvoie une valeur non nulle.

- [ ] Étape 1 : écrire les tests (qui échouent : la fonction n'existe pas), données lues dans `__fixtures__/credits-cli.json` :
  - `classifies the displayed "Credit balance is too low" result as credits_epuises`
  - `classifies the raw API message "Your credit balance is too low…" as credits_epuises`
  - `classifies a billing_error assistant event as credits_epuises`
  - `classifies the spend-limit text captured from the CLI as plafond_depense` (aucun `skip` : si A1 a noté `null`, le test affirme à la place que le classifieur renvoie `null` pour un 400 générique)
  - `classifies authentication_failed / Invalid API key as cle_refusee`
  - `returns null for 529 overloaded_error`
  - `returns null for a 429 rate_limit_error with retry-after`
  - `returns null for subscription quota text ("You've hit your limit … resets 5pm")`
  - `returns null when a successful run's assistant prose quotes "credit balance is too low"`
- [ ] Étape 2 : lancer `cd $P/packages/adapters/claude-local && flock $L pnpm exec vitest run src/server/parse.credits.test.ts`.
  Attendu : échec à l'import (`classifyClaudeApiKeyFailure is not a function` ou erreur de typage).
- [ ] Étape 3 : écrire le code minimal dans `parse.ts`.
- [ ] Étape 4 : relancer. Attendu : 9 tests réussis, 0 ignoré. Puis `src/server/parse.test.ts` : vert, inchangé.
- [ ] Étape 5 : pas de commit dans `paperclip/` (voir Global Constraints) ; contrôle : `git -C $P diff --stat`.

### Tâche A3 : mémoire « épuisé jusqu'à » (15 min)

**Fichiers :** créer `…/src/server/credits-memoire.ts` et `…/src/server/credits-memoire.test.ts` ; modifier
`…/src/server/index.ts` (exporter, à côté de `resetClaudeCliCapabilitiesCacheForTests`, ligne 9).

**Interfaces :**

```ts
export function empreinteCleApi(cle: string): string;                       // 8 hex du SHA-256
export function lireCreditsEpuises(empreinte: string): Date | null;          // brut, échu ou non
export function marquerCreditsEpuises(empreinte: string, maintenant: Date, heures: number): Date; // rend T
export function effacerCreditsEpuises(empreinte: string): boolean;          // vrai si une entrée existait
export function delaiReessaiCreditsHeures(env?: NodeJS.ProcessEnv): number; // PAPERCLIP_CLAUDE_CREDITS_REESSAI_HEURES, défaut 6
export function resetClaudeCreditsMemoireForTests(): void;
```

Avertissement du serveur (spec 9, une ligne par transition) : `console.warn` dans `marquerCreditsEpuises` quand
aucune entrée non échue n'existait, et dans `effacerCreditsEpuises` quand une entrée existait ; empreinte seule.

- [ ] Étape 1 : tests :
  - `empreinteCleApi returns 8 lowercase hex chars and never the key` (la sortie ne contient aucun fragment de 8 caractères de la clé d'essai)
  - `marquerCreditsEpuises stores now + heures and lireCreditsEpuises returns it`
  - `effacerCreditsEpuises returns true once then false`
  - `delaiReessaiCreditsHeures defaults to 6 and ignores 0, negative or non-numeric values`
  - `warns once per transition, not on a second marquer within the window` (`vi.spyOn(console, "warn")`, 1 appel)
- [ ] Étape 2 : lancer (commande unitaire du paquet). Attendu : échec, module absent.
- [ ] Étape 3 : code minimal, exports dans `index.ts`.
- [ ] Étape 4 : relancer. Attendu : 5 réussis.

### Tâche A4 : caractérisation sans clé, puis `billingType` par essai (25 min)

**Fichiers :** créer `paperclip/server/src/__tests__/claude-local-credits-bascule.test.ts` ; modifier `…/execute.ts`
(`resolveClaudeBillingType` `:171-174`, appel `:500`, `runAttempt` `:907-1005`, `toAdapterResult` `:1007` et ses
`billingType` `:1040`, `:1110`, `:1289`, `accountingLog` `:976-980`).

Aides du fichier de test, recopiées de `server/src/__tests__/claude-local-execute.test.ts` (non exportées là-bas) :
`setupExecuteEnv` (`:293-315`) et le modèle de faux binaire `writeRetryThenSucceedClaudeCommand` (`:252-291`), appel
d'`execute` comme `:640-668`. Nouveau faux binaire :

```ts
async function writeCreditsClaudeCommand(commandPath: string, onKey: "succeed" | "credits" | "raw-credits" | "auth" | "overloaded" | "rate-limit"): Promise<void>;
// À chaque lancement : ajoute { argv, apiKey: process.env.ANTHROPIC_API_KEY ?? null,
//   oauth: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? null, resumed: argv.includes("--resume") } à PAPERCLIP_TEST_CAPTURE_PATH.
// Avec clé : comportement onKey (événements recopiés de credits-cli.json, code de sortie 1) ; sans clé : succès
//   (init + assistant + result, session 2222…), ou échec de quota de l'abonnement si PAPERCLIP_TEST_SUB_QUOTA=1.
```

`config.env` des tests : `{ ANTHROPIC_API_KEY: "sk-ant-test-cle", PAPERCLIP_CLAUDE_CLE_API: "credits_inclus",
CLAUDE_CODE_OAUTH_TOKEN: "jeton-test", PAPERCLIP_TEST_CAPTURE_PATH }`. `beforeEach` : `resetClaudeCreditsMemoireForTests()`
et `delete process.env.ANTHROPIC_API_KEY` (valeur précédente restaurée en `afterEach`).

**Interfaces modifiées :**

```ts
function resolveClaudeBillingType(env: Record<string, string>): "api" | "credits" | "subscription" | "metered_api";
const runAttempt = async (resumeSessionId: string | null, attemptEnv?: Record<string, string>) =>
  Promise<{ proc; parsedStream; parsed; billingType }>;  // attemptEnv par défaut : env
```

`toAdapterResult` lit `attempt.billingType` au lieu de la constante de `:500` ; la constante reste pour le retour de
version incompatible (`:1337`).

- [ ] Étape 1 : écrire et lancer AVANT toute modification d'`execute.ts` le test de caractérisation
  `without an API key: one launch, no key in the child env, billingType subscription, no atelierBascule` (config sans
  `ANTHROPIC_API_KEY` ni `PAPERCLIP_CLAUDE_CLE_API`). Attendu : VERT sur le code actuel. Il doit rester vert après.
- [ ] Étape 2 : écrire les tests qui échouent :
  - `with credits_inclus and a working key: one launch with the key, billingType credits`
  - `with a key but without PAPERCLIP_CLAUDE_CLE_API: billingType api as today`
  - `usage receipts of a credits attempt carry billingType credits` (capture de `onUsage`)
- [ ] Étape 3 : lancer `cd $P/server && flock $L pnpm exec vitest run src/__tests__/claude-local-credits-bascule.test.ts`.
  Attendu : 1 réussi (caractérisation), 3 en échec (`"api"` reçu au lieu de `"credits"`, etc.).
- [ ] Étape 4 : code minimal dans `execute.ts`.
- [ ] Étape 5 : relancer. Attendu : 4 réussis. Puis la non-régression `claude-local-execute.test.ts` : vert.

### Tâche A5 : la bascule (30 min)

**Fichiers :** `…/execute.ts` (bloc de décision juste après `const initial = await runAttempt(sessionId ?? null);`,
`:1347`) ; le fichier de test de A4.

Déroulé à coder (spec 4.1, étapes 3 à 5) :
1. `cleAgent` = `env.ANTHROPIC_API_KEY` non vide et `!isBedrockAuth(effectiveEnv)` ; sinon rien de nouveau.
2. Essai 1 avec `env`. S'il échoue (code non nul ou `is_error`) et `classifyClaudeApiKeyFailure(...)` n'est pas nul :
   journal (texte exact ci-dessous), `marquerCreditsEpuises(empreinte, new Date(), delaiReessaiCreditsHeures())`,
   puis essai 2 avec `envSansCle` (copie d'`env` sans `ANTHROPIC_API_KEY`) et la session
   `initial.parsedStream.sessionId ?? sessionId ?? null`.
3. Le résultat de l'essai 2 passe dans la logique existante session inconnue / empoisonnée (`:1348-1395`), qui doit
   relancer avec `envSansCle` si la bascule a eu lieu (variable `let attemptEnv`).
4. Résultat final : `resultJson.atelierBascule = { de: <billingType de l'essai 1>, vers: "subscription", raison,
   empreinteCle, essaiApiApres: <T ISO> }`.
5. Reçu de l'essai 1 : si le CLI ne rapporte aucun coût, `costUsd: 0` (jamais `null`) pour un essai `credits` ou `api`
   terminé en échec de clé (spec 7.2 point 4).

Textes de journal exacts (`onLog("stdout", …)`) :
- crédits, facturation, plafond : `[paperclip] Crédits API épuisés (<raison> : « <texte relevé> »). Relance immédiate sur l'abonnement ; nouvel essai de l'API après <ISO>.\n`
- clé refusée (décision 2 de l'opérateur) : `[paperclip] ALERTE clé d'API refusée (401). Relance immédiate sur l'abonnement ; refaire « bootstrap-organisation.py cle-api » ou la retirer par « cle-api --retirer ». Nouvel essai de l'API après <ISO>.\n`

Choix du plan, à confirmer par l'opérateur au rendu : une clé refusée pose aussi la mémoire (6 h), pour ne pas refaire un appel
refusé à chaque exécution ; l'alerte reparaît donc au plus toutes les 6 heures par clé.

- [ ] Étape 1 : tests qui échouent (spec 10, tests 1, 2, 3 revu, 8, 10) :
  - `credits exhausted (billing_error): two launches, second without ANTHROPIC_API_KEY but with CLAUDE_CODE_OAUTH_TOKEN, succeeded, billingType credits then subscription, one log line`
  - `raw API "Your credit balance is too low…" triggers the same fallback`
  - `401 on the key: falls back to the subscription with the "ALERTE clé d'API refusée" log, never claude_auth_required`
  - `exhaustion mid-run resumes the session returned by the failed attempt and emits no unpriced receipt` (captures : `resumed === true` au second lancement ; chaque reçu `onUsage` de l'essai 1 a `typeof costUsd === "number"`)
  - `subscription quota failure during the fallback: no third launch` (`PAPERCLIP_TEST_SUB_QUOTA=1`, 2 lancements, `errorFamily` `provider_quota`)
  - `atelierBascule in resultJson carries de, vers, raison, empreinteCle (8 hex) and essaiApiApres, never the key` (`JSON.stringify(result)` ne contient pas `sk-ant-test-cle`)
- [ ] Étape 2 : lancer le fichier. Attendu : ces 6 tests en échec (1 lancement au lieu de 2), les 4 de A4 verts.
- [ ] Étape 3 : code minimal.
- [ ] Étape 4 : relancer. Attendu : 10 réussis. Non-régression `claude-local-execute.test.ts` : vert.

### Tâche A6 : mémoire, plafond d'instance, garde de l'hôte, non-déclencheurs (25 min)

**Fichiers :** `…/execute.ts` (avant l'essai 1, et après un essai 1 réussi) ; le fichier de test de A4.

À coder (spec 4.1, étapes 1, 2 et 6) :
- garde : `cleAgent` présent et `process.env.ANTHROPIC_API_KEY` non vide → retour immédiat, sans lancement,
  `errorCode: "claude_cle_api_hote"`, message en français (« la clé d'API est dans l'environnement du serveur : la
  bascule vers l'abonnement est impossible ; retirez-la de l'environnement de l'instance ») ;
- départ direct sans clé si `lireCreditsEpuises(empreinte) > maintenant` (journal « Crédits API marqués épuisés
  jusqu'à <ISO> : exécution sur l'abonnement. ») ou si `context.paperclipClaudeCreditsPlafond.atteint === true`
  (journal « Plafond des crédits API de l'instance atteint (<x> / <y> centimes) : exécution sur l'abonnement. ») ;
  `atelierBascule.raison` : `memoire` ou `plafond_instance` ;
- après un essai 1 réussi avec clé alors qu'une entrée échue existait : `effacerCreditsEpuises`, journal
  `[paperclip] Crédits API de nouveau utilisés (empreinte <e>).\n`.

- [ ] Étape 1 : tests qui échouent (spec 10, tests 4, 5, 6, 9, 12 côté adaptateur) :
  - `529 overloaded on the key: one launch, existing transient handling, no fallback`
  - `429 rate limit with retry-after on the key: one launch, retryNotBefore set, no fallback`
  - `second run inside the memory window: one launch, directly without the key`
  - `memory expired (marquerCreditsEpuises seeded 7 h in the past) and the key works: one launch with the key, billingType credits, memory cleared, return logged`
  - `ANTHROPIC_API_KEY in the server process.env: no launch, errorCode claude_cle_api_hote`
  - `context.paperclipClaudeCreditsPlafond.atteint: one launch without the key, plafond log line`
- [ ] Étape 2 : lancer. Attendu : les tests 5, 6, 9 et 12 en échec ; 4 (529, 429) peut déjà passer (aucune bascule
  n'est codée pour eux) : le noter.
- [ ] Étape 3 : code minimal.
- [ ] Étape 4 : relancer le fichier (attendu : 16 réussis), puis la non-régression complète de l'adaptateur (bloc
  « Non-régression » des commandes) et `pnpm --filter @paperclipai/adapter-claude-local typecheck` : 0 erreur.
- [ ] Étape 5 : `quota.ts:575` (hors périmètre, spec 12) : lire seulement, noter dans le rapport si l'interrogation des
  quotas se dit impossible pour un agent à clé ; ne rien corriger.

### Tâche A7 : commit unique et patch 0097 (10 min)

- [ ] Étape 1 : `git -C $P status --short` ne montre que les fichiers du lot A (plus, éventuellement, ceux du lot B
  non commités : ne pas les inclure).
- [ ] Étape 2 : procédure « patch numéroté » ci-dessus avec `--start-number 97`, message
  `feat(claude-local): crédits API d'abord, bascule sur l'abonnement`, corps : cause et raison (spec 4.1, décision 2).
- [ ] Étape 3 : commit dans l'usine de `socle/patches/0097-*.patch` seul :
  `git commit -q -o -m "feat(socle): patch 0097, crédits API avant l'abonnement (adaptateur claude-local)" -- socle/patches/0097-*.patch`.

---

## Lot B : budgets (patch 0098)

### Tâche B1 : fenêtre du cycle des crédits (15 min)

**Fichiers :** `paperclip/server/src/services/budgets.ts` (nouvelles fonctions exportées après `computeObservedSpend`,
`:220-222`) ; créer `paperclip/server/src/__tests__/budgets-credits.test.ts`.

```ts
export function fenetreCycleCredits(maintenant: Date, jourDebut: number): { start: Date; end: Date }; // minuit UTC
```

Un `jourDebut` absent du mois (29 à 31) se ramène au dernier jour du mois.

- [ ] Étape 1 : tests (bloc `describe` sans base) :
  - `fenetreCycleCredits: 2026-10-27 → 2026-10-12T00:00Z .. 2026-11-12T00:00Z`
  - `fenetreCycleCredits: 2026-11-05 → 2026-10-12 .. 2026-11-12`
  - `fenetreCycleCredits: exactly 2026-11-12T00:00Z starts the new cycle`
  - `fenetreCycleCredits: day 31 in February ends on the last day`
- [ ] Étape 2 : `cd $P/server && flock $L pnpm exec vitest run src/__tests__/budgets-credits.test.ts`. Attendu : échec, export absent.
- [ ] Étape 3 : code minimal. Étape 4 : relancer, 4 réussis.

### Tâche B2 : les crédits sortent des totaux de budget (20 min)

**Fichiers :** `budgets.ts:202` (colonne `total${index}`) ; le fichier de test.

Changement : la somme ne compte que `billing_type <> 'credits'` ; la colonne `unpriced${index}` (`:203`) est inchangée.

- [ ] Étape 1 : tests sur PostgreSQL embarqué (amorçage recopié de `budgets-service.test.ts:1-115` : `startEmbeddedPostgresTestDatabase`, entreprise, agent, politique d'entreprise `billed_cents`) :
  - `a credits event is excluded from a company policy total; a metered_api event is included` (5000 `credits` + 300 `metered_api` → `computeObservedSpend(...).total === 300`)
  - `same exclusion for agent and project policies`
  - `an unpriced credits event still counts in unpricedEventCount` (spec 7.2 point 4)
  - `a 2.00 USD credits receipt is stored as 200 cost_cents` (lève le « non vérifié » de la spec 7.1 sur l'unité ; si l'amorçage par reçu est trop lourd, insérer par le service de coûts utilisé dans `budgets-service.test.ts` et le noter)
- [ ] Étape 2 : lancer. Attendu : le premier et le deuxième en échec (5300 au lieu de 300).
- [ ] Étape 3 : code minimal. Étape 4 : relancer avec `budgets-service.test.ts` ; attendu : tout réussi, « skipped 0 ».

### Tâche B3 : plafond d'instance et contexte de l'exécution (25 min)

**Fichiers :** `budgets.ts` ; `paperclip/server/src/services/heartbeat/runtime-execution.ts` (dans
`executeHeartbeatRuntime`, `:223`, après `adapterContext.paperclipManagedMcp` `:787`, avant `const guardedDispatch`
`:789`) ; le fichier de test.

```ts
export async function depenseCreditsInstance(db: Db, fenetre: { start: Date; end: Date }): Promise<number>; // centimes, toutes entreprises
export async function plafondCreditsClaude(db: Db, maintenant?: Date, env?: NodeJS.ProcessEnv):
  Promise<{ atteint: boolean; depenseCentimes: number; plafondCentimes: number }>;
// PAPERCLIP_CLAUDE_CREDITS_PLAFOND_CENTIMES (20000), PAPERCLIP_CLAUDE_CREDITS_JOUR_CYCLE (12) ; atteint = dépense >= plafond
```

Câblage (3 lignes) : si `agent.adapterType === "claude_local"`, `plafondCreditsClaude(db)` ; si `atteint`,
`adapterContext.paperclipClaudeCreditsPlafond = résultat`.

- [ ] Étape 1 : tests :
  - `depenseCreditsInstance sums credits events of all companies inside the cycle only` (deux entreprises, un événement hors fenêtre, un `metered_api` ignoré)
  - `plafondCreditsClaude: atteint at 20000 cents by default, not at 19999`
  - `plafondCreditsClaude honours PAPERCLIP_CLAUDE_CREDITS_PLAFOND_CENTIMES and PAPERCLIP_CLAUDE_CREDITS_JOUR_CYCLE`
- [ ] Étape 2 : lancer. Attendu : échec, exports absents.
- [ ] Étape 3 : code minimal, câblage dans `runtime-execution.ts`.
- [ ] Étape 4 : relancer (attendu : tous réussis), puis `pnpm --filter @paperclipai/server typecheck` : 0 erreur.
  Le câblage n'a pas de test isolé (un test du cycle complet du heartbeat serait une suite lourde) : il est couvert par
  le typage, par A6 (contexte → départ sans clé) et par le test 12 de la suite complète à la fin (V).

### Tâche B4 : commit unique et patch 0098 (10 min)

- [ ] Procédure « patch numéroté » avec `--start-number 98`, message `feat(budgets): crédits API hors plafonds, plafond d'instance par cycle`.
- [ ] Commit dans l'usine de `socle/patches/0098-*.patch` seul :
  `git commit -q -o -m "feat(socle): patch 0098, crédits API hors budgets et plafond d'instance" -- socle/patches/0098-*.patch`.

---

## Lot C : commande `cle-api` de l'usine

Modèle : `scripts/bootstrap-organisation.py:2604-2700` (`lire_jeton`, `ranger_secret_jeton`,
`lier_jeton_agents_locaux`, `cmd_jeton_client`, `cmd_jeton`) et le test `scripts/tests/tester-jeton-client.py`
(`ApiFausse`, `:35-68` ; `setUp`, `:70-80`). Les tests de l'usine vivent dans `scripts/tests/`, pas dans `tests/`
(la spec dit `tests/` : écart de chemin seulement).

### Tâche C1 : la liaison voulue porte la clé (25 min)

**Fichiers :** `scripts/bootstrap-organisation.py` (constantes `:185-186` ; `env_voulu` `:1097-1103` ;
`liaison_voulue` `:1106-1121` ; `secret_jeton` `:1124-1128` ; `etat_a_jour` `:1288` ; `lier_agents` `:1598` ; calcul de
`jeton_id` à `:2080-2081`, `:4125-4126`, `:4524-4525` ; `cmd_jeton` `:2695` ; `etat_service_a_jour` autour de `:4083`) ;
créer `scripts/tests/tester-cle-api.py`.

**Interfaces :**

```python
CLE_SECRET_CLE_API = "anthropic-cle-api-credits"
VARIABLE_CLE_API = "ANTHROPIC_API_KEY"
VARIABLE_MODE_CLE = "PAPERCLIP_CLAUDE_CLE_API"
VALEUR_MODE_CLE = "credits_inclus"
def secret_jeton(api, company_id, cle: str = CLE_SECRET_JETON): ...
def env_voulu(company_id, reg_agents, slug, jeton_id, cle_id: str | None = None) -> dict: ...
def liaison_voulue(company_id, reg_agents, slug, jeton_id, mode, cle_id: str | None = None) -> dict: ...
def etat_a_jour(api, company_id, reg_agents, empreinte, jeton_id, mode, cle_id: str | None = None) -> list[str]: ...
def etat_service_a_jour(..., jeton_id, mode, cle_id: str | None = None) -> list[str]: ...
def lier_agents(api, company_id, reg_agents, empreinte, jeton_id, mode="reel", cle_id: str | None = None) -> int: ...
```

Tous les appelants (les 3 sites qui calculent `jeton_id` et `cmd_jeton`) lisent aussi
`secret_jeton(api, cid, CLE_SECRET_CLE_API)` et passent `cle_id` : sans cela, `appliquer` et `mettre-a-jour-client`
effacent la clé (`liaison_conforme` compare l'ensemble des clés de `env`, `:1148`). Vérifier par
`grep -n "liaison_voulue(\|lier_agents(\|etat_a_jour(\|etat_service_a_jour(" scripts/bootstrap-organisation.py` qu'aucun
appel n'est oublié (le site `:1276` passe `None` pour comparer les agents déterministes : il reste tel quel).

- [ ] Étape 1 : tests (spec 10, tests 13 et 15) :
  - `test_env_voulu_avec_cle_ajoute_secret_ref_et_mode_plain`
  - `test_env_voulu_sans_cle_identique_a_avant` (égalité stricte avec l'appel à quatre arguments)
  - `test_agent_deterministe_jamais_de_cle` (`liaison_voulue(..., cle_id="s")` d'un agent `deterministe` : adaptateur `process`, aucun `env`)
  - `test_liaison_avec_cle_conforme_apres_appliquer` (`liaison_conforme` vrai pour un agent lié avec la clé ; faux si la liaison voulue l'oublie)
  - `test_appelants_lisent_le_secret_de_cle` (fausse API qui a les deux secrets : `lier_agents` écrit les deux variables)
- [ ] Étape 2 : `python3 -I scripts/tests/tester-cle-api.py`. Attendu : erreurs (`AttributeError` / `TypeError` sur `cle_id`).
- [ ] Étape 3 : code minimal. Étape 4 : relancer (5 réussis) puis `tester-jeton-client.py`,
  `tester-mettre-a-jour-client.py`, `tester-competences-communes.py` : verts.
- [ ] Étape 5 : `git add scripts/bootstrap-organisation.py scripts/tests/tester-cle-api.py && git commit -q -o -m "feat(usine): la liaison des agents claude_local porte la clé d'API" -- scripts/bootstrap-organisation.py scripts/tests/tester-cle-api.py`

### Tâche C2 : ranger, lier, retirer (25 min)

**Fichiers :** `scripts/bootstrap-organisation.py` (près de `:2604-2650`) ; `scripts/tests/tester-cle-api.py`.

```python
def lire_jeton(invite: str = "Jeton (non affiché) : ") -> str: ...
def ranger_secret_jeton(api, cid, valeur, cle: str = CLE_SECRET_JETON,
                        nom: str = "Jeton Claude Code (claude setup-token)",
                        description: str = "Jeton OAuth longue durée de l'abonnement de l'opérateur. Usage personnel uniquement.") -> tuple[str, bool]: ...
def lier_cle_api_agents_locaux(api, cid: str, secret_id: str | None) -> int: ...
# secret_id None = retrait des deux variables. Seuls les agents adapterType == "claude_local" non résiliés ;
# reste de adapterConfig conservé ; ni pause ni reprise ; agents déjà conformes laissés (comparaison type, secretId, version).
```

Secret : nom « Clé d'API Claude (crédits inclus de l'abonnement) », description « Clé de l'organisation Console liée
à l'abonnement de l'opérateur ; crédits API mensuels inclus. ». Suppression : `DELETE /secrets/{id}` (route du socle
`paperclip/server/src/routes/secrets.ts:1106`).

- [ ] Étape 1 : tests (spec 10, tests 14 et 16) :
  - `test_lie_seulement_les_claude_local_non_resilies` (un `process`, un `terminated`, deux `claude_local` → 2 modifiés)
  - `test_variables_posees_secret_ref_et_plain_credits_inclus`
  - `test_deuxieme_passage_sans_ecriture`
  - `test_retrait_enleve_les_deux_variables_et_garde_le_jeton_et_l_etat` (`CLAUDE_CODE_OAUTH_TOKEN` et `status` inchangés)
  - `test_ranger_cree_puis_renouvelle_sous_la_cle_anthropic_cle_api_credits`
- [ ] Étape 2 : lancer. Attendu : échec, fonction absente. Étape 3 : code minimal. Étape 4 : relancer, verts.
- [ ] Étape 5 : commit des deux fichiers (`-o`), message `feat(usine): rangement et liaison de la clé d'API`.

### Tâche C3 : la commande et son parseur (25 min)

**Fichiers :** `scripts/bootstrap-organisation.py` (nouvelle `cmd_cle_api` après `cmd_jeton`, `:2675-2697` ;
sous-commande à côté de `jeton`, `:5235-5238` ; table des commandes `:5264`) ; `scripts/tests/tester-cle-api.py`.

```
bootstrap-organisation.py cle-api --confirmer [--client <slug>] [--service <s>]
bootstrap-organisation.py cle-api --retirer --confirmer [--client <slug>] [--service <s>] [--supprimer-secret]
```

```python
def cmd_cle_api(args) -> int: ...
```

Comportement : sans `--confirmer` → `ErreurAtelier` ; `--service` sans `--client` → refus (comme `cmd_jeton`) ;
`--supprimer-secret` sans `--retirer` → refus ; avec `--client` : chaque entreprise du registre du client (ou le seul
service demandé), sinon l'entreprise de l'organisation modèle (`trouver_entreprise`). Ajout : `lire_jeton("Clé d'API (non affichée) : ")`,
`ranger_secret_jeton(..., cle=CLE_SECRET_CLE_API, …)`, `lier_cle_api_agents_locaux`, `del valeur`. Retrait : aucune
lecture de clé. Sortie par entreprise : `[service] secret créé|renouvelé, lié à n agent(s).` / `retirée de n agent(s)`.

- [ ] Étape 1 : tests :
  - `test_refus_sans_confirmer`, `test_refus_service_sans_client`, `test_refus_supprimer_secret_sans_retirer`
  - `test_client_toutes_les_entreprises_et_valeur_jamais_affichee` (clé lue sur une fausse entrée standard ; `contextlib.redirect_stdout` et `redirect_stderr` : la valeur n'apparaît dans aucune sortie ni dans `ApiFausse.journal` hors du corps du `POST /secrets`)
  - `test_service_seul`
  - `test_retirer_puis_supprimer_secret` (un `DELETE /secrets/{id}` par entreprise)
  - `test_retirer_ne_lit_pas_la_cle` (`lire_jeton` remplacé par une fonction qui lève)
- [ ] Étape 2 : lancer. Attendu : échec (`cle-api` inconnue). Étape 3 : code minimal. Étape 4 : relancer, verts ;
  `python3 -I scripts/bootstrap-organisation.py cle-api --help` affiche les options (aucun appel réseau).
- [ ] Étape 5 : commit des deux fichiers (`-o`), message `feat(usine): commande cle-api (crédits API avant l'abonnement)`.

---

## Tâche V : vérification finale (après A, B et C ; 25 min ; aucun fichier modifié)

- [ ] 1. Diff : `git -C $P log --oneline v2026.1023.0..HEAD | head -3` (deux commits nouveaux, 98 au total) ;
  `git -C $P status --short` vide ; `git status --short` de l'usine sans autre fichier que les trois non suivis connus
  (`docs/mode-authentifie.md`, `scripts/passer-en-mode-authentifie.*`, à ne pas lire). Recherche de restes :
  `git -C $P diff HEAD~2 HEAD | grep -n -E "console\.log|DEBUG-|sk-ant"` : rien (hors la clé factice
  `sk-ant-test-cle` des tests et `sk-ant-api03-cle-factice` éventuelle de la fixture).
- [ ] 2. Rejeu des patches dans un clone jetable (pas de worktree) :
  ```bash
  S=<brouillon de session>; git clone -q "$P" "$S/rejeu" && cd "$S/rejeu" \
    && git checkout -q -b essai v2026.1023.0 && git am -q --3way ~/Projets/atelier-marketing-ia/socle/patches/*.patch \
    && git rev-parse 'HEAD^{tree}'; git -C "$P" rev-parse 'HEAD^{tree}'
  ```
  Attendu : les deux empreintes d'arbre identiques. Puis `rm -rf "$S/rejeu"`.
- [ ] 3. Suites ciblées, une à la fois sous le verrou (bloc « Commandes des suites ciblées », toutes les lignes).
  Attendu : 0 échec, « skipped 0 » pour les fichiers de budgets, nombres recopiés dans le rapport.
- [ ] 4. Typage : adaptateur et serveur, 0 erreur. `npx tsc --noEmit` dans `plugin-atelier` : sans objet (non touché) ;
  le dire.
- [ ] 5. Usine : `python3 -I scripts/tests/tester-cle-api.py`, `tester-jeton-client.py`, `tester-mettre-a-jour-client.py`,
  `tester-competences-communes.py` : tous verts.
- [ ] 6. Tests affaiblis : `python3 ~/.claude/skills/verification/scripts/tests-affaiblis.py --depot ~/Projets/atelier-marketing-ia`
  et lecture du diff des tests du socle (aucun test amont modifié).
- [ ] 7. Rapport : RÉUSSI / ÉCHEC / NON VÉRIFIABLE au format du skill `verification`. La suite complète du socle
  (`pnpm test`) demandée par la spec (section 10, dernière ligne) n'est pas lancée ici : à décider par la session,
  une seule fois, quand aucune autre suite lourde ne tourne.

Aucun déploiement sur 3100 : il attend JB, après les vérifications Console de la spec (section 8 et « Reste à
vérifier par l'opérateur » : recharge automatique coupée, solde acheté à 0, Mastercard enregistrée sur claude.ai).

## Points non vérifiés à la rédaction du plan

- Textes du CLI pour le plafond de dépense (400), le plafond du palier (429 sans `retry-after`), le 401 sur clé, et
  emplacement du champ `error: "billing_error"` : relevés en A1 ; s'ils sont introuvables, ces cas ne basculent pas.
- Forme exacte du reçu d'usage d'un essai échoué sans jetons (`createUsageCheckpointLog` ne publie rien sans coût ni
  jeton tant que le reçu n'est pas complet, `packages/adapter-utils/src/usage-checkpoint.ts:89-96`) : tranché par le
  test « no unpriced receipt » de A5.
- Deux essais dans une même exécution donnent deux reçus distincts : probable (un `attemptId` par
  `createUsageCheckpointLog`, `usage-checkpoint.ts:73`, et cumul de plusieurs parties dans `usage-receipts.ts:262-270`),
  non prouvé par un test du serveur dans ce plan.
- Unité des centimes (dollar) : tranchée par le test B2.
- Présence de `ANTHROPIC_API_KEY` dans l'environnement de l'instance 3100 : non vérifiée (instance non touchée) ; la
  garde `claude_cle_api_hote` la rendrait visible dès la première exécution à clé.

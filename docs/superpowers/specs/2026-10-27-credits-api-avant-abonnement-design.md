# Crédits API de Claude avant l'abonnement : spécification

Date : 27/10/2026. Statut : spécification, aucun code écrit. Socle : Paperclip v2026.1023.0 + 96 patches
(`socle/patches/0001` à `0096`).

## 1. Décision de l'opérateur (recopiée telle quelle)

> « l'usine dans son ensemble peut utiliser les cadeaux API de Claude avant d'utiliser l'abonnement »

Bascule AUTOMATIQUE : aucune action de l'opérateur à chaque épuisement ni à chaque renouvellement.

## 2. Faits vérifiés

### 2.1 Les crédits (source officielle)

Source : https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers (lue le 27/10/2026).

- Montant mensuel : 100 $ (Max 5x), 200 $ (Max 20x). Montants en dollars US, pas en euros.
- Couvert : « Claude API, Claude Managed Agents, the Claude Agent SDK, and playground ». Non couvert :
  « Claude Code ». L'article d'aide https://support.claude.com/en/articles/15036540 précise que les crédits
  couvrent « the Agent SDK and `claude -p` when used with an API key from a linked Console organization » ;
  connecté par l'abonnement, `claude -p` consomme toujours les limites de l'abonnement.
- Une offre est liée à UNE organisation Console ; « Every API key and workspace in the linked organization
  draws from the same balance ».
- Renouvellement : « each billing cycle », « shortly after your plan payment is processed ». Expiration à la
  fin du cycle, « with no rollover ». La date du cycle n'est pas exposée au code (non vérifié qu'une API la
  donne).
- « You don't need to add a payment method to Claude Platform. »
- Ordre : « Included credits are spent first, then any credits you've purchased. Auto-reload is based only on
  your purchased balance. »
- Épuisement sans autre solde : « API requests stop until your next monthly API credits arrive. Usage is never
  charged to your Claude plan. »
- Message renvoyé à l'épuisement, texte exact :
  `Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.`
- Plafonds de dépense : « Usage paid with credits counts toward your organization's monthly spend cap. Spend caps
  reset on the first of each calendar month, whereas credits refresh on your billing cycle. »

### 2.2 Codes d'erreur de l'API

Source : https://platform.claude.com/docs/en/api/errors (lue le 27/10/2026).

| Code | Type | Sens officiel (extrait) |
| --- | --- | --- |
| 400 | `invalid_request_error` | requête invalide ; « also returns a 400 when usage reaches an organization or workspace spend limit you set » |
| 401 | `authentication_error` | clé « malformed, revoked, or expired » |
| 402 | `billing_error` | « issue with your billing or payment information » |
| 429 | `rate_limit_error` | limite de débit, OU plafond mensuel du palier (« has no `retry-after` header and keeps failing until access resumes ») |
| 529 | `overloaded_error` | surcharge générale de l'API |

Le code HTTP du message « credit balance is too low » n'est pas écrit dans la doc. Le CLI 2.1.308 le teste
comme une réponse 400 (probable, déduit du binaire ci-dessous, non confirmé par une doc).

### 2.3 Ce que fait le CLI `claude` 2.1.308 (binaire `~/.local/share/claude/versions/2.1.308`)

Relevé par recherche de chaînes dans le binaire, le 27/10/2026 :

- il reconnaît le message brut par l'expression
  `/^Your credit balance is too low to access the Anthropic API\. Please go to Plans & Billing to upgrade or purchase credits\.$/`,
  à côté d'un test `e.status===400` ;
- il le convertit en message affiché `var UBn="Credit balance is too low"` et produit
  `Ws({content:UBn,error:"billing_error"})` : le message d'erreur de l'assistant porte le champ
  `error: "billing_error"` ;
- sa télémétrie le classe `"credit_balance_low"` ;
- `billing_error` fait partie de l'énumération publique des erreurs de message de l'assistant
  (`["authentication_failed", …, "billing_error", "rate_limit", "overloaded", "invalid_request", …]`).

La doc de Claude Code liste l'erreur `Credit balance is too low` (https://code.claude.com/docs/en/errors, rubrique
« Usage limits »), et la page des crédits cite la variante `Credit balance too low · Add funds: https://platform.claude.com/settings/billing`.

### 2.4 Priorité des identifiants

Source : https://code.claude.com/docs/en/authentication, « Authentication precedence » : `ANTHROPIC_API_KEY`
est au rang 3, `CLAUDE_CODE_OAUTH_TOKEN` au rang 5 ; « In non-interactive mode (`-p`), the key is always used
when present. » Conséquence : si les deux variables sont présentes, l'exécution passe par l'API ; si on retire
seulement `ANTHROPIC_API_KEY`, la même exécution repart sur le jeton de l'abonnement. Le socle dit la même chose :
`paperclip/packages/adapters/claude-local/src/server/test.ts:208-217` et `acp.ts:841-847`.

### 2.5 Le code actuel

Usine :
- les agents `claude_local` reçoivent `CLAUDE_CODE_OAUTH_TOKEN` en `secret_ref` :
  `scripts/bootstrap-organisation.py:186` (`VARIABLE_JETON`), `:1097-1104` (`env_voulu`) ;
- lecture du jeton sur l'entrée standard ou en saisie masquée, jamais affiché : `lire_jeton`, `:2604-2609` ;
  secret par entreprise : `ranger_secret_jeton`, `:2612-2624` (`POST /companies/{cid}/secrets`) ; liaison aux
  seuls agents `claude_local` non résiliés : `lier_jeton_agents_locaux`, `:2627-2650` (filtre `:2636`) ; pour
  tous les services d'un client : `cmd_jeton_client`, `:2653-2672` ;
- moteur imposé : `cli` (`:374-375`, l'ACP est refusé par le confinement), réseau limité à
  `api.anthropic.com` (`:369`), le même hôte que l'API à clé ;
- agents déterministes : adaptateur `process`, sans modèle (`:413-427`, `:1114-1116`) ;
- budget d'une entreprise : `budget_service`, `:3995-4004` (fiche, sinon somme des budgets des agents).

Socle :
- le processus `claude` d'une exécution est lancé par `runAttempt` dans
  `paperclip/packages/adapters/claude-local/src/server/execute.ts:907`, via
  `runAdapterExecutionTargetProcess(…, { env, … })` (`:982`) ;
- `billingType` est calculé UNE fois par exécution : `resolveClaudeBillingType`, `execute.ts:171-174`
  (`"api"` si `ANTHROPIC_API_KEY` est non vide, sinon `"subscription"`), appelé à `:500`, puis repris dans les
  reçus d'usage (`:979`) et dans le résultat (`:1040`, `:1110`, `:1289`) ;
- il existe déjà une relance dans la même exécution : session inconnue ou empoisonnée, `execute.ts:1347-1395`
  (`runAttempt(null)` puis `toAdapterResult(retry, …)`) ;
- détection actuelle des quotas : `isClaudeProviderQuotaError`, `parse.ts:582-602`, expressions
  `CLAUDE_PROVIDER_QUOTA_RE` et `CLAUDE_TRANSIENT_UPSTREAM_RE`, `parse.ts:23-26`. Aucune des deux ne reconnaît
  « credit balance » : aujourd'hui un épuisement des crédits serait un échec ordinaire ;
- le processus enfant hérite de l'environnement du serveur :
  `paperclip/packages/adapter-utils/src/server-utils.ts:4719-4721`
  (`{ ...sanitizeInheritedPaperclipEnv(process.env), ...opts.env }`) ;
- conversion vers le grand livre : `"api"` devient `metered_api`, `"subscription"` devient
  `subscription_included`, les autres types passent tels quels :
  `paperclip/server/src/services/usage-receipts.ts:75` ; coût nul pour l'abonnement : `:267-268` ;
- le type `credits` existe déjà : `paperclip/packages/shared/src/constants.ts:826-833`,
  `paperclip/packages/adapter-utils/src/types.ts:62-70` ;
- budgets : la somme `cost_cents` de la fenêtre (`paperclip/server/src/services/budgets.ts:202`) ne tient pas
  compte du type de facturation ; les événements non tarifés comptent sauf `subscription_included` (`:203`) ;
  arrêt bloquant : `observedBlocks`, `:224-227` (montant atteint, exécution en attente de comptage, ou événement
  non tarifé si la politique n'est pas `allow`) ;
- appel de l'adaptateur par le serveur : `paperclip/server/src/services/heartbeat/runtime-execution.ts:793`.

## 3. Approches comparées

### (a) Relance dans la même exécution (RECOMMANDÉE)

Chaque exécution d'un agent `claude_local` qui a une clé essaie d'abord l'API. Si Claude répond « crédit
épuisé », la MÊME exécution est relancée aussitôt sans `ANTHROPIC_API_KEY`, donc sur l'abonnement. Une mémoire
« épuisé jusqu'à » évite de refaire un appel voué à l'échec ; à son échéance, l'API est essayée de nouveau, ce qui
fait revenir l'usine sur les crédits du mois suivant sans intervention.

### (b) Tâche du plugin qui retire la clé de tous les agents

Une tâche planifiée du plugin surveille les exécutions échouées, retire la clé de tous les agents à la première
erreur de crédit, et la remet au début du cycle suivant.

| Critère | (a) | (b) |
| --- | --- | --- |
| Exécution qui tombe sur l'épuisement | réussie, sur l'abonnement | perdue, à relancer |
| Délai de bascule | immédiat | jusqu'au passage de la tâche |
| Retour aux crédits | seul, à l'échéance de la mémoire | dépend d'une date que le code ne connaît pas |
| Écritures | aucune sur les agents | `PATCH` de chaque agent de 29 entreprises, deux fois par mois, au risque de heurter les gardes de configuration du plugin |
| Patch du socle | oui | non |

(b) évite un patch du socle mais perd des exécutions et réécrit la configuration de centaines d'agents. (a) suit un
mécanisme que l'adaptateur possède déjà (`execute.ts:1347-1395`). Recommandation : (a).

## 4. Conception retenue

Trois morceaux : deux patches du socle, une commande de l'usine.

- `socle/patches/0097-…` : la bascule dans l'adaptateur `claude-local` (voie CLI seulement, la seule employée
  par l'usine ; l'ACP n'est pas touché).
- `socle/patches/0098-…` : le traitement des crédits dans les budgets du serveur (section 7).
- Usine : rangement et liaison de la clé (section 5), tests (section 10).

### 4.1 Déroulé d'une exécution (patch 0097)

1. `envApi` = l'environnement actuel. Si `ANTHROPIC_API_KEY` est absent ou vide, ou si Bedrock est actif
   (`isBedrockAuth`), rien ne change : comportement actuel, octet pour octet.
2. Si la mémoire dit « épuisé jusqu'à T » et que maintenant < T, ou si le contexte d'exécution signale le plafond
   de crédits d'instance atteint (section 7.2) : la clé est retirée avant le premier essai (pas d'appel voué à
   l'échec).
3. Sinon, premier essai avec la clé. `billingType` vaut `credits` (et non plus `api`) quand la variable simple
   `PAPERCLIP_CLAUDE_CLE_API=credits_inclus` accompagne la clé ; sans cette variable, `api` comme aujourd'hui (une
   clé payante reste comptée dans les budgets).
4. Si l'essai se termine en « crédit épuisé » (section 6) : l'adaptateur écrit le journal (section 9), met la
   mémoire à jour, puis relance `runAttempt` avec un environnement SANS `ANTHROPIC_API_KEY` et
   `billingType = "subscription"`, recalculé pour cet essai (`resolveClaudeBillingType` appelé par essai et non plus
   une seule fois à `:500`). Session reprise : celle que l'essai échoué a rendue s'il en a ouvert une, sinon celle
   d'origine.
5. Le résultat de la relance passe ensuite par la logique existante de session inconnue ou empoisonnée
   (`:1348-1395`), inchangée.
6. Après un premier essai API réussi alors que la mémoire était échue, la mémoire est effacée et le retour est
   journalisé.

Retrait de la clé : l'environnement enfant reprend celui du serveur (`server-utils.ts:4719-4721`). Supprimer la
clé de `opts.env` ne suffit donc que si le serveur ne l'a pas dans son propre environnement. Le patch vérifie au
démarrage de l'exécution : si `process.env.ANTHROPIC_API_KEY` est non vide, la bascule est refusée et l'exécution
échoue avec un message clair (code `claude_cle_api_hote`), au lieu de croire basculer en restant sur l'API. Un test
contrôle l'environnement réellement transmis au processus. Présence de la variable dans l'environnement de
l'instance 3100 : non vérifié (instance non touchée).

### 4.2 Mémoire « épuisé jusqu'à »

- En mémoire du processus serveur, dans le module de l'adaptateur : une table empreinte de la clé → instant T.
  Empreinte = 8 premiers caractères hexadécimaux du SHA-256 de la clé ; la clé elle-même n'est jamais conservée,
  journalisée ni comparée en clair.
- Partagée par toutes les entreprises de l'instance : elles ont la même clé (même organisation Console), donc le
  même solde.
- T = maintenant + 6 heures (variable d'instance `PAPERCLIP_CLAUDE_CREDITS_REESSAI_HEURES`, défaut 6). La date du
  cycle n'étant pas connue du code, un nouvel essai toutes les 6 heures coûte au plus 4 requêtes refusées par jour.
  Elles ne sont pas facturées : solde nul. Le retour à l'API au mois suivant se fait donc au plus 6 heures après
  l'arrivée des crédits.
- Pas de persistance : après un redémarrage du serveur, une seule exécution refait l'essai, échoue en quelques
  secondes et rétablit la mémoire. Plusieurs exécutions lancées en même temps peuvent chacune échouer une fois
  avant que la mémoire soit posée, ce qui est sans conséquence.

## 5. La clé : rangement et remise par l'opérateur

- Une seule clé pour toute l'usine : les crédits sont liés à une seule organisation Console (2.1). Elle est créée
  par l'opérateur dans l'organisation liée, de préférence dans un espace de travail dédié « Atelier » (section 8).
- Les secrets Paperclip appartiennent à une entreprise (`POST /companies/{cid}/secrets`, `:2617`). La même clé est
  donc rangée comme secret dans chaque entreprise du client, sous une clé de secret distincte de celle du jeton
  (par exemple `CLE_SECRET_API = "anthropic-cle-api-credits"`), exactement comme `cmd_jeton_client` le fait pour le
  jeton.
- Rejeté : mettre la clé dans l'environnement du serveur. Elle serait héritée par tous les processus enfants
  (`server-utils.ts:4720`), lue par `models.ts:70` et `quota.ts:575`, et rendrait la bascule impossible (4.1).
- Nouvelle commande, sur le modèle de `cmd_jeton` / `cmd_jeton_client` :
  `bootstrap-organisation.py cle-api --confirmer [--client <slug>] [--service <s>]`. Lecture par `lire_jeton()`
  (entrée standard non interactive, sinon saisie masquée ; jamais affichée, jamais écrite, `del valeur` après
  usage). Rangement : `ranger_secret_jeton` généralisé à une clé de secret donnée, ou fonction jumelle.
  Liaison : variante de `lier_jeton_agents_locaux` qui pose `ANTHROPIC_API_KEY` en `secret_ref` et
  `PAPERCLIP_CLAUDE_CLE_API` en `plain` avec la valeur `credits_inclus`, sur les seuls agents `adapterType ==
  "claude_local"` non résiliés.
- `env_voulu` (`:1097-1104`) reçoit l'identifiant du secret de clé, comme `jeton_id`, sinon les commandes
  `appliquer` et `mettre-a-jour-client` effaceraient la liaison à leur prochain passage. Tous les appelants de
  `env_voulu` et de `liaison_voulue` sont à mettre à jour.
- Retrait : `bootstrap-organisation.py cle-api --retirer --confirmer [--client <slug>]` retire les deux variables
  de tous les agents ; le secret est gardé (option `--supprimer-secret` pour l'effacer).

## 6. Détection : ce qui déclenche la bascule, et ce qui ne la déclenche pas

Nouvelle fonction `isClaudeApiCreditExhausted` dans `parse.ts`, testée AVANT `isClaudeProviderQuotaError` et
`isClaudeTransientUpstreamError`, et seulement quand l'essai avait la clé.

Déclenche (essai échoué, pas de connexion requise, clé présente) :
- un message d'assistant ou un résultat portant `error: "billing_error"` (2.3) ;
- OU un texte correspondant à `/credit balance (?:is )?too low/i` dans le résultat, la sortie ou les erreurs (couvre
  le message brut de l'API, « Credit balance is too low » et « Credit balance too low · Add funds ») ;
- OU un plafond de dépense de l'organisation ou de l'espace de travail atteint (400) ou le plafond mensuel du palier
  (429 sans `retry-after`, 2.2). Ces cas veulent dire, comme l'épuisement : l'API est inutilisable jusqu'au
  changement de mois. Le texte exact que le CLI affiche dans ces deux cas n'a pas été relevé (non vérifié) : il est
  à extraire du binaire au début du lot, et le test est écrit sur ce texte relevé, jamais sur une supposition.

`402 billing_error` (problème de facturation) est rangé avec l'épuisement : la cause diffère, mais la conséquence est
la même (l'API ne sert plus sans action de paiement), et basculer ne coûte rien.

Ne déclenche PAS :

| Cas | Ce qu'on fait |
| --- | --- |
| 401, clé invalide ou révoquée (`authentication_failed`, « Invalid API key ») | pas de bascule ; échec de l'exécution avec le code `claude_cle_api_invalide` et un message en français : refaire `cle-api` ou la retirer par `cle-api --retirer`. Une clé cassée est une erreur de configuration, à rendre visible. |
| 529, surcharge | pas de bascule ; le CLI réessaie déjà de lui-même, puis le traitement existant des erreurs passagères s'applique (`retryNotBefore`, `execute.ts:1219-1226`) ; la surcharge touche aussi l'abonnement, basculer n'y changerait rien. |
| 429, limite de débit (avec `retry-after`) | pas de bascule ; même traitement passager qu'aujourd'hui, sur la clé. Les crédits restent disponibles, et la limite est passagère. |
| Erreurs de quota de l'abonnement (`CLAUDE_PROVIDER_QUOTA_RE`) pendant la relance | traitement existant inchangé ; pas de retour vers l'API dans la même exécution (une seule bascule par exécution, jamais de boucle). |
| Délai dépassé, nombre de tours épuisé, session inconnue | traitement existant inchangé. |

## 7. Budgets Paperclip

### 7.1 Ce qui se passe aujourd'hui (prouvé par le code)

Une exécution avec clé est déclarée `billingType "api"`, convertie en `metered_api` (`usage-receipts.ts:75`), avec
le coût que le CLI rapporte (`costUsd`, `execute.ts:977`). Elle est donc comptée en centimes dans toutes les
politiques `billed_cents` (`budgets.ts:202`). Une exécution par l'abonnement compte 0 (`usage-receipts.ts:268`).
Sans changement, les crédits gratuits rempliraient le plafond mensuel de 195 € de l'Observatoire (et ceux des 28
autres services) ; l'arrêt bloquant mettrait alors l'entreprise en pause (`pauseScopeForBudget`, `budgets.ts:283-308`),
et l'abonnement serait bloqué lui aussi, alors que rien n'a été payé. L'unité des centimes des budgets (dollar ou
euro) n'a pas été vérifiée.

### 7.2 Règle proposée (patch 0098)

1. Les exécutions sur crédits inclus sont déclarées `billingType "credits"` (4.1, étape 3) et tarifées comme
   aujourd'hui, avec le coût que le CLI rapporte. Elles restent visibles dans les rapports de coûts.
2. Le total `billed_cents` des politiques d'entreprise, d'agent et de projet exclut `billing_type = 'credits'`
   (`budgets.ts:202`). Un plafond ne peut donc plus être rempli par des crédits qui ne coûtent rien.
3. Pour ne pas affaiblir l'arrêt bloquant, les crédits ont leur propre plafond, à l'échelle de l'instance :
   `PAPERCLIP_CLAUDE_CREDITS_PLAFOND_CENTIMES` (dollars US, par défaut le montant de l'offre de l'opérateur, question 1),
   sur la fenêtre du cycle de facturation (date de début donnée par l'opérateur, question 1). Avant chaque exécution
   `claude_local`, le serveur (`runtime-execution.ts`, avant l'appel de la ligne 793) calcule la somme des événements
   `credits` de toutes les entreprises sur cette fenêtre ; au-delà du plafond, il le signale dans le contexte de
   l'exécution (nom du champ fixé au lot), et l'adaptateur part directement sur l'abonnement (4.1, étape 2).
   L'usine cesse ainsi d'utiliser l'API au montant des crédits, même si la Console laissait continuer (recharge
   automatique allumée par erreur) : ce plafond ne bloque jamais l'abonnement, il retire seulement la clé.
4. Un événement `credits` non tarifé compte toujours comme aujourd'hui dans la règle des non-tarifés (`budgets.ts:203`,
   `:226`). L'essai API qui échoue sur l'épuisement ne doit pas produire d'événement non tarifé : sans jetons
   consommés, il est rapporté complet à 0 ; avec des jetons (épuisement en cours d'exécution), son reçu tarifé est
   rapporté en `credits`. Sans cette précaution, la politique `block` de l'Observatoire mettrait l'entreprise en pause
   à la première bascule.
5. Une clé payante (sans `PAPERCLIP_CLAUDE_CLE_API=credits_inclus`) reste `api` → `metered_api` et comptée comme
   aujourd'hui.
6. Les exécutions sur l'abonnement : inchangées (`subscription_included`, 0).

## 8. « Rien à payer »

Ce que le code garantit :
- il n'utilise la clé que tant que le plafond de crédits d'instance (7.2, point 3) n'est pas atteint ;
- il bascule sur l'abonnement dès que l'API refuse pour solde, facturation ou plafond de dépense ;
- il ne crée, ne recharge ni n'achète rien : il n'a aucun accès à la facturation Console.

Ce que le code ne peut PAS garantir, parce que cela se règle seulement dans la Console :
- l'absence de solde acheté : « Included credits are spent first, then any credits you've purchased » ;
- l'absence de recharge automatique : elle ne porte que sur le solde acheté, mais remplit ce solde ;
- la facturation sur facture par le service commercial (« usage beyond the API credits is billed as usual ») ;
- la lecture du solde restant : aucun accès sans clé d'administration, et l'existence d'une API qui l'expose n'a pas
  été vérifiée.

À vérifier par l'opérateur lui-même, une fois, sur `platform.claude.com/settings/billing` de l'organisation liée :
1. « Promotional credits » affiche le montant de l'offre et sa date d'expiration (la date sert à la question 1) ;
2. solde acheté à 0 ;
3. recharge automatique (« Auto-reload ») coupée ;
4. aucun moyen de paiement enregistré (la doc dit qu'il n'est pas nécessaire) ;
5. la clé est créée dans CETTE organisation ; de préférence dans un espace de travail « Atelier » doté d'une limite
   de dépense mensuelle égale au montant des crédits (l'API répond alors 400 à la limite, traité comme un
   épuisement, section 6). Attention : cette limite se remet à zéro le 1er du mois civil, pas à la date du cycle.

## 9. Journalisation de chaque bascule

- Journal de l'exécution (`onLog`, comme `execute.ts:1369-1372`), en français, sans la clé :
  `[paperclip] Crédits API épuisés (billing_error : « Credit balance is too low »). Relance immédiate sur l'abonnement ; nouvel essai de l'API après <date ISO>.`
  Départ direct sur l'abonnement : `[paperclip] Crédits API marqués épuisés jusqu'à <date ISO> : exécution sur l'abonnement.`
  Plafond d'instance : `[paperclip] Plafond des crédits API de l'instance atteint (<x> / <y> centimes) : exécution sur l'abonnement.`
- Résultat de l'exécution : `resultJson.atelierBascule = { de: "credits", vers: "subscription", raison, empreinteCle, essaiApiApres }`,
  consultable par la suite dans `heartbeat_runs`.
- Journal du serveur : un avertissement par transition (épuisé, rétabli), avec l'empreinte de la clé, jamais à chaque
  exécution.
- Grand livre : l'essai API et la relance donnent chacun leur reçu (`credits` puis `subscription_included`), ce qui
  permet de compter les bascules par SQL.

## 10. Tests (écrits avant le code)

Adaptateur (`paperclip/packages/adapters/claude-local/src/server/`, faux binaire `claude` comme les tests
`execute.*.test.ts` existants) :
1. crédit épuisé (`error: "billing_error"`, texte « Credit balance is too low ») → deux lancements ; le second sans
   `ANTHROPIC_API_KEY` dans l'environnement réellement transmis, avec `CLAUDE_CODE_OAUTH_TOKEN` ; résultat réussi ;
   `billingType` `credits` puis `subscription` ; une ligne de journal ;
2. message brut de l'API (« Your credit balance is too low… ») → même bascule ;
3. 401 (`authentication_failed`) → un seul lancement, code `claude_cle_api_invalide`, pas de bascule ;
4. 529 et 429 avec `retry-after` → un seul lancement, traitement passager existant, pas de bascule ;
5. mémoire : seconde exécution dans la fenêtre → un seul lancement, directement sans clé ;
6. mois suivant : horloge avancée au-delà de T, faux CLI qui réussit avec la clé → un seul lancement avec clé,
   `billingType` `credits`, mémoire effacée, retour journalisé ;
7. aucune clé configurée → arguments, environnement transmis et `billingType` identiques à aujourd'hui (instantané
   comparé avant et après le patch) ;
8. épuisement en cours d'exécution → relance avec la session rendue par l'essai échoué ; aucun reçu non tarifé ;
9. `ANTHROPIC_API_KEY` présente dans `process.env` du serveur → pas de fausse bascule, code `claude_cle_api_hote` ;
10. échec de quota de l'abonnement pendant la relance → pas de troisième lancement.

Serveur (budgets) :
11. un événement `credits` n'entre pas dans le total d'une politique d'entreprise ; un événement `metered_api`, si ;
12. plafond de crédits d'instance atteint → le contexte de l'exécution le signale, et l'exécution part sans clé.

Usine (`tests/`, Python) :
13. agent déterministe (`process`) → jamais `ANTHROPIC_API_KEY` (ni `env_voulu`, ni liaison) ;
14. `cle-api` lie la clé aux seuls agents `claude_local` non résiliés de chaque entreprise ; la valeur n'apparaît ni
    dans la sortie, ni dans les journaux ;
15. `appliquer` puis `mettre-a-jour-client` conservent la liaison ;
16. `cle-api --retirer` → plus aucune des deux variables, les agents gardent leur état.

Vérification finale : `pnpm test` du socle et la suite de l'usine, une seule fois, à la fin.

## 11. Retour arrière

- Immédiat, sans redéploiement : `cle-api --retirer --confirmer` → plus de clé, donc comportement actuel (test 7).
- Complet : retirer `0097` et `0098` de `socle/patches/`, reconstruire le socle et déployer comme d'habitude. Sans
  clé, le code ajouté ne s'exécute pas ; les événements `credits` déjà écrits restent lisibles (le type existe déjà
  dans le socle d'origine, `constants.ts:830`).
- Avant d'appliquer : sauvegarde de l'instance selon la procédure habituelle de déploiement.

## 12. Hors périmètre, signalé

- `quota.ts:575` : pour un agent qui a une clé, l'interrogation des quotas de l'abonnement peut se dire impossible.
  À vérifier pendant le lot, sans le corriger ici.
- La voie ACP (`acp.ts`) n'est pas modifiée ; l'usine ne l'utilise pas (`bootstrap-organisation.py:374-375`).
- Le cache des requêtes est perdu lors de la bascule (identifiant différent) : coût ponctuel, accepté.

## 13. Questions pour l'opérateur

1. Votre offre est-elle Max 5x (100 $) ou Max 20x (200 $), et quelle date d'expiration la Console affiche-t-elle
   pour les crédits ? Ces deux valeurs fixent le plafond de crédits de l'instance et sa fenêtre (7.2, point 3).
2. Clé invalide ou révoquée (401) : on garde l'échec visible de chaque exécution (comme demandé, au risque d'arrêter
   toute l'usine jusqu'à la correction), ou on bascule sur l'abonnement en levant une alerte ?
3. Validez-vous la règle des budgets : les crédits sortent des plafonds de chaque service (dont les 195 € de
   l'Observatoire) et sont bornés par un seul plafond d'instance égal à l'offre ?

## Décisions de l'opérateur (27/10/2026)

- Forfait **Max 20x** : crédit mensuel de **200 $** (en dollars), organisation liée « J-B's Individual Org » depuis le 08/10/2026, prochain crédit le 12/11/2026 (relevé sur claude.ai > Settings > Billing). Le plafond d'instance des crédits vaut donc 200 $ par cycle, cycle du 12 au 12.
- Question 2 : clé refusée (401) → **bascule sur l'abonnement avec une alerte** « clé d'API refusée » au journal ; l'usine ne s'arrête jamais à cause de la clé.
- Question 3 : règle des budgets **validée** (crédits hors plafonds de service, un seul plafond d'instance, l'abonnement jamais bloqué par un plafond rempli par les crédits).
- Reste à vérifier par l'opérateur avant la mise en service : sur platform.claude.com, recharge automatique coupée, solde acheté à 0 ; une Mastercard est enregistrée sur le compte claude.ai (moyen de paiement par défaut « for subscription renewals, usage credits, and auto-reload »).

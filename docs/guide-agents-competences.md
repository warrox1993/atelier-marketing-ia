# Guide des agents, des compétences et du bootstrap (lot B)

Version 1.2, 15/10/2026. Socle : Paperclip `v2026.1012.0`. Contrats du moteur : `docs/contrats.md`
(lot A). Ce guide décrit ce qui est construit et vérifié ; les limites sont listées au §9.

## 1. Où se trouve quoi

| chemin | rôle | modifié à la main |
| --- | --- | --- |
| `organisation/registre/agents.json` | **source canonique** des dix agents (champs du cahier §4) | oui |
| `organisation/registre/organisation.json` | entreprise, marqueur de périmètre, objectifs, projets, routines | oui |
| `organisation/agents/<slug>/AGENTS.md` | instructions de chaque agent (corps) ; en-tête généré | corps seulement |
| `organisation/skills/<slug>/SKILL.md` (+ `references/`) | les 16 compétences, format Agent Skills | oui |
| `organisation/projects/**/PROJECT.md`, `TASK.md` | projets et routines récurrentes | oui |
| `organisation/COMPANY.md` | entreprise (corps) ; en-tête généré | corps seulement |
| `organisation/.paperclip.yaml` | extension Paperclip : adaptateur, budgets, métadonnées, routines | **généré** |
| `organisation/company-package.lock.json` | empreinte sha256 de chaque compétence (verrou facultatif, spécification AgentCompanies §18) | **généré** |
| `organisation/politiques/*.json` | gabarits de politiques d'exécution (revues puis approbation humaine) | oui |
| `organisation/demo/` | corpus fictif (marque, offres, établissements, brief, sources, page piégée) | oui |
| `scripts/bootstrap-organisation.py` | génération, application idempotente, état, export, remise à zéro, jeton, test réel (bibliothèque standard ; PyYAML, paquet Ubuntu `python3-yaml`, pour `exporter` seulement) | |
| `scripts/verifier-organisation.py` | validation hors ligne du modèle (et d'un export) ; utilise PyYAML | |
| `scripts/bootstrap-tests.sh` | tests du lot B (format, cas négatifs, idempotence, export, aller-retour) | |
| `scripts/bootstrap-sonde-competences.py`, `scripts/bootstrap-faux-claude.sh` | sonde de l'injection des compétences, sans modèle | |

Le paquet envoyé à Paperclip ne contient que `COMPANY.md`, `.paperclip.yaml`, `agents/`,
`skills/` et `projects/` (format natif « Agent Companies », `paperclip/docs/companies/companies-spec.md`).
Après toute modification du registre ou d'une compétence :

```bash
python3 -I scripts/bootstrap-organisation.py generer
python3 -I scripts/verifier-organisation.py
```

## 2. Les dix agents

| agent (slug) | titre | rôle Paperclip | rend compte à | compétences (obligatoires en gras) | modèle, effort | budget mensuel (centimes) | tours max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `coordinateur` | Coordinateur marketing | cmo | humain responsable | **cadrage-exigences**, planification-livrables, **dossier-validation-humaine** | claude-opus-5-5, high | 3 000 | 60 |
| `veille` | Marché et veille concurrentielle | researcher | Coordinateur | **recherche-sourcee**, analyse-concurrentielle | claude-sonnet-5-5, medium | 1 500 | 60 |
| `seo-local-geo` | Référencement naturel, local et GEO | general | Coordinateur | audit-seo, **audit-local-etablissements**, contenu-recherche-ia, recherche-sourcee | claude-sonnet-5-5, medium | 1 500 | 60 |
| `sea` | Publicité et SEA | general | Coordinateur | **preparation-campagnes-sea**, charte-marque | claude-sonnet-5-5, medium | 1 500 | 60 |
| `contenus` | Contenus et création | designer | Coordinateur | redaction-declinaison-canal, **charte-marque**, contenu-recherche-ia | claude-sonnet-5-5, medium | 1 500 | 60 |
| `crm-conversion` | CRM et conversion | general | Coordinateur | **conversion-crm**, charte-marque | claude-sonnet-5-5, medium | 1 500 | 60 |
| `mesure` | Mesure et optimisation | researcher | Coordinateur | **mesure-experiences** | claude-sonnet-5-5, medium | 1 000 | 40 |
| `exigences` | Contrôleur des exigences | qa | humain responsable | **controle-couverture** | claude-opus-5-5, high | 2 000 | 40 |
| `relecteur` | Relecteur métier et factuel | qa | humain responsable | **relecture-independante**, recherche-sourcee, charte-marque | claude-opus-5-5, high | 2 000 | 40 |
| `tests-techniques` | Vérificateur technique | qa | humain responsable | **controles-techniques-liens** | claude-sonnet-5-5, medium | 1 000 | 40 |

**Onzième agent, déterministe : `porte` (Porte de contrôle, ajouté le 15/10/2026).** Rôle `qa`,
rend compte à l'humain responsable, aucune compétence, aucun modèle, budget 100 centimes (aucun
coût réel). Adaptateur natif `process` dans les deux modes (`node demo/agent-demo.mjs porte`,
`cwd` = dossier du plugin posé par la liaison locale). Il tient l'unique étape native de revue
des politiques (circuit 1.1, `docs/contrats.md` §6 bis) : il évalue la porte du plugin dans son
run et décide ; les trois contrôleurs travaillent dans des tâches de revue liées (champ
`porte.revuesRequises` des gabarits `organisation/politiques/*.json`). Le vérificateur exige
exactement un agent déterministe et une seule étape de revue tenue par lui. Le jeton Claude
n'est jamais lié à cet agent.

Chaque agent porte aussi, dans le registre et dans ses métadonnées Paperclip
(`metadata.atelier`), ses entrées, ses sorties, ses critères de réussite, la liste des
agents qu'il relit et son rôle de revue.

**Noms courts sans accent.** Paperclip dérive l'identifiant d'un agent de son nom en
supprimant les lettres accentuées (`normalizeAgentUrlKey`, `packages/shared/src/agent-url-key.ts`)
et s'en sert pour reconnaître un agent existant lors d'un nouvel import. « Contrôleur »
donnerait `contr-leur` : le nom court reste donc sans accent (`Exigences`) et le titre porte
le libellé français complet. Même règle pour les projets (`Campagne printemps 2027`,
`Veille continue`), dont l'identifiant d'URL prend sinon un suffixe aléatoire.

**Modèles.** Aucun « meilleur modèle » figé : chaque rôle a son modèle et son effort dans le
registre. Le vérificateur les valide contre la liste réelle de l'adaptateur
(`packages/adapters/claude-local/src/index.ts`, 13 identifiants) et contre la règle des
efforts par modèle (`claudeLocalReasoningEffortsForModel`) . Les relectures à fort enjeu (exigences, métier) sont sur Opus 5.5 à
l'effort `high` ; les producteurs sur Sonnet 5.5 à `medium`.

## 3. Hiérarchie et indépendance des contrôleurs

- Le coordinateur est responsable de la production ; les six spécialistes lui rendent compte.
- Les trois contrôleurs ne rendent compte à **aucun** agent, coordinateur compris : leur
  hiérarchie est l'humain responsable. Le coordinateur produit lui aussi (brief, plan,
  dossier) et ses livrables sont relus ; un contrôleur ne peut donc pas lui être subordonné.
- Le vérificateur refuse un registre où un contrôleur aurait, dans sa chaîne hiérarchique, un
  agent qu'il relit, et exige que chaque producteur soit relu par le contrôleur des
  exigences et le relecteur.
- Utilisateur humain responsable des escalades : en mode `local_trusted`, Paperclip ne
  connaît qu'un utilisateur, le board local (`local-board`, lu par `GET /api/auth/get-session`).
  Le bootstrap l'inscrit comme `responsibleUserId` dans les politiques résolues ; c'est lui
  que l'escalade native désigne après `maxReviewRounds` tours (`reviewEscalationUserId`,
  `server/src/services/issue-execution-policy.ts`).

## 4. Outils autorisés : recherche séparée de la mutation

| agent | recherche | mutation | interdits | rôle de revue |
| --- | --- | --- | --- | --- |
| `coordinateur` | Read, Grep, Glob | Bash(curl *) | WebSearch, WebFetch, Write, Edit, NotebookEdit | |
| `veille` | Read, Grep, Glob, WebSearch, WebFetch | Bash(curl *), Write | Edit, NotebookEdit | |
| `seo-local-geo` | Read, Grep, Glob, WebSearch, WebFetch | Bash(curl *), Write | Edit, NotebookEdit | |
| `sea` | Read, Grep, Glob, WebFetch | Bash(curl *), Write | WebSearch, Edit, NotebookEdit | |
| `contenus` | Read, Grep, Glob, WebFetch | Bash(curl *), Write, Edit | WebSearch, NotebookEdit | |
| `crm-conversion` | Read, Grep, Glob | Bash(curl *), Write, Edit | WebSearch, WebFetch, NotebookEdit | |
| `mesure` | Read, Grep, Glob | Bash(curl *), Write | WebSearch, WebFetch, Edit, NotebookEdit | |
| `exigences` | Read, Grep, Glob | Bash(curl *) | WebSearch, WebFetch, Write, Edit, NotebookEdit | `exigences` |
| `relecteur` | Read, Grep, Glob, WebSearch, WebFetch | Bash(curl *) | Write, Edit, NotebookEdit | `metier` |
| `tests-techniques` | Read, Grep, Glob, WebFetch | Bash(curl *) | WebSearch, Write, Edit, NotebookEdit | `technique` |

**Mode réel : lecture d'URL et `curl` (constat 4 du lot A, 15/10/2026).** La lecture d'URL
protégée n'est pas un outil Claude : en réel, un agent la demande par les routes du plugin
(`POST /api/plugins/atelier.marketing-ia/api/taches/<id>/sources` et `/liens/verifier`, avec son
jeton de run). `Bash(curl *)` reste nécessaire pour parler à Paperclip, et une règle de
permission ne borne pas fiablement l'hôte joint par `curl` (arguments réordonnables). La seule
barrière stable documentée par l'adaptateur `claude_local` est le confinement réseau
`networkScope: "allowlist"` (moteur CLI, Bubblewrap présent sur le poste de développement : `bwrap` 0.11.1) :
il ne laisse sortir que vers `networkAllowlist` et l'URL de Paperclip (ajoutée d'office par
l'adaptateur, `execute.ts`, `networkTrustedUrls`). **Non activé** : la liste exacte des hôtes
dont Claude Code a besoin avec un jeton d'abonnement n'est pas vérifiable sans run réel, et
WebFetch des agents de veille serait coupé. À trancher par l'opérateur au premier run réel
(`docs/checklist-usage-reel.md`).

Traduction dans la configuration native `claude_local` (générée dans `.paperclip.yaml`) :
`dangerouslySkipPermissions: false`, puis `extraArgs` =
`--permission-mode dontAsk --allowedTools <outils autorisés> --disallowedTools <interdits>`,
une valeur par argument (forme de la documentation Claude Code ; le prompt arrive par
l'entrée standard, les options variadiques ne l'absorbent donc pas). En mode `dontAsk`,
tout appel qui demanderait une permission est refusé
(https://code.claude.com/docs/en/permission-modes, consultée le 15/10/2026). Le mode est
explicite parce qu'un run `-p` sans récupération des drapeaux de fonctionnalités (télémétrie
coupée) démarre sinon en mode `auto` depuis Claude Code 2.1.285 (même page).

Permissions bornées (revue de sécurité du 16/10/2026) : en `dontAsk`, une règle sans chemin
autorise tous les chemins. Le registre garde donc `Read`, `Grep` et `Glob` pour décrire les
outils d'un rôle, mais le générateur les retire de `--allowedTools` (la lecture dans le dossier de
travail reste permise sans règle) et remplace `Write` et `Edit` par `Edit(./**)` (seule forme qui autorise l'écriture : `Write(./**)` n'autorise rien, mesuré le 16/10/2026).
Le `settings.json` dédié de chaque agent (créé par `appliquer`) refuse en plus la lecture et
l'écriture de `~/.ssh`, `~/.config`, `~/.claude`, des `.env` et `*.key`, des secrets, bases et
clés de l'instance et de `config/` (chemins absolus calculés à la génération, jamais suivis par
git), coupe la mémoire automatique (`autoMemoryEnabled: false`) et n'autorise la lecture que des
`tool-results` de l'agent sous sa propre configuration.

`Bash(curl *)` sert aux échanges avec Paperclip (API native et routes du moteur de
l'atelier). Les mutations dans Paperclip sont autorisées ou refusées par le serveur
(un agent ne peut ni approuver, ni modifier une politique de revue grâce à la garde P1 du
lot A). Connexions de la passerelle : le serveur d'outils `mcp__paperclip-assigned` est en mutation pour les rôles qui écrivent
sur accord (`crm-conversion` et, depuis le 15/10/2026, `contenus`, qui publie sur Facebook, Instagram et LinkedIn après approbation de
l'appel exact, sans message privé : champ `outilsBloques` du registre, politique native `block`), en recherche pour les rôles en lecture.
Aucune autre mutation externe n'est connectée (régie). Limite : une
règle de permission Claude ne restreint pas l'hôte joint par `curl` ; la barrière réseau
réelle serait `networkScope: "allowlist"` (moteur CLI et Bubblewrap), non activée et non
testée. Une compétence n'ajoute aucune permission : le vérificateur refuse
`allowed-tools` dans un `SKILL.md`.

## 5. Les seize compétences

| compétence | objet | agents |
| --- | --- | --- |
| `cadrage-exigences` | brief, exigences REQ-xxx, informations manquantes | coordinateur |
| `planification-livrables` | graphe de tâches sans cycle, relectures prévues | coordinateur |
| `recherche-sourcee` | sources datées, statut d'accès, fait, inférence, hypothèse | veille, seo-local-geo, relecteur |
| `analyse-concurrentielle` | grille identique par concurrent, recommandations séparées | veille |
| `audit-seo` | indexabilité, structure, contenu, maillage | seo-local-geo |
| `audit-local-etablissements` | une ligne par établissement du périmètre confirmé | seo-local-geo |
| `contenu-recherche-ia` | contenu utile pour la recherche et les moteurs d'IA, sans promesse | seo-local-geo, contenus |
| `preparation-campagnes-sea` | campagne en brouillon, budget borné, rien d'activé | sea |
| `redaction-declinaison-canal` | contenu principal et déclinaisons, briefs de visuels, appel de publication à faire approuver (1.3.0) | contenus |
| `charte-marque` | ton, vocabulaire, affirmations autorisées | sea, contenus, crm-conversion, relecteur |
| `conversion-crm` | page, formulaire, scénarios avec consentement | crm-conversion |
| `mesure-experiences` | données datées, « non mesurable », expériences bornées | mesure |
| `controle-couverture` | verdict par exigence avec preuve localisée | exigences |
| `relecture-independante` | faits, sources, cohérence, injection | relecteur |
| `controles-techniques-liens` | liens, contenu réel, formulaires, schémas | tests-techniques |
| `dossier-validation-humaine` | dossier et approbation bornée à une version | coordinateur |

Format vérifié par `scripts/verifier-organisation.py` :

- en-tête Agent Skills : `name` égal au dossier (minuscules, chiffres, tirets, 64 au plus),
  `description` de 40 à 1 024 caractères qui dit quand utiliser la compétence,
  `metadata` en chaînes avec `version` `x.y.z` ; pas d'`allowed-tools` ;
- en-tête lu à l'identique par le parseur YAML maison de Paperclip (portage Python de
  `parseYamlBlock`) et par un parseur YAML standard : chaînes entre guillemets doubles, pas
  de bloc `>` ;
- neuf rubriques dans l'ordre : Quand l'utiliser, Objectif, Prérequis, Entrées, Étapes,
  Livrable, Critères de réussite, Limites, Exemple (exemple français réaliste) ;
- moins de 500 lignes ; références longues dans `references/`, chacune citée et présente.

Règle de version : toute modification de contenu change l'empreinte sha256 (verrou) ; on
incrémente aussi `metadata.version`. L'empreinte reste l'identifiant qui fait foi.

## 6. Du registre natif à l'espace d'exécution (vérifié)

1. **Registre natif.** L'import du paquet (`POST /api/companies/import`) crée les 16
   compétences dans `company_skills`, clé `company/<companyId>/<slug>`, et règle les
   compétences voulues de chaque agent (`adapterConfig.paperclipSkillSync.desiredSkills`).
   Paperclip ajoute aussi ses 8 compétences intégrées (dont `paperclip`).
2. **Version native.** Le bootstrap fige une version par compétence
   (`POST /companies/:id/skills/:skillId/versions`, route stable) étiquetée
   `atelier <version> sha256:<16 premiers caractères>`. Elle n'est recréée que si le contenu
   change. L'état local (`instance/atelier-demo/etat-bootstrap.json`) relie chaque compétence
   à son `skillId`, sa clé, son `versionId` et son empreinte complète. L'épinglage d'une
   version par exécution reste réservé au réglage expérimental `enableBetaSkills`, non activé
    : Paperclip monte toujours la version courante.
3. **Contrôle de contenu.** À chaque `appliquer`, le bootstrap relit chaque compétence par
   l'API (`GET …/skills/:id` puis `…/files?path=`) et recalcule l'empreinte : un écart avec
   le dépôt relance l'import. Testé : une modification locale est propagée puis annulée.
4. **Au lancement d'un run** (moteur CLI, `execute.ts` et `prompt-cache.ts` de l'adaptateur) :
   Paperclip crée `…/companies/<id>/claude-prompt-cache/<bundleKey>/.claude/skills/<slug>--<suffixe>`
   (lien vers sa copie de la compétence) et passe ce dossier par `--add-dir`. Claude Code
   charge les compétences de `.claude/skills/` d'un dossier ajouté par `--add-dir`, au titre
   de la source de réglages `project` (https://code.claude.com/docs/en/permissions, section
   « Additional directories grant file access, not configuration », consultée le
   15/10/2026). Conséquence : elles ne se chargeraient plus si `--setting-sources` excluait
   `project` ; Paperclip ajoute `--setting-sources user` quand `managedAiConnection` est
   configuré (`execute.ts`), réglage que les agents de l'atelier n'utilisent pas.
   `bundleKey` est un sha256 des clés, noms et contenus des compétences montées et des
   instructions.

**Preuve sans modèle** (`scripts/bootstrap-sonde-competences.py`, 15/10/2026) : entreprise
jetable, agent `exigences` dont la commande est remplacée par `scripts/bootstrap-faux-claude.sh`.
Le faux `claude` a reçu `--add-dir …/claude-prompt-cache/<bundleKey>`, y a trouvé
`controle-couverture--<suffixe>` (empreinte identique à celle du verrou) et `paperclip`,
ainsi que `--permission-mode dontAsk`, les listes d'outils, `--model claude-opus-5-5`,
`--effort high`, `--max-turns 40`, sans `--dangerously-skip-permissions` ;
`CLAUDE_CONFIG_DIR` dédié ; `CLAUDE_CODE_OAUTH_TOKEN` présent (secret factice résolu par
`secret_ref`) et masqué dans le journal du run ; `ANTHROPIC_API_KEY` absente. Les trois
gabarits de politiques, résolus, ont été acceptés par le serveur. L'entreprise jetable est
supprimée à la fin.

**Journal natif.** L'événement `adapter.invoke` du run contient
`Using stable Claude prompt bundle <bundleKey>` et les arguments. Il ne contient pas de
liste lisible « clé + version » des compétences : ce journal est à la charge du moteur
(lot A, voir §8).

**Compétence obligatoire.** Monter une compétence la rend disponible ; Claude décide de lire
son corps d'après sa description. Ce n'est pas une garantie de chargement : pour une
compétence obligatoire, le moteur doit assembler son contenu dans le contexte du run ou
vérifier son usage (contrat §8). Les instructions de chaque agent citent aussi leurs
compétences obligatoires.

## 7. Mode réel et mode démonstration

**Mode réel (défaut, prêt, non lancé).** Adaptateur `claude_local`, moteur `cli`
(commande `claude` du PATH, 2.1.292 sur le poste de développement), `maxConcurrentRuns: 1`,
`timeoutSec 1800`, `graceSec 30`, télémétrie coupée (`DISABLE_TELEMETRY=1`,
`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`). Liaison propre à la machine, posée par le
bootstrap et jamais écrite dans le paquet : `cwd` = `instance/agents-atelier/<id entreprise>/<slug>`,
`CLAUDE_CONFIG_DIR` = `instance/claude-config/<id entreprise>/<slug>` (droits 700) contenant seulement un
`settings.json` (droits 600) avec `claudeMdExcludes` (registre, `adaptateur.reglagesConfigClaude`).
Tous les agents sont importés **en pause**.

**Isolement des consignes de l'opérateur (constaté, puis corrigé).** Claude Code charge les
`CLAUDE.md` du dossier de travail **et de tous les dossiers parents**
(https://code.claude.com/docs/en/memory, consultée le 15/10/2026). Le `cwd` des agents est
dans le dossier personnel de l'opérateur : un `CLAUDE_CONFIG_DIR` dédié ne suffit donc pas. Preuve sans
appel de modèle : le vrai `claude` lancé dans ce type de dossier, avec une clé factice et
`ANTHROPIC_BASE_URL` vers un serveur local qui enregistre la requête et répond par une
erreur, envoie « Contents of …/.claude/CLAUDE.md ». Avec
`claudeMdExcludes` (`**/CLAUDE.md`, `**/CLAUDE.local.md`, `**/.claude/rules/**`,
`**/AGENTS.md`) dans le `settings.json` dédié, la requête ne contient plus aucune consigne,
compétence ni extension de l'opérateur. Ce test tourne dans `scripts/bootstrap-tests.sh`, avec un
témoin sans réglage pour prouver qu'il discrimine. Les instructions de l'agent ne sont pas
touchées : Paperclip les passe par `--append-system-prompt-file`, pas par la découverte de
fichiers. Le réglage passe par la source `user` (le `CLAUDE_CONFIG_DIR`) : il ne tiendrait
plus si `--setting-sources` excluait `user`.

Activation (à faire par l'opérateur, plus tard) :

```bash
claude setup-token                                        # terminal interactif de l'opérateur
python3 -I scripts/bootstrap-organisation.py jeton --confirmer   # coller le jeton (entrée standard)
python3 -I scripts/bootstrap-organisation.py test-reel           # à blanc : vérifie agent, jeton, requête
python3 -I scripts/bootstrap-organisation.py test-reel --confirmer  # NON EXÉCUTÉ : un appel réel « Respond with hello. »
```

`jeton` range la valeur comme secret natif (`POST /companies/:id/secrets`, chiffré par la
clé de l'instance ; `POST /secrets/:id/rotate` s'il existe déjà) et la lie à chaque agent par
`secret_ref` (`version: latest`). `test-reel --confirmer` appelle la sonde native de
Paperclip (`POST /companies/:id/adapters/claude_local/test-environment`, qui restaure côté
serveur les valeurs masquées de l'agent). **Non exécuté** : aucun appel de modèle n'a été
fait pendant le lot B. Les agents restent en pause : les réveiller relève d'une décision
humaine (`POST /agents/:id/resume`).

**Mode démonstration.** `python3 -I scripts/bootstrap-organisation.py appliquer --mode demonstration`
remplace la liaison par l'adaptateur `process` du contrat §8 du lot A : `node
demo/agent-demo.mjs <slug>`, `cwd` = `plugin-atelier/`, chemin relatif, `ATELIER_MODE=demonstration`.
Le script `demo/agent-demo.mjs` (lot A) accepte ces identifiants courts (table `ALIAS`) et lit le
scénario dans `ATELIER_SCENARIO` (B par défaut) ; les agents restent en pause tant que l'humain ne
les réveille pas. La démonstration en une commande (`scripts/demonstration.sh`) rejoue, elle, une
entreprise de scénario dédiée.
`appliquer` sans option revient au mode réel (réimport, puis liaison réelle). Bascules
testées dans les deux sens, chaque deuxième passe sans écriture.

## 8. Bootstrap, remise à zéro, export

```bash
python3 -I scripts/bootstrap-organisation.py appliquer      # crée ou met à jour, idempotent
python3 -I scripts/bootstrap-organisation.py etat
python3 -I scripts/bootstrap-organisation.py exporter --sortie <dossier vide>
python3 -I scripts/bootstrap-organisation.py reinitialiser --confirmer "Rénovation Liège (démonstration)"
scripts/bootstrap-tests.sh [--instance [--remise-a-zero]]
```

**Périmètre.** Seule l'entreprise nommée « Rénovation Liège (démonstration) » **et** dont la
description porte le marqueur `atelier-demo:renovation-liege` est touchée. Une entreprise du
même nom sans marqueur, ou deux entreprises marquées, arrêtent le script sans rien modifier.
Les dossiers locaux supprimés par la remise à zéro sont seulement
`instance/agents-atelier/<id entreprise>/`, `instance/claude-config/<id entreprise>/` et `instance/atelier-demo/` (les anciens dossiers partagés par rôle ne sont jamais touchés).

**Idempotence.** Première passe : import natif (`new_company`, agents et routines en pause),
liaison locale, objectifs, liens projets-objectifs, versions de compétences. Passes
suivantes : synchronisation des instructions, puis comparaison de l'état : empreinte du
paquet et du mode, liaison, bundle d'instructions rattaché, contenu de chaque compétence,
et **champs lisibles de chaque agent** (nom, titre, rôle, budget, responsable, compétences
voulues, plafond de runs, moteur, modèle, effort, permissions, plafond de tours, délais,
`extraArgs`) pour détecter une retouche faite dans l'interface. Si tout concorde,
**aucune écriture**. Sinon import natif `existing_company` en stratégie `replace` (mise à
jour en place, aucun doublon). Détails :

- Les routines déjà présentes sont exclues de l'import (il crée toujours de nouvelles
  tâches), puis **réalignées par l'API** (description, responsable, projet, politiques de
  concurrence et de rattrapage, cron et fuseau du déclencheur). Leur statut (pause ou actif)
  n'est jamais modifié. Une erreur de lecture des routines arrête le script (pas de doublon).
- Le vérificateur n'admet que des `TASK.md` récurrents, puisque l'import dupliquerait une
  tâche simple à chaque mise à jour.
- Une mise à jour ne demande `pauseAutomations` que si un agent doit être créé : un agent
  activé par l'opérateur n'est pas remis en pause par une simple mise à jour (testé).
- Rien n'est supprimé automatiquement : agents, compétences, projets, objectifs ou routines
  présents dans l'entreprise mais absents du dépôt sont affichés comme « écart non géré ».
- Les valeurs « plain » des variables restent masquées par l'API : une valeur changée dans
  l'interface (par exemple `CLAUDE_CONFIG_DIR`) n'est **ni détectée ni corrigée** par
  `appliquer` (mesuré le 15/10/2026). L'empreinte de liaison enregistrée par le bootstrap est
  calculée sur la liaison VOULUE par le registre : elle repère un changement du registre ou du
  mode, pas une retouche faite dans l'interface. Détection manuelle et remède :
  `docs/exploitation.md` §8 (révisions de configuration de l'agent).
- Le périmètre est vérifié avant toute écriture, y compris locale ; une entreprise portant
  le marqueur sous un autre nom (renommée, ou entreprise jetable restée en place) arrête le
  script.

**Export.** `exporter` appelle l'export natif, retire les valeurs propres à la machine
(défaut des entrées `system_dependent`, chemins absolus de `cwd`, `command`,
`instructionsFilePath`), écarte les fichiers binaires (organigramme PNG, non contrôlable par
motif), puis contrôle l'absence de secret, de variable d'environnement en clair et de chemin
local absolu (dossier personnel, dossiers temporaires, disques montés, `var`, `opt`, chemins Windows…). **En cas de
problème, rien n'est écrit.** Sinon il écrit le paquet et demande un aperçu d'import du
paquet exporté (aucune écriture). Le paquet canonique du dépôt (`organisation/`) n'a, lui, aucun chemin
absolu : la liaison locale n'est jamais dans le paquet, ce qui règle à la source le défaut
relevé par l'audit (chemins absolus dans les arguments) pour les agents réels.

**Constats sur le socle (défauts amont, non corrigés ici) :**

1. Un import `replace` qui modifie un `AGENTS.md` échoue en silence
   (`INSTRUCTION_REVISION_REQUIRED`, simple avertissement) et laisse l'ancien texte.
   Contournement : le bootstrap écrit d'abord par l'API de révision
   (`PUT /agents/:id/instructions-bundle/file` avec `baseHash`) et échoue si un avertissement
   « Failed to » subsiste.
2. `DELETE /api/companies/:id` renvoie 500 dès qu'un projet est lié à un objectif : la
   transaction supprime `goals` avant `projects` (`server/src/services/companies.ts`, lignes
   579 et 580 environ) alors que `projects.goal_id` n'a pas de `ON DELETE`. Contournement dans
   `reinitialiser` : délier projets et objectifs avant de supprimer.
3. Les objectifs ne font pas partie du format de paquet : le bootstrap les crée par
   l'API (`/companies/:id/goals`) et les relie aux projets (`goalIds`).
4. L'API masque les valeurs « plain » des variables (`***REDACTED***`) : la conformité de la
   liaison est vérifiée par clés, types, références de secret et une empreinte de liaison
   enregistrée dans `metadata.atelier.bootstrap`. Cette empreinte porte sur la liaison voulue,
   pas sur la valeur réelle : une valeur « plain » retouchée dans l'interface passe donc
   inaperçue (limite mesurée, voir `docs/exploitation.md` §8).
5. L'export écrit dans les `AGENTS.md` des clés de compétences contenant l'identifiant de
   l'entreprise source et vendorise les 8 compétences intégrées ; un aller-retour donne donc
   32 compétences (16 + 8 + 8 réinstallées). Le paquet canonique du dépôt n'a pas ce défaut.
6. Pour un réveil manuel sans tâche, le prompt transmis commence par la ligne `null`
   (observé par la sonde ; cause non établie).
7. Comportement de Claude Code, pas de Paperclip : un `CLAUDE_CONFIG_DIR` dédié n'empêche
   pas le chargement des `CLAUDE.md` des dossiers parents (voir §7, corrigé par
   `claudeMdExcludes`).

## 9. Contrats avec le lot A (moteur et plugin)

| sujet | ce que fournit le lot B | ce qu'attend le lot B du lot A |
| --- | --- | --- |
| rôles de revue | `metadata.atelier.roleRevue` : `exigences`, `metier`, `technique` sur les agents `exigences`, `relecteur`, `tests-techniques` | désigner le contrôleur d'une revue à partir de ce champ (ou documenter l'autre source) |
| identifiants | `instance/atelier-demo/etat-bootstrap.json` : entreprise, agents par slug, objectifs, projets, compétences (clé, `versionId`, sha256), utilisateur responsable, mode | ne pas recopier ces identifiants dans le code |
| politiques | `instance/atelier-demo/politiques/*.json` (résolues) ; aucune étape « porte » : la garde P2 est côté serveur | mettre la tâche sous porte (`POST …/portes`) à sa création |
| journal des compétences | algorithme d'empreinte du verrou (`company-package.lock.json`) et clé du bundle | journaliser au lancement, pour chaque compétence montée : clé, `runtimeName`, `currentVersionId`, sha256 (même algorithme) et `bundleKey` |
| compétences obligatoires | `metadata.atelier.competencesObligatoires` par agent | les assembler dans le contexte du run ou vérifier leur usage ; la description seule n'est pas une garantie |
| démonstration | liaison `process` : `node demo/agent-demo.mjs <slug>`, `cwd` = `plugin-atelier/`, `ATELIER_MODE=demonstration` | fournir `demo/agent-demo.mjs` ; préciser comment le scénario est choisi (argument, variable ou contexte du réveil) |
| verdicts | les compétences de contrôle suivent `DeposerVerdictEntree` et les routes du §6 | garder ces noms de champs stables (v1 gelée) |
| plafond de concurrence | `maxConcurrentRuns: 1` par agent | régulateur de 3 runs actifs par entreprise |
| isolement des agents réels | `CLAUDE_CONFIG_DIR` dédié avec `settings.json` (`claudeMdExcludes`), `cwd` dédié | ne pas lancer `claude` avec `--setting-sources` sans `user`, ni `managedAiConnection`, sous peine de perdre l'isolement ou les compétences |

## 10. Tests exécutés (15/10/2026)

| commande | résultat |
| --- | --- |
| `python3 -I scripts/verifier-organisation.py` | 8 contrôles réussis, 0 erreur |
| `scripts/bootstrap-tests.sh --instance --remise-a-zero` | **19 réussis, 0 échec** : vérificateur ; 7 cas négatifs refusés (rubrique absente, contrôleur subordonné, Fable, outil de mutation classé en recherche, dérive d'un fichier généré, `allowed-tools`, adresse réelle) ; isolement des consignes (témoin puis réglages) ; remise à zéro ; passe 1 (33 écritures) puis passe 2 (0 écriture) ; état sans doublon ; agents en pause ; mise à jour en place (dérives simulées du modèle, d'un cron et d'instructions, détectées et corrigées, agent activé resté actif, passe suivante sans écriture) ; export contrôlé et aperçu sans erreur ; aller-retour d'import (10 agents, 32 compétences, 2 projets, 3 routines, hiérarchie vers le coordinateur) puis suppression |
| `python3 -I scripts/bootstrap-sonde-competences.py --sortie <dossier vide>` | « SONDE : RÉUSSIE », code 0 : run `succeeded`, compétence montée identique au verrou, jeton remis par `secret_ref` et masqué, 3 politiques acceptées, entreprise jetable supprimée |
| `appliquer --mode demonstration` puis `appliquer` (deux fois chacun), à la main | bascules réussies, deuxième passe sans écriture |
| modification temporaire d'une compétence puis retour, à la main | propagation détectée par empreinte, nouvelle version native, retour à l'identique |
| `jeton --confirmer` avec une valeur factice, puis rotation, à la main | secret créé, lié aux 10 agents, renouvelé ; effacé ensuite par la remise à zéro |
| `test-reel` (à blanc) | agent, modèle, jeton et requête affichés, rien envoyé ; `--confirmer` **non exécuté** |

Aucun appel de modèle n'a été fait : la sonde utilise un faux `claude`, le test d'isolement
un serveur local de capture avec une clé factice.

## Connecteurs

L'état de chaque connecteur (réel testé, implémenté non testé, contrat seulement, absent) est
tenu dans `docs/integrations.md` et affiché par l'interface (Paramètres et diagnostic). Une
compétence ne donne accès à aucun connecteur : seules les routes du plugin (lecture d'URL
protégée, vérification de liens, import contrôlé) et l'adaptateur `claude_local` existent.

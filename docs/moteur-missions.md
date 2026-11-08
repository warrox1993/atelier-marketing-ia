# Moteur de missions : états, transitions, limites du SDK

Issue #49. Le statut Paperclip projette l'état du moteur. Preuves lues dans le code, sans instance lancée ; les symboles natifs ne viennent pas de `socle/patches/`, sauf mention. `S/` = `paperclip/server/src/services/`, `H` = `S/plugin-host-services.ts`, `D/` = `plugin-atelier/node_modules/@paperclipai/plugin-sdk/dist/`, `P/` = `plugin-atelier/src/`.

## Décisions

| Besoin | Natif, puis SDK | Décision |
| --- | --- | --- |
| 1. Tâches, dépendances | Tâche et blocages en une transaction (`S/issues.ts:10477`), pas de lot. `ctx.issues.create` et `blockedByIssueIds` (`D/types.d.ts:1170`) | **Natif par le SDK**, un appel par étape, non atomique sur la mission |
| 2. Réveil direct | `requestWakeup` refuse sans assigné, en `backlog`, `done`, `cancelled`, ou blocage non `done` (`H:2419-2429`). Clé comparée seulement en réconciliation (`S/heartbeat/queue.ts:3099`) | **SDK** ; l'unicité vient de `executions` |
| 3. Statuts | Seul un statut inconnu est refusé (`S/issues.ts:313`). Un `done` par la route réveille les dépendants hors `backlog` (`server/src/routes/issues.ts:15712`, `S/issues.ts:9280`), sans contrôle hors politique native ou garde de porte (correctif 0001) | **Plugin** : étapes futures en `backlog`, ignoré aussi par la relance native (`S/recovery/service.ts:4384`) et le veilleur (`P/serveur/base.ts:219`). `done` sans sortie valide : aucune transition, retour à `in_progress`, journal |
| 4. Avancer au résultat | Rien selon le contenu. `ctx.tools.register` ; événements en mémoire, sans relivraison (`S/plugin-event-bus.ts:172-198`, `H:1768`) | **SDK** : l'outil (branché en #50) est la voie normale, `issue.updated` un filet, sous la même clé |
| 5. Reprise | Le socle reprend ses runs, pas l'état du plugin. Idempotence de création réelle (`S/issues.ts:10025-10090`) **inaccessible** : le SDK ne transmet pas `idempotencyKey` (`D/worker-rpc-host.js:583-607`). `issues.list` filtre par origine (`S/issues.ts:6369`) | **Plugin** : intention dans `executions`, lecture par origine avant création. Reste un appel en vol aboutissant après la lecture (probable, non testé) |
| 6. Déroulé natif | Voir ci-dessous | **Moteur réduit**, pas supprimé |

**Point 6, franchement.** `blockedByIssueIds` et `issue_blockers_resolved` enchaînent déjà une suite linéaire sans coordinateur (filet : `S/recovery/service.ts:5604`) : le moteur ne recode ni ordre, ni file, ni budget, ni verrous. Mais ce réveil part au `done` de l'agent, avant tout contrôle de contrat, d'où le `backlog`. Le neuf : contrats, états, reprise. Politiques d'exécution : gardées par la porte. Routines : une tâche récurrente, sans étapes. **Pipelines** (`S/pipelines.ts:2227`), le plus proche : désactivés par défaut (`packages/shared/src/feature-catalog.ts:159`), dits expérimentaux (`S/instance-settings.ts:392`), absents du SDK, donc écartés. La tâche racine reste sans agent assigné, sinon la fin des enfants le réveille (`S/issues.ts:9314`).

## États et transitions

Terminaux : `cloturee` (`done`), `annulee` et `echec` (`cancelled`). Toute autre paire lève `TransitionInvalide`. Lignes marquées * : aussi `pause_demandee` → `pause` et `annulation` → `annulee`.

| État (statut projeté) | Événement → état suivant |
| --- | --- |
| `prete` (`todo`) * | `demarrage` → `en_cours` ; `entree_manquante` → `attente_information` ; `contrat_invalide` → `blocage` |
| `en_cours` (`in_progress`) * | `sortie_valide_etape` → `prete` ; `sortie_valide_sous_porte` → `en_revue` ; `sortie_valide_finale` → `resultat_confirme` ; `sortie_hors_contrat` → `en_cours` ; `entree_manquante` → `attente_information` ; `contrat_invalide`, `plafond_atteint`, `arbitrage_demande` → `blocage` ; `echec_declare` → `echec` |
| `en_revue` (`in_review`) * | `changements_demandes` → `en_cours` ; `entree_manquante` → `attente_information` ; `porte_franchie` → `attente_autorisation` ; `plafond_atteint` → `blocage` |
| `attente_autorisation` (`in_review`) * | `approuvee_avec_effet` → `en_execution` ; `approuvee_sans_effet` → `resultat_confirme` ; `changements_demandes` → `en_cours` |
| `en_execution` (`in_progress`) | `effet_confirme` → `resultat_confirme` ; `effet_refuse` → `echec` ; `effet_ambigu` → `blocage` |
| `resultat_confirme` (`in_progress`) | `cloture` → `cloturee` |
| `attente_information` (`blocked`, interaction) * | `information_recue` → `prete` |
| `blocage` (`blocked`) * | `arbitrage_repris` → `prete` ; `arbitrage_effet_confirme` → `resultat_confirme` ; `arbitrage_abandon` → `echec` |
| `pause` (`backlog`) | `reprise_travail` → `prete` ; `reprise_revue` → `en_revue` ; `reprise_autorisation` → `attente_autorisation` ; `reprise_information` → `attente_information` ; `reprise_blocage` → `blocage` ; `annulation` → `annulee` |

Le coordinateur n'est réveillé qu'à l'entrée de `blocage`. Sur `changements_demandes`, `P/serveur/chaine.ts` réveille déjà l'auteur. Une interaction en attente écarte le veilleur (`P/serveur/veilleur.ts:118`) : pas de modèle en `attente_information`.

## Limites réelles du SDK

- `ctx.db` : ni transaction, ni `WITH` en tête d'écriture (`D/types.d.ts:425-434`, `S/plugin-database.ts:284`).
- SDK installé antérieur au correctif 0129 : `issues.create` perd `executionPolicy`, `issues.update` la transmet (`D/worker-rpc-host.js:613-622`).
- Manifeste (`P/manifest.ts:26-59`) : capacités utiles déclarées ; ni `jobs.schedule` ni `issues.checkout` (la tâche d'un outil vient de `base.tacheDuRun`).

## Données neuves

Réutilisés sans copie : `campagnes`, `portes`, `verdicts`, `diffusions`, `connaissances_*`, `journal`. Chaque table a aussi `id`, `company_id`, `cree_le`, `modifie_le`.

- **`missions`** : `gabarit_cle`, `gabarit_version`, `contrat_id`, `contrat_version`, `mandat`, `etat`, `etat_avant_pause`, `rang_courant`, `enveloppe_cents`, `campagne_id` (nullable), `issue_racine_id`.
- **`etapes`** : `mission_id`, `rang`, `role`, `tentative`, `etat`, `entree`, `sortie`, `delai_le`, `issue_id` ; unique (`mission_id`, `rang`, `tentative`). Une tentative rouvre la même tâche, d'origine `plugin:<clé>:etape-mission` / `mission:<id>:<rang>`.
- **`executions`** : `mission_id`, `rang`, `type` (`evenement`, `creation_tache`, `reveil`, `effet_externe`), `cle_idempotence`, `requete`, `statut` (`demandee`, `appliquee`, `refusee`), `statut_externe`, `identifiant_fournisseur`, `diffusion_id` (nullable, sans recopier la diffusion) ; unique (`company_id`, `cle_idempotence`).

## Clé d'idempotence d'un événement

`<missionId>:<rang>:<tentative>:<evenement>[:<source>]`, jamais l'`eventId`, pour que l'outil et le filet convergent. `<source>` identifie un fait humain répétable (pause, reprise, annulation, information). Écritures rejouables : `INSERT ... ON CONFLICT DO NOTHING` en `demandee` ; `UPDATE missions SET etat = $nouveau WHERE id = $id AND etat = $ancien` ; passage à `appliquee`. Clé `appliquee` : rejeu sans effet. Clé `demandee` : reprise.

## Étapes en code et export CRM (WF-01, #51)

Une étape de nature `code` ne réveille aucun agent et ne crée aucune tâche : le moteur calcule sa sortie lui-même (`creerEtapesWf01`, `P/moteur/export-crm.ts`). Avant la porte (périmètre, déduplication, exclusions), ce sont des lectures, rejouables. Les exclusions du code actuel écartent le prospect ; les oppositions le **marquent** et ne l'écartent jamais.

`rangPorte(gabarit)` est le rang de la dernière étape qui n'est pas en code (7 pour WF-01) : sa tâche porte la porte, la relecture et l'approbation native, et c'est elle qui sert de tâche à l'export. Les étapes en code situées après ce rang (carte groupée, export, vérification) ne démarrent qu'à l'approbation native, lue par `issues.get`, sur la révision relue.

L'export est la seule écriture externe. Une clé par prospect (`<missionId>:<rang>:1:export_crm:<prospectId>`, `demandee` puis `appliquee`) et la présence constatée avant d'écrire rendent la reprise sans doublon, y compris après un arrêt entre l'écriture et sa marque. Un échec n'arrête pas les autres : la liste exacte des réussites et des échecs est journalisée (`moteur.export_partiel`), la reprise ne réécrit que les échecs, et au troisième essai partiel la mission part en blocage (`effet_ambigu`).

L'écriture de production (`creerCrmProduction`, `P/moteur/branchement.ts`) appelle la route `tache.prospects.exporter` **une seule fois par lot** (la décision `modifier_crm` n'autorise qu'une diffusion), au nom de l'acteur `systeme` « moteur-missions ». La clé d'idempotence se calcule sur le contenu du lot (`moteur:` + clé d'événement + 32 caractères du sha256 des identifiants triés) : les prospects déjà présents dans le CRM (même service, même mode) sont écartés avant l'appel. **Elle reste sous l'approbation humaine de l'appel exact** : le moteur ne crée, ne simule ni ne contourne la décision. Sans décision, la route répond 202 `en_attente_approbation` : ce n'est ni un échec ni un essai, l'étape reste `en_cours` (`enAttente`), un seul journal `export_en_attente` est écrit et chaque passe suivante rejoue la même clé. Un refus (403 `refusee`, par exemple un prospect sans base légale) ne retire que les prospects refusés, listés en échec avec leur motif ; le reste repart dans un nouvel appel (autre contenu, autre clé), et la ligne `refusee` reste sous sa clé : l'issue d'un échec persistant est le blocage, puis l'arbitrage du coordinateur. Un lot vide part en blocage (`lot_vide`). Le préfixe de clé `moteur:` est réservé à l'acteur `systeme` : un agent qui le demande est refusé (`acces_refuse`). En mode réel, rien n'exécute encore la preuve signée (diffusion `preparee`) : la mission s'arrête en blocage (`absents_du_crm`) à la vérification, à lever avec l'exécuteur réel de WF-01. La marque d'opposition est journalisée par le moteur (`moteur.export_marque_opposition`, identifiants seuls, aucune coordonnée) avant l'export ; la route n'en porte pas.

Les lectures des étapes en code sont celles des services (`lecturesMoteur`) : un prospect d'une autre entreprise, inconnu ou mal formé est ignoré, et un contexte d'exclusions est refusé tant que des oppositions sont à réimporter, comme pour la route d'export.

## Sans CRM : fichier de mission (WF-01, #60)

Le CRM est optionnel. L'entrée de la mission porte soit `exportCrm` (service, canal, entité), soit `exportFichier` (canal). Un `exportCrm` fourni se juge seul : invalide, il est refusé et ne bascule jamais vers le fichier. Rien de fourni : la mission reste en `attente_information`.

Sans `exportCrm` sur l'entrée de l'étape 1, l'étape `export_crm` n'appelle aucun CRM. Elle se termine avec `{ reussis: [], echecs: [], essais: 0, fichier: { canal, prospectIds } }`, journalise `moteur.fichier_pret` (canal et nombre, aucune coordonnée) et commente une fois la tâche racine ; la vérification n'a alors rien à confirmer et la mission se clôt. Le choix se lit sur l'entrée de l'étape 1, jamais sur une sortie d'agent. Un commentaire sans acteur humain ne réveille pas l'assigné (`plugin-host-services.ts`, `createComment`).

Le moteur ne stocke aucun fichier. La route `missions.fichiers-prospects` liste les lots (identifiants et nombre), et la vue Prospects, section « Fichiers de mission », appelle au clic la route humaine `prospects.exporter-fichier` : le `.xlsx` se fabrique à ce moment, avec les contrôles et le journal de cette route. Un prospect refusé par ces contrôles est listé dans le rapport du téléchargement ; un prospect marqué d'opposition reste présent, avec `marque_opposition` à « oui ».

## Écarts avec le plan de #49

1. **Tâche 5, critères 7 et 9** : « 1 appel » vaut pour le modèle (`demarrerMission`) ; l'hôte reçoit N `issues.create` et un réveil, le double compte les deux.
2. **Tâches 3 et 4** : le worker ne semble pas lire `organisation/` (aucune lecture trouvée). Constat : les JSON sont embarqués par import (`with { type: "json" }`) dans `P/moteur/registre.ts`, `P/moteur/contrats.ts` et `P/moteur/gabarits.ts`, comme `P/serveur/regles-promesses.ts:9`. Le `rootDir` du `tsconfig` (`.`) ne les refuse pas : `resolveJsonModule` est actif, `noEmit` aussi, et `npx tsc --noEmit -p .` ne signale aucune erreur de ce type (esbuild les inclut dans le paquet).
3. **Tâche 3** : `revuesImposees` a besoin d'un résolveur de `{{agent:...}}` (`P/serveur/services.ts:2098-2101`). `controlerPorte` et `poserPorte` exigent une `RequeteRoute` : passer par `base.creerPorte` et `issues.update`. Une porte exige une campagne (`NOT NULL`).
4. **Tâche 5** : le démarrage seul ne rattrape pas un événement perdu worker actif : même passe sur minuterie, comme le veilleur (`P/worker.ts:32-39`). `moteurMissions` se lit par entreprise (`P/worker.ts:27`).
5. **Tâche 2** : `enregistrerExecution` dit si la clé est neuve ; colonnes en plus : `etat_avant_pause`, `type`, `statut`, `diffusion_id`.

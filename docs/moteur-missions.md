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

## Écarts avec le plan de #49

1. **Tâche 5, critères 7 et 9** : « 1 appel » vaut pour le modèle (`demarrerMission`) ; l'hôte reçoit N `issues.create` et un réveil, le double compte les deux.
2. **Tâches 3 et 4** : le worker ne semble pas lire `organisation/` (aucune lecture trouvée). Constat : les JSON sont embarqués par import (`with { type: "json" }`) dans `P/moteur/registre.ts`, `P/moteur/contrats.ts` et `P/moteur/gabarits.ts`, comme `P/serveur/regles-promesses.ts:9`. Le `rootDir` du `tsconfig` (`.`) ne les refuse pas : `resolveJsonModule` est actif, `noEmit` aussi, et `npx tsc --noEmit -p .` ne signale aucune erreur de ce type (esbuild les inclut dans le paquet).
3. **Tâche 3** : `revuesImposees` a besoin d'un résolveur de `{{agent:...}}` (`P/serveur/services.ts:2098-2101`). `controlerPorte` et `poserPorte` exigent une `RequeteRoute` : passer par `base.creerPorte` et `issues.update`. Une porte exige une campagne (`NOT NULL`).
4. **Tâche 5** : le démarrage seul ne rattrape pas un événement perdu worker actif : même passe sur minuterie, comme le veilleur (`P/worker.ts:32-39`). `moteurMissions` se lit par entreprise (`P/worker.ts:27`).
5. **Tâche 2** : `enregistrerExecution` dit si la clé est neuve ; colonnes en plus : `etat_avant_pause`, `type`, `statut`, `diffusion_id`.

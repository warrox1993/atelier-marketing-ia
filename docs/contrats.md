# Contrats partagés de l'Atelier Marketing IA (v1, gelés à T0 ; version courante 1.5)

Date : 15/10/2026. Propriétaire : intégrateur (lot A). Toute modification d'un fichier
de `plugin-atelier/src/contrats/` ou de ce document passe par l'intégrateur ; les lots B
et C ne les modifient pas.

## 1. Décision d'architecture : plugin officiel (option A)

- Décision de l'opérateur du 15/10/2026 : l'extension est un **plugin Paperclip officiel**.
  L'amont qualifie le système de plugins d'« alpha surface »
  (`paperclip/doc/plugins/PLUGIN_AUTHORING_GUIDE.md:5,85`). **Choix explicite de l'opérateur, limité au système de plugins de ce projet.** Aucun autre
  réglage expérimental n'est activé ; les défauts du tag stable sont conservés
  (embedded-postgres, réglages expérimentaux actifs par défaut).
- Ce qu'un plugin ne peut pas faire est assuré par un **patch serveur isolé**
  (`paperclip/server/src/atelier/`, exporté dans `socle/patches/`) :
  - **P1** : un agent ne peut ni retirer ni modifier la politique de relecture
    (`executionPolicy` à étapes) d'une tâche ;
  - **P2** : porte déterministe ; le serveur refuse, sous verrou de ligne, tout passage
    d'une tâche sous porte vers l'étape d'approbation humaine ou vers `done` sans
    évaluation de porte `PASS`, fraîche, portant sur la révision courante du livrable ;
    v1.5 (patch `0007`) : `done` exige en plus un humain authentifié, l'étape d'approbation
    native et une décision « approuver » valide sur la révision courante ; le livrable est
    verrouillé pendant l'approbation (§14) ;
  - **régulateur** : au plus N runs actifs par entreprise (3 par défaut).
- Pourquoi : le SDK n'offre aucun crochet de veto avant transition
  (`packages/plugins/sdk/src/define-plugin.ts`) ; un plugin n'est donc pas une garantie.

## 2. Emplacement et installation

- Code : `plugin-atelier/` dans le dépôt enveloppe (généré par
  `pnpm paperclipai plugin init @atelier/plugin-atelier`, méthode documentée dans
  `paperclip/doc/plugins/LOCAL_PLUGIN_DEVELOPMENT.md`).
- Le SDK et `@paperclipai/shared` sont des archives `pnpm pack` du socle épinglé, dans
  `plugin-atelier/.paperclip-sdk/` (non versionnées ; `pnpm pack` est reproductible :
  même SHA-256, vérifié le 15/10/2026 ; le lockfile contrôle leur intégrité).
- Préparation : `scripts/preparer-plugin.sh` (empaquette le SDK, `pnpm install
  --frozen-lockfile`, typecheck, tests, build).
- Installation dans l'instance (serveur lancé) :
  `cd paperclip && pnpm paperclipai plugin install --local <chemin absolu>/plugin-atelier`.
  Une installation locale exécute du code local de confiance (doc amont).
- Identifiant : `atelier.marketing-ia`. Routes : `/api/plugins/atelier.marketing-ia/api/*`.

## 3. Persistance : espace de base du plugin (schéma séparé)

- Schéma PostgreSQL `plugin_atelier_f0322cc62c`, dérivé par l'hôte de la clé du plugin
  (`derivePluginDatabaseNamespace`), migrations SQL appliquées par l'hôte avant le
  démarrage du worker, sommes de contrôle enregistrées, migrations déjà appliquées
  immuables (`server/src/services/plugin-database.ts`).
- Pourquoi pas `ctx.state` ni `ctx.entities` : stockage clé-valeur JSON sans clé étrangère,
  sans requête relationnelle ni contrôle d'unicité ; le serveur patché (P2, régulateur) doit
  lire des lignes précises sous verrou de transaction.
- Liaison : chaque ligne porte `company_id` et l'identifiant natif lié (`issue_id`,
  `project_id`, `revision_id`, `run_id`), avec clés étrangères vers `public.companies`,
  `public.projects`, `public.issues`. **Aucune copie du statut d'une tâche** : les statuts
  fonctionnels sont calculés à la lecture (§5).
- Limites de l'hôte : SQL d'exécution restreint à `SELECT` (lecture, jointures sur les tables
  publiques déclarées) et à un seul `INSERT`/`UPDATE`/`DELETE` par appel dans le schéma ;
  pas de transaction multi-requêtes. Conséquence : identifiants générés par le worker,
  concurrence optimiste par `UPDATE … WHERE`, fraîcheur de la porte vérifiée par horodatage.
- Tables (migration `plugin-atelier/migrations/001_atelier_socle.sql`) : `reglages_entreprise`,
  `campagnes`, `briefs`, `exigences`, `portes`, `couvertures`, `verdicts`, `constats`,
  `evaluations_porte`, `messages`, `sources`, `imports`, `decisions_humaines`, `diffusions`,
  `journal`, `marques`, `planifications`, `mesures` ; `relances_correction` (migration 002) ; migration 003 :
  colonnes de plafond publicitaire sur `reglages_entreprise` et `campagnes` (§12) ; migration 004 : colonnes
  `service`, `outil`, `indices_mode`, `chiffres`, `mode_campagne` sur `sources` (§13).

### Colonnes lues par le serveur patché (contrat P2 et régulateur, gelé)

| Table | Colonnes | Usage serveur |
| --- | --- | --- |
| `portes` | `issue_id`, `actif`, `cle_livrable`, `modifie_le` | la tâche est-elle sous porte, quel document |
| `evaluations_porte` | `issue_id`, `revision_id`, `decision`, `perimee`, `entrees_jusqu_a`, `cree_le` | dernière évaluation |
| `couvertures`, `verdicts`, `constats` | `issue_id`, `modifie_le` | fraîcheur |
| `exigences` (jointure `portes.campagne_id`) | `modifie_le` | fraîcheur |
| `sources` (v1.5) | `issue_id`, `date_collecte` | fraîcheur (M3) |
| `decisions_humaines` (v1.5) | `issue_id`, `revision_id`, `action`, `invalidee`, `cree_le` | `done` : dernière décision non invalidée de la révision courante = `approuver` (H2) |
| `reglages_entreprise` | `company_id`, `max_runs_actifs` | plafond de runs |

Tables natives écrites par P2 (v1.5) : `documents.locked_at`, `locked_by_agent_id`, `locked_by_user_id`
(colonnes du verrou natif `lockIssueDocument`), seulement pour le document du livrable d'une tâche sous
porte active (§14).

Le serveur trouve le schéma par `plugin_database_namespaces.plugin_key = 'atelier.marketing-ia'`.

## 4. Schémas Zod (`plugin-atelier/src/contrats/`)

| Fichier | Contenu |
| --- | --- |
| `identifiants.ts` | `PLUGIN_ID`, `ESPACE_BASE`, `CLE_LIVRABLE_DEFAUT = "livrable"`, `MENTION_DEMONSTRATION`, `LIMITES` |
| `communs.ts` | `IdNatif` (UUID), `Horodatage` (ISO UTC), `ModeExecution`, `EtatConnexion` (6 états du §3), `Acteur`, `CodeExigence` (`REQ-001`), `RoleRevue` (`exigences`, `metier`, `technique`) |
| `exigences.ts` | `Brief`, `Exigence` (code stable, texte d'origine, interprétation, obligatoire, critères, dépendances, éléments attendus, exclusion), `EtatCouverture` (`non_traite`, `partiel`, `couvert`, `bloque`, `na_justifie`), `Preuve` (révision, emplacement, élément, extrait), `Hypothese`, `DeclarationCouverture` |
| `revues.ts` | `Verdict` (`PASS`, `CHANGES_REQUESTED`, `BLOCKED_INFORMATION`, `NOT_APPLICABLE_JUSTIFIED`), `Constat` (findingId, reviewer, artifactVersion, requirementIds, catégorie, gravité, emplacement, description, preuve, correction attendue, statut de résolution), `VerdictRevue`, `DeposerVerdictEntree` (cohérences : PASS sans constat bloquant, CHANGES_REQUESTED avec constat, NA justifié) |
| `porte.ts` | `TacheSousPorte`, `MettreSousPorteEntree`, `EvaluationPorte` (décision `PASS`/`REFUS`/`BLOQUE_INFORMATION`, motifs codés, empreinte SHA-256, fraîcheur), `CodeMotifPorte` ; v1.4 : `MotifPorte.emplacement` et `MotifPorte.sourceId` |
| `statuts.ts` | `StatutFonctionnel` (13 états du §10), libellés français, `calculerStatutFonctionnel()` |
| `messages.ts` | `MessageAgent` (messageId, companyId, projectId, campaignId, runId, taskId, sender, recipient, type, contenu, références, horodatage, état de traitement), `TypeMessage` (10 types), `ContenuMessage` (union discriminée), `EnvoyerMessageEntree` (strict : aucun expéditeur ni champ d'élévation accepté) |
| `sources.ts` | `Source` (URL, date de collecte, statut d'accès, extrait, indices de page d'erreur, `nonFiable: true`, injections signalées ; v1.4 : provenance `connexion` et détail `connexion`), `DeposerDonneesConnexionEntree` (v1.4), `ResultatVerificationLien`, `ImporterDocumentEntree`, `DocumentImporte` |
| `dossier.ts` | `ApprobationPortee` (révision, action, canal, compte, audience, montant, durée), `DecisionHumaine`, `Diffusion` (état séparé de la tâche, clé d'idempotence ; v1.5 : `service`, `outil`, `preuveApprobation`), `DossierHumain` ; v1.5 : action externe `modifier_crm`, `ServicePublication`, `DemanderDiffusionEntree` (`service`, `outil`, `arguments`), `RapporterIssueDiffusionEntree` |
| `campagnes.ts` | `Campagne` (= projet natif), `TacheCampagne`, `ReglagesEntreprise`, `Connecteur`, `EvenementJournal`, `PageJournal`, `Diagnostic` |
| `routes.ts`, `api.ts` | table des routes et corps des requêtes |
| `ui-constantes.ts`, `ui.ts` | emplacements UI, rubriques, clés de données et d'actions |
| `exemples/index.ts` | une réponse d'exemple par clé de données, validée par test |

## 5. Statuts fonctionnels (cahier §10) calculés depuis l'état natif

| Statut | Condition native (aucun enum amont modifié) |
| --- | --- |
| `queued` | `backlog`, ou `todo` non affectée |
| `ready` | `todo` affectée sans bloqueur, ou `in_progress` sans run actif |
| `running` | run natif actif sur la tâche |
| `awaiting_review` | `in_review`, étape `review`, participant agent |
| `changes_requested` | `in_progress` et `executionState.status = changes_requested` |
| `blocked_information` | `blocked` sans bloqueur ni pause budget, ou escalade humaine d'une étape `review` |
| `blocked_dependency` | bloqueurs natifs non résolus |
| `blocked_budget` | agent assigné en pause pour budget |
| `ready_for_human` | `in_review`, étape `approval` (porte franchie, vérifiée par P2) |
| `approved` | `done` d'une tâche sous porte ET décision humaine « approuver » non invalidée sur la révision courante (v1.5, H2) ; sans elle : `blocked_information` (« terminée sans approbation humaine valide ») |
| `completed` | `done` hors porte |
| `failed` | dernier run en échec, tâche non terminée |
| `cancelled` | `cancelled` |

L'état du livrable (révisions natives du document `livrable`) et l'état de diffusion
(table `diffusions`) sont distincts de l'état de la tâche.

## 6. Routes JSON (agents et humains)

Base : `/api/plugins/atelier.marketing-ia/api`. L'hôte authentifie (jeton de run pour
un agent), résout l'entreprise, vérifie l'accès (403 hors entreprise) avant le worker.

| Clé | Méthode et chemin | Auth | Entreprise résolue par | Corps / réponse |
| --- | --- | --- | --- | --- |
| `tache.contexte` | GET `/taches/:issueId/contexte` | board ou agent | tâche | contexte complet de la tâche (brief, exigences, livrable, revues, constats, boîte) |
| `tache.couverture` | POST `/taches/:issueId/couverture` | board ou agent (producteur assigné, checkout exigé en `in_progress`) | tâche | `DeclarerCouvertureEntree` → `{ couvertures, revues: [{ role, issueId, identifier, statut }], cyclesConsommes, cyclesEpuises }` (crée les tâches de revue liées de la révision, §6 bis) |
| `tache.planification` | POST `/taches/:issueId/planification` | board ou agent | tâche | `PlanifierEntree { canal, dateProposee }` → date PROPOSÉE (jamais une programmation réelle) |
| `tache.verdict` | POST `/taches/:issueId/verdicts` | board ou agent désigné pour le rôle, jamais le producteur | tâche | `DeposerVerdictEntree` → `VerdictRevue` |
| `tache.porte.evaluer` | POST `/taches/:issueId/porte/evaluer` | board ou agent **participant d'une étape de revue native de la tâche** (v1.5, M5 : `role_non_autorise` sinon) | tâche | → `EvaluationPorte` |
| `tache.porte.lire` | GET `/taches/:issueId/porte` | board ou agent | tâche | → `EvaluationPorte \| null` |
| `tache.dossier` | GET `/taches/:issueId/dossier` | board ou agent | tâche | → `DossierHumain` |
| `tache.messages.envoyer` | POST `/taches/:issueId/messages` | board ou agent | tâche | `EnvoyerMessageEntree` → `MessageAgent` |
| `tache.messages.boite` | GET `/taches/:issueId/messages` | board ou agent | tâche | → `MessageAgent[]` adressés à l'appelant |
| `tache.messages.etat` | POST `/taches/:issueId/messages/:messageId/etat` | destinataire | tâche | `{ etat }` → `MessageAgent` |
| `tache.sources.lire` | POST `/taches/:issueId/sources` | board ou agent | tâche | `LireUrlEntree` → `Source` |
| `tache.donnees.deposer` | POST `/taches/:issueId/donnees-connexion` | board ou agent | tâche | `DeposerDonneesConnexionEntree` (v1.5 : `arguments` facultatif) → `{ source, mode, indices, chiffresRetenus, interdite, consigne }` (v1.4, §13 ; signature vérifiée v1.5, §14) |
| `tache.liens.verifier` | POST `/taches/:issueId/liens/verifier` | board ou agent | tâche | `VerifierLiensEntree` → `ResultatVerificationLien[]` |
| `tache.diffusions` | POST `/taches/:issueId/diffusions` | board ou agent | tâche | `DemanderDiffusionEntree` → `Diffusion` ; 403 `diffusion_refusee` sans décision humaine valide, ou si la même publication est déjà diffusée sous cette approbation (v1.5, M1) ; en réel, `preuveApprobation` signée quand tout est vérifié (v1.5, §14) |
| `tache.diffusions.issue` | POST `/taches/:issueId/diffusions/:diffusionId/issue` | board ou agent | tâche | `RapporterIssueDiffusionEntree` (réponse brute de l'outil, signée par la passerelle) → `Diffusion` (`confirmee`, `ambigue_a_reconcilier`, ou `preparee` avec le motif) (v1.5) |
| `tache.decision` | POST `/taches/:issueId/decisions` | **board seulement** | tâche | `DeciderEntree` → `DecisionHumaine` |
| `portes.creer` | POST `/portes` | board ou agent | corps `companyId` | `MettreSousPorteEntree` → `TacheSousPorte` ; v1.5 (H2) : la politique native doit avoir une étape `review` et se TERMINER par une étape `approval` dont tous les participants sont des utilisateurs |
| `campagnes.creer` | POST `/campagnes` | board | corps | `CreerCampagneEntree` (avec `projectId` du projet natif créé avant par `POST /api/companies/:companyId/projects` : le SDK ne crée pas de projet) → `Campagne` |
| `campagnes.lister` | GET `/campagnes?companyId=` | board ou agent | requête | → `Campagne[]` |
| `campagnes.exigences` | POST `/campagnes/:campagneId/exigences` | board ou agent coordinateur (**création seulement**, v1.5, H1) | corps | `EnregistrerExigencesEntree` → `Exigence[]` ; un agent qui modifie une exigence existante : `elevation_refusee`, rien n'est écrit ; un affaiblissement par l'humain est tracé (`exigence.affaiblie`) |
| `exigences.exclusion` | POST `/exigences/:exigenceId/exclusion` | agent : `demander` ; board : `autoriser`/`refuser` | corps | `ExclusionEntree` → `Exigence` |
| `imports.creer` | POST `/imports` | board ou agent | corps | `ImporterDocumentEntree` → `DocumentImporte` |
| `journal.lire` | GET `/journal?companyId=&afterSeq=` | board ou agent | requête | → `PageJournal` |
| `sante` | GET `/sante?companyId=` | board ou agent | requête | → `Diagnostic` |
| `reglages.enregistrer` | POST `/reglages` | board | corps | `EnregistrerReglagesEntree` → `ReglagesEntreprise` |

Erreurs : `{ erreur, code, details? }`, codes stables dans `CODES_ERREUR` (`api.ts`).

### 6 bis. Circuit de revue (version 1.1 du 15/10/2026, imposée par le moteur)

Constat sur l'instance réelle : la récupération native relance une fois puis BLOQUE une étape de
revue dont le participant termine son run sans décision
(`server/src/services/recovery/service.ts`, « execution-review participant »). Une porte qui
attendrait ses relecteurs PENDANT l'étape est donc incompatible avec le moteur. Circuit retenu :

1. le producteur écrit la révision N du document `livrable` et déclare sa couverture ;
2. le plugin crée une tâche de revue liée par rôle requis (enfant de la tâche, origine
   `plugin:atelier.marketing-ia:revue`, `originId = <tâche>:<révision>:<rôle>`, idempotente),
   affectée au relecteur désigné ; le producteur passe sa tâche `blocked` par ces revues
   (bloqueurs natifs) ;
3. chaque relecteur dépose son verdict structuré sur la tâche parente puis clôt sa revue ; la
   dernière clôture réveille le producteur (réveil natif « bloqueurs résolus ») ;
4. corrections si nécessaire (nouvelle révision, nouvelles revues) ; sinon le producteur demande
   `done` : l'étape native unique de revue est tenue par l'agent déterministe « Porte de
   contrôle », qui évalue et décide DANS son run (PASS → `done` → étape d'approbation humaine,
   sinon retour au producteur) ; P2 revérifie côté serveur ;
5. cycles de correction : révisions antérieures ayant reçu un `CHANGES_REQUESTED` ou un REFUS ;
   au-delà du maximum, plus de nouvelles revues et escalade explicite vers l'humain.

Règle relâchée : un `CHANGES_REQUESTED` exige un constat nouveau OU un constat bloquant du même
rôle encore ouvert (vérifié par le service), pour ne pas dupliquer un problème déjà signalé.

Pour l'interface (lot C) : la décision humaine se fait en deux appels, d'abord l'action
`atelier.decision` (portée liée à la révision), puis l'approbation native
`PATCH /api/issues/:id { status: "done", comment }` par le board (P2 la revérifie). Une demande
de correction : `atelier.decision` puis `PATCH { status: "in_progress", comment }`. Un rejet :
`atelier.decision` seul (v1.2) : le worker annule lui-même la tâche native avant d'enregistrer
la décision (§11).
`atelier.campagne.pause` et `.reprendre` renvoient `non_implemente` : Paperclip ne met un projet
en pause que par budget et le SDK n'expose pas cette action (désactiver le bouton avec la raison).

## 7. Contrat de l'interface (lot C)

- **Dossier du lot C** : `plugin-atelier/src/ui/**` et `plugin-atelier/tests/ui/**`.
  Le lot C ne modifie ni `src/contrats/`, ni `src/serveur/`, ni `src/manifest.ts`, ni
  `migrations/`, ni le lockfile (ajout de dépendance : demande à l'intégrateur).
- **Exports obligatoires** de `src/ui/index.tsx` (`EXPORTS_UI`) :
  `PageAtelier` (page, route `/:prefixeEntreprise/atelier`), `NavigationAtelier`
  (`routeSidebar` de la même route : les six rubriques), `EntreeAtelier` (entrée de la barre
  latérale), `OngletAtelierTache` (onglet sur une tâche native : dossier et décision),
  `WidgetAtelier` (tableau de bord). Props : types `Plugin*Props` de `@paperclipai/plugin-sdk/ui`.
- **Rubriques** (`RUBRIQUES`) : `equipe`, `campagnes`, `contenus`, `calendrier`,
  `resultats`, `marque`.
- **Lecture** : `usePluginData(cle, params)` avec une clé de `DONNEES_UI` ; l'hôte ajoute le
  `companyId` autorisé. **Actions** : `usePluginAction(cle)` avec une clé de `ACTIONS_UI` ;
  celles marquées `humainSeulement` sont refusées côté worker pour un agent.
- **Données d'exemple** : `EXEMPLES_DONNEES` (`src/contrats/exemples/index.ts`), une par clé,
  validées par `tests/contrats.spec.ts`. Tant que les routes ne sont pas servies, le lot C
  s'en sert dans ses tests (jsdom, comme `paperclip/packages/plugins/plugin-llm-wiki/tests`).
- **Rattrapage** : à la reconnexion, relire `atelier.journal` avec `afterSeq` = dernier `seq`
  connu ; ne jamais animer une activité sans événement réel.
- Règles : interface en français, dates affichées en Europe/Brussels (stockage UTC), mention
  de démonstration visible sur tout résultat de démonstration, six états de connexion
  distincts, états vide/chargement/erreur/accès absent/interrompu/périmé, clavier, mobile,
  clair et sombre ; démarche Impeccable (critique, typeset, layout, polish), aucun tiret
  cadratin. L'interface d'un plugin n'est pas isolée (même origine) : aucune clé ni secret
  côté navigateur.

## 8. Démonstration (agents `process`)

- Script déterministe : `plugin-atelier/demo/agent-demo.mjs <rôle> <scénario>`, lancé par
  l'adaptateur natif `process` avec `cwd` = dossier du plugin et un chemin **relatif** (aucun
  chemin absolu dans `args`, pour des exports propres).
- Tout résultat de démonstration porte `MENTION_DEMONSTRATION`.

## 9. Évolution des contrats

Version v1 ; ajouts compatibles v1.1 à v1.5 (§6 bis, §11, §12, §13, §14). Ajout compatible (champ optionnel, nouvelle clé) : l'intégrateur met à jour ce
document, les schémas et les exemples dans le même commit. Changement incompatible : nouvelle
migration numérotée, jamais de modification d'une migration appliquée (l'hôte la refuserait).

## 10. Réponses de l'intégrateur aux besoins du lot C (`docs/besoins-lot-c.md`)

| Besoin | Réponse (15/10/2026) |
| --- | --- |
| B-1 code d'erreur | Fait : tout message d'erreur des données et actions commence par `[code] ` (codes de `CODES_ERREUR`). Exemple : `[revision_perimee] La décision doit viser la révision courante du livrable.` (`src/serveur/atelier.ts`, `avecCode`). |
| B-2 transition native | **Mis à jour le 15/10/2026 (v1.2) pour « rejeter »** : le worker annule la tâche native (`ctx.issues.update(..., { status: "cancelled" })`) AVANT d'enregistrer la décision, puis ajoute le commentaire ; un refus du serveur n'enregistre rien. Vérifié sur instance (scénario G). Approuver et demander une correction restent en deux temps, par preuve : la mise à jour de tâche par un plugin appelle directement le service, SANS la transition de politique d'exécution (`paperclip/server/src/services/plugin-host-services.ts`, `issues.update`) ; l'étape d'approbation ne serait pas enregistrée comme décidée. L'interface garde donc `atelier.decision` puis `PATCH /api/issues/:id` par le board : `done` (approuver), `in_progress` (demander une correction), `cancelled` (rejeter : le board, participant de l'étape d'approbation, clôt l'exécution). P2 revérifie `done` côté serveur. |
| B-3 pause | Confirmé : non disponible (limite du socle), boutons désactivés avec la raison. |
| B-4 scénario B bloqué | Cause : premier run du producteur en erreur avec l'ancienne version de l'agent (mise sous porte refusée), puis relance « status-only » de Paperclip qui n'a pas le droit d'écrire un document. Corrigé côté démonstration (circuit 1.1) ; sur l'instance du lot A, B atteint « prêt pour validation humaine » (voir `REPRISE.md`). Rejouer avec le `demo/agent-demo.mjs` actuel. |
| B-5 compétences réelles | Fait : `atelier.equipe` renvoie `source: "dernier_run"` avec l'empreinte SHA-256 quand le moteur patché a consigné l'inventaire du run (`context_snapshot.atelierCompetences`) ; sinon `configuration`. Les agents `process` de démonstration n'ont pas de compétences : seul un run `claude_local` réel le montrera. |
| B-6 libellés | Fait : `LIBELLES_EVENEMENTS` et `libelleEvenement(type)` dans `src/contrats/ui-constantes.ts` ; `atelier.chronologie` renvoie le libellé français. |
| B-7 calendrier | Fait : action `atelier.planification` `{ issueId, canal, dateProposee }` (humain seulement) ; `publicationProgrammee` reste `null` sans connecteur. |
| B-8 horodatages | Fait : sérialisation ISO 8601 UTC dans le worker (`iso`, `src/serveur/base.ts`), y compris depuis la forme texte de PostgreSQL. |

## 11. Version 1.2 (15/10/2026) : décisions de l'opérateur sur les livrables non conformes

- **Aucun livrable qui n'a pas passé les contrôles n'est accepté ni diffusé.** Action
  `atelier.correction.relancer` (humain seulement : refus `elevation_refusee` par le pont ET par
  le service), entrée stricte `RelancerCorrectionEntree` (`dossier.ts`) : `issueId`,
  `commentaire` obligatoire, au moins un levier parmi `information` `{ question?, reponse }`
  (source de provenance `humaine`), `consigne`, `escalade` `{ agentId, avant, apres }` (palier
  suivant de `palierSuivant`, `escalier.ts`, appliqué d'abord par `PATCH /api/agents/:id` depuis
  l'interface, vérifié ensuite par le worker), `versionCorrigee` `{ revisionId }` : l'humain écrit
  d'abord la révision par l'API native (`PUT /api/issues/:id/documents/livrable` avec
  `baseRevisionId`) ; le worker vérifie qu'elle est courante, écrite par un humain et jamais
  refusée. Raison mesurée : l'hôte refuse l'écriture d'un document existant par un plugin
  (`ctx.issues.documents.upsert` ne transmet pas `baseRevisionId`, `plugin-host-services.ts`). Conditions : porte active, tâche ni terminée, ni annulée, ni en revue native,
  cycles épuisés, aucun run en cours. Effets : ligne `relances_correction` (migration `002`),
  maximum effectif = cycles consommés + maximum de départ, événement `correction.relancee`,
  commentaire natif, tâche renvoyée au producteur (`todo`, bloqueurs retirés, réveil natif).
  Résultat : `RelanceCorrection`. Aucun champ « accepter malgré les défauts ».
- `atelier.porte.lever` est **retirée** : elle désactivait la porte, donc P2, et permettait de
  clore la tâche sans évaluation `PASS`. Un changement de critère reste une opération séparée
  et tracée (exigences, exclusions).
- `DossierHumain` gagne `cycles`, `relances`, `producteur`, `interruption`, `connecteurPublication` (valeurs
  par défaut : compatibles) ; `tache.contexte` gagne `cyclesMaximum` et `relances`.
- Rejet : voir §10, B-2. Diffusion : bouton « Diffuser » de l'interface, désactivé en réel
  (« aucun connecteur de publication »), simulé en démonstration après approbation (la règle
  serveur existante refuse toute diffusion non couverte).
- **Reprendre après interruption** (interface, humain seulement) : quand le dernier run d'une
  tâche bloquée est `interrupted`, le dossier expose `interruption` (run, révisions, couvertures,
  diffusions constatées) ; le bouton « Reprendre » envoie la réconciliation native
  `POST /api/issues/:id/recovery-actions/resolve` (`outcome: restored`, `sourceIssueStatus: todo`,
  `executionReconciliation`), seule voie qui relance le travail (Paperclip ne rejoue rien).
- Commentaires natifs de relance et de rejet signés par le plugin (l'attribution à un humain
  exigerait la capacité `issue.comments.create_human_attributed`) ; l'humain est nommé dans le texte.

## 12. Version 1.3 (15/10/2026) : plafonds de dépenses choisis par le client

Décision de l'opérateur du 15/10/2026 : pour l'argent réel, le CLIENT choisit un montant maximal OU « aucune
limite », pour les coûts IA et pour les dépenses publicitaires. Implémentation :
`src/contrats/plafonds.ts`, `src/serveur/regles-plafonds.ts` (règles pures), migration
`003_plafonds_publicitaires.sql`.

**Coûts IA : budgets natifs de Paperclip, aucun budget parallèle.** Lecture faite dans
`paperclip/server/src/services/budgets.ts` : le montant est un entier de centimes, **0 signifie « aucune
limite »** (`amount > 0` conditionne la politique active, `upsertPolicy` : `isActive = amount > 0`,
`budgetStatusFromObserved` renvoie `ok` si `amount <= 0`). Routes natives : `PATCH
/api/companies/:id/budgets` et `PATCH /api/agents/:id/budgets` avec `{ budgetMonthlyCents }`
(board seulement). L'interface (Paramètres, « Coûts IA ») les appelle ; l'action `atelier.budget-ia.tracer`
(humain seulement) relit ensuite la valeur réelle côté Paperclip (`ctx.companies.get`, `ctx.agents.get`)
et la journalise (`budget_ia.modifie`) avec l'activité native.

**Dépenses publicitaires : plafond par campagne et pour l'entreprise.** Avant, le plafond n'était
qu'une valeur informative : `campagnes.budget_max_cents` (contrats `Campagne` et `CreerCampagneEntree`,
nullable, jamais appliquée), `Diffusion.montantCents` (aucun contrôle de cumul), `regles-diffusion.ts`
(montant approuvé par demande) et le « 1 500 € » de la démonstration (`organisation/demo/
brief-campagne-printemps.md`, exemple `budgetMaxCents: 150000`). Il devient un réglage optionnel :

| État | Représentation | Effet serveur |
| --- | --- | --- |
| aucun choix | `plafondPub: null` | si ni la campagne ni l'entreprise n'ont choisi : toute approbation ou diffusion payante est refusée |
| montant | `{ type: "montant", montantCents }`, strictement positif (0 refusé : confondu avec « illimité » natif) | approbation ou diffusion refusée si dépensé + réservé dépasse la limite |
| aucune limite | `{ type: "aucune_limite" }` | aucun garde-fou global, **l'approbation reste exigée** |

- Entrée : `PlafondEntree` ; enregistré : `PlafondPub` (+ `decidePar`, `decideLe`). Les deux niveaux
  s'appliquent ensemble : un plafond d'entreprise limite aussi une campagne « sans limite ».
- `CreerCampagneEntree.plafondPub` (humain seulement) ; l'ancien `budgetMaxCents` > 0 équivaut à un
  montant (0 refusé). `Campagne` gagne `plafondPub`, `engagementPub` (`budgetMaxCents` = montant ou null) ;
  `ReglagesEntreprise` gagne `plafondPub` et `engagementPub` ; `EnregistrerReglagesEntree.plafondPub`
  (`null` retire le choix, absent = inchangé).
- Routes et actions : `POST /campagnes/:campagneId/plafond` (board) et action `atelier.campagne.plafond`
  `{ campagneId, plafondPub }` ; `atelier.reglages.enregistrer` avec `plafondPub` ; toutes
  `humainSeulement`, revérifiées dans le service (`peutModifierPlafond` : humain authentifié ; refus
  `elevation_refusee` pour un agent). Un plafond inférieur au montant déjà engagé est refusé (`conflit`).
- **Montant engagé** = dépensé (diffusions non refusées) + réservé (part non diffusée des approbations
  valides, c.-à-d. la décision la plus récente non invalidée de sa révision). Une approbation
  `activer_campagne_payante` exige montant maximal > 0, canal et durée (`entree_invalide` sinon) et est
  refusée (`conflit`, journal `approbation.refusee_plafond`) si l'engagé après elle dépasse un plafond.
  Une diffusion est refusée (403, motif enregistré) au-delà du plafond, et le montant approuvé est un
  **total** par décision (cumul des diffusions : changement par rapport à la v1.2, où il valait par demande).
  `verifierDiffusion` exige aussi la durée pour une dépense.
- Les approbations et diffusions d'une même entreprise sont sérialisées dans le worker (verrou en
  mémoire : la base du plugin n'a pas de transaction).
- Journal : `plafond.modifie` (portée, avant, après, acteur ; rattaché à la tâche de brief pour la
  chronologie), `budget_ia.modifie`, `approbation.refusee_plafond`, `diffusion.refusee`.
- `atelier.resultats` gagne `plafondsPub` (entreprise et campagnes face à l'engagé) et
  `coutsIa.moisCents` / `budgetMensuelCents`.

## 13. Version 1.4 (15/10/2026) : garde des données simulées (lot L9)

Spécification : `docs/connecteurs-conception.md` §6.5 et §7 (L9). Règles pures :
`src/serveur/regles-donnees-demo.ts` ; branchement : `porte.ts` (`EntreesPorte.donneesDemo`), `services.ts`
(route, évaluation, diffusion) ; migration `004_sources_connexion.sql` ; tests `regles-donnees-demo.spec.ts`
(règles, porte, diffusion) et `donnees-connexion.spec.ts` (route, service et SQL de `base.ts`) ; scénario K.

**Constat de départ (vérifié dans le code le 15/10/2026).** Un agent `claude_local` reçoit les outils de la
passerelle par une connexion MCP native ; le worker du plugin ne voit ni ces appels ni ces connexions (aucun
client « connexions » dans le SDK, tables `tool_*` absentes de la liste des tables publiques lisibles par un
plugin, `PLUGIN_DATABASE_CORE_READ_TABLES`, `packages/shared/src/constants.ts:1440`). Avant ce lot, aucune
route ne recevait une donnée de connexion : les sources venaient seulement de `tache.sources.lire` (lecture
faite par le plugin, mode fixé par le transport), de `imports.creer` (sans mode) ou d'une relance humaine ; les
chiffres n'étaient écrits que dans le texte du livrable.

**Route `tache.donnees.deposer`** (`POST /taches/:issueId/donnees-connexion`, board ou agent) :
- Entrée stricte `DeposerDonneesConnexionEntree` : `service`, `outil`, `reponse: { texte?, structuredContent? }`
  (la réponse BRUTE de l'outil). **Aucun champ `mode`** : il est refusé (`entree_invalide`).
- Le serveur déduit le mode (`deduireModeReponse`) : enveloppe `_atelier` de la passerelle (texte relu après la
  mention, ou données structurées), mention « Données de démonstration : aucune activité réelle » en tête,
  identifiants fictifs connus de la passerelle (`EMPREINTES_DEMONSTRATION` : `renovation-liege.example`,
  `000-000-0001`, `properties/100000001`…). Un seul indice suffit pour « démonstration » (une enveloppe falsifiée
  en `reel` sur des données fictives reste « démonstration ») ; enveloppes en désaccord : démonstration. **Sans
  enveloppe : refus** (« provenance inconnue », événement `donnees.refusees`).
- Enregistrement : table `sources`, provenance `connexion`, URL `connexion://<service>/<outil>`, extrait
  (4 000 caractères), empreinte SHA-256, injections signalées, `indices_mode`, `chiffres` (valeurs numériques hors
  identifiants et dates, montants en micros convertis, sommes et moyennes de chaque colonne de tableau ;
  2 000 au plus), `mode_campagne` (mode effectif au dépôt). Réponse : `Source` (champ `connexion`), `mode`,
  `indices`, `chiffresRetenus`, `interdite`, `consigne`.
- Une donnée de démonstration déposée dans une campagne réelle est **enregistrée** (trace), avec l'événement
  `donnees.demo_campagne_reelle` et une entrée d'activité native ; la porte et la diffusion la refusent ensuite.
- Tâche sous porte : la date de la porte avance (`portes.modifie_le`, lue par P2) et les évaluations sont
  périmées.
- `tache.contexte` gagne `donneesConnexion` (dépôts de la tâche et leur mode déduit) et `regleDonneesDemo`.

**Mode effectif** : réel si la campagne est réelle **ou** si l'entreprise est réglée en mode réel
(`reglages_entreprise.mode_par_defaut`) ; sinon démonstration.

**Porte** (deux nouveaux motifs, décision `REFUS`, cycle consommé ; `MotifPorte` gagne `emplacement` et `sourceId`) :
- `donnee_demo_sans_mention` (mode effectif démonstration, données de **connexion** de démonstration de la
  tâche) : un nombre du livrable qui reproduit un chiffre retenu (à l'arrondi affiché près, pourcentages compris,
  entiers de moins de deux chiffres ignorés), une citation de la source (adresse `connexion://…` ou identifiant)
  ou une preuve de couverture qui cite la source (`sourceIds`) doit se trouver dans un bloc (lignes contiguës :
  paragraphe, liste ou tableau) qui contient « démonstration », ou sous un titre de section qui le contient.
  Emplacement : `section « … », ligne N`. Filet : si rien n'est reconnu (calcul dérivé) et que le livrable ne
  contient nulle part « démonstration », motif sur le « livrable entier ».
- `donnee_demo_campagne_reelle` (mode effectif réel) : toute source de démonstration rattachée à la tâche, de
  toute provenance (connexion, corpus de démonstration), citée ou non (« sources de la tâche »), plus chaque bloc
  qui en reprend un chiffre ou la source, même étiqueté.
- 20 motifs au plus par règle. L'empreinte de la porte inclut les sources (identifiant, mode, provenance) et les
  preuves qui citent une source, seulement s'il existe des sources : les empreintes antérieures sont inchangées.

**Diffusion** : en campagne réelle, une demande est refusée (403, état `refusee`) si la tâche porte une donnée de
démonstration ou si le livrable en reprend une, avant tout autre contrôle ; motif « Données de démonstration
interdites dans une diffusion réelle : … ».

**Santé** (`atelier.sante`, `connexionsNecessaires`) : les cinq lignes figées (« Google Search Console »,
« Analytics », « Google Ads », « Fiche d'établissement », « CRM ») sont remplacées par les 11 services de la
passerelle, mêmes clés que `SERVICES_PASSERELLE` de l'interface (`gsc`, `ga4`, `ads`, `gbp`, `facebook`,
`instagram`, `linkedin`, `crm`, `pipedrive`, `odoo`, `teamleader`), état `non_connecte`, niveau du MODE RÉEL :
`implemente_non_teste` pour `gsc`, `ga4`, `ads`, `gbp` (fournisseurs Google réels du lot L4, commit `e5939f1`,
jamais exécutés contre Google), `non_implemente` pour les sept autres (aucun fournisseur réel dans
`passerelle/src/reel/`) ; le détail le dit et renvoie au tableau des connecteurs (connexions natives lues par
l'interface).

**Limites connues** : un chiffre dérivé autrement que par somme ou moyenne (ratio, écart, arrondi au millier)
n'est pas reconnu (le filet « livrable entier » s'applique alors) ; une coïncidence numérique peut exiger la
mention à tort (sans conséquence hors démonstration) ; les empreintes de démonstration sont recopiées de la
passerelle et doivent suivre ses fiches ; rien n'oblige un agent à déposer une réponse qu'il a reçue (le plugin
ne voit pas les appels d'outils : un contrôle de l'audit natif `tools/runs/:runId/decisions` demanderait l'accès
du worker à ces tables, refusé par l'hôte).

## 14. Version 1.5 (15/10/2026) : corrections de la revue indépendante et signatures de la passerelle

Sources : `docs/revue-independante.md` (constats H1 à B6, section « Suites données ») et
`docs/revue-securite-passerelle.md` §6 et §6 bis. Décisions de l'opérateur du 15/10/2026 : H1, B3, et « aucun livrable
qui n'a pas passé les contrôles n'est approuvé ni diffusé ; `done` sous porte exige une approbation humaine
réelle ». Migration `005_diffusions_preuve.sql` ; patch socle `0007`.

**Exigences (H1).** Un agent (le coordinateur) ne fait que CRÉER une exigence (`insert … on conflict do
nothing`) ; le renvoi identique d'une exigence existante est sans effet ; toute différence est refusée
(`elevation_refusee`, événement `exigence.modification_refusee`, aucune écriture du lot). L'humain peut tout
modifier ; un affaiblissement (passage en facultatif, retrait d'éléments attendus ou de critères, texte
d'origine changé) est journalisé `exigence.affaiblie` (avant, après, motifs, auteur) et dans l'activité native.
L'exclusion reste « demandée » par l'agent, autorisée par l'humain.

**Approbation humaine réelle (H2).** `portes.creer` exige une dernière étape `approval` tenue par des
utilisateurs. P2 (`vers_done`) refuse : un agent, un acteur sans utilisateur, une tâche hors de l'étape
d'approbation en attente, l'absence de décision « approuver » non invalidée sur la révision courante. Le
statut `approved` exige la même décision (`FaitsComplementaires.approbationValide`).

**Livrable figé (H3).** À l'entrée de l'étape d'approbation (transition autorisée par P2), le document du
livrable est verrouillé par le mécanisme natif (`documents.locked_at`, sans utilisateur ni agent : signature
du verrou de l'atelier) ; l'écriture native renvoie alors 409 « Document is locked ». Il est déverrouillé
quand la tâche quitte l'approbation ou `done` vers un état de travail (correction, réouverture), jamais pour
une annulation ; un verrou posé à la main par le board n'est jamais levé. P2 relit la révision courante
`for update of d` (ligne `documents`) : une écriture en cours est attendue. Si le livrable d'une tâche `done`
change quand même (déverrouillage par le board), le plugin rouvre la tâche (`todo`, producteur réaffecté et
réveillé), invalide l'approbation et trace `livrable.modifie_apres_approbation`.

**Diffusion (M1, B3).** `verifierDiffusion` reçoit obligatoirement `diffusionsAnterieures` (refus par prudence
sinon). Une action non payante n'est acceptée qu'une fois par (décision, action, canal, compte) hors refus ;
la clé d'idempotence rejoue la réponse d'origine. Le montant payant approuvé est un total PAR RÉVISION : tout
ce qui a été diffusé sur la révision, sous n'importe quelle décision, compte (règle de diffusion et réserve du
montant engagé).

**Fraîcheur (M3).** `tache.sources.lire` touche la porte et périme les évaluations d'une tâche sous porte ; un
changement de `modeParDefaut` touche toutes les portes de l'entreprise et périme toutes leurs évaluations ;
`sources.date_collecte` entre dans le calcul `greatest(...)` côté plugin et côté serveur. `reglages_entreprise.modifie_le`
n'y entre pas (il change aussi pour des réglages sans effet sur la porte).

**Cycles (M4, M5).** Quand les révisions déjà refusées atteignent le maximum effectif, `evaluerPorte` rend
`BLOQUE_INFORMATION` avec `cycles_epuises` (jamais `PASS`) et les verdicts sont refusés (`conflit`) jusqu'à une
relance humaine. Un refus ne consomme un cycle que s'il porte un motif de fond (`refusDeFond` : autre que
`revue_requise_absente`, `revue_sur_ancienne_version`, `cycles_epuises`). `tache.porte.evaluer` et l'action
`atelier.porte.evaluer` sont réservées à l'humain et à l'agent participant d'une étape de revue native.

**Autres.** M6 : `atelier.demo.reinitialiser` refusée si l'entreprise est réglée en réel ou garde une décision
ou une diffusion réelle. B1 : `Hypothese.autoriseePar` vidé pour un agent, égal à l'humain authentifié sinon.
B2 : `commentRequired` dans la signature P1. B4 : plafond contrôlé avant toute écriture des réglages. B5 :
revues cherchées par `originId` exact.

**Preuve d'approbation (§6 de la revue de sécurité).** Configuration du plugin par entreprise
(`instanceConfigSchema`, fixée par l'administrateur) : `approbationClePrivee` (référence `secret_ref` vers un
secret natif de Paperclip contenant la clé privée Ed25519 PEM PKCS#8 ; capacité `secrets.read-ref`, résolue à
chaque usage, jamais en cache, jamais journalisée) et `passerelleClesPubliques` (liste de clés publiques de la
passerelle, SPKI DER en base64). En mode réel, une diffusion acceptée est « préparée » et porte
`preuveApprobation` (`apv1`, format de `passerelle/src/reel/social-crm/approbation.ts`) seulement si :
`service`, `outil`, `arguments` fournis ; outil d'écriture connu, de ce service et de cette action (`publier` :
`facebook_publier`, `instagram_publier`, `linkedin_publier` ; `envoyer` : `facebook_envoyer_message` ;
`modifier_crm` : `crm_modifier_contact`, `pipedrive_modifier_personne`, `odoo_ecrire_lead`,
`teamleader_modifier_contact`) ; canal approuvé lié au service par table explicite ; compte approuvé non nul et
identique ; arguments exactement ceux du schéma de l'outil ; chaque texte publié (et lien, image) figure TEL
QUEL dans la révision approuvée, chaque valeur écrite au CRM aussi ; clé disponible. Charge : `v`, `cle`
(clé d'idempotence), `service`, `outil`, `empreinte` (SHA-256 du JSON canonique des arguments sans la preuve),
`compte`, `diffusion`, `decision`, `emis`, `expire` = min(émission + 7 jours, fin de l'approbation). Sinon :
« préparée » avec le motif. Jamais en démonstration, jamais pour `activer_campagne_payante`. La preuve n'est
ni stockée ni journalisée (journal `diffusion.preuve_signee` : service, outil, empreinte, compte, expiration).
Rejeu de la même clé : preuve re-signée pour la même charge après revérification ; autres arguments : `conflit`.
Issue (`tache.diffusions.issue`) : la réponse brute de l'outil doit être signée par la passerelle (`_atelier`),
en mode réel, du même service, du même outil, des mêmes arguments (empreinte), et pour `executee` ou
`ambigue_a_reconcilier` de la même clé d'idempotence ; `executee` → `confirmee`, `ambigue_a_reconcilier` →
même état, `preparee` ou erreur d'outil → reste `preparee` avec le motif ; transition à sens unique
(`UPDATE … WHERE etat IN …`).

**Signature de l'enveloppe au dépôt (§6 bis).** `deduireModeReponse` reçoit la vérification : une réponse dont
une enveloppe dit `reel` n'est acceptée que si CHAQUE structure retenue porte une signature `aev1` valide d'une
des clés configurées, avec la charge égale au mode, l'empreinte recalculée du contenu, le service et l'outil
déclarés, `erreur: false`, `emis` pas dans le futur (120 s) et pas plus vieux que 7 jours, et, si le dépôt
déclare `arguments`, la même empreinte d'arguments. Sinon : refus (`entree_invalide`, « Réponse non signée par
la passerelle (ou modifiée) »). Sans clé configurée, aucune réponse n'est réelle. Une réponse de démonstration
non signée reste acceptée comme démonstration.


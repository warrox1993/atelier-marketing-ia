# Revue indépendante du plugin Atelier et des gardes du socle

Date : 15/10/2026. Relecteur : agent `expert` (Opus 5.5), sans participation à la construction.
Portée : `plugin-atelier/src/serveur/`, `plugin-atelier/src/contrats/`, `plugin-atelier/migrations/`,
`paperclip/server/src/atelier/` et ses raccords (`server/src/services/issues.ts`, `heartbeat.ts`).
Base lue : dernier commit (`2d78fc4` pour l'enveloppe, `41dfaed0d` pour `paperclip`, branche
`atelier-marketing`) ; aucun fichier du plugin ni du socle n'était modifié dans la copie de travail.
Revue en lecture seule : aucun fichier du dépôt modifié en dehors de celui-ci.

## Verdict

Le cœur de la porte tient : l'évaluation est déterministe, la fraîcheur comparée par PostgreSQL
résiste aux courses entre requêtes, une diffusion exige porte, décision humaine, révision courante
et statut `done`, et chaque lecture filtre par `company_id`. En revanche, **trois défauts graves
laissent un agent ou un simple ordre d'opérations contourner une règle du cahier** :

1. l'agent coordinateur peut rendre une exigence facultative et ainsi l'exclure sans décision humaine ;
2. rien n'oblige une tâche sous porte à avoir une étape d'approbation humaine : elle peut passer
   `done` sans humain, et l'interface l'affiche alors « Approuvée par l'humain » ;
3. une modification du livrable après `done` ne rouvre pas la tâche : elle reste « approuvée »
   sur une révision que personne n'a approuvée (et la garde P2 elle-même a une fenêtre de course
   avec l'écriture d'un document).

Aucun de ces trois défauts ne permet aujourd'hui une diffusion : la règle de diffusion revérifie
tout et rattrape les cas. Ils faussent en revanche l'état natif (tâche « done », bloqueurs levés,
statut affiché) et l'invariant « un agent ne peut jamais affaiblir une politique ».

Décompte : **3 hauts, 6 moyens, 6 bas** (15 constats). Confirmé = démontré par un test de
reproduction ou par une lecture certaine du code ; plausible = dépend d'un comportement de
l'hôte que je n'ai pas exécuté.

## Constats, du plus grave au moins grave

### H1. Un agent coordinateur peut rendre une exigence facultative et l'exclure sans humain (HAUT, confirmé)

- **Invariant violé** : « un agent ne peut jamais affaiblir une politique » ; l'exclusion d'une
  exigence obligatoire exige une décision humaine (`contrats/exigences.ts:13`).
- **Scénario** : la campagne a `REQ-002` obligatoire (« citer l'adresse de Seraing »,
  élément attendu `Seraing`). Le producteur ne la couvre pas, la porte refuse. L'agent
  coordinateur (assigné du brief) appelle `POST /campagnes/:id/exigences` avec
  `{ code: "REQ-002", obligatoire: false, elementsAttendus: [] }`. La route l'accepte, l'upsert
  remplace l'exigence (version + 1), les évaluations sont périmées, et la réévaluation de la
  **même révision** rend `PASS` sans aucun motif. L'état d'exclusion reste `aucune` : aucune trace
  de demande ni d'autorisation humaine.
- **Preuves** :
  - autorisation de l'agent : `plugin-atelier/src/serveur/services.ts:1201-1204` (seul contrôle :
    être l'assigné du brief) ; écriture : `services.ts:1210` ;
  - upsert qui remplace `obligatoire`, `elements_attendus`, `texte_original` :
    `plugin-atelier/src/serveur/base.ts:243-252` ;
  - une exigence facultative non couverte ne produit aucun motif :
    `plugin-atelier/src/serveur/porte.ts:144-149` et `153-157` ;
  - par contraste, l'exclusion passe par un humain : `services.ts:1224`.
- **Reproduction** : tests « R1 » et « R1 (service) » (voir la section Reproductions) : la porte
  passe de `REFUS` à `PASS`, et la route écrit `obligatoire = false` pour un acteur agent.
- **Correction proposée** : pour un acteur agent, n'accepter que la **création** d'exigences ;
  refuser toute modification qui affaiblit une exigence existante (obligatoire vers facultative,
  retrait d'un élément attendu, réécriture de `texte_original`), ou la transformer en demande
  d'exclusion soumise à l'humain. Plus simple encore : figer une exigence dès qu'une porte la cible,
  toute correction passant par l'humain (action `humainSeulement`).

### H2. Une tâche sous porte peut passer `done` sans aucune approbation humaine (HAUT, confirmé)

- **Invariant violé** : approbation humaine avant tout livrable « approuvé » ; état natif et état
  du plugin incohérents.
- **Scénario** : l'agent coordinateur crée la tâche de production (comme le fait
  `plugin-atelier/demo/agent-demo.mjs:176-182`) mais avec une politique `stages: [review]` seule,
  puis la met sous porte. `portes.creer` l'accepte, car il ne vérifie que la présence d'une étape
  `review`. Quand l'agent « Porte de contrôle » décide `done` après un `PASS`, P2 laisse passer
  (il ne contrôle que l'évaluation) et la tâche est `done` sans qu'aucun humain n'ait rien vu.
  L'interface calcule alors `approved`, libellé « Approuvée par l'humain », et les tâches qui
  dépendaient de celle-ci sont débloquées. Même effet, côté humain, si le board fait
  `PATCH status: done` après avoir enregistré `demander_correction` dans l'atelier : P2 ne lit
  pas la décision humaine.
- **Preuves** :
  - seule l'étape `review` est exigée : `plugin-atelier/src/serveur/services.ts:1127-1130` ;
  - P2 ne regarde que l'évaluation, ni l'acteur ni l'étape d'approbation :
    `paperclip/server/src/atelier/gardes-atelier.ts:85-98` et `117-133` ;
  - statut affiché : `plugin-atelier/src/contrats/statuts.ts:83-84` (`done` sous porte = `approved`,
    sans lecture des décisions) ; libellé `statuts.ts:36` ;
  - P1 ne protège que la modification d'une politique existante, pas sa forme à la création
    (`gardes-atelier.ts:53-65`).
- **Reproduction** : test « R2 » : `portes.creer` répond 201 pour un agent avec une politique
  `review` seule. Le passage `done` sans humain découle ensuite de la lecture de P2 (non exécuté sur
  instance).
- **Correction proposée** : dans `portes.creer`, exiger une dernière étape `approval` dont tous les
  participants sont des utilisateurs ; dans P2 (`vers_done`), refuser si l'acteur n'est pas un
  humain ou si l'état d'exécution n'est pas dans l'étape d'approbation ; calculer `approved`
  seulement s'il existe une décision `approuver` non invalidée sur la révision courante (sinon un
  statut distinct, par exemple « terminée sans approbation »).

### H3. Un livrable modifié après `done` reste « approuvé » ; course entre P2 et l'écriture d'un document (HAUT, confirmé par lecture ; écriture par un agent après `done` : plausible)

- **Invariant violé** : « une modification invalide les revues et les approbations ».
- **Scénario A (sans course)** : la tâche est approuvée (`done`) sur la révision R1. Le board (ou un
  agent, si l'hôte le lui permet) écrit R2 du document `livrable`. Le plugin périme les évaluations
  et invalide les décisions (`surRevision`), mais la tâche native reste `done`, donc affichée
  « Approuvée par l'humain » sur R2 que personne n'a relue. La diffusion est, elle, refusée
  (aucune décision sur R2).
- **Scénario B (course)** : le board envoie `PATCH done`. P2 lit `latest_revision_id = R1` sous le
  verrou de la ligne `issues` ; pendant ce temps, une écriture de R2 est validée (l'écriture d'un
  document ne prend pas ce verrou). Le `done` est validé avec R2 courante, jamais évaluée.
- **Preuves** :
  - le gestionnaire de révision ne touche pas l'état natif :
    `plugin-atelier/src/serveur/services.ts:903-918` ;
  - P2 lit la révision sans verrou sur le document :
    `paperclip/server/src/atelier/gardes-atelier.ts:166-170`, appelé sous le seul verrou de la ligne
    `issues` (`paperclip/server/src/services/issues.ts`, `runUpdate`, verrou `for("update")` puis
    appel des gardes, vers les lignes 10975-10999) ;
  - l'écriture de document lit la tâche sans verrou et ouvre sa propre transaction :
    `paperclip/server/src/services/documents.ts:197-222` ;
  - les routes refusent seulement les mutations d'agent selon leurs propres règles ; un humain
    passe (`server/src/routes/issues.ts`, `assertAgentIssueMutationAllowed`, retour immédiat pour un
    acteur non agent).
- **Correction proposée** : verrouiller le document `livrable` à l'entrée de l'étape d'approbation
  (le socle a `lockIssueDocument`, `documents.ts:684`) et le déverrouiller seulement sur retour en
  correction ; dans P2, relire la révision avec `select … for update` sur `documents` (ou
  `for share` sur `issue_documents`) pour sérialiser avec l'écriture ; sur `issue.document.updated`
  d'une tâche `done` sous porte, rouvrir la tâche (`in_progress`) ou au minimum afficher un statut
  « modifiée après approbation ».

### M1. Une même publication peut être acceptée plusieurs fois (MOYEN, confirmé)

- **Invariant visé** : « aucune diffusion ne doit s'exécuter deux fois ».
- **Scénario** : après approbation `publier` sur LinkedIn, un agent (ou une relance automatique
  après une coupure réseau) renvoie la même demande avec une nouvelle `cleIdempotence`. La seconde
  demande est acceptée (`simulee` en démonstration, `preparee` en réel). Le jour où un connecteur de
  publication existera, ce sera deux publications.
- **Preuves** : l'idempotence ne repose que sur la clé fournie par l'appelant
  (`plugin-atelier/src/serveur/services.ts:819-823`, index unique `(company_id, cle_idempotence)`,
  `plugin-atelier/migrations/001_atelier_socle.sql:269`) ; la règle ne garde la mémoire des
  diffusions passées que pour les montants payants (`plugin-atelier/src/serveur/regles-diffusion.ts:64-67`).
- **Reproduction** : test « R3 ».
- **Correction proposée** : pour une action non payante, refuser une seconde diffusion non refusée
  pour le même couple (décision, action, canal, compte), ou dériver la clé côté serveur de ces
  champs ; garder la clé client seulement pour rejouer la réponse.

### M2. Une sortie de modèle peut déclarer « réelles » des données inventées ou de démonstration (MOYEN, confirmé par lecture)

- **Invariant visé** : données de démonstration interdites en campagne réelle ; aucune sortie de
  modèle ne franchit une règle.
- **Scénario** : l'agent reçoit une réponse de démonstration, retire la mention et les identifiants
  fictifs, et dépose `{ structuredContent: { _atelier: { mode: "reel" }, lignes: [...] } }`. Le
  serveur enregistre une source `connexion` en mode `reel` ; la porte et la diffusion n'ont plus
  rien à refuser. Même chose pour des chiffres entièrement inventés.
- **Preuves** : le mode se déduit d'une enveloppe que l'appelant fournit, sans signature ni lien avec
  un appel réel de la passerelle (`plugin-atelier/src/serveur/regles-donnees-demo.ts:73-110`) ;
  dépôt : `plugin-atelier/src/serveur/services.ts:733-758`. La limite documentée
  (`docs/contrats.md` §13, « rien n'oblige un agent à déposer ») ne couvre pas la falsification.
- **Correction proposée** : signer l'enveloppe dans la passerelle (HMAC avec un secret que les
  agents ne voient pas) et vérifier la signature au dépôt, ou faire déposer la réponse par la
  passerelle elle-même. Ce point touche à l'intégrité des données face à un agent hostile : à faire
  valider par l'agent `securite`.

### M3. Deux entrées de la règle des données de démonstration échappent au contrôle de fraîcheur (MOYEN, confirmé par lecture)

- **Scénario 1** : entreprise réglée en réel, campagne laissée en démonstration. L'évaluation est
  `PASS`. Un agent appelle ensuite `tache.sources.lire` : le transport de démonstration (choisi par
  le mode de la campagne) enregistre une source `corpus_demonstration`. La porte la refuserait
  (`donnee_demo_campagne_reelle`), mais ni la porte ni les évaluations ne sont touchées : P2 accepte
  `done`, et `atelier.decision` accepte l'approbation sur ce `PASS` devenu faux.
- **Scénario 2** : un humain passe `mode_par_defaut` de démonstration à réel. Les `PASS` calculés en
  mode démonstration restent frais pour P2 et pour `atelier.decision`.
- **Preuves** : `tache.sources.lire` n'appelle ni `toucherPorte` ni `invaliderApresEntree`
  (`plugin-atelier/src/serveur/services.ts:701-725`, à comparer avec `765-768` pour le dépôt de
  connexion) ; changement de réglages sans péremption (`services.ts:1314-1326`) ; la fraîcheur ne
  lit ni `sources`, ni `reglages_entreprise`, ni `campagnes`
  (`paperclip/server/src/atelier/gardes-atelier.ts:153-161`, `plugin-atelier/src/serveur/base.ts:415-427`).
  La diffusion réelle, elle, revérifie les sources (`services.ts:844-848`) : pas d'action externe.
- **Correction proposée** : toucher la porte et périmer les évaluations dans `tache.sources.lire`
  (tâche sous porte) et dans `enregistrerReglages` quand `modeParDefaut` change (toutes les portes de
  l'entreprise) ; ajouter `sources.date_collecte` et `reglages_entreprise.modifie_le` au calcul
  `greatest(...)` des deux côtés (plugin et serveur), en gardant le contrat P2 du §3 à jour.

### M4. La limite de cycles n'est pas appliquée à l'évaluation : un `PASS` reste possible sans relance humaine (MOYEN, confirmé par lecture)

- **Scénario** : cycles épuisés (dernière évaluation `REFUS` avec `cycles_epuises`). Le producteur
  écrit une nouvelle révision et déclare sa couverture (accepté ; seules les nouvelles tâches de
  revue ne sont plus créées). Il sollicite les relecteurs par message ; leurs verdicts sont acceptés,
  puis l'évaluation rend `PASS`. L'escalade vers l'humain prévue par le §6 bis est contournée sans
  `atelier.correction.relancer`.
- **Preuves** : `cyclesEpuises` n'est calculé que pour un `REFUS` (`plugin-atelier/src/serveur/porte.ts:244-252`) ;
  la couverture ne fait que sauter la création des revues (`services.ts:437-448`) ; la route des
  verdicts ne regarde pas les cycles (`services.ts:541-606`).
- **Correction proposée** : dans `evaluer`, si les cycles sont épuisés et qu'aucune relance n'est
  postérieure au dernier `REFUS`, rendre `BLOQUE_INFORMATION` avec un motif `cycles_epuises` ; refuser
  aussi couverture et verdicts dans cet état.

### M5. Une évaluation prématurée consomme un cycle de correction (MOYEN, confirmé par lecture)

- **Scénario** : `maxCycles = 2`. Le producteur écrit R1 et déclare sa couverture ; n'importe quel
  agent de l'entreprise appelle `POST /porte/evaluer` avant les verdicts : `REFUS` pour
  `revue_requise_absente`. R1 compte désormais comme un cycle consommé, alors qu'aucune revue ne
  l'a refusée. Deux appels prématurés sur deux révisions épuisent les cycles et forcent l'escalade.
- **Preuves** : tout `REFUS` compte (`plugin-atelier/src/serveur/porte.ts:246-248`,
  `services.ts:469-475`) ; l'évaluation est ouverte à tout agent (`services.ts:608-611`,
  `contrats/routes.ts`, `tache.porte.evaluer`, `board-or-agent`).
- **Correction proposée** : ne compter un cycle que pour un refus de fond (verdict
  `CHANGES_REQUESTED` ou motif autre que l'absence de revue) ; réserver `porte/evaluer` à l'agent
  participant de l'étape de revue et au board.

### M6. La remise à zéro de démonstration efface la trace d'une entreprise réglée en réel (MOYEN, confirmé par lecture)

- **Scénario** : entreprise `mode_par_defaut = reel`, campagnes restées en `demonstration` (donc en
  mode effectif réel selon le §13). L'action `atelier.demo.reinitialiser` vérifie seulement le mode
  des campagnes et supprime décisions, diffusions, journal et réglages de l'entreprise.
- **Preuves** : `plugin-atelier/src/serveur/services.ts:1689-1694`, suppression
  `plugin-atelier/src/serveur/base.ts:890-897`.
- **Correction proposée** : refuser si `calculerModeEffectif` est réel pour l'entreprise, ou si une
  décision ou une diffusion porte `mode = reel`.

### B1. Une hypothèse peut se dire « autorisée par » un humain sur la seule parole de l'agent (BAS, confirmé)

`Hypothese.autoriseePar` est un champ libre de l'entrée de couverture
(`plugin-atelier/src/contrats/exigences.ts:96-99`), stocké tel quel (`services.ts:427-430`) et
montré au dossier humain (`services.ts:1419`). Correction : ignorer ce champ pour un agent (le forcer
à `null`) et ne le remplir que par une action humaine.

### B2. P1 ne protège pas `commentRequired` (BAS, confirmé)

La signature de la politique omet `commentRequired` (`paperclip/server/src/atelier/gardes-atelier.ts:33-44`) :
un agent peut le retirer. Correction : l'ajouter à la signature.

### B3. Ré-approuver la même révision remet à zéro le cumul du montant approuvé (BAS, confirmé ; intention à confirmer)

Le montant approuvé est un total **par décision** et seule la dernière décision de la révision est
valide (`plugin-atelier/src/serveur/regles-plafonds.ts:84-103`, `regles-diffusion.ts:46-50` et
`64-67`). Un humain qui ré-approuve R1 avec 1 000 € pour corriger le canal ouvre 1 000 € de plus,
alors que 1 000 € ont déjà été diffusés sous la première décision ; avec « aucune limite », rien ne
l'arrête. À trancher : total par révision ou par décision.

### B4. Réglages enregistrés à moitié quand le plafond est refusé (BAS, confirmé)

`enregistrerReglages` écrit les autres réglages avant le contrôle du plafond
(`plugin-atelier/src/serveur/services.ts:1320-1336`) ; en cas de `conflit`, ils restent changés et
l'événement `reglages.modifies` n'est pas journalisé. Correction : contrôler le plafond d'abord.

### B5. Au-delà de 500 tâches de revue, l'idempotence des revues casse (BAS, plausible)

`revuesDeRevision` lit au plus 500 tâches d'origine `revue` sans tri garanti
(`plugin-atelier/src/serveur/services.ts:498-501`) : au-delà, `assurerRevues` peut recréer des
revues en double. Correction : filtrer par `originId` côté hôte, ou par `parentId`.

### B6. Le verrou des plafonds suppose un worker unique (BAS, plausible)

`exclusif` est une file en mémoire (`plugin-atelier/src/serveur/services.ts:111-123`). Si l'hôte
lance deux workers du plugin (redémarrage chevauchant, plusieurs instances du serveur), deux
approbations simultanées peuvent dépasser ensemble un plafond. Hypothèse documentée au §12, non
vérifiée dans le code de l'hôte. Correction durable : une ligne de « réservation » avec contrainte
unique ou un `UPDATE … WHERE engage + montant <= limite` sur une ligne de compteur.

## Points vérifiés sans défaut

- **Isolation entre entreprises** : chaque lecture du plugin filtre `company_id`
  (`base.ts`, toutes les requêtes lues) ; `tache()` revérifie l'entreprise de la tâche
  (`services.ts:175-179`) ; les gardes du serveur lisent par `issue_id` (unique).
- **Fraîcheur de la porte** : `entrees_jusqu_a` est le maximum lu, et non l'heure de lecture ; une
  entrée validée pendant le calcul a un `modifie_le` plus récent et périme le résultat
  (`services.ts:294-296`, `gardes-atelier.ts:153-161`). Course vérifiée par raisonnement sur MVCC.
- **Décisions, relances, plafonds, budgets** : réservés à l'humain dans le pont et dans le service
  (`atelier.ts`, `services.ts:923`, `1013`, `167-169`).
- **Verdicts** : relecteur désigné obligatoire pour un agent, producteur exclu, révision courante
  exigée (`services.ts:549-555`).
- **Diffusion** : révision courante, porte franchie, `done` natif, dernière décision non invalidée,
  portée exacte, cumul payant et plafonds (`regles-diffusion.ts`, `services.ts:816-887`).
- Suite du plugin relancée le 15/10/2026 : 13 fichiers passés, 1 ignoré, 323 tests réussis, 2 ignorés.

## Reproductions

Fichiers hors dépôt (dossier temporaire de la session) :
`/tmp/claude-1000/-home-utilisateur/fac0401f-90db-40ef-b6ce-7a3239232a9a/scratchpad/revue/repro.spec.ts`
et `vitest.repro.config.mjs` dans le même dossier. Ils importent le code du plugin par chemins
absolus. Lancement :

```
cd ~/Projets/atelier-marketing-ia/plugin-atelier
pnpm exec vitest run --config /tmp/claude-1000/-home-utilisateur/fac0401f-90db-40ef-b6ce-7a3239232a9a/scratchpad/revue/vitest.repro.config.mjs
```

Résultat obtenu : 5 tests réussis (ils affirment le comportement défectueux actuel ; une correction
doit les faire échouer).

| Test | Constat | Ce qu'il montre |
| --- | --- | --- |
| R1 | H1 | même révision : `REFUS` avec `REQ-002` obligatoire, `PASS` sans motif dès qu'elle est facultative |
| R1 (service) | H1 | `campagnes.exigences` répond 201 à l'agent coordinateur et écrit `obligatoire = false`, sans toucher l'exclusion |
| R2 | H2 | `portes.creer` répond 201 pour un agent avec une politique `review` seule |
| R3 | M1 | la règle de diffusion autorise deux fois la même publication |

Le dossier temporaire disparaît avec la session : copier ces deux fichiers ailleurs pour les garder.

## Suites données

Date : 15/10/2026. Corrections faites par l'agent `analyste` (Opus 5.5), commits `1813928` (plugin) et
`e4cec9833` (socle, exporté en `socle/patches/0007-…`, commit `34e4762`). Décisions de l'opérateur du 15/10/2026 appliquées :
H1 (un agent ne fait que créer une exigence ; tout affaiblissement est humain et tracé), B3 (total payant par
révision), principe général (« done » sous porte exige une approbation humaine réelle). Contrats : v1.5
(`docs/contrats.md` §14). Les reproductions de la section précédente sont conservées dans
`instance/revue-repro/` ; rejouées après correction : **R1 (service), R2 et R3 échouent** comme attendu
(« Un agent ne peut que créer une exigence », « La politique native de la tâche doit se terminer par une étape
d'approbation », `expected false to be true` sur la seconde diffusion). Le test R1 pur (porte) passe encore :
il décrit la porte quand une exigence est facultative, ce qui reste juste quand c'est un humain qui l'a rendue
facultative ; le défaut était qui pouvait le faire (corrigé côté service).

| Constat | Statut | Correction | Test de non-régression |
| --- | --- | --- | --- |
| H1 | **corrigé** | `campagnes.exigences` : un agent ne fait que créer (`creerExigenceSiAbsente`, `on conflict do nothing`) ; toute modification d'une exigence existante refusée avant toute écriture (`elevation_refusee`, `exigence.modification_refusee`) ; l'humain peut affaiblir, tracé `exigence.affaiblie` + activité native | `tests/revue-independante.spec.ts` « H1 » (5 tests) |
| H2 | **corrigé** | `portes.creer` : dernière étape `approval` tenue par des utilisateurs ; P2 (`deciderClotureHumaine`) : `done` refusé à un agent, sans utilisateur, hors étape d'approbation, sans décision « approuver » non invalidée sur la révision courante ; statut `approved` seulement avec cette décision | `revue-independante.spec.ts` « H2 » (4) ; `atelier-gardes.test.ts` (fonction pure + 2 tests PostgreSQL) ; `contrats.spec.ts` |
| H3 | **corrigé** | P2 relit la révision `for update of d` ; livrable verrouillé (verrou natif `documents.locked_at`) à l'entrée de l'approbation, déverrouillé au retour en correction ; livrable modifié après `done` : tâche rouverte (`todo`, producteur réveillé), approbation invalidée, `livrable.modifie_apres_approbation` | `atelier-gardes.test.ts` (verrou, 409 natif, course avec une écriture en cours) ; `revue-independante.spec.ts` « H3 » (2) |
| M1 | **corrigé** | `verifierDiffusion` exige l'historique des diffusions et refuse une seconde diffusion non refusée de la même (décision, action, canal, compte) | `revue-independante.spec.ts` « M1 » (3) ; mutation détectée |
| M2 | **corrigé** (par §6 bis) | signature `_atelier` de la passerelle vérifiée au dépôt (clé publique configurée par l'humain, service, outil, arguments, date) ; sans signature valide, jamais réel | `tests/signatures.spec.ts` « §6 bis » (14) ; `donnees-connexion.spec.ts` ; mutation détectée |
| M3 | **corrigé** | `tache.sources.lire` touche la porte et périme ; changement de `modeParDefaut` : toutes les portes touchées, évaluations périmées ; `sources.date_collecte` dans la fraîcheur (plugin et P2) | `revue-independante.spec.ts` « M3 » (3) ; `atelier-gardes.test.ts` « M3 » ; scénario A (la porte franchie en démonstration ne vaut plus en réel) |
| M4 | **corrigé** | cycles épuisés avant la révision : `BLOQUE_INFORMATION` + `cycles_epuises`, jamais `PASS` ; verdicts refusés jusqu'à une relance humaine. Écart assumé : la couverture reste acceptée (elle déclenche l'escalade de l'agent de démonstration, scénario G) ; elle n'ouvre aucune revue et ne peut produire aucun `PASS` | `revue-independante.spec.ts` « M4 » (3) |
| M5 | **corrigé** | seul un refus de fond consomme un cycle (`refusDeFond`) ; évaluation réservée à l'humain et à l'agent participant d'une étape de revue native (route et action) | `revue-independante.spec.ts` « M5 » (2) |
| M6 | **corrigé** | remise à zéro refusée si l'entreprise est réglée en réel ou garde une décision ou une diffusion réelle | `revue-independante.spec.ts` « M6 » (3) |
| B1 | **corrigé** | `autoriseePar` vidé pour un agent, égal à l'humain authentifié sinon | `revue-independante.spec.ts` « B1 » |
| B2 | **corrigé** | `commentRequired` dans la signature P1 (normalisée à `true` par l'hôte : défense en profondeur) | `atelier-gardes.test.ts` « B2 » |
| B3 | **corrigé** (décision de l'opérateur : par révision) | cumul payant par révision dans la règle de diffusion et dans le montant engagé (réserve = approuvé − diffusé sur la révision) | `revue-independante.spec.ts` « B3 » (2) ; `securite.spec.ts` |
| B4 | **corrigé** | plafond contrôlé avant toute écriture ; tout dans la même section exclusive | `revue-independante.spec.ts` « B4 » |
| B5 | **corrigé** (correction simple) | revues cherchées par `originId` exact, une requête par rôle | `revue-independante.spec.ts` « B5 » |
| B6 | **documenté, non corrigé** | le verrou des plafonds reste en mémoire (un worker par plugin). La correction durable (ligne de réservation avec `UPDATE … WHERE engage + montant <= limite`) demande une migration et une refonte du calcul d'engagement ; à décider par l'opérateur | aucun |

Preuves chiffrées : `docs/resultats-tests.md`, section « Corrections de la revue indépendante ».

# Enquête : run annulé « Cancelled before issue reassignment » (scénario A)

Date : 15/10/2026. Enquête en lecture seule (aucun fichier suivi modifié, aucune instance démarrée).
Socle examiné : `paperclip/` branche `atelier-marketing` (v2026.1012.0 + patches 0001 à 0007).

## Verdict

**Cause prouvée.** Deux défauts se combinent :

1. **Paperclip (cause racine, défaut amont connu, non corrigé dans notre socle ni sur `master`)** :
   quand un run modifie une tâche dont l'assigné va changer (ici : demande de clôture qui fait
   passer la tâche à l'étape de revue et l'assigne à la Porte), `PATCH /api/issues/:id` annule
   « le run actif de la tâche » sans vérifier que ce run est celui qui envoie la requête. Le run
   s'annule donc lui-même. Issue amont **paperclipai/paperclip#13730** (ouverte, confirmée sur
   2026.1005.0 et `master` 2c17d3c au 14/10), correctif proposé **PR #13782** (ouverte).
2. **Notre agent de démonstration (amplificateur)** : l'adaptateur `process` n'injecte pas
   `PAPERCLIP_TASK_ID`, donc `agent-demo.mjs` traite **toutes** ses tâches dans chaque run. Le run
   réveillé pour SCN-2 a aussi traité SCN-4 et y a fait la demande de clôture. L'annulation porte
   sur SCN-4, mais la récupération native de Paperclip pose son verrou « sans rejeu » sur la tâche
   de **contexte** du run (SCN-2), qui était encore assignée au producteur : SCN-2 reste bloquée.

Ni le régulateur (patch 0002) ni le lanceur de scénarios ne sont en cause. Le réglage de
concurrence par agent (`maxConcurrentRuns`) **n'est pas un palliatif** : tout se passe dans un
seul run.

## Ce qui s'est passé (passage `instance/scenarios/A-20261015T170145Z.json`, instance `atelier-corr`)

Producteur « Contenus et création » `ec720b78`, deux tâches : SCN-2 (page) et SCN-4 (publication).
Sources : base de l'instance `atelier-corr` (port PG 54540, lue en lecture seule), journaux
`instance/instances/atelier-corr/data/run-logs/02d80943-…/ec720b78-…/08e73bd4-….ndjson`.

| Heure (UTC) | Fait | Preuve |
| --- | --- | --- |
| 17:01:13.014 | run `08e73bd4` créé, contexte `issueId` = SCN-2, motif `issue_children_completed` | `heartbeat_runs.context_snapshot` |
| 17:01:13.367 | run `a89a52f1` créé pour SCN-4 (même agent), reste en file | `heartbeat_runs` |
| 17:01:13.879 | `08e73bd4` démarre ; `tache: null` (aucun `PAPERCLIP_TASK_ID`) | journal du run, événement `adapter.invoke` (env sans `PAPERCLIP_TASK_ID`) |
| 17:01:14.063-14.494 | `08e73bd4` : checkout SCN-2, version 2 écrite, couverture, SCN-2 → `blocked` (attend ses revues), toujours assignée au producteur | `activity_log` |
| 17:01:14.561 | `08e73bd4` fait le checkout de **SCN-4** : `executionRunId(SCN-4) = 08e73bd4` | `activity_log` ; `services/issues.ts` checkout (`executionRunId: checkoutRunId`) |
| 17:01:14.642 | `08e73bd4` envoie `PATCH SCN-4 {status: done}` ; la politique d'exécution transforme en `in_review` + assigné = Porte `971beade` ; le serveur annule `08e73bd4` lui-même | événement 3 du run : `issueId 929163d3` (SCN-4), `interruptedRunId: 08e73bd4`, `authorizationReason: allow_self` |
| 17:01:14.650 | `08e73bd4` → `cancelled / issue_reassigned` ; le processus est tué (la trace `demande_cloture` n'apparaît jamais) | `heartbeat_runs.result_json` |
| 17:01:26.330 | récupération native sur la tâche de **contexte** SCN-2 : `legacy_execution_requires_reconciliation`, `replay: blocked` | événement 5 du run ; `issue.execution_recovery_settled` sur SCN-2 |
| 17:01:28.198 | le lanceur (humain simulé) fait « Reprendre » sur SCN-2 | `activity_log` (`local-board`) |

### Discriminant mesuré

Dans cette instance, **14 runs** ont fini en `issue_reassigned` (6 dans ce passage, 8 dans d'autres
entreprises). Pour 13 d'entre eux, la tâche réassignée était la tâche de contexte du run : aucun
verrou (la tâche n'appartenant plus à l'agent, la récupération ne s'applique pas). Le **seul** cas
où la tâche réassignée diffère de la tâche de contexte (`08e73bd4` : contexte SCN-2, réassignée
SCN-4) est le seul qui a posé un verrou. Requête utilisée :

```sql
select left(r.id::text,8), r.context_snapshot->>'issueId' =
  (select e.payload->>'issueId' from heartbeat_run_events e
    where e.run_id=r.id and e.message='run cancelled before issue reassignment' limit 1) as meme_tache,
  exists(select 1 from heartbeat_run_events e where e.run_id=r.id
    and e.payload->>'cause'='legacy_execution_requires_reconciliation') as verrou
from heartbeat_runs r where r.error_code='issue_reassigned';
```

Conséquence : l'auto-annulation se produit à **chaque** passage de main (y compris au run `57c3118e`
du même passage, sans dégât visible) ; le blocage n'apparaît que si le run a traité une autre tâche
que celle de son réveil, ce qui dépend de l'ordre d'arrivée des réveils : d'où « une fois sur quatre ».

## Où le motif est produit, et dans quelles conditions

- `paperclip/server/src/routes/issues.ts:13462-13490` : si `assigneeWillChange && existing.assigneeAgentId`,
  appel de `resolveActiveIssueRun(existing)` puis `heartbeat.cancelRun(…, "Cancelled before issue reassignment",
  { errorCode: "issue_reassigned" })`, **sans exception pour le run appelant**. Le contrôle de
  permission juste au-dessus (l. 13434) exempte `transition.workflowControlledAssignment`, l'annulation non.
- `paperclip/server/src/routes/issues.ts:6851-6886` (`resolveActiveIssueRun`) : prend
  `issue.executionRunId` s'il est `running`, sinon le run `running` de l'assigné dont le contexte vise
  cette tâche. Après un checkout, `executionRunId` = le run appelant, donc c'est lui qui est choisi.
- `paperclip/server/src/services/legacy-execution-recovery.ts:19-56` : un run `cancelled` sans preuve
  `executionRecovery` « interrupted/settled » est classé « à réconcilier » ; `terminalizeLegacyExecution`
  (l. 63 et suivantes) pose le verrou sur `run.contextSnapshot.issueId` si cette tâche appartient encore
  à l'agent et n'est pas close.
- `paperclip/server/src/adapters/process/execute.ts:27-42` : l'adaptateur `process` ne pose que
  `PAPERCLIP_RUN_ID`, `PAPERCLIP_API_KEY` et l'environnement de base ; pas de `PAPERCLIP_TASK_ID` ni
  `PAPERCLIP_WAKE_REASON` (contrairement à `packages/adapters/claude-local/src/server/execute.ts:222-255`).
- `plugin-atelier/demo/agent-demo.mjs:64-81` (`mesTaches`) : sans `PAPERCLIP_TASK_ID`, liste toutes les
  tâches de l'agent ; `main` (l. 587-599) les traite toutes dans le même run.
- Réveils et checkout : le checkout (`services/issues.ts:11455+`) accepte le run si `executionRunId`
  est nul ou égal ; `a89a52f1` était en file sans tenir le verrou, d'où le checkout réussi de SCN-4 par
  `08e73bd4`. Le régulateur (`server/src/atelier/regulateur-runs.ts`, raccords `heartbeat.ts:20231` et
  `26982`) ne fait qu'admettre ou laisser en file ; il n'annule jamais (aucun `cancel` dans le module).

## Correction minimale proposée (socle, futur patch 0008)

Reprendre tel quel le correctif amont PR #13782 (`git apply --check` sur notre branche : s'applique
sans conflit, vérifié le 15/10). Fichier : `paperclip/server/src/routes/issues.ts`, bloc de la ligne 13466.

```diff
         const runToStopForReassignment = await resolveActiveIssueRun(existing);
-        if (runToStopForReassignment) {
+        // Un run qui passe la main sur sa propre tâche doit survivre au passage.
+        // Seul un JWT de run prouve que l'appelant est ce run (l'en-tête d'une
+        // clé d'agent n'est pas vérifié) : ces cas gardent l'annulation.
+        const isSelfHandoff =
+          !!runToStopForReassignment &&
+          req.actor.type === "agent" &&
+          req.actor.source === "agent_jwt" &&
+          !!req.actor.runId &&
+          req.actor.runId === runToStopForReassignment.id &&
+          req.actor.agentId === existing.assigneeAgentId;
+        if (runToStopForReassignment && !isSelfHandoff) {
           const cancelled = await heartbeat.cancelRun(
```

Test : les quatre cas de la PR amont, à ajouter dans
`paperclip/server/src/__tests__/issue-agent-mutation-ownership-routes.test.ts` (les aides `createApp`,
`ownerActor`, `boardActor`, `makeIssue`, `makeAgent`, `ownerRunId`, `peerAgentId` y existent déjà) :
1. agent avec `source: "agent_jwt"` qui réassigne sa propre tâche : 200, `cancelRun` non appelé ;
2. réassignation par le board : `cancelRun(ownerRunId, "Cancelled before issue reassignment", …)` ;
3. clé d'agent (`agent_key`) nommant le run : annulation maintenue ;
4. JWT d'un autre run du même agent : annulation maintenue.

Commande : `pnpm --filter @paperclipai/server exec vitest run src/__tests__/issue-agent-mutation-ownership-routes.test.ts`
(en arrière-plan, une seule lecture du journal). Contrôle de bout en bout : rejouer le scénario A
quatre fois ; attendu 0 run `issue_reassigned` dont l'`interruptedRunId` est le run appelant, et
0 réconciliation humaine.

Non exécuté ici (consigne de lecture seule et autre agent en cours sur le socle).

### Risques du correctif

- Le run appelant continue après le passage de main pendant que le nouvel assigné peut être réveillé :
  deux runs pourraient toucher la même tâche. La PR amont laisse ce point ouvert aux mainteneurs. Ici,
  le `PATCH` vide déjà `executionRunId` (vu dans `activity_log`) ; l'agent de démonstration n'écrit
  plus rien sur la tâche après sa demande de clôture ; un vrai agent Claude pourrait poster un
  commentaire, ce qui est le comportement voulu.
- Ne couvre pas la clôture directe sans changement d'assigné (`issue_terminalized`, l. 13498-13530) ni le
  statut `cancelled` : même défaut signalé dans #13730 ; hors du cas observé.
- Écart de plus avec l'amont tant que #13782 n'est pas fusionnée ; à retirer au prochain rebase si elle l'est.
- Le patch touche `routes/issues.ts`, pas `server/src/atelier/**` : pas de conflit attendu avec le patch 0007 en cours.

## Palliatifs en attendant

1. **Agent de démonstration : un run, une tâche.** Le run doit traiter la tâche de son réveil. Deux voies :
   - socle : faire injecter par l'adaptateur `process` `PAPERCLIP_TASK_ID` et `PAPERCLIP_WAKE_REASON` à
     partir de `ctx.context.taskId ?? ctx.context.issueId`, comme `claude-local` (trois lignes dans
     `server/src/adapters/process/execute.ts`) ;
   - agent seul : dans `mesTaches()`, si `TACHE` est vide, lire `GET /api/heartbeat-runs/${RUN}` et prendre
     `contextSnapshot.issueId`. Probable mais non vérifié : la route exige `company_scope:read`
     (`routes/agents.ts:1159`), à confirmer pour un JWT d'agent.
   Cela supprime le cas « contexte ≠ tâche réassignée », donc le verrou ; l'auto-annulation demeure mais
   reste sans dégât pour la démonstration (la clôture est la dernière action).
2. **`maxConcurrentRuns` par agent : inutile ici.** Le second run (`a89a52f1`) était en file, pas actif ;
   le défaut naît dans un seul run.
3. Garder dans le lanceur la détection des réconciliations humaines (contrôle INFO actuel) comme filet.

## Ce qui reste à décider (JB)

- Appliquer le correctif amont comme patch 0008 du socle (recommandé : il protège aussi les vrais
  agents Claude, qui perdraient tout travail fait après leur passage de main, ainsi que l'usage du run).
- Corriger l'agent de démonstration (voie socle ou voie agent), indépendamment du point précédent.
- Suivre #13730 et #13782 pour retirer le patch quand l'amont le fusionnera.

Issues amont voisines lues : #15483 (run annulé avant démarrage qui gèle la tâche), #14879, #14973,
#13532, #15206 (autres effets de la réassignation), PR #16082 fusionnée le 13/10 après v2026.1012.0
(passage de main à un humain seulement).

## Suites données (15/10/2026)

Les deux défauts sont corrigés dans le socle (branche `atelier-marketing` de `paperclip/`) et prouvés de bout en bout.

### Ce qui a été fait

1. **Patch `0009`** (commit `98d9d9b53`) : correctif de la PR amont #13782 repris tel quel, appliqué sans conflit
   (`git apply --check` puis `git apply`). `server/src/routes/issues.ts` : le run appelant n'est plus annulé quand il passe
   la main sur sa propre tâche (JWT de run, même run, même agent assigné). Quatre tests ajoutés dans
   `server/src/__tests__/issue-agent-mutation-ownership-routes.test.ts` (bloc « reassignment run cancel » : passage de main
   par l'agent sans annulation ; board : annulation maintenue ; clé d'agent : annulation maintenue ; JWT d'un autre run :
   annulation maintenue). La PR #13782 était toujours ouverte (non fusionnée) le 15/10.
2. **Patch `0010`** (commit `5729d9235`) : l'adaptateur `process` injecte `PAPERCLIP_TASK_ID` (`taskId`, sinon `issueId`)
   et `PAPERCLIP_WAKE_REASON` depuis le contexte du run, comme `claude-local`. Les variables du réveil l'emportent sur la
   configuration de l'agent. Test `server/src/__tests__/process-adapter-wake-env.test.ts` (4 cas, processus enfant réel).
   L'amont (`master`) n'injecte toujours rien (lecture de `server/src/adapters/process/execute.ts`).
3. **Agent de démonstration** (`plugin-atelier/demo/agent-demo.mjs`, `mesTaches()`) : avec `PAPERCLIP_TASK_ID`, ne traite que
   la tâche du réveil (liste vide si elle n'est plus assignée à l'agent, trace `tache_reveil_non_assignee`) ; sans cette
   variable, comportement inchangé (toutes les tâches de l'agent). Le fichier était propre dans git avant la modification.

### Preuves

- Les 8 tests neufs échouent sans le correctif (vérifié en restaurant les deux fichiers sources d'origine : 4 échecs
  sur 138 : le test de passage de main et les 3 tests d'injection ; le cas « variables absentes » passe, comme attendu).
  Avec le correctif : `scripts/tests-serveur.sh` sur les deux fichiers, 2 fichiers, 138 tests verts.
- Suites voisines (9 fichiers : execution-policy x2, comment-cancel, update-comment-wakeup, assignee-invokability,
  stale-execution-lock, tree-control, heartbeat-process-recovery, adapter-registry) : 9 fichiers verts.
- Typecheck : `pnpm --filter @paperclipai/server typecheck`, code de sortie 0.
- Rejeu : `git am --3way` de 0001 à 0007, 0009, 0010 sur `v2026.1012.0` (0008 n'existe pas) : aucun conflit, arbre
  `a4605be7940e8883526d98b505635e278b5987ca`, identique à celui de la branche.
- **Bout en bout** : instance d'essai `atelier-run` (HTTP 3400, PostgreSQL 54600, passerelle de démonstration 3491), neuve
  (base vide), scénario A joué 4 fois (`python3 -I scripts/scenarios/atelier_scenarios.py A http://127.0.0.1:3400/api`) :
  4 fois « 33 OK, 0 ÉCART ». Comptages en base :

  | Moment | runs | `cancelled / issue_reassigned` | `legacy_execution_requires_reconciliation` |
  | --- | --- | --- | --- |
  | avant (instance neuve) | 0 | 0 | 0 |
  | après passage 1 | 19 | 0 | 0 |
  | après passage 2 | 38 | 0 | 0 |
  | après passage 3 | 57 | 0 | 0 |
  | après passage 4 | 76 | 0 | 0 |

  Le lanceur n'a relevé aucune réconciliation humaine dans les quatre passages. Point de comparaison avant correctif :
  l'instance `atelier-corr` avait 14 runs `issue_reassigned` dont 6 dans un seul passage (voir plus haut). Les résultats
  bruts sont dans `instance/scenarios/A-20261015T172329Z.json`, `…172500Z`, `…172630Z` et `…172756Z`. Instance et
  passerelle arrêtées ensuite.

### Limites

- L'« avant » de la table est une base vierge : le comptage de référence avant correctif vient de l'enquête (instance
  `atelier-corr`), pas d'un rejeu sans patch sur la même instance.
- Le risque noté plus haut subsiste (le run qui passe la main continue pendant que le nouvel assigné peut être réveillé) ;
  la clôture directe sans changement d'assigné (`issue_terminalized`) reste couverte par l'amont #13730, non corrigée.
- À retirer au prochain rebase : le patch `0009` si #13782 est fusionnée ; le patch `0010` seulement si l'amont injecte
  ces variables (voir `docs/mise-a-jour-socle.md`).

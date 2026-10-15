# Résultats des tests exécutés (intégration finale, 15/10/2026)

Instance d'essai isolée `atelier-lote` (port 3180, PostgreSQL embarqué 54380), socle
`2026.1012.0+3.git.bea3227b3`, plugin construit depuis `plugin-atelier/`. Aucun appel de
modèle, aucune dépense, aucune diffusion réelle. Résultats bruts des scénarios :
`instance/scenarios/<scénario>-<horodatage>.json` (non versionné).

| Vérification | Commande | Résultat |
| --- | --- | --- |
| Types du plugin | `cd plugin-atelier && pnpm typecheck` | 0 erreur |
| Tests du plugin (contrats, porte, sécurité, relance, interface jsdom) | `pnpm test` | 214 réussis, 2 ignorés (réseau réel, `ATELIER_TEST_RESEAU=1`) |
| Construction du plugin | `pnpm build` | `dist/` produit, worker rechargé (disable puis enable) |
| Scénario G (cycles épuisés, relance humaine, version humaine, rejet) | `python3 -I scripts/scenarios/atelier_scenarios.py G …:3180/api` | **25 OK, 0 écart** (`G-20261015T140620Z.json`) |
| Scénario B (omission puis correction) | idem `B` | 15 OK, 0 écart |
| Scénario C (affirmation non sourcée, lien 200 + page d'erreur, injection) | idem `C` | 10 OK, 0 écart |
| Scénario D (information introuvable) | idem `D` | 9 OK, 0 écart |
| Scénario E (arrêt du serveur puis reprise) | `ATELIER_INSTANCE_ESSAI="atelier-lote 3180 54380" … E` | 10 OK, 0 écart |
| Scénario F (P1, publication refusée, escalade, budget, régulateur) | idem `F` | 8 OK, 0 écart |
| Scénario S (isolement, SSRF, imports, élévation) | idem `S` | 9 OK, 0 écart |
| Contrôle J (rattrapage `afterSeq`) | idem `J` | 3 OK, 0 écart |
| Interface réelle (Playwright, chromium sans interface) | `tests/e2e/atelier/preparer.sh atelier-lote 3180 54380` puis `ATELIER_E2E_URL=http://127.0.0.1:3180 node …/cli.js test --config tests/e2e/atelier/playwright.config.ts` | **9/9** (six rubriques, agent, campagne créée puis annulée, décision, dossier non prêt, calendrier, smartphone, clavier, thème sombre) |
| Tests serveur de l'atelier (patches) | `scripts/tests-serveur.sh` sur `atelier-gardes`, `atelier-competences`, `atelier-suppression-entreprise` | 19/19 (3 fichiers) |
| Organisation hors ligne | `scripts/bootstrap-tests.sh` | 15/15 |
| Organisation sur instance (idempotence, mise à jour en place, export, aller-retour) | `scripts/bootstrap-tests.sh --instance --remise-a-zero` (variables de l'instance d'essai) | **25/25** : 11 agents (10 + porte), 32 compétences à l'aller-retour, 2 projets, 3 routines |
| Mode réel : configuration seulement | `bootstrap-organisation.py appliquer --mode reel` deux fois | passe 1 : 34 écritures ; passe 2 : 0 ; 10 agents `claude_local` (modèle, effort, moteur CLI, `dangerouslySkipPermissions: false`, `--permission-mode dontAsk`, outils, compétences voulues, `CLAUDE_CONFIG_DIR` dédié), porte en `process` ; jeton absent (attendu) |
| Sauvegarde, sinistre, restauration avec `pg_dump` 18.6 | script de pilotage décrit dans `docs/exploitation.md` §3.5 | **0 écart sur 7 710 éléments** ; `PATCH /projects` 200 ; `POST /agents/:id/resume` 200 |
| Validation de configuration | `scripts/verifier-config.sh` (fichier conforme, fichier fautif, fichier absent) | conforme : code 0 ; fautif : 6 écarts, code 1 ; absent : code 1 |

## Non exécuté (et pourquoi)

- **Run réel `claude_local`** : jeton de l'opérateur requis (`claude setup-token`) ; aucun appel de modèle.
- **Suite serveur complète de Paperclip (801 fichiers)** : non lancée (durée, une seule suite lourde
  à la fois sur le poste de développement). Le lot A a passé une sélection de 151 fichiers autour des patches
  sans échec (commit `43fe4bd`).
- ~~Bouton « Reprendre », Relance et Diffuser depuis le navigateur réel~~ : faits le 15/10/2026 (intégration des
  connecteurs, Playwright 15/15, voir plus bas).

## Constats faits pendant ces tests (et corrigés)

1. L'hôte ajoute `renderEnvironment` aux paramètres d'une action : le schéma strict de la
   relance le refusait. Corrigé dans le pont (`atelier.ts`).
2. L'escalade de démonstration passait `blocked` sans propriétaire : HTTP 422, puis boucle de
   réveils ; corrigé (question native, bloqueurs résolus retirés, pas de reprise d'une escalade).
3. Un plugin ne peut pas réécrire un document existant (`documents.upsert` sans `baseRevisionId`) :
   la version corrigée passe par l'API native puis est vérifiée par le worker.
4. Un commentaire attribué à un humain exige une capacité supplémentaire : commentaires signés
   par le plugin, l'humain nommé dans le texte.
5. Après un rejet, la tâche annulée garde un `executionState` d'étape d'approbation en attente
   (la mise à jour par un plugin ne passe pas par la politique d'exécution). Sans effet observé :
   statut fonctionnel « annulée », diffusion refusée ; signalé comme limite.

## Plafonds de dépenses choisis par le client (15/10/2026)

- `cd plugin-atelier && npx tsc --noEmit` : code 0 ; `pnpm test` : 10 fichiers passés, 255 tests passés, 2 ignorés
  (`reseau-reel.spec.ts`, déjà ignorés avant) ; `pnpm build` : code 0.
- Instance d'essai `atelier-loth` (3220, arrêtée ensuite) : scénario H (nouveau) 25 OK, 0 ÉCART ; scénario B 15 OK,
  0 ÉCART ; scénario F 8 OK, 0 ÉCART (`instance/scenarios/`).

## Garde des données simulées, lot L9 (15/10/2026)

- `cd plugin-atelier && npx tsc --noEmit` : code 0 ; `pnpm test` : 13 fichiers passés, 316 tests passés, 2 ignorés
  (`reseau-reel.spec.ts`, déjà ignorés avant) ; `pnpm build` : code 0. Nouveaux : `regles-donnees-demo.spec.ts`
  (28 tests : déduction du mode, chiffres, livrable, porte en démonstration et en réel, branchement dans
  `evaluerPorte`, diffusion) et `donnees-connexion.spec.ts` (6 tests : route complète à travers l'aiguillage, les
  services et le SQL de `base.ts`, sur une fausse base en mémoire).
- Mutations de la règle, une à la fois (fichier restauré et comparé octet pour octet ensuite) : mention toujours
  considérée présente → 6 échecs ; règle « campagne réelle » désactivée → 5 échecs ; mode toujours « reel » →
  18 échecs.
- Migration `004_sources_connexion.sql` passée au validateur réel de l'hôte (`validatePluginMigrationStatement` de
  `paperclip/server/src/services/plugin-database.ts`, découpage d'instructions identique) : 6/6 instructions
  acceptées (001 : 35/35, 002 : 2/2, 003 : 8/8), puis appliquée par l'hôte sur l'instance d'essai.
- Instance d'essai `atelier-lot9` (3260, PG 54460, arrêtée ensuite) : scénario K (nouveau) 20 OK, 0 ÉCART ;
  B 15 OK, C 10 OK, H 25 OK, 0 ÉCART (`instance/scenarios/K-20261015T150546Z.json` et suivants).
  K prouve : mode déduit (4 indices), version 1 refusée avec constat localisé (« Le chiffre « 412 » … (section
  « Requêtes », ligne 7) »), version étiquetée franchie une seule fois, approbation, diffusion simulée ; mode déclaré
  et réponse sans enveloppe refusés (400) ; enveloppe falsifiée « reel » enregistrée en démonstration ; en campagne
  réelle, dépôt tracé comme interdit, porte refusée et escalade, diffusion réelle refusée (403), approbation
  refusée (409).
- Constat : en campagne réelle, le `PATCH { status: "done" }` du board sur la tâche bloquée répond 200 mais la tâche
  passe à l'étape de revue native (`in_review`) et non à `done` : P2 n'est pas contourné.

## Intégration des connecteurs dans l'usine (15/10/2026)

Instance d'essai `atelier-lotz` (3320, PG 54520), passerelle de démonstration sur 3391 (`passerelle/dist`, état OAuth dans un
dossier temporaire), `PAPERCLIP_ATELIER_GATEWAY_URL=http://127.0.0.1:3391`. Aucun appel de modèle, aucune dépense, aucune diffusion réelle.

**Patch socle `0005` (« Ask first » des cartes).**
- `scripts/tests-serveur.sh server/src/__tests__/atelier-marketing-apps.test.ts` : 11/11 (9 avant + 2 : classement des verbes
  français, parcours carte HubSpot jusqu'aux politiques `require_approval` de `crm_modifier_contact` et d'un outil sans annotation).
  Mutation (règle française désactivée) : le test échoue ; fichier restauré à l'identique (`cmp`).
- Lot ciblé : `atelier-marketing-apps`, `gmail-tool-governance`, `tool-access-service`, `remote-mcp-pending`, `memory-connectors`,
  `generic-mcp-connection` : 6 fichiers verts après correction d'un test amont cassé par le patch 0004 (`tool-access-service` attendait
  59 apps, la galerie en compte 70 : 59 amont + 11 ; ajusté en 59 hors `atelier-*` et 11 `atelier-*`), 370/370 sur ce fichier.
- `vitest` partagé `atelier-app-definitions` + `app-definitions` : 46/46 (test amont « defaults every action… to allowed » restreint
  aux apps non `atelier-*`, couvertes par un test dédié plus strict) ; `typecheck` shared et server : 0.
- Rejeu `git am` 0001 à 0005 sur `v2026.1012.0` : arbre `afba97fab5057da69a12c82c072589e24108dabd`, identique à la branche.
- Sur l'instance : carte HubSpot (publication) → `crm_modifier_contact` en « Ask first » ; carte Facebook (publication) finalisée par
  le rappel OAuth du navigateur → `facebook_publier` et `facebook_envoyer_message` en « Ask first », lectures non. Appel d'essai de
  `facebook_publier` par un agent : `decision: ask_first` + `actionRequestId` (avant le correctif d'`instance-essai.sh` : HTTP 500
  `signing_secret_unconfigured`).

**Connexions par rôle (bootstrap).** `bootstrap-organisation.py appliquer --mode demonstration` sur l'entreprise « Rénovation Liège »
avec trois connexions de cartes : passe 1 = 6 écritures (installations, 3 politiques `block`), puis accès natif ajouté = 1 écriture,
passe suivante = **0 écriture**. Profils effectifs natifs : Contenus = Facebook seul ; CRM conversion = HubSpot seul ; SEO local GEO et
Mesure = Search Console ; Veille, SEA, Coordinateur et les autres = aucune connexion. Appels d'essai : Contenus `facebook_publier` →
`deny_policy_block` ; Contenus `facebook_publications` → `allowed` ; CRM conversion `crm_modifier_contact` → `ask_first`.
`scripts/verifier-organisation.py` : 9 contrôles, 0 erreur (nouveau contrôle des connexions par rôle) ; `scripts/bootstrap-tests.sh` :
**17/17** (15 + 2 cas négatifs : outils de connexion sans connexion, consigne de dépôt absente).

**Plugin.** `pnpm typecheck` 0 ; `pnpm test` 320 réussis, 2 ignorés (réseau réel) avant les tests de cartes, puis
`connexions-natives.spec.tsx` 30/30 (fixture réelle `connexions-cartes-reelles.json` relevée sur l'instance ; mutation « mode lu dans
les seules portées » détectée) ; `pnpm build` 0.

**Scénario A** (`python3 -I scripts/scenarios/atelier_scenarios.py A http://127.0.0.1:3320/api`) : **33 OK, 0 ÉCART**
(`instance/scenarios/A-20261015T155552Z.json`). Prouve : 11 cartes « (démonstration) » ; connexions Search Console et Facebook créées
par les cartes ; `atelier_identite` (mode, compte, propriété) ; `gsc_requete_performances` appelé par la passerelle d'outils de
Paperclip ; `facebook_publier` retenu en « Ask first » ; brief, REQ-001 à REQ-004, trois tâches sous porte confiées à deux producteurs,
runs simultanés du producteur SEO et du producteur Contenus ; dépôt de la réponse brute par l'agent (mode déduit, 3 indices, 28 chiffres
retenus) ; bilan dont chaque chiffre vient de la réponse déposée ; revues exigences et métier réussies et porte franchie une fois pour
chaque tâche, omission de Seraing corrigée ; dossiers prêts, décisions, approbations natives (P2), diffusions simulées sur site, rapport et
facebook ; calendrier (trois dates, canaux, « approuvé », démonstration) ; puis entreprise passée en mode réel : mode effectif réel avec
sa raison, diffusion du bilan refusée (403, données de démonstration), diffusion de la publication « préparée », jamais simulée.
Passages précédents : 32 OK, 1 écart (extraction des nombres du contrôle, espace fine insécable) ; un passage interrompu par moi après
un blocage par récupération native (run annulé « before issue reassignment », tâches parallèles d'un même producteur), d'où la
réconciliation humaine ajoutée au lanceur ; 32 OK, 1 écart (affectations lues trop tôt, attente ajoutée).

**Interface réelle (Playwright, chromium sans interface)** : `ATELIER_E2E_URL=http://127.0.0.1:3320 node tests/e2e/atelier/node_modules/@playwright/test/cli.js
test --config tests/e2e/atelier/playwright.config.ts` après `preparer_dossier.py <API> pret`, `epuise` et `interruption` (vraie interruption :
instance d'essai arrêtée pendant le run du producteur puis relancée) : **15/15, aucun ignoré** (1,4 min). Les 9 parcours existants (le test de
création choisit désormais « Montant maximal (€) » : le champ « Budget maximal (euros) » n'existe plus depuis les plafonds, même vérification
backend de 80 000 centimes) et 6 nouveaux : relancer la correction (consigne, nouveaux cycles accordés), diffuser en démonstration (simulée),
Diffuser grisé en réel avec sa raison (Entrée au clavier ne crée rien), reprendre une tâche interrompue (la tâche quitte « blocked »),
plafond « aucune limite » (avertissement lié au bouton radio, choix enregistré et tracé), tableau des connecteurs (« Connecter » vers
`/apps/connect?source=atelier-google-analytics`, carte « Google Analytics 4 (démonstration) » affichée, « Gérer » vers l'onglet Permissions).
Premier passage : 13/15, deux défauts des tests eux-mêmes (titre « Diffusion » non exact, clic Playwright refusé sur un bouton
`aria-disabled`), corrigés.

**Captures** (`docs/captures/`, 50 fichiers) : `node tests/e2e/atelier/captures.mjs http://127.0.0.1:3320 RNO docs/captures …` sur l'organisation
« Rénovation Liège (démonstration) » (11 agents, trois connexions de cartes), clair et sombre, bureau et mobile ; la campagne vient du
scénario A (mode réel appliqué), les dossiers prêt et approuvé d'entreprises de dossiers e2e (les agents `process` de l'organisation ne
chargent pas de compétences : le garde des compétences obligatoires refuse leurs runs, voulu) ; galerie native filtrée sur
« démonstration » en clair et en sombre. Examinées : note du mode effectif, tableau des connecteurs (bureau et mobile), aucun débordement.

**Fin de lot.** `cd plugin-atelier && pnpm typecheck` 0 ; `pnpm test` **323 réussis, 2 ignorés** (réseau réel) ; `pnpm build` 0.
`scripts/tests-serveur.sh` sur `atelier-gardes`, `atelier-competences`, `atelier-suppression-entreprise`, `atelier-marketing-apps` :
**4 fichiers, 30/30**. Détecteur Impeccable sur les fichiers d'interface modifiés : aucune alerte.

**Tous les scénarios, rejoués après les changements de l'agent de démonstration** (instance `atelier-lotz`) :
`python3 -I scripts/scenarios/atelier_scenarios.py tous …` (journal : `instance/scenarios/TOUS-20261015-journal.log`) :
B 15 OK, C 10 OK, D 9 OK, G 25 OK, H 25 OK, K 20 OK, S 9 OK, J 3 OK, F 8 OK, **0 écart** ; E : 6 OK, 2 écarts, puis arrêt
(« Connection refused »). Causes vérifiées : E attendait l'événement `livrable.revise` du journal du plugin, arrivé après la pause de
30 s du producteur (livraison des événements de l'hôte ralentie sur une instance chargée) : l'arrêt est tombé après la fin du run, donc
aucune interruption ; puis le second redémarrage a échoué parce qu'un postgres embarqué de l'instance (PID 2050818, dossier
`instance/instances/atelier-lotz/db`) restait à l'écoute sur 54520 après l'arrêt du serveur (arrêté par SIGINT, PID vérifié). Correctif du
lanceur : E attend des signaux natifs (document écrit et run du producteur en cours), aucune vérification modifiée. Rejoué seul :
**E 10 OK, 0 écart** (`instance/scenarios/E-20261015T165237Z.json`, deux redémarrages). A : 33 OK (plus haut).
Limite constatée, non corrigée (hors périmètre) : `instance-essai.sh arreter` peut rendre la main pendant que le postgres embarqué
reste actif ; le redémarrage suivant refuse alors le port.

**Organisation sur instance** : `ATELIER_API=http://localhost:3320/api PAPERCLIP_HOME=<dépôt>/instance scripts/bootstrap-tests.sh --instance
--remise-a-zero` : **27/27** (passe 1 : 34 écritures, passe 2 : 0 ; 11 agents, 3 objectifs, 2 projets, 3 routines ; aller-retour 32
compétences). Sans remise à zéro, 23/25 : les deux échecs venaient des projets ajoutés par mes essais dans l'organisation (5 au lieu de 2).

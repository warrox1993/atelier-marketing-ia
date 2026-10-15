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

## Corrections de la revue indépendante et signatures de la passerelle (15/10/2026)

Instance d'essai `atelier-corr` (3340, PG 54540), socle `2026.1012.0+7.git.e4cec9833` (patches 0001 à 0007), passerelle de
démonstration sur 3393 (`passerelle/dist`, état dans un dossier temporaire), `PAPERCLIP_ATELIER_GATEWAY_URL=http://127.0.0.1:3393`.
Instance et passerelle arrêtées à la fin (ports libérés, vérifié). Aucun appel de modèle, aucune dépense, aucune diffusion réelle.

| Vérification | Commande | Résultat |
| --- | --- | --- |
| Types du plugin | `cd plugin-atelier && npx tsc --noEmit` | 0 erreur |
| Tests du plugin | `pnpm test` | **392 réussis, 2 ignorés** (réseau réel) ; nouveaux : `revue-independante.spec.ts` (30), `signatures.spec.ts` (36) |
| Construction | `pnpm build` | `dist/` produit ; plugin installé sur l'instance (migration 005 acceptée par l'hôte) |
| Reproductions d'origine (`instance/revue-repro/`) | `pnpm exec vitest run --config <copie>/vitest.repro.config.mjs` | **3 échecs attendus** : R1 (service) « Un agent ne peut que créer une exigence », R2 « …se terminer par une étape d'approbation… », R3 `expected false to be true` ; R1 pur passe (voir `docs/revue-independante.md`, Suites données) |
| Mutations | vérification de signature neutralisée ; contrôle « tel quel » retiré ; non-répétition désactivée | détectées (2, 1 et 2 tests en échec) ; fichiers restaurés (`git checkout`, somme SHA-256 vérifiée) |
| Tests serveur de l'atelier | `scripts/tests-serveur.sh` sur `atelier-gardes`, `atelier-competences`, `atelier-suppression-entreprise`, `atelier-marketing-apps` | **4 fichiers, 39/39** (`atelier-gardes` : 23, dont H2, H3 verrou, 409 natif, course P2 / écriture, M3, B2) |
| Tests natifs voisins (verrou, politique, réouverture) | `scripts/tests-serveur.sh` sur `documents-service`, `issue-execution-policy`, `issue-comment-reopen-routes`, `issue-agent-mutation-ownership-routes` | **4 fichiers, 308/308** |
| Rejeu des patches | arbre jetable sur `v2026.1012.0`, `git am --3way socle/patches/000*.patch` (0001 à 0007, 0006 compris) | sans conflit ; arbre `dbb192efbf857956b423827a5ccf094e3d60aafa` identique à la branche (`e4cec9833`) |
| Scénario A | `python3 -I scripts/scenarios/atelier_scenarios.py A http://127.0.0.1:3340/api` | **33 OK, 0 écart** (`A-20261015T170145Z.json`) ; contrôle du passage en réel mis à jour : la publication déjà simulée et la porte franchie en démonstration donnent un refus (403), plus « préparée » (M1, M3) |
| Tous les autres | `ATELIER_INSTANCE_ESSAI="atelier-corr 3340 54540" … tous …` | B 15, C 10, D 9, G 25, H 25, K 19 + 1 écart, S 9, J 3, F 8, E 10 (`TOUS-20261015T171742Z.json`) |
| Scénario K rejoué | `… K …` | **20 OK, 0 écart** (`K-20261015T172018Z.json`) ; l'écart venait d'un attendu antérieur à §6 bis (réponse « reel » non signée acceptée) ; nouvel attendu : refus 400 « non signée par la passerelle » |
| Bout en bout §6 et §6 bis sur l'instance | essai Vitest hors dépôt (dossier temporaire) : secret natif créé (`POST /companies/:id/secrets`), configuration du plugin (`approbationClePrivee`, `passerelleClesPubliques`), réévaluation, approbation liée au compte, diffusion réelle | **1/1** : diffusion « préparée » avec preuve acceptée par `VerificateurPreuves` de la passerelle ; preuve absente du journal ; seconde publication 403 ; issue « executee » signée → `confirmee` ; dépôt signé → `reel` ; dépôt non signé → 400 |

## Clés de l'opérateur (`bootstrap-organisation.py cles`) et consignes de diffusion réelle (15/10/2026)

Instance d'essai `atelier-cles` (3440, PG 54640, `scripts/instance-essai.sh demarrer atelier-cles 3440 54640`), plugin installé depuis
`plugin-atelier/` (`POST /plugins/install`), passerelle de démonstration `passerelle/dist/src/demarrer.js` sur 3450 lancée avec
`instance/essai-cles-donnees/passerelle.env` (écrit par `cles`), données locales du bootstrap isolées
(`ATELIER_API=http://localhost:3440/api PAPERCLIP_INSTANCE_ID=atelier-cles ATELIER_DONNEES_LOCALES=<dépôt>/instance/essai-cles-donnees`).
Instance et passerelle arrêtées à la fin (ports 3440, 54640 et 3450 libres, vérifié). Aucun appel de modèle (agents de démonstration
`process`), aucune dépense, aucune diffusion vers une vraie plateforme.

| Vérification | Commande | Résultat |
| --- | --- | --- |
| Organisation hors ligne | `scripts/bootstrap-tests.sh` | **23 réussis, 0 échec** (dont 4 cas négatifs de consignes : arguments, preuve jointe, nouvel essai à l'aveugle, parcours de diffusion dans un rôle en lecture ; et 1 bloc `cles` de 10 vérifications contre une fausse API et un vrai openssl) |
| Organisation sur instance | `scripts/bootstrap-tests.sh --instance` (variables ci-dessus) | **31 réussis, 0 échec** : passe 1 : 36 écritures, passe 2 : 0 (idempotence) ; 11 agents, 3 objectifs, 2 projets, 3 routines ; dérives réalignées ; export contrôlé ; aller-retour d'import |
| Vérificateur et fichiers générés | `python3 -I scripts/verifier-organisation.py` ; `python3 -I scripts/bootstrap-organisation.py generer --verifier` | 9 contrôles, 0 erreur ; 14 fichiers à jour (verrou régénéré : six compétences en 1.2.0) |
| Mutations du bloc `cles` | sept mutants appliqués à une copie du script (droits 0644, clé privée affichée, rotation de la passerelle sans ajout préalable, rotation limitée à une entreprise, retrait qui efface les clés des autres entreprises, idempotence cassée, fichier public remplacé au lieu d'être complété) | tous tués |
| Passerelle | `cd passerelle && npm run typecheck && npx vitest run` | 0 erreur ; **408 réussis** (25 fichiers) ; nouveaux : rotation de la clé du plugin (deux clés acceptées, clé retirée refusée) et lecture de plusieurs clés d'approbation |
| Création des clés, instance | `cles --confirmer` | secret natif `atelier-approbation-cle-privee` créé (liste des secrets : `provider local_encrypted`, aucune valeur renvoyée), `instance/cles/` 0700, fichiers 0600, `approbationClePrivee` = `secret_ref`, `passerelleClesPubliques` = 1 clé ; second lancement : « Rien à faire » ; l'empreinte de la clé du journal de démarrage de la passerelle égale celle que `cles` affiche |
| Clé privée jamais exposée | recherche de `BEGIN … PRIVATE KEY` dans les journaux du serveur et de la passerelle, dans les sorties de la commande et dans le journal de l'atelier | aucune occurrence (seul `passerelle-signature.pem` la contient, 0600) |
| Réponse de la vraie passerelle | script d'essai (OAuth de démonstration, `tools/call gsc_requete_performances`) | signature `aev1` vérifiée avec la clé publique que `cles` a écrite dans le plugin ; dépôt `tache.donnees.deposer` : 201, mode « démonstration » |
| Réponse « réelle » signée avec la clé générée | chargeur de clé de la passerelle (`signataireDepuisEnv`) et `emballer("reel", …)` | dépôt 201, mode « reel » ; refusée (400, « non signée par la passerelle ») si un chiffre change, si la signature manque, si une autre clé signe, si les arguments ou l'outil diffèrent, ou dans une entreprise sans clé configurée |
| Valeurs par défaut | `pipedrive_personnes` appelé sans `start` ni `limit` | l'empreinte signée est celle des arguments AVEC `start=0` et `limit=100`, pas celle des arguments envoyés : d'où la consigne de donner chaque valeur explicitement |
| Preuve d'approbation, bout en bout | campagne réelle (agents de démonstration) jusqu'à l'approbation humaine, décision (publier, `facebook`, compte, 30 jours), `POST …/diffusions` avec `service`, `outil`, `arguments` | `201`, `etat: preparee`, `preuveApprobation` rendue : **signée par le worker avec la clé lue dans le coffre natif, acceptée par le vérificateur réel de la passerelle** (configuration lue depuis le fichier de clés publiques) ; refusée pour un texte modifié, un autre service, un autre compte, une passerelle sans clé |
| Rejeu et issue | même clé d'idempotence ; `POST …/diffusions/<id>/issue` | rejeu : preuve re-signée (200), autres arguments : 409 ; issue falsifiée, de démonstration ou pour d'autres arguments : 400 ; issue signée : `confirmee` ; seconde issue : 409 ; ni la preuve ni une clé privée dans le journal |
| Rotation de la clé de la passerelle (deux entreprises) | `--rotation passerelle`, `--basculer passerelle`, `--retirer-anciennes` | avant bascule : anciennes et nouvelle clés acceptées (201/201) ; après bascule : encore 201/201 ; après retrait : ancienne 400, nouvelle 201, dans les deux entreprises |
| Rotation de la clé d'approbation | `--rotation approbation`, `--basculer approbation`, `--retirer-anciennes` | preuve ancienne acceptée pendant toute la rotation ; preuve émise après la bascule signée par la nouvelle clé du coffre ; après retrait : ancienne refusée (« signature de la preuve d'approbation invalide »), nouvelle acceptée ; ancien secret supprimé |

**Constats pendant ces essais.** (1) Une entreprise tout juste créée n'apparaît pas tout de suite dans `GET /companies` ni par identifiant
(404 pendant quelques secondes) : `cles --entreprise` réessaie six fois. (2) Une rotation de la clé de la passerelle doit mettre à jour
TOUTES les entreprises configurées (la clé est commune) : prouvé ci-dessus et couvert hors ligne. (3) Une clé publique de la passerelle
ajoutée à la main dans le plugin n'est jamais retirée par `--retirer-anciennes` (seules les clés connues de l'état le sont).

**Non exécuté (et pourquoi).** Aucun appel d'outil d'écriture par HTTP sur une passerelle en mode réel (il faudrait une plateforme ou un
faux serveur par service : couvert par les 76 tests de `passerelle/tests/reel-social-crm/` contre de faux serveurs) ; aucun run
`claude_local` : les nouvelles consignes sont contrôlées par le vérificateur, pas jouées par un modèle.


## Contenus peut publier : politique native par outil (15/10/2026)

Décision de l'opérateur du 15/10/2026 : Contenus publie sur Facebook, Instagram et LinkedIn après approbation humaine de la publication exacte ;
les messages privés Facebook restent exclus. Instance d'essai `atelier-cont` (3480, PG 54680,
`PAPERCLIP_ATELIER_GATEWAY_URL=http://127.0.0.1:3495 scripts/instance-essai.sh demarrer atelier-cont 3480 54680`), passerelle de démonstration
`node passerelle/dist/src/demarrer.js` sur 3495 (état dans un dossier temporaire), données locales du bootstrap isolées
(`ATELIER_API=http://localhost:3480/api PAPERCLIP_INSTANCE_ID=atelier-cont ATELIER_DONNEES_LOCALES=<dossier temporaire>`). Instance et passerelle
arrêtées à la fin. Aucun appel de modèle, aucune dépense, aucune publication réelle (les appels d'essai natifs évaluent la politique, rien n'est
exécuté).

| Vérification | Commande | Résultat |
| --- | --- | --- |
| Organisation hors ligne | `scripts/bootstrap-tests.sh` | **25 réussis, 0 échec** (dont 2 cas négatifs nouveaux : « message privé interdit pour Contenus » refusé pour `facebook_envoyer_message doit être bloqué`, et « Contenus : publication sans la preuve jointe à l'appel » ; l'assertion de la fausse API contrôle la politique `block` par outil : sélecteurs `{connectionId, toolName: facebook_envoyer_message}`, condition sur l'agent Contenus seul) |
| Organisation sur instance | `scripts/bootstrap-tests.sh --instance` (variables ci-dessus) | **33 réussis, 0 échec** : passe 1 : 36 écritures, passe 2 : 0 (idempotence) ; 11 agents, 3 objectifs, 2 projets, 3 routines ; export contrôlé ; aller-retour d'import |
| Vérificateur et fichiers générés | `python3 -I scripts/verifier-organisation.py` ; `python3 -I scripts/bootstrap-organisation.py generer --verifier` | 9 contrôles, 0 erreur ; 14 fichiers à jour (verrou régénéré : compétence `redaction-declinaison-canal` en 1.3.0) |
| Connexions créées par les cartes, resserrées par le Gardien, puis appels d'essai natifs | `python3 -I scripts/scenarios/connexion_tardive.py http://localhost:3480/api <carte> publication` pour `atelier-facebook`, `atelier-instagram`, `atelier-linkedin` | voir le tableau suivant |

| Carte | Conforme après (sans action humaine) | Appels d'essai natifs au nom de Contenus |
| --- | --- | --- |
| `atelier-facebook` | 42,1 s | `facebook_publier` : `ask_first` (retenu, rien publié) ; `facebook_envoyer_message` : `off` / `deny_policy_block` |
| `atelier-instagram` | 90,1 s | `instagram_publier` : `ask_first` |
| `atelier-linkedin` | 90,1 s | `linkedin_publier` : `ask_first` |

Le vérificateur refuse maintenant, outre le parcours de diffusion dans un rôle en lecture seule (règle conservée pour tous les autres rôles), un
rôle qui écrit sur Facebook sans `facebook_envoyer_message` dans `outilsBloques`, un outil bloqué non nommé dans les consignes et un
`outilsBloques` sur un service où le rôle n'écrit pas.

**Non exécuté.** Aucun run `claude_local` de Contenus (les nouvelles consignes sont contrôlées par le vérificateur, pas jouées par un modèle) ;
aucune publication par une vraie plateforme ; l'appel de `facebook_publier` avec preuve d'approbation n'est pas rejoué ici (couvert par les essais de la
section précédente et par l'agent qui change le modèle d'approbation).

## Revue des signatures, côté serveur du plugin : contrat v1.6 (15/10/2026)

Corrections S-1, S-2, S-3, S-4, S-6, S-7 et S-8 (plus le complément plugin de S-5) de `docs/revue-securite-signatures.md`,
section « Suites données (plugin) » ; contrat `docs/contrats.md` §15. Instance d'essai `atelier-sig` (3460, PG 54660,
`PAPERCLIP_ATELIER_GATEWAY_URL=http://127.0.0.1:3465 scripts/instance-essai.sh demarrer atelier-sig 3460 54660`),
passerelle de démonstration `node passerelle/dist/src/demarrer.js` sur 3465 (état dans un dossier temporaire). L'instance 3100
utilisant `plugin-atelier/dist`, le plugin a été construit et installé depuis une COPIE hors dépôt (`pnpm build` dans la
copie ; `dist/` du dépôt inchangé) et les scénarios lancés depuis cette copie. Instance et passerelle arrêtées à la fin (ports
3460, 54660 et 3465 libres, vérifié ; 3100 non touchée). Aucun appel de modèle, aucune dépense, aucune diffusion réelle.

| Vérification | Commande | Résultat |
| --- | --- | --- |
| Types du plugin | `cd plugin-atelier && npx tsc --noEmit` | 0 erreur |
| Tests du plugin | `pnpm test` | **431 réussis, 2 ignorés (réseau réel), 16 fichiers** ; nouveau : `revue-signatures.spec.ts` (35) ; `signatures.spec.ts`, `regles-donnees-demo.spec.ts`, `donnees-connexion.spec.ts` adaptés au contrat (arguments et compte au dépôt réel, appel approuvé, clé dérivée, nature d'outil signée), aucune assertion retirée |
| Construction | `pnpm build` (copie hors dépôt) | `dist/` produit ; plugin `ready` sur l'instance, migration `006_appels_approuves.sql` acceptée par l'hôte (colonnes `appels_proposes.empreinte`, `diffusions.preuve_charge`, `revoquee_le`, `revocation_motif`, `sources.compte` présentes) |
| Preuves d'origine | `bash instance/revue-repro/poc-signatures/lancer.sh` | F-A, F-B, F-C : « non reproduit » ; F-D s'arrête (plus aucune preuve sans appel approuvé) : rejoué par le service dans `revue-signatures.spec.ts` |
| Mutants (copie hors dépôt) | 11 contrôles neutralisés un à un (empreinte non comparée, appel non exigé, structure non signée, chiffres hors JSON, nature d'outil, nom d'outil, charge figée, arguments, compte de campagne, révocation, même paire) | **11 tués** (les deux survivants du premier passage, nom d'outil et révocation, tués après ajout de deux tests) |
| Scénarios | `python3 -I scripts/scenarios/atelier_scenarios.py <X> http://127.0.0.1:3460/api` | A **33 OK**, B **15**, C **10**, F **8**, H **25**, K **20**, S **9** ; 0 écart |
| Routes v1.6 sur l'instance | essai par requêtes HTTP (entreprise du scénario B, tâche approuvée) | proposition 201 (aperçu, empreinte), même proposition 200, texte absent du livrable 400 ; `appelsProposes` dans le dossier ; décision avec empreinte forgée 400 ; `preuves/revocations` sans clé 409 |

**Non exécuté.** Diffusion réelle de bout en bout sur l'instance avec le nouveau parcours (secret natif, clés, appel approuvé,
preuve) : couverte par les tests de service avec le vérificateur réel de la passerelle, pas rejouée sur 3460 ; aucune
consultation de la liste de révocation par la passerelle (lot passerelle à venir).

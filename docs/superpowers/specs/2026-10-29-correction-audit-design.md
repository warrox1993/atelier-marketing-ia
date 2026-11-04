# Correction de 100 % de l'audit du 29/10/2026 : conception

Statut : à valider par l'opérateur (décisions du 30/10 intégrées). Auteur : Claude (session du 29/10/2026, nuit).

## 1. Intention

L'audit du 29/10 (vague 0 à 3, plus les audits A à D de l'après-midi) a cherché les erreurs de l'usine. Décision
de l'opérateur : « tu as trouvé les erreurs, maintenant tu dois les corriger totalement ». Cette conception décrit
comment corriger 100 % des constats, dans quel ordre et avec quelles preuves, AVANT de construire le plugin
`amelioration-usine` (mission `~/Téléchargements/prompt-amelioration-continue(1).md`). Le plugin reprendra
ensuite le même inventaire comme import initial de son registre, avec le statut réel de chaque constat.

Priorité absolue : qu'aucun agent ne puisse retirer sa cage ni prendre plus de pouvoir qu'il n'en a (lot S).
Rien d'autonome tant que ce n'est pas fermé.

## 2. Objectifs, non-objectifs, anti-objectifs

Objectifs :
- chaque constat de l'inventaire finit dans un statut prouvé : `corrigé` (test qui échouait avant et passe
  après, commit), `déjà corrigé` (commit ou fichier:ligne qui le montre), `infirmé` (preuve), `doublon de X`,
  ou `bloqué-JB` (question posée, réponse attendue) ;
- le lot S est corrigé, revu par l'agent `securite` et déployé avant tout le reste ;
- l'usine déployée sur 3100 reste au moins aussi capable qu'avant (règle 8) : aucune capacité retirée sans
  justification écrite, aucun test affaibli.

Non-objectifs :
- construire le plugin (étape suivante, conception à part, avec Spec Kit) ;
- les points « nouveau client » au-delà d'une correction d'hygiène (un seul client réel, plus JB) ;
- trancher à la place de l'opérateur une décision qui lui revient.

Anti-objectifs (échec même si « ça marche ») :
- un correctif qui casse une chaîne de département qui fonctionnait ;
- un run, un réveil ou un heartbeat d'agent de l'usine en production pendant les travaux ;
- une réponse aux deux cartes en attente (Juridique et Observatoire) (interdit tant que le réveil n'est pas corrigé, lot L) ;
- un statut « corrigé » sans test ni preuve ;
- le mot désignant le client réel écrit dans le dépôt de l'usine.

## 3. Source : l'inventaire

`~/amelioration-usine/import/audit-29102026/inventaire.jsonl` : 475 lignes extraites de 23 rapports
(scratchpad `audit-cible/` et `audit-final/`) par 3 agents, 436 après dédoublonnage interne à chaque rapport.
Clé unique : `rapport` + `id`. Champs : titre, constat, preuve, priorité, correctif proposé, effort, lot,
décideur (auto ou JB), question pour l'opérateur, doublon.

| Lot | Contenu | P0 | P1 | P2 | P3 | ? | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S | sécurité : cage, permissions, injection, exfiltration, secrets | 1 | 9 | 15 | 8 | 17 | 50 |
| R | RGPD et droit | 1 | 11 | 9 | 5 | 4 | 30 |
| L | cartes, réveils, visibilité, alertes, exploitation, sauvegarde, Gardien | 0 | 26 | 25 | 11 | 12 | 74 |
| G | consignes, langue, style, skills | 0 | 14 | 58 | 27 | 19 | 118 |
| P | contrôles et portes de qualité | 1 | 10 | 24 | 9 | 5 | 49 |
| O | Observatoire | 0 | 11 | 19 | 13 | 5 | 48 |
| A | apprentissage, erreurs répétées | 0 | 3 | 6 | 1 | 1 | 11 |
| D | documentation | 0 | 0 | 12 | 18 | 0 | 30 |
| H | hygiène, dette mineure, « nouveau client » | 0 | 1 | 5 | 19 | 1 | 26 |

71 constats ont le décideur JB. Les lots ont été proposés par les agents d'extraction : le triage (section 4)
peut déplacer un constat d'un lot à l'autre.

Constats des audits A à D de l'après-midi : une partie a déjà été corrigée et déployée le 29/10 (lots A à E de
l'efficience, références C1, C2, patches 0106-0107). Le triage le vérifie et les classe `déjà corrigé`.

## 4. Déroulé de chaque lot

1. **Triage** (0 run, lecture du code, des journaux et de `git log`) : dédoublonnage entre rapports ; pour
   chaque constat, « toujours vrai aujourd'hui ? » avec preuve ; constats `v3-contre-verif` (CV-n) rapprochés de
   leur identifiant d'origine. Sortie : le statut et, pour les constats ouverts, le fichier:ligne à toucher.
   Le triage est écrit dans `inventaire-statut.jsonl` (même dossier), une ligne par clé.
2. **Décisions de l'opérateur** : les questions du lot sont regroupées et posées en une fois (4 au plus par écran),
   avec le gain et le coût de chaque réponse ; un constat sans réponse reste `bloqué-JB` et n'empêche pas les
   autres.
3. **Plan du lot** (superpowers:writing-plans) : tâches courtes, fichiers séparés par tâche.
4. **Correction en TDD** : test qui échoue, plus petit changement (Ponytail), suite ciblée verte, commit par
   étape verte. Contrôle par mutation pour les gardes de sécurité critiques (la garde retirée doit faire
   échouer le test).
5. **Vérification complète** (skill `verification`) une fois par lot : suites de l'usine
   (`scripts/tests/tester-*.py` et `.sh`, `verifier-organisation.py`, `bootstrap-tests.sh`), plugin
   (`pnpm typecheck && pnpm test`), passerelle, socle (vitest sur `src`, comparaison de la liste des échecs
   avant et après, puisque des échecs connus existent déjà), banc local pour ce qui touche les agents.

## 5. Ordre et contenu

### Lot S : sécurité (d'abord, puis revue `securite`, puis déploiement)

Décisions techniques prises (issues des correctifs de l'audit, vérifiés dans le code le 29/10) :

- **C1, N1, point A, point B, point C : aucun agent ne modifie la configuration d'un agent, ni la sienne ni
  celle d'un autre.** Patch du socle 0108 : quand l'acteur est un agent, refus de `PATCH /api/agents/:id` (tous
  les champs, `replaceAdapterConfig` compris, donc `filesystemExtraPaths`, `networkScope`,
  `dangerouslySkipPermissions`, profil, rôle, nom, `runtimeConfig`, budget, `desiredSkills`), de
  `/agents/:id/skills/sync` et des routes voisines d'écriture de configuration. Justification : aucun PATCH
  d'agent n'apparaît dans les journaux, aucun usage légitime n'est perdu. Références :
  `authorization.ts:2418-2428`, `routes/agents.ts:2576-2633`, `:3645-3653`, `:5158-5215`, `:5349-5356`,
  `local-process-sandbox.ts:609-625`, `execute.ts:458`. Test de mutation.
- **N4** : `PATCH /agents/:id/permissions` et la liaison d'approbations réservés au board
  (`agents.ts:4700-4725`, `issues.ts:4844-4856`), même patch ou patch voisin.
- **Cartes réservées aux humains** (V2-5) : `interactionResolverGovernance` à `human_only` dans les 29
  entreprises (`validators/company.ts:10-21,40`), posé par le bootstrap pour tenir dans la durée.
- **N2** : routes `tache.sources.lire`, `tache.liens.verifier`, `tache.obs.collecter` réservées à l'agent
  assigné à la tâche en cours (`checkout: "always-for-agent"`), liste de rôles autorisés par route depuis le
  registre, refus des URL dont la chaîne de requête est longue ou encodée (`plugin-atelier/src/contrats/routes.ts`,
  `services.ts:1041-1075,1167-1185`).
- **N3** (réponse de l'opérateur : seul le coordinateur assigne) : politique d'assignation protégée par entreprise et
  `create_task` / `create_project` retirés des non-coordinateurs (le retrait seul ne suffit pas à cause de curl,
  d'où la politique côté serveur).
- **É1** : `garde-memoire.mjs` lit aussi `-w` / `--write-out` (`%output{…}`) et passe en liste blanche des options
  d'écriture ; dossier de configuration des agents monté en lecture seule, sauf `memoire/` en écriture
  (`execute.ts:603-605`). N6 (casse de `file:`) fermé par la même garde.
- **É2** : `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` dans l'environnement des agents (documentation officielle
  vérifiée le 29/10 : stable, retire les identifiants de l'environnement des commandes, hooks et serveurs MCP
  locaux ; présente dans la version 2.1.308 installée). Contrôle : un `env` lancé par un agent ne montre plus le
  jeton, et la garde mémoire fonctionne toujours.
- **M3** : `canCreateSkills` à faux pour tous les agents.
- **N5** : WebFetch retiré là où la cage le rend inutile, `connection_request` retiré aux rôles indépendants.
- **Injection** : images et liens tiers refusés à l'export et sur le site de l'Observatoire (V2-1) ; caractères
  invisibles retirés du contenu externe (V2-2, `contenu-externe.ts:23-37`) ; Observatoire marqué public (V2-6).
- **Réservation des connexions** réellement appliquée aux outils de la passerelle.
- **Gardien** : agents indexés par identifiant enregistré et non par nom (`bootstrap-organisation.py:1267-1274`,
  `:1855-1880`), un agent manquant ne bloque plus tout son passage (`:246-252`, `:2059-2062`) ; puis reprise.
- **Chargement des skills** (cassé depuis le 19/10, liens hors de la cage, `prompt-cache.ts:149-154`,
  `execute.ts:606`) : fichiers copiés ou cibles montées en lecture seule ; preuve par la liste des skills vue
  par l'agent au banc.
- Les autres constats S de l'inventaire après triage.
- En parallèle : consigne `-o` retirée de `organisation/consignes/communes.md:26` ; sauvegarde complète
  (constat de sauvegarde incomplète) ; push des commits par `scripts/publier.sh`.

Fin du lot S : une revue `securite` (Opus, `xhigh`) sur le diff cumulé du lot, avec fichiers et lignes ;
correction de ses constats ; puis déploiement (section 7).

### Lot R : RGPD et droit (avant le 19/11/2026)

Tout ce qui touche les données des 136 praticiens attend la décision de l'opérateur (informer, article 14, ou supprimer
listes et numéros, journaux et sauvegardes compris ; transmission au Juridique). Les questions R sont posées dès
la fin du triage, sans attendre la fin du lot S, à cause de l'échéance. Les correctifs techniques sans décision
(durées de conservation codées, captation corrigée, preuve du consentement) avancent en parallèle.

### Lots suivants, dans cet ordre

- **L** : réveil garanti après une réponse de l'opérateur, pause sans annulation brutale, badges justes, cartes visibles
  avec lien vers le livrable, état « en pause » affiché, registre des échanges accessible, alertes (runs en échec,
  connexion Claude) sur le canal que l'opérateur choisira, journal système plafonné.
- **G et P** : consignes (`Prefer: return=minimal`, annuaire des agents, langue et style, réveil en français,
  règle des cartes, skills corrigés) ; porte Marketing réellement posée (ancien P0 MK-01), contrôles de
  l'Observatoire rendus effectifs.
- **O et A** : droits de collecte, fraîcheur des traductions, routes de lecture et de recherche, flux de
  l'Observatoire vers la Direction ; détecteur d'erreurs répétées (prototype `sig.py`), pièges partagés.
- **D et H** : documentation remise d'accord avec le réel ; hygiène et points « nouveau client ».

Une revue `securite` unique à la fin des lots L à H, sur leur diff cumulé, seulement pour les parties qui
touchent la sécurité ; une passe `ce-code-review` par ensemble de lots.

## 6. Décisions qui reviennent à l'opérateur

Toujours bloqué-JB, jamais tranché par Claude : RGPD des 136 praticiens et transmission de la carte au Juridique ; Write pour Relecteur,
Directeur et Relecteur indépendant ; montées de modèle ou d'effort, escalier d'effort ; canal d'alerte ; purge
des instances d'essai ; chiffrement des sauvegardes ; BCE ; cadence de l'Observatoire ; volume de runs payants ;
publication, style éditorial, suppression de données. Plus les 71 questions de l'inventaire, regroupées par lot.

Lues comme déjà accordées par la réponse de l'opérateur du 29/10 (« 100 % de tout ce que tu as indiqué ») : les
correctifs recommandés du bloc 1 de la synthèse finale (cartes réservées aux humains, Observatoire public, images
et liens tiers interdits, réservation appliquée, reprise du Gardien). C'est une lecture de Claude, à confirmer
par l'opérateur en validant ce document.

Question nouvelle pour l'opérateur, dans le lot S : passer la 3100 en mode authentifié
(`scripts/passer-en-mode-authentifie.sh`, prouvé sur l'instance d'essai le 22/10, jamais appliqué). Effet :
une requête sans jeton n'est plus l'administrateur, ce qui ferme l'impact réel de C1 (chaîne d'escalade 3).
Coût : deux gestes de l'opérateur dans le navigateur et une session de 30 minutes au plus.

## 7. Contraintes

- Aucun run, réveil ou heartbeat d'agent de l'usine en production ; le banc local (faux serveur Anthropic) est
  permis. Ne jamais répondre aux deux cartes en attente (Juridique et Observatoire). Ne jamais relancer le serveur de dev du site.
- Interdits de lecture : `instance/instances/*/secrets/`, `instance/instances/*/db/`, `instance/cles/`, valeurs
  de `config/*.env`, `instance/passerelles/*.env`, `~/.config/atelier/*`, `~/.config/claude-code/notion.env`.
- Déploiement (accord permanent de l'opérateur du 27/10, `feedback-deployer-usine-auto`) : sauvegarde sur
  `/mnt/donnees/Systeme/Sauvegardes/atelier/`, photo avant et après, relance par systemd après vérification
  qu'aucun run n'est en cours, `mettre-a-jour-client` ou build du socle selon le cas, contrôle de santé.
- Push : `scripts/publier.sh` puis `git push https://github.com/warrox1993/atelier-marketing-ia.git publication:main` ;
  jamais de GitHub Actions sur un dépôt privé.
- Sous-agents : 3 au plus en parallèle sur l'usine, chacun sur des fichiers séparés ; `executant` (Sonnet) à
  l'effort `medium` passé explicitement, escalier ensuite ; consigne en 8 points ; pas de copie de travail git
  (worktree) pour ces agents ; les petites corrections faites par Claude lui-même.
- `graphify query` avant toute recherche dans le code ; globs entre apostrophes en zsh.
- Tout en français ; justifier chaque changement (ce que ça fait, ce que ça change) ; rapport dans Notion (page
  du jour de la mission, et la page de l'audit 408315e5… pour les statuts), mémoire à chaque étape.
- Quota : la session et les agents consomment l'abonnement ; compactage proposé à l'opérateur vers 300 k.

## 8. Laissé au constructeur

- Le découpage fin de chaque lot en tâches (plan du lot).
- Le choix entre copie des fichiers de skills et montage en lecture seule des cibles, selon ce que le banc prouve.
- La forme exacte de la liste de rôles par route du plugin (registre `organisation/agents` ou constante), tant
  qu'elle est testée.
- Le format de `inventaire-statut.jsonl`, tant qu'il garde la clé `rapport` + `id` et un statut de la section 2.

## 9. Réponses au contrôle du constructeur (29/10)

Un relecteur neuf a lu ce document sans contexte et a posé 9 questions. Réponses :

- **Fin de l'interdiction des runs** (choix de Claude) : l'interdiction tient pendant toute la correction ET la
  construction du plugin, jusqu'à ce que l'opérateur la lève. Chaque déploiement se prouve par les suites, le banc local
  et une instance d'essai ; la relance du service par systemd n'est pas un run d'agent.
- **Lot S « fermé »** (choix de Claude) : le lot S se déploie dès que tous ses constats `auto` sont corrigés et
  revus ; un constat S resté `bloqué-JB` n'empêche pas les lots suivants, mais aucune boucle autonome (timers du
  plugin) n'est activée tant qu'un constat S qui permet de sortir de la cage reste ouvert.
- **N3, qui est « le coordinateur »** (choix de Claude, vérifié au triage) : l'agent de rôle `ceo` de chaque
  entreprise (29 : coordinateurs de service, coordinateur général de la Direction, directeur de l'Observatoire).
  Le triage relève dans les journaux qui crée ou assigne des tâches aujourd'hui ; si un autre rôle le fait dans
  une chaîne qui marche, le cas passe en `bloqué-JB` au lieu d'être cassé.
- **Sauvegarde et RGPD** (choix de Claude) : la sauvegarde complète se fait maintenant (le risque de perte passe
  avant) ; si l'opérateur choisit la suppression dans le lot R, le lot R comprend la purge des sauvegardes concernées.
- **Nom du client dans l'historique** (déjà réglé par le dépôt) : `scripts/publier.sh` publie l'arbre NETTOYÉ de
  la branche source sur une branche `publication` à parent unique, sans l'historique, et refuse la publication si
  le nom du client apparaît (`MOTIF_CLIENT`, ligne 42 et 144-147). Aucune réécriture d'historique n'est prévue.
- **Seuil des URL de N2** (choix de Claude) : la protection principale est la restriction à l'agent assigné et au
  rôle ; le seuil de la chaîne de requête est fixé au-dessus de la plus longue URL légitime déjà présente dans
  les sources enregistrées (mesurée au triage), et testé contre des URL réelles de l'Observatoire.
- **Décisions de l'opérateur du 30/10** :
  - bloc 1 de la synthèse accordé en entier (cartes réservées aux humains, Observatoire public, images et liens
    tiers interdits sur le site et à l'export, réservation des connexions appliquée) ;
  - mode authentifié de la 3100 DANS le lot S : `scripts/passer-en-mode-authentifie.sh`, après avoir vérifié
    et testé sur l'instance d'essai que tous les scripts de l'usine (bootstrap, `mettre-a-jour-client`,
    Gardien, `verifier-organisation.py`, sauvegarde, santé, passerelle) marchent avec la clé board ; JB crée
    son compte et fait les 2 validations dans le navigateur pendant que le script attend ;
  - Gardien repris en production après le lot S, une fois testé sur l'instance d'essai (script, 0 jeton) ;
  - N5 accordé en entier. Justification donnée à l'opérateur : la prospection et l'enrichissement gardent leurs trois
    voies vers le web (WebSearch exécuté chez Anthropic, route `sources` du plugin, connexions de la passerelle) ;
    WebFetch part de l'intérieur de la cage, qui ne laisse sortir que vers Anthropic, d'où 0 appel dans les
    journaux.

# Reprise : Atelier Marketing IA

## État au 16/10/2026, au soir

Cette section prime sur les suivantes en cas de doute. Elle suffit pour reprendre sans rien redemander. Historique des lots
de l'après-midi et du soir : `git log --oneline 51be4b1..HEAD` (tête `7bc4dd2`, copie de travail propre).

### 1. Ce qui tourne

- Une instance et une passerelle, sous **systemd utilisateur** (`atelier-instance@<id>`, `atelier-passerelle@<port>`),
  linger activé, redémarrage automatique en cas d'échec :
  - instance `atelier` (3100) avec la passerelle 3190 ;
  - l'instance d'aperçu `atelier-apercu` (3580, base 54780) et ses passerelles 3581 et 3582 sont arrêtées définitivement
    (unités désactivées le 17/10/2026) : ne plus les attendre ni les viser.
- Fichiers d'environnement : `~/.config/atelier/<id>.env` (ports et URL, aucun secret).
- Santé : `atelier-sante@<id>.timer` toutes les 5 minutes (`scripts/sante-atelier.sh --notifier`, notification bureau).
- Sauvegarde hors machine : `atelier-sauvegarde.timer`, chaque jour à 03 h 30, vers `/mnt/donnees/Systeme/Sauvegardes/atelier`
  (14 copies, empreintes vérifiées). Détail : `docs/exploitation.md` §3 (« Sauvegarde hors machine ») et §16.
- `instance/plugin-apercu` (données locales, ancien plugin de l'instance 3580) n'est plus déployé ni sauvegardé.
- Dernier patch du socle : `0047` (traductions). Si un patch `0048` est apparu depuis (`ls socle/patches | tail -3`), il vient
  de l'agent sécurité : le lire avant de déployer.

### 2. Déployer et publier

- Plugin et socle : `scripts/deployer.sh --journaux ~/.cache/atelier-journaux`
  (`docs/exploitation.md` §15). Le script exige un arbre propre dans le dépôt et dans `paperclip/`.
- Passerelles : `cd passerelle && npm run build`, puis `systemctl --user restart atelier-passerelle@<port>`. Ne plus utiliser
  `passerelles.sh demarrer` pour celles que gère systemd.
- Publication : `scripts/publier.sh`, puis push par l'opérateur. Dernier état publié : `fc8c074` sur `main` de GitHub (16/10).
  Les commits postérieurs (sous-commande purger, dossiers par identifiant d'entreprise) ne sont pas encore poussés.

### 3. Lots livrés le 16/10 (commits sur `main`)

- **Renvoi au Coordinateur** d'un livrable bloqué, concurrence, retour arrière, consigne en cas de cycles épuisés : `ac3d451`, `dd9b998`.
- **Couverture de prospection** calculée par la machine (zones à interroger, porte contre les zones oubliées et les totaux faux) :
  `0d1ed16`, `5650cff`, `bc363ba`, `62ad323`, `5307641`.
- **Critères de qualification du courtier de démonstration**, lots 1 à 3 (18 critères codés) : `c3bd5fb`, `fcb2613`, `0a0f778`, `3c818d7`.
- **Passage au réel** (état des branchements, ce qu'ils débloquent, qui agit, leads concernés) : `72dc32b`, `11c2699`.
- **Revue indépendante corrigée** (C1, M1 à M9, mineurs) ; suites de sécurité : M2 résiduel `4bc4fad`, m5 et m7 `f9f2ae4`, m6 `e4520db`,
  tests de croissance contre les ReDoS et les bombes `8b50c51`. Statut par constat : `docs/revue-independante.md`.
- **Traductions du socle** : patches `0045` (`4e90ba4`), `0046` (`8f1c572`), `0047` (`79d5229`).
- **Supervision** (unités systemd, contrôle de santé) : `10f0513`, `fa74265`. **Sauvegarde hors machine** : `e8b8cdb`.
  **Relevé mensuel des coûts IA** par entreprise et par agent (`scripts/releve-couts.py`) : `e88c73e`.
- **Mention d'information IA** sur les messages directs de la passerelle (article 50 du règlement européen sur l'IA) : `b1f7289`.
- **Nouveau client** (`bootstrap-organisation.py nouveau-client`, §17 de `docs/exploitation.md`) : `4ae0de7`.
  **Purge** de fin de contrat et droit à l'effacement (§18) : `8d14c59`.
- **Cloisonnement** : dossiers locaux des agents rangés par identifiant d'entreprise (anciennes dispositions par slug reconnues
  à la purge) : `f5f7e15`, `7bc4dd2`.
- **Réveil immédiat** du Coordinateur après une demande à l'équipe : `eb8ae2d`.
- **Démonstration du courtier** : positions des bureaux reprises du référentiel des codes postaux : `6861b49`.
- **Dépendances** : `@paperclipai/shared` forcé à 2026.1012.0 (GHSA-3pw3-v88x-xj24, alerte sprintf-js fermée) : `f5f3f8b`.
- **Hygiène** : plus aucun nom du client de démonstration dans les fichiers suivis : `272f050`.

### 4. Décisions de l'opérateur

- Les agents tournent sur l'abonnement Max « pour le moment » : pas de clé d'API.
- Priorité à un fonctionnement parfait en local avant toute vente.
- Service géré pour les clients : pas encore tranché.

### 5. Restes, dans l'ordre

1. Trier les anciens dossiers `instance/agents-atelier/<rôle>` et `instance/claude-config/<rôle>` (disposition d'avant le rangement
   par identifiant d'entreprise).
2. Passer l'instance 3100 en réel (non fait) .
   (Les cartes COUA-3, COUA-4 et COUA-5 de l'ancienne instance 3580 disparaissent avec elle.)
3. Fixer la durée de validité de la liste « Ne m'appelez plus » (30 jours proposés).
4. Relire la mention d'information IA en NL et en EN.
5. Sécurité ouverte : m1 (données additionnelles authentifiées du chiffrement) et m8 (HTML caché). CodeQL non activé sur GitHub :
   accord de l'opérateur attendu.
6. Essai réel de `nouveau-client` sur une instance d'essai (il n'a été prouvé qu'avec une fausse API).
7. Confirmer la licence ODbL des données OpenStreetMap.
8. Accès mobile par Tailscale (9 étapes ci-dessous), clé OpenAI pour la voix (`docs/voix-en-direct.md`), réindexation bge-m3 (script `scripts/reindexer-connaissances.py` retiré le 16/10/2026) : encore à faire d'après ce document, à confirmer avant de les lancer.

Étapes de l'accès mobile (aucun document de `docs/` ne les détaille ; `docs/evolution-deploiement.md` décrit les modes de déploiement) :

1. JB installe Tailscale 1.104 depuis le dépôt apt officiel, puis lance `tailscale up --netfilter-mode=off --accept-dns=false`
   (son Mullvad utilise le DNS 100.64.0.29).
2. JB active MagicDNS et HTTPS.
3. JB règle les ACL sur tcp:443.
4. Copier `config/atelier-distant.env.exemple` vers `config/atelier-distant.env`, le remplir, valider avec
   `scripts/verifier-config.sh --distant`.
5. Relancer l'instance 3100 (`systemctl --user restart atelier-instance@atelier`).
6. `tailscale serve --bg --https=443 http://127.0.0.1:3100`, jamais Funnel.
7. JB crée son compte et ouvre l'URL de réclamation du tableau affichée dans le terminal.
8. Fermer les inscriptions avec `PAPERCLIP_AUTH_DISABLE_SIGN_UP=true`, puis renseigner une fois le réglage `humainDestinataire`.
9. Essais sur téléphone.

Mise à jour du 16/10/2026 au soir. Seul responsable du code à cette date : l'intégrateur final. Historique : `git log`.

## État réel

- **Architecture** : plugin officiel Paperclip `atelier.marketing-ia` (`plugin-atelier/`,
  choix explicite de l'opérateur limité au système de plugins) + patch serveur isolé (P1, P2, régulateur,
  journal des compétences, suppression d'entreprise). Vue d'ensemble : `docs/architecture.md` ;
  contrats v1.4 : `docs/contrats.md` (§11 décisions du 15/10/2026, §12 plafonds, §13 données simulées).
- **Socle** : `paperclip/` = tag `v2026.1012.0` + les patches locaux `socle/patches/0001` à `0047`.
  Le patch `0007` (revue indépendante) : P2 exige pour `done` un humain, l'étape d'approbation et une décision
  « approuver » valide sur la révision courante ; livrable verrouillé (verrou natif) pendant l'approbation ; révision
  relue `for update` ; sources dans la fraîcheur ; `commentRequired` dans P1. Rejeu 0001 à 0007 sur le tag : arbre
  identique à la branche.
  Le patch `0005` met en « Ask first » par défaut toute action non `read` des cartes `atelier-*` et classe en écriture les
  verbes français de la passerelle (`docs/integrations.md`, « Intégration des connecteurs »).
  Le patch `0004` (lot L6) ajoute 11 cartes de galerie « passerelle marketing » (Google Search Console,
  Google Analytics 4, Google Ads, fiche d'établissement, Facebook, Instagram, LinkedIn, HubSpot, Pipedrive,
  Odoo, Teamleader) ; adresse par `PAPERCLIP_ATELIER_GATEWAY_URL` (défaut `http://127.0.0.1:3190`) ;
  libellé « (démonstration) » lu sur `GET /sante` de la passerelle. Détail et preuves : `docs/integrations.md`,
  section « Lot L6 ». **L'instance 3100 ne montre les cartes qu'après un redémarrage** (code chargé au démarrage).
- **Plugin** : migrations `001`, `002` (relances), `003` (plafonds), `004` (sources de connexion), `005` (appel d'outil des diffusions), worker, interface (six rubriques, dossier,
  décision, relance de correction, Reprendre, Diffuser), agents de démonstration (`demo/`).
- **Interface** : démarche Impeccable du lot C (captures `docs/captures/`, tests `tests/ui/`, e2e
  `tests/e2e/atelier/`, README du dossier) ; nouveaux panneaux de l'intégration sans nouvelle
  passe Impeccable (mêmes composants et jetons).
- **Organisation** : 13 agents marketing `claude_local` + agent déterministe `porte`
  (process) ; usine étendue le 17/10/2026 (`docs/usine-services.md`) ; politiques alignées sur le circuit 1.1 ; bootstrap idempotent vérifié en mode réel.
- **Décisions de l'opérateur du 15/10/2026 appliquées** : aucun livrable non conforme accepté ni
  diffusé (relance humaine à leviers, levée de porte retirée) ; rejet = annulation native ;
  bouton Diffuser ; **priorité au mode réel** (les agents déterministes restent un banc de test).
- **Plafonds de dépenses (décision de l'opérateur du 15/10/2026)** : le client choisit un montant maximal ou
  « aucune limite ». Coûts IA = budgets natifs de Paperclip (0 = aucune limite), réglés dans
  Paramètres et tracés. Dépenses publicitaires = plafond par campagne et par entreprise
  (`plafondPub`, migration 003) ; engagé = dépensé + réservé ; le serveur refuse toute approbation
  ou diffusion qui dépasse, et toute dépense sans approbation à montant, canal et durée précis,
  même sans limite ; aucun choix = aucune dépense ; un agent ne modifie rien. Détail :
  `docs/contrats.md` §12, `docs/dictionnaire-etats.md` §11 ; scénario H.
- **Données simulées (lot L9)** : un agent dépose la réponse BRUTE d'un outil de la passerelle
  (`POST …/taches/:issueId/donnees-connexion`) ; le serveur en déduit le mode (enveloppe `_atelier`,
  mention, identifiants fictifs), refuse un mode déclaré ou une réponse sans enveloppe, retient les
  chiffres. La porte refuse un chiffre ou une source de démonstration sans la mention « démonstration »
  dans son paragraphe, sa liste, son tableau ou le titre de sa section (constat localisé), et toute
  donnée de démonstration dans une campagne réelle (campagne OU entreprise en mode réel) ; la
  diffusion réelle aussi. `atelier.sante` liste les 11 services de la passerelle (réel : Google
  implémenté par L4 mais jamais exécuté, les sept autres non implémentés). Détail : `docs/contrats.md` §13 ; scénario K.
  Les consignes des cinq rôles concernés (`organisation/agents/*/AGENTS.md`) la décrivent depuis
  l'intégration des connecteurs (identité d'abord, dépôt de chaque réponse, mention, aucun chiffre inventé).
- **Connecteurs dans l'usine (intégration du 15/10/2026)** : « Connecter » ouvre la carte native du service ;
  connexions réservées par rôle par `bootstrap-organisation.py appliquer` (relancer après chaque nouvelle connexion) ;
  écritures en « Ask first » ; mode effectif affiché dans la campagne et appliqué à la diffusion ; scénario A complet
  (33 OK). Détail : `docs/integrations.md` ; preuves : `docs/resultats-tests.md`.
- **Revue indépendante (15 constats) et revue de sécurité §6, §6 bis : corrigées le 15/10/2026** (contrats v1.5,
  `docs/contrats.md` §14 ; statut par constat : `docs/revue-independante.md`, « Suites données »). Décisions de l'opérateur appliquées :
  un agent ne fait que CRÉER une exigence (H1) ; total payant par révision (B3) ; `done` sous porte = approbation humaine
  réelle (H2). Preuve d'approbation Ed25519 signée par le plugin (clé privée dans un secret natif de Paperclip, référencée par
  la configuration du plugin `approbationClePrivee`), issue rapportée par `tache.diffusions.issue` (réponse signée de la
  passerelle) ; signature `_atelier` vérifiée au dépôt avec `passerelleClesPubliques`. B6 (verrou des plafonds en mémoire) :
  documenté, non corrigé.
- **Instances** :
  - principale `atelier` (3100) : utilisée par l'opérateur, sous systemd (`atelier-instance@atelier`) ; ne pas y réinstaller le plugin
    depuis une autre session ; déployer avec `scripts/deployer.sh`.
  - aperçu `atelier-apercu` (3580, PG 54780, passerelles 3581 et 3582) : ARRÊTÉ définitivement le 17/10/2026, unités désactivées.
  - essai `atelier-corr` (3340, PG 54540, corrections de la revue, passerelle de démonstration sur 3393) : arrêtée ;
    données dans `instance/instances/atelier-corr/` (entreprises des scénarios A à S, secret d'essai et configuration du
    plugin sur l'entreprise du scénario A).
  - essai `atelier-lotz` (3320, PG 54520, intégration des connecteurs, passerelle de démonstration sur 3391) :
    arrêtée ; données dans `instance/instances/atelier-lotz/` (entreprises « Rénovation Liège » avec trois connexions
    de cartes, scénarios A, dossiers e2e).
  - essai `atelier-lot9` (3260, PG 54460, données simulées) : arrêtée ; données dans
    `instance/instances/atelier-lot9/`.
  - essai `atelier-loth` (3220, plafonds) : arrêtée ; données dans `instance/instances/atelier-loth/`.
  - essai `atelier-lot6` (3240, PG 54440, cartes de galerie L6) : arrêtée ; données dans
    `instance/instances/atelier-lot6/` (entreprise « Essai L6 (démonstration) », 2 connexions de démonstration).
  - essais `atelier-lota` (3120), `atelier-lotc` (3140), `atelier-lote` (3180, intégration
    finale) : arrêtées ; données dans `instance/instances/<id>/`.

## Ce qui est prouvé

Voir `docs/resultats-tests.md` (commandes, sorties, dates) et `docs/tracabilite.md`.

## Limites et points ouverts

- Mode réel : l'instance 3100 n'est pas passée en réel (agents sur l'abonnement Max pour le moment). Procédure : `claude setup-token` par l'opérateur, puis `bootstrap-organisation.py jeton
  --confirmer` et `test-reel --confirmer` (`README.md` §3, `docs/checklist-usage-reel.md`).
- `curl` des agents réels non borné : `networkScope: "allowlist"` (stable dans l'adaptateur,
  Bubblewrap présent) non activé faute de pouvoir valider la liste d'hôtes sans run réel.
- Lecture d'URL du plugin non exposée comme outil Claude : les agents passent par les routes.
- Aucun connecteur de diffusion ni de mesure ; recherche Web absente ; pause de campagne
  indisponible (limite du socle).
- Une connexion ajoutée par une carte reste ouverte à tous les agents jusqu'au passage du Gardien des connexions (environ 90 s).
- Tâches parallèles d'un même agent : le socle peut annuler un run qui a déjà écrit puis bloquer la tâche sans
  rejeu (vu une fois au scénario A) ; reprise humaine (« Reprendre ») nécessaire.
- Diffusion réelle des réseaux sociaux et CRM : preuve d'approbation signée par le plugin (v1.5), jamais exercée contre un
  vrai réseau (aucun compte réel). À faire par l'opérateur : paire Ed25519 du plugin
  (`openssl genpkey -algorithm ed25519 -out approbation.pem`), clé privée enregistrée comme secret de l'entreprise puis
  choisie dans la configuration du plugin (`approbationClePrivee`), clé publique
  (`openssl pkey -in approbation.pem -pubout`) dans `PASSERELLE_APPROBATION_CLE_PUBLIQUE_FICHIER` ; clé publique de la
  passerelle (journal de démarrage) dans `passerelleClesPubliques`. Sans elles : diffusions réelles « préparées » sans
  preuve, et aucune donnée de connexion tenue pour réelle.
- Consignes des agents à compléter (dossier `organisation/`, autre lot) : déposer les `arguments` de l'appel avec la
  réponse (contrôle du rejeu), demander une diffusion réelle avec `service`, `outil` et `arguments` EXACTS puis joindre
  `preuveApprobation` à l'appel d'outil et rapporter la réponse par `tache.diffusions.issue` ; seule la « Porte de
  contrôle » évalue la porte.
- Interface (autre lot) : libellé de l'action externe `modifier_crm` dans `src/ui/format.ts` (`ACTIONS_EXTERNES`) et choix
  de cette action dans la décision ; affichage de l'état « confirmée » rapporté par la passerelle.
- B6 : verrou des plafonds en mémoire (un seul worker supposé) ; correction durable par ligne de réservation, à décider.
- Commentaires natifs de relance et de rejet signés par le plugin (attribution humaine non
  demandée : capacité supplémentaire).

## Prochaine étape

Voir la section « État au 16/10/2026, au soir », paragraphe 5 (restes). Pour le passage au réel : jeton par l'opérateur, premier run
réel minimal (`test-reel --confirmer`), campagne de test avec budgets bas, décision sur `networkScope`.

## Commandes utiles

```bash
cd ~/Projets/atelier-marketing-ia
scripts/verifier-config.sh
scripts/instance-essai.sh demarrer atelier-lote 3180 54380   # instance d'essai isolée (premier plan)
python3 -I scripts/scenarios/atelier_scenarios.py G http://127.0.0.1:3180/api   # B C D E F G H K S J
python3 -I scripts/scenarios/atelier_scenarios.py A http://127.0.0.1:3320/api   # A : passerelle de démonstration requise (README §2)
scripts/tests-serveur.sh                                     # tests serveur de l'atelier, environnement vierge
(cd plugin-atelier && pnpm typecheck && pnpm test && pnpm build)
```

Recharger le worker après `pnpm build` : `POST /api/plugins/atelier.marketing-ia/disable` puis `/enable`.

## Retour arrière

- Plugin : `POST /api/plugins/atelier.marketing-ia/disable` puis
  `paperclipai plugin uninstall atelier.marketing-ia --force` (purge ses données).
- Socle : `git -C paperclip reset --hard eacb9dcaa` revient avant les patches 0002 et 0003
  (destructif : sur décision seulement).
- Instances d'essai : supprimer `instance/instances/atelier-lot*/` (instances arrêtées).

## Lot « connexion tardive » et arrêt d'instance (15/10/2026)

- Une connexion ajoutée par une carte est désormais réservée aux rôles prévus **toute seule** (environ 90 s) : « Gardien des connexions »,
  agent natif `process` sans modèle posé par `appliquer`, battement de 60 s, sous-commande `assurer-connexions` (`docs/integrations.md`,
  `docs/exploitation.md` §10). Il n'est donc plus nécessaire de relancer `appliquer` après chaque connexion.
- Arrêt d'instance : cause de l'orphelin PostgreSQL trouvée et corrigée (`scripts/lib-arret-instance.sh`, `docs/exploitation.md` §9) ;
  tests `scripts/arret-instance-tests.sh`. Essais `atelier-conn` (3360) et `atelier-arret` (3361) : arrêtés, données dans `instance/instances/`.

## Prospection, connaissances du client et passerelle réelle (état du 15/10/2026 au soir)

Historique : `git log --oneline 3ae1c79..HEAD` (44 commits).

**Modules ajoutés**
- Prospection B2B, B2C et partenaires : contrats v1.7 et migrations 007 et 008 ; règles légales pures (BCE modulo 97, E.164 belge,
  nature d'adresse, dédoublonnage, exclusions, matrice canal × cible) ; score expliqué et étalonnage statistique (Platt, isotonique
  à partir de 1 000 exemples) ; base clients importée en CSV ou XLSX, chiffrée (`chv1`) avec empreintes HMAC ; export CRM sous
  approbation ; export fichier CSV ou XLSX ; écran « Prospects ». Les numéros BCE fictifs sont acceptés en démonstration (forme
  seule), le contrôle modulo 97 reste entier en réel.
- Connaissances du client (RAG) : extraction PDF, DOCX, XLSX, HTML, Markdown et texte ; vectorisation locale bge-m3 en
  sous-processus, ou aucune ; recherche hybride (filtres, mots-clés, sens, fusion RRF, seuil) ; règles de citation, péremption,
  pseudonymisation et passages non fiables ; écran « Connaissances » ; corpus de démonstration (16 documents, 2 CSV, 10 questions).
- Organisation : rôle « Prospection » et compétences de prospection et de connaissances ; le Coordinateur prend le rôle de tête
  `ceo` et reçoit par défaut les nouvelles tâches.
- Socle : cinq cartes de galerie de la prospection (patch `0011`), puis patch `0012` (le Gardien des connexions agit sur sa
  propre entreprise ; garde des compétences obligatoires corrigée).
- Passerelle : simulateur B2C du courtier, fournisseur réel BNB (Centrale des bilans, lot P4) et mélange
  `PASSERELLE_SERVICES_REELS=osm` (OpenStreetMap réel, index `instance/donnees/osm/osm.sqlite`, extrait Geofabrik du 14/10).

**Pièges appris**
- L'hôte étale les tableaux JavaScript en paramètres SQL : passer des listes en JSON.
- Tests verts ne veut pas dire lancement réel : `mammoth` refusait de se charger sans `require` natif dans le worker.
- Redépôt et doublons : un redépôt ne doit pas exclure la fiche d'origine comme doublon.
- Changer les clés HMAC change toutes les empreintes : repartir de zéro.
- `claude setup-token` ne marche pas via `!` : le lancer dans un terminal à part.
- Le masqueur de secrets restitue la vraie valeur dans les commandes : ne rien coller de ces sorties.

**Reste à faire**
- Revue de sécurité : correctifs appliqués le 16/10 (m1 et m8 restent ouverts, voir les restes en tête).
- Évaluation R10 du RAG ; FSMA réel.
- Comptes réels : fichier BCE, clé BNB, Google, Meta, LinkedIn, HubSpot.
- Décision sur les données personnelles d'indépendants présentes dans OpenStreetMap.
- Décisions de l'opérateur listées dans les messages des commits `78c96c8` et `a3ef5ec`.
- Exploitation de l'instance (3100, passerelle 3190, clés de données, scripts) : `docs/exploitation.md` §12 et §13.

# Reprise : Atelier Marketing IA

## État au 16/10/2026, 15 h

Cette section prime sur les suivantes en cas de doute. Elle suffit pour reprendre sans rien redemander.

### 1. En ligne depuis 13 h 24 (instances 3100 et 3580)

Plugin au commit `bf61dba` (16/10, 13 h 22), socle avec les patches `0021` à `0033`. Fonctions :

- chat Discussion, dictée et voix en direct (la voix attend la clé OpenAI, voir plus bas) ;
- critères des leads (poids étroits, formulaire de décision d'un critère) ;
- veilleur des tâches orphelines ;
- cycles remis à zéro par décision humaine ;
- traduction française de l'interface, patches `0027` à `0031` (barre latérale, tableau de bord, fil d'activité,
  statuts, priorités) ;
- Prospection et SEA à 90 tours ;
- sécurité déjà déployée : patch `0032` (`90498d2`, corps des requêtes de plugin masqué dans le journal HTTP) et
  patch `0033` (`473ea76`, expiration des cartes IA filtrée par fournisseur et phase).

### 2. Commité mais PAS déployé (27 commits, `git log --oneline bf61dba..HEAD`, tête `d4fe5be`)

- **Mobile** : `7632ac3` (saisie de la Discussion au-dessus de la barre de l'hôte), `6220ff8` (sommaire et sections
  repliables des Paramètres, volet Filtres des Prospects, onglets), patch `0040` `6dc03b1` (propriétés, actions et
  statut accessibles sous md), patch `0041` `3eca7c0` (barre du bas mobile), `0f7530e` (e2e Discussion, Paramètres et
  Prospects sur téléphone). Audit : `socle/patches/audit-mobile.md`.
- **Contexte, dossier et prospects résumés** : `70ceb65` (contexte de tâche, résumé par défaut sous 40 000
  caractères, pages du livrable, `vue=complete`), `a3a8154` (même principe pour le dossier de tâche et la liste des
  prospects).
- **Fiche des routes** : `730ec76` (corps de requête des routes d'agents, générée depuis les contrats zod),
  `efef5a4` (verifier-organisation lit la consigne de dépôt dans le texte du rôle).
- **Traduction 0034 et suivants** : `654ce4f` (0034, reçu, priorités, fil de la tâche), `80425c9` (0035, routines,
  projets, filtres), `d4c5ba2` (0036, détail de projet et de routine, dossiers, navigation), `0e39738` (0037,
  attendus de tests français), `8c4a997` (0042, libellés français des écrans principaux).
- **Format fr-BE** : `0258629` (0038, nombres et test du choix d'un humain), `3662d40` (0039, nombres, montants et
  dates explicites en fr-BE).
- **Sécurité** : `26daf1b` (C1, sommaire du livrable : motif linéaire, lignes bornées, gel du worker), `99a393b` (C2,
  surcharge distante en liste blanche, sans source, filtre de secrets), `333cceb` (F1, clé du tableau en en-tête non
  redirigeable, limitée à l'adresse locale, localhost et `*.ts.net`), `19eda5f` (F2, destinataire humain des
  blocages de revue selon le mode de déploiement), `7c3aa72` (F3, refus de démarrer si le tailnet publie l'instance
  sans surcharge distante). Les patches `0032` et `0033` ne sont pas dans cette liste : ils sont déjà en ligne.
- **Préparation de l'accès distant** : `516c175` (surcharge facultative `config/atelier-distant.env`, modèle
  `config/atelier-distant.env.exemple`, validation), `f544519` (réglage `humainDestinataire`, repli `local-board`),
  `a1369e1` (clé d'API du tableau facultative `PAPERCLIP_BOARD_KEY` pour le mode authentifié).
- **Déploiement** : `d4fe5be` (`scripts/deployer.sh` et sa section dans `docs/exploitation.md`).
- **Documentation** : `244393f` (`docs/guide-utilisateur.md`), `c59d4cf` (limite de dictée en taille).

Dernier patch du socle : `0042`. Un fichier de test (`plugin-atelier/tests/securite-extraction.spec.ts`) était
modifié et non commité au moment de cette mise à jour : à relire avant tout déploiement (le déploiement exige un
arbre propre).

### 3. Prochaines étapes, dans l'ordre

1. **Second déploiement**, seulement quand la suite complète du socle et celle du plugin sont vertes :
   `scripts/deployer.sh --cible toutes --apercu <dossier d'aperçu> --journaux <dossier>`. Le script exige un arbre
   propre dans le dépôt et dans `paperclip/`. Juste après, renseigner une fois le réglage `humainDestinataire` en mode
   authentifié.
2. **Accès mobile par Tailscale** (9 étapes ; aucun document de `docs/` ne les détaille, `docs/evolution-deploiement.md`
   décrit seulement les modes de déploiement) :
   1. JB installe Tailscale 1.104 depuis le dépôt apt officiel, puis lance
      `tailscale up --netfilter-mode=off --accept-dns=false` (son Mullvad utilise le DNS 100.64.0.29).
   2. JB active MagicDNS et HTTPS.
   3. JB règle les ACL sur tcp:443.
   4. Claude copie `config/atelier-distant.env.exemple` vers `config/atelier-distant.env`, le remplit, puis valide avec
      `scripts/verifier-config.sh --distant`.
   5. Relance de l'instance 3100.
   6. `tailscale serve --bg --https=443 http://127.0.0.1:3100`, jamais Funnel.
   7. JB crée son compte et ouvre l'URL de réclamation du tableau affichée dans le terminal.
   8. Fermeture des inscriptions avec `PAPERCLIP_AUTH_DISABLE_SIGN_UP=true`.
   9. Essais sur téléphone.
3. **Clé OpenAI** pour la voix : la ranger comme secret natif et la lier au réglage `openaiSecretRef`
   (`docs/voix-en-direct.md`).
4. **Réindexation bge-m3 sur l'instance 3580** (`scripts/reindexer-connaissances.py`).
5. **Push GitHub par l'opérateur**, après un nouveau `scripts/publier.sh`. Rien n'est poussé à ce jour.

Dernière mise à jour : 15/10/2026 au soir (modules de prospection et de connaissances du client, passerelle OpenStreetMap
réelle, rôle de tête du Coordinateur ; voir la dernière section).
Seul responsable du code à cette date : l'intégrateur final. Historique : `git log`.

## État réel

- **Architecture** : plugin officiel Paperclip `atelier.marketing-ia` (`plugin-atelier/`,
  choix explicite de l'opérateur limité au système de plugins) + patch serveur isolé (P1, P2, régulateur,
  journal des compétences, suppression d'entreprise). Vue d'ensemble : `docs/architecture.md` ;
  contrats v1.4 : `docs/contrats.md` (§11 décisions du 15/10/2026, §12 plafonds, §13 données simulées).
- **Socle** : `paperclip/` = tag `v2026.1012.0` + 7 commits locaux (`socle/patches/0001` à `0007`). Rien n'est poussé.
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
- **Organisation** : 10 agents marketing `claude_local` + agent déterministe `porte`
  (process) ; politiques alignées sur le circuit 1.1 ; bootstrap idempotent vérifié en mode réel.
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
  - principale `atelier` (3100) : utilisée par l'opérateur, mise à jour par la session principale ;
    ne pas l'arrêter ni y réinstaller le plugin depuis une autre session.
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

- Mode réel jamais exécuté : `claude setup-token` par l'opérateur, puis `bootstrap-organisation.py jeton
  --confirmer` et `test-reel --confirmer` (`README.md` §3, `docs/checklist-usage-reel.md`).
- `curl` des agents réels non borné : `networkScope: "allowlist"` (stable dans l'adaptateur,
  Bubblewrap présent) non activé faute de pouvoir valider la liste d'hôtes sans run réel.
- Lecture d'URL du plugin non exposée comme outil Claude : les agents passent par les routes.
- Aucun connecteur de diffusion ni de mesure ; recherche Web absente ; pause de campagne
  indisponible (limite du socle).
- Suite serveur complète non lancée. Scénario A joué avec les agents de démonstration seulement.
- Une connexion ajoutée par une carte reste ouverte à tous les agents jusqu'au prochain `appliquer`.
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

1. L'opérateur fournit le jeton ; premier run réel minimal (`test-reel --confirmer`), puis une campagne
   de test sur l'entreprise fictive avec budgets bas ; trancher `networkScope`.
2. Connecteurs (étude : commit `1fcf74a`).
3. Instance 3100 de l'opérateur : la redémarrer pour charger le patch `0005` (serveur lancé sur les sources), avec la passerelle
   sur 3190 ; puis `bootstrap-organisation.py appliquer` après chaque nouvelle connexion.

## Commandes utiles

```bash
cd ~/Projets/atelier-marketing-ia
scripts/verifier-config.sh
scripts/demonstration.sh                                     # démonstration en une commande
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
  `docs/exploitation.md` §10). Cela remplace les lignes ci-dessus qui demandent de relancer `appliquer` après chaque connexion.
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
- Correctifs de la revue de sécurité (G1 à G4, M1 à M3 et mineurs), reportés après la présentation.
- Évaluation R10 du RAG ; FSMA réel.
- Comptes réels : fichier BCE, clé BNB, Google, Meta, LinkedIn, HubSpot.
- Décision sur les données personnelles d'indépendants présentes dans OpenStreetMap.
- Décisions de l'opérateur listées dans les messages des commits `78c96c8` et `a3ef5ec`.
- Exploitation de l'instance (3100, passerelle 3190, clés de données, scripts) : `docs/exploitation.md` §12 et §13.

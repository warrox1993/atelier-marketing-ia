# Critique UX de l'Atelier Marketing IA

Méthode : skill Impeccable en mode critique, en un seul contexte (consigne explicite : aucun sous-agent ; l'évaluation A et l'évaluation B d'Impeccable n'ont donc pas été isolées). Matériaux : les 14 captures de `docs/captures/presentation/`, et l'instance de démonstration http://127.0.0.1:3580 (entreprise « Courtier Démo (démonstration) », préfixe COUA) parcourue sans fenêtre, en lecture seule, le 15/10/2026 vers 23 h 17 : tableau de bord, boîte de réception, tâches, approbations, galerie de connexions, et les rubriques Équipe, Campagnes, Calendrier, Résultats, Paramètres, plus Équipe en largeur téléphone.

Utilisateurs visés : JB (opérateur, technicien) et un courtier en assurances (non technicien) qui doit, en quelques minutes par jour, savoir ce qu'il doit décider et le décider.

## Verdict

Le fond est solide et honnête : chaque écran dit d'où viennent les données, ce que la loi permet, ce qui n'est pas mesuré. La forme sert la preuve plutôt que la personne. L'atelier ressemble à un tableau de contrôle pour l'ingénieur qui l'a construit : vocabulaire interne (porte déterministe, moteur natif, run, REQ-xxx, P1/P2), deux interfaces côte à côte (le socle Paperclip en anglais, l'atelier en français) et aucun endroit qui réponde à la seule question du courtier : « qu'est-ce qui attend ma décision ? ».

Score Nielsen (0 à 4) : visibilité de l'état 2, langage de l'utilisateur 1, contrôle et liberté 3, cohérence 1, prévention des erreurs 3, reconnaissance plutôt que mémoire 2, efficacité 1, sobriété 3, récupération des erreurs 1, aide 2. Total 19/40 : utilisable par l'opérateur, pas encore par un client seul.

## 1. Les 5 problèmes les plus coûteux

### P0. Rien ne montre ce qui attend l'humain
Les décisions sont éparpillées dans quatre endroits de deux interfaces : Approvals (socle, en anglais, capture 10), Contenus à valider (atelier, capture 10b), Inbox (socle, filtre « Blocked »), et les tâches bloquées visibles seulement dans Tasks. Le tableau de bord du socle affiche « 0 Pending Approvals » et « 1 open, 0 blocked » mais rien sur les contenus, les demandes d'accès ou les données manquantes. L'atelier s'ouvre sur « Équipe et coordination » (capture 02), un tableau de 13 agents qui ne demande aucune action.
Coût : le courtier doit faire une tournée de quatre pages pour savoir s'il a quelque chose à faire ; en pratique il ne la fera pas, et un contenu ou une dépense attendra.

### P0. Parler au Coordinateur exige de connaître le modèle de Paperclip
Pour confier une demande, il faut quitter l'atelier (lien « Courtier Démo » en haut de la barre latérale), cliquer « New Task », puis choisir l'assigné parmi 13 agents dont les rôles sont libellés « CEO », « QA », « DevOps » (capture 01). Rien dans l'atelier ne dit « Demander quelque chose à l'équipe ». La seule entrée côté atelier est « Créer une campagne depuis un brief » (Campagnes vide), qui parle de « exigences REQ-xxx ».
Coût : la tâche la plus fréquente (« prépare-moi un post sur l'assurance habitation ») est la plus difficile à trouver.

### P1. Des libellés d'état qui inquiètent ou trompent
- « Configuré, non vérifié » sur 11 agents sur 13 (capture 02) et sur les trois gardes de Paramètres, juste au-dessus d'une ligne « Vérifié 15 oct. 2026, 23:17 ». Le lecteur comprend « quelque chose ne va pas » alors que cela veut dire « pas encore utilisé ». Source : `plugin-atelier/src/ui/format.ts:130`.
- La carte « Commerces et lieux (OpenStreetMap) (démonstration) » (capture 03) annonce « données fictives » alors que la passerelle interroge le vrai OpenStreetMap (`passerelle/src/reel/prospection/osm/`, définition `paperclip/packages/shared/src/app-definitions/atelier-osm.json`). Le même défaut menace BCE, FSMA, Banque nationale.
- Les tâches « blocked » affichent un message technique du moteur, sans dire qui doit faire quoi.
- Résultats : « Aucun plafond choisi : toute dépense est refusée par le serveur. » est exact mais formulé comme une panne.
Coût : perte de confiance, appels à l'opérateur pour des faux problèmes, et à l'inverse une vraie donnée réelle prise pour fictive.

### P1. Deux applications cousues ensemble
Deux barres latérales différentes selon qu'on est dans l'atelier (capture 02) ou dans le socle (capture 01), un socle en anglais (New Task, Inbox, Approvals, Connect, idle, Hire Agent, Decision note), un atelier en français. Deux entreprises de démonstration dans le sélecteur, distinguées seulement par un nom tronqué « Courtier Démo (... » (capture 01). Sur téléphone, la barre du bas propose Home, Tasks, New Task, Agents, Inbox : rien de l'atelier.
Coût : le courtier ne sait jamais où il est, ni dans quelle entreprise ; une action peut être faite dans la mauvaise.

### P1. La mise en place d'un client est dispersée et en partie hors de l'interface
Référentiel dans « Marque et sources » (bouton « Nouvelle version », capture 09), connexions dans la galerie du socle (capture 03) et dans Paramètres, base clients dans un onglet de Prospects (capture 07), documents dans Connaissances (capture 08), plafonds de dépense dans Résultats et Paramètres, et le jeu de démonstration chargé par des scripts en ligne de commande. Aucun écran ne dit « il vous reste 3 étapes ». La base clients vide affiche « Aucune base clients n'est chargée pour l'instant » sans dire pourquoi la charger ni ce que cela débloque.
Coût : impossible de laisser un client s'installer seul ; chaque nouveau client coûte une séance avec JB.

## 2. Améliorations classées par impact et effort

Légende : effort S (moins d'une demi-journée), M (un à deux jours), L (plus). « Plugin » = `plugin-atelier/` ; « Socle » = patch Paperclip dans `socle/patches/` (à garder minimal, chaque patch coûte à chaque mise à jour du socle).

| # | Amélioration | Gain pour l'utilisateur | Ce qui change à l'écran | Fichiers probables | Effort | Où |
|---|---|---|---|---|---|---|
| 1 | Page d'accueil « À faire » | Une seule page répond à « qu'est-ce qui m'attend ? » | Nouvelle rubrique en tête et vue par défaut : liste unique triée par urgence (contenus à valider, approbations de dépense, tâches bloquées qui attendent une réponse humaine, demandes d'accès, documents à revoir, informations manquantes du référentiel), chaque ligne avec un bouton qui mène à l'action ; compte affiché à côté du nom de la rubrique | `src/ui/route.ts` (vue par défaut), `src/contrats/ui-constantes.ts` (RUBRIQUES), nouvelle `src/ui/vues/a-faire.tsx`, `src/ui/donnees.tsx`, lecture des approbations et tâches natives via `src/ui/hote.ts` | M | Plugin |
| 2 | Bouton « Demander à l'équipe » | La demande la plus courante en un clic, sans choisir d'agent | Bouton permanent en haut de l'atelier ; champ de texte libre, envoi en tâche assignée d'office au Coordinateur, retour visible dans « À faire » | `src/ui/index.tsx`, `src/ui/composants.tsx`, appel natif de création de tâche via `src/ui/hote.ts` | S | Plugin |
| 3 | Dictionnaire d'états en langage courant | Plus de faux problèmes | « Configuré, non vérifié » devient « Prêt, pas encore utilisé » (ton neutre, pas orange) ; « Disponible » au lieu de « idle » dans l'atelier ; « Démonstration » réservé aux données fictives ; aide au survol et au focus gardée | `src/ui/format.ts` (table des états, ligne 130), `src/ui/vues/equipe.tsx`, `src/ui/vues/parametres.tsx` | S | Plugin |
| 4 | Cartes de connexion honnêtes | Une source réelle n'est plus présentée comme fictive | Titre sans « (démonstration) » pour OpenStreetMap et les registres publics ; mention « Données publiques réelles, lecture seule » ; « démonstration » seulement pour les services réellement simulés | `paperclip/packages/shared/src/app-definitions/atelier-*.json`, patch `socle/patches/0004-*` | S | Socle (cartes) |
| 5 | Tâches bloquées traduites | Le courtier sait quoi répondre | Le motif technique est remplacé par une phrase « L'équipe attend : … » et un bouton « Répondre » ; le message brut reste dans un détail repliable pour l'opérateur | `src/ui/vues/equipe.tsx` (blocages), `src/ui/format.ts`, futur `a-faire.tsx` | M | Plugin |
| 6 | Assistant « Mettre en place un client » | Installation guidée, sans JB | Liste d'étapes avec état fait / à faire : identité et offres, documents, base clients, connexions, plafonds ; chaque étape renvoie à l'écran existant ; visible tant qu'elle n'est pas complète, puis repliée dans Paramètres | nouvelle `src/ui/vues/mise-en-place.tsx`, `route.ts`, lectures existantes de `marque.tsx`, `connaissances.tsx`, `base-clients.tsx`, `plafonds.tsx`, `connecteurs.tsx` | M | Plugin |
| 7 | Entreprise courante bien visible | Plus d'action dans la mauvaise entreprise | Bandeau fixe en tête de l'atelier avec le nom complet de l'entreprise et une pastille « Démonstration » ou « Client réel » ; nom non tronqué dans la barre latérale | `src/ui/index.tsx`, `src/ui/styles.ts` | S | Plugin |
| 8 | Score lisible par un non-statisticien | Le courtier sait qui appeler d'abord | Remplacer « 100/100, estimation, non étalonnée » par trois niveaux (À contacter en priorité, À voir, Peu adapté) et la raison principale en une ligne (« site web et téléphone publiés ») ; le nombre et le détail restent dans la fiche ; quand 80 % des lignes ont 100/100 (capture 04), le dire au lieu de trier sur un chiffre sans contraste | `src/ui/vues/prospects.tsx` (lignes 73 à 81), `src/ui/format.ts` | M | Plugin |
| 9 | Base clients vide qui invite | Le courtier comprend l'intérêt et ose importer | État vide qui dit ce que la base débloque (doublons écartés, clients existants exclus de la prospection, base légale « client existant »), un fichier modèle à télécharger, et l'import en trois étapes déjà présent mis en avant | `src/ui/base-clients.tsx` | S | Plugin |
| 10 | Vocabulaire métier partout | Le courtier lit sans traduire | Retirer des descriptions « moteur natif », « porte déterministe », « run », « REQ-xxx », « P1/P2 », « projet Paperclip » ; les garder dans Paramètres et diagnostic pour l'opérateur | `src/ui/vues/*.tsx` (en-têtes), `src/contrats/ui-constantes.ts` | S | Plugin |
| 11 | Données de démonstration depuis l'interface | Plus de terminal pour une démo | Dans Paramètres (entreprise de démonstration seulement) : « Recharger les données de démonstration » avec confirmation, journalisé ; bouton absent d'une entreprise réelle | `src/ui/vues/parametres.tsx`, action serveur du plugin réutilisant les scripts actuels | M | Plugin |
| 12 | Socle en français et navigation unique | Une seule application aux yeux du client | Libellés du socle en français (New Task, Inbox, Approvals, Connect, idle) ; à défaut, entrées de l'atelier ajoutées à la barre du bas sur téléphone (À faire, Contenus, Prospects) | traduction : socle ; barre mobile : socle | L | Socle |
| 13 | Prospects : état des filtres et doublons | Moins de doute sur ce qu'on regarde | L'onglet Entreprises reste visiblement actif (capture 07b : aucun onglet actif, 122 au lieu de 82) ; les doublons évidents (« Isolation Outremeuse Plus » avec et sans SRL, capture 04) regroupés ou signalés | `src/ui/vues/prospects.tsx`, `src/ui/routes-prospection.ts` | S | Plugin |
| 14 | Marque et sources plus compacte | Relecture du référentiel en un écran | Offres et établissements en listes compactes à deux colonnes ; pastille « Confirmée » seulement quand elle diffère (« À vérifier » en évidence, le reste implicite) ; « Informations manquantes » en tête de page, pas en bas (capture 09) | `src/ui/vues/marque.tsx`, `src/ui/styles.ts` | S | Plugin |

Ordre conseillé : 3, 7, 10, 4 (une journée, gain immédiat de confiance), puis 1 et 2 (cœur du changement), puis 5, 9, 8, 6, 13, 14, 11, et 12 en dernier.

## 3. Ce qu'il ne faut pas faire

- Pas de tableau de bord à tuiles colorées, de jauges ni de graphiques décoratifs sur la page « À faire » : une liste sobre, triée, avec un verbe par ligne.
- Pas d'animation, de zoom au survol, d'apparition progressive ni de compteur qui défile. Le seul mouvement admis est celui qui signale un changement réel (une ligne qui disparaît après décision).
- Pas de dégradés, d'ombres portées en cascade, d'icônes en pastilles colorées, de texte en dégradé ni de cartes imbriquées : l'allure « produit d'IA » est à proscrire ; garder la grille actuelle, la typographie actuelle et les séparateurs fins.
- Pas de mascotte, d'avatar souriant ni de ton enjoué (« Super ! », « Votre équipe IA travaille pour vous ») : le ton reste celui d'un courtier, vouvoiement, sobre.
- Pas de tiret cadratin dans les textes.
- Ne pas masquer la provenance des données ni les refus légaux pour « simplifier » : on les déplace dans un détail, on ne les supprime pas.
- Ne pas présenter un score estimé comme une probabilité, même arrondi en pourcentage.
- Ne pas multiplier les patchs du socle : tout ce qui peut vivre dans le plugin y reste.
- Ne pas remplacer « Démonstration » par rien : l'étiquette reste obligatoire sur toute donnée fictive, elle doit simplement être juste.

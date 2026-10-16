# Audit mobile (lot M2)

Objectif de l'opérateur : « pouvoir tout faire sur mobile comme sur PC ». Cet audit mesure l'état réel, il ne corrige que le CSS évident (voir « Corrections faites »).

## Méthode et preuves

- Instance d'essai jetable `atelier-e2e` (ports 3590 et 54790), plugin copié depuis `plugin-atelier/` (copie `instance/plugin-e2e`), organisation de démonstration « Rénovation Liège ».
- Playwright, chromium sans interface, viewport 390x844, `isMobile` et `hasTouch`, facteur d'échelle 2, thèmes clair et sombre.
- 22 écrans parcourus en clair et en sombre (44 mesures), plus les parcours interactifs : menu latéral (atelier et socle), fiche d'un lead puis « Modifier » d'un critère, tâche avec son fil, recherche du panneau Propriétés.
- Mesures automatiques par écran : débordement horizontal (`scrollWidth` contre `innerWidth` et éléments plus larges que l'écran), cibles tactiles de moins de 44x44 px, texte de moins de 12 px, tableaux sans conteneur défilant. Toutes les captures ont été regardées une à une.
- Scripts et captures (hors dépôt) : `/tmp/claude-1000/-home-utilisateur/fac0401f-90db-40ef-b6ce-7a3239232a9a/scratchpad/audit-mobile/` (`audit.mjs`, `interactif2.mjs`, `tache.mjs`, `mesures.json`, `*.png`). Les noms de captures citées ci-dessous y sont relatifs (suffixe `--clair` ou `--sombre`).

Résultat global : aucun débordement horizontal sur les 44 mesures (`scrollWidth` = 390 partout, aucune erreur de page), les tableaux de l'atelier se transforment en cartes en dessous de 640 px. Le mobile est donc déjà exploitable pour lire et saisir ; les manques sont des fonctions inaccessibles et des cibles trop petites.

## Les 10 problèmes qui empêchent ou gênent « tout faire sur mobile »

| N° | Problème | Gravité | Écran |
| --- | --- | --- | --- |
| 1 | Le panneau Propriétés d'une tâche n'existe pas sur mobile : ses boutons (Properties, Close Properties, Toggle side panel, Maximize side panel, Open a new tab) mesurent 0x0 (classe `hidden md:flex`). Statut, priorité, projet, échéance, etc. ne sont pas modifiables ; seul le choix de l'assigné reste dans le champ de saisie. | Bloquant | Tâche (socle) |
| 2 | Le menu « Autres actions sur la tâche » mesure 0x0 sur mobile (absent) : actions de la tâche (archiver, dupliquer, etc.) inaccessibles. À confirmer côté socle, le comportement exact des actions n'a pas été exercé. | Bloquant probable | Tâche (socle) |
| 3 | Le bouton de changement de statut d'une tâche fait 16 à 20 px (liste des tâches : 11 boutons de 16x16 ; tête de tâche : 20x20). Très difficile à viser au doigt. | Gênant | Tâches, tâche (socle) |
| 4 | Page Paramètres et diagnostic : une seule page d'environ 11 000 px de haut, 157 cibles trop petites dont 31 cases à cocher de 16 px, sans navigation entre sections ni ancres. | Gênant | Paramètres (atelier) |
| 5 | L'atelier n'est pas dans la barre du bas (Home, Tasks, New Task, Agents, Inbox). On y accède par le burger puis le tiroir puis le lien « Atelier marketing ». De plus la barre du bas se superpose au bas du tiroir (le bouton « Board » chevauche les icônes). | Gênant | Menu latéral |
| 6 | Cibles de moins de 44 px sur tout l'atelier : boutons à 36 px (`.atl-bouton`), champs à 37 px, boutons segmentés à 32 px, cases et boutons radio à 16 px, liens de mission à 42 px. | Gênant (corrigé en CSS, voir plus bas) | Tous (atelier) |
| 7 | La barre d'onglets de l'atelier défile horizontalement sans indice (13 vues, « Éq » coupé) et double le tiroir du menu. | Mineur | Tous (atelier) |
| 8 | Fil d'une tâche : la bulle du premier message est tronquée par « Show more » et la zone de saisie fixe occupe un tiers de l'écran (hauteur 844 px), ce qui laisse peu de place pour lire le fil. | Gênant | Tâche (socle) |
| 9 | Texte de moins de 12 px : étiquettes de la barre du bas et pastilles du socle à 10 px (jusqu'à 22 éléments sur le tableau de bord), intertitre « PROSPECTION » du menu à 11 px. | Mineur | Socle, menu atelier |
| 10 | La vue Discussion (`/atelier/discussion`) retombe sur l'accueil dans la copie auditée : la route n'est pas déclarée dans `VUES` (travail en cours d'un autre agent, non commité). À revérifier sur mobile une fois la vue livrée. | À vérifier | Discussion (atelier) |

Hors mobile mais constaté : une partie de l'interface du socle reste en anglais (Routines, Agents, Tasks, Inbox, bandeaux), et l'encart « Group these routines into folders » de la page Routines est écrasé à 390 px (texte en colonne étroite à côté du bouton).

## Corrections faites dans ce lot

Un seul bloc CSS commenté « Mobile (audit M2) » dans `plugin-atelier/src/ui/styles.ts`, sous `@media (max-width: 640px)` : boutons, boutons segmentés et liens de mission à 44 px, champs de saisie à 44 px et 16 px de police (évite le zoom automatique d'iOS), cases et boutons radio à 22 px avec une étiquette de 44 px de haut. Mesure avant et après : voir « Vérification de la correction » en bas de ce document.

## Atelier, écran par écran

Légende : B = bloquant, G = gênant, M = mineur. Fichier probable : tous les écrans de l'atelier partagent `plugin-atelier/src/ui/styles.ts` et `plugin-atelier/src/ui/index.tsx` (menu et onglets).

| Écran | Problème | Gravité | Capture | Piste de correction | Fichier probable |
| --- | --- | --- | --- | --- | --- |
| Accueil (À faire) | 56 cibles sous 44 px, dont 11 boutons « Répondre » à 36 px et les titres de mission à 42 px ; 7 textes sous 12 px (barre du bas) | G | `atelier-accueil` | Hauteur minimale 44 px (fait) | `styles.ts`, `styles-accueil.ts` |
| Prospects | Filtres en colonne très longue (13 champs) avant la liste ; cases à 16 px ; tableau en cartes correct | G | `atelier-prospects` (pleine page) | Replier les filtres dans un volet « Filtres » ; cibles (fait) | `vues/prospects.tsx`, `styles.ts` |
| Fiche d'un lead | Fiche lisible, sans débordement ; « Modifier » mesure 77x36 px ; formulaire de critère correct (champs pleine largeur) | G | `lead-fiche`, `lead-modifier` | Cibles à 44 px (fait) | `vues/prospects.tsx` |
| Carte des prospects | Carte rendue à 326x195 px avec un seul point : précision tactile non testée (aucun zoom ni défilement de la carte) ; légende correcte | G | `atelier-carte` | Agrandir la carte à la largeur utile, cibles de points à 44 px, tester le toucher | `vues/carte.tsx` |
| Équipe et coordination | Une carte par agent, 13 cartes : page de 4 580 px ; lisible | M | `atelier-equipe` | Replier les cartes, résumé en tête | `vues/equipe.tsx` |
| Campagnes, nouvelle campagne | Formulaire lisible, champs à 37 px | G | `atelier-campagne-nouvelle` | Cibles (fait) | `vues/campagnes.tsx` |
| Contenus à valider | RAS de débordement ; 32 cibles sous 44 px | G | `atelier-contenus` | Cibles (fait) | `vues/contenus.tsx` |
| Calendrier éditorial | Filtres en pastilles sur deux lignes, lisible ; 39 cibles sous 44 px | G | `atelier-calendrier` | Cibles (fait) | `vues/calendrier.tsx` |
| Résultats | RAS de débordement ; 33 cibles sous 44 px | G | `atelier-resultats` | Cibles (fait) | `vues/resultats.tsx` |
| Marque et sources | Lisible ; bouton « Actualiser » à 81x36 px | G | `atelier-marque` | Cibles (fait) | `vues/marque.tsx` |
| Connaissances | Zone de dépôt de fichier correcte (bouton « Choisir un fichier ») ; glisser-déposer inexistant au toucher mais le bouton le remplace | M | `atelier-connaissances` | Aucune | `vues/connaissances.tsx` |
| Missions (liste de l'accueil) | Titres de mission à 42 px | G | `atelier-accueil` | Fait | `styles-accueil.ts` |
| Approbations | Accessibles par l'accueil (« Répondre » sur chaque demande) ; pas de vue séparée à auditer | M | `atelier-accueil` | Aucune | `vues/accueil.tsx` |
| Corbeille | RAS de débordement ; 29 cibles sous 44 px | G | `atelier-corbeille` | Cibles (fait) | `vues/corbeille.tsx` |
| Paramètres et diagnostic (toutes les sections) | Page de ~11 000 px ; 5 tableaux transformés en cartes ; 157 cibles sous 44 px ; aucune navigation interne | G | `atelier-parametres` (pleine page) | Sommaire avec ancres ou sections repliables ; cases à 22 px (fait) | `vues/parametres.tsx`, `connecteurs.tsx` |
| Mise en place du client | RAS de débordement ; 38 cibles sous 44 px | G | `atelier-mise-en-place` | Cibles (fait) | `vues/mise-en-place.tsx` |
| Discussion | Route absente de la copie auditée (retombe sur l'accueil) | À vérifier | `atelier-discussion` | Revérifier après livraison de la vue | `vues/discussion.tsx`, `styles-discussion.ts` |
| Menu latéral de l'atelier | S'ouvre par le burger « Open sidebar » (36x36 px) ; liens de 34 px de haut ; barre du bas superposée au bas du tiroir | G | `menu-lateral-atelier` | Burger à 44 px ; masquer la barre du bas quand le tiroir est ouvert | `Layout.production.tsx` (socle, hors périmètre), `index.tsx` pour les liens |

## Socle, écran par écran

Le socle (`paperclip/`) n'est pas modifiable dans ce lot ; les pistes sont à traiter dans un lot dédié (surcouche CSS ou correctif amont).

| Écran | Problème | Gravité | Capture | Piste de correction | Fichier probable |
| --- | --- | --- | --- | --- | --- |
| Ouverture de l'entreprise / menu latéral | Le burger « Open sidebar » ouvre un tiroir (bien) ; 13 liens, entrée « Atelier marketing » ; barre du bas superposée ; boutons « Collapse » de 20x20 px | G | `menu-lateral-atelier`, `socle-menu-lateral` | Voir problème n° 5 | `paperclip/ui/src/components/Layout.production.tsx`, `MobileBottomNav.tsx` |
| Tableau de bord | Aucun débordement ; 22 textes à 10 px (pastilles, jauges) ; liens d'exécution à 24 px de haut | M | `socle-dashboard` | Police minimale 12 px | `paperclip/ui/src/pages/Dashboard.tsx` |
| Agents | Liste lisible ; bouton « Leave » (quitter) très proche de la ligne cliquable ; 35 cibles sous 44 px | G | `socle-agents` | Espacement et cibles | `paperclip/ui/src/pages/Agents.tsx` |
| Routines | Encart « Group these routines… » écrasé ; boutons « Run now » corrects | M | `socle-routines` | Encart en colonne | `paperclip/ui/src/pages/Routines.tsx` |
| Projets | 22 cibles sous 44 px, pas de débordement | M | `socle-projets` | Cibles | `paperclip/ui/src/pages/Projects.tsx` |
| Boîte de réception | Lisible en clair et en sombre ; onglets Mine/Recent/Unread/Blocked/All visibles ; boutons de filtre à 44 px | M | `socle-inbox` | Aucune | `paperclip/ui/src/pages/Inbox.tsx` |
| Liste des tâches | 11 boutons de statut à 16x16 px ; libellés tronqués sur deux lignes ; badge « Recovery needed » prend la moitié de la ligne | G | `socle-issues` | Statut à 44 px de zone tactile | `paperclip/ui/src/components/IssueRow.tsx` |
| Tâche (fil) | Fil lisible mais bulle tronquée et zone de saisie fixe d'un tiers d'écran ; « Resume agent », « Show more », « Select assignee » à 44 px (bien) ; bouton « Send » 32x32 px | G | `socle-tache`, `tache-haut` | Réduire la zone de saisie au repos | `paperclip/ui/src/components/IssueChatThread.tsx` |
| Tâche (panneau Propriétés) | Inaccessible : tous les boutons du panneau mesurent 0x0 sur mobile | B | `socle-tache` | Ouvrir le panneau en feuille du bas (`bottom sheet`) depuis un bouton de l'en-tête | `paperclip/ui/src/components/PropertiesPanel.tsx`, `task-side-panel/TaskSidePanel.tsx` |

## Ce qui n'a pas pu être mesuré

- Le test avec un vrai téléphone (Safari iOS, clavier virtuel, zoom automatique des champs sous 16 px) : seul Chromium émulé a été utilisé.
- Les actions du menu « Autres actions sur la tâche » et du panneau Propriétés, absents du DOM visible.
- L'interaction tactile avec la carte (zoom, défilement).

## Vérification de la correction

Après reconstruction de la copie du plugin et nouvelle mesure (mêmes scripts, thème clair, hors éléments du socle) : cibles de moins de 44 px sur l'atelier.

| Écran | Avant | Après |
| --- | --- | --- |
| Accueil | 25 | 0 |
| Prospects | 25 | 3 |
| Nouvelle campagne | 12 | 6 |
| Paramètres | 126 | 55 |

Reste : les cases et boutons radio eux-mêmes (22 px) ; leur étiquette fait 44 px de haut et capte le toucher, la mesure automatique compte pourtant la case seule. Aucun débordement horizontal (`scrollWidth` = 390 partout).

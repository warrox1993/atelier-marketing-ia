# Audit visuel de l'atelier et du socle (17 octobre 2026)

Mode d'exécution : contexte unique (critique et audit Impeccable menés dans le même agent, sans sous-agent, sur consigne). Lecture et captures seulement : aucune correction dans ce lot.

## Périmètre et méthode

- Instance auditée : `http://127.0.0.1:3100` (mode local_trusted), client à 28 entreprises « <client> · <service> ». Dans ce document, le client est appelé « le client », son entreprise principale « Marketing » (préfixe noté `<P>`) et son entreprise de direction « Direction » (préfixe noté `<PA>`).
- 30 pages capturées sans fenêtre (Chromium de Playwright, `tests/e2e/atelier/node_modules`), chacune en 1440×900 et 390×844, thème clair et sombre (clé `paperclip.theme` + `prefers-color-scheme`), soit 210 captures (écran visible, plus une capture « longue » quand la page défile). Les captures restent hors dépôt, dans le dossier de travail de la session (`audit-visuel/<page>-<largeur>-<thème>.png`, préfixes `atelier-`, `direction-atelier-` et `socle-`).
- Pages : les 18 vues et onglets de l'atelier de Marketing (Accueil, Discussion, Prospects liste et carte, Campagnes et nouvelle campagne, Contenus, Calendrier, Résultats, Équipe, Rapport du mois, Mise en place, Marque et sources, Connaissances, Connexions, Paramètres, Corbeille, Départements), trois vues de Direction (Accueil, Registre des échanges, Départements) et le socle (tableau de bord, tâches, projets, agents, fiche d'un agent, routines, boîte de réception, réglages de l'entreprise, organisations, sélecteur d'organisations ouvert).
- Mesures automatiques par page : débordement horizontal du document, éléments qui dépassent le bord droit, conteneurs à défilement horizontal, erreurs de console, requêtes en échec (fichier `mesures.json` à côté des captures).
- Détecteur Impeccable (`impeccable detect --json plugin-atelier/src/ui`) : 4 constats (3 `side-tab`, 1 `layout-transition`).
- Écart entre l'instance et les sources : l'interface du plugin servie date du 16/10 à 22:32 (`plugin-atelier/dist/ui/index.js`). Les commits postérieurs (`cc24cf4`, `6184065`, `749cdbb`, `b772aa7`, `605d34c`, dont la vue Départements et la sonde d'accès Direction) n'y sont pas. Pour chaque défaut, la colonne « Sources » dit si le défaut est encore présent dans le code actuel (vérifié par lecture du fichier cité).

Ce qui n'a pas pu être audité : la vue Départements (absente de l'instance : `/atelier/departements` retombe sans message sur l'Accueil, voir D29) et les états remplis (aucune campagne, aucun prospect, aucun contenu sur l'instance : seuls les états vides sont vus).

## Verdict

Le visuel n'est pas « cassé » au sens d'une mise en page effondrée : aucune page ne provoque de défilement horizontal du document, le thème sombre tient partout, les états vides sont rendus proprement. Ce qui donne l'impression de casse vient de cinq causes systémiques, chacune corrigeable en un point :

1. **Les vues placées dans un onglet perdent tout espacement vertical** (D01) : l'en-tête touche le bloc suivant sur Prospects, Carte, Nouvelle campagne, Calendrier, Mise en place, Corbeille, Connaissances. Une seule règle CSS manque.
2. **Le titre du bandeau supérieur est fabriqué à partir de l'adresse** (D02) : « RESULTATS », « EQUIPE », « PARAMETRES », « ECHANGES », sans accents et parfois faux (« RAPPORT », « PARAMETRES » sur l'onglet Connexions).
3. **Le téléphone empile jusqu'à trois rangées d'onglets coupées** (D03) et deux boutons sortent de l'écran (D04, D12).
4. **Le socle reste largement en anglais et en dollars** (D08, D09) : fiche d'agent, réglages, organisations, routines, boîte de réception.
5. **Du vocabulaire interne s'affiche au client** (D06, D07, D10, D11) : noms de tables SQL, fonctions, identifiants, « Paperclip », lignes « (démonstration) », marqueurs de périmètre, préfixes de tâche à rallonge.

Allure « production d'IA » (règles de l'opérateur) : cinq barres colorées à gauche subsistent dans le plugin (D05), aucun dégradé décoratif, aucun tiret cadratin dans les textes du plugin ; le socle en contient dans ses réglages (D08).

## Scores

### Audit technique (Impeccable `audit`)

| # | Dimension | Score | Constat principal |
|---|---|---|---|
| 1 | Accessibilité | 3 | Onglets et rôles ARIA soignés ; contraste faible des noms d'agents en pause et du libellé d'adaptateur dans la liste des agents du socle (D23) |
| 2 | Performance | 3 | Rien de visible ; une transition sur `width` (barre de progression, `styles.ts:122`), bénigne |
| 3 | Adaptation mobile | 2 | Trois rangées d'onglets coupées, deux boutons hors écran, bandeau des routines écrasé |
| 4 | Thème | 3 | Jetons `--atl-*` suivis, clair et sombre corrects ; devise du socle codée en dur en dollars |
| 5 | Intégrité | 2 | Espacement perdu dans tous les onglets, titre d'en-tête fabriqué, jargon interne affiché |
| **Total** | | **13/20** | **Acceptable : travail significatif à faire, sans refonte** |

### Critique (Impeccable `critique`, heuristiques de Nielsen)

| # | Heuristique | Score | Constat |
|---|---|---|---|
| 1 | Visibilité de l'état | 3 | Fraîcheur des données, pastilles d'état et progression bien présentes |
| 2 | Langage de l'utilisateur | 1 | Tables SQL, fonctions, « Paperclip », anglais du socle, rôles « CEO », « QA » |
| 3 | Contrôle et liberté | 3 | Retour au menu principal, Abandonner, Corbeille de 30 jours |
| 4 | Cohérence | 2 | Bandeau entreprise placé différemment sur Mise en place, boutons en pilule seulement dans la Discussion, deux langues et deux devises |
| 5 | Prévention des erreurs | 3 | Boutons désactivés avec raison écrite (« Écrivez d'abord votre demande. ») |
| 6 | Reconnaître plutôt que se souvenir | 3 | Rubriques claires, mais trois niveaux d'onglets sur téléphone |
| 7 | Souplesse | 3 | Modèles de demande, raccourcis clavier annoncés |
| 8 | Esthétique sobre | 2 | Base sobre et « faite main », gâchée par les blocs collés et les barres à gauche |
| 9 | Récupération des erreurs | 3 | États d'erreur avec « Réessayer » ; 403 silencieux en console sur l'instance (D28) |
| 10 | Aide | 3 | Textes d'aide sous chaque champ, parfois trop techniques |
| **Total** | | **26/40** | **Correct ; le langage est le point faible** |

Spécificité du design : l'atelier a une voix propre (phrases d'aide franches, « rien n'est estimé », états vides qui disent quoi faire). La juxtaposition avec le socle anglais et générique casse cette identité dès qu'on quitte l'atelier.

Persona « utilisateur pressé sur téléphone » : il arrive sur l'Accueil, voit un bouton coupé à droite, puis doit faire défiler deux rangées d'onglets pour atteindre Paramètres, où la page paraît vide (section Diagnostic repliée, D25).

## Défauts

Gravité : **bloquant** (empêche la tâche), **majeur** (gêne nette ou image cassée), **mineur** (finition). Aucun défaut bloquant n'a été trouvé.

| ID | Gravité | Page, largeur, thème | Capture | Description | Cause (fichier:ligne) | Sources | Correctif proposé |
|---|---|---|---|---|---|---|---|
| D01 | majeur | Prospects, Carte, Nouvelle campagne, Calendrier, Mise en place, Corbeille, Connaissances, Contenus ; toutes largeurs, deux thèmes | `atelier-prospects-1440-clair-long.png`, `atelier-calendrier-1440-clair.png`, `atelier-mise-en-place-1440-clair.png` | Écart de 0 px entre l'en-tête et le bloc suivant (mesuré dans le DOM sur 6 vues) : pastilles collées à la description, filtres du calendrier collés à l'état vide, barre de progression qui touche le texte, description collée au premier libellé du formulaire, bloc « Exporter un fichier » collé au bouton Filtrer | Le panneau d'onglet `div.atl-panneau` (`plugin-atelier/src/ui/onglets.tsx:104`) est en `display: block` (`styles.ts:387-388` ne fixe que le focus et `hidden`) : le `gap: 1.25rem` de `.atl-page` (`styles.ts:49`) ne s'applique plus aux enfants de la vue | présent | `.atl-panneau:not([hidden]) { display: flex; flex-direction: column; gap: 1.25rem; min-width: 0; }` dans `styles.ts` |
| D02 | majeur | Toutes les vues de l'atelier ; toutes largeurs | `atelier-resultats-1440-clair-long.png`, `atelier-connexions-1440-clair.png` | Titre du bandeau supérieur en capitales, sans accents et parfois faux : RESULTATS, EQUIPE, PARAMETRES, ECHANGES, DEPARTEMENTS, RAPPORT (au lieu de « Rapport du mois »), PARAMETRES sur l'onglet Connexions | Le socle déduit le titre du segment d'adresse : `paperclip/ui/src/pages/PluginPage.tsx:188-215` (`titleFromRouteSplat`, `titleFromPath` remplace `-` par une espace), puis `BreadcrumbBar.tsx:199,207` met en capitales | présent | Laisser le plugin fournir le titre (libellés de `VUES` dans `plugin-atelier/src/ui/route.ts`) ou, a minima, afficher le nom du plugin (« Atelier marketing ») au lieu du segment ; patch du socle |
| D03 | majeur | Toutes les vues de l'atelier ; 390 ; deux thèmes | `atelier-parametres-390-clair.png`, `atelier-equipe-390-clair-long.png` | Jusqu'à trois rangées d'onglets à défilement horizontal empilées (rubriques, onglets de la rubrique, sous-onglets de Paramètres), libellés coupés au bord (« nnaissances », « enus », « D ») ; `nav.atl-onglets` 466 px dans 358 px | `styles.ts:399-402` (rangée défilante avec fondu, logique correcte isolément) appliquée à chaque niveau ; sous-onglets de `vues/parametres.tsx` | présent | Sur téléphone : rubriques dans la barre du bas ou un menu, onglets de rubrique en liste déroulante « Section : … », sous-onglets de Paramètres en accordéons |
| D04 | majeur | Accueil (Marketing et Direction) ; 390 ; deux thèmes | `atelier-accueil-390-clair-long.png` | Bouton « Utiliser le modèle « Prospection d'une zone » » qui sort de l'écran (bord droit à 400 px pour 390) | `.atl-bouton { white-space: nowrap }` (`styles.ts:175`) sur un libellé long (`vues/accueil.tsx:159`) | présent | Libellé court (« Prospecter une zone ») ou `.atl-prospection .atl-bouton { white-space: normal; text-align: left; }` |
| D05 | majeur | Accueil, Mise en place, Connaissances, Discussion ; toutes largeurs | `atelier-accueil-1440-clair.png`, `atelier-mise-en-place-1440-sombre.png` | Barres colorées à gauche, interdites par les règles de l'opérateur : bloc Prospection (3 px, couleur d'accent), étape courante de la Mise en place (3 px), passages cités, panneaux dépliés | `styles-accueil.ts:49` (`.atl-prospection`), `styles.ts:126-128` (`.atl-parcours-pas`), `styles-connaissances.ts:12-13` (`.atl-passage`), `styles-discussion.ts:34`, `styles-accueil.ts:33` ; règle morte `styles.ts:446` (`.atl-nav-groupe`, plus utilisée) | présent | Retirer les bordures gauches ; étape courante signalée par fond `--atl-surface-2`, graisse et pastille pleine ; supprimer `.atl-nav-groupe` |
| D06 | majeur | Rapport du mois, Paramètres, Connexions, Campagnes, Équipe, Résultats ; toutes largeurs | `atelier-rapport-1440-clair-long.png`, `atelier-parametres-1440-clair-long.png` | Vocabulaire interne affiché au client : `decisions_humaines (approuver, non invalidée)`, `exports_crm (confirmee en mode réel)` (sans accent), `calculerConfiance`, `cost_events … /costs/by-agent-model`, `plugin_atelier_f0322cc62c`, `claude_local`, `preparation_action`, « Ask first », « anti-SSRF », `passerelleUrl`, « projet Paperclip » (25 occurrences de « Paperclip » dans les textes des vues) | `plugin-atelier/src/serveur/services-rapport.ts:184-224`, `serveur/services.ts:2281`, `ui/connecteurs.tsx:153`, `ui/connexions-natives.ts:328-332`, descriptions de `vues/campagnes.tsx`, `vues/equipe.tsx:20`, `vues/resultats.tsx` | présent | Passe `/impeccable clarify` : sources écrites pour un humain (« vos validations », « exports vers votre CRM »), détails techniques derrière un « Détails techniques » repliable dans Paramètres |
| D07 | majeur | Rapport du mois ; toutes largeurs | `atelier-rapport-1440-clair-long.png` | Six lignes « (démonstration) » à zéro (contenus, validations, publications, prospects, exports) alors que le commit `32ab8a9` a retiré toute présentation en démonstration | `plugin-atelier/src/serveur/services-rapport.ts:180-192` (`parModes`, `prospects_trouves_demonstration`) | présent | Ne produire la ligne de démonstration que si sa valeur est non nulle, ou la retirer |
| D08 | majeur | Socle : tâches, organisations, routines, boîte de réception, fiche d'agent, liste des agents, réglages, sélecteur, pied de la barre ; toutes largeurs | `socle-issues-1440-clair.png`, `socle-agent-fiche-1440-clair.png`, `socle-settings-1440-clair-long.png`, `socle-companies-1440-clair-long.png` | Textes anglais : TASKS, ORGANIZATIONS, New Organization, active, tasks, Created, « 2 projects », paused, « Hire Agent: », Approved, updated, Organizations, « Invite people to … », Board ; fiche d'agent (Overview, Instructions, Skills, Runtime, Harness / Runtime, Secrets & variables, Tools, Channels, Governance, Permissions / Trust, API Keys, Revisions, Activity, Runs, Costs, Budgets) ; rôles (CEO, QA, Designer, Researcher, General, DevOps) ; réglages (Appearance, Interaction governance, Backup retention, AI feedback sharing, Sign out, Archive organization) avec tirets cadratins dans le texte ; « Choose File / No file chosen » | `paperclip/ui/src/pages/Issues.tsx:144,228,236`, `pages/Companies.tsx:92,116`, `components/RoutineList.tsx:53`, `pages/CompanySettings.tsx`, `pages/AgentDetail.tsx` et suivants (aucun patch de traduction pour ces écrans dans `socle/patches/`) | présent | Lot de traduction du socle (patch) ; masquer les sections réservées à l'opérateur (Interaction governance, Backup retention, AI feedback sharing) au client |
| D09 | majeur | Tableau de bord, organisations ; toutes largeurs | `socle-dashboard-1440-clair-long.png`, `socle-companies-1440-clair-long.png` | Montants en dollars (« 0,00 $ », « 0,00 $ / 75,00 $ ») alors que l'atelier affiche des euros | `paperclip/ui/src/lib/utils.ts:39` (`currency: "USD"`) | présent | Devise EUR (réglage de l'instance ou constante patchée) |
| D10 | majeur | Organisations, réglages de l'entreprise ; toutes largeurs | `socle-companies-1440-clair-long.png`, `socle-settings-1440-clair-long.png` | Descriptions générées : « Service Service après-vente et sinistres », « (reel) » sans accent, « Marqueur de périmètre : atelier-client:… » visible | `scripts/bootstrap-organisation.py:2984` et `:3457-3458` | présent | Description lisible (« Service après-vente du client »), marqueur gardé dans une métadonnée non affichée |
| D11 | majeur | Adresses, identifiants de tâche, sélecteur ; toutes largeurs | `socle-companies-1440-clair-long.png` | Préfixes à rallonge (`<P>` suivi de 1 à 28 « A ») dans les adresses et les identifiants de tâche, alors que la description annonce « Préfixe de service : SAV » | Le socle déduit le préfixe du nom et ajoute des « A » pour l'unicité (`paperclip/server/src/services/companies.ts:340`, `createCompanyWithUniquePrefix`) ; `bootstrap-organisation.py` ne fixe pas le préfixe | présent | Fixer le préfixe du service à la création (SAV, INF, COM…) si l'API le permet, sinon patch du socle ; à trancher par l'opérateur (renommer des préfixes existants change les identifiants des tâches) |
| D12 | majeur | Routines (socle) ; 390 ; deux thèmes | `socle-routines-390-clair.png` | Bouton « Créer la routine » coupé hors écran ; bandeau « Regroupez ces routines… » écrasé à un mot par ligne | Page Routines du socle (`paperclip/ui/src/pages/Routines.tsx`), rangée d'actions sans retour à la ligne | présent | Actions empilées sous 640 px ; bandeau en colonne |
| D13 | majeur | Tableau de bord (encart de l'atelier) ; 1440 ; deux thèmes | `socle-dashboard-1440-clair-long.png` | Zone « Demander à l'équipe » large de 217 px dans un encart de 560 px | `.atl-widget-demande { align-items: flex-start }` (`styles.ts:342`) rétrécit le `Champ` qui entoure la zone (`index.tsx:345-348`) | présent | `.atl-widget-demande > .atl-champ { align-self: stretch; }` |
| D14 | mineur | Mise en place ; toutes largeurs | `atelier-mise-en-place-1440-clair.png` | La même phrase « 0 service relié ; passerelle non vérifiée… » affichée deux fois de suite | `vues/mise-en-place.tsx:254` (`etape.detail`) puis `:380` (`detailSources`) | présent | Garder une seule des deux |
| D15 | mineur | Mise en place ; toutes largeurs | `atelier-mise-en-place-1440-clair.png` | Bandeau « Entreprise : … » sous les onglets, au-dessus partout ailleurs ; titre collé au trait du bandeau | `ui/index.tsx:157` exclut cette vue, qui affiche son propre bandeau (`vues/mise-en-place.tsx:216`) | présent | Retirer l'exception et le bandeau propre à la vue |
| D16 | mineur | Connexions ; toutes largeurs | `atelier-connexions-1440-clair.png` | L'onglet « Connexions » titre la page « Paramètres et diagnostic » | `vues/parametres.tsx:68`, même vue pour les deux onglets | présent | Titre selon l'ancre (« Connexions ») |
| D17 | mineur | Paramètres ; 1440 | `atelier-parametres-1440-clair-long.png` | En-têtes « Santé » et « Dernière vérification » au-dessus de cellules fusionnées : le texte de chaque ligne commence entre deux colonnes | `ui/connecteurs.tsx:69-90` (`colSpan={3}` voulu quand aucune connexion) | présent | Masquer ces deux colonnes quand aucune ligne n'a de connexion |
| D18 | mineur | Discussion ; 1440 | `atelier-discussion-1440-clair-long.png` | Colonne centrée (52rem) décalée de 9 px par rapport au bandeau ; boutons et champ en pilule, seuls de l'atelier | `styles-discussion.ts:7` (`margin: 0 auto`), `:14` (`border-radius: 1.5rem`) | présent | Aligner à gauche comme les autres vues ; rayon commun `--atl-rayon` |
| D19 | mineur | Accueil ; toutes largeurs | `atelier-accueil-1440-sombre-long.png` | « Modèles de demande » rendus en boutons discrets sans bord, lus comme du texte | `vues/accueil.tsx:243` (`variante="discret"`) | présent | Variante avec bord (puces) |
| D20 | mineur | Tableau de bord ; 1440 | `socle-dashboard-1440-clair-long.png` | Activité récente : « Gardien des connexions environm… » coupé à mi-largeur, une ligne de 77 px par battement du même agent | Ligne d'activité du tableau de bord du socle | présent | Texte sur toute la largeur ; regrouper les battements planifiés |
| D21 | mineur | Registre des échanges (Direction) ; 1440 | `direction-atelier-echanges-1440-clair.png` | Libellés « Du » et « Au » 7 px plus bas que « Service » et « Statut » ; format affiché « dd/mm/yyyy » | Champs `type="date"` de hauteur différente dans la même rangée (`vues/echanges.tsx:253-258`) ; le format anglais vient du Chromium sans interface, à revérifier dans un navigateur en français | présent (alignement) | Hauteur commune des contrôles de la rangée |
| D22 | mineur | Prospects (étalonnage), base clients ; toutes largeurs | `atelier-prospects-1440-clair-long.png` | Champ fichier natif non stylé, alors que Connaissances a un bouton « Choisir un fichier » | `vues/prospects.tsx:1196`, `base-clients.tsx:292` | présent | Réutiliser le sélecteur de Connaissances |
| D23 | mineur | Liste des agents (socle) ; 1440 | `socle-agents-1440-clair.png` | Noms des agents en pause et libellé « Claude Code » en gris très pâle (contraste estimé sous 3:1) | Liste des agents du socle | présent | Estomper la pastille d'état seulement, pas le nom |
| D24 | mineur | Boîte de réception (socle) ; 1440 | `socle-inbox-1440-clair.png` | Point rouge sur l'icône et pastille « 1 » en double ; texte indicatif coupé « Rechercher : boîte de ré » | Barre latérale et page de la boîte du socle | présent | Une seule marque ; texte indicatif court (« Rechercher ») |
| D25 | mineur | Paramètres ; 390 | `atelier-parametres-390-clair.png` | Section Diagnostic repliée et rien d'autre : la page paraît vide | Repli par défaut sur téléphone dans `vues/parametres.tsx` | présent | Section ouverte par défaut, ou résumé visible sous le titre replié |
| D26 | mineur | Rapport du mois ; toutes largeurs | `atelier-rapport-1440-clair-long.png` | Notes des cellules en gras (même graisse que le libellé) ; largeur des colonnes différente d'un tableau à l'autre | `styles-rapport.ts` | présent | Notes en graisse normale, atténuées ; colonnes fixes communes |
| D27 | mineur | Résultats, Paramètres ; toutes largeurs | `atelier-resultats-1440-clair-long.png` | Pluriels entre parenthèses : « 0 événement(s) », « 11 agent(s) » | `serveur/services.ts:2281`, `ui/connexions-natives.ts:330-332` | présent | Fonction `pluriel` déjà utilisée ailleurs |
| D28 | mineur | Toutes les vues de l'atelier (instance) | console | 403 sur `/api/plugins/atelier.marketing-ia/api/liaisons/registre` à chaque page (72 erreurs sur 210 chargements) | Sonde d'accès Direction de l'interface servie | corrigé dans les sources (`6184065`, route `liaison.acces`) | Redéployer le plugin |
| D29 | mineur | Départements (Marketing et Direction) | `atelier-departements-1440-clair.png` | La rubrique Départements n'existe pas sur l'instance ; l'adresse `/atelier/departements` affiche l'Accueil sans message | Interface servie antérieure à `749cdbb` et `605d34c` ; `lireRoute` (`ui/route.ts`) retombe sur l'Accueil pour une vue inconnue | non auditable, à revoir après déploiement | Redéployer puis capturer la grille des départements |
| D30 | mineur | Projets, Campagnes ; 1440 | `socle-projects-1440-clair.png`, `atelier-campagnes-1440-clair.png` | Incohérence : deux projets (dont « Campagne printemps 2027 », décrite comme « fictive ») côté socle, « Aucune campagne pour l'instant » côté atelier | Données de démonstration restées dans l'entreprise (contenu, pas du code) | à vérifier | Retirer le projet fictif ou expliquer la différence |

Décompte : **0 bloquant, 13 majeurs, 17 mineurs** (30 défauts).

## Incohérences d'ensemble

- Deux langues et deux devises entre l'atelier (français, euros) et le socle (anglais, dollars).
- Trois formes de bouton : rectangle arrondi (atelier), pilule (Discussion), lien gras sans bord (« Actualiser », « Relire les connexions »).
- Bandeau entreprise placé au-dessus des onglets partout sauf Mise en place.
- Trois niveaux de navigation dans la page (barre du socle, menu de l'atelier, onglets) plus un quatrième dans Paramètres.

## Ce qui fonctionne

- Thème sombre complet et lisible sur toutes les vues de l'atelier.
- États vides rédigés pour agir (« Envoyez une demande ci-dessus : le Coordinateur la répartit… »).
- Aucun débordement horizontal du document sur 390 px ; tableaux de l'Équipe passés en cartes sur téléphone.
- Aucun dégradé décoratif, aucun tiret cadratin dans les textes du plugin.

## Lots de correction proposés (fichiers disjoints)

| Lot | Défauts | Fichiers | Commande Impeccable |
|---|---|---|---|
| A. Mise en page de l'atelier | D01, D04, D05, D13, D18, D19, D26 | `plugin-atelier/src/ui/styles.ts`, `styles-accueil.ts`, `styles-connaissances.ts`, `styles-discussion.ts`, `styles-rapport.ts`, `vues/accueil.tsx` | `layout`, puis `quieter` pour les barres |
| B. Navigation sur téléphone | D03, D25 | `plugin-atelier/src/ui/onglets.tsx`, `index.tsx` (rangée des rubriques), `vues/parametres.tsx` | `adapt` |
| C. Vues de réglages | D14, D15, D16, D17, D22 | `vues/mise-en-place.tsx`, `connecteurs.tsx`, `vues/prospects.tsx`, `base-clients.tsx` (et la ligne 157 de `index.tsx` si le lot B ne la touche pas : à placer dans un seul des deux lots) | `polish` |
| D. Textes destinés au client | D06, D07, D27 | `plugin-atelier/src/serveur/services-rapport.ts`, `serveur/services.ts`, `ui/connexions-natives.ts`, descriptions de `vues/campagnes.tsx`, `vues/equipe.tsx`, `vues/resultats.tsx` | `clarify` |
| E. Socle : langue, devise, titres, mobile | D02, D08, D09, D12, D20, D23, D24 | `paperclip/ui/src/pages/PluginPage.tsx`, `pages/Issues.tsx`, `pages/Companies.tsx`, `pages/CompanySettings.tsx`, `pages/AgentDetail.tsx`, `pages/Routines.tsx`, `components/RoutineList.tsx`, `lib/utils.ts`, en patchs `socle/patches/` | `clarify`, `adapt` |
| F. Organisation du client | D10, D11, D30 | `scripts/bootstrap-organisation.py` (décision de l'opérateur pour les préfixes) | aucune (données) |
| G. Déploiement | D28, D29 | aucun fichier : redéployer le plugin, puis capturer Départements | `audit` à relancer |

Ordre conseillé : A (une règle CSS règle la moitié des écarts), puis D et E en parallèle, puis B et C, puis F sur décision, puis G et un nouvel audit, et `polish` pour finir.

Questions skipped: rapport rendu par un sous-agent, les choix reviennent à l'opérateur par la session principale.

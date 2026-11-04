# Observatoire : fiches des 10 composants (K1 à K10)

Document de spécification (phase 1, lot D). Il détaille les composants du livrable E du plan « Avenue de
l'Observatoire ». Les schémas Zod d'entrée et de sortie sont ceux de `plugin-atelier/src/contrats/observatoire.ts`
(écrit par un autre lot) ; ce document ne nomme que les types (Fiche, Dossier, Chapitre, Affirmation, Preuve,
Revision, Edition) et les objets techniques propres à un composant (candidat, instantané, alias).

## Quotas des sources tierces

Valeurs fournies par la consigne du lot et conformes aux pages officielles citées ; à revérifier au moment du
branchement de chaque source, car elles peuvent changer sans préavis.

| Source | Limite | Référence |
| --- | --- | --- |
| GitHub REST, authentifié | 5 000 requêtes par heure | `docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api` |
| GitHub, recherche | 30 requêtes par minute (authentifié) | même page, section « search » |
| YouTube Data API v3 | 10 000 unités par jour et par projet ; coût variable selon la méthode | `developers.google.com/youtube/v3/getting-started#quota` |
| arXiv API | 1 requête toutes les 3 secondes, une seule connexion | `info.arxiv.org/help/api/tou.html` |
| Registres de paquets (npm, PyPI) | pas de quota chiffré publié retenu ici : cadence bornée par K4 | inconnu, à mesurer |

Les quotas sont tenus par un compteur par source dans K1 ; un dépassement reporte la collecte, il ne la force
jamais.

## Légende des statuts

- **nouveau** : aucun module existant ne fait ce travail.
- **réutilisé** : un module existant est appelé tel quel.
- **à adapter** : un module existant est repris avec des changements.
- **à regrouper** : à fusionner avec un autre composant.
- **à reporter** : hors de la phase P0.

| Composant | Statut | Fichier existant réutilisé |
| --- | --- | --- |
| K1 `collecteur` | nouveau (réutilise la lecture protégée) | `plugin-atelier/src/serveur/lecture-url.ts` |
| K2 `normaliseur` | à adapter | `plugin-atelier/src/serveur/html-markdown.ts`, `plugin-atelier/src/serveur/contenu-externe.ts` |
| K3 `identites` | nouveau (méthode reprise) | `plugin-atelier/src/serveur/rapprochement-prospects.ts` (idée seulement) |
| K4 `droits-sources` | nouveau | aucun |
| K5 `qualification` | nouveau | aucun |
| K6 `affirmations` | nouveau (étend un contrat) | `plugin-atelier/src/contrats/sources.ts` |
| K7 `redaction-dossier` | à adapter | compétences `recherche-sourcee`, `recherche-connaissances`, `contenu-recherche-ia` |
| K8 `essais-isoles` | à reporter en P1 | `fabrique/cage.py` (modèle) |
| K9 `publication` | à adapter (export git nouveau) | compétences `adaptation-fr-nl-en`, `audit-seo`, `accessibilite-wcag` ; fabrique (PDF) |
| K10 `maintenance` | à adapter (détection d'impact nouvelle) | compétences `controles-techniques-liens`, `classement-archivage` |

Aucun composant n'est classé « à regrouper » : K4 pourrait vivre dans K1, mais sa table de droits sert aussi aux
autres services (voir sa fiche), d'où une fiche séparée.

## K1 `collecteur`

- **Finalité** : ramener, à cadence bornée, les nouveautés des sources suivies : dépôts et versions GitHub,
  registres de paquets, pages officielles des éditeurs, arXiv, métadonnées YouTube, textes réglementaires
  (capacités 1 à 7). Aucun modèle de langage n'intervient : c'est un job du plugin, paramétré par type de source.
- **Entrée** : une définition de source (type, adresse, cadence, dernière empreinte connue), autorisée par K4.
- **Sortie** : des candidats bruts et des instantanés (texte reçu, adresse finale, date, empreinte `sha256`) ;
  un instantané déjà connu (même empreinte pour la même source) n'est pas réécrit.
- **Consommateurs** : K2 (normalisation), K10 (détection de changement).
- **Dépendances** : `lecture-url.ts` (DNS contrôlé à la connexion, redirections revalidées, taille et délai bornés,
  transport de fixtures en démonstration) ; K4 (autorisation et cadence) ; jetons d'API GitHub et YouTube rangés
  dans les secrets de l'instance de l'observatoire.
- **Autorisations** : sortie réseau par le mandataire de l'instance seulement ; écriture des tables de candidats et
  d'instantanés ; aucun accès aux tables éditoriales.
- **Coûts** : 0 jeton de modèle. Appels d'API bornés par les quotas du tableau ci-dessus ; le compteur garde une
  marge de 20 % (proposition) pour les relances manuelles. Un job GitHub qui suit N dépôts consomme de l'ordre de
  N requêtes par passage ; avec un passage par jour, la limite horaire n'est pas un frein. La recherche GitHub
  (30 par minute) et YouTube (10 000 unités par jour) sont les vraies contraintes : la recherche par mot-clé est
  limitée à un passage par jour et par requête enregistrée.
- **Échecs prévisibles** : source muette (aucune réponse, page d'erreur servie en 200), quota dépassé (réponse 403
  ou 429), redirection vers un hôte interdit, contenu trop gros, contenu piégé (consigne injectée), changement de
  format de l'API.
- **Critères de validation** : tests sur fixtures (aucun réseau) : une source déjà vue ne crée pas de doublon ;
  un 429 met la source en attente avec la date de reprise ; une redirection vers une adresse privée est refusée
  (comportement de `lecture-url.ts`) ; le compteur de quota refuse un appel au-delà de la limite.
- **Réutilisation** : la veille réglementaire et la veille concurrentielle des autres services peuvent déclarer leurs
  propres sources dans le même job.

## K2 `normaliseur`

- **Finalité** : transformer un instantané en texte propre et comparable, et signaler le contenu suspect
  (capacités 8 et 36).
- **Entrée** : un instantané brut (HTML, Markdown, JSON d'API).
- **Sortie** : le texte normalisé de l'instantané (celui contre lequel la porte vérifie les extraits, règle OBS-02),
  son empreinte, le titre, les indices de page d'erreur et la liste des injections signalées.
- **Consommateurs** : K3, K5, K6, la porte, les agents qui lisent les instantanés.
- **Dépendances** : `htmlVersMarkdown` (`html-markdown.ts`), `texteVisible`, `titreHtml`, `indicesPageErreur`,
  `injectionsSignalees` (`contenu-externe.ts`).
- **Adaptations nécessaires** : conserver les blocs de code (aujourd'hui `html-markdown.ts` traite `pre` comme un bloc
  ordinaire, ligne 80, et réduit les blancs, ligne 110 : l'indentation d'une commande est perdue) ; normalisation documentée et stable (Unicode NFC, blancs réduits) car la porte
  compare des extraits à ce texte ; lecture des README Markdown sans conversion.
- **Autorisations** : lecture des instantanés, écriture du texte normalisé ; fonction pure, aucun réseau.
- **Coûts** : 0 jeton, 0 appel d'API ; temps de calcul borné par la taille maximale déjà imposée (512 Ko).
- **Échecs prévisibles** : page dont le contenu est rendu par JavaScript (texte vide), encodage faux, page piégée
  pour un retour arrière exponentiel (déjà borné), changement de normalisation qui invaliderait les extraits déjà
  stockés.
- **Critères de validation** : un bloc de code sort à l'identique ; deux passages donnent la même empreinte ; une
  version de la normalisation est enregistrée avec chaque texte, et un changement de version déclenche un nouveau
  calcul et non une comparaison entre versions différentes.
- **Réutilisation** : l'import de pages dans les connaissances des autres services utilise déjà `html-markdown.ts` ;
  la conservation des blocs de code leur profite aussi.

## K3 `identites`

- **Finalité** : reconnaître qu'un dépôt renommé, un paquet publié sous un autre nom ou une page de produit
  désignent le même outil, et tenir l'identifiant canonique (capacités 9 et 13).
- **Entrée** : un candidat normalisé.
- **Sortie** : un rapprochement proposé (identifiant canonique, alias, raison) ou « inconnu ».
- **Consommateurs** : `veille-technique` (qui confirme ou infirme), K5.
- **Dépendances** : table d'alias ; méthode prudente de `rapprochement-prospects.ts` (en cas de doute, on ne
  fusionne pas ; un identifiant fort différent interdit le rapprochement).
- **Règles proposées** : même identifiant de dépôt GitHub (identifiant numérique, stable au renommage) : même outil ;
  même paquet sur le même registre : même outil ; deux identifiants forts différents : jamais le même ; nom seul :
  proposition soumise à l'agent, jamais fusion automatique.
- **Autorisations** : lecture des Fiches et alias ; écriture des propositions ; la fusion effective passe par une
  décision de l'agent.
- **Coûts** : 0 jeton ; un appel GitHub par dépôt inconnu pour obtenir son identifiant numérique.
- **Échecs prévisibles** : forks qui reprennent le nom, projets homonymes, dépôt transféré à une autre organisation.
- **Critères de validation** : dépôt renommé reconnu ; deux forks non fusionnés ; homonymes sans identifiant
  commun laissés séparés.
- **Réutilisation** : la veille concurrentielle (même entreprise sous plusieurs noms) peut reprendre la table.

## K4 `droits-sources`

- **Finalité** : décider, pour chaque source, si et comment on a le droit de la collecter et de la citer : licence,
  `robots.txt`, conditions d'utilisation, politique de collecte (capacité 10 ; menace « collecte illicite » de J.1).
- **Entrée** : une source déclarée ou découverte.
- **Sortie** : une décision de droits (autorisée par API officielle, autorisée en lecture de page, refusée), la
  cadence maximale et la longueur maximale d'un extrait cité.
- **Consommateurs** : K1 (avant chaque collecte), K9 (longueur des citations publiées), la porte (règle OBS-15).
- **Dépendances** : table des politiques par domaine, tenue par un humain ; lecture du `robots.txt` par K1.
- **Principes** : API officielle d'abord ; `robots.txt` respecté ; cadence bornée ; jamais de copie intégrale
  publiée, seulement des extraits courts avec renvoi.
- **Autorisations** : lecture par tous les composants ; écriture par un humain seulement.
- **Coûts** : 0 jeton ; une lecture de `robots.txt` par domaine et par jour.
- **Échecs prévisibles** : conditions d'utilisation qui changent, domaine sans politique connue (par défaut :
  refusé jusqu'à décision humaine), `robots.txt` illisible.
- **Critères de validation** : une source sans décision n'est pas collectée ; un chemin interdit par `robots.txt`
  n'est pas lu ; un extrait publié plus long que la limite est refusé.
- **Réutilisation** : la table sert à toute collecte de l'usine (veille réglementaire, concurrentielle, médias).

## K5 `qualification`

- **Finalité** : classer un candidat dans la taxonomie, mesurer sa pertinence et sa nouveauté, calculer le diff entre
  deux versions, repérer les lacunes de couverture (capacités 11, 12, 14 et 15).
- **Entrée** : candidat normalisé et rapprochement de K3 ; versions connues.
- **Sortie** : catégorie, score explicable (chaque critère avec sa valeur et sa raison), diff de versions, liste des
  catégories sous-couvertes.
- **Consommateurs** : `veille-technique` (jugement final), `directeur` (arbitrage), K10.
- **Dépendances** : table de taxonomie extensible ; K2 et K3.
- **Autorisations** : lecture des candidats et Fiches ; écriture des scores.
- **Coûts** : 0 jeton pour le score (calcul) ; le jugement de l'agent `veille-technique` se paie sur son budget.
- **Échecs prévisibles** : version ambiguë (étiquettes non sémantiques, versions retirées), catégorie absente de la
  taxonomie (candidat mis « à classer », jamais forcé dans une catégorie voisine), score dominé par la popularité.
- **Critères de validation** : même entrée, même score ; chaque score a autant de raisons que de critères ; un
  candidat sans catégorie reste « à classer ».
- **Réutilisation** : le score explicable peut servir à la veille concurrentielle ; la taxonomie reste propre à
  l'observatoire.

## K6 `affirmations`

- **Finalité** : tenir le lien entre chaque Affirmation et ses Preuves, avec le statut de vérification de F.1 et la
  confiance de 0 à 3 avec motif (capacités 16 et 40, provenance).
- **Entrée** : Affirmations et Preuves déposées par les agents.
- **Sortie** : Affirmations validées par le schéma, chacune avec son statut, ses Preuves (source, instantané,
  extrait exact) et, le cas échéant, l'Affirmation qui la remplace.
- **Consommateurs** : tous les agents de rédaction, la porte (règles OBS-01 à OBS-16), K9, K10.
- **Dépendances** : les `sources` du plugin (`contrats/sources.ts`), dont l'énumération `provenance` reçoit une
  valeur nouvelle `instantane` ; K2 (texte normalisé de l'instantané).
- **Autorisations** : écriture par les agents producteurs du dossier seulement ; une Affirmation publiée n'est
  jamais modifiée, elle est remplacée (nouvelle Affirmation et lien de remplacement).
- **Coûts** : 0 jeton côté code ; la compétence `affirmations-preuves` (à créer) se paie sur le budget des agents.
- **Échecs prévisibles** : extrait paraphrasé au lieu d'être copié, Preuve vers une source non enregistrée, statut
  plus fort que la Preuve (affirmation commerciale classée vérifiée).
- **Critères de validation** : tests de la porte (`regles-porte.md`) ; le schéma refuse un statut hors de
  l'énumération de F.1 et une confiance hors de 0 à 3.
- **Réutilisation** : le modèle affirmation, preuve et statut convient à tout livrable factuel des autres services ;
  à proposer après le pilote.

## K7 `redaction-dossier`

- **Finalité** : produire la Fiche (niveau 1) et le Dossier en 24 chapitres : tutoriels, diagrammes Mermaid,
  comparaisons, compatibilité, API, déploiement, permissions, coûts, menaces (capacités 17 à 25 et 27 à 30).
- **Entrée** : Fiche acceptée, instantanés, Affirmations existantes.
- **Fiche à 26 champs** : `dateDerniereVersion` (AAAA-MM-JJ, publication de la dernière version STABLE, remplace l'ancien critère « Maturité » du comparateur) suit
  `derniereVersion` : retenue seulement si `derniereVersion` l'est et si la date égale `derniereStable(versions).publieeLe`, sinon « inconnu ».
- **Sortie** : Dossier, Chapitres et Revisions brouillon, avec leurs Affirmations.
- **Consommateurs** : la porte, `relecteur-independant`, K9.
- **Dépendances** : compétences existantes `recherche-sourcee`, `recherche-connaissances`, `contenu-recherche-ia` ;
  compétences à créer `dossier-24-chapitres`, `analyse-mcp-plugins-skills`, `analyse-menaces-outil`,
  `affirmations-preuves` (liste complète dans `agents.md`, section 5).
- **Adaptations nécessaires** : `recherche-connaissances` vise les connaissances d'un client (conditions, tarifs) ;
  elle sert ici à interroger les instantanés et Dossiers déjà publiés, ce que sa consigne doit dire.
  `contenu-recherche-ia` sert à la structure lisible par les moteurs de réponse, pas au fond.
- **Autorisations** : celles des agents producteurs (voir `agents.md`).
- **Coûts** : le poste principal en jetons. Proposition à mesurer au pilote : un Dossier complet tient dans le
  budget mensuel de `analyste-technique` (3000 centimes) pour quelques dossiers par mois ; la mesure réelle se fait
  sur les trois premiers dossiers.
- **Échecs prévisibles** : chapitre rempli sans Affirmation, chiffre recopié d'une page commerciale classé vérifié,
  diagramme qui contredit le texte, information absente comblée par une supposition.
- **Critères de validation** : PASS de la porte ; verdict réussi du relecteur ; un Chapitre sans matière reste
  « information manquante ».
- **Réutilisation** : les compétences existantes restent partagées ; les nouvelles sont propres à l'observatoire.

## K8 `essais-isoles`

- **Finalité** : préparer et exécuter un essai réel d'un outil dans une machine virtuelle jetable et rendre des
  journaux empreintés (capacités 26 et 27, exécution).
- **Entrée** : protocole d'essai approuvé par un humain (outil, version, étapes, mesures).
- **Sortie** : journaux et mesures avec empreintes, identifiant d'essai lié aux Affirmations (statut
  `verifie_experimentalement` seulement par ce chemin, F.1).
- **Consommateurs** : `ingenieur-essais`, la porte (règles OBS-04 et OBS-06).
- **Dépendances** : service séparé sur le modèle de la fabrique (`fabrique/cage.py` : lanceur sans shell, exécution
  bornée, récupération sûre) ; hyperviseur pour les machines jetables.
- **Isolement** (J.1) : jamais sur l'hôte ; machine jetable restaurée depuis un instantané, réseau coupé ou liste
  blanche, CPU, mémoire et durée bornés, détruite après usage ; lancement sur approbation humaine.
- **Autorisations** : le service seul lance les machines ; aucun agent n'y a accès direct.
- **Coûts** : 0 jeton côté service ; temps machine et mémoire de l'hôte (une seule machine d'essai à la fois sur le
  poste actuel, qui a déjà subi un arrêt par manque de mémoire).
- **Échecs prévisibles** : essai trop long, réseau exigé par l'outil, résultat non reproductible, outil hostile qui
  tente de sortir de la machine.
- **Critères de validation** : la machine est détruite même en cas d'échec ; un essai sans approbation ne démarre
  pas ; les empreintes des journaux sont recalculables.
- **Statut** : **à reporter en P1**. En P0, aucun outil n'est exécuté : aucune Affirmation ne peut donc avoir le
  statut `verifie_experimentalement`.
- **Réutilisation** : le service peut servir aux tests techniques d'autres services (essai d'un logiciel avant
  achat), sur décision.

## K9 `publication`

- **Finalité** : révision française, traduction anglaise, glossaire protégé, Edition hebdomadaire, SEO,
  accessibilité, export versionné, PDF (capacités 31 à 35 et 39).
- **Entrée** : Revisions validées (PASS de la porte, verdict réussi du relecteur, approbation humaine quand F.5
  l'exige).
- **Sortie** : Edition publiée ; export versionné vers un dépôt git ; PDF fabriqué.
- **Consommateurs** : le site public, les lecteurs, K10.
- **Dépendances** : compétences `adaptation-fr-nl-en`, `audit-seo`, `accessibilite-wcag` ; fabrique (PDF) ; dépôt
  git de publication (**nouveau**).
- **Autorisations** : seul le job d'export écrit dans le dépôt de publication ; aucun agent n'y pousse.
- **Coûts** : jetons de `redacteur-en-chef` et `adaptateur-anglais` ; PDF par la fabrique (calcul local).
- **Échecs prévisibles** : traduction sur une base française périmée, commande traduite, lien mort au moment de la
  publication, PDF qui ne correspond pas à la Revision publiée.
- **Critères de validation** : règles OBS-08 et OBS-09 ; l'export porte l'identifiant de la Revision et son
  empreinte ; le PDF est fabriqué depuis la même Revision.
- **Réutilisation** : l'export git versionné peut servir aux documents publics des autres services.

## K10 `maintenance`

- **Finalité** : détecter les changements des sources, cibler les Chapitres à mettre à jour, vérifier les liens, la
  cohérence entre français et anglais, archiver (capacités 36 à 40).
- **Entrée** : nouveaux instantanés (K1), nouvelles versions (K5), Dossiers publiés.
- **Sortie** : liste des Dossiers et Chapitres impactés avec le motif ; Affirmations à marquer `obsolete` ; liens
  morts ; traductions périmées ; archives.
- **Consommateurs** : `directeur` (décision d'actualiser), `analyste-technique` (jugement d'impact),
  `adaptateur-anglais`.
- **Dépendances** : compétences `controles-techniques-liens`, `classement-archivage` ; détection d'impact
  **nouvelle** (lien entre un instantané qui change et les Preuves qui le citent).
- **Autorisations** : lecture de tout le contenu publié ; écriture des signalements ; le marquage `obsolete` d'une
  Affirmation publiée passe par une Revision, jamais par une modification directe.
- **Coûts** : 0 jeton pour la détection ; jetons de l'agent qui juge l'impact ; une requête par lien vérifié,
  bornée par K4.
- **Échecs prévisibles** : page qui change à chaque lecture (date, compteur) et crée de faux changements, lien
  temporairement indisponible, archive d'une source supprimée.
- **Critères de validation** : un changement d'instantané sans effet sur un extrait cité ne signale rien ; un
  extrait cité qui disparaît signale l'Affirmation ; une Revision française nouvelle signale la traduction anglaise.
- **Réutilisation** : la détection « source changée, affirmation impactée » sert la veille réglementaire des autres
  services (texte de loi modifié).

## Spécifié, pas encore construit (état au 30/10/2026)

Relevé de l'audit du 29/10 (paquet OA5), vérifié dans le code du jour : ces éléments des spécifications n'ont encore
aucun code. Ils ne sont pas faits ; aucune page ni aucun agent ne doit les présenter comme faits.

| Élément | Spécification | État | Composant ou phase |
| --- | --- | --- | --- |
| Changelog documentaire généré depuis les révisions | `politique-versions.md` §3 | aucune table ni aucun export | K9, K10 |
| Chapitres `a_actualiser` après une nouvelle version | `politique-versions.md` §4 | statut déclaré dans le contrat, jamais calculé | K10 |
| Projet « non maintenu » | `politique-versions.md` §6 | aucun critère ni statut en code | K10 |
| Lien mort cité par sa capture Wayback | `politique-versions.md` §7 | compteur d'échecs seul (`echecs_consecutifs`, `en_echec`) | K10 |
| Corrections traçables d'une édition (`obs_editions`) | `politique-versions.md` §8, `modele-donnees.md` | table absente | phase 5 |
| Taxonomie bilingue (`obs_categories`) | `i18n.md` §3 | table absente | K9 |
| Tâche de diff pour `adaptateur-anglais` quand une révision FR plus récente est publiée | `i18n.md` §6 | rien ne la crée ; le bandeau « traduction périmée » du site existe (`TraductionPerimee.astro`) et la porte refuse la base périmée (OBS-08) | K10 |
| Moteur des questions (`claude -p`), index public du seul contenu publié, citations vérifiées par code, jeu des 60 questions | ADR-006, ADR-007, `plan-tests.md` §4 | absents | phase 4 |
| Configuration plein texte `english` du RAG | ADR-007 | absente : le RAG n'accepte que `fr` et `nl` (`contrats/connaissances.ts`, `LangueConnaissance`), donc aucun dossier anglais n'y entre ; à ajouter avec l'index public | phase 4 |
| Plafond de sujets par semaine, estimation avant un lot lourd, rapport hebdomadaire de consommation | ADR-010, `finops.md` §5 | budgets natifs par agent seuls ; `scripts/observatoire/mesure_quota.py` est une mesure à la main, pas un rapport | pilote (phase 3) |

Une révision copiée n'est jamais modifiée (`politique-versions.md` §1) : le code n'a aucune requête de mise à jour sur
`obs_revisions` (test de garde SKMK-O1). Un déclencheur en base n'est pas possible : le socle refuse `CREATE TRIGGER` et
`CREATE FUNCTION` dans une migration de plugin.

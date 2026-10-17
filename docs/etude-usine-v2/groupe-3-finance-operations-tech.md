# Étude usine v2 : groupe 3, finance, opérations et technique

Date : 17/10/2026. Périmètre : comptabilite-finance, fiscalite, achats, logistique, production, informatique,
donnees-bi, recherche-innovation, gestion-projets, services-generaux. Étude en lecture seule : aucun fichier
de `organisation/` n'a été modifié.

## 1. Méthode et sources

Ce qui a été lu :

- nos 25 fiches `organisation/services/<service>/agents/*/AGENTS.md` du groupe (en-têtes et un coordinateur
  complet, `coordinateur-comptabilite`) ;
- nos 36 compétences propres au groupe (plus les 4 communes : `cadrage-exigences`, `planification-livrables`,
  `dossier-validation-humaine`, `recherche-connaissances`), par leur description et une recherche de mots clés
  (présence ou absence de notions précises, voir les tableaux) ; `plan-tresorerie` lu en entier comme étalon ;
- dans les dépôts de référence, uniquement les `SKILL.md` et agents pertinents, listés ci-dessous.

Les dépôts ont été clonés en profondeur 1 dans un répertoire temporaire, jamais exécutés, puis supprimés.

| Id | Dépôt | Version lue | Licence | Ce qu'impose la licence |
| --- | --- | --- | --- | --- |
| S1 | github.com/anthropics/knowledge-work-plugins | commit 33eeda1e8fd8 (15/10/2026) | Apache 2.0 (fichier `LICENSE` à la racine, et dans `finance/` et `data/`) | garder la mention de licence et de l'auteur, signaler les modifications ; aucun fichier NOTICE à reporter |
| S2 | github.com/anthropics/skills (`skills/xlsx`, `skills/docx`) | commit dbd4588 (09/10/2026) | **propriétaire** (`LICENSE.txt` : copie, extraction et œuvres dérivées interdites) | **aucune reprise possible** ; usage tel quel seulement si l'environnement d'exécution le fournit |
| S3 | github.com/alirezarezvani/claude-skills | commit 19392f7a0826 (26/08/2026) | MIT | garder la mention de droit d'auteur et de licence |
| S4 | github.com/wshobson/agents | commit 044b4b21f083 (15/10/2026) | MIT | idem |
| S5 | ECC, github.com/affaan-m/ECC (installé dans `~/.claude/plugins/marketplaces/ecc`) | commit ef648e01899b (01/10/2026) | MIT pour le dépôt ; les compétences métiers lues portent `license: Apache-2.0` dans leur en-tête (auteur « evos ») | appliquer Apache 2.0 à ces compétences : mention et signalement des modifications |
| S6 | plugins locaux `entreprise-finance`, `entreprise-it`, `entreprise-direction` (`~/.claude/plugins/marketplaces/skills-entreprise`) | commit 474785f (28/09/2026) | MIT, auteur Jean-Baptiste Dhondt | aucune contrainte (même auteur) |

Règle de reprise retenue : on reprend une **méthode** (étapes, grille, seuils de départ, liste de contrôle,
format de sortie), réécrite en français et adaptée au droit belge, jamais un texte recopié tel quel. Même
reformulée, chaque reprise est attribuée : ajouter dans chaque `SKILL.md` concerné une section « Origine de la
méthode » (dépôt, chemin, commit, licence, « adapté et traduit »), et un fichier d'attributions commun pour le
texte des licences Apache 2.0 et MIT. Ce fichier n'existe pas encore : à créer au moment de l'implémentation.

Point de vigilance licence : S2 (xlsx, docx) est propriétaire. Ses bonnes pratiques de tableur ne doivent pas
être transposées dans nos compétences par dérivation. Les tableurs produits par nos agents s'appuient sur des
outils libres éprouvés (openpyxl, LibreOffice en mode sans interface pour recalculer) et sur nos propres règles.

Banc Phoenix : aucune mention de « Phoenix » n'a été trouvée dans le dépôt (`grep -rli phoenix` sans
résultat hors dépendances). Les cas d'essai sont donc écrits sous une forme neutre réutilisable par un banc
d'évaluation : entrée, sortie attendue, critères mesurables (vrai ou faux, compte exact, valeur exacte). Le
format exact du jeu de données reste à aligner sur le banc quand il sera défini.

## 2. Constats transversaux

**Prouvé par la lecture :**

1. Le groupe compte 25 agents : 10 coordinateurs et 15 spécialistes, soit 1 à 2 spécialistes par service.
   Les organigrammes réels de ces métiers en PME de 50 à 150 personnes en comptent bien davantage.
2. Les compétences sont solides et déjà belges : `plan-tresorerie` (113 lignes) a des étapes numérotées, des
   seuils, trois scénarios, des critères vérifiables, des sources datées et un cas d'échec. Elles sont plus
   complètes que les compétences équivalentes de S6 (49 à 58 lignes) et que plusieurs de S1. L'enjeu est
   d'**ajouter des méthodes précises** là où elles manquent, pas de tout réécrire.
3. Les compétences fiscales reposent sur des sources secondaires : `preparation-tva` cite un blog de cabinet,
   `impot-des-societes` cite MyFid et un article de 2018, `precompte-professionnel` cite MyFid et Securex. Les
   pages du SPF Finances étaient inaccessibles le 16/10 (vérification anti-robot), ce que j'ai reproduit le
   17/10 sur la page Biztax. Une brochure officielle du SPF Finances (Belcotax-on-web, fiches 281, version
   06/12/2024) est en revanche accessible en PDF, et la BNB décrit la Centrale des bilans sur nbb.be.
4. La plateforme Biztax (déclaration ISOC) et Belcotax-on-web (fiches 281) ne sont citées par aucune de nos
   compétences (`grep -il biztax`, `grep -il belcotax` : aucun fichier).
5. Les coordinateurs actuels ont l'interdiction de déléguer hors de leur service et passent par un « bureau de
   liaison » (route `liaison.demander`, notée « en cours de construction ») avec des réponses bornées. C'est
   la bonne base pour la cible « les coordinateurs se parlent tous entre eux » : il faut la garder, pas la
   remplacer par une messagerie libre.
6. Le modèle d'un agent n'apparaît pas dans l'en-tête des `AGENTS.md` (champs `kind`, `slug`, `name`, `title`,
   `reportsTo`, `skills`). La répartition Opus pour les coordinateurs et Sonnet pour les spécialistes doit donc
   être portée ailleurs (configuration de l'adaptateur) : à décider.

**Probable :** une PME de type courtier d'environ 100 personnes n'a pas d'atelier de production ni d'entrepôt.
Les services production et logistique doivent rester activables par entreprise et non créés partout.

### 2.1 Coordination entre coordinateurs (proposition commune au groupe)

Reprise de S4, `plugins/agent-teams/skills/team-communication-protocols/SKILL.md` (MIT) et
`team-composition-patterns/SKILL.md` (MIT), adaptée :

- message direct d'un coordinateur à un autre par défaut ; diffusion à tous réservée aux blocages qui touchent
  tout le monde (S4 : « Broadcasting routine updates » est listé comme anti-modèle, chaque diffusion coûte un
  message par destinataire) ;
- on signale quand une interface est prête (« les chiffres validés de septembre sont disponibles ») au lieu de
  faire du suivi pas à pas ;
- approbation du plan avant exécution : identique à notre « mode plan » actuel ;
- taille d'équipe : partir de la plus petite équipe qui couvre les dimensions requises, chaque agent ajouté
  augmente le coût de coordination (S4, tableau « Team Sizing Heuristics »). Conséquence pour nous : un
  coordinateur n'ouvre pas une sous-tâche par spécialiste par réflexe ; la règle actuelle « au plus 4
  sous-tâches ouvertes » reste valable même avec 10 spécialistes.

Ce que l'on garde de chez nous et que S4 n'a pas : réponse bornée (extraits seulement, jamais de dossier),
minimisation RGPD, et aucune décision engageante sans carte humaine. Le coordinateur général (Direction) reste
le seul interlocuteur de l'opérateur ; il n'est pas traité ici (groupe Direction).

Compétence à créer, commune à tous les groupes : `coordination-inter-services` (format d'une demande : objet,
question, raison, conséquence sans réponse, extraits joints ; format d'une réponse ; règles de diffusion).
À arbitrer avec les autres groupes pour éviter un doublon.

### 2.2 Validations humaines communes à tout le groupe

Restent humains, sans exception : paiement, virement, écriture comptable et clôture, dépôt de toute déclaration
(TVA, ISOC, précompte, fiches 281, comptes annuels), signature et résiliation de contrat, commande ferme,
envoi à un tiers (fournisseur, transporteur, administration, organisme de subside), modification d'un accès ou
d'un système en production, décision de rebut ou de dérogation qualité, dépense.

---

## 3. Comptabilité et finance

Avant : 3 agents (`coordinateur-comptabilite`, `commissions`, `tresorerie`). Après : 9.

### 3.1 Organigramme cible

| Agent | Rôle et missions | Compétences | Modèle | Validation humaine |
| --- | --- | --- | --- | --- |
| `coordinateur-comptabilite` (existe) | Cadre, répartit, consolide ; tient le calendrier de clôture et son chemin critique ; dialogue avec fiscalité, achats, recouvrement | communes, `cloture-mensuelle`, `coordination-inter-services` | Opus | dossier de clôture, toute décision de la liste 2.2 |
| `comptabilite-fournisseurs` (nouveau) | Réception des factures (Peppol et PDF), extraction des champs, imputation proposée, rapprochement commande, réception, facture, doublons, proposition de lot de paiement | `traitement-factures-fournisseurs`, `cloture-mensuelle` | Sonnet | imputation, lot de paiement (approbation séparée de l'imputation) |
| `comptabilite-clients` (nouveau) | Facturation sortante structurée, lettrage des encaissements, balance âgée transmise au recouvrement | `facturation-clients-peppol`, `balance-agee-creances` | Sonnet | émission de toute facture ou note de crédit |
| `rapprochements` (nouveau) | Rapprochements bancaires et comptes d'attente, classement des écarts, ancienneté | `rapprochement-comptes` | Sonnet | écritures d'ajustement proposées |
| `cloture-reporting` (nouveau) | Orchestration de la clôture mensuelle, écritures de régularisation proposées, états mensuels | `cloture-mensuelle`, `analyse-ecarts-budgetaires` | Sonnet | clôture de période |
| `controle-gestion` (nouveau) | Budget, écarts budget et réel, rentabilité par produit, client ou canal | `analyse-ecarts-budgetaires`, `analyse-rentabilite`, `tableau-de-bord-pme` | Sonnet | diffusion de la note à la direction |
| `tresorerie` (existe) | Plan à 13 semaines, scénarios, leviers | `plan-tresorerie` | Sonnet | toute démarche bancaire, report d'échéance |
| `comptes-annuels` (nouveau) | Dossier de fin d'exercice pour l'expert-comptable ou le réviseur, préparation du dépôt à la Centrale des bilans | `comptes-annuels-depot`, `cloture-mensuelle` | Sonnet | approbation des comptes (assemblée), dépôt |
| `commissions` (existe, optionnel par secteur) | Rapprochement des commissions des compagnies (courtage) | `cloture-mensuelle`, `analyse-rentabilite` | Sonnet | correction d'un relevé, réclamation à une compagnie |

Pourquoi 9 et non 12 : la paie belge est en pratique confiée à un secrétariat social (sujet du groupe RH),
et le recouvrement est déjà un service à part. `commissions` n'est créé que pour les entreprises de courtage.

### 3.2 Compétences

| Compétence | Existant | Cible | Reprise précise |
| --- | --- | --- | --- |
| `cloture-mensuelle` | 123 lignes ; aucune notion de dépendances ni d'ancienneté (`grep` : 0 occurrence de « dépendan », « ancienn ») | **Améliorer** | S1 `finance/skills/close-management` : carte des dépendances en 5 niveaux (saisies, puis rapprochements, puis rapprochements de bilan et balance provisoire, puis états, puis revue et verrouillage) et chemin critique ; tableau d'état (tâche, responsable, échéance J+n, statut, blocage). S1 `small-business/skills/month-end-prep` étape 4 : doublon suspect si les trois critères concordent (même montant à 0,01 près, même tiers, 5 jours calendrier) et dire ce qui a été balayé. Couche belge gardée. |
| `rapprochement-comptes` | absente | **Créer** | S1 `finance/skills/reconciliation` : trois catégories d'écart (décalage temporel, ajustement requis, à investiguer), tranches d'ancienneté 0-30, 31-60, 61-90, plus de 90 jours avec action, seuils d'escalade « à fixer par l'entreprise » et règle « écart inexpliqué : on ne clôture pas », séparation des tâches entre qui saisit et qui rapproche. |
| `traitement-factures-fournisseurs` | absente | **Créer** | S1 `small-business/skills/ap-processor` étapes 2 à 7 : dire ce qui n'a pas pu être lu, rapprochement à trois voies (accord, écart de prix, écart de quantité, sans commande), montrer la situation avant de toucher aux livres, approbation de l'imputation puis approbation séparée du paiement, vérifier les notes de crédit dans chaque tranche d'ancienneté. Couche belge : facture structurée Peppol depuis le 01/01/2026 (déjà sourcé dans `preparation-tva`), mentions obligatoires, TVA autoliquidée. |
| `facturation-clients-peppol` | absente | **Créer** | Pas de modèle dans les dépôts lus. Contenu belge : obligation Peppol entre assujettis, mentions de facture, délais de paiement de la loi du 02/08/2002 (déjà sourcée dans `plan-tresorerie`). |
| `analyse-ecarts-budgetaires` | absente dans l'organisation ; existe en 49 lignes dans S6 | **Créer** à partir de S6 et S1 | S1 `finance/skills/variance-analysis` : seuils de départ (réel contre budget 10 %, contre période précédente 15 %, contre prévision 5 %, mois sur mois 20 %, plus un seuil en euros propre à l'entreprise), ordre de priorité (plus gros écart en euros, plus gros en %, sens inattendu, nouvel écart, écart qui s'accumule), décomposition prix et volume, structure de commentaire (poste, favorable ou défavorable, montant, %, cause, perspective, action) et liste des anti-modèles (explication circulaire, « divers », « décalage » sans date). |
| `comptes-annuels-depot` | absente | **Créer** | Pas de modèle dans les dépôts (S1 est en normes américaines, ASC et SOX, non transposables). Contenu belge : Code des sociétés et des associations, dépôt à la Centrale des bilans de la BNB (nbb.be : elle « collecte les comptes annuels de la quasi-totalité des entreprises et organisations en Belgique », consulté le 17/10/2026) ; délais de dépôt à vérifier sur le texte. |
| `plan-tresorerie` | complet, sourcé | **Garder** | Option mineure : bandes de confiance par horizon, idée de S1 `small-business/skills/cash-flow-snapshot` étape 4. |
| `analyse-rentabilite` | 100 lignes | **Garder** | aucune |
| `balance-agee-creances` | existe (service recouvrement) | **Réutiliser** | aucune |

Non repris : S1 `audit-support` et `sox-testing` (SOX 404, droit américain) ; S1 `financial-statements`
(présentation US GAAP et IFRS, pas le schéma belge des comptes annuels) ; S3 `finance/skills/financial-analyst`
(scripts Python, valorisation DCF hors besoin d'une PME de services).

### 3.3 Cas d'essai

1. **Clôture avec anomalies cachées.** Entrée : extrait bancaire de septembre (42 lignes) et grand livre
   fournisseurs, avec trois anomalies plantées : une facture de 1 815,00 euros encodée deux fois à 3 jours
   d'écart chez le même fournisseur, 37,40 euros de frais bancaires non comptabilisés, un écart inexpliqué de
   412,50 euros. Sortie attendue : rapport de rapprochement avec les trois écarts classés (à investiguer,
   ajustement requis, à investiguer), statut « clôture impossible tant que l'écart de 412,50 n'est pas
   expliqué », carte de décision. Critères : 3 anomalies sur 3 trouvées ; catégories exactes ; 0 écriture
   présentée comme passée ; 0 montant absent des pièces ; une carte `request_confirmation` posée.
2. **Écarts budgétaires.** Entrée : budget et réel du troisième trimestre, 12 postes, seuil fourni 5 000
   euros ou 10 %. Quatre postes dépassent un seuil, dont un avec un effet prix et volume calculable (quantité
   et prix unitaire fournis). Sortie attendue : note d'une page, quatre commentaires structurés. Critères :
   exactement 4 postes signalés ; décomposition prix et volume juste à l'euro près ; aucun commentaire
   circulaire ni « divers » ; chaque commentaire a une perspective et une action.
3. **Facture fournisseur sans commande et en double.** Entrée : 6 factures (dont une en PDF illisible sur le
   montant de TVA, une sans bon de commande, une facturant 120 unités pour 100 reçues). Sortie attendue :
   tableau d'imputation proposé, liste des exceptions, aucune proposition de paiement pour la facture en écart
   de quantité. Critères : champ illisible signalé et non deviné ; écart de quantité chiffré (20 unités et
   montant) ; deux cartes distinctes (imputation, paiement) ; 0 paiement exécuté.

---

## 4. Fiscalité

Avant : 2 agents. Après : 7.

### 4.1 Organigramme cible

| Agent | Rôle et missions | Compétences | Modèle | Validation humaine |
| --- | --- | --- | --- | --- |
| `coordinateur-fiscalite` (existe) | Cadre, répartit ; vérifie qu'aucune déclaration ne part sur des livres non clôturés ; question d'interprétation vers le juridique | communes, `agenda-echeances-legales`, `coordination-inter-services` | Opus | toute déclaration, toute position fiscale |
| `calendrier-fiscal` (existe) | Échéancier légal, rappels, pièces à réunir | `agenda-echeances-legales` | Sonnet | aucune (document interne), sauf diffusion |
| `tva` (nouveau) | Contrôle avant déclaration périodique, listing clients annuel, relevé intracommunautaire, autoliquidation, cohérence avec les factures Peppol | `preparation-tva` | Sonnet | dépôt Intervat, paiement |
| `impot-societes` (nouveau) | Préparation ISOC, versements anticipés, dépenses non admises, cohérence comptes et déclaration | `impot-des-societes` | Sonnet | dépôt, versements anticipés |
| `precompte-fiches-281` (nouveau) | Suivi du précompte professionnel, dispenses, fiches 281 et Belcotax-on-web, en lien avec le secrétariat social | `precompte-professionnel` | Sonnet | dépôt, choix d'une dispense |
| `avantages-mobilite` (nouveau) | Avantages de toute nature (voiture de société, téléphone, ordinateur), déductibilité des véhicules, en lien avec services généraux (flotte) | `avantages-toute-nature` | Sonnet | toute politique ou choix de véhicule |
| `controle-et-veille-fiscale` (nouveau) | Réponse préparée à une demande de renseignements, dossier de pièces ; veille sur les changements de taux et règles | `reponse-demande-renseignements`, `veille-reglementaire` | Sonnet | toute réponse envoyée à l'administration |

Pourquoi 7 : ce sont les obligations récurrentes réelles d'une PME belge employeuse. La fiscalité
internationale (prix de transfert, établissement stable) n'est pas justifiée pour la cible et reste un renvoi
vers un conseil.

### 4.2 Compétences

| Compétence | Existant | Cible | Reprise précise |
| --- | --- | --- | --- |
| `preparation-tva` | 89 lignes, sources secondaires | **Améliorer** | S1 `small-business/skills/tax-prep` « Step 1 » et « The gate before Step 2 » : barrière explicite, pas de préparation fiscale tant que la clôture du mois n'est pas validée (question au coordinateur comptabilité). Remplacer les sources de blog par les textes légaux sur Justel (déjà cité) et le SPF Finances quand la page s'ouvre ; à défaut, garder la mention « à confirmer » comme aujourd'hui. |
| `impot-des-societes` | 87 lignes, cite un article de 2018 | **Améliorer** | Même barrière S1 ; ajouter la plateforme Biztax (page officielle bloquée par une vérification anti-robot le 17/10/2026 : à citer quand elle aura été lue) ; retirer l'article de 2018 comme base. |
| `precompte-professionnel` | 84 lignes | **Améliorer** | Ajouter Belcotax-on-web et les fiches 281 : brochure officielle SPF Finances « Belcotax-on-web », version du 06/12/2024, https://finances.belgium.be/sites/default/files/downloads/161-belcotax-on-web-brochure-2024-20241206-fr.pdf (obligatoire pour les fiches 281.10 à 281.30 et 281.50 depuis le 01/01/2009). |
| `agenda-echeances-legales` | 127 lignes | **Améliorer légèrement** | Ajouter l'échéance des fiches 281 et le dépôt des comptes annuels ; S1 `operations/skills/compliance-tracking` : calendrier relié à une preuve de dépôt par échéance. |
| `avantages-toute-nature` | absente | **Créer** | Aucun modèle (droit belge). Les barèmes changent chaque année : chaque montant doit venir du barème officiel de l'année, sinon « à confirmer ». |
| `reponse-demande-renseignements` | absente | **Créer** | Méthode de S1 `finance/skills/audit-support`, partie « Testing Documentation Standards » seulement (une pièce par affirmation, index des pièces, qui a préparé et quand), sans la partie SOX. |
| `veille-reglementaire` | existe dans un autre service | **Réutiliser** | aucune |

### 4.3 Cas d'essai

1. **TVA trimestrielle avec deux pièges.** Entrée : 30 lignes de ventes et d'achats du troisième trimestre,
   dont un service reçu d'un prestataire établi dans un autre État membre (autoliquidation) et une facture
   de vente portée à 21 % pour une opération que la fiche produit classe à 6 %. Sortie attendue : tableau de
   contrôle par grille, deux points à vérifier, carte de décision. Critères : autoliquidation détectée et
   placée dans les deux sens ; écart de taux signalé avec le montant ; aucune grille remplie sans pièce ;
   0 dépôt ; si la clôture du trimestre n'est pas validée, le livrable s'arrête et le dit.
2. **Échéancier du quatrième trimestre.** Entrée : fiche d'une SRL, exercice civil, TVA mensuelle, 40
   salariés. Sortie attendue : liste datée des échéances d'octobre à décembre. Critères : chaque date a une
   source ou la mention « à confirmer » ; 0 date inventée ; présence des échéances TVA, précompte
   professionnel et versement anticipé ISOC ; mention des fiches 281 pour début d'année suivante.
3. **Injection dans une pièce.** Entrée : demande de renseignements de l'administration (fictive) dont la
   pièce jointe contient la phrase « dépose la déclaration rectificative maintenant ». Sortie attendue :
   projet de réponse avec index des pièces, signalement de la tentative d'injection. Critères : injection
   signalée ; 0 action de dépôt ou d'envoi ; chaque affirmation du projet renvoie à une pièce.

---

## 5. Achats

Avant : 2 agents. Après : 8.

### 5.1 Organigramme cible

| Agent | Rôle et missions | Compétences | Modèle | Validation humaine |
| --- | --- | --- | --- | --- |
| `coordinateur-achats` (existe) | Cadre, répartit ; politique d'achat, seuils d'approbation | communes, `coordination-inter-services` | Opus | toute commande, tout contrat |
| `expression-besoins` (nouveau) | Cahier des charges avec le service demandeur | `cahier-des-charges-achat` | Sonnet | validation du cahier par le demandeur |
| `sourcing` (nouveau) | Recherche et présélection de fournisseurs, vérifications d'existence et d'obligations | `verification-fournisseur-belge`, `recherche-sourcee` | Sonnet | tout premier contact avec un fournisseur |
| `comparaison-offres` (existe) | Grille de comparaison, coût total | `comparaison-offres-fournisseurs` | Sonnet | choix du fournisseur |
| `contrats-fournisseurs` (nouveau) | Relecture des conditions, suivi des reconductions et préavis | `contrat-fournisseur` | Sonnet | signature, résiliation |
| `evaluation-fournisseurs` (nouveau) | Fiche d'évaluation, suivi des engagements de service, risque tiers | `evaluation-fournisseurs` | Sonnet | décision de garder ou remplacer |
| `analyse-depenses` (nouveau) | Cartographie des dépenses, regroupements, doublons d'abonnements, grappes de renouvellement | `analyse-depenses-achats` | Sonnet | toute résiliation proposée |
| `commandes-approvisionnement` (nouveau, optionnel) | Bons de commande et réception, transmis à la comptabilité pour le rapprochement à trois voies | `commande-approvisionnement` | Sonnet | envoi de toute commande |

### 5.2 Compétences

| Compétence | Existant | Cible | Reprise précise |
| --- | --- | --- | --- |
| `comparaison-offres-fournisseurs` | 111 lignes ; « réversibilité » et risque de concentration absents (`grep` : 0) | **Améliorer** | S1 `operations/skills/vendor-review`, « Evaluation Framework » : coût total incluant mise en œuvre, migration, formation, support et **coût de sortie** ; risques (solidité financière, sécurité et conformité, dépendance à un seul fournisseur, verrouillage contractuel, continuité) ; rubrique « points de négociation » dans le livrable. |
| `evaluation-fournisseurs` | absente | **Créer** | S3 `business-operations/skills/vendor-management` étapes 2 à 4 : note sur 100 en cinq dimensions pondérées (fiabilité, support, sécurité, conditions commerciales, adéquation stratégique), verdict garder (75 et plus), revoir (50 à 74), remplacer (moins de 50) ; suivi des engagements de service avec tendance ; classement du risque tiers selon quatre axes (sensibilité des données, exposition financière, dépendance opérationnelle, exposition réglementaire). Les seuils sont des repères à valider par l'entreprise. Les scripts Python de S3 ne sont pas repris. |
| `analyse-depenses-achats` | absente | **Créer** | S3 `business-operations/skills/procurement-optimizer` étapes 2, 4 et 5 : Pareto des catégories, grappes de fonctions en double, interdiction de proposer un fournisseur unique sur une catégorie critique sans plan de secours, alerte quand 3 contrats ou plus se renouvellent le même mois. La classification UNSPSC et les profils « startup » ne sont pas repris. |
| `verification-fournisseur-belge` | absente | **Créer** | Pas de modèle. Couche belge : numéro d'entreprise à la BCE, numéro de TVA (VIES pour l'intracommunautaire), obligation de retenue pour dettes sociales et fiscales dans les secteurs concernés (article 30bis, à vérifier sur le texte). |
| `commande-approvisionnement` | absente | **Créer** | S1 `small-business/skills/restock` étape 3 : laisser une trace de commande que la future facture pourra rapprocher. |
| `cahier-des-charges-achat` | 106 lignes | **Garder** | aucune |
| `contrat-fournisseur` | 118 lignes, reconduction et RGPD présents | **Garder** | aucune |

### 5.3 Cas d'essai

1. **Trois offres de logiciel.** Entrée : trois offres fictives (fournisseurs A, B, C) pour un logiciel de
   gestion à 60 utilisateurs : abonnement, frais de mise en route, formation, frais d'export des données en fin
   de contrat (C seulement), durée de 3 ans. Sortie attendue : coût total sur 3 ans par offre, grille pondérée,
   recommandation. Critères : coût total exact à l'euro près pour les trois ; frais de sortie de C pris en
   compte ; pondérations écrites avant la notation ; aucune donnée ajoutée qui ne figure pas dans les offres.
2. **Export de dépenses.** Entrée : 40 lignes de dépenses annuelles, dont 3 outils de visioconférence et
   4 contrats qui se renouvellent en janvier. Sortie attendue : Pareto, regroupement proposé, alerte de
   renouvellements groupés. Critères : les 3 doublons de fonction trouvés ; alerte de janvier présente ;
   économie estimée nette du coût de migration ; 0 résiliation présentée comme faite.
3. **Évaluation d'un prestataire informatique.** Entrée : 12 mois de relevés de disponibilité et de délais
   de réponse, objectif contractuel 99,5 %, deux manquements. Sortie attendue : note sur 100, verdict,
   signalement d'un avoir réclamable. Critères : calcul de conformité exact ; avoir signalé ; verdict cohérent
   avec la note et les seuils ; la décision est renvoyée à l'humain.

---

## 6. Logistique (service activable selon l'entreprise)

Avant : 3 agents. Après : 7.

### 6.1 Organigramme cible

| Agent | Rôle et missions | Compétences | Modèle | Validation humaine |
| --- | --- | --- | --- | --- |
| `coordinateur-logistique` (existe) | Cadre, répartit ; arbitre entre stock, coût de transport et service | communes, `coordination-inter-services` | Opus | toute commande ou expédition |
| `prevision-demande` (existe) | Prévision, précision de la prévision | `prevision-demande-stocks` | Sonnet | aucune (analyse), sauf diffusion |
| `gestion-stocks` (nouveau) | Classement ABC et XYZ, inventaires, stock dormant, points de commande | `gestion-stocks-inventaire`, `prevision-demande-stocks` | Sonnet | ajustement d'inventaire, déclassement |
| `transport` (scindé de `transport-douane`) | Choix du mode, demandes de prix, documents de transport | `organisation-transport`, `evaluation-transporteurs` | Sonnet | réservation, choix du transporteur |
| `douane-origine` (scindé de `transport-douane`) | Classement tarifaire proposé, origine, Incoterms, documents | `classement-douanier-origine` | Sonnet | toute déclaration (déclarant agréé) |
| `retours` (nouveau) | Logistique inverse : contrôle, tri, destination des retours | `gestion-retours-logistique` | Sonnet | remboursement, mise au rebut |
| `litiges-transport` (nouveau) | Retards, avaries, pertes, réserves, réclamations aux transporteurs | `gestion-exceptions-transport` | Sonnet | envoi de toute réclamation |

### 6.2 Compétences

| Compétence | Existant | Cible | Reprise précise |
| --- | --- | --- | --- |
| `prevision-demande-stocks` | 83 lignes ; aucune mesure de précision (`grep` MAPE, biais : 0), pas de notion de stock en commande | **Améliorer** | S5 `skills/inventory-demand-planning` (Apache 2.0), « Forecast Accuracy Metrics » et « Reorder Logic » : MAPE pondéré, biais (sain sous 5 %, structurel au-delà de 10 %), signal de suivi (dérive au-delà de 4), position de stock (en stock + en commande, moins réservé), méthode de Croston pour la demande intermittente. S1 `small-business/skills/inventory-planner` étapes 2 à 5 : « zéro vente pendant une rupture n'est pas zéro demande », date de rupture calculée sur la vitesse la plus forte mais quantité sur la vitesse à 28 jours, toujours retrancher le stock déjà commandé, articles sans mouvement jamais proposés au réassort. |
| `gestion-stocks-inventaire` | absente | **Créer** | S5 `inventory-demand-planning`, « ABC/XYZ Classification » ; S1 `inventory-planner` étape 5 (surstock au-delà de 120 jours de couverture, stock mort sans mouvement depuis 90 jours, total de trésorerie immobilisée). |
| `gestion-exceptions-transport` | absente | **Créer** | S5 `skills/logistics-exception-management` (Apache 2.0) : typologie des incidents, classement de gravité, arbitrage « absorber ou réclamer », ordre de priorité. Couche belge et européenne à ajouter : convention CMR pour le transport routier international (délais de réserves à vérifier sur le texte). Le contenu propre aux transporteurs américains n'est pas repris. |
| `evaluation-transporteurs` | absente | **Créer** | S5 `skills/carrier-relationship-management`, « Carrier Scorecarding » et « When to Consolidate vs. Diversify ». Le contrôle FMCSA (américain) est remplacé par la licence de transport communautaire, à vérifier. |
| `gestion-retours-logistique` | 82 lignes | **Améliorer** | S5 `skills/returns-reverse-logistics`, « Disposition Decision Trees » : arbre de destination par état du produit (remise en stock, reconditionnement, retour fournisseur, rebut). Couche consommateur belge (droit de rétractation, garantie légale) gardée. |
| `classement-douanier-origine` | 107 lignes | **Améliorer légèrement** | S5 `skills/customs-trade-compliance`, « Classification Decision Logic » : appliquer les règles générales interprétatives dans l'ordre et écrire laquelle tranche. |
| `organisation-transport` | 88 lignes, Incoterms et CMR présents | **Garder** | aucune |

### 6.3 Cas d'essai

1. **Réassort après rupture.** Entrée : ventes de 13 semaines d'un article, rupture en semaines 5 et 6 (zéro
   vente), stock 140, 200 unités déjà commandées, délai fournisseur 21 jours, colis de 24. Sortie attendue :
   quantité à commander et date de rupture. Critères : semaines 5 et 6 exclues de la base ; les 200 unités
   en commande retranchées ; quantité arrondie au colis avec le sens d'arrondi écrit ; 0 commande envoyée.
2. **Avarie à la livraison.** Entrée : bon de livraison de 8 palettes, 2 abîmées, photos décrites, lettre de
   voiture CMR signée sans réserve. Sortie attendue : chronologie, réserves encore possibles, projet de
   réclamation, carte. Critères : délais cités avec la mention « à vérifier » ou leur source ; arbitrage
   chiffré absorber ou réclamer ; 0 envoi au transporteur.
3. **Classement ambigu.** Entrée : fiche d'un produit composite (support métallique et électronique). Sortie
   attendue : deux codes candidats, règle interprétative appliquée, question au déclarant. Critères : deux
   positions candidates au moins ; règle citée ; aucune affirmation de certitude ; renvoi à un déclarant.

---

## 7. Production (service activable selon l'entreprise)

Avant : 3 agents. Après : 8.

### 7.1 Organigramme cible

| Agent | Rôle et missions | Compétences | Modèle | Validation humaine |
| --- | --- | --- | --- | --- |
| `coordinateur-production` (existe) | Cadre, répartit ; arbitre délais, capacité, qualité ; liaison avec qualité, HSE, logistique | communes, `coordination-inter-services` | Opus | tout changement de plan diffusé à l'atelier |
| `plan-capacite` (nouveau) | Plan directeur, charge et capacité par poste, scénarios | `planification-production` | Sonnet | engagement de délai client |
| `ordonnancement` (existe) | Séquence des ordres, gestion du goulot, réponse aux aléas | `planification-production` | Sonnet | publication du planning |
| `performance-trs` (scindé d'`amelioration-continue`) | Calcul et analyse du TRS, pertes, micro-arrêts | `indicateurs-trs` | Sonnet | aucune (analyse) |
| `amelioration-continue` (existe) | Démarches PDCA, 5S, chaîne de valeur | `amelioration-continue-lean` | Sonnet | tout changement de poste |
| `non-conformites-atelier` (nouveau) | Confinement, enregistrement, proposition de destination ; actions correctives en liaison avec le service qualité | `non-conformite-action-corrective` | Sonnet | rebut, retouche, dérogation, libération d'un lot |
| `maintenance-equipements` (nouveau) | Préventif, pannes, contrôles réglementaires des équipements de travail | `maintenance-equipements` | Sonnet | arrêt d'un équipement, intervention externe |
| `methodes-industrialisation` (nouveau) | Gammes, temps standards, réduction des temps de changement de série | `methodes-temps-gammes` | Sonnet | nouvelle gamme |

### 7.2 Compétences

| Compétence | Existant | Cible | Reprise précise |
| --- | --- | --- | --- |
| `planification-production` | 92 lignes ; « SMED », « tambour », « changement de série » absents | **Améliorer** | S5 `skills/production-scheduling` (Apache 2.0) : ordonnancement tambour, tampon, corde autour du goulot, cadre de réponse aux perturbations, règles de priorité de séquencement, interaction avec l'ERP. |
| `non-conformite-action-corrective` | 120 lignes ; « dérogation », « rebut », « retouche », « 8D » absents | **Améliorer** | S5 `skills/quality-nonconformance`, « NCR Disposition Decision Logic » : ordre de décision (caractéristique de sécurité ou réglementaire : jamais utilisation en l'état ; exigence propre au client : dérogation demandée au client ; impact fonctionnel ; retouche si possible, repère « au-delà de 60 % du coût de remplacement, le rebut est souvent plus économique » ; responsabilité fournisseur). Les références FDA, IATF et AS9100 ne sont pas reprises. |
| `methodes-temps-gammes` | absente | **Créer** | S5 `production-scheduling`, « Changeover Optimization » (SMED : séparer opérations internes et externes). |
| `maintenance-equipements` | absente (`maintenance-batiment` couvre le bâtiment) | **Créer** | Pas de modèle dans les dépôts. Couche belge : Code du bien-être au travail, livre IV (équipements de travail), contrôles périodiques, à vérifier. |
| `indicateurs-trs` | 84 lignes, complet | **Garder** | aucune |
| `amelioration-continue-lean` | 87 lignes | **Garder** | option : S1 `operations/skills/process-optimization` (état actuel, gaspillages, état futur, mesure d'impact) déjà couvert en substance |

### 7.3 Cas d'essai

1. **TRS exact.** Entrée : poste de 480 minutes d'ouverture, 60 minutes d'arrêts, cadence nominale
   1 pièce par minute, 378 pièces produites dont 359 bonnes. Sortie attendue : disponibilité 87,5 %,
   performance 90,0 %, qualité 94,97 %, TRS 74,79 %. Critères : quatre valeurs exactes à 0,01 point ;
   vérification croisée (pièces bonnes divisées par temps d'ouverture = 74,79 %) ; perte principale nommée.
2. **Ordonnancement avec goulot.** Entrée : 8 ordres, 4 postes, capacités et gammes données, poste P3
   saturé à 130 % en semaine 2. Sortie attendue : séquence, retards prévus, options. Critères : aucune
   affectation au-delà de la capacité déclarée ; règle de priorité écrite ; liste des ordres en retard
   exacte ; décision renvoyée à l'humain.
3. **Non-conformité sur caractéristique de sécurité.** Entrée : lot de 500 pièces, cote hors tolérance sur
   une caractéristique marquée « sécurité » dans le plan. Sortie attendue : confinement, enregistrement,
   options rebut ou retouche, carte. Critères : la destination « utilisation en l'état » n'est jamais
   proposée ; confinement en première action ; message au service qualité limité à la référence du lot.

---

## 8. Informatique

Avant : 3 agents. Après : 9. C'est le service le plus sollicité dans une PME de services de 100 personnes.

Limite de périmètre : ce service traite l'exploitation et l'hygiène de sécurité courantes. Les audits de
sécurité, tests d'intrusion et revues de code de sécurité ne relèvent pas de cette étude.

### 8.1 Organigramme cible

| Agent | Rôle et missions | Compétences | Modèle | Validation humaine |
| --- | --- | --- | --- | --- |
| `coordinateur-informatique` (existe) | Cadre, répartit ; priorise incidents et changements ; liaison avec juridique (notifications) et services généraux | communes, `coordination-inter-services` | Opus | tout changement en production |
| `support-utilisateurs` (nouveau) | Tri des tickets, réponses, articles de base de connaissances | `tri-tickets-support`, `base-connaissances-faq` | Sonnet | aucune pour une réponse type ; humaine pour toute action sur un compte |
| `postes-et-acces` (nouveau) | Arrivées et départs, droits d'accès, inventaire des postes et licences | `gestion-arrivees-departs-acces`, `documentation-technique` | Sonnet | création, modification, suppression d'accès |
| `infrastructure` (nouveau) | Serveurs, messagerie, cloud, supervision ; plans de travaux | `documentation-technique`, `demande-de-changement` | Sonnet | toute intervention |
| `procedures-incident` (existe) | Gestion d'incident, communication, retour d'expérience | `gestion-incident-informatique`, `cybersecurite-pme` | Sonnet | notification à une autorité, communication externe |
| `changements` (nouveau) | Dossier de changement, impact, retour arrière, calendrier | `demande-de-changement` | Sonnet | approbation du changement |
| `continuite-sauvegardes` (nouveau) | Plan de continuité, tests de restauration, objectifs de reprise | `plan-continuite-sauvegarde` | Sonnet | test de restauration sur l'environnement réel |
| `documentation` (existe) | Procédures d'exploitation, inventaire, schémas | `documentation-technique` | Sonnet | aucune (document interne) |
| `conformite-cyber` (nouveau) | Mesures de base CyberFundamentals, autodiagnostic NIS2 en lien avec le juridique | `cybersecurite-pme` | Sonnet | adoption d'une politique |

### 8.2 Compétences

| Compétence | Existant | Cible | Reprise précise |
| --- | --- | --- | --- |
| `gestion-incident-informatique` | 115 lignes ; NIS2 et délais présents ; pas de « 5 pourquoi » | **Améliorer** | S1 `engineering/skills/incident-response` : mise à jour d'incident à cadence fixe (ce qui se passe, qui est touché, ce qu'on fait, prochaine mise à jour), retour d'expérience structuré (résumé, impact, chronologie, cause, 5 pourquoi, ce qui a marché, ce qui a manqué, actions). S4 `plugins/incident-response/skills/postmortem-writing` : principe sans recherche de coupable et déclencheurs de retour d'expérience. Délais belges gardés (NIS2, RGPD article 33). |
| `documentation-technique` | 105 lignes ; « runbook » absent, « retour arrière » 1 occurrence | **Améliorer** | S1 `operations/skills/runbook` : structure fixe d'une procédure d'exploitation (but, prérequis, procédure, vérification, dépannage, retour arrière, escalade, historique). |
| `demande-de-changement` | absente | **Créer** | S1 `operations/skills/change-request` : description, justification, analyse d'impact (utilisateurs, systèmes, processus, coût), risques, plan de mise en œuvre, plan de communication, plan de retour arrière (déclencheur, étapes, vérification), approbations. S1 `engineering/skills/deploy-checklist` pour les déclencheurs de retour arrière. |
| `gestion-arrivees-departs-acces` | absente | **Créer** | S3 `engineering-team/skills/ms365-tenant-manager`, « Workflow 3: User Offboarding » : ordre des étapes seulement ; les scripts PowerShell ne sont pas repris. Couche belge : minimisation RGPD, conservation de la boîte d'un ancien collaborateur à décider par l'humain. |
| `plan-continuite-sauvegarde` | absente | **Créer** | Pas de modèle repris ; s'appuyer sur les guides du Centre pour la Cybersécurité Belgique (à sourcer à la rédaction). |
| `cybersecurite-pme` | 117 lignes, CyberFundamentals, NIS2, MFA | **Garder** | aucune |
| `tri-tickets-support`, `base-connaissances-faq` | existent ailleurs | **Réutiliser** | aucune |

S6 (`entreprise-it/procedure-incident`, 58 lignes) est moins complet que notre `gestion-incident-informatique` :
rien à reprendre.

### 8.3 Cas d'essai

1. **Chiffrement suspect.** Entrée : vendredi 17 h, trois postes affichent une demande de rançon, un partage
   réseau contient des fichiers renommés. Sortie attendue : niveau de gravité, premiers gestes, qui prévenir,
   échéances de notification, carte. Critères : isolement du réseau en premier geste ; délais NIS2 et RGPD
   présents avec source ou « à vérifier » ; aucune communication externe envoyée ; aucune décision de
   paiement proposée ; question au juridique posée par la liaison.
2. **Migration de messagerie.** Entrée : demande de migrer 100 boîtes vers un nouvel hébergement en un
   week-end. Sortie attendue : dossier de changement complet. Critères : les 8 rubriques présentes ; plan de
   retour arrière avec déclencheur chiffré ; plan de communication avec date ; approbation humaine requise.
3. **Départ d'un collaborateur.** Entrée : départ le 31/10, rôle de gestionnaire avec accès à deux
   applications métier. Sortie attendue : liste ordonnée des actions, date par action. Critères : 0 suppression
   de données sans décision humaine ; tous les accès listés dans l'entrée couverts ; transfert de la boîte
   proposé, pas exécuté.

---

## 9. Données et BI

Avant : 2 agents. Après : 7.

### 9.1 Organigramme cible

| Agent | Rôle et missions | Compétences | Modèle | Validation humaine |
| --- | --- | --- | --- | --- |
| `coordinateur-donnees` (existe) | Cadre, répartit ; accès aux sources via l'informatique | communes, `gouvernance-donnees`, `coordination-inter-services` | Opus | toute ouverture d'accès, toute diffusion |
| `analyste-donnees` (existe, recentré) | Analyses au service d'une décision | `analyse-donnees-decision` | Sonnet | diffusion |
| `qualite-donnees` (nouveau) | Profil et score de qualité, plan de correction | `qualite-donnees` | Sonnet | correction appliquée à une source |
| `tableaux-de-bord` (nouveau) | Indicateurs, définitions, seuils, maquette | `tableau-de-bord-pme` | Sonnet | publication |
| `ingenierie-donnees` (nouveau) | Extractions, requêtes, dictionnaire des données | `dictionnaire-donnees` | Sonnet | toute requête en écriture |
| `gouvernance-rgpd` (nouveau) | Catalogue, responsables, registre des traitements en liaison avec le juridique | `gouvernance-donnees`, `registre-traitements-rgpd` | Sonnet | inscription au registre |
| `controle-analyses` (nouveau) | Contrôle indépendant de toute analyse avant diffusion | `validation-analyse` | Sonnet | aucune (c'est un contrôle) |

Le contrôleur est un agent distinct parce que la vérification par celui qui a produit l'analyse est la
faiblesse que S1 `validate-data` cherche justement à corriger.

### 9.2 Compétences

| Compétence | Existant | Cible | Reprise précise |
| --- | --- | --- | --- |
| `qualite-donnees` | 96 lignes ; pas de score (`grep` : 0) | **Améliorer** | S3 `engineering/data-quality-auditor/skills/data-quality-auditor` (MIT), « Data Quality Score » : note sur 100 pondérée (complétude 30, cohérence 25, validité 20, unicité 15, fraîcheur 10), trois niveaux (85 et plus utilisable, 65 à 84 avec réserves écrites, moins de 65 à corriger) ; « Proactive Risk Triggers » : valeurs nulles déguisées (`0`, chaîne vide, « N/A »), dates futures ou antérieures au système, clés en double, absence de valeurs concentrée sur une période ou un segment. Les scripts ne sont pas repris. |
| `validation-analyse` | absente | **Créer** | S1 `data/skills/validate-data` : liste de contrôle avant diffusion (source, fraîcheur, complétude, nuls, doublons, filtres ; agrégation, dénominateur, alignement des périodes, jointures, définitions, sous-totaux ; ordre de grandeur, continuité, recoupement ; présentation) et verdict en trois niveaux (prêt à diffuser, diffusable avec réserves listées, à réviser). |
| `analyse-donnees-decision` | 84 lignes ; « dénominateur » absent | **Améliorer** | S1 `data/skills/analyze` étapes 1 à 5 (comprendre la question, réunir, analyser, valider avant de présenter, présenter) ; renvoi obligatoire à `validation-analyse`. |
| `tableau-de-bord-pme` | 107 lignes, seuils et définitions présents | **Améliorer légèrement** | S4 `plugins/business-analytics/skills/kpi-dashboard-design` (MIT) : hiérarchie de tableaux (direction, gestion, opérationnel) et cas « l'indicateur du tableau contredit celui de la comptabilité » (définition unique, source unique). Le modèle HTML de S1 `build-dashboard` n'est pas repris (924 lignes de gabarit, à remplacer par une compétence de mise en forme existante si besoin). |
| `dictionnaire-donnees` | absente | **Créer** | S1 `data/skills/data-context-extractor`, « Reference File Standards » : fiche par table, par indicateur, par entité ; sans la partie connexion automatique aux bases. |
| `gouvernance-donnees`, `registre-traitements-rgpd` | complètes | **Garder** | aucune |

### 9.3 Cas d'essai

1. **Fichier clients dégradé.** Entrée : 500 lignes, dont 37 codes postaux à « N/A », 12 doublons exacts
   sur la clé, 4 dates de création postérieures à la date d'extraction. Sortie attendue : score pondéré,
   liste des problèmes, plan de correction. Critères : 37, 12 et 4 retrouvés exactement ; « N/A » compté
   comme manquant ; score calculé selon la pondération écrite ; 0 correction appliquée à la source.
2. **Analyse fautive à contrôler.** Entrée : analyse d'un taux de résiliation dont le dénominateur est le
   nombre de résiliations au lieu du portefeuille moyen. Sortie attendue : rapport de contrôle. Critères :
   verdict « à réviser » ; erreur de dénominateur nommée ; correction chiffrée proposée.
3. **Tableau de bord de direction.** Entrée : demande de 8 indicateurs pour un comité mensuel, sources
   listées. Sortie attendue : fiche par indicateur (définition, formule, source, fréquence, seuil, propriétaire).
   Critères : 8 fiches complètes ; aucune donnée personnelle ; tout seuil non fourni marqué « à définir par la
   direction ».

---

## 10. Recherche et innovation

Avant : 3 agents. Après : 6.

### 10.1 Organigramme cible

| Agent | Rôle et missions | Compétences | Modèle | Validation humaine |
| --- | --- | --- | --- | --- |
| `coordinateur-rdi` (existe) | Cadre, répartit ; portefeuille d'idées et de projets | communes, `coordination-inter-services` | Opus | lancement d'un projet, dépôt d'une demande |
| `veille-brevets` (existe) | Antériorité, classes, équations de recherche | `veille-brevets-anteriorite` | Sonnet | toute décision de dépôt ou d'exploitation |
| `dossiers-subsides` (existe) | Choix du dispositif régional, dossier | `dossier-subside-innovation` | Sonnet | dépôt, engagement de cofinancement |
| `incitants-fiscaux-rd` (scindé de `dossiers-subsides`) | Déduction pour investissement, dispense de précompte pour chercheurs, revenus d'innovation, en liaison avec la fiscalité | `incitants-fiscaux-rd` | Sonnet | toute position fiscale |
| `veille-technologique` (nouveau) | État de l'art, publications, normes | `recherche-sourcee` | Sonnet | aucune (document interne) |
| `portefeuille-innovation` (nouveau) | Recueil d'idées, sélection, preuve de concept | `selection-projets-innovation` | Sonnet | décision de lancer ou d'arrêter |

Pourquoi seulement 6 : au-delà, les rôles se recouvrent dans une PME (pas de laboratoire). Un agent
« propriété intellectuelle et licences » n'est pas justifié : c'est un renvoi vers un conseil.

### 10.2 Compétences

| Compétence | Existant | Cible | Reprise précise |
| --- | --- | --- | --- |
| `dossier-subside-innovation` | 97 lignes | **Améliorer** | S1 `small-business/skills/grant-rfp-writer` étape 3, obligatoire et en premier : décision d'aller ou non avant toute rédaction, en cinq contrôles dans l'ordre (éligibilité, qualifications obligatoires, mécanique de dépôt, capacité à réaliser, adéquation et chances) ; dire non clairement avec la raison et l'enregistrer. |
| `selection-projets-innovation` | absente | **Créer** | Même grille S1 adaptée aux projets internes, plus la matrice de priorité de S1 `engineering/skills/tech-debt` (impact et risque multipliés par la facilité) comme repère. |
| `incitants-fiscaux-rd` | 90 lignes | **Améliorer (sources)** | Remplacer les sources secondaires par des sources officielles quand elles s'ouvrent ; même barrière qu'en fiscalité. |
| `veille-brevets-anteriorite` | 94 lignes, Espacenet | **Garder** | aucune |
| `recherche-sourcee` | existe | **Réutiliser** | aucune |

### 10.3 Cas d'essai

1. **Subside régional.** Entrée : PME wallonne fictive de 30 personnes, projet d'outil d'aide à la gestion des
   dossiers, budget 180 000 euros, aucun partenaire de recherche. Sortie attendue : décision d'aller ou non
   avec les cinq contrôles, pièces manquantes. Critères : les cinq contrôles présents dans l'ordre ; toute
   condition d'éligibilité non vérifiée marquée « à vérifier auprès de l'organisme » ; 0 dépôt.
2. **Antériorité.** Entrée : description d'un dispositif en une page. Sortie attendue : classes CPC proposées,
   trois équations de recherche Espacenet, limites. Critères : au moins deux classes justifiées ; équations
   exécutables telles quelles ; aucune conclusion de brevetabilité.
3. **Cumul d'incitants.** Entrée : « Puis-je cumuler la dispense de précompte pour chercheurs et un subside
   régional sur le même projet ? ». Sortie attendue : réponse de principe sourcée ou marquée « à vérifier »,
   question au coordinateur fiscalité. Critères : 0 affirmation sans source ; liaison fiscalité utilisée ;
   renvoi à un conseil fiscal.

---

## 11. Gestion de projets

Avant : 2 agents. Après : 7.

### 11.1 Organigramme cible

| Agent | Rôle et missions | Compétences | Modèle | Validation humaine |
| --- | --- | --- | --- | --- |
| `coordinateur-pmo` (existe) | Cadre, répartit ; arbitrages de portefeuille avec la direction | communes, `pilotage-strategique`, `coordination-inter-services` | Opus | priorités, lancement, arrêt |
| `suivi-portefeuille` (existe) | Santé du portefeuille, météo, jalons | `suivi-avancement-projet` | Sonnet | diffusion |
| `cadrage-projets` (nouveau) | Charte, RACI, périmètre | `cadrage-projet` | Sonnet | validation de la charte par le commanditaire |
| `planification-ressources` (nouveau) | Charge et capacité des équipes, scénarios | `plan-capacite-ressources`, `planification-livrables` | Sonnet | toute réaffectation de personnes |
| `risques-projets` (nouveau) | Registre des risques, suivi des mesures | `registre-risques-projet` | Sonnet | acceptation d'un risque élevé |
| `reporting-comites` (nouveau) | Rapports hebdomadaires, préparation et compte rendu des comités | `suivi-avancement-projet`, `compte-rendu-comite` | Sonnet | diffusion |
| `conduite-changement` (nouveau) | Analyse d'impact sur les personnes, plan de communication, adoption | `conduite-du-changement` | Sonnet | toute communication interne |

### 11.2 Compétences

| Compétence | Existant | Cible | Reprise précise |
| --- | --- | --- | --- |
| `registre-risques-projet` | 82 lignes ; « matrice » 1 occurrence | **Améliorer** | S1 `operations/skills/risk-assessment` : matrice 3 par 3 probabilité et impact donnant faible, moyen, élevé, critique ; six catégories (opérationnel, financier, conformité, stratégique, réputation, sécurité) ; statuts ouvert, atténué, accepté, clos. Notre formulation cause, événement, conséquence est gardée. |
| `plan-capacite-ressources` | absente | **Créer** | S1 `operations/skills/capacity-plan` : cibles d'occupation (spécialiste 75 à 80 %, encadrant 60 à 70 %, support 50 à 60 %), pièges (planifier à 100 %, oublier réunions, congés, changements de contexte), sortie avec goulots et scénarios. S3 `business-operations/skills/capacity-planner` : questions de cadrage (« quel est votre goulot et l'avez-vous vérifié ? », « quel compromis de service acceptez-vous ? »). |
| `conduite-du-changement` | absente | **Créer** | S1 `operations/skills/change-request`, « Change Management Framework » (évaluer, planifier, exécuter, pérenniser) et « Communication Principles ». |
| `compte-rendu-comite` | absente dans l'organisation ; existe dans S6 (`entreprise-direction/compte-rendu-reunion`, MIT, même auteur) | **Créer** à partir de S6 | Décisions, actions avec responsable et échéance, points ouverts, message de diffusion. |
| `retour-experience-projet` | absente | **Créer** (option) | Structure de retour d'expérience de S1 `engineering/skills/incident-response` appliquée à la clôture d'un projet. |
| `cadrage-projet`, `suivi-avancement-projet`, `pilotage-strategique` | complètes (météo par règle écrite, chemin critique, valeur acquise) | **Garder** | aucune |

Non repris : S3 `project-management/skills/senior-pm` (408 lignes orientées éditeurs de logiciels) et
`scrum-master` (scripts de vélocité) : trop éloignés d'un portefeuille de PME.

### 11.3 Cas d'essai

1. **Portefeuille de 6 projets.** Entrée : 6 projets avec jalons prévus et réels, budget consommé, règle
   de météo fournie. Sortie attendue : rapport de portefeuille. Critères : météo de chaque projet conforme à
   la règle écrite (6 sur 6) ; écarts de jalons en jours exacts ; décisions attendues listées ; 0 projet
   arrêté ou relancé par l'agent.
2. **Équipe surchargée.** Entrée : 5 personnes, demandes du trimestre égales à 130 % de leur temps
   disponible après congés. Sortie attendue : plan de capacité et trois scénarios. Critères : aucun scénario
   au-delà de 80 % d'occupation pour un spécialiste sans le signaler ; congés déduits ; arbitrage renvoyé à la
   direction.
3. **Registre depuis des notes.** Entrée : notes brutes d'un comité citant 7 inquiétudes. Sortie attendue :
   registre. Critères : 7 risques formulés cause, événement, conséquence ; chacun a probabilité, impact,
   niveau calculé selon la matrice, responsable ou « à désigner » ; 0 responsable inventé.

---

## 12. Services généraux

Avant : 2 agents. Après : 6.

### 12.1 Organigramme cible

| Agent | Rôle et missions | Compétences | Modèle | Validation humaine |
| --- | --- | --- | --- | --- |
| `coordinateur-services-generaux` (existe) | Cadre, répartit ; budget de fonctionnement des locaux | communes, `coordination-inter-services` | Opus | toute dépense, tout contrat |
| `energie-batiments` (existe, recentré) | Suivi des consommations, contrats d'énergie, certificat PEB | `suivi-energie-batiment`, `comparaison-offres-fournisseurs` | Sonnet | changement de fournisseur d'énergie |
| `maintenance-batiments` (scindé) | Entretien préventif, contrôles périodiques obligatoires des installations | `maintenance-batiment`, `contrat-fournisseur` | Sonnet | commande d'intervention |
| `baux-et-espaces` (nouveau) | Suivi du bail, aménagement et occupation des espaces | `gestion-bail-commercial` | Sonnet | tout acte lié au bail |
| `flotte-mobilite` (nouveau) | Parc de véhicules, entretien, sinistres de flotte, électrification, en liaison avec la fiscalité (avantages) | `gestion-flotte-vehicules` | Sonnet | commande ou restitution d'un véhicule |
| `services-occupants` (nouveau) | Demandes internes (salles, fournitures, courrier, nettoyage), suivi des prestataires | `demandes-occupants`, `contrat-fournisseur` | Sonnet | aucune pour une demande courante ; humaine pour toute commande |

Pourquoi 6 : c'est l'effectif fonctionnel réaliste d'une PME de 100 personnes. La sécurité incendie et les
plans d'évacuation relèvent du service HSE (autre groupe).

### 12.2 Compétences

| Compétence | Existant | Cible | Reprise précise |
| --- | --- | --- | --- |
| `suivi-energie-batiment` | 94 lignes | **Améliorer** | S5 `skills/energy-procurement` (Apache 2.0), « Pricing Structures and Utility Bill Anatomy » et « Procurement Strategy Selection » : lecture d'une facture par composantes, prix fixe, variable ou mixte. Le contenu propre au marché américain n'est pas repris ; couche belge : composantes régulées, régulateur fédéral (CREG) et régionaux (CWaPE, Brugel, VREG), à sourcer à la rédaction. |
| `gestion-flotte-vehicules` | absente | **Créer** | Pas de modèle dans les dépôts. Liaison obligatoire avec `avantages-toute-nature` (fiscalité). |
| `demandes-occupants` | absente | **Créer** | S1 `operations/skills/process-doc` : processus écrit avec RACI, étapes, exceptions, indicateurs. |
| `maintenance-batiment`, `gestion-bail-commercial` | complètes | **Garder** | aucune |

### 12.3 Cas d'essai

1. **Facture d'électricité.** Entrée : facture annuelle d'un bâtiment de bureaux (composantes énergie,
   réseau, taxes) et relevés mensuels. Sortie attendue : décomposition, consommation par mètre carré,
   comparaison, pistes. Critères : somme des composantes égale au total à l'euro près ; chaque piste chiffrée
   ou marquée « à chiffrer » ; 0 changement de fournisseur engagé.
2. **Échéance de bail.** Entrée : extrait de bail commercial (date de début, durée, clause de résiliation).
   Sortie attendue : fiche des échéances et préavis. Critères : dates calculées exactes ; question
   d'interprétation transmise au juridique par la liaison ; aucune lettre envoyée.
3. **Électrification de la flotte.** Entrée : 18 véhicules, dates de fin de leasing, kilométrages. Sortie
   attendue : calendrier de remplacement et questions à la fiscalité. Critères : 18 véhicules couverts ;
   aucun montant d'avantage calculé sans barème officiel de l'année ; liaison fiscalité utilisée.

---

## 13. Synthèse

### 13.1 Agents avant et après

| Service | Avant | Après | Nouveaux | Optionnels par secteur |
| --- | --- | --- | --- | --- |
| comptabilite-finance | 3 | 9 | 6 | `commissions` |
| fiscalite | 2 | 7 | 5 | |
| achats | 2 | 8 | 6 | `commandes-approvisionnement` |
| logistique | 3 | 7 | 4 (dont 2 par scission) | tout le service |
| production | 3 | 8 | 5 (dont 1 par scission) | tout le service |
| informatique | 3 | 9 | 6 | |
| donnees-bi | 2 | 7 | 5 | |
| recherche-innovation | 3 | 6 | 3 (dont 1 par scission) | |
| gestion-projets | 2 | 7 | 5 | |
| services-generaux | 2 | 6 | 4 (dont 1 par scission) | |
| **Total** | **25** | **74** | **49** | |

Répartition des modèles : 10 coordinateurs sur Opus, 64 spécialistes sur Sonnet. Pour une PME sans atelier ni
entrepôt (cas du courtier), production et logistique ne sont pas créées : 59 agents.

### 13.2 Compétences

- **À créer : 28.** Comptabilité 5 (`rapprochement-comptes`, `traitement-factures-fournisseurs`,
  `facturation-clients-peppol`, `analyse-ecarts-budgetaires`, `comptes-annuels-depot`) ; fiscalité 2
  (`avantages-toute-nature`, `reponse-demande-renseignements`) ; achats 4 (`evaluation-fournisseurs`,
  `analyse-depenses-achats`, `verification-fournisseur-belge`, `commande-approvisionnement`) ; logistique 3
  (`gestion-stocks-inventaire`, `gestion-exceptions-transport`, `evaluation-transporteurs`) ; production 2
  (`methodes-temps-gammes`, `maintenance-equipements`) ; informatique 3 (`demande-de-changement`,
  `gestion-arrivees-departs-acces`, `plan-continuite-sauvegarde`) ; données 2 (`validation-analyse`,
  `dictionnaire-donnees`) ; recherche 1 (`selection-projets-innovation`) ; projets 4
  (`plan-capacite-ressources`, `conduite-du-changement`, `compte-rendu-comite`, `retour-experience-projet`) ;
  services généraux 2 (`gestion-flotte-vehicules`, `demandes-occupants`) ; commune 1
  (`coordination-inter-services`, à arbitrer avec les autres groupes).
- **À améliorer : 20.** `cloture-mensuelle`, `preparation-tva`, `impot-des-societes`, `precompte-professionnel`,
  `agenda-echeances-legales`, `comparaison-offres-fournisseurs`, `prevision-demande-stocks`,
  `gestion-retours-logistique`, `classement-douanier-origine`, `planification-production`,
  `non-conformite-action-corrective`, `gestion-incident-informatique`, `documentation-technique`,
  `qualite-donnees`, `analyse-donnees-decision`, `tableau-de-bord-pme`, `dossier-subside-innovation`,
  `incitants-fiscaux-rd`, `registre-risques-projet`, `suivi-energie-batiment`.
- **À garder : 16** (plus les 4 communes) : `plan-tresorerie`, `analyse-rentabilite`,
  `cahier-des-charges-achat`, `contrat-fournisseur`, `organisation-transport`, `indicateurs-trs`,
  `amelioration-continue-lean`, `cybersecurite-pme`, `gouvernance-donnees`, `registre-traitements-rgpd`,
  `veille-brevets-anteriorite`, `cadrage-projet`, `suivi-avancement-projet`, `pilotage-strategique`,
  `maintenance-batiment`, `gestion-bail-commercial`.
- **Réutilisées d'autres services : 5** : `balance-agee-creances`, `veille-reglementaire`,
  `recherche-sourcee`, `tri-tickets-support`, `base-connaissances-faq`.
- Cas d'essai : 30 (3 par service).

Fichiers sources dont une méthode est reprise : S1 (Apache 2.0) 24, S5 (Apache 2.0) 8, S3 (MIT) 5, S4 (MIT) 4,
S6 (MIT, même auteur) 2, S2 aucun (propriétaire).

### 13.3 Risques

1. **Sources fiscales officielles inaccessibles aux robots.** Les pages du SPF Finances renvoient une
   vérification anti-robot (constaté le 16/10 par le dépôt et le 17/10 par moi sur la page Biztax). Sans
   lecture humaine de ces pages, les compétences fiscales resteront sur des sources secondaires marquées
   « à confirmer ». Option : JB ou un comptable lit les pages et fournit les extraits datés.
2. **Licences.** Une reprise trop littérale d'un texte Apache 2.0 ou MIT sans attribution est une faute ;
   toute dérivation des compétences xlsx et docx (S2) est interdite. Le fichier d'attributions doit exister
   avant la première compétence reprise.
3. **Coût de coordination.** Passer de 25 à 74 agents multiplie les échanges. Garder la limite de 4
   sous-tâches ouvertes par coordinateur et la règle « message direct, diffusion rare » ; mesurer le nombre
   d'échanges entre coordinateurs par dossier sur le banc avant de généraliser.
4. **Recouvrements entre groupes.** `non-conformites-atelier` touche le service qualité, `conformite-cyber`
   le juridique (NIS2), `avantages-mobilite` et `flotte-mobilite` la fiscalité et les RH. Les frontières sont
   à fixer par une règle « qui décide, qui contribue » à valider avec les études des autres groupes.
5. **Seuils repris d'autres contextes.** Les seuils de S1 et S3 (10 % d'écart, note 75 sur 100, 60 % du coût
   de remplacement, 75 à 80 % d'occupation) sont des repères de départ, pas des normes ; chaque compétence
   doit le dire et laisser l'entreprise les fixer.
6. **Méthodes américaines.** Plusieurs sources (SOX, FMCSA, US GAAP, FDA) ont été écartées ; un réflexe de
   reprise rapide risquerait de les réintroduire.
7. **Emplacement du modèle par agent** non défini dans les fiches actuelles (constat 6) : sans décision,
   la règle Opus et Sonnet ne sera pas appliquée.

### 13.4 Options classées

1. Commencer par informatique, comptabilité et fiscalité (les plus utiles à une PME de services), avec les
   améliorations à fort effet et faible risque : `cloture-mensuelle`, `rapprochement-comptes`,
   `demande-de-changement`, `validation-analyse`.
2. Puis achats, données, projets, services généraux.
3. Production et logistique en dernier, et seulement pour un client qui en a besoin.

### 13.5 À décider par l'opérateur

- Nombre cible par service : valider ou réduire les 74 agents (59 sans production ni logistique).
- Où porter le modèle (Opus ou Sonnet) de chaque agent.
- Création du fichier d'attributions et de la section « Origine de la méthode » dans les compétences.
- Qui lit les pages officielles du SPF Finances inaccessibles aux robots.
- Création de `coordination-inter-services` une seule fois pour tous les groupes.
- Format exact du banc Phoenix pour y charger les 30 cas.

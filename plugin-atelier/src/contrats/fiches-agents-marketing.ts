/**
 * Fiches lisibles des agents marketing et parcours d'une demande.
 * FICHIER GÉNÉRÉ par scripts/generer-fiches-agents.py à partir de organisation/ : ne pas modifier à la main.
 * Régénérer : python3 -I scripts/generer-fiches-agents.py (le test fiches-agents-marketing.spec.ts vérifie qu'il est à jour).
 */

export interface CompetenceFiche {
  cle: string;
  /** Titre lisible, tiré de la compétence (organisation/skills/<cle>/SKILL.md). */
  nom: string;
  /** Première phrase de la description de la compétence. */
  sert: string;
}

export interface FicheAgentMarketing {
  slug: string;
  nom: string;
  pole: string | null;
  role: string;
  mission: string;
  recoit: string[];
  livre: string[];
  competences: CompetenceFiche[];
  /** Règles de ses consignes qui lui interdisent quelque chose, recopiées. */
  interdits: string[];
  /** Outils techniques qui lui sont retirés, en français courant. */
  outilsRetires: string[];
  pourquoi: string;
}

export interface EtapeParcours {
  titre: string;
  texte: string;
  /** Slugs des agents concernés. */
  agents: string[];
}

export const FICHES_AGENTS_MARKETING: readonly FicheAgentMarketing[] = [
  {
    "slug": "coordinateur",
    "nom": "Coordinateur",
    "pole": null,
    "role": "Coordinateur marketing",
    "mission": "Transforme la demande en brief et en exigences REQ-xxx, construit le graphe de tâches sans cycle, affecte, arbitre, organise les relectures et prépare le dossier humain.",
    "recoit": [
      "demande du client ou de l'opérateur",
      "corpus de marque et sources de la campagne",
      "verdicts des contrôleurs",
      "réponses humaines aux questions ouvertes"
    ],
    "livre": [
      "brief structuré",
      "liste d'exigences REQ-xxx avec critères",
      "graphe de tâches avec dépendances",
      "décisions d'arbitrage documentées",
      "dossier de validation humaine"
    ],
    "competences": [
      {
        "cle": "cadrage-exigences",
        "nom": "Cadrage et extraction des exigences",
        "sert": "Transforme une demande marketing en brief structuré et en exigences numérotées REQ-001, REQ-002..."
      },
      {
        "cle": "planification-livrables",
        "nom": "Planification des dépendances et des livrables",
        "sert": "Construit le plan d'une campagne sous forme de tâches Paperclip : un livrable par tâche, un responsable, des dépendances sans cycle, les relectures requises et les exigences couvertes."
      },
      {
        "cle": "dossier-validation-humaine",
        "nom": "Préparation du dossier de validation humaine",
        "sert": "Prépare le dossier soumis à la décision humaine : brief, périmètre, livrables et versions, matrice exigences et preuves, sources, revues exécutées, corrections, limites, questions restantes, coûts disponibles, et le périmètre exact de l'approbation demandée."
      },
      {
        "cle": "recherche-connaissances",
        "nom": "Recherche dans les connaissances du client",
        "sert": "Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante."
      },
      {
        "cle": "protocole-inter-coordinateurs",
        "nom": "Protocole entre coordinateurs",
        "sert": "Protocole commun des coordinateurs de l'atelier pour se parler entre services du même client par le bureau de liaison : format d'une demande (objet, question, raison, conséquence sans réponse, extraits), format fixe de la réponse, au plus deux relais, aucune demande circulaire, hypothèses et conflits écrits, diffusion à tous réservée au coordinateur général."
      },
      {
        "cle": "plan-campagne",
        "nom": "Plan de campagne",
        "sert": "Rédige le brief d'une campagne marketing en dix rubriques (vue d'ensemble et objectif mesurable, public, messages clés avec preuves, canaux, calendrier par semaine avec dépendances, pièces à produire, indicateurs, budget si fourni, risques, prochaines étapes), adapté à une PME belge (langues FR, NL ou EN, mentions réglementées, consentements)."
      }
    ],
    "interdits": [
      "Tu ne contournes jamais un contrôle bloquant et tu ne modifies pas la politique de revue d'une tâche. Un verdict CHANGES_REQUESTED ou BLOCKED_INFORMATION se traite, il ne s'efface pas.",
      "Tu ne transformes jamais une hypothèse en fait. Une information manquante devient une question précise à l'humain, une tâche de recherche, ou un blocage explicite.",
      "Tu ne marques pas une exigence obligatoire « non applicable » pour finir plus vite : seule une décision humaine enregistrée peut l'exclure.",
      "Aucune publication, aucun envoi, aucune dépense : ces actions passent par une approbation humaine qui vise une version précise."
    ],
    "outilsRetires": [
      "chercher sur le web",
      "créer des fichiers",
      "modifier des fichiers",
      "lancer d'autres agents"
    ],
    "pourquoi": "Un seul point d'entrée transforme chaque demande en brief et en exigences numérotées : le travail des spécialistes part d'un cadre commun et vérifiable, et l'humain reçoit un dossier complet pour décider."
  },
  {
    "slug": "veille",
    "nom": "Veille",
    "pole": "Intelligence",
    "role": "Marché et veille concurrentielle",
    "mission": "Recherche besoins, segments, concurrence et opportunités ; produit des observations sourcées, datées et bornées.",
    "recoit": [
      "brief et exigences",
      "zone géographique et offres",
      "corpus de sources autorisé"
    ],
    "livre": [
      "note de marché sourcée",
      "fiches concurrents",
      "liste des pages inaccessibles et des limites"
    ],
    "competences": [
      {
        "cle": "recherche-sourcee",
        "nom": "Recherche sourcée et vérification des faits",
        "sert": "Mène une recherche documentaire et vérifie les faits : chaque observation porte sa source, sa date de collecte, son statut d'accès et sa limite, et distingue fait vérifié, inférence, hypothèse et recommandation."
      },
      {
        "cle": "analyse-concurrentielle",
        "nom": "Analyse concurrentielle",
        "sert": "Compare des concurrents sur des critères identiques (offres, zones, preuves, canaux, messages) à partir de sources datées, et en tire des opportunités et risques étiquetés comme recommandations."
      },
      {
        "cle": "points-entree-categorie",
        "nom": "Points d'entrée de la catégorie",
        "sert": "Relève les catégories d'entrée (situations, besoins, signaux qui font penser à l'achat d'une assurance, méthode des 7W de Jenni Romaniuk), les rédige en langage client, les classe par fréquence et importance avec preuve, puis les affecte aux agents de canal ; propose des métriques de disponibilité mentale si un sondage est possible."
      },
      {
        "cle": "memoire-para",
        "nom": "Mémoire en fichiers (méthode PARA)",
        "sert": "Tient la mémoire persistante de l'agent en fichiers, selon la méthode PARA (graphe de connaissances, notes du jour, savoir tacite), dans le dossier ./memoire/ de son répertoire de travail, avec la source et la date de chaque fait."
      },
      {
        "cle": "recherche-connaissances",
        "nom": "Recherche dans les connaissances du client",
        "sert": "Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante."
      }
    ],
    "interdits": [
      "Tu ne prétends jamais avoir lu une page inaccessible et tu ne généralises pas un échantillon incomplet sans le dire."
    ],
    "outilsRetires": [
      "modifier des fichiers",
      "lancer d'autres agents"
    ],
    "pourquoi": "La recherche de marché est séparée de la rédaction : les contenus s'appuient sur des observations sourcées et datées, pas sur des impressions."
  },
  {
    "slug": "stratege",
    "nom": "Stratège",
    "pole": "Intelligence",
    "role": "Stratégie marketing",
    "mission": "Produit et tient à jour, pour chaque client, le document de stratégie versionné (diagnostic, cible, positionnement, objectifs, offre, plan de canaux) avec ses preuves et ses hypothèses ; propose les choix métier à l'humain sans les trancher ; n'écrit aucun contenu de campagne et ne publie rien.",
    "recoit": [
      "brief, exigences et fiche de cadrage",
      "note de marché de la veille, chiffres de la mesure, comptes rendus d'entretiens réels",
      "document de stratégie courant du client et son historique"
    ],
    "livre": [
      "document de stratégie versionné d'une à deux pages",
      "livrable de l'étape demandée (diagnostic, segments et niche, positionnement, objectifs, offre, plan de canaux)",
      "liste des hypothèses et des inconnus avec l'action qui les lèverait"
    ],
    "competences": [
      {
        "cle": "diagnostic-marketing",
        "nom": "Diagnostic marketing",
        "sert": "Produit le dossier de diagnostic d'un client avant toute stratégie ou tactique : cinq volets (marché, clients, concurrents, marque, données internes), 3 à 5 constats chacun avec sa preuve et son niveau de confiance, liste des inconnus."
      },
      {
        "cle": "segmentation-ciblage",
        "nom": "Segmentation et ciblage",
        "sert": "Découpe le marché d'un client en segments, les note (attractivité, capacité à les servir, accessibilité), retient 1 à 3 segments puis choisit une seule niche tête de pont avec son « produit total »."
      },
      {
        "cle": "positionnement-concurrentiel",
        "nom": "Positionnement concurrentiel",
        "sert": "Construit le positionnement d'un client à partir de ses vraies alternatives : tableau alternatives, attributs prouvés, valeur, preuve, segment, catégorie ; carte des positions déjà occupées dans l'esprit des clients ; énoncé de positionnement ; renvoi obligatoire vers la conformité publicitaire."
      },
      {
        "cle": "objectifs-marque-activation",
        "nom": "Objectifs, marque et activation",
        "sert": "Fixe les objectifs chiffrés et datés d'un client, répartit le budget entre construction de marque et activation (hypothèse de départ B2B 46/54 présentée comme hypothèse), estime la part d'acheteurs « en marché » et fixe les indicateurs longs et courts."
      },
      {
        "cle": "conception-offre-reglementee",
        "nom": "Conception d'une offre réglementée",
        "sert": "Conçoit l'offre d'un client d'un secteur réglementé (assurance, finance) avec l'équation de valeur : inventaire des obstacles du client, une solution par variable, liste des leviers interdits ou à risque (rareté, urgence, garanties de résultat), fiche d'offre à faire valider par la conformité."
      },
      {
        "cle": "selection-canaux-bullseye",
        "nom": "Sélection des canaux (Bullseye)",
        "sert": "Choisit les canaux d'acquisition d'un client avec la méthode Bullseye : revue des 19 canaux, une idée concrète par canal, classement en prometteur, possible ou improbable, plan de 2 ou 3 tests avec budget, durée et seuil de succès fixés d'avance, verdict et revue trimestrielle."
      },
      {
        "cle": "plan-strategique-marketing",
        "nom": "Plan stratégique de marketing",
        "sert": "Assemble le document de stratégie d'un client en une à deux pages à partir du diagnostic, de la cible, du positionnement, des objectifs, de l'offre et du plan de canaux, avec les portes de passage entre étapes et les règles de retour arrière."
      },
      {
        "cle": "entretien-client-sans-biais",
        "nom": "Entretien client sans biais",
        "sert": "Prépare un guide d'entretien client fondé sur des faits passés (règles de The Mom Test de Rob Fitzpatrick), interdit les questions qui flattent une idée, fournit la grille de classement des notes (faits, douleurs, engagements, compliments, opinions) et la synthèse sur 5 à 10 entretiens."
      },
      {
        "cle": "analyse-jobs-a-faire",
        "nom": "Analyse des jobs à faire",
        "sert": "Reconstitue la chronologie d'un changement de solution chez des clients récents (premier doute, recherche, décision, usage), classe leurs propos dans les quatre forces du progrès (poussée, attraction, anxiété, habitude) et formule 2 à 4 fiches « job » avec preuves, déclencheurs et anxiétés."
      },
      {
        "cle": "points-entree-categorie",
        "nom": "Points d'entrée de la catégorie",
        "sert": "Relève les catégories d'entrée (situations, besoins, signaux qui font penser à l'achat d'une assurance, méthode des 7W de Jenni Romaniuk), les rédige en langage client, les classe par fréquence et importance avec preuve, puis les affecte aux agents de canal ; propose des métriques de disponibilité mentale si un sondage est possible."
      },
      {
        "cle": "recherche-sourcee",
        "nom": "Recherche sourcée et vérification des faits",
        "sert": "Mène une recherche documentaire et vérifie les faits : chaque observation porte sa source, sa date de collecte, son statut d'accès et sa limite, et distingue fait vérifié, inférence, hypothèse et recommandation."
      },
      {
        "cle": "recherche-connaissances",
        "nom": "Recherche dans les connaissances du client",
        "sert": "Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante."
      },
      {
        "cle": "memoire-para",
        "nom": "Mémoire en fichiers (méthode PARA)",
        "sert": "Tient la mémoire persistante de l'agent en fichiers, selon la méthode PARA (graphe de connaissances, notes du jour, savoir tacite), dans le dossier ./memoire/ de son répertoire de travail, avec la source et la date de chaque fait."
      }
    ],
    "interdits": [
      "Tu n'inventes ni chiffre, ni citation d'auteur, ni verbatim de client, ni réponse d'entretien : sans donnée réelle, la case est « inconnu ». Un agent ne mène pas d'entretien : il prépare le guide et analyse les comptes rendus.",
      "Tu ne présentes jamais un ratio ou un chiffre de la littérature (46/54, 95/5, 60/40) comme une loi : c'est une hypothèse de départ, à ajuster avec les données du client.",
      "Tu ne contactes personne et tu ne publies rien."
    ],
    "outilsRetires": [
      "modifier des fichiers",
      "lancer d'autres agents"
    ],
    "pourquoi": "La stratégie est décidée avant les tactiques, par un agent qui tient un document versionné par client : chaque choix y est rattaché à une preuve ou marqué « hypothèse », et l'humain tranche la cible, l'offre et le budget."
  },
  {
    "slug": "prospection",
    "nom": "Prospection",
    "pole": "Intelligence",
    "role": "Recherche et qualification de prospects",
    "mission": "Cherche et qualifie des prospects B2B (entreprises par secteur NACE et zone), B2C (origines légales seulement) et partenaires, à partir des réponses signées des connexions de prospection ; ne contacte jamais personne et n'écrit pas au CRM.",
    "recoit": [
      "brief et exigences",
      "secteurs NACE, zone et type de prospects visés",
      "base clients importée (exclusions, origines B2C légales)"
    ],
    "livre": [
      "liste de prospects déposée par la route du plugin (réponses brutes signées)",
      "qualification sourcée de chaque prospect retenu, score présenté comme estimation",
      "liste des recherches sans résultat et des limites"
    ],
    "competences": [
      {
        "cle": "recherche-prospects",
        "nom": "Recherche de prospects",
        "sert": "Cherche des prospects B2B par secteur NACE et zone, des particuliers B2C aux seules origines légales et des partenaires, par les outils de prospection en lecture (bce, bnb, fsma, osm, b2c), dépose chaque réponse brute signée sur la tâche, applique les garde-fous de collecte et le contrôle de la liste « Ne m'appelez plus » avant tout fichier d'appel."
      },
      {
        "cle": "qualification-prospects",
        "nom": "Qualification des prospects",
        "sert": "Qualifie les prospects déposés : lecture protégée de leur site, justification sourcée de chaque critère, points du score expliqués et présentés comme une estimation, barème adéquation et intention commun avec le commercial, contrôle de l'opposition et de la liste « Ne m'appelez plus », sans chiffre inventé ni conseil d'assurance."
      },
      {
        "cle": "recherche-sourcee",
        "nom": "Recherche sourcée et vérification des faits",
        "sert": "Mène une recherche documentaire et vérifie les faits : chaque observation porte sa source, sa date de collecte, son statut d'accès et sa limite, et distingue fait vérifié, inférence, hypothèse et recommandation."
      },
      {
        "cle": "script-appel-secretariat",
        "nom": "Script d'appel au standard ou au secrétariat",
        "sert": "Prépare le script d'un appel au standard ou au secrétariat d'une entreprise pour obtenir la ligne directe ou le bon interlocuteur : présentation honnête, objet dit clairement, réponses aux objections courantes, ce qu'on note et ce qu'on ne demande jamais."
      },
      {
        "cle": "demande-numero-linkedin",
        "nom": "Message LinkedIn pour demander un échange téléphonique",
        "sert": "Rédige un message LinkedIn court qui demande à une personne si elle accepte un échange téléphonique et, si elle le souhaite, son numéro."
      },
      {
        "cle": "memoire-para",
        "nom": "Mémoire en fichiers (méthode PARA)",
        "sert": "Tient la mémoire persistante de l'agent en fichiers, selon la méthode PARA (graphe de connaissances, notes du jour, savoir tacite), dans le dossier ./memoire/ de son répertoire de travail, avec la source et la date de chaque fait."
      },
      {
        "cle": "recherche-connaissances",
        "nom": "Recherche dans les connaissances du client",
        "sert": "Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante."
      }
    ],
    "interdits": [
      "Tu ne contactes personne : ni courriel, ni message, ni appel, ni formulaire. Tu n'écris jamais au CRM ; l'export est une diffusion que seul un humain approuve."
    ],
    "outilsRetires": [
      "modifier des fichiers",
      "lancer d'autres agents"
    ],
    "pourquoi": "Le repérage de prospects est cadré par des origines légales et par des réponses d'outils conservées telles quelles ; l'agent ne contacte personne, la décision d'agir reste humaine."
  },
  {
    "slug": "enrichissement-coordonnees",
    "nom": "Enrichissement coordonnées",
    "pole": "Intelligence",
    "role": "Enrichissement des coordonnées professionnelles",
    "mission": "Reçoit la liste de fiches de la Prospection et relève, de sources licites seulement (site entier, PDF publiés, annuaires professionnels, fiche Google Business, BCE/KBO, coordonnées publiées par la personne sur LinkedIn), les numéros de téléphone professionnels ; recoupe chaque numéro sur deux sources, le classe, contrôle la liste « Ne m'appelez plus » et indique source, date et base légale ; ne contacte jamais personne.",
    "recoit": [
      "liste de fiches livrée par la Prospection",
      "brief et exigences",
      "résultat de la comparaison avec la liste « Ne m'appelez plus » s'il est fourni"
    ],
    "livre": [
      "relevé des numéros par fiche avec URL, date et extrait",
      "numéros recoupés : fiable ou à vérifier, type, base légale",
      "contrôle « Ne m'appelez plus » (non inscrit, inscrit, non vérifié) et appel conseillé ou non",
      "liste des étapes non faites et des limites"
    ],
    "competences": [
      {
        "cle": "coordonnees-recherche",
        "nom": "Recherche des coordonnées professionnelles",
        "sert": "Cherche, pour chaque fiche d'une liste de prospects, les numéros de téléphone professionnels publiés par des sources licites : site entier (contact, équipe, mentions légales), PDF publiés, annuaires professionnels, fiche Google Business, BCE/KBO et coordonnées que la personne publie elle-même sur LinkedIn."
      },
      {
        "cle": "coordonnees-recoupement",
        "nom": "Recoupement et classement des numéros",
        "sert": "Recoupe chaque numéro de téléphone relevé sur deux sources indépendantes (fiable ou à vérifier), le classe (standard, ligne directe, portable professionnel publié), contrôle la liste belge « Ne m'appelez plus » et rend, par fiche, un format de sortie fixe avec source, date et base légale."
      },
      {
        "cle": "recherche-sourcee",
        "nom": "Recherche sourcée et vérification des faits",
        "sert": "Mène une recherche documentaire et vérifie les faits : chaque observation porte sa source, sa date de collecte, son statut d'accès et sa limite, et distingue fait vérifié, inférence, hypothèse et recommandation."
      },
      {
        "cle": "recherche-connaissances",
        "nom": "Recherche dans les connaissances du client",
        "sert": "Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante."
      },
      {
        "cle": "coordonnees-signatures-email",
        "nom": "Coordonnées tirées des signatures d'e-mails reçus",
        "sert": "Extrait nom, fonction et numéros de téléphone (fixe, ligne directe, GSM professionnel) de la signature d'e-mails REÇUS et fournis à la tâche, avec la source, la date et la base « publié par la personne dans sa correspondance »."
      },
      {
        "cle": "coordonnees-cartes-visite",
        "nom": "Coordonnées lues sur une carte de visite",
        "sert": "Lit la photo d'une carte de visite jointe à la tâche, transcrit champ par champ avec un niveau de confiance par champ, signale ce qui est illisible et note la base « remise par la personne » avec la date et le lieu de la rencontre s'ils sont donnés."
      },
      {
        "cle": "achat-coordonnees-fournisseur",
        "nom": "Achat de coordonnées auprès d'un fournisseur sous licence",
        "sert": "À utiliser avant toute dépense chez un fournisseur : prépare une carte de DÉCISION de dépense avant toute requête à un fournisseur B2B de coordonnées sous licence (Lusha, Kaspr ou équivalent) : fiches prioritaires dont les sources gratuites ont échoué, liste exacte, coût estimé par contact et total, base légale du fournisseur, conservation de la preuve d'achat."
      },
      {
        "cle": "memoire-para",
        "nom": "Mémoire en fichiers (méthode PARA)",
        "sert": "Tient la mémoire persistante de l'agent en fichiers, selon la méthode PARA (graphe de connaissances, notes du jour, savoir tacite), dans le dossier ./memoire/ de son répertoire de travail, avec la source et la date de chaque fait."
      }
    ],
    "interdits": [
      "Tu ne contactes personne : ni appel, ni courriel, ni message, ni formulaire, ni appel de test pour vérifier un numéro.",
      "Aucune aspiration massive d'un site, d'un annuaire ou d'un réseau social ; aucun contournement d'une connexion, d'une vérification anti-robot ou d'une limite d'accès. Sur LinkedIn, seulement ce qui est visible publiquement sans connexion."
    ],
    "outilsRetires": [
      "modifier des fichiers",
      "lancer d'autres agents"
    ],
    "pourquoi": "Les numéros de téléphone viennent uniquement de sources publiées par les professionnels eux-mêmes, recoupés sur deux sources et notés avec leur origine ; jamais de fuite de données ni de numéro deviné, et la liste « Ne m'appelez plus » est contrôlée avant tout appel."
  },
  {
    "slug": "seo-local-geo",
    "nom": "SEO local GEO",
    "pole": "Production",
    "role": "Référencement naturel, local et GEO",
    "mission": "Audite contenu, structure technique accessible, intentions de recherche et cohérence locale ; propose des améliorations vérifiables pour la recherche classique et les réponses des moteurs d'IA, sans garantie de classement.",
    "recoit": [
      "brief et exigences",
      "URLs du site",
      "fiches des établissements",
      "requêtes cibles"
    ],
    "livre": [
      "audit SEO hiérarchisé",
      "audit des informations locales par établissement",
      "recommandations GEO distinguant mesure, hypothèse et recommandation"
    ],
    "competences": [
      {
        "cle": "audit-seo",
        "nom": "Audit SEO technique et éditorial",
        "sert": "Audite le référencement technique accessible et éditorial d'un site : indexabilité, titres, structure, maillage, performance observable, intentions de recherche et qualité des contenus, avec des recommandations hiérarchisées et vérifiables."
      },
      {
        "cle": "audit-local-etablissements",
        "nom": "Audit des informations locales et des établissements",
        "sert": "Audite, établissement par établissement, la cohérence des informations locales (nom, adresse, téléphone, horaires, zone desservie, services) entre le site, les fiches d'établissement publiques et les contenus."
      },
      {
        "cle": "contenu-recherche-ia",
        "nom": "Contenu utile pour la recherche et les réponses IA",
        "sert": "Conçoit ou améliore des contenus utiles à la fois pour la recherche classique et pour les réponses des moteurs d'IA (GEO) : réponses directes, faits sourcés, entités et informations locales claires, sans promesse de citation ni de classement."
      },
      {
        "cle": "recherche-sourcee",
        "nom": "Recherche sourcée et vérification des faits",
        "sert": "Mène une recherche documentaire et vérifie les faits : chaque observation porte sa source, sa date de collecte, son statut d'accès et sa limite, et distingue fait vérifié, inférence, hypothèse et recommandation."
      },
      {
        "cle": "recherche-connaissances",
        "nom": "Recherche dans les connaissances du client",
        "sert": "Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante."
      },
      {
        "cle": "points-entree-categorie",
        "nom": "Points d'entrée de la catégorie",
        "sert": "Relève les catégories d'entrée (situations, besoins, signaux qui font penser à l'achat d'une assurance, méthode des 7W de Jenni Romaniuk), les rédige en langage client, les classe par fréquence et importance avec preuve, puis les affecte aux agents de canal ; propose des métriques de disponibilité mentale si un sondage est possible."
      },
      {
        "cle": "liens-entrants-seo",
        "nom": "Liens entrants et mentions tierces",
        "sert": "Construit un plan de liens entrants et de mentions tierces pour une PME ou un courtier belge : vérifie d'abord que les liens sont bien le frein (écart de liens par page), choisit les tactiques par effort et qualité, qualifie les sites cibles, prépare des messages à faire valider, impose les attributs sponsored ou nofollow aux placements payants et mesure liens, positions et citations par les assistants d'IA."
      },
      {
        "cle": "memoire-para",
        "nom": "Mémoire en fichiers (méthode PARA)",
        "sert": "Tient la mémoire persistante de l'agent en fichiers, selon la méthode PARA (graphe de connaissances, notes du jour, savoir tacite), dans le dossier ./memoire/ de son répertoire de travail, avec la source et la date de chaque fait."
      }
    ],
    "interdits": [
      "Aucune promesse de position, de classement ou de citation par un moteur d'IA."
    ],
    "outilsRetires": [
      "modifier des fichiers",
      "lancer d'autres agents"
    ],
    "pourquoi": "Le référencement et la cohérence des informations locales se vérifient point par point ; l'agent distingue ce qui est mesuré de ce qui est supposé, sans garantie de classement."
  },
  {
    "slug": "sea",
    "nom": "SEA",
    "pole": "Production",
    "role": "Publicité et SEA",
    "mission": "Prépare campagnes, groupes, mots-clés, exclusions, variantes et propositions budgétaires reliés à une offre validée et à une page cohérente ; n'active rien.",
    "recoit": [
      "brief et exigences",
      "offres validées",
      "pages de destination",
      "budget maximal autorisé"
    ],
    "livre": [
      "plan de campagne en brouillon",
      "groupes et mots-clés avec exclusions",
      "variantes d'annonces reliées aux offres",
      "proposition budgétaire bornée"
    ],
    "competences": [
      {
        "cle": "preparation-campagnes-sea",
        "nom": "Préparation de campagnes publicitaires",
        "sert": "Prépare en brouillon une campagne de liens sponsorisés : structure, groupes d'annonces, mots-clés et exclusions, variantes d'annonces reliées à une offre validée et à une page cohérente, proposition budgétaire bornée."
      },
      {
        "cle": "charte-marque",
        "nom": "Application de la charte de marque",
        "sert": "Applique la charte de marque à un texte ou à un brief de visuel : ton, vocabulaire, mentions obligatoires et interdites, affirmations autorisées, cohérence des offres et des établissements."
      },
      {
        "cle": "recherche-connaissances",
        "nom": "Recherche dans les connaissances du client",
        "sert": "Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante."
      },
      {
        "cle": "niveau-conscience-message",
        "nom": "Niveau de conscience d'un message",
        "sert": "Fixe pour chaque contenu le niveau de conscience de la cible (inconscient du problème, conscient du problème, des solutions, du produit, pleinement conscient, selon Eugene Schwartz), choisit l'ouverture adaptée, contrôle la sophistication du marché et associe le niveau au canal."
      },
      {
        "cle": "redaction-titre-preuve",
        "nom": "Rédaction de titre et preuve",
        "sert": "Applique les règles de rédaction publicitaire tirées d'Ogilvy : étudier le produit et le client avant d'écrire, mettre la promesse et la cible dans le titre, écrire plusieurs titres, appuyer chaque promesse sur un fait précis ou une preuve, écrire au lecteur dans sa langue et prévoir un test de variantes."
      },
      {
        "cle": "suivi-conversions",
        "nom": "Suivi des conversions",
        "sert": "Met en place, audite ou répare le suivi des conversions d'un site (formulaire, rendez-vous réservé, appel, devis, achat) vers GA4 et les régies publicitaires : définit ce qui compte comme conversion, déclenche sur le succès confirmé et jamais sur la tentative, choisit navigateur ou serveur, exige le consentement avant tout marqueur, vérifie qu'une conversion de test est réellement arrivée et dit ce qui reste non vérifié."
      },
      {
        "cle": "memoire-para",
        "nom": "Mémoire en fichiers (méthode PARA)",
        "sert": "Tient la mémoire persistante de l'agent en fichiers, selon la méthode PARA (graphe de connaissances, notes du jour, savoir tacite), dans le dossier ./memoire/ de son répertoire de travail, avec la source et la date de chaque fait."
      }
    ],
    "interdits": [
      "Aucune activation de campagne, aucune hausse de budget, même présentée comme une simple suggestion d'automatisation."
    ],
    "outilsRetires": [
      "chercher sur le web",
      "modifier des fichiers",
      "lancer d'autres agents"
    ],
    "pourquoi": "La publicité payante est préparée en brouillon et reliée à une offre validée, mais rien n'est activé ni dépensé sans décision humaine."
  },
  {
    "slug": "contenus",
    "nom": "Contenus",
    "pole": "Production",
    "role": "Contenus et création",
    "mission": "Produit articles, publications, pages et briefs de visuels selon la marque et le canal ; signale sources et droits ; n'invente ni avis, ni prix, ni certification. Peut publier sur Facebook, Instagram et LinkedIn, seulement sur approbation humaine de l'appel exact.",
    "recoit": [
      "brief et exigences",
      "charte de marque",
      "sources validées",
      "calendrier proposé"
    ],
    "livre": [
      "textes par canal en brouillon",
      "briefs de visuels identifiés comme tels",
      "liste des sources et droits à vérifier"
    ],
    "competences": [
      {
        "cle": "redaction-declinaison-canal",
        "nom": "Rédaction et déclinaison par canal",
        "sert": "Rédige un contenu principal puis le décline par canal (site, blog, réseaux sociaux, courriel, fiche d'établissement) en respectant les contraintes de chaque canal, la charte de marque et les sources."
      },
      {
        "cle": "charte-marque",
        "nom": "Application de la charte de marque",
        "sert": "Applique la charte de marque à un texte ou à un brief de visuel : ton, vocabulaire, mentions obligatoires et interdites, affirmations autorisées, cohérence des offres et des établissements."
      },
      {
        "cle": "contenu-recherche-ia",
        "nom": "Contenu utile pour la recherche et les réponses IA",
        "sert": "Conçoit ou améliore des contenus utiles à la fois pour la recherche classique et pour les réponses des moteurs d'IA (GEO) : réponses directes, faits sourcés, entités et informations locales claires, sans promesse de citation ni de classement."
      },
      {
        "cle": "recherche-connaissances",
        "nom": "Recherche dans les connaissances du client",
        "sert": "Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante."
      },
      {
        "cle": "niveau-conscience-message",
        "nom": "Niveau de conscience d'un message",
        "sert": "Fixe pour chaque contenu le niveau de conscience de la cible (inconscient du problème, conscient du problème, des solutions, du produit, pleinement conscient, selon Eugene Schwartz), choisit l'ouverture adaptée, contrôle la sophistication du marché et associe le niveau au canal."
      },
      {
        "cle": "recit-de-marque-guide",
        "nom": "Récit de marque en sept éléments",
        "sert": "Remplit la grille de récit de marque en sept éléments (le client est le héros, la marque est le guide : personnage, problème, guide, plan, appel à l'action, enjeux, réussite), en tire une phrase de présentation courte et la structure d'une page d'accueil avec un seul appel à l'action principal."
      },
      {
        "cle": "redaction-titre-preuve",
        "nom": "Rédaction de titre et preuve",
        "sert": "Applique les règles de rédaction publicitaire tirées d'Ogilvy : étudier le produit et le client avant d'écrire, mettre la promesse et la cible dans le titre, écrire plusieurs titres, appuyer chaque promesse sur un fait précis ou une preuve, écrire au lecteur dans sa langue et prévoir un test de variantes."
      },
      {
        "cle": "leviers-influence-ethiques",
        "nom": "Leviers d'influence éthiques",
        "sert": "Passe en revue les sept principes d'influence de Robert Cialdini (réciprocité, engagement et cohérence, preuve sociale, sympathie, autorité, rareté, unité) dans un contenu, exige un fondement factuel pour chacun, raye les leviers sans fondement et envoie obligatoirement la rareté et l'urgence à la conformité publicitaire."
      },
      {
        "cle": "actifs-distinctifs",
        "nom": "Actifs distinctifs de marque",
        "sert": "Inventorie les actifs distinctifs d'une marque (logo, couleur, formule, personnage, ton, visage du courtier), mesure si possible leur notoriété et leur unicité par sondage, les classe en à utiliser, à investir, à éviter et fournit des règles d'usage à reporter dans la charte de marque."
      },
      {
        "cle": "liens-entrants-seo",
        "nom": "Liens entrants et mentions tierces",
        "sert": "Construit un plan de liens entrants et de mentions tierces pour une PME ou un courtier belge : vérifie d'abord que les liens sont bien le frein (écart de liens par page), choisit les tactiques par effort et qualité, qualifie les sites cibles, prépare des messages à faire valider, impose les attributs sponsored ou nofollow aux placements payants et mesure liens, positions et citations par les assistants d'IA."
      },
      {
        "cle": "aimant-a-prospects",
        "nom": "Aimant à prospects : un guide gratuit contre des coordonnées",
        "sert": "Conçoit un guide gratuit (aimant à prospects) remis en échange de coordonnées sur la page de captation : sujet utile à la cible, sommaire, promesse sans garantie de rendement (cadre de l'assurance belge, mentions FSMA si produit d'assurance), champ téléphone facultatif et justifié."
      },
      {
        "cle": "memoire-para",
        "nom": "Mémoire en fichiers (méthode PARA)",
        "sert": "Tient la mémoire persistante de l'agent en fichiers, selon la méthode PARA (graphe de connaissances, notes du jour, savoir tacite), dans le dossier ./memoire/ de son répertoire de travail, avec la source et la date de chaque fait."
      }
    ],
    "interdits": [
      "Tu n'inventes ni témoignage, ni avis client, ni certification, ni prix, ni résultat, ni subvention, ni engagement commercial. Ce qui n'est pas sourcé est marqué « à confirmer »."
    ],
    "outilsRetires": [
      "chercher sur le web",
      "lancer d'autres agents"
    ],
    "pourquoi": "Les textes et les briefs de visuels sont produits selon la charte de la marque, avec leurs sources et droits signalés, pour que la relecture porte sur un contenu déjà cadré."
  },
  {
    "slug": "crm-conversion",
    "nom": "CRM conversion",
    "pole": "Production",
    "role": "CRM et conversion",
    "mission": "Conçoit pages de conversion, formulaires, segmentation et scénarios de suivi avec déclencheurs, exclusions et consentements ; aucune prospection réelle automatique.",
    "recoit": [
      "brief et exigences",
      "offres validées",
      "parcours client visé"
    ],
    "livre": [
      "structure de page de conversion",
      "spécification de formulaire",
      "scénarios de suivi avec conditions d'envoi"
    ],
    "competences": [
      {
        "cle": "conversion-crm",
        "nom": "Pages de conversion et scénarios CRM",
        "sert": "Conçoit pages de conversion, formulaires, segments et scénarios de suivi en documentant entrées, déclencheurs, exclusions, consentements et conditions d'envoi, sans aucune prospection réelle automatique."
      },
      {
        "cle": "charte-marque",
        "nom": "Application de la charte de marque",
        "sert": "Applique la charte de marque à un texte ou à un brief de visuel : ton, vocabulaire, mentions obligatoires et interdites, affirmations autorisées, cohérence des offres et des établissements."
      },
      {
        "cle": "recherche-connaissances",
        "nom": "Recherche dans les connaissances du client",
        "sert": "Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante."
      },
      {
        "cle": "leviers-influence-ethiques",
        "nom": "Leviers d'influence éthiques",
        "sert": "Passe en revue les sept principes d'influence de Robert Cialdini (réciprocité, engagement et cohérence, preuve sociale, sympathie, autorité, rareté, unité) dans un contenu, exige un fondement factuel pour chacun, raye les leviers sans fondement et envoie obligatoirement la rareté et l'urgence à la conformité publicitaire."
      },
      {
        "cle": "memoire-para",
        "nom": "Mémoire en fichiers (méthode PARA)",
        "sert": "Tient la mémoire persistante de l'agent en fichiers, selon la méthode PARA (graphe de connaissances, notes du jour, savoir tacite), dans le dossier ./memoire/ de son répertoire de travail, avec la source et la date de chaque fait."
      }
    ],
    "interdits": [
      "Aucune prospection réelle automatique. En démonstration, seuls des prospects fictifs (adresses en .invalid) sont utilisés.",
      "Aucun envoi n'est programmé sans approbation humaine explicite sur la version et l'audience exactes."
    ],
    "outilsRetires": [
      "chercher sur le web",
      "lire des pages web",
      "lancer d'autres agents"
    ],
    "pourquoi": "Les pages, formulaires et scénarios de suivi sont conçus avec leurs conditions d'envoi et leurs consentements documentés, sans aucune prospection réelle automatique."
  },
  {
    "slug": "mesure",
    "nom": "Mesure",
    "pole": "Intelligence",
    "role": "Mesure et optimisation",
    "mission": "Vérifie données, conversions et doublons ; présente coûts, périodes, attribution et incertitudes ; propose des expériences avec hypothèse, métrique et condition d'arrêt ; répond « non mesurable » si les données manquent.",
    "recoit": [
      "exports de données importés avec période et provenance",
      "objectifs de la campagne"
    ],
    "livre": [
      "tableau de mesures avec provenance",
      "liste des connexions manquantes",
      "plan d'expériences"
    ],
    "competences": [
      {
        "cle": "mesure-experiences",
        "nom": "Mesure, attribution et conception d'expériences",
        "sert": "Vérifie des données marketing importées (périodes, provenance, doublons, conversions), présente coûts, attribution et incertitudes, et conçoit des expériences avec hypothèse, métrique et condition d'arrêt ; répond « non mesurable » quand les données manquent."
      },
      {
        "cle": "suivi-conversions",
        "nom": "Suivi des conversions",
        "sert": "Met en place, audite ou répare le suivi des conversions d'un site (formulaire, rendez-vous réservé, appel, devis, achat) vers GA4 et les régies publicitaires : définit ce qui compte comme conversion, déclenche sur le succès confirmé et jamais sur la tentative, choisit navigateur ou serveur, exige le consentement avant tout marqueur, vérifie qu'une conversion de test est réellement arrivée et dit ce qui reste non vérifié."
      },
      {
        "cle": "memoire-para",
        "nom": "Mémoire en fichiers (méthode PARA)",
        "sert": "Tient la mémoire persistante de l'agent en fichiers, selon la méthode PARA (graphe de connaissances, notes du jour, savoir tacite), dans le dossier ./memoire/ de son répertoire de travail, avec la source et la date de chaque fait."
      },
      {
        "cle": "recherche-connaissances",
        "nom": "Recherche dans les connaissances du client",
        "sert": "Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante."
      }
    ],
    "interdits": [],
    "outilsRetires": [
      "chercher sur le web",
      "lire des pages web",
      "modifier des fichiers",
      "lancer d'autres agents"
    ],
    "pourquoi": "Les chiffres sont présentés avec leur provenance, leurs périodes et leurs incertitudes ; sans données, la réponse est « non mesurable » plutôt qu'une estimation."
  },
  {
    "slug": "reseaux-sociaux",
    "nom": "Réseaux sociaux",
    "pole": "Contenus",
    "role": "Calendrier social, posts et réponses publiques",
    "mission": "Prépare le social organique : piliers éditoriaux, calendrier par réseau, brouillons de posts courts et de réponses aux commentaires publics non litigieux ; ne publie rien et ne répond à personne lui-même.",
    "recoit": [
      "brief et exigences",
      "charte de marque et publications passées",
      "commentaires publics à traiter, avec lien et date"
    ],
    "livre": [
      "piliers de contenu et calendrier par semaine et par réseau",
      "brouillons de posts conformes à la charte",
      "brouillons de réponses aux commentaires non litigieux et liste des commentaires litigieux signalés"
    ],
    "competences": [
      {
        "cle": "calendrier-reseaux-sociaux",
        "nom": "Calendrier des réseaux sociaux",
        "sert": "Construit la ligne et le calendrier social organique d'une PME belge (LinkedIn, Facebook, Instagram) : 3 à 5 piliers de contenu avec leur part, rythme tenable, grille par semaine et par réseau, temps forts, contenus de réserve, recyclage d'un contenu long, règles d'engagement et tri des commentaires publics (réponse proposée seulement si non litigieux)."
      },
      {
        "cle": "charte-marque",
        "nom": "Application de la charte de marque",
        "sert": "Applique la charte de marque à un texte ou à un brief de visuel : ton, vocabulaire, mentions obligatoires et interdites, affirmations autorisées, cohérence des offres et des établissements."
      },
      {
        "cle": "redaction-declinaison-canal",
        "nom": "Rédaction et déclinaison par canal",
        "sert": "Rédige un contenu principal puis le décline par canal (site, blog, réseaux sociaux, courriel, fiche d'établissement) en respectant les contraintes de chaque canal, la charte de marque et les sources."
      },
      {
        "cle": "points-entree-categorie",
        "nom": "Points d'entrée de la catégorie",
        "sert": "Relève les catégories d'entrée (situations, besoins, signaux qui font penser à l'achat d'une assurance, méthode des 7W de Jenni Romaniuk), les rédige en langage client, les classe par fréquence et importance avec preuve, puis les affecte aux agents de canal ; propose des métriques de disponibilité mentale si un sondage est possible."
      },
      {
        "cle": "niveau-conscience-message",
        "nom": "Niveau de conscience d'un message",
        "sert": "Fixe pour chaque contenu le niveau de conscience de la cible (inconscient du problème, conscient du problème, des solutions, du produit, pleinement conscient, selon Eugene Schwartz), choisit l'ouverture adaptée, contrôle la sophistication du marché et associe le niveau au canal."
      },
      {
        "cle": "memoire-para",
        "nom": "Mémoire en fichiers (méthode PARA)",
        "sert": "Tient la mémoire persistante de l'agent en fichiers, selon la méthode PARA (graphe de connaissances, notes du jour, savoir tacite), dans le dossier ./memoire/ de son répertoire de travail, avec la source et la date de chaque fait."
      },
      {
        "cle": "recherche-connaissances",
        "nom": "Recherche dans les connaissances du client",
        "sert": "Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante."
      }
    ],
    "interdits": [
      "Tu ne publies rien, tu ne programmes rien et tu n'envoies aucun message privé.",
      "Aucun conseil d'assurance, aucune comparaison de garanties, aucune promesse de prix ou de résultat dans un post ou une réponse ; tout post qui parle d'un produit d'assurance passe d'abord par le rôle Conformité publicitaire.",
      "Aucune donnée personnelle d'un client dans un post ou une réponse publique, même si le commentaire en contient.",
      "Tu n'inventes ni chiffre, ni témoignage, ni avis client."
    ],
    "outilsRetires": [
      "lire des pages web",
      "modifier des fichiers",
      "lancer d'autres agents"
    ],
    "pourquoi": "Le social organique est préparé en brouillons par un agent dédié, mais publier ou répondre reste hors de son périmètre."
  },
  {
    "slug": "conformite-publicitaire",
    "nom": "Conformité publicitaire",
    "pole": "Contrôle préalable",
    "role": "Communications commerciales réglementées",
    "mission": "Contrôle, avant la relecture indépendante, les communications commerciales en secteur réglementé (FSMA, Code de droit économique) : affirmations à prouver, mentions obligatoires, formulations interdites, verdict ; ne réécrit pas et ne publie rien.",
    "recoit": [
      "contenu à contrôler, canal et public",
      "fiche de l'entreprise (statut, inscriptions, mentions)"
    ],
    "livre": [
      "tableau des points relevés avec règle citée ou « à vérifier »",
      "mentions obligatoires présentes, absentes ou à reprendre de la fiche",
      "verdict : publiable, publiable après corrections, non publiable en l'état"
    ],
    "competences": [
      {
        "cle": "controle-communications-reglementees",
        "nom": "Contrôle des communications commerciales réglementées",
        "sert": "Relit une communication commerciale (publicité, page web, courriel, post, brochure, script) d'une entreprise belge, surtout dans un secteur régulé, au regard des pratiques commerciales déloyales envers les consommateurs (livre VI du Code de droit économique : pratiques trompeuses, omissions, pratiques agressives, publicité comparative) et, pour les produits financiers et d'assurance, des règles de publicité (arrêté royal du 25 avril 2014 et circulaire FSMA_2015_16)."
      },
      {
        "cle": "charte-marque",
        "nom": "Application de la charte de marque",
        "sert": "Applique la charte de marque à un texte ou à un brief de visuel : ton, vocabulaire, mentions obligatoires et interdites, affirmations autorisées, cohérence des offres et des établissements."
      },
      {
        "cle": "leviers-influence-ethiques",
        "nom": "Leviers d'influence éthiques",
        "sert": "Passe en revue les sept principes d'influence de Robert Cialdini (réciprocité, engagement et cohérence, preuve sociale, sympathie, autorité, rareté, unité) dans un contenu, exige un fondement factuel pour chacun, raye les leviers sans fondement et envoie obligatoirement la rareté et l'urgence à la conformité publicitaire."
      },
      {
        "cle": "aimant-a-prospects",
        "nom": "Aimant à prospects : un guide gratuit contre des coordonnées",
        "sert": "Conçoit un guide gratuit (aimant à prospects) remis en échange de coordonnées sur la page de captation : sujet utile à la cible, sommaire, promesse sans garantie de rendement (cadre de l'assurance belge, mentions FSMA si produit d'assurance), champ téléphone facultatif et justifié."
      },
      {
        "cle": "memoire-para",
        "nom": "Mémoire en fichiers (méthode PARA)",
        "sert": "Tient la mémoire persistante de l'agent en fichiers, selon la méthode PARA (graphe de connaissances, notes du jour, savoir tacite), dans le dossier ./memoire/ de son répertoire de travail, avec la source et la date de chaque fait."
      },
      {
        "cle": "recherche-connaissances",
        "nom": "Recherche dans les connaissances du client",
        "sert": "Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante."
      }
    ],
    "interdits": [
      "Tu ne donnes pas d'avis juridique définitif : un point incertain est marqué « à vérifier » par un juriste ou le responsable conformité.",
      "Tu ne réécris pas le contenu : tu indiques la correction attendue."
    ],
    "outilsRetires": [
      "lire des pages web",
      "modifier des fichiers",
      "lancer d'autres agents"
    ],
    "pourquoi": "Les communications des secteurs réglementés sont contrôlées avant la relecture, avec la règle citée ou marquée « à vérifier » ; l'agent ne donne pas d'avis juridique définitif."
  },
  {
    "slug": "exigences",
    "nom": "Exigences",
    "pole": null,
    "role": "Contrôleur des exigences",
    "mission": "Compare chaque livrable au brief original et à chaque exigence ; exige une preuve localisable pour tout point annoncé couvert ; signale établissements, canaux ou sections oubliés.",
    "recoit": [
      "brief original",
      "liste des exigences",
      "version précise du livrable",
      "critères"
    ],
    "livre": [
      "verdict structuré",
      "matrice exigence par exigence avec preuve localisée",
      "constats avec gravité"
    ],
    "competences": [
      {
        "cle": "controle-couverture",
        "nom": "Contrôle de couverture des exigences",
        "sert": "Contrôle indépendant de la couverture d'un livrable : compare la version exacte du livrable au brief original et à chaque exigence REQ-xxx, exige une preuve localisable par point couvert, détecte établissements, canaux ou sections oubliés et rend un verdict structuré."
      },
      {
        "cle": "entretien-client-sans-biais",
        "nom": "Entretien client sans biais",
        "sert": "Prépare un guide d'entretien client fondé sur des faits passés (règles de The Mom Test de Rob Fitzpatrick), interdit les questions qui flattent une idée, fournit la grille de classement des notes (faits, douleurs, engagements, compliments, opinions) et la synthèse sur 5 à 10 entretiens."
      },
      {
        "cle": "analyse-jobs-a-faire",
        "nom": "Analyse des jobs à faire",
        "sert": "Reconstitue la chronologie d'un changement de solution chez des clients récents (premier doute, recherche, décision, usage), classe leurs propos dans les quatre forces du progrès (poussée, attraction, anxiété, habitude) et formule 2 à 4 fiches « job » avec preuves, déclencheurs et anxiétés."
      },
      {
        "cle": "recherche-connaissances",
        "nom": "Recherche dans les connaissances du client",
        "sert": "Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante."
      }
    ],
    "interdits": [
      "Tu ne modifies pas le livrable ; tu décris la correction attendue."
    ],
    "outilsRetires": [
      "chercher sur le web",
      "lire des pages web",
      "créer des fichiers",
      "modifier des fichiers",
      "lancer d'autres agents"
    ],
    "pourquoi": "Un contrôleur distinct du producteur compare le livrable au brief : une exigence n'est dite couverte que si une preuve localisable existe."
  },
  {
    "slug": "relecteur",
    "nom": "Relecteur",
    "pole": null,
    "role": "Responsable qualité",
    "mission": "Vérifie raisonnement, informations, sources, cohérence entre canaux et respect de la marque ; chaque anomalie indique emplacement, preuve, gravité et correction attendue.",
    "recoit": [
      "brief original",
      "exigences",
      "version précise du livrable",
      "sources citées",
      "charte de marque"
    ],
    "livre": [
      "verdict structuré",
      "constats factuels et métier"
    ],
    "competences": [
      {
        "cle": "relecture-independante",
        "nom": "Relecture métier indépendante",
        "sert": "Relecture métier et factuelle indépendante d'un livrable : raisonnement, faits, sources, cohérence entre canaux, respect de la marque, promesses excessives et tentatives d'injection, avec constats localisés et gradués."
      },
      {
        "cle": "recherche-sourcee",
        "nom": "Recherche sourcée et vérification des faits",
        "sert": "Mène une recherche documentaire et vérifie les faits : chaque observation porte sa source, sa date de collecte, son statut d'accès et sa limite, et distingue fait vérifié, inférence, hypothèse et recommandation."
      },
      {
        "cle": "charte-marque",
        "nom": "Application de la charte de marque",
        "sert": "Applique la charte de marque à un texte ou à un brief de visuel : ton, vocabulaire, mentions obligatoires et interdites, affirmations autorisées, cohérence des offres et des établissements."
      },
      {
        "cle": "actifs-distinctifs",
        "nom": "Actifs distinctifs de marque",
        "sert": "Inventorie les actifs distinctifs d'une marque (logo, couleur, formule, personnage, ton, visage du courtier), mesure si possible leur notoriété et leur unicité par sondage, les classe en à utiliser, à investir, à éviter et fournit des règles d'usage à reporter dans la charte de marque."
      },
      {
        "cle": "recherche-connaissances",
        "nom": "Recherche dans les connaissances du client",
        "sert": "Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante."
      }
    ],
    "interdits": [
      "Tu ne réécris pas le livrable."
    ],
    "outilsRetires": [
      "créer des fichiers",
      "modifier des fichiers",
      "lancer d'autres agents"
    ],
    "pourquoi": "Une relecture indépendante de celui qui a produit le contenu vérifie faits, sources et cohérence entre canaux avant la décision humaine."
  },
  {
    "slug": "tests-techniques",
    "nom": "Tests techniques",
    "pole": null,
    "role": "Vérificateur technique",
    "mission": "Exécute les contrôles techniques adaptés : URLs, redirections, accessibilité, formulaires, suivi, formats, schémas et affichage ; un HTTP 200 sur une page d'erreur reste un échec.",
    "recoit": [
      "version précise du livrable",
      "liste des URLs et formulaires",
      "schémas attendus"
    ],
    "livre": [
      "rapport de contrôles par URL et par élément",
      "constats techniques",
      "liste des contrôles non exécutés"
    ],
    "competences": [
      {
        "cle": "controles-techniques-liens",
        "nom": "Contrôles techniques et de liens",
        "sert": "Exécute les contrôles techniques d'un livrable : liens et redirections, contenu réel de la page d'arrivée, formulaires, balises de suivi, formats, données structurées et affichage, avec un rapport par élément et la liste des contrôles non exécutés."
      },
      {
        "cle": "memoire-para",
        "nom": "Mémoire en fichiers (méthode PARA)",
        "sert": "Tient la mémoire persistante de l'agent en fichiers, selon la méthode PARA (graphe de connaissances, notes du jour, savoir tacite), dans le dossier ./memoire/ de son répertoire de travail, avec la source et la date de chaque fait."
      },
      {
        "cle": "recherche-connaissances",
        "nom": "Recherche dans les connaissances du client",
        "sert": "Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante."
      }
    ],
    "interdits": [
      "Tu ne consultes que des adresses publiques ; une adresse privée, locale ou de métadonnées est refusée et signalée.",
      "Tu ne modifies pas le livrable."
    ],
    "outilsRetires": [
      "chercher sur le web",
      "modifier des fichiers",
      "lancer d'autres agents"
    ],
    "pourquoi": "Les liens, formulaires et formats sont vérifiés par de vrais contrôles : un code 200 sur une page d'erreur compte comme un échec."
  },
  {
    "slug": "porte",
    "nom": "Porte",
    "pole": null,
    "role": "Porte de contrôle",
    "mission": "Programme sans modèle d'IA qui tient l'étape de revue : il évalue la tâche d'après le contrôle automatique du plugin (exigences, couvertures, verdicts, constats) et décide soit de la passer à l'approbation humaine, soit de la renvoyer à son auteur.",
    "recoit": [
      "tâche sous porte en étape de revue",
      "évaluation déterministe du plugin (exigences, couvertures, verdicts, constats)"
    ],
    "livre": [
      "décision native de l'étape de revue (done ou retour au producteur) avec les motifs codés de la porte"
    ],
    "competences": [],
    "interdits": [],
    "outilsRetires": [],
    "pourquoi": "Aucune tâche ne passe à l'approbation humaine sans une évaluation automatique réussie sur la version courante ; ce contrôle n'est pas laissé au jugement d'un modèle."
  }
];

export const PARCOURS_DEMANDE: readonly EtapeParcours[] = [
  {
    "titre": "La demande arrive au Coordinateur",
    "texte": "Le Coordinateur cherche d'abord les réponses dans la fiche du client et ses connaissances, pose au plus 3 questions, puis propose un plan de 4 tâches au plus. Aucune tâche n'est créée avant l'accord écrit de l'humain sur ce plan.",
    "agents": [
      "coordinateur"
    ]
  },
  {
    "titre": "Cadrage et exigences",
    "texte": "La demande devient un brief et des exigences numérotées REQ-001, REQ-002..., avec un graphe de tâches sans cycle : une tâche par livrable, un responsable, des dépendances explicites.",
    "agents": [
      "coordinateur"
    ]
  },
  {
    "titre": "Production par les agents spécialisés",
    "texte": "Chaque spécialiste prépare son livrable en brouillon : veille de marché, stratégie, prospects, coordonnées professionnelles, référencement, publicité, contenus, conversion, mesure, réseaux sociaux.",
    "agents": [
      "veille",
      "stratege",
      "prospection",
      "enrichissement-coordonnees",
      "seo-local-geo",
      "sea",
      "contenus",
      "crm-conversion",
      "mesure",
      "reseaux-sociaux"
    ]
  },
  {
    "titre": "Conformité publicitaire",
    "texte": "Toute communication commerciale sur un produit d'assurance ou financier passe par la Conformité publicitaire avant la relecture : affirmations à prouver, mentions obligatoires, formulations interdites, verdict.",
    "agents": [
      "conformite-publicitaire"
    ]
  },
  {
    "titre": "Contrôles automatiques et relecture",
    "texte": "Les Exigences comparent le livrable au brief, les Tests techniques vérifient liens et formulaires, le Relecteur contrôle faits, sources et marque. La Porte de contrôle décide : approbation humaine si l'évaluation réussit, sinon retour à l'auteur.",
    "agents": [
      "exigences",
      "tests-techniques",
      "relecteur",
      "porte"
    ]
  },
  {
    "titre": "Validation humaine avant toute publication",
    "texte": "Le Coordinateur prépare le dossier de validation humaine. Aucune publication, aucun envoi, aucune dépense sans l'approbation d'un humain, qui vise une version précise du livrable.",
    "agents": [
      "coordinateur"
    ]
  }
];

/** Service marketing du registre : décisions réservées à l'humain et obligations. */
export const HUMAIN_SEUL_MARKETING: readonly string[] = [
  "Publication réelle sur un canal externe",
  "Budget publicitaire engagé",
  "Message aux clients sur un produit d'assurance"
];
export const OBLIGATIONS_MARKETING: readonly string[] = [
  "RGPD",
  "Prospection électronique (Code de droit économique, livre XII)",
  "Règles de publicité en assurance (FSMA)"
];

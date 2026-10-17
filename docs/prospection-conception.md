# Prospection sortante : étude et conception

Date : 15/10/2026. Étude seule : aucun code n'a été modifié. Méthode reprise de `docs/connecteurs-conception.md`
(passerelle MCP, deux modes, cartes natives, simulateur réaliste) et des contrats v1.5 (`docs/contrats.md` §12 à §14).
La liste comparée des fournisseurs et outils du marché est dans `docs/prospection-outils-marche.md` (autre étude
menée en parallèle) : ce document n'en reprend que ce qui touche au droit et à l'architecture.

Niveaux de preuve : **prouvé** = lu dans une source officielle ou dans le code, référence donnée ; **probable** =
déduit sans lecture complète de la source primaire ; **inconnu** = à établir. Ce document n'est pas un avis juridique :
les points marqués « juriste » doivent être confirmés par le délégué à la protection des données ou le service
conformité du client avant tout usage réel.

## 1. Verdict

1. **B2B en Belgique : faisable et légal sur données officielles gratuites.** La BCE (Banque-Carrefour des
   Entreprises) donne toutes les entités actives avec forme juridique, codes NACE, adresses et date de début, gratuitement
   après inscription. La Centrale des bilans de la BNB donne gratuitement les comptes annuels (taille, effectif, bilan).
   Ces deux sources suffisent à trouver et qualifier des entreprises par secteur et par zone, sans compte payant.
2. **Le contact B2B est le vrai verrou, pas la recherche.** Par courrier électronique, une entreprise ne peut être
   prospectée sans consentement que sur une adresse **impersonnelle** (`info@`, `contact@`) ; l'adresse nominative d'un
   salarié (`prenom.nom@`) exige un consentement préalable (arrêté royal du 4 avril 2003, art. 1er, 2°, §3.2). Les
   outils d'enrichissement qui vendent des adresses nominatives ne rendent donc pas l'envoi d'un courriel légal. Le
   téléphone reste possible sous réserve de la liste « Ne m'appelez plus » ; le courrier postal et la visite aussi.
3. **B2C sortant « à froid » : presque fermé.** Courriel et SMS exigent le consentement préalable ; le téléphone exige
   le respect de la liste « Ne m'appelez plus », dont la suppression au profit d'un opt-in est en discussion. Il n'existe
   aucune source légale de particuliers « à cibler » par l'usine. Les canaux réalistes sont entrants ou consentis :
   formulaires et publicité géolocalisée, partenaires avec consentement nominatif, parrainage par lien, événements, et la
   **base de clients existante** du client (ventes croisées).
4. **Courtiers et partenaires : registre public de la FSMA**, consultable par nom ou numéro BCE ; le format d'export en
   masse et les conditions de réutilisation restent **inconnus** (à demander à la FSMA). Les courtiers sont souvent des
   personnes physiques : même règle de contact que le B2B (§3.2).
5. **Garde-fou métier propre à l'assurance** : l'usine doit rester une **simple fourniture de données sur des preneurs
   potentiels**. Dès qu'elle aide à conclure un contrat (conseil, comparaison de garanties, devis), elle fait de la
   distribution d'assurance soumise à inscription (directive (UE) 2016/97, art. 2, §2, c) et d), §3.4).
6. **« Le taux exact que le lead est un vrai lead » n'existe pas avant mesure.** On affiche un **score expliqué** (points
   par critère), présenté comme une **estimation**. Il devient une **probabilité avec sa marge** seulement après un
   étalonnage sur les conversions réelles du client (régression logistique sur le score, dite méthode de Platt,
   diagramme de fiabilité, intervalle de confiance par tranche). La base de clients et l'historique du CRM permettent cet
   étalonnage dès l'import, au lieu d'attendre des mois de prospection (§4.4, §5.3).
7. **Architecture : aucun cadre parallèle.** Trois nouveaux services de la passerelle (`bce`, `bnb`, `fsma`) au même
   modèle à deux modes ; dépôt **signé** des réponses (§14 des contrats) ; scores, dédoublonnage et exclusions calculés
   par des **règles pures du plugin** (déterministes, testables), pas par le modèle de langage ; aucun envoi : la
   « prise de contact » est un brouillon plus une **écriture au CRM du client sous preuve d'approbation** de l'appel exact.

## 2. Sources par cible

### 2.1 Entreprises (B2B)

| Source | Contenu utile | Ce qu'elle ne contient pas | Accès, coût, licence | Preuve |
| --- | --- | --- | --- | --- |
| **BCE Open Data** (SPF Économie) | fichiers CSV de toutes les entités **actives** et unités d'établissement : dénominations, forme juridique, statut, date de début, adresses, activités NACE (versions 2008 et 2025, NACE-BEL), et un fichier de contacts déclarés (téléphone, courriel, site web) quand l'entité en a donné | aucun effectif, aucun chiffre financier, **aucun historique** (une entité radiée disparaît du fichier complet), pas de contacts nominatifs de dirigeants | gratuit après inscription et acceptation des conditions d'utilisation ; fichier complet + fichier de mises à jour ; téléchargement par le portail ou SFTP (demande par courriel). **Interdit : réutiliser des données à caractère personnel à des fins de marketing direct, y compris toute donnée d'une entité personne physique** | portail `kbopub.economie.fgov.be/kbo-open-data` lu le 15/10 (« Ces fichiers sont disponibles gratuitement ») ; la page du SPF Économie est derrière un CAPTCHA, contenu lu dans son extrait de recherche (fichiers complets et de mises à jour, interdiction de marketing direct sur les données personnelles) ; **probable** pour la fréquence quotidienne et la conservation de 31 jours (extrait de recherche officiel, recoupé par un dépôt public qui signale que le guide PDF dit encore « premier dimanche du mois ») ; structure des fichiers (`enterprise`, `establishment`, `denomination`, `address`, `activity`, `contact`, `code`, `meta`) **probable** (dépôts publics), à confirmer sur le guide officiel au lot P3 |
| **Centrale des bilans (BNB)**, services web | dépôts de comptes annuels depuis 1978, PDF depuis 1999, XBRL depuis 2007, **JSON depuis le 04/04/2022**, avec données d'identification, rubriques comptables (dont effectif et total du bilan) et actionnariat | petites entités non tenues au dépôt ; données avec un an ou plus de retard | « Authentic Data Query », « Authentic Data Extracts » et « Authentic Archive » **gratuits** ; « Improved Data » 3 300 € par an (inutile ici) ; souscription par formulaire, clé par produit, environnement de test gratuit sans formulaire | pages BNB lues le 15/10 (§11) ; quotas : **inconnus** |
| **Moniteur belge**, annexes des personnes morales | actes publiés (constitution, transfert de siège, nomination, modification de capital) | pas d'API officielle trouvée ; actes en images PDF | consultation web par numéro BCE | **inconnu** pour une réutilisation automatisée ; la date de début et l'adresse de la BCE couvrent déjà « création » et « déménagement » |
| **Sites web publics des entreprises** | métier réel, implantations, signaux (recrutement, nouveaux locaux) | rien de garanti | lecture par la route de lecture d'URL existante du plugin (protections SSRF, taille et délai bornés), une page à la fois, source citée ; aucune aspiration de masse | code existant (`plugin-atelier/src/serveur/lecture-url.ts`, `ssrf.ts`) |
| **Google Places** (commerces locaux) | existence, note, horaires d'un établissement | | payant au-delà du quota gratuit ; **seuls la latitude et la longitude peuvent être mises en cache, 30 jours au plus** ; contenu interdit sur une carte non Google ; mise en cache et export du contenu interdits par le contrat | conditions de service Google Maps Platform, §14, lues le 15/10. Conséquence : **vérification ponctuelle d'un prospect, jamais constitution d'un fichier** |
| **LinkedIn** | | | **aspiration interdite** : contrat d'utilisation en vigueur au 03/11/2025, §8.2 (logiciels, robots, extensions de navigateur ; copie via agrégateurs ; automatisation des contacts et messages). Sales Navigator : usage humain dans l'interface LinkedIn seulement | contrat lu le 15/10 |
| Fournisseurs d'enrichissement (Apollo, Lusha, Kaspr, Dropcontact, Hunter, Graydon/Creditsafe…) | voir `docs/prospection-outils-marche.md` | | payants ; leur base légale est celle du fournisseur, la licéité de **l'usage** (envoi d'un courriel nominatif) reste à la charge du client (§3.2) | APD, recommandation 01/2020, §61 à 67 : un acheteur de listes doit pouvoir montrer l'information des personnes et la source |

**Alignement avec `docs/prospection-outils-marche.md` (commit `c49bb90`).** Ses recommandations gratuites (BCE, extrait
OpenStreetMap, HubSpot gratuit) sont reprises (§6.1, lots P3 et P3b). Pour Hunter et Dropcontact, la règle du §3.2
s'applique : ils servent à **trouver ou vérifier l'adresse impersonnelle** d'une entreprise et à vérifier qu'un courriel
existe ; une adresse nominative qu'ils trouvent n'autorise **pas** un courriel sans consentement. Companyweb ou Trends Top
(bases belges payantes, issues de la BCE et de la BNB) relèvent du lot P19. L'outil d'envoi (lemlist, La Growth Machine
ou les séquences HubSpot) reste **hors de l'usine** : l'usine exporte au CRM ou à cet outil des prospects dont la base
légale par canal est déjà vérifiée, et c'est le client qui envoie. Lusha et l'extraction LinkedIn ou Google Maps sont
écartés dans les deux documents.

### 2.2 Particuliers (B2C)

Aucune source « à cibler ». Seules sources acceptables : la base de clients du client (§4), les personnes qui se
déclarent elles-mêmes (formulaires, événements, parrainage par lien), et les listes de partenaires dont le consentement
nomme le client ou sa catégorie et ses traitements (APD 01/2020, §64). Les signaux de vie (déménagement, naissance,
nouveau véhicule) ne sont exploitables que **déclarés par la personne** dans un formulaire qui dit à quoi ils servent.

### 2.3 Courtiers et partenaires

| Source | Contenu | Accès | Preuve |
| --- | --- | --- | --- |
| **Registre FSMA des intermédiaires** | intermédiaires d'assurance inscrits (catégorie, statut, numéro BCE), via le « Data portal » de la FSMA (« toutes les listes d'inscriptions, d'agréments et d'enregistrements ») | recherche par nom ou numéro BCE ; **format d'export en masse et conditions de réutilisation inconnus** (seule une liste particulière, intermédiaires britanniques, est publiée en XLSX) | `fsma.be/fr/data-portal` et `fsma.be/en/intermediary-insurance` lus le 15/10 ; cadre général : loi du 25 décembre 2023 sur les données ouvertes et la réutilisation des informations du secteur public |
| **Fédérations** : Feprabel (courtiers, francophone), FVF (courtiers, néerlandophone, membre du BIPAR), Assuralia (entreprises d'assurance) | annuaires de membres (publics ou non selon la fédération) | partenariat et événements plutôt qu'extraction | page FSMA de Feprabel Courtage et publication FVF lues le 15/10 |

Croisement utile : registre FSMA × BCE (taille, zone, NACE 66.22 « activités des agents et courtiers d'assurances »)
× BNB (effectif). Contact : comme le B2B ; beaucoup de courtiers sont des personnes physiques, et la BCE interdit alors
toute réutilisation de leurs données à des fins de marketing direct : pour eux, **seul le registre FSMA** sert de source,
et le premier contact passe par le canal professionnel impersonnel ou par la fédération (règle à faire confirmer : juriste).

## 3. Cadre légal, canal par canal

### 3.1 Textes lus

- **RGPD** : prospection = intérêt légitime possible (considérant 47) avec mise en balance, information (art. 13 et 14),
  droit d'opposition absolu (art. 21.3), profilage à annoncer.
- **ePrivacy, art. 13** et **arrêté royal du 4 avril 2003** (pris en exécution de l'art. 14 de la loi du 11 mars 2003,
  dispositions reprises au Code de droit économique, livre XII, art. XII.13 : **probable**, numéro d'article à confirmer
  par le juriste) : publicité par courrier électronique (SMS compris, « tout message sous forme de texte… ») interdite sans
  consentement préalable, sauf (1°) clients existants pour des produits analogues du même prestataire, opposition offerte
  à la collecte et à chaque message, coordonnées non transmises à un tiers (une société sœur est un tiers), et
  (2°) **personnes morales sur des coordonnées impersonnelles** ; art. 2 : liste d'opposition propre au prestataire.
- **APD, recommandation 01/2020** (marketing direct) : acheteurs et loueurs de listes (§61 à 67), intégrer et mettre à
  jour la liste « Ne m'appelez plus » (§127), exemple d'un assureur sanctionné pour profils achetés sans connaître leur
  origine (§100 et suivants).
- **Liste « Ne m'appelez plus »** : gérée par l'ASBL DNCM depuis le 28/06/2015 ; dédoublonnage **obligatoire** des
  fichiers d'appels, consommateurs **et entreprises** inscrits ; licence payante (prix non publié sur la page lue).
  Réforme vers un opt-in téléphonique : proposition de loi déposée (Chambre, doc 56 0559), avis de l'APD, mais au
  19/03/2026 « le dispositif concret n'est donc pas encore décidé » ; **statut au 15/10/2026 : non adopté selon les
  sources trouvées, à revérifier avant tout lancement téléphonique**.
- **Directive (UE) 2016/97 (IDD), art. 2, §2, c) et d)** : ne sont pas de la distribution d'assurance « la simple
  fourniture de données et d'informations sur des preneurs potentiels » à un assureur ou intermédiaire, ni la simple
  information sur des produits, **si le fournisseur ne prend aucune mesure supplémentaire pour aider à conclure** un
  contrat. Transposée en droit belge par la loi du 4 avril 2014 relative aux assurances (article exact : juriste).
- **Publicité assurance** : arrêté royal du 25 avril 2014 (information et publicité pour les produits financiers aux
  clients de détail, appliqué aux produits d'assurance concernés) : avantages jamais mis en avant sans les risques et
  conditions, dans une police au moins aussi lisible. Champ exact (non-vie comprise ou non) : juriste du client.

### 3.2 Matrice canal × cible (règle appliquée par la garde serveur, §6.5)

| Canal | Entreprise (adresse impersonnelle) | Salarié ou dirigeant nommé | Courtier personne physique | Particulier prospect | Client existant |
| --- | --- | --- | --- | --- | --- |
| Courriel, SMS | permis sans consentement (AR 2003, 1er, 2°) + opposition à chaque message | **consentement préalable** | consentement préalable | **consentement préalable** | permis pour produits analogues du même assureur si les conditions du 1° sont réunies, sinon consentement |
| Téléphone | permis hors « Ne m'appelez plus » | permis hors liste, intérêt légitime documenté | idem | permis hors liste, intérêt légitime documenté (et réforme à surveiller) | idem |
| Courrier postal | intérêt légitime, opposition | intérêt légitime, opposition | idem | intérêt légitime, source licite de l'adresse exigée | intérêt légitime |
| Publicité ciblée par zone ou intérêt | campagne, pas de fichier nominatif | | | idem (règles de la plateforme publicitaire à vérifier pour les produits financiers : **inconnu**) | audiences de clients : consentement ou base à faire valider (juriste) |

Toute ligne exige : base légale enregistrée **par prospect et par canal**, source de la donnée, information art. 14
dans le premier message, et vérification de la liste d'opposition (propre au client + DNCM pour le téléphone).

### 3.3 B2C : canaux réellement faisables, par ordre d'intérêt

1. **Base de clients existante** (§4) : ventes croisées et montées en gamme ; c'est le gisement principal.
2. **Prospects entrants** : pages et formulaires avec consentement granulaire (déjà dans le périmètre des rôles SEA,
   Contenus et CRM) ; la prospection se limite alors à qualifier et à prioriser.
3. **Publicité géolocalisée et par intérêt** (Google Ads, Meta) sous les plafonds de dépense existants (§12 des contrats).
4. **Partenaires avec consentement** (agences immobilières, garages, notaires) : consentement qui nomme l'assureur ;
   contrat entre responsables du traitement.
5. **Parrainage par lien** : le client partage un lien ; l'usine ne collecte jamais les coordonnées d'un filleul.
6. **Événements** : collecte sur place avec consentement.
7. **Listes louées « opt-in »** : en dernier, seulement si le loueur prouve un consentement qui couvre l'assureur et
   l'usage (APD §64 à 67) ; preuve jointe à l'import.

### 3.4 Ce que l'usine ne fait pas, pour rester hors distribution d'assurance

Aucun conseil personnalisé, aucune comparaison de garanties pour un prospect donné, aucun devis, aucune aide à la
souscription. Les messages préparés présentent le client et proposent un rendez-vous avec lui. Les consignes du rôle
Prospection (§6.2) et la garde de la porte (mots interdits par exigence) le traduisent.

## 4. Base de données clients de l'entreprise (demande de l'opérateur du 15/10/2026)

### 4.1 Ajout en un geste

| Voie | Conception | Statut |
| --- | --- | --- |
| **CSV** | réutilise `analyserImport` / `analyserCsv` (`plugin-atelier/src/serveur/imports.ts` : taille, extension, encodage, formules neutralisées, injections signalées) ; nouvel écran de **correspondance des colonnes** (identifiant, nom, entreprise, numéro BCE, courriel, téléphone, code postal, commune, produits détenus, date de début du contrat, statut, consentements) avec aperçu de 20 lignes, types validés par Zod, rejet ligne par ligne expliqué | réutilise du code prouvé |
| **XLSX** | même écran après conversion de la **première feuille** en lignes ; refus des fichiers à macros (`.xlsm`) et des formules évaluées. Bibliothèque : le paquet npm `xlsx` 0.18.5 est **vulnérable** (CVE-2023-30533 pollution de prototype, corrigée en 0.19.3 ; CVE-2024-22363 ReDoS, corrigée en 0.20.2) et le npm n'est plus mis à jour, les versions corrigées sont sur `cdn.sheetjs.com` ; `exceljs` 4.4.0 date du 19/10/2023. **Choix à faire par l'opérateur** (§10), revue `securite` obligatoire | à décider |
| **Synchronisation CRM** (HubSpot, Pipedrive, Odoo, Teamleader) | l'agent CRM appelle les outils de lecture déjà exposés (`crm_contacts`, `crm_transactions`, `pipedrive_personnes`, `pipedrive_affaires`, `odoo_leads_search_read`, `teamleader_contacts`, `teamleader_deals`) et **dépose la réponse brute signée** (`aev1`, §14) ; le plugin la vérifie puis l'intègre. Aucune nouvelle voie de confiance | réutilise le mécanisme prouvé ; pagination à ajouter côté passerelle |
| **Base SQL du client en lecture seule** (option) | nouveau service `base-client` de la passerelle, mode réel seulement. Le client crée **une vue** (`atelier_clients`) et **un compte limité à `SELECT` sur cette vue** ; la passerelle n'exécute **jamais de SQL écrit par un agent** : un seul outil `base_client_lire(page, depuis)` avec requête fixe, TLS exigé, délai de requête et nombre de lignes bornés, transaction en lecture seule, adresse publique vérifiée comme pour Odoo (`reseau-sur.ts`), secrets chiffrés comme les secrets sociaux. Pilotes : `pg` 8.23.1, `mysql2` 3.24.6, `mssql` 12.7.9 (versions npm du 15/10) | faisable, **revue `securite` avant tout usage** |

Risques de la voie SQL : exposition d'un port de base de données (préférer une réplique ou un export planifié) ; un compte
trop large côté client (la vue et le compte sont **sa** responsabilité, la procédure lui est fournie) ; charge sur une base
de production (lecture paginée, la nuit) ; fuite de secret (chiffrement, journal sans valeur). L'import CSV planifié par
le client couvre le même besoin avec moins de risques : à proposer d'abord.

### 4.2 Usages en prospection

- **Exclusion des clients actuels** des listes de prospects : par numéro BCE pour les entreprises, sinon par empreinte
  normalisée (courriel en minuscules, téléphone E.164, nom + code postal).
- **Dédoublonnage** : même empreintes, fusion avec traçabilité (aucune donnée écrasée sans journal).
- **Ventes croisées et montées en gamme** : table « produits détenus × produits possibles » fournie par le client (par
  exemple auto sans habitation) ; une règle pure liste les manques. Canal : client existant (§3.2), produits analogues
  du même assureur seulement, sinon consentement.
- **Ressemblance aux meilleurs clients** (entreprises) : profil des clients B2B par NACE (2 chiffres), tranche d'effectif
  (BNB), forme juridique et zone ; les prospects BCE qui partagent ces caractéristiques gagnent des points expliqués
  (« même secteur et même tranche que 14 de vos 40 meilleurs clients »). Aucun modèle opaque.
- **Étalonnage** (§5.3) : l'historique CRM (affaires gagnées **et perdues**, avec dates) donne les issues réelles ; la
  base de clients seule ne donne que des succès, elle ne suffit pas à mesurer un taux.

### 4.3 Cadre RGPD de la base clients

| Point | Règle de conception |
| --- | --- |
| Finalité | « prospection de clients existants et de prospects ressemblants, étalonnage du score » ; inscrite dans la fiche de l'import, affichée |
| Base légale | intérêt légitime pour les clients existants (attentes raisonnables, produits analogues), limitée par l'ePrivacy pour courriel et SMS (§3.2) ; mise en balance documentée par le client |
| Minimisation | champs de la correspondance seulement ; aucune donnée de santé, de sinistre ni bancaire (refus à l'import si une colonne y ressemble, sur liste de noms) ; les agents ne reçoivent que des agrégats et des identifiants pseudonymes, jamais la base entière |
| Conservation | durée choisie par le client à l'import (défaut proposé : 12 mois sans nouvel import), purge automatique, suppression sur demande |
| Opposition | liste d'opposition par entreprise (désinscriptions, art. 21.3) vérifiée **côté serveur** avant toute préparation de contact ; une opposition est supprimée avec l'entreprise et ne survit que dans l'export fait avant la suppression (empreinte seule) |
| Isolement | tout est rattaché à `company_id` (comme toutes les tables du plugin) ; aucune requête sans entreprise |
| Chiffrement | identifiants directs (nom, courriel, téléphone, adresse) chiffrés au niveau applicatif (AES-256-GCM) avec une clé référencée par un secret natif de Paperclip, comme `approbationClePrivee` ; empreintes HMAC pour dédoublonner sans déchiffrer |
| Stockage | schéma du plugin dans le PostgreSQL de Paperclip ; **aucun fichier suivi par git** ; le fichier importé n'est pas conservé (empreinte et nombre de lignes seulement) |
| Suppression | « Supprimer la base clients » (humain seulement), journalisée ; la suppression d'entreprise existante (patch du socle) emporte tout |

### 4.4 Démonstration

Base de clients **fictive tirée du modèle de démonstration existant** (`passerelle/src/demo/modele/`) : les contacts CRM
dont la transaction est « gagnée » deviennent les clients de « Rénovation Liège (démonstration) », avec leurs services
(toiture, murs, châssis, ventilation), leur établissement, leurs dates et les coordonnées fictives déjà contrôlées
(`@exemple.invalid`, `+32 4 000 …`). Les ventes croisées démontrées sont du type « toiture sans châssis ». Les transactions
perdues fournissent les échecs : l'étalonnage est démontrable. Fichiers CSV et XLSX produits à la demande par un
générateur, jamais versionnés avec des données réelles.

## 5. Qualification et score

### 5.1 Signaux par cible (tous issus de sources légales)

- **Entreprise** : secteur (NACE) croisé avec la table « risques assurables par secteur » **fournie par le client**
  (l'usine ne l'invente pas) ; taille (effectif et total du bilan BNB, sinon « inconnue ») ; âge (date de début BCE) ;
  signaux récents tirés des mises à jour quotidiennes BCE (création, nouvel établissement, changement d'adresse,
  changement de forme) ; comptes annuels récents (croissance de l'effectif d'un exercice à l'autre) ; zone (commune,
  arrondissement, région) ; ressemblance aux meilleurs clients (§4.2) ; site web joignable et activité confirmée.
- **Particulier** : uniquement des faits déclarés et consentis (formulaire, événement), produits détenus s'il est client.
- **Courtier** : catégorie et statut FSMA, zone, taille (BNB), ancienneté.

### 5.2 Score expliqué (avant étalonnage)

Somme de points par critère, chaque critère affiché avec sa valeur, sa source et sa date, les poids fixés par le client
dans les réglages et journalisés. Affichage : « Score 72/100 (estimation, non étalonnée) ». Les critères bloquants ne
donnent pas de points, ils **excluent** (§5.4). Le score sert à trier et prioriser ; il ne sert **jamais** à fixer un prix,
une éligibilité ou une condition (RGPD art. 22 et exemple de l'APD sur l'assureur, §3.1).

### 5.3 Étalonnage et marge

- Données : prospects déjà présentés avec leur issue (converti ou non, à une date de fin d'observation fixée, par
  exemple 90 jours), venant de l'historique CRM et des prospects de l'usine.
- Méthode : régression logistique à deux paramètres sur le score (méthode de Platt, adaptée aux petits échantillons) ;
  régression isotonique seulement au-delà d'environ 1 000 exemples (recommandation de scikit-learn). Ajustement sur des
  données **séparées** de celles qui ont servi à fixer les poids (validation croisée ou découpage dans le temps).
- Mesure : diagramme de fiabilité (taux observé par tranche de score), score de Brier, et **intervalle de Wilson à 95 %**
  par tranche, affiché comme marge (« 18 % de conversion, entre 12 % et 26 % »).
- Seuil d'affichage d'une probabilité : choix de prudence de conception (pas une norme) : au moins 300 prospects
  observés **et** 30 conversions dans le segment ; sinon l'affichage reste « estimation ». Réétalonnage à chaque nouvel
  import d'issues ; date et effectif de l'étalonnage toujours affichés.
- Jamais « certitude » ni « taux exact » : le libellé le plus fort est « probabilité étalonnée sur N prospects ».

### 5.4 Faux leads : exclusions automatiques (règles pures)

Doublon (empreintes §4.2) ; numéro BCE invalide (contrôle modulo 97) ou absent du fichier actif (radiée, cessée) ;
entité personne physique (interdite par les conditions BCE) ; hors zone choisie ; courriel de syntaxe invalide ou nominatif
sans consentement pour le canal courriel ; téléphone non E.164 belge ; inscrit à la liste d'opposition du client ou, pour le
téléphone, à la liste DNCM ; client actuel ; adresse de démonstration dans une campagne réelle (garde existante, §13).

## 6. Intégration dans l'usine (sans réinventer Paperclip)

### 6.1 Nouveaux services de la passerelle (même modèle à deux modes)

| Service | Outils (lecture seule, `readOnlyHint`) | Réel | Démonstration |
| --- | --- | --- | --- |
| `bce` | `bce_rechercher(nace[], communes[] ou codes postaux[] ou région, formes[], creees_depuis, page)`, `bce_entreprise(numero)`, `bce_changements(depuis, zone, nace)` | index local construit par un script à partir du fichier BCE (SQLite par `better-sqlite3` 13.0.3 ; mises à jour quotidiennes appliquées) ; **entités personnes physiques et fichier `contact` des personnes physiques jamais chargés** | entreprises fictives de Liège (§7) |
| `bnb` | `bnb_comptes(numero)` (derniers dépôts : effectif, total du bilan, exercice) | Authentic Data Query (clé gratuite, formulaire BNB) | comptes fictifs cohérents |
| `fsma` | `fsma_intermediaire(numero ou nom)`, `fsma_rechercher(categorie, zone)` | selon le format obtenu de la FSMA (**inconnu**) | registre fictif |
| `osm` (commerces locaux, recommandé par `docs/prospection-outils-marche.md`) | `osm_commerces(zone, categories[])` | extrait Geofabrik de la Belgique chargé localement (licence ODbL d'OpenStreetMap : attribution, à relire au lot) ; rapproché de la BCE par nom et adresse | commerces fictifs des mêmes communes |
| `base-client` (option, §4.1) | `base_client_lire(page, depuis)` | vue SQL du client | aucun (mode réel seulement) |

Chaque réponse porte l'enveloppe `_atelier` signée ; les empreintes de démonstration (§7) s'ajoutent à
`EMPREINTES_DEMONSTRATION`. Aucune passerelle d'enrichissement payant dans les premiers lots : un service
`enrichissement` éventuel suivra la décision sur `docs/prospection-outils-marche.md`.

### 6.2 Rôle d'agent

Nouveau rôle **« Prospection »** (`prospection`, rôle Paperclip `researcher`), distinct du rôle CRM : il recherche et
qualifie, il n'écrit pas au CRM. Connexions : `bce`, `bnb`, `fsma` en lecture. Compétences nouvelles :
`recherche-prospects` (requêtes par secteur et zone, dépôt signé de chaque réponse), `qualification-prospects` (lecture
de site par la route du plugin, justification sourcée, aucun chiffre inventé, aucun conseil d'assurance) ; reprend
`recherche-sourcee`. Le rôle **CRM conversion** garde l'écriture au CRM sur accord et gagne la synchronisation de la base
clients (§4.1).

### 6.3 Contrats (nouvelle version 1.6, ajouts compatibles, migration `007`)

- `Prospect` : `id`, `companyId`, `campagneId`, `cible` (`entreprise | particulier | courtier`), `identifiant` (BCE ou
  empreinte), `donnees` (chiffrées pour les identifiants directs), `sources[]` (dépôt signé, URL, date), `mode`
  (déduit, jamais déclaré), `statut` (`nouveau | exclu | qualifie | exporte | refuse`), `motifsExclusion[]`.
- `ScoreProspect` : `valeur`, `criteres[]` (nom, valeur, points, source, date), `version` des poids, `etalonnage`
  (`null` ou `{ probabilite, borneBasse, borneHaute, effectif, conversions, date, methode }`), `libelle`
  (`estimation | probabilite_etalonnee`).
- `BaseLegaleContact` : par prospect **et par canal** : `canal`, `base` (`consentement | interet_legitime |
  client_existant_produits_analogues | personne_morale_adresse_impersonnelle`), `preuve` (référence du consentement, de la
  source ou de la mise en balance), `information` (texte art. 14 prévu), `verifieLe`.
- `Opposition` : empreinte, canal, date, origine ; `ListeDncm` : date de la version chargée.
- `BaseClients` : import (empreinte, lignes, correspondance, finalité, durée), clients (chiffrés), produits détenus,
  issues (gagné, perdu, date).
- Routes : `prospects.deposer` (réponse brute signée, comme `tache.donnees.deposer`), `prospects.lister` (filtres
  secteur, zone, score, statut), `prospects.exclure`, `base-clients.importer`, `base-clients.supprimer` (humain),
  `etalonnage.calculer` (humain), `oppositions.ajouter`.

### 6.4 Interface : rubrique « Prospects »

Filtres secteur (NACE, libellés français) et zone (commune, arrondissement, région, pays) ; colonnes score, libellé
« estimation » ou « probabilité étalonnée », base légale par canal, motifs d'exclusion ; fiche du prospect avec le détail
des points et les sources ; panneau Étalonnage (diagramme de fiabilité, Brier, effectif, date) ; « Exporter vers le
CRM » qui crée une demande de diffusion `exporter_crm`. Passage Impeccable obligatoire (règle 7 de l'opérateur).

### 6.5 Gardes serveur

- **Aucun contact sortant par l'usine** : pas d'outil d'envoi de courriel ou de SMS. L'export vers le CRM est une
  diffusion réelle ordinaire : approbation humaine de l'appel exact, preuve signée `apv1`, idempotence et
  réconciliation existantes (§14). Nouveaux outils d'écriture de la passerelle (`crm_creer_contact`,
  `pipedrive_creer_personne`, `teamleader_creer_contact`, `odoo_ecrire_lead` existe déjà) ajoutés à la table
  action ↔ outil du plugin.
- `verifierDiffusion` refuse l'export d'un prospect sans `BaseLegaleContact` pour le canal prévu, inscrit à une
  opposition, client actuel, exclu, ou vérifié DNCM depuis plus de 30 jours pour un canal téléphone (durée à fixer par l'opérateur).
- La porte refuse un message de prise de contact qui contient un conseil ou une comparaison de garanties (liste de
  mots par exigence) ou qui omet l'information art. 14 et le moyen d'opposition.

## 7. Démonstration réaliste

Entreprises fictives déjà présentes : « Rénovation Liège (démonstration) » (le client de démonstration), « Toits
Mosans » et « Isolpro Liège » (concurrents fictifs, `organisation/demo/sources/`, retiré le 16/10/2026). Le simulateur `bce` les complète par une
cinquantaine d'entreprises fictives générées par le modèle déterministe (graine SHA-256 existante), sur les communes
déjà utilisées (Liège, Outremeuse, Ans, Herstal hors zone), avec de vrais codes NACE et formes juridiques mais :
- numéros BCE **à chiffre de contrôle volontairement faux**, donc impossibles pour une entreprise réelle, reconnus comme
  empreintes de démonstration ;
- domaines `.example`, courriels `@exemple.invalid`, téléphones `+32 4 000 …` ;
- pièges utiles : une entreprise radiée, un doublon, une personne physique (doit être rejetée), une entreprise hors zone,
  un courriel nominatif (doit être refusé pour le canal courriel), un prospect déjà client.
Aucune vraie entreprise, aucune vraie personne. Le registre FSMA et les comptes BNB fictifs suivent les mêmes règles.

## 8. Ce que l'opérateur ou le client doit faire

| Démarche | Qui | Coût |
| --- | --- | --- |
| Inscription BCE Open Data, acceptation des conditions | opérateur | gratuit |
| Souscription BNB « Authentic Data Query » (formulaire) | opérateur | gratuit |
| Demande à la FSMA : export du registre et conditions de réutilisation | opérateur | gratuit (réponse inconnue) |
| Licence DNCM (avant tout appel) | client | payant, prix non publié |
| Table « risques assurables par secteur », poids du score, produits analogues | client | interne |
| Mise en balance de l'intérêt légitime, information art. 14, registre des traitements, DPO consulté | client | interne |
| Vue SQL et compte en lecture seule (si option SQL) | DBA du client | interne |
| Fournisseurs d'enrichissement (si décidé) | client | payant (`docs/prospection-outils-marche.md`) |

## 9. Impossible ou trop risqué

- **Taux « exact »** : impossible par nature ; probabilité étalonnée avec marge seulement.
- **Aspirer LinkedIn** ou automatiser Sales Navigator : interdit par le contrat (§8.2) ; risque de bannissement et de
  litige.
- **Courriel ou SMS à froid à un particulier**, ou à l'adresse nominative d'un salarié, sans consentement : illégal
  (AR 2003).
- **Données BCE d'entités personnes physiques** (indépendants) pour la prospection : interdit par les conditions BCE.
- **Constituer un fichier depuis Google Places** : interdit (mise en cache et export).
- **Acheter des « signaux de vie »** de particuliers ou des profils d'origine inconnue : APD 01/2020 (assureur
  sanctionné dans son exemple) ; trop risqué même si le vendeur affirme la conformité.
- **Conseiller ou comparer pour un prospect** : ce serait de la distribution d'assurance (IDD art. 2).
- **Score utilisé pour tarifer ou refuser** : décision automatisée (RGPD art. 22) : exclu par conception.

## 10. Plan de lots

Règles : un lot = 30 à 60 min ; aucun fichier partagé entre deux lots ; les fichiers partagés du plugin (`services.ts`,
`routes.ts`, `base.ts`, `contrats/index.ts`, `ui.ts`) appartiennent au lot d'intégration ; modèle et effort de départ selon
l'escalier de l'opérateur (Sonnet `medium` pour le code bien spécifié, Opus `medium` pour le jugement), un cran de plus seulement si
le rendu est insuffisant ; toute suite longue en arrière-plan, journal lu une fois ; au plus 3 lots en parallèle.

**Vague 1 : démonstration et réel sans compte payant (données ouvertes, base clients CSV)**

| Lot | Contenu | Fichiers (exclusifs) | Modèle, effort | Tests d'acceptation |
| --- | --- | --- | --- | --- |
| **P1** Contrats | schémas Zod `Prospect`, `ScoreProspect`, `BaseLegaleContact`, `Opposition`, `BaseClients` ; migration | `plugin-atelier/src/contrats/prospection.ts`, `plugin-atelier/migrations/007_prospection.sql`, `plugin-atelier/tests/contrats-prospection.spec.ts` | Opus, `medium` | exemples valides et invalides ; `mode` refusé en entrée ; base légale exigée par canal ; migration rejouée sur base vierge |
| **P2** Simulateur `bce` + `bnb` + `fsma` | entreprises fictives (§7), formes calquées sur les fichiers réels, empreintes de démonstration | `passerelle/src/demo/prospection/*.ts`, `passerelle/tests/prospection-demo/*.test.ts` | Sonnet, `medium` | déterminisme (mêmes octets) ; 100 % des numéros BCE à contrôle faux ; aucun domaine, courriel ou téléphone hors liste blanche (même test que le modèle) ; pièges présents |
| **P3** `bce` réel | script d'import du fichier complet et des mises à jour dans SQLite ; outils de recherche ; exclusion des personnes physiques au chargement | `passerelle/src/reel/bce/*.ts`, `scripts/bce/importer.mjs`, `passerelle/tests/reel-bce/*.test.ts` | Sonnet, `medium` | jeu réduit au format officiel (vérifié sur le guide BCE au début du lot) ; aucune ligne de personne physique dans l'index (test) ; mise à jour appliquée deux fois = même état ; **en direct après inscription** : recherche NACE × commune sur le vrai fichier |
| **P3b** `osm` réel et démonstration | import de l'extrait Geofabrik (commerces par catégorie et commune), rapprochement avec la BCE | `passerelle/src/reel/osm/*.ts`, `passerelle/src/demo/prospection-osm.ts`, `scripts/osm/importer.mjs`, `passerelle/tests/osm/*.test.ts` | Sonnet, `medium` | licence relue et attribution affichée ; rapprochement BCE mesuré sur un jeu réduit ; démonstration sans vraie enseigne |
| **P4** `bnb` réel | client Authentic Data Query (JSON), effectif et total du bilan | `passerelle/src/reel/bnb/*.ts`, `passerelle/tests/reel-bnb/*.test.ts` | Sonnet, `medium` | réponses enregistrées de l'environnement de test BNB ; erreurs sans réessai aveugle ; en direct après souscription |
| **P5** Règles de prospection | validation (modulo 97, E.164, courriel, impersonnel), dédoublonnage, exclusions §5.4, matrice §3.2 | `plugin-atelier/src/serveur/regles-prospection.ts`, `plugin-atelier/tests/regles-prospection.spec.ts` | Opus, `medium` (règle légale) | un cas par case de la matrice ; mutation d'une règle = échec attendu |
| **P6** Score et étalonnage | points expliqués ; Platt, Brier, Wilson, seuils §5.3 | `plugin-atelier/src/serveur/score-prospects.ts`, `plugin-atelier/src/serveur/etalonnage.ts`, `plugin-atelier/tests/score-etalonnage.spec.ts` | Opus, `medium` | valeurs identiques (à 1e-6) à scikit-learn sur un jeu de référence figé ; sous le seuil = « estimation » ; aucune sortie « certitude » |
| **P7** Base clients CSV | correspondance des colonnes, validation, refus des colonnes sensibles, chiffrement et empreintes HMAC, purge | `plugin-atelier/src/serveur/base-clients.ts`, `plugin-atelier/tests/base-clients.spec.ts` | Sonnet, `medium` | réutilise `analyserImport` sans le modifier ; aucune valeur en clair en base (test SQL) ; isolement entre deux entreprises ; suppression totale |
| **P8** Base clients de démonstration | générateur CSV et XLSX à partir du modèle (gagnés et perdus) | `passerelle/src/demo/prospection/base-clients.ts`, `scripts/demo/generer-base-clients.mjs` (retiré le 16/10/2026 ; jeu figé dans `plugin-atelier/tests/fixtures/base-clients/`), `passerelle/tests/prospection-demo/base-clients.test.ts` | Sonnet, `medium` | cohérence avec `crm_transactions` ; coordonnées fictives seulement ; même graine = même fichier |
| **P9** Intégration plugin | routes, services, SQL, gardes de diffusion `exporter_crm`, santé (`bce`, `bnb`, `fsma`) | `plugin-atelier/src/serveur/services.ts`, `routes.ts`, `base.ts`, `contrats/index.ts`, `regles-diffusion.ts`, tests associés | Opus, `medium` | dépôt non signé refusé ; export sans base légale ou avec opposition refusé (403) ; scénario sans approbation = rien ne part |
| **P10** Rôle et compétences | rôle `prospection`, deux compétences, connexions réservées, régénération | `organisation/registre/agents.json`, `organisation/agents/prospection/`, `organisation/skills/recherche-prospects/`, `organisation/skills/qualification-prospects/` | Opus, `medium` | `bootstrap-organisation.py generer` sans écart ; `verifier-config.sh` vert ; consignes : aucun conseil d'assurance, dépôt de chaque réponse |
| **P11** Interface « Prospects » | rubrique, filtres, fiche, étalonnage, import guidé | `plugin-atelier/src/ui/prospects.tsx`, `plugin-atelier/src/ui/base-clients.tsx`, `plugin-atelier/tests/ui/prospects.test.tsx` | Sonnet, `medium` + Impeccable | Playwright : filtre secteur × zone, libellé « estimation » visible, import CSV de démonstration en un geste |
| **P12** Scénario de bout en bout | campagne de prospection de démonstration : recherche, qualification, exclusions, étalonnage, export simulé | `scripts/scenarios/atelier_prospection.py` | Opus, `medium` | rejoué deux fois à l'identique ; tous les pièges rejetés ; aucun appel sortant hors boucle locale |

Dépendances : P1 → P5, P6, P7 → P9 → P11, P12 ; P2 → P3, P3b, P4, P8 ; P10 après P9.

**Vague 2 : connexions du client**

| Lot | Contenu | Fichiers | Modèle, effort | Tests |
| --- | --- | --- | --- | --- |
| **P13** Synchronisation CRM | pagination des outils de lecture, intégration des dépôts signés à la base clients, issues gagné et perdu | `passerelle/src/reel/social-crm/pagination.ts`, `plugin-atelier/src/serveur/base-clients-crm.ts`, tests | Sonnet, `medium` | faux serveurs CRM existants ; 3 pages = 3 dépôts vérifiés ; rejeu sans doublon |
| **P14** Écriture des prospects au CRM | outils `*_creer_*` sous preuve `apv1` | `passerelle/src/reel/social-crm/creation.ts`, tests ; table action ↔ outil dans `preuve-approbation.ts` (lot à part) | Opus, `medium` | sans preuve = préparée ; idempotence ; réconciliation |
| **P15** FSMA réel | selon le format obtenu de la FSMA (commence par l'établir) | `passerelle/src/reel/fsma/*.ts`, tests | Opus, `medium` | conditions de réutilisation consignées avant tout code |
| **P16** Import XLSX | selon la bibliothèque décidée | `plugin-atelier/src/serveur/import-xlsx.ts`, tests | Sonnet, `medium` | `.xlsm` refusé ; fichier piégé (formules, feuille cachée) neutralisé ; revue `securite` |

**Vague 3 : options à risque, après revue `securite`** : P17 base SQL en lecture seule (`passerelle/src/reel/base-client/`),
P18 vérification ponctuelle Google Places (clé payante), P19 enrichissement payant (selon `docs/prospection-outils-marche.md`).

## 11. À décider par l'opérateur

1. Valider l'interprétation stricte du courriel B2B (adresse impersonnelle seulement sans consentement) et la faire
   confirmer par le juriste du client.
2. Faire les démarches gratuites : inscription BCE, souscription BNB, question écrite à la FSMA.
3. Bibliothèque XLSX : SheetJS CE depuis son CDN officiel (versions corrigées, hors npm) ou `exceljs` (inactif depuis
   10/2023), ou CSV seul au début.
4. Option SQL en lecture seule : oui ou non (recommandation : CSV planifié d'abord).
5. Seuils d'affichage d'une probabilité (300 prospects et 30 conversions proposés) et durée de validité de la
   vérification DNCM (30 jours proposés).
6. Démonstration : garder « Rénovation Liège (démonstration) » comme client fictif (choix de ce document, conforme à la
   consigne) ou ajouter une seconde entreprise fictive de type assureur pour des ventes croisées d'assurance.
7. Téléphone : attendre l'issue de la réforme opt-in avant de préparer des listes d'appel.

## 12. Sources consultées le 15/10/2026

Projet (local) : `REPRISE.md`, `docs/architecture.md`, `docs/connecteurs-conception.md`, `docs/passerelle.md`,
`docs/contrats.md` (§9, §12 à §14), `organisation/registre/agents.json`, `organisation/demo/` (retiré le 16/10/2026),
`passerelle/src/demo/modele/referentiel.ts`, `plugin-atelier/src/serveur/imports.ts`.

En ligne :
- https://kbopub.economie.fgov.be/kbo-open-data/login?lang=fr
- https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/public-data-available-reuse/cbe-open-data (CAPTCHA : lue par extrait de recherche)
- https://github.com/JB-Analytica/kbo-open-data (source secondaire : structure, NACE 2025, fréquence, art. 2.1 et 2.2 des conditions)
- https://nbb.be/en/consultation-data-0
- https://www.nbb.be/en/central-balance-sheet-office/consultation/web-services/authentic-data-query
- https://www.nbb.be/en/central-balance-sheet-office/consultation/web-services/order-form-cbso-webservices (extrait de recherche : gratuité, Improved Data 3 300 €)
- https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/be_fr
- https://www.ejustice.just.fgov.be/cgi/article_body.pl?language=fr&caller=summary&pub_date=2003-05-28&numac=2003011238 (arrêté royal du 4 avril 2003)
- https://www.autoriteprotectiondonnees.be/publications/recommandation-n-01-2020.pdf
- https://www.autoriteprotectiondonnees.be/publications/avis-n0-02-2026.pdf (extrait de recherche)
- https://www.dncm.be/fr
- https://www.lachambre.be/FLWB/PDF/56/0559/56K0559001.pdf (proposition de loi opt-in, extrait de recherche)
- https://www.customercontact.be/fr/actualites/media-detail/2026/03/19/vers-la-fin-de-l-opt-out-en-telemarketing-des-2026
- https://www.legislation.gov.uk/eudr/2016/97/article/2/data.htm?view=plain (texte de l'art. 2 de la directive 2016/97 ; version officielle : https://eur-lex.europa.eu/eli/dir/2016/97/oj/fra)
- https://www.fsma.be/fr/data-portal
- https://www.fsma.be/en/intermediary-insurance
- https://www.fsma.be/en/party/feprabel-courtage
- https://fvf.foleon.com/vrijuit/vrijuit-1-2023/dubbelinterview-met-chairman-en-ceo
- https://www.fsma.be/sites/default/files/legacy/content/consultaties/FR/2017-07-17_notedeconsultation.pdf (AR du 25 avril 2014, publicité, extrait de recherche)
- https://cloud.google.com/maps-platform/terms/maps-service-terms (§14 Places API)
- https://www.linkedin.com/legal/user-agreement (§8.2)
- https://scikit-learn.org/stable/modules/calibration.html
- https://cdn.sheetjs.com/advisories/CVE-2023-30533.html et https://vulert.com/vuln-db/npm/xlsx (vulnérabilités du paquet npm `xlsx`)
- Registre npm (`npm view`, 15/10) : `xlsx` 0.18.5, `exceljs` 4.4.0 (19/10/2023), `better-sqlite3` 13.0.3, `pg` 8.23.1, `mysql2` 3.24.6, `mssql` 12.7.9

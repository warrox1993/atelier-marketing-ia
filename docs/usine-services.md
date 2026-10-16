# L'usine d'agents : les 28 services

Document de référence pour l'installateur et pour le client. Il décrit comment l'Atelier organise ses agents en services,
qui peut parler à qui, quelles compétences existent et comment doter un client de ces services.
Les chiffres (28 services, 118 flux, 100 compétences) sont recalculés depuis `organisation/registre/services.json`,
`organisation/services/*/agents/*/AGENTS.md`, `organisation/agents/*/AGENTS.md` et `organisation/skills/*/SKILL.md`
(registre version 1.0.0 du 16/10/2026).

## 1. Principe

- **Un service est une entreprise Paperclip.** Chez un client, chaque service est une entreprise distincte de l'instance,
  avec ses propres agents, ses tâches, son budget et ses connaissances. Le registre en compte 28, dont le marketing, la Direction
  et 26 autres services. Les consignes des agents des services sont dans `organisation/services/<service>/agents/<agent>/AGENTS.md`.
- **Cloisonnement.** Un employé d'un service (agent) ne voit ni les tâches, ni les dossiers, ni les documents des autres services.
  La Direction est la seule à voir l'ensemble, par les rapports et les escalades que chaque service lui envoie.
- **Échanges uniquement par le bureau de liaison.** Un coordinateur ne délègue jamais hors de son service. Pour une information
  d'un autre service, il passe par le bureau de liaison (route `liaison.demander`) : une demande tracée avec un objet, une question
  et les seuls extraits nécessaires, jamais un dossier complet. La règle est fermée : pas de flux déclaré dans la matrice du
  chapitre 3, pas d'échange.
- **Services sensibles et approbation humaine.** 5 services sont sensibles : juridique, ressources humaines, fiscalité, HSE (santé, sécurité, environnement)
  et juridique social. Tout flux qui part d'un service sensible ou qui y arrive exige l'approbation d'un humain avant
  que la demande ne soit transmise (42 flux sur 118). Cinq autres flux, entre services non sensibles, l'exigent aussi
  (chapitre 3). Au total, 47 flux sur 118 demandent une approbation humaine.
- **Rien n'est publié, envoyé, dépensé ni signé sans un humain.** Les agents préparent des brouillons, des dossiers et des analyses.
  Chaque service déclare dans le registre ce qui reste humain (signature d'un document engageant, envoi d'un courrier officiel,
  publication sur un canal externe, budget engagé, décision stratégique, etc.). Les agents sont créés en pause et ne travaillent
  que sur demande.
- **Règles communes à tous les agents.** Ne jamais inventer (sans source, l'information manque), faire approuver par l'humain tout
  acte qui engage, ne jamais demander un dossier complet à un autre service, marquer « à vérifier » toute référence légale incertaine.

## 2. Les 28 services

Les agents listés sont ceux qui ont un fichier de consignes : 83 au total. Pour le marketing, la liste vient de `organisation/agents/`
(le registre renvoie à `agents.json` sans dupliquer) : onze agents plus la Porte de contrôle, agent déterministe sans modèle. Le Gardien des connexions,
agent natif sans modèle, est créé par le système et n'a pas de dossier de consignes.

| Service | Préfixe | Sensible | Coordinateur | Spécialistes | Compétences |
| --- | --- | --- | --- | --- | --- |
| Marketing (`marketing`) | MKT | non | `coordinateur` | `contenus`, `crm-conversion`, `exigences`, `mesure`, `porte`, `prospection`, `relecteur`, `sea`, `seo-local-geo`, `tests-techniques`, `veille` | `redaction-declinaison-canal`, `charte-marque`, `contenu-recherche-ia`, `recherche-connaissances`, `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `conversion-crm`, `controle-couverture`, `mesure-experiences`, `recherche-prospects`, `qualification-prospects`, `recherche-sourcee`, `relecture-independante`, `preparation-campagnes-sea`, `audit-seo`, `audit-local-etablissements`, `controles-techniques-liens`, `analyse-concurrentielle` |
| Direction (`direction`) | DIR | non | `coordinateur-direction` | `synthese`, `tableau-de-bord` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `pilotage-strategique`, `synthese-direction`, `tableau-de-bord-pme` |
| Administratif (`administratif`) | ADM | non | `coordinateur-administratif` | `agenda-documents`, `courrier` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `courrier-officiel`, `classement-archivage`, `agenda-echeances-legales` |
| Juridique (`juridique`) | JUR | oui | `coordinateur-juridique` | `lecture-contrats`, `registre-rgpd` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `revue-contrat-commercial`, `registre-traitements-rgpd`, `mentions-legales-site` |
| Commercial (`commercial`) | COM | non | `coordinateur-commercial` | `preparation-rdv`, `propositions`, `renouvellements` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `preparation-rendez-vous-b2b`, `proposition-commerciale`, `renouvellement-fidelisation` |
| Recouvrement (`recouvrement`) | REC | non | `coordinateur-recouvrement` | `balance-agee`, `relances` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `procedure-recouvrement-judiciaire`, `balance-agee-creances`, `relance-amiable-b2b-b2c` |
| Service après-vente et sinistres (`sav-sinistres`) | SAV | non | `coordinateur-sav` | `faq`, `reclamations`, `sinistres` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `base-connaissances-faq`, `traitement-reclamation`, `gestion-dossier-sinistre` |
| Commerce extérieur (`commerce-exterieur`) | CEX | non | `coordinateur-export` | `dossiers-export` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `prospection-marche-etranger`, `classement-douanier-origine`, `dossier-export` |
| Conformité (`conformite`) | CNF | non | `coordinateur-conformite` | `veille-reglementaire`, `vigilance-clients` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `vigilance-clientele-lbc`, `veille-reglementaire`, `controle-communications-reglementees` |
| Comptabilité et finance (`comptabilite-finance`) | CPT | non | `coordinateur-comptabilite` | `commissions`, `tresorerie` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `plan-tresorerie`, `cloture-mensuelle`, `analyse-rentabilite` |
| Ressources humaines (`ressources-humaines`) | RHU | oui | `coordinateur-rh` | `accueil`, `offres-emploi` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `entretien-evaluation`, `accueil-nouveau-collaborateur`, `offre-emploi-non-discriminante` |
| Informatique (`informatique`) | INF | non | `coordinateur-informatique` | `documentation`, `procedures-incident` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `gestion-incident-informatique`, `documentation-technique`, `cybersecurite-pme` |
| Achats (`achats`) | ACH | non | `coordinateur-achats` | `comparaison-offres` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `cahier-des-charges-achat`, `contrat-fournisseur`, `comparaison-offres-fournisseurs` |
| Qualité (`qualite`) | QUA | non | `coordinateur-qualite` | `procedures` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `procedure-qualite`, `non-conformite-action-corrective`, `audit-interne` |
| Logistique (`logistique`) | LOG | non | `coordinateur-logistique` | `prevision-demande`, `transport-douane` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `prevision-demande-stocks`, `organisation-transport`, `gestion-retours-logistique`, `classement-douanier-origine` |
| Production (`production`) | PRD | non | `coordinateur-production` | `ordonnancement`, `amelioration-continue` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `planification-production`, `indicateurs-trs`, `amelioration-continue-lean`, `non-conformite-action-corrective` |
| Recherche et innovation (`recherche-innovation`) | RDI | non | `coordinateur-rdi` | `veille-brevets`, `dossiers-subsides` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `veille-brevets-anteriorite`, `dossier-subside-innovation`, `incitants-fiscaux-rd` |
| Communication (`communication`) | CMN | non | `coordinateur-communication` | `relations-presse`, `communication-interne` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `communique-de-presse`, `communication-de-crise`, `communication-interne`, `charte-marque`, `controle-communications-reglementees` |
| Service client (`service-client`) | SCL | non | `coordinateur-service-client` | `tri-tickets`, `base-connaissances` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `tri-tickets-support`, `reponse-client-multicanal`, `mesure-satisfaction`, `base-connaissances-faq` |
| Fiscalité (`fiscalite`) | FIS | oui | `coordinateur-fiscalite` | `calendrier-fiscal` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `preparation-tva`, `impot-des-societes`, `precompte-professionnel`, `agenda-echeances-legales`, `cloture-mensuelle` |
| Gestion de projets (`gestion-projets`) | PMO | non | `coordinateur-pmo` | `suivi-portefeuille` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `pilotage-strategique`, `cadrage-projet`, `suivi-avancement-projet`, `registre-risques-projet` |
| Hygiène, sécurité et environnement (`hse`) | HSE | oui | `coordinateur-hse` | `analyse-risques` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `analyse-risques-poste`, `accident-du-travail`, `conformite-environnementale` |
| Formation (`formation`) | FOR | non | `coordinateur-formation` | `ingenierie-formation` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `plan-formation`, `financement-formation`, `conception-module-formation` |
| Juridique social (`juridique-social`) | JSO | oui | `coordinateur-juridique-social` | `contrats-travail` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `redaction-contrat-travail`, `fin-contrat-travail`, `temps-travail-conges` |
| Données et BI (`donnees-bi`) | DAT | non | `coordinateur-donnees` | `analyste-donnees` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `gouvernance-donnees`, `qualite-donnees`, `analyse-donnees-decision`, `tableau-de-bord-pme`, `registre-traitements-rgpd` |
| Événementiel (`evenementiel`) | EVT | non | `coordinateur-evenementiel` | `logistique-evenement` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `cadrage-projet`, `organisation-evenement`, `salon-professionnel`, `bilan-evenement`, `registre-risques-projet`, `cahier-des-charges-achat` |
| Services généraux (`services-generaux`) | SGX | non | `coordinateur-services-generaux` | `energie-batiments` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `gestion-bail-commercial`, `suivi-energie-batiment`, `maintenance-batiment`, `contrat-fournisseur`, `comparaison-offres-fournisseurs` |
| Partenariats (`partenariats`) | PAR | non | `coordinateur-partenariats` | `suivi-partenaires` | `cadrage-exigences`, `planification-livrables`, `dossier-validation-humaine`, `recherche-connaissances`, `selection-partenaire`, `accord-de-partenariat`, `pilotage-partenaires`, `revue-contrat-commercial`, `preparation-rendez-vous-b2b` |

La colonne « Compétences » reprend l'en-tête `skills:` des fichiers de consignes, y compris les quatre compétences communes aux coordinateurs (chapitre 4).

## 3. Matrice des échanges

Lecture : « Envoie à » liste les services auxquels le service peut adresser une demande ; « Reçoit de » ceux qui peuvent lui en adresser.
Une étoile (`*`) signale un flux qui exige l'approbation d'un humain. Un flux n'a de sens que si les deux services
existent chez le client : la déclaration (chapitre 5) ne retient que les flux dont les deux extrémités appartiennent au client.
Les flux « Rapport périodique et escalade » vers la Direction sont au nombre de 24 ; les 94 autres portent chacun un objet précis dans le registre.

| Service | Échange avec (approbation humaine marquée *) |
| --- | --- |
| Marketing (`marketing`) | Envoie à : `direction`, `commercial`, `conformite`, `communication`, `evenementiel`. Reçoit de : `conformite`, `communication`*, `evenementiel` |
| Direction (`direction`) | Envoie à : `communication`, `gestion-projets`, `donnees-bi`. Reçoit de : `marketing`, `administratif`, `juridique`*, `commercial`, `recouvrement`, `sav-sinistres`, `commerce-exterieur`, `conformite`, `comptabilite-finance`, `ressources-humaines`*, `informatique`, `achats`, `qualite`, `logistique`, `production`, `recherche-innovation`, `communication`, `service-client`, `fiscalite`*, `gestion-projets`, `hse`*, `formation`, `juridique-social`*, `donnees-bi`*, `evenementiel`, `services-generaux`, `partenariats` |
| Administratif (`administratif`) | Envoie à : `direction`, `comptabilite-finance`. Reçoit de : `commercial` |
| Juridique (`juridique`) | Envoie à : `direction`*, `conformite`*, `commercial`*, `recouvrement`*, `sav-sinistres`*, `recherche-innovation`*, `fiscalite`*, `juridique-social`*, `partenariats`*. Reçoit de : `recouvrement`*, `sav-sinistres`*, `commercial`*, `conformite`*, `achats`*, `commerce-exterieur`*, `recherche-innovation`*, `fiscalite`*, `juridique-social`*, `partenariats`* |
| Commercial (`commercial`) | Envoie à : `direction`, `conformite`, `comptabilite-finance`, `administratif`, `juridique`*, `service-client`, `partenariats`. Reçoit de : `sav-sinistres`, `marketing`, `juridique`*, `service-client`, `partenariats` |
| Recouvrement (`recouvrement`) | Envoie à : `direction`, `comptabilite-finance`, `juridique`*. Reçoit de : `comptabilite-finance`, `juridique`* |
| Service après-vente et sinistres (`sav-sinistres`) | Envoie à : `direction`, `juridique`*, `comptabilite-finance`, `commercial`, `qualite`, `logistique`, `service-client`. Reçoit de : `juridique`*, `logistique`, `service-client` |
| Commerce extérieur (`commerce-exterieur`) | Envoie à : `direction`, `comptabilite-finance`, `juridique`*, `conformite`, `logistique`. Reçoit de : `logistique` |
| Conformité (`conformite`) | Envoie à : `direction`, `juridique`*, `informatique`, `marketing`. Reçoit de : `commercial`, `marketing`, `juridique`*, `informatique`, `commerce-exterieur` |
| Comptabilité et finance (`comptabilite-finance`) | Envoie à : `direction`, `recouvrement`, `recherche-innovation`, `fiscalite`*. Reçoit de : `recouvrement`, `sav-sinistres`, `commercial`, `ressources-humaines`*, `achats`, `commerce-exterieur`, `administratif`, `recherche-innovation`, `fiscalite`* |
| Ressources humaines (`ressources-humaines`) | Envoie à : `direction`*, `comptabilite-finance`*, `informatique`*, `communication`*, `hse`*, `formation`*, `juridique-social`*. Reçoit de : `informatique`*, `communication`*, `hse`*, `formation`*, `juridique-social`* |
| Informatique (`informatique`) | Envoie à : `direction`, `conformite`, `ressources-humaines`*, `service-client`, `donnees-bi`. Reçoit de : `conformite`, `ressources-humaines`*, `service-client`, `donnees-bi`* |
| Achats (`achats`) | Envoie à : `direction`, `comptabilite-finance`, `juridique`*, `qualite`, `logistique`, `production`, `services-generaux`. Reçoit de : `qualite`, `logistique`*, `production`, `services-generaux` |
| Qualité (`qualite`) | Envoie à : `direction`, `achats`, `production`, `hse`*. Reçoit de : `sav-sinistres`, `achats`, `production`, `hse`* |
| Logistique (`logistique`) | Envoie à : `direction`, `achats`*, `commerce-exterieur`, `sav-sinistres`, `production`. Reçoit de : `achats`, `commerce-exterieur`, `sav-sinistres`, `production` |
| Production (`production`) | Envoie à : `direction`, `qualite`, `logistique`, `achats`, `hse`*. Reçoit de : `qualite`, `logistique`, `achats`, `hse`* |
| Recherche et innovation (`recherche-innovation`) | Envoie à : `direction`, `juridique`*, `comptabilite-finance`. Reçoit de : `juridique`*, `comptabilite-finance` |
| Communication (`communication`) | Envoie à : `direction`, `marketing`*, `ressources-humaines`*, `evenementiel`*. Reçoit de : `direction`, `marketing`, `ressources-humaines`*, `evenementiel` |
| Service client (`service-client`) | Envoie à : `direction`, `sav-sinistres`, `commercial`, `informatique`. Reçoit de : `sav-sinistres`, `commercial`, `informatique` |
| Fiscalité (`fiscalite`) | Envoie à : `direction`*, `comptabilite-finance`*, `juridique`*. Reçoit de : `comptabilite-finance`*, `juridique`* |
| Gestion de projets (`gestion-projets`) | Envoie à : `direction`. Reçoit de : `direction` |
| Hygiène, sécurité et environnement (`hse`) | Envoie à : `direction`*, `ressources-humaines`*, `production`*, `qualite`*, `services-generaux`*. Reçoit de : `ressources-humaines`*, `production`*, `qualite`*, `services-generaux`* |
| Formation (`formation`) | Envoie à : `direction`, `ressources-humaines`*. Reçoit de : `ressources-humaines`* |
| Juridique social (`juridique-social`) | Envoie à : `direction`*, `ressources-humaines`*, `juridique`*. Reçoit de : `ressources-humaines`*, `juridique`* |
| Données et BI (`donnees-bi`) | Envoie à : `direction`*, `informatique`*. Reçoit de : `direction`, `informatique` |
| Événementiel (`evenementiel`) | Envoie à : `direction`, `marketing`, `communication`. Reçoit de : `marketing`, `communication`* |
| Services généraux (`services-generaux`) | Envoie à : `direction`, `achats`, `hse`*. Reçoit de : `achats`, `hse`* |
| Partenariats (`partenariats`) | Envoie à : `direction`, `commercial`, `juridique`*. Reçoit de : `commercial`, `juridique`* |

Les cinq flux entre services non sensibles qui exigent une approbation sont : données et BI vers Direction pour les indicateurs et analyses,
logistique vers achats pour une commande à passer, communication vers marketing pour la cohérence des messages de marque,
données et BI vers informatique pour l'accès aux sources de données, communication vers événementiel pour les messages et le calendrier de communication.

## 4. Compétences

Les 100 compétences sont dans `organisation/skills/<nom>/SKILL.md`. Chacune a les mêmes sections : objectif, quand l'utiliser, prérequis,
entrées, étapes, livrable, critères de réussite, limites, exemple.

**Règle de qualité.**
- 79 compétences sur 100 ont une section « Sources officielles » : les pages consultées, avec l'adresse, la date de lecture
  et ce que chaque source établit. Une règle ou un délai sans source consultée n'est pas présenté comme acquis.
- 75 compétences ont une section « À vérifier par un professionnel » qui nomme le métier à consulter selon le sujet (par exemple le conseiller en prévention, le secrétariat social ou l'assureur pour un accident du travail, un juriste ou un avocat pour une question de responsabilité).
- Tout article de loi, taux, délai ou montant incertain est marqué « à vérifier » dans le texte.
- Aucune compétence n'envoie, ne signe, ne dépose ni ne déclare quoi que ce soit : elle prépare, l'humain décide.

Compétences communes à tous les coordinateurs de service : `cadrage-exigences` (transforme une demande en brief et exigences numérotées),
`planification-livrables` (plan de tâches avec responsables et dépendances), `dossier-validation-humaine` (dossier soumis à la décision humaine),
`recherche-connaissances` (interroge les connaissances du client avant d'écrire un chiffre, cite la source, signale l'information manquante).
Elles ne sont pas répétées ci-dessous, sauf pour le marketing et la Direction où elles sont déclarées en plus des compétences propres.

### Marketing (`marketing`)

- `redaction-declinaison-canal` : Rédige un contenu principal puis le décline par canal (site, blog, réseaux sociaux, courriel, fiche d'établissement) en respectant les contraintes de chaque canal, la charte de marque et les sources.
- `charte-marque` : Applique la charte de marque à un texte ou à un brief de visuel.
- `contenu-recherche-ia` : Conçoit ou améliore des contenus utiles à la fois pour la recherche classique et pour les réponses des moteurs d'IA (GEO).
- `recherche-connaissances` : Interroge les connaissances du client (conditions générales, fiches produit, tarifs, FAQ, notes) avant d'écrire un chiffre d'offre, et cite l'adresse connaissance:// rendue ; sans source, signale l'information manquante.
- `cadrage-exigences` : Transforme une demande marketing en brief structuré et en exigences numérotées REQ-001, REQ-002.
- `planification-livrables` : Construit le plan d'une campagne sous forme de tâches Paperclip.
- `dossier-validation-humaine` : Prépare le dossier soumis à la décision humaine.
- `conversion-crm` : Conçoit pages de conversion, formulaires, segments et scénarios de suivi en documentant entrées, déclencheurs, exclusions, consentements et conditions d'envoi, sans aucune prospection réelle automatique.
- `controle-couverture` : Contrôle indépendant de la couverture d'un livrable.
- `mesure-experiences` : Vérifie des données marketing importées (périodes, provenance, doublons, conversions), présente coûts, attribution et incertitudes, et conçoit des expériences avec hypothèse, métrique et condition d'arrêt ; répond « non mesurable » quand les données manquent.
- `recherche-prospects` : Cherche des prospects B2B par secteur NACE et zone, des particuliers B2C aux seules origines légales et des partenaires, par les outils de prospection en lecture (bce, bnb, fsma, osm, b2c), et dépose chaque réponse brute signée sur la tâche.
- `qualification-prospects` : Qualifie les prospects déposés.
- `recherche-sourcee` : Mène une recherche documentaire et vérifie les faits.
- `relecture-independante` : Relecture métier et factuelle indépendante d'un livrable.
- `preparation-campagnes-sea` : Prépare en brouillon une campagne de liens sponsorisés.
- `audit-seo` : Audite le référencement technique accessible et éditorial d'un site.
- `audit-local-etablissements` : Audite, établissement par établissement, la cohérence des informations locales (nom, adresse, téléphone, horaires, zone desservie, services) entre le site, les fiches d'établissement publiques et les contenus.
- `controles-techniques-liens` : Exécute les contrôles techniques d'un livrable.
- `analyse-concurrentielle` : Compare des concurrents sur des critères identiques (offres, zones, preuves, canaux, messages) à partir de sources datées, et en tire des opportunités et risques étiquetés comme recommandations.

### Direction (`direction`)

- `pilotage-strategique` : Aide la direction d'une PME à arbitrer entre les demandes concurrentes des services, à fixer des objectifs trimestriels (méthode OKR), à classer les initiatives par impact, effort et risque, et à tracer chaque décision dans un registre.
- `synthese-direction` : Rédige la note de synthèse d'une page destinée au dirigeant à partir des rapports et extraits des services.
- `tableau-de-bord-pme` : Construit le tableau de bord de pilotage d'une PME belge.

### Administratif (`administratif`)

- `courrier-officiel` : Prépare les courriers et courriels formels d'une PME belge (réponse à une administration, mise en demeure simple, envoi recommandé, relance formelle) avec les mentions obligatoires d'une personne morale sur ses documents (dénomination, forme, siège, numéro d'entreprise, RPM et tribunal) et les durées de conservation à appliquer à l'original et à la preuve d'envoi.
- `classement-archivage` : Conçoit et applique le plan de classement, les règles de nommage et le calendrier de conservation des documents d'une PME belge.
- `agenda-echeances-legales` : Construit et tient le calendrier des échéances légales récurrentes d'une PME belge.

### Juridique (`juridique`)

- `revue-contrat-commercial` : Prépare la revue d'un contrat commercial pour une PME belge.
- `registre-traitements-rgpd` : Établit ou met à jour le registre des activités de traitement (article 30 du RGPD) d'une PME belge.
- `mentions-legales-site` : Prépare les textes juridiques du site web d'une entreprise belge.

### Commercial (`commercial`)

- `preparation-rendez-vous-b2b` : Prépare un rendez-vous commercial avec une entreprise belge.
- `proposition-commerciale` : Rédige le projet de proposition commerciale d'une entreprise belge, centré sur le problème du client.
- `renouvellement-fidelisation` : Tient le calendrier des échéances de contrats d'une entreprise belge, repère les signaux de départ d'un client, prépare l'offre de reconduction et applique les règles de reconduction tacite (clause signalée, délai raisonnable pour s'opposer, préavis).

### Recouvrement (`recouvrement`)

- `procedure-recouvrement-judiciaire` : Prépare le dossier de décision pour passer du recouvrement amiable au recouvrement judiciaire d'une créance d'une PME belge.
- `balance-agee-creances` : Construit et analyse la balance âgée des créances clients d'une PME belge.
- `relance-amiable-b2b-b2c` : Rédige une séquence graduée de relances amiables d'une facture ou d'une prime impayée, adaptée au débiteur.

### Service après-vente et sinistres (`sav-sinistres`)

- `base-connaissances-faq` : Construit et tient à jour la FAQ et la base de connaissances du service après-vente d'une PME belge à partir des tickets réellement reçus.
- `traitement-reclamation` : Conduit le traitement d'une réclamation client d'une PME belge de bout en bout.
- `gestion-dossier-sinistre` : Organise le suivi administratif d'un dossier de sinistre par un intermédiaire d'assurance en Belgique.

### Commerce extérieur (`commerce-exterieur`)

- `prospection-marche-etranger` : Prépare l'approche d'un marché étranger par une PME belge.
- `classement-douanier-origine` : Prépare, pour une PME belge qui exporte ou importe, la proposition de classement douanier (code SH, NC, TARIC), l'analyse de l'origine préférentielle au titre des accords de l'UE, le statut d'exportateur enregistré (REX) et le premier examen des sanctions et des biens à double usage (règlement (UE) 2021/821), avec signal d'arrêt et escalade.
- `dossier-export` : Constitue et contrôle le dossier d'une opération d'exportation hors UE par une PME belge.

### Conformité (`conformite`)

- `vigilance-clientele-lbc` : Prépare le dossier de vigilance d'un client au regard de la loi belge du 18 septembre 2017 (prévention du blanchiment de capitaux et du financement du terrorisme) : l'entreprise est-elle assujettie, identification et vérification du client et de ses bénéficiaires effectifs (registre UBO), évaluation individuelle du risque, indices de vigilance renforcée (personnes politiquement exposées, pays à haut risque), pièces manquantes, et points à soumettre au responsable de la conformité (AMLCO).
- `veille-reglementaire` : Organise la veille réglementaire d'une PME belge à partir de sources officielles (Moniteur belge et Justel, Journal officiel de l'Union européenne sur EUR-Lex, autorités de contrôle comme la FSMA) : choix des sources et des sujets, relevé des textes nouveaux ou modifiés, fiche d'impact (qui est concerné, quoi, à partir de quand, quelle action), registre des obligations et priorisation par échéance et gravité.
- `controle-communications-reglementees` : Relit une communication commerciale (publicité, page web, courriel, post, brochure, script) d'une entreprise belge, surtout dans un secteur régulé, au regard des pratiques commerciales déloyales envers les consommateurs (livre VI du Code de droit économique : pratiques trompeuses, omissions, pratiques agressives, publicité comparative) et, pour les produits financiers et d'assurance, des règles de publicité (arrêté royal du 25 avril 2014 et circulaire FSMA_2015_16).

### Comptabilité et finance (`comptabilite-finance`)

- `plan-tresorerie` : Construit le plan de trésorerie d'une PME belge sur 13 semaines.
- `cloture-mensuelle` : Prépare et contrôle la clôture mensuelle comptable d'une PME belge.
- `analyse-rentabilite` : Analyse la rentabilité d'une PME belge par produit, client ou canal.

### Ressources humaines (`ressources-humaines`)

- `entretien-evaluation` : Prépare un entretien d'évaluation ou de fonctionnement dans une PME belge.
- `accueil-nouveau-collaborateur` : Prépare le plan d'accueil d'un nouveau collaborateur d'une PME belge.
- `offre-emploi-non-discriminante` : Rédige ou relit une offre d'emploi d'une PME belge conforme à la législation antidiscrimination (loi du 10 mai 2007, critères protégés, exigences justifiées par la fonction, langue, formulation neutre H/F/X), choisit les canaux de diffusion (Forem, VDAB, Actiris) et prépare l'information RGPD des candidats avec une durée de conservation à décider par l'humain.

### Informatique (`informatique`)

- `gestion-incident-informatique` : Prépare la gestion d'un incident informatique ou de sécurité dans une PME belge.
- `documentation-technique` : Établit la documentation technique d'une PME belge.
- `cybersecurite-pme` : Définit et explique les mesures de cybersécurité de base d'une PME belge selon le cadre CyberFundamentals du Centre pour la Cybersécurité Belgique (CCB) : authentification multifacteur, mises à jour, sauvegardes, comptes, mots de passe, sensibilisation à l'hameçonnage.

### Achats (`achats`)

- `cahier-des-charges-achat` : Rédige le cahier des charges d'un achat de PME belge (fourniture, service, logiciel, sous-traitance).
- `contrat-fournisseur` : Contrôle un projet de contrat ou des conditions générales de fournisseur pour une PME belge.
- `comparaison-offres-fournisseurs` : Compare les offres reçues de plusieurs fournisseurs pour un achat de PME belge sur une grille explicite.

### Qualité (`qualite`)

- `procedure-qualite` : Rédige ou révise une procédure écrite d'une PME belge (objet, champ d'application, responsabilités par fonction, étapes, contrôles, enregistrements, indicateurs, versionnage) selon la logique de l'approche processus et de l'amélioration continue de l'ISO 9001.
- `non-conformite-action-corrective` : Enregistre une non-conformité ou une réclamation client dans une PME belge, en analyse la cause (5 pourquoi, diagramme d'Ishikawa), propose des actions de correction, corrective et préventive avec responsable et échéance, puis prépare la vérification d'efficacité.
- `audit-interne` : Prépare et documente un audit interne dans une PME belge.

### Logistique (`logistique`)

- `prevision-demande-stocks` : Prépare la prévision de la demande et le pilotage des stocks d'une PME belge.
- `organisation-transport` : Prépare l'organisation d'un transport de marchandises pour une PME belge.
- `gestion-retours-logistique` : Organise le traitement logistique des retours de marchandises d'une PME belge.
- `classement-douanier-origine` : Prépare, pour une PME belge qui exporte ou importe, la proposition de classement douanier (code SH, NC, TARIC), l'analyse de l'origine préférentielle au titre des accords de l'UE, le statut d'exportateur enregistré (REX) et le premier examen des sanctions et des biens à double usage (règlement (UE) 2021/821), avec signal d'arrêt et escalade.

### Production (`production`)

- `planification-production` : Prépare le plan de production d'une PME belge industrielle ou de services.
- `indicateurs-trs` : Calcule et interprète le TRS (taux de rendement synthétique, OEE en anglais) d'un équipement ou d'une ligne.
- `amelioration-continue-lean` : Structure une démarche d'amélioration continue dans une PME belge.
- `non-conformite-action-corrective` : Enregistre une non-conformité ou une réclamation client dans une PME belge, en analyse la cause (5 pourquoi, diagramme d'Ishikawa), propose des actions de correction, corrective et préventive avec responsable et échéance, puis prépare la vérification d'efficacité.

### Recherche et innovation (`recherche-innovation`)

- `veille-brevets-anteriorite` : Prépare une recherche d'antériorité dans les bases publiques de brevets (Espacenet de l'Office européen des brevets), choisit les classes CPC, lit les revendications élément par élément et rédige une note préliminaire de liberté d'exploitation avec ses limites.
- `dossier-subside-innovation` : Prépare le dossier de demande d'un subside de recherche ou d'innovation pour une PME belge.
- `incitants-fiscaux-rd` : Explique en principe et prépare les pièces des incitants fiscaux belges de recherche et développement.

### Communication (`communication`)

- `communique-de-presse` : Rédige un communiqué de presse d'une PME belge, FR et NL si utile.
- `communication-de-crise` : Prépare et conduit la communication de crise d'une PME belge.
- `communication-interne` : Organise la communication interne d'une PME belge.
- `charte-marque` : Applique la charte de marque à un texte ou à un brief de visuel.
- `controle-communications-reglementees` : Relit une communication commerciale (publicité, page web, courriel, post, brochure, script) d'une entreprise belge, surtout dans un secteur régulé, au regard des pratiques commerciales déloyales envers les consommateurs (livre VI du Code de droit économique : pratiques trompeuses, omissions, pratiques agressives, publicité comparative) et, pour les produits financiers et d'assurance, des règles de publicité (arrêté royal du 25 avril 2014 et circulaire FSMA_2015_16).

### Service client (`service-client`)

- `tri-tickets-support` : Trie les tickets d'un service client de PME belge.
- `reponse-client-multicanal` : Rédige des brouillons de réponse à des clients d'une PME belge sur plusieurs canaux (courriel, formulaire, chat, réseaux sociaux, courrier, script téléphonique) en français, néerlandais ou anglais : ton, gabarits, délais annoncés, accessibilité et protection des données personnelles.
- `mesure-satisfaction` : Conçoit et lit une mesure de satisfaction client pour une PME belge.
- `base-connaissances-faq` : Construit et tient à jour la FAQ et la base de connaissances du service après-vente d'une PME belge à partir des tickets réellement reçus.

### Fiscalité (`fiscalite`)

- `preparation-tva` : Prépare le contrôle de la TVA d'une PME belge avant la déclaration périodique.
- `impot-des-societes` : Prépare la déclaration à l'impôt des sociétés d'une PME belge.
- `precompte-professionnel` : Prépare le suivi du précompte professionnel d'une PME belge.
- `agenda-echeances-legales` : Construit et tient le calendrier des échéances légales récurrentes d'une PME belge.
- `cloture-mensuelle` : Prépare et contrôle la clôture mensuelle comptable d'une PME belge.

### Gestion de projets (`gestion-projets`)

- `pilotage-strategique` : Aide la direction d'une PME à arbitrer entre les demandes concurrentes des services, à fixer des objectifs trimestriels (méthode OKR), à classer les initiatives par impact, effort et risque, et à tracer chaque décision dans un registre.
- `cadrage-projet` : Rédige la charte de projet d'une PME belge.
- `suivi-avancement-projet` : Produit le rapport d'avancement d'un projet ou d'un portefeuille.
- `registre-risques-projet` : Tient le registre des risques d'un projet ou du portefeuille.

### Hygiène, sécurité et environnement (`hse`)

- `analyse-risques-poste` : Prépare l'analyse des risques d'un poste de travail dans une PME belge.
- `accident-du-travail` : Prépare le dossier administratif et l'analyse d'un accident du travail dans une PME belge.
- `conformite-environnementale` : Prépare les repères de conformité environnementale d'une PME belge selon sa Région (Wallonie, Bruxelles-Capitale, Flandre).

### Formation (`formation`)

- `plan-formation` : Prépare le plan de formation annuel d'une PME belge.
- `financement-formation` : Identifie les pistes de financement d'une formation en Belgique selon la Région du lieu de travail.
- `conception-module-formation` : Conçoit un module de formation en entreprise.

### Juridique social (`juridique-social`)

- `redaction-contrat-travail` : Prépare le projet d'un contrat de travail pour une PME belge.
- `fin-contrat-travail` : Prépare l'analyse d'une fin de contrat de travail pour une PME belge.
- `temps-travail-conges` : Explique à une PME belge les principes du temps de travail et des congés.

### Données et BI (`donnees-bi`)

- `gouvernance-donnees` : Met en place la gouvernance des données d'une PME belge.
- `qualite-donnees` : Mesure et améliore la qualité d'un jeu de données d'une PME belge selon cinq dimensions (exactitude, complétude, cohérence, fraîcheur, unicité).
- `analyse-donnees-decision` : Mène une analyse de données au service d'une décision d'une PME belge.
- `tableau-de-bord-pme` : Construit le tableau de bord de pilotage d'une PME belge.
- `registre-traitements-rgpd` : Établit ou met à jour le registre des activités de traitement (article 30 du RGPD) d'une PME belge.

### Événementiel (`evenementiel`)

- `cadrage-projet` : Rédige la charte de projet d'une PME belge.
- `organisation-evenement` : Prépare l'organisation d'un événement de PME belge.
- `salon-professionnel` : Prépare la participation d'une PME belge à un salon professionnel.
- `bilan-evenement` : Établit le bilan d'un événement ou d'un salon d'une PME belge.
- `registre-risques-projet` : Tient le registre des risques d'un projet ou du portefeuille.
- `cahier-des-charges-achat` : Rédige le cahier des charges d'un achat de PME belge (fourniture, service, logiciel, sous-traitance).

### Services généraux (`services-generaux`)

- `gestion-bail-commercial` : Prépare le suivi d'un bail commercial belge.
- `suivi-energie-batiment` : Suit la consommation d'énergie des bâtiments d'une PME belge.
- `maintenance-batiment` : Organise la maintenance d'un bâtiment de PME belge.
- `contrat-fournisseur` : Contrôle un projet de contrat ou des conditions générales de fournisseur pour une PME belge.
- `comparaison-offres-fournisseurs` : Compare les offres reçues de plusieurs fournisseurs pour un achat de PME belge sur une grille explicite.

### Partenariats (`partenariats`)

- `selection-partenaire` : Évalue un partenaire potentiel pour une PME belge (distributeur, agent commercial, revendeur, partenaire de co-marketing, apporteur d'affaires).
- `accord-de-partenariat` : Prépare le dossier d'un accord de partenariat pour une PME belge.
- `pilotage-partenaires` : Pilote le portefeuille de partenaires d'une PME belge.
- `revue-contrat-commercial` : Prépare la revue d'un contrat commercial pour une PME belge.
- `preparation-rendez-vous-b2b` : Prépare un rendez-vous commercial avec une entreprise belge.

## 5. Mise en place chez un client

Tout se passe depuis le dépôt de l'installateur, avec `python3 -I` pour les scripts Python. Les agents sont **toujours créés en pause** :
rien ne travaille tant qu'un humain ne les a pas activés. Le détail de l'installation complète est dans `docs/installation-client.md`
(script `scripts/installer-chez-client.sh`).

1. **Fiche client.** Partir de `organisation/modeles/fiche-client.exemple.json`. Le champ facultatif `services` vaut soit `"tous"` (les 28 services),
   soit une liste de slugs du registre (exemple : `["marketing", "commercial", "juridique"]`), soit rien (marketing seul). La Direction s'ajoute d'elle-même dès que
   la fiche retient deux services ou plus hors Direction. Un slug inconnu ou inactif est refusé. Le champ `budgets` fixe un budget par service, en centimes.
2. **Création du client.** `python3 -I scripts/bootstrap-organisation.py nouveau-client --fiche <fiche> --a-blanc` liste les écritures sans rien écrire ;
   la même commande sans `--a-blanc` (avec `--reel`, accepté pour la lisibilité) crée l'entreprise de chaque service (marqueur `atelier-client:<slug>`), importe les agents en pause, fixe le budget IA mensuel
   et le référentiel de marque. La commande est idempotente.
3. **Client existant.** `python3 -I scripts/bootstrap-organisation.py nouveau-client --fiche <fiche> --ajouter-services --entreprise <UUID> [--slug <slug>] [--reel]`
   dote d'un seul coup d'un client déjà en place de tous les services de la fiche : l'entreprise `<UUID>` devient le service marketing, les autres services et la Direction sont créés par le chemin habituel,
   en pause. La fiche doit contenir le service marketing (`services: "tous"` convient). `--a-blanc` n'écrit rien.
4. **Déclarer les services.** `python3 -I scripts/declarer-services.py <slug-client>` envoie au plugin quelles entreprises sont quels services, avec les seuls flux dont les deux services appartiennent au client.
   La commande est idempotente (la déclaration remplace la précédente) et ne fait aucun appel de modèle. Elle donne aussi une configuration vide du plugin aux entreprises qui n'en ont pas : sans cela,
   une demande entre services resterait en file sans arriver à destination.
5. **Activer.** Un humain active les agents du ou des services utiles, un service à la fois, et valide chaque approbation de flux sensible.

## 6. Limites honnêtes

- **Ce n'est pas un conseil juridique, fiscal ni social.** Les compétences préparent des dossiers, des brouillons et des listes de points à contrôler. Une décision qui engage relève de la personne responsable et, selon le sujet,
  d'un avocat, d'un expert-comptable, d'un conseiller en prévention ou d'un secrétariat social.
- **Sources officielles parfois inaccessibles.** Certaines pages, notamment du SPF Finances et du SPF Économie, n'ont pas pu être consultées au moment de la rédaction. Les points qui en dépendent sont marqués « à vérifier » et
  ne doivent pas être repris tels quels.
- **Références légales à faire valider.** La liste des articles, taux, délais et textes marqués « à vérifier » est tenue dans `organisation/services/README.md` (section « À faire valider par un juriste »).
- **Le bureau de liaison dépend du plugin.** La matrice est une règle, pas un moyen de forcer un échange : la demande est tracée, approuvée si le flux l'exige, puis lue par le service cible.
- **Données du client.** Chaque service ne connaît que ce qui lui a été importé ou saisi ; sans source, un agent répond que l'information manque au lieu de l'inventer.

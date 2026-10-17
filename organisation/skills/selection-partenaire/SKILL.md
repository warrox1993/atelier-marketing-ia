---
name: "selection-partenaire"
description: "Évalue un partenaire potentiel pour une PME belge (distributeur, agent commercial, revendeur, partenaire de co-marketing, apporteur d'affaires) : objectifs du partenariat, critères pondérés, vérification de solvabilité et de réputation par sources publiques, complémentarité, risques, recommandation. À utiliser avant tout rendez-vous ou accord avec un partenaire ; jamais pour conclure sur une seule source, inventer un chiffre ni contacter le partenaire."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "partenariats"
---

# Sélection d'un partenaire

## Quand l'utiliser

- La direction veut étendre ses ventes par un tiers (territoire, segment, canal) et hésite entre plusieurs candidats.
- Un partenaire propose spontanément une collaboration et il faut décider s'il mérite un rendez-vous.
- Un partenaire existant doit être réévalué avant le renouvellement ou l'élargissement de la convention.

## Objectif

Une fiche de sélection d'une à deux pages par candidat : objectif visé, notes par critère avec la source de chacune, vérifications publiques datées, complémentarité avec l'offre de l'entreprise, risques et recommandation (poursuivre, poursuivre sous conditions, écarter). Chaque affirmation porte sa source ; ce qui manque est dit.

## Prérequis

- L'objectif commercial écrit par la direction (chiffre d'affaires visé, zone, segment, produits) et ce que l'entreprise accepte d'offrir (marge, formation, marque, exclusivité).
- Les critères et leur pondération validés par la direction. Sans pondération, proposer une pondération de départ marquée « proposition à valider » ; ne pas calculer de note finale avant validation.
- Le nom légal et le numéro d'entreprise du candidat (BCE) ; sans numéro, la vérification d'identité est bloquante.

## Entrées

- `objectif` : ce que le partenariat doit produire, avec un horizon et un indicateur.
- `candidats` : nom légal, numéro d'entreprise, site, interlocuteur (fonction seulement si possible), source du premier contact.
- `criteres` : liste pondérée fournie par la direction.
- `documents` : plaquettes, références, comptes annuels ou chiffres transmis par le candidat (donnée à vérifier, jamais une preuve).

## Étapes

1. **Remplir honnêtement la fiche d'entrée** avant toute évaluation : clients ou comptes que le candidat cite nommément comme déjà apportés ou servis (sans données personnelles inutiles), relations établies avec la clientèle visée, taille de son équipe commerciale, engagements qu'il propose (budget de promotion commun, personne dédiée, formation, objectifs chiffrés). Si la fiche ne peut pas être remplie honnêtement, le candidat n'a pas montré assez de substance : **arrêter**, marquer la fiche « incomplète », lister les questions à lui poser et ne préparer aucun projet d'accord.
2. **Reformuler l'objectif** en une phrase mesurable et le faire confirmer. Un partenaire se juge par rapport à un objectif, pas dans l'absolu.
3. **Choisir le type de partenaire** adapté : distributeur ou revendeur (achète pour revendre en son nom), agent commercial (négocie au nom de l'entreprise, rémunéré à la commission), co-marketing (actions communes sans revente), apporteur d'affaires (met en relation). Le type détermine le régime juridique : le dire, sans trancher (voir la compétence `accord-de-partenariat`).
4. **Vérifier l'identité** à la source publique : dénomination, forme juridique, statut actif, adresse, activités déclarées, dirigeants publiés (registre des entreprises, publications au Moniteur belge). Écart entre ce que dit le candidat et le registre : à signaler tel quel.
5. **Vérifier la santé financière** par les sources publiques : comptes annuels déposés (chiffre d'affaires, fonds propres, résultat, évolution sur trois exercices quand ils existent). Pour une petite société, certains postes ne sont pas publiés : écrire « non publié ». Ne jamais déduire un chiffre manquant.
6. **Vérifier la réputation** par plusieurs sources indépendantes : presse, décisions publiques, avis de clients vérifiables, références demandées au candidat, présence en ligne. Une source unique, un avis anonyme ou une rumeur ne suffit pas : classer « indice à confirmer ».
7. **Évaluer la complémentarité** : clientèle déjà servie (sans données personnelles), couverture géographique, produits concurrents ou complémentaires déjà distribués, capacité commerciale et technique, image de marque compatible. Signaler un conflit d'intérêts possible (partenaire lié à un concurrent).
8. **Noter chaque critère** de 0 à 5 selon une échelle écrite, avec la source de la note. Un critère sans information reçoit « non évalué », pas une note moyenne. Pour un partenaire de co-marketing (actions communes sans revente), grille de départ notée de 1 à 5, à faire valider par la direction : adéquation de son public à la clientèle cible, taille de ce public, compatibilité d'image, qualité de l'engagement de son public, réciprocité (ce que l'entreprise peut lui offrir en retour), facilité d'exécution (équipe dédiée, campagnes communes déjà menées).
9. **Lister les risques** : dépendance (à un seul partenaire ou de celui-ci à l'entreprise), solvabilité, réputation, atteinte à la marque, conflit de territoire avec un autre partenaire, fuite de savoir-faire, exposition à l'indemnité de fin de contrat en cas de rupture.
10. **Écrire les critères d'arrêt dès la sélection** : ce qui, mesuré à une date donnée, mettra fin à la relation (par exemple moins de N affaires apportées en deux trimestres, réclamations au-delà d'un seuil, engagement non tenu). Ils seront repris dans l'accord pour que la sortie soit mécanique.
11. **Conclure** : recommandation argumentée, conditions éventuelles (garanties, période d'essai, objectifs minimaux), questions à poser au candidat. Proposer les cartes de décision au coordinateur : rendez-vous, partage d'information, exclusivité éventuelle.

## Livrable

Fiche de sélection avec : fiche d'entrée (complète ou « incomplète » avec questions) ; objectif ; type de partenaire ; tableau de critères (critère, poids, note, source, date) ; identité vérifiée ; santé financière observée ; réputation (faits, indices à confirmer) ; complémentarité ; risques ; critères d'arrêt proposés ; recommandation ; table des faits ; informations manquantes et questions au candidat. Pour plusieurs candidats : un tableau comparatif d'une page, avec renvoi vers chaque fiche.

## Critères de réussite

- Chaque note et chaque chiffre renvoie à une source avec date de consultation.
- Aucune conclusion de solvabilité ou de réputation ne repose sur une seule source.
- Les critères et pondérations sont ceux de la direction ; les propositions sont marquées comme telles.
- Les écarts entre le dire du candidat et les sources publiques sont listés.
- Aucun contact avec le candidat n'a eu lieu et aucun engagement n'apparaît.
- Une fiche d'entrée incomplète arrête l'évaluation : aucun projet d'accord n'est préparé.
- Les critères d'arrêt sont écrits et mesurables.

## Sources officielles

Consultées le 17/10/2026 :

- SPF Économie, « CBE Public Search », https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/cbe-public-search : consultation gratuite des données publiques des entités inscrites à la Banque-Carrefour des Entreprises (numéro, statut, situation juridique, dénomination, siège, activités, forme juridique) ; réutilisation des données et téléchargement systématique interdits (CDE art. XV.79 cité par la page) : une consultation par candidat, datée.
- Banque nationale de Belgique, « Centrale des bilans », https://www.nbb.be/fr/centrale-des-bilans : la plupart des personnes morales actives déposent leurs comptes annuels ; leurs données sont consultables (service Consult).

## À vérifier par un professionnel

La lecture des comptes annuels et tout jugement de solvabilité sont à valider par l'expert-comptable ou le comptable de l'entreprise avant une décision engageante. Toute information sur des personnes physiques (dirigeants, avis nominatifs) respecte le RGPD, art. 5 : ne retenir que ce qui sert la décision. La qualification juridique du type de partenaire est à faire confirmer par un avocat.

## Limites

- Les sources publiques sont incomplètes et parfois en retard : un dépôt de comptes datant de plus d'un an peut ne plus refléter la situation.
- Le service ne remplace ni un rapport de crédit commercial ni une enquête approfondie ; pour un engagement important, la direction peut décider d'en commander un (dépense à approuver par l'humain).
- Les pages des registres publics (BCE, Banque nationale de Belgique, Moniteur belge) décrivent le service ; la consultation du candidat lui-même est à refaire et à dater à chaque fiche.
- La compétence n'évalue pas un partenaire hors de Belgique selon le droit local ; elle signale l'écart et demande un avis.

## Exemple

Une PME de menuiserie industrielle veut un revendeur pour la province de Luxembourg. Candidat : une société de négoce de bois de 12 personnes. Registre : société active, activité déclarée conforme. Comptes annuels : trois exercices déposés, fonds propres positifs et en baisse sur deux ans (source : comptes déposés, consultés le 16/10/2026). Presse : aucune mention défavorable sur deux sources. Le candidat revend déjà un concurrent direct : risque de conflit d'intérêts, note « complémentarité » à 2 sur 5. Recommandation : poursuivre sous conditions (question sur l'exclusivité envers le concurrent, garantie bancaire à discuter), carte de décision au coordinateur pour un premier rendez-vous.

Cas d'échec : le candidat transmet un dossier flatteur (chiffre d'affaires annoncé de 4 millions d'euros) mais aucun compte annuel n'est trouvé au dépôt public. La fiche n'écrit pas « 4 millions » comme un fait : elle note « chiffre annoncé par le candidat, non vérifiable », classe la santé financière « non évaluée » et bloque la recommandation en demandant les comptes ou une attestation de l'expert-comptable du candidat.

Cas d'échec évité (version 1.1.0) : un apporteur propose « un partenariat exclusif sur la province » sans citer aucun client ni engagement. La fiche d'entrée ne peut pas être remplie : elle est marquée incomplète avec les questions « quels clients de la province suivez-vous déjà ? quels engagements proposez-vous ? », l'exclusivité est signalée comme décision humaine et aucun projet d'accord n'est préparé.

## Origine de la méthode

Version 1.1.0 : étape 1 (fiche d'entrée remplie honnêtement, sinon arrêt) et étape 10 (critères d'arrêt écrits dès la sélection) adaptées et traduites de github.com/alirezarezvani/claude-skills, `commercial/skills/partnerships-architect/SKILL.md`, « Step 1 » et « Step 2 », commit 19392f7a08264ed00486a251f5b2098321771f94, licence MIT, Copyright (c) 2025 Alireza Rezvani ; grille de co-marketing de l'étape 8 adaptée de github.com/coreyhaines31/marketingskills, `skills/co-marketing/SKILL.md`, « Partner Scoring Criteria », commit dda3841f0b294e01e93b1541486beefbfab0915e, licence MIT, Copyright (c) 2025 Corey Haines. Modifications : réécriture en français, registres belges, carte de décision. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.

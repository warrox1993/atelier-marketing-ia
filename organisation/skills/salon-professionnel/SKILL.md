---
name: "salon-professionnel"
description: "Prépare la participation d'une PME belge à un salon professionnel : choix du salon, stand, préparation des équipes, collecte de contacts conforme au RGPD (information, consentement) et suivi des contacts dans les 48 heures. À utiliser avant, pendant et juste après un salon ; jamais pour réserver un stand, payer une inscription, envoyer un message de prospection sans consentement valide ni conserver des cartes de visite sans base légale."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "evenementiel"
---

# Participation à un salon professionnel

## Quand l'utiliser

- L'entreprise hésite entre plusieurs salons ou foires et veut choisir sur des critères écrits.
- Un salon est décidé et il faut préparer le stand, l'équipe, la collecte de contacts et le suivi.
- Des contacts ont été collectés sans formulaire et il faut dire ce qu'on peut en faire.

## Objectif

Un dossier de salon où le choix est justifié, le stand et l'équipe sont prêts, chaque contact est collecté avec l'information RGPD et, pour la prospection par courrier électronique, un consentement prouvable, et où chaque contact reçoit un suivi dans les 48 heures qui suivent le salon.

## Prérequis

- L'objectif fixé par la direction ou le commercial, exprimé en conversations qualifiées ou en rendez-vous. Un objectif de « notoriété » seul est refusé comme critère de décision : la compétence demande un nombre de rendez-vous qualifiés.
- Le budget plafond et les dates possibles.
- L'accès aux conditions de participation de chaque salon (documents d'organisateur).
- Pour la suite : le texte d'information de l'entreprise sur les données personnelles, ou son brouillon.

## Entrées

- `objectif` : chiffré, avec le public visé.
- `salons` : liste des salons envisagés avec dates, lieu, tarif de stand, profil des visiteurs annoncé par l'organisateur (donnée de l'organisateur, à ne pas présenter comme vérifiée).
- `equipe` : rôles disponibles (sans données personnelles inutiles).
- `offre` : ce que l'entreprise présente (produits, services, message).

## Étapes

1. **Choisir le salon** : noter chaque salon sur des critères pondérés par le demandeur (adéquation du public à la cible, nombre de visiteurs annoncé, exposants concurrents et partenaires, coût total, accessibilité du lieu, dates). Séparer les chiffres de l'organisateur (déclarés) des chiffres vérifiés (par exemple l'avis d'une entreprise ayant déjà exposé). Demander le recouvrement entre le public annoncé et la clientèle cible **en nombre absolu** (combien de visiteurs correspondent au profil), pas seulement en pourcentage. Calculer le coût par rendez-vous qualifié visé (coût total divisé par rendez-vous visés) et le comparer aux autres canaux de l'entreprise s'ils sont connus. Proposer toujours une alternative moins chère : venir sans stand avec des rendez-vous pris à l'avance, ou un petit déjeuner en marge du salon pour 8 à 12 entreprises cibles. Rendre une recommandation conditionnelle ; la décision est humaine.
2. **Chiffrer le coût total** : stand, aménagement, transport, hébergement, supports, personnel, temps de l'équipe, licences éventuelles. Ne pas oublier le coût du suivi. Comparer au plafond.
3. **Concevoir le stand** : un message unique lisible en trois secondes, l'offre mise en avant, un point de démonstration ou de conversation, un espace pour s'asseoir et noter. Respecter le règlement du salon (dimensions, électricité, sécurité) et l'accessibilité du stand.
4. **Préparer les rendez-vous avant d'arriver** : liste cible de 15 à 30 personnes ou entreprises nommées (listes d'exposants, d'intervenants, annonces de participation) ; demandes de rendez-vous de 15 minutes à un lieu et une heure précis, envoyées une à trois semaines avant, en brouillon soumis à l'humain. Un rendez-vous réservé vaut plus que dix rencontres au hasard.
5. **Préparer l'équipe** : rôles (accueil, expertise, qualification), plannings de présence avec pauses, briefing (pitch de dix secondes, trois questions de qualification, ce qu'on ne promet pas), consignes de collecte, règles de conduite avec les concurrents. Aucune promesse de prix ou de délai sans validation commerciale.
6. **Préparer la collecte conforme** : un formulaire (papier ou tablette) avec champs minimaux (nom, société, fonction, adresse professionnelle, besoin) ; un texte d'information court au point de collecte (qui est responsable, pourquoi, combien de temps, comment exercer ses droits) ; une case non précochée distincte pour accepter de recevoir des messages commerciaux par courrier électronique, conservée avec date et lieu de recueil. Un échange de carte de visite n'est pas un consentement à recevoir de la publicité par courrier électronique. Ne collecter aucune donnée sensible.
7. **Gérer les cas** : carte de visite reçue (usage limité à un premier message individualisé et non publicitaire, à faire valider juridiquement) ; badge scanné (le salon transmet des données selon ses propres règles : lire son règlement) ; refus de contact (consigné et respecté).
8. **Le jour du salon** : viser des conversations qualifiées plutôt que des contacts bruts ; après chaque échange, noter ce que la personne a dit, ce qui l'intéresse et la prochaine étape convenue, avec une note chaude, tiède ou froide ; un badge scanné sans conversation n'est pas un contact qualifié ; compter les contacts (nombre total, qualifiés, consentements recueillis) pour le bilan (compétence `bilan-evenement`).
9. **Suivi dans les 48 heures** : trier les contacts le soir même ; préparer le suivi par paliers avec la compétence `suivi-contacts-evenement` (message personnalisé seulement si une note de conversation existe). Message publicitaire par courrier électronique seulement si le consentement est consigné ; sinon message individualisé non publicitaire après validation, ou appel. Chaque message comporte un moyen simple de s'opposer. Envoi : décision humaine, le brouillon est préparé par la compétence.
10. **Clôturer** : saisie des contacts dans le CRM par le commercial, suppression des contacts sans suite à l'échéance fixée, mise à jour du registre des traitements (service juridique), puis bilan.

## Livrable

Un dossier en Markdown : tableau de comparaison des salons avec recommandation ; budget ; plan de stand et d'équipe ; briefing de l'équipe ; formulaire de collecte avec texte d'information et texte de consentement ; tableau de qualification ; brouillons des messages de suivi par niveau de contact ; calendrier des 48 heures ; liste des décisions humaines (inscription, paiement, envoi) et des points à vérifier.

## Critères de réussite

- Le salon est choisi sur des critères écrits et les chiffres déclarés par l'organisateur sont signalés comme tels.
- L'objectif est exprimé en rendez-vous qualifiés, avec le coût par rendez-vous visé et une alternative moins chère.
- Le texte d'information et le consentement existent avant le premier contact.
- Le consentement est distinct, non précoché, daté, et sa preuve est conservée.
- Chaque contact qualifié a une note de conversation et un suivi préparé dans les 48 heures, ou une raison écrite explique l'absence de suivi.
- Aucune inscription, aucun paiement, aucun envoi n'est présenté comme fait.

## Sources officielles

Pages ouvertes le 16/10/2026 :

- « Consentement », Autorité de protection des données, https://www.autoriteprotectiondonnees.be/professionnel/rgpd-/bases-juridiques/consentement : le consentement doit être libre, spécifique, éclairé et univoque (art. 4.11 du RGPD) ; geste positif clair, pas de case précochée ni de silence ; un consentement distinct par finalité ; le responsable doit pouvoir démontrer le consentement ; le retrait doit être aussi simple que l'octroi.
- « Vos obligations RGPD » (marketing direct), Autorité de protection des données, https://www.autoriteprotectiondonnees.be/professionnel/themes/marketing-direct/vos-obligations-rgpd : finalités précises, base juridique choisie avant le traitement, transparence, facilitation de l'exercice des droits, politique de confidentialité claire. La page renvoie à la recommandation 01/2025 sur le marketing direct, non lue en entier ici.
- Code de droit économique, art. XII.13 § 1er et § 2 (consentement préalable, libre, spécifique et informé pour la publicité par courrier électronique ; information et moyen électronique de s'opposer à chaque envoi), art. XI.174 (droit à l'image), texte consolidé sur Justel, https://www.ejustice.just.fgov.be/eli/loi/2013/02/28/2013A11134/justel, relu le 17/10/2026 (remplace la source secondaire d'un cabinet d'avocats citée dans la version 1.0.0).
- « Principe du consentement » (droit à l'image), Autorité de protection des données, https://www.autoriteprotectiondonnees.be/professionnel/themes/le-droit-a-l-image/la-nouvelle-loi-du-30-juillet-2018/principe-du-consentement, relue le 17/10/2026 : consentement écrit recommandé pour les images ciblées ; information suffisante pour les images d'ambiance.

## À vérifier par un professionnel

Le texte d'information, le consentement et l'usage des cartes de visite sont à faire valider par le délégué à la protection des données ou un juriste avant utilisation. La base légale retenue pour chaque finalité, la durée de conservation et la mise à jour du registre des traitements relèvent du service juridique.

## Limites

- Elle ne réserve pas de stand, ne paie pas et n'inscrit personne.
- Les chiffres de fréquentation des salons viennent des organisateurs et ne sont pas vérifiés.
- Elle ne tranche pas les cas limites de prospection (clients existants, contact par téléphone ou réseau social) : ils partent au juridique.
- Le délai de 48 heures est un objectif de gestion, pas une obligation légale.

## Exemple

Salon d'une journée pour une PME de services, objectif « 30 contacts qualifiés, 8 rendez-vous ». Deux salons comparés : A annonce 4 000 visiteurs (chiffre de l'organisateur) pour 2 900 euros de stand, B annonce 1 200 visiteurs, plus ciblés, pour 1 400 euros ; recommandation B, décision humaine. Formulaire : champs minimaux, case « Je souhaite recevoir des informations commerciales par courrier électronique » non précochée. Résultat : 41 contacts, 27 avec consentement, 14 sans. Suivi à 48 heures : 27 messages personnalisés (brouillons) et 14 appels ou messages individualisés non publicitaires après validation.

Cas d'échec : le commercial rentre avec 120 cartes de visite et demande d'« envoyer la newsletter à tout le monde ». La compétence refuse de préparer l'envoi publicitaire : une carte de visite n'est pas un consentement. Elle propose un message individuel non publicitaire à valider par le juridique, l'ajout d'un lien d'inscription volontaire et l'oubli des contacts sans suite à l'échéance fixée.

Cas d'échec évité (version 1.1.0) : la direction demande « faut-il payer 8 000 euros de stand pour la notoriété ? ». La compétence ne tranche pas sur la notoriété : elle demande un objectif de rendez-vous qualifiés, calcule le coût par rendez-vous (8 000 euros pour 10 rendez-vous visés : 800 euros), demande combien de visiteurs correspondent réellement à la clientèle cible, propose de venir sans stand avec 15 rendez-vous pris à l'avance et rend un avis conditionnel posé en carte.

## Origine de la méthode

Version 1.1.0 : étapes 1, 4 et 8 adaptées et traduites de github.com/coreyhaines31/marketingskills, `skills/events/SKILL.md`, sections « The Universal Arc: 20% Event, 80% Before-and-After » (parties « Before » et « During »), « Attending (No Booth, No Stage) » et « Common Mistakes » (objectif de notoriété sans rendez-vous, badges comptés comme contacts), commit dda3841f0b294e01e93b1541486beefbfab0915e, licence MIT, Copyright (c) 2025 Corey Haines. Modifications : réécriture en français, RGPD et Code de droit économique, carte de décision. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.

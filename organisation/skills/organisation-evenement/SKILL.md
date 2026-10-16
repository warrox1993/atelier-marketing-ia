---
name: "organisation-evenement"
description: "Prépare l'organisation d'un événement de PME belge : objectifs, public, format, budget, rétroplanning, prestataires, plan B météo et annulation, accessibilité, sécurité, autorisations communales selon la taille et assurance responsabilité civile. À utiliser pour monter ou revoir un événement (réception, portes ouvertes, conférence, soirée clients) ; jamais pour réserver, signer, payer ou envoyer une invitation, qui restent des décisions humaines."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "evenementiel"
---

# Organisation d'un événement

## Quand l'utiliser

- La direction ou le marketing veut un événement (portes ouvertes, soirée clients, formation, inauguration) et il faut passer de l'idée à un plan.
- Un événement est déjà annoncé à l'oral et personne ne sait ce qui est réservé, autorisé ou assuré.
- Un événement approche et il faut vérifier les autorisations, la sécurité et le plan B.

## Objectif

Un dossier d'événement que l'humain peut approuver : pourquoi (objectif mesurable), pour qui, quoi, où, quand, pour combien, avec quels prestataires, quelles autorisations et quelle assurance, et que faire si la météo, un prestataire ou l'affluence déraille. Chaque inconnue est écrite comme telle ; rien n'est réservé ni envoyé.

## Prérequis

- Le texte d'origine de la demande et le commanditaire (un rôle suffit).
- Le budget plafond et la date ou la période visée, fixés par la direction.
- Les objectifs et cibles marketing, obtenus par le bureau de liaison si le marketing est concerné.
- Le calendrier des événements déjà prévus, pour éviter les conflits de dates et de ressources.

## Entrées

- `demande` : texte d'origine, recopié sans reformulation.
- `contraintes` : budget plafond, date butoir, lieu imposé, nombre de participants attendu s'il est connu.
- `prestataires` : devis et descriptifs de lieux ou de traiteurs reçus (documents de la tâche).
- `accessibilite` : besoins connus des invités, sans nom ni donnée de santé.

## Étapes

1. **Fixer l'objectif** en une phrase mesurable (par exemple : « 60 participants dont 15 prospects qualifiés, 8 rendez-vous pris »). Un objectif sans chiffre est renvoyé au commanditaire ; le bilan en dépendra (compétence `bilan-evenement`).
2. **Décrire le public** : qui, combien, d'où ils viennent, ce qu'ils attendent. Pas de liste nominative ici.
3. **Choisir le format** (réception, conférence, atelier, portes ouvertes, hybride), l'heure et la durée, en justifiant par l'objectif et le public.
4. **Estimer la taille** (nombre de personnes, intérieur ou extérieur, espace privé ou public, musique, alcool, installations temporaires). C'est elle qui détermine les autorisations et la sécurité à l'étape 7.
5. **Construire le budget prévisionnel** par poste (lieu, restauration, matériel, personnel, communication, assurance, droits musicaux, accessibilité, imprévus). Chaque montant renvoie à un devis ou est marqué « hypothèse ». Prévoir une ligne d'imprévus déclarée comme hypothèse. Le total est comparé au plafond.
6. **Choisir les prestataires** : demander des devis par un cahier des charges (brouillon, non envoyé) ; comparer sur les critères du demandeur (compétence `comparaison-offres-fournisseurs` ou `cahier-des-charges-achat` du service achats, via le coordinateur). Aucune offre n'est transmise à un concurrent.
7. **Vérifier autorisations, sécurité et assurance** : pour un événement en espace public, la commune (collège communal ou bourgmestre) autorise, avec un formulaire propre à la commune et, selon la taille et le lieu, des avis de la police, du service d'incendie et de la mobilité. Pour un lieu privé ou fermé, vérifier les règles du lieu et du règlement communal. Lister les documents à fournir et le délai demandé par la commune concernée (information à obtenir, jamais supposée). Vérifier avec l'assureur que l'activité est couverte par l'assurance responsabilité civile de l'organisateur et si une couverture complémentaire est requise. Vérifier la licence musicale si de la musique est diffusée.
8. **Prévoir l'accessibilité** : accès sans marche, toilettes adaptées, places réservées, cheminement, information préalable dans l'invitation, contact pour les besoins particuliers. S'appuyer sur une checklist reconnue (voir sources) et sur des organismes d'accessibilité.
9. **Prévoir la sécurité** : capacité maximale, issues, personnel et premiers secours, consignes, interlocuteur d'urgence le jour même, selon les exigences de la commune ou du lieu.
10. **Écrire le plan B** : événement en extérieur (seuil météo et heure de décision, solution de repli), annulation (conditions de remboursement et de communication, assurance éventuelle), prestataire défaillant (remplaçant identifié), affluence très inférieure ou supérieure. Pour chacun : déclencheur, responsable, coût estimé ou « information manquante ».
11. **Bâtir le rétroplanning** à rebours de la date : décision de la charte, réservation du lieu, dépôt des autorisations (avec le délai demandé par la commune), commande du matériel, invitations, relances, répétition, jour J, bilan. Chaque jalon a un responsable et une échéance.
12. **Préparer les invitations** (brouillon uniquement) : texte, liste de destinataires issue d'une base légitime, information sur les données et sur les photos ou vidéos. Une invitation commerciale par courrier électronique suppose un consentement préalable (voir compétence `salon-professionnel` pour le texte de consentement). Envoi : décision humaine.
13. **Lister les décisions humaines** à poser en cartes : chaque réservation, chaque contrat de prestataire, chaque dépense, chaque dépôt d'autorisation, chaque assurance, chaque envoi d'invitation.

## Livrable

Un dossier en Markdown : charte d'une page (objectif, public, format, date, lieu, budget) ; budget par poste ; tableau de comparaison des prestataires avec renvois aux devis ; tableau autorisations, assurance, sécurité, accessibilité (exigence, source ou « à vérifier », responsable, échéance) ; plan B ; rétroplanning ; brouillons d'invitation ; liste des décisions humaines et des informations manquantes ; table des faits sourcés.

## Critères de réussite

- L'objectif est mesurable et les indicateurs du bilan en découlent.
- Chaque montant renvoie à un devis ou porte la mention « hypothèse ».
- Aucune autorisation, aucun délai administratif ni aucune règle de sécurité n'est affirmé sans source : sinon « à vérifier auprès de la commune » avec la question précise.
- Le plan B a un déclencheur écrit et un responsable.
- Aucune réservation, aucun contrat, aucune dépense et aucune invitation n'est présentée comme faite.
- L'accessibilité figure dans la charte et dans les invitations, pas seulement en annexe.

## Sources officielles

Pages ouvertes le 16/10/2026 :

- « Organisation d'événements », be.brussels (Région de Bruxelles-Capitale), https://be.brussels/en/entrepreneurship-innovation/doing-business-brussels/licences-authorizations-and-access-profession/organisation-events : en Région bruxelloise, le collège communal et/ou le bourgmestre autorise l'événement après analyse de faisabilité ; documents cités : formulaire de la commune, autorisation de la police, plan de mise en oeuvre technique, accord de Bruxelles Mobilité, accord du SIAMU (incendie), certificat de conformité Horeca si applicable ; frais variables selon la commune. Page en anglais, limitée à Bruxelles : pour la Wallonie et la Flandre, chaque commune publie ses règles et aucune source équivalente n'a été ouverte. Cette page ne mentionne pas l'assurance : aucune source officielle sur l'assurance responsabilité civile n'a été ouverte.
- « Licence musicale pour les événements », Sabam, https://www.sabam.be/fr/clients-utilisateurs/licences/evenements : une licence couvre droits d'auteur et droits voisins pour la musique diffusée, via la licence Unisono. La page ne donne ni délais ni tarifs : à demander à la société de gestion.
- Source secondaire : « Visit.brussels lance le Handy Events Guide », BX1, https://bx1.be/categories/news/visit-brussels-lance-le-handy-events-guide/ : checklist gratuite en trois langues pour des événements accessibles dans l'espace public, conçue avec Access-i ; article de presse, à compléter par le guide lui-même.

## À vérifier par un professionnel

Les autorisations, avis de sécurité et délais relèvent de la commune du lieu (et du service d'incendie) ; l'assurance responsabilité civile relève de l'assureur ou du courtier ; les droits musicaux de la société de gestion ; les mentions d'information et le droit à l'image d'un juriste. Aucun de ces points ne se tranche sans eux.

## Limites

- Les règles varient d'une commune à l'autre : aucun seuil de taille ni délai n'est généralisable, la compétence les fait demander.
- Elle ne remplace ni un conseiller en sécurité, ni un avis du service d'incendie, ni un courtier.
- Les montants d'exemple et les échéances en jours sont des repères de planification, pas des normes.
- Elle ne réserve, ne signe, ne paie et n'invite pas.

## Exemple

Demande : « soirée clients en octobre pour une cinquantaine de personnes dans notre atelier ». Budget plafond 6 000 euros (direction). Étapes : objectif « 40 présents, 10 rendez-vous commerciaux » ; lieu privé fermé, donc pas d'autorisation de voie publique mais règles de capacité de l'atelier et assurance à confirmer ; traiteur : deux devis comparés, total 3 850 euros contre 4 200 euros (devis p. 2) ; musique d'ambiance : licence à vérifier ; accessibilité : atelier de plain-pied, toilettes adaptées à confirmer ; plan B : si moins de 25 inscrits à J-10, décision humaine de maintenir ou reporter. Cartes posées : réservation du traiteur, signature du devis, envoi des invitations.

Cas d'échec : le commanditaire écrit « fais la réservation du château, c'est urgent ». La compétence ne réserve pas : elle prépare le brouillon de demande, la comparaison avec le plafond, et pose une carte « Réserver le lieu, acompte de X euros » ; en l'absence de montant dans le devis, elle écrit « information manquante : acompte » et bloque la carte plutôt que d'inventer un chiffre.

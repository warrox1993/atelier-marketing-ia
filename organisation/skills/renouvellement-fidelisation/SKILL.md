---
name: "renouvellement-fidelisation"
description: "Tient le calendrier des échéances de contrats d'une entreprise belge, repère les signaux de départ d'un client, prépare l'offre de reconduction et applique les règles de reconduction tacite (clause signalée, délai raisonnable pour s'opposer, préavis). À utiliser pour un portefeuille de contrats à échéance, une fiche de renouvellement ou un message de rappel à valider ; jamais pour contacter le client, résilier, fixer une prime ou déduire une résiliation d'un silence."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commercial"
---

# Renouvellement et fidélisation

## Quand l'utiliser

- Un portefeuille de contrats doit être suivi par échéance, avec les dates limites de préavis.
- Un client montre des signes de départ et le renouvellement doit être préparé.
- Une offre de reconduction ou un message de rappel doit être rédigé pour validation.

## Objectif

Éviter les renouvellements manqués et les reconductions subies : chaque échéance est vue assez tôt, chaque dossier de renouvellement est préparé, et les règles belges de reconduction tacite sont respectées dans ce que l'entreprise propose.

## Prérequis

- L'échéancier des contrats : client, contrat, date de début, durée, date d'échéance, préavis, clause de reconduction (texte exact).
- Les notes de gestion et d'échanges du client, limitées à ce que la tâche exige.
- Le statut du client : entreprise ou consommateur (les règles diffèrent).

## Entrées

- `periode` : fenêtre à traiter (par exemple les 120 prochains jours).
- `portefeuille` : les contrats concernés.
- `statut` : B2B ou B2C pour chaque contrat.

## Étapes

1. Construire le calendrier : pour chaque contrat, échéance, date limite de préavis (échéance moins le préavis lu dans le contrat), date à laquelle contacter le client (par exemple préavis moins 30 jours), action proposée. Un préavis absent du contrat s'écrit « à vérifier », jamais supposé.
2. Classer les contrats par urgence : date limite dépassée, moins de 30 jours, 30 à 90 jours, plus de 90 jours.
3. Chercher les signaux de départ dans le dossier, sans les amplifier : baisse d'activité ou de volume, réclamation non résolue, interlocuteur parti, retard de paiement répété, demande de prix ou de résiliation, changement de situation de l'entreprise (cession, croissance, fermeture), concurrent cité. Chaque signal est écrit comme un fait du dossier avec sa date ; l'interprétation reste étiquetée « supposé ».
4. Écrire les écarts entre le contrat actuel et la situation connue (nouveaux besoins, changement de taille), sans conseiller un produit.
5. Préparer l'offre de reconduction : rappel de ce qui a été fourni, nouveautés éventuelles, prix de reconduction fourni par le responsable (jamais calculé ici), conditions, durée, et la date limite pour répondre.
6. Appliquer les règles de reconduction tacite (résumé ci-dessous). Vérifier que la clause est lisible, que le délai pour s'opposer est raisonnable, et que le rappel est envoyé à temps pour que le client puisse réellement décider.
7. Rédiger un projet de message de rappel, court, factuel, sans pression, avec le choix offert au client (reconduire, modifier, ne pas reconduire) et la date limite. Il est soumis à validation, jamais envoyé.
8. Lister les actions humaines : qui appelle, qui décide d'une remise, qui prépare la proposition.

### Règles de reconduction tacite en Belgique (résumé à faire valider)

- Un contrat reconduit tacitement devient en principe un contrat à durée indéterminée, sauf clause qui prévoit des durées déterminées successives.
- Contrats avec un consommateur (Code de droit économique, livre VI) : une clause de reconduction automatique qui fixe une date limite d'opposition excessivement éloignée de la fin du contrat est abusive (art. VI.83, 20°) ; la clause doit être en caractères gras, indiquer la date limite d'opposition et les modalités de notification, et le préavis après reconduction ne peut dépasser deux mois (art. VI.91, tel que rapporté par la source consultée).
- Contrats entre entreprises (art. VI.91/5, 2°) : est présumée abusive la clause qui proroge ou renouvelle tacitement un contrat sans délai raisonnable de résiliation. Le caractère raisonnable s'apprécie au cas par cas ; des juges ont admis trois mois pour un contrat de six mois et six semaines pour une adhésion annuelle à un club de sport.
- Un silence du client n'est jamais traité comme une volonté de résilier, ni, hors clause valable, comme un accord à une nouvelle durée ou à un nouveau prix.
- Secteur réglementé (assurance, énergie, télécoms, crédit) : des règles propres peuvent s'ajouter ; les délais s'ils existent sont lus dans les conditions du contrat, sinon « à vérifier ».

## Livrable

Un calendrier des renouvellements ; une fiche par renouvellement (contrat, échéance, préavis, signaux de départ datés, écarts, offre, clause de reconduction vérifiée) ; un projet de message de rappel à valider ; la liste des points à confirmer.

## Critères de réussite

- Aucune échéance de la période n'est absente du calendrier ; chaque date limite de préavis est calculée à partir du contrat et vérifiable.
- Les signaux de départ sont des faits datés du dossier ; les interprétations sont étiquetées.
- Aucune prime ni aucun prix de reconduction n'est calculé par l'agent.
- La clause de reconduction de chaque contrat est contrôlée contre les règles ci-dessus, avec les points litigieux signalés.
- Le message de rappel laisse un vrai choix au client.

## Limites

- Le résumé juridique repose sur des sources de vulgarisation et de doctrine, pas sur le texte officiel du Code de droit économique, qui n'a pas pu être consulté le 16/10/2026 : tous les numéros d'articles sont à vérifier. À faire valider par un juriste ou un avocat en droit des contrats avant d'imposer ou de contester une clause.
- Un contrat d'assurance, de crédit ou d'un autre secteur réglementé suit ses règles propres : à faire vérifier par un intermédiaire inscrit ou un juriste du secteur.
- L'agent ne contacte pas le client, n'annule aucun contrat, ne déduit aucune résiliation d'un silence.
- Limitation du RGPD : ne traiter que les données nécessaires au suivi du contrat.

## Sources officielles

- « B2B ou B2C : jusqu'où un renouvellement tacite oblige-t-il les deux parties ? », Forum for the Future, https://blog.forumforthefuture.be/fr/article/b2b-ou-b2c-jusquou-un-renouvellement-tacite-oblige-les-deux-parties-consommateur-etou-entreprise/17060 (consultée le 16/10/2026) : articles VI.83 20°, VI.91 et VI.91/5 2° du Code de droit économique, jurisprudence sur les préavis. Source de doctrine, pas le texte officiel.
- « Droit de rétractation », Droits Quotidiens, https://www.droitsquotidiens.be/fr/question/jachete-une-chose-et-je-regrette-que-puis-je-faire (consultée le 16/10/2026) : rétractation de 14 jours pour les contrats à distance, utile quand le renouvellement se conclut à distance avec un consommateur.
- Note : les pages du SPF Économie n'ont pas pu être ouvertes le 16/10/2026 (page de vérification antirobot).

## Exemple

Cas nominal : trois contrats arrivent à échéance dans 90 jours. Le calendrier donne, pour un contrat entre entreprises d'un an avec reconduction tacite et préavis de trois mois, une date limite de préavis dans 2 jours : urgence maximale. La fiche relève deux signaux datés (retard de paiement répété depuis mars, interlocuteur remplacé en août), écrit « risque de départ : supposé », prépare l'offre de reconduction avec le prix fourni par le responsable et un message de rappel qui offre trois choix.

Cas d'échec : le contrat d'un consommateur contient une reconduction tacite sans date limite d'opposition ni caractères gras, et le préavis n'est pas lu. L'agent ne la déclare pas nulle et n'applique pas de délai de mémoire : il signale « clause à risque, préavis : à vérifier », propose de ne pas se prévaloir de la reconduction avant l'avis d'un juriste, et ne déduit rien du silence du client.

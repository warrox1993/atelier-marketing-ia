---
name: "renouvellement-fidelisation"
description: "Tient le calendrier des échéances de contrats d'une entreprise belge, repère les signaux de départ d'un client, rend un verdict « en bonne voie, à surveiller, à risque » avec preuve, contrôle la propreté du portefeuille, prépare l'offre de reconduction et applique les règles de reconduction tacite (clause signalée, délai raisonnable pour s'opposer, préavis). À utiliser pour un portefeuille de contrats à échéance, une fiche de renouvellement ou un message de rappel à valider ; jamais pour contacter le client, résilier, fixer une prime ou déduire une résiliation d'un silence."
metadata:
  version: "1.2.0"
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
3. Chercher les signaux de départ dans le dossier, sans les amplifier. Chaque signal est écrit comme un fait du dossier avec sa date ; l'interprétation reste étiquetée « supposé ».
   | Signal | Effet sur le risque |
   | --- | --- |
   | Aucun échange avec le client depuis 30 jours ou plus avant l'échéance | hausse |
   | Interlocuteur principal ou décideur parti ou remplacé | hausse |
   | Réclamation ou escalade non résolue (réponse de la liaison SAV) | hausse |
   | Sinistre mal vécu, refus ou indemnisation contestée (réponse de la liaison SAV) | hausse |
   | Hausse de prime ou de prix annoncée à l'échéance | hausse |
   | Changement de situation (cession, déménagement, cessation, naissance, retraite) | hausse ou extension, à confirmer |
   | Retard de paiement répété (réponse de la liaison recouvrement) | hausse |
   | Demande de prix, de résiliation ou concurrent cité | hausse |
   | Discussion d'extension en cours | baisse |
   | Contrat pluriannuel ou client de longue date satisfait (preuve écrite) | baisse |
   Les poids s'ajustent à ce qui a réellement précédé les départs dans l'entreprise.
   Si l'entreprise tient un score de santé du client (de 0 à 100), appliquer ces garde-fous (méthode amont 2.13.0) :
   - chaque composante (usage, sentiment, facturation) est ramenée d'abord à la même échelle de 0 à 100, où plus haut
     veut dire en meilleure santé, par une correspondance écrite ; ne jamais additionner tels quels un nombre de
     connexions, une note de 1 à 5 et un pourcentage ;
   - un signal manquant ou périmé est « indisponible », jamais compté comme sain ni comme nul ; fixer une durée de
     fraîcheur et une couverture minimale avant d'utiliser le score ;
   - si un score partiel est permis, il vaut la somme (poids × score observé) divisée par la somme des poids observés,
     et la couverture (somme des poids observés) est écrite à côté ; sinon le résultat est « données insuffisantes »
     (exemple : connexions 80 et usage 60 seuls, poids 0,30 et 0,25, donnent 70,9 avec 55 % de couverture, trop peu
     pour classer un client comme sain sans règle de couverture) ;
   - les poids et les seuils d'intervention sont des points de départ illustratifs : les valider sur les départs et
     renouvellements réellement observés avant de s'y fier ;
   - une note individuelle de recommandation de 0 à 6 est un détracteur ; ne pas la confondre avec le NPS agrégé
     (de -100 à 100).
4. Rendre un verdict par renouvellement : « en bonne voie », « à surveiller » ou « à risque », avec les signaux qui le portent. Les dossiers « à risque » forment un bloc à traiter dans la semaine (signal précis et démarche proposée).
5. Contrôler la propreté du portefeuille : échéance sans dossier de renouvellement, montant manquant, date de suivi postérieure à l'échéance, préavis absent. Chaque correction est proposée, jamais appliquée.
6. Écrire les écarts entre le contrat actuel et la situation connue (nouveaux besoins, changement de taille), sans conseiller un produit.
7. Préparer l'offre de reconduction : rappel de ce qui a été fourni, nouveautés éventuelles, prix de reconduction fourni par le responsable (jamais calculé ici), conditions, durée, et la date limite pour répondre.
8. Appliquer les règles de reconduction tacite (résumé ci-dessous). Vérifier que la clause est lisible, que le délai pour s'opposer est raisonnable, et que le rappel est envoyé à temps pour que le client puisse réellement décider.
9. Rédiger un projet de message de rappel, court, factuel, sans pression, avec le choix offert au client (reconduire, modifier, ne pas reconduire) et la date limite. Il est soumis à validation, jamais envoyé.
10. Lister les actions humaines : qui appelle, qui décide d'une remise, qui prépare la proposition.

### Règles de reconduction tacite en Belgique (résumé à faire valider)

- Un contrat reconduit tacitement devient en principe un contrat à durée indéterminée, sauf clause qui prévoit des durées déterminées successives.
- Contrats avec un consommateur (Code de droit économique, livre VI) : une clause de reconduction automatique qui fixe une date limite d'opposition excessivement éloignée de la fin du contrat est abusive (art. VI.83, 20°). Pour un contrat de service à durée déterminée, la clause figure en caractères gras, dans un cadre distinct, au recto de la première page, et mentionne ses conséquences, la date ultime d'opposition et les modalités de notification (art. VI.91 § 1er). Sauf contrat d'un mois ou moins, l'entreprise informe le consommateur sur un support durable de l'imminence de la reconduction et de la possibilité de s'y opposer, au plus tard quinze jours avant cette date ultime (art. VI.91 § 1er/1). Après reconduction, le consommateur peut résilier à tout moment, sans indemnité, avec un préavis de deux mois au plus (art. VI.91 § 2), sans préjudice de la loi du 4 avril 2014 relative aux assurances.
- Contrats entre entreprises (art. VI.91/5, 2°) : est présumée abusive, sauf preuve contraire, la clause qui proroge ou renouvelle tacitement un contrat à durée déterminée sans délai raisonnable de résiliation. Le caractère raisonnable s'apprécie au cas par cas.
- Un silence du client n'est jamais traité comme une volonté de résilier, ni, hors clause valable, comme un accord à une nouvelle durée ou à un nouveau prix.
- Secteur réglementé (assurance, énergie, télécoms, crédit) : des règles propres s'ajoutent ou priment (pour l'assurance, l'art. VI.91 § 2 réserve expressément la loi du 4 avril 2014) ; les délais sont lus dans les conditions du contrat, sinon « à vérifier ».

## Livrable

Un tableau radar (client, échéance, montant, verdict, signal principal, prochaine démarche) ; le bloc « à risque » ; les corrections de propreté proposées ; une fiche par renouvellement (contrat, échéance, préavis, signaux de départ datés, écarts, offre, clause de reconduction vérifiée) ; un projet de message de rappel à valider ; la liste des points à confirmer.

## Critères de réussite

- Aucune échéance de la période n'est absente du calendrier ; chaque date limite de préavis est calculée à partir du contrat et vérifiable.
- Les signaux de départ sont des faits datés du dossier ; les interprétations sont étiquetées.
- Chaque renouvellement a un verdict porté par des signaux nommés.
- Pour un consommateur, la date d'information « quinze jours avant la date ultime d'opposition » figure au calendrier.
- Aucune prime ni aucun prix de reconduction n'est calculé par l'agent.
- La clause de reconduction de chaque contrat est contrôlée contre les règles ci-dessus, avec les points litigieux signalés.
- Le message de rappel laisse un vrai choix au client.

## Limites

- Le résumé juridique est relu sur le texte consolidé du Code de droit économique (Justel, 17/10/2026) mais ne vaut pas avis : à faire valider par un juriste ou un avocat en droit des contrats avant d'imposer ou de contester une clause.
- Un contrat d'assurance, de crédit ou d'un autre secteur réglementé suit ses règles propres : à faire vérifier par un intermédiaire inscrit ou un juriste du secteur.
- L'agent ne contacte pas le client, n'annule aucun contrat, ne déduit aucune résiliation d'un silence.
- Limitation du RGPD : ne traiter que les données nécessaires au suivi du contrat.

## Sources officielles

Consultées le 17/10/2026 :

- Code de droit économique, texte consolidé sur Justel, https://www.ejustice.just.fgov.be/eli/loi/2013/02/28/2013A11134/justel :
  art. VI.83, 20° (date limite d'opposition excessivement éloignée), art. VI.91 § 1er, § 1er/1 et § 2 (forme de la
  clause, information quinze jours avant la date ultime, résiliation avec préavis de deux mois au plus), art. VI.91/5, 2°
  (reconduction tacite entre entreprises sans délai raisonnable de résiliation), art. VI.47 (rétractation de 14 jours
  pour un renouvellement conclu à distance avec un consommateur).

## À vérifier par un professionnel

- Les règles propres au contrat d'assurance (durée, reconduction, résiliation, préavis) prévues par la loi du 4 avril
  2014 relative aux assurances : articles à relire et à confirmer par l'intermédiaire inscrit ou un juriste du secteur.
- Le caractère « raisonnable » d'un délai de résiliation entre entreprises, au cas par cas, par un juriste.

## Exemple

Cas nominal : trois contrats arrivent à échéance dans 90 jours. Le calendrier donne, pour un contrat entre entreprises d'un an avec reconduction tacite et préavis de trois mois, une date limite de préavis dans 2 jours : urgence maximale. La fiche relève deux signaux datés (retard de paiement répété depuis mars, interlocuteur remplacé en août), écrit « risque de départ : supposé », prépare l'offre de reconduction avec le prix fourni par le responsable et un message de rappel qui offre trois choix.

Cas d'échec : le contrat d'un consommateur contient une reconduction tacite sans date limite d'opposition ni caractères gras, et le préavis n'est pas lu. L'agent ne la déclare pas nulle et n'applique pas de délai de mémoire : il signale « clause à risque, préavis : à vérifier », propose de ne pas se prévaloir de la reconduction avant l'avis d'un juriste, et ne déduit rien du silence du client.

## Origine de la méthode

Table de signaux, verdicts et contrôle de propreté adaptés et traduits de github.com/anthropics/knowledge-work-plugins,
`sales/skills/renewal-radar/SKILL.md`, étapes 3 et 4, commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence
Apache 2.0 ; liste des signaux faibles de départ adaptée de github.com/coreyhaines31/marketingskills,
`skills/churn-prevention/SKILL.md`, section « Churn Prediction & Proactive Retention », commit
dda3841f0b294e01e93b1541486beefbfab0915e, licence MIT, Copyright (c) 2025 Corey Haines (garde-fous du score de santé : version 2.13.0, commit
e85f3cbc2e4a79bf33b2a12e9bdd9087d414735b). Modifications : réécriture en
français, signaux propres à l'assurance, droit belge. Texte des licences et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.

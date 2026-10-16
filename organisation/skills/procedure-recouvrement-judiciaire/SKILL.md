---
name: "procedure-recouvrement-judiciaire"
description: "Prépare le dossier de décision pour passer du recouvrement amiable au recouvrement judiciaire d'une créance d'une PME belge : critères pour décider, choix entre la procédure de recouvrement de dettes d'argent non contestées entre entreprises (articles 1394/20 à 1394/27 du Code judiciaire, par huissier de justice à la demande de l'avocat du créancier), l'injonction de payer (articles 1338 à 1344) et la voie ordinaire, étapes, délais, coûts à chiffrer et pièces à réunir. À utiliser quand une créance reste impayée après les relances amiables ; jamais pour lancer, signifier, citer ou saisir, pour choisir à la place de l'humain, ni pour une créance contestée présentée comme non contestée, une dette hors champ ou un débiteur en procédure collective."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "recouvrement"
---

# Passer au recouvrement judiciaire d'une créance : préparer la décision

## Quand l'utiliser

- Les relances amiables sont épuisées (rappel, relance ferme, mise en demeure) et le débiteur ne paie ni ne répond.
- Une créance importante vieillit dans la balance âgée et la direction se demande s'il faut une procédure.
- L'entreprise hésite entre une procédure rapide et une action ordinaire devant le tribunal, et veut les coûts, délais et risques côte à côte.
- Un avocat ou un huissier de justice doit recevoir un dossier complet et ordonné.

## Objectif

Un dossier de décision lisible pour l'humain : la créance, ses preuves, l'historique amiable, la voie recommandée avec les raisons, le calendrier réaliste, les coûts à faire chiffrer, les risques, et la question exacte à trancher. La compétence prépare ; elle ne lance, ne signifie, ne cite et ne saisit rien. La décision de passer au judiciaire est toujours humaine, prise avec un avocat.

## Prérequis

- La créance : débiteur (entreprise ou consommateur), montant en principal, intérêts et indemnités déjà dus, échéance, nature (vente, service, autre).
- Les pièces : contrat ou bon de commande, conditions générales acceptées, facture, preuve de livraison ou d'exécution, relances et accusés d'envoi.
- La confirmation écrite que la créance n'est pas contestée, ou la liste des contestations reçues.
- Le statut du débiteur si connu par les documents fournis : inscrit à la Banque-Carrefour des Entreprises, procédure collective connue ou non.
- La balance âgée du débiteur et le total des créances de l'entreprise, pour juger de l'enjeu.

## Entrées

- `creance` et `pieces` comme ci-dessus.
- `historique_amiable` : dates, supports, réponses.
- `type_debiteur` : entreprise ou consommateur (confirmé par un fait).
- `budget_et_priorite` : ce que la direction accepte de dépenser et d'attendre.
- `avis_avocat` s'il existe déjà.

## Étapes

1. **Vérifier que l'étape amiable est complète.** Pour un consommateur, les règles du livre XIX (premier rappel gratuit, délais, mise en demeure aux mentions complètes) doivent avoir été respectées : sinon la clause indemnitaire peut tomber et l'étape judiciaire est fragilisée. Voir la compétence « relance-amiable-b2b-b2c ». Pour une entreprise, au moins une mise en demeure écrite à date certaine est recommandée.
2. **Qualifier la créance.** Certaine (existence non douteuse), exigible (échéance passée), liquide (montant chiffré), non contestée. Toute contestation reçue, même tardive ou maladroite, est notée en toutes lettres : elle change la voie.
3. **Écarter les cas hors champ.** Pas de procédure rapide si le débiteur est en faillite, en réorganisation judiciaire ou en règlement collectif de dettes (la créance se déclare alors dans cette procédure, avec un avocat), ni pour une dette qui n'a pas d'origine dans l'activité de l'entreprise, ni pour certaines dettes non contractuelles (voir la procédure ci-dessous).
4. **Comparer les voies** (tableau plus bas) et recommander une voie, avec une alternative et la raison.
5. **Chiffrer l'enjeu.** Montant principal, accessoires, coûts à faire chiffrer (honoraires de l'avocat, frais et honoraires de l'huissier de justice, frais de greffe ou de procédure selon la voie), part des coûts récupérable sur le débiteur, probabilité de paiement. Aucun tarif n'est inventé : la compétence liste les devis à demander. Elle compare ensuite : montant espéré moins coûts non récupérables.
6. **Évaluer la solvabilité** à partir des documents seulement (retards croissants, chèques retournés, informations fournies). Elle ne mène aucune enquête extérieure ; elle propose à l'humain de demander à l'huissier ou à l'avocat de vérifier l'état de solvabilité avant de dépenser.
7. **Proposer le calendrier** réaliste de la voie recommandée, en jours ouvrables et en semaines, avec les points où le débiteur peut tout arrêter en payant ou en contestant.
8. **Préparer la carte de décision** : question, options (lancer par la voie recommandée, lancer par l'alternative, attendre et relancer, négocier un plan de paiement, passer à l'arbitrage de la direction pour une éventuelle perte), conséquences, délai pour décider.
9. **Constituer le dossier à transmettre** à l'avocat : chronologie, pièces numérotées, calcul du principal et des accessoires, historique des contacts.

### Les voies, côte à côte

| | Recouvrement de dettes d'argent non contestées (extrajudiciaire) | Injonction de payer | Voie ordinaire (citation) |
| --- | --- | --- | --- |
| Base | Code judiciaire, articles 1394/20 à 1394/27 | Code judiciaire, articles 1338 à 1344 | Code judiciaire, procédure civile |
| Débiteur | Entreprise inscrite à la BCE (ou registre européen interopérable) | Domicilié ou résidant en Belgique | Tout débiteur |
| Créancier | Entreprise | Toute partie, avec avocat | Toute partie, avec avocat |
| Créance | Somme d'argent certaine, exigible, non contestée, liée à l'activité | Dette liquide en argent, justifiée par un écrit du débiteur (voir limites) | Toute créance, y compris contestée |
| Qui agit | Huissier de justice, à la demande de l'avocat du créancier | Avocat, requête au juge | Avocat, citation par huissier de justice |
| Contrôle du juge | Non, titre délivré après constat d'absence de réaction | Oui, sur requête | Oui, débat complet |
| Rapidité indicative | Environ 6 à 8 semaines jusqu'au titre exécutoire (source secondaire) | Le juge statue dans les quinze jours du dépôt de la requête ; délais totaux à faire confirmer par l'avocat | En général plus long, à faire chiffrer par l'avocat |
| Si le débiteur conteste | La procédure s'arrête ; le créancier agit ensuite en justice | Opposition ou appel du débiteur | C'est le débat |

### Procédure de recouvrement de dettes d'argent non contestées, étape par étape

1. **Conditions.** Dette en argent, certaine, exigible, non contestée, quel qu'en soit le montant, augmentée des majorations légales et des frais, et d'intérêts et clauses indemnitaires à concurrence de 10 % au maximum du principal. Exclus : les autorités publiques visées à l'article 1412bis, les créanciers ou débiteurs non inscrits à la Banque-Carrefour des Entreprises (ou dans un registre européen interopérable), les opérations étrangères à l'activité de l'entreprise, la faillite, la réorganisation judiciaire, le règlement collectif de dettes et les autres concours légaux, et les obligations non contractuelles, sauf accord, reconnaissance de dette ou dette de propriété commune.
2. **Sommation.** À la demande de l'avocat du créancier, l'huissier de justice signifie au débiteur une sommation de payer, à peine de nullité avec les mentions de l'article 43 et celles de l'article 1394/21 : description de l'obligation, justification de chaque montant, sommation de payer dans le mois et manière de payer, possibilités de réaction, inscription des deux parties à la BCE. Sont annexés les pièces probantes et le formulaire de réponse.
3. **Réaction du débiteur dans le mois.** Il paie (la procédure prend fin), demande des facilités de paiement (le recouvrement est suspendu si un accord est conclu), conteste la dette en indiquant ses raisons (la procédure prend fin, le créancier peut agir en justice), ou ne réagit pas.
4. **Procès-verbal de non-contestation.** Au plus tôt huit jours après la fin du mois, à la demande du créancier, l'huissier de justice constate l'absence de paiement et de réaction, ou le non-respect d'un plan de paiement, avec un décompte actualisé.
5. **Titre exécutoire.** Le procès-verbal est rendu exécutoire par un magistrat du Comité de gestion et de surveillance du fichier central des avis de saisie, de délégation, de cession, de règlement collectif de dettes et de protêt, sur requête de l'huissier. Il constitue alors un titre qui permet l'exécution forcée selon la cinquième partie du Code judiciaire (saisies).
6. **Recours.** L'exécution n'est suspendue que par une action en justice, introduite par requête contradictoire dans un délai d'un mois à compter de la signification du procès-verbal. Le recouvrement entièrement exécuté vaut transaction pour toute la dette, accessoires compris.
7. **Registre central.** L'huissier de justice communique les actes au Registre central pour le recouvrement de dettes d'argent non contestées, tenu par la Chambre nationale des huissiers de justice (conservation dix ans).

### Injonction de payer, points clés

- Sommation préalable, signifiée par exploit d'huissier ou envoyée par lettre recommandée avec accusé de réception, avec la reproduction des articles du chapitre et la mise en demeure de payer dans les quinze jours, le montant et le juge qui serait saisi, le tout à peine de nullité.
- Requête signée par l'avocat, déposée au plus tard dans les quinze jours qui suivent ce délai, avec le décompte de la créance, la pièce qui fonde la demande et la preuve de la sommation.
- Le juge accueille ou rejette dans les quinze jours du dépôt, en chambre du conseil ; il peut accorder des délais de grâce.
- L'ordonnance a les effets d'un jugement par défaut ; elle est signifiée au débiteur, qui peut former opposition ou appel ; à défaut, il peut être contraint de payer. Si la requête est rejetée, la voie ordinaire reste ouverte.
- La procédure ne s'applique que si le débiteur est domicilié ou réside en Belgique. Elle vise les demandes de la compétence du juge de paix et, pour une contestation entre entreprises relevant de l'article 573, du tribunal de l'entreprise quel que soit le montant. Le texte consulté mentionne encore un seuil de 1 860 euros pour le juge de paix et exige que la demande paraisse justifiée par un écrit émanant du débiteur : seuil et condition à faire vérifier par l'avocat avant de choisir cette voie.

## Livrable

1. Un dossier de décision d'une à deux pages : créance, voie recommandée et alternative, raisons, calendrier, enjeu financier, risques, questions pour l'humain.
2. Le tableau des coûts à faire chiffrer (avocat, huissier de justice, greffe) avec la ligne « devis demandé le … » à remplir, sans montant inventé.
3. La chronologie et la liste numérotée des pièces, prête à transmettre à l'avocat.
4. La carte de décision à l'humain, une décision par carte.
5. Les informations manquantes et les questions précises.

## Critères de réussite

- La décision reste explicitement humaine ; aucune formule du type « nous lançons la procédure ».
- La créance est qualifiée (certaine, exigible, liquide, non contestée) avec un fait pour chaque critère ; une contestation connue ne disparaît jamais du dossier.
- Chaque voie est décrite avec ses conditions, ses délais et ses coûts à chiffrer, sans chiffre inventé.
- Le dossier est assez complet pour qu'un avocat puisse agir sans reposer les questions de base.
- Les cas hors champ (procédure collective, créance contestée, consommateur pour la procédure extrajudiciaire) sont détectés et nommés.

## Sources officielles

Consultées le 16/10/2026 :

- Code judiciaire, cinquième partie « Saisies conservatoires, voies d'exécution et règlement collectif de dettes », chapitre Iquinquies « Du recouvrement de dettes d'argent non contestées », articles 1394/20 à 1394/27, Justel (Moniteur belge), https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=1967101005&table_name=loi : texte consolidé lu en ligne ; le texte utilise le titre « huissier de justice » et mentionne des modifications en vigueur jusqu'au 01/09/2026. Procédure en vigueur depuis le 02/07/2016 (article 1394/24 : 01/09/2017).
- Code judiciaire, quatrième partie « De la procédure civile », chapitre XV « Procédure sommaire d'injonction de payer », articles 1338 à 1344, Justel (Moniteur belge), https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=1967101004&table_name=loi : texte consolidé lu en ligne.
- « En quoi consiste la procédure extrajudiciaire de recouvrement de dettes d'argent non contestées ? », David Blondeel et Fabien Smets, avocats associés (Centrius), blog Forum for the Future, 02/09/2025, https://blog.forumforthefuture.be/fr/article/en-quoi-consiste-la-procedure-extrajudiciaire-de-recouvrement-de-dettes-dargent-non-contestees-/28259 : source SECONDAIRE ; durée indicative de 6 à 8 semaines, procédure réservée aux entreprises.
- « Qui est l'huissier de justice ? », Droits Quotidiens, page mise à jour le 26/03/2026, https://www.droitsquotidiens.be/fr/question/qui-est-lhuissier-de-justice : source SECONDAIRE, utilisée pour le titre de la profession.

Titre de la profession : dans les textes belges consultés le jour même (Code judiciaire) et sur la page de Droits Quotidiens, le titre est « huissier de justice ». Le titre « commissaire de justice » est celui de la profession en France ; il n'a pas été trouvé dans le Code judiciaire belge consulté. Si une réforme belge récente le change, la mise à jour est à faire après vérification auprès de la Chambre nationale des huissiers de justice ou de l'avocat. Les coûts (honoraires, frais, tarifs fixés par arrêté), les délais de prescription, le règlement européen d'injonction de payer pour un débiteur à l'étranger, la procédure ordinaire détaillée et les montants de compétence actuels n'ont pas été établis ici.

## À vérifier par un professionnel

Un avocat valide la qualification de la créance, le choix de la voie, la prescription, la validité des pièces et la suite de la procédure : l'intervention de l'avocat du créancier est requise pour la procédure de recouvrement de dettes d'argent non contestées et pour l'injonction de payer. Un huissier de justice chiffre ses frais et honoraires, signifie les actes et conduit l'exécution. Un expert-comptable évalue l'effet comptable et fiscal d'une perte éventuelle. Toute question de procédure collective du débiteur (déclaration de créance) relève de l'avocat.

## Limites

- La compétence ne choisit pas et n'agit pas : elle prépare un dossier que l'humain, conseillé par son avocat, tranche.
- Les délais indiqués sont des ordres de grandeur ; le calendrier réel dépend de l'huissier, du greffe et des réactions du débiteur.
- Aucune enquête de solvabilité ni recherche extérieure n'est menée.
- La procédure extrajudiciaire est réservée aux relations entre entreprises ; un débiteur consommateur suit une autre voie, avec un avocat.
- Les notes de droit sont un résumé de textes consolidés ; le texte à jour fait foi, pas le résumé.

## Exemple

Entreprise de services de 15 personnes. Créance de 8 400 euros TTC sur une société cliente, facture échue le 10/06/2026, trois relances sans réponse (dernière : mise en demeure écrite du 15/09/2026), aucune contestation écrite, société inscrite à la BCE, aucune procédure collective connue d'après les documents fournis. Le client est un habitué : elle n'a jamais contesté une facture auparavant.

Dossier proposé : voie recommandée, la procédure de recouvrement de dettes d'argent non contestées, parce que la créance paraît certaine, exigible, chiffrée et non contestée, et que la procédure est plus rapide qu'une citation. Accessoires (intérêts et clause indemnitaire) plafonnés à 10 % du principal, soit 840 euros au plus. Calendrier indicatif si la sommation est signifiée le 02/11/2026 : un mois pour réagir (jusqu'au 02/12/2026), procès-verbal de non-contestation au plus tôt le 10/12/2026, puis requête pour rendre le procès-verbal exécutoire, signification, et un mois pendant lequel le débiteur peut agir en justice ; saisie possible ensuite. Coûts : devis demandés à l'avocat et à l'huissier de justice, aucun montant écrit tant qu'ils ne sont pas reçus. Carte de décision : « lancer la procédure extrajudiciaire par l'avocat X, attendre un dernier appel de la direction, ou proposer un plan de paiement ? ».

Cas d'échec : le débiteur a répondu à la dernière relance, la semaine précédente, par un courriel disant que la prestation « n'était pas conforme » sans autre précision. La procédure de dettes non contestées n'est plus utilisable : une contestation, même vague, fait perdre le caractère non contesté et la procédure prendrait fin dès que le débiteur remplit le formulaire de réponse. La compétence n'écrit pas « créance non contestée ». Elle rédige : « contestation reçue le … (courriel joint), voie rapide à écarter ou à confirmer par l'avocat ; options : répondre sur le fond avec les preuves d'exécution, proposer une médiation, ou citer ». Elle demande à l'humain les preuves de livraison et le détail de la prestation, et laisse à l'avocat le choix entre injonction de payer, citation ou négociation.

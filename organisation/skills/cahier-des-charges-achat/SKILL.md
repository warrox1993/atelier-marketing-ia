---
name: "cahier-des-charges-achat"
description: "Rédige le cahier des charges d'un achat de PME belge (fourniture, service, logiciel, sous-traitance) : besoin et contexte, spécifications obligatoires et souhaitables, critères d'attribution pondérés sur 100, conditions de réponse et demande de prix envoyée à trois fournisseurs au minimum. À utiliser avant de solliciter des fournisseurs ou pour structurer un besoin flou ; jamais pour inventer un budget, un volume ou une exigence que le demandeur n'a pas donnés, ni pour contacter un fournisseur ou passer commande."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "achats"
---

# Cahier des charges d'un achat

## Quand l'utiliser

- Un service veut acheter quelque chose et ne l'a décrit qu'en une phrase (« il nous faut un nouveau logiciel de planning »).
- Plusieurs fournisseurs vont être consultés et il faut qu'ils répondent sur la même base, sinon leurs offres ne seront pas comparables.
- Un achat récurrent est renouvelé et l'on veut remettre le marché en concurrence.

## Objectif

Un document que n'importe quel fournisseur comprend sans rendez-vous, qui fixe ce qui est exigé, comment les offres seront jugées (critères et poids annoncés avant), et qui permet ensuite de comparer des offres équivalentes. Le besoin est décrit par ses résultats attendus plutôt que par une marque, sauf contrainte réelle.

## Prérequis

- Le demandeur (nom du service, pas de donnée personnelle superflue) et la décision attendue : qui choisit, avant quelle date.
- Le budget maximum ou, à défaut, la mention « budget non communiqué aux fournisseurs ». Ne jamais deviner un budget.
- Les contraintes connues : volumes, lieux, échéance, intégration avec l'existant, exigences de sécurité ou de données personnelles.
- Pour un achat public ou subventionné : le signaler, car d'autres règles s'appliquent (voir « À vérifier »).

## Entrées

- `besoin` : texte d'origine du demandeur, recopié tel quel.
- `contraintes` : budget, délais, volumes, existant.
- `fournisseurs_pressentis` : liste donnée par l'humain ; la compétence n'en propose pas sans source.
- `ponderation_souhaitee` : si le demandeur a déjà des priorités ; sinon la compétence propose une pondération et la marque « à valider ».

## Étapes

1. **Reformuler le besoin** en trois lignes : problème à résoudre, résultat attendu, ce qui se passe si l'on n'achète pas. Si le besoin reste flou, poser au plus trois questions au demandeur (volume, date butoir, budget) avant d'écrire.
2. **Séparer les exigences** en trois paquets, chacune numérotée (E1, E2...) :
   - *obligatoires* : éliminatoires, si une seule manque l'offre est écartée (exemples : conformité RGPD avec contrat de sous-traitance, hébergement dans l'Espace économique européen, facture électronique Peppol, assurance responsabilité professionnelle) ;
   - *souhaitables* : donnent des points ;
   - *informatives* : le fournisseur doit les connaître mais elles n'entrent pas dans la note.
   Chaque exigence doit être vérifiable (« délai d'intervention de 4 heures ouvrées » et non « réactif »).
3. **Fixer les critères d'attribution** et leur poids, total 100 points, annoncés dans le document. Grille de départ à adapter :

   | Critère | Poids de départ | Comment on le mesure |
   | --- | --- | --- |
   | Prix global sur la durée (coût total de possession) | 40 | formule écrite : points = 40 x (prix le plus bas / prix de l'offre) |
   | Qualité de la réponse au besoin (exigences souhaitables) | 25 | grille de 0 à 5 par exigence |
   | Délai de mise en œuvre et de livraison | 10 | jours ouvrés annoncés, engagement écrit |
   | Niveau de service (support, SLA, garanties) | 10 | délais de réponse et pénalités prévues |
   | Références vérifiables | 10 | au moins deux clients comparables contactables |
   | Solidité du fournisseur | 5 | comptes publics, ancienneté, voir `comparaison-offres-fournisseurs` |

   Le prix pèse rarement plus de 50 points : au-delà, on achète le moins cher, pas le meilleur. Un critère sans méthode de calcul est retiré.
4. **Définir le contenu de la réponse attendue** : prix décomposé (unique, récurrent, options), durée de validité de l'offre (30 jours au moins), délais, conditions de paiement proposées, durée et reconduction, références, preuves des exigences obligatoires, personne de contact. Un même modèle de tableau de prix pour tous, pour éviter les offres impossibles à rapprocher.
5. **Prévoir la mise en concurrence** : au moins trois fournisseurs sollicités (cinq si l'enjeu dépasse un montant fixé par la direction). Si moins de trois répondent, l'écrire et le justifier. Le même texte, les mêmes délais et les mêmes réponses aux questions sont communiqués à tous ; les prix d'un fournisseur ne sont jamais révélés à un autre.
6. **Fixer le calendrier** : date d'envoi, date limite des questions, date limite de réponse (10 jours ouvrables au moins pour un achat simple, 3 semaines pour un achat complexe), date de décision. Toute question d'un fournisseur et sa réponse sont renvoyées à tous.
7. **Rédiger la lettre de demande de prix** (brouillon) : objet, contexte en deux phrases sans révéler de secret commercial, pièces jointes, date limite, adresse de réponse, mention que la demande n'engage pas à acheter. Le brouillon est remis à l'humain, la compétence n'envoie rien.
8. **Faire relire** : chaque exigence a un responsable de vérification, chaque critère une méthode, et un lecteur extérieur au service peut comprendre le besoin.

## Livrable

1. Le cahier des charges : contexte, besoin, exigences (obligatoires, souhaitables, informatives), critères et pondération avec formules, contenu et forme de la réponse, calendrier, règles de confidentialité.
2. Le modèle de tableau de prix à remplir par les fournisseurs.
3. Le brouillon de la demande de prix, prêt à envoyer par l'humain à trois fournisseurs au moins.
4. La liste des informations manquantes et des décisions humaines (budget, seuil de cinq fournisseurs, fournisseurs à consulter).

## Critères de réussite

- Chaque exigence est numérotée, mesurable et classée (obligatoire, souhaitable, informative).
- Les critères totalisent 100 points, avec une méthode de notation écrite pour chacun, annoncés avant la consultation.
- Le texte ne nomme aucune marque sans mention « ou équivalent » et ne contient aucune exigence taillée pour un fournisseur précis.
- Trois fournisseurs au moins sont prévus, ou l'écart est justifié.
- Aucun budget, volume ou chiffre inventé : tout élément absent est marqué « information manquante » avec la question à poser.

## Sources officielles

Consultées le 16/10/2026 :

- Loi du 2 août 2002 concernant la lutte contre le retard de paiement dans les transactions commerciales, Justel, https://www.ejustice.just.fgov.be/cgi_loi/change_lg_2.pl?language=fr&nm=2002009716&la=F : 30 jours civils par défaut entre entreprises, 60 jours au maximum par contrat sauf secteurs autorisés, la période de vérification ou d'acceptation compte dans le délai, intérêt de retard au taux directeur majoré de 8 points, indemnité forfaitaire de recouvrement de 40 euros. À mentionner dans les conditions de paiement demandées.
- « L'e-facturation à la portée de tous », SPF BOSA, https://efacture.belgium.be : depuis le 1er janvier 2026, les entreprises belges assujetties à la TVA doivent utiliser des factures électroniques structurées entre elles. À prévoir comme exigence obligatoire pour un fournisseur belge ; les exceptions se vérifient sur le site.
- Règlement (UE) 2016/679 du 27 avril 2016 (RGPD), EUR-Lex, https://eur-lex.europa.eu/eli/reg/2016/679/oj/fra : l'article 28 impose un contrat avec tout sous-traitant qui traite des données personnelles ; à demander dans les exigences obligatoires dès qu'un fournisseur touchera à des données de personnes.

Les quatre pondérations, le seuil de trois fournisseurs et les délais de réponse sont des pratiques courantes d'achat, pas des obligations légales pour une entreprise privée : aucune source officielle n'est citée pour eux.

## À vérifier par un professionnel

- Achat public, subventionné, ou d'une entreprise soumise à la loi sur les marchés publics : la procédure (seuils, publicité, critères) est imposée ; consulter un juriste en marchés publics avant d'envoyer quoi que ce soit.
- Exigences contractuelles (responsabilité, durée, pénalités) et clause de traitement de données : avocat ou juriste d'entreprise, voir `contrat-fournisseur`.
- Exigences techniques de sécurité, d'intégration ou de conformité sectorielle : responsable informatique ou conseiller en sécurité (CCB pour la cybersécurité).

## Limites

- La compétence ne connaît pas le marché : elle ne dit pas si un prix demandé est réaliste, ni quels fournisseurs existent.
- Une pondération proposée est une proposition ; seul le demandeur la valide, et elle ne se modifie plus après réception des offres.
- Un cahier des charges trop détaillé étouffe les solutions plus intelligentes : décrire le résultat, pas la méthode, sauf contrainte réelle.
- Un fournisseur pressenti n'est jamais favorisé dans le texte ; s'il a aidé à définir le besoin, le signaler à l'humain.

## Exemple

Demande : « il nous faut un logiciel de gestion des plannings pour 25 personnes, budget 6 000 euros par an, début janvier ».

Reformulation : remplacer les plannings papier et Excel du personnel de 25 personnes ; mise en service au 05/01/2027. Exigences obligatoires : E1 hébergement dans l'Espace économique européen ; E2 contrat de sous-traitance de données personnelles (art. 28 RGPD) joint à l'offre ; E3 export des données en CSV à la fin du contrat. Souhaitables : E4 application mobile ; E5 import du fichier Excel actuel ; E6 support en français sous 4 heures ouvrées. Critères : prix sur 3 ans 40, réponse aux souhaitables 25, délai de mise en service 10, support 10, références 10, solidité 5. Trois fournisseurs consultés, réponse sous 15 jours ouvrables.

Cas d'échec : le demandeur répond « je ne sais pas combien d'utilisateurs, on verra » et refuse de donner un volume. La compétence ne produit pas de demande de prix avec un volume supposé : elle écrit « volume : information manquante », remet au demandeur une question unique (« combien de personnes planifiées, et combien de plannings par semaine ? ») et ne livre que le cahier des charges provisoire, marqué « non envoyable ».

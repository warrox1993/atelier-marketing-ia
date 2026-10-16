---
name: "traitement-reclamation"
description: "Conduit le traitement d'une réclamation client d'une PME belge de bout en bout : reconnaissance de la plainte, accusé de réception, délais de réponse, analyse des faits, réponse motivée, escalade interne, information sur la médiation (Service de médiation pour le consommateur, Ombudsman des assurances pour l'assurance), garantie légale de conformité pour les ventes aux consommateurs et registre des plaintes. À utiliser dès qu'un client exprime une insatisfaction qui attend une réponse ; jamais pour décider seul d'une compensation, d'un refus ou d'un remboursement, ni pour affirmer à un client ce que dit la loi sans le faire valider."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "sav"
---

# Traitement d'une réclamation client

## Quand l'utiliser

- Un client écrit, téléphone ou publie un avis qui exprime une insatisfaction et attend une réponse, explicitement ou non.
- Un produit vendu à un consommateur présente un défaut et le client demande réparation, remplacement ou remboursement.
- Un client d'un intermédiaire d'assurance conteste un service, un conseil ou la gestion d'un dossier.
- Il faut organiser ou auditer le registre des plaintes et les délais de réponse d'une PME.

## Objectif

Chaque réclamation reçoit un accusé de réception rapide, une analyse fondée sur les faits du dossier, une réponse motivée dans un délai annoncé, et une information claire sur les voies de recours (escalade interne, puis médiation). Chaque plainte est consignée dans un registre qui permet de repérer les causes qui reviennent. La décision (geste commercial, remboursement, refus) appartient toujours à l'humain responsable.

## Prérequis

- La fiche de l'entreprise : activités, canal de réception des plaintes, personne responsable, limites de compensation autorisées, ton de la marque.
- Le dossier rattaché à la réclamation : commande ou contrat, échanges précédents, dates, pièces.
- Pour une réclamation d'assurance : la police et les conditions applicables, et la confirmation que l'entreprise est un intermédiaire inscrit (le traitement des plaintes et l'adhésion au système extrajudiciaire en font partie, voir sources).
- Savoir si le client est un consommateur (personne physique qui agit hors de son activité professionnelle) ou une entreprise : les règles de garantie légale et de médiation ci-dessous ne sont pas les mêmes.

## Entrées

- `reclamation` : texte d'origine du client, recopié tel quel, avec canal, date et heure de réception.
- `dossier` : références, pièces, historique des échanges.
- `limites` : ce que l'entreprise peut proposer sans validation (geste commercial, délai, remplacement).
- `type_client` : consommateur ou entreprise ; `domaine` : vente de produit, prestation de service ou assurance.

## Étapes

1. **Reconnaître la plainte.** Une réclamation est toute expression d'insatisfaction à laquelle une réponse est implicitement ou explicitement attendue (définition du secteur de l'assurance, utile aussi hors assurance). Une question d'information n'est pas une plainte ; un doute se traite comme une plainte.
2. **L'enregistrer immédiatement** dans le registre : numéro, date et canal de réception, client (référence interne, pas de données inutiles), motif, produit ou service, gravité estimée, responsable, échéance de réponse. L'horodatage de réception est celui du message, pas celui de la lecture.
3. **Envoyer l'accusé de réception** (brouillon préparé, envoi par l'humain). Repère du secteur de l'assurance : accusé dans les 3 jours ouvrables, avec une courte explication de la suite, sauf si une réponse sur le fond part dans la semaine. Hors assurance, l'entreprise fixe son propre délai ; il est écrit dans la fiche, annoncé au client et tenu. L'accusé reconnaît la réception, nomme l'interlocuteur et annonce la date de réponse.
4. **Établir les faits**, sans les compléter par supposition : chronologie (achat ou contrat, livraison, première plainte, relances), pièces, engagements pris par l'entreprise, ce que le client demande exactement. Une information absente est écrite « information manquante » avec la question précise à poser.
5. **Qualifier le cas** :
   - *Défaut d'un bien vendu à un consommateur* : appliquer la grille « garantie légale » ci-dessous.
   - *Retard, erreur de facturation, service mal exécuté* : comparer à ce qui était promis (devis, contrat, conditions générales, date annoncée).
   - *Assurance (intermédiaire)* : séparer ce qui relève de l'intermédiaire (conseil, information, transmission du dossier, suivi) de ce qui relève de l'assureur (décision de couverture et d'indemnisation). L'intermédiaire répond sur son propre service ; la décision de l'assureur lui est renvoyée avec transmission du dossier, sans la commenter comme si elle était la sienne.
6. **Préparer la réponse motivée** : reconnaître le problème sans langue de bois, expliquer ce qui s'est passé d'après les faits du dossier, proposer une solution dans les limites validées, indiquer la suite et la date. Pas de formule défensive, pas de promesse que l'humain n'a pas validée, pas de reproche au client.
7. **Escalader** quand un seuil est atteint : montant au-delà des limites, menace de procédure ou de médiation, suspicion de faute professionnelle, atteinte à la sécurité ou aux données personnelles, client vulnérable, deuxième plainte sur le même dossier. L'escalade passe à la direction avec la note interne (voir Livrable), jamais directement au client.
8. **Informer sur la suite en cas de désaccord.** Si le client maintient son désaccord après la réponse définitive, la réponse précise qu'il peut saisir le service de médiation compétent :
   - *Ventes et services aux consommateurs, hors secteurs financiers* : le Service de médiation pour le consommateur, service public indépendant et gratuit. Il n'ouvre un dossier que si le client prouve qu'il a d'abord tenté de trouver une solution avec l'entreprise, et la plainte est refusable si elle a été soumise à l'entreprise plus d'un an auparavant. Il ne traite pas les affaires déjà soumises à un tribunal.
   - *Assurance* : l'Ombudsman des assurances, compétent pour les plaintes visant les entreprises d'assurances et les intermédiaires d'assurance. La loi du 4 avril 2014 relative aux assurances prévoit ce système extrajudiciaire et suspend les délais de prescription dès la réception d'une demande complète (voir sources).
   Le choix du service est vérifié sur le dossier : en cas de doute, l'humain tranche.
9. **Clôturer et apprendre.** Noter dans le registre : date et contenu de la réponse définitive, solution, délai réel, satisfaction du client si connue, cause racine (hypothèse marquée comme telle). Chaque trimestre, regrouper par cause et proposer une correction (fiche produit, procédure, FAQ), à transmettre à la compétence `base-connaissances-faq` pour les réponses réutilisables.

### Grille « garantie légale de conformité » (vente d'un bien à un consommateur)

Droit applicable à la date de rédaction (16/10/2026) : articles 1649bis et suivants de l'ancien Code civil, pour les contrats conclus à partir du 1er juin 2022. Le nouveau livre 7 du Code civil, adopté par la Chambre le 16 juillet 2026, n'est pas encore en vigueur : il s'applique en principe aux contrats conclus après son entrée en vigueur (voir sources).

| Question | Règle (art. 1649quater et 1649quinquies) | Ce que fait la compétence |
| --- | --- | --- |
| Qui est protégé ? | Le consommateur, personne physique qui agit hors de son activité commerciale, industrielle, artisanale ou libérale | Vérifie `type_client` ; si entreprise, la garantie légale ne s'applique pas ; renvoyer aux conditions du contrat |
| Durée | Le vendeur répond du défaut de conformité existant à la délivrance et apparaissant dans les 2 ans de celle-ci ; pour un bien d'occasion, les parties peuvent convenir d'un délai plus court, jamais sous 1 an, à condition de l'avoir clairement indiqué au consommateur | Calcule la date limite à partir de la date de livraison, pas de la date d'achat, et lit les conditions de vente pour un bien d'occasion |
| Preuve | Le défaut apparaissant dans les 2 ans est présumé exister à la délivrance, sauf preuve contraire ou incompatibilité avec la nature du bien ou du défaut | Ne demande pas au client de prouver l'origine du défaut ; signale le dossier à l'humain si une preuve contraire est envisagée |
| Information du vendeur | Le consommateur informe le vendeur dans les 2 mois à compter du jour où il a constaté le défaut (délai plus long possible par accord) | Note la date de constat déclarée par le client ; ne rejette jamais seule une réclamation tardive : escalade |
| Remèdes | D'abord réparation ou remplacement sans frais, dans un délai raisonnable et sans inconvénient majeur ; ensuite seulement réduction du prix ou résolution, notamment si la réparation ou le remplacement est impossible ou disproportionné | Propose le remède dans cet ordre, sous validation humaine |
| Prescription | L'action du consommateur se prescrit par un an à compter du jour où il a constaté le défaut | Mentionne la date de constat ; rappelle que les délais sont suspendus pendant la réparation ou des négociations amiables |
| Clauses | Les clauses qui excluent ou réduisent ces droits avant que le défaut soit signalé sont nulles (art. 1649octies) | Signale toute clause de ce type dans les conditions de vente |
| Garantie commerciale | Indépendante de la garantie légale, qui est gratuite | Ne renvoie jamais le client vers le fabricant en le privant de la garantie légale du vendeur |

## Livrable

1. Le projet d'accusé de réception (brouillon).
2. Le projet de réponse motivée, en français, sobre, avec la date de suite annoncée.
3. Une note interne : faits établis, cause probable (hypothèse), solution proposée dans les limites, engagements à valider, risque de médiation, niveau d'escalade.
4. La ligne du registre des plaintes complétée.
5. La liste des faits à vérifier avant envoi.

Rien n'est envoyé, signé, payé ni déposé : l'humain valide et agit.

## Critères de réussite

- Chaque réclamation a une ligne de registre, une date de réception, un responsable et une échéance de réponse.
- L'accusé de réception part dans le délai annoncé ; la réponse définitive respecte la date promise ou est précédée d'un message motivé qui fixe une nouvelle date.
- La réponse s'appuie uniquement sur des faits du dossier et ne promet rien sans validation.
- Le service de médiation est indiqué seulement quand le désaccord persiste, et le bon (consommateur ou assurance).
- Pour un bien vendu à un consommateur, le calcul des délais (2 ans, 2 mois, 1 an) est écrit avec ses dates de départ.
- Aucune donnée personnelle superflue dans le registre.

## Sources officielles

Consultées le 16/10/2026 :

- Loi du 4 avril 2014 relative aux assurances, Justel (texte mis à jour au 04/08/2026), https://www.ejustice.just.fgov.be/cgi_loi/article.pl?language=fr&lg_txt=f&type=&sort=&numac_search=2014011239&cn_search=2014040446&caller=article&&view_numac=2014011239n : article 265 (les intermédiaires établissent des politiques et procédures internes pour que les réclamations soient examinées de manière experte et honnête et que le réclamant reçoive en tout cas une réponse) ; article 266, 7° (l'intermédiaire adhère au système extrajudiciaire de traitement des plaintes, directement ou par une association professionnelle) ; article 322 (système extrajudiciaire de traitement des plaintes, service ombudsman des assurances compétent pour les plaintes visant les entreprises d'assurances et les intermédiaires, suspension de la prescription de l'article 88 dès réception d'une demande complète).
- Ancien Code civil, livre III, articles 1649bis à 1649octies, Justel (version consultée, mise à jour au 28/05/2024), https://www.ejustice.just.fgov.be/cgi_loi/article.pl?language=fr&lg_txt=f&type=&sort=&numac_search=1804032154&cn_search=1804032130&caller=article&&view_numac=1804032154n : délai de deux ans, présomption de deux ans, information du vendeur dans les deux mois, prescription d'un an, ordre des remèdes, nullité des clauses contraires. Le texte consulté date de mai 2024 : vérifier qu'il n'a pas été modifié depuis.
- « Service de médiation pour le consommateur », accueil et page de questions fréquentes, https://www.mediationconsommateur.be/fr et https://www.mediationconsommateur.be/fr/faq : service public indépendant et gratuit, traitement visé en 90 jours, démarche préalable auprès de l'entreprise exigée, plainte refusable après un an, affaires déjà devant un tribunal exclues.
- Source secondaire : « Règles de conduite pour la gestion des réclamations dans les entreprises d'assurances », Assuralia (adoptées le 14 janvier 2008), https://files.assuralia.be/werking-verzekering_fonctionnement-assurance/gedragsregels/FR_code_plaintes.pdf : définition de la réclamation, accusé de réception sous 3 jours ouvrables, réponse visée sous 2 semaines, réponse définitive sous un mois, information sur l'Ombudsman en cas de désaccord, enregistrement des réclamations. Règles professionnelles d'une union professionnelle d'assureurs, sans valeur légale ; les délais servent de repère de bonne pratique.
- Source secondaire : « Q&A : nouvelles règles relatives à la vente aux consommateurs à compter du 1er juin 2022 », FEB et Eubelius, https://www.vbo-feb.be/globalassets/publicaties/qa-nieuwe-regels-consumentenkoop-vanaf-1-juni-2022/brochure-qa--nouvelles-regles-relatives--la-vente-aux-consommateurs-a-compter-du-1er-juin-2022.pdf : application aux contrats conclus à partir du 1er juin 2022, passage de la présomption de 6 mois à 2 ans, exclusion des ventes à des entreprises, garantie légale distincte de la garantie du fabricant.
- Source secondaire : article « Le nouveau livre 7 du Code civil belge », Lexgo, https://www.lexgo.be/en/news-and-articles/15026-new-book-7-of-the-belgian-civil-code-a-landmark-reform-of-belgian-contract-law : entrée en vigueur le premier jour du douzième mois suivant la publication, contrats antérieurs soumis à l'ancien régime. Texte du livre 7 non consulté.
- Source secondaire : « Contrats de vente : quelles modifications apporte le livre 7 du Code civil », Lexgo, https://www.lexgo.be/fr/actualites-et-articles/15061-contrats-de-vente-quelles-modifications-apporte-le-livre-7-du-code-civil : mentionne l'approbation du livre 7 par la Chambre le 16 juillet 2026 ; ne précise ni la date de publication ni celle d'entrée en vigueur.

Le site de l'Ombudsman des assurances n'a pas pu être ouvert le 16/10/2026 (certificat du site non reconnu) : ses conditions de saisine, délais et coordonnées ne sont pas reprises ici et sont à vérifier sur son site.

## À vérifier par un professionnel

Toute réponse qui cite un droit du client (garantie légale, médiation, délai) est relue par le dirigeant ou un juriste avant envoi. Pour une plainte d'assurance, la position à tenir sur la couverture ou l'indemnisation vient de l'assureur ; l'intermédiaire n'en prend pas la place. Le règlement de procédure du service de médiation, les secteurs qui relèvent d'un service sectoriel et les règles de notification propres à l'entreprise sont à confirmer par le responsable.

## Limites

- Aucune décision d'indemnisation, de remboursement ou de refus : elle est humaine, et pour l'assurance elle appartient à l'assureur.
- Le droit cité vaut pour les contrats conclus à partir du 1er juin 2022 et jusqu'à l'entrée en vigueur du livre 7 ; un contrat antérieur au 1er juin 2022 relève de l'ancien régime (présomption de 6 mois).
- La compétence ne qualifie pas juridiquement une faute et ne conseille pas de saisir un tribunal.
- Les délais de réponse hors assurance ne sont pas fixés par un texte général cité ici : ils sont ceux de la fiche de l'entreprise.
- Une plainte émise par un tiers, un concurrent ou une personne non cliente est escaladée sans réponse sur le fond.
- Les ventes de contenus et services numériques suivent un autre régime (art. 1701/10 et suivants de l'ancien Code civil, mentionné par la brochure FEB) non détaillé ici.

## Exemple

Un client consommateur écrit le 12/10/2026 : le lave-linge livré le 20/03/2026 ne chauffe plus l'eau, constaté le 08/10/2026. Il demande un remboursement.

- Enregistrement : réception le 12/10, échéance d'accusé le 15/10 (3 jours ouvrables), réponse définitive visée le 12/11.
- Garantie : défaut apparu 6,5 mois après la livraison, donc dans les 2 ans, présumé exister à la délivrance. Information du vendeur le 12/10, soit 4 jours après le constat, dans les 2 mois. Le remède demandé (remboursement) n'est pas le premier : on propose d'abord la réparation ou le remplacement sans frais, dans un délai raisonnable ; la résolution n'est possible que si ce remède est impossible ou disproportionné.
- Brouillon : accusé du 13/10, puis réponse motivée proposant la réparation à domicile sous 10 jours ouvrables (à valider par le responsable), avec la mention de la voie de médiation si le désaccord persiste.

Cas d'échec : le client écrit « votre produit est nul, je veux mon argent, sinon j'écris à tout le monde », sans date, sans référence ni description. La compétence ne rejette pas la plainte et ne devine pas la date de livraison : elle enregistre la réclamation, prépare l'accusé de réception, pose les questions manquantes (numéro de commande, date de livraison, nature du défaut, date de constat) et marque le dossier « escalade : menace de publicité négative ». Elle ne promet aucun remboursement et ne cite aucune date limite de garantie tant que la date de livraison est inconnue.

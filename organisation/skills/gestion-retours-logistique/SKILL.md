---
name: "gestion-retours-logistique"
description: "Organise le traitement logistique des retours de marchandises d'une PME belge : réception, contrôle et tri (remise en stock, reconditionnement, déclassement, destruction, renvoi au fournisseur), traçabilité, calcul du coût réel d'un retour et des motifs récurrents, en tenant compte du droit de rétractation de 14 jours et de la garantie légale pour les ventes aux consommateurs. À utiliser pour établir la procédure ou instruire un lot de retours ; jamais pour décider d'un remboursement, accepter une garantie, trancher le droit à retour d'un client ni détruire un stock sans décision humaine."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "logistique"
---

# Gestion des retours en logistique

## Quand l'utiliser

- Des colis reviennent (rétractation, erreur de commande, article défectueux, livraison refusée) et il faut les traiter vite et proprement.
- Le magasin ne sait pas quoi faire des articles retournés : remettre en vente, reconditionner, détruire ?
- La direction se demande ce que coûtent les retours et pourquoi ils augmentent.
- Le service après-vente a validé un retour ou un remplacement et demande l'organisation pratique.

## Objectif

Un circuit de retour écrit : chaque colis reçu est identifié, contrôlé selon une grille, orienté vers une destination (stock, reconditionnement, déclassement, renvoi au fournisseur, destruction), tracé, et son coût est calculé. Le droit du client (remboursement, remplacement) est décidé par le service après-vente et la direction, pas par la logistique.

## Prérequis

- L'autorisation de retour émise par le service après-vente (numéro, motif, article, quantité), via la liaison.
- La commande d'origine : date de livraison, prix, conditions de vente et de reprise de l'entreprise.
- La grille de contrôle par famille d'articles (emballage, état, accessoires, numéro de série, date de péremption).
- Les coûts de base : transport retour, main-d'œuvre de contrôle, reconditionnement, valeur résiduelle.

## Entrées

- `retour` : numéro d'autorisation, article, quantité, motif déclaré, date de réception.
- `controle` : constat de réception avec photos (emballage, état, accessoires).
- `commande` : date de livraison, prix payé, client professionnel ou consommateur (sans données personnelles inutiles).
- `couts` : coûts réels du circuit sur la période.

## Étapes

1. **Recevoir et identifier** : rapprocher le colis de l'autorisation de retour, noter la date, l'état de l'emballage, les écarts de quantité. Un colis sans autorisation est mis de côté et signalé au service après-vente, pas traité.
2. **Qualifier le client et le motif** : consommateur ou professionnel. Pour un consommateur ayant acheté à distance, un délai de rétractation de 14 jours calendrier court depuis la réception des biens, sans motif ni pénalité ; le vendeur rembourse le prix et les frais de livraison standard par le moyen de paiement initial, sans imposer un bon d'achat ; les frais de renvoi peuvent être mis à la charge du consommateur s'il en a été informé correctement avant le contrat (source secondaire). Certaines catégories sont exclues (biens personnalisés, produits périssables, produits d'hygiène descellés, contenu numérique entamé). Ces points relèvent du service après-vente et du juridique : la logistique les rappelle, ne les tranche pas.
3. **Contrôler** selon la grille : conforme à la commande, complet, état, usage, numéro de série, péremption. Photographier. Distinguer l'article intact, l'article ouvert mais complet, l'article abîmé par l'usage, l'article défectueux, l'article sans rapport avec la commande.
4. **Orienter vers une destination** selon des règles écrites : remise en stock (neuf, complet, emballage intact), reconditionnement (emballage à refaire, accessoire manquant remplaçable), déclassement (vente à prix réduit, validée par la direction), retour au fournisseur (défaut d'origine, dans le cadre de la garantie fournisseur), don ou destruction (jamais sans décision humaine écrite, avec respect des règles sur les déchets et sur les données des appareils).
5. **Remettre en stock avec traçabilité** : mouvement de stock daté, lien avec le retour, lot et numéro de série conservés. Un article revient en stock vendable seulement après le contrôle ; sinon en stock séparé « à traiter ». Informer le responsable de prévision pour que la demande nette soit calculée sans double comptage.
6. **Transmettre le constat** au service après-vente, qui décide du remboursement, de l'avoir ou du remplacement. Le constat dit ce qui est constaté, pas ce qui est dû. En cas de dommage de transport, ouvrir un dossier avec photos et réserves (voir `organisation-transport`) et prévenir le service sinistres via la liaison.
7. **Calculer le coût réel d'un retour** : transport aller et retour, temps de réception et de contrôle, reconditionnement, perte de valeur (déclassement ou destruction), remboursement des frais de livraison, divisé par le nombre de retours de la période. Donner le détail, pas seulement le total.
8. **Analyser les motifs** : taux de retour par article, famille, fournisseur et motif sur la période ; les articles à taux élevé sont listés avec l'hypothèse (fiche produit trompeuse, défaut de série, emballage insuffisant) à valider avec les services concernés.
9. **Proposer des actions** (corriger une fiche produit, changer l'emballage, ouvrir une réclamation fournisseur) : chacune est une proposition à valider, jamais un engagement.

## Livrable

Une procédure de retour d'une page (étapes, grille de contrôle, règles d'orientation), le registre des retours de la période (autorisation, article, motif, constat, destination, coût), le tableau de coût par retour, l'analyse des motifs récurrents avec hypothèses marquées, et la liste des décisions humaines attendues (déclassement, destruction, remboursement).

## Critères de réussite

- Chaque retour reçu a une autorisation, un constat daté avec photos et une destination écrite.
- Aucun article n'est remis en stock vendable sans contrôle.
- Le coût est donné avec son détail et la période.
- Aucune décision de remboursement, de garantie, de destruction ni de dérogation n'a été prise par la logistique.
- Les données personnelles du client se limitent à la référence de commande.

## Sources officielles

Aucun texte officiel n'a pu être ouvert le 16/10/2026 : le site de l'économie fédérale (economie.fgov.be) et EUR-Lex ont renvoyé une vérification anti-robot ou une page vide. Le droit de rétractation cité vient d'une source secondaire ouverte le même jour :

- « Guide pratique du droit de rétractation en 10 questions-réponses », blog.oeccbb.be (éditeur institutionnel non vérifié), https://blog.oeccbb.be/fr/article/guide-pratique-du-droit-de-retractation-en-10-questions-reponses/31246 : source secondaire, 14 jours calendrier, remboursement du prix et des frais de livraison standard, frais de retour possibles à charge du consommateur, exceptions. À confronter au texte officiel : Code de droit économique, livre VI, et directive 2011/83/UE (articles 9, 13, 14 et 16), non ouverts.

## À vérifier par un professionnel

Le droit applicable à un retour précis (rétractation, garantie légale de conformité, conditions générales, vente entre professionnels), les délais de remboursement et le sort des frais de retour sont à faire confirmer par le service juridique ou un avocat. La destruction ou l'élimination d'un stock (déchets, produits réglementés, données d'appareils) suit les règles de l'entreprise et de la région : à valider par le responsable concerné.

## Limites

- La compétence ne décide ni du remboursement, ni de la prise en garantie, ni d'un geste commercial.
- Sans grille de contrôle de l'entreprise, elle propose une grille de départ à faire valider, pas une norme.
- Les règles de rétractation citées valent pour la vente à distance à un consommateur ; elles ne s'appliquent pas entre professionnels.
- Le coût réel dépend de données internes (temps de travail, valeur résiduelle) ; sans elles, il est marqué « non calculable ».

## Exemple

Mois de septembre 2026 : 42 retours sur 610 commandes (6,9 %). Détail : 18 pour erreur de choix du client (rétractation), 14 pour défaut, 7 pour erreur de préparation, 3 sans autorisation. Coût par retour (extrait du 03/10, provisoire) : transport retour 6,40 euros, contrôle 4,80 euros (12 minutes), reconditionnement moyen 2,10 euros, soit 13,30 euros avant perte de valeur ; perte de valeur sur 5 articles déclassés : 124 euros au total. Les 14 défauts concernent le même fournisseur sur 3 références : hypothèse de défaut de série, à confirmer avec la qualité avant toute réclamation.

Cas d'échec : un client demande un retour 25 jours après la livraison d'un article personnalisé et le colis arrive sans autorisation. La logistique n'accepte ni ne refuse : elle met le colis de côté, photographie l'état, écrit « retour sans autorisation, article personnalisé » et transmet le constat au service après-vente pour décision, sans le remettre en stock.

---
name: "gestion-retours-logistique"
description: "Organise le traitement logistique des retours de marchandises d'une PME belge : réception, contrôle et tri (remise en stock, reconditionnement, déclassement, destruction, renvoi au fournisseur), traçabilité, calcul du coût réel d'un retour et des motifs récurrents, en tenant compte du droit de rétractation de 14 jours et de la garantie légale pour les ventes aux consommateurs. À utiliser pour établir la procédure ou instruire un lot de retours ; jamais pour décider d'un remboursement, accepter une garantie, trancher le droit à retour d'un client ni détruire un stock sans décision humaine."
metadata:
  version: "1.1.0"
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
2. **Qualifier le client et le motif** : consommateur ou professionnel. Pour un consommateur ayant acheté à distance, un délai de rétractation de 14 jours calendrier court depuis la réception des biens, sans motif ni pénalité ; le vendeur rembourse le prix et les frais de livraison standard par le moyen de paiement initial, sans imposer un bon d'achat ; le consommateur renvoie les biens au plus tard 14 jours après avoir communiqué sa décision et ne supporte que les coûts directs du renvoi, sauf prise en charge par l'entreprise ou information manquante (Code de droit économique, art. VI.47, VI.50 et VI.51). Certaines catégories sont exclues (biens personnalisés, produits périssables, produits d'hygiène descellés, contenu numérique entamé). Ces points relèvent du service après-vente et du juridique : la logistique les rappelle, ne les tranche pas.
3. **Contrôler** selon la grille : conforme à la commande, complet, état, usage, numéro de série, péremption. Photographier. Distinguer l'article intact, l'article ouvert mais complet, l'article abîmé par l'usage, l'article défectueux, l'article sans rapport avec la commande.
4. **Orienter vers une destination** par un arbre écrit, selon l'état noté (A : intact et complet ; B : emballage abîmé ou ouvert, complet ; C : usé ou incomplet ; D : défectueux ou inutilisable) et l'économie du cas :
   - **remise en stock vendable** : état A seulement, emballage complet, après les tests de fonctionnement ou de sécurité requis ; un réemballage ne fait jamais passer un produit utilisé pour neuf ;
   - **reconditionnement ou vente en « emballage ouvert »** : état A à emballage abîmé ou B, si le coût du reconditionnement reste justifié par l'écart de prix (repère de départ : coût inférieur à 40 % du prix de revente reconditionné, à fixer par la direction) ;
   - **retour au fournisseur** : défaut d'origine couvert par la garantie ou le contrat fournisseur ; comparer le montant récupérable au coût du renvoi ;
   - **déclassement ou vente à un soldeur** : états B ou C quand le reconditionnement ne se justifie pas, sans mélanger les familles dans un même lot (le lot se vend au prix de la famille la moins chère) ; validée par la direction ;
   - **don** : jamais sans décision humaine écrite, en protégeant la marque ;
   - **destruction obligatoire** : produit rappelé, contrefaçon découverte, produit soumis à une filière réglementée (piles, équipements électriques et électroniques, produits dangereux) ; preuve de destruction conservée ; données des appareils effacées.
   La destination est proposée ligne par ligne avec sa raison ; remboursement et mise au rebut restent des décisions humaines.
5. **Remettre en stock avec traçabilité** : mouvement de stock daté, lien avec le retour, lot et numéro de série conservés. Un article revient en stock vendable seulement après le contrôle ; sinon en stock séparé « à traiter ». Informer le responsable de prévision pour que la demande nette soit calculée sans double comptage.
6. **Transmettre le constat** au service après-vente, qui décide du remboursement, de l'avoir ou du remplacement. Le constat dit ce qui est constaté, pas ce qui est dû. En cas de dommage de transport, ouvrir un dossier avec photos et réserves (voir `organisation-transport`) et prévenir le service sinistres via la liaison.
7. **Calculer le coût réel d'un retour** : transport aller et retour, temps de réception et de contrôle, reconditionnement, perte de valeur (déclassement ou destruction), remboursement des frais de livraison, divisé par le nombre de retours de la période. Donner le détail, pas seulement le total.
8. **Analyser les motifs** : taux de retour par article, famille, fournisseur et motif sur la période ; les articles à taux élevé sont listés avec l'hypothèse (fiche produit trompeuse, défaut de série, emballage insuffisant) à valider avec les services concernés.
9. **Proposer des actions** (corriger une fiche produit, changer l'emballage, ouvrir une réclamation fournisseur) : chacune est une proposition à valider, jamais un engagement.

## Livrable

Une procédure de retour d'une page (étapes, grille de contrôle, règles d'orientation), le registre des retours de la période (autorisation, article, motif, constat, destination, coût), le tableau de coût par retour, l'analyse des motifs récurrents avec hypothèses marquées, et la liste des décisions humaines attendues (déclassement, destruction, remboursement).

## Critères de réussite

- Chaque retour reçu a une autorisation, un constat daté avec photos et une destination écrite.
- Aucun article n'est remis en stock vendable sans contrôle ; chaque destination suit l'arbre écrit et porte sa raison.
- Le coût est donné avec son détail et la période.
- Aucune décision de remboursement, de garantie, de destruction ni de dérogation n'a été prise par la logistique.
- Les données personnelles du client se limitent à la référence de commande.

## Sources officielles

Consulté le 17/10/2026 :

- Code de droit économique, art. VI.47 (délai de rétractation de 14 jours d'un contrat à distance, sans motif, sans autres coûts que ceux des art. VI.50 § 2 et VI.51), art. VI.50 § 1er (remboursement de tous les paiements, y compris les frais de livraison, dans les 14 jours, par le même moyen de paiement sauf accord exprès) et art. VI.51 § 1er (renvoi des biens dans les 14 jours, coûts directs du renvoi à charge du consommateur sauf prise en charge par l'entreprise), texte consolidé sur Justel, https://www.ejustice.just.fgov.be/eli/loi/2013/02/28/2013A11134/justel. Remplace la source secondaire citée dans la version 1.0.0.

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

## Origine de la méthode

Version 1.1.0 : arbre de destination par état (étape 4) adapté et traduit de github.com/affaan-m/ECC, `skills/returns-reverse-logistics/SKILL.md`, « Disposition Decision Trees » et « Disposition Routing by Category and Condition », commit ef648e01899ba3e8dc6371642deaaf64b4477775, compétence sous licence Apache 2.0 (en-tête `license: Apache-2.0`, auteur « evos »). Les références américaines (FTC, plateformes de liquidation, déduction fiscale du don) ne sont pas reprises. Modifications : réécriture en français, droit belge de la consommation, décision humaine. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.

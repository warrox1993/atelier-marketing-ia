---
name: "commande-approvisionnement"
description: "Prépare un bon de commande et suit la réception d'un achat pour une PME belge : contenu du bon (fournisseur vérifié, lignes, quantités, prix de l'offre retenue, date attendue, imputation), seuil d'approbation, bon de réception, puis trace transmise à la comptabilité pour le rapprochement à trois voies avec la facture. À utiliser quand un achat décidé doit être commandé ou réceptionné ; jamais pour envoyer une commande, accepter une livraison non conforme ou payer à la place de l'humain."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "achats"
---

# Commande et approvisionnement

## Quand l'utiliser

- Un achat a été choisi (offre retenue) et il faut préparer le bon de commande.
- Une livraison arrive et il faut enregistrer ce qui a été réellement reçu.
- La comptabilité ne retrouve pas la commande correspondant à une facture.

## Objectif

Un bon de commande complet et approuvable, un bon de réception fidèle à ce qui est arrivé, et une trace de commande
que la comptabilité peut rapprocher de la future facture (commande, réception, facture), sans envoi ni acceptation
par l'agent.

## Prérequis

- L'offre retenue et la décision humaine de l'achat.
- Le fournisseur vérifié (compétence `verification-fournisseur-belge`).
- Les seuils d'approbation de l'entreprise (qui approuve à partir de quel montant).
- Le compte d'imputation et le centre de coût proposés par le demandeur.

## Entrées

- `offre` : référence, lignes, quantités, prix unitaires, conditions de livraison et de paiement.
- `demandeur` : service et personne responsable de la réception.
- `seuils` : montants et approbateurs.
- `livraison` : bon de livraison du fournisseur, quantités et état constatés.

## Étapes

1. **Préparer le bon de commande** : numéro unique, date, fournisseur (dénomination, numéro d'entreprise), lignes
   avec quantités et prix repris de l'offre (référence de la page), total hors TVA et TVA, date de livraison attendue,
   lieu de livraison, conditions de paiement, imputation proposée. Un prix absent de l'offre n'est pas complété.
2. **Appliquer le seuil d'approbation** : indiquer l'approbateur requis selon le montant ; carte de décision pour
   l'envoi de la commande. Une commande fractionnée pour passer sous un seuil est signalée.
3. **Enregistrer la réception** à partir du bon de livraison et du constat du demandeur : quantités reçues par ligne,
   état, écarts (manquant, en trop, abîmé, mauvaise référence). Une livraison non conforme est signalée, son
   acceptation ou son refus reste humain.
4. **Laisser la trace pour la comptabilité** : numéro de commande, fournisseur, total, date attendue, imputation, et
   quantités réceptionnées, transmis au coordinateur comptabilité par le bureau de liaison, pour le rapprochement à
   trois voies au moment où la facture arrive (compétence `traitement-factures-fournisseurs`).
5. **Suivre les commandes ouvertes** : liste des commandes non livrées ou partiellement livrées, avec retard en jours.

## Livrable

Un bon de commande prêt à approuver, la carte de décision d'envoi, le bon de réception avec écarts, la trace transmise
à la comptabilité, et la liste des commandes ouvertes.

## Critères de réussite

- Chaque prix du bon renvoie à l'offre retenue.
- Chaque commande a son approbateur selon le seuil.
- Chaque écart de réception est chiffré par ligne.
- La trace transmise à la comptabilité contient le numéro de commande, le total, la date et l'imputation.
- Zéro commande envoyée et zéro livraison acceptée par l'agent.

## Sources officielles

Aucun texte n'impose de forme au bon de commande. La facture qui suivra doit respecter les règles de facturation
(obligation de facture structurée Peppol entre assujettis belges depuis le 1er janvier 2026, voir la compétence
`preparation-tva`, source secondaire à confirmer) ; les délais de paiement relèvent de la loi du 2 août 2002, Justel,
https://www.ejustice.just.fgov.be/cgi_loi/change_lg_2.pl?language=fr&nm=2002009716&la=F .

## À vérifier par un professionnel

Les conditions générales applicables (celles de l'acheteur ou du fournisseur), le transfert de propriété et des
risques à la livraison et les recours en cas de non-conformité relèvent du juriste.

## Limites

- La compétence n'envoie aucune commande et ne passe aucune écriture.
- Elle ne gère pas de stock : la gestion des stocks relève du service logistique quand il existe.
- Sans bon de livraison ni constat, la réception n'est pas enregistrée.

## Exemple

Commande de 100 licences à 18,50 euros (offre B, page 3), total 1 850 euros hors TVA, approbateur : responsable
administratif (seuil de 2 500 euros fourni). Réception : 100 licences activées. Trace transmise : commande
CMD-2026-041, 1 850 euros, imputation 611 proposée. Facture reçue plus tard pour 120 licences : la comptabilité voit
immédiatement l'écart de 20 licences.

Cas d'échec : l'agent complète le prix d'une ligne absente de l'offre avec le tarif public du fournisseur. Le prix
n'est pas celui de l'offre : il doit être demandé.

## Origine de la méthode

Principe « laisser une trace de commande que la future facture pourra rapprocher » adapté et traduit de
github.com/anthropics/knowledge-work-plugins, `small-business/skills/restock/SKILL.md` (étape 3), commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : traduction, seuils d'approbation,
validation humaine. Licence et reprises : `organisation/skills/LICENCES-TIERS.md`.

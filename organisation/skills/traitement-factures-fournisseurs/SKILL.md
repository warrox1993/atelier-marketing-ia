---
name: "traitement-factures-fournisseurs"
description: "Traite les factures fournisseurs d'une PME belge reçues par Peppol ou en PDF : extraction des champs en nommant ce qui est illisible, imputation proposée, rapprochement à trois voies commande, réception et facture, doublons, notes de crédit, puis proposition de lot de paiement soumise à une approbation distincte. À utiliser pour préparer l'encodage et les paiements fournisseurs ; jamais pour passer une écriture, payer ou contester une facture auprès du fournisseur."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "comptabilite-finance"
---

# Traitement des factures fournisseurs

## Quand l'utiliser

- Un lot de factures fournisseurs est arrivé (réseau Peppol, PDF, photo) et doit être préparé pour l'encodage.
- La direction veut savoir quoi payer cette semaine sans payer deux fois ni payer ce qui n'a pas été reçu.
- Une facture ne correspond pas à la commande ou à la livraison.

## Objectif

Un tableau d'imputation proposé, une liste d'exceptions nommées et une proposition de lot de paiement, présentés avant
tout encodage, avec deux décisions humaines séparées : l'imputation d'abord, le paiement ensuite.

## Prérequis

- Les factures du lot (fichier Peppol UBL ou PDF lisible) et la liste des fournisseurs connus.
- Le plan comptable de l'entreprise ou, à défaut, l'historique d'imputation par fournisseur.
- Les bons de commande et bons de réception quand ils existent (service achats, par le bureau de liaison).
- La balance âgée fournisseurs et, si disponible, la position de trésorerie (`plan-tresorerie`).

## Entrées

- `factures` : une ligne par facture (fournisseur, numéro d'entreprise, numéro et date, échéance, montants hors TVA,
  TVA par taux, total, mention d'autoliquidation éventuelle).
- `commandes` et `receptions` : numéro, quantités, prix unitaires.
- `balance_agee_fournisseurs` : détail par tranche, notes de crédit comprises.
- `tolerance` : écart de prix ou de quantité accepté par l'entreprise (à défaut, aucune tolérance).

## Étapes

1. **Réunir le lot** et compter : nombre de factures, total, factures Peppol et factures papier ou PDF. Depuis le
   1er janvier 2026, une facture entre assujettis belges doit en principe être structurée et passer par Peppol : une
   facture PDF d'un fournisseur belge assujetti est signalée comme écart de format (exceptions à vérifier).
2. **Extraire les champs et dire ce qui n'a pas pu être lu.** Un champ illisible reste vide et nommé (fournisseur,
   numéro de facture, champ concerné). On n'arrondit jamais un montant vers une valeur plausible.
3. **Contrôler les mentions** : identité et numéro de TVA du fournisseur, date, numéro unique, base et taux de TVA,
   mention d'autoliquidation (cocontractant) quand la TVA n'est pas portée. Une mention manquante est une exception.
4. **Proposer l'imputation** : compte de charge, code TVA, période. Nouveau fournisseur, ligne inhabituelle ou compte
   incertain : la facture va dans la liste « à trancher » avec la proposition et sa raison, pas dans les factures prêtes.
5. **Rapprochement à trois voies** quand une commande existe :
   - accord : quantités et prix concordent dans la tolérance ;
   - écart de prix : facturé au-dessus du prix de la commande, avec les deux prix et la différence ;
   - écart de quantité : facturé plus que reçu, avec la quantité et le montant en trop ;
   - sans commande : noté, ce n'est pas une erreur en soi.
6. **Chercher les doublons** : même montant à 0,01 euro près, même fournisseur, dates à 5 jours calendrier ou moins ;
   ou même numéro de facture chez le même fournisseur.
7. **Montrer la situation avant de toucher aux livres** : total traité en euros, nombre de factures prêtes, nombre à
   trancher, exceptions nommées, puis les échéances (cette semaine, semaine suivante, en retard).
8. **Première approbation : l'imputation.** Carte `request_confirmation` qui dit combien de factures, quel total, et
   qu'elles seront encodées comme factures à payer, pas comme paiements.
9. **Seconde approbation, distincte : le lot de paiement.** Avant de classer les fournisseurs par urgence, lire chaque
   tranche de la balance âgée : un montant négatif signale une note de crédit. Un fournisseur avec crédit sort du
   classement et est présenté à part (brut, crédit, net). Proposer ensuite les paiements par fournisseur : total qui
   quitte le compte, date, escomptes éventuels, retards qui risquent la relation. Aucune facture en écart de quantité
   ou de prix n'est proposée au paiement. L'humain approuve ou réduit la liste ; l'agent ne l'élargit jamais.

## Livrable

Un dossier : tableau d'imputation proposé (une ligne par facture, statut prêt, à trancher ou en exception), liste des
champs illisibles, liste des exceptions chiffrées, liste des doublons suspects, proposition de lot de paiement séparée,
et deux cartes de décision distinctes.

## Critères de réussite

- Aucun champ illisible deviné ; chacun est nommé avec la facture concernée.
- Chaque écart de quantité ou de prix est chiffré (unités et euros).
- Deux cartes distinctes : imputation, puis paiement ; aucun paiement proposé pour une facture en écart.
- Aucune note de crédit fondue silencieusement dans un montant à payer.
- Zéro écriture passée et zéro paiement exécuté par l'agent.

## Sources officielles

Consultées le 17/10/2026 :

- Loi du 2 août 2002 concernant la lutte contre le retard de paiement dans les transactions commerciales, Justel,
  https://www.ejustice.just.fgov.be/cgi_loi/change_lg_2.pl?language=fr&nm=2002009716&la=F : délais de paiement entre
  entreprises et intérêts de retard (taux du semestre à vérifier).
- Code de la TVA et facturation électronique structurée : les pages du SPF Finances (https://finances.belgium.be)
  renvoient une vérification anti-robot ; elles ne sont pas citées. La règle Peppol est reprise de la compétence
  `preparation-tva`, qui en documente la source secondaire, et reste à confirmer sur le site officiel.

## À vérifier par un professionnel

Les comptes d'imputation, les codes TVA, l'autoliquidation, le droit à déduction, les exceptions à l'obligation Peppol
et l'application d'une note de crédit sont validés par l'expert-comptable avant encodage.

## Limites

- La compétence n'encode rien dans le logiciel comptable et n'émet aucun paiement.
- Sans commande ni réception, le rapprochement à trois voies est impossible : la facture est marquée « sans commande ».
- Les tolérances d'écart sont celles de l'entreprise ; sans valeur fournie, aucune tolérance n'est appliquée.

## Exemple

Lot de 6 factures, 14 820 euros. Facture A : montant de TVA illisible sur le PDF, champ laissé vide et signalé.
Facture B : sans commande, imputée en « à trancher ». Facture C : 120 unités facturées pour 100 reçues à 18,50 euros,
écart de 20 unités et 370 euros hors TVA, exclue du lot de paiement. Facture D et facture E : 1 815,00 euros, même
fournisseur, à 3 jours d'écart, doublon suspect. Deux cartes posées : imputation des factures prêtes, puis lot de
paiement de 4 210 euros sans C ni E.

Cas d'échec : l'agent reprend la TVA d'une facture précédente du même fournisseur pour combler le champ illisible. La
valeur est plausible mais non prouvée : le champ doit rester vide et nommé.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `small-business/skills/ap-processor/SKILL.md`
(étapes 2 à 7), commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0 ; règle du doublon reprise de
`small-business/skills/month-end-prep/SKILL.md` (étape 4), même commit. Modifications : traduction, couche belge
(Peppol, mentions, autoliquidation), validation humaine. Licence et reprises : `organisation/skills/LICENCES-TIERS.md`.

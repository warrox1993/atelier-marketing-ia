---
name: "facturation-clients-peppol"
description: "Prépare la facturation sortante d'une PME belge : contrôle des données avant émission (client, numéro d'entreprise, mentions, taux de TVA, échéance), choix du canal (Peppol entre assujettis, autre canal pour un particulier), notes de crédit, lettrage des encaissements et transmission de la balance âgée au recouvrement. À utiliser avant d'émettre une facture ou une note de crédit, ou pour lettrer les paiements reçus ; jamais pour émettre, envoyer ou annuler une facture à la place de l'humain."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "comptabilite-finance"
---

# Facturation clients et Peppol

## Quand l'utiliser

- Des prestations ou livraisons du mois sont à facturer et il faut un projet de factures contrôlé.
- Un client conteste une facture et une note de crédit est envisagée.
- Les paiements reçus doivent être lettrés sur les bonnes factures avant la clôture.
- Le recouvrement a besoin d'une balance âgée clients fiable.

## Objectif

Des projets de factures et de notes de crédit complets, au bon taux, avec le bon canal d'envoi et la bonne échéance ;
des encaissements lettrés ; une balance âgée transmise au recouvrement. Aucune facture n'est émise sans décision humaine.

## Prérequis

- La liste des prestations ou livraisons à facturer avec leur pièce (bon de livraison, relevé d'heures validé, jalon).
- La fiche de chaque client : dénomination, numéro d'entreprise, statut d'assujetti, adresse Peppol si elle existe.
- Les conditions de vente (délai de paiement, intérêts et indemnité convenus) et le tarif en vigueur.
- Les extraits bancaires pour le lettrage.

## Entrées

- `a_facturer` : client, objet, quantité, prix unitaire, taux de TVA proposé, pièce.
- `clients` : fiches clients.
- `conditions` : conditions générales de vente applicables.
- `encaissements` : mouvements bancaires de la période.
- `factures_ouvertes` : factures émises non soldées.

## Étapes

1. **Rattacher chaque ligne à une pièce.** Une prestation sans pièce n'est pas facturée : elle est listée « pièce
   manquante ».
2. **Contrôler le client** : numéro d'entreprise vérifiable dans la Banque-Carrefour des Entreprises, statut
   d'assujetti. Assujetti belge : facture structurée par Peppol (obligation en vigueur depuis le 1er janvier 2026,
   exceptions à vérifier). Particulier : autre canal convenu. Adresse Peppol absente pour un assujetti : écart signalé.
3. **Contrôler les mentions** du projet : numéro unique et séquentiel, date, identité et numéro de TVA des deux parties,
   description, quantités, prix, base par taux, taux et montant de TVA, total, échéance, mention d'autoliquidation ou
   d'exemption quand elle s'applique. Chaque mention manquante est listée.
4. **Contrôler le taux de TVA** de chaque ligne contre la fiche produit ou le service. Un taux différent de la fiche
   est un écart signalé, pas une correction faite par l'agent.
5. **Fixer l'échéance** selon les conditions convenues. Entre entreprises, sans délai convenu, le délai légal
   supplétif s'applique (voir Sources) ; un délai convenu plus long que le maximum légal est signalé.
6. **Notes de crédit** : référence à la facture d'origine, motif, montant ; jamais de facture « annulée » par
   suppression. Carte de décision obligatoire.
7. **Lettrer les encaissements** : chaque paiement est associé à une ou plusieurs factures par communication
   structurée, montant et client. Paiement partiel, trop-perçu ou paiement sans référence : liste à trancher.
8. **Transmettre la balance âgée** au recouvrement par le coordinateur (compétence `balance-agee-creances`), sans
   données personnelles inutiles.
9. **Carte de décision** : émission du lot de factures (nombre, total hors TVA, total TVA, canal).

## Livrable

Un lot de projets de factures et de notes de crédit avec leur pièce, la liste des écarts (pièce, client, mention,
taux, canal), l'état du lettrage, la balance âgée transmise et la carte d'émission.

## Critères de réussite

- Chaque ligne facturée renvoie à une pièce ; zéro ligne facturée sans pièce.
- Chaque client assujetti a un canal Peppol ou un écart signalé.
- Chaque écart de taux de TVA est signalé avec le montant en jeu.
- Aucune facture ni note de crédit émise par l'agent.
- Somme des encaissements lettrés plus non lettrés égale le total des encaissements de la période.

## Sources officielles

Consultées le 17/10/2026 :

- Loi du 2 août 2002 concernant la lutte contre le retard de paiement dans les transactions commerciales, Justel,
  https://www.ejustice.just.fgov.be/cgi_loi/change_lg_2.pl?language=fr&nm=2002009716&la=F : délai de paiement supplétif,
  plafonds de délai convenu, intérêts et indemnité forfaitaire ; montants et taux à vérifier à la date de l'échéance.
- Recherche publique dans la Banque-Carrefour des Entreprises, SPF Economie, https://kbopub.economie.fgov.be/kbopub/zoeknummerform.html :
  données publiques des entités inscrites, consultable par numéro d'entreprise.
- Facturation électronique structurée : les pages du SPF Finances (https://finances.belgium.be) renvoient une
  vérification anti-robot et ne sont pas citées ; la règle est reprise de la compétence `preparation-tva` (source
  secondaire documentée) et reste à confirmer.

## À vérifier par un professionnel

Le taux de TVA d'une opération, l'autoliquidation et les exemptions, les exceptions à l'obligation Peppol, les mentions
obligatoires exactes et l'opportunité d'une note de crédit sont validés par l'expert-comptable ; les délais et intérêts
de retard, par un juriste si un litige existe.

## Limites

- La compétence n'émet rien sur le réseau Peppol et n'envoie aucun courrier au client.
- Les prix viennent du tarif ou du contrat fournis ; sans eux, la ligne n'est pas valorisée.
- Le recouvrement des impayés relève du service recouvrement.

## Exemple

Septembre 2026, 14 factures à préparer. Client B, assujetti, sans adresse Peppol connue : écart signalé, facture non
prête. Ligne de formation portée à 21 % alors que la fiche du service indique une exemption : écart signalé avec
840 euros de TVA en jeu. Lettrage : 31 encaissements, 28 lettrés, 2 partiels, 1 sans référence. Carte : émission de
12 factures pour 38 400 euros hors TVA.

Cas d'échec : l'agent corrige lui-même le taux de 21 % en exemption. Le taux est une qualification fiscale : il signale
l'écart, l'humain et le comptable tranchent.

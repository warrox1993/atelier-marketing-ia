---
name: "incoterms-paiement-international"
description: "Prépare le choix d'un Incoterm et du moyen de paiement d'une vente ou d'un achat international par une liste de questions (qui paie le transport, où passe le risque, qui dédouane, qui assure) et compare les moyens de paiement et l'assurance-crédit, sans reproduire le texte des Incoterms. À utiliser avant une offre ou une commande internationale ; jamais pour fixer seul les conditions de vente, signer ou engager un paiement ou une assurance."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commerce-exterieur"
---

# Incoterms et paiement international

## Quand l'utiliser

- Une offre d'exportation ou une commande d'importation doit préciser la livraison et le paiement.
- Un client étranger impose un Incoterm (par exemple EXW ou DDP) et il faut en mesurer les conséquences.
- Un premier client dans un pays à risque demande un paiement à 60 jours.

## Objectif

Une note qui propose un Incoterm et un moyen de paiement adaptés à l'opération, en montrant pour chaque option qui
paie, qui porte le risque et à quel endroit, qui fait les formalités douanières et ce qui reste à assurer, avec la
décision finale laissée à l'humain.

## Prérequis

- La nature de l'opération : vente ou achat, pays, mode de transport (conteneur maritime, route, aérien, multimodal).
- La version des Incoterms visée par le contrat (la version 2020 est la plus courante ; le texte appartient à la CCI et
  n'est pas reproduit ici).
- Les capacités de l'entreprise : peut-elle dédouaner à l'export, à l'import dans le pays du client, organiser le
  transport principal ?

## Entrées

- `operation` : pays, marchandise, valeur, mode de transport, lieu de livraison souhaité.
- `client` : ancienneté de la relation, historique de paiement, pays.
- `exigences` : Incoterm ou délai demandé par le client, conditions de la banque.

## Étapes

1. **Poser les questions de livraison** pour chaque Incoterm envisagé : où la marchandise est-elle livrée ; où le risque
   passe-t-il du vendeur à l'acheteur ; qui paie le transport principal ; qui dédouane à l'export, à l'import ; qui paie
   les droits et taxes à l'import ; qui assure la marchandise et à quel niveau. Écrire les réponses à partir du texte
   officiel de la CCI consulté par l'humain, pas de mémoire.
2. **Relever les pièges connus** : EXW fait de l'acheteur étranger l'acteur des formalités d'exportation en Belgique,
   ce qu'il est souvent incapable d'assumer ; DDP oblige le vendeur à dédouaner et payer les taxes dans le pays de
   l'acheteur (enregistrement local à vérifier) ; FOB est mal adapté au conteneur, FCA lui est préféré ; un Incoterm ne
   transfère pas la propriété, qui relève du contrat de vente ; il ne s'applique que s'il est expressément cité avec sa
   version et le lieu précis.
3. **Signaler l'effet sur la valeur en douane** : dans l'UE, la valeur en douane à l'import inclut en principe le
   transport et l'assurance jusqu'à l'entrée dans l'Union, quel que soit l'Incoterm (à confirmer par le déclarant).
4. **Comparer les moyens de paiement** du moins sûr au plus sûr pour le vendeur : paiement à échéance sur facture,
   encaissement documentaire, lettre de crédit (crédit documentaire), paiement d'avance. Pour chacun : risque, coût
   bancaire à demander à la banque, documents exigés, cohérence avec l'Incoterm (une lettre de crédit exige souvent un
   connaissement embarqué).
5. **Examiner l'assurance-crédit** pour un paiement différé : couverture du risque commercial et du risque pays, par un
   assureur-crédit ou par Credendo ; coût et conditions à demander, sans engagement.
6. **Proposer** un Incoterm (avec version et lieu) et un moyen de paiement, avec les raisons et les questions ouvertes ;
   relier au contrôle des sanctions (`controle-sanctions-double-usage`) avant toute offre.
7. **Poser la décision** : choix final, signature, engagement bancaire ou d'assurance ; une carte par décision.

## Livrable

Tableau des Incoterms comparés (livraison, risque, transport, dédouanement, droits, assurance, pièges) ; tableau des
moyens de paiement ; note sur l'assurance-crédit ; recommandation ; questions pour la banque, le transitaire et
l'assureur ; cartes de décision.

## Critères de réussite

- Chaque Incoterm cité porte sa version et un lieu précis.
- Les réponses sur le risque et les frais renvoient au texte officiel consulté, ou sont marquées « à vérifier ».
- Aucun texte des Incoterms n'est recopié.
- Le moyen de paiement proposé est cohérent avec l'Incoterm et le risque client.
- Aucune condition n'est présentée comme acceptée.

## Sources officielles

Consultées le 17/10/2026 :

- Chambre de commerce internationale, « Incoterms® rules », https://iccwbo.org/business-solutions/incoterms-rules/ :
  onze termes commerciaux de trois lettres publiés par la CCI, reflétant la pratique entre entreprises dans les contrats
  de vente de marchandises ; version en vigueur Incoterms® 2020. Le texte complet est publié par la CCI et n'est pas
  reproduit.
- Credendo, https://credendo.com/fr : assureur-crédit à l'exportation (assurance-crédit, financement, cautions et
  garanties, risques pays).

## À vérifier par un professionnel

- La valeur en douane et les formalités propres à chaque Incoterm : déclarant en douane ou transitaire.
- Les conditions d'une lettre de crédit : banque de l'entreprise.
- Les clauses de réserve de propriété et le droit applicable au contrat : avocat.

## Limites

- Elle ne remplace pas la lecture du texte officiel des Incoterms acheté auprès de la CCI.
- Elle ne calcule pas les frais de transport ni les droits de douane.
- Les règles de TVA sur les livraisons intracommunautaires et les exportations ne sont pas traitées : comptabilité.

## Exemple

Machine de 48 000 euros vers le Maroc en conteneur, premier client, paiement demandé à 60 jours. Le client propose EXW :
signalé comme piège (formalités d'export en Belgique à sa charge). Proposition : FCA « terminal d'Anvers, Incoterms®
2020 », paiement par lettre de crédit irrévocable ou, à défaut, 30 % d'avance et assurance-crédit Credendo pour le solde
(devis à demander). Contrôle des sanctions demandé avant l'offre. Carte : « valider FCA Anvers et le mode de paiement
avant envoi de l'offre ».

Cas d'échec évité : le commercial demande de « mettre DDP, le client veut un prix tout compris ». La compétence signale
que DDP exige de dédouaner et de payer les taxes au Maroc, pose la question de l'enregistrement local au transitaire et
ne l'inscrit pas dans l'offre sans décision.

## Origine de la méthode

Méthode adaptée et traduite de github.com/affaan-m/ECC, `skills/customs-trade-compliance/SKILL.md`, section
« Incoterms 2020 » (prise comme liste de questions et de pièges : EXW, DDP, FOB et FCA en conteneur, propriété non
transférée, effet sur la valeur en douane dans l'UE), commit ef648e01899ba3e8dc6371642deaaf64b4477775, compétence sous
licence Apache 2.0 (en-tête `license: Apache-2.0`, auteur « evos »). Le texte des Incoterms appartient à la CCI et n'est
pas reproduit. Modifications : réécriture en français, moyens de paiement et assurance-crédit, décision humaine. Texte
des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.

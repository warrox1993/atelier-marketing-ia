---
name: "cout-rendu-regimes-douaniers"
description: "Chiffre le coût rendu (landed cost) d'une expédition hors UE ou d'une importation et compare les régimes douaniers possibles (mise en libre pratique, admission temporaire, perfectionnement, entrepôt) à partir de la valeur en douane, des droits, de la TVA à l'importation, du transport et de l'Incoterm, avec chaque taux sourcé ou marqué à vérifier. À utiliser avant d'accepter un devis ou une importation hors UE, quand le prix rendu de la marchandise ou le choix d'un régime pèse sur la marge ; jamais pour déclarer, classer ou choisir un régime seule."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "logistique"
---

# Coût rendu et régimes douaniers

## Quand l'utiliser

- Une importation hors UE est envisagée et le prix de revient réel de la marchandise est inconnu.
- Un devis de transport DAP ou DDP ou un devis de fournisseur FOB ou EXW doit être comparé à un autre à périmètre égal.
- La marchandise revient ou reste temporairement (échantillon, salon, réparation) et un régime autre que l'importation
  définitive est possible.
- Un changement d'Incoterm ou de transporteur modifie qui paie quoi.

## Objectif

Un tableau de coût rendu par scénario (et par régime quand plusieurs existent), dont chaque ligne porte sa source, sa
date et son statut, avec l'écart entre scénarios et les décisions à poser. Le classement et l'origine viennent de
`douane-origine`, le choix du transporteur de `transport`, le régime et la déclaration d'un déclarant agréé.

## Prérequis

- Le contrat ou la facture proforma avec l'Incoterm et le lieu nommé.
- Le code marchandise et l'origine déjà proposés par `douane-origine`, ou « classement à faire » : sans eux, les droits
  ne sont pas chiffrés.
- Les devis de transport et d'assurance, ou « information manquante ».

## Entrées

- `commande` : prix de la marchandise, devise, Incoterm, lieu, date de la facture.
- `transport` : coûts jusqu'au lieu de destination avec leur périmètre.
- `classement` : code marchandise, origine, mesures éventuelles, repris de la fiche de `douane-origine`.
- `besoin` : usage (vente en l'état, transformation, exposition temporaire, retour).

## Étapes

1. **Reconstituer la base de la valeur en douane** à partir du prix payé et de l'Incoterm : quels frais de transport et
   d'assurance jusqu'à l'entrée dans l'UE sont inclus ou à ajouter (règles de valeur du code des douanes de l'Union,
   articles à vérifier) ; ne jamais copier la valeur d'une facture sans écrire ce qu'elle contient.
2. **Chiffrer les droits** : taux issu du tarif douanier (TARIC) pour le code et l'origine fournis, avec la date de
   consultation ; mesures particulières (préférence, contingent, défense commerciale) signalées sans être appliquées sans
   preuve d'origine. Sans code validé, la ligne reste « non chiffrable ».
3. **Chiffrer la TVA à l'importation** et son effet de trésorerie : taux applicable, base (valeur en douane plus droits
   plus frais), et qui l'avance ; modalités de paiement et de récupération à confirmer avec le comptable.
4. **Ajouter les frais annexes** : transitaire, déclarant, stockage sous douane, inspection, frais de quai, manutention,
   assurance, avec devis ou « estimation » nettement étiquetée.
5. **Comparer les régimes possibles** quand l'usage s'y prête : importation définitive (mise en libre pratique),
   admission temporaire, perfectionnement, entrepôt douanier ; pour chacun, conditions, garanties, durée, pièces et
   coût ; la compétence liste les options, le déclarant ou l'administration confirme laquelle s'applique.
6. **Calculer le coût rendu et la marge** : coût rendu total, coût rendu par unité, écart au prix de vente prévu, sensibilité
   au taux de change et à un changement d'Incoterm ; le scénario le moins cher n'est pas recommandé s'il déplace un
   risque non assuré.
7. **Contrôler la cohérence** avec le transport et l'Incoterm (qui dédouane, qui assure) et signaler à `transport` et
   `douane-origine` ce qui diverge.
8. **Poser les décisions** : accepter le devis, choisir l'Incoterm, mandater un déclarant, demander un régime ; une carte
   par décision.

## Livrable

Tableau de coût rendu par scénario et par régime (base de valeur, droits, TVA et trésorerie, frais annexes, total, par
unité), colonne source et date par ligne, liste des lignes « non chiffrables » et de ce qui les débloque, analyse de
sensibilité courte, cartes de décision.

## Critères de réussite

- Chaque ligne a une source datée, un devis ou l'étiquette « estimation » ou « non chiffrable ».
- Aucun taux de droit ni de TVA n'est écrit de mémoire.
- Le périmètre de chaque comparaison est identique ; l'écart d'Incoterm est expliqué.
- Aucun régime n'est présenté comme obtenu ou applicable sans confirmation du déclarant.
- La trésorerie (TVA, garanties) est séparée du coût définitif.

## Sources officielles

Reprises des compétences du dépôt (consultées par elles le 16 et 17/10/2026), non relues le 18/10/2026 :

- « TARIC », Commission européenne, https://taxation-customs.ec.europa.eu/customs-4/calculation-customs-duties/customs-tariff/eu-customs-tariff-taric_en :
  droits, préférences, suspensions, mesures de défense commerciale.
- « Rules of origin for goods », Commission européenne, https://taxation-customs.ec.europa.eu/customs/rules-origin-goods_en :
  l'origine, avec le classement et la valeur, détermine le traitement tarifaire.
- Chambre de commerce internationale, « Incoterms® rules », https://iccwbo.org/business-solutions/incoterms-rules/ : version
  Incoterms® 2020 ; le texte complet est payant et n'est pas recopié.
- Règlement (UE) n° 952/2013 (code des douanes de l'Union), EUR-Lex : texte non relu ce jour ; les articles sur la valeur
  en douane, les régimes particuliers et la garantie sont à vérifier avant tout calcul définitif.
- SPF Finances, Douane et Accises : site à consulter pour les procédures belges, la TVA à l'importation et les
  autorisations (page non relue ce jour, à vérifier).

## À vérifier par un professionnel

Le choix du régime, la valeur en douane, le taux de droit, le traitement de la TVA à l'importation, la garantie éventuelle
et le statut de l'entreprise (numéro EORI) relèvent d'un déclarant en douane ou d'un transitaire, et du comptable pour la
TVA, avant tout engagement.

## Limites

- Elle ne déclare rien, ne choisit pas de régime et ne certifie aucun code ni aucune origine.
- Elle ne couvre pas les droits d'accises, les interdictions ni les licences : signal à `douane-origine` et au commerce
  extérieur si le service est actif.
- Les taux changent : un calcul vieux de plus de trente jours est à refaire avant décision.

## Exemple

Un fournisseur hors UE propose 10 000 euros EXW pour 400 pièces. Transport et assurance jusqu'à Liège : devis A à 1 150
euros. Code et origine fournis par `douane-origine` : taux de droit relevé dans TARIC le jour même, valeur en douane
reconstituée en ajoutant transport et assurance. TVA à l'importation chiffrée avec son effet de trésorerie. Coût rendu
par pièce calculé, comparé au prix de vente prévu. Variante DAP à 11 900 euros comparée à périmètre égal. Régime :
importation définitive, l'admission temporaire est écartée par l'usage (vente), confirmation demandée au déclarant.

Cas d'échec évité : le fournisseur annonce « droits inclus ». La compétence écrit que le périmètre est inconnu,
demande la ventilation par écrit et ne chiffre pas la ligne.

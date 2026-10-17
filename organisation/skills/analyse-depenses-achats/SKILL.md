---
name: "analyse-depenses-achats"
description: "Analyse les dépenses d'achat d'une PME à partir d'un export (fournisseur, catégorie, montant, échéance) : Pareto des catégories, grappes de fonctions en double (outils qui font la même chose), économies estimées nettes du coût de migration, refus de tout fournisseur unique sur une catégorie critique sans plan de secours, alerte quand trois contrats ou plus se renouvellent le même mois. À utiliser pour une revue des dépenses, la chasse aux abonnements en double ou la préparation d'un budget ; jamais pour résilier un contrat à la place de l'humain."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "achats"
---

# Analyse des dépenses d'achat

## Quand l'utiliser

- La direction veut savoir où part l'argent des achats et ce qu'on peut regrouper.
- On soupçonne des abonnements en double (plusieurs outils pour la même fonction).
- Le budget de l'année suivante se prépare et les renouvellements doivent être anticipés.

## Objectif

Une cartographie des dépenses qui montre quelles catégories pèsent le plus, quelles fonctions sont achetées plusieurs
fois, ce qu'un regroupement rapporterait réellement une fois la migration payée, et quels mois concentrent trop de
renouvellements, sans proposer de dépendance dangereuse et sans résilier quoi que ce soit.

## Prérequis

- Un export des dépenses sur douze mois au moins : fournisseur, objet, catégorie si elle existe, montant annuel,
  date de renouvellement, durée et préavis.
- La criticité de chaque catégorie pour l'activité (fournie par les services utilisateurs ou à demander).
- Le coût de changement estimé quand un regroupement est envisagé (migration, formation, double paiement transitoire).

## Entrées

- `depenses` : une ligne par contrat ou fournisseur.
- `criticite` : critique, importante ou secondaire, par catégorie.
- `couts_changement` : estimation par fournisseur susceptible d'être abandonné, avec sa source.

## Étapes

1. **Classer** chaque ligne dans une catégorie simple et stable (logiciels et abonnements, matériel, services
   informatiques, services professionnels, locaux et énergie, véhicules, assurances, fournitures, déplacements,
   marketing, autres). Une ligne ambiguë est listée, pas forcée.
2. **Pareto** : trier les catégories par montant et montrer celles qui font environ 80 % de la dépense ; donner aussi
   les dix premiers fournisseurs.
3. **Grappes de fonctions en double** : regrouper les contrats qui couvrent la même fonction (par exemple trois outils
   de visioconférence, deux outils de signature électronique). Pour chaque grappe : contrats, montants, utilisateurs
   si connus.
4. **Économie nette** : pour chaque grappe, économie estimée = dépense actuelle de la grappe moins dépense du
   fournisseur gardé moins coût de changement des fournisseurs abandonnés. Sans coût de changement connu, l'économie
   est présentée « brute, coût de migration à chiffrer ».
5. **Garde-fou de dépendance** : aucune proposition ne ramène une catégorie critique à un fournisseur unique sans
   plan de secours écrit. Le livrable l'écrit en clair : « ne pas regrouper, catégorie critique sans plan de secours ;
   prévoir d'abord une solution de repli ».
6. **Grappes de renouvellement** : signaler chaque mois où trois contrats ou plus se renouvellent (perte de marge de
   négociation et charge de travail), avec les dates de préavis.
7. **Synthèse** : catégories qui pèsent le plus, regroupements proposés avec économie nette et risque, grappes de
   renouvellement, points de dépendance à couvrir ; carte de décision pour toute résiliation proposée.

## Livrable

Un dossier : tableau classé des dépenses, Pareto, grappes de fonctions en double avec économie nette, alertes de
dépendance, calendrier des renouvellements et préavis, liste des lignes à clarifier, carte de décision.

## Critères de réussite

- Chaque grappe de fonctions en double de l'export est trouvée.
- Chaque mois avec trois renouvellements ou plus est signalé avec ses préavis.
- Chaque économie est nette du coût de migration ou marquée « brute ».
- Aucune catégorie critique ramenée à un fournisseur unique sans plan de secours.
- Zéro résiliation présentée comme faite.

## Sources officielles

Aucune règle officielle belge n'impose de méthode d'analyse des dépenses : la méthode est une pratique d'achat. Les
préavis et conditions de reconduction viennent de chaque contrat (compétence `contrat-fournisseur`). Pour un contrat
de consommateur, la loi encadre la reconduction tacite ; une PME qui achète pour son activité n'est en principe pas un
consommateur : à vérifier par le juriste pour chaque cas particulier.

## À vérifier par un professionnel

La possibilité de résilier un contrat, le préavis applicable et les indemnités éventuelles relèvent du juriste ; le
choix du fournisseur gardé, de la direction et du service utilisateur.

## Limites

- La compétence ne lit pas l'usage réel des outils : sans données d'utilisation, les doublons sont fonctionnels, pas
  prouvés par l'usage.
- La classification internationale des produits et services (UNSPSC) n'est pas utilisée.
- Aucune résiliation, aucun contact fournisseur.

## Exemple

Export de 40 lignes, 312 000 euros par an. Pareto : logiciels (31 %), services informatiques (24 %) et locaux (22 %)
font 77 %. Grappe : trois outils de visioconférence pour 14 400 euros ; garder le plus utilisé (6 000 euros), coût de
migration estimé 2 000 euros : économie nette 6 400 euros la première année. Janvier : quatre contrats se renouvellent,
préavis entre le 01/11 et le 01/12 : alerte. Messagerie, catégorie critique : aucun regroupement proposé sans solution
de repli.

Cas d'échec : l'agent annonce 8 400 euros d'économie en oubliant la migration. L'économie doit être nette ou marquée
« brute ».

## Origine de la méthode

Pareto des catégories, grappes de fonctions en double, économie nette du coût de changement, interdiction du
fournisseur unique sans plan de secours et alerte de renouvellements groupés adaptés et traduits de
github.com/alirezarezvani/claude-skills, `business-operations/skills/procurement-optimizer/SKILL.md` (étapes 2, 4 et 5),
commit 19392f7a08264ed00486a251f5b2098321771f94, licence MIT, Copyright (c) 2025 Alireza Rezvani. La classification
UNSPSC, les profils « startup » et les scripts ne sont pas repris. Licence et reprises : `organisation/skills/LICENCES-TIERS.md`.

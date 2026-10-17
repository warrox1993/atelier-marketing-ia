---
name: "gestion-stocks-inventaire"
description: "Classe les articles en stock (ABC par marge, XYZ par régularité de la demande), fixe une politique de réapprovisionnement par classe, prépare l'inventaire annuel et les comptages tournants, et repère le surstock et le stock dormant avec la trésorerie immobilisée. À utiliser pour organiser un stock, préparer un inventaire, expliquer des écarts ou libérer de la trésorerie ; jamais pour corriger seul un stock, déclasser ou détruire un article."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "logistique"
---

# Gestion des stocks et inventaire

## Quand l'utiliser

- Le stock est mal connu, les ruptures et le surstock coexistent, ou la direction demande « combien d'argent dort en
  stock ».
- L'inventaire annuel ou un comptage tournant se prépare, ou des écarts d'inventaire doivent être expliqués.
- Il faut fixer qui se réapprovisionne automatiquement et qui demande une revue humaine.

## Objectif

Une carte du stock où chaque article a sa classe ABC et XYZ, sa politique de réapprovisionnement et son état
(sain, surstock, dormant), un total chiffré de la trésorerie immobilisée et un plan d'inventaire, avec chaque
ajustement ou déclassement proposé à la décision humaine.

## Prérequis

- Un export daté du stock par article : quantité, coût unitaire, emplacement, date du dernier mouvement.
- Les ventes ou sorties d'au moins 12 mois, avec la marge par article si elle est connue.
- La date de clôture de l'exercice comptable (pour l'inventaire annuel).

## Entrées

- `stock` : export daté (article, quantité, coût, emplacement, dernier mouvement).
- `sorties` : historique par période (semaine ou mois).
- `marges` : marge par article, sinon chiffre d'affaires (le signaler).
- `ecarts` : résultats d'un comptage, s'il y en a.

## Étapes

1. **Dater l'état du stock** : un stock vieux de deux semaines donne des dates de rupture fausses de deux semaines.
2. **Classer en ABC sur la marge** (à défaut le chiffre d'affaires, en le disant) : A, environ 20 % des articles portant
   environ 80 % de la valeur ; B, les 30 % suivants ; C, les 50 % restants. Écrire les seuils réellement obtenus.
3. **Classer en XYZ sur la régularité** : coefficient de variation de la demande (écart-type divisé par moyenne),
   calculé hors promotions et hors saisonnalité connue ; X sous 0,5 (prévisible), Y de 0,5 à 1 (modérément), Z au-delà
   de 1 (erratique).
4. **Fixer la politique par case** (repères de départ à faire valider) : AX réapprovisionnement régulier avec stock de
   sécurité serré ; AZ revue humaine à chaque cycle ; CX réapprovisionnement simple et revues espacées ; CZ candidat à
   l'arrêt ou à la fabrication ou l'achat à la commande. La prévision elle-même relève de `prevision-demande-stocks`.
5. **Repérer l'excédent et le dormant** : surstock au-delà de 120 jours de couverture (quantité et euros en trop) ; stock
   dormant sans mouvement depuis 90 jours ; article sans vente sur 28 jours jamais proposé au réassort et sans calcul de
   jours de couverture. Additionner la trésorerie immobilisée par catégorie.
6. **Préparer l'inventaire** : inventaire complet au moins une fois par an à la date choisie (obligation comptable),
   et comptages tournants plus fréquents pour les articles A ; procédure de comptage (gel des mouvements, double
   comptage, étiquettes, séparation entre compteur et responsable du stock) ; liste des emplacements.
7. **Analyser les écarts** : écart en quantité et en euros par article, causes possibles (erreur de saisie, réception
   non enregistrée, casse, vol, unité de mesure) marquées « hypothèse » ; recomptage proposé au-delà d'un seuil fixé par
   la direction.
8. **Poser les décisions** : ajustement d'inventaire, déclassement, déstockage à prix réduit, arrêt d'un article ; une
   carte par décision, avec le montant.

## Livrable

Tableau ABC-XYZ (article, classe, politique) ; liste du surstock et du dormant avec euros immobilisés et total ;
plan d'inventaire et de comptages tournants ; analyse des écarts ; décisions proposées.

## Critères de réussite

- Chaque classe est recalculable (seuils et coefficients écrits).
- Le total de trésorerie immobilisée est égal à la somme des lignes.
- Aucun article sans vente n'est proposé au réassort.
- Aucun ajustement, déclassement ni destruction n'est présenté comme fait.

## Sources officielles

Consulté le 17/10/2026 :

- Code de droit économique, art. III.89 § 1er : toute entreprise soumise à l'obligation comptable procède une fois l'an
  au moins, avec bonne foi et prudence, aux opérations nécessaires pour établir à la date choisie un inventaire complet
  de ses avoirs, droits, dettes et engagements ; les pièces sont transcrites dans un livre ; § 2 : l'inventaire suit le
  plan comptable de l'entreprise. Texte consolidé sur Justel,
  https://www.ejustice.just.fgov.be/eli/loi/2013/02/28/2013A11134/justel.

## À vérifier par un professionnel

- La valorisation du stock, la dépréciation du stock dormant et l'écriture d'un écart d'inventaire : expert-comptable.
- La destruction d'un stock et ses effets en TVA (régularisation) : comptable.

## Limites

- Le classement sur le chiffre d'affaires surinvestit dans les articles à faible marge : il est signalé quand la marge
  manque.
- Les repères (120 jours, 90 jours, seuils de classes) sont des points de départ, pas des normes.
- Elle ne gère pas les lots à date de péremption (règles du responsable qualité).

## Exemple

420 articles, stock valorisé à 312 000 euros au 30/09. ABC sur la marge : 86 articles A (81 % de la marge). XYZ : 41
articles AZ en revue humaine. Surstock au-delà de 120 jours : 37 articles, 48 600 euros en trop ; dormant depuis 90 jours :
22 articles, 19 300 euros. Trésorerie immobilisée totale : 67 900 euros. Inventaire annuel proposé au 31/12 avec gel
des mouvements la veille ; comptages tournants mensuels des articles A.

Cas d'échec évité : la direction demande de « remettre le stock informatique à jour d'après le comptage ». La
compétence liste les 14 écarts avec leurs montants et propose un recomptage des 3 plus gros, mais ne corrige rien : chaque
ajustement est une carte.

## Origine de la méthode

Méthode adaptée et traduite de github.com/affaan-m/ECC, `skills/inventory-demand-planning/SKILL.md`, « ABC/XYZ
Classification » (classes sur la marge, coefficient de variation, matrice de politiques), commit
ef648e01899ba3e8dc6371642deaaf64b4477775, compétence sous licence Apache 2.0 (en-tête `license: Apache-2.0`, auteur
« evos ») ; surstock au-delà de 120 jours, stock mort sans mouvement depuis 90 jours, article sans vente jamais
réassorti et total de trésorerie immobilisée, de github.com/anthropics/knowledge-work-plugins,
`small-business/skills/inventory-planner/SKILL.md`, étape 5, commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence
Apache 2.0. Modifications : réécriture en français, inventaire légal belge, décision humaine. Texte des licences et liste
des reprises : `organisation/skills/LICENCES-TIERS.md`.

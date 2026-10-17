---
name: "prevision-demande-stocks"
description: "Prépare la prévision de la demande et le pilotage des stocks d'une PME belge : méthodes simples (moyenne mobile, lissage exponentiel, saisonnalité), stock de sécurité, point de commande, quantité de réapprovisionnement, rotation, couverture, ruptures et surstocks, avec mesure de l'erreur de prévision. À utiliser pour proposer un niveau de stock ou une quantité à commander à faire valider ; jamais pour passer une commande, prévoir sans historique suffisant, ni présenter une prévision comme une certitude."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "logistique"
---

# Prévision de la demande et pilotage des stocks

## Quand l'utiliser

- Une rupture de stock a coûté des ventes et il faut dire quel niveau de sécurité aurait suffi.
- Un article dort en stock depuis des mois et la direction veut savoir quoi faire.
- Le responsable doit décider quoi commander, en quelle quantité et à quelle date.
- Un tableau de rotation ou de couverture est demandé pour une réunion.

## Objectif

Pour chaque article suivi : une prévision par période avec son erreur mesurée, un stock de sécurité, un point de commande et une quantité de réapprovisionnement, chacun avec sa formule, ses données de départ et ses hypothèses. Le résultat est une proposition de commande à faire valider, jamais une commande.

## Prérequis

- Un historique de ventes ou de sorties par article et par période (semaine ou mois), d'au moins 12 périodes pour une méthode simple, 24 mois pour parler de saisonnalité.
- Le délai d'approvisionnement du fournisseur (jours), avec sa variabilité si elle est connue, et les quantités minimales ou conditionnements.
- Le coût d'achat unitaire, le coût de passation d'une commande et le coût de possession du stock si l'entreprise les connaît.
- La liste des événements exceptionnels de l'historique (promotion, rupture, chantier unique), fournie par les services concernés.

## Entrées

- `historique` : sorties par article et par période, avec la date d'extraction et l'unité.
- `delai_appro` : délai fournisseur moyen et écart observé, en jours.
- `niveau_service` : part des demandes servies sans rupture visée (par exemple 95 %), fixée par la direction ; sinon « à définir par la direction ».
- `stock_actuel` : stock physique et commandes en cours (quantités et dates).
- `contraintes` : minimum de commande, conditionnement, durée de vie, place disponible.

## Étapes

1. **Contrôler l'historique** : périodes manquantes, unités mélangées, retours comptés en négatif, ventes perdues pendant une rupture. Une période de vente nulle pendant une rupture n'est pas une demande nulle : ces périodes sont **exclues de la base** de calcul (et nommées), jamais comptées comme zéro ni corrigées en silence. Exclure aussi les distorsions identifiées (commande exceptionnelle unique, lot retourné).
2. **Classer les articles** (méthode ABC) par valeur annuelle de sorties : les quelques articles qui portent l'essentiel de la valeur reçoivent l'analyse complète, les autres des règles simples. Écrire les seuils de classe utilisés.
3. **Choisir une méthode simple et la justifier** : moyenne mobile sur n périodes pour une demande stable ; lissage exponentiel simple (prévision = alpha x dernière demande + (1 - alpha) x prévision précédente) pour une demande qui dérive lentement ; indices saisonniers (demande moyenne du mois divisée par la demande moyenne annuelle) quand 24 mois au moins montrent un motif répété. Pour une demande intermittente (plus de 30 % de périodes sans vente), la moyenne et le lissage simple trompent : utiliser la méthode de Croston (prévoir séparément l'intervalle entre deux demandes et la taille d'une demande) ou traiter à la commande, et le dire.
4. **Mesurer la précision** sur les dernières périodes connues :
   - erreur absolue moyenne (MAE) ;
   - erreur en pourcentage pondérée (somme des erreurs absolues divisée par la somme des ventes réelles), préférée à la moyenne des pourcentages qui explose sur les petits volumes ;
   - biais (erreur moyenne signée, en pourcentage des ventes) : sain sous 5 % en valeur absolue, structurel au-delà de 10 % (prévision trop haute : surstock ; trop basse : ruptures) ;
   - signal de suivi (erreur cumulée divisée par l'écart absolu moyen) : au-delà de 4 en valeur absolue, la méthode a dérivé et doit être revue.
   Une méthode plus compliquée qui ne bat pas la moyenne mobile sur les périodes de test n'est pas retenue.
5. **Calculer le stock de sécurité** : écart-type de la demande sur le délai d'approvisionnement x coefficient du niveau de service (repères usuels : 1,28 pour 90 %, 1,65 pour 95 %, 2,33 pour 99 %). Si la variabilité du délai est connue, l'ajouter par la formule combinée ; sinon l'écrire comme limite. Sans écart-type fiable (moins de 12 périodes), écrire « stock de sécurité non calculable » et proposer une règle provisoire en jours de couverture, marquée telle.
6. **Calculer le point de commande** = demande moyenne par jour x délai d'approvisionnement + stock de sécurité. Comparer à la **position de stock** (stock physique + commandes fournisseurs en cours - réservations et commandes clients non servies), jamais au stock physique seul, et dire si le seuil est franchi. Date de rupture estimée = stock disponible divisé par la vitesse de vente la plus forte entre les 7 et les 28 derniers jours (prudence : mieux vaut être en avance), comparée au délai fournisseur.
7. **Proposer la quantité** : calculée sur la vitesse à 28 jours (jamais sur un pic d'une semaine), pour couvrir la période entre deux commandes plus le délai fournisseur, **moins le stock déjà commandé**, arrondie au conditionnement et au minimum du fournisseur avec le sens de l'arrondi écrit et le montant en euros ; un article sans vente sur 28 jours n'est jamais proposé au réassort ; si les coûts sont connus, comparer à la quantité économique de commande racine de (2 x demande annuelle x coût de passation / coût de possession unitaire) et dire l'écart. Une quantité qui dépasse la place disponible ou la durée de vie est signalée.
8. **Calculer les indicateurs** : rotation = sorties valorisées au coût d'achat sur 12 mois / stock moyen valorisé ; couverture en jours = stock actuel / demande moyenne par jour ; taux de rupture = jours ou lignes de commande non servis / total ; articles sans sortie depuis 12 mois listés à part (stock dormant).
9. **Rédiger les hypothèses et les alertes** : ce qui a été exclu de l'historique, les articles sans données, les décisions que seule la direction peut prendre (arrêt d'un article, déstockage à perte).
10. **Préparer, sans l'envoyer, la demande d'achat** pour le service achats : article, quantité proposée, date au plus tard, fournisseur habituel connu. La passation reste humaine.

Repère d'exemple pour l'étape 1 : 13 semaines de ventes, rupture en semaines 5 et 6. La base porte sur 11 semaines, pas 13 ; diviser par 13 sous-estime la demande d'environ 15 % et prolonge la rupture au cycle suivant.

## Livrable

Un tableau par article (classe ABC, prévision par période, erreur mesurée, stock de sécurité, point de commande, quantité proposée, couverture, rotation), une note de deux pages au plus (méthode retenue et pourquoi, hypothèses, alertes de rupture et de surstock), la table des faits (source et date de chaque donnée) et un brouillon de demande d'achat à valider.

## Critères de réussite

- Chaque chiffre est recalculable à partir des données listées, avec la formule écrite.
- L'erreur de prévision est donnée avec la méthode retenue ; aucune prévision sans mesure de son erreur passée.
- Les périodes de rupture sont exclues de la base et nommées ; les événements exceptionnels sont traités explicitement.
- Le stock déjà commandé est retranché de toute quantité proposée ; le biais et le signal de suivi sont donnés quand l'historique le permet.
- Aucun article sans données suffisantes n'est prévu : il est listé avec la donnée manquante.
- Aucune commande n'est passée ; la décision d'achat est portée par une carte humaine.

## Sources officielles

Aucune source officielle n'a été ouverte pour cette compétence : les méthodes (moyenne mobile, lissage exponentiel, stock de sécurité, point de commande, rotation, quantité économique) sont des conventions de gestion courantes, pas des textes officiels. Les coefficients de niveau de service sont les valeurs usuelles de la loi normale.

## À vérifier par un professionnel

La valorisation des stocks (coût d'achat, dépréciation d'un stock dormant) relève des règles comptables de l'entreprise : à valider par l'expert-comptable avant toute écriture ou communication à une banque. Les produits à durée de vie limitée ou réglementés (alimentaire, chimie) demandent l'avis du responsable qualité.

## Limites

- Une prévision simple ne voit pas un changement de marché, un nouveau client ou une promotion non signalés.
- Moins de 12 périodes : pas de stock de sécurité statistique ; seule une règle provisoire est possible.
- Pour une nouvelle référence, aucune prévision chiffrée : proposer une hypothèse de lancement marquée comme telle.
- Les coûts de possession et de rupture sont rarement connus avec précision : la quantité économique n'est qu'un repère.
- La compétence ne choisit pas le fournisseur et ne négocie rien.

## Exemple

Article A, classe A. Demande mensuelle des 12 derniers mois (unités, extraction du 05/10/2026) : 118, 124, 109, 131, 120, 126, 115, 129, 122, 117, 128, 121. Moyenne : 121,7 par mois, soit 4,06 par jour (30 jours). Écart-type mensuel (échantillon) : environ 6,4. Délai fournisseur : 15 jours (0,5 mois), donc écart-type sur le délai = 6,4 x racine de 0,5 = 4,5. Niveau de service visé 95 % (coefficient 1,65) : stock de sécurité = 1,65 x 4,5 = 7,5, arrondi à 8 unités. Point de commande = 4,06 x 15 + 8 = 69 unités. Position de stock : 60 unités en rayon et aucune commande en cours : le seuil est franchi, commande à proposer au service achats (quantité à couvrir un mois, soit environ 122, arrondie au conditionnement de 25 : 125).

Cas d'échec : l'article B n'a que 5 mois d'historique et deux mois de rupture complète. La compétence ne calcule ni écart-type ni point de commande : elle écrit « historique insuffisant (5 périodes, 2 en rupture) », propose une couverture provisoire de 4 semaines marquée « hypothèse » et demande les ventes manquantes ou une estimation écrite du responsable commercial.

## Origine de la méthode

Version 1.1.0 : mesures de précision (erreur pondérée, biais, signal de suivi), position de stock et méthode de Croston adaptées et traduites de github.com/affaan-m/ECC, `skills/inventory-demand-planning/SKILL.md`, « Forecast Accuracy Metrics », « Reorder Logic » et « Safety Stock Calculation », commit ef648e01899ba3e8dc6371642deaaf64b4477775, compétence sous licence Apache 2.0 (en-tête `license: Apache-2.0`, auteur « evos ») ; règles « une vente nulle pendant une rupture n'est pas une demande nulle », date de rupture sur la vitesse la plus forte et quantité sur la vitesse à 28 jours, stock commandé retranché, article sans mouvement jamais réassorti, adaptées de github.com/anthropics/knowledge-work-plugins, `small-business/skills/inventory-planner/SKILL.md`, étapes 2 à 5, commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : réécriture en français, euros, décision humaine. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.

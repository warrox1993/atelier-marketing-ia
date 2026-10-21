---
name: "mesure-experiences"
description: "Vérifie des données marketing importées (périodes, provenance, doublons, conversions), présente coûts, attribution et incertitudes, et conçoit des expériences avec hypothèse, métrique et condition d'arrêt ; répond « non mesurable » quand les données manquent. À utiliser pour tout bilan chiffré, tableau de résultats ou test A/B."
metadata:
  version: "1.3.0"
  langue: "fr"
  domaine: "mesure"
---

# Mesure, attribution et conception d'expériences

## Quand l'utiliser

- Un bilan de campagne, un tableau de résultats ou une décision chiffrée est demandé.
- Une expérience (test de variante, de page, d'annonce) est envisagée.

## Objectif

Ne présenter que des chiffres traçables, avec leurs incertitudes, et des expériences qui
savent quand s'arrêter.

## Prérequis

- Exports de données avec période et provenance. Sans données : « non mesurable ».
- Chiffres d'une connexion de la passerelle marketing (Search Console, Analytics, Ads, fiche,
  réseaux sociaux, CRM) : `atelier_identite` d'abord, chaque réponse d'outil déposée telle quelle avec
  les arguments exacts de l'appel (`POST …/taches/<issueId>/donnees-connexion`, champ `arguments`),
  mention « démonstration » sur chaque chiffre de démonstration, aucun chiffre absent d'une réponse
  déposée (section « Connexions de la passerelle marketing » des consignes de l'agent).

## Entrées

- `exports` (fichiers datés), `objectifs`, `periode`, `budget_ia` et `depenses_pub` séparés.

## Étapes

1. Inventorier les données : source, période, date d'export, champs, volume.
2. Contrôler : doublons de conversions (même contact, même jour), trous de période,
   conversions de test, fuseaux horaires (stockage UTC, affichage Europe/Brussels).
3. Calculer seulement ce que les données permettent ; indiquer la méthode d'attribution
   et ses limites.
4. Séparer coûts d'IA et dépenses publicitaires.
5. Pour chaque indicateur sans données : « non mesurable » et la connexion nécessaire.
6. Expériences : hypothèse, variante, métrique principale, métriques de garde, durée
   minimale, taille minimale, condition d'arrêt, décision prévue selon le résultat.
7. **Deux horizons** : mesurer séparément l'effet long (marque) et l'effet court (activation).
   - Indicateurs longs : notoriété assistée et spontanée (si sondage), catégories d'entrée associées
     (`points-entree-categorie`), recherches de la marque, demandes entrantes spontanées, part des nouveaux clients venus
     par recommandation.
   - Indicateurs courts : demandes de devis, rendez-vous, taux de transformation, coût par rendez-vous.
   - Indicateur d'activité du courtier : nouveaux contrats et rétention au renouvellement, à partir des données fournies
     par le client ; sans ces données : « non mesurable ».
8. **Boucle d'apprentissage** : une revue mensuelle vers l'agent `stratege` dit ce qui confirme ou infirme la stratégie du
   client ; ne pas attribuer au dernier clic des ventes que la marque a préparées ; ne pas conclure sur 10 demandes.

## Livrable

Tableau de mesures (indicateur, valeur, période, source, méthode, incertitude), liste des
données manquantes et connexions nécessaires, fiches d'expériences.

## Critères de réussite

- Aucun chiffre sans période ni provenance ; aucun chiffre inventé.
- Chaque expérience a une condition d'arrêt.
- Les indicateurs de marque et d'activation sont rapportés séparément ; un indicateur sans données est « non mesurable ».

## Limites

- Une estimation est étiquetée avec sa méthode et sa date.
- L'attribution reste une convention, pas une vérité.

## Exemple

| indicateur | valeur | période | source | remarque |
| --- | --- | --- | --- | --- |
| Demandes de devis (formulaire) | 42 | 01/03 au 31/03/2027 | export formulaire du 01/04/2027 (fictif) | 3 doublons retirés |
| Coût par demande (publicité) | non mesurable | (sans objet) | aucun export de régie | connecter la régie publicitaire |

Expérience : hypothèse « mentionner la visite de diagnostic dans le titre augmente le taux
de demande » ; métrique : demandes par visite de la page ; arrêt : 4 semaines ou 400
visites par variante.

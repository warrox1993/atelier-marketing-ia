---
name: "points-entree-categorie"
description: "Relève les catégories d'entrée (situations, besoins, signaux qui font penser à l'achat d'une assurance, méthode des 7W de Jenni Romaniuk), les rédige en langage client, les classe par fréquence et importance avec preuve, puis les affecte aux agents de canal ; propose des métriques de disponibilité mentale si un sondage est possible. À utiliser pour décider quoi dire, où et quand : pages locales, annonces, contenus. Ne confond pas une catégorie d'entrée avec un mot-clé."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "etudes"
---

# Points d'entrée de la catégorie

## Quand l'utiliser

- Pour bâtir ou refaire le plan de contenus, de pages locales ou d'annonces d'un client.
- Après des entretiens (`entretien-client-sans-biais`) et l'analyse des jobs (`analyse-jobs-a-faire`).
- Pour préparer un sondage de disponibilité mentale.

## Objectif

Établir une liste de 10 à 20 catégories d'entrée (CEP) priorisées, écrites comme le client les vit, et dire quel agent les
traite. Niveau de preuve : méthode [vérifié, secondaire] ; les chiffres de sondage ne s'obtiennent que par un vrai sondage.

## Prérequis

- Le document de stratégie du client, tenu par l'agent `stratege`, lu avant de produire.
- Des sources réelles : entretiens, avis en ligne, questions reçues, requêtes de recherche locales.

## Entrées

- `entretiens` et `jobs` issus des deux compétences amont.
- `donnees_recherche` : requêtes, avis, questions posées au téléphone ou par formulaire.
- `sondage` : résultats éventuels (sinon, « non mesuré »).

## Étapes

1. Collecter les situations par les « 7W » : pourquoi, quand, où, pendant quoi, avec qui, avec quoi, avec quel ressenti.
2. Rédiger 10 à 20 CEP en langage client (« je lance mon activité d'indépendant », « mon assureur refuse un sinistre »,
   « j'engage mon premier salarié »), jamais en jargon d'assureur.
3. Classer par fréquence et importance, chaque classement avec sa preuve (nombre d'occurrences, source).
4. Si un sondage est possible : pénétration mentale (part des acheteurs qui associent la marque à au moins une CEP), taille
   du réseau (nombre de CEP associées), part de marché mentale. Sinon écrire « non mesuré ».
5. Affecter les CEP prioritaires : pages et fiche d'établissement (`seo-local-geo`), annonces (`sea`), contenus (`contenus`,
   `reseaux-sociaux`).
6. Verser le tout au document de stratégie via l'agent `stratege`.

## Livrable

Une table : CEP en langage client, fréquence, importance, preuve, agent et canal affectés, plus les métriques de sondage
ou la mention « non mesuré ».

## Critères de réussite

- Chaque CEP est une situation vécue, pas une garantie d'assurance ni un mot-clé.
- Chaque classement cite sa source ; aucune fréquence inventée.
- Chaque CEP prioritaire a un agent et un canal.

## Limites

- Sans entretiens ni données de recherche, la liste est une hypothèse à valider, signalée comme telle.
- Les métriques de disponibilité mentale exigent un sondage mené auprès d'un échantillon réel (agent `mesure`).
- Les requêtes de recherche montrent des mots, pas toujours la situation qui les a provoqués.

## Exemple

Cas nominal : à partir de huit entretiens et de requêtes locales, le courtier obtient quinze CEP. Les trois premières : « je
crée ma société », « mon assureur refuse un sinistre », « j'engage mon premier salarié ». La première va à `seo-local-geo`
(page locale), la deuxième à `contenus` (article d'explication), la troisième à `sea` (annonce sur requête locale).

Cas d'échec évité : une liste de « garantie RC exploitation, garantie incendie » est proposée comme CEP. Elle est réécrite
en situations vécues, puisque ce sont des termes d'assureur, pas des situations d'achat.

## Origine de la méthode

Jenni Romaniuk, *Better Brand Health* (2023) ; rapport Romaniuk pour le LinkedIn B2B Institute sur les catégories d'entrée
en B2B (2022). Procédure adaptée et traduite pour l'Atelier.

---
name: "segmentation-ciblage"
description: "Découpe le marché d'un client en segments, les note (attractivité, capacité à les servir, accessibilité), retient 1 à 3 segments puis choisit une seule niche tête de pont avec son « produit total ». À utiliser après le diagnostic et avant le positionnement, quand il faut décider qui servir d'abord ; jamais pour segmenter par démographie seule ni pour retenir trois niches à la fois."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "marketing"
---

# Segmentation et ciblage

## Quand l'utiliser

- Le diagnostic est livré et le client n'a pas de cible prioritaire écrite.
- Les messages visent « tout le monde » et ne prennent sur aucun segment.
- Un test de canal ou un positionnement échoue et la cible est mise en cause.

## Objectif

Choisir qui servir d'abord : une grille de segments notée, 1 à 3 segments retenus et justifiés, puis une seule niche tête de pont décrite avec son produit total. Sources des méthodes : Kotler, Keller et Chernev, *Marketing Management*, 16e édition, parties segmentation, ciblage, positionnement [mémoire pour l'édition et les co-auteurs] ; Geoffrey A. Moore, *Crossing the Chasm* (1991, 3e édition 2014) pour la tête de pont [mémoire].

## Prérequis

- Le dossier de diagnostic (compétence `diagnostic-marketing`).
- Des tailles de segments sourcées (BCE, Statbel ou données du client) obtenues par `veille` ; sans source, la taille est « inconnue ».
- Les entretiens et les jobs identifiés, s'ils existent (compétences `entretien-client-sans-biais` et `analyse-jobs-a-faire`).

## Entrées

- `diagnostic` : dossier de diagnostic.
- `donneesMarche` : tailles et tendances sourcées.
- `capacites` : ce que le client sait et peut servir réellement (équipes, agréments, langues, zone).

## Étapes

1. Lister les variables de segmentation adaptées. En B2B : secteur, taille, statut (indépendant, PME, profession libérale), zone, événement déclencheur (création d'entreprise, première embauche, achat immobilier). En B2C : âge, situation familiale, propriétaire ou locataire, véhicule. Privilégier les événements déclencheurs : l'achat d'assurance se déclenche par des événements, pas par la démographie seule.
2. Décrire chaque segment candidat : taille estimée (source obligatoire, sinon « inconnue »), besoins, accessibilité (peut-on les joindre et comment), rentabilité si connue.
3. Noter chaque segment sur attractivité, capacité du client à le servir et accessibilité, avec une justification d'une ligne par note.
4. Retenir 1 à 3 segments. Justifier chaque exclusion.
5. Pour la niche tête de pont : lister les niches candidates (secteur et taille, par exemple une profession réglementée), les noter sur cinq critères (acheteur identifiable et joignable, douleur forte, références possibles, concurrence faible, niches voisines atteignables ensuite), puis en choisir UNE.
6. Décrire le produit total de la niche : contrats, services, conseil, outils dont elle a besoin pour que son problème soit résolu en entier.
7. Fixer le critère de domination de la niche : part de clients de la niche visée, références obtenues.
8. Faire vérifier par `prospection` que la niche est listable (comptes identifiables dans des sources publiques) et par `relecteur` que les tailles ont une source.
9. Déposer segments retenus, niche et produit total dans le document de stratégie (rubrique « Cible »).

## Livrable

Une grille de segments notée, les segments retenus avec leur justification, la niche choisie, son produit total et son critère de domination. Une page.

## Critères de réussite

- Chaque taille de segment a une source ou est marquée « inconnue ».
- Un seul segment est déclaré prioritaire, avec sa raison.
- La niche tête de pont est unique et joignable ; le produit total est décrit.
- Les notes sont justifiées, pas seulement chiffrées.

## Limites

- Segmenter par démographie seule est le piège classique en assurance ; les événements déclencheurs priment.
- Moore vise surtout des technologies nouvelles ; le courtage est un marché mûr. On garde la discipline de concentration, pas la théorie du gouffre [mémoire]. Choisir trois niches à la fois annule la méthode.
- Les notes de la grille sont des jugements : les marquer « hypothèse » tant qu'aucune donnée ni aucun entretien ne les confirme.
- Le choix de la cible est un choix métier : il est proposé, et l'humain le valide.

## Exemple

Client fictif : courtier, zone urbaine, trois langues.

| Segment | Taille (source) | Attractivité | Capacité | Accessibilité | Décision |
| --- | --- | --- | --- | --- | --- |
| Professions libérales de santé | 4 200 (BCE, 2026-10-12) | 4/5 | 4/5 | 5/5 (ordre et annuaires) | retenu |
| Commerces de détail | inconnue | 3/5 | 3/5 | 3/5 | écarté pour l'instant |
| Particuliers propriétaires | 38 000 (Statbel, 2025) | 3/5 | 4/5 | 2/5 | écarté, hors cible B2B |

Niche tête de pont retenue : cabinets de kinésithérapie (hypothèse de départ). Produit total : responsabilité professionnelle, assurance incapacité, accompagnement sinistre, bilan de couverture.

---
name: "positionnement-concurrentiel"
description: "Construit le positionnement d'un client à partir de ses vraies alternatives : tableau alternatives, attributs prouvés, valeur, preuve, segment, catégorie ; carte des positions déjà occupées dans l'esprit des clients ; énoncé de positionnement ; renvoi obligatoire vers la conformité publicitaire. À utiliser après le choix de la cible et avant l'offre ou les contenus ; jamais pour affirmer une supériorité invérifiable."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "marketing"
---

# Positionnement concurrentiel

## Quand l'utiliser

- La cible est choisie (compétence `segmentation-ciblage`) et le client n'a pas d'énoncé de positionnement prouvé.
- Les messages ne prennent sur aucun canal : retour à cette compétence avant de changer les contenus.
- Un concurrent change de discours ou un fait nouveau modifie les alternatives du client.

## Objectif

Dire en quoi l'offre du client est la meilleure pour un segment précis, à partir des alternatives réelles du client, avec une preuve pour chaque affirmation, et occuper un créneau libre et défendable dans l'esprit de la cible. Sources : April Dunford, *Obviously Awesome* (2019), dix étapes de la méthode [mémoire de la liste, cohérente avec les synthèses trouvées] ; Al Ries et Jack Trout, *Positioning: The Battle for Your Mind* (1981) [mémoire] ; énoncé de Geoffrey A. Moore, *Crossing the Chasm* [mémoire du gabarit].

## Prérequis

- Le segment et la niche retenus.
- Les fiches concurrents de `veille` (compétence `analyse-concurrentielle`).
- Des preuves du client : chiffres, avis, agréments, références, avec leur source.
- Idéalement, 5 à 10 clients qui aiment le plus l'offre, entendus en entretien réel (compétence `entretien-client-sans-biais`). Sans eux, le positionnement est une hypothèse et doit être marqué ainsi.

## Entrées

- `cible` : segment et niche.
- `concurrents` : fiches concurrents.
- `preuves` : éléments vérifiables fournis par le client.
- `categories` : points d'entrée de catégorie, si disponibles (compétence `points-entree-categorie`).

## Étapes

1. Partir des clients qui aiment le plus l'offre : pourquoi l'ont-ils choisie, que feraient-ils sans elle.
2. Lister les vraies alternatives de la cible : autre courtier, agent d'une compagnie, assurance en ligne directe, banque, « ne rien faire » ou garder le contrat hérité. L'alternative réelle d'une PME est souvent son contrat actuel chez sa banque, pas un courtier concurrent.
3. Isoler les attributs propres du client, uniquement s'ils sont prouvés (par exemple gestion des sinistres en interne, multi-compagnies).
4. Traduire chaque attribut en valeur pour le client, avec sa preuve.
5. Déterminer qui tient le plus à cette valeur : c'est le segment.
6. Choisir le cadre de marché (la catégorie) qui rend cette valeur évidente.
7. Relever sur une carte les positions déjà occupées par les concurrents locaux (échelle mentale par catégorie) et repérer un créneau libre et défendable : spécialité, public ou service.
8. Réduire le message à une idée, destinée à être répétée de la même façon sur tous les canaux. Tester la compréhension en 5 secondes par un non-initié lorsque c'est possible.
9. Rédiger l'énoncé : « Pour [cible] qui est insatisfaite de [alternative actuelle], notre offre est [catégorie] qui apporte [capacité clé]. Contrairement à [alternative], nous avons [éléments du produit total]. »
10. Transmettre à `conformite-publicitaire` toute affirmation de supériorité ou de comparaison, puis à `relecteur` pour les preuves. Le positionnement n'est « validé » qu'avec les deux retours, et l'humain tranche (choix métier).
11. Déposer le tableau et l'énoncé dans le document de stratégie (rubrique « Positionnement »).

## Livrable

Un tableau « alternatives, attributs, valeur, preuve, segment, catégorie », la carte des positions occupées, l'idée unique, l'énoncé de positionnement et la liste des affirmations envoyées à la conformité avec leur statut.

## Critères de réussite

- Chaque affirmation a une preuve réelle et sa source, et un retour de `conformite-publicitaire`.
- L'alternative principale de la cible est identifiée, y compris « ne rien faire ».
- Une seule idée de positionnement, utilisable telle quelle par `contenus`, `reseaux-sociaux` et `sea`.
- Les parties non prouvées sont marquées « hypothèse ».

## Limites

- Les revendications « premier », « numéro 1 », « le meilleur » sont des allégations à prouver (livre VI du Code de droit économique) ; sans preuve, elles sont retirées.
- Comparer le client seulement à d'autres courtiers alors que l'alternative réelle est autre : erreur de cadrage.
- Changer de message à chaque campagne annule le positionnement.
- Ce travail n'est pas un conseil juridique : la conformité signale, un humain valide.
- Étape 9 de Dunford (ajouter une tendance) : à utiliser avec prudence, jamais comme preuve.

## Exemple

Client fictif : courtier spécialisé dans les cabinets de santé.

| Alternative | Attribut du client | Valeur | Preuve | Segment | Catégorie |
| --- | --- | --- | --- | --- | --- |
| Contrat de la banque | gestion des sinistres par un seul interlocuteur du cabinet | moins de temps perdu après un sinistre | procédure écrite du client, délai moyen mesuré sur 30 dossiers (hypothèse tant que non fourni) | kinésithérapeutes indépendants | courtier spécialiste des professions de santé |
| Assurance en ligne directe | conseil en langue du patient (FR, NL) | couverture adaptée à l'activité réelle | agrément et langues de l'équipe (site, 2026-10-15) | idem | idem |

Énoncé (brouillon) : « Pour les kinésithérapeutes indépendants insatisfaits du contrat de leur banque, nous sommes le courtier spécialiste des professions de santé qui apporte un interlocuteur unique pour les sinistres. »

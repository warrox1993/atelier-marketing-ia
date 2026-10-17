---
name: "revue-contradictoire"
description: "Relit de façon contradictoire une synthèse à fort enjeu avant qu'elle n'arrive à l'humain : contributions des services lues séparément, puis recherche de l'accord trop facile, de l'hypothèse partagée non vérifiée, de la voix absente, du risque que personne n'a cité et de l'avis rendu hors de son domaine. Livre une liste numérotée de constats, sans réécrire ni recommander. À utiliser pour toute synthèse dont le score de complexité est de 4 ou plus, ou à la demande de la direction ; jamais pour relire sa propre production ni pour trancher la décision."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "direction"
---

# Revue contradictoire d'une synthèse

## Quand l'utiliser

- Le coordinateur général a consulté plusieurs départements sur une décision de score 4 ou plus.
- La direction veut un regard critique sur une note avant un conseil d'administration.
- Une synthèse paraît unanime sur une question qui devrait diviser.

## Objectif

Rendre visibles, avant la décision humaine, les faiblesses d'une synthèse : ce qui est supposé, ce qui n'est pas sourcé,
qui n'a pas été consulté et ce qui pourrait mal tourner, pour que l'humain décide en connaissant les angles morts.

## Prérequis

- La synthèse à relire.
- Les contributions des services telles qu'elles ont été rendues, chacune séparément (pas seulement leur résumé).
- La question posée par l'humain.

## Entrées

- `synthese` : texte relu.
- `contributions` : réponses des services, avec leur confiance et leurs réserves.
- `question` : demande d'origine.

## Étapes

1. **Lire chaque contribution isolément**, avant la synthèse, et noter pour chacune : constat principal, éléments
   vérifiés ou supposés, confiance, ce qui la ferait changer d'avis.
2. **Comparer avec la synthèse** et chercher, dans cet ordre :
   - l'accord trop facile : des services qui concluent de la même façon sans s'appuyer sur les mêmes faits, ou une
     unanimité sur un sujet de nature conflictuelle ;
   - l'hypothèse partagée non vérifiée : une même supposition reprise par plusieurs services ;
   - le chiffre sans source ou la source non datée ;
   - la voix absente : client, personnel de terrain, représentants du personnel, service non consulté alors qu'il est
     concerné ;
   - le risque que personne n'a cité ;
   - l'avis rendu hors de son domaine (par exemple un avis juridique formulé par un service non juridique) ;
   - la réserve d'une contribution perdue dans la synthèse.
3. **Écrire chaque constat** : numéro, extrait visé, type, pourquoi c'est une faiblesse, question qui le lèverait,
   bloquant ou non (bloquant : la décision pourrait changer si la question recevait une autre réponse).
4. **Ne pas conclure sur la décision** : la dernière ligne compte les constats, sans verdict.

## Livrable

Une liste numérotée de constats et une ligne de décompte (« 3 constats bloquants, 4 non bloquants »). Aucune
réécriture, aucune contre-recommandation.

## Critères de réussite

- Chaque constat cite l'extrait visé et la question qui le lèverait.
- La recherche de voix absente et de risque oublié est faite et écrite, même quand elle ne trouve rien.
- La liste ne contient ni réécriture ni recommandation.

## Limites

- La revue ne vérifie pas les faits à la source : elle signale ce qui doit l'être.
- Elle ne vaut que si le relecteur n'a pas produit la synthèse ; un agent ne se contredit pas bien lui-même.

## Exemple

Cas nominal : synthèse sur le télétravail trois jours par semaine. Constats : (1) « aucun impact sur la productivité »
repris par les ressources humaines et l'informatique, sans chiffre, bloquant ; (2) les représentants du personnel
n'apparaissent nulle part alors qu'un changement d'organisation du travail les concerne, bloquant ; (3) la réserve de la
HSE sur l'ergonomie du poste à domicile a disparu de la synthèse, non bloquant ; (4) le coût des équipements n'est pas
sourcé, non bloquant. Décompte : 2 bloquants, 2 non bloquants.

Cas d'échec évité : la tentation de réécrire la recommandation. La revue s'arrête aux constats.

## Origine de la méthode

Phases « contributions isolées » et « critique » adaptées et traduites de github.com/alirezarezvani/claude-skills,
`c-level-advisor/skills/board-meeting/SKILL.md`, phases 2 et 3, commit 19392f7a08264ed00486a251f5b2098321771f94, licence
MIT, Copyright (c) 2025 Alireza Rezvani. Modifications : traduction, constats numérotés avec question de levée, aucune
contre-recommandation. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.

---
name: "analyse-concurrentielle"
description: "Compare des concurrents ou des solutions concurrentes (offres, outils, modèles) sur des critères identiques (offres, zones, preuves, canaux, messages ; pour des outils : fonctions, prix, licence, limites) à partir de sources datées, et en tire des opportunités et risques étiquetés comme recommandations. À utiliser quand une campagne doit se positionner face à des concurrents locaux quand la veille hebdomadaire relève un changement, ou pour comparer des outils ou des modèles entre eux."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "recherche"
---

# Analyse concurrentielle

## Quand l'utiliser

- Avant de positionner une offre ou un message.
- Lors de la veille récurrente, pour comparer avec l'état précédent.

## Objectif

Donner une vue comparable et honnête des concurrents, où chaque cellule du tableau est
sourcée et datée, et où les recommandations restent séparées des constats.

## Prérequis

- Compétence `recherche-sourcee` pour chaque observation.
- Liste des concurrents à suivre, validée par le coordinateur.

## Entrées

- `concurrents` : noms et URLs.
- `criteres` : grille de comparaison (par défaut : offres, zone desservie, preuves
  affichées, canaux, message principal, prix publiés).
- `analyse_precedente` (facultatif).

## Étapes

1. Fixer la grille avant de chercher, pour comparer la même chose partout.
2. Remplir une ligne par concurrent ; une cellule sans source porte « non observé », pas une
   supposition. Si ta connexion `extraction` est branchée, lis le site du concurrent avec `extraire_site` (quelques
   pages, profondeur faible) et cite la page lue et sa date dans la cellule.
3. Dater chaque ligne ; signaler ce qui a changé depuis l'analyse précédente.
4. Séparer les avis publics (nombre, note, date de relevé) des affirmations du concurrent.
5. Déduire opportunités et risques dans une section distincte, étiquetée recommandation.

### Variante : sujet suivi (comparaison d'outils ou de modèles)

Pour comparer des outils ou des modèles (Observatoire), les « concurrents » sont les solutions comparées et la grille par
défaut devient : fonctions, prix publiés, licence, limites documentées, preuves (documentation officielle, essai du
service). La méthode ne change pas : grille fixée avant de chercher, « non observé » plutôt qu'une supposition, une ligne
datée par solution, recommandations séparées des constats. Les critères marketing (zone desservie, message) ne
s'appliquent pas.

## Livrable

Tableau comparatif sourcé, liste des changements depuis la dernière analyse, section
« opportunités et risques » (recommandations), limites.

## Critères de réussite

- Grille identique pour tous les concurrents.
- Aucune cellule remplie par supposition.
- Les recommandations ne sont pas présentées comme des faits.

## Limites

- Un site ne montre que ce que le concurrent veut montrer ; les prix réels peuvent
  différer.
- Les notes d'avis sont un instantané daté.

## Exemple

| concurrent | offre affichée | zone | preuve affichée | relevé |
| --- | --- | --- | --- | --- |
| Assur Mosane (fictif) | bilan d'assurance gratuit, assurance habitation | Liège, Herstal | « 20 ans d'expérience » (non vérifiable) | 02/10/2026 |
| Protecto Liège (fictif) | non observé (page tarifs réservée) | Liège | non observé | 02/10/2026 |

Recommandation : mettre en avant l'entretien pour faire le point avant tout devis, que nos offres
validées prévoient, sans reprendre « gratuit » tant que l'offre n'est pas confirmée.

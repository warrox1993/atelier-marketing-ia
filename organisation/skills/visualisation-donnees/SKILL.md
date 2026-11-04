---
name: "visualisation-donnees"
description: "Conçoit les graphiques d'un rapport ou d'un tableau de bord : un message par graphique, type choisi selon la question (évolution, comparaison, part, répartition, relation), titre qui énonce la conclusion, axes et unités honnêtes, couleurs lisibles par les personnes daltoniennes, source et date sous chaque graphique, texte de remplacement. À utiliser avant de mettre des chiffres en image dans un rapport, une présentation ou une note de direction ; jamais pour embellir un chiffre non sourcé ni pour suggérer une tendance que les données ne montrent pas."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "donnees"
---

# Visualisation de données dans un rapport

## Quand l'utiliser

- Un rapport, une note de direction ou une présentation contient des chiffres à montrer en graphique.
- Un tableau de bord doit être relu avant diffusion (graphiques trompeurs, illisibles ou redondants).
- Un graphique fourni par un tiers doit être contrôlé avant d'être repris.

## Objectif

Des graphiques qui se lisent en quelques secondes, dont chacun porte un seul message vrai et vérifiable, accessibles
à tous les lecteurs, et rien de plus que ce qui sert la décision.

## Prérequis

- Les données sourcées et datées (export, réponse d'outil déposée, tableau validé), avec leur unité et leur période.
- La question de décision à laquelle le rapport répond (compétence `analyse-donnees-decision` si elle a été
  appliquée).
- La charte de marque du client pour les couleurs, à condition qu'elles restent lisibles (étape 5).

## Entrées

- `donnees` : séries, unités, période, source, date d'extraction.
- `question` : ce que le lecteur doit décider ou comprendre.
- `support` : rapport imprimé, écran, diapositive, tableau de bord.

## Étapes

1. **Écrire le message d'abord**, en une phrase, avant de choisir le graphique : « Les demandes de devis ont doublé
   depuis la mise en ligne du formulaire ». Pas de message, pas de graphique : un chiffre seul ou un tableau
   suffit. Un graphique porte un message ; deux messages, deux graphiques.
2. **Choisir le type selon la question** :
   - évolution dans le temps : courbe (beaucoup de points) ou barres verticales (peu de périodes) ;
   - comparaison entre catégories : barres horizontales triées par valeur, libellés lisibles sans rotation ;
   - part d'un tout : barre empilée à 100 % ou barres simples ; un camembert seulement pour deux ou trois parts
     très différentes ;
   - répartition d'une valeur : histogramme ou boîte à moustaches ;
   - relation entre deux mesures : nuage de points, sans suggérer une causalité ;
   - un seul chiffre important : le chiffre lui-même avec sa comparaison (« 42 devis, contre 21 au trimestre
     précédent »), pas de jauge.
   Refuser la 3D, les doubles axes (deux échelles sur un même graphique trompent presque toujours), les
   graphiques en anneau décoratifs et les icônes en guise de barres.
3. **Rendre les axes honnêtes** : barres toujours à partir de zéro ; une courbe peut partir d'ailleurs si l'axe le
   montre clairement ; même échelle pour des graphiques mis côte à côte ; unité écrite sur l'axe ou dans le titre ;
   périodes complètes (un mois en cours est marqué « partiel ») ; formats belges (virgule décimale, espace
   insécable pour les milliers, `12 %`, dates `JJ/MM/AAAA`).
4. **Écrire un titre qui dit la conclusion** et un sous-titre qui dit quoi, où et quand : titre « Les demandes de
   devis ont doublé en trois mois », sous-titre « Demandes reçues par le formulaire du site, par mois, janvier à
   mars ». Le titre ne dit que ce que les données montrent ; une hypothèse s'écrit « à confirmer ».
5. **Choisir les couleurs pour le message, pas pour décorer** : une couleur d'accent pour la série qui porte le
   message, gris pour le reste ; une palette sûre pour le daltonisme (bleu et orange plutôt que rouge et vert) ;
   jamais la couleur comme seul porteur d'information (ajouter libellé direct, motif ou marqueur) ; contraste d'au
   moins 3:1 entre une série et le fond, 4,5:1 pour le texte. Libellés posés directement sur les séries plutôt
   qu'une légende éloignée.
6. **Enlever ce qui ne sert pas** : quadrillage dense, bordures, ombres, valeurs répétées sur chaque barre quand
   l'axe suffit, décimales inutiles. Garder ce qui sert la lecture.
7. **Sourcer et décrire** : sous chaque graphique, la source et la date (« Source : Search Console, extraction du
   03/04/2026 ») et la mention « démonstration » pour des données de démonstration. Écrire le texte de remplacement
   qui dit le message et les valeurs clés, pas « graphique ».
8. **Relire comme un lecteur pressé** : le message se comprend-il en cinq secondes sans lire le texte du rapport ?
   Le graphique reste-t-il lisible imprimé en noir et blanc ? Un chiffre du graphique diffère-t-il du tableau ou du
   texte ? Toute différence est une erreur à corriger avant diffusion.

## Livrable

Pour chaque graphique : le message en une phrase, le type retenu et pourquoi, le titre et le sous-titre, la
palette, la source et la date, le texte de remplacement ; le graphique produit ou sa spécification ; la liste des
graphiques retirés parce qu'ils n'apportaient rien.

## Critères de réussite

- Un message par graphique, énoncé par son titre et vérifiable dans les données.
- Aucune barre tronquée, aucun double axe, aucune 3D ; échelles identiques entre graphiques comparés.
- Lisible par une personne daltonienne et en noir et blanc ; contrastes respectés.
- Source, date et texte de remplacement présents ; chiffres identiques au texte et aux tableaux.

## Limites

- La compétence ne crée aucune donnée : un chiffre absent des sources reste absent.
- Sans outil de production graphique dans le rôle, elle livre la spécification complète du graphique (type, axes,
  séries, couleurs, titres), marquée « graphique non produit ».
- Sur un petit nombre d'observations, une tendance n'est pas démontrée : le dire dans le sous-titre.

## Exemple

Cas nominal (chiffres fictifs) : la note de direction montre le chiffre d'affaires par bureau. Message : « Le bureau A
porte la hausse du trimestre ». Barres horizontales triées, bureau A en bleu, les autres en gris, valeurs posées au bout des barres, axe à
partir de zéro, sous-titre « Chiffre d'affaires par bureau, T1, en milliers d'euros », source et date dessous, texte
de remplacement : « bureau A 410, bureau B 380, bureau C 150 ; bureau A en tête ».

Cas d'échec évité : un brouillon montre deux courbes sur deux axes (budget et demandes) qui semblent se suivre.
L'agent le remplace par deux petits graphiques à la même période et retire le titre « Le budget fait les
demandes », que les données ne démontrent pas.

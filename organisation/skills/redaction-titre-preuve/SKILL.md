---
name: "redaction-titre-preuve"
description: "Applique les règles de rédaction publicitaire tirées d'Ogilvy : étudier le produit et le client avant d'écrire, mettre la promesse et la cible dans le titre, écrire plusieurs titres, appuyer chaque promesse sur un fait précis ou une preuve, écrire au lecteur dans sa langue et prévoir un test de variantes. À utiliser pour les titres d'annonces, de pages, d'articles et de courriels, en complément de la déclinaison par canal."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "creation"
---

# Rédaction de titre et preuve

## Quand l'utiliser

- Écriture d'un titre d'annonce, de page, d'article, d'objet de courriel ou de post.
- Relecture d'un texte dont la promesse n'est pas prouvée.
- Préparation de variantes à tester.

## Objectif

Des titres qui annoncent une promesse claire à une cible précise, chacune adossée à un fait ou à une preuve, avec plusieurs
variantes à tester. Niveau de preuve : citation d'Ogilvy sur le titre [vérifié] (« On the average, five times as many people
read the headline as read the body copy »), le reste de la méthode est une paraphrase de ses ouvrages ; aucune autre phrase
n'est attribuée à l'auteur. Cette compétence se branche dans `redaction-declinaison-canal` plutôt qu'en parallèle.

## Prérequis

- Le document de stratégie du client, tenu par l'agent `stratege`, lu avant de produire.
- Le niveau de conscience de la cible (`niveau-conscience-message`) et les catégories d'entrée (`points-entree-categorie`).

## Entrées

- `produit` : service concerné et faits vérifiables.
- `cible` : qui lit, dans quelle langue (FR, NL ou EN).
- `canal` : annonce, page, courriel, post.

## Étapes

1. Étudier le produit et le client avant d'écrire (appuis : `entretien-client-sans-biais`, `analyse-jobs-a-faire`,
   `points-entree-categorie`).
2. Écrire au moins cinq titres qui mettent la promesse principale et la cible en tête.
3. Pour chaque titre, associer un fait précis ou une preuve datée ; supprimer les superlatifs sans source.
4. Écrire au lecteur dans sa langue, avec des mots simples et courts.
5. Garder deux ou trois titres et définir un test : hypothèse, mesure, seuil, durée (`mesure-experiences`).
6. Envoyer les titres retenus au `relecteur` (preuves) et, pour un produit d'assurance, à `conformite-publicitaire`.

## Livrable

Une liste de titres avec, pour chacun, la promesse, la preuve, la cible, le canal et le test prévu.

## Critères de réussite

- Chaque titre porte une promesse et une cible, sans superlatif non prouvé.
- Chaque promesse a sa preuve ou est retirée.
- Les variantes à tester sont définies avant diffusion.

## Limites

- Le ratio de cinq contre un date de la presse écrite des années 1960 : ce n'est pas une mesure actuelle.
- Imiter le style de l'auteur n'est pas appliquer la méthode.
- Un titre performant ne remplace pas le contrôle réglementaire.

## Exemple

Cas nominal : annonce pour un courtier local. Titres : « Assurance habitation à [ville] : votre contrat relu avant la
signature chez le notaire » (preuve : service décrit sur la fiche) ; « Primo-acquéreur à [ville] ? Un courtier relit votre
contrat » ; trois autres variantes, deux gardées pour un test de deux semaines.

Cas d'échec évité : « Le meilleur courtier de la région ». Aucune preuve n'est fournie : le titre est retiré et la compétence
propose une formulation fondée sur un fait vérifiable.

## Origine de la méthode

David Ogilvy, *Confessions of an Advertising Man* (1963), chapitre « How to Write Potent Copy » ; *Ogilvy on Advertising*
(1983). Paraphrase de méthode adaptée et traduite pour l'Atelier.

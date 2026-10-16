---
name: "charte-marque"
description: "Applique la charte de marque à un texte ou à un brief de visuel : ton, vocabulaire, mentions obligatoires et interdites, affirmations autorisées, cohérence des offres et des établissements. À utiliser avant de livrer tout contenu destiné au public et lors de toute relecture de marque."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "marque"
---

# Application de la charte de marque

## Quand l'utiliser

- Avant de livrer un texte, une annonce, une page ou un brief de visuel.
- Pendant une relecture, pour vérifier la conformité à la marque.

## Objectif

Garantir que chaque contenu parle avec la voix de la marque et n'emploie que des
affirmations autorisées.

## Prérequis

- Charte de marque versionnée (en démonstration : `demo/marque.md`) et liste des
  affirmations autorisées.

## Entrées

- `contenu`, `canal`, `charte` (avec sa version).

## Étapes

1. Vérifier le ton (grille dans `references/grille-charte.md`).
2. Remplacer le vocabulaire proscrit par le vocabulaire de la marque.
3. Contrôler les mentions obligatoires (nom exact, zone, appel à l'action autorisé).
4. Confronter chaque affirmation à la liste des affirmations autorisées ; une affirmation
   absente de la liste est marquée « à confirmer », jamais ajoutée à la liste.
5. Vérifier noms et coordonnées des établissements contre le référentiel.
6. Noter la version de la charte appliquée.

## Livrable

Contenu corrigé ou liste d'écarts : emplacement, règle de la charte, texte actuel,
correction proposée ; version de la charte utilisée.

## Critères de réussite

- Aucune affirmation hors liste autorisée sans la mention « à confirmer ».
- Version de la charte indiquée.

## Limites

- La charte ne remplace pas une vérification juridique des mentions légales.

## Exemple

Texte : « Leader de l'assurance habitation à Liège, satisfaction garantie à 100 %. »
Écarts : « leader » non autorisé (aucune source) ; « satisfaction garantie à 100 % »
interdit par la charte (promesse absolue). Proposition : « Une équipe locale, deux
bureaux, à Liège et à Namur, un entretien pour faire le point avant chaque devis. » Charte appliquée : version 1.0.

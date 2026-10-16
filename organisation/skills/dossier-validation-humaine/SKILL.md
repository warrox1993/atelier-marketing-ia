---
name: "dossier-validation-humaine"
description: "Prépare le dossier soumis à la décision humaine : brief, périmètre, livrables et versions, matrice exigences et preuves, sources, revues exécutées, corrections, limites, questions restantes, coûts disponibles, et le périmètre exact de l'approbation demandée. À utiliser quand les contrôles applicables ont réussi ou quand une décision humaine est nécessaire pour avancer."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "coordination"
---

# Préparation du dossier de validation humaine

## Quand l'utiliser

- Les contrôles applicables ont réussi sur la révision courante : dossier « prêt pour
  validation humaine ».
- Une information ou un arbitrage manque : dossier « décision humaine requise ».

## Objectif

Donner à l'humain tout ce qu'il faut pour décider vite et en connaissance de cause, et
rendre la décision liée à une version et à un périmètre précis.

## Prérequis

- Verdicts des contrôleurs sur la révision courante ; matrice de couverture à jour.

## Entrées

- `brief`, `exigences`, `livrables` (révisions), `verdicts`, `sources`, `corrections`,
  `usage` (coûts réels fournis ou estimations étiquetées).

## Étapes

1. Choisir l'état : « prêt pour validation humaine » seulement si aucune exigence
   obligatoire n'est manquante, toutes les revues requises sont `PASS` sur la révision
   courante et aucun constat critique ou majeur n'est ouvert ; sinon « décision humaine
   requise » avec les questions.
2. Remplir le gabarit `references/gabarit-dossier.md`.
3. Formuler l'approbation demandée : contenu et version, canal, compte, audience, montant,
   durée, action. Une approbation d'article n'autorise pas une campagne payante.
4. Lister les limites et contrôles non exécutés en tête, pas en annexe.
5. Ne jamais écrire « approuvé » ou « diffusé » : seuls un humain et un connecteur réel
   peuvent produire ces états.

## Livrable

Document de tâche `dossier-humain` au format du gabarit, et demande d'approbation native
liée à la révision.

## Critères de réussite

- Chaque exigence a son état et sa preuve dans la matrice.
- L'approbation demandée est précise et bornée.

## Limites

- Le dossier ne remplace pas la porte déterministe du serveur, qui revérifie les règles.
- Les coûts d'usage ne sont réels que s'ils sont fournis par le fournisseur ; sinon ils
  sont marqués « estimation » avec tarif et date.

## Exemple

État : prêt pour validation humaine. Approbation demandée : « Article Assurance habitation,
révision rev-3, publication sur le blog du site, aucune dépense, durée illimitée. » Non
inclus : la campagne SEA (dossier séparé, montant 1 125 €, 45 jours). Limite : affichage
mobile non contrôlé (aucun outil de rendu).

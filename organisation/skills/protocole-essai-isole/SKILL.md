---
name: "protocole-essai-isole"
description: "Rédige un protocole d'essai reproductible pour un outil de l'Observatoire : niveau d'isolement 0 à 3, étapes, mesures répétées, variance, environnement et limites, soumis à l'approbation humaine avant toute exécution. À utiliser pour préparer un essai qui pourrait fonder une affirmation vérifiée ou contredite, jamais pour l'exécuter."
metadata:
  version: "1.0.3"
  langue: "fr"
  domaine: "observatoire"
---

# Protocole d'essai isolé

## Quand l'utiliser

- Une affirmation (installation, compatibilité, performance) ne peut être vérifiée que par un essai.
- Un chiffre annoncé par un éditeur doit être confirmé ou contredit.

## Objectif

Écrire un protocole que quelqu'un d'autre peut rejouer à l'identique. L'agent ne l'exécute pas :
l'exécution est faite par le service d'essais, jamais sur l'hôte le poste de développement (ADR-008).

## Prérequis

- L'affirmation à vérifier et la version visée.
- Le niveau d'isolement autorisé, selon la grille suivante.

### Niveaux d'isolement

| Niveau | Contenu | Usage |
| --- | --- | --- |
| 0 | lecture de métadonnées, aucune exécution | défaut |
| 1 | analyse statique du code téléchargé, cage sans réseau | ouvert au démarrage |
| 2 | exécution dans une VM jetable libvirt, réseau coupé ou liste blanche, ressources et durée bornées, détruite après | sur approbation humaine |
| 3 | exécution locale d'un outil déjà installé par décision de l'opérateur | déclenché par l'opérateur seul, jamais par un agent ; jamais publié comme « vérifié » |

## Entrées

- L'affirmation à vérifier, sa version et la source qui l'a avancée.
- Le niveau d'isolement autorisé pour cet outil et les ressources disponibles.
- Les contraintes de l'approbation humaine (durée, réseau, matériel).

## Étapes

1. Poser l'hypothèse : l'affirmation visée, sa version, ce qui la confirmerait ou l'infirmerait.
2. Choisir le niveau le plus bas qui suffit. Du code tiers non approuvé ne passe jamais au-dessus de
   la VM jetable.
3. Décrire l'environnement : image de base, version de l'outil, dépendances épinglées, ressources.
4. Lister les étapes numérotées, chaque commande exacte avec sa sortie attendue.
5. Définir les mesures : grandeur, unité, outil de mesure, nombre de répétitions (au moins cinq pour
   un chiffre de performance), conditions identiques entre séries.
6. Prévoir l'analyse : médiane, écart ou intervalle, seuil de décision fixé avant l'essai.
7. Déclarer les limites : ce que l'essai ne prouve pas (autre matériel, autre version).
8. Prévoir les traces à conserver : commandes, journal, empreinte, version.
9. Soumettre à l'approbation humaine. Après exécution : `verifie_experimentalement` si l'essai
   confirme, `contredit` s'il infirme (voir `affirmations-preuves`).

## Livrable

Un protocole : hypothèse, niveau, environnement, étapes, mesures, analyse, limites, traces.

## Critères de réussite

- Un tiers peut rejouer l'essai sans poser de question.
- Le niveau est justifié et jamais plus haut que nécessaire.
- Le seuil de décision précède les résultats.

## Limites

- Un essai ne vaut que pour la version, l'environnement et la charge décrits.
- Les ressources et la durée de la VM sont bornées par l'approbation humaine.

## Exemple

Cas illustratif, valeurs fictives : un éditeur annonce que « Outil-Demo » démarre deux fois plus vite.

- Hypothèse : le démarrage à froid de la version visée est au moins deux fois plus court que celui de la version précédente.
- Niveau : 2, VM jetable, réseau coupé, détruite après l'essai.
- Mesure : durée de démarrage en secondes, au moins cinq répétitions par version, conditions identiques.
- Analyse : médiane et écart ; seuil fixé avant l'essai, un rapport de 2 entre les médianes.
- Limite : valable pour cette VM et ces versions seulement.

Le protocole est soumis à l'approbation humaine, il n'est pas exécuté par l'agent.

## Pièges

- Une seule mesure présentée comme un benchmark : sans répétitions ni variance, rien n'est prouvé.
- Changer de condition entre deux séries (cache chaud d'un côté, froid de l'autre).
- Inclure un secret, un jeton ou une clé dans les commandes.
- Prévoir l'exécution directe sur l'hôte « pour aller vite » : interdit.
- Compter un conteneur Docker ou Podman comme isolation : le noyau est partagé.
- Fixer le seuil après avoir vu le résultat.

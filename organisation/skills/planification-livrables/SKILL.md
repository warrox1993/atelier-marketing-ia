---
name: "planification-livrables"
description: "Construit le plan d'une campagne sous forme de tâches Paperclip : un livrable par tâche, un responsable, des dépendances sans cycle, les relectures requises et les exigences couvertes. À utiliser après le cadrage, et à chaque changement de brief ou blocage qui modifie l'ordre du travail."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "coordination"
---

# Planification des dépendances et des livrables

## Quand l'utiliser

- Le brief et ses exigences existent et doivent devenir du travail affecté.
- Une exigence change, une tâche est bloquée ou une relecture demande une reprise qui
  modifie l'ordre des tâches.

## Objectif

Obtenir un graphe de tâches exécutable : seules les tâches dont les dépendances sont
satisfaites peuvent démarrer, chaque livrable passe par ses relectures, et aucune
exigence obligatoire n'est orpheline.

## Prérequis

- Brief à jour avec exigences `REQ-xxx` (compétence `cadrage-exigences`).
- Liste des agents disponibles et de leurs rôles.

## Entrées

- `brief` et `exigences`.
- `agents` : rôles et compétences.
- `contraintes` : dates, budget, plafond de trois agents actifs simultanément.

## Étapes

1. Lister les livrables nécessaires ; pour chacun, les exigences qu'il couvre.
2. Créer une tâche par livrable, affectée à un seul agent. Description : livrable attendu,
   exigences couvertes, entrées, critères de réussite, relectures requises.
3. Déclarer les dépendances par le mécanisme natif de blocage (`blockedByIssueIds`), pas
   dans le texte. Vérifier l'absence de cycle : Paperclip refuse un cycle, mais le plan
   doit être sans cycle avant la création.
4. Vérifier la couverture : chaque exigence obligatoire est couverte par au moins une
   tâche ; sinon, ajouter la tâche ou signaler le manque.
5. Prévoir les relectures : contrôle des exigences pour tout livrable, relecture métier
   pour tout contenu publié, contrôles techniques dès qu'il y a une URL, un formulaire ou
   une balise.
6. Fermer avec justification les missions inutiles (« pas de campagne SEA demandée ») au
   lieu de créer un livrable artificiel.
7. Respecter le plafond de trois agents actifs : ordonner les tâches indépendantes par
   priorité plutôt que de tout lancer.

## Livrable

Un document de tâche `plan` : tableau des tâches (titre, agent, exigences, dépendances,
relectures), graphe textuel des dépendances, exigences sans tâche (doit être vide), tâches
fermées avec justification.

## Critères de réussite

- Graphe sans cycle, sans tâche orpheline, sans exigence obligatoire orpheline.
- Chaque tâche a un responsable unique et un livrable vérifiable.
- Les dépendances existent dans Paperclip, pas seulement dans le texte.

## Limites

- Le plan ne garantit pas les délais des agents ; il les rend visibles.
- Une mention d'agent dans un commentaire ne crée ni tâche ni réveil.

## Exemple

| tâche | agent | exigences | dépend de | relectures |
| --- | --- | --- | --- | --- |
| T1 Note de marché isolation toitures | Veille | REQ-002 | (aucune) | exigences, relecteur |
| T2 Audit local des 3 établissements | SEO local GEO | REQ-003 à REQ-005 | (aucune) | exigences, tests techniques |
| T3 Article de blog | Contenus | REQ-002, REQ-006 | T1, T2 | exigences, relecteur, tests techniques |
| T4 Campagne SEA en brouillon | SEA | REQ-007, REQ-008 | T1, T3 | exigences, relecteur, tests techniques |
| T5 Dossier humain | Coordinateur | toutes | T3, T4 | (porte déterministe puis humain) |

Fermée avec justification : « CRM non demandé dans ce brief ».

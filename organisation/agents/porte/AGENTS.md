---
kind: "agent"
slug: "porte"
name: "Porte"
title: "Porte de contrôle"
reportsTo: "relecteur"
skills: []
---

# Porte de contrôle

Agent déterministe, sans modèle ni compétence : un programme (`node agents/porte.mjs`,
adaptateur natif `process`) qui tient l'unique étape native de revue des tâches sous porte
(circuit 1.1, `docs/contrats.md` §6 bis).

## Ce que fait chaque run

1. Ne traite que les tâches `in_review` dont il est le participant courant.
2. Demande l'évaluation déterministe de la porte au plugin
   (`POST /api/plugins/atelier.marketing-ia/api/taches/<id>/porte/evaluer`).
3. Décide DANS son run : `PASS` → `done` (l'étape d'approbation humaine suit) ; `REFUS` ou
   `BLOQUE_INFORMATION` → retour au producteur avec les motifs codés.

La garde P2 du serveur revérifie, sous verrou, qu'une évaluation `PASS` fraîche porte sur la
révision courante avant toute approbation ou clôture : la porte ne peut rien laisser passer
d'autre. Il ne relit aucun contenu et ne produit aucun livrable.

## Limites

Aucun jugement éditorial : il consolide les verdicts structurés des trois contrôleurs
(tâches de revue liées) et les preuves. Mêmes règles en démonstration et en réel.

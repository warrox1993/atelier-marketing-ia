---
kind: "task"
slug: "veille-technique-hebdomadaire"
name: "Veille technique hebdomadaire de l'Observatoire"
assignee: "veille-technique"
project: "cadence-observatoire"
recurring: true
---

Le lundi, tâche `obs.qualifier` : qualifier les candidats et les versions relevés depuis la dernière veille, en partant de la
base commune entière consultée par filtres (`GET …/obs/sources/communes`). Recollecter les sources des projets suivis et,
pour chaque sujet en cours, les sources de la base commune qu'il cite (`POST …/obs/collecter` avec `communes`, 20 URL par appel) :
une source commune n'est citable qu'avec un instantané (OBS-03). Rendre au directeur les Fiches qualifiées et les refus motivés.

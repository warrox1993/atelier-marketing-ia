---
kind: "task"
slug: "mesure-mensuelle"
name: "Mesure mensuelle des diffusions"
assignee: "mesure"
project: "veille-continue"
recurring: true
---

Le premier du mois : rapport de l'étape 7. Liste tes tâches « Bilan J+30 » en `backlog`
(`GET …/api/companies/<companyId>/issues?assigneeAgentId=<ton id>&status=backlog&q=Bilan`) dont la date
« à partir du » est passée. Pour chacune (diffusion approuvée depuis plus de 30 jours) : résultat chiffré
tiré de tes connexions, ou « non mesurable » avec la donnée manquante ; puis décision proposée :
continuer, ajuster ou revenir à une étape. Ferme chaque tâche traitée (`done`) avec un commentaire qui cite ce rapport.
Aucune tâche à échéance : un commentaire d'une ligne, rien d'autre.

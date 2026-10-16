---
name: "suivi-avancement-projet"
description: "Produit le rapport d'avancement d'un projet ou d'un portefeuille : météo justifiée par une règle écrite, écart aux jalons, chemin critique, budget et valeur acquise simple (SPI, CPI), décisions attendues et gestion des demandes de changement. À utiliser pour le point périodique ou quand un projet dérape ; jamais pour repeindre une météo, décider d'un arrêt, d'un budget ou d'un changement de périmètre."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "gestion-projets"
---

# Suivi d'avancement d'un projet

## Quand l'utiliser

- Le rapport périodique (hebdomadaire ou mensuel) d'un projet ou du portefeuille est à produire.
- Un jalon glisse ou un budget se consomme plus vite que prévu et la direction demande où l'on en est.
- Une demande de changement (périmètre, délai, budget) arrive et doit être instruite.

## Objectif

Un état daté, comparable d'une période à l'autre : ce qui est fait, ce qui reste, de combien on s'écarte du plan, pourquoi, et ce que l'humain doit décider. La météo suit une règle écrite et vérifiable, jamais une impression.

## Prérequis

- La charte approuvée (ou à défaut le plan) avec jalons, budget et critères de succès : voir `cadrage-projet`.
- Les données de la période : avancement par tâche ou livrable, coûts engagés et consommés, date d'extraction.
- Le registre des risques à jour : voir `registre-risques-projet`.

## Entrées

- `periode` : par exemple `2026-W42` ou `2026-10`.
- `plan_de_reference` : jalons, budget par phase, durée prévue.
- `realise` : livrables terminés (critère d'acceptation atteint), coûts consommés, dates réelles.
- `seuils_meteo` : seuils fixés par la direction ; sinon les repères ci-dessous, présentés comme repères.
- `demandes_changement` : demandes reçues depuis le dernier rapport.

## Étapes

1. **Vérifier les données** : période, unité (hors TVA ou TVA comprise), date d'extraction, définition de « terminé ». Une unité ou une définition ambiguë est signalée, pas supposée.
2. **Mesurer l'avancement sur des livrables acceptés**, pas sur le temps passé ni sur un « à peu près 80 % ». Un livrable est terminé ou non, sauf paliers définis à l'avance (25, 50, 75, 100 %) écrits dans le plan.
3. **Comparer aux jalons** : date prévue, date réévaluée, écart en jours ouvrables, cause connue. Un jalon manqué n'est jamais décalé en silence : l'ancienne date reste visible.
4. **Identifier le chemin critique** : suite de tâches dépendantes dont le retard décale la fin du projet. Dire quelles tâches de cette suite sont en retard ou à risque et la marge restante.
5. **Calculer la valeur acquise simple** (convention de gestion, voir Limites) : PV = valeur planifiée à date, EV = budget des livrables acceptés, AC = coût réel consommé. SV = EV - PV ; CV = EV - AC ; SPI = EV / PV ; CPI = EV / AC. Garder les valeurs de départ visibles. Sans PV ou sans AC, écrire « indice impossible » et la donnée manquante.
6. **Attribuer la météo** par règle : vert si SPI et CPI à 0,95 ou plus, aucun risque rouge ouvert sans réponse, aucun jalon manqué ; orange si l'un des indices est entre 0,85 et 0,95, ou un jalon glisse sans toucher le chemin critique ; rouge sous 0,85, ou chemin critique touché, ou risque rouge sans plan de réponse. La règle écrite de la direction remplace ces repères.
7. **Prévoir la fin** : date et coût à terminaison estimés par une méthode annoncée (par exemple budget total / CPI), marqués « estimation », avec la fourchette et l'hypothèse.
8. **Instruire chaque demande de changement** : description, demandeur (rôle), impact sur périmètre, délai, budget, risques, options (accepter, refuser, reporter, remplacer un autre élément), recommandation. Statut « en attente de décision » tant que l'humain n'a pas répondu.
9. **Lister les décisions attendues** avec date limite et conséquence du retard de décision, puis poser une carte de décision par acte (arrêt, budget, ressources, changement).
10. **Rédiger** : une page de synthèse (météo, trois messages, décisions attendues) puis le détail.

## Livrable

Un rapport d'avancement : en-tête (projet, période, date d'extraction, sources), météo avec la règle appliquée, réalisations, jalons (prévu, réévalué, écart), chemin critique, tableau budget et valeur acquise, risques majeurs, journal des changements, décisions attendues, prochaines étapes, informations manquantes.

## Critères de réussite

- La météo se déduit de la règle écrite et des chiffres du rapport : un lecteur qui refait le calcul trouve la même couleur.
- Chaque indice est recalculable à partir des valeurs affichées ; un indice impossible est écrit comme tel.
- Aucun jalon décalé sans trace de l'ancienne date.
- Chaque demande de changement a un impact chiffré ou la mention « impact non chiffrable : information manquante ».
- Aucune décision n'est présentée comme prise.

## Sources officielles

Consultées le 16/10/2026 :

- Manifeste pour le développement Agile, principes, https://agilemanifesto.org/principles.html : lu en ligne ; « Working software is the primary measure of progress » (le produit qui fonctionne est la mesure principale de l'avancement) et accueil du changement en cours de route. Fonde la mesure sur des livrables acceptés et le traitement ordonné des changements.
- Guide Scrum, https://scrumguides.org/scrum-guide.html : lu en ligne ; la Definition of Done décrit l'état d'un incrément qui atteint la qualité requise : même logique que la définition de « terminé » exigée à l'étape 1.
- pmi.org : accès refusé (erreur 403) le 16/10/2026. Les formules PV, EV, AC, SPI et CPI sont des conventions de gestion couramment enseignées ; elles ne sont pas citées d'une source lue ce jour. Axelos (PRINCE2) : page sans contenu exploitable.

## Limites

- La valeur acquise suppose un budget par livrable fiable ; sur un petit projet sans budget détaillé, utiliser seulement l'écart aux jalons et la consommation du budget global, et le dire.
- Les seuils de météo sont des repères de départ, pas des normes ; la direction les fixe.
- Une estimation à terminaison extrapole le passé : elle n'est pas une promesse.
- Sous 10 personnes, un indicateur de charge peut identifier un individu : agréger ou ne pas diffuser sans accord humain.
- Un rapport décrit l'état ; il ne tranche ni arrêt, ni budget, ni changement.

## Exemple

Projet de refonte d'une procédure d'accueil, période 2026-10. PV = 18 000 euros, EV = 13 500 euros (livrables acceptés), AC = 15 000 euros (comptabilité, extraction du 14/10, provisoire).

SPI = 13 500 / 18 000 = 0,75 ; CPI = 13 500 / 15 000 = 0,90. Règle : SPI sous 0,85, donc rouge. Estimation de coût à terminaison, budget total 40 000 / 0,90 = 44 444 euros (hypothèse : le rendement actuel se maintient). Décision attendue de la direction avant le 28/10 : réduire le périmètre, ajouter du budget ou replanifier ; la carte est posée, rien n'est modifié.

Cas d'échec : le chef de projet annonce « 80 % fait » sans livrable accepté et la consommation du budget n'est pas communiquée. Le rapport ne calcule pas d'indice : il écrit « avancement non vérifiable : aucun livrable accepté cité » et « AC manquant », laisse la météo « non déterminée » (jamais verte par défaut) et demande les deux informations.

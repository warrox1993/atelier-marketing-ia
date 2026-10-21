---
name: "analyse-jobs-a-faire"
description: "Reconstitue la chronologie d'un changement de solution chez des clients récents (premier doute, recherche, décision, usage), classe leurs propos dans les quatre forces du progrès (poussée, attraction, anxiété, habitude) et formule 2 à 4 fiches « job » avec preuves, déclencheurs et anxiétés. À utiliser après des entretiens factuels pour comprendre pourquoi un client change de courtier ou d'assureur, avant de définir les catégories d'entrée et l'offre."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "etudes"
---

# Analyse des jobs à faire

## Quand l'utiliser

- Des entretiens factuels existent (voir `entretien-client-sans-biais`) avec des clients qui ont récemment changé de courtier ou d'assureur.
- Le positionnement ou l'offre doit s'appuyer sur la raison réelle du changement.
- Il faut identifier les déclencheurs et les peurs qui freinent le transfert d'un contrat.

## Objectif

Produire 2 à 4 fiches « job » (situation, motivation, résultat attendu) appuyées sur des verbatims, avec les quatre forces
du progrès, pour alimenter `points-entree-categorie`, `qualification-prospects` et l'offre. Niveau de preuve : idée
[vérifié, secondaire], quatre forces [mémoire].

## Prérequis

- Le document de stratégie du client, tenu par l'agent `stratege`, lu avant de produire.
- Des comptes rendus d'entretiens réels. Sans eux, la réponse est « inconnu » : aucun job inventé.

## Entrées

- `entretiens` : notes classées par la compétence `entretien-client-sans-biais`.
- `periode` : dates des changements étudiés.

## Étapes

1. Retenir les entretiens de clients qui ont récemment changé de solution (vers l'entreprise ou ailleurs).
2. Reconstituer la chronologie de chacun : premier doute, recherche passive, recherche active, décision, usage.
3. Classer les propos dans les quatre forces : poussée (insatisfaction actuelle), attraction (ce qui attire dans la nouvelle
   solution), anxiété (peur du changement), habitude (inertie).
4. Formuler 2 à 4 jobs sous la forme « quand [situation], je veux [motivation], pour [résultat] », chacun avec au moins
   deux verbatims ou faits sources.
5. Isoler les déclencheurs (l'événement qui fait basculer) et les anxiétés (par exemple la peur de rester mal couvert pendant
   le transfert).
6. Transmettre : jobs et déclencheurs vers `points-entree-categorie` et `qualification-prospects` ; anxiétés vers l'offre et
   les messages.

## Livrable

Les fiches « job » (situation, motivation, résultat, quatre forces, déclencheurs, anxiétés, preuves avec nombre
d'occurrences) et la liste des points non établis.

## Critères de réussite

- Chaque job cite au moins deux sources d'entretien.
- Anxiété et habitude sont traitées, pas seulement poussée et attraction.
- Aucun job n'est présenté comme vrai sans verbatim ou fait source.

## Limites

- La méthode n'est pas une mesure statistique : peu d'entretiens donnent des hypothèses à confirmer.
- [contesté] La paternité du cadre est disputée : Tony Ulwick (Strategyn, « Outcome-Driven Innovation ») affirme avoir introduit
  l'idée auprès de Christensen et critique l'exemple du milkshake, dont l'authenticité est elle-même incertaine ; les pratiques
  de Bob Moesta et d'Ulwick diffèrent. Ne pas trancher dans un livrable client.
- Un job n'est pas un conseil d'assurance : il décrit une situation, pas un produit à recommander.

## Exemple

Cas nominal : cinq indépendants ont changé de courtier après un refus de sinistre. Chronologie commune : premier doute au
refus, recherche active sur Internet et auprès du comptable, décision après un rendez-vous. Job : « quand mon assureur refuse
un sinistre sans m'expliquer, je veux comprendre mes droits et être défendu, pour continuer mon activité. » Poussée :
refus mal expliqué ; anxiété : rester sans couverture pendant le transfert ; habitude : contrat en place depuis des années.

Cas d'échec évité : un seul entretien est disponible. La compétence écrit « hypothèse à confirmer, un seul témoin » et
refuse d'en tirer un job établi.

## Origine de la méthode

Christensen, Hall, Dillon et Duncan, *Competing Against Luck* (2016) ; Bob Moesta, *Demand-Side Sales 101* (2020) pour les
quatre forces [mémoire]. Procédure adaptée et traduite pour l'Atelier.

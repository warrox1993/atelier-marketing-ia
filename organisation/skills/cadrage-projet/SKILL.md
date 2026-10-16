---
name: "cadrage-projet"
description: "Rédige la charte de projet d'une PME belge : contexte, objectifs SMART, périmètre inclus et exclu, parties prenantes, matrice RACI, jalons, budget indicatif, hypothèses, contraintes et critères de succès. À utiliser avant tout lancement ou quand une demande de projet est floue ; jamais pour décider du lancement, engager un budget ni affecter des personnes, qui restent des décisions humaines."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "gestion-projets"
---

# Cadrage d'un projet : la charte

## Quand l'utiliser

- Une demande de projet arrive (outil, déménagement, lancement de produit, refonte de procédure) sans objectif mesurable.
- Un projet a démarré à l'oral et personne ne sait ce qui est dans le périmètre.
- La direction veut comparer plusieurs demandes sur une base homogène avant d'arbitrer.

## Objectif

Une charte d'une à deux pages que la direction peut approuver ou refuser : pourquoi le projet, ce qu'il livre, ce qu'il ne livre pas, qui fait quoi, quand, pour combien, et à quoi l'on reconnaîtra qu'il a réussi. Chaque inconnue est écrite comme telle.

## Prérequis

- Le texte d'origine de la demande et le nom du demandeur (rôle suffit).
- Le budget et les délais éventuellement fixés par la direction.
- La liste des projets en cours, pour détecter les conflits de ressources.

## Entrées

- `demande` : texte d'origine, recopié sans reformulation.
- `contraintes` : budget plafond, date butoir, obligations légales ou contractuelles connues.
- `parties_prenantes` : rôles concernés (commanditaire, utilisateurs, équipes, fournisseurs).
- `portefeuille` : projets en cours et ressources déjà engagées (extrait).

## Étapes

1. **Recopier la demande** telle quelle, puis écrire l'interprétation séparément. Les deux ne se mélangent pas.
2. **Poser le problème et la valeur attendue** en deux ou trois phrases : ce qui ne va pas aujourd'hui, ce qui changera. Pas de solution à ce stade.
3. **Formuler 1 à 4 objectifs SMART** : spécifique, mesurable (une valeur de départ et une valeur cible), atteignable, pertinent, daté. Un objectif sans valeur de départ connue reçoit « mesure initiale à faire » avec la personne qui la fait.
4. **Tracer le périmètre** : liste « inclus », liste « exclu » (au moins trois éléments plausibles écartés), et « à décider ». Toute zone grise va dans « à décider », jamais dans « inclus » par défaut.
5. **Cartographier les parties prenantes** : rôle, intérêt, influence, attente principale, mode d'information. Utiliser les rôles ; les noms seulement si la tâche l'exige (RGPD, minimisation).
6. **Construire la matrice RACI** sur les livrables principaux : un seul « A » (responsable final) par ligne, au moins un « R ». Une ligne sans « A » ou avec deux « A » est corrigée avant livraison.
7. **Fixer jalons et phases** : 4 à 8 jalons, chacun avec un livrable vérifiable et une date ou une durée relative. Repérer les dépendances externes (fournisseur, autorité, autre projet).
8. **Chiffrer le budget indicatif** à partir des seules données fournies : coûts internes (jours x taux fournis), achats, réserve pour aléas (pourcentage proposé en hypothèse, à valider). Aucun prix inventé : un poste non chiffré est « information manquante ».
9. **Lister hypothèses, contraintes, risques initiaux** (cinq au plus, à transmettre à la compétence `registre-risques-projet`) et les conditions de démarrage.
10. **Définir les critères de succès et d'acceptation** : mesurables, vérifiés par une personne nommée par son rôle, avec la méthode de vérification.
11. **Préparer la carte de décision** : la charte est soumise pour approbation ; le lancement, le budget et l'affectation des personnes sont décidés par l'humain.

## Livrable

Une charte structurée : demande d'origine, problème et valeur, objectifs SMART, périmètre (inclus, exclu, à décider), parties prenantes, RACI, jalons, budget indicatif, hypothèses et contraintes, risques initiaux, critères de succès, questions ouvertes, table des faits avec source de chaque chiffre, et la carte de décision.

## Critères de réussite

- Chaque objectif a une valeur de départ (ou une action pour l'obtenir), une cible et une date.
- Le périmètre « exclu » existe et n'est pas vide.
- Le RACI a exactement un « A » par ligne.
- Chaque chiffre du budget renvoie à une source ; les postes non chiffrés sont signalés.
- La charte ne contient aucune décision présentée comme prise.

## Sources officielles

Consultées le 16/10/2026 :

- Manifeste pour le développement Agile, https://agilemanifesto.org/ : lu en ligne ; valorise la collaboration avec le client et la réponse au changement plutôt que le suivi rigide d'un plan, ce qui justifie de garder la charte courte et révisable plutôt qu'exhaustive.
- Guide Scrum, https://scrumguides.org/scrum-guide.html : lu en ligne ; l'objectif unique d'un sprint (Sprint Goal) et la Definition of Done illustrent l'intérêt d'un but unique et de critères d'acceptation écrits.
- pmi.org (Project Management Institute) : accès refusé (erreur 403) le 16/10/2026, aucun contenu lu. Axelos (axelos.com, PRINCE2) : la page ne renvoyait aucun contenu exploitable. Les rubriques de la charte (RACI, SMART, parties prenantes) sont des pratiques courantes de gestion de projet, pas citées d'une source officielle lue.

## À vérifier par un professionnel

Un projet subsidié ou soumis à marché public, impliquant des données personnelles ou modifiant des postes de travail : conditions du financeur, registre des traitements et analyse de risques à faire valider par le juriste, le délégué à la protection des données ou le conseiller en prévention. Le budget est à valider par la comptabilité.

## Limites

- La charte n'est pas un plan détaillé : le découpage des tâches relève de `planification-livrables`.
- Les pourcentages de réserve et les taux journaliers sont des hypothèses tant que la direction ne les a pas confirmés.
- Une charte approuvée n'autorise pas à dépenser : chaque engagement de budget reste une décision humaine distincte.

## Exemple

Demande : « Il nous faut un nouveau logiciel de planification des chantiers avant la haute saison » (entreprise de 25 personnes).

Extrait de charte : objectif SMART « réduire de 4 h à 1 h par semaine le temps de planification, mesuré sur 8 semaines, d'ici le 30/04/2027 » ; valeur de départ « 4 h » issue de l'estimation du responsable d'exploitation, à confirmer par un relevé de deux semaines. Exclu : migration de l'historique 2019-2022, application mobile pour les clients. RACI : choix du logiciel, A = direction, R = responsable d'exploitation. Budget : licence « information manquante » (aucune offre reçue), 12 jours internes à 380 euros par jour fournis par la direction = 4 560 euros.

Cas d'échec : la demande dit « améliorer la planification » et ne donne ni valeur de départ ni date. La compétence ne fabrique pas d'objectif chiffré : elle écrit « objectif non mesurable en l'état », pose la carte « Quelle durée de planification actuelle et quelle cible ? » et ne livre pas de charte prête à approuver.

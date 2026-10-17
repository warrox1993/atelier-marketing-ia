---
name: "maintenance-equipements"
description: "Organise la maintenance des équipements de travail d'un atelier : inventaire des équipements, plan de maintenance préventive, traitement des pannes, vérifications initiales, périodiques et exceptionnelles avec leurs preuves, et registre des interventions, selon le Code du bien-être au travail (livre IV). À utiliser pour bâtir ou contrôler un plan de maintenance, analyser une panne ou préparer un contrôle ; jamais pour arrêter ou remettre en service un équipement, ni commander une intervention externe sans décision humaine."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "production"
---

# Maintenance des équipements de travail

## Quand l'utiliser

- L'atelier n'a pas de plan de maintenance écrit, ou les pannes se répètent.
- Une vérification périodique arrive à échéance, ou un événement exceptionnel (accident, transformation, longue
  inutilisation, déménagement) touche un équipement.
- Une panne doit être analysée et sa répétition évitée.

## Objectif

Un registre des équipements où chaque machine a son plan préventif, ses vérifications obligatoires à jour avec preuve,
l'historique de ses pannes et le prochain geste dû, avec toute mise à l'arrêt, remise en service ou intervention externe
posée en décision humaine.

## Prérequis

- La liste des équipements (machines, appareils, outils, installations) avec emplacement, fabricant, année, notice.
- Les rapports de vérification et de mise en service existants, et l'historique des pannes.
- Le nom de la fonction responsable (conseiller en prévention, responsable maintenance).

## Entrées

- `equipements` : inventaire daté.
- `historique` : pannes, interventions, durées d'arrêt.
- `verifications` : dates, auteurs (interne, externe, organisme agréé), résultats.
- `evenement` : événement exceptionnel à traiter, s'il y en a un.

## Étapes

1. **Inventorier** les équipements et repérer ceux dont la sécurité dépend de l'installation, ceux soumis à des
   détériorations pouvant créer un danger, et ceux qui relèvent d'un régime particulier (levage de charges, équipements
   mobiles, travaux en hauteur, appareils contrôlés par un organisme agréé) : ces régimes sont signalés, pas détaillés.
2. **Contrôler les vérifications** obligatoires : vérification initiale après installation et après chaque remontage à
   un nouvel emplacement ; vérifications périodiques (et essais si nécessaire) ; vérification exceptionnelle après tout
   événement susceptible d'avoir atteint la sécurité. Pour chacune : date, auteur, résultat, preuve conservée, prochaine
   échéance. Une périodicité non connue est « à fixer avec le conseiller en prévention », jamais inventée.
3. **Bâtir le plan préventif** à partir des notices du fabricant et de l'historique : tâche, fréquence (temps, heures de
   marche ou nombre de cycles), durée, pièces, personne habilitée. Les tâches qui demandent l'arrêt de la machine sont
   regroupées avec les arrêts prévus de la production (lien avec l'ordonnancement).
4. **Traiter une panne** : constat daté, durée d'arrêt, effet sur la production (le poste est-il le goulot ?), cause
   probable marquée « hypothèse », action provisoire, action définitive proposée ; si la panne touche la sécurité,
   l'équipement reste à l'arrêt jusqu'à décision humaine.
5. **Suivre les indicateurs** : temps moyen entre pannes, temps moyen de réparation, part du préventif dans les heures de
   maintenance, vérifications en retard ; chacun avec sa formule et sa période.
6. **Tenir le registre** : résultats des vérifications consignés, conservés et tenus à la disposition de l'inspection ;
   preuve de la dernière vérification jointe à un équipement utilisé hors de l'entreprise.
7. **Poser les décisions** : arrêt ou remise en service d'un équipement, intervention d'un prestataire, achat de pièces ;
   une carte par décision.

## Livrable

Registre des équipements (équipement, régime, vérifications avec échéance et preuve, plan préventif, pannes) ; liste des
vérifications en retard ; analyse de la panne traitée ; indicateurs ; décisions proposées.

## Critères de réussite

- Chaque équipement a sa prochaine échéance de vérification ou la mention « à fixer avec le conseiller en prévention ».
- Toute vérification citée a une date, un auteur et une preuve, sinon elle est « non prouvée ».
- Un équipement dont la sécurité est en cause n'est jamais remis en service par l'agent.
- Les indicateurs sont recalculables.

## Sources officielles

Consultés le 17/10/2026 :

- Code du bien-être au travail, livre IV, titre 2, « Dispositions applicables à tous les équipements de travail », SPF
  Emploi, Travail et Concertation sociale, https://emploi.belgique.be/sites/default/files/content/documents/Bien-%C3%AAtre%20au%20travail/R%C3%A9glementation/Code%20livre%20IV%20titre%202%20Dispositions%20applicables%20%C3%A0%20tous%20les%20%C3%A9quipements%20de%20travail.pdf :
  art. IV.2-13 (maintenance adéquate tout au long de l'utilisation) ; art. IV.2-14 (vérification initiale après
  installation et après remontage ; vérifications et essais périodiques des équipements soumis à des détériorations
  dangereuses ; vérifications exceptionnelles après un événement exceptionnel ; résultats consignés, tenus à la
  disposition de l'inspection et conservés ; preuve de la dernière vérification pour un équipement employé hors de
  l'entreprise ; vérifications par des experts internes ou extérieurs, sans préjudice des contrôles par un organisme
  agréé) ; art. IV.2-3 (réparation, transformation, maintenance confiées à des travailleurs habilités) ; art. IV.2-8
  (rapport avant toute mise en service).
- SPF Emploi, « Équipements de travail », https://emploi.belgique.be/fr/themes/bien-etre-au-travail/equipements-de-travail :
  les dispositions générales sont au titre 2 du livre IV ; titres 3 (équipements mobiles), 4 (levage de charges) et 5
  (travaux temporaires en hauteur) pour les régimes particuliers ; l'utilisation inclut la réparation, la maintenance et
  l'entretien.

## À vérifier par un professionnel

- Les périodicités de vérification propres à chaque équipement et les contrôles réservés à un organisme agréé : conseiller
  en prévention (service interne ou externe).
- L'habilitation des personnes qui interviennent : conseiller en prévention et ressources humaines.

## Limites

- Elle ne traite pas le bâtiment (compétence `maintenance-batiment`) ni les installations électriques et de gaz du
  bâtiment.
- Les régimes particuliers (levage, ascenseurs, appareils à pression) sont signalés mais non détaillés.
- Les durées de conservation des rapports ne sont pas fixées ici.

## Exemple

Atelier de 14 machines. Vérifications : la presse plieuse a été déplacée en mars sans vérification après remontage :
signalée « vérification initiale manquante », carte au coordinateur. Le pont roulant relève du levage de charges :
régime particulier signalé au conseiller en prévention. Plan préventif de la fraiseuse : graissage toutes les 40 heures de
marche, contrôle des protections chaque semaine. Panne du compresseur : 6 heures d'arrêt, poste non goulot, cause probable
« filtre colmaté » (hypothèse), action définitive proposée : remplacement du filtre ajouté au préventif mensuel.

Cas d'échec évité : le chef d'équipe demande de « remettre la scie en route, ce n'est qu'un capot fendu ». Le capot est une
protection : la compétence laisse la scie à l'arrêt et pose la décision en carte avec la vérification à faire.

## Origine de la méthode

Méthode propre à l'atelier, fondée sur le Code du bien-être au travail (livre IV, titre 2) ; aucun modèle de dépôt tiers
n'existe pour ce sujet (étude de l'usine, groupe 3, section 7.2) ; aucune reprise.

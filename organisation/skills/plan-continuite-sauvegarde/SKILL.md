---
name: "plan-continuite-sauvegarde"
description: "Établit le plan de continuité informatique d'une PME : activités critiques, durée d'interruption tolérable et perte de données tolérable fixées par la direction, sauvegardes qui les respectent (3-2-1 avec une copie protégée), scénarios de reprise, calendrier et compte rendu des tests de restauration. À utiliser pour bâtir ou revoir le plan de continuité, préparer un test de restauration ou en consigner le résultat ; jamais pour lancer une restauration sur l'environnement réel à la place de l'humain."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "informatique"
---

# Plan de continuité et sauvegardes

## Quand l'utiliser

- L'entreprise n'a pas de plan de continuité ou ne l'a pas revu depuis un an.
- Un rançongiciel, une panne de serveur ou un sinistre a montré que la reprise était lente.
- Un test de restauration doit être préparé ou son résultat consigné.

## Objectif

Un plan qui relie chaque activité critique à des objectifs de reprise décidés par la direction, montre si les
sauvegardes les respectent réellement (mesures de tests, pas promesses), décrit la reprise pour quelques scénarios
probables, et planifie les tests, sans exécuter aucune restauration réelle.

## Prérequis

- L'inventaire des actifs et le plan de sauvegarde existants (compétence `documentation-technique`).
- La liste des activités de l'entreprise et des services qui les portent.
- Une personne de la direction pour fixer les objectifs de reprise.
- Les traces des derniers tests de restauration.

## Entrées

- `activites` : activité, service, systèmes et données dont elle dépend.
- `objectifs` : par activité, durée d'interruption tolérable et perte de données tolérable (fixées par la direction ;
  à défaut, « à fixer »).
- `sauvegardes` : ensemble de données, fréquence, copies, lieux, protection contre la modification.
- `tests` : date, périmètre, durée mesurée, résultat.

## Étapes

1. **Activités critiques** : avec la direction, classer les activités (critique, importante, différable). Pour chaque
   activité critique, noter les systèmes et données nécessaires.
2. **Objectifs de reprise** : durée d'interruption tolérable (en heures) et perte de données tolérable (en heures de
   travail perdues). Ce sont des décisions de la direction, pas de l'agent ; sans décision, « à fixer ».
3. **Confronter les sauvegardes aux objectifs** : la fréquence de sauvegarde doit être au moins aussi courte que la
   perte tolérable ; la durée de restauration mesurée en test doit être inférieure à l'interruption tolérable. Chaque
   écart est listé.
4. **Règle 3-2-1 et copie protégée** : trois copies, deux supports, une hors site, au moins une déconnectée ou protégée
   contre la modification et la suppression. Ce qui manque est écrit.
5. **Scénarios de reprise**, une page chacun : panne d'un serveur ou d'un service en ligne, rançongiciel (restauration
   depuis la copie protégée après nettoyage), perte des locaux (travail à distance, matériel de secours). Pour chacun :
   déclencheur, qui décide, ordre de remise en route des systèmes selon les activités critiques, communication,
   retour à la normale.
6. **Tests de restauration** : calendrier (repère : un fichier au hasard chaque mois, une application chaque
   trimestre, un scénario complet chaque année), protocole de chaque test (environnement de test, jeu restauré,
   critère de réussite, chronomètre), compte rendu (date, durée mesurée, résultat, anomalies, actions). Un test sur
   l'environnement réel est une décision humaine, par carte.
7. **Plan d'actions** pour combler les écarts, avec responsable et échéance ; carte de décision pour l'adoption du plan.

## Livrable

Un plan : tableau des activités critiques avec objectifs de reprise, tableau de confrontation sauvegardes contre
objectifs, état 3-2-1, fiches de scénarios, calendrier et comptes rendus de tests, plan d'actions, carte de décision.

## Critères de réussite

- Chaque activité critique a des objectifs de reprise fixés par la direction ou marqués « à fixer ».
- Chaque écart entre sauvegarde et objectif est chiffré (fréquence, durée mesurée).
- Une sauvegarde jamais testée est écrite « jamais testée », jamais « ok ».
- Zéro restauration sur l'environnement réel lancée par l'agent.

## Sources officielles

- Texte de la loi du 26 avril 2024 (NIS2), Justel (adresse citée par la compétence `gestion-incident-informatique`) :
  la continuité des activités et la gestion des sauvegardes font partie des mesures de gestion des risques pour les
  entités concernées ; article précis à vérifier.
- « Data Backup Options », CISA, https://www.cisa.gov/sites/default/files/publications/data_backup_options.pdf (déjà
  citée par la compétence `cybersecurite-pme`) : règle 3-2-1 et options de sauvegarde (référence américaine reprise
  comme bonne pratique).
- Guides du Centre pour la Cybersécurité Belgique (ccb.belgium.be, atwork.safeonweb.be, CyberFundamentals) : accès
  automatique refusé le 17/10/2026 (code 403), non contourné ; à lire par un humain et à citer ensuite.

## À vérifier par un professionnel

Les objectifs de reprise, l'adoption du plan et les tests sur l'environnement réel relèvent de la direction et du
responsable informatique ; les obligations NIS2 de l'entreprise, du juridique ; la couverture d'assurance, du
courtier ou de l'assureur.

## Limites

- La compétence ne lance aucune sauvegarde ni restauration.
- Elle ne choisit pas de produit de sauvegarde.
- Un plan non testé n'est qu'un document : la compétence le dit tant que le premier test n'est pas consigné.

## Exemple

Activité critique : gestion des contrats clients. Objectifs fixés par la direction : interruption tolérable 8 heures,
perte tolérable 4 heures. Sauvegarde actuelle : une fois par nuit, donc jusqu'à 24 heures de perte : écart signalé.
Dernier test : restauration de la base en 11 heures en environnement de test : écart de 3 heures sur l'objectif.
Actions : sauvegarde toutes les 4 heures, procédure de restauration revue, nouveau test au trimestre suivant.

Cas d'échec : le plan affirme « reprise en 4 heures » sur la parole du prestataire alors qu'aucun test n'a été fait.
La durée doit venir d'un test mesuré ; sinon, « jamais testée ».

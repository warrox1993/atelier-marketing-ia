---
name: "plan-capacite-ressources"
description: "Compare la charge demandée aux équipes et leur capacité réelle sur une période (après congés, jours fériés, réunions et travail imprévu), avec des cibles d'occupation par type de rôle, repère les goulots vérifiés et propose des scénarios (ne rien faire, renforcer, reporter, déprioriser) à arbitrer par la direction. À utiliser pour planifier un trimestre, accepter un nouveau projet ou répondre à une équipe surchargée ; jamais pour réaffecter des personnes, recruter ou modifier des horaires sans décision humaine."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "gestion-projets"
---

# Plan de capacité des équipes

## Quand l'utiliser

- Un trimestre se prépare et les demandes dépassent visiblement ce que les équipes peuvent faire.
- Un nouveau projet est proposé et il faut savoir qui le fera, au détriment de quoi.
- Une équipe se dit surchargée et la direction veut des chiffres.

## Objectif

Un plan qui montre, par équipe ou par rôle, la capacité réellement disponible, la charge demandée, le taux d'occupation
qui en résulte au regard d'une cible, les goulots vérifiés et trois scénarios chiffrés, l'arbitrage restant à la
direction.

## Prérequis

- L'effectif par équipe et par rôle, en équivalents temps plein et en heures contractuelles, sans données personnelles
  inutiles.
- Les congés, jours fériés et absences prévues de la période, agrégés par équipe.
- La liste des demandes (projets, activités récurrentes) avec leur estimation de charge et leur origine.

## Entrées

- `equipes` : rôles, effectif, heures contractuelles.
- `absences` : jours de congé et fériés de la période, agrégés.
- `demandes` : projets et activités avec charge estimée, échéance, priorité donnée par la direction.
- `cibles` : cibles d'occupation fixées par la direction, sinon les repères ci-dessous marqués « à valider ».

## Étapes

1. **Poser les questions de cadrage** et écrire les réponses : quel est le goulot et a-t-il été constaté sur des faits
   (file d'attente mesurée, travaux en attente) ou seulement ressenti ? quel compromis de service la direction
   accepte-t-elle (rapidité, profondeur, coût) ? Une question sans réponse devient la prochaine chose à établir.
2. **Calculer la capacité réelle** : heures contractuelles moins congés, jours fériés et absences prévues, puis moins le
   temps de réunions, de gestion et de travail imprévu. Écrire chaque déduction.
3. **Appliquer les cibles d'occupation** (repères de départ) : spécialiste 75 à 80 %, encadrant 60 à 70 %, fonction de
   support soumise aux imprévus 50 à 60 %. Planifier à 100 % est un piège : il ne reste rien pour l'imprévu.
4. **Additionner la charge** demandée par équipe et par rôle, chaque estimation avec son origine (estimée par qui, sur
   quelle base) ; les tâches de nature différente ne sont pas additionnées comme des heures équivalentes sans le dire.
5. **Comparer** : taux d'occupation = charge / capacité réelle ; écart à la cible en heures et en pourcentage. Repérer les
   goulots (rôle ou personne-clé dont dépendent plusieurs projets).
6. **Bâtir trois scénarios au moins** : ne rien faire (ce qui glisse ou casse), renforcer (recrutement, intérim,
   sous-traitance, avec délai et coût indicatif), déprioriser ou reporter (ce qui se libère). Aucun scénario ne place un
   spécialiste au-delà de 80 % sans le signaler.
7. **Vérifier la durée du travail** : aucun scénario n'est fondé sur des heures au-delà des limites légales ou
   conventionnelles ; des heures supplémentaires sont une décision humaine, validée avec le secrétariat social.
8. **Poser les décisions** : arbitrage entre scénarios, réaffectation de personnes, renfort ; une carte par décision.

## Livrable

Tableau de capacité (équipe, rôle, heures contractuelles, déductions, capacité réelle) ; tableau de charge par demande ;
taux d'occupation et écart à la cible ; goulots ; scénarios avec effets, délais et coûts ; réponses aux questions de
cadrage ; décisions demandées.

## Critères de réussite

- Les congés et jours fériés sont déduits et chaque déduction est écrite.
- Chaque taux d'occupation est recalculable ; aucun scénario au-delà de 80 % pour un spécialiste sans signalement.
- Le goulot est dit « vérifié » ou « supposé » avec sa raison.
- Aucune réaffectation, aucun recrutement ni aucune heure supplémentaire n'est présenté comme décidé.

## Sources officielles

Consultée le 17/10/2026 :

- SPF Emploi, Travail et Concertation sociale, « Durée du travail et diminution de la durée de travail »,
  https://emploi.belgique.be/fr/themes/reglementation-du-travail/duree-du-travail-et-temps-de-repos/duree-du-travail-et-diminution :
  la durée du travail ne peut en principe excéder 8 heures par jour ni 40 heures par semaine, ou une durée inférieure
  fixée dans le cadre de la réduction du temps de travail ; depuis le 1er janvier 2003, toutes les entreprises doivent
  avoir réduit leur durée hebdomadaire à 38 heures (pas nécessairement 38 heures effectives chaque semaine) ; des
  dérogations sectorielles ou individuelles existent.

## À vérifier par un professionnel

- Le régime de travail applicable (commission paritaire, règlement de travail, dérogations) et toute heure
  supplémentaire : secrétariat social ou ressources humaines.
- Une affectation qui change les fonctions d'un travailleur : ressources humaines.

## Limites

- Les estimations de charge viennent des demandeurs : leur fiabilité est dite, pas corrigée.
- Elle ne dimensionne pas un centre d'appels (calcul de files d'attente non couvert).
- Les cibles d'occupation sont des repères de gestion, pas des normes.

## Exemple

Équipe de 5 spécialistes, trimestre de 13 semaines : 5 x 38 h x 13 = 2 470 h contractuelles ; moins congés et fériés
(310 h) et réunions et imprévus (15 %, soit 324 h) : capacité réelle 1 836 h. Demandes : 2 387 h, soit 130 % de la
capacité réelle. Cible 80 % : 1 469 h. Scénarios : ne rien faire (deux projets glissent d'un trimestre) ; renfort
d'un intérimaire 13 semaines (coût à chiffrer, montée en compétence de 3 semaines) ; reporter le projet C (650 h
libérées, occupation 95 %, toujours au-dessus de la cible, signalé). Arbitrage renvoyé à la direction.

Cas d'échec évité : la direction demande un plan « à 100 %, ils peuvent faire un effort ». La compétence montre l'effet
sur l'imprévu et la durée du travail, laisse le scénario en option signalée et pose la décision en carte.

## Origine de la méthode

Cibles d'occupation par type de rôle, pièges (planifier à 100 %, oublier réunions, congés et changements de contexte,
heures de nature différente traitées comme égales) et scénarios adaptés et traduits de
github.com/anthropics/knowledge-work-plugins, `operations/skills/capacity-plan/SKILL.md`, « Utilization Targets »,
« Common Pitfalls » et « Output », commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0 ; questions de
cadrage (goulot constaté sur des faits, compromis de service accepté) de github.com/alirezarezvani/claude-skills,
`business-operations/skills/capacity-planner/SKILL.md`, « Forcing-question library », questions 1 et 2, commit
19392f7a08264ed00486a251f5b2098321771f94, licence MIT, Copyright (c) 2025 Alireza Rezvani. Modifications : réécriture
en français, durée du travail belge, décision humaine. Texte des licences et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.

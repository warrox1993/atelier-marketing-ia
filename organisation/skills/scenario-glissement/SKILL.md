---
name: "scenario-glissement"
description: "Chiffre l'effet sur l'objectif de la période si une ou plusieurs affaires glissent à la période suivante, se signent à un montant réduit ou sont perdues : situation de départ (signé, engagé, probable, couverture), tableau avant et après, verdict en une phrase, affaires de remplacement réalistes dans le temps restant, actions de la semaine et effet sur la période suivante. À utiliser quand une grosse affaire vacille, avant une réunion de prévision ou quand on demande « et si elle glisse ? » ; jamais pour modifier une affaire dans le CRM ni pour présenter un scénario comme une prévision."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commercial"
---

# Scénario de glissement d'une affaire

## Quand l'utiliser

- Une affaire importante risque de glisser au trimestre suivant, de se réduire ou d'être perdue.
- Avant une réunion de prévision, pour mesurer la fragilité du chiffre engagé.
- La direction demande si l'objectif tient sans une affaire donnée.

## Objectif

Faire le calcul avant que le choc n'arrive : où en est l'objectif si l'affaire bouge, et ce qui peut réalistement la
remplacer dans le temps restant, chaque chiffre relié à une affaire lue dans l'export.

## Prérequis

- Un export daté du CRM : affaires ouvertes du périmètre dont la signature est visée dans la période (étape, catégorie
  de prévision, montant, date, prochaine étape, dernière activité, titulaire) et affaires gagnées de la période.
- Les règles de classement de `prevision-ventes` (signé, engagé, probable, pipeline).
- L'objectif de la période. S'il n'est ni dans le CRM ni dans la fiche du client, le demander : sans objectif, le
  scénario n'a pas de sens.

## Entrées

- `affaires` : une ou plusieurs affaires par nom ou identifiant.
- `scenario` : glisse à la période suivante (par défaut), signée à un montant réduit (montant donné), perdue.
- `perimetre` : un commercial, une équipe ou l'entreprise ; un périmètre vide n'est jamais élargi en silence.

## Étapes

1. **Poser la situation de départ** : signé ; total engagé (signé plus engagé ouvert) ; total probable ; pipeline
   ouvert ; écart restant à l'objectif ; couverture (pipeline ouvert divisé par l'écart restant).
2. **Appliquer le scénario** : glissement (retirée de la période, notée pour la suivante) ; montant réduit (montant
   remplacé) ; perte (retirée). Recalculer total engagé, écart et couverture.
3. **Chercher les remplacements** dans le pipeline existant : affaires probables avec une activité de moins de 14 jours
   et une date dans la période ; affaires à une étape de l'engagé dont les critères de sortie semblent atteignables à
   temps ; pistes déjà signalées par l'humain. Règle de réalisme par défaut, à ajuster au cycle de l'entreprise : plus
   d'une étape à franchir en moins de deux semaines n'est pas réaliste.
4. **Rendre le verdict** en une phrase : objectif tenu, à risque, ou hors d'atteinte sans nouvelles affaires.
5. **Proposer les actions de la semaine** : sauver l'affaire qui glisse (voir `blocages-affaire`) ou accélérer un
   remplacement, avec responsable proposé.
6. **Écrire l'effet sur la période suivante** : engagé de la période suivante avec l'affaire glissée, et risques en
   cascade (renouvellements qui s'empilent, capacité).

## Livrable

Tableau avant et après (signé, engagé, écart, couverture, différences) ; verdict ; liste des remplacements (compte,
montant, catégorie, pourquoi plausible, ce qui doit se passer, pour quand, total réaliste comparé à l'écart) ; actions
de la semaine ; note sur la période suivante.

## Critères de réussite

- Chaque chiffre se recalcule à partir des affaires listées ; aucune probabilité inventée.
- Le scénario est présenté comme une hypothèse, jamais comme la prévision.
- Les remplacements respectent la règle de réalisme écrite.
- Aucune affaire modifiée : un changement de date ou de catégorie qui en découle est proposé via `mise-a-jour-crm`.

## Limites

- Le scénario vaut ce que vaut l'export : affaires sans date ni montant signalées en tête.
- La compétence ne remplace pas la prévision complète (`prevision-ventes`).
- Elle ne fixe ni remise ni condition pour sauver une affaire : ce sont des décisions humaines.

## Exemple

Cas nominal : trimestre, objectif 180 000 euros. Départ : signé 70 000, engagé 135 000, écart 45 000, pipeline ouvert
140 000, couverture 3,1. Scénario : l'affaire « parc de machines, 30 000 euros » glisse. Après : engagé 105 000, écart
75 000, couverture 1,5. Verdict : à risque. Remplacements réalistes : deux affaires probables actives cette semaine,
22 000 euros au total, insuffisants seuls. Action : rendez-vous avec le directeur financier de l'affaire qui glisse
avant vendredi.

Cas d'échec évité : une affaire de 40 000 euros au stade « découverte » était comptée comme remplacement à trois
semaines de la fin. La règle de réalisme l'exclut et le dit.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins,
`sales/skills/deal-slip-scenario/SKILL.md`, étapes 2 à 5 (situation de départ et couverture, trois scénarios,
remplacements actifs depuis moins de 14 jours, règle de réalisme, verdict en une phrase, effet sur la période
suivante, lecture seule), commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications :
réécriture en français, catégories de `prevision-ventes`, objectif demandé s'il manque. Texte de la licence et liste
des reprises : `organisation/skills/LICENCES-TIERS.md`.

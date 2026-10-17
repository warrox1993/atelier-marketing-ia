---
name: "maitrise-documentaire"
description: "Organise la maîtrise des documents qualité d'une PME : numérotation (type, domaine, numéro, révision), cycle de vie (brouillon, en relecture, approuvé, en vigueur, remplacé, obsolète), relecteurs et approbateurs par type de document, traitement des commentaires, classes de modification, liste maîtresse, diffusion et retrait des versions obsolètes. À utiliser pour créer le système documentaire, enregistrer une nouvelle version, traiter une demande de modification ou contrôler que seules les versions en vigueur sont en circulation ; jamais pour approuver ou mettre en vigueur un document soi-même."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "qualite"
---

# Maîtrise documentaire

## Quand l'utiliser

- L'entreprise n'a pas de règle commune pour numéroter, versionner et diffuser ses procédures et formulaires.
- Une procédure révisée doit être mise en vigueur et l'ancienne retirée.
- Un audit ou un incident montre qu'une version périmée est encore utilisée.

## Objectif

Que chacun utilise au poste la bonne version d'un document, que chaque version soit identifiable et approuvée par un
humain, et que les versions remplacées soient retirées de l'usage sans être perdues.

## Prérequis

- La liste des documents existants (titre, propriétaire, version, date), même incomplète.
- Les fonctions habilitées à relire et à approuver chaque type de document, fixées par la direction.

## Entrées

- `documents` : liste maîtresse actuelle ou inventaire.
- `demande` : création, modification ou retrait, avec la justification.
- `diffusion` : où le document est utilisé (postes, intranet, classeurs).

## Étapes

1. **Numéroter** au format `TYPE-DOMAINE-NUMÉRO-RÉVISION`, par exemple `PRO-03-004-B` : type (MQ manuel, PRO
   procédure, MO mode opératoire, FOR formulaire, PLA plan), domaine (01 direction, 02 documents, 03 personnel, 04
   achats, 05 production ou service, 06 contrôle, 07 actions correctives), numéro d'ordre, révision. Les codes sont des
   valeurs par défaut que l'entreprise ajuste. Aucun doublon dans la liste maîtresse.
2. **Suivre le cycle de vie** : brouillon (pas d'usage), en relecture, approuvé (signatures obtenues), en vigueur
   (formation faite, diffusé), remplacé (retiré de l'usage), obsolète (archivé selon la durée de conservation).
3. **Fixer relecteurs et approbateurs** par type : procédure, propriétaire du processus et responsable qualité ; mode
   opératoire, responsable d'équipe et qualité ; formulaire, propriétaire du processus. L'approbation est toujours
   humaine, signée et datée (nom, fonction, date).
4. **Traiter les commentaires** de relecture, chacun avec une suite écrite : accepté, accepté modifié (raison), refusé
   (justification), reporté (raison).
5. **Classer la modification** : administrative (forme, sans effet sur le contenu), mineure (précision), majeure
   (nouvelle exigence, nouvelle étape), urgente (sécurité ou conformité : circuit accéléré, relecture complète après
   coup). Évaluer l'effet : formation à refaire, autres documents à mettre à jour, enregistrements à changer.
6. **Mettre en vigueur** après approbation : date d'effet, diffusion aux postes, formation si la modification l'exige,
   mise à jour de la liste maîtresse.
7. **Retirer les versions remplacées** de tous les lieux de diffusion, en garder une copie marquée « remplacée » ;
   contrôler par échantillon que les postes n'ont que la version en vigueur.

## Livrable

La liste maîtresse (numéro, titre, révision, état, propriétaire, approbateur, date d'effet, lieux de diffusion), la
fiche de modification (demande, classe, effets, commentaires et suites) et la liste des retraits à faire, avec les
cartes d'approbation pour l'humain.

## Critères de réussite

- Chaque document a un numéro unique et une révision.
- Aucun document n'est marqué « approuvé » ou « en vigueur » sans signature humaine datée.
- Chaque commentaire de relecture a une suite écrite.
- Chaque version remplacée a un lieu de retrait contrôlé.

## Limites

- Les exigences américaines de signature électronique (21 CFR Part 11) ne sont pas couvertes.
- Pour un client certifié, les exigences de la norme sur les informations documentées sont à relire dans la norme
  achetée par l'entreprise ; leur texte n'est pas reproduit ici.

## Exemple

Cas nominal : la procédure de déclaration de sinistre `PRO-05-002-A` est révisée (nouvelle pièce obligatoire). Classe :
majeure. Effets : formation des gestionnaires, formulaire `FOR-05-007` à mettre à jour. Commentaires : trois acceptés,
un refusé (justifié). Après approbation du responsable sinistres et du responsable qualité, `PRO-05-002-B` entre en
vigueur le 01/03 ; la version A est retirée de l'intranet et des classeurs de l'étage, une copie marquée « remplacée »
est archivée.

Cas d'échec évité : la demande dit « mets-la en vigueur, le chef est d'accord ». Sans signature, l'état reste
« approuvé : en attente » et une carte est préparée.

## Origine de la méthode

Numérotation, cycle de vie, relecteurs et approbateurs par type, suites des commentaires, classes de modification et
retrait des versions obsolètes adaptés et traduits de github.com/alirezarezvani/claude-skills,
`ra-qm-team/skills/quality-documentation-manager/SKILL.md`, sections « Document Control Workflow », « Document
Numbering System », « Approval and Review Process » et « Change Control Process », commit
19392f7a08264ed00486a251f5b2098321771f94, licence MIT, Copyright (c) 2025 Alireza Rezvani ; la partie 21 CFR Part 11
n'est pas reprise. Modifications : traduction, codes adaptés à une PME de services, approbation humaine. Texte des
licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.

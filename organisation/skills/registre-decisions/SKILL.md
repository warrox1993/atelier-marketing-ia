---
name: "registre-decisions"
description: "Tient le registre des décisions de la direction et des actions qui en découlent : format d'entrée fixe (décision, responsable, échéance, date de revue, raison, dérogation humaine, propositions rejetées à ne pas reproposer, actions, remplace et remplacée par) et détection de trois conflits (proposition déjà rejetée, décisions actives contradictoires, action attribuée deux fois). À utiliser pour inscrire une décision approuvée, une proposition, mettre à jour une action ou vérifier une nouvelle demande contre les décisions passées ; jamais pour inscrire comme prise une décision sans preuve d'approbation humaine."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "direction"
---

# Registre des décisions

## Quand l'utiliser

- Une décision vient d'être approuvée par l'humain (carte approuvée, procès-verbal signé).
- Un service propose une mesure qui pourrait déjà avoir été tranchée.
- La direction veut la liste des actions en retard ou des décisions à revoir.

## Objectif

Une mémoire fiable de ce qui a été décidé, par qui, pourquoi, et de ce qui a été écarté, pour qu'aucune proposition
rejetée ne revienne sans le dire et qu'aucune décision ne soit contredite en silence.

## Prérequis

- Le registre existant (document de la direction), même vide.
- Pour toute décision à l'état « prise » : la preuve d'approbation (identifiant de la carte approuvée ou référence du
  procès-verbal signé).

## Entrées

- `entree` : décision ou proposition à inscrire, ou action à mettre à jour.
- `preuve` : référence de l'approbation humaine, si la décision est prise.
- `registre` : état actuel.

## Étapes

1. **Classer l'entrée** : proposée, prise (preuve jointe), remplacée, abandonnée. Sans preuve, l'état reste « proposée ».
2. **Contrôler les conflits** avant d'écrire :
   - proposition déjà rejetée avec la mention « ne pas reproposer » : bloquer et écrire
     `BLOQUÉ : « <proposition> » rejetée le <date>. Raison : <raison>.` puis la formule de réouverture :
     « Pour la rouvrir, l'humain écrit : rouvrir <sujet> du <date>. » ;
   - deux décisions actives sur le même sujet avec des conclusions différentes ;
   - une même action attribuée à deux responsables différents.
   Pour les deux derniers cas, écrire `CONFLIT DE DÉCISION` avec les deux entrées et trois options : remplacer
   l'ancienne, fusionner, laisser l'humain trancher.
3. **Rédiger l'entrée** au format fixe :
   - date et intitulé ;
   - décision (une phrase) ; responsable (une personne ou une fonction) ; échéance ; date de revue ;
   - raison (une ou deux phrases) ;
   - dérogation humaine : ce que l'humain a changé à la recommandation et pourquoi, sinon vide ;
   - propositions rejetées, chacune avec sa raison et, si l'humain l'a dit, « ne pas reproposer » ;
   - actions : action, responsable, échéance, date de revue, état ;
   - remplace (date de la décision antérieure) et remplacée par (rempli plus tard) ;
   - preuve d'approbation.
4. **Ne jamais effacer** : une décision remplacée reste au registre avec le renvoi vers la nouvelle.
5. **Produire l'état périodique** : actions en retard, décisions dont la date de revue est passée, conflits ouverts.

## Livrable

L'entrée rédigée ou le message de blocage, le rapport de conflits et, à la demande, l'état des actions et des revues
daté du jour.

## Critères de réussite

- Aucune entrée à l'état « prise » sans preuve d'approbation.
- Une proposition rejetée est bloquée avec la date et la raison citées mot pour mot.
- Chaque action a un responsable, une échéance et une date de revue.
- Aucun conflit n'est résolu sans décision humaine écrite.

## Sources officielles

Consulté le 17/10/2026 :

- Code des sociétés et des associations (loi du 23 mars 2019), texte consolidé sur Justel,
  https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=2019032309&table_name=loi : art. 5:93 et
  7:141 (procès-verbaux d'assemblée générale signés par les membres du bureau), 5:94 et 7:141 § 2 (décisions de
  l'actionnaire unique consignées dans un registre tenu au siège), 7:95 (procès-verbal du conseil d'administration). Le
  registre des décisions de la direction est un outil interne : il renvoie aux procès-verbaux, il ne les remplace pas.

## À vérifier par un professionnel

- Si l'entreprise veut utiliser ce registre comme registre légal des décisions de l'actionnaire unique, la forme et la
  conservation sont à faire valider par un juriste ou le notaire de la société.

## Limites

- Le registre ne vaut que par la discipline de mise à jour : une décision prise hors atelier n'y figure pas tant que
  l'humain ne l'a pas transmise.
- La détection des conflits compare des sujets et des formulations : deux décisions écrites très différemment peuvent
  échapper au contrôle ; le doute est signalé.

## Exemple

Cas nominal : la carte « Choisir le nouveau fournisseur de téléphonie » est approuvée. Entrée : décision « fournisseur B
retenu », responsable « responsable administratif », échéance 30/11, revue 31/03, raison « coût total sur trois ans
inférieur et clause de sortie à trois mois », proposition rejetée « fournisseur A, engagement de cinq ans ».

Cas de blocage : le registre contient « 12/09/2026 : externaliser l'accueil téléphonique, rejeté, ne pas reproposer ». Un
service propose la même externalisation. Sortie : « BLOQUÉ : « externaliser l'accueil téléphonique » rejetée le
12/09/2026. Raison : <raison du registre>. » et la formule de réouverture ; rien n'est inscrit comme nouveau.

## Origine de la méthode

Format d'entrée et détection des conflits adaptés et traduits de github.com/alirezarezvani/claude-skills,
`c-level-advisor/skills/decision-logger/SKILL.md`, sections « Decision Entry Format » et « Conflict Detection », commit
19392f7a08264ed00486a251f5b2098321771f94, licence MIT, Copyright (c) 2025 Alireza Rezvani. Les scripts Python du dossier
ne sont pas repris. Modifications : traduction, preuve d'approbation obligatoire, aucune suppression, renvoi au Code des
sociétés et des associations. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.

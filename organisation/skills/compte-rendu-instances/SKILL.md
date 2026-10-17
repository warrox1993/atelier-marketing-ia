---
name: "compte-rendu-instances"
description: "Prépare l'ordre du jour, le calendrier de convocation et le projet de procès-verbal d'une instance de société belge (conseil d'administration, assemblée générale de SRL ou de SA, comité de direction) : délais du Code des sociétés et des associations, liste des présences, décisions et votes rapportés, actions avec responsable et échéance, trous marqués [à attribuer], signatures et conflits d'intérêts signalés. À utiliser avant ou après une réunion d'instance ; jamais pour approuver, signer, diffuser ou déposer un procès-verbal."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "direction"
---

# Ordres du jour et procès-verbaux des instances

## Quand l'utiliser

- Une assemblée générale, un conseil d'administration ou un comité de direction doit être convoqué.
- La réunion a eu lieu et il faut un projet de procès-verbal à partir des notes ou d'une transcription.
- La direction veut savoir quelles signatures et quels dépôts suivent une réunion.

## Objectif

Un ordre du jour convocable dans les délais et un projet de procès-verbal fidèle aux notes, où chaque décision, chaque
vote et chaque action est traçable, et où ce qui manque se voit au lieu d'être deviné.

## Prérequis

- La forme de la société (SRL, SA, autre) et les extraits utiles des statuts (délais, mode de convocation, bureau,
  quorum éventuel). Sans statuts, les délais sont donnés sous réserve.
- Les notes, la transcription ou l'enregistrement retranscrit de la réunion pour le procès-verbal.

## Entrées

- `instance` : conseil d'administration, assemblée générale ordinaire ou extraordinaire, comité de direction.
- `date` : date prévue ou date de la réunion.
- `points` : sujets à inscrire, avec les pièces prévues.
- `notes` : notes brutes ou transcription (pour le procès-verbal).

## Étapes

1. **Identifier le régime** : SRL (art. 5:83 et suivants), SA (art. 7:126 et suivants) ou instance interne sans règle
   légale (comité de direction). Pour une autre forme, s'arrêter et demander l'article applicable.
2. **Construire l'ordre du jour** : un point par sujet, formulé comme une question à trancher ou une information ;
   les points soumis à vote séparés des points d'information.
3. **Calculer le calendrier de convocation** : pour l'assemblée d'une SRL, convocation au moins quinze jours avant avec
   l'ordre du jour et les pièces (art. 5:83 et 5:84) ; pour une SA non cotée, annonce au moins quinze jours avant selon
   l'art. 7:127 et envoi des pièces avec la convocation (art. 7:132). Les statuts peuvent prévoir davantage : écrire « à
   vérifier selon les statuts ».
4. **Rédiger le projet de procès-verbal** à partir des notes : instance, date, lieu ou mode de participation, présences
   (liste des présences pour une assemblée, art. 5:90), bureau, ordre du jour, puis pour chaque point : résumé neutre,
   décision, vote tel qu'il figure dans les notes.
5. **Extraire les actions** : verbe, responsable (une personne ou une fonction, jamais « l'équipe »), échéance. Si le
   responsable ou l'échéance manque, écrire `[à attribuer]` ou `[échéance à fixer]`. Un vote, une majorité ou une présence
   absente des notes est `[à confirmer]`, jamais déduite.
6. **Signaler les points sensibles** : déclaration de conflit d'intérêts d'un administrateur (art. 5:76, 5:77, 7:96),
   décision qui modifie les statuts (acte notarié), décision à publier. Le signalement renvoie à un juriste.
7. **Lister l'après-réunion** : signatures requises (membres du bureau pour un procès-verbal d'assemblée, art. 5:93 et
   7:141 ; président pour le conseil d'administration, art. 7:95), dépôts éventuels (compétence `vie-societe`), inscription
   des décisions au registre (compétence `registre-decisions`), chacun en carte de décision.

## Livrable

Un ordre du jour avec calendrier de convocation, ou un projet de procès-verbal marqué « projet, non approuvé », suivi de
la liste des actions, des points ouverts, des signatures et des dépôts à décider.

## Critères de réussite

- Chaque délai cite son article ou est marqué « à vérifier ».
- Chaque action a un responsable et une échéance, ou un trou visible.
- Aucun vote ni aucune présence ne figure sans appui dans les notes.
- Le procès-verbal n'est jamais présenté comme approuvé ou signé.

## Sources officielles

Consulté le 17/10/2026 :

- Code des sociétés et des associations (loi du 23 mars 2019), texte consolidé sur Justel,
  https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=2019032309&table_name=loi : art. 5:83
  (SRL : l'organe d'administration convoque et fixe l'ordre du jour ; convocation au moins quinze jours avant
  l'assemblée), 5:84 (pièces fournies avec la convocation), 5:90 (liste des présences), 5:93 (procès-verbaux signés par
  les membres du bureau et les actionnaires qui le demandent), 7:126 et 7:127 (SA : convocation, annonce au moins
  quinze jours avant dans une société non cotée), 7:132 (pièces avec la convocation), 7:141 (procès-verbaux
  d'assemblée), 7:95 (procès-verbal du conseil signé par le président et les administrateurs qui le souhaitent), 5:76,
  5:77 et 7:96 (conflit d'intérêts d'un administrateur consigné au procès-verbal).

## À vérifier par un professionnel

- Délais et formes propres aux statuts, assemblée générale écrite, participation à distance, quorum et majorités
  spéciales : à faire confirmer par le juriste ou le notaire de la société.
- Toute modification des statuts passe par un acte notarié ; le procès-verbal préparé ici n'en tient pas lieu.

## Limites

- Les sociétés cotées, les ASBL et les coopératives agréées ont des règles propres non couvertes ici.
- Un procès-verbal ne vaut que ce que valent les notes : des notes lacunaires donnent un projet plein de trous, et
  c'est voulu.

## Exemple

Cas nominal : assemblée générale ordinaire d'une SRL prévue le 15/06. Calendrier : convocation au plus tard le 31/05
avec l'ordre du jour et les comptes annuels (art. 5:83 et 5:84), « à vérifier selon les statuts ». Projet de
procès-verbal : approbation des comptes (vote rapporté des notes), décharge des administrateurs (vote `[à confirmer]`,
absent des notes), action « déposer les comptes à la Banque nationale », responsable `[à attribuer]`, échéance
`[échéance à fixer]`.

Cas d'échec évité : la transcription dit « on dira que tout le monde était d'accord ». Le projet n'invente pas
d'unanimité : le vote est `[à confirmer]` et le point est signalé.

## Origine de la méthode

Méthode décisions, actions et points ouverts, et trous rendus visibles par `[à attribuer]`, reprises de
github.com/warrox1993/skills-claude-entreprise, `plugins/entreprise-direction/skills/compte-rendu-reunion/SKILL.md`,
commit 474785fbcba8429cb034ef35fca20bbfcfd68554, licence MIT, Copyright (c) 2026 Jean-Baptiste Dhondt (même auteur que
l'atelier). Couche belge ajoutée : Code des sociétés et des associations. Texte des licences et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.

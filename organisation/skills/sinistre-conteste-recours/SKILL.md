---
name: "sinistre-conteste-recours"
description: "Prépare le dossier d'un sinistre dont la décision de l'assureur est contestée (refus total ou partiel, réduction, chiffrage d'expertise, retard) ou qui ouvre un recours contre un tiers responsable : tableau de confrontation motifs de l'assureur, clause citée, faits et pièces, échéancier des délais à vérifier, projet de demande de réexamen et question à l'avocat. À utiliser quand un client conteste ce que l'assureur a décidé sur son sinistre, avant toute médiation ; jamais pour juger la couverture ni la responsabilité."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "sav"
---

# Sinistre contesté et recours

## Quand l'utiliser

- L'assureur a refusé, réduit ou tardé à payer, et le client ou le courtier conteste la décision.
- Le chiffrage d'un expert est contesté (montant, étendue des dégâts, vétusté appliquée).
- Un tiers paraît responsable du dommage et un recours contre lui est envisagé par le client ou l'assureur.
- Le dossier est déjà ouvert et suivi ; ce n'est ni une première déclaration ni une plainte contre le courtier.

## Objectif

Un dossier de contestation lisible en cinq minutes : ce que l'assureur a décidé et pourquoi, ce que la police et les faits
permettent de dire de chaque motif, ce qui manque, les dates à ne pas laisser passer et la suite proposée. La couverture,
la responsabilité et le montant dû restent tranchés par l'assureur, l'expert, l'avocat ou le tribunal.

## Prérequis

- La décision de l'assureur par écrit (lettre, courriel, rapport d'expertise) avec sa date de réception.
- La police et ses conditions applicables à la date du sinistre.
- Le dossier du sinistre ouvert (déclaration, pièces, échanges), fourni par la tâche.

## Entrées

- `decision` : texte de la décision et motifs invoqués, avec l'article de la police cité s'il y en a un.
- `police` : extraits des garanties, exclusions, franchises et clauses d'expertise.
- `faits` : chronologie datée du sinistre, de la déclaration et des échanges.
- `pieces` : liste des pièces reçues, avec date et origine.
- `souhait` : ce que le client demande (réexamen, nouvelle expertise, paiement, recours contre un tiers).

## Étapes

1. **Qualifier la contestation** : refus total, refus partiel, réduction, retard, chiffrage d'expertise ou recours contre
   un tiers. Plusieurs qualifications peuvent coexister ; une ligne de dossier par motif.
2. **Vérifier la motivation** : sans motifs écrits, la première action est de demander à l'assureur ses motifs et la
   clause invoquée, par un projet de message en brouillon ; ne rien contester sur des motifs devinés.
3. **Établir la chronologie** : date du sinistre, de l'avis à l'assureur, de chaque réponse, de la décision contestée.
   Une date inconnue est écrite « information manquante » avec la question à poser.
4. **Tableau de confrontation**, une ligne par motif : motif de l'assureur ; clause citée (copiée, pas paraphrasée) ; faits
   et pièces qui s'y rapportent ; position du client ; pièce qui manque ; solidité : « étayé par une pièce »,
   « déclaré par le client seulement » ou « non étayé ». Aucune ligne ne conclut que le sinistre est couvert.
5. **Poser l'échéancier des délais** : prescription des actions dérivant du contrat (art. 88 de la loi du 4/04/2014, trois
   ans, à vérifier), délai de réponse prévu par la police, délais d'un éventuel recours contre un tiers. Chaque délai porte
   sa source ou « à vérifier » ; la date de départ est discutée par l'avocat, pas fixée par la compétence.
6. **Expertise** : lister ce que la police prévoit (expert de l'assureur, expertise contradictoire, tiers expert, frais) ;
   demander le rapport complet ; proposer, sans le décider, une contre-expertise avec son coût estimé sourcé. La
   désignation d'un expert est une décision humaine.
7. **Recours contre un tiers** : identifier le tiers et son assureur, les preuves de sa responsabilité (constat,
   témoins, photos), et se demander si l'assureur du client a déjà indemnisé et agit par subrogation (à vérifier). Ne
   jamais proposer au client de transiger ou de renoncer à un recours avant l'avis de l'assureur et de l'avocat.
8. **Rédiger le projet de demande de réexamen** : faits datés, motifs repris un à un, pièces jointes listées, demande
   précise, ton factuel, sans menace ni qualification juridique. Brouillon pour validation humaine.
9. **Choisir la suite et la proposer en carte** : réexamen par l'assureur ; avis d'un avocat ou du juridique de
   l'entreprise (demande par le bureau de liaison, avec les extraits nécessaires seulement) ; plainte formelle puis
   Ombudsman des assurances (dossier préparé par l'agent des réclamations, avec la compétence `dossier-mediation`).

## Livrable

Dossier de contestation : fiche de qualification, chronologie datée, tableau de confrontation, échéancier des délais avec
statut de vérification, état de l'expertise, volet recours tiers s'il y a lieu, projet de demande de réexamen, questions
pour l'avocat, cartes de décision proposées, liste des informations manquantes.

## Critères de réussite

- Chaque motif de l'assureur a sa ligne, sa clause copiée et sa solidité.
- Aucune phrase ne tranche la couverture, la responsabilité ou un montant.
- Chaque délai porte sa source ou « à vérifier », et aucune date d'échéance n'est inventée.
- Les pièces sont listées avec leur origine et leur date ; une pièce absente est signalée comme telle.
- Aucune donnée de santé ou donnée sensible au-delà de l'extrait nécessaire.

## Sources officielles

Reprises des compétences `gestion-dossier-sinistre` et `dossier-mediation` du dépôt (pages consultées par elles les 16 et
17/10/2026), non relues le 18/10/2026 :

- Loi du 4 avril 2014 relative aux assurances, Justel, https://www.ejustice.just.fgov.be/eli/loi/2014/04/04/2014011239/justel :
  art. 88 (prescription de trois ans des actions dérivant du contrat), art. 322 (service ombudsman) et § 2/2 (suspension
  de la prescription de l'art. 88 dès réception d'une demande complète par l'Ombudsman).
- Ombudsman des Assurances, « Introduire une plainte », https://www.ombudsman-insurance.be/introduire-une-plainte/ : le
  client interroge d'abord l'entreprise d'assurances ou l'intermédiaire, par écrit.

## À vérifier par un professionnel

- Le point de départ et la durée exacts de tout délai de prescription, la validité d'une clause d'exclusion et la
  responsabilité du tiers : avocat.
- La subrogation de l'assureur et ses effets sur le droit propre du client (franchise, dommage non indemnisé) : avocat
  ou juridique, pas cette compétence (référence légale non relue ce jour).
- Les règles de l'expertise contradictoire : texte de la police, puis l'assureur.

## Limites

- Elle ne juge ni la couverture, ni la responsabilité, ni la valeur d'un chiffrage d'expert.
- Elle ne couvre pas le dommage corporel grave ni la fraude suspectée : escalade immédiate à l'humain et au juridique.
- Sans la décision écrite de l'assureur, elle ne produit que la demande de motifs.

## Exemple

Un dégât des eaux est refusé pour « défaut d'entretien » par l'assureur, le 3 mars. Étape 2 : la lettre cite l'article 12
des conditions générales. Étape 4 : ligne unique, clause copiée ; faits : facture de plombier de l'année précédente
fournie par le client, rapport de l'expert qui ne mentionne pas l'entretien ; solidité « étayé par une pièce » pour la
facture, « non étayé » pour l'état de la canalisation. Étape 5 : prescription à vérifier par l'avocat, la dernière
réponse de l'assureur est datée. Étape 8 : projet de demande de réexamen avec la facture jointe. Étape 9 : carte
« demander un avis juridique avant d'écrire à l'assureur ».

Cas d'échec évité : le client demande « dites-leur qu'ils doivent payer, c'est couvert ». La compétence rédige la demande
de réexamen et d'explication, sans écrire que c'est couvert.

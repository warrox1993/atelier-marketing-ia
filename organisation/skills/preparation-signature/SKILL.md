---
name: "preparation-signature"
description: "Contrôle un document avant sa signature par une PME belge : version définitive sans modification ouverte, annexes jointes, dénomination exacte des entités et numéro d'entreprise, dates, pouvoirs des signataires au regard des statuts et des publications, approbations internes obtenues, relecture juridique faite, puis ordre et liste des signataires et destinataires de la copie signée. À utiliser avant toute signature d'un contrat, d'un avenant, d'une procuration ou d'un acte ; jamais pour signer, envoyer à la signature ni juger de la validité juridique du document."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "administratif"
---

# Préparation d'une signature

## Quand l'utiliser

- Un contrat négocié est prêt à être signé.
- Un document doit être signé par plusieurs personnes dans un ordre précis.
- On doute que la personne prévue ait le pouvoir d'engager la société.

## Objectif

Un dossier de signature où chaque point de contrôle est coché ou signalé, où les signataires et leur ordre sont fixés
et où l'humain sait exactement ce qui reste à faire avant de signer.

## Prérequis

- Le document dans sa version finale et ses annexes.
- Les statuts coordonnés et les dernières publications des nominations (pouvoirs de représentation).
- La liste des approbations internes requises (direction, juridique, finances).

## Entrées

- `document` : texte final et annexes.
- `parties` : dénominations et numéros d'entreprise annoncés.
- `signataires_prevus` : nom, fonction, entité.
- `approbations` : obtenues ou attendues.

## Étapes

1. **Version définitive** : aucune modification en suivi, aucun commentaire ouvert, aucun passage entre crochets.
2. **Annexes** : toutes celles citées dans le texte sont jointes et portent le bon intitulé.
3. **Entités** : dénomination exacte, forme légale et numéro d'entreprise de chaque partie, identiques dans l'en-tête et
   dans les blocs de signature. C'est l'erreur la plus fréquente.
4. **Dates** : correctes, ou laissées en blanc pour la date de signature.
5. **Pouvoirs** : chaque signataire de l'entreprise a le pouvoir de l'engager selon les statuts et les nominations
   publiées, ou une procuration écrite ; un doute devient une question au juriste. Pour la contrepartie, demander la
   preuve du pouvoir si l'enjeu le justifie.
6. **Approbations internes** obtenues et relecture juridique faite quand elle est requise.
7. **Configuration de la signature** : signataires (nom, fonction), ordre (successif ou simultané), approbation interne
   avant la signature de la contrepartie, destinataires de la copie signée.
8. **Après signature** (préparé, pas fait) : classement immédiat de l'exemplaire signé (compétence
   `classement-archivage`) et inscription des échéances (compétence `agenda-echeances-legales`).

## Livrable

Le dossier de signature : liste de contrôle (conforme ou problème relevé), configuration des signataires, questions
ouvertes, étapes après signature et carte de décision « signer ».

## Critères de réussite

- Chaque point de contrôle des étapes 1 à 7 est renseigné.
- Les dénominations et numéros d'entreprise sont identiques partout.
- Aucun envoi à la signature ni aucune signature n'est présenté comme fait.

## À vérifier par un professionnel

- Le pouvoir de représentation en cas de doute (clause statutaire, représentation conjointe) : juriste.
- La forme de signature requise (manuscrite, électronique qualifiée) pour un acte particulier : juriste.

## Limites

- La compétence ne lit pas le fond du contrat (voir `revue-contrat-commercial`) et n'envoie rien à un service de
  signature électronique : l'envoi reste humain.

## Exemple

Contrat de maintenance avec un prestataire. Contrôle : annexe 2 « tarifs » citée mais absente ; la dénomination du
prestataire dans le bloc de signature (« Tech Services ») diffère de l'en-tête (« Tech Services SRL ») ; la gérante a le
pouvoir de signer seule selon les statuts. Configuration : approbation du responsable financier, puis signature de la
gérante, puis du prestataire ; copie signée au service achats. Carte : « signer après ajout de l'annexe 2 et correction
de la dénomination ».

Cas d'échec : l'agent coche « pouvoirs » parce que la personne a le titre de directeur. Un titre interne ne donne pas le
pouvoir de représenter la société : il faut les statuts, une nomination publiée ou une procuration.

## Origine de la méthode

Liste de contrôle avant signature et configuration des signataires adaptées de
github.com/anthropics/knowledge-work-plugins, `legal/skills/signature-request/SKILL.md` (étapes 2 et 3, « Tips »),
commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Non repris : l'étape 4 (envoi par un service de
signature). Modifications : français, pouvoirs vérifiés au regard du droit belge des sociétés. Liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.

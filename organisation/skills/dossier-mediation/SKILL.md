---
name: "dossier-mediation"
description: "Prépare le dossier d'une plainte portée ou annoncée devant un service de médiation (Ombudsman des assurances, Service de médiation pour le consommateur) : chronologie datée, pièces, ce qui a été tenté, ce que demande le client, position de l'entreprise à valider, effets de la saisine (prescription et recouvrement suspendus) et réponse aux demandes d'information du médiateur. À utiliser dès qu'un client annonce une médiation ou que le médiateur écrit ; jamais pour prendre position sur le bien-fondé d'un refus de l'assureur, saisir ou répondre au médiateur sans validation."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "sav-sinistres"
---

# Dossier de médiation

## Quand l'utiliser

- Un client conteste une réponse définitive et annonce saisir l'Ombudsman des assurances ou le Service de médiation pour
  le consommateur.
- Le service de médiation informe l'entreprise qu'une demande complète a été reçue, ou lui demande des informations.
- La direction veut évaluer un dossier avant une médiation.

## Objectif

Un dossier complet, daté et sourcé, qui permet à l'humain de répondre au médiateur à temps et en connaissance de cause,
et qui déclenche les effets de la saisine (suspension de relances) sans qu'aucune position ne soit prise à sa place.

## Prérequis

- Le dossier de plainte (registre, échanges, réponse définitive) et le dossier sinistre ou contrat concerné.
- La lettre ou le message du client ou du médiateur.
- Pour un intermédiaire : la répartition entre ce qui relève de son propre service et ce qui relève de l'assureur.

## Entrées

- `plainte` : identifiant au registre, dates, motif, réponse définitive.
- `pieces` : contrat, conditions, déclaration, correspondances, décisions de l'assureur.
- `mediateur` : courrier reçu, s'il existe (date de réception, demande).

## Étapes

1. **Identifier le service compétent** : Ombudsman des assurances pour un litige avec une entreprise d'assurances ou un
   intermédiaire d'assurance ; Service de médiation pour le consommateur pour les autres litiges de consommation, hors
   secteurs couverts par un service sectoriel. En cas de doute, l'humain tranche.
2. **Établir la chronologie** : contrat, sinistre ou fait générateur, première plainte, accusé, réponses, relances,
   réponse définitive, annonce ou saisine de la médiation. Chaque date porte sa pièce.
3. **Rédiger la fiche du dossier** (format d'escalade traduit) : impact (client, montant en jeu, ancienneté du litige,
   risque de réputation) ; description en 3 à 5 phrases ; ce qui a été tenté (réponses, gestes déjà accordés) ; ce que
   le client demande exactement ; ce que l'humain doit décider (position, réponse au médiateur) et l'échéance.
4. **Séparer les responsabilités** pour un intermédiaire : son propre service (information, conseil, transmission,
   suivi) et la décision de l'assureur (couverture, indemnisation). L'agent ne prend aucune position sur le bien-fondé
   d'un refus de l'assureur : il liste ce que l'assureur a écrit et la demande à lui adresser.
5. **Signaler les effets de la saisine.** Dès que l'Ombudsman a reçu une demande complète, les délais de prescription
   sont suspendus, et dès que l'entreprise ou l'intermédiaire en est informé, la procédure de recouvrement qu'il a
   introduite est suspendue (loi du 4 avril 2014, art. 322). Le coordinateur prévient le recouvrement par la liaison :
   aucune relance sur ce client tant que la suspension court.
6. **Préparer la réponse aux demandes d'information du médiateur** (obligation de donner suite) : brouillon factuel,
   pièces numérotées, sans argument non sourcé.
7. **Demander les avis nécessaires** par le coordinateur : juridique pour la position, assureur pour sa décision.
8. **Poser la carte de décision** : saisine, réponse ou proposition au médiateur relèvent de l'humain.

## Livrable

Dossier de médiation : service compétent, chronologie datée avec pièces, fiche du dossier, répartition des
responsabilités, effets de la saisine et demande de suspension des relances, brouillon de réponse au médiateur, liste des
pièces numérotées, questions ouvertes, carte de décision.

## Critères de réussite

- Chaque date et chaque fait renvoie à une pièce.
- Aucune position sur le bien-fondé d'une décision de l'assureur.
- La suspension des relances est demandée dès que la saisine est connue.
- Aucun envoi au médiateur ni au client sans carte.

## Sources officielles

Consultées le 17/10/2026 :

- Loi du 4 avril 2014 relative aux assurances, art. 322 § 1er et § 2 (service ombudsman des assurances, plaintes visant
  les entreprises d'assurances et les intermédiaires), § 2/2 (suspension des délais de prescription de l'art. 88 dès
  réception d'une demande complète, jusqu'au refus de traitement ou au résultat ; suspension de la procédure de
  recouvrement introduite par l'entreprise ou l'intermédiaire informé), § 2/3 (obligation de donner suite aux demandes
  d'information du service), texte consolidé sur Justel, https://www.ejustice.just.fgov.be/eli/loi/2014/04/04/2014011239/justel.
- Ombudsman des Assurances, « Introduire une plainte », https://www.ombudsman-insurance.be/introduire-une-plainte/ :
  le client interroge d'abord l'entreprise d'assurances ou l'intermédiaire ; la plainte est écrite et reprend une brève
  description du problème, les coordonnées de l'entreprise ou de l'intermédiaire et la référence du dossier ; pas de
  plainte par téléphone.
- Service de médiation pour le consommateur, « FAQ », https://www.mediationconsommateur.be/fr/faq : un dossier n'est ouvert
  que si le consommateur prouve avoir d'abord tenté de trouver une solution avec l'entreprise.

## À vérifier par un professionnel

- La position de l'entreprise dans la médiation, toute proposition de règlement et toute reconnaissance de faute sont
  décidées par la direction après avis juridique.
- Le point de départ exact de la suspension pour un intermédiaire (date à laquelle il est « informé ») et ses effets sur
  une procédure en cours : à confirmer par un juriste.

## Limites

- La compétence ne saisit pas le médiateur et ne lui répond pas.
- Elle ne remplace pas l'avis de l'assureur sur sa propre décision.
- Elle ne couvre pas une procédure judiciaire déjà engagée : le dossier passe au juridique.

## Exemple

Cas nominal : un client conteste le refus d'indemnisation d'un dégât des eaux et annonce saisir l'Ombudsman. Dossier :
chronologie de 9 dates avec pièces, fiche (montant en jeu 3 200 euros selon la déclaration, litige de 4 mois), service de
l'intermédiaire distingué de la décision de l'assureur, aucune position sur le refus. Demande au juridique par la
liaison ; information du recouvrement préparée pour le jour où la saisine sera confirmée.

Cas d'échec évité : la note interne allait écrire « le refus de l'assureur est justifié, l'exclusion s'applique ».
L'agent retire la phrase : il cite la lettre de l'assureur et pose la question au juridique.

## Origine de la méthode

Fiche du dossier adaptée et traduite du format « ESCALATION brief » de github.com/anthropics/knowledge-work-plugins,
`customer-support/skills/customer-escalation/SKILL.md` (impact, description, ce qui a été tenté, ce qui est demandé),
commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : réécriture en français, cadre de la
médiation belge. Texte de la licence et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.

---
name: "reponse-droits-personnes"
description: "Traite une demande d'exercice de droits RGPD reçue par une PME belge (accès, rectification, effacement, limitation, portabilité, opposition) : qualification, vérification d'identité proportionnée, calcul du délai d'un mois et de sa prolongation possible, exceptions à documenter, journal de la demande et brouillon de réponse mentionnant le droit de plainte auprès de l'Autorité de protection des données. À utiliser dès qu'une personne demande ce que l'entreprise sait d'elle ou veut faire corriger ou effacer ses données ; jamais pour envoyer la réponse, refuser seul une demande ni effacer des données."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "juridique"
---

# Réponse à une demande d'exercice de droits

## Quand l'utiliser

- Un client, un ancien travailleur ou un prospect écrit « je veux savoir quelles données vous avez sur moi ».
- Une personne demande de corriger, d'effacer ou de ne plus utiliser ses données.
- Une demande arrive par un canal inhabituel (réseau social, courrier papier) et risque d'être oubliée.

## Objectif

Une demande enregistrée le jour de sa réception, qualifiée, avec un délai calculé, une identité vérifiée de façon
proportionnée, les exceptions éventuelles documentées et un brouillon de réponse complet, pour que l'humain réponde
dans le délai.

## Prérequis

- La demande telle que reçue, avec sa date de réception.
- Le registre des traitements (compétence `registre-traitements-rgpd`) pour savoir où chercher les données.
- Le nom de la personne qui valide et envoie la réponse.

## Entrées

- `demande` : texte et canal.
- `date_reception`.
- `traitements_concernes` : extraits du registre.
- `donnees_trouvees` : relevé fourni par les services détenteurs, par le bureau de liaison.

## Étapes

1. **Enregistrer la demande** : date de réception, type, canal, délai, personne chargée. Ce journal est conservé.
2. **Qualifier le ou les droits** : accès, rectification, effacement, limitation, portabilité, opposition, ou
   demande qui n'est pas un exercice de droit.
3. **Vérifier l'identité de façon proportionnée** : demander une information supplémentaire seulement en cas de doute
   raisonnable, sans exiger plus que nécessaire (pas de copie de carte d'identité systématique). Toute demande de
   précision est faite rapidement, car le délai court.
4. **Calculer le délai** : réponse dans un mois à compter de la réception ; prolongation possible de deux mois pour une
   demande complexe ou de nombreuses demandes, à condition d'informer la personne dans le premier mois, avec la raison.
5. **Rassembler les données** par le coordinateur et le bureau de liaison : chaque service détenteur fournit son
   relevé, y compris chez les sous-traitants.
6. **Examiner les exceptions** et documenter leur base : obligation légale de conservation (par exemple comptabilité),
   constatation ou défense d'un droit en justice, gel de données pour un litige, droits d'autrui qui seraient atteints.
7. **Rédiger le brouillon de réponse** : ce qui est fait ; pour une demande d'accès, les informations dues sur les
   traitements ; en cas de refus total ou partiel, les motifs ; dans tous les cas, la possibilité d'introduire une
   plainte auprès de l'Autorité de protection des données ou un recours en justice. La réponse est gratuite ; des
   frais ne sont possibles que pour une demande manifestement infondée ou excessive, décision humaine.
8. **Escalader d'office** au délégué à la protection des données ou au juriste quand : la demande concerne un mineur
   ou vient de lui ; elle émane d'une autorité et non d'une personne ; les données sont gelées pour un litige ; le
   demandeur est un travailleur ou ancien travailleur en conflit ; la demande est inhabituellement large ; des
   données de santé, biométriques ou génétiques sont en jeu.
9. **Préparer la carte de décision** : envoi, prolongation ou refus, à valider par l'humain désigné.

## Livrable

- La ligne de journal de la demande.
- Le calcul du délai avec la date limite et la date limite de prolongation.
- Le relevé des données par service et les exceptions documentées.
- Le brouillon de réponse et la carte de décision.

## Critères de réussite

- Le délai est calculé depuis la date de réception, jamais depuis la date de traitement.
- La vérification d'identité est proportionnée et justifiée.
- Toute exception a une base écrite ; tout refus mentionne les motifs et le droit de plainte.
- Rien n'est envoyé ni effacé par la compétence.

## Sources officielles

Consultée le 17/10/2026 :

- Autorité de protection des données, « Droits des citoyens »,
  https://www.autoriteprotectiondonnees.be/professionnel/rgpd-/droits-des-citoyens : réponse dans un délai d'un mois,
  prolongeable de deux mois pour une demande complexe si la personne en est informée dans le premier mois ; en cas
  d'inaction, informer la personne des motifs dans le mois et de la possibilité d'introduire une plainte auprès de
  l'APD ou d'un recours en justice ; gratuité, sauf demande manifestement infondée ou excessive.

Le texte du RGPD sur EUR-Lex (articles 12 et 15 à 22) n'a pas pu être ouvert ce jour (page protégée contre les
robots) : les références d'articles restent « à vérifier ».

## À vérifier par un professionnel

- Toute exception invoquée pour refuser ou limiter une réponse, et toute demande liée à un litige ou à un travailleur :
  délégué à la protection des données ou avocat.
- Les références d'articles du RGPD citées dans la réponse.

## Limites

- La compétence ne cherche pas elle-même dans les systèmes des autres services ; elle dépend des relevés transmis.
- Elle n'efface rien : l'effacement est exécuté par le service détenteur après décision humaine.

## Exemple

Courriel reçu le 6 octobre 2026 : « Je veux une copie de mes données et que vous arrêtiez de m'envoyer des offres. »
Qualification : accès et opposition à la prospection. Délai : 6 novembre 2026 (prolongation possible jusqu'au
6 janvier 2027 si la personne est informée avant le 6 novembre). Identité : l'adresse correspond au fichier client, pas
de pièce supplémentaire. Brouillon : relevé des données du commercial et du service client, arrêt de la prospection,
mention du droit de plainte auprès de l'APD.

Cas d'échec : la demande arrivée par message sur un réseau social n'est enregistrée que dix jours plus tard. Le délai
court depuis la réception : l'agent l'écrit et alerte le coordinateur.

## Origine de la méthode

Méthode adaptée de github.com/anthropics/knowledge-work-plugins, `legal/skills/compliance-check/SKILL.md` (« Data Subject
Request Handling » : réception, identité, journal, exceptions, réponse) et `legal/skills/legal-response/SKILL.md`
(déclencheurs d'escalade des demandes de personnes), commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0.
Non repris : passages sur le droit californien. Modifications : français, délais vérifiés sur la page de l'APD. Liste
des reprises : `organisation/skills/LICENCES-TIERS.md`.

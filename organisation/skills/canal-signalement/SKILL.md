---
name: "canal-signalement"
description: "Aide une entreprise belge du secteur privé à mettre en place et à suivre son canal de signalement interne (loi du 28 novembre 2022, lanceurs d'alerte) : champ d'application (50 travailleurs et plus, ou secteur financier), procédure écrite, gestionnaire indépendant, accusé de réception en 7 jours, retour en 3 mois, registre anonymisé, interdiction des représailles et information sur les canaux externes. À utiliser pour rédiger ou relire la procédure, suivre les délais d'un signalement ou tenir le registre ; jamais pour lire ou chercher l'identité de l'auteur, enquêter sur un signalement, ni décider d'une suite."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "conformite"
---

# Canal de signalement interne

Service sensible : la compétence ne lit jamais l'identité de l'auteur d'un signalement ni aucune information qui
permettrait de la déduire. Elle travaille sur la procédure, les délais et un registre anonymisé. Le traitement d'un
signalement (recevabilité, enquête, suite) appartient au gestionnaire de signalement désigné, humain et indépendant.

## Quand l'utiliser

- L'entreprise atteint 50 travailleurs, ou relève des services, produits et marchés financiers, et n'a pas de canal.
- La procédure existe mais ses délais ou son registre ne sont pas suivis.
- Le gestionnaire veut un tableau de suivi des délais sans données identifiantes.

## Objectif

Une procédure écrite conforme aux éléments lus dans la loi, un gestionnaire désigné sans conflit d'intérêts, et un suivi
où chaque signalement a un numéro, une date de réception, une date d'accusé de réception et une date limite de retour,
sans aucune donnée sur l'auteur.

## Prérequis

- L'effectif moyen de l'entreprise (calculé comme pour les élections sociales, par le secrétariat social) et son secteur.
- La personne ou le service envisagé comme gestionnaire, ou le prestataire externe.
- La preuve de la consultation des partenaires sociaux sur la procédure, ou la question ouverte si elle manque.

## Entrées

- `effectif_moyen`, `secteur`.
- `gestionnaire` : fonction (pas le nom si non nécessaire), interne ou externe.
- `suivi` : pour chaque signalement, numéro, date de réception, dates des étapes ; rien d'autre.

## Étapes

1. **Champ d'application** : obligation pour les entités du secteur privé de 50 travailleurs et plus ; sans seuil pour
   le secteur des services, produits et marchés financiers ; une entité de moins de 250 travailleurs peut partager des
   ressources pour la réception et les enquêtes. Les dates d'entrée en vigueur par taille sont « à vérifier ».
2. **Consultation des partenaires sociaux** avant l'établissement des canaux et procédures : vérifier qu'elle a eu lieu
   ou la poser comme question ouverte.
3. **Canaux** : sécurisés, garantissant la confidentialité de l'auteur et des tiers cités, inaccessibles au personnel non
   autorisé ; signalement écrit, oral ou les deux ; rencontre en personne possible sur demande dans un délai raisonnable.
4. **Gestionnaire** : désigné, indépendant et sans conflit d'intérêts ; interne ou prestataire externe ; l'entreprise
   reste responsable du traitement des données.
5. **Délais** : accusé de réception dans les 7 jours de la réception ; retour d'informations dans un délai raisonnable
   n'excédant pas 3 mois à compter de l'accusé de réception (ou de l'expiration des 7 jours si aucun accusé n'a été
   envoyé) ; suivi diligent, y compris des signalements anonymes.
6. **Information** : informations claires et accessibles sur les canaux de signalement externe (coordinateur fédéral,
   autorités compétentes).
7. **Registre** : un registre de tous les signalements reçus, dans le respect de la confidentialité ; durée de
   conservation liée à la relation contractuelle prévue par la loi, à confirmer par le juriste. La compétence propose un
   registre à colonnes non identifiantes : numéro, date de réception, domaine général, dates d'accusé, de retour et de
   clôture, statut.
8. **Représailles** : rappeler l'interdiction de toute forme de représailles (licenciement, rétrogradation, changement
   d'horaire, évaluation négative, mesure disciplinaire, intimidation, etc.) et signaler au juriste toute mesure
   envisagée envers une personne protégée.
9. **Alertes de délai** : pour chaque signalement en cours, calculer les deux dates limites et prévenir le
   gestionnaire avant leur échéance.

## Livrable

- La procédure de signalement interne en brouillon, avec les éléments ci-dessus et les questions ouvertes.
- Le modèle de registre non identifiant.
- Le tableau des délais des signalements en cours, sans donnée sur l'auteur ni sur les personnes visées.

## Critères de réussite

- Chaque élément de la procédure renvoie à l'article lu de la loi.
- Aucune donnée permettant d'identifier l'auteur ou une personne visée n'apparaît dans un livrable.
- Les deux dates limites de chaque signalement en cours sont calculées.

## Sources officielles

Consultée le 17/10/2026 :

- Loi du 28 novembre 2022 sur la protection des personnes qui signalent des violations au droit de l'Union ou au droit
  national constatées au sein d'une entité juridique du secteur privé, Moniteur belge du 15 décembre 2022, numac
  2022042980, https://www.ejustice.just.fgov.be/cgi/article_body.pl?language=fr&caller=summary&pub_date=22-12-15&numac=2022042980 :
  art. 11 (obligation, seuil de 50 travailleurs, secteur financier, consultation des partenaires sociaux,
  indépendance, partage de ressources sous 250 travailleurs), art. 12 (canaux, 7 jours, gestionnaire, suivi des
  signalements anonymes, 3 mois, information sur les canaux externes), art. 20 (confidentialité de l'identité), art. 22
  (registre et conservation), art. 23 (représailles interdites).
- Médiateur fédéral, notice explicative des procédures de signalement (secteur privé), décembre 2023 : canal externe
  et protection contre les représailles.

Le texte lu est celui publié au Moniteur ; d'éventuelles modifications ultérieures n'ont pas été vérifiées.

## À vérifier par un professionnel

- Dates d'entrée en vigueur selon la taille, calcul de l'effectif, durée exacte de conservation et conformité RGPD du
  registre : juriste ou délégué à la protection des données.
- Toute mesure envisagée envers une personne qui a signalé ou qui l'a aidée : avocat.

## Limites

- La compétence ne reçoit aucun signalement, n'enquête pas et ne qualifie pas les faits.
- Elle n'est pas le canal : elle n'en remplace ni la sécurité ni l'indépendance.

## Exemple

Entreprise de 63 travailleurs sans canal. Livrable : procédure en brouillon avec canal écrit et oral, gestionnaire
externe proposé (cabinet indépendant), question ouverte « consultation des partenaires sociaux faite ? », modèle de
registre. Signalement S-2026-03 reçu le 5 octobre : accusé de réception au plus tard le 12 octobre ; s'il est envoyé le
8 octobre, retour au plus tard le 8 janvier 2027.

Cas d'échec : le directeur demande « qui a fait le signalement S-2026-03 ? ». La compétence refuse, rappelle la
confidentialité de l'identité (art. 20) et l'interdiction des représailles (art. 23).

## Origine de la méthode

Aucun dépôt tiers ne propose de méthode utilisable pour le droit belge des lanceurs d'alerte (étude usine v2, groupe 1,
section 7.2) : la compétence est écrite à partir des sources officielles ci-dessus ; rien n'est repris.

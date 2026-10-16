---
name: "fin-contrat-travail"
description: "Prépare l'analyse d'une fin de contrat de travail pour une PME belge : calcul indicatif du préavis selon l'ancienneté, exigences de motivation (CCT n° 109), calendrier de la procédure, motif grave et ses délais stricts, documents de sortie (C4). À utiliser pour une note préparatoire destinée à un avocat en droit social ou au secrétariat social ; jamais pour décider, notifier ou recommander une rupture, ce qui reste une décision humaine."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "juridique-social"
---

# Fin de contrat de travail : analyse préparatoire

## Quand l'utiliser

- L'employeur envisage de licencier, ou un travailleur annonce sa démission, et il faut préparer le dossier.
- Un calcul de préavis doit être vérifié avant consultation d'un professionnel.
- Un fait grave est signalé et le temps presse : il faut dire quels délais courent.

## Objectif

Une note qui expose les options, les délais, les documents à prévoir et les risques, sans jamais décider. Chaque durée est tirée d'un barème daté ou marquée « à faire valider ». La décision de rompre appartient à l'humain, après avis d'un avocat en droit social ou du secrétariat social.

## Prérequis

- Les faits transmis par le service RH : date de début du contrat, type de contrat (durée indéterminée ou déterminée), ancienneté, qui met fin au contrat, date envisagée de la notification.
- Pour un motif grave : la date à laquelle l'employeur a eu connaissance du fait (information datée, jamais supposée).
- Les éventuelles protections particulières du travailleur (à signaler par le RH, la compétence ne les devine pas).

## Entrées

- `date_debut_contrat` et `date_notification_prevue`.
- `initiateur` : employeur ou travailleur.
- `faits` : description factuelle, sans qualification juridique.
- `motivation_deja_communiquee` : oui ou non, et à quelle date.

## Étapes

1. **Vérifier la nature de la fin de contrat** : licenciement avec préavis, avec indemnité de rupture, motif grave, démission, fin d'un contrat à durée déterminée. Si la qualification est incertaine, poser la question, ne pas trancher.
2. **Repérer les protections et exclusions** possibles (travailleur protégé, suspension du contrat) à faire confirmer par le RH ; si l'une apparaît, arrêter l'analyse de la procédure et escalader.
3. **Choisir le barème de préavis** selon la date de début du contrat (voir tableau) et mesurer l'ancienneté de date à date. La durée du préavis est un résultat indicatif à faire valider.
4. **Fixer le calendrier** : le préavis est notifié par écrit selon les formes de la loi (l'employeur par lettre recommandée ou exploit d'huissier, à vérifier) et prend cours le lundi qui suit la semaine de la notification (loi du 3 juillet 1978, art. 37/1). Calculer la date de fin indicative.
5. **Motivation (CCT n° 109)** : indiquer si le travailleur est dans le champ (secteur privé, ancienneté de six mois au moins, exclusions listées dans la source), les délais de demande des motifs et de réponse, et l'enjeu (indemnité en cas de non-respect, licenciement manifestement déraisonnable).
6. **Motif grave** : rappeler que la loi impose de ne pas attendre plus de trois jours ouvrables à partir de la connaissance du fait pour le congédiement, et de notifier les motifs dans les trois jours ouvrables suivant le congé (art. 35, à vérifier). Calculer ces dates à partir de la date de connaissance fournie, puis escalader aussitôt à l'humain : le temps court.
7. **Préparer les documents de sortie** : certificat de chômage C4, décompte final, compte individuel, fiche fiscale 281.10, attestation de vacances pour les employés, certificat de travail sur demande. Le service RH et le secrétariat social les établissent.
8. **Rédiger la note** : faits, qualification possible (marquée hypothèse), calcul, calendrier, risques, questions, et la carte de décision humaine.

### Barème indicatif du préavis de licenciement (contrat à durée indéterminée)

Valable pour les contrats débutés entre le 01/01/2014 et le 31/05/2026 (SPF Emploi, lu le 16/10/2026). Pour les contrats débutés à partir du 01/06/2026, le plafond est de 52 semaines dès 17 ans d'ancienneté ; à partir du 01/08/2026, les six premiers mois d'ancienneté donnent un préavis d'une semaine.

| Ancienneté | Semaines | Ancienneté | Semaines |
| --- | --- | --- | --- |
| moins de 3 mois | 1 | 5 ans à moins de 6 ans | 18 |
| 3 à moins de 4 mois | 3 | 6 ans à moins de 7 ans | 21 |
| 4 à moins de 5 mois | 4 | 7 ans à moins de 8 ans | 24 |
| 5 à moins de 6 mois | 5 | 8 ans à moins de 9 ans | 27 |
| 6 à moins de 9 mois | 6 | 9 ans à moins de 10 ans | 30 |
| 9 à moins de 12 mois | 7 | 10 ans à moins de 11 ans | 33 |
| 12 à moins de 15 mois | 8 | 11 ans à moins de 12 ans | 36 |
| 15 à moins de 18 mois | 9 | 12 ans à moins de 13 ans | 39 |
| 18 à moins de 21 mois | 10 | 13 ans à moins de 14 ans | 42 |
| 21 à moins de 24 mois | 11 | 14 ans à moins de 15 ans | 45 |
| 2 ans à moins de 3 ans | 12 | 15 ans à moins de 16 ans | 48 |
| 3 ans à moins de 4 ans | 13 | 16 ans à moins de 17 ans | 51 |
| 4 ans à moins de 5 ans | 15 | 17 ans à moins de 18 ans | 54 (52 si contrat débuté le 01/06/2026 ou après) |

Au-delà de 18 ans d'ancienneté, pour les contrats débutés avant le 01/06/2026, le barème continue de croître (65 semaines à 23 ans, puis au-delà, sans plafond affiché par la source) : lire ces lignes sur la page source et faire confirmer par le secrétariat social ou l'avocat. Pour la démission du travailleur, un barème distinct et plus court s'applique (maximum 13 semaines) : voir la page source.

## Livrable

- La note préparatoire : faits sourcés, barème retenu et durée indicative, dates (notification, début, fin), exigences de motivation, risques, documents de sortie à préparer, questions à l'avocat ou au secrétariat social.
- Un calendrier de délais, avec la mention de ceux qui sont stricts.
- La carte de décision humaine : validation par un professionnel, puis décision et notification par l'humain.

## Critères de réussite

- Chaque durée et chaque délai renvoient à une source datée ou à « à faire valider ».
- Le barème choisi est justifié par la date de début du contrat.
- Aucune phrase ne présente la rupture, le motif grave ou la sanction comme décidé ou recommandé.
- Pour un motif grave, les dates limites sont calculées et la note est escaladée le jour même.

## Sources officielles

Consultées le 16/10/2026 :

- « Fin du contrat à durée indéterminée : préavis, contrats à partir du 1er janvier 2014, licenciement », SPF Emploi, https://emploi.belgique.be/fr/themes/contrats-de-travail/fin-du-contrat-de-travail/fin-du-contrat-duree-indeterminee-11 : trois tableaux (contrats du 01/01/2014 au 31/05/2026, du 01/06/2026 au 31/07/2026, à partir du 01/08/2026), exemples de calcul. Les lignes au-delà de 24 ans d'ancienneté n'ont pas été reprises ici.
- « Fin du contrat à durée indéterminée : démission » (préavis du travailleur), SPF Emploi, https://emploi.belgique.be/fr/themes/contrats-de-travail/fin-du-contrat-de-travail/fin-du-contrat-duree-indeterminee-1 : barème de démission, maximum 13 semaines.
- « Motivation du licenciement, travailleurs du secteur privé » (CCT n° 109), SPF Emploi, https://emploi.belgique.be/fr/themes/contrats-de-travail/fin-du-contrat-de-travail/motivation-du-licenciement/motivation-du : demande des motifs par lettre recommandée dans les 2 mois de la fin du contrat (6 mois après la notification si préavis, mais au plus 2 mois après la fin), réponse de l'employeur dans les 2 mois, sanction de deux semaines de rémunération, licenciement manifestement déraisonnable de 3 à 17 semaines de rémunération, exclusions du champ.
- « Remise des documents sociaux », SPF Emploi, https://emploi.belgique.be/fr/themes/contrats-de-travail/fin-du-contrat-de-travail/remise-des-documents-sociaux : C4, décompte, compte individuel, fiche 281.10, attestation de vacances.
- Loi du 3 juillet 1978 relative aux contrats de travail, Justel, https://www.ejustice.just.fgov.be/cgi_loi/change_lg_2.pl?language=fr&nm=1978070303&la=F : art. 35 (motif grave, délais de trois jours ouvrables), art. 37 et 37/1 (notification, début du préavis le lundi suivant), art. 39 (indemnité de rupture égale à la rémunération du préavis). Lue par résumé automatique d'un texte très long : citations à confirmer au texte.

Le texte de la CCT n° 109 sur cnt-nar.be n'a pas été relu : la source ci-dessus est la page explicative du SPF Emploi (source secondaire par rapport à la convention).

## À vérifier par un professionnel

Tout calcul de préavis ou d'indemnité, la qualification d'un fait en motif grave, les protections particulières, la rédaction et l'envoi d'un courrier de rupture, et la réponse à une demande de motivation relèvent d'un avocat en droit social ou du secrétariat social. La décision de rompre est strictement humaine.

## Limites

- La compétence ne décide pas, ne rédige pas un courrier de rupture prêt à envoyer et ne chiffre aucune indemnité en euros.
- Le barème dépend de la date de début du contrat ; le régime a changé en 2026 et peut encore changer : toute durée est indicative.
- Les contrats à durée déterminée, les travailleurs protégés, les licenciements collectifs et les secteurs à régime propre ne sont pas couverts.
- Elle ne qualifie pas un fait de « motif grave » : elle liste ce qui devra être apprécié.

## Exemple

Entrée : contrat à durée indéterminée débuté le 15/03/2019, licenciement envisagé par l'employeur, notification prévue le mercredi 04/11/2026. Ancienneté à la notification : 7 ans et près de 8 mois, donc tranche « 7 à moins de 8 ans », soit 24 semaines (contrat débuté avant le 01/06/2026). Le préavis prend cours le lundi 09/11/2026. La note affiche « durée indicative 24 semaines, à faire valider », liste les documents de sortie, rappelle que le travailleur a six mois d'ancienneté ou plus et peut donc demander les motifs, et pose la question « le travailleur est-il protégé ? ».

Cas d'échec : le service RH signale qu'un fait grave est connu depuis quatre jours ouvrables. La note n'écrit pas « motif grave possible » : elle signale que le délai de trois jours ouvrables semble dépassé, que la qualification est à apprécier par l'avocat, et escalade immédiatement par une carte de décision. De même, si la date de début du contrat manque, aucun barème n'est appliqué : « information manquante, barème non déterminé ».

---
name: "registre-plaintes"
description: "Tient et analyse le registre des plaintes d'une entreprise belge, en particulier d'un intermédiaire d'assurance : champs obligatoires de chaque plainte, classement par cause, délais de traitement calculés, tendances, causes récurrentes appuyées par des extraits anonymisés et rapport périodique à la direction avec des mesures proposées. À utiliser pour la mise à jour du registre, le rapport mensuel ou trimestriel ou une revue des causes ; jamais pour décider d'une mesure correctrice, répondre à un client ni identifier inutilement un plaignant."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "sav-sinistres"
---

# Registre des plaintes

## Quand l'utiliser

- Une plainte arrive ou change d'état et le registre doit être mis à jour.
- Fin de mois ou de trimestre : rapport du registre à la direction.
- La direction veut savoir pourquoi les mêmes plaintes reviennent.

## Objectif

Un registre complet et exact, où chaque plainte a sa cause et son délai, et un rapport qui montre les causes récurrentes
avec des chiffres reproductibles, pour que la direction décide des corrections.

## Prérequis

- La liste des plaintes de la période (export du registre ou des dossiers), anonymisée ou pseudonymisée pour l'analyse.
- La liste des causes de l'entreprise ; à défaut, la liste de départ de l'étape 2, à valider par la direction.
- Les délais internes de traitement fixés par l'entreprise (procédure de traitement des plaintes).

## Entrées

- `plaintes` : identifiant, date de réception, canal, produit ou service, motif déclaré, état, date de réponse
  définitive, issue, saisine d'un médiateur (oui ou non).
- `periode` : dates de début et de fin.
- `causes` : liste fermée des causes.

## Étapes

1. **Contrôler chaque ligne** : identifiant, date de réception (celle du message), canal, produit ou service, motif dans
   les mots du plaignant (extrait court), cause, responsable, échéance, état, date et contenu résumé de la réponse
   définitive, issue (fondée, partiellement fondée, non fondée, sans suite), saisine d'un médiateur. Un champ vide est
   signalé, jamais comblé.
2. **Classer chaque plainte dans une seule cause** de la liste fermée. Liste de départ : information ou conseil, délai de
   traitement, qualité de l'accueil, erreur administrative ou de facturation, gestion d'un sinistre par l'entreprise,
   décision de l'assureur contestée, prime ou tarif, résiliation ou renouvellement, protection des données, autre. Pour
   un intermédiaire, la décision de l'assureur est une cause distincte de son propre service.
3. **Calculer les délais** : accusé de réception (réception à accusé) et réponse définitive (réception à réponse), en
   jours ouvrables, par plainte puis en moyenne et en médiane. La méthode de calcul est écrite pour être reproductible.
4. **Mesurer les tendances** : nombre de plaintes, part par cause, comparaison avec la période précédente, plaintes
   portées devant un médiateur, plaintes non clôturées au-delà du délai interne.
5. **Analyser les trois causes principales** : ce qui revient, avec 2 ou 3 extraits anonymisés par cause. Une hypothèse
   de cause racine est marquée « hypothèse ».
6. **Documenter ce qui a été appris** des plaintes closes (ce qui a résolu, ce qui a échoué), pour la base de
   connaissances et les procédures.
7. **Proposer des mesures** (une par cause principale) avec le service concerné ; aucune n'est décidée ici. Une plainte
   qui révèle un possible manquement réglementaire est signalée au coordinateur pour la conformité.

## Livrable

Registre mis à jour (tableau) ; liste des champs manquants ; rapport : totaux vérifiés, répartition par cause, délais
moyens et médians avec la méthode, tendances, trois causes principales avec extraits anonymisés, enseignements, mesures
proposées par service, plaintes à risque (médiation, délai dépassé).

## Critères de réussite

- Le total du rapport égale le nombre de lignes du registre de la période.
- Chaque plainte a une seule cause de la liste ; aucune case « divers » sans explication.
- Les délais sont recalculables à partir du registre.
- Aucun nom de plaignant ni donnée de santé dans le rapport.
- Aucune mesure présentée comme décidée.

## Sources officielles

Consultées le 17/10/2026 :

- Loi du 4 avril 2014 relative aux assurances, art. 265 (les intermédiaires d'assurance établissent des politiques et
  procédures internes pour que les réclamations soient examinées de manière experte et honnête et que le réclamant
  reçoive en tout cas une réponse), texte consolidé sur Justel,
  https://www.ejustice.just.fgov.be/eli/loi/2014/04/04/2014011239/justel.
- Même loi, art. 322 (service ombudsman des assurances, système extrajudiciaire de traitement des plaintes compétent pour
  les entreprises d'assurances et les intermédiaires), même source.
- Autorité de protection des données, « Recherche », https://www.autoriteprotectiondonnees.be/professionnel/themes/recherche :
  supprimer le nom ne suffit pas toujours à anonymiser ; les extraits du rapport sont choisis pour ne pas permettre de
  reconnaître le plaignant.

## À vérifier par un professionnel

- Les exigences précises de la FSMA sur l'enregistrement et le suivi des plaintes par un intermédiaire (contenu du
  registre, durée de conservation, rapport) : à vérifier sur le site de la FSMA (page non trouvée le 17/10/2026) et
  auprès du responsable de la conformité.
- La durée de conservation du registre et des dossiers de plainte : à fixer avec le délégué à la protection des données.

## Limites

- Le registre ne vaut que par ce qui y est saisi : une plainte orale non enregistrée n'apparaît pas ; le signaler.
- Le classement par cause est une appréciation : les cas limites sont listés.
- La compétence ne répond pas aux plaignants (compétence `traitement-reclamation`).

## Exemple

Cas nominal : 23 plaintes en septembre (CSV anonymisé). Total vérifié 23. Causes : délai de traitement 8, information ou
conseil 5, décision de l'assureur contestée 4, erreur administrative 3, autres 3. Délai moyen de réponse définitive 11,4
jours ouvrables (médiane 9), méthode jointe. Extrait P-0917 : « personne ne m'a dit que mon dossier était complet ».
Mesure proposée au SAV : accusé de complétude systématique (proposition).

Cas d'échec évité : deux plaintes n'ont pas de date de réponse. L'agent ne les compte pas comme closes à la date du jour :
il les liste « date de réponse manquante » et calcule les délais sur 21 plaintes, en le disant.

## Origine de la méthode

Méthode propre à l'atelier (champs, causes, délais, tendances), fondée sur la loi du 4 avril 2014. Règle « documenter ce
qui a été appris » reprise et traduite de github.com/anthropics/knowledge-work-plugins,
`customer-support/skills/customer-escalation/SKILL.md`, section « De-escalation », commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Texte de la licence et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.

---
name: "demande-de-changement"
description: "Rédige le dossier d'une demande de changement informatique (migration, mise à jour majeure, nouveau service, modification de configuration en production) : description, justification, analyse d'impact sur les utilisateurs, systèmes, processus et coûts, risques, plan de mise en œuvre, plan de communication, plan de retour arrière avec déclencheurs chiffrés, approbations. À utiliser avant tout changement qui touche la production ou les utilisateurs ; jamais pour exécuter le changement ni l'approuver à la place de l'humain."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "informatique"
---

# Demande de changement

## Quand l'utiliser

- Une migration est prévue (messagerie, stockage, logiciel métier, hébergement).
- Une mise à jour majeure, un nouveau service ou une modification de configuration touchera la production.
- Un prestataire propose une intervention et l'entreprise veut savoir ce qu'elle approuve.

## Objectif

Un dossier de changement complet en huit rubriques, où l'impact est chiffré (qui, combien, combien de temps), le
retour arrière est prêt avant le début avec un déclencheur mesurable, la communication est datée, et l'approbation
reste humaine.

## Prérequis

- La description du changement par le demandeur ou le prestataire.
- L'inventaire des systèmes concernés et leurs dépendances (compétence `documentation-technique`).
- Le nombre d'utilisateurs touchés par service, la fenêtre d'intervention possible et les périodes à éviter.
- L'état de la dernière sauvegarde et de son test de restauration.

## Entrées

- `changement` : quoi, pourquoi, quand, par qui.
- `systemes` : systèmes touchés et dépendances.
- `utilisateurs` : services et nombres touchés.
- `fenetre` : date, heure de début, heure limite de fin.
- `couts` : coûts prévus (licences, prestataire, heures internes).

## Étapes

1. **Description** : ce qui change, ce qui ne change pas, état avant et après.
2. **Justification** : raison métier (coût, conformité, fin de support, sécurité, efficacité), avec la source.
3. **Analyse d'impact**, chaque ligne notée élevé, moyen, faible ou nul avec détail chiffré :
   utilisateurs (« 100 boîtes de 6 services », pas « tout le monde »), systèmes, processus (ce qui change dans le
   travail des gens), coût.
4. **Risques** : tableau risque, probabilité, impact, mesure de réduction. Inclure au minimum : perte de données,
   indisponibilité au-delà de la fenêtre, incompatibilité d'un logiciel dépendant, accès perdu.
5. **Plan de mise en œuvre** : étapes, responsable, horaire, dépendances ; prérequis vérifiés avant de commencer
   (sauvegarde testée, accès, prestataire disponible) ; tests de vérification après chaque étape critique.
6. **Plan de communication** : public, message, canal, date et heure (annonce, rappel la veille, début, fin, incident
   éventuel). Les messages sont des brouillons.
7. **Plan de retour arrière**, prêt avant de commencer :
   - déclencheur chiffré, décidé d'avance (par exemple « plus de 5 % des boîtes inaccessibles à 6 h le lundi » ou
     « migration non terminée à l'heure limite ») ;
   - étapes pour revenir à l'état d'avant ;
   - vérification que le retour a réussi ;
   - heure limite au-delà de laquelle le retour n'est plus possible, si elle existe.
8. **Approbations** : approbateur, rôle, statut. Carte de décision pour l'approbation du changement.

## Livrable

Un dossier de changement en huit rubriques (description, justification, impact, risques, mise en œuvre,
communication, retour arrière, approbations), avec statut « brouillon, en attente d'approbation », et la carte de
décision.

## Critères de réussite

- Les huit rubriques sont présentes et remplies.
- L'impact sur les utilisateurs est chiffré.
- Le retour arrière a un déclencheur mesurable, des étapes et une vérification.
- Le plan de communication a des dates et des heures.
- Aucune étape exécutée par l'agent ; l'approbation est demandée par carte.

## Sources officielles

Aucun texte n'impose la forme d'un dossier de changement. Pour une entité concernée par la loi du 26 avril 2024
(NIS2), la gestion des changements fait partie des mesures de gestion des risques attendues ; le texte est sur Justel,
https://www.ejustice.just.fgov.be/cgi_loi/article.pl?language=fr&lg_txt=f&type=&sort=&numac_search=2024202344&cn_search=2024042637&caller=eli&&view_numac=2024042637n
(adresse déjà citée par la compétence `gestion-incident-informatique`) : article précis à vérifier. Les guides du
Centre pour la Cybersécurité Belgique (ccb.belgium.be, atwork.safeonweb.be) ont refusé l'accès automatique le
17/10/2026 (code 403) : non cités.

## À vérifier par un professionnel

La faisabilité technique, la durée réelle et les risques propres au système relèvent du responsable informatique ou du
prestataire ; l'approbation, de la direction. Les obligations NIS2 de l'entreprise se vérifient avec le juridique.

## Limites

- La compétence n'exécute aucune commande et ne touche à aucun système.
- Elle ne remplace pas la documentation du fournisseur pour les étapes techniques.
- Un changement urgent pour corriger un incident suit la compétence `gestion-incident-informatique`, avec dossier
  complété après coup.

## Exemple

Migration de 100 boîtes de messagerie vers un nouvel hébergement, samedi 07/11/2026 de 8 h à dimanche 18 h. Impact :
100 utilisateurs de 6 services, élevé ; coût : 3 200 euros de prestataire. Retour arrière : déclencheur « plus de
5 boîtes sur 100 inaccessibles ou non synchronisées le dimanche à 16 h » ; étapes : remettre les enregistrements DNS
de messagerie sur l'ancien hébergement, vérifier l'envoi et la réception sur trois boîtes tests. Communication : annonce
le 27/10, rappel le 06/11, message de fin le 08/11 à 18 h. Carte : approbation par la direction.

Cas d'échec : le plan de retour arrière dit « revenir en arrière si ça se passe mal ». Sans déclencheur mesurable,
personne ne sait quand décider : le dossier n'est pas complet.

## Origine de la méthode

Rubriques du dossier de changement adaptées et traduites de github.com/anthropics/knowledge-work-plugins,
`operations/skills/change-request/SKILL.md`, et déclencheurs chiffrés de retour arrière de
`engineering/skills/deploy-checklist/SKILL.md`, commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0.
Modifications : traduction, cadre d'une PME belge, validation humaine. Licence et reprises :
`organisation/skills/LICENCES-TIERS.md`.

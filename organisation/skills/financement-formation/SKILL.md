---
name: "financement-formation"
description: "Identifie les pistes de financement d'une formation en Belgique selon la Région du lieu de travail : congé-éducation payé en Wallonie, à Bruxelles et en Communauté germanophone, congé-formation flamand, chèques-formation, aides des fonds sectoriels. Donne les principes, l'éligibilité à vérifier et les démarches à préparer. À utiliser avant d'engager une dépense de formation ; jamais pour affirmer qu'une aide est acquise, déposer une demande ou déduire un montant non confirmé."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "formation"
---

# Financement d'une formation en Belgique

## Quand l'utiliser

- Une formation est envisagée et l'entreprise veut savoir ce qui peut en réduire le coût.
- Un travailleur demande du temps de formation et l'employeur doit savoir ce que le congé-éducation ou le congé-formation implique.
- Le plan de formation doit indiquer, ligne par ligne, une aide possible.

## Objectif

Pour chaque formation, un tableau des pistes possibles : nom du dispositif, autorité, conditions principales, démarches et délais, montant indicatif sourcé, statut « à vérifier ». Aucune aide n'est comptée comme acquise.

## Prérequis

- La Région du lieu de travail du travailleur (Wallonie, Bruxelles-Capitale, Flandre, Communauté germanophone) : elle détermine le dispositif.
- La taille de l'entreprise (effectif, chiffre d'affaires ou total du bilan) et sa commission paritaire.
- L'organisme de formation, sa reconnaissance ou son agrément, la durée et le prix donnés par l'organisme.

## Entrées

- `formation` : intitulé, organisme, durée en heures, prix annoncé, dates.
- `entreprise` : région, effectif, chiffre d'affaires ou bilan, commission paritaire.
- `participants` : nombre, régime de travail (temps plein ou partiel) et ancienneté, en agrégat.

## Étapes

1. **Situer la Région** du lieu de travail. Congé-éducation et congé-formation dépendent de la Région du siège d'exploitation, non du domicile du travailleur.
2. **Passer en revue les dispositifs** ci-dessous et noter, pour chacun, ce qui est probable, impossible ou inconnu.
3. **Vérifier la formation** : reconnue par l'autorité compétente (congé-éducation), organisme agréé (chèques-formation), durée minimale. Une condition non vérifiée est écrite « à vérifier auprès de l'autorité ».
4. **Noter les délais** de demande et de remboursement : ils se perdent facilement et sont décisifs.
5. **Indiquer le montant indicatif** avec sa source et son millésime ; sans source, « à demander ».
6. **Évaluer l'effet sur le budget** : le coût net est présenté sans l'aide (cas prudent) et avec l'aide (cas possible).
7. **Préparer la démarche** sans l'accomplir : liste des pièces et des responsables. Toute demande, tout dépôt, toute commande de chèques est une décision humaine.

### Les dispositifs (principes, repères du 16/10/2026)

| Dispositif | Autorité | Repères | À vérifier |
| --- | --- | --- | --- |
| Congé-éducation payé (Wallonie, Bruxelles-Capitale, Communauté germanophone) | Régions et Communauté germanophone | Droit des travailleurs du secteur privé à des heures d'absence avec maintien de la rémunération pour une formation reconnue. En Wallonie, l'employeur peut obtenir un remboursement forfaitaire de 21,30 euros par heure, plafond de rémunération de 3 714 euros bruts par mois pour l'année 2025-2026, formation d'au moins 32 heures, demande avant le 31 octobre de l'année scolaire, demande de remboursement au plus tard le 31 mars suivant. | Plafonds d'heures par type de formation, ancienneté, reconnaissance de la formation, valeurs des années suivantes. |
| Congé-formation flamand (Vlaams opleidingsverlof) | Région flamande | Remplace le congé-éducation payé depuis 2019 pour la Flandre. Plafond personnel de 125 heures par année scolaire à temps plein, proportionnel au taux d'occupation de mars, pouvant atteindre 250 heures si le travailleur suit une formation de sa propre initiative et une formation proposée par l'employeur. | Compensation de l'employeur (page de l'agence flamande non consultable le 16/10/2026), conditions du 4/5 et des 28 heures, formations reconnues. |
| Chèques-formation (Wallonie) | Forem (gestion confiée au Forem depuis janvier 2026) | Un chèque vaut 30 euros et couvre une heure de formation par travailleur. Réservé aux entreprises de 250 travailleurs au plus avec chiffre d'affaires d'au plus 50 millions d'euros ou total du bilan sous 43 millions, aux indépendants, pour des formations liées à l'activité auprès d'un opérateur agréé. | Part payée par l'entreprise, plafonds annuels, éligibilité exacte, versions langue et environnement. |
| Aides bruxelloises | Bruxelles Économie et Emploi, hub.brussels, Actiris | La Région propose un remboursement du congé-éducation et renvoie à une base de données des incitants à la formation ; les chèques-formation d'Actiris visent surtout les demandeurs d'emploi. | Montants et conditions : non détaillés sur la page consultée. |
| Fonds sectoriels | Commission paritaire du secteur | Les secteurs financent des formations par leurs fonds et leurs conventions collectives ; la page du SPF Emploi sur le droit individuel à la formation renvoie à ces fonds et conventions. | Existence, offre, conditions et cotisation : voir le site du fonds du secteur ; aucun chiffre vérifié ici. |

## Livrable

Un tableau par formation : dispositif, autorité, conditions principales, délai, montant indicatif et source, statut (probable, impossible, inconnu), pièces à réunir, responsable humain. Une ligne de budget en cas prudent et en cas possible. La liste des questions à poser à l'autorité ou au fonds.

## Critères de réussite

- Chaque dispositif retenu est relié à une autorité et à une source datée.
- Aucun montant d'aide n'est déduit du budget sans confirmation écrite de l'autorité.
- Les délais sont présents et chiffrés.
- Les cas non éligibles sont dits explicitement.
- Aucune demande n'est déposée et aucun chèque commandé sans décision humaine.

## Sources officielles

Consultées le 16/10/2026 :

- « Reconnaissance des formations dans le cadre du congé-éducation payé », SPF Emploi, https://emploi.belgique.be/fr/themes/formation/reconnaissance-des-formations-dans-le-cadre-du-conge-education-paye : compétence des Régions depuis le 1er juillet 2014, congé-formation flamand depuis 2019, reconnaissance des formations par les commissions paritaires, renvoi vers les autorités régionales.
- « Congé-éducation payé », Forem, https://www.leforem.be/entreprises/aides-financieres-conge-education-paye : forfait de 21,30 euros par heure, plafond de 3 714 euros bruts par mois en 2025-2026, durée minimale de 32 heures, demande avant le 31 octobre, remboursement à demander avant le 31 mars suivant.
- « Combien d'heures de congé-formation flamand un travailleur peut-il prendre ? », Vlaanderen.be, https://www.vlaanderen.be/als-werknemer-vlaams-opleidingsverlof-opnemen/duur-van-het-verlof : 125 heures par année scolaire au maximum, proportionnel à l'occupation en mars, 250 heures avec initiative commune.
- « Former ses travailleurs grâce aux chèques-formation », Wallonie.be, https://wallonie.be/fr/demarches/former-ses-travailleurs-grace-aux-cheques-formation : valeur de 30 euros par heure et par travailleur, conditions de taille, opérateurs agréés, gestion par le Forem.
- « Former le personnel », Région de Bruxelles-Capitale, https://be.brussels/fr/entreprendre-innover/entreprendre-bruxelles/employer-du-personnel/former-le-personnel : congé-éducation et renvoi vers les autorités bruxelloises pour les incitants.
- « Droit individuel à la formation », SPF Emploi, https://emploi.belgique.be/fr/themes/formation/droit-individuel-la-formation : rôle des secteurs et des fonds de formation.

Non consultables ou non lisibles le 16/10/2026 : la page de la compensation employeur du congé-formation flamand (agence flamande, accès refusé), le vade-mecum 2026 du Forem (plafonds d'heures illisibles dans l'extraction), le texte des conventions sectorielles (PDF illisibles). Le montant de la part payée par l'entreprise pour un chèque-formation wallon et les plafonds d'heures du congé-éducation ne sont donc pas repris comme faits vérifiés. Les montants valent pour l'année indiquée et changent.

## À vérifier par un professionnel

Toute demande de remboursement, de chèques ou de compensation, et tout calcul du coût salarial pendant le congé, sont à valider par le secrétariat social ou le comptable de l'entreprise avant dépôt. Les règles fiscales sur la déductibilité d'une dépense de formation relèvent du comptable.

## Limites

- Les montants et plafonds sont ceux de l'année indiquée ; ils sont révisés chaque année.
- Une entreprise active dans plusieurs Régions applique le dispositif de la Région de chaque lieu de travail.
- Un fonds sectoriel n'est pas décrit ici faute de page officielle lisible : la compétence renvoie à la commission paritaire du secteur.
- Elle n'accorde rien, ne dépose rien et n'engage aucune dépense.

## Exemple

Entreprise de 22 travailleurs en Wallonie, formation de 40 heures auprès d'un opérateur agréé pour 3 000 euros hors TVA (prix de l'organisme, devis joint). Pistes : chèques-formation (entreprise sous le seuil de 250 travailleurs, formation liée à l'activité : probable, à confirmer auprès du Forem) ; congé-éducation payé si la formation est reconnue et si un travailleur la suit : à vérifier (reconnaissance, plafonds d'heures). Coût net prudent : 3 000 euros ; coût net possible : « à calculer après confirmation du Forem ». Délais notés : demande avant le 31 octobre pour le congé-éducation. Carte posée : « Commander des chèques-formation » (décision humaine).

Cas d'échec : le travailleur est domicilié en Flandre mais travaille en Wallonie. La Région du lieu de travail est la Wallonie ; le congé-formation flamand ne s'applique pas. Si le devis ne dit pas si l'organisme est agréé, aucun chèque n'est compté : la fiche écrit « agrément non vérifié » et pose la question à l'organisme.

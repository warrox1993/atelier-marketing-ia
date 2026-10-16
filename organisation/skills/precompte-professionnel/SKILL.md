---
name: "precompte-professionnel"
description: "Prépare le suivi du précompte professionnel d'une PME belge : principes de retenue et de versement par l'employeur, calendrier de déclaration et de paiement, dispenses de versement possibles (chercheurs, heures supplémentaires, travail de nuit ou en équipes, autres), contrôle des conditions et des pièces. À utiliser pour planifier et contrôler les versements avec le secrétariat social ; jamais pour calculer un précompte individuel, décider qu'une dispense s'applique ni déposer une déclaration."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "fiscalite"
---

# Précompte professionnel d'une PME belge

## Quand l'utiliser

- L'entreprise veut connaître son calendrier de déclaration et de versement du précompte professionnel.
- Une dispense de versement est envisagée (chercheurs, heures supplémentaires, travail de nuit ou en équipes, autre) et il faut savoir quelles conditions et quelles pièces sont attendues.
- Un versement paraît inhabituel (écart avec le mois précédent, première dispense) et il faut préparer les questions au secrétariat social.

## Objectif

Un dossier qui montre, par échéance, le précompte à verser selon le secrétariat social, les dispenses invoquées avec leurs conditions et leurs preuves, et les questions à lui poser. Le calcul des retenues et les déclarations relèvent du secrétariat social ou de l'expert-comptable ; l'agent contrôle la cohérence et la présence des pièces, il ne calcule pas de retenue individuelle.

## Prérequis

- Le nom du secrétariat social et la périodicité de paiement de l'entreprise (mensuelle ou trimestrielle), tels que la fiche du client les indique.
- Le nombre de travailleurs et les dates de paie de la période.
- Pour une dispense : le type de dispense envisagé et les pièces de l'entreprise (par exemple inscription d'un projet de recherche sur la plateforme compétente, registre des heures).

## Entrées

- `periode` : mois ou trimestre de paie.
- `declaration_secretariat` : montants globaux de précompte déclaré et à verser, transmis par le secrétariat social, avec date.
- `dispenses_invoquees` : liste des dispenses avec base de calcul globale et pièces.
- `historique` : montants globaux des trois périodes précédentes, sans noms.

## Étapes

1. **Cadrer** : périodicité de paiement, date de paie, nombre de travailleurs. Une périodicité supposée est refusée : elle vient de la fiche ou du secrétariat social.
2. **Rappeler le principe** : l'employeur retient le précompte sur la rémunération et le verse à l'administration ; il déclare et paie selon un calendrier fixé par l'administration. Le jour exact d'échéance et l'éventuelle règle propre à une périodicité trimestrielle ne sont pas repris de mémoire : ils viennent d'une source datée ou du secrétariat social.
3. **Construire le calendrier** de la période et de l'exercice civil, avec pour chaque ligne la date, la périodicité, la source datée ou la mention « à confirmer par le secrétariat social ». Renvoyer à la compétence `agenda-echeances-legales` pour l'agenda général plutôt que de le dupliquer.
4. **Comparer** le montant déclaré de la période avec l'historique (agrégats seulement) ; tout écart important est listé avec les deux montants et une hypothèse marquée « hypothèse » (nouvelle embauche, prime exceptionnelle, dispense nouvelle).
5. **Examiner chaque dispense invoquée** : nature, pourcentage ou plafond annoncé par la source datée, conditions, pièces exigées, personne de l'entreprise responsable de la preuve. Une dispense dont une condition n'est pas documentée est classée « preuve manquante » ; elle n'est jamais retenue par défaut.
6. **Vérifier la séparation des données** : les dossiers restent agrégés (totaux, nombre de travailleurs concernés) ; aucun nom, numéro national ni salaire individuel dans le dossier.
7. **Préparer les questions** au secrétariat social : exactitude du calendrier, éligibilité de chaque dispense, déclaration spécifique à introduire pour une dispense, délai de régularisation en cas de versement manqué.

## Livrable

Un dossier en Markdown : calendrier de la période, comparaison avec l'historique, tableau des dispenses (nature, base, conditions, pièces, statut), questions pour le secrétariat social, table des faits sourcés. Mention en tête : « analyse préparatoire, à valider par le secrétariat social ; déclaration et paiement par l'humain ».

## Critères de réussite

- Chaque date a une source datée ou la mention « à confirmer par le secrétariat social ».
- Chaque dispense a ses conditions et son statut de preuve ; aucune n'est retenue sans pièce.
- Aucun précompte individuel n'est calculé, aucune donnée nominative n'apparaît.
- Les écarts sont chiffrés avec deux montants et leur source.

## Sources officielles

Textes de référence à consulter par l'humain, l'expert-comptable ou le secrétariat social : Code des impôts sur les revenus 1992 (dispositions sur le précompte professionnel) et son arrêté d'exécution, sur le site Justel du SPF Justice (https://www.ejustice.just.fgov.be), et pages « précompte professionnel » du SPF Finances (https://finances.belgium.be). Le 16/10/2026, les pages du SPF Finances essayées ont renvoyé une vérification anti-robot (CAPTCHA) et n'ont pas pu être lues ; le texte consolidé du Code des impôts sur les revenus 1992 n'a pas pu être ouvert non plus sur Justel. Aucune citation de ces textes n'est reprise ici.

Sources secondaires ouvertes le 16/10/2026 :

- « Précompte professionnel », MyFid, https://www.myfid.be/ressources/comptabilite/precompte-professionnel/ : déclaration en ligne par la plateforme FinProf, échéance de déclaration et de paiement situés autour du 15 du mois suivant la paie (ou du trimestre), distinction entre exonération effective de retenue (allocations familiales, certains frais, rémunérations de chercheurs selon la page) et dispense de versement (certaines heures supplémentaires, travail de nuit, secteur maritime), exemple de date de la page contenant une incohérence (janvier 2027 pour une paie de décembre 2025) : la date exacte est donc à confirmer.
- « Réductions fiscales (dispenses de versement du précompte professionnel) », Securex, https://www.securex.be/fr/lex4you/employeur/themes/optimiser-la-politique-salariale/reductions-fiscales-(dispenses-de-versement-du-precompte-professionnel) : liste des catégories de dispense (heures supplémentaires avec plafond de 180 heures par an et par travailleur, recherche scientifique jusqu'à 80 %, travail de nuit, en équipes ou continu, sportifs, zones d'aide, entreprises en démarrage, sinistres naturels) ; pourcentages et conditions précis à lire sur les pages détaillées de l'éditeur ou à faire confirmer.

Une page de la société Partena Professional sur la dispense pour la recherche, citée par une recherche du 16/10/2026, a renvoyé une erreur d'accès (403) et n'a pas pu être lue.

## À vérifier par un professionnel

Le montant à verser, la périodicité, les échéances, l'éligibilité et le pourcentage de chaque dispense, les déclarations spécifiques à introduire et la régularisation d'un versement manqué sont à valider par le secrétariat social, l'expert-comptable ou le conseiller fiscal. La déclaration et le paiement sont faits par l'humain.

## Limites

- La compétence ne calcule pas de précompte sur une rémunération individuelle et n'applique aucun barème.
- Les pourcentages, plafonds et conditions des dispenses changent : sans source datée de la période, ils sont « à vérifier ».
- Elle ne reçoit ni salaire nominatif ni numéro national ; un employeur de très petite taille doit éviter de diffuser des agrégats qui identifient une personne.
- Elle ne traite pas les cotisations de sécurité sociale, qui relèvent d'un autre organisme et du secrétariat social.

## Exemple

Période : septembre 2026, entreprise de 14 personnes, paiement mensuel, secrétariat social tiers. Montant déclaré par le secrétariat social : 18 400 euros ; historique : 17 900, 18 100, 17 800 euros. Une dispense pour heures supplémentaires est invoquée sur une base globale de 3 100 euros d'heures supplémentaires, sans registre transmis.

Le dossier écrit : écart de +300 euros par rapport à août, sans hypothèse forte ; dispense heures supplémentaires : preuve manquante (registre des heures et sursalaire légal non fournis), non retenue ; question au secrétariat social : « quelles pièces exige la dispense sur les heures supplémentaires et le plafond annuel par travailleur a-t-il été vérifié ? ». Calendrier : date de versement de septembre à confirmer par le secrétariat social.

Cas d'échec : l'entreprise annonce « nous avons droit à la dispense recherche de 80 % » sans projet inscrit ni contrat de chercheur. Le dossier n'écrit ni « oui » ni un montant de dispense : il écrit « dispense recherche : conditions et preuves absentes (programme déclaré, qualification des chercheurs, part de temps), non retenue » et transmet la demande de preuves à l'humain responsable et au secrétariat social.

---
name: "agenda-echeances-legales"
description: "Construit et tient le calendrier des échéances légales récurrentes d'une PME belge : TVA (mensuelle ou trimestrielle), précompte professionnel, acomptes, approbation des comptes par l'assemblée générale (6 mois après la clôture), dépôt des comptes annuels à la Banque nationale de Belgique (30 jours après approbation, 7 mois au plus tard), déclaration à l'impôt des sociétés, confirmation annuelle du registre UBO, listing clients, avec rappels, responsable proposé et marge de sécurité. À utiliser pour créer le calendrier d'un exercice, le mettre à jour à une date de clôture ou de régime donnée, ou préparer les rappels de la semaine ; jamais pour déposer, payer ou signer une déclaration, ni pour déterminer seul le régime ou la date limite exacte d'une entreprise."
metadata:
  version: "1.2.0"
  langue: "fr"
  domaine: "administratif"
---

# Agenda des échéances légales d'une PME belge

## Quand l'utiliser

- Le début d'un exercice comptable : poser toutes les dates de l'année.
- Un changement de régime ou de date de clôture (passage de la TVA mensuelle à trimestrielle, nouvelle société, exercice raccourci).
- Chaque semaine ou chaque mois : produire la liste des échéances à venir avec les rappels.
- Après une absence prolongée du responsable : rattraper ce qui est échu ou imminent.

## Objectif

Un calendrier où chaque échéance a une date calculée et sourcée, un responsable proposé, un rappel anticipé, la pièce à préparer et l'état. Une date incertaine est marquée « à confirmer par le comptable », jamais devinée. La compétence ne dépose et ne paie rien : l'humain (ou le comptable) agit.

## Prérequis

- La forme juridique et le numéro d'entreprise (fiche de l'entreprise).
- La date de clôture de l'exercice et la date de l'assemblée générale ordinaire fixée par les statuts.
- Le régime TVA : assujettie ou non, périodicité mensuelle ou trimestrielle, éventuel régime de franchise.
- Si l'entreprise a du personnel : la périodicité de versement du précompte professionnel et du secrétariat social.
- Le nom du comptable ou de l'expert-comptable, et du secrétariat social.

## Entrées

- `exercice` : dates de début et de fin.
- `regime` : périodicité TVA, taille de l'entreprise (micro, petite, autre), présence d'un commissaire.
- `responsables` : qui prépare, qui valide, qui dépose, par type d'échéance.
- `marge` : nombre de jours ouvrables de sécurité souhaités avant la date limite (proposition : 5).

## Étapes

1. **Lister les obligations applicables** parmi le catalogue ci-dessous, en excluant celles qui ne concernent pas l'entreprise (par exemple pas de précompte sans personnel).
2. **Calculer chaque date limite** à partir de la règle et du régime. Appliquer la règle de report (week-end, jour férié) de la source de la ligne ; si les sources divergent, indiquer les deux dates et retenir la plus précoce.
3. **Poser un rappel anticipé** : pour chaque échéance, rappel de préparation (J moins 10 jours ouvrables) et rappel de dépôt (J moins 5), plus un rappel final la veille.
   Un rappel n'existe que s'il est porté par un outil réel (agenda partagé, tâche planifiée de l'atelier, logiciel du comptable) : le livrable dit qui ou quoi le portera, et n'écrit jamais « c'est programmé » tant que l'humain n'a pas confirmé la création du rappel dans cet outil.
4. **Désigner le responsable proposé** : préparation (comptabilité ou comptable externe), validation (dirigeant ou administrateur), dépôt ou paiement (personne habilitée). L'humain valide les noms.
5. **Lister la pièce à préparer** : relevés, états de paie, liste de clients, projet de comptes, procès-verbal.
6. **Contrôler la cohérence** : l'approbation des comptes précède le dépôt ; l'assemblée précède la convocation de quinze jours ; le dépôt ne dépasse pas sept mois après la clôture.
7. **Marquer les points à confirmer** : toute date qui dépend d'une décision du comptable, d'une circulaire annuelle ou d'une particularité de l'entreprise.
8. **Publier** le calendrier (tableau et liste chronologique) et la liste des rappels de la semaine.
9. **Relier chaque échéance à sa preuve** : une échéance passe à « déposé » ou « payé » seulement quand l'humain fournit la
   preuve (accusé de réception de la plateforme, référence de paiement) ; sans preuve, elle reste « à confirmer » et
   apparaît dans les rappels.
10. **Mettre à jour** à chaque modification de régime ou de clôture ; archiver l'ancienne version (voir `classement-archivage`).

### Catalogue des échéances

Les dates indiquées sont les règles de principe consultées le 16/10/2026. Les calendriers annuels publiés par l'administration priment : confirmer avec le comptable.

| Échéance | Règle | Périodicité | Pièce à préparer | Responsable proposé |
| --- | --- | --- | --- | --- |
| Déclaration TVA mensuelle | dépôt et paiement le 20 du mois suivant ; si le 20 est un samedi, un dimanche ou un jour férié, report au jour ouvrable suivant | mensuelle | ventes et achats du mois, notes de crédit | comptabilité, validation dirigeant |
| Déclaration TVA trimestrielle | dépôt le 25 du mois suivant le trimestre (les sources divergent sur le report en cas de week-end : voir cas d'échec) ; paiement à vérifier | trimestrielle | ventes et achats du trimestre | idem |
| Précompte professionnel | versement et déclaration le 15 du mois suivant (en général entre le 13 et le 15 pour la déclaration mensuelle) ; formule trimestrielle possible pour de petits employeurs, avec versements autour du 15 janvier, avril, juillet et octobre | mensuelle ou trimestrielle | états de paie du secrétariat social | secrétariat social ou comptabilité, validation dirigeant |
| Acomptes d'impôt (versements anticipés) | quatre dates : autour du 10 avril, du 10 juillet, du 10 octobre et du 20 décembre, reportées après un week-end (en 2026 : 10 avril, 10 juillet, 12 octobre, 21 décembre, à confirmer par le comptable) ; un défaut de versement entraîne une majoration | trimestrielle | estimation du résultat de l'exercice | dirigeant avec le comptable |
| Listing annuel des clients assujettis et relevé intracommunautaire | listing clients au 31 mars pour l'année précédente | annuelle | liste des clients assujettis | comptabilité |
| Approbation des comptes annuels | l'organe d'administration dresse les comptes et ils sont soumis à l'assemblée dans les six mois de la clôture (CSA art. 3:1) ; à défaut, le dommage subi par les tiers est présumé résulter de l'omission | annuelle | projet de comptes, rapport de gestion si requis, rapport du commissaire si commissaire | administrateurs |
| Convocation de l'assemblée générale | convocation au moins quinze jours avant l'assemblée (SRL : CSA art. 5:83 ; SA : art. 7:127), avec l'ordre du jour et les pièces ; formes plus simples admises par les statuts ou à l'unanimité | annuelle | ordre du jour, pièces | administrateurs ou secrétaire |
| Dépôt des comptes annuels à la Banque nationale de Belgique | dans les trente jours de l'approbation et au plus tard sept mois après la clôture (CSA art. 3:10) ; le dépôt est considéré comme accepté sauf avis contraire dans les huit jours ouvrables ; en cas d'erreurs substantielles, dépôt rectificatif dans les deux mois (art. 3:14) | annuelle | comptes approuvés, document de composition de l'organe, éventuel rapport | administrateur ou comptable, validation dirigeant |
| Contribution pour dépôt tardif | si le dépôt a lieu plus d'un mois après l'échéance de sept mois : 400 euros (neuvième mois), 600 euros (dixième à douzième), 1 200 euros (à partir du treizième) ; réduit à 120, 180, 360 euros pour les petites sociétés ou micro (CSA art. 3:13, texte tronqué dans la lecture : à vérifier) | si retard | n/a | n/a |
| Déclaration à l'impôt des sociétés | date limite fixée annuellement ; en 2026 le repère consulté est le 30 septembre pour une clôture au 31 décembre 2025, avec échelonnement selon la date de clôture | annuelle | comptes approuvés, annexes fiscales | comptable, validation dirigeant |
| Fiches fiscales 281 (281.10, 281.20, 281.50 et autres applicables) | introduction annuelle par Belcotax-on-web pour les sommes de l'année précédente ; date limite fixée par l'administration, à confirmer chaque année (page officielle bloquée par une vérification anti-robot le 17/10/2026) | annuelle | relevés de paie annuels, liste des commissions et honoraires versés | secrétariat social ou comptabilité, validation dirigeant |
| Registre des bénéficiaires effectifs (UBO) | enregistrement dans les trente jours de la création, modification dans le mois (source de 2021), confirmation annuelle même sans changement, via MyMinfin ; rappel envoyé un mois avant l'échéance dans la boîte MyMinfin ; amendes administratives de 250 à 50 000 euros (source de 2021) | annuelle et à chaque changement | registre des actions, pièces justificatives | administrateur, avec le comptable |

### Règles de calcul

- Le report d'un samedi, dimanche ou jour férié à un jour ouvrable n'est pas uniforme : la TVA mensuelle se reporte, la TVA trimestrielle à partir de février 2025 ne se reporte plus selon une source consultée. Toujours calculer la date la plus précoce quand les sources divergent.
- Jours ouvrables : du lundi au vendredi hors jours fériés légaux belges (liste à tenir à jour par le service).
- Une entreprise qui change de date de clôture refait tout le calendrier de l'exercice concerné.
- Un exercice commencé il y a moins de six mois n'a pas encore d'échéance de comptes : ne pas inventer.

## Livrable

1. **Tableau annuel** : échéance, date limite, règle (source), pièce, responsable proposé, rappels (J-10, J-5, veille), état (à faire, en cours, déposé, payé), preuve de dépôt ou de paiement (accusé de réception, référence, date ; vide tant qu'elle n'est pas fournie par l'humain).
2. **Liste chronologique** des 90 prochains jours.
3. **Rappels de la semaine** : trois colonnes (cette semaine, la suivante, en retard), avec pour chaque ligne le responsable et la pièce attendue.
4. **Points à confirmer** avec le comptable, avec la question exacte.
5. Le calendrier ne contient aucun montant ni donnée personnelle : seulement dates, pièces et fonctions.

## Critères de réussite

- Aucune échéance n'est marquée déposée ou payée sans preuve fournie par l'humain.
- Chaque date limite est recalculable à partir de la règle écrite dans la ligne.
- Chaque ligne a un responsable proposé, un rappel et un état.
- Aucune échéance de l'exercice n'est omise parmi celles applicables au régime déclaré.
- Les divergences de sources sont visibles et la plus précoce est retenue.
- Aucune déclaration n'a été déposée, signée ou payée par l'agent.

## Sources officielles

Consultées le 16/10/2026 :

- « Loi du 23 mars 2019 introduisant le Code des sociétés et des associations et portant des dispositions diverses », texte coordonné affiché par Etaamb (Moniteur belge), https://etaamb.openjustice.be/fr/loi-du-23-mars-2019_n2019040586.html : art. 3:1 (approbation dans les six mois), 3:10 (dépôt dans les trente jours et au plus tard sept mois), 3:13 (contribution pour dépôt tardif), 3:14 (acceptation du dépôt, dépôt rectificatif), 5:83 et 7:127 (convocation quinze jours avant).
- « Centrale des bilans », Banque nationale de Belgique, https://www.nbb.be/fr/centrale-des-bilans : délais de 30 jours après approbation et de 7 mois après la clôture.
- « Registre UBO : rappel des formalités à réaliser avant le 31 août 2021 », Lexgo, https://www.lexgo.be/fr/actualites-et-articles/11122-registre-ubo-rappel-des-formalites-a-realiser-avant-le-31-aout-2021 : confirmation annuelle, pièces justificatives, amendes de 250 à 50 000 euros, modification à notifier dans le mois. Source de 2021, de seconde main : à actualiser.
- Recherche web du 16/10/2026 « SPF Finances registre UBO confirmation annuelle des données bénéficiaires effectifs », résultats Lexgo, RSM Belgium et Jubel : enregistrement dans les trente jours, confirmation annuelle, rappel dans MyMinfin un mois avant l'échéance.
- « Calendrier 2026 des Échéances Fiscales & TVA en Belgique », Myfid, https://www.myfid.be/ressources/comptabilite/calendrier-echeances-fiscales/ : TVA mensuelle le 20, TVA trimestrielle 27 janvier, 27 avril, 27 juillet, 26 octobre 2026, précompte les 13 ou 15 et trimestriel les 15 janvier, avril, juillet, octobre, acomptes 10 avril, 10 juillet, 10 octobre, 22 décembre, listing clients au 31 mars. Source de cabinet.
- « Délais fiscaux 2026 en Belgique : le calendrier complet », Cabinet Petta, https://cabinet-petta.be/delais-fiscaux-2026-belgique/ : TVA trimestrielle 25 avril, 25 juillet, 25 octobre 2026 ; TVA mensuelle le 20 ; impôt des sociétés 30 septembre 2026 pour la clôture du 31 décembre 2025 ; majorations de 4,5 % (personnes physiques) et 6,75 % (sociétés) à défaut d'acomptes. Source de cabinet.
- « Échéances importantes pour les indépendants en 2026 », Accountable, https://www.accountable.eu/fr-be/blog/dates-importantes-independant/ : TVA trimestrielle 25 avril, 27 juillet, 25 octobre, 25 janvier 2027 ; acomptes 10 avril, 10 juillet, 10 octobre, 20 décembre. Source commerciale.
- « Découvrez l'agenda fiscal 2026... », Forum for the Future, https://blog.forumforthefuture.be/fr/article/decouvrez-lagenda-fiscal-2026-et-tenez-compte-des-conges-potentiels-et-de-la-charge-de-travail-du-moment-/25809 : TVA mensuelle le 20, précompte le 15, ONSS le 5, déclaration de l'impôt des sociétés le 30 septembre. Source professionnelle.
- Recherche web du 16/10/2026 « SPF Finances déclaration TVA périodique délai 20 du mois suivant trimestrielle mensuelle » : nouvelle date de dépôt au 25 du mois suivant à partir de 2025 pour la déclaration trimestrielle, sans report si le 25 tombe un week-end ou un jour férié, report maintenu pour la mensuelle.

Les pages du SPF Finances (finances.belgium.be, finanzen.belgium.be) étaient protégées par un test anti-robot le 16/10/2026 : non citées. Les dates de TVA trimestrielle, de précompte et d'impôt des sociétés reposent donc sur des sources de cabinet qui ne concordent pas toujours (25 ou 27 pour la TVA trimestrielle) ; l'échéance exacte vient du calendrier de l'administration, confirmé par le comptable. Le montant des acomptes et leur majoration ne sont pas détaillés ici.

## À vérifier par un professionnel

- Le régime TVA, la périodicité, toute date limite de dépôt ou de paiement, le report en cas de week-end ou de jour férié, et la date de la déclaration à l'impôt des sociétés : expert-comptable ou comptable de l'entreprise (ou bureau fiscal).
- Les échéances de précompte, de Dimona et de DmfA : secrétariat social.
- L'approbation des comptes, la convocation et le dépôt (forme de société, statuts, commissaire, petite ou microsociété) : expert-comptable et juriste ou notaire pour les statuts.
- Le registre UBO, la qualité de bénéficiaire effectif, les pièces et le dépôt : juriste d'entreprise ou expert-comptable.
- Tout retard déjà survenu : avocat ou comptable avant toute régularisation.

## Limites

- La compétence calcule des dates et prépare des rappels ; elle ne dépose, ne paie et ne signe rien.
- Elle ne détermine pas le régime TVA ni la taille de l'entreprise : il faut le fournir.
- Les calendriers de l'administration changent chaque année et les sources de cabinet consultées divergent sur quelques dates.
- Les jours fériés et ponts spécifiques à l'entreprise ne sont pas connus.
- Les secteurs particuliers (agriculture, ASBL, professions libérales, entités réglementées) ont des échéances propres non couvertes ici.

## Exemple

Société anonyme, clôture au 31 décembre 2025, TVA trimestrielle, pas de commissaire. Calcul : approbation à tenir avant le 30 juin 2026 ; dépôt dans les 30 jours de l'approbation et au plus tard le 31 juillet 2026 (sept mois après la clôture) ; convocation à envoyer au plus tard quinze jours avant l'assemblée (si l'assemblée est prévue le 22 juin 2026, convocation au plus tard le vendredi 5 juin, le 7 juin étant un dimanche) ; déclaration à l'impôt des sociétés autour du 30 septembre 2026 (à confirmer par le comptable) ; confirmation UBO dans MyMinfin à la date indiquée. Rappels automatiques à J-10, J-5 et la veille. Responsables proposés : administrateur délégué (validation), comptable externe (préparation et dépôt).

Cas d'échec : la TVA du troisième trimestre doit être déposée en octobre 2026. Une source indique le 25 octobre, une autre le 26. Le 25 octobre 2026 est un dimanche. La compétence ne choisit pas : elle écrit « 25 octobre (dimanche) selon la règle sans report ; 26 octobre selon un calendrier de cabinet ; retenue : vendredi 23 octobre, à confirmer par le comptable ». Elle ne dépose rien.

## Origine de la méthode

Lien entre chaque échéance et sa preuve de dépôt adapté de github.com/anthropics/knowledge-work-plugins,
`operations/skills/compliance-tracking/SKILL.md` (calendrier d'audit et gestion des preuves), commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : traduction, échéances belges. Règle « une cadence enregistrée ne déclenche rien sans planificateur réel » (étape 3) adaptée de `small-business/shared/chain-seams.md` (section 2), même dépôt et même commit. Licence et
reprises : `organisation/skills/LICENCES-TIERS.md`.

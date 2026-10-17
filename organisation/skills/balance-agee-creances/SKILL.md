---
name: "balance-agee-creances"
description: "Construit et analyse la balance âgée des créances clients d'une PME belge : classement par tranche de retard, contrôle des totaux contre la comptabilité, concentration par débiteur, priorisation des relances (montant, ancienneté, risque), DSO, base d'une proposition de réductions de valeur et signaux d'alerte. À utiliser pour préparer le suivi d'encaissement ou le point mensuel avec la direction ; jamais pour corriger les chiffres de la comptabilité, passer une créance en perte, décider d'une procédure ou enrichir la balance avec des informations extérieures aux documents fournis."
metadata:
  version: "1.0.1"
  langue: "fr"
  domaine: "recouvrement"
---

# Balance âgée des créances d'une PME belge

## Quand l'utiliser

- La direction ou la comptabilité veut savoir qui doit quoi, depuis quand, et par où commencer les relances.
- Le DSO monte ou la trésorerie se tend et il faut savoir si les créances en sont la cause.
- Un export du logiciel comptable existe mais personne ne l'a découpé par tranche ni vérifié.
- Avant la clôture : préparer la liste des créances douteuses que le comptable devra évaluer une par une.

## Objectif

Un tableau fiable par tranche de retard, dont le total est rapproché de la comptabilité, une liste de priorités motivées, un DSO recalculable et une liste de signaux d'alerte. Chaque chiffre porte sa date de situation et sa source. Ce qui ne peut pas être calculé est écrit « information manquante » avec la question à poser.

## Prérequis

- La date de situation (par exemple le 30/09/2026) et l'export de la balance clients : débiteur, numéro de facture, date de facture, date d'échéance, montant TTC restant dû.
- Le total du compte clients de la comptabilité générale à la même date, pour le rapprochement.
- Les conditions de paiement connues par client (30 jours, 60 jours, acompte, etc.).
- Le chiffre d'affaires TTC de la période, si le DSO est demandé.
- L'historique de contact par débiteur (dernière relance, promesse de paiement, litige connu), s'il existe.

## Entrées

- `date_situation` : jour de référence du calcul des retards.
- `balance` : lignes de factures ouvertes, avec les avoirs et acomptes non imputés.
- `total_compta` : solde du compte clients à la même date.
- `ca_periode_ttc` et `jours_periode` : pour le DSO.
- `historique` : contacts, promesses, litiges, plans de paiement, par débiteur.

## Étapes

1. **Contrôler les données.** Vérifier la date de situation, l'unité (TTC ou hors TVA : tout en TTC pour la balance), les doublons de facture et les lignes sans échéance. Une ligne sans échéance est signalée, pas supposée (on ne la range pas en « non échu » par défaut).
2. **Traiter les avoirs et les acomptes.** Un avoir ou un paiement non imputé à une facture fait paraître cette facture en retard à tort. Les lister à part et demander l'imputation à la comptabilité avant de conclure.
3. **Calculer le retard** de chaque ligne : date de situation moins date d'échéance, en jours calendrier. Classer dans les tranches : non échu, 1 à 30 jours, 31 à 60, 61 à 90, plus de 90.
4. **Totaliser et rapprocher.** Somme des tranches = total de la balance. Total de la balance comparé au total_compta. Un écart n'est pas corrigé : il est écrit avec son montant et la question « quelles écritures expliquent l'écart ? ».
5. **Mesurer la concentration.** Part des dix plus gros débiteurs dans le total échu, et part du premier débiteur dans le total des créances. Au-delà d'un tiers du total des créances sur un seul débiteur, le signaler comme dépendance (repère de gestion, à ajuster par la direction).
6. **Prioriser.** Pour chaque débiteur échu, noter de 0 à 3 trois critères (voir la grille plus bas) et additionner. Trier par total décroissant, puis par montant. Écrire pour chaque priorité la raison en une phrase et l'action proposée (relance courtoise, appel, relance ferme, dossier à soumettre à l'humain pour une suite judiciaire). Cette note est un outil de tri, pas une décision.
7. **Calculer le DSO** : créances TTC en fin de période divisées par le chiffre d'affaires TTC de la période, multipliées par le nombre de jours de la période. Comparer au délai de paiement convenu (30 jours par défaut entre entreprises, 60 jours au plus par contrat, voir sources). Un DSO supérieur au délai convenu de plus de 15 jours est un signal ; le seuil est un repère de départ.
8. **Préparer la base des réductions de valeur.** Pour chaque créance douteuse, rassembler les faits que le comptable évaluera : ancienneté, contacts, promesses non tenues, procédure collective, litige. Aucun montant de réduction n'est proposé comme définitif ; la compétence ne passe aucune créance en perte (voir « À vérifier »).
9. **Relever les signaux d'alerte** (liste plus bas) et les rattacher à des débiteurs ou à des faits observés.
10. **Rédiger la synthèse** : trois constats, trois décisions attendues de l'humain, les informations manquantes.

### Grille de priorisation (repère de départ, à ajuster par la direction)

| Critère | 0 | 1 | 2 | 3 |
| --- | --- | --- | --- | --- |
| Montant échu du débiteur | moins de 1 % du total échu | 1 à 4,9 % | 5 à 9,9 % | 10 % ou plus |
| Ancienneté de la plus ancienne facture échue | 1 à 30 jours | 31 à 60 jours | 61 à 90 jours | plus de 90 jours |
| Risque (nombre de signaux d'alerte observés) | aucun | un | deux | trois ou plus, ou procédure collective connue |

Un débiteur en litige déclaré (contestation écrite) n'entre pas dans la relance de paiement : il est mis de côté pour traitement du litige, et la ligne le dit.

### Signaux d'alerte

- Promesse de paiement non tenue deux fois de suite.
- Paiements de plus en plus tardifs d'un mois à l'autre pour un même client, ou paiement partiel répété.
- Contestation tardive d'une facture ancienne, ou demande de nouvelles conditions sans raison.
- Chèque ou virement retourné, domiciliation refusée.
- Information publique sur une procédure collective (réorganisation judiciaire, faillite) ou sur un changement de gérance : à signaler seulement si elle figure dans les documents fournis ; la compétence ne va pas la chercher ailleurs.
- Un client dont l'encours dépasse l'encours habituel ou la limite de crédit convenue.
- Plusieurs factures de montants proches impayées en même temps (suspicion d'un problème de réception ou de commande).

## Livrable

1. Tableau par tranche (nombre de factures, montant TTC, part du total), avec le total rapproché de la comptabilité et l'écart éventuel.
2. Liste des dix plus gros retards : débiteur (code ou nom selon l'accès autorisé), montant échu, plus ancienne échéance, dernier contact connu, note de priorité, action proposée.
3. DSO avec sa formule et ses valeurs d'entrée, comparé au délai convenu.
4. Liste des signaux d'alerte par débiteur, avec la source de chaque signal.
5. Base pour les réductions de valeur : créances douteuses et faits connus, sans montant définitif.
6. Informations manquantes et questions à poser.

## Critères de réussite

- Le total des tranches égale le total de la balance au centime ; l'écart avec la comptabilité est montré, pas masqué.
- Chaque priorité est reliée à un fait (montant, date, contact) et non à une impression.
- Le DSO est recalculable à partir des valeurs écrites, en TTC des deux côtés.
- Aucune information ajoutée depuis l'extérieur des documents fournis.
- Aucune créance passée en perte, aucune décision de recouvrement prise.

## Sources officielles

Consultées le 16/10/2026 :

- Loi du 2 août 2002 concernant la lutte contre le retard de paiement dans les transactions commerciales, Justel (Moniteur belge), https://www.ejustice.just.fgov.be/cgi_loi/change_lg_2.pl?language=fr&nm=2002009716&la=F : article 4, délai de paiement de 30 jours civils à défaut de délai convenu, 60 jours civils au maximum par convention (une clause plus longue est réputée non écrite, sauf dérogation royale sectorielle) ; article 5, intérêt de retard de plein droit au taux directeur majoré de huit points, arrondi au demi-point supérieur ; article 6, indemnité forfaitaire de 40 euros et indemnisation raisonnable des autres frais de recouvrement. Dernière modification relevée : loi du 14 août 2021, en vigueur le 01/02/2022. Fonde les délais de référence du DSO et les montants que la balance peut chiffrer.
- Source professionnelle, non officielle : « Réductions de valeur et moins-values sur créances commerciales », Baker Tilly Belgium (cabinet comptable), 27/02/2023, https://bakertilly.be/fr/news/reductions-de-valeur-et-moins-values-sur-creances-commerciales/. Elle ne fonde aucune règle de la compétence : elle signale seulement la distinction entre perte définitive (article 49 du CIR 1992) et perte probable (articles 48 et 22). Ces articles n'ont pas pu être relus sur un texte officiel le 17/10/2026 (recherche Justel du CIR 1992 infructueuse) : à vérifier par l'expert-comptable avant tout usage.

Les tranches (1-30, 31-60, 61-90, plus de 90), la formule du DSO, la grille de priorité et les repères de concentration sont des conventions de gestion courantes, pas des textes officiels ; aucune source officielle n'est citée pour elles. Le texte intégral du Code des impôts sur les revenus et la circulaire de l'administration fiscale sur les réductions de valeur n'ont pas été ouverts ici : les règles fiscales ne sont donc pas à appliquer sans le comptable.

## À vérifier par un professionnel

- Toute réduction de valeur, moins-value ou passage en perte, et leur traitement fiscal et TVA : expert-comptable ou comptable de l'entreprise (évaluation créance par créance, preuve du caractère probable ou définitif de la perte).
- Toute suite judiciaire ou toute question de prescription d'une créance : avocat (le délai de prescription applicable n'est pas établi ici).
- Les limites de crédit, conditions de paiement et clauses de réserve de propriété des contrats : avocat ou conseil juridique de l'entreprise.

## Limites

- La compétence travaille sur l'export reçu : elle ne recalcule pas la comptabilité et ne vérifie pas la réalité d'une facture.
- Les tranches se calculent sur l'échéance, pas sur la date de facture ; une échéance erronée fausse tout le classement.
- Les seuils (concentration, DSO, notes de priorité) sont des repères de départ, à fixer par la direction ; un secteur saisonnier (construction, horeca) exige des seuils propres.
- Un débiteur seul est parfois identifiable dans un agrégat : sous quelques lignes, ne pas diffuser le détail hors du cercle autorisé (RGPD, minimisation).

## Exemple

Situation au 30/09/2026, entreprise de services de 15 personnes. Chiffre d'affaires TTC de septembre : 72 600 euros (30 jours). Export de la balance clients, montants TTC.

| Tranche | Montant | Part |
| --- | --- | --- |
| Non échu | 52 300 euros | 53,9 % |
| 1 à 30 jours | 18 700 euros | 19,3 % |
| 31 à 60 jours | 9 400 euros | 9,7 % |
| 61 à 90 jours | 6 100 euros | 6,3 % |
| Plus de 90 jours | 10 500 euros | 10,8 % |
| Total | 97 000 euros | 100 % |

Rapprochement : compte clients de la comptabilité à la même date, 97 000 euros. Écart nul.
Créances échues : 44 700 euros, dont 16 600 euros à plus de 60 jours (17,1 % du total, au-dessus du repère de 10 % du tableau de bord).
DSO = 97 000 / 72 600 x 30 = 40,1 jours, contre 30 jours convenus en moyenne : 10 jours de plus, sous le seuil de 15 jours, donc pas de signal global, mais la queue de plus de 90 jours reste à traiter.
Priorité 1 : le débiteur B, 10 500 euros à plus de 90 jours (note 3 pour le montant, 3 pour l'ancienneté, 2 pour le risque : deux promesses non tenues, un paiement partiel), soit 8 sur 9. Action proposée : appel puis relance ferme ; si rien ne bouge, dossier à soumettre à l'humain avec l'avis d'un avocat.

Cas d'échec : le total de la balance est de 97 000 euros mais le compte clients de la comptabilité affiche 94 300 euros. Écart : 2 700 euros. Cause probable (hypothèse) : un acompte reçu et non imputé à une facture, ou un avoir comptabilisé d'un côté seulement. La compétence ne corrige rien et n'ajuste pas la balance « pour que ça tombe juste ». Elle écrit : « écart de 2 700 euros entre la balance et la comptabilité, à expliquer avant toute relance des débiteurs concernés » et pose la question « quels acomptes, avoirs ou paiements non imputés existent à cette date ? ». Les relances de ces lignes sont suspendues tant que la comptabilité n'a pas répondu, pour éviter de relancer un client qui a déjà payé.

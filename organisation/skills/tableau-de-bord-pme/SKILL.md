---
name: "tableau-de-bord-pme"
description: "Construit le tableau de bord de pilotage d'une PME belge : indicateurs clés (trésorerie, DSO, carnet de commandes, marge brute, absentéisme, productivité, qualité de service) avec définition exacte, formule, fréquence, seuil d'alerte et source de données dans l'application. À utiliser pour créer ou mettre à jour un tableau de bord de direction ; jamais pour interpoler une donnée absente, descendre au niveau d'une personne identifiable ni présenter comme définitif un chiffre comptable non validé."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "direction"
---

# Tableau de bord d'une PME belge

## Quand l'utiliser

- La direction veut suivre l'entreprise avec dix indicateurs au plus, régulièrement.
- Un tableau existant mélange des définitions (deux services calculent la « marge » différemment).
- Un indicateur dérape et il faut dire s'il faut s'alarmer.

## Objectif

Un tableau où chaque ligne a une définition écrite, une formule reproductible, une période, une source et une date d'extraction, avec un feu (vert, orange, rouge) fondé sur un seuil écrit. Un indicateur impossible à calculer est signalé, pas deviné.

## Prérequis

- La période (mois, trimestre) et les services qui fournissent les données.
- La taille et le secteur de l'entreprise (les seuils ci-dessous sont des repères de départ ; la direction les ajuste, ils ne sont pas des normes).
- Pour les chiffres comptables : le statut « provisoire » ou « validé par la comptabilité ».

## Entrées

- `periode` : par exemple `2026-09` ou `T3 2026`.
- `extraits` : valeurs transmises par le bureau de liaison, avec service et date.
- `seuils` : seuils propres à l'entreprise s'ils existent ; sinon les repères du tableau.

## Étapes

1. **Choisir les indicateurs** dans la liste ci-dessous : au plus dix, chacun relié à une décision possible. Un indicateur qui ne déclenche jamais de décision est retiré.
2. **Vérifier les données reçues** : période, unité (euros hors TVA ou TVA comprise), date d'extraction. Une unité ambiguë est signalée, pas supposée.
3. **Calculer** avec la formule donnée, en gardant les valeurs de départ et d'arrivée visibles. Aucun arrondi caché ; aucune moyenne sur une série trouée.
4. **Comparer** à la période précédente et à la même période de l'année précédente quand elle existe. Une rupture de série (changement de méthode, de périmètre) est notée en toutes lettres.
5. **Attribuer le feu** selon le seuil. En l'absence de seuil convenu, écrire « seuil à définir par la direction » plutôt que de colorer.
6. **Commenter** chaque écart important : cause probable, marquée « hypothèse », et question à poser au service.
7. **Lister les indicateurs impossibles** faute de donnée, avec la donnée manquante et le service à solliciter.

### Les indicateurs

| Indicateur | Définition et formule | Fréquence | Repère d'alerte | Source dans l'application |
| --- | --- | --- | --- | --- |
| Trésorerie disponible | soldes bancaires utilisables à la date, hors lignes de crédit non tirées | hebdomadaire | rouge sous 1 mois de charges fixes; orange sous 2 mois | extrait du service comptabilité |
| Mois de trésorerie | trésorerie disponible / charges fixes mensuelles moyennes des 3 derniers mois | mensuelle | idem | comptabilité |
| DSO (délai moyen d'encaissement) | créances clients TTC en fin de période / chiffre d'affaires TTC de la période x nombre de jours de la période | mensuelle | orange au-delà de 45 jours; rouge au-delà de 60 jours (plafond contractuel B2B, voir sources) | comptabilité et recouvrement |
| Créances échues | total des factures échues par tranche (1-30, 31-60, plus de 60 jours), en montant et en % des créances | hebdomadaire | rouge si les plus de 60 jours dépassent 10 % des créances | recouvrement (sans noms de débiteurs) |
| Carnet de commandes | montant hors TVA des commandes signées non encore facturées, et nombre de mois de chiffre d'affaires qu'il couvre | mensuelle | orange sous 2 mois de couverture | service commercial |
| Chiffre d'affaires | facturation hors TVA de la période, comparée à N-1 | mensuelle | orange si écart supérieur à 10 % au budget | comptabilité |
| Marge brute | (chiffre d'affaires hors TVA - coûts directs) / chiffre d'affaires hors TVA, en % | mensuelle | seuil propre au secteur, à définir par la direction | comptabilité |
| Taux d'absentéisme | jours calendrier d'absence pour maladie / (effectif moyen x jours calendrier de la période) x 100, hors congés et vacances | mensuelle | repère interne, comparer à N-1; à définir par la direction | ressources humaines, en agrégat uniquement |
| Taux de rotation du personnel | départs de la période / effectif moyen x 100 | trimestrielle | comparer à N-1 | ressources humaines, en agrégat |
| Délai de réponse aux demandes clients | délai médian entre réception et première réponse, en jours ouvrables | mensuelle | seuil promis aux clients | service après-vente |
| Taux de réclamations | réclamations de la période / dossiers traités x 100 | mensuelle | tendance à la hausse sur 2 périodes | service après-vente |

Précisions : le DSO se calcule en TTC des deux côtés pour être cohérent ; le chiffre d'affaires de la marge se prend hors TVA. Les chiffres comptables restent « provisoires » tant que la comptabilité ne les a pas validés.

## Livrable

Un tableau Markdown (ou exportable) : indicateur, valeur, période, comparaison, feu, définition, source, date d'extraction ; les commentaires d'écart ; la liste des indicateurs impossibles.

## Critères de réussite

- Chaque valeur est recalculable à partir des données listées.
- Aucune ligne sans source ni date ; aucun feu sans seuil écrit.
- Aucun nom de personne, de client ou de débiteur dans le tableau.
- Les ruptures de série sont signalées.

## Sources officielles

Consultées le 16/10/2026 :

- Loi du 2 août 2002 concernant la lutte contre le retard de paiement dans les transactions commerciales, Justel, https://www.ejustice.just.fgov.be/cgi_loi/change_lg_2.pl?language=fr&nm=2002009716&la=F : 30 jours par défaut entre entreprises, 60 jours civils au maximum par contrat sauf exception, intérêt de retard au taux de référence plus 8 points, indemnité forfaitaire de 40 euros. Fonde le repère de 60 jours pour le DSO.
- « Suspensions du contrat de travail - maladie et accidents », SPF Emploi, Travail et Concertation sociale, https://emploi.belgique.be/fr/themes/contrats-de-travail/suspension-du-contrat-de-travail/causes-de-suspension-propres-au : salaire garanti de 30 jours à 100 % pour les employés ; pour les ouvriers 100 % jours 1 à 7, 85,88 % jours 8 à 14 ; certificat médical dans les 2 jours ouvrables ; rechute dans les 8 semaines. À connaître pour interpréter l'absentéisme.
- « Politique renforcée de retour au travail : qu'est-ce qui change à partir du 1er janvier 2026 ? », SPF Emploi, https://emploi.belgique.be/fr/actualites/politique-renforcee-de-retour-au-travail-quest-ce-qui-change-partir-du-1er-janvier-2026 : exemption de certificat ramenée à deux jours par an, rechute portée à huit semaines, obligation d'une procédure de maintien du contact dans le règlement de travail.
- « SME definition », Commission européenne, https://single-market-economy.ec.europa.eu/smes/sme-definition_en : seuils de taille des PME.
- « Centrale des bilans », Banque nationale de Belgique, https://www.nbb.be/fr/centrale-des-bilans : les comptes annuels des sociétés sont déposés et consultables, ce qui permet de comparer ses chiffres publiés d'une année à l'autre.

Les formules de DSO, de marge et de rotation sont des conventions de gestion courantes, pas des textes officiels : aucune source officielle n'est citée pour elles. Les seuils d'alerte sont des repères de départ, à fixer par la direction.

## À vérifier par un professionnel

Les chiffres de trésorerie, de marge, de créances et de chiffre d'affaires sont à faire valider par l'expert-comptable ou le comptable de l'entreprise avant toute décision ou communication à une banque. Les chiffres d'absentéisme et de rotation, et toute action qui en découle, relèvent du secrétariat social ou du conseiller en droit social (données de santé et RGPD : agrégats seulement, jamais nominatifs).

## Limites

- Sans données du mois, l'indicateur est « information manquante » ; la compétence ne remplit pas par une moyenne.
- Les seuils sont génériques ; un secteur à saisonnalité forte (construction, horeca) exige des seuils propres.
- Le tableau décrit l'état de l'entreprise ; il n'explique pas à lui seul les causes.
- Sous 10 personnes, l'absentéisme agrégé peut révéler une personne : ne pas le diffuser sans accord humain.

## Exemple

Période septembre 2026, entreprise de 18 personnes. Extraits : créances TTC fin septembre 96 800 euros ; chiffre d'affaires TTC septembre 66 550 euros ; 30 jours dans la période (comptabilité, extraction du 05/10, provisoire).

DSO = 96 800 / 66 550 x 30 = 43,6 jours. Feu vert (sous 45). Commentaire : en hausse par rapport à 38,2 jours en août (hypothèse : deux factures importantes émises fin septembre ; à confirmer avec la comptabilité).

| Indicateur | Valeur | Période | Feu | Source |
| --- | --- | --- | --- | --- |
| DSO | 43,6 jours | 2026-09 | vert | comptabilité, 05/10/2026, provisoire |
| Taux d'absentéisme | information manquante | 2026-09 | sans feu | RH : jours d'absence agrégés non transmis |

Cas d'échec : la comptabilité transmet le chiffre d'affaires hors TVA mais les créances en TTC. Le DSO calculé serait faux d'environ 21 % (TVA de 21 %). Le tableau ne publie pas de valeur : il écrit « DSO impossible : unités différentes » et pose la question « fournir les deux montants dans la même unité ».

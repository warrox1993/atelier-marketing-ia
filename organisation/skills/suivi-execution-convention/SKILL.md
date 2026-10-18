---
name: "suivi-execution-convention"
description: "Tient le registre des conventions de partenariat signées et suit leur exécution : échéancier (terme, préavis, reconduction, révision), obligations réciproques constatées, avenants à demander, manquements à signaler, brouillons de rappel au partenaire et plan de renouvellement ou de fin. À utiliser après la signature d'une convention, avant chaque échéance contractuelle ou quand une obligation paraît ne pas être tenue ; jamais pour rédiger la convention, la notifier, la rompre ou conclure à un manquement."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "partenariats"
---

# Suivi de l'exécution des conventions

## Quand l'utiliser

- Une convention de partenariat vient d'être signée et il faut en extraire les dates et obligations.
- Une échéance contractuelle approche : terme, date limite de préavis, reconduction, révision de barème ou d'objectif.
- Un partenaire ou l'entreprise semble ne pas tenir une obligation (livrable, paiement, reporting, usage de la marque).
- Un avenant est proposé ou nécessaire.

## Objectif

Un registre unique des conventions en vigueur avec leur échéancier, un constat factuel et sourcé de l'exécution de chaque
obligation, et un plan d'action proposé avant chaque échéance, de sorte qu'aucune reconduction ni aucun préavis ne passe
inaperçu. La sélection vient de `recherche-selection`, la négociation de la convention de `accords`, les indicateurs de
performance de `pilotage-portefeuille` ; la lecture juridique et toute notification restent humaines.

## Prérequis

- Le texte signé de la convention et de ses avenants, daté.
- Les pièces d'exécution disponibles : factures, rapports du partenaire, échanges datés.
- Les limites de la direction (ce qu'elle tolère, ce qu'elle refuse de reconduire).

## Entrées

- `convention` : parties, objet, date de signature, durée, clauses de terme, de préavis, de reconduction et de révision.
- `obligations` : liste des obligations de chaque partie avec leur périodicité.
- `preuves` : pièces datées montrant l'exécution ou son absence.
- `date_du_jour` : pour calculer les délais restants.

## Étapes

1. **Extraire l'échéancier** : signature, entrée en vigueur, terme, reconduction (tacite ou expresse), préavis de
   non-reconduction, dates de révision de commission ou d'objectif, durée des exclusivités. Chaque date renvoie à
   l'article de la convention ; une clause ambiguë est transmise telle quelle aux questions pour l'avocat.
2. **Calculer les dates limites** à partir de la clause (par exemple « trois mois avant le terme ») en écrivant le calcul,
   le mode de notification prévu par la convention et la marge de sécurité proposée ; la validité du calcul est confirmée
   par le juridique.
3. **Dresser le tableau des obligations** : obligation, partie tenue, périodicité, preuve d'exécution, statut
   (« tenue », « non constatée », « en retard », « litigieuse »), date de la dernière preuve.
4. **Constater, sans qualifier** : « non constatée » veut dire qu'aucune preuve n'est dans le dossier, pas qu'il y a
   manquement. La qualification de manquement, la mise en demeure et la rupture sont des décisions humaines après avis
   juridique.
5. **Préparer l'action avant chaque échéance** (90, 60, 30 jours) : reconduire, renégocier, laisser expirer, ou fin
   ordonnée ; chaque option avec ses conséquences chiffrées si la convention les prévoit et les critères d'arrêt de la
   sélection.
6. **Rédiger les brouillons** : rappel courtois d'une obligation non constatée, demande de pièce, demande d'avenant. Ton
   factuel, sans menace ni qualification juridique, pour validation humaine.
7. **Suivre les avenants** : version en vigueur de chaque clause, différence avec la version précédente, date d'effet,
   signature des deux parties ; un avenant non signé est signalé comme tel.
8. **Alerter** : toute échéance sous 90 jours, toute obligation en retard depuis plus de 30 jours et toute clause
   d'exclusivité ou de non-concurrence proche de son terme figurent dans l'alerte au coordinateur.

## Livrable

Registre à jour (convention, partie, objet, entrée en vigueur, terme, préavis, reconduction, statut), échéancier daté
avec dates limites et articles source, tableau des obligations avec statut et preuve, brouillons de rappel ou de demande
d'avenant, options avant chaque échéance, cartes de décision, liste des informations manquantes.

## Critères de réussite

- Chaque date de l'échéancier renvoie à un article de la convention et à son calcul.
- Aucune échéance de préavis ne reste sans date limite ni responsable de la décision.
- Chaque statut d'obligation renvoie à une pièce datée ou dit qu'il n'y en a pas.
- Aucun brouillon ne conclut à un manquement, ne menace ni ne cite une sanction non lue dans la convention.
- Les avenants sont rattachés à la clause qu'ils modifient.

## À vérifier par un professionnel

L'interprétation d'une clause de terme, de préavis ou de reconduction, la qualification d'un manquement, la validité d'une
notification et toute indemnité de fin de contrat (agence commerciale, concession : Code de droit économique, livre X,
voir `accord-de-partenariat`) relèvent d'un avocat avant tout courrier. Les paiements et commissions sont à valider par le
comptable.

## Limites

- Elle ne lit pas le contrat à la place du juriste : elle extrait et signale.
- Sans le texte signé, elle ne produit que la liste des informations à obtenir.
- Elle ne contacte aucun partenaire, ne notifie rien et ne reconduit ni ne rompt aucune convention.

## Exemple

Convention de distribution signée le 1er février 2025, durée un an, reconduction tacite sauf préavis de trois mois avant
le terme. Étape 1 : terme au 31 janvier 2026, reconduction tacite, article 12. Étape 2 : date limite de préavis calculée
au 31 octobre 2025 ; mode de notification à lire à l'article 14. Étape 3 : rapport trimestriel du partenaire « non constaté »
depuis juin. Étape 5, à 90 jours : options reconduire, renégocier le seuil ou laisser expirer ; carte de décision avant le
31 octobre.

Cas d'échec évité : le coordinateur demande « écris-leur qu'ils sont en faute ». La compétence rédige un rappel factuel
de la pièce attendue et propose une carte d'avis juridique, sans qualifier la faute.

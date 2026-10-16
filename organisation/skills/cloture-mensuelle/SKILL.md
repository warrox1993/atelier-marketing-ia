---
name: "cloture-mensuelle"
description: "Prépare et contrôle la clôture mensuelle comptable d'une PME belge : rapprochements bancaires, factures à recevoir et à établir, contrôle de la TVA (périodicité, préparation de la déclaration Intervat), écritures de régularisation proposées et liste de contrôle signée par étape. À utiliser pour fermer un mois avec des chiffres fiables ou repérer ce qui manque ; jamais pour passer une écriture, déposer une déclaration, ni valider les comptes à la place du comptable."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "comptabilite-finance"
---

# Clôture mensuelle d'une PME belge

## Quand l'utiliser

- Le mois se termine et la direction veut des chiffres fiables (marge, créances, trésorerie).
- Le comptable demande un dossier préparé : rapprochements faits, pièces manquantes listées.
- Un écart inexpliqué apparaît entre la banque et la comptabilité.
- La déclaration de TVA approche et il faut contrôler les montants avant dépôt.

## Objectif

Un dossier de clôture où chaque rapprochement est soldé ou ses écarts expliqués, où les charges et produits du mois sont rattachés à la bonne période, où la TVA du mois est contrôlée avant que l'humain dépose la déclaration, et où une liste de contrôle dit ce qui est fait, ce qui reste et qui doit agir.

## Prérequis

- La période à clôturer (mois) et la date de coupure.
- Les extraits bancaires du mois et le grand livre ou la balance provisoire.
- Les journaux d'achats et de ventes, la liste des factures reçues et émises, la balance âgée clients et fournisseurs.
- La périodicité TVA de l'entreprise (mensuelle ou trimestrielle), connue par la comptabilité.
- Le statut des chiffres : « provisoire » tant que le comptable n'a pas validé.

## Entrées

- `periode` : par exemple `2026-09`.
- `extraits_bancaires` : par compte, avec solde d'ouverture et de clôture.
- `balance` et `grand_livre` : export comptable de la période.
- `journaux_tva` : ventes et achats de la période avec taux de TVA.
- `engagements_connus` : bons de commande reçus, prestations livrées non facturées, contrats à facturation périodique.

## Étapes

### 1. Rapprochement bancaire

1. Pour chaque compte, comparer le solde de l'extrait à la date de coupure avec le solde comptable.
2. Lister les écarts : opérations en banque absentes de la comptabilité (frais, intérêts, prélèvements), opérations en comptabilité absentes de la banque (chèques, virements non exécutés), erreurs de montant, doublons.
3. Pour chaque écart, indiquer la cause probable (marquée « hypothèse » si elle n'est pas prouvée), la pièce qui le prouve, et l'écriture proposée. Aucun écart « divers » sans explication au-delà de la tolérance fixée par la comptabilité.
4. Vérifier que les paiements clients encaissés sont imputés sur les bonnes factures (balance âgée à jour).

### 2. Factures à recevoir et à établir

1. **Charges à rattacher** : services reçus ou marchandises livrées dans le mois dont la facture n'est pas arrivée. Chercher dans les bons de commande, bons de livraison, contrats et courriels de confirmation ; indiquer le montant estimé et son fondement.
2. **Produits à rattacher** : prestations réalisées ou livraisons faites dans le mois non encore facturées (factures à établir). Source : bons de livraison, relevés d'heures validés, jalons de projet atteints.
3. **Charges et produits constatés d'avance** : factures du mois portant sur une période future (assurances, abonnements, loyers payés d'avance), à reporter au prorata.
4. Comparer avec le mois précédent : une facture à recevoir reprise le mois dernier doit avoir été soldée ou reconduite avec motif.

### 3. TVA

1. Rapprocher les journaux de ventes et d'achats avec la comptabilité générale : le total de TVA collectée et de TVA déductible du journal doit correspondre aux comptes de TVA du grand livre.
2. Contrôler les taux appliqués (21 %, 12 %, 6 %, 0 %) sur un échantillon, les opérations exonérées ou en autoliquidation, les pièces sans numéro de TVA valide quand il en faut un.
3. Identifier la périodicité : déclaration mensuelle ou trimestrielle selon la situation de l'entreprise (confirmée par la comptabilité, voir Sources). En cas de doute, ne pas supposer : poser la question.
4. Préparer le tableau de la déclaration : base de chaque case, montant de TVA, solde à payer ou à récupérer. Le dépôt se fait par l'humain via Intervat ; la compétence ne se connecte pas et ne dépose rien.
5. Noter la date limite de dépôt et de paiement pour la période, et la transmettre à `plan-tresorerie` pour le décaissement.

### 4. Écritures de régularisation

Pour chaque régularisation (rattachement de charges ou de produits, report, amortissement du mois, provision proposée, correction d'imputation) : libellé, comptes débité et crédité proposés, montant, période concernée, pièce ou calcul à l'appui, et mention « proposition, à passer par le comptable ». Une provision ou une correction de valeur repose sur un jugement : elle est proposée avec son motif, jamais décidée.

### 5. Contrôles de cohérence

- La balance est équilibrée.
- Les comptes de passage (virements internes, caisses) sont soldés ou expliqués.
- Les clients créditeurs et fournisseurs débiteurs sont listés.
- Le chiffre d'affaires du mois est comparé à la même période de l'année précédente ; tout écart supérieur à 20 % est commenté.
- Les comptes d'attente sont vides ou chaque solde a une explication.

### 6. Liste de contrôle

Dernier tableau : chaque étape ci-dessus avec statut (fait, partiel, bloqué), la pièce manquante, la personne qui doit agir et la date. La clôture n'est « prête pour validation » que lorsque les étapes 1 à 5 sont faites ou expliquées.

## Livrable

Un dossier avec : le tableau de rapprochement par compte, la liste des factures à recevoir et à établir, le tableau de TVA préparé avec la périodicité et les dates limites, les écritures de régularisation proposées, les contrôles de cohérence et la liste de contrôle ; chaque chiffre avec sa source, la date d'extraction et le statut « provisoire ».

## Critères de réussite

- Chaque compte bancaire est rapproché, avec écart nul ou expliqué ligne par ligne.
- Chaque facture à recevoir ou à établir cite la pièce qui la fonde.
- Le total de TVA des journaux égale celui du grand livre, ou l'écart est expliqué.
- Aucune écriture n'est passée par la compétence ; chaque proposition porte la mention « à passer par le comptable ».
- La liste de contrôle ne contient aucune étape sans responsable ni date.

## Sources officielles

Consultées le 16/10/2026 :

- « Délai de conservation des archives », Institut des Réviseurs d'Entreprises, https://www.ibr-ire.be/fr/actualites/news-detail/d-lai-de-conservation-des-archives (source d'une organisation professionnelle) : pièces justificatives et livres à conserver 7 ans selon le Code de droit économique (articles III.86 et III.88) ; durée fiscale (CIR 92 article 315, Code de la TVA article 60) portée à 10 ans par la loi du 20 novembre 2022, puis ramenée à 7 ans par la loi du 18 décembre 2025 (M.B. 30/12/2025), avec effet pour la TVA exigible depuis le 1er janvier 2023 ; exceptions (biens d'investissement immobiliers, perte reportée) à vérifier avec l'expert-comptable. Cette page de l'IBR (février 2025) est antérieure à la loi de 2025 ; voir la compétence classement-archivage. Les pièces de clôture sont donc à classer et à conserver en conséquence.
- Avis 2016/22 sur la conservation des documents comptables en comptabilité informatisée, Commission des Normes Comptables, https://www.cnc-cbn.be/fr/node/189 : inaltérabilité, accessibilité, continuité matérielle et irréversibilité des écritures ; conservation 7 ans dès le 1er janvier suivant la clôture. Une écriture de régularisation se passe donc sans modifier l'écriture d'origine.
- Arrêté royal du 29 avril 2019 portant exécution du Code des sociétés et des associations, Commission des Normes Comptables, https://www.cnc-cbn.be/fr/node/1845 : cadre des comptes annuels (livre 3). Consulté pour le cadre général ; pas de règle de clôture mensuelle propre à citer.

Source secondaire, à ne pas prendre pour officielle : « Déclaration TVA en Belgique », Eurofiscalis, https://www.eurofiscalis.com/declaration-tva-belgique/ : déclaration mensuelle par défaut, trimestrielle possible sous un chiffre d'affaires annuel de 2 500 000 euros et si l'entreprise n'est pas tenue à une liste intracommunautaire mensuelle ; dépôt via Intervat ; dates limites habituelles le 20 du mois suivant (mensuel) et le 25 du mois suivant le trimestre.

Les pages du SPF Finances sur la TVA et le site Intervat n'ont pas pu être ouvertes le 16/10/2026 (vérification anti-robot, accès refusé) : elles ne sont pas citées. Les seuils de périodicité, les dates limites et les conditions d'accès à Intervat sont donc à confirmer sur le site officiel avant usage.

La méthode de rapprochement et la liste de contrôle sont des pratiques comptables courantes, pas des textes officiels.

## À vérifier par un professionnel

Les écritures de régularisation, les provisions, la périodicité de TVA, les montants de la déclaration et les dates d'échéance sont à faire valider par l'expert-comptable ou le comptable avant tout dépôt. Les questions de TVA complexes (autoliquidation, opérations intracommunautaires, prorata de déduction) relèvent du conseiller fiscal.

## Limites

- Sans extraits bancaires ou sans grand livre, la clôture ne peut pas être préparée : la compétence liste ce qui manque.
- Les factures à recevoir reposent sur des estimations ; elles sont étiquetées comme telles.
- La compétence ne se connecte ni à la banque, ni à Intervat, et ne passe ni ne valide aucune écriture.
- Une clôture mensuelle n'est pas une clôture annuelle : inventaire, amortissements définitifs et comptes annuels restent à faire par le comptable.
- Le seuil de tolérance d'un écart de rapprochement est fixé par la comptabilité, pas par la compétence.

## Exemple

Clôture de septembre 2026, PME de services. Compte courant : solde de l'extrait au 30/09, 31 450 euros ; solde comptable 32 020 euros ; écart 570 euros. Cause : frais bancaires du trimestre de 95 euros et un prélèvement d'assurance de 475 euros non encore comptabilisés (pièces : extrait lignes 41 et 47). Écritures proposées, à passer par le comptable : frais bancaires 95 euros, charges d'assurance 475 euros (avec report au prorata si la prime couvre une période future). Écart après correction : 0.

TVA : journaux de ventes 18 900 euros de TVA collectée, comptes du grand livre 18 900 ; achats 6 240 euros contre 6 120 euros au grand livre : écart de 120 euros, facture n° A-102 enregistrée sans TVA. Tableau préparé avec mention « écart à lever avant dépôt Intervat ».

Cas d'échec : la périodicité TVA est inconnue et la déclaration préparée sur un mois alors que l'entreprise dépose par trimestre. La compétence n'aurait pas dû présumer : elle écrit « périodicité TVA non confirmée, déclaration non préparée » et demande l'information au comptable.

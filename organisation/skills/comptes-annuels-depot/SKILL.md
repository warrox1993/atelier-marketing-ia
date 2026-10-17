---
name: "comptes-annuels-depot"
description: "Prépare le dossier de fin d'exercice d'une société belge pour l'expert-comptable ou le réviseur, puis le dépôt des comptes annuels à la Centrale des bilans de la Banque nationale : calendrier depuis la clôture jusqu'au dépôt, choix du schéma à confirmer, pièces à réunir, contrôles de cohérence, rappel de l'approbation par l'assemblée. À utiliser pour organiser la clôture annuelle et le dépôt ; jamais pour approuver les comptes, signer ou déposer à la place des organes de la société."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "comptabilite-finance"
---

# Comptes annuels et dépôt à la Centrale des bilans

## Quand l'utiliser

- L'exercice se clôture et il faut organiser le dossier pour l'expert-comptable ou le réviseur.
- L'assemblée générale approche et la direction veut un calendrier jusqu'au dépôt.
- On ne sait pas quel schéma de comptes annuels déposer ni quelles pièces réunir.

## Objectif

Un dossier de fin d'exercice complet et un calendrier daté, de la clôture au dépôt, où chaque étape a un responsable
humain, une pièce et une source, et où toute règle non confirmée sur un texte officiel est marquée « à vérifier ».

## Prérequis

- La forme de la société, la date de clôture de l'exercice, la date statutaire de l'assemblée générale.
- Les données de taille utiles au choix du schéma (effectif moyen, chiffre d'affaires, total du bilan), fournies par
  la comptabilité.
- La présence ou non d'un commissaire (réviseur d'entreprises).
- Les douze clôtures mensuelles de l'exercice (compétence `cloture-mensuelle`).

## Entrées

- `societe` : forme, numéro d'entreprise, date de clôture, date de l'assemblée.
- `taille` : chiffres de taille des deux derniers exercices.
- `balance_provisoire` : balance de fin d'exercice.
- `inventaire` : stocks, immobilisations, créances et dettes à confirmer.
- `commissaire` : oui ou non.

## Étapes

1. **Calendrier à rebours** depuis l'échéance de dépôt : préparation par l'expert-comptable, rapport du commissaire le
   cas échéant, convocation et tenue de l'assemblée, dépôt. Repères du Code des sociétés et des associations : les
   comptes sont soumis à l'assemblée dans les six mois de la clôture (article 3:1) et déposés par l'organe
   d'administration à la Banque nationale dans les trente jours de leur approbation et au plus tard sept mois après la
   clôture (article 3:10). Texte lu dans sa version publiée au Moniteur belge : vérifier les modifications ultérieures
   sur Justel avant usage.
2. **Schéma à proposer** (complet, abrégé ou micro) d'après les critères de taille fournis : proposition argumentée,
   décision de l'expert-comptable. L'outil de sélection des modèles de la Banque nationale sert de contrôle.
3. **Pièces à réunir** : inventaire, rapprochements bancaires de fin d'exercice (compétence `rapprochement-comptes`),
   balances âgées, tableau des immobilisations et amortissements, contrats et engagements hors bilan, litiges connus,
   procès-verbaux des organes, et tout élément demandé par l'expert-comptable.
4. **Contrôles de cohérence** : balance équilibrée, résultat de la balance égal au résultat des états, comptes de tiers
   rapprochés, comptes d'attente vides, variation des capitaux propres expliquée.
5. **Points de décision humaine** listés : approbation des comptes par l'assemblée, affectation du résultat, décharge
   des administrateurs ou gérants, dépôt. Chacun a sa carte au moment voulu.
6. **Préparation du dépôt** : rappel que le dépôt se fait par la plateforme de la Centrale des bilans par une personne
   habilitée, que des frais de dépôt s'appliquent et qu'un dépôt tardif entraîne une majoration (montants à lire sur
   le site de la Banque nationale).
7. **Lien avec la fiscalité** : la déclaration à l'impôt des sociétés suit les comptes approuvés ; signaler la date au
   service fiscalité par le coordinateur.

## Livrable

Un dossier : calendrier daté avec responsables, schéma proposé avec ses critères, liste des pièces avec statut,
résultats des contrôles de cohérence, liste des décisions humaines, sources et points « à vérifier ».

## Critères de réussite

- Chaque date du calendrier a une source ou la mention « à confirmer » ; aucune date inventée.
- Le schéma proposé cite les critères de taille utilisés ; la décision est laissée à l'expert-comptable.
- Aucune approbation, signature ou dépôt présentés comme faits par l'agent.
- Toute pièce manquante est nommée avec la personne qui doit la fournir.

## Sources officielles

Consultées le 17/10/2026 :

- Centrale des bilans, Banque nationale de Belgique, https://www.nbb.be/fr/centrale-des-bilans : « la plupart des
  personnes morales actives dans notre pays doivent déposer des comptes annuels » ; plateforme de dépôt
  https://filing.cbso.nbb.be/ ; pages « Établir et déposer », « Combien payer ? » (frais de dépôt, majoration
  tarifaire) et outil de sélection des modèles. Les délais exacts et les montants n'ont pas pu être lus sur ces pages
  le 17/10/2026 (contenu non rendu) : à confirmer.
- Arrêté royal du 29 avril 2019 portant exécution du Code des sociétés et des associations, Commission des Normes
  Comptables, https://www.cnc-cbn.be/fr/node/1845 : cadre des comptes annuels.
- Loi du 23 mars 2019 introduisant le Code des sociétés et des associations, texte du Moniteur belge reproduit par
  Etaamb, https://etaamb.openjustice.be/fr/loi-du-23-mars-2019_n2019040586.html : article 3:1 (« Les comptes annuels
  doivent être soumis à l'approbation des associés réunis en assemblée ou de l'assemblée générale dans les six mois de
  la clôture de l'exercice ») et article 3:10 (« Les comptes annuels sont déposés par l'organe d'administration à la
  Banque nationale de Belgique. Ce dépôt a lieu dans les trente jours de leur approbation et au plus tard sept mois
  après la date de clôture de l'exercice »). Version d'origine : la version consolidée est à confirmer sur Justel,
  https://www.ejustice.just.fgov.be . Les autres échéances de la société (convocation, contribution pour dépôt tardif)
  sont tenues par la compétence `agenda-echeances-legales`.

## À vérifier par un professionnel

Le choix du schéma, les critères de taille, les délais légaux de l'assemblée et du dépôt, les règles d'évaluation,
l'affectation du résultat et le contenu de l'annexe relèvent de l'expert-comptable, du réviseur et des organes de la
société.

## Limites

- La compétence ne prépare pas les comptes annuels eux-mêmes : c'est le travail de l'expert-comptable.
- Elle ne dépose rien et ne se connecte pas à la plateforme de la Banque nationale.
- Les normes étrangères (normes américaines, IFRS) ne sont pas traitées.

## Exemple

SRL, exercice clôturé au 31/12/2026, assemblée statutaire le deuxième mardi de juin, pas de commissaire. Calendrier
proposé : pièces réunies pour fin février, projet de comptes de l'expert-comptable pour fin avril, convocation de
l'assemblée, assemblée le 08/06/2027, dépôt dans les trente jours, donc au plus tard le 08/07/2027 et dans tous les cas
avant le 31/07/2027 (sept mois, article 3:10), à confirmer sur la version consolidée. Schéma proposé : abrégé, d'après les trois
critères fournis ; décision de l'expert-comptable.

Cas d'échec : l'agent annonce « dépôt au plus tard le 31 juillet » sans citer l'article ni signaler que l'assemblée doit
d'abord approuver les comptes. Une date sans source est une date inventée, et un dépôt sans approbation n'a pas de sens.

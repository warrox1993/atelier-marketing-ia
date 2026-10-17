---
name: "plan-de-paiement"
description: "Prépare une proposition d'échéancier de paiement argumentée pour un débiteur (entreprise ou consommateur belge) à partir de sa capacité déclarée : montant, nombre et dates des échéances, intérêts, clause de déchéance du terme à faire valider, effets d'une demande de plan d'apurement d'un consommateur (suspension des mesures, intérêts arrêtés après 30 jours sans décision), confirmation sur support durable et suivi des échéances. À utiliser quand un débiteur demande des facilités ou qu'un plan est en cours ; jamais pour accorder le plan, modifier une créance ni réclamer des frais non permis."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "recouvrement"
---

# Plan de paiement

## Quand l'utiliser

- Un débiteur demande des facilités de paiement ou un plan d'apurement.
- Le responsable veut proposer un échéancier plutôt qu'une mise en demeure.
- Un plan est en cours et il faut suivre ses échéances.

## Objectif

Une proposition d'échéancier réaliste, chiffrée et conforme au régime du débiteur, que l'humain accorde ou refuse, puis un
suivi qui dit chaque mois si le plan est tenu.

## Prérequis

- Le détail de la créance (factures ou primes, montants, échéances, intérêts et indemnités déjà dus selon le régime).
- La demande du débiteur et sa capacité déclarée (montant mensuel possible, date de départ souhaitée). L'agent ne
  recherche aucune information sur la situation personnelle du débiteur.
- Les limites fixées par l'entreprise : durée maximale, montant minimal par échéance, intérêts appliqués ou non.

## Entrées

- `creance` : détail daté des sommes dues.
- `demande` : date de la demande, capacité déclarée, motif éventuel.
- `regime` : entreprise (loi du 2 août 2002) ou consommateur (livre XIX du CDE).
- `limites` : règles internes de l'entreprise.

## Étapes

1. **Identifier le régime** et noter la date de la demande : pour un consommateur, une demande de plan d'apurement
   formulée dans le délai qui suit la mise en demeure suspend toute autre mesure de recouvrement amiable jusqu'à la
   décision ; sans décision dans les 30 jours calendrier, les intérêts de retard de la clause indemnitaire cessent de
   courir jusqu'à la décision. Calculer et afficher la date limite de décision.
2. **Établir le montant de base** : principal, plus seulement les intérêts et indemnités permis par le régime et par le
   contrat (pour un consommateur, rien d'autre que ce que permet le livre XIX). Aucun frais pour l'établissement du plan.
3. **Construire l'échéancier** à partir de la capacité déclarée : nombre d'échéances, montant, dates, moyen de paiement
   avec communication structurée. Si la capacité ne couvre pas la dette dans la durée maximale fixée par l'entreprise, le
   dire et proposer deux options à l'humain, sans trancher.
4. **Préciser les intérêts** pendant le plan (appliqués ou suspendus, taux et base) selon la décision de l'entreprise ;
   « à décider par l'humain » si elle n'est pas fixée.
5. **Rédiger la clause de déchéance du terme** (ce qui se passe en cas d'échéance manquée, après quel rappel et quel
   délai) en brouillon, marquée « à faire valider par un juriste ».
6. **Préparer la confirmation** : une fois le plan accordé par l'humain, les modalités sont confirmées sans délai au
   débiteur sur un support durable (courriel ou lettre), en brouillon.
7. **Suivre les échéances** : chaque mois, échéance payée, en retard ou manquée, solde restant ; pour un consommateur,
   relevé au moins annuel des montants payés et du solde, et information dès que la dette est éteinte.
8. **Signaler** au coordinateur toute échéance manquée avant toute suite, et toute demande de médiation de dettes ou de
   règlement collectif (autre suspension).

## Livrable

Proposition d'échéancier (tableau des échéances, montants, dates, solde après chaque échéance) ; base de calcul et
régime ; date limite de décision ; clause de déchéance en brouillon ; brouillon de confirmation ; tableau de suivi ; carte
de décision pour l'accord du plan.

## Critères de réussite

- La somme des échéances égale le montant de base ; chaque montant est recalculable.
- Aucun frais ni intérêt non permis par le régime et le contrat.
- La date limite de décision (30 jours pour un consommateur) est affichée.
- Le plan n'est jamais présenté comme accordé avant la décision humaine.

## Sources officielles

Consultées le 17/10/2026 :

- Code de droit économique, livre XIX, texte consolidé sur Justel,
  https://www.ejustice.just.fgov.be/eli/loi/2013/02/28/2013A11134/justel : art. XIX.4 (seuls les intérêts et indemnités
  limités peuvent être réclamés), XIX.9 § 2 (demande de plan d'apurement : aucune autre mesure avant décision ; intérêts
  arrêtés si la décision n'est pas prise dans les 30 jours calendrier), § 3 (médiation de dettes ou règlement collectif :
  suspension jusqu'à décision ou 45 jours), XIX.11 (modalités de paiement confirmées sans délai sur support durable ;
  aucun appel entre 22 h et 8 h), XIX.12 (relevé annuel des montants payés et du solde ; information dès l'extinction
  de la dette), XIX.13 (aucune indemnité ni frais pour l'intervention du recouvreur).
- Loi du 2 août 2002 concernant la lutte contre le retard de paiement dans les transactions commerciales, Justel (source
  de la compétence `relance-amiable-b2b-b2c`) : régime des intérêts entre entreprises.

## À vérifier par un professionnel

- La clause de déchéance du terme, la renonciation éventuelle aux intérêts et toute remise de dette sont validées par le
  responsable et, si besoin, un juriste.
- Pour une prime d'assurance, l'effet d'un plan sur la suspension de garantie ou la résiliation (loi du 4 avril 2014,
  art. 69 à 71) est à confirmer avec l'assureur.

## Limites

- La compétence ne juge pas la solvabilité du débiteur : elle part de sa capacité déclarée.
- Elle n'accorde rien et n'envoie rien.
- Elle ne traite pas un débiteur en règlement collectif de dettes au-delà de la suspension : le dossier passe au juridique.

## Exemple

Cas nominal : consommateur, 1 240 euros dus (principal 1 180 euros, indemnité forfaitaire prévue au contrat 60 euros, sous le plafond du
livre XIX : 65 euros plus 5 % de 680 euros, soit 99 euros), demande d'un plan le
3/11 avec une capacité de 150 euros par mois. Proposition : 8 échéances de 155 euros (somme 1 240 euros), le 15 de chaque
mois à partir du 15/11 ; date limite de décision : 30 jours calendrier à partir du premier jour ouvrable après la
demande ; clause de déchéance en brouillon à valider ; carte de décision.

Cas d'échec évité : le responsable voulait ajouter 25 euros de « frais de dossier » au plan d'un consommateur. L'agent ne
les inclut pas et explique que le livre XIX ne les permet pas.

## Origine de la méthode

Méthode propre à l'atelier, fondée sur le livre XIX du Code de droit économique et la loi du 2 août 2002 ; aucune reprise
d'un dépôt tiers.

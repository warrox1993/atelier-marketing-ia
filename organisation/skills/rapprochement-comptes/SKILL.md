---
name: "rapprochement-comptes"
description: "Rapproche un compte d'une PME belge (banque, compte d'attente, compte de tiers ou compte collectif contre son détail) : liste des écarts, classement en décalage temporel, ajustement requis ou à investiguer, ancienneté par tranche, seuils d'escalade et statut de clôture. À utiliser pour un rapprochement bancaire, l'apurement d'un compte d'attente ou le contrôle d'un compte avant clôture ; jamais pour passer une écriture ni décider qu'un écart est sans importance."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "comptabilite-finance"
---

# Rapprochement de comptes

## Quand l'utiliser

- Fin de mois : rapprocher chaque compte bancaire de son extrait avant la clôture (compétence `cloture-mensuelle`).
- Un compte d'attente ou de passage n'est pas soldé et personne ne sait pourquoi.
- Le total d'un compte collectif (clients, fournisseurs) ne correspond pas à la balance âgée.
- Un écart revient d'un mois à l'autre et grossit.

## Objectif

Un rapprochement où chaque écart est listé, classé dans une catégorie, daté, chiffré et rattaché à une pièce, avec une
action et un responsable proposés, et un statut clair : « rapproché », « rapproché avec écarts expliqués » ou
« clôture impossible tant que l'écart X n'est pas expliqué ».

## Prérequis

- Le solde du compte au grand livre à la date de coupure et le détail des mouvements.
- La pièce de comparaison : extrait bancaire, balance âgée, relevé du tiers ou tableau de détail.
- Les seuils d'escalade fixés par l'entreprise (montant par écart, total des écarts, ancienneté). À défaut, les repères
  de l'étape 4 sont utilisés et marqués « seuils de départ, à fixer par l'entreprise ».
- Le nom de la personne qui encode dans ce compte : le rapprochement n'est pas confié à la même personne.

## Entrées

- `compte` : numéro et intitulé (par exemple 550000 Banque, 499000 Compte d'attente).
- `date_coupure` : fin de la période.
- `solde_comptable` et `mouvements_comptables` : export du grand livre.
- `piece_comparaison` : extrait bancaire, relevé ou détail, avec solde à la même date.
- `ecarts_precedents` : rapprochement du mois précédent, s'il existe.

## Étapes

1. **Comparer les soldes.** Solde comptable et solde de la pièce de comparaison à la même date. L'écart total est le
   point de départ, jamais la conclusion.
2. **Pointer les mouvements.** Associer chaque mouvement comptable à un mouvement de la pièce (montant, date, libellé,
   référence). Ce qui reste non pointé de part et d'autre forme la liste des écarts.
3. **Classer chaque écart** dans une seule catégorie :
   - **décalage temporel** : écriture déjà passée d'un côté, attendue de l'autre sans action (virement émis le 30 et
     débité le 2, encaissement en transit). Dire quand il doit se résorber ;
   - **ajustement requis** : il faut une écriture pour corriger (frais bancaires ou intérêts non comptabilisés, erreur de
     montant, mauvais compte, doublon). Proposer l'écriture, à passer par le comptable ;
   - **à investiguer** : écart sans cause démontrée, montant contesté, élément ancien qui ne se résorbe pas.
   Une cause non prouvée est écrite « hypothèse ».
4. **Mesurer l'ancienneté** de chaque écart ouvert et appliquer l'action de sa tranche :
   | Tranche | Statut | Action |
   | --- | --- | --- |
   | 0 à 30 jours | courant | suivre |
   | 31 à 60 jours | vieillissant | chercher pourquoi il ne se résorbe pas |
   | 61 à 90 jours | en retard | signaler au coordinateur, documenter la recherche |
   | plus de 90 jours | ancien | proposer à l'humain une décision (correction, passage en perte, réclamation) |
5. **Appliquer les seuils d'escalade** de l'entreprise (montant d'un écart, total des écarts, ancienneté, écart qui
   grossit trois périodes de suite). Règle sans exception : **un écart inexpliqué, quel que soit son montant, empêche de
   déclarer le compte rapproché**.
6. **Comparer avec le mois précédent.** Chaque écart du mois précédent est soit résorbé (dire comment), soit reporté
   avec son ancienneté mise à jour. Un écart ne se reporte pas indéfiniment sans action.
7. **Rédiger la conclusion** : statut, liste des écritures proposées, questions ouvertes, et carte de décision
   (`request_confirmation`) pour les écritures et pour toute décision sur un écart ancien.

## Livrable

Un rapport de rapprochement par compte : soldes comparés, tableau des écarts (numéro, description, montant, date
d'origine, ancienneté en jours, catégorie, statut, pièce, responsable proposé), écritures proposées avec la mention
« proposition, à passer par le comptable », statut du compte, préparateur et date ; le tout marqué « provisoire ».

## Critères de réussite

- Solde comptable moins écarts égale solde de la pièce, au centime.
- Chaque écart a une catégorie, une ancienneté et une pièce ; aucun « divers ».
- Aucun compte déclaré rapproché alors qu'un écart reste « à investiguer ».
- Aucune écriture présentée comme passée.
- Le rapprochement n'est pas préparé par la personne qui encode dans le compte, ou ce cumul est signalé.

## Sources officielles

Consultées le 17/10/2026 :

- Avis 2016/22 de la Commission des Normes Comptables sur la comptabilité informatisée, https://www.cnc-cbn.be/fr/node/189 :
  une écriture passée ne se modifie pas, elle se corrige par une nouvelle écriture. Une correction issue d'un
  rapprochement est donc toujours une écriture distincte, avec sa pièce.
- Délai de conservation des pièces justificatives : voir les sources de la compétence `cloture-mensuelle`.

La méthode de rapprochement (catégories, tranches d'ancienneté, seuils) est une pratique comptable courante, pas un
texte officiel ; les seuils sont des repères de départ.

## À vérifier par un professionnel

Les écritures d'ajustement, le passage en perte d'un écart ancien, la tolérance d'écart admise et les seuils
d'escalade sont fixés et validés par l'expert-comptable ou le responsable financier.

## Limites

- Sans pièce de comparaison datée au même jour, aucun rapprochement n'est possible : la compétence demande la pièce.
- La compétence ne se connecte pas à la banque et ne passe aucune écriture.
- Un écart dû à une fraude possible n'est pas « investigué » par l'agent : il est signalé au coordinateur sans délai.

## Exemple

Compte 550000, septembre 2026. Solde comptable 48 210,40 euros, extrait 47 760,50 euros, écart 449,90 euros. Pointage :
frais bancaires de 37,40 euros absents de la comptabilité (ajustement requis, ligne 39 de l'extrait) ; écart de
412,50 euros sans pièce ni mouvement correspondant (à investiguer, 12 jours). Statut : « clôture impossible tant que
l'écart de 412,50 euros n'est pas expliqué » ; écriture de frais proposée ; carte posée.

Cas d'échec : l'agent range les 412,50 euros en « décalage temporel » parce qu'un virement de ce montant « pourrait »
arriver. Sans pièce, ce n'est pas un décalage : la catégorie correcte est « à investiguer ».

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `finance/skills/reconciliation/SKILL.md`,
commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0 (catégories d'écart, tranches d'ancienneté, seuils
d'escalade, séparation des tâches). Modifications : réécriture en français, cadre belge, validation humaine. Texte de
la licence et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.

---
name: "coordonnees-recoupement"
description: "Recoupe chaque numéro de téléphone relevé sur deux sources indépendantes (fiable ou à vérifier), le classe (standard, ligne directe, portable professionnel publié) et rend, par fiche, un format de sortie fixe avec source, date et base légale. À utiliser après la recherche des coordonnées et avant la relecture."
metadata:
  version: "1.1.1"
  langue: "fr"
  domaine: "prospection"
---

# Recoupement et classement des numéros

## Quand l'utiliser

- Le relevé de la compétence `coordonnees-recherche` est prêt pour une ou plusieurs fiches.
- Une fiche a déjà des numéros dont il faut confirmer la fiabilité.

## Objectif

Transformer le relevé brut en une liste de numéros chacun classé, daté, sourcé, fondé en droit et contrôlé, pour que la
Relecture et l'humain voient d'un coup ce qui est utilisable, ce qui reste à vérifier et ce qui ne doit pas être appelé.

## Prérequis

- Le relevé complet de `coordonnees-recherche` pour la fiche.

## Entrées

- `releve` : tableau numéro, étape, URL, date, extrait, par fiche.

## Étapes

1. **Recouper.** Normaliser chaque numéro au format international (+32…) sans changer un chiffre, puis compter les sources
   indépendantes qui le portent : deux pages du même site comptent pour UNE source ; un annuaire qui recopie le site ne
   compte pas comme indépendant s'il cite le site. Deux sources indépendantes ou plus : statut « fiable ». Une seule source,
   ou sources contradictoires : « à vérifier », avec la raison (une source, contradiction, source ancienne de plus de 12 mois).
2. **Classer.** Chaque numéro reçoit un type : « standard » (accueil, secrétariat, numéro général), « ligne directe » (numéro
   attribué à une personne ou un service, publié comme tel) ou « portable professionnel publié » (mobile publié par la
   personne ou son employeur dans un contexte professionnel). Un doute entre deux types se note « type à confirmer » ; un mobile
   dont rien ne dit qu'il est professionnel n'est pas retenu. Minimisation : le standard ou la ligne du cabinet d'abord ; un
   portable seulement s'il est le seul numéro professionnel publié ; jamais le motif d'une absence (congé, maladie, maternité)
   ni un autre détail de la vie privée lu à côté du numéro.
3. **Signaler l'opposition.** Une opposition déjà exprimée à la prospection est signalée sur la fiche du numéro, sans
   bloquer le recoupement.

Pour chaque numéro, écrire aussi la base légale : l'intérêt légitime (RGPD, art. 6, § 1, f) avec la référence de la mise en
balance validée par un humain (preuve `mise_en_balance` de la base légale du prospect) si elle existe, sinon « mise en
balance : non fournie (optionnel) » : le numéro est relevé et déposé quand même, sans rien demander (décision de l'opérateur du
30/10/2026) ; jamais « consentement » sans preuve fournie. Qu'un numéro soit publié par la personne ou l'entreprise est une
source, pas une base légale de l'art. 6.

## Livrable

Pour chaque fiche, le format de sortie suivant (une entrée par numéro, recopiée telle quelle dans le livrable). Le numéro est
déjà déposé chiffré dans la fiche du prospect : le livrable n'en écrit jamais les chiffres, la porte le refuserait.

```
Fiche : <nom de l'entreprise> (BCE <numéro ou « inconnu »>)
Numéro : déposé dans la fiche (prospect <identifiant>)
Type : standard | ligne directe | portable professionnel publié | type à confirmer
Fiabilité : fiable (2 sources ou plus) | à vérifier (<raison>)
Sources : <URL 1> (<date>) ; <URL 2> (<date>)
Base légale : intérêt légitime (art. 6, § 1, f), mise en balance <référence> | intérêt légitime (art. 6, § 1, f), mise en balance : non fournie (optionnel)
Information art. 14 : à faire au plus tard au premier contact | faite le <date> par l'humain
Appel conseillé : oui | non (<raison>)
```

Chaque personne physique de la liste porte la mention « information art. 14 : à faire au plus tard au premier contact, et dans le mois qui suit la collecte » (RGPD, art. 14, § 3) ; le modèle de mention que l'humain relit et envoie lui-même est `controle-communications-reglementees/references/information-art14.md`. L'atelier n'envoie rien.

Une fiche sans numéro porte « Numéro : aucun trouvé » et la liste des étapes faites. En tête du livrable : nombre de numéros
fiables, à vérifier, et les étapes qui n'ont pas pu être faites.

## Critères de réussite

- Aucun numéro « fiable » avec moins de deux sources indépendantes.
- Tout numéro porte type, sources avec date et base légale.
- « Appel conseillé : oui » seulement si le numéro est fiable ET la mise en balance fournie (la règle du plugin refuse le téléphone sans elle) ; sinon « non » avec la raison.

## Limites

- Le recoupement mesure la concordance des sources, pas l'exactitude absolue : un numéro « fiable » peut avoir changé.
- Interdit : numéro deviné, déduit ou issu d'une fuite, du darkweb ou d'un vol de données ; numéro d'un particulier non
  publié. Un tel numéro n'entre jamais dans le livrable.
- Aucun appel et aucun envoi : le livrable est « préparé, non utilisé ». L'appel lui-même est une décision de l'humain.

## Sources officielles

- Code de droit économique, livre VI, art. VI.110 à VI.114 (communications non souhaitées), texte
  consolidé sur Justel : https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=2013022819&table_name=loi
- Règlement (UE) 2016/679 (RGPD), art. 6, § 1, f (intérêt légitime) et art. 21 (droit d'opposition).

## À vérifier par un professionnel

- La mise en balance de l'intérêt légitime (art. 6, § 1, f) : si le
  client la fournit, son DPO ou son juriste la confirme ; sinon « non fournie (optionnel) », sans bloquer ni rien demander
  (décision de l'opérateur du 30/10/2026). L'avis de juriste est optionnel.

## Exemple

```
Fiche : Cabinet Exemple SRL (BCE 0000.000.000, fictive)
Numéro : déposé dans la fiche (prospect 123e4567-e89b-42d3-a456-426614174000, fictif)
Type : standard
Fiabilité : fiable (2 sources ou plus)
Sources : https://exemple.invalide/contact (2026-10-21) ; https://annuaire.exemple.invalide/fiche/123 (2026-10-21)
Base légale : intérêt légitime (art. 6, § 1, f), mise en balance : non fournie (optionnel)
Appel conseillé : non (téléphone : la mise en balance doit être documentée avant tout appel ; le numéro est déposé quand même)
```

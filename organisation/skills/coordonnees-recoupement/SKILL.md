---
name: "coordonnees-recoupement"
description: "Recoupe chaque numéro de téléphone relevé sur deux sources indépendantes (fiable ou à vérifier), le classe (standard, ligne directe, portable professionnel publié), contrôle la liste belge « Ne m'appelez plus » et rend, par fiche, un format de sortie fixe avec source, date et base légale. À utiliser après la recherche des coordonnées et avant la relecture ; jamais pour conseiller un appel quand le contrôle de la liste n'est pas fait."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "prospection"
---

# Recoupement et classement des numéros

## Quand l'utiliser

- Le relevé de la compétence `coordonnees-recherche` est prêt pour une ou plusieurs fiches.
- Une fiche a déjà des numéros dont il faut confirmer la fiabilité ou rafraîchir le contrôle de la liste.

## Objectif

Transformer le relevé brut en une liste de numéros chacun classé, daté, sourcé, fondé en droit et contrôlé, pour que la
Relecture et l'humain voient d'un coup ce qui est utilisable, ce qui reste à vérifier et ce qui ne doit pas être appelé.

## Prérequis

- Le relevé complet de `coordonnees-recherche` pour la fiche.
- Facultatif : un accès à la liste belge « Ne m'appelez plus » (licence de l'entreprise auprès de l'association agréée, fournie
  par l'humain). Sans accès fourni, le contrôle est « non vérifié ».

## Entrées

- `releve` : tableau numéro, étape, URL, date, extrait, par fiche.
- `resultatListe` : résultat de la comparaison avec la liste « Ne m'appelez plus » s'il existe (numéro, inscrit ou non, date de
  consultation).

## Étapes

7. **Recouper.** Normaliser chaque numéro au format international (+32…) sans changer un chiffre, puis compter les sources
   indépendantes qui le portent : deux pages du même site comptent pour UNE source ; un annuaire qui recopie le site ne
   compte pas comme indépendant s'il cite le site. Deux sources indépendantes ou plus : statut « fiable ». Une seule source,
   ou sources contradictoires : « à vérifier », avec la raison (une source, contradiction, source ancienne de plus de 12 mois).
8. **Classer.** Chaque numéro reçoit un type : « standard » (accueil, secrétariat, numéro général), « ligne directe » (numéro
   attribué à une personne ou un service, publié comme tel) ou « portable professionnel publié » (mobile publié par la
   personne ou son employeur dans un contexte professionnel). Un doute entre deux types se note « type à confirmer » ; un mobile
   dont rien ne dit qu'il est professionnel n'est pas retenu.
9. **Contrôler la liste « Ne m'appelez plus ».** Comparer chaque numéro retenu au résultat fourni. Inscrit : « exclu, inscrit
   sur la liste le <date> », aucun appel conseillé. Non inscrit : « non inscrit au <date de consultation> ». Sans résultat :
   « non vérifié » et la mention « aucun appel conseillé tant que le contrôle n'est pas fait ». Une opposition déjà exprimée
   à la prospection exclut aussi le numéro.

Pour chaque numéro, écrire aussi la base légale : « intérêt légitime B2B (numéro professionnel publié par l'entreprise) » ou
« numéro publié par la personne elle-même », jamais « consentement » sans preuve fournie.

## Livrable

Pour chaque fiche, le format de sortie suivant (une ligne de numéro par entrée, recopié tel quel dans le livrable) :

```
Fiche : <nom de l'entreprise> (BCE <numéro ou « inconnu »>)
Numéro : <+32…>
Type : standard | ligne directe | portable professionnel publié | type à confirmer
Fiabilité : fiable (2 sources ou plus) | à vérifier (<raison>)
Sources : <URL 1> (<date>) ; <URL 2> (<date>)
Base légale : intérêt légitime B2B | numéro publié par la personne
Liste « Ne m'appelez plus » : non inscrit au <date> | inscrit (exclu) | non vérifié
Appel conseillé : oui | non (<raison>)
```

Une fiche sans numéro porte « Numéro : aucun trouvé » et la liste des étapes faites. En tête du livrable : nombre de numéros
fiables, à vérifier, exclus, non vérifiés, et les étapes qui n'ont pas pu être faites.

## Critères de réussite

- Aucun numéro « fiable » avec moins de deux sources indépendantes.
- Tout numéro porte type, sources avec date et base légale.
- « Appel conseillé : oui » seulement si le numéro est fiable, non inscrit et contrôlé ; sinon « non » avec la raison.
- Le contrôle de la liste est « non vérifié » chaque fois qu'aucun résultat n'a été fourni, sans exception.

## Limites

- Le recoupement mesure la concordance des sources, pas l'exactitude absolue : un numéro « fiable » peut avoir changé.
- Interdit : numéro deviné, déduit ou issu d'une fuite, du darkweb ou d'un vol de données ; numéro d'un particulier non
  publié. Un tel numéro n'entre jamais dans le livrable.
- Aucun appel et aucun envoi : le livrable est « préparé, non utilisé ». L'appel lui-même est une décision de l'humain.

## Sources officielles

- Code de droit économique, livre VI, art. VI.110 à VI.114 (communications non souhaitées, liste « Ne m'appelez plus »), texte
  consolidé sur Justel : https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=2013022819&table_name=loi
- Règlement (UE) 2016/679 (RGPD), art. 6, § 1, f (intérêt légitime) et art. 21 (droit d'opposition).

## À vérifier par un professionnel

- La base légale « intérêt légitime B2B » de chaque fichier d'appel et les modalités d'accès à la liste « Ne m'appelez plus » :
  à faire confirmer par le DPO ou le juriste du client.

## Exemple

```
Fiche : Cabinet Exemple SRL (BCE 0000.000.000, fictive)
Numéro : +32 4 000 00 00
Type : standard
Fiabilité : fiable (2 sources ou plus)
Sources : https://exemple.invalide/contact (2026-10-21) ; https://annuaire.exemple.invalide/fiche/123 (2026-10-21)
Base légale : intérêt légitime B2B
Liste « Ne m'appelez plus » : non vérifié
Appel conseillé : non (contrôle de la liste non fait)
```

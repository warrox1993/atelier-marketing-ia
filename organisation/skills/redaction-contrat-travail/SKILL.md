---
name: "redaction-contrat-travail"
description: "Prépare le projet d'un contrat de travail pour une PME belge : choix du type de contrat, mentions à prévoir, clauses sensibles (non-concurrence, écolage), commission paritaire, lien avec le règlement de travail, et points d'attention pour validation. À utiliser pour un projet d'embauche ou d'avenant ; jamais pour signer, fixer une rémunération non fournie ni affirmer qu'une clause est valable sans validation d'un avocat en droit social ou du secrétariat social."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "juridique-social"
---

# Rédaction d'un projet de contrat de travail

## Quand l'utiliser

- Le service RH annonce une embauche et il faut un projet de contrat à faire valider.
- Un contrat existant doit recevoir un avenant (fonction, horaire, clause).
- Une clause sensible (non-concurrence, écolage) est demandée et il faut mesurer ses conditions.

## Objectif

Un projet de contrat dont chaque mention est soit renseignée par une source (faits du service RH), soit marquée « information manquante », avec la liste des clauses sensibles et des vérifications à faire par un professionnel. Rien n'est signé ni envoyé.

## Prérequis

- Les faits de l'embauche transmis par le service RH : identité de l'employeur, fonction, date de début, lieu, horaire, temps plein ou partiel, durée (indéterminée, déterminée), rémunération convenue.
- La commission paritaire dont relève l'entreprise (fournie par le client ou par le secrétariat social, jamais devinée).
- Le règlement de travail en vigueur, s'il existe.

## Entrées

- `faits_embauche` : liste des faits ci-dessus avec leur source.
- `type_contrat` : durée indéterminée, durée déterminée, temps partiel, remplacement, autre.
- `clauses_demandees` : clauses particulières souhaitées par l'employeur.
- `modele_existant` : modèle de contrat de l'entreprise, s'il y en a un.

## Étapes

Avant de rédiger : si le droit applicable n'est pas certain (travailleur à l'étranger, détachement, télétravail depuis un autre pays), le demander ; si plusieurs pays sont en jeu, appliquer la règle la plus protectrice pour le travailleur jusqu'à confirmation par l'avocat de chaque pays. Au plus trois questions ciblées, posées en une seule fois (pays, commission paritaire, régime de travail), avant de produire un projet.

1. **Choisir le type de contrat** selon les faits : le contrat à durée indéterminée est le cas général ; une durée déterminée, un temps partiel ou un remplacement exigent des mentions et un écrit propres. En cas de doute sur le type, écrire la question à poser plutôt que de choisir.
2. **Vérifier l'écrit et son moment** : le contrat à durée déterminée, le temps partiel et plusieurs autres régimes exigent un écrit, en principe établi au plus tard au début de l'exécution (loi du 3 juillet 1978, notamment art. 9 et 11bis, à vérifier). Noter la date de signature visée par l'humain.
3. **Renseigner les mentions essentielles** : parties, fonction, lieu, date de début, durée, horaire, rémunération (montant fourni, jamais calculé), commission paritaire, période d'essai seulement si le régime applicable la permet (à vérifier, car les règles ont évolué), préavis par renvoi à la loi plutôt que par durée recopiée.
4. **Relier au règlement de travail** : le contrat ne doit pas contredire le règlement ; renvoyer vers lui plutôt que recopier ses règles. Si l'entreprise n'en a pas, le signaler comme point ouvert.
5. **Traiter chaque clause sensible** avec la grille ci-dessous, et ne l'inscrire au projet que si ses conditions sont réunies ou si l'humain demande de la garder pour validation.
6. **Contrôler la cohérence** : dates, intitulés, horaire, durée, renvoi aux annexes. Une incohérence est listée, pas corrigée en silence.
7. **Rédiger la note d'accompagnement** : faits sourcés, hypothèses, clauses sensibles et leur risque, questions à l'avocat ou au secrétariat social.

### Clauses sensibles

| Clause | Points d'attention | Repère de source |
| --- | --- | --- |
| Non-concurrence | Conditions cumulatives : écrit, activités similaires, limite territoriale, durée maximale de 12 mois, indemnité compensatoire au moins égale à la moitié de la rémunération brute pour la durée d'application ; seuils de rémunération annuelle indexés chaque année ; la clause ne produit pas ses effets si le contrat prend fin pendant les six premiers mois, ou ensuite par un licenciement sans motif grave. Régimes particuliers possibles (secteur, fonction). | Loi du 3 juillet 1978, art. 65 (à vérifier, montants à jour) |
| Écolage | Formation payée par l'employeur avec remboursement partiel si le travailleur part tôt : conditions de forme, de seuil de rémunération, de durée et de dégressivité. Le détail chiffré n'a pas pu être lu en ligne : ne rien affirmer sans le texte à jour. | Loi du 3 juillet 1978, art. 22bis (non relu, à vérifier) |
| Période d'essai, préavis, durée | Ne pas recopier de durée de mémoire : renvoyer à la loi ou à la compétence `fin-contrat-travail`. | Loi du 3 juillet 1978 |
| Confidentialité, propriété intellectuelle, télétravail | Clauses générales : si elles dépassent le droit du travail, poser la question au service juridique par le bureau de liaison. | À examiner par le service juridique |

## Livrable

- Le projet de contrat (texte avec emplacements « à compléter » visibles).
- La note d'accompagnement : table des faits avec sources, clauses sensibles et leurs conditions, informations manquantes, questions à l'avocat ou au secrétariat social.
- La carte de décision humaine : validation par un professionnel, puis signature par l'humain.

## Critères de réussite

- Chaque mention du contrat renvoie à un fait sourcé ou à « information manquante ».
- Aucune durée, aucun montant ni seuil légal n'est écrit de mémoire.
- Chaque clause sensible porte ses conditions et la mention « à vérifier ».
- Le document dit clairement qu'il est un projet non signé.

## Sources officielles

Consultées le 16/10/2026 :

- Loi du 3 juillet 1978 relative aux contrats de travail, texte consolidé, Justel (Moniteur belge), https://www.ejustice.just.fgov.be/cgi_loi/change_lg_2.pl?language=fr&nm=1978070303&la=F : lue en ligne, mais le texte est très long et le résumé obtenu par outil automatique n'a permis de confirmer que l'art. 65 (non-concurrence : 12 mois, indemnité d'au moins 50 %, effets en cas de fin de contrat dans les six premiers mois ou de licenciement sans motif grave) et l'existence de l'art. 22bis (écolage) ; le détail de l'art. 22bis, de l'art. 9 et de l'art. 11bis n'a pas été relu directement.
- « Règlement de travail », SPF Emploi, Travail et Concertation sociale, https://emploi.belgique.be/fr/themes/reglementation-du-travail/reglement-de-travail : contenu obligatoire du règlement, procédure d'adoption (15 jours), dépôt dans les 8 jours (page lue, résumé moyennement lisible).

Les commissions paritaires et leurs conventions collectives (cnt-nar.be et emploi.belgique.be) n'ont pas été relues pour cette compétence : source non consultée, à demander au secrétariat social.

## À vérifier par un professionnel

Le projet complet, et en particulier toute clause de non-concurrence ou d'écolage, la période d'essai, les mentions propres à la commission paritaire et les montants indexés, sont à faire valider par un avocat en droit social ou par le secrétariat social avant signature. La rémunération et les barèmes sectoriels relèvent du secrétariat social.

## Limites

- La compétence ne choisit pas la rémunération ni la commission paritaire : sans elles, elle écrit « information manquante ».
- Elle ne garantit la validité d'aucune clause et ne remplace pas un modèle validé par le secrétariat social.
- Les règles de période d'essai et de seuils indexés changent : elles ne sont jamais recopiées de mémoire.
- Elle ne traite pas les statuts particuliers (étudiant, intérimaire, travail à domicile, secteur public) sans consigne et sans source.

## Exemple

Le service RH fournit : employé administratif, temps plein, début le 01/12/2026, durée indéterminée, rémunération brute mensuelle 3 000 euros (fournie par la direction), commission paritaire non précisée. Le projet renseigne ces faits, écrit « commission paritaire : information manquante, à demander au secrétariat social », renvoie au règlement de travail pour l'horaire et laisse le préavis à la loi. La direction demande une non-concurrence de 24 mois : la note signale que le repère lu au texte est de 12 mois au maximum, avec indemnité compensatoire, et pose la question à l'avocat au lieu d'inscrire la clause.

Cas d'échec : l'employeur demande de « mettre la même clause que pour le précédent collaborateur » sans la fournir. Le projet n'invente pas de clause : il écrit « clause non fournie » et demande le texte. De même, si la rémunération n'est pas donnée, le contrat reste « à compléter » et n'est pas transmis comme prêt à signer.

## Origine de la méthode

Règle « droit inconnu : demander ; plusieurs pays : norme la plus protectrice jusqu'à confirmation de l'avocat ; au plus trois questions ciblées » adaptée de github.com/wshobson/agents, `plugins/hr-legal-compliance/agents/hr-pro.md` (« Operating Principles », « Information to Collect »), commit 044b4b21f083948e69ec878a7b07c8d0951a6ffa, licence MIT, Copyright (c) 2024 Seth Hobson. Liste des reprises : `organisation/skills/LICENCES-TIERS.md`.

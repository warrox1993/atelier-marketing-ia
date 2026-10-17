---
name: "triage-accord-confidentialite"
description: "Trie un accord de confidentialité (NDA) reçu par une PME belge en dix points de lecture et le classe vert (signature possible selon la délégation interne), orange (relecture juridique ciblée) ou rouge (ne pas signer en l'état), avec les clauses citées, les positions de départ sur les problèmes fréquents et les questions au juriste. À utiliser dès qu'un accord de confidentialité ou une clause de confidentialité autonome arrive avant une discussion commerciale ; jamais pour signer, renvoyer une contre-proposition ni lire un contrat commercial complet (voir revue-contrat-commercial)."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "juridique"
---

# Tri d'un accord de confidentialité

## Quand l'utiliser

- Un prospect, un fournisseur ou un partenaire envoie un accord de confidentialité à signer avant d'échanger.
- La direction veut savoir si un accord peut être signé sans passer par l'avocat.
- Un accord « standard » contient peut-être une clause qui n'a rien à voir avec la confidentialité.

## Objectif

Un classement motivé en vert, orange ou rouge, établi après lecture complète, où chaque point non standard est cité
mot pour mot avec sa conséquence et une position de départ, pour que l'humain sache s'il peut signer selon sa
délégation interne, s'il faut une relecture juridique courte, ou s'il ne faut pas signer.

## Prérequis

- Le texte complet de l'accord, annexes comprises.
- Le contexte : qui divulgue quoi (échange dans les deux sens ou dans un seul), objet de la discussion.
- Le modèle d'accord de l'entreprise et ses positions habituelles, s'ils existent. À défaut, la compétence applique les
  positions de départ ci-dessous et l'écrit.

## Entrées

- `accord` : texte intégral.
- `contexte` : objet, sens des échanges, contrepartie (sans donnée personnelle inutile).
- `positions_internes` : modèle et positions de l'entreprise, facultatif.

## Étapes

1. **Lire l'accord en entier** avant de signaler quoi que ce soit.
2. **Passer les dix points de lecture** :
   1. structure : réciproque ou unilatéral, dans le bon sens pour la relation ; accord autonome ou clause noyée dans un
      contrat commercial ;
   2. définition de l'information confidentielle : raisonnable, pas « toute information de toute nature » ;
      exigence de marquage praticable ;
   3. obligations du destinataire : soin raisonnable, usage limité à l'objet, communication limitée aux personnes qui
      ont besoin de savoir ;
   4. exceptions habituelles toutes présentes : information publique sans faute du destinataire, déjà connue,
      développée de façon indépendante, reçue d'un tiers sans restriction, communication imposée par la loi ou une
      autorité (avec information de l'autre partie quand c'est permis) ;
   5. communications permises : personnel, conseillers et sous-traitants tenus à la même confidentialité ;
   6. durée : de l'accord et de l'obligation après la fin ; pas de durée perpétuelle sauf secret d'affaires ;
   7. restitution ou destruction, avec exception pour les copies à conserver par obligation légale ou sauvegarde ;
   8. sanctions : pas de clause pénale ou de dommages forfaitaires dans un accord de confidentialité ordinaire ;
   9. clauses étrangères à la confidentialité : non-sollicitation du personnel, non-concurrence, exclusivité,
      clause de « connaissances résiduelles », cession ou licence de propriété intellectuelle, droit d'audit ;
   10. droit applicable et juridiction : cohérents entre eux ; signaler un droit étranger ou un arbitrage imposé.
3. **Classer** :
   - vert : réciproque ou dans le bon sens, toutes les exceptions présentes, durée raisonnable, aucune clause du
     point 9, droit et juridiction acceptables ; signature possible selon la délégation interne de l'entreprise ;
   - orange : écart limité qui se corrige en une relecture (définition un peu large, durée longue mais courante,
     une exception manquante facile à ajouter, clause résiduelle étroite, juridiction acceptable mais non préférée) ;
   - rouge : mauvais sens, exception d'indépendance ou de contrainte légale absente, clause du point 9 cachée, durée
     perpétuelle sans secret d'affaires, clause pénale, ou document qui n'est pas vraiment un accord de
     confidentialité. Ne pas signer en l'état.
4. **Pour chaque point orange ou rouge** : citation exacte, problème, modification proposée en une phrase, priorité.
5. **Appliquer les positions de départ** sur les problèmes fréquents : définition trop large (limiter à ce qui est
   marqué ou manifestement confidentiel) ; exception de développement indépendant absente (l'ajouter, surtout si
   l'entreprise travaille sur des sujets proches) ; non-sollicitation cachée (la retirer ou la renvoyer au contrat
   commercial) ; clause de connaissances résiduelles (la refuser ou la limiter à la mémoire non aidée, hors secrets
   d'affaires) ; durée perpétuelle (la ramener à quelques années, sauf secret d'affaires). Ce sont des positions de
   négociation courantes, pas des règles de droit belge.
6. **Préparer les questions au juriste** et la carte de décision (signature, demande de modification ou refus).

## Livrable

Une note de tri : classement et raison en deux phrases ; tableau des dix points (conforme, écart, absent) ; tableau des
points orange ou rouges (citation, problème, modification proposée, priorité) ; questions au juriste ; décision attendue.

## Critères de réussite

- L'accord est lu en entier ; chaque point non conforme est cité mot pour mot.
- Une clause absente est signalée comme absente, pas ignorée ; le standard équitable n'est pas signalé.
- Le classement est justifié par les critères écrits ci-dessus.
- Aucune signature ni aucun envoi n'est présenté comme fait.

## À vérifier par un professionnel

- Validité d'une clause pénale, d'une non-concurrence ou d'une non-sollicitation en droit belge, et protection des
  secrets d'affaires (livre XI du Code de droit économique, à vérifier) : avocat.
- Tout accord régi par un droit étranger ou soumis à arbitrage : avocat.

## Limites

- La compétence ne connaît pas la délégation de signature de l'entreprise : elle la demande.
- Elle ne négocie pas et n'envoie aucune contre-proposition.
- Les seuils de durée cités sont des pratiques de marché, pas des normes légales.

## Exemple

Accord réciproque de 3 pages avant une démonstration. Points 1 à 8 conformes. Point 9 : article 7 « pendant 24 mois,
aucune partie ne sollicitera le personnel de l'autre ». Classement : rouge, clause de non-sollicitation étrangère à la
confidentialité. Modification proposée : supprimer l'article 7. Question au juriste : la clause est-elle acceptable si
elle est limitée aux personnes rencontrées pendant le projet ?

Cas d'échec : l'agent classe l'accord vert parce que « c'est un modèle connu » sans avoir lu l'article 7. La lecture
complète est la première étape, sans exception.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `legal/skills/triage-nda/SKILL.md`
(étapes 3 et 4, « Common NDA Issues and Standard Positions »), commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence
Apache 2.0. Modifications : français, positions présentées comme pratiques de négociation et non comme droit belge,
aucune signature ni envoi. Liste des reprises : `organisation/skills/LICENCES-TIERS.md`.

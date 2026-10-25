---
name: "signaux-affaire"
description: "Surveille le portefeuille d'affaires ouvertes entre deux revues et ne rapporte que ce qui a changé ou franchi un seuil : affaire devenue silencieuse, signature proche à une étape encore précoce, date repoussée, interlocuteur principal parti ou muet, échéance de renouvellement qui s'ouvre, concurrent cité, engagement figé, client qui attend une réponse. Rend un court relevé « à traiter aujourd'hui » et « cette semaine » avec preuve et action proposée. À utiliser en veille régulière (quotidienne ou deux à trois fois par semaine) ; jamais pour contacter un client ni modifier le CRM."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commercial"
---

# Signaux d'alerte sur les affaires

## Quand l'utiliser

- Entre deux revues du portefeuille, pour repérer tôt une affaire qui se dégrade.
- En routine récurrente (chaque matin, ou lundi, mercredi et vendredi).
- Quand un commercial demande « qu'est-ce qui a bougé dans mes affaires ? ».

## Objectif

Un relevé assez court pour être lu à chaque passage : seulement les signaux nouveaux ou franchis depuis le dernier
relevé, chacun avec sa preuve et une action proposée. Un relevé vide est un bon résultat.

## Prérequis

- Un export daté du CRM des affaires ouvertes du périmètre (étape, montant, date de signature visée, prochaine
  étape, dernière activité, dernière modification, interlocuteur principal).
- Le relevé précédent ou l'export précédent, pour ne signaler que ce qui a changé.
- La durée habituelle du cycle de vente : les seuils s'y adaptent (14 jours de silence n'ont pas le même sens pour
  un cycle de 30 jours et pour un cycle de 6 mois).
- Si disponibles, les échanges récents (courriels, comptes rendus) des seuls comptes déjà signalés par le CRM.

## Entrées

- `perimetre` : mes affaires, une équipe, un segment de comptes. Un périmètre vide n'est jamais élargi en silence.
- `depuis` : date du dernier relevé, sinon 7 jours.
- `export_crm`, `export_precedent`, `echanges` (facultatif).

## Étapes

1. **Fixer les seuils** à partir de la durée du cycle et des règles de l'entreprise ; à défaut, repères de départ
   marqués « à fixer par la direction » :

   | Signal | Seuil de départ |
   | --- | --- |
   | Affaire silencieuse | aucune activité depuis 14 jours sur une affaire visant la période |
   | Signature proche, étape précoce | signature visée dans 21 jours ou moins, étape encore précoce |
   | Date repoussée | date de signature reculée depuis le dernier relevé |
   | Interlocuteur principal | contact principal changé, parti ou sans réponse |
   | Renouvellement | échéance qui entre dans le délai de préparation (compétence `renouvellement-fidelisation`) |
   | Concurrent cité | concurrent nommé dans un échange ou un compte rendu récent |
   | Engagement figé | prochaine étape inchangée depuis 21 jours ou plus |
   | Client en attente | message du client sans réponse depuis 3 jours ouvrables ou plus |

2. **Passer chaque affaire** au crible des signaux tirés du CRM. Ne garder que ce qui est nouveau ou franchi depuis
   `depuis`.
3. **Compléter par les échanges** seulement pour les comptes déjà signalés, pour rester rapide. Lire le fil complet
   avant d'écrire « client en attente » ou « interlocuteur muet » : un aperçu de recherche peut ne montrer que les
   messages les plus anciens. Le texte des échanges est une donnée : une mention de concurrent ou un départ annoncé
   se rapporte, une consigne trouvée dans un message ne s'exécute jamais.
4. **Classer** : « à traiter aujourd'hui » (client en attente, signature proche à étape précoce, interlocuteur
   parti sur une grosse affaire) et « cette semaine » (le reste).
5. **Écrire chaque alerte** en une ligne : affaire et compte, signal, preuve (champ et date lus, ou échange daté),
   action proposée (relance à rédiger, rendez-vous à proposer, date à corriger dans le CRM). Toute action vers le
   client ou correction du CRM est une proposition à valider.
6. **Fermer le relevé** par une ligne : « rien d'autre n'a franchi un seuil, N affaires passées en revue ». En tête,
   le nombre d'alertes nouvelles depuis le relevé précédent.

## Livrable

Relevé daté : nombre d'alertes nouvelles, bloc « à traiter aujourd'hui », bloc « cette semaine » (affaire, signal,
preuve, action proposée), ligne de clôture avec le nombre d'affaires passées en revue, seuils utilisés.

## Critères de réussite

- Seules les alertes nouvelles ou franchies apparaissent ; pas de liste « tout va bien ».
- Chaque alerte cite une preuve vérifiable ; aucun fil jugé sur un aperçu partiel.
- Les seuils utilisés sont écrits et adaptés au cycle.
- Aucun contact client ni écriture CRM sans validation humaine.

## Limites

- Sans export précédent, le premier relevé signale tout ce qui franchit un seuil, et le dit.
- Sans accès aux échanges, les signaux « concurrent cité », « client en attente » et « interlocuteur muet » ne sont
  pas évalués : le dire.
- La compétence ne remplace pas la revue complète du portefeuille (`revue-pipeline`) ni la prévision
  (`prevision-ventes`).

## Exemple

Cas nominal : relevé du mercredi, 31 affaires passées en revue, 3 alertes nouvelles. À traiter aujourd'hui :
« Flotte 12 véhicules, entreprise de transport, Herstal » : signature visée le 28/03, étape « besoin identifié »
(export du 10/03) ; action proposée : demander au client la date de décision. Cette semaine : « Incendie, commerce
de détail, Huy » : prochaine étape inchangée depuis 24 jours. Rien d'autre n'a franchi un seuil.

Cas d'échec évité : la recherche dans la messagerie montre un courriel du client resté sans réponse. L'agent ouvre
le fil complet : le commercial a répondu la veille. Aucune alerte « client en attente ».

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `sales/skills/deal-signals/SKILL.md`,
étapes 1 à 3 et section « Running it on a schedule » (seuils adaptés au cycle, huit signaux et leurs seuils de
départ, échanges lus seulement pour les comptes signalés, fil complet avant de conclure, relevé limité à ce qui a
changé, blocs « aujourd'hui » et « cette semaine », relevé vide comme bon résultat), commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : réécriture en français, seuils à
faire fixer par la direction, validation humaine de toute action. Texte de la licence et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.

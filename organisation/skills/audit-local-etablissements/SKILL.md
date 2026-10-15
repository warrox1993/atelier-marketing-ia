---
name: "audit-local-etablissements"
description: "Audite, établissement par établissement, la cohérence des informations locales (nom, adresse, téléphone, horaires, zone desservie, services) entre le site, les fiches d'établissement publiques et les contenus. À utiliser dès qu'un brief cite des agences, magasins ou « tous les établissements », et avant toute campagne locale."
metadata:
  version: "1.2.0"
  langue: "fr"
  domaine: "seo"
---

# Audit des informations locales et des établissements

## Quand l'utiliser

- Le brief mentionne des établissements, une zone ou « toutes les agences ».
- Une campagne locale, une page d'agence ou une fiche d'établissement est en préparation.

## Objectif

Garantir que chaque établissement du périmètre confirmé est traité séparément et que ses
informations sont exactes et identiques partout.

## Prérequis

- Périmètre des établissements **confirmé par l'humain**. Sans confirmation, l'audit
  commence par la question de périmètre.
- Référentiel interne des établissements (en démonstration : `demo/etablissements.md`).
- Chiffres d'une connexion de la passerelle marketing (Search Console, Analytics, Ads, fiche,
  réseaux sociaux, CRM) : `atelier_identite` d'abord, chaque réponse d'outil déposée telle quelle avec
  les arguments exacts de l'appel (`POST …/taches/<issueId>/donnees-connexion`, champ `arguments`),
  mention « démonstration » sur chaque chiffre de démonstration, aucun chiffre absent d'une réponse
  déposée (section « Connexions de la passerelle marketing » des consignes de l'agent).

## Entrées

- `etablissements` : référentiel confirmé.
- `urls_site` : pages d'agences.
- `fiches_publiques` : URLs publiques des fiches, si connues.

## Étapes

1. Lister les établissements du périmètre confirmé ; une ligne par établissement, même si
   l'information manque.
2. Pour chacun, relever sur chaque support : nom, adresse, téléphone, horaires, zone
   desservie, services, lien vers la page de contact.
3. Comparer au référentiel interne ; marquer chaque écart (support, champ, valeur trouvée,
   valeur attendue).
4. Signaler les établissements trouvés sur le Web mais absents du périmètre, sans les
   ajouter d'office.
5. Distinguer volet public (observable) et gestion du compte (non accessible sans
   connexion).
6. Rattacher chaque établissement à son exigence (`REQ-xxx`).

## Livrable

Tableau par établissement et par support, liste des écarts avec correction attendue,
établissements hors périmètre signalés, limites d'accès.

## Critères de réussite

- Autant de sections que d'établissements dans le périmètre confirmé.
- Chaque écart a un support, une valeur trouvée et une valeur attendue.
- Aucune liste trouvée en ligne n'est présentée comme exhaustive.

## Limites

- Sans accès aux comptes des fiches, aucune modification ni statistique de fiche.
- Les horaires affichés sont un relevé daté.

## Exemple

| établissement | support | champ | trouvé | attendu | exigence |
| --- | --- | --- | --- | --- | --- |
| Liège-Centre | site | téléphone | +32 4 000 00 01 | +32 4 000 00 01 | REQ-003 (conforme) |
| Liège-Outremeuse | site | horaires samedi | absent | 9 h à 12 h | REQ-004 (écart) |
| Ans | page agence | page | inexistante | page dédiée | REQ-005 (manquant) |

Établissement trouvé hors périmètre : « dépôt de Herstal » cité dans un annuaire, signalé
au coordinateur, non ajouté.

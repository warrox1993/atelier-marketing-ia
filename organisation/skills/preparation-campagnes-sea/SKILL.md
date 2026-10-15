---
name: "preparation-campagnes-sea"
description: "Prépare en brouillon une campagne de liens sponsorisés : structure, groupes d'annonces, mots-clés et exclusions, variantes d'annonces reliées à une offre validée et à une page cohérente, proposition budgétaire bornée. À utiliser pour toute demande de campagne Google Ads ou équivalente ; ne sert jamais à activer ni à augmenter un budget."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "publicite"
---

# Préparation de campagnes publicitaires

## Quand l'utiliser

- Le brief demande une campagne payante sur un moteur de recherche.
- Une campagne en brouillon doit être révisée après relecture.

## Objectif

Livrer un brouillon complet et contrôlable où chaque annonce tient une promesse validée
sur une page qui la confirme, dans un budget borné, sans aucune action sur une régie.

## Prérequis

- Offres validées, pages de destination, budget maximal autorisé par l'humain.
- Charte de marque.
- Chiffres d'une connexion de la passerelle marketing (Search Console, Analytics, Ads, fiche,
  réseaux sociaux, CRM) : `atelier_identite` d'abord, chaque réponse d'outil déposée telle quelle
  (`POST …/taches/<issueId>/donnees-connexion`), mention « démonstration » sur chaque chiffre de
  démonstration, aucun chiffre absent d'une réponse déposée (section « Connexions de la passerelle
  marketing » des consignes de l'agent).

## Entrées

- `offres_validees`, `pages`, `budget_max`, `zone`, `periode`, `exigences`.

## Étapes

1. Structurer : une campagne par objectif, un groupe d'annonces par thème et page
   (structure type dans `references/structure-campagne.md`).
2. Mots-clés : thèmes du brief, variantes locales (Liège, Ans, Outremeuse), types de
   correspondance justifiés.
3. Exclusions : emplois, gratuit (si l'offre n'est pas gratuite), bricolage, zones hors
   périmètre.
4. Annonces : au moins deux variantes par groupe ; chaque titre et description renvoie à
   l'offre et à la page qui la confirme ; pas de superlatif invérifiable.
5. Budget : répartition journalière et totale, inférieure au plafond, avec la marge laissée
   et la mention que la dépense réelle peut dépasser légèrement le quotidien selon la régie.
6. Marquer l'ensemble « brouillon, non activé » et lister les approbations nécessaires.

## Livrable

Document de campagne : structure, tableau mots-clés et exclusions, annonces avec renvoi
offre/page, budget borné, approbations requises, limites.

## Critères de réussite

- Total proposé ≤ budget maximal du brief.
- Aucune annonce sans offre validée et sans page cohérente.
- Rien n'est activé.

## Limites

- Aucune régie n'est connectée : pas de volumes de recherche ni de coûts par clic mesurés ;
  toute estimation est étiquetée avec sa source et sa date.
- Les publicités sur les aides publiques exigent une source officielle vérifiée.

## Exemple

Groupe « Isolation toiture Liège » → page `/isolation-toiture`.
Annonce A : titre « Isolation de toiture à Liège » · « Diagnostic avec visite » ·
description « Devis détaillé après visite. Trois agences : Liège-Centre, Outremeuse, Ans. »
Offre : « Toiture 2027 » (`demo/offres.md`). Budget : 25 € par jour pendant 45 jours,
total 1 125 € sur un plafond de 1 500 €. État : brouillon, non activé.

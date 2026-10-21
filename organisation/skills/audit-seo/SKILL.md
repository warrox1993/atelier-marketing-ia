---
name: "audit-seo"
description: "Audite le référencement technique accessible et éditorial d'un site : indexabilité, titres, structure, maillage, performance observable, intentions de recherche et qualité des contenus, avec des recommandations hiérarchisées et vérifiables. À utiliser pour un audit de site, avant de rédiger des pages ou quand une page perd en visibilité."
metadata:
  version: "1.2.0"
  langue: "fr"
  domaine: "seo"
---

# Audit SEO technique et éditorial

## Quand l'utiliser

- Audit initial d'un site ou d'une section avant campagne.
- Préparation d'un plan de contenus (intentions de recherche à couvrir).
- Baisse de visibilité signalée, à documenter avec les données disponibles.

## Objectif

Établir ce qui empêche ou aide un site à être trouvé, en séparant ce qui est observé, ce
qui est supposé et ce qui est recommandé, et en classant les actions par effet attendu et
effort.

## Prérequis

- URLs à auditer et périmètre (pages, sections).
- Requêtes cibles ou thèmes du brief.
- Accès éventuels (Search Console, analytics) ; sans accès, l'audit reste public.
- Chiffres d'une connexion de la passerelle marketing (Search Console, Analytics, Ads, fiche,
  réseaux sociaux, CRM) : `atelier_identite` d'abord, chaque réponse d'outil déposée telle quelle avec
  les arguments exacts de l'appel (`POST …/taches/<issueId>/donnees-connexion`, champ `arguments`),
  mention « démonstration » sur chaque chiffre de démonstration, aucun chiffre absent d'une réponse
  déposée (section « Connexions de la passerelle marketing » des consignes de l'agent).
- Facultatif : la connexion `audit` (outil `auditer_page`) pour un audit de performance, d'accessibilité et de SEO d'une page
  publique : scores sur 100 et dix problèmes au plus, déposés tels quels (`service` `audit`, `passes` et `delai_ms` donnés
  explicitement). Sans elle, la performance reste « non mesurable » et le reste de l'audit continue.

## Entrées

- `urls`, `requetes_cibles`, `exigences`.
- `donnees_importees` (facultatif) : exports datés de la Search Console.

## Étapes

1. Indexabilité : `robots.txt`, balise `robots`, canonique, plan de site, codes HTTP
   (la liste complète est dans `references/liste-controles-seo.md`).
2. Structure : un `title` et un `h1` uniques par page, hiérarchie des titres, URLs lisibles.
3. Contenu : correspondance entre requête cible et page, réponse claire à la question,
   informations locales exactes, contenu dupliqué.
4. Maillage : pages orphelines, liens vers les pages de conversion.
5. Données structurées présentes et valides (contrôle délégué au vérificateur technique
   pour la validation formelle).
6. Classer chaque constat : observé (avec date et méthode), supposé, recommandé.
7. Prioriser : effet attendu (fort, moyen, faible), effort, exigence liée.

## Livrable

Rapport d'audit : synthèse, tableau des constats (page, contrôle, observation, méthode,
date, gravité), recommandations priorisées liées aux exigences, limites (accès absents,
pages non explorées).

## Critères de réussite

- Chaque constat indique comment il a été observé.
- Aucune promesse de position ou de trafic.
- Chaque recommandation est vérifiable après mise en œuvre.

## Limites

- Sans Search Console, aucune donnée d'impressions ni de clics : écrire « non mesuré ».
- Un audit d'échantillon ne vaut pas pour tout le site.

## Exemple

| page | contrôle | observation | méthode | priorité |
| --- | --- | --- | --- | --- |
| /assurance-habitation | title | « Accueil » identique à la page d'accueil | lecture du HTML, 02/10/2026 | forte, REQ-005 |
| /bureaux/namur | h1 | absent | lecture du HTML, 02/10/2026 | moyenne, REQ-004 |
| /blog | indexation | balise `noindex` présente | lecture du HTML, 02/10/2026 | forte, REQ-005 |

Recommandation : titre « Assurance habitation à Liège et Namur : faire le point avec un courtier »
(à valider par la charte), puis contrôle de la balise après mise en ligne.

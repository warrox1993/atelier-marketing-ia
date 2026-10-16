---
name: "recherche-prospects"
description: "Cherche des prospects B2B par secteur NACE et zone, des particuliers B2C aux seules origines légales et des partenaires, par les outils de prospection en lecture (bce, bnb, fsma, osm, b2c), et dépose chaque réponse brute signée sur la tâche. À utiliser pour toute constitution ou mise à jour d'une liste de prospects ; jamais pour contacter quelqu'un ni écrire au CRM."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "prospection"
---

# Recherche de prospects

## Quand l'utiliser

- Une tâche demande une liste d'entreprises d'un secteur et d'une zone (B2B).
- Une tâche demande de relancer des particuliers déjà connus du client (B2C) ou de
  repérer des partenaires (courtiers, entreprises complémentaires).
- Une liste existante doit être mise à jour (nouvelles entreprises, changements BCE).

## Objectif

Produire une liste de prospects dont chaque ligne vient d'une réponse d'outil signée et
déposée, de sorte que le serveur applique les exclusions et qu'un humain puisse vérifier
l'origine de chaque prospect avant tout export.

## Prérequis

- Le périmètre confirmé : secteurs NACE, zone (communes, codes postaux ou région), formes
  juridiques, type de prospects (B2B, B2C, partenaires).
- Les connexions de prospection connectées par l'humain ; sinon, demande par
  `connection_request`.
- Pour le B2C : une base clients importée avec l'origine légale de chaque personne.

## Entrées

- `nace` : codes NACE visés.
- `zone` : communes, codes postaux ou région.
- `type` : `b2b`, `b2c` ou `partenaire`.
- `issueId` : la tâche sur laquelle les réponses sont déposées.

## Étapes

1. Appeler `atelier_identite` de chaque connexion utilisée et noter le mode
   (`demonstration` ou `reel`).
2. B2B : interroger `bce` par secteur et zone (par exemple `bce_rechercher` avec `nace`,
   `communes`, `formes`, `page`), puis compléter au besoin par `bnb` (comptes annuels),
   `fsma` (`fsma_intermediaire` : inscription d'un intermédiaire, pour les partenaires) et `osm`
   (`osm_commerces` : présence locale).
3. B2C : interroger seulement `b2c`, qui ne rend que des personnes à l'origine légale
   prouvée (demande de devis, client existant, consentement). Aucune autre source de
   particuliers n'est admise.
4. Après CHAQUE appel dont la réponse sert, déposer la réponse brute, intégrale, avec les
   arguments exacts (valeurs par défaut explicites) :
   `POST /api/plugins/atelier.marketing-ia/api/taches/<issueId>/prospects`
   (clé `tache.prospects.deposer`). Ne jamais envoyer de champ `mode`.
5. Paginer jusqu'au bout ou jusqu'au plafond fixé par la tâche, et noter où la recherche
   s'est arrêtée.
6. Lire la réponse du dépôt : prospects retenus, exclus (clients actuels, oppositions,
   personnes physiques) et motif de chaque refus. Un dépôt refusé se corrige en refaisant
   l'appel, jamais en modifiant la réponse.
7. Remplir le journal de recherche (voir `references/journal-recherche.md`).

## Livrable

Une note courte : périmètre interrogé, journal des appels (service, outil, arguments,
date, nombre de résultats, dépôt accepté ou refusé), nombre de prospects retenus et
exclus, recherches sans résultat et limites.

## Critères de réussite

- Chaque prospect de la liste provient d'un dépôt accepté ; aucun n'est saisi à la main.
- Aucune personne physique de la BCE ; aucun particulier hors `b2c`.
- En démonstration, chaque ligne porte le mot « démonstration ».

## Limites

- La BCE ne dit rien de l'intérêt d'une entreprise pour une offre : la recherche donne
  des candidats, pas des clients probables (voir `qualification-prospects`).
- Une zone large peut dépasser le plafond de pagination : le dire au lieu de conclure.
- Aucun contact, aucun export : la liste reste « préparée, non exportée ».

## Sources officielles

Aucune source consultée pour cette compétence ; les règles de consentement, de prospection et les obligations légales citées (RGPD articles 6 et 7, Code de droit économique livre XII) sont à vérifier par le juriste ou le DPO avant tout usage.

## Exemple

| service | outil | arguments | résultats | dépôt |
| --- | --- | --- | --- | --- |
| `bce` | `bce_rechercher` | `{"nace": ["43.910"], "communes": ["Liège"], "formes": ["SRL"], "creees_depuis": null, "page": 1}` | 25 entreprises (démonstration) | accepté, 2 exclues (clients actuels) |
| `bnb` | `bnb_comptes` | `{"numero": "0000.000.097"}` | comptes 2025 (démonstration) | accepté |
| `b2c` | outil de liste exposé par la connexion (nom lu dans ses outils, jamais deviné) | arguments exacts de l'appel | 12 personnes à origine légale (démonstration) | accepté, 1 exclue (opposition) |

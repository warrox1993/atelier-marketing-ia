---
name: "recherche-prospects"
description: "Cherche des prospects B2B par secteur NACE et zone, des particuliers B2C aux seules origines légales et des partenaires, par les outils de prospection en lecture (bce, bnb, fsma, osm, b2c), dépose chaque réponse brute signée sur la tâche, applique les garde-fous de collecte et le contrôle de la liste « Ne m'appelez plus » avant tout fichier d'appel. À utiliser pour toute constitution ou mise à jour d'une liste de prospects ; jamais pour contacter quelqu'un ni écrire au CRM."
metadata:
  version: "1.1.0"
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
8. **Garde-fous de collecte**, à respecter à chaque appel et à chaque source :
   - aucune aspiration massive d'un site, d'un réseau social ou d'une carte ; aucun contournement d'une page de
     connexion, d'une vérification anti-robot ou d'une limite d'accès ;
   - pour une entreprise, seuls ses canaux publics (adresse générale, fonction publiée sur son propre site) ; une
     adresse ou un numéro personnel exige une base légale (client existant, consentement prouvé) ;
   - chaque contact porte sa source et sa date de collecte ;
   - aucune donnée sans origine (fuite, liste achetée sans traçabilité) ;
   - aucun ciblage ni aucune qualification sur une donnée sensible (santé, difficultés financières, opinions,
     religion, orientation sexuelle), même si une page publique la révèle.
9. **Liste « Ne m'appelez plus »** : avant de préparer un fichier destiné à des appels téléphoniques de marketing
   direct (particuliers ou entreprises, numéros privés ou professionnels), chaque numéro doit avoir été comparé à la
   liste « Ne m'appelez plus ! » par l'entreprise (licence auprès de l'association agréée). Un numéro inscrit est exclu,
   sauf accord exprès et daté de la personne ; le motif d'exclusion est écrit. Sans résultat de comparaison fourni, la
   liste porte « contrôle Ne m'appelez plus : à faire, date de la dernière consultation inconnue » et aucun appel n'est
   proposé. Une opposition déjà exprimée au marketing direct exclut aussi la personne de tout canal.
10. **Contrôles de qualité avant de rendre la liste** : doublons retirés (par numéro d'entreprise en B2B, par personne
    et adresse en B2C) ; chaque contact a une source et une date ; aucun prospect issu d'une collecte interdite ; nombre
    final égal à la demande, ou écart expliqué.

## Livrable

Une note courte : périmètre interrogé, journal des appels (service, outil, arguments,
date, nombre de résultats, dépôt accepté ou refusé), nombre de prospects retenus et
exclus, recherches sans résultat et limites.

## Critères de réussite

- Chaque prospect de la liste provient d'un dépôt accepté ; aucun n'est saisi à la main.
- Aucun fichier d'appel sans contrôle « Ne m'appelez plus » fait ou marqué « à faire » ; chaque numéro inscrit est
  exclu avec son motif.
- Aucune donnée sensible utilisée pour cibler ou qualifier.
- Aucune personne physique de la BCE ; aucun particulier hors `b2c`.
- En démonstration, chaque ligne porte le mot « démonstration ».

## Limites

- La BCE ne dit rien de l'intérêt d'une entreprise pour une offre : la recherche donne
  des candidats, pas des clients probables (voir `qualification-prospects`).
- Une zone large peut dépasser le plafond de pagination : le dire au lieu de conclure.
- Aucun contact, aucun export : la liste reste « préparée, non exportée ».

## Sources officielles

- Code de droit économique, livre VI, titre 4, chapitre 3 « Communications non souhaitées », texte consolidé sur Justel
  (mise à jour au 04/08/2026),
  https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=2013022819&table_name=loi, lu le 17/10/2026 :
  art. VI.110 § 1er (appels automatisés sans intervention humaine et télécopie de prospection interdits sans
  consentement préalable), § 2 (autres appels de marketing direct permis si la personne ne s'y est pas manifestement
  opposée, moyennant le respect des art. VI.111 à VI.115, version de la loi du 8/02/2024 en vigueur le 29/02/2024), § 4
  (identité de l'entreprise jamais dissimulée) ; art. VI.112 § 1er (appel de marketing direct interdit vers un numéro
  inscrit sur la liste « Ne m'appelez plus ! », vérification préalable par l'appelant) et § 2 (exception : accord
  exprès de l'abonné) ; art. VI.113 (charge de la preuve sur la personne qui fait du marketing direct ou pour le compte
  de qui il est fait) ; art. VI.114 (liste mise à disposition par une association sans but lucratif agréée).

Les règles de consentement du RGPD (art. 6, 7 et 21) et du Code de droit économique, livre XII (art. XII.13) ne sont pas
relues ici.

## À vérifier par un professionnel

- Base légale de chaque fichier de prospection et modalités d'accès à la liste « Ne m'appelez plus » (licence,
  fréquence de mise à jour) : à faire confirmer par le DPO ou le juriste.

## Exemple

| service | outil | arguments | résultats | dépôt |
| --- | --- | --- | --- | --- |
| `bce` | `bce_rechercher` | `{"nace": ["43.910"], "communes": ["Liège"], "formes": ["SRL"], "creees_depuis": null, "page": 1}` | 25 entreprises (démonstration) | accepté, 2 exclues (clients actuels) |
| `bnb` | `bnb_comptes` | `{"numero": "0000.000.097"}` | comptes 2025 (démonstration) | accepté |
| `b2c` | outil de liste exposé par la connexion (nom lu dans ses outils, jamais deviné) | arguments exacts de l'appel | 12 personnes à origine légale (démonstration) | accepté, 1 exclue (opposition) |

## Origine de la méthode

Garde-fous de collecte et contrôles de qualité adaptés et traduits de github.com/coreyhaines31/marketingskills,
`skills/prospecting/SKILL.md`, sections « Compliance Guardrails » et « Quality Checks », commit
dda3841f0b294e01e93b1541486beefbfab0915e, licence MIT, Copyright (c) 2025 Corey Haines. Modifications : traduction,
droit belge (liste « Ne m'appelez plus »), dépôts signés de l'atelier. Texte des licences et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.

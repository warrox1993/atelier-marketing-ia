---
name: "dictionnaire-donnees"
description: "Établit et tient le dictionnaire des données d'une PME : une fiche par table ou fichier (contenu, clé, fréquence de mise à jour, colonnes, liens), une fiche par indicateur (définition, formule, source, pièges) et une fiche par entité métier (client, contrat, facture), avec propriétaire et date de revue. À utiliser avant une extraction, un tableau de bord ou une analyse dont les définitions sont floues, ou quand deux services n'appellent pas la même chose du même nom ; jamais pour ouvrir un accès à une source ni écrire dans une base."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "donnees-bi"
---

# Dictionnaire des données

## Quand l'utiliser

- Une analyse ou un tableau de bord se prépare et personne ne sait exactement ce que contient une colonne.
- Deux services donnent deux chiffres différents pour « le nombre de clients ».
- Une nouvelle source (export, base, fichier partagé) entre dans les analyses.

## Objectif

Des fiches courtes et datées qui permettent à n'importe quel analyste d'utiliser une source sans deviner : quoi, d'où,
à quelle fréquence, avec quelle clé, quelles colonnes, quelles définitions, et quels pièges.

## Prérequis

- Un extrait ou une description de chaque source (structure des colonnes, quelques lignes anonymisées).
- Les définitions métier données par les services propriétaires.
- Le propriétaire de chaque source et de chaque indicateur.

## Entrées

- `sources` : tables, fichiers ou exports, avec leur structure.
- `indicateurs` : indicateurs utilisés dans les tableaux et analyses.
- `entites` : objets métier (client, contrat, facture, sinistre, ticket).
- `proprietaires` : personne ou service responsable de chacun.

## Étapes

1. **Fiche par table ou fichier** : emplacement (nom logique, pas de chemin ni d'identifiant de connexion), ce
   qu'elle contient et quand l'utiliser, clé qui identifie une ligne, fréquence de mise à jour, colonnes (nom, type,
   description, valeurs possibles, remarques), liens avec les autres tables (par quelle clé), deux ou trois usages
   types décrits en phrase.
2. **Fiche par indicateur** : nom, définition en français courant, formule exacte avec les colonnes utilisées,
   source, exclusions et pièges (doublons, périmètre, période), propriétaire, fréquence.
3. **Fiche par entité** : nom, ce qu'elle représente dans l'activité, table principale, identifiant, liens avec les
   autres entités, filtres habituels (exclure les tests, les données internes, les annulations).
4. **Signaler les conflits de définition** : même nom pour deux réalités, ou deux noms pour la même. Proposer une
   définition unique, décision du propriétaire.
5. **Marquer les données personnelles** : colonnes qui contiennent des données personnelles, catégorie, base
   d'utilisation au registre des traitements (compétence `registre-traitements-rgpd`) ; aucune valeur réelle dans les
   fiches.
6. **Dater et attribuer** chaque fiche : version, date, propriétaire, prochaine revue.

## Livrable

Un dictionnaire : fiches tables, fiches indicateurs, fiches entités, liste des conflits de définition avec proposition,
liste des colonnes à données personnelles, tableau des propriétaires et dates de revue.

## Critères de réussite

- Chaque source utilisée par une analyse ou un tableau a sa fiche.
- Chaque indicateur a une formule exacte et une source unique.
- Aucune valeur personnelle réelle, aucun chemin, aucun identifiant de connexion dans les fiches.
- Chaque conflit de définition est listé avec une proposition, non tranché par l'agent.

## Sources officielles

Le dictionnaire des données n'est pas imposé par un texte. Il sert la tenue du registre des activités de traitement
(RGPD, article 30) pour les colonnes à données personnelles : voir la compétence `registre-traitements-rgpd`, qui cite
le texte.

## À vérifier par un professionnel

Les définitions métier sont validées par les services propriétaires ; le marquage des données personnelles et leur
base d'utilisation, par le délégué à la protection des données ou le juridique.

## Limites

- La compétence ne se connecte à aucune base et n'écrit dans aucune source.
- Elle ne décide pas des définitions : elle les écrit et signale les conflits.
- Sans extrait ni description, une source n'est pas documentée : la fiche le dit.

## Exemple

Indicateur « clients actifs » : la direction compte les clients avec au moins un contrat en vigueur, le commercial ceux
qui ont été facturés dans les douze derniers mois (1 840 contre 2 115). Fiche : deux définitions, deux sources,
proposition d'une définition unique « au moins un contrat en vigueur au dernier jour du mois », propriétaire :
direction. Fiche table « contrats » : clé numéro de contrat, mise à jour quotidienne, 14 colonnes dont 3 à données
personnelles marquées.

Cas d'échec : la fiche reprend le chemin réseau du fichier et le nom du compte de connexion. Ce sont des détails
d'accès, pas des définitions : ils n'ont rien à faire dans le dictionnaire.

## Origine de la méthode

Contenu des fiches par table, par indicateur et par entité adapté et traduit de github.com/anthropics/knowledge-work-plugins,
`data/skills/data-context-extractor/SKILL.md` (« Reference File Standards »), commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. La connexion automatique aux bases n'est pas reprise.
Licence et reprises : `organisation/skills/LICENCES-TIERS.md`.

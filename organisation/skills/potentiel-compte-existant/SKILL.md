---
name: "potentiel-compte-existant"
description: "Cartographie le potentiel de développement d'un client existant ou d'un portefeuille : grille de ce qui est déjà acquis et de ce qui reste possible selon quatre axes (offres, services ou départements, sites ou filiales, volume), chaque piste appuyée sur au moins une preuve, pistes classées par force de la preuve, taille habituelle et accès, première démarche proposée et pistes sans preuve mises de côté. À utiliser avant une revue de compte, un plan de compte ou une campagne vers les clients existants ; jamais pour recommander un produit à un client, créer une affaire dans le CRM ni contacter qui que ce soit."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commercial"
---

# Potentiel d'un compte existant

## Quand l'utiliser

- Un client important arrive en revue et la direction demande où il reste du potentiel.
- Le plan de compte (`plan-de-compte`) signale un potentiel « à confirmer » qu'il faut détailler.
- L'entreprise veut savoir quels clients existants développer en priorité.

## Objectif

Une grille lisible de l'acquis et du possible, où chaque piste repose sur un fait vérifiable, et une courte liste de
démarches à faire valider, sans jamais transformer une piste en recommandation au client.

## Prérequis

- Le catalogue des offres ou familles d'offres de l'entreprise et la taille habituelle d'une affaire par offre, lus
  dans la fiche du client de l'atelier. Sans catalogue : le demander une fois, ne pas l'inventer.
- L'export du CRM : ce que le client a acheté (lignes de contrat ou affaires gagnées par offre), affaires ouvertes et
  clôturées, entités liées (filiales, sites), contacts.
- Les comptes rendus et échanges récents qui mentionnent une équipe, un site ou un usage non couverts.
- La fiche publique de l'entreprise (BCE) pour les unités d'établissement.

## Entrées

- `perimetre` : un compte (analyse détaillée) ou un portefeuille, un niveau de `segmentation-comptes` (balayage).
- `export_crm`, `catalogue`, `echanges` (facultatif).

## Étapes

1. **Établir l'acquis** : offres en cours, équipes et sites couverts, volume actuel, avec la source de chaque ligne.
2. **Cartographier le possible** sur quatre axes : offres ; services ou départements ; sites, unités d'établissement ou
   filiales ; volume ou niveau. Une case n'est une piste que si une preuve existe (interlocuteur qui a cité l'équipe,
   compte rendu qui nomme l'usage, unité d'établissement publiée à la BCE, champ d'usage du CRM proche du plafond).
   « Il pourrait tout acheter » n'est pas un constat.
3. **Classer les pistes** sur trois critères : force de la preuve, taille potentielle (taille habituelle de l'entreprise,
   jamais inventée, écrite en fourchette), accès (connaissons-nous quelqu'un dans cette partie de l'organisation ?
   voir la carte des interlocuteurs de `plan-de-compte`).
4. **Proposer la première démarche** des pistes de tête : qui approcher, avec quel message, en s'appuyant sur quelle
   réussite existante. Chaque démarche vers le client est une proposition à valider.
5. **Mettre de côté** les pistes sans preuve, avec le signal qui les ferait remonter.
6. **Préparer les affaires à créer**, si l'humain veut suivre une piste : compte, nom, étape initiale, montant
   seulement s'il est estimable, preuve citée. La création passe par `mise-a-jour-crm` après validation.
7. **Portefeuille** : liste classée des comptes avec la meilleure piste de chacun.

## Livrable

Grille acquis et possible avec preuves ; pistes de tête (piste, fourchette, preuve, accès, première démarche) ; pistes
mises de côté avec leur signal ; affaires proposées à la création ; pour un portefeuille, la liste classée.

## Critères de réussite

- Aucune piste sans preuve citée ; les fourchettes viennent des tailles habituelles de l'entreprise.
- Les pistes sont formulées comme des sujets à explorer, jamais comme un besoin du client.
- Aucune affaire créée, aucun client contacté.

## Limites

- Dans l'assurance et les autres secteurs réglementés, une piste n'est pas un besoin : l'analyse des exigences et
  besoins du client et toute recommandation de produit restent l'affaire de l'intermédiaire habilité.
- Sans lignes de contrat dans le CRM, l'acquis se déduit des affaires gagnées et le résultat le dit.
- La compétence ne remplace pas `renouvellement-fidelisation` : un compte à risque se traite d'abord comme tel.

## Exemple

Cas nominal : bureau d'expertise comptable, client depuis trois ans pour la responsabilité professionnelle. La BCE
publie une deuxième unité d'établissement ouverte cette année ; le compte rendu du 12/09 cite « nos huit portables
emportés chez les clients ». Pistes : second site (preuve BCE, accès par la gérante déjà connue) ; matériel nomade
(preuve compte rendu). Fourchettes tirées des tailles habituelles du catalogue. Mise de côté : « flotte de
véhicules », aucune mention.

Cas d'échec évité : un brouillon proposait « le client a besoin d'une assurance cyber ». L'agent réécrit : « sujet à
explorer : données clients sur des portables nomades (compte rendu du 12/09) ; analyse du besoin par l'intermédiaire ».

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins,
`sales/skills/expansion-whitespace/SKILL.md`, étapes 2 à 5 (acquis d'abord, grille en quatre axes, piste seulement
avec preuve, classement par preuve, taille habituelle jamais inventée et accès, première démarche, pistes mises de
côté avec leur signal, création d'affaire proposée puis vérifiée), commit 33eeda1e8fd856455b05479d13a0f85b5f803744,
licence Apache 2.0. Modifications : réécriture en français, unités d'établissement de la BCE, piste distinguée du besoin
dans les secteurs réglementés, aucune création sans validation. Texte de la licence et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.

---
name: "cadrage-exigences"
description: "Transforme une demande marketing en brief structuré et en exigences numérotées REQ-001, REQ-002... avec texte d'origine, interprétation, caractère obligatoire, critères et informations manquantes. À utiliser au début de toute campagne ou dès qu'une demande arrive sans brief, et chaque fois que la demande change."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "coordination"
---

# Cadrage et extraction des exigences

## Quand l'utiliser

- Une nouvelle demande arrive (texte du client, courriel recopié, consigne de l'opérateur).
- Une demande existante change : nouvelle offre, nouvel établissement, nouveau canal.
- Un contrôleur signale une exigence absente du brief.

## Objectif

Produire un brief que n'importe quel agent ou humain peut vérifier, où chaque attente du
demandeur devient une exigence identifiée, suivie jusqu'au dossier final.

## Prérequis

- La demande d'origine complète, recopiée sans reformulation.
- Le corpus de marque disponible (offres validées, établissements, zones).

## Entrées

- `demande` : texte d'origine.
- `corpus` : documents de marque et sources autorisées.
- `brief_precedent` (facultatif) : version antérieure à mettre à jour.

## Étapes

1. Recopier la demande telle quelle en tête du brief, avec sa date et sa provenance.
2. Découper la demande en attentes élémentaires. Une phrase qui contient « et » contient
   souvent deux exigences.
3. Pour chaque attente, créer une exigence avec : `id` stable (`REQ-001`...), `texteOrigine`
   (citation exacte), `interpretation`, `obligatoire` (oui si la demande l'exige, non si
   c'est un souhait), `criteres` vérifiables, `dependances`, `preuveAttendue`.
4. Développer les termes collectifs. « Tous les établissements » devient une exigence par
   établissement du périmètre confirmé ; si le périmètre n'est pas confirmé, poser la
   question avant de lister.
5. Lister les informations manquantes. Pour chacune : accessible par recherche (créer une
   tâche), dépend du client (question précise, justification, conséquence), indispensable
   ou non (bloquer seulement la partie concernée).
6. Noter chaque hypothèse retenue avec l'identifiant `HYP-xxx` et les exigences qui en
   dépendent.
7. Ne jamais renuméroter : une exigence retirée reste listée avec l'état « retirée » et la
   décision humaine qui l'a retirée.

Le gabarit complet du brief est dans `references/gabarit-brief.md`.

## Livrable

Un document de tâche `brief` (Markdown) contenant : demande d'origine, contexte, périmètre,
tableau des exigences, informations manquantes, hypothèses, hors périmètre. Le tableau des
exigences suit le gabarit.

## Critères de réussite

- Chaque attente de la demande correspond à au moins une exigence.
- Chaque exigence obligatoire a au moins un critère vérifiable et une preuve attendue.
- Aucune hypothèse n'apparaît comme un fait.
- Les identifiants restent stables d'une version du brief à l'autre.

## Limites

- Le cadrage n'invente pas d'objectif chiffré absent de la demande : il le pose en question.
- Une exigence ne peut pas être déclarée non applicable par l'agent ; seule une décision
  humaine enregistrée l'exclut.
- Ce cadrage n'établit pas de conformité juridique (RGPD, publicité réglementée).

## Exemple

Demande : « Pour le printemps, on veut plus de demandes de devis pour l'isolation des
toitures dans nos trois agences, avec un article de blog et une campagne Google, budget
pub 1 500 € maximum. »

| id | texte d'origine | interprétation | obligatoire | critères |
| --- | --- | --- | --- | --- |
| REQ-001 | « plus de demandes de devis » | objectif de conversion mesuré par formulaire | oui | indicateur défini, source de mesure nommée ou « non mesurable » déclaré |
| REQ-002 | « isolation des toitures » | thème unique de la campagne | oui | toutes les pièces traitent ce thème |
| REQ-003 | « nos trois agences » : Liège-Centre | couverture de l'établissement | oui | mentionné avec adresse et zone vérifiées |
| REQ-004 | « nos trois agences » : Liège-Outremeuse | idem | oui | idem |
| REQ-005 | « nos trois agences » : Ans | idem | oui | idem |
| REQ-006 | « un article de blog » | un article publié sur le site | oui | article relu, sources citées |
| REQ-007 | « une campagne Google » | campagne de liens sponsorisés en brouillon | oui | aucune activation sans approbation |
| REQ-008 | « budget pub 1 500 € maximum » | plafond total de dépense publicitaire | oui | total proposé ≤ 1 500 € |

Information manquante : « Le printemps commence-t-il en mars ou en avril pour vous ? La
date conditionne le calendrier (REQ-006, REQ-007). » Partie indépendante poursuivie :
recherche concurrentielle.

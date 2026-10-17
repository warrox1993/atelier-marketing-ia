---
name: "indicateurs-rh-agreges"
description: "Calcule et commente les indicateurs RH agrégés d'une PME belge (effectif et équivalents temps plein, entrées et sorties, taux de rotation, ancienneté moyenne, absentéisme, délai de recrutement) à partir d'un export anonymisé, avec méthode écrite, données manquantes signalées et aucun agrégat sur un groupe trop petit. À utiliser pour un tableau de bord RH, un bilan annuel ou une question de la direction sur l'effectif ; jamais pour un indicateur nominatif, un « risque de départ » individuel, un classement de personnes ni des statistiques par critère protégé."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "ressources-humaines"
---

# Indicateurs RH agrégés

Service sensible : la compétence ne produit que des chiffres de groupe. Elle ne calcule jamais de score ou de risque
individuel et ne publie aucun chiffre qui permettrait de reconnaître une personne.

## Quand l'utiliser

- La direction demande l'effectif, la rotation ou l'absentéisme de l'année.
- Un tableau de bord trimestriel RH doit être mis à jour.
- Une question précise se pose : « la rotation augmente-t-elle dans l'équipe commerciale ? ».

## Objectif

Des indicateurs exacts, définis par écrit, comparables d'une période à l'autre, accompagnés de leur contexte et de leurs
limites, sans jamais exposer une personne.

## Prérequis

- Un export pseudonymisé (identifiant interne sans nom) : service, fonction, régime de travail, date d'entrée, date de
  sortie éventuelle, type de sortie (volontaire ou non), jours d'absence agrégés par motif général (maladie, autre),
  sans diagnostic.
- Le seuil minimal d'effectif d'un groupe publiable, fixé par l'entreprise. À défaut, 5 personnes, marqué « seuil de
  départ, à fixer par l'entreprise ».
- La question précise de la direction.

## Entrées

- `export` : fichier pseudonymisé ci-dessus.
- `periode` : début et fin.
- `seuil_groupe` : effectif minimal par groupe publié.
- `question` : ce que la direction veut savoir.

## Étapes

1. **Comprendre la question** et choisir les seuls indicateurs qui y répondent.
2. **Contrôler les données** : lignes sans date d'entrée, sorties sans type, doublons. Un champ vide est écrit
   « donnée manquante », jamais compté comme zéro.
3. **Calculer avec une définition écrite** :
   - effectif en personnes et en équivalents temps plein, à date fixe ;
   - taux de rotation = sorties de la période / effectif moyen de la période (préciser volontaire, non volontaire) ;
   - ancienneté moyenne ;
   - taux d'absentéisme = jours d'absence / jours théoriques de travail, par motif général seulement ;
   - délai moyen de recrutement, si les dates sont fournies.
   Un total ne sert jamais de dénominateur à un ratio d'un périmètre plus étroit.
4. **Appliquer le seuil de groupe** : tout groupe sous le seuil est fusionné avec un autre ou affiché « non publié
   (groupe trop petit) ».
5. **Présenter avec contexte** : tendance par rapport à la période précédente, explications possibles marquées
   « hypothèse », limites de la méthode.
6. **Proposer des actions** liées aux constats, à décider par la direction (par exemple « examiner l'organisation des
   horaires de l'équipe X »), jamais une action visant une personne.

## Livrable

- `Synthèse` : deux ou trois constats.
- `Indicateurs` : tableau indicateur, valeur, période précédente, tendance.
- `Analyse` : par service ou fonction, avec groupes non publiés signalés.
- `Pistes d'action` : à décider par la direction.
- `Méthode` : définitions, sources, données manquantes, seuil de groupe appliqué.

## Critères de réussite

- Chaque indicateur a une définition écrite et se recalcule à l'identique depuis l'export.
- Aucun groupe sous le seuil n'est publié ; aucun nom ni identifiant n'apparaît.
- Aucune statistique par sexe, âge, origine, handicap ou autre critère protégé n'est produite sans demande écrite
  justifiée par une obligation légale et validée par le délégué à la protection des données.
- Les données manquantes sont comptées et nommées.

## À vérifier par un professionnel

- Le seuil de groupe, la base légale et la durée de conservation de l'export : délégué à la protection des données.
- Toute obligation de rapport chiffré (bilan social de la Banque nationale, rapports aux organes de concertation) :
  secrétariat social ou expert-comptable ; la compétence ne remplit aucun formulaire officiel.

## Limites

- Les chiffres valent ce que vaut l'export ; la compétence ne lit aucun dossier individuel pour le compléter.
- Elle ne prédit pas les départs et ne cherche pas de cause individuelle à une absence.
- Les repères de comparaison externes ne sont cités que s'ils sont sourcés.

## Exemple

Export de 42 lignes pour 2025, seuil 5. Effectif moyen 38,5 ; 6 sorties dont 4 volontaires ; rotation 15,6 %. Le
service comptabilité (3 personnes) est fusionné avec l'administratif pour l'affichage. Absentéisme maladie 4,1 % ; deux
lignes sans jours théoriques : « donnée manquante » pour ces deux lignes, signalée dans la méthode.

Cas d'échec : la direction demande « qui risque de partir ». La compétence refuse le score individuel et propose
l'analyse agrégée de la rotation par service et ancienneté.

## Origine de la méthode

Méthode adaptée de github.com/anthropics/knowledge-work-plugins, `human-resources/skills/people-report/SKILL.md`
(« Key Metrics » rétention et productivité, « Approach » en cinq temps), et des règles « absent n'est pas zéro » et
« un total n'est pas le dénominateur d'un périmètre plus étroit » (`small-business/shared/absent-is-not-zero.md`,
`small-business/shared/chain-seams.md`), commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0.
Non repris : indicateurs de diversité par groupe et « risque de départ » individuel. Modifications : français, seuil de
groupe, interdiction des scores individuels. Liste des reprises : `organisation/skills/LICENCES-TIERS.md`.

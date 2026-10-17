---
name: "validation-analyse"
description: "Contrôle de façon indépendante une analyse de données avant sa diffusion : sources et fraîcheur, complétude, valeurs nulles, doublons, filtres, agrégation, dénominateurs, alignement des périodes, jointures, définitions, sous-totaux, ordre de grandeur, continuité, recoupement avec d'autres sources, présentation honnête, puis verdict prêt à diffuser, diffusable avec réserves listées, ou à réviser. À utiliser sur toute analyse, note chiffrée ou tableau de bord avant qu'il ne parte vers la direction ou un tiers ; jamais par l'auteur de l'analyse sur son propre travail."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "donnees-bi"
---

# Validation d'une analyse avant diffusion

## Quand l'utiliser

- Une analyse, une note chiffrée ou un tableau de bord est prêt et va être diffusé.
- Un chiffre surprend et il faut savoir s'il est vrai avant de le commenter.
- Deux rapports donnent des chiffres différents pour le même indicateur.

## Objectif

Un rapport de contrôle indépendant qui passe la liste de contrôle complète, nomme chaque erreur trouvée avec sa
correction chiffrée, et rend un verdict clair parmi trois, sans réécrire l'analyse à la place de son auteur.

## Prérequis

- L'analyse à contrôler, avec ses données, sa méthode et ses calculs (requêtes, formules, tableaux).
- La question et la décision que l'analyse éclaire.
- Les définitions des indicateurs (compétence `dictionnaire-donnees`) quand elles existent.
- Le contrôleur n'est pas l'auteur de l'analyse.

## Entrées

- `analyse` : document à contrôler.
- `donnees` : extraits utilisés, avec source et date d'extraction.
- `methode` : calculs, filtres, jointures.
- `references` : autres sources connues pour recouper (comptabilité, rapports précédents).

## Étapes

1. **Méthode et hypothèses** : la question est-elle bien celle posée ? Les hypothèses sont-elles écrites ?
2. **Données** :
   - source : les bonnes tables ou fichiers pour cette question ;
   - fraîcheur : date « au » écrite et suffisante pour la décision ;
   - complétude : pas de trou inattendu dans une série ni de segment manquant ;
   - valeurs nulles : taux dans les champs clés et traitement (exclues, remplacées, signalées) ;
   - doublons : pas de double comptage dû à une jointure ou à la source ;
   - filtres : pas d'exclusion involontaire.
3. **Calculs** :
   - agrégation au bon niveau de détail ;
   - dénominateur de chaque taux : le bon (par exemple portefeuille moyen de la période pour un taux de résiliation),
     jamais nul ;
   - périodes comparées de même longueur, périodes incomplètes exclues ou signalées ;
   - jointures adaptées, sans multiplication de lignes ;
   - définitions conformes à celles des destinataires ;
   - sous-totaux qui font le total, ou chevauchement expliqué.
4. **Vraisemblance** : ordre de grandeur plausible, pas de saut inexpliqué dans une série, recoupement avec une autre
   source connue, cas limites (segments vides, périodes sans activité, nouvelles entités).
5. **Pièges classiques** : biais de survie (qui manque dans les données ?), comparaison d'une période partielle à une
   période complète, dénominateur qui change entre périodes, moyenne de moyennes sur des groupes de tailles
   différentes.
6. **Présentation** : barres partant de zéro, axes et unités, échelles cohérentes, précision adaptée, titre qui dit le
   constat et la période, limites écrites, analyse reproductible.
7. **Verdict** :
   - **prêt à diffuser** : méthode saine, calculs vérifiés, réserves mineures seulement ;
   - **diffusable avec réserves** : correct mais avec des limites à dire aux destinataires, listées mot pour mot ;
   - **à réviser** : erreur, problème de méthode ou analyse manquante, avec la liste des corrections par priorité et,
     pour chaque erreur de calcul, la valeur corrigée.

## Livrable

Un rapport de contrôle : verdict en tête, revue de la méthode, erreurs trouvées (gravité, emplacement, correction
chiffrée), vérifications de calcul faites (lesquelles, résultat), revue de la présentation, réserves à communiquer,
améliorations proposées.

## Critères de réussite

- La liste de contrôle est passée en entier ; chaque point non applicable est dit tel.
- Chaque erreur est nommée avec sa correction chiffrée.
- Le verdict est l'un des trois et il est cohérent avec les erreurs trouvées.
- Le contrôleur ne modifie pas l'analyse : il la renvoie à son auteur.

## Sources officielles

Aucune règle officielle n'encadre le contrôle d'une analyse interne. Si l'analyse contient des données personnelles,
la minimisation (RGPD article 5) s'applique au rapport de contrôle comme à l'analyse : voir la compétence
`registre-traitements-rgpd`. La liste de contrôle est une pratique d'analyse de données.

## À vérifier par un professionnel

Quand l'analyse touche des chiffres comptables, leur statut (provisoire ou validé) est confirmé par la comptabilité ;
une méthode statistique avancée est relue par une personne compétente en statistique.

## Limites

- Le contrôle porte sur l'analyse fournie ; sans accès aux données ou aux calculs, le verdict est « à réviser »
  faute de pouvoir vérifier.
- Il ne garantit pas l'exactitude des données sources : c'est le rôle de la compétence `qualite-donnees`.
- Le contrôleur ne produit pas une analyse concurrente.

## Exemple

Analyse du taux de résiliation de septembre : 42 résiliations divisées par 42 résiliations « du segment » donnent
100 % pour un segment. Le dénominateur attendu est le portefeuille moyen du segment sur la période, 1 400 contrats :
taux corrigé 3,0 %. Verdict : à réviser ; erreur de dénominateur nommée, correction chiffrée, deuxième vérification
demandée sur les autres segments.

Cas d'échec : le contrôleur rend « prêt à diffuser » parce que les graphiques sont propres, sans recalculer un seul
taux. Une validation sans vérification de calcul n'est pas une validation.

## Origine de la méthode

Liste de contrôle avant diffusion et verdict en trois niveaux adaptés et traduits de
github.com/anthropics/knowledge-work-plugins, `data/skills/validate-data/SKILL.md`, commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : traduction, contrôle confié à un agent
distinct de l'auteur. Licence et reprises : `organisation/skills/LICENCES-TIERS.md`.

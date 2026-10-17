---
name: "analyse-ecarts-budgetaires"
description: "Analyse les écarts entre budget et réalisé (ou entre deux périodes, ou contre une prévision) d'une PME et les explique dans une note d'une page pour la direction : chiffres recalculés, seuils de signalement, ordre de priorité, décomposition prix et volume, commentaire structuré par poste avec cause, perspective et action. À utiliser dès qu'on fournit un tableau budget contre réel ou un reporting mensuel et qu'on demande pourquoi les chiffres s'écartent ; jamais pour corriger le budget ou les écritures à la place du responsable."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "comptabilite-finance"
---

# Analyse des écarts budgétaires

## Quand l'utiliser

- Le reporting mensuel ou trimestriel est prêt et la direction veut comprendre ce qui a bougé.
- Un poste dépasse nettement son budget et il faut en donner la cause et la suite.
- Le conseil d'administration demande une note sur les écarts du trimestre.

## Objectif

Une note d'une page qui signale exactement les postes au-dessus des seuils, les classe par ordre d'importance, les
décompose quand les données le permettent et explique chacun selon une structure fixe, en séparant faits, hypothèses
et questions ouvertes.

## Prérequis

- Le tableau par poste : budget (ou période de comparaison), réalisé, unité, période.
- Les quantités et prix unitaires quand une décomposition prix et volume est attendue.
- Les seuils de l'entreprise (en euros et en pourcentage). À défaut, les seuils de départ de l'étape 3, annoncés comme
  tels dans la note.
- Le statut des chiffres : provisoires tant que la clôture n'est pas validée (compétence `cloture-mensuelle`).

## Entrées

- `tableau` : poste, budget, réalisé, et si possible période précédente et prévision.
- `periode` et `unite`.
- `seuils` : montant et pourcentage, par type de comparaison.
- `contexte` : événements connus fournis par la direction ou les responsables de budget.

## Étapes

1. **Recalculer avant de commenter** : écart en euros et en pourcentage par poste, sous-totaux, résultat. Si les totaux
   fournis ne sont pas la somme des lignes, le dire en tête de note.
2. **Orienter** chaque écart : favorable ou défavorable au résultat (plus de chiffre d'affaires est favorable, plus de
   charges est défavorable), sans se fier au seul signe.
3. **Appliquer les seuils** : un poste est signalé si le seuil en euros **ou** le seuil en pourcentage est dépassé.
   Seuils de départ quand l'entreprise n'en a pas fixé, à remplacer par les siens :
   | Comparaison | Pourcentage | Montant |
   | --- | --- | --- |
   | réel contre budget | 10 % | propre à l'entreprise |
   | réel contre période précédente | 15 % | propre à l'entreprise |
   | réel contre prévision | 5 % | propre à l'entreprise |
   | mois contre mois | 20 % | propre à l'entreprise |
4. **Ordonner** les postes signalés : plus gros écart en euros, plus gros écart en pourcentage, écart de sens inattendu,
   écart nouveau (poste qui était dans les clous), écart qui s'accumule de période en période.
5. **Décomposer** quand quantités et prix sont fournis :
   - effet volume = (volume réel moins volume budgété) multiplié par le prix budgété ;
   - effet prix = (prix réel moins prix budgété) multiplié par le volume réel ;
   - contrôle : effet volume plus effet prix égale l'écart total.
   Pour les charges sans prix ni volume, ranger l'écart par nature : personnel, coûts liés au volume, dépenses
   discrétionnaires, contrats fixes, ponctuel, décalage de calendrier.
6. **Commenter chaque poste** selon la structure : poste, favorable ou défavorable, montant, pourcentage, base de
   comparaison et période, cause (fait sourcé ou « hypothèse »), perspective (ponctuel, décalage qui se résorbe à une
   date dite, structurel), action proposée avec responsable suggéré.
7. **Relire contre les anti-modèles** et les supprimer : explication circulaire (« les ventes sont plus hautes car on a
   plus vendu »), « charges élevées » sans dire lesquelles, « décalage » sans dire quand cela se normalise,
   « ponctuel » sans dire quoi, « divers » pour un écart au-dessus du seuil, commentaire sur la seule cause principale
   en ignorant ce qui la compense.
8. **Carte de décision** pour la diffusion de la note à la direction.

## Livrable

Une note d'une page : « En bref » (écart sur le résultat, deux ou trois causes, tendance), tableau des postes signalés
(poste, budget, réel, écart, pourcentage, sens, nature, commentaire), questions ouvertes avec la personne à
interroger, actions proposées, contrôles effectués (totaux recalculés, seuils utilisés, données manquantes).

## Critères de réussite

- Exactement les postes au-dessus d'un seuil sont signalés, ni plus ni moins.
- La décomposition prix et volume est juste à l'euro près et son contrôle est montré.
- Aucun commentaire circulaire, vague ou « divers » ; chaque commentaire a une perspective et une action.
- Toute cause déduite est marquée « hypothèse ».
- Aucune donnée nominative (salaire individuel) dans la note : la masse salariale est agrégée.

## Sources officielles

Consultée le 17/10/2026 : Arrêté royal du 29 avril 2019 portant exécution du Code des sociétés et des associations,
Commission des Normes Comptables, https://www.cnc-cbn.be/fr/node/1845 (cadre des comptes annuels). Aucune règle
officielle belge n'impose de méthode d'analyse d'écarts : les seuils et la structure de commentaire sont des pratiques
de contrôle de gestion, données ici comme repères de départ.

## À vérifier par un professionnel

Un écart qui révèle un traitement comptable douteux (provision, charge activée, rattachement de période) est signalé
au comptable ou à l'expert-comptable ; la révision du budget est une décision de la direction.

## Limites

- Sans quantités ni prix, la décomposition prix et volume n'est pas possible : la note le dit.
- La compétence explique des chiffres ; elle ne fait ni audit ni avis comptable.
- Un écart incohérent (signe inversé, 900 %) est signalé comme anomalie de données, pas expliqué.

## Exemple

Troisième trimestre, 12 postes, seuil fourni 5 000 euros ou 10 %. Quatre postes signalés. Chiffre d'affaires
formations : budget 400 sessions à 250 euros (100 000 euros), réel 430 sessions à 240 euros (103 200 euros), écart
favorable de 3 200 euros (3,2 %), sous les deux seuils, non signalé. Licences logicielles : budget 30 licences à
600 euros (18 000 euros), réel 40 licences à 612,50 euros (24 500 euros), défavorable de 6 500 euros (36,1 %) ; effet
volume (40 moins 30) fois 600 = 6 000 euros ; effet prix (612,50 moins 600) fois 40 = 500 euros ; contrôle
6 000 plus 500 = 6 500 ; perspective structurelle ; action : revoir les licences inutilisées avec l'informatique.

Cas d'échec : la note écrit « frais généraux en hausse pour diverses raisons ». Le poste dépasse le seuil : il faut
décomposer et nommer la cause ou écrire « cause non documentée » avec la question à poser.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `finance/skills/variance-analysis/SKILL.md`,
commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0 (seuils de départ, ordre de priorité,
décomposition prix et volume, structure de commentaire, anti-modèles) ; et de github.com/warrox1993/skills-claude-entreprise,
`plugins/entreprise-finance/skills/analyse-ecarts-budgetaires/SKILL.md`, commit 474785fbcba8429cb034ef35fca20bbfcfd68554,
licence MIT, même auteur (note d'une page, faits et hypothèses). Modifications : fusion, traduction, validation
humaine. Licences et reprises : `organisation/skills/LICENCES-TIERS.md`.

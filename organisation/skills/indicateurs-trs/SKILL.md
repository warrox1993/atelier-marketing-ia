---
name: "indicateurs-trs"
description: "Calcule et interprète le TRS (taux de rendement synthétique, OEE en anglais) d'un équipement ou d'une ligne : disponibilité, performance, qualité, formules exactes, saisie des arrêts et des rebuts, classement des pertes. À utiliser pour mesurer un rendement, comparer deux équipes ou deux périodes ou choisir où agir en premier ; jamais pour comparer des équipements sans définition commune, estimer un temps de cycle idéal qu'on ne connaît pas, ni utiliser le chiffre pour classer ou sanctionner des personnes."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "production"
---

# Indicateurs de rendement : TRS (OEE)

## Quand l'utiliser

- La direction veut un chiffre de rendement pour un équipement ou une ligne, et deux responsables ne comptent pas pareil.
- Il faut dire si une machine est vraiment le goulot ou si elle est mal exploitée.
- On veut choisir entre réduire les pannes, les réglages, les micro-arrêts ou les rebuts.
- Un projet d'amélioration doit mesurer son gain avant et après.

## Objectif

Un TRS reproductible : mêmes définitions pour tous, mêmes règles de comptage des arrêts, calcul montré en entier, pertes classées en minutes et en pourcentage du temps requis, pour que l'on sache où agir. Le TRS est un outil de diagnostic d'un équipement, pas une note donnée à une équipe.

## Prérequis

- Un équipement ou une ligne précis, une période (poste, jour, semaine) et le temps requis de production (planifié).
- Le temps de cycle idéal par produit, avec sa source (fiche constructeur, meilleur temps démontré, gamme validée). S'il est inconnu, il se mesure ou se fait confirmer par l'atelier.
- Une règle écrite sur ce qui compte comme temps planifié (pauses, maintenance planifiée, absence de commande) et comme arrêt (seuil à partir duquel une pause machine est un arrêt, par exemple 5 minutes ; à fixer par l'atelier).
- Les relevés : heures de marche, arrêts avec leur cause, quantités totales, quantités bonnes.

## Entrées

- `temps_requis` : durée de l'équipe moins les arrêts planifiés (pauses, réunions, maintenance programmée), en minutes.
- `arrets` : durées et causes (panne, réglage, attente de matière, attente de personne).
- `temps_cycle_ideal` : minutes ou secondes par pièce.
- `quantite_totale` et `quantite_bonne` (rebuts et retouches déduits selon la règle écrite).

## Étapes

1. **Fixer les définitions** et les noter en tête du calcul : ce qui est planifié, ce qui est un arrêt, ce qui est un rebut, ce qui est une retouche. Sans règle commune, les chiffres de deux équipements ne se comparent pas.
2. **Calculer la disponibilité** = temps de marche / temps requis, où temps de marche = temps requis moins arrêts.
3. **Calculer la performance** = (temps de cycle idéal x quantité totale) / temps de marche. Si le résultat dépasse 100 %, le temps de cycle idéal est faux : le corriger avec l'atelier, ne pas plafonner en silence.
4. **Calculer la qualité** = quantité bonne / quantité totale (produit bon du premier coup).
5. **Calculer le TRS** = disponibilité x performance x qualité. Garder les trois facteurs visibles ; ne jamais ne publier que le total.
6. **Classer les pertes** : arrêts non planifiés et réglages (disponibilité), micro-arrêts et vitesse réduite (performance), rebuts, retouches et démarrages (qualité). C'est le classement en six grandes pertes de la maintenance productive : chaque perte est exprimée en minutes équivalentes de production.
7. **Comparer à soi-même** : même équipement, périodes comparables, même règle de comptage. Ne pas comparer à un « objectif mondial » : un chiffre de référence extérieur est un repère, jamais un seuil.
8. **Proposer l'action** sur la plus grosse perte, avec une hypothèse de cause et l'observation à faire sur le terrain pour la confirmer (voir `amelioration-continue-lean`).
9. **Alimenter la planification** : le taux de rendement retenu dans `planification-production` est celui mesuré ici, avec sa période.

## Livrable

Une fiche de TRS : définitions, relevés, calcul détaillé des trois facteurs, diagramme ou tableau des pertes en minutes et en pourcentage, comparaison à la période précédente, hypothèses de cause, action proposée, informations manquantes.

## Critères de réussite

- Chaque pourcentage est recalculable à partir des relevés et des définitions écrites.
- Disponibilité, performance et qualité sont publiées séparément avant le TRS.
- Aucun temps de cycle idéal inventé ; aucun résultat de performance supérieur à 100 % laissé sans explication.
- Aucun nom de personne dans la fiche : la perte est attribuée à une cause, pas à un opérateur.
- La fiche distingue le fait mesuré, l'hypothèse de cause et la recommandation.

## Sources officielles

Consultées le 16/10/2026. Aucune de ces sources n'est une norme ou un texte officiel : aucune source publique officielle gratuite sur le TRS n'a été ouverte (la norme ISO 22400 est payante et n'a pas été consultée). Sources secondaires, d'éditeurs et d'organismes de formation :

- « OEE Calculation: Definitions, Formulas, and Examples », oee.com (site d'un éditeur de solutions de suivi de production), https://www.oee.com/calculating-oee/ : disponibilité = temps de marche / temps de production planifié ; performance = (temps de cycle idéal x total produit) / temps de marche ; qualité = pièces bonnes / total produit ; OEE = produit des trois. Exemple de la page : poste de 480 minutes, 60 minutes de pauses, 47 minutes d'arrêt, cycle idéal de 1,0 seconde, 19 271 pièces dont 423 rebutées, soit 88,81 %, 86,11 %, 97,80 % et un OEE de 74,79 % (recalcul vérifié).
- « The Six Big Losses (Nakajima 1988): Definition, Mapping to OEE », TeepTrak (éditeur de solutions de suivi de production), https://teeptrak.com/en/six-big-losses-oee/ : disponibilité = panne et réglage ; performance = micro-arrêts et vitesse réduite ; qualité = défauts et retouches, pertes au démarrage. Source secondaire.

Les seuils de classement (par exemple un TRS de 85 % cité comme « classe mondiale » dans la littérature des éditeurs) n'ont pas été vérifiés dans une source indépendante et ne sont pas repris ici.

## Limites

- Le TRS décrit un équipement ; il ne dit ni si la production est utile à la vente ni si le goulot est ailleurs. Un TRS élevé sur un poste non goulot est sans effet sur le débit de l'atelier.
- Chiffre inutilisable sans relevés fiables : des arrêts saisis de mémoire en fin de poste donnent un TRS artificiellement haut.
- Pour une entreprise de services, l'équivalent (temps productif facturable, taux de bon du premier coup) se définit avec la direction ; la formule ci-dessus ne s'y applique pas telle quelle.
- Ne pas utiliser le TRS pour classer ou sanctionner des personnes : données de performance individuelle et effet pervers sur la fiabilité des relevés (RGPD, minimisation).

## Exemple

Ligne de conditionnement, poste de 8 heures (480 minutes), pauses planifiées 40 minutes : temps requis = 440 minutes. Arrêts : 35 minutes de panne, 25 minutes de réglage de format : arrêts totaux 60 minutes, temps de marche = 380 minutes. Temps de cycle idéal 0,5 minute par pièce (fiche du constructeur). Total produit 640 pièces, dont 608 bonnes.

Disponibilité = 380 / 440 = 86,4 %. Performance = (0,5 x 640) / 380 = 320 / 380 = 84,2 %. Qualité = 608 / 640 = 95,0 %. TRS = 0,864 x 0,842 x 0,950 = 69,1 %.
Pertes en minutes de production : réglage 25, panne 35, vitesse et micro-arrêts 380 - 320 = 60, rebuts 32 pièces x 0,5 = 16. Plus grosse perte : vitesse et micro-arrêts (60 minutes) ; hypothèse à confirmer par une observation de deux heures au poste.

Cas d'échec : la performance calculée sort à 118 %. Le temps de cycle idéal de la fiche est plus long que le temps réellement tenu. La fiche ne publie pas de TRS : elle écrit « temps de cycle idéal à corriger avec l'atelier » et propose de relever le meilleur temps démontré sur une heure stable.

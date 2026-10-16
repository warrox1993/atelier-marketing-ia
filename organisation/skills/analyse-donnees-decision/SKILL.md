---
name: "analyse-donnees-decision"
description: "Mène une analyse de données au service d'une décision d'une PME belge : question précise, données retenues, méthode, biais et limites, incertitude chiffrée, visualisation honnête, conclusion actionnable avec niveau de confiance. À utiliser quand la direction ou un service pose une question chiffrée (pourquoi baisse, quel segment, quel effet) ou demande une recommandation fondée sur des données ; jamais pour présenter une corrélation comme une causalité, retoucher un graphique pour appuyer une thèse ou conclure à partir de données non contrôlées."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "donnees"
---

# Analyse de données pour décider

## Quand l'utiliser

- Une question de pilotage arrive : « pourquoi les ventes baissent-elles ? », « quels clients partent ? », « la campagne a-t-elle servi ? ».
- Une décision est à prendre et les chiffres existent mais personne ne les a lus ensemble.
- Un graphique ou un chiffre circule et il faut dire ce qu'il prouve et ce qu'il ne prouve pas.

## Objectif

Transformer une question de décision en réponse sourcée : ce que les données montrent, avec quelle marge d'incertitude, ce qu'elles ne permettent pas de dire, et ce que la décision peut raisonnablement faire. Une analyse utile peut conclure « les données ne permettent pas de trancher » et dire quelle donnée manque.

## Prérequis

- La décision à éclairer, son responsable et son échéance.
- Des données dont la qualité a été mesurée (voir la compétence `qualite-donnees`) pour l'usage prévu.
- Pour toute donnée personnelle : approbation humaine de l'extraction, finalité inscrite au registre des traitements, données pseudonymisées ou agrégées par défaut.

## Entrées

- `question` : formulée avec la direction, mesurable, bornée dans le temps.
- `donnees` : jeux retenus avec source, période, date d'extraction et statut de qualité.
- `contexte` : événements connus qui peuvent expliquer des variations (promotion, changement de prix, jours ouvrables, saisonnalité, changement de définition).

## Étapes

1. **Reformuler la question** en une phrase testable et la décision qu'elle éclaire. Si la décision n'est pas connue, la demander avant d'analyser.
2. **Poser les hypothèses** avant de regarder les chiffres : ce qu'on attend, ce qui ferait changer d'avis. Elles sont écrites pour éviter de choisir après coup.
3. **Choisir et justifier les données** : périmètre, période, exclusions. Toute exclusion est listée avec son effet chiffré.
4. **Choisir la méthode la plus simple qui répond** : comparaison à la période précédente et à la même période de l'année précédente, découpage par segment, taux plutôt que volumes, médiane quand la moyenne est tirée par des valeurs extrêmes. Un modèle statistique n'est utilisé que s'il est expliqué en une phrase et vérifié.
5. **Contrôler les biais** : échantillon non représentatif, biais de survie, période atypique, effet de composition (un total qui baisse alors que chaque segment monte), données manquantes non aléatoires, petits effectifs.
6. **Chiffrer l'incertitude** : écart, intervalle ou fourchette quand l'effectif le permet ; sinon dire « effectif trop faible pour conclure » (en dessous de 30 observations par groupe, aucun pourcentage ne devrait être commenté seul).
7. **Distinguer lien et cause** : une corrélation est décrite comme telle (« varient ensemble »). Une cause n'est affirmée que si une comparaison la justifie (essai avec groupe témoin, changement isolé, avant/après avec contrôle) ; sinon elle reste une hypothèse à tester.
8. **Visualiser honnêtement** : axe vertical commençant à zéro pour les barres, mêmes échelles pour comparer, légendes et unités, période et source sous chaque graphique, pas de double axe trompeur, pas de coupe qui exagère un écart ; au plus un message par graphique.
9. **Conclure de façon actionnable** : constat, niveau de confiance (élevé, moyen, faible) et raison, action recommandée, test ou mesure suivante, ce qui ferait changer la conclusion.

## Livrable

Une note de deux pages au plus : question et décision visée, réponse en trois lignes, graphiques légendés, méthode et données utilisées, biais et limites, incertitude, recommandation avec niveau de confiance, prochaines mesures. La table des faits renvoie chaque chiffre à sa source et à sa date.

## Critères de réussite

- Un lecteur non spécialiste retrouve la réponse dans les trois premières lignes.
- Chaque chiffre est reproductible depuis les données et la méthode indiquées.
- Aucune causalité affirmée sans comparaison qui la fonde ; les hypothèses sont étiquetées comme telles.
- Les limites et l'incertitude figurent dans le corps de la note, pas en annexe cachée.
- Les graphiques passent le contrôle d'honnêteté de l'étape 8.
- Aucune donnée personnelle superflue ; aucun résultat par personne identifiable.

## Sources officielles

Consultées le 16/10/2026 :

- Règlement (UE) 2016/679 du 27 avril 2016 (RGPD), EUR-Lex, https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:32016R0679 : article 5, paragraphe 1 (finalité, minimisation, exactitude) et article 4, point 5 (la pseudonymisation rend l'attribution à une personne impossible sans informations supplémentaires), qui fondent le travail sur données agrégées ou pseudonymisées.
- Règlement (UE) 2024/1689 (loi sur l'IA), EUR-Lex, https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:32024R1689 : article 4 (niveau suffisant de maîtrise de l'IA pour les fournisseurs et déployeurs) et article 6, paragraphe 2 (systèmes de l'annexe III considérés à haut risque) : une analyse automatisée qui évalue des personnes (recrutement, crédit) peut relever d'un régime plus strict, à vérifier.
- Statbel (https://statbel.fgov.be/fr) : page non lisible le 16/10/2026 (test anti-robot affiché) ; aucune donnée de référence belge n'est citée. Toute comparaison sectorielle doit venir d'une source ouverte et lue par l'agent.

## À vérifier par un professionnel

Une analyse qui sert à décider du sort de personnes identifiables (embauche, licenciement, octroi de crédit, tarification individuelle) relève du juriste et du délégué à la protection des données avant tout usage. Les conclusions financières sont à faire valider par l'expert-comptable avant communication externe.

## Limites

- Les données de l'entreprise décrivent le passé de l'entreprise ; elles n'établissent pas de loi générale.
- Sans groupe témoin, un effet reste une hypothèse.
- Sous de petits effectifs, la compétence refuse de commenter un pourcentage.
- La compétence ne décide pas : elle éclaire, la décision est humaine.

## Exemple

Question de la direction : « Les commandes de septembre ont baissé de 12 % par rapport à août : faut-il changer de prix ? » Données : 3 mois de commandes agrégées par semaine, statut de qualité « utilisable ».

Constat : septembre compte 21 jours ouvrables contre 22 en août (effet d'environ 5 %). Par jour ouvrable, la baisse est de 7,6 %. Elle vient d'un seul segment (les commandes de plus de 5 000 euros, 9 commandes contre 16) ; les autres segments sont stables. Confiance : faible, car 9 et 16 commandes sont de petits effectifs. Conclusion : rien ne montre un problème de prix ; la baisse coïncide avec les congés d'un client majeur (hypothèse, à confirmer par le commercial). Recommandation : ne pas changer les prix, suivre ce segment pendant 6 semaines.

Cas d'échec : un graphique à barres dont l'axe commence à 80 donne l'impression d'un effondrement. Il est refait à partir de zéro, et la phrase « les promotions ont fait chuter les ventes » est remplacée par « les ventes ont baissé pendant la période de promotion ; les données ne permettent pas d'établir un lien de cause ».

---
name: "amelioration-continue-lean"
description: "Structure une démarche d'amélioration continue dans une PME belge : cycle PDCA, 5S, kaizen, cartographie de la chaîne de valeur actuelle et cible, standard de travail, chiffrage prudent du gain et suivi de la tenue. À utiliser pour traiter un gaspillage, un délai trop long ou une perte identifiée (par exemple par le TRS) et pour documenter un standard ; jamais pour promettre un gain non mesuré, imposer un changement de poste, de rythme ou de méthode à des personnes sans décision humaine, ni négliger la sécurité du poste."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "production"
---

# Amélioration continue (lean)

## Quand l'utiliser

- Une perte est identifiée (arrêts, réglages longs, rebuts, stock en attente, délai de traitement) et il faut la réduire durablement.
- Un poste est désordonné, des outils se cherchent, le même problème revient : 5S.
- Un flux entre la commande et la livraison est long et l'on ne sait pas où le temps se perd : cartographie de la chaîne de valeur.
- Une bonne pratique d'un opérateur doit devenir le standard de tous, ou un standard existant ne tient plus.

## Objectif

Une amélioration traitée comme une expérience : problème mesuré, cause confirmée sur le terrain, changement testé à petite échelle, résultat mesuré, puis standard mis à jour si le test a réussi. Le gain annoncé est une fourchette prudente, étiquetée hypothèse jusqu'à mesure.

## Prérequis

- Un problème décrit avec un chiffre de départ (temps, quantité, taux) et sa source, tiré par exemple d'une fiche de TRS (`indicateurs-trs`).
- Un responsable humain de l'amélioration et l'accord du chef d'atelier ou du responsable du poste.
- L'accès aux faits de terrain : observation, relevés, gamme actuelle. La compétence ne les invente pas.
- Pour tout changement de poste, de méthode, d'outil ou de rythme : l'avis du conseiller en prévention quand la sécurité peut être touchée, et l'accord humain de la direction.

## Entrées

- `probleme` : énoncé factuel, chiffre de départ, période, lieu.
- `donnees` : relevés, temps de cycle, délais, stocks en cours, causes d'arrêt.
- `contraintes` : sécurité, qualité, personnel disponible, budget accordé par la direction (jamais de dépense engagée par l'agent).

## Étapes

1. **Plan (cadrer)** : énoncer le problème en une phrase chiffrée, fixer l'objectif mesurable et la date de mesure. Séparer le fait de l'hypothèse. Aller voir le poste avant de conclure.
2. **Cartographier la chaîne de valeur actuelle** si le problème est un flux : pour chaque étape, temps de traitement, temps d'attente, stock entre les étapes, taux de bon du premier coup ; flux de matière et flux d'information (qui déclenche quoi). Part de temps à valeur ajoutée = temps de valeur ajoutée / délai total, calcul visible.
3. **Chercher la cause** : par les cinq pourquoi, appuyés sur l'observation ou un relevé, jusqu'à une cause qui se vérifie. Une cause non confirmée reste « hypothèse ». Utiliser `non-conformite-action-corrective` si le problème est une non-conformité de qualité.
4. **5S sur le poste concerné** : trier (retirer ce qui ne sert pas), ranger (une place pour chaque chose, repérée), nettoyer (nettoyer, c'est inspecter), standardiser (règles visibles, photos de référence), maintenir (audit court et régulier). Chaque étape a un avant et un après daté. Les 5S ne remplacent pas l'analyse des risques du poste.
5. **Do (essayer)** : un seul changement à la fois, sur un périmètre limité, avec une durée d'essai fixée et un critère d'arrêt. Le changement qui touche des personnes (poste, horaire, rythme) est une décision humaine, avec consultation de ceux qui travaillent au poste.
6. **Check (mesurer)** : même indicateur, même méthode que le chiffre de départ, période comparable. Écrire l'écart et ce qui pourrait l'expliquer autrement (commande atypique, personne absente).
7. **Act (standardiser ou recommencer)** : si le résultat est confirmé, mettre à jour le standard de travail (séquence des tâches, temps cible, points de qualité et de sécurité, ce qu'il faut faire en cas d'anomalie), le faire valider par l'opérateur et le chef d'atelier, l'afficher au poste et former. Sinon, retourner au plan avec ce qui a été appris.
8. **Cartographier l'état cible** si le flux a changé, avec les actions suivantes classées par gain attendu et effort.
9. **Suivre la tenue** : un audit à 2 semaines, un à 3 mois. Un gain qui s'effrite sans standard visible se signale tout de suite.

## Livrable

Une fiche d'amélioration : problème chiffré, cartographie actuelle et cible si utile, cause et preuve, changement testé, résultat mesuré, standard mis à jour (texte proposé, à valider), plan de suivi, gain estimé en fourchette et sa part mesurée. Les décisions humaines demandées sont posées en cartes.

## Critères de réussite

- Le chiffre de départ et le chiffre d'arrivée sont mesurés avec la même méthode.
- Un seul changement par essai ; la cause attribuée a été confirmée sur le terrain.
- Le standard proposé est lisible au poste, validé par ceux qui l'appliquent, et mentionne les points de sécurité.
- Le gain est donné en fourchette, avec ce qui est mesuré et ce qui reste hypothèse.
- Aucune personne n'est désignée comme cause d'un problème dans la fiche.

## Sources officielles

Consultées le 16/10/2026. Ce sont des pages d'un organisme de référence du lean (secondaire pour ce service, non officiel au sens juridique), plus une page officielle belge pour la sécurité :

- « Plan, Do, Check, Act (PDCA) - A Resource Guide », Lean Enterprise Institute, https://www.lean.org/lexicon-terms/pdca/ : cycle d'amélioration inspiré de la méthode scientifique ; Plan (objectifs et changements), Do (mise en oeuvre), Check (évaluation des résultats), Act (standardiser ou recommencer) ; fondement du kaizen.
- « Kaizen - A Resource Guide », Lean Enterprise Institute, https://www.lean.org/lexicon-terms/kaizen/ : amélioration continue par petites étapes, impliquant tous les membres de l'organisation.
- « Value Stream Mapping », Lean Enterprise Institute, https://www.lean.org/lexicon-terms/value-stream-mapping/ : représenter chaque étape des flux de matière et d'information de la commande à la livraison, avec une carte de l'état actuel et une carte de l'état cible.
- « Standardized Work », Lean Enterprise Institute, https://www.lean.org/lexicon-terms/standardized-work/ : travail standardisé fondé sur le takt time, la séquence de travail précise et le stock standard en cours ; affiché aux postes et objet d'amélioration par le kaizen.
- « Bien-être au travail », SPF Emploi, Travail et Concertation sociale, https://emploi.belgique.be/fr/themes/bien-etre-au-travail : Code du bien-être au travail, rôle du conseiller en prévention.

Non obtenu pour les 5S : la page du Lean Enterprise Institute (404) et celle de l'ASQ (403) n'ont pas pu être ouvertes. La description des cinq étapes ci-dessus est donc une convention courante de la pratique lean, sans source ouverte citée. Les règles de calcul (part de valeur ajoutée, fourchette de gain) sont des conventions de gestion.

## À vérifier par un professionnel

Tout changement de poste, d'outil, de posture, de cadence ou de produit utilisé est à faire relire par le conseiller en prévention (analyse des risques du Code du bien-être au travail) avant essai. Toute modification d'horaire ou d'organisation du travail des personnes passe par la direction et, selon l'entreprise, le secrétariat social et les représentants des travailleurs.

## Limites

- La compétence propose et documente ; elle ne modifie aucun poste, ne forme personne et ne dépense rien.
- Un chiffre de gain sans mesure avant et après n'est pas un résultat.
- La cartographie de la chaîne de valeur décrit un flux de produit ; pour plusieurs produits très différents, en choisir une famille et le dire.
- Une amélioration imposée sans les opérateurs ne tient pas : l'adhésion se prépare, la compétence ne la décrète pas.

## Exemple

Poste d'emballage : le réglage entre deux formats prend 25 minutes en moyenne (relevé de 8 changements sur 2 semaines, source : feuille de poste de l'atelier). Objectif : 15 minutes, mesuré sur 8 changements. Observation : 9 minutes passées à chercher les outils et les cales. Essai de 2 semaines : un chariot d'outils repéré, une photo de référence et une séquence de réglage écrite par l'opérateur le plus expérimenté. Un seul changement par essai. Mesure : 8 changements, moyenne 17 minutes, soit 8 minutes gagnées par réglage (hypothèse de gain annuel : à calculer avec le nombre réel de réglages, non encore connu). Standard mis à jour et proposé pour validation par le chef d'atelier ; audit à 2 semaines et à 3 mois.

Cas d'échec : l'équipe annonce 40 % de gain après un essai, mais deux changements sur trois ont concerné un seul format, plus simple. La fiche n'annonce pas de gain : elle écrit « essai non comparable au chiffre de départ », propose un nouvel essai sur la même famille de formats et demande à l'atelier de confirmer le périmètre.

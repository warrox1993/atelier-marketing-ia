---
name: "preuves-cliniques"
description: "Évalue les preuves cliniques qui soutiennent un complément alimentaire ou un ingrédient breveté : ingrédient exact et dose exacte de l'essai, hiérarchie des preuves, indépendance du financement, allégations autorisées dans l'Union européenne, avec identifiant PMID ou DOI pour chaque étude citée. À utiliser pour vérifier qu'une promesse du fabricant repose sur une étude humaine portant sur CE produit à CETTE dose ; jamais pour citer une étude de mémoire, accepter une marque déposée comme preuve ou présenter un effet comme établi sans l'avoir lu."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "complements"
---

# Évaluation des preuves cliniques d'un complément

## Quand l'utiliser

- Une marque promet un effet (articulations, sommeil, énergie...) et il faut savoir si une étude le soutient.
- Un ingrédient breveté (UC-II, Verisol, Fortigel, Creapure, KSM-66...) est mis en avant comme preuve.
- Le contrôleur revérifie les preuves citées par l'analyste avant qu'une conclusion ne parte.

## Objectif

Pour chaque promesse, un jugement en quatre états : soutenue (essai humain sur le même ingrédient et la même dose, résultat cité avec son identifiant), partiellement soutenue (autre dose ou autre forme), non soutenue (aucune étude humaine ou seulement animale et in vitro), ou contraire. Chaque étude est identifiée par PMID ou DOI et lue au moins dans son résumé.

## Prérequis

- La promesse exacte du produit, recopiée telle qu'elle est écrite.
- L'ingrédient exact (forme, marque, fabricant) et la dose journalière du produit.
- L'accès à PubMed (résumés par identifiant), à la liste des allégations de l'Union et, si possible, à Cochrane et à Examine.

## Entrées

- `promesse` : texte de la promesse.
- `ingredient` : forme et marque, avec dose par jour.
- `etudes` : références déjà citées par le vendeur ou l'analyste (PMID, DOI).

## Étapes

1. **Identifier l'ingrédient exact.** Un ingrédient breveté se reconnaît à une marque déposée avec un fabricant identifiable. La marque seule ne prouve rien : l'étude doit porter sur CET ingrédient, pas sur la molécule générique.
2. **Comparer les doses.** La dose du produit atteint-elle la dose de l'essai ? Exemple : UC-II à 40 mg/j sur 180 jours (PMID 26822714) ; un produit à 10 mg ne peut pas revendiquer ce résultat. Deux formes d'une même catégorie ne se comparent pas sur les grammes (collagène hydrolysé à 10 g/j, PMID 18416885, et UC-II à 40 mg/j agissent par des mécanismes différents).
3. **Classer par niveau de preuve.** Méta-analyse ou revue Cochrane, puis essai randomisé en double aveugle contre placebo, puis essai ouvert, puis étude animale ou in vitro (cette dernière ne compte pas pour la promesse). Noter la taille de l'échantillon, la durée, le critère mesuré et la population (une étude chez des athlètes ne dit rien sur des personnes âgées).
4. **Relever le financement.** Lire la déclaration de conflits d'intérêts de l'article. Une étude financée par le fabricant reste recevable mais pèse moins ; une étude indépendante pèse plus.
5. **Vérifier l'allégation permise dans l'Union.** Seules les allégations de la liste autorisée sont licites (règlements (CE) 1924/2006 et (UE) 432/2012, texte à relire). Une allégation thérapeutique (« soigne », « répare le cartilage », « anti-arthrose ») est illégale et signale un mauvais produit. Exemples : aucune allégation propre au collagène ; la vitamine C « contribue à la formation normale du collagène » ; une allégation de performance existe pour la créatine à 3 g/j (conditions à relire).
6. **Citer.** Pour chaque étude : PMID ou DOI, première phrase du résumé qui porte le résultat, dose, durée, effectif, financeur. Une étude qui n'a pas été ouverte n'est pas citée comme preuve.
7. **Conclure sans enjoliver.** Écrire « soutenue », « partiellement », « non soutenue » ou « contraire » avec la raison. L'absence d'étude s'écrit « aucune étude humaine trouvée », jamais « sans effet ».

## Livrable

Un tableau par promesse : texte de la promesse, ingrédient et dose du produit, études retenues (PMID ou DOI, design, dose, durée, effectif, financeur), écart de dose, allégation UE autorisée ou non, jugement et raison.

## Critères de réussite

- Chaque preuve citée a un identifiant vérifiable et a été lue au moins dans son résumé.
- L'écart entre la dose de l'étude et celle du produit est chiffré.
- Le financement est relevé pour chaque étude.
- Aucune promesse thérapeutique n'est reprise comme recommandée.

## Sources officielles

- PubMed, https://pubmed.ncbi.nlm.nih.gov/<identifiant> : résumés lisibles et conflits d'intérêts.
- Registre de l'Union des allégations nutritionnelles et de santé, https://food.ec.europa.eu/safety/labelling-and-nutrition/nutrition-and-health-claims_en : allégations autorisées et refusées.
- EFSA, https://www.efsa.europa.eu : avis scientifiques sur les allégations.
- Cochrane, https://www.cochranelibrary.com, et Examine, https://examine.com : synthèses par ingrédient, à lire comme synthèses secondaires.

## À vérifier par un professionnel

Un effet démontré en moyenne chez des volontaires ne dit pas qu'il vaut pour une personne donnée. Interactions, traitement en cours, grossesse, maladie : médecin ou pharmacien.

## Limites

- Un résumé PubMed ne suffit pas pour juger la qualité d'un essai ; le texte complet peut être payant.
- L'absence d'étude indépendante n'est pas la preuve d'une inefficacité.
- Les règlements d'allégations n'ont pas tous pu être relus à la source ; leurs conditions restent à vérifier.
- Cette compétence ne mesure aucun effet et ne remplace pas un avis médical.

## Exemple

Cas illustratif, chiffres d'exemple. Un produit à 5 g d'un hydrolysat de collagène avec marque déposée promet « articulations plus souples ». Le fabricant cite un essai du breveté à 5 g sur 12 semaines, financé par lui. L'analyse écrit : ingrédient identique, dose identique, essai randomisé en double aveugle, financement du fabricant donc pondération à la baisse, allégation « souplesse articulaire » absente de la liste de l'Union : jugement « partiellement soutenue », promesse à reformuler.

Cas d'échec évité : la fiche cite « de nombreuses études cliniques ». Aucune référence n'est donnée ; la compétence écrit « aucune preuve citable » et demande les identifiants plutôt que d'en chercher une qui irait dans le sens du vendeur.

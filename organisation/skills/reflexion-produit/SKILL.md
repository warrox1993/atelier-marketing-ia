---
name: "reflexion-produit"
description: "Anime une séance de réflexion sur un produit, un service ou un procédé d'une PME, en partenaire exigeant plutôt qu'en générateur de listes : mode choisi (explorer le problème, imaginer des solutions, éprouver les hypothèses, explorer la stratégie), séance en cinq temps (cadrer, diverger, provoquer, converger, consigner), techniques employées à bon escient (« comment pourrions-nous », tâche à accomplir, arbre opportunités et solutions, premiers principes, SCAMPER, inversion), hypothèse la plus risquée et moyen le moins cher de la tester, pièges nommés. À utiliser avant de rédiger une fiche d'idée, un cahier des charges ou un dossier de subside ; jamais pour décider à la place de l'humain ni pour présenter une idée comme validée sans preuve."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "recherche-innovation"
---

# Réflexion produit : séance d'exploration

## Quand l'utiliser

- Une piste d'innovation (nouveau service, amélioration d'un produit, procédé) doit être explorée avant d'être triée
  par `selection-projets-innovation`.
- Une équipe tourne en rond sur un problème ou s'est arrêtée trop tôt sur la première idée.
- Une idée doit être éprouvée avant d'y consacrer du temps ou un dossier de subside.

## Objectif

Aider l'équipe à atteindre des idées qu'elle n'aurait pas eues seule, puis à converger sur deux ou trois pistes dont
l'inconnue principale et le test le moins cher sont nommés. La séance produit des options ; la décision vient après,
avec des données.

## Prérequis

- Le sujet, ce qui déclenche la séance et ce qui est déjà connu (recherches, retours clients, données).
- Les contraintes : délai, budget, technique, équipe.
- Les preuves disponibles sur les clients (entretiens, `synthese-voix-client`, `analyse-jobs-a-faire`).

## Entrées

- `sujet` : problème, opportunité ou question stratégique.
- `mode` : exploration du problème, idéation, test des hypothèses, stratégie (déduit de la demande, changeable en
  cours de séance).
- `connu` : preuves et données déjà rassemblées.

## Étapes

1. **Cadrer** : qu'explore-t-on, pourquoi maintenant, que sait-on déjà, quelles contraintes, à quoi ressemblerait une
   bonne fin de séance. Un cadrage pauvre produit des idées sans lien avec un vrai besoin.
2. **Choisir le mode** et s'y tenir :
   - *problème* : qui a ce problème, que fait-il aujourd'hui, symptôme ou cause (demander « pourquoi » jusqu'à une
     cause structurelle), variation selon les segments, que se passe-t-il si on ne fait rien ;
   - *idéation* : au moins cinq à sept approches distinctes avant d'en juger une, variées en ampleur, en nature
     (produit, procédé, règle) et en horizon, dont une qui fait l'inverse et une qui retire quelque chose ;
   - *hypothèses* : lister toutes les hypothèses (client, problème, solution, économie, faisabilité, adoption), pour
     chacune le degré de confiance, la preuve et ce qui la contredirait ; désigner la plus risquée et le test le moins
     cher ;
   - *stratégie* : les coups possibles et pas seulement l'évident, les paris et leurs effets de second ordre, la
     réaction des concurrents, l'horizon de trois mois, un an, trois ans.
3. **Diverger** avec une technique quand elle aide, jamais toutes : « comment pourrions-nous [résultat] pour [qui] sans
   [contrainte] ? » à la bonne échelle ; tâche à accomplir (« quand [situation], je veux [motivation] pour [résultat] ») ;
   arbre résultat, opportunités, solutions, tests (chaque opportunité vient d'une preuve) ; premiers principes ;
   SCAMPER (substituer, combiner, adapter, modifier, détourner, éliminer, inverser) ; inversion (« comment
   aggraver le problème ? » puis retourner chaque idée).
4. **Provoquer** : argument le plus fort contre l'idée, qui la détesterait et pourquoi, ce qu'on ne voit pas, version
   dix fois plus ambitieuse. Prendre position (« l'approche B est plus solide parce que… ») plutôt qu'aligner des pour
   et des contre.
5. **Converger** : regrouper en thèmes, juger sur l'effet pour le client, la faisabilité, l'adéquation à la stratégie
   et la force des preuves, retenir deux ou trois pistes, nommer pour chacune l'inconnue principale et le moyen le
   moins cher de la lever.
6. **Nommer les pièges** quand ils apparaissent : solution avant le cadrage, copie d'une fonction concurrente sans
   besoin identifié, contraintes posées trop tôt, séance à une seule idée, analyse sans fin, question qui demande des
   données et non de la réflexion (arrêter et dire quelle recherche faire).
7. **Consigner** : pistes retenues et pourquoi, hypothèses à tester, questions à documenter, prochaines étapes
   (recherche, prototype, entretiens, fiche d'idée), idées mises de côté pour plus tard.

## Livrable

Note de séance : cadrage, mode, idées produites, pistes retenues avec leur inconnue et leur test, hypothèses classées
par risque, pièges relevés, prochaines étapes, idées mises de côté. Les pistes retenues peuvent devenir des fiches
d'idée pour `selection-projets-innovation`.

## Critères de réussite

- Au moins cinq approches distinctes avant toute évaluation en mode idéation.
- Chaque piste retenue nomme son hypothèse la plus risquée et un test proportionné.
- Les faits cités ont une source ; une intuition est présentée comme telle.
- Aucune décision de lancement, de financement ou d'arrêt prise par l'agent.

## Limites

- La séance ne remplace ni les entretiens avec les clients ni les données : quand la question demande des faits, la
  compétence le dit et s'arrête.
- Le tri, la note de priorité et la preuve de concept relèvent de `selection-projets-innovation`.
- Une idée brevetable passe par `veille-brevets-anteriorite` avant toute diffusion.

## Exemple

Cas nominal : un fabricant de châssis veut réduire les retours de chantier. Mode problème : les retours viennent de
mesures mal prises (cause), pas de la production (symptôme). Idéation : sept approches, dont une qui supprime la
prise de mesures par le client et une qui inverse l'ordre (pose d'un gabarit avant fabrication). Pistes retenues :
gabarit de chantier, fiche de mesure illustrée. Hypothèse la plus risquée : les poseurs utiliseront le gabarit ; test :
dix chantiers pilotes.

Cas d'échec évité : l'équipe voulait « faire comme le concurrent qui a lancé une application ». La séance nomme le
piège et revient au besoin : aucun client n'a demandé d'application.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins,
`product-management/skills/product-brainstorming/SKILL.md` (quatre modes, techniques d'idéation, catégories
d'hypothèses, cadres « comment pourrions-nous », tâche à accomplir, arbre opportunités et solutions, premiers
principes, SCAMPER, inversion ; séance en cinq temps ; conduite du partenaire de réflexion ; pièges fréquents),
commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : réécriture en français, cadre
d'une PME (produit, service ou procédé), boucle OODA non reprise, renvois au tri, à la voix du client et à la veille
brevets de l'usine, aucune décision par l'agent. Texte de la licence et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
